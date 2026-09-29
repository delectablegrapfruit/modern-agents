// js/world/player.js — owner: W1-W. SR.world.player (ARCHITECTURE §8.2, §8.5; GDD §3.8; B-15):
// walking (280 u/s, 0.08 s to top), skating (×2, Pro Deck ×2.5, Marathoner ×1.15), driving the
// junker (×3) and the sports car (×5) with arcade steering on surfaces (asphalt full speed, paths
// and plazas 60 %, sidewalks and lawns capped at 200 u/s), getting in and out of your car within
// 64 u, click-to-walk routes from SR.world.nav, the car-hit knockdown, and people hopping 24 u
// aside from your car (no damage, no karma, no Heat). Leaving the ground hands over to
// SR.world.fall (the teeter). Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  var TAU = Math.PI * 2;
  var BACKWARD = Math.PI * 0.75;   // input more than 135° from the car's heading is the brake / reverse key
  // Feel constants of this module (engine details BALANCE B-15 does not tabulate).
  var DEAD = 0.2;                  // a move input longer than this counts (the pad's dead zone, CONTRACT §12.1)
  var WAYPOINT_R = 12, ARRIVE_R = 2, ARRIVE_EASE = 10;   // route waypoints reached within 12 u, the last within 2 u, slowing at 10 u/s per u
  var STUCK_FRAC = 0.25, STUCK_SEC = 0.6;                // a route moving < 25 % of its speed for 0.6 s re-plans once, then drops
  var BRAKE_X = 2, COAST_X = 0.5, HIT_KEEP = 0.5;        // the back key brakes at 2× the acceleration; coasting 0.5×; a wall keeps 50 % speed
  var STEER_V0 = 60, STEER_V1 = 240;                     // steering authority (v + 60) / 240, full from 180 u/s
  var KNOCK_DAMP = 0.8;                                  // velocity kept per step while knocked down
  var HOP_MIN_V = 20, HOP_REACH = 12, HOP_SEC = 0.6, BARK_SEC = 1.5;   // people hop from a car over 20 u/s within its radius + 12 u

  function W() { return SR.world; }
  function cfg() { return SR.world.cfg || (SR.world.cfg = SR.world.readCfg()); }
  function G() { return SR.world.geometry; }
  function state() { return SR.state; }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  var P = {
    x: 0, y: 0, vx: 0, vy: 0,
    /** The position at the start of the last fixed step (the renderer interpolates px → x by alpha). */
    px: 0, py: 0,
    /** Degrees clockwise from north (0 N, 90 E, 180 S, 270 W), as the original's rot. */
    facing: 180,
    /** 'walk' | 'skate' | 'drive'. */
    mode: 'walk',
    r: 14,
    /** The car being driven ('junker' | 'sports') or null; its heading a (radians, 0 = east) and signed speed v. */
    car: null, a: 0, v: 0,
    /** Seconds of car-hit knockdown left; seconds of teeter left (SR.world.fall sets it). */
    knockdown: 0, teeter: 0,
    /** Click-to-walk waypoints and the route ({ to: {x, y}, door: id | null }). */
    path: [], route: null,
    /** The last point on the ground at least 64 u from an unrailed edge. */
    lastSafe: null,
    surface: 'lawn',
    /** People who hopped aside from your car (a counter, for tests). */
    hops: 0,
  };
  var stuck = 0, replans = 0;

  /** @returns {object} the car table row for 'junker' | 'sports'. */
  function carSpec(car) {
    var c = cfg();
    return car === 'sports' ? { top: c.sports, accel: c.sportsAccel, turn: c.sportsTurn } : { top: c.junker, accel: c.junkerAccel, turn: c.junkerTurn };
  }

  function items() { var s = state(); return (s && s.items) || {}; }
  /** @returns {boolean} the player owns a skateboard or the Pro Deck. */
  P.hasBoard = function () { var it = items(); return (it.skateboard || 0) > 0 || (it.prodeck || 0) > 0; };
  /** @returns {boolean} the Marathoner perk applies (flag `perks`). */
  P.marathoner = function () {
    var s = state();
    return !!(SR.features && SR.features.perks && s && s.perks && s.perks.owned && s.perks.owned.indexOf('marathoner') >= 0);
  };

  /** @returns {number} the current top speed (u/s) on foot or in the car (before surface caps). */
  P.topSpeed = function (skating) {
    var c = cfg();
    if (P.car) return carSpec(P.car).top;
    var top = skating ? ((items().prodeck || 0) > 0 ? c.proDeck : c.skate) : c.walk;
    return P.marathoner() ? top * c.marathoner : top;
  };

  /** @returns {number} the speed cap of a surface for a car of top speed `top`. */
  P.surfaceCap = function (surface, top) {
    var c = cfg();
    if (surface === 'asphalt') return top;
    if (surface === 'path' || surface === 'plaza') return top * c.drivePath;
    return Math.min(top, c.driveCap);
  };

  // --- placement ----------------------------------------------------------------------------------
  /** Back to a fresh player on foot at pt (boot). */
  P.reset = function (pt) {
    P.car = null; P.mode = 'walk'; P.knockdown = 0; P.teeter = 0; P.hops = 0;
    P.place(pt ? pt.x : 0, pt ? pt.y : 0, pt && pt.facing !== undefined ? pt.facing : 180);
  };

  /** Puts the player on foot at (x, y) (a car being driven is parked where it is first). */
  P.place = function (x, y, facing) {
    if (P.car) P.park(P.x, P.y, P.a);
    P.x = P.px = x; P.y = P.py = y; P.vx = P.vy = 0; P.v = 0;
    if (facing !== undefined) P.facing = facing;
    P.mode = 'walk'; P.teeter = 0;
    P.cancelRoute();
    if (G().built && G().onGround(x, y) && !G().nearEdge(x, y, cfg().fallInside)) P.lastSafe = { x: x, y: y };
  };

  // --- cars ---------------------------------------------------------------------------------------
  function carRow(car) { var s = state(); return s && s.player && s.player.cars ? s.player.cars[car] : null; }

  /** Gets into a car (at its parked spot). silent: no range check (loading a game). */
  P.board = function (car, silent) {
    var row = carRow(car);
    if (!row || !row.owned || row.towed) return false;
    if (!silent && Math.hypot(row.x - P.x, row.y - P.y) > cfg().carRange) return false;
    P.cancelRoute();
    P.car = car; P.mode = 'drive'; P.x = P.px = row.x; P.y = P.py = row.y; P.a = row.a || 0; P.v = 0; P.vx = P.vy = 0;
    P.facing = ((P.a * 180 / Math.PI + 90) % 360 + 360) % 360;
    var s = state();
    if (s && s.player) s.player.driving = car;
    return true;
  };

  /** Parks the car being driven at (x, y) with heading a and gets out (the player stays put). */
  P.park = function (x, y, a) {
    if (!P.car) return false;
    var row = carRow(P.car), s = state();
    if (row) { row.x = Math.round(x); row.y = Math.round(y); row.a = Math.round((a === undefined ? P.a : a) * 1000) / 1000; }
    if (s && s.player) s.player.driving = null;
    P.car = null; P.mode = 'walk'; P.v = 0; P.vx = P.vy = 0;
    return true;
  };

  /** The nearest owned, un-towed car within range of the player. */
  P.carNear = function () {
    var best = null, bd = cfg().carRange;
    ['junker', 'sports'].forEach(function (car) {
      var row = carRow(car);
      if (!row || !row.owned || row.towed) return;
      var d = Math.hypot(row.x - P.x, row.y - P.y);
      if (d <= bd) { bd = d; best = car; }
    });
    return best;
  };

  /**
   * C / Y: get out of the car (it stays parked there; you step out beside it) or into your car
   * within 64 u (GDD §3.8).
   * @returns {{action: string, car: string}|null}
   */
  P.toggleCar = function () {
    if (P.car) {
      var car = P.car, cx = P.x, cy = P.y, a = P.a, c = cfg(), side = c.carRadius + P.r + 4, end = c.carLength / 2 + P.r + 4;
      P.park(cx, cy, a);
      // Step out on the driver's side, else the other side, else behind or ahead.
      var tries = [[-Math.sin(a), Math.cos(a), side], [Math.sin(a), -Math.cos(a), side], [-Math.cos(a), -Math.sin(a), end], [Math.cos(a), Math.sin(a), end]];
      for (var i = 0; i < tries.length; i++) {
        var x = cx + tries[i][0] * tries[i][2], y = cy + tries[i][1] * tries[i][2];
        if (G().walkable(x, y, P.r) && !G().nearEdge(x, y, P.r)) { P.x = P.px = x; P.y = P.py = y; break; }
      }
      return { action: 'out', car: car };
    }
    var near = P.carNear();
    if (near && P.board(near)) return { action: 'in', car: near };
    return null;
  };

  // --- routes ------------------------------------------------------------------------------------
  /** Drops the click-to-walk route (any movement input does). */
  P.cancelRoute = function () { P.path = []; P.route = null; stuck = 0; replans = 0; };

  /**
   * The door a click at ground point (x, y) means: a click on a door's porch or near its trigger
   * wins; otherwise a click on a building's footprint or drawn (projected) rect picks the building
   * drawn in front (the one whose ground contact is furthest south, as the painter sorts them).
   * @returns {object|null} the door
   */
  P.doorAt = function (x, y) {
    var g = G(), best = null, bestKey = -Infinity;
    for (var i = 0; i < g.doors.length; i++) {
      var d = g.doors[i], b = g.buildings[d.building], key = -Infinity;
      if (g.util.rectDist(x, y, d.trigger) < 24 || g.util.inRect(x, y, d.porch)) key = Infinity;
      else {
        b.masses.forEach(function (m, k) {
          var r = m.rect;
          if (g.util.inRect(x, y, r) || g.util.inRect(x, y, b.projected[k])) key = Math.max(key, r[3]);
        });
        b.tops.forEach(function (r) { if (g.util.inRect(x, y, r)) key = Math.max(key, r[3]); });
      }
      if (key > bestKey) { bestKey = key; best = d; }
    }
    return best;
  };

  /**
   * Click / tap to walk (GDD §3.8): a route over the nav grid to (x, y). A click on a building, its
   * porch or its door trigger walks to that door's trigger (the route then enters it).
   * @returns {boolean} a route was found
   */
  P.walkTo = function (x, y) {
    if (P.car) return false;
    var door = P.doorAt(x, y), to = { x: x, y: y };
    if (door) to = { x: door.tc[0], y: door.tc[1] };
    else if (!SR.world.nav.reachable(x, y).ok) {
      var near = SR.world.nav.nearest(x, y, 0);
      if (!near) return false;
      to = near;
    }
    var path = SR.world.nav.path({ x: P.x, y: P.y }, to);
    if (!path) return false;
    P.path = path;
    P.route = { to: to, door: door ? door.id : null };
    stuck = 0; replans = 0;
    return true;
  };

  /** Knocked down by a car (GDD §3.10): no control for `sec` seconds (default B-15 1.14 s). */
  P.knock = function (sec) {
    P.knockdown = sec === undefined ? cfg().knockdown : sec;
    P.cancelRoute();
  };

  // --- people hop aside --------------------------------------------------------------------------
  /** Moves a pedestrian or named NPC 24 u out of your car's way with a bark (no damage). */
  P.hopAside = function (e) {
    var c = cfg(), nx = -Math.sin(P.a), ny = Math.cos(P.a);
    var side = (e.x - P.x) * nx + (e.y - P.y) * ny >= 0 ? 1 : -1;
    var sides = [side, -side];
    for (var i = 0; i < 2; i++) {
      var x = e.x + nx * sides[i] * c.hop, y = e.y + ny * sides[i] * c.hop;
      if (G().walkable(x, y, 8)) { e.x = x; e.y = y; break; }
    }
    // hopT and barkT are the owner's animation timers; hopUntil keeps the car from re-hopping them.
    e.state = 'hop'; e.hopT = HOP_SEC; e.hopUntil = SR.world.time + HOP_SEC; e.bark = 'toast.world.hey'; e.barkT = BARK_SEC;
    P.hops++;
  };

  var PEOPLE_KINDS = ['ped', 'person', 'police'], SEG = { d: 0, x: 0, y: 0, t: 0 };
  function hopPeople() {
    if (Math.abs(P.v) < HOP_MIN_V) return;
    var c = cfg(), reach = c.carRadius + HOP_REACH, h = Math.max(0, c.carLength / 2 - c.carRadius);
    var hx = Math.cos(P.a) * h, hy = Math.sin(P.a) * h, g = G();
    for (var k = 0; k < PEOPLE_KINDS.length; k++) {
      var list = SR.world.entities(PEOPLE_KINDS[k]);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e || typeof e.x !== 'number' || e.visible === false || e.active === false) continue;
        if (e.hopUntil && SR.world.time < e.hopUntil) continue;
        // within reach of the car's axis (its capsule), not only of its centre
        if (g.util.segClosest(e.x, e.y, P.x - hx, P.y - hy, P.x + hx, P.y + hy, SEG).d < reach) P.hopAside(e);
      }
    }
  }

  // --- update -------------------------------------------------------------------------------------
  // Scratch objects for the per-step hot path (ARCHITECTURE §17: no per-frame allocation).
  var BODY = { x: 0, y: 0, r: 14, safeEdges: false, len: 0, a: 0 }, WANT = { x: 0, y: 0 };
  /** The collision body: a circle on foot; in the car a capsule of its length along its heading. */
  function body(r, len) {
    BODY.x = P.x; BODY.y = P.y; BODY.r = r; BODY.safeEdges = SR.world.safeEdges();
    BODY.len = len || 0; BODY.a = P.a;
    return BODY;
  }

  function afterMove(res, ox, oy, dt) {
    P.x = res.x; P.y = res.y; P.surface = res.surface;
    if (res.hit) { P.vx = (P.x - ox) / dt; P.vy = (P.y - oy) / dt; }
    if (res.offGround) { SR.world.fall.teeter({ x: ox, y: oy }); return; }
    if (!G().nearEdge(P.x, P.y, cfg().fallInside)) {
      if (P.lastSafe) { P.lastSafe.x = P.x; P.lastSafe.y = P.y; } else P.lastSafe = { x: P.x, y: P.y };
    }
  }

  /** The velocity toward the route's next waypoint, into WANT. */
  function followRoute(top) {
    var wp = P.path[0], ex = wp.x - P.x, ey = wp.y - P.y, d = Math.sqrt(ex * ex + ey * ey);
    while (P.path.length > 1 && d < WAYPOINT_R) {
      P.path.shift();
      wp = P.path[0]; ex = wp.x - P.x; ey = wp.y - P.y; d = Math.sqrt(ex * ex + ey * ey);
    }
    if (P.path.length === 1 && d < ARRIVE_R) { P.path = []; WANT.x = WANT.y = 0; return WANT; }
    var speed = P.path.length === 1 ? Math.min(top, d * ARRIVE_EASE) : top;
    WANT.x = ex / d * speed; WANT.y = ey / d * speed;
    return WANT;
  }

  function foot(dt, input) {
    var c = cfg(), mag = Math.sqrt(input.x * input.x + input.y * input.y);
    var skating = !!input.skate && P.hasBoard();
    P.mode = skating ? 'skate' : 'walk';
    var top = P.topSpeed(skating), accT = skating ? c.skateAccel : c.walkAccel, rate = top / accT;
    var want;
    if (P.path.length) want = followRoute(top);
    else {
      var m = mag > 1 ? 1 / mag : 1;
      want = WANT;
      WANT.x = input.x * m * top; WANT.y = input.y * m * top;
    }
    var ddx = want.x - P.vx, ddy = want.y - P.vy, dl = Math.sqrt(ddx * ddx + ddy * ddy), max = rate * dt;
    if (dl > max) { ddx *= max / dl; ddy *= max / dl; }
    P.vx += ddx; P.vy += ddy;
    if (Math.abs(P.vx) < 1e-3 && Math.abs(P.vy) < 1e-3) { P.vx = P.vy = 0; return; }
    var ox = P.x, oy = P.y, res = SR.world.collide.move(body(P.r), P.vx * dt, P.vy * dt);
    if (P.vx || P.vy) P.facing = (Math.atan2(P.vx, -P.vy) * 180 / Math.PI + 360) % 360;
    afterMove(res, ox, oy, dt);
    // A route that stops making progress is re-planned once, then dropped.
    if (P.path.length) {
      var moved = Math.hypot(P.x - ox, P.y - oy);
      stuck = moved < top * dt * STUCK_FRAC ? stuck + dt : 0;
      if (stuck > STUCK_SEC) {
        stuck = 0;
        var route = P.route;
        if (replans++ < 1 && route) {
          var again = SR.world.nav.path({ x: P.x, y: P.y }, route.to);
          if (again) P.path = again; else P.cancelRoute();
        } else P.cancelRoute();
      }
    }
  }

  function drive(dt, input) {
    var c = cfg(), spec = carSpec(P.car), top = spec.top, acc = top / spec.accel, brake = acc * BRAKE_X;
    var mag = Math.min(1, Math.sqrt(input.x * input.x + input.y * input.y));
    if (mag > DEAD) {
      var diff = wrap(Math.atan2(input.y, input.x) - P.a);
      if (Math.abs(diff) <= BACKWARD) {
        var steer = spec.turn * dt * Math.min(1, (Math.abs(P.v) + STEER_V0) / STEER_V1);
        P.a = wrap(P.a + clamp(diff, -steer, steer));
        var target = top * mag;
        if (P.v < 0) P.v = Math.min(0, P.v + brake * dt);
        else if (P.v < target) P.v = Math.min(target, P.v + acc * dt);
        else P.v = Math.max(target, P.v - acc * dt);
      } else if (P.v > 5) {
        P.v = Math.max(0, P.v - brake * dt);              // the back key brakes...
      } else {
        P.v = Math.max(-c.reverse, P.v - acc * dt);       // ...then reverses at 200 u/s
      }
    } else {
      P.v = P.v > 0 ? Math.max(0, P.v - acc * COAST_X * dt) : Math.min(0, P.v + acc * COAST_X * dt);
    }
    var cap = P.surfaceCap(G().surfaceAt(P.x, P.y), top);
    P.v = clamp(P.v, -Math.min(cap, c.reverse), cap);
    var dx = Math.cos(P.a) * P.v * dt, dy = Math.sin(P.a) * P.v * dt;
    var ox = P.x, oy = P.y, res = SR.world.collide.move(body(c.carRadius, c.carLength), dx, dy);
    P.vx = Math.cos(P.a) * P.v; P.vy = Math.sin(P.a) * P.v;
    if (res.hit) P.v *= HIT_KEEP;
    P.facing = ((P.a * 180 / Math.PI + 90) % 360 + 360) % 360;
    afterMove(res, ox, oy, dt);
    if (P.car) hopPeople();
  }

  /**
   * One step of player movement.
   * @param {number} dt seconds
   * @param {{x: number, y: number, skate: boolean}=} input the move axis (length ≤ 1) and the skate
   *   hold (default: SR.input's)
   */
  P.update = function (dt, input) {
    input = input || SR.world.readInput();
    if (P.knockdown > 0) {
      P.knockdown = Math.max(0, P.knockdown - dt);
      P.vx *= KNOCK_DAMP; P.vy *= KNOCK_DAMP; P.v *= KNOCK_DAMP;
      return;
    }
    // Any movement input cancels the route, also one whose path has already run out (its end may
    // lie in a disarmed door trigger: a stale route there would later count as "routed" dwell).
    if ((P.path.length || P.route) && Math.sqrt(input.x * input.x + input.y * input.y) > DEAD) P.cancelRoute();
    if (P.car) drive(dt, input); else foot(dt, input);
  };

  SR.world.player = P;
})();
