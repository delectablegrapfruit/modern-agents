// js/data/buildings/mcsticks.js — owner: W2-Food. McSticks (GDD §6.1; UI §5.6): the building, its
// food rows (B-06: eaten here in 30 m, refused at full HP; P1 `shopsPlus`: the Takeout variant into
// the Bag at +$2 and the Mega Meal once HP max ≥ 200; P1 `calendar`: the Heat Wave's milkshake heals
// ×2, B-19), the cook's shift (B-05: Full; P1 `hustles`:
// Half, Overtime, the Order Up hustle and the Shift Manager promotion), Manager Mel's greetings and
// her voicemails, and the named fns those rows use.
// Every number is read from SR.tuning at call time (B-05, B-06; prices through the B-28a modifiers
// of each row's priceTarget `food.mcsticks.<id>`: the 25 % employee discount, Thursday's triple,
// the flyer coupon, the takeout surcharge), so the balance wave tunes only tuning.js.
// Pure data and named functions: no DOM, no platform RNG (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // The food rows in card order: id (B-06 row and state item id), icon (ART_AUDIO §10), p, and the
  // eat clip and sound (drinks are drunk).
  var FOOD = [
    { id: 'milkshake', icon: 'milkshake', p: 0, drink: true },
    { id: 'fries', icon: 'fries', p: 0 },
    { id: 'cheeseburger', icon: 'burger', p: 0 },
    { id: 'tripleburger', icon: 'tripleburger', p: 0 },
    { id: 'megameal', icon: 'megameal', p: 1, feature: 'shopsPlus' },
  ];

  /** @returns {boolean} the row runs its Takeout variant (P1 `shopsPlus`; B-28a `takeout`). */
  function takeout(params) { return !!params && params.variant === 'takeout'; }
  /** @returns {string|undefined} the food id of the running row (its def's `food` field). */
  function foodOf(ctx) { return ctx && ctx.def ? ctx.def.food : undefined; }
  /** @returns {object} the food's B-06 row ({ price, hp, min }), or an empty row. */
  function row(ctx) { return SR.tuning.items[foodOf(ctx)] || {}; }

  // ---- the building ----------------------------------------------------------------------------

  SR.def.building('mcsticks', {
    name: 'place.mcsticks', owner: 'mel', portrait: 'mel', music: 'fry_day', interior: 'mcsticks',
    exteriorId: 'mcsticks', groups: ['eat', 'work'],
    greetings: ['greet.mcsticks.default'],
  });

  // ---- food (GDD §4.7, §6.1; B-06) ---------------------------------------------------------------

  // The Takeout variant exists only with `shopsPlus`: while the flag is off its preview is hidden, so
  // the card shows no Eat here / To go control and the rows are the original's (UI §5.6).
  var TAKEOUT_OFF = [['not', ['feature', 'shopsPlus']], ['fn', 'mods.param', 'variant', 'takeout']];

  FOOD.forEach(function (f, i) {
    var def = {
      building: 'mcsticks', group: 'eat', order: 10 + i * 10, icon: f.icon, label: 'act.mcsticks.' + f.id, p: f.p,
      food: f.id, drink: !!f.drink,
      variants: ['here', 'takeout'],
      cost: { cash: 'mcsticks.price', min: 'mcsticks.min' },
      priceTarget: 'food.mcsticks.' + f.id,
      requires: [['fn', 'mcsticks.canServe']],
      hidden: TAKEOUT_OFF,
      effects: [['fn', 'mcsticks.serve']],
      repeatable: true,
    };
    if (f.feature) def.feature = f.feature;
    // The Mega Meal shows up once HP max reaches B-06's needHpMax (200); the flag gates the takeout too.
    if (f.id === 'megameal') def.hidden = [['fn', 'mcsticks.megaLocked']];
    SR.def.action('mcsticks.' + f.id, def);
  });

  /** Cost: the food's B-06 price (the B-28a modifiers of the row's priceTarget then apply). */
  SR.def.fn('mcsticks.price', function (s, params, ctx) { return row(ctx).price || 0; });

  /** Cost: 30 m to eat here (B-06 `min`), nothing to buy it to go (B-06 takeout `buyMin`). */
  SR.def.fn('mcsticks.min', function (s, params, ctx) {
    return takeout(params) ? SR.tuning.items.takeout.buyMin : row(ctx).min || 0;
  });

  /**
   * Condition: eating here is refused at full HP (B-06 `refuseAtFullHp`, orig); a meal to go needs
   * room in the Bag (B-06 takeout stack 5; W2-RulesE's items.room).
   */
  SR.def.fn('mcsticks.canServe', function (s, params, ctx) {
    var K = SR.rules.conditions;
    if (takeout(params)) return K.eval(s, ['fn', 'items.room', 'takeout', 1], ctx);
    if (SR.tuning.items.refuseAtFullHp) return K.eval(s, ['hpBelowMax'], ctx);
    return { ok: true };
  });

  /**
   * The HP of the food eaten here: its B-06 row, ×2 for a milkshake on a Heat Wave day (B-19
   * `calendar.events.heatWave.milkshakeHeal`; the cityEvent condition needs the P1 `calendar` flag).
   * @returns {number}
   */
  function hpOf(s, ctx) {
    var hp = row(ctx).hp || 0;
    var ev = SR.tuning.calendar && SR.tuning.calendar.events, hw = ev && ev.heatWave;
    if (foodOf(ctx) === 'milkshake' && hw && hw.milkshakeHeal && SR.rules.conditions.eval(s, ['cityEvent', 'heatWave'], ctx).ok) {
      hp *= hw.milkshakeHeal;
    }
    return hp;
  }

  /**
   * Effect: serves the row's food. Here: +HP (B-06, the Heat Wave milkshake of B-19; Iron Stomach
   * and the "(full)" note through the heal effect), the `buy` and `eat` rule events, the eat or drink
   * sound and clip. To go: the meal goes into the Bag as a takeout entry naming the food (items.buy
   * raises `buy` with the price paid).
   */
  SR.def.fn('mcsticks.serve', function (s, params, ctx) {
    var id = foodOf(ctx), E = SR.rules.effects;
    var price = ctx && ctx.cost ? ctx.cost.cash : 0;
    if (takeout(params)) {
      return E.run(s, [['fn', 'items.buy', 'takeout', 1, 'mcsticks', id], ['sfx', 'purchase'],
        ['toast', 'toast.mcsticks.takeout', { item: SR.rules.conditions.nameOf('item', id) }, 'info']], ctx);
    }
    var drink = !!(ctx && ctx.def && ctx.def.drink), hp = hpOf(s, ctx);
    return E.run(s, [
      ['heal', hp],
      ['emit', 'buy', { item: id, n: 1, where: 'mcsticks', price: price }],
      ['emit', 'eat', { item: id, hp: hp, where: 'mcsticks' }],
      ['sfx', drink ? 'drink' : 'eat'], ['anim', drink ? 'drink' : 'eat'],
    ], ctx);
  });

  /** Hidden condition: the Mega Meal waits for HP max ≥ B-06 needHpMax (200). */
  SR.def.fn('mcsticks.megaLocked', function (s) {
    return { ok: s.stats.hpMax < (SR.tuning.items.megameal.needHpMax || 0) };
  });

  // ---- work (GDD §4.6; B-05) ----------------------------------------------------------------------

  // Half and Overtime are P1 (`hustles`): their variants hide while the flag is off, so the row is
  // the original's Full shift. The Hustle button (P1) plays the rank's skin (B-05 hustle.skins:
  // orderup for the cook and the Shift Manager). A row with a Hustle is not repeatable (CONTRACT §8.2).
  SR.def.action('mcsticks.work', {
    building: 'mcsticks', group: 'work', order: 10, icon: 'work', label: 'act.mcsticks.work', p: 0,
    variants: ['full', 'half', 'overtime'],
    cost: { min: 'shift.min', hp: 'shift.hp' },
    requires: [['jobTrack', 'mcsticks'], ['hpAbove', 'shift.hp'], ['fn', 'jobs.canWork', 'mcsticks']],
    hidden: [['not', ['feature', 'hustles']], ['any', [['fn', 'mods.param', 'variant', 'half'], ['fn', 'mods.param', 'variant', 'overtime']]]],
    effects: [['fn', 'jobs.work', 'mcsticks'], ['fn', 'mcsticks.afterShift']],
    minigame: { skin: 'mcsticks.hustleSkin', auto: true },
  });

  // The Hustle's result comes back into mcsticks.work itself (the card commits the row with { m },
  // CONTRACT §15.4), never through a :resolve. tools/validate.cjs asks every `minigame` row for one,
  // so this is a deliberate no-op (docs/requests/W2-Food.md 1 asks to drop the check for Hustle rows).
  SR.def.action('mcsticks.work:resolve', { building: 'mcsticks', p: 0, timeRule: 'free', effects: [] });

  /** The Hustle's skin and step for your McSticks rank (B-05 hustle.skins; the card reads { skin, step }). */
  SR.def.fn('mcsticks.hustleSkin', function (s) {
    var J = SR.rules.jobs;
    return J && typeof J.hustleSkin === 'function' ? J.hustleSkin(s, 'mcsticks') : null;
  });

  /** Effect: Mel's voicemail after your first shift (GDD §6.2: her comic voicemails), once a run. */
  SR.def.fn('mcsticks.afterShift', function (s) {
    if (s.flags.melFirstShift) return null;
    s.flags.melFirstShift = true;
    return { msgs: [{ key: 'vm.mel.firstShift', vars: {} }] };
  });

  // Shift Manager (P1 `hustles`, the job's flag; B-05: CHA 20 and 15 cook shifts): one rung, +3 karma
  // and the stamp (jobs.promote), and Mel's voicemail. Hidden once you hold the rank.
  SR.def.action('mcsticks.promote', {
    building: 'mcsticks', group: 'work', order: 20, icon: 'promotion', label: 'act.mcsticks.promote', p: 1, feature: 'hustles',
    hidden: [['job', 'manager']],
    requires: [['fn', 'jobs.canPromote', 'mcsticks']],
    effects: [['fn', 'jobs.promote', 'mcsticks'], ['msg', 'vm.mel.promoted', {}]],
  });

  // ---- Manager Mel's greeting (UI §5.6: by first visit, time, karma, weather, job) --------------

  // Presentation thresholds of the greeting, not balance (CONTRACT D49): "morning" before 11:00,
  // "late" from 22:00.
  var MORNING_BEFORE = 660;
  var LATE_FROM = 1320;

  /**
   * The card's greeting (CONTRACT §15.4 `greet.<building>`): the first match wins. Variants of a
   * key are picked by SR.text from the fx stream. Karma uses the B-04b tier bounds (Good ≥ +50,
   * Bad ≤ -50) as words only; the tiers' perks stay behind `karmaTiers`. "Hungry" is the Winded
   * state (HP below B-03's threshold of HP max, SR.rules.stats.winded).
   * @returns {{key: string}}
   */
  SR.def.fn('greet.mcsticks', function (s) {
    var tier = SR.rules.stats.tier(s.stats.karma), min = s.clock.min;
    var key;
    if (s.job.ranks.mcsticks && !s.flags.melFirstShift && !(s.job.shiftsAtRank.mcsticks > 0)) key = 'newHire';
    else if (SR.rules.stats.winded(s)) key = 'hungry';
    else if (s.job.ranks.mcsticks === 'manager') key = 'manager';
    else if (s.job.ranks.nli) key = 'moonlight';
    else if (SR.features.weather && s.world && s.world.weather === 'rain') key = 'rain';
    else if (tier === 'good' || tier === 'angelic') key = 'good';
    else if (tier === 'bad' || tier === 'wicked') key = 'bad';
    else if (min < MORNING_BEFORE) key = 'morning';
    else if (min >= LATE_FROM) key = 'late';
    else key = 'default';
    return { key: 'greet.mcsticks.' + key };
  });
})();
