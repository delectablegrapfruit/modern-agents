// tests/node/election.test.cjs — owner: W1-C. SR.rules.election (GDD §4.17; BALANCE B-17): the
// nomination (the requirements, the Electoral Board's call, the lapse and the retry through the
// real night), the war chest and the starting poll (B-17's examples), the campaign actions (poll
// maths, caps, halving, the clamp, paths, checks, the scandal), the debate and its no-show, the
// rival's gain, the election roll, the office (salary, the karma flip) and the decrees (3 eligible
// cards, once-only decrees never return, their effects).
//   node tests/node/election.test.cjs
'use strict';
const K = require('./w1c-kit.cjs');

const T = K.L.suite('election (W1-C)');
const SR = K.boot();
K.fixtures(SR);
const E = SR.rules.election;
const TE = SR.tuning.election;

/** A candidate: the castle, $250,000 in the bank, stats and karma as given. */
function candidate(stats, extra) {
  const st = Object.assign({ str: 700, int: 700, cha: 700, karma: 60 }, stats || {});
  const s = K.state(SR, Object.assign({ homes: { owned: ['apt', 'castle'], living: 'castle' }, money: { cash: 0, bank: 250000 },
    stats: Object.assign({ hp: 15 + st.str, hpMax: 15 + st.str }, st) }, extra || {}));
  return s;
}

/** A candidate already campaigning with the given poll and campaign day. */
function campaigner(poll, day, path, extra) {
  const s = candidate(path === 'dictator' ? { str: 800, int: 800, cha: 800, karma: -60 } : {}, extra);
  Object.assign(s.election, { status: 'campaign', path: path || 'president', poll: poll, campaignDay: day || 1, chest: 50000 });
  s.money.cash = 1e6;
  return s;
}

T.section('the nomination requirements (B-17; orig)');
{
  T.eq(E.qualifies(candidate()), { ok: true, path: 'president', want: 'president', missing: [] }, 'President: castle, $200,000, all stats ≥ 666, karma ≥ +25');
  T.eq(E.qualifies(candidate({ str: 777, int: 777, cha: 777, karma: -25 })).path, 'dictator', 'Dictator: all stats ≥ 777, karma ≤ -25');
  T.eq(E.qualifies(candidate({ str: 776, karma: -25 })).missing, ['stats'], 'Dictator at 776: stats missing');
  T.eq(E.qualifies(candidate({ karma: 24 })).missing, ['karma'], 'karma +24: not enough');
  T.eq(E.qualifies(candidate({ cha: 665 })).missing, ['stats'], 'one stat at 665');
  const poor = candidate({}, { money: { cash: 100000, bank: 99999 } });
  T.eq(E.qualifies(poor).missing, ['money'], 'cash + bank $199,999');
  poor.money.cash = 100001;
  T.ok(E.qualifies(poor).ok, 'cash + bank counts (orig: cash only)');
  T.eq(E.qualifies(candidate({}, { homes: { living: 'mansion' } })).missing, ['home'], 'must live in the castle (orig)');
}

T.section('the Electoral Board calls; the offer lapses; another run (GDD §4.17, night steps 5 and 12)');
{
  const s = candidate({}, { clock: { day: 3 } });
  const r = E.nominationCheck(s);
  T.eq([r.nominated, s.election.status, s.election.path, s.election.nominatedDay, r.msgs[0].key, r.log[0].kind, r.events[0].payload],
    [true, 'nominated', 'president', 3, 'vm.board.nominated', 'nominated', { status: 'nominated', poll: 0 }], 'nominated: the call, the log, the event');
  T.eq(E.nominationCheck(s).nominated, false, 'not twice');
  const n = candidate({}, { clock: { day: 1, min: 1400 } });
  const rep = SR.rules.night.run(n, K.ctx(SR, 1), {});
  T.eq([n.election.status, n.msgs.some((m) => m.key === 'vm.board.nominated'), rep.lines.some((l) => l.key === 'toast.election.nominated'), n.log.today.some((e) => e.kind === 'nominated')],
    ['nominated', true, true, true], 'the morning check in the night: the voicemail, a report line, today\'s log');
  T.eq(n.election.nominatedDay, 2, 'the call comes on the morning of day 2');
  for (let d = 2; d <= 14; d++) SR.rules.night.run(n, K.ctx(SR, d), {});
  T.eq([n.clock.day, n.election.status], [15, 'nominated'], 'still open on day 15 (the 14th day of the offer)');
  SR.rules.night.run(n, K.ctx(SR, 15), {});
  T.eq([n.clock.day, n.election.status, n.election.retryFromDay], [16, 'none', 45], 'not accepted within 14 days: the offer lapses; a new run from 30 days later');
  n.clock.day = 44;
  T.eq(E.nominationCheck(n).nominated, false, 'not before retryFromDay');
  n.clock.day = 45;
  T.eq(E.nominationCheck(n).nominated, true, 'nominated again from day 45 (the original never allowed a second run)');
  const lost = candidate({}, { election: { status: 'lost', retryFromDay: 50 }, clock: { day: 50 } });
  T.eq(E.nominationCheck(lost).nominated, true, 'after a loss, from retryFromDay');
}

T.section('accepting: the war chest and the starting poll (B-17)');
{
  const a = candidate({ str: 700, int: 700, cha: 700, karma: 60 }, { election: { status: 'nominated', path: 'president' }, money: { cash: 150000, bank: 100000 } });
  const r = E.accept(a, 2);
  T.eq([a.election.status, a.election.poll, a.election.campaignDay, a.election.chest, a.money.cash, a.money.bank, a.election.runs],
    ['campaign', 66, 1, 200000, 0, 50000, 1], 'B-17 example: lowest 700, karma +60, $200k: 30 + 5 + 6 + 25 = 66 %; cash first, then the bank');
  T.eq(r.events[0].payload, { status: 'campaign', poll: 66 }, 'the election event');
  const b = candidate({ str: 666, int: 700, cha: 666, karma: 25 }, { election: { status: 'nominated', path: 'president' } });
  E.accept(b, 50000);
  T.eq(b.election.poll, 40.8, 'lowest 666, karma +25, $50k: 30 + 3.3 + 2.5 + 5 = 40.8 %');
  T.eq([E.chestTier(0).poll, E.chestTier(1).poll, E.chestTier(100000).poll, E.chestTier(7)], [5, 12, 12, null], 'the orig tiers: +5, +12, +25');
  const rp = K.features(SR, { perks: true });
  const m = candidate({ str: 666, int: 666, cha: 666, karma: 25 }, { election: { status: 'nominated' }, perks: { owned: ['magnetic'] } });
  E.accept(m, 0);
  T.eq(m.election.poll, 45.8, 'Magnetic: +5');
  rp();
  const dropped = candidate({ karma: 10 }, { election: { status: 'nominated' } });
  T.eq(E.accept(dropped, 0).reason, 'reason.notYet', 'the conditions must still hold when you accept');
  const broke = candidate({}, { election: { status: 'nominated' }, money: { cash: 0, bank: 200000 } });
  T.eq(E.accept(broke, 2).ok, undefined, 'the whole $200,000 from the bank');
  T.eq(E.accept(candidate(), 0).reason, 'reason.notNow', 'only while nominated');
  const kept = campaigner(50, 2);
  kept.money.bank = 0; kept.stats.karma = -80; kept.homes.living = 'apt';
  T.eq(E.campaign(kept, 'rally', K.ctx(SR)).ok, undefined, 'once accepted, the nomination is yours whatever happens (keepOnceAccepted)');
}

T.section('the campaign actions: poll maths, caps, halving, the clamp (B-17)');
{
  const s = campaigner(40, 2);
  s.stats.cha = 666;
  const r1 = E.campaign(s, 'rally', K.ctx(SR));
  const r2 = E.campaign(s, 'rally', K.ctx(SR));
  T.eq([r1.delta, r2.delta, s.election.poll, s.money.cash, s.clock.min], [3.7, 1.8, 45.5, 1e6 - 10000, 480 + 360],
    'Rally: +1 + CHA/250 (3.7 at CHA 666), the repeat half (1.8), rounded to 0.1; $5,000 and 3 h each');
  T.eq(E.campaign(s, 'rally', K.ctx(SR)).reason, 'reason.dailyLimit', 'Rally: 2 a day');
  T.eq([E.campaign(s, 'tvAd', K.ctx(SR)).delta, E.campaign(s, 'tvAd', K.ctx(SR)).reason], [4, 'reason.dailyLimit'], 'TV ad: +4, once a day');
  const k0 = s.stats.karma;
  T.eq([E.campaign(s, 'doorKnock', K.ctx(SR)).delta, E.campaign(s, 'doorKnock', K.ctx(SR)).delta, s.stats.karma - k0], [1, 0.5, 2], 'Door-knocking: +1, then +0.5; +1 karma each');
  T.eq(E.campaign(s, 'intimidate', K.ctx(SR)).reason, 'reason.notNow', 'Intimidate is the Dictator\'s');
  T.eq(E.campaign(s, 'kissBabies', K.ctx(SR)).reason, 'reason.featureOff', 'Kiss babies is P1 (civicPlus)');
  const rc = K.features(SR, { civicPlus: true });
  const kb = campaigner(40, 2);
  kb.stats.cha = 300;
  const kw = E.campaign(kb, 'kissBabies', { rng: K.scripted(SR, { float: [0.49] }) });
  const kl = E.campaign(kb, 'kissBabies', { rng: K.scripted(SR, { float: [0.51] }) });
  T.eq([kw.chance, kw.delta, kl.delta, kb.clock.min], [0.5, 1, 0, 600], 'Kiss babies: +1 on chance(CHA, 300), else 0; 1 h');
  rc();
  const d = campaigner(40, 2, 'dictator');
  T.eq(E.campaign(d, 'doorKnock', K.ctx(SR)).reason, 'reason.notNow', 'Door-knocking is the President\'s');
  d.stats.str = 500;
  const iw = E.campaign(d, 'intimidate', { rng: K.scripted(SR, { float: [0.4] }) });
  T.eq([iw.chance, iw.delta, d.stats.karma, d.stats.heat], [0.5, 3, -65, 10], 'Intimidate: +3 on chance(STR, 500), -5 karma, +10 Heat');
  const d2 = campaigner(40, 2, 'dictator');
  T.eq(E.campaign(d2, 'intimidate', { rng: K.scripted(SR, { float: [0.99] }) }).delta, -3, 'else -3');
  const br = campaigner(40, 2);
  const b1 = E.campaign(br, 'bribe', { rng: K.scripted(SR, { float: [0.5] }) });
  T.eq([b1.delta, br.stats.karma, br.stats.heat, br.money.cash, br.clock.min], [8, 50, 20, 1e6 - 50000, 540], 'Bribe officials: +8, -10 karma, +20 Heat, $50,000, 1 h');
  const b2 = E.campaign(campaigner(40, 2), 'bribe', { rng: K.scripted(SR, { float: [0.05] }) });
  T.eq([b2.delta, b2.toasts[0].key], [2, 'toast.election.scandal'], 'a 10 % scandal: -6 on top');
  let sc = 0;
  const rng = SR.rng.create(5);
  for (let i = 0; i < 20000; i++) if (E.campaign(campaigner(40, 2), 'bribe', { rng }).delta === 2) sc++;
  T.ok(K.near(sc / 20000, 0.10, 0.01), 'scandals happen 10 % of the time (' + (sc / 20000).toFixed(3) + ')');
  const top = campaigner(98, 2);
  E.campaign(top, 'tvAd', K.ctx(SR));
  T.eq(top.election.poll, 100, 'the poll is clamped to 100');
  const low = campaigner(2, 2, 'dictator');
  low.stats.str = 7;
  E.campaign(low, 'intimidate', { rng: K.scripted(SR, { float: [0.99] }) });
  T.eq(low.election.poll, 0, 'and to 0');
  const poorC = campaigner(40, 2);
  poorC.money.cash = 4999;
  T.eq(E.campaign(poorC, 'rally', K.ctx(SR)).reason, 'reason.needCash', 'a rally needs $5,000 cash');
  const lateC = campaigner(40, 2);
  lateC.clock.min = 1290;
  T.eq(E.campaign(lateC, 'rally', K.ctx(SR)).reason, 'reason.tooLate', 'and 3 h before midnight');
  T.eq(E.campaign(K.state(SR), 'rally', K.ctx(SR)).reason, 'reason.notNow', 'only while campaigning');
}

T.section('the campaign through the pipeline (cost fns, the half, refusals)');
{
  const s = campaigner(40, 2);
  s.stats.cha = 250;
  const pv = SR.rules.act.preview(s, 'testc.rally', {}, K.ctx(SR));
  T.eq([pv.ok, pv.cost.cash, pv.cost.min], [true, 5000, 180], 'the row\'s cost chips come from election.cash / election.min');
  const r = K.act(SR, s, 'rally', {}, 1);
  T.eq([r.ok, s.election.poll, s.money.cash, s.clock.min, r.events.map((e) => e.name)], [true, 42, 1e6 - 5000, 660, ['election']], 'paid once by the pipeline');
  K.act(SR, s, 'rally', {}, 2);
  T.eq([K.act(SR, s, 'rally').reason, s.election.poll], ['reason.dailyLimit', 43], 'the cap refuses the third');
  const t = K.act(SR, s, 'tvAd', {}, 1);
  T.eq([t.ok, s.money.cash, s.clock.min], [true, 1e6 - 10000 - 25000, 840], 'TV ad: $25,000, no time');
}

T.section('the debate (B-17: day 4 only, 3 questions, +3 / -2)');
{
  const s = campaigner(50, 3);
  T.eq(E.canDebate(s).reason, 'reason.wrongDay', 'day 4 only');
  s.election.campaignDay = 4;
  const st = E.debateStart(s, K.ctx(SR, 1, { id: 'cityhall.debate' }));
  T.eq([st.open.skin, st.open.params.D, st.open.params.beats, st.open.params.mode, st.open.resolve], ['debate', 500, 3, 'stance', 'cityhall.debate:resolve'],
    'the debate opens the Duel skin in stance mode at D 500');
  const r = E.debate(s, { beats: [true, false, true], wins: 2, losses: 1 });
  T.eq([r.delta, s.election.poll, s.election.debateDone], [4, 54, true], '+3 per won question, -2 per lost one');
  T.eq(E.debate(s, { wins: 3 }).reason, 'reason.alreadyDone', 'once');
  const w = campaigner(50, 4);
  E.debate(w, [false, false, false]);
  T.eq(w.election.poll, 44, 'three losses: -6');
}

T.section('campaign nights: the rival, the no-show, election night (night step 5)');
{
  const drops = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const s = campaigner(50, 2);
    SR.rules.night.run(s, K.ctx(SR, seed), {});
    drops.add(Math.round((50 - s.election.poll) * 10) / 10);
  }
  T.eq([...drops].sort(), [1, 2, 3], 'the rival campaigns too: poll -rand(1..3) a night');
  const ns = campaigner(50, 4);
  const rep = SR.rules.night.run(ns, K.ctx(SR, 2), {});
  const drop = rep.lines.filter((l) => l.key === 'report.election.rival')[0].vars.n;
  T.eq([ns.election.campaignDay, ns.election.poll], [5, 50 - drop - 5], 'no debate by the end of day 4: -5');
  const shown = campaigner(50, 4);
  shown.election.debateDone = true;
  const rep2 = SR.rules.night.run(shown, K.ctx(SR, 2), {});
  T.eq(shown.election.poll, 50 - rep2.lines.filter((l) => l.key === 'report.election.rival')[0].vars.n, 'after the debate: no penalty');
  // Election night: poll + rand(-5..5) ≥ 50.
  const roll = (poll, r) => E.electionNight(campaigner(poll, 8), K.scripted(SR, { int: [r] }));
  T.eq([roll(45, 5).won, roll(44.9, 5).won, roll(55, -5).won, roll(54.9, -5).won], [true, false, true, false], 'you win when poll + roll ≥ 50');
  const c = K.counting(SR.rng.create(3));
  E.electionNight(campaigner(50, 8), c);
  T.eq(c.draws, 1, 'one draw');
  const rng = SR.rng.create(8);
  let wins = 0;
  for (let i = 0; i < 22000; i++) if (E.electionNight(campaigner(50, 8), rng).won) wins++;
  T.ok(K.near(wins / 22000, 6 / 11, 0.01), 'at 50 %: P(win) = 6 / 11 (' + (wins / 22000).toFixed(3) + ')');
  const win = campaigner(52, 7, 'president', { clock: { day: 20 } });
  const wr = SR.rules.night.run(win, { rng: K.scripted(SR, { int: [(a) => a, (a, b) => b] }) }, {});
  T.ok(wr.election && typeof wr.election.won === 'boolean', 'the night hands the result to the election-night edition');
  const won = campaigner(60, 7, 'president', { clock: { day: 20 } });
  const x = E.electionNight(won, K.scripted(SR, { int: [0] }));
  T.eq([x.won, won.election.status, won.job.office, won.election.nextDecreeDay, x.msgs[0].key, x.log[0].kind], [true, 'office', 'president', 21, 'vm.doodle.concede', 'electionWon'],
    'a win takes office: job 8 (orig), the rival concedes');
  const lo = campaigner(40, 7, 'dictator', { clock: { day: 20 } });
  const y = E.electionNight(lo, K.scripted(SR, { int: [0] }));
  T.eq([y.won, lo.election.status, lo.job.office, lo.election.retryFromDay, y.msgs[0].key, lo.election.chest], [false, 'lost', null, 50, 'vm.crayon.gloat', 50000],
    'a loss: the money stays spent (orig); another run from 30 days later');
  // The whole thing through the real night: day 7 → election night → office → salary.
  const full = campaigner(90, 7, 'president', { clock: { day: 20 } });
  const cash = full.money.cash;
  const fr = SR.rules.night.run(full, K.ctx(SR, 4), {});
  T.eq([fr.election.won, full.job.office, full.election.status], [true, 'president', 'office'], 'election night inside the night (the report\'s election edition)');
  SR.rules.night.run(full, K.ctx(SR, 5), {});
  T.eq(full.money.cash - cash, TE.salary, '$10,000 every night wherever you sleep');
}

T.section('in office: the karma flip (GDD §4.17)');
{
  const s = candidate({ karma: -5 }, { job: { office: 'president' }, election: { status: 'office', path: 'president' }, clock: { day: 30 } });
  const m1 = E.officeMorning(s, SR.rng.create(1));
  E.officeMorning(s, SR.rng.create(1));
  T.eq([s.election.flipMornings, m1.lines[0].key], [2, 'toast.election.flipWarn'], 'a President below 0: the mornings are counted, with a warning');
  s.stats.karma = 0;
  E.officeMorning(s, SR.rng.create(1));
  T.eq(s.election.flipMornings, 0, 'the count resets when karma recovers');
  s.stats.karma = -1;
  E.officeMorning(s, SR.rng.create(1)); E.officeMorning(s, SR.rng.create(1));
  const r = E.officeMorning(s, SR.rng.create(1));
  T.eq([s.job.office, s.election.status, s.election.decrees, s.election.retryFromDay, r.log[0].kind, r.msgs[0].key], [null, 'removed', [], 60, 'removed', 'vm.board.impeached'],
    'three mornings in a row: impeached; decrees end; money kept; a new run from 30 days later');
  const d = candidate({ str: 800, int: 800, cha: 800, karma: 1 }, { job: { office: 'dictator' }, election: { status: 'office', path: 'dictator' }, clock: { day: 30 } });
  [1, 2, 3].forEach(() => E.officeMorning(d, SR.rng.create(1)));
  T.eq([d.job.office, d.election.status], [null, 'removed'], 'a Dictator above 0 for 3 mornings faces a coup');
  const n = candidate({ karma: -5 }, { job: { office: 'president' }, election: { status: 'office', path: 'president' } });
  SR.rules.night.run(n, K.ctx(SR, 1), {});
  T.eq(n.election.flipMornings, 1, 'the night runs the office morning');
}

T.section('decrees (P1 civicPlus): offers of 3 eligible, once-only never return');
{
  const office = (path, extra) => candidate(path === 'dictator' ? { str: 800, int: 800, cha: 800, karma: -60 } : {},
    Object.assign({ job: { office: path }, election: { status: 'office', path: path, nextDecreeDay: 21 }, clock: { day: 21 } }, extra || {}));
  const s = office('president');
  E.officeMorning(s, SR.rng.create(1));
  T.eq([s.election.offer, s.election.nextDecreeDay], [[], 21], 'no offers while civicPlus is off');
  const rc = K.features(SR, { civicPlus: true });
  const m = E.officeMorning(s, SR.rng.create(1));
  T.eq([s.election.offer.length, new Set(s.election.offer).size, s.election.nextDecreeDay, m.lines[0].key], [3, 3, 28, 'toast.election.decreeOffer'],
    'on taking office: 3 different decrees, the next offer in 7 days');
  const pool = E.eligible(office('president'));
  T.eq([pool.length, pool.indexOf('seizeBank'), pool.indexOf('universalFries') >= 0], [13, -1, true], 'the President\'s pool: every "any" decree and Universal Basic Fries');
  const dp = E.eligible(office('dictator'));
  T.eq([dp.length, dp.indexOf('universalFries'), dp.indexOf('seizeBank') >= 0], [13, -1, true], 'the Dictator\'s: Seize the Bank instead');
  let ok = true;
  const x = office('president');
  for (let seed = 1; seed <= 300; seed++) {
    x.election.decrees = ['beerSubsidy', 'guardRails'];
    x.election.decreesUsed = ['renameCity'];
    const o = E.decreeOffer(x, SR.rng.create(seed));
    ok = ok && o.length === 3 && new Set(o).size === 3 && o.every((id) => ['beerSubsidy', 'guardRails', 'renameCity', 'seizeBank'].indexOf(id) < 0);
  }
  T.ok(ok, 'offers never include an active decree, a used once-only decree, or the other path\'s');
  const c = K.counting(SR.rng.create(2));
  E.decreeOffer(office('president'), c);
  T.eq(c.draws, 3, 'one draw per card');
  const few = office('president', { election: { decrees: ['guardRails', 'freeFriesFriday', 'pedestrianSupremacy', 'casinoLevy', 'publicLibrary', 'beerSubsidy', 'fourDayWeek', 'nationalised', 'mandatoryHats', 'statueOfMe', 'toughOnCrime'], decreesUsed: ['renameCity'] } });
  T.eq(E.decreeOffer(few, SR.rng.create(1)), ['universalFries'], 'fewer than 3 eligible: the offer is shorter');

  const p = office('president', { money: { cash: 0, bank: 100 } });
  p.election.offer = ['universalFries', 'beerSubsidy', 'renameCity'];
  const k = p.stats.karma;
  const r = E.decree(p, 'universalFries', {}, K.ctx(SR));
  T.eq([p.election.decrees, p.election.decreesUsed, p.election.offer, p.stats.karma - k, r.events[0], r.log[0].kind],
    [['universalFries'], ['universalFries'], [], 10, { name: 'decree', payload: { id: 'universalFries' } }, 'decree'],
    'Universal Basic Fries: active, used for good, +10 karma; the offer closes');
  T.eq(E.decree(p, 'beerSubsidy', {}, K.ctx(SR)).reason, 'reason.notNow', 'only a decree on offer');
  const d = office('dictator', { money: { cash: 0, bank: 5000 } });
  d.election.offer = ['seizeBank'];
  E.decree(d, 'seizeBank', {}, K.ctx(SR));
  T.eq([d.money.cash, d.stats.karma, d.election.decreesUsed], [250000, -90, ['seizeBank']], 'Seize the Bank: +$250,000 once, -30 karma');
  T.eq(SR.rules.bank.interest(d), 0, 'and savings interest is 0 (js/rules/bank.js reads the decree)');
  d.job.office = null; d.election.decrees = []; d.election.status = 'removed';
  d.job.office = 'dictator'; d.election.status = 'office';
  T.eq(E.eligible(d).indexOf('seizeBank'), -1, 'a once-only decree never returns, even in a later term');
  const rn = office('president');
  rn.election.offer = ['renameCity'];
  T.eq(E.decree(rn, 'renameCity', { name: '   ' }, K.ctx(SR)).reason, 'reason.unavailable', 'Rename the City needs a name');
  E.decree(rn, 'renameCity', { name: '  New   Stickton On-The-Fold  ' }, K.ctx(SR));
  T.eq(rn.election.cityName, 'New Stickton On-', 'the name is trimmed to 16 characters and kept for the front page');
  const lib = office('president');
  T.eq(SR.reg.fn['decree.studyGain'](lib), SR.tuning.training.study.gain, 'Study gain: the B-03 value');
  lib.election.decrees = ['publicLibrary'];
  T.eq(SR.reg.fn['decree.studyGain'](lib), 3, 'the Public Library Act: Study +3 INT');
  // The GDD §4.17 numbers are tuning rows now (docs/requests/W1-C.md 7).
  const EL = SR.tuning.election;
  EL.publicLibrary.study = 5;
  T.eq(SR.reg.fn['decree.studyGain'](lib), 5, 'the Act\'s gain reads tuning.election.publicLibrary.study');
  EL.publicLibrary.study = 3;
  const uf = office('president');
  uf.election.offer = ['universalFries'];
  EL.universalFries.karma = 7;
  const k0 = uf.stats.karma;
  E.decree(uf, 'universalFries', {}, K.ctx(SR));
  EL.universalFries.karma = 10;
  T.eq(uf.stats.karma - k0, 7, 'Universal Basic Fries reads tuning.election.universalFries.karma');
  const rn2 = office('president');
  rn2.election.offer = ['renameCity'];
  EL.cityNameMax = 8;
  E.decree(rn2, 'renameCity', { name: 'Paper Heights' }, K.ctx(SR));
  EL.cityNameMax = 16;
  T.eq(rn2.election.cityName, 'Paper He', 'the name\'s length is tuning.election.cityNameMax');
  T.eq([E.decreeName(office('president'), 'toughOnCrime'), E.decreeName(office('dictator'), 'toughOnCrime')],
    ['decree.toughOnCrime.name', 'decree.toughOnCrime.martial'], 'Tough on Crime / Martial Law by path');
  // Through the pipeline: the decree row.
  const pl = office('president');
  pl.election.offer = ['casinoLevy', 'beerSubsidy', 'mandatoryHats'];
  const pr = K.act(SR, pl, 'decree', { id: 'mandatoryHats' }, 1);
  T.eq([pr.ok, pl.election.decrees, pl.log.today.some((e) => e.kind === 'decree')], [true, ['mandatoryHats'], true], 'the Mayor\'s Office row through the pipeline');
  const cha = pl.stats.cha;
  SR.rules.night.run(pl, K.ctx(SR, 1), {});
  T.eq(pl.stats.cha - cha, 1, 'Mandatory Hats: +1 CHA a night (night step 9)');
  // The campaign events (P1): 40 % of campaign mornings.
  let ev = 0;
  const erng = SR.rng.create(4);
  for (let i = 0; i < 10000; i++) if (E.campaignMorning(campaigner(50, 3), erng).event) ev++;
  T.ok(K.near(ev / 10000, 0.40, 0.015), 'campaign events on 40 % of campaign days (' + (ev / 10000).toFixed(3) + ')');
  const one = E.campaignMorning(campaigner(50, 3), K.scripted(SR, { float: [0.1], int: [0] }));
  T.eq([one.event, one.lines[0].key], ['scandal', 'toast.election.event.scandal'], 'one of the 12 of B-17');
  rc();
  T.eq(E.campaignMorning(campaigner(50, 3), SR.rng.create(1)).event, null, 'none while civicPlus is off');
}

T.done();
