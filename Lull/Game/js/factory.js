// Lull — the Factory: two stages and a conveyor. Droppers (one to three) each drop a single mino every few seconds into
// the store; Collect cashes the store's minos in by hand, twenty to a line, and a full store pauses the droppers.
// Assemblers (bought, one to three) take minos from the store one at a time and build a piece (a domino, up to a
// pentomino as they are upgraded), which drops onto the conveyor's entry; the conveyor, a serpentine of up to three
// runs, carries it to the drop-off, which pays it straight into the wallet, more than its minos would fetch by hand.
// While nobody is around (Lull hidden, in the background, or left untouched) the drop-off is closed: pieces wait at the
// end of the belt and back up along it, then the assemblers and the store fill, and the line rests until you return
// and the drop-off pays the backlog. The model runs in whole ticks (a quarter second each) on an integer clock, so the
// line on screen and the line replayed for time away are the same line, whatever slices the time comes in.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;

  const VERSION = 8;
  const deep = (o) => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') deep(o[k]); return Object.freeze(o); };

  /** Every number of the factory, in one place. Prices are lines; times are seconds. */
  const TUNE = deep({
    TICK: 0.25,
    // ---- stage 1: droppers and the store
    DROPPERS: 3,
    DROP_T: [12, 10, 8, 6.5],                 // seconds a mino, each dropper, by speed level
    STORE_CAP: [20, 40, 60, 80],              // minos the store holds, by level
    MPL: 20,                                  // loose minos a line (Collect)
    // ---- stage 2: assemblers
    ASSEMBLERS: 3,
    SIZES: [2, 3, 4, 5],                      // the piece an assembler builds, by size level
    FEED_T: 8,                               // seconds an assembler takes to set each mino
    SET_T: 2,                                 // and to finish a piece once its last mino is in
    // ---- the conveyor
    BELT_T: [20, 13, 8, 5],                   // seconds a slot, by speed level
    BELT_LEN: [8, 16, 24],                    // slots, by length level (the last run; half runs; three full runs)
    RUN: 8,                                   // slots a full run
    // ---- pay: points, forty to a line. A loose mino is 2 (a twentieth of a line); a piece is worth more than its minos.
    PTS: 40,
    LOOSE_PTS: 2,
    PIECE_PTS: { 2: 5, 3: 9, 4: 14, 5: 20 }, // ×1.25, ×1.5, ×1.75, ×2 its loose minos
    // ---- prices (each list: the next level's price)
    COST: {
      dropper: [8, 45],                       // the second and third dropper
      speed: [30, 100, 200],                  // dropper speed levels 1–3
      store: [10, 25, 40],                    // store sizes 2–4
      assembler: [5, 25, 90],                 // the first, second and third assembler
      size: [10, 60, 160],                    // trominoes, tetrominoes, pentominoes
      beltSpeed: [30, 60, 100],                // conveyor speed levels 1–3
      beltLen: [25, 60],                       // conveyor lengths 2–3
    },
    START_STORE: 6,                           // a new factory's store
    START_DROP: 24,                           // ticks into its first mino, a new factory's dropper
    RAW: 8,                                   // the palette slot loose minos are drawn in (the well's garbage grey)
  });
  const { TICK, DROPPERS, DROP_T, STORE_CAP, MPL, ASSEMBLERS, SIZES, FEED_T, SET_T, BELT_T, BELT_LEN, PTS, PIECE_PTS, COST } = TUNE;
  const TICK_MS = Math.round(TICK * 1000);
  const T = (s) => Math.round(s / TICK);
  const DROP_TT = DROP_T.map(T), FEED_TT = T(FEED_T), SET_TT = T(SET_T), BELT_TT = BELT_T.map(T);
  const NAMES = { 2: 'Domino', 3: 'Tromino', 4: 'Tetromino', 5: 'Pentomino' };
  /** The upgrades, in the order the list shows them. */
  const KINDS = ['dropper', 'speed', 'store', 'assembler', 'size', 'beltSpeed', 'beltLen'];

  // ---- shapes -------------------------------------------------------------------------------------------------------

  /** A shape lying flat: turned so it is at least as wide as tall, then normalised. */
  function flat(cells) {
    const b = Pieces.boundsOf(cells);
    if (b.h > b.w) cells = cells.map(([x, y]) => [y, -x]);
    return Pieces.normalize(cells);
  }
  const shapeCache = {};
  /** Every free n-omino, lying flat, in a fixed order (1, 2, 5, 12 for n = 2…5); each carries its w and h. */
  function shapes(n) {
    if (!shapeCache[n]) shapeCache[n] = Pieces.freePolyominoes(n).map(flat).map((c) => { const b = Pieces.boundsOf(c); c.w = b.w; c.h = b.h; return c; });
    return shapeCache[n];
  }

  // ---- the factory --------------------------------------------------------------------------------------------------

  function freshStats() {
    return {
      made: 0, collected: 0, collects: 0, best: 0, days: 0, lastDay: '',
      built: 0, delivered: 0, bySize: [0, 0, 0, 0], paid: 0, spent: 0, smoothMs: 0, backlog: 0,
    };
  }

  /** The next piece an assembler builds: its size, and a shape and colour seeded by the factory and a serial. */
  function startPiece(f, a) {
    const n = SIZES[f.size];
    f.serial++;
    a.n = n;
    a.s = new RNG(f.seed + ':' + f.serial).int(shapes(n).length);
    a.c = 1 + ((f.serial * 3) % 7);
    a.got = 0; a.t = 0; a.held = false;
    return a;
  }

  function create() {
    const f = {
      v: VERSION, seed: (Math.random() * 4294967296) >>> 0, serial: 0, acc: 0, lastTick: Date.now(),
      droppers: 1, speed: 0, storeLevel: 0, size: 0, beltSpeed: 0, beltLen: 0,
      drops: [{ t: TUNE.START_DROP, held: false }], store: TUNE.START_STORE, asm: [], belt: [], bt: 0, moved: false, bank: 0,
      stats: freshStats(),
    };
    f.stats.made = TUNE.START_STORE;
    return f;
  }

  const storeCap = (f) => STORE_CAP[f.storeLevel];
  const beltLen = (f) => BELT_LEN[f.beltLen];
  const dropTicks = (f) => DROP_TT[f.speed];
  const beltTicks = (f) => BELT_TT[f.beltSpeed];
  const pieceLines = (n) => PIECE_PTS[n] / PTS;

  // ---- one tick -----------------------------------------------------------------------------------------------------

  /**
   * One tick, downstream first: the conveyor (a step every BELT_T: the head pays at the end if the drop-off is open,
   * then every piece moves up a slot where there is room), the assemblers, the droppers. `closed`: the drop-off is
   * closed (nobody around). Events go to `out` when given. Returns whether anything changed but the conveyor's clock: a
   * tick that changes nothing is a fixed point (everything waits).
   */
  function tick(f, out, closed) {
    const st = f.stats, belt = f.belt, len = beltLen(f);
    let ch = false;
    // 1. The conveyor.
    if (++f.bt >= beltTicks(f)) {
      f.bt = 0;
      let moved = false;
      const h = belt[0];
      if (h && h.p >= len - 1 && !closed) {
        belt.shift();
        const pts = PIECE_PTS[h.n];
        f.bank += pts; st.paid += pts; st.delivered++; st.bySize[h.n - 2]++;
        moved = true;
        if (out) out.push({ kind: 'pay', item: h, pts });
      }
      let limit = len;
      for (const it of belt) {
        const to = Math.min(it.p + 1, limit - 1);
        if (it.pp !== it.p) { it.pp = it.p; ch = true; }
        if (to > it.p) { it.p = to; moved = true; }
        limit = it.p;
      }
      if (moved || moved !== f.moved) ch = true;
      f.moved = moved;
    }
    // 2. The assemblers: a mino every FEED_T from the store (waiting while it is empty), SET_T to finish, then the piece
    // drops onto the conveyor's entry (waiting while a piece is there).
    for (let k = 0; k < f.asm.length; k++) {
      const a = f.asm[k];
      if (a.got < a.n) {
        if (a.t < FEED_TT) { a.t++; ch = true; }
        if (a.t >= FEED_TT && f.store > 0) {
          f.store--; a.got++; a.t = 0; ch = true;
          if (out) out.push({ kind: 'feed', k });
        }
      } else if (a.t < SET_TT) { a.t++; ch = true; }
      else if (!belt.length || belt[belt.length - 1].p > 0) {
        const item = { n: a.n, s: a.s, c: a.c, p: 0, pp: 0 };
        belt.push(item);
        st.built++;
        if (closed) st.backlog++;
        ch = true;
        if (out) out.push({ kind: 'build', k, item });
        startPiece(f, a);
      } else if (!a.held) { a.held = true; ch = true; }
    }
    // 3. The droppers: a mino every DROP_T into the store, or paused while it is full.
    const cap = storeCap(f), dt = dropTicks(f);
    for (let j = 0; j < f.drops.length; j++) {
      const d = f.drops[j];
      if (d.t < dt) { d.t++; ch = true; }
      if (d.t >= dt) {
        if (f.store < cap) {
          f.store++; d.t = 0; d.held = false; st.made++; ch = true;
          if (out) { out.push({ kind: 'drop', j }); if (f.store === cap) out.push({ kind: 'full' }); }
        } else if (!d.held) { d.held = true; ch = true; }
      }
    }
    // The conveyor's clock only counts as waiting when its next step can change nothing: an empty belt, or one packed
    // to a closed drop-off.
    if (!ch && belt.length) {
      let packed = true;
      for (let i = 0; i < belt.length; i++) if (belt[i].p !== len - 1 - i) { packed = false; break; }
      if (!packed || !closed) ch = true;
    }
    if (!closed && ch && mood(f).mood === 'smooth') st.smoothMs += TICK_MS;
    return ch;
  }

  // ---- running time -------------------------------------------------------------------------------------------------

  /**
   * Adds ms to the factory's clock and runs every whole tick it now holds. Once a tick changes nothing, the line waits
   * all the way back: the rest is only waiting, so the run stops there, its conveyor clock moved on exactly as ticking
   * would have moved it.
   */
  function run(f, ms, out, closed) {
    ms = ms > 0 ? Math.round(ms) : 0;
    f.acc += ms;
    let n = Math.floor(f.acc / TICK_MS);
    f.acc -= n * TICK_MS;
    while (n > 0) {
      n--;
      if (!tick(f, out, closed)) { f.bt = (f.bt + n) % beltTicks(f); break; }
    }
    return out;
  }

  /** Runs the line for dt seconds (closed: nobody around); returns what happened, for sounds and pictures. */
  function step(f, dt, closed) { return run(f, Math.round((dt > 0 ? dt : 0) * 1000), [], !!closed); }

  /** Time away: replayed with the same ticks, the drop-off closed. A clock set back starts over from now. */
  function catchUp(f, now) {
    if (!(now >= f.lastTick)) { f.lastTick = now; return null; }
    const ms = Math.round(now - f.lastTick);
    f.lastTick = now;
    if (ms <= 0) return null;
    const st = f.stats, made0 = st.made, built0 = st.built;
    run(f, ms, null, true);
    return { seconds: ms / 1000, made: st.made - made0, built: st.built - built0, waiting: f.belt.length, store: f.store };
  }

  /** Whole lines the drop-off has paid, taken from its bank (the rest stays, in points). */
  function takeLines(f) {
    const n = Math.floor(f.bank / PTS);
    if (n > 0) f.bank -= n * PTS;
    return n;
  }

  // ---- how the line is doing ----------------------------------------------------------------------------------------

  /**
   * How busy the line is, for the sign on the floor: the share of its machines at work (a dropper not paused; an
   * assembler neither short of minos nor waiting at the entry; the conveyor, while it carries anything, moving), whether something is full or backed up, and one of four moods: smooth (four fifths or more at work), full
   * (something full holds the line up), idle (nothing at work) or working.
   */
  function mood(f) {
    let on = 0, all = 0, held = 0, starved = 0;
    const storeFull = f.store >= storeCap(f);
    for (const d of f.drops) { all++; if (!d.held) on++; }
    for (const a of f.asm) {
      all++;
      if (a.held) held++;
      else if (a.got < a.n && a.t >= FEED_TT && f.store === 0) starved++;
      else on++;
    }
    if (f.asm.length && f.belt.length) { all++; if (f.moved) on++; }
    const busy = all ? on / all : 0;
    const full = (storeFull && f.drops.some((d) => d.held)) || held > 0;
    const m = busy >= 0.8 ? 'smooth' : full ? 'full' : on === 0 ? 'idle' : 'working';
    return { mood: m, busy, full, storeFull, backed: held > 0, starved };
  }

  /** What the line makes running freely: minos an hour from the droppers, pieces an hour (the slowest of assemblers,
   *  minos and conveyor), the lines an hour those pay at the drop-off, and the loose minos left over, in lines. */
  function rates(f) {
    const make = f.drops.length * 3600 / DROP_T[f.speed];
    const n = SIZES[f.size], per = n * FEED_T + SET_T;
    const pieces = f.asm.length ? Math.min(f.asm.length * 3600 / per, make / n, 3600 / BELT_T[f.beltSpeed]) : 0;
    return { make, pieces, auto: pieces * pieceLines(n), loose: (make - pieces * n) / MPL };
  }

  // ---- collecting and building --------------------------------------------------------------------------------------

  /** Cashes the store's loose minos in, twenty to a line; the 0–19 left over stay. */
  function collect(f, today) {
    const n = Math.floor(f.store / MPL);
    if (!n) return null;
    f.store -= n * MPL;
    const st = f.stats;
    st.collected += n; st.collects++; st.best = Math.max(st.best, n);
    const day = today || L.dateKey();
    if (day !== st.lastDay) { st.days++; st.lastDay = day; }
    return { collected: n, left: f.store };
  }

  const LEVEL = { dropper: (f) => f.droppers - 1, speed: (f) => f.speed, store: (f) => f.storeLevel, assembler: (f) => f.asm.length, size: (f) => f.size, beltSpeed: (f) => f.beltSpeed, beltLen: (f) => f.beltLen };
  /** A kind's level now, and its top. */
  const levelOf = (f, kind) => LEVEL[kind](f);
  const topOf = (kind) => COST[kind].length;

  /** The next of a kind: { cost, from, to } in its own terms (droppers, seconds a mino, minos, assemblers, piece size,
   *  seconds a slot, slots), or null at the top. */
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
      case 'beltSpeed': return { cost, from: BELT_T[l], to: BELT_T[l + 1] };
      default: return { cost, from: BELT_LEN[l], to: BELT_LEN[l + 1] };
    }
  }

  /** Builds the next of a kind (the caller has already taken the lines). A longer conveyor keeps every piece the same
   *  distance from the drop-off; a new size is built from each assembler's next piece. */
  function upgrade(f, kind) {
    const u = nextUpgrade(f, kind);
    if (!u) return false;
    if (kind === 'dropper') { f.drops.push({ t: 0, held: false }); f.droppers++; }
    else if (kind === 'speed') f.speed++;
    else if (kind === 'store') f.storeLevel++;
    else if (kind === 'assembler') f.asm.push(startPiece(f, {}));
    else if (kind === 'size') { f.size++; for (const a of f.asm) if (a.got === 0) startPiece(f, a); }
    else if (kind === 'beltSpeed') { f.beltSpeed++; f.bt = Math.min(f.bt, beltTicks(f) - 1); }
    else { const add = u.to - u.from; f.beltLen++; for (const it of f.belt) { it.p += add; it.pp += add; } }
    for (const d of f.drops) if (d.t > dropTicks(f)) d.t = dropTicks(f);
    f.stats.spent += u.cost;
    return true;
  }

  const maxed = (f) => KINDS.every((k) => !nextUpgrade(f, k));

  // ---- saves --------------------------------------------------------------------------------------------------------

  const KEYS = ['v', 'seed', 'serial', 'acc', 'lastTick', 'droppers', 'speed', 'storeLevel', 'size', 'beltSpeed', 'beltLen', 'drops', 'store', 'asm', 'belt', 'bt', 'moved', 'bank', 'stats'];

  /** A saved factory put right: every count in range, every invariant held, every stat present. A save of any other
   *  version starts a new factory (there are no migrations). */
  function repair(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f) || f.v !== VERSION) return create();
    const int = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
    const okShape = (it) => it && typeof it === 'object' && SIZES.indexOf(it.n) >= 0 && Number.isInteger(it.s) && it.s >= 0 && it.s < shapes(it.n).length;
    f.seed = Number.isFinite(f.seed) ? f.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    f.serial = int(f.serial, 0, 1e12, 0);
    f.acc = int(f.acc, 0, TICK_MS - 1, 0);
    f.droppers = int(f.droppers, 1, DROPPERS, 1);
    f.speed = int(f.speed, 0, DROP_T.length - 1, 0);
    f.storeLevel = int(f.storeLevel, 0, STORE_CAP.length - 1, 0);
    f.size = int(f.size, 0, SIZES.length - 1, 0);
    f.beltSpeed = int(f.beltSpeed, 0, BELT_T.length - 1, 0);
    f.beltLen = int(f.beltLen, 0, BELT_LEN.length - 1, 0);
    f.store = int(f.store, 0, storeCap(f), 0);
    const drops = Array.isArray(f.drops) ? f.drops : [];
    f.drops = [];
    for (let j = 0; j < f.droppers; j++) {
      const d = drops[j] && typeof drops[j] === 'object' ? drops[j] : {};
      const t = int(d.t, 0, dropTicks(f), 0);
      f.drops.push({ t, held: t === dropTicks(f) && f.store >= storeCap(f) });
    }
    f.asm = (Array.isArray(f.asm) ? f.asm.slice(0, ASSEMBLERS) : []).map((a) => {
      if (!okShape(a)) return startPiece(f, {});
      const got = int(a.got, 0, a.n, 0), t = int(a.t, 0, got < a.n ? FEED_TT : SET_TT, 0);
      return { n: a.n, s: a.s, c: int(a.c, 1, 7, 1), got, t, held: got === a.n && t === SET_TT && !!a.held };
    });
    f.bt = int(f.bt, 0, beltTicks(f) - 1, 0);
    f.moved = !!f.moved;
    const belt = (Array.isArray(f.belt) ? f.belt : []).filter((it) => okShape(it) && Number.isFinite(it.p)).sort((a, b) => b.p - a.p);
    f.belt = [];
    let limit = beltLen(f);
    for (const it of belt) {
      const p = Math.min(Math.max(0, Math.round(it.p)), limit - 1);
      if (p < 0 || p >= limit) break; // no room left: that piece is gone
      const pp = Number.isFinite(it.pp) ? Math.max(0, Math.min(p, Math.round(it.pp))) : p;
      f.belt.push({ n: it.n, s: it.s, c: int(it.c, 1, 7, 1), p, pp });
      limit = p;
    }
    // Only a piece waiting at a taken entry waits.
    for (const a of f.asm) if (a.held && !(f.belt.length && f.belt[f.belt.length - 1].p === 0)) a.held = false;
    f.bank = int(f.bank, 0, 1e12, 0);
    const st = f.stats && typeof f.stats === 'object' && !Array.isArray(f.stats) ? f.stats : {};
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
    VERSION, TUNE, TICK_MS, DROP_TT, FEED_TT, SET_TT, BELT_TT, NAMES, KINDS,
    create, repair, shapes, flat, storeCap, beltLen, dropTicks, beltTicks, pieceLines, tick, run, step, catchUp, takeLines,
    mood, rates, collect, nextUpgrade, upgrade, levelOf, topOf, maxed,
  }, TUNE);
})(typeof globalThis !== 'undefined' ? globalThis : this);
