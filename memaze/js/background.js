/*
 * Memaze – animated background renderer.
 *
 * MZ.Background draws the animated backdrop that sits behind the maze floor:
 * the configurable "RGB" lighting engine plus a set of unlockable patterns,
 * every one of them tinted by the RGB engine.
 *
 * Classic script (no modules) so the game runs from file://. Canvas 2D only.
 * Per-pixel work (plasma) happens in a tiny offscreen buffer that is scaled up;
 * everything else is a handful of path fills / gradients per frame.
 *
 *   MZ.Background.PATTERNS            [{id, name, desc}]
 *   MZ.Background.DEFAULT_RGB         default RGB config
 *   MZ.Background.create(canvas)      -> renderer {setConfig, resize, render, colors}
 *   MZ.Background.thumb(id, canvas, rgbCfg, timeSec)
 *   MZ.Background.color(rgbCfg, timeSec, offsetDeg) -> CSS colour
 */
(function () {
  'use strict';

  const MZ = (window.MZ = window.MZ || {});

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const PARALLAX = 0.08; // fraction of camera travel applied to tiling patterns
  const REF_DIAG = Math.hypot(1920, 1080); // feature sizes are tuned for this diagonal

  const PATTERNS = [
    { id: 'rgb', name: 'RGB Flow', desc: 'Your RGB lighting, pure and simple.' },
    { id: 'stripes', name: 'Candy Stripes', desc: 'Glossy diagonal candy bands sliding by.' },
    { id: 'checker', name: 'Checkerboard', desc: 'A slowly turning checkerboard void.' },
    { id: 'dots', name: 'Polka', desc: 'A grid of bobbing polka dots.' },
    { id: 'waves', name: 'Waves', desc: 'Layered sine waves drifting past.' },
    { id: 'stars', name: 'Warp', desc: 'A starfield rushing toward you.' },
    { id: 'tunnel', name: 'Tunnel', desc: 'A twisting tunnel of rings pulling you in.' },
    { id: 'synth', name: 'Synthwave', desc: 'Neon grid, striped sun, endless horizon.' },
    { id: 'plasma', name: 'Plasma', desc: 'Old-school demoscene plasma.' },
    { id: 'kaleido', name: 'Kaleido', desc: 'Mirrored shapes turning in a kaleidoscope.' },
    { id: 'matrix', name: 'Code Rain', desc: 'Falling columns of glowing glyphs.' },
    { id: 'hypno', name: 'Hypno', desc: 'A slowly turning hypnotic spiral.' },
  ];

  const DEFAULT_RGB = {
    style: 'gradient',
    speed: 6,
    sat: 85,
    light: 55,
    hueFrom: 0,
    hueTo: 360,
    spread: 140,
    angle: 135,
    spin: true,
    pulse: 0.15,
    usePalette: false,
    palette: ['#ff0080', '#7928ca', '#00d4ff'],
  };
  // Private copy so outside code mutating DEFAULT_RGB can't break fallbacks.
  const DEF = JSON.parse(JSON.stringify(DEFAULT_RGB));

  const STYLES = { cycle: 1, gradient: 1, radial: 1, aurora: 1 };
  const PATTERN_IDS = {};
  PATTERNS.forEach(function (p) { PATTERN_IDS[p.id] = 1; });

  // ------------------------------------------------------------------ helpers
  function num(v, d) {
    if (typeof v === 'string') v = parseFloat(v);
    return typeof v === 'number' && isFinite(v) ? v : d;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function frac(x) { return x - Math.floor(x); }
  function mod(x, m) { x %= m; return x < 0 ? x + m : x; }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function smooth(f) { return f * f * (3 - 2 * f); }
  // Deterministic 2-int hash -> [0,1)
  function hash(a, b) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function byte(x) { return x > 255 ? 255 : x < 0 ? 0 : (x + 0.5) | 0; }
  // CSS string from a 0..255 rgb triple, scaled by k (brightness) with optional alpha.
  function css(c, k, a) {
    if (k === undefined) k = 1;
    const r = byte(c[0] * k), g = byte(c[1] * k), b = byte(c[2] * k);
    if (a === undefined || a >= 1) return 'rgb(' + r + ',' + g + ',' + b + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a > 0 ? Math.round(a * 1000) / 1000 : 0) + ')';
  }
  // Mix c toward white by f (in place).
  function lighten(c, f) {
    c[0] += (255 - c[0]) * f; c[1] += (255 - c[1]) * f; c[2] += (255 - c[2]) * f;
    return c;
  }
  // out = a*(1-f) + b*f
  function mixInto(out, a, b, f) {
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return c;
  }

  // --------------------------------------------------------- colour spaces
  function hsl(h, s, l, out) {
    h = mod(h, 360) / 60;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    switch (h | 0) {
      case 0: r = c; g = x; break;
      case 1: r = x; g = c; break;
      case 2: g = c; b = x; break;
      case 3: g = x; b = c; break;
      case 4: r = x; b = c; break;
      default: r = c; b = x;
    }
    out[0] = (r + m) * 255; out[1] = (g + m) * 255; out[2] = (b + m) * 255;
    return out;
  }
  function parseHex(s) {
    if (typeof s !== 'string') return null;
    let m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = /^#?([0-9a-f]{3})$/i.exec(s.trim());
    if (m) {
      const t = m[1];
      return [parseInt(t[0] + t[0], 16), parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16)];
    }
    return null;
  }
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
    return clamp(c * 255, 0, 255);
  }
  function toOklab(rgb) {
    const r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function fromOklab(L, A, B, out) {
    let l = L + 0.3963377774 * A + 0.2158037573 * B;
    let m = L - 0.1055613458 * A - 0.0638541728 * B;
    let s = L - 0.0894841775 * A - 1.291485548 * B;
    l = l * l * l; m = m * m * m; s = s * s * s;
    out[0] = fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    out[1] = fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    out[2] = fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    return out;
  }

  // Palette loop -> 256-entry RGB lookup (cached per palette). Mixing happens in
  // OKLCh (perceptual lightness/chroma, shortest hue arc) so that e.g. pink -> cyan
  // passes through violet instead of greying out.
  const PAL_N = 256;
  const palCache = new Map();
  function paletteLUT(list) {
    const key = list.join(',');
    let lut = palCache.get(key);
    if (lut) return lut;
    const lch = list.map(function (hx) {
      const l = toOklab(parseHex(hx));
      return [l[0], Math.hypot(l[1], l[2]), Math.atan2(l[2], l[1])];
    });
    const n = lch.length;
    const tmp = [0, 0, 0];
    lut = new Float32Array(PAL_N * 3);
    for (let i = 0; i < PAL_N; i++) {
      const x = (i / PAL_N) * n;
      const a = Math.floor(x);
      let f = x - a;
      f = f + (smooth(f) - f) * 0.6; // linger a little on the palette's own colours
      const A = lch[a % n], B = lch[(a + 1) % n];
      // greys have no meaningful hue: borrow the other end's
      const ha = A[1] < 0.02 ? B[2] : A[2], hb = B[1] < 0.02 ? A[2] : B[2];
      let dh = hb - ha;
      if (dh > Math.PI) dh -= TAU; else if (dh < -Math.PI) dh += TAU;
      const L = lerp(A[0], B[0], f), C = lerp(A[1], B[1], f), H = ha + dh * f;
      fromOklab(L, C * Math.cos(H), C * Math.sin(H), tmp);
      lut[i * 3] = tmp[0]; lut[i * 3 + 1] = tmp[1]; lut[i * 3 + 2] = tmp[2];
    }
    if (palCache.size > 32) palCache.clear();
    palCache.set(key, lut);
    return lut;
  }
  function samplePal(lut, u, out) {
    const x = frac(u) * PAL_N;
    const i = x | 0, f = x - i;
    const a = i * 3, b = ((i + 1) % PAL_N) * 3;
    out[0] = lut[a] + (lut[b] - lut[a]) * f;
    out[1] = lut[a + 1] + (lut[b + 1] - lut[a + 1]) * f;
    out[2] = lut[a + 2] + (lut[b + 2] - lut[a + 2]) * f;
    return out;
  }

  // ------------------------------------------------------------ RGB engine
  // Normalise a (possibly partial / out-of-range) RGB config into an engine.
  function buildEngine(c) {
    c = c && typeof c === 'object' ? c : {};
    const e = {};
    e.style = STYLES[c.style] ? c.style : DEF.style;
    e.speed = clamp(num(c.speed, DEF.speed), 0, 60);
    e.s = clamp(num(c.sat, DEF.sat), 0, 100) / 100;
    e.l = clamp(num(c.light, DEF.light), 0, 100) / 100;
    const hf = num(c.hueFrom, DEF.hueFrom), ht = num(c.hueTo, DEF.hueTo);
    const span = ht - hf, wspan = mod(span, 360);
    e.from = mod(hf, 360);
    e.full = Math.abs(span) >= 360 || wspan < 0.5 || wspan > 359.5;
    e.width = e.full ? 360 : wspan; // hueTo < hueFrom wraps through 360
    e.spread = clamp(num(c.spread, DEF.spread), 0, 720);
    e.angle = num(c.angle, DEF.angle);
    e.spin = c.spin === undefined ? DEF.spin : !!c.spin;
    e.pulse = clamp(num(c.pulse, DEF.pulse), 0, 1);
    e.pal = null;
    if (c.usePalette) {
      let list = (Array.isArray(c.palette) ? c.palette : [])
        .map(function (p) { const v = parseHex(p); return v ? '#' + ((1 << 24) | (v[0] << 16) | (v[1] << 8) | v[2]).toString(16).slice(1) : null; })
        .filter(Boolean)
        .slice(0, 8);
      if (list.length === 0) list = DEF.palette.slice();
      if (list.length === 1) list = [list[0], list[0]];
      e.pal = paletteLUT(list);
    }
    return e;
  }

  // Colour of engine e at time t (s) and hue offset off (deg), into out (0..255).
  function engRGB(e, t, off, out) {
    const u = (t * e.speed) / 60 + off / 360;
    if (e.pal) samplePal(e.pal, u, out);
    else if (e.full) hsl(e.from + u * 360, e.s, e.l, out);
    // restricted range: smooth ping-pong (cosine-eased triangle) so there is never a jump
    else hsl(e.from + e.width * (0.5 - 0.5 * Math.cos(u * TAU)), e.s, e.l, out);
    if (e.pulse > 0) {
      const k = 1 + e.pulse * 0.22 * Math.sin((t * TAU) / 6);
      out[0] *= k; out[1] *= k; out[2] *= k;
    }
    return out;
  }

  // Small cache for MZ.Background.color() callers that pass the same config every frame.
  const ENG_FIELDS = ['style', 'speed', 'sat', 'light', 'hueFrom', 'hueTo', 'spread', 'angle', 'spin', 'pulse', 'usePalette'];
  const engCache = [];
  function engineFor(cfg) {
    for (let i = 0; i < engCache.length; i++) {
      const ent = engCache[i];
      if (ent.src !== cfg) continue;
      let same = true;
      if (cfg && typeof cfg === 'object') {
        for (let j = 0; j < ENG_FIELDS.length && same; j++) if (ent.snap[j] !== cfg[ENG_FIELDS[j]]) same = false;
        const p = cfg.palette, q = ent.pal;
        if (same && (Array.isArray(p) ? !q || p.length !== q.length || p.some(function (v, k) { return v !== q[k]; }) : q)) same = false;
      }
      if (same) return ent.eng;
      engCache.splice(i, 1);
      break;
    }
    const isObj = cfg && typeof cfg === 'object';
    const ent = {
      src: cfg,
      snap: isObj ? ENG_FIELDS.map(function (f) { return cfg[f]; }) : [],
      pal: isObj && Array.isArray(cfg.palette) ? cfg.palette.slice() : null,
      eng: buildEngine(cfg),
    };
    engCache.unshift(ent);
    if (engCache.length > 6) engCache.pop();
    return ent.eng;
  }

  const TMP = [0, 0, 0];
  function color(rgbCfg, timeSec, offsetDeg) {
    const e = engineFor(rgbCfg);
    return css(engRGB(e, num(timeSec, 0), num(offsetDeg, 0), TMP));
  }

  // ------------------------------------------------------ renderer helpers
  function rgbAt(R, off) { return engRGB(R.eng, R.t, off, [0, 0, 0]); }
  function cssAt(R, off, k, a) { return css(engRGB(R.eng, R.t, off, TMP), k, a); }
  function cacheFor(R, key, build) {
    let c = R.caches[key];
    if (!c || c._w !== R.w || c._h !== R.h || c._u !== R.u) {
      c = build(R, c) || {};
      c._w = R.w; c._h = R.h; c._u = R.u;
      R.caches[key] = c;
    }
    return c;
  }

  // Edge darkening, baked once per size into an offscreen canvas: an unscaled
  // drawImage is far cheaper than re-filling a radial gradient every frame.
  function vignette(R, a) {
    const c = cacheFor(R, 'vig', function (R, old) {
      const sc = R.w * R.h > 2.3e6 ? 0.5 : 1; // very large screens: half-res, scaled up
      const w = Math.max(1, Math.round(R.w * sc)), h = Math.max(1, Math.round(R.h * sc));
      const cv = old && old.cv ? old.cv : makeCanvas(w, h);
      cv.width = w; cv.height = h;
      const x = cv.getContext('2d');
      const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.hypot(w, h) * 0.56);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      return { cv: cv, full: sc === 1 };
    });
    const ctx = R.ctx;
    ctx.globalAlpha = a;
    if (c.full) ctx.drawImage(c.cv, 0, 0);
    else ctx.drawImage(c.cv, 0, 0, R.w, R.h);
    ctx.globalAlpha = 1;
  }

  // Vertical gradients are painted into a 1px-wide column and stretched across the
  // screen: much cheaper than a full-width gradient fill on software rasterisers.
  function column(R) {
    return cacheFor(R, 'col', function (R, old) {
      const cv = old && old.cv ? old.cv : makeCanvas(1, R.h);
      cv.width = 1; cv.height = Math.max(1, R.h);
      return { cv: cv, x: cv.getContext('2d') };
    });
  }
  function vgrad(R, y0, y1) { return column(R).x.createLinearGradient(0, y0, 0, y1); }
  function vpaint(R, style, y0, y1) {
    const c = column(R);
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(R.h, Math.ceil(y1));
    if (y1 <= y0) return;
    c.x.clearRect(0, y0, 1, y1 - y0);
    c.x.fillStyle = style;
    c.x.fillRect(0, y0, 1, y1 - y0);
    R.ctx.drawImage(c.cv, 0, y0, 1, y1 - y0, 0, y0, R.w, y1 - y0);
  }
  // Radial glow limited to its bounding box.
  function glow(R, x, y, r, c, k, a) {
    const ctx = R.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(c, k, a));
    g.addColorStop(0.5, css(c, k, a * 0.35));
    g.addColorStop(1, css(c, k, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  // Paints the configured RGB style over the whole canvas at brightness k.
  function drawStyle(R, k) {
    const ctx = R.ctx, w = R.w, h = R.h, e = R.eng, t = R.t;
    if (e.style === 'cycle') {
      ctx.fillStyle = cssAt(R, 0, k);
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (e.style === 'aurora') { drawAurora(R, k); return; }
    const sp = e.spread;
    const n = Math.min(13, Math.max(3, Math.ceil(sp / 28) + 2));
    let g;
    if (e.style === 'radial') {
      const rad = Math.hypot(w, h) * 0.5 * (1 + 0.07 * Math.sin((t * TAU) / 7));
      g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, rad);
    } else {
      const a = (e.angle + (e.spin ? t * 3 : 0)) * DEG; // spin: one turn per 2 minutes
      const dx = Math.cos(a), dy = Math.sin(a);
      const L = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      g = ctx.createLinearGradient(w / 2 - dx * L, h / 2 - dy * L, w / 2 + dx * L, h / 2 + dy * L);
    }
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      g.addColorStop(s, cssAt(R, -s * sp, k));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Aurora: soft coloured blobs over a dark base, drawn in a tiny buffer and upscaled.
  function drawAurora(R, k) {
    const c = cacheFor(R, 'aurora', function (R, old) {
      const bw = Math.min(128, Math.max(8, Math.ceil(R.w / 6)));
      const bh = Math.max(8, Math.round((bw * R.h) / Math.max(1, R.w)));
      const cv = old && old.cv ? old.cv : makeCanvas(bw, bh);
      cv.width = bw; cv.height = bh;
      return { cv: cv, x: cv.getContext('2d'), bw: bw, bh: bh };
    });
    const x = c.x, bw = c.bw, bh = c.bh, t = R.t, sp = R.eng.spread;
    x.globalCompositeOperation = 'source-over';
    const base = x.createLinearGradient(0, 0, bw * 0.3, bh);
    base.addColorStop(0, cssAt(R, sp, 0.1 * k));
    base.addColorStop(1, cssAt(R, sp * 0.5, 0.2 * k));
    x.fillStyle = base;
    x.fillRect(0, 0, bw, bh);
    const D = Math.max(bw, bh);
    for (let j = 0; j < 5; j++) {
      const px = bw * (0.5 + 0.42 * Math.sin(t * (0.061 + j * 0.017) + j * 2.1));
      const py = bh * (0.5 + 0.38 * Math.sin(t * (0.047 + j * 0.013) + j * 1.37 + 1));
      const r = D * (0.32 + 0.08 * Math.sin(t * 0.1 + j * 1.9));
      const off = (j * sp) / 4;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, cssAt(R, off, 0.95 * k, 0.85));
      g.addColorStop(0.45, cssAt(R, off, 0.85 * k, 0.42));
      g.addColorStop(1, cssAt(R, off, 0.8 * k, 0));
      x.fillStyle = g;
      x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
    R.ctx.drawImage(c.cv, 0, 0, bw, bh, 0, 0, R.w, R.h);
  }

  // =============================================================== patterns
  const P = {};

  // ---- RGB Flow: just the configured style
  P.rgb = function (R) {
    drawStyle(R, 1);
    vignette(R, 0.7);
  };

  // ---- Candy Stripes: glossy diagonal bands sliding sideways
  P.stripes = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, u = R.u, sp = R.eng.spread;
    const ang = -0.62;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bw = Math.max(4, 76 * u);
    const D = Math.hypot(w, h) / 2 + 2 * bw;
    const slide = R.t * 24 * u + (R.ox * ca + R.oy * sa);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(ang);
    const i0 = Math.floor((-D - slide) / bw), i1 = Math.ceil((D - slide) / bw);
    const step = sp / 9;
    const col = [0, 0, 0];
    for (let i = i0; i <= i1; i++) {
      const x = i * bw + slide;
      engRGB(R.eng, R.t, Math.floor(i / 2) * step * 2, col);
      if (i & 1) lighten(col, 0.4); // pastel partner band
      ctx.fillStyle = css(col, (i & 1) ? 0.86 : 0.9);
      ctx.fillRect(x - 0.5, -D, bw + 1, 2 * D);
    }
    // gloss on the leading edge, shade on the trailing edge (solid strips: cheap)
    ctx.fillStyle = 'rgba(255,255,255,0.11)';
    for (let i = i0; i <= i1; i++) ctx.fillRect(i * bw + slide, -D, 0.1 * bw, 2 * D);
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (let i = i0; i <= i1; i++) ctx.fillRect(i * bw + slide + 0.84 * bw, -D, 0.16 * bw, 2 * D);
    ctx.restore();
    vignette(R, 0.75);
  };

  // ---- Checkerboard: two slowly counter-rotating checker layers over the RGB style
  function checkerLayer(R, cs, rot, sx, sy, par, style) {
    const ctx = R.ctx;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // screen-space parallax -> layer-local offset
    const px = (R.ox * cr + R.oy * sr) * par, py = (-R.ox * sr + R.oy * cr) * par;
    const offX = mod(sx + px, 2 * cs), offY = mod(sy + py, 2 * cs);
    const D = Math.hypot(R.w, R.h) / 2;
    const n = Math.ceil(D / cs) + 2;
    ctx.save();
    ctx.translate(R.w / 2, R.h / 2);
    ctx.rotate(rot);
    // individual convex fills rasterise much faster than one huge compound path
    ctx.fillStyle = style;
    for (let j = -n - 2; j <= n; j++) {
      for (let i = -n - 2; i <= n; i++) {
        if (((i + j) & 1) === 0) ctx.fillRect(i * cs + offX, j * cs + offY, cs, cs);
      }
    }
    ctx.restore();
  }
  P.checker = function (R) {
    drawStyle(R, 0.9);
    const t = R.t, u = R.u;
    checkerLayer(R, 64 * u, 0.5 - t * 0.021, t * 9 * u, t * 5 * u, 0.45, 'rgba(0,0,0,0.14)');
    checkerLayer(R, 118 * u, t * 0.034, t * 21 * u, t * 12 * u, 1, 'rgba(0,0,0,0.3)');
    vignette(R, 0.9);
  };

  // ---- Polka: hex grid of glossy bobbing dots
  P.dots = function (R) {
    drawStyle(R, 0.4);
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, u = R.u, sp = R.eng.spread;
    const gap = Math.max(8, 96 * u), rowH = gap * 0.866, rb = gap * 0.3;
    const K = 6;
    const c = cacheFor(R, 'dots', function () {
      const cols = Math.ceil(w / gap) + 4, rows = Math.ceil(h / rowH) + 4;
      return { buf: new Float32Array(cols * rows * 4 + 16), max: cols * rows };
    });
    const buf = c.buf;
    const ox = R.ox, oy = R.oy;
    const j0 = Math.floor((-oy - gap) / rowH), j1 = Math.ceil((h - oy + gap) / rowH);
    let n = 0;
    for (let j = j0; j <= j1 && n < c.max; j++) {
      const rowOff = (j & 1) ? gap / 2 : 0;
      const i0 = Math.floor((-ox - rowOff - gap) / gap), i1 = Math.ceil((w - ox - rowOff + gap) / gap);
      for (let i = i0; i <= i1 && n < c.max; i++) {
        const k = n * 4;
        buf[k] = i * gap + rowOff + ox;
        buf[k + 1] = j * rowH + oy + Math.sin(t * 1.25 + i * 0.55 + j * 0.9) * gap * 0.09;
        buf[k + 2] = rb * (0.78 + 0.22 * Math.sin(t * 1.6 + i * 0.47 - j * 0.73));
        buf[k + 3] = mod(i * 2 + j, K);
        n++;
      }
    }
    // dots, one path per colour group
    for (let g = 0; g < K; g++) {
      ctx.fillStyle = cssAt(R, (g / (K - 1)) * sp, 1.02);
      for (let q = 0; q < n; q++) {
        const k = q * 4;
        if (buf[k + 3] !== g) continue;
        ctx.beginPath();
        ctx.arc(buf[k], buf[k + 1], buf[k + 2], 0, TAU);
        ctx.fill();
      }
    }
    // specular highlights
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let q = 0; q < n; q++) {
      const k = q * 4, r = buf[k + 2];
      ctx.beginPath();
      ctx.arc(buf[k] - r * 0.32, buf[k + 1] - r * 0.34, r * 0.3, 0, TAU);
      ctx.fill();
    }
    vignette(R, 0.7);
  };

  // ---- Waves: layered sine bands, darker at the back
  P.waves = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, u = R.u, sp = R.eng.spread;
    const LAYERS = 7;
    const layerBase = function (l) {
      const f = l / (LAYERS - 1);
      return h * (0.2 + 0.72 * f) + R.oy * (0.15 + 0.25 * f);
    };
    const layerAmp = function (l) { return h * (0.035 + 0.02 * (l / (LAYERS - 1))) + 6 * u; };
    const skyEnd = layerBase(0) + layerAmp(0) * 1.4 + 2;
    const sky = vgrad(R, 0, skyEnd);
    sky.addColorStop(0, cssAt(R, sp * 1.1, 0.15));
    sky.addColorStop(1, cssAt(R, sp * 0.95, 0.38));
    vpaint(R, sky, 0, skyEnd);
    const steps = Math.max(16, Math.min(64, Math.ceil(w / (28 * Math.max(u, 0.3)))));
    const dx = w / steps;
    const col = [0, 0, 0];
    ctx.lineJoin = 'round';
    for (let l = 0; l < LAYERS; l++) {
      const f = l / (LAYERS - 1);
      const base = layerBase(l);
      const amp = layerAmp(l);
      // everything below the next layer's lowest point gets painted over anyway
      const bottom = l === LAYERS - 1 ? h + 4 : Math.min(h + 4, layerBase(l + 1) + layerAmp(l + 1) * 1.4 + 2);
      const lam = (620 - 180 * f) * u + 40;
      const ph = t * (0.32 + 0.22 * f) + l * 1.7 + (R.ox * (0.4 + 0.6 * f) * TAU) / lam;
      const k1 = TAU / lam, k2 = TAU / (lam * 0.43);
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const x = s * dx;
        const y = base + amp * Math.sin(x * k1 + ph) + amp * 0.32 * Math.sin(x * k2 - ph * 1.37 + l);
        if (s === 0) ctx.moveTo(x - 2, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(w + 2, bottom);
      ctx.lineTo(-2, bottom);
      ctx.closePath();
      engRGB(R.eng, t, sp * (1 - f), col);
      const kb = 0.36 + 0.58 * f;
      ctx.fillStyle = css(col, kb);
      ctx.fill();
      ctx.strokeStyle = css(lighten(col, 0.35), kb, 0.35);
      ctx.lineWidth = Math.max(1, 2.2 * u);
      ctx.stroke();
    }
    vignette(R, 0.6);
  };

  // ---- Warp: stars streaking toward the viewer (deterministic in time)
  const STAR_DEPTH = [
    // [zMin, alpha, width]
    [0.8, 0.28, 0.9],
    [0.55, 0.55, 1.3],
    [0.3, 0.82, 1.9],
    [0, 1, 2.8],
  ];
  P.stars = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, u = R.u, sp = R.eng.spread;
    const c = cacheFor(R, 'stars', function (R) {
      const n = R.thumb ? 110 : 280;
      return { n: n, buf: new Float32Array(n * 5) };
    });
    const cx = w / 2, cy = h / 2;
    // background: deep space with a nebula glow at the vanishing point
    const col = [0, 0, 0];
    ctx.fillStyle = cssAt(R, sp * 0.25, 0.07);
    ctx.fillRect(0, 0, w, h);
    engRGB(R.eng, t, sp * 0.5, col);
    glow(R, cx, cy, Math.min(w, h) * 0.62, col, 0.42, 0.9);
    // drifting dust (tiles, so it follows the parallax)
    const cell = Math.max(10, 70 * u);
    const dox = R.ox * 0.5 + t * 3 * u, doy = R.oy * 0.5;
    const ci0 = Math.floor(-dox / cell) - 1, ci1 = Math.ceil((w - dox) / cell);
    const cj0 = Math.floor(-doy / cell) - 1, cj1 = Math.ceil((h - doy) / cell);
    ctx.beginPath();
    const ds = Math.max(1, 2.2 * u);
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        if (hash(i, j) > 0.55) continue;
        ctx.rect(i * cell + dox + hash(i + 7, j) * cell, j * cell + doy + hash(i, j + 7) * cell, ds, ds);
      }
    }
    ctx.fillStyle = css(lighten(engRGB(R.eng, t, sp * 0.75, col), 0.3), 1, 0.5);
    ctx.fill();
    // warp streaks
    const buf = c.buf, n = c.n;
    const f = Math.hypot(w, h) * 0.13;
    const asp = w / Math.max(1, h);
    const ax = Math.sqrt(asp), ay = 1 / Math.sqrt(asp);
    for (let s = 0; s < n; s++) {
      const v = 0.07 + 0.06 * hash(s, 1);
      const p = hash(s, 2) + t * v;
      const cyc = Math.floor(p);
      const z = 1 - (p - cyc);
      let x = (hash(s, cyc * 3 + 11) * 2 - 1) * 1.6 * ax;
      let y = (hash(s, cyc * 3 + 12) * 2 - 1) * 1.6 * ay;
      const m = Math.abs(x) + Math.abs(y);
      if (m < 0.12) { x += x >= 0 ? 0.12 : -0.12; y += y >= 0 ? 0.08 : -0.08; }
      const zz = Math.max(z, 0.015);
      const zt = Math.min(1.05, zz + 0.03 + v * 0.35);
      const k = s * 5;
      buf[k] = cx + (x / zz) * f;
      buf[k + 1] = cy + (y / zz) * f;
      buf[k + 2] = cx + (x / zt) * f;
      buf[k + 3] = cy + (y / zt) * f;
      let b = 0;
      while (b < 3 && z < STAR_DEPTH[b][0]) b++;
      buf[k + 4] = b * 8 + (s % 6);
    }
    ctx.lineCap = 'round';
    for (let b = 0; b < 4; b++) {
      ctx.lineWidth = Math.max(0.8, STAR_DEPTH[b][2] * u);
      for (let g = 0; g < 6; g++) {
        const key = b * 8 + g;
        ctx.beginPath();
        let any = false;
        for (let s = 0; s < n; s++) {
          const k = s * 5;
          if (buf[k + 4] !== key) continue;
          const x0 = buf[k], y0 = buf[k + 1];
          if (x0 < -50 && buf[k + 2] < -50) continue;
          if (x0 > w + 50 && buf[k + 2] > w + 50) continue;
          if (y0 < -50 && buf[k + 3] < -50) continue;
          if (y0 > h + 50 && buf[k + 3] > h + 50) continue;
          ctx.moveTo(buf[k + 2], buf[k + 3]);
          ctx.lineTo(x0, y0);
          any = true;
        }
        if (!any) continue;
        engRGB(R.eng, t, (g / 5) * sp, col);
        lighten(col, 0.4);
        ctx.strokeStyle = css(col, 1, STAR_DEPTH[b][1]);
        ctx.stroke();
      }
    }
    // warp core glow
    engRGB(R.eng, t, sp * 0.5, col);
    glow(R, cx, cy, Math.min(w, h) * 0.3, lighten(col, 0.2), 1, 0.32);
    vignette(R, 0.6);
  };

  // ---- Tunnel: twisting square rings rushing out of a dark vanishing point
  P.tunnel = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, sp = R.eng.spread;
    const s = t * 0.9; // camera depth (rings / second)
    const zN = 3, zF = 64;
    const half = Math.hypot(w, h) / 2;
    const F = half * zN * 1.02;
    const kMin = Math.ceil(s + zN), kMax = Math.floor(s + zF);
    const dark = rgbAt(R, sp * 0.5);
    dark[0] *= 0.06; dark[1] *= 0.06; dark[2] *= 0.06;
    const col = [0, 0, 0], out = [0, 0, 0];
    const step = sp / 12;
    function ringStyle(k, z) {
      engRGB(R.eng, t, Math.floor(k / 2) * step * 2, col);
      const band = (k & 1) ? 0.42 : 0.95;
      col[0] *= band; col[1] *= band; col[2] *= band;
      const fog = Math.pow(clamp((z - zN) / (zF - zN), 0, 1), 0.6);
      return css(mixInto(out, col, dark, fog));
    }
    const wob = 0.035 * Math.min(w, h);
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = ringStyle(kMin - 1, zN);
    ctx.fillRect(0, 0, w, h);
    let x = cx, y = cy;
    for (let k = kMin; k <= kMax; k++) {
      const z = k - s;
      const rad = (F / z) * Math.SQRT2;
      const rot = k * 0.075 + t * 0.08;
      const bend = Math.pow((z - zN) / (zF - zN), 1.3);
      x = cx + Math.sin(k * 0.05 + t * 0.13) * wob * bend * 2.2;
      y = cy + Math.cos(k * 0.04 + t * 0.1) * wob * bend * 1.6;
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const a = rot + q * (Math.PI / 2);
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (q === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = ringStyle(k, z);
      ctx.fill();
    }
    // faint glow deep inside
    engRGB(R.eng, t, 0, col);
    glow(R, x, y, Math.min(w, h) * 0.22, col, 0.9, 0.45);
    vignette(R, 0.55);
  };

  // ---- Synthwave: striped sun, mountains, scrolling neon grid
  function buildSynth() {
    const MT = 64;
    const mts = new Float32Array(MT);
    for (let i = 0; i < MT; i++) {
      // layered periodic noise, peaky
      const a = hash(i, 91), b = hash(i >> 1, 92), cc = hash(i >> 2, 93);
      mts[i] = 0.2 + 0.45 * a * a + 0.25 * b + 0.3 * cc;
    }
    const stars = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) {
      stars[i * 3] = hash(i, 71);
      stars[i * 3 + 1] = Math.pow(hash(i, 72), 1.6);
      stars[i * 3 + 2] = hash(i, 73);
    }
    return { mts: mts, MT: MT, stars: stars };
  }
  P.synth = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, u = R.u, sp = R.eng.spread;
    const c = cacheFor(R, 'synth', buildSynth);
    const hy = Math.round(h * 0.6);
    const A = rgbAt(R, 0), B = rgbAt(R, sp * 0.5), C = rgbAt(R, sp);
    const tmp = [0, 0, 0];
    // sky + floor gradients share one 1px column, stretched across in a single draw
    const colm = column(R);
    const cx2 = colm.x;
    const sky = cx2.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, css(C, 0.1));
    sky.addColorStop(0.55, css(mixInto(tmp, C, B, 0.5), 0.3));
    sky.addColorStop(1, css(B, 0.72));
    cx2.fillStyle = sky;
    cx2.fillRect(0, 0, 1, hy);
    const fl = cx2.createLinearGradient(0, hy, 0, h);
    fl.addColorStop(0, css(mixInto(tmp, B, C, 0.5), 0.34));
    fl.addColorStop(0.3, css(C, 0.13));
    fl.addColorStop(1, css(C, 0.07));
    cx2.fillStyle = fl;
    cx2.fillRect(0, hy, 1, h - hy);
    ctx.drawImage(colm.cv, 0, 0, 1, h, 0, 0, w, h);
    // stars
    ctx.beginPath();
    const ss = Math.max(1, 1.8 * u);
    for (let i = 0; i < 60; i++) {
      const sx = mod(c.stars[i * 3] * w + R.ox * 0.1, w);
      const sy = c.stars[i * 3 + 1] * hy * 0.6;
      ctx.rect(sx, sy, ss, ss);
    }
    ctx.fillStyle = css(lighten(mixInto(tmp, A, C, 0.5), 0.5), 1, 0.5);
    ctx.fill();
    // sun glow + sun
    const sr = Math.min(w * 0.3, h * 0.26);
    const scx = w / 2, scy = hy - sr * 0.42;
    const gr = sr * 2;
    const sg = ctx.createRadialGradient(scx, scy, sr * 0.6, scx, scy, gr);
    sg.addColorStop(0, css(A, 1, 0.38));
    sg.addColorStop(0.45, css(A, 1, 0.12));
    sg.addColorStop(1, css(A, 1, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(scx - gr, scy - gr, gr * 2, hy - (scy - gr));
    ctx.save();
    ctx.beginPath();
    ctx.arc(scx, scy, sr, 0, TAU);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, scy - sr, 0, scy + sr);
    sun.addColorStop(0, css(lighten(A.slice(), 0.35), 1));
    sun.addColorStop(0.55, css(mixInto(tmp, A, B, 0.6), 1));
    sun.addColorStop(1, css(B, 0.95));
    ctx.fillStyle = sun;
    ctx.fillRect(scx - sr, scy - sr, sr * 2, Math.min(sr * 2, hy - (scy - sr)));
    // stripe cut-outs: copies of the sky column, so they read as gaps
    const p = sr * 0.16;
    const top = scy - sr * 0.3, bot = hy;
    const o = frac(t * 0.3) * p;
    for (let y = top + o - p; y < bot; y += p) {
      const f = clamp((y - top) / (bot - top), 0, 1);
      const y0 = Math.max(y, top, 0), y1 = Math.min(y + p * (0.06 + 0.62 * f), hy);
      if (y1 - y0 > 0.2) ctx.drawImage(colm.cv, 0, y0, 1, y1 - y0, scx - sr, y0, sr * 2, y1 - y0);
    }
    ctx.restore();
    // mountains
    const MT = c.MT, mts = c.mts;
    const mw = w * 1.2; // one loop of the ridge
    const moff = R.ox * 0.2 + t * 4 * u;
    const mh = h * 0.1;
    ctx.beginPath();
    ctx.moveTo(-2, hy + 1);
    const msteps = 96;
    for (let i = 0; i <= msteps; i++) {
      const x = (i / msteps) * w;
      const q = mod((x - moff) / mw, 1) * MT;
      const a = Math.floor(q), f = q - a;
      const v = lerp(mts[a % MT], mts[(a + 1) % MT], f);
      const edge = 1 - Math.pow(Math.abs(x / w - 0.5) * 2, 3) * 0.1;
      const cen = 0.45 + 0.55 * Math.min(1, Math.abs(x - scx) / (sr * 1.4));
      ctx.lineTo(x, hy - v * mh * edge * cen);
    }
    ctx.lineTo(w + 2, hy + 1);
    ctx.closePath();
    const mg = ctx.createLinearGradient(0, hy - mh, 0, hy);
    mg.addColorStop(0, css(mixInto(tmp, C, B, 0.3), 0.3));
    mg.addColorStop(1, css(C, 0.12));
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = css(lighten(B.slice(), 0.2), 1, 0.55);
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();
    // grid: horizontal lines as axis-aligned rects, converging lines as solid strokes,
    // then a fog band (column-painted) fades both toward the horizon
    const K = h - hy;
    const gs = w / 9;
    const xo = mod(R.ox, gs) / gs;
    const zf = 36;
    const gc = lighten(C.slice(), 0.25);
    const lw = Math.max(1, 1.6 * u), gw = Math.max(2, 6 * u);
    const s = t * 1.1;
    ctx.fillStyle = css(gc, 1, 0.9);
    for (let i = 1; i <= zf; i++) {
      const y = hy + K / (i - frac(s));
      if (y > h + 2) continue;
      ctx.fillRect(0, y - lw / 2, w, lw);
    }
    ctx.beginPath();
    for (let i = -26; i <= 26; i++) {
      const X = i + xo;
      ctx.moveTo(scx + (X * gs) / zf, hy + K / zf);
      ctx.lineTo(scx + X * gs * 1.02, h + K * 0.02);
    }
    ctx.strokeStyle = css(gc, 1, 0.22);
    ctx.lineWidth = gw;
    ctx.stroke();
    ctx.strokeStyle = css(gc, 1, 0.9);
    ctx.lineWidth = lw;
    ctx.stroke();
    const fogEnd = hy + K * 0.42;
    const fog = vgrad(R, hy, fogEnd);
    const fc = mixInto(tmp, B, C, 0.5);
    fog.addColorStop(0, css(fc, 0.34, 1));
    fog.addColorStop(0.35, css(fc, 0.3, 0.6));
    fog.addColorStop(1, css(C, 0.13, 0));
    vpaint(R, fog, hy, fogEnd);
    // horizon glow
    const hg = Math.max(6, 40 * u);
    const hz = ctx.createLinearGradient(0, hy - hg, 0, hy + hg);
    hz.addColorStop(0, css(A, 1, 0));
    hz.addColorStop(0.5, css(lighten(A.slice(), 0.25), 1, 0.5));
    hz.addColorStop(1, css(A, 1, 0));
    ctx.fillStyle = hz;
    ctx.fillRect(0, hy - hg, w, hg * 2);
    vignette(R, 0.55);
  };

  // ---- Plasma: classic sum-of-sines, 160px buffer scaled up with smoothing
  const SIN_N = 1024;
  const SIN_T = new Float32Array(SIN_N);
  for (let i = 0; i < SIN_N; i++) SIN_T[i] = Math.sin((i / SIN_N) * TAU);
  const LITTLE = new Uint8Array(new Uint32Array([0x0a0b0c0d]).buffer)[0] === 0x0d;
  function buildPlasma(R, old) {
    const big = Math.min(192, Math.max(16, Math.ceil(Math.max(R.w, R.h) / 2)));
    let bw, bh;
    if (R.w >= R.h) { bw = big; bh = Math.max(8, Math.round((big * R.h) / Math.max(1, R.w))); }
    else { bh = big; bw = Math.max(8, Math.round((big * R.w) / Math.max(1, R.h))); }
    const cv = old && old.cv ? old.cv : makeCanvas(bw, bh);
    cv.width = bw; cv.height = bh;
    const x = cv.getContext('2d');
    const img = x.createImageData(bw, bh);
    return {
      cv: cv, x: x, img: img, px: new Uint32Array(img.data.buffer), bw: bw, bh: bh,
      ax: new Float32Array(bw), sx: new Float32Array(bw), cx: new Float32Array(bw),
      by: new Float32Array(bh), sy: new Float32Array(bh), cy: new Float32Array(bh),
      lut: new Uint32Array(256),
    };
  }
  P.plasma = function (R) {
    const c = cacheFor(R, 'plasma', buildPlasma);
    const t = R.t, sp = R.eng.spread;
    const bw = c.bw, bh = c.bh, lut = c.lut;
    // palette: ping-pong through the spread, with soft dark valleys between bands
    const col = [0, 0, 0];
    for (let i = 0; i < 256; i++) {
      const p = i / 256;
      engRGB(R.eng, t, Math.max(sp, 60) * (0.5 - 0.5 * Math.cos(p * TAU)), col);
      const k = 0.3 + 0.62 * Math.pow(0.5 - 0.5 * Math.cos(p * TAU * 3), 0.7);
      const r = byte(col[0] * k), g = byte(col[1] * k), b = byte(col[2] * k);
      lut[i] = LITTLE ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
    }
    const sc = 11 / Math.max(bw, bh);
    const ax = c.ax, sx = c.sx, cxa = c.cx, by = c.by, sy = c.sy, cya = c.cy;
    for (let x = 0; x < bw; x++) {
      ax[x] = Math.sin(x * sc * 1.1 + t * 0.53);
      const d = x * sc * 0.8 + t * 0.31;
      sx[x] = Math.sin(d); cxa[x] = Math.cos(d);
    }
    for (let y = 0; y < bh; y++) {
      by[y] = Math.sin(y * sc * 1.45 - t * 0.41);
      const d = y * sc * 1.05;
      sy[y] = Math.sin(d); cya[y] = Math.cos(d);
    }
    const pcx = bw * (0.5 + 0.32 * Math.sin(t * 0.21)), pcy = bh * (0.5 + 0.32 * Math.cos(t * 0.17));
    const rk = (sc * 1.7 * SIN_N) / TAU, rt = ((t * 0.9) / TAU) * SIN_N;
    const shift = t * 18 + 4096;
    const px = c.px;
    let o = 0;
    for (let y = 0; y < bh; y++) {
      const dy = y - pcy, dy2 = dy * dy, byy = by[y], syy = sy[y], cyy = cya[y];
      for (let x = 0; x < bw; x++) {
        const dx = x - pcx;
        const rad = SIN_T[((Math.sqrt(dx * dx + dy2) * rk - rt + 65536 * SIN_N) | 0) & (SIN_N - 1)];
        const v = ax[x] + byy + sx[x] * cyy + cxa[x] * syy + rad;
        px[o++] = lut[((v * 44 + shift) | 0) & 255];
      }
    }
    c.x.putImageData(c.img, 0, 0);
    const ctx = R.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c.cv, 0, 0, bw, bh, 0, 0, R.w, R.h);
    vignette(R, 0.6);
  };

  // ---- Kaleido: shapes in one wedge, drawn 12x (rotated + mirrored), slowly turning.
  // No clipping: mirrored copies simply overlap at the wedge edges, which keeps the
  // image perfectly symmetric without anti-aliased clip seams.
  const KAL_M = 13;
  function kalShape(ctx, type, x, y, s, sa) {
    ctx.beginPath();
    if (type === 0) {
      ctx.arc(x, y, s, 0, TAU);
    } else if (type === 3) {
      ctx.arc(x, y, s * 1.15, 0, TAU);
      ctx.moveTo(x + s * 0.72, y);
      ctx.arc(x, y, s * 0.72, 0, TAU, true);
    } else if (type === 4) {
      ctx.ellipse(x, y, s * 1.9, s * 0.55, sa, 0, TAU);
    } else {
      const pts = type === 1 ? 3 : 4;
      const rr = type === 1 ? s * 1.4 : s * 1.3;
      for (let p = 0; p < pts; p++) {
        const aa = sa + (p * TAU) / pts;
        const m = type === 2 && p & 1 ? 0.5 : 1;
        const px = x + Math.cos(aa) * rr * m, py = y + Math.sin(aa) * rr * m;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
  }
  P.kaleido = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, sp = R.eng.spread;
    const cx = w / 2, cy = h / 2;
    const rad = Math.hypot(w, h) / 2 + 4;
    ctx.fillStyle = cssAt(R, sp * 0.7, 0.2);
    ctx.fillRect(0, 0, w, h);
    const c = cacheFor(R, 'kaleido', function () {
      return { d: new Float32Array(KAL_M * 6), cols: new Array(KAL_M) };
    });
    const N = 6, wedge = Math.PI / N;
    const d = c.d, col = [0, 0, 0];
    for (let j = 0; j < KAL_M; j++) {
      const prog = frac(hash(j, 1) + t * 0.026 * (0.7 + 0.6 * hash(j, 2)));
      const k = j * 6;
      d[k] = rad * (0.02 + 1.05 * prog); // distance from centre
      d[k + 1] = wedge * (0.5 + 0.55 * Math.sin(t * (0.1 + 0.07 * hash(j, 3)) + j * 1.7)); // angle
      d[k + 2] = rad * (0.045 + 0.075 * hash(j, 4)) * (0.3 + 1.1 * prog); // size
      d[k + 3] = t * (0.2 + 0.45 * hash(j, 5)) * (j & 1 ? -1 : 1) + j; // spin
      d[k + 4] = j % 5; // type
      d[k + 5] = Math.min(1, prog * 7) * Math.min(1, (1 - prog) * 5); // fade in/out
      engRGB(R.eng, t, (j / (KAL_M - 1)) * sp, col);
      c.cols[j] = css(col, 1, 0.66 * d[k + 5]);
    }
    const rot = t * 0.04;
    for (let q = 0; q < 2 * N; q++) {
      ctx.setTransform(1, 0, 0, 1, cx, cy);
      if (q & 1) { ctx.rotate(rot + (q + 1) * wedge); ctx.scale(1, -1); }
      else ctx.rotate(rot + q * wedge);
      for (let j = 0; j < KAL_M; j++) {
        const k = j * 6;
        if (d[k + 5] <= 0.01) continue;
        const r = d[k], a = d[k + 1];
        kalShape(ctx, d[k + 4], Math.cos(a) * r, Math.sin(a) * r, d[k + 2], d[k + 3]);
        ctx.fillStyle = c.cols[j];
        ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // soft centre jewel
    engRGB(R.eng, t, 0, col);
    glow(R, cx, cy, Math.min(w, h) * 0.26, lighten(col, 0.2), 1, 0.45);
    vignette(R, 0.65);
  };

  // ---- Code Rain: static glyph grid revealed by falling fading trails
  const KANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
  const SAFE = '0123456789ABCDEFHKLMNPRTXZ$+-*=<>:';
  let glyphs = null;
  function glyphSet() {
    if (glyphs) return glyphs;
    let kana = false;
    try {
      // Kana usable if it renders differently from a certainly-missing glyph (tofu).
      const cv = makeCanvas(24, 24), x = cv.getContext('2d', { willReadFrequently: true });
      const draw = function (ch) {
        x.clearRect(0, 0, 24, 24);
        x.font = '20px monospace';
        x.fillStyle = '#fff';
        x.textBaseline = 'middle';
        x.fillText(ch, 2, 12);
        return x.getImageData(0, 0, 24, 24).data;
      };
      const a = draw('ｱ'), b = draw('');
      for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) { kana = true; break; }
    } catch (err) { kana = false; }
    glyphs = { list: (kana ? KANA + KANA + '012345789Z:' : SAFE).split(''), kana: kana };
    return glyphs;
  }
  function drawGlyph(g, cs, col, row, gl) {
    const ch = gl.list[(Math.random() * gl.list.length) | 0];
    const x = col * cs + cs / 2, y = row * cs + cs / 2;
    g.clearRect(col * cs, row * cs, cs, cs);
    if (gl.kana && ch.charCodeAt(0) > 255) {
      g.save(); g.translate(x, y); g.scale(-1, 1); g.fillText(ch, 0, 0); g.restore();
    } else g.fillText(ch, x, y);
  }
  function buildMatrix(R, old) {
    const u = R.u, w = R.w, h = R.h;
    const cs = Math.max(6, Math.round(21 * u));
    const gcols = Math.ceil(w / cs) + 2, grows = Math.ceil(h / cs) + 2;
    const grid = old && old.grid ? old.grid : makeCanvas(1, 1);
    grid.width = gcols * cs; grid.height = grows * cs;
    const g = grid.getContext('2d');
    const gl = glyphSet();
    g.font = 'bold ' + Math.round(cs * 0.86) + 'px "MS Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "IPAGothic", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    for (let r = 0; r < grows; r++) for (let q = 0; q < gcols; q++) drawGlyph(g, cs, q, r, gl);
    const L = old && old.L ? old.L : makeCanvas(1, 1);
    L.width = w; L.height = h;
    // one pixel per glyph cell: colour x brightness, computed in JS each frame
    const tw = Math.ceil(w / cs) + 2, th = Math.ceil(h / cs) + 2;
    const tiny = old && old.tiny ? old.tiny : makeCanvas(1, 1);
    tiny.width = tw; tiny.height = th;
    const tx = tiny.getContext('2d');
    const img = tx.createImageData(tw, th);
    return {
      cs: cs, gcols: gcols, grows: grows, grid: grid, g: g, gl: gl, L: L, lx: L.getContext('2d'),
      tiny: tiny, tx: tx, img: img, px: new Uint32Array(img.data.buffer), tw: tw, th: th,
      lens: [10, 16, 24],
    };
  }
  // Draw a canvas tiled (wrapping) so that its pixel (gx0, gy0) lands at the screen origin.
  function drawWrapped(ctx, src, SW, SH, gx0, gy0, w, h) {
    for (let y = 0, sy = gy0; y < h; ) {
      const ph = Math.min(SH - sy, h - y);
      for (let x = 0, sx = gx0; x < w; ) {
        const pw = Math.min(SW - sx, w - x);
        ctx.drawImage(src, sx, sy, pw, ph, x, y, pw, ph);
        x += pw; sx = 0;
      }
      y += ph; sy = 0;
    }
  }
  const BLACK = LITTLE ? 0xff000000 : 0x000000ff;
  P.matrix = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, sp = R.eng.spread;
    const c = cacheFor(R, 'matrix', buildMatrix);
    const cs = c.cs, tw = c.tw, th = c.th, px = c.px, lens = c.lens;
    // glyph flicker
    const flick = R.thumb ? 0 : Math.max(2, ((c.gcols * c.grows) / 400) | 0);
    for (let i = 0; i < flick; i++) {
      drawGlyph(c.g, cs, (Math.random() * c.gcols) | 0, (Math.random() * c.grows) | 0, c.gl);
    }
    // background
    const bg = vgrad(R, 0, h);
    bg.addColorStop(0, cssAt(R, sp, 0.08));
    bg.addColorStop(1, cssAt(R, 0, 0.17));
    vpaint(R, bg, 0, h);
    // per-cell brightness map (world-anchored cells, so parallax just shifts it)
    const ox = Math.round(R.ox), oy = Math.round(R.oy);
    const wc0 = Math.floor(-ox / cs), wr0 = Math.floor(-oy / cs);
    const top0 = wr0 * cs + oy;
    const maxLen = lens[2] * cs;
    const period = Math.max(h + maxLen + 4 * cs, 2 * (maxLen + 3 * cs));
    px.fill(BLACK);
    const col = [0, 0, 0];
    for (let i = 0; i < tw; i++) {
      const wc = wc0 + i;
      const x = wc * cs + ox;
      engRGB(R.eng, t, -clamp(x / w, 0, 1) * sp, col);
      lighten(col, 0.12);
      const vel = cs * (4.5 + 6 * hash(wc, 6));
      const drops = hash(wc, 5) < 0.72 ? 2 : 1;
      for (let d = 0; d < drops; d++) {
        const len = lens[(hash(wc, 20 + d) * 3) | 0];
        const head = mod(t * vel + hash(wc, 7) * period + d * period * 0.5 + oy, period) - maxLen * 0.5;
        const hr = (head - top0) / cs; // head position in map rows
        const j1 = Math.min(th - 1, Math.floor(hr)), j0 = Math.max(0, Math.floor(hr - len));
        for (let j = j0; j <= j1; j++) {
          const dist = hr - j;
          let r = col[0], g = col[1], b = col[2];
          if (dist < 1) { r += (255 - r) * 0.6; g += (255 - g) * 0.6; b += (255 - b) * 0.6; }
          else {
            const k = Math.pow(1 - (dist - 1) / len, 1.6);
            r *= k; g *= k; b *= k;
          }
          px[j * tw + i] = LITTLE
            ? ((255 << 24) | (byte(b) << 16) | (byte(g) << 8) | byte(r)) >>> 0
            : ((byte(r) << 24) | (byte(g) << 16) | (byte(b) << 8) | 255) >>> 0;
        }
      }
    }
    c.tx.putImageData(c.img, 0, 0);
    // glyphs (white) -> coloured by the map (source-atop keeps glyph alpha)
    const lx = c.lx;
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, w, h);
    const GW = c.gcols * cs, GH = c.grows * cs;
    drawWrapped(lx, c.grid, GW, GH, mod(-ox, GW), mod(-oy, GH), w, h);
    lx.globalCompositeOperation = 'source-atop';
    lx.imageSmoothingEnabled = false;
    lx.drawImage(c.tiny, 0, 0, tw, th, wc0 * cs + ox, top0, tw * cs, th * cs);
    lx.imageSmoothingEnabled = true;
    lx.globalCompositeOperation = 'source-over';
    // add onto the background: unlit glyphs are black and vanish, lit ones glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(c.L, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    vignette(R, 0.6);
  };

  // ---- Hypno: twisting spiral arms (static paths, rotated per frame)
  const HYP_ARMS = 12;
  function buildHypno(R) {
    const rad = (Math.hypot(R.w, R.h) / 2) * 1.25;
    const steps = 140, turns = 1.35;
    const arms = [];
    const th = function (r) { return turns * TAU * Math.pow(r / rad, 0.85); };
    for (let a = 0; a < HYP_ARMS; a++) {
      const a0 = (a * TAU) / HYP_ARMS, a1 = ((a + 1) * TAU) / HYP_ARMS;
      const p = new Path2D();
      p.moveTo(0, 0);
      for (let i = 1; i <= steps; i++) {
        const r = (rad * i) / steps, q = a0 + th(r);
        p.lineTo(Math.cos(q) * r, Math.sin(q) * r);
      }
      p.arc(0, 0, rad, a0 + th(rad), a1 + th(rad));
      for (let i = steps; i >= 1; i--) {
        const r = (rad * i) / steps, q = a1 + th(r);
        p.lineTo(Math.cos(q) * r, Math.sin(q) * r);
      }
      p.closePath();
      arms.push(p);
    }
    return { arms: arms };
  }
  P.hypno = function (R) {
    const ctx = R.ctx, w = R.w, h = R.h, t = R.t, sp = R.eng.spread;
    const c = cacheFor(R, 'hypno', buildHypno);
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = cssAt(R, 0, 0.3);
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-t * 0.32);
    const z = 1 + 0.035 * Math.sin(t * 0.5);
    ctx.scale(z, z);
    const half = HYP_ARMS / 2;
    const col = [0, 0, 0];
    for (let a = 0; a < HYP_ARMS; a++) {
      const pair = a >> 1;
      engRGB(R.eng, t, sp * (0.5 - 0.5 * Math.cos((pair / half) * TAU)), col);
      ctx.fillStyle = css(col, (a & 1) ? 0.3 : 0.92);
      ctx.fill(c.arms[a]);
    }
    ctx.restore();
    engRGB(R.eng, t, sp * 0.5, col);
    glow(R, cx, cy, Math.min(w, h) * 0.16, col, 0.35, 0.95);
    vignette(R, 0.7);
  };

  // =============================================================== renderer
  let warned = {};
  function makeRenderer(canvas, isThumb) {
    let ctx = null;
    try { ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d'); } catch (err) { ctx = null; }
    const R = {
      canvas: canvas, ctx: ctx, thumb: !!isThumb,
      w: 0, h: 0, u: 1,
      eng: buildEngine(DEF), pattern: 'rgb',
      motion: 1, parallax: true,
      t: 0, effT: 0, lastT: null,
      ox: 0, oy: 0, pxScale: 1,
      caches: {}, broken: {},
    };

    function resize(pw, ph) {
      const w = Math.max(0, Math.floor(num(pw, canvas.width)));
      const h = Math.max(0, Math.floor(num(ph, canvas.height)));
      R.w = w; R.h = h;
      let cw = 0;
      try { cw = canvas.clientWidth || 0; } catch (err) { cw = 0; }
      R.pxScale = cw > 0 ? clamp(w / cw, 0.5, 4) : clamp(num(window.devicePixelRatio, 1), 0.5, 4);
      // Feature scale: proportional to the screen, but never below ~60% of desktop size in
      // CSS pixels (keeps glyphs/dots readable on small high-DPR phone screens).
      const diag = Math.hypot(w, h);
      R.u = R.thumb ? Math.max(diag / 900, 0.05) : Math.max(diag / REF_DIAG, 0.6 * R.pxScale, 0.25);
    }

    function setConfig(rgbCfg, patternId, opts) {
      R.eng = buildEngine(rgbCfg);
      const id = PATTERN_IDS[patternId] ? patternId : 'rgb';
      if (id !== R.pattern) {
        // release the big offscreen canvases of the pattern we leave
        const m = R.caches.matrix;
        if (m && id !== 'matrix') {
          m.grid.width = m.grid.height = 1;
          m.L.width = m.L.height = 1;
          m.tiny.width = m.tiny.height = 1;
          delete R.caches.matrix;
        }
        R.pattern = id;
      }
      if (opts && typeof opts === 'object') {
        if (opts.motion !== undefined) R.motion = clamp(num(opts.motion, 1), 0, 1);
        if (opts.parallax !== undefined) R.parallax = !!opts.parallax;
      }
    }

    function effTime(timeSec) {
      if (R.lastT === null) return timeSec * R.motion;
      return R.effT + clamp(timeSec - R.lastT, 0, 0.5) * R.motion;
    }

    function draw() {
      if (!ctx || R.w < 1 || R.h < 1) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      const id = R.broken[R.pattern] ? 'rgb' : R.pattern;
      try {
        P[id](R);
      } catch (err) {
        R.broken[id] = true;
        if (!warned[id]) { warned[id] = true; if (window.console) console.warn('MZ.Background: pattern "' + id + '" failed', err); }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        try { P.rgb(R); } catch (err2) { ctx.fillStyle = '#16121f'; ctx.fillRect(0, 0, R.w, R.h); }
      }
    }

    function render(timeSec, cam) {
      if (!ctx) return;
      if (canvas.width !== R.w || canvas.height !== R.h) resize(canvas.width, canvas.height);
      const ts = num(timeSec, R.lastT === null ? 0 : R.lastT);
      R.effT = effTime(ts);
      R.lastT = ts;
      R.t = R.effT;
      if (R.parallax && cam && typeof cam === 'object') {
        const z = num(cam.zoom, 1) > 0 ? num(cam.zoom, 1) : 1;
        const k = -PARALLAX * z * R.pxScale;
        R.ox = num(cam.x, 0) * k;
        R.oy = num(cam.y, 0) * k;
      } else {
        R.ox = 0; R.oy = 0;
      }
      draw();
    }

    // Internal: paint a still at an exact animation time (used by thumb()).
    function renderAt(timeSec) {
      R.t = num(timeSec, 0);
      R.ox = 0; R.oy = 0;
      draw();
    }

    function colors(timeSec, n) {
      n = Math.max(1, Math.min(64, Math.floor(num(n, 1))));
      const t = effTime(num(timeSec, R.lastT === null ? 0 : R.lastT));
      const out = new Array(n);
      const sp = R.eng.spread;
      for (let i = 0; i < n; i++) out[i] = css(engRGB(R.eng, t, n > 1 ? (i / (n - 1)) * sp : 0, TMP));
      return out;
    }

    resize(canvas.width, canvas.height);
    return { setConfig: setConfig, resize: resize, render: render, colors: colors, _renderAt: renderAt };
  }

  function create(canvas) {
    const r = makeRenderer(canvas, false);
    return { setConfig: r.setConfig, resize: r.resize, render: r.render, colors: r.colors };
  }

  const thumbs = typeof WeakMap === 'function' ? new WeakMap() : null;
  function thumb(patternId, canvas, rgbCfg, timeSec) {
    if (!canvas) return;
    let r = thumbs && thumbs.get(canvas);
    if (!r) {
      r = makeRenderer(canvas, true);
      if (thumbs) thumbs.set(canvas, r);
    }
    r.setConfig(rgbCfg, patternId, { motion: 1, parallax: false });
    r.resize(canvas.width, canvas.height);
    r._renderAt(num(timeSec, 0));
  }

  MZ.Background = {
    PATTERNS: PATTERNS,
    DEFAULT_RGB: DEFAULT_RGB,
    create: create,
    thumb: thumb,
    color: color,
  };
})();
