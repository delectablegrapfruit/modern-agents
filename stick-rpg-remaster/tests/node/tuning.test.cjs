// tests/node/tuning.test.cjs — owner: W1-R. SR.tuning against BALANCE.md: the 33 frozen table
// names (CONTRACT §3.6), a table of values copied by hand from BALANCE (at least 80, one or more
// from every table B-01 to B-31 that has a tuning path, including each of B-26 to B-31), and the
// numbers BALANCE derives from its tables (slots RTP 92.25 %, scratch EV $3.00, the sleep examples,
// rent and resale, upgrade credits, the fight ladder, the election example, the chain rows).
//   node tests/node/tuning.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('tuning');
const SR = K.load();
const TU = SR.tuning;

function get(path) {
  return path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), TU);
}

T.section('the frozen table names (CONTRACT §3.6)');
{
  const names = ['time', 'start', 'training', 'karma', 'jobs', 'items', 'sleep', 'homes', 'furniture', 'bank', 'stocks', 'crime', 'bus',
    'fight', 'casino', 'world', 'difficulty', 'election', 'endgame', 'weather', 'calendar', 'encounters', 'perks', 'traffic', 'crowd',
    'street', 'park', 'civic', 'priceMods', 'checkMods', 'news', 'duel', 'health'];
  T.eq(Object.keys(TU).sort(), names.slice().sort(), 'exactly the 33 tables');
  T.eq(SR.registry.entries('tuning').every((e) => e.file === 'js/data/tuning.js'), true, 'all registered by js/data/tuning.js');
  T.eq([TU.time.repeatHoldMs, TU.start.hpMaxBase, typeof TU.news.weights, TU.news.minWeight], [350, 15, 'object', 10], 'the fields ARCHITECTURE freezes: time.repeatHoldMs, start.hpMaxBase, news.weights, news.minWeight');
}

// [tuning path, value as BALANCE writes it, the BALANCE table]. Percentages BALANCE writes as
// "x %" are converted here (÷ 100) where tuning.js stores fractions; the row says so.
const TABLE = [
  ['time.stepMin', 30, 'B-01'], ['time.dayEnd', 1440, 'B-01'], ['time.wake', 480, 'B-01'], ['time.alarmMinus', 240, 'B-01'],
  ['time.pillMinus', 240, 'B-01'], ['time.pillRestorePenalty', 20, 'B-01'], ['time.robStartBefore', 1260, 'B-01'],
  ['time.redEyeDeparts', 0, 'B-01'], ['time.tourWindow', [360, 600], 'B-01'], ['time.waitTour', 360, 'B-01'],
  ['time.openMicWindow', [1080, 1440], 'B-01'], ['time.skateContestWindow', [720, 1080], 'B-01'], ['time.tripEndsAt', 1440, 'B-01'],
  ['time.weekStart', 0, 'B-01'], ['time.marketNights', [0, 1, 2, 3, 4], 'B-01'],
  ['start.statRoll', [1, 10], 'B-02'], ['start.extraRoll', [3, 9], 'B-02'], ['start.cash.relaxed', 300, 'B-02'], ['start.cash.standard', 100, 'B-02'],
  ['start.statCap', 999, 'B-02'], ['start.karmaRange', [-100, 100], 'B-02'], ['start.nameMax', 16, 'B-02'], ['start.cheat.stats', 555, 'B-02'],
  ['start.cheat.cash', 10000, 'B-02'],
  ['training.classBiz.gain', 4, 'B-03'], ['training.classBiz.wedCash', 10, 'B-03'], ['training.gym.hp', 4, 'B-03'], ['training.classKin.hp', 6, 'B-03'],
  ['training.seminar.cash', 150, 'B-03'], ['training.seminar.gain', 10, 'B-03'], ['training.seminar.daily', 2, 'B-03'],
  ['training.tvNews.tipReveal', 0.60, 'B-03 (60 %)'], ['training.beer.cash', 20, 'B-03'], ['training.openMic.tipChaDiv', 20, 'B-03'],
  ['training.smoke.hp', 10, 'B-03'], ['training.barFightWin.gain', 3, 'B-03'], ['training.nightFurnitureT2.gain', 4, 'B-03'],
  ['training.degree.classes', 20, 'B-03'], ['training.degree.bonusStat', 25, 'B-03'], ['training.winded.threshold', 0.25, 'B-03 (25 %)'],
  ['training.nap.hpPct', 0.15, 'B-03 (15 %)'],
  ['karma.changes.promotion', 3, 'B-04a'], ['karma.changes.kidDies', -30, 'B-04a'], ['karma.changes.robBank', -20, 'B-04a'],
  ['karma.changes.seizeBank', -30, 'B-04a'], ['karma.tiers.angelic', 80, 'B-04b'], ['karma.tiers.wicked', -80, 'B-04b'],
  ['karma.band.div', 10, 'B-04c'],
  ['jobs.ceo.int', 250, 'B-05'], ['jobs.ceo.cha', 140, 'B-05'], ['jobs.ceo.wage', 300, 'B-05'], ['jobs.vp.shifts', 5, 'B-05'],
  ['jobs.sales.full', 150, 'B-05'], ['jobs.exec.credit', 10000, 'B-05'], ['jobs.manager.shifts', 15, 'B-05'], ['jobs.office.salary', 10000, 'B-05'],
  ['jobs.shift.overtime.payMult', 1.5, 'B-05'], ['jobs.employeeDiscount', 25, 'B-05'], ['jobs.weeklyBonus.ceo', 0.30, 'B-05 (30 %)'],
  ['jobs.rating.alpha', 0.3, 'B-05'], ['jobs.ceoTakeover.bonus', 20000, 'B-05'],
  ['items.fries.price', 12, 'B-06'], ['items.fries.hp', 20, 'B-06'], ['items.tripleburger.thuPrice', 40, 'B-06'], ['items.megameal.hp', 200, 'B-06'],
  ['items.pills.price', 45, 'B-06'], ['items.gun.price', 400, 'B-06'], ['items.ammo.refuseAt', 95, 'B-06'], ['items.vest.price', 900, 'B-06'],
  ['items.snow.price', 400, 'B-06'], ['items.booze.stack', 999, 'B-06'], ['items.pawnBuyback', 0.40, 'B-06 (40 %)'], ['items.sportscar.price', 60000, 'B-06'],
  ['sleep.base', 0.25, 'B-07'], ['sleep.flat', 15, 'B-07'], ['sleep.home.castle', 0.20, 'B-07'], ['sleep.pill', 20, 'B-07'],
  ['homes.castle.price', 500000, 'B-08a'], ['homes.pent.rent', 240, 'B-08a'], ['homes.mansion.slots', 10, 'B-08a'], ['homes.apt2.sell', 9000, 'B-08a'],
  ['furniture.treadmill.price', 3500, 'B-08b'], ['furniture.homegym.price', 15000, 'B-08b'], ['furniture.library.slots', 2, 'B-08b'],
  ['furniture.satellite.price', 3000, 'B-08b'],
  ['bank.interestCap', 25000, 'B-09'], ['bank.tiers.t1', 100000, 'B-09'], ['bank.cd.min', 1000, 'B-09'], ['bank.cd.maxPrincipal', 100000, 'B-09'],
  ['bank.loan.days', 15, 'B-09'], ['bank.default.creditFrozenDays', 60, 'B-09'], ['bank.rateStep.min', 0.25, 'B-09'], ['bank.rateStep.max', 3.5, 'B-09'],
  ['stocks.NLI.start', 30, 'B-10'], ['stocks.SKY.sigma', 0.080, 'B-10 (8.0 %)'], ['stocks.MCS.mu', 0.0020, 'B-10 (+0.20 %)'], ['stocks.fee', 5, 'B-10'],
  ['stocks.spread', 0.005, 'B-10 (0.5 %)'], ['stocks.tip.reliability.max', 0.75, 'B-10'], ['stocks.positionCap.perInt', 100, 'B-10'],
  ['crime.heat.robBank', 60, 'B-11a'], ['crime.store.D.base', 60, 'B-11b'], ['crime.bank.D.base', 400, 'B-11b'], ['crime.bank.loot.base', 3000, 'B-11b'],
  ['crime.store.loot.rand', [0, 499], 'B-11b'], ['crime.jail.bases.bust', 5, 'B-11c'], ['crime.bail.perDayMin', 500, 'B-11c'],
  ['crime.police.bribe.perHeat', 20, 'B-11d'],
  ['bus.cities.crayonburg.ticket', 115, 'B-12a'], ['bus.cities.eraser.mug', 110, 'B-12a'], ['bus.cities.glitter.product', 1.2, 'B-12a'],
  ['bus.bustThreshold.base', 50, 'B-12'], ['bus.offer.product.cap', 600, 'B-12'], ['bus.haggle.bonus', 0.12, 'B-12 (+12 %)'], ['bus.tour.requires.cha', 150, 'B-12'],
  ['fight.ap.max', 15, 'B-13'], ['fight.crit.mult', 1.5, 'B-13'], ['fight.champion.prize', 1000, 'B-13'], ['fight.ring.purse.perK', 250, 'B-13'],
  ['casino.slots.pays.dollar3', 700, 'B-14a'], ['casino.bj.handsPerDay', 60, 'B-14b'], ['casino.roulette.pays.corner', 8, 'B-14c'],
  ['casino.vip.gold.points', 2500, 'B-14d'], ['casino.scratch.price', 5, 'B-14e'], ['casino.darts.match.shark.target', 320, 'B-14f'],
  ['world.walk.speed', 280, 'B-15'], ['world.sports.speed', 1400, 'B-15'], ['world.fall.hp', 10, 'B-15'], ['world.carHit.knockdown', 1.14, 'B-15'],
  ['world.cab.cash', 15, 'B-15'],
  ['difficulty.hardcore.legacyMult', 1.5, 'B-16'], ['difficulty.relaxed.wageMult', 1.25, 'B-16'], ['difficulty.hardcore.storeJailBase', 5, 'B-16'],
  ['election.requires.money', 200000, 'B-17'], ['election.tvAd.cash', 25000, 'B-17'], ['election.debate.noShow', -5, 'B-17'], ['election.seizeBank.cash', 250000, 'B-17'],
  ['endgame.ranks.11', 15000000, 'B-18'], ['endgame.legacy.elected', 10000, 'B-18'], ['endgame.netWorth.sportsCar', 30000, 'B-18'],
  ['weather.chain.rain.rain', 0.35, 'B-19'], ['weather.storm', 0.15, 'B-19'], ['calendar.events.bloodDrive.karma', 5, 'B-19'],
  ['encounters.tourist.weight', 10, 'B-20'], ['encounters.mugger.fight.hp', 20, 'B-20'], ['encounters.scout.cash', 500, 'B-20'],
  ['perks.levels', [100, 250, 450, 700], 'B-21'], ['perks.taxWizard.t1', 200000, 'B-21'], ['perks.charmingRogue.bail', 0.5, 'B-21'],
  ['traffic.maxCars', 14, 'B-22'], ['traffic.brake', 1400, 'B-22'], ['crowd.maxPeds', 40, 'B-22'],
  ['street.harold.give10.firstCha', 6, 'B-26'], ['street.kid.givePack.deathAt', 10, 'B-26'], ['street.red.credit.afterGrams', 50, 'B-26'],
  ['street.junker.hotwire.int', 350, 'B-26'],
  ['park.chess.D', 150, 'B-27'], ['park.benchNap.hp', 10, 'B-27'], ['civic.charity.dailyKarma', 10, 'B-27'], ['civic.mchollandBribe.cash', 2000, 'B-27'],
  ['priceMods.13.value', 25, 'B-28a (employee)'], ['checkMods.1.value', 0.15, 'B-28b (badKarma)'],
  ['news.weights.electionWon', 100, 'B-29'], ['news.weights.fall', 10, 'B-29'], ['news.logMax', 20, 'B-29'],
  ['duel.stance.hint.intDiv', 1000, 'B-30'], ['duel.boardroom.takeover.bonus', 20000, 'B-30'], ['duel.interrogation.D.base', 200, 'B-30'],
  ['health.hospital.bill.standard.min', 50, 'B-31'], ['health.hospital.wake', 720, 'B-31'], ['health.hospital.hpPct', 0.5, 'B-31 (hospital.hp)'],
];

T.section('values copied from BALANCE');
{
  const bad = TABLE.filter(([p, v]) => JSON.stringify(get(p)) !== JSON.stringify(v)).map(([p, v, b]) => p + ' = ' + JSON.stringify(get(p)) + ' (' + b + ' says ' + JSON.stringify(v) + ')');
  T.eq(bad, [], TABLE.length + ' values match BALANCE');
  T.ok(TABLE.length >= 80, 'at least 80 values (' + TABLE.length + ')');
  const tables = new Set(TABLE.map((r) => r[2].split(' ')[0].replace(/[a-f]$/, '')));
  const want = [];
  for (let i = 1; i <= 31; i++) if (i < 23 || i > 25) want.push('B-' + String(i).padStart(2, '0'));
  T.eq(want.filter((b) => !tables.has(b)), [], 'every table B-01 to B-31 with a tuning path is sampled (B-26 to B-31 included)');
  T.eq(TU.priceMods[13].id + '/' + TU.checkMods[1].id, 'employee/badKarma', 'the sampled modifier rows are the ones named');
}

T.section('whole tables');
{
  T.eq(TU.news.weights, {
    electionWon: 100, removed: 95, electionLost: 90, nominated: 85, jailed: 80, bankRobbery: 78, hospital: 70, castleBought: 68,
    promotedCeo: 66, kidDied: 64, promoted: 60, champion: 58, degree: 55, haroldRepaid: 52, kidGood: 52, storeRobbery: 50, busted: 50,
    redTurnedIn: 48, homeBought: 45, jackpot: 45, casinoBig: 40, ringWin: 40, fallMilestone: 38, decree: 35, tour: 30, smuggleDeal: 20,
    fightWin: 18, carHit: 15, stockMove: 12, fall: 10, storm: 8,
  }, 'B-29: every log kind and weight');
  T.eq(TU.priceMods.map((r) => [r.id, r.kind, typeof r.value === 'number' ? r.value : r.value]), [
    ['takeout', 'add', 2], ['catalogueDelivery', 'markup', 1.10], ['redWeek', 'markup', 'mods.redWeek'], ['newGuy', 'markup', 1.15],
    ['thuTriple', 'fixed', 40], ['thuMega', 'fixed', 100], ['friBeer', 'fixed', 15], ['regular', 'fixed', 15], ['beerSubsidy', 'fixed', 10],
    ['freeFriesFriday', 'fixed', 0], ['wedClasses', 'fixed', 10], ['mastermind', 'fixed', 0], ['nationalised', 'fixed', 0],
    ['employee', 'percent', 25], ['goodKarma', 'percent', 10], ['couponClipper', 'percent', 10], ['flyerCoupon', 'percent', 50],
    ['burgerDay', 'percent', 50], ['redLoyal', 'percent', 10], ['redBad', 'percent', 10], ['fastTalker', 'percent', 50], ['charmingRogue', 'percent', 50],
  ], 'B-28a: every price modifier row in order');
  T.eq(TU.checkMods.map((r) => [r.id, r.kind, r.value, r.checks]), [
    ['relaxed', 'add', 0.10, ['holdup.*', 'police.talk', 'enc.*']], ['badKarma', 'add', 0.15, ['holdup.*']],
    ['intimidating', 'dD', -20, ['holdup.*.str']], ['fastTalker', 'dD', -40, ['police.talk']],
    ['smoothTalker', 'add', 0.10, ['trade.haggle']], ['crowdPleaser', 'always', 1, ['tour.hook.*']],
  ], 'B-28b: every check modifier row');
  const flagged = { takeout: 'shopsPlus', catalogueDelivery: 'homesPlus', redWeek: 'arcs', thuTriple: 'calendar', thuMega: 'calendar', friBeer: 'calendar',
    wedClasses: 'calendar', goodKarma: 'karmaTiers', burgerDay: 'calendar', redLoyal: 'arcs', redBad: 'karmaTiers' };
  T.ok(Object.keys(flagged).every((id) => TU.priceMods.find((r) => r.id === id).feature === flagged[id]), 'P1 price rows carry their flags (B-28a When column)');
  T.ok([...TU.priceMods, ...TU.checkMods].every((r) => (r.when || []).every((c) => SR.rules.conditions.names.includes(c[0]))), 'every `when` uses a known condition');
  T.ok(Object.keys(SR.features).length && [...TU.priceMods, ...TU.checkMods].every((r) => !r.feature || r.feature in SR.features), 'every row flag exists');
  T.eq(Object.keys(TU.perks).filter((k) => k !== 'levels').sort(), SR.registry.entries('perk').map((e) => e.id).sort(), 'B-21: a rule entry for each of the 24 perks');
  T.eq(Object.keys(TU.bus.cities), ['crayonburg', 'rustbelt', 'glitter', 'gusty', 'eraser', 'pegas'], 'B-12a: the six cities');
  T.eq(TU.stocks.tickers, ['MCS', 'NLI', 'SLC', 'PPR', 'GLU', 'SKY'], 'B-10: the six tickers');
}

T.section('numbers BALANCE derives from the tables');
{
  // B-14a: RTP and hit rate computed exactly from the strips.
  const st = TU.casino.slots.stops, n = TU.casino.slots.reelStops, pay = TU.casino.slots.pays;
  T.eq(Object.values(st).reduce((a, b) => a + b, 0), n, 'each reel has 20 stops');
  const ways = n * n * n;
  const hits = { dollar3: st.dollar ** 3, seven3: st.seven ** 3, bar3: st.bar ** 3, bell3: st.bell ** 3, cherry3: st.cherry ** 3,
    cherry2: st.cherry * st.cherry * (n - st.cherry), cherry1: st.cherry * (n - st.cherry) * n };
  const rtp = Object.keys(hits).reduce((a, k) => a + hits[k] * pay[k], 0) / ways;
  const hit = Object.values(hits).reduce((a, b) => a + b, 0) / ways;
  T.eq([rtp, hit, TU.casino.slots.rtp, TU.casino.slots.hitRate], [0.9225, 0.2125, 0.9225, 0.2125], 'slots: RTP 92.25 %, hit rate 21.25 %');
  // B-14e: scratch EV exactly $3.00.
  const ev = TU.casino.scratch.prizes.reduce((a, p) => a + (p.to - p.from + 1) * p.pay, 0) / TU.casino.scratch.roll[1];
  T.eq(ev, 3, 'scratch: EV $3.00 exactly (RTP 60 %)');
  // B-07 examples.
  const S = TU.sleep;
  const restore = (hpMax, bed, freezer, home, pill) => Math.min(hpMax, Math.max(0, Math.floor(hpMax * (S.base + S.bed[bed] + (freezer ? S.freezer : 0) + S.home[home])) + S.flat - (pill ? S.pill : 0)));
  T.eq([restore(22, 0, false, 'apt'), restore(100, 1, false, 'apt'), restore(600, 2, true, 'castle')], [20, 50, 435], 'sleep: 20 on day 1, 50 at HP max 100 with a bed, 435 in the castle with Pod and freezer');
  // B-08a: rent 0.6 % a night, resale 90 %.
  T.ok(['apt2', 'pent', 'mansion', 'castle'].every((h) => TU.homes[h].rent === TU.homes[h].price * TU.homes.rentRate && TU.homes[h].sell === TU.homes[h].price * TU.homes.sellRate), 'homes: rent = 0.6 % and sell = 90 % of the price');
  // B-08b: net upgrade costs.
  const F = TU.furniture, net = (t2) => F[t2].price - F.upgradeCredit * F[F[t2].from].price;
  T.eq(['pod', 'skydish', 'workstation', 'library', 'homegym', 'lounge'].map(net), [3750, 1750, 7000, 11000, 13250, 15500], 'furniture: the net upgrade costs');
  // B-05: a Full shift is 6 h of wages.
  T.ok(['cook', 'manager', 'janitor', 'mail', 'sales', 'exec', 'vp', 'ceo'].every((j) => TU.jobs[j].full === 6 * TU.jobs[j].wage), 'jobs: Full 6 h = 6 × $/h');
  // B-13: the ladder reference (n, HP range, P).
  const L = TU.fight.ladder;
  T.eq([1, 3, 6, 9, 12].map((k) => [L.hp.base + L.hp.perN * k, L.hp.base + L.hp.perN * k + L.hp.randPerN * k, L.power.base + L.power.perN * k]),
    [[20, 24, 15], [44, 56, 33], [80, 104, 60], [116, 152, 87], [152, 200, 114]], 'fights: the ladder reference rows');
  // B-17: the start-poll example.
  const E = TU.election.startPoll, chest = (c) => TU.election.warChest.filter((w) => c >= w.cash).map((w) => w.poll).pop() || 0;
  const poll = (low, karma, cash) => Math.round((E.base + (low - E.statFrom) / E.statDiv + Math.abs(karma) / E.karmaDiv + chest(cash)) / E.round) * E.round;
  T.eq([poll(700, 60, 200000), poll(666, 25, 50000)].map((p) => Math.round(p * 10) / 10), [66, 40.8], 'election: 66 % and 40.8 % (the B-17 examples)');
  // B-10: the tip EV table's reliability and cap columns.
  const R = TU.stocks.tip.reliability, C = TU.stocks.positionCap;
  T.eq([100, 250, 500, 999].map((i) => [Math.min(R.max, R.base + i / R.intDiv), C.base + C.perInt * i]),
    [[0.55, 20000], [0.625, 35000], [0.75, 60000], [0.75, 109900]], 'stocks: reliability and cap at INT 100 / 250 / 500 / 999');
  // B-19: every chain row sums to 1.
  T.ok(Object.values(TU.weather.chain).every((row) => Math.abs(Object.values(row).reduce((a, b) => a + b, 0) - 1) < 1e-9), 'weather: every Markov row sums to 1');
  // B-18: rank floors ascend.
  T.ok(TU.endgame.ranks.every((v, i, a) => i === 0 || v > a[i - 1]), 'endgame: rank floors ascend');
  // B-14f: ring radii.
  T.eq(TU.casino.darts.rings.map((r) => [r.r, r.pts]), [[19, 50], [40, 35], [138, 15], [220, 5]], 'darts: ring radii and points');
  // B-11b reference odds at Heat 0 (plain formula).
  const ch = (c) => c / (c + TU.crime.store.D.base);
  T.eq([ch(50), ch(100), ch(300)].map((p) => Math.round(p * 1000) / 10), [45.5, 62.5, 83.3], 'robbery beats: 45 %, 62.5 %, 83 %');
}

T.section('data hygiene');
{
  const src = require('fs').readFileSync(require('path').join(K.L.ROOT, 'js/data/tuning.js'), 'utf8');
  T.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/.test(src), 'no colour literals in tuning.js');
  T.ok(!/Math\.random/.test(src), 'no Math.random');
  const walk = (o, p) => (o === undefined ? [p] : o && typeof o === 'object' ? Object.keys(o).flatMap((k) => walk(o[k], p + '.' + k)) : []);
  T.eq(walk(TU, 'tuning'), [], 'no undefined value anywhere');
  T.eq(JSON.parse(JSON.stringify(TU)), K.json(TU), 'JSON-safe');
}

T.done();
