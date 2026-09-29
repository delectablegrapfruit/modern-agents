// js/render/sky.js — owner: W1-G (W3-Light in wave 3). The sky under the sheet (ARCHITECTURE §9.1
// step 1, ART_AUDIO §2.2, §4): the hour's gradient cached in a small canvas and repainted every 5
// game minutes or on a weather change, stars, the sun, the moon (and day 1's comet), the six
// distant islands and the Sky Ribbon (placeholders until js/art/skyline.js draws them), three
// cut-paper cloud layers (parallax 0.3 / 0.5 / 0.7) and the sheet's soft shadow on the nearest
// layer; plus SR.render.sky.drawWindow(ctx, rect) for the live-sky windows of interiors.
(function () {
  'use strict';
  var SR = window.SR;

  var SLOT_MIN = 5;                       // gradient repaint step (game minutes)
  var LAYERS = [0.3, 0.5, 0.7];           // cloud parallax (ART_AUDIO §4)
  var LAYER_TILE = [2600, 1900];          // a layer's cloud pattern repeats every tile (layer units)
  var CLOUDS_PER_LAYER = 9;
  var DRIFT = [5, 9, 14];                 // u/s of drift per layer
  var ISLAND_PARALLAX = 0.15;
  var STAR_TILE = 512;

  function L() { return SR.render.lib; }

  var cache = { grad: null, gradKey: null, gradFill: null, skipped: 0, stars: null, clouds: {}, cloudKey: null, islands: {}, islandKey: null, shadow: null, shadowModel: null };

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /** Drops the sky caches (a palette, weather or quality change). */
  function invalidate() {
    cache = { grad: null, gradKey: null, gradFill: null, skipped: 0, stars: null, clouds: {}, cloudKey: null, islands: {}, islandKey: null, shadow: null, shadowModel: null };
  }

  function colours(min, weather) {
    var Li = SR.render.lighting;
    return Li && Li.at ? Li.at(min, weather) : null;
  }

  function gradient(sky) {
    var key = sky.top + sky.horizon;
    if (cache.grad && cache.gradKey === key) return cache.grad;
    var c = cache.grad || makeCanvas(2, 256);
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.horizon);
    x.fillStyle = g;
    x.fillRect(0, 0, 2, 256);
    cache.grad = c;
    cache.gradKey = key;
    return c;
  }

  /** A CanvasGradient top → horizon over the stage height, cached per context and colours. */
  function gradientFill(ctx, sky, H) {
    var key = sky.top + sky.horizon + H;
    var gc = cache.gradFill;
    if (gc && gc.ctx === ctx && gc.key === key) return gc.g;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.horizon);
    cache.gradFill = { ctx: ctx, key: key, g: g };
    return g;
  }

  function stars() {
    if (cache.stars) return cache.stars;
    var c = makeCanvas(STAR_TILE, STAR_TILE);
    var x = c.getContext('2d');
    x.fillStyle = L().pal(['light.star', 'white'], 1);
    for (var i = 0; i < 140; i++) {
      var sx = L().hash01('star', i, 'x') * STAR_TILE, sy = L().hash01('star', i, 'y') * STAR_TILE;
      var r = 0.6 + L().hash01('star', i, 'r') * 1.3;
      x.globalAlpha = 0.45 + L().hash01('star', i, 'a') * 0.55;
      x.beginPath();
      x.arc(sx, sy, r, 0, Math.PI * 2);
      x.fill();
    }
    cache.stars = c;
    return c;
  }

  /** A cut-paper cloud: flat white bumps with a 1 u grey underside line (ART_AUDIO §4), pre-tinted by the ambient. */
  function cloudSprite(variant, ambient) {
    var key = variant + '|' + ambient;
    if (cache.clouds[key]) return cache.clouds[key];
    if (Object.keys(cache.clouds).length >= 36) cache.clouds = {};   // tints of past hours
    var W = 320, H = 150;
    var c = makeCanvas(W, H);
    var x = c.getContext('2d');
    var body = L().mul(L().pal(['cloud', 'white'], 1), ambient);
    var line = L().mul(L().pal(['cloudLine', 'sidewalk'], 0.8), ambient);
    var n = 4 + Math.floor(L().hash01('cloud', variant, 'n') * 3);
    x.fillStyle = body;
    x.beginPath();
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var cx = 40 + t * (W - 80), r = 28 + L().hash01('cloud', variant, i) * 36 * Math.sin(Math.PI * (0.25 + 0.5 * t));
      r = Math.min(r, cx - 2, W - cx - 2);            // the bumps stay inside the sprite
      var cy = Math.max(r + 2, H - 36 - r * 0.6);
      x.moveTo(cx + r, cy);
      x.arc(cx, cy, r, 0, Math.PI * 2);
    }
    x.rect(30, H - 46, W - 60, 22);
    x.fill();
    x.fillStyle = line;
    x.fillRect(30, H - 25, W - 60, 2);
    cache.clouds[key] = c;
    return c;
  }

  function islandShadow(m) {
    if (cache.shadow && cache.shadowModel === m) return cache.shadow;
    var G = SR.render.ground && SR.render.ground.model ? SR.render.ground.model(m) : null;
    var b = m.bbox, k = 1 / 16;
    var c = makeCanvas((b[2] - b[0]) * k + 16, (b[3] - b[1]) * k + 16);
    var x = c.getContext('2d');
    x.translate(8, 8);
    x.scale(k, k);
    x.translate(-b[0], -b[1]);
    x.filter = 'blur(3px)';
    x.fillStyle = L().solid(L().pal(['cloudShadow', 'ink'], 0.1));
    if (G && G.land) x.fill(G.land);
    else if (m.wm.outline) {
      x.beginPath();
      m.wm.outline.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
      x.closePath();
      x.fill();
    }
    cache.shadow = { canvas: c, k: k, x0: b[0] - 8 / k, y0: b[1] - 8 / k };
    cache.shadowModel = m;
    return cache.shadow;
  }

  // ---------------------------------------------------------------------------------------------
  // Distant islands and the Sky Ribbon (placeholders; SR.art.skyline.draw replaces them)
  // ---------------------------------------------------------------------------------------------

  function islandSprite(city, ambient) {
    var key = city + '|' + ambient;
    if (cache.islands[key]) return cache.islands[key];
    if (Object.keys(cache.islands).length >= 24) cache.islands = {};
    var W = 360, H = 240;
    var c = makeCanvas(W, H);
    var x = c.getContext('2d');
    var pk = 'city.' + city + '.';
    function col(k, fb) { return L().mul(L().pal([pk + k, fb], 0.7), ambient); }
    // The paper slab: a torn ellipse with its thickness band.
    x.beginPath();
    for (var i = 0; i <= 40; i++) {
      var a = i / 40 * Math.PI * 2, r = 1 + (L().hash01(city, 'edge', i) - 0.5) * 0.08;
      var px = W / 2 + Math.cos(a) * 150 * r, py = H * 0.72 + Math.sin(a) * 34 * r;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
    x.save();
    x.translate(0, 12);
    x.fillStyle = col('trim', 'strata2');
    x.fillStyle = L().mul(L().pal('strata2', 0.5), ambient);
    x.fill();
    x.restore();
    x.fillStyle = col('ground', 'paperEdge');
    x.fill();
    // Skyline: towers in the city's colours (each city a silhouette of its own; W2-Exterior draws the real ones).
    var n = 6 + Math.floor(L().hash01(city, 'n') * 4);
    var lights = [];
    for (var k = 0; k < n; k++) {
      var bw = 18 + L().hash01(city, k, 'w') * 26, bh = 30 + L().hash01(city, k, 'h') * 90;
      var bx = W / 2 - 120 + (k + 0.5) * (240 / n) - bw / 2, by = H * 0.72 - bh;
      x.fillStyle = col(k % 3 ? 'base' : 'tower', 'stone');
      x.fillRect(bx, by, bw, bh);
      x.fillStyle = col('roof', 'stoneShade');
      x.beginPath();
      if (L().hash01(city, k, 'roof') < 0.5) { x.moveTo(bx - 2, by); x.lineTo(bx + bw / 2, by - bw * 0.6); x.lineTo(bx + bw + 2, by); }
      else x.rect(bx - 2, by - 5, bw + 4, 5);
      x.fill();
      for (var wy = by + 8; wy < by + bh - 6; wy += 12) lights.push([bx + bw / 2 - 1.5, wy]);
    }
    x.strokeStyle = L().mul(L().pal('ink', 0.1), ambient);
    x.globalAlpha = 0.5;
    x.lineWidth = 1.5;
    x.stroke();
    cache.islands[key] = { canvas: c, w: W, h: H, lights: lights };
    return cache.islands[key];
  }

  function islandScreen(v, m, isl) {
    var b = m.bbox, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var p = typeof isl.parallax === 'number' ? isl.parallax : ISLAND_PARALLAX;
    var zk = 0.75 + 0.25 * v.zoom;
    return {
      x: v.W / 2 + ((cx - v.x) + isl.x) * p * zk,
      y: v.H / 2 + ((cy - v.y) + isl.y) * p * zk,
      s: (isl.scale || 0.5) * zk,
    };
  }

  function drawIslands(ctx, v, m, sky) {
    var list = m.wm.skyIslands || [];
    var ambient = sky.ambient;
    var S = SR.art.skyline;
    if (S && typeof S.draw === 'function') {
      try { S.draw(ctx, v, m.wm); return; } catch (e) { SR.util.warnOnce('sky.skyline', 'SR.render.sky: SR.art.skyline.draw threw: ' + e.message); }
    }
    var pos = {};
    for (var i = 0; i < list.length; i++) {
      var isl = list[i];
      var s = islandScreen(v, m, isl);
      pos[isl.city] = s;
      var spr = islandSprite(isl.city, ambient);
      var w = spr.w * s.s, h = spr.h * s.s;
      if (s.x + w < 0 || s.x - w > v.W || s.y + h < 0 || s.y - h > v.H) continue;
      ctx.drawImage(spr.canvas, s.x - w / 2, s.y - h * 0.72, w, h);
      L().count.images++;
      if (v.light > 0.2) pinpricks(ctx, spr, isl.city, s.x - w / 2, s.y - h * 0.72, s.s, v);
    }
    ribbon(ctx, v, m, pos, sky);
    return pos;
  }

  /** The distant islands' pinprick lights at night (ART_AUDIO §3), additive × the light factor. */
  function pinpricks(ctx, spr, city, x0, y0, k, v) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = L().clamp(v.light, 0, 1);
    ctx.fillStyle = L().pal(['city.' + city + '.window', 'light.pinprick', 'glassLit'], 0.9);
    ctx.beginPath();
    var r = Math.max(0.8, 2.2 * k);
    for (var i = 0; i < spr.lights.length; i++) {
      if (L().ihash(i, city.length, 7) < 0.45) continue;
      var p = spr.lights[i];
      ctx.rect(x0 + p[0] * k, y0 + p[1] * k, r, r);
    }
    ctx.fill();
    ctx.restore();
    L().count.fills++;
  }

  /** The Sky Ribbon: a paper strip road curling from under the Bus Hole to Port Eraser and Las Pegas. */
  function ribbon(ctx, v, m, pos, sky) {
    var R = m.wm.skyRibbon;
    if (!R || !Array.isArray(R.from)) return;
    // It starts under the Bus Hole (the hole's centre) and dives south-east beneath the sheet.
    var hole = (m.wm.holes || [])[0];
    var hr = hole && L().rectOf(hole.rect);
    var fx = hr ? (hr[0] + hr[2]) / 2 : R.from[0], fy = hr ? (hr[1] + hr[3]) / 2 : R.from[1];
    var start = { x: (fx * v.ppu + v.tx) / v.s, y: (fy * v.ppu + v.ty) / v.s };
    var paper = L().mul(L().pal('paperEdge', 0.93), sky.ambient);
    var edge = L().mul(L().pal('strata1', 0.7), sky.ambient);
    var dash = L().mul(L().pal('lanePaint', 0.85), sky.ambient);
    (R.to || []).forEach(function (city, k) {
      var e = pos[city];
      if (!e) return;
      var ex = e.x, ey = e.y + 8 * e.s;
      var c1x = start.x + 120 * v.zoom, c1y = start.y + 520 * v.zoom;
      var c2x = ex - 160 * e.s, c2y = ey + (k ? 90 : -40) * e.s;
      if (Math.max(start.x, ex, c1x) < -50 || Math.min(start.x, ex) > v.W + 50) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = edge;
      ctx.lineWidth = 34 * v.zoom;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey); ctx.stroke();
      ctx.strokeStyle = paper;
      ctx.lineWidth = 28 * v.zoom;
      ctx.stroke();
      ctx.strokeStyle = dash;
      ctx.lineWidth = 2.5 * v.zoom;
      ctx.setLineDash([10 * v.zoom, 12 * v.zoom]);
      ctx.lineDashOffset = -v.t * 30;
      ctx.stroke();
      ctx.restore();
      // Tiny buses riding the ribbon.
      for (var b = 0; b < 2; b++) {
        var tt = ((v.t * 0.03 + b * 0.5 + k * 0.23) % 1);
        var u = 1 - tt;
        var bx = u * u * u * start.x + 3 * u * u * tt * c1x + 3 * u * tt * tt * c2x + tt * tt * tt * ex;
        var by = u * u * u * start.y + 3 * u * u * tt * c1y + 3 * u * tt * tt * c2y + tt * tt * tt * ey;
        var sz = (1 - tt) * 10 * v.zoom + tt * 4 * e.s;
        ctx.fillStyle = L().mul(L().pal(['car.skybus', 'paperEdge'], 0.9), sky.ambient);
        ctx.fillRect(bx - sz, by - sz * 0.5, sz * 2, sz);
        ctx.fillStyle = L().mul(L().pal(['car.skybusStripe', 'bld.bus.walls'], 0.6), sky.ambient);
        ctx.fillRect(bx - sz, by - sz * 0.1, sz * 2, sz * 0.25);
        L().count.fills += 2;
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The sky pass
  // ---------------------------------------------------------------------------------------------

  function sunMoon(ctx, v, sky, W, H, x0, y0) {
    var min = v.min;
    // The sun crosses from the east (06:00) to the west (20:00); the moon from 20:00 to 06:00.
    var day = min >= 360 && min <= 1200;
    var t = day ? (min - 360) / 840 : ((min >= 1200 ? min - 1200 : min + 240) / 600);
    var px = x0 + W * (0.85 - 0.7 * t), py = y0 + H * (0.34 - 0.24 * Math.sin(Math.PI * t));
    if (day) {
      var c = L().pal(['light.window', 'glassLit'], 0.9);
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(px, py, 42, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(px, py, 24, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      L().count.fills += 2;
    } else {
      ctx.save();
      ctx.fillStyle = L().pal(['light.moon', 'paperEdge'], 0.95);
      ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sky.top;
      ctx.beginPath(); ctx.arc(px + 9, py - 5, 17, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      L().count.fills += 2;
      if (v.day === 1 && (min >= 1200 || min < 300)) {
        // Day 1's comet (a nod to the original's night sky).
        var cx = x0 + W * 0.22, cy = y0 + H * 0.16;
        ctx.save();
        var g = ctx.createLinearGradient(cx, cy, cx + 120, cy - 44);
        g.addColorStop(0, L().pal(['light.star', 'white'], 1));
        g.addColorStop(1, sky.top);
        ctx.strokeStyle = g;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 120, cy - 44); ctx.stroke();
        ctx.fillStyle = L().pal(['light.star', 'white'], 1);
        ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        L().count.fills++;
      }
    }
  }

  function drawStars(ctx, sky, W, H, ox, oy) {
    var a = L().clamp((sky.light - 0.35) / 0.65, 0, 1);
    if (a <= 0) return;
    var st = stars();
    ctx.save();
    ctx.globalAlpha = a;
    var sx = ((ox % STAR_TILE) + STAR_TILE) % STAR_TILE, sy = ((oy % STAR_TILE) + STAR_TILE) % STAR_TILE;
    for (var x = -sx; x < W; x += STAR_TILE) {
      for (var y = -sy; y < H; y += STAR_TILE) { ctx.drawImage(st, x, y); L().count.images++; }
    }
    ctx.restore();
  }

  function drawClouds(ctx, v, m, sky, layers) {
    var zk = 0.7 + 0.3 * v.zoom;
    for (var li = 0; li < layers.length; li++) {
      var p = layers[li];
      var TW = LAYER_TILE[0], TH = LAYER_TILE[1];
      var ox = v.x * p - v.t * DRIFT[li], oy = v.y * p;
      var scale = (0.55 + p * 0.65) * zk;
      if (li === layers.length - 1) sheetShadow(ctx, v, m);
      for (var k = 0; k < CLOUDS_PER_LAYER; k++) {
        var lx = L().hash01('cl', li, k, 'x') * TW, ly = L().hash01('cl', li, k, 'y') * TH;
        var spr = cloudSprite(Math.floor(L().hash01('cl', li, k, 'v') * 6), sky.ambient);
        var w = spr.width * scale * (0.8 + L().hash01('cl', li, k, 's') * 0.6), h = spr.height * w / spr.width;
        // Screen position, wrapped into the tile around the view.
        var sx = ((lx - ox) % TW + TW) % TW - w, sy = ((ly - oy) % TH + TH) % TH - h;
        for (var ix = sx; ix < v.W + w; ix += TW) {
          for (var iy = sy; iy < v.H + h; iy += TH) {
            if (ix + w < 0 || iy + h < 0) continue;
            ctx.drawImage(spr, ix, iy, w, h);
            L().count.images++;
          }
        }
      }
    }
  }

  function sheetShadow(ctx, v, m) {
    var sh = islandShadow(m);
    var p = 0.9, dy = 70;
    // The shadow falls on the nearest cloud layer, slightly behind the sheet.
    var sx = v.W / 2 + (sh.x0 - v.x) * v.zoom * p, sy = v.H / 2 + (sh.y0 - v.y) * v.zoom * p + dy * v.zoom;
    var w = sh.canvas.width / sh.k * v.zoom * p, h = sh.canvas.height / sh.k * v.zoom * p;
    ctx.save();
    // A soft shadow: the cloudShadow entry's own alpha (10 %), a little stronger to read on white clouds.
    var a = L().alphaOf(L().pal(['cloudShadow', 'ink'], 0.1));
    ctx.globalAlpha = Math.min(0.3, (a < 1 ? a : 0.1) * 1.8);
    ctx.drawImage(sh.canvas, sx, sy, w, h);
    ctx.restore();
    L().count.images++;
  }

  /**
   * Draws the sky for a frame (stage transform, screen space).
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} v the frame's view (SR.render.lastView())
   * @param {object|null} m the render model
   */
  function draw(ctx, v, m) {
    var live = v.sky || colours(v.min, v.weather);
    if (!live) return;
    // Cached pieces (the gradient, tinted clouds and islands) follow the sky every 5 game minutes.
    var sky = colours(Math.floor(v.min / SLOT_MIN) * SLOT_MIN, v.weather) || live;
    // When the sheet covers the whole view, no sky can show: skip the pass (its full-screen fills
    // would be painted over by the ground chunks).
    var G = SR.render.ground;
    if (m && G && G.skyVisible && !G.skyVisible(v)) { cache.skipped++; return; }
    L().stageTransform(ctx, v);
    var W = v.W, H = v.H;
    ctx.fillStyle = gradientFill(ctx, sky, H);
    ctx.fillRect(0, 0, W, H);
    L().count.fills++;
    drawStars(ctx, sky, W, H, v.x * 0.03, v.y * 0.03);
    sunMoon(ctx, v, sky, W, H, 0, 0);
    if (!m) return;
    drawIslands(ctx, v, m, sky);
    drawClouds(ctx, v, m, sky, LAYERS);
  }

  /**
   * Draws the live sky into a window of an interior (ARCHITECTURE §9.2): the hour's gradient,
   * sun or moon and stars, a few drifting clouds, and rain streaks on the glass in rain.
   * @param {CanvasRenderingContext2D} ctx any context (its current transform is used)
   * @param {{x: number, y: number, w: number, h: number}|number[]} rect the window, [x, y, w, h] or an object
   */
  function drawWindow(ctx, rect) {
    var r = Array.isArray(rect) ? { x: rect[0], y: rect[1], w: rect[2], h: rect[3] } : rect;
    if (!r || !(r.w > 0) || !(r.h > 0)) return;
    var clk = SR.render.lib.tick ? SR.render.lib.tick() : { min: 720, day: 1, weather: 'clear' };
    var sky = colours(Math.floor(clk.min / SLOT_MIN) * SLOT_MIN, clk.weather);
    if (!sky) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(gradient(sky), 0, 0, 2, 256, r.x, r.y, r.w, r.h * 1.6);
    var fake = { min: clk.min, day: clk.day };
    drawStars(ctx, sky, r.w, r.h, -r.x, -r.y);
    sunMoon(ctx, fake, sky, r.w, r.h, r.x, r.y);
    var t = L().now();
    for (var k = 0; k < 3; k++) {
      var spr = cloudSprite(k + 1, sky.ambient);
      var w = r.w * (0.45 + 0.1 * k), h = spr.height * w / spr.width;
      var span = r.w + w;
      var cx = r.x - w + ((L().hash01('win', k) * span + t * (6 + 3 * k)) % span);
      ctx.drawImage(spr, cx, r.y + r.h * (0.18 + 0.22 * k), w, h);
    }
    if (clk.weather === 'rain' || clk.weather === 'storm') {
      ctx.strokeStyle = L().pal(['weather.streak', 'waterHi'], 0.85);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = 0; i < 24; i++) {
        var sx = r.x + L().hash01('rain', i, 'x') * r.w, sy = r.y + ((L().hash01('rain', i, 'y') * r.h + t * 180) % r.h);
        ctx.moveTo(sx, sy); ctx.lineTo(sx - 4, sy + 14);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** @returns {object} sky cache sizes in device px and bytes (the "sky and clouds ≤ 6 MB" budget). */
  function stats() {
    var px = 0;
    if (cache.grad) px += cache.grad.width * cache.grad.height;
    if (cache.stars) px += cache.stars.width * cache.stars.height;
    Object.keys(cache.clouds).forEach(function (k) { px += cache.clouds[k].width * cache.clouds[k].height; });
    Object.keys(cache.islands).forEach(function (k) { px += cache.islands[k].canvas.width * cache.islands[k].canvas.height; });
    if (cache.shadow) px += cache.shadow.canvas.width * cache.shadow.canvas.height;
    return { px: px, bytes: px * 4, clouds: Object.keys(cache.clouds).length, islands: Object.keys(cache.islands).length, skipped: cache.skipped };
  }

  SR.render.sky = {
    draw: draw,
    drawWindow: drawWindow,
    /** @returns {{top: string, horizon: string, ambient: string, light: number}} the sky at a game minute. */
    colors: colours,
    invalidate: invalidate,
    stats: stats,
    LAYERS: LAYERS,
  };
})();
