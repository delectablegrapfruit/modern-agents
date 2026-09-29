// js/data/buildings/store.js — owner: W2-Food. Funkytown Five-O (GDD §6.1, §4.10; UI §5.6): the
// building, its snacks (B-06: eaten on the spot in 30 m, refused at full HP), smokes and caffeine
// pills (B-06: 99 each, orig), the robbery with the Hold-up and its :resolve (B-11b; W2-RulesC's
// crime.* named fns, CONTRACT §8.10), the P1 rows (`stockTips`: The Daily Fold; `shopsPlus`:
// scratch cards and gum), Dee's greetings and her robbery reactions, and the named fns they use.
// Every number is read from SR.tuning at call time (B-03 paper, B-06, B-11b, B-14e); prices go
// through the B-28a modifiers of each row's priceTarget (`food.store.<id>`, `item.store.<id>`).
// Pure data and named functions: no DOM, no platform RNG (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {object} the B-06 row of the running row's item ({ price, hp, min, stack }). */
  function row(ctx) { return (ctx && ctx.def && SR.tuning.items[ctx.def.item]) || {}; }

  // ---- the building ----------------------------------------------------------------------------

  SR.def.building('store', {
    name: 'place.store', owner: 'dee', portrait: 'dee', music: 'funky_aisle', interior: 'store',
    exteriorId: 'store', groups: ['eat', 'buy', 'crime'],
    greetings: ['greet.store.default'],
  });

  /** Cost: the item's B-06 price (the B-28a modifiers of the row's priceTarget then apply). */
  SR.def.fn('store.price', function (s, params, ctx) { return row(ctx).price || 0; });
  /** Cost: the item's B-06 minutes (snacks 30 m; smokes, pills, cards and gum 0). */
  SR.def.fn('store.min', function (s, params, ctx) { return row(ctx).min || 0; });

  // ---- snacks (B-06: eaten on the spot, orig) ------------------------------------------------------

  [
    { id: 'slushee', icon: 'slushee', drink: true },
    { id: 'candybar', icon: 'candybar' },
    { id: 'nachos', icon: 'nachos' },
  ].forEach(function (f, i) {
    SR.def.action('store.' + f.id, {
      building: 'store', group: 'eat', order: 10 + i * 10, icon: f.icon, label: 'act.store.' + f.id, p: 0,
      item: f.id, drink: !!f.drink,
      cost: { cash: 'store.price', min: 'store.min' },
      priceTarget: 'food.store.' + f.id,
      requires: [['fn', 'store.canEat']],
      effects: [['fn', 'store.eat']],
      repeatable: true,
    });
  });

  /** Condition: snacks are refused at full HP (B-06 `refuseAtFullHp`, orig). */
  SR.def.fn('store.canEat', function (s, params, ctx) {
    return SR.tuning.items.refuseAtFullHp ? SR.rules.conditions.eval(s, ['hpBelowMax'], ctx) : { ok: true };
  });

  /**
   * Effect: eats the snack on the spot: +HP (B-06; the heal effect notes "(full)"), the `buy` and
   * `eat` rule events, the sound and clip.
   */
  SR.def.fn('store.eat', function (s, params, ctx) {
    var id = ctx.def.item, r = row(ctx), drink = !!ctx.def.drink;
    return SR.rules.effects.run(s, [
      ['heal', r.hp || 0],
      ['emit', 'buy', { item: id, n: 1, where: 'store', price: ctx.cost ? ctx.cost.cash : 0 }],
      ['emit', 'eat', { item: id, hp: r.hp || 0, where: 'store' }],
      ['sfx', drink ? 'drink' : 'eat'], ['anim', drink ? 'drink' : 'eat'],
    ], ctx);
  });

  // ---- goods for the Bag (B-06 stacks; W2-RulesE's items.room / items.buy) ----------------------

  [
    { id: 'smokes', icon: 'smokes', p: 0 },                              // $10 a pack, max 99 (orig)
    { id: 'pills', icon: 'pills', p: 0 },                                // $45 each, max 99 (orig)
    { id: 'gum', icon: 'gum', p: 1, feature: 'shopsPlus' },              // $1, max 9 (the kid's arc)
    { id: 'scratch', icon: 'scratch', p: 1, feature: 'shopsPlus' },      // $5, max 20 (B-14e)
  ].forEach(function (g, i) {
    var def = {
      building: 'store', group: 'buy', order: 10 + i * 10, icon: g.icon, label: 'act.store.' + g.id, p: g.p,
      item: g.id,
      cost: { cash: 'store.price', min: 'store.min' },
      priceTarget: 'item.store.' + g.id,
      requires: [['fn', 'items.room', g.id, 1]],
      effects: [['fn', 'items.buy', g.id, 1, 'store'], ['sfx', 'purchase']],
      repeatable: true,
    };
    if (g.feature) def.feature = g.feature;
    SR.def.action('store.' + g.id, def);
  });

  // Scratch a card from the Bag (P1 `shopsPlus`; B-14e): W2-RulesC's casino.scratch draws the prize
  // now (the card in progress) and opens the `scratch` engine to reveal it; the :resolve pays it at
  // the reveal (casino.scratchResolve, so the start's feedback never spoils it) and Dee reads it out.
  SR.def.action('store.scratchPlay', {
    building: 'store', group: 'buy', order: 50, icon: 'scratch', label: 'act.store.scratchPlay', p: 1, feature: 'shopsPlus',
    cost: { items: { scratch: 1 } },
    effects: [['fn', 'casino.scratch']],
  });
  // Dee reads the card in progress before casino.scratchResolve pays and closes it (a resolve with no
  // card is refused there, which drops her line with the rest of the action).
  SR.def.action('store.scratchPlay:resolve', {
    building: 'store', p: 1, feature: 'shopsPlus', timeRule: 'free',
    effects: [['fn', 'store.scratchDone'], ['fn', 'casino.scratchResolve']],
  });

  /**
   * Effect: Dee's line on the revealed card. It reads the card in progress (state.casino.card, drawn
   * by casino.scratch), not the engine's { net }, which is only an echo: the record decides the pay
   * (CONTRACT §8.9), so her line always matches what is paid.
   */
  SR.def.fn('store.scratchDone', function (s) {
    var card = s.casino && s.casino.card;
    if (!card || typeof card.pay !== 'number') return null;
    var win = card.pay > 0;
    return { toasts: [{ key: win ? 'toast.store.scratchWin' : 'toast.store.scratchLose', vars: { money: SR.text.money(card.pay) }, kind: win ? 'reward' : 'info' }] };
  });

  // The Daily Fold (P1 `stockTips`; B-03 `paper`): $2, 30 m (Speed Reader 0), +1 INT once a day, and
  // it reveals today's stock tip and the forecast. stocks.maybeReveal names the tip in a toast (the
  // paper's B-10 chance is 1, so it draws nothing), as TV News and Market Watch do.
  SR.def.action('store.paper', {
    building: 'store', group: 'buy', order: 60, icon: 'paper', label: 'act.store.paper', p: 1, feature: 'stockTips',
    item: 'paper',
    cost: { cash: 'store.price', min: 'training.paperMin' },
    priceTarget: 'item.store.paper',
    requires: [['fn', 'training.can', 'paper']],
    effects: [['fn', 'training.apply', 'paper'], ['fn', 'stocks.maybeReveal', 'paper'], ['fn', 'store.readPaper']],
  });

  /** Effect: the paper marks today's tip as read in it (stocks.reveal 'paper') and tomorrow's forecast as seen. */
  SR.def.fn('store.readPaper', function (s) {
    if (SR.rules.stocks && typeof SR.rules.stocks.reveal === 'function') SR.rules.stocks.reveal(s, 'paper');
    s.daily.forecastSeen = true;
    return { toasts: [{ key: 'toast.store.paper', vars: {}, kind: 'info' }] };
  });

  // ---- the robbery (GDD §4.10; B-11b; CONTRACT §8.10) ---------------------------------------------

  // A gun and ≥ 10 ammo (orig), start before 21:00 (orig; latest 20:30); the start (crime.rob) takes
  // 5-9 ammo, -10 karma and +30 Heat win or lose, sets the clock to 24:00 and opens the Hold-up; the
  // :resolve pays $100 + rand(0..499) on two successes, else jail. Never repeatable.
  SR.def.action('store.rob', {
    building: 'store', group: 'crime', order: 10, icon: 'rob', label: 'act.store.rob', p: 0,
    timeRule: 'robbery',
    requires: [['fn', 'crime.canRob', 'store']],
    effects: [['fn', 'crime.rob', 'store']],
    confirm: 'crime.rob.confirm.store',
  });
  SR.def.action('store.rob:resolve', {
    building: 'store', p: 0, timeRule: 'free',
    effects: [['fn', 'crime.robResolve', 'store'], ['fn', 'store.deeReacts']],
  });

  /**
   * Effect: Dee's reaction to the Hold-up's outcome (GDD §6.2), after crime.robResolve settled it
   * (it refuses a stray resolve, so this never runs without a robbery). It reads the outcome the
   * rules applied, never the Duel result again, so her line always matches the loot or the cell even
   * when the result's `wins` and `beats` disagree: a win leaves you free at the robbery's 24:00
   * (B-11b `clock`); a loss jails you and runs the arrest night (B-11c), which ends at 08:00.
   */
  SR.def.fn('store.deeReacts', function (s) {
    var win = !s.jail && s.clock.min === SR.tuning.crime.store.clock;
    return { toasts: [{ key: win ? 'bark.dee.robWin' : 'bark.dee.robLose', vars: {}, kind: 'info' }] };
  });

  // ---- Dee's greeting (UI §5.6: by first visit, time, karma, weather, job; robbery reactions) ----

  // Presentation thresholds of the greeting, not balance (CONTRACT D49).
  var MORNING_BEFORE = 660;   // "morning" before 11:00
  var LATE_FROM = 1320;       // "late" from 22:00

  /** @returns {number} the Heat at which Dee hears sirens: the wanted posters' threshold (B-11d, 50). */
  function hotHeat() {
    var P = SR.tuning.crime && SR.tuning.crime.police;
    return P && typeof P.posters === 'number' ? P.posters : Infinity;
  }

  /**
   * The card's greeting (CONTRACT §15.4 `greet.<building>`): the first match wins. Dee remembers a
   * robbery (records.robberies) and notices a loaded gun (the robbery's requirement, B-11b).
   * @returns {{key: string}}
   */
  SR.def.fn('greet.store', function (s) {
    var tier = SR.rules.stats.tier(s.stats.karma), min = s.clock.min, req = SR.tuning.crime.store.requires;
    var key;
    if (s.records.robberies > 0 && s.stats.heat > 0) key = 'robbed';
    else if (s.records.robberies > 0) key = 'forgiven';
    else if ((s.items.gun || 0) >= req.gun && (s.items.ammo || 0) >= req.ammo) key = 'armed';
    else if (s.clock.day === 1) key = 'first';
    else if (s.stats.heat >= hotHeat()) key = 'hot';
    else if (SR.features.weather && s.world && s.world.weather === 'rain') key = 'rain';
    else if (tier === 'good' || tier === 'angelic') key = 'good';
    else if (tier === 'bad' || tier === 'wicked') key = 'bad';
    else if (min < MORNING_BEFORE) key = 'morning';
    else if (min >= LATE_FROM) key = 'late';
    else key = 'default';
    return { key: 'greet.store.' + key };
  });
})();
