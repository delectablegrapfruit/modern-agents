// Lull — Mural (a board option: js/recipe.js). A picture becomes the board's target: it is cut into pieces that cover
// the whole well with no gap, and they come in a fixed order, bottom up, each already carrying its colours. Every block
// is split into 2 × 2 quarter cells, each its own colour, so the picture has twice the board's resolution each way; a
// piece's quarters turn with it. The spot the piece in play belongs in is outlined on the board; it is set only there,
// in its own turn: a set anywhere else simply does not happen (no mistake, no penalty). No line ever clears, nothing
// falls by itself and there is no clock. When the last piece is set, the mural is Finished. Pure rules, no DOM (its look,
// controller and window: js/muralview.js).
//
//   Recipe     mural: { pic: 'coast' | 'still' | 'soft' | 'own', level: 1-5, own?: { w, h, pal, px } }: own is an
//              imported photo as its quantised grid only (w × h quarters, pal its colours '#rrggbb', px one base-36
//              digit a quarter, row by row from the top), never the photo. Its piece set is shapes.preset (SETS).
//   Size       any in SIZE, the level's by default; the picture is drawn at twice it each way (more detail, bigger).
//   Levels     the colours, Mixed's share of small pieces and the default size: 1 8 × 10, 3 colours, mostly 1-3 blocks;
//              2 10 × 14, 4; 3 12 × 18, 6; 4 14 × 22, 8; 5 16 × 26, 10, mostly tetrominoes (LEVELS).
//   Cut        a fresh seed every new board (and every start over). The cells are taken bottom up, left to right; the
//              first free cell is covered next by a piece resting on the floor, earlier pieces or itself, so every cell
//              under a piece belongs to an earlier one and every cell over it to a later one: the order made is the
//              order dealt, each piece drops straight down into its place, and no order can cycle. Mixed grows pieces
//              (tile); the other sets search with backtracking (cut), a piece reaching up to UP rows over the picture
//              (trimmed as it sets). Each plan is played through to check it (verify), cut again from the next seed if
//              it failed. A board from before sizes and sets (v 1) keeps its level's size and its Mixed cut.
//   Turns      a piece appears in another turn than its place whenever that looks different (its shape, or its
//              quarters), at the top, nearest the middle, where its place can still be reached by moves and turns
//              (searched: reach); with none, in its own turn right over its place. As in puzzles, a single turn button
//              places every piece (turn 1: clockwise; -1, counter-clockwise, under Inverted Controls): the piece
//              appears one press of it away from its place's turn (two only when one press away cannot reach it), and
//              the search counts only that direction and turns in place or nudged sideways off a wall (never a kick
//              that hops it down or through a gap). Settings ▸ Controls ▸ Counter-clockwise puzzles (turn 0) allows
//              both ways and half turns (the view tells the turn: setTurnMode).
//   Buffer     BUF rows over the picture (the board is the picture's height + BUF; nothing ever sets there). Shut while
//              the stack is low: a piece appears at the picture's top and its search stays under it. Open once the stack
//              (or the piece's place) comes within BUF rows of the top, and from then on: pieces appear at the buffer's
//              top, so the picture's last rows are reached by the same moves and turns as the rest (the view shows it).
//   Pay        PAY_CELL lines for each block set (a Standard board pays more per piece and per action: mural-unit.cjs).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Pieces, RNG } = L;

  const LEVELS = [null,
    { w: 8, h: 10, k: 3, pk: 5, mix: [0.24, 0.34, 0.28, 0.14] },
    { w: 10, h: 14, k: 4, pk: 7, mix: [0.14, 0.28, 0.32, 0.26] },
    { w: 12, h: 18, k: 6, pk: 10, mix: [0.08, 0.2, 0.32, 0.4] },
    { w: 14, h: 22, k: 8, pk: 13, mix: [0.05, 0.14, 0.28, 0.53] },
    { w: 16, h: 26, k: 10, pk: 16, mix: [0.03, 0.1, 0.22, 0.65] },
  ];
  const LEVEL_IDS = [1, 2, 3, 4, 5];
  const PICS = ['coast', 'still', 'soft'];
  const PIC_IDS = PICS.concat(['own']);
  const PIC_NAMES = { coast: 'Coast', still: 'Still life', soft: 'Abstract', own: 'Photo' };
  const PAY_CELL = 0.04;
  /** The buffer: rows over the picture (R.k, as Race's) where pieces appear and turn once the stack nears the top. */
  const BUF = 4;
  /** The buffer opens when the stack, or the next piece's place, reaches the picture's top OPEN rows. */
  const OPEN = 2;
  /** A board's size (the picture's, the buffer over it): any in these, the level's by default (SIZE). */
  const SIZE = { w: [6, 20], h: [8, 36] };
  /** The most quarters an imported picture keeps each way (the largest board's grid), and its colours. */
  const OWN_MAX = { w: 40, h: 72, k: 16 };
  /** The piece sets (Shapes): Mixed (1-4 blocks, the level's share of small ones), Normal (the seven tetrominoes),
   *  Pentominoes (the 18), Frantic (all of them, trominoes, a domino and a single block). */
  const SETS = ['mixed', 'normal', 'pentominoes', 'frantic'];
  const SET_NAMES = { mixed: 'Mixed', normal: 'Normal', pentominoes: 'Pentominoes', frantic: 'Frantic' };
  /** Rows a planned piece may reach over the picture (into the buffer; what is there is trimmed when it sets). */
  const UP = 2;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const on = (r) => !!r && r.mode === 'mural';
  const levelOf = (r) => LEVELS[(r && r.mural && r.mural.level) || 1] || LEVELS[1];
  const setOf = (r) => (r && r.shapes && SETS.includes(r.shapes.preset) ? r.shapes.preset : 'normal');

  // ---- colour ---------------------------------------------------------------------------------------------------------

  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  /** sRGB (0-255) to OKLab, into out at i. */
  function oklab(r, g, b, out, i) {
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    out[i] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    out[i + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    out[i + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  }

  const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  /** OKLab to sRGB (0-255, kept in gamut by clipping each channel). */
  function fromLab(L0, A, B) {
    const l = (L0 + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L0 - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L0 - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, Bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return [R, G, Bl].map((v) => gam(Math.max(0, Math.min(1, v))));
  }

  /**
   * Quantises n pixels (rgb: r, g, b 0-255 each) to at most K colours, the same way every time, keeping the picture's
   * own colours: in OKLab, the pixels are gathered in small boxes, each weighed by the root of how many pixels it holds
   * (so a wide sky does not take every colour) and by how vivid it is (so a small red flower or a blue door keeps a colour
   * of its own beside the wide dull ones). The first colours are picked farthest first (the heaviest, then each time the
   * box worst served by those so far), and k-means settles them. Each pixel takes its nearest, and each colour is then
   * its pixels' mean lightness and hue at their mean chroma (an average of a few hues would grey out). Returns
   * { pal: ['#rrggbb'] (darkest first), idx: Uint8Array(n) }.
   */
  function quantise(rgb, n, K) {
    K = Math.max(1, Math.min(16, K | 0));
    const lab = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) oklab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], lab, i * 3);
    const bins = new Map(), binOf = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = (Math.round(lab[i * 3] * 40) * 128 + Math.round(lab[i * 3 + 1] * 50) + 64) * 128 + Math.round(lab[i * 3 + 2] * 50) + 64;
      let b = bins.get(k);
      if (!b) { b = { k, n: 0, l: 0, a: 0, b: 0 }; bins.set(k, b); }
      b.n++; b.l += lab[i * 3]; b.a += lab[i * 3 + 1]; b.b += lab[i * 3 + 2];
      binOf[i] = k;
    }
    const pts = Array.from(bins.values()).sort((p, q) => p.k - q.k), m = pts.length;
    const pl = new Float64Array(m * 3), wt = new Float64Array(m), at = new Map();
    pts.forEach((p, j) => {
      pl[j * 3] = p.l / p.n; pl[j * 3 + 1] = p.a / p.n; pl[j * 3 + 2] = p.b / p.n;
      wt[j] = Math.sqrt(p.n) * (1 + 6 * Math.hypot(pl[j * 3 + 1], pl[j * 3 + 2]));
      at.set(p.k, j);
    });
    const d2 = (P, j, c) => { const d0 = P[j * 3] - c[0], d1 = P[j * 3 + 1] - c[1], d2_ = P[j * 3 + 2] - c[2]; return d0 * d0 + d1 * d1 + d2_ * d2_; };
    const near = (P, j, cen) => { let best = 0, bd = Infinity; for (let c = 0; c < cen.length; c++) { const d = d2(P, j, cen[c]); if (d < bd - 1e-12) { bd = d; best = c; } } return best; };
    // Farthest first: the heaviest box, then each time the box worst served (its weight by its distance squared).
    const box = (j) => [pl[j * 3], pl[j * 3 + 1], pl[j * 3 + 2]];
    let first = 0;
    for (let j = 1; j < m; j++) if (wt[j] > wt[first]) first = j;
    let cen = [box(first)];
    const dist = new Float64Array(m).fill(Infinity);
    while (cen.length < K) {
      let pick = -1, score = 1e-7;
      for (let j = 0; j < m; j++) { dist[j] = Math.min(dist[j], d2(pl, j, cen[cen.length - 1])); const v = wt[j] * dist[j]; if (v > score) { score = v; pick = j; } }
      if (pick < 0) break;
      cen.push(box(pick));
    }
    const own = new Int32Array(m);
    for (let it = 0; it < 24; it++) {
      let moved = 0;
      for (let j = 0; j < m; j++) { const c = near(pl, j, cen); if (c !== own[j]) moved++; own[j] = c; }
      const sum = cen.map(() => [0, 0, 0, 0]);
      for (let j = 0; j < m; j++) { const s = sum[own[j]]; s[0] += pl[j * 3] * wt[j]; s[1] += pl[j * 3 + 1] * wt[j]; s[2] += pl[j * 3 + 2] * wt[j]; s[3] += wt[j]; }
      cen = cen.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
      if (it && !moved) break;
    }
    // Each pixel its nearest; each colour its pixels' mean lightness and hue, at their mean chroma (twice: the pixels
    // then go to the nearest of those).
    const idx = new Uint8Array(n);
    let reps = null;
    for (let pass = 0; pass < 2; pass++) {
      const acc = cen.map(() => [0, 0, 0, 0, 0]);
      for (let i = 0; i < n; i++) {
        const c = near(lab, i, cen), a = acc[c];
        idx[i] = c; a[0] += lab[i * 3]; a[1] += lab[i * 3 + 1]; a[2] += lab[i * 3 + 2]; a[3] += Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]); a[4]++;
      }
      reps = acc.map((a, j) => {
        if (!a[4]) return null;
        const L0 = a[0] / a[4], A = a[1] / a[4], B = a[2] / a[4], C0 = Math.hypot(A, B), C = a[3] / a[4], k = C0 > 1e-4 ? C / C0 : 1;
        return { j, l: L0, lab: [L0, A * k, B * k] };
      });
      cen = reps.map((x, j) => (x ? x.lab : cen[j]));
    }
    const used = reps.filter(Boolean).map((x) => Object.assign(x, { rgb: fromLab(x.lab[0], x.lab[1], x.lab[2]) })).sort((p, q) => p.l - q.l || p.j - q.j);
    const remap = new Uint8Array(cen.length);
    used.forEach((x, k) => { remap[x.j] = k; });
    for (let i = 0; i < n; i++) idx[i] = remap[idx[i]];
    return { pal: used.map((x) => rgbHex(x.rgb[0], x.rgb[1], x.rgb[2])), idx };
  }

  // ---- the built-in pictures: drawn by hand as functions of the point (X across, 0 to the aspect a; Y down, 0 to 1) ----

  const C = (h) => hexRgb(h);
  const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  function grad(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]; return mix(c0, c1, (t - t0) / (t1 - t0 || 1)); }
    return stops[stops.length - 1][1];
  }
  const inPoly = (pts, x, y) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; };
  const disc = (x, y, cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

  const COAST = {
    sky: [[0, C('#232a57')], [0.42, C('#5b4680')], [0.72, C('#c8687c')], [1, C('#f5ac66')]].map(([t, c]) => [t, c]),
    sea: [[0, C('#6a5f8c')], [0.35, C('#2f4a78')], [1, C('#1a2f50')]],
    sand: [[0, C('#e6c49a')], [1, C('#b98d63')]],
    sun: C('#ffe3a1'), glow: C('#ffc983'), shine: C('#f6b06a'), land: C('#2a2233'), grass: C('#3f4636'), tower: C('#efe6da'), lamp: C('#fff2b8'),
    cloud1: C('#8c5d88'), cloud2: C('#e28b7c'), foam: C('#f4e6cc'),
    cliff: [[0, 0.385], [0.2, 0.375], [0.29, 0.41], [0.37, 0.49], [0.46, 0.555], [0.41, 0.6], [0.28, 0.64], [0, 0.69]],
  };
  function coast(x, y, a) {
    const P = COAST, X = x / a, hz = 0.52, sx = 0.66;
    const shore = 0.8 + 0.018 * Math.sin(X * 13 + 0.6);
    // The headland and its lighthouse (over everything at the left).
    if (X >= 0.095 && X <= 0.135 && y >= 0.285 && y <= 0.385) return y < 0.31 ? P.lamp : (y > 0.335 && y < 0.35 ? P.cloud2 : P.tower);
    if (inPoly(P.cliff, X, y)) return y < 0.405 && X < 0.3 ? P.grass : P.land;
    if (y < hz) {
      let c = grad(P.sky, y / hz);
      const d = Math.hypot(x - sx * a, y - (hz - 0.03));
      if (d < 0.085) return P.sun;
      if (d < 0.15) c = mix(c, P.glow, 0.55 * (1 - (d - 0.085) / 0.065));
      if (ell(x, y, 0.3 * a, 0.2, 0.24 * a, 0.017)) c = P.cloud1;
      if (ell(x, y, 0.82 * a, 0.33, 0.16 * a, 0.013)) c = P.cloud2;
      return c;
    }
    if (y < shore) {
      let c = grad(P.sea, (y - hz) / (shore - hz));
      const w = (0.035 + (y - hz) * 0.42) * a, dx = Math.abs(x - sx * a);
      if (dx < w && Math.sin((y - hz) * 140) > -0.3) c = mix(c, P.shine, 0.9 * (1 - dx / w));
      return c;
    }
    if (y < shore + 0.016) return P.foam;
    return grad(P.sand, (y - shore) / (1 - shore));
  }

  const STILL = {
    wall: [[0, C('#efe3cb')], [1, C('#ddcaa8')]], frame: C('#fbf8f1'), sky: [[0, C('#83bbe4')], [1, C('#d6ecf7')]], hill: C('#86ab7a'),
    sill: C('#cdb895'), top: C('#c48e5f'), edge: C('#8f5e3a'), front: C('#73492d'), shadow: C('#9c6c45'),
    orange: C('#ef8a37'), apple: C('#c53b35'), lemon: C('#ecc94a'), leaf: C('#5f8a3e'), bowl: C('#3d6ca6'), bowlLight: C('#79a3d4'), rim: C('#2c5288'), shine: C('#ffe9c9'),
  };
  function still(x, y, a) {
    const P = STILL, cx = 0.5 * a;
    // The bowl, in front of the fruit; its foot; the fruit; the table and the bowl's shadow; the window; the wall.
    const rx = 0.3 * a, ry = 0.16, top = 0.615;
    if (y >= top && ell(x, y, cx, top, rx, ry)) {
      if (y < top + 0.022) return P.rim;
      return x < cx - rx * 0.45 && y < top + 0.09 ? P.bowlLight : P.bowl;
    }
    if (y >= 0.765 && y <= 0.795 && Math.abs(x - cx) < 0.13 * a) return P.rim;
    if (disc(x, y, 0.6 * a, 0.565, 0.09)) return disc(x, y, 0.575 * a, 0.53, 0.022) ? P.shine : P.apple;
    if (disc(x, y, 0.39 * a, 0.575, 0.085)) return P.orange;
    if (disc(x, y, 0.5 * a, 0.525, 0.075)) return P.lemon;
    if (ell(x, y, 0.52 * a, 0.44, 0.03 * a, 0.018)) return P.leaf;
    if (y >= 0.72) {
      if (ell(x, y, 0.53 * a, 0.79, 0.36 * a, 0.022)) return P.shadow;
      return y < 0.8 ? mix(P.top, P.edge, (y - 0.72) / 0.2) : y < 0.84 ? P.edge : P.front;
    }
    const X = x / a;
    if (X >= 0.15 && X <= 0.85 && y >= 0.07 && y <= 0.47) {
      const t = 0.03;
      if (X < 0.15 + t / a || X > 0.85 - t / a || y < 0.07 + t || y > 0.47 - t || Math.abs(x - cx) < t * 0.6 || Math.abs(y - 0.27) < t * 0.6) return P.frame;
      if (y > 0.385 - 0.04 * Math.sin(X * 6 + 0.4)) return P.hill;
      return grad(P.sky, (y - 0.07) / 0.4);
    }
    if (X >= 0.11 && X <= 0.89 && y > 0.47 && y < 0.5) return P.sill;
    return grad(P.wall, y);
  }

  const SOFT = {
    bg: [[0, C('#f4e7d9')], [1, C('#e8d5e6')]], teal: C('#62aca5'), mustard: C('#e8b545'), coral: C('#ee8b70'), navy: C('#33497c'), lilac: C('#b39ddb'), sage: C('#a9c49a'),
  };
  function soft(x, y, a) {
    const P = SOFT, X = x / a;
    if (disc(x, y, 0.78 * a, 0.19, 0.075)) return P.navy;
    if (disc(x, y, 0.68 * a, 0.58, 0.2)) return P.coral;
    if (disc(x, y, 0.42 * a, 1.03, 0.3)) return P.mustard;
    if (disc(x, y, 0.3 * a, 0.3, 0.22)) return disc(x, y, 0.3 * a, 0.3, 0.12) ? P.sage : P.teal;
    // A rounded bar, lower left.
    const bx0 = 0.07, bx1 = 0.4, by0 = 0.6, by1 = 0.72, r = 0.06;
    const qx = Math.max(bx0 * a + r - x, 0, x - (bx1 * a - r)), qy = Math.max(by0 + r - y, 0, y - (by1 - r));
    if (X >= bx0 && X <= bx1 && y >= by0 && y <= by1 && qx * qx + qy * qy <= r * r) return P.lilac;
    return grad(P.bg, y);
  }

  const DRAW = { coast, still, soft };
  /**
   * A built-in picture's own colours, most needed first: at K colours the first K are the centres every pixel goes to
   * (the nearest, in OKLab), each then the mean of its pixels, so a few colours still say what the picture is (a bowl
   * stays blue, a sun gold).
   */
  const KEYS = {
    coast: ['#5b4680', '#1f3558', '#e2bd92', '#ffe3a1', '#2a2233', '#c8687c', '#262c58', '#f2a865', '#f4e6cc', '#3d5a85'],
    still: ['#e9dcc0', '#3d6ca6', '#a8714a', '#ef8a37', '#9cc9ea', '#c53b35', '#fbf8f1', '#73492d', '#86ab7a', '#ecc94a'],
    soft: ['#efe0e0', '#62aca5', '#ee8b70', '#e8b545', '#33497c', '#b39ddb', '#a9c49a', '#e8d5e6', '#f4e7d9'],
  };
  /** Pixels (rgb) to the first K of a picture's own colours: { pal, idx }, as quantise gives. */
  function toKeys(rgb, n, keys, K) {
    const ks = keys.slice(0, Math.max(1, K)), lab = new Float64Array(ks.length * 3), px = [0, 0, 0];
    ks.forEach((h, j) => { const c = hexRgb(h); oklab(c[0], c[1], c[2], lab, j * 3); });
    const idx = new Uint8Array(n), acc = ks.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      oklab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], px, 0);
      let best = 0, bd = Infinity;
      for (let j = 0; j < ks.length; j++) { const d0 = px[0] - lab[j * 3], d1 = px[1] - lab[j * 3 + 1], d2 = px[2] - lab[j * 3 + 2], d = d0 * d0 + d1 * d1 + d2 * d2; if (d < bd) { bd = d; best = j; } }
      idx[i] = best; const a = acc[best]; a[0] += rgb[i * 3]; a[1] += rgb[i * 3 + 1]; a[2] += rgb[i * 3 + 2]; a[3]++;
    }
    const used = acc.map((a, j) => ({ j, a, l: lab[j * 3] })).filter((x) => x.a[3] > 0).sort((p, q) => p.l - q.l || p.j - q.j);
    const remap = new Uint8Array(ks.length);
    used.forEach((x, k) => { remap[x.j] = k; });
    for (let i = 0; i < n; i++) idx[i] = remap[idx[i]];
    return { pal: used.map((x) => rgbHex(x.a[0] / x.a[3], x.a[1] / x.a[3], x.a[2] / x.a[3])), idx };
  }
  /** A built-in picture drawn at w × h, 4 × 4 samples a pixel: rgb (0-255), row by row from the top. */
  function render(pic, w, h) {
    const f = DRAW[pic] || coast, a = w / h, S = 4, out = new Float64Array(w * h * 3);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = f(((px + (sx + 0.5) / S) / w) * a, (py + (sy + 0.5) / S) / h, a);
        r += c[0]; g += c[1]; b += c[2];
      }
      const i = (py * w + px) * 3;
      out[i] = r / (S * S); out[i + 1] = g / (S * S); out[i + 2] = b / (S * S);
    }
    return out;
  }

  // ---- pictures: the target grid of a recipe ---------------------------------------------------------------------------

  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  /** An imported picture as kept: sound, small, its digits naming its colours. */
  function ownOk(o) {
    if (!isObj(o) || !Number.isInteger(o.w) || !Number.isInteger(o.h) || o.w < 2 || o.h < 2 || o.w > OWN_MAX.w || o.h > OWN_MAX.h) return false;
    if (!Array.isArray(o.pal) || o.pal.length < 1 || o.pal.length > OWN_MAX.k || !o.pal.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c))) return false;
    if (typeof o.px !== 'string' || o.px.length !== o.w * o.h) return false;
    for (let i = 0; i < o.px.length; i++) { const v = B36.indexOf(o.px[i]); if (v < 0 || v >= o.pal.length) return false; }
    return true;
  }
  /** rgb pixels (w × h) of an imported picture. */
  function ownRgb(o) {
    const out = new Float64Array(o.w * o.h * 3), pal = o.pal.map(hexRgb);
    for (let i = 0; i < o.w * o.h; i++) { const c = pal[B36.indexOf(o.px[i])]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
    return out;
  }
  /** rgb pixels (w × h) resampled to W × H, the middle kept where the shapes differ (nearest, by area). */
  function resample(rgb, w, h, W, H) {
    if (w === W && h === H) return rgb;
    const out = new Float64Array(W * H * 3), a = W / H;
    let cw = w, ch = h;
    if (w / h > a) cw = h * a; else ch = w / a;
    const ox = (w - cw) / 2, oy = (h - ch) / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.floor(ox + ((x + 0.5) / W) * cw)), sy = Math.min(h - 1, Math.floor(oy + ((y + 0.5) / H) * ch));
      for (let k = 0; k < 3; k++) out[(y * W + x) * 3 + k] = rgb[(sy * w + sx) * 3 + k];
    }
    return out;
  }
  const LIN = new Float64Array(256);
  for (let i = 0; i < 256; i++) LIN[i] = lin(i);
  /**
   * An imported picture from pixels (rgba or rgb, w × h, the crop already taken), area-averaged down to the grid of
   * quarters of a board W × H in linear light (as light mixes: a fine red and green pattern averages to the yellow-brown
   * the eye sees, never a muddy dark one; each pixel counted by how much of it falls in the quarter) and quantised to K
   * colours: { w, h, pal, px }.
   */
  function fromPixels(px, w, h, W, H, K, stride) {
    stride = stride || 4;
    const QW = W * 2, QH = H * 2, rgb = new Float64Array(QW * QH * 3);
    for (let qy = 0; qy < QH; qy++) {
      const y0 = (qy * h) / QH, y1 = ((qy + 1) * h) / QH;
      for (let qx = 0; qx < QW; qx++) {
        const x0 = (qx * w) / QW, x1 = ((qx + 1) * w) / QW;
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y++) {
          const fy = Math.min(y + 1, y1) - Math.max(y, y0);
          for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1)); x++) {
            const f = fy * (Math.min(x + 1, x1) - Math.max(x, x0)), i = (y * w + x) * stride;
            r += LIN[px[i] | 0] * f; g += LIN[px[i + 1] | 0] * f; b += LIN[px[i + 2] | 0] * f; n += f;
          }
        }
        const o = (qy * QW + qx) * 3;
        rgb[o] = n ? gam(r / n) : 0; rgb[o + 1] = n ? gam(g / n) : 0; rgb[o + 2] = n ? gam(b / n) : 0;
      }
    }
    const q = quantise(rgb, QW * QH, K);
    let s = '';
    for (let i = 0; i < q.idx.length; i++) s += B36[q.idx[i]];
    return { w: QW, h: QH, pal: q.pal, px: s };
  }

  const PIC_CACHE = new Map();
  /**
   * The target picture of a recipe on a board W × H (the level's size by default): { QW, QH, pal, q (Uint8Array QW × QH
   * of colour numbers, row by row from the top) }, twice the board's size each way, in the level's colours. A built-in one is drawn; an imported one is resampled and
   * quantised again only when it was kept at another size or with more colours.
   */
  function picture(r, W, H) {
    const m = r.mural, lv = levelOf(r), QW = (W || lv.w) * 2, QH = (H || lv.h) * 2;
    const key = (m.pic === 'own' ? 'own:' + m.level + ':' + m.own.w + 'x' + m.own.h + ':' + m.own.pal.join() + ':' + m.own.px : m.pic + ':' + m.level) + ':' + QW + 'x' + QH;
    let p = PIC_CACHE.get(key);
    if (p) return p;
    if (m.pic === 'own' && m.own.w === QW && m.own.h === QH && m.own.pal.length <= lv.pk) {
      const q = new Uint8Array(QW * QH);
      for (let i = 0; i < q.length; i++) q[i] = B36.indexOf(m.own.px[i]);
      p = { QW, QH, pal: m.own.pal.slice(), q };
    } else {
      const z = m.pic === 'own' ? quantise(resample(ownRgb(m.own), m.own.w, m.own.h, QW, QH), QW * QH, lv.pk) : toKeys(render(m.pic, QW, QH), QW * QH, KEYS[m.pic], lv.k);
      p = { QW, QH, pal: z.pal, q: z.idx };
    }
    PIC_CACHE.set(key, p);
    if (PIC_CACHE.size > 24) PIC_CACHE.delete(PIC_CACHE.keys().next().value);
    return p;
  }
  /** The quarters of board cell (x, y) (y up) in a picture: [top left, top right, bottom left, bottom right]. */
  function quartersAt(p, H, x, y) {
    const r0 = 2 * (H - 1 - y), i = r0 * p.QW + 2 * x;
    return [p.q[i], p.q[i + 1], p.q[i + p.QW], p.q[i + p.QW + 1]];
  }
  /** Quarters turned k quarter turns clockwise. */
  function turnQ(q, k) {
    k = ((k % 4) + 4) % 4;
    for (let i = 0; i < k; i++) q = [q[2], q[0], q[3], q[1]];
    return q;
  }

  // ---- the tiling ------------------------------------------------------------------------------------------------------

  /**
   * The pieces of a board W × H, in the order they are dealt: [[x, y], …] each (see Tiling, above). mix: the share of
   * pieces of 1, 2, 3 and 4 blocks aimed for.
   */
  function tile(W, H, mix, rng) {
    const owner = new Int32Array(W * H).fill(-1), out = [];
    const free = (x, y) => x >= 0 && x < W && y >= 0 && y < H && owner[y * W + x] < 0;
    const held = (x, y) => y < 0 || owner[y * W + x] >= 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (owner[y * W + x] >= 0) continue;
      let r = rng.next(), size = 1;
      for (let k = 0; k < mix.length; k++) { r -= mix[k]; if (r < 0) { size = k + 1; break; } size = k + 1; }
      const id = out.length, cells = [[x, y]];
      owner[y * W + x] = id;
      while (cells.length < size) {
        const cand = [], seen = new Set();
        for (const [cx, cy] of cells) for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) {
          const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
          if (seen.has(k) || !free(nx, ny) || !held(nx, ny - 1)) continue;
          seen.add(k); cand.push([nx, ny]);
        }
        if (!cand.length) break;
        const [nx, ny] = cand[rng.int(cand.length)];
        owner[ny * W + nx] = id;
        cells.push([nx, ny]);
      }
      out.push(cells);
    }
    return out;
  }

  // Each piece is a shape of its own ('U:<n>:<cells>', its number in the mural and its cells), so the Next tray can tell
  // two pieces of one shape apart; a type always turns (a single block too: its quarters do).
  function typeOf(k, cells) {
    const key = Pieces.canonKey(cells), id = 'U:' + k + ':' + key;
    if (Pieces.TYPES[id]) return Pieces.TYPES[id];
    const norm = key.split(';').map((p) => p.split(',').map(Number));
    const t = Pieces.defineType(id, norm, { color: Pieces.hashColor(key), kicks: 'generic', family: 'mural', name: 'Mural piece' });
    Pieces.TYPES[id] = t;
    return t;
  }
  Pieces.resolver('U', (rest, id) => {
    const m = /^(\d{1,4}):(.+)$/.exec(rest), cells = m && Pieces.parseKey(m[2]);
    if (!cells || cells.length > 5 || Pieces.canonKey(cells) !== m[2] || !Pieces.isConnected(cells)) return null;
    const t = typeOf(+m[1], cells);
    return t.id === id ? t : null;
  });

  // ---- the cut: a set's pieces over the picture, by backtracking ----------------------------------------------------------

  const SHAPES_CACHE = {};
  /** A set's shapes: [{ w (weight), turns: [offsets from the turn's first cell, bottom up then left to right] }]. */
  function shapesOf(set) {
    if (SHAPES_CACHE[set]) return SHAPES_CACHE[set];
    const T = Pieces.TETROMINOES, P5 = Pieces.PENTO18;
    const src = set === 'pentominoes' ? [[P5, 1]] : set === 'frantic' ? [[T, 7], [P5, 7], [['I3'], 2], [['V3'], 2], [['D2'], 2], [['M1'], 1]] : [[T, 1]];
    const out = [];
    for (const [ids, q] of src) for (const id of ids) {
      const t = Pieces.get(id), seen = new Set(), turns = [];
      for (let r = 0; r < 4; r++) {
        const cells = t.rots[r], k = Pieces.shapeKey(cells);
        if (seen.has(k)) continue;
        seen.add(k);
        const a = cells.reduce((m, c) => (c[1] < m[1] || (c[1] === m[1] && c[0] < m[0]) ? c : m), cells[0]);
        turns.push(cells.map(([x, y]) => [x - a[0], y - a[1]]));
      }
      out.push({ w: q / ids.length, n: t.rots[0].length, turns });
    }
    return (SHAPES_CACHE[set] = out);
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  /**
   * The picture W × H cut into pieces of a set, in the order they are dealt: { pieces: [[[x, y], …]], fallbacks }. The
   * first free cell (bottom up, left to right) is covered next, by a piece whose every cell rests on the floor, on an
   * earlier piece or on its own cells (the same order rule as the tiling: each drops straight down into place); a
   * piece may reach UP rows over the picture (trimmed when it sets). Candidates are tried in a weighted shuffled order
   * (rng), backtracking where a gap is left that the set cannot fill (a closed gap whose size the set's sizes cannot
   * make); past a budget of tries, a gap with no piece left takes a single block (counted: fallbacks).
   */
  function cut(W, H, set, rng) {
    const S = shapesOf(set), N = W * H, filled = new Uint8Array(N), budget = N * 8;
    const g = S.reduce((m, s) => gcd(m, s.n), 0), minN = Math.min(...S.map((s) => s.n));
    let nodes = 0, fallbacks = 0;
    const first = (from) => { for (let i = from; i < N; i++) if (!filled[i]) return i; return -1; };
    const fits = (cells) => {
      for (const [x, y] of cells) {
        if (x < 0 || x >= W || y >= H + UP) return false;
        if (y < H && filled[y * W + x]) return false;
        if (y > 0 && !(y - 1 < H && filled[(y - 1) * W + x]) && !cells.some(([u, v]) => u === x && v === y - 1)) return false;
      }
      return true;
    };
    const set1 = (cells, v) => { for (const [x, y] of cells) if (y < H) filled[y * W + x] = v; };
    const comp = new Int32Array(N), queue = new Int32Array(N);
    // Every closed gap (one that does not reach the picture's top row) must be a size the set can make.
    const sound = () => {
      if (g <= 1 && minN <= 1) return true;
      comp.fill(0);
      for (let i = 0; i < N; i++) {
        if (filled[i] || comp[i]) continue;
        let n = 0, open = false, qh = 0, qt = 0;
        queue[qt++] = i; comp[i] = 1;
        while (qh < qt) {
          const j = queue[qh++], x = j % W, y = (j / W) | 0;
          n++;
          if (y === H - 1) open = true;
          if (x > 0 && !filled[j - 1] && !comp[j - 1]) { comp[j - 1] = 1; queue[qt++] = j - 1; }
          if (x < W - 1 && !filled[j + 1] && !comp[j + 1]) { comp[j + 1] = 1; queue[qt++] = j + 1; }
          if (y > 0 && !filled[j - W] && !comp[j - W]) { comp[j - W] = 1; queue[qt++] = j - W; }
          if (y < H - 1 && !filled[j + W] && !comp[j + W]) { comp[j + W] = 1; queue[qt++] = j + W; }
        }
        if (!open && (n % g || n < minN)) return false;
      }
      return true;
    };
    const cands = (c) => {
      const cx = c % W, cy = (c / W) | 0, list = [];
      for (const sh of S) for (const turn of sh.turns) {
        const cells = turn.map(([dx, dy]) => [cx + dx, cy + dy]);
        if (fits(cells)) list.push({ cells, k: Math.pow(rng.next(), 1 / sh.w) });
      }
      return list.sort((a, b) => b.k - a.k);
    };
    const frames = [];
    let c = first(0);
    if (c >= 0) frames.push({ c, list: cands(c), i: 0, cur: null });
    while (frames.length) {
      const f = frames[frames.length - 1];
      nodes++;
      if (f.cur) { set1(f.cur, 0); f.cur = null; if (f.fb) { f.fb = false; fallbacks--; } }
      while (f.i < f.list.length) {
        const cells = f.list[f.i++].cells;
        nodes++;
        set1(cells, 1);
        if (sound()) { f.cur = cells; break; }
        set1(cells, 0);
      }
      if (!f.cur) {
        if (nodes <= budget && frames.length > 1) { frames.pop(); continue; }
        // No piece of the set fits this gap (within the budget): a single block.
        f.cur = [[f.c % W, (f.c / W) | 0]]; f.fb = true; fallbacks++;
        set1(f.cur, 1);
      }
      c = first(f.c + 1);
      if (c < 0) break;
      frames.push({ c, list: cands(c), i: 0, cur: null });
    }
    return { pieces: frames.map((f) => f.cur), fallbacks, nodes };
  }

  // ---- the plan --------------------------------------------------------------------------------------------------------

  const PLAN_CACHE = new Map();
  /** A board's picture size: { W, H } — the level's for a mural from before sizes and sets (v 1), else the board's. */
  function dims(v, r, w, h) {
    const lv = levelOf(r);
    return v === 1 || !w || !h ? { W: lv.w, H: lv.h } : { W: w, H: h };
  }
  /**
   * A mural's plan, from its recipe and seed, on a picture W × H (the level's size by default; v 1: a mural from before
   * sizes and sets, always the level's size and Mixed, as it was cut then): { W, H, set, pic, fallbacks, tries,
   * pieces: [{ id, rt, x, y, cells (its board cells, in its type's cell order at rt; a cell at H or over is over the
   * picture), qt (each cell's quarters at rt), goals ([{ rot, x, y }]: every turn and spot that sets it exactly), pref
   * ([rot]: the turns it would rather appear in) }], check (verify's answer) }. Cut, then checked by playing it (verify);
   * a cut that fails is cut again from the next seed (at most 4 tries; the cut is the same every time for the same seed).
   */
  function plan(r, seed, W, H, v) {
    r = Recipe.normalize(r);
    v = v === 1 ? 1 : 2;
    ({ W, H } = dims(v, r, W, H));
    const set = v === 1 ? 'mixed' : setOf(r), key = Recipe.key(r) + '|' + (seed >>> 0) + '|' + W + 'x' + H + '|' + v;
    let P = PLAN_CACHE.get(key);
    if (P) return P;
    const lv = levelOf(r), pic = picture(r, W, H);
    for (let tries = 1; tries <= 4; tries++) {
      const rng = new RNG('mural:' + (seed >>> 0) + ':' + r.mural.level + (v === 1 ? '' : ':' + set + ':' + W + 'x' + H + ':' + tries));
      const c = set === 'mixed' ? { pieces: tile(W, H, lv.mix, rng), fallbacks: 0 } : cut(W, H, set, rng);
      P = { W, H, set, pic, pieces: c.pieces.map((cells, k) => pieceOf(k, cells, pic, H)), fallbacks: c.fallbacks, tries };
      if (v === 1) break;
      P.check = verify(P);
      if (P.check.ok) break;
    }
    PLAN_CACHE.set(key, P);
    if (PLAN_CACHE.size > 12) PLAN_CACHE.delete(PLAN_CACHE.keys().next().value);
    return P;
  }
  /** Piece k of a plan, from its cells. */
  function pieceOf(k, cells, pic, H) {
    const t = typeOf(k, cells), want = Pieces.shapeKey(cells), b = Pieces.boundsOf(cells);
    const rt = [0, 1, 2, 3].find((q) => Pieces.shapeKey(t.rots[q]) === want);
    const tb = t.rotBounds[rt], x = b.minX - tb.minX, y = b.minY - tb.minY;
    const abs = t.rots[rt].map(([cx, cy]) => [x + cx, y + cy]);
    // A cell over the picture shows the picture's top row under it (it is trimmed when the piece sets).
    const qt = abs.map(([ax, ay]) => quartersAt(pic, H, ax, Math.min(ay, H - 1)));
    const piece = { id: t.id, rt, x, y, cells: abs, qt, goals: [], pref: [] };
    for (let q = 0; q < 4; q++) {
      if (t.keys[q] !== t.keys[rt]) continue;
      const qb = t.rotBounds[q], gx = b.minX - qb.minX, gy = b.minY - qb.minY;
      if (exactAt(piece, t, q, gx, gy, pic, H)) piece.goals.push({ rot: q, x: gx, y: gy });
    }
    const others = (k % 2 ? [3, 1, 2] : [1, 3, 2]).map((d) => (rt + d) % 4).filter((q) => !piece.goals.some((g) => g.rot === q));
    piece.pref = others.concat([rt]);
    return piece;
  }
  /**
   * A plan played through as a player would, once for each one-button turn (clockwise; counter-clockwise under Inverted
   * Controls; both ways reach at least as much): every piece, in order, appears where spawnSpot puts it and can be
   * brought to its place turning only that way (reach), the picture is covered exactly once and nothing rests on air.
   * { ok, own (pieces that appear already in their place's turn though another looks different), why }.
   */
  function verify(P) {
    const { W, H } = P;
    let own = 0;
    for (const turn of [1, -1]) {
      const b = new L.Board(W, H + BUF), cover = new Uint8Array(W * H);
      for (let k = 0; k < P.pieces.length; k++) {
        const pc = P.pieces[k], t = Pieces.get(pc.id), sp = spawnSpot(P, k, b, turn);
        if (!b.fits(t.rots[sp.rot], sp.x, sp.y)) return { ok: false, why: 'piece ' + k + ' cannot appear' };
        if (!(sp.d >= 0) && reach(b, t, sp, pc.goals, turn, topOf(P, k, b)) < 0) return { ok: false, why: 'piece ' + k + ' cannot be reached' };
        if (turn === 1 && pc.goals.some((g) => g.rot === sp.rot) && pc.goals.length < 4) own++;
        if (!pc.cells.some(([x, y]) => y === 0 || (y - 1 < H && b.get(x, y - 1)) || pc.cells.some(([u, w]) => u === x && w === y - 1))) return { ok: false, why: 'piece ' + k + ' rests on air' };
        for (const [x, y] of pc.cells) {
          if (y >= H) continue;
          if (cover[y * W + x]++) return { ok: false, why: 'cell ' + x + ',' + y + ' twice' };
          b.set(x, y, 1);
        }
      }
      if (cover.some((c) => !c)) return { ok: false, why: 'a cell left' };
    }
    return { ok: true, own };
  }
  /** Is piece (type t) at turn rot and (x, y) exactly in its place, quarters and all? */
  function exactAt(piece, t, rot, x, y, pic, H) {
    const set = new Map(piece.cells.map(([cx, cy], i) => [cx + ',' + cy, i]));
    const d = rot - piece.rt;
    for (let i = 0; i < t.rots[rot].length; i++) {
      const ax = x + t.rots[rot][i][0], ay = y + t.rots[rot][i][1];
      if (!set.has(ax + ',' + ay)) return false;
      if (ay >= H) continue;
      const want = quartersAt(pic, H, ax, ay), got = turnQ(piece.qt[i], d);
      for (let k = 0; k < 4; k++) if (want[k] !== got[k]) return false;
    }
    return true;
  }
  /** The quarters cell i of a piece shows at turn rot. */
  const cellQ = (piece, rot, i) => turnQ(piece.qt[i], rot - piece.rt);

  // ---- reaching a place: moves and turns, as the engine makes them ----------------------------------------------------------

  /** The turns a piece may make: 1 (clockwise only), -1 (counter-clockwise only) or 0 (both ways). */
  const turnOk = (v) => (v === -1 || v === 0 ? v : 1);
  /** Presses of the one turn button (turn 1 or -1) from rot to the nearest of goals' turns: 0-3. */
  const presses = (goals, rot, turn) => goals.reduce((m, g) => Math.min(m, ((((g.rot - rot) * turn) % 4) + 4) % 4), 4) % 4;

  /**
   * The fewest moves (a step left or right, a row down, a turn, kicks as the engine takes them) from `from`
   * ({ rot, x, y }) to any of goals on board b for type t; -1 when none can be reached. turn 0 (the default): turns
   * either way, any kick. turn 1 or -1: turns that way only, and only in place or nudged sideways off a wall (one
   * column, two for a long shape), as puzzles count them: never a kick that hops the piece down or through a gap.
   */
  let SCRATCH = null;
  function scratch(N) {
    if (!SCRATCH || SCRATCH.n < N || SCRATCH.stamp > 2e9) {
      SCRATCH = { n: N, stamp: 0, fit: new Uint8Array(N), fitAt: new Uint32Array(N), seen: new Uint32Array(N), goal: new Uint32Array(N), qr: new Int8Array(N), qx: new Int16Array(N), qy: new Int16Array(N) };
    }
    SCRATCH.stamp++;
    return SCRATCH;
  }
  function reach(b, t, from, goals, turn, top) {
    turn = turn == null ? 0 : turnOk(turn);
    const dirs = turn ? [turn] : [1, -1], maxKick = t.n >= 4 ? 2 : 1;
    // top: the rows it may use (under a shut buffer), the whole board by default.
    const W = b.w, H = b.h, T = top == null ? H : top, PX = W + 8, PY = H + 8, N = 4 * PX * PY;
    const idx = (r, x, y) => (r * PY + (y + 4)) * PX + (x + 4);
    // Scratch kept between searches, told apart by a stamp (a search runs often: every spawn, every plan's check).
    const Z = scratch(N), st = Z.stamp;
    // Whether the piece fits at (r, x, y), worked out once each (a piece's box is at most 5: its spot within 4 of the board).
    const fits = (r, x, y) => {
      if (x < -4 || x >= W + 4 || y < -4 || y >= H + 4) return false;
      const i = idx(r, x, y);
      if (Z.fitAt[i] !== st) { Z.fitAt[i] = st; Z.fit[i] = y + t.rotBounds[r].maxY < T && b.fits(t.rots[r], x, y) ? 1 : 0; }
      return Z.fit[i] === 1;
    };
    if (!fits(from.rot, from.x, from.y)) return -1;
    for (const g of goals) if (g.x >= -4 && g.x < W + 4 && g.y >= -4 && g.y < H + 4) Z.goal[idx(g.rot, g.x, g.y)] = st;
    const kicks = [0, 1, 2, 3].map((r) => dirs.map((dir) => { const to = (r + dir + 4) % 4; return [to, Pieces.kicksFor(t, r, to)]; }));
    const seen = Z.seen, goal = Z.goal, qr = Z.qr, qx = Z.qx, qy = Z.qy;
    let head = 0, tail = 0;
    const go = (r, x, y) => { const i = idx(r, x, y); if (seen[i] !== st) { seen[i] = st; qr[tail] = r; qx[tail] = x; qy[tail] = y; tail++; } };
    go(from.rot, from.x, from.y);
    for (let d = 0; head < tail; d++) {
      const end = tail;
      for (; head < end; head++) {
        const r = qr[head], x = qx[head], y = qy[head];
        if (goal[idx(r, x, y)] === st) return d;
        if (fits(r, x - 1, y)) go(r, x - 1, y);
        if (fits(r, x + 1, y)) go(r, x + 1, y);
        if (fits(r, x, y - 1)) go(r, x, y - 1);
        for (const [to, ks] of kicks[r]) {
          for (const [kx, ky] of ks) {
            if (!fits(to, x + kx, y + ky)) continue;
            // The engine takes the first kick that fits; one way, only a turn a person expects counts.
            if (!turn || (ky === 0 && Math.abs(kx) <= maxKick)) go(to, x + kx, y + ky);
            break;
          }
        }
      }
    }
    return -1;
  }

  /**
   * The turns piece pc would rather appear in, best first. turn 0: pc.pref (one way, the other, a half turn, its own).
   * turn 1 or -1: one press of that turn button from its place's turn, then two, then its own.
   */
  function prefOf(pc, turn) {
    turn = turnOk(turn);
    if (!turn) return pc.pref;
    const out = [];
    for (const n of [1, 2]) for (let r = 0; r < 4; r++) if (presses(pc.goals, r, turn) === n) out.push(r);
    return out.concat([pc.rt]);
  }

  /**
   * Is the buffer open for piece k on board b: has the stack (or k's place) reached the picture's top OPEN rows (the very
   * end)? Once open it stays open: the stack only grows, and covers every earlier place, so it opens once a board.
   */
  function bufferOpen(P, k, b) {
    if (b.h <= P.H) return false;
    let top = 0;
    for (let y = P.H - 1; y >= 0 && !top; y--) for (let x = 0; x < b.w; x++) if (b.get(x, y)) { top = y + 1; break; }
    const pc = P.pieces[k];
    if (pc) for (const [, y] of pc.cells) top = Math.max(top, y + 1);
    return top > P.H - OPEN;
  }
  /** The rows piece k may appear and move in on board b: the whole board once the buffer is open, else the picture's. */
  const topOf = (P, k, b) => (bufferOpen(P, k, b) ? b.h : Math.min(b.h, P.H));

  /**
   * Where piece k appears on board b: at the top (topOf), in the first turn it would rather appear in (prefOf) whose
   * place can still be reached from there with turn's turns (reach; the column nearest the middle first); else in its
   * own turn, right over its place. { x, y, rot }.
   */
  function spawnSpot(P, k, b, turn) {
    turn = turnOk(turn);
    const pc = P.pieces[k], t = Pieces.get(pc.id), W = b.w, H = topOf(P, k, b);
    for (const rot of prefOf(pc, turn)) {
      if (pc.goals.some((g) => g.rot === rot) && rot !== pc.rt) continue;
      const bnd = t.rotBounds[rot], y = H - 1 - bnd.maxY, x0 = Math.floor((W - bnd.w) / 2) - bnd.minX;
      const xs = [x0];
      for (let dd = 1; dd < W; dd++) xs.push(x0 + dd, x0 - dd);
      for (const x of xs) {
        if (x + bnd.minX < 0 || x + bnd.maxX >= W) continue;
        if (!b.fits(t.rots[rot], x, y)) continue;
        if (rot === pc.rt && pc.goals.some((g) => g.rot === rot && g.x === x && g.y === y)) continue;
        const d = reach(b, t, { rot, x, y }, pc.goals, turn, H);
        if (d >= 0) return { x, y, rot, d };
      }
    }
    // Right over its place, in its own turn: the way down is clear (every cell over it is a later piece's).
    const g = pc.goals.find((q) => q.rot === pc.rt) || pc.goals[0] || { rot: pc.rt, x: pc.x, y: pc.y };
    const bnd = t.rotBounds[g.rot];
    return { x: g.x, y: H - 1 - bnd.maxY, rot: g.rot };
  }

  // ---- the engine's extension -----------------------------------------------------------------------------------------------

  /** A mural as saved: { v (1: from before sizes and sets; 2), seed, i (pieces set) }, on a picture W × H (v 2). */
  function valid(M, r, W, H) {
    if (!isObj(M) || (M.v !== 1 && M.v !== 2) || !Number.isInteger(M.seed) || M.seed < 0 || !Number.isInteger(M.i) || M.i < 0) return false;
    if (M.v === 2 && !(W >= SIZE.w[0] && W <= SIZE.w[1] && H >= 6 && H <= SIZE.h[1])) return false;
    return M.i <= plan(r, M.seed, W, H, M.v).pieces.length;
  }
  /** A fresh seed: every new mural (and every one started over) is cut anew. */
  const freshSeed = () => ((Math.random() * 4294967296) >>> 0) || 1;
  const summaryOf = (M, P, r) => ({ pic: r.mural.pic, level: r.mural.level, placed: M.i, total: P.pieces.length, done: M.i >= P.pieces.length });

  // The turn a mural is built for (turnOk), told by the view from the settings; clockwise without one.
  let turnMode = () => 1;
  function setTurnMode(f) { turnMode = typeof f === 'function' ? f : () => 1; }

  function extension(game, saved, o) {
    const r = game.recipe, lv = levelOf(r), old = isObj(saved) && saved.v === 1;
    // The buffer over the picture: a new board grows it; a board saved before it had one (v 1, the level's size) is
    // grown too, cells kept. A board saved since has it.
    const want = old ? lv.h + BUF : o && o.saved ? game.board.h : game.board.h + BUF;
    if (game.board.h < want) {
      const b0 = game.board, b = new L.Board(b0.w, want);
      for (let y = 0; y < b0.h; y++) for (let x = 0; x < b0.w; x++) b.set(x, y, b0.get(x, y));
      game.board = b;
    }
    const W = game.board.w, H = game.board.h - BUF;
    // A game's own (o.muralTurn: the tests'), else the settings' as they are now.
    const turn = () => turnOk(o && o.muralTurn != null ? o.muralTurn : turnMode(game));
    const M = saved !== undefined && valid(saved, r, W, H) ? clone(saved) : { v: 2, seed: (Number(game.seed) >>> 0) || 1, i: 0 };
    let made = null;
    const P = () => made || (made = plan(r, M.seed, W, H, M.v));
    // No hold: the pieces come in their one order.
    game.mods.noHold = true;
    let dealt = M.i;
    const entries = (from) => { const tn = turn(); return P().pieces.slice(from).map((p) => ({ id: p.id, rot: prefOf(p, tn)[0] })); };
    const X = {
      M,
      plan: P,
      /** The turns this mural is played with now: 1, -1 or 0 (turnOk). */
      turn,
      /** Is the buffer open (bufferOpen) for the piece in play? */
      open(g) { return bufferOpen(P(), M.i, g.board); },
      /** The rows the piece in play may use (topOf). */
      top(g) { return topOf(P(), M.i, g.board); },
      // While the buffer is shut the piece in play stays in the picture's rows: a cell over them does not fit (so a turn
      // or a nudge never carries it into the hidden rows, and the buffer never flickers open).
      placed(g, b, abs) {
        if (!g.piece || b !== g.board || bufferOpen(P(), M.i, b)) return abs;
        return abs.some(([, y]) => y >= H) ? abs.map(([x, y]) => (y >= H ? [x, b.h + 1] : [x, y])) : abs;
      },
      // The pieces in their order (the queue is made the mural's own, fixed, at the first piece).
      dealer: {
        next() { const ps = P().pieces; return ps[Math.min(dealt++, ps.length - 1)].id; },
        reroll(g, exclude) { return exclude; },
        candidates() { return []; },
      },
      spawnAt(g, b, pos, type) {
        const ps = P().pieces;
        g.fixed = true;
        g.queue = entries(M.i + 1);
        if (M.i >= ps.length || type.id !== ps[M.i].id) return pos;
        { const sp = spawnSpot(P(), M.i, b, turn()); return { x: sp.x, y: sp.y, rot: sp.rot }; }
      },
      // Set only exactly in its place: anywhere else the set does not happen (a drop leaves the piece where it was).
      refuseLock(g, b, abs) {
        const p = g.piece;
        if (p && X.exact(g, p.rot, p.x, p.y)) return null;
        if (p && g.pendingDrop) p.y += g.pendingDrop.dist;
        return 'Not its place';
      },
      // What a piece leaves over the picture is trimmed away (res.trimmed: it fades), as in Race.
      afterPlace(g, b, abs, v, res) {
        const PH = P().H, cut = [];
        for (const [x, y] of abs) if (y >= PH && b.get(x, y)) { b.set(x, y, 0); cut.push([x, y]); }
        if (cut.length) res.trimmed = cut;
        res.mural = { k: M.i, cells: abs.length - cut.length };
        M.i++;
      },
      // No row ever clears.
      rows() { return []; },
      step(g) { if (M.i >= P().pieces.length) g.end('finished'); },
      allow() { return 'Not in Mural'; },
      // Started over: cut anew (a fresh seed).
      reset(g) {
        M.i = 0; dealt = 0; M.v = 2; M.seed = freshSeed(); made = null;
        g.queue = entries(0);
        g.piece = null;
      },
      save() { return clone(M); },
      summary(g) { return summaryOf(M, P(), g.recipe); },
      /** Is the piece in play, at turn rot and (x, y), exactly in its place? */
      exact(g, rot, x, y) {
        const ps = P().pieces, pc = ps[M.i], p = g.piece;
        if (!pc || !p || p.type.id !== pc.id) return false;
        return pc.goals.some((q) => q.rot === rot && q.x === x && q.y === y);
      },
      /** The piece in play's plan entry (null when there is none). */
      current(g) { const pc = P().pieces[M.i]; return pc && g.piece && g.piece.type.id === pc.id ? pc : null; },
    };
    return X;
  }

  function extOf(game) { return game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'mural') || null : null; }

  // ---- bots (the tests'): each piece set by the fewest moves from where it appears ----------------------------------------

  /**
   * Sets every piece (or `pieces` of them) by the shortest way from where it appears, counting moves, turns and the drop
   * as a player makes them. Returns { pieces, acts, paid, perPiece, perAct, done }.
   */
  function bot(g, o) {
    o = Object.assign({ pieces: Infinity }, o || {});
    const X = extOf(g);
    let acts = 0, paid = 0, n = 0;
    const tn = X.turn();
    while (!g.over && g.piece && n < o.pieces) {
      const pc = X.current(g), p = g.piece;
      if (!pc) break;
      const d = reach(g.board, p.type, { rot: p.rot, x: p.x, y: p.y }, pc.goals, tn, X.top(g));
      if (d < 0) break;
      // As a player makes it: the turns and the steps across (never fewer), then the drop.
      const cost = (q) => (tn ? presses([q], p.rot, tn) : Math.min((q.rot - p.rot + 4) % 4, (p.rot - q.rot + 4) % 4)) + Math.abs(q.x - p.x);
      const g0 = pc.goals.reduce((a, q) => (cost(q) < cost(a) ? q : a), pc.goals[0]);
      acts += cost(g0) + 1;
      p.rot = g0.rot; p.x = g0.x; p.y = g0.y;
      const res = g.lock();
      if (!res) break;
      const cells = res.mural ? res.mural.cells : res.placed;
      paid += L.Library ? L.Library.bank(cells * PAY_CELL) : cells * PAY_CELL;
      n++;
    }
    return { pieces: n, acts, paid, perPiece: paid / Math.max(1, n), perAct: paid / Math.max(1, acts), done: g.endKind === 'finished' };
  }

  // ---- the recipe part --------------------------------------------------------------------------------------------------------

  const PART = {
    key: 'mural', order: 60, mode: 'mural', name: 'Mural', owns: ['mural'],
    options: { 'mural.level': LEVEL_IDS.slice(), 'mural.pic': PIC_IDS.slice() },
    // Its picture and level are set when the board is made: it is never edited.
    editFixed: true,
    noEdit: (r) => (on(r) ? 'A mural keeps its picture' : null),
    normalize(raw, out) {
      // Mixed is Mural's own set: anywhere else it is Normal.
      if (out.mode !== 'mural') { if (out.shapes && out.shapes.preset === 'mixed') out.shapes = { preset: 'normal' }; return; }
      const m = isObj(raw.mural) ? raw.mural : {};
      const level = LEVEL_IDS.includes(m.level) ? m.level : 2;
      let pic = PIC_IDS.includes(m.pic) ? m.pic : 'coast';
      if (pic === 'own' && !ownOk(m.own)) pic = 'coast';
      out.mural = { pic, level };
      if (pic === 'own') out.mural.own = { w: m.own.w, h: m.own.h, pal: m.own.pal.slice(), px: m.own.px };
      // Combines with nothing but its piece set (SETS: Normal unless one of them was asked for), no modifier.
      const sh = isObj(raw.shapes) ? raw.shapes.preset : null;
      out.shapes = { preset: SETS.includes(sh) ? sh : 'normal' };
      for (const k of Object.keys(out.mods || {})) out.mods[k] = false;
      delete out.physics;
    },
    label: (r, short) => (on(r) ? (short ? 'Mural' : 'Mural · ' + PIC_NAMES[r.mural.pic] + ' · Level ' + r.mural.level + (setOf(r) !== 'normal' ? ' · ' + SET_NAMES[setOf(r)] : '')) : ''),
    // Any size in SIZE (the picture is drawn at twice it each way: a bigger board, more detail); the level's by default.
    // (6 rows: a board saved before the buffer, the level's size and BUF rows shorter as saved, still opens.)
    limits(r, lim) {
      if (!on(r)) return;
      lim.w = SIZE.w.slice(); lim.h = [6, SIZE.h[1]];
    },
    clampSize(size, r, lim, asked) {
      if (!on(r)) return size;
      const lv = levelOf(r), a = asked || {};
      const pick = (v, [lo, hi], d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
      return { w: pick(a.w, SIZE.w, lv.w), h: pick(a.h, SIZE.h, lv.h) };
    },
    rules(r, R) {
      if (!on(r)) return;
      for (const id of Object.keys(L.ITEMS || {})) R.refuse[id] = 'Not in Mural';
      R.undo = false; R.hints = false; R.rated = false; R.noFeats = true; R.mural = true;
      // The buffer's rows, over the board's size (as Race's).
      R.k = BUF;
    },
    conflicts(r, out) {
      if (!on(r)) return;
      out['mods.physics=true'] = 'Not in Mural';
      out['mods.mirror=true'] = 'Not in Mural';
      for (const o of Recipe.options()) if (o.path === 'shapes.preset') for (const v of o.values) if (!SETS.includes(v)) out['shapes.preset=' + v] = 'Not in Mural';
      if (r.mural.pic !== 'own') out['mural.pic=own'] = 'Choose a photo';
    },
    valid(g, r) {
      if (!on(r)) return true;
      const x = isObj(g.x) ? g.x.mural : undefined;
      return valid(x, r, g.w, g.h - BUF);
    },
    engine(game, saved, o) { return on(game.recipe) ? extension(game, saved, o) : null; },
    controller(play, game) { return game && on(game.recipe) && L.MuralView ? L.MuralView.controller(play, game) : null; },
    summary(x, g) {
      if (!isObj(x) || !g || !on(Recipe.normalize(g.recipe))) return null;
      const r = Recipe.normalize(g.recipe), W = g.w, H = g.h - BUF;
      return valid(x, r, W, H) ? summaryOf(x, plan(r, x.seed, W, H, x.v), r) : null;
    },
    stats: { free: { mural: { placed: 0, finished: 0, own: 0, levels: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, pics: { coast: 0, still: 0, soft: 0, own: 0 } } }, timeMs: { mural: 0 } },
  };
  Recipe.part(PART);

  // ---- achievements (told by Free Play's controller: event { mode: 'mural', kind: 'finished', pic, level }) ----------------

  if (L.Achievements) {
    const done = (lv) => (s, e) => e.kind === 'finished' && e.level === lv;
    L.Achievements.group({
      id: 'mural', name: 'Mural', icon: 'mural', after: 'play',
      list: [
        { id: 'mu_first', name: 'First Mural', desc: 'Finish a mural.', pay: 30, on: 'mural', test: (s, e) => e.kind === 'finished' },
        { id: 'mu_l1', name: 'Sketch', desc: 'Finish a mural at level 1.', pay: 20, on: 'mural', test: done(1) },
        { id: 'mu_l2', name: 'Study', desc: 'Finish a mural at level 2.', pay: 30, on: 'mural', test: done(2) },
        { id: 'mu_l3', name: 'Panel', desc: 'Finish a mural at level 3.', pay: 50, on: 'mural', test: done(3) },
        { id: 'mu_l4', name: 'Fresco', desc: 'Finish a mural at level 4.', pay: 80, on: 'mural', test: done(4) },
        { id: 'mu_l5', name: 'Masterwork', desc: 'Finish a mural at level 5.', pay: 250, tier: 'legend', on: 'mural', test: done(5) },
        { id: 'mu_own', name: 'Your Own', desc: 'Finish a mural made from a photo.', pay: 60, on: 'mural', test: (s, e) => e.kind === 'finished' && e.pic === 'own' },
      ],
    });
  }

  L.Mural = {
    LEVELS, LEVEL_IDS, PICS, PIC_IDS, PIC_NAMES, PAY_CELL, OWN_MAX, B36, BUF, OPEN, SIZE, SETS, SET_NAMES, UP, bufferOpen, topOf, setOf, cut, verify, shapesOf, dims,
    on, levelOf, quantise, toKeys, KEYS, render, picture, quartersAt, turnQ, tile, plan, exactAt, cellQ, reach, spawnSpot, prefOf, presses, turnOk, setTurnMode, typeOf,
    ownOk, ownRgb, resample, fromPixels, valid, summaryOf, extOf, bot, hexRgb, rgbHex, oklab, fromLab, PART,
    of: (game) => { const e = extOf(game); return e ? e.M : null; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
