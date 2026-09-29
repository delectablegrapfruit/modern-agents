// js/render/lighting.js — owner: W1-G (W3-Light in wave 3). Light and time (ARCHITECTURE §9.1 steps
// 6, 7 and 9; ART_AUDIO §2.2, §3): the sky keyframes interpolated per game minute (with the P1
// weather tints), the grade (one multiply fill of the hour's ambient over the sheet and what stands
// on it, skipped when white), the emissive pass (additive, × the light factor: lit windows as one
// batched rect path from the seeded schedule, small neon sprites with their flicker, lamp pools,
// door light spills, headlights and tail lights, the fountain's lights) and the post pass (the
// edge-danger vignette and the hit flash).
(function () {
  'use strict';
  var SR = window.SR;

  var LAMPS_ON = 19 * 60 + 45;     // lamps on at 19:45 (ART_AUDIO §2.2)
  var LAMPS_OFF = 6 * 60 + 45;
  var NEON_ON = 19 * 60;           // golden hour: neon on
  var NEON_OFF = 7 * 60;
  var LAMP_R = 90;                 // lamp pools r 90 u
  var SPILL_R = 56;                // door light spills
  var CONE_LEN = 160;              // headlight cone 160 u, 35° half angle
  var CONE_HALF = 35 * Math.PI / 180;
  var FLICKER_P = 0.02;            // neon: 2 % chance per second of a 120 ms dropout
  var FLICKER_MS = 120;
  var WINDOW_GAIN = 0.8;           // lit glass reads warm, not white, over a dark facade
  var EDGE_WARN = 60;              // edge-danger vignette within 60 u (fog 90; B-15 `edgeWarn`)
  var EDGE_WARN_FOG = 90;
  var WEATHER_SKY = { cloudy: ['weather.cloudy', 0.3], rain: ['weather.rain', 0.5], storm: ['weather.rain', 0.5] };

  function L() { return SR.render.lib; }

  var keys = null, keysRef = null;
  var atCache = {};
  var sprites = { pool: null, cone: null, key: null };

  function num(v) { return typeof v === 'number' && isFinite(v); }

  /** Normalises SR.art.palette.sky ({ h, top, horizon, ambient, light } rows) into sorted minute keyframes. */
  function keyframes() {
    var p = SR.art && SR.art.palette;
    var sky = p && p.sky;
    if (keys && keysRef === sky) return keys;
    keysRef = sky;
    atCache = {};
    var out = [];
    function add(h, e) {
      if (!e || !num(h)) return;
      var top = e.top || (Array.isArray(e.sky) ? e.sky[0] : null);
      var hz = e.horizon || e.bottom || (Array.isArray(e.sky) ? e.sky[1] : null);
      if (!top || !hz) return;
      out.push({ min: h * 60, top: top, horizon: hz, ambient: e.ambient || top, light: num(e.light) ? e.light : 0 });
    }
    if (Array.isArray(sky)) {
      sky.forEach(function (e) {
        if (!e) return;
        var h = num(e.h) ? e.h : num(e.hour) ? e.hour : num(e.min) ? e.min / 60 : null;
        add(h, e);
      });
    } else if (sky && typeof sky === 'object') {
      Object.keys(sky).forEach(function (k) {
        var m = /^h?(\d+)(?:-(\d+))?$/.exec(k);
        if (!m) return;
        add(Number(m[1]), sky[k]);
        if (m[2]) add(Number(m[2]), sky[k]);
      });
    }
    out.sort(function (a, b) { return a.min - b.min; });
    if (!out.length) {
      SR.util.warnOnce('lighting.sky', 'SR.render.lighting: SR.art.palette.sky has no keyframes (a grey sky until it lands)');
      var g = L().grey(0.7);
      out = [{ min: 0, top: g, horizon: g, ambient: L().grey(1), light: 0 }];
    }
    keys = out;
    return keys;
  }

  /**
   * The sky at a game minute (ART_AUDIO §2.2), interpolated between keyframes, with the P1 weather
   * tints (Cloudy 30 % and Rain 50 % toward their greys; Rain's ambient × 0.9).
   * @param {number} min 0..1440
   * @param {string=} weather 'clear' (P0) | 'cloudy' | 'rain' | 'storm' | 'fog' | 'windy'
   * @returns {{top: string, horizon: string, ambient: string, light: number, white: boolean}}
   */
  function at(min, weather) {
    var k = keyframes();
    min = ((num(min) ? min : 720) % 1440 + 1440) % 1440;
    var key = Math.round(min * 4) / 4 + '|' + (weather || 'clear');
    if (atCache[key]) return atCache[key];
    var a = k[k.length - 1], b = k[0], am = a.min - 1440, bm = b.min;
    for (var i = 0; i < k.length; i++) {
      if (k[i].min <= min) { a = k[i]; am = k[i].min; b = k[(i + 1) % k.length]; bm = i + 1 < k.length ? b.min : b.min + 1440; }
    }
    if (min < k[0].min) { a = k[k.length - 1]; am = a.min - 1440; b = k[0]; bm = b.min; }
    var t = bm > am ? (min - am) / (bm - am) : 0;
    var out = {
      top: L().mix(a.top, b.top, t), horizon: L().mix(a.horizon, b.horizon, t),
      ambient: L().mix(a.ambient, b.ambient, t), light: a.light + (b.light - a.light) * t,
    };
    var wt = WEATHER_SKY[weather];
    if (wt && L().palHas(wt[0])) {
      var c = L().pal(wt[0]);
      out.top = L().mix(out.top, c, wt[1]);
      out.horizon = L().mix(out.horizon, c, wt[1]);
      if (weather === 'rain' || weather === 'storm') {
        var v = L().chan(out.ambient);
        out.ambient = L().hex(v[0] * 0.9, v[1] * 0.9, v[2] * 0.9);
      }
    }
    var amb = L().chan(out.ambient);
    out.white = amb[0] >= 254.5 && amb[1] >= 254.5 && amb[2] >= 254.5;
    if (Object.keys(atCache).length > 4000) atCache = {};
    atCache[key] = out;
    return out;
  }

  /** Drops the cached keyframes and sprites (a palette change). */
  function invalidate() { keys = null; keysRef = null; atCache = {}; sprites = { pool: null, cone: null, key: null }; }

  // ---------------------------------------------------------------------------------------------
  // Sprites (cached radial pool and headlight cone, ≤ 128 px)
  // ---------------------------------------------------------------------------------------------

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /** @returns {string} a colour's opaque hex with the alpha byte appended ('00' fully transparent). */
  function withAlpha(c, a) {
    var v = L().chan(c);
    var n = Math.round(L().clamp(a, 0, 1) * 255);
    return L().hex(v[0], v[1], v[2]) + (n < 16 ? '0' : '') + n.toString(16);
  }

  function ensureSprites() {
    var lamp = L().pal(['light.lampPool', 'light.lamp', 'glassLit'], 0.9);
    var head = L().pal(['light.headCone', 'light.head', 'glassLit'], 0.9);
    var key = lamp + head;
    if (sprites.key === key) return sprites;
    var S = 128;
    // Lamp pool: light.lampPool (55 % alpha) in the middle, fading to nothing (ART_AUDIO §3).
    var pool = makeCanvas(S, S), x = pool.getContext('2d');
    var la = L().alphaOf(lamp) < 1 ? L().alphaOf(lamp) : 0.55;
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, withAlpha(lamp, la));
    g.addColorStop(0.55, withAlpha(lamp, la * 0.5));
    g.addColorStop(1, withAlpha(lamp, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    // Headlight cone: apex at the left middle, 35° half angle, fading with distance.
    var cone = makeCanvas(S, S), y = cone.getContext('2d');
    var ha = L().alphaOf(head) < 1 ? L().alphaOf(head) : 0.35;
    var gc = y.createLinearGradient(0, S / 2, S, S / 2);
    gc.addColorStop(0, withAlpha(head, ha));
    gc.addColorStop(1, withAlpha(head, 0));
    y.fillStyle = gc;
    y.beginPath();
    y.moveTo(0, S / 2);
    y.lineTo(S, 0);
    y.lineTo(S, S);
    y.closePath();
    y.fill();
    sprites = { pool: pool, cone: cone, key: key };
    return sprites;
  }

  // ---------------------------------------------------------------------------------------------
  // Grade: one multiply fill over the sheet, its band and everything standing on it
  // ---------------------------------------------------------------------------------------------

  /** Step 6 (grade): multiplies the ambient over the sheet (not the sky, whose keyframes are final). */
  function grade(ctx, v, m) {
    var sky = v.sky;
    if (!sky || sky.white) return;
    var G = SR.render.ground && SR.render.ground.model ? SR.render.ground.model(m) : null;
    if (!G || !G.gradeBase) return;
    var path = new Path2D(G.gradeBase);
    // Buildings, props and people rise above the sheet's north edge into the sky: add their boxes.
    var B = SR.render.buildings, A = SR.render.actors;
    var list = m.buildings;
    for (var i = 0; i < list.length; i++) {
      var b = list[i].geom.bounds;
      if (b[2] < v.x0 || b[0] > v.x1 || b[3] < v.y0 || b[1] > v.y1) continue;
      path.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    }
    if (B && B.gradeRects) B.gradeRects(v, m, path);
    if (A && A.gradeRects) A.gradeRects(v, path);
    L().worldTransform(ctx, v);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = sky.ambient;
    ctx.fill(path);
    ctx.restore();
    L().count.fills++;
  }

  // ---------------------------------------------------------------------------------------------
  // Emissive
  // ---------------------------------------------------------------------------------------------

  function between(min, on, off) { return on > off ? (min >= on || min < off) : (min >= on && min < off); }

  function neonOn(id, i, t) {
    if (L().flashReduction()) return true;
    var sec = Math.floor(t);
    if (L().hash01('neon', id, i, sec) >= FLICKER_P) return true;
    var off = L().hash01('neonAt', id, i, sec) * (1 - FLICKER_MS / 1000);
    var f = t - sec;
    return f < off || f > off + FLICKER_MS / 1000;
  }

  /** Step 7 (emissive): additive light × the light factor. */
  function emissive(ctx, v, m) {
    var k = v.light;
    if (!(k > 0.01)) return;
    var B = SR.render.buildings, A = SR.render.actors;
    L().worldTransform(ctx, v);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = L().clamp(k, 0, 1) * WINDOW_GAIN;
    var pad = 40;
    // Lit windows: one batched path for every building in view.
    ctx.fillStyle = L().pal(['light.window', 'glassLit'], 0.9);
    ctx.beginPath();
    var n = 0, list = m.buildings;
    for (var i = 0; i < list.length; i++) {
      var bd = list[i].geom.bounds;
      if (bd[2] < v.x0 - pad || bd[0] > v.x1 + pad || bd[3] < v.y0 - pad || bd[1] > v.y1 + pad) continue;
      var lit = B && B.litWindows ? B.litWindows(list[i].id, v.min, v.day) : null;
      if (!lit) continue;
      var a = list[i].alpha;
      for (var w = 0; w < lit.length; w++) {
        var r = lit[w];
        if (r[0] > v.x1 || r[0] + r[2] < v.x0 || r[1] > v.y1 || r[1] + r[3] < v.y0) continue;
        if (a < 1 && ((w & 1) === 1)) continue;   // a faded building shows half its windows
        ctx.rect(r[0], r[1], r[2], r[3]);
        n++;
      }
    }
    if (n) { ctx.fill(); L().count.fills++; }
    ctx.globalAlpha = L().clamp(k, 0, 1);
    var sp = ensureSprites();
    // Neon (from 19:00): small cached sprites with a rare flicker.
    if (between(v.min, NEON_ON, NEON_OFF)) {
      for (var j = 0; j < list.length; j++) {
        var nb = list[j].geom.bounds;
        if (nb[2] < v.x0 || nb[0] > v.x1 || nb[3] < v.y0 || nb[1] > v.y1) continue;
        var ne = B && B.neon ? B.neon(list[j].id) : [];
        for (var q = 0; q < ne.length; q++) {
          if (!neonOn(list[j].id, q, v.t)) continue;
          ctx.drawImage(ne[q].sprite, ne[q].x, ne[q].y, ne[q].w, ne[q].h);
          L().count.images++;
        }
      }
    }
    if (between(v.min, LAMPS_ON, LAMPS_OFF)) {
      // Lamp pools and door light spills.
      var lamps = m.lamps || (m.lamps = m.props.filter(function (p) { return p.type === 'lamp'; }));
      for (var l = 0; l < lamps.length; l++) {
        var p = lamps[l];
        if (p.x < v.x0 - LAMP_R || p.x > v.x1 + LAMP_R || p.y < v.y0 - LAMP_R || p.y > v.y1 + LAMP_R) continue;
        ctx.drawImage(sp.pool, p.x - LAMP_R, p.y - LAMP_R * 0.7, LAMP_R * 2, LAMP_R * 1.4);
        ctx.drawImage(sp.pool, p.x - 12, p.y - 78, 24, 24);
        L().count.images += 2;
      }
      var doors = m.doors;
      for (var d = 0; d < doors.length; d++) {
        var dr = doors[d].door, f = String(dr.face || 'S').toUpperCase();
        var sx = dr.x + (f === 'E' ? 30 : f === 'W' ? -30 : 0), sy = dr.y + (f === 'S' ? 26 : f === 'N' ? -34 : 0);
        if (sx < v.x0 - SPILL_R || sx > v.x1 + SPILL_R || sy < v.y0 - SPILL_R || sy > v.y1 + SPILL_R) continue;
        ctx.drawImage(sp.pool, sx - SPILL_R, sy - SPILL_R * 0.7, SPILL_R * 2, SPILL_R * 1.4);
        L().count.images++;
      }
      var fo = m.wm.features && m.wm.features.fountain;
      if (fo && num(fo.x) && fo.x > v.x0 - 120 && fo.x < v.x1 + 120 && fo.y > v.y0 - 120 && fo.y < v.y1 + 120) {
        ctx.save();
        ctx.globalAlpha *= 0.8;
        ctx.drawImage(sp.pool, fo.x - (fo.r || 90), fo.y - (fo.r || 90) * 0.75, (fo.r || 90) * 2, (fo.r || 90) * 1.5);
        ctx.restore();
        L().count.images++;
      }
    }
    // Headlights and tail lights of the cars in view.
    var cars = A && A.cars ? A.cars() : null;
    if (cars && cars.length) {
      var tails = [];
      for (var c = 0; c < cars.length; c++) {
        var car = cars[c];
        var ang = num(car.a) ? car.a : 0;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        // The cone lies on the ground in front of the car, rotated to its heading.
        ctx.setTransform(v.ppu * ca, v.ppu * sa, -v.ppu * sa, v.ppu * ca, car.x * v.ppu + v.tx, car.y * v.ppu + v.ty);
        ctx.drawImage(sp.cone, 40, -CONE_LEN * Math.tan(CONE_HALF), CONE_LEN, 2 * CONE_LEN * Math.tan(CONE_HALF));
        L().count.images++;
        tails.push(car.x - ca * 46 - sa * 14, car.y - 8 - sa * 46 + ca * 14, car.x - ca * 46 + sa * 14, car.y - 8 - sa * 46 - ca * 14);
      }
      L().worldTransform(ctx, v);
      ctx.fillStyle = L().pal(['light.tail', 'ui.hp'], 0.4);
      ctx.beginPath();
      for (var tt = 0; tt < tails.length; tt += 2) ctx.rect(tails[tt] - 3, tails[tt + 1] - 2, 6, 4);
      ctx.fill();
      L().count.fills++;
    }
    ctx.restore();
    L().worldTransform(ctx, v);
  }

  // ---------------------------------------------------------------------------------------------
  // Post: the edge-danger vignette (GDD §3.9) and the hit flash
  // ---------------------------------------------------------------------------------------------

  function nearestEdge(x, y) {
    var G = SR.world && SR.world.geometry;
    if (G && G.built && typeof G.nearestEdge === 'function') {
      var e = G.nearestEdge(x, y, { railed: false });
      if (e) return { d: e.d, nx: e.nx, ny: e.ny };
    }
    var R = SR.render.ground;
    return R && R.edgeInfo ? R.edgeInfo(x, y) : null;
  }

  /** Step 9 (post): the vignette toward a near unrailed edge (off with Reduced Motion) and the hit flash. */
  function post(ctx, v, m) {
    var A = SR.render.actors;
    var p = A && A.playerPos ? A.playerPos() : null;
    var assist = L().setting('access.safeEdges', false);
    if (p && !assist && !L().reducedMotion()) {
      var warn = v.weather === 'fog' ? EDGE_WARN_FOG : EDGE_WARN;
      var e = nearestEdge(p.x, p.y);
      if (e && e.d < warn) {
        var k = 1 - e.d / warn;
        L().stageTransform(ctx, v);
        var W = v.W, H = v.H, s = 220;
        var x0 = e.nx > 0.5 ? W - s : 0, x1 = e.nx > 0.5 ? W : e.nx < -0.5 ? s : W;
        var y0 = e.ny > 0.5 ? H - s : 0, y1 = e.ny > 0.5 ? H : e.ny < -0.5 ? s : H;
        var gx0 = e.nx > 0.5 ? W - s : e.nx < -0.5 ? s : W / 2, gx1 = e.nx > 0.5 ? W : e.nx < -0.5 ? 0 : W / 2;
        var gy0 = e.ny > 0.5 ? H - s : e.ny < -0.5 ? s : H / 2, gy1 = e.ny > 0.5 ? H : e.ny < -0.5 ? 0 : H / 2;
        var vc = L().pal(['fx.vignette', 'ink'], 0.1);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = edgeGradient(ctx, gx0, gy0, gx1, gy1, vc);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
        L().count.fills++;
      }
    }
    var fx = SR.render.fx;
    var fl = fx && fx.flashAlpha ? fx.flashAlpha() : 0;
    if (fl > 0) {
      L().stageTransform(ctx, v);
      ctx.save();
      ctx.globalAlpha = fl;
      ctx.fillStyle = L().pal(['fx.flash', 'white'], 1);
      ctx.fillRect(0, 0, v.W, v.H);
      ctx.restore();
      L().count.fills++;
    }
  }

  /** A gradient from transparent (the inner side) to the colour at its own alpha (the screen edge). */
  function edgeGradient(ctx, x0, y0, x1, y1, colour) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    var a = L().alphaOf(colour) < 1 ? L().alphaOf(colour) : 0.4;
    g.addColorStop(0, withAlpha(colour, 0));
    g.addColorStop(1, withAlpha(colour, a));
    return g;
  }

  /** @returns {object} lighting sprite sizes in device px. */
  function stats() {
    var px = 0;
    if (sprites.pool) px += sprites.pool.width * sprites.pool.height;
    if (sprites.cone) px += sprites.cone.width * sprites.cone.height;
    return { px: px, keyframes: keys ? keys.length : 0 };
  }

  SR.render.lighting = {
    at: at,
    grade: grade,
    emissive: emissive,
    post: post,
    keyframes: keyframes,
    invalidate: invalidate,
    stats: stats,
    LAMPS_ON: LAMPS_ON,
    NEON_ON: NEON_ON,
  };
})();
