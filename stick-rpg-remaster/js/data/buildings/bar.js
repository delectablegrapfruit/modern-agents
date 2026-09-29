// js/data/buildings/bar.js — owner: W2-Night. Sticky's: the building, its actions and their
// :resolve actions (GDD §6.1, §4.12, §4.13; BALANCE B-03 `beer`, B-06 `booze`, B-13, B-14f).
//   P0: Drink a beer (CHA +2, Buzz +1; Sticky cuts you off at Buzz 5), Buy a bottle to go (the
//       "booze" commodity), Start a bar fight (the 12-regular ladder: fight.start / fight.resolve;
//       the engine's Auto is the Quick fight), Darts practice (casino.dartsPractice; +1 CHA the
//       first game each day).
//   P1 (`nightlife`): the Underground Ring bout (Saturdays, champions only). Mingle, Open Mic, darts
//       matches and the Classic cabinet are W3-Nightlife's.
// Every number is read from SR.tuning at call time through the small named fns below (a cost field
// or an effect argument may name a fn: CONTRACT §8.2, §8.9), so data never repeats a BALANCE value
// and the load-time rule holds (nothing reads a registry while the file loads).
// Proprietor: Sticky (the barkeep). Greetings: the named fn greet.bar (UI §5.6; fight gossip).
// Pure data and named fns (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // Greeting thresholds (UI §5.6 flavour, not balance): a reputation after this many wins, late
  // night and the lunch hour. The karma tiers (B-04b Good / Bad) and the ladder's length (B-13) are
  // SR.tuning's, read when Sticky speaks.
  var FEARED_WINS = 6, LATE_FROM = 22 * 60, LATE_TO = 4 * 60, LUNCH = [11 * 60, 14 * 60];

  /** @returns {*} the value at a dotted path of SR.tuning (read at call time). */
  function tune(path) {
    var v = SR.tuning;
    String(path).split('.').forEach(function (k) { v = v === undefined || v === null ? undefined : v[k]; });
    return v;
  }
  /** Registers a named fn returning a tuning number: a cost field or effect argument names it. */
  function tuned(name, path) {
    SR.def.fn(name, function () { return Number(tune(path)) || 0; });
  }

  // B-03 beer · B-06 booze · B-13 startCost · B-14f practice (and the ring's 3 h, P1).
  tuned('bar.beerCash', 'training.beer.cash');
  tuned('bar.beerMin', 'training.beer.min');
  tuned('bar.beerBuzz', 'training.beer.buzz');
  tuned('bar.bottleCash', 'items.booze.price');
  tuned('bar.fightMin', 'fight.startCost.min');
  tuned('bar.dartsMin', 'casino.darts.practice.min');
  tuned('bar.ringMin', 'fight.ring.min');

  /**
   * Condition: Sticky pours while Buzz is below the cut-off (B-03 beer `buzzBelow`: 5; GDD §4.2).
   * @returns {{ok: boolean, reason: (string|null), vars: object}}
   */
  SR.def.fn('bar.canDrink', function (s) {
    var cap = Number(tune('training.beer.buzzBelow')) || 0;
    return (s.stats.buzz || 0) < cap ? { ok: true, reason: null, vars: {} } : { ok: false, reason: 'reason.tooBuzzed', vars: { n: cap } };
  });

  /**
   * Condition: room for one more of an item (B-06 `stack`; bottles stack to 999).
   * @returns {{ok: boolean, reason: (string|null), vars: object}}
   */
  SR.def.fn('bar.canCarry', function (s, params, ctx, key) {
    var row = tune('items.' + key) || {}, max = row.stack > 0 ? row.stack : Infinity;
    var have = Number(s.items[key]) || 0;
    return have < max ? { ok: true, reason: null, vars: {} } : { ok: false, reason: 'reason.stackFull', vars: { max: max } };
  });

  /**
   * Effect: the `buy` rule event of a purchase here with the price actually paid (after the B-28a
   * modifiers: Friday, the Regular perk, Beer Subsidy).
   * @returns {object} a partial Result
   */
  SR.def.fn('bar.bought', function (s, params, ctx, item) {
    var price = ctx && ctx.cost ? ctx.cost.cash : 0;
    return { events: [{ name: 'buy', payload: { item: item, n: 1, where: 'bar', price: price } }] };
  });

  /**
   * Effect of bar.darts:resolve: the practice round's score as a toast (practice is prizeless and
   * its +1 CHA was given at the start, B-14f). A result without a score (an early exit) says nothing.
   * @returns {object} a partial Result
   */
  SR.def.fn('bar.dartsDone', function (s, params) {
    var n = Math.max(0, Math.floor(Number(params && params.score) || 0));
    if (!params || params.score === undefined || params.exited) return {};
    var best = n >= (Number(tune('casino.darts.match.regular.target')) || Infinity);   // the Regular's mark (B-14f): worth a whistle
    return { toasts: [{ key: best ? 'toast.bar.dartsBest' : 'toast.bar.darts', vars: { n: n }, kind: 'info' }] };
  });

  /**
   * The greeting (UI §5.6; GDD §6.2 "fight gossip in greetings"): the champion, a wall of wins, the
   * last man you beat telling tales, Buzz, karma, the hour; else one of the plain lines.
   * @returns {{key: string, vars: object}}
   */
  SR.def.fn('greet.bar', function (s, params, ctx) {
    var won = (s.fight && s.fight.won) || 0, min = s.clock.min, k = s.stats.karma;
    var good = Number(tune('karma.tiers.good')), bad = Number(tune('karma.tiers.bad')), rungs = Number(tune('fight.ladder.n')) || won;
    var pick = function (list) { return list[ctx && ctx.rng ? ctx.rng.int(0, list.length - 1) : 0]; };
    if (s.fight && s.fight.champion) return { key: 'greet.bar.champ', vars: {} };
    if ((s.stats.buzz || 0) >= (Number(tune('training.beer.buzzBelow')) || 5) - 1) return { key: 'greet.bar.buzzed', vars: {} };
    if (won >= FEARED_WINS) return { key: 'greet.bar.feared', vars: {} };
    if (won > 0 && ctx && ctx.rng && ctx.rng.chance(0.5)) {
      var beaten = SR.registry.entries('fighter').map(function (e) { return e.def; }).filter(function (d) { return d.ladder && d.n === Math.min(rungs, won); })[0];
      if (beaten && SR.text.has(beaten.name)) return { key: 'greet.bar.gossip', vars: { name: SR.text(beaten.name) } };
    }
    if (won === 0 && s.clock.day <= 3) return { key: 'greet.bar.fresh', vars: {} };
    if (!isNaN(good) && k >= good) return { key: 'greet.bar.saint', vars: {} };
    if (!isNaN(bad) && k <= bad) return { key: 'greet.bar.rough', vars: {} };
    if (min >= LATE_FROM || min < LATE_TO) return { key: 'greet.bar.late', vars: {} };
    if (min >= LUNCH[0] && min < LUNCH[1] && ctx && ctx.rng && ctx.rng.chance(0.5)) return { key: 'greet.bar.noon', vars: {} };
    if (min < LUNCH[0]) return { key: pick(['greet.bar.3', 'greet.bar.1']), vars: {} };
    return { key: pick(['greet.bar.1', 'greet.bar.2', 'greet.bar.4']), vars: {} };
  });

  SR.def.building('bar', {
    name: 'place.bar', owner: 'sticky', portrait: 'sticky', music: 'last_call_shuffle', interior: 'bar',
    exteriorId: 'bar', groups: ['train', 'buy', 'special'],
    greetings: ['greet.bar.1', 'greet.bar.2', 'greet.bar.3', 'greet.bar.4'],
  });

  // ---- P0 rows ---------------------------------------------------------------------------------

  // Drink a beer (B-03 `beer`: $20, 60 m, CHA +2 through training.apply (the degree bonus and
  // Winded apply), Buzz +1; refused at Buzz 5: "You've had enough for tonight").
  SR.def.action('bar.beer', {
    building: 'bar', group: 'train', order: 10, icon: 'beer', label: 'act.bar.beer', desc: 'desc.bar.beer', p: 0,
    cost: { cash: 'bar.beerCash', min: 'bar.beerMin' }, priceTarget: 'item.bar.beer',
    requires: [['fn', 'bar.canDrink']],
    effects: [['fn', 'training.apply', 'beer'], ['buzz', 'bar.beerBuzz'], ['fn', 'bar.bought', 'beer'], ['sfx', 'drink'], ['anim', 'drink']],
    repeatable: true,
  });

  // Buy a bottle of beer to go (B-06 `booze`: $30, no time, stack 999; the smuggling commodity and
  // Harold's gift).
  SR.def.action('bar.bottle', {
    building: 'bar', group: 'buy', order: 10, icon: 'bottle', label: 'act.bar.bottle', desc: 'desc.bar.bottle', p: 0,
    cost: { cash: 'bar.bottleCash' }, priceTarget: 'item.bar.bottle',
    requires: [['fn', 'bar.canCarry', 'booze']],
    effects: [['item', 'booze', 1], ['fn', 'bar.bought', 'booze'], ['sfx', 'glass_clink']],
    repeatable: true,
  });

  // Start a bar fight (B-13: 3 h, -2 karma, +5 Heat; the ladder opponent n = fights won + 1). The
  // damage it can bring is involuntary (cause 'fight'), so no hpAbove (CONTRACT §8.2).
  SR.def.action('bar.fight', {
    building: 'bar', group: 'special', order: 10, icon: 'barfight', label: 'act.bar.fight', desc: 'desc.bar.fight', p: 0,
    cost: { min: 'bar.fightMin' },
    effects: [['fn', 'fight.start', 'bar']],
  });
  SR.def.action('bar.fight:resolve', {
    building: 'bar', p: 0, timeRule: 'free',
    effects: [['fn', 'fight.resolve', 'bar']],
  });

  // Darts practice (B-14f `practice`: 30 m, +1 CHA the first game each day, no stake).
  SR.def.action('bar.darts', {
    building: 'bar', group: 'train', order: 20, icon: 'darts', label: 'act.bar.darts', desc: 'desc.bar.darts', p: 0,
    cost: { min: 'bar.dartsMin' },
    effects: [['fn', 'casino.dartsPractice']],
  });
  SR.def.action('bar.darts:resolve', {
    building: 'bar', p: 0, timeRule: 'free',
    effects: [['fn', 'bar.dartsDone']],
  });

  // ---- P1 rows (`nightlife`) -------------------------------------------------------------------

  // The Underground Ring (B-13 `ring`): Saturdays, champions only, one bout a day, 3 h.
  SR.def.action('bar.ring', {
    building: 'bar', group: 'special', order: 20, icon: 'ring', label: 'act.bar.ring', desc: 'desc.bar.ring', p: 1, feature: 'nightlife',
    cost: { min: 'bar.ringMin' },
    requires: [['fn', 'fight.canStart', 'ring']],
    effects: [['fn', 'fight.start', 'ring']],
  });
  SR.def.action('bar.ring:resolve', {
    building: 'bar', p: 1, feature: 'nightlife', timeRule: 'free',
    effects: [['fn', 'fight.resolve', 'ring']],
  });
})();
