// tests/node/health.test.cjs — owner: W2-RulesE (W1-E in wave 1). SR.rules.health (ARCHITECTURE §6.7; GDD §4.16; BALANCE
// B-16, B-31): HP 0 → Second Wind (P1 perk, once a day), Hardcore death, or Stick General (the
// bill with its write-off, the hospital night: HP 50 %, 12:00 the next day), and the same through
// the action pipeline's HP-0 hook.
//   node tests/node/health.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('health (W1-E)');
const SR = H.boot();
const HL = SR.rules.health;

T.section('the bill (B-31)');
{
  T.eq(HL.bill(H.state(SR, { money: { cash: 100, bank: 200 } })), 50, 'Standard: at least $50');
  T.eq(HL.bill(H.state(SR, { money: { cash: 3000, bank: 7000 } })), 1000, 'Standard: 10 % of cash + bank');
  T.eq(HL.bill(H.state(SR, { money: { cash: 3000 } }, { difficulty: 'relaxed' })), 0, 'Relaxed: no bill');
  T.eq(HL.bill(H.state(SR, { money: { cash: 3000 } }, { difficulty: 'hardcore' })), 0, 'Hardcore: never billed (death)');
}

T.section('HP 0 by difficulty');
{
  const s = H.state(SR, { clock: { day: 4, min: 900 }, money: { cash: 30, bank: 0 }, stats: { hp: 0, str: 25, hpMax: 40 } });
  const d = HL.down(s, 'fall', H.ctx(SR, 1));
  T.eq([d.outcome, d.cause, d.bill, d.writtenOff], ['hospital', 'fall', 50, 20], 'Standard: Stick General; the $50 bill takes cash and writes off the rest');
  T.eq([s.money.cash, s.money.bank], [0, 0], 'cash never goes below 0');
  T.eq([s.clock.day, s.clock.min, s.stats.hp, s.records.hospital], [5, 720, 20, 1], 'the hospital night: the next day, 12:00, HP = 50 % of HP max');
  T.eq([d.report.kind, d.report.day], ['hospital', 5], 'the Stick General report');
  T.ok(d.report.lines.some((l) => l.key === 'report.hospital.bill' && l.vars.off === 20), 'the report shows the bill and the written-off part');
  T.eq(d.report.headline.key, 'news.head.hospital', 'the hospital headlines the morning');
  T.eq(d.events, [{ name: 'down', payload: { cause: 'fall', outcome: 'hospital' } }], 'the `down` rule event');

  const r = H.state(SR, { money: { cash: 500 }, stats: { hp: 0 } }, { difficulty: 'relaxed' });
  const dr = HL.down(r, 'carHit', H.ctx(SR, 1));
  T.eq([dr.outcome, dr.bill, r.money.cash, r.clock.min], ['hospital', 0, 500, 720], 'Relaxed: the hospital, no bill');

  const h = H.state(SR, { stats: { hp: 0 } }, { difficulty: 'hardcore' });
  const dh = HL.down(h, 'mugger', H.ctx(SR, 1));
  T.eq([dh.outcome, h.over, h.result.reason, h.clock.day, dh.report], ['death', true, 'death', 1, null], 'Hardcore: death, no night');
  T.ok(h.result.banners.indexOf('deceased') >= 0, 'the DECEASED banner');

  const p = H.state(SR, { stats: { hp: 0 }, perks: { owned: ['secondWind'] } }, { difficulty: 'hardcore' });
  T.eq(HL.down(p, 'fight', H.ctx(SR, 1)).outcome, 'death', 'Second Wind does nothing while `perks` is off');
  const rf = H.features(SR, { perks: true });
  const q = H.state(SR, { stats: { hp: 0 }, perks: { owned: ['secondWind'] } }, { difficulty: 'hardcore' });
  const dq = HL.down(q, 'fall', H.ctx(SR, 1));
  T.eq([dq.outcome, q.stats.hp, q.daily.secondWind, q.over], ['secondWind', 1, 1, false], 'Second Wind: HP 1, nothing else');
  T.eq(dq.toasts, [{ key: 'toast.health.secondWind', vars: {}, kind: 'warning' }], '… but its toast (ARCHITECTURE §6.7)');
  q.stats.hp = 0;
  T.eq(HL.down(q, 'fall', H.ctx(SR, 1)).outcome, 'death', 'once a day');
  rf();
}

T.section('through the action pipeline (SR.rules.act)');
{
  // Involuntary damage (no hpAbove), like a fall.
  SR.def.action('test.fall', { building: 'world', group: 'special', p: 0, timeRule: 'free', effects: [['hurt', 10, 'fall']] });
  const s = H.state(SR, { clock: { day: 2, min: 600 }, money: { cash: 1000 }, stats: { hp: 8 } });
  const r = SR.rules.act.run(s, 'test.fall', {}, H.ctx(SR, 1));
  T.eq([r.ok, r.down && r.down.outcome, r.down && r.down.cause], [true, 'hospital', 'fall'], 'HP 0 in an action → health.down with its cause');
  T.eq([s.clock.day, s.clock.min, s.stats.hp, s.money.cash], [3, 720, 11, 900], 'the hospital night ran (the $100 bill, HP 50 %, 12:00)');
  T.ok(r.events.filter((e) => e.name === 'down').length === 1, 'one `down` event on the Result');
  const h = H.state(SR, { stats: { hp: 5 } }, { difficulty: 'hardcore' });
  const rh = SR.rules.act.run(h, 'test.fall', {}, H.ctx(SR, 1));
  T.eq([rh.down.outcome, h.over], ['death', true], 'Hardcore: death through the pipeline');
}

T.done();
