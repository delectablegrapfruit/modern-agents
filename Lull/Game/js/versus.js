// Lull — what Race and Battle share (js/race.js, js/battle.js): the opponent's levels by name, boards as rows of bits,
// the search an opponent plans its moves with (every spot a piece can get to, and the moves that get it there),
// running that thinking in short slices, and Standard and Frantic (the rule sets a new game draws from). Pure, no DOM.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces } = L;

  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());

  /** The opponent's levels, easiest first, and their names. */
  const IDS = ['easy', 'steady', 'brisk', 'swift'];
  const NAMES = { easy: 'Easy', steady: 'Steady', brisk: 'Brisk', swift: 'Swift' };

  // ---- bitmask boards ---------------------------------------------------------------------------------------------------
  //
  // A board as rows of bits (bit x of rows[y] set: the cell is filled; 12 columns at most). Every reachability question
  // here is answered row by row: the positions a shape can reach in a row are the ones it can drop into from the row
  // above, then slide to sideways through positions it fits (it never moves up). That is the engine's own reach
  // (Game.reach: sideways and down from the ceiling), in a few bit operations a row.

  function popcount(v) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

  /** rows[y]: the filled cells of row y as bits. */
  function rowsOf(cells, W, H, out) {
    const rows = out || new Int32Array(H);
    for (let y = 0; y < H; y++) { let m = 0; const o = y * W; for (let x = 0; x < W; x++) if (cells[o + x]) m |= 1 << x; rows[y] = m; }
    return rows;
  }

  const SHAPES = new WeakMap();
  /** A piece type's turns as bit rows: [{ bw, bh, minX, minY, m: Int32Array(bh), key }], and its distinct shapes. */
  function shapeOf(type) {
    let s = SHAPES.get(type);
    if (s) return s;
    s = type.rots.map((cells, r) => {
      const b = type.rotBounds[r], m = new Int32Array(b.h);
      for (const [x, y] of cells) m[y - b.minY] |= 1 << (x - b.minX);
      return { bw: b.w, bh: b.h, minX: b.minX, minY: b.minY, m, key: b.w + ':' + Array.from(m).join(',') };
    });
    // Its distinct shapes (O has one, I, S and Z two): cover reaches each once; dOf[r] is the one turn r looks like.
    s.distinct = [];
    s.dOf = s.map((t, r) => { const d = s.findIndex((u) => u.key === t.key); if (d === r) s.distinct.push(r); return d; });
    SHAPES.set(type, s);
    return s;
  }

  /** out[py]: the columns px where the shape fits with its box's bottom-left at (px, py). */
  function fitMap(rows, W, H, t, out) {
    const full = (1 << W) - 1, lim = W - t.bw;
    const pxMask = lim < 0 ? 0 : (1 << (lim + 1)) - 1;
    for (let py = 0; py < H; py++) {
      if (!pxMask || py + t.bh > H) { out[py] = 0; continue; }
      let f = pxMask;
      for (let dy = 0; dy < t.bh && f; dy++) {
        const free = ~rows[py + dy] & full;
        let m = t.m[dy];
        for (let b = 0; m; b++, m >>>= 1) if (m & 1) f &= free >>> b;
      }
      out[py] = f;
    }
    return out;
  }
  /** x grown sideways through f until it stops. */
  function spread(x, f) { let y; do { y = x; x = (x | (x << 1) | (x >>> 1)) & f; } while (x !== y); return x; }
  /** out[py]: the positions reachable from the ceiling (every column where it fits in the top row), sideways and down. */
  function reachMap(F, H, t, out) {
    const top = H - t.bh;
    for (let py = H - 1; py > top; py--) out[py] = 0;
    if (top < 0) { out.fill(0); return out; }
    out[top] = F[top];
    for (let py = top - 1; py >= 0; py--) out[py] = F[py] ? spread(out[py + 1] & F[py], F[py]) : 0;
    return out;
  }

  /** The empty cells a single block could reach from the top (the cheap flood fill): rows of bits. */
  function flood(rows, W, H, out) {
    const full = (1 << W) - 1, R = out || new Int32Array(H);
    R[H - 1] = ~rows[H - 1] & full;
    for (let y = H - 2; y >= 0; y--) { const f = ~rows[y] & full; R[y] = f ? spread(R[y + 1] & f, f) : 0; }
    return R;
  }

  /**
   * Every spot a piece can get to from where it is: a BFS over (turn, x, y) with parent pointers, moving left, right,
   * down and turning as the engine does (the first kick that fits). Returns the search: { at(rot, x, y) -> index or -1,
   * restIn(goalRows) -> resting spots that touch the goal, path(i) -> moves } (moves: 'L', 'R', 'D', 'CW', 'CCW').
   */
  function search(game, type, start, rows) { return runAll(searchG(game, type, start, rows)); }
  /** search, as a generator (it yields every so many spots, so a slice stays short). */
  function* searchG(game, type, start, rows) {
    const W = game.w, H = game.h, sh = shapeOf(type), noTurn = game.mods.noRotate || type.kicks === 'none';
    // Buffers kept from one search to the next (a search is read before the next one starts): no garbage a piece.
    const N = 4 * H * W;
    if (!SEARCH.par || SEARCH.par.length < N || SEARCH.H !== H) {
      SEARCH.par = new Int32Array(N); SEARCH.mv = new Int8Array(N); SEARCH.q = new Int32Array(N); SEARCH.mark = new Uint8Array(N);
      SEARCH.F = [0, 1, 2, 3].map(() => new Int32Array(H)); SEARCH.H = H;
    }
    const F = SEARCH.F.map((f, r) => fitMap(rows, W, H, sh[r], f));
    const par = SEARCH.par, mv = SEARCH.mv, q = SEARCH.q, mark = SEARCH.mark;
    par.fill(-2, 0, N);
    const idx = (r, px, py) => (r * H + py) * W + px;
    const fits = (r, px, py) => px >= 0 && py >= 0 && px < W && py < H && ((F[r][py] >>> px) & 1) === 1;
    let qh = 0, qt = 0;
    const visit = (r, px, py, from, m) => {
      if (!fits(r, px, py)) return;
      const i = idx(r, px, py);
      if (par[i] !== -2) return;
      par[i] = from; mv[i] = m; q[qt++] = i;
    };
    const s0 = sh[start.rot];
    // The kicks of each turn, clockwise and back (the engine takes the first that fits).
    const KK = [0, 1, 2, 3].map((r) => [Pieces.kicksFor(type, r, (r + 1) % 4), Pieces.kicksFor(type, r, (r + 3) % 4)]);
    visit(start.rot, start.x + s0.minX, start.y + s0.minY, -1, 0);
    let steps = 0;
    while (qh < qt) {
      const i = q[qh++], px = i % W, py = ((i / W) | 0) % H, r = (i / (W * H)) | 0;
      visit(r, px - 1, py, i, 1);
      visit(r, px + 1, py, i, 2);
      visit(r, px, py - 1, i, 3);
      if (!noTurn) {
        for (let d = 0; d < 2; d++) {
          const t = d ? (r + 3) % 4 : (r + 1) % 4, kicks = KK[r][d], a = sh[r], b = sh[t];
          const x = px - a.minX, y = py - a.minY;
          for (let k = 0; k < kicks.length; k++) {
            const nx = x + kicks[k][0] + b.minX, ny = y + kicks[k][1] + b.minY;
            if (fits(t, nx, ny)) { visit(t, nx, ny, i, d ? 5 : 4); break; }
          }
        }
      }
      if ((++steps & 63) === 0) yield;
    }
    const MOVES = [null, 'L', 'R', 'D', 'CW', 'CCW'];
    return {
      type, sh, F, count: qt,
      /** Resting spots (nothing under them) that touch the goal, each final placement once: [{ i, rot, x, y, px, py }]. */
      restIn(h) {
        const out = [];
        mark.fill(0, 0, N);
        for (let k = 0; k < qt; k++) {
          const i = q[k], px = i % W, py = ((i / W) | 0) % H, r = (i / (W * H)) | 0;
          if (py >= h || (py > 0 && fits(r, px, py - 1))) continue;
          // The same cells reached in another turn that looks the same (O, I, S, Z) are one placement.
          const j = idx(sh.dOf[r], px, py);
          if (mark[j]) continue;
          mark[j] = 1;
          out.push({ i, rot: r, x: px - sh[r].minX, y: py - sh[r].minY, px, py });
        }
        return out;
      },
      at(r, x, y) { const px = x + sh[r].minX, py = y + sh[r].minY; if (!fits(r, px, py)) return -1; const i = idx(r, px, py); return par[i] === -2 ? -1 : i; },
      path(i) { const out = []; while (i >= 0 && par[i] !== -1) { out.push(MOVES[mv[i]]); i = par[i]; } return out.reverse(); },
    };
  }

  const SEARCH = { par: null, mv: null, q: null, mark: null, F: null, H: 0 };

  /** The moves that bring the piece in play to a spot ({ rot, x, y }), then 'lock'; null when it cannot get there. */
  function pathTo(game, target) {
    const p = game.piece;
    if (!p) return null;
    const s = search(game, p.type, { rot: p.rot, x: p.x, y: p.y }, rowsOf(game.board.cells, game.w, game.h));
    const i = s.at(target.rot, target.x, target.y);
    if (i < 0) return null;
    return s.path(i).concat(['lock']);
  }
  /** Plays one move of a path on the game; a 'lock' (or a 'D' that cannot go down) sets the piece. Returns its result. */
  function play(game, m) {
    if (m === 'L') return game.move(-1);
    if (m === 'R') return game.move(1);
    if (m === 'CW') return game.rotate(1);
    if (m === 'CCW') return game.rotate(-1);
    return game.lower();
  }

  function gauss(rng) { let u = 0; while (!u) u = rng.next(); const v = rng.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /** Board rows with a placement in it. */
  function placed(base, t, px, py, tmp) {
    tmp.set(base);
    for (let dy = 0; dy < t.bh; dy++) tmp[py + dy] |= t.m[dy] << px;
    return tmp;
  }

  /** The spot a type appears at on this board ({ rot, x, y }), as the game would place it. */
  function spawnOf(game, type) {
    const pos = game.spawnPosition(type, 0);
    return { rot: pos.rot != null ? pos.rot : 0, x: pos.x, y: pos.y };
  }
  /** Does the shape t fit with its box at (px, py)? */
  function fitAt(rows, W, H, t, px, py) {
    if (px < 0 || py < 0 || px + t.bw > W || py + t.bh > H) return false;
    for (let dy = 0; dy < t.bh; dy++) if (rows[py + dy] & (t.m[dy] << px)) return false;
    return true;
  }

  /** Runs a generator for about budget ms (it may run one step over): { done, value, ms }. */
  function slice(gen, budget) {
    const t0 = now();
    for (;;) {
      const r = gen.next();
      if (r.done) return { done: true, value: r.value, ms: now() - t0 };
      if (now() - t0 >= budget) return { done: false, ms: now() - t0 };
    }
  }
  function runAll(gen) { for (;;) { const r = gen.next(); if (r.done) return r.value; } }

  /** The tally a match keeps for a level: [won, lost]. */
  const tallyOf = (M, level) => (M.tally[level] = Array.isArray(M.tally[level]) ? M.tally[level] : [0, 0]);
  /** The tally in words: "vs Steady 3–2". */
  function tallyText(M, level) { const lv = level || M.level, t = tallyOf(M, lv); return 'vs ' + NAMES[lv] + ' ' + t[0] + '–' + t[1]; }

  // ---- Standard and Frantic: the rule sets a new game draws from ---------------------------------------------------------
  //
  // The menu offers each two-board mode a tempo, Standard or Frantic, and each tempo is a small pool of that mode's rule
  // sets (a size, shapes, the mode's own pacing, and the opponent's pace). Every new game draws one of its tempo's sets
  // (Recipe.deal, on the game's own seed); the set drawn is the game's (recipe.<mode>.set), so Continue resumes it. A
  // game with no tempo (a Custom one, or one from before) plays the mode's usual rules.

  const TEMPOS = ['standard', 'frantic'];
  const TEMPO_NAMES = { standard: 'Standard', frantic: 'Frantic' };

  /** A mode's sets of one tempo. */
  const poolOf = (sets, tempo) => sets.filter((s) => s.tempo === tempo);
  /** A mode's set by its id, or null. */
  const setOf = (sets, id) => (typeof id === 'string' && sets.find((s) => s.id === id)) || null;
  /** One set of a tempo, drawn with rng (null for a tempo with none). */
  function drawSet(sets, tempo, rng) { const p = poolOf(sets, tempo); return p.length ? p[rng.int(p.length)] : null; }

  /**
   * A mode's own key of the recipe, made whole: { level, tempo?, set? }. A set it knows brings its tempo; an unknown set
   * is dropped, and so is an unknown tempo.
   */
  function normalizeSide(raw, sets) {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { level: IDS.includes(o.level) ? o.level : 'steady' };
    const s = setOf(sets, o.set);
    if (s) { out.tempo = s.tempo; out.set = s.id; } else if (TEMPOS.includes(o.tempo)) out.tempo = o.tempo;
    return out;
  }

  /** A new game of a mode with a tempo: one of its sets drawn, its shapes and size: { recipe, size }, or null (no tempo). */
  function dealSet(r, key, sets, rng) {
    const own = r && r[key];
    if (!own || !TEMPOS.includes(own.tempo)) return null;
    const s = drawSet(sets, own.tempo, rng);
    if (!s) return null;
    const out = JSON.parse(JSON.stringify(r));
    out[key] = { level: own.level, tempo: s.tempo, set: s.id };
    out.shapes = { preset: s.shapes };
    return { recipe: out, size: { w: s.w, h: s.h } };
  }

  /** A level with the opponent's pace changed by a set (f: a factor on its seconds a piece; 1 leaves the level as it is). */
  function paced(lv, f) { return f && f !== 1 ? Object.freeze(Object.assign({}, lv, { pace: Math.round(lv.pace * f * 100) / 100 })) : lv; }

  /** A set in words: "Frantic · 8 × 8 · Frantic shapes" (or "Pentominoes"), then what the mode adds ("Send every 4"). */
  function setLine(s, extra) {
    if (!s) return '';
    const nm = s.shapes !== 'normal' && L.Shapes ? L.Shapes.NAMES[s.shapes] || '' : '';
    const shapes = nm && !/s$/.test(nm) ? nm + ' shapes' : nm;
    return [TEMPO_NAMES[s.tempo], s.w + ' × ' + s.h, shapes].concat(extra || []).filter(Boolean).join(' · ');
  }

  L.Versus = {
    IDS, NAMES, now, popcount, rowsOf, shapeOf, fitMap, spread, reachMap, flood,
    search, searchG, pathTo, play, gauss, placed, fitAt, spawnOf, slice, runAll, tallyOf, tallyText,
    TEMPOS, TEMPO_NAMES, poolOf, setOf, drawSet, normalizeSide, dealSet, paced, setLine,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
