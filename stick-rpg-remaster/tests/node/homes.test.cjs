// tests/node/homes.test.cjs — owner: W2-RulesE (W1-E in wave 1). SR.rules.homes (BALANCE B-08; GDD §4.15; ARCHITECTURE
// §8.4): buying, moving in, storage, slots ("Needs a free slot"), tier-2 upgrades with the 50 %
// credit, the sleep bonus, TV channels, nightly gains, letting and selling (P1), rent, the home
// perk only for the home you live in, door homes, and net-worth values.
//   node tests/node/homes.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('homes (W1-E)');
const SR = H.boot();
const M = SR.rules.homes;

T.section('doors and defs');
{
  T.eq(M.doorHomes('home_apt'), ['apt', 'apt2'], 'Paperview holds the apartment and the bigger apartment');
  T.eq([M.doorHomes('home_pent'), M.doorHomes('home_mansion'), M.doorHomes('home_castle')], [['pent'], ['mansion'], ['castle']], 'one tier at each other door');
  T.eq(M.doorHomes('mcsticks'), [], 'a non-home door has none');
  T.ok(Object.keys(SR.reg.home).every((id) => SR.reg.home[id].door === SR.tuning.homes[id].door), 'defs and B-08a agree on doors');
  T.eq(SR.reg.home.castle.price, 500000, 'the boot hook copies the B-08a price onto the def');
  T.eq(SR.reg.furniture.library.slots, 2, '… and the furniture slots');
}

T.section('buying and moving in');
{
  const s = H.state(SR, { money: { cash: 4000, bank: 7000 } });
  const r = M.buy(s, 'apt2');
  T.eq([r.ok, r.price, s.money.cash, s.money.bank], [true, 10000, 0, 1000], 'bought with cash first, then the bank');
  T.eq(r.log, [{ kind: 'homeBought', vars: { home: 'apt2', name: 'Bigger Apartment' } }], 'the log entry (delivered by the pipeline\'s merge)');
  T.eq(r.events.map((e) => e.name), ['buy', 'home'], 'the `buy` and `home` rule events');
  T.eq([s.homes.owned, s.homes.living], [['apt', 'apt2'], 'apt'], 'buying does not move you in');
  T.eq(M.buy(s, 'apt2').reason, 'reason.owned', 'already yours');
  T.eq(M.buy(s, 'castle').reason, 'reason.needCash', 'not enough money');
  const c = H.state(SR, { money: { cash: 600000 } });
  T.eq(M.buy(c, 'castle').log[0].kind, 'castleBought', 'the castle has its own headline');
  T.eq(M.moveIn(s, 'apt2').ok && s.homes.living, 'apt2', 'move in (free and instant)');
  T.eq(M.moveIn(s, 'apt2').reason, 'reason.livingHere', 'you live here already');
  T.eq(M.moveIn(s, 'pent').reason, 'reason.notOwned', 'you must own it');
}

T.section('slots, storage, upgrades');
{
  const s = H.state(SR, { money: { cash: 100000 } });
  T.eq([M.slots(s), M.slotsUsed(s), M.freeSlots(s)], [3, 0, 3], 'the apartment has 3 slots');
  ['bed', 'tv', 'pc'].forEach((id) => M.buyFurniture(s, id));
  T.eq(M.slotsUsed(s), 3, 'bed, TV and computer fill it (the original\'s default order)');
  T.eq(M.buyFurniture(s, 'books').reason, 'reason.needSlot', 'a piece that does not fit: "Needs a free slot"');
  T.ok(M.buyFurniture(s, 'satellite').ok && M.slotsUsed(s) === 3, 'the P0 satellite takes no slot');
  const t = H.state(SR, { money: { cash: 10000 } });
  T.eq(M.buyFurniture(t, 'satellite').reason, 'reason.needPiece', 'the satellite needs the TV');
  T.eq(M.buyFurniture(t, 'aquarium').reason, 'reason.featureOff', 'the aquarium is P2');
  T.eq(M.buyFurniture(t, 'pod').reason, 'reason.noPiece', 'tier-2 pieces are upgrades, not purchases');
  T.eq(M.buyFurniture(t, 'bed', { where: 'catalogue' }).reason, 'reason.featureOff', 'the catalogue is P1');

  // Moving into a smaller home stores what does not fit; a bigger one brings it back.
  const m = H.state(SR, { homes: { owned: ['apt', 'mansion'], living: 'mansion' },
    furniture: { owned: { bed: 1, tv: 1, pc: 1, books: 1, treadmill: 1, freezer: 1, minibar: 1 } } });
  T.eq(M.slotsUsed(m), 7, 'seven pieces in the mansion');
  const mv = M.moveIn(m, 'apt');
  T.eq(m.furniture.storage, ['books', 'treadmill', 'freezer', 'minibar'], 'moving to the apartment stores what does not fit, in display order');
  T.eq(mv.toasts[0].key, 'toast.homes.storage', 'a toast says so');
  T.eq([M.has(m, 'books'), M.has(m, 'bed')], [0, 1], 'a stored piece does nothing');
  M.moveIn(m, 'mansion');
  T.eq(m.furniture.storage, [], 'moving back brings it all out');

  const restore = H.features(SR, { homesPlus: true });
  const u = H.state(SR, { money: { cash: 20000 }, homes: { owned: ['apt', 'apt2'], living: 'apt2' },
    furniture: { owned: { bed: 1, books: 1, tv: 1, pc: 1 } } });
  const up = M.upgrade(u, 'bed');
  T.eq([up.price, u.furniture.owned.bed, u.money.cash], [3750, 2, 16250], 'the Pod: 4,000 - 50 % of 500 = 3,750 (B-08b)');
  T.eq(M.upgrade(u, 'pod').reason, 'reason.maxTier', 'already tier 2');
  T.eq(M.upgrade(u, 'library').ok, true, 'the Grand Library (2 slots) fits the 5-slot apartment with one slot free');
  T.eq([M.slotsUsed(u), u.money.cash], [5, 16250 - 11000], 'net cost 11,000; now 5 of 5 slots');
  const v = H.state(SR, { money: { cash: 90000 }, furniture: { owned: { bed: 1, books: 1, minibar: 1 } } });
  T.eq(M.upgrade(v, 'minibar').reason, 'reason.needSlot', 'an upgrade that needs an extra slot is refused when full');
  T.eq(M.upgrade(v, 'treadmill').reason, 'reason.needPiece', 'upgrading needs the tier-1 piece');
  T.eq(M.buyFurniture(v, 'freezer').reason, 'reason.needSlot', 'full is full');
  const cat = H.state(SR, { money: { cash: 10000 } });
  T.eq(M.buyFurniture(cat, 'bed', { where: 'catalogue' }).price, 550, 'the Workstation catalogue adds 10 % delivery (B-28a)');
  restore();
  T.eq(M.upgrade(H.state(SR, { furniture: { owned: { bed: 1 } } }), 'bed').reason, 'reason.featureOff', 'upgrades are P1');
}

T.section('the sleep bonus, channels, nightly gains');
{
  const s = H.state(SR, { homes: { owned: ['apt', 'castle'], living: 'castle' }, furniture: { owned: { bed: 2, freezer: 1 } } });
  T.eq(M.sleepBonus(s), { bed: 0.2, freezer: 0.05, home: 0.2, total: 0.45 }, 'castle + Pod + freezer (B-07)');
  T.eq(M.sleepBonus(H.state(SR, {})).total, 0, 'the bare apartment');
  T.eq(M.channels(H.state(SR, { furniture: { owned: { tv: 1 } } })), { news: true, fitness: false, dating: false, market: false }, 'the TV: News');
  T.eq(M.channels(H.state(SR, { furniture: { owned: { tv: 1, satellite: 1 } } })), { news: true, fitness: true, dating: true, market: false },
    'the P0 satellite adds Fitness and Dating');
  T.eq(M.channels(H.state(SR, { furniture: { owned: { satellite: 1 } } })).fitness, false, 'the satellite needs the TV');
  const rf = H.features(SR, { stockTips: true });
  T.eq(M.channels(H.state(SR, { furniture: { owned: { tv: 2 } } })).market, true, 'the SkyDish adds Market Watch (with stockTips)');
  rf();
  T.eq(M.channels(H.state(SR, { furniture: { owned: { tv: 2 } } })).market, false, 'no Market Watch while stockTips is off');
  T.eq(M.nightly(H.state(SR, { homes: { owned: ['apt', 'mansion'], living: 'mansion' },
    furniture: { owned: { books: 2, treadmill: 1, minibar: 1, bed: 1 } } })).map((g) => g.stat + g.n),
    ['int4', 'str2', 'cha2'], 'nightly: +4 per tier-2 piece, +2 per tier-1 (B-08b)');
}

T.section('letting, selling, rent (P1 homesPlus)');
{
  const s = H.state(SR, { money: { cash: 0, bank: 0 }, homes: { owned: ['apt', 'apt2', 'pent'], living: 'apt' } });
  T.eq(M.letOut(s, 'pent').reason, 'reason.featureOff', 'letting is P1');
  const restore = H.features(SR, { homesPlus: true });
  T.eq(M.letOut(s, 'pent').rent, 240, 'the penthouse lets for $240 a night (0.6 %)');
  T.eq(M.letOut(s, 'pent').reason, 'reason.let', 'already let');
  T.eq(M.letOut(s, 'apt').reason, 'reason.livingHere', 'not the home you live in');
  T.eq(M.rents(s), [{ id: 'pent', amount: 240 }], 'tonight\'s rent');
  T.ok(M.endLet(s, 'pent').ok && M.rents(s).length === 0, 'end the let');
  M.letOut(s, 'apt2');
  const sold = M.sell(s, 'apt2');
  T.eq([sold.price, s.money.bank, s.homes.owned, s.homes.lets], [9000, 9000, ['apt', 'pent'], {}], 'sell at 90 %, into the bank; the let ends');
  T.eq(M.sell(s, 'apt').reason, 'reason.livingHere', 'not the home you live in');
  M.moveIn(s, 'pent');
  T.eq(M.sell(s, 'apt').reason, 'reason.cantSell', 'the free apartment cannot be sold');
  M.letOut(s, 'apt');
  T.eq(M.letOut(H.state(SR, { homes: { owned: ['apt', 'pent'], living: 'pent' } }), 'apt').reason, 'reason.cantLet', 'or let');
  restore();
}

T.section('the home perk belongs to the home you live in');
{
  const s = H.state(SR, { homes: { owned: ['apt', 'apt2', 'mansion', 'castle'], living: 'mansion' } });
  T.eq(M.perk(s), { home: 'mansion', id: 'swim', action: 'home.swim' }, 'owning four homes gives only the lived-in home\'s perk');
  const rf = H.features(SR, { homesPlus: true });
  T.eq(SR.reg.fn['homes.perkHere'](s, { homeId: 'castle' }, {}).reason, 'reason.notLivingHere', 'another home\'s perk is refused');
  T.eq(SR.reg.fn['homes.perkHere'](s, { homeId: 'mansion' }, {}).ok, true, 'the lived-in home\'s perk is available');
  s.stats.hp = 5;
  const str0 = s.stats.str, u = M.usePerk(s);
  T.eq([u.perk, s.stats.str - str0, s.stats.hp, s.daily.homePerk], ['swim', 2, 15, 1], 'Swim: +2 STR, +10 HP (B-08a), the day\'s perk used');
  T.eq(SR.reg.fn['homes.perkHere'](s, { homeId: 'mansion' }, {}).reason, 'reason.dailyLimit', 'one shared daily.homePerk');
  const p = H.state(SR, { homes: { owned: ['apt', 'pent'], living: 'pent' }, weekly: { party: 1 } });
  T.eq(SR.reg.fn['homes.perkHere'](p, { homeId: 'pent' }, {}).reason, 'reason.weeklyLimit', 'the party is once a calendar week');
  rf();
  T.eq(M.perk(H.state(SR, {})), null, 'the apartment has no perk');
  T.eq(SR.reg.fn['homes.perkHere'](s, { homeId: 'mansion' }, {}).reason, 'reason.featureOff', 'home perks are P1');
}

T.section('net-worth values');
{
  const s = H.state(SR, { homes: { owned: ['apt', 'apt2', 'castle'] }, furniture: { owned: { bed: 2, satellite: 1 }, storage: ['bed'] } });
  T.eq(M.homesValue(s), 9000 + 450000, 'homes at 90 % (the free apartment counts 0)');
  T.eq(M.furnitureValue(s), 1000 + 750, 'furniture at 25 % of the current tier\'s price, storage included');
  T.eq(M.pieces(s).map((p) => p.id + ':' + p.active), ['pod:false', 'satellite:false'], 'pieces with their state (the satellite needs the TV)');
}

T.section('the P0 satellite, removed pieces, the catalogue\'s sports car (review fixes)');
{
  const tv = H.state(SR, { money: { cash: 10000 }, furniture: { owned: { tv: 1 } } });
  T.ok(M.buyFurniture(tv, 'satellite').ok, 'P0: the satellite is sold next to the TV');
  const rf = H.features(SR, { homesPlus: true });
  const t1 = H.state(SR, { money: { cash: 10000 }, furniture: { owned: { tv: 1 } } });
  T.eq(M.buyFurniture(t1, 'satellite').reason, 'reason.unavailable', 'with `homesPlus` the SkyDish upgrade replaces it (GDD §4.15 note)');
  rf();
  const t2 = H.state(SR, { money: { cash: 10000 }, furniture: { owned: { tv: 2 } } });
  T.eq(M.buyFurniture(t2, 'satellite').reason, 'reason.owned', 'never next to a TV already upgraded to the SkyDish');

  // A piece that leaves (a seizure, a donation) frees its slots for what was in storage.
  const st = H.state(SR, { furniture: { owned: { bed: 1, tv: 1, pc: 1, books: 1 }, storage: ['books'] } });
  M.removePiece(st, 'tv');
  T.eq([st.furniture.storage, M.has(st, 'books')], [[], 1], 'a stored piece comes back out when a slot frees up');
  const st2 = H.state(SR, { furniture: { owned: { bed: 1, tv: 1, pc: 1, books: 1 }, storage: ['books'] } });
  M.removePiece(st2, 'books');
  T.eq([Object.keys(st2.furniture.owned).sort(), st2.furniture.storage], [['bed', 'pc', 'tv'], []], 'removing a stored piece changes nothing else');

  const car = H.state(SR, { money: { cash: 70000 } });
  T.eq(M.buyCar(car).reason, 'reason.featureOff', 'the catalogue is P1');
  const rc = H.features(SR, { homesPlus: true });
  const nw0 = SR.rules.endgame.netWorth(car);
  const b = M.buyCar(car);
  const lot = SR.tuning.world.homeLots.sports, sp = car.player.cars.sports;
  T.eq([b.ok, b.price, car.money.cash], [true, 60000, 10000], '$60,000, no delivery markup (B-06, B-28a except)');
  T.eq([sp.owned, sp.bought, sp.x, sp.y], [true, true, (lot[0] + lot[2]) / 2, (lot[1] + lot[3]) / 2], 'delivered to its home lot, bought: true');
  T.eq(SR.rules.endgame.netWorth(car), nw0 - 60000 + 30000, 'net worth counts a bought sports car at $30,000 (B-18)');
  T.eq(b.events[0], { name: 'buy', payload: { item: 'sportscar', n: 1, where: 'catalogue', price: 60000 } }, 'the `buy` rule event');
  T.eq(M.buyCar(car).reason, 'reason.owned', 'one car');
  T.eq(M.buyCar(H.state(SR, { player: { cars: { sports: { owned: true } } }, money: { cash: 1e6 } })).reason, 'reason.owned', 'not after the day-365 gift');
  T.eq(M.buyCar(H.state(SR, { money: { cash: 59999, bank: 1e6 } })).reason, 'reason.needCash', 'paid in cash');
  const g = H.state(SR, { money: { cash: 70000 }, stats: { karma: 60 } });
  const rk = H.features(SR, { karmaTiers: true });
  T.eq(SR.reg.fn['homes.buyCar'](g, {}, {}).price, 54000, 'named fn homes.buyCar; the Good-tier discount applies (B-28a catalogue.*)');
  rk();
  rc();
}

T.done();
