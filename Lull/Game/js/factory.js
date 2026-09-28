// Lull — the Factory: one slow line. Up to four presses each form a polyomino every ten minutes (a tetromino, a
// pentomino, a hexomino, a heptomino); a belt carries every piece to a bin four minos wide, so each full row of the
// bin is one line — a quarter line per mino, nothing more. The bin holds a fixed number of rows; when the next piece
// will not fit, the line just waits until you collect. One step() runs it, on screen and for time away alike.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;

  const VERSION = 6;
  const CYCLE = 600;                       // seconds for any press to form one piece
  const MOLDS = [4, 5, 6, 7];              // press k makes (4 + k)-ominoes
  const PRESS_COST = [0, 150, 450, 1200];  // press 1 comes built
  const BIN_ROWS = [12, 24, 48, 72, 108];
  const BIN_COST = [60, 200, 500, 1000];   // levels 1–4
  const BELT = { len: 28, speed: 0.5, gap: 1 };
  // Each press has a bay sized to its pieces (a mold one cell wider than its longest shape): where the bays start on
  // the belt, and how wide each is. A piece drops straight down from its mold, whole cells in from the bay's edge.
  const BAY_X = [0, 5.5, 12, 19.5];
  const BAYS = [5.5, 6.5, 7.5, 8.5];
  const dropX = (k, w) => BAY_X[k] + 0.25 + Math.floor((MOLDS[k] + 1 - w) / 2);
  const SUB = 0.25;                        // the model's sub-step, in seconds
  const START_P = 0.75;                    // a new factory's first piece is nearly formed
  const PAY = 0.25;                        // lines per mino (display only: the bin pays whole rows)
  const MAX_AWAY = 30 * 86400;
  const NAMES = { 4: 'Tetromino', 5: 'Pentomino', 6: 'Hexomino', 7: 'Heptomino' };
  const EPS = 1e-9;

  // ---- shapes ---------------------------------------------------------------------------------------------------

  /** A shape lying flat: turned so it is at least as wide as tall, then normalised. */
  function flat(cells) {
    const b = Pieces.boundsOf(cells);
    if (b.h > b.w) cells = cells.map(([x, y]) => [y, -x]);
    return Pieces.normalize(cells);
  }

  const shapeCache = {};
  /** Every free n-omino, lying flat, in a fixed order (5, 12, 35, 108 for n = 4…7). Each carries its w and h. */
  function shapes(n) {
    if (!shapeCache[n]) shapeCache[n] = Pieces.freePolyominoes(n).map(flat).map((c) => { const b = Pieces.boundsOf(c); c.w = b.w; c.h = b.h; return c; });
    return shapeCache[n];
  }

  /** Whether a shape encloses an empty cell: flood the outside of its box (plus a margin) and see what is left. */
  function hasHole(cells) {
    const b = Pieces.boundsOf(cells), W = b.w + 2, H = b.h + 2;
    const solid = new Set(cells.map(([x, y]) => (x - b.minX + 1) + ',' + (y - b.minY + 1)));
    const seen = new Set(['0,0']), stack = [[0, 0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || solid.has(k)) continue;
        seen.add(k); stack.push([nx, ny]);
      }
    }
    return seen.size + solid.size < W * H;
  }
  const HOLE = shapes(7).findIndex(hasHole);

  // Conventional names for the tetrominoes and pentominoes; the bigger ones go by number.
  const LETTERS = {};
  for (const id of ['I', 'O', 'T', 'S', 'L']) LETTERS[Pieces.freeKey(Pieces.TYPES[id].rots[0])] = id + '-tetromino';
  for (const id of Pieces.PENTOMINOES) LETTERS[Pieces.freeKey(Pieces.TYPES[id].rots[0])] = id.replace(/\d/, '') + '-pentomino';
  function shapeName(n, s) {
    const c = shapes(n)[s];
    if (!c) return NAMES[n] || '';
    return LETTERS[Pieces.freeKey(c)] || NAMES[n] + ' #' + (s + 1);
  }

  // ---- the factory ------------------------------------------------------------------------------------------------

  function freshStats() {
    return {
      minos: 0, pieces: 0, byPress: [0, 0, 0, 0], lines: 0, collects: 0, best: 0,
      days: 0, lastDay: '', away: 0, fullMs: 0, spent: 0, holeFree: false,
      seen: { 5: '0'.repeat(12), 6: '0'.repeat(35), 7: '0'.repeat(108) },
    };
  }

  /** The next piece a press forms: its pinned mold, or any shape (seeded by the factory and a serial number). */
  function startPiece(f, k, m) {
    const n = MOLDS[k];
    f.serial++;
    m.s = m.pin >= 0 ? m.pin : new RNG(f.seed + ':' + f.serial).int(shapes(n).length);
    m.c = 1 + (m.s % 7); // one colour per shape, so the bin's strata mean something
    m.p = 0; m.held = false;
    return m;
  }

  function create() {
    const f = {
      v: VERSION, seed: (Math.random() * 4294967296) >>> 0, serial: 0,
      presses: 1, binLevel: 0, bin: '', molds: [], belt: [],
      lastTick: Date.now(), stats: freshStats(),
    };
    const m = startPiece(f, 0, { pin: -1 });
    m.p = START_P;
    f.molds.push(m);
    return f;
  }

  const capacity = (f) => BIN_ROWS[f.binLevel] * 4;
  /** Minos an hour: every built press finishes one piece a cycle, whatever its size. */
  function perHour(f) { let m = 0; for (let k = 0; k < f.presses; k++) m += (3600 / CYCLE) * MOLDS[k]; return m; }
  const widthOf = (it) => shapes(it.n)[it.s].w;
  /** The head piece is waiting at the bin's mouth and does not fit. */
  function isFull(f) {
    const it = f.belt[0];
    return !!it && it.x + widthOf(it) >= BELT.len - EPS && f.bin.length + it.n > capacity(f);
  }
  /** Seconds until the bin is full at the current rate (0 when the line already waits). */
  function timeToFull(f) {
    if (isFull(f)) return 0;
    const r = perHour(f);
    return r ? Math.max(0, capacity(f) - f.bin.length) / r * 3600 : Infinity;
  }
  /** What the tiles show. `full` is the looser, on-screen sense: the head waits, or not even a tetromino fits. */
  function status(f) {
    const cap = capacity(f), len = f.bin.length;
    return { cap, len, lines: Math.floor(len / 4), loose: len % 4, waiting: isFull(f), full: isFull(f) || len > cap - 4, perHour: perHour(f), toFull: timeToFull(f) };
  }

  // ---- running ----------------------------------------------------------------------------------------------------

  /** One sub-step of h seconds. Events go to `out` when given; `away` marks minos made in catch-up. Returns moved. */
  function tick(f, h, out, away) {
    const cap = capacity(f), belt = f.belt;
    const wasFull = isFull(f);
    let moved = false;
    // Presses form their pieces a mino at a time, and drop them when the belt below is clear.
    for (let k = 0; k < f.presses; k++) {
      const m = f.molds[k], n = MOLDS[k];
      if (!m.held) {
        const before = Math.floor(m.p * n + EPS);
        m.p = Math.min(1, m.p + h / CYCLE);
        const after = Math.floor(m.p * n + EPS);
        if (out) for (let i = before; i < after; i++) out.push({ kind: 'mino', k });
      }
      if (m.p >= 1 - EPS) {
        const c = shapes(n)[m.s], x0 = dropX(k, c.w);
        const clear = !belt.some((it) => it.x < x0 + c.w + 1 - EPS && it.x + widthOf(it) > x0 - 1 + EPS);
        if (clear) {
          const item = { n, s: m.s, c: m.c, x: x0, u: m.pin < 0 ? 1 : 0 };
          let i = 0;
          while (i < belt.length && belt[i].x > x0) i++;
          belt.splice(i, 0, item);
          moved = true;
          if (out) out.push({ kind: 'drop', k, item, x: x0 });
          startPiece(f, k, m);
        } else if (!m.held) {
          m.held = true;
          if (out) out.push({ kind: 'hold', k });
        }
      }
    }
    // The belt moves head first; each piece stops a gap behind the one ahead, and never slides back.
    let limit = BELT.len;
    for (const it of belt) {
      const w = widthOf(it), to = Math.max(it.x, Math.min(it.x + BELT.speed * h, limit - w));
      if (to > it.x + EPS) moved = true;
      it.x = to;
      limit = it.x - BELT.gap;
    }
    // The head piece tips into the bin if there is room for all of it.
    const it = belt[0];
    if (it && it.x + widthOf(it) >= BELT.len - EPS && f.bin.length + it.n <= cap) {
      belt.shift();
      f.bin += it.c.toString(16).repeat(it.n);
      const st = f.stats;
      st.minos += it.n; st.pieces++; st.byPress[it.n - 4]++;
      if (st.seen[it.n]) st.seen[it.n] = st.seen[it.n].slice(0, it.s) + '1' + st.seen[it.n].slice(it.s + 1);
      if (it.n === 7 && it.s === HOLE && it.u) st.holeFree = true;
      if (away) st.away += it.n;
      moved = true;
      if (out) out.push({ kind: 'enter', item: it });
    }
    const full = isFull(f);
    if (full) f.stats.fullMs += h * 1000;
    if (full && !wasFull && out) out.push({ kind: 'full' });
    return moved;
  }

  /** Runs the line for dt seconds in sub-steps; returns what happened, for sounds and pictures. */
  function step(f, dt) {
    const out = [];
    let rem = dt > 0 ? dt : 0;
    while (rem > EPS) { const h = Math.min(SUB, rem); tick(f, h, out, false); rem -= h; }
    return out;
  }

  /** Nothing can change any more: every press holds and the head waits at a full bin. */
  function stalled(f) { return f.molds.every((m) => m.held) && isFull(f); }

  /**
   * Time away, replayed with the same sub-steps in one-second slices, stopping once the line has stalled (the rest
   * is only waiting). The bin is the only cap, so it makes exactly what watching would have.
   */
  function catchUp(f, now) {
    if (!(now >= f.lastTick)) { f.lastTick = now; return null; } // the clock went back: start from here
    const gap = Math.min(MAX_AWAY, (now - f.lastTick) / 1000);
    f.lastTick = now;
    if (gap <= 0) return null;
    const m0 = f.stats.minos;
    let t = 0;
    while (t < gap) {
      const h = Math.min(1, gap - t);
      let moved = false;
      for (let r = h; r > EPS; r -= SUB) moved = tick(f, Math.min(SUB, r), null, true) || moved;
      t += h;
      if (!moved && stalled(f)) { f.stats.fullMs += (gap - t) * 1000; break; }
    }
    return { seconds: gap, minos: f.stats.minos - m0, lines: Math.floor(f.bin.length / 4), full: isFull(f) };
  }

  /** Seconds until the bin holds `minos`, found by running a copy of the line (Infinity past maxS or a stall). */
  function eta(f, minos, maxS) {
    if (f.bin.length >= minos) return 0;
    const g = JSON.parse(JSON.stringify(f));
    for (let t = 0; t < (maxS || 7200); t++) {
      for (let r = 0; r < 4; r++) tick(g, SUB, null, false);
      if (g.bin.length >= minos) return t + 1;
      if (stalled(g)) return Infinity;
    }
    return Infinity;
  }

  // ---- collecting and building ------------------------------------------------------------------------------------

  /** Takes every full row (one line each); the loose minos stay behind as the new bottom row. */
  function collect(f, today) {
    const n = Math.floor(f.bin.length / 4);
    if (!n) return null;
    const taken = f.bin.slice(0, n * 4);
    f.bin = f.bin.slice(n * 4);
    const st = f.stats;
    st.lines += n; st.collects++; st.best = Math.max(st.best, n);
    const day = today || L.dateKey();
    if (day !== st.lastDay) { st.days++; st.lastDay = day; }
    return { collected: n, loose: f.bin.length, taken };
  }

  /** What the next press or bin costs and what it gives ({ cost, to }), or null at the top. */
  function nextUpgrade(f, kind) {
    if (kind === 'press') return f.presses < MOLDS.length ? { cost: PRESS_COST[f.presses], to: MOLDS[f.presses] } : null;
    if (kind === 'bin') return f.binLevel < BIN_ROWS.length - 1 ? { cost: BIN_COST[f.binLevel], to: BIN_ROWS[f.binLevel + 1] } : null;
    return null;
  }

  /** Builds the next press or bin (the caller has already taken the lines). */
  function upgrade(f, kind) {
    const u = nextUpgrade(f, kind);
    if (!u) return false;
    if (kind === 'press') { f.molds.push(startPiece(f, f.presses, { pin: -1 })); f.presses++; }
    else f.binLevel++;
    f.stats.spent += u.cost;
    return true;
  }

  /** Pins a press's mold to one shape (or -1 for any). The piece in progress keeps its shape; pay never changes. */
  function setPin(f, k, s) {
    const m = f.molds[k];
    if (!m || !(s === -1 || (Number.isInteger(s) && s >= 0 && s < shapes(MOLDS[k]).length))) return false;
    m.pin = s;
    return true;
  }

  const seenCount = (f, n) => (f.stats.seen[n] || '').split('1').length - 1;

  /** Lines to the nearest quarter, as a decimal with no trailing zeros: 13.5 → "13.5", 0.75 → "0.75", 1200 → "1,200". */
  function quarters(x) {
    const q = Math.round(x * 4), w = Math.floor(q / 4), r = ['', '.25', '.5', '.75'][q % 4];
    return String(w).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + r;
  }

  // ---- saves ------------------------------------------------------------------------------------------------------

  /** A saved factory put right: counts in range, molds and belt valid, the bin within capacity, every stat present. */
  function repair(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return create();
    const int = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
    f.seed = Number.isFinite(f.seed) ? f.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    f.serial = int(f.serial, 0, 1e12, 0);
    f.presses = int(f.presses, 1, 4, 1);
    f.binLevel = int(f.binLevel, 0, 4, 0);
    const molds = Array.isArray(f.molds) ? f.molds : [];
    f.molds = [];
    for (let k = 0; k < f.presses; k++) {
      const n = MOLDS[k], m = molds[k] && typeof molds[k] === 'object' ? molds[k] : {};
      if (!(Number.isInteger(m.pin) && m.pin >= 0 && m.pin < shapes(n).length)) m.pin = -1;
      if (Number.isInteger(m.s) && m.s >= 0 && m.s < shapes(n).length) {
        m.c = 1 + (m.s % 7);
        m.p = Number.isFinite(m.p) ? Math.min(1, Math.max(0, m.p)) : 0;
        m.held = !!m.held && m.p >= 1; // only a finished piece can wait
      } else startPiece(f, k, m);
      f.molds.push({ p: m.p, s: m.s, c: m.c, held: m.held, pin: m.pin });
    }
    const belt = (Array.isArray(f.belt) ? f.belt : []).filter((it) => it && MOLDS.indexOf(it.n) >= 0 && Number.isInteger(it.s) && it.s >= 0 && it.s < shapes(it.n).length && Number.isFinite(it.x));
    belt.sort((a, b) => b.x - a.x);
    f.belt = [];
    let limit = BELT.len;
    for (const it of belt) {
      const x = Math.min(Math.max(0, it.x), limit - widthOf(it));
      if (x < 0) continue; // no room left on the belt: that piece is gone
      f.belt.push({ n: it.n, s: it.s, c: 1 + (it.s % 7), x, u: it.u ? 1 : 0 });
      limit = x - BELT.gap;
    }
    f.bin = (typeof f.bin === 'string' ? f.bin.toLowerCase().replace(/[^0-9a-f]/g, '') : '').slice(0, capacity(f));
    const st = f.stats && typeof f.stats === 'object' ? f.stats : {};
    const fresh = freshStats();
    for (const k of Object.keys(fresh)) {
      if (k === 'seen' || k === 'byPress') continue;
      if (typeof st[k] !== typeof fresh[k] || (typeof st[k] === 'number' && !(Number.isFinite(st[k]) && st[k] >= 0))) st[k] = fresh[k];
    }
    st.byPress = [0, 1, 2, 3].map((i) => (Array.isArray(st.byPress) && Number.isFinite(st.byPress[i]) ? st.byPress[i] : 0));
    const seen = st.seen && typeof st.seen === 'object' ? st.seen : {};
    st.seen = {};
    for (const n of [5, 6, 7]) {
      const len = shapes(n).length, s = typeof seen[n] === 'string' ? seen[n].replace(/[^01]/g, '0') : '';
      st.seen[n] = (s + '0'.repeat(len)).slice(0, len);
    }
    f.stats = st;
    f.lastTick = Number.isFinite(f.lastTick) ? f.lastTick : Date.now();
    f.v = VERSION;
    return f;
  }

  L.Factory = {
    VERSION, CYCLE, MOLDS, PRESS_COST, BIN_ROWS, BIN_COST, BELT, BAY_X, BAYS, dropX, SUB, START_P, PAY, NAMES, HOLE,
    create, repair, shapes, flat, hasHole, capacity, perHour, timeToFull, isFull, status, collect, upgrade, nextUpgrade,
    setPin, step, catchUp, eta, shapeName, seenCount, quarters, widthOf,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
