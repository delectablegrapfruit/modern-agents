// js/world/collision.js — owner: W1-W. SR.world.collide: moving a round body (a person) or a
// capsule (a car, 96 × 52 u along its heading) through the city (ARCHITECTURE §8.2, GDD §3.8).
// Static solids (masses, the castle wall, the fountain, plinth and
// pond, solid props) push the body out along the shortest way, so it slides along walls per axis;
// a face met within 6 u of its end nudges the body around the corner. Railings (and, with Safe
// edges or Guard Rails for All, every edge of the sheet) block; unrailed edges do not: the body's
// centre may leave the ground, which the result reports as offGround (the teeter, js/world/fall.js).
// Also the per-step dynamic hash of cars and people (collide.dynamic). Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  var SUBSTEP = 8;      // u per sub-step, well under the smallest radius (no tunnelling)
  var NUDGE = 6;        // the corner-rounding nudge (GDD §3.8)
  var ITER = 3;         // resolution passes per sub-step (a round body)
  var ITER_CAPSULE = 6; // a car's capsule can be wedged between two faces: more passes

  function G() { return SR.world.geometry; }

  // Scratch storage: moving bodies runs every step for the player (and W2-City's walkers), so the
  // hot path allocates nothing (ARCHITECTURE §17). None of these is ever returned to a caller.
  var LIST_R = [], LIST_N = [], SD = { d: 0, nx: 0, ny: 0 }, SC = { d: 0, x: 0, y: 0, t: 0 };
  var RES = { x: 0, y: 0, hit: false, solid: null }, NUD = { x: 0, y: 0, hit: false, solid: null };

  // The shape resolveInto pushes: SH_N circles of radius r spread evenly over ±SH_H along the unit
  // heading (SH_HX, SH_HY). A person is one circle; a car (GDD §3.8: 96 × 52 u) is a capsule of
  // circles of half its width along its heading, so neither its nose nor its tail sinks into a wall.
  var SH_N = 1, SH_H = 0, SH_HX = 1, SH_HY = 0;
  function shape(len, a, r) {
    var h = len > 2 * r ? len / 2 - r : 0;
    SH_H = h; SH_N = h > 0 ? Math.ceil(2 * h / r) + 1 : 1;
    SH_HX = Math.cos(a || 0); SH_HY = Math.sin(a || 0);
  }

  /**
   * Pushes the current shape (see shape()) at (x, y) out of every solid (and blocking edge) it
   * overlaps, into `out`.
   * @param {number} x
   * @param {number} y
   * @param {number} r circle radius
   * @param {boolean} allEdges every sheet edge blocks (Safe edges), not only railings
   * @param {object} out the result to fill
   * @returns {{x: number, y: number, hit: boolean, solid: object|null}} out
   */
  function resolveInto(x, y, r, allEdges, out) {
    var g = G(), hit = false, blocker = null, iters = SH_N > 1 ? ITER_CAPSULE : ITER;
    for (var it = 0; it < iters; it++) {
      var moved = false;
      for (var j = 0; j < SH_N; j++) {
        var o = SH_N === 1 ? 0 : -SH_H + 2 * SH_H * j / (SH_N - 1);
        var px = x + SH_HX * o, py = y + SH_HY * o, x0 = px, y0 = py;
        var list = g.solidsNear(px, py, r, LIST_R);
        for (var i = 0; i < list.length; i++) {
          var sd = g.solidDist(list[i], px, py, SD);
          if (sd.d < r) {
            var push = r - sd.d;
            px += sd.nx * push; py += sd.ny * push;
            moved = hit = true;
            blocker = list[i];
          }
        }
        list.length = 0;
        // The sheet edges that block here: railings always, every edge with Safe edges.
        var cx = Math.floor(px / 128), cy = Math.floor(py / 128);
        var edges = cx >= 0 && cy >= 0 && cx < g.ebCols && cy < g.ebRows ? g.ebuckets[cy * g.ebCols + cx] : g.edges;
        for (var k = 0; k < edges.length; k++) {
          var e = edges[k];
          if (!e.railed && !allEdges) continue;
          var c = g.util.segClosest(px, py, e.a[0], e.a[1], e.b[0], e.b[1], SC);
          var vx = px - c.x, vy = py - c.y, inx = -e.out[0], iny = -e.out[1];
          if (c.t > 0 && c.t < 1) {
            var s = vx * inx + vy * iny;          // signed distance on the ground side
            if (s < r) { px += inx * (r - s); py += iny * (r - s); moved = hit = true; }
          } else if (c.d < r && vx * inx + vy * iny > -r) {
            if (c.d > 1e-6) { px += vx / c.d * (r - c.d); py += vy / c.d * (r - c.d); } else { px += inx * r; py += iny * r; }
            moved = hit = true;
          }
        }
        x += px - x0; y += py - y0;            // the whole body follows its circle
      }
      if (!moved) break;
    }
    out.x = x; out.y = y; out.hit = hit; out.solid = blocker;
    return out;
  }

  /**
   * Pushes a circle out of every solid (and blocking edge) it overlaps.
   * @returns {{x: number, y: number, hit: boolean, solid: object|null}} a new object
   */
  function resolve(x, y, r, allEdges) {
    shape(0, 0, r);
    return resolveInto(x, y, r, allEdges, { x: 0, y: 0, hit: false, solid: null });
  }

  /**
   * When a move along one axis (to wx, wy) was stopped by a rect face near its end, slides around
   * the corner from (gx, gy) (round bodies). @returns {boolean} nudged (the position is in NUD)
   */
  function nudge(axis, wx, wy, gx, gy, r, allEdges) {
    if (SH_N !== 1) return false;
    var g = G(), list = g.solidsNear(wx, wy, r, LIST_N), done = false, any = false;
    for (var i = 0; i < list.length && !done; i++) {
      var s = list[i];
      if (s.kind !== 'rect' || g.solidDist(s, wx, wy, SD).d >= r) continue;
      done = true;
      var lo = axis === 'x' ? s.rect[1] : s.rect[0], hi = axis === 'x' ? s.rect[3] : s.rect[2];
      var p = axis === 'x' ? wy : wx;
      var overLo = p + r - lo, overHi = hi - (p - r), shift = 0;
      if (overLo > 0 && overLo <= NUDGE) shift = -Math.min(overLo, 2);
      else if (overHi > 0 && overHi <= NUDGE) shift = Math.min(overHi, 2);
      if (shift) {
        resolveInto(axis === 'x' ? gx : gx + shift, axis === 'x' ? gy + shift : gy, r, allEdges, NUD);
        any = true;
      }
    }
    list.length = 0;
    return any;
  }

  // --- the per-step dynamic hash (ARCHITECTURE §8.2) -------------------------------------------------
  // Cars and people move every step, so their 256 u hash is rebuilt at the start of each world step
  // (SR.world.update) from the entity arrays SR.world.entities(kind) returns. Slots are reused
  // (no garbage per step); a query returns the entities of the slots its box touches.
  var DHASH = 256, DCOLS = 24, DROWS = 22;
  var dslots = [], dused = [], dcount = 0;
  var dyn = {
    /** Entities in the hash after the last rebuild. */
    get count() { return dcount; },
    /** Empties the hash. */
    clear: function () {
      for (var i = 0; i < dused.length; i++) dslots[dused[i]].length = 0;
      dused.length = 0; dcount = 0;
    },
    /** Adds one entity (its x, y) under a kind ('car' | 'ped' | 'person' | 'police' | any tag). */
    add: function (e, kind) {
      if (!e || typeof e.x !== 'number' || typeof e.y !== 'number' || !isFinite(e.x) || !isFinite(e.y)) return;
      var cx = Math.floor(e.x / DHASH), cy = Math.floor(e.y / DHASH);
      if (cx < 0) cx = 0; else if (cx >= DCOLS) cx = DCOLS - 1;
      if (cy < 0) cy = 0; else if (cy >= DROWS) cy = DROWS - 1;
      var k = cy * DCOLS + cx, slot = dslots[k] || (dslots[k] = []);
      if (!slot.length) dused.push(k);
      slot.push(e, kind);
      dcount++;
    },
    /** Rebuilds the hash from every module's live entities (SR.world.entities). */
    rebuild: function () {
      dyn.clear();
      var W = SR.world, kinds = W.ENTITY_KINDS || [];
      for (var i = 0; i < kinds.length; i++) {
        var list = W.entities(kinds[i]);
        for (var j = 0; j < list.length; j++) {
          var e = list[j];
          if (e && e.active !== false && e.visible !== false) dyn.add(e, kinds[i]);
        }
      }
    },
    /**
     * The entities whose position lies within r of (x, y).
     * @param {string[]=} kinds only these kinds (default: all)
     * @param {object[]=} out an array to fill (cleared first)
     * @returns {object[]} out
     */
    near: function (x, y, r, kinds, out) {
      out = out || [];
      out.length = 0;
      var c0 = Math.max(0, Math.floor((x - r) / DHASH)), c1 = Math.min(DCOLS - 1, Math.floor((x + r) / DHASH));
      var d0 = Math.max(0, Math.floor((y - r) / DHASH)), d1 = Math.min(DROWS - 1, Math.floor((y + r) / DHASH));
      var r2 = r * r;
      for (var cy = d0; cy <= d1; cy++) {
        for (var cx = c0; cx <= c1; cx++) {
          var slot = dslots[cy * DCOLS + cx];
          if (!slot) continue;
          for (var i = 0; i < slot.length; i += 2) {
            var e = slot[i];
            if (kinds && kinds.indexOf(slot[i + 1]) < 0) continue;
            var dx = e.x - x, dy = e.y - y;
            if (dx * dx + dy * dy <= r2) out.push(e);
          }
        }
      }
      return out;
    },
  };

  var C = {
    SUBSTEP: SUBSTEP,
    NUDGE: NUDGE,
    resolve: resolve,
    /** The per-step dynamic hash of cars and people: rebuild(), add(e, kind), near(x, y, r, kinds?, out?), clear(). */
    dynamic: dyn,

    /**
     * Moves a body by (dx, dy) through the static world. A round body by default; with `len` (> 2r)
     * and `a` (heading, radians) a capsule of that length and width 2r along the heading (a car),
     * which is also pushed out where it stands (turning in place near a wall).
     * @param {{x: number, y: number, r: number, safeEdges: (boolean|undefined), len: (number|undefined), a: (number|undefined)}} body
     * @param {number} dx
     * @param {number} dy
     * @returns {{x: number, y: number, hit: boolean, offGround: boolean, surface: string}} offGround and
     *   surface are the body's centre's
     */
    move: function (body, dx, dy) {
      var r = body.r || 14, x = body.x, y = body.y, hit = false, all = !!body.safeEdges;
      var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUBSTEP));
      var sx = dx / n, sy = dy / n, res;
      shape(body.len || 0, body.a, r);
      if (SH_N > 1) {
        res = resolveInto(x, y, r, all, RES);
        if (res.hit) { hit = true; x = res.x; y = res.y; }
      }
      for (var i = 0; i < n; i++) {
        if (sx) {
          res = resolveInto(x + sx, y, r, all, RES);
          if (res.hit) {
            hit = true;
            if (Math.abs(res.x - (x + sx)) > 1e-3 && (res.x - (x + sx)) * sx < 0 && nudge('x', x + sx, y, res.x, res.y, r, all)) res = NUD;
          }
          x = res.x; y = res.y;
        }
        if (sy) {
          res = resolveInto(x, y + sy, r, all, RES);
          if (res.hit) {
            hit = true;
            if (Math.abs(res.y - (y + sy)) > 1e-3 && (res.y - (y + sy)) * sy < 0 && nudge('y', x, y + sy, res.x, res.y, r, all)) res = NUD;
          }
          x = res.x; y = res.y;
        }
      }
      shape(0, 0, r);
      var g = G();
      return { x: x, y: y, hit: hit, offGround: !g.onGround(x, y), surface: g.surfaceAt(x, y) };
    },
  };

  SR.world.collide = C;
})();
