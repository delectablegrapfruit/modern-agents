// js/render/minimap.js — owner: W2-City. SR.render.minimap: the city HUD's minimap (UI.md §4.1,
// ARCHITECTURE §9.1 step 12): its own 184 × 184 canvas, redrawn at 10 Hz from a pre-rendered map
// image (the island's silhouette with its streets, paths, plazas and buildings, baked once per
// device scale) plus dots: every door as a dot in its building's colour, the player's arrow, the
// player's cars, the "!" markers (W3-Life, flag `encounters`) and the waypoint (W2-Pocket's map sets
// it with SR.render.minimap.waypoint). The whole island fits, north up. The city scene mounts it and
// toggles it (N, or Settings › game.minimap); a click opens the Pocket's Map tab. Colours come from
// SR.art.palette by key. Nothing runs at load time; drawing needs a canvas (never in Node).
(function () {
  'use strict';
  var SR = window.SR;

  var SIZE = 184;              // logical px (UI.md §2.2: 1080-1264 × 520-704)
  var PAD = 6;                 // px of paper around the island
  var HZ = 10;                 // redraws a second (ARCHITECTURE §9.1)
  var DOOR_R = 3.2, PLAYER_R = 5.5, MARKER_R = 3.5;

  function pal(keys, lum) {
    var L = SR.render && SR.render.lib;
    if (L && L.pal) return L.pal(keys, lum);
    var D = SR.art && SR.art.draw;
    return D && D.color ? D.color(Array.isArray(keys) ? keys[0] : keys) : '';
  }

  var MM = {
    SIZE: SIZE,
    /** The waypoint { x, y } (world u) or null. */
    wp: null,
    /** Redraws so far (tests). */
    draws: 0,
  };
  var base = null;             // { canvas, scale, key }
  var last = -1;
  var NO_BOUNDS = [0, 0, 1, 1];

  /** @returns {number[]} the island outline's box [x0, y0, x1, y1] (before the world is built). */
  function outlineBounds() {
    var map = SR.reg.worldmap && SR.reg.worldmap.main, o = map && map.outline;
    if (!o || !o.length) return NO_BOUNDS;
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    o.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    return b;
  }

  /** @returns {{s: number, ox: number, oy: number}} world → minimap px: px = (x - ox) * s. */
  function fit() {
    var g = SR.world && SR.world.geometry, b = g && g.bounds ? g.bounds : outlineBounds();
    var w = b[2] - b[0], h = b[3] - b[1], s = (SIZE - 2 * PAD) / Math.max(w, h);
    return { s: s, ox: b[0] - (SIZE / s - w) / 2, oy: b[1] - (SIZE / s - h) / 2 };
  }

  /** @returns {{x: number, y: number}} the minimap point (logical px) of a world point. */
  MM.toMap = function (x, y) { var f = fit(); return { x: (x - f.ox) * f.s, y: (y - f.oy) * f.s }; };
  /** @returns {{x: number, y: number}} the world point under a minimap point (logical px). */
  MM.toWorld = function (mx, my) { var f = fit(); return { x: mx / f.s + f.ox, y: my / f.s + f.oy }; };
  /** Sets (or clears with null) the waypoint the minimap shows. */
  MM.waypoint = function (x, y) {
    MM.wp = x === null || x === undefined ? null : { x: Number(x), y: Number(y) };
    last = -1;
    return MM.wp;
  };

  function rect(ctx, r, f) { ctx.fillRect((r[0] - f.ox) * f.s, (r[1] - f.oy) * f.s, (r[2] - r[0]) * f.s, (r[3] - r[1]) * f.s); }

  /** Bakes the island, its ground and its buildings at a device scale. */
  function bake(k) {
    var map = SR.reg.worldmap && SR.reg.worldmap.main;
    if (!map || typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = Math.round(SIZE * k); c.height = Math.round(SIZE * k);
    var ctx = c.getContext('2d'), f = fit();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // The island (grass), its holes (sky), then the ground surfaces and the buildings.
    ctx.beginPath();
    map.outline.forEach(function (p, i) { var x = (p[0] - f.ox) * f.s, y = (p[1] - f.oy) * f.s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = pal('grass', 0.6); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = pal('ink', 0.1); ctx.stroke();
    var order = { plaza: 1, path: 2, sidewalk: 3, asphalt: 4 };
    var streets = (map.streets || []).slice().sort(function (a, b) { return (order[a.kind] || 0) - (order[b.kind] || 0); });
    streets.forEach(function (s) {
      ctx.fillStyle = pal(s.kind === 'asphalt' ? 'asphalt' : s.kind === 'sidewalk' ? 'sidewalk' : s.kind === 'plaza' ? 'plaza' : 'path', 0.5);
      rect(ctx, s.rect, f);
    });
    ctx.fillStyle = pal('asphalt', 0.4);
    (map.junctions || []).forEach(function (j) { rect(ctx, j.rect, f); });
    ctx.fillStyle = pal(['weather.cloudy', 'cloud'], 0.8);
    (map.holes || []).forEach(function (h) { rect(ctx, h.rect, f); });
    (map.buildings || []).forEach(function (b) {
      var key = b.exterior && b.exterior.palette ? b.exterior.palette : 'bld.' + b.id;
      ctx.fillStyle = pal([key + '.roof', 'bld.default.roof'], 0.4);
      b.masses.forEach(function (m) { rect(ctx, m.rect, f); });
    });
    if (map.features && map.features.pond) {
      var p = map.features.pond;
      ctx.fillStyle = pal('water', 0.5);
      ctx.beginPath(); ctx.ellipse((p.x - f.ox) * f.s, (p.y - f.oy) * f.s, p.rx * f.s, p.ry * f.s, 0, 0, Math.PI * 2); ctx.fill();
    }
    return { canvas: c, k: k };
  }

  function doorColour(d) {
    var def = SR.world.geometry.buildings[d.building], key = def && def.def && def.def.exterior && def.def.exterior.palette;
    return pal([(key || 'bld.' + d.building) + '.walls', 'bld.default.walls'], 0.5);
  }

  function arrow(ctx, x, y, deg, r) {
    var a = (deg - 90) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x + ca * r, y + sa * r);
    ctx.lineTo(x + Math.cos(a + 2.5) * r * 0.85, y + Math.sin(a + 2.5) * r * 0.85);
    ctx.lineTo(x - ca * r * 0.35, y - sa * r * 0.35);
    ctx.lineTo(x + Math.cos(a - 2.5) * r * 0.85, y + Math.sin(a - 2.5) * r * 0.85);
    ctx.closePath();
  }

  /**
   * Paints the minimap into a canvas: the baked island, then the doors, markers, waypoint, the
   * player's cars and the player's arrow.
   * @param {HTMLCanvasElement} canvas sized to SIZE × SIZE logical px (its backing store to the device)
   */
  MM.draw = function (canvas) {
    if (!canvas || !SR.world || !SR.world.geometry || !SR.world.geometry.built) return;
    var k = canvas.width / SIZE;
    if (!base || Math.abs(base.k - k) > 1e-3) base = bake(k);
    if (!base) return;
    var ctx = canvas.getContext('2d'), f = fit(), g = SR.world.geometry, s = SR.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base.canvas, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var ink = pal('ink', 0.1), paper = pal(['ui.paper-0', 'white'], 0.98);
    // Doors: a dot in the building's colour with an ink rim.
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    for (var i = 0; i < g.doors.length; i++) {
      var d = g.doors[i];
      ctx.fillStyle = doorColour(d);
      ctx.beginPath(); ctx.arc((d.x - f.ox) * f.s, (d.y - f.oy) * f.s, DOOR_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // "!" markers (P1: W3-Life's markers).
    var mk = SR.world.markers && (Array.isArray(SR.world.markers.list) ? SR.world.markers.list : null);
    if (mk) {
      ctx.fillStyle = pal(['ui.focus', 'lanePaint'], 0.8);
      mk.forEach(function (m) {
        if (!m || typeof m.x !== 'number' || m.visible === false) return;
        ctx.beginPath(); ctx.arc((m.x - f.ox) * f.s, (m.y - f.oy) * f.s, MARKER_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
    // The waypoint: a ring and a pin.
    var wp = MM.wp || (s && s.journal && s.journal.waypoint) || null;
    if (wp && typeof wp.x === 'number') {
      var wx = (wp.x - f.ox) * f.s, wy = (wp.y - f.oy) * f.s;
      ctx.strokeStyle = pal(['ui.danger', 'bld.bank.walls'], 0.3); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx, wy - 5); ctx.lineTo(wx, wy - 11); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = ink;
    }
    // The player's cars (parked; the one driven is the arrow).
    var P = SR.world.player;
    if (s && s.player && s.player.cars) {
      ['junker', 'sports'].forEach(function (id) {
        var row = s.player.cars[id];
        if (!row || !row.owned || row.towed || (P && P.car === id)) return;
        ctx.fillStyle = pal('car.' + id, 0.6);
        ctx.fillRect((row.x - f.ox) * f.s - 3.5, (row.y - f.oy) * f.s - 2.5, 7, 5);
        ctx.strokeRect((row.x - f.ox) * f.s - 3.5, (row.y - f.oy) * f.s - 2.5, 7, 5);
      });
    }
    // You: an arrow pointing where you face, in your karma colour on paper.
    if (s && P && typeof P.x === 'number') {
      var px = (P.x - f.ox) * f.s, py = (P.y - f.oy) * f.s;
      var head = SR.art && SR.art.stick && typeof SR.art.stick.karmaColor === 'function' ? SR.art.stick.karmaColor(s.stats ? s.stats.karma : 0) : pal('karma.good.0', 0.4);
      ctx.fillStyle = paper;
      ctx.beginPath(); ctx.arc(px, py, PLAYER_R + 2, 0, Math.PI * 2); ctx.fill();
      arrow(ctx, px, py, P.facing || 0, PLAYER_R + 1);
      ctx.fillStyle = typeof head === 'string' ? head : pal('karma.good.0', 0.4);
      ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = ink; ctx.stroke();
    }
    MM.draws++;
  };

  /**
   * Redraws at 10 Hz (the city calls it every frame with the loop's clock).
   * @param {HTMLCanvasElement} canvas
   * @param {number} t seconds (SR.loop.time)
   * @param {boolean=} force redraw now
   */
  MM.tick = function (canvas, t, force) {
    var slot = Math.floor(t * HZ);
    if (!force && slot === last) return false;
    last = slot;
    MM.draw(canvas);
    return true;
  };

  /** Drops the baked island (a new worldmap or device scale). */
  MM.invalidate = function () { base = null; last = -1; };

  SR.render.minimap = MM;
})();
