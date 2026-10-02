// js/data/buildings/furniture.js — owner: W2-Goods. Fine Line Furnishings (GDD §4.15, §6.1, §6.2;
// BALANCE B-08b, B-28a): the building and Sofia, the showroom row (`furniture.browse`,
// js/ui/subscreens/furniture.js), the two actions the showroom commits, Sofia's greeting and the
// named fns they use.
//
// Card row: furniture.showroom opens the showroom (the 2-column grid of pieces with price, slots
// and effect; P1: the live preview of the piece in your home). The showroom commits
// furniture.buy ({ piece }: a tier-1 piece or the P0 satellite) and furniture.upgrade ({ piece }:
// a tier-1 piece you own to its tier 2; P1 `homesPlus`). Both run W2-RulesE's
// `homes.buyFurniture` / `homes.upgrade` (slots per home, "Needs a free slot", the satellite
// needing the TV and retired by `homesPlus`, B-28a's `furniture.<id>` modifiers, the 50 % upgrade
// credit), so the rules stay in js/rules/homes.js; neither is ever a card row (hidden without
// params.piece). A bought piece counts from the next night (night steps 6 and 7).
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // The night hours of the greeting: the ClockRing's shaded night, 20:00-06:00 (UI §2.3).
  var NIGHT_FROM = 1200, NIGHT_TO = 360;

  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  SR.def.building('furniture', {
    name: 'place.furniture', owner: 'sofia', portrait: 'sofia', music: 'showroom_smooth', interior: 'furniture',
    exteriorId: 'furniture', groups: ['buy'], greetings: ['greet.furniture.plain'],
  });

  SR.def.action('furniture.showroom', {
    building: 'furniture', group: 'buy', order: 10, icon: 'bed', label: 'act.furniture.showroom', p: 0,
    screen: 'furniture.browse',
  });

  // row: false: never a card row (CONTRACT D62); `hidden` without params.piece also keeps them out
  // of a preview without their object.
  SR.def.action('furniture.buy', {
    building: 'furniture', group: 'buy', order: 20, icon: 'bed', label: 'act.furniture.buy', p: 0, row: false,
    hidden: [['fn', 'furniture.noPiece']],
    effects: [['fn', 'homes.buyFurniture'], ['fn', 'furniture.delivered'], ['sfx', 'purchase']],
  });

  SR.def.action('furniture.upgrade', {
    building: 'furniture', group: 'buy', order: 30, icon: 'pod', label: 'act.furniture.upgrade', p: 1, feature: 'homesPlus', row: false,
    hidden: [['fn', 'furniture.noPiece']],
    effects: [['fn', 'homes.upgrade'], ['fn', 'furniture.delivered'], ['sfx', 'purchase']],
  });

  // ---- named fns --------------------------------------------------------------------------------

  /** Condition (for `hidden`): no piece named, so the showroom's commits are not card rows. */
  SR.def.fn('furniture.noPiece', function (s, params) {
    return params && typeof params.piece === 'string' && params.piece ? no('reason.unavailable') : { ok: true };
  });

  /**
   * Effect: the delivery toast after a purchase or an upgrade: a stat piece trains you from tonight,
   * a bed or freezer restores more on your next sleep, anything else is waiting at home. An upgrade
   * of a piece in storage stays there and does nothing until the home has room (GDD §4.15), so its
   * toast says so instead.
   */
  SR.def.fn('furniture.delivered', function (s, params) {
    var def = SR.reg.furniture[params && params.piece];
    if (!def) return null;
    var base = SR.reg.furniture[def.base] || def;
    var tier = s.furniture.owned[def.base] || 1;
    var id = SR.rules.homes.tierId(def.base, tier);
    var shown = SR.reg.furniture[id] || def;
    var stored = (s.furniture.storage || []).indexOf(def.base) >= 0;
    var kind = stored ? 'stored' : shown.stat ? 'nightly' : shown.sleep || base.sleep ? 'sleep' : 'home';
    return { toasts: [{ key: 'toast.furniture.' + kind, vars: { name: SR.text(shown.name) }, kind: 'info' }] };
  });

  /**
   * Sofia's greeting (UI §5.6: by what you own, your home, karma and time). Returns a key; array
   * keys pick a variant.
   */
  SR.def.fn('greet.furniture', function (s) {
    var H = SR.rules.homes, K = SR.tuning.karma.tiers;
    var owned = s.furniture && s.furniture.owned ? Object.keys(s.furniture.owned).length : 0;
    if (H && typeof H.freeSlots === 'function' && s.homes && H.freeSlots(s) <= 0) return { key: 'greet.furniture.full' };
    if (!owned) return { key: 'greet.furniture.empty' };
    if (s.homes && s.homes.living === 'castle') return { key: 'greet.furniture.castle' };
    if (s.stats && s.stats.karma <= K.bad) return { key: 'greet.furniture.evil' };
    if (s.clock && (s.clock.min >= NIGHT_FROM || s.clock.min < NIGHT_TO)) return { key: 'greet.furniture.night' };
    return { key: 'greet.furniture.plain' };
  });
})();
