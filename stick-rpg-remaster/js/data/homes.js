// js/data/homes.js — owner: W1-E. SR.def.home: the five homes of BALANCE B-08a (GDD §4.15).
// A def carries the home's identity: its door (the worldmap door id resolved by
// SR.world.doors.resolve through SR.rules.homes.doorHomes), its interior tier, its perk action and
// its text keys. Every number (price, slots, sleep bonus, rent, perk costs) lives in
// SR.tuning.homes.<id>; a prio-20 boot hook copies price, slots and sleep onto each def for display.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // door: `home_apt` holds the tiers apt and apt2 (Paperview, one door; B-08a).
  // interior: the interior id drawn for it (js/art/interiors/home.js picks the art by `tier`).
  // perk: the home perk action (W2-Home, P1 `homesPlus`), or null.
  SR.def.home('apt', {
    name: 'home.apt', place: 'home.apt.place', door: 'home_apt', interior: 'home', tier: 0,
    icon: 'apt', perk: null, order: 1, p: 0,
  });
  SR.def.home('apt2', {
    name: 'home.apt2', place: 'home.apt2.place', door: 'home_apt', interior: 'home', tier: 1,
    icon: 'apt2', perk: 'home.stargaze', order: 2, p: 0,
  });
  SR.def.home('pent', {
    name: 'home.pent', place: 'home.pent.place', door: 'home_pent', interior: 'home', tier: 2,
    icon: 'penthouse', perk: 'home.party', order: 3, p: 0,
  });
  SR.def.home('mansion', {
    name: 'home.mansion', place: 'home.mansion.place', door: 'home_mansion', interior: 'home', tier: 3,
    icon: 'mansion', perk: 'home.swim', order: 4, p: 0,
  });
  SR.def.home('castle', {
    name: 'home.castle', place: 'home.castle.place', door: 'home_castle', interior: 'home', tier: 4,
    icon: 'castle', perk: 'home.holdCourt', order: 5, p: 0,
  });

  // Copies the B-08a numbers onto the defs for display (the rules read SR.tuning directly).
  SR.onBoot(20, function () {
    var t = SR.tuning.homes;
    if (!t) return;
    Object.keys(SR.reg.home).forEach(function (id) {
      var row = t[id], def = SR.reg.home[id];
      if (!row) return;
      ['price', 'slots', 'sleep', 'rent'].forEach(function (k) { if (row[k] !== undefined) def[k] = row[k]; });
    });
  }, { headless: true });
})();
