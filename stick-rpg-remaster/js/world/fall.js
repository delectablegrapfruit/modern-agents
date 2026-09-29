// js/world/fall.js — owner: W1-W. SR.world.fall: the teeter and the Fold Rescue (GDD §3.9, B-15
// teeter / fall). When the player's centre leaves the sheet (or drops into the Bus Hole) they
// windmill for 150 ms (300 ms with Assist); reversing the input in that window saves them. Else
// the 1.5 s sequence plays (0.55 s drop, 0.5 s catch, 0.45 s land; any key skips it after 0.5 s),
// the player lands on the nearest nav node at least 64 u inside, and the world asks the rules for
// the cost: SR.act('world.fall', { x, y }) (-10 HP, no time), plus SR.act('world.carFished',
// { car }) when a car sailed off. With Safe edges (or Guard Rails for All) collisions never let
// the player leave the sheet, so none of this happens. Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  function cfg() { return SR.world.cfg || (SR.world.cfg = SR.world.readCfg()); }
  function P() { return SR.world.player; }

  var DEAD = 0.2;       // a move input longer than this counts (the pad's dead zone, CONTRACT §12.1)
  var REVERSE = 0.3;    // "reversing": the input points back onto the sheet, within about 72° of straight in

  var F = {
    /** 'none' | 'teeter' | 'drop' | 'catch' | 'land' */
    phase: 'none',
    /** Seconds in the current phase; seconds since the drop began. */
    t: 0, seq: 0,
    /** Where the player left the ground, the last point on it, the edge's outward normal. */
    x: 0, y: 0, from: null, out: [0, 1],
    /** The landing point (set when the drop starts). */
    to: null,
    /** The car that sailed off, if any. */
    car: null,
    /** This teeter's window (s). */
    grace: 0.15,
    /** The last teeter save ({ t, x, y }: the city shows "Phew!"), and the last completed fall. */
    saved: null, last: null,
    /** Falls completed this session (tests). */
    count: 0,
  };

  /** @returns {boolean} a teeter or the Fold Rescue is playing (player and doors pause) */
  F.active = function () { return F.phase !== 'none'; };

  /** Ends any teeter or fall at once (a new game, placing the player). */
  F.reset = function () {
    F.phase = 'none'; F.t = 0; F.seq = 0; F.to = null; F.car = null; F.from = null;
  };

  /** Starts the teeter: the player (or their car) has just left the ground from `from`. */
  F.teeter = function (from) {
    if (F.active()) return;
    var p = P(), g = SR.world.geometry;
    F.phase = 'teeter'; F.t = 0; F.seq = 0;
    F.x = p.x; F.y = p.y;
    F.from = { x: from.x, y: from.y };
    F.car = p.car || null;
    var e = g.nearestEdge((p.x + from.x) / 2, (p.y + from.y) / 2);
    F.out = e ? [e.nx, e.ny] : [0, 1];
    F.grace = SR.world.assist() ? cfg().teeterAssist : cfg().teeter;
    F.to = null;
    p.vx = p.vy = 0; p.v = 0; p.teeter = F.grace;
    p.cancelRoute();
  };

  /** Any key after 0.5 s of the sequence skips to the landing. */
  F.skip = function () {
    if (F.phase === 'drop' || F.phase === 'catch' || F.phase === 'land') {
      if (F.seq >= cfg().fallSkip - 1e-9) { finish(); return true; }
    }
    return false;
  };

  /** The point the camera holds on: the edge while dropping, then the plane's way to the landing. */
  F.focus = function () {
    if (F.phase === 'land' && F.to) {
      var k = Math.min(1, F.t / cfg().fallLand);
      return { x: F.x + (F.to.x - F.x) * k, y: F.y + (F.to.y - F.y) * k };
    }
    return { x: F.x, y: F.y };
  };

  function landing() {
    var g = SR.world.geometry, p = P();
    return g.nearestSafe(F.x, F.y, cfg().fallInside) || p.lastSafe || F.from;
  }

  function finish() {
    var p = P(), to = F.to || landing(), car = F.car, fx = Math.round(F.x), fy = Math.round(F.y);
    if (p.car) {                        // the car sailed off: you are rescued on foot
      var s = SR.state;
      if (s && s.player) s.player.driving = null;
      p.car = null; p.mode = 'walk';
    }
    p.place(to.x, to.y, p.facing);
    p.teeter = 0;
    F.phase = 'none'; F.t = 0;
    F.count++;
    if (SR.world.doors) SR.world.doors.disarmNear(to.x, to.y);
    var res = null, carRes = null;
    if (typeof SR.act === 'function' && SR.state) {
      res = SR.act('world.fall', { x: fx, y: fy });
      if (car) carRes = SR.act('world.carFished', { car: car });
    }
    F.last = { x: fx, y: fy, to: { x: to.x, y: to.y }, car: car, result: res, carResult: carRes };
    if (SR.world.sync) SR.world.sync();
  }

  /**
   * One step of the teeter or the sequence.
   * @param {number} dt
   * @param {{x: number, y: number}=} input the move axis (default: SR.input's); reversing it during
   *   the teeter saves you
   */
  F.update = function (dt, input) {
    if (F.phase === 'none') return;
    input = input || SR.world.readInput();
    var c = cfg(), p = P();
    F.t += dt;
    if (F.phase === 'teeter') {
      p.teeter = Math.max(0, F.grace - F.t);
      var mag = Math.sqrt(input.x * input.x + input.y * input.y);
      if (mag > DEAD && (input.x * F.out[0] + input.y * F.out[1]) / mag < -REVERSE) {
        p.x = F.from.x; p.y = F.from.y; p.vx = p.vy = 0; p.v = 0; p.teeter = 0;
        F.phase = 'none';
        F.saved = { t: SR.world.time, x: p.x, y: p.y };
        return;
      }
      if (F.t >= F.grace - 1e-9) {
        F.phase = 'drop'; F.t = 0; F.seq = 0;
        F.to = landing();
      }
      return;
    }
    F.seq += dt;
    if (F.phase === 'drop' && F.t >= c.fallDrop - 1e-9) { F.phase = 'catch'; F.t = 0; }
    else if (F.phase === 'catch' && F.t >= c.fallCatch - 1e-9) { F.phase = 'land'; F.t = 0; }
    else if (F.phase === 'land' && F.t >= c.fallLand - 1e-9) finish();
  };

  SR.world.fall = F;
})();
