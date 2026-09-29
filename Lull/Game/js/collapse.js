// Lull — the window rolled up into its title bar (a window shade), and the idle pieces that drift along it meanwhile.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const CHEVRON_UP = L.Icons.icon('chevUp');
  const CHEVRON_DOWN = L.Icons.icon('chevDown');

  // ---- the idle bar --------------------------------------------------------------------------------------------------
  //
  // A parade along the bar, like a game's menu backdrop: the bar is a well on its side, four lanes deep, and pieces
  // "fall" along it from left to right — each at its own steady speed (a game gravity level, from a Level 1 drift to a
  // Level 9 dart) and in its own SRS orientation. Lane changes and turns are the game's own: whole lanes, a real SRS turn
  // (the kicks that keep it in its column), and instant, as the board makes them.
  //
  // Nobody ever slows down. Speeds are steady, so where every piece will be is known ahead of time, and so is every
  // meeting: two pieces "abreast" (side by side along the bar, closer than CLEAR cells and a margin) must be in opposite
  // bands of two lanes, lying flat, for the whole of it. Each meeting is agreed when the later piece comes in — which
  // band each takes — and both get there early (PREP seconds ahead: far ahead of a dart, close ahead of a drifter), the
  // faster one moving over, the slower one stepping aside, or both, whichever is fewer moves. A piece only changes
  // band while it is abreast of nobody, and never two meetings on opposite bands too close together. A new piece comes
  // in only when all its meetings can be agreed this way (three abreast would need six lanes), so there is always a way
  // past, and a fast piece never has to brake. Between meetings free pieces hop a lane or turn now and then.
  //
  // The logic runs on a fixed tick of bar time (so it is the same at any frame rate); the drawing is at the real time,
  // every display frame, each cell at its exact (sub-pixel) place from device-resolution sprites. Behind each piece a
  // steady rain of mirrored glyphs in its colour streams back and fades over a few seconds: born continuously at the
  // rear of each of its lanes (more the faster it goes), drifting gently back, brightest at the head.

  const ROWS = 4;
  const CLEAR = 1; // empty cells kept between two pieces that share a lane
  const MARGIN = 0.3; // and a little more before two pieces count as abreast
  // Speeds as game levels (the Classic gravity curve): mostly drifters, some walkers, now and then a dart.
  const KINDS = [[0.46, 1, 2.2], [0.38, 3, 5], [0.16, 7, 9]];
  const SPACE_MIN = 5, SPACE_MAX = 13; // cells the last piece in has come along the bar before the next one comes in
  const MOVE_GAP = 0.14; // seconds between the moves of a plan (each move itself is instant, as in the game)
  const PREP = 2.2; // seconds ahead of a meeting that both pieces set off for their bands
  const MIN_GAP = 0.8; // seconds of nobody abreast a piece needs to change band between two meetings
  const TICK = 1 / 60; // the logic's fixed step
  const LONG = 12; // seconds abreast that a newcomer would rather not be, with anyone
  const OWED = 3; // seconds a dart that found no way in keeps its turn
  const FADE_IN = 4, FADE_OUT = 6; // columns over which a piece appears at the left and is gone at the right
  const BANDS = [0b0011, 0b1100]; // the lower two lanes and the upper two
  const INNER = [0b0010, 0b0100]; // each band's lane next to the other: kept clear when it can be (a flat I)
  // The rain: glyphs born per cell of stream per lane, their life (s), their drift back (cells/s), the pool.
  const RAIN_DENSITY = 0.7, RAIN_LIFE = [2.2, 3], RAIN_DRIFT = [0.9, 1.5], RAIN_IN = 0.18, RAIN_SWAP = 0.3;
  const POOL = 512; // glyphs of rain alive at once, at most
  const GLYPHS = '0123456789:=+<>ZTLJ';
  const IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  /** Cells a second at a game level: the Classic curve (seconds per row), inverted; levels may be fractional. */
  const speedAt = (l) => 1 / Math.max(0.012, Math.pow(0.8 - (l - 1) * 0.007, l - 1));
  const hash = (a) => { a = (a ^ 61) ^ (a >>> 16); a = Math.imul(a, 9); a ^= a >>> 4; a = Math.imul(a, 0x27d4eb2d); return (a ^ (a >>> 15)) >>> 0; };

  // Each shape's rotations, measured once: bounds, the lanes it covers (a bit mask, y up) and each lane's rearmost
  // cell; and its envelope along the bar, over all four rotations (turns keep their column, so it never changes).
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
    sh.e0 = Math.min(...sh.map((d) => d.minX));
    sh.e1 = Math.max(...sh.map((d) => d.maxX)) + 1;
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
      this.yields = 0; this.dodges = 0; this.meetings = 0; this.refused = 0;
      this.t = 0; this.tick = 0;
      this.pieces = [];
      this.look = null;
      this.onMove = null; // (piece, 'turn' | 'shift', from, to): every discrete move as it is made (for tests)
      this.atlas = new Map();
      // The rain: a ring of glyphs, allocated once. rx: where it was born (cells, fractional), ry: its lane, rt: when,
      // rl: its life, ra: its brightness, rv: its drift back, rh: its hash (glyph, swaps), rc: its colour slot.
      this.rx = new Float32Array(POOL); this.ry = new Int8Array(POOL); this.rt = new Float64Array(POOL);
      this.rl = new Float32Array(POOL); this.ra = new Float32Array(POOL); this.rv = new Float32Array(POOL);
      this.rh = new Uint32Array(POOL); this.rc = new Uint8Array(POOL); this.ri = 0; this.rn = 0;
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
      const wider = cols > this.cols;
      this.cols = cols;
      for (let i = this.pieces.length - 1; i >= 0; i--) if (this.lo(this.pieces[i]) >= cols) this.pieces.splice(i, 1);
      if (!this.pieces.length) { this.reset(cols); return; }
      // Wider: pieces stay on the bar longer, so meetings past the old end are agreed now.
      if (wider) this.recommit();
    }

    /** Starts the parade over, run on unseen until pieces are spread from end to end. */
    reset(cols) {
      this.cols = cols;
      this.pieces = [];
      this.bag = null;
      this.t = 0; this.tick = 0; this.due = 0; this.lastIn = null; this.space = 0;
      this.rt.fill(-1e9); this.rn = 0;
      const warm = 8 + cols / speedAt(1.4);
      for (let f = 0; f < warm * 30; f++) this.step(1 / 30);
    }

    /** A piece's cells on the bar, [col, lane] with lane 0 at the bottom (y up, like the board); col is fractional. */
    cellsOf(p) { return L.Pieces.get(p.id).rots[p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]); }

    lo(p) { return p.x + shapeOf(p.id)[p.rot].minX; }
    hi(p) { return p.x + shapeOf(p.id)[p.rot].maxX + 1; }
    /** Where a piece is at bar time t: it never changes speed, and turns keep its column. */
    xAt(p, t) { return p.x0 + p.v0 * (t - p.t0); }
    /** When it has gone past the right end. */
    exitAt(p) { return p.t0 + (this.cols - (p.x0 + shapeOf(p.id).e0)) / p.v0; }
    mask(p) { return laneMask(shapeOf(p.id)[p.rot], p.y); }
    /** Its left edge on the bar at this moment, in CSS pixels, unrounded. */
    screenX(p) { return this.left + p.x * this.s; }

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

    /**
     * When two pieces are abreast, from bar time `from` until either leaves the bar: [a, b], or null. Their envelopes
     * along the bar come within CLEAR + MARGIN cells; with steady speeds that is one stretch of time, found exactly.
     */
    abreast(p, q, from) {
      const P = shapeOf(p.id), Q = shapeOf(q.id), G = CLEAR + MARGIN;
      const hiT = Math.min(this.exitAt(p), this.exitAt(q));
      const up = Q.e1 - P.e0 + G, down = Q.e0 - P.e1 - G; // abreast while down < xp − xq < up
      const d0 = this.xAt(p, from) - this.xAt(q, from), w = p.v0 - q.v0;
      let a, b;
      if (Math.abs(w) < 1e-12) { if (d0 <= down || d0 >= up) return null; a = from; b = hiT; }
      else { const t1 = from + (down - d0) / w, t2 = from + (up - d0) / w; a = Math.max(from, Math.min(t1, t2)); b = Math.min(hiT, Math.max(t1, t2)); }
      return b > a ? [a, b] : null;
    }

    /** The bands a piece could take for a meeting over [a, b], given the ones it has agreed already (a bit set). */
    bandsFor(q, a, b, except) {
      let ok = 3;
      for (const c of q.com) if (c.with !== except && c.a < b + MIN_GAP && a < c.b + MIN_GAP) ok &= 1 << c.band;
      // A meeting about to start: it must be in that band already.
      if (a < this.t + MIN_GAP) for (let k = 0; k < 2; k++) if (this.mask(q) & ~BANDS[k]) ok &= ~(1 << k);
      return ok;
    }

    /** Agrees a meeting: `q` in band `band`, `p` in the other, over [a, b]. */
    agree(p, q, a, b, band) {
      p.com.push({ a, b, band: 1 - band, with: q.n, faster: q.v0 > p.v0 });
      q.com.push({ a, b, band, with: p.n, faster: p.v0 > q.v0 });
      this.meetings++;
    }

    /**
     * Whether a newcomer (placed, not yet on the bar) can meet everyone ahead of it: its meetings, grouped where they
     * come too close together for a change of band, each need one band for the pieces it meets, allowed by what those
     * have agreed already; it takes the other. Returns the plan ([{ band, meets: [q, a, b][] }]) or null.
     */
    meetings0(n) {
      const now = this.t, meets = [];
      for (const q of this.pieces) { const ab = this.abreast(n, q, now); if (ab) meets.push([q, ab[0], ab[1]]); }
      meets.sort((u, v) => u[1] - v[1]);
      const groups = [];
      for (const m of meets) {
        const g = groups[groups.length - 1];
        if (g && m[1] < g.b + MIN_GAP) { g.meets.push(m); g.b = Math.max(g.b, m[2]); } else groups.push({ a: m[1], b: m[2], meets: [m] });
      }
      for (const g of groups) {
        let ok = 3, cost = [0, 0];
        for (const [q, a, b] of g.meets) {
          ok &= this.bandsFor(q, a, b);
          for (let k = 0; k < 2; k++) if (this.mask(q) & ~BANDS[k]) cost[k]++; // it would have to move
        }
        if (!ok) return null;
        g.band = ok === 3 ? (cost[0] < cost[1] ? 0 : cost[1] < cost[0] ? 1 : this.rand() < 0.5 ? 0 : 1) : ok - 1; // the others' band
      }
      return groups;
    }

    /** After the bar grows: meetings that now happen before either piece leaves, agreed, or the newer piece goes. */
    recommit() {
      const P = this.pieces.slice().sort((a, b) => a.n - b.n);
      for (let j = 0; j < P.length; j++) {
        const q = P[j];
        for (let i = 0; i < j; i++) {
          const p = P[i], ab = this.abreast(q, p, this.t);
          if (!ab) continue;
          const had = p.com.filter((c) => c.with === q.n);
          const end = had.reduce((m, c) => Math.max(m, c.b), -Infinity);
          if (ab[1] <= end + 1e-9) continue;
          const a = Math.max(ab[0], end), b = ab[1];
          let ok = this.bandsFor(p, a, b, q.n);
          const okQ = this.bandsFor(q, a, b, p.n);
          ok &= (okQ & 1 ? 2 : 0) | (okQ & 2 ? 1 : 0); // q takes the other
          if (had.length) ok &= 1 << had[0].band;
          if (ok) { const band = ok === 3 ? had.length ? had[0].band : 0 : ok - 1; this.agree(q, p, a, b, band); continue; }
          this.pieces.splice(this.pieces.indexOf(q), 1);
          for (const r of this.pieces) r.com = r.com.filter((c) => c.with !== q.n);
          break;
        }
      }
    }

    /** The pose a turn lands in, as the game turns: the next SRS rotation and the first of its kicks that fits. */
    turned(p, rot, x, y, dir) {
      const type = L.Pieces.get(p.id);
      if (type.kicks === 'none') return null;
      const to = (rot + dir + 4) % 4;
      const kicks = L.Pieces.kicksFor(type, rot, to);
      for (let i = 0; i < kicks.length; i++) {
        if (kicks[i][0] !== 0) continue; // on the bar a turn keeps its column: the parade never jumps along
        const ny = y + kicks[i][1];
        if (this.fits(p, to, x, ny)) return { rot: to, x, y: ny, kick: i };
      }
      return null;
    }

    /** Makes one move — a turn or a lane — at once, as the game does. */
    apply(p, kind, to) {
      const from = { rot: p.rot, x: p.x, y: p.y };
      p.rot = to.rot; p.y = to.y;
      p.moveAt = this.t + MOVE_GAP;
      if (kind === 'turn') this.turns++; else this.shifts++;
      if (this.onMove) this.onMove(p, kind, from, { rot: p.rot, x: p.x, y: p.y });
    }

    /** The first of the fewest moves (lanes and turns, each fitting) that bring a piece into a band, or null. */
    toBand(p, band) {
      const goal = BANDS[band], sh = shapeOf(p.id);
      let layer = [{ rot: p.rot, y: p.y, first: null }];
      const seen = new Set([p.rot * 16 + p.y + 4]);
      let found = null, foundAt = -1;
      for (let depth = 0; depth < 6 && layer.length; depth++) {
        const next = [], o = Math.floor(this.rand() * 4);
        for (const s of layer) {
          for (let k = 0; k < 4; k++) {
            const mv = (k + o) % 4;
            let to;
            if (mv < 2) { const dy = mv ? 1 : -1; to = this.fits(p, s.rot, p.x, s.y + dy) ? { rot: s.rot, x: p.x, y: s.y + dy } : null; }
            else to = this.turned(p, s.rot, p.x, s.y, mv === 2 ? 1 : -1);
            if (!to || seen.has(to.rot * 16 + to.y + 4)) continue;
            seen.add(to.rot * 16 + to.y + 4);
            const n = { rot: to.rot, y: to.y, first: s.first || [mv < 2 ? 'shift' : 'turn', to] };
            if (!(laneMask(sh[to.rot], to.y) & ~goal)) { if (!(laneMask(sh[to.rot], to.y) & INNER[band])) return n.first; found = found || n.first; }
            next.push(n);
          }
        }
        if (found && foundAt >= 0 && foundAt < depth) return found; // on the lane next to the other band only if one more move will not keep off it
        if (found && foundAt < 0) foundAt = depth;
        layer = next;
      }
      return null;
    }

    /** A new piece just out of sight past the left edge, at its own speed, when it can meet everyone on the way. */
    spawn() {
      if (this.pieces.length >= this.cap()) return false;
      const id = this.nextId(), sh = shapeOf(id);
      for (let attempt = 0; attempt < 4; attempt++) {
        // A dart that found no way through is owed: it is tried again for a few seconds before anything else comes.
        let kind = KINDS[KINDS.length - 1];
        if (this.owed && this.owed.until > this.t) kind = this.owed.kind;
        else {
          const pick = this.rand();
          for (let k = 0, acc = 0; k < KINDS.length; k++) { acc += KINDS[k][0]; if (pick < acc) { kind = KINDS[k]; break; } }
        }
        const v0 = speedAt(kind[1] + this.rand() * (kind[2] - kind[1]));
        const x0 = -sh.e1 - 0.5;
        const p = { n: this.serial + 1, id, rot: 0, x: x0, x0, t0: this.t, y: 0, v0, v: v0, com: [], calm: 0, moveAt: 0, rain: 0 };
        const groups = this.meetings0(p);
        // Long, slow meetings (two drifters side by side for half a minute) would wall off the bar: rather not.
        const long = groups && attempt < 3 && groups.some((g) => g.b - g.a > LONG && g.b < this.exitAt(p) - 1e-6);
        if (!groups || long) {
          this.refused++;
          if (kind === KINDS[KINDS.length - 1] && !(this.owed && this.owed.until > this.t)) this.owed = { kind, until: this.t + OWED };
          if (this.owed && this.owed.until > this.t) return this.bag.push(id), false;
          continue;
        }
        this.owed = null;
        // Its pose: in its band already if its first meeting is near, else as it comes.
        const first = groups[0] && groups[0].a < this.t + PREP ? BANDS[1 - groups[0].band] : 15;
        const poses = [];
        for (let rot = 0; rot < 4; rot++) {
          const d = sh[rot];
          for (let y = -d.minY; y + d.maxY < ROWS; y++) if (!(laneMask(d, y) & ~first) && this.fits(p, rot, x0, y)) poses.push([rot, y]);
        }
        if (!poses.length) { this.refused++; continue; }
        // Rather not right against a neighbour, a lane above or below.
        const calm = poses.filter(([rot, y]) => !this.touches(p, rot, x0, y));
        const pool = calm.length ? calm : poses, pose = pool[Math.floor(this.rand() * pool.length)];
        p.rot = pose[0]; p.y = pose[1];
        for (const g of groups) for (const [q, a, b] of g.meets) this.agree(p, q, a, b, g.band);
        this.serial = p.n;
        p.calm = this.t + 2 + this.rand() * 4;
        this.pieces.push(p);
        return true;
      }
      this.bag.push(id);
      return false;
    }

    /** Advances bar time by dt seconds: the logic in fixed ticks, the pieces to exactly where they are at the end. */
    step(dt) {
      const end = this.t + dt, P = this.pieces;
      for (const p of P) p.c0 = p.x;
      while ((this.tick + 1) * TICK <= end + 1e-9) {
        this.tick++;
        this.t = this.tick * TICK;
        this.update();
      }
      this.t = end;
      for (const p of P) p.x = this.xAt(p, end);
      // Overtakes: pairs whose order along the bar swapped this step.
      for (const a of P) for (const b of P) if (a.c0 != null && b.c0 != null && a.c0 < b.c0 && a.x > b.x) this.overtakes++;
    }

    /** One tick: pieces come in, get to their bands for the meetings ahead, hop now and then, leave, and rain. */
    update() {
      const t = this.t, P = this.pieces;
      for (const p of P) p.x = this.xAt(p, t);
      // The next one comes in once the last is a few cells along (a spacing drawn afresh each time), so the parade
      // flows on without crowding or long empty stretches, whatever the speeds.
      const back = this.lastIn && P.includes(this.lastIn) ? this.lo(this.lastIn) : Infinity;
      if (t >= this.due && back >= this.space) {
        if (this.spawn()) { this.lastIn = P[P.length - 1]; this.space = SPACE_MIN + this.rand() * (SPACE_MAX - SPACE_MIN); }
        else this.due = t + 0.25;
      }
      for (const p of P) {
        if (p.com.some((c) => c.b < t)) p.com = p.com.filter((c) => c.b >= t);
        // The meeting under way, or else the next within PREP: be in its band.
        let c = null;
        for (const m of p.com) if (m.a <= t + PREP && (!c || m.a < c.a)) c = m;
        if (c) {
          if (t >= p.moveAt && (this.mask(p) & ~BANDS[c.band])) {
            const mv = this.toBand(p, c.band);
            if (mv) { this.apply(p, mv[0], mv[1]); if (c.faster) this.yields++; else this.dodges++; }
          }
          p.calm = Math.max(p.calm, t + 1 + this.rand() * 3);
        } else if (t >= p.calm && t >= p.moveAt && this.lo(p) >= 1 && this.hi(p) <= this.cols - FADE_OUT) {
          // Free, and in full view: now and then a hop or a turn, just because.
          p.calm = t + 2.5 + this.rand() * 6;
          let to = null, kind;
          if (this.rand() < 0.55) { kind = 'turn'; to = this.turned(p, p.rot, p.x, p.y, this.rand() < 0.7 ? 1 : -1); }
          else { kind = 'shift'; const dy = this.rand() < 0.5 ? 1 : -1; if (this.fits(p, p.rot, p.x, p.y + dy)) to = { rot: p.rot, x: p.x, y: p.y + dy }; }
          if (to && !this.touches(p, to.rot, to.x, to.y)) this.apply(p, kind, to);
        }
        this.rain(p);
      }
      for (let i = P.length - 1; i >= 0; i--) {
        if (P[i].x + shapeOf(P[i].id).e0 < this.cols) continue;
        const gone = P[i].n;
        P.splice(i, 1); this.exited++;
        for (const q of P) if (q.com.length) q.com = q.com.filter((c) => c.with !== gone);
      }
    }

    /**
     * The rain behind a piece this tick: glyphs born continuously at the rear of each of its lanes, spread over the
     * tick's own stretch of travel, so the stream never comes in steps. More of them the faster it goes.
     */
    rain(p) {
      const d = shapeOf(p.id)[p.rot], lanes = d.rows.length / 2, color = L.Pieces.get(p.id).color;
      const v = p.v0, drift = (RAIN_DRIFT[0] + RAIN_DRIFT[1]) / 2;
      p.rain += (v + drift) * RAIN_DENSITY * TICK * lanes;
      const alpha = Math.min(0.62, 0.34 + v * 0.03);
      while (p.rain >= 1) {
        p.rain -= 1;
        const h = hash(this.rn++ * 2654435761 + p.n * 40503);
        const k = (h % lanes) * 2, lane = p.y + d.rows[k];
        const age = ((h >>> 4) & 255) / 256 * TICK; // born a moment ago, somewhere along the tick
        const rv = RAIN_DRIFT[0] + ((h >>> 12) & 255) / 256 * (RAIN_DRIFT[1] - RAIN_DRIFT[0]);
        const x = this.xAt(p, this.t - age) + d.rows[k + 1] - 1 - ((h >>> 20) & 15) / 64;
        if (x < -1 || x >= this.cols) continue;
        const i = this.ri; this.ri = (i + 1) % POOL;
        this.rx[i] = x; this.ry[i] = lane; this.rt[i] = this.t - age; this.rv[i] = rv;
        this.rl[i] = RAIN_LIFE[0] + ((h >>> 24) & 255) / 256 * (RAIN_LIFE[1] - RAIN_LIFE[0]);
        this.ra[i] = alpha; this.rh[i] = h; this.rc[i] = color;
      }
    }

    /** How many glyphs of rain are lit now. */
    rainCount() { let n = 0; for (let i = 0; i < POOL; i++) if (this.t - this.rt[i] < this.rl[i]) n++; return n; }

    /** A glyph's brightness at an age: in over RAIN_IN s, then easing out over its life (brightest at the head). */
    rainAlpha(i, age) {
      const life = this.rl[i];
      if (age < 0 || age >= life) return 0;
      const k = 1 - age / life;
      return this.ra[i] * Math.min(1, age / RAIN_IN) * k * k;
    }

    /** Where a glyph is at an age: born behind a piece, drifting gently back. */
    rainX(i, age) { return this.rx[i] - this.rv[i] * age; }

    /**
     * A glyph's character at an age: [now, before, how far into the change]. A third of them change now and then (each
     * change a slow cross-fade over RAIN_SWAP s); the rest hold theirs.
     */
    rainGlyph(i, age) {
      const h = this.rh[i], G = GLYPHS.length, out = this._g || (this._g = [0, 0, 1]);
      if ((h >>> 16) % 3) { out[0] = out[1] = (h >>> 20) % G; out[2] = 1; return out; }
      const period = 1 + ((h >>> 8) & 63) / 64, n = Math.floor(age / period);
      out[0] = hash(h + n) % G; out[1] = n ? hash(h + n - 1) % G : out[0];
      out[2] = n ? Math.min(1, (age - n * period) / RAIN_SWAP) : 1;
      return out;
    }

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

    draw() {
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const look = this.look || (this.look = this.getLook());
      const light = !!(look.theme && look.theme.name === 'light');
      ctx.__dpr = this.dpr; ctx.__light = light;
      ctx.imageSmoothingEnabled = true;
      const soft = light ? 0.78 : 0.7;
      const s = this.s, left = this.left, top = this.top, cols = this.cols, dpr = this.dpr;
      const fade = (gx) => Math.max(0, Math.min(1, (gx + 1) / FADE_IN, (cols - 1 - gx) / FADE_OUT));
      // The rain first, under the pieces; none at all under reduced motion.
      if (!this.isReduced()) {
        const sd = Math.round(s * dpr), rain = light ? 0.7 : 1;
        for (let i = 0; i < POOL; i++) {
          const age = this.t - this.rt[i];
          if (age < 0 || age >= this.rl[i]) continue;
          const col = this.rainX(i, age);
          const a = this.rainAlpha(i, age) * rain * fade(col);
          if (a < 0.01) continue;
          const atlas = this.glyphs(look.colors[this.rc[i]], sd), x = left + col * s, y = top + (ROWS - 1 - this.ry[i]) * s;
          const g = this.rainGlyph(i, age);
          if (g[2] < 1) { ctx.globalAlpha = a * (1 - g[2]); ctx.drawImage(atlas, g[1] * sd, 0, sd, sd, x, y, s, s); }
          ctx.globalAlpha = a * g[2];
          ctx.drawImage(atlas, g[0] * sd, 0, sd, sd, x, y, s, s);
        }
        ctx.globalAlpha = 1;
      }
      // Quiet on the bar: the equipped palette and skin, softened, with no track or lanes drawn under them. Each cell
      // is a device-resolution sprite placed at its exact, sub-pixel spot, so the travel is even from frame to frame.
      for (const p of this.pieces) {
        const type = L.Pieces.get(p.id), color = look.colors[type.color], x = this.screenX(p);
        for (const [cx, cy] of type.rots[p.rot]) {
          const gx = p.x + cx, gy = ROWS - 1 - (p.y + cy);
          const alpha = soft * fade(gx);
          if (alpha <= 0.01) continue;
          L.Render.drawCell(ctx, look.skin, color, x + cx * s, top + gy * s, s, alpha);
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
      let still = 0, looked = 0, lag = 0, seen = 0, first = true;
      const recent = new Float64Array(15), sorted = new Float64Array(15);
      // Every display frame, paced: each step is a whole number of display frames (the frame length is the median of
      // the last few), so timer noise never shows as uneven travel; what that leaves over or short of the real clock is
      // caught up a little at a time. After a stall it simply goes on (at most a tenth of a second).
      const loop = (now) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        if (document.hidden) { this.last = now; first = true; return; }
        const real = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
        this.last = now;
        if (!real) return;
        recent[seen++ % 15] = real;
        const k = Math.min(seen, 15);
        sorted.set(recent); const med = sorted.subarray(0, k).sort()[k >> 1];
        const frame = first ? Math.min(real, 1 / 60) : med;
        first = false;
        const n = Math.max(1, Math.round(real / frame));
        lag += real - n * frame;
        if (Math.abs(lag) > 0.1) lag = 0;
        const fix = Math.max(-0.04, Math.min(0.04, lag * 0.08)) * frame;
        lag -= fix;
        const dt = n * frame + fix;
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

  Object.assign(BarIdle, { ROWS, CLEAR, KINDS, SPACE_MIN, SPACE_MAX, MOVE_GAP, PREP, MIN_GAP, TICK, POOL, GLYPHS, RAIN_LIFE, RAIN_DRIFT, RAIN_IN, speedAt });

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
        if (L.Touch && (L.Touch.recent() || L.Touch.only)) return; // a double tap on a phone: there is no window to roll up
        e.preventDefault();
        this.toggle();
      });
      this.idle = new BarIdle(document.getElementById('bar-idle'), () => app.look(),
        () => app.settings.motion === 'reduced' || !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches));
      this.set(!!app.state.collapsed, true);
      // The trackpad taken away while rolled up: there is no way back down by touch, so it opens.
      L.bus.on('input', () => { if (this.on && !this.allowed()) this.set(false); });
    },

    /** Touch alone (a phone, a tablet with nothing attached) has no window to roll up. */
    allowed() { return !(L.Touch && L.Touch.only); },

    toggle() { this.set(!this.on); },

    set(on, first) {
      const app = this.app;
      // Never rolled up by touch alone, and a save that was (brought over from the Mac) opens; the save keeps saying
      // so, for an Export back.
      const keep = !this.allowed();
      if (keep) on = false;
      if (on === this.on && !first) return;
      this.on = on;
      if (!keep) app.state.collapsed = on;
      if (!first && !keep) app.store.touch();
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

  // Its key, listed after the tabs' in Settings ▸ Keys (not by touch alone, where nothing rolls up).
  if (L.KEY_HELP) {
    const at = L.KEY_HELP.findIndex(([k]) => /^⌘1/.test(k));
    L.KEY_HELP.splice(at < 0 ? L.KEY_HELP.length : at + 1, 0, ['⌘J', 'Collapse into the title bar, or expand']);
  }

  L.Collapse = Collapse;
  L.BarIdle = BarIdle;
})(typeof globalThis !== 'undefined' ? globalThis : this);
