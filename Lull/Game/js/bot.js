// Lull — the player you can watch in Classic (Watch: js/watch.js): where a piece can go, what a stack is worth, the
// choice over the pieces it can see, the mistakes it can be asked to make, and its hands (the keys it presses, and
// when). Pure, no DOM: the page drives it a frame at a time, and a test runs whole games of it headless (simulate).
//
// Where a piece can go (reach): every spot it can get to from where it is, by the engine's own moves (left, right,
// down a row, the three turns with their kicks, Classic's turn at the ceiling), each with the moves that get it there.
// A spot reached by a turn as the last move is kept apart for the T: set there it is a Twist (or a Mini), as the
// engine's lock will count it. The board is rows of bits (bit x of rows[y]: the cell is filled).
//
// What a stack is worth (worth): holes and the blocks over them, rows and columns that change from filled to empty,
// bumps, one well kept open for a Quad and its rows ready, a slot a T could twist into, and the height, feared the more
// the faster the pieces fall. What a set is worth on top (clearWorth): a Quad, a Twist, the Streak kept or broken,
// Spotless; small clears are a waste while the stack is low and welcome once it is not.
//
// The choice (think): a beam over the pieces in sight (the piece in play, Hold, the Next pieces the rules show), each
// first move ranked by the best it leads to. A generator: the page runs it in slices of a millisecond or two a frame.
// rank, judge and explain are the same eye for a page that teaches: every placement ranked, where a player's set stands
// among them, and a stack's worth feature by feature.
//
// Its hands (Driver), in two styles. Human: a top player's, by a model of a hand rather than waits drawn at random: a
// look at each piece (a reaction to one not seen coming, a glance at one planned from the Next), a decision as long as
// the call is close, then the keys at a hand's cadence (taps, a long slide held, a held soft drop, the drop), its tempo
// drifting slowly as a player's does; never quicker than a top player (about three pieces a second, fifteen presses),
// and only ever aiming where those hands can get to before the piece falls past, so at the fastest speeds it plays
// worse and tops out where people do. Unrestrained: near perfect, a wider search, a key a frame and a short beat a
// piece, no human limit. Mistakes (Off, Rare, Some, Often; Human only): now and then, at random, a lesser placement or a
// lapse, never one that would end the game; then it plays on from the board it made.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;
  if (!Pieces || !RNG) return;

  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());

  function popcount(v) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

  // ---- shapes and boards -------------------------------------------------------------------------------------------

  /** The two corners on the side the T points to, per turn (box coordinates, y up: the engine's T_FRONT). */
  const T_FRONT = [[[0, 2], [2, 2]], [[2, 0], [2, 2]], [[0, 0], [2, 0]], [[0, 0], [0, 2]]];

  const SHAPES = new WeakMap();
  /**
   * A piece type's turns as bit rows: [{ bw, bh, minX, minY, maxY, m }] (m[dy]: the cells of the box's row dy), with
   * dOf[r] (the first turn that covers the same cells: O has one shape, I, S and Z two) and its kicks (kk[r]: clockwise,
   * counter-clockwise, half turn; null for a piece that does not turn).
   */
  function shapeOf(type) {
    let s = SHAPES.get(type);
    if (s) return s;
    s = type.rots.map((cells, r) => {
      const b = type.rotBounds[r], m = new Int32Array(b.h);
      for (const [x, y] of cells) m[y - b.minY] |= 1 << (x - b.minX);
      return { bw: b.w, bh: b.h, minX: b.minX, minY: b.minY, maxY: b.maxY, m, key: b.w + ':' + Array.from(m).join(',') };
    });
    s.dOf = s.map((t) => s.findIndex((u) => u.key === t.key));
    s.kk = type.kicks === 'none' ? null : [0, 1, 2, 3].map((r) => [Pieces.kicksFor(type, r, (r + 1) % 4), Pieces.kicksFor(type, r, (r + 3) % 4), Pieces.kicksFor(type, r, (r + 2) % 4)]);
    SHAPES.set(type, s);
    return s;
  }

  /** rows[y]: the filled cells of row y as bits. */
  function rowsOf(board, out) {
    const W = board.w, H = board.h, c = board.cells, rows = out || new Int32Array(H);
    for (let y = 0; y < H; y++) { let m = 0; const o = y * W; for (let x = 0; x < W; x++) if (c[o + x]) m |= 1 << x; rows[y] = m; }
    return rows;
  }

  /** out[py]: the columns px where the turn t fits with its box's bottom-left at (px, py). */
  function fitMap(rows, W, H, t, out) {
    const full = (1 << W) - 1, lim = W - t.bw, pxMask = lim < 0 ? 0 : (1 << (lim + 1)) - 1;
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

  /** The board with a turn set at (px, py), its full rows taken away: { rows, lines }. */
  function setAndClear(rows, W, H, t, px, py) {
    const full = (1 << W) - 1, out = new Int32Array(H);
    let n = 0, lines = 0;
    for (let y = 0; y < H; y++) {
      let r = rows[y];
      const dy = y - py;
      if (dy >= 0 && dy < t.bh) r |= t.m[dy] << px;
      if (r === full) { lines++; continue; }
      out[n++] = r;
    }
    return { rows: out, lines };
  }

  // ---- where a piece can go ----------------------------------------------------------------------------------------

  // The moves, as the search and the Driver know them, and the action each one is in the game.
  const MOVES = [null, 'L', 'R', 'D', 'CW', 'CCW', 'R180'];
  const ACTION = { L: 'moveL', R: 'moveR', D: 'lower', CW: 'cw', CCW: 'ccw', R180: 'r180' };

  const BUF = { N: 0 };
  function buffers(N, H) {
    if (BUF.N < N || BUF.H !== H) {
      Object.assign(BUF, { N, H, par: new Int32Array(N), mv: new Int8Array(N), q: new Int32Array(N), par1: new Int32Array(N), mv1: new Int8Array(N), q1: new Int32Array(N),
        spin: new Int32Array(N), spinMv: new Int8Array(N), spinKick: new Int8Array(N), simple: new Int32Array(N), kick: new Int8Array(N), kick1: new Int8Array(N), dep: new Float32Array(N), dep1: new Float32Array(N), F: [0, 1, 2, 3].map(() => new Int32Array(H)) });
    }
    return BUF;
  }

  /**
   * Every spot a piece can get to from `start` ({ rot, x, y }), on a board of W × H (`rows`), as the engine moves it:
   *   o: { r180 (the half turn is there), ceiling (Classic: a turn touching the ceiling stays touching it, as
   *        Game.rotate does), twist (find the T's spins), rate (rows the piece falls by itself between two keys, a
   *        fraction or more: gravity at the hand's pace, so a spot a hand could not get to before the piece falls past
   *        it is left out; the rows add up over the moves, so 0.4 is a row every two or three keys), start (rows it
   *        falls before the first key, a fraction too), sticky (Retro lock at speed: a piece that comes to rest sets on
   *        the next tick, so nothing moves on from a resting spot), turn (what a turn counts for, as moves go: 1, or
   *        less for a hand that turns with one hand while the other slides); fall and startFall: rate and start as
   *        whole rows }
   * Two searches: one with no step down (turns and slides at the height it is: then a drop is all it takes, `simple`),
   * and one with every move (tucks under ledges, spins into slots). Returns { places: [...], route(place) } where a
   * place is { r, x, y, px, py, simple, twist: 0 | 1 (Mini) | 2, kick, spinFrom } and route gives its moves ('L', 'R',
   * 'D', 'CW', 'CCW', 'R180', then 'drop'). Read before the next search (the buffers are shared).
   */
  function reach(rows, W, H, type, start, o) {
    o = o || {};
    const sh = shapeOf(type), N = 4 * H * W, B = buffers(N, H);
    const F = B.F;
    for (let r = 0; r < 4; r++) fitMap(rows, W, H, sh[r], F[r]);
    const fits = (r, px, py) => px >= 0 && py >= 0 && px < W && py < H && ((F[r][py] >>> px) & 1) === 1;
    const idx = (r, px, py) => (r * H + py) * W + px;
    const turns = sh.kk ? (o.r180 ? 3 : 2) : 0;
    const ceiling = !!o.ceiling, isT = type.id === 'T' && o.twist !== false;
    /** The spot a turn d of (r, px, py) lands on (the first kick that fits), as idx; -1 when none does. kickOut[0]: which kick. */
    const kickOut = [0];
    const turn = (r, px, py, d) => {
      const t = d === 0 ? (r + 1) % 4 : d === 1 ? (r + 3) % 4 : (r + 2) % 4, a = sh[r], b = sh[t], kicks = sh.kk[r][d];
      const x = px - a.minX, y = py - a.minY;
      const lift = ceiling && y + a.maxY === H - 1 ? H - 1 - b.maxY - y : null;
      for (let k = 0; k < kicks.length; k++) {
        const ky = lift != null ? lift + Math.min(0, kicks[k][1]) : kicks[k][1];
        const nx = x + kicks[k][0] + b.minX, ny = y + ky + b.minY;
        if (fits(t, nx, ny)) { kickOut[0] = k; return idx(t, nx, ny); }
      }
      return -1;
    };
    const s0 = sh[start.rot], spx = start.x + s0.minX;
    let spy = start.y + s0.minY;
    const out = { places: [], count: 0 };
    if (!fits(start.rot, spx, spy)) return Object.assign(out, { route: () => null });
    // Gravity between keys: by its d-th move it has fallen floor(f0 + d × rate) rows since the first key (f0: the part
    // of a row it had fallen before it), so the rows come as they would at that pace (none at an easy one).
    // (A turn counts as o.turn of a move: a hand presses it with the other's slide, all but together.)
    const tc = o.turn != null ? o.turn : 1;
    const rate = Math.max(0, o.rate != null ? +o.rate || 0 : o.fall | 0), sf = Math.max(0, o.start != null ? +o.start || 0 : o.startFall | 0);
    const f0 = sf - Math.floor(sf);
    const rowsBy = (d) => Math.floor(f0 + d * rate + 1e-9);
    const settle = (j, d0, d) => {
      if (!rate || j < 0) return j;
      const px = j % W, r = (j / (W * H)) | 0;
      let py = ((j / W) | 0) % H, n = rowsBy(d) - rowsBy(d0);
      while (n-- > 0 && py > 0 && fits(r, px, py - 1)) py--;
      return idx(r, px, py);
    };
    for (let n = Math.floor(sf); n > 0 && spy > 0 && fits(start.rot, spx, spy - 1); n--) spy--;
    const sticky = !!o.sticky;
    const par = B.par, mv = B.mv, q = B.q, par1 = B.par1, mv1 = B.mv1, q1 = B.q1, spin = B.spin, spinMv = B.spinMv, spinKick = B.spinKick, simple = B.simple, kick = B.kick, kick1 = B.kick1;
    // (dep, dep1: the moves it took to get to a spot, for the rows fallen on the way.)
    const dep = B.dep, dep1 = B.dep1;
    par.fill(-2, 0, N); par1.fill(-2, 0, N); spin.fill(-2, 0, N); simple.fill(-2, 0, N);
    const rests = (r, px, py) => py === 0 || !fits(r, px, py - 1);
    const dropTo = (r, px, py) => { while (py > 0 && fits(r, px, py - 1)) py--; return idx(r, px, py); };

    // 1. Turns and slides only (a drop from any of these is a plain drop): turns first, so a route turns, then slides.
    let qh = 0, qt = 0;
    const i0 = idx(start.rot, spx, spy);
    out.start = i0;
    par1[i0] = -1; dep1[i0] = 0; q1[qt++] = i0;
    while (qh < qt) {
      const i = q1[qh++], px = i % W, py = ((i / W) | 0) % H, r = (i / (W * H)) | 0, d0 = dep1[i], dn = d0 + 1, dt = d0 + tc;
      if (sticky && qh > 1 && (py === 0 || !fits(r, px, py - 1))) continue;
      for (let d = 0; d < turns; d++) {
        let j = turn(r, px, py, d);
        if (j < 0) continue;
        // (A turn that fell on afterwards is no spin: its kick is kept as -1.)
        const j0 = j, k1 = kickOut[0];
        j = settle(j, d0, dt);
        if (par1[j] === -2) { par1[j] = i; mv1[j] = 4 + d; kick1[j] = j === j0 ? k1 : -1; dep1[j] = dt; q1[qt++] = j; }
      }
      if (fits(r, px - 1, py)) { const j = settle(i - 1, d0, dn); if (par1[j] === -2) { par1[j] = i; mv1[j] = 1; dep1[j] = dn; q1[qt++] = j; } }
      if (fits(r, px + 1, py)) { const j = settle(i + 1, d0, dn); if (par1[j] === -2) { par1[j] = i; mv1[j] = 2; dep1[j] = dn; q1[qt++] = j; } }
    }
    for (let k = 0; k < qt; k++) {
      const i = q1[k], px = i % W, py = ((i / W) | 0) % H, r = (i / (W * H)) | 0, j = dropTo(r, px, py);
      if (simple[j] === -2) simple[j] = i;
    }
    // 2. Every move: down a row too (the soft drop), so under ledges and into slots.
    qh = 0; qt = 0;
    par[i0] = -1; dep[i0] = 0; q[qt++] = i0;
    while (qh < qt) {
      const i = q[qh++], px = i % W, py = ((i / W) | 0) % H, r = (i / (W * H)) | 0, d0 = dep[i], dn = d0 + 1, dt = d0 + tc;
      if (sticky && qh > 1 && (py === 0 || !fits(r, px, py - 1))) continue;
      for (let d = 0; d < turns; d++) {
        const j0 = turn(r, px, py, d);
        if (j0 < 0) continue;
        const k0 = kickOut[0], j = settle(j0, d0, dt);
        if (par[j] === -2) { par[j] = i; mv[j] = 4 + d; kick[j] = j === j0 ? k0 : -1; dep[j] = dt; q[qt++] = j; }
        // A T turned into a spot where it rests: set right there, a spin (the far kick, the fifth, makes any one full).
        if (isT && j === j0) {
          const jx = j % W, jy = ((j / W) | 0) % H, jr = (j / (W * H)) | 0;
          if (rests(jr, jx, jy) && (spin[j] === -2 || (k0 === 4 && spinKick[j] !== 4))) { spin[j] = i; spinMv[j] = 4 + d; spinKick[j] = k0; }
        }
      }
      if (fits(r, px - 1, py)) { const j = settle(i - 1, d0, dn); if (par[j] === -2) { par[j] = i; mv[j] = 1; dep[j] = dn; q[qt++] = j; } }
      if (fits(r, px + 1, py)) { const j = settle(i + 1, d0, dn); if (par[j] === -2) { par[j] = i; mv[j] = 2; dep[j] = dn; q[qt++] = j; } }
      if (py > 0 && fits(r, px, py - 1)) { const j = settle(i - W, d0, dn); if (par[j] === -2) { par[j] = i; mv[j] = 3; dep[j] = dn; q[qt++] = j; } }
    }
    out.count = qt;
    // The resting spots, each set of cells once (the plain one); a T's spun ones besides, as their own places. A plain
    // route that happens to end with a turn into the spot is a spin too (the engine counts the last move): said so.
    const seen = new Set();
    const blocked = (x, y) => x < 0 || x >= W || y < 0 || (y < H && ((rows[y] >>> x) & 1) === 1);
    const twistAt = (r, x, y, k) => {
      let corners = 0;
      for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (!(ceiling && y + dy >= H) && blocked(x + dx, y + dy)) corners++;
      if (corners < 3) return 0;
      const front = T_FRONT[r].filter(([dx, dy]) => !(ceiling && y + dy >= H) && blocked(x + dx, y + dy)).length;
      return front === 2 || k === 4 ? 2 : 1;
    };
    for (let k = 0; k < qt; k++) {
      const i = q[k], px = i % W, py = ((i / W) | 0) % H, r = (i / (W * H)) | 0;
      if (!rests(r, px, py)) continue;
      const key = idx(sh.dOf[r], px, py);
      const plain = !seen.has(key);
      seen.add(key);
      const x = px - sh[r].minX, y = py - sh[r].minY;
      if (plain) {
        const si = simple[i] !== -2 ? simple[i] : simple[key];
        const pl = { i, r, x, y, px, py, simple: si !== -2, twist: 0, si };
        if (isT) {
          // The state the drop is pressed from: the plain drop's (a drop of no rows keeps a turn), else the spot itself.
          if (si !== -2) { if (si === i && mv1[i] >= 4 && kick1[i] >= 0) pl.twist = twistAt(r, x, y, kick1[i]); }
          else if (mv[i] >= 4 && kick[i] >= 0) pl.twist = twistAt(r, x, y, kick[i]);
        }
        out.places.push(pl);
      }
      if (isT && spin[i] !== -2) {
        const tw = twistAt(r, x, y, spinKick[i]);
        const last = out.places[out.places.length - 1];
        if (tw && !(last && last.i === i && last.twist === tw)) out.places.push({ i, r, x, y, px, py, simple: false, twist: tw, kick: spinKick[i], spun: true });
      }
    }
    // A route, read now (before another search): the plain drop if there is one, else the way in, then the drop.
    const back = (i, P, M) => { const m = []; while (i >= 0 && P[i] !== -1) { m.push(MOVES[M[i]]); i = P[i]; } return m.reverse(); };
    out.route = (pl) => {
      if (pl.spun) return back(spin[pl.i], par, mv).concat([MOVES[spinMv[pl.i]], 'drop']);
      if (pl.si !== -2) return back(pl.si, par1, mv1).concat(['drop']);
      const m = back(pl.i, par, mv);
      while (m.length && m[m.length - 1] === 'D') m.pop();
      return m.concat(['drop']);
    };
    return out;
  }

  /** Where a type appears on this game ({ rot, x, y }), as the game would place it (Classic: flush with the ceiling). */
  function spawnOf(game, type) {
    const pos = game.spawnPosition(type, 0);
    return { rot: pos.rot != null ? pos.rot : 0, x: pos.x, y: pos.y };
  }

  // ---- what a stack is worth ---------------------------------------------------------------------------------------

  /**
   * The weights (tuned by long seeded runs: scripts/bot-soak.cjs). Every one is a cost or a gain in the same units;
   * a hole is about six.
   */
  const W8 = {
    hole: 5.5, holeRow: 3.2, land: 0.25, covered: 0.55, rowT: 0.42, colT: 0.6, bump: 0.32, bump2: 0.07, height: 0.04,
    well: 0.85, wellEdge: 0.5, wellMax: 5, ready: 0.75, otherWell: 1.6,
    danger: 1.1, dangerFrom: 0.42, reach: 1.5, reachDeep: 6, wellFast: 3, slot2: 4.2, slot1: 1.2, slot3: 6,
    clear: [0, -2.4, -1.8, -1.0, 9.5], twist: [1.2, 4.5, 11, 15], mini: [0.4, 1.6, 2.5],
    streak: 2.5, streakBreak: 4.0, spotless: 45, combo: 0.35,
  };

  const SCRATCH = { hgt: new Int32Array(32) };
  /**
   * What a stack is worth (higher is better), with danger from the height: ctx.urgency (0, slow; 1, the fastest
   * gravity) brings the height it starts to fear down; ctx.tsoon: a T in sight (its slots count for more). parts
   * (optional): filled with each feature, as { n (how many), v (what it adds to the worth) } (see explain).
   */
  function worth(rows, W, H, ctx, parts) {
    const full = (1 << W) - 1, hgt = SCRATCH.hgt, E = W8;
    let top = 0, seen = 0;
    for (let x = 0; x < W; x++) hgt[x] = 0;
    for (let y = H - 1; y >= 0 && seen !== full; y--) {
      let nw = rows[y] & ~seen;
      if (!nw) continue;
      if (!top) top = y + 1;
      seen |= nw;
      while (nw) { const b = nw & -nw; hgt[31 - Math.clz32(b)] = y + 1; nw ^= b; }
    }
    // Holes (an empty cell under a block), the rows that hold one, and the blocks over each (four at most count).
    let holes = 0, holeRows = 0, cover = 0, rowT = 0, colT = 0, prev = full;
    for (let y = top - 1; y >= 0; y--) {
      const r = rows[y], hl = cover & ~r & full;
      if (hl) { holes += popcount(hl); holeRows++; }
      cover |= r;
    }
    for (let y = 0; y < top; y++) {
      const r = rows[y], t = (r << 1) | 1 | (1 << (W + 1));
      rowT += popcount((t ^ (t >>> 1)) & ((1 << (W + 1)) - 1));
      colT += popcount((r ^ prev) & full);
      prev = r;
    }
    let covered = 0;
    if (holes) {
      for (let x = 0; x < W; x++) {
        let filled = 0;
        for (let y = hgt[x] - 1; y >= 0; y--) { if ((rows[y] >>> x) & 1) filled++; else covered += Math.min(filled, 4); }
      }
    }
    // The well: the lowest column, as deep as its lower neighbour (a wall is as high as can be).
    let wc = 0;
    for (let x = 1; x < W; x++) if (hgt[x] < hgt[wc]) wc = x;
    const nb = (x) => Math.min(x > 0 ? hgt[x - 1] : 99, x < W - 1 ? hgt[x + 1] : 99);
    const depth = Math.max(0, nb(wc) - hgt[wc]);
    let bump = 0, bump2 = 0, sum = 0, otherWells = 0;
    for (let x = 0; x < W; x++) {
      sum += hgt[x];
      if (x < W - 1 && x !== wc && x + 1 !== wc) { const d = Math.abs(hgt[x] - hgt[x + 1]); bump += d; bump2 += d * d; }
      if (x !== wc) { const d = nb(x) - hgt[x]; if (d >= 3) otherWells += d - 2; }
    }
    // Rows ready for a Quad: filled but for the well, from its floor up.
    let ready = 0;
    for (let y = hgt[wc]; y < top && ready < 4; y++) { if ((rows[y] | (1 << wc)) === full && !((rows[y] >>> wc) & 1)) ready++; else break; }
    // Blocks where the next piece appears (the middle of the top two rows): that is the game over.
    let blocked = 0;
    if (top >= H - 1) { const mid = ((1 << 4) - 1) << ((W >> 1) - 2); blocked = popcount(rows[H - 1] & mid) + popcount(rows[H - 2] & mid); }
    const u = ctx ? ctx.urgency || 0 : 0;
    const from = H * (E.dangerFrom - 0.17 * u), over = Math.max(0, top - from);
    // On Retro lock a piece that comes to rest sets: the stack must stay under the rows a piece falls on its way to the
    // far wall (ctx.reach), or the wall is out of reach.
    const reachOver = ctx && ctx.reach ? Math.max(0, top - (H - 4 - ctx.reach)) : 0;
    let v = -E.hole * holes - E.holeRow * holeRows - E.covered * covered - E.rowT * rowT - E.colT * colT - E.bump * bump - E.bump2 * bump2 - E.height * sum
      - E.otherWell * otherWells - E.danger * over * over - E.reach * reachOver * reachOver - 1000 * blocked;
    // A well and its ready rows are worth keeping while the stack is safe; once it is high, only getting down counts.
    // (intent: how far it may build for Quads, by what it can see coming: none with no Next and no Hold.)
    const safe = Math.max(0, 1 - over / 4) * (ctx && ctx.intent != null ? ctx.intent : 1);
    // (A deep well is for a hand that can get a piece to it in time: on Retro lock at speed, a shallow one.)
    const wm = ctx && ctx.reach > E.reachDeep ? E.wellFast : E.wellMax;
    const wellV = depth > 0 ? safe * (E.well * Math.min(depth, wm) + (wc === 0 || wc === W - 1 ? E.wellEdge : 0) + E.ready * ready) - (depth > wm ? (depth - wm) * 1.2 : 0) : 0;
    // A slot a T could twist into: its worth, and its roof's hole forgiven (that hole is the slot).
    let slotV = 0, sw = 0;
    if (safe > 0.5 && top < H * 0.6) { sw = slots(rows, W, top, hgt); if (sw) slotV = (sw + E.hole + E.holeRow + E.covered) * (ctx && ctx.tsoon ? 1 : 0.6); }
    v += wellV + slotV;
    if (parts) {
      const f = (n, v) => ({ n, v });
      Object.assign(parts, {
        holes: f(holes, -E.hole * holes), holeRows: f(holeRows, -E.holeRow * holeRows), covered: f(covered, -E.covered * covered),
        rowTransitions: f(rowT, -E.rowT * rowT), colTransitions: f(colT, -E.colT * colT), bumps: f(bump, -E.bump * bump - E.bump2 * bump2),
        height: f(sum, -E.height * sum), otherWells: f(otherWells, -E.otherWell * otherWells), danger: f(over, -E.danger * over * over), reach: f(reachOver, -E.reach * reachOver * reachOver),
        blocked: f(blocked, -1000 * blocked), well: f(depth, wellV), ready: f(ready, 0), slot: f(sw ? 1 : 0, slotV),
      });
    }
    return v;
  }

  /**
   * What a stack is worth, feature by feature (for a page that teaches from it): { total (worth's own number), parts:
   * { holes, holeRows, covered, rowTransitions, colTransitions, bumps, height, otherWells, danger, reach, blocked, well (its
   * depth; its ready rows are in its v), ready, slot } each { n, v } } where n is how many (cells, rows, columns or
   * steps) and v what it adds to the total (a cost is below 0). The parts' v add up to the total.
   */
  function explain(rows, W, H, ctx) {
    const parts = {}, total = worth(rows, W, H, ctx, parts);
    return { total, parts };
  }

  /**
   * A slot a T could twist into (pointing down, under an overhang on one side, with both its front corners filled):
   * the best one's worth, by the rows it would fill.
   */
  function slots(rows, W, top, hgt) {
    const full = (1 << W) - 1, E = W8;
    let best = 0;
    for (let y = 0; y + 2 < top + 1 && y < 30; y++) {
      for (let x = 0; x + 2 < W; x++) {
        const r0 = rows[y], r1 = rows[y + 1] || 0, r2 = rows[y + 2] || 0;
        // The T's cells: (x+1, y) and (x..x+2, y+1) empty; its front corners (x, y), (x+2, y) filled; just one roof.
        if ((r0 >>> (x + 1)) & 1 || ((r1 >>> x) & 7) || !((r0 >>> x) & 1) || !((r0 >>> (x + 2)) & 1)) continue;
        if (y > 0 && !((rows[y - 1] >>> (x + 1)) & 1)) continue;
        const roofL = (r2 >>> x) & 1, roofR = (r2 >>> (x + 2)) & 1;
        if (roofL === roofR || ((r2 >>> (x + 1)) & 1)) continue;
        // Over the open corner nothing at all (the T comes in from there).
        const ox = roofL ? x + 2 : x;
        if (hgt[ox] > y + 1) continue;
        const n = ((r0 | (1 << (x + 1))) === full ? 1 : 0) + ((r1 | (7 << x)) === full ? 1 : 0);
        const w = n === 2 ? E.slot2 : n === 1 ? E.slot1 : 0;
        if (w > best) best = w;
      }
    }
    return best;
  }

  /**
   * What a set is worth beyond the stack it leaves: its clear (a Quad, a Twist, the Streak, Spotless, a combo). s:
   * { b2b, combo } before it (the game's own counting: -1 is none); returns { v, b2b, combo }.
   */
  function clearWorth(lines, twist, s, empty, high, intent) {
    const E = W8;
    // A small clear costs only while there is a Quad to wait for (intent) and the stack is low (high: 0).
    high = 1 - (1 - high) * (intent == null ? 1 : intent);
    let v = 0, b2b = s.b2b, combo = s.combo;
    if (!lines) return { v: twist === 2 ? E.twist[0] : 0, b2b, combo: -1 };
    combo++;
    const difficult = lines >= 4 || twist > 0;
    if (twist === 2) v += E.twist[Math.min(lines, 3)];
    else if (twist === 1) v += E.mini[Math.min(lines, 2)];
    else v += lines >= 4 ? E.clear[4] : E.clear[lines] * (1 - high);
    if (difficult) { if (b2b >= 0) v += E.streak; b2b++; }
    else if (b2b >= 0) { v -= E.streakBreak * (1 - high); b2b = -1; }
    if (combo > 0) v += E.combo * combo;
    if (empty) v += E.spotless;
    return { v, b2b, combo };
  }

  // ---- the choice --------------------------------------------------------------------------------------------------

  /**
   * What the bot can see of a game, as a plain picture (the search never touches the game): the board, the piece in
   * play and where it is, Hold (and whether it may be used now), the Next pieces the rules show, the Streak and combo.
   *   rules: { hold, r180, next }   urgency: 0 (slow) to 1 (the fastest gravity)
   */
  function view(game, rules, urgency) {
    const p = game.piece;
    const vis = game.queue.slice(0, Math.max(0, rules.next | 0)).map((e) => e.id);
    return {
      W: game.w, H: game.h, rows: rowsOf(game.board), ceiling: !!game.ceiling,
      cur: p ? { id: p.type.id, rot: p.rot, x: p.x, y: p.y } : null,
      hold: rules.hold ? (game.hold ? game.hold.id : null) : null, holdRule: !!rules.hold && !game.mods.noHold, holdOk: !!rules.hold && !game.holdLocked && !game.mods.noHold,
      queue: vis, b2b: game.s.b2b, combo: game.s.combo, r180: rules.r180 !== false, urgency: urgency || 0,
      spawn: (id) => spawnOf(game, Pieces.get(id)),
    };
  }

  /**
   * The choice, as a generator (it yields after each piece it looks at, so a slice stays short). Returns the first
   * moves ranked best first: [{ hold, id, r, x, y, twist, simple, lines, value, rows, route }] (route: from where the
   * piece is now; with hold, from where the swapped piece appears). o: { beam, depth }. v: view(), with the pace's
   * fall and startFall when the pieces fall fast (see reach).
   */
  function* think(v, o) {
    o = o || {};
    const W = v.W, H = v.H, beamW = o.beam || 10, depth = Math.min(o.depth == null ? 3 : o.depth, v.queue.length);
    const tIn = (n) => n.hold === 'T' || v.queue.slice(n.qi, n.qi + 3).includes('T');
    // How far to build for Quads and Twists: by the pieces it can see coming (no Next and no Hold: survival only).
    const intent = Math.min(1, (v.queue.length + (v.holdRule ? 2 : 0)) / 3);
    const ctxOf = (n) => ({ urgency: v.urgency, tsoon: tIn(n), intent, reach: v.reach || 0 });
    // Each piece falls `rate` rows a key and `start` before the first; a later one (seen coming, so planned already)
    // startNext (v: the Driver's reading of the pace; fall and startFall, whole rows, are the same).
    const rate = v.rate != null ? v.rate : v.fall || 0, st = v.start != null ? v.start : v.startFall || 0;
    const opts = { r180: v.r180, ceiling: v.ceiling, twist: true, rate, start: st, sticky: !!v.sticky, turn: v.turn != null ? v.turn : 1 };
    const optsNext = Object.assign({}, opts, { start: v.startNext != null ? v.startNext : st });
    /** One piece set every way it can go, from a node: its children. */
    const expand = (n, id, start, holdNext, qiNext, first) => {
      const type = Pieces.get(id), res = reach(n.rows, W, H, type, start, first ? opts : optsNext), kids = [];
      const high = Math.min(1, Math.max(0, (heightOf(n.rows, H) - H * 0.45) / (H * 0.25)));
      for (const pl of res.places) {
        const sc = setAndClear(n.rows, W, H, shapeOf(type)[pl.r], pl.px, pl.py);
        const empty = sc.lines > 0 && sc.rows[0] === 0;
        const cw = clearWorth(sc.lines, pl.twist, n, empty, high, intent);
        // Where it lands: the lower the better (its middle row, before the clear).
        const land = pl.py + shapeOf(type)[pl.r].bh / 2;
        const kid = { rows: sc.rows, hold: holdNext, qi: qiNext, b2b: cw.b2b, combo: cw.combo, acc: n.acc + cw.v - W8.land * land, root: n.root };
        kid.value = kid.acc + worth(sc.rows, W, H, ctxOf(kid));
        if (first) kid.root = { hold: first.hold, id, r: pl.r, x: pl.x, y: pl.y, px: pl.px, py: pl.py, twist: pl.twist, simple: pl.simple, spun: !!pl.spun, lines: sc.lines, rows: sc.rows, route: res.route(pl), value: -Infinity, own: kid.value };
        kids.push(kid);
      }
      return kids;
    };
    const root = { rows: v.rows, hold: v.hold, qi: 0, b2b: v.b2b, combo: v.combo, acc: 0, root: null };
    const cur = v.cur;
    if (!cur) return [];
    let level = expand(root, cur.id, cur, v.hold, 0, { hold: false });
    yield;
    if (v.holdOk) {
      // Hold: the held piece comes in (or, with none held, the next one), the piece in play goes to Hold.
      const other = v.hold || v.queue[0];
      if (other && other !== cur.id) { level = level.concat(expand(root, other, v.spawn(other), cur.id, v.hold ? 0 : 1, { hold: true })); yield; }
    }
    const roots = level.map((k) => k.root);
    for (const k of level) k.root.value = Math.max(k.root.value, k.value);
    let ply = 0;
    while (ply < depth && level.length) {
      level.sort((a, b) => b.value - a.value);
      const beam = level.slice(0, beamW);
      const next = [];
      for (const n of beam) {
        const id = v.queue[n.qi];
        if (!id) continue;
        const kids = expand(n, id, v.spawn(id), n.hold, n.qi + 1);
        for (const k of kids) next.push(k);
        if (v.holdRule) {
          // Hold again on a later piece (it is free again once a piece is set).
          const other = n.hold || v.queue[n.qi + 1];
          if (other && other !== id) for (const k of expand(n, other, v.spawn(other), id, n.hold ? n.qi + 1 : n.qi + 2)) next.push(k);
        }
        yield;
      }
      for (const k of next) if (k.value > k.root.value) k.root.value = k.value;
      level = next;
      ply++;
    }
    // Nothing in sight (no Next, nothing in Hold): the best few first moves by what the unseen next piece could make of
    // them, each of the seven as likely (and its worst a quarter of the say: a stack that only an I can save is no
    // stack); the rest after them, in their own order.
    if (!v.queue.length && !v.hold && o.guess !== false) {
      const top = level.slice().sort((a, b) => b.value - a.value).slice(0, o.guessTop || 6), seen = new Set();
      for (const n of top) {
        if (seen.has(n.root)) continue;
        seen.add(n.root);
        let sum = 0, worst = Infinity;
        for (const id of Pieces.TETROMINOES) {
          let b = -1e4;
          for (const k of expand(n, id, v.spawn(id), n.hold, n.qi)) if (k.value > b) b = k.value;
          sum += b; worst = Math.min(worst, b);
          yield;
        }
        n.root.guess = 0.75 * sum / Pieces.TETROMINOES.length + 0.25 * worst;
      }
      for (const r of roots) r.value = r.guess != null ? r.guess : r.value - 1e3;
    }
    // A first move whose every line ends with the game over (the next piece cannot appear) is the last resort.
    roots.sort((a, b) => b.value - a.value || b.own - a.own);
    return roots;
  }

  /**
   * Every placement of the piece in play (and, with Hold, of the one Hold would bring), ranked best first, at once
   * (think run to its end): the API a page that judges a player's sets uses. v: view(game, rules, urgency), with
   * v.rate and v.start for the rows a piece falls on the way (left out: none, every spot it could rest on). o: think's
   * { beam, depth }. Each entry: { hold, id, r, x, y, twist, simple, lines, value (the best line of play it leads to),
   * own (what this set alone is worth), rows (the board after it, cleared rows taken away), route }.
   */
  function rank(v, o) {
    const it = think(v, o);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  /**
   * Where a set the player made stands among the ranked ones (rank's): matched by the board it left (rowsOf the board
   * after the lock). Returns { index (0: the best; -1: not among them), entry, best, loss (best.value - entry.value:
   * 0 for the best) }.
   */
  function judge(ranked, rowsAfter) {
    const index = ranked.findIndex((e) => sameRows(e.rows, rowsAfter)), entry = index >= 0 ? ranked[index] : null, best = ranked[0] || null;
    return { index, entry, best, loss: entry && best ? best.value - entry.value : null };
  }

  function heightOf(rows, H) { for (let y = H - 1; y >= 0; y--) if (rows[y]) return y + 1; return 0; }

  // ---- mistakes ------------------------------------------------------------------------------------------------------

  /**
   * The settings for mistakes: the chance a piece goes otherwise than its best (a lesser placement, or a lapse), and the
   * chance of a slip past the column (overshoot) on a slide. Off still slips now and then: hands are hands.
   */
  const MISTAKES = {
    off: { p: 0, slip: 0.025 },
    rare: { p: 0.035, slip: 0.06 },
    some: { p: 0.09, slip: 0.12 },
    often: { p: 0.18, slip: 0.2 },
  };
  const MISTAKE_IDS = ['off', 'rare', 'some', 'often'];
  const MISTAKE_NAMES = { off: 'Off', rare: 'Rare', some: 'Some', often: 'Often' };
  /** The lesser placements, second to fifth, as often as these. */
  const RANKS = [0.45, 0.27, 0.17, 0.11];

  /**
   * The placement to play from a ranked list (think's), with the mistakes asked for: { pick, kind } where kind is null
   * (the best), 'rank' (a lesser one), 'nohold' (Hold forgotten), 'notuck' (a tuck or spin skipped for a plain drop) or
   * 'late' (only slow). A lesser one is never one that would put the stack in danger (never deliberately losing): those
   * are left out, and with none left it plays the best. Draws on rng whatever happens (so a game's draws stay in step).
   */
  function choose(ranked, level, rng, H) {
    const M = MISTAKES[level] || MISTAKES.off, best = ranked[0];
    const roll = rng.next(), kindRoll = rng.next(), rankRoll = rng.next();
    if (!best || roll >= M.p) return { pick: best, kind: null };
    const safe = (c) => c && c.value > best.value - 30 && heightOf(c.rows, H) <= H * 0.6;
    if (heightOf(best.rows, H) > H * 0.55) return { pick: best, kind: null };
    if (kindRoll < 0.3) {
      if (best.hold) { const c = ranked.find((x) => !x.hold); if (safe(c)) return { pick: c, kind: 'nohold' }; }
      if (best.spun || !best.simple) { const c = ranked.find((x) => x.simple && !x.spun && x.hold === best.hold); if (safe(c)) return { pick: c, kind: 'notuck' }; }
      return { pick: best, kind: 'late' };
    }
    const pool = ranked.slice(1, 5);
    let acc = 0, k = 0;
    for (; k < pool.length - 1; k++) { acc += RANKS[k]; if (rankRoll < acc) break; }
    for (let j = k; j >= 0; j--) if (safe(pool[j])) return { pick: pool[j], kind: 'rank' };
    return { pick: best, kind: null };
  }

  // ---- its hands ----------------------------------------------------------------------------------------------------

  function gauss(rng) { let u = 0; while (!u) u = rng.next(); const v = rng.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /** A log-normal time: about `median` ms, spread by sigma. */
  function lognorm(rng, median, sigma) { return median * Math.exp(sigma * gauss(rng)); }

  /**
   * The two ways it plays (Watch's Human and Unrestrained). Times in ms.
   *
   * human: a top player's hands, as a model of what a hand does (no wait is drawn at random on its own). A piece takes
   * a look (a reaction to one it did not see coming, never under react; a glance at one it planned from the Next), a
   * decision (decide at most, for a close call; next to none when one placement is far ahead of the rest), then the
   * keys themselves: separate presses at its cadence (tap; one hand never quicker than tapMin, 15 a second, the two
   * hands a chord apart, a turn with the first slide; never more than taps presses in any second), a long slide held
   * (das, then a repeat every arr; on Retro lock, with no repeat to lean on, taps at retroTap, 15 a second at best), a
   * held soft drop (soft a row), a beat on the spot, the drop. Its tempo drifts slowly (drift: the spread of its log;
   * rho: how much of it a piece keeps), as a player settles into a rhythm and out of it, slower while it warms up (warm,
   * over its first pieces); each piece and key jitters a little. Never faster than a top player: pps pieces a second
   * over any ppsOver sets, burst over any burstOver. It searches what its hands can get to before the piece falls past.
   * unrestrained: near perfect, at no human pace: a wider search, a key a frame, each piece set no sooner than a short
   * fixed beat after it appears (so it can still be seen), never a mistake.
   * beam, depth: its search (think's). budget: ms of thinking a frame in the page; steps: a headless run's stand-in.
   */
  const STYLES = {
    human: {
      human: true, look: 185, react: 150, glance: 65, decide: 300, tap: 86, tapMin: 1000 / 15, taps: 15, chord: 25, retroTap: 67, das: 150, arr: 40, soft: 12, beat: 55,
      drift: 0.3, rho: 0.95, jitter: 0.07, warm: 0.2, pps: 3, ppsOver: 20, burst: 3.5, burstOver: 5, beam: 10, depth: 3, budget: 1.5, steps: 6,
    },
    unrestrained: { human: false, key: 16, beat: 100, beam: 20, depth: 4, budget: 5, steps: 14 },
  };
  const STYLE_IDS = ['human', 'unrestrained'];
  const STYLE_NAMES = { human: 'Human', unrestrained: 'Unrestrained' };

  /** The hand each action is pressed with: slides, the soft drop and the drop one (0), turns and Hold the other (1). */
  const HAND_OF = { moveL: 0, moveR: 0, lower: 0, drop: 0, cw: 1, ccw: 1, r180: 1, hold: 1 };

  /** Pushes x onto a log, keeping its last few thousand (a watched game can go on for hours). */
  function keep(a, x) { a.push(x); if (a.length > 6000) a.splice(0, 3000); }

  /**
   * The bot at the keys of one game. host: { game() (the game in play), send(action, rep) -> ok (as a key would:
   * through the board's own input), gravity() (seconds a row now), retro (Retro lock), rules() ({ hold, drop, r180,
   * next }) }. o: { seed, style ('human', 'unrestrained'), mistakes ('off' … 'often'), budget (ms of thinking a frame;
   * the style's when left out), steps (instead of a budget: so many pieces looked at a frame, a headless run's
   * stand-in for the clock) }. update(ms) moves it on by that much time: it thinks (in slices), waits as a hand would,
   * and presses the keys that are due. While a piece is being placed it already thinks about the next one on the board
   * it will leave (ponder), as a player reads the Next.
   */
  class Driver {
    constructor(host, o) {
      o = o || {};
      this.host = host;
      this.style = STYLES[o.style] ? o.style : 'human';
      this.mistakes = MISTAKES[o.mistakes] ? o.mistakes : 'off';
      const seed = o.seed == null ? (Math.random() * 4294967296) >>> 0 : o.seed;
      // Separate streams: what it chooses, and how its hands move (so a change of pace never changes a choice).
      this.rngMind = new RNG('bot:mind:' + seed);
      this.rngHand = new RNG('bot:hand:' + seed);
      this.budgetO = o.budget;
      this.steps = o.steps || 0;
      this.t = 0;
      this.piece = null;
      this.plan = null;
      this.gen = null;
      this.ponder = null;
      // The tempo's drift (its log), the pieces so far, the last separate press, the sets (for the caps).
      this.z = 0;
      this.n = 0;
      this.lastPress = -1e9;
      this.lastKey = -1e9;
      this.lastHand = [-1e9, -1e9];
      this.recent = [];
      this.locks = [];
      this.dropT = null;
      this.log = { pieces: 0, mistakes: 0, kinds: {}, slips: 0, replans: 0, commits: 0, pondered: 0, spawnAt: [], thinkMs: [], keys: [], firstKey: [], tempo: [] };
    }

    /** Its style's numbers. */
    get S() { return STYLES[this.style]; }
    get budget() { return this.budgetO != null ? this.budgetO : this.S.budget; }
    /** The mistakes it makes: the setting's, none when Unrestrained. */
    get errs() { return this.S.human ? this.mistakes : 'off'; }
    setMistakes(id) { if (MISTAKES[id]) this.mistakes = id; }
    /** Human or Unrestrained, from the next piece on (the keys of this one go on at the new pace). */
    setStyle(id) { if (STYLES[id]) { this.style = id; if (this.piece) this.paceNow = this.pace(this.host.game()); } }

    /**
     * The pace, for this piece: urgency (0 at ease, toward 1 when a piece meets the stack almost at once: the height it
     * fears comes down), the hand's tempo and a key's time, the longest a decision may take, and the rows the piece
     * falls between two keys (rate) and before the first (start: a piece not seen coming; startNext: one planned from
     * the Next), so the search keeps to the spots the hands can get to.
     */
    pace(G) {
      const S = this.S, iv = Math.max(1, this.host.gravity() * 1000), H = G.h, retro = !!this.host.retro;
      const room = Math.max(1, H - G.board.stackHeight() - 2);
      // The time a piece has before it meets the stack, with the rest the modern lock gives on top of it.
      const time = iv * room + (retro ? 0 : 350);
      const urgency = Math.max(0, Math.min(0.9, 1 - time / 1600));
      const rows = (ms) => ms / iv;
      // (Retro lock: the rows a piece falls on its way from where it appears to a far wall: five slides, a turn with them.)
      const reachOf = (start, rate) => (retro ? start + 5 * rate : 0);
      if (!S.human) return { urgency, tempo: 1, key: S.key, rate: rows(S.key) * 1.05, start: rows(S.key), startNext: rows(S.key), sticky: retro && rows(S.key) >= 0.5, decMax: 0, beam: S.beam, depth: S.depth, turn: 1, reach: reachOf(rows(S.key), rows(S.key)) };
      // Its tempo: the slow drift, slower while it warms up, and a little more relaxed while there is time.
      const tempo = Math.exp(this.z) * (1 + S.warm * Math.exp(-this.n / 8)) * (1 + 0.1 * (1 - urgency / 0.9));
      const key = Math.max(S.tapMin, (retro ? S.retroTap : S.tap) * tempo);
      // A hurried player decides quicker: at most a share of the time the piece has.
      const decMax = Math.max(50, Math.min(S.decide * 1.15, 0.3 * time));
      // (The rows are reckoned a little long: a spot only just in reach is one a hand would miss.)
      const rate = rows(key * 1.1), startNext = rows(S.glance * tempo * 1.12 + decMax * 0.35);
      return {
        urgency, tempo, key, decMax, rate, sticky: retro && rate >= 0.5, start: rows(Math.max(S.react, S.look * tempo) * 1.12 + decMax), startNext,
        beam: urgency > 0.65 ? 7 : S.beam, depth: urgency > 0.65 ? 2 : S.depth, reach: reachOf(startNext, rate), turn: 0.5,
      };
    }

    /** Moves time on by ms: think, then press what is due (several in one frame when a held key repeats that fast). */
    update(ms) {
      this.t += ms;
      const G = this.host.game();
      if (!G || G.over) { this.gen = null; this.ponder = null; return; }
      if (G.piece !== this.piece) this.newPiece(G);
      this.thinkSome(G);
      for (let guard = 0; guard < 24 && this.plan && this.plan.target !== undefined && this.t >= this.plan.at && !G.over && G.piece === this.piece; guard++) this.step(G);
    }

    /** What the bot sees of the game now (view), at the pace; planned: the piece was seen coming. */
    look(G, rules, planned) {
      const pc = this.paceNow, v = view(G, rules, pc.urgency);
      v.rate = pc.rate; v.start = planned ? pc.startNext : pc.start; v.startNext = pc.startNext; v.sticky = pc.sticky; v.reach = pc.reach; v.turn = pc.turn;
      return v;
    }
    search(v) { return think(v, { depth: this.paceNow.depth, beam: this.paceNow.beam }); }

    /** A piece came into play: a new one (its choice, pondered already or thought now), or the one Hold brought in. */
    newPiece(G, noHold) {
      const prev = this.piece;
      if (G.piece === prev) return;
      this.piece = G.piece;
      if (!G.piece) return;
      if (this.plan && this.plan.holding && this.plan.holding === prev) { this.plan.holding = null; this.plan.at = Math.max(this.plan.at, this.t + this.gap('tap')); return; }
      if (!noHold) {
        this.log.pieces++; keep(this.log.spawnAt, this.t);
        // The last piece set (when its drop was pressed, else now: it set by itself this frame).
        if (prev) { this.locks.push(this.dropT != null ? this.dropT : this.t); if (this.locks.length > 40) this.locks.splice(0, 20); }
        this.n++;
        // The tempo drifts: most of it kept from piece to piece, a little new.
        const S = this.S;
        if (S.human) { this.z = Math.max(-0.45, Math.min(0.5, S.rho * this.z + Math.sqrt(1 - S.rho * S.rho) * S.drift * gauss(this.rngHand))); keep(this.log.tempo, this.z); }
      }
      this.dropT = null;
      this.spawnT = this.t;
      this.first = false;
      this.seen = new Map();
      this.paceNow = this.pace(G);
      const rules = this.host.rules();
      this.rules = noHold ? Object.assign({}, rules, { hold: false }) : rules;
      this.plan = { target: undefined, at: Infinity };
      const P = this.ponder;
      this.ponder = null;
      this.gen = null;
      this.planned = false;
      // Thought about already, while the last piece was placed: if the board, the piece and Hold are as foreseen.
      if (P && P.done && !noHold && P.id === G.piece.type.id && P.hold === (this.rules.hold && G.hold ? G.hold.id : null) && sameRows(P.rows, rowsOf(G.board))) {
        this.log.pondered++;
        this.planned = true;
        this.decide(G, P.value);
        return;
      }
      this.gen = this.search(this.look(G, this.rules, false));
    }

    /** Thinks for this frame's share: the piece in play first, then the next one (ponder). */
    thinkSome(G) {
      const t0 = now(), budget = this.budget;
      let n = 0;
      const more = () => (this.steps ? n++ < this.steps : now() - t0 < budget);
      while (this.gen && more()) {
        const r = this.gen.next();
        if (r.done) { this.gen = null; this.decide(G, r.value); }
      }
      const P = this.ponder;
      while (P && !P.done && more()) {
        const r = P.gen.next();
        if (r.done) { P.done = true; P.value = r.value; }
      }
    }

    /**
     * The thinking is done: the choice (with the mistakes asked for), when the first key comes (the look and the
     * decision), and the ponder.
     */
    decide(G, ranked) {
      if (!ranked.length) { this.plan = { target: null, at: this.t, moves: ['drop'] }; return; }
      const c = choose(ranked, this.errs, this.rngMind, G.h);
      if (c.kind) { this.log.mistakes++; this.log.kinds[c.kind] = (this.log.kinds[c.kind] || 0) + 1; }
      const pick = c.pick, S = this.S, pc = this.paceNow, rk = this.rngHand;
      let at = this.t, slip = false;
      if (S.human) {
        // The look: a reaction to a piece not seen coming (never quicker than react), a glance at one planned already.
        const look = this.planned ? S.glance * pc.tempo * lognorm(rk, 1, S.jitter) : Math.max(S.react, S.look * pc.tempo * lognorm(rk, 1, S.jitter));
        // The decision: next to none when one placement is far ahead of the next, up to decide for a close call, a
        // little more for a tuck, a spin or a Hold; a piece planned from the Next was mostly decided then.
        const gap = ranked[1] ? Math.max(0, ranked[0].value - ranked[1].value) : 20;
        let dec = (S.decide * Math.exp(-gap / 4) + (pick.spun || !pick.simple ? 45 : 0) + (pick.hold ? 25 : 0)) * (this.planned ? 0.3 : 1) * pc.tempo * lognorm(rk, 1, S.jitter * 2);
        const cap = this.planned ? pc.decMax * 0.35 : pc.decMax;
        // (A lapse, with Mistakes on: the decision as slow as it may be.)
        if (c.kind === 'late') dec = cap;
        dec = Math.min(dec, cap);
        at = this.spawnT + look + dec;
        keep(this.log.thinkMs, look + dec);
        // A slip past the column (taken back): only while there is time for it, and with Mistakes off only at ease.
        slip = rk.next() < MISTAKES[this.errs].slip * (pc.urgency < 0.25 ? 1 : this.errs === 'off' ? 0 : 0.3);
      }
      this.plan = { target: pick, at: Math.max(this.t, at), holding: null, kind: c.kind, slip, slipped: false, run: null, wantHold: !!pick.hold };
      this.startPonder(G, pick);
    }

    /** Thinks ahead about the next piece, on the board this placement will leave (the Next it can see, less one). */
    startPonder(G, pick) {
      const rules = this.rules, vis = G.queue.slice(0, Math.max(0, rules.next | 0)).map((e) => e.id);
      const cur = G.piece.type.id, held = rules.hold && G.hold ? G.hold.id : null;
      // With Hold: the piece in play goes to Hold, and the held one (or, with none, the next) is the one set.
      const hold = pick.hold ? cur : held, rest = pick.hold && !held ? vis.slice(1) : vis;
      const id = rest[0];
      if (!id) { this.ponder = null; return; }
      const v = this.look(G, rules, true);
      Object.assign(v, { rows: pick.rows, cur: Object.assign({ id }, spawnOf(G, Pieces.get(id))), hold: rules.hold ? hold : null, holdOk: v.holdRule, queue: rest.slice(1) });
      this.ponder = { id, hold: v.hold, rows: pick.rows, gen: this.search(v), done: false, value: null };
    }

    /**
     * The time to the next key, by kind: a separate press (tap), a held key's delay (das) and repeat (arr) and a held
     * soft drop's row (soft: the three are the game's handling, so they do not vary), the beat on the spot before the
     * drop, a slip seen (react). Unrestrained: a frame.
     */
    gap(kind) {
      const S = this.S, pc = this.paceNow;
      if (!S.human) return S.key;
      if (kind === 'das' || kind === 'arr' || kind === 'soft') return S[kind];
      const j = lognorm(this.rngHand, 1, S.jitter), tempo = pc ? pc.tempo : 1;
      if (kind === 'beat') return S.beat * tempo * j;
      if (kind === 'react') return Math.max(S.react, S.look * tempo * j);
      return Math.max(S.tapMin, (pc ? pc.key : S.tap) * j);
    }
    /**
     * The soonest a separate press of action a can come: the same hand's fastest after its last press (15 a second),
     * a chord after the other hand's, and no more than taps presses in any second.
     */
    pressAt(a) {
      const S = this.S;
      if (!S.human) return -Infinity;
      const K = this.recent;
      let at = Math.max(this.lastHand[HAND_OF[a] || 0] + S.tapMin, this.lastPress + S.chord);
      if (K.length >= S.taps) at = Math.max(at, K[K.length - S.taps] + 1000);
      return at;
    }
    /** The soonest this piece may be set: a top player's most (pps over the last ppsOver sets, burst over burstOver). */
    capAt() {
      const S = this.S, L = this.locks, n = L.length;
      if (!S.human) return -Infinity;
      let at = -Infinity;
      if (n >= S.burstOver - 1) at = Math.max(at, L[n - (S.burstOver - 1)] + (S.burstOver - 1) * 1000 / S.burst);
      if (n >= S.ppsOver - 1) at = Math.max(at, L[n - (S.ppsOver - 1)] + (S.ppsOver - 1) * 1000 / S.pps);
      return at;
    }
    /** A key, sent; a separate press (not a held key's repeat) is noted. */
    press(a, rep) {
      this.lastKey = this.t;
      if (!rep) {
        this.lastPress = this.t;
        this.lastHand[HAND_OF[a] || 0] = this.t;
        this.recent.push(this.t);
        if (this.recent.length > 32) this.recent.splice(0, 16);
        keep(this.log.keys, this.t);
        if (!this.first) { this.first = true; keep(this.log.firstKey, [this.t - this.spawnT, this.planned]); }
      }
      return this.host.send(a, rep);
    }

    /**
     * The moves from where the piece is now to the plan's target (searched again each key: gravity moves it too). Out
     * of reach now (it fell past the way in), the best spot it can still get to becomes the target; going round in
     * circles (a turn that kicks it up, a fall that brings it back), it settles for a spot with no turn on the way.
     * The route itself is the shortest with no fall reckoned (gravity is met as it comes, a key at a time); which spots
     * it may still aim for is the hands' search, with the fall (so a spot only a quicker hand could get to is not one).
     */
    routeNow(G) {
      const P = this.plan, t = P.target, p = G.piece;
      if (!t || !p) return ['drop'];
      const pc = this.paceNow, rows = rowsOf(G.board), from = { rot: p.rot, x: p.x, y: p.y };
      const o = { r180: this.rules.r180 !== false, ceiling: !!G.ceiling, twist: true, sticky: pc.sticky };
      const sh = shapeOf(p.type), want = sh.dOf[t.r];
      // The spots in the hands' reach (read now: the searches share their buffers).
      let inReach = null;
      if (pc.rate > 0) {
        const g = reach(rows, G.w, G.h, p.type, from, Object.assign({ rate: pc.rate, turn: pc.turn }, o));
        inReach = new Set(g.places.map((q) => sh.dOf[q.r] + ':' + q.px + ':' + q.py + ':' + (q.spun ? 1 : 0)));
      }
      const all = reach(rows, G.w, G.h, p.type, from, o);
      const res = inReach ? { places: all.places.filter((q) => inReach.has(sh.dOf[q.r] + ':' + q.px + ':' + q.py + ':' + (q.spun ? 1 : 0))), route: all.route } : all;
      // (A drop held back a moment after a set, pressed again, is not going round in circles: only moves count.)
      const key = p.rot + ',' + p.x + ',' + p.y, seen = (this.seen.get(key) || 0) + (P.aimed ? 0 : 1);
      this.seen.set(key, seen);
      let pl = null;
      if (!P.commit && seen > 3) { P.commit = true; this.log.commits++; }
      if (!P.commit) {
        pl = res.places.find((q) => !!q.spun === !!t.spun && sh.dOf[q.r] === want && q.px === t.px && q.py === t.py && (!t.spun || q.r === t.r));
        // At the spot already after the turn in (a spin): only the drop is left.
        if (!pl && t.spun) pl = res.places.find((q) => sh.dOf[q.r] === want && q.px === t.px && q.py === t.py);
      }
      if (!pl) {
        const v = view(G, Object.assign({}, this.rules, { hold: false }), pc.urgency);
        let best = null;
        for (const q of res.places) {
          const route = res.route(q);
          if (P.commit && route.some((m) => m === 'CW' || m === 'CCW' || m === 'R180')) continue;
          const sc = setAndClear(v.rows, G.w, G.h, sh[q.r], q.px, q.py);
          const val = clearWorth(sc.lines, q.twist, v, sc.lines > 0 && sc.rows[0] === 0, 0).v + worth(sc.rows, G.w, G.h, { urgency: v.urgency, reach: pc.reach });
          if (!best || val > best.val) best = { q, val, route, rows: sc.rows };
        }
        if (!best) return ['drop'];
        const q = best.q;
        P.target = Object.assign({}, t, { r: q.r, x: q.x, y: q.y, px: q.px, py: q.py, spun: !!q.spun, twist: q.twist, rows: best.rows, hold: false });
        if (!P.commit) this.log.replans++;
        // The next piece is pondered again, on the board this one will leave now.
        this.startPonder(G, P.target);
        return best.route;
      }
      return res.route(pl);
    }

    /**
     * Presses the next key the plan calls for, and sets when the one after it is due. A separate press waits for the
     * hand (pressAt); the drop waits for the caps (capAt), on the spot.
     */
    step(G) {
      const P = this.plan, S = this.S;
      const ready = (a) => { const at = this.pressAt(a); if (this.t >= at) return true; P.at = at; return false; };
      if (P.wantHold) {
        if (!ready('hold')) return;
        P.wantHold = false;
        P.holding = G.piece;
        if (!this.press('hold', false)) { this.piece = null; this.plan = null; this.newPiece(G, true); return; }
        this.newPiece(G);
        P.at = this.t + this.gap('tap');
        return;
      }
      const moves = this.routeNow(G), m = moves[0];
      if (!m) return;
      // A slip: the last step of a slide taken one column too far, seen and taken back a moment later.
      if (P.slip && !P.slipped && (m === 'L' || m === 'R') && moves[1] !== m && P.run && P.run.m === m) {
        P.slipped = true;
        if (this.press(ACTION[m], true) && this.press(ACTION[m], true)) { this.log.slips++; P.at = this.t + this.gap('react'); P.run = null; return; }
        P.at = this.t + this.gap('arr');
        return;
      }
      const same = !!P.run && P.run.m === (m === 'drop' ? 'D' : m);
      if (m === 'drop') {
        // No hard drop on these rules: a held ↓ to the stack, then a fresh press sets it.
        const p = G.piece, down = !this.rules.drop && !!p && G.fitsAt(p, p.rot, p.x, p.y - 1);
        if (down) {
          if (!same && !ready('lower')) return;
          P.run = { m: 'D', n: same ? P.run.n + 1 : 1 };
          this.press('lower', same);
          P.at = this.t + this.gap('soft');
          return;
        }
        // A beat before the drop (the eye on the spot), then the drop, no sooner than the caps allow; held back a
        // moment after a set, so again soon.
        if (!P.aimed) { P.aimed = true; P.at = Math.max(this.t, this.lastKey + this.gap('beat')); if (this.t < P.at) return; }
        // (Unrestrained: no sooner than its beat after the piece appeared, so each one can be seen.)
        const cap = S.human ? this.capAt() : this.spawnT + S.beat;
        if (this.t < cap) { if (!P.capped) { P.capped = true; this.log.capped = (this.log.capped || 0) + 1; } P.at = cap; return; }
        if (!ready('drop')) return;
        if (this.press(this.rules.drop ? 'drop' : 'lower', false)) { this.dropT = this.t; this.plan = null; return; }
        P.at = this.t + 16;
        return;
      }
      P.aimed = false;
      if (m === 'L' || m === 'R') {
        // A slide: a long one held (its delay, then its repeat), a short one tapped; on Retro lock, all tapped.
        if (same && P.run.held) {
          P.run.n++;
          if (!this.press(ACTION[m], true)) { P.run = null; P.at = this.t + this.gap('tap') * 0.5; return; }
          P.at = this.t + this.gap('arr');
          return;
        }
        if (!ready(ACTION[m])) return;
        let left = 1;
        while (left < moves.length && moves[left] === m) left++;
        const held = !same && S.human && !this.host.retro && left >= 4;
        P.run = { m, n: same ? P.run.n + 1 : 1, held };
        if (!this.press(ACTION[m], false)) { P.run = null; P.at = this.t + this.gap('tap') * 0.5; return; }
        P.at = this.t + this.gap(held ? 'das' : 'tap');
        return;
      }
      if (m === 'D') {
        // The soft drop: pressed, then held (a row each soft).
        if (!same && !ready('lower')) return;
        P.run = { m, n: same ? P.run.n + 1 : 1 };
        this.press('lower', same);
        P.at = this.t + this.gap('soft');
        return;
      }
      // A turn: the other hand's next press (a slide, the drop) can follow at once, all but together with it.
      if (!ready(ACTION[m])) return;
      P.run = null;
      this.press(ACTION[m], false);
      P.at = this.t + (S.human ? S.chord : this.gap('tap'));
    }
  }

  function sameRows(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

  // ---- a whole game, headless (the tests, and the long runs that tune it) -------------------------------------------

  /**
   * Plays a Classic game to its end (or to o.pieces) as the page would, a frame at a time: the gravity and the lock
   * (Classic.fall), the soft drop, the reset a move buys, the moment after a set when a drop is held back (180 ms),
   * and the bot at the keys through the same actions a hand sends. o: { classic (the rules), w, h, seed, botSeed,
   * style, mistakes, pieces (at most), lines (at most), fps, steps, speed (a level the pieces fall at whatever the
   * lines: past the setup's 15, for the long runs) }. Returns what it did: pieces, lines, quads, twists, the
   * clears by size, topout, the moments each piece set (locksAt, seconds), the actions sent by name (acts), its log.
   */
  function simulate(o) {
    const C = L.Classic, Game = L.Game;
    const k = Object.assign({}, C.DEFAULTS, o.classic || {});
    const game = new Game({ w: o.w || 10, h: o.h || 20, seed: o.seed == null ? 1 : o.seed, recipe: { mode: 'classic', classic: k } });
    const retro = k.lock === 'retro', fps = o.fps || 60, dt = 1 / fps;
    const t = { acc: 0, lockT: 0, resets: 0 };
    let clock = 0, setAt = -1e9;
    const out = { pieces: 0, lines: 0, quads: 0, twists: 0, minis: 0, perfect: 0, maxB2B: 0, clears: [0, 0, 0, 0, 0], topout: false, frames: 0, locksAt: [], acts: {} };
    game.on('lock', (r) => {
      t.resets = 0; t.lockT = 0; t.acc = 0; setAt = clock;
      out.pieces++; out.locksAt.push(clock);
      if (r.lines) out.clears[Math.min(4, r.lines)]++;
      if (r.lines >= 4) out.quads++;
      if (r.twist && r.lines) out.twists++;
      if (r.mini && r.lines) out.minis++;
      if (r.perfect) out.perfect++;
    });
    const MOVE = /^(moveL|moveR|rotate|rotateInv|cw|ccw|r180)$/;
    const host = {
      game: () => game, retro,
      gravity: () => C.gravity(o.speed || C.levelOf(k, C.of(game).lines), retro),
      rules: () => ({ hold: k.hold, drop: k.drop, r180: true, next: k.next }),
      send(a, rep) {
        let ok = false;
        out.acts[a] = (out.acts[a] || 0) + 1;
        switch (a) {
          case 'moveL': ok = game.move(-1); break;
          case 'moveR': ok = game.move(1); break;
          case 'cw': ok = !rep && game.rotate(1); break;
          case 'ccw': ok = !rep && game.rotate(-1); break;
          case 'r180': ok = !rep && game.rotate(2); break;
          case 'lower': ok = C.softDrop(t, game, rep, retro); break;
          case 'drop': ok = k.drop && clock - setAt >= 0.18 && !!game.drop(); break;
          case 'hold': ok = game.holdPiece(); break;
        }
        if (MOVE.test(a)) C.rested(t, game, retro);
        return ok;
      },
    };
    // Thinking a few pieces a frame, as the page's slices would (o.steps; 0 thinks at once).
    const style = STYLES[o.style] ? o.style : 'human';
    const bot = new Driver(host, { seed: o.botSeed == null ? 7 : o.botSeed, style, mistakes: o.mistakes, steps: o.steps == null ? STYLES[style].steps : o.steps, budget: Infinity });
    const maxP = o.pieces || 1000, maxL = o.lines || Infinity;
    while (!game.over && out.pieces < maxP && C.of(game).lines < maxL && out.frames < maxP * 600) {
      out.frames++;
      clock += dt;
      const p = game.piece;
      if (p && !game.fitsAt(p, p.rot, p.x, p.y)) { game.over = true; break; }
      C.fall(t, game, dt, host.gravity(), retro);
      bot.update(dt * 1000);
    }
    const c = C.of(game);
    Object.assign(out, { topout: game.over && game.endKind !== 'cleared', cleared: game.endKind === 'cleared', lines: c.lines, level: C.levelOf(k, c.lines), score: game.s.score, maxB2B: game.s.maxB2B, seconds: clock, log: bot.log, game });
    return out;
  }

  L.Bot = { popcount, shapeOf, rowsOf, fitMap, setAndClear, reach, spawnOf, worth, slots, clearWorth, view, think, heightOf, MISTAKES, MISTAKE_IDS, MISTAKE_NAMES, RANKS, choose, STYLES, STYLE_IDS, STYLE_NAMES, lognorm, Driver, simulate, W8, MOVES, ACTION,
    // (For a page that judges a player's sets by the same eye: every placement ranked, and a stack's worth in parts.)
    rank, judge, explain };
})(typeof globalThis !== 'undefined' ? globalThis : this);
