// tests/node/stats.test.cjs — owner: W1-R. SR.rules.stats (GDD §4.2, §4.5; BALANCE B-02, B-03,
// B-04): HP max = 15 + STR after every STR gain and never otherwise; Winded halves gains (floor,
// min 1); the degree bonus adds 1; the 999 cap; karma clamps after every change; Heat and Buzz
// ranges; the karma band and tier.
//   node tests/node/stats.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('stats');
const SR = K.load();
const ids = K.fixtures(SR);
const S = SR.rules.stats;

T.section('gains: Winded, the degree bonus, the cap');
{
  const s = K.newState(SR);
  T.eq(S.add(s, 'int', 2), 2, 'a plain gain applies as is');
  T.eq(s.stats.int, 9, 'INT 7 + 2 = 9');

  // Winded: HP < 25 % of HP max (22 → below 5.5).
  s.stats.hp = 6;
  T.ok(!S.winded(s), 'HP 6 of 22 is not Winded');
  s.stats.hp = 5;
  T.ok(S.winded(s), 'HP 5 of 22 is Winded');
  T.eq([1, 2, 3, 4, 5, 9].map((n) => S.gain(s, 'int', n).n), [1, 1, 1, 2, 2, 4], 'Winded halves gains (floor, min 1)');
  T.eq(S.gain(s, 'int', 4, 'reward').n, 4, 'Winded does not touch reward gains');
  T.eq(S.gain(s, 'int', 4, 'decree').n, 4, 'nor any other non-training source');
  T.eq(S.gain(s, 'int', 4, 'furniture').n, 2, 'Winded halves nightly furniture gains');
  T.eq(S.gain(s, 'int', 4, 'fixed').n, 4, 'fixed gains are exact');
  const before = s.stats.int;
  T.eq(S.add(s, 'int', 3), 1, 'add applies the Winded gain');
  T.eq(s.stats.int, before + 1, 'and records it');
  s.stats.hp = s.stats.hpMax;

  // The degree bonus (P1 degrees): +1 on every later gain of that stat, except nightly furniture.
  s.edu.degrees.biz = true;
  T.eq(S.gain(s, 'int', 4).n, 4, 'no degree bonus while the degrees flag is off');
  SR.features.degrees = true;
  T.eq(S.gain(s, 'int', 4).n, 5, 'a Business degree adds 1 to an INT gain');
  T.eq(S.gain(s, 'int', 1, 'reward').n, 2, 'including a reward gain');
  T.eq(S.gain(s, 'int', 2, 'furniture').n, 2, 'but not a nightly furniture gain');
  T.eq(S.gain(s, 'int', 25, 'fixed').n, 25, 'nor a fixed amount (the degree itself)');
  T.eq(S.gain(s, 'cha', 4).n, 4, 'a Business degree does not touch CHA');
  s.stats.hp = 1;
  T.eq(S.gain(s, 'int', 4).n, 2, 'the degree bonus comes first, then Winded: floor((4 + 1) / 2) = 2');
  s.stats.hp = s.stats.hpMax;
  SR.features.degrees = false;

  // The 999 cap (orig): gains past it are lost.
  s.stats.cha = 998;
  T.eq(S.add(s, 'cha', 5), 1, 'CHA 998 + 5 applies 1');
  T.eq(s.stats.cha, 999, 'CHA stops at 999');
  T.eq(S.add(s, 'cha', 5), 0, 'a gain at the cap is lost');
  T.ok(S.gain(s, 'cha', 5).capped, 'gain() reports the cap');
  T.eq(S.add(s, 'cha', -3), -3, 'a loss applies');
  s.stats.cha = 2;
  T.eq(S.add(s, 'cha', -5), -2, 'a loss floors at 0');
  T.throws(() => S.add(s, 'luck', 1), /unknown stat/, 'an unknown stat throws');
  const out = { events: [] };
  S.add(s, 'int', 2, 'train', out);
  T.eq(out.events, [{ name: 'stat', payload: { key: 'int', n: 2, total: s.stats.int } }], 'add(…, out) raises the `stat` rule event');
}

T.section('HP max = 15 + STR');
{
  const s = K.newState(SR, { stats: { str: 10, int: 5, cha: 5 } });
  T.eq([s.stats.hpMax, s.stats.hp], [25, 25], 'a new character has HP max 15 + STR, full HP');
  S.add(s, 'str', 3);
  T.eq(s.stats.hpMax, 28, 'a STR gain raises HP max by the applied amount');
  T.eq(s.stats.hp, 25, 'HP itself does not rise');
  s.stats.str = 998; s.stats.hpMax = 15 + 998;
  S.add(s, 'str', 4);
  T.eq([s.stats.str, s.stats.hpMax], [999, 1014], 'past the cap only the applied point raises HP max');
  S.add(s, 'str', 4);
  T.eq(s.stats.hpMax, 1014, 'a gain lost to the cap raises neither');

  // Every fixture action, many times, in a seeded random order: the invariant holds after each, and
  // HP max changes only together with STR.
  const t = K.newState(SR);
  t.items.gun = 1; t.items.ammo = 99; t.items.smokes = 20; t.money.cash = 100000; t.items.phone = 1;
  const pick = SR.rng.create(5);
  let broken = 0, changedAlone = 0, runs = 0;
  for (let i = 0; i < 600; i++) {
    if (t.clock.min >= 1300) { t.clock.min = 480; t.clock.day++; }
    if (t.stats.hp < 20) t.stats.hp = t.stats.hpMax;
    const id = pick.pick(ids.filter((x) => !/throws|crash|jail/.test(x)));
    const str0 = t.stats.str, max0 = t.stats.hpMax;
    const r = SR.rules.act.run(t, id, {}, K.ctx(SR, i));
    if (r.ok) runs++;
    if (t.stats.hpMax !== SR.tuning.start.hpMaxBase + t.stats.str) broken++;
    if (t.stats.hpMax !== max0 && t.stats.str === str0) changedAlone++;
  }
  T.ok(runs > 200, 'the random sequence ran ' + runs + ' actions');
  T.eq(broken, 0, 'hpMax === 15 + STR after every action');
  T.eq(changedAlone, 0, 'HP max never changed without STR');
}

T.section('karma, Heat, Buzz, HP');
{
  const s = K.newState(SR);
  T.eq(S.karma(s, 150), 100, 'karma +150 from 0 applies 100');
  T.eq(s.stats.karma, 100, 'karma clamps at +100');
  T.eq(S.karma(s, -250), -200, 'karma -250 applies -200');
  T.eq(s.stats.karma, -100, 'karma clamps at -100');
  T.eq(S.add(s, 'karma', 30), 30, 'add forwards karma');
  T.eq(S.heat(s, 150), 100, 'Heat clamps at 100');
  T.eq(S.heat(s, -150), -100, 'Heat clamps at 0');
  s.npc.mcholland.bribedUntil = s.clock.day + 6;
  T.eq(S.heat(s, 10), 0, "no Heat gains during McHolland's bribe");
  s.stats.heat = 20;
  T.eq(S.heat(s, -5), -5, 'Heat still decays during the bribe');
  s.clock.day += 7;
  T.eq(S.heat(s, 10), 10, 'Heat gains resume after the bribe');
  T.eq([S.buzz(s, 9), s.stats.buzz, S.buzz(s, -9), s.stats.buzz], [5, 5, -5, 0], 'Buzz stays within 0..5');
  s.stats.hp = 20;
  T.eq([S.heal(s, 10), s.stats.hp], [2, 22], 'heal stops at HP max (overheal lost)');
  T.eq([S.hurt(s, 30, 'fall'), s.stats.hp], [22, 0], 'hurt clamps at 0');
  T.eq(S.heal(s, -5), 0, 'a negative heal does nothing');
}

T.section('through the pipeline: karma clamps after every change');
{
  const s = K.newState(SR);
  const run = (id) => SR.rules.act.run(s, id, {}, K.ctx(SR));
  run('testbld.karmaBig');
  T.eq(s.stats.karma, 100, 'a +150 karma effect leaves +100');
  const r = run('testbld.karmaLow');
  T.eq(s.stats.karma, -100, 'a -250 karma effect leaves -100');
  T.eq(r.deltas.find((d) => d.kind === 'karma'), { kind: 'karma', n: -200, from: 100, to: -100 }, 'the delta records the clamped change');
  s.stats.karma = 99;
  run('testbld.work');
  T.eq(s.stats.karma, 100, 'a shift at +99 stops at +100');
}

T.section('stat effect feedback');
{
  const s = K.newState(SR);
  const r = SR.rules.act.run(s, 'testbld.class', {}, K.ctx(SR));
  T.eq(r.stamps, [{ key: 'stamp.stats.int', vars: { n: 4 } }], 'a gain of 2 or more stamps (+4 INTELLIGENCE!)');
  T.ok(r.events.some((e) => e.name === 'stat' && e.payload.key === 'int' && e.payload.n === 4 && e.payload.total === 11), 'the `stat` rule event carries key, n and total');
  s.stats.hp = 1;
  const w = SR.rules.act.run(s, 'testbld.class', {}, K.ctx(SR));
  T.eq([w.deltas.find((d) => d.kind === 'stat').n, w.stamps.length], [2, 1], 'Winded: +2 instead of +4, still stamped');
  T.ok(w.toasts.some((t) => t.key === 'toast.stats.winded' && t.kind === 'warning'), 'Winded raises a warning toast');
  s.stats.hp = s.stats.hpMax;
  s.stats.int = 998;
  const c = SR.rules.act.run(s, 'testbld.class', {}, K.ctx(SR));
  T.eq([c.stamps.length, s.stats.int], [0, 999], 'a +1 at the cap is not stamped');
  T.ok(c.toasts.some((t) => t.key === 'toast.stats.maxed' && t.vars.stat === 'INT' && t.vars.cap === 999), 'the cap raises a maxed toast');
  const st = SR.rules.act.run(s, 'testbld.study', {}, K.ctx(SR));
  T.eq(st.deltas.filter((d) => d.kind === 'stat'), [], 'a gain entirely lost to the cap has no delta');
}

T.section('karma band and tier');
{
  T.eq([0, 1, 10, 11, 20, 21, 55, 90, 91, 100].map(S.band), [0, 0, 0, 1, 1, 2, 5, 8, 9, 9], 'band = clamp(ceil(|k| / 10) - 1, 0, 9)');
  T.eq([-1, -11, -100].map(S.band), [0, 1, 9], 'bands are symmetric (the palette picks good or evil)');
  T.eq([100, 80, 79, 50, 49, 0, -49, -50, -79, -80, -100].map(S.tier),
    ['angelic', 'angelic', 'good', 'good', 'neutral', 'neutral', 'neutral', 'bad', 'bad', 'wicked', 'wicked'], 'tiers follow B-04b');
  T.eq([21, 20, 0, -20, -21].map(S.column), ['good', 'neutral', 'neutral', 'neutral', 'evil'], 'rank columns: > +20 good, < -20 evil');
}

T.done();
