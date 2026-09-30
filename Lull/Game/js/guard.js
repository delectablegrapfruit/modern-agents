// Lull — Protect (a board option: js/recipe.js). A sprout sits on the floor in the middle of the well with 3 leaves.
// Stones fall on it and moles burrow toward it; your blocks are its shelter. Time is counted in pieces set, never in
// seconds: a Guard step runs after each piece lock (tool pieces and the Drill too), and never on Settle or Undo (Undo
// takes the step back with the rest). At 0 leaves the board wilts. Pure rules, no DOM (the look, the window, the
// status bar and the Wilted card are js/guardview.js).
//
//   The sprout   2 wide on even widths, 3 on odd ones, 2 tall, centred on the floor (ASSET | 31). Rows 0 and 1 are
//                its bed and never clear; no item removes it (keep), Settle leaves it where it is.
//   A step      1. the moles are read off the board (one missing was swept by a clear, or blasted by an item);
//               2. seq++; 3. each mole acts: next to the sprout it nibbles a leaf and leaves; boxed in on all four
//               sides by solid cells that are not stones (your blocks, other moles, the walls and floor) it curls up
//               into a stone; out of patience it wanders off; else it moves one cell along its route (Easy: every
//               second piece), digging through a stone in the level's time; 4. stones that are due fall, each column
//               onto that column's own top ("crumble to fit": no covered hole), and one that would land on the sprout
//               costs a leaf and places nothing; 5. moles that are due arrive at a side wall, on its column's top;
//               6. the phase moves on (a calm, then a wave of 24 pieces; a wave that ends regrows a leaf);
//               7. at 0 leaves: game.end('wilted').
//   Routes      Dijkstra over empty cells that touch something solid side by side (a cell, a side wall, the floor;
//               never the open top of the well), and stones (dug through); never your blocks, the sprout or the walls.
//               So a mole crawls along faces and floors and cannot round a corner in the open: a wall of your blocks
//               with no stone in it stops it. Ties go sideways toward the sprout, then down, then up. With no way in,
//               a mole goes to the reachable cell nearest the sprout and waits there.
//   The plan    Each wave's threats are drawn on the guard's own stream (seed ^ 0x5bd1e995; saved, so Undo and
//               resume replay them exactly), spread through the wave, 60% of stones aimed at the sprout's columns ±1.
//
// Cells: stone = FOREIGN | 8; mole = FOREIGN | MOLE | slot << SLOT_SHIFT | 8; sprout = ASSET | 31. Stones and moles are
// FOREIGN: never the player's, a row holding one is plain, and only own cells pay (js/engine.js, score).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL, RNG } = L;
  const { FOREIGN, ASSET, MOLE, MOLE_SLOT, SLOT_SHIFT, FILL } = CELL;

  const STONE = FOREIGN | 8;
  const SPROUT = ASSET | CELL.SPROUT;
  const moleCell = (slot) => FOREIGN | MOLE | (slot << SLOT_SHIFT) | 8;
  const isStone = (v) => !!(v & FOREIGN) && !(v & (MOLE | FILL)) && !(v & CELL.WALL);
  const isMole = (v) => !!(v & MOLE) && !(v & CELL.WALL);
  const slotOf = (v) => (v & MOLE_SLOT) >> SLOT_SHIFT;

  const LEAVES = 3, BED = 2, MAX_MOLES = 4;
  // Rated as its shape set is (plan D6: every Protect rule only takes chances away). The economy's one switch: false
  // makes every Protect board unrated (×1, no difficult clears; Double or Nothing and Safety Net refused).
  const RATED = true;
  const IDS = ['easy', 'medium', 'hard'];
  const NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  /**
   * The levels. start: the quiet pieces before wave 1; wave / calm: pieces each; stones and moles: per wave [first,
   * cap] (+1 every 2 waves; stones at 10 wide, scaled by w/10); wide / big: the wave 2-wide (40%) and 2×2 (25%) stones
   * come from (0: never); warn: pieces a threat is shown ahead; moleFrom: the first wave with moles; pace: a mole moves
   * every pace pieces; dig: pieces to dig through a stone; patience: pieces before a mole gives up; regrow: a leaf
   * grows back every regrow waves.
   */
  const LEVELS = {
    easy: { start: 12, wave: 24, calm: 12, stones: [2, 4], wide: 0, big: 0, warn: 3, moleFrom: 3, moles: [1, 2], pace: 2, dig: 3, patience: 16, regrow: 1 },
    medium: { start: 10, wave: 24, calm: 10, stones: [2, 4], wide: 4, big: 0, warn: 3, moleFrom: 2, moles: [1, 3], pace: 1, dig: 2, patience: 16, regrow: 1 },
    hard: { start: 8, wave: 24, calm: 8, stones: [3, 6], wide: 3, big: 6, warn: 2, moleFrom: 1, moles: [2, 4], pace: 1, dig: 1, patience: 20, regrow: 2 },
  };

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
  /** The power-ups used on the board, Luck aside (Not a Leaf: any other one, Undo included, breaks the run). */
  function itemsUsed(s) {
    let n = 0;
    for (const [id, k] of Object.entries((s && s.items) || {})) if (!(L.ITEMS && L.ITEMS[id] && L.ITEMS[id].group === 'luck')) n += k || 0;
    return n;
  }
  const blankStats = () => ({ waves: 0, stones: 0, hits: 0, taps: 0, lost: 0, grown: 0, boxed: 0, swept: 0, gone: 0, dug: 0, blasted: 0, moles: 0 });

  /** A new guard for a board w wide: 3 leaves, the quiet start, no plan yet. */
  function create(level, w, seed) {
    level = LEVELS[level] ? level : 'easy';
    const { ax, sw } = sproutOf(w);
    return {
      v: 1, level, ax, sw, leaves: LEAVES, rng: new RNG(guardSeed(seed)).state(), seq: 0, wave: 0, phase: 'calm', left: LEVELS[level].start,
      plan: [], moles: [], wclean: false, clean: 0, items: 0, st: blankStats(),
      // What Free Play has booked into the lifetime stats (a high-water mark: Undo never takes it back, so a step replayed
      // is never counted twice).
      book: blankStats(),
    };
  }
  /** The sprout's cells set on the board. */
  function place(b, G) { for (let y = 0; y < BED; y++) for (let x = G.ax; x < G.ax + G.sw; x++) b.set(x, y, SPROUT); }

  /** A guard as saved: whole and sound for a board w × h (cells: the board's, if given: the sprout is there). */
  function valid(G, w, h, cells) {
    if (!isObj(G) || !LEVELS[G.level] || !isObj(G.st)) return false;
    const sp = sproutOf(w);
    if (G.ax !== sp.ax || G.sw !== sp.sw) return false;
    if (!int(G.leaves, 0, LEAVES) || !int(G.seq, 0) || !int(G.wave, 0) || !int(G.left, 0) || !int(G.clean, 0) || !int(G.items, 0)) return false;
    if (G.phase !== 'calm' && G.phase !== 'wave') return false;
    if (!Array.isArray(G.rng) || G.rng.length !== 4 || !G.rng.every((v) => Number.isInteger(v))) return false;
    if (!Array.isArray(G.plan) || G.plan.length > 64) return false;
    for (const t of G.plan) {
      if (!isObj(t) || !int(t.at, 0)) return false;
      if (t.kind === 'stone') { if (!int(t.sw, 1, 2) || !int(t.sh, 1, 2) || !int(t.x, 0, w - t.sw)) return false; }
      else if (t.kind === 'mole') { if (t.side !== 0 && t.side !== 1) return false; }
      else return false;
    }
    if (!Array.isArray(G.moles) || G.moles.length > MAX_MOLES) return false;
    const slots = new Set();
    for (const m of G.moles) {
      if (!isObj(m) || !int(m.slot, 0, MAX_MOLES - 1) || slots.has(m.slot) || !int(m.patience, 0) || !int(m.dig, 0)) return false;
      slots.add(m.slot);
    }
    if (cells && cells.length === w * h) {
      for (let y = 0; y < BED; y++) for (let x = sp.ax; x < sp.ax + sp.sw; x++) if (!(cells[y * w + x] & ASSET)) return false;
    }
    return true;
  }

  // ---- the wave plan -------------------------------------------------------------------------------------------------

  /** Wave G.wave's threats, drawn on rng: [{ at, kind: 'stone', x, sw, sh } | { at, kind: 'mole', side }], by at. */
  function planWave(G, w, rng) {
    const T = LEVELS[G.level], k = G.wave;
    const ramp = (a, from) => Math.min(a[1], a[0] + Math.floor((k - from) / 2));
    const ns = Math.max(1, Math.round(ramp(T.stones, 1) * w / 10));
    const nm = k >= T.moleFrom ? ramp(T.moles, T.moleFrom) : 0;
    const kinds = [];
    for (let i = 0; i < ns; i++) kinds.push('stone');
    for (let i = 0; i < nm; i++) kinds.push('mole');
    rng.shuffle(kinds);
    const n = kinds.length, plan = [];
    kinds.forEach((kind, i) => {
      // Spread through the wave, never sooner than the warning can show it.
      const at = G.seq + Math.max(T.warn, Math.min(T.wave - 1, Math.floor((i + 0.5) * T.wave / n) + rng.range(-1, 1)));
      if (kind === 'stone') {
        let sw = 1, sh = 1;
        if (T.big && k >= T.big && rng.chance(0.25)) { sw = 2; sh = 2; } else if (T.wide && k >= T.wide && rng.chance(0.4)) sw = 2;
        let x;
        if (rng.chance(0.6)) {
          const lo = Math.max(0, G.ax - 1), hi = Math.min(w - sw, G.ax + G.sw + 1 - sw);
          x = lo + rng.int(hi - lo + 1);
        } else x = rng.int(w - sw + 1);
        plan.push({ at, kind, x, sw, sh });
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
   * A mole's way to the sprout, from (sx, sy): Dijkstra over the cells it can enter (an empty cell touching something
   * solid other than itself, side by side: cost 1; a stone: cost dig). Returns the path (cells after the start, to the goal: an
   * enterable cell next to the sprout), or, with none, the path to the reachable cell nearest the sprout (maybe []).
   * Ties: sideways toward the sprout first, then down, then up, then away.
   */
  function route(b, G, sx, sy) {
    const T = LEVELS[G.level], W = b.w, H = b.h, N = W * H, me = sy * W + sx;
    const cx = G.ax + (G.sw - 1) / 2;
    const cost = (x, y) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return 0;
      const v = b.get(x, y);
      if (isStone(v)) return Math.max(1, T.dig);
      if (v) return 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx === sx && ny === sy) continue;
        if (solidAt(b, nx, ny)) return 1;
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
      // No way in: the reachable cell nearest the sprout (then the cheapest to reach, then the first found).
      const near = (i) => { const x = i % W, y = (i / W) | 0; const ddx = x < G.ax ? G.ax - x : x >= G.ax + G.sw ? x - (G.ax + G.sw - 1) : 0; return ddx + Math.max(0, y - (BED - 1)); };
      let best = me;
      for (let i = 0; i < N; i++) if (done[i] && (near(i) < near(best) || (near(i) === near(best) && dist[i] < dist[best]))) best = i;
      end = best;
    }
    const path = [];
    for (let i = end; i !== me && i >= 0; i = prev[i]) path.unshift([i % W, (i / W) | 0]);
    return { path, reach: goal >= 0 };
  }

  // ---- the step ------------------------------------------------------------------------------------------------------

  /**
   * One Guard step (after a piece lock): see the head of this file. Returns what happened, for the view and Free Play:
   * { moles: [{ slot, kind: 'move' | 'dig' | 'nibble' | 'boxed' | 'gone', from, to }], stones: [{ x, sw, sh, hit,
   * cells }], arrive: [{ slot, at }], lost, grew, wave: { start } | { end } | null, blasted }.
   */
  function step(g, G, b) {
    const T = LEVELS[G.level], rng = RNG.from(G.rng), W = b.w, H = b.h;
    const ev = { moles: [], stones: [], arrive: [], lost: 0, grew: 0, wave: null, blasted: 0 };
    const loseLeaf = () => { if (G.leaves > 0) { G.leaves--; G.st.lost++; ev.lost++; } G.wclean = false; G.clean = 0; };
    // A power-up used since the last step (Undo too) ends a run of waves without one.
    const used = itemsUsed(g && g.s);
    if (used !== G.items) { G.items = used; G.wclean = false; G.clean = 0; }
    // 1. The moles as they are on the board (a clear, a cascade or Settle may have moved them; an item may have taken one).
    const at = molesOn(b);
    G.moles = G.moles.filter((m) => { if (at[m.slot]) return true; G.st.blasted++; ev.blasted++; return false; });
    // 2.
    G.seq++;
    // 3. Each mole acts, in slot order.
    for (const m of G.moles.slice().sort((a, c) => a.slot - c.slot)) {
      const [x, y] = at[m.slot];
      const leave = (kind, v) => { b.set(x, y, v); G.moles.splice(G.moles.indexOf(m), 1); ev.moles.push({ slot: m.slot, kind, from: [x, y] }); };
      if (bySprout(G, x, y)) { loseLeaf(); G.st.taps++; leave('nibble', 0); continue; }
      if (DIRS.every(([dx, dy]) => solidAt(b, x + dx, y + dy) && !isStone(b.get(x + dx, y + dy)))) { G.st.boxed++; leave('boxed', STONE); continue; }
      if (--m.patience <= 0) { G.st.gone++; leave('gone', 0); continue; }
      if (G.seq % T.pace) continue;
      const next = route(b, G, x, y).path[0];
      if (!next) continue;
      const [nx, ny] = next;
      if (isStone(b.get(nx, ny))) {
        m.dig = m.tx === nx && m.ty === ny ? m.dig + 1 : 1;
        m.tx = nx; m.ty = ny;
        if (m.dig < T.dig) { ev.moles.push({ slot: m.slot, kind: 'dig', from: [x, y], to: [nx, ny] }); continue; }
        G.st.dug++;
      }
      m.dig = 0; m.tx = -1; m.ty = -1;
      if (nx !== x) m.face = nx > x ? 1 : -1;
      b.set(x, y, 0);
      b.set(nx, ny, moleCell(m.slot));
      at[m.slot] = [nx, ny];
      ev.moles.push({ slot: m.slot, kind: 'move', from: [x, y], to: [nx, ny] });
    }
    // 4. Stones that are due fall, each column onto its own top.
    for (const t of G.plan.filter((p) => p.kind === 'stone' && p.at <= G.seq)) {
      G.plan.splice(G.plan.indexOf(t), 1);
      const tops = [];
      for (let x = t.x; x < t.x + t.sw; x++) tops.push(colTop(b, x));
      const hit = tops.some((hh, i) => hh > 0 && hh <= BED && inSprout(G, t.x + i, hh - 1));
      const out = { x: t.x, sw: t.sw, sh: t.sh, hit, cells: [], tops };
      if (hit) { loseLeaf(); G.st.hits++; }
      else {
        tops.forEach((hh, i) => { for (let dy = 0; dy < t.sh; dy++) if (hh + dy < H) { b.set(t.x + i, hh + dy, STONE); out.cells.push([t.x + i, hh + dy]); } });
        G.st.stones++;
      }
      ev.stones.push(out);
    }
    // 5. Moles that are due arrive at their wall (later, when 4 are out or the wall's column is full).
    for (const t of G.plan.filter((p) => p.kind === 'mole' && p.at <= G.seq)) {
      const x = t.side ? W - 1 : 0, hh = colTop(b, x);
      if (G.moles.length >= MAX_MOLES || hh >= H) { t.at = G.seq + 1; continue; }
      G.plan.splice(G.plan.indexOf(t), 1);
      const used2 = new Set(G.moles.map((m) => m.slot));
      const slot = [0, 1, 2, 3].find((s) => !used2.has(s));
      G.moles.push({ slot, patience: T.patience, dig: 0, tx: -1, ty: -1, face: t.side ? -1 : 1 });
      b.set(x, hh, moleCell(slot));
      G.st.moles++;
      ev.arrive.push({ slot, at: [x, hh] });
    }
    G.plan.sort((a, c) => a.at - c.at);
    // 6. The phase moves on.
    if (--G.left <= 0) {
      if (G.phase === 'calm') {
        G.wave++; G.phase = 'wave'; G.left = T.wave; G.wclean = true;
        G.plan = G.plan.concat(planWave(G, W, rng)).sort((a, c) => a.at - c.at);
        ev.wave = { start: G.wave };
      } else if (!G.plan.length) {
        G.phase = 'calm'; G.left = T.calm; G.st.waves++;
        if (G.wclean) G.clean++;
        G.wclean = false;
        if (G.wave % T.regrow === 0 && G.leaves > 0 && G.leaves < LEAVES) { G.leaves++; G.st.grown++; ev.grew++; }
        ev.wave = { end: G.wave };
      } else G.left = 1;
    }
    G.rng = rng.state();
    return ev;
  }

  // ---- what is coming (the view's warnings) --------------------------------------------------------------------------

  /**
   * The threats due within the warning, as they would come if nothing changed: stones where each would land now
   * ({ x, sw, left, hit, cells }), moles about to arrive ({ side, x, y, left }), and each mole's next 2 route cells.
   */
  function preview(G, b) {
    const T = LEVELS[G.level], out = { stones: [], arrivals: [], paths: [] };
    for (const t of G.plan) {
      const left = t.at - G.seq;
      if (left < 1 || left > T.warn) continue;
      if (t.kind === 'stone') {
        const cells = [];
        let hit = false;
        for (let x = t.x; x < t.x + t.sw; x++) {
          const hh = colTop(b, x);
          if (hh > 0 && hh <= BED && inSprout(G, x, hh - 1)) hit = true;
          for (let dy = 0; dy < t.sh; dy++) if (hh + dy < b.h) cells.push([x, hh + dy]);
        }
        out.stones.push({ x: t.x, sw: t.sw, left, hit, cells });
      } else {
        const x = t.side ? b.w - 1 : 0;
        out.arrivals.push({ side: t.side, x, y: Math.min(b.h - 1, colTop(b, x)), left });
      }
    }
    const at = molesOn(b);
    for (const m of G.moles) {
      const p = at[m.slot];
      if (!p) continue;
      out.paths.push({ slot: m.slot, from: p, cells: route(b, G, p[0], p[1]).path.slice(0, 2), patience: m.patience });
    }
    return out;
  }

  /** The board's own numbers for its summary (and the library's record). */
  const summaryOf = (G) => (G ? { level: G.level, leaves: G.leaves, waves: G.st.waves, lost: G.st.lost, stones: G.st.stones, boxed: G.st.boxed } : null);

  // ---- the engine's extension ----------------------------------------------------------------------------------------

  /** The hooks on a Protect board (see Game hooks in js/engine.js); its state is this.G (Guard.of(game)). */
  function extension(game, saved) {
    const r = game.recipe, w = game.w;
    let G;
    if (saved !== undefined && valid(saved, w, game.h)) G = clone(saved);
    else { G = create(r.protect && r.protect.level, w, game.seed); place(game.board, G); }
    if (!G.book) G.book = blankStats();
    return {
      G,
      // The bed never clears.
      rows(g, b, rows) { return rows.filter((y) => y >= BED); },
      // No item removes the sprout (and Settle leaves it where it is).
      keep(g, b, v) { return !!(v & ASSET); },
      // Empty, as Protect sees it: nothing above the bed, and no stone or mole anywhere.
      clean(g, b) {
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = b.get(x, y); if (v && (y >= BED || v & (FOREIGN | MOLE))) return false; }
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
      step(g, res) {
        const ev = step(g, this.G, g.board);
        res.guard = ev;
        if (this.G.leaves <= 0) { ev.out = true; g.end('wilted'); }
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

  const PART = {
    key: 'protect', order: 40, mode: 'protect', owns: ['protect'], options: { 'protect.level': IDS.slice() },
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
    summary(x) { return isObj(x) && isObj(x.st) ? summaryOf(x) : null; },
    stats: { free: { guard: { waves: 0, stones: 0, hits: 0, taps: 0, lost: 0, boxed: 0, boxedHard: 0, swept: 0, wilted: 0 } } },
  };
  Recipe.part(PART);

  // ---- achievements: counted on any Protect board 6 wide or more ----------------------------------------------------

  if (L.Achievements) {
    const counts = (r, g) => on(r) && !!g && g.w >= 6;
    const G = (e) => of(e.g);
    const hardish = (e) => { const x = G(e); return !!x && x.level !== 'easy'; };
    L.Achievements.group({
      id: 'protect', name: 'Protect', icon: 'protect', after: 'play',
      list: [
        { id: 'pr_wave5', name: 'Green Thumb', desc: 'Get through 5 waves on one Protect board.', pay: 150, on: 'play', counts, test: (s, e) => (G(e) || { st: {} }).st.waves >= 5 },
        { id: 'pr_wave20', name: 'Night Watch', desc: 'Get through 20 waves on one board, Medium or Hard.', pay: 600, on: 'play', counts, test: (s, e) => hardish(e) && G(e).st.waves >= 20 },
        { id: 'pr_boxed', name: 'Curled Up', desc: 'Box in 25 moles, Medium or Hard.', pay: 300, on: 'play', counts, test: (s) => (s.stats.free.guard || {}).boxedHard >= 25, progress: (s) => [Math.min(25, (s.stats.free.guard || {}).boxedHard || 0), 25] },
        { id: 'pr_clean', name: 'Not a Leaf', desc: '8 waves in a row on Hard with no leaf lost. No power-ups, Undo included.', pay: 1000, tier: 'legend', on: 'play', counts, test: (s, e) => { const x = G(e); return !!x && x.level === 'hard' && x.clean >= 8; } },
      ],
    });
  }

  L.Guard = { LEVELS, IDS, NAMES, LEAVES, BED, MAX_MOLES, STONE, SPROUT, moleCell, isStone, isMole, slotOf, on, sproutOf, colTop, create, place, valid, planWave, route, step, preview, molesOn, itemsUsed, of, summaryOf, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
