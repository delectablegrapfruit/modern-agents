// js/world/doors.js — owner: W1-W. SR.world.doors (ARCHITECTURE §8.4, GDD §3.6, B-15 door.*):
// the resolver (a home door opens the home card in Live, Owned or For Sale mode), the triggers
// (96 × 48 u, 24 u outside the door; walking enters after 0.2 s of dwell counted only while the
// move input points within 45° of the way in, or while a click-to-walk route ends inside), the
// re-arm rule (after exiting or cancelling, a trigger waits until you are more than 64 u from it),
// the prompt ("[E] Enter McSticks" within 96 u, a plain name tag from 96 to 160 u), Interact,
// and "Park and enter" within 64 u of a door's kerb (or by driving into its trigger, moving within
// 45° of the way in, so driving along a sidewalk past a door never enters it). Node-safe.
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
  // Per-step output without garbage (ARCHITECTURE §17): the tags array is reused, a door's tag
  // object and the prompt object stay the same while they describe the same door.
  var TAGS = [], tagObjs = {}, promptObj = null, tiersCache = {};
  var DEAD = 0.2;      // a move input longer than this counts (the pad's dead zone, CONTRACT §12.1)
  var NOSE_IN = 8;     // a car's "nose" point sits 8 u inside its bumper (entering a trigger by car)
  D.tags = TAGS;

  /** Forgets prompts, dwell, disarmed triggers and the entry log (a new game, a test). */
  D.reset = function () {
    D.prompt = null; D.tags = TAGS; TAGS.length = 0; D.last = null; D.entered = [];
    disarmed = {}; dwell = {}; clock = 0;
    tiersCache = {}; promptObj = null; tagObjs = {};
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

  /** The tag key of a door (a home door: door.live / door.owned / door.forSale; others null), allocation-free. */
  function tagKey(d, s) {
    if (!d.homes) return null;
    var tiers = tiersCache[d.id] || (tiersCache[d.id] = D.doorHomes(d.id) || []);
    var h = s && s.homes;
    if (!tiers.length || !h) return 'door.forSale';
    if (h.living && tiers.indexOf(h.living) >= 0) return 'door.live';
    var owned = h.owned || [];
    for (var i = 0; i < owned.length; i++) if (tiers.indexOf(owned[i]) >= 0) return 'door.owned';
    return 'door.forSale';
  }

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
    var r = cfg().rearm + cfg().doorW / 2;   // the re-arm distance plus half a trigger: anything touching it
    G().doors.forEach(function (d) { if (Math.hypot(d.tc[0] - x, d.tc[1] - y) <= r) D.disarm(d.id); });
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

  /**
   * The heading (radians, 0 = east) a car parked at a kerb takes: along the drivable strip the kerb
   * lies on (a street, path or plaza, its long side), the way closer to `a`.
   */
  D.kerbHeading = function (d, a) {
    var g = G(), k = d.kerb || [d.exit.x, d.exit.y], rect = null;
    (g.map.streets || []).forEach(function (s) {
      if (!rect && s.kind !== 'sidewalk' && g.util.inRect(k[0], k[1], s.rect)) rect = s.rect;
    });
    var along = rect ? (rect[2] - rect[0] >= rect[3] - rect[1] ? 0 : Math.PI / 2) : (d.face === 'E' || d.face === 'W' ? Math.PI / 2 : 0);
    return Math.cos((a || 0) - along) >= 0 ? along : along - Math.PI;
  };

  /** Parks the car at the door's kerb, aligned with the street, and enters on foot. */
  D.parkAndEnter = function (doorId) {
    var d = G().doorById[doorId], p = P();
    if (!d || !p.car) return null;
    var k = d.kerb || [d.exit.x, d.exit.y];
    // Align with the kerb: along the street, the way closer to the car's heading.
    var a = D.kerbHeading(d, p.a);
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

  /** The prompt object for a door (the same object while it names the same door and kind). */
  function promptFor(kind, d, dist) {
    if (!promptObj || promptObj.kind !== kind || promptObj.door !== d.id) {
      promptObj = { kind: kind, door: d.id, name: d.name, verb: kind === 'park' ? 'door.park' : 'door.enter', dist: dist };
    }
    promptObj.dist = dist;
    return promptObj;
  }

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
    D.tags = TAGS;
    TAGS.length = 0;
    if (p.car) {
      var bestK = null, bk = c.parkRange;
      for (i = 0; i < g.doors.length; i++) {
        d = g.doors[i];
        if (!d.kerb) continue;
        var dk = Math.hypot(p.x - d.kerb[0], p.y - d.kerb[1]);
        if (dk <= bk) { bk = dk; bestK = d; }
      }
      if (bestK) D.prompt = promptFor('park', bestK, bk);
      // Driving into a trigger parks and enters, like walking in: only while the car moves within
      // the dwell angle of the way in, so driving along a sidewalk past a door never enters it.
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), cosCar = Math.cos(c.dwellAngle * Math.PI / 180);
      if (p.knockdown > 0 || sp < 1) return;
      // The car is in a trigger when its centre or its nose (just inside the bumper) is.
      var nose = Math.max(0, c.carLength / 2 - NOSE_IN) * (p.v < 0 ? -1 : 1);
      var nx = p.x + Math.cos(p.a) * nose, ny = p.y + Math.sin(p.a) * nose;
      for (i = 0; i < g.doors.length; i++) {
        d = g.doors[i];
        if (disarmed[d.id] || (!inTrigger(d, p.x, p.y) && !inTrigger(d, nx, ny))) continue;
        if (-(p.vx * d.out[0] + p.vy * d.out[1]) / sp >= cosCar - 1e-9) { D.parkAndEnter(d.id); return; }
      }
      return;
    }
    var best = null, bd = Infinity;
    for (i = 0; i < g.doors.length; i++) {
      d = g.doors[i];
      var dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist <= c.interact && outside(d, p.x, p.y) && dist < bd) { bd = dist; best = d; }
    }
    if (best) D.prompt = promptFor('enter', best, bd);
    for (i = 0; i < g.doors.length; i++) {
      d = g.doors[i];
      var dt2 = Math.hypot(p.x - d.x, p.y - d.y);
      if (d !== best && dt2 <= c.tag && outside(d, p.x, p.y)) {
        var t = tagObjs[d.id] || (tagObjs[d.id] = { door: d.id, name: d.name, tag: null, dist: 0 });
        t.tag = tagKey(d, SR.state); t.dist = dt2;
        TAGS.push(t);
      }
    }
    // Walking in: dwell counted only while the input points within 45° of the way in, or while a
    // click-to-walk route ends inside this trigger.
    var mag = Math.sqrt(input.x * input.x + input.y * input.y), cosMax = Math.cos(c.dwellAngle * Math.PI / 180);
    if (p.knockdown > 0) mag = 0;   // knocked down: the input moves nothing, so it aims at nothing
    for (i = 0; i < g.doors.length; i++) {
      d = g.doors[i];
      if (!inTrigger(d, p.x, p.y)) { dwell[d.id] = 0; continue; }
      if (disarmed[d.id]) continue;
      var aimed = mag > DEAD && -(input.x * d.out[0] + input.y * d.out[1]) / mag >= cosMax - 1e-9;
      var routed = !!(p.route && inTrigger(d, p.route.to.x, p.route.to.y));
      if (aimed || routed) {
        dwell[d.id] = (dwell[d.id] || 0) + dt;
        if (dwell[d.id] >= c.dwell - 1e-9) { D.enter(d.id, routed && !aimed ? 'route' : 'walk'); return; }
      }
    }
  };

  SR.world.doors = D;
})();
