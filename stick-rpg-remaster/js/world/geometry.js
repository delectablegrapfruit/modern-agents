// js/world/geometry.js — owner: W1-W. SR.world.geometry: everything derived from the worldmap
// (ARCHITECTURE §8.1): the walkable polygon (outline minus holes minus solids), the sheet's edges
// split into railed and unrailed pieces, edgeDistance / railedAt / nearestSafe, the static solids
// and their 256 u spatial hash, ground surfaces, projected rects, porches and their visible strips,
// the doors (trigger, exit, kerb), and the sidewalk graph. Built once at boot (js/world/world.js,
// prio 30); no DOM, no canvas, Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  var HASH = 256;              // static solid hash cell (ARCHITECTURE §8.2)
  var HCOLS = 24, HROWS = 22;  // hash grid over the world box (5120 × 4608) plus a margin
  var EB = 128, EPAD = 64;     // edge buckets: 128 u cells listing the edges within 64 u of them
  var NORMALS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  var FACING = { N: 0, E: 90, S: 180, W: 270 };   // degrees clockwise from north (the original's rot)

  // Solid shapes of the props (GDD §3.8: tree r 20, lamp r 6, hydrant r 6, bench 48 × 16).
  var PROP_SOLIDS = {
    tree: { r: 20 }, lamp: { r: 6 }, hydrant: { r: 6 }, bin: { r: 8 }, chessTable: { r: 18 }, binoculars: { r: 8 },
    bench: { w: 48, h: 16 }, shelter: { w: 96, h: 32 },
  };
  var PED_SURFACES = { sidewalk: 1, path: 1, plaza: 1 };

  // ------------------------------------------------------------------------------------------------
  // Small geometry helpers (exported as geometry.util for the other world modules and the tests).
  // ------------------------------------------------------------------------------------------------
  /** @returns {number} distance from (x, y) to rect r (0 inside). */
  function rectDist(x, y, r) {
    var dx = x < r[0] ? r[0] - x : x > r[2] ? x - r[2] : 0;
    var dy = y < r[1] ? r[1] - y : y > r[3] ? y - r[3] : 0;
    return Math.sqrt(dx * dx + dy * dy);
  }
  /** @returns {boolean} (x, y) inside rect r (edges included). */
  function inRect(x, y, r) { return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; }
  /** @returns {boolean} rects a and b overlap with positive area. */
  function rectsOverlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  /** @returns {number[]|null} the intersection rect of a and b, or null. */
  function rectAnd(a, b) {
    var r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
    return r[0] < r[2] && r[1] < r[3] ? r : null;
  }
  /**
   * @param {object=} out an object to fill (default: a new object)
   * @returns {{d: number, x: number, y: number, t: number}} the closest point of segment ab to p.
   */
  function segClosest(px, py, ax, ay, bx, by, out) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx, qy = ay + t * dy;
    out = out || {};
    out.d = Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy)); out.x = qx; out.y = qy; out.t = t;
    return out;
  }
  /** @returns {boolean} point-in-polygon (even-odd). */
  function inPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inRoundRect(x, y, r, rad) {
    if (x < r[0] || x > r[2] || y < r[1] || y > r[3]) return false;
    var cx = x < r[0] + rad ? r[0] + rad : x > r[2] - rad ? r[2] - rad : x;
    var cy = y < r[1] + rad ? r[1] + rad : y > r[3] - rad ? r[3] - rad : y;
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad;
  }
  function rectPoly(r) { return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; }
  /** Clips segment ab to rect r (Liang-Barsky). @returns {number[]|null} [t0, t1] */
  function clipSeg(ax, ay, bx, by, r) {
    var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay;
    var p = [-dx, dx, -dy, dy], q = [ax - r[0], r[2] - ax, ay - r[1], r[3] - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t1 > t0 ? [t0, t1] : null;
  }

  var util = {
    rectDist: rectDist, inRect: inRect, rectsOverlap: rectsOverlap, rectAnd: rectAnd, segClosest: segClosest,
    inPoly: inPoly, inRoundRect: inRoundRect, rectPoly: rectPoly, clipSeg: clipSeg,
  };

  // ------------------------------------------------------------------------------------------------
  // The geometry object. Everything below is filled by build().
  // ------------------------------------------------------------------------------------------------
  var G = {
    util: util,
    built: false,
    map: null,
    NORMALS: NORMALS,
    FACING: FACING,
    /** Island bounding box [x0, y0, x1, y1] (the outline's). */
    bounds: null,
    /** The walkable polygon: { outline: [[x, y]], holes: [[[x, y]]] } (solids: G.solids). */
    polygon: null,
    /** The sheet's edges, split at railing and wall ends: { a, b, railed, kind, id, out: [nx, ny] }. */
    edges: [],
    /** Static solids: { kind: 'rect'|'circle'|'poly', rect|x,y,r|pts, aabb, src, id }. */
    solids: [],
    /** Blocking segments that are always solid (railings): { a, b, inward }. */
    rails: [],
    /** buildings[id] = { id, def, masses, projected: [rect], tops: [rect], door }. */
    buildings: {},
    /** Every door: { id, building, face, x, y, out, facing, trigger, tc, exit, kerb, porch, visible, name, homes }. */
    doors: [],
    doorById: {},
    /** Porches: [{ id, rect, visible }] (ARCHITECTURE §8.4). */
    porches: [],
    lanes: {},
    /** The sidewalk graph: { nodes: [{ id, x, y, kind }], edges: [[a, b, zebraId|null]], adj: [[id]] }. */
    graph: null,
  };

  // --- ground ---------------------------------------------------------------------------------------
  /** @returns {boolean} (x, y) is on the sheet: inside the outline and in no hole. */
  G.onGround = function (x, y) {
    if (!G.polygon) return false;
    var b = G.bounds;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
    if (!inPoly(x, y, G.polygon.outline)) return false;
    for (var i = 0; i < G.holeRects.length; i++) if (inRect(x, y, G.holeRects[i])) return false;
    return true;
  };

  /**
   * The nearest edge to (x, y).
   * @param {{railed: (boolean|undefined)}=} opts railed: true only railed edges, false only unrailed (default: any)
   * @returns {{d: number, x: number, y: number, nx: number, ny: number, railed: boolean, edge: object}|null}
   *   nx, ny: the edge's outward normal (toward the sky)
   */
  var NE = { d: 0, x: 0, y: 0, t: 0 };   // nearestEdge's scratch (it is called every frame by the renderer)
  G.nearestEdge = function (x, y, opts) {
    var bd = Infinity, bx = 0, by = 0, be = null, want = opts && opts.railed;
    for (var i = 0; i < G.edges.length; i++) {
      var e = G.edges[i];
      if (want !== undefined && e.railed !== want) continue;
      var c = segClosest(x, y, e.a[0], e.a[1], e.b[0], e.b[1], NE);
      if (c.d < bd) { bd = c.d; bx = c.x; by = c.y; be = e; }
    }
    return be ? { d: bd, x: bx, y: by, nx: be.out[0], ny: be.out[1], railed: be.railed, edge: be } : null;
  };

  function edgeBucket(x, y) {
    var cx = Math.floor(x / EB), cy = Math.floor(y / EB);
    return cx < 0 || cy < 0 || cx >= G.ebCols || cy >= G.ebRows ? null : G.ebuckets[cy * G.ebCols + cx];
  }
  function segD(x, y, e) {
    var ax = e.a[0], ay = e.a[1], dx = e.b[0] - ax, dy = e.b[1] - ay;
    var t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx - x, qy = ay + t * dy - y;
    return Math.sqrt(qx * qx + qy * qy);
  }

  /** @returns {number} distance from (x, y) to the nearest unrailed edge (Infinity if none). */
  G.edgeDistance = function (x, y) {
    var d = Infinity, i, list = edgeBucket(x, y);
    // Every edge within EPAD of the point is in its bucket, so a bucket hit that close is exact.
    if (list) for (i = 0; i < list.length; i++) if (!list[i].railed) d = Math.min(d, segD(x, y, list[i]));
    if (d <= EPAD) return d;
    for (i = 0; i < G.edges.length; i++) if (!G.edges[i].railed) d = Math.min(d, segD(x, y, G.edges[i]));
    return d;
  };

  /**
   * Fast test: is an unrailed edge (railed: true, a railed one) within m u of (x, y)? (m ≤ 64;
   * the hot paths: nav, the sidewalk graph, gusts.)
   * @returns {boolean}
   */
  G.nearEdge = function (x, y, m, railed) {
    var list = edgeBucket(x, y), want = !!railed;
    if (!list) return !want && !G.onGround(x, y);
    for (var i = 0; i < list.length; i++) if (list[i].railed === want && segD(x, y, list[i]) < m) return true;
    return false;
  };

  /** @returns {boolean} the sheet's edge nearest to (x, y) is railed (a railing or the castle wall). */
  G.railedAt = function (x, y) {
    var e = G.nearestEdge(x, y);
    return !!(e && e.railed);
  };

  /**
   * The nearest reachable nav node at least minInside u from any unrailed edge (the Fold Rescue's
   * landing spot, GDD §3.9). Delegates to SR.world.nav.
   * @returns {{x: number, y: number}|null}
   */
  G.nearestSafe = function (x, y, minInside) {
    return SR.world.nav && SR.world.nav.nearest ? SR.world.nav.nearest(x, y, minInside === undefined ? 64 : minInside) : null;
  };

  // --- surfaces -------------------------------------------------------------------------------------
  /**
   * The ground surface at (x, y) (vehicle speeds, ARCHITECTURE §8.5).
   * @returns {string} 'asphalt' | 'sidewalk' | 'path' | 'plaza' | 'lawn' | 'hole' | 'sky'
   */
  G.surfaceAt = function (x, y) {
    var cell = G.surfCells[hkey(x, y)];
    if (cell) {
      var best = null, rank = 99;
      for (var i = 0; i < cell.length; i++) {
        var s = cell[i];
        if (s.rank < rank && inRect(x, y, s.rect)) { best = s; rank = s.rank; }
      }
      if (best) return best.kind;
    }
    var jl = G.map && G.map.jogLoop;
    if (jl && inRoundRect(x, y, jl.rect, jl.r)) {
      var w = jl.w, inner = [jl.rect[0] + w, jl.rect[1] + w, jl.rect[2] - w, jl.rect[3] - w];
      if (!inRoundRect(x, y, inner, jl.r - w)) return 'path';
    }
    if (G.onGround(x, y)) return 'lawn';
    for (var h = 0; h < G.holeRects.length; h++) if (inRect(x, y, G.holeRects[h])) return 'hole';
    return 'sky';
  };

  /** @returns {object|null} the zebra crossing under (x, y). */
  G.zebraAt = function (x, y) {
    var z = G.map ? G.map.zebras : [];
    for (var i = 0; i < z.length; i++) if (inRect(x, y, z[i].rect)) return z[i];
    return null;
  };

  /** @returns {number} the hash slot of (x, y) (-1 outside the grid). */
  function hkey(x, y) {
    var cx = Math.floor(x / HASH), cy = Math.floor(y / HASH);
    return cx < 0 || cy < 0 || cx >= HCOLS || cy >= HROWS ? -1 : cy * HCOLS + cx;
  }
  /** Calls fn(slot) for every hash slot a rect touches. */
  function eachSlot(r, fn) {
    var c0 = Math.max(0, Math.floor(r[0] / HASH)), c1 = Math.min(HCOLS - 1, Math.floor(r[2] / HASH));
    var d0 = Math.max(0, Math.floor(r[1] / HASH)), d1 = Math.min(HROWS - 1, Math.floor(r[3] / HASH));
    for (var cy = d0; cy <= d1; cy++) for (var cx = c0; cx <= c1; cx++) fn(cy * HCOLS + cx);
  }

  // --- solids ---------------------------------------------------------------------------------------
  /**
   * @param {object[]=} out an array to fill (emptied first; hot loops pass a scratch array)
   * @returns {object[]} the static solids whose bounding boxes touch the box around (x, y) ± r
   */
  G.solidsNear = function (x, y, r, out) {
    if (out) out.length = 0; else out = [];
    var seen = G._stamp = (G._stamp || 0) + 1;
    var c0 = Math.floor((x - r) / HASH), c1 = Math.floor((x + r) / HASH);
    var d0 = Math.floor((y - r) / HASH), d1 = Math.floor((y + r) / HASH);
    for (var cx = c0; cx <= c1; cx++) {
      for (var cy = d0; cy <= d1; cy++) {
        if (cx < 0 || cy < 0 || cx >= HCOLS || cy >= HROWS) continue;
        var list = G.hash[cy * HCOLS + cx];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          if (s._seen === seen) continue;
          s._seen = seen;
          if (s.aabb[0] <= x + r && s.aabb[2] >= x - r && s.aabb[1] <= y + r && s.aabb[3] >= y - r) out.push(s);
        }
      }
    }
    return out;
  };

  function setDist(out, d, nx, ny) { out.d = d; out.nx = nx; out.ny = ny; return out; }
  var SEGB = { d: 0, x: 0, y: 0, t: 0 }, DIST = { d: 0, nx: 0, ny: 0 };   // scratch results (never returned)

  /**
   * Distance from (x, y) to a solid's outline (negative inside).
   * @param {object=} out an object to fill (hot loops pass a scratch one; default: a new object)
   * @returns {{d: number, nx: number, ny: number}} n: the unit direction pushing the point out
   */
  G.solidDist = function (s, x, y, out) {
    out = out || { d: 0, nx: 0, ny: 0 };
    if (s.kind === 'circle') {
      var dx = x - s.x, dy = y - s.y, l = Math.sqrt(dx * dx + dy * dy);
      return l > 1e-9 ? setDist(out, l - s.r, dx / l, dy / l) : setDist(out, -s.r, 0, 1);
    }
    if (s.kind === 'rect') {
      var r = s.rect;
      if (inRect(x, y, r)) {
        var dl = x - r[0], dr = r[2] - x, dt = y - r[1], db = r[3] - y, m = Math.min(dl, dr, dt, db);
        if (m === dl) return setDist(out, -dl, -1, 0);
        if (m === dr) return setDist(out, -dr, 1, 0);
        if (m === dt) return setDist(out, -dt, 0, -1);
        return setDist(out, -db, 0, 1);
      }
      var qx = x < r[0] ? r[0] : x > r[2] ? r[2] : x, qy = y < r[1] ? r[1] : y > r[3] ? r[3] : y;
      var ex = x - qx, ey = y - qy, el = Math.sqrt(ex * ex + ey * ey);
      return setDist(out, el, ex / el, ey / el);
    }
    // polygon: closest boundary point
    var pts = s.pts, bd = Infinity, bx0 = 0, by0 = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var c = segClosest(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1], SEGB);
      if (c.d < bd) { bd = c.d; bx0 = c.x; by0 = c.y; }
    }
    var inside = inPoly(x, y, pts), bx = x - bx0, by = y - by0, bl = Math.sqrt(bx * bx + by * by) || 1;
    return inside ? setDist(out, -bd, -bx / bl, -by / bl) : setDist(out, bd, bx / bl, by / bl);
  };

  var AT = [];   // solidAt's scratch list (it calls nothing that re-enters it)
  /** @returns {object|null} a static solid within r of (x, y) (r = 0: containing it). */
  G.solidAt = function (x, y, r) {
    r = r || 0;
    var list = G.solidsNear(x, y, r, AT), hit = null;
    for (var i = 0; i < list.length && !hit; i++) if (G.solidDist(list[i], x, y, DIST).d < r) hit = list[i];
    list.length = 0;
    return hit;
  };

  /** @returns {boolean} a body of radius r fits at (x, y): on the ground and clear of every solid. */
  G.walkable = function (x, y, r) { return G.onGround(x, y) && !G.solidAt(x, y, r || 0); };

  // --- buildings, porches and doors ------------------------------------------------------------------
  /** @returns {number[]} the projected rect of a mass [x0, y0 - 0.5h, x1, y1] (screen space before the camera). */
  G.project = function (rect, h) { return [rect[0], rect[1] - 0.5 * h, rect[2], rect[3]]; };

  /** @returns {{id: string, rect: number[], kind: string}[]} every building's projected rects (masses and tall tops). */
  G.projectedRects = function () {
    var out = [];
    Object.keys(G.buildings).forEach(function (id) {
      var b = G.buildings[id];
      b.projected.forEach(function (r) { out.push({ id: id, rect: r, kind: 'mass' }); });
      b.tops.forEach(function (r) { out.push({ id: id, rect: r, kind: 'top' }); });
    });
    return out;
  };

  /** @returns {number[][]} a building's projected rects (masses and tops). */
  G.projected = function (id) {
    var b = G.buildings[id];
    return b ? b.projected.concat(b.tops) : [];
  };

  function porchOf(bdef, d) {
    var annexH = 0;
    bdef.masses.forEach(function (m) { if (m.role === 'annex') annexH = m.h; });
    if (d.face === 'S') return [d.x - 48, d.y, d.x + 48, d.y + 40];
    if (d.face === 'E') return [d.x, d.y - 48, d.x + 32, d.y + 48];
    if (d.face === 'W') return [d.x - 32, d.y - 48, d.x, d.y + 48];
    return [d.x - 48, d.y - (0.5 * annexH + 32), d.x + 48, d.y];
  }

  /** The largest part of the porch not covered by the building's own projected rects, cut from the building side. */
  function visibleStrip(porch, own, face) {
    var v = porch.slice();
    own.forEach(function (r) {
      if (!rectsOverlap(v, r)) return;
      if (face === 'N') v[3] = Math.min(v[3], r[1]);
      else if (face === 'S') v[1] = Math.max(v[1], r[3]);
      else if (face === 'E') v[0] = Math.max(v[0], r[2]);
      else v[2] = Math.min(v[2], r[0]);
    });
    return v[0] < v[2] && v[1] < v[3] ? v : null;
  }

  function buildDoor(bdef, projected) {
    var d = bdef.door, n = NORMALS[d.face];
    var tcx = d.x + n[0] * 24, tcy = d.y + n[1] * 24;
    var trigger = n[0] ? [tcx - 24, tcy - 48, tcx + 24, tcy + 48] : [tcx - 48, tcy - 24, tcx + 48, tcy + 24];
    var porch = porchOf(bdef, d);
    return {
      id: bdef.id, building: bdef.id, face: d.face, x: d.x, y: d.y,
      out: n.slice(), facing: FACING[d.face],
      trigger: trigger, tc: [tcx, tcy],
      exit: { x: d.x + n[0] * 56, y: d.y + n[1] * 56, facing: FACING[d.face] },
      kerb: d.kerb ? d.kerb.slice() : null,
      porch: porch, visible: visibleStrip(porch, projected, d.face),
      name: bdef.name || ('place.' + bdef.id),
      homes: bdef.homes ? bdef.homes.slice() : null,
    };
  }

  // --- edges ------------------------------------------------------------------------------------------
  function splitEdges(map) {
    var edges = [];
    function add(a, b, kind, id, coverers) {
      var ax = a[0], ay = a[1], bx = b[0], by = b[1], len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) return;
      var iv = [];
      // A railing or wall covers the part of the edge that runs along it (both of its ends within
      // c.tol of the edge's line), between its ends.
      var off = function (p) { return Math.abs((bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax)) / len; };
      var along = function (p) { return ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / (len * len); };
      coverers.forEach(function (c) {
        if (off(c.seg.a) > c.tol || off(c.seg.b) > c.tol) return;
        var ta = along(c.seg.a), tb = along(c.seg.b);
        var t = [Math.max(0, Math.min(ta, tb)), Math.min(1, Math.max(ta, tb))];
        if (t[1] - t[0] > 1e-6) iv.push(t);
      });
      iv.sort(function (p, q) { return p[0] - q[0]; });
      var merged = [];
      iv.forEach(function (t) {
        var last = merged[merged.length - 1];
        if (last && t[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], t[1]); else merged.push(t.slice());
      });
      var cuts = [], pos = 0;
      merged.forEach(function (t) {
        if (t[0] > pos + 1e-6) cuts.push([pos, t[0], false]);
        cuts.push([t[0], t[1], true]);
        pos = t[1];
      });
      if (pos < 1 - 1e-6) cuts.push([pos, 1, false]);
      cuts.forEach(function (c) {
        var p = [ax + (bx - ax) * c[0], ay + (by - ay) * c[0]], q = [ax + (bx - ax) * c[1], ay + (by - ay) * c[1]];
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5) return;
        edges.push({ a: p, b: q, railed: c[2], kind: kind, id: id });
      });
    }
    var coverers = [];
    (map.railings || []).forEach(function (r) { coverers.push({ seg: r, tol: 1 }); });
    // The castle wall covers the rim edge that runs along it, within half its width (plus 1 u).
    (map.walls || []).forEach(function (w) { coverers.push({ seg: w, tol: w.w / 2 + 1 }); });
    var o = map.outline;
    for (var i = 0; i < o.length; i++) add(o[i], o[(i + 1) % o.length], 'outline', 'outline', coverers);
    (map.holes || []).forEach(function (h) {
      var p = rectPoly(h.rect);
      for (var k = 0; k < 4; k++) add(p[k], p[(k + 1) % 4], 'hole', h.id, []);
    });
    // Outward normals: the side of the edge that is sky.
    edges.forEach(function (e) {
      var dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], l = Math.hypot(dx, dy);
      var nx = dy / l, ny = -dx / l, mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
      if (G.onGround(mx + nx * 2, my + ny * 2) && !G.onGround(mx - nx * 2, my - ny * 2)) { nx = -nx; ny = -ny; }
      e.out = [nx, ny];
      e.len = l;
    });
    return edges;
  }

  // --- the sidewalk graph ----------------------------------------------------------------------------
  var GRAPH_STEP = 128, GRAPH_LINK = 192, GRAPH_CLEAR = 26, GRAPH_EDGE = 48;

  function pedSurface(x, y, allowLawn, allowZebra) {
    var s = G.surfaceAt(x, y);
    if (PED_SURFACES[s]) return true;
    if (allowZebra && s === 'asphalt' && G.zebraAt(x, y)) return true;
    return !!(allowLawn && s === 'lawn');
  }

  /** A segment pedestrians (and the player) can walk straight: on their surfaces, clear of solids and edges. */
  function graphSegOk(a, b, allowLawn, allowZebra) {
    var len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(len / 12));
    for (var i = 0; i <= n; i++) {
      var x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
      if (!pedSurface(x, y, allowLawn, allowZebra)) return false;
      if (G.solidAt(x, y, GRAPH_CLEAR)) return false;
      if (G.nearEdge(x, y, GRAPH_EDGE - 8)) return false;
    }
    return true;
  }

  function buildGraph(map) {
    var nodes = [], edges = [], adj = [];
    function node(x, y, kind, line) {
      if (!G.onGround(x, y) || G.edgeDistance(x, y) < GRAPH_EDGE || G.solidAt(x, y, GRAPH_CLEAR)) return -1;
      var id = nodes.length;
      nodes.push({ id: id, x: Math.round(x), y: Math.round(y), kind: kind, line: line });
      adj.push([]);
      return id;
    }
    function edge(a, b, zebra) {
      if (a < 0 || b < 0 || a === b || adj[a].indexOf(b) >= 0) return;
      edges.push([a, b, zebra || null]);
      adj[a].push(b);
      adj[b].push(a);
    }
    function line(x0, y0, x1, y1, kind, lineId, allowLawn) {
      var len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / GRAPH_STEP)), prev = -1;
      for (var i = 0; i <= n; i++) {
        var id = node(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, kind, lineId);
        if (id >= 0 && prev >= 0 && graphSegOk(nodes[prev], nodes[id], allowLawn, false)) edge(prev, id);
        if (id >= 0) prev = id;
      }
    }
    // Centre lines of sidewalks and paths; plazas (both sides > 200 u) get parallel lines.
    map.streets.forEach(function (s) {
      if (!PED_SURFACES[s.kind]) return;
      var r = s.rect, w = r[2] - r[0], h = r[3] - r[1], horiz = w >= h, short = horiz ? h : w;
      var inset = Math.min(64, (horiz ? w : h) / 4);
      var count = short <= 200 ? 1 : Math.round((short - 128) / GRAPH_STEP) + 1;
      for (var k = 0; k < count; k++) {
        var off = count === 1 ? short / 2 : 64 + (short - 128) * k / (count - 1);
        if (horiz) line(r[0] + inset, r[1] + off, r[2] - inset, r[1] + off, s.kind, s.id + ':' + k);
        else line(r[0] + off, r[1] + inset, r[0] + off, r[3] - inset, s.kind, s.id + ':' + k);
      }
    });
    // The jog loop's centre line (a rounded rectangle).
    if (map.jogLoop) {
      var jl = map.jogLoop, c = [jl.rect[0] + jl.w / 2, jl.rect[1] + jl.w / 2, jl.rect[2] - jl.w / 2, jl.rect[3] - jl.w / 2], rad = jl.r - jl.w / 2;
      var pts = [];
      var corners = [[c[2] - rad, c[1] + rad, -Math.PI / 2], [c[2] - rad, c[3] - rad, 0], [c[0] + rad, c[3] - rad, Math.PI / 2], [c[0] + rad, c[1] + rad, Math.PI]];
      corners.forEach(function (k) { for (var q = 0; q <= 4; q++) { var a = k[2] + q * Math.PI / 8; pts.push([k[0] + rad * Math.cos(a), k[1] + rad * Math.sin(a)]); } });
      var first = -1, prev = -1, last = null;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q2 = pts[(i + 1) % pts.length], len = Math.hypot(q2[0] - p[0], q2[1] - p[1]), n = Math.max(1, Math.round(len / GRAPH_STEP));
        for (var j = 0; j < n; j++) {
          var x = p[0] + (q2[0] - p[0]) * j / n, y = p[1] + (q2[1] - p[1]) * j / n;
          // corner arcs are sampled finely; keep a node only every ~GRAPH_STEP along the loop
          if (last && Math.hypot(x - last[0], y - last[1]) < GRAPH_STEP * 0.75) continue;
          var id = node(x, y, 'path', 'jogLoop');
          if (id < 0) continue;
          if (prev >= 0) edge(prev, id);
          if (first < 0) first = id;
          prev = id;
          last = [x, y];
        }
      }
      if (first >= 0 && prev >= 0) edge(prev, first);
    }
    // Walkway links across lawns.
    (map.links || []).forEach(function (l) {
      var prev = -1;
      for (var i = 1; i < l.points.length; i++) {
        var a = l.points[i - 1], b = l.points[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / GRAPH_STEP));
        for (var j = i === 1 ? 0 : 1; j <= n; j++) {
          var id = node(a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n, 'link', l.id);
          if (id >= 0 && prev >= 0) edge(prev, id);
          if (id >= 0) prev = id;
        }
      }
    });
    // Zebras: a node on the pavement at each end of the crossing, linked across it.
    map.zebras.forEach(function (z) {
      var r = z.rect, horiz = r[2] - r[0] > r[3] - r[1], a, b;
      if (horiz) { var cy = (r[1] + r[3]) / 2; a = node(r[0] - 40, cy, 'sidewalk', 'zebra:' + z.id); b = node(r[2] + 40, cy, 'sidewalk', 'zebra:' + z.id); }
      else { var cx = (r[0] + r[2]) / 2; a = node(cx, r[1] - 40, 'sidewalk', 'zebra:' + z.id); b = node(cx, r[3] + 40, 'sidewalk', 'zebra:' + z.id); }
      if (a >= 0 && b >= 0 && graphSegOk(nodes[a], nodes[b], false, true)) edge(a, b, z.id);
    });
    // Join nearby nodes of different lines where the straight way between them stays on pavement.
    var link = GRAPH_LINK * GRAPH_LINK;
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        if (a.line === b.line) continue;
        var d2 = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
        if (d2 > link) continue;
        var lawn = a.kind === 'link' || b.kind === 'link';
        if (graphSegOk(a, b, lawn, false)) edge(i, j);
      }
    }
    // (Every node ends up linked: tests/node/invariants.test.cjs checks the graph is one connected piece.)
    return { nodes: nodes, edges: edges, adj: adj };
  }

  // --- build ------------------------------------------------------------------------------------------
  /** Builds everything from the worldmap (SR.reg.worldmap.main or the given def). */
  G.build = function (map) {
    map = map || (SR.reg.worldmap && SR.reg.worldmap.main);
    if (!map) throw new Error('SR.world.geometry.build: no worldmap registered');
    G.map = map;
    var xs = map.outline.map(function (p) { return p[0]; }), ys = map.outline.map(function (p) { return p[1]; });
    G.bounds = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    G.holeRects = (map.holes || []).map(function (h) { return h.rect; });
    G.polygon = { outline: map.outline, holes: G.holeRects.map(rectPoly) };
    G.edges = splitEdges(map);
    G.rails = G.edges.filter(function (e) { return e.railed; });
    var size = map.size || { w: 5120, h: 4608 };
    G.ebCols = Math.ceil(size.w / EB);
    G.ebRows = Math.ceil(size.h / EB);
    G.ebuckets = [];
    for (var bi = 0; bi < G.ebCols * G.ebRows; bi++) G.ebuckets.push([]);
    G.edges.forEach(function (e) {
      var x0 = Math.min(e.a[0], e.b[0]) - EPAD, x1 = Math.max(e.a[0], e.b[0]) + EPAD;
      var y0 = Math.min(e.a[1], e.b[1]) - EPAD, y1 = Math.max(e.a[1], e.b[1]) + EPAD;
      for (var cy = Math.max(0, Math.floor(y0 / EB)); cy <= Math.min(G.ebRows - 1, Math.floor(y1 / EB)); cy++) {
        for (var cx = Math.max(0, Math.floor(x0 / EB)); cx <= Math.min(G.ebCols - 1, Math.floor(x1 / EB)); cx++) {
          var box = [cx * EB - EPAD, cy * EB - EPAD, (cx + 1) * EB + EPAD, (cy + 1) * EB + EPAD];
          if (clipSeg(e.a[0], e.a[1], e.b[0], e.b[1], box)) G.ebuckets[cy * G.ebCols + cx].push(e);
        }
      }
    });

    // Solids.
    var solids = [];
    function addRect(rect, src, id) { solids.push({ kind: 'rect', rect: rect, aabb: rect, src: src, id: id }); }
    function addCircle(x, y, r, src, id) { solids.push({ kind: 'circle', x: x, y: y, r: r, aabb: [x - r, y - r, x + r, y + r], src: src, id: id }); }
    G.buildings = {};
    G.doors = [];
    G.doorById = {};
    map.buildings.forEach(function (b) {
      var projected = b.masses.map(function (m) { return G.project(m.rect, m.h); });
      var tops = ((b.exterior && b.exterior.tops) || []).map(function (t) { return G.project(t.rect, t.h); });
      b.masses.forEach(function (m, i) { addRect(m.rect, 'mass', b.id + ':' + i); });
      var entry = { id: b.id, def: b, masses: b.masses, projected: projected, tops: tops, door: null,
        signature: ((b.exterior && b.exterior.signature) || []).map(function (r) { return r.slice(); }) };
      if (b.door) {
        entry.door = buildDoor(b, projected);
        G.doors.push(entry.door);
        G.doorById[b.id] = entry.door;
      }
      G.buildings[b.id] = entry;
    });
    G.porches = G.doors.map(function (d) { return { id: d.id, rect: d.porch, visible: d.visible }; });
    (map.walls || []).forEach(function (w, i) {
      var hw = w.w / 2;
      addRect([Math.min(w.a[0], w.b[0]) - (w.a[0] === w.b[0] ? hw : 0), Math.min(w.a[1], w.b[1]) - (w.a[1] === w.b[1] ? hw : 0),
        Math.max(w.a[0], w.b[0]) + (w.a[0] === w.b[0] ? hw : 0), Math.max(w.a[1], w.b[1]) + (w.a[1] === w.b[1] ? hw : 0)], 'wall', 'wall:' + i);
    });
    var f = map.features || {};
    if (f.fountain) addCircle(f.fountain.x, f.fountain.y, f.fountain.r, 'feature', 'fountain');
    if (f.plinth) addRect(f.plinth.rect, 'feature', 'plinth');
    if (f.pond) {
      var pts = [];
      for (var k = 0; k < 32; k++) pts.push([f.pond.x + f.pond.rx * Math.cos(k * Math.PI / 16), f.pond.y + f.pond.ry * Math.sin(k * Math.PI / 16)]);
      solids.push({ kind: 'poly', pts: pts, aabb: [f.pond.x - f.pond.rx, f.pond.y - f.pond.ry, f.pond.x + f.pond.rx, f.pond.y + f.pond.ry], src: 'feature', id: 'pond' });
    }
    (map.props || []).forEach(function (p, i) {
      var s = PROP_SOLIDS[p.type];
      if (!s) return;
      if (s.r) addCircle(p.x, p.y, s.r, 'prop', p.type + ':' + i);
      else {
        var vert = p.a === 90 || p.a === 270, hw = (vert ? s.h : s.w) / 2, hh = (vert ? s.w : s.h) / 2;
        addRect([p.x - hw, p.y - hh, p.x + hw, p.y + hh], 'prop', p.type + ':' + i);
      }
    });
    G.solids = solids;
    G.hash = [];
    solids.forEach(function (s) { eachSlot(s.aabb, function (k) { (G.hash[k] = G.hash[k] || []).push(s); }); });

    // Surfaces (lower rank wins): asphalt (roads, junctions, zebras), sidewalk, plaza, path.
    var RANK = { asphalt: 0, sidewalk: 1, plaza: 2, path: 3 };
    var surf = [];
    map.streets.forEach(function (s) { surf.push({ kind: s.kind, rect: s.rect, rank: RANK[s.kind], id: s.id }); });
    map.junctions.forEach(function (j) { surf.push({ kind: 'asphalt', rect: j.rect, rank: 0, id: j.id }); });
    map.zebras.forEach(function (z) { surf.push({ kind: 'asphalt', rect: z.rect, rank: 0, id: 'zebra:' + z.id }); });
    G.surfCells = [];
    surf.forEach(function (s) { eachSlot(s.rect, function (k) { (G.surfCells[k] = G.surfCells[k] || []).push(s); }); });
    G.lanes = {};
    map.streets.forEach(function (s) { (s.lanes || []).forEach(function (l) { G.lanes[l.id] = { id: l.id, axis: l.axis, dir: l.dir, at: l.at, street: s.id, rect: s.rect }; }); });

    G.graph = buildGraph(map);
    G.built = true;
    return G;
  };

  SR.world.geometry = G;
})();
