// Lull — the Factory floor: a small scene on the board's own plate, in the board's materials, that reads as one chain.
// Down the left, three tiers: at the top, stamp heads stamp raw grey minos onto a top belt, which rolls them into the
// store below it; under the store, the four assembly presses draw raw minos down their feed tubes one at a time and
// set them in the piece's colour, then drop each finished piece onto the belt. At the belt's end a piece slides onto
// the shipping conveyor that fills the right column, rides up it lying flat on a cleat, and at the station under the
// collector its minos leave one by one, along their row into the chute cut into the column's right post, up it at a
// steady pace and over the collector's rim. Every mino held anywhere is drawn
// as a mino, in whole device pixels. No text is drawn here: names and numbers live in the page around it.
//
// The scene is 37.5 cells across and as many high as the room the window leaves it (the bar and the list as they are
// now), so it grows when the list shrinks; what a taller scene gains goes to the store (its slots within a share of
// the plate, so an empty store is never the biggest thing on it), to taller machinery (the heads and presses hang
// lower, the drop grows), to the collector's slots and to the conveyor's length, never to empty floor. Its still parts are painted once into offscreen layers (the floor; the
// collector's rail, walls and rack), repainted only when what they show changes, and the store's and the collector's
// minos into two more; a frame is those images, the moving parts and the minos on their way. The model moves in
// quarter-second ticks: everything that moves is drawn between where it was a tick ago and where it is.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { rr, rgba, mix, ghostCell, cellSprite, FX, FONT } = Render;
  const T = Factory.TUNE;

  // ---- the scene, in cells (y down from the scene's top) --------------------------------------------------------

  const LAYOUT = {
    COLS: 37.5,
    CS: { min: 6, max: 22 },            // the cell size, CSS px: from the plate's width, within these
    // The scene's height follows the room the window leaves it: never less than HMIN cells, never more than HTOP.
    // The left column's tiers have fixed heights (LEFT_FIXED) and share what is left: the store's rack takes slots
    // no bigger than keeps it to STORE_SHARE of the plate, and the machinery grows by the rest (the heads and the
    // presses hang lower, the drop to the belt grows), by GROW cells at most; past that the store's slots grow again
    // (STORE_MAX at most), so a tall scene is never empty floor. The collector about a third of the right column, the
    // conveyor the rest. Every tray keeps its room at every size: a bigger size packs its minos smaller into it.
    HMIN: 23, HTOP: 84, HROWS: 27,      // HROWS: the least height (cells) the plate needs beside the list as rows
    STORE_SHARE: 0.2, STORE_MAX: 3, CRATE_MAX: 1.5, // the store's share of the plate; the biggest store and collector slots
    GROW: 12,                           // the most the machinery grows before the store's slots grow past their share
    HANG: { heads: 1.5, drop: 1 },      // of the growth, the most the stamp heads hang lower and the drop grows (presses: the rest)
    STORE_TOP: 5.25,                    // the store's rim (heads unhung): the top belt's end pours in just above it
    BEAM_H: 0.6,                        // the store's floor plate, which is also the gantry beam (SB … Bb)
    WIN_DY: 6.8,                        // the presses' hanging point to the mold windows' bottoms (WB)
    DROP_DY: 4.25,                      // the windows' bottoms to the belt's surface (BY): a piece's drop, at least
    FLOOR_DY: 1.25,                     // the belt's surface to the floor line (FY)
    GROUND: 0.75,                       // the floor line to the scene's bottom
    POST: { x0: 0.35, x1: 0.65 },
    // The top tier (y before the heads' hang).
    SBEAM: { x0: 0.35, x1: 25.2, y0: 0.25, y1: 0.8 },
    HEAD: { w: 1.8, y0: 0.8, y1: 1.55, rod: 0.28, ramW: 1.4, ramH: 0.3, rest: 1.95, die: 0.75, dy0: 2.2, dy1: 3.4, cy0: 2.3, cy1: 3.3 },
    TOPB: { x0: 0.75, x1: 26.75, y: 4.5, y1: 4.85, rollers: [0.95, 26.55], r: 0.3, hangers: [6.25, 12.75, 20.25] },
    STORE: { x0: 0.75, x1: 27.75, wall: 0.25, plate0: 0.35, plate1: 28.25 },
    // The assembly tier, from the presses' hanging point.
    PRESS: { hw: 2.4, hh: 1.0, cw: 0.7, ch: 0.6, ramH: 0.4, rest: 0.5, rod: 0.3 },
    HMAX: [2, 3, 3, 4],                 // each mold window's inner height (the tallest shape of its size, lying flat)
    BELT_X0: 0.5,                       // the belt's model x = 0, in the scene
    LEGS: [3.5, 10.5, 17.5, 24.5],
    ROLLER_R: 0.34,
    // The shipping corridor, the right column: a broad conveyor from the belt's end up to the head rail (its rails,
    // the band between, a wheel at each end), the pieces riding up it lying flat on cleats, as they left the belt; the
    // collector hung across the column's top, its floor on the head rail; and down the column's right edge a post with
    // a narrow chute cut into it, open to the band at the station, that carries each mino of a piece there up and over
    // the collector's rim.
    BAND: { x0: 28.8, x1: 37.2, in1: 36.1, rail: 0.22, foot: 0.45, head: 0.25 }, // in1: the band's inner right edge (the post's left)
    CHUTE: { x0: 36.18, x1: 36.98 },
    CRATE: { x0: 28.8, x1: 36.05, wall: 0.25, rail0: 28.7, rail1: 37.25, ry0: 0.25, ry1: 0.6, rimMin: 1.6, foot: 0.3 },
    STATION_DY: 4.75,                   // the collector's floor to the station (a piece's bottom there; 4 cells of piece)
    LIFT_K: 0.8,                        // the least cells a model row of the conveyor takes (pieces lie flat: w + gap ≥ h)
  };
  const { COLS, POST, SBEAM, HEAD, TOPB, STORE, PRESS, HMAX, LEGS, BAND, CHUTE, CRATE } = LAYOUT;
  const X0 = LAYOUT.BELT_X0;
  const MINBC = 3;                   // the smallest mino cell, in device px (below it only where nothing bigger fits)
  const FLATBC = 8;                  // cells smaller than this (device px) are plain flat squares with a gap
  const ROLLERS = [X0, X0 + 27.9];
  const LEFT_FIXED = LAYOUT.STORE_TOP + LAYOUT.BEAM_H + LAYOUT.WIN_DY + LAYOUT.DROP_DY + LAYOUT.FLOOR_DY + LAYOUT.GROUND; // 18.9
  const CRATE_IN = CRATE.x1 - CRATE.x0 - 2 * CRATE.wall; // the collector's inside width
  const q4 = (v) => Math.round(v * 4) / 4;

  /**
   * The biggest slot (device px, whole, at most max) that packs n minos into a box w by h (device px), and of the
   * packings at that slot the one with the fewest empty slots (then the widest): its slot, columns and rows. A packing whose top row
   * would hold under a quarter of a row (a lone slot or two over the rest) gives way to a tidy one a slot at most
   * TIDY device px (or 15%) smaller. Only a box too small for n minos at MINBC (a 1x screen at the smallest scenes) goes below
   * MINBC.
   */
  const TIDY = 2;
  const ragged = (n, c) => { const r = n % c; return r > 0 && r < c / 4; };
  function pack(n, w, h, max) {
    let best = null, tidy = null;
    for (let c = 1; c <= Math.min(n, w); c++) {
      const rows = Math.ceil(n / c), p = Math.min(max, Math.floor(w / c), Math.floor(h / rows));
      if (p < 1) continue;
      const g = { p, cols: c, rows }, better = (b) => !b || p > b.p || (p === b.p && c * rows <= b.cols * b.rows);
      if (better(best)) best = g;
      if (!ragged(n, c) && better(tidy)) tidy = g;
    }
    if (best && ragged(n, best.cols) && tidy && tidy.p >= best.p - Math.max(TIDY, Math.floor(0.15 * best.p))) best = tidy;
    return best || { p: 1, cols: Math.max(1, w), rows: Math.ceil(n / Math.max(1, w)) };
  }

  /** The store at size l, n minos, in a scene H cells high whose left column has Hs cells for the store and the
   *  machinery's growth (u: device px a cell; w: the tray's width, device px). Its slots no bigger than keeps the rack
   *  to STORE_SHARE of the plate; where that would leave the machinery to grow by more than GROW, as big as fills the
   *  rest (STORE_MAX at most). */
  function storePack(n, H, Hs, u, w) {
    const share = Math.sqrt((LAYOUT.STORE_SHARE * COLS * H) / n);
    let g = pack(n, w, Math.floor(Hs * u), Math.floor(Math.min(LAYOUT.STORE_MAX, share) * u));
    if (Hs - (g.rows * g.p) / u > LAYOUT.GROW) g = pack(n, w, Math.floor((Hs - LAYOUT.GROW) * u), Math.floor(LAYOUT.STORE_MAX * u));
    return g;
  }

  /**
   * A scene H cells high (a quarter cell at a time, HMIN … HTOP) with the store at size lv (the biggest if not
   * given): where each tier sits, the collector's height (about a third of the column, the conveyor keeping at least
   * LIFT_K a model row), the station and the conveyor's scale (a model row is k cells). Given the cell size (CSS px)
   * and the device pixel ratio, also each store and collector size's packing (store[l], crate[l]: slot in device px,
   * columns, rows; each store size as packed in its own scene) and the machinery's growth: what the store's rack
   * leaves of the left column, shared between the stamp heads' hang (ht), the presses' (hp) and the drop (dd).
   */
  function sceneOf(H, cs, dpr, lv) {
    H = Math.max(LAYOUT.HMIN, Math.min(LAYOUT.HTOP, q4(H)));
    const top = T.STORE_ROWS.length - 1;
    lv = lv == null ? top : Math.max(0, Math.min(top, lv | 0));
    const Hs = H - LEFT_FIXED, FY = H - LAYOUT.GROUND, BY = FY - LAYOUT.FLOOR_DY;
    const most = BY - CRATE.rimMin - LAYOUT.STATION_DY - T.LIFT.len * LAYOUT.LIFT_K;
    const Hc = Math.max(5.5, Math.min(most, q4(H * 0.3)));
    const CB = CRATE.rimMin + Hc, RAIL = CB + CRATE.foot, STATION = CB + LAYOUT.STATION_DY;
    const S = { name: 'H' + H + 's' + lv, H, lv, Hs, BY, FY, Hc, CB, RAIL, STATION, k: (BY - STATION) / T.LIFT.len, ht: 0, hp: 0, dd: 0, grow: 0, store: null, crate: null, grid: Hs };
    if (cs) {
      const d = dpr || 1, u = cs * d, w = Math.floor((STORE.x1 - STORE.x0) * u);
      S.store = T.STORE_ROWS.map((r) => storePack(T.STORE_COLS * r, H, Hs, u, w));
      S.crate = T.CRATE_ROWS.map((_, l) => pack(Factory.crateMinos(l), Math.floor(CRATE_IN * u), Math.floor(Hc * u), Math.floor(LAYOUT.CRATE_MAX * u)));
      const g = S.store[lv];
      S.grid = (g.rows * g.p) / u;
      S.grow = Math.max(0, Hs - S.grid);
      S.ht = Math.min(LAYOUT.HANG.heads, 0.15 * S.grow); S.dd = Math.min(LAYOUT.HANG.drop, 0.15 * S.grow); S.hp = S.grow - S.ht - S.dd;
    }
    S.ST = LAYOUT.STORE_TOP + S.ht;             // the store's rim
    S.SB = S.ST + S.grid;                       // its floor: the gantry beam's top
    S.Bb = S.SB + LAYOUT.BEAM_H;                // the beam's bottom
    S.PB = S.Bb + S.hp;                         // where the presses' housings hang
    S.WB = S.PB + LAYOUT.WIN_DY;                // the mold windows' bottoms
    S.drop = LAYOUT.DROP_DY + S.dd;             // the windows' bottoms to the belt (BY - WB)
    return S;
  }

  /**
   * The list's form, the cell size and the scene's height, from the room: w, the plate's inner width; room.left, the
   * height the plate may take with no list under it; room.listH(form, n), the list's height in each form, as it is
   * now or with n entries; innerH, the view's own inner height. The list is rows where the room holds all four rows
   * beside a scene HROWS high, else cards: by the window alone, so a purchase never turns the list from one form to
   * the other, and all the room an entry leaves goes to the scene. A phone on its side takes the whole height for
   * the plate and lets the rest scroll.
   */
  function fit(w, room) {
    const csw = Math.max(LAYOUT.CS.min, Math.min(LAYOUT.CS.max, Math.floor(w / COLS)));
    const form = !room.sideways && room.left - room.listH('rows', 4) >= csw * LAYOUT.HROWS ? 'rows' : 'cards';
    const avail = room.sideways ? room.innerH : room.left - room.listH(form);
    let cs = Math.min(csw, Math.floor(avail / LAYOUT.HMIN));
    if (cs < LAYOUT.CS.min) cs = Math.min(csw, Math.floor(room.innerH / LAYOUT.HMIN));
    cs = Math.max(LAYOUT.CS.min, cs);
    // Down to the quarter cell (never over the room), within HMIN … HTOP.
    const H = Math.max(LAYOUT.HMIN, Math.min(LAYOUT.HTOP, Math.floor((avail / cs) * 4) / 4));
    return { form, cs, H };
  }

  // ---- motion (seconds) -------------------------------------------------------------------------------------------

  const DROP = 0.32, DROP_SETTLE = 0.08, GHOSTS_AT = DROP + 0.25, GHOSTS_FADE = 0.2;
  const STAMP_DOWN = 0.11, STAMP_HOLD = 0.07, STAMP_UP = 0.38, FLASH = 0.25;
  const MINO_DROP = 0.2;             // a stamped mino, from the die onto the top belt
  const ARC = 0.15, SETTLE = 0.06;   // a raw mino over the top belt's end roller into the store; any mino settling
  const TAKE = 0.15;                 // a store cell shrinking away as a press takes it
  const GLIDE = 0.2;                 // a fed mino from the tube's mouth to its place in the mold
  const TURN = { slide: 0.35, ease: 0.25 };  // a piece sliding off the belt's end onto the conveyor's foot, then rising
  const HOP_EVERY = 0.3;             // a shipped piece's minos leave this far apart
  const ACROSS = 0.4;               // a mino's move along its row into the chute's mouth
  const RISE_CELL = 0.11;            // seconds a cell up the chute, at its steady pace (its dots move at the same)
  const RISE_EASE = 0.12;            // seconds a rise spends speeding up, and again slowing down (short: minos keep their spacing)
  /** A rise of d cells: its time, at a steady pace of a cell every RISE_CELL with RISE_EASE to speed up and to slow
   *  down (a short one eases all the way). */
  const riseTime = (d) => Math.max(2 * RISE_EASE, d * RISE_CELL + RISE_EASE);
  /** How far along a rise of d cells (0–1) a mino is e seconds into it. */
  const riseAt = (e, d) => {
    const T = riseTime(d), a = RISE_EASE, V = 1 / RISE_CELL;
    if (e <= 0) return 0;
    if (e >= T) return 1;
    if (d < V * a) return easeInOut(e / T);
    const x = e < a ? (V * e * e) / (2 * a) : e > T - a ? d - (V * (T - e) * (T - e)) / (2 * a) : V * (e - a / 2);
    return x / d;
  };
  const GROW = 0.5, BUILD = 0.6;
  const STORE_EASE = 4;              // minos under full a store may fall and keep its warm cues (see render)
  // Collect: a glaze, then the block lifts a row and clears (its cells shrinking, as a cleared line does in Play);
  // the loose minos ride up on top of it, and drop to the bottom once it has gone.
  const C_GLAZE = 0.12, C_RISE = 0.36, C_LOOSE = 0.46, C_FALL = 0.26, C_END = C_LOOSE + C_FALL;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
  const easeIn = (k) => k * k;
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;

  const cssVar = (k, dflt) => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim() || dflt; } catch (e) { return dflt; } };
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  // Pale overlays in ten steps, so a fading glaze or flash never builds a new colour string each frame.
  const WHITE = Array.from({ length: 11 }, (_, i) => 'rgba(255,255,255,' + (i / 10) * 0.3 + ')');
  const white = (a) => WHITE[Math.max(0, Math.min(10, Math.round((a / 0.3) * 10)))];

  /** Each press's mold window, relative to the gantry beam: left edge, width, height, centre, and its feed tube's left
   *  edge (x in cells). */
  const WIN = T.MOLDS.map((n, k) => {
    const x = X0 + Factory.BAY_X[k] + 0.25;
    return { x, w: n + 1, h: HMAX[k], cx: x + (n + 1) / 2, tube: x + 0.25 };
  });
  /** Each stamp head's centre: over its bay (the top belt starts at TOPB.x0; a mino is set at STAMP_X). */
  const HEADX = T.STAMP_X.map((sx) => TOPB.x0 + sx + 0.5);

  /** A shape's cells, bottom row first and left to right: the order a press sets them in. */
  const order = new WeakMap();
  function formOrder(cells) {
    let o = order.get(cells);
    if (!o) { o = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]); order.set(cells, o); }
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
  /** A piece lying flat on the conveyor: its cells, its outline, and the order its minos leave the station in (the top
   *  row first, nearest the chute first). */
  const flats = new WeakMap();
  function flatOf(cells) {
    let o = flats.get(cells);
    if (o) return o;
    o = { cells, w: cells.w, leave: cells.slice().sort((a, b) => b[1] - a[1] || b[0] - a[0]), outline: outlineOf(cells) };
    flats.set(cells, o);
    return o;
  }
  /** A flat piece's left edge on the conveyor, in scene cells: centred on the band. */
  const liftX = (w) => (BAND.x0 + BAND.rail + BAND.in1) / 2 - w / 2;
  /** The chute's channel: its top (just under the collector's rail) and its foot (under the station's bottom row). */
  const CHUTE_TOP = CRATE.ry1 + 0.05, CHUTE_FOOT = 0.2;

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

  /** A layer's key, compared value by value (and updated): whether it is unchanged. */
  const same = (key, vals) => {
    let ok = key.length === vals.length;
    for (let i = 0; i < vals.length; i++) { if (key[i] !== vals[i]) ok = false; key[i] = vals[i]; }
    key.length = vals.length;
    return ok;
  };

  class FloorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.plate = canvas.closest ? canvas.closest('.fac-plate') : null;
      this.fx = new FX();
      this.t = 0;
      this.w = 1; this.h = 1; this.dpr = 1; this.cs = 8; this.ox = 0; this.oy = 0; this.plateH = 0; this.plateW = 0;
      this.lv = 0;                               // the store's size the scene is laid out for
      this.S = sceneOf(LAYOUT.HMIN, 8, 1, 0); this.scene = this.S.name; this.form = 'rows';
      this.a = 0;                                // how far into the current tick the model is (0–1)
      // The collector as drawn: its cell (device px, and CSS px), its grid's left edge and width, the tray's rim and
      // floor (CSS px), its rows and columns, and the size laid out.
      this.bcD = 1; this.bc = 1; this.bx = 0; this.bw = 4; this.bt = 0; this.bb = 0; this.rows = 12; this.cols = 4; this.lvShown = -1;
      this.storeShown = -1;
      // The store as drawn: its cell (device px and CSS px), columns and rows, the grid's left edge, the tray's rim and
      // floor (CSS px).
      this.scD = 1; this.scc = 1; this.scols = 27; this.srows = 4; this.sx0 = 0; this.st = 0; this.sb = 0;
      this.drawnRack = { store: 0, crate: 0 }; this.drawnWell = { store: 0, crate: 0 }; // what the last frame drew
      this.slideTop = 0; this.slideBelt = 0; this.chain = 0; this.chute = 0; // treads and the lift's chain, in cells
      this.headAt = [-9, -9, -9, -9];            // each stamp head's last stroke
      this.stampAt = [-9, -9, -9, -9];           // each press ram's last stroke
      this.stampReal = [false, false, false, false];
      this.built = [-9, -9, -9, -9];             // when each press was built (it fades in)
      this.headBuilt = [-9, -9, -9, -9];         // and each stamp head
      this.ghostsAt = [-9, -9, -9, -9];          // when each window's next ghosts start to fade in
      this.drops = new WeakMap();                // belt piece → when it left its press
      this.stamped = new WeakMap();              // top-belt mino → when it was stamped
      this.turns = new WeakMap();                // conveyor piece → when it began to slide on
      this.tubes = [null, null, null, null];     // a raw mino on its way down each press's feed tube: { t0 }
      this.hover = null;                         // { kind, k } from a hotspot
      this.preview = false;                      // Collect is hovered or focused: show what it takes
      this.reduced = false;
      this.staticDraws = 0;                      // how often the still layers were painted (idle: never)
      this.flags = { crateFull: false, storeFull: false, storeWarm: false, starving: [], pressHeld: [], stampHeld: [] };
      // Minos on their way into the store, and into the crate; what is left of a shipped piece at the station.
      this.storeRiders = []; this.storeInflight = 0; this.storeExpect = -1;
      this.takes = [];                           // store cells shrinking away, and riders fading, as presses take them
      this.station = null; this.riders = []; this.inflight = 0; this.expectLen = -1;
      this.collectA = null;                      // the block lifting out of the crate
      this.catchA = null;                        // minos made while away, fading in (store and crate)
      this.floorC = null; this.crateC = null; this.storeMinoC = null; this.crateMinoC = null;
      this.floorKey = []; this.crateKey = []; this.storeMinoKey = []; this.crateMinoKey = [];
      this.styTheme = null; this.sty = null; this.sprites = new Map();
      this.at = { x: 0, y: 0 }; this.at2 = { x: 0, y: 0, s: 0, done: false };
    }

    // ---- layout -----------------------------------------------------------------------------------------------------

    /** The plate's inner width at full width (the column's, less the plate's hairline), as the layout reads it: never
     *  the plate's own, which narrows to a scene capped by the height. */
    boxWidth() {
      const col = this.plate && this.plate.parentElement;
      if (col) return Math.max(1, Math.round(col.clientWidth) - 2);
      const box = this.canvas.parentElement || this.canvas;
      return Math.max(1, Math.round(box.clientWidth));
    }

    /** Fits the scene to the plate (fit(): the form, the height and the cell size). A scene whose cell is capped by
     *  the height, not the width, gets a plate its own width (a cell of margin each side), centred, rather than a
     *  full-width plate with empty strips either side. Instant: the plate never animates its size. */
    resize(lay) {
      const full = this.boxWidth(), cs = lay.cs, dpr = Math.min(3, root.devicePixelRatio || 1), S = sceneOf(lay.H, cs, dpr, this.lv);
      const csw = Math.max(LAYOUT.CS.min, Math.min(LAYOUT.CS.max, Math.floor(full / COLS)));
      const w = cs < csw ? Math.min(full, Math.ceil(COLS * cs + 2 * cs)) : full;
      const ph = Math.round(cs * S.H);
      if (this.plate && this.plateH !== ph) { this.plate.style.height = ph + 'px'; this.plateH = ph; }
      if (this.plate && this.plateW !== w) { this.plate.style.width = w < full ? w + 2 + 'px' : ''; this.plateW = w; }
      const h = Math.max(1, ph - 2); // inside the plate's hairline
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      if (S.name !== this.scene || cs !== this.cs) { this.flushAll(); this.lvShown = -1; this.storeShown = -1; }
      this.S = S; this.scene = S.name; this.form = lay.form;
      this.cs = cs;
      this.ox = Math.round((w - COLS * cs) / 2);
      this.oy = 0;
    }

    /** The scene for the store's size now: a bigger store takes more of the left column and the machinery hangs
     *  shorter (instant, as a bigger size repacks at once). */
    sync(f) {
      const lv = f ? f.storeLevel | 0 : this.lv;
      if (lv === this.lv && this.S.lv === lv) return;
      this.lv = lv;
      const S = sceneOf(this.S.H, this.cs, this.dpr, lv);
      if (S.name !== this.scene) { this.flushAll(); this.lvShown = -1; this.storeShown = -1; }
      this.S = S; this.scene = S.name;
    }

    X(c) { return this.ox + c * this.cs; }
    Y(r) { return this.oy + r * this.cs; }
    /** A length in CSS px, snapped to the device pixel grid. */
    px(v) { return Math.round(v * this.dpr) / this.dpr; }
    /** A scene x or y, in CSS px on the device pixel grid. */
    PX(c) { return this.px(this.X(c)); }
    PY(r) { return this.px(this.Y(r)); }
    /** A y in the top tier (the heads, their dies and the top belt), lowered by the heads' hang. */
    HY(r) { return this.PY(r + this.S.ht); }

    /** The store at size l: its cell (device px and CSS px), its columns and rows, where its grid starts (centred in
     *  the tray, in whole device pixels), and the tray's rim and floor. */
    storeGeom(l) {
      const g = this.S.store[Math.max(0, l)];
      this.scD = g.p; this.scc = g.p / this.dpr; this.scols = g.cols; this.srows = g.rows;
      const room = (STORE.x1 - STORE.x0) * this.cs;
      this.sx0 = this.px(this.X(STORE.x0) + (room - this.scols * this.scc) / 2);
      // The rim is the grid's top (the tray is exactly the grid, rim to beam), in whole device pixels from the beam.
      this.sb = this.PY(this.S.SB); this.st = Math.min(this.PY(this.S.ST), this.sb - this.srows * this.scc);
    }
    /** A store size's rows, as drawn. */
    storeRowsAt(l) { return this.S.store[Math.max(0, l)].rows; }

    /** Lays the collector and the store out for this frame, at their sizes now (a bigger size repacks at once: the
     *  trays themselves never change size). */
    layout(f) {
      this.sync(f);
      this.storeGeom(f.storeLevel);
      const l = f.crateLevel, g = this.S.crate[l], d = this.dpr;
      this.bcD = g.p; this.bc = g.p / d; this.rows = g.rows; this.cols = g.cols; this.bw = (g.cols * g.p) / d;
      this.bb = this.PY(this.S.CB); this.bt = this.PY(CRATE.rimMin);
      this.bx = this.px(this.X((CRATE.x0 + CRATE.x1) / 2) - this.bw / 2);
      this.tx0 = this.PX(CRATE.x0 + CRATE.wall); this.tx1 = this.PX(CRATE.x1 - CRATE.wall);
      this.lvShown = l; this.storeShown = f.storeLevel;
    }

    /** A hotspot's rectangle in CSS px (relative to the plate): a stamp head, the store, a bay (housing and window), or
     *  the collector with its rail. */
    rect(kind, k, f) {
      this.sync(f);
      const cs = this.cs, S = this.S;
      if (kind === 'crate') {
        const x0 = this.X(CRATE.x0 - 0.1), x1 = this.X(CRATE.x1 + 0.1);
        return { x: x0, y: this.Y(CRATE.ry0), w: x1 - x0, h: this.Y(S.RAIL + 0.2) - this.Y(CRATE.ry0) };
      }
      if (kind === 'store') {
        const top = this.Y(S.ST - 0.25);
        return { x: this.X(STORE.x0 - STORE.wall), y: top, w: (STORE.x1 - STORE.x0 + 2 * STORE.wall) * cs, h: this.Y(S.Bb) - top };
      }
      if (kind === 'head' || kind === 'headBay') {
        const cx = HEADX[k];
        return { x: this.X(cx - 1.25), y: this.Y(HEAD.y0 - 0.3 + S.ht), w: 2.5 * cs, h: (HEAD.dy1 - HEAD.y0 + 0.6) * cs };
      }
      const b = WIN[k];
      return { x: this.X(b.x - 0.2), y: this.Y(S.Bb + 0.05), w: (b.w + 0.4) * cs, h: (S.WB + 0.3 - S.Bb - 0.05) * cs };
    }

    /** A value that changes whenever a hotspot would move. */
    layoutKey(f) { this.sync(f); return [this.w, this.cs, this.ox, this.scene, f.stampers, f.presses, f.storeLevel, f.crateLevel].join('|'); }

    // ---- the store and the crate ------------------------------------------------------------------------------------

    /** How many minos are drawn in the crate: everything but those still on their way from the conveyor. */
    landed(f) { return Math.max(0, f.crate.length - this.inflight); }
    /** How many are drawn in the store: everything but those still rolling in. */
    storeLanded(f) { return Math.max(0, f.store - this.storeInflight); }

    /** Where mino i of the store sits (it fills row by row from its floor, left to right): its cell's left and top. */
    storeSlot(i, out) {
      out.x = this.sx0 + (i % this.scols) * this.scc;
      out.y = this.sb - (Math.floor(i / this.scols) + 1) * this.scc;
      return out;
    }
    /** Where mino i of the crate sits (it fills row by row from its floor, left to right): its cell's left and top. */
    crateSlot(i, out) {
      out.x = this.bx + (i % this.cols) * this.bc;
      out.y = this.bb - (Math.floor(i / this.cols) + 1) * this.bc;
      return out;
    }

    // ---- events -----------------------------------------------------------------------------------------------------

    /** Step events become motion: heads stamp, minos roll into the store and down the tubes, rams set them, pieces drop,
     *  ride the conveyor up flat, and their minos climb the chute into the crate. */
    events(evs, f, reduced) {
      this.reduced = !!reduced;
      let shipped = 0, stored = 0, fed = 0;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        if (e.kind === 'ship') shipped += e.item.n; else if (e.kind === 'store') stored++; else if (e.kind === 'feed') fed++;
      }
      if (this.expectLen >= 0 && f.crate.length !== this.expectLen + shipped) this.flushLift();
      if (this.storeExpect >= 0 && f.store !== this.storeExpect + stored - fed) this.flushStore();
      // The store's and the crate's counts as these events happened, one by one (each mino on its way has its slot).
      let sv = f.store - stored + fed, cv = f.crate.length - shipped;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        if (e.kind === 'stamp') { this.headAt[e.j] = this.t; this.stamped.set(e.item, this.t); }
        else if (e.kind === 'store') { sv++; if (!this.reduced) { this.storeRiders.push({ t0: this.t, idx: sv - 1 }); this.storeInflight++; } }
        else if (e.kind === 'feed') { sv--; this.fed(e.k, sv); }
        else if (e.kind === 'mino') { this.stampAt[e.k] = this.t; this.stampReal[e.k] = true; }
        else if (e.kind === 'drop') { this.drops.set(e.item, this.t); this.ghostsAt[e.k] = this.t + GHOSTS_AT; this.tubes[e.k] = null; }
        else if (e.kind === 'lift') { if (!this.reduced) this.turns.set(e.item, this.t); }
        else if (e.kind === 'ship') { this.ship(e.item, cv); cv += e.item.n; }
      }
      this.expectLen = f.crate.length;
      this.storeExpect = f.store;
    }

    /** A press takes a mino from the store (leaving `left`): the store's last cell shrinks away (or, if one is still
     *  rolling in, that one fades), and a raw mino drops down the press's feed tube. */
    fed(k, left) {
      if (this.reduced) return;
      if (this.storeRiders.length) {
        const r = this.storeRiders.pop();
        this.storeInflight--;
        const p = this.storeRiderPos(r, {});
        this.takes.push({ x: p.x, y: p.y, s: p.s, t0: this.t, fade: true });
      } else {
        this.storeSlot(left, this.at);
        this.takes.push({ x: this.at.x, y: this.at.y, s: this.scc, t0: this.t, fade: false });
      }
      this.tubes[k] = { t0: this.t };
    }

    /** A piece has shipped (in the model): it waits at the station, and its minos leave for the crate one by one, into
     *  its slots from idx0 on. */
    ship(item, idx0) {
      if (this.reduced) return;
      if (this.station) this.landStation();
      const cells = Factory.shapes(item.n)[item.s];
      this.station = { item, stand: flatOf(cells), color: item.c, n: item.n, idx0, next: 0, t0: this.t };
      this.inflight += item.n;
    }

    /** What is left of the piece at the station lands at once. */
    landStation() {
      const s = this.station;
      if (!s) return;
      this.inflight = Math.max(0, this.inflight - (s.n - s.next));
      this.station = null;
    }

    /** Everything on its way to the crate lands at once (a collect, a bigger crate, time away, a tab change). */
    flushLift() {
      this.station = null;
      this.riders.length = 0;
      this.inflight = 0;
      this.expectLen = -1;
    }

    /** Everything on its way into the store lands at once. */
    flushStore() {
      this.storeRiders.length = 0;
      this.storeInflight = 0;
      this.takes.length = 0;
      this.storeExpect = -1;
    }

    flushAll() {
      this.flushLift(); this.flushStore();
      this.tubes = [null, null, null, null];
    }

    /** Every passing motion finished at once (the tab is left or shown): the view's clock stops while it is away, so
     *  nothing half-played may resume on return. */
    settle() {
      this.flushAll();
      this.collectA = null; this.catchA = null;
      this.fx.clear();
      this.drops = new WeakMap(); this.stamped = new WeakMap(); this.turns = new WeakMap();
      for (let k = 0; k < 4; k++) { this.stampAt[k] = -9; this.stampReal[k] = false; this.built[k] = -9; this.headBuilt[k] = -9; this.ghostsAt[k] = -9; this.headAt[k] = -9; }
      this.lvShown = -1; this.storeShown = -1; // the next frame lays everything out afresh
    }

    builtPress(k) {
      this.built[k] = this.t;
      if (!this.reduced) { this.stampAt[k] = this.t + BUILD; this.stampReal[k] = false; }
    }
    builtHead(j) { this.headBuilt[j] = this.t; }

    // ---- minos on their way -----------------------------------------------------------------------------------------

    /** A raw mino rolling into the store: over the top belt's end roller, down the store's right column to its row, and
     *  left along the row to its slot. Its place now (CSS px: left, top, size), and whether it has landed. */
    storeRiderPos(r, out) {
      const cs = this.cs, e = this.t - r.t0, scc = this.scc;
      this.storeSlot(Math.max(0, r.idx), this.at);
      const tx = this.at.x, ty = this.at.y;
      const x0 = this.X(TOPB.x0 + T.TOP.len - 1), y0 = this.Y(TOPB.y + this.S.ht) - cs;       // on the belt's end
      const rx = this.sx0 + (this.scols - 1) * scc, ry = this.Y(TOPB.y1 + 0.05 + this.S.ht);  // over the store's right column
      const fall = Math.max(0.05, 0.12 * Math.sqrt(Math.max(0.25, (ty - ry) / cs)));
      const slide = 0.1 + 0.022 * Math.max(0, (rx - tx) / cs);
      out.done = false;
      if (e < ARC) {
        const k = e / ARC, ek = easeInOut(k);
        out.x = lerp(x0, rx, ek); out.y = lerp(y0, ry, ek) - Math.sin(Math.PI * k) * 0.3 * cs; out.s = lerp(cs, scc, ek);
      } else if (e < ARC + fall) {
        out.x = rx; out.y = lerp(ry, ty, easeIn((e - ARC) / fall)); out.s = scc;
      } else if (e < ARC + fall + slide) {
        out.x = lerp(rx, tx, easeInOut((e - ARC - fall) / slide)); out.y = ty; out.s = scc;
      } else { out.x = tx; out.y = ty; out.s = scc; out.done = e >= ARC + fall + slide + SETTLE; }
      return out;
    }

    /** A mino leaving the station for the collector: along its row into the chute's mouth (shrinking to fit the
     *  chute), up the chute at a steady pace to the hop line over the collector's rim, across (taking the collector's
     *  cell), and down to its slot. */
    crateRiderPos(r, out) {
      const cs = this.cs, e = this.t - r.t0, bc = this.bc;
      this.crateSlot(r.idx, this.at);
      const tx = this.at.x, ty = this.at.y;
      const x0 = this.X(r.col), y0 = this.Y(this.S.STATION - r.row) - cs;
      const ms = this.chuteMino(), cx = this.px(this.X((CHUTE.x0 + CHUTE.x1) / 2) - ms / 2), hy = this.chuteStop(ms);
      const across = ACROSS; // the same for every mino, so they enter the chute HOP_EVERY apart, never bunched
      const up = Math.max(0, (y0 + cs - ms - hy) / cs), rise = riseTime(up);
      const slide = 0.15 + 0.04 * Math.max(0, (cx - tx) / cs);
      const fall = Math.max(0.05, 0.1 * Math.sqrt(Math.max(0.25, (ty - hy) / cs)));
      out.done = false;
      if (e < 0) { out.x = x0; out.y = y0; out.s = cs; }
      else if (e < across) { const k = easeInOut(e / across); out.s = lerp(cs, ms, k); out.x = lerp(x0, cx, k); out.y = y0 + (cs - out.s); }
      else if (e < across + rise) { const k = riseAt(e - across, up); out.x = cx; out.y = lerp(y0 + cs - ms, hy, k); out.s = ms; }
      else if (e < across + rise + slide) { const k = easeInOut((e - across - rise) / slide); out.x = lerp(cx, tx, k); out.s = lerp(ms, bc, k); out.y = hy + (ms - out.s); }
      else if (e < across + rise + slide + fall) { out.x = tx; out.y = lerp(hy + ms - bc, ty, easeIn((e - across - rise - slide) / fall)); out.s = bc; }
      else { out.x = tx; out.y = ty; out.s = bc; out.done = e >= across + rise + slide + fall + SETTLE; }
      return out;
    }

    /** A mino's size up the chute (CSS px, whole device pixels): most of the chute's width. */
    chuteMino() { return Math.max(1 / this.dpr, this.px(0.65 * this.cs)); }
    /** Where a mino of size ms stops at the chute's top (its top, CSS px): over the collector's rim, in the channel. */
    chuteStop(ms) { return Math.max(this.PY(CHUTE_TOP) + 1, this.bt - ms - 0.3 * this.cs); }

    /** The riders' bookkeeping for this frame: minos leave the station in turn; landed ones join the trays' drawing. */
    moveRiders() {
      const s = this.station, out = this.at2;
      if (s) {
        while (s.next < s.n && this.t >= s.t0 + s.next * HOP_EVERY) {
          const c = s.stand.leave[s.next];
          this.riders.push({ idx: s.idx0 + s.next, col: liftX(s.stand.w) + c[0], row: c[1], color: s.color, t0: s.t0 + s.next * HOP_EVERY });
          s.next++;
        }
        if (s.next >= s.n) this.station = null;
      }
      // Landed, in order: they join the crate's own drawing (one that lands early waits, drawn in its slot).
      while (this.riders.length && this.crateRiderPos(this.riders[0], out).done) { this.riders.shift(); this.inflight--; }
      while (this.storeRiders.length && this.storeRiderPos(this.storeRiders[0], out).done) { this.storeRiders.shift(); this.storeInflight--; }
      if (this.inflight < 0) this.inflight = 0;
      if (this.storeInflight < 0) this.storeInflight = 0;
      for (let i = this.takes.length - 1; i >= 0; i--) if (this.t - this.takes[i].t0 >= TAKE) this.takes.splice(i, 1);
      for (let k = 0; k < 4; k++) if (this.tubes[k] && this.t - this.tubes[k].t0 > this.tubeTime(k)) this.tubes[k] = null;
    }

    // ---- collecting and time away -----------------------------------------------------------------------------------

    /** What Collect takes, as drawn now: the minos of every whole line (cells, in CSS px: whole rows, and the start of
     *  the next when the width is not a multiple of eight) and the loose minos after them. Taken just before the model
     *  collects. */
    snapshot(f, look) {
      const MPL = L.Factory.MPL, landed = this.landed(f), lines = Math.floor(landed / MPL), bc = this.bc, cols = this.cols;
      const cells = [], loose = [];
      for (let i = 0; i < landed; i++) {
        const r = Math.floor(i / cols);
        const color = look.colors[parseInt(f.crate[i], 16)] || look.theme.accent, x = this.bx + (i % cols) * bc, y = this.bb - (r + 1) * bc;
        if (i >= lines * MPL) loose.push({ x, y, color });
        else cells.push({ x, y, w: bc, h: bc, color });
      }
      return { cells, loose, lines, cols, bc, flat: this.bcD < FLATBC };
    }

    /** The block lifts out through the crate's open top: a glaze, the equipped clear effect, a rise and a fade; loose
     *  minos fall. */
    collected(snap, look, reduced) {
      this.flushLift();
      this.collectA = { t0: this.t, snap, reduced: !!reduced, burst: false, effect: look.effect };
    }

    /** Minos made while away, fading in row by row: the store's and the crate's (the page counts the numbers up). */
    caughtUp(store0, crate0, f) {
      if (this.reduced || (f.store <= store0 && f.crate.length <= crate0)) { this.catchA = null; return; }
      const sRows = Math.ceil(f.store / this.scols) - Math.floor(store0 / this.scols), cRows = Math.ceil(f.crate.length / this.cols) - Math.floor(crate0 / this.cols);
      this.catchA = {
        t0: this.t, store0: f.store > store0 ? store0 : Infinity, crate0: f.crate.length > crate0 ? crate0 : Infinity,
        sRow0: Math.floor(store0 / this.scols), cRow0: Math.floor(crate0 / this.cols),
        sStag: Math.min(0.03, 0.3 / Math.max(1, sRows)), cStag: Math.min(0.02, 0.3 / Math.max(1, cRows)),
      };
    }

    /** Whether anything is on its way right now. */
    get busy() { return !!(this.collectA || this.catchA || this.riders.length || this.station || this.storeRiders.length); }

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
        ink: rgba(fg, light ? 0.24 : 0.17), ink2: rgba(fg, light ? 0.11 : 0.08), ink35: rgba(fg, 0.35),
        // Light: white parts on a white plate need a little tone of their own (a cool grey toward the bottom and a
        // firmer hairline) to stand clear of it.
        top: light ? '#fcfdfe' : 'rgba(255,255,255,0.075)', bot: light ? '#e9edf3' : 'rgba(255,255,255,0.035)',
        base: light ? '#ffffff' : (th.plateBase || 'rgba(20,25,36,0.95)'),
        solid: light ? '#eef1f6' : '#262b37',
        hi: th.plateHi || 'rgba(255,255,255,0.16)', hair: light ? 'rgba(22,32,60,0.26)' : (th.plateLine || 'rgba(255,255,255,0.085)'),
        // The conveyor's band: in dark, lighter than the plate (a belt, not a hole).
        chain: rgba(fg, light ? 0.24 : 0.1), belt: light ? 'rgba(22,32,60,0.07)' : null, band: light ? 'rgba(22,32,60,0.05)' : 'rgba(255,255,255,0.16)',
        shadow: th.plateShadow || 'rgba(0,0,0,0.5)', side: light ? 'rgba(22,32,60,0.07)' : 'rgba(0,0,0,0.18)',
        well0: th.wellTop || th.well, well1: th.wellBottom || th.well, shade: th.innerShade || 'rgba(0,0,0,0.3)',
        rim: th.rim || th.line, rimHi: th.rimHi || 'rgba(255,255,255,0.05)', grid: th.grid,
        ground: light ? 'rgba(22,32,60,0.03)' : 'rgba(0,0,0,0.14)',
        wash: rgba(th.accent, 0.1), washLine: rgba(th.accent, 0.55), warm: rgba(warn, 0.6),
        // A tray's empty rack: a pale shelf with a faint square for every slot it has; in dark the shelf is lighter
        // than the plate and each slot a lighter hairline square on it, never a darker hole.
        rack0: light ? '#f8fafc' : 'rgba(255,255,255,0.095)', rack1: light ? '#eef1f6' : 'rgba(255,255,255,0.07)',
        slot: light ? 'rgba(22,32,60,0.075)' : 'rgba(255,255,255,0.035)', slotLine: light ? null : 'rgba(255,255,255,0.11)',
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
     *  a shadow under the top edge and a fine rim; a grid when given one ({ gx, gb, s }: its cells' left edge, bottom
     *  and size, CSS px), a device pixel fine. */
    recessed(c, x, y, w, h, grid, rad) {
      const S = this.sty, cs = this.cs, r = rad != null ? rad : Math.max(3, Math.min(8, 0.3 * cs));
      if (w <= 0 || h <= 0) return;
      c.save();
      rr(c, x, y, w, h, r); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, S.well0); g.addColorStop(1, S.well1);
      c.fillStyle = g; c.fillRect(x, y, w, h);
      if (grid) {
        const d = this.dpr, hp = 0.5 / d;
        c.strokeStyle = S.grid; c.lineWidth = 1 / d; c.beginPath();
        for (let p = grid.gx + grid.s; p < x + w - 0.5; p += grid.s) { c.moveTo(p - hp, y); c.lineTo(p - hp, y + h); }
        for (let p = grid.gb - grid.s; p > y + 0.5; p -= grid.s) { c.moveTo(x, p - hp); c.lineTo(x + w, p - hp); }
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

    /** A dashed outline of something still to build (quieter past the next one). */
    dashed(c, x, y, w, h, r, alpha) {
      c.save();
      c.globalAlpha = alpha; c.setLineDash([3, 3]); c.strokeStyle = this.sty.ink; c.lineWidth = 1;
      rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
      c.restore();
    }

    /** A small raised part painted once (a ram's head), reused every frame. */
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

    /** Everything on the floor that stands still: ground, post, the stamp beam and heads, the top belt, the store's
     *  tray and rack, the gantry beam, the presses, the belt, and the corridor's rails and wheels. */
    paintFloor(c, f, heads, presses) {
      const S = this.sty, cs = this.cs, sc = this.S, X = (v) => this.PX(v), Y = (v) => this.PY(v), HY = (v) => this.HY(v);
      c.fillStyle = S.ground; c.fillRect(0, Y(sc.FY), this.w, this.h - Y(sc.FY));
      c.fillStyle = S.ink2; c.fillRect(0, Y(sc.FY), this.w, 1);
      // The post, from the stamp beam to the floor.
      this.raised(c, X(POST.x0), Y(SBEAM.y0), X(POST.x1) - X(POST.x0), Y(sc.FY) - Y(SBEAM.y0) + 1, 1, true);
      // The corridor, behind everything in it: its rails, and the wheels its band runs round.
      this.paintLane(c);
      // The top tier: the top belt hung from the stamp beam, the heads on the beam.
      c.save(); c.globalAlpha = 0.55;
      for (const hx of TOPB.hangers) this.raised(c, X(hx - 0.08), Y(SBEAM.y1 - 0.1), Math.max(2, X(hx + 0.08) - X(hx - 0.08)), HY(TOPB.y) - Y(SBEAM.y1 - 0.1), 1, false);
      c.restore();
      const tx0 = X(TOPB.x0), tx1 = X(TOPB.x1);
      this.recessed(c, tx0, HY(TOPB.y), tx1 - tx0, HY(TOPB.y1) - HY(TOPB.y) + 1);
      if (S.belt) { c.fillStyle = S.belt; c.fillRect(tx0 + 1, HY(TOPB.y) + 1, tx1 - tx0 - 2, HY(TOPB.y1) - HY(TOPB.y) - 1); }
      for (const rx of TOPB.rollers) this.disc(c, this.X(rx), this.Y((TOPB.y + TOPB.y1) / 2 + sc.ht), TOPB.r * cs, true);
      this.raised(c, X(SBEAM.x0), Y(SBEAM.y0), X(SBEAM.x1) - X(SBEAM.x0), Y(SBEAM.y1) - Y(SBEAM.y0), 2, true);
      for (let j = 0; j < 4; j++) {
        if (j < heads) this.paintHead(c, j, true);
        else this.paintHeadBay(c, j, j === f.stampers ? 1 : 0.45);
      }
      // The store: its tray between two walls, its rack of slots.
      this.paintStore(c, f);
      // The gantry beam (the store's floor plate), with a hatch over each built press's feed tube.
      const Bb = sc.Bb;
      this.raised(c, X(STORE.plate0), Y(sc.SB), X(STORE.plate1) - X(STORE.plate0), Y(Bb) - Y(sc.SB), 2, true);
      for (let k = 0; k < presses; k++) {
        const b = WIN[k];
        this.recessed(c, X(b.tube), Y(sc.SB + 0.14), X(b.tube + 1) - X(b.tube), Y(Bb - 0.12) - Y(sc.SB + 0.14), null, 2);
      }
      // The belt: legs, frame, the recessed strip and a roller at each end.
      const BY = sc.BY, bx0 = X(X0), bx1 = X(X0 + T.BELT.len);
      for (const lx of LEGS) this.raised(c, X(X0 + lx - 0.15), Y(BY + 0.6), X(X0 + lx + 0.15) - X(X0 + lx - 0.15), Y(sc.FY) - Y(BY + 0.6) + 1, 1, true);
      this.raised(c, bx0, Y(BY + 0.4), bx1 - bx0, Y(BY + 0.75) - Y(BY + 0.4), 2, true);
      this.recessed(c, bx0, Y(BY), bx1 - bx0, Y(BY + 0.4) - Y(BY) + 1);
      if (S.belt) { c.fillStyle = S.belt; c.fillRect(bx0 + 1, Y(BY) + 1, bx1 - bx0 - 2, Y(BY + 0.4) - Y(BY) - 1); }
      c.fillStyle = S.rimHi; c.fillRect(bx0 + 3, Y(BY), bx1 - bx0 - 6, 1);
      for (const rx of ROLLERS) this.disc(c, this.X(rx), this.Y(BY + 0.35), LAYOUT.ROLLER_R * cs, true);
      for (let k = 0; k < 4; k++) {
        if (k < presses) this.paintPress(c, k, true);
        else this.paintBay(c, k, k === f.presses ? 1 : 0.45);
      }
    }

    /** The shipping corridor's still parts: the conveyor's band between its rails, from its foot (at the belt's end,
     *  a shelf level with the belt) up to its head rail (the collector's floor sits on it), a wheel at each end; and
     *  the post down the column's right edge, the chute cut into it from over the collector's rim down to the station,
     *  where it opens onto the band, with a wheel at its foot. */
    paintLane(c) {
      const S = this.sty, cs = this.cs, sc = this.S, X = (v) => this.PX(v), Y = (v) => this.PY(v);
      const rail = sc.RAIL, top = rail + BAND.head, bot = sc.BY + BAND.foot, r = BAND.rail, ct = CHUTE_TOP, cb = sc.STATION + CHUTE_FOOT;
      // The band: recessed between the left rail and the post, the whole height of the corridor under the collector.
      const bx0 = X(BAND.x0 + r), bx1 = X(BAND.in1);
      this.recessed(c, bx0, Y(top), bx1 - bx0, Y(bot) - Y(top), null, Math.max(2, Math.min(5, 0.25 * cs)));
      c.fillStyle = S.band; c.fillRect(bx0 + 1, Y(top) + 1, bx1 - bx0 - 2, Y(bot) - Y(top) - 2);
      this.raised(c, X(BAND.x0), Y(top), X(BAND.x0 + r) - X(BAND.x0), Y(sc.FY) - Y(top) + 1, 1, true);
      // The post, and the chute cut into it: open to the band from the head rail down to the station.
      this.raised(c, bx1, Y(ct - 0.15), X(BAND.x1) - bx1, Y(sc.FY) - Y(ct - 0.15) + 1, 1, true);
      const hx0 = X(CHUTE.x0), hx1 = X(CHUTE.x1);
      this.recessed(c, hx0, Y(ct), hx1 - hx0, Y(cb) - Y(ct), null, 2);
      c.fillStyle = S.well1; c.fillRect(bx1 - 1, Y(top) + 1, hx0 - bx1 + 2, Y(cb) - Y(top) - 2);
      // The head rail across the band's top, that the collector stands on.
      this.raised(c, X(BAND.x0), Y(rail), bx1 - X(BAND.x0), Y(top) - Y(rail), 1, true);
      // Wheels: the band's head and foot, and the chute's under the station.
      const bm = (BAND.x0 + r + BAND.in1) / 2;
      for (const [wx, wy, wr] of [[bm, top + 0.55, 0.45], [bm, bot - 0.6, 0.45], [(CHUTE.x0 + CHUTE.x1) / 2, cb + 0.5, 0.3]]) {
        c.strokeStyle = S.ink; c.lineWidth = 1;
        c.beginPath(); c.arc(this.X(wx), this.Y(wy), wr * cs - 0.5, 0, Math.PI * 2); c.stroke();
        c.fillStyle = S.ink; c.beginPath(); c.arc(this.X(wx), this.Y(wy), Math.max(1, 0.08 * cs), 0, Math.PI * 2); c.fill();
      }
      // The foot's shelf, level with the belt, that a piece slides onto.
      this.raised(c, X(BAND.x0), Y(sc.BY + 0.4), X(BAND.x1) - X(BAND.x0), Y(sc.BY + 0.75) - Y(sc.BY + 0.4), 2, true);
    }

    /** A built stamp head's still parts: its housing (hung from the beam on two rods when the heads hang lower), and
     *  the recessed die under it. */
    paintHead(c, j, shadow) {
      const cs = this.cs, cx = HEADX[j], X = (v) => this.PX(v), Y = (v) => this.PY(v), HY = (v) => this.HY(v);
      if (this.S.ht > 0.05) for (const hx of [cx - HEAD.w / 2 + 0.3, cx + HEAD.w / 2 - 0.3]) this.raised(c, X(hx - 0.07), Y(SBEAM.y1) - 1, Math.max(2, X(hx + 0.07) - X(hx - 0.07)), HY(HEAD.y0) - Y(SBEAM.y1) + 2, 1, false);
      this.raised(c, X(cx - HEAD.w / 2), HY(HEAD.y0), X(cx + HEAD.w / 2) - X(cx - HEAD.w / 2), HY(HEAD.y1) - HY(HEAD.y0), Math.max(2, 0.25 * cs), shadow);
      this.recessed(c, X(cx - HEAD.die), HY(HEAD.dy0), X(cx + HEAD.die) - X(cx - HEAD.die), HY(HEAD.dy1) - HY(HEAD.dy0), null, Math.max(2, Math.min(5, 0.22 * cs)));
    }
    paintHeadBay(c, j, alpha) {
      const cs = this.cs, cx = HEADX[j], X = (v) => this.PX(v), HY = (v) => this.HY(v);
      this.dashed(c, X(cx - HEAD.w / 2), HY(HEAD.y0), X(cx + HEAD.w / 2) - X(cx - HEAD.w / 2), HY(HEAD.y1) - HY(HEAD.y0), Math.max(2, 0.25 * cs), alpha);
      this.dashed(c, X(cx - HEAD.die), HY(HEAD.dy0), X(cx + HEAD.die) - X(cx - HEAD.die), HY(HEAD.dy1) - HY(HEAD.dy0), Math.max(2, Math.min(5, 0.22 * cs)), alpha);
    }

    /** The store's tray between its walls, from its rim to the beam, and its rack: a slot for every mino it can hold. */
    paintStore(c, f) {
      const cs = this.cs, X = (v) => this.PX(v);
      const top = this.st, sb = this.sb, x0 = X(STORE.x0), x1 = X(STORE.x1);
      this.raised(c, X(STORE.x0 - STORE.wall), top, x0 - X(STORE.x0 - STORE.wall), sb - top, 1, true);
      this.raised(c, x1, top, X(STORE.x1 + STORE.wall) - x1, sb - top, 1, true);
      this.drawnRack.store = this.rack(c, x0, top, x1 - x0, sb, this.scD, Factory.storeCap(f), (i, o) => this.storeSlot(i, o), Math.max(1, Math.min(3, 0.2 * cs)));
    }

    /**
     * A tray's rack: a pale shelf in the plate's material, a faint recessed square (0.8 of the slot) for every slot
     * it has (n, from its floor up), a slim rim across the top of its slots where the tray has room above them, and a
     * fine rim round it. So an empty tray reads as shelving waiting to be filled, never a dark hole. How many slots it
     * drew.
     */
    rack(c, x, y, w, bottom, sD, n, slot, r) {
      const S = this.sty, d = this.dpr, h = bottom - y;
      if (w <= 0 || h <= 0) return 0;
      c.save();
      rr(c, x, y, w, h, r); c.clip();
      const bg = c.createLinearGradient(0, y, 0, bottom);
      bg.addColorStop(0, S.rack0); bg.addColorStop(1, S.rack1);
      c.fillStyle = bg; c.fillRect(x, y, w, h);
      const side = Math.max(1, Math.round(sD * 0.8)), off = Math.floor((sD - side) / 2) / d, sq = side / d, o = { x: 0, y: 0 };
      let drawn = 0, capTop = bottom;
      c.fillStyle = S.slot;
      const line = S.slotLine && sD >= 6, hp = 0.5 / d;
      if (line) { c.strokeStyle = S.slotLine; c.lineWidth = 1 / d; }
      for (let i = 0; i < n; i++) {
        slot(i, o);
        if (sD >= 10) {
          rr(c, o.x + off, o.y + off, sq, sq, Math.min(3, sq * 0.2)); c.fill();
          if (line) { rr(c, o.x + off + hp, o.y + off + hp, sq - 1 / d, sq - 1 / d, Math.min(3, sq * 0.2)); c.stroke(); }
        } else {
          c.fillRect(o.x + off, o.y + off, sq, sq);
          if (line) c.strokeRect(o.x + off + hp, o.y + off + hp, sq - 1 / d, sq - 1 / d);
        }
        if (o.y < capTop) capTop = o.y;
        drawn++;
      }
      // Capacity: a slim rim over the top row of slots (only where there is room above them).
      if (capTop - y >= 2) { c.fillStyle = S.ink2; c.fillRect(x, this.px(capTop) - 1 / d, w, 1 / d); }
      c.restore();
      c.strokeStyle = S.rim; c.lineWidth = 1;
      rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
      return drawn;
    }

    /** The stocked part of a tray: a dark well from its floor up to the top of its highest row that holds a mino (a
     *  row begun counts). Its height, CSS px. */
    well(ctx, x, w, bottom, rows, cell, top) {
      if (rows <= 0) return 0;
      const y = Math.max(top, this.px(bottom - rows * cell));
      this.recessed(ctx, x, y, w, bottom - y, null, Math.max(1, Math.min(3, 0.2 * this.cs)));
      return bottom - y;
    }

    /** A built press's still parts: the feed tube down its left, the hangers from the gantry (when it hangs lower),
     *  cylinder, housing, and the mold window with its grid. */
    paintPress(c, k, shadow) {
      const cs = this.cs, sc = this.S, b = WIN[k], X = (v) => this.PX(v), Y = (v) => this.PY(v);
      const Bb = sc.Bb, PB = sc.PB, wy = sc.WB - b.h, hx = b.cx - PRESS.hw / 2, cx0 = X(b.cx - PRESS.cw / 2), cx1 = X(b.cx + PRESS.cw / 2);
      // The feed tube: a quiet channel (the minos it carries are what matter), open into the window's top left.
      c.save(); c.globalAlpha = this.sty.light ? 0.7 : 0.5;
      this.recessed(c, X(b.tube), Y(Bb) - 2, X(b.tube + 1) - X(b.tube), Y(wy) - Y(Bb) + 4, null, 2);
      c.restore();
      if (PB - Bb > 0.05) for (const hx2 of [hx + 0.35, hx + PRESS.hw - 0.35]) this.raised(c, X(hx2 - 0.07), Y(Bb) - 1, Math.max(2, X(hx2 + 0.07) - X(hx2 - 0.07)), Y(PB) - Y(Bb) + 2, 1, false);
      this.raised(c, cx0, Y(PB + PRESS.hh - 0.1), cx1 - cx0, Y(PB + PRESS.hh + PRESS.ch) - Y(PB + PRESS.hh - 0.1), 2, shadow);
      // The cylinder's round side: a shade down its right.
      const sx = X(b.cx + PRESS.cw / 2 - PRESS.cw * 0.4);
      c.fillStyle = this.sty.side; c.fillRect(sx, Y(PB + PRESS.hh), cx1 - sx - 1, Y(PB + PRESS.hh + PRESS.ch) - Y(PB + PRESS.hh) - 1);
      this.raised(c, X(hx), Y(PB), X(hx + PRESS.hw) - X(hx), Y(PB + PRESS.hh) - Y(PB), Math.max(3, 0.3 * cs), shadow);
      const wx = X(b.x), wb = Y(sc.WB);
      this.recessed(c, wx, Y(wy), X(b.x + b.w) - wx, wb - Y(wy), { gx: wx, gb: wb, s: cs });
    }

    /** An empty bay: the housing and window, dashed (quieter past the next one); where the presses hang lower, its
     *  feed tube and hangers too, so an unbuilt press reads as one to build at its full height, not empty floor. */
    paintBay(c, k, alpha) {
      const cs = this.cs, sc = this.S, b = WIN[k], X = (v) => this.PX(v), Y = (v) => this.PY(v);
      const hx = b.cx - PRESS.hw / 2, wy = sc.WB - b.h;
      if (sc.PB - sc.Bb > 0.5) {
        this.dashed(c, X(b.tube), Y(sc.Bb) + 1, X(b.tube + 1) - X(b.tube), Y(wy) - Y(sc.Bb) - 2, 2, alpha * 0.8);
        c.save(); c.globalAlpha = alpha * 0.8; c.setLineDash([3, 3]); c.strokeStyle = this.sty.ink; c.lineWidth = 1; c.beginPath();
        for (const hx2 of [hx + 0.35, hx + PRESS.hw - 0.35]) { const px = Math.round(this.X(hx2)) + 0.5; c.moveTo(px, Y(sc.Bb)); c.lineTo(px, Y(sc.PB)); }
        c.stroke(); c.restore();
      }
      this.dashed(c, X(hx), Y(sc.PB), X(hx + PRESS.hw) - X(hx), Y(sc.PB + PRESS.hh) - Y(sc.PB), Math.max(3, 0.3 * cs), alpha);
      this.dashed(c, X(b.x), Y(wy), X(b.x + b.w) - X(b.x), Y(sc.WB) - Y(wy), Math.max(3, Math.min(8, 0.3 * cs)), alpha);
    }

    /** The collector: its rail across the column's top, hangers down to its ears, walls, its foot on the head rail,
     *  and its rack between: a slot for every mino its size holds. It keeps its room at every size. */
    paintCrate(c, shadow, f) {
      const cs = this.cs, X = (v) => this.PX(v), Y = (v) => this.PY(v);
      const tx = this.tx0, tr = this.tx1, tw = tr - tx, ty = this.bt, tb = this.bb, wall = this.px(CRATE.wall * cs);
      const wl = tx - wall, wr = tr + wall, foot = Y(this.S.RAIL) - tb, ear = Math.max(2, this.px(0.3 * cs)), lip = this.px(0.18 * cs);
      const hw = Math.max(2, this.px(0.14 * cs));
      for (const hx of [wl + wall / 2, wr - wall / 2]) this.raised(c, this.px(hx - hw / 2), Y(CRATE.ry1) - 1, hw, ty - Y(CRATE.ry1) + 2, 1, false);
      this.raised(c, X(CRATE.rail0), Y(CRATE.ry0), X(CRATE.rail1) - X(CRATE.rail0), Y(CRATE.ry1) - Y(CRATE.ry0), 2, shadow);
      this.raised(c, wl, ty, wall, tb - ty, 1, shadow);
      this.raised(c, tr, ty, wall, tb - ty, 1, shadow);
      this.raised(c, wl - lip, tb, wr - wl + 2 * lip, foot, 1.5, shadow);
      const rad = Math.max(1, Math.min(3, 0.3 * cs, tw / 6));
      this.drawnRack.crate = this.rack(c, tx, ty, tw, tb, this.bcD, Factory.crateMinos(f.crateLevel), (i, o) => this.crateSlot(i, o), rad);
      this.raised(c, wl - lip, ty - lip, wall + lip, ear, 1, false);
      this.raised(c, tr, ty - lip, wall + lip, ear, 1, false);
    }

    /** The still layers, repainted only when what they show changes. */
    layers(f, th) {
      const dpr = this.dpr, heads = this.shownHeads(f), presses = this.shownPresses(f);
      if (!same(this.floorKey, [th, this.cs, dpr, this.w, this.h, this.scene, heads, f.stampers, f.storeLevel, presses, f.presses, this.ox, this.scD, this.scols]) || !this.floorC) {
        if (!this.floorC) this.floorC = makeCanvas(1, 1);
        const c = this.floorC;
        c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr);
        const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.paintFloor(x, f, heads, presses);
        this.staticDraws++;
      }
      if (!same(this.crateKey, [th, this.cs, dpr, this.w, this.h, this.scene, f.crateLevel, this.bw, this.bb, this.bt, this.bcD, this.ox, this.cols]) || !this.crateC) {
        if (!this.crateC) this.crateC = makeCanvas(1, 1);
        const c = this.crateC;
        c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr);
        const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.paintCrate(x, true, f);
        this.staticDraws++;
      }
    }

    /** Presses and heads drawn in the still layer: a new one fades in over its empty bay first. */
    shownPresses(f) {
      let n = f.presses;
      while (n > 1 && this.t - this.built[n - 1] < BUILD) n--;
      return n;
    }
    shownHeads(f) {
      let n = f.stampers;
      while (n > 1 && this.t - this.headBuilt[n - 1] < BUILD) n--;
      return n;
    }

    // ---- a frame ----------------------------------------------------------------------------------------------------

    render(dt, f, look) {
      const ctx = this.ctx, th = look.theme;
      this.t += dt;
      const S = this.style(th), reduced = this.reduced;
      if (this.fx.active) { this.fx.light = S.light; this.fx.update(dt); }
      if (this.expectLen >= 0 && f.crate.length !== this.expectLen) this.flushLift();
      if (this.storeExpect >= 0 && f.store !== this.storeExpect) this.flushStore();
      this.expectLen = f.crate.length; this.storeExpect = f.store;
      if (reduced && (this.inflight || this.storeInflight || this.takes.length || this.station)) this.flushAll();
      this.a = clamp01(f.acc / Factory.TICK_MS);
      const w = Factory.waits(f), fl = this.flags;
      fl.crateFull = w.crateFull; fl.storeFull = w.storeFull; fl.stampHeld = w.stamps; fl.pressHeld = w.pressHeld;
      // The store's warm cues are steadier than the model's flag: that drops for the few seconds after each press takes
      // a mino (the next one is still rolling to the belt's end), which would make every cue blink. Warm from the
      // moment the belt's head waits at a full store, and while the store stays nearly full with minos still coming.
      fl.storeWarm = w.storeFull || (fl.storeWarm && f.top.length > 0 && f.store >= Factory.storeCap(f) - STORE_EASE);
      fl.starving = f.molds.map((m, k) => w.starving.indexOf(k) >= 0);
      if (!reduced) {
        if (!w.storeFull) this.slideTop = (this.slideTop + T.TOP.speed * dt) % 60;
        const bh = f.belt[0];
        if (!(bh && bh.x === bh.px && bh.x + Factory.widthOf(bh) >= T.BELT.len)) this.slideBelt = (this.slideBelt + T.BELT.speed * dt) % 60;
        // The conveyor runs unless everything on it stood still this tick (its head waiting under a full collector).
        if (!f.lift.length || f.lift.some((it) => it.y !== it.py)) this.chain = (this.chain + T.LIFT.speed * this.S.k * dt) % 60;
        if (this.riders.length || this.station) this.chute = (this.chute + dt / RISE_CELL) % 60;
      }
      this.layout(f);
      if (!reduced) this.moveRiders();
      this.layers(f, th);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr; ctx.__light = S.light;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.drawImage(this.floorC, 0, 0, this.w, this.h);
      // A press or a head being built fades in over its empty bay.
      for (let k = 1; k < f.presses; k++) {
        const e = (this.t - this.built[k]) / BUILD;
        if (e >= 0 && e < 1) { ctx.globalAlpha = reduced ? 1 : easeOut(e); this.paintPress(ctx, k, false); ctx.globalAlpha = 1; }
      }
      for (let j = 1; j < f.stampers; j++) {
        const e = (this.t - this.headBuilt[j]) / BUILD;
        if (e >= 0 && e < 1) { ctx.globalAlpha = reduced ? 1 : easeOut(e); this.paintHead(ctx, j, false); ctx.globalAlpha = 1; }
      }
      ctx.drawImage(this.crateC, 0, 0, this.w, this.h);

      this.drawChain(ctx, S);
      this.drawStore(ctx, f, look, S);
      this.drawTop(ctx, f, look, S);
      this.drawHeads(ctx, f, look, S);
      this.drawBays(ctx, f, look, S);
      this.drawBelt(ctx, f, look, S);
      this.drawLift(ctx, f, look, S);
      this.drawCrate(ctx, f, look, S);
      this.drawRiders(ctx, look);
      this.drawCollect(ctx, look);
      if (this.fx.active) this.fx.draw(ctx);
    }

    /** One mino in the skin. */
    cell(ctx, look, color, x, y, w, h, alpha) {
      const img = cellSprite(look.skin, color, w * this.dpr, ctx.__light);
      if (alpha != null && alpha < 1) { ctx.globalAlpha = alpha; ctx.drawImage(img, x, y, w, h); ctx.globalAlpha = 1; }
      else ctx.drawImage(img, x, y, w, h);
    }

    /** A mino at size s (CSS px): in the skin, or under FLATBC device px a flat square with a gap of a device pixel at
     *  its top and right, so the smallest still read as minos. */
    mino(ctx, look, color, x, y, s, alpha) {
      const d = this.dpr;
      if (Math.round(s * d) >= FLATBC) { this.cell(ctx, look, color, x, y, s, s, alpha); return; }
      if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
      ctx.fillStyle = color; ctx.fillRect(x, y + 1 / d, s - 1 / d, s - 1 / d);
      if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
    }

    /** The raw minos' colour: the palette's garbage grey. */
    raw(look) { return look.colors[T.RAW] || look.theme.muted || '#8d99ae'; }

    /** The conveyor's treads: a shallow chevron across the band every cell, pointing up the way it runs, rising
     *  whenever the conveyor runs (it stops only while its head waits under a full collector); and the chute's, a dot
     *  every cell, rising at the minos' pace while minos ride it. */
    drawChain(ctx, S) {
      const cs = this.cs, sc = this.S, top = this.Y(sc.RAIL + BAND.head), bot = this.Y(sc.BY + 0.4);
      const x0 = this.PX(BAND.x0 + BAND.rail) + 3, x1 = this.PX(BAND.in1) - 3, xm = this.px((x0 + x1) / 2), sag = Math.max(2, Math.round(0.35 * cs)), off = (this.chain % 1) * cs;
      ctx.strokeStyle = S.ink; ctx.globalAlpha = S.light ? 1 : 0.8; ctx.lineWidth = 1; ctx.beginPath();
      for (let y = bot - off; y > top + 3; y -= cs) {
        const p = Math.round(y) + 0.5;
        if (p < bot - 2 - sag && p > top + 3) { ctx.moveTo(x0, p + sag); ctx.lineTo(xm, p); ctx.lineTo(x1, p + sag); }
      }
      ctx.stroke();
      const cx = this.px(this.X((CHUTE.x0 + CHUTE.x1) / 2)), ct = this.Y(CHUTE_TOP) + 0.5 * cs, off2 = (this.chute % 1) * cs, cb = this.Y(sc.STATION + CHUTE_FOOT);
      ctx.fillStyle = S.ink;
      for (let y = cb - 0.5 * cs - off2; y > ct; y -= cs) ctx.fillRect(cx - 1, Math.round(y), 2, 2);
      ctx.globalAlpha = 1;
    }

    /** The store: the well under its stocked rows, every raw mino it holds (painted into their own layer), and the
     *  cells being taken. */
    drawStore(ctx, f, look, S) {
      const landed = this.storeLanded(f), col = this.raw(look), rows = this.srows;
      if (this.catchA && this.t - this.catchA.t0 > 1.4) this.catchA = null;
      const cu = this.catchA && this.catchA.store0 < landed ? this.catchA : null;
      // The well spans the grid (the rack's shelf shows either side of a grid narrower than the tray).
      const x0 = Math.max(this.PX(STORE.x0), this.px(this.sx0 - 0.15 * this.cs)), x1 = Math.min(this.PX(STORE.x1), this.px(this.sx0 + this.scols * this.scc + 0.15 * this.cs));
      this.drawnWell.store = this.well(ctx, x0, x1 - x0, this.sb, Math.min(rows, Math.ceil(landed / this.scols)), this.scc, this.st);
      if (cu) {
        for (let i = 0; i < landed; i++) {
          let alpha = null;
          if (i >= cu.store0) { alpha = clamp01((this.t - cu.t0 - (Math.floor(i / this.scols) - cu.sRow0) * cu.sStag) / 0.5); if (alpha <= 0.001) continue; }
          this.storeSlot(i, this.at);
          this.mino(ctx, look, col, this.at.x, this.at.y, this.scc, alpha);
        }
      } else if (landed) ctx.drawImage(this.storeLayer(look, landed, rows), this.sx0, this.sb - rows * this.scc, this.scols * this.scc, rows * this.scc);
      // Taken: shrinking away where it was (or, still rolling in, fading).
      for (const tk of this.takes) {
        const k = clamp01((this.t - tk.t0) / TAKE);
        if (tk.fade) { this.mino(ctx, look, col, this.px(tk.x), this.px(tk.y), this.px(tk.s), 1 - k); continue; }
        const s = tk.s * (1 - easeIn(k));
        if (s * this.dpr >= 1) this.mino(ctx, look, col, this.px(tk.x + (tk.s - s) / 2), this.px(tk.y + (tk.s - s) / 2), this.px(s));
      }
      // A full store's rim takes a warm hairline; pointed at, its rim lights.
      const hv = this.hover;
      if (this.flags.storeWarm || (hv && hv.kind === 'store')) {
        const y = this.st, x0 = this.PX(STORE.x0 - STORE.wall), x1 = this.PX(STORE.x1 + STORE.wall);
        ctx.fillStyle = this.flags.storeWarm ? S.warn : S.ink;
        ctx.fillRect(x0, y - 1, x1 - x0, 1);
      }
    }

    /** The store's landed minos, painted once into their own layer until the count (or the look) changes. */
    storeLayer(look, landed, rows) {
      const col = this.raw(look);
      if (this.storeMinoC && same(this.storeMinoKey, [landed, col, look.skin, this.sty.light, this.scD, this.scols, rows, this.dpr])) return this.storeMinoC;
      same(this.storeMinoKey, [landed, col, look.skin, this.sty.light, this.scD, this.scols, rows, this.dpr]);
      if (!this.storeMinoC) this.storeMinoC = makeCanvas(1, 1);
      const c = this.storeMinoC, d = this.dpr;
      c.width = this.scols * this.scD; c.height = Math.max(1, rows * this.scD);
      const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.__dpr = d; x.__light = this.sty.light;
      const H = rows * this.scc;
      for (let i = 0; i < landed; i++) {
        const r = Math.floor(i / this.scols);
        if (r >= rows) break;
        this.mino(x, look, col, (i % this.scols) * this.scc, H - (r + 1) * this.scc, this.scc);
      }
      return c;
    }

    /** The top belt: its treads (still while its head waits at a full store), and the raw minos on it; a mino just
     *  stamped drops from its die first. */
    drawTop(ctx, f, look, S) {
      const cs = this.cs, t = this.t, a = this.a, col = this.raw(look);
      const ht = this.S.ht, y0 = this.HY(TOPB.y) + 1, y1 = this.HY(TOPB.y1) - 1, x0 = this.X(TOPB.x0), x1 = this.X(TOPB.x1), off = this.slideTop % 1;
      ctx.strokeStyle = S.ink; ctx.globalAlpha = S.light ? 1 : 0.6; ctx.lineWidth = 1; ctx.beginPath();
      for (let c = off; c < T.TOP.len; c += 1) { const p = this.PX(TOPB.x0 + c) + 0.5; if (p > x0 + 3 && p < x1 - 3) { ctx.moveTo(p, y0); ctx.lineTo(p, y1); } }
      ctx.stroke(); ctx.globalAlpha = 1;
      const bottom = this.Y(TOPB.y + ht);
      for (let i = 0; i < f.top.length; i++) {
        const it = f.top[i], x = this.PX(TOPB.x0 + lerp(it.px, it.x, a));
        let yb = bottom;
        const t0 = this.stamped.get(it);
        if (t0 != null && !this.reduced) {
          const e = t - t0, hold = STAMP_DOWN + STAMP_HOLD;
          if (e < hold) yb = this.Y(HEAD.cy1 + ht);
          else if (e < hold + MINO_DROP) yb = this.Y(lerp(HEAD.cy1, TOPB.y, easeIn((e - hold) / MINO_DROP)) + ht);
        }
        const y = this.px(yb) - cs;
        this.cell(ctx, look, col, x, y, cs, cs);
        // The head, waiting at a full store: a thin warm line round it.
        if (i === 0 && this.flags.storeWarm) { ctx.strokeStyle = S.warn; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1); }
      }
      // The rollers turn with the belt.
      const ang = this.slideTop / TOPB.r, r = TOPB.r * cs, ca = Math.cos(ang), sa = Math.sin(ang), cy = this.Y((TOPB.y + TOPB.y1) / 2 + ht);
      ctx.strokeStyle = S.ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath();
      for (const rx of TOPB.rollers) {
        const cx = this.X(rx);
        ctx.moveTo(cx + ca * r * 0.3, cy + sa * r * 0.3); ctx.lineTo(cx + ca * r * 0.7, cy + sa * r * 0.7);
      }
      ctx.stroke(); ctx.lineCap = 'butt';
    }

    /** The stamp heads' moving parts: rams, lamps, and each die filling with the next raw mino. */
    drawHeads(ctx, f, look, S) {
      const cs = this.cs, t = this.t, reduced = this.reduced, hv = this.hover, col = this.raw(look), ht = this.S.ht;
      const X = (v) => this.PX(v), Y = (v) => this.HY(v);
      for (let j = 0; j < 4; j++) {
        const cx = HEADX[j], hot = !!hv && (hv.kind === 'head' || hv.kind === 'headBay') && hv.k === j;
        if (j >= f.stampers) {
          // The next head to build: a plus in its die, lit when pointed at.
          if (j === f.stampers) {
            const px = this.px(this.X(cx)), py = this.px(this.Y((HEAD.dy0 + HEAD.dy1) / 2 + ht)), r = Math.max(2, Math.round(0.3 * cs));
            ctx.strokeStyle = hot ? S.accentInk : S.ink; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r); ctx.lineTo(px, py + r); ctx.stroke();
            ctx.lineCap = 'butt';
          }
          continue;
        }
        // A head holds its mino while the belt under it is not clear: warm only when that is the chain backing up (the
        // store full), not a mino from upstream passing under it for a moment.
        const s = f.stamps[j], held = s.held && this.flags.storeWarm, fade = reduced ? 1 : clamp01((t - this.headBuilt[j]) / BUILD);
        ctx.globalAlpha = fade;
        const te = t - this.headAt[j];
        let dip = 0;
        if (!reduced && te >= 0) {
          if (te < STAMP_DOWN) dip = easeIn(te / STAMP_DOWN);
          else if (te < STAMP_DOWN + STAMP_HOLD) dip = 1;
          else if (te < STAMP_DOWN + STAMP_HOLD + STAMP_UP) dip = 1 - easeOut((te - STAMP_DOWN - STAMP_HOLD) / STAMP_UP);
        }
        // The ram: down to the die as a mino is stamped, a moment's hold, and back up.
        const rb = HEAD.rest + (HEAD.cy0 - HEAD.rest) * dip, rt = rb - HEAD.ramH;
        const rx0 = X(cx - HEAD.rod / 2), rx1 = X(cx + HEAD.rod / 2), ry = Y(HEAD.y1), re = Y(rt) + 1;
        ctx.fillStyle = S.solid; ctx.fillRect(rx0, ry, rx1 - rx0, Math.max(0, re - ry));
        ctx.fillStyle = S.hair; ctx.fillRect(rx0, ry, 1, Math.max(0, re - ry)); ctx.fillRect(rx1 - 1, ry, 1, Math.max(0, re - ry));
        const hw = this.px(HEAD.ramW * cs), hh = Math.max(2, this.px(HEAD.ramH * cs));
        ctx.drawImage(this.sprite('hram', hw, hh, 1.5), this.px(this.X(cx) - hw / 2), Y(rb) - hh, hw, hh);
        // The die: its next mino filling from the bottom, faint (full while it waits for room on the belt).
        const tt = s.held ? Factory.STAMP_TT : Math.max(0, s.t - 1 + this.a), frac = clamp01(tt / Factory.STAMP_TT);
        const x = X(cx - 0.5), y = Y(HEAD.cy0), sz = X(cx + 0.5) - x;
        if (frac > 0.002 && !(!reduced && te >= 0 && te < STAMP_DOWN + STAMP_HOLD)) {
          const fh = this.px(sz * frac);
          ctx.save(); ctx.beginPath(); ctx.rect(x, y + sz - fh, sz, fh); ctx.clip();
          this.cell(ctx, look, col, x, y, sz, sz, fade * 0.5);
          ctx.restore();
        }
        if (!reduced && te >= STAMP_DOWN && te < STAMP_DOWN + FLASH) {
          ctx.fillStyle = white(0.25 * (1 - (te - STAMP_DOWN) / FLASH)); rr(ctx, x + 1, y + 1, sz - 2, sz - 2, sz * 0.17); ctx.fill();
        }
        // Waiting (the belt under it is not clear): the die's rim and the lamp go warm. Pointed at: the rim lights.
        if (held || hot) {
          const dx = X(cx - HEAD.die), dy = Y(HEAD.dy0);
          ctx.strokeStyle = held ? S.warm : S.ink; ctx.lineWidth = 1;
          rr(ctx, dx + 0.5, dy + 0.5, X(cx + HEAD.die) - dx - 1, Y(HEAD.dy1) - dy - 1, Math.max(2, Math.min(5, 0.22 * cs))); ctx.stroke();
        }
        const flash = !reduced && te >= STAMP_DOWN && te < STAMP_DOWN + FLASH;
        ctx.globalAlpha = fade * (held || hot || flash ? 1 : 0.85);
        ctx.fillStyle = held ? S.warn : S.accent;
        ctx.beginPath(); ctx.arc(this.X(cx - HEAD.w / 2 + 0.36), this.Y((HEAD.y0 + HEAD.y1) / 2 + ht), Math.max(1.25, 0.15 * cs), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /** The presses' moving parts: rams, lamps, pins, the mino on its way down each feed tube, and what each mold window
     *  holds (set minos in the piece's colour; the one being set raw grey, taking the colour from its bottom; the rest
     *  as ghosts). */
    drawBays(ctx, f, look, S) {
      const cs = this.cs, t = this.t, reduced = this.reduced, hv = this.hover, sc = this.S, col = this.raw(look);
      const X = (v) => this.PX(v), Y = (v) => this.PY(v);
      for (let k = 0; k < 4; k++) {
        const b = WIN[k], n = T.MOLDS[k], wy = sc.WB - b.h, hot = !!hv && (hv.kind === 'press' || hv.kind === 'bay') && hv.k === k;
        if (k >= f.presses) {
          // The next bay to build: a plus, lit when pointed at.
          if (k === f.presses) {
            const cx = this.px(this.X(b.cx)), cy = this.px(this.Y(wy + b.h / 2)), r = Math.round(0.4 * cs);
            ctx.strokeStyle = hot ? S.accentInk : S.ink; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
            ctx.lineCap = 'butt';
          }
          continue;
        }
        const m = f.molds[k], cells = Factory.shapes(n)[m.s], color = look.colors[m.c] || S.accent, starving = !!this.flags.starving[k];
        const fade = reduced ? 1 : clamp01((t - this.built[k]) / BUILD);
        ctx.globalAlpha = fade;
        // The ram (right of the feed tube): down to meet the window as a mino is set, a moment's hold, and back up.
        const te = t - this.stampAt[k];
        let dip = 0;
        if (!reduced && te >= 0) {
          if (te < STAMP_DOWN) dip = easeIn(te / STAMP_DOWN);
          else if (te < STAMP_DOWN + STAMP_HOLD) dip = 1;
          else if (te < STAMP_DOWN + STAMP_HOLD + STAMP_UP) dip = 1 - easeOut((te - STAMP_DOWN - STAMP_HOLD) / STAMP_UP);
        }
        const headBottom = wy - PRESS.rest * (1 - dip), rodTop = Y(sc.PB + PRESS.hh + PRESS.ch);
        const rx0 = X(b.cx - 0.14), rx1 = X(b.cx + 0.14), rb = this.px(this.Y(headBottom - PRESS.ramH)) + 1;
        ctx.fillStyle = S.solid; ctx.fillRect(rx0, rodTop, rx1 - rx0, Math.max(0, rb - rodTop));
        ctx.fillStyle = S.hair; ctx.fillRect(rx0, rodTop, 1, Math.max(0, rb - rodTop)); ctx.fillRect(rx1 - 1, rodTop, 1, Math.max(0, rb - rodTop));
        const ramX0 = X(b.tube + 1.1), ramX1 = X(b.x + b.w - 0.2), hh = this.px(PRESS.ramH * cs);
        ctx.drawImage(this.sprite('ram', ramX1 - ramX0, hh, 2), ramX0, this.px(this.Y(headBottom)) - hh, ramX1 - ramX0, hh);
        // What the window holds.
        const nset = m.got < n ? (m.t >= Factory.B(n, m.got) ? m.got : m.got - 1) : (m.t >= Factory.CYCLE_T ? n : n - 1);
        const pending = this.stampReal[k] && !reduced && te >= 0 && te < STAMP_DOWN;
        const set = pending ? Math.max(0, nset - 1) : nset;
        const tube = this.tubes[k], tubeK = tube && !reduced ? (t - tube.t0) / this.tubeTime(k) : 1;
        const gone = t - this.ghostsAt[k] + GHOSTS_AT >= DROP;
        const gA = reduced ? 1 : clamp01((t - this.ghostsAt[k]) / GHOSTS_FADE);
        const ox = b.x + Math.floor((n + 1 - cells.w) / 2), ghost = look.ghost === 'off' ? null : look.ghost;
        const oc = formOrder(cells);
        for (let i = 0; i < oc.length; i++) {
          const x = X(ox + oc[i][0]), y = Y(sc.WB - oc[i][1] - 1), s = X(ox + oc[i][0] + 1) - x;
          if (i < set) {
            this.cell(ctx, look, color, x, y, s, s);
            if (i === set - 1 && this.stampReal[k] && !reduced && te >= STAMP_DOWN && te < STAMP_DOWN + FLASH) {
              ctx.fillStyle = white(0.25 * (1 - (te - STAMP_DOWN) / FLASH));
              rr(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.17); ctx.fill();
            }
            continue;
          }
          if (i < m.got && !(i === m.got - 1 && tubeK < 1)) {
            // Fed, being set: raw grey, the piece's colour rising from its bottom as the press works it.
            this.cell(ctx, look, col, x, y, s, s);
            const b0 = Factory.B(n, i), b1 = Factory.B(n, i + 1), tt = pending ? b1 : Math.min(b1, m.t - 1 + this.a);
            const frac = clamp01((tt - b0) / (b1 - b0));
            if (frac > 0.002) {
              const fh = this.px(s * frac);
              ctx.save(); ctx.beginPath(); ctx.rect(x, y + s - fh, s, fh); ctx.clip();
              this.cell(ctx, look, color, x, y, s, s);
              ctx.restore();
            }
            continue;
          }
          if (!(gone && gA > 0)) continue;
          ctx.globalAlpha = fade * gA;
          if (i === m.got && starving) {
            // The next mino this press waits for: a dashed outline.
            ctx.setLineDash([2, 2]); ctx.strokeStyle = S.ink35; ctx.lineWidth = 1; rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.16); ctx.stroke(); ctx.setLineDash([]);
          } else if (ghost) ghostCell(ctx, ghost, color, x, y, s);
          else { ctx.strokeStyle = rgba(color, 0.25); ctx.lineWidth = 1; rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.16); ctx.stroke(); }
          ctx.globalAlpha = fade;
        }
        // A raw mino on its way down the feed tube, then into its place.
        if (tubeK < 1 && m.got > 0) this.drawTube(ctx, look, k, m, cells, ox, col);
        // Starving: a dim ring at the hatch it waits under.
        if (starving) {
          ctx.strokeStyle = S.ink35; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(this.X(b.tube + 0.5), this.Y((sc.SB + sc.Bb) / 2), Math.max(2, 0.3 * cs), 0, Math.PI * 2); ctx.stroke();
        }
        // The window's rim: brighter when pointed at, warm while the press holds its piece.
        if (m.held || hot) {
          const wx = X(b.x), wyy = Y(wy), wr = Math.max(3, Math.min(8, 0.3 * cs));
          ctx.strokeStyle = m.held ? S.warm : S.ink; ctx.lineWidth = 1;
          rr(ctx, wx + 0.5, wyy + 0.5, X(b.x + b.w) - wx - 1, Y(sc.WB) - wyy - 1, wr); ctx.stroke();
        }
        // The lamp: steady; a flash with each mino set; warm while holding; dim while it waits for minos.
        const hx = b.cx - PRESS.hw / 2, ly = this.Y(sc.PB + PRESS.hh / 2);
        const flash = !reduced && this.stampReal[k] && te >= STAMP_DOWN && te < STAMP_DOWN + FLASH;
        ctx.globalAlpha = fade * (m.held || hot || flash ? 1 : starving ? 1 : 0.85);
        ctx.fillStyle = m.held ? S.warn : starving ? S.ink35 : S.accent;
        ctx.beginPath(); ctx.arc(this.X(hx + 0.45), ly, Math.max(1.5, 0.2 * cs), 0, Math.PI * 2); ctx.fill();
        // The pin, when this press is set to one shape.
        const pin = m.pin >= 0 && pinPath();
        if (pin) {
          const box = 0.85 * cs, scl = box / 16;
          ctx.globalAlpha = fade;
          ctx.save();
          ctx.translate(this.px(this.X(hx + PRESS.hw - 0.25) - box), this.px(ly - box / 2));
          ctx.scale(scl, scl);
          ctx.strokeStyle = S.accentInk; ctx.lineWidth = 1.25 / scl; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.stroke(pin);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }

    /** How long a fed mino takes: down the tube (easing in), then a glide to its place. */
    tubeTime(k) { return 0.1 * Math.sqrt(this.S.WB - WIN[k].h - this.S.SB) + GLIDE; }

    drawTube(ctx, look, k, m, cells, ox, col) {
      const sc = this.S, b = WIN[k], e = this.t - this.tubes[k].t0, fall = 0.1 * Math.sqrt(sc.WB - b.h - sc.SB);
      const slot = formOrder(cells)[m.got - 1], tx = ox + slot[0], ty = sc.WB - slot[1] - 1;
      let x, y;
      if (e < fall) { x = b.tube; y = lerp(sc.SB, sc.WB - b.h, easeIn(clamp01(e / fall))); }
      else { const g = easeInOut(clamp01((e - fall) / GLIDE)); x = lerp(b.tube, tx, g); y = lerp(sc.WB - b.h, ty, g); }
      const px = this.PX(x), py = this.PY(y), s = this.PX(x + 1) - px;
      ctx.save();
      // Inside the tube and the window only: it comes out of the hatch, not through the beam.
      ctx.beginPath(); ctx.rect(this.PX(b.x), this.PY(sc.SB + 0.14), this.PX(b.x + b.w) - this.PX(b.x), this.PY(sc.WB) - this.PY(sc.SB + 0.14)); ctx.clip();
      this.cell(ctx, look, col, px, py, s, s);
      ctx.restore();
    }

    drawBelt(ctx, f, look, S) {
      const cs = this.cs, t = this.t, sc = this.S, BY = sc.BY, a = this.a;
      // Treads: a tick every cell, sliding right with the belt (still while its head waits).
      const y0 = this.PY(BY) + 1, y1 = this.PY(BY + 0.4) - 1, x0 = this.X(X0), x1 = this.X(X0 + T.BELT.len), off = this.slideBelt % 1;
      ctx.strokeStyle = S.ink; ctx.globalAlpha = S.light ? 1 : 0.6; ctx.lineWidth = 1; ctx.beginPath();
      for (let c = off; c < T.BELT.len; c += 1) { const p = this.PX(X0 + c) + 0.5; if (p > x0 + 3 && p < x1 - 3) { ctx.moveTo(p, y0); ctx.lineTo(p, y1); } }
      ctx.stroke(); ctx.globalAlpha = 1;
      // The rollers turn with it.
      const ang = this.slideBelt / LAYOUT.ROLLER_R, r = LAYOUT.ROLLER_R * cs, ca = Math.cos(ang), sa = Math.sin(ang), cy = this.Y(BY + 0.35);
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
          if (e < DROP) bottom = this.Y(sc.WB + (BY - sc.WB) * easeIn(e / DROP));
          else if (e < DROP + DROP_SETTLE) bottom += Math.sin(Math.PI * (e - DROP) / DROP_SETTLE);
        }
        const px0 = this.PX(X0 + lerp(it.px, it.x, a));
        for (let j = 0; j < cells.length; j++) this.cell(ctx, look, color, px0 + cells[j][0] * cs, this.px(bottom - (cells[j][1] + 1) * cs), cs, cs);
        // The belt's head, backed up behind a full crate: a thin warm line round it.
        if (i === 0 && this.flags.crateFull && it.x + cells.w >= T.BELT.len) this.outline(ctx, outlineOf(cells), px0, this.px(bottom), S.warn);
      }
    }

    outline(ctx, o, px0, bt, color) {
      const cs = this.cs;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      for (let j = 0; j < o.length; j += 6) {
        ctx.moveTo(px0 + o[j] * cs + o[j + 4], bt - o[j + 1] * cs + o[j + 5]); ctx.lineTo(px0 + o[j + 2] * cs + o[j + 4], bt - o[j + 3] * cs + o[j + 5]);
      }
      ctx.stroke();
    }

    /** The conveyor: pieces riding up it lying flat on their cleats, one sliding on at its foot, and what is left of
     *  the one at the station while its minos leave up the chute. */
    drawLift(ctx, f, look, S) {
      const cs = this.cs, sc = this.S, a = this.a, t = this.t;
      for (let i = 0; i < f.lift.length; i++) {
        const it = f.lift[i], cells = Factory.shapes(it.n)[it.s], fl = flatOf(cells), color = look.colors[it.c] || S.accent;
        const bottom = sc.BY - lerp(it.py, it.y, a) * sc.k, lx = this.PX(liftX(fl.w));
        const t0 = this.turns.get(it);
        let bt = this.PY(bottom), x = lx;
        if (t0 != null && !this.reduced && t - t0 < TURN.slide + TURN.ease) {
          const e = t - t0;
          if (e < TURN.slide) { x = this.px(lerp(this.X(X0 + T.BELT.len - fl.w), lx, easeInOut(e / TURN.slide))); bt = this.PY(sc.BY); }
          else bt = this.px(lerp(this.Y(sc.BY), this.Y(bottom), easeInOut((e - TURN.slide) / TURN.ease)));
        }
        this.cradle(ctx, S, x, bt, fl.w);
        for (const [c, r] of cells) this.cell(ctx, look, color, x + c * cs, bt - (r + 1) * cs, cs, cs);
        // The head, waiting at the station for room in the collector: a thin warm line round it.
        if (i === 0 && this.flags.crateFull) this.outline(ctx, fl.outline, x, bt, S.warn);
      }
      const st = this.station;
      if (st && !this.reduced) {
        const bt = this.PY(sc.STATION), color = look.colors[st.color] || S.accent, leave = st.stand.leave, lx = this.PX(liftX(st.stand.w));
        if (st.next < st.n) this.cradle(ctx, S, lx, bt, st.stand.w);
        for (let j = st.next; j < st.n; j++) this.cell(ctx, look, color, lx + leave[j][0] * cs, bt - (leave[j][1] + 1) * cs, cs, cs);
      }
    }

    /** A cleat under a riding piece: a thin bar it rests on, a little wider than the piece. */
    cradle(ctx, S, x, bt, cols) {
      const cs = this.cs, h = Math.max(2, this.px(0.18 * cs)), w = this.px(cols * cs + 0.4 * cs), x0 = this.px(x - 0.2 * cs);
      ctx.fillStyle = S.hair; ctx.fillRect(x0 - 1, bt - 1, w + 2, h + 2);
      ctx.fillStyle = S.solid; ctx.fillRect(x0, bt, w, h);
    }

    /** The crate's minos at rest, painted once into their own layer until the crate (or its look) changes. */
    crateLayer(f, look, landed) {
      const key = [f.crate, landed, this.bcD, this.rows, this.cols, look.skin, this.sty.light, this.dpr].concat(look.colors);
      if (this.crateMinoC && same(this.crateMinoKey, key)) return this.crateMinoC;
      same(this.crateMinoKey, key);
      if (!this.crateMinoC) this.crateMinoC = makeCanvas(1, 1);
      const c = this.crateMinoC, d = this.dpr;
      c.width = this.cols * this.bcD; c.height = Math.max(1, this.rows * this.bcD);
      const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.__dpr = d; x.__light = this.sty.light;
      this.paintCrateMinos(x, f, look, landed, 0, null, 0, this.rows * this.bc);
      return c;
    }

    /** The crate's minos, from mino `from` on, with the grid's bottom left at x, b (CSS px); minos made while away (cu)
     *  fade in row by row. */
    paintCrateMinos(c, f, look, landed, from, cu, x, b) {
      const bc = this.bc, t = this.t, acc = this.sty.accent, cols = this.cols;
      for (let i = from; i < landed; i++) {
        const r = Math.floor(i / cols);
        let alpha = null;
        if (cu && i >= cu.crate0) { alpha = clamp01((t - cu.t0 - (r - cu.cRow0) * cu.cStag) / 0.5); if (alpha <= 0.001) continue; }
        this.mino(c, look, look.colors[parseInt(f.crate[i], 16)] || acc, x + (i % cols) * bc, b - (r + 1) * bc, bc, alpha);
      }
    }

    /** The crate: the well under its stocked rows, its minos, every one a mino; pointing at the crate (or Collect)
     *  washes what Collect would take. */
    drawCrate(ctx, f, look, S) {
      const t = this.t, ca = this.collectA, bc = this.bc, bx = this.bx, bb = this.bb, top = bb - this.rows * bc, landed = this.landed(f);
      const collecting = !!ca && t - ca.t0 < (ca.reduced ? 0.32 : C_END);
      const hide = collecting ? ca.snap.loose.length : 0;
      const cu = this.catchA && this.catchA.crate0 < landed ? this.catchA : null;
      // The well: the rows that hold a mino now (while a collect plays, the row its loose minos fall to).
      const wr = collecting ? (ca.snap.loose.length ? 1 : 0) : Math.ceil(landed / this.cols);
      this.drawnWell.crate = this.well(ctx, this.tx0, this.tx1 - this.tx0, bb, Math.min(this.rows, wr), bc, this.bt);
      if (hide || cu) this.paintCrateMinos(ctx, f, look, landed, hide, cu, bx, bb);
      else if (landed) ctx.drawImage(this.crateLayer(f, look, landed), bx, top, this.bw, bb - top);
      const wall = this.px(CRATE.wall * this.cs), rimX0 = this.tx0 - wall, rimW = this.tx1 - this.tx0 + 2 * wall;
      // Full: a warm hairline along the rim.
      if (this.flags.crateFull) { ctx.fillStyle = S.warn; ctx.fillRect(rimX0, this.bt - 1, rimW, 1); }
      const hv = this.hover;
      if ((this.preview || (hv && hv.kind === 'crate')) && !ca) {
        const MPL = L.Factory.MPL, x0 = bx, x1 = bx + this.bw, cols = this.cols, taken = Math.floor(landed / MPL) * MPL;
        // What Collect takes: its whole rows, and the start of the next row when a line ends partway along one.
        let full = Math.floor(taken / cols), part = taken % cols;
        if (full >= this.rows) { full = this.rows; part = 0; }
        if (landed >= MPL) {
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
        if (!this.flags.crateFull) { ctx.fillStyle = S.ink; ctx.fillRect(rimX0, this.bt - 1, rimW, 1); }
      }
    }

    /** Minos on their way: into the store, and from the station into the crate. */
    drawRiders(ctx, look) {
      if (this.reduced) return;
      const out = this.at2, col = this.raw(look);
      for (const r of this.storeRiders) {
        this.storeRiderPos(r, out);
        this.mino(ctx, look, col, this.px(out.x), this.px(out.y), this.px(out.s));
      }
      for (const r of this.riders) {
        if (this.t < r.t0) continue;
        this.crateRiderPos(r, out);
        this.mino(ctx, look, look.colors[r.color] || look.theme.accent, this.px(out.x), this.px(out.y), this.px(out.s));
      }
    }

    /** The block Collect took: a glaze, the clear effect once, then up and out of the crate's open top as one while its
     *  cells shrink away; the loose minos ride up on it, then fall to the bottom row once it has gone. */
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
        // shrinks away itself as it rises (so the default effect is the block).
        ca.burst = true;
        const n = this.fx.parts.length;
        this.fx.burst(ca.effect, this.burstCells(snap), snap.bc, false);
        for (let i = this.fx.parts.length - 1; i >= n; i--) if (this.fx.parts[i].kind === 'sq') this.fx.parts.splice(i, 1);
      }
      const k = e < C_GLAZE ? 0 : clamp01((e - C_GLAZE) / C_RISE), dy = -easeOut(k) * Math.max(snap.bc, 0.5 * cs);
      if (k < 1) {
        const glaze = e < C_GLAZE ? 0.3 * (e / C_GLAZE) : 0.3;
        this.paintBlock(ctx, look, snap, dy, 1 - easeIn(clamp01((k - 0.2) / 0.6)), glaze, 1 - 0.85 * easeIn(k));
      }
      if (e < C_END) {
        const fk = e < C_LOOSE ? 0 : easeIn(clamp01((e - C_LOOSE) / C_FALL));
        for (let i = 0; i < snap.loose.length; i++) {
          const m = snap.loose[i], tx = this.bx + i * snap.bc, y0 = m.y + dy, y1 = this.bb - snap.bc;
          this.mino(ctx, look, m.color, this.px(m.x + (tx - m.x) * fk), this.px(y0 + (y1 - y0) * fk), snap.bc);
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
  L.FactoryArt = { shapeCanvas, FONT, WIN, HEADX, COLS, LAYOUT, sceneOf, fit, pack, flatOf, liftX, formOrder, CHUTE_TOP, CHUTE_FOOT, MOTION: { HOP_EVERY, RISE_CELL } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
