// tests/node/crime.test.cjs — owner: W2-RulesC (W1-C in wave 1). SR.rules.crime (GDD §4.10; BALANCE B-11, B-28b): the
// robbery preconditions and start, the Hold-up odds by Monte Carlo (10⁵) against B-11b's reference,
// the loot and the lose path, the bank's 14-day memory, jail length and the arrest / Jail Day /
// release flow through the real night, bail, the Precinct fine, police stops, the interrogation,
// and the pipeline integration of the named fns. Also the package-wide hygiene checks (text keys,
// lengths, colour literals, Math.random, banned strings) for every W1-C file.
//   node tests/node/crime.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const K = require('./w1c-kit.cjs');

const T = K.L.suite('crime (W2-RulesC)');
const SR = K.boot();
K.fixtures(SR);
const C = SR.rules.crime;
const TU = SR.tuning.crime;

T.section('robbery preconditions (B-11b)');
{
  const s = K.state(SR, { clock: { min: 900 } });
  T.eq(C.robPrecheck(s, 'store').reason, 'reason.needItem', 'no gun: refused');
  s.items.gun = 1; s.items.ammo = 9;
  T.eq([C.robPrecheck(s, 'store').reason, C.robPrecheck(s, 'store').vars.n], ['reason.needItems', 10], 'ammo 9: refused (needs ≥ 10, orig)');
  s.items.ammo = 10;
  T.ok(C.robPrecheck(s, 'store').ok, 'gun and 10 ammo: allowed');
  s.clock.min = 1230;
  T.ok(C.robPrecheck(s, 'store').ok, 'a robbery can start at 20:30');
  s.clock.min = 1260;
  T.eq(C.robPrecheck(s, 'store').reason, 'reason.robLate', 'and not at 21:00 (orig time < 21)');
  s.clock.min = 900; s.stats.str = 99;
  T.eq(C.robPrecheck(s, 'bank').reason, 'reason.needStat', 'the bank needs STR 100');
  s.stats.str = 100;
  T.ok(C.robPrecheck(s, 'bank').ok, 'STR 100: the bank is allowed');
  s.weekly.bankRob = 1;
  T.eq(C.robPrecheck(s, 'bank').reason, 'reason.weeklyLimit', 'once a week');
  s.clock.min = 1260;
  T.eq(C.robPrecheck(s, 'bank').reason, 'reason.weeklyLimit', 'the first failing rule is the reason');
}

T.section('the start of a robbery: win or lose (B-11b)');
{
  const used = new Set();
  let ok = true;
  for (let seed = 1; seed <= 400; seed++) {
    const s = K.state(SR, { items: { gun: 1, ammo: 30 }, clock: { min: 600 } });
    const r = C.rob(s, 'store', K.ctx(SR, seed, { id: 'store.rob' }));
    used.add(30 - s.items.ammo);
    ok = ok && s.stats.karma === -10 && s.stats.heat === 30 && s.clock.min === 1440 && r.open.skin === 'holdup';
  }
  T.eq([...used].sort(), [5, 6, 7, 8, 9], 'uses rand(5..9) ammo (orig)');
  T.ok(ok, 'store: -10 karma, +30 Heat, the clock to 24:00, the holdup skin opens');
  const s = K.state(SR, { items: { gun: 1, ammo: 12 }, stats: { heat: 20 }, clock: { min: 600 } });
  const r = C.rob(s, 'store', K.ctx(SR, 3, { id: 'store.rob' }));
  T.eq([r.open.minigame, r.open.resolve, r.open.params.D, r.open.params.check, r.open.params.stake, r.open.params.need],
    ['holdup', 'store.rob:resolve', 80, 'holdup.store', true, 2], 'Result.open: D = 60 + Heat before this robbery, check holdup.store, stake');
  const b = K.state(SR, { items: { gun: 1, ammo: 12 }, stats: { str: 150, heat: 10 }, clock: { min: 600 } });
  const rb = C.rob(b, 'bank', K.ctx(SR, 3, { id: 'bank.rob' }));
  T.eq([b.stats.karma, b.stats.heat, b.weekly.bankRob, b.crime.bankRobDays, rb.open.params.D],
    [-20, 70, 1, [1], 410], 'bank: -20 karma, +60 Heat, the week used, remembered; D = 400 + Heat');
  const bad = K.state(SR, { clock: { min: 600 } });
  T.eq(C.rob(bad, 'store', K.ctx(SR)).ok, false, 'rob() refuses when the precheck fails');
}

T.section('Hold-up odds: Monte Carlo 10⁵ against B-11b (±2 %)');
{
  // Reference, store, Heat 0, CHA every beat: CHA 50 → 45 % a beat, 43 % to win; 100 → 62.5 %,
  // 68 %; 300 → 83 %, 93 %.
  [[50, 0.45, 0.43], [100, 0.625, 0.68], [300, 0.83, 0.93]].forEach(([cha, pBeat, pWin]) => {
    const s = K.state(SR, { stats: { str: 7, int: 7, cha: cha } });
    const params = C.holdupParams(s, 'store');
    T.ok(K.near(params.chances.cha, pBeat, 0.02), 'CHA ' + cha + ': the shown chance ' + params.chances.cha.toFixed(4) + ' ≈ ' + pBeat);
    const rng = SR.rng.create(1000 + cha);
    let wins = 0, beats = 0, won = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const r = C.holdupAuto(s, params, rng);
      beats += r.beats.length;
      wins += r.wins;
      if (r.wins >= 2) won++;
    }
    T.ok(K.near(wins / beats, pBeat, 0.02), 'CHA ' + cha + ': per beat ' + (wins / beats).toFixed(4) + ' within ±0.02 of ' + pBeat);
    T.ok(K.near(won / N, pWin, 0.02), 'CHA ' + cha + ': best of three ' + (won / N).toFixed(4) + ' within ±0.02 of ' + pWin);
  });
  const s = K.state(SR, { stats: { str: 7, int: 7, cha: 7 } });
  T.eq(C.holdupAuto(s, C.holdupParams(s, 'store'), SR.rng.create(2)).picks.every((p) => p === 'sweetTalk' || p === 'intimidate' || p === 'outwit'), true, 'Auto picks one of the three options');
  const hi = K.state(SR, { stats: { str: 300, int: 7, cha: 7 } });
  T.eq(C.holdupAuto(hi, C.holdupParams(hi, 'store'), SR.rng.create(2)).picks[0], 'intimidate', 'Auto takes the best shown odds (STR here)');
}

T.section('check modifiers on the Hold-up (B-28b)');
{
  const s = K.state(SR, { stats: { cha: 100 } }, { difficulty: 'relaxed' });
  T.ok(K.near(C.holdupChances(s, 'store').cha, 0.625 + 0.10, 1e-9), 'Relaxed: +0.10 on every beat');
  const ev = K.state(SR, { stats: { cha: 100, karma: -60 } });
  T.ok(K.near(C.holdupChances(ev, 'store').cha, 0.625, 1e-9), 'Bad karma: nothing while karmaTiers is off');
  const r = K.features(SR, { karmaTiers: true, perks: true });
  T.ok(K.near(C.holdupChances(ev, 'store').cha, 0.775, 1e-9), 'Bad karma (P1): +0.15');
  const st = K.state(SR, { stats: { str: 100 }, perks: { owned: ['intimidating'] } });
  T.ok(K.near(C.holdupChances(st, 'store').str, 100 / 140, 1e-9), 'Intimidating: STR beats D - 20');
  T.ok(K.near(C.holdupChances(K.state(SR, { stats: { cha: 999, karma: -100 } }), 'store').cha, 0.95, 1e-9), 'capped at 0.95');
  r();
}

T.section('the loot and the lose path');
{
  let lo = Infinity, hi = -Infinity;
  for (let seed = 1; seed <= 3000; seed++) {
    const s = K.state(SR, { money: { cash: 0 } });
    C.robResolve(s, 'store', { beats: [true, true], wins: 2, losses: 0 }, K.ctx(SR, seed));
    lo = Math.min(lo, s.money.cash); hi = Math.max(hi, s.money.cash);
  }
  T.ok(lo >= 100 && hi <= 599 && lo < 110 && hi > 590, 'store loot 100 + rand(0..499): seen ' + lo + '..' + hi);
  const x = K.state(SR, { money: { cash: 0 } });
  const lowRng = K.scripted(SR, { int: [(a) => a] }), highRng = K.scripted(SR, { int: [(a, b) => b] });
  C.robResolve(x, 'bank', [true, false, true], { rng: lowRng });
  const y = K.state(SR, { money: { cash: 0 } });
  C.robResolve(y, 'bank', [true, true], { rng: highRng });
  T.eq([x.money.cash, y.money.cash], [3000, 15000], 'bank loot 3,000 + rand(0..12,000), both ends');
  const lien = K.state(SR, { money: { cash: 0, lien: 400 } });
  C.robResolve(lien, 'store', [true, true], { rng: lowRng.int ? K.scripted(SR, { int: [0] }) : null });
  T.eq([lien.money.cash, lien.money.lien], [50, 350], 'loot is income through the lien (half of $100)');
  const w = K.state(SR, { money: { cash: 0 } });
  const rw = C.robResolve(w, 'store', { wins: 2 }, K.ctx(SR, 4));
  T.eq([rw.events[0].name, rw.events[0].payload.outcome, rw.log[0].kind, rw.stamps[0].key], ['rob', 'win', 'storeRobbery', 'stamp.crime.store'], 'a win: rob event, log, stamp');

  const s = K.state(SR, { items: { gun: 1, ammo: 20 }, stats: { heat: 30 }, clock: { min: 1440 } });
  const r = C.robResolve(s, 'store', { beats: [false, true, false], wins: 1, losses: 2 }, K.ctx(SR, 9));
  T.eq([r.jailed, r.events[0].payload.outcome, s.items.gun, s.items.ammo], [{ reason: 'store', days: 4 }, 'lose', 1, 20],
    'a store failure: jail 3 + floor(30 / 25) days; the gun and ammo stay');
  const b = K.state(SR, { items: { gun: 1, ammo: 20 }, stats: { heat: 60, str: 200 }, clock: { min: 1440 } });
  const rb = C.robResolve(b, 'bank', [false, false], K.ctx(SR, 9));
  T.eq([rb.jailed.days, b.items.gun, b.items.ammo], [9, 0, 0], 'a bank failure: jail 7 + floor(60 / 25); gun and ammo confiscated');
}

T.section('the bank remembers robberies for 14 days (B-11b D)');
{
  const s = K.state(SR, { items: { gun: 1, ammo: 99 }, stats: { str: 200 }, clock: { day: 1, min: 480 } });
  const D0 = C.holdupD(s, 'bank');
  C.rob(s, 'bank', K.ctx(SR, 1));
  s.clock.day = 8; s.clock.min = 480; s.stats.heat = 0; s.weekly.bankRob = 0;
  T.eq([D0, C.holdupD(s, 'bank')], [400, 500], 'one robbery in the last 14 days: D + 100');
  C.rob(s, 'bank', K.ctx(SR, 2));
  s.clock.day = 14; s.stats.heat = 0;
  T.eq(C.holdupD(s, 'bank'), 600, 'two robberies: D + 200');
  s.clock.day = 15;
  T.eq(C.holdupD(s, 'bank'), 500, 'the day-1 robbery is 14 days old on day 15 and no longer counts');
  // The night prunes the memory (step 10) with the same window.
  const n = K.state(SR, { clock: { day: 14 }, crime: { bankRobDays: [1, 8] } });
  SR.rules.night.run(n, K.ctx(SR, 1), {});
  T.eq(n.crime.bankRobDays, [8], 'the night prunes days older than 14');
}

T.section('jail length and bail (B-11c)');
{
  const s = K.state(SR, { stats: { heat: 49 } });
  T.eq(['store', 'bank', 'bust', 'police', 'questioning', 'other'].map((r) => C.jailDays(s, r)), [4, 8, 6, 3, 3, 3],
    'base + floor(Heat / 25): store 3, bank 7, bust 5 (orig), police 2');
  const h = K.state(SR, { stats: { heat: 0 } }, { difficulty: 'hardcore' });
  T.eq(C.jailDays(h, 'store'), 5, 'Hardcore store base 5 (orig)');
  const r = K.features(SR, { perks: true, police: true });
  const cr = K.state(SR, { stats: { heat: 0 }, perks: { owned: ['charmingRogue'] } });
  T.eq([C.jailDays(cr, 'store'), C.jailDays(cr, 'police')], [1, 1], 'Charming Rogue: -2 days, minimum 1');
  const rich = K.state(SR, { money: { cash: 0, bank: 100000 } });
  const poor = K.state(SR, { money: { cash: 0, bank: 0 } });
  T.eq([C.bailBase(rich), C.bailBase(poor)], [2000 + Math.floor(0.02 * (SR.rules.endgame.netWorth(rich) - 100000)), 500],
    'bail per day: max($500, 2 % of net worth at arrest)');
  const j = K.state(SR, { money: { cash: 5000, bank: 100000 }, items: { phone: 1 }, stats: { heat: 50 } });
  C.jail(j, 'store', K.ctx(SR, 3));
  T.eq([j.jail.daysLeft, j.jail.bailBase], [4, C.bailBase(K.state(SR, { money: { cash: 5000, bank: 100000 } }))], 'the arrest stores the per-day bail; the arrest night served day 1 of 5');
  T.eq(C.bail(j), 4 * j.jail.bailBase, 'bail = remaining days × the per-day amount');
  j.perks.owned.push('charmingRogue');
  T.eq(C.bail(j), 2 * j.jail.bailBase, 'Charming Rogue: bail ×0.5 (price target bail)');
  j.perks.owned = [];
  const cost = C.bail(j), before = j.money.cash + j.money.bank;
  const pb = C.payBail(j);
  T.eq([j.jail, j.stats.heat, j.money.cash + j.money.bank, pb.events[0].name, pb.events[0].payload.bailed], [null, 20, before - cost, 'release', true],
    'paying bail releases you (cash then bank), Heat set to 20');
  const nophone = K.state(SR, { money: { cash: 99999 } });
  C.jail(nophone, 'police', K.ctx(SR, 1));
  T.eq(C.canBail(nophone).reason, 'reason.needPhone', 'bail needs a phone');
  r();
  T.eq(C.canBail(nophone).reason, 'reason.featureOff', 'bail is P1 (police)');
}

T.section('arrest, Jail Day and release through the real night (GDD §4.10, §4.7)');
{
  const s = K.state(SR, { clock: { day: 3, min: 1440 }, stats: { heat: 30, str: 50, int: 40, cha: 30, hp: 20 }, money: { cash: 100, bank: 1000 } });
  const r = C.jail(s, 'store', K.ctx(SR, 11));
  T.eq([r.days, s.jail.daysLeft, s.jail.served, s.clock.day, s.clock.min], [4, 3, 1, 4, 480], 'the arrest night runs at once: day 4, 08:00 in the cell, 3 days left');
  T.eq([r.report.kind, r.report.endedDay, s.log.yesterday.some((e) => e.kind === 'jailed')], ['jail', 3, true], 'the report is a jail night; the arrest is in yesterday\'s log (the headline)');
  T.eq([s.stats.hp, s.records.jailDays], [20, 1], 'no HP restore in jail; jail days recorded');
  const d1 = C.jailDay(s, 'str', K.ctx(SR, 12));
  T.eq([s.stats.str, s.stats.hpMax, s.jail.daysLeft, s.clock.day, d1.events[0].payload], [52, 67, 2, 5, { id: 'jail.str', stat: 'str', n: 2 }],
    'Work out: +2 STR (HP max with it), then the jail night');
  C.jailDay(s, 'int', K.ctx(SR, 13));
  T.eq([s.stats.int, s.jail.daysLeft], [42, 1], 'Read: +2 INT');
  const last = C.jailDay(s, 'hp', K.ctx(SR, 14));
  T.eq([s.stats.hp, s.jail, s.stats.heat, s.clock.min, last.released, last.events.some((e) => e.name === 'release')],
    [30, null, 20, 480, true, true], 'Keep your head down: +10 HP; the last night releases you at 08:00 with Heat 20');
  T.eq([s.records.jailDays, s.records.jailWorkouts], [4, 1], 'four jail nights, one workout');
  T.eq(C.jailDay(s, 'str', K.ctx(SR, 1)).ok, false, 'no Jail Day outside jail');
  const one = K.state(SR, { stats: { heat: 0 }, perks: { owned: ['charmingRogue'] } });
  const rp = K.features(SR, { perks: true });
  const r1 = C.jail(one, 'police', K.ctx(SR, 2));
  T.eq([r1.days, one.jail, r1.events.map((e) => e.name)], [1, null, ['jail', 'release']], 'a one-day sentence ends with the arrest night');
  rp();
  const tr = K.features(SR, { tours: true });
  const f = K.state(SR, { stats: { cha: 10 } });
  C.jail(f, 'police', K.ctx(SR, 2));
  C.jailDay(f, 'cha', K.ctx(SR, 5));
  T.eq([f.stats.cha, Object.values(f.trade.rep).reduce((a, b) => a + b, 0)], [12, 1], 'Make friends: +2 CHA and (P1 tours) +1 reputation in a random city');
  tr();
  const camp = K.state(SR, { election: { status: 'campaign', campaignDay: 2, poll: 50, path: 'president' } });
  C.jail(camp, 'police', K.ctx(SR, 2));
  T.eq(camp.election.campaignDay, 3, 'the arrest night is a campaign day too');
}

T.section('the Precinct fine, police stops, the interrogation (P1, B-11d, B-30)');
{
  const s = K.state(SR, { stats: { heat: 40 }, money: { cash: 1000 } });
  T.eq([C.fine(s, 10).ok, s.money.cash, s.stats.heat], [undefined, 500, 30], 'fine: $50 per Heat point');
  T.eq(C.fine(s, 500).ok, false, 'short of cash for 30 points ($1,500): refused');
  s.money.cash = 99999;
  C.fine(s, 500);
  T.eq(s.stats.heat, 0, 'any number of points up to your Heat');
  const p = K.state(SR, { stats: { cha: 100, heat: 50 } });
  T.ok(K.near(C.talkChance(p), 100 / 250, 1e-9), 'Talk: chance(CHA, 50 + 2 × Heat)');
  const tx = C.policeTalk(p, { rng: K.scripted(SR, { float: [0] }) });
  T.eq([tx.outcome, p.stats.heat], ['talked', 40], 'a successful talk: -10 Heat');
  const tf = C.policeTalk(p, { rng: K.scripted(SR, { float: [0.99] }) });
  T.eq([tf.outcome, p.stats.heat], ['failed', 40], 'a failed talk changes nothing (pick again)');
  const rf = K.features(SR, { perks: true });
  p.perks.owned.push('fastTalker');
  T.ok(K.near(C.talkChance(p), 100 / 190, 1e-9), 'Fast Talker: D - 40');
  T.eq(C.bribeCost(p), 400, 'Fast Talker: the bribe ×0.5 ($20 × Heat 40 = $800 → $400)');
  p.perks.owned = [];
  rf();
  p.money.cash = 700;
  T.eq(C.policeBribe(p).ok, false, 'a bribe of $800 with $700: refused');
  p.money.cash = 1000;
  C.policeBribe(p);
  T.eq([p.money.cash, p.stats.heat, p.stats.karma], [200, 10, -3], 'bribe: $20 × Heat, -30 Heat, -3 karma');
  const run = K.state(SR, { stats: { heat: 75 } });
  T.eq(C.policeRun(run, false).outcome, 'escaped', 'an escape costs nothing');
  const caught = C.policeRun(run, true, K.ctx(SR, 1));
  T.eq([caught.outcome, caught.jailed], ['caught', { reason: 'police', days: 5 }], 'caught: jail 2 + floor(Heat / 25)');
  const i1 = K.state(SR, { stats: { heat: 60 } });
  C.interrogation(i1, { beats: [true, false, true], wins: 2 });
  T.eq([i1.stats.heat, i1.jail], [50, null], 'interrogation won: -10 Heat');
  const i2 = K.state(SR, { stats: { heat: 60 } });
  const ri = C.interrogation(i2, { beats: [true, false, false], wins: 1 }, K.ctx(SR, 1));
  T.eq(ri.jailed, { reason: 'questioning', days: 4 }, 'lost: jail 2 + floor(Heat / 25) ("questioning")');
}

T.section('McHolland at the Precinct desk (P1 police; B-27)');
{
  const s = K.state(SR, { stats: { heat: 45, karma: 10 }, npc: { mcholland: { stage: 'informant' } } });
  T.eq(C.mchollandTip(s).reason, 'reason.featureOff', 'P1 (police)');
  const r = K.features(SR, { police: true });
  C.mchollandTip(s);
  T.eq([s.stats.heat, s.weekly.mchollandTip, C.mchollandTip(s).reason], [22, 1, 'reason.weeklyLimit'], 'Pass a tip: Heat × 0.5 (floor), once a week');
  T.eq(C.mchollandTip(K.state(SR, { stats: { heat: 40 } })).reason, 'reason.notNow', 'informants only');
  T.eq(C.mchollandTip(K.state(SR, { stats: { heat: 40, karma: -80 }, npc: { mcholland: { stage: 'informant' } } })).reason, 'reason.notNow', 'not at Wicked karma');
  const b = K.state(SR, { stats: { karma: -1, heat: 10 }, money: { cash: 2500 }, clock: { day: 5 } });
  C.mchollandBribe(b);
  T.eq([b.money.cash, b.npc.mcholland.bribedUntil], [500, 11], 'the bribe: $2,000, no Heat gains for 7 days (days 5-11)');
  b.clock.day = 11;
  SR.rules.stats.heat(b, 30);
  T.eq(b.stats.heat, 10, 'no Heat gains on day 11');
  b.clock.day = 12;
  SR.rules.stats.heat(b, 30);
  T.eq(b.stats.heat, 40, 'Heat again on day 12');
  T.eq(C.mchollandBribe(K.state(SR, { stats: { karma: 0 }, money: { cash: 9999 } })).reason, 'reason.karmaHigh', 'only at karma < 0');
  r();
}

T.section('through the action pipeline (named fns)');
{
  const s = K.state(SR, { items: { gun: 1, ammo: 15 }, clock: { min: 1200 }, stats: { cha: 100 } });
  const snap = K.json(s);
  const pv = SR.rules.act.preview(s, 'testc.robStore', {}, K.ctx(SR));
  T.eq([pv.ok, K.json(s)], [true, snap], 'the preview never mutates');
  const r = K.act(SR, s, 'robStore', {}, 5);
  T.eq([r.ok, r.open.minigame, r.open.resolve, s.clock.min], [true, 'holdup', 'testc.robStore:resolve', 1440], 'the row opens the Hold-up');
  T.eq(r.deltas.filter((d) => ['karma', 'heat', 'item'].indexOf(d.kind) >= 0).map((d) => d.kind + ':' + d.n).slice(0, 2), ['karma:-10', 'heat:30'],
    'the start is reported in the deltas');
  const z = K.act(SR, s, 'robStore:resolve', { beats: [false, false], wins: 0, losses: 2 }, 6);
  T.eq([z.ok, z.jailed, !!z.report, s.clock.day, z.events.map((e) => e.name)], [true, { reason: 'store', days: 4 }, true, 2, ['rob', 'jail']],
    'the resolve jails you, runs the arrest night and hands its report over');
  const late = K.state(SR, { items: { gun: 1, ammo: 15 }, clock: { min: 1260 } });
  T.eq(K.act(SR, late, 'robStore').reason, 'reason.robLate', 'the robbery time rule refuses 21:00');
  const w = K.state(SR, { items: { gun: 1, ammo: 15 }, clock: { min: 600 } });
  K.act(SR, w, 'robStore', {}, 1);
  const wr = K.act(SR, w, 'robStore:resolve', { beats: [true, true], wins: 2 }, 1);
  T.eq([wr.ok, wr.events[0].payload.outcome, wr.log.map((l) => l.kind), w.log.today.some((e) => e.kind === 'storeRobbery')], [true, 'win', ['storeRobbery'], true],
    'a won robbery: the loot, the log entry delivered');
  const j = K.state(SR, { stats: { heat: 0 } });
  C.jail(j, 'bank', K.ctx(SR, 1));
  const jd = K.act(SR, j, 'jailDay', { choice: 'cha' }, 3);
  T.eq([jd.ok, j.stats.cha, !!jd.report], [true, 9, true], 'Jail Day through the pipeline (params.choice)');
  T.eq(K.act(SR, K.state(SR), 'jailDay', { choice: 'str' }).reason, 'reason.notNow', 'refused outside jail, state untouched');

  // Review probes: only today's robbery in progress can be resolved, once; its target wins.
  const none = K.state(SR, { money: { cash: 0 } });
  T.eq([K.act(SR, none, 'robBank:resolve', { beats: [true, true], wins: 2 }, 1).reason, none.money.cash], ['reason.notNow', 0],
    'no robbery in progress: a resolve pays no loot');
  const once = K.state(SR, { items: { gun: 1, ammo: 15 }, clock: { min: 600 }, money: { cash: 0 } });
  K.act(SR, once, 'robStore', {}, 1);
  T.eq(once.crime.open, { target: 'store', day: 1 }, 'the start marks the robbery in progress');
  const first = K.act(SR, once, 'robBank:resolve', { beats: [true, true], wins: 2 }, 1);
  const loot = once.money.cash;
  T.eq([first.ok, first.events[0].payload.target, loot >= 100 && loot <= 599, once.crime.open], [true, 'store', true, null],
    'the open robbery\'s target (the store) wins over the data\'s argument, and it closes');
  T.eq([K.act(SR, once, 'robStore:resolve', { beats: [true, true], wins: 2 }, 2).reason, once.money.cash], ['reason.notNow', loot],
    'a repeated resolve is refused');
  const stale = K.state(SR, { items: { gun: 1, ammo: 15 }, clock: { min: 600 } });
  K.act(SR, stale, 'robStore', {}, 1);
  stale.clock.day += 1;
  T.eq(K.act(SR, stale, 'robStore:resolve', { beats: [true, true], wins: 2 }, 1).reason, 'reason.notNow', 'a robbery from an earlier day is not resolved later');
}

T.section('the game can end in jail (GDD §4.10 "jail days count toward a timed game"; W2-RulesC)');
{
  // Arrested on the last day of a 15-day game: the arrest night ends the game; the Result says so.
  const s = K.state(SR, { clock: { day: 15, min: 1200 }, items: { gun: 1, ammo: 12 } }, { length: 15 });
  K.act(SR, s, 'robStore', {}, 3);
  const r = K.act(SR, s, 'robStore:resolve', { beats: [false, false], wins: 0, losses: 2 }, 4);
  T.eq([r.ok, r.jailed.reason, r.over, s.over, s.result.reason, r.report.ended, !!s.jail], [true, 'store', { reason: 'time' }, true, 'time', 'time', true],
    'the arrest night of the last day ends the game (Result.over, the report\'s `ended`)');
  T.eq(K.act(SR, s, 'jailDay', { choice: 'str' }, 5).reason, 'reason.gameOver', 'no Jail Day after the end');
  // Serving a sentence across the last day: a Jail Day's night ends it.
  const j = K.state(SR, { clock: { day: 13, min: 1440 } }, { length: 15 });
  C.jail(j, 'store', K.ctx(SR, 1));
  const d14 = K.act(SR, j, 'jailDay', { choice: 'int' }, 5);
  T.eq([d14.ok, d14.over, j.clock.day], [true, null, 15], 'day 14 in the cell: the game goes on');
  const d15 = K.act(SR, j, 'jailDay', { choice: 'int' }, 6);
  T.eq([d15.ok, d15.over, j.over, d15.report.ended], [true, { reason: 'time' }, true, 'time'], 'the night after day 15 ends the game in jail');
  // A sentence served by jail nights run outside jailDay (a debug night, the simulator): the next
  // Jail Day releases at once, whatever the choice, with no gain and no further night.
  const dbg = K.state(SR, { stats: { heat: 0 } });
  C.jail(dbg, 'police', K.ctx(SR, 1));
  SR.rules.night.run(dbg, K.ctx(SR, 2), { kind: 'jail' });
  const at = [dbg.clock.day, dbg.stats.str, dbg.jail.daysLeft];
  const rel = C.jailDay(dbg, 'rest', K.ctx(SR, 3));
  T.eq([at[2], rel.released, dbg.jail, dbg.clock.day, dbg.stats.str, dbg.stats.heat, rel.events.map((e) => e.name)], [0, true, null, at[0], at[1], 20, ['release']],
    'daysLeft 0: released at once (no gain, no night, Heat 20)');
  const keep = K.state(SR, { clock: { day: 15, min: 1440 }, mode: { keepPlaying: true } }, { length: 15 });
  const kr = K.act(SR, keep, 'arrest', {}, 2);
  T.eq([kr.ok, kr.over, keep.over], [true, null, false], 'Keep playing: the sentence goes on');
}

T.section('package hygiene: every W1-C file');
{
  const root = K.L.ROOT;
  const files = ['js/rules/crime.js', 'js/rules/trade.js', 'js/rules/fight.js', 'js/rules/casino.js', 'js/rules/election.js',
    'js/data/cities.js', 'js/data/fighters.js', 'js/data/decrees.js', 'js/data/text/en-conflict.js'];
  const src = {};
  files.forEach((f) => { src[f] = fs.readFileSync(path.join(root, f), 'utf8'); });
  T.ok(files.every((f) => !/stub, owner/.test(src[f])), 'no file is still a stub');
  T.ok(files.every((f) => !/Math\.random/.test(src[f])), 'no Math.random');
  T.ok(files.every((f) => !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/.test(src[f])), 'no colour literals');
  const banned = ['StickNews', 'Pure Energy', 'GIRL SCOUT', 'BOY SCOUT', 'WUSS', 'Taquisha', 'DJ Beefstick', 'Super Slots 3000',
    'Lucky Stick 3000', 'Drunken Darts', 'YOU DIED', 'HEYZEUS', 'XGen'];
  const words = ['Brooklyn', 'Detroit', 'Camden', 'Richard', 'Stuart', 'Debbie', 'XGS', 'FSY', 'DYC', 'MLG', 'SR2', 'SAR'];
  const hits = [];
  files.forEach((f) => {
    const low = src[f].toLowerCase();
    banned.forEach((b) => { if (low.indexOf(b.toLowerCase()) >= 0) hits.push(f + ': ' + b); });
    words.forEach((w) => { if (new RegExp('\\b' + w + '\\b', 'i').test(src[f])) hits.push(f + ': ' + w); });
  });
  T.eq(hits, [], 'no banned strings (BUILD_PLAN Appendix A)');

  // Every text key the rules and data name in my namespaces resolves in en-conflict.js.
  const MINE = /^(city|fighter|decree|crime|trip)\.|^(toast|stamp)\.(crime|trade|fight|election)\./;
  const keys = new Set();
  files.filter((f) => !/en-conflict/.test(f)).forEach((f) => {
    // Quoted keys that are not concatenated, not a named fn and not a palette key ('fighter.6').
    const re = /'((?:city|fighter|decree|crime|trip|toast|stamp)\.[A-Za-z0-9_.]+)'(?!\s*\+)/g;
    let m;
    while ((m = re.exec(src[f]))) {
      const k = m[1];
      if (MINE.test(k) && !/\.$/.test(k) && !SR.reg.fn[k] && !/^fighter\.\d+$/.test(k)) keys.add(k);
    }
  });
  // Keys built at run time.
  ['store', 'bank'].forEach((t) => { keys.add('toast.crime.' + t + 'Win'); keys.add('toast.crime.' + t + 'Lose'); keys.add('stamp.crime.' + t); });
  SR.registry.entries('city').forEach((e) => ['name', 'blurb', 'wants'].forEach((k) => keys.add('city.' + e.id + '.' + k)));
  SR.registry.entries('fighter').forEach((e) => { keys.add(e.def.name); if (e.def.quirkText) keys.add(e.def.quirkText); });
  SR.registry.entries('decree').forEach((e) => { keys.add(e.def.name); keys.add(e.def.desc); Object.values(e.def.names || {}).forEach((k) => keys.add(k)); });
  Object.keys(SR.tuning.election.events).forEach((id) => keys.add('toast.election.event.' + id));
  for (let i = 1; i <= SR.tuning.bus.buyerVoicemail.buyers; i++) keys.add('trip.vm.buyer' + i);
  ['str', 'int', 'cha', 'hp'].forEach((c) => keys.add('crime.jail.choice.' + c));
  ['store', 'bank', 'bust', 'police', 'questioning'].forEach((r) => keys.add('crime.jail.reason.' + r));
  ['impeached', 'coup'].forEach((k) => keys.add('toast.election.' + k));
  const missing = [...keys].filter((k) => !SR.text.has(k));
  T.eq(missing, [], 'every W1-C text key resolves (' + keys.size + ' keys)');
  const reg = SR.registry.entries('text').filter((e) => e.file === 'js/data/text/en-conflict.js');
  T.ok(reg.length > 150 && reg.every((e) => MINE.test(e.id)), 'en-conflict.js registers only its own namespaces (' + reg.length + ' keys)');
  const long = reg.filter((e) => /^toast\./.test(e.id) && e.def.length > 80).map((e) => e.id)
    .concat(reg.filter((e) => /^trip\.vm\./.test(e.id) && e.def.length > 280).map((e) => e.id))
    .concat(reg.filter((e) => /^trip\./.test(e.id)).filter((e) => [].concat(e.def).some((x) => x.length > 400)).map((e) => e.id));
  T.eq(long, [], 'length limits: toasts ≤ 80, voicemails ≤ 280, event cards ≤ 400');
  T.eq(SR.__warns.filter((w) => /crime|trade|fight|casino|election/.test(w)), [], 'no warnings from the W1-C modules');
  const all = K.L.load({ mode: 'all', console: { log() {}, warn() {}, error: console.error } });
  T.eq(all.errors.length, 0, 'mode all loads and boots');
  // Every sound a W1-C rule asks for (Result.sfx) is a registered recipe (ART_AUDIO §13.5; review probe).
  const sfx = [];
  files.filter((f) => /^js\/rules\//.test(f)).forEach((f) => {
    const re = /sfx\.push\('([^']+)'\)/g;
    let m;
    while ((m = re.exec(src[f]))) sfx.push(m[1]);
  });
  T.eq(sfx.filter((n) => typeof all.SR.reg.sfx[n] !== 'object'), [], 'every Result.sfx name is a registered sfx recipe (' + sfx.join(', ') + ')');
  [11, 22, 33].forEach((seed) => {
    const sh = K.L.load({ mode: 'rules', shuffle: seed, console: { log() {}, warn() {}, error: console.error } });
    T.ok(sh.errors.length === 0 && typeof sh.SR.rules.crime.jail === 'function' && typeof sh.SR.rules.election.electionNight === 'function',
      'shuffled load ' + seed + ' boots with the W1-C modules');
  });
}

T.done();
