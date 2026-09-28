// Lull — the window rolled up into its title bar (a window shade), and the idle pieces that drift along it meanwhile.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const CHEVRON_UP = L.Icons.icon('chevUp');
  const CHEVRON_DOWN = L.Icons.icon('chevDown');

  // ---- the idle bar --------------------------------------------------------------------------------------------------
  //
  // A parade along the bar, like a game's menu backdrop: the bar is a well on its side, four lanes deep, and pieces
  // "fall" along it from left to right — smoothly, each at its own speed (a game gravity level, from a Level 1 drift to
  // a Level 9 dart) and in its own SRS orientation. Lane changes and turns are the game's own: whole lanes, a real SRS
  // turn with its kicks, and instant, as the board makes them. A fast piece that closes on a slower one looks ahead
  // for a way past — a lane or two, a turn to something flatter that fits the free band — and takes it a move at a
  // time; with no way past it eases off and follows. Pieces that share a lane never come within CLEAR cells of each
  // other, so nothing ever overlaps, lands or stacks. Free pieces now and then hop a lane or turn for the fun of it.
  // Behind each one a thin rain of glyphs, in its colour, lights the cells it has just left and fades: longer and
  // brighter the faster it goes.

  const ROWS = 4;
  const CLEAR = 1; // empty cells kept between two pieces that share a lane
  // Speeds as game levels (the Classic gravity curve): mostly drifters, some walkers, now and then a dart.
  const KINDS = [[0.46, 1, 2.2], [0.38, 3, 5], [0.16, 7, 9]];
  const SPACE_MIN = 5, SPACE_MAX = 13; // cells the last piece in has come along the bar before the next one comes in
  const MOVE_GAP = 0.14; // seconds between the moves of a plan (each move itself is instant, as in the game)
  const FADE_IN = 4, FADE_OUT = 6; // columns over which a piece appears at the left and is gone at the right
  const POOL = 384; // glyphs of rain alive at once, at most
  const GLYPHS = '0123456789:=+<>ZTLJ';
  const IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  /** Cells a second at a game level: the Classic curve (seconds per row), inverted; levels may be fractional. */
  const speedAt = (l) => 1 / Math.max(0.012, Math.pow(0.8 - (l - 1) * 0.007, l - 1));
  const hash = (a) => { a = (a ^ 61) ^ (a >>> 16); a = Math.imul(a, 9); a ^= a >>> 4; a = Math.imul(a, 0x27d4eb2d); return (a ^ (a >>> 15)) >>> 0; };

  // Each shape's rotations, measured once: bounds, the lanes it covers (a bit mask, y up) and each lane's rearmost cell.
  const SHAPES = new Map();
  function shapeOf(id) {
    let sh = SHAPES.get(id);
    if (sh) return sh;
    const type = L.Pieces.get(id);
    sh = type.rots.map((cells, r) => {
      const b = type.rotBounds[r], rear = [];
      let mask = 0;
      for (const [x, y] of cells) { mask |= 1 << y; rear[y] = rear[y] == null ? x : Math.min(rear[y], x); }
      const rows = [];
      for (let y = 0; y < type.n; y++) if (rear[y] != null) rows.push(y, rear[y]);
      return { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, mask, rows };
    });
    SHAPES.set(id, sh);
    return sh;
  }
  const laneMask = (d, y) => (y >= 0 ? d.mask << y : d.mask >>> -y);

  class BarIdle {
    constructor(canvas, getLook, isReduced) {
      this.cv = canvas;
      this.getLook = getLook;
      this.isReduced = isReduced;
      this.running = false;
      this.raf = 0;
      this.last = 0;
      this.frames = 0;
      this.cols = 0;
      this.serial = 0;
      this.exited = 0;
      this.turns = 0; this.shifts = 0; this.overtakes = 0;
      this.t = 0;
      this.pieces = [];
      this.look = null;
      this.onMove = null; // (piece, 'turn' | 'shift', from, to): every discrete move as it is made (for tests)
      this.atlas = new Map();
      this.byFront = (a, b) => this.hi(b) - this.hi(a);
      // The rain: a ring of glyph cells, allocated once.
      this.rx = new Int16Array(POOL); this.ry = new Int8Array(POOL); this.rt = new Float64Array(POOL);
      this.rl = new Float32Array(POOL); this.ra = new Float32Array(POOL); this.rh = new Uint32Array(POOL);
      this.rc = new Array(POOL).fill(''); this.ri = 0;
      this.seed = 1 + Math.floor(Math.random() * 1e6);
      if (root.ResizeObserver) new ResizeObserver(() => { if (this.running) { this.resize(); this.draw(); } }).observe(canvas);
    }

    rand() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

    nextId() {
      if (!this.bag || !this.bag.length) {
        this.bag = IDS.slice();
        for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      }
      return this.bag.pop();
    }

    /**
     * Sizes the canvas to its box. As the bar opens at a new width (or with nothing left on it) the parade is run on
     * ahead, unseen, so it is full from end to end; while it is showing, a new width keeps every piece where it is,
     * counted from the left, so dragging the edge never reshuffles the bar.
     */
    resize(opening) {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
      this.dpr = dpr; this.w = w; this.h = h;
      this.s = Math.max(4, Math.floor((h - 12) / ROWS));
      this.top = Math.round((h - this.s * ROWS) / 2);
      const cols = Math.max(8, Math.floor((w - 12) / this.s));
      this.left = w - 4 - cols * this.s;
      if (cols === this.cols) return;
      if (!this.cols || opening) { this.reset(cols); return; }
      this.cols = cols;
      for (let i = this.pieces.length - 1; i >= 0; i--) if (this.lo(this.pieces[i]) >= cols) this.pieces.splice(i, 1);
      if (!this.pieces.length) this.reset(cols);
    }

    /** Starts the parade over, run on unseen until pieces are spread from end to end. */
    reset(cols) {
      this.cols = cols;
      this.pieces = [];
      this.bag = null;
      this.t = 0; this.due = 0; this.lastIn = null; this.space = 0;
      this.rt.fill(-1e9);
      const warm = 8 + cols / speedAt(1.4);
      for (let f = 0; f < warm * 30; f++) this.step(1 / 30);
    }

    /** A piece's cells on the bar, [col, lane] with lane 0 at the bottom (y up, like the board); col is fractional. */
    cellsOf(p) { return L.Pieces.get(p.id).rots[p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]); }

    lo(p) { return p.x + shapeOf(p.id)[p.rot].minX; }
    hi(p) { return p.x + shapeOf(p.id)[p.rot].maxX + 1; }

    /** How many pieces a bar this long holds at once, at most. */
    cap() { return Math.max(3, Math.min(12, Math.round(this.cols / 6))); }

    /** Whether a piece fits in a pose: inside the four lanes, and CLEAR cells from every piece sharing a lane with it. */
    fits(p, rot, x, y) {
      const d = shapeOf(p.id)[rot];
      if (y + d.minY < 0 || y + d.maxY >= ROWS) return false;
      const m = laneMask(d, y), lo = x + d.minX, hi = x + d.maxX + 1;
      for (const q of this.pieces) {
        if (q === p) continue;
        const e = shapeOf(q.id)[q.rot];
        if (!(laneMask(e, q.y) & m)) continue;
        const qlo = q.x + e.minX, qhi = q.x + e.maxX + 1;
        if (hi + CLEAR <= qlo + 1e-9 || qhi + CLEAR <= lo + 1e-9) continue;
        return false;
      }
      return true;
    }

    /**
     * The nearest piece ahead in the lanes a pose covers, and the gap to it (Infinity when the way is clear); when
     * `slower` is given, only pieces slower than that count.
     */
    ahead(p, rot, x, y, slower) {
      const d = shapeOf(p.id)[rot], m = laneMask(d, y), hi = x + d.maxX + 1;
      let gap = Infinity, by = null;
      for (const q of this.pieces) {
        if (q === p || (slower != null && q.v >= slower)) continue;
        const e = shapeOf(q.id)[q.rot];
        if (!(laneMask(e, q.y) & m)) continue;
        const g = q.x + e.minX - hi;
        if (g >= 0 && g < gap) { gap = g; by = q; }
      }
      this._by = by;
      return gap;
    }

    /** Room behind a pose: no faster piece in its lanes so close it would have to brake hard. */
    roomBehind(p, rot, x, y) {
      const d = shapeOf(p.id)[rot], m = laneMask(d, y), lo = x + d.minX;
      for (const q of this.pieces) {
        if (q === p) continue;
        const e = shapeOf(q.id)[q.rot];
        if (!(laneMask(e, q.y) & m)) continue;
        const g = lo - (q.x + e.maxX + 1);
        if (g >= 0 && g < CLEAR + 1 + Math.max(0, q.v - p.v) * 0.6) return false;
      }
      return true;
    }

    /** Whether a pose would sit right against another piece, a lane above or below it: two shapes read as one. */
    touches(p, rot, x, y) {
      const d = shapeOf(p.id)[rot], m = laneMask(d, y), near = (m << 1) | (m >>> 1), lo = x + d.minX, hi = x + d.maxX + 1;
      for (const q of this.pieces) {
        if (q === p) continue;
        const e = shapeOf(q.id)[q.rot];
        if ((laneMask(e, q.y) & near) && q.x + e.minX < hi + 0.5 && q.x + e.maxX + 1 > lo - 0.5) return true;
      }
      return false;
    }

    /** A faster piece close behind in the same lanes that has found no way past (it gave up planning just now). */
    tailgater(p) {
      const d = shapeOf(p.id)[p.rot], m = laneMask(d, p.y), lo = p.x + d.minX;
      for (const q of this.pieces) {
        if (q === p || q.v0 * 0.75 - 0.2 <= p.v || q.thinkAt <= this.t || q.plan) continue;
        const e = shapeOf(q.id)[q.rot];
        if (!(laneMask(e, q.y) & m)) continue;
        const g = lo - (q.x + e.maxX + 1);
        if (g >= 0 && g < 3 + q.v0) return q;
      }
      return null;
    }

    /** The pose a turn lands in, as the game turns: the next SRS rotation and the first of its kicks that fits. */
    turned(p, rot, x, y, dir) {
      const type = L.Pieces.get(p.id);
      if (type.kicks === 'none') return null;
      const to = (rot + dir + 4) % 4;
      const kicks = L.Pieces.kicksFor(type, rot, to);
      for (let i = 0; i < kicks.length; i++) {
        const nx = x + kicks[i][0], ny = y + kicks[i][1];
        if (this.fits(p, to, nx, ny)) return { rot: to, x: nx, y: ny, kick: i };
      }
      return null;
    }

    /** Makes one move — a turn or a lane — at once, as the game does. */
    apply(p, kind, to) {
      const from = { rot: p.rot, x: p.x, y: p.y };
      p.rot = to.rot; p.x = to.x; p.y = to.y;
      if (kind === 'turn') this.turns++; else this.shifts++;
      if (this.onMove) this.onMove(p, kind, from, to);
    }

    /** One planned move, [kind, dir], made now if it still fits where the pieces are; the next is due MOVE_GAP on. */
    move(p, mv) {
      const t = this.t;
      p.moveAt = t + MOVE_GAP; p.calm = t + 3 + this.rand() * 5;
      let to = null;
      if (mv[0] === 'turn') to = this.turned(p, p.rot, p.x, p.y, mv[1]);
      else if (this.fits(p, p.rot, p.x, p.y + mv[1])) to = { rot: p.rot, x: p.x, y: p.y + mv[1] };
      if (!to) return false;
      this.apply(p, mv[0], to);
      return true;
    }

    /**
     * A way past the slower piece ahead: the fewest moves (up to three: lanes and turns, each one fitting where the
     * pieces are now) to a pose whose lanes are clear of slower pieces for the look-ahead, with room behind it.
     */
    plan(p, goal, depthMax) {
      const start = { rot: p.rot, x: p.x, y: p.y, mv: null, prev: null };
      let layer = [start];
      const seen = new Set([p.rot + ',' + p.x + ',' + p.y]);
      for (let depth = 0; depth < (depthMax || 3); depth++) {
        const next = [];
        const o = Math.floor(this.rand() * 4);
        for (const s of layer) {
          for (let k = 0; k < 4; k++) {
            const mv = (k + o) % 4;
            let to;
            if (mv < 2) { const dy = mv ? 1 : -1; to = this.fits(p, s.rot, s.x, s.y + dy) ? { rot: s.rot, x: s.x, y: s.y + dy } : null; }
            else to = this.turned(p, s.rot, s.x, s.y, mv === 2 ? 1 : -1);
            if (!to) continue;
            const key = to.rot + ',' + to.x + ',' + to.y;
            if (seen.has(key)) continue;
            seen.add(key);
            const n = { rot: to.rot, x: to.x, y: to.y, mv: mv < 2 ? ['shift', mv ? 1 : -1] : ['turn', mv === 2 ? 1 : -1], prev: s };
            if (goal(n) && this.roomBehind(p, n.rot, n.x, n.y)) {
              const path = [];
              for (let c = n; c.prev; c = c.prev) path.unshift(c.mv);
              return path;
            }
            next.push(n);
          }
        }
        layer = next;
      }
      return null;
    }

    /** A new piece just out of sight past the left edge, in its own orientation and at its own speed. */
    spawn() {
      if (this.pieces.length >= this.cap()) return false;
      const id = this.nextId(), sh = shapeOf(id), rot = Math.floor(this.rand() * 4), d = sh[rot];
      const pick = this.rand();
      let kind = KINDS[KINDS.length - 1];
      for (let k = 0, acc = 0; k < KINDS.length; k++) { acc += KINDS[k][0]; if (pick < acc) { kind = KINDS[k]; break; } }
      const v0 = speedAt(kind[1] + this.rand() * (kind[2] - kind[1]));
      const p = { n: this.serial + 1, id, rot, x: -1 - d.maxX, y: 0, v0, v: v0, calm: 0, plan: null, moveAt: 0, thinkAt: 0, cell: 0 };
      const lanes = ROWS - (d.maxY - d.minY), o = Math.floor(this.rand() * lanes);
      // A lane with room ahead and nobody right beside it, or else room ahead, or else any lane it fits (following).
      for (let pass = 0; pass < 3; pass++) {
        for (let k = 0; k < lanes; k++) {
          p.y = ((o + k) % lanes) - d.minY;
          if (!this.fits(p, rot, p.x, p.y)) continue;
          const g = this.ahead(p, rot, p.x, p.y), by = this._by;
          if (pass < 2 && g < 2 + (p.v - (by ? by.v : 0)) * 0.8) continue;
          if (pass < 1 && this.touches(p, rot, p.x, p.y)) continue;
          if (by) p.v = Math.min(p.v, by.v + Math.max(0, g - CLEAR - 1.6) * 1.5);
          this.serial = p.n;
          p.cell = Math.floor(p.x);
          p.calm = this.t + 2 + this.rand() * 4;
          this.pieces.push(p);
          return true;
        }
      }
      this.bag.push(id);
      return false;
    }

    /** Advances bar time by dt seconds: every piece travels, plans, turns or hops; pieces come and go. */
    step(dt) {
      this.t += dt;
      const t = this.t, P = this.pieces;
      // The next one comes in once the last is a few cells along (a spacing drawn afresh each time), so the parade
      // flows on without crowding or long empty stretches, whatever the speeds.
      const back = this.lastIn && P.includes(this.lastIn) ? this.lo(this.lastIn) : Infinity;
      if (t >= this.due && back >= this.space) {
        if (this.spawn()) { this.lastIn = P[P.length - 1]; this.space = SPACE_MIN + this.rand() * (SPACE_MAX - SPACE_MIN); }
        else this.due = t + 0.25;
      }
      // The front of the parade goes first, so nobody waits on a piece that is about to move.
      P.sort(this.byFront);
      for (const p of P) p.c0 = p.x;
      let f;
      for (const p of P) {
        const look = 3 + p.v0 * 1.1;
        // Carry on with a plan under way, a move every MOVE_GAP, while each move still fits.
        if (p.plan && t >= p.moveAt) {
          if (!this.move(p, p.plan.shift())) p.plan = null;
          if (p.plan && !p.plan.length) p.plan = null;
        }
        let gap = this.ahead(p, p.rot, p.x, p.y), by = this._by;
        // Closing on a slower piece: look for a way past.
        if (by && gap < look && by.v < p.v0 * 0.75 - 0.2 && !p.plan && t >= p.thinkAt && t >= p.moveAt) {
          const path = this.plan(p, (n) => this.ahead(p, n.rot, n.x, n.y, p.v0 * 0.75 - 0.2) > look);
          if (path && this.move(p, path.shift())) {
            p.plan = path.length ? path : null;
            gap = this.ahead(p, p.rot, p.x, p.y); by = this._by;
          } else p.thinkAt = t + 0.3;
        } else if (!p.plan && t >= p.moveAt && (f = this.tailgater(p))) {
          // A faster piece stuck behind, with no way past: step aside for it, a lane or a turn out of its way.
          // A pose that leaves the follower a way past: its own lanes clear, or a lane or turn away.
          const fl = 3 + f.v0 * 1.1, was = { rot: p.rot, x: p.x, y: p.y };
          const path = this.plan(p, (n) => {
            if (this.ahead(p, n.rot, n.x, n.y) <= CLEAR + 1) return false;
            p.rot = n.rot; p.x = n.x; p.y = n.y;
            const ok = this.ahead(f, f.rot, f.x, f.y, f.v0 * 0.75 - 0.2) > fl || !!this.plan(f, (m) => this.ahead(f, m.rot, m.x, m.y, f.v0 * 0.75 - 0.2) > fl, 2);
            p.rot = was.rot; p.x = was.x; p.y = was.y;
            return ok;
          }, 2);
          if (path && this.move(p, path.shift())) { p.plan = path.length ? path : null; gap = this.ahead(p, p.rot, p.x, p.y); by = this._by; }
          else f.thinkAt = Math.max(f.thinkAt, t + 0.3);
        } else if (!p.plan && t >= p.calm && t >= p.moveAt && gap > look && this.lo(p) >= 1 && this.hi(p) <= this.cols - FADE_OUT) {
          // Free, and in full view: now and then a hop or a turn, just because.
          p.calm = t + 2.5 + this.rand() * 6;
          let to = null, kind;
          if (this.rand() < 0.55) { kind = 'turn'; to = this.turned(p, p.rot, p.x, p.y, this.rand() < 0.7 ? 1 : -1); }
          else { kind = 'shift'; const dy = this.rand() < 0.5 ? 1 : -1; if (this.fits(p, p.rot, p.x, p.y + dy)) to = { rot: p.rot, x: p.x, y: p.y + dy }; }
          if (to && this.roomBehind(p, to.rot, to.x, to.y) && this.ahead(p, to.rot, to.x, to.y) > 2 + CLEAR && !this.touches(p, to.rot, to.x, to.y)) {
            this.apply(p, kind, to); p.moveAt = t + MOVE_GAP;
            gap = this.ahead(p, p.rot, p.x, p.y); by = this._by;
          }
        }
        // Speed: its own, eased off to follow what it cannot pass, and never into the piece ahead.
        let vt = p.v0;
        if (by) vt = Math.max(0, Math.min(vt, by.v + (gap - CLEAR - 1.6) * 1.5)); // room to turn, a cell and a half back
        p.v = vt < p.v ? Math.max(vt, p.v - 14 * dt) : Math.min(vt, p.v + 4 * dt);
        let adv = p.v * dt;
        if (by && adv > gap - CLEAR) { adv = Math.max(0, gap - CLEAR); p.v = adv / dt; }
        p.x += adv;
        this.trail(p);
      }
      // Overtakes: pairs whose order along the bar swapped this step.
      for (const a of P) for (const b of P) if (a.c0 < b.c0 && a.x > b.x) this.overtakes++;
      for (let i = P.length - 1; i >= 0; i--) if (this.lo(P[i]) >= this.cols) { P.splice(i, 1); this.exited++; }
    }

    /** Lights the cells a piece's rear has just left, in each of its lanes: the head of its rain. */
    trail(p) {
      const cell = Math.floor(p.x);
      if (cell === p.cell) return;
      const from = Math.max(p.cell + 1, cell - 12), d = shapeOf(p.id)[p.rot];
      p.cell = cell;
      // A trail some three cells long behind a drifter, ten behind a dart: brighter too, the faster it goes.
      const v = Math.max(0.5, p.v), life = Math.max(0.9, Math.min(3.6, (2.4 + v * 0.95) / v));
      const alpha = Math.min(0.7, 0.36 + v * 0.035);
      const color = L.Pieces.get(p.id).color;
      for (let c = from; c <= cell; c++) {
        for (let k = 0; k < d.rows.length; k += 2) {
          const col = c + d.rows[k + 1] - 1, row = p.y + d.rows[k];
          if (col < 0 || col >= this.cols) continue;
          const h = hash(col * 131 + row * 7 + p.n * 1009);
          if ((h & 255) < 56) continue; // gaps, so it reads as streams
          const i = this.ri; this.ri = (i + 1) % POOL;
          this.rx[i] = col; this.ry[i] = row; this.rt[i] = this.t; this.rl[i] = life * (0.75 + ((h >>> 8) & 63) / 128);
          this.ra[i] = alpha; this.rh[i] = h; this.rc[i] = color;
        }
      }
    }

    /** How many glyphs of rain are lit now. */
    rainCount() { let n = 0; for (let i = 0; i < POOL; i++) if (this.t - this.rt[i] < this.rl[i]) n++; return n; }

    /** The rain's glyphs in one colour, drawn once per size: white would need tinting every frame. */
    glyphs(color, sd) {
      const key = color + '|' + sd;
      let c = this.atlas.get(key);
      if (c) return c;
      if (this.atlas.size > 40) this.atlas.clear();
      c = document.createElement('canvas');
      c.width = sd * GLYPHS.length; c.height = sd;
      const g = c.getContext('2d');
      const font = (root.getComputedStyle && getComputedStyle(document.body).getPropertyValue('--mono-font').trim()) || 'monospace';
      g.font = '600 ' + Math.max(5, Math.round(sd * 0.84)) + 'px ' + font;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
      for (let k = 0; k < GLYPHS.length; k++) {
        // Mirrored, as the rain of code is: familiar shapes, turned strange.
        g.save(); g.translate(k * sd + sd / 2, sd / 2 + sd * 0.04); g.scale(-1, 1); g.fillText(GLYPHS[k], 0, 0); g.restore();
      }
      this.atlas.set(key, c);
      return c;
    }

    /** A coordinate on the nearest whole device pixel. */
    snap(v) { return Math.round(v * this.dpr) / this.dpr; }

    draw() {
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const look = this.look || (this.look = this.getLook());
      const light = !!(look.theme && look.theme.name === 'light');
      ctx.__dpr = this.dpr; ctx.__light = light;
      const soft = light ? 0.78 : 0.7;
      const s = this.s, left = this.left, top = this.top, cols = this.cols, dpr = this.dpr;
      const fade = (gx) => Math.max(0, Math.min(1, (gx + 1) / FADE_IN, (cols - 1 - gx) / FADE_OUT));
      // The rain first, under the pieces; none at all under reduced motion.
      if (!this.isReduced()) {
        const sd = Math.round(s * dpr), rain = light ? 0.75 : 1;
        for (let i = 0; i < POOL; i++) {
          const age = this.t - this.rt[i], life = this.rl[i];
          if (age < 0 || age >= life) continue;
          const k = 1 - age / life, col = this.rx[i];
          const a = this.ra[i] * k * k * rain * fade(col);
          if (a < 0.02) continue;
          const h = this.rh[i];
          // Some glyphs flicker to another now and then; most hold.
          const g = (h >>> 16) % 3 === 0 ? hash(h + Math.floor(age * 7)) % GLYPHS.length : (h >>> 20) % GLYPHS.length;
          ctx.globalAlpha = a;
          ctx.drawImage(this.glyphs(look.colors[this.rc[i]], sd), g * sd, 0, sd, sd, left + col * s, top + (ROWS - 1 - this.ry[i]) * s, s, s);
        }
        ctx.globalAlpha = 1;
      }
      // Quiet on the bar: the equipped palette and skin, softened, with no track or lanes drawn under them; always on
      // whole device pixels, so the cells stay crisp as they travel.
      for (const p of this.pieces) {
        const type = L.Pieces.get(p.id), color = look.colors[type.color];
        for (const [cx, cy] of type.rots[p.rot]) {
          const gx = p.x + cx, gy = ROWS - 1 - (p.y + cy);
          const alpha = soft * fade(gx);
          if (alpha <= 0.01) continue;
          L.Render.drawCell(ctx, look.skin, color, this.snap(left + gx * s), top + gy * s, s, alpha);
        }
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.look = this.getLook();
      this.resize(true);
      this.draw();
      this.last = performance.now();
      let still = 0, looked = 0;
      const loop = (now) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        if (document.hidden) { this.last = now; return; }
        // 60 fps while something moves faster than a device pixel a frame at 30, else 30.
        let fast = 0;
        for (const p of this.pieces) fast = Math.max(fast, p.v);
        const fps = fast * this.s * this.dpr > 30 ? 60 : 30;
        if (now - this.last < 1000 / fps - 2) return;
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;
        if (this.isReduced()) {
          // A still, composed frame without rain: redrawn now and then only so a change of theme or look shows.
          if ((still += dt) > 0.5) { still = 0; this.look = this.getLook(); this.draw(); }
          return;
        }
        this.step(dt);
        if ((looked += dt) > 1) { looked = 0; this.look = this.getLook(); }
        this.draw();
        this.frames++;
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  Object.assign(BarIdle, { ROWS, CLEAR, KINDS, SPACE_MIN, SPACE_MAX, MOVE_GAP, POOL, GLYPHS, speedAt });

  // ---- collapsing and expanding ----------------------------------------------------------------------------------------

  const Collapse = {
    on: false,
    idle: null,

    init(app) {
      this.app = app;
      const btn = document.getElementById('btn-collapse');
      btn.addEventListener('click', () => this.toggle());
      // Double-clicking the empty bar rolls the window up or down (in the app the panel sees that click and says so).
      document.getElementById('titlebar').addEventListener('dblclick', (e) => {
        const t = e.target;
        if (!t || !t.closest || t.closest('button, input') || !t.closest('[data-drag]')) return;
        e.preventDefault();
        this.toggle();
      });
      this.idle = new BarIdle(document.getElementById('bar-idle'), () => app.look(),
        () => app.settings.motion === 'reduced' || !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches));
      this.set(!!app.state.collapsed, true);
    },

    toggle() { this.set(!this.on); },

    set(on, first) {
      const app = this.app;
      if (on === this.on && !first) return;
      this.on = on;
      app.state.collapsed = on;
      if (!first) app.store.touch();
      if (on) {
        // Like switching away from the tab: Classic pauses, the music stops, the factory runs on unseen.
        if (app.tab === 'classic') { app.modes.classic.togglePause(true); L.Music.stop(); }
        if (app.tab === 'factory') app.modes.factory.hide();
        app.keys && app.keys.releaseAll();
        const tip = document.querySelector('#app > .tip');
        if (tip) tip.classList.add('hidden');
      }
      document.body.classList.toggle('collapsed', on);
      const btn = document.getElementById('btn-collapse');
      btn.innerHTML = on ? CHEVRON_DOWN : CHEVRON_UP;
      btn.setAttribute('aria-label', on ? 'Expand' : 'Collapse');
      btn.setAttribute('aria-expanded', String(!on));
      btn.dataset.tip = on ? 'Expand' : 'Collapse';
      if (on) this.idle.start();
      else {
        this.idle.stop();
        if (app.tab === 'factory' && !first) app.modes.factory.show();
        app.onResize();
        // Achievements earned while rolled up are told now, when their toasts can be seen (and clicked).
        if (!first) setTimeout(() => app.announceUnheard(), 300);
      }
      L.native.post('collapse', { on, height: Math.round(document.getElementById('app').getBoundingClientRect().height), animate: !first });
      app.postDragRegions();
    },
  };

  // Its key, listed after the tabs' in Settings ▸ Keys.
  if (L.KEY_HELP) {
    const at = L.KEY_HELP.findIndex(([k]) => /^⌘1/.test(k));
    L.KEY_HELP.splice(at < 0 ? L.KEY_HELP.length : at + 1, 0, ['⌘J', 'Collapse into the title bar, or expand']);
  }

  L.Collapse = Collapse;
  L.BarIdle = BarIdle;
})(typeof globalThis !== 'undefined' ? globalThis : this);
