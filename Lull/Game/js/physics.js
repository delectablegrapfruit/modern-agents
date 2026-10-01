// Lull — Physics, a board modifier (js/recipe.js): Tetris with physics. The piece in play is the player's, rigid, until
// let go: it never falls by itself (on Physics + Plain; Classic's gravity moves it under Classic) and touching a body or
// the floor never sets it. It moves column by column and turns, shoving the bodies in its way aside (refused when they
// cannot go), and ↓ takes it down to rest on what is below. Let go (a hard drop throws it; ↓ again while it rests sets
// it down gently; Classic's lock delay), it becomes a soft body and the next piece appears at once. Every body lives in
// continuous space, simulated in real time, a fixed small step at a time (never solved ahead at the lock): a hard drop
// lands hard and knocks what it hits, a soft one sets down gently. A band one mino tall clears when the minos centred
// in it really cover about 90% of it (their own outlines, overlaps once, gaps as gaps): those whole minos go, what is
// left of each body splits into its connected parts, and everything above falls in the frames after. Rewind 5 s takes
// Undo's place. Pure rules, no DOM: the material, the world, the step, the clears, the engine's hooks, the rewind
// buffer and the pay; the look and Free Play's controller are js/physicsview.js.
//
// The model (position-based dynamics on particles, the way soft-body games do it):
//   - every mino is a quad of four particles (its corners); minos of one body share the corners they meet at; bodies
//     of different pieces never share anything
//   - Verlet-style integration with gravity and a little air damping, in substeps of 1/240 s
//   - shape matching per body (Müller et al. 2005), weak, and per mino, firmer: each particle is pulled toward where the
//     rest shape, best rotated onto it, puts it; each mino edge keeps its length firmly (squash is stiff, shear and bend
//     soft), within SQUASH, and no corner strays STRAIN from its mino's square: bodies bend, sag and wobble, a stack keeps
//     its height
//   - plasticity: under load the rest shape drifts toward the deformed one (at the material's flow rate, past a small
//     yield, never more than a bound from the grid shape, each mino edge's two corners within BEND of each other): dents
//     and bends are kept, a mino stays near a square
//   - each mino keeps its area (a quad area constraint): squash wide, stretch thin, never collapse
//   - collisions: a particle inside another body's mino is pushed out through the outer edge it came in by, or the one
//     facing its own mino (both sides move, by mass), with low friction and restitution; once a step every pair of minos
//     of different bodies that still overlap is parted along its least overlap (separating axes); walls and the floor;
//     the piece in play (rigid, kinematic: W.kin); a spatial hash grid of the minos (cell 1)
//   - sleeping: a body still for SLEEP_T, all it touches still or asleep, sleeps (costs nothing, solid to the rest);
//     a body struck faster than WAKE_V wakes, and so does all that rests on it; a clear wakes everything above it
// Not deterministic across engines and not meant to be: the save keeps the bodies themselves.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL } = L;

  // ---- materials ---------------------------------------------------------------------------------------------------

  /**
   * A material is a set of numbers (pulls are per 1/240 s). stiffness: the whole body's pull toward its rest shape (0
   * limp, 1 rigid); mino: each mino's pull toward its own square (shear and bend); edge: each mino edge's pull toward its
   * length (squash: kept stiff, so a stack keeps its height); flow: how fast the rest shape follows a deformation past
   * `yield` (a second: dents and bends it keeps); drift: the most the rest shape may leave the grid shape (cells); area:
   * how hard a mino keeps its area; wobble: how much of the wobble about the body's own motion is lost; restitution: of
   * the closing speed a landing on the floor or a wall gives back (above BOUNCE_V); friction: Coulomb, on bodies and the
   * floor; density: mass a mino; damping: velocity lost a second. Reduced motion uses `still` over it: stiffer, less
   * bouncy, more damped (less wobble, the same game).
   */
  const MATERIALS = {
    jelly: {
      name: 'Jelly',
      stiffness: 0.004, mino: 0.015, edge: 0.35, flow: 6, yield: 0.015, drift: 0.45, area: 0.6, wobble: 0.08,
      restitution: 0.25, friction: 0.18, density: 1, damping: 0.3,
      still: { stiffness: 0.02, mino: 0.06, wobble: 0.3, restitution: 0.08 },
    },
  };
  const MATERIAL_IDS = Object.keys(MATERIALS);
  const DEFAULT_MATERIAL = 'jelly';
  /** A material's numbers (reduced: the still variant). */
  function material(id, reduced) {
    const m = MATERIALS[id] || MATERIALS[DEFAULT_MATERIAL];
    return reduced && m.still ? Object.assign({}, m, m.still) : m;
  }

  // ---- the numbers ---------------------------------------------------------------------------------------------------

  const P = {
    G: 34, // gravity, cells a second squared
    STEP: 1 / 120, // the fixed step (seconds)
    SUB: 2, // substeps a step
    SOFT_V: 10, // the piece in play goes down this fast while ↓ is held (it never falls by itself)
    REST_HOLD: 0.25, // ↓ held (or a drag down) this long against what the piece rests on lets it go, gently
    SHOVE_V: 4, // what the piece in play shoves aside moves off at least this fast (cells a second)
    SHOVE_TOL: 0.1, // a shove may leave bodies this far into each other (they part by themselves); more is pinned
    SHOVE_MAX: 1.2, // nothing is shoved further than this by one move (cells)
    SOFT_LAND: 2, // a piece that lands soft keeps at most this much downward speed
    HARD_V: 26, // a hard drop's speed at the landing
    VMAX: 45, // no particle moves faster
    CONTACT_DAMP: 0.5, // of the speed two bodies still pressed together part at, lost a substep
    UP_MAX: 9, // no body as a whole rises faster than this (cells a second)
    REST_V: 1.2, REST_DAMP: 5, // a body in contact slower than REST_V (cells a second) loses REST_DAMP of its speed a second
    PULL_MAX: 8, // shape matching never moves a particle faster than this (cells a second)
    SHOCK: 0.25, // in a contact, the lower body moves this much of what the upper one does
    PUSH_MAX: 6, // nor does a contact push one out faster than this, beyond undoing what closed it that substep
    BOUNCE_V: 4, // a contact closing slower than this does not bounce (resting contact never does)
    SLEEP_D: 0.04, SLEEP_T: 0.4, // a body whose particles stay within SLEEP_D (on average) of where they were for SLEEP_T sleeps
    SLEEP_ONE: 0.12, // ... and none of them further than this
    WAKE_V: 3, // a sleeping body struck faster than this wakes (a resting stack jitters at about 1)
    COVER: 0.9, // a band clears when its minos cover this much of it (by area: their own outlines)
    COVER_SLACK: 0.03, // ... less a hair (a squashed jelly mino keeps its area, not its exact square)
    BAND_LINES: 8, // lines across a band its cover is measured on
    CALM_V: 3, // ... and each of them moves slower than this (never one passing through)
    TOP_T: 1.5, // seconds a settled body may stay above the top line before the board is full
    TOP_V: 2, // settled: slower than this as a whole (cells a second)
    SNAP_EVERY: 0.25, SNAP_SPAN: 5, // the rewind buffer: a snapshot every quarter second, five seconds back
    ROOF: 10, // rows of room above the top line (the world's ceiling)
    STRAIN: 0.12, // no mino corner strays further than this from its square (best rotated onto it)
    SQUASH: 0.12, // a mino edge is never shorter or longer than its grid length by more than this share
    MINO_TOL: 0.01, // two minos of different bodies may overlap by this much (a resting contact) before they are parted
    BEND: 0.15,
    REST_SQUASH: 0.03, // ... nor its rest shape's edges (kept dents are bends and shears) // the most two corners of a mino edge may differ in plastic drift (cells): a mino stays near a square
    EPS: 0.015, // the piece in play may graze a body by this much
    EPS_HERE: 0.2, // ... and where it already is (a body pressing on it is pushed back out by it, not a reason to end)
  };
  /** What a mino a clear removes pays, of a cell of a row on a plain board (no bonus, no streak): fairness. */
  const WORTH = 0.55;

  const on = (r) => !!(r && r.mods && r.mods.physics);
  /** Classic drives the piece in play on a Physics + Classic board (its gravity, lock delay and drops). */
  const classicOn = (r) => !!r && r.mode === 'classic';

  // ---- bodies --------------------------------------------------------------------------------------------------------

  /**
   * A body: particles (x, y now; px, py a step ago; lx, ly the grid corner each came from; rx, ry the rest shape, the
   * grid shape plus plastic drift) and minos (four particle indices each, counter-clockwise from the lower left; a
   * colour; which of its four edges face out: bit k is the edge from corner k to k + 1).
   */
  function Body(id, n, m) {
    this.id = id; this.n = n; this.m = m;
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.px = new Float64Array(n); this.py = new Float64Array(n);
    this.lx = new Int16Array(n); this.ly = new Int16Array(n); this.rx = new Float64Array(n); this.ry = new Float64Array(n);
    this.outer = new Uint8Array(n); // a particle on an outer edge (only these collide)
    this.ox = new Float64Array(n); this.oy = new Float64Array(n); // where each was when the body last moved (sleep)
    this.q = new Int32Array(4 * m); this.col = new Uint16Array(m); this.edge = new Uint8Array(m);
    this.awake = true; this.still = 0; this.win = 0; this.touch = []; this.nt = 0; this.loops = null; // (touch: the bodies it touched this step, nt of them)
    this.ux = 0; this.uy = 0; // its middle's speed (a substep's move)
    this.c = 1; this.s = 0; // its turn (shape matching's rotation, cosine and sine)
    this.x0 = 0; this.y0 = 0; this.x1 = 0; this.y1 = 0; // bounds
    // (Filled in later, declared here so every body has one shape: the step's loops stay fast.)
    this.pm = null; // each particle's own mino (topo)
    this.mb = null; // each mino's box this substep (World.hash)
    this.nm = null; // each mino's edge normals and its extent on them this step (norms)
    this.onKin = false; // resting on the piece in play this step
    this.flowed = false; // its rest shape flowed this step (bound)
  }
  /** Works out each mino's outer edges, the outer particles and the outline loops (after a body is made). */
  Body.prototype.topo = function () {
    const m = this.m, q = this.q, cnt = new Map();
    const key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
    for (let k = 0; k < m; k++) for (let e = 0; e < 4; e++) { const kk = key(q[4 * k + e], q[4 * k + ((e + 1) & 3)]); cnt.set(kk, (cnt.get(kk) || 0) + 1); }
    this.outer.fill(0);
    // Each particle's own mino (one of those it is a corner of): a contact pushes it out the way its mino faces.
    this.pm = new Int32Array(this.n);
    for (let k = 0; k < m; k++) for (let e = 0; e < 4; e++) this.pm[q[4 * k + e]] = k;
    const nexts = new Map();
    for (let k = 0; k < m; k++) {
      let bits = 0;
      for (let e = 0; e < 4; e++) {
        const a = q[4 * k + e], b = q[4 * k + ((e + 1) & 3)];
        if (cnt.get(key(a, b)) === 1) { bits |= 1 << e; this.outer[a] = 1; this.outer[b] = 1; (nexts.get(a) || nexts.set(a, []).get(a)).push(b); }
      }
      this.edge[k] = bits;
    }
    // The outline: outer edges chained into loops (a corner two minos meet at only is passed through once each way).
    const loops = [];
    for (const [a0, list] of nexts) {
      while (list.length) {
        const loop = [a0];
        let at = list.pop(), guard = 0;
        while (at !== a0 && guard++ < 4 * m + 4) {
          loop.push(at);
          const nx = nexts.get(at);
          if (!nx || !nx.length) break;
          at = nx.pop();
        }
        if (loop.length >= 3) loops.push(Int32Array.from(loop));
      }
    }
    this.loops = loops;
  };
  Body.prototype.bounds = function () {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const X = this.x, Y = this.y;
    for (let i = 0; i < this.n; i++) { const a = X[i], b = Y[i]; if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; }
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
  };
  /** A mino's centre. */
  Body.prototype.mx = function (k) { const q = this.q, X = this.x; return (X[q[4 * k]] + X[q[4 * k + 1]] + X[q[4 * k + 2]] + X[q[4 * k + 3]]) / 4; };
  Body.prototype.my = function (k) { const q = this.q, Y = this.y; return (Y[q[4 * k]] + Y[q[4 * k + 1]] + Y[q[4 * k + 2]] + Y[q[4 * k + 3]]) / 4; };

  /**
   * A body from grid cells ([[x, y]], whole cells) and their values, lifted by dy (the piece's place between rows),
   * moving at (vx, vy) cells a second.
   */
  function fromCells(id, cells, vals, dy, vx, vy) {
    const at = new Map(), lx = [], ly = [];
    const corner = (x, y) => { const k = x * 4096 + y; let i = at.get(k); if (i === undefined) { i = lx.length; at.set(k, i); lx.push(x); ly.push(y); } return i; };
    const quads = cells.map(([x, y]) => [corner(x, y), corner(x + 1, y), corner(x + 1, y + 1), corner(x, y + 1)]);
    const b = new Body(id, lx.length, cells.length);
    const h = P.STEP / P.SUB;
    for (let i = 0; i < b.n; i++) {
      b.lx[i] = lx[i]; b.ly[i] = ly[i]; b.rx[i] = lx[i]; b.ry[i] = ly[i];
      b.x[i] = lx[i]; b.y[i] = ly[i] - (dy || 0);
      b.px[i] = b.x[i] - (vx || 0) * h; b.py[i] = b.y[i] - (vy || 0) * h;
      b.ox[i] = b.x[i]; b.oy[i] = b.y[i];
    }
    quads.forEach((qd, k) => { for (let e = 0; e < 4; e++) b.q[4 * k + e] = qd[e]; b.col[k] = vals[k]; });
    b.topo();
    b.bounds();
    return b;
  }

  /**
   * The minos of b that remain (keep[k]), as bodies of their own: one for each connected group (minos sharing a corner
   * belong together). Each keeps its particles' places, speeds and rest shape.
   */
  function split(W, b, keep) {
    const m = b.m, q = b.q, parent = new Int32Array(m);
    for (let k = 0; k < m; k++) parent[k] = k;
    const find = (k) => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const owner = new Int32Array(b.n).fill(-1);
    for (let k = 0; k < m; k++) {
      if (!keep[k]) continue;
      for (let e = 0; e < 4; e++) {
        const i = q[4 * k + e];
        if (owner[i] < 0) owner[i] = k; else { const a = find(owner[i]), c = find(k); if (a !== c) parent[a] = c; }
      }
    }
    const groups = new Map();
    for (let k = 0; k < m; k++) if (keep[k]) { const r = find(k); (groups.get(r) || groups.set(r, []).get(r)).push(k); }
    const out = [];
    for (const ks of groups.values()) {
      const map = new Map(), idx = [];
      for (const k of ks) for (let e = 0; e < 4; e++) { const i = q[4 * k + e]; if (!map.has(i)) { map.set(i, idx.length); idx.push(i); } }
      const nb = new Body(W.next++, idx.length, ks.length);
      idx.forEach((i, j) => {
        nb.x[j] = b.x[i]; nb.y[j] = b.y[i]; nb.px[j] = b.px[i]; nb.py[j] = b.py[i]; nb.ox[j] = b.x[i]; nb.oy[j] = b.y[i];
        nb.lx[j] = b.lx[i]; nb.ly[j] = b.ly[i]; nb.rx[j] = b.rx[i]; nb.ry[j] = b.ry[i];
      });
      ks.forEach((k, j) => { for (let e = 0; e < 4; e++) nb.q[4 * j + e] = map.get(q[4 * k + e]); nb.col[j] = b.col[k]; });
      nb.topo();
      nb.bounds();
      out.push(nb);
    }
    return out;
  }

  // ---- the world -------------------------------------------------------------------------------------------------------

  function World(w, h, mat) {
    this.w = w; this.h = h; this.H = h + P.ROOF;
    this.bodies = []; this.next = 1; this.mat = mat || DEFAULT_MATERIAL; this.reduced = false;
    // The spatial hash: one bucket a cell of the world (and the room above), linked lists of minos.
    this.cells = w * this.H;
    this.head = new Int32Array(this.cells).fill(-1);
    this.awakeIn = new Uint8Array(this.cells); // a bucket holding an awake body's mino
    this.cap = 0; this.nxt = null; this.ib = null; this.ik = null;
    this.hashed = false;
    this.cost = 0; // particle-steps done (the performance tests read it)
    this.steps = 0; // steps taken
    this.kin = null; // the piece in play, as the bodies meet it (kinOf)
    this.rowN = null; this.rowS = null; // fullBands' counts and sums by row
  }
  World.prototype.grow = function (need) {
    if (need <= this.cap) return;
    this.cap = Math.max(need, this.cap * 2, 256);
    const keep = (a) => { const n = new Int32Array(this.cap); if (a) n.set(a); return n; };
    this.nxt = keep(this.nxt); this.ib = keep(this.ib); this.ik = keep(this.ik);
  };
  /** Files every mino with an outer edge under each bucket its bounds cover. */
  World.prototype.hash = function () {
    const w = this.w, H = this.H, head = this.head, aw = this.awakeIn;
    head.fill(-1); aw.fill(0);
    let n = 0;
    const B = this.bodies;
    let need = 0;
    for (const b of B) need += b.m * 6;
    this.grow(need + 16);
    for (let bi = 0; bi < B.length; bi++) {
      const b = B[bi], q = b.q, X = b.x, Y = b.y;
      if (!b.mb || b.mb.length !== 4 * b.m) b.mb = new Float64Array(4 * b.m);
      const mb = b.mb;
      for (let k = 0; k < b.m; k++) {
        if (!b.edge[k]) continue;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let e = 0; e < 4; e++) { const i = q[4 * k + e]; const a = X[i], c = Y[i]; if (a < x0) x0 = a; if (a > x1) x1 = a; if (c < y0) y0 = c; if (c > y1) y1 = c; }
        mb[4 * k] = x0; mb[4 * k + 1] = y0; mb[4 * k + 2] = x1; mb[4 * k + 3] = y1; // (its box, for the broad phase)
        const cx0 = Math.max(0, Math.floor(x0)), cx1 = Math.min(w - 1, Math.floor(x1)), cy0 = Math.max(0, Math.floor(y0)), cy1 = Math.min(H - 1, Math.floor(y1));
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          if (n >= this.cap) { this.grow(this.cap * 2); }
          const c = cy * w + cx;
          this.ib[n] = bi; this.ik[n] = k; this.nxt[n] = head[c]; head[c] = n++;
          if (b.awake) aw[c] = 1;
        }
      }
    }
    this.hashed = true;
  };

  /** Notes that a touched b this step (once; the list is kept, not reallocated, from step to step). */
  function touches(a, b) {
    const t = a.touch;
    for (let j = a.nt - 1; j >= 0; j--) if (t[j] === b) return;
    t[a.nt++] = b;
  }
  /** Wakes a body and, through what rests on it, everything above it that touches it. */
  function wake(W, b) {
    if (b.awake) return;
    const stack = [b];
    while (stack.length) {
      const a = stack.pop();
      if (a.awake) continue;
      a.awake = true; a.still = 0; a.ox.set(a.x); a.oy.set(a.y);
      for (const c of W.bodies) {
        if (c.awake || c.y1 < a.y0 + 0.2) continue;
        if (c.x0 > a.x1 + 0.1 || c.x1 < a.x0 - 0.1 || c.y0 > a.y1 + 0.1 || c.y1 < a.y0 - 0.1) continue;
        stack.push(c);
      }
    }
    W.hashed = false;
  }
  function sleep(b) {
    b.awake = false; b.still = 0; b.ux = 0; b.uy = 0;
    b.ox.set(b.x); b.oy.set(b.y);
    b.px.set(b.x); b.py.set(b.y);
  }

  // ---- one substep -------------------------------------------------------------------------------------------------------

  /** Gravity, damping and the move: positions predicted from the speeds (awake bodies only). */
  function integrate(W, h, M) {
    const g = P.G * h * h, damp = Math.max(0, 1 - M.damping * h), vmax = P.VMAX * h;
    for (const b of W.bodies) {
      if (!b.awake) continue;
      const X = b.x, Y = b.y, PX = b.px, PY = b.py;
      for (let i = 0; i < b.n; i++) {
        let vx = (X[i] - PX[i]) * damp, vy = (Y[i] - PY[i]) * damp - g;
        if (vx > vmax) vx = vmax; else if (vx < -vmax) vx = -vmax;
        if (vy > vmax) vy = vmax; else if (vy < -vmax) vy = -vmax;
        PX[i] = X[i]; PY[i] = Y[i];
        X[i] += vx; Y[i] += vy;
      }
      W.cost += b.n;
    }
  }

  /**
   * After the constraints: the speeds each made (place less previous place) lose `wobble` of what is not the body's own
   * motion (its middle's speed and its spin), so a squash or a knock jiggles a few times and is still, while the body
   * as a whole keeps moving (a fall, a slide, a tumble).
   */
  function dampWobble(W, h, M) {
    const kd = 1 - Math.pow(1 - M.wobble, h * 240), upMax = P.UP_MAX * h, restV2 = (P.REST_V * h) ** 2, restK = Math.max(0, 1 - P.REST_DAMP * h);
    for (const b of W.bodies) {
      if (!b.awake) continue;
      const X = b.x, Y = b.y, PX = b.px, PY = b.py, n = b.n;
      let cx = 0, cy = 0, ux = 0, uy = 0;
      for (let i = 0; i < n; i++) { cx += X[i]; cy += Y[i]; ux += X[i] - PX[i]; uy += Y[i] - PY[i]; }
      cx /= n; cy /= n; ux /= n; uy /= n;
      let Lz = 0, I = 0;
      for (let i = 0; i < n; i++) { const rx = X[i] - cx, ry = Y[i] - cy; Lz += rx * (Y[i] - PY[i] - uy) - ry * (X[i] - PX[i] - ux); I += rx * rx + ry * ry; }
      const om = I > 1e-9 ? Lz / I : 0;
      // Nothing is thrown upward faster than UP_MAX as a whole: a stack landing all at once (after a clear) is a chain
      // of springs that would launch its top; jelly bounces, it does not fly.
      const lift = uy > upMax ? uy - upMax : 0;
      b.ux = ux; b.uy = uy - lift;
      // Resting on something and slower than REST_V as a whole: a slow slide or roll is damped away (REST_DAMP a
      // second), so jelly that has landed settles in a moment instead of creeping on; a knock or a fall is not touched.
      const rest = (b.nt > 0 || b.y0 < 0.05 || b.onKin) && ux * ux + uy * uy < restV2 ? restK : 1;
      for (let i = 0; i < n; i++) {
        const rx = X[i] - cx, ry = Y[i] - cy, vx = X[i] - PX[i], vy = Y[i] - PY[i];
        PX[i] = X[i] - (vx + kd * (ux - om * ry - vx)) * rest;
        PY[i] = Y[i] - (vy + kd * (uy + om * rx - vy) - lift) * rest;
      }
    }
  }

  /** Shape matching, then the plastic drift of the rest shape. */
  function shapeMatch(W, h, M, last) {
    // The material's stiffness is a pull per 1/240 s; at another substep it is the same pull a second.
    const k = 1 - Math.pow(1 - M.stiffness, h * 240), pmax = P.PULL_MAX * h, pm2 = pmax * pmax;
    // (Each mino's own pull and its edges: once a step, the last substep, as strong as a step of substeps would be.)
    const km = M.mino && last ? 1 - Math.pow(1 - M.mino, P.STEP * 240) : 0, ke = 1 - Math.pow(1 - (M.edge || 0), P.STEP * 240);
    for (const b of W.bodies) {
      if (!b.awake) continue;
      const n = b.n, X = b.x, Y = b.y, RX = b.rx, RY = b.ry;
      let cx = 0, cy = 0, rx = 0, ry = 0;
      for (let i = 0; i < n; i++) { cx += X[i]; cy += Y[i]; rx += RX[i]; ry += RY[i]; }
      cx /= n; cy /= n; rx /= n; ry /= n;
      let a00 = 0, a01 = 0, a10 = 0, a11 = 0;
      for (let i = 0; i < n; i++) {
        const dx = X[i] - cx, dy = Y[i] - cy, qx = RX[i] - rx, qy = RY[i] - ry;
        a00 += dx * qx; a01 += dx * qy; a10 += dy * qx; a11 += dy * qy;
      }
      // The rotation that best maps the rest shape onto the body (2D polar decomposition).
      let c = a00 + a11, s = a10 - a01;
      const len = Math.sqrt(c * c + s * s);
      if (len < 1e-9) { c = 1; s = 0; } else { c /= len; s /= len; }
      b.c = c; b.s = s;
      const flow = M.flow * h, yieldD = M.yield, drift = M.drift;
      let flowed = false;
      for (let i = 0; i < n; i++) {
        const qx = RX[i] - rx, qy = RY[i] - ry;
        const gx = cx + c * qx - s * qy, gy = cy + s * qx + c * qy;
        // Plasticity: where the particle is, in the body's frame, against where the rest shape has it.
        if (flow > 0) {
          const dx = X[i] - cx, dy = Y[i] - cy;
          const lx = c * dx + s * dy, ly = -s * dx + c * dy;
          const ex = lx - qx, ey = ly - qy, e2 = ex * ex + ey * ey;
          if (e2 > yieldD * yieldD) {
            flowed = true;
            const e = Math.sqrt(e2), f = (flow * (e - yieldD)) / e;
            let nx = RX[i] + ex * f, ny = RY[i] + ey * f;
            const ox = nx - b.lx[i], oy = ny - b.ly[i], o2 = ox * ox + oy * oy;
            if (o2 > drift * drift) { const o = Math.sqrt(o2); nx = b.lx[i] + (ox * drift) / o; ny = b.ly[i] + (oy * drift) / o; }
            RX[i] = nx; RY[i] = ny;
          }
        }
        // The pull, never more than PULL_MAX a substep: a body mangled by a hard knock comes back fast but never
        // flings itself (that is where an explosion would start).
        let dx = (gx - X[i]) * k, dy = (gy - Y[i]) * k;
        const d2 = dx * dx + dy * dy;
        if (d2 > pm2) { const f = pmax / Math.sqrt(d2); dx *= f; dy *= f; }
        X[i] += dx; Y[i] += dy;
      }
      if (flowed) b.flowed = true;
      if (b.flowed && last) { bound(b); b.flowed = false; }
      if (km > 0) minoMatch(b, km, ke, pmax);
    }
  }

  /**
   * Each mino on its own pulled toward its rest square (its four corners, best rotated): the body bends and sags where
   * it is held and loaded (the whole-body pull is weak), while each mino stays about a square.
   */
  function minoMatch(b, km, ke, pmax) {
    const q = b.q, X = b.x, Y = b.y, RX = b.rx, RY = b.ry, pm2 = pmax * pmax, strain = P.STRAIN, lim2 = strain * strain, lo = 1 - P.SQUASH, hi = 1 + P.SQUASH;
    for (let k = 0; k < b.m; k++) {
      const i0 = q[4 * k], i1 = q[4 * k + 1], i2 = q[4 * k + 2], i3 = q[4 * k + 3];
      const cx = (X[i0] + X[i1] + X[i2] + X[i3]) * 0.25, cy = (Y[i0] + Y[i1] + Y[i2] + Y[i3]) * 0.25;
      const rx = (RX[i0] + RX[i1] + RX[i2] + RX[i3]) * 0.25, ry = (RY[i0] + RY[i1] + RY[i2] + RY[i3]) * 0.25;
      let c = 0, s = 0;
      for (let e = 0; e < 4; e++) {
        const i = q[4 * k + e], dx = X[i] - cx, dy = Y[i] - cy, qx = RX[i] - rx, qy = RY[i] - ry;
        c += dx * qx + dy * qy; s += dy * qx - dx * qy;
      }
      const len = Math.sqrt(c * c + s * s);
      if (len < 1e-9) continue;
      c /= len; s /= len;
      for (let e = 0; e < 4; e++) {
        const i = q[4 * k + e], qx = RX[i] - rx, qy = RY[i] - ry, gx = cx + c * qx - s * qy, gy = cy + s * qx + c * qy;
        let dx = (gx - X[i]) * km, dy = (gy - Y[i]) * km;
        const d2 = dx * dx + dy * dy;
        if (d2 > pm2) { const f = pmax / Math.sqrt(d2); dx *= f; dy *= f; }
        X[i] += dx; Y[i] += dy;
        // Strain limit: soft for a squish, hard past STRAIN (a mino under a tall stack stays near its square).
        const ex = X[i] - gx, ey = Y[i] - gy, e2 = ex * ex + ey * ey;
        if (e2 > lim2) { const f = 1 - strain / Math.sqrt(e2); X[i] -= ex * f; Y[i] -= ey * f; }
      }
      // Its edges squash and stretch by at most SQUASH: it bends and shears freely, but a stack keeps its height.
      for (let e = 0; e < 4; e++) {
        const i = q[4 * k + e], j = q[4 * k + ((e + 1) & 3)];
        const dx = X[j] - X[i], dy = Y[j] - Y[i], l = Math.sqrt(dx * dx + dy * dy);
        if (l < 1e-9) continue;
        // Toward its rest length by `ke` (squash is stiff; shear and bend are what the mino pull leaves soft), and
        // never past the bounds.
        const rx = RX[j] - RX[i], ry = RY[j] - RY[i], r = Math.sqrt(rx * rx + ry * ry);
        let t = l + (r - l) * ke;
        t = t < lo ? lo : t > hi ? hi : t;
        if (Math.abs(t - l) < 1e-7) continue;
        const f = (0.5 * (l - t)) / l;
        X[i] += dx * f; Y[i] += dy * f; X[j] -= dx * f; Y[j] -= dy * f;
      }
    }
  }

  /**
   * The rest shape's bound: along each mino edge, its two corners' drift (rest less grid) differs by at most BEND, so
   * a body keeps the dents and bends it took but every mino of it stays near a square of about its area.
   */
  function bound(b) {
    const q = b.q, RX = b.rx, RY = b.ry, LX = b.lx, LY = b.ly, lim = P.BEND;
    for (let k = 0; k < b.m; k++) for (let e = 0; e < 4; e++) {
      const i = q[4 * k + e], j = q[4 * k + ((e + 1) & 3)];
      const dx = (RX[i] - LX[i]) - (RX[j] - LX[j]), dy = (RY[i] - LY[i]) - (RY[j] - LY[j]), d2 = dx * dx + dy * dy;
      if (d2 <= lim * lim) continue;
      const d = Math.sqrt(d2), f = (0.5 * (d - lim)) / d;
      RX[i] -= dx * f; RY[i] -= dy * f; RX[j] += dx * f; RY[j] += dy * f;
    }
    // (and its rest edges keep their grid length within REST_SQUASH: a dent is a bend, never a mino flattened)
    for (let k = 0; k < b.m; k++) for (let e = 0; e < 4; e++) {
      const i = q[4 * k + e], j = q[4 * k + ((e + 1) & 3)];
      const dx = RX[j] - RX[i], dy = RY[j] - RY[i], l = Math.sqrt(dx * dx + dy * dy);
      if (l < 1e-9 || Math.abs(l - 1) <= P.REST_SQUASH) continue;
      const t = l < 1 ? 1 - P.REST_SQUASH : 1 + P.REST_SQUASH, f = (0.5 * (l - t)) / l;
      RX[i] += dx * f; RY[i] += dy * f; RX[j] -= dx * f; RY[j] -= dy * f;
    }
  }

  /** Each mino keeps its area (one, the grid's). */
  function keepArea(W, M, h) {
    const st = 1 - Math.pow(1 - M.area, h * 240);
    for (const b of W.bodies) {
      if (!b.awake) continue;
      const q = b.q, X = b.x, Y = b.y;
      for (let k = 0; k < b.m; k++) {
        const i0 = q[4 * k], i1 = q[4 * k + 1], i2 = q[4 * k + 2], i3 = q[4 * k + 3];
        const area = 0.5 * ((X[i0] * Y[i1] - X[i1] * Y[i0]) + (X[i1] * Y[i2] - X[i2] * Y[i1]) + (X[i2] * Y[i3] - X[i3] * Y[i2]) + (X[i3] * Y[i0] - X[i0] * Y[i3]));
        const C = area - 1;
        // Nearly right, or turned inside out (shape matching brings that one back, gently).
        if ((C > -0.01 && C < 0.01) || area < 0.25) continue;
        // ∂A/∂x_k = (y_{k+1} − y_{k−1}) / 2, ∂A/∂y_k = (x_{k−1} − x_{k+1}) / 2
        const g0x = 0.5 * (Y[i1] - Y[i3]), g0y = 0.5 * (X[i3] - X[i1]);
        const g1x = 0.5 * (Y[i2] - Y[i0]), g1y = 0.5 * (X[i0] - X[i2]);
        const g2x = 0.5 * (Y[i3] - Y[i1]), g2y = 0.5 * (X[i1] - X[i3]);
        const g3x = 0.5 * (Y[i0] - Y[i2]), g3y = 0.5 * (X[i2] - X[i0]);
        const den = g0x * g0x + g0y * g0y + g1x * g1x + g1y * g1y + g2x * g2x + g2y * g2y + g3x * g3x + g3y * g3y;
        if (den < 1e-9) continue;
        let l = (-C / den) * st;
        if (l > 0.02) l = 0.02; else if (l < -0.02) l = -0.02;
        X[i0] += l * g0x; Y[i0] += l * g0y; X[i1] += l * g1x; Y[i1] += l * g1y;
        X[i2] += l * g2x; Y[i2] += l * g2y; X[i3] += l * g3x; Y[i3] += l * g3y;
      }
    }
  }

  /** The walls, the floor and the ceiling far above: a particle past one is put back, with friction and a bounce. */
  function bounds(W, h, M) {
    const w = W.w, top = W.H, mu = M.friction, e = M.restitution, bv = P.BOUNCE_V * h;
    for (const b of W.bodies) {
      if (!b.awake) continue;
      const X = b.x, Y = b.y, PX = b.px, PY = b.py;
      for (let i = 0; i < b.n; i++) {
        if (Y[i] < 0) {
          // Back up by position alone (no speed made); then the landing: stopped, or past BOUNCE_V sent back at the
          // restitution, and friction takes up to mu of that from the slide.
          const d = -Y[i];
          Y[i] = 0; PY[i] += d;
          const vy = Y[i] - PY[i];
          if (vy < 0) {
            const nv = vy < -bv ? -e * vy : 0, jn = nv - vy;
            PY[i] = Y[i] - nv;
            const vx = X[i] - PX[i], f = mu * jn;
            PX[i] = Math.abs(vx) <= f ? X[i] : PX[i] + Math.sign(vx) * f;
          }
        } else if (Y[i] > top) { PY[i] -= Y[i] - top; Y[i] = top; if (Y[i] - PY[i] > 0) PY[i] = Y[i]; }
        if (X[i] < 0) { PX[i] -= X[i]; X[i] = 0; const vx = X[i] - PX[i]; if (vx < 0) PX[i] = X[i] - (vx < -bv ? -e * vx : 0); }
        else if (X[i] > w) { PX[i] -= X[i] - w; X[i] = w; const vx = X[i] - PX[i]; if (vx > 0) PX[i] = X[i] - (vx > bv ? -e * vx : 0); }
      }
    }
  }

  /**
   * Particles against the other bodies' minos: one inside a mino is pushed out through the mino's nearest outer edge,
   * the particle and the edge's two ends sharing the move by mass (a sleeping body is solid: it does not move, unless
   * struck faster than WAKE_V, which wakes it). Friction takes the slide along the edge; a fast closing bounces.
   */
  function collide(W, h, M, deep) {
    if (deep) norms(W);
    const w = W.w, H = W.H, B = W.bodies, head = W.head, nxt = W.nxt, ib = W.ib, ik = W.ik, aw = W.awakeIn;
    const mu = M.friction, wake2 = (P.WAKE_V * h) * (P.WAKE_V * h), pushMax = P.PUSH_MAX * h;
    for (let ai = 0; ai < B.length; ai++) {
      const A = B[ai], AX = A.x, AY = A.y, APX = A.px, APY = A.py, out = A.outer;
      const sleeping = !A.awake;
      for (let i = 0; i < A.n; i++) {
        if (!out[i]) continue;
        const x = AX[i], y = AY[i];
        if (x < 0 || y < 0) continue;
        const cx = Math.floor(x), cy = Math.floor(y);
        if (cx >= w || cy >= H) continue;
        const c = cy * w + cx;
        // A sleeping particle only meets awake minos.
        if (sleeping && !aw[c]) continue;
        for (let it = head[c]; it >= 0; it = nxt[it]) {
          const bi = ib[it];
          if (bi === ai) continue;
          const Bd = B[bi];
          if (sleeping && !Bd.awake) continue;
          const k = ik[it], q = Bd.q, BX = Bd.x, BY = Bd.y;
          const px = AX[i], py = AY[i];
          // Inside: on the inner side of all four edges (counter-clockwise). The way out is the outer edge it came in
          // through (outside it a substep ago, both moving), the nearest such; else the nearest outer edge.
          // (On the line counts as inside: a corner resting exactly on another's corner must still be caught.) The
          // cheap test first: most minos looked at are not touched at all.
          const k4 = 4 * k, q0 = q[k4], q1 = q[k4 + 1], q2 = q[k4 + 2], q3 = q[k4 + 3];
          if ((BX[q1] - BX[q0]) * (py - BY[q0]) - (BY[q1] - BY[q0]) * (px - BX[q0]) < -1e-12) continue;
          if ((BX[q2] - BX[q1]) * (py - BY[q1]) - (BY[q2] - BY[q1]) * (px - BX[q1]) < -1e-12) continue;
          if ((BX[q3] - BX[q2]) * (py - BY[q2]) - (BY[q3] - BY[q2]) * (px - BX[q2]) < -1e-12) continue;
          if ((BX[q0] - BX[q3]) * (py - BY[q3]) - (BY[q0] - BY[q3]) * (px - BX[q3]) < -1e-12) continue;
          let best = -1, bd = Infinity, entry = -1, ed2 = Infinity;
          const opx = APX[i], opy = APY[i], BPX = Bd.px, BPY = Bd.py, eb = Bd.edge[k];
          for (let ed = 0; ed < 4; ed++) {
            if (!(eb & (1 << ed))) continue;
            const j0 = q[k4 + ed], j1 = q[k4 + ((ed + 1) & 3)];
            const ex = BX[j1] - BX[j0], ey = BY[j1] - BY[j0];
            const d = (ex * (py - BY[j0]) - ey * (px - BX[j0])) / (Math.sqrt(ex * ex + ey * ey) || 1);
            if (d < bd) { bd = d; best = ed; }
            const pex = BPX[j1] - BPX[j0], pey = BPY[j1] - BPY[j0];
            if (pex * (opy - BPY[j0]) - pey * (opx - BPX[j0]) < 0 && d < ed2) { ed2 = d; entry = ed; }
          }
          if (best < 0) continue;
          if (entry >= 0) { best = entry; bd = ed2; }
          else {
            // Already inside (not this substep): out through the outer edge that faces the particle's own mino, not the
            // nearest one. Two minos stacked in line, one sunk half into the other, have their corners a hair inside
            // each other's sides: the nearest edge is a side, a push of a hair that never parts them (that is how
            // bodies of two pieces melted into one another and stayed so).
            const am = A.pm[i], aq = A.q, a4 = 4 * am;
            const dcx = (AX[aq[a4]] + AX[aq[a4 + 1]] + AX[aq[a4 + 2]] + AX[aq[a4 + 3]]) * 0.25 - (BX[q0] + BX[q1] + BX[q2] + BX[q3]) * 0.25;
            const dcy = (AY[aq[a4]] + AY[aq[a4 + 1]] + AY[aq[a4 + 2]] + AY[aq[a4 + 3]]) * 0.25 - (BY[q0] + BY[q1] + BY[q2] + BY[q3]) * 0.25;
            let face = -Infinity;
            for (let ed = 0; ed < 4; ed++) {
              if (!(eb & (1 << ed))) continue;
              const j0 = q[k4 + ed], j1 = q[k4 + ((ed + 1) & 3)];
              const ex = BX[j1] - BX[j0], ey = BY[j1] - BY[j0], l = Math.sqrt(ex * ex + ey * ey) || 1;
              const f = (ey * dcx - ex * dcy) / l;
              if (f > face) { face = f; best = ed; bd = (ex * (py - BY[j0]) - ey * (px - BX[j0])) / l; }
            }
          }
          const j0 = q[4 * k + best], j1 = q[4 * k + ((best + 1) & 3)];
          const ex = BX[j1] - BX[j0], ey = BY[j1] - BY[j0], l2 = ex * ex + ey * ey || 1, l = Math.sqrt(l2);
          // The outward normal (to the right of a counter-clockwise edge), and where along the edge the particle is.
          const nx = ey / l, ny = -ex / l;
          let t = ((px - BX[j0]) * ex + (py - BY[j0]) * ey) / l2;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          // How fast they close (along the normal): a sleeping body struck hard wakes.
          const evx = (BX[j0] - Bd.px[j0]) * (1 - t) + (BX[j1] - Bd.px[j1]) * t, evy = (BY[j0] - Bd.py[j0]) * (1 - t) + (BY[j1] - Bd.py[j1]) * t;
          const rvx = (px - APX[i]) - evx, rvy = (py - APY[i]) - evy, vn = rvx * nx + rvy * ny;
          // A sleeping body wakes when struck: the striker as a whole (not a wobble of one particle) closing fast.
          if (!Bd.awake || sleeping) {
            const sn = (A.ux - Bd.ux) * nx + (A.uy - Bd.uy) * ny;
            if (sn * sn > wake2 && sn < 0) wake(W, sleeping ? A : Bd);
          }
          // Shock propagation, mildly: of two bodies in contact, the lower one is the heavier (it carries the other),
          // so a tall stack holds up instead of settling into itself layer by layer.
          // (Only for undoing an overlap that was already there, which makes no speed: the speeds themselves are
          // shared evenly, or a body heavy in one contact and light in the next would pump a stack upward.)
          const hi = A.y0 + A.y1 > Bd.y0 + Bd.y1;
          const wa = A.awake ? 1 : 0, wb = Bd.awake ? 1 : 0;
          const w0 = wb * (1 - t), w1 = wb * t, den = wa + w0 * (1 - t) + w1 * t;
          if (den <= 0) continue;
          const sa = A.awake ? (hi ? 1 : P.SHOCK) : 0, sb = Bd.awake ? (hi ? P.SHOCK : 1) : 0;
          const s0 = sb * (1 - t), s1 = sb * t, sden = sa + s0 * (1 - t) + s1 * t;
          // Out of the overlap, shared by mass, at most what it closed this substep or PUSH_MAX, whichever is more,
          // in two parts (a split impulse, in positions): what it closed this substep moves only the places, so the
          // closing stops (a landing pushes what it lands on, a hard one knocks it); an overlap that was already there
          // moves the places and the previous places alike, so it comes apart without making any speed (no fling, no
          // climbing a wall on the push of a neighbour).
          const push = Math.min(bd, Math.max(pushMax, -vn));
          const stop = Math.min(push, Math.max(0, -vn)), rest = push - stop;
          let lam = stop / den;
          AX[i] += wa * lam * nx; AY[i] += wa * lam * ny;
          BX[j0] -= w0 * lam * nx; BY[j0] -= w0 * lam * ny;
          BX[j1] -= w1 * lam * nx; BY[j1] -= w1 * lam * ny;
          // Parting while still pressed together (a squashed body springing back): damped, so a stack that lands as
          // one does not bounce as a chain of springs.
          if (vn > 0) {
            const q2 = (vn * P.CONTACT_DAMP) / den;
            APX[i] += wa * q2 * nx; APY[i] += wa * q2 * ny;
            Bd.px[j0] -= w0 * q2 * nx; Bd.py[j0] -= w0 * q2 * ny;
            Bd.px[j1] -= w1 * q2 * nx; Bd.py[j1] -= w1 * q2 * ny;
          }
          if (rest > 0) {
            lam = rest / sden;
            let d = sa * lam; AX[i] += d * nx; AY[i] += d * ny; APX[i] += d * nx; APY[i] += d * ny;
            d = s0 * lam; BX[j0] -= d * nx; BY[j0] -= d * ny; Bd.px[j0] -= d * nx; Bd.py[j0] -= d * ny;
            d = s1 * lam; BX[j1] -= d * nx; BY[j1] -= d * ny; Bd.px[j1] -= d * nx; Bd.py[j1] -= d * ny;
          }
          // Friction: the slide along the edge this substep, less mu × the push (all of it when that is less).
          if (wa) {
            const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty, f = mu * push;
            const cut = (Math.abs(vt) <= f ? vt : Math.sign(vt) * f) * (wa / (wa + wb));
            AX[i] -= cut * tx; AY[i] -= cut * ty;
          }
          touches(A, Bd); touches(Bd, A);
        }
      }
      if (deep && !sleeping) minoContacts(W, A, ai);
    }
  }

  /**
   * Mino against mino: every outer mino of an awake body against the other bodies' minos near it (the hash). Two convex
   * quads that overlap are parted along the axis they overlap least on (of their eight edge normals), the whole of each
   * mino moving, by mass, the lower body the heavier (as in collide), the places and the previous places alike (no speed
   * made), and their closing along that axis stopped. Pushing particles out one by one misses two squares turned on
   * each other, a mino sheared across another and one wedged into another body's notch; this does not: nothing of two
   * pieces stays inside the other. (Each mino's edge normals and its extent on them are worked out once a step: norms.)
   */
  function norms(W) {
    for (const b of W.bodies) {
      if (!b.nm || b.nm.length !== 16 * b.m) b.nm = new Float64Array(16 * b.m);
      const nm = b.nm, q = b.q, X = b.x, Y = b.y;
      for (let k = 0; k < b.m; k++) {
        if (!b.edge[k]) continue;
        const k4 = 4 * k, o = 16 * k;
        for (let e = 0; e < 4; e++) {
          const i = q[k4 + e], j = q[k4 + ((e + 1) & 3)];
          let ex = X[j] - X[i], ey = Y[j] - Y[i];
          const l = Math.sqrt(ex * ex + ey * ey) || 1;
          ex /= l; ey /= l;
          const ux = ey, uy = -ex;
          let lo = Infinity, hi = -Infinity;
          for (let c = 0; c < 4; c++) { const t = X[q[k4 + c]] * ux + Y[q[k4 + c]] * uy; if (t < lo) lo = t; if (t > hi) hi = t; }
          nm[o + 4 * e] = ux; nm[o + 4 * e + 1] = uy; nm[o + 4 * e + 2] = lo; nm[o + 4 * e + 3] = hi;
        }
      }
    }
  }
  function minoContacts(W, A, ai) {
    const w = W.w, H = W.H, B = W.bodies, head = W.head, nxt = W.nxt, ib = W.ib, ik = W.ik;
    const AX = A.x, AY = A.y, APX = A.px, APY = A.py, aq = A.q, tol = P.MINO_TOL, anm = A.nm;
    for (let m = 0; m < A.m; m++) {
      if (!A.edge[m]) continue;
      const m4 = 4 * m, amb = A.mb, ax0 = amb[m4], ay0 = amb[m4 + 1], ax1 = amb[m4 + 2], ay1 = amb[m4 + 3], mo = 16 * m;
      const gx0 = Math.max(0, Math.floor(ax0)), gx1 = Math.min(w - 1, Math.floor(ax1)), gy0 = Math.max(0, Math.floor(ay0)), gy1 = Math.min(H - 1, Math.floor(ay1));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        for (let it = head[gy * w + gx]; it >= 0; it = nxt[it]) {
          const bi = ib[it];
          if (bi === ai) continue;
          const Bd = B[bi];
          // Each pair once: from the body later in the list, or from the awake one.
          if (bi < ai && Bd.awake) continue;
          const k = ik[it], q = Bd.q, BX = Bd.x, BY = Bd.y, k4 = 4 * k;
          // (Its box as hashed this substep; a pair under more than one bucket: only from the bucket of the lower left
          // of their common box.)
          const mb = Bd.mb, bx0 = mb[k4], by0 = mb[k4 + 1], bx1 = mb[k4 + 2], by1 = mb[k4 + 3];
          if (bx0 > ax1 - tol || bx1 < ax0 + tol || by0 > ay1 - tol || by1 < ay0 + tol) continue;
          if (Math.max(0, Math.floor(Math.max(ax0, bx0))) !== gx || Math.max(0, Math.floor(Math.max(ay0, by0))) !== gy) continue;
          // The separating axes: A's edge normals (B's corners on them), then B's (A's corners on them).
          const bnm = Bd.nm, ko = 16 * k;
          let best = Infinity, nx = 0, ny = 0;
          const b0 = q[k4], b1 = q[k4 + 1], b2 = q[k4 + 2], b3 = q[k4 + 3], a0 = aq[m4], a1 = aq[m4 + 1], a2 = aq[m4 + 2], a3 = aq[m4 + 3];
          for (let e = 0; e < 4; e++) {
            const o = mo + 4 * e, ux = anm[o], uy = anm[o + 1];
            const t0 = BX[b0] * ux + BY[b0] * uy, t1 = BX[b1] * ux + BY[b1] * uy, t2 = BX[b2] * ux + BY[b2] * uy, t3 = BX[b3] * ux + BY[b3] * uy;
            const ov = Math.min(anm[o + 3] - Math.min(t0, t1, t2, t3), Math.max(t0, t1, t2, t3) - anm[o + 2]);
            if (ov < best) { best = ov; nx = ux; ny = uy; if (ov <= tol) break; }
          }
          if (best <= tol) continue;
          for (let e = 0; e < 4; e++) {
            const o = ko + 4 * e, ux = bnm[o], uy = bnm[o + 1];
            const t0 = AX[a0] * ux + AY[a0] * uy, t1 = AX[a1] * ux + AY[a1] * uy, t2 = AX[a2] * ux + AY[a2] * uy, t3 = AX[a3] * ux + AY[a3] * uy;
            const ov = Math.min(bnm[o + 3] - Math.min(t0, t1, t2, t3), Math.max(t0, t1, t2, t3) - bnm[o + 2]);
            if (ov < best) { best = ov; nx = ux; ny = uy; if (ov <= tol) break; }
          }
          if (best <= tol) continue;
          // A goes away from B (by their middles).
          let dcx = 0, dcy = 0;
          for (let e = 0; e < 4; e++) { const i = aq[m4 + e], j = q[k4 + e]; dcx += AX[i] - BX[j]; dcy += AY[i] - BY[j]; }
          if (dcx * nx + dcy * ny < 0) { nx = -nx; ny = -ny; }
          const hiA = A.y0 + A.y1 > Bd.y0 + Bd.y1;
          const sa = A.awake ? (hiA ? 1 : P.SHOCK) : 0, sb = Bd.awake ? (hiA ? P.SHOCK : 1) : 0;
          if (sa + sb <= 0) continue;
          const d = best - tol * 0.5, da = (d * sa) / (sa + sb), db = (d * sb) / (sa + sb);
          // The speed they close at along the axis (the minos' middles), stopped.
          let va = 0, vb = 0;
          for (let e = 0; e < 4; e++) { const i = aq[m4 + e], j = q[k4 + e]; va += (AX[i] - APX[i]) * nx + (AY[i] - APY[i]) * ny; vb += (BX[j] - Bd.px[j]) * nx + (BY[j] - Bd.py[j]) * ny; }
          const close = (vb - va) * 0.25, ca = close > 0 ? (close * sa) / (sa + sb) : 0, cb = close > 0 ? (close * sb) / (sa + sb) : 0;
          for (let e = 0; e < 4; e++) {
            const i = aq[m4 + e], j = q[k4 + e];
            AX[i] += da * nx; AY[i] += da * ny; APX[i] += (da - ca) * nx; APY[i] += (da - ca) * ny;
            BX[j] -= db * nx; BY[j] -= db * ny; Bd.px[j] -= (db - cb) * nx; Bd.py[j] -= (db - cb) * ny;
          }
          // (A's extents on its own normals moved with it; near enough for the rest of this step.)
          for (let e = 0; e < 4; e++) { const o = mo + 4 * e, t = da * (nx * anm[o] + ny * anm[o + 1]); anm[o + 2] += t; anm[o + 3] += t; }
          if (!Bd.awake && close * 240 * P.SUB / 2 > P.WAKE_V) wake(W, Bd);
          touches(A, Bd); touches(Bd, A);
        }
      }
    }
  }

  /**
   * Sleep: a body none of whose particles has gone SLEEP_D from where it was SLEEP_T ago (a resting wobble never adds
   * up to that; a slide or a creep does), everything it touched still or asleep, sleeps.
   */
  function settleBodies(W, dt) {
    const one2 = P.SLEEP_ONE * P.SLEEP_ONE;
    for (const b of W.bodies) {
      if (!b.awake) continue;
      // Moved: its particles on average further than SLEEP_D (a slide, a roll, a sag), or any one of them further
      // than SLEEP_ONE (a part swinging); a corner caught flickering in a contact does not keep a still body awake.
      let moved = false, sum = 0;
      const X = b.x, Y = b.y, OX = b.ox, OY = b.oy;
      for (let i = 0; i < b.n; i++) { const dx = X[i] - OX[i], dy = Y[i] - OY[i], e2 = dx * dx + dy * dy; if (e2 > one2) { moved = true; break; } sum += Math.sqrt(e2); }
      if (sum > P.SLEEP_D * b.n) moved = true;
      // A new window every half SLEEP_T: a creep slower than SLEEP_D a window (a stack's slow sag) is still.
      if (moved) { b.still = 0; b.win = 0; OX.set(X); OY.set(Y); }
      else { b.still += dt; b.win += dt; if (b.win >= P.SLEEP_T / 2) { b.win = 0; OX.set(X); OY.set(Y); } }
    }
    for (const b of W.bodies) {
      if (!b.awake || b.still < P.SLEEP_T) continue;
      let ok = b.y0 < 0.05 || b.onKin; // on the floor, on the piece in play, or on something that is itself settled
      let calm = true;
      for (let j = 0; j < b.nt; j++) { const o = b.touch[j]; if (o.awake && o.still < P.SLEEP_T) { calm = false; break; } ok = true; }
      if (calm && ok) sleep(b);
    }
  }

  /** One fixed step of the world (SUB substeps). */
  function stepWorld(W) {
    const M = material(W.mat, W.reduced);
    let any = false;
    for (const b of W.bodies) if (b.awake) { any = true; break; }
    if (!any) return false;
    const h = P.STEP / P.SUB;
    for (const b of W.bodies) if (b.awake) { b.nt = 0; b.onKin = false; }
    for (let s = 0; s < P.SUB; s++) {
      integrate(W, h, M);
      shapeMatch(W, h, M, s === P.SUB - 1);
      keepArea(W, M, h);
      // Contacts last, so a substep ends with nothing inside anything.
      W.hash();
      collide(W, h, M, s === P.SUB - 1); // (mino against mino once a step: a deep overlap is rare)
      kinCollide(W, M);
      bounds(W, h, M);
      dampWobble(W, h, M);
    }
    for (const b of W.bodies) if (b.awake) b.bounds();
    W.steps++;
    // The speeds over the whole step decide sleep (a wobble between substeps cancels); touches are kept from every substep.
    settleBodies(W, P.STEP);
    W.hashed = false;
    return true;
  }

  // ---- the piece in play against the bodies ----------------------------------------------------------------------------

  /** Whether a point is inside mino k of body b (counter-clockwise, all four edges), shrunk by eps. */
  function inMino(b, k, x, y, eps) {
    const q = b.q, X = b.x, Y = b.y;
    for (let e = 0; e < 4; e++) {
      const j0 = q[4 * k + e], j1 = q[4 * k + ((e + 1) & 3)];
      const ex = X[j1] - X[j0], ey = Y[j1] - Y[j0];
      const l = Math.sqrt(ex * ex + ey * ey) || 1;
      if ((ex * (y - Y[j0]) - ey * (x - X[j0])) / l < eps) return false;
    }
    return true;
  }
  /**
   * Whether unit squares with lower-left corners (x, y + dy) for each [x, y] of cells meet the floor or a body (a
   * graze of EPS is allowed).
   */
  function hits(W, cells, dy, eps) {
    if (!W.hashed) W.hash();
    const w = W.w, H = W.H, head = W.head, nxt = W.nxt, ib = W.ib, ik = W.ik, B = W.bodies, e = eps == null ? P.EPS : eps;
    for (const [cx, cy0] of cells) {
      const sy = cy0 + dy, sx = cx;
      if (sy < -1e-9) return true;
      const gx0 = Math.max(0, Math.floor(sx - 0.5)), gx1 = Math.min(w - 1, Math.floor(sx + 1.5)), gy0 = Math.max(0, Math.floor(sy - 0.5)), gy1 = Math.min(H - 1, Math.floor(sy + 1.5));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        for (let it = head[gy * w + gx]; it >= 0; it = nxt[it]) {
          const b = B[ib[it]], k = ik[it], q = b.q;
          // A corner of the mino inside the square …
          for (let c = 0; c < 4; c++) {
            const px = b.x[q[4 * k + c]], py = b.y[q[4 * k + c]];
            if (px > sx + e && px < sx + 1 - e && py > sy + e && py < sy + 1 - e) return true;
          }
          // … or a corner or the middle of the square inside the mino.
          if (inMino(b, k, sx + 0.5, sy + 0.5, 0) || inMino(b, k, sx + e, sy + e, e) || inMino(b, k, sx + 1 - e, sy + e, e) || inMino(b, k, sx + 1 - e, sy + 1 - e, e) || inMino(b, k, sx + e, sy + 1 - e, e)) return true;
        }
      }
    }
    return false;
  }

  // ---- the piece in play: a rigid, kinematic body ----------------------------------------------------------------------

  /**
   * The piece in play as the world sees it (W.kin): its grid cells (ints) lifted `off` below their rows. It is rigid and
   * moves only when the player moves it: a body that falls or slides into it is put back out of it (and stops against
   * it, with friction), as against a wall; what rests on it rests. Built by kinOf, read by kinCollide.
   */
  function kinOf(cells, off) {
    const set = new Set();
    for (const [x, y] of cells) set.add(x * 1024 + y);
    return { cells, off, set, key: cells.map((c) => c.join(',')).join(';') + '@' + off.toFixed(4) };
  }

  /** Puts particle i of b back out of the piece in play by d along (nx, ny): no speed made, the closing stopped. */
  function kinPush(W, b, i, nx, ny, d, mu) {
    const X = b.x, Y = b.y, PX = b.px, PY = b.py;
    X[i] += d * nx; Y[i] += d * ny; PX[i] += d * nx; PY[i] += d * ny;
    let vx = X[i] - PX[i], vy = Y[i] - PY[i];
    const vn = vx * nx + vy * ny;
    if (vn < 0) {
      vx -= vn * nx; vy -= vn * ny;
      const vt = -vx * ny + vy * nx, f = -vn * mu, cut = Math.abs(vt) <= f ? vt : Math.sign(vt) * f;
      vx -= cut * -ny; vy -= cut * nx;
      PX[i] = X[i] - vx; PY[i] = Y[i] - vy;
    }
    b.onKin = true;
    if (!b.awake && d > 0.002) wake(W, b);
  }

  /** Bodies against the piece in play: particles inside it go out the way their mino lies; its corners inside a mino push the mino out. */
  function kinCollide(W, M) {
    const K = W.kin;
    if (!K || !K.cells.length) return;
    const w = W.w, H = W.H, head = W.head, nxt = W.nxt, ib = W.ib, ik = W.ik, B = W.bodies, off = K.off, set = K.set, mu = M.friction;
    const has = (cx, cy) => set.has(cx * 1024 + cy);
    const seen = new Set();
    for (const [cx0, cy0] of K.cells) {
      const sy = cy0 - off;
      const gx0 = Math.max(0, cx0 - 1), gx1 = Math.min(w - 1, cx0 + 1), gy0 = Math.max(0, Math.floor(sy) - 1), gy1 = Math.min(H - 1, Math.floor(sy) + 2);
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        for (let it = head[gy * w + gx]; it >= 0; it = nxt[it]) {
          const b = B[ib[it]], k = ik[it], tag = b.id * 65536 + k;
          if (seen.has(tag)) continue;
          seen.add(tag);
          const q = b.q, X = b.x, Y = b.y, k4 = 4 * k;
          const mcx = (X[q[k4]] + X[q[k4 + 1]] + X[q[k4 + 2]] + X[q[k4 + 3]]) * 0.25, mcy = (Y[q[k4]] + Y[q[k4 + 1]] + Y[q[k4 + 2]] + Y[q[k4 + 3]]) * 0.25;
          // The mino's corners inside the piece: out of the piece (through as many of its cells as lie that way), the way
          // the mino lies from the cell the corner is in, unless another way is much shorter.
          for (let e = 0; e < 4; e++) {
            const i = q[k4 + e], x = X[i], y = Y[i] + off, cx = Math.floor(x), cy = Math.floor(y);
            if (!has(cx, cy)) continue;
            let j;
            for (j = 1; has(cx + j, cy); j++); const dR = cx + j - x;
            for (j = 1; has(cx - j, cy); j++); const dL = x - (cx - j + 1);
            for (j = 1; has(cx, cy + j); j++); const dU = cy + j - y;
            for (j = 1; has(cx, cy - j); j++); const dD = y - (cy - j + 1);
            const ux = mcx - (cx + 0.5), uy = mcy + off - (cy + 0.5);
            let nx, ny, d;
            if (Math.abs(ux) > Math.abs(uy)) { if (ux > 0) { nx = 1; ny = 0; d = dR; } else { nx = -1; ny = 0; d = dL; } }
            else if (uy > 0) { nx = 0; ny = 1; d = dU; } else { nx = 0; ny = -1; d = dD; }
            const least = Math.min(dR, dL, dU, dD);
            if (d > least + 0.5) {
              if (least === dU) { nx = 0; ny = 1; } else if (least === dR) { nx = 1; ny = 0; } else if (least === dL) { nx = -1; ny = 0; } else { nx = 0; ny = -1; }
              d = least;
            }
            kinPush(W, b, i, nx, ny, d + 1e-4, mu);
          }
          // The piece's corners inside the mino (a mino sitting across one of its corners): the whole mino moves out,
          // the way it lies from that corner's cell.
          for (const [ax, ay] of K.cells) {
            if (Math.abs(ax + 0.5 - mcx) > 1.6 || Math.abs(ay - off + 0.5 - mcy) > 1.6) continue;
            for (let c = 0; c < 4; c++) {
              const px = ax + (c === 1 || c === 2 ? 1 : 0), py = ay - off + (c >= 2 ? 1 : 0);
              if (!inMino(b, k, px, py, 1e-4)) continue;
              const ux = mcx - (ax + 0.5), uy = mcy - (ay - off + 0.5);
              const nx = Math.abs(ux) > Math.abs(uy) ? Math.sign(ux) : 0, ny = nx ? 0 : (uy > 0 ? 1 : -1);
              let d = 0;
              for (let e = 0; e < 4; e++) { const i = q[k4 + e]; d = Math.max(d, (px - X[i]) * nx + (py - Y[i]) * ny); }
              d = Math.min(d, 0.5);
              if (d > 0) for (let e = 0; e < 4; e++) kinPush(W, b, q[k4 + e], nx, ny, d + 1e-4, mu);
            }
          }
        }
      }
    }
  }

  /** A mino's box (its corners' bounds), moved by (dx, dy). */
  function minoBox(b, k, dx, dy) {
    const q = b.q, X = b.x, Y = b.y;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let e = 0; e < 4; e++) { const i = q[4 * k + e]; const a = X[i], c = Y[i]; if (a < x0) x0 = a; if (a > x1) x1 = a; if (c < y0) y0 = c; if (c > y1) y1 = c; }
    return [x0 + dx, y0 + dy, x1 + dx, y1 + dy];
  }
  /** How far box a must go along (dx, dy) (an axis) to leave box o (0: they do not overlap by more than tol on both axes). */
  function needOut(a, o, dx, dy, tol) {
    const ox = Math.min(a[2], o[2]) - Math.max(a[0], o[0]), oy = Math.min(a[3], o[3]) - Math.max(a[1], o[1]);
    if (ox <= tol || oy <= tol) return 0;
    return dx > 0 ? o[2] - a[0] : dx < 0 ? a[2] - o[0] : dy > 0 ? o[3] - a[1] : a[3] - o[1];
  }

  /**
   * What the piece in play moving to `squares` (lower-left corners of unit squares, world cells) shoves: the bodies it
   * would overlap, each moved straight out along one of `dirs` (a move: its own direction; a turn: the shortest way
   * that works), and in turn what each of those pushes into, a few bodies deep. Null when they cannot get out of the way
   * (a wall, the floor, or bodies that cannot move themselves, beyond SHOVE_TOL of overlap): the move is refused.
   * Returns a Map body -> [dx, dy] (empty: nothing in the way).
   */
  function pushPlan(W, squares, dirs) {
    if (!W.hashed) W.hash();
    const sq = squares.map(([x, y]) => [x, y, x + 1, y + 1]);
    const touched = [];
    for (const b of W.bodies) {
      if (b.x1 < squares.reduce((a, s) => Math.min(a, s[0]), Infinity) - 0.05 || b.x0 > squares.reduce((a, s) => Math.max(a, s[0] + 1), -Infinity) + 0.05) continue;
      for (let k = 0; k < b.m; k++) { const bx = minoBox(b, k, 0, 0); if (sq.some((o) => needOut(bx, o, 1, 0, 0.03))) { touched.push(b); break; } }
    }
    let plan = new Map();
    const w = W.w, tol = P.SHOVE_TOL;
    // Moves b by `need` along d (and whatever that pushes); false when it cannot.
    const shove = (b, d, need, depth, T) => {
      if (need > P.SHOVE_MAX || depth > 4 || T.size > 10) return false;
      const had = T.get(b);
      if (had) { if (had[0] * d[0] + had[1] * d[1] <= 0 && (had[0] || had[1])) return false; if (Math.abs(had[0] + had[1]) >= need - 1e-9) return true; }
      const dx = d[0] * need, dy = d[1] * need;
      T.set(b, [dx, dy]);
      if (b.x0 + dx < -0.02 || b.x1 + dx > w + 0.02 || b.y0 + dy < -0.02) return false;
      for (let k = 0; k < b.m; k++) {
        const bx = minoBox(b, k, dx, dy);
        if (sq.some((o) => needOut(bx, o, d[0], d[1], 0.03) > 0.03)) return false;
        // What it now runs into.
        for (const c of W.bodies) {
          if (c === b || c.x1 < bx[0] - 0.05 || c.x0 > bx[2] + 0.05 || c.y1 < bx[1] - 0.05 || c.y0 > bx[3] + 0.05) continue;
          const cm = T.get(c) || [0, 0];
          for (let j = 0; j < c.m; j++) {
            const cb = minoBox(c, j, cm[0], cm[1]), n = needOut(cb, bx, d[0], d[1], tol);
            if (n > 0 && !shove(c, d, n + Math.abs(cm[0] + cm[1]) + 0.01, depth + 1, T)) return false;
          }
        }
      }
      return true;
    };
    for (const b of touched) {
      if (plan.has(b)) continue;
      // How far it must go each way to clear the squares; the shortest way that works.
      const opts = dirs.map((d) => {
        let need = 0;
        for (let k = 0; k < b.m; k++) { const bx = minoBox(b, k, 0, 0); for (const o of sq) need = Math.max(need, needOut(bx, o, d[0], d[1], 0.03)); }
        return { d, need: need + 0.01 };
      }).sort((a, z) => a.need - z.need);
      let ok = false;
      for (const o of opts) {
        const T = new Map(plan);
        if (shove(b, o.d, o.need, 0, T)) { plan = T; ok = true; break; }
      }
      if (!ok) return null;
    }
    return plan;
  }
  const TURN_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /** Carries out a push plan: each body moved, off at SHOVE_V at least along its push, awake. */
  function applyPlan(W, plan) {
    const h = P.STEP / P.SUB, sv = P.SHOVE_V * h;
    for (const [b, [dx, dy]] of plan) {
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const nx = dx / l, ny = dy / l;
      for (let i = 0; i < b.n; i++) {
        b.x[i] += dx; b.y[i] += dy; b.px[i] += dx; b.py[i] += dy;
        const v = (b.x[i] - b.px[i]) * nx + (b.y[i] - b.py[i]) * ny;
        if (v < sv) { b.px[i] -= (sv - v) * nx; b.py[i] -= (sv - v) * ny; }
      }
      b.bounds();
      if (!b.awake) wake(W, b); else { b.still = 0; b.ox.set(b.x); b.oy.set(b.y); }
    }
    if (plan.size) W.hashed = false;
  }

  // ---- clears -------------------------------------------------------------------------------------------------------------

  /**
   * The bands that are full now. A band is one mino tall, centred on a row of minos (the middle of those centred in a
   * grid row, so a row that sagged is met where it is): the minos centred in it, each slower than CALM_V, must cover
   * COVER of its area, measured on the minos themselves (each one's outline, clipped to the band, on BAND_LINES lines
   * across it; overlaps count once, gaps count as gaps). A row of minos sunk into each other or spread with gaps does not
   * clear; one that really fills about 90% does. [{ y, lo, minos: [[b, k]] }]
   */
  function fullBands(W) {
    const w = W.w, need = P.COVER * w * (1 - P.COVER_SLACK), calm2 = (P.CALM_V * P.STEP / P.SUB) ** 2, R = W.h + 2;
    // First the rows' counts and middles (no garbage: this runs every step); only a row that could be full is measured.
    if (!W.rowN || W.rowN.length !== R) { W.rowN = new Int32Array(R); W.rowS = new Float64Array(R); }
    const rowN = W.rowN, rowS = W.rowS;
    rowN.fill(0); rowS.fill(0);
    for (const b of W.bodies) for (let k = 0; k < b.m; k++) {
      const my = b.my(k);
      if (my < 0 || my >= R - 1) continue;
      const y = Math.floor(my);
      rowN[y]++; rowS[y] += my;
    }
    const out = [];
    let taken = null;
    for (let y = 0; y < R; y++) {
      if (rowN[y] < need * 0.45) continue;
      const c = rowS[y] / rowN[y];
      if (c < 0.25 || c > W.h - 0.25) continue;
      // (A mino keeps its area, about one: fewer minos than that cannot cover it.)
      let n = 0;
      for (const b of W.bodies) {
        if (b.y1 < c - 1.6 || b.y0 > c + 1.6) continue;
        for (let k = 0; k < b.m; k++) if (Math.abs(b.my(k) - c) < 0.5) n++;
      }
      if (n * 1.02 < need) continue;
      // The minos centred in the band (not in one already full), none of them fast.
      const set = [];
      let fast = false;
      for (const b of W.bodies) {
        if (b.y1 < c - 1.6 || b.y0 > c + 1.6) continue;
        const q = b.q, X = b.x, Y = b.y;
        for (let k = 0; k < b.m && !fast; k++) {
          if (Math.abs(b.my(k) - c) >= 0.5 || (taken && taken.has(b.id * 65536 + k))) continue;
          if (b.awake) for (let e = 0; e < 4; e++) { const i = q[4 * k + e], dx = X[i] - b.px[i], dy = Y[i] - b.py[i]; if (dx * dx + dy * dy > calm2) { fast = true; break; } }
          set.push(b, k);
        }
        if (fast) break;
      }
      if (fast || (set.length / 2) * 1.02 < need) continue;
      const cover = bandCover(W, set, c);
      if (cover >= need - 1e-9) {
        taken = taken || new Set();
        const minos = [];
        for (let j = 0; j < set.length; j += 2) { taken.add(set[j].id * 65536 + set[j + 1]); minos.push([set[j], set[j + 1]]); }
        out.push({ y: Math.max(0, Math.round(c - 0.5)), lo: c - 0.5, cover, minos });
      }
    }
    return out.sort((a, b) => a.lo - b.lo);
  }
  /** How much of the band [c − ½, c + ½] the minos of set ([body, k, …]) cover, measured on BAND_LINES lines across it. */
  function bandCover(W, set, c) {
    const w = W.w, lines = P.BAND_LINES, xs = [];
    let cover = 0;
    for (let j = 0; j < lines; j++) {
      const ly = c - 0.5 + (j + 0.5) / lines;
      xs.length = 0;
      for (let s = 0; s < set.length; s += 2) {
        const b = set[s], k = set[s + 1], q = b.q, X = b.x, Y = b.y;
        let x0 = Infinity, x1 = -Infinity;
        for (let e = 0; e < 4; e++) {
          const i0 = q[4 * k + e], i1 = q[4 * k + ((e + 1) & 3)], ya = Y[i0], yb = Y[i1];
          if ((ya - ly) * (yb - ly) > 0 || ya === yb) continue;
          const x = X[i0] + ((ly - ya) / (yb - ya)) * (X[i1] - X[i0]);
          if (x < x0) x0 = x; if (x > x1) x1 = x;
        }
        if (x1 > x0) xs.push([Math.max(0, x0), Math.min(w, x1)]);
      }
      // The spans joined: overlaps count once, gaps not at all.
      xs.sort((a, b) => a[0] - b[0]);
      let a = -1, z = -1;
      for (const [s0, s1] of xs) {
        if (s0 > z) { if (z > a) cover += z - a; a = s0; z = s1; } else if (s1 > z) z = s1;
      }
      if (z > a) cover += z - a;
    }
    return cover / lines;
  }

  /**
   * Clears the full bands: their whole minos go; each body they crossed splits into its connected parts; everything at
   * or above the lowest band wakes and falls. Returns { bands, rows, removed: [[x, y, v]] } or null.
   */
  function clearBands(W) {
    const full = fullBands(W);
    if (!full.length) return null;
    const gone = new Map(); // body -> Uint8Array of minos to keep
    const removed = [];
    for (const band of full) for (const [b, k] of band.minos) {
      let keep = gone.get(b);
      if (!keep) gone.set(b, (keep = new Uint8Array(b.m).fill(1)));
      if (keep[k]) { keep[k] = 0; removed.push([b.mx(k), b.my(k), b.col[k]]); }
    }
    const low = full[0].lo;
    const next = [];
    for (const b of W.bodies) {
      const keep = gone.get(b);
      if (!keep) { next.push(b); continue; }
      for (const nb of split(W, b, keep)) next.push(nb);
    }
    W.bodies = next;
    for (const b of W.bodies) if (b.y1 >= low - 0.05 && !b.awake) { b.awake = true; b.still = 0; b.ox.set(b.x); b.oy.set(b.y); }
    W.hashed = false;
    return { bands: full.length, rows: full.map((f) => f.y), removed };
  }

  // ---- save, snapshots ---------------------------------------------------------------------------------------------------

  const r4 = (v) => Math.round(v * 10000) / 10000;
  /** The bodies as plain data (the save; numbers to 1/10000). */
  function pack(W) {
    return {
      v: 1, next: W.next, mat: W.mat,
      bodies: W.bodies.map((b) => ({
        id: b.id, a: b.awake ? 1 : 0, q: Array.from(b.q), c: Array.from(b.col),
        l: Array.from({ length: 2 * b.n }, (_, j) => (j & 1 ? b.ly[j >> 1] : b.lx[j >> 1])),
        r: Array.from({ length: 2 * b.n }, (_, j) => r4(j & 1 ? b.ry[j >> 1] : b.rx[j >> 1])),
        p: Array.from({ length: 4 * b.n }, (_, j) => { const i = j >> 2, f = j & 3; return r4(f === 0 ? b.x[i] : f === 1 ? b.y[i] : f === 2 ? b.px[i] : b.py[i]); }),
      })),
    };
  }
  const nums = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && isFinite(v));
  /** Bodies from pack's data into W; false (W unchanged) when it is not whole. */
  function unpack(W, s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || !Array.isArray(s.bodies)) return false;
    const out = [];
    for (const d of s.bodies) {
      if (!d || !Array.isArray(d.q) || !Array.isArray(d.c) || d.q.length !== 4 * d.c.length || !d.c.length) return false;
      const n = Array.isArray(d.l) ? d.l.length / 2 : 0;
      if (!n || !nums(d.l, 2 * n) || !nums(d.r, 2 * n) || !nums(d.p, 4 * n) || !d.q.every((i) => Number.isInteger(i) && i >= 0 && i < n)) return false;
      const b = new Body(d.id | 0, n, d.c.length);
      for (let i = 0; i < n; i++) {
        b.lx[i] = d.l[2 * i]; b.ly[i] = d.l[2 * i + 1]; b.rx[i] = d.r[2 * i]; b.ry[i] = d.r[2 * i + 1];
        b.x[i] = d.p[4 * i]; b.y[i] = d.p[4 * i + 1]; b.px[i] = d.p[4 * i + 2]; b.py[i] = d.p[4 * i + 3]; b.ox[i] = b.x[i]; b.oy[i] = b.y[i];
      }
      b.q.set(d.q); b.col.set(d.c.map((v) => v & 0xffff));
      b.awake = !!d.a;
      b.topo(); b.bounds();
      out.push(b);
    }
    W.bodies = out;
    W.next = Math.max(Number.isInteger(s.next) ? s.next : 1, ...out.map((b) => b.id + 1), 1);
    if (MATERIALS[s.mat]) W.mat = s.mat;
    W.hashed = false;
    return true;
  }
  /** A quick copy of the world for the rewind buffer (typed arrays copied, nothing rounded). */
  function snapWorld(W) {
    return { next: W.next, bodies: W.bodies.map((b) => ({ b, x: b.x.slice(), y: b.y.slice(), px: b.px.slice(), py: b.py.slice(), rx: b.rx.slice(), ry: b.ry.slice(), awake: b.awake, still: b.still })) };
  }
  function restoreWorld(W, s) {
    W.bodies = s.bodies.map((d) => {
      const b = d.b;
      b.x.set(d.x); b.y.set(d.y); b.px.set(d.px); b.py.set(d.py); b.rx.set(d.rx); b.ry.set(d.ry); b.ox.set(d.x); b.oy.set(d.y);
      b.awake = d.awake; b.still = d.still; b.nt = 0;
      b.bounds();
      return b;
    });
    W.next = s.next;
    W.hashed = false;
  }

  // ---- the engine's extension ---------------------------------------------------------------------------------------------

  /**
   * A Physics board's hooks (see Game hooks in js/engine.js) and its clock. Its state: the world (W), the piece in
   * play's place between rows (off: it is drawn and collides `off` below its grid row), the time (t), the rewind
   * buffer (snaps), how long a settled body has stood above the top line (topT).
   */
  function extension(game, saved) {
    const k = game.recipe.physics;
    const W = new World(game.w, game.h, k.material);
    const ok = saved && unpack(W, saved.world);
    // The grid holds nothing on a Physics board: the save's cells are only a picture of the bodies (thumbnails).
    game.board.cells.fill(0);
    game.findRoom = false;
    const X = {
      // Who moves the piece in play: Physics itself (a steady fall between rows), or Classic (row by row, by level).
      drive: !classicOn(game.recipe),
      W, off: ok && typeof saved.off === 'number' && saved.off >= 0 && saved.off < 1 ? saved.off : 0,
      t: 0, acc: 0, snaps: [], topT: 0, launch: null, events: [], soft: false, restT: 0, pushing: false, plans: new Map(),
      cleared: ok && Number.isFinite(saved.cleared) ? saved.cleared : 0, // minos cleared on this board
      bands: ok && Number.isFinite(saved.bands) ? saved.bands : 0,
    };
    // The piece in play meets the bodies: fitShape (under fitsAt, ghostY, the lock and every spawn) asks the grid (walls,
    // the ceiling), then the world, at the piece's own place between rows (a piece not yet in play: on its row).
    // The piece in play where it already is may be pressed on a little (it pushes that back out itself); moved or turned
    // by the player (X.pushing), what is in the way is shoved aside when it can go (pushPlan), and the move is refused
    // when it cannot.
    const baseFits = game.fitShape;
    game.fitShape = function (p, rot, x, y, board) {
      if (!baseFits.call(game, p, rot, x, y, board)) return false;
      if ((board && board !== game.board) || X.landing) return true;
      const own = p === game.piece, off = own ? X.off : 0;
      const rel = p.type.rots[rot].map(([cx, cy]) => [game.board.wx(x + cx), y + cy]);
      const here = own && rot === p.rot && x === p.x && y === p.y;
      if (!hits(W, rel, -off, here ? P.EPS_HERE : P.EPS)) return true;
      if (!own || !X.pushing || here) return false;
      let dx = x - p.x;
      if (Math.abs(dx) > game.w / 2) dx = -dx; // (round a wrapping board)
      dx = Math.sign(dx);
      const dirs = rot !== p.rot ? TURN_DIRS : dx ? [[dx, 0]] : y < p.y ? [[0, -1]] : TURN_DIRS;
      const plan = pushPlan(W, rel.map(([cx, cy]) => [cx, cy - off]), dirs);
      if (!plan) return false;
      X.plans.set(rot + ',' + x + ',' + y, plan);
      return true;
    };
    // The player's moves and turns: what is in the way is shoved (the plan of the place the piece ended up at).
    const pushed = (base) => function (...a) {
      const p = game.piece;
      X.plans.clear();
      X.pushing = true;
      let ok;
      try { ok = base.apply(game, a); } finally { X.pushing = false; }
      if (ok && p && game.piece === p) {
        const plan = X.plans.get(p.rot + ',' + p.x + ',' + p.y);
        if (plan) applyPlan(W, plan);
        X.restT = 0;
      }
      X.plans.clear();
      return ok;
    };
    game.move = pushed(game.move);
    game.rotate = pushed(game.rotate);
    // A new piece (spawned, from hold, rewound) starts on its row.
    game.on('spawn', () => { X.off = 0; X.restT = 0; });
    // The save's cells: the bodies' minos where their centres are (for the library's thumbnails).
    const baseJSON = game.toJSON;
    game.toJSON = function () {
      const out = baseJSON.call(game);
      out.cells = raster(W, game.w, game.h);
      return out;
    };
    Object.assign(X, {
      key: 'physics',
      // A piece's cells become a body at the lock (moving as the landing left it); the grid stays empty.
      afterPlace(g, b, abs, v) {
        if (b !== g.board) return;
        X.landing = false; // (past the lock's own check: the next piece meets the bodies again)
        // Set by Physics (land: its speed and place), or by the engine (Classic's lock delay, a hard drop: g.drop).
        let L0 = X.launch;
        X.launch = null;
        if (!L0) {
          const hard = !!g.pendingDrop;
          // Flush with what it rests on: from its row down to the contact (never more than a row).
          const rel = abs.map(([x, y]) => [x, y]);
          let d = X.off;
          if (!hits(W, rel, -(d + 1))) d += 1; else { let a = d, z = d + 1; for (let i = 0; i < 12; i++) { const m = (a + z) / 2; if (hits(W, rel, -m)) z = m; else a = m; } d = a; }
          L0 = { vy: hard ? -P.HARD_V : -P.SOFT_LAND, off: d, hard };
        }
        const cells = [], vals = [], seen = new Set();
        for (const [x, y] of abs) {
          const key = x + ',' + y;
          if (seen.has(key) || x < 0 || x >= g.w) continue;
          seen.add(key);
          cells.push([x, y]); vals.push(v & ~CELL.HIDDEN);
          if (y >= 0 && y < g.h) b.set(x, y, 0);
        }
        if (!cells.length) return;
        const body = fromCells(W.next++, cells, vals, L0.off, 0, L0.vy);
        W.bodies.push(body);
        W.hashed = false;
        X.events.push({ type: 'land', hard: !!L0.hard, v: -L0.vy, at: [body.x0, body.y0, body.x1, body.y1] });
      },
      rows: () => [],
      clean: () => W.bodies.length === 0,
      save() { return { v: 1, world: pack(W), off: r4(X.off), cleared: X.cleared, bands: X.bands }; },
      reset() { W.bodies = []; W.hashed = false; X.snaps = []; X.topT = 0; X.off = 0; X.cleared = 0; X.bands = 0; },
      summary() { return { cleared: X.cleared, bands: X.bands }; },
      /**
       * Real time goes by: dt seconds (at most a tenth at a time), in fixed steps. o: { soft } (↓ held). Returns the
       * events since the last call: { type: 'land', hard, v }, { type: 'clear', bands, minos, own, pay, rows, removed },
       * { type: 'full' } (the board just filled up).
       */
      tick(g, dt, o) {
        X.soft = !!(o && o.soft);
        X.acc += Math.min(Math.max(0, dt || 0), 0.1);
        while (X.acc >= P.STEP) { X.acc -= P.STEP; X.stepOnce(g); }
        const ev = X.events;
        X.events = [];
        return ev;
      },
      stepOnce(g) {
        if (g.over) return;
        X.t += P.STEP;
        const p = g.piece;
        // The piece in play is the player's until let go: it never falls by itself (on Physics + Plain) and touching
        // a body or the floor does not set it. ↓ takes it down to what is below (shoving aside what can move) and it
        // rests there; held there REST_HOLD, it is let go (softDrop). Under Classic, Classic moves it and sets it.
        if (p && X.drive && X.soft) {
          const d = P.SOFT_V * P.STEP, Y = p.y - X.off, rel = X.rel(g, p);
          if (!hits(W, rel, Y - d, 1e-4)) X.place(p, Y - d);
          else {
            const plan = Y - d >= 0 ? pushPlan(W, rel.map(([x, y]) => [x, y + Y - d]), [[0, -1]]) : null;
            // (Something it only grazes is not shoved: it rests on it.)
            if (plan && plan.size) { applyPlan(W, plan); X.place(p, Y - d); } else X.place(p, X.contact(g, p, Y, Y - d));
          }
        }
        X.restT = p && X.resting(g) ? X.restT + P.STEP : 0;
        X.syncKin(g);
        stepWorld(W);
        const cl = clearBands(W);
        if (cl) X.cleared_(g, cl);
        // Settled bodies above the top line for TOP_T: the board is full.
        let above = false;
        // (Settled: asleep, or the body as a whole slower than TOP_V: a wobbling stack counts, one flying past does not.)
        const tv = P.TOP_V * P.STEP / P.SUB;
        for (const b of W.bodies) if (b.y1 > g.h + 0.05 && (!b.awake || b.ux * b.ux + b.uy * b.uy < tv * tv)) { above = true; break; }
        X.topT = above ? X.topT + P.STEP : 0;
        if (X.topT >= P.TOP_T && !g.over) { X.topT = 0; g.over = true; g.endKind = null; X.events.push({ type: 'full' }); g.emit('topout'); return; }
        if (X.t - (X.snaps.length ? X.snaps[X.snaps.length - 1].t : -1e9) >= P.SNAP_EVERY - 1e-9) X.remember(g);
      },
      /** The piece's cells (columns, and rows from its own place). */
      rel(g, p) { return p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), cy]); },
      /** Whether the piece in play rests on something (a body or the floor right under it). */
      resting(g) { const p = g.piece; return !!p && hits(W, X.rel(g, p), p.y - X.off - 0.03); },
      /** The world's picture of the piece in play (W.kin); a piece that moved, turned or went wakes what rested on it. */
      syncKin(g) {
        const p = g.piece;
        const K = p && !g.over ? kinOf(X.cellsOf(g, p), X.off) : null;
        const old = W.kin;
        if ((old && old.key) === (K && K.key)) return;
        if (old) for (const b of W.bodies) {
          if (b.awake) continue;
          if (old.cells.some(([x, y]) => b.x1 > x - 0.1 && b.x0 < x + 1.1 && b.y1 > y - old.off - 0.1 && b.y0 < y - old.off + 1.1)) wake(W, b);
        }
        W.kin = K;
      },
      /** The piece's cells at its grid row. */
      cellsOf(g, p) { return p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), p.y + cy]); },
      /** Puts the piece in play at height Y (its grid row the one at or above it, off the rest). */
      place(p, Y) { const row = Math.ceil(Y - 1e-9); p.y = row; X.off = Math.max(0, Math.min(0.999999, row - Y)); },
      /** The lowest height between free (from) and blocked (to) the piece can be at, by halves. */
      contact(g, p, from, to) {
        const rel = p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), cy]);
        let a = from, b = to;
        // (Strictly: a graze allowed at every step of a held ↓ would let the piece press its way down into soft bodies.)
        for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (hits(W, rel, m, 1e-4)) b = m; else a = m; }
        return a;
      },
      /** The piece in play becomes a body, moving down at v (hard: a hard drop's landing). */
      land(g, v, hard) {
        // (It is where it touches: the lock does not ask the bodies again.)
        X.launch = { vy: -v, off: X.off, hard };
        X.landing = true;
        try { g.lock(); } finally { X.landing = false; X.launch = null; }
        X.syncKin(g); // (the piece it was is a body now: no longer in the way of itself)
      },
      /** Lets the piece in play go where it is, gently (it rests on something: a soft landing). */
      release(g) {
        const p = g.piece;
        if (!p || g.over) return false;
        const Y = p.y - X.off;
        if (!hits(W, X.rel(g, p), Y - 0.03)) return false;
        X.place(p, Math.max(0, X.contact(g, p, Y, Y - 0.03)));
        X.land(g, P.SOFT_LAND, false);
        return true;
      },
      /** A hard drop: thrown straight down to what it meets, landing there at HARD_V (resting already: let go gently). */
      hardDrop(g) {
        const p = g.piece;
        if (!p || g.over) return false;
        if (X.resting(g)) { g.s.drops++; return X.release(g); }
        const rel = p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), cy]);
        let Y = p.y - X.off, lo = Y;
        while (lo > -2 && !hits(W, rel, lo - 0.25)) lo -= 0.25;
        const at = hits(W, rel, lo - 0.25) ? X.contact(g, p, lo, lo - 0.25) : lo;
        g.s.drops++;
        X.place(p, Math.max(at, 0));
        X.land(g, P.HARD_V, true);
        return true;
      },
      /** A band cleared: its minos counted and paid (WORTH of a cell of a row each, by the board's worth). */
      cleared_(g, cl) {
        const own = cl.removed.filter(([, , v]) => !(v & CELL.FOREIGN)).length;
        const rowsOwn = own / g.w;
        const pay = rowsOwn * (g.rules.lk || g.w / 10) * WORTH;
        g.s.lines += cl.bands;
        g.s.own = (g.s.own || 0) + rowsOwn;
        g.s.score += 100 * cl.bands * cl.bands + 10 * own;
        X.cleared += own; X.bands += cl.bands;
        // Classic counts the bands as its lines (its level, B type's 25).
        if (!X.drive && L.Classic && L.Classic.addLines) L.Classic.addLines(g, cl.bands);
        X.events.push({ type: 'clear', bands: cl.bands, minos: cl.removed.length, own, rowsOwn, pay, rows: cl.rows, removed: cl.removed });
      },
      /** The rewind buffer: the world and the game as they are now. */
      remember(g) {
        const p = g.piece;
        X.snaps.push({
          t: X.t, world: snapWorld(W), off: X.off, topT: X.topT,
          piece: p ? { entry: Object.assign({}, p.entry, { special: p.special || null }), rot: p.rot, x: p.x, y: p.y } : null,
          hold: g.hold, holdLocked: g.holdLocked, queue: g.queue.map((e) => Object.assign({}, e)), bag: g.bag.slice(), rng: g.rng.state(),
          s: JSON.parse(JSON.stringify(g.s)), cleared: X.cleared, bands: X.bands,
        });
        // Kept while it could still be the one five seconds back (and one before it).
        let drop = 0;
        while (drop + 1 < X.snaps.length && X.snaps[drop + 1].t <= X.t - P.SNAP_SPAN) drop++;
        if (drop) X.snaps.splice(0, drop);
      },
      /** The snapshot a rewind would go back to: the newest at least SNAP_SPAN old, else the oldest; null with none. */
      rewindTarget() {
        if (!X.snaps.length) return null;
        let pick = X.snaps[0];
        for (const s of X.snaps) if (s.t <= X.t - P.SNAP_SPAN + 1e-6) pick = s;
        return pick;
      },
      /** Turns time back about five seconds: the bodies, the piece, the queue and the board's numbers. */
      rewind(g) {
        const s = X.rewindTarget();
        if (!s) return null;
        restoreWorld(W, s.world);
        g.hold = s.hold; g.holdLocked = s.holdLocked;
        g.queue = s.queue.map((e) => Object.assign({}, e)); g.bag = s.bag.slice(); g.rng = L.RNG.from(s.rng);
        g.s = JSON.parse(JSON.stringify(s.s));
        X.cleared = s.cleared; X.bands = s.bands; X.topT = s.topT;
        g.over = false; g.endKind = null; g.endDue = false;
        const back = X.t - s.t;
        X.snaps = X.snaps.filter((o) => o.t <= s.t);
        X.t = s.t; X.acc = 0; X.events = [];
        if (s.piece && L.Pieces.get(s.piece.entry.id)) {
          const type = L.Pieces.get(s.piece.entry.id);
          g.piece = { type, rot: s.piece.rot, x: s.piece.x, y: s.piece.y, special: s.piece.entry.special || null, entry: s.piece.entry, lastRot: false };
          X.off = s.off;
        } else { g.piece = null; g.spawnNext(); }
        g.emit('undo');
        return { back };
      },
    });
    return X;
  }

  /** The grid picture of the bodies: each mino's value in the cell its centre is in (thumbnails). */
  function raster(W, w, h) {
    const out = new Array(w * h).fill(0);
    for (const b of W.bodies) for (let k = 0; k < b.m; k++) {
      const x = Math.floor(b.mx(k)), y = Math.floor(b.my(k));
      if (x >= 0 && x < w && y >= 0 && y < h && !out[y * w + x]) out[y * w + x] = b.col[k];
    }
    return out;
  }

  /** The Physics extension of a game (null on a board that is not Physics). */
  function of(game) {
    const e = game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'physics') : null;
    return e || null;
  }

  // ---- the part ------------------------------------------------------------------------------------------------------------

  /**
   * What a Physics board refuses, and why (Recipe.rules: R.refuse). Every power-up that reads or rewrites the grid, or
   * pays by quads and streaks, assumes a still board of whole cells; on Physics the pieces are moving bodies.
   */
  const REFUSE = {
    fit: 'Best Fit weighs a still grid; Physics has none',
    patch: 'Tools act on grid cells; Physics has none',
    phase: 'Tools act on grid cells; Physics has none',
    drill: 'Tools act on grid cells; Physics has none',
    bomb: 'Tools act on grid cells; Physics has none',
    laser: 'Tools act on grid cells; Physics has none',
    blackhole: 'Tools act on grid cells; Physics has none',
    flip: 'Not on a Physics board: it flips a still grid',
    trapdoor: 'Not on a Physics board: it drops a grid row',
    tornado: 'Not on a Physics board: it shuffles grid columns',
    settle: 'Not on a Physics board: bodies settle by themselves',
    golden: 'Physics pays a flat rate per block',
    double: 'Physics has no quads or T-spins',
    net: 'Physics has no streak',
  };

  const PART = {
    key: 'physics', order: 30, mod: 'physics', owns: ['mods.physics', 'physics'],
    options: { 'physics.material': MATERIAL_IDS.slice() },
    // A Physics board stays Physics (its bodies have no grid to go back to), and no board becomes one by an edit.
    editFixed: true,
    normalize(raw, out) {
      if (!on(out)) return;
      const m = raw && raw.physics && typeof raw.physics === 'object' ? raw.physics.material : null;
      out.physics = { material: MATERIALS[m] ? m : DEFAULT_MATERIAL };
    },
    // "Physics" is the core's (the modifiers' names); a material other than the first says itself.
    label: (r) => (on(r) && r.physics.material !== DEFAULT_MATERIAL ? MATERIALS[r.physics.material].name : ''),
    rules(r, R) {
      if (!on(r)) return;
      Object.assign(R.refuse, REFUSE);
      // No exact Undo (Rewind 5 s takes its place, js/physicsview.js), no control hints (they teach grid placing),
      // no feats (quads, T-spins and streaks do not exist here).
      R.undo = false;
      R.hints = false;
      R.noFeats = true;
      R.physics = true;
    },
    conflicts(r, out) {
      // Mirror copies a piece cell for cell across the grid, Protect's sprout, stones and moles live on the grid:
      // Physics bodies have none.
      if (on(r)) {
        out['mods.mirror=true'] = 'Not with Physics';
        out['mode=protect'] = 'Not with Physics';
        // Classic B type's garbage is grid cells the bodies could not stand on.
        if (classicOn(r)) for (let k = 1; k <= 5; k++) out['classic.height=' + k] = 'No garbage with Physics';
      }
      if (r.mods && r.mods.mirror) out['mods.physics=true'] = 'Not with Mirror';
      if (r.mode === 'protect') out['mods.physics=true'] = 'Not in Protect';
    },
    valid(g, r) {
      if (!on(r)) return true;
      const x = g.x && typeof g.x === 'object' ? g.x.physics : undefined;
      return x === undefined || (!!x && typeof x === 'object' && x.v === 1);
    },
    engine(game, saved) { return on(game.recipe) ? extension(game, saved) : null; },
    controller(play, game) { return game && on(game.recipe) && L.PhysicsView ? L.PhysicsView.controller(play, game) : null; },
    summary(x) { return x && x.v === 1 ? { cleared: x.cleared || 0, bands: x.bands || 0 } : null; },
    stats: { free: { physics: { pieces: 0, cleared: 0, bands: 0, rewinds: 0, full: 0 } } },
  };
  if (Recipe) Recipe.part(PART);

  L.Physics = { P, WORTH, MATERIALS, MATERIAL_IDS, DEFAULT_MATERIAL, REFUSE, material, on, of, Body, World, fromCells, split, stepWorld, hits, fullBands, clearBands, pack, unpack, raster, wake, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
