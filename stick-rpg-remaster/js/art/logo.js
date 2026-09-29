// js/art/logo.js — owner: W1-A. SR.art.logo: the PAPER SKY logo (ART_AUDIO §11): custom ink-brush
// letterforms built from Bézier strokes, drawn stroke by stroke (UI.md §5.1: 1.2 s on the boot
// screen), with the torn paper tag underneath. The words come from the text table (game.title,
// game.tag; GDD §1.3), so a rename is a text edit: the letterforms cover A-Z, 0-9 and . ! ? - '.
//
// draw(ctx, t, opts) — t: seconds since the logo started (undefined or ≥ duration: complete).
//   opts: x (centre, default 640), y (letter baseline, default 330), width (word width, default 760),
//   title / tag (override strings; tag: false hides the tag), color (palette key, default 'ui.ink-900')
//   → { x, y, w, h } the letters' box.
// Public: draw, duration (1.2 s for the letters; the tag lands by duration + 0.3), measure(title, width).
(function () {
  'use strict';
  var SR = window.SR;
  var DURATION = 1.2;
  var TAG_TIME = 0.3;

  // Glyphs on a 100-unit cap height (y 0 top, 100 baseline): advance width and strokes in writing
  // order. 'M x y' starts, 'C' is a cubic, 'L' a straight brush line.
  var G = {
    A: [78, ['M4 100 C14 70 26 34 39 0', 'M39 0 C52 34 64 70 74 100', 'M18 64 C32 62 46 61 60 62']],
    B: [66, ['M10 2 L10 98', 'M8 4 C40 -4 62 6 58 24 C55 40 36 48 12 48', 'M12 48 C46 44 66 58 62 76 C58 96 34 102 8 96']],
    C: [70, ['M64 16 C54 -2 22 -4 10 22 C0 46 4 80 24 94 C40 104 58 98 66 84']],
    D: [72, ['M10 2 L10 98', 'M8 4 C52 -6 70 24 68 52 C66 82 44 102 8 96']],
    E: [60, ['M10 3 L10 97', 'M10 3 C26 2 40 2 56 4', 'M10 50 C22 49 34 48 46 49', 'M10 97 C28 98 42 98 58 96']],
    F: [58, ['M10 3 L10 100', 'M10 3 C26 2 40 2 56 5', 'M10 50 C22 49 32 48 44 50']],
    G: [74, ['M64 16 C54 -2 22 -4 10 22 C0 46 4 80 24 94 C44 106 66 94 66 70 L66 56', 'M44 56 L70 55']],
    H: [72, ['M10 0 L10 100', 'M62 0 L62 100', 'M10 50 C28 48 44 48 62 50']],
    I: [22, ['M11 0 L11 100']],
    J: [52, ['M44 0 C44 30 46 62 42 80 C38 100 14 104 4 86']],
    K: [68, ['M10 0 L10 100', 'M60 2 C44 22 28 40 12 58', 'M26 46 C40 62 52 80 64 100']],
    L: [56, ['M10 0 L10 97', 'M10 97 C26 98 40 98 54 96']],
    M: [90, ['M6 100 C8 66 10 34 12 0', 'M12 0 C24 30 36 58 45 80', 'M45 80 C56 54 68 28 78 0', 'M78 0 C80 34 82 66 84 100']],
    N: [74, ['M8 100 C8 66 9 34 10 0', 'M10 0 C28 34 46 66 64 100', 'M64 100 C64 66 65 34 66 0']],
    O: [80, ['M40 2 C12 2 2 30 4 54 C6 80 22 98 42 98 C66 98 78 72 76 46 C74 20 62 2 40 2 C34 2 30 4 28 6']],
    P: [64, ['M10 0 L10 100', 'M8 4 C40 -6 64 6 60 26 C56 46 32 52 12 50']],
    Q: [80, ['M40 2 C12 2 2 30 4 54 C6 80 22 98 42 98 C66 98 78 72 76 46 C74 20 62 2 40 2 C34 2 30 4 28 6', 'M46 70 C56 82 66 92 78 102']],
    R: [68, ['M10 0 L10 100', 'M8 4 C40 -6 62 6 58 26 C54 44 32 50 12 50', 'M28 50 C40 66 52 84 64 100']],
    S: [62, ['M56 12 C44 -4 12 -2 8 20 C4 42 54 44 56 70 C58 96 22 106 4 86']],
    T: [70, ['M4 4 C24 2 46 2 66 4', 'M35 3 L35 100']],
    U: [72, ['M10 0 C10 30 8 60 12 78 C18 104 54 104 60 78 C64 60 62 30 62 0']],
    V: [74, ['M4 0 C14 34 26 68 37 100', 'M37 100 C48 68 60 34 70 0']],
    W: [100, ['M4 0 C10 34 16 68 24 100', 'M24 100 C32 72 40 44 50 16', 'M50 16 C58 44 66 72 76 100', 'M76 100 C84 68 90 34 96 0']],
    X: [72, ['M6 0 C26 32 46 66 66 100', 'M66 0 C46 34 26 66 6 100']],
    Y: [70, ['M4 0 C14 18 24 34 35 50', 'M66 0 C56 18 46 34 35 50', 'M35 50 L35 100']],
    Z: [66, ['M6 4 C24 2 42 2 60 4', 'M60 4 C42 34 24 66 6 96', 'M6 96 C24 98 42 98 62 96']],
    0: [60, ['M30 2 C10 2 4 30 4 50 C4 76 14 98 30 98 C48 98 56 74 56 50 C56 24 48 2 30 2']],
    1: [36, ['M8 16 C16 12 22 6 26 0 L26 100']],
    2: [60, ['M6 22 C10 2 46 -4 52 18 C58 40 28 64 6 96 C24 98 40 98 56 96']],
    3: [58, ['M6 12 C18 -4 52 0 50 22 C48 40 30 46 20 46 C46 46 56 62 52 80 C46 104 14 102 4 86']],
    4: [64, ['M44 100 L44 0', 'M44 0 C30 24 16 48 4 68 C22 68 42 67 60 68']],
    5: [60, ['M54 4 C40 2 24 2 14 4 C12 20 10 34 10 44 C30 34 54 40 54 66 C54 96 20 104 4 86']],
    6: [60, ['M50 8 C36 -6 6 4 6 50 C6 84 18 98 32 98 C48 98 56 84 56 68 C56 50 44 42 32 42 C18 42 8 52 6 60']],
    7: [58, ['M4 4 C22 2 38 2 54 4 C40 34 28 66 20 100']],
    8: [60, ['M30 48 C8 44 6 4 30 2 C54 4 52 44 30 48 C4 52 4 98 30 98 C56 98 56 52 30 48']],
    9: [60, ['M54 40 C50 54 38 58 28 58 C12 58 4 46 4 30 C4 12 16 2 30 2 C46 2 54 18 54 40 C54 70 44 96 20 98']],
    '.': [20, ['M10 91 L10 98']],
    '!': [22, ['M11 0 L11 66', 'M11 90 L11 98']],
    '?': [56, ['M6 18 C10 -2 48 -4 50 20 C52 40 28 44 28 66', 'M28 90 L28 98']],
    '-': [44, ['M6 56 L38 55']],
    '\'': [18, ['M9 0 L8 24']],
    ' ': [34, []],
  };
  var GAP = 12;        // between letters
  var SLANT = -0.07;   // a slight forward lean of the brush
  var BRUSH = 17;      // stroke width at full pressure (glyph units)

  // ---- parsing and sampling (lazy, cached per glyph) -----------------------------------------------
  function cubic(out, x0, y0, x1, y1, x2, y2, x3, y3) {
    var len = Math.sqrt((x3 - x0) * (x3 - x0) + (y3 - y0) * (y3 - y0)) + Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) + Math.sqrt((x3 - x2) * (x3 - x2) + (y3 - y2) * (y3 - y2));
    var n = Math.max(4, Math.ceil(len / 3));
    for (var i = 1; i <= n; i++) {
      var t = i / n, u = 1 - t;
      out.push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
    }
  }
  function parseStroke(d) {
    var tok = d.replace(/([MLC])/g, ' $1 ').trim().split(/\s+/), pts = [], i = 0, cx = 0, cy = 0;
    while (i < tok.length) {
      var c = tok[i++];
      if (c === 'M') { cx = +tok[i++]; cy = +tok[i++]; pts.push(cx, cy); }
      else if (c === 'L') {
        var x = +tok[i++], y = +tok[i++];
        // a straight brush line bows very slightly
        var mx = (x - cx), my = (y - cy);
        cubic(pts, cx, cy, cx + mx / 3 + my * 0.02, cy + my / 3 - mx * 0.02, cx + mx * 2 / 3 + my * 0.02, cy + my * 2 / 3 - mx * 0.02, x, y);
        cx = x; cy = y;
      } else if (c === 'C') {
        var a = +tok[i++], b = +tok[i++], e = +tok[i++], f = +tok[i++], g = +tok[i++], h = +tok[i++];
        cubic(pts, cx, cy, a, b, e, f, g, h);
        cx = g; cy = h;
      }
    }
    // cumulative length
    var L = [0];
    for (var j = 2; j < pts.length; j += 2) {
      var dx = pts[j] - pts[j - 2], dy = pts[j + 1] - pts[j - 1];
      L.push(L[L.length - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return { pts: pts, cum: L, len: L[L.length - 1] };
  }
  var glyphCache = {};
  function glyph(ch) {
    var key = G[ch] ? ch : G[ch.toUpperCase()] ? ch.toUpperCase() : ' ';
    if (!glyphCache[key]) glyphCache[key] = { w: G[key][0], strokes: G[key][1].map(parseStroke) };
    return glyphCache[key];
  }

  /** @returns {{w: number, k: number, glyphs: object[]}} layout of a title at a word width. */
  function measure(title, width) {
    var glyphs = [], x = 0;
    var s = String(title || '');
    for (var i = 0; i < s.length; i++) {
      var g = glyph(s[i]);
      glyphs.push({ g: g, x: x });
      x += g.w + GAP;
    }
    var w = Math.max(1, x - GAP);
    return { w: w, k: (width || 760) / w, glyphs: glyphs };
  }

  // ---- brush rendering -------------------------------------------------------------------------------
  // The stroke is a ribbon whose half-width follows a pressure curve (tapered ends, heavier downstrokes).
  function ribbon(ctx, st, upto, k) {
    var p = st.pts, cum = st.cum, n = p.length / 2;
    if (n < 2 || upto <= 0) return;
    var total = st.len;
    var left = [], right = [];
    for (var i = 0; i < n; i++) {
      var s = cum[i];
      if (s > upto) break;
      var i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      var dx = p[i1 * 2] - p[i0 * 2], dy = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      var dl = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= dl; dy /= dl;
      var u = total ? s / total : 0;
      var taper = Math.pow(Math.min(1, u / 0.1), 0.55) * Math.pow(Math.min(1, (1 - u) / 0.16), 0.5);
      var press = (0.3 + 0.7 * taper) * (0.68 + 0.46 * Math.abs(dy));
      var hw = BRUSH * 0.5 * press;
      left.push(p[i * 2] - dy * hw, p[i * 2 + 1] + dx * hw);
      right.push(p[i * 2] + dy * hw, p[i * 2 + 1] - dx * hw);
    }
    if (left.length < 4) {
      ctx.beginPath(); ctx.arc(p[0], p[1], BRUSH * 0.2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (var a = 2; a < left.length; a += 2) ctx.lineTo(left[a], left[a + 1]);
    for (var b = right.length - 2; b >= 0; b -= 2) ctx.lineTo(right[b], right[b + 1]);
    ctx.closePath();
    ctx.fill();
    // the wet leading edge while the stroke is still being drawn
    if (upto < total) {
      var li = left.length - 2;
      var ex = (left[li] + right[li]) / 2, ey = (left[li + 1] + right[li + 1]) / 2;
      var r = Math.sqrt((left[li] - right[li]) * (left[li] - right[li]) + (left[li + 1] - right[li + 1]) * (left[li + 1] - right[li + 1])) / 2;
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(r, 1 / k), 0, Math.PI * 2); ctx.fill();
    }
  }

  function tagText(opts) {
    if (opts && typeof opts.tag === 'string') return opts.tag;
    return SR.text('game.tag');
  }
  function titleText(opts) {
    if (opts && typeof opts.title === 'string') return opts.title;
    return SR.text('game.title');
  }

  /**
   * Draws the logo (see the header).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number=} t seconds since the logo started
   * @param {object=} opts
   * @returns {{x: number, y: number, w: number, h: number}}
   */
  function draw(ctx, t, opts) {
    opts = opts || {};
    var done = t === undefined || t === null || t >= DURATION + TAG_TIME;
    var cx = opts.x === undefined ? 640 : opts.x, base = opts.y === undefined ? 330 : opts.y;
    var lay = measure(titleText(opts).toUpperCase(), opts.width || 760);
    var k = lay.k;
    var x0 = cx - lay.w * k / 2, top = base - 100 * k;
    var ink = SR.art.draw.color(opts.color || 'ui.ink-900');

    // total stroke length → the time each stroke starts
    var total = 0;
    lay.glyphs.forEach(function (gl) { gl.g.strokes.forEach(function (st) { total += st.len; }); });
    var drawn = done ? Infinity : Math.max(0, (t / DURATION)) * total;

    ctx.save();
    ctx.translate(x0, top);
    ctx.transform(k, 0, SLANT * k, k, -SLANT * k * 100, 0);
    // a faint bleed under the ink, then the ink itself
    for (var pass = 0; pass < 2; pass++) {
      var remaining = drawn;
      ctx.fillStyle = pass === 0 ? SR.art.draw.alpha(ink, 0.12) : ink;
      for (var gi = 0; gi < lay.glyphs.length && remaining > 0; gi++) {
        var gl = lay.glyphs[gi];
        ctx.save();
        ctx.translate(gl.x, 0);
        if (pass === 0) ctx.translate(1.5, 1.8);
        for (var si = 0; si < gl.g.strokes.length && remaining > 0; si++) {
          var st = gl.g.strokes[si];
          ribbon(ctx, st, Math.min(st.len, remaining), k);
          remaining -= st.len;
        }
        ctx.restore();
      }
    }
    ctx.restore();

    // the torn paper tag slides in once the letters are down
    if (opts.tag !== false) {
      var tp = done ? 1 : Math.max(0, Math.min(1, (t - DURATION) / TAG_TIME));
      if (tp > 0) drawTag(ctx, tagText(opts), cx + lay.w * k * 0.5, base + 12 + 14 * k, k, tp);
    }
    return { x: x0, y: top, w: lay.w * k, h: 100 * k };
  }

  function drawTag(ctx, str, right, y, k, p) {
    var D = SR.art.draw;
    var size = Math.max(12, Math.round(22 * Math.min(1.4, k * 1.25)));
    ctx.save();
    ctx.font = D.font(size, 700, 'ui');
    var tw = ctx.measureText(str).width;
    var w = tw + size * 1.4, h = size * 1.7;
    var e = SR.util ? SR.util.easeOut(p) : p;
    ctx.globalAlpha *= e;
    ctx.translate(right - w + (1 - e) * 24, y);
    ctx.rotate(-3 * Math.PI / 180);
    D.shadow(ctx, function (g) { SR.art.paper.tornRect(g, 0, 0, w, h, { seed: 7, amp: 4, step: 6, edges: 'lr' }); }, { dx: 3, dy: 4 });
    SR.art.paper.tornRect(ctx, 0, 0, w, h, { seed: 7, amp: 4, step: 6, edges: 'lr' });
    ctx.fillStyle = D.color('ui.paper-0');
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = D.color('ui.paper-3');
    ctx.stroke();
    D.text(ctx, str, w / 2, h / 2 + size * 0.35, { size: size, weight: 700, color: 'ui.ink-700', align: 'center' });
    ctx.restore();
  }

  SR.art.logo = { draw: draw, duration: DURATION, measure: measure };
})();
