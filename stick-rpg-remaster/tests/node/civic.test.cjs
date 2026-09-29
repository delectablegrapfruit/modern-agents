// tests/node/civic.test.cjs — owner: W2-Civic. The University of Stick and City Hall data through
// the real action pipeline and the real night (mode `all`, headless): BALANCE B-03 for Study,
// Business class and Gym (+1 karma, at most +3 a day; "Too hurt" at HP ≤ 4; the time wall), the P1
// `degrees` rows (hidden while the flag is off; seminars and graduation), the Election Office rows
// of B-17 (the nomination, the war chest from cash then bank, the starting poll, the campaign rows'
// costs, caps, halving, paths and clamp, the debate and its no-show), campaign days in jail, the
// lapse, a loss and the new nomination 30 days later, the office salary, the skin's params, and
// every text key the rows and the election rules name.
//   node tests/node/civic.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('civic (W2-Civic)');
const warns = [];
const { SR } = L.load({ mode: 'all', console: { log: console.log, warn: (...a) => warns.push(a.join(' ')), error: console.error } });
const TT = SR.tuning.training, TE = SR.tuning.election;

/** A new game (seed 7) with a deep-merged patch (arrays replace). */
function state(patch) {
  const s = SR.rules.state.create({ seed: 7 });
  if (patch) SR.util.merge(s, patch);
  return s;
}
function ctx(seed) { return { rng: SR.rng.create(seed === undefined ? 1 : seed), source: 'sim' }; }
function run(s, id, params, seed) { return SR.rules.act.run(s, id, params || {}, ctx(seed)); }
function preview(s, id, params) { return SR.rules.act.preview(s, id, params || {}, ctx()); }
function night(s, kind, seed) { return SR.rules.night.run(s, ctx(seed), { kind: kind || 'sleep' }); }
function flags(map) {
  const old = {};
  Object.keys(map).forEach((k) => { old[k] = SR.features[k]; SR.features[k] = map[k]; });
  return () => Object.keys(old).forEach((k) => { SR.features[k] = old[k]; });
}
function delta(res, kind, key) {
  const d = (res.deltas || []).find((x) => x.kind === kind && (key === undefined || x.key === key));
  return d ? d.n : 0;
}
/** A candidate: the castle, money and stats as given. */
function candidate(st, patch) {
  st = Object.assign({ str: 700, int: 700, cha: 700, karma: 60 }, st || {});
  return state(SR.util.merge({
    homes: { owned: ['apt', 'castle'], living: 'castle' }, money: { cash: 100000, bank: 150000 },
    stats: Object.assign({ hp: 15 + st.str, hpMax: 15 + st.str }, st), clock: { day: 5, min: 480 },
  }, patch || {}));
}
/** A candidate already campaigning (B-17) on the given day and poll. */
function campaigner(poll, day, path, patch) {
  const s = candidate(path === 'dictator' ? { str: 800, int: 800, cha: 800, karma: -60 } : {}, patch);
  Object.assign(s.election, { status: 'campaign', path: path || 'president', poll: poll, campaignDay: day || 1, chest: 50000, runs: 1 });
  s.money.cash = 1000000;
  return s;
}

// ------------------------------------------------------------------------------------------------
T.section('the University of Stick: P0 rows of B-03 through the pipeline');
{
  const s = state({ clock: { min: 480 } });
  const k0 = s.stats.karma;
  let r = run(s, 'uofs.study');
  T.ok(r.ok, 'Study runs');
  T.eq([delta(r, 'stat', 'int'), delta(r, 'time'), delta(r, 'cash'), delta(r, 'karma')], [TT.study.gain, TT.study.min, 0, 1], 'Study: +2 INT, 2 h, free, +1 karma (orig)');
  r = run(s, 'uofs.classBiz');
  T.eq([delta(r, 'stat', 'int'), delta(r, 'time'), delta(r, 'cash'), delta(r, 'karma')], [TT.classBiz.gain, TT.classBiz.min, -TT.classBiz.cash, 1], 'Business class: +4 INT, 2 h, $20, +1 karma');
  const hp0 = s.stats.hp, max0 = s.stats.hpMax;
  r = run(s, 'uofs.gym');
  T.eq([delta(r, 'stat', 'str'), delta(r, 'hp'), delta(r, 'hpMax'), delta(r, 'time'), delta(r, 'karma')], [TT.gym.gain, -TT.gym.hp, TT.gym.gain, TT.gym.min, 1],
    'Gym: +2 STR (HP max with it), -4 HP, 2 h, +1 karma');
  T.eq([s.stats.hp, s.stats.hpMax], [hp0 - TT.gym.hp, max0 + TT.gym.gain], 'HP max = 15 + STR after the gain');
  r = run(s, 'uofs.study');
  T.ok(r.ok && delta(r, 'karma') === 0, 'a fourth U of S activity gives no karma: at most +3 a day (B-03 uofsKarma)', r.deltas);
  T.eq(s.stats.karma - k0, TT.uofsKarma.dailyMax, 'karma +3 in the day');
  night(s);
  r = run(s, 'uofs.study');
  T.eq(delta(r, 'karma'), 1, 'the next day the U of S karma counts again');
  T.eq(s.edu.classes.biz, 1, 'the business class counts toward the Business track (for degrees, P1)');
  const pv = preview(s, 'uofs.classBiz');
  T.eq([pv.cost.cash, pv.cost.min, pv.repeatable, pv.gains.find((g) => g.kind === 'stat').n], [TT.classBiz.cash, TT.classBiz.min, true, TT.classBiz.gain], 'the preview: $20 and 2 h chips, +4 INT, repeatable (hold Enter)');
}

T.section('"Too hurt" at HP ≤ 4, the time wall, the price and gain modifiers');
{
  const s = state({ clock: { min: 480 }, stats: { hp: 4 } });
  let r = run(s, 'uofs.gym');
  T.eq([r.ok, r.reason, r.vars && r.vars.n], [false, 'reason.tooHurt', TT.gym.hp], 'the gym at HP 4: "Too hurt"');
  T.eq(SR.text(r.reason, r.vars), 'Too hurt', 'the reason reads "Too hurt"');
  s.stats.hp = 5;
  r = run(s, 'uofs.gym');
  T.ok(r.ok && s.stats.hp === 1, 'at HP 5 it runs (HP 1 left)');
  T.eq(delta(r, 'stat', 'str'), 1, '… and Winded (judged after its own -4) halves the gain: +1 STR');
  const t = state({ clock: { min: 1320 } });
  T.ok(run(t, 'uofs.study').ok, 'a 2 h class can start at 22:00');
  t.clock.min = 1350;
  const late = run(t, 'uofs.study');
  T.eq([late.ok, late.reason], [false, 'reason.tooLate'], '… and not at 22:30 (the wall)');
  // Numbers come from tuning.js: the named cost fns read SR.tuning.training at run time.
  const old = TT.classBiz.cash;
  TT.classBiz.cash = 25;
  T.eq(preview(state(), 'uofs.classBiz').cost.cash, 25, 'the class price follows tuning.training.classBiz.cash');
  TT.classBiz.cash = old;
  // The Public Library Act (W1-C 6): Study gives +3 INT through training.gain → decree.studyGain.
  const lib = state({ clock: { min: 480 }, election: { decrees: ['publicLibrary'] } });
  T.eq(delta(run(lib, 'uofs.study'), 'stat', 'int'), TE.publicLibrary.study, 'under the Public Library Act, Study gives +3 INT');
  // Heat Wave (P1 calendar; B-03 / B-19): the gym's HP cost and its "Too hurt" line ×1.5, rounded up.
  const hwOff = flags({ calendar: true });
  const hw = state({ clock: { day: 4, min: 480 }, stats: { hp: 6 }, world: { cityEvent: { id: 'heatWave', day: 4 } } });
  const hwc = Math.ceil(TT.gym.hp * SR.tuning.calendar.events.heatWave.hpMult);
  const hwp = preview(hw, 'uofs.gym');
  T.eq([hwp.ok, hwp.reason, hwp.cost.hp], [false, 'reason.tooHurt', hwc], 'Heat Wave: the gym costs ' + hwc + ' HP and is "Too hurt" at HP 6');
  hw.stats.hp = hwc + 1;
  T.ok(preview(hw, 'uofs.gym').ok, '… and runs at HP ' + (hwc + 1));
  hwOff();
  // Speed Reader (P1 perks; B-03 study.speedReaderMin): Study takes 90 min through uofs.min.
  const perksOff = flags({ perks: true });
  const reader = state({ clock: { min: 480 }, perks: { owned: ['speedReader'] } });
  T.eq([preview(reader, 'uofs.study').cost.min, preview(reader, 'uofs.classBiz').cost.min], [TT.study.speedReaderMin, TT.classBiz.min], 'Speed Reader: Study takes 90 min (classes keep 2 h)');
  const rr = run(reader, 'uofs.study');
  T.eq(delta(rr, 'time'), TT.study.speedReaderMin, '… and the clock moves 90 min');
  perksOff();
  // Wednesday classes (P1 calendar; B-28a wedClasses on class.*): $10.
  const off = flags({ calendar: true });
  const wed = state({ clock: { day: 3, min: 480 } });
  T.eq(preview(wed, 'uofs.classBiz').cost.cash, TT.classBiz.wedCash, 'with the calendar on, a Wednesday class costs $10');
  off();
}

T.section('P1 rows (`degrees`): hidden while the flag is off; seminars; graduation');
{
  const s = state({ clock: { min: 480 } });
  ['uofs.classKin', 'uofs.classThr', 'uofs.seminarBiz', 'uofs.transcript', 'uofs.graduateBiz'].forEach((id) => {
    T.ok(preview(s, id).hidden === true, id + ' is hidden while `degrees` is off');
  });
  T.eq(run(s, 'uofs.classKin').reason, 'reason.featureOff', 'and refused');
  const restore = flags({ degrees: true });
  let r = run(s, 'uofs.classKin');
  T.eq([delta(r, 'stat', 'str'), delta(r, 'hp'), delta(r, 'cash')], [TT.classKin.gain, -TT.classKin.hp, -TT.classKin.cash], 'Kinesiology: +4 STR, -6 HP, $20');
  s.stats.hp = 6;
  T.eq(run(s, 'uofs.classKin').reason, 'reason.tooHurt', 'Kinesiology at HP 6: "Too hurt"');
  s.stats.hp = s.stats.hpMax;   // not Winded for the gains below
  r = run(s, 'uofs.classThr');
  T.eq(delta(r, 'stat', 'cha'), TT.classThr.gain, 'Theatre: +4 CHA');
  T.ok(preview(s, 'uofs.seminarBiz').hidden, 'the Business seminar hides until you qualify (INT < 150)');
  s.stats.int = 150;
  s.edu.classes.biz = 10;
  s.money.cash = 1000;
  s.clock.min = 480;
  const pv = preview(s, 'uofs.seminarBiz');
  T.eq([pv.hidden, pv.ok, pv.cost.cash, pv.cost.min], [false, true, TT.seminar.cash, TT.seminar.min], 'INT 150 and 10 classes: the seminar shows ($150, 3 h)');
  r = run(s, 'uofs.seminarBiz');
  T.eq(delta(r, 'stat', 'int'), TT.seminar.gain, 'a seminar: +10 INT');
  run(s, 'uofs.seminarBiz');
  const third = preview(s, 'uofs.seminarBiz');
  T.eq([third.hidden, third.ok, third.reason], [false, false, 'reason.dailyLimit'], 'the third seminar of the day is disabled: "Come back tomorrow"');
  T.ok(preview(s, 'uofs.graduateBiz').hidden, 'Graduate hides before 20 classes');
  s.edu.classes.biz = TT.degree.classes;
  s.clock.min = 600;
  const g = preview(s, 'uofs.graduateBiz');
  T.eq([g.hidden, g.ok, g.cost.min], [false, true, TT.degree.ceremonyMin], '20 classes: "Graduate in Business" shows (a 1 h ceremony)');
  const int0 = s.stats.int;
  r = run(s, 'uofs.graduateBiz');
  T.ok(r.ok && s.edu.degrees.biz && s.stats.int === int0 + TT.degree.bonusStat, 'graduation: +25 INT once and the degree', r.reason);
  T.ok(r.stamps.some((x) => x.key === 'stamp.training.biz'), 'with the degree stamp');
  T.ok(preview(s, 'uofs.graduateBiz').hidden, 'and the row goes away');
  s.clock.min = 480;
  s.stats.hp = s.stats.hpMax;
  T.eq(delta(run(s, 'uofs.study'), 'stat', 'int'), TT.study.gain + TT.degree.perGain, 'the degree adds +1 to later INT gains');
  restore();
}

// ------------------------------------------------------------------------------------------------
T.section('the nomination (B-17) and the Board\'s call');
{
  const s = candidate({}, { clock: { min: 1400 } });
  const rep = night(s);
  T.eq([s.election.status, s.election.path], ['nominated', 'president'], 'castle, $250,000 in cash + bank, all 700, karma +60: nominated for President');
  const vm = s.msgs.find((m) => m.key === 'vm.board.nominated');
  T.ok(!!vm && vm.from === 'board', 'the Electoral Board\'s voicemail', s.msgs);
  const text = SR.text(vm.key, vm.vars);
  T.ok(!/[{}⟦]/.test(text) && text.indexOf(String(vm.vars.day)) >= 0, 'its text names the last day to accept: ' + text);
  T.ok(rep.lines.some((l) => l.section === 'election'), 'the report carries the call');
  const d = candidate({ str: 777, int: 777, cha: 777, karma: -25 }, { clock: { min: 1400 } });
  night(d);
  T.eq([d.election.status, d.election.path], ['nominated', 'dictator'], 'all 777 and karma -25: nominated for Dictator');
  [[{ cha: 665 }, 'one stat at 665'], [{ karma: 24 }, 'karma +24'], [{ str: 776, int: 800, cha: 800, karma: -30 }, 'a Dictator at 776']].forEach(([st, why]) => {
    const x = candidate(st, { clock: { min: 1400 } });
    night(x);
    T.eq(x.election.status, 'none', 'not nominated: ' + why);
  });
  // (the morning check itself: a night would first pay interest on the bank)
  const poor = candidate({}, { money: { cash: 100000, bank: 99999 } });
  T.eq([SR.rules.election.nominationCheck(poor).nominated, poor.election.status], [false, 'none'], 'not nominated with $199,999 in cash + bank');
  poor.money.cash += 1;
  T.eq(SR.rules.election.nominationCheck(poor).nominated, true, '… and nominated at $200,000 (cash + bank; orig: cash only)');
  const flat = candidate({}, { homes: { living: 'mansion', owned: ['apt', 'mansion', 'castle'] }, clock: { min: 1400 } });
  night(flat);
  T.eq(flat.election.status, 'none', 'not nominated outside the castle (orig)');
}

T.section('accepting (cityhall.accept): the war chest, cash first, the starting poll');
{
  const s = candidate({}, { money: { cash: 120000, bank: 150000 } });
  SR.rules.election.nominationCheck(s);
  T.ok(preview(s, 'cityhall.accept', {}).hidden, 'the accept row hides without a chosen chest (never a card row)');
  const pv = preview(s, 'cityhall.accept', { chest: 2 });
  T.ok(pv.ok && !pv.hidden, 'with { chest: 2 } it previews ok');
  const r = run(s, 'cityhall.accept', { chest: 2 });
  T.ok(r.ok, 'accepted with the $200,000 chest');
  T.eq([s.money.cash, s.money.bank], [0, 70000], 'paid from cash ($120,000), then the bank ($80,000)');
  T.eq([s.election.status, s.election.campaignDay, s.election.chest], ['campaign', 1, 200000], 'campaign day 1 is today');
  T.eq(s.election.poll, 66, 'B-17 example: lowest 700, karma +60, $200,000 → 66 %');
  const e = candidate({ str: 666, int: 666, cha: 666, karma: 25 });
  SR.rules.election.nominationCheck(e);
  run(e, 'cityhall.accept', { chest: 0 });
  T.eq(e.election.poll, 40.8, 'B-17 example: lowest 666, karma +25, $50,000 → 40.8 %');
  const broke = candidate({}, { money: { cash: 30000, bank: 30000 } });
  broke.election.status = 'nominated'; broke.election.path = 'president'; broke.election.nominatedDay = 5;
  const b = preview(broke, 'cityhall.accept', { chest: 0 });
  T.eq([b.ok, b.reason], [false, 'reason.notYet'], 'the requirements must still hold when you accept ($60,000 < $200,000)');
}

T.section('campaign rows: costs by name, poll maths, caps, halving, paths, the clamp (B-17)');
{
  const s = campaigner(40.8, 1, 'president');
  Object.assign(s.stats, { cha: 666, str: 666, int: 666 });
  const pv = preview(s, 'cityhall.rally');
  T.eq([pv.cost.cash, pv.cost.min, pv.repeatable], [TE.rally.cash, TE.rally.min, false], 'Rally: $5,000 and 3 h as cost chips, never repeatable');
  let r = run(s, 'cityhall.rally');
  T.eq([r.ok, delta(r, 'cash'), delta(r, 'time'), s.election.poll], [true, -TE.rally.cash, TE.rally.min, 44.5], 'Rally at CHA 666: +3.7 (1 + 666/250, to 0.1): 44.5 %');
  r = run(s, 'cityhall.rally');
  T.eq(s.election.poll, 46.3, 'the second rally the same day: half, +1.8');
  r = run(s, 'cityhall.rally');
  T.eq([r.ok, r.reason], [false, 'reason.dailyLimit'], 'a third rally: the cap of 2 a day');
  s.clock.min = 900;
  r = run(s, 'cityhall.doorKnock');
  T.eq([s.election.poll, delta(r, 'karma'), delta(r, 'time')], [47.3, TE.doorKnock.karma, TE.doorKnock.min], 'Door-knocking: +1 poll, +1 karma, 2 h');
  run(s, 'cityhall.doorKnock');
  T.eq(s.election.poll, 47.8, 'the second knock: +0.5');
  r = run(s, 'cityhall.tvAd');
  T.eq([s.election.poll, delta(r, 'cash'), delta(r, 'time')], [51.8, -TE.tvAd.cash, 0], 'TV ad blitz: +4, $25,000, no time');
  T.ok(preview(s, 'cityhall.intimidate').hidden, 'Intimidate hides for a President');
  T.ok(preview(s, 'cityhall.kissBabies').hidden, 'Kiss babies (P1 civicPlus) hides while its flag is off');
  const dict = campaigner(50, 2, 'dictator');
  T.ok(preview(dict, 'cityhall.doorKnock').hidden, 'Door-knocking hides for a Dictator');
  const ip = preview(dict, 'cityhall.intimidate');
  T.ok(ip.ok && typeof ip.chance === 'number', 'Intimidate shows its chance for a Dictator', ip);
  r = run(dict, 'cityhall.intimidate');
  T.eq([delta(r, 'karma'), delta(r, 'heat')], [TE.intimidate.karma, TE.intimidate.heat], 'Intimidate: -5 karma, +10 Heat');
  r = run(dict, 'cityhall.bribe');
  T.eq([delta(r, 'cash'), delta(r, 'karma'), delta(r, 'heat')], [-TE.bribe.cash, TE.bribe.karma, TE.bribe.heat], 'Bribe: $50,000, -10 karma, +20 Heat');
  // Kiss babies (P1 `civicPlus`): President only, 1 h, +1 on chance(CHA, 300) else 0, cap 3.
  const civic = flags({ civicPlus: true });
  const kb = campaigner(50, 2, 'president');
  const kpv = preview(kb, 'cityhall.kissBabies');
  T.eq([kpv.hidden, kpv.ok, kpv.cost.min, typeof kpv.chance], [false, true, TE.kissBabies.min, 'number'], 'Kiss babies with civicPlus: shown for a President, 1 h, with its chance');
  const kd = [0, 1, 2].map((i) => { const p0 = kb.election.poll; run(kb, 'cityhall.kissBabies', {}, 11 + i); return Math.round((kb.election.poll - p0) * 10) / 10; });
  T.ok(kd[0] === 0 || kd[0] === TE.kissBabies.poll, 'the first kiss: +1 or nothing', kd);
  T.ok(kd.slice(1).every((d) => d === 0 || d === Math.round(TE.kissBabies.poll * TE.repeatHalf * 10) / 10), 'later kisses the same day: half (+0.5) or nothing', kd);
  T.eq(run(kb, 'cityhall.kissBabies').reason, 'reason.dailyLimit', 'a fourth kiss: the cap of 3');
  T.ok(preview(campaigner(50, 2, 'dictator'), 'cityhall.kissBabies').hidden, 'Kiss babies hides for a Dictator');
  civic();
  const top = campaigner(99, 2, 'president');
  run(top, 'cityhall.tvAd');
  T.eq(top.election.poll, 100, 'the poll is clamped to 100');
  const none = candidate();
  T.ok(['rally', 'tvAd', 'doorKnock', 'intimidate', 'bribe', 'debate'].every((id) => preview(none, 'cityhall.' + id).hidden), 'no campaign: every campaign row hides');
  T.eq(run(none, 'cityhall.rally').reason, 'reason.unavailable', 'and refuses');
  ['cityhall.accept', 'cityhall.rally', 'cityhall.tvAd', 'cityhall.doorKnock', 'cityhall.kissBabies', 'cityhall.intimidate', 'cityhall.bribe', 'cityhall.debate'].forEach((id) => {
    T.ok(SR.reg.action[id].row === false && !SR.reg.action[id].repeatable, id + ': a sub-screen row (row: false), not repeatable');
  });
  T.ok(SR.reg.action['cityhall.intimidate'].confirm && SR.reg.action['cityhall.bribe'].confirm && SR.reg.action['cityhall.accept'].confirm, 'accept, intimidate and bribe ask first');
}

T.section('the debate (day 4), its resolve and the no-show');
{
  const s = campaigner(50, 3);
  T.ok(preview(s, 'cityhall.debate').hidden, 'the debate row hides before day 4');
  s.election.campaignDay = TE.debate.day;
  const pv = preview(s, 'cityhall.debate');
  T.eq([pv.ok, pv.cost.min], [true, TE.debate.min], 'day 4: the debate, 2 h');
  const r = run(s, 'cityhall.debate');
  T.eq([r.open && r.open.minigame, r.open && r.open.skin, r.open && r.open.resolve], ['debate', 'debate', 'cityhall.debate:resolve'], 'it opens the debate skin with its :resolve');
  T.eq([r.open.params.mode, r.open.params.beats, r.open.params.D, r.open.params.rival], ['stance', 3, 500, 'doodle'], 'stance mode, 3 questions, D 500, versus Mayor Doodle');
  const res = run(s, 'cityhall.debate:resolve', { beats: [true, true, false], wins: 2, losses: 1 });
  T.eq([res.ok, s.election.poll, s.election.debateDone], [true, 54, true], 'two won, one lost: +3 +3 -2 = +4');
  T.eq(run(s, 'cityhall.debate:resolve', { beats: [true, true, true], wins: 3, losses: 0 }).reason, 'reason.alreadyDone', 'a second resolve pays nothing');
  const p2 = preview(s, 'cityhall.debate');
  T.eq([p2.hidden, p2.ok, p2.reason], [false, false, 'reason.alreadyDone'], 'the row stays, disabled: "Already done"');
  const skip = campaigner(50, TE.debate.day, 'president', { clock: { min: 1400 } });
  const rep = night(skip, 'sleep', 3);
  const rival = rep.lines.find((l) => l.key === 'report.election.rival').vars.n;
  T.eq(skip.election.poll, Math.round((50 - rival + TE.debate.noShow) * 10) / 10, 'no-show: -5 on the night that ends day 4 (and the rival\'s -' + rival + ')');
  // The skin's params (mode `all` loads it): the rival, the portrait, three different questions.
  const sk = SR.reg.skin.debate;
  const p = sk.params(s, r.open.params);
  T.eq([sk.engine, p.opponent.name, p.opponent.portrait, p.situations.length, new Set(p.situations).size], ['duel', 'mg.debate.doodle', 'doodle', 3, 3], 'the debate skin: Duel, Mayor Doodle, 3 different questions');
  T.eq(sk.params(s, r.open.params).situations, p.situations, 'the same questions on a reload (a hash of the seed and the run)');
  T.eq(sk.params(campaigner(50, 4, 'dictator'), { path: 'dictator', rival: 'crayon', beats: 3 }).opponent.portrait, 'crayon', 'General Crayon for the Dictator race');
  T.ok(p.situations.concat([p.opponent.name, p.subtitle, 'mg.debate.title', 'mg.debate.facts', 'mg.debate.charm', 'mg.debate.pressure']).every((k) => SR.text.has(k)), 'its text keys exist');
  T.eq(sk.params(s, {}).situations.length, SR.tuning.duel.debate.beats, 'without run params the questions follow B-30 (tuning.duel.debate.beats)');
  const oldBeats = SR.tuning.duel.debate.beats;
  SR.tuning.duel.debate.beats = 4;
  T.eq(sk.params(s, {}).situations.length, 4, '… read at run time from tuning.js');
  SR.tuning.duel.debate.beats = oldBeats;
  T.eq(sk.music, undefined, 'no song of its own: the frame ducks the campaign march below (ART_AUDIO §13.4; the Dictator variant stays)');
}

T.section('campaign days in jail count; election night; the office; a loss and the next run');
{
  const s = campaigner(80, 3, 'president', { clock: { min: 1400 } });
  s.jail = { daysLeft: 2, served: 0, reason: 'storeRobbery', bailBase: 0 };
  night(s, 'jail');
  T.eq(s.election.campaignDay, 4, 'a jail night advances the campaign day (GDD §4.17)');
  night(s, 'hospital');
  T.eq(s.election.campaignDay, 5, 'so does a hospital night');
  s.jail = null;
  const w = campaigner(90, TE.campaignDays, 'president', { clock: { min: 1400 } });
  const rep = night(w, 'sleep', 2);
  T.ok(rep.election && rep.election.won === true, 'election night after day 7 (poll 90): won', rep.election);
  T.eq([w.election.status, w.job.office], ['office', 'president'], 'in office: President of Sticks');
  const concede = w.msgs.find((m) => m.key === 'vm.doodle.concede');
  T.ok(!!concede && !/[{}⟦]/.test(SR.text(concede.key, concede.vars)), 'Mayor Doodle concedes by voicemail');
  const cash0 = w.money.cash;
  const rep2 = night(w, 'sleep', 3);
  T.ok(w.money.cash - cash0 >= TE.salary && rep2.lines.some((l) => l.key === 'report.salary'), 'the office pays $10,000 every night');
  const l = campaigner(20, TE.campaignDays, 'president', { clock: { min: 1400 } });
  const lrep = night(l, 'sleep', 2);
  T.eq([lrep.election.won, l.election.status, l.election.retryFromDay], [false, 'lost', l.clock.day - 1 + TE.retry], 'poll 20: lost; another run from 30 days later');
  T.ok(l.msgs.some((m) => m.key === 'vm.doodle.gloat'), 'Mayor Doodle gloats by voicemail');
  const retry = l.election.retryFromDay;
  while (l.clock.day < retry - 1) night(l);
  T.eq(l.election.status, 'lost', 'still qualified, but no call before day ' + retry);
  night(l);
  T.eq([l.clock.day, l.election.status], [retry, 'nominated'], 'the Board calls again on day ' + retry);
}

T.section('the lapse (14 days)');
{
  const s = candidate({}, { clock: { min: 1400 } });
  night(s);
  const from = s.election.nominatedDay;
  for (let i = 0; i < TE.acceptWithin; i++) night(s);
  T.eq([s.election.status, s.election.retryFromDay], ['none', from + TE.acceptWithin - 1 + TE.retry], 'an offer not accepted in 14 days lapses; the next run from 30 days later');
}

T.section('greetings and text');
{
  const s = state();
  const keys = [];
  const g = (b) => { const r = SR.reg.fn['greet.' + b](s, {}, ctx()); keys.push(r.key); return r; };
  s.clock.min = 480; g('uofs'); g('cityhall');
  s.clock.min = 1380; g('uofs'); g('cityhall');
  s.clock.min = 800; g('uofs');
  s.stats.int = 300; g('uofs');
  s.stats.karma = -60; g('uofs');
  s.stats.karma = 60; s.stats.int = 50; g('uofs');
  s.stats.hp = 1; g('uofs');
  s.stats.hp = 20; s.edu.degrees.kin = true; g('uofs');
  Object.assign(s.election, { status: 'nominated', nominatedDay: 3 });
  T.eq(g('cityhall').vars.day, 3 + TE.acceptWithin - 1, 'Plume names the last day to accept');
  Object.assign(s.election, { status: 'campaign', campaignDay: 2, poll: 44.4 }); g('cityhall');
  s.election.status = 'lost'; g('cityhall');
  s.election.status = 'removed';
  T.eq(g('cityhall').key, 'greet.cityhall.removed', 'an impeached or deposed mayor gets their own line, not the lost election\'s');
  s.job.office = 'president'; g('cityhall');
  s.job.office = 'dictator'; g('cityhall');
  T.ok(keys.every((k) => SR.text.has(k)), 'every greeting key exists', keys.filter((k) => !SR.text.has(k)));
  T.eq(new Set(keys.filter((k) => /^greet\.uofs/.test(k))).size >= 6 && new Set(keys.filter((k) => /^greet\.cityhall/.test(k))).size >= 6, true, 'at least 6 greeting situations each (GDD §6.1: 2 in P0)');
  const named = [];
  ['uofs', 'cityhall'].forEach((b) => {
    Object.keys(SR.reg.action).filter((id) => SR.reg.action[id].building === b).forEach((id) => {
      const d = SR.reg.action[id];
      [d.label, d.confirm].filter(Boolean).forEach((k) => named.push(k));
    });
  });
  ['vm.board.nominated', 'vm.board.impeached', 'vm.board.coup', 'vm.doodle.concede', 'vm.doodle.gloat', 'vm.crayon.concede', 'vm.crayon.gloat',
    'sub.uofs.transcript', 'sub.cityhall.campaign'].forEach((k) => named.push(k));
  T.eq(named.filter((k) => !SR.text.has(k)), [], 'every label, confirm and voicemail key resolves');
  const trainLabels = Object.keys(SR.reg.action).filter((id) => SR.reg.action[id].building === 'uofs' && SR.reg.action[id].group === 'train').map((id) => SR.text(SR.reg.action[id].label));
  T.eq(trainLabels.filter((l) => l.length > 28 || !/^(Study|Take|Work|Attend) /.test(l)), [], 'U of S training labels are verb first and at most 28 characters (UI §10)', trainLabels);
  const vars = { path: 'president', days: 14, day: 20, poll: 51.2 };
  T.eq(['vm.board.nominated', 'vm.board.impeached', 'vm.board.coup', 'vm.doodle.concede', 'vm.doodle.gloat', 'vm.crayon.concede', 'vm.crayon.gloat']
    .filter((k) => /[{}]/.test(SR.text(k, vars))), [], 'the voicemails fill every var the rules send');
  T.eq(warns.filter((w) => /civic|uofs|cityhall|debate/.test(w)), [], 'no warnings from these files');
}

T.done();
