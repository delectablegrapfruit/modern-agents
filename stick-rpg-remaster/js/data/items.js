// js/data/items.js — owner: W2-RulesE (W1-E in wave 1). SR.def.item: every item of BALANCE B-06 and GDD §6.4 (the Bag).
// A def carries the item's identity: text key, icon, category, where it is sold, whether the Bag
// shows it, its Bag use action and who can be given it. The numbers (price, HP, minutes, stack
// limit) live in SR.tuning.items.<id>; a prio-20 boot hook copies price, stack, hp and min onto
// each def for display (CONTRACT §3.1 lists `price` and `stack` as item fields).
// `key` is the state field that holds the count: state.items.<key> (an array for takeout, scraps,
// diplomas), or 'cars.<type>' for vehicle keys, or null for menu food eaten on the spot.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  function item(id, def) {
    def.name = 'item.' + id;
    def.info = 'item.' + id + '.info';
    if (def.key === undefined) def.key = id;
    if (def.bag === undefined) def.bag = true;
    SR.def.item(id, def);
  }

  // Food: eaten on the spot (30 m; refused at full HP; B-06). Not in the Bag.
  item('milkshake', { icon: 'milkshake', category: 'food', where: 'mcsticks', key: null, bag: false, p: 0 });
  item('fries', { icon: 'fries', category: 'food', where: 'mcsticks', key: null, bag: false, p: 0 });
  item('cheeseburger', { icon: 'burger', category: 'food', where: 'mcsticks', key: null, bag: false, p: 0 });
  item('tripleburger', { icon: 'tripleburger', category: 'food', where: 'mcsticks', key: null, bag: false, p: 0 });
  item('megameal', { icon: 'megameal', category: 'food', where: 'mcsticks', key: null, bag: false, p: 1, feature: 'shopsPlus' });
  item('slushee', { icon: 'slushee', category: 'food', where: 'store', key: null, bag: false, p: 0 });
  item('candybar', { icon: 'candybar', category: 'food', where: 'store', key: null, bag: false, p: 0 });
  item('nachos', { icon: 'nachos', category: 'food', where: 'store', key: null, bag: false, p: 0 });

  // Consumables.
  item('takeout', { icon: 'takeout', category: 'consumable', where: 'mcsticks', use: 'bag.eatTakeout', give: ['harold'],
    p: 1, feature: 'shopsPlus' });
  item('smokes', { icon: 'smokes', category: 'consumable', where: 'store', use: 'bag.smoke', give: ['kid'], p: 0 });
  item('pills', { icon: 'pills', category: 'consumable', where: 'store', use: 'bag.pillToggle', p: 0 });
  item('gum', { icon: 'gum', category: 'consumable', where: 'store', give: ['kid'], p: 1, feature: 'shopsPlus' });
  item('scratch', { icon: 'scratch', category: 'consumable', where: 'store', p: 1, feature: 'shopsPlus' });
  item('paper', { icon: 'paper', category: 'consumable', where: 'store', p: 1, feature: 'stockTips' });
  item('coupon', { icon: 'money', category: 'consumable', where: null, p: 1, feature: 'encounters' });

  // Gear.
  item('knife', { icon: 'knife', category: 'gear', where: 'pawn', p: 0 });
  item('gun', { icon: 'gun', category: 'gear', where: 'pawn', p: 0 });
  item('ammo', { icon: 'ammo', category: 'gear', where: 'pawn', p: 0 });
  item('alarm', { icon: 'alarm', category: 'gear', where: 'pawn', p: 0 });
  item('phone', { icon: 'cellphone', category: 'gear', where: 'pawn', p: 0 });
  item('knuckles', { icon: 'knuckles', category: 'gear', where: 'pawn', p: 1, feature: 'shopsPlus' });
  item('vest', { icon: 'vest', category: 'gear', where: 'pawn', p: 1, feature: 'shopsPlus' });
  // The kid's gift after the first pack (P0); the pawn shop sells a used one in P1 (the action's flag).
  item('skateboard', { icon: 'skateboard', category: 'gear', where: 'pawn', p: 0 });
  item('prodeck', { icon: 'prodeck', category: 'gear', where: null, p: 1, feature: 'arcs' });
  item('shirt', { icon: 'star', category: 'gear', where: 'pawn', give: ['harold'], p: 1, feature: 'arcs' });

  // Commodities (the red-eye's cargo).
  item('booze', { icon: 'bottle', category: 'commodity', where: 'bar', give: ['harold'], p: 0 });
  item('snow', { icon: 'snow', category: 'commodity', where: 'dealer', p: 0 });

  // Keys: the cars live in state.player.cars; the catalogue sale of the sports car is P1 (its action).
  item('junker', { icon: 'car', category: 'key', where: null, key: 'cars.junker', p: 0 });
  item('sportscar', { icon: 'sportscar', category: 'key', where: null, key: 'cars.sports', p: 0 });

  // Documents (P1).
  item('diploma', { icon: 'degree', category: 'document', where: null, key: 'diplomas', p: 1, feature: 'degrees' });
  item('deed', { icon: 'realestate', category: 'document', where: null, key: null, p: 1, feature: 'homesPlus' });
  item('stub', { icon: 'bus', category: 'document', where: null, key: null, p: 1, feature: 'tours' });
  item('scrap', { icon: 'scrap', category: 'document', where: null, key: 'scraps', p: 1, feature: 'scraps' });

  // Copies the B-06 numbers onto the defs for display (the rules read SR.tuning directly).
  SR.onBoot(20, function () {
    var t = SR.tuning.items;
    if (!t) return;
    Object.keys(SR.reg.item).forEach(function (id) {
      var row = t[id], def = SR.reg.item[id];
      if (!row) return;
      ['price', 'stack', 'hp', 'min'].forEach(function (k) { if (row[k] !== undefined) def[k] = row[k]; });
    });
  }, { headless: true });
})();
