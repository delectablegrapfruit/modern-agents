// js/data/actions/world.js — owner: W1-W (W2-City in wave 2). The world's requests to the rules
// (ARCHITECTURE §8.3): world.fall { x, y } (-10 HP, Hard Landing -5, no time; the `fall` event;
// Pilot Ori's line on falls 1, 2, 5, 10, 25 and 50; the fallMilestone log on the 20th fall and
// every 25th after), world.carHit (-10 HP, Hard Landing -5; flags.carHitVm asks the night for a
// lawyer's voicemail), world.carCrash (-5 HP), world.carFished { car } (the car leaves the world
// until the night's tow brings it home for $100) and world.enter { building } (silent and free;
// the `enter` event). All are involuntary (no hpAbove: they are what can take HP to 0) and free of
// the time wall (timeRule 'free'); none is ever a card row. The damage runs W1-R's `hurt` effect
// through SR.rules.effects.run, so Hard Landing and the HP-0 cause apply as for any hurt.
// W2-City adds world.city (silent and free: stepping into the city runs the nomination check,
// GDD §4.17, CONTRACT §8.10) and world.cab { door } (P1, flag `phone`: $15 and 30 min to any door,
// GDD §4.18; at 24:00 only home, and the ride then takes no minutes: the day is already over).
// Pure data and named functions: no DOM, no platform RNG.
(function () {
  'use strict';
  var SR = window.SR;

  var ORI_FALLS = [1, 2, 5, 10, 25, 50];          // GDD §3.9: Pilot Ori's running gag
  var MILESTONE_FIRST = 20, MILESTONE_EVERY = 25;  // B-29 fallMilestone: the 20th fall, then every 25th

  /** Runs W1-R's hurt effect (Hard Landing, the HP-0 cause) on the pipeline's ctx: a partial Result. */
  function hurt(s, ctx, n, cause) {
    return SR.rules.effects.run(s, [['hurt', n, cause]], ctx);
  }

  SR.def.fn('world.fall', function (s, params, ctx) {
    params = params || {};
    var res = hurt(s, ctx, SR.tuning.world.fall.hp, 'fall');
    var count = s.records.falls;
    res.events.push({ name: 'fall', payload: { count: count, x: Math.round(Number(params.x) || 0), y: Math.round(Number(params.y) || 0) } });
    if (ORI_FALLS.indexOf(count) >= 0) res.toasts.push({ key: 'ori.fall' + count, vars: { n: count }, kind: 'info' });
    if (count === MILESTONE_FIRST || (count > MILESTONE_FIRST && (count - MILESTONE_FIRST) % MILESTONE_EVERY === 0)) {
      res.log.push({ kind: 'fallMilestone', vars: { count: count } });
    }
    return res;
  });

  SR.def.fn('world.carHit', function (s, params, ctx) {
    var res = hurt(s, ctx, SR.tuning.world.carHit.hp, 'carHit');
    res.events.push({ name: 'carHit', payload: { count: s.records.carHits } });
    res.toasts.push({ key: 'toast.world.carHit', vars: {}, kind: 'warning' });
    return res;
  });

  SR.def.fn('world.carCrash', function (s, params, ctx) {
    var res = hurt(s, ctx, SR.tuning.world.carCrash.hp, 'carCrash');
    res.events.push({ name: 'carCrash', payload: {} });
    res.toasts.push({ key: 'toast.world.crash', vars: {}, kind: 'warning' });
    return res;
  });

  // The car went off an edge: it is out of the world (towed) until night step 10 returns it to its
  // home lot for a forced $100 (ARCHITECTURE §8.5).
  SR.def.fn('world.carFished', function (s, params) {
    var car = params && params.car, row = s.player && s.player.cars && s.player.cars[car];
    if (!row) return { ok: false, reason: 'reason.unavailable', vars: {} };
    row.towed = true;
    if (s.player.driving === car) s.player.driving = null;
    return { toasts: [{ key: 'toast.world.carFished', vars: {}, kind: 'warning' }] };
  });

  SR.def.fn('world.enter', function (s, params) {
    return { events: [{ name: 'enter', payload: { building: String((params && params.building) || '') } }] };
  });

  // --- the cab (GDD §4.18, B-15 cab; P1, flag `phone`) ------------------------------------------
  function buildings() { var m = SR.reg.worldmap && SR.reg.worldmap.main; return (m && m.buildings) || []; }
  /** @returns {string|null} the door (building id) of the home the player lives in. */
  function homeDoorOf(s) {
    var living = s.homes && s.homes.living, list = buildings();
    for (var i = 0; i < list.length; i++) if (list[i].door && list[i].homes && list[i].homes.indexOf(living) >= 0) return list[i].id;
    return null;
  }
  function hasDoor(id) { return buildings().some(function (b) { return b.id === id && !!b.door; }); }

  // Any door while the ride fits the day; at 24:00 (or when it would not fit) only the home door.
  SR.def.fn('world.cabOk', function (s, params) {
    var door = params && params.door;
    if (!door || !hasDoor(door)) return { ok: false, reason: 'reason.unavailable', vars: {} };
    if (s.clock.min + SR.tuning.world.cab.min <= SR.tuning.time.dayEnd) return { ok: true };
    return door === homeDoorOf(s) ? { ok: true } : { ok: false, reason: 'reason.dayOver', vars: {} };
  });
  // The ride's minutes: 30, or what is left of the day (none at 24:00).
  SR.def.fn('world.cabMin', function (s) {
    return Math.max(0, Math.min(SR.tuning.world.cab.min, SR.tuning.time.dayEnd - s.clock.min));
  });
  SR.def.fn('world.cabCash', function () { return SR.tuning.world.cab.cash; });

  SR.def.action('world.fall', {
    building: 'world', group: 'special', order: 10, label: 'act.world.fall', p: 0, timeRule: 'free',
    effects: [['record', 'falls', 1], ['daily', 'falls', 1], ['log', 'fall', {}], ['fn', 'world.fall']],
  });
  SR.def.action('world.carHit', {
    building: 'world', group: 'special', order: 20, label: 'act.world.carHit', p: 0, timeRule: 'free',
    // flags.carHitVm: night step 11 queues one of the lawyers' voicemails (vm.carhit.*) and clears it.
    effects: [['record', 'carHits', 1], ['flag', 'carHitVm', true], ['log', 'carHit', {}], ['fn', 'world.carHit']],
  });
  SR.def.action('world.carCrash', {
    building: 'world', group: 'special', order: 30, label: 'act.world.carCrash', p: 0, timeRule: 'free',
    effects: [['fn', 'world.carCrash']],
  });
  SR.def.action('world.carFished', {
    building: 'world', group: 'special', order: 40, label: 'act.world.carFished', p: 0, timeRule: 'free',
    effects: [['fn', 'world.carFished']],
  });
  SR.def.action('world.enter', {
    building: 'world', group: 'special', order: 50, label: 'act.world.enter', p: 0, timeRule: 'free', silent: true,
    effects: [['fn', 'world.enter']],
  });
  // Stepping into the city (the city scene runs it on entry): the nomination check (orig: the
  // original checked it only there; the night checks every morning too).
  SR.def.action('world.city', {
    building: 'world', group: 'special', order: 60, label: 'act.world.city', p: 0, timeRule: 'free', silent: true,
    effects: [['fn', 'election.check']],
  });
  // A cab ride to a door (the city places you there on success: SR.world.cab).
  SR.def.action('world.cab', {
    building: 'world', group: 'special', order: 70, label: 'act.world.cab', icon: 'cab', p: 1, feature: 'phone', timeRule: 'free',
    cost: { cash: 'world.cabCash', min: 'world.cabMin' },
    requires: [['phone'], ['fn', 'world.cabOk']],
    effects: [],
  });
})();
