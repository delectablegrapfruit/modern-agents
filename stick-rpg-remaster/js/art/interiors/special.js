// js/art/interiors/special.js — owner: W2-Transit. SR.def.interior: the special rooms of ART_AUDIO §9
// (no proprietor): 'jail' (bars, a cot, a calendar with tally marks, a barred window high up),
// 'hospital' (a curtain, a heart monitor, the bed at Stick General) and 'trip' (the trip card's
// backdrop: the destination's skyline on its floating island, the Sky Ribbon and the Sky Bus at the
// stop; params.city picks the city, params.min the hour of the postcard).
// The island painter is shared with the trip scene (js/scenes/bustrip.js draws the approaching and
// receding islands with it): SR.reg.interior.trip.fns.island(ctx, cityId, x, y, scale, t, opts),
// opts { night, still }; fns.islandSprite(cityId, scale, night, px) bakes a still far island once
// (the ride's distant cities: one drawImage each). Every city has its own silhouette (ART_AUDIO §4; data/cities.js
// art.silhouette): crayons as towers, chimneys, sequin towers, windmills, pink eraser blocks,
// clothes-peg towers, in the city's palette keys city.<id>.*.
// Colours are palette keys only. Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var ISLAND_W = 640;          // the island's width at scale 1 (u)
  var ISLAND_BOX = { l: -380, t: -400, w: 760, h: 780 };   // every silhouette's bounds around (x, y) at scale 1 (u)
  var SEQUIN_LEVELS = 4;       // the sequins' twinkle in alpha steps (one fill per colour and step)
  var LAYOUTS = {};            // per city: the seeded building layout, built once
  var TAU = Math.PI * 2;

  function col(k) { return SR.art.draw.color(k); }
  function tone(k, n) { return SR.art.draw.tone(col(k), n); }
  function ink(ctx, lw) { ctx.lineWidth = lw; ctx.strokeStyle = col('inkLine'); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function fillInk(ctx, fill, lw) { ctx.fillStyle = fill; ctx.fill(); if (lw) ink(ctx, lw); }
  function box(ctx, x, y, w, h, fill, lw) { ctx.beginPath(); ctx.rect(x, y, w, h); fillInk(ctx, fill, lw); }
  function tri(ctx, x0, y0, x1, y1, x2, y2, fill, lw) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); fillInk(ctx, fill, lw);
  }
  function dot(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fillInk(ctx, fill, lw); }

  /** The silhouette kind of a city (data/cities.js), with a fallback for an unknown id. */
  function silhouetteOf(id) {
    var def = SR.reg.city && SR.reg.city[id];
    return def && def.art && def.art.silhouette ? def.art.silhouette : 'crayons';
  }

  /**
   * The seeded layout of an island: its buildings (kind, x offset, width, height, colour role),
   * the torn underside and a few trees. Built once per city from hash('island', id).
   */
  function layout(id) {
    if (LAYOUTS[id]) return LAYOUTS[id];
    var rng = SR.rng.create(SR.util.hash('island', id));
    var kind = silhouetteOf(id);
    var L = { kind: kind, items: [], under: [], trees: [] };
    var n = { crayons: 7, chimneys: 5, sequins: 5, windmills: 5, erasers: 5, pegs: 5 }[kind] || 6;
    var roles = ['tower', 'roof', 'accent', 'trim'];
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n;
      var x = (u - 0.5) * ISLAND_W * 0.78 + rng.int(-10, 10);
      var it = { x: x, z: rng.int(-18, 18), w: 44, h: 120, role: roles[i % roles.length], phase: rng.float(0, TAU) };
      switch (kind) {
        case 'crayons': it.w = rng.int(32, 40); it.h = rng.int(120, 230); break;
        case 'chimneys': it.w = rng.int(80, 110); it.h = rng.int(60, 90); it.stack = i % 2 === 0; it.sh = rng.int(130, 190); break;
        case 'sequins': it.w = rng.int(54, 72); it.h = rng.int(140, 240); break;
        case 'windmills': it.mill = i % 2 === 1; it.w = it.mill ? 46 : rng.int(62, 80); it.h = it.mill ? rng.int(120, 150) : rng.int(46, 64); break;
        case 'erasers': it.w = rng.int(78, 104); it.h = rng.int(70, 150); break;
        case 'pegs': it.w = rng.int(34, 42); it.h = rng.int(150, 230); break;
        default: break;
      }
      L.items.push(it);
    }
    // Back row first (smaller z is farther), so nearer buildings overlap the farther ones.
    L.items.sort(function (a, b) { return a.z - b.z; });
    for (var k = 0; k <= 14; k++) L.under.push(rng.int(-18, 18));
    for (var tr = 0; tr < 4; tr++) L.trees.push({ x: rng.int(-ISLAND_W * 0.44, ISLAND_W * 0.44), r: rng.int(12, 20) });
    LAYOUTS[id] = L;
    return L;
  }

  /** The torn paper underside of an island and its top surface (x, y: the top's centre). */
  function slab(ctx, id, L, x, y, s, lw) {
    var W = ISLAND_W * s, hw = W / 2, depth = W * 0.46, rim = 18 * s;
    var pts = [];
    var n = L.under.length - 1;
    for (var i = 0; i <= n; i++) {
      var u = i / n, bulge = Math.sin(u * Math.PI);
      pts.push(x - hw + u * W, y + rim + bulge * depth + L.under[i] * s * bulge);
    }
    // the strata cone: three bands of paper under the rim
    var bands = [['strata2', 1], ['strata1', 0.72], ['paperEdge', 0.36]];
    bands.forEach(function (b) {
      ctx.beginPath();
      ctx.moveTo(x - hw, y);
      for (var j = 0; j < pts.length; j += 2) {
        var py = y + rim + (pts[j + 1] - y - rim) * b[1];
        ctx.lineTo(pts[j], py);
      }
      ctx.lineTo(x + hw, y);
      ctx.closePath();
      fillInk(ctx, col(b[0]), lw);
    });
    // the rim band and the top surface
    ctx.beginPath();
    ctx.ellipse(x, y + rim * 0.5, hw, W * 0.09 + rim * 0.5, 0, 0, Math.PI);
    fillInk(ctx, col('paperEdge'), lw);
    ctx.beginPath();
    ctx.ellipse(x, y, hw, W * 0.09, 0, 0, TAU);
    fillInk(ctx, col('city.' + id + '.ground'), lw);
  }

  /** A grid of windows as one path and one fill (a sequin tower's worth of fillRects would pass the fill budget). */
  function windows(ctx, x, y, w, h, s, lit, key) {
    var ws = 7 * s, gap = 16 * s, any = false;
    ctx.beginPath();
    for (var wy = y + gap; wy < y + h - gap; wy += gap * 1.3) {
      for (var wx = x + gap * 0.6; wx < x + w - ws - gap * 0.4; wx += gap) { ctx.rect(wx, wy, ws, ws); any = true; }
    }
    if (!any) return;
    ctx.fillStyle = col(lit ? 'light.window' : key);
    ctx.fill();
  }

  /**
   * A sequin tower's sequins, batched: the twinkle is quantised to SEQUIN_LEVELS alpha steps and each
   * (colour, step) pair is one path and one fill, so a tower costs at most 2 × SEQUIN_LEVELS fills
   * instead of one per sequin (ARCHITECTURE §17: ≤ 250 path fills per frame).
   */
  function sequins(ctx, K, x0, top, w, by, s, t, it, still) {
    var step = 11 * s, r = 3.4 * s, idx = 0, sets = {};
    for (var sy = top + step; sy < by - step * 0.5; sy += step) {
      for (var sx = x0 + step * 0.6 + ((idx % 2) * step * 0.5); sx < x0 + w - step * 0.3; sx += step) {
        var tw = still ? 1 : 0.55 + 0.45 * Math.sin(t * 3 + sx * 0.07 + sy * 0.05 + it.phase);
        var lvl = Math.max(1, Math.round(tw * SEQUIN_LEVELS));
        var k = ((idx + Math.round(sx)) % 3 === 0 ? 'trim' : 'accent') + lvl;
        (sets[k] || (sets[k] = [])).push(sx, sy);
      }
      idx++;
    }
    Object.keys(sets).forEach(function (k) {
      var pts = sets[k], lvl = Number(k.slice(-1));
      ctx.save();
      ctx.globalAlpha *= lvl / SEQUIN_LEVELS;
      ctx.fillStyle = col(K + k.slice(0, -1));
      ctx.beginPath();
      for (var i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + r, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], r, 0, TAU); }
      ctx.fill();
      ctx.restore();
    });
  }

  /** One building of an island at (bx, by): its base on the top surface. */
  function building(ctx, id, L, it, bx, by, s, t, o, lw) {
    var K = 'city.' + id + '.';
    var w = it.w * s, h = it.h * s, x0 = bx - w / 2, top = by - h;
    var main = K + it.role, base = K + 'base';
    switch (L.kind) {
      case 'crayons': {
        box(ctx, x0, top, w, h, col(main), lw);
        box(ctx, x0, top + h * 0.55, w, h * 0.22, col(base), lw);                 // the paper wrapper
        box(ctx, x0, top + h * 0.62, w, h * 0.04, tone(main, -1), 0);
        tri(ctx, x0, top, x0 + w, top, bx, top - w * 1.1, tone(main, -1), lw);   // the sharpened tip
        tri(ctx, bx - w * 0.18, top - w * 0.9, bx + w * 0.18, top - w * 0.9, bx, top - w * 1.1, col(main), 0);
        windows(ctx, x0, top + 4 * s, w, h * 0.5, s, o.night, K + 'window');
        break;
      }
      case 'chimneys': {
        if (it.stack) {
          var cw = 22 * s, ch = it.sh * s, cx = bx + w * 0.22;
          box(ctx, cx - cw / 2, by - ch, cw, ch, col(K + 'tower'), lw);
          box(ctx, cx - cw / 2 - 3 * s, by - ch, cw + 6 * s, 10 * s, col(K + 'trim'), lw);
          if (!o.still) {
            for (var p = 0; p < 3; p++) {
              var ph = ((t * 0.35 + p / 3 + it.phase) % 1);
              ctx.save();
              ctx.globalAlpha *= 0.85 * (1 - ph);
              dot(ctx, cx + ph * 40 * s, by - ch - 14 * s - ph * 70 * s, (8 + ph * 16) * s, col('cloud'), Math.max(1, lw * 0.5));
              ctx.restore();
            }
          }
        }
        box(ctx, x0, top, w, h, col(base), lw);
        var teeth = 3, tw = w / teeth;
        for (var k = 0; k < teeth; k++) tri(ctx, x0 + k * tw, top, x0 + (k + 1) * tw, top, x0 + (k + 1) * tw, top - 22 * s, col(K + 'roof'), lw);
        windows(ctx, x0, top + 6 * s, w, h - 8 * s, s, o.night, K + 'window');
        break;
      }
      case 'sequins': {
        box(ctx, x0, top, w, h, col(K + 'tower'), lw);
        box(ctx, x0 - 3 * s, top - 8 * s, w + 6 * s, 10 * s, col(K + 'roof'), lw);
        sequins(ctx, K, x0, top, w, by, s, t, it, o.still);
        ctx.beginPath(); ctx.rect(x0, top, w, h); ink(ctx, lw);
        break;
      }
      case 'windmills': {
        if (it.mill) {
          ctx.beginPath();
          ctx.moveTo(bx - w * 0.6, by); ctx.lineTo(bx + w * 0.6, by); ctx.lineTo(bx + w * 0.34, top); ctx.lineTo(bx - w * 0.34, top); ctx.closePath();
          fillInk(ctx, col(K + 'tower'), lw);
          tri(ctx, bx - w * 0.44, top, bx + w * 0.44, top, bx, top - 26 * s, col(K + 'roof'), lw);
          var hubY = top + 6 * s, len = h * 0.62, a0 = o.still ? it.phase : it.phase + t * 1.4;
          for (var b = 0; b < 4; b++) {
            var a = a0 + b * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
            ctx.beginPath();
            ctx.moveTo(bx + ca * 6 * s, hubY + sa * 6 * s);
            ctx.lineTo(bx + ca * len - sa * 8 * s, hubY + sa * len + ca * 8 * s);
            ctx.lineTo(bx + ca * len, hubY + sa * len);
            ctx.closePath();
            fillInk(ctx, col(K + 'accent'), Math.max(1, lw * 0.7));
          }
          dot(ctx, bx, hubY, 5 * s, col(K + 'trim'), lw);
        } else {
          box(ctx, x0, top, w, h, col(base), lw);
          tri(ctx, x0 - 6 * s, top, x0 + w + 6 * s, top, bx, top - h * 0.7, col(K + 'roof'), lw);
          windows(ctx, x0, top + 4 * s, w, h - 6 * s, s, o.night, K + 'window');
        }
        break;
      }
      case 'erasers': {
        var rr = Math.min(14 * s, w * 0.2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x0, top, w, h, rr); else ctx.rect(x0, top, w, h);
        fillInk(ctx, col(K + 'tower'), lw);
        box(ctx, x0, top + h * 0.34, w, h * 0.4, col(K + 'roof'), lw);            // the cardboard sleeve
        box(ctx, x0 + w * 0.18, top + h * 0.44, w * 0.64, h * 0.2, col(K + 'accent'), Math.max(1, lw * 0.6));
        windows(ctx, x0, top + 2 * s, w, h * 0.32, s, o.night, K + 'window');
        break;
      }
      case 'pegs': {
        var half = w * 0.5, lean = 8 * s;
        ctx.beginPath();
        ctx.moveTo(bx - half, by); ctx.lineTo(bx - 3 * s, by); ctx.lineTo(bx - 2 * s + lean * 0.2, top); ctx.lineTo(bx - half + lean, top + 10 * s); ctx.closePath();
        fillInk(ctx, col(K + 'tower'), lw);
        ctx.beginPath();
        ctx.moveTo(bx + 3 * s, by); ctx.lineTo(bx + half, by); ctx.lineTo(bx + half - lean, top + 10 * s); ctx.lineTo(bx + 2 * s - lean * 0.2, top); ctx.closePath();
        fillInk(ctx, tone(K + 'tower', -1), lw);
        for (var c = 0; c < 3; c++) dot(ctx, bx, top + h * 0.42 + c * 7 * s, 6 * s, col(K + 'trim'), Math.max(1, lw * 0.6));
        windows(ctx, bx - half + 2 * s, top + h * 0.6, half - 4 * s, h * 0.38, s * 0.8, o.night, K + 'window');
        break;
      }
      default: box(ctx, x0, top, w, h, col(main), lw);
    }
  }

  /**
   * Draws a floating city: its island (the torn paper underside, the rim, the top surface), a few
   * trees and its skyline, back to front.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} id a city id (B-12a)
   * @param {number} x the centre of the island's top surface
   * @param {number} y
   * @param {number} s scale (1: 640 u wide)
   * @param {number} t seconds (windmills, smoke, twinkling sequins)
   * @param {{night: boolean, still: boolean}=} o night: lit windows; still: no motion (Reduced Motion)
   */
  function island(ctx, id, x, y, s, t, o) {
    o = o || {};
    var L = layout(id);
    var lw = Math.max(1, 2.4 * s);
    ctx.save();
    ctx.lineJoin = 'round';
    slab(ctx, id, L, x, y, s, lw);
    var ry = ISLAND_W * s * 0.09;
    L.trees.forEach(function (tr) {
      var tx = x + tr.x * s, ty = y - ry * 0.35;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - tr.r * s); ink(ctx, Math.max(1, 3 * s));
      dot(ctx, tx, ty - tr.r * s * 1.4, tr.r * s, col('grassShade'), lw);
    });
    for (var i = 0; i < L.items.length; i++) {
      var it = L.items[i];
      building(ctx, id, L, it, x + it.x * s, y + it.z * s * 0.35, s, t, o, lw);
    }
    if (L.kind === 'pegs') clothesline(ctx, id, L, x, y, s, t, o);
    ctx.restore();
  }

  var SPRITES = { px: 0, map: {} };   // far islands baked once per city, scale, night flag and device scale

  /**
   * A far island as a cached sprite: the island drawn still (no smoke, sails or twinkle, invisible
   * at a distance anyway) once into its own canvas, so the trip scene's five distant cities cost one
   * drawImage each instead of about fifty path fills (ARCHITECTURE §17). Browser only.
   * @param {string} id a city id
   * @param {number} s scale (as island())
   * @param {boolean} night lit windows
   * @param {number=} px device pixels per logical unit (SR.stage.scale; default 1)
   * @returns {{canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number}|null} draw it with
   *   ctx.drawImage(sp.canvas, x + sp.x, y + sp.y, sp.w, sp.h) for an island centred at (x, y)
   */
  function islandSprite(id, s, night, px) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    px = px || 1;
    if (SPRITES.px !== px) { SPRITES.px = px; SPRITES.map = {}; }
    var key = id + '|' + s + '|' + (night ? 1 : 0);
    if (SPRITES.map[key]) return SPRITES.map[key];
    var w = ISLAND_BOX.w * s, h = ISLAND_BOX.h * s;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * px));
    c.height = Math.max(1, Math.ceil(h * px));
    var g = c.getContext('2d');
    if (!g) return null;
    g.setTransform(px, 0, 0, px, 0, 0);
    island(g, id, -ISLAND_BOX.l * s, -ISLAND_BOX.t * s, s, 0, { night: !!night, still: true });
    SPRITES.map[key] = { canvas: c, x: ISLAND_BOX.l * s, y: ISLAND_BOX.t * s, w: w, h: h };
    return SPRITES.map[key];
  }

  /** Las Pegas: a washing line strung between its two tallest pegs, with shirts that sway. */
  function clothesline(ctx, id, L, x, y, s, t, o) {
    var tall = L.items.slice().sort(function (a, b) { return b.h - a.h; }).slice(0, 2).sort(function (a, b) { return a.x - b.x; });
    if (tall.length < 2) return;
    var a = tall[0], b = tall[1];
    var ax = x + a.x * s, ay = y + a.z * s * 0.35 - a.h * s * 0.8, bx = x + b.x * s, by = y + b.z * s * 0.35 - b.h * s * 0.8;
    var mx = (ax + bx) / 2, my = Math.max(ay, by) + 24 * s;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.lineWidth = Math.max(1, 1.5 * s); ctx.strokeStyle = col('inkLine'); ctx.stroke();
    var keys = ['city.' + id + '.accent', 'city.' + id + '.roof', 'white'];
    for (var k = 1; k <= 3; k++) {
      var u = k / 4, px = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx, py = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by;
      var sway = o.still ? 0 : Math.sin(t * 2 + k) * 0.12;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(sway);
      var w = 16 * s, hh = 18 * s;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2, hh); ctx.lineTo(-w / 2, hh); ctx.closePath();
      fillInk(ctx, col(keys[k - 1]), Math.max(1, s));
      ctx.restore();
    }
  }

  /** The trip postcard's sky: the hour's keyframes (params.min, default noon), with paper clouds. */
  function postcardSky(ctx, kit, min) {
    var sk = SR.art.interior.kit && SR.art.interior.kit.skyAt ? SR.art.interior.kit.skyAt(min) : { top: col('sky.8.top'), horizon: col('sky.8.horizon') };
    var g = ctx.createLinearGradient(0, 0, 0, kit.H);
    g.addColorStop(0, sk.top);
    g.addColorStop(1, sk.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, kit.W, kit.H);
    var clouds = [[90, 150, 70], [300, 90, 54], [610, 170, 80], [150, 560, 90], [520, 620, 110], [960, 120, 70], [1100, 520, 90]];
    clouds.forEach(function (c) {
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.beginPath();
      ctx.ellipse(c[0], c[1], c[2], c[2] * 0.34, 0, 0, TAU);
      ctx.ellipse(c[0] - c[2] * 0.45, c[1] + 4, c[2] * 0.5, c[2] * 0.26, 0, 0, TAU);
      ctx.ellipse(c[0] + c[2] * 0.5, c[1] + 6, c[2] * 0.55, c[2] * 0.24, 0, 0, TAU);
      ctx.fillStyle = col('cloud');
      ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(c[0] - c[2] * 0.9, c[1] + c[2] * 0.28); ctx.lineTo(c[0] + c[2] * 0.95, c[1] + c[2] * 0.28);
      ctx.lineWidth = 1; ctx.strokeStyle = col('cloudLine'); ctx.stroke();
    });
  }

  /** The Sky Ribbon arriving from the left at the island's stop (under its rim), the Sky Bus parked on it. */
  function ribbon(ctx, t, night) {
    ctx.beginPath();
    ctx.moveTo(-20, 520); ctx.bezierCurveTo(60, 500, 130, 476, 210, 446);
    ctx.lineTo(214, 470); ctx.bezierCurveTo(134, 500, 64, 526, -20, 548); ctx.closePath();
    fillInk(ctx, col('paperEdge'), 2.5);
    ctx.save();
    ctx.setLineDash([12, 12]);
    ctx.beginPath(); ctx.moveTo(-20, 534); ctx.bezierCurveTo(60, 513, 130, 488, 212, 458);
    ctx.lineWidth = 2; ctx.strokeStyle = col('lanePaint'); ctx.stroke();
    ctx.restore();
    if (SR.art.vehicles && typeof SR.art.vehicles.draw === 'function') {
      ctx.save();
      ctx.translate(96, 506);
      ctx.rotate(-0.3);
      SR.art.vehicles.draw(ctx, 'skybus', 0, 0, 0, { scale: 0.42, t: t, lights: night });
      ctx.restore();
    }
  }

  function isNight(min) { var h = ((min === undefined ? 720 : min) / 60) % 24; return h < 6.5 || h >= 19.5; }

  // ---- the rooms ------------------------------------------------------------------------------------

  SR.def.interior('jail', {
    wall: { type: 'stone', color: 'int.jail.wall', alt: 'int.jail.wallShade', trim: 'int.jail.trim', wainscotH: 90 },
    floor: { type: 'concrete', a: 'int.jail.floorA', b: 'int.jail.floorB', perspective: 0.5 },
    window: { x: 430, y: 60, w: 130, h: 84, panes: 1 },
    props: [
      { type: 'calendar', x: 90, y: 150 },
      { type: 'poster', x: 620, y: 150, w: 84, h: 110, color: 'kit.paper', alt: 'int.jail.accent' },
      { type: 'cot', x: 60, y: 610, w: 280, color: 'kit.fabric' },
      { type: 'books', x: 560, y: 640, w: 110 },
      { type: 'trash', x: 690, y: 560, w: 44, h: 56, color: 'kit.metalDark' },
      { type: 'bars', x: 0, y: 712, w: 770, color: 'int.jail.trim' },
    ],
    you: { x: 380, y: 590 },
    lights: [{ x: 300, y: 60, r: 200, color: 'int.jail.light', alpha: 0.2 }],
    custom: 'cell',
    fns: {
      // The window's bars, over the live sky (static layer and every frame).
      cell: {
        static: function (ctx, kit) { cellBars(ctx, kit); },
        anim: function (ctx, kit) { cellBars(ctx, kit); },
      },
    },
  });

  function cellBars(ctx, kit) {
    for (var x = 452; x < 560; x += 24) kit.line(ctx, [x, 60, x, 144], 5, kit.color('int.jail.trim'));
  }

  SR.def.interior('hospital', {
    wall: { type: 'panels', color: 'int.hospital.wall', alt: 'int.hospital.wallShade', trim: 'int.hospital.trim' },
    floor: { type: 'tiles', a: 'int.hospital.floorA', b: 'int.hospital.floorB', perspective: 0.55, tile: 120 },
    window: { x: 70, y: 70, w: 220, h: 140 },
    props: [
      { type: 'poster', x: 360, y: 120, w: 86, h: 112, color: 'kit.paper', alt: 'int.hospital.accent' },
      { type: 'clock', x: 480, y: 110 },
      { type: 'curtain', x: 560, y: 470, w: 200, h: 330, color: 'int.hospital.trim' },
      { type: 'bed', x: 140, y: 640, w: 330, color: 'int.hospital.trim' },
      { type: 'heartmonitor', x: 520, y: 620 },
      { type: 'plant', x: 30, y: 560 },
    ],
    you: { x: 300, y: 604 },
    lights: [{ x: 300, y: 64, r: 240, color: 'int.hospital.light', alpha: 0.24 }],
  });

  SR.def.interior('trip', {
    wall: { type: 'plain', wainscot: false }, floor: { type: 'concrete', perspective: 0.2 },
    props: [],
    custom: 'postcard',
    fns: {
      island: island,
      islandSprite: islandSprite,
      postcard: {
        // The sky, the clouds and the Sky Ribbon with the bus at the stop; the island is animated.
        static: function (ctx, kit) {
          var p = kit.params || {};
          postcardSky(ctx, kit, p.min);
        },
        anim: function (ctx, kit, t) {
          var p = kit.params || {};
          if (!p.city) return;
          ribbon(ctx, t, isNight(p.min));
          island(ctx, p.city, 440, 400, 0.8, t, { night: isNight(p.min), still: !!p.still });
        },
      },
    },
  });
})();
