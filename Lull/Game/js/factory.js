// Lull — the Factory: a slow production chain. Stamp heads stamp single minos onto a top belt, which carries them into
// a store of raw minos; up to four presses draw minos from the store, one at a time, and assemble a polyomino each
// (a tetromino, a pentomino, a hexomino, a heptomino); a belt carries every piece to a lift, which carries it up the
// shipping corridor into a crate, and every four minos in the crate are one line — a quarter line per mino, nothing
// more. Every stage waits, and nothing is lost, when the next one is full or the one before is empty. The model runs
// in whole ticks (a quarter second each) on an integer clock, so the line on screen and the line replayed for time
// away are the same line, whatever slices the time comes in.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;

  const VERSION = 7;
  const deep = (o) => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') deep(o[k]); return Object.freeze(o); };

  /**
   * Every number of the factory, in one place. The first group is bound to the scene (js/factoryview.js draws belts,
   * stores and crates of exactly these sizes): a rebalance may lower STORE_ROWS (never above 12) but leave the rest.
   * The second group is the economy, free to retune.
   */
  const TUNE = deep({
    // ---- geometry-bound
    TICK: 0.25,                             // seconds a tick; the clock itself is integer milliseconds (f.acc)
    MOLDS: [4, 5, 6, 7],                    // press k assembles (4 + k)-ominoes
    BELT: { len: 28, speed: 0.5, gap: 1 },  // the assembly belt (cells, cells a second): 0.125 a tick
    TOP: { len: 26, speed: 0.5, gap: 1 },   // the top belt, carrying raw minos (one cell wide)
    STAMP_X: [2, 8, 15, 23],                // where each stamp head sets its mino on the top belt (over the bays)
    STORE_COLS: 27,
    STORE_ROWS: [4, 8, 12],                 // the store's sizes: 108, 216, 324 minos
    LIFT: { len: 10, speed: 0.125, gap: 1.5 },// the corridor lift, in model rows; a piece rides flat: its spacing is its flat width + gap.
                                            // A slow ride (80 s), so the conveyor mostly carries something: its pace, not the line's
    CRATE_COLS: [4, 6, 8, 10, 12],
    CRATE_ROWS: [12, 16, 24, 32, 40],       // 48, 96, 192, 320, 480 minos: 12, 24, 48, 80, 120 lines
    // ---- the economy
    CYCLE: 600,                             // seconds a press takes to assemble one piece, whatever its size
    STAMP_T: 100,                           // seconds a stamp head takes per mino (36 an hour)
    STAMP_COST: [0, 100, 300, 800],         // stamp heads 2–4 (the first comes built)
    STORE_COST: [0, 120, 400],              // store sizes 2–3
    PRESS_COST: [0, 150, 450, 1200],        // presses 2–4
    CRATE_COST: [60, 200, 500, 1000],       // crate sizes 2–5
    PAY: 0.25,                              // lines a mino shipped (Collect pays whole lines of four)
    START_STORE: 8,                         // raw minos a new factory's store holds
    START_STAMP_T: 200,                     // ticks into its first mino, a new factory's stamp head
    START_PRESS: { got: 3, t: 1800 },       // a new factory's first piece: minos fed, ticks along (three quarters)
    MAX_AWAY: 30 * 86400,                   // seconds of time away replayed at most
    RAW: 8,                                 // the palette slot raw minos are drawn in (the well's garbage grey)
  });
  const { TICK, MOLDS, BELT, TOP, STAMP_X, STORE_COLS, STORE_ROWS, LIFT, CRATE_COLS, CRATE_ROWS, CYCLE, STAMP_T, STAMP_COST,
    STORE_COST, PRESS_COST, CRATE_COST, PAY, START_STORE, START_STAMP_T, START_PRESS, MAX_AWAY } = TUNE;

  const TICK_MS = Math.round(TICK * 1000);            // 250
  const CYCLE_T = Math.round(CYCLE / TICK);           // 2400 ticks a piece
  const STAMP_TT = Math.round(STAMP_T / TICK);        // 400 ticks a raw mino
  const BELT_STEP = BELT.speed * TICK, TOP_STEP = TOP.speed * TICK, LIFT_STEP = LIFT.speed * TICK; // 0.125, 0.125, 0.03125: exact
  // Each press has a bay sized to its pieces (a mold one cell wider than its longest shape): where the bays start on
  // the belt, and how wide each is. A piece drops straight down from its mold, whole cells in from the bay's edge.
  const BAY_X = [0, 5.5, 12, 19.5];
  const BAYS = [5.5, 6.5, 7.5, 8.5];
  const dropX = (k, w) => BAY_X[k] + 0.25 + Math.floor((MOLDS[k] + 1 - w) / 2);
  const NAMES = { 4: 'Tetromino', 5: 'Pentomino', 6: 'Hexomino', 7: 'Heptomino' };

  /** The tick at which mino i of an n-mino piece is fed (and mino i - 1 is set): the minos spread evenly over a cycle. */
  const BT = {};
  for (const n of MOLDS) { BT[n] = []; for (let i = 0; i <= n; i++) BT[n].push(Math.floor((CYCLE_T * i) / n)); }
  const B = (n, i) => BT[n][i];

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
  /** A piece's flat width: its length on the belt, and the room (with the gap) it takes on the lift. */
  const widthOf = (it) => shapes(it.n)[it.s].w;

  // ---- the factory ------------------------------------------------------------------------------------------------

  function freshStats() {
    return {
      minos: 0, made: 0, fed: 0, pieces: 0, byPress: [0, 0, 0, 0], lines: 0, collects: 0, best: 0,
      days: 0, lastDay: '', away: 0, fullMs: 0, starveMs: 0, spent: 0, holeFree: false,
      seen: { 5: '0'.repeat(12), 6: '0'.repeat(35), 7: '0'.repeat(108) },
    };
  }

  /** The next piece a press assembles: its pinned mold, or any shape (seeded by the factory and a serial number). */
  function startPiece(f, k, m) {
    const n = MOLDS[k];
    f.serial++;
    m.s = m.pin >= 0 ? m.pin : new RNG(f.seed + ':' + f.serial).int(shapes(n).length);
    m.c = 1 + (m.s % 7); // one colour per shape, so the crate's strata mean something
    m.u = m.pin < 0 ? 1 : 0; // chosen freely (not pinned): read when the shape is chosen, not when it drops
    m.got = 0; m.t = 0; m.held = false;
    return m;
  }

  function create() {
    const f = {
      v: VERSION, seed: (Math.random() * 4294967296) >>> 0, serial: 0, acc: 0, lastTick: Date.now(),
      stampers: 1, storeLevel: 0, presses: 1, crateLevel: 0,
      stamps: [{ t: START_STAMP_T, held: false }], top: [], store: START_STORE, q: [],
      molds: [], belt: [], lift: [], crate: '', stats: freshStats(),
    };
    const m = startPiece(f, 0, { pin: -1 });
    m.got = START_PRESS.got; m.t = START_PRESS.t;
    f.molds.push(m);
    // The minos a new factory comes with count as stamped (and those in its first mold as fed), so every mino made is
    // always somewhere along the chain, or collected.
    f.stats.made = START_STORE + START_PRESS.got; f.stats.fed = START_PRESS.got;
    return f;
  }

  const storeCapAt = (l) => STORE_COLS * STORE_ROWS[l];
  const storeCap = (f) => storeCapAt(f.storeLevel);
  /** A crate size's capacity, in minos (columns by rows), and in lines. */
  const crateMinos = (l) => CRATE_COLS[l] * CRATE_ROWS[l];
  const crateLines = (l) => crateMinos(l) * PAY;
  const capacity = (f) => crateMinos(f.crateLevel);
  /** Raw minos an hour the stamp heads make, and the presses use (every press uses its size a cycle). */
  const supply = (f) => f.stampers * (3600 / STAMP_T);
  function demand(f) { let m = 0; for (let k = 0; k < f.presses; k++) m += (3600 / CYCLE) * MOLDS[k]; return m; }
  /** Minos an hour shipped, running freely: the slower of the two ends. */
  const perHour = (f) => Math.min(supply(f), demand(f));

  /** The head of the lift waits at the station and does not fit in the crate. */
  function isFull(f) {
    const h = f.lift[0];
    return !!h && h.y >= LIFT.len && f.crate.length + h.n > capacity(f);
  }
  /** The top belt's head waits at the end of the belt, and the store is full. */
  function storeWaits(f) {
    const h = f.top[0];
    return !!h && h.x + 1 >= TOP.len && f.store >= storeCap(f);
  }

  // ---- one tick ---------------------------------------------------------------------------------------------------

  /** Tries to drop a press's finished piece onto the belt (below its mold, a cell clear either side). Returns whether
   *  anything changed. */
  function tryDrop(f, k, m, out) {
    const n = MOLDS[k], c = shapes(n)[m.s], x0 = dropX(k, c.w), belt = f.belt;
    for (let i = 0; i < belt.length; i++) {
      const it = belt[i];
      if (it.x < x0 + c.w + 1 && it.x + widthOf(it) > x0 - 1) {
        if (m.held) return false;
        m.held = true;
        if (out) out.push({ kind: 'hold', k });
        return true;
      }
    }
    const item = { n, s: m.s, c: m.c, x: x0, px: x0, u: m.u ? 1 : 0 };
    let i = 0;
    while (i < belt.length && belt[i].x > x0) i++;
    belt.splice(i, 0, item);
    if (out) out.push({ kind: 'drop', k, item, x: x0 });
    startPiece(f, k, m);
    return true;
  }

  /**
   * One tick, downstream first (so a place freed early in a tick is taken later in the same one): the lift, the belt,
   * the presses, the top belt, the stamp heads. Events go to `out` when given; `away` marks minos shipped in catch-up.
   * Returns whether anything changed (the time-kept statistics aside): a tick that changes nothing is a fixed point.
   */
  function tick(f, out, away) {
    const st = f.stats, lift = f.lift, belt = f.belt, top = f.top, q = f.q, cap = capacity(f);
    const wasFull = out ? isFull(f) : false, wasStore = out ? storeWaits(f) : false;
    let ch = false;
    // 1. The lift: head first, each piece a gap under the one above, never backwards. The head ships at the top.
    let limit = LIFT.len;
    for (let i = 0; i < lift.length; i++) {
      const it = lift[i];
      it.py = it.y;
      const to = Math.min(it.y + LIFT_STEP, limit);
      if (to > it.y) { it.y = to; ch = true; }
      if (i + 1 < lift.length) limit = it.y - widthOf(lift[i + 1]) - LIFT.gap;
    }
    const lh = lift[0];
    if (lh && lh.y >= LIFT.len && f.crate.length + lh.n <= cap) {
      lift.shift();
      f.crate += lh.c.toString(16).repeat(lh.n);
      st.minos += lh.n; st.pieces++; st.byPress[lh.n - 4]++;
      if (st.seen[lh.n]) st.seen[lh.n] = st.seen[lh.n].slice(0, lh.s) + '1' + st.seen[lh.n].slice(lh.s + 1);
      if (lh.n === 7 && lh.s === HOLE && lh.u) st.holeFree = true;
      if (away) st.away += lh.n;
      ch = true;
      if (out) out.push({ kind: 'ship', item: lh });
    }
    // 2. The belt: head first, a gap behind the piece ahead. The head slides onto the lift once there is room.
    limit = BELT.len;
    for (let i = 0; i < belt.length; i++) {
      const it = belt[i];
      it.px = it.x;
      const to = Math.min(it.x + BELT_STEP, limit - widthOf(it));
      if (to > it.x) { it.x = to; ch = true; }
      limit = it.x - BELT.gap;
    }
    const bh = belt[0];
    if (bh) {
      const w = widthOf(bh), last = lift[lift.length - 1];
      if (bh.x + w >= BELT.len && (!last || last.y >= w + LIFT.gap)) {
        belt.shift();
        const item = { n: bh.n, s: bh.s, c: bh.c, u: bh.u, y: 0, py: 0 };
        lift.push(item);
        ch = true;
        if (out) out.push({ kind: 'lift', item });
      }
    }
    // 3. The presses. (a) One at the start of a mino joins the queue for one; (b) the store feeds the queue, first come
    // first served; (c) the rest assemble: a mino is set at each boundary, and a finished piece drops (or waits).
    const joined0 = q.length;
    for (let k = 0; k < f.presses; k++) {
      const m = f.molds[k], n = MOLDS[k];
      if (!m.held && m.got < n && m.t === B(n, m.got) && q.indexOf(k) < 0) { q.push(k); ch = true; }
    }
    const joined = out && q.length > joined0 ? q.slice(joined0) : null;
    while (q.length && f.store > 0) {
      const k = q.shift();
      f.store--; f.molds[k].got++; st.fed++;
      ch = true;
      if (out) out.push({ kind: 'feed', k });
    }
    if (joined) for (let i = 0; i < joined.length; i++) if (q.indexOf(joined[i]) >= 0) out.push({ kind: 'starve', k: joined[i] });
    for (let k = 0; k < f.presses; k++) {
      const m = f.molds[k], n = MOLDS[k];
      if (m.held) { if (tryDrop(f, k, m, out)) ch = true; continue; }
      if (q.indexOf(k) >= 0) continue;
      m.t++; ch = true;
      if (m.t === (m.got < n ? B(n, m.got) : CYCLE_T)) {
        if (out) out.push({ kind: 'mino', k });
        if (m.got === n) tryDrop(f, k, m, out);
      }
    }
    if (q.length && f.store === 0) st.starveMs += TICK_MS;
    // 4. The top belt: head first, a cell between minos. The head rolls into the store while it has room.
    limit = TOP.len;
    for (let i = 0; i < top.length; i++) {
      const it = top[i];
      it.px = it.x;
      const to = Math.min(it.x + TOP_STEP, limit - 1);
      if (to > it.x) { it.x = to; ch = true; }
      limit = it.x - TOP.gap;
    }
    const th = top[0];
    if (th && th.x + 1 >= TOP.len && f.store < storeCap(f)) {
      top.shift();
      f.store++;
      ch = true;
      if (out) out.push({ kind: 'store' });
    }
    // 5. The stamp heads, in order: each sets a mino on the top belt every STAMP_T, with a cell clear either side of it,
    // or holds it until there is room.
    for (let j = 0; j < f.stampers; j++) {
      const s = f.stamps[j];
      if (!s.held) { s.t++; ch = true; }
      if (s.t < STAMP_TT) continue;
      const sx = STAMP_X[j];
      let clear = true;
      for (let i = 0; i < top.length; i++) if (top[i].x < sx + 2 && top[i].x + 1 > sx - 1) { clear = false; break; }
      if (clear) {
        const item = { x: sx, px: sx };
        let i = 0;
        while (i < top.length && top[i].x > sx) i++;
        top.splice(i, 0, item);
        s.t = 0; s.held = false; st.made++;
        ch = true;
        if (out) out.push({ kind: 'stamp', j, item });
      } else if (!s.held) {
        s.held = true; ch = true;
        if (out) out.push({ kind: 'stampHold', j });
      }
    }
    const full = isFull(f);
    if (full) st.fullMs += TICK_MS;
    if (out) {
      if (full && !wasFull) out.push({ kind: 'full' });
      if (!wasStore && storeWaits(f)) out.push({ kind: 'storeFull' });
    }
    return ch;
  }

  // ---- running time -----------------------------------------------------------------------------------------------

  /**
   * Adds ms (whole milliseconds) to the factory's clock and runs every whole tick it now holds. Once a tick changes
   * nothing, the line is at a fixed point (it waits at a full crate, all the way back): the rest is only waiting, so
   * its time is counted and the run stops there — exactly what running on would have given.
   */
  function run(f, ms, out, away) {
    ms = ms > 0 ? Math.round(ms) : 0;
    f.acc += ms;
    let n = Math.floor(f.acc / TICK_MS);
    f.acc -= n * TICK_MS;
    while (n > 0) {
      n--;
      if (!tick(f, out, away)) {
        if (n > 0) {
          if (isFull(f)) f.stats.fullMs += n * TICK_MS;
          if (f.q.length && f.store === 0) f.stats.starveMs += n * TICK_MS;
        }
        break;
      }
    }
    return out;
  }

  /** Runs the line for dt seconds (on screen); returns what happened, for sounds and pictures. */
  function step(f, dt) { return run(f, Math.round((dt > 0 ? dt : 0) * 1000), []); }

  /** Time away: replayed with the same ticks as on screen, up to MAX_AWAY. A clock set back starts over from now. */
  function catchUp(f, now) {
    if (!(now >= f.lastTick)) { f.lastTick = now; return null; }
    const ms = Math.min(MAX_AWAY * 1000, Math.round(now - f.lastTick));
    f.lastTick = now;
    if (ms <= 0) return null;
    const st = f.stats, m0 = st.minos, made0 = st.made;
    run(f, ms, null, true);
    return { seconds: ms / 1000, made: st.made - made0, minos: st.minos - m0, lines: Math.floor(f.crate.length / 4), full: isFull(f) };
  }

  /** Seconds until the crate holds `minos`, found by running a copy of the line tick by tick (Infinity past maxS, or
   *  at a fixed point). */
  function eta(f, minos, maxS) {
    if (f.crate.length >= minos) return 0;
    const g = JSON.parse(JSON.stringify(f)), n = Math.round((maxS || 7200) / TICK);
    for (let i = 1; i <= n; i++) {
      if (!tick(g, null, false)) return Infinity;
      if (g.crate.length >= minos) return i * TICK;
    }
    return Infinity;
  }

  /** Seconds until the crate is full, in closed form (0 while it is): what is left to fill arrives at the presses' rate
   *  while the store and the top belt last, and at the stamp heads' rate after that. */
  function timeToFull(f) {
    if (isFull(f)) return 0;
    let pipe = 0;
    for (let k = 0; k < f.presses; k++) pipe += f.molds[k].got;
    for (const it of f.belt) pipe += it.n;
    for (const it of f.lift) pipe += it.n;
    const R = capacity(f) - f.crate.length - pipe, S = supply(f), D = demand(f);
    if (R <= 0) return 0;
    if (!D) return Infinity;
    const stock = f.store + f.top.length;
    let hrs = R / D;
    if (D > S) {
      const t1 = stock / (D - S);
      if (R > D * t1) hrs = S > 0 ? t1 + (R - D * t1) / S : Infinity;
    }
    return hrs * 3600;
  }

  /** Where the line waits, stage by stage (what the floor shows, and the tooltips say). */
  function waits(f) {
    return {
      stamps: f.stamps.map((s) => !!s.held), storeFull: storeWaits(f), storeEmpty: f.store === 0 && f.q.length > 0,
      starving: f.store === 0 ? f.q.slice() : [], pressHeld: f.molds.map((m) => !!m.held), crateFull: isFull(f),
    };
  }

  /** What the tiles show. `full` is the looser, on-screen sense: the head waits, or not even a tetromino fits. */
  function status(f) {
    const cap = capacity(f), len = f.crate.length, full = isFull(f);
    return {
      cap, len, lines: Math.floor(len / 4), loose: len % 4, waiting: full, full: full || len > cap - 4, perHour: perHour(f), toFull: timeToFull(f),
      store: f.store, storeCap: storeCap(f), supply: supply(f), demand: demand(f), waits: waits(f),
    };
  }

  // ---- collecting and building ------------------------------------------------------------------------------------

  /** Takes every whole line: the first minos in, four to a line, whatever the crate's width (so a line is not a row, and
   *  pay stays exactly a quarter line a mino). The last 0–3 minos stay behind, loose, at the start of the bottom row. */
  function collect(f, today) {
    const n = Math.floor(f.crate.length / 4);
    if (!n) return null;
    const taken = f.crate.slice(0, n * 4);
    f.crate = f.crate.slice(n * 4);
    const st = f.stats;
    st.lines += n; st.collects++; st.best = Math.max(st.best, n);
    const day = today || L.dateKey();
    if (day !== st.lastDay) { st.days++; st.lastDay = day; }
    return { collected: n, loose: f.crate.length, taken };
  }

  /** What the next of a kind costs and what it changes ({ cost, from, to }: minos an hour for a stamper and a press, the
   *  press's size as n; minos for a store; lines for a crate), or null at the top. */
  function nextUpgrade(f, kind) {
    if (kind === 'stamp') return f.stampers < STAMP_X.length ? { cost: STAMP_COST[f.stampers], from: supply(f), to: supply(f) + 3600 / STAMP_T } : null;
    if (kind === 'store') return f.storeLevel < STORE_ROWS.length - 1 ? { cost: STORE_COST[f.storeLevel + 1], from: storeCapAt(f.storeLevel), to: storeCapAt(f.storeLevel + 1) } : null;
    if (kind === 'press') {
      if (f.presses >= MOLDS.length) return null;
      const n = MOLDS[f.presses], d = demand(f);
      return { cost: PRESS_COST[f.presses], from: d, to: d + (3600 / CYCLE) * n, n };
    }
    if (kind === 'crate') return f.crateLevel < CRATE_ROWS.length - 1 ? { cost: CRATE_COST[f.crateLevel], from: crateLines(f.crateLevel), to: crateLines(f.crateLevel + 1) } : null;
    return null;
  }

  /** Builds the next of a kind (the caller has already taken the lines). */
  function upgrade(f, kind) {
    const u = nextUpgrade(f, kind);
    if (!u) return false;
    if (kind === 'stamp') { f.stamps.push({ t: 0, held: false }); f.stampers++; }
    else if (kind === 'store') f.storeLevel++;
    else if (kind === 'press') { f.molds.push(startPiece(f, f.presses, { pin: -1 })); f.presses++; }
    else f.crateLevel++;
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

  /** A saved factory put right: every count in range, every invariant of the chain held, every stat present. A save of
   *  any other version starts a new factory (there are no migrations). */
  function repair(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f) || f.v !== VERSION) return create();
    const int = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
    const on8 = (v) => Math.round(v * 8) / 8; // positions stay on the belts' eighth-cell grid
    const onLift = (v) => Math.round(v / LIFT_STEP) * LIFT_STEP; // and on the lift's own (a tick's step)
    const okShape = (it) => it && typeof it === 'object' && MOLDS.indexOf(it.n) >= 0 && Number.isInteger(it.s) && it.s >= 0 && it.s < shapes(it.n).length;
    f.seed = Number.isFinite(f.seed) ? f.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    f.serial = int(f.serial, 0, 1e12, 0);
    f.acc = int(f.acc, 0, TICK_MS - 1, 0);
    f.stampers = int(f.stampers, 1, STAMP_X.length, 1);
    f.storeLevel = int(f.storeLevel, 0, STORE_ROWS.length - 1, 0);
    f.presses = int(f.presses, 1, MOLDS.length, 1);
    f.crateLevel = int(f.crateLevel, 0, CRATE_ROWS.length - 1, 0);
    const stamps = Array.isArray(f.stamps) ? f.stamps : [];
    f.stamps = [];
    for (let j = 0; j < f.stampers; j++) {
      const s = stamps[j] && typeof stamps[j] === 'object' ? stamps[j] : {};
      const t = int(s.t, 0, STAMP_TT, 0);
      f.stamps.push({ t, held: t === STAMP_TT }); // a finished mino waits for room (and retries every tick)
    }
    // The top belt: on the belt, a cell apart.
    const top = (Array.isArray(f.top) ? f.top : []).filter((it) => it && Number.isFinite(it.x)).sort((a, b) => b.x - a.x);
    f.top = [];
    let limit = TOP.len;
    for (const it of top) {
      const x = on8(Math.min(Math.max(0, it.x), limit - 1));
      if (x < 0) continue;
      f.top.push({ x, px: x });
      limit = x - TOP.gap;
    }
    f.store = int(f.store, 0, storeCap(f), 0);
    const molds = Array.isArray(f.molds) ? f.molds : [];
    f.molds = [];
    for (let k = 0; k < f.presses; k++) {
      const n = MOLDS[k], m = molds[k] && typeof molds[k] === 'object' ? molds[k] : {};
      if (!(Number.isInteger(m.pin) && m.pin >= 0 && m.pin < shapes(n).length)) m.pin = -1;
      if (Number.isInteger(m.s) && m.s >= 0 && m.s < shapes(n).length) {
        m.c = 1 + (m.s % 7);
        m.got = int(m.got, 0, n, 0);
        m.t = int(m.t, 0, m.got < n ? B(n, m.got) : CYCLE_T, 0);
        // A finished piece waits to drop (and retries every tick); only a finished piece can wait.
        m.held = m.got === n && m.t === CYCLE_T;
        m.u = m.u === 1 ? 1 : 0; // only a shape the press chose freely counts as unpinned
      } else startPiece(f, k, m);
      f.molds.push({ pin: m.pin, s: m.s, c: m.c, u: m.u, got: m.got, t: m.t, held: m.held });
    }
    // The queue: each press once, and only one that waits for a mino.
    const q = Array.isArray(f.q) ? f.q : [];
    f.q = [];
    for (const k of q) {
      const m = Number.isInteger(k) && k >= 0 && k < f.presses ? f.molds[k] : null;
      if (m && !m.held && m.got < MOLDS[k] && m.t === B(MOLDS[k], m.got) && f.q.indexOf(k) < 0) f.q.push(k);
    }
    const belt = (Array.isArray(f.belt) ? f.belt : []).filter((it) => okShape(it) && Number.isFinite(it.x)).sort((a, b) => b.x - a.x);
    f.belt = [];
    limit = BELT.len;
    for (const it of belt) {
      const x = on8(Math.min(Math.max(0, it.x), limit - widthOf(it)));
      if (x < 0) continue; // no room left on the belt: that piece is gone
      f.belt.push({ n: it.n, s: it.s, c: 1 + (it.s % 7), x, px: x, u: it.u ? 1 : 0 });
      limit = x - BELT.gap;
    }
    // The lift: on it, each piece a gap under the one above (a piece with no room left is gone).
    const lift = (Array.isArray(f.lift) ? f.lift : []).filter((it) => okShape(it) && Number.isFinite(it.y)).sort((a, b) => b.y - a.y);
    f.lift = [];
    limit = LIFT.len;
    for (const it of lift) {
      const y = onLift(Math.min(Math.max(0, it.y), limit));
      if (y < 0) break;
      f.lift.push({ n: it.n, s: it.s, c: 1 + (it.s % 7), u: it.u ? 1 : 0, y, py: y });
      const next = lift[f.lift.length];
      if (next) limit = y - widthOf(next) - LIFT.gap;
    }
    f.crate = (typeof f.crate === 'string' ? f.crate.toLowerCase().replace(/[^0-9a-f]/g, '') : '').slice(0, capacity(f));
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

  L.Factory = Object.assign({
    VERSION, TUNE, TICK_MS, CYCLE_T, STAMP_TT, B, BAY_X, BAYS, dropX, NAMES, HOLE,
    create, repair, shapes, flat, hasHole, capacity, crateMinos, crateLines, storeCap, storeCapAt, supply, demand, perHour,
    timeToFull, isFull, storeWaits, waits, status, collect, upgrade, nextUpgrade, setPin, tick, run, step, catchUp, eta,
    shapeName, seenCount, quarters, widthOf,
  }, TUNE);
})(typeof globalThis !== 'undefined' ? globalThis : this);
