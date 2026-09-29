// tests/node/night.test.cjs — owner: W2-RulesE (W1-E in wave 1). SR.rules.night.run (GDD §4.7; ARCHITECTURE §6.6): the
// fixed step order (every step's side effect recorded in order, with stubbed election rules, arcs
// and encounters), the jail and hospital subsets, the market days by the ended day, the B-07 sleep
// restore, wake times, meters and counters, timers, messages, the morning, the end of a timed game
// and a Hardcore loan default, and the Report's shape.
//   node tests/node/night.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('night (W1-E)');
const SR = H.boot();
const N = SR.rules.night;

/** Installs recording stubs for the modules of other packages the night calls (CONTRACT D27). */
function stubs(log, opts) {
  opts = opts || {};
  const saved = { election: SR.rules.election, arcs: SR.rules.arcs, encounters: SR.rules.encounters, achievements: SR.rules.achievements };
  SR.rules.election = {
    electionNight: function (s) {
      log.push('electionNight');
      log.push('campaignDay:' + s.election.campaignDay);
      s.election.status = 'office';
      return { won: true, poll: s.election.poll, roll: 3, path: 'president', events: [{ name: 'election', payload: { status: 'office', poll: s.election.poll } }] };
    },
    nominationCheck: function () { log.push('nomination'); return { ok: false }; },
    officeMorning: function () { log.push('office'); return {}; },
  };
  SR.rules.arcs = { onEvent: function (s, ev) { log.push('arcs:' + ev.name); return []; } };
  SR.rules.encounters = { seed: function () { log.push('encounters'); return {}; } };
  SR.rules.achievements = { evaluate: function () { log.push('achievements'); return []; } };
  return function () { Object.keys(saved).forEach((k) => { SR.rules[k] = saved[k]; }); };
}

T.section('tuning');
T.eq(H.missingTuning(SR), [], 'every SR.tuning path the W1-E rules read exists (' + H.TUNING_PATHS.length + ' paths)');

T.section('the steps run in GDD §4.7 order (sleep, Hardcore default)');
{
  const log = [], restores = [stubs(log)];
  restores.push(H.features(SR, { encounters: true, achievements: true, homesPlus: true }));
  const R = SR.rules;
  [
    [R.stocks, 'tick', 'stocks'], [R.bank, 'rateStep', 'rate'], [R.bank, 'interest', 'interest'],
    [R.bank, 'maturities', 'cds'], [R.bank, 'loanNight', 'loan'], [R.bank, 'default', 'default'],
    [R.bank, 'income', (a) => 'income:' + a[2]], [R.homes, 'rents', 'rent'], [R.jobs, 'weeklyBonus', 'bonus'],
    [R.homes, 'sleepBonus', 'restore'], [R.homes, 'nightly', 'furniture'],
    [R.stats, 'add', (a) => 'add:' + a[1] + ':' + a[3]], [R.calendar, 'rollWeather', 'weather'],
    [R.stats, 'heat', 'heat'], [R.stats, 'karma', 'karma'], [R.log, 'roll', 'logRoll'],
    [R.bank, 'charge', (a) => 'charge:' + a[2]], [R.stocks, 'drawTip', 'tip'], [R.effects, 'addMsg', (a) => 'msg:' + a[1]],
    [R.news, 'headline', 'headline'], [R.endgame, 'results', (a) => 'results:' + a[1]],
  ].forEach((x) => restores.push(H.spy(x[0], x[1], log, x[2])));
  // Friday night (day 5) of a Hardcore game with every nightly rule armed.
  const s = H.state(SR, {
    clock: { day: 5, min: 1300 },
    money: { cash: 1000, bank: 50000, rate: 2, loan: { amount: 500, daysLeft: 1 }, cds: [{ amount: 2000, rate: 2.4, dayOpened: -1 }] },
    job: { ranks: { nli: 'exec' }, weekNliWages: 2000, office: 'president' },
    election: { status: 'campaign', campaignDay: 7, poll: 60, decrees: ['casinoLevy', 'statueOfMe', 'mandatoryHats'] },
    homes: { owned: ['apt', 'apt2'], living: 'apt', lets: { apt2: 1 } },
    furniture: { owned: { bed: 1, books: 1 } },
    player: { cars: { junker: { owned: true, towed: true, x: 0, y: 0 } } },
    items: { pills: 1, alarm: 1 },
    stats: { heat: 30, buzz: 3, hp: 10 },
  }, { difficulty: 'hardcore' });
  const trace = [];
  const rep = N.run(s, H.ctx(SR, 11), { kind: 'sleep', trace: trace });
  restores.reverse().forEach((f) => f());
  T.eq(trace, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 'sleep runs every step 0-13 in order');
  T.eq(log, [
    'stocks',                                                          // 1 (Friday is a market day)
    'rate', 'interest', 'income:interest', 'cds', 'income:interest',   // 2: rate step, interest, CD maturity
    'loan', 'default',                                                 // 2: countdown reaches 0 → default
    'rent', 'income:rent', 'income:salary', 'income:salary',           // 3: rent, the office salary, Casino Levy
    'bonus', 'income:wage',                                            // 4: Friday: the weekly bonus
    'electionNight', 'campaignDay:8',                                  // 5: rival, counter + 1, election night
    'restore',                                                         // 6
    'furniture', 'add:int:furniture',                                  // 7
    'weather',                                                         // 8: the day advances
    'heat', 'karma', 'add:cha:reward', 'logRoll',                      // 9: Heat, Statue of Me, Mandatory Hats, the log
    'charge:tow', 'arcs:night', 'encounters',                          // 10: the tow, arc timers, encounters
    'nomination', 'office', 'achievements', 'headline',                // 12: the morning
    'results:death',                                                   // 13: the default ends the game
  ], 'every step\'s side effect in GDD §4.7 order, with the Hardcore default finishing the night before death');
  T.eq([rep.dead, s.over, s.result.reason, rep.day, s.clock.day], ['loan', true, 'death', 6, 6], 'death comes after the whole night (the day advanced)');
  T.ok(rep.headline && rep.headline.key, 'the report still has its headline');
  T.eq(rep.election, { won: true, poll: s.election.poll, roll: 3, path: 'president' }, 'the election-night result is on the report');
  T.ok(rep.events.some((e) => e.name === 'election') && rep.events.some((e) => e.name === 'loan' && e.payload.kind === 'default'),
    'rule events of the night are on the report');
  T.eq(rep.events.filter((e) => e.name === 'night')[0].payload, { day: 6, weekday: 5, kind: 'sleep' }, 'the `night` event names the new day');
}

T.section('the jail and hospital subsets');
{
  const log = [], restore = stubs(log), rf = H.features(SR, { encounters: true });
  const s = H.state(SR, { clock: { day: 3 }, stats: { hp: 10, int: 50 }, furniture: { owned: { books: 1, bed: 1 } },
    items: { pills: 2, alarm: 1 }, jail: { daysLeft: 3, served: 0, reason: 'store', bailBase: 500 } });
  const trace = [];
  const rep = N.run(s, H.ctx(SR, 2), { kind: 'jail', trace: trace });
  T.eq(trace, [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13], 'jail: steps 0-5, 8-13 (no restore, no furniture)');
  T.eq([s.stats.hp, s.stats.int, s.items.pills, s.clock.min], [10, 50, 2, 480], 'jail: no HP restore, no furniture gains, wake 08:00 in the cell (no pill used)');
  T.eq([s.jail.daysLeft, s.jail.served], [2, 1], 'jail: a jail day is counted');
  T.ok(log.indexOf('encounters') < 0, 'jail: no encounters are seeded');
  const js = rep.lines.filter((l) => l.section === 'jail');
  T.eq(js.map((l) => [l.key, l.vars.days, typeof l.vars.ticker]), [['report.jail.summaryMarket', 2, 'string']],
    'jail: the one-line summary, with the biggest mover on a market night (UI §5.12)');
  T.eq(rep.kind, 'jail', 'the report kind');

  const h = H.state(SR, { clock: { day: 3 }, stats: { hp: 0, str: 25, hpMax: 40 }, furniture: { owned: { books: 1 } }, items: { pills: 2, alarm: 1 } });
  const t2 = [];
  const rh = N.run(h, H.ctx(SR, 2), { kind: 'hospital', bill: 50, paid: 50, writtenOff: 0, trace: t2 });
  T.eq(t2, [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13], 'hospital: steps 0-6 (6 replaced), 8-13 (no furniture)');
  T.eq([h.stats.hp, h.stats.int, h.items.pills, h.clock.min, h.clock.day], [20, 7, 2, 720, 4], 'hospital: HP = 50 % of HP max, no gains, wake 12:00 the next day');
  T.ok(rh.lines.some((l) => l.key === 'report.hospital.bill') && rh.lines.some((l) => l.key === 'report.hospital.discharge'), 'the Stick General lines');
  T.ok(log.indexOf('encounters') >= 0, 'hospital: encounters are seeded (only jail skips them)');
  rf(); restore();
}

T.section('market days are decided by the ended day');
{
  const s = H.state(SR, {});
  const ticked = [], restore = H.spy(SR.rules.stocks, 'tick', ticked, (a) => a[1].day);
  const c = H.ctx(SR, 3);
  for (let i = 0; i < 14; i++) N.run(s, c, { kind: 'sleep' });
  restore();
  T.eq(ticked, [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], 'ticks after Mon-Fri (days 1-5, 8-12), never after Sat-Sun');
  T.eq(s.stocks.NLI.hist.length, 10, 'one history point per market night');
}

T.section('sleep restore (B-07) and wake times');
{
  function sleep(patch, opts) {
    const s = H.state(SR, patch, opts);
    const r = N.run(s, H.ctx(SR, 1), { kind: 'sleep' });
    return { s: s, n: r.lines.filter((l) => l.key === 'report.hpRestored')[0].vars.n };
  }
  T.eq(sleep({ stats: { hp: 1 } }).n, 20, 'HP max 22 on day 1: 5 + 15 = 20 (orig 20)');
  T.eq(sleep({ stats: { str: 85, hpMax: 100, hp: 10 }, furniture: { owned: { bed: 1 } } }).n, 50, 'HP max 100 with a bed: 35 + 15 = 50');
  T.eq(sleep({ stats: { str: 585, hpMax: 600, hp: 100 }, homes: { owned: ['apt', 'castle'], living: 'castle' },
    furniture: { owned: { bed: 2, freezer: 1 } } }).n, 435, 'HP max 600 in the castle with the Pod and freezer: 0.70 × 600 + 15 = 435');
  T.eq(sleep({ stats: { hp: 1 }, items: { pills: 1 } }).n, 0, 'a caffeine pill takes 20 HP off the restore');
  T.eq(sleep({ stats: { hp: 20 } }).n, 2, 'capped at HP max');
  const both = sleep({ items: { pills: 3, alarm: 1 } }).s;
  T.eq([both.clock.min, both.clock.wake, both.items.pills], [0, 0, 2], 'alarm and pill: a 00:00 start, one pill used');
  T.eq(sleep({ items: { alarm: 1 } }).s.clock.min, 240, 'alarm only: 04:00');
  T.eq(sleep({ items: { pills: 1 } }).s.clock.min, 240, 'pill only: 04:00');
  T.eq(sleep({ items: { pills: 1 }, clock: { pillAuto: false } }).s.items.pills, 1, 'the Bag toggle off keeps the pill');
  T.eq(sleep({}).s.clock.min, 480, 'otherwise 08:00');
}

T.section('meters, counters and the log');
{
  const s = H.state(SR, { clock: { day: 3 }, stats: { heat: 30, buzz: 4 },
    daily: { tv: { tvNews: 2 }, beers: 3, forecastSeen: true, campaign: { rally: 2 } },
    weekly: { index: 0, openMic: 1 }, job: { weekNliWages: 500, overtimeToday: 1, lastFullEnd: 900 } });
  SR.rules.log.add(s, 'promoted', { job: 'mail', title: 'Mail Room Clerk' });
  const rep = N.run(s, H.ctx(SR, 1), { kind: 'sleep' });
  T.eq([s.stats.heat, s.stats.buzz], [20, 0], 'Heat -10, Buzz 0');
  T.eq([s.daily.tv.tvNews, s.daily.beers, s.daily.forecastSeen, s.daily.campaign.rally], [0, 0, false, 0], 'daily counters reset');
  T.eq([s.job.overtimeToday, s.job.lastFullEnd], [0, -1], 'the day\'s shift counters reset');
  T.eq([s.weekly.openMic, s.job.weekNliWages], [1, 500], 'weekly counters keep mid-week');
  T.eq([s.log.today.length, s.log.yesterday[0].kind], [0, 'promoted'], 'the log rolls: today → yesterday');
  T.eq(rep.headline.key, 'news.head.promoted', 'the headline is yesterday\'s heaviest entry');
  const w = H.state(SR, { clock: { day: 7 }, weekly: { index: 0, openMic: 1, bankRob: 1 }, job: { weekNliWages: 500, weekNliShifts: 3 } });
  N.run(w, H.ctx(SR, 1), { kind: 'sleep' });
  T.eq([w.weekly.index, w.weekly.openMic, w.weekly.bankRob, w.job.weekNliWages, w.job.weekNliShifts], [1, 0, 0, 0, 0], 'Monday morning: weekly counters reset');
  const g = H.state(SR, { stats: { heat: 30, karma: 60 } });
  const rf = H.features(SR, { karmaTiers: true });
  N.run(g, H.ctx(SR, 1), {});
  rf();
  T.eq(g.stats.heat, 15, 'Good karma with karmaTiers: Heat -15');
  const tc = H.state(SR, { stats: { heat: 30, karma: 60 }, election: { decrees: ['toughOnCrime'] } });
  N.run(tc, H.ctx(SR, 1), {});
  T.eq(tc.stats.heat, 5, 'Tough on Crime: Heat -25 instead');
}

T.section('income, the weekly bonus, the tow, messages');
{
  const bonus = [];
  for (let d = 1; d <= 7; d++) {
    const s = H.state(SR, { clock: { day: d }, job: { ranks: { nli: 'ceo' }, weekNliWages: 1000 } });
    const r = N.run(s, H.ctx(SR, 1), {});
    const l = r.lines.filter((x) => x.key === 'report.weeklyBonus')[0];
    bonus.push(l ? l.vars.n : 0);
  }
  T.eq(bonus, [0, 0, 0, 0, 300, 0, 0], 'the CEO weekly bonus (30 %) is paid on Friday night only');
  const s = H.state(SR, { money: { cash: 50, bank: 100 }, player: { cars: { sports: { owned: true, towed: true, x: 0, y: 0 } } } });
  const rs = N.run(s, H.ctx(SR, 1), {});
  const lot = SR.tuning.world.homeLots.sports;
  const intr = rs.lines.filter((x) => x.key === 'report.interest').map((x) => x.vars.n)[0] || 0;
  T.eq([s.money.cash, s.money.bank, s.player.cars.sports.towed, s.player.cars.sports.x, s.player.cars.sports.y],
    [0, 100 + intr - 50, false, (lot[0] + lot[2]) / 2, (lot[1] + lot[3]) / 2], 'the tow: a $100 forced charge (cash, then bank), the car back on its home lot');
  T.ok(rs.lines.some((x) => x.key === 'report.tow' && x.vars.n === 100), 'the tow line');
  const l = H.state(SR, { clock: { day: 2 }, money: { rate: 1, loan: { amount: 100, daysLeft: 6 } } });
  N.run(l, H.ctx(SR, 1), {});
  const m = l.msgs[l.msgs.length - 1];
  T.eq([m.key, m.from, m.day, m.read], ['vm.penny.loan5', 'penny', 3, false], 'the 5-day loan warning is a voicemail the next morning');
  const y = H.state(SR, { clock: { day: 364 } });
  const ry = N.run(y, H.ctx(SR, 1), {});
  T.eq([y.player.cars.sports.owned, y.msgs[y.msgs.length - 1].key, ry.lines.some((x) => x.key === 'report.day365')],
    [true, 'vm.crew.day365', true], 'day 365: the call and the sports car (orig)');
  const rent = H.state(SR, { homes: { owned: ['apt', 'pent', 'castle'], living: 'apt', lets: { pent: 1, castle: 1 } }, money: { lien: 100 } });
  N.run(rent, H.ctx(SR, 1), {});
  T.eq([rent.money.lien, rent.money.bank], [0, 240 + 3000 - 100], 'rents ($240 + $3,000) go to the bank, half of the first to the $100 lien');
}

T.section('the election step (GDD §4.17)');
{
  const saved = SR.rules.election;
  SR.rules.election = { electionNight: function () { return { won: false, poll: 40, roll: -2, path: 'president' }; } };
  const s = H.state(SR, { election: { status: 'campaign', campaignDay: 4, poll: 50, debateDone: false } });
  const r = N.run(s, H.ctx(SR, 5), {});
  const drop = r.lines.filter((l) => l.key === 'report.election.rival')[0].vars.n;
  T.ok(drop >= 1 && drop <= 3, 'the rival gains 1-3 points', drop);
  T.eq([s.election.campaignDay, s.election.poll], [5, 50 - drop - 5], 'after day 4: the counter moves on and the debate no-show costs 5');
  const j = H.state(SR, { election: { status: 'campaign', campaignDay: 2, poll: 50 } });
  N.run(j, H.ctx(SR, 5), { kind: 'jail' });
  T.eq(j.election.campaignDay, 3, 'a jail night is a campaign day too');
  const e = H.state(SR, { election: { status: 'campaign', campaignDay: 7, poll: 45 } });
  const re = N.run(e, H.ctx(SR, 5), {});
  T.eq(re.election, { won: false, poll: 40, roll: -2, path: 'president' }, 'election night after campaign day 7');
  const n = H.state(SR, { clock: { day: 14 }, election: { status: 'nominated', nominatedDay: 1 } });
  N.run(n, H.ctx(SR, 5), {});
  T.eq([n.election.status, n.election.retryFromDay], ['none', 44], 'an offer not accepted in 14 days lapses; a new run from 30 days later');
  const n2 = H.state(SR, { clock: { day: 13 }, election: { status: 'nominated', nominatedDay: 1 } });
  N.run(n2, H.ctx(SR, 5), {});
  T.eq(n2.election.status, 'nominated', 'still open on day 13');
  SR.rules.election = saved;
}

T.section('the tip at step 10, the end of the game, the report');
{
  const rf = H.features(SR, { stockTips: true });
  const s = H.state(SR, { clock: { day: 1 }, stats: { int: 99 }, furniture: { owned: { books: 1 } } });
  N.run(s, H.ctx(SR, 9), {});
  T.eq([s.tip.day, s.tip.reliability], [2, Math.min(0.75, 0.5 + 101 / 2000)], 'the tip is drawn at step 10 with that morning\'s INT (after the furniture gain)');
  T.ok(Object.keys(s.tip.revealed).every((k) => s.tip.revealed[k] === false), 'nothing reveals it for free');
  const f = H.state(SR, { clock: { day: 5 } });
  N.run(f, H.ctx(SR, 9), {});
  T.eq(f.tip, null, 'no tip on a weekend day');
  rf();
  const p0 = H.state(SR, { clock: { day: 1 } });
  N.run(p0, H.ctx(SR, 9), {});
  T.eq(p0.tip, null, 'no tip while `stockTips` is off');

  const t = H.state(SR, { clock: { day: 15 } }, { length: 15 });
  const rt = N.run(t, H.ctx(SR, 1), {});
  T.eq([rt.ended, t.over, t.result.reason, t.result.day], ['time', true, 'time', 16], 'a timed game ends when day > length');
  const k = H.state(SR, { clock: { day: 15 }, mode: { keepPlaying: true } }, { length: 15 });
  T.eq(N.run(k, H.ctx(SR, 1), {}).ended, null, 'Keep playing continues');
  const u = H.state(SR, { clock: { day: 400 } }, { length: 0 });
  T.eq(N.run(u, H.ctx(SR, 1), {}).ended, null, 'Unlimited never ends by time');

  const s2 = H.state(SR, { clock: { day: 8 } });
  const r2 = N.run(s2, H.ctx(SR, 1), {});
  const sections = ['overnight', 'money', 'markets', 'weather', 'today', 'jail', 'hospital', 'election'];
  T.ok(r2.lines.every((l) => sections.indexOf(l.section) >= 0 && typeof l.key === 'string' && typeof l.icon === 'string'),
    'every line has a known section, an icon and a key');
  T.eq([r2.kind, r2.endedDay, r2.day, r2.weekday, r2.weather.today], ['sleep', 8, 9, 1, 'clear'], 'Report fields (the weekday of the new day)');
  T.ok(!r2.lines.some((l) => /tip|forecast/i.test(l.key) && !/tipRight|tipWrong/.test(l.key)), 'never today\'s tip or tomorrow\'s forecast');
  T.eq(s2.history.nw[s2.history.nw.length - 1][0], 9, 'history gets the new morning\'s point');
  const a = H.state(SR, { clock: { day: 3 } }), b = H.state(SR, { clock: { day: 3 } });
  T.eq(N.run(a, H.ctx(SR, 21), {}), N.run(b, H.ctx(SR, 21), {}), 'deterministic: the same state and seed give the same report');
  T.eq(a, b, '… and the same state');
  const h = H.state(SR, { clock: { day: 150 } });
  const h0 = h.history.nw.length;   // create() seeds the day-1 point (W1-E request R2)
  N.run(h, H.ctx(SR, 1), {});
  T.eq(h.history.nw.length - h0, 0, 'after day 120 the history is weekly (day 151 is not a 7th morning)');
  h.clock.day = 147;
  N.run(h, H.ctx(SR, 1), {});
  T.eq(h.history.nw.length - h0, 1, 'day 148 = 120 + 28 is');
}

T.section('weather at night: the Heat Wave, storms, weather alerts (review fixes)');
{
  const rf = H.features(SR, { weather: true, calendar: true });
  // A Heat Wave drawn on Sunday night for the Monday just begun, after step 8 rolled a rainy Monday.
  const C = SR.rules.calendar, roll = C.rollCityEvent;
  C.rollCityEvent = function (s) { s.world.cityEvent = { id: 'heatWave', day: s.clock.day }; return s.world.cityEvent; };
  const s = H.state(SR, { clock: { day: 7 }, world: { weather: 'rain', tomorrow: 'rain', todayHadRain: true } });
  N.run(s, H.ctx(SR, 3), {});
  C.rollCityEvent = roll;
  T.eq([s.clock.day, s.world.weather, s.world.todayHadRain], [8, 'clear', false], 'a Heat Wave Monday is Clear and no rainy day');
  const facts = [], restore = H.spy(SR.rules.stocks, 'tick', facts, (a) => 'rain:' + a[1].rain);
  N.run(s, H.ctx(SR, 3), {});
  restore();
  T.eq(facts, ['rain:false'], 'so PPR takes no rain shock that market night');

  // Storms: logged on the day they happen (the new day), and a weather alert that morning.
  let st = null;
  for (let seed = 1; seed < 400 && !st; seed++) {
    const t = H.state(SR, { clock: { day: 2 }, world: { tomorrow: 'rain' } }, { seed: seed });
    N.run(t, H.ctx(SR, seed), {});
    if (C.storm(t)) st = t;
  }
  T.ok(!!st, 'a stormy morning was found');
  T.eq([st.log.today.map((e) => e.kind), st.log.yesterday.some((e) => e.kind === 'storm')], [['storm'], false],
    'a storm goes into the new day\'s log, not the ended day\'s');
  T.eq(st.msgs.map((m) => m.key + ':' + m.from), ['vm.skywatch.storm:skywatch'], 'the storm\'s weather alert');
  const alerts = ['clear', 'cloudy', 'rain', 'fog', 'windy'].map((w) => {
    let t = null;
    for (let seed = 1; seed < 400; seed++) {
      t = H.state(SR, { clock: { day: 2 }, world: { tomorrow: w } }, { seed: seed });
      N.run(t, H.ctx(SR, seed), {});
      if (!C.storm(t)) break;
    }
    return w + ':' + (t.msgs.map((m) => m.key).join(',') || '-');
  });
  T.eq(alerts, ['clear:-', 'cloudy:-', 'rain:-', 'fog:vm.skywatch.fog', 'windy:vm.skywatch.windy'], 'weather alerts on windy and foggy days only (GDD §4.7 step 11)');
  rf();
  const p0 = H.state(SR, { clock: { day: 2 }, world: { tomorrow: 'windy' } });
  N.run(p0, H.ctx(SR, 1), {});
  T.eq([p0.world.weather, p0.msgs.length], ['clear', 0], 'no alerts while `weather` is off (always Clear)');
}

T.section('the campaign morning and the night\'s clock (review fixes)');
{
  const log = [], saved = SR.rules.election, arcs = SR.rules.arcs;
  SR.rules.election = {
    nominationCheck: function () { log.push('nomination'); return {}; },
    campaignMorning: function (s) { log.push('campaign:' + s.election.campaignDay); return { lines: [{ section: 'election', icon: 'campaign', key: 'toast.election.event.parade', vars: {}, weight: 35 }] }; },
  };
  const c = H.state(SR, { election: { status: 'campaign', campaignDay: 2, poll: 50 } });
  const rc = N.run(c, H.ctx(SR, 4), {});
  T.eq(log, ['nomination', 'campaign:3'], 'a campaign day\'s morning rolls its campaign event (W1-C campaignMorning)');
  T.ok(rc.lines.some((l) => l.key === 'toast.election.event.parade'), '… and its report line');
  log.length = 0;
  N.run(H.state(SR, {}), H.ctx(SR, 4), {});
  T.eq(log, ['nomination'], 'not outside a campaign');
  SR.rules.election = saved;
  let now = null;
  SR.rules.arcs = { onEvent: function (s, ev, ctx) { now = [ctx.now, s.clock.min]; return []; } };
  N.run(H.state(SR, { clock: { min: 1380 }, items: { alarm: 1 } }), H.ctx(SR, 4), {});
  SR.rules.arcs = arcs;
  T.eq(now, [240, 240], 'arc effects at step 10 see the new morning\'s clock');
  // With W1-C's real election rules and `civicPlus`, campaign events do happen.
  const rf = H.features(SR, { civicPlus: true });
  let events = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const e = H.state(SR, { election: { status: 'campaign', campaignDay: 2, poll: 50, path: 'president' } }, { seed: seed });
    const re = N.run(e, H.ctx(SR, seed), {});
    if (re.lines.some((l) => /^toast\.election\.event\./.test(l.key))) events++;
  }
  rf();
  T.ok(events >= 6 && events <= 26, 'about 40 % of campaign mornings bring an event (real election rules)', events);
}

T.section('wave-1 integration requests (W1-R 12, W1-W 3, W1-E R2)');
{
  // W1-R request 12: night stat gains raise the `stat` rule event into Report.events.
  const f = H.state(SR, { clock: { day: 3 }, stats: { int: 50 }, furniture: { owned: { books: 1 } }, election: { decrees: ['mandatoryHats'] } });
  const rf = N.run(f, H.ctx(SR, 1), {});
  const stat = rf.events.filter((e) => e.name === 'stat').map((e) => [e.payload.key, e.payload.n, e.payload.total]);
  T.eq(stat, [['int', 2, 52], ['cha', 1, f.stats.cha]], 'the nightly furniture gain (step 7) and Mandatory Hats (step 9) raise `stat` events { key, n, total }');

  // W1-W request 3 (GDD §3.10, B-15 carHit): the ambulance-chaser call the morning after a car hit.
  const C = SR.tuning.world.carHit;
  const none = H.state(SR, {});
  N.run(none, H.ctx(SR, 1), {});
  T.ok(!none.msgs.some((m) => /^vm\.carhit\./.test(m.key)), 'no car hit, no call');
  const keys = new Set(), pays = [];
  let cheques = 0, lines = 0, right = 0;
  const n = 400;
  for (let seed = 1; seed <= n; seed++) {
    const s = H.state(SR, { money: { cash: 0 }, flags: { carHitVm: true } });
    const r = N.run(s, H.ctx(SR, seed), {});
    const vm = s.msgs.filter((m) => /^vm\.carhit\./.test(m.key));
    if (vm.length !== 1 || s.flags.carHitVm) continue;
    keys.add(vm[0].key);
    const line = r.lines.find((l) => l.key === 'report.carHitCheque');
    if (vm[0].vars.cheque) {
      cheques++;
      pays.push(vm[0].vars.n);
      if (line && line.vars.n === vm[0].vars.n && s.money.cash === vm[0].vars.n) lines++;
    } else if (!line && vm[0].vars.n === 0 && s.money.cash === 0) lines++;
    right++;
  }
  T.eq(right, n, 'one voicemail each morning after a hit; the flag is cleared');
  T.eq([...keys].sort(), ['vm.carhit.1', 'vm.carhit.2', 'vm.carhit.3'], 'one of three voicemails (orig)');
  T.ok(Math.abs(cheques / n - C.settlement.chance) < 0.06, '20 % carry a settlement cheque', cheques / n);
  T.ok(pays.every((p) => p >= 50 && p <= 200) && Math.min(...pays) < 80 && Math.max(...pays) > 170, 'of $50-$200 (50 + rand(0..150))', [Math.min(...pays), Math.max(...pays)]);
  T.eq(lines, n, 'a cheque is paid to cash with its report line; a plain call pays nothing');
  const lien = H.state(SR, { money: { cash: 0, lien: 1000 }, flags: { carHitVm: true } });
  let paid = null;
  for (let seed = 1; seed <= 60 && !paid; seed++) {
    const t = SR.util.clone(lien);
    N.run(t, H.ctx(SR, seed), {});
    const vm = t.msgs.find((m) => /^vm\.carhit\./.test(m.key));
    if (vm && vm.vars.cheque) paid = [vm.vars.n, t.money.cash, t.money.lien];
  }
  T.ok(paid && paid[1] === paid[0] - Math.floor(paid[0] / 2 + 0.5) && paid[2] === 1000 - (paid[0] - paid[1]), 'the cheque is income (`prize`): half goes to a lien', paid);

  // W1-E request R2: daily.shifts is a daily counter the night resets.
  const d = H.state(SR, { daily: { shifts: 2 } });
  N.run(d, H.ctx(SR, 1), {});
  T.eq(d.daily.shifts, 0, 'daily.shifts resets at night');
}

T.done();
