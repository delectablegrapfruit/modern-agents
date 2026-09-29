// tests/node/fight.test.cjs — owner: W2-RulesC (W1-C in wave 1). SR.rules.fight (GDD §4.12, §6.3; BALANCE B-13): AP and
// the damage ranges at STR 10 / 100 / 300 / 999, the crit, the ladder's HP and power, the enemy's
// move thresholds and the quirks, the vest and Guard, the Quick-fight Auto (real rolls, the policy),
// the ring's scaling, and the win / lose / run rules on the state by difficulty, through the pipeline.
//   node tests/node/fight.test.cjs
'use strict';
const K = require('./w1c-kit.cjs');

const T = K.L.suite('fight (W2-RulesC)');
const SR = K.boot();
K.fixtures(SR);
const F = SR.rules.fight;
const TF = SR.tuning.fight;

/** A fight against rung n for a player with the given stats and items. */
function fightFor(stats, items, n, extra) {
  const s = K.state(SR, Object.assign({ stats: stats || {}, items: items || {} }, extra || {}));
  return { s, f: F.create(s, 'bar', n || 1, SR.rng.create(3)) };
}

/** Every damage a move can do: each roll value with and without the crit (a scripted stream). */
function damages(f, move) {
  const r = { punch: (f.me.str + 10) / 10, kick: f.me.str / 4.5, fireball: f.me.str / 2.5, inkBeam: f.me.str / 1.5 }[move];
  const m = Math.max(1, Math.floor(r)), out = [];
  for (let v = 0; v < m; v++) {
    [false, true].forEach((crit) => {
      const g = JSON.parse(JSON.stringify(f));
      g.foe.hp = 1e9;
      g.me.ap = 99;
      F.playerMove(g, move, K.scripted(SR, { int: [v], chance: [crit] }));
      out.push(g.log[g.log.length - 1].dmg);
    });
  }
  return [Math.min.apply(null, out), Math.max.apply(null, out)];
}

T.section('AP and the damage ranges at STR 10 / 100 / 300 / 999 (B-13, orig formulas)');
{
  T.eq([10, 100, 300, 999].map((str) => F.ap(K.state(SR, { stats: { str } }))), [1, 6, 15, 15], 'AP = min(floor(STR / 20) + 1, 15) (orig)');
  const ra = K.features(SR, { arcs: true, perks: true });
  const corner = K.state(SR, { stats: { str: 100 }, npc: { harold: { branch: 'barfly' } } });
  T.eq(['bar', 'ring', 'goons'].map((k) => F.create(corner, k, k === 'ring' ? 1 : 3, SR.rng.create(1)).me.apMax), [7, 7, 6],
    'Harold in your corner: +1 AP at the bar and in the ring, not when Red\'s goons jump you (B-26; review probe)');
  corner.perks.owned = ['brawler'];
  T.eq(F.ap(corner, 'goons'), 7, 'Brawler: +1 AP everywhere');
  ra();
  const ranges = [10, 100, 300, 999].map((str) => {
    const { f } = fightFor({ str, cha: 7 });
    return ['punch', 'kick', 'fireball', 'inkBeam'].map((m) => damages(f, m));
  });
  // rand(x) = 0..floor(x) - 1 (orig); punch + 0, kick + 1; minimum 1; the crit ×1.5 (floor) on top.
  const exp = (str) => {
    const mx = (x, add) => Math.max(1, Math.floor(x) - 1 + add);
    return [[1, Math.max(1, Math.floor(mx((str + 10) / 10, 0) * 1.5))], [1, Math.floor(mx(str / 4.5, 1) * 1.5)],
      [1, Math.max(1, Math.floor(mx(str / 2.5, 0) * 1.5))], [1, Math.max(1, Math.floor(mx(str / 1.5, 0) * 1.5))]];
  };
  T.eq(ranges, [10, 100, 300, 999].map(exp), 'punch, kick, fireball, Ink Beam: min 1, max (floor(x) - 1 + add) × 1.5');
  const bare = [10, 100, 300, 999].map((str) => {
    const { f } = fightFor({ str, cha: 7 });
    return ['punch', 'kick', 'fireball', 'inkBeam'].map((m) => F.range(f, m));
  });
  T.eq(bare[3], [{ min: 1, max: Math.floor(99 * 1.5) }, { min: 1, max: Math.floor(222 * 1.5) }, { min: 1, max: Math.floor(398 * 1.5) }, { min: 1, max: Math.floor(665 * 1.5) }],
    'range() matches at STR 999 (the chips of the fight screen)');
  const { f: kn } = fightFor({ str: 100 }, { knife: 1, knuckles: 1 });
  T.eq([damages(kn, 'punch')[0], F.range(kn, 'punch').min, F.range(kn, 'kick').min], [6, 6, 3], 'knife +2 on punch and kick, knuckles +4 on punch');
  const rb = K.features(SR, { nightlife: true });
  const { f: bz } = fightFor({ str: 100, buzz: 5 });
  T.eq(F.range(bz, 'punch').min, 3, 'Buzz adds to the punch, at most +3 (P1 nightlife)');
  rb();
  const { f: nb } = fightFor({ str: 100, buzz: 5 });
  T.eq(F.range(nb, 'punch').min, 1, 'no Buzz bonus while nightlife is off');
}

T.section('the crit (10 %, 15 % at CHA ≥ 300, ×1.5) and Heavy Hitter');
{
  const lo = fightFor({ str: 100, cha: 299 }).f, hi = fightFor({ str: 100, cha: 300 }).f;
  T.eq([lo.me.critP, hi.me.critP], [0.10, 0.15], 'the crit chance');
  const rng = SR.rng.create(8);
  let crits = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const g = F.create(K.state(SR, { stats: { str: 100 } }), 'bar', 12, rng);
    if (F.playerMove(g, 'punch', rng).crit) crits++;
  }
  T.ok(K.near(crits / N, 0.10, 0.01), 'crits happen 10 % of the time (' + (crits / N).toFixed(3) + ')');
  const rp = K.features(SR, { perks: true });
  const hh = fightFor({ str: 100 }, {}, 1, { perks: { owned: ['heavyHitter', 'brawler'] } }).f;
  T.eq([F.range(hh, 'inkBeam').max, hh.me.apMax], [Math.floor(65 * 1.5 * 1.25), 7], 'Heavy Hitter ×1.25; Brawler +1 AP');
  rp();
}

T.section('the ladder and the enemy (B-13, GDD §6.3)');
{
  const s = K.state(SR);
  const ref = { 1: [20, 24, 15], 3: [44, 56, 33], 6: [80, 104, 60], 9: [116, 152, 87], 12: [152, 200, 114] };
  Object.keys(ref).forEach((n) => {
    const lo = F.opponent(s, 'bar', +n, K.scripted(SR, { int: [(a) => a] })), hi = F.opponent(s, 'bar', +n, K.scripted(SR, { int: [(a, b) => b] }));
    T.eq([lo.hp, hi.hp, lo.P], ref[n], 'rung ' + n + ': HP ' + ref[n][0] + '-' + ref[n][1] + ', P ' + ref[n][2] + ' (' + SR.text(lo.name) + ')');
  });
  T.eq(SR.registry.entries('fighter').filter((e) => e.def.ladder).map((e) => e.def.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'twelve regulars in ladder order');
  // The enemy's attack by roll = rand(P) + 1: > 40 Ink Beam, > 20 fireball, > 10 kick, else punch.
  const f = fightFor({ str: 50, hp: 999 }, {}, 12).f;
  f.me.hp = 1e6;
  const moveAt = (roll, g) => { g = g || JSON.parse(JSON.stringify(f)); g.phase = 'enemy'; return F.enemyTurn(g, K.scripted(SR, { int: [roll - 1, 0] })).move; };
  T.eq([41, 40, 21, 20, 11, 10, 1].map((r) => moveAt(r)), ['inkBeam', 'fireball', 'fireball', 'kick', 'kick', 'punch', 'punch'], 'the original thresholds');
  const dmg = (move, v) => { const g = JSON.parse(JSON.stringify(f)); g.phase = 'enemy'; const roll = { inkBeam: 41, fireball: 21, kick: 11, punch: 1 }[move]; return F.enemyTurn(g, K.scripted(SR, { int: [roll - 1, v] })).dmg; };
  T.eq([dmg('inkBeam', 75), dmg('fireball', 44), dmg('kick', 24), dmg('punch', 10), dmg('kick', 0)], [75, 44, 24, 11, 1],
    'damage: rand(P/1.5), rand(P/2.5), rand(P/4.5), rand(P/10) + 1; minimum 1');
  const acc = F.create(K.state(SR), 'bar', 3, SR.rng.create(1));
  T.eq([80, 30, 1].map((r) => moveAt(r, JSON.parse(JSON.stringify(Object.assign(acc, { me: f.me }))))), ['kick', 'kick', 'kick'], 'The Accountant always kicks');
  const prof = Object.assign(F.create(K.state(SR), 'bar', 8, SR.rng.create(1)), { me: JSON.parse(JSON.stringify(f.me)) });
  T.eq([41, 40, 5, 1].map((r) => moveAt(r, JSON.parse(JSON.stringify(prof)))), ['inkBeam', 'fireball', 'fireball', 'fireball'], 'The Professor: the fireball band twice as wide');
  const pete = Object.assign(F.create(K.state(SR), 'bar', 1, SR.rng.create(1)), { me: JSON.parse(JSON.stringify(f.me)) });
  const prng = SR.rng.create(12);
  let miss = 0;
  for (let i = 0; i < 20000; i++) { const g = JSON.parse(JSON.stringify(pete)); g.phase = 'enemy'; if (F.enemyTurn(g, prng).miss) miss++; }
  T.ok(K.near(miss / 20000, 0.30, 0.015), 'Wobbly Pete misses 30 % of his attacks (' + (miss / 20000).toFixed(3) + ')');
  const irma = F.create(K.state(SR, { stats: { str: 100 } }), 'bar', 9, SR.rng.create(1));
  T.eq(F.range(irma, 'inkBeam').max, Math.floor(65 * 1.5 * 0.7), 'Iron Irma takes 30 % less');
  // The quirks' sizes live in SR.tuning.fight.quirks (docs/requests/W1-C.md 7); the data names the id.
  T.eq([1, 3, 8, 9].map((n) => F.opponent(K.state(SR), 'bar', n, SR.rng.create(1)).quirk),
    [{ miss: 0.30, id: 'wobbly' }, { id: 'kicker', always: 'kick' }, { fireballOdds: 2, id: 'pyro' }, { armor: 0.30, id: 'iron' }], 'each quirk with its size from tuning');
  const Q = SR.tuning.fight.quirks.iron;
  Q.armor = 0.5;
  const irma2 = F.create(K.state(SR, { stats: { str: 100 } }), 'bar', 9, SR.rng.create(1));
  Q.armor = 0.30;
  T.eq(F.range(irma2, 'inkBeam').max, Math.floor(65 * 1.5 * 0.5), 'a tuning change reaches the fight (tuning.fight.quirks.iron.armor)');
  T.ok(SR.registry.entries('fighter').every((e) => !e.def.quirk || ['miss', 'fireballOdds', 'armor'].every((k) => !(k in e.def.quirk))), 'fighters.js holds no quirk sizes');
}

T.section('the vest and Guard (P1)');
{
  const f = fightFor({ str: 100 }, { vest: 1 }, 12).f;
  f.me.hp = 1e6;
  const hitWith = (g) => { g.phase = 'enemy'; return F.enemyTurn(g, K.scripted(SR, { int: [40, 99] })).dmg; };
  T.eq(hitWith(JSON.parse(JSON.stringify(f))), Math.floor(99 * 0.7), 'the vest takes 30 % off');
  T.eq(F.playerMove(JSON.parse(JSON.stringify(f)), 'guard').ok, false, 'Guard needs nightlife');
  const rn = K.features(SR, { nightlife: true });
  const g = fightFor({ str: 100 }, {}, 12).f;
  g.me.hp = 1e6;
  const one = JSON.parse(JSON.stringify(g));
  F.playerMove(one, 'guard');
  const two = JSON.parse(JSON.stringify(one));
  F.playerMove(two, 'guard');
  T.eq([hitWith(JSON.parse(JSON.stringify(g))), hitWith(one), hitWith(two)], [99, Math.floor(99 * 0.5), Math.floor(99 * 0.25)], 'Guard: the next hit -50 %, two guards -75 %');
  T.eq([one.me.ap, one.me.guard], [g.me.apMax, 0], 'a new turn: full AP, guards spent');
  rn();
}

T.section('Quick fight: the Auto policy with real rolls (ARCHITECTURE §10)');
{
  const s = K.state(SR, null, { stats: { str: 100, int: 7, cha: 7 } });   // HP 115: about 60 % against rung 12
  const outcomes = new Set(), hp = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const r = F.autoPlay(s, F.create(s, 'bar', 12, SR.rng.create(seed)), SR.rng.create(seed));
    outcomes.add(r.outcome);
    hp.add(r.hpLeft);
  }
  T.ok(outcomes.has('win') && outcomes.has('lose') && hp.size > 10, 'a sample, not the expected value: it wins and loses with varying HP (' + [...outcomes].join(', ') + ')');
  const a = F.autoPlay(s, F.create(s, 'bar', 12, SR.rng.create(4)), SR.rng.create(99));
  const b = F.autoPlay(s, F.create(s, 'bar', 12, SR.rng.create(4)), SR.rng.create(99));
  T.eq(a, b, 'the same seed replays the same fight');
  const c = K.counting(SR.rng.create(5));
  const cf = F.create(s, 'bar', 6, SR.rng.create(5));
  F.autoPlay(s, cf, c);
  const attacks = cf.log.filter((e) => e.who === 'me').length, enemy = cf.log.filter((e) => e.who === 'foe').length;
  T.eq(c.draws, attacks * 2 + enemy * 2, 'real draws: two per attack (roll, crit), two per enemy attack');
  T.ok(cf.log.every((e) => e.who !== 'me' || e.move !== 'guard'), 'never Guard');
  const pol = F.create(K.state(SR, { stats: { str: 300 } }), 'bar', 12, SR.rng.create(1));
  const per = ['punch', 'kick', 'fireball', 'inkBeam'].map((m) => F.expected(pol, m) / TF.moves[m].ap);
  T.eq(F.autoMove(pol), ['punch', 'kick', 'fireball', 'inkBeam'][per.indexOf(Math.max.apply(null, per))], 'the move with the best expected damage per AP');
  pol.me.ap = 3;
  T.ok(['punch', 'kick', 'fireball'].indexOf(F.autoMove(pol)) >= 0, 'only affordable moves');
  pol.me.ap = 0;
  T.eq(F.autoMove(pol), null, 'no AP left: end the turn');
  const tie = F.create(K.state(SR, { stats: { str: 7 } }), 'bar', 1, SR.rng.create(1));
  T.eq(F.autoMove(tie), 'punch', 'ties go to the cheaper move');
}

T.section('the Underground Ring scales with you (P1; B-13 ring)');
{
  [[100, 1], [300, 2], [999, 5]].forEach(([str, k]) => {
    const o = F.opponent(K.state(SR, { stats: { str } }), 'ring', k);
    T.eq([o.P, o.hp], [Math.floor(120 + 0.8 * str + 20 * k), Math.floor(150 + 1.1 * str + 30 * k)], 'STR ' + str + ', bout ' + k + ': P and HP');
  });
  const s = K.state(SR, { clock: { day: 6 }, fight: { champion: true } });
  T.eq(F.canStart(s, 'ring').reason, 'reason.featureOff', 'the ring is P1 (nightlife)');
  const rn = K.features(SR, { nightlife: true });
  T.ok(F.canStart(s, 'ring').ok, 'Saturday, champion: a bout');
  s.clock.day = 5;
  T.eq(F.canStart(s, 'ring').reason, 'reason.wrongDay', 'Saturdays only');
  s.clock.day = 6;
  const st = F.start(s, 'ring', K.ctx(SR, 1, { id: 'bar.ring' }));
  T.eq([st.open.params.k, s.fight.ringBouts, F.canStart(s, 'ring').reason, st.open.params.fight.foe.P], [1, 1, 'reason.dailyLimit', Math.floor(120 + 0.8 * 7 + 20)],
    'bout 1 starts; one a day');
  const cash = s.money.cash;
  const fr = F.finish(s, { kind: 'ring', k: 1, outcome: 'win', hpLeft: 10 }, null, K.ctx(SR, 1));
  T.eq([s.money.cash - cash, s.records.ringWins, fr.log[0].kind], [750, 1, 'ringWin'], 'purse 500 + 250k');
  rn();
}

T.section('win, lose and run on the state (B-13)');
{
  const s = K.state(SR, { stats: { str: 50, hp: 60 }, money: { cash: 1000 } });
  const r = F.finish(s, { kind: 'bar', n: 4, outcome: 'win', hpLeft: 30 }, 'wallet', { rng: K.scripted(SR, { int: [(a, b) => b] }) });
  T.eq([s.stats.str, s.stats.hpMax, s.stats.hp, s.fight.won, s.records.fightsWon, s.money.cash, s.stats.karma],
    [53, 68, 30, 1, 1, 1000 + 10 + 60 + 40, -3], 'a win: +3 STR (HP max with it), the wallet 10 + 15n + rand(0..10n) at -3 karma');
  T.eq([r.events[0].payload, r.log[0].kind], [{ kind: 'bar', n: 4, outcome: 'win' }, 'fightWin'], 'the fight event and the log');
  const d = K.state(SR, { stats: { cha: 10 }, money: { cash: 100 } });
  F.finish(d, { kind: 'bar', n: 1, outcome: 'win', hpLeft: 5 }, 'drink', K.ctx(SR));
  T.eq(d.stats.karma, -3, 'Buy him a drink is P1: the wallet is taken while nightlife is off');
  const rn = K.features(SR, { nightlife: true });
  const d2 = K.state(SR, { stats: { cha: 10 }, money: { cash: 100 } });
  F.finish(d2, { kind: 'bar', n: 1, outcome: 'win', hpLeft: 5 }, 'drink', K.ctx(SR));
  T.eq([d2.money.cash, d2.stats.cha, d2.stats.karma], [95, 11, 1], 'Buy him a drink (P1): -$5, +1 CHA, +1 karma');
  const ch = K.state(SR, { fight: { won: 11 }, money: { cash: 0 } });
  const rc = F.finish(ch, { kind: 'bar', n: 12, outcome: 'win', hpLeft: 5 }, 'wallet', { rng: K.scripted(SR, { int: [0] }) });
  T.eq([ch.fight.champion, ch.money.cash, rc.stamps[0].key], [true, 10 + 180 + 1000, 'stamp.fight.champion'], 'beating #12: Champion of Sticky\'s, $1,000 (P1)');
  const nx = [];
  for (let seed = 1; seed <= 200; seed++) nx.push(F.nextN(ch, SR.rng.create(seed)));
  T.ok(Math.min.apply(null, nx) === 8 && Math.max.apply(null, nx) === 12, 'after the champion: a random regular of 8-12');
  rn();
  T.eq([0, 5, 11, 20].map((won) => F.nextN(K.state(SR, { fight: { won } }), SR.rng.create(1))), [1, 6, 12, 12], 'the ladder: fights won + 1, capped at 12 (orig)');

  const std = K.state(SR, { stats: { hp: 40 }, money: { cash: 555 } });
  const rl = F.finish(std, { kind: 'bar', n: 3, outcome: 'lose', hpLeft: 0 }, null, K.ctx(SR));
  T.eq([std.stats.hp, std.money.cash, rl.toasts.map((t) => t.key)], [1, 500, ['toast.fight.tab', 'toast.fight.lose']], 'Standard: HP 1, 10 % of your cash on the tab');
  const rel = K.state(SR, { stats: { hp: 40 }, money: { cash: 555 } }, { difficulty: 'relaxed' });
  F.finish(rel, { kind: 'bar', n: 3, outcome: 'lose', hpLeft: 0 }, null, K.ctx(SR));
  T.eq([rel.stats.hp, rel.money.cash], [1, 555], 'Relaxed: HP 1, no cash lost');
  const run = K.state(SR, { stats: { hp: 40 } });
  F.finish(run, { kind: 'bar', n: 3, outcome: 'run', hpLeft: 25 }, null, K.ctx(SR));
  T.eq([run.stats.hp, run.fight.won, run.stats.karma], [25, 0, 0], 'Run away: no further cost (orig)');
}

T.section('through the action pipeline (start, resolve, Hardcore)');
{
  const s = K.state(SR, { clock: { min: 600 }, stats: { str: 60, hp: 75 } });
  const st = K.act(SR, s, 'barFight', {}, 4);
  T.eq([st.ok, st.open.minigame, st.open.resolve, st.open.params.n, st.open.params.stake, s.clock.min, s.stats.karma, s.stats.heat],
    [true, 'fight', 'testc.barFight:resolve', 1, true, 780, -2, 5], 'the start: 3 h (the action\'s cost), -2 karma (orig), +5 Heat, the fight opens');
  const auto = F.autoPlay(s, st.open.params.fight, SR.rng.create(7));
  const rv = K.act(SR, s, 'barFight:resolve', auto, 5);
  T.eq([rv.ok, rv.events[0].name, rv.events[0].payload.outcome, s.fight.open], [true, 'fight', auto.outcome, null], 'the resolve applies the Auto result');
  const hc = K.state(SR, { clock: { min: 600 }, stats: { hp: 40 } }, { difficulty: 'hardcore' });
  K.act(SR, hc, 'barFight', {}, 4);
  const lose = K.act(SR, hc, 'barFight:resolve', { outcome: 'lose', hpLeft: 0 }, 5);
  T.eq([lose.down && lose.down.outcome, lose.down && lose.down.cause, hc.over, lose.over], ['death', 'fight', true, { reason: 'death' }],
    'Hardcore: a loss is HP 0 → health.down → death (orig)');
  const st2 = K.state(SR, { clock: { min: 600 }, stats: { hp: 40 } });
  K.act(SR, st2, 'barFight', {}, 4);
  const l2 = K.act(SR, st2, 'barFight:resolve', { outcome: 'lose', hpLeft: 0 }, 5);
  T.eq([l2.down, st2.stats.hp, st2.clock.day], [null, 1, 1], 'Standard: never Stick General (HP 1)');
  const late = K.state(SR, { clock: { min: 1290 } });
  T.eq(K.act(SR, late, 'barFight').reason, 'reason.tooLate', 'a bar fight must end by 24:00 (the wall)');

  // Review probes: only today's open fight can be resolved, once; its identity wins over the echo.
  const none = K.state(SR, { money: { cash: 100 } });
  const nr = K.act(SR, none, 'barFight:resolve', { outcome: 'win', hpLeft: 20, n: 12 }, 5);
  T.eq([nr.reason, none.money.cash, none.stats.str, none.fight.won], ['reason.notNow', 100, 7, 0],
    'no fight open: a resolve pays no wallet and no STR');
  const once = K.state(SR, { clock: { min: 600 }, stats: { hp: 40 }, money: { cash: 0 } });
  K.act(SR, once, 'barFight', {}, 4);
  const w1 = K.act(SR, once, 'barFight:resolve', { outcome: 'win', hpLeft: 30, n: 12, kind: 'ring', k: 9 }, 5);
  const cash1 = once.money.cash;
  T.eq([w1.ok, w1.events[0].payload, cash1 >= 25 && cash1 <= 35], [true, { kind: 'bar', n: 1, outcome: 'win' }, true],
    'the open fight (bar, rung 1) is paid, whatever rung or kind the result echoes');
  T.eq([K.act(SR, once, 'barFight:resolve', { outcome: 'win', hpLeft: 30 }, 6).reason, once.money.cash, once.fight.won], ['reason.notNow', cash1, 1],
    'a repeated resolve is refused');
  const stale = K.state(SR, { clock: { min: 600 }, stats: { hp: 40 } });
  K.act(SR, stale, 'barFight', {}, 4);
  stale.clock.day += 1;
  T.eq(K.act(SR, stale, 'barFight:resolve', { outcome: 'win', hpLeft: 30 }, 5).reason, 'reason.notNow', 'a fight opened on an earlier day is not resolved later');
  const goon = K.state(SR, { stats: { hp: 40 }, money: { cash: 100 } });
  const gl = F.finish(goon, { kind: 'goons', n: 6, outcome: 'lose', hpLeft: 0 }, null, K.ctx(SR));
  const gw = F.finish(K.state(SR), { kind: 'goons', n: 6, outcome: 'win', hpLeft: 5 }, null, K.ctx(SR));
  T.eq([gl.toasts.map((t) => t.key), gw.toasts.map((t) => t.key)], [['toast.fight.tab', 'toast.fight.goonsLose'], ['toast.fight.goons']],
    'Red\'s goons: their own lose line (not Sticky\'s bouncer), and one line per goon beaten');
  const hcl = F.finish(K.state(SR, { stats: { hp: 40 } }, { difficulty: 'hardcore' }), { kind: 'bar', n: 1, outcome: 'lose', hpLeft: 0 }, null, K.ctx(SR));
  T.eq(hcl.toasts, [], 'Hardcore: no bouncer toast on the way to FLATLINED');
}

T.done();
