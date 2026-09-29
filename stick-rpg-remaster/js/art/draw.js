// js/art/draw.js — owner: W1-A. SR.art.draw: the shared canvas vocabulary of the ink-and-paper look
// (ART_AUDIO §1.1): palette-key resolution, the three tones of a material (HSL), ink strokes, flat
// paper fills, rounded rects, polygons, system-font text, the stacked-paper shadow, and the Stamp and
// FloatText renditions (ART_AUDIO §11-§12).
//
// Colours: every function that takes a colour accepts a palette key ('bld.bank.walls', 'karma.good.3',
// 'ui.ink-900') or a CSS colour string produced at runtime (tone, mix, alpha). No colour literal lives
// here (ARCHITECTURE §21): the few defaults are palette keys.
//
// Public: color, parse, hex, tone, mix, alpha, luma, inkStroke, paperFill, roundRect, poly, text, font,
// shadow, stamp, floatText, lineWidth, FONTS.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // System font stacks (UI.md §2.1 type roles; ART_AUDIO §1.1: all text uses fillText in system fonts).
  var FONTS = {
    display: '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif',
    ui: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    news: 'Georgia, "Times New Roman", Times, serif',
  };

  // ---- colours ------------------------------------------------------------------------------------

  var keyCache = new Map();

  /**
   * Resolves a palette key (dotted path into SR.art.palette, CONTRACT D32) to its CSS colour.
   * A value that is not a key (a runtime CSS colour such as tone() output) is returned unchanged.
   * @param {string} v palette key or CSS colour
   * @returns {string}
   */
  function color(v) {
    if (typeof v !== 'string') return v;
    if (v.charCodeAt(0) === 35) return v; // '#': already a colour
    var hit = keyCache.get(v);
    if (hit !== undefined) return hit;
    var node = SR.art.palette;
    var parts = v.split('.');
    for (var i = 0; i < parts.length && node != null; i++) node = node[parts[i]];
    var out = typeof node === 'string' ? node : v;
    if (typeof node !== 'string' && /^[a-z][\w-]*(\.[\w-]+)+$|^[a-z]\w*$/i.test(v) && SR.art.palette && !/^(transparent|currentcolor|none)$/i.test(v)) {
      SR.util.warnOnce('palette:' + v, 'SR.art.draw.color: unknown palette key "' + v + '"');
    }
    if (SR.art.palette) keyCache.set(v, out);
    return out;
  }

  /** @returns {number[]} [r, g, b, a] (0-255, alpha 0-1) of a hex colour or palette key. */
  function parse(v) {
    var s = color(v);
    var out = [0, 0, 0, 1];
    if (typeof s !== 'string' || s.charCodeAt(0) !== 35) return out;
    var h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      out[0] = parseInt(h[0] + h[0], 16); out[1] = parseInt(h[1] + h[1], 16); out[2] = parseInt(h[2] + h[2], 16);
      if (h.length === 4) out[3] = parseInt(h[3] + h[3], 16) / 255;
    } else if (h.length === 6 || h.length === 8) {
      out[0] = parseInt(h.slice(0, 2), 16); out[1] = parseInt(h.slice(2, 4), 16); out[2] = parseInt(h.slice(4, 6), 16);
      if (h.length === 8) out[3] = parseInt(h.slice(6, 8), 16) / 255;
    }
    return out;
  }

  function hx(n) {
    n = Math.max(0, Math.min(255, Math.round(n)));
    return (n < 16 ? '0' : '') + n.toString(16).toUpperCase();
  }

  /** @returns {string} '#RRGGBB', or '#RRGGBBAA' when a < 1. */
  function hex(r, g, b, a) {
    var s = '#' + hx(r) + hx(g) + hx(b);
    return a === undefined || a >= 1 ? s : s + hx(a * 255);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hue(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function hslToRgb(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
  }

  var toneCache = new Map();
  // ART_AUDIO §1.1: shade = -12 % lightness (south faces, undersides), highlight = +10 % (roof edges).
  var TONE_STEP = { '-1': -0.12, '0': 0, '1': 0.10 };

  /**
   * One of the three tones of a material, computed in HSL.
   * @param {string} base palette key or colour
   * @param {number} k -1 shade, 0 base, 1 highlight (other values scale the step linearly)
   * @returns {string} '#RRGGBB[AA]'
   */
  function tone(base, k) {
    k = k || 0;
    var ck = base + '|' + k;
    var hit = toneCache.get(ck);
    if (hit) return hit;
    var c = parse(base);
    var hsl = rgbToHsl(c[0], c[1], c[2]);
    var step = hasOwn.call(TONE_STEP, String(k)) ? TONE_STEP[String(k)] : k * (k < 0 ? 0.12 : 0.10);
    var l = Math.max(0, Math.min(1, hsl[2] + step));
    var rgb = hslToRgb(hsl[0], hsl[1], l);
    var out = hex(rgb[0], rgb[1], rgb[2], c[3]);
    toneCache.set(ck, out);
    return out;
  }

  /** @returns {string} the colour t of the way from a to b (RGB and alpha). */
  function mix(a, b, t) {
    var x = parse(a), y = parse(b);
    return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, x[3] + (y[3] - x[3]) * t);
  }

  /** @returns {string} the colour with its alpha multiplied by a ('#RRGGBBAA'). */
  function alpha(c, a) {
    var x = parse(c);
    return hex(x[0], x[1], x[2], Math.max(0, Math.min(1, x[3] * a)));
  }

  /** @returns {number} relative luminance 0..1 (WCAG), for picking ink or paper text on a fill. */
  function luma(c) {
    var x = parse(c);
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(x[0]) + 0.7152 * ch(x[1]) + 0.0722 * ch(x[2]);
  }

  // ---- strokes and fills --------------------------------------------------------------------------

  /**
   * World stroke width in ctx units for w u at the given zoom, never thinner than minPx device pixels
   * (ART_AUDIO §1.1: world 2 u at zoom 1, scaled with zoom, min 1.5 device px).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w width in u
   * @param {number=} minPx minimum in device pixels (default 1.5)
   * @returns {number}
   */
  function lineWidth(ctx, w, minPx) {
    var t = ctx.getTransform ? ctx.getTransform() : null;
    var sc = t ? Math.sqrt(t.a * t.a + t.b * t.b) : 1;
    var min = (minPx === undefined ? 1.5 : minPx) / (sc || 1);
    return w < min ? min : w;
  }

  /**
   * Strokes the current path in ink (ART_AUDIO §1.1: --ink-900 at 90 %, round joins and caps).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number=} width in ctx units (default 2)
   * @param {{color: string, alpha: number, cap: string}=} opts color: a palette key (default 'inkLine')
   */
  function inkStroke(ctx, width, opts) {
    ctx.lineWidth = width === undefined ? 2 : width;
    ctx.lineJoin = 'round';
    ctx.lineCap = (opts && opts.cap) || 'round';
    ctx.strokeStyle = color((opts && opts.color) || 'inkLine');
    if (opts && opts.alpha !== undefined) {
      var ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * opts.alpha;
      ctx.stroke();
      ctx.globalAlpha = ga;
    } else {
      ctx.stroke();
    }
  }

  /**
   * Fills the current path flat (no gradients on objects, ART_AUDIO §1.1), optionally with paper grain.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} c palette key or colour
   * @param {{grain: number, bounds: number[]}=} opts grain: multiply alpha of the paper grain (0.06
   *   world, 0.04 UI) clipped to the path; bounds [x, y, w, h] limits the grain pass
   */
  function paperFill(ctx, c, opts) {
    ctx.fillStyle = color(c);
    ctx.fill();
    if (opts && opts.grain && SR.art.paper && SR.art.paper.apply) {
      ctx.save();
      ctx.clip();
      var b = opts.bounds || [0, 0, ctx.canvas.width, ctx.canvas.height];
      SR.art.paper.apply(ctx, b[0], b[1], b[2], b[3], opts.grain);
      ctx.restore();
    }
  }

  /** Begins a new path: a rectangle with corner radius r (a number or [tl, tr, br, bl]). */
  function roundRect(ctx, x, y, w, h, r) {
    var tl, tr, br, bl;
    if (Array.isArray(r)) { tl = r[0]; tr = r[1]; br = r[2]; bl = r[3]; } else { tl = tr = br = bl = r || 0; }
    var m = Math.min(Math.abs(w), Math.abs(h)) / 2;
    tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m);
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
    ctx.closePath();
  }

  /**
   * Begins a new path through the points: a flat [x0, y0, x1, y1, ...] list or [[x, y], ...].
   * @param {boolean=} open true leaves the path open (a polyline)
   */
  function poly(ctx, pts, open) {
    ctx.beginPath();
    if (!pts || !pts.length) return;
    if (Array.isArray(pts[0])) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    } else {
      ctx.moveTo(pts[0], pts[1]);
      for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
    }
    if (!open) ctx.closePath();
  }

  /** @returns {string} a CSS font for a role ('display' 900, 'ui', 'news'), size in px and weight. */
  function font(size, weight, role) {
    role = role || 'ui';
    var w = weight || (role === 'display' ? 900 : 400);
    return w + ' ' + Math.round(size * 100) / 100 + 'px ' + (FONTS[role] || FONTS.ui);
  }

  /**
   * Draws text with fillText in the system fonts.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} str already-resolved text (callers pass SR.text(key) output)
   * @param {number} x
   * @param {number} y
   * @param {object=} o size (16), weight, role ('ui' | 'display' | 'news'), color (key, 'ui.ink-900'),
   *   align ('left'), baseline ('alphabetic'), outline (width of an ink outline under the fill),
   *   outlineColor, maxWidth, upper (uppercase; display text defaults to true), tracking (em)
   * @returns {number} the drawn width
   */
  function text(ctx, str, x, y, o) {
    o = o || {};
    var role = o.role || 'ui';
    var s = String(str);
    if (o.upper || (o.upper === undefined && role === 'display')) s = s.toUpperCase();
    ctx.font = font(o.size || 16, o.weight, role);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    var tracking = o.tracking === undefined ? (role === 'display' ? 0.02 : 0) : o.tracking;
    if ('letterSpacing' in ctx) ctx.letterSpacing = tracking ? (tracking * (o.size || 16)) + 'px' : '0px';
    if (o.outline) {
      ctx.lineWidth = o.outline * 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color(o.outlineColor || 'ink');
      if (o.maxWidth) ctx.strokeText(s, x, y, o.maxWidth); else ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color(o.color || 'ui.ink-900');
    if (o.maxWidth) ctx.fillText(s, x, y, o.maxWidth); else ctx.fillText(s, x, y);
    var w = ctx.measureText(s).width;
    if ('letterSpacing' in ctx && tracking) ctx.letterSpacing = '0px';
    return o.maxWidth ? Math.min(w, o.maxWidth) : w;
  }

  /**
   * The stacked-paper shadow (ART_AUDIO §1.1): the shape filled at 18 % ink, offset (+4, +6) u.
   * @param {CanvasRenderingContext2D} ctx
   * @param {function(CanvasRenderingContext2D)|Path2D} shape builds the path (called after the offset
   *   translation), or a Path2D
   * @param {{dx: number, dy: number, scale: number, color: string}=} opts
   */
  function shadow(ctx, shape, opts) {
    var sc = (opts && opts.scale) || 1;
    var dx = (opts && opts.dx !== undefined ? opts.dx : 4) * sc;
    var dy = (opts && opts.dy !== undefined ? opts.dy : 6) * sc;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = color((opts && opts.color) || 'shadow');
    if (typeof shape === 'function') { shape(ctx); ctx.fill(); } else if (shape) ctx.fill(shape);
    ctx.restore();
  }

  /**
   * A rubber stamp (ART_AUDIO §11): display type in a double-outlined rounded rectangle, rotated -8°,
   * ink at 85 % with a grain mask. The DOM Stamp (js/ui/stamp.js) is the in-game one; this is the
   * canvas rendition for the art bible, #fx and sheets.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} str resolved text
   * @param {number} x centre
   * @param {number} y centre
   * @param {{size: number, color: string, scale: number, angle: number, alpha: number}=} o
   */
  // The stamp is inked on its own layer, so the grain mask knocks specks out of the ink only and never
  // punches holes through what lies under the stamp.
  var stampLayer = null;
  function layerCanvas(w, h) {
    if (!stampLayer) {
      if (typeof document !== 'undefined' && document.createElement) stampLayer = document.createElement('canvas');
      else if (typeof OffscreenCanvas === 'function') stampLayer = new OffscreenCanvas(1, 1);
      else return null;
    }
    if (stampLayer.width < w) stampLayer.width = w;
    if (stampLayer.height < h) stampLayer.height = h;
    return stampLayer;
  }
  function stampInk(g, s, w, h, size, c) {
    g.strokeStyle = c;
    g.lineWidth = Math.max(2, size * 0.07);
    roundRect(g, -w / 2, -h / 2, w, h, size * 0.22);
    g.stroke();
    g.lineWidth = Math.max(1, size * 0.03);
    roundRect(g, -w / 2 + size * 0.12, -h / 2 + size * 0.12, w - size * 0.24, h - size * 0.24, size * 0.14);
    g.stroke();
    g.fillStyle = c;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, 0, size * 0.04);
  }
  function stamp(ctx, str, x, y, o) {
    o = o || {};
    var size = o.size || 64;
    var c = color(o.color || 'fx.stampInk');
    var s = String(str).toUpperCase();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.angle === undefined ? -8 * Math.PI / 180 : o.angle);
    if (o.scale) ctx.scale(o.scale, o.scale);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.font = font(size, 900, 'display');
    var w = ctx.measureText(s).width + size * 0.7;
    var h = size * 1.3;
    var pad = Math.max(2, size * 0.07) + 2;
    // device pixels per stamp unit (the layer is drawn back 1:1, so the edges stay crisp)
    var tr = ctx.getTransform ? ctx.getTransform() : null;
    var dev = tr ? Math.max(0.25, Math.sqrt(tr.a * tr.a + tr.b * tr.b)) : 1;
    var lw = Math.ceil((w + pad * 2) * dev), lh = Math.ceil((h + pad * 2) * dev);
    var layer = SR.art.paper && SR.art.paper.pattern ? layerCanvas(lw, lh) : null;
    var g = layer ? layer.getContext('2d') : null;
    if (!g) { stampInk(ctx, s, w, h, size, c); ctx.restore(); return; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, lw, lh);
    g.setTransform(dev, 0, 0, dev, lw / 2, lh / 2);
    g.font = ctx.font;
    stampInk(g, s, w, h, size, c);
    // The grain mask: knock specks out of the ink so it reads as a rubber stamp.
    var pat = SR.art.paper.pattern(g, 'speck');
    if (pat) {
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.35;
      g.fillStyle = pat;
      g.fillRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
    }
    ctx.drawImage(layer, 0, 0, lw, lh, -lw / dev / 2, -lh / dev / 2, lw / dev, lh / dev);
    ctx.restore();
  }

  /**
   * A FloatText (ART_AUDIO §12): display 20 in the stat colour with a 3 u ink outline; rises 40 u over
   * 900 ms (ease-out) and fades out over the last 300 ms.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} str resolved text ('+2 INT')
   * @param {number} x centre at t = 0
   * @param {number} y baseline at t = 0
   * @param {string} c palette key of the stat colour ('ui.int')
   * @param {number=} t seconds since it appeared (0..0.9)
   * @returns {boolean} false once finished
   */
  function floatText(ctx, str, x, y, c, t) {
    t = t || 0;
    var dur = 0.9;
    if (t >= dur) return false;
    var p = t / dur;
    var rise = 40 * (SR.util ? SR.util.easeOut(p) : p);
    var a = t < dur - 0.3 ? 1 : (dur - t) / 0.3;
    var ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * a;
    text(ctx, str, x, y - rise, { size: 20, role: 'display', color: c || 'ui.ink-900', outline: 3, outlineColor: 'fx.floatOutline', align: 'center' });
    ctx.globalAlpha = ga;
    return true;
  }

  SR.art.draw = {
    FONTS: FONTS,
    color: color, parse: parse, hex: hex, tone: tone, mix: mix, alpha: alpha, luma: luma,
    lineWidth: lineWidth, inkStroke: inkStroke, paperFill: paperFill, roundRect: roundRect, poly: poly,
    font: font, text: text, shadow: shadow, stamp: stamp, floatText: floatText,
  };
})();
