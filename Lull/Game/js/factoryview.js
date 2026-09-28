// Lull — the Factory floor: a small scene on the board's own plate, in the board's materials. A gantry holds one
// press per bay (each bay sized to its pieces); each press stamps its piece a mino at a time into a recessed mold
// window and drops it straight down onto the belt. The belt carries it to a cradle lift, which sets its minos one by
// one into a bin four minos wide, drawn in 12-line sections: the one filling open (more, as the height allows), the
// others closed to bars. Every full row of the bin is one line. No text is drawn here: names and numbers live in the page around it.
//
// The scene is a 35.5 × 19.5 cell grid (y down), shown from half a row down (19 rows), and taller when the page has
// the height for it: whole rows are added above (and one under the floor), for a hall and a taller bin, as
// many as the window's height gives (never a matter of what is built). The cell size always follows the width. Its still parts are painted once into two offscreen layers (the floor, and the bin's
// tower with the lift's mast), repainted only when what they show changes; a frame is those two images, the moving
// parts and the minos.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { rr, rgba, mix, ghostCell, cellSprite, FX, FONT } = Render;

  // ---- the scene, in cells ----------------------------------------------------------------------------------------

  // The scene is drawn 0.5 row up into the plate: its top half row is only ever empty (the tallest bin's mast stops
  // 1.25 rows down), so the plate shows 19 rows and the air above the gantry is no deeper than it need be.
  const COLS = 35.5, TOP = 0.5, ROWS = 19.5 - TOP;
  // A taller plate adds whole rows (never more than EMAX: the scene is at most 1.8 times as tall as it is wide). From DEEP
  // rows one of them goes under the floor; the rest go above. From HALL rows up the floor is a hall: a roof beam from
  // the post to the lift's mast, a lamp hung from it over each bay and, from WALL rows up, tall windows in the back
  // wall. The bin's tower rises into the height: the biggest bin just reaches under the roof, and the sizes still to
  // build stand over the bin as a dashed outline, one band each (see plan()).
  const EMAX = Math.floor(1.8 * COLS - ROWS), HALL = 3, DEEP = 6;
  const ROOF = { y0: 0.75, y1: 1.45 };   // the roof beam, from the scene's top edge
  const WALL = { gap: 1.5, min: 5 };     // the windows: clear of the roof and the lamps by gap, and at least min tall
  const X0 = 0.5;                    // the belt's model x = 0, in the scene
  const FY = 18.75;                  // the floor line; the ground band runs from here to the plate's edge
  const BY = 17.5;                   // the belt's surface: pieces rest on it
  const WB = 13.25;                  // the mold windows' bottoms
  const HMAX = [2, 3, 3, 4];         // each mold window's inner height (the tallest shape of its size, lying flat)
  const BEAM = { x0: 0.35, y0: 3.5, y1: 4.2 };
  const POST = { x0: 0.35, x1: 0.65 };
  const LAMP = { y: BEAM.y0 - 1.9, w: 1.9, h: 0.75, glow: 3.2 }; // a hall's lamps: the shade's top, size, and its pool
  const HOUSING = { w: 2.4, y0: 4.2, y1: 5.7 };
  const CYL = { w: 0.7, y0: 5.7, y1: 7.2 };
  const ROD = 0.28, RAM_H = 0.45, RAM_REST = 0.6;
  const LIFT = { x0: 28.75, x1: 30.25, cx: 29.5, rail: 0.2 };
  const BIN = { x0: 30.5, t0: 30.75, t1: 34.75, x1: 35, bottom: 18.5 };
  const SEC = 12;                    // rows in a section of the bin
  const PER = SEC * 4;               // minos in a section
  const LEGS = [3.5, 10.5, 17.5, 24.5];
  const ROLLERS = [X0, X0 + 27.9], ROLLER_R = 0.34; // the belt's end rollers (the far one clear of the lift's rail)

  // ---- motion (seconds) -------------------------------------------------------------------------------------------

  const PITCH = 3;                   // rows between the lift's cradles
  const EVERY = 0.22;                // a mino leaves the belt's end this often while the lift runs
  const V = PITCH / EVERY;           // the lift's speed, rows a second (about 14)
  const RAMP = 0.15;                 // the lift eases in (and out) over this long
  const HOP = 0.15, SLIDE = 0.18, SETTLE = 0.06;
  const DROP = 0.32, DROP_SETTLE = 0.08, GHOSTS_AT = DROP + 0.25, GHOSTS_FADE = 0.2;
  const STAMP_DOWN = 0.11, STAMP_HOLD = 0.07, STAMP_UP = 0.38, FLASH = 0.25;
  const SECTION = 0.42, GROW = 0.5, BUILD = 0.6, LID = 0.4;
  // Collect: a glaze, then the block lifts a row and clears (its cells shrinking, as a cleared line does in Play);
  // the loose minos ride up on top of it, and drop to the bottom once it has gone.
  const C_GLAZE = 0.12, C_RISE = 0.36, C_LOOSE = 0.46, C_FALL = 0.26, C_END = C_LOOSE + C_FALL;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
  const easeIn = (k) => k * k;
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  const cssVar = (k, dflt) => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim() || dflt; } catch (e) { return dflt; } };
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  // Pale overlays in ten steps, so a fading glaze or flash never builds a new colour string each frame.
  const WHITE = Array.from({ length: 11 }, (_, i) => 'rgba(255,255,255,' + (i / 10) * 0.3 + ')');
  const white = (a) => WHITE[Math.max(0, Math.min(10, Math.round((a / 0.3) * 10)))];

  /** Each press's mold window: left edge, width, top and height, in cells. */
  const WIN = Factory.MOLDS.map((n, k) => {
    const x = X0 + Factory.BAY_X[k] + 0.25;
    return { x, w: n + 1, y: WB - HMAX[k], h: HMAX[k], cx: x + (n + 1) / 2 };
  });

  /** A shape's cells, bottom row first and left to right: the order a press forms them in. */
  const order = new WeakMap();
  function formOrder(cells) {
    let o = order.get(cells);
    if (!o) { o = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]); order.set(cells, o); }
    return o;
  }
  /** The order the lift takes a piece's minos in: the column nearest the lift first, from the bottom up. Each mino
   *  slides straight out along the belt with nothing of the piece to its right, so its hop never crosses the minos
   *  still waiting (those above it settle down once it is clear), nor rises into the one riding up ahead of it. */
  const leaving = new WeakMap();
  function leaveOrder(cells) {
    let o = leaving.get(cells);
    if (!o) { o = cells.slice().sort((a, b) => b[0] - a[0] || a[1] - b[1]); leaving.set(cells, o); }
    return o;
  }
  /** A shape's outline as unit edges x0, y0, x1, y1 (y up) and a nudge, for the thin line round a piece that waits. */
  const outlines = new WeakMap();
  function outlineOf(cells) {
    let o = outlines.get(cells);
    if (o) return o;
    const has = new Set(cells.map(([x, y]) => x + ',' + y));
    o = [];
    for (const [x, y] of cells) {
      // Each edge with the half pixel that keeps a 1px line inside the piece (canvas y runs down).
      if (!has.has(x + ',' + (y + 1))) o.push(x, y + 1, x + 1, y + 1, 0, 0.5);
      if (!has.has(x + ',' + (y - 1))) o.push(x, y, x + 1, y, 0, -0.5);
      if (!has.has((x - 1) + ',' + y)) o.push(x, y, x, y + 1, 0.5, 0);
      if (!has.has((x + 1) + ',' + y)) o.push(x + 1, y, x + 1, y + 1, -0.5, 0);
    }
    outlines.set(cells, o);
    return o;
  }

  /** The pin, from the icon set's own drawing (parsed once; nothing is drawn if it cannot be read). */
  let PIN = null;
  function pinPath() {
    if (PIN !== null) return PIN;
    PIN = false;
    try {
      const src = L.Icons && L.Icons.I && L.Icons.I.pin, ds = src ? src.match(/ d="[^"]+"/g) : null;
      if (ds && ds.length && typeof Path2D !== 'undefined') { const p = new Path2D(); for (const d of ds) p.addPath(new Path2D(d.slice(4, -1))); PIN = p; }
    } catch (e) { PIN = false; }
    return PIN;
  }

  class FloorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.plate = canvas.closest ? canvas.closest('.fac-plate') : null;
      this.fx = new FX();
      this.t = 0;
      this.w = 1; this.h = 1; this.dpr = 1; this.cs = 8; this.ox = 0; this.oy = 0; this.plateH = 0;
      this.E = 0; this.F = 0;                    // rows added to the scene (a taller plate), and of those, under the floor
      this.K = 1; this.sig = 0.5;                // the bin's plan: sections open at once, and a closed one's height
      this.plan();
      this.slide = 0;                            // the belt's treads, in cells
      this.stampAt = [-9, -9, -9, -9];           // each ram's last stroke
      this.stampReal = [false, false, false, false];
      this.built = [-9, -9, -9, -9];             // when each press was built (it fades in)
      this.ghostsAt = [-9, -9, -9, -9];          // when each window's next ghosts start to fade in
      this.drops = new WeakMap();                // belt piece → when it left its press
      this.hover = null;                         // { kind, k } from a hotspot
      this.preview = false;                      // Collect is hovered or focused: show what it takes
      this.reduced = false;
      this.staticDraws = 0;                      // how often the still layers were painted (idle: never)
      // The lift.
      this.phi = 0; this.v = 0; this.claimed = -1;
      this.queue = [];                           // pieces at the belt's end, minos leaving one by one
      this.riders = [];                          // minos past the belt's end, until they land
      this.inflight = 0;
      this.expectLen = -1;
      this.at = { x: 0, y: 0, rh: 1 };
      // The bin's sections: how open each is (1 = the one filling), how grown (a new one grows in), where they sit.
      this.S = 0; this.o = 0;
      this.secA = new Float64Array(9); this.secFrom = new Float64Array(9); this.secTo = new Float64Array(9); this.secT0 = new Float64Array(9);
      this.secG = new Float64Array(9); this.secGT0 = new Float64Array(9);
      this.slot = new Float64Array(9); this.bottom = new Float64Array(9);
      this.holdSections = 0;
      this.mouth = BIN.bottom - SEC; this.restMouth = this.mouth;
      this.moving = false;
      this.lidK = 0;
      this.collectA = null;                      // the block lifting out of the bin
      this.catchA = null;                        // minos made while away, fading in
      this.floorC = null; this.towerC = null;
      this.floorKey = [null, 0, 0, 0, 0, 0, 0]; this.towerKey = [null, 0, 0, 0, 0, 0, 0];
      this.styTheme = null; this.sty = null; this.sprites = new Map();
    }

    // ---- layout -----------------------------------------------------------------------------------------------------

    /**
     * Fits the scene to the plate's width; the plate's height follows the cell size, plus whole rows above for as much
     * of room (the height the page can give it, in px) as there is, up to EMAX. Nothing feeds back: room never
     * depends on the plate's own height.
     */
    resize(room) {
      const box = this.canvas.parentElement || this.canvas;
      const w = Math.max(1, Math.round(box.clientWidth));
      // Whole cells, 8 to 22 px; only a plate too narrow for 8 (a browser window near 300 px) goes smaller, so the
      // whole scene always fits across it.
      const cs = Math.max(6, Math.min(22, Math.floor(w / COLS)));
      const E = room > 0 ? Math.max(0, Math.min(EMAX, Math.floor((room - cs * ROWS) / cs))) : 0;
      const ph = Math.round(cs * (ROWS + E));
      if (this.plate && this.plateH !== ph) { this.plate.style.height = ph + 'px'; this.plateH = ph; }
      const h = Math.max(1, ph - 2); // inside the plate's hairline
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      if (E !== this.E) { this.E = E; this.F = E >= DEEP ? 1 : 0; this.plan(); }
      this.cs = cs;
      this.ox = Math.round((w - COLS * cs) / 2);
      this.oy = -Math.round(this.top * cs);
    }

    /**
     * The bin's plan for this height (the window's alone, so it never changes with what is built): K sections open at
     * once and the rest closed to sig rows, as many open as leave a closed one at least a row (at most two), so the
     * biggest bin just reaches the highest mouth. Every size up is then taller than the last by whole or half rows,
     * the second by a whole section; a scene too short for that keeps one open and half-row slivers.
     */
    plan() {
      const T = BIN.bottom - this.mouthTop, n = Factory.BIN_ROWS[Factory.BIN_ROWS.length - 1] / SEC;
      let K = 1, sig = Math.max(0.5, Math.min(2, Math.floor((2 * (T - SEC)) / (n - 1)) / 2));
      for (let k = 5; k > 1; k--) {
        const s = Math.min(2, Math.floor((2 * (T - SEC * k)) / (n - k)) / 2);
        if (s >= 1) { K = k; sig = s; break; }
      }
      this.K = K; this.sig = sig;
    }

    /** The highest the bin's mouth may be, in cells: under the roof in a hall, the lift's head wheel kept clear. */
    get mouthTop() { return this.top + (this.hall ? ROOF.y1 + 1.55 : 2); }

    /** The bin's height at rest, in cells, for S sections. */
    binHeight(S) { const k = Math.min(S, this.K); return k * SEC + (S - k) * this.sig; }

    /** A closed section's bar (a full one in its top row's colours, an empty one as an outline), in px. */
    barH() { return Math.max(2, this.px(Math.min(0.85, 0.4 + 0.3 * (this.sig - 0.5)) * this.cs)); }

    /** The scene's top edge, in cells (above 0 once rows are added). */
    get top() { return TOP - this.E + this.F; }
    /** Whether the scene is tall enough to be a hall, with lamps hung over the bays. */
    get hall() { return this.E - this.F >= HALL; }

    /** The bin's mouth at rest, in cells, for the model's bin. */
    restMouthOf(f) { return BIN.bottom - this.binHeight(Factory.BIN_ROWS[f.binLevel] / SEC); }

    X(c) { return this.ox + c * this.cs; }
    Y(r) { return this.oy + r * this.cs; }
    /** A length in CSS px, snapped to the device pixel grid. */
    px(v) { return Math.round(v * this.dpr) / this.dpr; }

    /** A hotspot's rectangle in CSS px (relative to the plate): a bay (housing and window), or the bin and its mouth. */
    rect(kind, k, f) {
      const cs = this.cs;
      if (kind === 'bin') {
        const top = (f ? this.restMouthOf(f) : this.restMouth) - 0.5;
        return { x: this.X(BIN.x0 - 0.35), y: this.Y(top), w: (BIN.x1 - BIN.x0 + 0.7) * cs, h: (FY - top) * cs };
      }
      const b = WIN[k];
      return { x: this.X(b.x - 0.2), y: this.Y(HOUSING.y0 - 0.2), w: (b.w + 0.4) * cs, h: (WB + 0.3 - HOUSING.y0 + 0.2) * cs };
    }

    /** A number that changes whenever a hotspot would move. */
    layoutKey(f) { return ((((this.w * 100 + this.cs) * 1000 + this.ox) * 10 + f.presses) * 10 + f.binLevel) * 100 + this.E; }

    // ---- the bin's sections -----------------------------------------------------------------------------------------

    /** How many minos are drawn in the bin: everything but those still on their way up the lift. */
    landed(f) { return Math.max(0, f.bin.length - this.inflight); }

    /** Eases each section toward open (the one filling) or a sliver, and a taller bin's new sections up into place. */
    sections(f, landed) {
      const S = Factory.BIN_ROWS[f.binLevel] / SEC, t = this.t, reduced = this.reduced;
      const o = Math.min(S - 1, Math.floor(landed / PER));
      // The open window: the one filling and, as the height allows, the full ones under it (or the empty ones above).
      const K = Math.min(S, this.K), lo = Math.max(0, Math.min(o - K + 1, S - K));
      if (S !== this.S) {
        const grow = this.S > 0 && S > this.S && !reduced;
        for (let k = 0; k < 9; k++) {
          if (k >= S) { this.secA[k] = this.secTo[k] = this.secFrom[k] = 0; this.secG[k] = 0; }
          else if (k >= this.S) { this.secA[k] = this.secFrom[k] = this.secTo[k] = 0; this.secG[k] = grow ? 0 : 1; this.secGT0[k] = t; }
          else if (!grow) this.secG[k] = 1;
        }
        if (!grow) for (let k = 0; k < S; k++) { const a = k >= lo && k < lo + K ? 1 : 0; this.secA[k] = this.secFrom[k] = this.secTo[k] = a; }
        this.S = S;
      }
      let moving = false, H = 0;
      for (let k = 0; k < S; k++) {
        const want = k >= lo && k < lo + K ? 1 : 0;
        if (this.secTo[k] !== want && t >= this.holdSections) {
          this.secFrom[k] = this.secA[k]; this.secTo[k] = want; this.secT0[k] = t;
          if (reduced) this.secA[k] = this.secFrom[k] = want;
        }
        if (this.secA[k] !== this.secTo[k]) {
          const e = clamp01((t - this.secT0[k]) / SECTION);
          this.secA[k] = e >= 1 || reduced ? this.secTo[k] : this.secFrom[k] + (this.secTo[k] - this.secFrom[k]) * easeInOut(e);
          moving = true;
        }
        if (this.secG[k] < 1) {
          const e = reduced ? 1 : clamp01((t - this.secGT0[k]) / GROW);
          this.secG[k] = e >= 1 ? 1 : easeOut(e);
          moving = true;
        }
        const slot = this.secG[k] * (this.sig + (SEC - this.sig) * this.secA[k]);
        this.slot[k] = slot;
        this.bottom[k] = BIN.bottom - H;
        H += slot;
      }
      this.o = o;
      this.mouth = BIN.bottom - H;
      this.restMouth = this.restMouthOf(f);
      this.moving = moving;
    }

    /** Where mino i of the bin sits: its cell's left edge and bottom, in cells, and its row height. */
    slotOf(i, out) {
      const k = Math.min(this.S - 1, Math.floor(i / PER)), j = i - k * PER, rh = this.slot[k] / SEC;
      out.x = BIN.t0 + (i % 4);
      out.y = this.bottom[k] - Math.floor(j / 4) * rh;
      out.rh = rh;
      return out;
    }

    /** The top of what Collect would take, in cells: the last full row of the open section (or the slivers under it). */
    washTop(landed) {
      const rows = Math.floor(landed / 4), o = Math.min(this.S - 1, Math.floor(landed / PER));
      return this.bottom[o] - Math.max(0, rows - o * SEC) * (this.slot[o] / SEC);
    }

    // ---- events -----------------------------------------------------------------------------------------------------

    /** Step events become motion: rams stamp, pieces drop to the belt, minos ride the lift. */
    events(evs, f, reduced) {
      this.reduced = !!reduced;
      let entered = 0;
      for (let i = 0; i < evs.length; i++) if (evs[i].kind === 'enter') entered += evs[i].item.n;
      if (this.expectLen >= 0 && f.bin.length !== this.expectLen + entered) this.flushLift();
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        if (e.kind === 'mino') { this.stampAt[e.k] = this.t; this.stampReal[e.k] = true; }
        else if (e.kind === 'drop') { this.drops.set(e.item, this.t); this.ghostsAt[e.k] = this.t + GHOSTS_AT; }
        else if (e.kind === 'enter' && !this.reduced) this.enter(e.item);
      }
      // The pieces that just went in are the bin's last minos: count their places back from its end.
      let end = f.bin.length;
      for (let i = this.queue.length - 1; i >= 0 && this.queue[i].idx0 < 0; i--) { end -= this.queue[i].item.n; this.queue[i].idx0 = end; }
      this.expectLen = f.bin.length;
    }

    /** A piece has gone in (in the model): it waits at the belt's end and leaves a mino at a time. */
    enter(item) {
      // At most two pieces wait; past that, everything on the lift lands at once rather than keep the picture behind.
      if (this.queue.length >= 2) this.flushLift();
      const cells = leaveOrder(Factory.shapes(item.n)[item.s]);
      this.queue.push({ item, cells, color: item.c, x: X0 + Factory.BELT.len - Factory.widthOf(item), idx0: -1, next: 0, y: new Float64Array(cells.length), vy: new Float64Array(cells.length) });
      this.inflight += item.n;
    }

    /** Everything on the lift lands at once (a collect, a bigger bin, time away, a tab change). */
    flushLift() {
      this.queue.length = 0;
      this.riders.length = 0;
      this.inflight = 0;
      this.v = 0;
      this.expectLen = -1;
    }

    /** Every passing motion finished at once (the tab is left or shown): the view's clock stops while it is away, so
     *  nothing half-played may resume on return. The lift lands, a collect ends, sections snap to their places. */
    settle() {
      this.flushLift();
      this.collectA = null; this.catchA = null; this.holdSections = 0;
      this.fx.clear();
      this.drops = new WeakMap();
      for (let k = 0; k < 4; k++) { this.stampAt[k] = -9; this.stampReal[k] = false; this.built[k] = -9; this.ghostsAt[k] = -9; }
      this.S = 0; // the next frame lays the sections out afresh, without easing
      this.towerKey[0] = null;
    }

    builtPress(k) {
      this.built[k] = this.t;
      if (!this.reduced) { this.stampAt[k] = this.t + BUILD; this.stampReal[k] = false; }
    }

    // ---- the lift ---------------------------------------------------------------------------------------------------

    liftStep(dt) {
      const q = this.queue, riders = this.riders, at = this.at;
      let busy = q.length > 0, hopping = false;
      for (let i = 0; i < riders.length; i++) { if (riders[i].st <= 1) busy = true; if (riders[i].st === 0) hopping = true; }
      // The chain eases in and out; its cradles move only while a mino rides.
      const acc = V / RAMP;
      this.v = busy ? Math.min(V, this.v + acc * dt) : Math.max(0, this.v - acc * dt);
      this.phi += this.v * dt;
      if (this.phi > 3e6) this.phi -= 3e6;
      const exitY = this.mouth - 1.25, track = BY - exitY;
      // When the next cradle is a hop away from the bottom, the next mino leaves the belt's end for it.
      if (q.length && this.v > 0 && !hopping) {
        const cid = Math.ceil(this.phi / PITCH - 1e-9), dist = cid * PITCH - this.phi;
        if (cid > this.claimed && dist <= V * HOP) {
          const p = q[0], j = p.next, c = p.cells[j];
          riders.push({ st: 0, color: p.color, idx: p.idx0 + j, cid, d0: Math.max(0.05, dist), fx: p.x + c[0], fy: BY - c[1] + p.y[j], t0: this.t, dur: 0, x: 0, y: 0 });
          this.claimed = cid;
          hopping = true;
          p.next++;
          if (p.next >= p.cells.length) q.shift();
        }
      }
      // What is left of the piece settles: a mino whose support has gone drops onto the belt (once the one that left
      // from under it is clear).
      if (q.length && !hopping) {
        const p = q[0];
        for (let j = p.next; j < p.cells.length; j++) {
          const cx = p.cells[j][0], cy = p.cells[j][1];
          let below = 0;
          for (let i = p.next; i < p.cells.length; i++) if (p.cells[i][0] === cx && p.cells[i][1] < cy) below++;
          const fall = cy - below;
          if (p.y[j] < fall) { p.vy[j] += 60 * dt; p.y[j] = Math.min(fall, p.y[j] + p.vy[j] * dt); }
        }
      }
      // Each mino: hop into its cradle, ride up, slide over the chute, fall to its slot, settle.
      for (let i = 0; i < riders.length; i++) {
        const r = riders[i];
        if (r.st === 0) {
          // Out along the belt into the cradle as it comes round. A mino still settling (nothing is under it) drops to
          // the belt first, so it reaches the lift low, well under the one riding up ahead.
          const k = clamp01(1 - (r.cid * PITCH - this.phi) / r.d0);
          r.x = r.fx + (LIFT.cx - 0.5 - r.fx) * easeInOut(k);
          r.y = r.fy + (BY - r.fy) * easeOut(Math.min(1, k * 1.6));
          if (k >= 1) r.st = 1;
        }
        if (r.st === 1) {
          const s = this.phi - r.cid * PITCH;
          r.x = LIFT.cx - 0.5; r.y = BY - s;
          if (s >= track) { r.st = 2; r.t0 = this.t; r.y = exitY; }
        }
        if (r.st === 2) {
          const k = clamp01((this.t - r.t0) / SLIDE), e = easeInOut(k);
          this.slotOf(r.idx, at);
          r.x = LIFT.cx - 0.5 + (at.x - (LIFT.cx - 0.5)) * e;
          r.y = exitY + (this.mouth - exitY) * e;
          if (k >= 1) { r.st = 3; r.t0 = this.t; r.dur = 0.12 * Math.sqrt(Math.max(0.25, at.y - this.mouth)); }
        }
        if (r.st === 3) {
          const k = clamp01((this.t - r.t0) / r.dur);
          this.slotOf(r.idx, at);
          r.x = at.x; r.y = this.mouth + (at.y - this.mouth) * easeIn(k);
          if (k >= 1) { r.st = 4; r.t0 = this.t; }
        }
        if (r.st === 4) {
          this.slotOf(r.idx, at);
          r.x = at.x; r.y = at.y;
          if (this.t - r.t0 >= SETTLE) r.st = 5;
        }
      }
      // Landed, in order: they join the bin's own drawing.
      while (riders.length && riders[0].st === 5) { riders.shift(); this.inflight--; }
      if (this.inflight < 0) this.inflight = 0;
    }

    // ---- collecting and time away -----------------------------------------------------------------------------------

    /**
     * What Collect takes, as drawn now: the open section's full rows (cells) and the full sections under it (their
     * slivers), and the loose minos left over. Taken just before the model collects.
     */
    snapshot(f, look) {
      const landed = this.landed(f), rows = Math.floor(landed / 4), cs = this.cs, at = { x: 0, y: 0, rh: 1 };
      const cells = [], bars = [], loose = [];
      for (let i = 0; i < landed; i++) {
        const k = Math.floor(i / PER), color = look.colors[parseInt(f.bin[i], 16)] || look.theme.accent;
        this.slotOf(i, at);
        if (i >= rows * 4) loose.push({ x: at.x, y: at.y, color });
        else if (this.secA[k] >= 0.5) cells.push({ x: this.px(this.X(at.x)), y: this.px(this.Y(at.y - at.rh)), w: cs, h: Math.max(1, this.px(at.rh * cs)), color });
        else if (i % PER >= PER - 4) bars.push({ x: this.px(this.X(at.x)), y: this.px(this.Y(this.bottom[k] - 0.05)) - this.barH(), w: cs, h: this.barH(), color });
      }
      return { cells, bars, loose, rows, top: this.washTop(landed) };
    }

    /** The block lifts out as one: a glaze, the equipped clear effect, a rise and a fade; loose minos fall. */
    collected(snap, look, reduced) {
      this.flushLift();
      this.collectA = { t0: this.t, snap, reduced: !!reduced, burst: false, effect: look.effect };
      // The sections keep their places a moment, then ease down so the one filling is at the bottom again.
      this.holdSections = reduced ? 0 : this.t + C_LOOSE;
    }

    /** Minos made while away, fading in row by row (the page counts the numbers up beside them). */
    caughtUp(from, to) {
      if (this.reduced || to <= from) { this.catchA = null; return; }
      const rows = Math.ceil(to / 4) - Math.floor(from / 4);
      this.catchA = { t0: this.t, from, to, row0: Math.floor(from / 4), stagger: Math.min(0.02, 0.3 / Math.max(1, rows)) };
    }

    /** Whether anything is on its way right now (a lift running, a block lifting, sections easing). */
    get busy() { return !!(this.collectA || this.catchA || this.riders.length || this.queue.length || this.moving); }

    // ---- materials --------------------------------------------------------------------------------------------------

    style(th) {
      if (th === this.styTheme && this.sty) return this.sty;
      this.styTheme = th;
      const light = th.name === 'light';
      const warn = cssVar('--warn', light ? '#b8741a' : '#f2c27d');
      const fg = th.fg || (light ? '#1a2030' : '#eceff5');
      this.sty = {
        light, warn, fg, accent: th.accent,
        accentInk: light ? mix(th.accent, '#1a2030', 0.45) : th.accent,
        ink: rgba(fg, light ? 0.24 : 0.17), ink2: rgba(fg, light ? 0.11 : 0.08),
        // Light: white parts on a white plate need a little tone of their own (a cool grey toward the bottom and a
        // firmer hairline) to stand clear of it.
        top: light ? '#fcfdfe' : 'rgba(255,255,255,0.075)', bot: light ? '#e9edf3' : 'rgba(255,255,255,0.035)',
        base: light ? '#ffffff' : (th.plateBase || 'rgba(20,25,36,0.95)'),
        solid: light ? '#eef1f6' : '#262b37',
        hi: th.plateHi || 'rgba(255,255,255,0.16)', hair: light ? 'rgba(22,32,60,0.26)' : (th.plateLine || 'rgba(255,255,255,0.085)'),
        chain: rgba(fg, light ? 0.24 : 0.08), belt: light ? 'rgba(22,32,60,0.07)' : null,
        shadow: th.plateShadow || 'rgba(0,0,0,0.5)', side: light ? 'rgba(22,32,60,0.07)' : 'rgba(0,0,0,0.18)',
        well0: th.wellTop || th.well, well1: th.wellBottom || th.well, shade: th.innerShade || 'rgba(0,0,0,0.3)',
        rim: th.rim || th.line, rimHi: th.rimHi || 'rgba(255,255,255,0.05)', grid: th.grid,
        ground: light ? 'rgba(22,32,60,0.03)' : 'rgba(0,0,0,0.14)',
        // The hall's lamps: lit in the accent, a soft pool of it round them.
        lamp: rgba(th.accent, light ? 0.9 : 0.95), glow: rgba(th.accent, light ? 0.22 : 0.12), glow0: rgba(th.accent, 0),
        wash: rgba(th.accent, 0.1), washLine: rgba(th.accent, 0.55), warm: rgba(warn, 0.6),
      };
      this.sprites.clear();
      return this.sty;
    }

    /** A raised part, in the plate's material (Board.drawPlate in render.js): its wash, a line of light along the top,
     *  a hairline and, in the still layers, a soft contact shadow. */
    raised(c, x, y, w, h, r, shadow) {
      const S = this.sty, cs = this.cs;
      if (w <= 0 || h <= 0) return;
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      if (shadow) {
        c.save();
        c.shadowColor = S.shadow; c.shadowBlur = 0.5 * cs; c.shadowOffsetY = 0.2 * cs;
        c.fillStyle = S.base; rr(c, x, y, w, h, r); c.fill();
        c.restore();
      } else { c.fillStyle = S.base; rr(c, x, y, w, h, r); c.fill(); }
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, S.top); g.addColorStop(1, S.bot);
      c.fillStyle = g; rr(c, x, y, w, h, r); c.fill();
      if (h >= 3 && w >= 3) {
        c.save(); rr(c, x, y, w, h, r); c.clip();
        c.fillStyle = S.hi; c.fillRect(x, y, w, 1);
        c.restore();
      }
      c.strokeStyle = S.hair; c.lineWidth = 1;
      rr(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5)); c.stroke();
    }

    /** A recessed tray, as the board's side trays are drawn (the tray in Board.drawSide, render.js): the well's wash,
     *  a shadow under the top edge and a fine rim; a grid when given one. */
    recessed(c, x, y, w, h, gx, gb, rows) {
      const S = this.sty, cs = this.cs, r = Math.max(3, Math.min(8, 0.3 * cs));
      c.save();
      rr(c, x, y, w, h, r); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, S.well0); g.addColorStop(1, S.well1);
      c.fillStyle = g; c.fillRect(x, y, w, h);
      if (rows) {
        c.strokeStyle = S.grid; c.lineWidth = 1; c.beginPath();
        for (let px = gx + cs; px < x + w - 1; px += cs) { const p = this.px(px) + 0.5; c.moveTo(p, y); c.lineTo(p, y + h); }
        for (let i = 1; i < rows; i++) { const p = this.px(gb - i * cs) + 0.5; c.moveTo(x, p); c.lineTo(x + w, p); }
        c.stroke();
      }
      const sh = c.createLinearGradient(0, y, 0, y + 0.6 * cs);
      sh.addColorStop(0, S.shade); sh.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sh; c.fillRect(x, y, w, 0.6 * cs);
      c.restore();
      c.strokeStyle = S.rim; c.lineWidth = 1;
      rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
    }

    disc(c, x, y, r, shadow) {
      const S = this.sty;
      c.save();
      if (shadow) { c.shadowColor = S.shadow; c.shadowBlur = 0.4 * this.cs; c.shadowOffsetY = 0.15 * this.cs; }
      c.fillStyle = S.base; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.restore();
      const g = c.createLinearGradient(0, y - r, 0, y + r);
      g.addColorStop(0, S.top); g.addColorStop(1, S.bot);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = S.hair; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r - 0.5, 0, Math.PI * 2); c.stroke();
    }

    /** A small raised part painted once (a ram's head, the lid), reused every frame. */
    sprite(name, w, h, r) {
      const key = name + '|' + w + '|' + h + '|' + this.dpr;
      let s = this.sprites.get(key);
      if (!s) {
        const d = this.dpr;
        s = makeCanvas(Math.ceil(w * d), Math.ceil(h * d));
        const c = s.getContext('2d'); c.scale(d, d);
        this.raised(c, 0, 0, w, h, r, false);
        this.sprites.set(key, s);
      }
      return s;
    }

    // ---- the still layers -------------------------------------------------------------------------------------------

    /** Everything that stands still: ground, gantry, housings, cylinders, mold windows, the belt's frame, the bays. */
    paintFloor(c, f, shown) {
      const S = this.sty, cs = this.cs, X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      const bx0 = X(X0), bx1 = X(X0 + Factory.BELT.len);
      // The ground everything stands on, edge to edge.
      c.fillStyle = S.ground; c.fillRect(0, Y(FY), this.w, this.h - Y(FY));
      c.fillStyle = S.ink2; c.fillRect(0, Y(FY), this.w, 1);
      // A hall: its windows and lamps behind everything, the post up to the roof beam.
      const hall = this.hall, roof = this.top + ROOF.y0;
      if (hall) { this.paintWindows(c); this.paintLamps(c, shown, f); }
      // The post, behind the belt.
      const py = hall ? roof : BEAM.y0;
      this.raised(c, X(POST.x0), Y(py), X(POST.x1) - X(POST.x0), Y(FY) - Y(py) + 1, 1, true);
      if (hall) this.raised(c, X(BEAM.x0), Y(roof), X(LIFT.x0 + 0.1) - X(BEAM.x0), Y(this.top + ROOF.y1) - Y(roof), 2, true);
      // The belt: legs, frame, the recessed strip and a roller at each end.
      for (const lx of LEGS) this.raised(c, X(X0 + lx - 0.15), Y(18.1), X(X0 + lx + 0.15) - X(X0 + lx - 0.15), Y(FY) - Y(18.1) + 1, 1, true);
      this.raised(c, bx0, Y(17.9), bx1 - bx0, Y(18.25) - Y(17.9), 2, true);
      this.recessed(c, bx0, Y(BY), bx1 - bx0, Y(17.9) - Y(BY) + 1);
      if (S.belt) { c.fillStyle = S.belt; c.fillRect(bx0 + 1, Y(BY) + 1, bx1 - bx0 - 2, Y(17.9) - Y(BY) - 1); }
      c.fillStyle = S.rimHi; c.fillRect(bx0 + 3, Y(BY), bx1 - bx0 - 6, 1);
      for (const rx of ROLLERS) this.disc(c, this.X(rx), this.Y(17.85), ROLLER_R * cs, true);
      // The gantry beam, from the post to the lift's rail.
      this.raised(c, X(BEAM.x0), Y(BEAM.y0), X(LIFT.x0 + 0.1) - X(BEAM.x0), Y(BEAM.y1) - Y(BEAM.y0), 2, true);
      for (let k = 0; k < 4; k++) {
        if (k < shown) this.paintPress(c, k, true);
        else this.paintBay(c, k, f);
      }
    }

    /** The hall's back wall: a tall window behind each bay, two panes wide, barred every few rows (whole rows, clear of
     *  the roof and the lamps); quieter than anything on the floor. Only when the hall has the height for them. */
    paintWindows(c) {
      const S = this.sty, X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      const y0 = Math.ceil(this.top + ROOF.y1 + WALL.gap), y1 = Math.floor(LAMP.y - 0.25 - WALL.gap);
      if (y1 - y0 < WALL.min) return;
      const bars = Math.max(1, Math.round((y1 - y0) / 4));
      c.save();
      c.globalAlpha = S.light ? 0.6 : 0.4;
      for (let k = 0; k < 4; k++) {
        const b = WIN[k], x0 = X(b.x), x1 = X(b.x + b.w), top = Y(y0), bot = Y(y1);
        this.recessed(c, x0, top, x1 - x0, bot - top);
        c.fillStyle = S.rim;
        const mx = X(b.cx);
        c.fillRect(mx, top + 1, 1, bot - top - 2);
        for (let i = 1; i < bars; i++) c.fillRect(x0 + 1, Y(y0 + ((y1 - y0) * i) / bars), x1 - x0 - 2, 1);
      }
      c.restore();
    }

    /** The hall's lamps: one over each bay, hung from the roof beam, low over the gantry. A built press's lamp is lit,
     *  a soft pool of light round it; over a bay not built yet it is only an outline, dashed like the bay
     *  (quieter past the next one). */
    paintLamps(c, shown, f) {
      const S = this.sty, cs = this.cs, X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      const ly = LAMP.y, hw = LAMP.w / 2, hang = Y(this.top + ROOF.y1);
      for (let k = 0; k < 4; k++) {
        const b = WIN[k], cx = this.X(b.cx), lit = k < shown, by = this.Y(ly + LAMP.h);
        const x0 = this.X(b.cx - hw), x1 = this.X(b.cx + hw), top = this.Y(ly), rx = hw * cs, ry = by - top, px = X(b.cx);
        if (!lit) {
          c.save();
          c.globalAlpha = k === f.presses ? 1 : 0.45;
          c.fillStyle = S.ink2; c.fillRect(px - 0.5, hang, 1, Y(ly - 0.25) - hang);
          c.setLineDash([3, 3]); c.strokeStyle = S.ink; c.lineWidth = 1;
          c.beginPath(); c.ellipse(cx, by - 0.5, rx - 0.5, ry - 0.5, 0, Math.PI, 0); c.closePath(); c.stroke();
          c.restore();
          continue;
        }
        // The pool of light round the shade.
        const g = c.createRadialGradient(cx, by, 0, cx, by, LAMP.glow * cs);
        g.addColorStop(0, S.glow); g.addColorStop(1, S.glow0);
        c.fillStyle = g; c.fillRect(cx - LAMP.glow * cs, by - LAMP.glow * cs, 2 * LAMP.glow * cs, 2 * LAMP.glow * cs);
        c.fillStyle = S.ink; c.fillRect(px - 0.5, hang, 1, Y(ly - 0.2) - hang);
        // The shade: a low dome on a short collar, in the plate's material; under it, the lamp's line of light.
        this.raised(c, X(b.cx - 0.2), Y(ly - 0.25), X(b.cx + 0.2) - X(b.cx - 0.2), Y(ly + 0.05) - Y(ly - 0.25), 1, false);
        c.save();
        c.shadowColor = S.shadow; c.shadowBlur = 0.5 * cs; c.shadowOffsetY = 0.2 * cs;
        c.fillStyle = S.base; c.beginPath(); c.ellipse(cx, by, rx, ry, 0, Math.PI, 0); c.closePath(); c.fill();
        c.restore();
        const g2 = c.createLinearGradient(0, top, 0, by);
        g2.addColorStop(0, S.top); g2.addColorStop(1, S.bot);
        c.fillStyle = g2; c.beginPath(); c.ellipse(cx, by, rx, ry, 0, Math.PI, 0); c.closePath(); c.fill();
        c.strokeStyle = S.hair; c.lineWidth = 1; c.beginPath(); c.ellipse(cx, by - 0.5, rx - 0.5, ry - 0.5, 0, Math.PI, 0); c.closePath(); c.stroke();
        c.fillStyle = S.lamp;
        const lh = Math.max(2, Math.round(0.2 * cs));
        rr(c, x0 + 0.15 * cs, by - 1, x1 - x0 - 0.3 * cs, lh, 1); c.fill();
      }
    }

    /** A built press's still parts: cylinder, housing, and the mold window with its grid. */
    paintPress(c, k, shadow) {
      const cs = this.cs, b = WIN[k], X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      const hx = b.cx - HOUSING.w / 2, cx0 = X(b.cx - CYL.w / 2), cx1 = X(b.cx + CYL.w / 2);
      this.raised(c, cx0, Y(CYL.y0 - 0.1), cx1 - cx0, Y(CYL.y1) - Y(CYL.y0 - 0.1), 2, shadow);
      // The cylinder's round side: a shade down its right.
      const sx = X(b.cx + CYL.w / 2 - CYL.w * 0.4);
      c.fillStyle = this.sty.side; c.fillRect(sx, Y(CYL.y0), cx1 - sx - 1, Y(CYL.y1) - Y(CYL.y0) - 1);
      this.raised(c, X(hx), Y(HOUSING.y0), X(hx + HOUSING.w) - X(hx), Y(HOUSING.y1) - Y(HOUSING.y0), Math.max(3, 0.3 * cs), shadow);
      const wx = X(b.x), wy = Y(b.y), wb = Y(WB);
      this.recessed(c, wx, wy, X(b.x + b.w) - wx, wb - wy, wx, wb, b.h);
    }

    /** An empty bay: the housing and window, dashed (quieter past the next one). */
    paintBay(c, k, f) {
      const cs = this.cs, b = WIN[k], S = this.sty, X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      const hx = b.cx - HOUSING.w / 2;
      c.save();
      c.globalAlpha = k === f.presses ? 1 : 0.45;
      c.setLineDash([3, 3]); c.strokeStyle = S.ink; c.lineWidth = 1;
      rr(c, X(hx) + 0.5, Y(HOUSING.y0) + 0.5, X(hx + HOUSING.w) - X(hx) - 1, Y(HOUSING.y1) - Y(HOUSING.y0) - 1, Math.max(3, 0.3 * cs)); c.stroke();
      rr(c, X(b.x) + 0.5, Y(b.y) + 0.5, X(b.x + b.w) - X(b.x) - 1, Y(WB) - Y(b.y) - 1, Math.max(3, Math.min(8, 0.3 * cs))); c.stroke();
      c.restore();
    }

    /** The bin's tower and the lift's mast: rails, wheels, chute, walls and ears, plinth, and the tray (with the open
     *  section's grid and the empty sections' outlines). */
    paintTower(c, shadow) {
      const S = this.sty, cs = this.cs, X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      const mouth = this.mouth, exitY = mouth - 1.25, mast = this.hall ? this.top + ROOF.y0 : Math.min(3.25, exitY);
      // The mast: two raised rails, a wheel at each end of the chain.
      this.raised(c, X(LIFT.x0), Y(mast), X(LIFT.x0 + LIFT.rail) - X(LIFT.x0), Y(FY) - Y(mast) + 1, 1, shadow);
      this.raised(c, X(LIFT.x1 - LIFT.rail), Y(mast), X(LIFT.x1) - X(LIFT.x1 - LIFT.rail), Y(FY) - Y(mast) + 1, 1, shadow);
      for (let i = 0; i < 2; i++) {
        const wy = this.Y(i ? exitY + 0.45 : FY - 0.55), wx = this.X(LIFT.cx);
        c.strokeStyle = S.ink; c.lineWidth = 1;
        c.beginPath(); c.arc(wx, wy, 0.45 * cs - 0.5, 0, Math.PI * 2); c.stroke();
        c.fillStyle = S.ink; c.beginPath(); c.arc(wx, wy, Math.max(1, 0.08 * cs), 0, Math.PI * 2); c.fill();
      }
      // The chute: a raised lip from the head of the lift over the bin's left ear.
      this.paintChute(c, exitY, mouth, shadow);
      // The bin: plinth, walls and ears, and the tray between.
      this.raised(c, X(BIN.x0 - 0.1), Y(BIN.bottom), X(BIN.x1 + 0.1) - X(BIN.x0 - 0.1), Y(FY) - Y(BIN.bottom) + 1, 1.5, shadow);
      this.raised(c, X(BIN.x0), Y(mouth), X(BIN.t0) - X(BIN.x0), Y(BIN.bottom) - Y(mouth), 1, shadow);
      this.raised(c, X(BIN.t1), Y(mouth), X(BIN.x1) - X(BIN.t1), Y(BIN.bottom) - Y(mouth), 1, shadow);
      this.raised(c, X(BIN.x0 - 0.3), Y(mouth), X(BIN.t0) - X(BIN.x0 - 0.3), Math.max(2, Y(mouth + 0.25) - Y(mouth)), 1, false);
      this.raised(c, X(BIN.t1), Y(mouth), X(BIN.x1 + 0.3) - X(BIN.t1), Math.max(2, Y(mouth + 0.25) - Y(mouth)), 1, false);
      const tx = X(BIN.t0), ty = Y(mouth), tw = X(BIN.t1) - tx, th = Y(BIN.bottom) - ty;
      this.recessed(c, tx, ty, tw, th);
      // The open section's grid (fading with it as sections open and close); the empty sections, as quiet outlines.
      c.save(); rr(c, tx, ty, tw, th, Math.max(3, Math.min(8, 0.3 * cs))); c.clip();
      for (let k = 0; k < this.S; k++) {
        const a = this.secA[k] * this.secG[k], b = this.Y(this.bottom[k]);
        if (a > 0.02) {
          const rh = (this.slot[k] / SEC) * cs;
          c.globalAlpha = a; c.strokeStyle = S.grid; c.lineWidth = 1; c.beginPath();
          for (let x = 1; x < 4; x++) { const p = X(BIN.t0 + x) + 0.5; c.moveTo(p, this.px(b - SEC * rh)); c.lineTo(p, b); }
          for (let r = 1; r < SEC; r++) { const p = this.px(b - r * rh) + 0.5; c.moveTo(tx, p); c.lineTo(tx + tw, p); }
          c.stroke(); c.globalAlpha = 1;
        }
      }
      c.restore();
      // The sizes still to build, standing over the mouth as a dashed outline of the tower they will make, a band
      // each: the next one as the next bay is drawn, the later ones quieter.
      const lv = Factory.BIN_ROWS.indexOf(this.S * SEC), r = Math.max(3, Math.min(8, 0.3 * cs));
      if (lv >= 0) {
        c.save();
        c.setLineDash([3, 3]); c.strokeStyle = S.ink; c.lineWidth = 1;
        let y1 = mouth - 0.5;
        for (let n = lv + 1; n < Factory.BIN_ROWS.length; n++) {
          const y0 = BIN.bottom - this.binHeight(Factory.BIN_ROWS[n] / SEC) - 0.25;
          c.globalAlpha = n === lv + 1 ? 0.8 : 0.4;
          rr(c, X(BIN.t0) + 0.5, Y(y0) + 0.5, X(BIN.t1) - X(BIN.t0) - 1, Y(y1) - Y(y0) - 1, r); c.stroke();
          y1 = y0 - 0.25;
        }
        c.restore();
      }
    }

    /** The chute: a short raised lip from the head of the lift down over the bin's left ear. */
    paintChute(c, exitY, mouth, shadow) {
      const S = this.sty, cs = this.cs;
      const x0 = this.X(LIFT.x1 - 0.1), y0 = this.Y(exitY + 0.3), x1 = this.X(BIN.t0 + 0.35), y1 = this.Y(mouth - 0.2), t = Math.max(2.5, 0.22 * cs);
      c.save();
      if (shadow) { c.shadowColor = S.shadow; c.shadowBlur = 0.4 * cs; c.shadowOffsetY = 0.15 * cs; }
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1, y1 + t); c.lineTo(x0, y0 + t); c.closePath();
      c.fillStyle = S.solid; c.fill();
      c.restore();
      c.strokeStyle = S.hair; c.lineWidth = 1; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1, y1 + t); c.lineTo(x0, y0 + t); c.closePath(); c.stroke();
      c.fillStyle = S.hi; c.beginPath(); c.moveTo(x0 + 1, y0 + 0.5); c.lineTo(x1 - 1, y1 + 0.5); c.lineTo(x1 - 1, y1 + 1.5); c.lineTo(x0 + 1, y0 + 1.5); c.fill();
    }

    /** Keys compared field by field (no string built per frame). */
    same(key, th, a, b, c, d, e, g) {
      if (key[0] === th && key[1] === a && key[2] === b && key[3] === c && key[4] === d && key[5] === e && key[6] === g) return true;
      key[0] = th; key[1] = a; key[2] = b; key[3] = c; key[4] = d; key[5] = e; key[6] = g;
      return false;
    }

    /** The still layers, repainted only when what they show changes. */
    layers(f, th) {
      const dpr = this.dpr, shown = this.shownPresses(f), size = this.w * 10000 + this.h;
      if (!this.same(this.floorKey, th, this.cs, dpr, size, shown, f.presses, 0)) {
        if (!this.floorC) this.floorC = makeCanvas(1, 1);
        const c = this.floorC;
        c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr);
        const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.paintFloor(x, f, shown);
        this.staticDraws++;
      }
      if (this.moving) { this.towerKey[0] = null; return; } // drawn live while it moves
      if (!this.same(this.towerKey, th, this.cs, dpr, size, this.S, this.o, 0)) {
        if (!this.towerC) this.towerC = makeCanvas(1, 1);
        const c = this.towerC;
        c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr);
        const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.paintTower(x, true);
        this.staticDraws++;
      }
    }

    /** Presses drawn in the still layer: a new one fades in over its empty bay first. */
    shownPresses(f) {
      let n = f.presses;
      while (n > 1 && this.t - this.built[n - 1] < BUILD) n--;
      return n;
    }

    // ---- a frame ----------------------------------------------------------------------------------------------------

    render(dt, f, look) {
      const ctx = this.ctx, th = look.theme;
      this.t += dt;
      const S = this.style(th), reduced = this.reduced;
      if (this.fx.active) { this.fx.light = S.light; this.fx.update(dt); }
      if (this.expectLen >= 0 && f.bin.length !== this.expectLen) this.flushLift();
      this.expectLen = f.bin.length;
      const waiting = Factory.isFull(f);
      if (!waiting && !reduced) this.slide = (this.slide + Factory.BELT.speed * dt) % 60;
      if (reduced && this.inflight) this.flushLift();
      if (!reduced) this.liftStep(dt);
      const landed = this.landed(f);
      this.sections(f, landed);
      this.layers(f, th);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr; ctx.__light = S.light;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.drawImage(this.floorC, 0, 0, this.w, this.h);
      // A press being built fades in over its empty bay.
      for (let k = 1; k < f.presses; k++) {
        const e = (this.t - this.built[k]) / BUILD;
        if (e >= 0 && e < 1) { ctx.globalAlpha = reduced ? 1 : easeOut(e); this.paintPress(ctx, k, false); ctx.globalAlpha = 1; }
      }
      if (this.moving) this.paintTower(ctx, false); else ctx.drawImage(this.towerC, 0, 0, this.w, this.h);

      this.drawBays(ctx, f, look, S);
      this.drawBelt(ctx, f, look, S, waiting);
      this.drawLift(ctx, S);
      this.drawBin(ctx, f, look, S, landed);
      this.drawRiders(ctx, look);
      this.drawFull(ctx, f, S, dt, waiting);
      this.drawCollect(ctx, look);
      if (this.fx.active) this.fx.draw(ctx);
    }

    /** The presses' moving parts: rams, lamps, pins, and what each mold window holds. */
    drawBays(ctx, f, look, S) {
      const cs = this.cs, t = this.t, reduced = this.reduced, hv = this.hover;
      const X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
      for (let k = 0; k < 4; k++) {
        const b = WIN[k], n = Factory.MOLDS[k], hot = !!hv && (hv.kind === 'press' || hv.kind === 'bay') && hv.k === k;
        if (k >= f.presses) {
          // The next bay to build: a plus, lit when pointed at.
          if (k === f.presses) {
            const cx = this.px(this.X(b.cx)), cy = this.px(this.Y(b.y + b.h / 2)), r = Math.round(0.4 * cs);
            ctx.strokeStyle = hot ? S.accentInk : S.ink; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
            ctx.lineCap = 'butt';
          }
          continue;
        }
        const m = f.molds[k], cells = Factory.shapes(n)[m.s], color = look.colors[m.c] || S.accent;
        const fade = reduced ? 1 : clamp01((t - this.built[k]) / BUILD);
        ctx.globalAlpha = fade;
        // The ram: down to meet the window as a mino is stamped, a moment's hold, and back up.
        const te = t - this.stampAt[k];
        let dip = 0;
        if (!reduced && te >= 0) {
          if (te < STAMP_DOWN) dip = easeIn(te / STAMP_DOWN);
          else if (te < STAMP_DOWN + STAMP_HOLD) dip = 1;
          else if (te < STAMP_DOWN + STAMP_HOLD + STAMP_UP) dip = 1 - easeOut((te - STAMP_DOWN - STAMP_HOLD) / STAMP_UP);
        }
        const headBottom = b.y - RAM_REST * (1 - dip);
        const rx0 = X(b.cx - ROD / 2), rx1 = X(b.cx + ROD / 2), ry = Y(CYL.y1), rb = this.px(this.Y(headBottom - RAM_H)) + 1;
        ctx.fillStyle = S.solid; ctx.fillRect(rx0, ry, rx1 - rx0, Math.max(0, rb - ry));
        ctx.fillStyle = S.hair; ctx.fillRect(rx0, ry, 1, Math.max(0, rb - ry)); ctx.fillRect(rx1 - 1, ry, 1, Math.max(0, rb - ry));
        const hw = this.px((b.w - 0.5) * cs), hh = this.px(RAM_H * cs);
        ctx.drawImage(this.sprite('ram', hw, hh, 2), this.px(this.X(b.cx) - hw / 2), this.px(this.Y(headBottom)) - hh, hw, hh);
        // What the window holds: the formed minos, the rest as ghosts, and the next one filling from its bottom.
        const formedNow = m.held ? n : Math.floor(m.p * n + 1e-9);
        const pending = this.stampReal[k] && !reduced && te >= 0 && te < STAMP_DOWN;
        const formed = pending ? Math.max(0, formedNow - 1) : formedNow;
        const gone = t - this.ghostsAt[k] + GHOSTS_AT >= DROP;
        const gA = reduced ? 1 : clamp01((t - this.ghostsAt[k]) / GHOSTS_FADE);
        const ox = b.x + Math.floor((n + 1 - cells.w) / 2), ghost = look.ghost === 'off' ? null : look.ghost;
        const oc = formOrder(cells);
        for (let i = 0; i < oc.length; i++) {
          const x = X(ox + oc[i][0]), y = Y(WB - oc[i][1] - 1), s = X(ox + oc[i][0] + 1) - x;
          if (i < formed) {
            this.cell(ctx, look, color, x, y, s, s);
            if (i === formed - 1 && this.stampReal[k] && !reduced && te >= STAMP_DOWN && te < STAMP_DOWN + FLASH) {
              ctx.fillStyle = white(0.25 * (1 - (te - STAMP_DOWN) / FLASH));
              rr(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.17); ctx.fill();
            }
          } else if (gone && gA > 0) {
            ctx.globalAlpha = fade * gA;
            if (ghost) ghostCell(ctx, ghost, color, x, y, s);
            else { ctx.strokeStyle = rgba(color, 0.25); ctx.lineWidth = 1; rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.16); ctx.stroke(); }
            if (i === formed && !m.held) {
              const frac = pending ? 1 : (m.p * n) % 1;
              if (frac > 0.002) {
                const g = Math.max(1, Math.round(s * 0.06)), fh = (s - 2 * g) * frac;
                ctx.save(); rr(ctx, x + g, y + g, s - 2 * g, s - 2 * g, s * 0.16); ctx.clip();
                ctx.globalAlpha = fade * gA * 0.5; ctx.fillStyle = color; ctx.fillRect(x + g, y + s - g - fh, s - 2 * g, fh);
                ctx.restore();
              }
            }
            ctx.globalAlpha = fade;
          }
        }
        // The window's rim: brighter when pointed at, warm while the press holds its piece.
        if (m.held || hot) {
          const wx = X(b.x), wy = Y(b.y), wr = Math.max(3, Math.min(8, 0.3 * cs));
          ctx.strokeStyle = m.held ? S.warm : S.ink; ctx.lineWidth = 1;
          rr(ctx, wx + 0.5, wy + 0.5, X(b.x + b.w) - wx - 1, Y(WB) - wy - 1, wr); ctx.stroke();
        }
        // The lamp: steady; a flash with each stamp; warm while holding.
        const hx = b.cx - HOUSING.w / 2, ly = this.Y((HOUSING.y0 + HOUSING.y1) / 2);
        const flash = !reduced && this.stampReal[k] && te >= STAMP_DOWN && te < STAMP_DOWN + FLASH;
        ctx.globalAlpha = fade * (m.held || hot || flash ? 1 : 0.85);
        ctx.fillStyle = m.held ? S.warn : S.accent;
        ctx.beginPath(); ctx.arc(this.X(hx + 0.45), ly, Math.max(1.5, 0.2 * cs), 0, Math.PI * 2); ctx.fill();
        // The pin, when this press is set to one shape.
        const pin = m.pin >= 0 && pinPath();
        if (pin) {
          const box = 0.85 * cs, sc = box / 16;
          ctx.globalAlpha = fade;
          ctx.save();
          ctx.translate(this.px(this.X(hx + HOUSING.w - 0.25) - box), this.px(ly - box / 2));
          ctx.scale(sc, sc);
          ctx.strokeStyle = S.accentInk; ctx.lineWidth = 1.25 / sc; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.stroke(pin);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }

    /** One mino in the skin, any height (a closing section squashes its cells). */
    cell(ctx, look, color, x, y, w, h, alpha) {
      const img = cellSprite(look.skin, color, w * this.dpr, ctx.__light);
      if (alpha != null && alpha < 1) { ctx.globalAlpha = alpha; ctx.drawImage(img, x, y, w, h); ctx.globalAlpha = 1; }
      else ctx.drawImage(img, x, y, w, h);
    }

    drawBelt(ctx, f, look, S, waiting) {
      const cs = this.cs, t = this.t;
      // Treads: a tick every cell, sliding right with the belt (still while the line waits).
      const y0 = this.px(this.Y(BY)) + 1, y1 = this.px(this.Y(17.9)) - 1, x0 = this.X(X0), x1 = this.X(X0 + Factory.BELT.len), off = this.slide % 1;
      ctx.strokeStyle = S.ink; ctx.globalAlpha = S.light ? 1 : 0.6; ctx.lineWidth = 1; ctx.beginPath();
      for (let c = off; c < Factory.BELT.len; c += 1) { const p = this.px(this.X(X0 + c)) + 0.5; if (p > x0 + 3 && p < x1 - 3) { ctx.moveTo(p, y0); ctx.lineTo(p, y1); } }
      ctx.stroke(); ctx.globalAlpha = 1;
      // The rollers turn with it.
      const ang = this.slide / ROLLER_R, r = ROLLER_R * cs, ca = Math.cos(ang), sa = Math.sin(ang), cy = this.Y(17.85);
      ctx.strokeStyle = S.ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const cx = this.X(ROLLERS[i]);
        ctx.moveTo(cx + ca * r * 0.3, cy + sa * r * 0.3); ctx.lineTo(cx + ca * r * 0.7, cy + sa * r * 0.7);
        ctx.moveTo(cx - ca * r * 0.3, cy - sa * r * 0.3); ctx.lineTo(cx - ca * r * 0.7, cy - sa * r * 0.7);
      }
      ctx.stroke(); ctx.lineCap = 'butt';
      // Pieces rest on the belt; a new one falls from its window first.
      for (let i = 0; i < f.belt.length; i++) {
        const it = f.belt[i], cells = Factory.shapes(it.n)[it.s], color = look.colors[it.c] || S.accent;
        const t0 = this.drops.get(it);
        let bottom = this.Y(BY);
        if (t0 != null && !this.reduced) {
          const e = t - t0;
          if (e < DROP) bottom = this.Y(WB + (BY - WB) * easeIn(e / DROP));
          else if (e < DROP + DROP_SETTLE) bottom += Math.sin(Math.PI * (e - DROP) / DROP_SETTLE);
        }
        const head = i === 0 && waiting, px0 = this.px(this.X(X0 + it.x));
        if (head) ctx.globalAlpha = 0.6;
        for (let j = 0; j < cells.length; j++) this.cell(ctx, look, color, px0 + cells[j][0] * cs, this.px(bottom - (cells[j][1] + 1) * cs), cs, cs);
        ctx.globalAlpha = 1;
        if (head) {
          // The piece that waits for room: a thin warm line round it.
          const o = outlineOf(cells), bt = this.px(bottom);
          ctx.strokeStyle = S.warn; ctx.lineWidth = 1; ctx.beginPath();
          for (let j = 0; j < o.length; j += 6) {
            ctx.moveTo(px0 + o[j] * cs + o[j + 4], bt - o[j + 1] * cs + o[j + 5]); ctx.lineTo(px0 + o[j + 2] * cs + o[j + 4], bt - o[j + 3] * cs + o[j + 5]);
          }
          ctx.stroke();
        }
      }
      // What is left of a piece at the belt's end, its minos leaving one by one for the lift.
      const q = this.queue[0];
      if (q) {
        const color = look.colors[q.color] || S.accent;
        for (let j = q.next; j < q.cells.length; j++) this.cell(ctx, look, color, this.px(this.X(q.x + q.cells[j][0])), this.px(this.Y(BY - q.cells[j][1] - 1 + q.y[j])), cs, cs);
      }
    }

    /** The lift's chain and cradles: they move only while a mino rides. */
    drawLift(ctx, S) {
      const cs = this.cs, exitY = this.mouth - 1.25, top = this.Y(exitY + 0.45), bottom = this.Y(FY - 0.55);
      const cx = this.px(this.X(LIFT.cx)), step = cs / 2, off = (this.phi % 0.5) * cs;
      ctx.fillStyle = S.chain;
      for (let y = bottom - 0.45 * cs - off; y > top + 0.45 * cs; y -= step) ctx.fillRect(cx - 0.75, Math.round(y), 1.5, 1.5);
      const track = BY - exitY, ph = this.phi % PITCH, x0 = this.px(this.X(LIFT.cx - 0.55)), x1 = this.px(this.X(LIFT.cx + 0.55));
      const th = Math.max(2, Math.round(0.15 * cs)), lw = Math.max(2, Math.round(0.14 * cs)), lh = Math.round(0.35 * cs);
      for (let s = ph; s <= track + 0.001; s += PITCH) {
        // A cradle goes round the head wheel out of sight rather than sit across it.
        const a = clamp01((track - s) / 0.9);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        const y = this.px(this.Y(BY - s));
        ctx.fillStyle = S.hair; ctx.fillRect(x0 - 1, y - lh - 1, lw + 2, lh + th + 2); ctx.fillRect(x0 - 1, y - 1, x1 - x0 + 2, th + 2);
        ctx.fillStyle = S.solid; ctx.fillRect(x0, y, x1 - x0, th); ctx.fillRect(x0, y - lh, lw, lh + th);
      }
      ctx.globalAlpha = 1;
    }

    /** Minos on their way: hopping into a cradle, riding, sliding over the chute, falling to their slot. */
    drawRiders(ctx, look) {
      const cs = this.cs, riders = this.riders;
      for (let i = 0; i < riders.length; i++) {
        const r = riders[i];
        if (r.st === 5) continue;
        let y = this.Y(r.y);
        if (r.st === 4) y += Math.sin(Math.PI * clamp01((this.t - r.t0) / SETTLE));
        this.cell(ctx, look, look.colors[r.color] || look.theme.accent, this.px(this.X(r.x)), this.px(y - cs), cs, cs);
      }
    }

    /** The bin's minos: the open section in cells, full sections as bars in their top row's colours. */
    drawBin(ctx, f, look, S, landed) {
      const cs = this.cs, t = this.t, ca = this.collectA, cu = this.catchA;
      const hide = ca && t - ca.t0 < (ca.reduced ? 0.32 : C_END) ? ca.snap.loose.length : 0;
      if (cu && t - cu.t0 > 1.4) this.catchA = null;
      const bh = this.barH();
      for (let k = 0; k < this.S; k++) {
        const count = Math.max(0, Math.min(PER, landed - k * PER)), a = this.secA[k], g = this.secG[k];
        const rh = this.slot[k] / SEC, bottom = this.bottom[k];
        if (a > 0.001 && count) {
          const h = rh >= 0.999 ? cs : Math.max(1, this.px(rh * cs));
          for (let j = 0; j < count; j++) {
            const i = k * PER + j;
            if (i < hide) continue;
            let alpha = a * g;
            if (cu && i >= cu.from && i < cu.to) alpha *= clamp01((t - cu.t0 - (Math.floor(i / 4) - cu.row0) * cu.stagger) / 0.5);
            if (alpha <= 0.001) continue;
            const color = look.colors[parseInt(f.bin[i], 16)] || S.accent;
            const x = this.px(this.X(BIN.t0 + (j % 4))), y = this.px(this.Y(bottom - Math.floor(j / 4) * rh)) - h;
            this.cell(ctx, look, color, x, y, cs, h, alpha < 1 ? alpha : null);
          }
        }
        if (a < 0.999) {
          const alpha = (1 - a) * g;
          if (alpha <= 0.001) continue;
          const by = this.px(this.Y(bottom - 0.05));
          ctx.globalAlpha = alpha;
          if (count <= Math.max(0, hide - k * PER)) {
            const x0 = this.px(this.X(BIN.t0 + 0.1)), x1 = this.px(this.X(BIN.t1 - 0.1));
            ctx.strokeStyle = S.ink2; ctx.lineWidth = 1;
            rr(ctx, x0 + 0.5, by - bh + 0.5, x1 - x0 - 1, bh - 1, 1.5); ctx.stroke();
          } else {
            for (let j = Math.floor((count - 1) / 4) * 4; j < count; j++) {
              const i = k * PER + j;
              if (i < hide) continue;
              ctx.fillStyle = look.colors[parseInt(f.bin[i], 16)] || S.accent;
              rr(ctx, this.px(this.X(BIN.t0 + (j % 4))) + 0.5, by - bh, cs - 1, bh, 1.5); ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      }
      // Pointing at the bin (or at Collect): a wash over exactly what Collect would take, and the walls lit.
      const hv = this.hover;
      if ((this.preview || (hv && hv.kind === 'bin')) && !ca) {
        const x0 = this.px(this.X(BIN.t0)), x1 = this.px(this.X(BIN.t1));
        if (landed >= 4) {
          const top = this.px(this.Y(this.washTop(landed))), bot = this.px(this.Y(BIN.bottom));
          ctx.fillStyle = S.wash; ctx.fillRect(x0, top, x1 - x0, bot - top);
          ctx.strokeStyle = S.washLine; ctx.lineWidth = 1; rr(ctx, x0 + 0.5, top + 0.5, x1 - x0 - 1, bot - top - 1, 2); ctx.stroke();
        }
        const m = this.px(this.Y(this.mouth)), b = this.px(this.Y(BIN.bottom));
        const l0 = this.px(this.X(BIN.x0)), r1 = this.px(this.X(BIN.x1));
        ctx.strokeStyle = S.ink; ctx.lineWidth = 1;
        rr(ctx, l0 + 0.5, m + 0.5, x0 - l0 - 1, b - m - 1, 1); ctx.stroke();
        rr(ctx, x1 + 0.5, m + 0.5, r1 - x1 - 1, b - m - 1, 1); ctx.stroke();
      }
    }

    /** A full bin: a lid slides across its mouth and a small gate closes the chute. */
    drawFull(ctx, f, S, dt, waiting) {
      const full = (waiting || f.bin.length > Factory.capacity(f) - 4) && this.inflight === 0 && !this.collectA;
      if (this.reduced) this.lidK = full ? 1 : 0;
      else this.lidK = full ? Math.min(1, this.lidK + dt / LID) : Math.max(0, this.lidK - dt / (LID * 0.75));
      if (this.lidK <= 0) return;
      const cs = this.cs, e = easeOut(this.lidK);
      const x0 = this.px(this.X(BIN.x0 - 0.3)), x1 = this.px(this.X(BIN.x1 + 0.3)), w = x1 - x0;
      const h = Math.max(3, this.px(0.4 * cs)), y = this.px(this.Y(this.mouth)) - h + 1, lx = this.px(x0 + w * (1 - e));
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 - 1, y - 2, w + 2, h + 4); ctx.clip();
      ctx.drawImage(this.sprite('lid', w, h, 2), lx, y, w, h);
      ctx.fillStyle = S.warn; ctx.fillRect(lx + 2, y, Math.max(0, x1 - lx - 4), 1.5);
      ctx.restore();
      // The gate: a short warm bar across the chute's end.
      ctx.globalAlpha = e;
      const gx = this.px(this.X(BIN.x0 - 0.45)), gy = this.px(this.Y(this.mouth - 1.05));
      ctx.fillStyle = S.warn; rr(ctx, gx - 1, gy, 2.5, Math.round(0.8 * cs), 1.2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /** The block Collect took: a glaze, the clear effect once, then up a row as one while its cells shrink away; the
     *  loose minos ride up on it, then fall to the bottom row once it has gone. */
    drawCollect(ctx, look) {
      const ca = this.collectA;
      if (!ca) return;
      const e = this.t - ca.t0, cs = this.cs, snap = ca.snap;
      if (ca.reduced) {
        const a = e < 0.12 ? 1 : 1 - clamp01((e - 0.12) / 0.2);
        this.paintBlock(ctx, look, snap, 0, a, 0.3 * clamp01(e / 0.12), 1);
        if (!ca.burst) { ca.burst = true; this.fx.burst('fade', this.burstCells(snap), cs, true); }
        for (let i = 0; i < snap.loose.length && e < 0.32; i++) this.cell(ctx, look, snap.loose[i].color, this.px(this.X(BIN.t0 + i)), this.px(this.Y(BIN.bottom)) - cs, cs, cs);
        if (e > 0.32) this.collectA = null;
        return;
      }
      if (e >= C_GLAZE && !ca.burst) {
        // The equipped clear, once, over every collected cell. Its plain shrinking squares are left out: the block
        // shrinks away itself as it rises (so the default effect is the block), and a copy left in place would read
        // as a ghost of the rows.
        ca.burst = true;
        const n = this.fx.parts.length;
        this.fx.burst(ca.effect, this.burstCells(snap), cs, false);
        for (let i = this.fx.parts.length - 1; i >= n; i--) if (this.fx.parts[i].kind === 'sq') this.fx.parts.splice(i, 1);
      }
      const k = e < C_GLAZE ? 0 : clamp01((e - C_GLAZE) / C_RISE), dy = -easeOut(k) * cs;
      if (k < 1) {
        // The glaze holds while the cells shrink toward their centres and fade late: no frame shows dim rows.
        const glaze = e < C_GLAZE ? 0.3 * (e / C_GLAZE) : 0.3;
        this.paintBlock(ctx, look, snap, dy, 1 - easeIn(clamp01((k - 0.2) / 0.6)), glaze, 1 - 0.85 * easeIn(k));
      }
      // Loose minos: carried up on the block, then down to the bottom row.
      if (e < C_END) {
        const f = e < C_LOOSE ? 0 : easeIn(clamp01((e - C_LOOSE) / C_FALL));
        for (let i = 0; i < snap.loose.length; i++) {
          const m = snap.loose[i], tx = BIN.t0 + i, y0 = this.Y(m.y) + dy, y1 = this.Y(BIN.bottom);
          this.cell(ctx, look, m.color, this.px(this.X(m.x + (tx - m.x) * f)), this.px(y0 + (y1 - y0) * f) - cs, cs, cs);
        }
      } else this.collectA = null;
    }

    /** The collected block at a lift of dy px: its cells (scaled about their centres by sc) and slivers, glazed. */
    paintBlock(ctx, look, snap, dy, alpha, glaze, sc) {
      if (alpha <= 0.001) return;
      for (let i = 0; i < snap.cells.length; i++) {
        const c = snap.cells[i], w = this.px(c.w * sc), hh = this.px(c.h * sc);
        if (w < 1 || hh < 1) continue;
        const x = this.px(c.x + (c.w - w) / 2), y = this.px(c.y + dy + (c.h - hh) / 2);
        this.cell(ctx, look, c.color, x, y, w, hh, alpha < 1 ? alpha : null);
        if (glaze > 0.005) { ctx.fillStyle = white(glaze * alpha); rr(ctx, x + 1, y + 1, w - 2, hh - 2, w * 0.17); ctx.fill(); }
      }
      ctx.globalAlpha = alpha;
      for (let i = 0; i < snap.bars.length; i++) {
        const b = snap.bars[i], w = Math.max(1, this.px((b.w - 1) * sc));
        ctx.fillStyle = b.color; rr(ctx, this.px(b.x + 0.5 + (b.w - 1 - w) / 2), this.px(b.y + dy), w, b.h, 1.5); ctx.fill();
        if (glaze > 0.005) { ctx.fillStyle = white(glaze); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    /** The open section's collected cells for the clear effect, all at once: at most 120 (whole rows, sampled). */
    burstCells(snap) {
      const rows = Math.ceil(snap.cells.length / 4), every = Math.max(1, Math.ceil((rows * 4) / 120)), out = [];
      for (let r = 0; r < rows; r += every) for (let c = 0; c < 4; c++) { const cell = snap.cells[r * 4 + c]; if (cell) out.push({ x: cell.x, y: cell.y, color: cell.color }); }
      return out;
    }
  }

  /** A shape on its own little canvas (mold picker, stats): pressed ones in the skin, the rest a quiet fill. */
  function shapeCanvas(look, cells, size, color, pressed, quiet) {
    const c = document.createElement('canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
    c.style.width = size + 'px'; c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr; ctx.__light = look.theme.name === 'light';
    const b = L.Pieces.boundsOf(cells), s = Math.max(2, Math.floor(Math.min((size - 4) / b.w, (size - 4) / b.h, 11)));
    const ox = Math.round((size - b.w * s) / 2), oy = Math.round((size - b.h * s) / 2);
    const fill = rgba(look.theme.muted || '#9aa1ae', quiet == null ? 0.22 : quiet);
    for (const [x, y] of cells) {
      const px = ox + (x - b.minX) * s, py = oy + (b.maxY - y) * s;
      if (pressed) Render.drawCell(ctx, look.skin, color, px, py, s);
      // Not pressed yet: one quiet look at every size (a ghost's outline would not survive the small ones).
      else { ctx.fillStyle = fill; rr(ctx, px + 0.5, py + 0.5, s - 1, s - 1, Math.min(2, s * 0.2)); ctx.fill(); }
    }
    return c;
  }

  L.FloorView = FloorView;
  L.FactoryArt = { shapeCanvas, FONT, WIN, COLS, ROWS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
