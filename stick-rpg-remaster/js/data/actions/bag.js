// js/data/actions/bag.js — owner: W2-Pocket. The Bag's actions (GDD §6.4; UI §5.9), run from the
// Pocket's Bag tab (js/ui/pocket/bag.js) through SR.act like any card row:
//   bag.smoke       (P0) smoke a pack: 1 h, +1 CHA, -10 HP, -1 karma; "Too hurt" at HP ≤ 10 (orig;
//                   BALANCE B-03 `smoke`, B-04a `smoke`). The gain goes through training.apply, so
//                   Winded halves it and it stamps like any training.
//   bag.eatTakeout  (P1 `shopsPlus`) eat a McSticks takeout meal from the Bag: 30 m (B-06 takeout
//                   `eatMin`), the meal's own HP (B-06), refused at full HP; raises `eat`.
//   bag.pillToggle  (P0) the caffeine-pill auto-use toggle (free; W2-RulesE's items.pillToggle).
// Give: the Bag's Give runs the street person's own gift action, the one their dialog row runs (the
// person's `gifts` map in js/data/people.js, W2-Street's SR.world.streetnpcs.giveAction), so a gift
// from the Bag and from the dialog are the same action by construction; js/ui/pocket/bag.js
// resolves it. There is no separate bag.give def: it would duplicate the street rows' rules or nest
// the pipeline. Info is the Bag's detail pane (the item's `item.<id>.info` text), not an action.
// Numbers are read at run time by the named fns below (bag.min, bag.hp, bag.karma, bag.takeoutHp).
// Pure data and named fns (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the action id a named fn runs for (its :resolve stripped). */
  function idOf(ctx) { return ctx && ctx.id ? String(ctx.id).replace(/:resolve$/, '') : ''; }

  /** @returns {string|null} the takeout meal the action eats: params.value when held, else the oldest. */
  function meal(s, params) {
    var list = s.items && Array.isArray(s.items.takeout) ? s.items.takeout : [];
    if (params && params.value !== undefined && list.indexOf(params.value) >= 0) return params.value;
    return list.length ? list[0] : null;
  }

  // ---- named fns (CONTRACT §8.5) ------------------------------------------------------------------

  /** Cost: minutes (B-03 smoke `min` 60; B-06 takeout `eatMin` 30). @returns {number} */
  SR.def.fn('bag.min', function (s, params, ctx) {
    var id = idOf(ctx);
    if (id === 'bag.smoke') return SR.tuning.training.smoke.min;
    if (id === 'bag.eatTakeout') return SR.tuning.items.takeout.eatMin;
    return 0;
  });

  /** Cost and the "Too hurt" threshold: the HP a smoke costs (B-03 smoke `hp` 10; orig). @returns {number} */
  SR.def.fn('bag.hp', function (s, params, ctx) {
    return idOf(ctx) === 'bag.smoke' ? SR.tuning.training.smoke.hp : 0;
  });

  /** Effect amount: the karma of a smoke (B-04a `smoke` -1; orig). @returns {number} */
  SR.def.fn('bag.karma', function (s, params, ctx) {
    return idOf(ctx) === 'bag.smoke' ? SR.tuning.karma.changes.smoke : 0;
  });

  /** Effect amount: the HP of the takeout meal eaten (B-06 `hp` of that food). @returns {number} */
  SR.def.fn('bag.takeoutHp', function (s, params) {
    var id = meal(s, params), row = id && SR.tuning.items[id];
    return row && row.hp ? row.hp : 0;
  });

  /**
   * Effect: the eaten meal leaves the Bag and the `eat` rule event names it (after the heal effect,
   * which applies Iron Stomach and the "(full)" note).
   * @returns {object} a partial Result
   */
  SR.def.fn('bag.takeoutEaten', function (s, params) {
    var id = meal(s, params);
    if (id === null) return { ok: false, reason: 'reason.needItem', vars: { item: SR.rules.conditions.nameOf('item', 'takeout'), n: 1, have: 0 } };
    var list = s.items.takeout;
    list.splice(list.indexOf(id), 1);
    var row = SR.tuning.items[id];
    return { events: [{ name: 'eat', payload: { item: 'takeout', hp: row && row.hp ? row.hp : 0, where: 'bag' } }] };
  });

  /**
   * Effect: the pill toggle's toast says what tonight holds (the rules flip clock.pillAuto).
   * @returns {object} a partial Result
   */
  SR.def.fn('bag.pillNote', function (s) {
    return { toasts: [{ key: s.clock.pillAuto ? 'toast.bag.pillOn' : 'toast.bag.pillOff', vars: {}, kind: 'info' }] };
  });

  // ---- actions (building 'bag': never a card row; the Pocket's Bag tab runs them) ---------------

  // Smoke a pack (orig): 1 h, +1 CHA, -10 HP, -1 karma; needs HP > 10.
  SR.def.action('bag.smoke', {
    building: 'bag', group: 'train', order: 10, icon: 'smokes', label: 'act.bag.smoke', desc: 'desc.bag.smoke', p: 0,
    cost: { min: 'bag.min', hp: 'bag.hp', items: { smokes: 1 } },
    requires: [['hpAbove', 'bag.hp']],
    effects: [['fn', 'training.apply', 'smoke'], ['karma', 'bag.karma'], ['sfx', 'smoke']],
    repeatable: true,
  });

  // Eat a takeout meal (P1 shopsPlus): 30 m, the meal's HP, refused at full HP.
  SR.def.action('bag.eatTakeout', {
    building: 'bag', group: 'eat', order: 20, icon: 'takeout', label: 'act.bag.eatTakeout', desc: 'desc.bag.eatTakeout', p: 1, feature: 'shopsPlus',
    cost: { min: 'bag.min' },
    requires: [['item', 'takeout', 1], ['hpBelowMax']],
    effects: [['heal', 'bag.takeoutHp'], ['fn', 'bag.takeoutEaten'], ['sfx', 'eat'], ['anim', 'eat']],
    repeatable: true,
  });

  // The caffeine-pill auto-use toggle (GDD §6.4; free): params.on sets it, else it flips.
  SR.def.action('bag.pillToggle', {
    building: 'bag', group: 'special', order: 30, icon: 'pills', label: 'act.bag.pillToggle', desc: 'desc.bag.pillToggle', p: 0,
    timeRule: 'free',
    effects: [['fn', 'items.pillToggle'], ['fn', 'bag.pillNote'], ['sfx', 'toggle']],
  });
})();
