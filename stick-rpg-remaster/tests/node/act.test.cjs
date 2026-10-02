// tests/node/act.test.cjs — owner: W2-RulesE (W1-R in wave 1). The action pipeline (ARCHITECTURE §6.2-§6.4, §6.9;
// CONTRACT §8): preview never mutates the state (every registered action, every fixture); feature
// flags and `hidden`; the pipeline order and its reasons; the hard money rule and forced charges;
// the lien; rollback when a named fn refuses; the arcs hook; the HP-0 hook; open / jail / log / msg
// / achievement effects; deltas; SR.act's event order (action:done last); the daily log's 20
// entries by weight.
//   node tests/node/act.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('act');
const SR = K.load();
const ids = K.fixtures(SR);
const A = SR.rules.act;
const run = (s, id, params, seed) => A.run(s, id, params || {}, K.ctx(SR, seed));
const pv = (s, id, params) => A.preview(s, id, params || {}, K.ctx(SR));

/** A few states that exercise different branches of every action. */
function states() {
  const fresh = K.newState(SR);
  const rich = K.newState(SR, { seed: 2 });
  Object.assign(rich.items, { gun: 1, ammo: 50, smokes: 5, phone: 1, coupon: 1, takeout: ['fries'] });
  Object.assign(rich.money, { cash: 50000, bank: 1000, lien: 300 });
  rich.stats.hp = 5;
  const late = K.newState(SR, { seed: 3 });
  late.clock.min = 1440;
  late.stats.hp = 1;
  const broke = K.newState(SR, { seed: 4, difficulty: 'hardcore' });
  broke.money.cash = 0;
  broke.job.ranks.mcsticks = null;
  return [fresh, rich, late, broke];
}

T.section('preview never mutates the state');
{
  const all = SR.registry.entries('action').map((e) => e.id);
  const paramSets = [{}, { variant: 'takeout' }, { amount: 10, id: 'ironStomach', n: 1 }];
  let checked = 0, mutated = [], streamMoved = 0, fixtureThrows = [], otherThrows = [];
  for (const flagsOn of [false, true]) {
    for (const f of Object.keys(SR.features)) SR.features[f] = flagsOn;
    for (const s of states()) {
      for (const id of all) {
        for (const params of paramSets) {
          const before = K.json(s), rules0 = K.json(SR.rng.rules.state());
          try { pv(s, id, params); } catch (e) { (ids.includes(id) ? fixtureThrows : otherThrows).push(id + ': ' + e.message); }
          if (JSON.stringify(s) !== JSON.stringify(before)) mutated.push(id);
          if (JSON.stringify(SR.rng.rules.state()) !== JSON.stringify(rules0)) streamMoved++;
          checked++;
        }
      }
    }
  }
  for (const f of Object.keys(SR.features)) SR.features[f] = false;
  T.ok(checked >= ids.length * 4 * 3 * 2, 'previewed ' + all.length + ' actions (' + ids.length + ' fixtures) × 4 states × 3 param sets × flags off / on');
  T.eq([...new Set(mutated)], [], 'the state is deep-equal before and after every preview');
  T.eq(streamMoved, 0, 'the rules stream never advances');
  T.eq([...new Set(fixtureThrows)].filter((x) => !/testbld\.throws/.test(x)), [], 'no fixture preview throws (except the planted throw)');
  if (otherThrows.length) console.log('  note: previews of other packages\' actions threw: ' + [...new Set(otherThrows)].slice(0, 5).join('; '));

  // A named fn that reaches for SR.state or SR.rng.rules still cannot change them during a preview.
  SR.def.fn('test.sneaky', () => { SR.state.money.cash += 1000; SR.rng.rules.next(); return {}; });
  SR.def.action('testbld.sneaky', { building: 'testbld', group: 'special', p: 0, effects: [['fn', 'test.sneaky']] });
  const s = K.newState(SR);
  SR.state = s;
  const before = K.json(s), r0 = K.json(SR.rng.rules.state());
  const p = SR.preview('testbld.sneaky');
  T.eq([K.json(s), K.json(SR.rng.rules.state())], [before, r0], 'SR.state and SR.rng.rules are shielded from a misbehaving fn');
  T.eq(p.gains, [{ kind: 'cash', n: 1000, min: 1000, max: 1000, capped: false }], 'and the preview still shows its effect');
  SR.state = null;
}

T.section('feature flags and hidden rows');
{
  const s = K.newState(SR);
  T.eq(pv(s, 'testbld.degreeClass'), { id: 'testbld.degreeClass', hidden: true }, 'a P1 def previews as hidden while its flag is off');
  T.eq(run(s, 'testbld.degreeClass').reason, 'reason.featureOff', 'and is refused with reason.featureOff');
  SR.features.degrees = true;
  const on = pv(s, 'testbld.degreeClass');
  T.eq([on.hidden, on.ok, on.cost.cash], [false, true, 20], 'with the flag on it previews normally');
  SR.features.degrees = false;
  T.eq(pv(s, 'testbld.phoneOnly').hidden, true, '`hidden` conditions hide a row (no phone)');
  T.eq(run(s, 'testbld.phoneOnly').reason, 'reason.unavailable', 'and refuse it');
  s.items.phone = 1;
  T.eq([pv(s, 'testbld.phoneOnly').hidden, run(s, 'testbld.phoneOnly').ok], [false, true], 'with a phone it shows and runs');
  T.eq(pv(s, 'nope.nothing').hidden, true, 'an unknown action previews hidden');
  T.eq(run(s, 'nope.nothing').reason, 'reason.unknown', 'and is refused');
}

T.section('preview contents');
{
  const s = K.newState(SR);
  s.stats.hp = 10;
  const f = pv(s, 'testbld.fries');
  T.eq(f.cost, { cash: 9, min: 30, hp: 0, items: {} }, 'fries: $9 (employee), 30 m');
  T.eq(f.gains, [{ kind: 'hp', n: 12, min: 12, max: 12, capped: true }], '+12 HP capped at HP max ("(full)")');
  T.eq([f.badges, f.repeatable, f.hotkey, f.screen, f.chance, f.hidden], [['employee'], true, null, null, null, false], 'badges, repeat, no chance');
  s.stats.hp = 1;
  T.eq(pv(s, 'testbld.fries').gains[0], { kind: 'hp', n: 20, min: 20, max: 20, capped: false }, 'a full +20 HP when there is room');
  s.stats.hp = s.stats.hpMax;
  const full = pv(s, 'testbld.fries');
  T.eq([full.ok, full.reason, full.gains], [false, 'reason.fullHp', []], 'at full HP: refused with Full HP and no gains');
  const w = pv(s, 'testbld.work');
  T.eq(w.gains.map((g) => [g.kind, g.n]), [['cash', 42], ['karma', 1]], 'work: +$42, +1 karma');
  T.eq(w.cost, { cash: 0, min: 360, hp: 0, items: {} }, 'work costs 6 h');
  const d = pv(s, 'testbld.deposit');
  T.eq([d.ok, d.screen, d.cost, d.gains], [true, 'bank.deposit', { cash: 0, min: 0, hp: 0, items: {} }, []], 'a sub-screen row shows no cost chips');
  s.money.cash = 0;
  T.eq(pv(s, 'testbld.deposit').reason, 'reason.needCash', "but its requires can disable it");
  s.money.cash = 100;
  s.items.ammo = 20;
  const am = pv(s, 'testbld.ammoLoss');
  T.eq(am.gains, [{ kind: 'item', n: -7, min: -9, max: -5, capped: false, key: 'ammo' }], 'a random amount shows its typical value and range (rand(5..9))');
  const coin = pv(s, 'testbld.coin');
  T.eq([coin.chance, coin.gains.map((g) => g.n)], [0.5, [10]], 'a chance effect shows its odds and the success branch');
  const c2 = pv(s, 'testbld.coin');
  T.eq(K.json(coin), K.json(c2), 'previews are stable (they never draw from the real stream)');
  const g = pv(s, 'testbld.gym');
  T.eq([g.cost.hp, g.gains.map((x) => x.kind + (x.key || ''))], [4, ['statstr', 'hpMax']], 'the gym: -4 HP cost, +STR and HP max');
}

T.section('pipeline order and reasons');
{
  const s = K.newState(SR);
  s.job.ranks.mcsticks = null;
  let r = run(s, 'testbld.work');
  T.eq([r.ok, r.reason], [false, 'reason.staffOnly'], 'requires fail first (no McSticks job)');
  s.job.ranks.mcsticks = 'cook';
  s.clock.min = 1110;
  T.eq(run(s, 'testbld.work').reason, 'reason.tooLate', 'then the time rule');
  s.clock.min = 480;
  s.money.cash = 10;
  r = run(s, 'testbld.class');
  T.eq([r.reason, r.vars], ['reason.needCash', { n: 20, money: '$20' }], 'then the price and cash: "Need $20"');
  s.money.cash = 100;
  s.stats.hp = 10;
  r = run(s, 'testbld.useSmokes');
  T.eq([r.reason, r.vars.n], ['reason.tooHurt', 10], 'hpAbove refuses with "Too hurt" at HP = c');
  s.stats.hp = 11;
  T.eq(run(s, 'testbld.useSmokes').reason, 'reason.needItem', 'item costs are checked (no smokes)');
  s.items.smokes = 2;
  r = run(s, 'testbld.useSmokes');
  T.eq([r.ok, s.items.smokes, s.stats.hp, s.stats.karma], [true, 1, 1, -1], 'the cost is paid: a pack, 10 HP; the effects run');
  const rob = run(K.newState(SR), 'testbld.rob');
  T.eq([rob.reason, SR.text(rob.reason, rob.vars)], ['reason.needItem', 'Need ' + SR.rules.conditions.nameOf('item', 'gun')], 'the first failing requirement is the reason, rendered through SR.text');
  const h = K.newState(SR);
  h.stats.hp = 4;
  T.eq(run(h, 'testbld.gym').reason, 'reason.tooHurt', 'the gym at HP 4 (cost 4): Too hurt');
  h.stats.hp = 5;
  T.ok(run(h, 'testbld.gym').ok, 'at HP 5 it runs');
  T.eq(h.stats.hp, 1, 'and costs 4 HP');
  SR.features.calendar = true;
  const hw = K.newState(SR);
  hw.world.cityEvent = { id: 'heatWave', day: hw.clock.day };
  hw.stats.hp = 6;
  T.eq([pv(hw, 'testbld.gym').cost.hp, pv(hw, 'testbld.gym').reason], [6, 'reason.tooHurt'], 'Heat Wave: training HP costs ×1.5 (4 → 6) and "Too hurt" follows');
  hw.stats.hp = 7;
  T.ok(pv(hw, 'testbld.gym').ok, 'HP 7 is enough on a Heat Wave day');
  T.eq(pv(hw, 'testbld.fries').cost.hp, 0, 'food is not training or work');
  SR.features.calendar = false;
}

T.section('refusals and rollback leave nothing behind');
{
  const s = K.newState(SR);
  s.money.cash = 3;
  const before = K.json(s);
  const c = K.ctx(SR, 11), r0 = K.json(c.rng.state());
  const r = A.run(s, 'testbld.class', {}, c);
  T.eq([r.ok, r.deltas, K.json(s), K.json(c.rng.state())], [false, [], before, r0], 'a refused action changes nothing');
  s.money.cash = 100;
  const b2 = K.json(s);
  const c2 = K.ctx(SR, 12), r2 = K.json(c2.rng.state());
  const x = A.run(s, 'testbld.refuse', {}, c2);
  T.eq([x.ok, x.reason], [false, 'reason.notNow'], 'a named fn that refuses refuses the action');
  T.eq([K.json(s), K.json(c2.rng.state())], [b2, r2], 'and everything it already did is rolled back (cash, karma, the stream)');
  T.throws(() => A.run(s, 'testbld.throws', {}, K.ctx(SR)), /planted/, 'a programmer error in a named fn throws from the pure form');
  T.eq(K.json(s), b2, 'after rolling the state back');
}

T.section('the hard money rule');
{
  const s = K.newState(SR);
  Object.assign(s.money, { cash: 100, bank: 50 });
  let r = run(s, 'testbld.bill');
  T.eq([s.money.cash, s.money.bank], [0, 0], 'a forced charge of $500 against $150 leaves cash and bank at 0');
  const t = r.toasts.find((x) => x.key === 'toast.act.writtenOff');
  T.eq(t && [t.vars.n, t.vars.money, t.kind], [350, '$350', 'warning'], 'and reports the $350 write-off');
  T.eq(r.deltas.map((d) => [d.kind, d.n]), [['cash', -100], ['bank', -50]], 'the deltas show cash, then bank');
  Object.assign(s.money, { cash: 300, bank: 1000 });
  r = run(s, 'testbld.bill');
  T.eq([s.money.cash, s.money.bank, r.toasts.length], [0, 800, 0], 'cash first, then the bank; nothing written off');

  // The same rule before W1-E's bank module is there (a context without SR.rules.bank.charge).
  const S2 = K.load();
  K.fixtures(S2);
  delete S2.rules.bank.charge;
  delete S2.reg.fn['bank.charge'];
  const s2 = K.newState(S2);
  Object.assign(s2.money, { cash: 100, bank: 50 });
  const r2 = S2.rules.act.run(s2, 'testbld.bill', {}, K.ctx(S2));
  T.eq([s2.money.cash, s2.money.bank, r2.toasts[0].vars.n], [0, 0, 350], 'the kernel applies the same rule when bank.charge is not loaded');

  const g = K.newState(SR);
  g.items.gum = 2;
  SR.rules.effects.run(g, [['item', 'gum', -5]], { rng: SR.rng.create(1) });
  T.eq(g.items.gum, 0, 'item counts never go below 0');
  g.items.ammo = 97;
  SR.rules.effects.run(g, [['item', 'ammo', 5]], { rng: SR.rng.create(1) });
  T.eq(g.items.ammo, 99, 'nor above their B-06 stack');
  g.money.cash = 5;
  SR.rules.effects.run(g, [['cash', -20]], { rng: SR.rng.create(1) });
  T.eq(g.money.cash, 0, 'a debit never takes cash below 0');
}

T.section('the lien (B-09)');
{
  const s = K.newState(SR);
  s.money.lien = 100;
  const before = s.money.cash;
  run(s, 'testbld.work');
  T.eq([s.money.cash - before, s.money.lien], [21, 79], 'a $42 wage sends half ($21) to the lien');
  s.money.lien = 10;
  const c0 = s.money.cash;
  s.clock.min = 480;
  run(s, 'testbld.work');
  T.eq([s.money.cash - c0, s.money.lien], [32, 0], 'never more than what is owed');
  SR.rules.effects.run(s, [['cash', 50]], { rng: SR.rng.create(1) });
  T.eq(s.money.lien, 0, 'income without a source is not split');
  s.money.lien = 50;
  SR.rules.effects.run(s, [['cash', 45, 'win']], { rng: SR.rng.create(1) });
  T.eq(s.money.lien, 27, '$45 of winnings: 23 (half, rounded up) to the lien');
}

T.section('the HP-0 hook (SR.rules.health.down)');
{
  const S2 = K.load();
  K.fixtures(S2);
  const calls = [];
  S2.rules.health.down = (s, cause) => { calls.push(cause); s.stats.hp = 1; return { outcome: 'hospital', cause, bill: 0, writtenOff: 0, report: null }; };
  const s = K.newState(S2);
  S2.state = s;
  const seen = [];
  S2.events.on('*', (p, n) => seen.push(n));
  const r = S2.act('testbld.crash');
  T.eq(calls, ['carCrash'], 'HP 0 calls health.down with the cause of the last hurt');
  T.eq([r.down.outcome, r.events.map((e) => e.name)], ['hospital', ['down']], 'Result.down is set and the down rule event raised');
  T.ok(seen.indexOf('player:down') >= 0 && seen.indexOf('player:down') < seen.indexOf('action:done'), 'player:down is emitted before action:done');
  s.stats.hp = 5;
  S2.act('testbld.fall');
  T.eq(calls, ['carCrash', 'fall'], 'a fall at 5 HP reaches the hook with cause fall');
  s.stats.hp = 20;
  S2.act('testbld.fall');
  T.eq(calls.length, 2, 'HP above 0 never calls it');
  S2.state = null;

  // With W1-E's real module (integration, reported and asserted only on the pipeline's side).
  const s3 = K.newState(SR, { seed: 21 });
  try {
    const r3 = run(s3, 'testbld.crash');
    T.ok(r3.down && ['hospital', 'secondWind', 'death'].includes(r3.down.outcome), 'with the real health.down, a Standard HP 0 resolves (outcome ' + (r3.down && r3.down.outcome) + ')');
    T.eq(r3.events.filter((e) => e.name === 'down').length, 1, 'exactly one down rule event');
  } catch (e) {
    console.log('  note: the real SR.rules.health.down threw: ' + e.message);
  }
}

T.section('open, jail, log, msg, achievement');
{
  const s = K.newState(SR);
  Object.assign(s.items, { gun: 1, ammo: 20 });
  s.clock.min = 1230;
  const r = run(s, 'testbld.rob');
  T.eq(r.open, { minigame: 'holdup', skin: 'holdup', params: { target: 'store' }, resolve: 'testbld.rob:resolve' }, 'open(skin) fills Result.open (D29)');
  const z = run(s, 'testbld.rob:resolve', { beats: [false, false, true] });
  T.eq([z.ok, s.clock.min, s.stats.karma, s.stats.heat], [true, 1440, -10, 30], "the ':resolve' action runs with the minigame result");

  const S2 = K.load();
  K.fixtures(S2);
  S2.rules.crime = Object.assign(S2.rules.crime || {}, {});
  S2.rules.crime.jail = (st, reason) => { st.jail = { daysLeft: 3, served: 0, reason, bailBase: 0 }; return { days: 3 }; };
  const j = S2.rules.act.run(K.newState(S2), 'testbld.jail', {}, K.ctx(S2));
  T.eq([j.jailed, j.events], [{ reason: 'test', days: 3 }, [{ name: 'jail', payload: { reason: 'test', days: 3 } }]], 'jail(reason) sets Result.jailed and the jail event');

  const n = run(s, 'testbld.news');
  T.eq(n.log, [{ kind: 'promoted', weight: 60, vars: { track: 'nli' } }], 'log(kind) writes the weighted entry');
  T.eq(s.log.today[s.log.today.length - 1].kind, 'promoted', 'into today\'s log');
  T.eq([n.msgs, s.msgs[s.msgs.length - 1].from, s.msgs[s.msgs.length - 1].read], [[{ key: 'vm.harold.test', vars: { n: 1 } }], 'harold', false], 'msg(key) delivers a message from the key\'s NPC');
  T.eq([n.toasts[0], n.stamps[0]], [{ key: 'toast.stats.winded', vars: {}, kind: 'info' }, { key: 'stamp.stats.int', vars: { n: 2 } }], 'toast and stamp effects');

  const m = K.newState(SR);
  for (let i = 0; i < 200; i++) SR.rules.effects.addMsg(m, 'vm.test.x', { i }, null);
  T.eq(m.msgs.length, 150, 'the inbox keeps 150 messages');
  T.eq([m.msgs[0].vars.i, m.msgs[149].vars.i, m.msgs[149].id], [50, 199, 200], 'all unread: the oldest go first; ids keep growing');
  m.msgs[10].read = true; m.msgs[20].read = true; m.msgs[20].archived = true;
  SR.rules.effects.addMsg(m, 'vm.test.x', { i: 200 }, null);
  T.eq(m.msgs.length, 150, 'still 150 after one more');
  T.ok(!m.msgs.some((x) => x.vars.i === 60) && m.msgs.some((x) => x.vars.i === 70), 'message 60 (read) was pruned, archived 70 kept');

  const a = K.newState(SR);
  T.eq(run(a, 'testbld.achieve').achievements, [], 'achievement(id) does nothing while the flag is off');
  SR.features.achievements = true;
  const u = run(a, 'testbld.achieve');
  T.eq([u.achievements, a.achievements], [['firstFries'], { firstFries: 1 }], 'with the flag on it unlocks once, with the run day');
  T.eq(run(a, 'testbld.achieve').achievements, [], 'never twice');
  const cheat = K.newState(SR, { name: 'PAPERGOD' });
  T.eq(run(cheat, 'testbld.achieve').achievements, [], 'never on a cheat run');
  SR.features.achievements = false;
}

T.section('the daily log: 20 entries by weight (B-29)');
{
  const s = K.newState(SR);
  const L = SR.rules.log;
  for (let i = 0; i < 20; i++) L.add(s, i % 2 ? 'fall' : 'carHit', { i });
  T.eq(s.log.today.length, 20, '20 entries fit');
  T.eq(L.add(s, 'storm', {}), null, 'a lighter 21st entry is dropped');
  T.eq(L.add(s, 'fall', {}), null, 'an equal one too');
  const p = L.add(s, 'promoted', { track: 'nli' });
  T.eq([p.weight, s.log.today.length], [60, 20], 'a heavier one replaces the lightest');
  T.eq(s.log.today.filter((e) => e.kind === 'fall').length, 9, 'the oldest of the lightest (a fall) went');
  T.eq(s.log.today[19].kind, 'promoted', 'the list stays chronological');
  const weights = [];
  for (const k of ['jailed', 'hospital', 'electionWon', 'degree']) weights.push(L.add(s, k).weight);
  T.eq(weights, [80, 70, 100, 55], 'weights come from tuning.news.weights');
  T.ok(s.log.today.every((e) => e.weight >= 10) && s.log.today.length === 20, 'the 20 heaviest remain');
  T.eq(L.add(s, 'nonsense'), null, 'an unknown kind weighs 0 (warned once) and is dropped from a full day');
  L.roll(s);
  T.eq([s.log.today, s.log.yesterday.length], [[], 20], 'roll(): today becomes yesterday');
}

T.section('deltas');
{
  const s = K.newState(SR);
  const a = A.snapshot(s);
  s.clock.day = 2; s.clock.min = 720;
  s.job.ranks.nli = 'janitor';
  s.homes.living = 'apt2'; s.homes.owned.push('apt2');
  s.furniture.owned.bed = 1;
  s.money.lien = 50;
  s.items.takeout.push('fries');
  const d = A.diff(a, A.snapshot(s));
  T.eq(d, [
    { kind: 'time', n: 1680, from: 480, to: 720 },
    { kind: 'lien', n: 50, from: 0, to: 50 },
    { kind: 'item', n: 1, from: 0, to: 1, key: 'takeout' },
    { kind: 'job', key: 'nli', n: 1, from: null, to: 'janitor' },
    { kind: 'home', key: 'living', n: 1, from: 'apt', to: 'apt2' },
    { kind: 'home', key: 'owned', n: 1, from: ['apt'], to: ['apt', 'apt2'] },
    { kind: 'furniture', n: 1, from: 0, to: 1, key: 'bed' },
  ], 'time across days, lien, list items, job, home and furniture deltas');
}

T.section('wave-1 integration requests (W1-Q 5, W1-E R3, W1-C 2)');
{
  // W1-Q request 5: a positive cash / bank Delta names its income source (CONTRACT §8.3 key?, §8.4).
  SR.def.fn('test.wageToBank', (s) => { SR.rules.bank.income(s, 30, 'wage', 'bank'); return {}; });
  SR.def.action('testbld.bankWage', { building: 'testbld', group: 'special', p: 0, effects: [['fn', 'test.wageToBank']] });
  SR.def.action('testbld.mixed', { building: 'testbld', group: 'special', p: 0, effects: [['cash', 10, 'win'], ['cash', 50, 'wage'], ['cash', 5]] });
  SR.def.action('testbld.spendWin', { building: 'testbld', group: 'special', p: 0, effects: [['cash', 10, 'win'], ['cash', -30]] });
  const cashOf = (r, kind) => r.deltas.find((d) => d.kind === (kind || 'cash'));
  const w = run(K.newState(SR), 'testbld.work');
  T.eq(cashOf(w), { kind: 'cash', n: 42, from: 100, to: 142, key: 'wage' }, 'cash(42, wage): the Delta carries key "wage"');
  T.eq(cashOf(run(K.newState(SR), 'testbld.bankWage'), 'bank'), { kind: 'bank', n: 30, from: 0, to: 30, key: 'wage' },
    'SR.rules.bank.income (named fns such as jobs.work) is recorded too');
  T.eq(cashOf(run(K.newState(SR), 'testbld.mixed')).key, 'wage', 'several sources: the one that credited the most');
  const plain = K.newState(SR);
  plain.stats.hp = 10;
  T.eq(cashOf(run(plain, 'testbld.coin')).key, undefined, 'a credit without an income source names none');
  T.eq(cashOf(run(K.newState(SR), 'testbld.spendWin')).key, undefined, 'a negative cash Delta never names a source');
  const track = SR.rules.effects.trackIncome, open = [0, 0];
  SR.rules.effects.trackIncome = () => { open[0]++; const close = track(); return () => { open[1]++; return close(); }; };
  pv(K.newState(SR), 'testbld.work');
  try { run(K.newState(SR), 'testbld.throws'); } catch (e) { /* planted */ }
  SR.rules.effects.trackIncome = track;
  T.ok(open[0] >= 2 && open[0] === open[1], 'previews and a thrown action close every recorder they open', open);

  // W1-E request R3: Down.toasts join Result.toasts (Second Wind's toast, ARCHITECTURE §6.7).
  const S2 = K.load();
  K.fixtures(S2);
  S2.features.perks = true;
  const sw = K.newState(S2);
  sw.perks.owned.push('secondWind');
  const r = S2.rules.act.run(sw, 'testbld.crash', {}, K.ctx(S2));
  T.eq([r.down.outcome, sw.stats.hp, r.toasts.map((t) => t.key)], ['secondWind', 1, ['toast.health.secondWind']], 'Second Wind: HP 1 and its toast in the Result');

  // W1-C request 2: the jail effect passes the pipeline's context to SR.rules.crime.jail.
  const S3 = K.load();
  K.fixtures(S3);
  let got = null;
  S3.rules.crime.jail = (st, reason, ctx) => { got = ctx; st.jail = { daysLeft: 1, served: 0, reason, bailBase: 0 }; return { days: 1 }; };
  const cx = K.ctx(S3, 5);
  S3.rules.act.run(K.newState(S3), 'testbld.jail', {}, cx);
  T.ok(got && got.rng === cx.rng && got.id === 'testbld.jail', 'crime.jail(s, reason, ctx) gets the pipeline ctx (its rng is the caller\'s stream)');
}

T.section('SR.act: events in the order of CONTRACT §8.7');
{
  const s = K.newState(SR);
  SR.state = s;
  const seen = [];
  const off = SR.events.on('*', (p, n) => seen.push(n));
  let r = SR.act('testbld.work');
  T.eq(seen, ['shift', 'time:advanced', 'karma:changed', 'money:changed', 'action:done'], 'rule events, then UI events from the deltas, action:done last');
  seen.length = 0;
  r = SR.act('testbld.class');
  T.eq(seen, ['stat', 'time:advanced', 'stat:changed', 'money:changed', 'action:done'], 'the stat rule event is derived from the gain');
  T.eq(K.json(s.rng.rules), K.json(SR.rng.rules.state()), 'state.rng.rules follows the rules stream');
  seen.length = 0;
  const payloads = {};
  const off2 = SR.events.on('*', (p, n) => { payloads[n] = p; });
  s.stats.hp = 10;
  SR.act('testbld.fries');
  T.eq(seen, ['eat', 'time:advanced', 'stat:changed', 'money:changed', 'action:done'], 'eating: eat, time, HP, money');
  T.eq(payloads['money:changed'], { cash: s.money.cash, bank: s.money.bank, delta: -9, reason: 'testbld.fries' }, 'money:changed carries the balances and the change');
  T.eq(payloads['stat:changed'], { key: 'hp', from: 10, to: 22, delta: 12 }, 'stat:changed for HP');
  T.eq(payloads['action:done'].id, 'testbld.fries', 'action:done carries the id and the result');
  seen.length = 0;
  SR.act('testbld.news');
  T.ok(seen.includes('msg:received') && seen.indexOf('msg:received') < seen.indexOf('action:done'), 'msg:received for a new message');
  seen.length = 0;
  const refused = SR.act('testbld.degreeClass');
  T.eq([refused.ok, seen], [false, ['action:done']], 'a refusal emits only action:done (result.ok false)');
  s.election.status = 'campaign';
  seen.length = 0;
  SR.def.fn('test.poll', (st) => { st.election.poll += 2; return {}; });
  SR.def.action('testbld.poll', { building: 'testbld', group: 'special', p: 0, effects: [['fn', 'test.poll']] });
  SR.act('testbld.poll');
  T.eq(seen, ['election:changed', 'action:done'], 'election:changed when the status or poll moves');
  off(); off2();

  const errs = [];
  const S3 = K.L.load({ mode: 'rules', console: { log() {}, warn() {}, error: (...a) => errs.push(a.join(' ')) } }).SR;
  K.fixtures(S3);
  S3.state = K.newState(S3);
  const e = S3.act('testbld.throws');
  T.eq([e.ok, e.reason, errs.length], [false, 'reason.error', 1], 'SR.act turns a thrown error into a refusal and logs it once');
  S3.act('testbld.throws');
  T.eq(errs.length, 1, 'only once per action');
  S3.state.over = true;
  T.eq(S3.act('testbld.work').reason, 'reason.gameOver', 'nothing runs once the game is over');
  S3.state = null;
  T.eq(S3.act('testbld.work').reason, 'reason.noGame', 'SR.act without a game refuses');
  T.eq(S3.preview('testbld.work').reason, 'reason.noGame', 'and so does SR.preview');
  SR.state = null;
}

T.section('the arcs hook');
{
  const S2 = K.load();
  K.fixtures(S2);
  const got = [];
  S2.rules.arcs = { onEvent: (s, ev) => { got.push(ev.name); return ev.name === 'gift' ? [['karma', 2], ['emit', 'talk', { npc: 'harold' }]] : null; } };
  const s = K.newState(S2);
  const r = S2.rules.act.run(s, 'testbld.arcGift', {}, K.ctx(S2));
  T.eq(got, ['gift', 'talk'], 'every rule event passes to arcs.onEvent once, including those the arcs raise');
  T.eq([s.stats.karma, r.events.map((e) => e.name)], [2, ['gift', 'talk']], 'the arcs\' effects join the Result');
  S2.rules.arcs = { onEvent: () => [['emit', 'loop', {}]] };
  const l = S2.rules.act.run(K.newState(S2), 'testbld.arcGift', {}, K.ctx(S2));
  T.ok(l.ok && l.events.length <= 65, 'a looping arc stops after 64 events');
  S2.rules.arcs = { onEvent: () => ({ ok: false, reason: 'reason.notNow' }) };
  const s2 = K.newState(S2), b = K.json(s2);
  const x = S2.rules.act.run(s2, 'testbld.arcGift', {}, K.ctx(S2));
  T.eq([x.ok, K.json(s2)], [false, b], 'an arc that refuses rolls the action back');
}

T.section('actions per building');
{
  const list = A.actions('testbld');
  T.ok(!list.some((x) => /:resolve$/.test(x)), "':resolve' actions are never rows");
  const groups = list.map((x) => SR.reg.action[x].group);
  const order = A.GROUPS;
  T.ok(groups.every((g, i) => i === 0 || order.indexOf(groups[i - 1]) <= order.indexOf(g)), 'rows come in card group order (eat, buy, work, train, services, crime, special)');
  T.eq(list.slice(0, 2), ['testbld.fries', 'testbld.snack'], 'then by order');
}

T.section('every condition of ARCHITECTURE §6.4: passes, fails with its reason');
{
  const C = SR.rules.conditions;
  const s = K.newState(SR);
  const ev = (cond, ctx) => C.eval(s, cond, ctx || {});
  const pass = (cond, ctx) => ev(cond, ctx).ok === true;
  const why = (cond, ctx) => ev(cond, ctx).reason;
  const rows = [];
  const row = (name, ok, reason) => rows.push([name, ok, reason]);

  row('timeFits', pass(['timeFits'], { cost: { min: 960 } }), why(['timeFits'], { cost: { min: 990 } }) === 'reason.tooLate');
  row('cashAtLeast', pass(['cashAtLeast', 100]), why(['cashAtLeast', 101]) === 'reason.needCash');
  s.stats.hp = 10;
  row('hpBelowMax', pass(['hpBelowMax']), (s.stats.hp = s.stats.hpMax, why(['hpBelowMax']) === 'reason.fullHp'));
  s.stats.hp = 10;
  row('hpAbove', pass(['hpAbove', 9]), why(['hpAbove', 10]) === 'reason.tooHurt');
  row('stat', pass(['stat', 'int', 7]), why(['stat', 'int', 8]) === 'reason.needStat');
  row('statBelow', pass(['statBelow', 'str', 8]), why(['statBelow', 'str', 7]) === 'reason.statAbove');
  s.stats.karma = 30;
  row('karma', pass(['karma', 30, 40]) && pass(['karma', null, 30]), why(['karma', 31, null]) === 'reason.karmaLow' && why(['karma', null, 29]) === 'reason.karmaHigh');
  s.items.ammo = 10;
  s.items.takeout = ['fries', 'milkshake'];
  row('item', pass(['item', 'ammo', 10]) && pass(['item', 'takeout', 2]), why(['item', 'ammo', 11]) === 'reason.needItems' && why(['item', 'gun']) === 'reason.needItem');
  row('noItem', pass(['noItem', 'gun']), why(['noItem', 'ammo']) === 'reason.haveItem');
  s.flags.met = true;
  row('flag', pass(['flag', 'met']), why(['flag', 'other']) === 'reason.notYet');
  row('notFlag', pass(['notFlag', 'other']), why(['notFlag', 'met']) === 'reason.alreadyDone');
  SR.features.police = true;
  row('feature', pass(['feature', 'police']), (SR.features.police = false, why(['feature', 'police']) === 'reason.featureOff'));
  s.job.ranks.nli = 'mail';
  row('job', pass(['job', 'mail']) && pass(['job', 'cook']), why(['job', 'sales']) === 'reason.needJob');
  row('jobTrack', pass(['jobTrack', 'nli']), (s.job.ranks.nli = null, why(['jobTrack', 'nli']) === 'reason.staffOnly'));
  s.job.ranks.nli = 'sales';
  row('jobAtLeast', pass(['jobAtLeast', 'mail']) && pass(['jobAtLeast', 'sales']), why(['jobAtLeast', 'exec']) === 'reason.needJob' && why(['jobAtLeast', 'manager']) === 'reason.needJob');
  s.homes.owned = ['apt', 'pent'];
  s.homes.living = 'pent';
  row('homeTier', pass(['homeTier', 'apt2']) && pass(['homeTier', 'pent']), why(['homeTier', 'mansion']) === 'reason.needHome');
  row('livesIn', pass(['livesIn', 'pent']), why(['livesIn', 'apt']) === 'reason.notLivingHere');
  row('owns', pass(['owns', 'apt']), why(['owns', 'castle']) === 'reason.notOwned');
  s.furniture.owned = { tv: 2, bed: 1 };
  row('furniture', pass(['furniture', 'tv', 2]) && pass(['furniture', 'bed']), why(['furniture', 'bed', 2]) === 'reason.needFurniture' && why(['furniture', 'pc']) === 'reason.needFurniture');
  row('freeSlots', pass(['freeSlots', 1]), why(['freeSlots', 99]) === 'reason.noSlots');
  s.clock.day = 3;
  row('weekday', pass(['weekday', ['wed', 'thu']]), why(['weekday', ['mon']]) === 'reason.wrongDay');
  s.clock.min = 600;
  row('timeBetween', pass(['timeBetween', 600, 630]), why(['timeBetween', 630, 700]) === 'reason.notBefore' && why(['timeBetween', 0, 600]) === 'reason.notAfter');
  s.world.weather = 'rain';
  const clearOnly = pass(['weather', ['clear']]) && why(['weather', ['rain']]) === 'reason.weather';
  SR.features.weather = true;
  row('weather', clearOnly && pass(['weather', ['rain', 'fog']]), why(['weather', ['clear']]) === 'reason.weather');
  SR.features.weather = false;
  s.stats.heat = 40;
  row('heat', pass(['heat', 40, 60]) && pass(['heat', null, 40]), why(['heat', 41, null]) === 'reason.heatLow' && why(['heat', null, 39]) === 'reason.heatHigh');
  s.stats.buzz = 4;
  row('buzzBelow', pass(['buzzBelow', 5]), why(['buzzBelow', 4]) === 'reason.tooBuzzed');
  s.daily.campaign.rally = 1;
  row('dailyBelow', pass(['dailyBelow', 'campaign.rally', 2]) && pass(['dailyBelow', 'nap', 1]), why(['dailyBelow', 'campaign.rally', 1]) === 'reason.dailyLimit');
  s.weekly.openMic = 1;
  row('weeklyBelow', pass(['weeklyBelow', 'party', 1]), why(['weeklyBelow', 'openMic', 1]) === 'reason.weeklyLimit');
  s.npc.harold.stage = 'asked';
  row('npcStage', pass(['npcStage', 'harold', ['start', 'asked']]), why(['npcStage', 'harold', 'hired']) === 'reason.notNow');
  s.election.status = 'campaign';
  row('election', pass(['election', ['nominated', 'campaign']]), why(['election', 'office']) === 'reason.notNow');
  s.perks.owned = ['regular'];
  const perkOff = why(['perk', 'regular']) === 'reason.needPerk';
  SR.features.perks = true;
  row('perk', perkOff && pass(['perk', 'regular']), why(['perk', 'mastermind']) === 'reason.needPerk');
  SR.features.perks = false;
  row('difficulty', pass(['difficulty', ['standard', 'relaxed']]), why(['difficulty', ['hardcore']]) === 'reason.difficulty');
  s.items.phone = 1;
  row('phone', pass(['phone']), (s.items.phone = 0, why(['phone']) === 'reason.needPhone'));
  s.world.cityEvent = { id: 'bloodDrive', day: s.clock.day };
  const eventOff = why(['cityEvent', 'bloodDrive']) === 'reason.noEvent';
  SR.features.calendar = true;
  row('cityEvent', eventOff && pass(['cityEvent', 'bloodDrive']), why(['cityEvent', 'heatWave']) === 'reason.noEvent');
  SR.features.calendar = false;
  row('not', pass(['not', ['flag', 'other']]), why(['not', ['flag', 'met']]) === 'reason.unavailable');
  row('any', pass(['any', [['flag', 'other'], ['flag', 'met']]]), why(['any', [['flag', 'other'], ['notFlag', 'met']]]) === 'reason.notYet');
  row('all', pass(['all', [['flag', 'met'], ['notFlag', 'other']]]), why(['all', [['flag', 'met'], ['flag', 'other']]]) === 'reason.notYet');
  SR.def.fn('test.cond', (st, params, ctx, need) => (params.n >= need ? true : { ok: false, reason: 'reason.notNow', vars: { need } }));
  row('fn', pass(['fn', 'test.cond', 2], { params: { n: 2 } }), why(['fn', 'test.cond', 3], { params: { n: 2 } }) === 'reason.notNow' && why(['fn', 'test.missing']) === 'reason.unavailable');

  T.eq(rows.map((r) => r[0]).sort(), C.names.slice().sort(), 'the table covers every registered condition name (' + C.names.length + ')');
  T.eq(rows.filter((r) => !r[1]).map((r) => r[0]), [], 'each condition passes on a state that meets it');
  T.eq(rows.filter((r) => !r[2]).map((r) => r[0]), [], 'and fails on one that does not, with its reason key');
  const keys = ['reason.tooLate', 'reason.needCash', 'reason.fullHp', 'reason.tooHurt', 'reason.needStat', 'reason.statAbove', 'reason.karmaLow',
    'reason.karmaHigh', 'reason.needItems', 'reason.needItem', 'reason.haveItem', 'reason.notYet', 'reason.alreadyDone', 'reason.featureOff',
    'reason.needJob', 'reason.staffOnly', 'reason.needHome', 'reason.notLivingHere', 'reason.notOwned', 'reason.needFurniture', 'reason.noSlots',
    'reason.wrongDay', 'reason.notBefore', 'reason.notAfter', 'reason.weather', 'reason.heatLow', 'reason.heatHigh', 'reason.tooBuzzed',
    'reason.dailyLimit', 'reason.weeklyLimit', 'reason.notNow', 'reason.needPerk', 'reason.difficulty', 'reason.needPhone', 'reason.noEvent',
    'reason.unavailable'];
  T.eq(keys.filter((k) => !SR.text.has(k)), [], 'every reason key a condition returns is in en-prog.js');
}

T.section('effects: weekly, npcStage, time, bank with the lien');
{
  const s = K.newState(SR);
  const fx = (list) => SR.rules.effects.run(s, list, { rng: SR.rng.create(1) });
  fx([['weekly', 'openMic'], ['weekly', 'party', 2], ['daily', 'campaign.rally'], ['record', 'falls', 3]]);
  T.eq([s.weekly.openMic, s.weekly.party, s.daily.campaign.rally, s.records.falls], [1, 2, 1, 3], 'weekly, daily (dotted) and record counters');
  fx([['npcStage', 'harold', 'asked'], ['npcStage', 'newNpc', 'met']]);
  T.eq([s.npc.harold.stage, s.npc.newNpc.stage], ['asked', 'met'], 'npcStage sets a stage (and creates a missing NPC entry)');
  fx([['time', 90]]);
  T.eq(s.clock.min, 570, 'time(min) spends time');
  s.money.lien = 30;
  fx([['bank', 100, 'interest']]);
  T.eq([s.money.bank, s.money.lien], [70, 0], 'bank(n, src): income through the lien (half, never more than owed)');
  fx([['bank', -500]]);
  T.eq(s.money.bank, 0, 'a bank debit never goes below 0');
  fx([['flag', 'x'], ['flag', 'y', 3]]);
  T.eq([s.flags.x, s.flags.y], [true, 3], 'flag(key) is true; flag(key, v) sets v');
}

T.section('a named fn that returns effects.run\'s partial Result: delivered once');
{
  // W1-W's world fns run W1-R effects inside a named fn and return the partial Result; the
  // messages and log entries those effects delivered must not be delivered again by merge.
  SR.def.fn('test.inner', (s, params, ctx) => SR.rules.effects.run(s, [['msg', 'vm.harold.inner', { n: 1 }], ['log', 'promoted', { a: 1 }], ['toast', 'toast.stats.winded']], ctx));
  SR.def.fn('test.returns', () => ({ msgs: [{ key: 'vm.harold.ret', vars: {} }], log: [{ kind: 'fall', vars: {} }] }));
  SR.def.action('testbld.inner', { building: 'testbld', group: 'special', p: 0, effects: [['fn', 'test.inner'], ['fn', 'test.returns']] });
  const s = K.newState(SR);
  const r = run(s, 'testbld.inner');
  T.eq(s.msgs.map((m) => m.key), ['vm.harold.inner', 'vm.harold.ret'], 'each message lands in the inbox exactly once');
  T.eq(s.log.today.map((e) => e.kind), ['promoted', 'fall'], 'each log entry is written exactly once');
  T.eq([r.msgs.length, r.log.length, r.toasts.length], [2, 2, 1], 'and each is reported once in the Result');
  SR.state = K.newState(SR);
  const seen = [];
  const off = SR.events.on('msg:received', (p) => seen.push(p.id));
  SR.act('testbld.inner');
  off();
  T.eq(seen.length, 2, 'msg:received once per delivered message');
  SR.state = null;
}

T.section('previews copy the state lazily');
{
  // A preview clones only the parts of the state its action reads (every card refresh previews
  // every row): a food row never copies the inbox, the history or the markets.
  const s = K.newState(SR);
  for (let i = 0; i < 150; i++) s.msgs.push({ id: i + 1, from: 'x', key: 'vm.x.y', vars: { i }, day: 1, read: false, archived: false });
  for (let i = 0; i < 120; i++) s.history.nw.push([i, i]);
  s.stats.hp = 10;
  const orig = SR.util.clone;
  const cloned = [];
  SR.util.clone = (v) => { if (v === s.msgs || v === s.history || v === s.stocks || v === s.npc || v === s.trade) cloned.push(v); return orig(v); };
  let p;
  try { p = pv(s, 'testbld.fries'); } finally { SR.util.clone = orig; }
  T.eq([p.ok, p.gains.map((g) => g.kind + g.n)], [true, ['hp12']], 'the fries preview is right');
  T.eq(cloned.length, 0, 'and never cloned the inbox, the history, the markets, the NPCs or the trade book');
  const n = pv(s, 'testbld.news');
  T.eq([n.ok, s.msgs.length, s.log.today.length], [true, 150, 0], 'a preview that delivers a message and a log entry leaves the live inbox and log alone');
  SR.def.fn('test.replace', (st) => { st.jail = { daysLeft: 2 }; delete st.pending; st.flags.z = 1; return {}; });
  SR.def.action('testbld.replace', { building: 'testbld', group: 'special', p: 0, effects: [['fn', 'test.replace']] });
  const before = K.json(s);
  T.ok(pv(s, 'testbld.replace').ok, 'a fn that assigns and deletes top-level fields previews');
  T.eq(K.json(s), before, 'without touching the live state');

  // A named condition or cost that draws from ctx.rng sees a neutral stream in a preview.
  SR.def.fn('test.drawCond', (st, params, ctx) => ctx.rng.chance(0.99));
  SR.def.fn('test.drawCost', (st, params, ctx) => 30 * ctx.rng.int(1, 2));
  SR.def.action('testbld.drawy', { building: 'testbld', group: 'special', p: 0, cost: { min: 'test.drawCost' }, requires: [['fn', 'test.drawCond']], effects: [['flag', 'drawn']] });
  const live = K.newState(SR);
  SR.state = live;
  const r0 = K.json(SR.rng.rules.state());
  const d = SR.preview('testbld.drawy');
  T.eq([d.ok, K.json(SR.rng.rules.state())], [true, r0], 'the real rules stream does not move');
  SR.state = null;
}

T.section('boot-time vocabulary check (D28: warns, never throws)');
{
  const warns = [];
  const res = K.L.load({ mode: 'rules', boot: false, console: { log() {}, error() {}, warn: (...a) => warns.push(a.join(' ')) } });
  res.SR.def.action('bad.row', { building: 'bad', group: 'eat', p: 1, requires: [['noSuchCond']], effects: [['noSuchEffect'], ['check', 'x', 'int', 5, [['alsoBad']], []]] });
  res.SR.def.action('bad.repeat', { building: 'bad', group: 'crime', p: 0, repeatable: true, confirm: 'confirm.bad.repeat', effects: [] });
  res.SR.def.action('good.repeat', { building: 'bad', group: 'eat', p: 0, repeatable: true, effects: [['heal', 1]] });
  // D61 (W2-Food 2): a Hustle (`minigame`, the row's own button) does not block repeat; a row whose
  // run opens a minigame (an `open` effect, nested branches too) or opens a sub-screen does.
  res.SR.def.action('good.hustle', { building: 'bad', group: 'work', p: 0, repeatable: true, minigame: { skin: 'orderup', auto: true }, effects: [['heal', 1]] });
  res.SR.def.action('bad.opens', { building: 'bad', group: 'special', p: 0, repeatable: true, effects: [['open', 'darts', {}]] });
  res.SR.def.action('bad.opensNested', { building: 'bad', group: 'special', p: 0, repeatable: true, effects: [['chance', 0.5, [['heal', 1]], [['check', 'x', 'int', 5, [], [['open', 'darts', {}]]]]]] });
  res.SR.def.action('bad.screen', { building: 'bad', group: 'services', p: 0, repeatable: true, screen: 'bad.screen', effects: [] });
  res.SR.boot({ headless: true });
  T.ok(warns.some((w) => /noSuchCond/.test(w)) && warns.some((w) => /noSuchEffect/.test(w)) && warns.some((w) => /alsoBad/.test(w)), 'unknown condition and effect names are warned (nested ones too)');
  T.ok(warns.some((w) => /bad\.row.*no feature/.test(w)), 'a P1 action without a feature flag is warned');
  T.ok(warns.some((w) => /bad\.repeat.*repeatable/.test(w)) && !warns.some((w) => /good\.repeat/.test(w)), 'a repeatable row with a confirm is warned (a plain one is not)');
  T.ok(!warns.some((w) => /good\.hustle/.test(w)), 'D61: a repeatable shift row with a Hustle button (minigame) is not warned');
  T.eq(['bad.opens', 'bad.opensNested', 'bad.screen'].map((id) => warns.some((w) => w.indexOf('"' + id + '" is repeatable') >= 0)), [true, true, true],
    'a repeatable row with an open effect (nested in chance / check too) or a screen is warned');
  T.ok(res.SR.booted, 'and boot completes');
}

T.done();
