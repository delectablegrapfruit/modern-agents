// js/world/doors.js — owner: W1-W. SR.world.doors (ARCHITECTURE §8.4, GDD §3.6, B-15 door.*):
// the resolver (a home door opens the home card in Live, Owned or For Sale mode), the triggers
// (96 × 48 u, 24 u outside the door; walking enters after 0.2 s of dwell counted only while the
// move input points within 45° of the way in, or while a click-to-walk route ends inside), the
// re-arm rule (after exiting or cancelling, a trigger waits until you are more than 64 u from it),
// the prompt ("[E] Enter McSticks" within 96 u, a plain name tag from 96 to 160 u), Interact,
// and "Park and enter" within 64 u of a door's kerb (or by driving into its trigger). Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  function cfg() { return SR.world.cfg || (SR.world.cfg = SR.world.readCfg()); }
  function G() { return SR.world.geometry; }
  function P() { return SR.world.player; }

  var D = {
    /** { kind: 'enter' | 'park', door, name, verb, dist } or null. */
    prompt: null,
    /** Doors showing a plain name tag: [{ door, name, tag, dist }]. */
    tags: [],
    /** The last door entered: { id, via: 'walk' | 'route' | 'interact' | 'park', t, resolved }. */
    last: null,
    /** The last 50 doors entered (tests count accidental entries). */
    entered: [],
  };
  var disarmed = {};   // door id -> true while disarmed
  var dwell = {};      // door id -> seconds of qualifying dwell in its trigger
  var clock = 0;

  /** Forgets prompts, dwell, disarmed triggers and the entry log (a new game, a test). */
  D.reset = function () {
    D.prompt = null; D.tags = []; D.last = null; D.entered = [];
    disarmed = {}; dwell = {}; clock = 0;
  };

  // --- the resolver -------------------------------------------------------------------------------
  function homePrice(id) {
    var t = SR.tuning && SR.tuning.homes, row = (t && t[id]) || (SR.reg.home && SR.reg.home[id]);
    return row && typeof row.price === 'number' ? row.price : null;
  }

  /** The tiers behind a home door, cheapest first (SR.rules.homes.doorHomes, else the worldmap's list). */
  D.doorHomes = function (doorId) {
    var tiers = null;
    if (SR.rules.homes && typeof SR.rules.homes.doorHomes === 'function') {
      try { tiers = SR.rules.homes.doorHomes(doorId); } catch (e) { tiers = null; }
    }
    if (!tiers || !tiers.length) {
      var d = G().doorById[doorId];
      tiers = d && d.homes ? d.homes.slice() : null;
    }
    if (!tiers || !tiers.length) return null;
    tiers = tiers.slice();
    var order = tiers.slice();
    tiers.sort(function (a, b) {
      var pa = homePrice(a), pb = homePrice(b);
      return pa !== null && pb !== null && pa !== pb ? pa - pb : order.indexOf(a) - order.indexOf(b);
    });
    return tiers;
  };

  /**
   * What a door opens (ARCHITECTURE §8.4).
   * @param {string} doorId a worldmap door (building) id
   * @param {object} s the state
   * @returns {{scene: string, id: string, params: object}} home doors: id 'home', params { homeId, mode }
   *   with mode 'live' (you live behind it), 'owned' (you own a tier there; the best one) or
   *   'forSale' (the cheapest tier); every other door: id = doorId, params {}
   */
  D.resolve = function (doorId, s) {
    var tiers = D.doorHomes(doorId);
    if (!tiers) return { scene: 'building', id: doorId, params: {} };
    var homes = (s && s.homes) || { owned: [], living: null };
    var owned = (homes.owned || []).filter(function (h) { return tiers.indexOf(h) >= 0; });
    if (homes.living && tiers.indexOf(homes.living) >= 0) return { scene: 'building', id: 'home', params: { homeId: homes.living, mode: 'live' } };
    if (owned.length) {
      var best = owned.sort(function (a, b) { return tiers.indexOf(b) - tiers.indexOf(a); })[0];
      return { scene: 'building', id: 'home', params: { homeId: best, mode: 'owned' } };
    }
    return { scene: 'building', id: 'home', params: { homeId: tiers[0], mode: 'forSale' } };
  };

  /** The tag a door shows (home doors say For Sale / Yours / Home; ART_AUDIO §5.2 reacting signs). */
  D.tagFor = function (doorId, s) {
    var d = G().doorById[doorId];
    if (!d) return null;
    var tag = null;
    if (d.homes) {
      var mode = D.resolve(doorId, s || SR.state).params.mode;
      tag = mode === 'live' ? 'door.live' : mode === 'owned' ? 'door.owned' : 'door.forSale';
    }
    return { door: doorId, name: d.name, tag: tag };
  };

  // --- arming -------------------------------------------------------------------------------------
  /** Disarms one door's trigger until the player is more than 64 u from it. */
  D.disarm = function (id) { disarmed[id] = true; dwell[id] = 0; };
  /** @returns {boolean} the door's trigger is armed */
  D.armed = function (id) { return !disarmed[id]; };
  /** Disarms every trigger within the re-arm distance of (x, y) (placing, exiting). */
  D.disarmNear = function (x, y) {
    var r = cfg().rearm;
    G().doors.forEach(function (d) { if (Math.hypot(d.tc[0] - x, d.tc[1] - y) <= r + 48) D.disarm(d.id); });
  };

  // --- entering and leaving -----------------------------------------------------------------------
  /**
   * The scene change for a resolved door. Tests replace it; the default goes to the building
   * scene (with the door zoom) once that scene is registered.
   */
  D.go = function (r) {
    if (SR.scenes && typeof SR.scenes.go === 'function' && SR.reg.scene && SR.reg.scene[r.scene]) {
      SR.scenes.go(r.scene, { id: r.id, params: r.params }, { transition: 'doorZoom' });
    }
  };

  /** Enters a door: writes the position to the state, resolves it and changes scene. */
  D.enter = function (doorId, via) {
    var d = G().doorById[doorId];
    if (!d) return null;
    var p = P();
    p.cancelRoute();
    p.vx = p.vy = 0;
    D.disarm(doorId);
    if (SR.world.sync) SR.world.sync();
    var r = D.resolve(doorId, SR.state);
    D.last = { id: doorId, via: via || 'interact', t: clock, resolved: r };
    D.entered.push(D.last);
    if (D.entered.length > 50) D.entered.shift();
    D.go(r);
    return r;
  };

  /** Parks the car at the door's kerb, aligned with the street, and enters on foot. */
  D.parkAndEnter = function (doorId) {
    var d = G().doorById[doorId], p = P();
    if (!d || !p.car) return null;
    var k = d.kerb || [d.exit.x, d.exit.y];
    // Align with the kerb: along the street, the way closer to the car's heading.
    var along = d.face === 'E' || d.face === 'W' ? Math.PI / 2 : 0;
    var a = Math.cos(p.a - along) >= 0 ? along : along - Math.PI;
    p.park(k[0], k[1], a);
    p.x = d.exit.x; p.y = d.exit.y; p.facing = (d.facing + 180) % 360;
    return D.enter(doorId, 'park');
  };

  /**
   * Leaving a building (the city scene calls it): the player stands 56 u outside the door facing
   * away, and the trigger stays disarmed until they are more than 64 u from it.
   * @param {string=} doorId default: the last door entered
   */
  D.exit = function (doorId) {
    doorId = doorId || (D.last && D.last.id);
    var d = G().doorById[doorId];
    if (!d) return null;
    var p = P();
    p.place(d.exit.x, d.exit.y, d.exit.facing);
    D.disarmNear(d.exit.x, d.exit.y);
    D.disarm(doorId);
    if (SR.world.camera) SR.world.camera.snap();
    if (SR.world.sync) SR.world.sync();
    return { x: d.exit.x, y: d.exit.y, facing: d.exit.facing };
  };

  /** Interact (E / A): park and enter while driving near a kerb, else enter the prompted door. */
  D.interact = function () {
    if (!D.prompt) return false;
    if (D.prompt.kind === 'park') return !!D.parkAndEnter(D.prompt.door);
    return !!D.enter(D.prompt.door, 'interact');
  };

  // --- update -------------------------------------------------------------------------------------
  function inTrigger(d, x, y) { return G().util.inRect(x, y, d.trigger); }

  /** @returns {boolean} (x, y) is on the door's outer side (Interact never works through a wall). */
  function outside(d, x, y) { return (x - d.x) * d.out[0] + (y - d.y) * d.out[1] > 0; }

  /**
   * One step: re-arm, the prompt and tags, park-and-enter by driving in, and the walking dwell.
   * @param {number} dt
   * @param {{x: number, y: number}=} input the move axis (default: SR.input's)
   */
  D.update = function (dt, input) {
    input = input || SR.world.readInput();
    clock += dt;
    var c = cfg(), g = G(), p = P(), i, d;
    for (var id in disarmed) {
      d = g.doorById[id];
      if (!d || Math.hypot(p.x - d.tc[0], p.y - d.tc[1]) > c.rearm) delete disarmed[id];
    }
    D.prompt = null;
    D.tags = [];
    if (p.car) {
      var bestK = null, bk = c.parkRange;
      for (i = 0; i < g.doors.length; i++) {
        d = g.doors[i];
        if (!d.kerb) continue;
        var dk = Math.hypot(p.x - d.kerb[0], p.y - d.kerb[1]);
        if (dk <= bk) { bk = dk; bestK = d; }
      }
      if (bestK) D.prompt = { kind: 'park', door: bestK.id, name: bestK.name, verb: 'door.park', dist: bk };
      for (i = 0; i < g.doors.length; i++) {
        d = g.doors[i];
        if (!disarmed[d.id] && inTrigger(d, p.x, p.y)) { D.parkAndEnter(d.id); return; }
      }
      return;
    }
    var best = null, bd = Infinity;
    for (i = 0; i < g.doors.length; i++) {
      d = g.doors[i];
      var dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist <= c.interact && outside(d, p.x, p.y) && dist < bd) { bd = dist; best = d; }
    }
    if (best) D.prompt = { kind: 'enter', door: best.id, name: best.name, verb: 'door.enter', dist: bd };
    for (i = 0; i < g.doors.length; i++) {
      d = g.doors[i];
      var dt2 = Math.hypot(p.x - d.x, p.y - d.y);
      if (d !== best && dt2 <= c.tag && outside(d, p.x, p.y)) {
        var t = D.tagFor(d.id);
        D.tags.push({ door: d.id, name: d.name, tag: t && t.tag, dist: dt2 });
      }
    }
    // Walking in: dwell counted only while the input points within 45° of the way in, or while a
    // click-to-walk route ends inside this trigger.
    var mag = Math.sqrt(input.x * input.x + input.y * input.y), cosMax = Math.cos(c.dwellAngle * Math.PI / 180);
    for (i = 0; i < g.doors.length; i++) {
      d = g.doors[i];
      if (!inTrigger(d, p.x, p.y)) { dwell[d.id] = 0; continue; }
      if (disarmed[d.id]) continue;
      var aimed = mag > 0.2 && -(input.x * d.out[0] + input.y * d.out[1]) / mag >= cosMax - 1e-9;
      var routed = !!(p.route && inTrigger(d, p.route.to.x, p.route.to.y));
      if (aimed || routed) {
        dwell[d.id] = (dwell[d.id] || 0) + dt;
        if (dwell[d.id] >= c.dwell - 1e-9) { D.enter(d.id, routed && !aimed ? 'route' : 'walk'); return; }
      }
    }
  };

  SR.world.doors = D;
})();
