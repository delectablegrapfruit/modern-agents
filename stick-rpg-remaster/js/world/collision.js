// js/world/collision.js — owner: W1-W. SR.world.collide: moving a round body through the city
// (ARCHITECTURE §8.2, GDD §3.8). Static solids (masses, the castle wall, the fountain, plinth and
// pond, solid props) push the body out along the shortest way, so it slides along walls per axis;
// a face met within 6 u of its end nudges the body around the corner. Railings (and, with Safe
// edges or Guard Rails for All, every edge of the sheet) block; unrailed edges do not: the body's
// centre may leave the ground, which the result reports as offGround (the teeter, js/world/fall.js).
// Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  var SUBSTEP = 8;      // u per sub-step, well under the smallest radius (no tunnelling)
  var NUDGE = 6;        // the corner-rounding nudge (GDD §3.8)
  var ITER = 3;         // resolution passes per sub-step

  function G() { return SR.world.geometry; }

  /**
   * Pushes a circle out of every solid (and blocking edge) it overlaps.
   * @param {number} x
   * @param {number} y
   * @param {number} r body radius
   * @param {boolean} allEdges every sheet edge blocks (Safe edges), not only railings
   * @returns {{x: number, y: number, hit: boolean, solid: object|null}}
   */
  function resolve(x, y, r, allEdges) {
    var g = G(), hit = false, blocker = null;
    for (var it = 0; it < ITER; it++) {
      var moved = false, list = g.solidsNear(x, y, r);
      for (var i = 0; i < list.length; i++) {
        var sd = g.solidDist(list[i], x, y);
        if (sd.d < r) {
          var push = r - sd.d;
          x += sd.nx * push; y += sd.ny * push;
          moved = hit = true;
          blocker = list[i];
        }
      }
      var edges = blockingEdges(x, y, allEdges);
      for (var k = 0; k < edges.length; k++) {
        var e = edges[k], c = g.util.segClosest(x, y, e.a[0], e.a[1], e.b[0], e.b[1]);
        var vx = x - c.x, vy = y - c.y, inx = -e.out[0], iny = -e.out[1];
        if (c.t > 0 && c.t < 1) {
          var s = vx * inx + vy * iny;          // signed distance on the ground side
          if (s < r) { x += inx * (r - s); y += iny * (r - s); moved = hit = true; }
        } else if (c.d < r && vx * inx + vy * iny > -r) {
          if (c.d > 1e-6) { x += vx / c.d * (r - c.d); y += vy / c.d * (r - c.d); } else { x += inx * r; y += iny * r; }
          moved = hit = true;
        }
      }
      if (!moved) break;
    }
    return { x: x, y: y, hit: hit, solid: blocker };
  }

  /** The sheet edges that block at (x, y): railings always, every edge with Safe edges. */
  function blockingEdges(x, y, allEdges) {
    var g = G(), out = [];
    var cx = Math.floor(x / 128), cy = Math.floor(y / 128);
    var list = cx >= 0 && cy >= 0 && cx < g.ebCols && cy < g.ebRows ? g.ebuckets[cy * g.ebCols + cx] : g.edges;
    for (var i = 0; i < list.length; i++) if (list[i].railed || allEdges) out.push(list[i]);
    return out;
  }

  /** When a move along one axis was stopped by a rect face near its end, slide around the corner. */
  function nudge(axis, want, got, r, allEdges) {
    var g = G(), list = g.solidsNear(want.x, want.y, r);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.kind !== 'rect' || g.solidDist(s, want.x, want.y).d >= r) continue;
      var lo = axis === 'x' ? s.rect[1] : s.rect[0], hi = axis === 'x' ? s.rect[3] : s.rect[2];
      var p = axis === 'x' ? want.y : want.x;
      var overLo = p + r - lo, overHi = hi - (p - r), shift = 0;
      if (overLo > 0 && overLo <= NUDGE) shift = -Math.min(overLo, 2);
      else if (overHi > 0 && overHi <= NUDGE) shift = Math.min(overHi, 2);
      if (!shift) return null;
      var nx = axis === 'x' ? got.x : got.x + shift, ny = axis === 'x' ? got.y + shift : got.y;
      var res = resolve(nx, ny, r, allEdges);
      return { x: res.x, y: res.y };
    }
    return null;
  }

  var C = {
    SUBSTEP: SUBSTEP,
    NUDGE: NUDGE,
    resolve: resolve,

    /**
     * Moves a round body by (dx, dy) through the static world.
     * @param {{x: number, y: number, r: number, safeEdges: (boolean|undefined)}} body
     * @param {number} dx
     * @param {number} dy
     * @returns {{x: number, y: number, hit: boolean, offGround: boolean, surface: string}}
     */
    move: function (body, dx, dy) {
      var r = body.r || 14, x = body.x, y = body.y, hit = false, all = !!body.safeEdges;
      var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUBSTEP));
      var sx = dx / n, sy = dy / n;
      for (var i = 0; i < n; i++) {
        if (sx) {
          var want = { x: x + sx, y: y }, res = resolve(want.x, want.y, r, all);
          if (res.hit) {
            hit = true;
            if (Math.abs(res.x - want.x) > 1e-3 && (res.x - want.x) * sx < 0) {
              var nd = nudge('x', want, res, r, all);
              if (nd) res = nd;
            }
          }
          x = res.x; y = res.y;
        }
        if (sy) {
          var want2 = { x: x, y: y + sy }, res2 = resolve(want2.x, want2.y, r, all);
          if (res2.hit) {
            hit = true;
            if (Math.abs(res2.y - want2.y) > 1e-3 && (res2.y - want2.y) * sy < 0) {
              var nd2 = nudge('y', want2, res2, r, all);
              if (nd2) res2 = nd2;
            }
          }
          x = res2.x; y = res2.y;
        }
      }
      var g = G();
      return { x: x, y: y, hit: hit, offGround: !g.onGround(x, y), surface: g.surfaceAt(x, y) };
    },
  };

  SR.world.collide = C;
})();
