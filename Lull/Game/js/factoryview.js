// Lull — the Factory floor: a small scene on the board's own plate, in the board's materials. A gantry holds one
// press per bay (each bay sized to its pieces); each press stamps its piece a mino at a time into a recessed mold
// window and drops it straight down onto the belt. The belt carries it to a cradle lift, which sets its minos one by
// one into the bin, row by row. A bigger bin is wider as well as taller (its columns and rows are the model's), so its
// cells keep one size: a floor cell or a little less (the widest bin fits the space kept for it), smaller only where
// the window is too short for the tallest; every mino it holds is drawn as a mino, in whole device pixels (a window
// near the smallest pans over the top of what it holds instead). Every four minos in the bin are one line. No text is
// drawn here: names and numbers live in the page around it.
//
// The scene is a 42 × 19.5 cell grid (y down), shown from half a row down (19 rows), and taller when the page has
// the height for it: whole rows are added above (and one under the floor), for a hall and a taller bin, as
// many as the window's height gives (never a matter of what is built). The cell size always follows the width. Its still parts are painted once into two offscreen layers (the floor, and the bin's
// tower with the lift's mast), repainted only when what they show changes, and the bin's minos into a third, repainted
// when the bin changes; a frame is those images, the moving parts and the minos on their way.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { rr, rgba, mix, ghostCell, cellSprite, FX, FONT } = Render;

  // ---- the scene, in cells ----------------------------------------------------------------------------------------

  // The scene is drawn 0.5 row up into the plate: its top half row is only ever empty (the tallest bin's mast stops
  // 1.25 rows down), so the plate shows 19 rows and the air above the gantry is no deeper than it need be.
  const COLS = 42, TOP = 0.5, ROWS = 19.5 - TOP;
  // A taller plate adds whole rows (never more than EMAX: the scene is at most 1.8 times as tall as it is wide). From DEEP
  // rows one of them goes under the floor; the rest go above. From HALL rows up the floor is a hall: a roof beam from
  // the post to the lift's mast, a lamp hung from it over each bay and, from WALL rows up, tall windows in the back
  // wall. The bin's tower rises into the height, and grows to the right into the room kept for the widest (TRAY): every
  // size in the bin's own cell where the height allows, and the sizes still to build drawn round it as dashed outlines
  // (see plan()).
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
  // The bin: its left wall's outer edge and the tray's left edge (it grows to the right), and its tray's bottom. TRAY is
  // the room kept for the widest bin's tray, in floor cells (its cells are TRAY / 12 of a floor cell: one step down).
  const BIN = { x0: 30.5, t0: 30.75, bottom: 18.5 }, BWALL = BIN.t0 - BIN.x0, TRAY = 10.5;
  const MINBC = 3;                   // the smallest bin cell, in device px; a bin that cannot fit at it pans
  const FLATBC = 8;                  // bin cells smaller than this (device px) are plain flat squares with a gap
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
  const GROW = 0.5, BUILD = 0.6, LID = 0.4;
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
      this.lv = null; this.planKey = -1;         // the bin's plan: each size's cell, rows shown and height (device px)
      // The bin as drawn: its cell (device px, and CSS px), the tray's left edge, width and bottom (CSS px), the rows
      // it shows and the first of them (above 0 only when it pans), and its size (level) as laid out.
      this.bcD = 1; this.bc = 1; this.bx = 0; this.bw = 4; this.bb = 0; this.vis = 12; this.base = 0; this.lvShown = -1;
      this.cols = 4;                             // the bin's columns, as laid out
      this.mouthFrom = 0; this.mouthT0 = -9;
      this.binC = null; this.binKey = { bin: null, landed: -1, base: -1, bc: 0, vis: 0, w: 0, skin: null, light: null, dpr: 0, cols: [] };
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
      this.at = { x: 0, y: 0, s: 1 };
      this.mouth = BIN.bottom - 12; this.restMouth = this.mouth;
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
      if (E !== this.E) { this.E = E; this.F = E >= DEEP ? 1 : 0; }
      this.cs = cs;
      this.ox = Math.round((w - COLS * cs) / 2);
      this.oy = -Math.round(this.top * cs);
    }

    /**
     * The bin's plan for this scene (its width, height and cell size alone, so it never changes with what is built):
     * for each size, its cell in whole device pixels, its columns, the rows it shows, and its width and height. Every
     * size has the bin's own cell (`cell`: a floor cell, or less so that the widest tray fits the TRAY cells kept for
     * it) wherever the height allows. In a window too short for the tallest, a size's cells shrink until it fits, and
     * each size down keeps inside the next one up, at least one of that one's cells narrower and lower (so the smaller
     * sizes keep bigger cells, never above `cell`, kept as binCell). A size whose rows would need cells under MINBC shows as many rows
     * as fit at MINBC, and pans.
     */
    plan() {
      const cs = this.cs, d = this.dpr, key = (cs * 10 + d) * 1000 + this.E;
      if (key === this.planKey && this.lv) return;
      this.planKey = key;
      const C = Factory.BIN_COLS, R = Factory.BIN_ROWS, n = R.length, full = Math.max(1, Math.round(cs * d));
      const hmax = Math.floor((BIN.bottom - this.mouthTop) * cs * d);
      const cell = Math.max(MINBC, Math.min(full, Math.floor((TRAY * cs * d) / C[n - 1])));
      const lv = new Array(n);
      let capW = Infinity, capH = Infinity, gap = 0;
      for (let l = n - 1; l >= 0; l--) {
        const room = Math.min(hmax, capH - gap);
        let bc = Math.min(cell, Math.floor(room / R[l]), Math.floor((capW - gap) / C[l])), vis = R[l];
        if (bc < MINBC) { bc = MINBC; vis = Math.max(4, Math.min(R[l], Math.floor(room / MINBC))); }
        lv[l] = { bc, vis, cols: C[l], w: C[l] * bc, h: vis * bc };
        capW = lv[l].w; capH = lv[l].h; gap = bc;
      }
      this.binCell = cell;
      this.lv = lv;
    }

    /** The highest the bin's mouth may be, in cells: under the roof in a hall, the lift's head wheel kept clear. */
    get mouthTop() { return this.top + (this.hall ? ROOF.y1 + 1.55 : 2); }

    /** The bin's height at rest for a size (level), in cells. */
    binHeight(l) { this.plan(); return this.lv[l].h / this.dpr / this.cs; }

    /** The tray's left edge, in CSS px on the device pixel grid: every size starts here and grows to the right. */
    trayLeft() { return Math.round(this.X(BIN.t0) * this.dpr) / this.dpr; }

    /** The scene's top edge, in cells (above 0 once rows are added). */
    get top() { return TOP - this.E + this.F; }
    /** Whether the scene is tall enough to be a hall, with lamps hung over the bays. */
    get hall() { return this.E - this.F >= HALL; }

    /** The bin's mouth at rest, in cells, for the model's bin. */
    restMouthOf(f) { return BIN.bottom - this.binHeight(f.binLevel); }

    X(c) { return this.ox + c * this.cs; }
    Y(r) { return this.oy + r * this.cs; }
    /** A length in CSS px, snapped to the device pixel grid. */
    px(v) { return Math.round(v * this.dpr) / this.dpr; }

    /** A hotspot's rectangle in CSS px (relative to the plate): a bay (housing and window), or the bin and its mouth. */
    rect(kind, k, f) {
      const cs = this.cs;
      if (kind === 'bin') {
        this.plan();
        const top = (f ? this.restMouthOf(f) : this.restMouth) - 0.5, tw = this.lv[f ? f.binLevel : Math.max(0, this.lvShown)].w / this.dpr;
        return { x: this.trayLeft() - (BWALL + 0.35) * cs, y: this.Y(top), w: tw + 2 * (BWALL + 0.35) * cs, h: (FY - top) * cs };
      }
      const b = WIN[k];
      return { x: this.X(b.x - 0.2), y: this.Y(HOUSING.y0 - 0.2), w: (b.w + 0.4) * cs, h: (WB + 0.3 - HOUSING.y0 + 0.2) * cs };
    }

    /** A number that changes whenever a hotspot would move. */
    layoutKey(f) { return ((((this.w * 100 + this.cs) * 1000 + this.ox) * 10 + f.presses) * 10 + f.binLevel) * 100 + this.E; }

    // ---- the bin ----------------------------------------------------------------------------------------------------

    /** How many minos are drawn in the bin: everything but those still on their way up the lift. */
    landed(f) { return Math.max(0, f.bin.length - this.inflight); }

    /** Lays the bin out for this frame: its cell, the tray's place (whole device pixels), the rows it shows, and its
     *  mouth, which rises to a taller bin's over GROW. */
    layoutBin(f) {
      this.plan();
      const l = f.binLevel, g = this.lv[l], d = this.dpr, rows = Factory.BIN_ROWS[l];
      this.bcD = g.bc; this.bc = g.bc / d; this.vis = g.vis; this.cols = g.cols;
      this.bx = this.trayLeft(); this.bw = g.w / d;
      this.bb = this.px(this.Y(BIN.bottom));
      // A bin that pans keeps the top of what it holds in view (the minos on their way included), a row clear above.
      this.base = g.vis >= rows ? 0 : Math.max(0, Math.min(rows - g.vis, Math.ceil(f.bin.length / g.cols) - g.vis + 1));
      const rest = this.restMouthOf(f);
      if (l !== this.lvShown) {
        if (this.lvShown >= 0 && l > this.lvShown && !this.reduced) { this.mouthFrom = this.mouth; this.mouthT0 = this.t; }
        else this.mouthT0 = -9;
        this.lvShown = l;
      }
      const e = this.reduced ? 1 : clamp01((this.t - this.mouthT0) / GROW);
      this.moving = e < 1;
      this.mouth = e < 1 ? this.mouthFrom + (rest - this.mouthFrom) * easeOut(e) : rest;
      this.restMouth = rest;
    }

    /** The bin's outer walls, in CSS px: a wall BWALL thick either side of the tray (the tower is as wide as its
     *  columns). */
    wallL() { return this.bx - this.px(BWALL * this.cs); }
    wallR() { return this.bx + this.bw + this.px(BWALL * this.cs); }

    /** Where mino i of the bin sits (the bin fills row by row, left to right): its cell's left edge and bottom, and
     *  its size, in scene cells. */
    slotOf(i, out) {
      const cols = this.cols, row = Math.floor(i / cols) - this.base;
      out.x = (this.bx + (i % cols) * this.bc - this.ox) / this.cs;
      out.y = (this.bb - row * this.bc - this.oy) / this.cs;
      out.s = this.bc / this.cs;
      return out;
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
     *  nothing half-played may resume on return. The lift lands, a collect ends, the bin snaps to its height. */
    settle() {
      this.flushLift();
      this.collectA = null; this.catchA = null;
      this.fx.clear();
      this.drops = new WeakMap();
      for (let k = 0; k < 4; k++) { this.stampAt[k] = -9; this.stampReal[k] = false; this.built[k] = -9; this.ghostsAt[k] = -9; }
      this.lvShown = -1; // the next frame lays the bin out afresh, without easing
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
          riders.push({ st: 0, color: p.color, idx: p.idx0 + j, cid, d0: Math.max(0.05, dist), fx: p.x + c[0], fy: BY - c[1] + p.y[j], t0: this.t, dur: 0, x: 0, y: 0, s: 1 });
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
      // Each mino: hop into its cradle, ride up, slide over the chute (taking the bin's cell size), fall to its slot,
      // settle.
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
          r.s = 1 + (at.s - 1) * e;
          if (k >= 1) { r.st = 3; r.t0 = this.t; r.dur = 0.12 * Math.sqrt(Math.max(0.25, at.y - this.mouth)); }
        }
        if (r.st === 3) {
          const k = clamp01((this.t - r.t0) / r.dur);
          this.slotOf(r.idx, at);
          r.x = at.x; r.y = this.mouth + (at.y - this.mouth) * easeIn(k); r.s = at.s;
          if (k >= 1) { r.st = 4; r.t0 = this.t; }
        }
        if (r.st === 4) {
          this.slotOf(r.idx, at);
          r.x = at.x; r.y = at.y; r.s = at.s;
          if (this.t - r.t0 >= SETTLE) r.st = 5;
        }
      }
      // Landed, in order: they join the bin's own drawing.
      while (riders.length && riders[0].st === 5) { riders.shift(); this.inflight--; }
      if (this.inflight < 0) this.inflight = 0;
    }

    // ---- collecting and time away -----------------------------------------------------------------------------------

    /** What Collect takes, as drawn now: the minos of every whole line in view (cells, in CSS px: whole rows, and
     *  the start of the next when the width is not a multiple of four) and the loose minos after them. Taken just
     *  before the model collects. */
    snapshot(f, look) {
      const landed = this.landed(f), lines = Math.floor(landed / 4), bc = this.bc, cols = this.cols;
      const cells = [], loose = [];
      for (let i = this.base * cols; i < landed; i++) {
        const r = Math.floor(i / cols) - this.base;
        if (r >= this.vis) break;
        const color = look.colors[parseInt(f.bin[i], 16)] || look.theme.accent, x = this.bx + (i % cols) * bc, y = this.bb - (r + 1) * bc;
        if (i >= lines * 4) loose.push({ x, y, color });
        else cells.push({ x, y, w: bc, h: bc, color });
      }
      return { cells, loose, lines, cols, bc, flat: this.bcD < FLATBC };
    }

    /** The block lifts out as one: a glaze, the equipped clear effect, a rise and a fade; loose minos fall. */
    collected(snap, look, reduced) {
      this.flushLift();
      this.collectA = { t0: this.t, snap, reduced: !!reduced, burst: false, effect: look.effect };
    }

    /** Minos made while away, fading in row by row (the page counts the numbers up beside them). */
    caughtUp(from, to) {
      if (this.reduced || to <= from) { this.catchA = null; return; }
      const cols = this.cols, rows = Math.ceil(to / cols) - Math.floor(from / cols);
      this.catchA = { t0: this.t, from, to, row0: Math.floor(from / cols), stagger: Math.min(0.02, 0.3 / Math.max(1, rows)) };
    }

    /** Whether anything is on its way right now (a lift running, a block lifting, a taller bin rising). */
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
    recessed(c, x, y, w, h, gx, gb, rows, rad) {
      const S = this.sty, cs = this.cs, r = rad != null ? rad : Math.max(3, Math.min(8, 0.3 * cs));
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

    /** The bin's tower and the lift's mast: rails, wheels, chute, walls and ears, plinth, and the tray between the
     *  walls, as wide as the bin's columns (with their grid, when its cells are big enough for one). */
    paintTower(c, shadow) {
      const S = this.sty, cs = this.cs, d = this.dpr, X = (v) => this.px(this.X(v)), Y = (v) => this.px(this.Y(v));
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
      const tx = this.bx, tw = this.bw, tr = tx + tw, ty = Y(mouth), tb = this.bb, th = tb - ty, wl = this.wallL(), wr = this.wallR(), e = this.px(0.3 * cs);
      this.raised(c, wl - this.px(0.1 * cs), Y(BIN.bottom), wr - wl + 2 * this.px(0.1 * cs), Y(FY) - Y(BIN.bottom) + 1, 1.5, shadow);
      this.raised(c, wl, ty, tx - wl, tb - ty, 1, shadow);
      this.raised(c, tr, ty, wr - tr, tb - ty, 1, shadow);
      this.raised(c, wl - e, ty, tx - wl + e, Math.max(2, Y(mouth + 0.25) - ty), 1, false);
      this.raised(c, tr, ty, wr + e - tr, Math.max(2, Y(mouth + 0.25) - ty), 1, false);
      const rad = Math.max(1, Math.min(3, 0.3 * cs, tw / 6));
      this.recessed(c, tx, ty, tw, th, 0, 0, 0, rad);
      // The grid, a device pixel fine, where the cells are big enough to show one.
      if (this.bcD >= 6) {
        const bc = this.bc, h = 0.5 / d;
        c.save(); rr(c, tx, ty, tw, th, rad); c.clip();
        c.strokeStyle = S.grid; c.lineWidth = 1 / d; c.beginPath();
        for (let x = 1; x < this.cols; x++) { const p = tx + x * bc - h; c.moveTo(p, ty); c.lineTo(p, tb); }
        for (let y = tb - bc; y > ty + 0.5; y -= bc) { c.moveTo(tx, y - h); c.lineTo(tr, y - h); }
        c.stroke();
        c.restore();
      }
      // The sizes still to build, as a dashed outline of the tower each will make round this one (they all stand on
      // the plinth and share its left wall, each wider and taller than the last): up the left wall from over the mouth,
      // across its top and down its right wall to the plinth. The next one as the next bay is drawn, the later ones
      // quieter.
      const lv = this.lvShown, r = Math.max(3, Math.min(8, 0.3 * cs));
      if (lv >= 0) {
        c.save();
        c.setLineDash([3, 3]); c.strokeStyle = S.ink; c.lineWidth = 1; c.lineJoin = 'round';
        const x0 = this.px(wl) + 0.5, wall = this.px(BWALL * cs);
        let from = Y(mouth - 0.75);
        for (let n = lv + 1; n < Factory.BIN_ROWS.length; n++) {
          const g = this.lv[n], top = this.px(tb - g.h / d - 0.25 * cs) + 0.5, x1 = this.px(tx + g.w / d + wall) - 0.5;
          c.globalAlpha = n === lv + 1 ? 0.8 : 0.4;
          c.beginPath(); c.moveTo(x0, Math.max(from, top + r)); c.arcTo(x0, top, x1, top, r); c.arcTo(x1, top, x1, tb, r); c.lineTo(x1, tb); c.stroke();
          from = top - this.px(0.35 * cs);
        }
        c.restore();
      }
    }

    /** The chute: a short raised lip from the head of the lift down over the bin's left ear. */
    paintChute(c, exitY, mouth, shadow) {
      const S = this.sty, cs = this.cs;
      const x0 = this.X(LIFT.x1 - 0.1), y0 = this.Y(exitY + 0.3), x1 = this.bx + Math.min(0.35 * cs, 0.25 * this.bw), y1 = this.Y(mouth - 0.2), t = Math.max(2.5, 0.22 * cs);
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
      if (!this.same(this.towerKey, th, this.cs, dpr, size, this.lvShown, this.bcD, this.mouth)) {
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
      this.layoutBin(f);
      if (!reduced) this.liftStep(dt);
      const landed = this.landed(f);
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

    /** One mino in the skin. */
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
        const color = look.colors[r.color] || look.theme.accent;
        if (r.st >= 3) { this.mino(ctx, look, color, this.px(this.X(r.x)), this.px(y) - this.bc, this.bc); continue; }
        const s = Math.max(1, this.px(r.s * cs));
        this.cell(ctx, look, color, this.px(this.X(r.x)), this.px(y) - s, s, s);
      }
    }

    /** A mino of the bin at size s (CSS px): in the skin, or under FLATBC device px a flat square with a gap of a
     *  device pixel at its top and right, so the smallest still read as minos. */
    mino(ctx, look, color, x, y, s, alpha) {
      const d = this.dpr;
      if (Math.round(s * d) >= FLATBC) { this.cell(ctx, look, color, x, y, s, s, alpha); return; }
      if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
      ctx.fillStyle = color; ctx.fillRect(x, y + 1 / d, s - 1 / d, s - 1 / d);
      if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
    }

    /** The bin's minos in view, from mino `from` on, with the tray's bottom left at x, b (CSS px); minos made while
     *  away (cu) fade in row by row. */
    paintMinos(c, f, look, landed, from, cu, x, b) {
      const bc = this.bc, t = this.t, acc = this.sty.accent;
      const cols = this.cols;
      for (let i = Math.max(from, this.base * cols); i < landed; i++) {
        const r = Math.floor(i / cols) - this.base;
        if (r >= this.vis) break;
        let alpha = null;
        if (cu && i >= cu.from && i < cu.to) { alpha = clamp01((t - cu.t0 - (Math.floor(i / cols) - cu.row0) * cu.stagger) / 0.5); if (alpha <= 0.001) continue; }
        this.mino(c, look, look.colors[parseInt(f.bin[i], 16)] || acc, x + (i % cols) * bc, b - (r + 1) * bc, bc, alpha);
      }
    }

    /** The bin's minos at rest, painted once into their own layer until the bin (or its look) changes. */
    binLayer(f, look, landed) {
      const k = this.binKey, cols = look.colors, light = this.sty.light;
      let same = !!this.binC && k.bin === f.bin && k.landed === landed && k.base === this.base && k.bc === this.bcD && k.vis === this.vis && k.w === this.cols &&
        k.skin === look.skin && k.light === light && k.dpr === this.dpr && k.cols.length === cols.length;
      for (let i = 0; same && i < cols.length; i++) if (k.cols[i] !== cols[i]) same = false;
      if (same) return this.binC;
      k.bin = f.bin; k.landed = landed; k.base = this.base; k.bc = this.bcD; k.vis = this.vis; k.w = this.cols; k.skin = look.skin; k.light = light; k.dpr = this.dpr;
      k.cols.length = cols.length; for (let i = 0; i < cols.length; i++) k.cols[i] = cols[i];
      if (!this.binC) this.binC = makeCanvas(1, 1);
      const c = this.binC, d = this.dpr;
      c.width = this.cols * this.bcD; c.height = Math.max(1, this.vis * this.bcD);
      const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.__dpr = d; x.__light = light;
      this.paintMinos(x, f, look, landed, 0, null, 0, this.vis * this.bc);
      return c;
    }

    /** The bin's minos, every one a mino; pointing at the bin (or Collect) washes what Collect would take. */
    drawBin(ctx, f, look, S, landed) {
      const t = this.t, ca = this.collectA, bc = this.bc, bx = this.bx, bb = this.bb, top = bb - this.vis * bc;
      const hide = ca && t - ca.t0 < (ca.reduced ? 0.32 : C_END) ? ca.snap.loose.length : 0;
      if (this.catchA && t - this.catchA.t0 > 1.4) this.catchA = null;
      if (hide || this.catchA) this.paintMinos(ctx, f, look, landed, hide, this.catchA, bx, bb);
      else if (landed) ctx.drawImage(this.binLayer(f, look, landed), bx, top, this.bw, bb - top);
      // A bin that pans: what is under the view fades into the tray's floor.
      if (this.base > 0) {
        ctx.fillStyle = S.well1;
        for (let k = 1; k <= 4; k++) { ctx.globalAlpha = 0.2 * k; ctx.fillRect(bx, bb - (5 - k) * bc, this.bw, bc); }
        ctx.globalAlpha = 1;
      }
      const hv = this.hover;
      if ((this.preview || (hv && hv.kind === 'bin')) && !ca) {
        const x0 = bx, x1 = bx + this.bw, cols = this.cols, taken = Math.floor(landed / 4) * 4;
        // What Collect takes: its whole rows, and the start of the next row when a line ends partway along one.
        let full = Math.floor(taken / cols) - this.base, part = taken % cols;
        if (full >= this.vis) { full = this.vis; part = 0; } else if (full < 0) { full = 0; part = 0; }
        if (landed >= 4) {
          ctx.lineWidth = 1; ctx.strokeStyle = S.washLine; ctx.fillStyle = S.wash;
          if (!part) {
            const wt = full > 0 ? bb - full * bc : bb - 2 / this.dpr;
            ctx.fillRect(x0, wt, x1 - x0, bb - wt);
            rr(ctx, x0 + 0.5, wt + 0.5, x1 - x0 - 1, bb - wt - 1, Math.min(2, bc / 2)); ctx.stroke();
          } else {
            // A step: full rows the whole width, then the next row as far as the last line reaches.
            const xs = this.px(x0 + part * bc), yf = bb - full * bc, yp = yf - bc;
            ctx.beginPath(); ctx.moveTo(x0, bb); ctx.lineTo(x1, bb); ctx.lineTo(x1, yf); ctx.lineTo(xs, yf); ctx.lineTo(xs, yp); ctx.lineTo(x0, yp); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x0 + 0.5, bb - 0.5); ctx.lineTo(x1 - 0.5, bb - 0.5);
            if (full > 0) { ctx.lineTo(x1 - 0.5, yf + 0.5); ctx.lineTo(xs - 0.5, yf + 0.5); } else ctx.lineTo(xs - 0.5, bb - 0.5);
            ctx.lineTo(xs - 0.5, yp + 0.5); ctx.lineTo(x0 + 0.5, yp + 0.5); ctx.closePath(); ctx.stroke();
          }
        }
        const m = this.px(this.Y(this.mouth));
        const l0 = this.wallL(), r1 = this.wallR();
        ctx.strokeStyle = S.ink; ctx.lineWidth = 1;
        rr(ctx, l0 + 0.5, m + 0.5, x0 - l0 - 1, bb - m - 1, 1); ctx.stroke();
        rr(ctx, x1 + 0.5, m + 0.5, r1 - x1 - 1, bb - m - 1, 1); ctx.stroke();
      }
    }

    /** A full bin: a lid slides across its mouth and a small gate closes the chute. */
    drawFull(ctx, f, S, dt, waiting) {
      const full = (waiting || f.bin.length > Factory.capacity(f) - 4) && this.inflight === 0 && !this.collectA;
      if (this.reduced) this.lidK = full ? 1 : 0;
      else this.lidK = full ? Math.min(1, this.lidK + dt / LID) : Math.max(0, this.lidK - dt / (LID * 0.75));
      if (this.lidK <= 0) return;
      const cs = this.cs, e = easeOut(this.lidK);
      const x0 = this.wallL() - this.px(0.3 * cs), x1 = this.wallR() + this.px(0.3 * cs), w = x1 - x0;
      const h = Math.max(3, this.px(0.4 * cs)), y = this.px(this.Y(this.mouth)) - h + 1, lx = this.px(x0 + w * (1 - e));
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 - 1, y - 2, w + 2, h + 4); ctx.clip();
      ctx.drawImage(this.sprite('lid', w, h, 2), lx, y, w, h);
      ctx.fillStyle = S.warn; ctx.fillRect(lx + 2, y, Math.max(0, x1 - lx - 4), 1.5);
      ctx.restore();
      // The gate: a short warm bar across the chute's end.
      ctx.globalAlpha = e;
      const gx = this.wallL() - this.px(0.45 * cs), gy = this.px(this.Y(this.mouth - 1.05));
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
        if (!ca.burst) { ca.burst = true; this.fx.burst('fade', this.burstCells(snap), snap.bc, true); }
        for (let i = 0; i < snap.loose.length && e < 0.32; i++) this.mino(ctx, look, snap.loose[i].color, this.bx + i * snap.bc, this.bb - snap.bc, snap.bc);
        if (e > 0.32) this.collectA = null;
        return;
      }
      if (e >= C_GLAZE && !ca.burst) {
        // The equipped clear, once, over every collected cell. Its plain shrinking squares are left out: the block
        // shrinks away itself as it rises (so the default effect is the block), and a copy left in place would read
        // as a ghost of the rows.
        ca.burst = true;
        const n = this.fx.parts.length;
        this.fx.burst(ca.effect, this.burstCells(snap), snap.bc, false);
        for (let i = this.fx.parts.length - 1; i >= n; i--) if (this.fx.parts[i].kind === 'sq') this.fx.parts.splice(i, 1);
      }
      // The block lifts a row of the bin (never less than half a floor cell, so a bin of small cells still lifts).
      const k = e < C_GLAZE ? 0 : clamp01((e - C_GLAZE) / C_RISE), dy = -easeOut(k) * Math.max(snap.bc, 0.5 * cs);
      if (k < 1) {
        // The glaze holds while the cells shrink toward their centres and fade late: no frame shows dim rows.
        const glaze = e < C_GLAZE ? 0.3 * (e / C_GLAZE) : 0.3;
        this.paintBlock(ctx, look, snap, dy, 1 - easeIn(clamp01((k - 0.2) / 0.6)), glaze, 1 - 0.85 * easeIn(k));
      }
      // Loose minos: carried up on the block, then down to the bottom row.
      if (e < C_END) {
        const f = e < C_LOOSE ? 0 : easeIn(clamp01((e - C_LOOSE) / C_FALL));
        for (let i = 0; i < snap.loose.length; i++) {
          const m = snap.loose[i], tx = this.bx + i * snap.bc, y0 = m.y + dy, y1 = this.bb - snap.bc;
          this.mino(ctx, look, m.color, this.px(m.x + (tx - m.x) * f), this.px(y0 + (y1 - y0) * f), snap.bc);
        }
      } else this.collectA = null;
    }

    /** The collected block at a lift of dy px: its cells (scaled about their centres by sc), glazed. */
    paintBlock(ctx, look, snap, dy, alpha, glaze, sc) {
      if (alpha <= 0.001) return;
      for (let i = 0; i < snap.cells.length; i++) {
        const c = snap.cells[i], w = this.px(c.w * sc), hh = this.px(c.h * sc);
        if (w * this.dpr < 1 || hh * this.dpr < 1) continue;
        const x = this.px(c.x + (c.w - w) / 2), y = this.px(c.y + dy + (c.h - hh) / 2);
        if (snap.flat) {
          ctx.globalAlpha = alpha; ctx.fillStyle = c.color; ctx.fillRect(x, y + 1 / this.dpr, w - 1 / this.dpr, hh - 1 / this.dpr);
          if (glaze > 0.005) { ctx.fillStyle = white(glaze); ctx.fillRect(x, y + 1 / this.dpr, w - 1 / this.dpr, hh - 1 / this.dpr); }
          ctx.globalAlpha = 1;
          continue;
        }
        this.cell(ctx, look, c.color, x, y, w, hh, alpha < 1 ? alpha : null);
        if (glaze > 0.005) { ctx.fillStyle = white(glaze * alpha); rr(ctx, x + 1, y + 1, w - 2, hh - 2, w * 0.17); ctx.fill(); }
      }
    }

    /** The collected cells for the clear effect, all at once: at most 120 (whole rows, sampled). */
    burstCells(snap) {
      const cols = snap.cols, rows = Math.ceil(snap.cells.length / cols), every = Math.max(1, Math.ceil((rows * cols) / 120)), out = [];
      for (let r = 0; r < rows; r += every) for (let c = 0; c < cols; c++) { const cell = snap.cells[r * cols + c]; if (cell) out.push({ x: cell.x, y: cell.y, color: cell.color }); }
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
