// js/data/buildings/street.js — owner: W2-Street. The street cast's actions (GDD §6.2, §4.18;
// BALANCE B-26, B-04a, B-06, B-28a; ARCHITECTURE §8.3): every street interaction is an action with
// `building: 'street:<npc>'`, run from the street dialog (js/world/streetnpcs.js) through SR.act.
// - Homeless Harold: Give $10 (60 min, +2 karma; the first gift also +6 CHA, orig) and Give a bottle
//   (60 min, no karma; the first also +8 CHA, orig); both raise the `gift` rule event.
// - Skid, the smokes kid: Give a pack (60 min, -2 karma, orig); the first pack gives you his
//   skateboard (orig); the tenth kills him (-30 karma more, McHolland's voicemail, the daily log's
//   `kidDied`, and he leaves the city for good: W2-Exterior's memorial reads `npc.kid.dead`).
// - Red, the dealer: Buy n grams of snow (the NumberField of the dialog): $400 a gram through the
//   B-28a `product.red` modifiers, no time (orig), at most 99 held (orig), -ceil(n / 10) karma (new).
// - The junker on the apartment lawn: Try to hotwire it (60 min, the wall applies): INT ≥ 350
//   makes the car yours (bought: false) at -5 karma and +15 Heat (new); below it the attempt fails
//   and still costs the hour (orig). P1 `arcs`: with INT 200-349 (150 with Tinkerer) the Timing
//   Ring `hotwire` skin replaces the P0 attempt (needs HP > 45; -15 HP a miss; 3 hits start the
//   car, 3 misses trip the alarm: +10 Heat).
// - `street.<npc>.talk` (silent, free): opening a street dialog raises the `talk` rule event.
// - `street.jobOffer` (silent, free, once): Manager Mel's day-1 job offer (W2-Food's `vm.mel.job`)
//   lands on the answering machine; js/world/streetnpcs.js runs it for a new game.
// - The greeting fns greet.harold / kid / dealer / junker (UI §5.6's rule for the dialog's line).
// Every number is read from SR.tuning.street at call time through the row a def names in `tune`
// (a dotted path of B-26). Pure data and named functions: no DOM, no platform RNG (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {object} the B-26 row a def names in `tune` ('harold.give10' → SR.tuning.street.harold.give10), or {}. */
  function row(ctx) {
    var path = ctx && ctx.def && ctx.def.tune;
    var o = SR.tuning.street;
    if (typeof path !== 'string') return {};
    path.split('.').forEach(function (k) { o = o && typeof o === 'object' ? o[k] : undefined; });
    return o && typeof o === 'object' ? o : {};
  }
  /** @returns {object} state.npc[id] (created when a save lacks it). */
  function npc(s, id) {
    if (!SR.util.isObject(s.npc[id])) s.npc[id] = {};
    return s.npc[id];
  }
  /** @returns {object} state.npc[id] for reading (never created: greetings and conditions stay pure). */
  function npcOf(s, id) { return (s.npc && s.npc[id]) || {}; }
  function count(v) { return Number(v) || 0; }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  var KID_COUGH = 6;   // the pack from which Skid's lines are all coughs (presentation; CONTRACT D49)

  // ---- costs and amounts from the B-26 row (string cost fields and numeric arguments) --------------

  /** Cost: the row's cash ($10 for Harold). */
  SR.def.fn('street.cash', function (s, params, ctx) { return count(row(ctx).cash); });
  /** Cost: the row's minutes (60 for gifts and the hotwire; Red takes none, orig). */
  SR.def.fn('street.min', function (s, params, ctx) { return count(row(ctx).min); });
  /** The row's karma change (+2 for $10, 0 for a bottle, -2 for a pack). */
  SR.def.fn('street.karma', function (s, params, ctx) { return count(row(ctx).karma); });
  /** Cost: the bottles a bottle gift takes (B-26 harold.giveBottle.items.booze: 1). */
  SR.def.fn('street.bottles', function (s, params, ctx) { var it = row(ctx).items; return it && it.booze !== undefined ? count(it.booze) : 1; });

  /**
   * Condition ['fn', 'street.here', npc]: the person is still on the street (the kid is gone for
   * good after the tenth pack, GDD §6.2). Also the schedule condition of data/people.js.
   */
  SR.def.fn('street.here', function (s, params, ctx, id) {
    var n = s.npc && s.npc[id];
    return n && n.dead ? no('reason.unavailable') : { ok: true };
  });

  /**
   * Effect ['fn', 'street.gift', npc, counter, item]: counts the gift in state.npc[npc][counter]; the
   * first one also gives the row's `firstCha` (orig: +6 CHA for money, +8 for a bottle; a reward,
   * so a Theatre degree adds its +1); raises the frozen `gift` rule event ({ npc, item, n }: n is
   * the dollars for cash, else the count).
   */
  SR.def.fn('street.gift', function (s, params, ctx, id, counter, item) {
    var r = row(ctx), n = npc(s, id);
    var first = count(n[counter]) === 0;
    n[counter] = count(n[counter]) + 1;
    var list = [];
    if (first && r.firstCha) list.push(['stat', 'cha', r.firstCha, 'reward']);
    var amount = item === 'cash' ? (ctx && ctx.cost ? ctx.cost.cash : count(r.cash)) : 1;
    list.push(['emit', 'gift', { npc: id, item: item, n: amount }]);
    return SR.rules.effects.run(s, list, ctx);
  });

  // ---- Homeless Harold (Sticky's corner; B-26 harold) ----------------------------------------------

  SR.def.action('street.harold.give10', {
    building: 'street:harold', group: 'services', order: 10, icon: 'give10', label: 'act.harold.give10', p: 0,
    tune: 'harold.give10',
    cost: { cash: 'street.cash', min: 'street.min' },
    effects: [['karma', 'street.karma'], ['fn', 'street.gift', 'harold', 'gave10', 'cash'], ['sfx', 'coin']],
  });
  SR.def.action('street.harold.giveBottle', {
    building: 'street:harold', group: 'services', order: 20, icon: 'givebooze', label: 'act.harold.giveBottle', p: 0,
    tune: 'harold.giveBottle',
    cost: { min: 'street.min', items: { booze: 'street.bottles' } },
    effects: [['karma', 'street.karma'], ['fn', 'street.gift', 'harold', 'bottles', 'booze'], ['sfx', 'glass_clink']],
  });

  // ---- Skid, the smokes kid (the mansion corner; B-26 kid) -----------------------------------------

  SR.def.action('street.kid.givePack', {
    building: 'street:kid', group: 'services', order: 10, icon: 'givesmokes', label: 'act.kid.givePack', p: 0,
    tune: 'kid.givePack',
    cost: { min: 'street.min', items: { smokes: 1 } },
    requires: [['fn', 'street.here', 'kid']],
    effects: [['karma', 'street.karma'], ['fn', 'street.pack'], ['sfx', 'smoke']],
  });

  /**
   * Effect: one more pack for the kid (orig). The first gives you his skateboard; the tenth kills
   * him: another -30 karma (so -32 in all that hour), McHolland's voicemail, the `kidDied` log entry
   * (tomorrow's headline, B-29), and he is gone for good (npc.kid.dead, stage 'dead', the day in
   * npc.kid.diedDay for McHolland's P1 walk "within 3 days of the kid's death").
   */
  SR.def.fn('street.pack', function (s, params, ctx) {
    var r = row(ctx), k = npc(s, 'kid');
    k.packs = count(k.packs) + 1;
    var list = [['emit', 'gift', { npc: 'kid', item: 'smokes', n: 1 }]];
    if (k.packs === count(r.skateboardAt)) list.push(['item', 'skateboard', 1], ['toast', 'toast.kid.skateboard', {}, 'reward']);
    if (k.packs >= count(r.deathAt) && !k.dead) {
      k.dead = true;
      k.diedDay = s.clock.day;
      list.push(['karma', r.deathKarma], ['npcStage', 'kid', 'dead'], ['msg', 'vm.mcholland.kid', {}], ['log', 'kidDied', {}]);
    }
    return SR.rules.effects.run(s, list, ctx);
  });

  // ---- Red, the dealer (Dealer Alley; B-26 red.buy, B-28a product.red) -------------------------------

  /** @returns {number} the grams of a purchase: params.n (the NumberField), rounded; 1 without it. */
  function grams(params) {
    return params && params.n !== undefined && params.n !== null ? Math.round(Number(params.n) || 0) : 1;
  }

  SR.def.action('street.dealer.buy', {
    building: 'street:dealer', group: 'buy', order: 10, icon: 'snow', label: 'act.dealer.buy', p: 0,
    tune: 'red.buy',
    // The Dialog's NumberField (UI §5.7). W2-Street's dialog caps it at what you can carry (99 held,
    // orig) and offers a quick "all I can carry"; this is the plain field for any other host.
    number: { min: 1, step: 1, label: 'card.dealer.grams' },
    cost: { cash: 'dealer.cash', min: 'street.min' },
    priceTarget: 'product.red',
    requires: [['fn', 'items.room', 'snow']],
    effects: [['fn', 'items.buy', 'snow', null, 'dealer'], ['karma', 'dealer.karma'], ['fn', 'dealer.bought'], ['sfx', 'purchase']],
  });

  /** Cost: n grams at the row's price ($400, orig); the B-28a `product.red` modifiers then apply to the whole. */
  SR.def.fn('dealer.cash', function (s, params, ctx) {
    var n = grams(params);
    return n > 0 ? n * count(row(ctx).price) : 0;
  });
  /** The karma of a purchase: -1 per 10 g, rounded up (B-04a, new): -ceil(n / 10). */
  SR.def.fn('dealer.karma', function (s, params, ctx) {
    var n = grams(params);
    return n > 0 ? count(row(ctx).karmaPer10g) * Math.ceil(n / 10) : 0;
  });
  /** Effect: counts the grams bought from Red in all (npc.dealer.bought; the P1 credit line and loyalty read it). */
  SR.def.fn('dealer.bought', function (s, params) {
    var d = npc(s, 'dealer');
    d.bought = count(d.bought) + Math.max(0, grams(params));
  });

  // ---- the junker on the apartment lawn (B-26 junker; GDD §4.18) ------------------------------------

  function car(s) { return s.player && s.player.cars && s.player.cars.junker; }
  /** Makes the lawn's car yours: owned, not bought (net worth leaves it out, B-18), parked where it stands. */
  function own(s) {
    var c = car(s);
    if (!c) return;
    c.owned = true;
    c.towed = false;
  }
  /** @returns {boolean} INT in the P1 ring range: 200-349 (Tinkerer: from 150), with `arcs` on. */
  function ringRange(s) {
    if (!SR.features.arcs) return false;
    var R = SR.tuning.street.junker.ring, lo = R.int[0];
    if (SR.rules.perks && SR.rules.perks.has(s, 'tinkerer')) lo = R.tinkererInt;
    return s.stats.int >= lo && s.stats.int <= R.int[1];
  }

  /** Condition: the junker is already yours (the lawn's rows hide). */
  SR.def.fn('junker.owned', function (s) { var c = car(s); return !!(c && c.owned); });
  /** Condition: the P1 Timing Ring attempt replaces the P0 one (arcs on, INT 200-349, or 150 with Tinkerer). */
  SR.def.fn('junker.ringInstead', function (s) { return ringRange(s); });
  /** The ring's HP requirement: HP > 45, its worst case (3 misses × 15). */
  SR.def.fn('junker.ringHp', function () { return count(SR.tuning.street.junker.ring.hpAbove); });

  SR.def.action('street.junker.hotwire', {
    building: 'street:junker', group: 'crime', order: 10, icon: 'hotwire', label: 'act.junker.hotwire', p: 0,
    tune: 'junker.hotwire',
    cost: { min: 'street.min' },
    hidden: [['any', [['fn', 'junker.owned'], ['fn', 'junker.ringInstead']]]],
    effects: [['fn', 'junker.hotwire']],
  });

  /**
   * Effect: the P0 attempt (orig). INT ≥ 350: the car is yours, -5 karma, +15 Heat (new). Below it
   * nothing but the hour (orig). A preview shows the outcome as a chance chip (100 % or 0 %).
   */
  SR.def.fn('junker.hotwire', function (s, params, ctx) {
    var r = row(ctx), ok = s.stats.int >= count(r.int);
    if (!ok) return { chance: 0, sfx: ['horn'] };
    own(s);
    var res = SR.rules.effects.run(s, [['karma', r.karma], ['heat', r.heat], ['sfx', 'ignition'], ['toast', 'toast.junker.yours', {}, 'reward']], ctx);
    res.chance = 1;
    return res;
  });

  SR.def.action('street.junker.ring', {
    building: 'street:junker', group: 'crime', order: 20, icon: 'hotwire', label: 'act.junker.ring', p: 1, feature: 'arcs',
    tune: 'junker.ring',
    cost: { min: 'street.min' },
    hidden: [['any', [['fn', 'junker.owned'], ['not', ['fn', 'junker.ringInstead']]]]],
    requires: [['hpAbove', 'junker.ringHp']],
    effects: [['fn', 'junker.ringStart']],
  });
  SR.def.action('street.junker.ring:resolve', {
    building: 'street:junker', p: 1, feature: 'arcs', timeRule: 'free',
    tune: 'junker.ring',
    effects: [['fn', 'junker.ringResolve']],
  });

  /**
   * Effect: starts the P1 ring attempt (the hour is the row's cost): records the attempt in progress
   * (flags.junkerRing = today, so its :resolve pays once) and opens the `hotwire` skin.
   */
  SR.def.fn('junker.ringStart', function (s, params, ctx) {
    s.flags.junkerRing = s.clock.day;
    return SR.rules.effects.run(s, [['open', 'hotwire', {}]], ctx);
  });

  /**
   * Effect: the ring's outcome from the engine's { started, hits, misses } (leaving early gives up):
   * -15 HP per miss; 3 hits start the car (then as the P0 success: -5 karma, +15 Heat); 3 misses
   * trip the alarm (+10 Heat, no car). Refuses (reason.notNow) unless an attempt is in progress.
   */
  SR.def.fn('junker.ringResolve', function (s, params, ctx) {
    if (!s.flags.junkerRing) return no('reason.notNow');
    s.flags.junkerRing = 0;
    var r = row(ctx), H = SR.tuning.street.junker.hotwire, p = params || {};
    var misses = SR.util.clamp(Math.round(count(p.misses)), 0, count(r.misses));
    var hits = Math.max(0, Math.round(count(p.hits)));
    var list = [];
    if (misses > 0) list.push(['hurt', misses * count(r.missHp), 'other']);
    if (p.started === true && hits >= count(r.hits) && misses < count(r.misses)) {
      own(s);
      list.push(['karma', H.karma], ['heat', H.heat], ['sfx', 'ignition'], ['toast', 'toast.junker.yours', {}, 'reward']);
    } else if (misses >= count(r.misses)) {
      list.push(['heat', r.alarmHeat], ['sfx', 'horn'], ['toast', 'toast.junker.alarm', {}, 'warning']);
    }
    return SR.rules.effects.run(s, list, ctx);
  });

  // ---- talking and the day-1 job offer (silent, free) ------------------------------------------------

  ['harold', 'kid', 'dealer', 'junker'].forEach(function (id) {
    SR.def.action('street.' + id + '.talk', {
      building: 'street:' + id, group: 'special', order: 90, label: 'act.street.talk', p: 0,
      silent: true, timeRule: 'free',
      effects: [['emit', 'talk', { npc: id }]],
    });
  });

  // Manager Mel's day-1 job offer (GDD §6.2, §6.8; UI §9 step 1): once per run, on day 1. The
  // voicemail's text is W2-Food's (vm.mel.job, en-food.js); from 'mel' by its key.
  SR.def.action('street.jobOffer', {
    building: 'street:mel', group: 'special', order: 1, label: 'act.street.jobOffer', p: 0,
    silent: true, timeRule: 'free',
    requires: [['notFlag', 'jobOffer']],
    effects: [['flag', 'jobOffer', true], ['msg', 'vm.mel.job', {}]],
  });

  // ---- greetings (UI §5.6: by first visit, time, karma, job; variants are drawn by SR.text) ---------

  /** @returns {boolean} night on the street: 20:00-06:00. */
  function night(s) { var m = s.clock.min; return m >= 1200 || m < 360; }

  SR.def.fn('greet.harold', function (s) {
    var h = npcOf(s, 'harold'), gifts = count(h.gave10) + count(h.bottles);
    if (night(s)) return { key: 'greet.harold.night' };
    return { key: gifts >= 3 ? 'greet.harold.friend' : 'greet.harold.day' };
  });
  SR.def.fn('greet.kid', function (s) {
    var packs = count(npcOf(s, 'kid').packs);
    if (packs === 0) return { key: 'greet.kid.first' };
    return { key: SR.reg.fn['kid.coughing'](s) ? 'greet.kid.worse' : 'greet.kid.again' };
  });
  /**
   * Condition: from the sixth pack on, all Skid does is cough (his greeting and his thanks; a
   * presentation threshold, CONTRACT D49, not a rule: the rules only count to the tenth).
   */
  SR.def.fn('kid.coughing', function (s) { return count(npcOf(s, 'kid').packs) >= KID_COUGH; });
  SR.def.fn('greet.dealer', function (s, params, ctx) {
    if (count(npcOf(s, 'dealer').bought) > 0) return { key: 'greet.dealer.regular' };
    var base = count(SR.tuning.street.red.buy.price);
    var price = SR.rules.act && typeof SR.rules.act.price === 'function' ? SR.rules.act.price(s, base, 'product.red', ctx || {}).price : base;
    return { key: 'greet.dealer.pitch', vars: { price: SR.text.money(price) } };
  });
  SR.def.fn('greet.junker', function (s) {
    return { key: s.stats.int >= count(SR.tuning.street.junker.hotwire.int) ? 'greet.junker.smart' : 'greet.junker.look' };
  });
})();
