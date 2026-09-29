// tests/node/training.test.cjs — owner: W2-RulesE (W1-E in wave 1). SR.rules.training (BALANCE B-03; GDD §4.5): gains
// through SR.rules.stats.add (Winded, the cap), daily limits, the U of S karma (+1, at most +3 a
// day), class counts, seminars and degrees (P1 `degrees`: +25 once, then +1 on later gains).
//   node tests/node/training.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('training (W1-E)');
const SR = H.boot();
const R = SR.rules.training;

T.section('gains, counters, the U of S karma');
{
  const s = H.state(SR, { stats: { int: 10, str: 10, karma: 0 } });
  const a = R.apply(s, 'study');
  T.eq([a.stat, a.n, s.stats.int, a.karma, s.stats.karma], ['int', 2, 12, 1, 1], 'Study: +2 INT (orig +1), +1 karma');
  T.eq(a.events, [{ name: 'train', payload: { id: 'study', stat: 'int', n: 2 } }], 'the `train` rule event');
  R.apply(s, 'classBiz');
  R.apply(s, 'gym');
  const d = R.apply(s, 'classKin');
  T.eq([s.stats.int, s.stats.str, s.stats.karma, d.karma], [16, 16, 3, 0], 'U of S karma: +1 each, at most +3 a day');
  T.eq([s.edu.classes.biz, s.edu.classes.kin, s.edu.classes.thr], [1, 1, 0], 'classes count in their track');
  T.eq(s.stats.hpMax, 15 + 16, 'STR gains raise HP max (through stats.add)');
  const w = H.state(SR, { stats: { hp: 5, int: 10 } });
  T.eq(R.apply(w, 'classBiz').n, 2, 'Winded halves a gain (4 → 2)');
  const tv = H.state(SR, {});
  T.ok(R.apply(tv, 'tvNews').ok && R.apply(tv, 'tvNews').ok, 'TV News twice');
  T.eq(R.apply(tv, 'tvNews').reason, 'reason.dailyLimit', 'the third hour of News is refused (2 a day)');
  T.ok(R.apply(tv, 'tvFitness').ok, 'another channel has its own limit');
  T.eq([tv.daily.tv.tvNews, tv.daily.tv.tvFitness], [2, 1], 'counted per channel in daily.tv');
  T.eq(R.can(H.state(SR, { daily: { online: 1 } }), 'onlineCourse').reason, 'reason.dailyLimit', 'the online course: once a day');
  const om = H.state(SR, { stats: { cha: 10 } });
  T.ok(R.apply(om, 'openMic').ok && om.weekly.openMic === 1, 'Open Mic: +3 CHA, counted for the week');
  T.eq(R.apply(om, 'openMic').reason, 'reason.weeklyLimit', 'once a calendar week');
  T.eq(R.apply(H.state(SR, { stats: { cha: 999 } }), 'tvDating').n, 0, 'gains past 999 are lost');
  T.eq(R.can(H.state(SR, {}), 'nope').reason, 'reason.noTraining', 'an unknown source');
  T.eq(R.classTrack('classThr'), 'thr', 'Theatre class → the thr track');
}

T.section('seminars and degrees (P1 degrees)');
{
  const s = H.state(SR, { stats: { int: 150 }, edu: { classes: { biz: 10 } } });
  T.eq(R.seminarOk(s, 'biz').reason, 'reason.featureOff', 'seminars are P1');
  const rf = H.features(SR, { degrees: true });
  T.eq(R.seminarOk(s, 'biz').ok, true, 'INT 150 and 10 Business classes');
  T.eq(R.seminarOk(H.state(SR, { stats: { int: 149 }, edu: { classes: { biz: 10 } } }), 'biz').vars, { stat: 'INT', min: 150, have: 149 }, 'needs the stat at 150');
  T.eq(R.seminarOk(H.state(SR, { stats: { int: 150 }, edu: { classes: { biz: 9 } } }), 'biz').reason, 'reason.needClasses', 'needs 10 classes');
  const x = R.apply(s, 'seminar', { track: 'biz' });
  T.eq([x.stat, x.n, s.daily.seminars, s.edu.classes.biz], ['int', 10, 1, 10], 'a seminar: +10 in the track\'s stat (not a class)');
  R.apply(s, 'seminar', { track: 'biz' });
  T.eq(R.apply(s, 'seminar', { track: 'biz' }).reason, 'reason.dailyLimit', '2 seminars a day across tracks');

  const g = H.state(SR, { stats: { cha: 100 }, edu: { classes: { thr: 19 } } });
  T.eq(R.canGraduate(g, 'thr').reason, 'reason.needClasses', '20 classes for a degree');
  R.apply(g, 'classThr');
  const gr = R.graduate(g, 'thr');
  T.eq([gr.n, g.stats.cha, g.edu.degrees.thr, g.items.diplomas], [25, 129, true, ['thr']], 'graduating: +25 CHA once, a diploma');
  T.eq(gr.stamps, [{ key: 'stamp.training.thr', vars: {} }], 'the degree stamp');
  T.eq(gr.log, [{ kind: 'degree', vars: { track: 'thr', name: 'Theatre' } }], 'the degree headline (delivered by the pipeline)');
  T.eq(R.graduate(g, 'thr').reason, 'reason.graduated', 'once');
  T.eq(R.apply(g, 'classThr').n, 5, 'every later gain of that stat +1 (4 → 5)');
  const ng = H.state(SR, { stats: { cha: 10 }, edu: { degrees: { thr: true } }, furniture: { owned: { minibar: 1 } } });
  SR.rules.night.run(ng, H.ctx(SR, 1), {});
  T.eq(ng.stats.cha, 12, '… except nightly furniture');
  rf();
  T.eq(R.graduate(g, 'biz').reason, 'reason.featureOff', 'degrees are P1');
}

T.section('named fns');
{
  const s = H.state(SR, { stats: { int: 10 } });
  T.eq(SR.reg.fn['training.apply'](s, {}, {}, 'study').n, 2, 'training.apply takes the source id');
  T.eq(SR.reg.fn['training.can'](H.state(SR, { daily: { tv: { tvNews: 2 } } }), {}, {}, 'tvNews').reason, 'reason.dailyLimit', 'training.can is a condition');
}

T.section('the Public Library Act, Speed Reader, the nap (review fixes)');
{
  const lib = H.state(SR, { stats: { int: 10 }, election: { decrees: ['publicLibrary'] } });
  T.eq([R.apply(lib, 'study').n, lib.stats.int], [3, 13], 'Study gives +3 INT under the Public Library Act (GDD §4.17, via decree.studyGain)');
  T.eq(R.apply(H.state(SR, { stats: { int: 10 } }), 'study').n, 2, '… and +2 otherwise');
  T.eq(R.apply(H.state(SR, { stats: { int: 10 }, election: { decrees: ['publicLibrary'] } }), 'classBiz').n, 4, 'the decree touches Study only');
  const sr = H.state(SR, { perks: { owned: ['speedReader'], pending: [] } });
  T.eq([SR.reg.fn['training.studyMin'](sr, {}, {}), SR.reg.fn['training.paperMin'](sr, {}, {})], [120, 30], 'Speed Reader does nothing while `perks` is off');
  const rf = H.features(SR, { perks: true });
  T.eq([SR.reg.fn['training.studyMin'](sr, {}, {}), SR.reg.fn['training.paperMin'](sr, {}, {})], [90, 0], 'Speed Reader: Study 90 min, the paper 0 min (B-03)');
  T.eq(SR.reg.fn['training.studyMin'](H.state(SR, {}), {}, {}), 120, '… only with the perk');
  rf();
  T.eq(SR.reg.fn['training.napHp'](H.state(SR, { stats: { str: 85, hpMax: 100 } }), {}, {}), 15, 'a nap restores 15 % of HP max (B-03 nap)');
  T.eq(SR.reg.fn['training.napHp'](H.state(SR, {}), {}, {}), 3, '… floored (22 → 3)');
  // As a cost and an effect argument through the pipeline (the way wave-2 data names them).
  SR.def.action('test.study', { building: 'uofs', group: 'train', p: 0, cost: { min: 'training.studyMin' }, effects: [['fn', 'training.apply', 'study']] });
  SR.def.action('test.nap', { building: 'home', group: 'special', p: 0, cost: { min: 120 }, effects: [['heal', 'training.napHp']] });
  const a = H.state(SR, { clock: { min: 480 }, stats: { hp: 1 } });
  SR.rules.act.run(a, 'test.study', {}, H.ctx(SR, 1));
  SR.rules.act.run(a, 'test.nap', {}, H.ctx(SR, 1));
  T.eq([a.clock.min, a.stats.hp], [480 + 120 + 120, 1 + 3], 'through the action pipeline: the cost fn and the heal amount');
}

T.done();
