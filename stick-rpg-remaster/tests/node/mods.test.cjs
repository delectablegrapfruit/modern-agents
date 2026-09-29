// tests/node/mods.test.cjs — owner: W2-RulesE (W1-R in wave 1). Price and check modifiers (ARCHITECTURE §6.10; BALANCE
// B-28a, B-28b): the stacking order, the B-28a examples (Friday beer with Regular under Beer Subsidy
// = $10; fries to go as an employee with a flyer coupon = $7, coupon consumed), and the B-28b rows
// (Relaxed touches only its listed checks).
//   node tests/node/mods.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('mods');
const SR = K.load();
K.fixtures(SR);
const price = (s, base, target, params) => SR.rules.act.price(s, base, target, { params: params || {} });
const Ch = SR.rules.check;

T.section('globs');
{
  const m = Ch.match;
  T.eq([m('food.mcsticks.*', 'food.mcsticks.fries'), m('food.mcsticks.*', 'food.store.nachos'), m('food.mcsticks.*', 'food.mcsticks')],
    [true, false, false], 'a trailing * needs at least one more segment');
  T.eq([m('holdup.*', 'holdup.store.str'), m('holdup.*.str', 'holdup.bank.str'), m('holdup.*.str', 'holdup.bank.cha'), m('police.talk', 'police.talk')],
    [true, true, false, true], 'a trailing * matches the rest; a middle * one segment; plain names match exactly');
  T.ok(!Ch.matchAny(['catalogue.*'], 'catalogue.sportscar', ['catalogue.sportscar']), 'except removes a target');
}

T.section('B-28a: the examples');
{
  // A Friday (day 5) beer with the Regular perk under the Beer Subsidy decree: min(20, 15, 15, 10) = $10.
  const s = K.newState(SR);
  s.clock.day = 5;
  T.eq(price(s, 20, 'item.bar.beer').price, 20, 'a beer is $20 with nothing on');
  SR.features.calendar = true;
  T.eq(price(s, 20, 'item.bar.beer').price, 15, 'Friday: $15');
  SR.features.perks = true;
  s.perks.owned = ['regular'];
  s.clock.day = 4;
  T.eq(price(s, 20, 'item.bar.beer').price, 15, 'the Regular perk on a Thursday: $15');
  s.clock.day = 5;
  s.election.decrees = ['beerSubsidy'];
  const b = price(s, 20, 'item.bar.beer');
  T.eq(b.price, 10, 'Friday + Regular + Beer Subsidy = $10 (fixed prices: the minimum wins)');
  T.eq(b.applied, ['beerSubsidy'], 'the applied fixed price is the one that set the minimum');
  const pv = SR.rules.act.preview(s, 'testbld.beer', {}, K.ctx(SR));
  T.eq([pv.cost.cash, pv.badges], [10, ['beerSubsidy']], 'the beer row previews $10 with its badge');
  SR.features.calendar = false; SR.features.perks = false;

  // Fries to go as an employee (a Fry Cook) with a flyer coupon: (12 + 2) × 0.5 = $7, the coupon used up.
  SR.features.shopsPlus = true;
  const f = K.newState(SR);
  T.eq(f.job.ranks.mcsticks, 'cook', 'a new character is a McSticks employee');
  T.eq(price(f, 12, 'food.mcsticks.fries').price, 9, 'fries for an employee: 12 × 0.75 = $9');
  const day1 = SR.rules.act.preview(K.newState(SR), 'testbld.fries', {}, K.ctx(SR));
  T.eq([day1.cost.cash, day1.badges], [9, ['employee']],
    'day 1 (the BUILD_PLAN §3.12 slice): the starting Fry Cook pays $9 for fries (lead decision: BALANCE B-28a wins over the slice text\'s $12)');
  T.eq(price(f, 12, 'food.mcsticks.fries', { variant: 'takeout' }).price, 11, 'to go: (12 + 2) × 0.75 = 10.5 → $11 (half up)');
  f.items.coupon = 1;
  const t = price(f, 12, 'food.mcsticks.fries', { variant: 'takeout' });
  T.eq([t.price, t.applied, t.consumes], [7, ['takeout', 'flyerCoupon'], { id: 'flyerCoupon', item: 'coupon', n: 1 }],
    'to go with a coupon: (12 + 2) × 0.5 = $7; the coupon, not the employee discount, applies');
  f.money.cash = 100;
  const r = SR.rules.act.run(f, 'testbld.takeoutFries', { variant: 'takeout' }, K.ctx(SR));
  T.eq([r.ok, f.money.cash, f.items.coupon, f.items.takeout], [true, 93, 0, ['fries']], 'buying it costs $7 and uses the coupon up');
  const again = price(f, 12, 'food.mcsticks.fries', { variant: 'takeout' });
  T.eq([again.price, again.consumes], [11, null], 'without the coupon the employee discount is back');
  SR.features.shopsPlus = false;
  T.eq(SR.rules.act.preview(f, 'testbld.takeoutFries', { variant: 'takeout' }, K.ctx(SR)).hidden, true, 'the takeout row hides while shopsPlus is off');
}

T.section('B-28a: order and edge cases');
{
  const s = K.newState(SR);
  s.job.ranks.mcsticks = null;
  T.eq(price(s, 12, 'food.mcsticks.fries').price, 12, 'no McSticks job: full price');
  s.items.coupon = 1;
  SR.features.calendar = true;
  s.world.cityEvent = { id: 'burgerDay', day: s.clock.day };
  const tie = price(s, 12, 'food.mcsticks.fries');
  T.eq([tie.price, tie.applied, tie.consumes], [6, ['burgerDay'], null], 'Burger Day and the coupon tie at 50 %: the coupon is kept');
  s.world.cityEvent = null;
  s.clock.day = 5;
  s.election.decrees = ['freeFriesFriday'];
  const free = price(s, 12, 'food.mcsticks.fries');
  T.eq([free.price, free.consumes], [0, null], 'Free Fries Friday: $0 and the coupon is not wasted');
  s.clock.day = 4;
  T.eq(price(s, 50, 'food.mcsticks.tripleburger').price, 20, 'Thursday triple burger: the fixed $40 first, then the coupon halves it: $20');
  s.election.decrees = [];
  s.items.coupon = 0;
  s.clock.day = 3;
  T.eq(price(s, 20, 'class.biz').price, 10, 'Wednesday classes: $10');
  T.eq(price(s, 20, 'class.biz', {}).applied, ['wedClasses'], 'the Wednesday badge');
  SR.features.calendar = false;
  T.eq(price(s, 20, 'class.biz').price, 20, 'no Wednesday price while calendar is off');

  SR.features.karmaTiers = true; SR.features.perks = true;
  s.stats.karma = 60;
  s.perks.owned = ['couponClipper'];
  const k = price(s, 400, 'item.pawn.gun');
  T.eq([k.price, k.applied.length], [360, 1], 'the Good tier and Coupon Clipper (10 % each) never stack');
  s.stats.karma = -60;
  T.eq(price(s, 400, 'product.red').price, 360, 'Bad tier: Red charges 10 % less');
  SR.features.karmaTiers = false; SR.features.perks = false;
  s.stats.karma = 0;

  SR.features.homesPlus = true;
  T.eq(price(s, 500, 'catalogue.bed').price, 550, 'catalogue delivery: × 1.10');
  T.eq(price(s, 60000, 'catalogue.sportscar').price, 60000, 'but not on the sports car');
  SR.features.homesPlus = false;

  SR.features.arcs = true;
  const wk = [];
  for (let d = 1; d <= 28; d++) { s.clock.day = d; wk.push(price(s, 400, 'product.red').price); }
  T.ok(wk.every((p) => p >= 360 && p <= 440), "Red's weekly factor stays in 0.90..1.10");
  T.ok([0, 7, 14, 21].every((i) => wk.slice(i, i + 7).every((p) => p === wk[i])), 'and holds for a whole week');
  SR.features.arcs = false;
  s.npc.dealer.turnedInDay = 9;
  T.eq(price(s, 400, 'product.red').price, 460, 'New Guy: × 1.15 once Red was turned in');
  s.npc.dealer.turnedInDay = 0;

  T.eq(price(s, 25, 'food.store.x').price, 25, 'a target without modifiers keeps its price');
  s.job.ranks.mcsticks = 'cook';
  T.eq(price(s, 2, 'food.mcsticks.x').price, 2, '2 × 0.75 = 1.5 rounds half up to $2');
  T.eq(price(s, 25, 'food.mcsticks.cheeseburger').price, 19, '25 × 0.75 = 18.75 → $19');
  T.eq(price(s, 0, 'food.mcsticks.fries').price, 0, 'a free item stays free');
}

T.section('B-28b: the check formula');
{
  const s = K.newState(SR);
  const c = (stat, D, id) => Ch.chance(stat, D, { s, checkId: id });
  T.eq([c(50, 60, 'holdup.store.cha'), c(100, 60, 'holdup.store.cha'), c(300, 60, 'holdup.store.cha')].map((p) => Math.round(p * 1000) / 1000),
    [0.455, 0.625, 0.833], 'B-11b reference beats: CHA 50 → 45 %, 100 → 62.5 %, 300 → 83 %');
  T.eq([c(0, 50, 'x'), c(1e6, 1, 'x')], [0.05, 0.95], 'clamped to 0.05..0.95');
  T.eq(Ch.chance(100, 60), 0.625, 'without a state, no modifiers');
  T.eq(Ch.roll({ float: () => 0.6 }, 0.625), true, 'roll passes below p');
  T.eq(Ch.roll({ float: () => 0.625 }, 0.625), false, 'and fails at p');
}

T.section('B-28b: Relaxed touches only its listed checks');
{
  const s = K.newState(SR, { difficulty: 'relaxed' });
  const n = K.newState(SR);
  const base = (id) => Ch.chance(100, 100, { s: n, checkId: id });
  const rel = (id) => Ch.chance(100, 100, { s: s, checkId: id });
  const touched = ['holdup.store.str', 'holdup.store.cha', 'holdup.bank.int', 'police.talk', 'enc.mugger.fight', 'enc.mugger.run', 'enc.pickpocket', 'enc.cat', 'enc.jogger', 'enc.puddle'];
  const untouched = ['trade.haggle', 'tour.hook.cha', 'duel.debate.int', 'duel.interview.cha', 'duel.interrogation.str', 'duel.boardroom.int', 'park.chess', 'campaign.kissBabies', 'campaign.intimidate', 'shift.event.copier'];
  T.ok(touched.every((id) => Math.abs(rel(id) - base(id) - 0.10) < 1e-12), 'Relaxed adds +0.10 to hold-up beats, police Talk and every encounter check');
  T.ok(untouched.every((id) => rel(id) === base(id)), 'and nothing to haggling, the tour hook, the other Duels, chess, the campaign or shift events');
  s.stats.cha = 900;
  T.eq(Ch.chance(900, 60, { s, checkId: 'holdup.store.cha' }), 0.95, 'the Relaxed bonus still clamps at 0.95');
}

T.section('B-28b: perk and tier rows');
{
  const s = K.newState(SR);
  SR.features.perks = true;
  s.perks.owned = ['intimidating', 'fastTalker', 'smoothTalker', 'crowdPleaser'];
  T.eq(Ch.chance(100, 60, { s, checkId: 'holdup.store.str' }), 100 / 140, 'Intimidating: hold-up STR beats use D - 20');
  T.eq(Ch.chance(100, 60, { s, checkId: 'holdup.store.cha' }), 0.625, 'but not the CHA beat');
  T.eq(Ch.chance(100, 90, { s, checkId: 'police.talk' }), 100 / 150, 'Fast Talker: police Talk uses D - 40');
  T.eq(Ch.chance(1, 30, { s, checkId: 'police.talk' }), 0.5, 'D never drops below 1 (30 - 40 → 1: 1 / 2)');
  T.eq(Ch.chance(150, 150, { s, checkId: 'trade.haggle' }), 0.6, 'Smooth Talker: haggling +0.10');
  T.eq(Ch.chance(1, 150, { s, checkId: 'tour.hook.int' }), 1, 'Crowd Pleaser: the tour hook always succeeds');
  T.eq(Ch.mods(s, 'tour.hook.int').map((r) => r.id), ['crowdPleaser'], 'mods() lists the applicable rows');
  SR.features.perks = false;
  T.eq(Ch.chance(1, 150, { s, checkId: 'tour.hook.int' }), 0.05, 'perks do nothing while their flag is off');
  s.stats.karma = -60;
  T.eq(Ch.chance(100, 60, { s, checkId: 'holdup.bank.cha' }), 0.625, 'the Bad tier needs karmaTiers');
  SR.features.karmaTiers = true;
  T.eq(Ch.chance(100, 60, { s, checkId: 'holdup.bank.cha' }), 0.775, 'Bad tier: +0.15 on hold-up beats');
  T.eq(Ch.chance(100, 60, { s, checkId: 'police.talk' }), 0.625, 'and nothing else');
  SR.features.karmaTiers = false;

  // The check effect in the pipeline uses the same rows: chess (park.chess, D 150) checks INT after
  // its own +1 INT effect, so INT 150 checks at 151 / 301; Relaxed leaves it alone.
  const at = (difficulty) => { const t = K.newState(SR, { difficulty }); t.stats.int = 150; return SR.rules.act.preview(t, 'testbld.chess', {}, K.ctx(SR)).chance; };
  T.eq([at('relaxed'), at('standard')], [151 / 301, 151 / 301], 'the chess preview shows its chance, untouched by Relaxed');
}

T.done();
