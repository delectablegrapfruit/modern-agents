// tests/node/econ-helpers.cjs — owner: W2-RulesE (W1-E in wave 1). Shared setup for the economy and life-rules suites
// (tests/node/{jobs,training,night,bank,stocks,homes,calendar,endgame,health,news}.test.cjs):
// a booted rules context, fresh states, seeded contexts, feature switches and call recorders.
// Fakes for modules that are still stubs (the election rules of W1-C, the wave-3 arcs and
// encounters) are installed by the suites themselves, after boot (CONTRACT D27).
'use strict';
const L = require('./load.cjs');

/**
 * Loads mode `rules` and boots headless.
 * @returns {object} SR (another realm: compare with JSON or suite().eq)
 */
function boot() {
  return L.load({ mode: 'rules' }).SR;
}

/**
 * A new game state (SR.rules.state.create) with a patch deep-merged in.
 * @param {object} SR
 * @param {object=} patch merged with SR.util.merge (arrays replace)
 * @param {object=} opts state.create options (seed, difficulty, length, stats)
 */
function state(SR, patch, opts) {
  const s = SR.rules.state.create(Object.assign({ seed: 7 }, opts || {}));
  if (patch) SR.util.merge(s, patch);
  return s;
}

/** @returns {object} a rules context with its own seeded stream. */
function ctx(SR, seed) {
  return { rng: SR.rng.create(seed === undefined ? 1 : seed), source: 'sim' };
}

/** Turns feature flags on or off; returns a function that restores them. */
function features(SR, map) {
  const old = {};
  Object.keys(map).forEach((k) => { old[k] = SR.features[k]; SR.features[k] = !!map[k]; });
  return () => Object.keys(old).forEach((k) => { SR.features[k] = old[k]; });
}

/**
 * Wraps obj[name] so every call is recorded into log before it runs (as label, or label(args); a
 * falsy label records nothing), so nested calls appear in call order.
 * @returns {function} restore
 */
function spy(obj, name, log, label) {
  const orig = obj[name];
  obj[name] = function () {
    const args = Array.prototype.slice.call(arguments);
    const tag = typeof label === 'function' ? label(args) : label;
    if (tag) log.push(tag);
    return orig.apply(this, args);
  };
  return () => { obj[name] = orig; };
}

/** Mean and standard deviation of an array of numbers. */
function stats(xs) {
  let m = 0;
  xs.forEach((x) => { m += x; });
  m /= xs.length;
  let v = 0;
  xs.forEach((x) => { v += (x - m) * (x - m); });
  return { mean: m, sd: Math.sqrt(v / xs.length) };
}

// Every SR.tuning path the W1-E rule modules read (W1-R owns tuning.js; a renamed key shows up here).
const TUNING_PATHS = [
  'time.wake', 'time.alarmMinus', 'time.pillMinus', 'time.weekdays', 'time.marketNights', 'time.weekStart',
  'sleep.base', 'sleep.flat', 'sleep.bed', 'sleep.freezer', 'sleep.home.apt', 'sleep.home.castle', 'sleep.pill',
  'sleep.heatDecay.base', 'sleep.heatDecay.good', 'sleep.heatDecay.toughOnCrime', 'sleep.buzzReset',
  'training.study.gain', 'training.study.stat', 'training.study.where', 'training.classBiz.track', 'training.tvNews.daily',
  'training.seminar.gain', 'training.seminar.daily', 'training.seminar.needStat', 'training.seminar.needClasses',
  'training.degree.classes', 'training.degree.bonusStat', 'training.degree.tracks.biz', 'training.uofsKarma.n', 'training.uofsKarma.dailyMax',
  'training.winded.threshold',
  'karma.changes.promotion', 'karma.changes.statueOfMe.president', 'karma.changes.statueOfMe.dictator', 'karma.tiers.good',
  'jobs.ladder.nli', 'jobs.ladder.mcsticks', 'jobs.cook.wage', 'jobs.cook.int', 'jobs.cook.cha', 'jobs.cook.shifts', 'jobs.cook.credit',
  'jobs.vp.rating', 'jobs.office.credit', 'jobs.shift.full.min', 'jobs.shift.full.karma', 'jobs.shift.full.counts',
  'jobs.shift.half.counts', 'jobs.shift.overtime.payMult', 'jobs.shift.overtime.hp', 'jobs.shift.overtime.perDay',
  'jobs.shift.overtime.workaholicHp', 'jobs.shift.overtime.workaholicPerDay', 'jobs.hustle.m', 'jobs.hustle.auto',
  'jobs.hustle.skins.cook', 'jobs.hustle.pitchStep.exec', 'jobs.rating.alpha', 'jobs.weeklyBonus.exec', 'jobs.weeklyBonus.ceo',
  'jobs.ceoTakeover.fromDays', 'jobs.ceoTakeover.toDays', 'jobs.ceoTakeover.mNeed', 'jobs.ceoTakeover.bonus',
  'jobs.mondayBonus.stat', 'jobs.mondayBonus.n', 'jobs.relaxedWages', 'jobs.fourDayWeek', 'jobs.networker',
  'homes.apt.price', 'homes.apt.slots', 'homes.apt2.rent', 'homes.apt2.sell', 'homes.castle.price',
  'furniture.bed.price', 'furniture.bed.slots', 'furniture.pod.price', 'furniture.library.slots', 'furniture.books.nightly.int',
  'furniture.homegym.nightly.str', 'furniture.lounge.nightly.cha', 'furniture.tv.channels', 'furniture.skydish.channels',
  'furniture.satellite.channels', 'furniture.satellite.slots', 'furniture.upgradeCredit',
  'bank.rateStep.toward', 'bank.rateStep.pull', 'bank.rateStep.jitter', 'bank.rateStep.jitterDiv', 'bank.rateStep.min',
  'bank.rateStep.max', 'bank.goodBonus', 'bank.tiers.t1', 'bank.tiers.t2', 'bank.tiers.t1Div', 'bank.tiers.t2Div',
  'bank.tiers.t3Div', 'bank.tiers.taxWizardT1', 'bank.interestCap', 'bank.cd.min', 'bank.cd.days', 'bank.cd.rateMult',
  'bank.cd.maxOpen', 'bank.cd.maxPrincipal', 'bank.cd.breakPenalty', 'bank.loan.days', 'bank.loan.rateAdd', 'bank.loan.warn',
  'bank.default.cdPenalty', 'bank.default.stockSell', 'bank.default.furniture', 'bank.default.homes', 'bank.default.lienShare',
  'bank.default.lienSources', 'bank.default.penaltyKarma', 'bank.default.creditFrozenDays', 'bank.default.standard.hp',
  'bank.default.relaxed.hp', 'bank.default.hardcore.dead', 'bank.typedMax',
  'stocks.tickers', 'stocks.MCS.mu', 'stocks.MCS.sigma', 'stocks.MCS.quirk.burgerDay', 'stocks.NLI.quirk.ceoDrift',
  'stocks.NLI.quirk.ceoShifts', 'stocks.SLC.quirk.casinoWin', 'stocks.SLC.quirk.shock', 'stocks.PPR.quirk.rain',
  'stocks.GLU.quirk.fall', 'stocks.reverseSplit.below', 'stocks.reverseSplit.factor', 'stocks.tip.reliability.base',
  'stocks.tip.reliability.intDiv', 'stocks.tip.reliability.max', 'stocks.tip.trueShock.base', 'stocks.tip.trueShock.extra',
  'stocks.tip.trueShock.extraDiv', 'stocks.tip.falseShock', 'stocks.fee', 'stocks.spread', 'stocks.positionCap.base',
  'stocks.positionCap.perInt', 'stocks.maxShares', 'stocks.history', 'stocks.stockScare.shock', 'stocks.stockScare.rebound',
  'perks.marketSense.spread',
  'election.rivalDaily', 'election.pollClamp', 'election.campaignDays', 'election.debate.day', 'election.debate.noShow',
  'election.acceptWithin', 'election.retry', 'election.salary', 'election.casinoLevy', 'election.mandatoryHats',
  'world.carTow.cash', 'world.homeLots.junker', 'world.homeLots.sports', 'crime.bank.D.recentDays',
  'health.hospital.bill.standard.min', 'health.hospital.bill.standard.pct', 'health.hospital.bill.relaxed',
  'health.hospital.hpPct', 'health.hospital.wake', 'health.secondWind.hp',
  'endgame.netWorth.homes', 'endgame.netWorth.furniture', 'endgame.netWorth.sportsCar', 'endgame.ranks', 'endgame.column.good',
  'endgame.column.evil', 'endgame.legacy.nwDiv', 'endgame.legacy.karmaMult', 'endgame.legacy.achievement',
  'endgame.legacy.jobRank', 'endgame.legacy.elected', 'endgame.legacy.jobRanks.ceo', 'endgame.legacy.jobRanks.office',
  'endgame.hof.lengths', 'difficulty.standard.legacyMult', 'difficulty.relaxed.legacyMult', 'difficulty.hardcore.legacyMult',
  'weather.states', 'weather.chain.clear', 'weather.day1', 'weather.forecastAccuracy', 'weather.storm',
  'calendar.mon', 'calendar.events.casinoNight.day', 'calendar.events.stockScare.day',
  'news.minWeight', 'news.weights.promoted', 'news.stockMove',
  // read by the review fixes (rain tips, the Friday bonus, the Heat Wave, the catalogue car, Speed
  // Reader, the nap)
  'jobs.hustle.rainTips', 'jobs.weeklyBonus.weekday', 'calendar.events.heatWave.weather', 'items.sportscar.price',
  'training.study.min', 'training.study.speedReaderMin', 'training.paper.min', 'training.paper.speedReaderMin',
  'training.nap.hpPct',
];

/** @returns {string[]} the TUNING_PATHS missing from SR.tuning (a key renamed or dropped by tuning.js). */
function missingTuning(SR) {
  return TUNING_PATHS.filter((p) => {
    let o = SR.tuning;
    for (const k of p.split('.')) {
      if (o === null || o === undefined || !Object.prototype.hasOwnProperty.call(o, k)) return true;
      o = o[k];
    }
    return false;
  });
}

module.exports = { L, boot, state, ctx, features, spy, stats, TUNING_PATHS, missingTuning };
