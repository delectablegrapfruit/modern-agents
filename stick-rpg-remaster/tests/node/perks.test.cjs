// tests/node/perks.test.cjs — owner: W1-R. The stat-milestone perks (GDD §4.14; BALANCE B-21; P1
// flag `perks`): offers appear exactly at 100 / 250 / 450 / 700, once per milestone; choose, has;
// the perk defs and their text; perk:offered through SR.act.
//   node tests/node/perks.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('perks');
const SR = K.load();
K.fixtures(SR);
const P = SR.rules.perks, S = SR.rules.stats;

T.section('defs and text');
{
  const defs = SR.registry.entries('perk');
  T.eq(defs.length, 24, '24 perks');
  T.ok(defs.every((e) => e.def.p === 1 && e.def.feature === 'perks'), 'every perk is P1 with the perks flag');
  T.ok(defs.every((e) => SR.text.has(e.def.name) && SR.text.has(e.def.desc)), 'every perk has a name and a one-line rule');
  T.ok(defs.every((e) => SR.tuning.perks[e.id] !== undefined), 'every perk has its rule values in SR.tuning.perks');
  const grid = {};
  for (const e of defs) grid[e.def.stat + e.def.level] = (grid[e.def.stat + e.def.level] || 0) + 1;
  T.eq(Object.keys(grid).length === 12 && Object.values(grid).every((n) => n === 2), true, 'two perks for each of 3 stats × 4 levels');
  T.eq(P.optionsFor('int', 700), ['mastermind', 'taxWizard'], 'INT 700 offers Mastermind or Tax Wizard');
  T.ok(defs.every((e) => SR.text(e.def.desc).length <= 80), 'perk rules are one short line');
}

T.section('flag off');
{
  const s = K.newState(SR);
  s.stats.str = 99;
  S.add(s, 'str', 5);
  T.eq([s.perks.pending, P.offers(s)], [[], []], 'no offers while the perks flag is off');
  s.perks.owned.push('ironStomach');
  T.ok(!P.has(s, 'ironStomach'), 'has() is false while the flag is off');
  T.eq(P.choose(s, 'ironStomach').reason, 'reason.featureOff', 'choose() refuses while the flag is off');
}

SR.features.perks = true;

T.section('offers at 100 / 250 / 450 / 700');
{
  for (const stat of ['str', 'int', 'cha']) {
    const s = K.newState(SR);
    const got = [];
    for (const level of SR.tuning.perks.levels) {
      s.stats[stat] = level - 2;
      S.add(s, stat, 1, 'fixed');
      const below = P.offers(s).length;
      S.add(s, stat, 1, 'fixed');
      const at = P.offers(s);
      got.push([below === got.length, at.length === got.length + 1, at[at.length - 1].level === level]);
    }
    T.ok(got.every((g) => g.every(Boolean)), stat.toUpperCase() + ': an offer appears on reaching each milestone, not one point before');
  }
  const s = K.newState(SR);
  s.stats.str = 99;
  S.add(s, 'str', 1, 'fixed');
  T.eq(P.offers(s), [{ stat: 'str', level: 100, options: ['ironStomach', 'hardLanding'] }], 'STR 100 offers Iron Stomach or Hard Landing');
  S.add(s, 'str', 1, 'fixed');
  T.eq(P.offers(s).length, 1, 'no second offer for the same milestone');

  const j = K.newState(SR);
  j.stats.cha = 90;
  S.add(j, 'cha', 200, 'fixed');
  T.eq(P.offers(j).map((o) => o.level), [100, 250], 'a jump past two milestones offers both');

  const c = P.choose(s, 'hardLanding');
  T.eq([c.ok, c.stat, c.level, s.perks.owned, s.perks.pending], [true, 'str', 100, ['hardLanding'], []], 'choose keeps the perk and closes the offer');
  T.ok(P.has(s, 'hardLanding') && !P.has(s, 'ironStomach'), 'has() knows the chosen perk only');
  s.stats.str = 50;
  S.add(s, 'str', 60, 'fixed');
  T.eq(P.offers(s), [], 'dropping below and rising again does not re-offer a chosen milestone');
  T.eq(P.choose(s, 'brawler').reason, 'reason.perkNotOffered', 'a perk not on offer cannot be chosen');
  const o = P.offers(j);
  o[0].options.push('x');
  T.eq(j.perks.pending[0].options.length, 2, 'offers() returns a copy');
}

T.section('through SR.act');
{
  const s = K.newState(SR);
  s.stats.str = 98;
  SR.state = s;
  const seen = [];
  const off = SR.events.on('perk:offered', (p) => seen.push(p));
  const r = SR.act('testbld.gym');
  T.ok(r.ok, 'the gym runs');
  T.eq(seen, [{ stat: 'str', level: 100, options: ['ironStomach', 'hardLanding'] }], 'perk:offered is emitted for the new milestone');
  SR.act('testbld.gym');
  T.eq(seen.length, 1, 'and only once');
  const pick = SR.act('testbld.perkPick', { id: 'ironStomach' });
  T.eq([pick.ok, s.perks.owned], [true, ['ironStomach']], "the named fn 'perks.choose' picks from an action");
  const bad = SR.act('testbld.perkPick', { id: 'brawler' });
  T.eq([bad.ok, bad.reason], [false, 'reason.perkNotOffered'], 'and refuses a perk not on offer');
  off();

  // Iron Stomach: food of the eat group heals ×1.25.
  s.stats.hp = 1;
  const f = SR.act('testbld.fries');
  T.eq(f.deltas.find((d) => d.kind === 'hp').n, 25, 'fries heal 25 with Iron Stomach (20 × 1.25)');
  SR.state = null;
}

T.section('perk rules applied by the kernel');
{
  const s = K.newState(SR);
  s.stats.hp = 20;
  s.perks.owned = ['hardLanding'];
  const r = SR.rules.act.run(s, 'testbld.fall', {}, K.ctx(SR));
  T.eq(r.deltas.find((d) => d.kind === 'hp').n, -5, 'Hard Landing: a fall costs 5 HP instead of 10');
  s.perks.owned = [];
  const r2 = SR.rules.act.run(s, 'testbld.fall', {}, K.ctx(SR));
  T.eq(r2.deltas.find((d) => d.kind === 'hp').n, -10, 'without it, 10');
}

T.done();
