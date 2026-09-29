// js/world/nav.js — owner: W1-W. SR.world.nav: the 32 u nav grid (walkable cells keep 40 u from
// unrailed edges and a body radius from solids; ARCHITECTURE §8.1, B-15 navGrid), its connected
// component from the start, reachability, the nearest safe node for the Fold Rescue, and
// SR.world.nav.path(from, to): A* with the octile heuristic, no corner cutting, string-pulled,
// cached for 1 s. Built at boot by js/world/world.js after the geometry. Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  var SQRT2 = Math.SQRT2;
  var DX = [1, -1, 0, 0, 1, 1, -1, -1];
  var DY = [0, 0, 1, -1, 1, -1, 1, -1];

  var N = {
    built: false,
    cell: 32,
    cols: 0,
    rows: 0,
    /** walk[i]: 1 when cell i is walkable; comp[i]: its component id (0 = none); edge[i]: its edge distance. */
    walk: null,
    comp: null,
    edge: null,
    startComp: 0,
    startCell: -1,
    clearance: 14,
    edgeMargin: 40,
    reach: 32,
    cacheSec: 1,
    stats: { searches: 0, cacheHits: 0, lastMs: 0, lastExpanded: 0 },
  };

  var gScore, parent, mark, closed, gen = 0;
  var cache = {};
  var clock = 0;

  function G() { return SR.world.geometry; }

  /** @returns {number} the cell index containing (x, y), or -1 outside the grid. */
  N.cellAt = function (x, y) {
    var cx = Math.floor(x / N.cell), cy = Math.floor(y / N.cell);
    if (cx < 0 || cy < 0 || cx >= N.cols || cy >= N.rows) return -1;
    return cy * N.cols + cx;
  };
  /** @returns {{x: number, y: number}} the centre of cell i. */
  N.center = function (i) { return { x: (i % N.cols + 0.5) * N.cell, y: (Math.floor(i / N.cols) + 0.5) * N.cell }; };

  /** @returns {boolean} cell i is walkable and connected to the start. */
  N.connected = function (i) { return i >= 0 && N.walk[i] === 1 && N.comp[i] === N.startComp; };

  /**
   * Builds the grid.
   * @param {{start: {x: number, y: number}, cell: number, clearance: number, edgeMargin: number, reach: number}} opts
   */
  N.build = function (opts) {
    opts = opts || {};
    var g = G();
    N.cell = opts.cell || N.cell;
    N.clearance = opts.clearance || N.clearance;
    N.edgeMargin = opts.edgeMargin || N.edgeMargin;
    N.reach = opts.reach || N.reach;
    if (opts.cacheSec) N.cacheSec = opts.cacheSec;
    var size = (g.map && g.map.size) || { w: 5120, h: 4608 };
    N.cols = Math.ceil(size.w / N.cell);
    N.rows = Math.ceil(size.h / N.cell);
    var n = N.cols * N.rows;
    N.walk = new Uint8Array(n);
    N.comp = new Int32Array(n);
    N.edge = new Float32Array(n);
    gScore = new Float32Array(n);
    parent = new Int32Array(n);
    mark = new Uint32Array(n);
    closed = new Uint32Array(n);
    var b = g.bounds;
    for (var i = 0; i < n; i++) {
      var c = N.center(i);
      if (c.x < b[0] || c.x > b[2] || c.y < b[1] || c.y > b[3] || !g.onGround(c.x, c.y)) continue;
      // Exact edge distance near the rim (the Fold Rescue asks for ≥ 64 u); "far" elsewhere.
      N.edge[i] = g.nearEdge(c.x, c.y, 64) ? g.edgeDistance(c.x, c.y) : 1e6;
      if (N.edge[i] < N.edgeMargin) continue;
      if (g.nearEdge(c.x, c.y, N.clearance, true)) continue;
      if (g.solidAt(c.x, c.y, N.clearance)) continue;
      N.walk[i] = 1;
    }
    // Components (8-neighbour, no corner cutting).
    var id = 0, queue = new Int32Array(n);
    for (var s = 0; s < n; s++) {
      if (!N.walk[s] || N.comp[s]) continue;
      id++;
      var head = 0, tail = 0;
      queue[tail++] = s;
      N.comp[s] = id;
      while (head < tail) {
        var cur = queue[head++];
        forNeighbours(cur, function (nb) {
          if (!N.comp[nb]) { N.comp[nb] = id; queue[tail++] = nb; }
        });
      }
    }
    var start = opts.start || { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
    N.startCell = nearestCell(start.x, start.y, function (i) { return N.walk[i] === 1; }, 8);
    N.startComp = N.startCell >= 0 ? N.comp[N.startCell] : 0;
    cache = {};
    N.built = true;
    return N;
  };

  function forNeighbours(i, fn) {
    var cx = i % N.cols, cy = (i - cx) / N.cols;
    for (var k = 0; k < 8; k++) {
      var nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= N.cols || ny >= N.rows) continue;
      var j = ny * N.cols + nx;
      if (!N.walk[j]) continue;
      if (k >= 4 && (!N.walk[cy * N.cols + nx] || !N.walk[ny * N.cols + cx])) continue;
      fn(j, k >= 4 ? SQRT2 : 1);
    }
  }

  /** The nearest cell (by centre distance) within `rings` rings of (x, y) that passes test. */
  function nearestCell(x, y, test, rings) {
    var c0 = Math.floor(x / N.cell), r0 = Math.floor(y / N.cell), best = -1, bd = Infinity;
    for (var ring = 0; ring <= rings; ring++) {
      for (var cy = r0 - ring; cy <= r0 + ring; cy++) {
        for (var cx = c0 - ring; cx <= c0 + ring; cx++) {
          if (Math.max(Math.abs(cx - c0), Math.abs(cy - r0)) !== ring) continue;
          if (cx < 0 || cy < 0 || cx >= N.cols || cy >= N.rows) continue;
          var i = cy * N.cols + cx;
          if (!test(i)) continue;
          var c = N.center(i), d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
          if (d < bd) { bd = d; best = i; }
        }
      }
      // a cell one ring further out can still be closer than the best corner cell found
      if (best >= 0 && Math.sqrt(bd) <= ring * N.cell) break;
    }
    return best;
  }

  /** @returns {boolean} the straight segment a → b stays on the walkable polygon (ground, outside solids). */
  N.segmentInside = function (ax, ay, bx, by) {
    var g = G(), len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / 4));
    for (var i = 0; i <= n; i++) {
      var x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      if (!g.onGround(x, y) || g.solidAt(x, y, 0)) return false;
    }
    return true;
  };

  /**
   * Reachability (ARCHITECTURE §8.1): within `reach` (32 u) of the centre of a cell connected to the
   * start, with the segment between them inside the walkable polygon.
   * @returns {{ok: boolean, cell: number, d: number}}
   */
  N.reachable = function (x, y, reach) {
    reach = reach === undefined ? N.reach : reach;
    var best = { ok: false, cell: -1, d: Infinity };
    var c0 = Math.floor((x - reach) / N.cell), c1 = Math.floor((x + reach) / N.cell);
    var r0 = Math.floor((y - reach) / N.cell), r1 = Math.floor((y + reach) / N.cell);
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cy < 0 || cx >= N.cols || cy >= N.rows) continue;
        var i = cy * N.cols + cx;
        if (!N.connected(i)) continue;
        var c = N.center(i), d = Math.hypot(c.x - x, c.y - y);
        if (d > reach || d >= best.d) continue;
        if (!N.segmentInside(c.x, c.y, x, y)) continue;
        best = { ok: true, cell: i, d: d };
      }
    }
    return best;
  };

  /**
   * The nearest connected cell centre at least minInside u from every unrailed edge.
   * @returns {{x: number, y: number}|null}
   */
  N.nearest = function (x, y, minInside) {
    minInside = minInside === undefined ? 64 : minInside;
    var i = nearestCell(x, y, function (k) { return N.connected(k) && N.edge[k] >= minInside; }, 48);
    if (i < 0) {
      var bd = Infinity;
      for (var k = 0; k < N.walk.length; k++) {
        if (!N.connected(k) || N.edge[k] < minInside) continue;
        var c = N.center(k), d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
        if (d < bd) { bd = d; i = k; }
      }
    }
    return i >= 0 ? N.center(i) : null;
  };

  // --- A* -------------------------------------------------------------------------------------------
  // Binary heap of cell indices keyed by f, in typed arrays (lazy deletion: stale entries are
  // skipped when popped because their cell is already closed).
  var hIdx = new Int32Array(1024), hF = new Float32Array(1024), hLen = 0;
  function hpush(i, f) {
    if (hLen === hIdx.length) {
      var ni = new Int32Array(hLen * 2), nf = new Float32Array(hLen * 2);
      ni.set(hIdx); nf.set(hF); hIdx = ni; hF = nf;
    }
    var k = hLen++;
    while (k > 0) {
      var p = (k - 1) >> 1;
      if (hF[p] <= f) break;
      hIdx[k] = hIdx[p]; hF[k] = hF[p];
      k = p;
    }
    hIdx[k] = i; hF[k] = f;
  }
  function hpop() {
    var top = hIdx[0];
    hLen--;
    if (hLen > 0) {
      var li = hIdx[hLen], lf = hF[hLen], k = 0;
      for (;;) {
        var l = 2 * k + 1, r = l + 1, m = k, mf = lf;
        if (l < hLen && hF[l] < mf) { m = l; mf = hF[l]; }
        if (r < hLen && hF[r] < mf) { m = r; mf = hF[r]; }
        if (m === k) break;
        hIdx[k] = hIdx[m]; hF[k] = hF[m];
        k = m;
      }
      hIdx[k] = li; hF[k] = lf;
    }
    return top;
  }

  var H_WEIGHT = 1.001;   // a hair over 1 breaks ties toward the goal (fewer expansions, straighter runs)

  /** @returns {number[]|null} the cell path s → g (A*, octile heuristic, no corner cutting). */
  function astar(s, g) {
    gen++;
    hLen = 0;
    var cols = N.cols, rows = N.rows, walk = N.walk, gx = g % cols, gy = (g - gx) / cols;
    gScore[s] = 0; mark[s] = gen; parent[s] = -1;
    hpush(s, 0);
    var expanded = 0;
    while (hLen) {
      var c = hpop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      expanded++;
      if (c === g) {
        var out = [];
        for (var k = g; k >= 0; k = parent[k]) out.push(k);
        N.stats.lastExpanded = expanded;
        return out.reverse();
      }
      var cx = c % cols, cy = (c - cx) / cols, gc = gScore[c];
      for (var d = 0; d < 8; d++) {
        var nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var nb = ny * cols + nx;
        if (!walk[nb] || closed[nb] === gen) continue;
        if (d >= 4 && (!walk[cy * cols + nx] || !walk[ny * cols + cx])) continue;
        var ng = gc + (d >= 4 ? SQRT2 : 1);
        if (mark[nb] !== gen || ng < gScore[nb]) {
          gScore[nb] = ng; mark[nb] = gen; parent[nb] = c;
          var dx = nx > gx ? nx - gx : gx - nx, dy = ny > gy ? ny - gy : gy - ny;
          hpush(nb, ng + H_WEIGHT * ((dx + dy) + (SQRT2 - 2) * (dx < dy ? dx : dy)));
        }
      }
    }
    N.stats.lastExpanded = expanded;
    return null;
  }

  /** Keeps the cells of a path where its direction changes (plus both ends). */
  function corners(cells) {
    if (cells.length <= 2) return cells.slice();
    var out = [cells[0]];
    for (var i = 1; i < cells.length - 1; i++) if (cells[i] - cells[i - 1] !== cells[i + 1] - cells[i]) out.push(cells[i]);
    out.push(cells[cells.length - 1]);
    return out;
  }

  /** Exact test: a straight walk from a to b is safe for a body (on the ground, clear of solids, off the rim). */
  function lineClear(ax, ay, bx, by, edgeMin) {
    var g = G(), len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / 8));
    for (var i = 0; i <= n; i++) {
      var x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      if (!g.onGround(x, y) || g.solidAt(x, y, N.clearance + 1)) return false;
      if (edgeMin > 0 && g.nearEdge(x, y, edgeMin)) return false;
    }
    return true;
  }
  N.lineClear = lineClear;

  /** Grid test: every point of the segment (every 8 u) lies in a cell connected to the start. */
  function gridClear(ax, ay, bx, by) {
    var len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / 8));
    for (var i = 0; i <= n; i++) {
      var cx = Math.floor((ax + (bx - ax) * i / n) / N.cell), cy = Math.floor((ay + (by - ay) * i / n) / N.cell);
      if (cx < 0 || cy < 0 || cx >= N.cols || cy >= N.rows) return false;
      var k = cy * N.cols + cx;
      if (N.walk[k] !== 1 || N.comp[k] !== N.startComp) return false;
    }
    return true;
  }

  /**
   * A walking route from `from` to `to` (click-to-walk, GDD §3.8).
   * @param {{x: number, y: number}} from
   * @param {{x: number, y: number}} to
   * @returns {{x: number, y: number}[]|null} waypoints after `from`, ending at `to`; null when `to` is not reachable
   */
  N.path = function (from, to) {
    if (!N.built) return null;
    var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    N.stats.searches++;
    var goal = N.reachable(to.x, to.y);
    if (!goal.ok) return null;
    var start = nearestCell(from.x, from.y, function (i) {
      if (!N.connected(i)) return false;
      var c = N.center(i);
      return lineClear(from.x, from.y, c.x, c.y, 0);
    }, 3);
    if (start < 0) start = nearestCell(from.x, from.y, N.connected, 8);
    if (start < 0) return null;
    var edgeMin = Math.min(N.edgeMargin - 8, G().edgeDistance(from.x, from.y), G().edgeDistance(to.x, to.y));
    if (Math.hypot(to.x - from.x, to.y - from.y) < 4 * N.cell && lineClear(from.x, from.y, to.x, to.y, edgeMin)) return [{ x: to.x, y: to.y }];
    var key = start + ':' + goal.cell, hit = cache[key], cells;
    if (hit && clock - hit.t <= N.cacheSec) { cells = hit.cells; N.stats.cacheHits++; }
    else {
      cells = astar(start, goal.cell);
      cache[key] = { t: clock, cells: cells };
    }
    if (!cells) return null;
    var pts = [{ x: from.x, y: from.y }].concat(corners(cells).map(N.center), [{ x: to.x, y: to.y }]);
    var last = pts.length - 1;
    // String pulling: from each anchor, extend while the grid line of sight holds. A segment that
    // starts at `from` or ends at `to` (off the cell centres) must also pass the exact test.
    function ok(a, j) {
      if (!gridClear(pts[a].x, pts[a].y, pts[j].x, pts[j].y)) return false;
      return (a > 0 && j < last) || lineClear(pts[a].x, pts[a].y, pts[j].x, pts[j].y, edgeMin);
    }
    var out = [], a = 0;
    while (a < last) {
      var j = a + 1;
      while (j < last && gridClear(pts[a].x, pts[a].y, pts[j + 1].x, pts[j + 1].y)) j++;
      while (j > a + 1 && !ok(a, j)) j--;
      out.push(pts[j]);
      a = j;
    }
    if (t0) N.stats.lastMs = performance.now() - t0;
    return out;
  };

  /** Advances the cache clock (called by SR.world.update). */
  N.tick = function (dt) {
    clock += dt;
    if (clock > 5) {
      Object.keys(cache).forEach(function (k) { if (clock - cache[k].t > N.cacheSec) delete cache[k]; });
    }
  };

  SR.world.nav = N;
})();
