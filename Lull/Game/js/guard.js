// Lull — Protect (a board option: js/recipe.js). A sprout sits on the floor in the middle of the well with 3 leaves.
// Meteors fall on it and moles burrow toward it; your blocks are its shelter, and the threats eat them away, so the
// shelter has to be built again and again. Time runs on a clock, in ticks of a tenth of a second, while the board is in
// play (Free Play's controller, js/guardview.js, runs it and pauses it); the pieces never fall by themselves, but the
// threats keep coming while you think. At 0 leaves the board wilts. Pure rules, no DOM.
//
//   The sprout   2 wide on even widths, 3 on odd ones, 2 tall, centred on the floor (ASSET | 31). Rows 0 and 1 are
//                its bed and never clear; no item removes it (keep), Settle leaves it where it is.
//   A tick      1. the moles are read off the board (one missing was swept by a clear, or taken by an item);
//               2. the clock moves on (tk++), and the runs without a power-up (bare) and without a lost leaf (clean);
//               3. threats that are due come: a meteor shows its column (warn), then falls; a mole comes in at a side
//                  wall, on top of that column's stack;
//               4. each falling meteor drops; one that reaches the top of its column(s) breaks the cells around where
//                  it lands (a diamond of the level's radius; Easy: only the block it hits) and any mole there; one
//                  that reaches the sprout costs a leaf;
//               5. each mole, when its time comes, takes its next cell: next to the sprout it nibbles a leaf and
//                  leaves; an empty cell it walks into; a block it eats (the level's dig time, shorter each wave), then
//                  moves into;
//               6. the phase moves on (a calm, then a wave of 30 s; a wave that ends may regrow a leaf);
//               7. at 0 leaves (advance): game.end('wilted').
//   Routes      Dijkstra over empty cells that touch something solid side by side (never the open top of the well),
//               a move each, and blocks, a dig and a move each; never the sprout, another mole or the walls. Ties go
//               sideways toward the sprout, then down, then up.
//   The plan    Each wave's threats are drawn on the guard's own stream (seed ^ 0x5bd1e995; saved, so Undo and
//               resume replay them exactly), spread through the wave; a share of meteors aimed at the sprout ±1.
//
// Cells: mole = FOREIGN | MOLE | slot << SLOT_SHIFT | 8; sprout = ASSET | 31. Moles are FOREIGN: never the player's, a
// row holding one is plain, and only own cells pay (js/engine.js, score). Meteors are never cells: they are the guard's.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL, RNG } = L;
  const { FOREIGN, ASSET, MOLE, MOLE_SLOT, SLOT_SHIFT } = CELL;

  const SPROUT = ASSET | CELL.SPROUT;
  const moleCell = (slot) => FOREIGN | MOLE | (slot << SLOT_SHIFT) | 8;
  const isMole = (v) => !!(v & MOLE) && !(v & CELL.WALL);
  const slotOf = (v) => (v & MOLE_SLOT) >> SLOT_SHIFT;
  /** A cell a mole can eat or a meteor break: any block but the sprout, a mole and the walls. */
  const eatable = (v) => !!v && !(v & (ASSET | MOLE | CELL.WALL));

  /** Ticks a second (a tick is 100 ms of play). */
  const TPS = 10;
  const LEAVES = 3, BED = 2, MAX_MOLES = 4, TRAIL = 16;
  // Rated as its shape set is (every Protect rule only takes chances away). The economy's one switch: false makes every
  // Protect board unrated (×1, no difficult clears; Double or Nothing and Safety Net refused).
  const RATED = true;
  const IDS = ['easy', 'medium', 'hard'];
  const NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  /**
   * The levels, in seconds. start: the quiet before wave 1; wave / calm: each; meteors and moles: a wave's [first, more
   * each wave after, cap] (meteors at 10 wide, scaled by w/10; moles from wave moleFrom); big: the first wave with
   * 2-wide meteors (a third of them; 0: never); aim: the share aimed at the sprout's columns ±1; warn: a meteor's
   * column shown before it falls; fall: rows a second; blast: the radius it breaks (0: the block it hits); come: a
   * mole's notch shown before it comes in; move: a mole's step through an empty cell; dig: eating a block, [wave 1, less
   * each wave after, floor]; regrow: a leaf grows back every regrow waves (0: never); points: score a second.
   */
  const LEVELS = {
    easy: { start: 10, wave: 30, calm: 8, meteors: [3, 1, 8], moles: [1, 0.5, 3], moleFrom: 2, big: 0, aim: 0.5, warn: 2.5, fall: 10, blast: 0, come: 2, move: 0.8, dig: [2.4, 0.1, 1.6], regrow: 1, points: 5 },
    medium: { start: 8, wave: 30, calm: 6, meteors: [4, 1.5, 14], moles: [1, 0.75, 5], moleFrom: 1, big: 0, aim: 0.6, warn: 2, fall: 12, blast: 1, come: 1.5, move: 0.6, dig: [1.6, 0.1, 0.9], regrow: 2, points: 10 },
    hard: { start: 6, wave: 30, calm: 5, meteors: [5, 2, 20], moles: [2, 1, 8], moleFrom: 1, big: 3, aim: 0.7, warn: 1.5, fall: 14, blast: 1, come: 1.2, move: 0.5, dig: [1.4, 0.1, 0.6], regrow: 0, points: 20 },
  };
  const ticks = (s) => Math.max(1, Math.round(s * TPS));
  /** The level's numbers in ticks at wave k (the calm before wave 1 plays as wave 1); fall in hundredths of a row a tick. */
  function pace(level, k) {
    const T = LEVELS[level], kk = Math.max(1, k || 1);
    return { move: ticks(T.move), dig: ticks(Math.max(T.dig[2], T.dig[0] - T.dig[1] * (kk - 1))), warn: ticks(T.warn), come: ticks(T.come), fall: Math.round(T.fall * 100 / TPS) };
  }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && (hi == null || v <= hi);

  /** Is this recipe a Protect board? */
  const on = (r) => !!r && r.mode === 'protect';
  /** The sprout on a board w wide: { ax, sw } (2 wide on even widths, 3 on odd, centred; 2 tall on the floor). */
  function sproutOf(w) { const sw = w % 2 ? 3 : 2; return { ax: (w - sw) / 2, sw }; }
  const inSprout = (G, x, y) => y >= 0 && y < BED && x >= G.ax && x < G.ax + G.sw;
  /** The height of column x: the first empty row above its highest cell. */
  function colTop(b, x) { let hh = b.h; while (hh > 0 && !b.get(x, hh - 1)) hh--; return hh; }
  /** The guard's own stream, from the board's seed (never the piece stream: dealing is untouched). */
  function guardSeed(seed) { return typeof seed === 'number' && isFinite(seed) ? ((seed ^ 0x5bd1e995) >>> 0) : String(seed) + ':guard'; }
  /** The power-ups used on the board, Luck aside (any other one, Undo included, breaks a run without power-ups). */
  function itemsUsed(s) {
    let n = 0;
    for (const [id, k] of Object.entries((s && s.items) || {})) if (!(L.ITEMS && L.ITEMS[id] && L.ITEMS[id].group === 'luck')) n += k || 0;
    return n;
  }
  const blankStats = () => ({ waves: 0, meteors: 0, hits: 0, taps: 0, lost: 0, grown: 0, moles: 0, swept: 0, smashed: 0, blasted: 0, eaten: 0, broken: 0 });

  /** A new guard for a board w wide: 3 leaves, the quiet start, no plan yet, not started. */
  function create(level, w, seed) {
    level = LEVELS[level] ? level : 'easy';
    const { ax, sw } = sproutOf(w);
    return {
      v: 2, level, ax, sw, leaves: LEAVES, rng: new RNG(guardSeed(seed)).state(), tk: 0, wave: 0, phase: 'calm', left: ticks(LEVELS[level].start),
      plan: [], meteors: [], moles: [], trail: [], items: 0, bare: 0, clean: 0, started: false, st: blankStats(),
      // What Free Play has booked into the lifetime stats (a high-water mark: Undo never takes it back, so a tick
      // replayed is never counted twice).
      book: Object.assign(blankStats(), { tk: 0 }),
    };
  }
  /** The sprout's cells set on the board. */
  function place(b, G) { for (let y = 0; y < BED; y++) for (let x = G.ax; x < G.ax + G.sw; x++) b.set(x, y, SPROUT); }

  /** A guard as saved: whole and sound for a board w × h (cells: the board's, if given: the sprout is there). */
  function valid(G, w, h, cells) {
    if (!isObj(G) || G.v !== 2 || !LEVELS[G.level] || !isObj(G.st)) return false;
    const sp = sproutOf(w);
    if (G.ax !== sp.ax || G.sw !== sp.sw) return false;
    if (!int(G.leaves, 0, LEAVES) || !int(G.tk, 0) || !int(G.wave, 0) || !int(G.left, 0) || !int(G.bare, 0) || !int(G.clean, 0) || !int(G.items, 0)) return false;
    if (G.phase !== 'calm' && G.phase !== 'wave') return false;
    if (!Array.isArray(G.rng) || G.rng.length !== 4 || !G.rng.every((v) => Number.isInteger(v))) return false;
    if (!Array.isArray(G.plan) || G.plan.length > 128) return false;
    for (const t of G.plan) {
      if (!isObj(t) || !int(t.at, 0)) return false;
      if (t.kind === 'meteor') { if (!int(t.sw, 1, 2) || !int(t.x, 0, w - t.sw)) return false; }
      else if (t.kind === 'mole') { if (t.side !== 0 && t.side !== 1) return false; }
      else return false;
    }
    if (!Array.isArray(G.meteors) || G.meteors.length > 64) return false;
    for (const m of G.meteors) if (!isObj(m) || !int(m.sw, 1, 2) || !int(m.x, 0, w - m.sw) || !int(m.fall, 0) || !int(m.yc, -1000, (h + 1) * 100)) return false;
    if (!Array.isArray(G.moles) || G.moles.length > MAX_MOLES) return false;
    const slots = new Set();
    for (const m of G.moles) {
      if (!isObj(m) || !int(m.slot, 0, MAX_MOLES - 1) || slots.has(m.slot) || !int(m.wait, 0) || !int(m.tx, -1, w - 1) || !int(m.ty, -1, h - 1)) return false;
      slots.add(m.slot);
    }
    if (!Array.isArray(G.trail) || G.trail.length > TRAIL || !G.trail.every((t) => Array.isArray(t) && t.length === 3 && t.every((n) => Number.isInteger(n)))) return false;
    if (cells && cells.length === w * h) {
      for (let y = 0; y < BED; y++) for (let x = sp.ax; x < sp.ax + sp.sw; x++) if (!(cells[y * w + x] & ASSET)) return false;
    }
    return true;
  }

  // ---- the wave plan -------------------------------------------------------------------------------------------------

  /** How many meteors and moles wave k brings on a board w wide. */
  function counts(level, k, w) {
    const T = LEVELS[level];
    const ramp = (a, from) => Math.min(a[2], a[0] + a[1] * (k - from));
    return { meteors: Math.max(1, Math.round(ramp(T.meteors, 1) * w / 10)), moles: k >= T.moleFrom ? Math.floor(ramp(T.moles, T.moleFrom)) : 0 };
  }

  /** Wave G.wave's threats, drawn on rng: [{ at, kind: 'meteor', x, sw } | { at, kind: 'mole', side }], by at. */
  function planWave(G, w, h, rng) {
    const T = LEVELS[G.level], k = G.wave, n = counts(G.level, k, w), span = ticks(T.wave);
    const kinds = [];
    for (let i = 0; i < n.meteors; i++) kinds.push('meteor');
    for (let i = 0; i < n.moles; i++) kinds.push('mole');
    rng.shuffle(kinds);
    const plan = [];
    kinds.forEach((kind, i) => {
      // Spread through the wave, a little either way.
      const at = G.tk + Math.max(1, Math.min(span - 1, Math.floor((i + 0.5) * span / kinds.length) + rng.range(-8, 8)));
      if (kind === 'meteor') {
        const sw = T.big && k >= T.big && rng.chance(1 / 3) ? 2 : 1;
        let x;
        if (rng.chance(T.aim)) {
          const lo = Math.max(0, G.ax - 1), hi = Math.min(w - sw, G.ax + G.sw + 1 - sw);
          x = lo + rng.int(hi - lo + 1);
        } else x = rng.int(w - sw + 1);
        plan.push({ at, kind, x, sw });
      } else plan.push({ at, kind, side: rng.int(2) });
    });
    return plan.sort((a, b) => a.at - b.at);
  }

  // ---- moles ---------------------------------------------------------------------------------------------------------

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  /** Is (x, y) solid for a mole: a cell, a side wall or the floor (the open top of the well is not: none crawls on it)? */
  const solidAt = (b, x, y) => y < b.h && !!b.get(x, y);
  /** Is (x, y) next to the sprout (side by side)? */
  const bySprout = (G, x, y) => DIRS.some(([dx, dy]) => inSprout(G, x + dx, y + dy));

  /** The moles on the board, by slot: { slot: [x, y] }. */
  function molesOn(b) {
    const out = {};
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = b.get(x, y); if (isMole(v)) out[slotOf(v)] = [x, y]; }
    return out;
  }

  /**
   * A mole's way to the sprout, from (sx, sy): Dijkstra over the cells it can take (an empty cell touching something
   * solid other than itself, side by side: a move; a block: a dig and a move). Returns { path (the cells after the
   * start, to the goal: a cell next to the sprout), reach, cost (in ticks) }; with no way in, the path to the reachable cell nearest it.
   */
  function route(b, G, sx, sy) {
    const P = pace(G.level, G.wave), W = b.w, H = b.h, N = W * H, me = sy * W + sx;
    const cx = G.ax + (G.sw - 1) / 2;
    const cost = (x, y) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return 0;
      const v = b.get(x, y);
      if (v) return eatable(v) ? P.dig + P.move : 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx === sx && ny === sy) continue;
        if (solidAt(b, nx, ny)) return P.move;
      }
      return 0;
    };
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    // A small binary heap of [d, order, index]; order keeps ties in the order cells were first reached.
    const heap = [];
    let order = 0;
    const less = (a, c) => a[0] < c[0] || (a[0] === c[0] && a[1] < c[1]);
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; }
      }
      return top;
    };
    dist[me] = 0;
    push([0, order++, me]);
    let goal = -1;
    while (heap.length) {
      const [d, , i] = pop();
      if (done[i]) continue;
      done[i] = 1;
      const x = i % W, y = (i / W) | 0;
      if (i !== me && bySprout(G, x, y)) { goal = i; break; }
      const toward = x < cx ? 1 : x > cx ? -1 : 0;
      const dirs = toward ? [[toward, 0], [0, -1], [0, 1], [-toward, 0]] : [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy, c = cost(nx, ny);
        if (!c) continue;
        const j = ny * W + nx;
        if (done[j] || d + c >= dist[j]) continue;
        dist[j] = d + c; prev[j] = i;
        push([d + c, order++, j]);
      }
    }
    let end = goal;
    if (end < 0) {
      const near = (i) => { const x = i % W, y = (i / W) | 0; const ddx = x < G.ax ? G.ax - x : x >= G.ax + G.sw ? x - (G.ax + G.sw - 1) : 0; return ddx + Math.max(0, y - (BED - 1)); };
      let best = me;
      for (let i = 0; i < N; i++) if (done[i] && (near(i) < near(best) || (near(i) === near(best) && dist[i] < dist[best]))) best = i;
      end = best;
    }
    const path = [];
    for (let i = end; i !== me && i >= 0; i = prev[i]) path.unshift([i % W, (i / W) | 0]);
    return { path, reach: goal >= 0, cost: dist[end] };
  }

  // ---- meteors -------------------------------------------------------------------------------------------------------

  /**
   * Where a meteor would land now: top (the row above its highest column: it stops there), cy (the row it strikes:
   * the top cell, or the floor), the cells it would break (a diamond of the level's radius round each column it strikes,
   * the sprout aside) and hit (it would reach the sprout).
   */
  function landing(G, b, m) {
    const r = LEVELS[G.level].blast;
    let top = 0;
    for (let x = m.x; x < m.x + m.sw; x++) top = Math.max(top, colTop(b, x));
    const cy = Math.max(0, top - 1), seen = new Set(), cells = [];
    let hit = false;
    for (let x0 = m.x; x0 < m.x + m.sw; x0++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -(r - Math.abs(dy)); dx <= r - Math.abs(dy); dx++) {
        const x = x0 + dx, y = cy + dy;
        if (x < 0 || x >= b.w || y < 0 || y >= b.h || seen.has(x + ',' + y)) continue;
        seen.add(x + ',' + y);
        const v = b.get(x, y);
        if (v & ASSET) hit = true;
        else if (v) cells.push([x, y]);
      }
    }
    return { top, cy, cells, hit };
  }

  // ---- the tick ------------------------------------------------------------------------------------------------------

  /**
   * One tick of the guard (a tenth of a second of play): see the head of this file. o.piece: the cells of the piece in
   * play (a mole never walks into one). Returns what happened, for the view and Free Play: { moles: [{ slot, kind:
   * 'move' | 'dig' | 'eat' | 'nibble', from, to }], meteors: [{ x, sw, hit, top, cy, cells: [[x, y, v]] }], arrive:
   * [{ slot, at, ate }], lost, grew, wave: { start } | { end } | null, gone (moles a clear or an item took) }.
   */
  function tick(g, G, b, o) {
    const T = LEVELS[G.level], rng = RNG.from(G.rng), W = b.w, H = b.h, P = pace(G.level, G.wave);
    const ev = { moles: [], meteors: [], arrive: [], lost: 0, grew: 0, wave: null, gone: 0 };
    const busy = new Set(((o && o.piece) || []).map(([x, y]) => x + ',' + y));
    const loseLeaf = () => { if (G.leaves > 0) { G.leaves--; G.st.lost++; ev.lost++; } G.clean = 0; };
    // A power-up used since the last tick (Undo too) ends a run without one.
    const used = itemsUsed(g && g.s);
    if (used !== G.items) { G.items = used; G.bare = 0; G.clean = 0; }
    // 1. The moles as they are on the board (a clear, Settle or an item may have moved or taken one).
    const at = molesOn(b);
    G.moles = G.moles.filter((m) => { if (at[m.slot]) return true; G.st.blasted++; ev.gone++; return false; });
    // 2.
    G.tk++; G.bare++; G.clean++;
    if (G.tk % TPS === 0 && g && g.s) g.s.score += T.points;
    // 3. Threats that are due.
    for (const t of G.plan.filter((p) => p.at <= G.tk)) {
      if (t.kind === 'meteor') {
        G.plan.splice(G.plan.indexOf(t), 1);
        G.meteors.push({ x: t.x, sw: t.sw, fall: G.tk + P.warn, yc: H * 100 });
        continue;
      }
      // A mole comes in at its wall, on that column's top (on a full column, eating its top block); a second later when 4
      // are out, or the cell is a mole's or the piece's.
      const x = t.side ? W - 1 : 0, y = Math.min(colTop(b, x), H - 1), v = b.get(x, y);
      if (G.moles.length >= MAX_MOLES || isMole(v) || (v & ASSET) || busy.has(x + ',' + y)) { t.at = G.tk + TPS; continue; }
      G.plan.splice(G.plan.indexOf(t), 1);
      const taken = new Set(G.moles.map((m) => m.slot));
      const slot = [0, 1, 2, 3].find((s) => !taken.has(s));
      if (v) G.st.eaten++;
      G.moles.push({ slot, wait: P.move, tx: -1, ty: -1, face: t.side ? -1 : 1 });
      b.set(x, y, moleCell(slot));
      at[slot] = [x, y];
      G.st.moles++;
      ev.arrive.push({ slot, at: [x, y], ate: !!v });
    }
    G.plan.sort((a, c) => a.at - c.at);
    // 4. Meteors fall; one that reaches its top breaks what is there.
    for (const m of G.meteors.slice()) {
      if (G.tk < m.fall) continue;
      m.yc -= P.fall;
      const land = landing(G, b, m);
      if (m.yc > land.top * 100) continue;
      G.meteors.splice(G.meteors.indexOf(m), 1);
      const out = { x: m.x, sw: m.sw, hit: land.hit, cy: land.cy, top: land.top, cells: [] };
      for (const [x, y] of land.cells) {
        const v = b.get(x, y);
        if (isMole(v)) { const s = slotOf(v); G.moles = G.moles.filter((mm) => mm.slot !== s); delete at[s]; G.st.smashed++; }
        else G.st.broken++;
        out.cells.push([x, y, v]);
        b.set(x, y, 0);
      }
      G.st.meteors++;
      if (land.hit) { loseLeaf(); G.st.hits++; }
      ev.meteors.push(out);
    }
    // 5. Each mole, when its time comes, takes its next cell (in slot order).
    for (const m of G.moles.slice().sort((a, c) => a.slot - c.slot)) {
      if (m.wait > 1) { m.wait--; continue; }
      m.wait = 0;
      const [x, y] = at[m.slot];
      if (bySprout(G, x, y)) {
        loseLeaf(); G.st.taps++;
        b.set(x, y, 0);
        G.moles.splice(G.moles.indexOf(m), 1);
        ev.moles.push({ slot: m.slot, kind: 'nibble', from: [x, y] });
        continue;
      }
      const go = (nx, ny, kind) => {
        if (nx !== x) m.face = nx > x ? 1 : -1;
        b.set(x, y, 0);
        b.set(nx, ny, moleCell(m.slot));
        at[m.slot] = [nx, ny];
        G.trail.push([x, y, G.tk]);
        if (G.trail.length > TRAIL) G.trail.shift();
        m.tx = -1; m.ty = -1; m.wait = P.move;
        ev.moles.push({ slot: m.slot, kind, from: [x, y], to: [nx, ny] });
      };
      // Finishing a dig: the block is eaten, and the mole goes in (unless the block went another way meanwhile).
      if (m.tx >= 0) {
        const tx = m.tx, ty = m.ty;
        m.tx = -1; m.ty = -1;
        if (Math.abs(tx - x) + Math.abs(ty - y) === 1 && eatable(b.get(tx, ty))) { G.st.eaten++; go(tx, ty, 'eat'); continue; }
      }
      const next = route(b, G, x, y).path[0];
      if (!next) { m.wait = P.move; continue; }
      const [nx, ny] = next, v = b.get(nx, ny);
      if (!v) {
        if (busy.has(nx + ',' + ny)) { m.wait = P.move; continue; }
        go(nx, ny, 'move');
      } else {
        m.tx = nx; m.ty = ny; m.wait = P.dig;
        if (nx !== x) m.face = nx > x ? 1 : -1;
        ev.moles.push({ slot: m.slot, kind: 'dig', from: [x, y], to: [nx, ny] });
      }
    }
    // The tunnel fades after a few seconds.
    while (G.trail.length && G.tk - G.trail[0][2] > 4 * TPS) G.trail.shift();
    // 6. The phase moves on.
    if (--G.left <= 0) {
      if (G.phase === 'calm') {
        G.wave++; G.phase = 'wave'; G.left = ticks(T.wave);
        G.plan = G.plan.concat(planWave(G, W, H, rng)).sort((a, c) => a.at - c.at);
        ev.wave = { start: G.wave };
      } else {
        G.phase = 'calm'; G.left = ticks(T.calm); G.st.waves++;
        if (T.regrow && G.wave % T.regrow === 0 && G.leaves > 0 && G.leaves < LEAVES) { G.leaves++; G.st.grown++; ev.grew++; }
        ev.wave = { end: G.wave };
      }
    }
    G.rng = rng.state();
    return ev;
  }

  // ---- what is coming (the view's warnings) --------------------------------------------------------------------------

  /**
   * What the view draws over the board: meteors (warning or falling: { x, sw, yc, falling, left (ticks to fall), warn,
   * top, cy, cells, hit }), moles about to come in ({ side, x, y, left }), each mole's dig ({ slot, at, to, k: 0–1
   * done }) and its next 2 cells, and the tunnel ({ x, y, age } in ticks, cells still open).
   */
  function preview(G, b) {
    const P = pace(G.level, G.wave), out = { meteors: [], arrivals: [], digs: [], paths: [], trail: [] };
    for (const m of G.meteors) {
      const land = landing(G, b, m);
      out.meteors.push({ x: m.x, sw: m.sw, yc: m.yc, falling: G.tk >= m.fall, left: Math.max(0, m.fall - G.tk), warn: P.warn, top: land.top, cy: land.cy, cells: land.cells, hit: land.hit });
    }
    for (const t of G.plan) {
      if (t.kind !== 'mole' || t.at - G.tk > P.come) continue;
      const x = t.side ? b.w - 1 : 0;
      out.arrivals.push({ side: t.side, x, y: Math.min(colTop(b, x), b.h - 1), left: Math.max(0, t.at - G.tk) });
    }
    const at = molesOn(b);
    for (const m of G.moles) {
      const p = at[m.slot];
      if (!p) continue;
      if (m.tx >= 0) out.digs.push({ slot: m.slot, at: p, to: [m.tx, m.ty], k: Math.max(0, Math.min(1, 1 - m.wait / P.dig)) });
      out.paths.push({ slot: m.slot, from: p, cells: route(b, G, p[0], p[1]).path.slice(0, 2) });
    }
    for (const [x, y, t] of G.trail) if (!b.get(x, y)) out.trail.push({ x, y, age: G.tk - t });
    return out;
  }

  /** Whole seconds played on a guard, and its time as m:ss. */
  const secs = (G) => Math.floor(G.tk / TPS);
  function clock(G) { const s = secs(G); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /** The board's own numbers for its summary (and the library's record). */
  const summaryOf = (G) => (G ? { level: G.level, leaves: G.leaves, ms: G.tk * (1000 / TPS), waves: G.st.waves, lost: G.st.lost, meteors: G.st.meteors, moles: G.st.moles } : null);

  // ---- the engine's extension ----------------------------------------------------------------------------------------

  /** The hooks on a Protect board (see Game hooks in js/engine.js); its state is this.G (Guard.of(game)). */
  function extension(game, saved) {
    const r = game.recipe, w = game.w;
    let G;
    if (saved !== undefined && valid(saved, w, game.h)) G = clone(saved);
    else { G = create(r.protect && r.protect.level, w, game.seed); place(game.board, G); }
    if (!G.book) G.book = Object.assign(blankStats(), { tk: 0 });
    return {
      G,
      // Settle with nothing but the sprout on the board settles nothing (the engine's own refusal reads isEmpty, and the
      // sprout is never empty): refused here, so nothing is spent.
      allow(g, id) {
        if (id !== 'settle') return null;
        const b = g.board;
        for (let i = 0; i < b.cells.length; i++) if (b.cells[i] && !(b.cells[i] & ASSET)) return null;
        return 'Nothing to settle';
      },
      // The bed never clears.
      rows(g, b, rows) { return rows.filter((y) => y >= BED); },
      // No item removes the sprout (and Settle leaves it where it is).
      keep(g, b, v) { return !!(v & ASSET); },
      // Empty, as Protect sees it: nothing above the bed, and no mole anywhere.
      clean(g, b) {
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = b.get(x, y); if (v && (y >= BED || v & MOLE)) return false; }
        return true;
      },
      // A mole in a cleared row is swept away (the board in play only: Best Fit's copies are not).
      afterClear(g, b, res) {
        if (b !== g.board) return;
        const gone = new Set();
        const scan = (rows) => { for (const row of rows || []) for (const v of row) if (isMole(v)) gone.add(slotOf(v)); };
        scan(res.removed);
        for (const wave of res.cascade || []) scan(wave.removed);
        if (!gone.size) return;
        this.G.moles = this.G.moles.filter((m) => { if (!gone.has(m.slot)) return true; this.G.st.swept++; return false; });
        res.swept = (res.swept || 0) + gone.size;
      },
      snap() { const s = clone(this.G); delete s.book; return s; },
      restore(g, s) { const book = this.G.book; this.G = clone(s); this.G.book = book; },
      save() { return clone(this.G); },
      summary() { return summaryOf(this.G); },
    };
  }

  /** The guard of a game (null on a board that is not Protect). */
  function of(game) {
    const e = game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'protect') : null;
    return e ? e.G : null;
  }

  /**
   * One tick on a game in play (Free Play's clock): the guard's tick with the piece in play kept clear of moles, and the
   * wilt at 0 leaves. Returns the tick's events (null when the board is over or not Protect).
   */
  function advance(game) {
    const G = of(game);
    if (!G || game.over) return null;
    const ev = tick(game, G, game.board, { piece: game.piece ? game.absCells(game.piece) : [] });
    if (G.leaves <= 0) { ev.out = true; game.end('wilted'); }
    return ev;
  }

  const PART = {
    key: 'protect', order: 40, mode: 'protect', name: 'Protect', owns: ['protect'], options: { 'protect.level': IDS.slice() },
    // The sprout is planted when the board is made: an edit never makes a board Protect, or a Protect board another.
    editFixed: true,
    normalize(raw, out) {
      if (out.mode !== 'protect') return;
      const lv = isObj(raw.protect) && raw.protect.level;
      out.protect = { level: IDS.includes(lv) ? lv : 'easy' };
    },
    label: (r) => (on(r) ? 'Protect ' + NAMES[r.protect.level] : ''),
    // At least 6 × 12, and the shapes fit in the rows above the bed (the Shapes minimum plus 2).
    limits(r, lim) {
      if (!on(r)) return;
      lim.w[0] = Math.max(lim.w[0], 6);
      lim.h[0] = Math.max(12, lim.h[0] + 2);
    },
    rules(r, R) {
      if (!on(r)) return;
      if (!RATED) R.rated = false;
      for (const id of ['tornado', 'trapdoor', 'flip']) R.refuse[id] = 'Not in Protect';
    },
    valid(g, r) {
      if (!on(r)) return true;
      return valid(isObj(g.x) ? g.x.protect : null, g.w, g.h, Array.isArray(g.cells) ? g.cells : null);
    },
    engine(game, saved) { return on(game.recipe) ? extension(game, saved) : null; },
    controller(play, game) { return game && on(game.recipe) && L.GuardView ? L.GuardView.controller(play, game) : null; },
    summary(x) { return isObj(x) && isObj(x.st) && Number.isInteger(x.tk) ? summaryOf(x) : null; },
    stats: { free: { guard: { ms: 0, waves: 0, meteors: 0, hits: 0, taps: 0, lost: 0, moles: 0, swept: 0, sweptHard: 0, eaten: 0, broken: 0, wilted: 0, best: { easy: 0, medium: 0, hard: 0 } } } },
  };
  Recipe.part(PART);

  // ---- achievements: counted on any Protect board 6 wide or more ----------------------------------------------------

  /** The achievements' times, in seconds. */
  const GOALS = { thumb: 180, watch: 300, clean: 180 };
  if (L.Achievements) {
    const counted = (r, g) => on(r) && !!g && g.w >= 6;
    const G = (e) => of(e.g);
    L.Achievements.group({
      id: 'protect', name: 'Protect', icon: 'protect', after: 'play',
      list: [
        { id: 'pr_thumb', name: 'Green Thumb', desc: 'Keep a sprout alive for 3 minutes.', pay: 60, on: 'play', counts: counted, test: (s, e) => { const x = G(e); return !!x && x.tk >= GOALS.thumb * TPS; } },
        { id: 'pr_watch', name: 'Night Watch', desc: 'Keep a sprout alive for 5 minutes on Hard, with no power-ups.', pay: 200, on: 'play', counts: counted, test: (s, e) => { const x = G(e); return !!x && x.level === 'hard' && x.bare >= GOALS.watch * TPS; } },
        { id: 'pr_swept', name: 'Swept Away', desc: 'Clear 25 moles away in lines, Medium or Hard.', pay: 100, on: 'play', counts: counted, test: (s) => (s.stats.free.guard || {}).sweptHard >= 25, progress: (s) => [Math.min(25, (s.stats.free.guard || {}).sweptHard || 0), 25] },
        { id: 'pr_clean', name: 'Not a Leaf', desc: '3 minutes on Hard with no leaf lost and no power-ups.', pay: 300, tier: 'legend', on: 'play', counts: counted, test: (s, e) => { const x = G(e); return !!x && x.level === 'hard' && x.clean >= GOALS.clean * TPS; } },
      ],
    });
  }

  L.Guard = { LEVELS, IDS, NAMES, LEAVES, BED, MAX_MOLES, TPS, GOALS, SPROUT, moleCell, isMole, slotOf, eatable, on, sproutOf, colTop, create, place, valid, counts, pace, planWave, route, landing, tick, advance, preview, molesOn, itemsUsed, of, summaryOf, secs, clock, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
