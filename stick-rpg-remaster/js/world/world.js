// js/world/world.js — owner: W1-W. SR.world: the world's orchestrator (ARCHITECTURE §8.2). Builds
// the geometry and the nav grid at boot (prio 30, headless), reads the world numbers from
// SR.tuning (BALANCE B-15) into SR.world.cfg, starts and places the player from the state
// (spawn points, the home door, a door's exit), writes positions back to state.player once a
// second and on scene changes (never a point in the sky while a fall plays), reads other modules'
// cars and people (SR.world.entities) and runs SR.world.update(dt): step start (px / py for the
// renderer's interpolation, the dynamic hash) → player → fall → doors → traffic → pedestrians →
// street people and police → markers → weather → camera, pausing 1 and 3-8 while a fall plays.
// Node-safe (no DOM at load or in update).
(function () {
  'use strict';
  var SR = window.SR;
  var W = SR.world;

  // Every world number comes from SR.tuning.world (BALANCE B-15), at these paths (a list: the
  // first one present wins; W1-R settled some names late in wave 1).
  var PATHS = {
    walk: 'walk.speed', walkAccel: 'walk.accel',
    skate: 'skate.speed', proDeck: 'skate.proDeck', marathoner: 'skate.marathoner',
    junker: 'junker.speed', junkerAccel: 'junker.accel', junkerTurn: 'junker.turn', reverse: 'junker.reverse',
    sports: 'sports.speed', sportsAccel: 'sports.accel', sportsTurn: 'sports.turn',
    drivePath: 'surfaceDrive.path', driveCap: ['surfaceDrive.cap', 'surfaceDrive.sidewalkCap'], parkRange: ['park.range', 'park.kerbRange'], hop: 'carVsPeople.hop',
    playerRadius: 'playerRadius',
    doorW: 'door.trigger.w', doorH: 'door.trigger.h', doorOffset: ['door.trigger.offset', 'door.trigger.out'], dwell: 'door.dwell', dwellAngle: 'door.angle',
    interact: 'door.interact', prompt: 'door.prompt', tag: 'door.tag', exit: 'door.exit', rearm: 'door.rearm', porchN: 'door.porchN.visible',
    camOmega: 'camera.omega', camDeadW: 'camera.deadZone.0', camDeadH: 'camera.deadZone.1', camLook: ['camera.lookAhead', 'camera.lookAheadSec'],
    camLookMax: 'camera.lookCap', camPad: 'camera.bounds', zoom0: 'camera.zooms.0', zoom1: 'camera.zooms.1', zoom2: 'camera.zooms.2',
    projection: ['projection.k', 'projection.zFactor'], occlusionAlpha: 'occlusionAlpha.alpha', occlusionMs: 'occlusionAlpha.ms',
    edgeWarn: 'edgeWarn.dist', edgeWarnFog: 'edgeWarn.fog', teeterMs: 'teeter',
    fallTotal: ['fall.total', 'fall.totalSec'], fallDrop: 'fall.drop', fallCatch: 'fall.catch', fallLand: 'fall.land', fallSkip: ['fall.skipAfter', 'fall.skippableAfter'],
    fallHp: 'fall.hp', fallHpHardLanding: 'fall.hardLanding', fallInside: 'fall.landInside',
    carHitHp: 'carHit.hp', knockdown: ['carHit.knockdown', 'carHit.knockdownSec'], carCrashHp: 'carCrash.hp',
    navCell: 'navGrid.cell', navMargin: 'navGrid.margin', navReach: 'navGrid.reach', scrapEdgeMin: 'scrapEdgeMin',
    windGust: 'windGust.speed', windGustEdge: 'windGust.range',
  };

  // Numbers the design names but BALANCE B-15 does not carry yet; docs/requests/W1-W.md asks for
  // them in SR.tuning.world (SR.tuning wins as soon as it has them, under these names).
  var LOCAL = {
    skateAccel: 0.25,      // GDD §3.8: skateboard and Pro Deck reach top speed in 0.25 s
    carRange: 64,          // GDD §3.8: C / Y enters or leaves your car within 64 u of it
    carRadius: 26,         // cars are 96 × 52 boxes (GDD §3.8): against the static world a capsule of half the width...
    carLength: 96,         // ...and the car's length along its heading
    driveZoomEase: 0.6,    // GDD §3.7: driving eases the zoom one level out over 0.6 s
    teeterAssistMs: 300,   // UI §8: Assist's longer teeter grace
    navCacheSec: 1,        // ARCHITECTURE §8.2: nav paths are cached for 1 s
  };

  // The B-15 values, used only if a path above is missing from SR.tuning.world (a warning names it).
  var B15 = {
    walk: 280, walkAccel: 0.08, skate: 560, proDeck: 700, marathoner: 1.15,
    junker: 840, junkerAccel: 0.6, junkerTurn: 3.2, reverse: 200, sports: 1400, sportsAccel: 0.9, sportsTurn: 3.8,
    drivePath: 0.6, driveCap: 200, parkRange: 64, hop: 24, playerRadius: 14,
    doorW: 96, doorH: 48, doorOffset: 24, dwell: 0.2, dwellAngle: 45, interact: 96, prompt: 96, tag: 160, exit: 56, rearm: 64, porchN: 32,
    camOmega: 8, camDeadW: 96, camDeadH: 64, camLook: 0.25, camLookMax: 140, camPad: 480, zoom0: 0.8, zoom1: 1, zoom2: 1.25,
    projection: 0.5, occlusionAlpha: 0.35, occlusionMs: 150, edgeWarn: 60, edgeWarnFog: 90, teeterMs: 150,
    fallTotal: 1.5, fallDrop: 0.55, fallCatch: 0.5, fallLand: 0.45, fallSkip: 0.5, fallHp: 10, fallHpHardLanding: 5, fallInside: 64,
    carHitHp: 10, knockdown: 1.14, carCrashHp: 5, navCell: 32, navMargin: 40, navReach: 32, scrapEdgeMin: 64, windGust: 40, windGustEdge: 48,
  };

  function dig(obj, path) {
    var parts = path.split('.'), v = obj;
    for (var i = 0; i < parts.length && v !== undefined && v !== null; i++) v = v[parts[i]];
    return v;
  }

  /** Reads every world number from SR.tuning.world (B-15) into SR.world.cfg (plus LOCAL). */
  function readCfg() {
    var t = SR.tuning && SR.tuning.world, cfg = {}, missing = [];
    Object.keys(PATHS).forEach(function (k) {
      var paths = [].concat(PATHS[k]), v;
      for (var i = 0; i < paths.length; i++) {
        v = dig(t, paths[i]);
        if (typeof v === 'number' && isFinite(v)) break;
      }
      if (typeof v !== 'number' || !isFinite(v)) { v = B15[k]; missing.push(paths[0]); }
      cfg[k] = v;
    });
    Object.keys(LOCAL).forEach(function (k) {
      var v = dig(t, k);
      cfg[k] = typeof v === 'number' && isFinite(v) ? v : LOCAL[k];
    });
    cfg.teeter = cfg.teeterMs / 1000;              // B-15 gives the teeter in ms
    cfg.teeterAssist = cfg.teeterAssistMs / 1000;
    cfg.zooms = [cfg.zoom0, cfg.zoom1, cfg.zoom2];
    cfg.missing = missing;
    if (missing.length && SR.util && SR.util.warnOnce) {
      SR.util.warnOnce('world.cfg', 'SR.world: SR.tuning.world lacks ' + missing.join(', ') + '; using the BALANCE B-15 values');
    }
    return cfg;
  }

  W.ready = false;
  /** Seconds of world simulation (paused while no update runs). */
  W.time = 0;
  /** The world numbers (B-15), read from SR.tuning at boot by build(). */
  W.cfg = null;
  /** The B-15 values (a fallback only if SR.tuning.world loses a key), the local numbers and the tuning paths. */
  W.B15 = B15;
  W.LOCAL = LOCAL;
  W.PATHS = PATHS;
  W.readCfg = readCfg;

  /** Builds the geometry, the nav grid and the camera from the registered worldmap (boot, prio 30). */
  W.build = function () {
    W.cfg = readCfg();
    var cfg = W.cfg;
    W.geometry.build();
    var start = W.spawnPoint('newGame', null);
    W.nav.build({ start: start, cell: cfg.navCell, clearance: cfg.playerRadius, edgeMargin: cfg.navMargin, reach: cfg.navReach, cacheSec: cfg.navCacheSec });
    if (W.doors && W.doors.reset) W.doors.reset();
    if (W.fall && W.fall.reset) W.fall.reset();
    if (W.player && W.player.reset) W.player.reset(start);
    if (W.camera && W.camera.reset) W.camera.reset(start);
    W.ready = true;
    return W;
  };

  // --- settings, decrees and the state ------------------------------------------------------------
  function setting(key) {
    try { return SR.settings && typeof SR.settings.get === 'function' ? SR.settings.get(key) : undefined; } catch (e) { return undefined; }
  }
  W.setting = setting;

  /** @returns {boolean} unrailed edges bounce the player back: Assist › Safe edges or the Guard Rails decree. */
  W.safeEdges = function (s) {
    if (setting('access.safeEdges')) return true;
    s = s || SR.state;
    var d = s && s.election && s.election.decrees;
    return !!(d && (d.indexOf('guard_rails') >= 0 || d.indexOf('guardRails') >= 0));
  };

  /** @returns {boolean} the longer teeter grace applies (Assist, UI §8). */
  W.assist = function () { return !!setting('access.assist'); };

  // --- spawn points and placement -----------------------------------------------------------------
  /** @returns {object|null} the door of the home the player lives in. */
  W.homeDoor = function (s) {
    s = s || SR.state;
    var living = s && s.homes && s.homes.living;
    var doors = W.geometry.doors;
    for (var i = 0; i < doors.length; i++) if (doors[i].homes && doors[i].homes.indexOf(living) >= 0) return doors[i];
    if (living && SR.reg.home && SR.reg.home[living] && SR.reg.home[living].door) return W.geometry.doorById[SR.reg.home[living].door] || null;
    return W.geometry.doorById[(W.geometry.map.spawn || {}).newGame] || null;
  };

  /**
   * A spawn point: a worldmap spawn name ('newGame', 'afterJail', 'afterHospital'), a door id
   * (its exit point, facing away), 'homeDoor', a point [x, y] or { x, y }.
   * @returns {{x: number, y: number, facing: number}}
   */
  W.spawnPoint = function (spec, s) {
    var g = W.geometry, map = g.map || {};
    if (typeof spec === 'string' && map.spawn && Object.prototype.hasOwnProperty.call(map.spawn, spec)) spec = map.spawn[spec];
    if (spec === 'homeDoor') {
      var hd = W.homeDoor(s);
      return hd ? { x: hd.exit.x, y: hd.exit.y, facing: hd.exit.facing } : { x: 998, y: 1096, facing: 180 };
    }
    if (typeof spec === 'string' && g.doorById[spec]) {
      var d = g.doorById[spec];
      return { x: d.exit.x, y: d.exit.y, facing: d.exit.facing };
    }
    if (Array.isArray(spec)) return { x: spec[0], y: spec[1], facing: 180 };
    if (spec && typeof spec.x === 'number') return { x: spec.x, y: spec.y, facing: spec.facing === undefined ? 180 : spec.facing };
    throw new Error('SR.world.spawnPoint: unknown spawn "' + spec + '"');
  };

  /** Places the player (on foot) at a spawn point, disarms the doors around it and snaps the camera. */
  W.place = function (spec, s) {
    var p = W.spawnPoint(spec, s);
    W.player.place(p.x, p.y, p.facing);
    if (W.doors) W.doors.disarmNear(p.x, p.y);
    W.camera.snap();
    W.sync(s);
    return p;
  };

  /** Moves the player to (x, y) on foot (the debug teleport). */
  W.teleport = function (x, y) {
    W.player.place(x, y, W.player.facing);
    if (W.doors) W.doors.disarmNear(x, y);
    W.camera.snap();
    W.sync();
    return { x: x, y: y };
  };

  /**
   * Starts the world from the state: the player where state.player says (on foot, or in the car
   * named by state.player.driving), the fall and doors reset, the camera snapped.
   */
  W.start = function (s) {
    s = s || SR.state;
    if (!W.ready) W.build();
    if (W.fall) W.fall.reset();
    if (W.doors) W.doors.reset();
    var pl = s && s.player;
    if (pl && typeof pl.x === 'number') {
      W.player.place(pl.x, pl.y, pl.facing === undefined ? 180 : pl.facing);
      var car = pl.driving && pl.cars && pl.cars[pl.driving];
      if (car && car.owned && !car.towed) W.player.board(pl.driving, true);
      if (pl.lastSafe && typeof pl.lastSafe.x === 'number') W.player.lastSafe = { x: pl.lastSafe.x, y: pl.lastSafe.y };
    } else {
      var sp = W.spawnPoint('newGame', s);
      W.player.place(sp.x, sp.y, sp.facing);
    }
    if (W.doors) W.doors.disarmNear(W.player.x, W.player.y);
    W.camera.snap();
    return W.player;
  };

  var syncT = 0;
  /**
   * Writes the player's position (and a driven car's) into state.player. While a teeter or the
   * Fold Rescue plays, the player is over the sky: the state gets the landing point (or the last
   * point on the sheet), so a save taken then never loads the player in mid-air.
   */
  W.sync = function (s) {
    s = s || SR.state;
    syncT = 0;
    if (!s || !s.player) return;
    var p = W.player, pl = s.player, f = W.fall, pos = p;
    if (f && f.active && f.active()) pos = f.to || f.from || p.lastSafe || p;
    pl.x = Math.round(pos.x); pl.y = Math.round(pos.y); pl.facing = Math.round(p.facing) % 360;
    pl.driving = p.car || null;
    if (p.lastSafe) pl.lastSafe = { x: Math.round(p.lastSafe.x), y: Math.round(p.lastSafe.y) };
    if (p.car && pl.cars && pl.cars[p.car]) {
      pl.cars[p.car].x = Math.round(pos.x); pl.cars[p.car].y = Math.round(pos.y);
      pl.cars[p.car].a = Math.round(p.a * 1000) / 1000;
    }
  };

  // --- entities of other modules -----------------------------------------------------------------
  // The entity arrays the world reads from the modules that own walkers and cars (W2-City's traffic
  // and pedestrians, W2-Street's street people, W3-Crime's police), under the same names the
  // renderer accepts (js/render/actors.js). Entities are { x, y, visible?, active?, ... }.
  var ENTITY_SOURCES = {
    car: [['traffic', ['cars', 'list', 'pool']]],
    ped: [['pedestrians', ['peds', 'list', 'pool']]],
    person: [['streetnpcs', ['people', 'list', 'npcs']]],
    police: [['police', ['officers', 'list']]],
  };
  var NO_ENTITIES = [];

  /**
   * @param {string} kind 'car' | 'ped' | 'person' | 'police'
   * @returns {object[]} that module's live entity array (never copied; empty while the module is a stub)
   */
  W.entities = function (kind) {
    var src = ENTITY_SOURCES[kind];
    if (!src) return NO_ENTITIES;
    var mod = W[src[0][0]], names = src[0][1];
    if (!mod) return NO_ENTITIES;
    for (var i = 0; i < names.length; i++) if (Array.isArray(mod[names[i]])) return mod[names[i]];
    return NO_ENTITIES;
  };
  W.ENTITY_KINDS = Object.keys(ENTITY_SOURCES);

  // --- input ------------------------------------------------------------------------------------
  var INPUT = { x: 0, y: 0, skate: false };   // readInput's result, refilled every call (read it at once)
  /** @returns {{x: number, y: number, skate: boolean}} the move axis and the skate hold from SR.input. */
  W.readInput = function () {
    var inp = SR.input, out = INPUT;
    out.x = 0; out.y = 0; out.skate = false;
    if (!inp) return out;
    try {
      if (typeof inp.axis === 'function') { var a = inp.axis('move'); if (a) { out.x = a.x || 0; out.y = a.y || 0; } }
      if (typeof inp.held === 'function') out.skate = !!inp.held('skate');
    } catch (e) { /* the kernel's input may still be landing (M1) */ }
    return out;
  };

  /**
   * Input actions the city scene forwards (ARCHITECTURE §11): interact (enter a door, park and
   * enter), car (get in or out), zoomIn / zoomOut / zoomCycle; any action skips a fall past 0.5 s.
   * @returns {boolean} consumed
   */
  W.onAction = function (action) {
    if (!W.ready) return false;
    if (W.fall.active()) { if (W.fall.phase !== 'teeter') W.fall.skip(); return true; }
    if (action === 'interact') return W.doors.interact();
    if (action === 'car') return !!W.player.toggleCar();
    if (action === 'zoomIn') { W.camera.zoomIn(); return true; }
    if (action === 'zoomOut') { W.camera.zoomOut(); return true; }
    if (action === 'zoomCycle') { W.camera.cycle(); return true; }
    return false;
  };

  function call(mod, dt) {
    if (mod && typeof mod.update === 'function') mod.update(dt);
  }

  /**
   * One fixed step of the world (ARCHITECTURE §8.2 order).
   * @param {number} dt seconds (SR.STEP)
   * @param {{x: number, y: number, skate: boolean}=} input the move input (default: SR.input)
   */
  W.update = function (dt, input) {
    if (!W.ready) return;
    W.time += dt;
    W.nav.tick(dt);
    var inp = input || W.readInput();
    var hasGame = !!SR.state;
    // The step's start positions (the renderer interpolates by alpha, ARCHITECTURE §3) and the
    // per-step dynamic hash of cars and people (ARCHITECTURE §8.2).
    W.player.px = W.player.x; W.player.py = W.player.y;
    if (W.collide.dynamic) W.collide.dynamic.rebuild();
    if (hasGame && !W.fall.active()) W.player.update(dt, inp);
    if (hasGame) W.fall.update(dt, inp);
    if (!W.fall.active()) {
      if (hasGame) W.doors.update(dt, inp);
      call(W.traffic, dt);
      call(W.pedestrians, dt);
      call(W.streetnpcs, dt);
      call(W.police, dt);
      call(W.markers, dt);
      call(W.weather, dt);
    }
    W.camera.update(dt);
    syncT += dt;
    if (hasGame && syncT >= 1) W.sync();
  };

  SR.onBoot(30, function () { W.build(); }, { headless: true });
})();
