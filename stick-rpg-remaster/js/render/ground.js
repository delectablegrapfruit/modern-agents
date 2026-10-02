// js/render/ground.js — owner: W1-G. The sheet and the ground (ARCHITECTURE §9.1 steps 2-3,
// ART_AUDIO §4, GDD §3.1): the torn island outline and holes with their paper-thickness band
// (south, east and west facing edges) and fibre hairs, the Dog-Ear flap, the Bus Hole, lawns,
// streets, sidewalks with joints, paths, the plaza herringbone, lane paint, zebras, water, door
// mats, steps and porches, railings and walls, baked into 512 × 512 device-pixel chunks at the
// current zoom only: an LRU of 40 chunks (20 touch-compact), at most 2 bakes per frame within
// 3 ms by camera distance plus velocity look-ahead, the previous zoom's chunks shown scaled until
// the new ones are ready.
(function () {
  'use strict';
  var SR = window.SR;

  var CHUNK = 512;               // device px
  var MAX_CHUNKS = 40;
  var MAX_CHUNKS_COMPACT = 20;
  var BAKES_PER_FRAME = 2;
  var BAKE_MS = 3;
  var LOOKAHEAD = 0.25;          // s of camera velocity
  var TEAR_STEP = 8;             // u between torn-edge samples
  var BAND = 24;                 // thickness band depth (ART_AUDIO §4)
  var BAND_SIDE = 8;             // sideways lean of the band on east / west faces
  var OCC = 64;                  // occupancy grid cell (u)

  function L() { return SR.render.lib; }
  function h01() { return SR.render.lib.hash01.apply(null, arguments); }

  var gm = null;                 // derived ground model
  var chunks = {};               // key -> chunk
  var nChunks = 0;
  var free = [];                 // recycled canvases
  var baked = 0;                 // bakes last frame
  var queued = 0;
  var lastCam = null;
  var vel = { x: 0, y: 0 };

  function reset() { gm = null; invalidate(); }

  /** Drops every chunk (they re-bake lazily); their backing stores are released. */
  function invalidate() {
    Object.keys(chunks).forEach(function (k) {
      var c = chunks[k].canvas;
      if (c) { c.width = 0; c.height = 0; }
    });
    chunks = {};
    nChunks = 0;
    free.length = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // The derived ground model
  // ---------------------------------------------------------------------------------------------

  function noise1(seed, x) {
    var i = Math.floor(x), f = x - i;
    var a = h01(seed, i) * 2 - 1, b = h01(seed, i + 1) * 2 - 1;
    var t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  }

  function segDist(px, py, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  }

  function signedArea(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return s;
  }

  function railedSegment(a, b, wm) {
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    var lines = [].concat(wm.railings || [], wm.walls || []);
    for (var i = 0; i < lines.length; i++) {
      var r = lines[i];
      if (!r || !r.a || !r.b) continue;
      if (segDist(mx, my, r.a, r.b) < 16 && segDist(a[0], a[1], r.a, r.b) < 40 && segDist(b[0], b[1], r.a, r.b) < 40) return true;
    }
    return false;
  }

  function dogEar(wm) {
    var f = wm.features && wm.features.dogEar;
    var d = (f && f.flap) || wm.dogEar || wm.flap;
    if (d && d.a && d.b && d.c) return { a: d.a, b: d.b, c: d.c };
    if (Array.isArray(d) && d.length === 3) return { a: d[0], b: d[1], c: d[2] };
    return { a: [480, 620], b: [860, 200], c: [898, 578] };   // GDD §3.1
  }

  /**
   * Tears a closed polygon: samples every 8 u with 2-octave value noise normal to each edge,
   * amplitude 6-14 u seeded per edge (ART_AUDIO §4), vertices fixed. Straight edges (the
   * Dog-Ear crease) stay straight; railed edges barely tear.
   * @returns {{pts: number[][], normals: number[][], band: boolean[]}} with outward normals
   */
  function tear(poly, seed, outwardSign, straight, railed, isHole) {
    var pts = [], normals = [], band = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      var nx = outwardSign * dy / len, ny = -outwardSign * dx / len;
      var amp = straight(i) ? 0 : railed(i) ? 2 : 6 + 8 * h01(seed, i, 'amp');
      var bandOn = ny > -0.2 && (ny > 0.35 || Math.abs(nx) > 0.6) && !straight(i);
      if (isHole && ny <= -0.2) bandOn = true;    // a hole shows its rim on all four sides
      var n = Math.max(1, Math.round(len / TEAR_STEP));
      for (var k = 0; k < n; k++) {
        var t = k / n, s = t * len;
        var taper = Math.min(1, s / 24, (len - s) / 24);
        var off = amp * taper * (0.7 * noise1(seed * 31 + i, s / 60) + 0.3 * noise1(seed * 57 + i, s / 14));
        pts.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
        normals.push([nx, ny]);
        band.push(bandOn);
      }
    }
    return { pts: pts, normals: normals, band: band };
  }

  function bandDepth(nx, ny, isHole) {
    if (isHole && ny <= -0.2) return [0, -6];       // the far (south) rim of a hole: a thin lip
    return [nx * BAND_SIDE, BAND];
  }

  /** Builds runs of consecutive band samples: strip polygons with a top and a bottom line. */
  function bandRuns(t, isHole) {
    var runs = [];
    var n = t.pts.length, cur = null;
    function close() {
      if (cur && cur.top.length >= 2) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        cur.top.concat(cur.bot).forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        cur.bbox = [x0 - 12, y0 - 12, x1 + 12, y1 + 12];
        runs.push(cur);
      }
      cur = null;
    }
    // Start at a non-band sample so runs don't wrap (or anywhere when all are band).
    var start = 0;
    for (var s = 0; s < n; s++) if (!t.band[s]) { start = s; break; }
    for (var j = 0; j <= n; j++) {
      var i = (start + j) % n, nxt = (i + 1) % n;
      if (t.band[i]) {
        if (!cur) cur = { top: [], bot: [], mid: [] };
        var p = t.pts[i], q = t.pts[nxt];
        // The vertex offset averages the neighbouring band normals (no gaps at corners).
        var np = t.normals[i], nq = t.band[nxt] ? t.normals[nxt] : np;
        var dp = bandDepth(np[0], np[1], isHole), dq = bandDepth((np[0] + nq[0]) / 2, (np[1] + nq[1]) / 2, isHole);
        if (!cur.top.length) { cur.top.push(p); cur.bot.push([p[0] + dp[0], p[1] + dp[1]]); cur.mid.push([p[0] + dp[0] * 0.45, p[1] + dp[1] * 0.45]); }
        cur.top.push(q);
        cur.bot.push([q[0] + dq[0], q[1] + dq[1]]);
        cur.mid.push([q[0] + dq[0] * 0.45, q[1] + dq[1] * 0.45]);
      } else {
        close();
      }
    }
    close();
    return runs;
  }

  function hairs(t, seed, list, dangling) {
    var acc = 0, next = 6 + 4 * h01(seed, 'h0');
    for (var i = 0; i < t.pts.length; i++) {
      var p = t.pts[i], q = t.pts[(i + 1) % t.pts.length];
      acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (acc < next) continue;
      acc = 0;
      next = 6 + 4 * h01(seed, i, 'h');
      var n = t.normals[i];
      var len = 4 + 6 * h01(seed, i, 'l');
      var ang = (h01(seed, i, 'a') - 0.5) * 1.1;
      var c = Math.cos(ang), s = Math.sin(ang);
      var dx = n[0] * c - n[1] * s, dy = n[0] * s + n[1] * c;
      var x0 = p[0] - n[0] * 1.5, y0 = p[1] - n[1] * 1.5;
      list.push(x0, y0, x0 + dx * len, y0 + dy * len);
      if (dangling && t.band[i]) {
        var d = bandDepth(n[0], n[1], false);
        var bx = p[0] + d[0], by = p[1] + d[1];
        var dl = 3 + 6 * h01(seed, i, 'd');
        dangling.push(bx, by - 1, bx + (h01(seed, i, 'dx') - 0.5) * 3, by + dl);
      }
    }
  }

  function bucketize(list, stride) {
    var b = {};
    for (var i = 0; i < list.length; i += stride) {
      var k = Math.floor(list[i] / 256) + ',' + Math.floor(list[i + 1] / 256);
      (b[k] || (b[k] = [])).push(i);
    }
    return b;
  }

  function pointIn(poly, x, y) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function rectPoly(r) { return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; }

  function build(m) {
    var wm = m.wm;
    var R = L().rectOf;
    var raw = (wm.outline || []).filter(function (p) { return Array.isArray(p); });
    var g = { m: m, outline: raw, holes: [], runs: [], hairs: [], dangling: [], flat: [], streets: [], lawns: [], zebras: [], junctions: [] };
    if (raw.length < 3) {
      var b = m.bbox;
      raw = g.outline = rectPoly(b);
    }
    var sign = signedArea(raw) > 0 ? 1 : -1;
    var de = dogEar(wm);
    g.dogEar = de;
    var isCrease = function (i) {
      var a = raw[i], bb = raw[(i + 1) % raw.length];
      function near(p, q) { return Math.abs(p[0] - q[0]) < 3 && Math.abs(p[1] - q[1]) < 3; }
      return (near(a, de.a) && near(bb, de.b)) || (near(a, de.b) && near(bb, de.a));
    };
    var t = tear(raw, 7, sign, isCrease, function (i) { return railedSegment(raw[i], raw[(i + 1) % raw.length], wm); }, false);
    g.torn = t.pts;
    g.runs = bandRuns(t, false);
    hairs(t, 11, g.hairs, g.dangling);
    (wm.holes || []).forEach(function (h, hi) {
      var r = R(h.rect || h);
      if (!r) return;
      var poly = h.poly || rectPoly(r);
      var hs = signedArea(poly) > 0 ? -1 : 1;
      var ht = tear(poly, 101 + hi, hs, function () { return false; }, function () { return false; }, true);
      g.holes.push({ id: h.id || 'hole' + hi, rect: r, raw: poly, torn: ht.pts });
      g.runs = g.runs.concat(bandRuns(ht, true));
      hairs(ht, 131 + hi, g.hairs, null);
    });
    g.hairIndex = bucketize(g.hairs, 4);
    g.dangleIndex = bucketize(g.dangling, 4);
    // Paths: the land (outline minus holes; nonzero with reversed holes) and the grade region.
    g.land = new Path2D();
    addPoly(g.land, g.torn, false);
    g.holes.forEach(function (h) { addPoly(g.land, h.torn, true); });
    g.gradeBase = new Path2D();
    g.gradeBase.addPath(g.land);
    var landSign = signedArea(g.torn) > 0 ? 1 : -1;
    g.runs.forEach(function (run) {
      var poly = run.top.concat(run.bot.slice().reverse());
      addPoly(g.gradeBase, poly, (signedArea(poly) > 0 ? 1 : -1) !== landSign);
    });
    // Streets and flat features.
    (wm.streets || []).forEach(function (s) {
      var r = R(s.rect);
      if (!r) return;
      var kind = s.kind || 'path';
      var e = { id: s.id, kind: kind, rect: r, lanes: s.lanes || null, r: s.r || 0, ring: s.ring || 0 };
      if (kind === 'park' || kind === 'lawn') g.lawns.push(e); else g.streets.push(e);
    });
    (wm.lawns || wm.areas || []).forEach(function (s) {
      var r = R(s.rect);
      if (r && (!s.kind || s.kind === 'park' || s.kind === 'lawn')) g.lawns.push({ id: s.id, kind: 'park', rect: r });
    });
    // Stickwood Park (the original's south-west sky pocket) is park lawn (ART_AUDIO §2.1 parkGrass).
    (wm.pockets || []).forEach(function (pk) {
      if (!pk || !/park/i.test(pk.id || '')) return;
      (pk.rects || (pk.rect ? [pk.rect] : [])).forEach(function (rr) { var r = R(rr); if (r) g.lawns.push({ id: pk.id, kind: 'park', rect: r }); });
    });
    var feats = wm.features || {};
    var jog = wm.jogLoop || feats.jogLoop;
    if (jog && R(jog.rect)) g.streets.push({ id: jog.id || 'jogLoop', kind: 'path', rect: R(jog.rect), r: jog.r || 0, ring: jog.w || 64 });
    g.links = (wm.links || []).filter(function (l) { return l && Array.isArray(l.points) && l.points.length >= 2; });
    var order = { path: 1, plaza: 2, sidewalk: 3, asphalt: 4, road: 4 };
    g.streets.sort(function (a, b) { return (order[a.kind] || 1) - (order[b.kind] || 1); });
    (wm.junctions || []).forEach(function (j) { var r = R(j.rect); if (r) g.junctions.push({ id: j.id, rect: r }); });
    (wm.zebras || []).forEach(function (z) { var r = R(z.rect || z); if (r) g.zebras.push({ rect: r }); });
    m.props.forEach(function (p) {
      if (p.type === 'pond' || p.type === 'fountain' || p.type === 'water') g.flat.push(p);
    });
    if (feats.pond && typeof feats.pond.x === 'number') g.flat.push({ type: 'pond', x: feats.pond.x, y: feats.pond.y, rx: feats.pond.rx, ry: feats.pond.ry, r: feats.pond.r });
    if (feats.fountain && typeof feats.fountain.x === 'number') g.flat.push({ type: 'fountain', x: feats.fountain.x, y: feats.fountain.y, r: feats.fountain.r });
    if (feats.skateBowl && R(feats.skateBowl.rect)) g.flat.push({ type: 'bowl', rect: R(feats.skateBowl.rect) });
    g.railings = (wm.railings || []).filter(function (r) { return r && r.a && r.b; });
    g.walls = (wm.walls || []).filter(function (r) { return r && r.a && r.b; });
    // Occupancy: which 64 u cells hold land, a band or hairs (empty chunks are never allocated).
    var bb = m.bbox;
    // Interior cells lie on the sheet at least a cell from any edge or hole: a view made only of
    // them shows no sky, so the sky pass is skipped (the chunks cover every pixel).
    g.occ = { x0: Math.floor((bb[0] - 128) / OCC), y0: Math.floor((bb[1] - 128) / OCC), cells: {}, interior: {} };
    var holePolys = g.holes.map(function (hh) { return hh.raw; });
    for (var gx = g.occ.x0; gx * OCC < bb[2] + 128; gx++) {
      for (var gy = g.occ.y0; gy * OCC < bb[3] + 128; gy++) {
        var cx = (gx + 0.5) * OCC, cy = (gy + 0.5) * OCC;
        var inside = pointIn(raw, cx, cy);
        if (inside || nearEdge(raw, cx, cy, OCC)) g.occ.cells[gx + ',' + gy] = 1;
        if (inside && !nearEdge(raw, cx, cy, OCC - BAND + 8) && !holePolys.some(function (hp) { return pointIn(hp, cx, cy) || nearEdge(hp, cx, cy, OCC - BAND + 8); })) {
          g.occ.interior[gx + ',' + gy] = 1;
        }
      }
    }
    return g;
  }

  function nearEdge(poly, x, y, d) {
    for (var i = 0; i < poly.length; i++) if (segDist(x, y, poly[i], poly[(i + 1) % poly.length]) < d + BAND) return true;
    return false;
  }

  function addPoly(path, pts, reverse) {
    if (!pts.length) return;
    var n = pts.length;
    path.moveTo(pts[reverse ? n - 1 : 0][0], pts[reverse ? n - 1 : 0][1]);
    for (var i = 1; i < n; i++) { var p = pts[reverse ? n - 1 - i : i]; path.lineTo(p[0], p[1]); }
    path.closePath();
  }

  /** @returns {object|null} the derived ground model (torn outline, runs, land path) for the render model. */
  function model(m) {
    m = m || L().model();
    if (!m) return null;
    if (!gm || gm.m !== m) { gm = build(m); invalidate(); }
    return gm;
  }

  function occupied(g, x0, y0, x1, y1) {
    var c = g.occ.cells;
    for (var gx = Math.floor(x0 / OCC); gx <= Math.floor(x1 / OCC); gx++) {
      for (var gy = Math.floor(y0 / OCC); gy <= Math.floor(y1 / OCC); gy++) if (c[gx + ',' + gy]) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // Painting one chunk (ctx in world units, clipped to the chunk rect)
  // ---------------------------------------------------------------------------------------------

  function hitsR(r, x0, y0, x1, y1) { return r[0] < x1 && r[2] > x0 && r[1] < y1 && r[3] > y0; }

  function paint(ctx, g, x0, y0, x1, y1, ppu) {
    var pal = L().pal, tone = L().tone;
    var px = 1 / ppu;               // one device pixel in u
    var m = g.m;
    // 1. The thickness band under south, east and west facing edges (outside the land).
    var s1 = pal('strata1', 0.7), s2 = pal('strata2', 0.5), pe = pal('paperEdge', 0.93), ink = pal('ink', 0.1);
    for (var i = 0; i < g.runs.length; i++) {
      var run = g.runs[i];
      if (!hitsR(run.bbox, x0, y0, x1, y1)) continue;
      ctx.fillStyle = s2;
      ctx.beginPath(); strip(ctx, run.top, run.bot); ctx.fill();
      ctx.fillStyle = s1;
      ctx.beginPath(); strip(ctx, run.top, run.mid); ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.2, px * 1.5);
      ctx.beginPath(); line(ctx, run.bot); ctx.stroke();
      ctx.restore();
    }
    hairLines(ctx, g.dangling, g.dangleIndex, x0, y0, x1, y1, pal('fibre', 1), Math.max(1, px), 0.7);
    // 2. The land.
    ctx.fillStyle = pal('grass', 0.6);
    ctx.fill(g.land);
    ctx.save();
    ctx.clip(g.land);
    g.lawns.forEach(function (l) {
      if (!hitsR(l.rect, x0, y0, x1, y1)) return;
      ctx.fillStyle = pal(['parkGrass', 'grass'], 0.6);
      ctx.fillRect(l.rect[0], l.rect[1], l.rect[2] - l.rect[0], l.rect[3] - l.rect[1]);
    });
    stipple(ctx, x0, y0, x1, y1, pal('grassShade', 0.5), pal('grassHi', 0.7));
    // 3. Streets, paths, plazas and sidewalks.
    for (var k = 0; k < g.streets.length; k++) {
      var s = g.streets[k];
      if (!hitsR(s.rect, x0 - 20, y0 - 20, x1 + 20, y1 + 20)) continue;
      street(ctx, s, x0, y0, x1, y1, px);
    }
    links(ctx, g, x0, y0, x1, y1);
    g.junctions.forEach(function (j) {
      if (!hitsR(j.rect, x0, y0, x1, y1)) return;
      ctx.fillStyle = pal('asphalt', 0.35);
      ctx.fillRect(j.rect[0], j.rect[1], j.rect[2] - j.rect[0], j.rect[3] - j.rect[1]);
      specks(ctx, j.rect, x0, y0, x1, y1, pal('asphaltSpeck', 0.4));
    });
    lanePaint(ctx, g, x0, y0, x1, y1);
    g.zebras.forEach(function (z) { if (hitsR(z.rect, x0, y0, x1, y1)) zebra(ctx, z.rect); });
    g.flat.forEach(function (p) { water(ctx, p, x0, y0, x1, y1, px); });
    // 4. The Dog-Ear flap: the back of the paper with its mirrored print.
    flap(ctx, g.dogEar, x0, y0, x1, y1, px);
    // 5. Building footprint slabs (seen through a building faded by the occlusion rule), then door
    //    mats, steps and porches (ground decals, under people).
    m.buildings.forEach(function (b) { footprint(ctx, b.geom, x0, y0, x1, y1); });
    m.doors.forEach(function (d) { decal(ctx, d, x0, y0, x1, y1, px); });
    // 6. Paper grain over the land.
    grain(ctx, x0, y0, x1, y1, ppu);
    ctx.restore();
    // 7. Rim: the cut edge line, fibre hairs, railings and walls.
    for (var r2 = 0; r2 < g.runs.length; r2++) {
      var rr = g.runs[r2];
      if (!hitsR(rr.bbox, x0, y0, x1, y1)) continue;
      ctx.strokeStyle = pe;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); line(ctx, rr.top); ctx.stroke();
    }
    hairLines(ctx, g.hairs, g.hairIndex, x0, y0, x1, y1, pal('fibre', 1), Math.max(1, px), 0.85);
    g.walls.forEach(function (w) { wall(ctx, w, x0, y0, x1, y1, px); });
    g.railings.forEach(function (r) { railing(ctx, r, x0, y0, x1, y1, px); });
  }

  function strip(ctx, top, bot) {
    ctx.moveTo(top[0][0], top[0][1]);
    for (var i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (var j = bot.length - 1; j >= 0; j--) ctx.lineTo(bot[j][0], bot[j][1]);
    ctx.closePath();
  }

  function line(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  function hairLines(ctx, list, index, x0, y0, x1, y1, colour, lw, alpha) {
    ctx.save();
    ctx.strokeStyle = L().solid(colour);
    ctx.globalAlpha = alpha * L().alphaOf(colour);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var bx = Math.floor((x0 - 16) / 256); bx <= Math.floor((x1 + 16) / 256); bx++) {
      for (var by = Math.floor((y0 - 16) / 256); by <= Math.floor((y1 + 16) / 256); by++) {
        var ids = index[bx + ',' + by];
        if (!ids) continue;
        for (var k = 0; k < ids.length; k++) {
          var i = ids[k];
          ctx.moveTo(list[i], list[i + 1]);
          ctx.lineTo(list[i + 2], list[i + 3]);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function stipple(ctx, x0, y0, x1, y1, shade, hi) {
    var cell = 22, H = L().ihash;
    ctx.fillStyle = shade;
    ctx.beginPath();
    var hiPts = [];
    for (var cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
      for (var cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
        var r = H(cx, cy, 1);
        if (r < 0.35) continue;
        var x = (cx + H(cx, cy, 2)) * cell, y = (cy + H(cx, cy, 3)) * cell;
        if (r > 0.93) hiPts.push(x, y);
        else ctx.rect(x, y, 2.2, 1.6);
      }
    }
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath();
    for (var i = 0; i < hiPts.length; i += 2) ctx.rect(hiPts[i], hiPts[i + 1], 3, 1.6);
    ctx.fill();
  }

  function specks(ctx, r, x0, y0, x1, y1, colour) {
    var cell = 16, H = L().ihash;
    var ax = Math.max(r[0], x0), ay = Math.max(r[1], y0), bx = Math.min(r[2], x1), by = Math.min(r[3], y1);
    if (ax >= bx || ay >= by) return;
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (var cx = Math.floor(ax / cell); cx <= Math.floor(bx / cell); cx++) {
      for (var cy = Math.floor(ay / cell); cy <= Math.floor(by / cell); cy++) {
        if (H(cx, cy, 11) < 0.5) continue;
        var x = (cx + H(cx, cy, 12)) * cell, y = (cy + H(cx, cy, 13)) * cell;
        if (x < r[0] || x > r[2] - 2 || y < r[1] || y > r[3] - 2) continue;
        ctx.rect(x, y, 2, 2);
      }
    }
    ctx.fill();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function street(ctx, s, x0, y0, x1, y1, px) {
    var pal = L().pal, tone = L().tone, r = s.rect;
    var w = r[2] - r[0], h = r[3] - r[1];
    var colour = s.kind === 'asphalt' || s.kind === 'road' ? pal('asphalt', 0.35) :
      s.kind === 'sidewalk' ? pal('sidewalk', 0.78) : s.kind === 'plaza' ? pal('plaza', 0.75) : pal('path', 0.82);
    if (s.ring) {
      // A looped path (the jog loop): a rounded-rect ring of the given width.
      ctx.strokeStyle = colour;
      ctx.lineWidth = s.ring;
      // r is the outer corner radius (GDD §3.3 jog loop: outer rect, corner r 160, 64 wide).
      var ro = s.r || 0;
      ctx.beginPath();
      roundRectPath(ctx, r[0] + s.ring / 2, r[1] + s.ring / 2, w - s.ring, h - s.ring, Math.max(0, ro - s.ring / 2));
      ctx.stroke();
      ctx.strokeStyle = tone(colour, -1);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      roundRectPath(ctx, r[0], r[1], w, h, ro);
      roundRectPath(ctx, r[0] + s.ring, r[1] + s.ring, w - 2 * s.ring, h - 2 * s.ring, Math.max(0, ro - s.ring));
      ctx.stroke();
      return;
    }
    ctx.fillStyle = colour;
    if (s.r) { ctx.beginPath(); roundRectPath(ctx, r[0], r[1], w, h, s.r); ctx.fill(); }
    else ctx.fillRect(r[0], r[1], w, h);
    if (s.kind === 'asphalt' || s.kind === 'road') {
      specks(ctx, r, x0, y0, x1, y1, pal('asphaltSpeck', 0.4));
      return;
    }
    if (s.kind === 'sidewalk') {
      // Joints every 80 u across the walk, and a kerb line on both long sides.
      ctx.strokeStyle = pal('sidewalkJoint', 0.62);
      ctx.lineWidth = 2;
      ctx.beginPath();
      var along = h >= w;
      if (along) for (var y = Math.ceil(r[1] / 80) * 80; y < r[3]; y += 80) { if (y > y0 - 2 && y < y1 + 2) { ctx.moveTo(r[0], y); ctx.lineTo(r[2], y); } }
      else for (var x = Math.ceil(r[0] / 80) * 80; x < r[2]; x += 80) { if (x > x0 - 2 && x < x1 + 2) { ctx.moveTo(x, r[1]); ctx.lineTo(x, r[3]); } }
      ctx.stroke();
      ctx.fillStyle = tone(colour, -1);
      if (along) { ctx.fillRect(r[0], r[1], 3, h); ctx.fillRect(r[2] - 3, r[1], 3, h); }
      else { ctx.fillRect(r[0], r[1], w, 3); ctx.fillRect(r[0], r[3] - 3, w, 3); }
      return;
    }
    if (s.kind === 'plaza') {
      herringbone(ctx, r, x0, y0, x1, y1, pal('plazaJoint', 0.65));
      return;
    }
    ctx.strokeStyle = tone(colour, -1);
    ctx.lineWidth = 2;
    ctx.strokeRect(r[0] + 1, r[1] + 1, w - 2, h - 2);
  }

  function herringbone(ctx, r, x0, y0, x1, y1, colour) {
    var ax = Math.max(r[0], x0 - 24), ay = Math.max(r[1], y0 - 24), bx = Math.min(r[2], x1 + 24), by = Math.min(r[3], y1 + 24);
    if (ax >= bx || ay >= by) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    ctx.clip();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var b = 12;
    for (var y = Math.floor(ay / b) * b; y < by + b; y += b) {
      for (var x = Math.floor(ax / (2 * b)) * 2 * b; x < bx + 2 * b; x += 2 * b) {
        ctx.moveTo(x, y); ctx.lineTo(x + b, y + b); ctx.lineTo(x + 2 * b, y);
        ctx.moveTo(x + b, y + b); ctx.lineTo(x + b, y + 2 * b);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function overlapsAny(list, x0, y0, x1, y1) {
    for (var i = 0; i < list.length; i++) { var r = list[i].rect; if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true; }
    return false;
  }

  function lanePaint(ctx, g, x0, y0, x1, y1) {
    var DASH = 54, PERIOD = 112, WIDTH = 13;   // ART_AUDIO §2.1 `lanePaint`
    ctx.fillStyle = L().pal('lanePaint', 0.85);
    ctx.beginPath();
    for (var i = 0; i < g.streets.length; i++) {
      var s = g.streets[i];
      if (s.kind !== 'asphalt' && s.kind !== 'road') continue;
      var r = s.rect;
      if (!hitsR(r, x0 - DASH, y0 - DASH, x1 + DASH, y1 + DASH)) continue;
      var vertical = r[3] - r[1] >= r[2] - r[0];
      var c;
      if (s.lanes && s.lanes.length >= 2 && typeof s.lanes[0].at === 'number') c = (s.lanes[0].at + s.lanes[1].at) / 2;
      else c = vertical ? (r[0] + r[2]) / 2 : (r[1] + r[3]) / 2;
      var a0 = vertical ? r[1] : r[0], a1 = vertical ? r[3] : r[2];
      for (var t = a0 + 20; t + DASH <= a1 - 10; t += PERIOD) {
        var ea = vertical ? [c - WIDTH / 2, t, WIDTH, DASH] : [t, c - WIDTH / 2, DASH, WIDTH];
        if (overlapsAny(g.junctions, ea[0], ea[1], ea[0] + ea[2], ea[1] + ea[3]) || overlapsAny(g.zebras, ea[0], ea[1], ea[0] + ea[2], ea[1] + ea[3])) continue;
        if (ea[0] > x1 || ea[0] + ea[2] < x0 || ea[1] > y1 || ea[1] + ea[3] < y0) continue;
        ctx.rect(ea[0], ea[1], ea[2], ea[3]);
      }
    }
    ctx.fill();
  }

  function links(ctx, g, x0, y0, x1, y1) {
    var W = 40;
    if (!g.links || !g.links.length) return;
    var colour = L().pal('path', 0.82);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'square';
    [[W + 4, L().tone(colour, -1)], [W, colour]].forEach(function (pass) {
      ctx.strokeStyle = pass[1];
      ctx.lineWidth = pass[0];
      ctx.beginPath();
      g.links.forEach(function (l) {
        var xs = l.points.map(function (p) { return p[0]; }), ys = l.points.map(function (p) { return p[1]; });
        if (Math.max.apply(null, xs) < x0 - W || Math.min.apply(null, xs) > x1 + W || Math.max.apply(null, ys) < y0 - W || Math.min.apply(null, ys) > y1 + W) return;
        ctx.moveTo(l.points[0][0], l.points[0][1]);
        for (var i = 1; i < l.points.length; i++) ctx.lineTo(l.points[i][0], l.points[i][1]);
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  function zebra(ctx, r) {
    var w = r[2] - r[0], h = r[3] - r[1];
    ctx.fillStyle = L().pal('zebra', 0.95);
    ctx.beginPath();
    var bar = 18, gap = 18;
    if (w >= h) for (var x = r[0] + 6; x + bar <= r[2] - 4; x += bar + gap) ctx.rect(x, r[1] + 4, bar, h - 8);
    else for (var y = r[1] + 6; y + bar <= r[3] - 4; y += bar + gap) ctx.rect(r[0] + 4, y, w - 8, bar);
    ctx.fill();
  }

  function water(ctx, p, x0, y0, x1, y1, px) {
    if (p.type === 'bowl') { bowl(ctx, p.rect, x0, y0, x1, y1); return; }
    var rx = p.rx || p.r || (p.type === 'fountain' ? 90 : 120), ry = p.ry || p.r || (p.type === 'fountain' ? 90 : 90);
    if (p.x + rx < x0 || p.x - rx > x1 || p.y + ry < y0 || p.y - ry > y1) return;
    var pal = L().pal;
    if (p.type === 'fountain') {
      ctx.fillStyle = pal('stone', 0.66);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal('water', 0.6);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx - 12, ry * 0.8 - 10, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = L().tone(pal('path', 0.8), -1);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx + 6, ry + 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal('water', 0.6);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = pal('waterHi', 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var k = 0; k < 3; k++) {
      var ox = (h01(p.x, p.y, k, 'wx') - 0.5) * rx, oy = (h01(p.x, p.y, k, 'wy') - 0.5) * ry * 0.8;
      ctx.moveTo(p.x + ox - 14, p.y + oy);
      ctx.quadraticCurveTo(p.x + ox, p.y + oy - 5, p.x + ox + 14, p.y + oy);
    }
    ctx.stroke();
  }

  /** The skate bowl: a concave concrete basin (its lip catches the light, its floor is in shade). */
  function bowl(ctx, r, x0, y0, x1, y1) {
    if (!hitsR(r, x0, y0, x1, y1)) return;
    var c = L().pal('sidewalk', 0.78), w = r[2] - r[0], h = r[3] - r[1];
    ctx.fillStyle = L().tone(c, 1);
    ctx.beginPath(); roundRectPath(ctx, r[0], r[1], w, h, Math.min(w, h) * 0.45); ctx.fill();
    ctx.fillStyle = L().tone(c, -1);
    ctx.beginPath(); roundRectPath(ctx, r[0] + 14, r[1] + 10, w - 28, h - 24, Math.min(w, h) * 0.38); ctx.fill();
    ctx.fillStyle = L().tone(c, -2);
    ctx.beginPath(); roundRectPath(ctx, r[0] + 40, r[1] + 34, w - 80, h - 64, Math.min(w, h) * 0.25); ctx.fill();
    ctx.strokeStyle = L().pal('ink', 0.1);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); roundRectPath(ctx, r[0], r[1], w, h, Math.min(w, h) * 0.45); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function flap(ctx, d, x0, y0, x1, y1, px) {
    var xs = [d.a[0], d.b[0], d.c[0]], ys = [d.a[1], d.b[1], d.c[1]];
    if (Math.max.apply(null, xs) < x0 || Math.min.apply(null, xs) > x1 || Math.max.apply(null, ys) < y0 || Math.min.apply(null, ys) > y1) return;
    var pal = L().pal;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d.a[0], d.a[1]); ctx.lineTo(d.b[0], d.b[1]); ctx.lineTo(d.c[0], d.c[1]); ctx.closePath();
    ctx.fillStyle = pal('paperBack', 0.88);
    ctx.fill();
    ctx.clip();
    // Mirrored print showing through: ghost lettering rows and a mirrored sign outline.
    var bp = pal('backPrint', 0.7);
    ctx.globalAlpha = L().alphaOf(bp) < 1 ? L().alphaOf(bp) : 0.25;   // backPrint is printed at 25 %
    ctx.fillStyle = L().solid(bp);
    ctx.strokeStyle = L().solid(bp);
    var cx = (d.a[0] + d.b[0] + d.c[0]) / 3, cy = (d.a[1] + d.b[1] + d.c[1]) / 3;
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(d.b[1] - d.a[1], d.b[0] - d.a[0]));
    ctx.scale(-1, 1);
    ctx.beginPath();
    for (var row = 0; row < 3; row++) {
      var y = -30 + row * 30, x = -110;
      for (var k = 0; k < 9; k++) {
        var w = 8 + 10 * h01(row, k, 'glyph');
        ctx.rect(x, y, w, 14);
        x += w + 6;
      }
    }
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeRect(-80, 34, 150, 44);
    ctx.restore();
    // The crease: a 6 u soft shadow on the flap and a 2 u highlight along the fold.
    var ax = d.a[0], ay = d.a[1], bx = d.b[0], by = d.b[1];
    var len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len;
    if ((d.c[0] - ax) * nx + (d.c[1] - ay) * ny < 0) { nx = -nx; ny = -ny; }
    ctx.save();
    var grd = ctx.createLinearGradient(ax, ay, ax + nx * 6, ay + ny * 6);
    var ink = pal('ink', 0.1);
    grd.addColorStop(0, ink);
    grd.addColorStop(1, pal('paperBack', 0.88));
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx + nx * 6, by + ny * 6); ctx.lineTo(ax + nx * 6, ay + ny * 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = pal('paperEdge', 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }

  function footprint(ctx, g, x0, y0, x1, y1) {
    var f = g.footprint;
    if (!f || !hitsR(f, x0, y0, x1, y1)) return;
    var P = SR.art.exterior.colours(g);
    ctx.fillStyle = L().tone(P.shade, -2);
    for (var i = 0; i < g.masses.length; i++) {
      var ms = g.masses[i];
      ctx.fillRect(ms.x0, ms.y0, ms.x1 - ms.x0, ms.y1 - ms.y0);
    }
  }

  function decal(ctx, d, x0, y0, x1, y1, px) {
    var g = d.geom, p = g.porch;
    if (!p || !hitsR(p, x0 - 8, y0 - 8, x1 + 8, y1 + 8)) return;
    var pal = L().pal, tone = L().tone;
    var P = SR.art.exterior.colours(g);
    var door = g.door, ink = pal('ink', 0.1);
    var mat = tone(P.shade, -1);
    if (door.face === 'S') {
      ctx.fillStyle = tone(pal('sidewalk', 0.8), 1);
      ctx.fillRect(door.x - 40, door.y, 80, 8);
      ctx.fillStyle = mat;
      ctx.fillRect(door.x - 20, door.y + 11, 40, 14);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
      ctx.strokeRect(door.x - 40, door.y, 80, 8);
      ctx.strokeRect(door.x - 20, door.y + 11, 40, 14);
      ctx.globalAlpha = 1;
    } else if (door.face === 'E' || door.face === 'W') {
      var sx = door.face === 'E' ? 1 : -1;
      var mx0 = Math.min(door.x + sx * 4, door.x + sx * 22);
      ctx.fillStyle = mat;
      ctx.fillRect(mx0, door.y - 18, 18, 36);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
      ctx.strokeRect(mx0, door.y - 18, 18, 36);
      ctx.globalAlpha = 1;
    } else if (door.face === 'N') {
      // The ground-plane porch: slab, a two-step stoop at the annex and the mat in the outer strip.
      ctx.fillStyle = pal(['plaza', 'path'], 0.78);
      ctx.fillRect(p[0], p[1], p[2] - p[0], p[3] - p[1]);
      ctx.fillStyle = tone(pal(['plaza', 'path'], 0.78), 1);
      ctx.fillRect(door.x - 36, p[3] - 14, 72, 7);
      ctx.fillRect(door.x - 30, p[3] - 7, 60, 7);
      ctx.fillStyle = mat;
      ctx.fillRect(door.x - 20, p[1] + 6, 40, 16);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
      ctx.strokeRect(p[0], p[1], p[2] - p[0], p[3] - p[1]);
      ctx.strokeRect(door.x - 20, p[1] + 6, 40, 16);
      ctx.globalAlpha = 1;
    }
  }

  function grain(ctx, x0, y0, x1, y1, ppu) {
    var P = SR.art.paper;
    if (!P || typeof P.grain !== 'function') return;
    var gr;
    try { gr = P.grain(); } catch (e) { return; }
    if (!gr) return;
    var pat = typeof gr.setTransform === 'function' && !gr.getContext ? gr : ctx.createPattern(gr, 'repeat');
    if (!pat) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = pat;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /** The art kit's painter of a railing or wall (SR.art.props; CONTRACT §15.2), or null. */
  function artPainter(name) {
    var A = SR.art && SR.art.props;
    return A && typeof A[name] === 'function' ? A[name] : null;
  }

  function wall(ctx, w, x0, y0, x1, y1, px) {
    var th = w.w || 20, hz = 20;   // 40 u tall: 20 u on screen
    var ax = Math.min(w.a[0], w.b[0]), bx = Math.max(w.a[0], w.b[0]), ay = Math.min(w.a[1], w.b[1]), by = Math.max(w.a[1], w.b[1]);
    if (!hitsR([ax - th, ay - th - hz, bx + th, by + th], x0, y0, x1, y1)) return;
    // W2-Exterior request 4: the props painter draws the castle wall when it is there.
    var paint = artPainter('wall');
    if (paint) {
      try { paint(ctx, w.a, w.b, th); return; } catch (e) { SR.util.warnOnce('render.wall', 'SR.render: SR.art.props.wall threw: ' + e.message); }
    }
    var pal = L().pal, top = pal('stone', 0.66), face = pal('stoneShade', 0.55);
    var horiz = bx - ax >= by - ay;
    var r = horiz ? [ax, ay - th / 2, bx, ay + th / 2] : [ax - th / 2, ay, ax + th / 2, by];
    ctx.fillStyle = face;
    ctx.fillRect(r[0], r[3] - hz, r[2] - r[0], hz);
    ctx.fillStyle = top;
    ctx.fillRect(r[0], r[1] - hz, r[2] - r[0], r[3] - r[1]);
    ctx.fillStyle = L().tone(top, 1);
    ctx.beginPath();
    if (horiz) for (var x = r[0]; x < r[2]; x += 24) ctx.rect(x, r[1] - hz - 6, 12, 6);
    ctx.fill();
    ctx.strokeStyle = pal('ink', 0.1);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r[0], r[1] - hz, r[2] - r[0], r[3] - r[1] + hz);
    ctx.globalAlpha = 1;
  }

  function railing(ctx, r, x0, y0, x1, y1, px) {
    var ax = r.a[0], ay = r.a[1], bx = r.b[0], by = r.b[1];
    if (!hitsR([Math.min(ax, bx) - 10, Math.min(ay, by) - 24, Math.max(ax, bx) + 10, Math.max(ay, by) + 10], x0, y0, x1, y1)) return;
    // W2-Exterior request 4: the props painter draws the railings (posts every 48 u) when it is there.
    var paint = artPainter('railing');
    if (paint) {
      try { paint(ctx, r.a, r.b); return; } catch (e) { SR.util.warnOnce('render.railing', 'SR.render: SR.art.props.railing threw: ' + e.message); }
    }
    var len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 48));
    ctx.strokeStyle = L().pal('railing', 0.3);
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      ctx.moveTo(x, y); ctx.lineTo(x, y - 14);
    }
    ctx.moveTo(ax, ay - 14); ctx.lineTo(bx, by - 14);
    ctx.moveTo(ax, ay - 7); ctx.lineTo(bx, by - 7);
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------------------------
  // The chunk cache
  // ---------------------------------------------------------------------------------------------

  function genKey(v) { return Math.round(v.bz * v.s * 1000); }
  function cmax() { return L().compact() ? MAX_CHUNKS_COMPACT : MAX_CHUNKS; }

  function bakeChunk(g, gk, ppuB, i, j) {
    var key = gk + ':' + i + ':' + j;
    var cw = CHUNK / ppuB;
    var x0 = i * cw, y0 = j * cw, x1 = x0 + cw, y1 = y0 + cw;
    var c = chunks[key];
    // Open sky: nothing to bake, and no entry either (the draw pass skips unoccupied cells).
    if (!occupied(g, x0 - BAND, y0 - BAND, x1 + BAND, y1 + BAND)) return null;
    if (!c || !c.canvas) {
      if (nChunks >= cmax()) evictOne(gk);
      var cv = free.pop() || document.createElement('canvas');
      cv.width = CHUNK; cv.height = CHUNK;
      c = chunks[key] = { key: key, gk: gk, i: i, j: j, cw: cw, canvas: cv, empty: false, used: 0 };
      nChunks++;
    }
    var ctx = c.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CHUNK, CHUNK);
    ctx.setTransform(ppuB, 0, 0, ppuB, -i * CHUNK, -j * CHUNK);
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, cw, cw);
    ctx.clip();
    paint(ctx, g, x0, y0, x1, y1, ppuB);
    ctx.restore();
    return c;
  }

  function evictOne(gk) {
    // Other zooms first, then the least recently used.
    var worst = null;
    for (var k in chunks) {
      var c = chunks[k];
      if (!c.canvas) continue;
      if (!worst) { worst = c; continue; }
      var wo = worst.gk !== gk, co = c.gk !== gk;
      if (co && !wo) { worst = c; continue; }
      if (co === wo && c.used < worst.used) worst = c;
    }
    if (!worst) return;
    free.push(worst.canvas);   // reused at once by the bake that needed the slot
    delete chunks[worst.key];
    nChunks--;
  }

  function range(v) {
    var cw = CHUNK / (v.bz * v.s);
    // The band hangs 24 u below an edge: look one band further down.
    return { cw: cw, i0: Math.floor(v.x0 / cw), i1: Math.floor(v.x1 / cw), j0: Math.floor(v.y0 / cw), j1: Math.floor((v.y1 + BAND) / cw) };
  }

  var missing = [];

  /** Draws the ground chunks for the view (old-zoom chunks scaled, then a vector placeholder where nothing is baked). */
  function draw(ctx, v, m) {
    var g = model(m);
    if (!g) return;
    var gk = genKey(v);
    var rg = range(v);
    missing.length = 0;
    var exact = Math.abs(v.zoom - v.bz) < 1e-6;
    var covered = true;
    for (var i = rg.i0; i <= rg.i1; i++) {
      for (var j = rg.j0; j <= rg.j1; j++) {
        var c = chunks[gk + ':' + i + ':' + j];
        if (c) { c.used = v.frame; continue; }
        var x0 = i * rg.cw, y0 = j * rg.cw;
        if (!occupied(g, x0 - BAND, y0 - BAND, x0 + rg.cw + BAND, y0 + rg.cw + BAND)) continue;
        missing.push(i, j);
        covered = false;
      }
    }
    queued = missing.length / 2;
    if (!covered) {
      // Placeholder: the land in one fill, then any old-zoom chunks over it, scaled.
      L().worldTransform(ctx, v);
      ctx.fillStyle = L().pal('grass', 0.6);
      ctx.fill(g.land);
      L().count.fills++;
      for (var k in chunks) {
        var oc = chunks[k];
        if (oc.gk === gk || !oc.canvas) continue;
        var ox = oc.i * oc.cw, oy = oc.j * oc.cw;
        if (ox > v.x1 || ox + oc.cw < v.x0 || oy > v.y1 + BAND || oy + oc.cw < v.y0) continue;
        ctx.drawImage(oc.canvas, ox, oy, oc.cw, oc.cw);
        L().count.images++;
        oc.used = v.frame;
      }
    }
    if (exact) ctx.setTransform(1, 0, 0, 1, 0, 0);
    else L().worldTransform(ctx, v);
    for (var ii = rg.i0; ii <= rg.i1; ii++) {
      for (var jj = rg.j0; jj <= rg.j1; jj++) {
        var ch = chunks[gk + ':' + ii + ':' + jj];
        if (!ch || !ch.canvas) continue;
        if (exact) ctx.drawImage(ch.canvas, ii * CHUNK + v.tx, jj * CHUNK + v.ty);
        else ctx.drawImage(ch.canvas, ii * rg.cw, jj * rg.cw, rg.cw, rg.cw);
        L().count.images++;
      }
    }
    L().worldTransform(ctx, v);
  }

  /** Bakes up to 2 missing chunks within 3 ms, nearest to the camera plus its velocity look-ahead. */
  function bake(v, m) {
    var g = model(m);
    baked = 0;
    if (!g) return 0;
    if (lastCam && v.dt > 0) {
      vel.x = vel.x * 0.8 + ((v.x - lastCam.x) / v.dt) * 0.2;
      vel.y = vel.y * 0.8 + ((v.y - lastCam.y) / v.dt) * 0.2;
    }
    lastCam = { x: v.x, y: v.y };
    if (!missing.length) return 0;
    var gk = genKey(v), rg = range(v), ppuB = v.bz * v.s;
    var fx = v.x + vel.x * LOOKAHEAD, fy = v.y + vel.y * LOOKAHEAD;
    var t0 = performance.now();
    while (baked < BAKES_PER_FRAME && missing.length) {
      var best = -1, bd = Infinity;
      for (var k = 0; k < missing.length; k += 2) {
        var cx = (missing[k] + 0.5) * rg.cw, cy = (missing[k + 1] + 0.5) * rg.cw;
        var d = (cx - fx) * (cx - fx) + (cy - fy) * (cy - fy);
        if (d < bd) { bd = d; best = k; }
      }
      var c = bakeChunk(g, gk, ppuB, missing[best], missing[best + 1]);
      if (c) c.used = v.frame;
      missing.splice(best, 2);
      baked++;
      if (performance.now() - t0 > BAKE_MS) break;
    }
    return baked;
  }

  /** Bakes every chunk the view needs, now (tests, sheets, the title's first frame). @returns {number} */
  function bakeAll(v, m) {
    var g = model(m);
    if (!g) return 0;
    var gk = genKey(v), rg = range(v), ppuB = v.bz * v.s, n = 0;
    for (var i = rg.i0; i <= rg.i1; i++) {
      for (var j = rg.j0; j <= rg.j1; j++) {
        var key = gk + ':' + i + ':' + j;
        if (chunks[key]) { chunks[key].used = v.frame; continue; }
        var c = bakeChunk(g, gk, ppuB, i, j);
        if (!c) continue;
        c.used = v.frame;
        n++;
      }
    }
    missing.length = 0;
    return n;
  }

  /**
   * @returns {boolean} some sky can show in the view: a cell of it is not interior sheet (an edge,
   *   a hole, open sky, or the band under the sheet).
   */
  function skyVisible(v) {
    var g = model();
    if (!g) return true;
    var c = g.occ.interior;
    var x0 = Math.floor(v.x0 / OCC), x1 = Math.floor(v.x1 / OCC), y0 = Math.floor(v.y0 / OCC), y1 = Math.floor(v.y1 / OCC);
    for (var gx = x0; gx <= x1; gx++) for (var gy = y0; gy <= y1; gy++) if (!c[gx + ',' + gy]) return true;
    return false;
  }

  /** @returns {{d: number, nx: number, ny: number}|null} the nearest unrailed edge (distance and outward normal) to a point. */
  function edgeInfo(x, y) {
    var g = model();
    if (!g) return null;
    var best = null;
    function test(poly, outwardSign, skip) {
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length];
        if (skip && skip(a, b)) continue;
        var d = segDist(x, y, a, b);
        if (!best || d < best.d) {
          var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
          best = { d: d, nx: outwardSign * dy / len, ny: -outwardSign * dx / len };
        }
      }
    }
    var wm = g.m.wm;
    test(g.outline, signedArea(g.outline) > 0 ? 1 : -1, function (a, b) { return railedSegment(a, b, wm); });
    g.holes.forEach(function (h) { test(h.raw, signedArea(h.raw) > 0 ? -1 : 1, null); });
    return best;
  }

  /** @returns {object} chunk cache stats: count, max, device px and bytes, bakes last frame, queued. */
  function stats() {
    var px = CHUNK * CHUNK * nChunks;
    var gens = {};
    Object.keys(chunks).forEach(function (k) { if (chunks[k].canvas) gens[chunks[k].gk] = (gens[chunks[k].gk] || 0) + 1; });
    return { count: nChunks, max: cmax(), px: px, bytes: px * 4, baked: baked, queued: queued, gens: gens, free: free.length };
  }

  SR.render.ground = {
    draw: draw,
    bake: bake,
    bakeAll: bakeAll,
    model: model,
    edgeInfo: edgeInfo,
    skyVisible: skyVisible,
    invalidate: invalidate,
    reset: reset,
    stats: stats,
    CHUNK: CHUNK,
  };
})();
