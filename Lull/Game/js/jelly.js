// Lull — Jelly, a board modifier (js/recipe.js): placing is on the grid as always (the piece moves, turns and locks
// against the stack; ghost, hold), then physics take over. At its lock the piece becomes one body in continuous space,
// and the settled pieces live there, not on the grid: they fall, lean, slide, tip and topple, but never tear, lose a
// mino or ooze (their squash and wobble is the look's, js/jellyview.js). A band one row tall clears when the minos
// centred in it cover its width (coverNeed): exactly those whole minos go, and what is left of each body it crossed
// splits into its connected parts, each a body of its own (the only way a piece ever splits). What the next piece
// meets (collision, ghost, spawn, top out) is the grid made from the bodies at rest (raster). Pure rules, no DOM: the
// bodies, the simulation, the clears, the engine hooks, its Free Play controller, stats and Knock-On.
//
// The simulation: rigid bodies, each a set of unit-square minos, solved by sequential impulses at a fixed step (P.HZ,
// P.ITER passes; the method of Box2D Lite: box contacts clipped to at most two points, accumulated and warm-started
// impulses, Coulomb friction, a small positional bias). The walls, the floor and the cells that stay on the grid
// (STATIC: a stone, garbage, the sprout) never move. A body at rest sleeps (no work at all) until something wakes it: a
// clear or an item under it, or a body striking it faster than WAKE_V. A lock runs the simulation to rest at once
// (headless, bounded) and records it for the view to play back; the board's grid is final before the next piece
// appears. A body's turn is kept as its cosine and sine (no trigonometry: + − × ÷ and √ only, the same on every
// engine), every body sleeps at the end of a lock on a fine lattice (Q), and the bodies themselves are kept, as
// integers, in the save and in each Undo step: a resumed board and Undo have the exact state, and the same lock settles
// the same way again. The only randomness, a hard drop's hair of sideways nudge, is seeded from the board's seed and
// its piece count.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Recipe } = L;
  /** Cells that stay on the grid and never become bodies: never placed by the player (a stone, garbage), the sprout, a mole. */
  const STATIC = CELL.FOREIGN | CELL.ASSET | CELL.MOLE;
  const JR = CELL.JOIN_R, JU = CELL.JOIN_U;

  // ---- the numbers ---------------------------------------------------------------------------------------------------

  const P = {
    G: 40, // gravity, cells a second squared
    HZ: 120, // simulation steps a second (fixed)
    ITER: 8, // solver passes a step
    FRAME: 2, // steps a recorded frame (60 a second)
    MU: 0.6, // friction between bodies
    MU_WALL: 0.6, // friction on the floor, the walls and fixed cells
    SLOP: 0.01, // penetration left alone (a resting contact)
    BIAS: 0.2, // of the penetration past SLOP taken out a step
    MAX_BIAS_V: 2, // the fastest a body is pushed out of another (cells a second)
    MARGIN: 0.02, // contacts are kept this far apart (they do not come and go as bodies rest)
    DAMP: 0.1, // velocity lost a second (air)
    VMAX: 40, // no body moves faster (cells a second)
    SLEEP_V: 0.12, // a body slower than this (cells a second, at its farthest mino) for SLEEP_T seconds sleeps
    SLEEP_T: 0.25,
    WAKE_V: 1.2, // a sleeping body struck faster than this wakes (a soft landing never wakes what it lands on)
    SNAP: 0.35, SNAP_TURN: 0.2, // a body at rest this near a column (cells) and a quarter turn (its sine) eases into line
    PHASE_T: 6, // at most this long settling between clears (seconds of simulation), then everything sleeps
    // A hard drop: the piece lands at IMPACT_K × √(rows fallen) cells a second (at most IMPACT_MAX) and for IMPACT_T
    // seconds weighs 1 + rows / IMPACT_ROWS (at most IMPACT_HEAVY) times itself. A soft drop or a gravity landing: set down.
    IMPACT_K: 3.6, IMPACT_MAX: 16, IMPACT_T: 0.25, IMPACT_ROWS: 4, IMPACT_HEAVY: 3,
  };
  const Q = 4096; // a sleeping body's position is on this lattice (exact in the save and in Undo)
  const QR = 1048576; // and its turn's cosine and sine on this one
  /**
   * A band (a row of the grid, one mino tall) clears when the minos centred in it (and cells that stay on the grid)
   * cover this much of its width: max(0.9 × w, w − 0.8): 92% of a board 10 wide, 96% of one 20 wide, 90% below 8. Each
   * mino covers a unit span about its centre, so a band short of a whole mino never clears; the slack is for bodies
   * that rest a little apart.
   */
  const coverNeed = (w) => Math.max(0.9 * w, w - 0.8);
  /** What a mino a clear removes pays, of a cell of a row on a plain board: every clear on Jelly is plain (fairness). */
  const WORTH = 0.75;
  const MAX_WAVES = 64;

  const isOn = (r) => !!(r && r.mods && r.mods.jelly);

  /** A seeded hash of two numbers (a hard drop's nudge: the same board and piece always settle the same way). */
  function hash(a, b) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f);
    return (h ^ (h >>> 15)) >>> 0;
  }

  // ---- bodies --------------------------------------------------------------------------------------------------------

  /**
   * A body: m minos, each a unit square. cells: where each mino was on the grid when the piece was set (its shape at
   * rest, integers, x0 y0 x1 y1 …); lx, ly: each mino's centre about the body's centre of mass, in the body's frame; v:
   * each mino's cell value. Its pose: centre (x, y) and turn (c, s: cosine and sine); its motion: vx, vy, w.
   */
  function Body(id, cells, vals) {
    const m = vals.length;
    this.id = id; this.m = m;
    this.cells = Int32Array.from(cells); this.v = Uint16Array.from(vals);
    this.lx = new Float64Array(m); this.ly = new Float64Array(m);
    let sx = 0, sy = 0;
    for (let k = 0; k < m; k++) { sx += cells[2 * k] + 0.5; sy += cells[2 * k + 1] + 0.5; }
    sx /= m; sy /= m;
    let I = 0;
    for (let k = 0; k < m; k++) {
      this.lx[k] = cells[2 * k] + 0.5 - sx; this.ly[k] = cells[2 * k + 1] + 0.5 - sy;
      I += 1 / 6 + this.lx[k] * this.lx[k] + this.ly[k] * this.ly[k];
    }
    this.x = sx; this.y = sy; this.c = 1; this.s = 0;
    this.vx = 0; this.vy = 0; this.w = 0;
    this.bx = 0; this.by = 0; this.bw = 0; // this step's push out of overlaps (split impulses: never kept as speed)
    this.mass = m; this.I = I;
    this.heavy = 1; this.heavyT = 0;
    this.setMass();
    this.awake = false; this.still = 0;
    this.r = 0; // the farthest mino corner from the centre
    for (let k = 0; k < m; k++) this.r = Math.max(this.r, Math.sqrt(this.lx[k] * this.lx[k] + this.ly[k] * this.ly[k]) + 0.7072);
    this.x0 = 0; this.y0 = 0; this.x1 = 0; this.y1 = 0;
    this.box();
  }
  Body.prototype.setMass = function () { this.im = 1 / (this.mass * this.heavy); this.iI = 1 / (this.I * this.heavy); };
  /** Mino k's centre. */
  Body.prototype.cx = function (k) { return this.x + this.c * this.lx[k] - this.s * this.ly[k]; };
  Body.prototype.cy = function (k) { return this.y + this.s * this.lx[k] + this.c * this.ly[k]; };
  /** The box round its minos. */
  Body.prototype.box = function () {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const e = 0.5 * (Math.abs(this.c) + Math.abs(this.s));
    for (let k = 0; k < this.m; k++) {
      const x = this.cx(k), y = this.cy(k);
      if (x - e < x0) x0 = x - e; if (x + e > x1) x1 = x + e; if (y - e < y0) y0 = y - e; if (y + e > y1) y1 = y + e;
    }
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
  };
  /** Mino k's corners (bottom left, bottom right, top right, top left in its own frame), into out[0..8). */
  Body.prototype.corners = function (k, out) {
    const x = this.cx(k), y = this.cy(k), c = this.c * 0.5, s = this.s * 0.5;
    out[0] = x - c + s; out[1] = y - s - c;
    out[2] = x + c + s; out[3] = y + s - c;
    out[4] = x + c - s; out[5] = y + s + c;
    out[6] = x - c - s; out[7] = y - s + c;
    return out;
  };

  /** A body from cells ([[x, y]]) and their values, at rest where the cells are. */
  function fromCells(id, cells, vals) {
    const flat = [];
    for (const [x, y] of cells) flat.push(x, y);
    return new Body(id, flat, vals);
  }

  /** The groups of cells ([[x, y]]) joined through an edge or a corner: indices, sorted (one body each). */
  function groups(cells) {
    const key = (x, y) => x * 4096 + y, at = new Map(cells.map((c, i) => [key(c[0], c[1]), i]));
    const seen = new Uint8Array(cells.length), out = [];
    for (let s = 0; s < cells.length; s++) {
      if (seen[s]) continue;
      const g = [], st = [s];
      seen[s] = 1;
      while (st.length) {
        const i = st.pop(), [x, y] = cells[i];
        g.push(i);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const j = at.get(key(x + dx, y + dy));
          if (j !== undefined && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
      out.push(g.sort((a, b) => a - b));
    }
    return out;
  }

  /**
   * The parts of body b left when minos `gone` (a Set of indices) go: each a new body of whole minos (those joined
   * through an edge or a corner of the piece's own shape), where they are, moving as they were.
   */
  function split(b, gone, nextId) {
    const keep = [];
    for (let k = 0; k < b.m; k++) if (!gone.has(k)) keep.push(k);
    if (!keep.length) return [];
    const out = [];
    for (const grp of groups(keep.map((k) => [b.cells[2 * k], b.cells[2 * k + 1]]))) {
      const ks = grp.map((i) => keep[i]), cells = [], vals = [];
      for (const k of ks) { cells.push(b.cells[2 * k], b.cells[2 * k + 1]); vals.push(b.v[k]); }
      const nb = new Body(nextId(), cells, vals);
      // Its centre, where it is in b's pose; its motion, b's at that point.
      let mx = 0, my = 0;
      for (const k of ks) { mx += b.lx[k]; my += b.ly[k]; }
      mx /= ks.length; my /= ks.length;
      const rx = b.c * mx - b.s * my, ry = b.s * mx + b.c * my;
      nb.x = b.x + rx; nb.y = b.y + ry; nb.c = b.c; nb.s = b.s;
      nb.vx = b.vx - b.w * ry; nb.vy = b.vy + b.w * rx; nb.w = b.w;
      nb.awake = b.awake; nb.heavy = b.heavy; nb.heavyT = b.heavyT; nb.setMass();
      nb.box();
      out.push(nb);
    }
    return out;
  }

  // ---- the world -----------------------------------------------------------------------------------------------------

  /**
   * The Jelly state of a board: its bodies (in id order), the cells that stay on the grid (fixed: a value per cell, 0
   * for none), the grid last written from them (raster) and the next body id.
   */
  function World(w, h) {
    this.w = w; this.h = h;
    this.bodies = [];
    this.fixed = new Uint16Array(w * h);
    this.raster = new Uint16Array(w * h);
    this.next = 1;
    this.seed = 0; // the board's seed (a resumed game has none of its own: kept here, for the hard drop's nudge)
    // Buckets (a cell each, the board and 16 rows over it) of the minos of every body, for finding contacts.
    this.BH = h + 16;
    this.head = new Int32Array(w * this.BH).fill(-1);
    this.nxt = []; this.ref = [];
    this.awake = [];
    this.arb = new Map(); // contacts kept from step to step (warm starting)
    this.list = []; // this step's, in solving order
    this.moved = new Set(); // bodies that woke or slept since the last recorded frame
    this.fresh = new Set(); // parts a clear or an item left, to be checked for steadiness
    this.work = 0; // mino-steps simulated (tests: the cost)
  }
  World.prototype.nextId = function () { return this.next++; };
  World.prototype.byId = function (id) { for (const b of this.bodies) if (b.id === id) return b; return null; };

  function wake(W, b) {
    if (b.awake) return;
    b.awake = true; b.still = 0;
    W.awake.push(b);
    W.moved.add(b);
  }
  function sleep(W, b) {
    b.awake = false; b.still = 0; b.vx = b.vy = b.w = 0;
    b.heavy = 1; b.heavyT = 0; b.setMass();
    quantize(b);
    W.moved.add(b);
  }
  /** A body's pose onto the save's lattice. */
  function quantize(b) {
    // (+ 0: never a negative zero, which the save could not keep.)
    b.x = Math.round(b.x * Q) / Q + 0; b.y = Math.round(b.y * Q) / Q + 0;
    b.c = Math.round(b.c * QR) / QR + 0; b.s = Math.round(b.s * QR) / QR + 0;
    b.box();
  }

  function bucket(W, x, y) {
    let bx = Math.floor(x), by = Math.floor(y);
    if (bx < 0) bx = 0; else if (bx >= W.w) bx = W.w - 1;
    if (by < 0) by = 0; else if (by >= W.BH) by = W.BH - 1;
    return by * W.w + bx;
  }
  /** Every body's minos into the buckets their centres are in (a mino reaches at most 0.71 past its centre). */
  function fill(W) {
    W.head.fill(-1);
    let n = 0;
    const bs = W.bodies;
    for (let a = 0; a < bs.length; a++) {
      const b = bs[a];
      for (let k = 0; k < b.m; k++) {
        const c = bucket(W, b.cx(k), b.cy(k));
        W.nxt[n] = W.head[c]; W.ref[n] = a * 256 + k; W.head[c] = n; n++;
      }
    }
  }

  // ---- contacts (Box2D Lite's box against box) -------------------------------------------------------------------------

  // A clipped vertex: position and its feature (the edges it lies between, four small numbers packed).
  function cv() { return { x: 0, y: 0, i1: 0, o1: 0, i2: 0, o2: 0 }; }
  const INC = [cv(), cv()], CL1 = [cv(), cv()], CL2 = [cv(), cv()];
  function copyV(d, s) { d.x = s.x; d.y = s.y; d.i1 = s.i1; d.o1 = s.o1; d.i2 = s.i2; d.o2 = s.o2; }
  function clip(out, inp, nx, ny, off, edge) {
    let n = 0;
    const d0 = nx * inp[0].x + ny * inp[0].y - off, d1 = nx * inp[1].x + ny * inp[1].y - off;
    if (d0 <= 0) copyV(out[n++], inp[0]);
    if (d1 <= 0) copyV(out[n++], inp[1]);
    if (d0 * d1 < 0 && n < 2) {
      const t = d0 / (d0 - d1), o = out[n];
      o.x = inp[0].x + t * (inp[1].x - inp[0].x); o.y = inp[0].y + t * (inp[1].y - inp[0].y);
      if (d0 > 0) { o.i1 = edge; o.o1 = inp[0].o1; o.i2 = 0; o.o2 = inp[0].o2; }
      else { o.i1 = inp[1].i1; o.o1 = edge; o.i2 = inp[1].i2; o.o2 = 0; }
      n++;
    }
    return n;
  }
  /** The edge of box (centre px, py; turn c, s; half size 0.5) most against normal (nx, ny), into INC. */
  function incident(px, py, c, s, nx, ny) {
    // The normal in the box's frame, turned round.
    const ux = -(c * nx + s * ny), uy = -(-s * nx + c * ny), h = 0.5;
    let ax, ay, bx, by, a1, a2, b1, b2;
    if (Math.abs(ux) > Math.abs(uy)) {
      if (ux > 0) { ax = h; ay = -h; a1 = 3; a2 = 4; bx = h; by = h; b1 = 4; b2 = 1; }
      else { ax = -h; ay = h; a1 = 1; a2 = 2; bx = -h; by = -h; b1 = 2; b2 = 3; }
    } else if (uy > 0) { ax = h; ay = h; a1 = 4; a2 = 1; bx = -h; by = h; b1 = 1; b2 = 2; }
    else { ax = -h; ay = -h; a1 = 2; a2 = 3; bx = h; by = -h; b1 = 3; b2 = 4; }
    const A = INC[0], B = INC[1];
    A.x = px + c * ax - s * ay; A.y = py + s * ax + c * ay; A.i1 = 0; A.o1 = 0; A.i2 = a1; A.o2 = a2;
    B.x = px + c * bx - s * by; B.y = py + s * bx + c * by; B.i1 = 0; B.o1 = 0; B.i2 = b1; B.o2 = b2;
  }
  /**
   * Box A (centre ax, ay, turn ac, as) against box B, both unit squares: up to two contacts into out ({ x, y, nx, ny
   * (from A to B), sep (below 0: overlapping), f (feature) }), kept while they are within MARGIN. Returns how many.
   */
  function collideBoxes(out, ax, ay, ac, as, bx, by, bc, bs) {
    const h = 0.5, M = P.MARGIN;
    const dpx = bx - ax, dpy = by - ay;
    const dAx = ac * dpx + as * dpy, dAy = -as * dpx + ac * dpy;
    const dBx = bc * dpx + bs * dpy, dBy = -bs * dpx + bc * dpy;
    // C = RotAᵀ RotB
    const c11 = ac * bc + as * bs, c12 = -ac * bs + as * bc, c21 = -as * bc + ac * bs, c22 = as * bs + ac * bc;
    const a11 = Math.abs(c11), a12 = Math.abs(c12), a21 = Math.abs(c21), a22 = Math.abs(c22);
    const fAx = Math.abs(dAx) - h - (a11 * h + a12 * h), fAy = Math.abs(dAy) - h - (a21 * h + a22 * h);
    if (fAx > M || fAy > M) return 0;
    const fBx = Math.abs(dBx) - (a11 * h + a21 * h) - h, fBy = Math.abs(dBy) - (a12 * h + a22 * h) - h;
    if (fBx > M || fBy > M) return 0;
    let axis = 0, sep = fAx, nx = dAx > 0 ? ac : -ac, ny = dAx > 0 ? as : -as;
    const rel = 0.95, abs = 0.01 * h;
    if (fAy > rel * sep + abs) { axis = 1; sep = fAy; nx = dAy > 0 ? -as : as; ny = dAy > 0 ? ac : -ac; }
    if (fBx > rel * sep + abs) { axis = 2; sep = fBx; nx = dBx > 0 ? bc : -bc; ny = dBx > 0 ? bs : -bs; }
    if (fBy > rel * sep + abs) { axis = 3; sep = fBy; nx = dBy > 0 ? -bs : bs; ny = dBy > 0 ? bc : -bc; }
    let fnx, fny, front, snx, sny, side, neg, pos, negE, posE;
    if (axis === 0) {
      fnx = nx; fny = ny; front = ax * fnx + ay * fny + h; snx = -as; sny = ac; side = ax * snx + ay * sny;
      neg = -side + h; pos = side + h; negE = 3; posE = 1; incident(bx, by, bc, bs, fnx, fny);
    } else if (axis === 1) {
      fnx = nx; fny = ny; front = ax * fnx + ay * fny + h; snx = ac; sny = as; side = ax * snx + ay * sny;
      neg = -side + h; pos = side + h; negE = 2; posE = 4; incident(bx, by, bc, bs, fnx, fny);
    } else if (axis === 2) {
      fnx = -nx; fny = -ny; front = bx * fnx + by * fny + h; snx = -bs; sny = bc; side = bx * snx + by * sny;
      neg = -side + h; pos = side + h; negE = 3; posE = 1; incident(ax, ay, ac, as, fnx, fny);
    } else {
      fnx = -nx; fny = -ny; front = bx * fnx + by * fny + h; snx = bc; sny = bs; side = bx * snx + by * sny;
      neg = -side + h; pos = side + h; negE = 2; posE = 4; incident(ax, ay, ac, as, fnx, fny);
    }
    if (clip(CL1, INC, -snx, -sny, neg, negE) < 2) return 0;
    if (clip(CL2, CL1, snx, sny, pos, posE) < 2) return 0;
    let n = 0;
    for (let i = 0; i < 2; i++) {
      const v = CL2[i], d = fnx * v.x + fny * v.y - front;
      if (d > M) continue;
      const o = out[n++];
      o.sep = d; o.nx = nx; o.ny = ny;
      o.x = v.x - d * fnx; o.y = v.y - d * fny;
      o.f = axis >= 2 ? v.o1 | (v.i1 << 3) | (v.o2 << 6) | (v.i2 << 9) : v.i1 | (v.o1 << 3) | (v.i2 << 6) | (v.o2 << 9);
    }
    return n;
  }
  const OUT = [{}, {}];

  /** A fixed thing a body touches (the floor, a wall, a cell that stays on the grid): never moves. */
  const FIXED = { id: 0, x: 0, y: 0, vx: 0, vy: 0, w: 0, bx: 0, by: 0, bw: 0, im: 0, iI: 0, awake: false, fixed: true };

  /**
   * A kept contact between two things (a mino of body a, or a fixed thing, and a mino of body b): up to two points,
   * each with its accumulated normal and friction impulse.
   */
  function Arbiter(a, b, mu) { this.a = a; this.b = b; this.mu = mu; this.n = 0; this.pts = [pt(), pt()]; this.seen = 0; }
  function pt() { return { x: 0, y: 0, nx: 0, ny: 0, sep: 0, f: 0, pn: 0, pt: 0, pb: 0, r1x: 0, r1y: 0, r2x: 0, r2y: 0, mn: 0, mt: 0, bias: 0, push: 0 }; }
  /** New contact points into the arbiter; a point with the same feature as one it had keeps its impulses. */
  Arbiter.prototype.update = function (out, n, stamp) {
    const old = this.pts, on = this.n, np = [pt(), pt()];
    for (let i = 0; i < n; i++) {
      const c = out[i], p = np[i];
      p.x = c.x; p.y = c.y; p.nx = c.nx; p.ny = c.ny; p.sep = c.sep; p.f = c.f;
      for (let j = 0; j < on; j++) if (old[j].f === c.f) { p.pn = old[j].pn; p.pt = old[j].pt; break; }
    }
    this.pts = np; this.n = n; this.seen = stamp;
  };

  const CR = new Float64Array(8);

  /** Finds every contact of the awake bodies, keeping the arbiters that still touch. */
  function contacts(W, stamp) {
    const w = W.w, h = W.h, arb = W.arb, bs = W.bodies;
    const touch = (key, a, ka, b, kb, mu, n) => {
      let A = arb.get(key);
      if (!A) { A = new Arbiter(a, b, mu); A.ka = ka; A.kb = kb; arb.set(key, A); }
      A.update(OUT, n, stamp);
    };
    for (const b of W.awake) {
      for (let k = 0; k < b.m; k++) {
        const x = b.cx(k), y = b.cy(k);
        // Floor and walls.
        if (y < 0.72 + P.MARGIN || x < 0.72 + P.MARGIN || x > w - 0.72 - P.MARGIN) {
          const cr = b.corners(k, CR);
          for (let side = 0; side < 3; side++) {
            let n = 0;
            const nx = side === 0 ? 0 : side === 1 ? 1 : -1, ny = side === 0 ? 1 : 0;
            for (let j = 0; j < 4 && n < 2; j++) {
              const px = cr[2 * j], py = cr[2 * j + 1], d = side === 0 ? py : side === 1 ? px : w - px;
              if (d > P.MARGIN) continue;
              const o = OUT[n++];
              o.x = px; o.y = py; o.nx = nx; o.ny = ny; o.sep = d; o.f = j;
            }
            if (n) touch('p' + side + ':' + b.id + ':' + k, FIXED, -1, b, k, P.MU_WALL, n);
          }
        }
        // Fixed cells near it.
        for (let gy = Math.floor(y - 1.3); gy <= Math.floor(y + 1.3); gy++) for (let gx = Math.floor(x - 1.3); gx <= Math.floor(x + 1.3); gx++) {
          if (gx < 0 || gx >= w || gy < 0 || gy >= h || !W.fixed[gy * w + gx]) continue;
          const n = collideBoxes(OUT, gx + 0.5, gy + 0.5, 1, 0, x, y, b.c, b.s);
          if (n) touch('f' + (gy * w + gx) + ':' + b.id + ':' + k, FIXED, -1, b, k, P.MU_WALL, n);
        }
        // Other bodies' minos near it (each pair once: from the lower id when both are awake).
        const bx = Math.floor(x), by = Math.floor(y);
        for (let yy = by - 1; yy <= by + 1; yy++) for (let xx = bx - 1; xx <= bx + 1; xx++) {
          if (xx < 0 || xx >= w || yy < 0) continue;
          const c = bucket(W, xx, yy);
          if (c !== yy * w + xx && yy < W.BH) continue;
          for (let e = W.head[c]; e >= 0; e = W.nxt[e]) {
            const r = W.ref[e], o = bs[r >> 8], ko = r & 255;
            if (o === b || (o.awake && o.id < b.id)) continue;
            const ox = o.cx(ko), oy = o.cy(ko);
            const ddx = Math.abs(ox - x), ddy = Math.abs(oy - y);
            if (ddx > 1.42 + P.MARGIN || ddy > 1.42 + P.MARGIN) continue;
            // Squares both square to the grid, one diagonally beside the other, meet only at a corner: no contact
            // (it would only push them sideways).
            if (ddx > 0.9 && ddy > 0.9 && Math.abs(b.s) < 0.03 && Math.abs(o.s) < 0.03) continue;
            // A is the lower id: the arbiter's key and order are the same whichever of them is awake.
            const A = o.id < b.id ? o : b, ka = o.id < b.id ? ko : k, B = A === o ? b : o, kb = A === o ? k : ko;
            const n = collideBoxes(OUT, A.cx(ka), A.cy(ka), A.c, A.s, B.cx(kb), B.cy(kb), B.c, B.s);
            if (n) touch(A.id + ':' + ka + ':' + B.id + ':' + kb, A, ka, B, kb, P.MU, n);
          }
        }
      }
      W.work += b.m;
    }
    // Arbiters no longer touching (or between sleepers) go; the rest are solved from the bottom up (a stack's weight
    // reaches the floor in fewer passes), ties in the order they were made.
    const list = W.list = [];
    for (const [key, A] of arb) {
      if (A.seen !== stamp) { arb.delete(key); continue; }
      A.low = A.n > 1 ? Math.min(A.pts[0].y, A.pts[1].y) : A.pts[0].y;
      list.push(A);
    }
    list.sort((p, q) => p.low - q.low);
  }

  const cross = (ax, ay, bx, by) => ax * by - ay * bx;

  /** Before the passes: each point's lever arms, masses along the normal and the tangent, its bias; warm start. */
  function preStep(W, inv) {
    for (const A of W.list) {
      const a = A.a, b = A.b;
      // A sleeping body in it: fixed this step; struck fast, it wakes (and takes part from the next step).
      const ima = a.awake ? a.im : 0, iIa = a.awake ? a.iI : 0, imb = b.awake ? b.im : 0, iIb = b.awake ? b.iI : 0;
      A.ima = ima; A.iIa = iIa; A.imb = imb; A.iIb = iIb;
      for (let i = 0; i < A.n; i++) {
        const p = A.pts[i];
        p.r1x = p.x - a.x; p.r1y = p.y - a.y; p.r2x = p.x - b.x; p.r2y = p.y - b.y;
        const rn1 = cross(p.r1x, p.r1y, p.nx, p.ny), rn2 = cross(p.r2x, p.r2y, p.nx, p.ny);
        const kn = ima + imb + iIa * rn1 * rn1 + iIb * rn2 * rn2;
        const tx = p.ny, ty = -p.nx;
        const rt1 = cross(p.r1x, p.r1y, tx, ty), rt2 = cross(p.r2x, p.r2y, tx, ty);
        const kt = ima + imb + iIa * rt1 * rt1 + iIb * rt2 * rt2;
        p.mn = kn > 0 ? 1 / kn : 0; p.mt = kt > 0 ? 1 / kt : 0;
        // Speed: a gap may close this step (speculative), no more. Overlap past SLOP: pushed out apart from the speed.
        p.bias = p.sep > 0 ? -p.sep * inv : 0;
        p.push = Math.min(P.MAX_BIAS_V, -P.BIAS * inv * Math.min(0, p.sep + P.SLOP));
        p.pb = 0;
        if (a.awake !== b.awake && !a.fixed) {
          const dvx = b.vx - b.w * p.r2y - a.vx + a.w * p.r1y, dvy = b.vy + b.w * p.r2x - a.vy - a.w * p.r1x;
          const vn = dvx * p.nx + dvy * p.ny;
          if (vn < -P.WAKE_V) wake(W, a.awake ? b : a);
        }
        // Warm start.
        const Px = p.pn * p.nx + p.pt * tx, Py = p.pn * p.ny + p.pt * ty;
        a.vx -= ima * Px; a.vy -= ima * Py; a.w -= iIa * cross(p.r1x, p.r1y, Px, Py);
        b.vx += imb * Px; b.vy += imb * Py; b.w += iIb * cross(p.r2x, p.r2y, Px, Py);
      }
    }
  }
  function applyImpulses(W) {
    for (const A of W.list) {
      const a = A.a, b = A.b, ima = A.ima, iIa = A.iIa, imb = A.imb, iIb = A.iIb;
      if (!ima && !imb) continue;
      for (let i = 0; i < A.n; i++) {
        const p = A.pts[i];
        let dvx = b.vx - b.w * p.r2y - a.vx + a.w * p.r1y, dvy = b.vy + b.w * p.r2x - a.vy - a.w * p.r1x;
        const vn = dvx * p.nx + dvy * p.ny;
        let dPn = p.mn * (-vn + p.bias);
        const pn0 = p.pn;
        p.pn = Math.max(pn0 + dPn, 0);
        dPn = p.pn - pn0;
        let Px = dPn * p.nx, Py = dPn * p.ny;
        a.vx -= ima * Px; a.vy -= ima * Py; a.w -= iIa * cross(p.r1x, p.r1y, Px, Py);
        b.vx += imb * Px; b.vy += imb * Py; b.w += iIb * cross(p.r2x, p.r2y, Px, Py);
        // Friction.
        dvx = b.vx - b.w * p.r2y - a.vx + a.w * p.r1y; dvy = b.vy + b.w * p.r2x - a.vy - a.w * p.r1x;
        const tx = p.ny, ty = -p.nx, vt = dvx * tx + dvy * ty;
        let dPt = -p.mt * vt;
        const max = A.mu * p.pn, pt0 = p.pt;
        p.pt = Math.max(-max, Math.min(max, pt0 + dPt));
        dPt = p.pt - pt0;
        Px = dPt * tx; Py = dPt * ty;
        a.vx -= ima * Px; a.vy -= ima * Py; a.w -= iIa * cross(p.r1x, p.r1y, Px, Py);
        b.vx += imb * Px; b.vy += imb * Py; b.w += iIb * cross(p.r2x, p.r2y, Px, Py);
      }
    }
  }

  /** The push out of overlaps (split impulses): on the bodies' push velocities, which move them this step only. */
  function applyPush(W) {
    for (const A of W.list) {
      const a = A.a, b = A.b, ima = A.ima, iIa = A.iIa, imb = A.imb, iIb = A.iIb;
      if (!ima && !imb) continue;
      for (let i = 0; i < A.n; i++) {
        const p = A.pts[i];
        if (!p.push) continue;
        const dvx = b.bx - b.bw * p.r2y - a.bx + a.bw * p.r1y, dvy = b.by + b.bw * p.r2x - a.by - a.bw * p.r1x;
        const vn = dvx * p.nx + dvy * p.ny;
        let d = p.mn * (-vn + p.push);
        const p0 = p.pb;
        p.pb = Math.max(p0 + d, 0);
        d = p.pb - p0;
        const Px = d * p.nx, Py = d * p.ny;
        a.bx -= ima * Px; a.by -= ima * Py; a.bw -= iIa * cross(p.r1x, p.r1y, Px, Py);
        b.bx += imb * Px; b.by += imb * Py; b.bw += iIb * cross(p.r2x, p.r2y, Px, Py);
      }
    }
  }

  /** Turns (c, s) by angle a (small): a few terms of the series, then back to unit length. */
  function turn(b, a) {
    const a2 = a * a, co = 1 - a2 / 2 + (a2 * a2) / 24, si = a - (a * a2) / 6 + (a * a2 * a2) / 120;
    const c = b.c * co - b.s * si, s = b.s * co + b.c * si, l = Math.sqrt(c * c + s * s);
    b.c = c / l; b.s = s / l;
  }

  /** One step of the simulation. */
  let STAMP = 0;
  function step(W) {
    const h = 1 / P.HZ, inv = P.HZ, damp = 1 - P.DAMP * h, vmax = P.VMAX;
    for (const b of W.awake) {
      b.vy -= P.G * h;
      b.vx *= damp; b.vy *= damp; b.w *= damp;
      if (b.heavyT > 0) { b.heavyT -= h; if (b.heavyT <= 0) { b.heavy = 1; b.setMass(); } }
    }
    fill(W);
    contacts(W, ++STAMP);
    preStep(W, inv);
    for (let it = 0; it < P.ITER; it++) applyImpulses(W);
    for (let it = 0; it < P.ITER; it++) applyPush(W);
    const lim = P.SLEEP_V;
    let slept = false;
    for (const b of W.awake) {
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > vmax * vmax) { const k = vmax / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
      b.x += (b.vx + b.bx) * h; b.y += (b.vy + b.by) * h;
      if (b.w || b.bw) turn(b, (b.w + b.bw) * h);
      b.bx = b.by = b.bw = 0;
      b.box();
      // Still: its farthest point moves slower than SLEEP_V.
      const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + Math.abs(b.w) * b.r;
      if (v < lim) b.still += h; else b.still = 0;
    }
    // Bodies sleep together: those touching each other (awake) are an island, and it sleeps when all of it has been
    // still long enough (a body never sleeps on, or under, one still moving).
    const aw = W.awake;
    for (let i = 0; i < aw.length; i++) aw[i].isl = i;
    const find = (i) => { while (aw[i].isl !== i) i = aw[i].isl = aw[aw[i].isl].isl; return i; };
    for (const A of W.list) {
      if (!A.a.awake || !A.b.awake || A.a.fixed) continue;
      const x = find(aw.indexOf(A.a)), y = find(aw.indexOf(A.b));
      if (x !== y) aw[Math.max(x, y)].isl = Math.min(x, y);
    }
    const ready = new Map();
    for (let i = 0; i < aw.length; i++) { const r = find(i); ready.set(r, (ready.get(r) !== false) && aw[i].still >= P.SLEEP_T); }
    for (let i = 0; i < aw.length; i++) if (ready.get(find(i))) { sleep(W, aw[i]); slept = true; }
    if (slept || W.awake.some((b) => !b.awake)) W.awake = W.awake.filter((b) => b.awake);
  }

  // ---- coming to rest ------------------------------------------------------------------------------------------------

  const DEEP = 0.004; // an overlap deeper than this blocks a fall
  /** Minos of other bodies (and fixed cells, as { fixed }) that body b could meet moving down to y0 − down. */
  function nearBelow(W, b, down) {
    const out = [], w = W.w, seen = new Set();
    const x0 = Math.floor(b.x0 - 0.8), x1 = Math.floor(b.x1 + 0.8), y0 = Math.floor(b.y0 - down - 0.8), y1 = Math.floor(b.y1 + 0.8);
    for (let yy = Math.max(0, y0); yy <= y1; yy++) for (let xx = Math.max(0, x0); xx <= Math.min(w - 1, x1); xx++) {
      if (yy < W.h && W.fixed[yy * w + xx]) out.push({ fixed: true, x: xx + 0.5, y: yy + 0.5, c: 1, s: 0 });
      if (yy >= W.BH) continue;
      for (let e = W.head[yy * w + xx]; e >= 0; e = W.nxt[e]) {
        const r = W.ref[e], o = W.bodies[r >> 8], k = r & 255;
        if (o === b || seen.has(r)) continue;
        seen.add(r);
        out.push({ x: o.cx(k), y: o.cy(k), c: o.c, s: o.s });
      }
    }
    return out;
  }
  /** Would body b overlap anything (the floor, a wall, a fixed cell, a mino in near) moved down by d? */
  function blocked(b, d, near) {
    const e = 0.5 * (Math.abs(b.c) + Math.abs(b.s));
    for (let k = 0; k < b.m; k++) {
      const x = b.cx(k), y = b.cy(k) - d;
      if (y - e < -DEEP) { const cr = b.corners(k, CR); for (let j = 0; j < 4; j++) if (cr[2 * j + 1] - d < -DEEP) return true; }
      for (const o of near) {
        if (Math.abs(o.x - x) > 1.42 || Math.abs(o.y - y) > 1.42) continue;
        const n = collideBoxes(OUT, o.x, o.y, o.c, o.s, x, y, b.c, b.s);
        for (let i = 0; i < n; i++) if (OUT[i].sep < -DEEP) return true;
      }
    }
    return false;
  }
  /**
   * Every sleeping body that nothing holds up falls straight down (as all things fall, from rest) until it lands, the
   * lowest first; recorded frame by frame. Returns the bodies that fell.
   */
  function fall(W, rec) {
    fill(W);
    const order = W.bodies.filter((b) => !b.awake).sort((p, q) => p.y0 - q.y0 || p.id - q.id), moved = [];
    for (const b of order) {
      const near = nearBelow(W, b, b.y0 + 1);
      if (blocked(b, 0.01, near)) continue;
      // How far: the most it can go without overlapping (bisection; to 1/1024 of a cell).
      let lo = 0.01, hi = Math.max(0.02, b.y0 + 0.02);
      while (!blocked(b, hi, near) && hi < W.h + 20) { lo = hi; hi *= 2; }
      for (let i = 0; i < 24 && hi - lo > 1 / 1024; i++) { const mid = (lo + hi) / 2; if (blocked(b, mid, near)) hi = mid; else lo = mid; }
      moved.push({ b, from: b.y, d: lo });
      b.y -= lo; b.box();
      fill(W);
    }
    if (!moved.length) return [];
    // The frames: each falls from rest under gravity, all at once, and stops where it lands.
    if (rec) {
      const dt = P.FRAME / P.HZ, T = Math.sqrt((2 * Math.max(...moved.map((m) => m.d))) / P.G);
      for (let t = dt; t < T + dt; t += dt) {
        const set = [];
        for (const m of moved) {
          const f = Math.min(m.d, (P.G * t * t) / 2);
          if (f < m.d || (P.G * (t - dt) * (t - dt)) / 2 < m.d) set.push([m.b.id, m.b.x, m.from - f, m.b.c, m.b.s]);
        }
        rec.frameSet(set, Math.min(dt, T + dt - t));
      }
    }
    for (const m of moved) { const b = m.b; b.y = Math.round(b.y * Q) / Q; b.box(); b.landed = Math.sqrt(2 * P.G * m.d); }
    fill(W);
    return moved.map((m) => m.b);
  }
  /** Would body b fit at pose (x, y, c, s): no overlap deeper than DEEP with the floor, a wall or anything in near? */
  function fitsAt(W, b, x, y, c, s, near) {
    const X = b.x, Y = b.y, C0 = b.c, S0 = b.s;
    b.x = x; b.y = y; b.c = c; b.s = s;
    let ok = !blocked(b, 0, near);
    if (ok) for (let k = 0; k < b.m && ok; k++) { const cr = b.corners(k, CR); for (let j = 0; j < 4; j++) if (cr[2 * j] < -DEEP || cr[2 * j] > W.w + DEEP) ok = false; }
    b.x = X; b.y = Y; b.c = C0; b.s = S0;
    return ok;
  }
  /**
   * A body at rest a little off the grid's columns, or a little off square, eases into line when there is room
   * (within SNAP of a cell sideways, SNAP_TURN of a quarter turn): jelly settles into the slot it is nearly in, so
   * the bands can fill and what the grid shows is where things are. Lowest first; recorded as a short slide.
   * Returns the bodies that moved.
   */
  function snap(W, rec) {
    if (!(P.SNAP > 0)) return [];
    fill(W);
    const order = W.bodies.filter((b) => !b.awake).sort((p, q) => p.y0 - q.y0 || p.id - q.id), moved = [];
    for (const b of order) {
      // The nearest quarter turn.
      let c, s;
      if (Math.abs(b.c) >= Math.abs(b.s)) { c = b.c > 0 ? 1 : -1; s = 0; } else { c = 0; s = b.s > 0 ? 1 : -1; }
      const turnOff = Math.abs(c * b.s - s * b.c);
      if (turnOff > P.SNAP_TURN) continue;
      // Its first mino's centre then, onto the middle of a column.
      const mx = b.x + c * b.lx[0] - s * b.ly[0], my = b.y + s * b.lx[0] + c * b.ly[0];
      const dx = Math.floor(mx) + 0.5 - mx, cy0 = b.cy(0);
      if (Math.abs(dx) > P.SNAP || (Math.abs(dx) < 1 / Q && turnOff < 1 / QR)) continue;
      // Keep the first mino's height; lifted by SLOP, fall brings it down again.
      const x = b.x + dx, y = b.y + (cy0 - my) + P.SLOP + DEEP;
      const near = nearBelow(W, b, 0.2);
      if (!fitsAt(W, b, x, y, c, s, near)) continue;
      moved.push({ b, x0: b.x, y0: b.y, c0: b.c, s0: b.s, x, y, c, s });
      b.x = x; b.y = y; b.c = c; b.s = s; b.box();
      fill(W);
    }
    if (rec && moved.length) {
      const n = 6, dt = P.FRAME / P.HZ;
      for (let i = 1; i <= n; i++) {
        const t = i / n, e = t * t * (3 - 2 * t), set = [];
        for (const m of moved) {
          let c = m.c0 + (m.c - m.c0) * e, s = m.s0 + (m.s - m.s0) * e;
          const l = Math.sqrt(c * c + s * s) || 1;
          c /= l; s /= l;
          set.push([m.b.id, m.x0 + (m.x - m.x0) * e, m.y0 + (m.y - m.y0) * e, c, s]);
        }
        rec.frameSet(set, dt);
      }
    }
    return moved.map((m) => m.b);
  }

  /**
   * Is body b (at rest) steady where it is: its centre of mass over the span of the points it rests on (the floor, a
   * fixed cell, another body)? A body that is not, tips (the simulation takes it).
   */
  function steady(W, b) {
    let lo = Infinity, hi = -Infinity;
    const near = nearBelow(W, b, 0.1);
    for (let k = 0; k < b.m; k++) {
      const x = b.cx(k), y = b.cy(k) - 0.02;
      const cr = b.corners(k, CR);
      for (let j = 0; j < 4; j++) if (cr[2 * j + 1] < 0.03) { lo = Math.min(lo, cr[2 * j]); hi = Math.max(hi, cr[2 * j]); }
      for (const o of near) {
        if (Math.abs(o.x - x) > 1.42 || Math.abs(o.y - y) > 1.42) continue;
        const n = collideBoxes(OUT, o.x, o.y, o.c, o.s, x, y, b.c, b.s);
        for (let i = 0; i < n; i++) if (OUT[i].ny > 0.5) { lo = Math.min(lo, OUT[i].x); hi = Math.max(hi, OUT[i].x); }
      }
    }
    return b.x >= lo - 0.02 && b.x <= hi + 0.02;
  }

  /** The simulation, until every awake body sleeps (at most PHASE_T seconds: then they sleep where they are). */
  function simulate(W, rec) {
    const cap = Math.round(P.PHASE_T * P.HZ), dt = P.FRAME / P.HZ;
    let n = 0;
    while (W.awake.length && n < cap) {
      step(W);
      n++;
      if (rec && n % P.FRAME === 0) rec.frame(W, dt);
    }
    for (const b of W.awake) sleep(W, b);
    W.awake = [];
    if (rec && (n % P.FRAME || W.moved.size)) rec.frame(W, (n % P.FRAME) / P.HZ);
    W.arb.clear();
    return n;
  }

  /**
   * Everything to rest: the bodies awake (a piece just set, what a hard drop struck) are simulated; then whatever
   * sleeps with nothing under it falls, and a body that lands unsteady tips over in the simulation; again, until all
   * rest (a few rounds at most).
   */
  function settle(W, rec) {
    for (let round = 0; round < 8; round++) {
      if (W.awake.length) simulate(W, rec);
      const moved = fall(W, rec);
      for (const b of snap(W, rec)) if (!moved.includes(b)) moved.push(b);
      for (const b of fall(W, rec)) if (!moved.includes(b)) moved.push(b);
      for (const b of W.fresh) if (!b.awake && W.bodies.includes(b) && !moved.includes(b)) moved.push(b);
      W.fresh.clear();
      for (const b of moved) if (!steady(W, b)) wake(W, b);
      if (!W.awake.length) break;
    }
    for (const b of W.awake) sleep(W, b);
    W.awake = [];
    W.arb.clear();
    W.moved.clear();
  }

  /** Puts a new body in, in id order. */
  function insert(W, b) {
    W.bodies.push(b);
    W.bodies.sort((p, q) => p.id - q.id);
  }

  // ---- the grid ------------------------------------------------------------------------------------------------------

  /** The cell mino k of body b fills: the one its centre is in (the cell it covers most of), clamped into the board. */
  function cellOf(W, b, k) {
    let x = Math.floor(b.cx(k)), y = Math.floor(b.cy(k));
    x = x < 0 ? 0 : x >= W.w ? W.w - 1 : x;
    y = y < 0 ? 0 : y >= W.h ? W.h - 1 : y;
    return y * W.w + x;
  }
  /** The grid of the bodies at rest: each mino fills cellOf; fixed cells keep theirs; in a cell two share, the first body's. */
  function raster(W) {
    const R = W.raster;
    R.set(W.fixed);
    for (const b of W.bodies) for (let k = 0; k < b.m; k++) { const i = cellOf(W, b, k); if (!R[i]) R[i] = b.v[k]; }
    return R;
  }

  /** Takes minos away (pick(b, k): does it go?): their bodies split into what is left; returns [{ x, y, v }]. */
  function remove(W, pick) {
    const out = [], next = [];
    for (const b of W.bodies) {
      const gone = new Set();
      for (let k = 0; k < b.m; k++) if (pick(b, k)) gone.add(k);
      if (!gone.size) { next.push(b); continue; }
      for (const k of gone) out.push({ x: b.cx(k), y: b.cy(k), v: b.v[k] });
      for (const nb of split(b, gone, () => W.nextId())) { next.push(nb); W.fresh.add(nb); }
    }
    W.bodies = next.sort((p, q) => p.id - q.id);
    W.awake = W.bodies.filter((b) => b.awake);
    W.arb.clear();
    return out;
  }
  /** Takes away the minos whose cell (cellOf) is in `cells` (a Set of indices), and wakes what is above. */
  function carve(W, cells) {
    let low = Infinity;
    for (const i of cells) low = Math.min(low, Math.floor(i / W.w));
    void low;
    return remove(W, (b, k) => cells.has(cellOf(W, b, k)));
  }

  /** Spans of band y: each mino centred in it (its unit span's left edge) and each fixed cell. */
  function spansOf(W, y) {
    const s = [];
    for (const b of W.bodies) for (let k = 0; k < b.m; k++) if (Math.floor(b.cy(k)) === y) s.push(b.cx(k) - 0.5);
    for (let x = 0; x < W.w; x++) if (W.fixed[y * W.w + x]) s.push(x);
    return s;
  }
  function coverOfSpans(s, w) {
    s.sort((a, b) => a - b);
    let cover = 0, end = -Infinity;
    for (const x0 of s) {
      const a = Math.max(0, x0, end), b = Math.min(w, x0 + 1);
      if (b > a) cover += b - a;
      end = Math.max(end, x0 + 1);
    }
    return cover;
  }
  /** How much of band y's width its minos and fixed cells cover (0–1). */
  const coverOf = (W, y) => coverOfSpans(spansOf(W, y), W.w) / W.w;

  /** The bands that clear now (coverNeed), lowest first. */
  function bands(W) {
    const w = W.w, h = W.h, spans = [];
    for (let y = 0; y < h; y++) spans.push([]);
    for (const b of W.bodies) for (let k = 0; k < b.m; k++) {
      const y = Math.floor(b.cy(k));
      if (y >= 0 && y < h) spans[y].push(b.cx(k) - 0.5);
    }
    const out = [], need = coverNeed(w) - 1e-9;
    for (let y = 0; y < h; y++) {
      const s = spans[y];
      for (let x = 0; x < w; x++) if (W.fixed[y * w + x]) s.push(x);
      if (s.length >= need && coverOfSpans(s, w) >= need) out.push(y);
    }
    return out;
  }

  /**
   * Clears band rows `rows`: every whole mino centred in one goes (never part of one), and the fixed cells in them;
   * the bodies they were in split into what is left; what is above wakes. Returns { removed: each row's values, cells }.
   */
  function clearBands(W, rows) {
    const w = W.w, set = new Set(rows), removed = rows.map(() => []), cells = [];
    const out = remove(W, (b, k) => set.has(Math.floor(b.cy(k))));
    for (const c of out) { removed[rows.indexOf(Math.floor(c.y))].push(c.v); cells.push(c); }
    let low = Infinity;
    for (const y of rows) {
      low = Math.min(low, y);
      for (let x = 0; x < w; x++) { const v = W.fixed[y * w + x]; if (v) { removed[rows.indexOf(y)].push(v); cells.push({ x: x + 0.5, y: y + 0.5, v }); W.fixed[y * w + x] = 0; } }
    }
    void low;
    return { removed, cells };
  }

  /** Cells that stay on the grid above cleared rows come down one row for each (the sprout never moves). */
  function shiftFixed(W, rows) {
    const w = W.w, h = W.h, f = W.fixed, out = new Uint16Array(f.length), set = new Set(rows);
    for (let i = 0; i < f.length; i++) if (f[i] & CELL.ASSET) out[i] = f[i];
    for (let y = 0; y < h; y++) {
      if (set.has(y)) continue;
      let down = 0;
      for (const r of rows) if (r < y) down++;
      for (let x = 0; x < w; x++) {
        const v = f[y * w + x];
        if (!v || v & CELL.ASSET) continue;
        let ny = y - down;
        while (ny < y && out[ny * w + x]) ny++;
        out[ny * w + x] = v;
      }
    }
    f.set(out);
  }

  // ---- the record the view plays back -------------------------------------------------------------------------------

  /**
   * What a lock did, for the view: the bodies before it (start: [def]), then frames { t (seconds since the frame
   * before), set: [[id, x, y, c, s]] (bodies that moved), add: [def] (the piece; the parts a clear left), del: [id],
   * clear: { rows, cells: [{ x, y, v }], n } }, and at the end the bodies as they rest (final).
   * def: { id, m, lx, ly, v, pose: [x, y, c, s] }.
   */
  function Recorder(W, skip) {
    this.start = W.bodies.filter((b) => !skip.has(b.id)).map(defOf);
    this.frames = [];
    this.max = 1200;
    this.pend = { add: [], del: [], clear: null };
    this.cut = false;
  }
  const poseOf = (b) => [b.id, b.x, b.y, b.c, b.s];
  function defOf(b) { return { id: b.id, m: b.m, lx: b.lx.slice(), ly: b.ly.slice(), v: b.v.slice(), cells: b.cells.slice(), pose: [b.x, b.y, b.c, b.s] }; }
  Recorder.prototype.frame = function (W, t) {
    const set = [];
    for (const b of W.awake) { W.moved.delete(b); set.push(poseOf(b)); }
    for (const b of W.moved) if (W.bodies.includes(b)) set.push(poseOf(b));
    W.moved.clear();
    if (this.frames.length >= this.max) { this.cut = true; return; }
    this.frames.push({ t, set, add: this.pend.add, del: this.pend.del, clear: this.pend.clear });
    this.pend = { add: [], del: [], clear: null };
  };
  /** A frame of given poses ([[id, x, y, c, s]]: a fall worked out, not simulated). */
  Recorder.prototype.frameSet = function (set, t) {
    if (this.frames.length >= this.max) { this.cut = true; return; }
    this.frames.push({ t, set, add: this.pend.add, del: this.pend.del, clear: this.pend.clear });
    this.pend = { add: [], del: [], clear: null };
  };
  Recorder.prototype.add = function (b) { this.pend.add.push(defOf(b)); };
  Recorder.prototype.del = function (id) { this.pend.del.push(id); };
  Recorder.prototype.end = function (W) {
    if (this.pend.add.length || this.pend.del.length || this.pend.clear) this.frame(W, 0);
    this.final = W.bodies.map(defOf);
    this.time = this.frames.reduce((a, f) => a + f.t, 0);
  };

  // ---- save, Undo -----------------------------------------------------------------------------------------------------

  /** The state as plain numbers (integers; the bodies all asleep): the save and an Undo step. */
  function pack(W) {
    return {
      v: 3, next: W.next, seed: W.seed,
      fixed: Array.from(W.fixed), raster: Array.from(W.raster),
      bodies: W.bodies.map((b) => [b.id, Array.from(b.cells), [Math.round(b.x * Q) + 0, Math.round(b.y * Q) + 0, Math.round(b.c * QR) + 0, Math.round(b.s * QR) + 0], Array.from(b.v)]),
    };
  }
  function unpack(W, s) {
    const N = W.w * W.h;
    if (!s || s.v !== 3 || !Array.isArray(s.bodies) || !Array.isArray(s.fixed) || s.fixed.length !== N || !Array.isArray(s.raster) || s.raster.length !== N) return false;
    const bodies = [];
    for (const e of s.bodies) {
      if (!Array.isArray(e) || e.length !== 4) return false;
      const [id, cells, pose, v] = e;
      if (!Number.isInteger(id) || !Array.isArray(cells) || !Array.isArray(pose) || pose.length !== 4 || !Array.isArray(v)) return false;
      if (!v.length || v.length > 255 || cells.length !== 2 * v.length || !cells.every(Number.isInteger) || !pose.every(Number.isFinite)) return false;
      const b = new Body(id, cells, v);
      b.x = pose[0] / Q; b.y = pose[1] / Q; b.c = pose[2] / QR; b.s = pose[3] / QR;
      b.box();
      bodies.push(b);
    }
    W.bodies = bodies.sort((p, q) => p.id - q.id);
    W.fixed.set(s.fixed); W.raster.set(s.raster);
    W.next = Math.max(s.next | 0, 1);
    W.seed = s.seed | 0;
    for (const b of W.bodies) W.next = Math.max(W.next, b.id + 1);
    W.awake = []; W.arb.clear(); W.moved.clear();
    return true;
  }

  /**
   * The grid changed under the bodies (an item took cells, a part wrote some: Protect's stones and moles; a board made
   * or edited): what went from the grid goes from the bodies (the minos whose cell it was: whole minos), and what came
   * is taken in, a STATIC cell as it is, others as bodies (cells joined by the old links, JOIN_R and JOIN_U, are one
   * body; else each its own). except: cells not to take in (the piece being set). Returns the minos carved, or null.
   */
  function sync(W, cells, except) {
    const R = W.raster, N = cells.length;
    let gone = null;
    const come = [];
    for (let i = 0; i < N; i++) {
      const now = cells[i], was = R[i];
      if (now === was || (except && except.has(i))) continue;
      if (was) {
        if (W.fixed[i]) W.fixed[i] = 0;
        else (gone = gone || new Set()).add(i);
      }
      if (now) {
        if (now & STATIC) W.fixed[i] = now;
        else come.push(i);
      }
      R[i] = now;
    }
    const carved = gone ? carve(W, gone) : null;
    if (come.length) {
      const w = W.w, set = new Set(come), seen = new Set();
      for (const i of come) {
        if (seen.has(i)) continue;
        const grp = [], st = [i];
        seen.add(i);
        while (st.length) {
          const j = st.pop(), x = j % w;
          grp.push(j);
          const nb = [];
          if (cells[j] & JR && x + 1 < w) nb.push(j + 1);
          if (cells[j] & JU) nb.push(j + w);
          if (x > 0 && cells[j - 1] & JR) nb.push(j - 1);
          if (j >= w && cells[j - w] & JU) nb.push(j - w);
          for (const k of nb) if (set.has(k) && !seen.has(k)) { seen.add(k); st.push(k); }
        }
        grp.sort((a, b) => a - b);
        W.bodies.push(fromCells(W.nextId(), grp.map((j) => [j % w, (j - (j % w)) / w]), grp.map((j) => cells[j] & ~(JR | JU))));
      }
      W.bodies.sort((p, q) => p.id - q.id);
    }
    return carved;
  }

  // ---- a lock ----------------------------------------------------------------------------------------------------------

  /**
   * After a lock's (or an item's) change: everything settles, the bands that fill clear, and again until nothing
   * clears. added: the bodies just made (the piece), shown from the first frame. Returns { waves: [{ rows, removed,
   * cells, t }], rec }.
   */
  function run(g, W, added, record) {
    const live = new Set(W.bodies.map((b) => b.id)), add = (added || []).filter((b) => live.has(b.id));
    const rec = record === false ? null : new Recorder(W, new Set(add.map((b) => b.id)));
    if (rec) for (const b of add) rec.add(b);
    const waves = [];
    let t = 0;
    for (let n = 0; n < MAX_WAVES; n++) {
      const f0 = rec ? rec.frames.length : 0;
      settle(W, rec);
      if (rec) for (let i = f0; i < rec.frames.length; i++) t += rec.frames[i].t;
      let rows = bands(W);
      // Other parts may keep rows from clearing (Protect's bed).
      if (g && g.hooks && g.hooks.rows) for (const e of g.hooks.rows) if (e.key !== 'jelly') { const r = e.rows(g, g.board, rows.slice()); if (Array.isArray(r)) rows = r; }
      if (!rows.length) break;
      const before = new Set(W.bodies.map((b) => b.id));
      const { removed, cells } = clearBands(W, rows);
      waves.push({ rows, removed, cells, t });
      if (rec) {
        const after = new Set(W.bodies.map((b) => b.id));
        for (const id of before) if (!after.has(id)) rec.del(id);
        for (const b of W.bodies) if (!before.has(b.id)) rec.add(b);
        rec.pend.clear = { rows, cells, n: waves.length };
      }
      // What the bands held comes down: the bodies fall, then the cells that stay on the grid come down a row for each
      // band under them (as rows always have), the sprout aside.
      fall(W, rec);
      shiftFixed(W, rows);
    }
    // Every body at rest on the lattice the save keeps (a resumed board, or Undo, has exactly this).
    for (const b of W.bodies) quantize(b);
    raster(W);
    if (rec) rec.end(W);
    return { waves, rec };
  }

  /** How a piece is set down: after a hard drop of `dist` rows, fast (down, a seeded hair sideways) and heavy; else gently. */
  function launch(seed, dist, salt) {
    if (!(dist > 0)) return { vy: 0, vx: 0, heavy: 1 };
    const vy = Math.min(P.IMPACT_MAX, P.IMPACT_K * Math.sqrt(dist));
    const u = hash((seed | 0) ^ 0x51ed27, salt | 0) / 4294967296 - 0.5;
    return { vy, vx: u * 0.04 * vy, heavy: Math.min(P.IMPACT_HEAVY, 1 + dist / P.IMPACT_ROWS) };
  }
  /** A new body at cells ([[x, y]], inside the board), set down as launch says: in the world, awake. */
  function place(W, cells, vals, L0) {
    const nb = fromCells(W.nextId(), cells, vals);
    insert(W, nb);
    nb.vx = L0.vx; nb.vy = -L0.vy;
    if (L0.heavy > 1) { nb.heavy = L0.heavy; nb.heavyT = P.IMPACT_T; nb.setMass(); }
    wake(W, nb);
    return nb;
  }

  // ---- the engine's hooks ------------------------------------------------------------------------------------------

  /** The extension a Jelly board's Game gets (Recipe.engine). saved: its state from the save. */
  function makeExt(game, saved) {
    const W = new World(game.w, game.h);
    if (!unpack(W, saved)) { W.seed = (game.seed | 0) || 0; sync(W, game.board.cells, null); raster(W); }
    const real = (g, b) => b === g.board;
    let pending = null; // the piece's new bodies, between its afterPlace and the clear after it
    return {
      W,
      afterPlace(g, b, abs, v, res) {
        if (!real(g, b)) return;
        const w = g.w, idx = new Set(), cells = [];
        for (const [x, y] of abs) if (x >= 0 && x < w && y >= 0 && y < g.h && !idx.has(y * w + x)) { idx.add(y * w + x); cells.push([x, y]); }
        sync(W, b.cells, idx);
        const L0 = launch(W.seed, res && res.dropDist, (g.s.pieces | 0) + 1);
        pending = groups(cells).map((grp) => { const cs = grp.map((i) => cells[i]); return place(W, cs, cs.map(([x, y]) => b.cells[y * w + x] & ~(JR | JU)), L0); });
        for (const i of idx) W.raster[i] = b.cells[i];
      },
      // The grid never clears rows by itself on a Jelly board (the bands do, afterClear). A simulated placement (Best
      // Fit, a bot, on a copy of the grid) clears full rows as a plain board does.
      rows(g, b, rows) { return real(g, b) ? [] : rows; },
      // Rows an item takes (a Laser's): the minos centred in them go, nothing comes down yet.
      clearRows(g, b, rows) {
        if (!real(g, b)) return null;
        if (!rows.length) return [];
        sync(W, b.cells, null);
        const out = clearBands(W, rows.slice().sort((p, q) => p - q));
        raster(W);
        b.cells.set(W.raster);
        return out.removed;
      },
      afterClear(g, b, res) {
        if (!real(g, b)) return;
        sync(W, b.cells, null);
        const added = pending || [];
        pending = null;
        const { waves, rec } = run(g, W, added);
        b.cells.set(W.raster);
        if (waves.length) res.cascade = (res.cascade || []).concat(waves);
        Object.defineProperty(res, 'jelly', { value: rec, enumerable: false, configurable: true, writable: true });
      },
      afterChange(g, kind) {
        if (kind !== 'flip') return;
        // Mirror World: every body turns left to right with the board (its shape mirrored, its turn the other way).
        const w = g.w;
        W.bodies = W.bodies.map((bd) => {
          const cells = [];
          for (let k = 0; k < bd.m; k++) cells.push(-1 - bd.cells[2 * k], bd.cells[2 * k + 1]);
          const nb = new Body(bd.id, cells, Array.from(bd.v));
          nb.x = w - bd.x; nb.y = bd.y; nb.c = bd.c; nb.s = -bd.s;
          nb.box();
          return nb;
        });
        const f = new Uint16Array(W.fixed.length);
        for (let i = 0; i < f.length; i++) { const x = i % w; f[i - x + (w - 1 - x)] = W.fixed[i]; }
        W.fixed.set(f);
        raster(W);
        g.board.cells.set(W.raster);
      },
      // Every clear on a Jelly board is plain; its minos pay WORTH of a cell. Each wave after the first (a band the last
      // clear's fall filled: a cascade) scores 100 points times its number.
      step(g, res) {
        const waves = res && res.cascade;
        if (!waves || !waves.length) return;
        let own = 0;
        for (const wv of waves) for (const row of wv.removed || []) for (const v of row) if (!(v & CELL.FOREIGN)) own++;
        const k = waves.length, cas = k - 1;
        res.waves = k; res.cascades = cas;
        const cut = (own / g.w) * (1 - WORTH);
        res.bandOwn = own / g.w;
        res.own -= cut;
        g.s.own = (g.s.own || 0) - cut;
        let pts = 0;
        for (let i = 1; i <= cas; i++) pts += 100 * i;
        g.s.score += pts;
        res.score = (res.score || 0) + pts;
        g.s.cascades = (g.s.cascades || 0) + cas;
        g.s.bestCascade = Math.max(g.s.bestCascade || 0, cas);
      },
      snap() { return pack(W); },
      restore(g, s) { unpack(W, s); pending = null; },
      save() { return pack(W); },
      reset(g) { W.bodies = []; W.awake = []; W.arb.clear(); W.fixed.fill(0); W.raster.fill(0); pending = null; sync(W, g.board.cells, null); raster(W); },
      summary(g) { return { cascades: g.s.cascades || 0, best: g.s.bestCascade || 0 }; },
    };
  }

  /** The Jelly world of a game (null on a board that is not Jelly). */
  function of(game) {
    const e = game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'jelly') : null;
    return e ? e.W : null;
  }

  // ---- Free Play ----------------------------------------------------------------------------------------------------

  /** The rows a lock's bands cleared, all its waves. */
  const cascadeRows = (r) => (r && r.cascade ? r.cascade.reduce((a, wv) => a + ((wv.rows && wv.rows.length) || 0), 0) : 0);
  /** How many of a lock's waves came after the first (its cascades). */
  const cleared = (res) => (res && res.cascade ? Math.max(0, res.cascade.length - 1) : 0);

  /**
   * Free Play's controller on a Jelly board: the plain lock, heard without its bands (r.heardLater: each is heard as
   * the view plays it), then the cascades counted.
   */
  function controller(play, game) {
    if (!game || !isOn(game.recipe)) return null;
    return {
      id: 'jelly',
      onLock(r) {
        const later = cascadeRows(r);
        if (later) r.heardLater = later;
        this.base.onLock(r);
        if (later) {
          const rp = play.view && play.view.jelly && play.view.jelly.replay;
          const snd = play.app.sound;
          if (rp) rp.onWave = (wv) => { if (wv.rows.length && snd) snd.play('clear', wv.rows.length); };
          else if (snd) snd.play('clear', later);
        }
        const k = r.cascades || 0;
        if (!k) return;
        const F = play.app.store.state.stats.free;
        F.cascades = (F.cascades || 0) + k;
        F.bestCascade = Math.max(F.bestCascade || 0, k);
        play.app.store.touch();
      },
    };
  }

  // ---- the part ------------------------------------------------------------------------------------------------------

  const part = {
    key: 'jelly', order: 30, mod: 'jelly', owns: ['mods.jelly'],
    // Rated for pay (every clear plain, at WORTH); feats and skill combos are off. Settle, Trapdoor and Tornado are
    // refused: each moves the grid's cells about, and on Jelly the pieces are bodies that stay whole.
    rules(r, R) {
      if (!isOn(r)) return;
      R.noFeats = true;
      for (const id of ['tornado', 'settle', 'trapdoor']) R.refuse[id] = 'Not on a Jelly board';
    },
    engine(game, saved) { return isOn(game.recipe) ? makeExt(game, saved) : null; },
    controller,
    summary(x, g) { return g && isOn(g.recipe) ? { cascades: (g.s && g.s.cascades) || 0, best: (g.s && g.s.bestCascade) || 0 } : null; },
    stats: { free: { cascades: 0, bestCascade: 0 } },
  };
  if (Recipe) Recipe.part(part);

  // Knock-On: counts on any Jelly board (the feats' rule does not hide it).
  if (L.Achievements) {
    L.Achievements.add({
      id: 'knock_on', group: 'play', name: 'Knock-On', desc: 'Three cascades from one piece: bands that fill as what a clear left comes down. On a Jelly board.', pay: 30, on: 'play',
      counts: (r) => isOn(r),
      test: (s, e) => !!e.r && (e.r.cascades || cleared(e.r)) >= 3,
    });
  }

  L.Jelly = { P, Q, WORTH, coverNeed, World, Body, fromCells, groups, split, insert, place, settle, simulate, fall, steady, step, run, raster, bands, coverOf, clearBands, carve, sync, pack, unpack, launch, hash, collideBoxes, of, isOn, part, cleared, cascadeRows, STATIC };
})(typeof globalThis !== 'undefined' ? globalThis : this);
