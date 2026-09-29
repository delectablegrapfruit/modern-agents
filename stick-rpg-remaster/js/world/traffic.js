// js/world/traffic.js — owner: W2-City. SR.world.traffic: the cars of GDD §3.10 and BALANCE B-22.
// Cars drop into their lane from the sky at the road ends (Main N end southbound, Main S end
// northbound, West Ave W end eastbound, East Ave E end westbound), follow a route of lanes and
// junction turns picked at spawn (T-junctions with Main the through road: straight 0.7 / turn 0.3
// from Main, left 0.5 / right 0.5 from the avenue, never a U-turn), keep a 72 u gap with smooth
// braking, cross a junction box one car at a time (first come, first served, and only with room to
// leave it, so it never deadlocks; walkers and cars take turns at the crosswalks, and a car waiting
// at a crosswalk's stop line keeps its turn until the box is free for it, so a queue is not starved),
// always stop for anyone on a zebra, and tumble off the far road
// end into the clouds. A driver with the player ahead in its lane within 220 u notices with
// clamp(0.55 + karma/250, 0.2, 0.95) (always on a zebra, always under Pedestrian Supremacy), brakes
// at 1400 u/s² and honks; one who doesn't hits (world.carHit: -10 HP and the 1.14 s knockdown).
// The player's car driving into one is a crash (world.carCrash: both bounce). Spawns come every
// rand(3..6) s per lane by day (07:00-20:00) and rand(8..14) s at night, at most 14 cars, simulated
// within 2 screens of the camera: others despawn, and a lane whose road end lies out of that range
// enters at its edge, off screen. Rain stretches braking ×1.3 and fog slows cruising ×0.8 (flag
// `weather`). Walkers are never hit: cars stop for anyone in their path. A car that has to brake
// harder than its normal braking from speed leaves skid marks (`skids`, ART_AUDIO §8) that fade out.
// Randomness: SR.rng.world.
// The city scene switches the simulation on (`live`); W1-W's headless tests run the world without it.
// Node-safe (no DOM); horns and whistles go through SR.audio when it exists.
(function () {
  'use strict';
  var SR = window.SR;

  // Engine and presentation constants (CONTRACT D49); the game numbers are SR.tuning.traffic (B-22)
  // and SR.tuning.world (B-15).
  var TURN_SEGS = 10;          // samples of a junction turn (a quadratic Bézier through the lanes' corner)
  var LOOK = 300;              // u of route ahead a driver watches (the 220 u notice range fits inside)
  var ACCEL = 900;             // u/s² when speeding up (half a second to cruise)
  var EMERGENCY = 4;           // × the brake for a stop that must happen now (a zebra, a stop line)
  var LINE_PAD = 6;            // a car stops this far short of a stop line or a zebra
  var PERSON_GAP = 28;         // bumper to person when a driver stops for someone
  var PLAYER_CAR_GAP = 24;     // bumper to bumper behind the player's car
  var REQUEST_PAD = 48;        // a car asks for a junction box within its braking distance plus this
  var ZEBRA_PAD = 24;          // a pedestrian steps on only when every car can stop this far short
  var ZEBRA_EDGE = 10;         // someone within this of a zebra's rect counts as on it
  var CARS_TURN = 3;           // s: after a crossing held cars up, pedestrians let them go first
  var CARS_TURN_MAX = 10;      // s: ... and longer while a car still waits at that zebra's stop line for a busy box
  var ZEBRA_HOLD = 120;        // u past a box's exit whose zebras a box holder must find empty
  var HIT_MIN_V = 40;          // slower than this a car nudges, never hits
  var IMMUNE_SEC = 1;          // after a knockdown, cars keep stopping for the player this long
  var CRASH_SEC = 1;           // cool-down between two crashes
  var CRASH_PUSH = 14;         // u the player's car is pushed out of a crash
  var FORGET_SEC = 0.4;        // a driver forgets its notice roll once the player left its path this long
  var HONK_SEC = 3;            // at most one honk per car in this time
  var DROP_Z = 260, GRAVITY = 2200, BOUNCE = 0.3, DROP_IN = 12, BOUNCE_MIN = 150;   // drop-in from the sky
  var TUMBLE_SEC = 1.3, TUMBLE_SPIN = 6, TUMBLE_DRAG = 0.4;                         // off the road end
  var RETRY_SEC = 0.5;         // a blocked spawn tries again this soon
  var ENTRY_STEP = 48;         // u between the points tried for an entry at the range's edge
  var AMBIENT_R = 900;         // cars within this of the camera make the city bed (ARCHITECTURE §12 cull)
  var AMBIENT_FULL = 6;        // that many cars near the camera is a full city bed
  var SKID_V = 240;            // u/s: an emergency stop from at least this fast leaves skid marks
  var SKID_LEN = 140;          // u: the longest mark
  var SKID_SEC = 8;            // s a mark takes to fade out
  var SKID_MAX = 16;           // marks at once (the oldest goes first)
  // The traffic mix (ART_AUDIO §8; police cars are W3-Crime's, flag `police`).
  var KINDS = [['sedan', 35], ['compact', 30], ['taxi', 20], ['van', 15]];
  var DEF_SIZE = { L: 96, W: 52 };

  function T() { return SR.tuning.traffic; }
  function W() { return SR.world; }
  function G() { return SR.world.geometry; }
  function wcfg() { return SR.world.cfg || SR.world.readCfg(); }
  function rng() { return SR.rng.world; }
  function hasFn(o, k) { return !!(o && typeof o[k] === 'function'); }

  var TR = {
    /**
     * The live cars (the renderer's list), with ARCHITECTURE §8.2's fields: { id, lane (the in-lane
     * of its route), x, y, a (radians, 0 east), v, vTarget (the speed it may have now), kind, state
     * ('drop' | 'drive' | 'tumble'; also `phase`), honkT (s until it may honk again), braking,
     * visible, px, py, ... }.
     */
    cars: [],
    /** The city scene switches the simulation on while it runs (the title may too). */
    live: false,
    /** New cars appear (tests switch it off to drive single cars). */
    spawning: true,
    /** Counters for tests and the city's feedback. */
    stats: { spawned: 0, exited: 0, despawned: 0, hits: 0, crashes: 0, noticed: 0, missed: 0, blocked: 0 },
    /** The last hit or crash: { kind: 'hit' | 'crash', t, x, y, car, result }. */
    last: null,
    /**
     * Skid marks on the road (ART_AUDIO §8), for the ground pass to draw under the cars with
     * SR.art.vehicles.skid(ctx, kind, a, x, y, len, alpha): { kind, a, x, y, len, alpha, t }.
     */
    skids: [],
  };

  // ------------------------------------------------------------------------------------------------
  // The lane network and its routes (built once from the worldmap: lanes, portals, junctions, zebras)
  // ------------------------------------------------------------------------------------------------
  var net = null;

  /** @returns {number[]} a lane's unit direction. */
  function dirOf(L) { return L.axis === 'y' ? [0, L.dir] : [L.dir, 0]; }
  /** Signed coordinate along a lane (grows the way it drives). */
  function coordOf(L, x, y) { return L.dir * (L.axis === 'y' ? y : x); }
  /** The lane's point at a signed coordinate. */
  function pointOf(L, c) { var v = c * L.dir; return L.axis === 'y' ? [L.at, v] : [v, L.at]; }
  /** Does the lane's line cross rect r? */
  function crosses(L, r) { return L.axis === 'y' ? L.at >= r[0] && L.at <= r[2] : L.at >= r[1] && L.at <= r[3]; }
  /** A rect's [enter, leave] signed coordinates along a lane. */
  function spanOf(L, r) {
    var a = L.axis === 'y' ? r[1] : r[0], b = L.axis === 'y' ? r[3] : r[2];
    return L.dir > 0 ? [a, b] : [-b, -a];
  }

  /** The probabilities of a junction's exits for a car arriving on `lane` (B-22 junction). */
  function exitOdds(j, lane) {
    var ex = j.exits[lane] || [], L = net.lanes[lane], t = T().junction, out = [], sum = 0;
    var main = L.street === j.through, turns = ex.filter(function (e) { return e !== lane; }).length || 1;
    ex.forEach(function (e) {
      var p;
      if (e === lane) p = t.mainStraight;
      else if (main) p = t.mainTurn / turns;
      else {
        var a = dirOf(L), b = dirOf(net.lanes[e]);
        p = a[0] * b[1] - a[1] * b[0] < 0 ? t.avenueLeft : t.avenueRight;   // screen y grows south: negative is a left turn
      }
      out.push(p); sum += p;
    });
    return out.map(function (p) { return sum > 0 ? p / sum : 1 / out.length; });
  }

  /** The stop line before a box on a lane: the near edge of a zebra that touches the box, else the box edge. */
  function stopCoord(L, enter) {
    var z = G().map.zebras || [], stop = enter;
    for (var i = 0; i < z.length; i++) {
      if (!crosses(L, z[i].rect)) continue;
      var sp = spanOf(L, z[i].rect);
      if (Math.abs(sp[1] - enter) <= 2) stop = Math.min(stop, sp[0]);
    }
    return stop;
  }

  /** Builds a route's polyline, stops (junction boxes) and zebra intervals from its lane steps. */
  function buildRoute(inp, steps, prob, key) {
    var pts = [], stops = [];
    function add(p) {
      var n = pts.length;
      if (n && Math.abs(pts[n - 2] - p[0]) < 0.01 && Math.abs(pts[n - 1] - p[1]) < 0.01) return;
      pts.push(p[0], p[1]);
    }
    add(pointOf(net.lanes[inp.lane], inp.c));
    var stopIdx = [];
    steps.forEach(function (st) {
      var L = net.lanes[st.lane];
      if (!st.box) { add(pointOf(L, st.to)); return; }
      var j = st.box, sp = spanOf(L, j.rect), stop = stopCoord(L, sp[0]);
      add(pointOf(L, stop));
      var si = pts.length / 2 - 1;
      add(pointOf(L, sp[0]));
      if (st.exit === st.lane) add(pointOf(L, sp[1]));
      else {
        var E = net.lanes[st.exit], p0 = pointOf(L, sp[0]), p2 = pointOf(E, spanOf(E, j.rect)[1]);
        var p1 = L.axis === 'y' ? [L.at, E.at] : [E.at, L.at];
        for (var k = 1; k <= TURN_SEGS; k++) {
          var t = k / TURN_SEGS, u = 1 - t;
          add([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
        }
      }
      stopIdx.push({ at: si, exitAt: pts.length / 2 - 1, j: j, lane: st.lane, exit: st.exit });
    });
    var n = pts.length / 2, cum = [0], head = [];
    for (var i = 1; i < n; i++) {
      var dx = pts[2 * i] - pts[2 * i - 2], dy = pts[2 * i + 1] - pts[2 * i - 1];
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
      head.push(Math.atan2(dy, dx));
    }
    stopIdx.forEach(function (x) { stops.push({ s: cum[x.at], exit: cum[x.exitAt], j: x.j, lane: x.lane, to: x.exit }); });
    // Zebra intervals along the polyline (clipped per segment, merged per crossing).
    var zebras = [], clip = G().util.clipSeg;
    (G().map.zebras || []).forEach(function (z) {
      for (var i2 = 0; i2 < n - 1; i2++) {
        var c = clip(pts[2 * i2], pts[2 * i2 + 1], pts[2 * i2 + 2], pts[2 * i2 + 3], z.rect);
        if (!c) continue;
        var len = cum[i2 + 1] - cum[i2], s0 = cum[i2] + c[0] * len, s1 = cum[i2] + c[1] * len;
        var last = zebras.length && zebras[zebras.length - 1];
        if (last && last.id === z.id && Math.abs(last.s1 - s0) < 1) last.s1 = s1;
        else zebras.push({ id: z.id, s0: s0, s1: s1 });
      }
    });
    zebras.sort(function (a, b) { return a.s0 - b.s0; });
    var lastL = net.lanes[steps[steps.length - 1].lane];
    return { key: key, lane: inp.lane, prob: prob, pts: pts, cum: cum, head: head, len: cum[n - 1], stops: stops, zebras: zebras,
      out: dirOf(lastL), end: [pts[2 * n - 2], pts[2 * n - 1]] };
  }

  /** Every in-portal's routes with their probabilities (a depth-first walk over the junction choices). */
  function walk(inp, lane, c, steps, prob, key) {
    var L = net.lanes[lane], best = null, bestEnter = Infinity;
    net.junctions.forEach(function (j) {
      if (!crosses(L, j.rect) || !j.exits[lane]) return;
      var sp = spanOf(L, j.rect);
      if (sp[0] >= c - 1 && sp[0] < bestEnter) { bestEnter = sp[0]; best = j; }
    });
    if (!best) {
      var out = net.outs[lane];
      if (!out) throw new Error('SR.world.traffic: lane "' + lane + '" leads to no out portal');
      var route = buildRoute(inp, steps.concat([{ lane: lane, to: out.c }]), prob, key);
      net.routes.push(route);
      net.byIn[inp.lane].push(route);
      return;
    }
    var odds = exitOdds(best, lane);
    best.exits[lane].forEach(function (e, i) {
      var E = net.lanes[e];
      walk(inp, e, spanOf(E, best.rect)[1], steps.concat([{ lane: lane, box: best, exit: e }]), prob * odds[i], key + '|' + best.id + ':' + e);
    });
  }

  function buildNet() {
    var g = G(), map = g.map;
    net = { lanes: {}, ins: [], outs: {}, junctions: [], byId: {}, routes: [], byIn: {} };
    Object.keys(g.lanes).forEach(function (id) {
      var l = g.lanes[id];
      net.lanes[id] = { id: id, axis: l.axis, dir: l.dir, at: l.at, street: l.street, rect: l.rect };
    });
    (map.junctions || []).forEach(function (j) {
      var x = { id: j.id, rect: j.rect, through: j.through, exits: j.exits || {}, holder: null, req: [] };
      net.junctions.push(x);
      net.byId[j.id] = x;
    });
    (map.portals || []).forEach(function (p) {
      var L = net.lanes[p.lane];
      if (!L) return;
      var c = coordOf(L, p.at[0], p.at[1]);
      if (p.end === 'in') net.ins.push({ lane: p.lane, c: c, at: p.at.slice() });
      else net.outs[p.lane] = { c: c, at: p.at.slice() };
    });
    net.ins.forEach(function (inp) { net.byIn[inp.lane] = []; walk(inp, inp.lane, inp.c, [], 1, inp.lane); });
    return net;
  }

  // ------------------------------------------------------------------------------------------------
  // Route geometry
  // ------------------------------------------------------------------------------------------------
  /** Moves a car's ground point and heading to its route position (the cached segment moves forward). */
  function place(c) {
    var rt = c.route, cum = rt.cum, pts = rt.pts, s = c.s, i = c.seg;
    if (i > cum.length - 2 || s < cum[i]) i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    c.seg = i;
    var len = cum[i + 1] - cum[i], k = len > 0 ? (s - cum[i]) / len : 0;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    c.gx = pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * k;
    c.gy = pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * k;
    c.a = rt.head[i];
  }

  /**
   * The route position within [s0, s1] whose point lies within `half` u of (x, y) (its nearest
   * approach), or -1: how far along the route an obstacle stands.
   */
  function project(rt, s0, s1, x, y, half) {
    var cum = rt.cum, pts = rt.pts, n = cum.length, best = -1, bd = half;
    for (var i = 0; i < n - 1; i++) {
      if (cum[i + 1] < s0) continue;
      if (cum[i] > s1) break;
      var ax = pts[2 * i], ay = pts[2 * i + 1], dx = pts[2 * i + 2] - ax, dy = pts[2 * i + 3] - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var qx = ax + dx * t - x, qy = ay + dy * t - y, d = Math.sqrt(qx * qx + qy * qy);
      if (d < bd) {
        var s = cum[i] + t * (cum[i + 1] - cum[i]);
        if (s >= s0 && s <= s1) { bd = d; best = s; }
      }
    }
    return best;
  }

  /** Oriented-box overlap (separating axes) of two cars: centres, headings, lengths and widths. */
  function boxesOverlap(ax, ay, aa, aL, aW, bx, by, ba, bL, bW) {
    var axes = [aa, aa + Math.PI / 2, ba, ba + Math.PI / 2];
    for (var i = 0; i < 4; i++) {
      var ux = Math.cos(axes[i]), uy = Math.sin(axes[i]);
      var ra = Math.abs(Math.cos(aa) * ux + Math.sin(aa) * uy) * aL / 2 + Math.abs(-Math.sin(aa) * ux + Math.cos(aa) * uy) * aW / 2;
      var rb = Math.abs(Math.cos(ba) * ux + Math.sin(ba) * uy) * bL / 2 + Math.abs(-Math.sin(ba) * ux + Math.cos(ba) * uy) * bW / 2;
      if (Math.abs((bx - ax) * ux + (by - ay) * uy) > ra + rb) return false;
    }
    return true;
  }

  /** Does a circle overlap a car's box? */
  function circleHits(c, x, y, r) {
    var ca = Math.cos(c.a), sa = Math.sin(c.a), dx = x - c.gx, dy = y - c.gy;
    var lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    var qx = lx < -c.half ? -c.half : lx > c.half ? c.half : lx, hw = c.w / 2, qy = ly < -hw ? -hw : ly > hw ? hw : ly;
    return (lx - qx) * (lx - qx) + (ly - qy) * (ly - qy) < r * r;
  }

  // ------------------------------------------------------------------------------------------------
  // Conditions of the moment: the clock, the weather, karma and decrees
  // ------------------------------------------------------------------------------------------------
  /** @returns {number} the clock minute (the render view's override without a game). */
  function clockMin() {
    var s = SR.state;
    if (s && s.clock) return s.clock.min % 1440;
    var v = SR.render && SR.render.view;
    return v && typeof v.min === 'number' ? v.min % 1440 : 720;
  }
  /** @returns {string} today's weather ('clear' while the flag is off, GDD §3.12). */
  function weather() {
    var s = SR.state;
    return SR.features && SR.features.weather && s && s.world && s.world.weather ? s.world.weather : 'clear';
  }
  function rainy() { var w = weather(); return w === 'rain' || w === 'storm'; }
  function decree(id) {
    var s = SR.state, d = s && s.election && s.election.decrees;
    return !!(d && d.indexOf(id) >= 0);
  }
  /** Effective braking (u/s²): rain stretches the braking distance (B-22). */
  function brakeNow() { return T().brake / (rainy() ? T().rain.brake : 1); }
  function stopDist(v, b) { return v > 0 ? v * v / (2 * b) : 0; }

  /**
   * B-22 notice: the chance a driver notices the player ahead in its lane.
   * @param {number} karma
   * @returns {number} clamp(0.55 + karma / 250, 0.2, 0.95)
   */
  TR.noticeChance = function (karma) {
    var n = T().notice;
    return Math.max(n.min, Math.min(n.max, n.base + (Number(karma) || 0) / n.karmaDiv));
  };

  // ------------------------------------------------------------------------------------------------
  // Cars: the pool, spawning and removal
  // ------------------------------------------------------------------------------------------------
  var free = [];
  var nextId = 1;
  var timers = {};             // in-lane → seconds to its next spawn
  var RANGE = [0, 0, 0, 0];
  var immuneUntil = 0, crashUntil = 0;
  var needReset = true;

  function sizeOf(kind) {
    var V = SR.art && SR.art.vehicles;
    var s = V && typeof V.size === 'function' ? V.size(kind) : null;
    return s && s.L ? s : DEF_SIZE;
  }

  /** Recomputes the simulated area: within `simulateRange` screens of the camera. */
  function rangeBox() {
    var cam = W().camera, rv = SR.render && SR.render.view;
    var cx = rv && typeof rv.x === 'number' ? rv.x : cam.x, cy = rv && typeof rv.y === 'number' ? rv.y : cam.y;
    var z = cam.zoom || 1, n = T().simulateRange, hw = n * SR.W / z, hh = n * SR.H / z;
    RANGE[0] = cx - hw; RANGE[1] = cy - hh; RANGE[2] = cx + hw; RANGE[3] = cy + hh;
    return RANGE;
  }
  function inRange(x, y) { return x >= RANGE[0] && x <= RANGE[2] && y >= RANGE[1] && y <= RANGE[3]; }

  /** Seconds to a lane's next spawn: rand(3..6) by day, rand(8..14) at night (B-22). */
  function interval() {
    var si = T().spawnInterval, m = clockMin(), r = m >= si.dayFrom && m < si.dayTo ? si.day : si.night;
    return rng().int(r[0], r[1]);
  }

  /**
   * Is a route free around s (a car's length plus the gap either way): no traffic car, none of the
   * player's cars (parked or driven) and not the player on foot, so no car ever lands on them?
   */
  function clearAt(rt, s, len) {
    var span = len + T().gap + 60;
    for (var i = 0; i < TR.cars.length; i++) {
      var c = TR.cars[i];
      if (c.phase === 'tumble') continue;
      if (project(rt, s - span, s + span, c.gx, c.gy, 50) >= 0) return false;
    }
    for (var k = 0; k < PCARS.length; k += PSTRIDE) if (project(rt, s - span, s + span, PCARS[k], PCARS[k + 1], 52) >= 0) return false;
    var P = W().player;
    if (SR.state && P && !P.car && typeof P.x === 'number' && project(rt, s - span, s + span, P.x, P.y, 26 + wcfg().playerRadius) >= 0) return false;
    return true;
  }

  /** The first point of a route inside the simulated area, clear of junction boxes (-1: none). */
  function entryS(rt, len) {
    for (var s = len; s < rt.len - len; s += ENTRY_STEP) {
      var inBox = false;
      for (var k = 0; k < rt.stops.length; k++) {
        var st = rt.stops[k];
        if (s > st.s - len - 24 && s < st.exit + len) { inBox = true; break; }
      }
      if (inBox) continue;
      var p = pointAt(rt, s);
      if (inRange(p[0], p[1])) return s;
    }
    return -1;
  }
  var PT = [0, 0];
  function pointAt(rt, s) {
    var cum = rt.cum, i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    var len = cum[i + 1] - cum[i], k = len > 0 ? Math.min(1, Math.max(0, (s - cum[i]) / len)) : 0;
    PT[0] = rt.pts[2 * i] + (rt.pts[2 * i + 2] - rt.pts[2 * i]) * k;
    PT[1] = rt.pts[2 * i + 1] + (rt.pts[2 * i + 3] - rt.pts[2 * i + 1]) * k;
    return PT;
  }

  function pickKind() {
    var r = rng().float() * 100, acc = 0;
    for (var i = 0; i < KINDS.length; i++) { acc += KINDS[i][1]; if (r < acc) return KINDS[i][0]; }
    return KINDS[0][0];
  }

  /**
   * Creates a car on a route (the spawner's and the tests' way in).
   * @param {object} rt a route of TR.routes()
   * @param {{s: number, v: number, kind: string, drop: boolean, cruise: number}=} o
   * @returns {object} the car
   */
  function addCar(rt, o) {
    o = o || {};
    var kind = o.kind || 'sedan', sz = sizeOf(kind), c = free.pop() || {};
    c.id = nextId++; c.kind = kind; c.route = rt; c.lane = rt.lane; c.seg = 0;
    c.len = sz.L; c.w = sz.W; c.half = sz.L / 2;
    c.s = o.s !== undefined ? o.s : c.half + DROP_IN;
    c.cruise = o.cruise !== undefined ? o.cruise : T().cruise[1];
    c.vTarget = c.cruise;
    c.v = o.v !== undefined ? o.v : o.drop ? 0 : c.cruise;
    c.phase = c.state = o.drop ? 'drop' : 'drive';
    c.z = o.drop ? DROP_Z : 0; c.vz = 0;
    c.lock = null; c.lockExit = 0; c.stop = 0; c.req = null; c.reqSince = 0;
    c.noticed = null; c.forget = 0; c.honkT = 0; c.hit = false; c.hold = 0; c.still = 0; c.t = 0; c.why = null; c.skid = null;
    c.spin = (c.id % 2 ? 1 : -1) * TUMBLE_SPIN; c.visible = true; c.active = true; c.braking = false;
    place(c);
    while (c.stop < rt.stops.length && c.s - c.half > rt.stops[c.stop].exit) c.stop++;
    c.x = c.px = c.gx; c.y = c.py = c.gy - 0.5 * c.z;
    TR.cars.push(c);
    TR.stats.spawned++;
    return c;
  }

  /** One spawn at a lane's road end (or where its routes enter the simulated area). @returns {boolean} done (false: retry soon) */
  /** A route from an in-lane, drawn by its junction odds (one draw). */
  function pickRoute(lane) {
    var list = net.byIn[lane], r = rng().float(), acc = 0;
    for (var i = 0; i < list.length; i++) { acc += list[i].prob; if (r < acc) return list[i]; }
    return list[list.length - 1];
  }

  function trySpawn(inp) {
    if (TR.cars.length >= T().maxCars) return true;
    var rt = pickRoute(inp.lane);
    var kind = pickKind(), cr = T().cruise, cruise = rng().int(cr[0], cr[1]), sz = sizeOf(kind);
    var drop = inRange(rt.pts[0], rt.pts[1]);
    var s = drop ? sz.L / 2 + DROP_IN : entryS(rt, sz.L);
    if (s < 0) return true;                        // none of this route comes near the camera
    if (!clearAt(rt, s, sz.L)) { TR.stats.blocked++; return false; }
    addCar(rt, { s: s, kind: kind, cruise: cruise, drop: drop, v: drop ? 0 : cruise });
    return true;
  }

  function releaseLock(c) {
    if (!c.lock) return;
    var j = net.byId[c.lock];
    if (j && j.holder === c.id) j.holder = null;
    c.lock = null;
  }

  function remove(i, why) {
    var c = TR.cars[i];
    releaseLock(c);
    TR.cars.splice(i, 1);
    c.route = null; c.skid = null;
    free.push(c);
    TR.stats[why]++;
  }

  /** Removes every car and starts the lane timers afresh (a new game, a new day). */
  TR.reset = function () {
    if (!net) buildNet();
    while (TR.cars.length) remove(TR.cars.length - 1, 'despawned');
    net.junctions.forEach(function (j) { j.holder = null; j.req.length = 0; });
    net.ins.forEach(function (inp) { timers[inp.lane] = interval(); });
    immuneUntil = 0; crashUntil = 0;
    TR.skids.length = 0;
    for (var z in waited) waited[z] = false;
    needReset = false;
  };

  /** Removes every car and zeroes the counters (tests). */
  TR.clear = function () {
    TR.reset();
    Object.keys(TR.stats).forEach(function (k) { TR.stats[k] = 0; });
    TR.last = null;
  };

  // ------------------------------------------------------------------------------------------------
  // Zebras
  // ------------------------------------------------------------------------------------------------
  var occ = {};                // zebra id → someone is on it (or has committed to cross)
  var WALKER_KINDS = ['ped', 'person', 'police'];
  function onZebraRect(x, y) {
    var z = G().map.zebras || [];
    for (var i = 0; i < z.length; i++) {
      var r = z[i].rect;
      if (x >= r[0] - ZEBRA_EDGE && x <= r[2] + ZEBRA_EDGE && y >= r[1] - ZEBRA_EDGE && y <= r[3] + ZEBRA_EDGE) return z[i].id;
    }
    return null;
  }
  var waited = {};             // zebra id → a car was held up by someone on it
  var freedAt = {};            // zebra id → when it was last left empty
  function occupancy(now) {
    for (var k in occ) {
      var was = occ[k];
      occ[k] = false;
      if (was) freedAt[k] = now;
    }
    for (var w = 0; w < WALKER_KINDS.length; w++) {
      var list = W().entities(WALKER_KINDS[w]);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e || e.active === false || e.visible === false || typeof e.x !== 'number') continue;
        // The crowd says who is crossing (a walker waiting at the kerb is not on the zebra); other
        // walkers (street people, officers) count where they stand.
        if (e.zebra !== undefined) { if (e.zebra) occ[e.zebra] = true; continue; }
        var id = onZebraRect(e.x, e.y);
        if (id) occ[id] = true;
      }
    }
    var P = W().player;
    if (SR.state && P && !P.car) { var pid = onZebraRect(P.x, P.y); if (pid) occ[pid] = true; }
    for (var z in occ) if (occ[z]) freedAt[z] = now;
  }

  /**
   * Is a car standing at the stop line right before this zebra, asking for the junction box beyond
   * it? (Its turn lasts until the box is free for it, so a queue on a busy junction is not starved
   * by a stream of walkers.)
   */
  function waitingAtLine(id) {
    for (var i = 0; i < TR.cars.length; i++) {
      var c = TR.cars[i];
      if (c.phase !== 'drive' || c.v > 5 || !c.req) continue;
      var st = c.route.stops[c.stop], front = c.s + c.half;
      if (!st || st.s - LINE_PAD - front > 40) continue;
      var zs = c.route.zebras;
      for (var k = 0; k < zs.length; k++) if (zs[k].id === id && zs[k].s0 >= st.s - 2 && zs[k].s0 <= st.exit) return true;
    }
    return false;
  }

  /** @returns {boolean} someone is on the zebra (or committed to cross it). */
  TR.occupied = function (id) { return !!occ[id]; };

  /**
   * May a pedestrian step onto a zebra now? No car is on it, and every car heading for it can still
   * stop short of it (a stopped car waits: it never starts while someone is on it).
   * @returns {boolean}
   */
  TR.zebraClear = function (id) {
    var b = brakeNow();
    // Cars and walkers take turns: while a car is held up by this crossing, nobody new joins it,
    // and once it is empty the cars go first for a moment.
    if (waited[id]) {
      var since = W().time - (freedAt[id] || 0);
      if (occ[id] || since < CARS_TURN || (since < CARS_TURN_MAX && waitingAtLine(id))) return false;
      waited[id] = false;
    }
    for (var i = 0; i < TR.cars.length; i++) {
      var c = TR.cars[i];
      if (c.phase !== 'drive') continue;
      var zs = c.route.zebras;
      for (var k = 0; k < zs.length; k++) {
        var z = zs[k];
        if (z.id !== id) continue;
        var front = c.s + c.half, rear = c.s - c.half;
        if (rear < z.s1 + 4 && front > z.s0 - 4) return false;
        // A car that holds a junction box goes through: the zebras on its way out are its own.
        if (c.lock && front <= z.s0 && z.s0 < c.lockExit + ZEBRA_HOLD) return false;
        if (front <= z.s0 && c.v > 5 && z.s0 - front < stopDist(c.v, b) + ZEBRA_PAD) return false;
      }
    }
    return true;
  };

  // ------------------------------------------------------------------------------------------------
  // The step
  // ------------------------------------------------------------------------------------------------
  function sfx(name, x, y, o) {
    var A = SR.audio;
    if (!A || typeof A.sfx !== 'function') return;
    try { A.sfx(name, Object.assign({ x: x, y: y }, o || {})); } catch (e) { /* audio is optional */ }
  }

  /**
   * Is the way through a box free for a car: nobody on the zebras from its stop line to just past
   * the box, and nothing within its length and the gap beyond the exit?
   */
  function roomAfter(c, st) {
    var a = st.exit - 8, b = st.exit + c.len + T().gap + 8, zs = c.route.zebras;
    for (var z = 0; z < zs.length; z++) {
      if (zs[z].s1 >= st.s - 1 && zs[z].s0 <= st.exit + ZEBRA_HOLD && occ[zs[z].id]) { waited[zs[z].id] = true; return false; }
    }
    for (var i = 0; i < TR.cars.length; i++) {
      var o = TR.cars[i];
      if (o === c || o.phase === 'tumble') continue;
      if (project(c.route, a - o.half, b + o.half, o.gx, o.gy, (c.w + o.w) / 2) >= 0) return false;
    }
    var cars = playerCars();
    for (var k = 0; k < cars.length; k += PSTRIDE) if (project(c.route, a - 48, b + 48, cars[k], cars[k + 1], 52) >= 0) return false;
    return true;
  }

  // The player's cars as obstacles: [x, y, v, a, ...] (parked ones and the one being driven: its
  // speed and heading), refilled per step.
  var PCARS = [], PSTRIDE = 4;
  function playerCars() { return PCARS; }
  function collectPlayerCars() {
    PCARS.length = 0;
    var s = SR.state, P = W().player;
    if (!s || !s.player || !s.player.cars) return;
    ['junker', 'sports'].forEach(function (id) {
      var row = s.player.cars[id];
      if (!row || !row.owned || row.towed) return;
      if (P && P.car === id) PCARS.push(P.x, P.y, Math.max(0, P.v || 0), P.a || 0);
      else PCARS.push(row.x, row.y, 0, row.a || 0);
    });
  }

  /** Pass 1: requests for junction boxes, granted first come, first served, with room to leave. */
  function grantLocks(now) {
    var b = brakeNow();
    for (var i = 0; i < TR.cars.length; i++) {
      var c = TR.cars[i];
      if (c.phase !== 'drive') continue;
      var st = c.route.stops[c.stop];
      if (!st || c.lock === st.j.id) { c.req = null; continue; }
      var dist = st.s - LINE_PAD - (c.s + c.half);
      if (dist <= stopDist(c.v, b) + REQUEST_PAD) {
        if (c.req !== st.j.id) { c.req = st.j.id; c.reqSince = now; }
        st.j.req.push(c);
      } else c.req = null;
    }
    for (var k = 0; k < net.junctions.length; k++) {
      var j = net.junctions[k];
      if (!j.holder && j.req.length) {
        j.req.sort(function (p, q) { return p.reqSince - q.reqSince || p.id - q.id; });
        for (var r = 0; r < j.req.length; r++) {
          var cand = j.req[r], cst = cand.route.stops[cand.stop];
          if (roomAfter(cand, cst)) {
            j.holder = cand.id; cand.lock = j.id; cand.lockExit = cst.exit; cand.req = null;
            break;
          }
        }
      }
      j.req.length = 0;
    }
  }

  // The speed a car may have now to stop `d` u ahead (or to follow a leader moving at `lead`).
  function allow(d, b, lead) {
    if (d >= 0) return lead + Math.sqrt(2 * b * d);
    return Math.max(0, lead + d * 4);
  }

  var LIM = { v: 0, why: null, hard: false };
  function cap(v, why, hard) {
    if (v < LIM.v) { LIM.v = v; LIM.why = why; LIM.hard = !!hard; }
  }

  /** Pass 2: each car's allowed speed from what lies on its route ahead. */
  function decide(c, now, dt, env) {
    var t = T(), b = env.brake, front = c.s + c.half, rt = c.route;
    LIM.v = c.cruise * env.fog; LIM.why = null; LIM.hard = false;
    // The stop line of the next junction box, until this car holds it.
    var st = rt.stops[c.stop];
    if (st && c.lock !== st.j.id) {
      var dl = st.s - LINE_PAD - front;
      if (dl < LOOK) cap(allow(dl, b, 0), 'line', true);
    }
    // Zebras with someone on them: stop short (always).
    for (var z = 0; z < rt.zebras.length; z++) {
      var zi = rt.zebras[z];
      if (zi.s0 < front - 0.5 || zi.s0 - front > LOOK) continue;
      if (occ[zi.id]) {
        cap(allow(zi.s0 - LINE_PAD - front, b, 0), 'zebra', true);
        if (zi.s0 - front < stopDist(c.v, b) + 40) waited[zi.id] = true;
      }
    }
    // Cars ahead on this route: keep the gap.
    for (var i = 0; i < TR.cars.length; i++) {
      var o = TR.cars[i];
      if (o === c || o.phase === 'tumble') continue;
      var dx = o.gx - c.gx, dy = o.gy - c.gy;
      if (dx * dx + dy * dy > (LOOK + 120) * (LOOK + 120)) continue;
      var so = project(rt, c.s + 1, front + LOOK + o.half, o.gx, o.gy, (c.w + o.w) / 2 - 2);
      if (so < 0) continue;
      var gap = so - o.half - front, lead = 0;
      if (o.phase === 'drive') { var da = Math.cos(o.a - c.a); lead = da > 0.5 ? o.v * da : 0; }
      cap(allow(gap - t.gap, b, lead), 'car', gap < t.gap * 0.5);
    }
    // The player's cars: parked ones and the one being driven.
    for (var k = 0; k < PCARS.length; k += PSTRIDE) {
      var sp = project(rt, c.s + 1, front + LOOK + 48, PCARS[k], PCARS[k + 1], c.w / 2 + 26);
      if (sp < 0) continue;
      // Follow your car only as far as it drives away along this lane: crossing or oncoming, it is
      // a standing obstacle (braked for), not a leader.
      var pa = Math.cos(PCARS[k + 3] - c.a), plead = pa > 0.5 ? PCARS[k + 2] * pa : 0;
      cap(allow(sp - 48 - front - PLAYER_CAR_GAP, b, plead), 'playerCar', false);
    }
    // Walkers in the lane (never hit): stop for them.
    for (var w = 0; w < WALKER_KINDS.length; w++) {
      var list = W().entities(WALKER_KINDS[w]);
      for (var m = 0; m < list.length; m++) {
        var e = list[m];
        if (!e || e.active === false || e.visible === false || typeof e.x !== 'number') continue;
        var ex = e.x - c.gx, ey = e.y - c.gy;
        if (ex * ex + ey * ey > (LOOK + 60) * (LOOK + 60)) continue;
        var se = project(rt, c.s, front + LOOK, e.x, e.y, c.w / 2 + 10);
        if (se >= 0) cap(allow(se - 10 - PERSON_GAP - front, b, 0), 'walker', true);
      }
    }
    // The player on foot: noticed (a roll per encounter), always on a zebra, knocked down or under
    // Pedestrian Supremacy; a driver who did not notice drives on (and hits).
    if (env.player) {
      var P = env.player, r = env.pr;
      var sP = c.hit ? -1 : project(rt, c.s, front + t.notice.range + r, P.x, P.y, c.w / 2 + r);
      if (sP >= 0) {
        c.forget = 0;
        var always = env.onZebra || env.immune || env.supremacy;
        if (!always && c.noticed === null) {
          c.noticed = rng().float() < env.chance;
          if (c.noticed) TR.stats.noticed++; else TR.stats.missed++;
        }
        if (always || c.noticed) {
          cap(allow(sP - r - PERSON_GAP - front, b, 0), 'player', always);
          if (c.honkT <= 0 && c.v > 20) { c.honkT = HONK_SEC; sfx('horn', c.gx, c.gy); }
        }
      } else if (c.noticed !== null) {
        c.forget += dt;
        if (c.forget > FORGET_SEC) { c.noticed = null; c.forget = 0; }
      }
    }
    return LIM;
  }

  /** The player's car and a traffic car overlap: -5 HP (world.carCrash) and both bounce. */
  function crash(c, P, now) {
    crashUntil = now + CRASH_SEC;
    TR.stats.crashes++;
    var nx = P.x - c.gx, ny = P.y - c.gy, l = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= l; ny /= l;
    var cfg = wcfg(), moved = W().collide.move({ x: P.x, y: P.y, r: cfg.carRadius, len: cfg.carLength, a: P.a, safeEdges: W().safeEdges() }, nx * CRASH_PUSH, ny * CRASH_PUSH);
    if (!moved.offGround) { P.x = moved.x; P.y = moved.y; }
    P.v = -(P.v || 0) * 0.35;
    var ahead = nx * Math.cos(c.a) + ny * Math.sin(c.a) > 0;
    c.s = Math.max(c.half, c.s + (ahead ? -10 : 10));
    c.v = 0; c.hold = 0.6;
    place(c);
    sfx('crash', c.gx, c.gy);
    var res = SR.state && typeof SR.act === 'function' && SR.reg.action['world.carCrash'] ? SR.act('world.carCrash') : null;
    TR.last = { kind: 'crash', t: now, x: c.gx, y: c.gy, car: c.id, result: res };
  }

  /** A driver who did not notice the player: -10 HP and the 1.14 s knockdown (world.carHit). */
  function hit(c, P, now) {
    c.hit = true;
    TR.stats.hits++;
    var knock = wcfg().knockdown;
    immuneUntil = now + knock + IMMUNE_SEC;
    if (typeof P.knock === 'function') P.knock(knock);
    sfx('car_hit', P.x, P.y);
    var res = SR.state && typeof SR.act === 'function' && SR.reg.action['world.carHit'] ? SR.act('world.carHit') : null;
    TR.last = { kind: 'hit', t: now, x: P.x, y: P.y, car: c.id, result: res };
  }

  var ENV = { brake: 0, fog: 1, player: null, pr: 14, onZebra: false, immune: false, supremacy: false, chance: 0.55 };

  /**
   * Skid marks: a car braking harder than its normal braking from SKID_V or faster lays one down
   * behind it and draws it out while the emergency stop lasts; marks fade over SKID_SEC.
   */
  function skidStep(c, v0, dt) {
    var hard = v0 >= SKID_V && v0 - c.v > ENV.brake * 1.2 * dt;
    if (!hard && c.skid && v0 > 1 && v0 - c.v > ENV.brake * 0.5 * dt) hard = true;   // keep drawing it out
    if (!hard) { c.skid = null; return; }
    var m = c.skid;
    if (!m) {
      if (TR.skids.length >= SKID_MAX) TR.skids.shift();
      m = c.skid = { kind: c.kind, a: c.a, x: c.gx, y: c.gy, len: 0, alpha: 1, t: 0 };
      TR.skids.push(m);
      sfx('brake', c.gx, c.gy);
    }
    m.a = c.a; m.x = c.gx; m.y = c.gy; m.t = 0; m.alpha = 1;
    m.len = Math.min(SKID_LEN, m.len + v0 * dt);
  }
  function fadeSkids(dt) {
    for (var i = TR.skids.length - 1; i >= 0; i--) {
      var m = TR.skids[i];
      m.t += dt;
      m.alpha = Math.max(0, 1 - m.t / SKID_SEC);
      if (m.t >= SKID_SEC) TR.skids.splice(i, 1);
    }
  }

  /**
   * One fixed step of traffic (called by SR.world.update while the city runs).
   * @param {number} dt seconds
   */
  TR.update = function (dt) {
    if (!TR.live || !G().built) return;
    if (!net) buildNet();
    if (needReset) TR.reset();
    var now = W().time, t = T(), i, c;
    rangeBox();
    collectPlayerCars();
    // Spawns per in-lane.
    for (i = 0; TR.spawning && i < net.ins.length; i++) {
      var inp = net.ins[i];
      timers[inp.lane] -= dt;
      if (timers[inp.lane] <= 0) timers[inp.lane] = trySpawn(inp) ? interval() : RETRY_SEC;
    }
    occupancy(now);
    // The conditions of this step.
    var s = SR.state, P = W().player, F = W().fall;
    ENV.brake = brakeNow();
    ENV.fog = weather() === 'fog' ? t.fog.speed : 1;
    ENV.player = s && P && !P.car && !(F && F.active && F.active()) ? P : null;
    ENV.pr = wcfg().playerRadius;
    ENV.onZebra = !!(ENV.player && onZebraRect(P.x, P.y));
    ENV.immune = !!(ENV.player && (P.knockdown > 0 || now < immuneUntil));
    ENV.supremacy = decree('pedestrianSupremacy');
    ENV.chance = TR.noticeChance(s && s.stats ? s.stats.karma : 0);
    grantLocks(now);
    for (i = 0; i < TR.cars.length; i++) {
      c = TR.cars[i];
      c.px = c.x; c.py = c.y;
      if (c.honkT > 0) c.honkT -= dt;
    }
    fadeSkids(dt);
    // Speeds, then motion.
    for (i = TR.cars.length - 1; i >= 0; i--) {
      c = TR.cars[i];
      c.t += dt;
      if (c.phase === 'drop') {
        c.vz -= GRAVITY * dt; c.z += c.vz * dt;
        if (c.z <= 0) {
          c.z = 0;
          if (c.vz < -BOUNCE_MIN) c.vz = -c.vz * BOUNCE; else { c.vz = 0; c.phase = c.state = 'drive'; }
        }
        c.x = c.gx; c.y = c.gy - 0.5 * c.z;
        continue;
      }
      if (c.phase === 'tumble') {
        c.v *= 1 - TUMBLE_DRAG * dt;
        c.gx += c.out[0] * c.v * dt; c.gy += c.out[1] * c.v * dt;
        c.vz -= GRAVITY * dt; c.z += c.vz * dt;
        c.a += c.spin * dt;
        c.x = c.gx; c.y = c.gy - 0.5 * c.z;
        // Off the north edge the car drops behind the sheet: hidden once it sinks below the rim.
        if (c.out[1] < 0 && c.y > c.edge) c.visible = false;
        if (c.t >= TUMBLE_SEC) remove(i, 'exited');
        continue;
      }
      var lim = decide(c, now, dt, ENV);
      var target = lim.v, hard = lim.hard;
      if (c.hold > 0) { c.hold -= dt; target = 0; }
      c.vTarget = target; c.why = lim.why;
      var v0 = c.v;
      if (c.v < target) c.v = Math.min(target, c.v + ACCEL * dt);
      else {
        c.v = Math.max(target, c.v - (hard ? ENV.brake * EMERGENCY : ENV.brake) * dt);
        if (hard && target <= 0.5 && lim.why !== 'car') c.v = Math.min(c.v, target);
      }
      c.braking = c.v > 1 && target < c.v - 0.5;
      c.s += c.v * dt;
      c.still = c.v < 1 ? c.still + dt : 0;
      if (c.s >= c.route.len - c.half) {
        // The road end: over the rim into the clouds (GDD §3.1).
        releaseLock(c);
        c.phase = c.state = 'tumble'; c.t = 0; c.out = c.route.out; c.vz = 0; c.z = 0; c.skid = null;
        c.edge = c.route.end[1];
        c.v = Math.max(c.v, t.cruise[0] * 0.6);
        sfx('fall_whistle', c.gx, c.gy, { pitch: 1.4, gain: 0.35 });
        continue;
      }
      place(c);
      c.x = c.gx; c.y = c.gy;
      skidStep(c, v0, dt);
      if (c.lock && c.s - c.half > c.lockExit) releaseLock(c);
      while (c.stop < c.route.stops.length && c.s - c.half > c.route.stops[c.stop].exit) c.stop++;
    }
    // The player: hits on foot, crashes in the car.
    if (s && P) {
      if (ENV.player && !ENV.immune && !ENV.onZebra) {
        for (i = 0; i < TR.cars.length; i++) {
          c = TR.cars[i];
          if (c.phase !== 'drive' || c.hit || c.v < HIT_MIN_V) continue;
          if (circleHits(c, P.x, P.y, ENV.pr)) { hit(c, P, now); break; }
        }
      } else if (P.car && now >= crashUntil && !(F && F.active && F.active())) {
        var cfg = wcfg();
        for (i = 0; i < TR.cars.length; i++) {
          c = TR.cars[i];
          if (c.phase !== 'drive') continue;
          if (Math.abs(c.gx - P.x) > 160 || Math.abs(c.gy - P.y) > 160) continue;
          if (boxesOverlap(c.gx, c.gy, c.a, c.len, c.w, P.x, P.y, P.a, cfg.carLength, cfg.carRadius * 2)) { crash(c, P, now); break; }
        }
      }
    }
    // Out of range: despawn (never mid-drop or mid-tumble).
    for (i = TR.cars.length - 1; i >= 0; i--) {
      c = TR.cars[i];
      if (c.phase === 'drive' && !inRange(c.gx, c.gy)) remove(i, 'despawned');
    }
  };

  // ------------------------------------------------------------------------------------------------
  // Queries (the city, tests)
  // ------------------------------------------------------------------------------------------------
  /** @returns {object[]} every route (built on first use): { key, lane, prob, pts, cum, len, stops, zebras }. */
  TR.routes = function () { if (!net) buildNet(); return net.routes; };
  /** @returns {object} the lane network (lanes, in / out portals, junctions with their holders). */
  TR.net = function () { if (!net) buildNet(); return net; };
  /** Places a car on a route (tests): see addCar's options. */
  TR.add = function (routeKey, o) {
    if (!net) buildNet();
    var rt = null;
    for (var i = 0; i < net.routes.length; i++) if (net.routes[i].key === routeKey) rt = net.routes[i];
    if (!rt) throw new Error('SR.world.traffic.add: no route "' + routeKey + '"');
    needReset = false;
    return addCar(rt, o);
  };
  /** @returns {object} a route from an in-lane drawn as a spawn draws it (tests check the junction odds). */
  TR.pick = function (lane) { if (!net) buildNet(); return pickRoute(lane); };
  /** @returns {number[]} the simulated area [x0, y0, x1, y1] of the last step. */
  TR.range = function () { return RANGE.slice(); };
  /** @returns {number} 0..1: how busy the streets near the camera are (the city bed's level). */
  TR.density = function () {
    var cam = W().camera, n = 0;
    for (var i = 0; i < TR.cars.length; i++) {
      var c = TR.cars[i];
      if (Math.abs(c.gx - cam.x) < AMBIENT_R && Math.abs(c.gy - cam.y) < AMBIENT_R) n++;
    }
    return Math.min(1, n / AMBIENT_FULL);
  };
  /** @returns {object} a car's route position and state (tests). */
  TR.probe = function (c) {
    var st = c.route && c.route.stops[c.stop];
    return { id: c.id, s: c.s, v: c.v, phase: c.phase, lock: c.lock, why: c.why, still: c.still, route: c.route ? c.route.key : null,
      stop: st ? { j: st.j.id, s: st.s, exit: st.exit, holder: st.j.holder, room: roomAfter(c, st) } : null, req: c.req };
  };
  /** Does a circle (a walker, the player) touch a car's box? (the hit test, for tests) */
  TR.touches = function (c, x, y, r) { return circleHits(c, x, y, r); };
  /** Oriented-box overlap of two cars (tests use the same test the crash does). */
  TR.overlap = function (a, b) { return boxesOverlap(a.gx, a.gy, a.a, a.len, a.w, b.gx, b.gy, b.a, b.len, b.w); };
  /** Asks for a fresh start on the next step (a new game, a new day: the world stream was reseeded). */
  TR.invalidate = function () { needReset = true; };

  SR.world.traffic = TR;

  SR.onBoot(30, function () {
    if (!SR.events || typeof SR.events.on !== 'function') return;
    SR.events.on('save:loaded', function () { needReset = true; });
    SR.events.on('day:started', function () { needReset = true; });
  }, { headless: true });
})();
