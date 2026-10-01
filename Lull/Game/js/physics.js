// Lull — Physics, a board modifier (js/recipe.js): Tetris with physics. The piece in play moves, turns and falls on its own
// (column by column, at a steady pace; ↓ hurries it, a hard drop throws it) until it touches a body or the floor; then
// it becomes a soft body and keeps its momentum, and the next piece appears at once. Every body lives in continuous
// space, simulated in real time, a fixed small step at a time (never solved ahead at the lock): a hard drop lands hard
// and knocks what it hits, a soft one sets down gently. A band one mino tall clears when the minos centred in it cover
// about 90% of the width: those whole minos go, what is left of each body splits into its connected parts, and
// everything above falls in the frames after. Rewind 5 s takes Undo's place. Pure rules, no DOM: the material, the
// world, the step, the clears, the engine's hooks, the rewind buffer and the pay; the look and Free Play's controller
// are js/physicsview.js.
//
// The model (position-based dynamics on particles, the way soft-body games do it):
//   - every mino is a quad of four particles (its corners); minos of one body share the corners they meet at
//   - Verlet-style integration with gravity and a little air damping, in substeps of 1/240 s
//   - shape matching per body (Müller et al. 2005): each particle is pulled toward where the body's rest shape, best
//     rotated onto it, puts it, by the material's stiffness: the springy part
//   - plasticity: under sustained load the rest shape drifts toward the deformed one (at the material's flow rate,
//     past a small yield, never more than a bound from the grid shape): the fluid part, a stack sags and stays sagged
//   - each mino keeps its area (a quad area constraint): squash wide, stretch thin, never collapse
//   - collisions: a particle inside another body's mino is pushed out through the nearest outer edge (both sides move,
//     by mass), with low friction and restitution; walls and the floor; a spatial hash grid of the minos (cell 1)
//   - sleeping: a body still for SLEEP_T, all it touches still or asleep, sleeps (costs nothing, solid to the rest);
//     a body struck faster than WAKE_V wakes, and so does all that rests on it; a clear wakes everything above it
// Not deterministic across engines and not meant to be: the save keeps the bodies themselves.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL } = L;

  // ---- materials ---------------------------------------------------------------------------------------------------

  /**
   * A material is a set of numbers. stiffness: shape matching's pull a substep (0 limp, 1 rigid); flow: how fast the
   * rest shape follows a deformation past `yield` (a second); drift: the most the rest shape may leave the grid shape
   * (cells); area: how hard a mino keeps its area (a substep); wobble: how much of the wobble about the body's own
   * motion is lost a substep (1/240 s); restitution: of the closing speed a landing on the floor or a wall gives back
   * (above BOUNCE_V); friction: Coulomb, on bodies and the floor; density: mass a mino; damping: velocity lost a second.
   * Reduced motion uses `still` over it: stiffer, less bouncy, more damped (less wobble, the same game).
   */
  const MATERIALS = {
    jelly: {
      name: 'Jelly',
      stiffness: 0.5, flow: 0.5, yield: 0.06, drift: 0.18, area: 0.6, wobble: 0.3,
      restitution: 0.25, friction: 0.18, density: 1, damping: 0.3,
      still: { stiffness: 0.75, wobble: 0.6, restitution: 0.08 },
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
    FALL_V: 1.6, // the piece in play falls this fast (cells a second)
    SOFT_V: 10, // while ↓ is held
    SOFT_LAND: 2, // a piece that lands soft keeps at most this much downward speed
    HARD_V: 26, // a hard drop's speed at the landing
    VMAX: 45, // no particle moves faster
    CONTACT_DAMP: 0.5, // of the speed two bodies still pressed together part at, lost a substep
    UP_MAX: 9, // no body as a whole rises faster than this (cells a second)
    PULL_MAX: 8, // shape matching never moves a particle faster than this (cells a second)
    SHOCK: 0.25, // in a contact, the lower body moves this much of what the upper one does
    PUSH_MAX: 6, // nor does a contact push one out faster than this, beyond undoing what closed it that substep
    BOUNCE_V: 4, // a contact closing slower than this does not bounce (resting contact never does)
    SLEEP_D: 0.04, SLEEP_T: 0.4, // a body whose particles all stay within SLEEP_D of where they were for SLEEP_T sleeps
    WAKE_V: 3, // a sleeping body struck faster than this wakes (a resting stack jitters at about 1)
    COVER: 0.9, // a band clears when its minos cover this much of the width
    CALM_V: 3, // ... and each of them moves slower than this (never one passing through)
    TOP_T: 1.5, // seconds a settled body may stay above the top line before the board is full
    TOP_V: 2, // settled: slower than this as a whole (cells a second)
    SNAP_EVERY: 0.25, SNAP_SPAN: 5, // the rewind buffer: a snapshot every quarter second, five seconds back
    ROOF: 10, // rows of room above the top line (the world's ceiling)
    EPS: 0.015, // the piece in play may graze a body by this much
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
    this.awake = true; this.still = 0; this.win = 0; this.touch = []; this.loops = null;
    this.ux = 0; this.uy = 0; // its middle's speed (a substep's move)
    this.c = 1; this.s = 0; // its turn (shape matching's rotation, cosine and sine)
    this.x0 = 0; this.y0 = 0; this.x1 = 0; this.y1 = 0; // bounds
  }
  /** Works out each mino's outer edges, the outer particles and the outline loops (after a body is made). */
  Body.prototype.topo = function () {
    const m = this.m, q = this.q, cnt = new Map();
    const key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
    for (let k = 0; k < m; k++) for (let e = 0; e < 4; e++) { const kk = key(q[4 * k + e], q[4 * k + ((e + 1) & 3)]); cnt.set(kk, (cnt.get(kk) || 0) + 1); }
    this.outer.fill(0);
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
      for (let k = 0; k < b.m; k++) {
        if (!b.edge[k]) continue;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let e = 0; e < 4; e++) { const i = q[4 * k + e]; const a = X[i], c = Y[i]; if (a < x0) x0 = a; if (a > x1) x1 = a; if (c < y0) y0 = c; if (c > y1) y1 = c; }
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
    const kd = 1 - Math.pow(1 - M.wobble, h * 240), upMax = P.UP_MAX * h;
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
      for (let i = 0; i < n; i++) {
        const rx = X[i] - cx, ry = Y[i] - cy, vx = X[i] - PX[i], vy = Y[i] - PY[i];
        PX[i] = X[i] - (vx + kd * (ux - om * ry - vx));
        PY[i] = Y[i] - (vy + kd * (uy + om * rx - vy) - lift);
      }
    }
  }

  /** Shape matching, then the plastic drift of the rest shape. */
  function shapeMatch(W, h, M) {
    // The material's stiffness is a pull per 1/240 s; at another substep it is the same pull a second.
    const k = 1 - Math.pow(1 - M.stiffness, h * 240), pmax = P.PULL_MAX * h, pm2 = pmax * pmax;
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
      for (let i = 0; i < n; i++) {
        const qx = RX[i] - rx, qy = RY[i] - ry;
        const gx = cx + c * qx - s * qy, gy = cy + s * qx + c * qy;
        // Plasticity: where the particle is, in the body's frame, against where the rest shape has it.
        if (flow > 0) {
          const dx = X[i] - cx, dy = Y[i] - cy;
          const lx = c * dx + s * dy, ly = -s * dx + c * dy;
          const ex = lx - qx, ey = ly - qy, e2 = ex * ex + ey * ey;
          if (e2 > yieldD * yieldD) {
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
          if (A.touch[A.touch.length - 1] !== Bd) A.touch.push(Bd);
          if (Bd.touch[Bd.touch.length - 1] !== A) Bd.touch.push(A);
        }
      }
      if (deep && !sleeping) centres(W, A, ai);
    }
  }

  /**
   * The middle of each of A's outer minos against the other bodies' minos: two squares turned 45° on each other can
   * overlap with no corner inside the other; a middle inside another mino is pushed out through its nearest outer edge,
   * the whole mino moving, and the closing stopped.
   */
  function centres(W, A, ai) {
    const w = W.w, H = W.H, B = W.bodies, head = W.head, nxt = W.nxt, ib = W.ib, ik = W.ik;
    const AX = A.x, AY = A.y, aq = A.q, pushMax = P.PUSH_MAX * P.STEP / P.SUB;
    for (let m = 0; m < A.m; m++) {
      if (!A.edge[m]) continue;
      const a0 = aq[4 * m], a1 = aq[4 * m + 1], a2 = aq[4 * m + 2], a3 = aq[4 * m + 3];
      const px = (AX[a0] + AX[a1] + AX[a2] + AX[a3]) / 4, py = (AY[a0] + AY[a1] + AY[a2] + AY[a3]) / 4;
      if (px < 0 || py < 0) continue;
      const cx = Math.floor(px), cy = Math.floor(py);
      if (cx >= w || cy >= H) continue;
      for (let it = head[cy * w + cx]; it >= 0; it = nxt[it]) {
        const bi = ib[it];
        if (bi === ai) continue;
        const Bd = B[bi], k = ik[it], q = Bd.q, BX = Bd.x, BY = Bd.y;
        let best = -1, bd = Infinity, inside = true;
        for (let ed = 0; ed < 4; ed++) {
          const j0 = q[4 * k + ed], j1 = q[4 * k + ((ed + 1) & 3)];
          const ex = BX[j1] - BX[j0], ey = BY[j1] - BY[j0];
          const cr = ex * (py - BY[j0]) - ey * (px - BX[j0]);
          if (cr < 0) { inside = false; break; }
          if (Bd.edge[k] & (1 << ed)) { const d = cr / (Math.sqrt(ex * ex + ey * ey) || 1); if (d < bd) { bd = d; best = ed; } }
        }
        if (!inside || best < 0) continue;
        const j0 = q[4 * k + best], j1 = q[4 * k + ((best + 1) & 3)];
        const ex = BX[j1] - BX[j0], ey = BY[j1] - BY[j0], l = Math.sqrt(ex * ex + ey * ey) || 1, nx = ey / l, ny = -ex / l;
        // Half each way (a sleeping body stays put: A takes all of it), a little past the edge.
        const all = Math.min(bd + 0.02, pushMax), d = Bd.awake ? all * 0.5 : all;
        for (let e = 0; e < 4; e++) { const i = aq[4 * m + e]; AX[i] += d * nx; AY[i] += d * ny; }
        if (Bd.awake) { BX[j0] -= d * nx; BY[j0] -= d * ny; BX[j1] -= d * nx; BY[j1] -= d * ny; }
        break;
      }
    }
  }

  /**
   * Sleep: a body none of whose particles has gone SLEEP_D from where it was SLEEP_T ago (a resting wobble never adds
   * up to that; a slide or a creep does), everything it touched still or asleep, sleeps.
   */
  function settleBodies(W, dt) {
    const d2 = P.SLEEP_D * P.SLEEP_D;
    for (const b of W.bodies) {
      if (!b.awake) continue;
      let moved = false;
      const X = b.x, Y = b.y, OX = b.ox, OY = b.oy;
      for (let i = 0; i < b.n; i++) { const dx = X[i] - OX[i], dy = Y[i] - OY[i]; if (dx * dx + dy * dy > d2) { moved = true; break; } }
      // A new window every half SLEEP_T: a creep slower than SLEEP_D a window (a stack's slow sag) is still.
      if (moved) { b.still = 0; b.win = 0; OX.set(X); OY.set(Y); }
      else { b.still += dt; b.win += dt; if (b.win >= P.SLEEP_T / 2) { b.win = 0; OX.set(X); OY.set(Y); } }
    }
    for (const b of W.bodies) {
      if (!b.awake || b.still < P.SLEEP_T) continue;
      let ok = b.y0 < 0.05; // on the floor, or on something that is itself settled
      let calm = true;
      for (const o of b.touch) { if (o.awake && o.still < P.SLEEP_T) { calm = false; break; } ok = true; }
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
    for (const b of W.bodies) if (b.awake) b.touch.length = 0;
    for (let s = 0; s < P.SUB; s++) {
      integrate(W, h, M);
      shapeMatch(W, h, M);
      keepArea(W, M, h);
      // Contacts last, so a substep ends with nothing inside anything.
      W.hash();
      collide(W, h, M, s === P.SUB - 1); // (the middles once a step: a deep overlap is rare)
      bounds(W, h, M);
      dampWobble(W, h, M);
    }
    for (const b of W.bodies) if (b.awake) b.bounds();
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
  function hits(W, cells, dy) {
    if (!W.hashed) W.hash();
    const w = W.w, H = W.H, head = W.head, nxt = W.nxt, ib = W.ib, ik = W.ik, B = W.bodies, e = P.EPS;
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

  // ---- clears -------------------------------------------------------------------------------------------------------------

  /**
   * The bands that are full now: for each band y (a grid row, [y, y + 1)), the minos centred in it, slower than CALM_V,
   * covering at least COVER of the width (each mino its own span left to right, the spans joined). [{ y, minos: [[b, k]] }]
   */
  function fullBands(W) {
    // (A hair of slack: squashed jelly minos side by side cover a little less than their count.)
    const w = W.w, need = P.COVER * w - 0.2, rows = new Map(), calm2 = (P.CALM_V * P.STEP / P.SUB) ** 2;
    for (const b of W.bodies) {
      const q = b.q, X = b.x, Y = b.y;
      for (let k = 0; k < b.m; k++) {
        const my = b.my(k);
        if (my < 0 || my >= W.h) continue;
        const y = Math.floor(my);
        let fast = false;
        if (b.awake) for (let e = 0; e < 4; e++) { const i = q[4 * k + e], dx = X[i] - b.px[i], dy = Y[i] - b.py[i]; if (dx * dx + dy * dy > calm2) { fast = true; break; } }
        let x0 = Infinity, x1 = -Infinity;
        for (let e = 0; e < 4; e++) { const v = X[q[4 * k + e]]; if (v < x0) x0 = v; if (v > x1) x1 = v; }
        let r = rows.get(y);
        if (!r) rows.set(y, (r = { y, spans: [], minos: [], fast: false }));
        r.spans.push([Math.max(0, x0), Math.min(w, x1)]);
        r.minos.push([b, k]);
        if (fast) r.fast = true;
      }
    }
    const out = [];
    for (const r of rows.values()) {
      if (r.fast || r.minos.length < need - 1) continue;
      r.spans.sort((a, b) => a[0] - b[0]);
      let cover = 0, a = -1, z = -1;
      for (const [s0, s1] of r.spans) {
        if (s0 > z) { if (z > a) cover += z - a; a = s0; z = s1; } else if (s1 > z) z = s1;
      }
      if (z > a) cover += z - a;
      if (cover >= need - 1e-9) out.push({ y: r.y, minos: r.minos });
    }
    return out.sort((a, b) => a.y - b.y);
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
    const low = full[0].y;
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
      b.awake = d.awake; b.still = d.still; b.touch = [];
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
      t: 0, acc: 0, snaps: [], topT: 0, launch: null, events: [], soft: false,
      cleared: ok && Number.isFinite(saved.cleared) ? saved.cleared : 0, // minos cleared on this board
      bands: ok && Number.isFinite(saved.bands) ? saved.bands : 0,
    };
    // The piece in play meets the bodies: fitShape (under fitsAt, ghostY, the lock and every spawn) asks the grid (walls,
    // the ceiling), then the world, at the piece's own place between rows (a piece not yet in play: on its row).
    const baseFits = game.fitShape;
    game.fitShape = function (p, rot, x, y, board) {
      if (!baseFits.call(game, p, rot, x, y, board)) return false;
      if ((board && board !== game.board) || X.landing) return true;
      const off = p === game.piece ? X.off : 0;
      return !hits(W, p.type.rots[rot].map(([cx, cy]) => [game.board.wx(x + cx), y + cy]), -off);
    };
    // A new piece (spawned, from hold, rewound) starts on its row.
    game.on('spawn', () => { X.off = 0; });
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
        // The piece in play falls; touching a body or the floor, it becomes one. Under Classic, Classic moves it; a
        // body that moves into it still makes it one.
        if (p && !X.drive) {
          if (hits(W, X.cellsOf(g, p).map(([x, y]) => [x, y - p.y]), p.y - X.off)) X.land(g, P.SOFT_LAND, false);
        } else if (p) {
          const v = X.soft ? P.SOFT_V : P.FALL_V;
          const d = v * P.STEP;
          const cells = X.cellsOf(g, p);
          const Y = p.y - X.off;
          if (!hits(W, cells.map(([x, y]) => [x, y - p.y]), Y - d)) X.place(p, Y - d);
          else {
            X.place(p, X.contact(g, p, Y, Y - d));
            X.land(g, X.soft ? Math.min(v, P.SOFT_LAND) : v, false);
          }
        }
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
      /** The piece's cells at its grid row. */
      cellsOf(g, p) { return p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), p.y + cy]); },
      /** Puts the piece in play at height Y (its grid row the one at or above it, off the rest). */
      place(p, Y) { const row = Math.ceil(Y - 1e-9); p.y = row; X.off = Math.max(0, Math.min(0.999999, row - Y)); },
      /** The lowest height between free (from) and blocked (to) the piece can be at, by halves. */
      contact(g, p, from, to) {
        const rel = p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), cy]);
        let a = from, b = to;
        for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (hits(W, rel, m)) b = m; else a = m; }
        return a;
      },
      /** The piece in play becomes a body, moving down at v (hard: a hard drop's landing). */
      land(g, v, hard) {
        // (It is where it touches: the lock does not ask the bodies again.)
        X.launch = { vy: -v, off: X.off, hard };
        X.landing = true;
        try { g.lock(); } finally { X.landing = false; X.launch = null; }
      },
      /** A hard drop: straight down to what it meets, landing there at HARD_V. */
      hardDrop(g) {
        const p = g.piece;
        if (!p || g.over) return false;
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
