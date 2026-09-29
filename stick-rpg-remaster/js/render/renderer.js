// js/render/renderer.js — owner: W1-G. The city painter's frame (ARCHITECTURE §9.1): the view
// (camera, zoom, device scale), the frame order (sky → ground chunks → shadows → Y-sorted pass →
// grade → emissive → weather → post → world UI → particles), invalidation, cache stats, warm-up,
// the shared colour and palette helpers (SR.render.lib) and the debug overlays (projected rects
// and porches, the lighting hour scrubber). Canvas only; nothing runs at load time.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // ---------------------------------------------------------------------------------------------
  // Shared helpers (SR.render.lib). Colours are never written as literals here: they come from
  // SR.art.palette by key (CONTRACT D32) and are mixed numerically.
  // ---------------------------------------------------------------------------------------------

  var palRef = null;
  var palCache = {};
  var parsed = {};

  /** @returns {string|undefined} the palette entry at a dotted key ('bld.bank.walls', 'karma.good.3'). */
  function resolve(key) {
    var p = SR.art && SR.art.palette;
    if (!p || typeof key !== 'string') return undefined;
    if (p !== palRef) { palRef = p; palCache = {}; }
    if (hasOwn.call(palCache, key)) return palCache[key];
    var parts = key.split('.');
    var v = p;
    for (var i = 0; i < parts.length; i++) {
      if (v === null || typeof v !== 'object') { v = undefined; break; }
      v = v[parts[i]];
    }
    var out = typeof v === 'string' ? v : undefined;
    palCache[key] = out;
    return out;
  }

  /**
   * The first palette key of keys that resolves.
   * @param {string|string[]} keys a key or candidate keys
   * @param {number=} lum fallback grey level 0..1 when none resolves (warned once)
   * @returns {string} a CSS colour
   */
  function pal(keys, lum) {
    if (typeof keys === 'string') {
      var c = resolve(keys);
      if (c) return c;
    } else if (keys) {
      for (var i = 0; i < keys.length; i++) {
        var d = resolve(keys[i]);
        if (d) return d;
      }
    }
    SR.util.warnOnce('render.pal:' + keys, 'SR.render: palette key ' + JSON.stringify(keys) + ' is missing (placeholder grey)');
    return grey(lum === undefined ? 0.6 : lum);
  }

  /** @returns {boolean} some key of keys resolves in the palette. */
  function palHas(keys) {
    if (typeof keys === 'string') return !!resolve(keys);
    for (var i = 0; i < keys.length; i++) if (resolve(keys[i])) return true;
    return false;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function hex2(n) { n = Math.round(clamp(n, 0, 255)); return (n < 16 ? '0' : '') + n.toString(16); }

  /** @returns {string} '#rrggbb' from channel values 0..255. */
  function hex(r, g, b) {
    if (Array.isArray(r)) { g = r[1]; b = r[2]; r = r[0]; }
    return '#' + hex2(r) + hex2(g) + hex2(b);
  }

  /** @returns {string} a neutral grey at level 0..1 (placeholders only). */
  function grey(l) { var v = clamp(l, 0, 1) * 255; return hex(v, v, v); }

  /** @returns {number[]} [r, g, b, a] (0..255, alpha 0..1) of a hex or rgb-function colour string. */
  function chan(c) {
    if (typeof c !== 'string') return [128, 128, 128, 1];
    var hit = parsed[c];
    if (hit) return hit;
    var out = null, m;
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (x) { return x + x; }).join('');
      if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) {
        out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
          h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
      }
    } else if ((m = /^rgba?\s*\(([^)]*)\)/i.exec(c))) {
      var p = m[1].split(/[\s,/]+/).filter(Boolean).map(function (s, i) {
        var n = parseFloat(s);
        if (/%$/.test(s)) n = i < 3 ? n * 2.55 : n / 100;
        return n;
      });
      out = [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
    }
    if (!out) out = [128, 128, 128, 1];
    parsed[c] = out;
    return out;
  }

  /** @returns {number} the alpha 0..1 a colour string carries (1 for opaque colours). */
  function alphaOf(c) { return chan(c)[3]; }

  /** @returns {string} the opaque '#rrggbb' of a colour (its alpha dropped; use globalAlpha). */
  function solid(c) { var v = chan(c); return hex(v[0], v[1], v[2]); }

  /** @returns {string} a + (b - a) · t per channel. */
  function mix(a, b, t) {
    var x = chan(a), y = chan(b);
    return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }

  /** @returns {string} the multiply blend of two colours (a × b per channel). */
  function mul(a, b) {
    var x = chan(a), y = chan(b);
    return hex(x[0] * y[0] / 255, x[1] * y[1] / 255, x[2] * y[2] / 255);
  }

  /** @returns {number} relative luminance 0..1 (sRGB, WCAG). */
  function luma(c) {
    var v = chan(c);
    function ch(x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(v[0]) + 0.7152 * ch(v[1]) + 0.0722 * ch(v[2]);
  }

  function hslParts(v) {
    var r = v[0] / 255, g = v[1] / 255, b = v[2] / 255;
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
  function fromHslParts(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) return hex(l * 255, l * 255, l * 255);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return hex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
  }

  var toneCache = {};
  /**
   * The three tones of a material (ART_AUDIO §1.1 rule 1): shade -12 % lightness, highlight
   * +10 %, computed in HSL.
   * @param {string} c a colour
   * @param {number} dir -1 shade, 0 base, +1 highlight (fractions scale the step)
   * @returns {string}
   */
  function tone(c, dir) {
    if (!dir) return solid(c);
    var k = c + '|' + dir;
    if (hasOwn.call(toneCache, k)) return toneCache[k];
    var hsl = hslParts(chan(c));
    var l = clamp(hsl[2] + (dir < 0 ? 0.12 * dir : 0.10 * dir), 0, 1);
    toneCache[k] = fromHslParts(hsl[0], hsl[1], l);
    return toneCache[k];
  }

  /** @returns {number} a deterministic value in [0, 1) from the arguments (no RNG draw). */
  function hash01() { return SR.util.hash.apply(null, arguments) / 4294967296; }

  /**
   * A fast deterministic value in [0, 1) from up to three integers (hot loops: stipple, specks).
   * @returns {number}
   */
  function ihash(a, b, c) {
    var h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13) ^ (b | 0), 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16) ^ Math.imul(c | 0, 0x27d4eb2d), 0x165667b1);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /** @returns {number} seconds of animation time: SR.loop.time when the loop runs, else wall time. */
  function now() {
    var L = SR.loop;
    if (L && typeof L.time === 'number' && typeof L.pause === 'function') return L.time;
    return typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
  }

  /** @returns {*} SR.settings.get(key), or dflt when settings are not there yet. */
  function setting(key, dflt) {
    var S = SR.settings;
    if (S && typeof S.get === 'function') {
      try {
        var v = S.get(key);
        return v === undefined || v === null ? dflt : v;
      } catch (e) { return dflt; }
    }
    return dflt;
  }

  var rmCache = { t: -1, v: false };
  /** @returns {boolean} Reduced Motion is on (the setting, or the system preference for 'system'). */
  function reducedMotion() {
    var v = setting('access.reducedMotion', 'system');
    if (v === true || v === 'on' || v === 'reduce') return true;
    if (v === false || v === 'off') return false;
    var t = typeof performance !== 'undefined' ? performance.now() : 0;
    if (t - rmCache.t > 1000 || rmCache.t < 0) {
      rmCache.t = t;
      rmCache.v = !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    return rmCache.v;
  }

  /** @returns {boolean} Flash reduction is on (steady neon, soft lightning). */
  function flashReduction() { return !!setting('access.flashReduction', false); }

  var QDEFAULT = { maxDpr: 2, renderScale: 1, particles: 1, crowd: 1 };
  /** @returns {object} SR.quality.params (the High defaults until the kernel's quality lands). */
  function quality() { var Q = SR.quality; return (Q && Q.params) || QDEFAULT; }

  /** @returns {boolean} the touch-compact profile (smaller caches, ARCHITECTURE §17). */
  function compact() { return !!(SR.stage && SR.stage.compact); }

  var LEVELS = [0.8, 1, 1.25];
  /** @returns {number[]} the quantized zoom levels (B-15 `camera`). */
  function zoomLevels() {
    var w = SR.tuning && SR.tuning.world;
    var c = w && w.camera;
    var z = c && (c.zoom || c.zooms || c.levels);
    return Array.isArray(z) && z.length && z.every(function (n) { return typeof n === 'number' && n > 0; }) ? z : LEVELS;
  }

  /**
   * The zoom caches are baked at: the nearest quantized level (a zoom easing between levels is
   * drawn from the nearest level's caches), or, below the smallest level (overviews, the title's
   * wide shots), the zoom itself rounded to 0.05.
   * @returns {number}
   */
  function bakeZoom(z) {
    var lv = zoomLevels(), lo = Math.min.apply(null, lv);
    if (z < lo * 0.85) return Math.max(0.05, Math.round(z * 20) / 20);
    var best = lv[0];
    for (var i = 1; i < lv.length; i++) if (Math.abs(lv[i] - z) < Math.abs(best - z)) best = lv[i];
    return best;
  }

  /** @returns {string} SR.text(key, vars) when the key exists, else fallback (no missing-key warning). */
  function text(key, vars, fallback) {
    if (SR.text && typeof SR.text.has === 'function' && SR.text.has(key)) return SR.text(key, vars);
    return fallback === undefined ? '' : fallback;
  }

  var count = { images: 0, fills: 0 };

  // ---------------------------------------------------------------------------------------------
  // The render model: what the painter derives from the worldmap (ARCHITECTURE §8.1), rebuilt
  // when the registered worldmap changes or on invalidate('all').
  // ---------------------------------------------------------------------------------------------

  var model = null;

  function rectOf(r) {
    if (Array.isArray(r) && r.length >= 4) return [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
    if (r && typeof r === 'object' && typeof r.x0 === 'number') return [r.x0, r.y0, r.x1, r.y1];
    return null;
  }

  function buildModel(wm) {
    var m = { wm: wm, gen: (model ? model.gen : 0) + 1, buildings: [], doors: [], props: [], bbox: [0, 0, 5120, 4608] };
    var outline = Array.isArray(wm.outline) ? wm.outline.filter(function (p) { return Array.isArray(p) && p.length >= 2; }) : [];
    if (outline.length >= 3) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      outline.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
      m.bbox = [x0, y0, x1, y1];
    } else if (wm.size) {
      m.bbox = [0, 0, wm.size.w || 5120, wm.size.h || 4608];
    }
    var E = SR.art.exterior;
    (Array.isArray(wm.buildings) ? wm.buildings : []).forEach(function (b) {
      if (!b || !b.id || !Array.isArray(b.masses) || !b.masses.length) return;
      var g = E && typeof E.geom === 'function' ? E.geom(b) : null;
      if (!g) return;
      m.buildings.push({ id: b.id, def: b, geom: g, alpha: 1, target: 1 });
      if (b.door && typeof b.door.x === 'number') m.doors.push({ id: b.door.id || b.id, building: b.id, door: b.door, geom: g });
    });
    // Static draw order: by ground contact (the southmost mass's y1), then x.
    m.buildings.sort(function (a, b) { return a.geom.sortY - b.geom.sortY || a.geom.bounds[0] - b.geom.bounds[0]; });
    m.props = (Array.isArray(wm.props) ? wm.props : []).filter(function (p) { return p && typeof p.x === 'number' && typeof p.y === 'number'; });
    // The statue plinth on Origin Plaza is a solid feature drawn upright like a prop (GDD §3.3).
    var pl = wm.features && wm.features.plinth && rectOf(wm.features.plinth.rect);
    if (pl) m.props.push({ type: 'plinth', x: (pl[0] + pl[2]) / 2, y: pl[3], variant: 0 });
    m.props.sort(function (a, b) { return a.y - b.y; });
    return m;
  }

  /** @returns {object|null} the render model for the registered worldmap (null before one exists). */
  function getModel() {
    var wm = SR.reg && SR.reg.worldmap && SR.reg.worldmap.main;
    if (!wm) return null;
    if (!model || model.wm !== wm) {
      model = buildModel(wm);
      if (SR.render.ground && SR.render.ground.reset) SR.render.ground.reset();
      if (SR.render.buildings && SR.render.buildings.reset) SR.render.buildings.reset();
    }
    return model;
  }

  // ---------------------------------------------------------------------------------------------
  // View: camera, zoom and the device scale. Overrides in SR.render.view win (title drift, the
  // debug hour scrubber, sheets and tests); otherwise SR.world.camera and SR.state drive it.
  // ---------------------------------------------------------------------------------------------

  function num(v) { return typeof v === 'number' && isFinite(v); }

  var view = {
    x: 0, y: 0, zoom: 1, bz: 1, s: 1, ppu: 1, tx: 0, ty: 0, W: 1280, H: 720,
    x0: 0, y0: 0, x1: 0, y1: 0, min: 720, day: 1, light: 0, ambient: null, t: 0, dt: 0,
    weather: 'clear', sway: 0, frame: 0,
  };

  /** @returns {{x: number, y: number, zoom: number}} the camera the frame uses (before snapping). */
  function cameraNow(alpha) {
    var o = SR.render.view, c = SR.world && SR.world.camera;
    var m = model;
    var cx = m ? (m.bbox[0] + m.bbox[2]) / 2 : 2560, cy = m ? (m.bbox[1] + m.bbox[3]) / 2 : 2304, z = 1;
    if (c && typeof c === 'object') {
      var a = num(alpha) ? clamp(alpha, 0, 1) : 1;
      var x = num(c.x) ? c.x : num(c.cx) ? c.cx : null;
      var y = num(c.y) ? c.y : num(c.cy) ? c.cy : null;
      if (x !== null && y !== null) {
        cx = num(c.px) ? c.px + (x - c.px) * a : x;
        cy = num(c.py) ? c.py + (y - c.py) * a : y;
      }
      if (num(c.zoom) && c.zoom > 0) z = c.zoom;
      else if (num(c.z) && c.z > 0) z = c.z;
    }
    if (num(o.x)) cx = o.x;
    if (num(o.y)) cy = o.y;
    if (num(o.zoom) && o.zoom > 0) z = o.zoom;
    return { x: cx, y: cy, zoom: z };
  }

  /** @returns {number} device pixels per logical unit of a context (its transform's x scale). */
  function deviceScale(ctx) {
    if (ctx && typeof ctx.getTransform === 'function') {
      var t = ctx.getTransform();
      if (t && num(t.a) && t.a > 0) return t.a;
    }
    if (SR.stage && num(SR.stage.scale) && SR.stage.scale > 0) return SR.stage.scale;
    if (ctx && ctx.canvas && ctx.canvas.width) return ctx.canvas.width / SR.W;
    return 1;
  }

  // Displayed game minute: lighting tweens for 1.5 s after each clock jump (GDD §3.12).
  var TIME_TWEEN = 1.5;
  var clock = { shown: 720, from: 720, to: 720, t0: -1, day: 1, key: null };

  function targetTime() {
    var o = SR.render.view, s = SR.state;
    var min = num(o.min) ? o.min : s && s.clock && num(s.clock.min) ? s.clock.min : 720;
    var day = num(o.day) ? o.day : s && s.clock && num(s.clock.day) ? s.clock.day : 1;
    return { min: clamp(min, 0, 1440), day: day, immediate: num(o.min) && !o.tween };
  }

  function tickClock(t) {
    var tg = targetTime();
    var abs = (tg.day - 1) * 1440 + tg.min;
    if (clock.key === null || tg.immediate) {
      clock.key = abs; clock.from = abs; clock.to = abs; clock.t0 = -1; clock.shown = abs;
    } else if (abs !== clock.key) {
      clock.from = clock.shown; clock.to = abs; clock.t0 = t; clock.key = abs;
      if (Math.abs(clock.to - clock.from) > 3 * 1440) clock.from = clock.to;   // a load or a new game: no sweep
    }
    if (clock.t0 >= 0) {
      var k = clamp((t - clock.t0) / TIME_TWEEN, 0, 1);
      clock.shown = clock.from + (clock.to - clock.from) * SR.util.easeInOut(k);
      if (k >= 1) clock.t0 = -1;
    } else {
      clock.shown = clock.to;
    }
    var shown = clock.shown;
    view.day = Math.floor(shown / 1440) + 1;
    view.min = shown - (view.day - 1) * 1440;
    if (view.min >= 1440) view.min = 1439.99;
  }

  function weatherNow() {
    var o = SR.render.view;
    var st = SR.state && SR.state.world;
    return typeof o.weather === 'string' ? o.weather : st && typeof st.weather === 'string' ? st.weather :
      st && st.weather && typeof st.weather.today === 'string' ? st.weather.today : 'clear';
  }

  /** Advances the displayed clock (interiors call this through sky.drawWindow). @returns {{min: number, day: number, weather: string}} */
  function tick() {
    tickClock(now());
    return { min: view.min, day: view.day, weather: weatherNow() };
  }

  function computeView(ctx, alpha) {
    var cam = cameraNow(alpha);
    var s = deviceScale(ctx);
    var W = SR.W, H = SR.H;
    var zoom = cam.zoom;
    var bz = bakeZoom(zoom);
    view.W = W; view.H = H; view.s = s; view.zoom = zoom; view.bz = bz;
    view.ppu = zoom * s;
    // Buzz sway (ART_AUDIO §12): ±6 u at 0.4 Hz at Buzz ≥ 3, off with Reduced Motion.
    var buzz = SR.state && SR.state.stats && num(SR.state.stats.buzz) ? SR.state.stats.buzz : 0;
    view.sway = buzz >= 3 && !reducedMotion() ? 6 * Math.sin(view.t * Math.PI * 2 * 0.4) : 0;
    var shake = SR.render.fx && SR.render.fx.offset ? SR.render.fx.offset() : null;
    var ox = (shake ? shake.x : 0) + view.sway, oy = shake ? shake.y : 0;
    // Snap the camera to the device-pixel grid so chunks tile without seams (ARCHITECTURE §9.1).
    view.tx = Math.round((W / 2) * s - (cam.x + ox) * view.ppu);
    view.ty = Math.round((H / 2) * s - (cam.y + oy) * view.ppu);
    view.x = ((W / 2) * s - view.tx) / view.ppu;
    view.y = ((H / 2) * s - view.ty) / view.ppu;
    view.x0 = view.x - W / 2 / zoom;
    view.x1 = view.x + W / 2 / zoom;
    view.y0 = view.y - H / 2 / zoom;
    view.y1 = view.y + H / 2 / zoom;
    view.weather = weatherNow();
    return view;
  }

  /** Sets the context transform so that drawing uses world units (screen-before-camera coordinates). */
  function worldTransform(ctx, v) {
    v = v || view;
    ctx.setTransform(v.ppu, 0, 0, v.ppu, v.tx, v.ty);
  }

  /** Sets the context transform back to logical stage units. */
  function stageTransform(ctx, v) {
    v = v || view;
    ctx.setTransform(v.s, 0, 0, v.s, 0, 0);
  }

  /** @returns {{x: number, y: number}} the logical stage point of a world point at height z (last frame's view). */
  function toScreen(x, y, z) {
    var yy = y - 0.5 * (z || 0);
    return { x: (x * view.ppu + view.tx) / view.s, y: (yy * view.ppu + view.ty) / view.s };
  }

  /** @returns {{x: number, y: number}} the ground point under a logical stage point (last frame's view). */
  function toWorld(sx, sy) {
    return { x: (sx * view.s - view.tx) / view.ppu, y: (sy * view.s - view.ty) / view.ppu };
  }

  // ---------------------------------------------------------------------------------------------
  // The Y-sorted pass (ARCHITECTURE §9.1 step 5): buildings, props and actors by ground contact y.
  // Items are pooled; insertion sort (nearly sorted from frame to frame).
  // ---------------------------------------------------------------------------------------------

  var items = [];
  var nItems = 0;

  /** Adds one item to this frame's Y-sorted pass (kind: 'building' | 'prop' | 'actor' | a custom drawer). */
  function pushItem(key, kind, ref, a, b) {
    var it = items[nItems];
    if (!it) it = items[nItems] = { key: 0, kind: '', ref: null, a: null, b: null };
    it.key = key; it.kind = kind; it.ref = ref; it.a = a === undefined ? null : a; it.b = b === undefined ? null : b;
    nItems++;
  }

  function sortItems() {
    for (var i = 1; i < nItems; i++) {
      var it = items[i], k = it.key, j = i - 1;
      while (j >= 0 && items[j].key > k) { items[j + 1] = items[j]; j--; }
      items[j + 1] = it;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------------------------

  var last = { t: -1, ms: 0, items: 0, buildings: 0, props: 0, actors: 0, images: 0, fills: 0, parts: {} };
  var debug = { projected: false, hours: false, scrubber: null, flagTime: false };

  function call(mod, fn, a, b, c) {
    var M = SR.render[mod];
    if (M && typeof M[fn] === 'function') return M[fn](a, b, c);
    return undefined;
  }

  function mark(name, t0) {
    var t1 = performance.now();
    last.parts[name] = t1 - t0;
    return t1;
  }

  /**
   * Draws the city for this frame onto ctx (its transform in logical stage units).
   * @param {CanvasRenderingContext2D} ctx the #world context
   * @param {number} alpha the fixed-step interpolation alpha (0..1)
   */
  function frame(ctx, alpha) {
    if (!ctx) return;
    var t0 = performance.now(), tp = t0;
    var m = getModel();
    var t = now();
    view.dt = last.t < 0 ? 0 : clamp(t - last.t, 0, 0.1);
    view.t = t;
    last.t = t;
    view.frame++;
    count.images = 0; count.fills = 0;
    tickClock(t);
    computeView(ctx, alpha);
    var Li = SR.render.lighting;
    var lit = Li && Li.at ? Li.at(view.min, view.weather) : null;
    view.light = lit ? lit.light : 0;
    view.ambient = lit ? lit.ambient : null;
    view.sky = lit;
    var R = SR.render;

    ctx.save();
    // A full clear first: the frame repaints every pixel, and a cleared canvas lets the browser
    // drop the previous frame's pending draw recording instead of rasterizing it.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    call('sky', 'draw', ctx, view, m);
    tp = mark('sky', tp);
    if (m) {
      call('ground', 'draw', ctx, view, m);
      tp = mark('ground', tp);
      if (R.shadows && typeof R.shadows.draw === 'function') { R.shadows.draw(ctx, view, m); tp = mark('shadows', tp); }
      ysort(ctx, m, alpha);
      tp = mark('ysort', tp);
      call('lighting', 'grade', ctx, view, m);
      call('lighting', 'emissive', ctx, view, m);
      tp = mark('light', tp);
      if (R.weatherfx && typeof R.weatherfx.draw === 'function') { R.weatherfx.draw(ctx, view, m); tp = mark('weather', tp); }
      call('lighting', 'post', ctx, view, m);
      tp = mark('post', tp);
      call('worldui', 'draw', ctx, view, m);
      tp = mark('ui', tp);
    }
    call('particles', 'update', view.dt);
    call('particles', 'draw', ctx, view);
    tp = mark('particles', tp);
    var fl = SR.debug && SR.debug.flags;
    if (m && (debug.projected || (fl && fl.projected))) drawProjected(ctx, m);
    if (fl && !!fl.time !== debug.flagTime) { debug.flagTime = !!fl.time; hours(debug.flagTime); }
    ctx.restore();
    // The bakes run last so that they never delay this frame's picture (ARCHITECTURE §9.1: ≤ 2
    // chunks in 3 ms, one building mass per frame).
    if (m) {
      call('ground', 'bake', view, m);
      tp = mark('bakeGround', tp);
      call('buildings', 'bake', view, m);
      tp = mark('bakeBuildings', tp);
    }
    last.ms = tp - t0;
    last.items = nItems;
    last.images = count.images;
    last.fills = count.fills;
  }

  function ysort(ctx, m, alpha) {
    nItems = 0;
    var B = SR.render.buildings, A = SR.render.actors;
    if (B && B.collect) last.buildings = B.collect(view, m, pushItem);
    if (B && B.collectProps) last.props = B.collectProps(view, m, pushItem);
    if (A && A.collect) last.actors = A.collect(view, m, pushItem, alpha);
    if (B && B.occlusion) B.occlusion(view, m);
    sortItems();
    worldTransform(ctx);
    for (var i = 0; i < nItems; i++) {
      var it = items[i];
      if (it.kind === 'building') B.drawBuilding(ctx, it.ref, view);
      else if (it.kind === 'prop') B.drawProp(ctx, it.ref, view);
      else if (it.kind === 'actor') A.draw(ctx, it.ref, it.a, view, it.b);
      else if (typeof it.kind === 'function') it.kind(ctx, it.ref, view);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Debug overlays: projected rects, porches and signatures (SR.debug.projected), and the lighting
  // hour scrubber (SR.debug.time). Both are for tests and reviewers.
  // ---------------------------------------------------------------------------------------------

  function strokeRect(ctx, r, lw) {
    ctx.lineWidth = lw;
    ctx.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  }

  function drawProjected(ctx, m) {
    worldTransform(ctx);
    var lw = 2 / view.zoom;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([8 / view.zoom, 6 / view.zoom]);
    for (var i = 0; i < m.buildings.length; i++) {
      var g = m.buildings[i].geom;
      ctx.strokeStyle = pal('ink', 0.1);
      for (var k = 0; k < g.masses.length; k++) strokeRect(ctx, g.masses[k].proj, lw);
      if (g.porch) {
        ctx.strokeStyle = pal('lanePaint', 0.8);
        strokeRect(ctx, g.porch, lw * 1.5);
      }
      if (g.visible) {
        ctx.fillStyle = pal('lanePaint', 0.8);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(g.visible[0], g.visible[1], g.visible[2] - g.visible[0], g.visible[3] - g.visible[1]);
        count.fills++;
        ctx.globalAlpha = 0.9;
      }
      if (g.signature && g.signature.length) {
        ctx.strokeStyle = pal(['ui.danger', 'bld.bank.walls'], 0.3);
        g.signature.forEach(function (r) { strokeRect(ctx, r, lw * 1.5); });
      }
    }
    ctx.restore();
  }

  var KEY_HOURS = [0, 5, 6, 7, 9, 13, 16, 17, 19, 20, 21, 23];

  function mountScrubber() {
    if (debug.scrubber || typeof document === 'undefined') return;
    var host = document.getElementById('ui');
    if (!host) return;
    var box = document.createElement('div');
    box.setAttribute('data-id', 'render-hour-scrubber');
    box.style.cssText = 'position:absolute;left:340px;right:340px;bottom:12px;padding:8px 12px;border-radius:10px;' +
      'background:var(--paper-0);border:2px solid var(--ink-900);font:600 14px system-ui,sans-serif;color:var(--ink-900);' +
      'display:flex;gap:8px;align-items:center;flex-wrap:wrap;z-index:70;pointer-events:auto;';
    var label = document.createElement('span');
    label.setAttribute('data-id', 'render-hour-label');
    label.style.minWidth = '48px';
    var range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '1439'; range.step = '5';
    range.setAttribute('data-id', 'render-hour-range');
    range.setAttribute('aria-label', 'Lighting hour');
    range.style.flex = '1';
    function set(min) {
      SR.render.view.min = min;
      range.value = String(min);
      label.textContent = SR.text && SR.text.time ? SR.text.time(min, false) : String(min);
    }
    range.addEventListener('input', function () { set(Number(range.value)); });
    box.appendChild(label);
    box.appendChild(range);
    KEY_HOURS.forEach(function (h) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = SR.util.pad(h, 2);
      b.setAttribute('data-id', 'render-hour-' + h);
      b.style.cssText = 'font:600 12px system-ui,sans-serif;padding:2px 6px;border-radius:6px;border:1px solid var(--ink-700);background:var(--paper-1);color:var(--ink-900);';
      b.addEventListener('click', function () { set(h * 60); });
      box.appendChild(b);
    });
    var off = document.createElement('button');
    off.type = 'button';
    off.textContent = '×';
    off.setAttribute('data-id', 'render-hour-close');
    off.setAttribute('aria-label', 'Close the hour scrubber');
    off.style.cssText = 'font:700 14px system-ui,sans-serif;padding:2px 8px;border-radius:6px;border:1px solid var(--ink-700);background:var(--paper-2);color:var(--ink-900);';
    off.addEventListener('click', function () { hours(false); });
    box.appendChild(off);
    host.appendChild(box);
    debug.scrubber = { box: box, set: set };
    set(Math.round(view.min / 5) * 5);
  }

  /** Shows or hides the lighting hour scrubber (SR.debug.time). While shown, it drives SR.render.view.min. */
  function hours(on) {
    debug.hours = !!on;
    if (on) mountScrubber();
    else if (debug.scrubber) {
      if (debug.scrubber.box.parentNode) debug.scrubber.box.parentNode.removeChild(debug.scrubber.box);
      debug.scrubber = null;
      SR.render.view.min = null;
    }
    return debug.hours;
  }

  /** Draws every mass's projected rect, porch, visible strip and signature rect (SR.debug.projected). */
  function projected(on) { debug.projected = !!on; return debug.projected; }

  // ---------------------------------------------------------------------------------------------
  // Invalidation, warm-up and stats
  // ---------------------------------------------------------------------------------------------

  /**
   * Drops caches so they re-bake lazily (ARCHITECTURE §9.1).
   * @param {string} what 'building:<id>' | 'chunks' | 'sky' | 'all'
   */
  function invalidate(what) {
    what = String(what || 'all');
    if (what.indexOf('building:') === 0) {
      call('buildings', 'invalidate', what.slice(9));
    } else if (what === 'chunks') {
      call('ground', 'invalidate');
    } else if (what === 'sky') {
      call('sky', 'invalidate');
      call('lighting', 'invalidate');
    } else if (what === 'all') {
      model = null;
      palRef = null; palCache = {}; toneCache = {}; parsed = {};
      call('ground', 'invalidate');
      call('buildings', 'invalidate');
      call('sky', 'invalidate');
      call('lighting', 'invalidate');
      getModel();
    } else {
      throw new Error('SR.render.invalidate: unknown target "' + what + '" (building:<id>, chunks, sky, all)');
    }
  }

  /**
   * Bakes every chunk and building sprite the current view needs, at once (tests, sheets, the
   * title's first frame). Frames never do this: they bake within the per-frame budgets.
   * @param {CanvasRenderingContext2D=} ctx a context for the device scale (default: the last frame's)
   */
  function warm(ctx) {
    var m = getModel();
    if (!m) return 0;
    // Without a context the scale comes from the stage (or the last frame's view).
    computeView(ctx || (SR.stage && SR.stage.ctx) || null, 1);
    var n = 0;
    n += call('ground', 'bakeAll', view, m) || 0;
    n += call('buildings', 'bakeAll', view, m) || 0;
    return n;
  }

  /** @returns {object} cache sizes (device pixels and bytes), the last frame's work and draw counts. */
  function stats() {
    var g = call('ground', 'stats') || {};
    var b = call('buildings', 'stats') || {};
    var sk = call('sky', 'stats') || {};
    var li = call('lighting', 'stats') || {};
    var pa = call('particles', 'stats') || {};
    var ac = call('actors', 'stats') || {};
    var small = (b.propPx || 0) + (b.neonPx || 0) + (li.px || 0) + (ac.px || 0);
    return {
      chunks: g,
      sprites: { count: b.count || 0, px: b.px || 0, budgetPx: b.budgetPx || 0, bytes: (b.px || 0) * 4, pending: b.pending || 0 },
      props: { count: b.propCount || 0, px: b.propPx || 0 },
      neon: { count: b.neonCount || 0, px: b.neonPx || 0 },
      cars: { count: ac.count || 0, px: ac.px || 0 },
      light: li,
      small: { px: small, bytes: small * 4 },
      sky: sk,
      particles: pa,
      frame: {
        ms: last.ms, parts: Object.assign({}, last.parts), items: last.items, buildings: last.buildings,
        props: last.props, actors: last.actors, images: last.images, fills: last.fills,
      },
      view: { x: view.x, y: view.y, zoom: view.zoom, bakeZoom: view.bz, s: view.s, ppu: view.ppu, min: view.min, day: view.day, light: view.light },
      bytes: (g.bytes || 0) + (b.px || 0) * 4 + small * 4 + (sk.bytes || 0),
    };
  }

  Object.assign(SR.render, {
    frame: frame,
    invalidate: invalidate,
    stats: stats,
    warm: warm,
    toScreen: toScreen,
    toWorld: toWorld,
    /** Overrides for the view: { x, y, zoom, min, day, weather, tween }; null fields follow the world and the state. */
    view: { x: null, y: null, zoom: null, min: null, day: null, weather: null, tween: false },
    /** Merges overrides into SR.render.view. @returns {object} SR.render.view */
    setView: function (patch) { Object.assign(SR.render.view, patch || {}); return SR.render.view; },
    /** @returns {number} the game minute the lighting currently shows (tweened after a jump). */
    time: function () { return view.min; },
    /** @returns {object} the last frame's view (read-only use). */
    lastView: function () { return view; },
    debug: { projected: projected, hours: hours },
    lib: {
      pal: pal, palHas: palHas, resolve: resolve, chan: chan, hex: hex, solid: solid, alphaOf: alphaOf, mix: mix, mul: mul,
      luma: luma, tone: tone, grey: grey, clamp: clamp, hash01: hash01, ihash: ihash, now: now, setting: setting,
      reducedMotion: reducedMotion, flashReduction: flashReduction, quality: quality, compact: compact,
      zoomLevels: zoomLevels, bakeZoom: bakeZoom, text: text, model: getModel, rectOf: rectOf, num: num,
      worldTransform: worldTransform, stageTransform: stageTransform, count: count, tick: tick,
    },
  });

  // Caches whose device scale changed re-bake lazily (their keys carry the scale); a quality
  // change may shrink the particle pool. Priority 40: render caches (CONTRACT §3.5).
  SR.onBoot(40, function () {
    if (!SR.events || typeof SR.events.on !== 'function') return;
    SR.events.on('stage:resized', function () { if (SR.render.sky && SR.render.sky.invalidate) SR.render.sky.invalidate(); });
    SR.events.on('settings:changed', function (p) {
      if (p && typeof p.key === 'string' && /^access\.(highContrast|colorblind)/.test(p.key)) invalidate('sky');
    });
  });
})();
