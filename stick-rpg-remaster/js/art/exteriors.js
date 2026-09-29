// js/art/exteriors.js — owner: W1-G. SR.art.exterior: the building painter (ARCHITECTURE §9.3,
// ART_AUDIO §5.1). From a worldmap building entry it derives the projected geometry (masses,
// porches, awnings, canopies, bounds) and bakes, mass by mass, an albedo sprite at the current
// zoom plus the lit-window rect list and small neon sprites for the emissive pass. Archetypes:
// box, tower, hall, shop, castle, house, depot (and vehicle for the parked Sky Bus). The
// per-building detail comes from SR.def.exterior(id, { detail, signature }) (W2-Exterior).
// Colours are palette keys only (bld.<id>.walls / shade / roof / trim; CONTRACT D32).
(function () {
  'use strict';
  var SR = window.SR;

  // Geometry constants (GDD §3.6, ARCHITECTURE §8.1, ART_AUDIO §5.1).
  var PROJ = 0.5;             // screenY = y - 0.5 z (B-15 `projection`; read from tuning per call)
  var PORCH_S = 40;           // south porch depth: step and mat
  var PORCH_HALF = 48;        // porches and awnings span the door ± 48 u
  var AWNING_DEPTH = 32;      // east / west awnings project 32 u over the sidewalk
  var AWNING_Z_IN = 64;       // awning height at the wall (u of z)
  var AWNING_Z_OUT = 50;      // and at its outer edge
  var PORCH_N_EXTRA = 32;     // north porch depth = 0.5 · h_annex + 32 (B-15 `door.porchN.add`; tuning wins)
  var CANOPY_OVER = 8;        // the north canopy overhangs the annex roof edge by 8 u
  var FLOOR_H = 40;           // one storey, u of z
  var TIER_H = 200;           // tower setback tiers every 200 u of height
  var TIER_INSET = 12;        // each tier steps back 12 u
  var NEON_IDS = ['bar', 'casino', 'mcsticks'];   // ART_AUDIO §3: the neon signs
  var NEON_MAX = [256, 128];  // neon sprites ≤ 256 × 128 device px (ARCHITECTURE §9.1)
  var DISPLAY_FONT = '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif';
  var GRAIN_ALPHA = 0.06;     // paper grain over building sprites (ART_AUDIO §1.1 rule 3)

  function L() { return SR.render.lib; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function firstNum() {
    for (var i = 0; i < arguments.length; i++) if (num(arguments[i])) return arguments[i];
    return undefined;
  }
  function rectOf(r) {
    if (Array.isArray(r) && r.length >= 4) return [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
    if (r && typeof r === 'object' && num(r.x0)) return [r.x0, r.y0, r.x1, r.y1];
    return null;
  }
  function union(a, b) {
    if (!a) return b ? b.slice() : null;
    if (!b) return a;
    a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]); a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]);
    return a;
  }
  function hits(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  // ---------------------------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------------------------

  var geomCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  /**
   * Derives the painter's geometry for a worldmap building entry (cached per entry object).
   * All rects are [x0, y0, x1, y1] in projected world space (x, y - 0.5 z), before the camera.
   * @param {object} def { id, masses: [{ role, rect, h }], door: { face, x, y, kerb }, exterior }
   * @returns {object} { id, archetype, roof, palette, masses[], order[], door, porch, visible,
   *   awning, canopy, post, sortY, bounds, footprint }
   */
  function projK() { var k = L().tune('world.projection.k', 0.5); return typeof k === 'number' && k > 0 ? k : 0.5; }

  function geom(def) {
    if (geomCache && geomCache.has(def)) return geomCache.get(def);
    PROJ = projK();
    var ex = def.exterior || {};
    var arch = ex.archetype || (def.id === 'skybus' ? 'vehicle' : 'box');
    var roof = ex.roof || { house: 'pitched', castle: 'crenel', depot: 'sawtooth' }[arch] || 'flat';
    if (arch === 'hall' && (ex.dome || num(ex.domeH))) roof = 'dome';
    var masses = def.masses.map(function (m, i) {
      var r = rectOf(m.rect) || [0, 0, 0, 0];
      var h = num(m.h) ? m.h : 0;
      return { i: i, role: m.role || 'main', x0: r[0], y0: r[1], x1: r[2], y1: r[3], h: h, top: h, m: m };
    });
    var main = masses.filter(function (m) { return m.role === 'main'; })[0] || masses[0];
    var maxH = Math.max.apply(null, masses.map(function (m) { return m.h; }));
    // Tall roof features (worldmap exterior.tops: turrets, dome, sign, dice) stay inside the
    // footprint but reach higher (GDD §3.4 "(360; towers 460)", "(300; dome 420)").
    var tops = (Array.isArray(ex.tops) ? ex.tops : []).map(function (t) {
      var r = rectOf(t && t.rect);
      return r && num(t.h) ? { kind: t.kind || 'box', x0: r[0], y0: r[1], x1: r[2], y1: r[3], h: t.h } : null;
    }).filter(Boolean);
    function topH(kind) {
      var v = tops.filter(function (t) { return t.kind === kind; }).map(function (t) { return t.h; });
      return v.length ? Math.max.apply(null, v) : undefined;
    }
    var towerH = firstNum(topH('turret'), ex.towerH, arch === 'castle' ? main.h + 100 : undefined);
    var domeH = firstNum(topH('dome'), ex.domeH, roof === 'dome' ? main.h + 120 : undefined);
    var signH = firstNum(topH('sign'), ex.signH, arch === 'shop' ? main.h + 70 : undefined);
    masses.forEach(function (m) {
      m.top = m === main ? Math.max(m.h, towerH || 0, domeH || 0, signH || 0) : m.h;
      m.proj = [m.x0, m.y0 - PROJ * m.h, m.x1, m.y1];
      m.topProj = [m.x0, m.y0 - PROJ * m.top, m.x1, m.y1];
    });
    // Paint back to front: north first; on a shared south line the taller mass goes on top.
    var order = masses.slice().sort(function (a, b) { return a.y1 - b.y1 || a.h - b.h || a.i - b.i; });
    var g = {
      id: def.id, def: def, archetype: arch, roof: roof, palette: ex.palette || ('bld.' + def.id),
      masses: masses, order: order, main: main, maxH: maxH, towerH: towerH, domeH: domeH, signH: signH, tops: tops,
      sortY: Math.max.apply(null, masses.map(function (m) { return m.y1; })),
      door: null, porch: null, visible: null, awning: null, canopy: null, post: null, stairs: null,
      footprint: null, bounds: null, neon: ex.neon === true || (ex.neon !== false && NEON_IDS.indexOf(def.id) >= 0),
    };
    masses.forEach(function (m) { g.footprint = union(g.footprint, [m.x0, m.y0, m.x1, m.y1]); });
    var b = null;
    masses.forEach(function (m) { b = union(b, m.proj); });
    tops.forEach(function (t) {
      // Turrets carry a cone roof and a pennant above their top (about 2 radii).
      var extra = t.kind === 'turret' ? (t.x1 - t.x0) * 1.1 + 30 : t.kind === 'dome' ? 16 : 4;
      b = union(b, [t.x0 - 6, t.y0 - PROJ * t.h - extra, t.x1 + 6, t.y1]);
    });
    if (!tops.length) masses.forEach(function (m) { b = union(b, m.topProj); });
    if (arch === 'castle' && !tops.some(function (t) { return t.kind === 'turret'; })) {
      // Default corner towers carry their cone and pennant above towerH (about 2 radii).
      var R0 = Math.max(26, Math.min(64, Math.min(main.x1 - main.x0, main.y1 - main.y0) * 0.13));
      b = union(b, [main.x0, main.y0 - PROJ * (towerH || main.h + 100) - R0 * 2.2 - 30, main.x1, main.y1]);
    }
    // What the building hides from view: its masses' and tall features' projected rects.

    var d = def.door;
    if (d && num(d.x) && num(d.y)) {
      var face = String(d.face || 'S').toUpperCase().charAt(0);
      g.door = { face: face, x: d.x, y: d.y, kerb: d.kerb || null, mass: null };
      if (face === 'S') {
        g.porch = [d.x - PORCH_HALF, d.y, d.x + PORCH_HALF, d.y + PORCH_S];
        g.visible = g.porch.slice();
        g.door.mass = pickMass(masses, function (m) { return Math.abs(m.y1 - d.y) < 2 && d.x >= m.x0 && d.x <= m.x1; }) || main;
        if (arch === 'hall') {
          g.stairs = [Math.max(g.door.mass.x0, d.x - 150), d.y, Math.min(g.door.mass.x1, d.x + 150), d.y + 14];
          b = union(b, g.stairs);
        }
      } else if (face === 'E' || face === 'W') {
        var sx = face === 'E' ? 1 : -1;
        var xo = d.x + sx * AWNING_DEPTH;
        g.porch = [Math.min(d.x, xo), d.y - PORCH_HALF, Math.max(d.x, xo), d.y + PORCH_HALF];
        g.visible = g.porch.slice();
        g.awning = [Math.min(d.x, xo), d.y - PORCH_HALF - PROJ * AWNING_Z_IN - 18, Math.max(d.x, xo), d.y + PORCH_HALF - PROJ * AWNING_Z_OUT + 10];
        b = union(b, g.awning);
        g.door.mass = pickMass(masses, function (m) { return Math.abs((face === 'E' ? m.x1 : m.x0) - d.x) < 2 && d.y >= m.y0 && d.y <= m.y1; }) || main;
      } else if (face === 'N') {
        var annex = pickMass(masses, function (m) { return Math.abs(m.y0 - d.y) < 2 && d.x >= m.x0 && d.x <= m.x1; }) ||
          pickMass(masses, function (m) { return m.role === 'annex'; }) || main;
        var ha = annex.h || 48;
        var add = L().tune('world.door.porchN.add', PORCH_N_EXTRA);
        var depth = PROJ * ha + (typeof add === 'number' && add > 0 ? add : PORCH_N_EXTRA);
        g.door.mass = annex;
        g.porch = [d.x - PORCH_HALF, d.y - depth, d.x + PORCH_HALF, d.y];
        g.visible = [d.x - PORCH_HALF, d.y - depth, d.x + PORCH_HALF, d.y - PROJ * ha];
        var ry = annex.y0 - PROJ * ha;
        var cw = Math.min(annex.x1 - annex.x0 - 16, 150);
        g.canopy = [d.x - cw / 2, ry - CANOPY_OVER, d.x + cw / 2, ry + 18];
        g.post = { x: d.x + PORCH_HALF - 12, y: d.y - PROJ * ha - 20, h: 58, w: 44 };
        b = union(b, g.canopy);
        b = union(b, [g.post.x - g.post.w / 2 - 2, g.post.y - PROJ * g.post.h - 26, g.post.x + g.post.w / 2 + 2, g.post.y + 4]);
      }
    }
    // What the building hides from view: its masses' and tall features' projected rects. (People
    // on an east / west door mat are drawn in front of the awning instead: js/render/actors.js.)
    g.cover = masses.map(function (m) { return m.proj; }).concat(tops.map(function (t) { return [t.x0, t.y0 - PROJ * t.h, t.x1, t.y1]; }));
    // Signature rects (worldmap and W2-Exterior) are drawn inside the sprite: include them.
    g.signature = signatures(def);
    g.signature.forEach(function (r) { b = union(b, r); });
    var pad = 6;
    g.bounds = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
    if (geomCache) geomCache.set(def, g);
    return g;
  }

  /** @returns {number[][]} the signature rects of a building: its worldmap exterior's and its SR.def.exterior's. */
  function signatures(def) {
    var out = [];
    var ex = def.exterior || {};
    var reg = SR.reg && SR.reg.exterior && SR.reg.exterior[def.id];
    [ex.signature, reg && reg.signature].forEach(function (list) {
      if (Array.isArray(list)) list.forEach(function (r) { var rr = rectOf(r); if (rr) out.push(rr); });
    });
    return out;
  }

  function pickMass(masses, fn) {
    for (var i = 0; i < masses.length; i++) if (fn(masses[i])) return masses[i];
    return null;
  }

  /** @returns {object} the building's resolved colours: walls, shade, roof, trim, glass, glassLit, ink. */
  function colours(g) {
    var p = L().pal, key = g.palette;
    var walls = p([key + '.walls', 'stone'], 0.75);
    return {
      walls: walls,
      shade: L().palHas(key + '.shade') ? p(key + '.shade') : L().tone(walls, -1),
      roof: L().palHas(key + '.roof') ? p(key + '.roof') : L().tone(walls, -2),
      trim: p([key + '.trim', key + '.stripe', 'paperEdge'], 0.95),
      stripe: p([key + '.stripe', key + '.trim', 'paperEdge'], 0.95),
      glass: p('glass', 0.8),
      glassLit: p('glassLit', 0.9),
      ink: p('ink', 0.1),
      paper: p(['paperEdge', 'zebra'], 0.95),
      stone: p('stone', 0.66),
      stoneShade: p('stoneShade', 0.55),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing helpers (ctx in world units; lw = the ink line width in u)
  // ---------------------------------------------------------------------------------------------

  function fillRect(ctx, r, c) { ctx.fillStyle = c; ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); }

  function ink(ctx, P, lw, fn) {
    ctx.save();
    ctx.strokeStyle = P.ink;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    fn();
    ctx.stroke();
    ctx.restore();
  }

  function outlineRect(ctx, P, lw, r) { ink(ctx, P, lw, function () { ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]); }); }

  function textOn(ctx, str, r, colour, opts) {
    if (!str) return;
    opts = opts || {};
    var w = r[2] - r[0], h = r[3] - r[1];
    var size = Math.max(4, Math.min(h * (opts.fill || 0.66), 64));
    ctx.save();
    ctx.font = '900 ' + size + 'px ' + DISPLAY_FONT;
    var tw = ctx.measureText(str).width;
    if (tw > w * 0.92) {
      size = size * (w * 0.92) / tw;
      ctx.font = '900 ' + size + 'px ' + DISPLAY_FONT;
    }
    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + size * 0.04);
    ctx.restore();
  }

  function contrastInk(P, bg) { return L().luma(bg) > 0.35 ? P.ink : P.paper; }

  /** @returns {string} the sign lettering: the exterior's sign text key, else the place name, else ''. */
  function signText(g) {
    var ex = g.def.exterior || {};
    var t = L().text;
    var s = typeof ex.sign === 'string' ? t(ex.sign, null, '') : '';
    if (!s) s = t('place.' + g.id, null, '').toUpperCase();
    return s;
  }

  // ---------------------------------------------------------------------------------------------
  // Mass pieces
  // ---------------------------------------------------------------------------------------------

  function facadeOf(m, h) { h = h === undefined ? m.h : h; return [m.x0, m.y1 - PROJ * h, m.x1, m.y1]; }
  function roofOf(m, h) { h = h === undefined ? m.h : h; return [m.x0, m.y0 - PROJ * h, m.x1, m.y1 - PROJ * h]; }

  /** A flat-roofed block: roof in the base tone, south face in shade, parapet, cornice and plinth. */
  function block(ctx, P, lw, m, o) {
    o = o || {};
    var f = o.facadeRect || facadeOf(m), r = o.roofRect || roofOf(m);
    var face = o.facade || P.shade, top = o.roof || P.walls;
    fillRect(ctx, f, face);
    fillRect(ctx, r, top);
    if (!o.noParapet && r[3] - r[1] > 16 && r[2] - r[0] > 16) {
      ctx.save();
      ctx.strokeStyle = o.parapet || P.roof;
      ctx.lineWidth = Math.min(8, (r[3] - r[1]) / 5);
      var i = ctx.lineWidth / 2 + 2;
      ctx.strokeRect(r[0] + i, r[1] + i, r[2] - r[0] - 2 * i, r[3] - r[1] - 2 * i);
      ctx.restore();
    }
    // Roof edge highlight (north) and the south roof lip.
    fillRect(ctx, [r[0], r[1], r[2], r[1] + 3], L().tone(top, 1));
    fillRect(ctx, [f[0], f[1], f[2], f[1] + 3], o.cornice || P.trim);
    fillRect(ctx, [f[0], f[3] - 4, f[2], f[3]], L().tone(face, -1));
    ink(ctx, P, lw, function () {
      ctx.rect(r[0], r[1], r[2] - r[0], f[3] - r[1]);
      ctx.moveTo(f[0], f[1]); ctx.lineTo(f[2], f[1]);
    });
  }

  /** A grid of punched windows on a facade; pushes each glass rect to out. */
  function windowGrid(ctx, P, lw, f, out, o) {
    o = o || {};
    var fh = o.floor || PROJ * FLOOR_H;
    var ww = o.w || 12, wh = o.h || Math.min(10, fh * 0.55), col = o.col || 28;
    var top = f[1] + (o.top || 6), bottom = f[3] - (o.bottom === undefined ? fh : o.bottom);
    var rows = Math.floor((bottom - top) / fh);
    if (rows <= 0) return;
    var cols = Math.floor((f[2] - f[0] - 8) / col);
    if (cols <= 0) return;
    var x0 = (f[0] + f[2]) / 2 - (cols * col) / 2;
    var skip = o.skip || null;
    ctx.save();
    ctx.fillStyle = P.glass;
    ctx.beginPath();
    var list = [];
    for (var r = 0; r < rows; r++) {
      var y = top + r * fh + (fh - wh) / 2;
      for (var c = 0; c < cols; c++) {
        var x = x0 + c * col + (col - ww) / 2;
        if (skip && x + ww > skip[0] && x < skip[2] && y + wh > skip[1]) continue;
        ctx.rect(x, y, ww, wh);
        list.push([x, y, ww, wh]);
      }
    }
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(0.8, lw * 0.4);
    ctx.stroke();
    ctx.restore();
    for (var i = 0; i < list.length; i++) out.push(list[i]);
  }

  function roofClutter(ctx, P, lw, m, rnd) {
    var r = roofOf(m);
    var w = r[2] - r[0], h = r[3] - r[1];
    if (w < 80 || h < 50) return;
    var n = 2 + Math.floor(rnd(1) * 3);
    for (var i = 0; i < n; i++) {
      var bw = 18 + rnd(i * 3 + 2) * 22, bh = 12 + rnd(i * 3 + 3) * 10;
      var x = r[0] + 14 + rnd(i * 3 + 4) * (w - bw - 28), y = r[1] + 14 + rnd(i * 3 + 5) * (h - bh - 28);
      fillRect(ctx, [x, y, x + bw, y + bh], P.stone);
      fillRect(ctx, [x, y + bh, x + bw, y + bh + 6], P.stoneShade);
      outlineRect(ctx, P, lw * 0.6, [x, y, x + bw, y + bh + 6]);
    }
    var vx = r[0] + 20 + rnd(20) * (w - 40), vy = r[1] + 16 + rnd(21) * (h - 32);
    ctx.save();
    ctx.fillStyle = P.stoneShade;
    ctx.beginPath();
    ctx.ellipse(vx, vy, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // Archetypes: paint(ctx, P, lw, m, g, rnd, out)
  // ---------------------------------------------------------------------------------------------

  var ARCH = {};

  ARCH.box = function (ctx, P, lw, m, g, rnd, out) {
    block(ctx, P, lw, m);
    windowGrid(ctx, P, lw, facadeOf(m), out, { skip: doorSkip(g, m) });
    roofClutter(ctx, P, lw, m, rnd);
  };

  ARCH.tower = function (ctx, P, lw, m, g, rnd, out) {
    var tiers = Math.max(1, Math.ceil(m.h / TIER_H));
    for (var k = 0; k < tiers; k++) {
      var inset = k * TIER_INSET;
      var t = { x0: m.x0 + inset, y0: m.y0 + inset, x1: m.x1 - inset, y1: m.y1 - inset };
      if (t.x1 - t.x0 < 24 || t.y1 - t.y0 < 24) break;
      var zb = k * TIER_H, zt = Math.min(m.h, (k + 1) * TIER_H);
      var f = [t.x0, t.y1 - PROJ * zt, t.x1, t.y1 - PROJ * zb];
      var r = [t.x0, t.y0 - PROJ * zt, t.x1, t.y1 - PROJ * zt];
      block(ctx, P, lw, t, { facadeRect: f, roofRect: r, cornice: P.trim });
      // Curtain wall: a glass field with mullions; every cell is a window for the lit schedule.
      var gx0 = f[0] + 5, gx1 = f[2] - 5, gy0 = f[1] + 6, gy1 = f[3] - (k === 0 ? PROJ * FLOOR_H : 4);
      if (gy1 - gy0 < 8) continue;
      var cw = 14, chh = 10;
      var cols = Math.floor((gx1 - gx0) / cw), rows = Math.floor((gy1 - gy0) / chh);
      var sx = gx0 + ((gx1 - gx0) - cols * cw) / 2;
      fillRect(ctx, [sx, gy0, sx + cols * cw, gy0 + rows * chh], P.glass);
      ctx.save();
      ctx.strokeStyle = L().tone(P.shade, -1);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var c = 0; c <= cols; c++) { ctx.moveTo(sx + c * cw, gy0); ctx.lineTo(sx + c * cw, gy0 + rows * chh); }
      for (var rr = 0; rr <= rows; rr++) { ctx.moveTo(sx, gy0 + rr * chh); ctx.lineTo(sx + cols * cw, gy0 + rr * chh); }
      ctx.stroke();
      ctx.restore();
      var skip = k === 0 ? doorSkip(g, m) : null;
      for (var yy = 0; yy < rows; yy++) {
        for (var xx = 0; xx < cols; xx++) {
          var wx = sx + xx * cw + 1.5, wy = gy0 + yy * chh + 1.5;
          if (skip && wx + cw > skip[0] && wx < skip[2] && wy + chh > skip[1]) continue;
          out.push([wx, wy, cw - 3, chh - 3]);
        }
      }
      if (k === 0 && tiers === 1) roofClutter(ctx, P, lw, t, rnd);
    }
    if (tiers > 1) {
      // A mechanical penthouse on the top tier.
      var ti = (tiers - 1) * TIER_INSET;
      var cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2 - PROJ * m.h;
      var pw = Math.min(90, (m.x1 - m.x0 - 2 * ti) * 0.4), ph = Math.min(40, (m.y1 - m.y0 - 2 * ti) * 0.3);
      fillRect(ctx, [cx - pw / 2, cy - ph / 2 - 10, cx + pw / 2, cy + ph / 2 - 10], P.stone);
      fillRect(ctx, [cx - pw / 2, cy + ph / 2 - 10, cx + pw / 2, cy + ph / 2], P.stoneShade);
      outlineRect(ctx, P, lw * 0.7, [cx - pw / 2, cy - ph / 2 - 10, cx + pw / 2, cy + ph / 2]);
    }
  };

  ARCH.hall = function (ctx, P, lw, m, g, rnd, out) {
    block(ctx, P, lw, m, { cornice: P.trim });
    var f = facadeOf(m);
    var fh = f[3] - f[1];
    // Entablature band, columns and tall windows between them.
    fillRect(ctx, [f[0], f[1] + 3, f[2], f[1] + 3 + Math.min(10, fh * 0.12)], L().tone(P.trim, -1));
    var colW = 10, step = 44;
    var n = Math.max(2, Math.floor((f[2] - f[0] - 20) / step));
    var x0 = (f[0] + f[2]) / 2 - ((n - 1) * step) / 2;
    var ct = f[1] + 3 + Math.min(10, fh * 0.12), cb = f[3] - 4;
    var door = g.door && g.door.face === 'S' && g.door.mass === m ? g.door : null;
    var wins = [];
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * step;
      if (door && Math.abs(cx - door.x) < 22) continue;
      fillRect(ctx, [cx - colW / 2, ct, cx + colW / 2, cb], P.trim);
      fillRect(ctx, [cx + colW / 2 - 3, ct, cx + colW / 2, cb], L().tone(P.trim, -1));
      if (i < n - 1) {
        var wx = cx + colW / 2 + 7, ww = step - colW - 14;
        var wy = ct + 8, wh = Math.max(6, (cb - ct) - 22);
        if (!(door && wx < door.x + 22 && wx + ww > door.x - 22)) wins.push([wx, wy, ww, wh]);
      }
    }
    ctx.save();
    ctx.fillStyle = P.glass;
    ctx.beginPath();
    wins.forEach(function (w) { ctx.rect(w[0], w[1], w[2], w[3]); out.push(w); });
    ctx.fill();
    ctx.restore();
    ink(ctx, P, lw * 0.6, function () { wins.forEach(function (w) { ctx.rect(w[0], w[1], w[2], w[3]); }); });
    // Pediment over the entrance (or the centre), resting on the facade top.
    var px = door ? door.x : (f[0] + f[2]) / 2;
    var pw = Math.min((f[2] - f[0]) * 0.45, 280), ph = pw * 0.26;
    ctx.save();
    ctx.fillStyle = L().tone(P.trim, 0);
    ctx.beginPath();
    ctx.moveTo(px - pw / 2, f[1] + 4);
    ctx.lineTo(px, f[1] + 4 - ph);
    ctx.lineTo(px + pw / 2, f[1] + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = L().tone(P.trim, -1);
    ctx.beginPath();
    ctx.moveTo(px - pw / 2 + 14, f[1]);
    ctx.lineTo(px, f[1] - ph + 12);
    ctx.lineTo(px + pw / 2 - 14, f[1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ink(ctx, P, lw, function () {
      ctx.moveTo(px - pw / 2, f[1] + 4); ctx.lineTo(px, f[1] + 4 - ph); ctx.lineTo(px + pw / 2, f[1] + 4); ctx.closePath();
    });
    if (g.roof === 'dome' && m === g.main) dome(ctx, P, lw, m, g);
  };

  /**
   * A hemisphere on the roof, projected like everything else (screenY = y - 0.5 z): its silhouette
   * is the base circle's south half plus a half ellipse of height 1.118 R to the north; the apex
   * (z = R) sits at 0.5 R above the base centre and carries the lantern.
   */
  function dome(ctx, P, lw, m, g) {
    var r0 = roofOf(m);
    var t = g.tops.filter(function (x) { return x.kind === 'dome'; })[0];
    var cx = t ? (t.x0 + t.x1) / 2 : (r0[0] + r0[2]) / 2;
    var cy = t ? (t.y0 + t.y1) / 2 - PROJ * m.h : (r0[1] + r0[3]) / 2;
    var R = t ? Math.min(t.x1 - t.x0, t.y1 - t.y0, 2 * (t.h - m.h)) / 2 : Math.min(m.x1 - m.x0, m.y1 - m.y0) * 0.22;
    var K = Math.sqrt(1 + PROJ * PROJ);
    var col = L().palHas(g.palette + '.dome') ? L().pal(g.palette + '.dome') : P.roof;
    function outline() {
      ctx.moveTo(cx - R, cy);
      ctx.ellipse(cx, cy, R, R * K, 0, Math.PI, 0);
      ctx.ellipse(cx, cy, R, R, 0, 0, Math.PI);
      ctx.closePath();
    }
    // A drum ring on the roof, the shell, its shade band, the highlight and the lantern.
    ctx.save();
    ctx.fillStyle = L().tone(P.walls, -1);
    ctx.beginPath(); ctx.ellipse(cx, cy + 4, R + 10, R + 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); outline(); ctx.fill();
    ctx.clip();
    ctx.fillStyle = L().tone(col, -1);
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.55, R * 1.05, R * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    // Brass ribs (ART_AUDIO §5.2: a brass dome over the navy shell) and a brass ring at the base.
    ctx.strokeStyle = P.trim;
    ctx.lineWidth = Math.max(2, R * 0.035);
    ctx.beginPath();
    for (var k = -2; k <= 2; k++) ctx.ellipse(cx, cy, Math.abs(k) * R / 3 + 0.01, R * K, 0, k < 0 ? Math.PI / 2 : -Math.PI / 2, k < 0 ? Math.PI * 1.5 : Math.PI / 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(3, R * 0.07);
    ctx.beginPath(); ctx.ellipse(cx, cy, R, R, 0, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = L().tone(col, 2);
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(cx - R * 0.38, cy - R * 0.55, R * 0.18, R * 0.32, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ink(ctx, P, lw, outline);
    var ay = cy - PROJ * R;
    fillRect(ctx, [cx - R * 0.09, ay - R * 0.32, cx + R * 0.09, ay], P.trim);
    fillRect(ctx, [cx - R * 0.13, ay - R * 0.36, cx + R * 0.13, ay - R * 0.3], L().tone(P.trim, -1));
    fillRect(ctx, [cx - 1.5, ay - R * 0.55, cx + 1.5, ay - R * 0.36], P.ink);
    outlineRect(ctx, P, lw * 0.7, [cx - R * 0.09, ay - R * 0.32, cx + R * 0.09, ay]);
  }

  ARCH.shop = function (ctx, P, lw, m, g, rnd, out) {
    block(ctx, P, lw, m);
    var f = facadeOf(m), fh = f[3] - f[1];
    // Ground floor: a big display window under a striped awning.
    var gw = (f[2] - f[0]) * 0.6, gx = (f[0] + f[2]) / 2 - gw / 2;
    var door = g.door && g.door.face === 'S' && g.door.mass === m ? g.door : null;
    if (door) gx = Math.abs(door.x - f[0]) > Math.abs(door.x - f[2]) ? f[0] + 16 : f[2] - 16 - gw;
    var gh = Math.min(fh * 0.42, 34), gy = f[3] - 6 - gh;
    var disp = [gx, gy, gx + gw, gy + gh];
    fillRect(ctx, disp, P.glass);
    ctx.save();
    ctx.fillStyle = L().tone(P.glass, 1);
    ctx.beginPath();
    ctx.moveTo(gx + gw * 0.15, gy); ctx.lineTo(gx + gw * 0.3, gy); ctx.lineTo(gx + gw * 0.18, gy + gh); ctx.lineTo(gx + gw * 0.03, gy + gh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    outlineRect(ctx, P, lw * 0.7, disp);
    out.push([disp[0] + 2, disp[1] + 2, gw - 4, gh - 4]);
    stripes(ctx, P, lw, [gx - 6, gy - 10, gx + gw + 6, gy - 2], 'x');
    windowGrid(ctx, P, lw, [f[0], f[1], f[2], gy - 12], out, { bottom: 0, top: 6 });
    // The roof sign stands on the roof's south edge.
    if (m === g.main) roofSign(ctx, P, lw, m, g);
  };

  function roofSign(ctx, P, lw, m, g) {
    var f = facadeOf(m);
    var t = g.tops.filter(function (x) { return x.kind === 'sign'; })[0];
    var board, top = null;
    if (t) {
      // A sign box standing on the roof: its south face carries the lettering.
      board = [t.x0, t.y1 - PROJ * t.h, t.x1, t.y1 - PROJ * m.h];
      top = [t.x0, t.y0 - PROJ * t.h, t.x1, t.y1 - PROJ * t.h];
      fillRect(ctx, [t.x0 + 12, board[3] - 2, t.x0 + 20, t.y1 - PROJ * m.h + 6], P.stoneShade);
      fillRect(ctx, [t.x1 - 20, board[3] - 2, t.x1 - 12, t.y1 - PROJ * m.h + 6], P.stoneShade);
    } else {
      var sh = PROJ * Math.max(30, (g.signH || m.h + 70) - m.h);
      var sw = Math.min((f[2] - f[0]) * 0.55, 260);
      var cx = (f[0] + f[2]) / 2;
      board = [cx - sw / 2, f[1] - sh, cx + sw / 2, f[1] - sh * 0.3];
      fillRect(ctx, [cx - sw / 3 - 3, board[3], cx - sw / 3 + 3, f[1]], P.stoneShade);
      fillRect(ctx, [cx + sw / 3 - 3, board[3], cx + sw / 3 + 3, f[1]], P.stoneShade);
    }
    if (top) fillRect(ctx, top, L().tone(P.trim, 1));
    fillRect(ctx, board, P.trim);
    fillRect(ctx, [board[0], board[3] - 3, board[2], board[3]], L().tone(P.trim, -1));
    outlineRect(ctx, P, lw, top ? [board[0], top[1], board[2], board[3]] : board);
    var box = [board[0] + 6, board[1] + 3, board[2] - 6, board[3] - 3];
    textOn(ctx, signText(g), box, contrastInk(P, P.trim));
    g.signRect = board;
    g.signBox = { r: box };
    covered(g, top ? [board[0], top[1], board[2], board[3]] : board);
  }

  /** Records a rect painted over the facade after its windows (a sign, a plate): no lit window shows through it. */
  function covered(g, r) { if (g.covers) g.covers.push(r); }

  /** Placeholder cubes for tall roof features a detail hook would draw (the casino's dice). */
  function topBoxes(ctx, P, lw, g) {
    g.tops.forEach(function (t) {
      if (t.kind === 'turret' || t.kind === 'dome' || t.kind === 'sign') return;
      var m = g.main, n = t.kind === 'dice' ? 2 : 1;
      var w = (t.x1 - t.x0) / n;
      for (var i = 0; i < n; i++) {
        var s = Math.max(8, Math.min(w - 12, t.y1 - t.y0, t.h - m.h));
        var bx0 = t.x0 + i * w + (w - s) / 2;
        var by1 = t.y1 - (i % 2 ? (t.y1 - t.y0 - s) * 0.5 : 0);
        var zb = m.h, zt = m.h + s;
        var face = [bx0, by1 - PROJ * zt, bx0 + s, by1 - PROJ * zb];
        var topr = [bx0, by1 - s - PROJ * zt, bx0 + s, by1 - PROJ * zt];
        var cube = t.kind === 'dice' ? P.trim : P.walls;
        fillRect(ctx, topr, L().tone(cube, t.kind === 'dice' ? 0 : 1));
        fillRect(ctx, face, L().tone(cube, -1));
        outlineRect(ctx, P, lw, [topr[0], topr[1], face[2], face[3]]);
        if (t.kind !== 'dice') continue;
        // Pips on the top face: a one and a three.
        ctx.save();
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        var cx = (topr[0] + topr[2]) / 2, cy = (topr[1] + topr[3]) / 2, pr = s * 0.08;
        var pips = i === 0 ? [[0, 0]] : [[-0.28, -0.28], [0, 0], [0.28, 0.28]];
        pips.forEach(function (q) {
          ctx.moveTo(cx + q[0] * s + pr, cy + q[1] * s);
          ctx.ellipse(cx + q[0] * s, cy + q[1] * s, pr, pr, 0, 0, Math.PI * 2);
        });
        ctx.fill();
        ctx.restore();
      }
    });
  }

  function stripes(ctx, P, lw, r, axis) {
    var n = Math.max(2, Math.round((axis === 'x' ? r[2] - r[0] : r[3] - r[1]) / 12));
    for (var i = 0; i < n; i++) {
      var c = i % 2 ? P.walls : P.trim;
      if (axis === 'x') fillRect(ctx, [r[0] + (r[2] - r[0]) * i / n, r[1], r[0] + (r[2] - r[0]) * (i + 1) / n, r[3]], c);
      else fillRect(ctx, [r[0], r[1] + (r[3] - r[1]) * i / n, r[2], r[1] + (r[3] - r[1]) * (i + 1) / n], c);
    }
    outlineRect(ctx, P, lw * 0.8, r);
  }

  ARCH.castle = function (ctx, P, lw, m, g, rnd, out) {
    var w = m.x1 - m.x0, d = m.y1 - m.y0;
    var R = Math.max(26, Math.min(64, Math.min(w, d) * 0.13));
    var th = g.towerH || m.h + 100;
    // Corner towers: the worldmap's turret tops, or four at the footprint's corners.
    var towers = g.tops.filter(function (t) { return t.kind === 'turret'; }).map(function (t) {
      return { x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2, r: Math.min(t.x1 - t.x0, t.y1 - t.y0) / 2, h: t.h };
    });
    if (!towers.length) {
      towers = [[m.x0 + R, m.y0 + R], [m.x1 - R, m.y0 + R], [m.x0 + R, m.y1 - R * 0.6], [m.x1 - R, m.y1 - R * 0.6]]
        .map(function (c) { return { x: c[0], y: c[1], r: R, h: th }; });
    }
    var midY = (m.y0 + m.y1) / 2;
    var north = towers.filter(function (t) { return t.y < midY; }), south = towers.filter(function (t) { return t.y >= midY; });
    var tallest = towers.reduce(function (a, t) { return !a || t.x > a.x ? t : a; }, null);
    var behind = [];
    north.forEach(function (t) { tower(ctx, P, lw, t.x, t.y, t.r, t.h, t.x > (m.x0 + m.x1) / 2, behind); });
    block(ctx, P, lw, m, { facade: P.shade, roof: P.walls, noParapet: true, cornice: L().tone(P.walls, 1) });
    // The keep hides the lower part of the north towers: their slit windows stay dark behind it.
    behind.forEach(function (w) { if (!hits([w[0], w[1], w[0] + w[2], w[1] + w[3]], m.proj)) out.push(w); });
    // Crenellations along the south and north roof edges.
    var r = roofOf(m);
    var inset = towers.length ? Math.max.apply(null, towers.map(function (t) { return t.r; })) * 2 : R * 2;
    merlons(ctx, P, lw, r[0] + inset, r[2] - inset, r[3], 1);
    merlons(ctx, P, lw, r[0] + inset, r[2] - inset, r[1] + 6, 0.8);
    // Arrow slits along the facade.
    var f = facadeOf(m);
    ctx.save();
    ctx.fillStyle = L().tone(P.shade, -2);
    ctx.beginPath();
    for (var x = f[0] + inset + 20; x < f[2] - inset - 20; x += 46) {
      if (g.door && g.door.mass === m && Math.abs(x - g.door.x) < 50) continue;
      ctx.rect(x - 2, f[1] + (f[3] - f[1]) * 0.3, 4, (f[3] - f[1]) * 0.22);
    }
    ctx.fill();
    ctx.restore();
    // The tallest cone tower (ART_AUDIO §5.2) is the south-east one.
    south.forEach(function (t) { tower(ctx, P, lw, t.x, t.y, t.r * 1.05, t === tallest ? t.h + 40 : t.h, t.x > (m.x0 + m.x1) / 2, out); });
  };

  function merlons(ctx, P, lw, x0, x1, y, k) {
    var mw = 12, gap = 10, mh = 8 * k;
    ctx.save();
    ctx.beginPath();
    for (var x = x0; x + mw <= x1; x += mw + gap) ctx.rect(x, y - mh, mw, mh);
    ctx.fillStyle = P.walls;
    ctx.fill();
    ctx.restore();
    ink(ctx, P, lw * 0.5, function () { for (var x = x0; x + mw <= x1; x += mw + gap) ctx.rect(x, y - mh, mw, mh); });
  }

  function tower(ctx, P, lw, cx, cy, R, th, flagRight, out) {
    var top = cy - PROJ * th, base = cy + R * 0.45;
    fillRect(ctx, [cx - R, top, cx + R, base], P.shade);
    fillRect(ctx, [cx - R, top, cx - R * 0.45, base], L().tone(P.shade, 1));
    ctx.save();
    ctx.fillStyle = P.walls;
    ctx.beginPath();
    ctx.ellipse(cx, top, R, R * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Cone roof with a highlight half and a pennant.
    var ch = R * 1.9;
    ctx.save();
    ctx.fillStyle = P.roof;
    ctx.beginPath();
    ctx.moveTo(cx - R - 5, top); ctx.lineTo(cx, top - ch); ctx.lineTo(cx + R + 5, top);
    ctx.ellipse(cx, top, R + 5, R * 0.45, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = L().tone(P.roof, 1);
    ctx.beginPath();
    ctx.moveTo(cx - R - 5, top); ctx.lineTo(cx, top - ch); ctx.lineTo(cx - R * 0.2, top + R * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    var fx = cx, fy = top - ch;
    fillRect(ctx, [fx - 1, fy - 22, fx + 1, fy], P.ink);
    ctx.save();
    ctx.fillStyle = P.trim;
    ctx.beginPath();
    var s = flagRight ? 1 : -1;
    ctx.moveTo(fx, fy - 22); ctx.lineTo(fx + s * 20, fy - 17); ctx.lineTo(fx, fy - 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ink(ctx, P, lw, function () {
      ctx.moveTo(cx - R, top); ctx.lineTo(cx - R, base); ctx.lineTo(cx + R, base); ctx.lineTo(cx + R, top);
      ctx.moveTo(cx - R - 5, top); ctx.lineTo(cx, top - ch); ctx.lineTo(cx + R + 5, top);
      ctx.moveTo(cx + R + 5, top); ctx.ellipse(cx, top, R + 5, R * 0.45, 0, 0, Math.PI);
    });
    out.push([cx - 3, top + (base - top) * 0.35, 6, 9]);
  }

  ARCH.house = function (ctx, P, lw, m, g, rnd, out) {
    var f = facadeOf(m);
    var d = m.y1 - m.y0;
    var ridgeH = Math.min(d * 0.35, 90);
    var yS = m.y1 - PROJ * m.h, yN = m.y0 - PROJ * m.h;
    var yR = (m.y0 + m.y1) / 2 - PROJ * (m.h + ridgeH);
    fillRect(ctx, f, P.walls);
    fillRect(ctx, [f[0], f[3] - 5, f[2], f[3]], L().tone(P.walls, -1));
    var ex = g.def.exterior || {};
    var floors = ex.floors || Math.max(1, Math.round(m.h / 66));
    var fh = (f[3] - f[1] - 6) / floors;
    windowGrid(ctx, P, lw, f, out, { floor: fh, col: 44, w: 16, h: Math.min(14, fh * 0.55), bottom: 0, top: 3, skip: doorSkip(g, m) });
    // Pitched roof: the north slope catches the light, the south slope is the base tone.
    var o = 6;
    ctx.save();
    ctx.fillStyle = L().tone(P.roof, 1);
    ctx.beginPath();
    ctx.moveTo(m.x0 - o, yR); ctx.lineTo(m.x1 + o, yR); ctx.lineTo(m.x1 + o, yN); ctx.lineTo(m.x0 - o, yN);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = P.roof;
    ctx.beginPath();
    ctx.moveTo(m.x0 - o, yS + 3); ctx.lineTo(m.x1 + o, yS + 3); ctx.lineTo(m.x1 + o, yR); ctx.lineTo(m.x0 - o, yR);
    ctx.closePath();
    ctx.fill();
    // Shingle rows on the south slope.
    ctx.strokeStyle = L().tone(P.roof, -1);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var y = yR + 10; y < yS; y += 10) { ctx.moveTo(m.x0 - o, y); ctx.lineTo(m.x1 + o, y); }
    ctx.stroke();
    ctx.restore();
    // Chimney on the north slope.
    var chx = m.x1 - Math.min(80, (m.x1 - m.x0) * 0.2);
    fillRect(ctx, [chx - 12, yN + (yR - yN) * 0.2 - 18, chx + 12, yN + (yR - yN) * 0.6], P.shade);
    fillRect(ctx, [chx - 14, yN + (yR - yN) * 0.2 - 22, chx + 14, yN + (yR - yN) * 0.2 - 16], P.trim);
    ink(ctx, P, lw, function () {
      ctx.moveTo(m.x0 - o, yS + 3); ctx.lineTo(m.x0 - o, yN); ctx.lineTo(m.x1 + o, yN); ctx.lineTo(m.x1 + o, yS + 3); ctx.closePath();
      ctx.moveTo(m.x0 - o, yR); ctx.lineTo(m.x1 + o, yR);
      ctx.rect(f[0], f[1], f[2] - f[0], f[3] - f[1]);
      ctx.rect(chx - 12, yN + (yR - yN) * 0.2 - 18, 24, (yR - yN) * 0.4 + 18);
    });
  };

  ARCH.depot = function (ctx, P, lw, m, g, rnd, out) {
    block(ctx, P, lw, m, { noParapet: true });
    var r = roofOf(m);
    // Sawtooth roof: panels with north-facing glazing strips.
    var tooth = 64;
    var n = Math.max(2, Math.floor((r[2] - r[0]) / tooth));
    var tw = (r[2] - r[0]) / n;
    ctx.save();
    for (var i = 0; i < n; i++) {
      var x = r[0] + i * tw;
      fillRect(ctx, [x, r[1] + 4, x + tw * 0.72, r[3] - 4], L().tone(P.walls, i % 2 ? 0 : 0.5));
      fillRect(ctx, [x + tw * 0.72, r[1] + 4, x + tw, r[3] - 4], P.glass);
      out.push([x + tw * 0.72 + 2, r[1] + 8, tw * 0.28 - 4, r[3] - r[1] - 16]);
    }
    ctx.restore();
    ink(ctx, P, lw * 0.6, function () {
      for (var i = 1; i < n; i++) { ctx.moveTo(r[0] + i * tw, r[1] + 4); ctx.lineTo(r[0] + i * tw, r[3] - 4); }
    });
    // Bay doors on the south face.
    var f = facadeOf(m), fh = f[3] - f[1];
    var bays = Math.max(1, Math.min(4, Math.floor((f[2] - f[0]) / 140)));
    var bw = Math.min(90, (f[2] - f[0]) / (bays + 1)), bh = Math.min(fh - 10, 44);
    for (var b = 0; b < bays; b++) {
      var bx = f[0] + (f[2] - f[0]) * (b + 1) / (bays + 1) - bw / 2;
      var bay = [bx, f[3] - 4 - bh, bx + bw, f[3] - 4];
      fillRect(ctx, bay, L().tone(P.shade, -1));
      ctx.save();
      ctx.strokeStyle = L().tone(P.shade, -2);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var y = bay[1] + 6; y < bay[3]; y += 6) { ctx.moveTo(bay[0], y); ctx.lineTo(bay[2], y); }
      ctx.stroke();
      ctx.restore();
      fillRect(ctx, [bay[0] - 3, bay[1] - 4, bay[2] + 3, bay[1]], P.trim);
      outlineRect(ctx, P, lw * 0.7, bay);
    }
    windowGrid(ctx, P, lw, [f[0], f[1], f[2], f[3] - bh - 8], out, { bottom: 0, col: 34 });
  };

  ARCH.vehicle = function (ctx, P, lw, m, g, rnd, out) {
    var f = facadeOf(m), r = roofOf(m);
    fillRect(ctx, f, P.walls);
    fillRect(ctx, r, P.walls);
    var w = r[2] - r[0];
    fillRect(ctx, [r[0] + w * 0.15, r[1] + 8, r[0] + w * 0.3, r[3] - 8], P.stripe);
    fillRect(ctx, [r[2] - w * 0.3, r[1] + 8, r[2] - w * 0.15, r[3] - 8], P.stripe);
    fillRect(ctx, [f[0] + 6, f[1] + 6, f[2] - 6, f[1] + (f[3] - f[1]) * 0.45], P.glass);
    out.push([f[0] + 8, f[1] + 8, f[2] - f[0] - 16, (f[3] - f[1]) * 0.45 - 4]);
    fillRect(ctx, [f[0], f[3] - 8, f[2], f[3] - 4], P.stripe);
    ctx.save();
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.ellipse(f[0] + 14, f[3], 10, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(f[2] - 14, f[3], 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ink(ctx, P, lw, function () { ctx.rect(r[0], r[1], w, f[3] - r[1]); ctx.moveTo(f[0], f[1]); ctx.lineTo(f[2], f[1]); });
  };

  // ---------------------------------------------------------------------------------------------
  // Door treatments (ART_AUDIO §5.1): south step and door, east / west awning and blade sign,
  // north porch sign post and canopy. Ground decals (mats, steps, stoops) are baked into the
  // ground chunks by js/render/ground.js so that people walk over them.
  // ---------------------------------------------------------------------------------------------

  function doorSkip(g, m) {
    if (!g.door || g.door.face !== 'S' || g.door.mass !== m) return null;
    return [g.door.x - 30, m.y1 - PROJ * Math.min(m.h, 110), g.door.x + 30, m.y1];
  }

  function doorSouth(ctx, P, lw, g) {
    var d = g.door, m = d.mass;
    var fh = PROJ * m.h;
    var big = g.archetype === 'hall' || g.archetype === 'castle';
    var dw = big ? 44 : 28, dh = Math.min(big ? 52 : 38, fh - 8);
    var r = [d.x - dw / 2, m.y1 - dh, d.x + dw / 2, m.y1];
    fillRect(ctx, [r[0] - 4, r[1] - 5, r[2] + 4, r[3]], P.trim);
    fillRect(ctx, r, L().tone(P.shade, -2));
    if (g.archetype === 'castle') {
      ctx.save();
      ctx.strokeStyle = P.stoneShade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var x = r[0] + 6; x < r[2]; x += 8) { ctx.moveTo(x, r[1]); ctx.lineTo(x, r[3]); }
      ctx.stroke();
      ctx.restore();
    } else {
      fillRect(ctx, [d.x - 1, r[1] + 3, d.x + 1, r[3]], L().tone(P.shade, -1));
      fillRect(ctx, [r[0] + 3, r[1] + 4, d.x - 3, r[1] + dh * 0.45], P.glass);
      fillRect(ctx, [d.x + 3, r[1] + 4, r[2] - 3, r[1] + dh * 0.45], P.glass);
    }
    outlineRect(ctx, P, lw * 0.8, r);
    // A lintel sign plate above the door (box, house and depot fronts).
    if (g.archetype !== 'shop' && g.archetype !== 'hall' && g.archetype !== 'castle' && fh > dh + 26) {
      var t = signText(g);
      if (t) {
        var pw = Math.min(m.x1 - m.x0 - 20, Math.max(90, t.length * 11));
        var plate = [d.x - pw / 2, r[1] - 22, d.x + pw / 2, r[1] - 7];
        fillRect(ctx, plate, P.trim);
        outlineRect(ctx, P, lw * 0.7, plate);
        textOn(ctx, t, plate, contrastInk(P, P.trim), { fill: 0.8 });
        g.signRect = plate;
        g.signBox = { r: plate, fill: 0.8 };
        covered(g, plate);
      }
    }
    if (g.stairs) {
      var s = g.stairs;
      for (var k = 0; k < 3; k++) {
        var y0 = s[1] + k * (s[3] - s[1]) / 3, y1 = s[1] + (k + 1) * (s[3] - s[1]) / 3;
        fillRect(ctx, [s[0] - k * 8, y0, s[2] + k * 8, y1], L().tone(P.trim, k === 1 ? -1 : 0));
      }
      outlineRect(ctx, P, lw * 0.6, [s[0] - 16, s[1], s[2] + 16, s[3]]);
    }
  }

  function doorSide(ctx, P, lw, g) {
    var d = g.door, sx = d.face === 'E' ? 1 : -1;
    // A name plate on the facade's door-side end (the shop's roof sign already carries the name).
    var fm = d.mass || g.main;
    if (g.archetype !== 'shop' && g.archetype !== 'house' && g.archetype !== 'hall') {
      var t = signText(g), f = facadeOf(fm);
      if (t && f[3] - f[1] > 40) {
        var pw = Math.min((f[2] - f[0]) * 0.45, Math.max(80, t.length * 11));
        var px = sx > 0 ? f[2] - 14 - pw : f[0] + 14;
        var plate = [px, f[1] + 8, px + pw, f[1] + 26];
        fillRect(ctx, plate, P.trim);
        outlineRect(ctx, P, lw * 0.7, plate);
        textOn(ctx, t, plate, contrastInk(P, P.trim), { fill: 0.8 });
        if (!g.signRect) { g.signRect = plate; g.signBox = { r: plate, fill: 0.8 }; }
        covered(g, plate);
      }
    }
    var xi = d.x, xo = d.x + sx * AWNING_DEPTH;
    var yi0 = d.y - PORCH_HALF - PROJ * AWNING_Z_IN, yi1 = d.y + PORCH_HALF - PROJ * AWNING_Z_IN;
    var yo0 = d.y - PORCH_HALF - PROJ * AWNING_Z_OUT, yo1 = d.y + PORCH_HALF - PROJ * AWNING_Z_OUT;
    // Striped canopy (top surface), then the valance at its south end.
    var n = 8;
    for (var i = 0; i < n; i++) {
      var a = i / n, b = (i + 1) / n;
      ctx.save();
      ctx.fillStyle = i % 2 ? P.walls : P.trim;
      ctx.beginPath();
      ctx.moveTo(xi, yi0 + (yi1 - yi0) * a); ctx.lineTo(xo, yo0 + (yo1 - yo0) * a);
      ctx.lineTo(xo, yo0 + (yo1 - yo0) * b); ctx.lineTo(xi, yi0 + (yi1 - yi0) * b);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = L().tone(P.trim, -1);
    ctx.beginPath();
    ctx.moveTo(xi, yi1); ctx.lineTo(xo, yo1); ctx.lineTo(xo, yo1 + 8); ctx.lineTo(xi, yi1 + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ink(ctx, P, lw, function () {
      ctx.moveTo(xi, yi0); ctx.lineTo(xo, yo0); ctx.lineTo(xo, yo1 + 8); ctx.lineTo(xi, yi1 + 8); ctx.closePath();
      ctx.moveTo(xi, yi1); ctx.lineTo(xo, yo1);
    });
    // Blade sign standing out from the wall at the awning's north end.
    var bx0 = Math.min(xi + sx * 4, xi + sx * 30), bx1 = Math.max(xi + sx * 4, xi + sx * 30);
    var by1 = yi0 - 6, by0 = by1 - 30;
    fillRect(ctx, [bx0, by0, bx1, by1], P.trim);
    fillRect(ctx, [Math.min(xi, xi + sx * 4), by0 + 12, Math.max(xi, xi + sx * 4), by0 + 16], P.ink);
    ctx.save();
    ctx.fillStyle = contrastInk(P, P.trim);
    ctx.beginPath();
    ctx.arc((bx0 + bx1) / 2, (by0 + by1) / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    outlineRect(ctx, P, lw * 0.8, [bx0, by0, bx1, by1]);
    g.bladeRect = [bx0, by0, bx1, by1];
    covered(g, g.bladeRect);
    covered(g, [Math.min(xi, xo), yi0, Math.max(xi, xo), yo1 + 8]);   // the awning
  }

  function doorNorth(ctx, P, lw, g) {
    var d = g.door, c = g.canopy;
    // Canopy strip on the annex roof's north edge, with the sign lettering on top.
    fillRect(ctx, [c[0], c[3] - 6, c[2], c[3]], L().tone(P.trim, -1));
    fillRect(ctx, [c[0], c[1], c[2], c[3] - 6], P.trim);
    outlineRect(ctx, P, lw, [c[0], c[1], c[2], c[3]]);
    var box = [c[0] + 6, c[1] + 2, c[2] - 6, c[3] - 8];
    textOn(ctx, signText(g), box, contrastInk(P, P.trim), { fill: 0.8 });
    g.signRect = c;
    g.signBox = { r: box, fill: 0.8 };
    covered(g, c);
    // Standing sign post on the porch's outer strip.
    var p = g.post;
    var top = p.y - PROJ * p.h;
    fillRect(ctx, [p.x - 2, top, p.x + 2, p.y], P.ink);
    var board = [p.x - p.w / 2, top - 24, p.x + p.w / 2, top];
    fillRect(ctx, board, P.trim);
    outlineRect(ctx, P, lw * 0.7, board);
    textOn(ctx, signText(g), [board[0] + 3, board[1] + 3, board[2] - 3, board[3] - 3], contrastInk(P, P.trim), { fill: 0.7 });
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.ellipse(p.x + 4, p.y + 3, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // Neon (small sprites for the emissive pass) and the casino's marquee bulbs
  // ---------------------------------------------------------------------------------------------

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
      return c;
    }
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    return null;
  }

  function neonFor(g, P, sc, out) {
    var r = g.signRect || g.bladeRect;
    if (!r) return;
    var t = signText(g);
    var ww = r[2] - r[0] + 16, hh = r[3] - r[1] + 16;
    var k = Math.min(sc, NEON_MAX[0] / ww, NEON_MAX[1] / hh);
    var c = makeCanvas(ww * k, hh * k);
    if (!c) return;
    var x = c.getContext('2d');
    x.scale(k, k);
    x.translate(8 - r[0], 8 - r[1]);
    var tube = L().tone(P.trim, 1);
    x.shadowColor = P.trim;
    x.shadowBlur = 6 * k;
    x.strokeStyle = tube;
    x.lineWidth = 2;
    x.strokeRect(r[0] + 2, r[1] + 2, r[2] - r[0] - 4, r[3] - r[1] - 4);
    // The tubes trace the lettering exactly as the sign was painted (its box and size, g.signBox):
    // a smaller copy lit over the painted letters doubled every neon sign at night (wave-1 integration).
    if (t && r === g.signRect) {
      var box = g.signBox || { r: [r[0] + 6, r[1] + 3, r[2] - 6, r[3] - 3] };
      textOn(x, t, box.r, tube, { fill: box.fill });
    }
    out.push({ sprite: c, x: r[0] - 8, y: r[1] - 8, w: ww, h: hh, px: c.width * c.height });
  }

  function marquee(ctx, P, g, out) {
    var m = g.main, f = facadeOf(m);
    ctx.save();
    ctx.fillStyle = P.trim;
    ctx.beginPath();
    for (var x = f[0] + 10; x < f[2] - 6; x += 16) {   // under the cornice, clear of the name plate
      ctx.rect(x - 2, f[1] + 3, 4, 4);
      out.push([x - 2, f[1] + 3, 4, 4]);
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // Baking
  // ---------------------------------------------------------------------------------------------

  // The paper grain over a sprite (ART_AUDIO §1.1 rule 3: multiplied at 6 %). A multiply over the
  // sprite's transparent pixels would leave a faint pale veil around set-back tiers and roofs, so
  // the grain is laid 'source-atop' as ink whose alpha is (1 - paper luminance): over any colour
  // that darkens like a multiply (the same construction as SR.art.paper.grainURL), and it never
  // touches a pixel the building did not paint.
  var inkGrain = null;
  var inkGrainSrc = null;

  function grainInk() {
    var P = SR.art.paper;
    if (!P || typeof P.grain !== 'function') return null;
    var src;
    try { src = P.grain('multiply'); } catch (e) { src = null; }
    if (!src || typeof src.getContext !== 'function') {
      SR.util.warnOnce('exterior.grain', 'SR.art.exterior: paper grain unavailable');
      return null;
    }
    if (inkGrain && inkGrainSrc === src) return inkGrain;
    var w = src.width, h = src.height;
    var sd = src.getContext('2d').getImageData(0, 0, w, h).data;
    var c = makeCanvas(w, h);
    if (!c) return null;
    var x = c.getContext('2d');
    var img = x.createImageData(w, h), d = img.data;
    var ink = L().chan(L().pal('ink', 0.1));
    for (var o = 0; o < d.length; o += 4) {
      d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2];
      d[o + 3] = 255 - sd[o];
    }
    x.putImageData(img, 0, 0);
    inkGrain = c;
    inkGrainSrc = src;
    return c;
  }

  /**
   * Starts an incremental bake: one step per call (setup, each mass back to front, then the door
   * treatment, signs, detail, grain and neon), so a frame bakes one mass (ARCHITECTURE §9.3).
   * @param {object} def the worldmap building entry
   * @param {number} zoom the (quantized) zoom
   * @param {number} dpr device pixels per logical unit for the sprite (the renderer caps it at 1.5)
   * @returns {{step: function(): boolean, done: boolean, result: object|null, steps: number}}
   */
  function baker(def, zoom, dpr) {
    PROJ = projK();
    var g = geom(def);
    var sc = Math.max(0.05, zoom * (dpr || 1));
    var P = colours(g);
    var lw = Math.max(2, 1.5 / sc);
    var rnd = function (i) { return L().hash01(g.id, 'ext', i); };
    var windows = [];
    var neon = [];
    var covers = [];      // rects painted over the facade after its windows (this bake's)
    var b = g.bounds;
    var cv = null, ctx = null, idx = 0;
    var steps = [];
    var job = { done: false, result: null, steps: 0, id: g.id, zoom: zoom, dpr: dpr, scale: sc, px: 0 };
    steps.push(function () {
      var w = Math.ceil((b[2] - b[0]) * sc), h = Math.ceil((b[3] - b[1]) * sc);
      cv = makeCanvas(w, h);
      if (!cv) throw new Error('SR.art.exterior: no canvas available');
      ctx = cv.getContext('2d');
      ctx.setTransform(sc, 0, 0, sc, -b[0] * sc, -b[1] * sc);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      job.px = cv.width * cv.height;
    });
    g.order.forEach(function (m) {
      steps.push(function () {
        var paint = ARCH[g.archetype] || ARCH.box;
        if (g.archetype === 'hall' || g.archetype === 'castle' || g.archetype === 'tower' || m === g.main) paint(ctx, P, lw, m, g, rnd, windows);
        else ARCH[m.role === 'tower' ? 'tower' : 'box'](ctx, P, lw, m, g, rnd, windows);
        // Windows painted earlier and now covered by this mass would glow through it at night.
        for (var i = windows.length - 1; i >= 0; i--) {
          var w = windows[i];
          if (w.m !== undefined && w.m !== m.i && hits([w[0], w[1], w[0] + w[2], w[1] + w[3]], m.proj)) windows.splice(i, 1);
        }
        for (var j = 0; j < windows.length; j++) if (windows[j].m === undefined) windows[j].m = m.i;
      });
    });
    steps.push(function () {
      if (g.door) {
        if (g.door.face === 'S') doorSouth(ctx, P, lw, g);
        else if (g.door.face === 'E' || g.door.face === 'W') doorSide(ctx, P, lw, g);
        else if (g.door.face === 'N') doorNorth(ctx, P, lw, g);
      }
      // Signs, plates and awnings painted over windows hide them: no lit glass through a sign at night.
      dropCovered(windows, covers);
      if (g.id === 'casino' || (g.def.exterior && g.def.exterior.marquee)) marquee(ctx, P, g, windows);
      var ex = SR.reg && SR.reg.exterior && SR.reg.exterior[g.id];
      if (!ex || typeof ex.detail !== 'function') topBoxes(ctx, P, lw, g);
      if (ex && typeof ex.detail === 'function') {
        try {
          ex.detail(ctx, detailGeom(g, P, lw, zoom, dpr, sc, windows), SR.state);
        } catch (e) {
          SR.util.warnOnce('exterior.detail:' + g.id, 'SR.art.exterior: detail(' + g.id + ') threw: ' + e.message);
        }
      }
      var gi = grainInk();
      var pat = gi ? ctx.createPattern(gi, 'repeat') : null;
      if (pat) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = GRAIN_ALPHA;
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.restore();
      }
      if (g.neon) neonFor(g, P, sc, neon);
      var list = windows.map(function (w) { return [w[0], w[1], w[2], w[3]]; });
      job.result = {
        id: g.id, albedo: cv, windows: list, neon: neon, bounds: b.slice(), zoom: zoom, dpr: dpr, scale: sc,
        px: cv.width * cv.height, neonPx: neon.reduce(function (s, n) { return s + n.px; }, 0),
      };
    });
    job.total = steps.length;
    job.step = function () {
      if (job.done) return true;
      g.covers = covers;    // geom is shared: another bake of this building may run in between
      try { steps[idx++](); } finally { g.covers = null; }
      job.steps = idx;
      if (idx >= steps.length) job.done = true;
      return job.done;
    };
    return job;
  }

  /** Removes (in place) the window rects [x, y, w, h] that intersect any of the rects [x0, y0, x1, y1]. */
  function dropCovered(windows, rects) {
    if (!rects || !rects.length) return;
    for (var i = windows.length - 1; i >= 0; i--) {
      var w = windows[i], wr = [w[0], w[1], w[0] + w[2], w[1] + w[3]];
      for (var k = 0; k < rects.length; k++) if (hits(wr, rects[k])) { windows.splice(i, 1); break; }
    }
  }

  function detailGeom(g, P, lw, zoom, dpr, sc, windows) {
    return {
      id: g.id, archetype: g.archetype, roof: g.roof, masses: g.masses.map(function (m) {
        return { role: m.role, rect: [m.x0, m.y0, m.x1, m.y1], h: m.h, proj: m.proj.slice(), facade: facadeOf(m), roof: roofOf(m) };
      }),
      door: g.door ? { face: g.door.face, x: g.door.x, y: g.door.y } : null,
      porch: g.porch, visible: g.visible, awning: g.awning, canopy: g.canopy, sign: g.signRect || null,
      bounds: g.bounds, zoom: zoom, dpr: dpr, scale: sc, lineWidth: lw, colors: P, windows: windows,
      tone: function (c, d) { return L().tone(c, d); }, pal: function (k) { return L().pal(k); }, projection: PROJ,
    };
  }

  /**
   * Bakes one building completely.
   * @returns {{albedo: HTMLCanvasElement, windows: number[][], neon: object[], bounds: number[], scale: number, px: number}}
   */
  function build(def, zoom, dpr) {
    var job = baker(def, zoom, dpr);
    while (!job.step()) { /* bake every step now */ }
    return job.result;
  }

  /** Draws a baked (or placeholder) building's flat mass boxes in its palette: the frames before its sprite is ready. */
  function placeholder(ctx, def) {
    var g = geom(def), P = colours(g);
    for (var i = 0; i < g.order.length; i++) {
      var m = g.order[i];
      ctx.fillStyle = P.walls;
      ctx.fillRect(m.x0, m.y0 - PROJ * m.h, m.x1 - m.x0, m.y1 - m.y0);
      ctx.fillStyle = P.shade;
      ctx.fillRect(m.x0, m.y1 - PROJ * m.h, m.x1 - m.x0, PROJ * m.h);
    }
    return g.order.length * 2;
  }

  /** Clears the geometry cache (the worldmap changed). */
  function reset() { if (geomCache) geomCache = new WeakMap(); }

  SR.art.exterior = {
    build: build,
    baker: baker,
    geom: geom,
    colours: colours,
    placeholder: placeholder,
    reset: reset,
    archetypes: Object.keys(ARCH),
  };
  /** The projection factor in use (B-15 `projection.k`: screenY = y - k z), read from tuning per bake. */
  Object.defineProperty(SR.art.exterior, 'PROJ', { enumerable: true, get: function () { return PROJ; } });
})();
