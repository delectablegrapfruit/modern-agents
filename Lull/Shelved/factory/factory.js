// Lull — the Factory: one fixed line, drawn whole from the first day. Droppers (one to three) drop single minos onto the
// top conveyor, which carries them into the store: up its left column, over the pile, and down into the lowest column
// (sand). A hopper at the bottom lets a mino out, only while an assembler still needs one, into the lower lift, which
// pushes it up and out onto the lower conveyor; it hops down into the assembler waiting for it. An assembler sets the
// minos it receives one at a time and drops the finished piece onto the belt below, which winds down to the board. The
// board plays every piece itself, as a skilled player would, and every full line it clears pays straight into the
// wallet. While nobody is around the line runs on for a while (TUNE.AWAY_H), then rests until you are back. The model
// runs in whole ticks (a quarter second each) on an integer clock, so the line on screen and the line replayed for time
// away are the same line, whatever slices the time comes in.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;

  const VERSION = 9;
  const deep = (o) => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') deep(o[k]); return Object.freeze(o); };

  /** Every number of the factory, in one place. Prices are lines; times are seconds. */
  const TUNE = deep({
    TICK: 0.25,
    // ---- droppers, the conveyors and the store
    DROPPERS: 3,
    DROP_T: [12, 10, 8, 6.5],                 // seconds a mino, each dropper, by speed level
    STORE_COLS: 7,
    STORE_ROWS: [3, 6, 10, 14],               // rows of the store unlocked, by level (from the bottom)
    MINO_V: 2,                                // units a tick a mino rides the conveyors and lifts
    GAP: 12,                                  // units from one mino to the next on a conveyor
    // ---- assemblers
    ASSEMBLERS: 3,
    SIZES: [2, 3, 4, 5],                      // the piece an assembler builds, by size level
    FEED_T: 8,                                // seconds an assembler takes to set each mino
    SET_T: 2,                                 // and to finish a piece once its last mino is set
    // ---- the belt
    BELT_T: [90, 60, 40, 25],                 // seconds for the whole ride, by speed level
    PIECE_GAP: 30,                            // units from one piece to the next on the belt
    // ---- the board
    BOARD_W: 27,
    BOARD_H: 18,
    // ---- pay: points, forty to a line. A loose mino is 2; a piece is worth more than its minos, and every cell on the
    // board carries its piece's worth a mino. Clearing several lines at once pays more.
    PTS: 40,
    LOOSE_PTS: 2,
    PIECE_PTS: { 2: 5, 3: 9, 4: 14, 5: 20 },  // ×1.25, ×1.5, ×1.75, ×2 its loose minos
    BONUS: [1, 1, 1.25, 1.5, 2, 2.5],         // by lines cleared at once (5 or more: ×2.5)
    // ---- prices (each list: the next level's price)
    COST: {
      dropper: [8, 45],                       // the second and third dropper
      speed: [30, 100, 200],                  // dropper speed levels 1–3
      store: [10, 25, 40],                    // store sizes 2–4
      assembler: [5, 25, 90],                 // the first, second and third assembler
      size: [10, 60, 160],                    // trominoes, tetrominoes, pentominoes
      beltSpeed: [30, 60, 100],               // belt speed levels 1–3
    },
    START_STORE: 6,                           // a new factory's store
    START_DROP: 24,                           // ticks into its first mino, a new factory's dropper
    AWAY_H: 1,                                // hours the line runs on with nobody around, then rests
    RAW: 8,                                   // the palette slot loose minos are drawn in (the well's garbage grey)
  });
  const { TICK, DROPPERS, DROP_T, STORE_COLS, STORE_ROWS, MINO_V, GAP, ASSEMBLERS, SIZES, FEED_T, SET_T, BELT_T, PIECE_GAP, BOARD_W, BOARD_H, PTS, LOOSE_PTS, PIECE_PTS, COST } = TUNE;
  const TICK_MS = Math.round(TICK * 1000);
  const T = (s) => Math.round(s / TICK);
  const DROP_TT = DROP_T.map(T), FEED_TT = T(FEED_T), SET_TT = T(SET_T), AWAY_TT = T(TUNE.AWAY_H * 3600);
  const STORE_CAP = STORE_ROWS.map((r) => r * STORE_COLS);
  const NAMES = { 2: 'Domino', 3: 'Tromino', 4: 'Tetromino', 5: 'Pentomino' };
  /** The upgrades, by the part they are bought on. */
  const KINDS = ['dropper', 'speed', 'store', 'assembler', 'size', 'beltSpeed'];
  // Pay is kept in sixteenths of a point, so every cell's worth and every bonus is a whole number.
  const SUB = 16, LINE_SUB = PTS * SUB;
  const BONUS4 = TUNE.BONUS.map((b) => Math.round(b * 4));
  const cellWorth = (n) => (PIECE_PTS[n] * SUB) / n;
  // Motion in ticks: a mino dropping onto the conveyor, hopping into an assembler; a piece down a chute.
  const DROP_FALL = 1, HOP = 2, CHUTE = 2, ENTER = 3, THINK = 2, CLEAR = 3, FALL_ROWS = 2, GRAVITY = 2, FALL_MAX = 14;

  // ---- the floor: logical units (360 wide), the one geometry the line runs on and the view draws ---------------------

  const GEO = deep({
    W: 360, H: 622, HEAD: 20,
    drop: { x: [12, 93, 174], y: 12, w: 74, h: 52 },
    store: { x: 256, y: 12, w: 92, h: 174 },
    bay: { x: [12, 93, 174], y: 114, w: 74, h: 72 },
    sign: { x: 256, y: 196, w: 92, h: 40 },
    board: { x: 12, y: 382, w: 336, h: 228, cell: 12 },
    rail: { y: [76, 98], x0: 18 },            // the top conveyor (into the store) and the lower one (out to the assemblers)
    lift: { x: 266, top: 35, bot: 175 },      // the store's left column: the upper lift above, the lower one below
    pile: { x: 274, s: 10, bot: 180 },        // the store's columns, left to right from the lift
    belt: { y: [208, 258, 308, 358], x0: 50, x1: 310, r: 25, start: 236 },
  });
  const dropCX = (j) => GEO.drop.x[j] + GEO.drop.w / 2;
  const bayCX = (k) => GEO.bay.x[k] + GEO.bay.w / 2;
  /** A store column's centre, and the centre of its cell at height i (0 at the bottom). */
  const colX = (c) => GEO.pile.x + c * GEO.pile.s + GEO.pile.s / 2;
  const cellY = (i) => GEO.pile.bot - (i + 0.5) * GEO.pile.s;

  /** A path sampled a point a unit (straight runs and arcs). */
  function sampler() {
    const P = [];
    return {
      line(a, b) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let i = 0; i < l; i++) P.push([a[0] + ((b[0] - a[0]) * i) / l, a[1] + ((b[1] - a[1]) * i) / l]); },
      arc(cx, cy, r, a0, a1) { const l = Math.abs(a1 - a0) * r; for (let i = 0; i < l; i++) { const a = a0 + ((a1 - a0) * i) / l; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } },
      end(p) { P.push(p); return P; },
    };
  }
  /** The point at s units along a sampled path. */
  function at(P, s) {
    const n = P.length - 1;
    s = s < 0 ? 0 : s > n ? n : s;
    const i = Math.floor(s), f = s - i, a = P[i], b = P[Math.min(n, i + 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  const { rail, lift, belt: BG } = GEO, R6 = 6;
  // The top conveyor: right into the store at its own height, then up the upper lift to the top of the store.
  const TOP = (() => {
    const p = sampler();
    p.line([rail.x0, rail.y[0]], [lift.x - R6, rail.y[0]]); p.arc(lift.x - R6, rail.y[0] - R6, R6, Math.PI / 2, 0);
    p.line([lift.x, rail.y[0] - R6], [lift.x, lift.top + R6]); p.arc(lift.x + R6, lift.top + R6, R6, Math.PI, 1.5 * Math.PI);
    return p.end([lift.x + R6, lift.top]);
  })();
  // The lower lift from the store's bottom up, out through its left wall and along the lower conveyor.
  const LOW = (() => {
    const p = sampler();
    p.line([lift.x, lift.bot], [lift.x, rail.y[1] + R6]); p.arc(lift.x - R6, rail.y[1] + R6, R6, 0, -Math.PI / 2);
    p.line([lift.x - R6, rail.y[1]], [rail.x0, rail.y[1]]);
    return p.end([rail.x0, rail.y[1]]);
  })();
  // The belt: under the assemblers running left, then winding down the screen in four runs.
  const BELT = (() => {
    const p = sampler(), [y0, y1, y2, y3] = BG.y, r = BG.r;
    p.line([BG.start, y0], [BG.x0, y0]); p.arc(BG.x0, y0 + r, r, -Math.PI / 2, -1.5 * Math.PI);
    p.line([BG.x0, y1], [BG.x1, y1]); p.arc(BG.x1, y1 + r, r, -Math.PI / 2, Math.PI / 2);
    p.line([BG.x1, y2], [BG.x0, y2]); p.arc(BG.x0, y2 + r, r, -Math.PI / 2, -1.5 * Math.PI);
    p.line([BG.x0, y3], [BG.x1, y3]);
    return p.end([BG.x1, y3]);
  })();
  const TOP_END = TOP.length - 1, LOW_END = LOW.length - 1;
  const GATE = Math.round(GEO.store.x - rail.x0);                 // where the top conveyor enters the store
  const DROP_S = [0, 1, 2].map((j) => Math.round(dropCX(j) - rail.x0));
  const TAP_S = [0, 1, 2].map((k) => LOW.findIndex(([x, y], i) => i > 20 && Math.abs(y - rail.y[1]) < 0.01 && x <= bayCX(k)));
  const ACROSS = (c) => Math.round(colX(c) - (lift.x + R6));      // along the top of the store, to a column
  const OUTLET = (c) => -Math.round(colX(c) - lift.x);           // a mino leaving a column's bottom, before the lower lift
  const BELT_LEN = (BELT.length - 1) * 100;                      // the belt in hundredths of a unit
  const BELT_V = BELT_T.map((s) => Math.round(BELT_LEN / T(s)));
  const ENTRY = [0, 1, 2].map((k) => Math.round((BG.start - bayCX(k)) * 100));
  const PGAP = PIECE_GAP * 100;
  const SPAWN_X = Math.floor((BG.x1 - (GEO.board.x + (GEO.board.w - BOARD_W * GEO.board.cell) / 2)) / GEO.board.cell);

  // ---- shapes -------------------------------------------------------------------------------------------------------

  const rotKey = (cells) => { let best = null, cur = cells; for (let r = 0; r < 4; r++) { const k = Pieces.keyOf(cur); if (best === null || k < best) best = k; cur = cur.map(([x, y]) => [y, -x]); } return best; };
  /** A shape lying flat: turned so it is at least as wide as tall, rows counted down from its top. */
  function flat(cells) {
    let b = Pieces.boundsOf(cells);
    if (b.h > b.w) { cells = cells.map(([x, y]) => [y, -x]); b = Pieces.boundsOf(cells); }
    const out = cells.map(([x, y]) => [x - b.minX, b.maxY - y]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
    out.w = b.w; out.h = b.h;
    return out;
  }
  const shapeCache = {};
  /** Every one-sided n-omino (mirror images apart), lying flat, in a fixed order: 1, 2, 7, 18 for n = 2…5. */
  function shapes(n) {
    if (!shapeCache[n]) {
      const out = [], seen = new Set();
      for (const c of Pieces.freePolyominoes(n)) for (const m of [c, c.map(([x, y]) => [-x, y])]) { const k = rotKey(m); if (!seen.has(k)) { seen.add(k); out.push(flat(m)); } }
      shapeCache[n] = out;
    }
    return shapeCache[n];
  }

  const shapeIndex = {};
  /** A shape grown a mino at a time, each beside a random one already there (as the approved concept grows them), so
   *  compact shapes come up more often than straggly ones: its index among shapes(n). */
  function grow(r, n) {
    if (!shapeIndex[n]) {
      shapeIndex[n] = new Map();
      shapes(n).forEach((c, i) => { let cur = c; for (let t = 0; t < 4; t++) { shapeIndex[n].set(Pieces.keyOf(cur), i); cur = cur.map(([x, y]) => [y, -x]); } });
    }
    const cells = [[0, 0]], seen = new Set(['0,0']);
    while (cells.length < n) {
      const [x, y] = cells[r.int(cells.length)], [dx, dy] = STEPS[r.int(4)], k = (x + dx) + ',' + (y + dy);
      if (!seen.has(k)) { seen.add(k); cells.push([x + dx, y + dy]); }
    }
    return shapeIndex[n].get(Pieces.keyOf(cells));
  }
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ---- the board's player -------------------------------------------------------------------------------------------
  // Rows are bit masks (bit x is column x), so a placement is scored in a few dozen operations: Dellacherie's features
  // (landing height, eroded cells, row and column transitions, holes, wells), with two more (rows with a hole in them,
  // and how deep each hole is buried) and a steep guard near the top: landing height counts double, a row with a hole 8,
  // each cell over a hole 1. Looking one piece ahead, at pieces grown as the line grows them, it has not topped out in
  // 135,000 pentominoes on a full line (its worst stack 11 rows of 18; scripts/test.cjs plays 20,000 pentominoes and
  // 20,000 mixed tick by tick). Without the look ahead it would, so the board always has a next piece to look at.

  const FULL = (1 << BOARD_W) - 1, EDGE = (1 << (BOARD_W + 1)) - 1, TOPBIT = 1 << (BOARD_W - 1);
  const pop = (v) => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24); };
  const rotCache = new Map();
  /** A shape's distinct turns, each a step clockwise from the one before: cells, size and row masks. */
  function turns(n, s) {
    const key = n * 100 + s;
    if (rotCache.has(key)) return rotCache.get(key);
    const out = [], seen = new Set();
    let c = shapes(n)[s].map((p) => p.slice());
    for (let r = 0; r < 4; r++) {
      const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1]));
      const cells = c.map(([x, y]) => [x - mx, y - my]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
      const k = cells.join(';');
      if (!seen.has(k)) {
        seen.add(k);
        const w = 1 + Math.max(...cells.map((p) => p[0])), h = 1 + Math.max(...cells.map((p) => p[1])), rows = new Int32Array(h);
        for (const [x, y] of cells) rows[y] |= 1 << x;
        out.push({ cells, w, h, rows });
      }
      c = c.map(([x, y]) => [-y, x]);
    }
    rotCache.set(key, out);
    return out;
  }
  function fits(g, r, x, y) {
    if (x < 0 || y < 0 || x + r.w > BOARD_W || y + r.h > BOARD_H) return false;
    for (let i = 0; i < r.h; i++) if (g[y + i] & (r.rows[i] << x)) return false;
    return true;
  }
  const scratch = new Int32Array(BOARD_H), depth = new Int32Array(BOARD_W), above = new Int32Array(BOARD_W);
  /** A placement's score (higher is better): the grid after it lands and its lines clear, read feature by feature. */
  function score(g, r, x, y) {
    const k = scratch;
    let lines = 0, er = 0, w = BOARD_H - 1;
    for (let Y = BOARD_H - 1; Y >= 0; Y--) {
      let row = g[Y], mine = 0;
      const i = Y - y;
      if (i >= 0 && i < r.h) { mine = r.rows[i] << x; row |= mine; }
      if (row === FULL) { lines++; er += pop(mine); continue; }
      k[w--] = row;
    }
    while (w >= 0) k[w--] = 0;
    let rowT = 0, colT = 0, holes = 0, holeRows = 0, buried = 0, wells = 0, maxh = 0, prev = 0, cover = 0, active = 0;
    depth.fill(0); above.fill(0);
    for (let Y = 0; Y < BOARD_H; Y++) {
      const row = k[Y];
      rowT += pop((((row << 1) | 1) ^ (row | (1 << BOARD_W))) & EDGE);
      colT += pop(prev ^ row); prev = row;
      let hm = ~row & cover & FULL;
      if (hm) { holes += pop(hm); holeRows++; }
      while (hm) { const b = hm & -hm; buried += above[31 - Math.clz32(b)]; hm ^= b; }
      let fm = row;
      while (fm) { const b = fm & -fm; above[31 - Math.clz32(b)]++; fm ^= b; }
      cover |= row;
      if (row && !maxh) maxh = BOARD_H - Y;
      const wm = ~row & ((row << 1) | 1) & ((row >>> 1) | TOPBIT) & FULL;
      let gone = active & ~wm;
      while (gone) { const b = gone & -gone; depth[31 - Math.clz32(b)] = 0; gone ^= b; }
      let m = wm;
      while (m) { const b = m & -m; wells += ++depth[31 - Math.clz32(b)]; m ^= b; }
      active = wm;
    }
    colT += pop(~prev & FULL);
    return -2 * (BOARD_H - y - r.h / 2) + lines * er - rowT - colT - 4 * holes - 8 * holeRows - buried - wells - (maxh > BOARD_H - 5 ? (maxh - BOARD_H + 5) * 30 : 0);
  }
  /** Every place a piece can drop straight down to, best first (ties keep turn-then-column order). */
  function options(g, rs) {
    const o = [];
    for (let ri = 0; ri < rs.length; ri++) {
      const r = rs[ri];
      for (let x = 0; x + r.w <= BOARD_W; x++) {
        if (!fits(g, r, x, 0)) continue;
        let y = 0;
        while (fits(g, r, x, y + 1)) y++;
        o.push({ sc: score(g, r, x, y), ri, x, y });
      }
    }
    return o.sort((a, b) => b.sc - a.sc);
  }
  /** The grid after a piece lands at (x, y) and its full rows go. */
  function settle(g, r, x, y) {
    const t = new Int32Array(BOARD_H);
    let w = BOARD_H - 1;
    for (let Y = BOARD_H - 1; Y >= 0; Y--) {
      const i = Y - y, row = g[Y] | (i >= 0 && i < r.h ? r.rows[i] << x : 0);
      if (row !== FULL) t[w--] = row;
    }
    return t;
  }
  /** Where to put a piece: its best place, or, looking one piece ahead (the next to come), the best of its eight
   *  best places counting the next piece's best place after it. */
  function plan(g, rs, next) {
    const o = options(g, rs);
    if (!next || !o.length) return o[0] || null;
    let best = null;
    for (let i = 0; i < o.length && i < 8; i++) {
      const p = o[i], n = options(settle(g, rs[p.ri], p.x, p.y), next)[0], sc = p.sc + (n ? n.sc : -1e9);
      if (!best || sc > best.sc) best = { sc, ri: p.ri, x: p.x, y: p.y };
    }
    return best;
  }

  // ---- the board's grid: 18 strings of 27, a letter a cell (its colour and the size of the piece it came from) ---------

  const CELLS = 'abcdefghijklmnopqrstuvwxyzAB';
  const cellChar = (c, n) => CELLS[(n - 2) * 7 + (c - 1)];
  const cellOf = (ch) => { const i = CELLS.indexOf(ch); return i < 0 ? null : { c: 1 + (i % 7), n: 2 + Math.floor(i / 7) }; };
  const EMPTY_ROW = '.'.repeat(BOARD_W);
  const maskCache = new WeakMap();
  /** A grid's rows as bit masks (kept for each grid: a grid is always replaced, never changed in place). */
  function masks(grid) {
    let g = maskCache.get(grid);
    if (g) return g;
    g = new Int32Array(BOARD_H);
    for (let y = 0; y < BOARD_H; y++) { let m = 0; const row = grid[y]; for (let x = 0; x < BOARD_W; x++) if (row.charCodeAt(x) !== 46) m |= 1 << x; g[y] = m; }
    maskCache.set(grid, g);
    return g;
  }

  // ---- the factory --------------------------------------------------------------------------------------------------

  function freshStats() {
    return {
      made: 0, built: 0, delivered: 0, bySize: [0, 0, 0, 0], lines: 0, cleared: 0, best: 0, paid: 0, sold: 0, soldPts: 0,
      spent: 0, smoothMs: 0, away: 0, resets: 0, days: 0, lastDay: '',
    };
  }

  /** The next piece an assembler builds: its size, and a shape and colour from the factory's seed and a serial. */
  function startPiece(f, a) {
    const n = SIZES[f.size], r = new RNG(f.seed + ':' + (++f.serial));
    a.n = n; a.s = grow(r, n); a.c = 1 + r.int(7);
    a.got = 0; a.set = 0; a.t = 0; a.held = false;
    return a;
  }

  function create() {
    const f = {
      v: VERSION, seed: (Math.random() * 4294967296) >>> 0, serial: 0, acc: 0, lastTick: Date.now(), away: 0,
      droppers: 1, speed: 0, storeLevel: 0, size: 0, beltSpeed: 0,
      drops: [{ t: TUNE.START_DROP, held: false }], top: [], pile: new Array(STORE_COLS).fill(0), out: [], asm: [], belt: [], moved: false,
      grid: new Array(BOARD_H).fill(EMPTY_ROW), cur: null, clr: null, ct: 0, bank: 0,
      stats: freshStats(),
    };
    for (let i = 0; i < TUNE.START_STORE; i++) f.pile[sandCol(f)]++;
    f.stats.made = TUNE.START_STORE;
    return f;
  }

  const storeCap = (f) => STORE_CAP[f.storeLevel];
  const storeRows = (f) => STORE_ROWS[f.storeLevel];
  const dropTicks = (f) => DROP_TT[f.speed];
  const beltV = (f) => BELT_V[f.beltSpeed];
  const pileCount = (f) => { let n = 0; for (const h of f.pile) n += h; return n; };
  /** Minos in the store: the pile and those already through its door. */
  const inStore = (f) => { let n = pileCount(f); for (const m of f.top) if (m.s > GATE) n++; return n; };
  /** Where a mino dropping into the store goes: the lowest column, counting those already falling into it; ties go to
   *  the column nearest the lift. */
  function sandCol(f) {
    let best = 0, low = Infinity;
    for (let c = 0; c < STORE_COLS; c++) {
      let h = f.pile[c];
      for (const m of f.top) if (m.c === c) h++;
      if (h < low) { low = h; best = c; }
    }
    return best;
  }
  /** Minos on their way to assembler k (riding the lower conveyor or hopping down). */
  const pending = (f, k) => { let n = 0; for (const m of f.out) if (m.k === k) n++; return n; };
  const wants = (f, k) => { const a = f.asm[k]; return a.n - a.got - pending(f, k); };
  const starved = (f, k) => { const a = f.asm[k]; return !a.held && a.set === a.got && a.got < a.n && !pending(f, k) && !pileCount(f); };

  // ---- one tick -----------------------------------------------------------------------------------------------------

  /** The board: the piece in play takes one step (in from the belt, a pause, a turn, a column, a drop of two rows) or
   *  locks; full rows flash, then go, and pay. */
  function boardTick(f, out) {
    if (f.ct > 0) { if (--f.ct === 0) clearRows(f, out); return true; }
    const p = f.cur;
    if (!p) return false;
    p.ox = p.x; p.oy = p.y;
    if (p.in > 0) { if (--p.in === 0) spawn(f, out); return true; }
    if (p.t > 0) { p.t--; return true; }
    const rs = turns(p.n, p.s), g = masks(f.grid);
    if (p.r !== p.tr) {
      const n = (p.r + 1) % rs.length, x = Math.min(p.x, BOARD_W - rs[n].w);
      if (fits(g, rs[n], x, p.y)) { p.r = n; p.x = x; } else { p.tr = p.r; p.tx = Math.min(p.tx, BOARD_W - rs[p.r].w); }
      return true;
    }
    if (p.x !== p.tx) {
      const nx = p.x + Math.sign(p.tx - p.x);
      if (fits(g, rs[p.r], nx, p.y)) p.x = nx; else p.tx = p.x;
      return true;
    }
    if (fits(g, rs[p.r], p.x, p.y + 1)) { let i = 0; while (i < FALL_ROWS && fits(g, rs[p.r], p.x, p.y + 1)) { p.y++; i++; } return true; }
    lock(f, out);
    return true;
  }

  /** The piece in from the chute appears at the top under it and decides where it goes. Should the top ever be taken
   *  (the player keeps the stack low; this is only a safety net) the board quietly empties first. */
  function spawn(f, out) {
    const p = f.cur, rs = turns(p.n, p.s);
    p.r = 0; p.x = Math.min(BOARD_W - rs[0].w, SPAWN_X); p.y = 0; p.ox = p.x; p.oy = 0;
    let g = masks(f.grid);
    if (!fits(g, rs[0], p.x, 0)) {
      f.grid = new Array(BOARD_H).fill(EMPTY_ROW); f.stats.resets++; g = masks(f.grid);
      if (out) out.push({ kind: 'reset' });
    }
    const nx = nextPiece(f), best = plan(g, rs, nx ? turns(nx.n, nx.s) : null);
    p.tr = best ? best.ri : 0; p.tx = best ? best.x : p.x; p.t = THINK;
  }

  /** The piece the board will get next, as a player watching the floor would tell: whichever, on the belt or still in
   *  an assembler, would reach the board first at the belt's speed (ties to the one further along). */
  function nextPiece(f) {
    const v = beltV(f);
    let best = null, when = Infinity;
    for (const it of f.belt) {
      const t = it.f + Math.ceil((BELT_LEN - it.p) / v);
      if (t < when) { when = t; best = it; }
    }
    for (let k = f.asm.length - 1; k >= 0; k--) {
      const a = f.asm[k], work = (a.n - a.set) * FEED_TT - (a.set < a.got ? a.t : 0) + (a.set === a.n ? SET_TT - a.t : SET_TT);
      const t = work + CHUTE + Math.ceil((BELT_LEN - ENTRY[k]) / v);
      if (t < when) { when = t; best = a; }
    }
    return best;
  }

  function lock(f, out) {
    const p = f.cur, r = turns(p.n, p.s)[p.r], ch = cellChar(p.c, p.n), rows = f.grid.slice();
    for (const [x, y] of r.cells) { const row = rows[p.y + y]; rows[p.y + y] = row.slice(0, p.x + x) + ch + row.slice(p.x + x + 1); }
    f.grid = rows; f.cur = null;
    const st = f.stats;
    st.delivered++; st.bySize[p.n - 2]++;
    const full = [];
    for (let y = 0; y < BOARD_H; y++) if (rows[y].indexOf('.') < 0) full.push(y);
    if (out) out.push({ kind: 'lock', n: p.n, lines: full.length });
    if (full.length) { f.clr = full; f.ct = CLEAR; }
  }

  /** Full rows go; each cell pays its piece's worth a mino, times the bonus for clearing several at once. */
  function clearRows(f, out) {
    const rows = f.clr, st = f.stats;
    let worth = 0, cells = 0;
    for (const y of rows) for (const ch of f.grid[y]) { const c = cellOf(ch); if (c) { worth += cellWorth(c.n); cells++; } }
    const pay = (worth * BONUS4[Math.min(BONUS4.length - 1, rows.length)]) / 4;
    const keep = f.grid.filter((_, y) => rows.indexOf(y) < 0);
    while (keep.length < BOARD_H) keep.unshift(EMPTY_ROW);
    f.grid = keep; f.clr = null;
    f.bank += pay; st.paid += pay; st.lines += rows.length; st.cleared += cells; st.best = Math.max(st.best, rows.length);
    if (out) out.push({ kind: 'clear', rows, pay });
  }

  /**
   * One tick, downstream first: the board, the belt (its head drops into the board once the board is free), the
   * assemblers, the lower conveyor and the store's outlet, the top conveyor and the store, the droppers. `closed`:
   * nobody around (the line runs on for AWAY_H, then rests). Events go to `out`
   * when given. Returns whether anything changed: a tick that changes nothing is a fixed point (everything waits).
   */
  function tick(f, out, closed) {
    if (closed) { if (f.away >= AWAY_TT) return false; f.away++; }
    else if (f.away) f.away = 0;
    const st = f.stats, V = MINO_V;
    let ch = !!closed;
    // 1. The board.
    if (boardTick(f, out)) ch = true;
    // 2. The belt: pieces glide toward the board, a gap apart, and queue at its end; one falling from an assembler
    // holds its place until it lands.
    const belt = f.belt, v = beltV(f);
    let limit = BELT_LEN, moved = false;
    for (const it of belt) {
      if (it.pp !== it.p) { it.pp = it.p; ch = true; }
      if (it.f > 0) { it.f--; ch = true; }
      else { const to = Math.min(it.p + v, limit); if (to > it.p) { it.p = to; moved = true; } }
      limit = it.p - PGAP;
    }
    if (moved || moved !== f.moved) ch = true;
    f.moved = moved;
    if (belt.length && belt[0].p >= BELT_LEN && !belt[0].f && !f.cur && !f.ct) {
      const it = belt.shift();
      f.cur = { n: it.n, s: it.s, c: it.c, in: ENTER, r: 0, x: 0, y: 0, ox: 0, oy: 0, tr: 0, tx: 0, t: 0 };
      ch = true;
      if (out) out.push({ kind: 'enter', item: it });
    }
    // 3. The assemblers: set each mino received, one at a time; then finish the piece and drop it onto the belt right
    // below, once there is room there.
    for (let k = 0; k < f.asm.length; k++) {
      const a = f.asm[k];
      if (a.set < a.got) {
        if (++a.t >= FEED_TT) { a.set++; a.t = 0; if (out) out.push({ kind: 'set', k }); }
        ch = true;
      } else if (a.set === a.n) {
        if (a.t < SET_TT) { a.t++; ch = true; }
        else if (entryFree(f, k)) {
          const item = { n: a.n, s: a.s, c: a.c, p: ENTRY[k], pp: ENTRY[k], f: CHUTE, k };
          let i = 0;
          while (i < belt.length && belt[i].p > item.p) i++;
          belt.splice(i, 0, item);
          st.built++;
          if (closed) st.away++;
          if (out) out.push({ kind: 'build', k, item });
          startPiece(f, a);
          ch = true;
        } else if (!a.held) { a.held = true; ch = true; }
      }
    }
    // 4. The lower conveyor: minos ride left (a gap apart) to the assembler each was let out for and hop down into it.
    // The store lets one out of its outlet (the bottom of the column nearest the lift) only while an assembler still
    // needs one, so nothing rides past them all.
    for (let i = f.out.length - 1; i >= 0; i--) {
      const m = f.out[i];
      if (m.h > 0) {
        if (--m.h === 0) { f.asm[m.k].got++; f.out.splice(i, 1); if (out) out.push({ kind: 'got', k: m.k }); }
        ch = true;
      }
    }
    limit = Infinity;
    for (const m of f.out) {
      if (m.h > 0) continue;
      if (m.ps !== m.s) { m.ps = m.s; ch = true; }
      const to = Math.min(m.s + V, limit, TAP_S[m.k]);
      if (to > m.s) { m.s = to; ch = true; }
      if (m.s >= TAP_S[m.k]) { m.h = HOP; ch = true; }
      else limit = m.s - GAP;
    }
    for (let i = 1; i < f.out.length; i++) if (f.out[i].s > f.out[i - 1].s) { f.out.sort((a, b) => b.s - a.s); break; }
    let need = -1;
    for (let k = f.asm.length - 1; k >= 0 && need < 0; k--) if (wants(f, k) > 0) need = k;
    if (need >= 0 && pileCount(f) > 0) {
      let c = 0;
      while (!f.pile[c]) c++;
      const s = OUTLET(c);
      if (f.out.every((m) => m.h > 0 || m.s >= s + GAP)) {
        f.pile[c]--;
        f.out.push({ s, ps: s, k: need, h: 0 });
        ch = true;
        if (out) out.push({ kind: 'out', c });
      }
    }
    // 5. The top conveyor and the store: minos ride right a gap apart; through the store's door only while it has room
    // (else they queue back along the conveyor); up the lift, across to the lowest column and down onto the pile.
    const cap = storeCap(f);
    let room = cap - inStore(f);
    limit = Infinity;
    for (let i = 0; i < f.top.length; i++) {
      const m = f.top[i];
      if (m.c >= 0 && m.y > 0) {
        // Falling into its column: it lands on the pile (or waits on a mino sliding out underneath).
        if (m.py !== m.y) { m.py = m.y; ch = true; }
        const land = cellY(f.pile[m.c]), stop = sliding(f, m.c) ? land - GEO.pile.s : land;
        if (m.y < stop) { m.v = Math.min(FALL_MAX, m.v + GRAVITY); m.y = Math.min(stop, m.y + m.v); ch = true; }
        else if (m.v) { m.v = 0; ch = true; }
        if (m.y >= land) { f.pile[m.c]++; f.top.splice(i--, 1); if (out) out.push({ kind: 'land', c: m.c }); }
        continue;
      }
      if (m.ps !== m.s) { m.ps = m.s; ch = true; }
      if (m.f > 0) { m.f--; ch = true; limit = m.s - GAP; continue; }
      let to = Math.min(m.s + V, limit);
      if (m.s <= GATE && to > GATE) { if (room > 0) room--; else to = GATE; }
      if (to > TOP_END && m.c < 0) { m.c = sandCol(f); ch = true; }
      const end = m.c >= 0 ? TOP_END + ACROSS(m.c) : TOP_END;
      if (to > end) to = end;
      if (to > m.s) { m.s = to; ch = true; }
      if (m.c >= 0 && m.s >= end) { m.y = lift.top; m.py = m.y; m.v = 0; ch = true; continue; }
      limit = m.s - GAP;
    }
    // 6. The droppers: a mino every DROP_T onto the conveyor below, once its spot there is clear (else they wait).
    const dt = dropTicks(f);
    for (let j = 0; j < f.drops.length; j++) {
      const d = f.drops[j];
      if (d.t < dt) { d.t++; ch = true; }
      if (d.t >= dt) {
        const s = DROP_S[j];
        if (f.top.every((m) => (m.c >= 0) || m.s >= s + GAP || m.s <= s - GAP - V * (DROP_FALL + 1))) {
          f.top.push({ s, ps: s, f: DROP_FALL, c: -1, y: 0, py: 0, v: 0 });
          d.t = 0; d.held = false; st.made++; ch = true;
          if (out) out.push({ kind: 'drop', j });
        } else if (!d.held) { d.held = true; ch = true; if (out) out.push({ kind: 'full' }); }
      }
    }
    sortTop(f);
    if (!closed && ch && mood(f).mood === 'smooth') st.smoothMs += TICK_MS;
    return ch;
  }

  /** The top conveyor in order: riders by how far along, then those falling in the store, lowest first. */
  const topOrder = (a, b) => ((a.y > 0) - (b.y > 0)) || (a.y > 0 ? b.y - a.y : b.s - a.s);
  function sortTop(f) {
    const t = f.top;
    for (let i = 1; i < t.length; i++) if (topOrder(t[i - 1], t[i]) > 0) { t.sort(topOrder); return; }
  }
  /** Whether a mino leaving the store's outlet is passing under column c (along the bottom, toward the lower lift). */
  function sliding(f, c) {
    const x = colX(c);
    for (const m of f.out) if (m.s < 0 && Math.abs(lift.x - m.s - x) < GEO.pile.s) return true;
    return false;
  }

  /** Room on the belt under assembler k for a piece to drop: none within a gap ahead, nor near enough behind to meet it. */
  function entryFree(f, k) {
    const e = ENTRY[k], v = beltV(f);
    for (const it of f.belt) if (it.p < e + PGAP && it.p > e - PGAP - v * (CHUTE + 1)) return false;
    return true;
  }

  // ---- running time -------------------------------------------------------------------------------------------------

  /** Adds ms to the factory's clock and runs every whole tick it now holds; once a tick changes nothing, the rest is
   *  only waiting, so the run stops there. */
  function run(f, ms, out, closed) {
    ms = ms > 0 ? Math.round(ms) : 0;
    f.acc += ms;
    let n = Math.floor(f.acc / TICK_MS);
    f.acc -= n * TICK_MS;
    while (n-- > 0) if (!tick(f, out, closed)) break;
    return out;
  }

  /** Runs the line for dt seconds (closed: nobody around); returns what happened, for sounds and pictures. */
  function step(f, dt, closed) { return run(f, Math.round((dt > 0 ? dt : 0) * 1000), [], !!closed); }

  /** Time away: replayed with the same ticks, nobody around. A clock set back starts over from now. */
  function catchUp(f, now) {
    if (!(now >= f.lastTick)) { f.lastTick = now; return null; }
    const ms = Math.round(now - f.lastTick);
    f.lastTick = now;
    if (ms <= 0) return null;
    const st = f.stats, made0 = st.made, built0 = st.built, lines0 = st.lines, paid0 = st.paid;
    run(f, ms, null, true);
    return { seconds: ms / 1000, made: st.made - made0, built: st.built - built0, lines: st.lines - lines0, earned: (st.paid - paid0) / LINE_SUB };
  }

  /** Whole lines the board has paid, taken from its bank (the rest stays, in sixteenths of a point). */
  function takeLines(f) {
    const n = Math.floor(f.bank / LINE_SUB);
    if (n > 0) f.bank -= n * LINE_SUB;
    return n;
  }
  /** Lines, from sixteenths of a point. */
  const linesOf = (sub) => sub / LINE_SUB;

  // ---- how the line is doing ----------------------------------------------------------------------------------------

  /**
   * How busy the line is, for the sign: the share of its machines at work (a dropper not waiting; an assembler neither
   * short of minos nor waiting for room on the belt; the belt, while it carries anything, moving), whether it is stuck
   * (a dropper waiting: the store is full and the top conveyor backed up), and one of four moods: full (stuck), smooth
   * (four fifths or more at work), idle (nothing at work) or working.
   */
  function mood(f) {
    let on = 0, all = 0, held = 0, hungry = 0;
    for (const d of f.drops) { all++; if (!d.held) on++; }
    for (let k = 0; k < f.asm.length; k++) {
      all++;
      if (f.asm[k].held) held++;
      else if (starved(f, k)) hungry++;
      else on++;
    }
    if (f.asm.length && f.belt.length) { all++; if (f.moved) on++; }
    const busy = all ? on / all : 0, stuck = f.drops.some((d) => d.held);
    const m = stuck ? 'full' : busy >= 0.8 ? 'smooth' : on === 0 ? 'idle' : 'working';
    return { mood: m, busy, stuck, full: stuck, storeFull: inStore(f) >= storeCap(f), backed: held > 0, starved: hungry };
  }

  /** What the line makes running freely: minos an hour from the droppers, pieces an hour (the slower of the assemblers
   *  and the minos), the lines an hour they pay on the board, and the minos left over, in loose lines. */
  function rates(f) {
    const make = f.drops.length * 3600 / DROP_T[f.speed];
    const n = SIZES[f.size], per = n * FEED_T + SET_T;
    const pieces = f.asm.length ? Math.min(f.asm.length * 3600 / per, make / n) : 0;
    return { make, pieces, auto: (pieces * PIECE_PTS[n]) / PTS, loose: ((make - pieces * n) * LOOSE_PTS) / PTS };
  }

  // ---- selling and building -----------------------------------------------------------------------------------------

  /** Sells every mino in the store's pile at the loose rate (into the bank, like the board's lines). */
  function sell(f) {
    const n = pileCount(f);
    if (!n) return null;
    f.pile.fill(0);
    const pay = n * LOOSE_PTS * SUB;
    f.bank += pay; f.stats.paid += pay; f.stats.sold += n; f.stats.soldPts += n * LOOSE_PTS;
    return { sold: n, lines: pay / LINE_SUB };
  }

  /** The day the factory was looked at (for its days). */
  function visit(f, today) {
    const st = f.stats, day = today || L.dateKey();
    if (day !== st.lastDay) { st.days++; st.lastDay = day; }
  }

  const LEVEL = { dropper: (f) => f.droppers - 1, speed: (f) => f.speed, store: (f) => f.storeLevel, assembler: (f) => f.asm.length, size: (f) => f.size, beltSpeed: (f) => f.beltSpeed };
  /** A kind's level now, and its top. */
  const levelOf = (f, kind) => LEVEL[kind](f);
  const topOf = (kind) => COST[kind].length;

  /** The next of a kind: { cost, from, to } in its own terms (droppers, seconds a mino, minos, assemblers, piece size,
   *  seconds a ride), or null at the top. */
  function nextUpgrade(f, kind) {
    if (!LEVEL[kind]) return null;
    const l = levelOf(f, kind);
    if (l >= topOf(kind)) return null;
    const cost = COST[kind][l];
    switch (kind) {
      case 'dropper': return { cost, from: f.droppers, to: f.droppers + 1 };
      case 'speed': return { cost, from: DROP_T[l], to: DROP_T[l + 1] };
      case 'store': return { cost, from: STORE_CAP[l], to: STORE_CAP[l + 1] };
      case 'assembler': return { cost, from: l, to: l + 1 };
      case 'size': return { cost, from: SIZES[l], to: SIZES[l + 1] };
      default: return { cost, from: BELT_T[l], to: BELT_T[l + 1] };
    }
  }

  /** Builds the next of a kind (the caller has already taken the lines). A new size is built from each assembler's next
   *  piece (one with no minos yet on their way changes at once). */
  function upgrade(f, kind) {
    const u = nextUpgrade(f, kind);
    if (!u) return false;
    if (kind === 'dropper') { f.drops.push({ t: 0, held: false }); f.droppers++; }
    else if (kind === 'speed') f.speed++;
    else if (kind === 'store') f.storeLevel++;
    else if (kind === 'assembler') f.asm.push(startPiece(f, {}));
    else if (kind === 'size') { f.size++; f.asm.forEach((a, k) => { if (!a.got && !pending(f, k)) startPiece(f, a); }); }
    else f.beltSpeed++;
    for (const d of f.drops) if (d.t > dropTicks(f)) d.t = dropTicks(f);
    f.stats.spent += u.cost;
    return true;
  }

  const maxed = (f) => KINDS.every((k) => !nextUpgrade(f, k));

  // ---- saves --------------------------------------------------------------------------------------------------------

  const KEYS = ['v', 'seed', 'serial', 'acc', 'lastTick', 'away', 'droppers', 'speed', 'storeLevel', 'size', 'beltSpeed', 'drops', 'top', 'pile', 'out', 'asm', 'belt', 'moved', 'grid', 'cur', 'clr', 'ct', 'bank', 'stats'];

  /** A saved factory put right: every count in range, every mover on its path, the board whole, every stat present. A
   *  save of any other version starts a new factory (there are no migrations). */
  function repair(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f) || f.v !== VERSION) return create();
    const int = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
    const obj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const okShape = (it) => obj(it) && SIZES.indexOf(it.n) >= 0 && Number.isInteger(it.s) && it.s >= 0 && it.s < shapes(it.n).length;
    f.seed = Number.isFinite(f.seed) ? f.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    f.serial = int(f.serial, 0, 1e12, 0);
    f.acc = int(f.acc, 0, TICK_MS - 1, 0);
    f.away = int(f.away, 0, AWAY_TT, 0);
    f.droppers = int(f.droppers, 1, DROPPERS, 1);
    f.speed = int(f.speed, 0, DROP_T.length - 1, 0);
    f.storeLevel = int(f.storeLevel, 0, STORE_CAP.length - 1, 0);
    f.size = int(f.size, 0, SIZES.length - 1, 0);
    f.beltSpeed = int(f.beltSpeed, 0, BELT_T.length - 1, 0);
    // The store: column heights within its unlocked rows, and no more than it holds.
    const pile = Array.isArray(f.pile) ? f.pile : [];
    f.pile = [];
    for (let c = 0; c < STORE_COLS; c++) f.pile.push(int(pile[c], 0, storeRows(f), 0));
    // The top conveyor: riders on their path in order, a gap apart; those falling in the store, in their column.
    const top = (Array.isArray(f.top) ? f.top : []).filter(obj);
    f.top = [];
    let room = storeCap(f) - pileCount(f), limit = Infinity;
    for (const m of top.filter((m) => m.c >= 0 && m.y > 0).sort((a, b) => b.y - a.y)) {
      const c = int(m.c, 0, STORE_COLS - 1, 0);
      if (room <= 0) break;
      room--;
      const y = int(m.y, lift.top, cellY(0), lift.top);
      const s = TOP_END + ACROSS(c);
      f.top.push({ s, ps: int(m.ps, s - 2 * MINO_V, s, s), f: 0, c, y, py: int(m.py, lift.top, y, y), v: int(m.v, 0, FALL_MAX, 0) });
    }
    const riders = top.filter((m) => !(m.c >= 0 && m.y > 0) && Number.isFinite(m.s)).sort((a, b) => b.s - a.s);
    const ride = [];
    for (const m of riders) {
      const c = m.c >= 0 ? int(m.c, 0, STORE_COLS - 1, 0) : -1;
      let s = int(m.s, 0, c >= 0 ? TOP_END + ACROSS(c) : TOP_END, 0);
      if (c < 0 && s > TOP_END) s = TOP_END;
      if (s > limit) s = limit;
      if (s < 0) break;
      if (s > GATE) { if (room <= 0) s = Math.min(s, GATE); else room--; }
      if (s > limit) break;
      ride.push({ s, ps: int(m.ps, Math.max(0, s - 2 * MINO_V), s, s), f: int(m.f, 0, DROP_FALL, 0), c: s > TOP_END ? c : (c >= 0 && s === TOP_END ? c : -1), y: 0, py: 0, v: 0 });
      limit = s - GAP;
    }
    f.top = ride.concat(f.top);
    // Assemblers: a piece of a known shape, its minos received and set in order.
    f.asm = (Array.isArray(f.asm) ? f.asm.slice(0, ASSEMBLERS) : []).map((a) => {
      if (!okShape(a)) return startPiece(f, {});
      const got = int(a.got, 0, a.n, 0), set = int(a.set, 0, got, 0);
      const t = int(a.t, 0, set < got ? FEED_TT - 1 : set === a.n ? SET_TT : 0, 0);
      return { n: a.n, s: a.s, c: int(a.c, 1, 7, 1), got, set, t, held: set === a.n && t === SET_TT && !!a.held };
    });
    // The lower conveyor: minos for an assembler that still needs them, a gap apart.
    const outs = (Array.isArray(f.out) ? f.out : []).filter((m) => obj(m) && Number.isFinite(m.s) && Number.isInteger(m.k) && m.k >= 0 && m.k < f.asm.length).sort((a, b) => b.s - a.s);
    f.out = [];
    limit = Infinity;
    for (const m of outs) {
      const k = m.k, a = f.asm[k];
      if (a.n - a.got - pending(f, k) <= 0) continue;
      const hop = int(m.h, 0, HOP, 0);
      let s = int(m.s, OUTLET(STORE_COLS - 1), TAP_S[k], 0);
      if (hop > 0) s = TAP_S[k];
      else { if (s > limit) s = limit; if (s < OUTLET(STORE_COLS - 1)) continue; limit = s - GAP; }
      f.out.push({ s, ps: int(m.ps, s - 2 * MINO_V, s, s), k, h: hop > 0 && s === TAP_S[k] ? hop : s === TAP_S[k] ? HOP : 0 });
    }
    // The droppers.
    const drops = Array.isArray(f.drops) ? f.drops : [];
    f.drops = [];
    for (let j = 0; j < f.droppers; j++) {
      const d = obj(drops[j]) ? drops[j] : {};
      const t = int(d.t, 0, dropTicks(f), 0);
      f.drops.push({ t, held: t === dropTicks(f) && !!d.held });
    }
    // The belt: pieces on it in order, a gap apart, from the end.
    const belt = (Array.isArray(f.belt) ? f.belt : []).filter((it) => okShape(it) && Number.isFinite(it.p)).sort((a, b) => b.p - a.p);
    f.belt = [];
    limit = BELT_LEN;
    for (const it of belt) {
      const p = Math.min(Math.max(0, Math.round(it.p)), limit);
      if (p < 0 || p > limit) break;
      const k = int(it.k, 0, ASSEMBLERS - 1, 0), fall = p === ENTRY[k] ? int(it.f, 0, CHUTE, 0) : 0;
      f.belt.push({ n: it.n, s: it.s, c: int(it.c, 1, 7, 1), p, pp: Number.isFinite(it.pp) ? Math.max(0, Math.min(p, Math.round(it.pp))) : p, f: fall, k });
      limit = p - PGAP;
      if (limit < 0) break;
    }
    // Only a piece waiting for room on the belt waits.
    f.asm.forEach((a, k) => { if (a.held && entryFree(f, k)) a.held = false; });
    f.moved = !!f.moved;
    // The board: 18 rows of 27 known cells, no full row unless it is the one flashing; the piece in play where it fits.
    const grid = Array.isArray(f.grid) ? f.grid : [];
    f.grid = [];
    for (let y = 0; y < BOARD_H; y++) {
      const row = typeof grid[y] === 'string' && grid[y].length === BOARD_W ? grid[y] : EMPTY_ROW;
      f.grid.push(Array.from(row, (ch) => (ch === '.' || CELLS.indexOf(ch) >= 0 ? ch : '.')).join(''));
    }
    const fullRows = [];
    for (let y = 0; y < BOARD_H; y++) if (f.grid[y].indexOf('.') < 0) fullRows.push(y);
    f.clr = fullRows.length ? fullRows : null;
    f.ct = fullRows.length ? int(f.ct, 1, CLEAR, CLEAR) : 0;
    const p = f.cur;
    f.cur = null;
    if (!f.ct && okShape(p)) {
      const rs = turns(p.n, p.s), r = int(p.r, 0, rs.length - 1, 0), x = int(p.x, 0, BOARD_W - rs[r].w, 0), y = int(p.y, 0, BOARD_H - rs[r].h, 0);
      const inn = int(p.in, 0, ENTER, 0), g = masks(f.grid);
      if (inn > 0 || fits(g, rs[r], x, y)) {
        const tr = int(p.tr, 0, rs.length - 1, r);
        f.cur = { n: p.n, s: p.s, c: int(p.c, 1, 7, 1), in: inn, r, x, y, ox: int(p.ox, 0, BOARD_W - 1, x), oy: int(p.oy, 0, y, y), tr, tx: int(p.tx, 0, BOARD_W - rs[tr].w, x), t: int(p.t, 0, THINK, 0) };
      }
    }
    f.bank = int(f.bank, 0, 1e15, 0);
    const st = obj(f.stats) ? f.stats : {};
    const fresh = freshStats();
    for (const k of Object.keys(fresh)) {
      if (k === 'bySize') continue;
      if (typeof st[k] !== typeof fresh[k] || (typeof st[k] === 'number' && !(Number.isFinite(st[k]) && st[k] >= 0))) st[k] = fresh[k];
    }
    st.bySize = [0, 1, 2, 3].map((i) => (Array.isArray(st.bySize) && Number.isFinite(st.bySize[i]) && st.bySize[i] >= 0 ? st.bySize[i] : 0));
    for (const k of Object.keys(st)) if (!(k in fresh)) delete st[k];
    f.stats = st;
    f.lastTick = Number.isFinite(f.lastTick) ? f.lastTick : Date.now();
    for (const k of Object.keys(f)) if (!KEYS.includes(k)) delete f[k];
    return f;
  }

  L.Factory = Object.assign({
    VERSION, TUNE, TICK_MS, DROP_TT, FEED_TT, SET_TT, AWAY_TT, STORE_CAP, NAMES, KINDS, GEO, SUB, LINE_SUB,
    paths: { top: TOP, low: LOW, belt: BELT }, at, dropCX, bayCX, colX, cellY,
    TRACK: { GATE, TOP_END, LOW_END, DROP_S, TAP_S, ACROSS, OUTLET, BELT_LEN, BELT_V, ENTRY, SPAWN_X, DROP_FALL, HOP, CHUTE, ENTER, CLEAR },
    Board: { turns, fits, score, options, settle, plan, masks, cellOf, cellChar, cellWorth, EMPTY_ROW, grow, nextPiece },
    create, repair, shapes, flat, storeCap, storeRows, dropTicks, beltV, pileCount, inStore, pending, starved,
    tick, run, step, catchUp, takeLines, linesOf, mood, rates, sell, visit, nextUpgrade, upgrade, levelOf, topOf, maxed,
  }, TUNE);
})(typeof globalThis !== 'undefined' ? globalThis : this);
