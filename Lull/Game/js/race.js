// Lull — Race, a board mode (js/recipe.js): two boards face each other, yours and the opponent's, and the first to
// fill every cell of its board wins the round. No rows clear. Pieces move and turn in a buffer above the board (k rows,
// R.k: 4 for Normal, 3 Tiny, 5 Frantic and Pentominoes); a piece must touch the board to set, and what is left in the
// buffer is trimmed away. Send gives the opponent the piece in play (or the first Next piece) on a cooldown of six
// pieces set; a piece you sent that seals a gap on their board earns you a Gap filler (two at most), which fills your
// own sealed gaps, lowest first. A board that cannot be finished (closed: no empty cell any piece can reach) starts
// over. Pure rules, the AI and the match (no DOM); the controller, the view and the window are js/raceview.js.
//
//   recipe.race = { level: 'easy' | 'steady' | 'brisk' | 'swift' }   (the size's height is the board's rows; the Game is
//                                                                        rows + k tall, the buffer on top)
//   save x.race = { v: 1, side: { charges, cd, … }, match?: { level, round, tally, streak, since, ai: Game JSON, … } }
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL, Pieces, RNG, Board, Versus: V } = L;
  if (!Recipe || !V) return;
  // (Shared with Battle: js/versus.js.)
  const { now, IDS, NAMES, popcount, rowsOf, shapeOf, fitMap, reachMap, flood, search, searchG, pathTo, play, gauss, placed, fitAt, spawnOf, slice, runAll, tallyOf, tallyText } = V;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  /**
   * The opponent's levels. pace: seconds a piece (±30%), path replay included; sigma: noise on its judgement; blunder:
   * the chance a piece seals a gap on purpose (recv: on a piece it was sent); look: how many of its best it weighs
   * against the next piece (2-ply; 0 none); send: how much worse than its board a piece must make it to send it, and
   * hurt: also send a piece that is worse for you than an average one; reset: it starts over with a gap it cannot fill
   * while its board is less full than this; sps: moves a second when it plays its path; D: Race's pay factor.
   */
  const LEVELS = Object.freeze({
    easy: Object.freeze({ pace: 4.5, sigma: 8, blunder: 0.012, recv: 0.1, look: 0, send: 100, hurt: false, reset: 0.35, sps: 8, D: 0.4 }),
    steady: Object.freeze({ pace: 3.2, sigma: 4, blunder: 0.006, recv: 0.06, look: 0, send: 70, hurt: false, reset: 0.45, sps: 10, D: 0.55 }),
    brisk: Object.freeze({ pace: 2.3, sigma: 1, blunder: 0.002, recv: 0.03, look: 5, send: 50, hurt: true, reset: 0.5, sps: 12, D: 0.7 }),
    swift: Object.freeze({ pace: 1.6, sigma: 0, blunder: 0, recv: 0.01, look: 8, send: 35, hurt: true, reset: 0.5, sps: 14, D: 0.85 }),
  });
  /** Sizes: width 6–12, rows 6–12 (the height a Race size names is its rows; the buffer is on top of them). */
  const LIMITS = Object.freeze({ w: Object.freeze([6, 12]), rows: Object.freeze([6, 12]) });
  const SIZE = Object.freeze({ w: 10, h: 10 });
  const PRESETS = Object.freeze([['Quick', 8, 8], ['Standard', 10, 10], ['Long', 10, 12]]);
  /** Pieces set between two sends; the most Gap fillers held; seconds a board takes to start over; a send's time (sim). */
  const COOLDOWN = 6, MAX_CHARGES = 2, RESET_FADE = 0.6, SEND_TIME = 0.4;
  /** A filler cell: never the player's (FOREIGN: it never pays), drawn as stone. */
  const FILL = CELL.FOREIGN | CELL.FILL | 8;
  /** AI cost weights. */
  const W_SEALED = 120, W_SEALED_HELD = 30, W_COVERED = 22, W_BUMP = 3, W_PIT = 10, W_OVER = 6, W_LOW = 0.4;

  const on = (r) => !!r && r.mode === 'race';


  /** Empty goal cells (rows below h) a single block could reach, and those it could not: { open, sealed, seen }. */
  function analyse(cells, W, H, h) {
    const rows = rowsOf(cells, W, H), seen = flood(rows, W, H), full = (1 << W) - 1;
    let open = 0, sealed = 0;
    for (let y = 0; y < h; y++) { const e = ~rows[y] & full; open += popcount(e & seen[y]); sealed += popcount(e & ~seen[y]); }
    return { open, sealed, seen, rows };
  }

  const scratch = { F: new Int32Array(64), R: new Int32Array(64) };
  /**
   * The cover (D8): the empty goal cells some reachable placement of some shape of the set covers (every turn, from
   * the ceiling, sideways and down: Game.reach). An empty goal cell outside it is a sealed gap: no piece of the set can
   * ever get there. A cell with an empty cell under it counts as covered when a piece can get to it (it fills from the
   * bottom up). o.budget (ms): a pass that runs longer falls back to the flood fill (a single block's reach).
   * Returns { cov (rows of bits, h of them), sealed (cells), fallback }.
   */
  function cover(rows, W, H, h, types, o) {
    const full = (1 << W) - 1, cov = new Int32Array(h);
    let need = 0;
    for (let y = 0; y < h; y++) need += popcount(~rows[y] & full);
    const t0 = o && o.budget ? now() : 0;
    if (H > scratch.F.length) { scratch.F = new Int32Array(H); scratch.R = new Int32Array(H); }
    const F = scratch.F, R = scratch.R;
    let left = need;
    for (let i = 0; i < types.length && left > 0; i++) {
      const sh = shapeOf(types[i]);
      for (const r of sh.distinct) {
        const t = sh[r];
        fitMap(rows, W, H, t, F);
        reachMap(F, H, t, R);
        for (let py = 0; py < h; py++) {
          const at = R[py];
          if (!at) continue;
          for (let dy = 0; dy < t.bh && py + dy < h; dy++) {
            let m = t.m[dy], acc = 0;
            for (let b = 0; m; b++, m >>>= 1) if (m & 1) acc |= at << b;
            cov[py + dy] |= acc & full;
          }
        }
        left = 0;
        for (let y = 0; y < h; y++) left += popcount(~rows[y] & full & ~cov[y]);
        if (!left) break;
      }
      if (t0 && now() - t0 > o.budget) {
        const s = flood(rows, W, H);
        for (let y = 0; y < h; y++) cov[y] = s[y] & ~rows[y] & full;
        let sealed = 0;
        for (let y = 0; y < h; y++) sealed += popcount(~rows[y] & full & ~cov[y]);
        return { cov, sealed, fallback: true };
      }
    }
    return { cov, sealed: left, fallback: false };
  }

  /** The sealed regions (4-connected empty goal cells outside the cover), lowest first: [[[x, y], …], …]. */
  function regionsOf(rows, W, h, cov) {
    const full = (1 << W) - 1, mark = new Uint8Array(W * h), out = [];
    const sealed = (x, y) => !((rows[y] >>> x) & 1) && !((cov[y] >>> x) & 1);
    for (let y = 0; y < h; y++) {
      if (!(~rows[y] & full & ~cov[y])) continue;
      for (let x = 0; x < W; x++) {
        if (mark[y * W + x] || !sealed(x, y)) continue;
        const reg = [], st = [[x, y]];
        mark[y * W + x] = 1;
        while (st.length) {
          const [cx, cy] = st.pop();
          reg.push([cx, cy]);
          for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
            if (nx < 0 || nx >= W || ny < 0 || ny >= h || mark[ny * W + nx] || !sealed(nx, ny)) continue;
            mark[ny * W + nx] = 1; st.push([nx, ny]);
          }
        }
        out.push(reg);
      }
    }
    const low = (reg) => reg.reduce((a, [cx, cy]) => Math.min(a, cy * 64 + cx), 1e9);
    return out.sort((a, b) => low(a) - low(b));
  }

  // ---- a board in Race ----------------------------------------------------------------------------------------------

  /** A game's Race extension (null on another board). */
  function extOf(game) { return game && Array.isArray(game.ext) ? game.ext.find((e) => e.key === 'race') || null : null; }
  /** The board's own rows (the goal), under the buffer. */
  function goal(game) { const e = extOf(game); return e ? e.goal : game.h; }
  /** The shapes the set deals (cover's types), kept per game. */
  function typesOf(game) {
    const e = extOf(game);
    if (e && e.types) return e.types;
    const ids = game.dealer && game.dealer.candidates ? game.dealer.candidates(game) : Pieces.TETROMINOES;
    const types = (ids || Pieces.TETROMINOES).map((id) => Pieces.get(id)).filter(Boolean);
    if (e) e.types = types;
    return types;
  }
  /** The sealed gaps of a game's board: { regions, n (cells), cov, fallback }. o.budget as cover's. */
  function sealedOf(game, o) {
    const W = game.w, H = game.h, h = goal(game), rows = rowsOf(game.board.cells, W, H);
    const c = cover(rows, W, H, h, typesOf(game), o);
    return { regions: c.sealed ? regionsOf(rows, W, h, c.cov) : [], n: c.sealed, cov: c.cov, rows, fallback: c.fallback };
  }
  /** Every goal cell filled: the round is won. */
  function full(game) {
    const h = goal(game), W = game.w, c = game.board.cells;
    for (let i = 0; i < W * h; i++) if (!c[i]) return false;
    return true;
  }
  /** The player's own cells on the goal (what pays: never a filler). */
  function ownCells(game) {
    const h = goal(game), W = game.w, c = game.board.cells;
    let n = 0;
    for (let i = 0; i < W * h; i++) if (c[i] && !(c[i] & CELL.FOREIGN)) n++;
    return n;
  }
  /** How full the goal is (0–1). */
  function fillOf(game) {
    const h = goal(game), W = game.w, c = game.board.cells;
    let n = 0;
    for (let i = 0; i < W * h; i++) if (c[i]) n++;
    return n / (W * h);
  }
  /** Closed: an empty goal cell remains, and no piece of the set can reach any of them. */
  function closed(game, info) {
    const s = info || sealedOf(game), W = game.w, full1 = (1 << W) - 1, h = goal(game);
    let open = 0;
    for (let y = 0; y < h; y++) open += popcount(~s.rows[y] & full1 & s.cov[y]);
    return open === 0 && s.n > 0;
  }
  /** Fills the lowest sealed region with filler; returns it, or null when there is none. */
  function fillOne(game) {
    const s = sealedOf(game);
    if (!s.regions.length) return null;
    const reg = s.regions[0];
    for (const [x, y] of reg) game.board.set(x, y, FILL);
    return reg;
  }
  /** Can a piece of this type be set on the board from the ceiling (some reachable spot that touches the goal)? */
  function canSet(game, type) {
    if (!type) return false;
    const W = game.w, H = game.h, h = goal(game), rows = rowsOf(game.board.cells, W, H), sh = shapeOf(type);
    const F = new Int32Array(H), R = new Int32Array(H);
    for (const r of sh.distinct) {
      fitMap(rows, W, H, sh[r], F); reachMap(F, H, sh[r], R);
      for (let py = 0; py < h; py++) if (R[py]) return true;
    }
    return false;
  }

  // ---- a side: a board and its own Race state ---------------------------------------------------------------------------

  const freshSide = () => ({ charges: 0, cd: 0, resets: 0, sends: 0, earned: 0, fillers: 0, sealedN: 0, pieces: 0, sealedAny: false });
  function validSide(x) { return isObj(x) && ['charges', 'cd', 'resets', 'sends', 'earned', 'fillers', 'sealedN', 'pieces'].every((k) => Number.isFinite(x[k]) && x[k] >= 0); }
  /** { game, S, ver } for a game in Race. */
  function side(game) { const e = extOf(game); return e ? e.side : null; }

  /** Uses one Gap filler for each sealed region while charges last; returns the regions filled. */
  function fire(sd) {
    const out = [];
    while (sd.S.charges > 0) {
      const reg = fillOne(sd.game);
      if (!reg) break;
      sd.S.charges--; sd.S.fillers++;
      out.push(reg);
    }
    if (out.length) { sd.S.sealedN = sealedOf(sd.game).n; sd.ver++; }
    return out;
  }

  /**
   * After a side set a piece (res: the lock's result): the cooldown, a filler earned by the other side (the piece was one
   * it sent, and it sealed a new gap), fillers fired, and the round: won (every cell filled) or closed (start over).
   * Returns { earned, filled, foeFilled, won, foeWon, topout }.
   */
  function afterLock(me, foe, res) {
    const ev = { earned: false, filled: [], foeFilled: [], won: false, foeWon: false, topout: false };
    const S = me.S;
    S.cd = Math.max(0, S.cd - 1);
    S.pieces++;
    me.ver++;
    const info = sealedOf(me.game);
    if (info.n > S.sealedN) S.sealedAny = true;
    if (res && res.tag === 'received' && info.n > S.sealedN && foe && foe.S.charges < MAX_CHARGES) { foe.S.charges++; foe.S.earned++; ev.earned = true; }
    S.sealedN = info.n;
    ev.filled = fire(me);
    if (ev.earned) { ev.foeFilled = fire(foe); if (full(foe.game)) ev.foeWon = true; }
    if (full(me.game)) ev.won = true;
    else if (closed(me.game)) ev.topout = true;
    return ev;
  }

  /** No piece can be set: the piece in play, the one hold would bring, or (Send ready) the one after it. */
  function stuck(sd) {
    const g = sd.game, p = g.piece;
    if (!p) return false;
    if (canSet(g, p.type)) return false;
    const recv = !!(p.entry && p.entry.received);
    if (!recv && !g.mods.noHold && (g.freeHold || !g.holdLocked)) {
      const alt = g.hold ? Pieces.get(g.hold.id) : g.queue[0] && Pieces.get(g.queue[0].id);
      if (alt && canSet(g, alt)) return false;
    }
    if (!recv && sd.S.cd === 0 && g.queue[0] && canSet(g, Pieces.get(g.queue[0].id))) return false;
    return true;
  }

  /** The board starts over (a top out, Start over, or the opponent giving up on it): emptied, the queue kept. */
  function resetSide(sd) {
    const g = sd.game, keep = g.s;
    g.resetBoard();
    // The board's numbers (pieces, time played) carry on through a reset: it is the same board.
    g.s = keep;
    sd.S.resets++;
    sd.S.sealedN = 0;
    sd.ver++;
  }

  /**
   * Sends a piece to the other side: 'current' (the piece in play; the next one comes in) or 'next' (the first Next
   * piece). Ready only every COOLDOWN pieces set, and never a piece that was itself sent. It goes to the front of the
   * other side's queue, after any pieces sent before it. Returns the entry sent, or null.
   */
  function send(me, foe, which) {
    if (me.S.cd > 0) return null;
    const g = me.game;
    const e = which === 'next' ? g.takeNext() : g.takeCurrent();
    if (!e) return null;
    const entry = foe.game.inject(e.id, { received: true });
    entry.tag = 'received';
    me.S.cd = COOLDOWN;
    me.S.sends++;
    me.ver++; foe.ver++;
    return entry;
  }

  /**
   * What a round pays (D7): the own cells on the board at the round's end, a tenth of a line each, times f (no more a
   * cell than Standard: f = min(1, 4/E)), the level's D, and half for a loss. Cells lost to a reset never pay.
   */
  function pay(game, level, won) {
    const lv = LEVELS[level] || LEVELS.steady, f = game.rules && game.rules.f != null ? game.rules.f : 1;
    return (ownCells(game) / 10) * f * lv.D * (won ? 1 : 0.5);
  }

  // ---- the AI ---------------------------------------------------------------------------------------------------------------


  /**
   * The cost of a board after a placement (lower is better): rows (bits, the piece in), the goal's h rows, the piece's
   * box (t at px, py), and Gap fillers held (a sealed gap costs less then). Also gives the flood's sealed count.
   */
  function costOf(rows, W, H, h, t, px, py, charges, out) {
    if (FLOOD.length < H) FLOOD = new Int32Array(H);
    const full1 = (1 << W) - 1, seen = flood(rows, W, H, FLOOD);
    let empty = 0, sealed = 0, covered = 0, above = 0;
    for (let y = H - 1; y >= 0; y--) {
      if (y < h) {
        const e = ~rows[y] & full1;
        empty += popcount(e);
        sealed += popcount(e & ~seen[y]);
        covered += popcount(e & seen[y] & above);
      }
      above |= rows[y];
    }
    if (out) out.sealed = sealed;
    if (!empty) return -1e9;
    let c = sealed * (charges > 0 ? W_SEALED_HELD : W_SEALED) + covered * W_COVERED;
    // Column heights inside the goal (the buffer counts as the goal's ceiling).
    let prev = -1, bump = 0;
    const hs = scratchH.length >= W ? scratchH : (scratchH = new Int32Array(W));
    for (let x = 0; x < W; x++) {
      let t0 = 0;
      for (let y = H - 1; y >= 0; y--) if ((rows[y] >>> x) & 1) { t0 = Math.min(y + 1, h); break; }
      hs[x] = t0;
      if (prev >= 0) bump += Math.abs(t0 - prev);
      prev = t0;
    }
    c += bump * W_BUMP;
    for (let x = 0; x < W; x++) {
      const l = x > 0 ? hs[x - 1] : h, r = x < W - 1 ? hs[x + 1] : h, d = Math.min(l, r) - hs[x];
      if (d >= 3) c += (d - 2) * W_PIT;
    }
    if (t) {
      for (let dy = 0; dy < t.bh; dy++) {
        const n = popcount(t.m[dy]), y = py + dy;
        if (y >= h) c += n * W_OVER;
        c += n * y * W_LOW;
      }
    }
    return c;
  }
  let scratchH = new Int32Array(16), FLOOD = new Int32Array(32);



  /**
   * Every placement of a piece from a spot, scored (a generator: it yields between pieces of work, so a caller can run it
   * in slices). Returns [{ rot, x, y, px, py, cost, sealed, t }], best first.
   */
  function* evaluate(game, type, start, base, charges, rng, sigma) {
    const W = game.w, H = game.h, h = goal(game);
    const s = yield* searchG(game, type, start, base);
    yield;
    const spots = s.restIn(h), tmp = new Int32Array(H), out = [], o = {};
    for (let k = 0; k < spots.length; k++) {
      const sp = spots[k], t = s.sh[sp.rot];
      sp.t = t; sp.type = type;
      sp.cost = costOf(placed(base, t, sp.px, sp.py, tmp), W, H, h, t, sp.px, sp.py, charges, o) + (sigma && rng ? gauss(rng) * sigma : 0);
      sp.sealed = o.sealed;
      out.push(sp);
      if (k & 1) yield;
    }
    out.sort((a, b) => a.cost - b.cost);
    return out;
  }


  /** The best placement's cost for a type from where it would appear (Infinity when it has none). */
  function* bestFor(game, type, base, charges) {
    const st = spawnOf(game, type);
    const s = shapeOf(type)[st.rot];
    if (!fitAt(base, game.w, game.h, s, st.x + s.minX, st.y + s.minY)) return Infinity;
    const list = yield* evaluate(game, type, st, base, charges, null, 0);
    return list.length ? list[0].cost : Infinity;
  }

  /**
   * One decision for a side (a generator, run in slices of a few ms live and all at once in a simulation): 'send' (the
   * piece in play), 'place' (hold first or not, then a target spot: { rot, x, y }), or 'stuck' (nothing can be set).
   * me: { game, S, lvl, rng }; foe: the other side (its board weighs a send that hurts).
   */
  function* think(me, foe, o) {
    o = o || {};
    const g = me.game, lv = me.lvl, h = goal(g), W = g.w, H = g.h, p = g.piece;
    if (!p) return { kind: 'none' };
    const rng = me.rng, charges = me.S.charges;
    const recv = !!(p.entry && p.entry.received);
    const base = rowsOf(g.board.cells, W, H);
    let list = yield* evaluate(g, p.type, { rot: p.rot, x: p.x, y: p.y }, base, charges, rng, lv.sigma);
    // The best five again, judged by the cover (what the game counts as sealed), not the flood fill.
    const types = typesOf(g), tmp = new Int32Array(H);
    const rerank = function* (l) {
      for (const sp of l.slice(0, 5)) {
        if (sp.cost <= -1e8) continue;
        const c = cover(placed(base, sp.t, sp.px, sp.py, tmp), W, H, h, types);
        sp.cost += (c.sealed - sp.sealed) * (charges > 0 ? W_SEALED_HELD : W_SEALED);
        sp.sealed = c.sealed;
        yield;
      }
      return l.sort((a, b) => a.cost - b.cost);
    };
    list = yield* rerank(list);
    // Lookahead (2-ply): the best few weighed with the next piece's best after them.
    const nextE = g.queue[0], nextT = nextE && Pieces.get(nextE.id);
    const look = function* (l) {
      if (!lv.look || !nextT) return l;
      const top = l.slice(0, lv.look);
      for (const sp of top) {
        if (sp.cost <= -1e8) { sp.cost2 = sp.cost; continue; }
        // (The board itself is never touched: a slice can end here and the board be drawn.)
        const after = placed(base, sp.t, sp.px, sp.py, new Int32Array(H));
        const b2 = yield* bestFor(g, nextT, after, charges);
        sp.cost2 = sp.cost * 0.5 + (Number.isFinite(b2) ? b2 : 500) * 0.5;
      }
      top.sort((a, b) => a.cost2 - b.cost2);
      return top.concat(l.slice(lv.look));
    };
    list = yield* look(list);
    // Hold: the held piece (or the next one) where it would appear.
    let alt = null;
    if (!recv && !g.mods.noHold && (g.freeHold || !g.holdLocked)) {
      const altE = g.hold || g.queue[0], altT = altE && Pieces.get(altE.id);
      if (altT && altT !== p.type) {
        const st = spawnOf(g, altT), s = shapeOf(altT)[st.rot];
        if (fitAt(base, W, H, s, st.x + s.minX, st.y + s.minY)) {
          alt = yield* evaluate(g, altT, st, base, charges, rng, lv.sigma);
          alt = yield* rerank(alt);
        }
      }
    }
    const best = list[0] || null, altBest = alt && alt[0] ? alt[0] : null;
    const val = (sp) => (sp ? (sp.cost2 != null ? sp.cost2 : sp.cost) : Infinity);
    // Send: off cooldown, not a piece it was sent, a piece bad for its own board (or, hurt, worse for the other's).
    if (o.send !== false && me.S.cd === 0 && !recv && foe) {
      const mine = Math.min(best ? best.cost : 1e4, altBest ? altBest.cost : 1e4);
      const baseCost = costOf(base, W, H, h, null, 0, 0, charges);
      let hurt = false;
      if (lv.hurt && foe.game.piece) {
        const fg = foe.game, fb = rowsOf(fg.board.cells, fg.w, fg.h), f0 = costOf(fb, fg.w, fg.h, goal(fg), null, 0, 0, foe.S.charges);
        const worse = function* (t) { const c = yield* bestFor(fg, t, fb, foe.S.charges); return Number.isFinite(c) ? c - f0 : 999; };
        const mineFor = yield* worse(p.type);
        let mean = 0;
        const set = typesOf(fg);
        for (const t of set) mean += yield* worse(t);
        mean /= Math.max(1, set.length);
        hurt = mineFor - mean > lv.send * 0.5 || mineFor > lv.send;
      }
      if ((!best && !altBest) || mine - baseCost > lv.send || hurt) return { kind: 'send' };
    }
    let pick = best, hold = false;
    if (altBest && (!best || val(altBest) < val(best))) { pick = altBest; hold = true; }
    if (!pick) return { kind: 'stuck' };
    // A blunder: a spot that seals a gap when there is one (the mistake that matters in this race), else one of the best six.
    const bl = recv ? Math.max(lv.blunder, lv.recv) : lv.blunder;
    if (bl && rng && rng.chance(bl)) {
      const pool = hold ? alt : list, s0 = analyse(g.board.cells, W, H, h).sealed;
      const bad = pool.filter((sp) => sp.sealed > s0);
      const from = bad.length ? bad : pool.slice(0, 6);
      pick = from[rng.int(from.length)];
      return { kind: 'place', hold, target: { rot: pick.rot, x: pick.x, y: pick.y }, type: pick.type.id, blunder: true };
    }
    return { kind: 'place', hold, target: { rot: pick.rot, x: pick.x, y: pick.y }, type: pick.type.id };
  }


  /** Should the opponent start over: a gap it cannot fill, no filler held, and its board less full than its level's mark? */
  function givesUp(sd) {
    return sd.S.sealedN > 0 && sd.S.charges === 0 && fillOf(sd.game) < sd.lvl.reset;
  }

  /** Plays a decision on a side at once (a simulation): returns { sent } or { res } (the lock's result) or { stuck }. */
  function act(me, foe, d) {
    const g = me.game;
    if (d.kind === 'send') { const e = send(me, foe, 'current'); if (e) return { sent: e }; d = runAll(think(me, foe, { send: false })); }
    if (d.kind !== 'place') return { stuck: true };
    if (d.hold && !g.holdPiece()) return { stuck: true };
    const path = pathTo(g, d.target);
    if (!path) return { stuck: true };
    let res = null;
    for (const m of path) { res = play(g, m); if (res && typeof res === 'object') break; }
    if (!res || typeof res !== 'object') throw new Error('Race: a path that did not set its piece');
    return { res };
  }

  // ---- a match, simulated (tests and tuning: no clock, each side acts at its own pace) --------------------------------------

  /**
   * A round between two levels (o.levels: two of IDS; o.human: { pace, as } makes side 0 a stand-in player: `as` quality
   * (Steady by default), no extra blunders on pieces it was sent, its own pace in seconds a piece), on a board w × rows
   * of o.shapes. Returns { winner: 0 | 1 | null, time, sides: [{ S, pieces, pay }] }.
   */
  function simulate(o) {
    const w = o.w || 10, rows = o.rows || 10, seed = o.seed || 1;
    const recipe = Recipe.normalize({ mode: 'race', race: { level: 'steady' }, shapes: o.shapes || { preset: 'normal' } });
    const mk = (i, level) => {
      const game = new L.Game({ w, h: rows, recipe, seed: seed * 2 + i + 1, previewCount: 5, raceAI: true });
      const sd = side(game);
      let lvl = LEVELS[level];
      if (i === 0 && o.human) lvl = Object.assign({}, LEVELS[o.human.as || 'steady'], { pace: o.human.pace, recv: 0 });
      sd.lvl = lvl; sd.level = level; sd.rng = new RNG((seed * 7919 + i * 104729) >>> 0);
      sd.t = 0;
      return sd;
    };
    const A = mk(0, o.levels[0]), B = mk(1, o.levels[1]);
    const jitter = (s) => s.lvl.pace * (0.7 + 0.6 * s.rng.next());
    A.t = jitter(A); B.t = jitter(B);
    let winner = null, time = 0;
    for (let n = 0; n < (o.maxActs || 4000) && winner == null; n++) {
      const [me, foe, mi] = A.t <= B.t ? [A, B, 0] : [B, A, 1];
      const g = me.game;
      if (g.over || !g.piece || stuck(me)) { resetSide(me); me.t += RESET_FADE; continue; }
      const d = runAll(think(me, foe, { send: o.send !== false }));
      const r = d.kind === 'stuck' ? { stuck: true } : act(me, foe, d);
      if (r.sent) { me.t += SEND_TIME; continue; }
      if (r.stuck) { resetSide(me); me.t += RESET_FADE; continue; }
      const ev = afterLock(me, foe, r.res);
      if (ev.won) { winner = mi; time = me.t; break; }
      if (ev.foeWon) { winner = 1 - mi; time = me.t; break; }
      if (ev.topout || (o.giveUp !== false && givesUp(me))) { resetSide(me); me.t += RESET_FADE; continue; }
      me.t += jitter(me);
    }
    const out = (sd, i) => ({ S: Object.assign({}, sd.S), pieces: sd.S.pieces, own: ownCells(sd.game), pay: pay(sd.game, o.levels[1 - i] || 'steady', winner === i) });
    return { winner, time, sides: [out(A, 0), out(B, 1)] };
  }

  // ---- the engine's extension -------------------------------------------------------------------------------------------------

  /**
   * A Race board's hooks: the board grows k rows of buffer on top (a new board), nothing clears, a piece that would set
   * wholly in the buffer is refused, and what it leaves there is trimmed (res.trimmed). The side's state is ext.side.S; on
   * the player's board (not o.raceAI) the match too: ext.M, with the opponent's own Game (M.ai).
   */
  function extension(game, saved, o) {
    const k = game.rules.k || 4;
    if (!o.saved) game.board = new Board(game.board.w, game.board.h + k);
    const sv = isObj(saved) ? saved : {};
    const S = Object.assign(freshSide(), validSide(sv.side) ? clone(sv.side) : {});
    const ext = {
      goal: game.h - k, k, types: null,
      side: { game, S, ver: 0 },
      M: null,
      rows() { return []; },
      refuseLock(g, b, abs) { return b === g.board && abs.length && abs.every(([, y]) => y >= ext.goal) ? 'Set it on your board' : null; },
      afterPlace(g, b, abs, v, res) {
        const cut = [];
        for (const [x, y] of abs) if (y >= ext.goal && b.get(x, y)) { b.set(x, y, 0); cut.push([x, y]); }
        if (cut.length) res.trimmed = cut;
      },
      save() { const out = { v: 1, side: clone(S) }; if (ext.M) out.match = matchJSON(ext.M); return out; },
      summary() { return ext.M ? summaryOf(ext.M) : null; },
    };
    if (!o.raceAI) ext.M = makeMatch(game, ext, sv.match);
    return ext;
  }


  /** A match on the player's board: the opponent's level and its Game, the round, the tally by level. */
  function makeMatch(game, ext, saved) {
    const sv = isObj(saved) && saved.v === 1 ? saved : {};
    const level = IDS.includes(sv.level) ? sv.level : game.recipe.race.level;
    const round = isObj(sv.round) ? { n: Math.max(1, sv.round.n | 0), ms: Math.max(0, +sv.round.ms || 0), phase: ['ready', 'play', 'end'].includes(sv.round.phase) ? sv.round.phase : 'ready', winner: sv.round.winner === 'me' || sv.round.winner === 'ai' ? sv.round.winner : null, paid: +sv.round.paid || 0, resets: Math.max(0, sv.round.resets | 0) } : { n: 1, ms: 0, phase: 'ready', winner: null, paid: 0, resets: 0 };
    const M = {
      v: 1, level, round, tally: isObj(sv.tally) ? clone(sv.tally) : {}, streak: Math.max(0, sv.streak | 0), since: Number.isFinite(sv.since) ? sv.since : Date.now(),
      wins: Math.max(0, sv.wins | 0), losses: Math.max(0, sv.losses | 0), ai: null, me: ext.side,
    };
    let ai = null;
    const pl = L.Library && L.Library.playable;
    if (isObj(sv.ai) && (!pl || pl(sv.ai))) { try { ai = new L.Game({ saved: sv.ai, previewCount: 5, raceAI: true }); } catch (e) { ai = null; } }
    if (!ai || ai.w !== game.w || ai.h !== game.h) ai = new L.Game({ w: game.w, h: game.h - ext.k, recipe: game.recipe, seed: ((game.seed || Date.now()) ^ 0x5eed1e) >>> 0, previewCount: 5, raceAI: true });
    M.ai = side(ai);
    M.ai.lvl = LEVELS[level];
    M.ai.rng = new RNG((M.since ^ (round.n * 2654435761)) >>> 0);
    return M;
  }
  function matchJSON(M) {
    return { v: 1, level: M.level, round: clone(M.round), tally: clone(M.tally), streak: M.streak, since: M.since, wins: M.wins, losses: M.losses, ai: M.ai.game.toJSON() };
  }
  function summaryOf(M) {
    const t = tallyOf(M, M.level);
    return { level: M.level, won: t[0], lost: t[1], wins: M.wins, losses: M.losses, rounds: M.wins + M.losses };
  }
  /** The match of a game (the player's board), or null. */
  function matchOf(game) { const e = extOf(game); return e ? e.M : null; }

  /** Both boards start a new round: emptied, cooldowns and fillers cleared; the queues carry on. */
  function newRound(M) {
    for (const sd of [M.me, M.ai]) {
      const g = sd.game, keep = g.s;
      g.resetBoard();
      g.s = keep;
      Object.assign(sd.S, { charges: 0, cd: 0, sealedN: 0, resets: 0, sealedAny: false, pieces: 0 });
      sd.ver++;
    }
    M.round = { n: M.round.n + 1, ms: 0, phase: 'ready', winner: null, paid: 0, resets: 0 };
    M.ai.lvl = LEVELS[M.level];
    M.ai.rng = new RNG((M.since ^ (M.round.n * 2654435761)) >>> 0);
  }
  /** The round ends: the tally, the streak, and what it pays (pay: the caller banks it). */
  function endRound(M, winner) {
    const won = winner === 'me', t = tallyOf(M, M.level);
    if (won) { t[0]++; M.wins++; M.streak++; } else { t[1]++; M.losses++; M.streak = 0; }
    M.round.phase = 'end';
    M.round.winner = winner;
    M.round.paid = pay(M.me.game, M.level, won);
    return M.round.paid;
  }

  // ---- the recipe part ------------------------------------------------------------------------------------------------------

  const PART = {
    key: 'race', order: 50, mode: 'race', name: 'Race', owns: ['race'], options: { 'race.level': IDS.slice() },
    normalize(raw, out) {
      if (out.mode !== 'race') return;
      const lv = isObj(raw.race) && raw.race.level;
      out.race = { level: IDS.includes(lv) ? lv : 'steady' };
    },
    label: (r, short) => (on(r) ? (short ? 'Race' : 'Race · ' + NAMES[r.race.level]) : ''),
    // Width 6–12 (and the set's own minimum), rows 6–12: the buffer holds the pieces as they come in.
    limits(r, lim) {
      if (!on(r)) return;
      lim.w = [Math.min(LIMITS.w[1], Math.max(lim.w[0], LIMITS.w[0])), LIMITS.w[1]];
      lim.h = LIMITS.rows.slice();
    },
    // A size with no number for a side is 10 × 10.
    clampSize(size, r, lim, asked) {
      if (!on(r)) return size;
      const pick = (v, [lo, hi], d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
      return { w: pick(asked.w, lim.w, SIZE.w), h: pick(asked.h, lim.h, SIZE.h) };
    },
    rules(r, R) {
      if (!on(r)) return;
      for (const id of Object.keys(L.ITEMS || {})) R.refuse[id] = 'Not in Race';
      R.undo = false;
      R.hints = false;
      R.timed = true;
      R.noFeats = true;
      R.race = true;
      if (!R.k) R.k = 4;
    },
    conflicts(r, out) {
      if (!on(r)) return;
      // Physics bodies have no cells to seal or fill (Mirror says its own: js/mirror.js).
      if (!out['mods.physics=true']) out['mods.physics=true'] = 'Not in Race';
    },
    valid(g, r) {
      if (!on(r)) return true;
      const x = isObj(g.x) ? g.x.race : undefined;
      return x === undefined || (isObj(x) && x.v === 1 && (x.side === undefined || validSide(x.side)));
    },
    engine(game, saved, o) { return on(game.recipe) ? extension(game, saved, o) : null; },
    controller(play, game) { return game && on(game.recipe) && L.RaceView ? L.RaceView.controller(play, game) : null; },
    summary(x) { return isObj(x) && isObj(x.match) ? summaryOf(Object.assign({ tally: {} }, x.match, { tally: isObj(x.match.tally) ? x.match.tally : {} })) : null; },
    stats: { race: { rounds: 0, wins: 0, losses: 0, sends: 0, earned: 0, fillers: 0, resets: 0, bestStreak: 0, paid: 0, byLevel: {} }, timeMs: { race: 0 }, lines: { race: 0 } },
  };
  Recipe.part(PART);

  // ---- achievements: wins count against Steady or harder, on boards of 64 cells or more ---------------------------------------

  if (L.Achievements) {
    const counts = (e) => !!e && IDS.indexOf(e.level) >= 1 && e.cells >= 64;
    const win = (e) => !!e && e.won && counts(e);
    L.Achievements.group({
      id: 'race', name: 'Race', icon: 'race', after: 'play',
      note: 'Wins count against Steady or harder, on boards of 64 cells or more.',
      list: [
        { id: 'rc_filler', name: 'Return to Sender', desc: 'Earn a Gap filler.', pay: 30, on: 'race', test: (s, e) => !!e.earned },
        { id: 'rc_win', name: 'Across the Middle', desc: 'Win a round.', pay: 40, on: 'race', test: (s, e) => win(e) },
        { id: 'rc_second', name: 'Second Wind', desc: 'Win after starting over in that round.', pay: 80, on: 'race', test: (s, e) => win(e) && e.resets > 0 },
        { id: 'rc_brisk', name: 'Head to Head', desc: 'Beat Brisk.', pay: 100, on: 'race', test: (s, e) => win(e) && IDS.indexOf(e.level) >= 2 },
        { id: 'rc_seamless', name: 'Seamless', desc: 'Win with no gap sealed and no start over.', pay: 120, on: 'race', test: (s, e) => win(e) && !e.sealed && !e.resets },
        { id: 'rc_three', name: 'Three Straight', desc: 'Win 3 rounds in a row on one board.', pay: 150, on: 'race', test: (s, e) => win(e) && e.streak >= 3 },
        { id: 'rc_swift', name: 'Swifter Still', desc: 'Beat Swift.', pay: 250, tier: 'legend', on: 'race', test: (s, e) => win(e) && e.level === 'swift' },
      ],
    });
  }

  L.Race = {
    IDS, NAMES, LEVELS, LIMITS, SIZE, PRESETS, COOLDOWN, MAX_CHARGES, RESET_FADE, SEND_TIME, FILL, on,
    popcount, rowsOf, shapeOf, fitMap, reachMap, flood, analyse, cover, regionsOf,
    extOf, goal, typesOf, sealedOf, full, ownCells, fillOf, closed, fillOne, canSet,
    side, fire, afterLock, stuck, resetSide, send, pay,
    search, pathTo, play, costOf, evaluate, think, slice, runAll, givesUp, act, simulate,
    matchOf, newRound, endRound, tallyOf, tallyText, summaryOf, PART,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
