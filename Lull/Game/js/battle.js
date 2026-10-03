// Lull — Battle, a board mode (js/recipe.js): two boards face each other, yours and the opponent's, each played as a
// plain board (rows clear). Every row you clear gives you a charge (six at most); a charge throws the piece in play
// onto the opponent's board instead of yours, where you aim it: it drops from their top and rests on their stack,
// exactly where the shadow showed, and its cells are theirs from then on (a row it completes clears for them). A board
// whose next piece cannot come in is out: the round is the other's. After three minutes both ceilings come down a row
// every 20 s. Pure rules, the AI and the match (no DOM); the controller, the view and the window are js/battleview.js.
//
//   recipe.battle = { level: 'easy' | 'steady' | 'brisk' | 'swift' }
//   save x.battle = { v: 1, side: { charges, ceil, … }, match?: { level, round, tally, streak, since, ai: Game JSON, … } }
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL, Pieces, RNG, Versus: V } = L;
  if (!Recipe || !V) return;
  // (Shared with Race: js/versus.js.)
  const { IDS, NAMES, popcount, rowsOf, shapeOf, fitMap, searchG, pathTo, play, gauss, placed, fitAt, spawnOf, slice, runAll, tallyOf, tallyText } = V;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  /**
   * The opponent's levels. pace: seconds a piece (±30%), path replay included; sigma: noise on its judgement; look: how
   * many of its best it weighs against the next piece (0 none); aim: where it throws ('random', 'high': onto the
   * highest column, 'harm': into wells and T-slots, where it hurts most); when: when it throws ('chance': now and then,
   * 'two': with two charges, 'bad': with a piece bad for its own board or three charges, 'timed': once you are near the
   * top, or its charges are full); sps: moves a second when it plays its path; D: the pay factor.
   */
  const LEVELS = Object.freeze({
    easy: Object.freeze({ pace: 4.5, sigma: 9, look: 0, aim: 'random', when: 'chance', sps: 8, D: 0.4 }),
    steady: Object.freeze({ pace: 3.2, sigma: 4, look: 0, aim: 'high', when: 'two', sps: 10, D: 0.55 }),
    brisk: Object.freeze({ pace: 2.3, sigma: 1, look: 5, aim: 'harm', when: 'bad', sps: 12, D: 0.7 }),
    swift: Object.freeze({ pace: 1.6, sigma: 0, look: 8, aim: 'harm', when: 'timed', sps: 14, D: 0.85 }),
  });
  /** Sizes: width 6–12, height 10–16. */
  const LIMITS = Object.freeze({ w: Object.freeze([6, 12]), h: Object.freeze([10, 16]) });
  const SIZE = Object.freeze({ w: 10, h: 14 });
  const PRESETS = Object.freeze([['Quick', 8, 12], ['Standard', 10, 14], ['Long', 10, 16]]);
  /** The most charges held; Easy's chance to throw a piece while it holds one. */
  const MAX_CHARGES = 6, EASY_CHANCE = 0.3;
  /** Sudden death: from 3 minutes into a round, a ceiling row every 20 s. A throw's time (sim). */
  const SUDDEN_MS = 180000, CEIL_MS = 20000, THROW_TIME = 0.5;
  /** A ceiling cell: stone (never yours, never cleared). */
  const STONE = CELL.FOREIGN | CELL.FILL | 8;
  /** The opponent's board cost weights: height, holes, the cells over them, bumps, rows cleared, the danger near the top. */
  const W_AGG = 5, W_HOLE = 30, W_OVER = 2, W_BUMP = 2.2, W_LINE = 8, W_DANGER = 40, W_WELL = 1.5;

  const on = (r) => !!r && r.mode === 'battle';

  // ---- a board in Battle ----------------------------------------------------------------------------------------------

  /** A game's Battle extension (null on another board). */
  function extOf(game) { return game && Array.isArray(game.ext) ? game.ext.find((e) => e.key === 'battle') || null : null; }
  /** { game, S, ver } for a game in Battle. */
  function side(game) { const e = extOf(game); return e ? e.side : null; }
  /** The rows under the ceiling. */
  function top(game) { const sd = side(game); return game.h - (sd ? sd.S.ceil : 0); }
  /** The rows sudden death has closed at ms into a round. */
  function ceilAt(ms) { return ms < SUDDEN_MS ? 0 : 1 + Math.floor((ms - SUDDEN_MS) / CEIL_MS); }
  /** ms until the next ceiling row comes down. */
  function nextCeilIn(ms) { return ms < SUDDEN_MS ? SUDDEN_MS - ms : CEIL_MS - ((ms - SUDDEN_MS) % CEIL_MS); }
  /** The cells of a game's board (under its ceiling) that are filled. */
  function cellsIn(game) { const t = top(game), W = game.w, c = game.board.cells; let n = 0; for (let i = 0; i < W * t; i++) if (c[i]) n++; return n; }
  /** The height of the stack under the ceiling (rows to its highest cell). */
  function heightOf(game) {
    const t = top(game), W = game.w, c = game.board.cells;
    for (let y = t - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (c[y * W + x]) return y + 1;
    return 0;
  }

  const freshSide = () => ({ charges: 0, ceil: 0, lines: 0, pieces: 0, throws: 0, got: 0, backfire: 0, gave: 0 });
  const SIDE_KEYS = ['charges', 'ceil', 'lines', 'pieces', 'throws', 'got', 'backfire', 'gave'];
  function validSide(x) { return isObj(x) && SIDE_KEYS.every((k) => Number.isFinite(x[k]) && x[k] >= 0); }

  /** A side's lock (res: the lock's result): its pieces, its rows cleared and the charges they give (MAX_CHARGES at most). */
  function afterLock(me, res) {
    const S = me.S, n = res && res.lines ? res.lines : 0;
    S.pieces++;
    S.lines += n;
    S.charges = Math.min(MAX_CHARGES, S.charges + n);
    me.ver++;
    return { lines: n, out: !!me.game.over };
  }

  /**
   * Where a piece thrown at a board lands, aimed in turn rot with its box at column x: dropped straight down from the top
   * row under the ceiling to rest on the stack (the piece in play there is not in its way). { rot, x, y, cells } or null
   * when it does not fit at the top there.
   */
  function landing(game, type, rot, x) {
    const cells = type.rots[rot], b = game.board, t = top(game), y0 = t - 1 - type.rotBounds[rot].maxY;
    if (!fitsUnder(b, cells, x, y0, t)) return null;
    let y = y0;
    while (fitsUnder(b, cells, x, y - 1, t)) y--;
    return { rot, x, y, cells: cells.map(([cx, cy]) => [x + cx, y + cy]) };
  }
  function fitsUnder(b, cells, x, y, t) {
    for (const [cx, cy] of cells) { const yy = y + cy; if (yy >= t) return false; }
    return b.fits(cells, x, y);
  }
  /** The columns a turn's box can be at (the piece inside the walls): [lo, hi]. */
  function xRange(game, type, rot) { const b = type.rotBounds[rot]; return [-b.minX, game.w - 1 - b.maxX]; }
  /** Every distinct aim of a type at a board: [{ rot, x }] (a turn that looks like another once). */
  function aims(game, type) {
    const sh = shapeOf(type), out = [];
    for (const r of sh.distinct) { const [lo, hi] = xRange(game, type, r); for (let x = lo; x <= hi; x++) out.push({ rot: r, x }); }
    return out;
  }

  /**
   * Throws the piece in play of side me at side foe, aimed { rot, x } (in foe's board): a charge is spent, me's next
   * piece comes in, and the piece lands on foe's board as if foe had set it there (its rows that fill clear, and give foe
   * charges: a backfire). A piece in play there that the landing covers comes in again where pieces appear; when it
   * cannot, foe is out. Returns { land, res, id } or null (no charge, no piece, no room there, or no room for me's next).
   */
  function throwAt(me, foe, aim) {
    const g = me.game, fg = foe.game, p = g.piece;
    if (me.S.charges < 1 || !p || g.over || fg.over || !aim) return null;
    const type = p.type, land = landing(fg, type, ((aim.rot % 4) + 4) % 4, aim.x);
    if (!land) return null;
    const e = g.takeCurrent();
    if (!e) return null;
    me.S.charges--; me.S.throws++;
    fg.board.placeCells(land.cells, type.color);
    const res = { rows: [], removed: [], lines: 0, cells: land.cells, thrown: true };
    fg.clearInto(fg.board, fg.fullRows(), res);
    const n = res.lines;
    if (n) { foe.S.lines += n; foe.S.backfire += n; foe.S.charges = Math.min(MAX_CHARGES, foe.S.charges + n); me.S.gave += n; }
    foe.S.got++;
    const fp = fg.piece;
    if (fp && !fg.fitsAt(fp, fp.rot, fp.x, fp.y)) fg.spawn(fp.entry);
    me.ver++; foe.ver++;
    return { land, res, id: type.id };
  }

  /**
   * The ceiling comes down to n rows closed: each new row turns to stone (what was there is crushed). A piece in play it
   * reaches moves down a row or two if it can, or comes in again where pieces appear; when it cannot, the side is out.
   * Returns true when the side is out.
   */
  function lowerTo(sd, n) {
    const g = sd.game, W = g.w;
    n = Math.min(n, g.h - 1);
    if (n <= sd.S.ceil) return !!g.over;
    while (sd.S.ceil < n) {
      sd.S.ceil++;
      const y = g.h - sd.S.ceil;
      for (let x = 0; x < W; x++) g.board.set(x, y, STONE);
    }
    sd.ver++;
    const p = g.piece;
    if (p && !g.over && !g.fitsAt(p, p.rot, p.x, p.y)) {
      let moved = false;
      for (let d = 1; d <= 2 && !moved; d++) if (g.fitsAt(p, p.rot, p.x, p.y - d)) { p.y -= d; moved = true; }
      if (!moved) g.spawn(p.entry);
    }
    return !!g.over;
  }

  /**
   * What a round pays a side: a row cleared is worth what a Standard row is (w/10 · f), at most a Standard piece's worth for
   * each piece it set (E/10 · f: thrown and backfired rows never pay more), times the opponent's D, half for a loss.
   */
  function pay(sd, level, won) {
    const g = sd.game, lv = LEVELS[level] || LEVELS.steady, R = g.rules || { f: 1, E: 4 }, f = R.f != null ? R.f : 1, E = R.E || 4;
    const rows = sd.S.lines * (g.w / 10), cap = sd.S.pieces * (E / 10);
    return Math.min(rows, cap) * f * lv.D * (won ? 1 : 0.5);
  }

  // ---- the AI ---------------------------------------------------------------------------------------------------------------

  let HS = new Int32Array(16);
  /**
   * A board's cost (lower is better): rows (bits), t rows under the ceiling, lines it just cleared. Height, holes (empty
   * cells with a block over them), the blocks over holes, bumps, a deep well beyond one, and the danger of a stack near
   * the top (where pieces come in).
   */
  function costOf(rows, W, t, lines) {
    if (HS.length < W) HS = new Int32Array(W);
    let agg = 0, holes = 0, over = 0, maxH = 0;
    for (let x = 0; x < W; x++) {
      let hgt = 0;
      for (let y = t - 1; y >= 0; y--) if ((rows[y] >>> x) & 1) { hgt = y + 1; break; }
      HS[x] = hgt; agg += hgt; if (hgt > maxH) maxH = hgt;
      let seen = 0;
      for (let y = hgt - 1; y >= 0; y--) { if ((rows[y] >>> x) & 1) seen++; else { holes++; over += seen; } }
    }
    let bump = 0, wells = 0;
    for (let x = 0; x < W; x++) {
      if (x) bump += Math.abs(HS[x] - HS[x - 1]);
      const l = x > 0 ? HS[x - 1] : t, r = x < W - 1 ? HS[x + 1] : t, d = Math.min(l, r) - HS[x];
      if (d >= 3) wells += d - 2;
    }
    const safe = t - 5;
    return agg * W_AGG + holes * W_HOLE + over * W_OVER + bump * W_BUMP + wells * W_WELL - (lines || 0) * W_LINE + (maxH > safe ? (maxH - safe) * (maxH - safe) * W_DANGER : 0);
  }
  /** Rows (bits) with the full rows under the ceiling cleared, into out: the number cleared. */
  function clearBits(rows, W, t, H, out) {
    const full = (1 << W) - 1;
    let d = 0;
    for (let y = 0; y < t; y++) { if (rows[y] === full) continue; out[d++] = rows[y]; }
    const n = t - d;
    for (let y = d; y < t; y++) out[y] = 0;
    for (let y = t; y < H; y++) out[y] = rows[y];
    return n;
  }

  /**
   * Every placement of a piece from a spot on its own board, scored (a generator). Returns [{ rot, x, y, px, py, cost, t }],
   * best first.
   */
  function* evaluate(game, type, start, base, rng, sigma) {
    const W = game.w, H = game.h, t = top(game);
    const s = yield* searchG(game, type, start, base);
    yield;
    const spots = s.restIn(t), tmp = new Int32Array(H), cl = new Int32Array(H), out = [];
    for (let k = 0; k < spots.length; k++) {
      const sp = spots[k], sh = s.sh[sp.rot];
      if (sp.py + sh.bh > t) continue;
      sp.t = sh; sp.type = type;
      const n = clearBits(placed(base, sh, sp.px, sp.py, tmp), W, t, H, cl);
      sp.lines = n;
      sp.cost = costOf(cl, W, t, n) + (sigma && rng ? gauss(rng) * sigma : 0);
      out.push(sp);
      if (k & 1) yield;
    }
    out.sort((a, b) => a.cost - b.cost);
    return out;
  }
  /** The best placement's cost for a type from where it would appear (Infinity when it has none). */
  function* bestFor(game, type, base) {
    const st = spawnOf(game, type), s = shapeOf(type)[st.rot];
    if (!fitAt(base, game.w, game.h, s, st.x + s.minX, st.y + s.minY)) return Infinity;
    const list = yield* evaluate(game, type, st, base, null, 0);
    return list.length ? list[0].cost : Infinity;
  }

  /**
   * Where to throw a type at foe's board, by a level's aim: 'random' (any aim that lands), 'high' (onto the highest column,
   * the landing that ends highest), 'harm' (where their board is worst after it: into wells and T-slots, with a landing
   * that leaves no room for their next piece best of all). A landing that would clear a row for them is avoided. Returns
   * { rot, x, harm } or null.
   */
  function* aimFor(fg, type, how, rng) {
    const W = fg.w, H = fg.h, t = top(fg), base = rowsOf(fg.board.cells, W, H), tmp = new Int32Array(H), cl = new Int32Array(H);
    const before = costOf(base, W, t, 0), list = [];
    for (const a of aims(fg, type)) {
      const land = landing(fg, type, a.rot, a.x);
      if (!land) continue;
      tmp.set(base);
      for (const [x, y] of land.cells) tmp[y] |= 1 << x;
      const n = clearBits(tmp, W, t, H, cl);
      let hi = 0;
      for (const [, y] of land.cells) hi = Math.max(hi, y);
      let harm = costOf(cl, W, t, 0) - before - n * 200;
      if (how === 'harm') {
        // No room for the piece they are about to play: the round.
        const fp = fg.piece;
        if (fp && !n) {
          const at = spawnOf(fg, fp.type), sh = shapeOf(fp.type)[at.rot];
          if (!fitAt(cl, W, H, sh, at.x + sh.minX, at.y + sh.minY)) harm += 2000;
        }
      }
      list.push({ rot: a.rot, x: a.x, harm, hi, n });
      yield;
    }
    if (!list.length) return null;
    const clean = list.filter((a) => !a.n);
    const pool = clean.length ? clean : list;
    if (how === 'random') return pool[rng ? rng.int(pool.length) : 0];
    if (how === 'high') return pool.slice().sort((a, b) => b.hi - a.hi || b.harm - a.harm)[0];
    return pool.slice().sort((a, b) => b.harm - a.harm)[0];
  }

  /**
   * One decision for a side (a generator, run in slices live and all at once in a simulation): 'throw' (the piece in play,
   * aimed { rot, x } at foe's board), 'place' (hold first or not, then a target spot { rot, x, y }), or 'stuck'.
   * me: { game, S, lvl, rng }; foe: the other side. o.noThrow: placing only.
   */
  function* think(me, foe, o) {
    o = o || {};
    const g = me.game, lv = me.lvl, W = g.w, H = g.h, p = g.piece;
    if (!p || g.over) return { kind: 'none' };
    const rng = me.rng, base = rowsOf(g.board.cells, W, H);
    let list = yield* evaluate(g, p.type, { rot: p.rot, x: p.x, y: p.y }, base, rng, lv.sigma);
    // Lookahead: the best few weighed with the next piece's best after them.
    const nextE = g.queue[0], nextT = nextE && Pieces.get(nextE.id);
    if (lv.look && nextT && list.length) {
      const top0 = list.slice(0, lv.look), t = top(g), cl = new Int32Array(H);
      for (const sp of top0) {
        const after = placed(base, sp.t, sp.px, sp.py, new Int32Array(H));
        clearBits(after, W, t, H, cl);
        const b2 = yield* bestFor(g, nextT, cl.slice());
        sp.cost2 = sp.cost * 0.5 + (Number.isFinite(b2) ? b2 : 5000) * 0.5;
      }
      top0.sort((a, b) => a.cost2 - b.cost2);
      list = top0.concat(list.slice(lv.look));
    }
    // Hold: the held piece (or the next one) where it would appear.
    let alt = null;
    if (!g.mods.noHold && (g.freeHold || !g.holdLocked)) {
      const altE = g.hold || g.queue[0], altT = altE && Pieces.get(altE.id);
      if (altT && altT !== p.type) {
        const st = spawnOf(g, altT), s = shapeOf(altT)[st.rot];
        if (fitAt(base, W, H, s, st.x + s.minX, st.y + s.minY)) alt = yield* evaluate(g, altT, st, base, rng, lv.sigma);
      }
    }
    const best = list[0] || null, altBest = alt && alt[0] ? alt[0] : null;
    const val = (sp) => (sp ? (sp.cost2 != null ? sp.cost2 : sp.cost) : Infinity);
    // A throw: when its level says so, aimed as its level aims.
    if (!o.noThrow && me.S.charges > 0 && foe && foe.game.piece && !foe.game.over) {
      const ch = me.S.charges, fg = foe.game, base0 = costOf(base, W, top(g), 0);
      const bad = !best || best.cost - base0 > 60;
      let go = false;
      if (lv.when === 'chance') go = rng ? rng.chance(EASY_CHANCE) : false;
      else if (lv.when === 'two') go = ch >= 2;
      else if (lv.when === 'bad') go = ch >= 3 || (bad && ch >= 1);
      else if (lv.when === 'timed') go = ch >= MAX_CHARGES || heightOf(fg) >= top(fg) - 6 || (bad && ch >= 3);
      if (go) {
        const a = yield* aimFor(fg, p.type, lv.aim, rng);
        if (a) return { kind: 'throw', aim: { rot: a.rot, x: a.x }, type: p.type.id };
      }
    }
    let pick = best, hold = false;
    if (altBest && (!best || val(altBest) < val(best))) { pick = altBest; hold = true; }
    if (!pick) return { kind: 'stuck' };
    return { kind: 'place', hold, target: { rot: pick.rot, x: pick.x, y: pick.y }, type: pick.type.id };
  }

  /** Plays a placing decision on a side at once (a simulation): { res } (the lock's result) or { stuck }. */
  function act(me, d) {
    const g = me.game;
    if (d.kind !== 'place') { const r = g.drop(); return r && typeof r === 'object' ? { res: r } : { stuck: true }; }
    if (d.hold && !g.holdPiece()) return { stuck: true };
    const path = pathTo(g, d.target);
    if (!path) return { stuck: true };
    let res = null;
    for (const m of path) { res = play(g, m); if (res && typeof res === 'object') break; }
    if (!res || typeof res !== 'object') throw new Error('Battle: a path that did not set its piece');
    return { res };
  }

  // ---- a match, simulated (tests and tuning: no clock, each side acts at its own pace) --------------------------------------

  /**
   * A round between two levels (o.levels: two of IDS; o.human: { pace, as } makes side 0 a stand-in player: `as`'s
   * judgement and throwing (Steady by default) at its own pace in seconds a piece), on a board w × h of o.shapes.
   * Returns { winner: 0 | 1, time, sudden, sides: [{ S, pieces, pay }] }.
   */
  function simulate(o) {
    const w = o.w || SIZE.w, hh = o.h || SIZE.h, seed = o.seed || 1;
    const recipe = Recipe.normalize({ mode: 'battle', battle: { level: 'steady' }, shapes: o.shapes || { preset: 'normal' } });
    const mk = (i, level) => {
      const game = new L.Game({ w, h: hh, recipe, seed: seed * 2 + i + 1, previewCount: 5, battleAI: true });
      const sd = side(game);
      let lvl = LEVELS[level];
      if (i === 0 && o.human) lvl = Object.assign({}, LEVELS[o.human.as || 'steady'], { pace: o.human.pace });
      sd.lvl = lvl; sd.rng = new RNG((seed * 7919 + i * 104729) >>> 0);
      return sd;
    };
    const A = mk(0, o.levels[0]), B = mk(1, o.levels[1]);
    const jitter = (s) => s.lvl.pace * (0.7 + 0.6 * s.rng.next());
    A.t = jitter(A); B.t = jitter(B);
    let ceilT = SUDDEN_MS / 1000, winner = null, time = 0;
    // Both out at once (a ceiling): the higher stack loses; level, the first side wins.
    const decide = (aOut, bOut) => (aOut && bOut ? (cellsIn(A.game) > cellsIn(B.game) ? 1 : 0) : aOut ? 1 : bOut ? 0 : null);
    for (let n = 0; n < (o.maxActs || 6000) && winner == null; n++) {
      const tNext = Math.min(A.t, B.t);
      if (ceilT <= tNext) {
        const k = ceilAt(ceilT * 1000 + 1);
        winner = decide(lowerTo(A, k), lowerTo(B, k));
        time = ceilT; ceilT += CEIL_MS / 1000;
        continue;
      }
      const [me, foe] = A.t <= B.t ? [A, B] : [B, A];
      const d = runAll(think(me, foe, {}));
      if (d.kind === 'throw') {
        const r = throwAt(me, foe, d.aim);
        if (r) { me.t += THROW_TIME; winner = decide(A.game.over, B.game.over); time = me.t; continue; }
      }
      const r = act(me, d.kind === 'throw' ? runAll(think(me, foe, { noThrow: true })) : d);
      if (r.res) afterLock(me, r.res);
      else me.game.over = true;
      winner = decide(A.game.over, B.game.over);
      time = me.t;
      me.t += jitter(me);
    }
    if (winner == null) winner = decide(true, true);
    const out = (sd, i) => ({ S: Object.assign({}, sd.S), pieces: sd.S.pieces, pay: pay(sd, o.levels[1 - i] || 'steady', winner === i) });
    return { winner, time, sudden: time * 1000 >= SUDDEN_MS, sides: [out(A, 0), out(B, 1)] };
  }

  // ---- the engine's extension -------------------------------------------------------------------------------------------------

  /**
   * A Battle board's hooks: a piece that cannot come in near its spot ends the board (no room is searched for), rows under
   * the ceiling clear and the ceiling stays where it is, and pieces come in under it. The side's state is ext.side.S; on
   * the player's board (not o.battleAI) the match too: ext.M, with the opponent's own Game (M.ai).
   */
  function extension(game, saved, o) {
    game.findRoom = false;
    const sv = isObj(saved) ? saved : {};
    const S = Object.assign(freshSide(), validSide(sv.side) ? clone(sv.side) : {});
    const ext = {
      side: { game, S, ver: 0 },
      M: null,
      // The ceiling's stone never clears.
      rows(g, b, rows) { return S.ceil ? rows.filter((y) => y < b.h - S.ceil) : rows; },
      // Rows under the ceiling come down; the ceiling stays.
      clearRows(g, b, rows) {
        if (!S.ceil || !rows.length) return null;
        const W = b.w, t = b.h - S.ceil, c = b.cells, drop = new Set(rows);
        const removed = rows.map((y) => Array.from(c.subarray(y * W, (y + 1) * W)));
        let dst = 0;
        for (let y = 0; y < t; y++) { if (drop.has(y)) continue; if (dst !== y) c.copyWithin(dst * W, y * W, (y + 1) * W); dst++; }
        c.fill(0, dst * W, t * W);
        return removed;
      },
      // Pieces come in under the ceiling.
      spawnAt(g, b, pos, type) {
        if (!S.ceil) return pos;
        const rot = pos.rot != null ? pos.rot : 0, maxY = type.rotBounds[rot].maxY;
        return Object.assign({}, pos, { y: Math.min(pos.y, b.h - S.ceil - 1 - maxY) });
      },
      reset() { S.ceil = 0; },
      save() { const out = { v: 1, side: clone(S) }; if (ext.M) out.match = matchJSON(ext.M); return out; },
      summary() { return ext.M ? summaryOf(ext.M) : null; },
    };
    if (!o.battleAI) ext.M = makeMatch(game, ext, sv.match);
    return ext;
  }

  /** A match on the player's board: the opponent's level and its Game, the round, the tally by level. */
  function makeMatch(game, ext, saved) {
    const sv = isObj(saved) && saved.v === 1 ? saved : {};
    const level = IDS.includes(sv.level) ? sv.level : game.recipe.battle.level;
    const r0 = sv.round;
    const round = isObj(r0) ? { n: Math.max(1, r0.n | 0), ms: Math.max(0, +r0.ms || 0), phase: ['ready', 'play', 'end'].includes(r0.phase) ? r0.phase : 'ready', winner: r0.winner === 'me' || r0.winner === 'ai' ? r0.winner : null, paid: +r0.paid || 0 } : { n: 1, ms: 0, phase: 'ready', winner: null, paid: 0 };
    const M = {
      v: 1, level, round, tally: isObj(sv.tally) ? clone(sv.tally) : {}, streak: Math.max(0, sv.streak | 0), since: Number.isFinite(sv.since) ? sv.since : Date.now(),
      wins: Math.max(0, sv.wins | 0), losses: Math.max(0, sv.losses | 0), earnLines: Math.max(0, +sv.earnLines || 0), ai: null, me: ext.side,
    };
    let ai = null;
    const pl = L.Library && L.Library.playable;
    if (isObj(sv.ai) && (!pl || pl(sv.ai))) { try { ai = new L.Game({ saved: sv.ai, previewCount: 5, battleAI: true }); } catch (e) { ai = null; } }
    if (!ai || ai.w !== game.w || ai.h !== game.h || !side(ai)) ai = new L.Game({ w: game.w, h: game.h, recipe: game.recipe, seed: ((game.seed || Date.now()) ^ 0x5eed1e) >>> 0, previewCount: 5, battleAI: true });
    M.ai = side(ai);
    M.ai.lvl = LEVELS[level];
    M.ai.rng = new RNG((M.since ^ (round.n * 2654435761)) >>> 0);
    return M;
  }
  function matchJSON(M) {
    return { v: 1, level: M.level, round: clone(M.round), tally: clone(M.tally), streak: M.streak, since: M.since, wins: M.wins, losses: M.losses, earnLines: M.earnLines || 0, ai: M.ai.game.toJSON() };
  }
  function summaryOf(M) {
    const t = tallyOf(M, M.level);
    return { level: M.level, won: t[0], lost: t[1], wins: M.wins, losses: M.losses, rounds: M.wins + M.losses };
  }
  /** The match of a game (the player's board), or null. */
  function matchOf(game) { const e = extOf(game); return e ? e.M : null; }

  /**
   * The ceilings at the round's time: both come down together. Returns null, or the side that is out: 'me' or 'ai' (both
   * out at once: the higher stack is; level, the opponent).
   */
  function ceilings(M) {
    const k = ceilAt(M.round.ms);
    if (k <= M.me.S.ceil && k <= M.ai.S.ceil) return null;
    const a = M.me.S.ceil, b = M.ai.S.ceil;
    const meOut = lowerTo(M.me, k), aiOut = lowerTo(M.ai, k);
    if (a === M.me.S.ceil && b === M.ai.S.ceil) return null;
    if (meOut && aiOut) return cellsIn(M.me.game) > cellsIn(M.ai.game) ? 'me' : 'ai';
    return meOut ? 'me' : aiOut ? 'ai' : null;
  }

  /** Both boards start a new round: emptied, charges and ceilings cleared; the queues carry on. */
  function newRound(M) {
    for (const sd of [M.me, M.ai]) {
      const g = sd.game, keep = g.s;
      sd.S.ceil = 0;
      g.resetBoard();
      g.s = keep;
      Object.assign(sd.S, freshSide());
      if (!g.piece) g.spawnNext();
      sd.ver++;
    }
    M.round = { n: M.round.n + 1, ms: 0, phase: 'ready', winner: null, paid: 0 };
    M.ai.lvl = LEVELS[M.level];
    M.ai.rng = new RNG((M.since ^ (M.round.n * 2654435761)) >>> 0);
  }
  /** The round ends: the tally, the streak, and what it pays (pay: the caller banks it). */
  function endRound(M, winner) {
    const won = winner === 'me', t = tallyOf(M, M.level);
    if (won) { t[0]++; M.wins++; M.streak++; } else { t[1]++; M.losses++; M.streak = 0; }
    M.round.phase = 'end';
    M.round.winner = winner;
    M.round.paid = pay(M.me, M.level, won);
    return M.round.paid;
  }

  // ---- the recipe part ------------------------------------------------------------------------------------------------------

  const PART = {
    key: 'battle', order: 55, mode: 'battle', name: 'Battle', owns: ['battle'], options: { 'battle.level': IDS.slice() },
    // Fixed for the board's life: an edit never makes a board Battle or another, and Edit rules is not offered at all.
    editFixed: true,
    noEdit: (r) => (on(r) ? 'A Battle board keeps its rules' : null),
    normalize(raw, out) {
      if (out.mode !== 'battle') return;
      const lv = isObj(raw.battle) && raw.battle.level;
      out.battle = { level: IDS.includes(lv) ? lv : 'steady' };
    },
    label: (r, short) => (on(r) ? (short ? 'Battle' : 'Battle · ' + NAMES[r.battle.level]) : ''),
    // Width 6–12 (and the set's own minimum), height 10–16: two boards share the window.
    limits(r, lim) {
      if (!on(r)) return;
      lim.w = [Math.min(LIMITS.w[1], Math.max(lim.w[0], LIMITS.w[0])), LIMITS.w[1]];
      lim.h = [Math.min(LIMITS.h[1], Math.max(lim.h[0], LIMITS.h[0])), LIMITS.h[1]];
    },
    // A size with no number for a side is 10 × 14.
    clampSize(size, r, lim, asked) {
      if (!on(r)) return size;
      const pick = (v, [lo, hi], d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
      return { w: pick(asked.w, lim.w, SIZE.w), h: pick(asked.h, lim.h, SIZE.h) };
    },
    rules(r, R) {
      if (!on(r)) return;
      for (const id of Object.keys(L.ITEMS || {})) R.refuse[id] = 'Not in Battle';
      R.undo = false;
      R.hints = false;
      R.timed = true;
      R.noFeats = true;
      R.battle = true;
    },
    conflicts(r, out) {
      if (!on(r)) return;
      // Physics bodies have no cells to throw onto (Mirror and the shapes say their own).
      if (!out['mods.physics=true']) out['mods.physics=true'] = 'Not in Battle';
    },
    valid(g, r) {
      if (!on(r)) return true;
      const x = isObj(g.x) ? g.x.battle : undefined;
      return x === undefined || (isObj(x) && x.v === 1 && (x.side === undefined || validSide(x.side)));
    },
    engine(game, saved, o) { return on(game.recipe) ? extension(game, saved, o) : null; },
    controller(play, game) { return game && on(game.recipe) && L.BattleView ? L.BattleView.controller(play, game) : null; },
    summary(x) { return isObj(x) && isObj(x.match) ? summaryOf(Object.assign({ tally: {} }, x.match, { tally: isObj(x.match.tally) ? x.match.tally : {} })) : null; },
    stats: { battle: { rounds: 0, wins: 0, losses: 0, throws: 0, lines: 0, backfires: 0, sudden: 0, bestStreak: 0, paid: 0, byLevel: {} }, timeMs: { battle: 0 }, lines: { battle: 0 } },
  };
  Recipe.part(PART);

  // ---- achievements: wins count against Steady or harder, on boards of 96 cells or more ---------------------------------------

  if (L.Achievements) {
    const counts = (e) => !!e && IDS.indexOf(e.level) >= 1 && e.cells >= 96;
    const win = (e) => !!e && e.won && counts(e);
    L.Achievements.group({
      id: 'battle', name: 'Battle', icon: 'battle', after: 'play',
      note: 'Wins count against Steady or harder, on boards of 96 cells or more.',
      list: [
        { id: 'bt_throw', name: 'Special Delivery', desc: 'Throw a piece onto the other board.', pay: 30, on: 'battle', test: (s, e) => !!e.threw },
        { id: 'bt_win', name: 'Over the Top', desc: 'Win a round.', pay: 40, on: 'battle', test: (s, e) => win(e) },
        { id: 'bt_full', name: 'Full Hand', desc: 'Hold six charges.', pay: 50, on: 'battle', test: (s, e) => e.charges >= MAX_CHARGES },
        { id: 'bt_backfire', name: 'Backfire', desc: 'Clear a row with a piece thrown at you.', pay: 60, on: 'battle', test: (s, e) => e.backfire > 0 },
        { id: 'bt_brisk', name: 'Fair Fight', desc: 'Beat Brisk.', pay: 100, on: 'battle', test: (s, e) => win(e) && IDS.indexOf(e.level) >= 2 },
        { id: 'bt_sudden', name: 'Under the Wire', desc: 'Win after the ceilings start coming down.', pay: 120, on: 'battle', test: (s, e) => win(e) && e.sudden },
        { id: 'bt_three', name: 'Hat Trick', desc: 'Win 3 rounds in a row on one board.', pay: 150, on: 'battle', test: (s, e) => win(e) && e.streak >= 3 },
        { id: 'bt_swift', name: 'Fastest Arm', desc: 'Beat Swift.', pay: 250, tier: 'legend', on: 'battle', test: (s, e) => win(e) && e.level === 'swift' },
      ],
    });
  }

  L.Battle = {
    IDS, NAMES, LEVELS, LIMITS, SIZE, PRESETS, MAX_CHARGES, EASY_CHANCE, SUDDEN_MS, CEIL_MS, THROW_TIME, STONE, on,
    extOf, side, top, ceilAt, nextCeilIn, cellsIn, heightOf, afterLock, landing, xRange, aims, throwAt, lowerTo, pay,
    costOf, evaluate, aimFor, think, act, slice, runAll, pathTo, play, simulate,
    matchOf, ceilings, newRound, endRound, tallyOf, tallyText, summaryOf, PART,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
