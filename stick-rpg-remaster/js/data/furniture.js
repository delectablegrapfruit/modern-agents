// js/data/furniture.js — owner: W1-E. SR.def.furniture: the furniture of BALANCE B-08b (GDD §4.15).
// A def carries a piece's structure: its tier, the tier-1 piece it upgrades (`base`), its upgrade,
// the stat it trains at night, the interior draw id and the text keys. The state keys owned pieces
// by their tier-1 id (`furniture.owned.bed = 2` means the Hibernation Pod), so a tier-2 def names
// its `base`. Every number (price, slots, sleep bonus, nightly gain) lives in
// SR.tuning.furniture.<id>; a prio-20 boot hook copies price and slots onto the defs for display.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  function piece(id, def) { SR.def.furniture(id, def); }

  // Tier 1 (P0; the aquarium is P2). `draw` names the piece for js/art/interiors/home.js.
  piece('bed', { name: 'furn.bed', tier: 1, base: 'bed', upgrade: 'pod', stat: null, sleep: true,
    icon: 'bed', draw: 'bed', order: 1, p: 0 });
  piece('tv', { name: 'furn.tv', tier: 1, base: 'tv', upgrade: 'skydish', stat: null,
    icon: 'tv', draw: 'tv', order: 2, p: 0 });
  piece('pc', { name: 'furn.pc', tier: 1, base: 'pc', upgrade: 'workstation', stat: null,
    icon: 'pc', draw: 'pc', order: 3, p: 0 });
  piece('books', { name: 'furn.books', tier: 1, base: 'books', upgrade: 'library', stat: 'int',
    icon: 'books', draw: 'books', order: 4, p: 0 });
  piece('treadmill', { name: 'furn.treadmill', tier: 1, base: 'treadmill', upgrade: 'homegym', stat: 'str',
    icon: 'treadmill', draw: 'treadmill', order: 5, p: 0 });
  piece('freezer', { name: 'furn.freezer', tier: 1, base: 'freezer', upgrade: null, stat: null, sleep: true,
    icon: 'freezer', draw: 'freezer', order: 6, p: 0 });
  piece('minibar', { name: 'furn.minibar', tier: 1, base: 'minibar', upgrade: 'lounge', stat: 'cha',
    icon: 'minibar', draw: 'minibar', order: 7, p: 0 });
  piece('aquarium', { name: 'furn.aquarium', tier: 1, base: 'aquarium', upgrade: null, stat: null,
    icon: 'aquarium', draw: 'aquarium', order: 8, p: 2, feature: 'aquarium' });

  // The P0 satellite: a separate piece with no slot that needs the TV (GDD §4.15 note). In P1 the
  // SkyDish becomes the TV's tier 2; the v2 save migration turns an owned satellite into it.
  piece('satellite', { name: 'furn.satellite', tier: 1, base: 'satellite', upgrade: null, stat: null,
    needs: 'tv', icon: 'skydish', draw: 'satellite', order: 9, p: 0 });

  // Tier 2 (P1 `homesPlus`): replaces the tier-1 piece and credits 50 % of its price (B-08b).
  piece('pod', { name: 'furn.pod', tier: 2, base: 'bed', upgrade: null, stat: null, sleep: true,
    icon: 'pod', draw: 'pod', order: 1, p: 1, feature: 'homesPlus' });
  piece('skydish', { name: 'furn.skydish', tier: 2, base: 'tv', upgrade: null, stat: null,
    icon: 'skydish', draw: 'skydish', order: 2, p: 1, feature: 'homesPlus' });
  piece('workstation', { name: 'furn.workstation', tier: 2, base: 'pc', upgrade: null, stat: null,
    icon: 'workstation', draw: 'workstation', order: 3, p: 1, feature: 'homesPlus' });
  piece('library', { name: 'furn.library', tier: 2, base: 'books', upgrade: null, stat: 'int',
    icon: 'library', draw: 'library', order: 4, p: 1, feature: 'homesPlus' });
  piece('homegym', { name: 'furn.homegym', tier: 2, base: 'treadmill', upgrade: null, stat: 'str',
    icon: 'homegym', draw: 'homegym', order: 5, p: 1, feature: 'homesPlus' });
  piece('lounge', { name: 'furn.lounge', tier: 2, base: 'minibar', upgrade: null, stat: 'cha',
    icon: 'lounge', draw: 'lounge', order: 7, p: 1, feature: 'homesPlus' });

  // Copies the B-08b numbers onto the defs for display (the rules read SR.tuning directly).
  SR.onBoot(20, function () {
    var t = SR.tuning.furniture;
    if (!t) return;
    Object.keys(SR.reg.furniture).forEach(function (id) {
      var row = t[id], def = SR.reg.furniture[id];
      if (!row) return;
      ['price', 'slots'].forEach(function (k) { if (row[k] !== undefined) def[k] = row[k]; });
    });
  }, { headless: true });
})();
