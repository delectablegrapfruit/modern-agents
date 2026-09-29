// js/art/skyline.js — owner: W2-Exterior (W3-Light in wave 3). SR.art.skyline: the six distant paper
// cities and the Sky Ribbon, drawn in the sky pass (ART_AUDIO §4, GDD §3.1; CONTRACT §15.2): each
// island a torn paper slab with its thickness band and a silhouette of its own (Crayonburg's crayon
// towers, Rustbelt Rise's chimneys, Glitter Gulch's sequin towers, Gustytown's windmills, Port
// Eraser's pink eraser blocks, Las Pegas's clothes-peg towers), 0.15 parallax (worldmap.skyIslands),
// pinprick lights at night; the Sky Ribbon, a paper strip road with a dashed centre line and tiny
// moving buses, curls from under the Bus Hole to Port Eraser and Las Pegas (worldmap.skyRibbon).
// The render core owns the draw order and budgets (js/render/sky.js calls draw once a frame while
// sky shows). Each island is one cached canvas, pre-tinted by the ambient and repainted in place
// when the 5-minute tint moves on (ARCHITECTURE §9.4, "sky tints in place"). Palette keys only.
(function () {
  'use strict';
  var SR = window.SR;

  var SPRITE = [360, 260];      // island sprite size (px); the slab's centre sits at 72 % of its height
  var SLAB = [150, 34];         // slab radii in sprite px
  var PARALLAX = 0.15;
  var SLOT_MIN = 5;             // tints follow the sky every 5 game minutes
  var RIBBON_STEPS = 24;
  var DARK_SHARE = 0.3;         // the share of an island's windows that stay dark at night
  var CITY_KEYS = ['ground', 'base', 'tower', 'roof', 'accent', 'trim', 'window'];   // palette city.<id>.* (CONTRACT §15)

  var cache = {};               // city -> { canvas, ambient, lights: [[x, y]], mills: [[x, y, r]] }
  var bboxOf = null, bboxWm = null;

  function L() { return SR.render.lib; }
  function hash(a, b, c) { return SR.util.hash(a, b, c) / 4294967296; }
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /** @returns {number[]} the island sheet's bounding box [x0, y0, x1, y1] (u). */
  function bbox(wm) {
    if (bboxOf && bboxWm === wm) return bboxOf;
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (wm && Array.isArray(wm.outline) ? wm.outline : []).forEach(function (p) {
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
    });
    if (!isFinite(b[0])) b = [0, 0, (wm && wm.size && wm.size.w) || 5120, (wm && wm.size && wm.size.h) || 4608];
    bboxOf = b; bboxWm = wm;
    return b;
  }

  // ---------------------------------------------------------------------------------------------
  // Silhouettes: each paints its city onto the slab (sprite px; ground line gy) in tinted colours.
  // `c(key)` resolves 'city.<id>.<key>' (or any palette key) multiplied by the ambient; `out.lights`
  // collects the pinprick windows, `out.mills` the windmill hubs animated per frame.
  // ---------------------------------------------------------------------------------------------

  function tower(x, cx, gy, w, h, fill, roofFill, roof) {
    x.fillStyle = fill;
    x.fillRect(cx - w / 2, gy - h, w, h);
    x.fillStyle = roofFill;
    x.beginPath();
    if (roof === 'cone') { x.moveTo(cx - w / 2 - 1, gy - h); x.lineTo(cx, gy - h - w * 0.9); x.lineTo(cx + w / 2 + 1, gy - h); }
    else if (roof === 'round') { x.moveTo(cx - w / 2, gy - h); x.arc(cx, gy - h, w / 2, Math.PI, 0); }
    else if (roof) x.rect(cx - w / 2 - 2, gy - h - 4, w + 4, 4);
    x.fill();
  }

  function windows(out, cx, gy, w, h, step) {
    for (var yy = gy - h + 8; yy < gy - 6; yy += step) out.lights.push([cx - 1.5 + (out.lights.length % 2 ? w * 0.18 : -w * 0.18), yy]);
  }

  var CITIES = {
    crayonburg: function (x, c, out, gy) {
      // Crayons as towers: wrapped bodies with sharpened tips, each a different crayon.
      var cols = ['tower', 'roof', 'accent', 'trim', 'tower', 'accent', 'roof'];
      [[-104, 18, 70], [-78, 20, 104], [-50, 16, 58], [-24, 22, 128], [6, 18, 86], [32, 20, 112], [60, 16, 64], [88, 20, 92], [112, 16, 54]].forEach(function (t, i) {
        var col = c(cols[i % cols.length]);
        tower(x, t[0], gy, t[1], t[2], col, col, 'cone');
        x.fillStyle = c('base');
        x.fillRect(t[0] - t[1] / 2, gy - t[2] * 0.62, t[1], t[2] * 0.2);
        x.fillStyle = c('ink');
        x.fillRect(t[0] - t[1] / 2, gy - t[2] * 0.62, t[1], 1.5);
        x.fillRect(t[0] - t[1] / 2, gy - t[2] * 0.42, t[1], 1.5);
        windows(out, t[0], gy, t[1], t[2] * 0.4, 12);
      });
    },
    rustbelt: function (x, c, out, gy) {
      // Rustbelt Rise: sawtooth factory halls and tall brick chimneys with smoke.
      [[-96, 70, 34], [-20, 80, 44], [60, 76, 30]].forEach(function (f) {
        x.fillStyle = c('base');
        x.fillRect(f[0] - f[1] / 2, gy - f[2], f[1], f[2]);
        x.fillStyle = c('roof');
        x.beginPath();
        for (var k = 0; k < 4; k++) { var sx = f[0] - f[1] / 2 + k * f[1] / 4; x.moveTo(sx, gy - f[2]); x.lineTo(sx + f[1] / 4, gy - f[2] - 10); x.lineTo(sx + f[1] / 4, gy - f[2]); }
        x.fill();
        windows(out, f[0], gy, f[1] * 0.6, f[2], 10);
      });
      [[-70, 10, 118], [-44, 8, 96], [16, 12, 138], [92, 9, 108], [118, 8, 84]].forEach(function (t) {
        tower(x, t[0], gy, t[1], t[2], c('tower'), c('trim'), 'flat');
        x.fillStyle = c('accent');
        [[0, 14, 9], [7, 26, 12], [16, 40, 14]].forEach(function (p) { x.beginPath(); x.arc(t[0] + p[0], gy - t[2] - p[1], p[2], 0, Math.PI * 2); x.fill(); });
        out.lights.push([t[0] - 1, gy - t[2] + 10]);
      });
    },
    glitter: function (x, c, out, gy) {
      // Glitter Gulch: slim sequinned towers, each topped with a star.
      [[-100, 20, 84], [-66, 24, 132], [-30, 18, 100], [4, 26, 154], [40, 20, 112], [74, 24, 138], [108, 18, 90]].forEach(function (t, i) {
        tower(x, t[0], gy, t[1], t[2], c(i % 2 ? 'tower' : 'base'), c('roof'), 'round');
        x.fillStyle = c(i % 2 ? 'trim' : 'accent');
        for (var yy = gy - t[2] + 10; yy < gy - 4; yy += 7) for (var xx = t[0] - t[1] / 2 + 4; xx < t[0] + t[1] / 2 - 2; xx += 6) x.fillRect(xx, yy + (xx % 2 ? 2 : 0), 2.2, 2.2);
        x.fillStyle = c('accent');
        var sy = gy - t[2] - t[1] / 2 - 8;
        x.beginPath();
        for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.6 : 6; x.lineTo(t[0] + Math.cos(a) * r, sy + Math.sin(a) * r); }
        x.fill();
        windows(out, t[0], gy, t[1], t[2], 14);
      });
    },
    gusty: function (x, c, out, gy) {
      // Gustytown: windmills among cottages; the blades turn every frame (out.mills).
      [[-110, 24, 26], [-58, 28, 30], [30, 26, 24], [110, 22, 28]].forEach(function (h) {
        x.fillStyle = c('base'); x.fillRect(h[0] - h[1] / 2, gy - h[2], h[1], h[2]);
        x.fillStyle = c('roof'); x.beginPath(); x.moveTo(h[0] - h[1] / 2 - 3, gy - h[2]); x.lineTo(h[0], gy - h[2] - 14); x.lineTo(h[0] + h[1] / 2 + 3, gy - h[2]); x.fill();
        out.lights.push([h[0] - 1.5, gy - h[2] + 10]);
      });
      [[-86, 18, 96], [-10, 22, 128], [72, 18, 104]].forEach(function (m) {
        x.fillStyle = c('tower');
        x.beginPath(); x.moveTo(m[0] - m[1] / 2 - 4, gy); x.lineTo(m[0] - m[1] / 2 + 3, gy - m[2]); x.lineTo(m[0] + m[1] / 2 - 3, gy - m[2]); x.lineTo(m[0] + m[1] / 2 + 4, gy); x.fill();
        x.fillStyle = c('roof'); x.beginPath(); x.moveTo(m[0] - m[1] / 2, gy - m[2]); x.arc(m[0], gy - m[2], m[1] / 2, Math.PI, 0); x.fill();
        out.mills.push([m[0], gy - m[2] + 2, m[2] * 0.42]);
        windows(out, m[0], gy, m[1] * 0.6, m[2] * 0.7, 16);
      });
    },
    eraser: function (x, c, out, gy) {
      // Port Eraser: pink eraser blocks with blue sleeves, worn round at the corners, and a lighthouse.
      [[-98, 42, 58], [-50, 38, 96], [-4, 46, 74], [44, 40, 120], [96, 44, 66]].forEach(function (t) {
        var x0 = t[0] - t[1] / 2, r = 8;
        x.fillStyle = c('tower');
        x.beginPath(); x.moveTo(x0, gy); x.lineTo(x0, gy - t[2] + r); x.quadraticCurveTo(x0, gy - t[2], x0 + r, gy - t[2]);
        x.lineTo(x0 + t[1] - r, gy - t[2]); x.quadraticCurveTo(x0 + t[1], gy - t[2], x0 + t[1], gy - t[2] + r); x.lineTo(x0 + t[1], gy); x.fill();
        x.fillStyle = c('roof'); x.fillRect(x0, gy - t[2] * 0.55, t[1], t[2] * 0.3);
        x.fillStyle = c('accent'); x.fillRect(x0 + 4, gy - t[2] * 0.47, t[1] - 8, 2);
        windows(out, t[0], gy, t[1], t[2], 13);
      });
      tower(x, 128, gy, 10, 88, c('accent'), c('roof'), 'cone');
      out.lights.push([127, gy - 84]);
    },
    pegas: function (x, c, out, gy) {
      // Las Pegas: clothes-peg towers (two wooden jaws and a steel spring), lights on every tip.
      [[-100, 16, 96], [-62, 20, 136], [-22, 16, 108], [18, 22, 160], [60, 18, 118], [100, 16, 92]].forEach(function (t) {
        var j = t[1] / 2;
        x.fillStyle = c('tower');
        x.beginPath(); x.moveTo(t[0] - j, gy); x.lineTo(t[0] - j - 2, gy - t[2]); x.lineTo(t[0] - 1, gy - t[2]); x.lineTo(t[0] - 1, gy); x.fill();
        x.fillStyle = c('base');
        x.beginPath(); x.moveTo(t[0] + 1, gy); x.lineTo(t[0] + 1, gy - t[2]); x.lineTo(t[0] + j + 2, gy - t[2]); x.lineTo(t[0] + j, gy); x.fill();
        x.strokeStyle = c('trim'); x.lineWidth = 2.5;
        x.beginPath(); x.arc(t[0], gy - t[2] * 0.4, j * 0.75, 0, Math.PI * 2); x.stroke();
        x.fillStyle = c('accent'); x.fillRect(t[0] - j - 2, gy - t[2] - 3, t[1] + 4, 3);
        out.lights.push([t[0] - j, gy - t[2] - 2], [t[0] + j - 2, gy - t[2] - 2]);
        windows(out, t[0], gy, t[1], t[2] * 0.3, 10);
      });
    },
  };

  /** Paints (or repaints in place) a city's island sprite, tinted by the ambient. @returns {object} the cache entry */
  function islandSprite(city, ambient) {
    var e = cache[city];
    if (e && e.ambient === ambient) return e;
    var c = e ? e.canvas : makeCanvas(SPRITE[0], SPRITE[1]);
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.clearRect(0, 0, c.width, c.height);
    var out = { lights: [], mills: [] };
    var pk = 'city.' + city + '.';
    var tint = function (key, fb) {
      var k = CITY_KEYS.indexOf(key) >= 0 ? pk + key : key;
      return L().mul(L().pal([k, fb || 'stone'], 0.7), ambient);
    };
    var cx = SPRITE[0] / 2, gy = SPRITE[1] * 0.72;
    // The torn slab: its thickness band, the top sheet, then the city standing on it.
    var edge = [];
    for (var i = 0; i <= 44; i++) {
      var a = i / 44 * Math.PI * 2, r = 1 + (hash(city, 'edge', i) - 0.5) * 0.08;
      edge.push([cx + Math.cos(a) * SLAB[0] * r, gy + Math.sin(a) * SLAB[1] * r]);
    }
    function slab(dy) { x.beginPath(); edge.forEach(function (p, k) { if (k) x.lineTo(p[0], p[1] + dy); else x.moveTo(p[0], p[1] + dy); }); x.closePath(); }
    slab(12); x.fillStyle = tint('strata2'); x.fill();
    slab(6); x.fillStyle = tint('strata1'); x.fill();
    slab(0); x.fillStyle = tint('ground', 'paperEdge'); x.fill();
    x.translate(cx, 0);
    var draw = CITIES[city];
    if (draw) draw(x, tint, out, gy - 4);
    else CITIES.crayonburg(x, tint, out, gy - 4);
    x.setTransform(1, 0, 0, 1, 0, 0);
    // A faint ink outline around the slab (the paper cut).
    slab(0); x.strokeStyle = tint('ink'); x.globalAlpha = 0.45; x.lineWidth = 1.5; x.stroke(); x.globalAlpha = 1;
    // The windows lit at night (a fixed 70 %, hashed here once rather than every frame).
    var lit = [];
    out.lights.forEach(function (p, i) { if (hash(city, 'lit', i) >= DARK_SHARE) lit.push([p[0] + cx, p[1]]); });
    e = cache[city] = { canvas: c, ambient: ambient, lights: out.lights.map(function (p) { return [p[0] + cx, p[1]]; }), lit: lit, mills: out.mills.map(function (m) { return [m[0] + cx, m[1], m[2]]; }) };
    return e;
  }

  /** @returns {{x: number, y: number, s: number}} an island's screen centre (stage units) and scale. */
  function screenOf(v, wm, isl) {
    var b = bbox(wm), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var p = typeof isl.parallax === 'number' ? isl.parallax : PARALLAX;
    var zk = 0.75 + 0.25 * v.zoom;
    return { x: v.W / 2 + ((cx - v.x) + isl.x) * p * zk, y: v.H / 2 + ((cy - v.y) + isl.y) * p * zk, s: (isl.scale || 0.5) * zk };
  }

  function ambientOf(v) {
    var Li = SR.render.lighting;
    var slot = Li && Li.at ? Li.at(Math.floor((v.min || 0) / SLOT_MIN) * SLOT_MIN, v.weather) : null;
    return (slot && slot.ambient) || (v.sky && v.sky.ambient) || L().pal('white', 1);
  }

  /**
   * Draws the six distant islands and the Sky Ribbon (stage units, the sky pass).
   * @param {CanvasRenderingContext2D} ctx the stage context (transform in logical stage units)
   * @param {object} v the frame's view: x, y, zoom, W, H, t, min, light, sky, ppu, tx, ty, s
   * @param {object} wm the worldmap (skyIslands, skyRibbon, holes, outline)
   * @returns {object} city -> screen position, for callers that attach more to an island
   */
  function draw(ctx, v, wm) {
    var list = (wm && wm.skyIslands) || [];
    var ambient = ambientOf(v);
    var pos = {};
    var night = Math.max(0, Math.min(1, v.light || 0));
    for (var j = 0; j < list.length; j++) pos[list[j].city] = screenOf(v, wm, list[j]);
    // The ribbon first: its far end tucks under the island it reaches.
    ribbon(ctx, v, wm, pos, ambient);
    for (var i = 0; i < list.length; i++) {
      var isl = list[i];
      var s = pos[isl.city];
      var w = SPRITE[0] * s.s, h = SPRITE[1] * s.s;
      var x0 = s.x - w / 2, y0 = s.y - h * 0.72;
      if (x0 + w < 0 || x0 > v.W || y0 + h < 0 || y0 > v.H) continue;
      var spr = islandSprite(isl.city, ambient);
      ctx.drawImage(spr.canvas, x0, y0, w, h);
      L().count.images++;
      if (spr.mills.length) mills(ctx, spr, x0, y0, s.s, v, ambient, isl.city);
      if (night > 0.2) pinpricks(ctx, spr, isl.city, x0, y0, s.s, night);
    }
    return pos;
  }

  function mills(ctx, spr, x0, y0, k, v, ambient, city) {
    ctx.save();
    ctx.strokeStyle = L().mul(L().pal(['city.' + city + '.trim', 'ink'], 0.3), ambient);
    ctx.lineWidth = Math.max(1, 2.2 * k);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < spr.mills.length; i++) {
      var m = spr.mills[i], a = (v.t || 0) * (0.6 + i * 0.15) + i;
      for (var b = 0; b < 4; b++) {
        var aa = a + b * Math.PI / 2;
        ctx.moveTo(x0 + m[0] * k, y0 + m[1] * k);
        ctx.lineTo(x0 + (m[0] + Math.cos(aa) * m[2]) * k, y0 + (m[1] + Math.sin(aa) * m[2]) * k);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The pinprick lights at night (ART_AUDIO §3): additive × the light factor, some windows dark. */
  function pinpricks(ctx, spr, city, x0, y0, k, light) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = light;
    ctx.fillStyle = L().pal(['city.' + city + '.window', 'light.pinprick', 'glassLit'], 0.9);
    ctx.beginPath();
    var r = Math.max(1.2, 3.2 * k);
    for (var i = 0; i < spr.lit.length; i++) {
      var p = spr.lit[i];
      ctx.rect(x0 + p[0] * k, y0 + p[1] * k, r, r);
    }
    ctx.fill();
    ctx.restore();
    L().count.fills++;
  }

  /** A point and the unit normal of a cubic Bézier at t. */
  function bez(p, t, out) {
    var u = 1 - t;
    out.x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
    out.y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
    var dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
    var dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
    var n = Math.hypot(dx, dy) || 1;
    out.nx = -dy / n; out.ny = dx / n;
    return out;
  }

  var tmp = { x: 0, y: 0, nx: 0, ny: 0 };

  /** The Sky Ribbon: a paper strip that narrows with distance, its edge band, the dashed centre line and tiny buses. */
  function ribbon(ctx, v, wm, pos, ambient) {
    var R = wm && wm.skyRibbon;
    if (!R || !Array.isArray(R.to)) return;
    var hole = ((wm.holes || [])[0] || {}).rect;
    var fx = hole ? (hole[0] + hole[2]) / 2 : (R.from || [0, 0])[0], fy = hole ? (hole[1] + hole[3]) / 2 : (R.from || [0, 0])[1];
    var sx = (fx * v.ppu + v.tx) / v.s, sy = (fy * v.ppu + v.ty) / v.s;
    var paper = L().mul(L().pal('paperEdge', 0.93), ambient), band = L().mul(L().pal('strata1', 0.7), ambient);
    var dash = L().mul(L().pal('lanePaint', 0.85), ambient);
    var bus = L().mul(L().pal(['car.skybus', 'paperEdge'], 0.9), ambient), stripe = L().mul(L().pal(['car.skybusStripe', 'bld.bus.walls'], 0.6), ambient);
    for (var k = 0; k < R.to.length; k++) {
      var e = pos[R.to[k]];
      if (!e) continue;
      var ex = e.x - 30 * e.s, ey = e.y + 18 * e.s;
      // It dives south under the sheet, then rises into the island's underside from below.
      var p = [sx, sy, sx + 40 * v.zoom, sy + 380 * v.zoom, ex + (k ? -40 : 40) * e.s, ey + 240 * e.s, ex, ey];
      var w0 = 30 * v.zoom, w1 = 60 * e.s, m = Math.max(w0, w1) + 5 * v.zoom + 12 * v.zoom;
      // A Bézier stays inside its control points' hull: skip the ribbon when that box is off screen.
      if (Math.max(p[0], p[2], p[4], p[6]) < -m || Math.min(p[0], p[2], p[4], p[6]) > v.W + m ||
          Math.max(p[1], p[3], p[5], p[7]) < -m || Math.min(p[1], p[3], p[5], p[7]) > v.H + m) continue;
      var left = [], right = [];
      for (var i = 0; i <= RIBBON_STEPS; i++) {
        var t = i / RIBBON_STEPS, q = bez(p, t, tmp), w = (w0 + (w1 - w0) * t) / 2;
        left.push(q.x + q.nx * w, q.y + q.ny * w);
        right.push(q.x - q.nx * w, q.y - q.ny * w);
      }
      ctx.save();
      strip(ctx, left, right, 0, 5 * v.zoom); ctx.fillStyle = band; ctx.fill();
      strip(ctx, left, right, 0, 0); ctx.fillStyle = paper; ctx.fill();
      ctx.strokeStyle = dash;
      ctx.lineWidth = Math.max(1, 2.5 * v.zoom);
      ctx.setLineDash([10 * v.zoom, 12 * v.zoom]);
      ctx.lineDashOffset = -(v.t || 0) * 30;
      ctx.beginPath();
      for (var j = 0; j <= RIBBON_STEPS; j++) { var c = bez(p, j / RIBBON_STEPS, tmp); if (j) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); }
      ctx.stroke();
      ctx.restore();
      L().count.fills += 2;
      // Two tiny buses ride each ribbon away from the depot, shrinking with the distance.
      for (var b = 0; b < 2; b++) {
        var tt = ((v.t || 0) * 0.03 + b * 0.5 + k * 0.23) % 1;
        var qb = bez(p, tt, tmp), sz = (1 - tt) * 11 * v.zoom + tt * 5 * e.s;
        ctx.fillStyle = bus; ctx.fillRect(qb.x - sz, qb.y - sz * 0.55, sz * 2, sz * 1.1);
        ctx.fillStyle = stripe; ctx.fillRect(qb.x - sz, qb.y - sz * 0.05, sz * 2, sz * 0.28);
        L().count.fills += 2;
      }
    }
  }

  function strip(ctx, left, right, dx, dy) {
    ctx.beginPath();
    for (var i = 0; i < left.length; i += 2) { if (i) ctx.lineTo(left[i] + dx, left[i + 1] + dy); else ctx.moveTo(left[i] + dx, left[i + 1] + dy); }
    for (var j = right.length - 2; j >= 0; j -= 2) ctx.lineTo(right[j] + dx, right[j + 1] + dy);
    ctx.closePath();
  }

  SR.art.skyline = {
    draw: draw,
    screenOf: screenOf,
    /** @returns {string[]} the cities that have a silhouette of their own. */
    cities: function () { return Object.keys(CITIES); },
    /** Drops the island sprites (they repaint lazily). */
    invalidate: function () { cache = {}; bboxOf = null; },
    /** @returns {{px: number, bytes: number, islands: number}} the island sprites' size (the sky's ≤ 6 MB budget). */
    stats: function () {
      var px = 0;
      Object.keys(cache).forEach(function (k) { px += cache[k].canvas.width * cache[k].canvas.height; });
      return { px: px, bytes: px * 4, islands: Object.keys(cache).length };
    },
  };
})();
