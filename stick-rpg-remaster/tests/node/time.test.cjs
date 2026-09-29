// tests/node/time.test.cjs — owner: W1-R. SR.rules.time and the time wall through the pipeline
// (GDD §4.1; BALANCE B-01; BUILD_PLAN §3.2: a 6 h shift at 18:00 and not 18:30; a 2 h class at 22:00
// and not 22:30; food at 23:30; a robbery at 20:30 and not at 21:00).
//   node tests/node/time.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('time');
const SR = K.load();
K.fixtures(SR);
const Tm = SR.rules.time;

T.section('clock');
{
  const s = K.newState(SR);
  T.eq([s.clock.day, s.clock.min, s.clock.wake], [1, 480, 480], 'a new game starts on day 1 at 08:00');
  T.ok(Tm.canStart(s, 960), 'from 08:00, a 16 h action ends exactly at 24:00');
  T.ok(!Tm.canStart(s, 990), 'a 16.5 h action does not fit');
  T.eq(Tm.spend(s, 90), 570, 'spend adds minutes');
  T.eq(Tm.spend(s, 5000), 1440, 'spend never passes the wall');
  T.ok(Tm.canStart(s, 0), 'a free (0 min) action still fits at 24:00');
  T.ok(!Tm.canStart(s, 30), 'nothing timed fits at 24:00');
  T.eq(Tm.setTo(s, 1260), 1260, 'setTo sets the clock');
  T.eq(Tm.setTo(s, 2000), 1440, 'setTo clamps at 24:00');
  T.eq(Tm.left(Object.assign(s, { clock: Object.assign(s.clock, { min: 1080 }) })), 360, 'left() is the time to the wall');
}

T.section('weekdays and weeks');
{
  const s = K.newState(SR);
  const days = [];
  for (let d = 1; d <= 15; d++) { s.clock.day = d; days.push([Tm.weekday(s), Tm.week(s)]); }
  T.eq(days.map((x) => x[0]), [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0], 'day 1 is Monday (0); the week wraps every 7 days');
  T.eq(days.map((x) => x[1]), [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2], 'week = floor((day - 1) / 7)');
  T.eq([1, 2, 3, 4, 5, 6, 7, 8].map(Tm.isMarketDay), [true, true, true, true, true, false, false, true], 'the nights after Mon-Fri tick the market; Sat and Sun do not');
  T.eq(['mon', 'Tue', 'sunday', 3, 'xyz', 9].map(Tm.dayIndex), [0, 1, 6, 3, -1, -1], 'dayIndex reads names and indices');
  T.eq([Tm.fmt(480, false), Tm.fmt(1440, false), Tm.fmt(870, true)], ['08:00', '24:00', '2:30 PM'], 'fmt formats clock times');
}

T.section('the wall through the pipeline');
{
  const at = (min, id, patch) => {
    const s = K.newState(SR);
    s.clock.min = min;
    s.stats.hp = 10;
    s.items.gun = 1; s.items.ammo = 20;
    if (patch) patch(s);
    return SR.rules.act.preview(s, id, {}, K.ctx(SR));
  };
  T.ok(at(1080, 'testbld.work').ok, 'a 6 h shift can start at 18:00');
  const w = at(1110, 'testbld.work');
  T.eq([w.ok, w.reason], [false, 'reason.tooLate'], 'a 6 h shift cannot start at 18:30 (Ends after midnight)');
  T.ok(at(1320, 'testbld.class').ok, 'a 2 h class can start at 22:00');
  T.eq(at(1350, 'testbld.class').reason, 'reason.tooLate', 'a 2 h class cannot start at 22:30');
  T.ok(at(1410, 'testbld.fries').ok, 'food (30 m) can start at 23:30');
  T.eq(at(1440, 'testbld.fries').reason, 'reason.tooLate', 'food cannot start at 24:00');
  T.ok(at(1230, 'testbld.rob').ok, 'a robbery can start at 20:30');
  const r = at(1260, 'testbld.rob');
  T.eq([r.ok, r.reason], [false, 'reason.robLate'], 'a robbery cannot start at 21:00');
  T.eq(r.vars.time, '21:00', 'the robbery reason names 21:00');
  T.ok(at(1440, 'testbld.rob:resolve').ok, "a ':resolve' action (timeRule free) runs at 24:00");
  T.ok(at(1440, 'testbld.bill').ok, 'a free-time action runs at 24:00');
  T.eq(at(1410, 'testbld.late').ok, true, 'an action whose effect sets 24:00 only needs its cost to fit');

  const s = K.newState(SR);
  s.clock.min = 1080;
  const res = SR.rules.act.run(s, 'testbld.work', {}, K.ctx(SR));
  T.eq([res.ok, s.clock.min], [true, 1440], 'running the 18:00 shift ends at 24:00');
  const again = SR.rules.act.run(s, 'testbld.work', {}, K.ctx(SR));
  T.eq([again.ok, again.reason, s.clock.min], [false, 'reason.tooLate', 1440], 'the next shift is refused and the clock is unchanged');
  const tdelta = res.deltas.find((d) => d.kind === 'time');
  T.eq(tdelta, { kind: 'time', n: 360, from: 1080, to: 1440 }, 'the time delta records the minutes spent');
}

T.section('the trip time rule: the red-eye at 00:00, tours 06:00-10:00 (GDD §4.1, §4.11; B-01)');
{
  SR.def.action('testbld.board', { building: 'testbld', group: 'special', p: 0, timeRule: 'trip', effects: [['setTime', 1440]] });
  const at = (min, params) => {
    const s = K.newState(SR);
    s.clock.min = min;
    return SR.rules.act.preview(s, 'testbld.board', params, K.ctx(SR));
  };
  T.ok(at(0, { kind: 'smuggle' }).ok, 'the red-eye boards at 00:00 (a day that woke at 00:00)');
  const late = at(30, { kind: 'smuggle' });
  T.eq([late.ok, late.reason, SR.text(late.reason, late.vars)], [false, 'reason.redEye', 'Buses leave at 00:00'], 'and at no other time ("Buses leave at 00:00")');
  T.eq(at(840, { variant: 'redeye' }).reason, 'reason.redEye', 'the kind may come as the variant');
  T.eq([360, 600].map((m) => at(m, { kind: 'tour' }).ok), [true, true], 'a speaking tour boards at 06:00 and at 10:00 (both inclusive)');
  const t = at(630, { kind: 'tour' });
  T.eq([at(330, { kind: 'tour' }).reason, t.reason, SR.text(t.reason, t.vars)], ['reason.tourWindow', 'reason.tourWindow', 'Tours board 06:00-10:00'], 'not at 05:30 nor 10:30');
  T.ok(at(840, {}).ok, 'without a kind a trip may leave any time before the wall');
  T.eq(at(1440, { kind: 'tour' }).reason, 'reason.dayOver', 'never at 24:00');
  const s = K.newState(SR);
  s.clock.min = 0;
  const r = SR.rules.act.run(s, 'testbld.board', { kind: 'smuggle' }, K.ctx(SR));
  T.eq([r.ok, s.clock.min], [true, 1440], 'the trip takes the day');
}

T.section('Buzz wears off: -1 per 2 game hours (GDD §4.2)');
{
  const s = K.newState(SR);
  s.clock.min = 1200;
  s.stats.buzz = 4;
  Tm.spend(s, 60);
  T.eq(s.stats.buzz, 4, '20:00 → 21:00 crosses no 2-hour mark');
  Tm.spend(s, 60);
  T.eq(s.stats.buzz, 3, '21:00 → 22:00 passes 22:00: -1');
  Tm.spend(s, 240);
  T.eq(s.stats.buzz, 2, '22:00 → 24:00 (clamped at the wall) passes 24:00: -1');
  s.clock.min = 480;
  s.stats.buzz = 5;
  Tm.setTo(s, 1440);
  T.eq(s.stats.buzz, 0, 'a take-the-day action (08:00 → 24:00) sobers up completely (8 marks, Buzz floors at 0)');
  s.clock.min = 600;
  s.stats.buzz = 3;
  Tm.setTo(s, 360);
  T.eq(s.stats.buzz, 3, 'setting the clock back takes nothing');

  // Through the pipeline: a 60-minute beer from 21:00 passes 22:00 during its cost, then adds +1.
  const b = K.newState(SR);
  b.clock.min = 1260;
  b.stats.buzz = 2;
  b.money.cash = 100;
  const r = SR.rules.act.run(b, 'testbld.beer', {}, K.ctx(SR));
  T.eq([r.ok, b.stats.buzz], [true, 2], 'a beer 21:00-22:00: -1 for the hour mark, +1 for the beer');
  T.eq(r.deltas.filter((d) => d.kind === 'buzz'), [], 'net zero: no buzz delta');
  const pvb = SR.rules.act.preview(b, 'testbld.beer', {}, K.ctx(SR));
  T.eq(pvb.gains.filter((g) => g.kind === 'buzz').map((g) => g.n), [1], 'the preview shows the beer\'s +1 Buzz (the wear-off is part of the time spent)');
  T.eq(SR.tuning.time.buzzDecayMin, 120, 'the interval lives in SR.tuning.time.buzzDecayMin');
}

T.section('window conditions');
{
  const s = K.newState(SR);
  const C = SR.rules.conditions;
  s.clock.min = 1079;
  T.eq(C.eval(s, ['timeBetween', 1080, 1440]).reason, 'reason.notBefore', 'timeBetween refuses before the window');
  s.clock.min = 1080;
  T.ok(C.eval(s, ['timeBetween', 1080, 1440]).ok, 'timeBetween allows a ≤ now');
  s.clock.min = 1440;
  T.eq(C.eval(s, ['timeBetween', 1080, 1440]).reason, 'reason.notAfter', 'timeBetween refuses now = b');
  s.clock.day = 2;
  T.ok(C.eval(s, ['weekday', ['tue']]).ok && C.eval(s, ['weekday', [1]]).ok, 'weekday accepts names and indices (day 2 is Tuesday)');
  T.eq(C.eval(s, ['weekday', ['fri']]).reason, 'reason.wrongDay', 'weekday refuses other days');
}

T.done();
