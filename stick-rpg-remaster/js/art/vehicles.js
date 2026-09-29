// js/art/vehicles.js — owner: W1-A. SR.art.vehicles: every vehicle seen from 3/4 above (ART_AUDIO §8)
// and the Fold Rescue plane (ART_AUDIO §12). Cars are small convex solids (a lower body and a cabin
// frustum) rotated in the ground plane and projected like everything else in the city
// (screenY = y - 0.5 z, GDD §3.7), so a face shows when it faces south or up: roof, windshield and
// the facing side panel, in all 8 directions without mirrored art. Colours are palette keys.
//
// draw(ctx, type, dir, x, y, opts)
//   type  'compact' | 'sedan' | 'taxi' | 'van' | 'police' | 'junker' | 'sports' | 'skybus' | 'plane'
//         ('player' draws the junker; traffic kinds follow ARCHITECTURE §8.2)
//   dir   0-7: 0 east, 2 south, 4 west, 6 north (clockwise on screen); opts.angle (radians) overrides
//   x, y  ground centre in world units (the caller's ctx is in world units)
//   opts  t (seconds: wheel spin, police lights), brake (brake lights on), lights (headlamp lenses lit),
//         flashReduction (steady police lights; default: the access.flashReduction setting),
//         driver ({ karma, look } or true: the driver shows through the glass / in the open car),
//         shadow (default true), alpha, scale, z (height off the ground: the plane), bank (plane roll,
//         radians), pilot (plane: default true), carry (plane: the player hangs below)
// lamps(type, dir) → { head: [[dx, dy], ...], tail: [[dx, dy], ...] } screen offsets of the lamps
//   for the emissive pass (ART_AUDIO §3).
// size(type) → { L, W, H }. TYPES: the type names. dirFromAngle(a) → 0-7.
(function () {
  'use strict';
  var SR = window.SR;

  // Footprints in u (GDD §3.8: cars are 96 × 52 oriented boxes), heights z in u.
  // body: [z0, z1, taper]; cabin: [base rear, base front, roof rear, roof front, inset, z top] as
  // fractions of the length (rear = -0.5, front = +0.5) and u.
  var SPECS = {
    compact: { L: 88, W: 48, body: [4, 20, 3], cabin: [-0.3, 0.2, -0.22, 0.08, 5, 34], color: 'car.compact' },
    sedan: { L: 96, W: 52, body: [4, 19, 3], cabin: [-0.28, 0.2, -0.18, 0.06, 5, 35], color: 'car.sedan' },
    taxi: { L: 96, W: 52, body: [4, 19, 3], cabin: [-0.28, 0.2, -0.18, 0.06, 5, 35], color: 'car.taxi', sign: true, checker: true },
    police: { L: 100, W: 52, body: [4, 19, 3], cabin: [-0.28, 0.2, -0.18, 0.06, 5, 35], color: 'car.police', bar: true, stripe: 'car.policeStripe' },
    junker: { L: 100, W: 52, body: [4, 20, 2], cabin: [-0.3, 0.18, -0.2, 0.06, 5, 36], color: 'car.junker', door: 'car.junkerDoor', rust: 'car.junkerRust' },
    sports: { L: 96, W: 50, body: [4, 16, 4], open: true, color: 'car.sports' },
    van: { L: 108, W: 56, body: [4, 22, 2], cabin: [-0.5, 0.3, -0.48, 0.18, 3, 50], color: 'car.van', box: true },
    skybus: { L: 378, W: 86, body: [6, 30, 2], cabin: [-0.5, 0.46, -0.49, 0.42, 3, 70], color: 'car.skybus', stripe: 'car.skybusStripe', bus: true },
  };
  var TYPES = Object.keys(SPECS).concat(['plane']);
  var ALIAS = { player: 'junker', car: 'sedan', sportscar: 'sports', bus: 'skybus', cab: 'taxi' };

  function color(k) { return SR.art.draw.color(k); }
  function tone(k, n) { return SR.art.draw.tone(color(k), n); }

  // ---- solids ----------------------------------------------------------------------------------------
  // A frustum: bottom rect x0..x1 × ±w0/2 at z0, top rect t0..t1 × ±wt/2 at z1. Corners:
  // 0-3 bottom (rear-left, front-left, front-right, rear-right), 4-7 top (same order).
  // Faces with their decal frames: side faces run rear → front (u) and bottom → top (v).
  function frustum(x0, x1, w0, z0, t0, t1, wt, z1) {
    var pts = [
      [x0, -w0 / 2, z0], [x1, -w0 / 2, z0], [x1, w0 / 2, z0], [x0, w0 / 2, z0],
      [t0, -wt / 2, z1], [t1, -wt / 2, z1], [t1, wt / 2, z1], [t0, wt / 2, z1],
    ];
    return {
      pts: pts,
      faces: [
        { role: 'top', idx: [4, 5, 6, 7] },
        { role: 'left', idx: [0, 1, 5, 4] },
        { role: 'right', idx: [3, 2, 6, 7] },
        { role: 'front', idx: [2, 1, 5, 6] },
        { role: 'back', idx: [0, 3, 7, 4] },
      ],
    };
  }

  var MODELS = {};
  function model(type) {
    if (MODELS[type]) return MODELS[type];
    var s = SPECS[type];
    var L = s.L, W = s.W, hl = L / 2;
    var b = s.body;
    var solids = [];
    var lower = frustum(-hl, hl, W, b[0], -hl + b[2], hl - b[2], W - b[2], b[1]);
    lower.part = 'body';
    solids.push(lower);
    if (s.cabin) {
      var c = s.cabin;
      var cab = frustum(c[0] * L, c[1] * L, W - c[4] * 2, b[1], c[2] * L, c[3] * L, W - c[4] * 2 - 6, c[5]);
      cab.part = 'cabin';
      solids.push(cab);
    }
    MODELS[type] = { spec: s, solids: solids };
    return MODELS[type];
  }

  // ---- projection scratch (no allocation per frame beyond small arrays reused) ------------------------
  var P = new Float64Array(16);   // projected x, y of 8 corners
  var W3 = new Float64Array(24);  // rotated 3D corners

  function transform(sol, cx, cy, ca, sa) {
    var pts = sol.pts;
    for (var i = 0; i < 8; i++) {
      var p = pts[i];
      var X = cx + p[0] * ca - p[1] * sa, Y = cy + p[0] * sa + p[1] * ca;
      W3[i * 3] = X; W3[i * 3 + 1] = Y; W3[i * 3 + 2] = p[2];
      P[i * 2] = X; P[i * 2 + 1] = Y - 0.5 * p[2];
    }
  }

  // Visible when the outward normal points toward the eye: n · (0, 0.5, 1) > 0.
  function visible(face) {
    var id = face.idx;
    var ax = W3[id[1] * 3] - W3[id[0] * 3], ay = W3[id[1] * 3 + 1] - W3[id[0] * 3 + 1], az = W3[id[1] * 3 + 2] - W3[id[0] * 3 + 2];
    var bx = W3[id[3] * 3] - W3[id[0] * 3], by = W3[id[3] * 3 + 1] - W3[id[0] * 3 + 1], bz = W3[id[3] * 3 + 2] - W3[id[0] * 3 + 2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    // orient outward: away from the solid's centre
    var cx = 0, cy = 0, cz = 0, fx = 0, fy = 0, fz = 0, i;
    for (i = 0; i < 8; i++) { cx += W3[i * 3]; cy += W3[i * 3 + 1]; cz += W3[i * 3 + 2]; }
    for (i = 0; i < 4; i++) { fx += W3[id[i] * 3]; fy += W3[id[i] * 3 + 1]; fz += W3[id[i] * 3 + 2]; }
    var ox = fx / 4 - cx / 8, oy = fy / 4 - cy / 8, oz = fz / 4 - cz / 8;
    if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return 0.5 * ny + nz > 1e-6;
  }

  function facePath(ctx, face) {
    var id = face.idx;
    ctx.beginPath();
    ctx.moveTo(P[id[0] * 2], P[id[0] * 2 + 1]);
    for (var i = 1; i < 4; i++) ctx.lineTo(P[id[i] * 2], P[id[i] * 2 + 1]);
    ctx.closePath();
  }

  // Bilinear point on a face: u along idx[0] → idx[1], v along idx[0] → idx[3].
  function fpt(face, u, v, out) {
    var id = face.idx;
    var ax = P[id[0] * 2], ay = P[id[0] * 2 + 1], bx = P[id[1] * 2], by = P[id[1] * 2 + 1];
    var cx = P[id[2] * 2], cy = P[id[2] * 2 + 1], dx = P[id[3] * 2], dy = P[id[3] * 2 + 1];
    var x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u, x1 = dx + (cx - dx) * u, y1 = dy + (cy - dy) * u;
    out[0] = x0 + (x1 - x0) * v; out[1] = y0 + (y1 - y0) * v;
    return out;
  }
  var T0 = [0, 0], T1 = [0, 0], T2 = [0, 0], T3 = [0, 0];
  function decal(ctx, face, u0, v0, u1, v1, fill, stroke) {
    fpt(face, u0, v0, T0); fpt(face, u1, v0, T1); fpt(face, u1, v1, T2); fpt(face, u0, v1, T3);
    ctx.beginPath(); ctx.moveTo(T0[0], T0[1]); ctx.lineTo(T1[0], T1[1]); ctx.lineTo(T2[0], T2[1]); ctx.lineTo(T3[0], T3[1]); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = color('inkLine'); ctx.stroke(); }
  }

  function wheel(ctx, face, u, t) {
    var id = face.idx;
    fpt(face, u, 0.12, T0);
    var ex = P[id[1] * 2] - P[id[0] * 2], ey = P[id[1] * 2 + 1] - P[id[0] * 2 + 1];
    var len = Math.sqrt(ex * ex + ey * ey) || 1;
    var h = Math.abs(P[id[3] * 2 + 1] - P[id[0] * 2 + 1]) + 4;
    var rx = Math.max(3, len * 0.1), ry = Math.max(4, h * 0.55);
    var ang = Math.atan2(ey, ex);
    ctx.beginPath(); ctx.ellipse(T0[0], T0[1], rx, ry, ang, 0, Math.PI * 2);
    ctx.fillStyle = color('car.tyre'); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = color('inkLine'); ctx.stroke();
    // hub with a spoke that turns with t
    ctx.beginPath(); ctx.ellipse(T0[0], T0[1], rx * 0.45, ry * 0.45, ang, 0, Math.PI * 2);
    ctx.fillStyle = color('car.hub'); ctx.fill();
    var sp = (t || 0) * 12;
    ctx.beginPath();
    ctx.moveTo(T0[0], T0[1]);
    ctx.lineTo(T0[0] + Math.cos(ang) * Math.cos(sp) * rx * 0.45 - Math.sin(ang) * Math.sin(sp) * ry * 0.45,
      T0[1] + Math.sin(ang) * Math.cos(sp) * rx * 0.45 + Math.cos(ang) * Math.sin(sp) * ry * 0.45);
    ctx.lineWidth = 1; ctx.strokeStyle = color('car.tyre'); ctx.stroke();
  }

  function flashReduced(opts) {
    if (opts && opts.flashReduction !== undefined) return !!opts.flashReduction;
    try {
      if (SR.settings && typeof SR.settings.get === 'function') return !!SR.settings.get('access.flashReduction');
    } catch (e) { /* settings not ready */ }
    return false;
  }

  // ---- the car ---------------------------------------------------------------------------------------
  function drawCar(ctx, type, a, x, y, o) {
    var M = model(type), s = M.spec;
    var base = color(s.color), shade = tone(s.color, -1), hi = tone(s.color, 1);
    var ca = Math.cos(a), sa = Math.sin(a);
    var t = o.t || 0;

    // stacked-paper shadow: the footprint offset (+4, +6)
    if (o.shadow !== false) {
      var hl = s.L / 2 + 2, hw = s.W / 2 + 2;
      ctx.beginPath();
      ctx.moveTo(x + 4 + (-hl) * ca - (-hw) * sa, y + 6 + (-hl) * sa + (-hw) * ca);
      ctx.lineTo(x + 4 + hl * ca - (-hw) * sa, y + 6 + hl * sa + (-hw) * ca);
      ctx.lineTo(x + 4 + hl * ca - hw * sa, y + 6 + hl * sa + hw * ca);
      ctx.lineTo(x + 4 + (-hl) * ca - hw * sa, y + 6 + (-hl) * sa + hw * ca);
      ctx.closePath();
      ctx.fillStyle = color('shadow'); ctx.fill();
    }

    var glassFaces = [];
    for (var si = 0; si < M.solids.length; si++) {
      var sol = M.solids[si];
      transform(sol, x, y, ca, sa);
      var cabin = sol.part === 'cabin';
      for (var fi = 0; fi < sol.faces.length; fi++) {
        var f = sol.faces[fi];
        if (!visible(f)) continue;
        facePath(ctx, f);
        var fill = f.role === 'top' ? (cabin ? hi : base) : shade;
        if (cabin && (f.role === 'front' || f.role === 'back') && !s.box && !s.bus) fill = base;
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = color('inkLine'); ctx.stroke();
        decorate(ctx, s, f, cabin, t, o, glassFaces);
      }
    }
    if (s.open) openTop(ctx, s, x, y, ca, sa, o);
    if (o.driver && !s.open && glassFaces.length) driverThroughGlass(ctx, s, x, y, ca, sa, o, glassFaces);
  }

  // Decals per face: glass, lamps, wheels, stripes, doors, signs.
  function decorate(ctx, s, f, cabin, t, o, glassFaces) {
    var glass = color('car.glass');
    if (cabin) {
      if (f.role === 'top') {
        if (s.sign) { decal(ctx, f, 0.35, 0.3, 0.65, 0.7, color('car.sign'), 1); }
        if (s.bar) lightBar(ctx, f, t, o);
        if (s.bus) { decal(ctx, f, 0.02, 0.1, 0.98, 0.9, null, 0); }
        return;
      }
      if (s.bus) {
        if (f.role === 'left' || f.role === 'right') {
          for (var w = 0; w < 9; w++) decal(ctx, f, 0.06 + w * 0.1, 0.45, 0.13 + w * 0.1, 0.85, glass, 1);
          decal(ctx, f, 0.0, 0.2, 1.0, 0.32, color(s.stripe), 0);
        } else if (f.role === 'front') {
          decal(ctx, f, 0.12, 0.4, 0.88, 0.9, glass, 1); glassFaces.push(f);
        }
        return;
      }
      // windows: side glass with a pillar, windshield and rear window inset
      if (f.role === 'left' || f.role === 'right') {
        decal(ctx, f, 0.08, 0.14, 0.46, 0.86, glass, 1);
        decal(ctx, f, 0.54, 0.14, 0.92, 0.86, glass, 1);
        glassFaces.push(f);
      } else {
        decal(ctx, f, 0.1, 0.12, 0.9, 0.86, f.role === 'front' ? glass : color('car.glassDark'), 1);
        glassFaces.push(f);
      }
      return;
    }
    // lower body
    if (f.role === 'left' || f.role === 'right') {
      if (s.stripe && !s.bus) decal(ctx, f, 0.25, 0.45, 0.75, 0.7, color(s.stripe), 0);
      if (s.bus) decal(ctx, f, 0.0, 0.55, 1.0, 0.75, color(s.stripe), 0);
      if (s.checker) for (var k = 0; k < 8; k++) decal(ctx, f, 0.3 + k * 0.05, 0.6 + (k % 2) * 0.12, 0.35 + k * 0.05, 0.72 + (k % 2) * 0.12, color('ink'), 0);
      if (s.door && f.role === 'left') decal(ctx, f, 0.32, 0.12, 0.6, 0.98, color(s.door), 1);
      if (s.rust) { decal(ctx, f, 0.72, 0.2, 0.8, 0.4, color(s.rust), 0); decal(ctx, f, 0.12, 0.5, 0.18, 0.66, color(s.rust), 0); }
      // door seam
      fpt(f, 0.5, 0.15, T0); fpt(f, 0.5, 0.95, T1);
      ctx.beginPath(); ctx.moveTo(T0[0], T0[1]); ctx.lineTo(T1[0], T1[1]); ctx.lineWidth = 1; ctx.strokeStyle = color('inkLine'); ctx.stroke();
      wheel(ctx, f, s.bus ? 0.12 : 0.2, t);
      wheel(ctx, f, s.bus ? 0.88 : 0.8, t);
    } else if (f.role === 'front') {
      var lit = o.lights ? color('light.head') : color('car.lamp');
      decal(ctx, f, 0.06, 0.4, 0.24, 0.8, lit, 1);
      decal(ctx, f, 0.76, 0.4, 0.94, 0.8, lit, 1);
      decal(ctx, f, 0.34, 0.45, 0.66, 0.7, color('car.chrome'), 1);
    } else if (f.role === 'back') {
      var tail = o.brake ? color('light.brake') : color('car.tail');
      decal(ctx, f, 0.06, 0.45, 0.22, 0.8, tail, 1);
      decal(ctx, f, 0.78, 0.45, 0.94, 0.8, tail, 1);
    } else if (f.role === 'top' && s.open) {
      // nothing: the cockpit is drawn by openTop
    }
  }

  function lightBar(ctx, f, t, o) {
    var steady = flashReduced(o);
    var phase = steady ? -1 : Math.floor((t || 0) * 4) % 2; // 2 Hz alternation
    decal(ctx, f, 0.42, 0.12, 0.58, 0.5, phase === 1 ? tone('light.policeRed', -1) : color('light.policeRed'), 1);
    decal(ctx, f, 0.42, 0.5, 0.58, 0.88, phase === 0 ? tone('light.policeBlue', -1) : color('light.policeBlue'), 1);
  }

  // The sports convertible: seats and a windshield frame in the open cockpit; the driver shows.
  function openTop(ctx, s, x, y, ca, sa, o) {
    var z = s.body[1];
    function sp(lx, ly, lz) { return [x + lx * ca - ly * sa, y + lx * sa + ly * ca - 0.5 * lz]; }
    var hl = s.L / 2;
    var seatZ = z;
    var pts = [sp(-hl * 0.35, -s.W * 0.32, seatZ), sp(hl * 0.12, -s.W * 0.32, seatZ), sp(hl * 0.12, s.W * 0.32, seatZ), sp(-hl * 0.35, s.W * 0.32, seatZ)];
    SR.art.draw.poly(ctx, pts);
    ctx.fillStyle = color('car.seat'); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = color('inkLine'); ctx.stroke();
    if (o.driver) {
      var d = sp(-hl * 0.12, -s.W * 0.14, seatZ);
      drawDriver(ctx, d[0], d[1], o, 0.7);
    }
    // windshield: a slanted glass strip across the cockpit front
    var w = [sp(hl * 0.18, -s.W * 0.4, z), sp(hl * 0.18, s.W * 0.4, z), sp(hl * 0.08, s.W * 0.36, z + 12), sp(hl * 0.08, -s.W * 0.36, z + 12)];
    SR.art.draw.poly(ctx, w);
    ctx.fillStyle = SR.art.draw.alpha(color('car.glass'), 0.7); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = color('inkLine'); ctx.stroke();
  }

  function drawDriver(ctx, x, y, o, k) {
    var d = o.driver === true ? {} : o.driver;
    if (SR.art.stick) {
      SR.art.stick.draw(ctx, 'drive', { x: x, y: y, anchor: 'hip', upper: true, shadow: false, facing: 'down',
        player: d.player !== false, karma: d.karma, look: d.look, scale: k, t: o.t || 0 });
    }
  }

  function driverThroughGlass(ctx, s, x, y, ca, sa, o, faces) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < faces.length; i++) {
      var id = faces[i].idx;
      ctx.moveTo(P[id[0] * 2], P[id[0] * 2 + 1]);
      for (var j = 1; j < 4; j++) ctx.lineTo(P[id[j] * 2], P[id[j] * 2 + 1]);
      ctx.closePath();
    }
    ctx.clip();
    var lx = s.L * -0.02, ly = -s.W * 0.18, lz = s.body[1] - 2;
    drawDriver(ctx, x + lx * ca - ly * sa, y + lx * sa + ly * ca - 0.5 * lz, o, 0.62);
    ctx.restore();
  }

  // ---- the Fold Rescue plane (ART_AUDIO §12: a folded-paper plane, 90 u span, Pilot Ori aboard) -----
  function drawPlane(ctx, a, x, y, o) {
    var z = o.z || 0;
    var bank = o.bank || 0;
    var span = 90, len = 110;
    var ca = Math.cos(a), sa = Math.sin(a);
    var roll = Math.cos(bank);
    function sp(lx, ly, lz) { return [x + lx * ca - ly * roll * sa, y + lx * sa + ly * roll * ca - 0.5 * (z + lz + ly * Math.sin(bank))]; }
    if (o.shadow !== false) {
      var sh = [[len / 2, 0], [-len / 2, -span / 2], [-len * 0.36, 0], [-len / 2, span / 2]];
      ctx.beginPath();
      for (var i = 0; i < sh.length; i++) {
        var px = x + 4 + sh[i][0] * ca - sh[i][1] * roll * sa, py = y + 6 + sh[i][0] * sa + sh[i][1] * roll * ca;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = color('shadow'); ctx.fill();
    }
    var nose = sp(len / 2, 0, 6), tailL = sp(-len / 2, -span / 2, 10), tailR = sp(-len / 2, span / 2, 10);
    var keelT = sp(-len * 0.42, 0, 0), keelF = sp(len * 0.2, 0, 2), mid = sp(-len * 0.4, 0, 10);
    var paper = color('car.plane'), fold = color('car.planeFold');
    // keel (the folded fuselage) under the wings
    SR.art.draw.poly(ctx, [nose, keelF, keelT, mid]);
    ctx.fillStyle = fold; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = color('inkLine'); ctx.stroke();
    // wings
    SR.art.draw.poly(ctx, [nose, tailL, mid]); ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
    SR.art.draw.poly(ctx, [nose, mid, tailR]); ctx.fillStyle = tone('car.plane', -1); ctx.fill(); ctx.stroke();
    // centre fold
    ctx.beginPath(); ctx.moveTo(nose[0], nose[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineWidth = 1; ctx.stroke();
    if (o.pilot !== false && SR.art.stick) {
      var seat = sp(-len * 0.12, 0, 12);
      SR.art.stick.draw(ctx, 'drive', { x: seat[0], y: seat[1], anchor: 'hip', upper: true, shadow: false,
        facing: 'down', look: 'ori', scale: 0.72, t: o.t || 0 });
    }
    if (o.carry && SR.art.stick) {
      var hang = sp(0, 0, -30);
      SR.art.stick.draw(ctx, 'cheer', { x: hang[0], y: hang[1] + 26, shadow: false, player: true, karma: o.karma, t: o.t || 0 });
    }
  }

  // ---- public ----------------------------------------------------------------------------------------
  function norm(type) { var t = String(type || 'sedan'); return ALIAS[t] || t; }
  /** @returns {number} 0-7 for an angle in radians (0 east, clockwise on screen). */
  function dirFromAngle(a) { return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }

  var EMPTY = {};
  /**
   * Draws a vehicle (see the header).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} type
   * @param {number} dir 0-7
   * @param {number} x
   * @param {number} y
   * @param {object=} opts
   */
  function draw(ctx, type, dir, x, y, opts) {
    var o = opts || EMPTY;
    var t = norm(type);
    var a = o.angle !== undefined ? o.angle : (dir || 0) * Math.PI / 4;
    var sc = o.scale || 1;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (sc !== 1) { ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (t === 'plane') drawPlane(ctx, a, x, y, o);
    else drawCar(ctx, SPECS[t] ? t : 'sedan', a, x, y, o);
    ctx.restore();
  }

  /**
   * Screen offsets of a vehicle's lamps (for the emissive pass): headlamps on the front face, tail
   * lamps on the rear, at the body's mid height.
   * @returns {{head: number[][], tail: number[][]}}
   */
  function lamps(type, dir, angle) {
    var t = norm(type);
    var s = SPECS[t];
    if (!s) return { head: [], tail: [] };
    var a = angle !== undefined ? angle : (dir || 0) * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
    var hl = s.L / 2, z = (s.body[0] + s.body[1]) * 0.55;
    function sp(lx, ly) { return [lx * ca - ly * sa, lx * sa + ly * ca - 0.5 * z]; }
    return { head: [sp(hl, -s.W * 0.35), sp(hl, s.W * 0.35)], tail: [sp(-hl, -s.W * 0.36), sp(-hl, s.W * 0.36)] };
  }

  /** @returns {{L: number, W: number, H: number}} a type's footprint and height in u. */
  function size(type) {
    var t = norm(type);
    if (t === 'plane') return { L: 110, W: 90, H: 12 };
    var s = SPECS[t] || SPECS.sedan;
    return { L: s.L, W: s.W, H: s.cabin ? s.cabin[5] : s.body[1] };
  }

  SR.art.vehicles = { draw: draw, lamps: lamps, size: size, dirFromAngle: dirFromAngle, TYPES: TYPES };
})();
