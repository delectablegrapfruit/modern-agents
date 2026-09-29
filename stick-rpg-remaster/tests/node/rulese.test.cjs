// tests/node/rulese.test.cjs — owner: W2-RulesE. The wave-2 additions of the kernel and economy
// desk (docs/requests/decisions-w2-W2-RulesE.md): the `furniture` condition in use only, the TV
// channel condition, purchases within the B-06 stacks (items.room, items.buy, the takeout stack),
// the pill toggle, the tip reveal by source, training limits left, Retire and Keep playing, the
// new-game roll; and GDD §6.1 P0 rows checked through the pipeline with test rows shaped like the
// wave-2 building data (the real building files are other packages').
//   node tests/node/rulese.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('rulese (W2-RulesE)');
const SR = H.boot();
const A = SR.rules.act;

/** Registers a test row under the owner 'testw2e' (never a real building). */
function row(id, def) {
  SR.def.action('testw2e.' + id, Object.assign({ building: 'testw2e', p: 0, label: 'act.testw2e.' + id }, def));
  return 'testw2e.' + id;
}
function run(s, id, params, seed) { return A.run(s, id, params || {}, H.ctx(SR, seed)); }
function preview(s, id, params) { return A.preview(s, id, params || {}, { source: 'ui' }); }

// Rows shaped as the wave-2 data will write them (GDD §6.1, B-03, B-06, B-28a).
const SMOKES = row('smokes', { group: 'buy', cost: { cash: 10 }, priceTarget: 'item.store.smokes', effects: [['fn', 'items.buy', 'smokes', 1, 'store']], repeatable: true });
const AMMO = row('ammo', { group: 'buy', cost: { cash: 10 }, priceTarget: 'item.pawn.ammo', effects: [['fn', 'items.buy', 'ammo', 5, 'pawn']] });
const KNIFE = row('knife', { group: 'buy', cost: { cash: 100 }, priceTarget: 'item.pawn.knife', requires: [['fn', 'items.room', 'knife']], effects: [['fn', 'items.buy', 'knife']] });
const GRAMS = row('grams', { group: 'buy', effects: [['fn', 'items.buy', 'snow']] });
const TAKEOUT = row('takeout', { group: 'buy', effects: [['item', 'takeout', 1, 'fries']] });
const NEWS = row('tvNews', { group: 'train', cost: { min: 60 }, requires: [['fn', 'homes.channel', 'news'], ['fn', 'training.can', 'tvNews']],
  effects: [['fn', 'training.apply', 'tvNews'], ['fn', 'stocks.maybeReveal', 'tv']], repeatable: true });
const FIT = row('tvFitness', { group: 'train', cost: { min: 60 }, requires: [['fn', 'homes.channel', 'fitness'], ['fn', 'training.can', 'tvFitness']],
  effects: [['fn', 'training.apply', 'tvFitness']], repeatable: true });
const STOCKS = row('computer', { group: 'services', requires: [['furniture', 'pc']], screen: 'home.stocks' });
const PILLS = row('pills', { group: 'special', timeRule: 'free', effects: [['fn', 'items.pillToggle']] });
const RETIRE = row('retire', { group: 'special', timeRule: 'free', effects: [['fn', 'endgame.retire']] });
const SLEEP = row('sleep', { group: 'services', timeRule: 'free', effects: [['fn', 'testw2e.sleep']] });
SR.def.fn('testw2e.sleep', (s, params, ctx) => (ctx.preview ? {} : { report: SR.rules.night.run(s, ctx, { kind: 'sleep' }) }));
const STUDY = row('study', { group: 'train', cost: { min: 'training.studyMin' }, effects: [['fn', 'training.apply', 'study']], repeatable: true });
const CLASS = row('classBiz', { group: 'train', cost: { cash: 20, min: 120 }, priceTarget: 'class.biz', effects: [['fn', 'training.apply', 'classBiz']], repeatable: true });
const GYM = row('gym', { group: 'train', cost: { min: 120, hp: 4 }, requires: [['hpAbove', 4]], effects: [['fn', 'training.apply', 'gym']], repeatable: true });
const BEER = row('beer', { group: 'train', cost: { cash: 20, min: 60 }, priceTarget: 'item.bar.beer', requires: [['buzzBelow', 5]],
  effects: [['fn', 'training.apply', 'beer'], ['buzz', 1]], repeatable: true });
const BOTTLE = row('bottle', { group: 'buy', cost: { cash: 30 }, priceTarget: 'item.bar.booze', effects: [['fn', 'items.buy', 'booze', 1, 'bar']], repeatable: true });
const FRIES = row('fries', { group: 'eat', cost: { cash: 12, min: 30 }, priceTarget: 'food.mcsticks.fries', requires: [['hpBelowMax']],
  effects: [['heal', 20], ['emit', 'eat', { item: 'fries', hp: 20, where: 'mcsticks' }]], repeatable: true });
const NACHOS = row('nachos', { group: 'eat', cost: { cash: 4, min: 30 }, priceTarget: 'food.store.nachos', requires: [['hpBelowMax']], effects: [['heal', 7]], repeatable: true });
const SMOKE = row('smoke', { group: 'special', cost: { min: 60, hp: 10, items: { smokes: 1 } }, requires: [['hpAbove', 10]],
  effects: [['fn', 'training.apply', 'smoke'], ['karma', -1]], repeatable: true });
const WORK = row('work', { group: 'work', cost: { min: 'shift.min' }, requires: [['fn', 'jobs.canWork', 'mcsticks']], effects: [['fn', 'jobs.work', 'mcsticks']] });

T.section('the furniture condition: pieces in use only (GDD §4.15)');
{
  const C = SR.rules.conditions;
  const s = H.state(SR, { furniture: { owned: { pc: 1, tv: 1, satellite: 1 } } });
  T.ok(C.eval(s, ['furniture', 'pc']).ok, 'a piece in use in the home you live in');
  T.eq(C.eval(s, ['furniture', 'books']).reason, 'reason.needFurniture', 'a piece you do not own');
  T.ok(C.eval(s, ['furniture', 'satellite']).ok, 'the P0 satellite with the TV in use');
  s.furniture.storage = ['tv'];
  const r = C.eval(s, ['furniture', 'tv']);
  T.eq([r.ok, r.reason, r.vars.furn], [false, 'reason.inStorage', 'Flatland 60 TV'], 'a stored piece does nothing: "… is in storage"');
  T.eq(C.eval(s, ['furniture', 'satellite']).ok, false, 'the satellite needs the TV in use, not in storage');
  const u = H.state(SR, { furniture: { owned: { tv: 2 } } });
  T.ok(C.eval(u, ['furniture', 'skydish']).ok && C.eval(u, ['furniture', 'tv', 2]).ok, 'a tier-2 id asks for its base at tier 2');
  T.eq(C.eval(s, ['furniture', 'skydish']).reason, 'reason.needFurniture', 'a tier-1 TV is no SkyDish');
  T.eq(preview(H.state(SR, { furniture: { owned: { pc: 1 }, storage: ['pc'] } }), STOCKS).reason, 'reason.inStorage', 'Computer (P0): the stored PC disables the Stocks row');
  T.ok(preview(H.state(SR, { furniture: { owned: { pc: 1 } } }), STOCKS).ok, 'Computer (P0): with the PC in use');
}

T.section('TV channels (GDD §6.1 Watch TV, B-03)');
{
  const bare = H.state(SR);
  T.eq([preview(bare, NEWS).reason, preview(bare, NEWS).vars.furn], ['reason.needFurniture', 'Flatland 60 TV'], 'News needs the TV');
  const tv = H.state(SR, { furniture: { owned: { tv: 1 } } });
  T.ok(preview(tv, NEWS).ok, 'News with the TV');
  T.eq([preview(tv, FIT).reason, preview(tv, FIT).vars.furn], ['reason.needFurniture', 'SkyDish Satellite'], 'Fitness needs the satellite');
  const sat = H.state(SR, { furniture: { owned: { tv: 1, satellite: 1 } } });
  T.ok(preview(sat, FIT).ok, 'Fitness with the P0 satellite');
  const r = run(sat, FIT);
  T.eq([r.ok, sat.stats.str, sat.clock.min, sat.daily.tv.tvFitness], [true, 9, 540, 1], '+2 STR, 1 h, one view counted');
  run(sat, FIT);
  T.eq(preview(sat, FIT).reason, 'reason.dailyLimit', '2 views a day per channel');
  T.eq([SR.rules.training.left(sat, 'tvFitness'), SR.rules.training.left(sat, 'tvNews'), SR.rules.training.left(sat, 'study')], [0, 2, null], 'views left today (null: no limit)');
  T.eq(SR.reg.fn['homes.channel'](sat, {}, {}, 'market').reason, 'reason.featureOff', 'Market Watch is P1 (stockTips)');
  T.eq(SR.reg.fn['homes.channel'](sat, {}, {}, 'cartoons').reason, 'reason.unavailable', 'an unknown channel');
  const undo = H.features(SR, { homesPlus: true, stockTips: true });
  const up = H.state(SR, { furniture: { owned: { tv: 2 } } });
  T.ok(['news', 'fitness', 'dating', 'market'].every((c) => SR.reg.fn['homes.channel'](up, {}, {}, c).ok), 'the SkyDish tier shows all four (P1)');
  T.eq(SR.reg.fn['homes.channel'](tv, {}, {}, 'fitness').vars.furn, 'SkyDish Satellite', 'in P1 the missing piece is the SkyDish');
  T.ok(SR.reg.fn['homes.channel'](sat, {}, {}, 'dating').ok, 'an owned P0 satellite keeps working in P1');
  undo();
}

T.section('purchases within the B-06 stacks (items.room, items.buy)');
{
  const s = H.state(SR, { money: { cash: 5000 }, items: { smokes: 98, ammo: 90 } });
  let r = run(s, SMOKES);
  T.eq([r.ok, s.items.smokes, s.money.cash], [true, 99, 4990], 'a pack of smokes: $10, into the Bag');
  T.eq(r.events.filter((e) => e.name === 'buy').map((e) => e.payload), [{ item: 'smokes', n: 1, where: 'store', price: 10 }], 'the `buy` rule event with the price paid');
  const p = preview(s, SMOKES);
  T.eq([p.ok, p.reason, p.vars.max], [false, 'reason.stackFull', 99], 'smokes max 99 (orig): refused, nothing charged');
  r = run(s, SMOKES);
  T.eq([r.ok, s.items.smokes, s.money.cash], [false, 99, 4990], '… and the run refuses too');
  r = run(s, AMMO);
  T.eq([r.ok, s.items.ammo], [true, 95], 'ammo 5 for $10');
  T.eq(preview(s, AMMO).reason, 'reason.stackFull', 'ammo refused at ≥ 95 (orig)');
  s.items.ammo = 94;
  T.ok(preview(s, AMMO).ok, '… and sold at 94');
  r = run(s, KNIFE);
  T.eq([r.ok, s.items.knife, preview(s, KNIFE).reason, preview(s, KNIFE).vars.item], [true, 1, 'reason.haveItem', 'Knife'], 'gear of stack 1: "Already have Knife"');
  r = run(s, GRAMS, { n: 7 });
  T.eq([r.ok, s.items.snow, r.events[0].payload.n], [true, 7, 7], 'a NumberField purchase passes params.n');
  T.eq(preview(s, GRAMS, { n: 93 }).reason, 'reason.stackFull', 'product max 99 held (orig)');
  T.eq([preview(s, GRAMS, { n: 0 }).reason, preview(s, GRAMS, { n: -3 }).reason, s.items.snow], ['reason.amount', 'reason.amount', 7], 'a purchase of 0 or fewer is refused (never a removal)');
  const t = H.state(SR, { items: { takeout: ['fries', 'fries', 'fries', 'fries'] } });
  const tp = preview(t, TAKEOUT);
  T.ok(tp.ok && tp.gains.some((g) => g.kind === 'item' && g.key === 'takeout' && !g.capped), 'the 5th takeout fits');
  run(t, TAKEOUT);
  T.eq(t.items.takeout.length, 5, 'takeout in the Bag');
  T.ok(preview(t, TAKEOUT).gains.every((g) => g.kind !== 'item') && run(t, TAKEOUT).ok && t.items.takeout.length === 5, 'a list item stops at its stack (takeout 5)');
  T.eq([SR.rules.effects.room(t, 'takeout'), SR.rules.effects.room(t, 'scraps'), SR.rules.effects.room(H.state(SR), 'gun')], [0, Infinity, 1], 'room left by item');
}

T.section('the pill toggle (GDD §6.4) and the night');
{
  const s = H.state(SR, { items: { pills: 2 }, clock: { min: 1320 } });
  run(s, PILLS);
  T.eq(s.clock.pillAuto, false, 'the toggle turns auto-use off');
  let rep = run(s, SLEEP).report;
  T.eq([s.items.pills, s.clock.min, rep.lines.some((l) => l.key === 'report.pillUsed')], [2, 480, false], 'with the toggle off the night uses no pill (wake 08:00)');
  run(s, PILLS);
  s.clock.min = 1320;
  rep = run(s, SLEEP).report;
  T.eq([s.clock.pillAuto, s.items.pills, s.clock.min], [true, 1, 240], 'back on: one pill used, wake 04:00');
  T.eq(A.run(s, PILLS, { on: false }, H.ctx(SR)).ok && s.clock.pillAuto, false, 'params.on sets it');
}

T.section('the tip by source (B-10 tip.sources; P1 stockTips)');
{
  const s = H.state(SR, { furniture: { owned: { tv: 1 } } });
  const c0 = H.ctx(SR, 9);
  const before = c0.rng.state();
  A.run(s, NEWS, {}, c0);
  T.eq(c0.rng.state(), before, 'P0: TV News draws nothing for the tip (the flag is off)');
  const undo = H.features(SR, { stockTips: true });
  let seen = 0;
  for (let i = 0; i < 2000; i++) {
    const t = H.state(SR, { furniture: { owned: { tv: 1 } } });
    SR.rules.stocks.drawTip(t, SR.rng.create(i));
    const r = A.run(t, NEWS, {}, H.ctx(SR, 1000 + i));
    if (SR.rules.stocks.revealed(t)) {
      seen++;
      if (seen === 1) T.eq([r.toasts[0].key, t.tip.revealed.tv], ['toast.stocks.tip', true], 'a revealing viewing says so in a toast');
    }
  }
  T.ok(Math.abs(seen / 2000 - 0.6) < 0.04, 'TV News reveals the tip on about 60 % of viewings', seen / 2000);
  const k = H.state(SR);
  SR.rules.stocks.drawTip(k, SR.rng.create(3));
  SR.rules.stocks.reveal(k, 'paper');
  const c1 = H.ctx(SR, 4), st1 = c1.rng.state();
  SR.reg.fn['stocks.maybeReveal'](k, {}, c1, 'tv');
  T.eq(c1.rng.state(), st1, 'no draw once the tip is known');
  const m = H.state(SR);
  SR.rules.stocks.drawTip(m, SR.rng.create(5));
  T.eq([SR.rules.stocks.revealChance(m, 'mingle'), SR.rules.stocks.revealChance(m, 'paper'), SR.rules.stocks.revealChance(m, 'market')], [0.3, 1, 1], 'Mingle 30 %, the paper and Market Watch always');
  const u2 = H.features(SR, { perks: true });
  m.perks.owned.push('regular');
  T.eq(SR.rules.stocks.revealChance(m, 'mingle'), 1, 'Regular: Mingle always gives the tip');
  u2();
  undo();
}

T.section('Retire and Keep playing (GDD §4.19, §5)');
{
  const timed = H.state(SR, {}, { length: 40 });
  T.eq(run(timed, RETIRE).reason, 'reason.timedGame', 'Retire is for Unlimited games');
  const u = H.state(SR, {}, { length: 0 });
  const r = run(u, RETIRE);
  T.eq([r.ok, r.over, u.over, u.result.reason, u.result.ranked], [true, { reason: 'retire' }, true, 'retire', true], 'Unlimited: Retire ends the game with its results');
  T.eq(run(u, RETIRE).reason, 'reason.gameOver', 'once');
  const g = H.state(SR, { clock: { day: 40, min: 1320 } }, { length: 40 });
  const night = run(g, SLEEP);
  T.eq([night.over, g.over, g.result.reason, g.result.ranked], [{ reason: 'time' }, true, 'time', true], 'a timed game ends after its last night');
  T.eq(SR.rules.endgame.keepPlaying(H.state(SR)).reason, 'reason.notOver', 'Keep playing needs an ended game');
  T.ok(SR.rules.endgame.keepPlaying(g).ok && !g.over && g.mode.keepPlaying, 'Keep playing continues it');
  T.eq(g.result.reason, 'time', 'the original end\'s results stay for the Hall of Fame');
  run(g, SLEEP);
  T.eq([g.clock.day, g.over], [42, false], 'no last day any more');
  const r2 = run(g, RETIRE);
  T.eq([r2.ok, g.result.reason, g.result.ranked], [true, 'retire', false], 'a Keep-playing run retires unranked');
  const d = H.state(SR, { mode: { difficulty: 'hardcore' } });
  SR.rules.health.down(d, 'fall', H.ctx(SR));
  T.eq(SR.rules.endgame.keepPlaying(d).reason, 'reason.gameOver', 'no Keep playing after death');
}

T.section('requests: W2-Food 3 (an Auto hustle result is Auto)');
{
  const undo = H.features(SR, { hustles: true, weather: true });
  const pay = (params) => {
    const s = H.state(SR, { world: { weather: 'rain' } });
    A.run(s, WORK, params, H.ctx(SR, 1));
    return s.money.cash - 100;
  };
  T.eq([pay({ m: 1, hustle: { m: 1, auto: true } }), pay({ m: 1, auto: true }), pay({ m: 1, hustle: { m: 1, hits: 9 } }), pay({})],
    [42, 42, 50, 42], 'in the rain: the card\'s Auto result pays exactly 1.0 ($42); a played Order Up gets the tips (×1.2: $50)');
  undo();
}

T.section('requests: W2-Money 3 and 4 (every missing requirement; the lien in the voicemail)');
{
  const s = H.state(SR, { stats: { int: 50, cha: 3 }, job: { ranks: { nli: 'mail' }, shiftsAtRank: { nli: 0 } } });
  const P = row('promoteNli', { group: 'work', requires: [['fn', 'jobs.canPromote', 'nli']], effects: [['fn', 'jobs.promote', 'nli']] });
  const p = preview(s, P);
  T.eq([p.reason, SR.text(p.reason, p.vars)], ['reason.needAll', 'Need INT 75 (you: 50) · CHA 25 (you: 3) · 3 shifts (you: 0)'], 'the promotion row names every missing requirement');
  // A rank the ladder does not know (a hand-edited save) is not "promoted" back to the first rung.
  const odd = H.state(SR, { stats: { int: 300, cha: 300 }, job: { ranks: { nli: 'mailroom' }, shiftsAtRank: { nli: 9 } } });
  T.eq([SR.rules.jobs.promotion(odd, 'nli').next, preview(odd, P).reason], [null, 'reason.topRank'], 'an unknown rank has no next rung');
  T.eq([SR.rules.jobs.canWork(odd, 'nli').reason, SR.rules.jobs.bestTitle(odd)], ['reason.notHired', 'cook'], '… works no $0 shift and is no title (the results do not throw)');
  const d = H.state(SR, { money: { cash: 0, bank: 0, loan: { amount: 900, daysLeft: 1 } }, clock: { day: 3 } });
  SR.rules.night.run(d, H.ctx(SR, 1), { kind: 'sleep' });
  const vm = d.msgs.find((m) => m.key === 'vm.penny.default');
  T.ok(vm && vm.vars.lien > 0 && vm.vars.lienMoney === SR.text.money(vm.vars.lien), "Penny's default voicemail carries the lien formatted (lienMoney)", vm && vm.vars);
}

T.section('requests: W2-Pocket 5 (records.meals)');
{
  const s = H.state(SR, { stats: { hp: 5 } });
  T.eq(s.records.meals, 0, 'a new game has eaten nothing');
  const p = preview(s, FRIES);
  T.eq([p.ok, s.records.meals], [true, 0], 'a preview counts nothing');
  run(s, FRIES);
  run(s, NACHOS);
  T.eq(s.records.meals, 1, 'one `eat` event, one meal (a row without the event counts nothing)');
  const t2 = H.state(SR, { stats: { hp: 5 } });
  run(t2, row('twoEvents', { group: 'eat', effects: [['emit', 'eat', { item: 'a', hp: 1, where: 'x' }], ['emit', 'eat', { item: 'b', hp: 1, where: 'x' }]] }));
  T.eq(t2.records.meals, 2, 'each `eat` event of a Result counts');
  const old = JSON.parse(JSON.stringify(H.state(SR)));
  delete old.records.meals;
  SR.util.deepFill(old, SR.rules.state.defaults());
  T.eq(old.records.meals, 0, 'an older save is deep-filled with 0');
}

T.section('requests: W2-Night 5 (the table chips as tuning)');
{
  T.eq(SR.tuning.casino.chips, [5, 25, 100, 500], 'tuning.casino.chips: $5 / $25 / $100 (+$500) (GDD §2.1, §6.5)');
  T.ok(SR.tuning.casino.chips.every((c) => c >= SR.tuning.casino.bj.minimum && c <= SR.tuning.casino.roulette.limit), 'every chip is a legal stake at the tables');
}

T.section('requests: W2-City 6 (the crowd numbers as tuning) and W2-Money 7 (the loan\'s last day)');
{
  T.eq([SR.tuning.crowd.turnRange, SR.tuning.crowd.scurry], [80, 0.2], 'tuning.crowd.turnRange 80 u, scurry 0.2 (GDD §3.11)');
  const s = H.state(SR, { money: { cash: 0, bank: 0, rate: 1.5, loan: { amount: 500, daysLeft: 3 } } });
  const keys = () => SR.rules.night.run(s, H.ctx(SR, 1), { kind: 'sleep' }).lines.filter((l) => l.section === 'money' && /^report\.loan/.test(l.key));
  let l = keys();
  T.eq([l.map((x) => x.key), SR.text(l[0].key, l[0].vars)], [['report.loanDays'], 'Loan: 2 days left, ' + SR.text.money(s.money.loan.amount) + ' owed'], 'two days left');
  l = keys();
  T.eq([s.money.loan.daysLeft, l.map((x) => x.key), SR.text(l[0].key, l[0].vars)], [1, ['report.loanDueTonight'], 'Loan: ' + SR.text.money(s.money.loan.amount) + ' owed, due tonight'],
    'the morning with 1 day left is the last day: "due tonight", not "1 days left"');
  T.eq([keys().map((x) => x.key), s.money.loan], [['report.loanDefault'], null], '… and that night defaults');
}

T.section('requests: W2-Home 1 (game:over after the report scene)');
{
  const heard = [];
  const off = SR.events.on('game:over', (p) => heard.push(p.reason));
  const live = (patch, opts) => { SR.state = H.state(SR, patch, opts); return SR.state; };
  live({ clock: { day: 40, min: 1320 } }, { length: 40 });
  let r = SR.act(SLEEP);
  T.eq([r.over, heard], [{ reason: 'time' }, []], 'the last night slept: Result.over, but no game:over from SR.act (the report scene emits it)');
  live({ clock: { day: 40, min: 600 }, stats: { hp: 5 } }, { length: 40 });
  r = SR.act(row('fall2', { group: 'special', timeRule: 'free', effects: [['hurt', 10, 'fall']] }));
  T.eq([r.down && r.down.outcome, r.over, heard], ['hospital', { reason: 'time' }, []], 'a timed game ending in the hospital night: the same');
  live({ stats: { hp: 5 }, mode: { difficulty: 'hardcore' } });
  r = SR.act('testw2e.fall2');
  T.eq([r.down.outcome, heard], ['death', ['death']], 'Hardcore death at HP 0 (no report): SR.act emits game:over (death)');
  heard.length = 0;
  const s = live({ clock: { day: 40 }, jail: { daysLeft: 3, served: 0, reason: 'store', bailBase: 500 } }, { length: 40 });
  r = SR.act(row('jailDay', { group: 'special', timeRule: 'free', effects: [['fn', 'crime.jailDay']] }), { choice: 'hp' });
  T.eq([r.ok, r.report && r.report.kind, s.over, heard], [true, 'jail', true, ['time']], 'a game ending in a jail night: game:over from SR.act (the Jail Day card has no report scene)');
  off();
  SR.state = null;
}

T.section('the intra-day weather (P1 weather; GDD §3.12, B-19)');
{
  const s = H.state(SR, { clock: { min: 600 } });
  const c0 = H.ctx(SR, 3), st0 = c0.rng.state();
  A.run(s, STUDY, {}, c0);
  T.eq([c0.rng.state(), s.world.weather], [st0, 'clear'], 'P0: passing 12:00 draws nothing and the weather stays Clear');
  const undo = H.features(SR, { weather: true });
  let moved = 0, rain = 0;
  for (let i = 0; i < 4000; i++) {
    const w = H.state(SR, { clock: { min: 660 }, world: { weather: 'cloudy' } });
    const r = SR.rules.calendar.intraday(w, 660, 780, SR.rng.create(i));
    if (r.length) moved++;
    if (w.world.todayHadRain) rain++;
  }
  T.ok(Math.abs(moved / 4000 - 0.3) < 0.03, 'passing 12:00: a move with 30 %', moved / 4000);
  T.ok(Math.abs(rain / 4000 - 0.3 * 0.25) < 0.02, '… one step along the chain (Cloudy → Rain 25 %), which sets todayHadRain', rain / 4000);
  const both = H.state(SR, { world: { weather: 'clear' } });
  const rng = SR.rng.create(1), a = rng.state();
  SR.rules.calendar.intraday(both, 700, 1100, rng);
  T.ok(rng.state()[3] - a[3] >= 2, 'passing both 12:00 and 18:00 rolls twice');
  T.eq(SR.rules.calendar.intraday(both, 780, 1000, SR.rng.create(2)), [], 'nothing between the marks');
  const u2 = H.features(SR, { calendar: true });
  const hw = H.state(SR, { clock: { day: 3 }, world: { weather: 'clear', cityEvent: { id: 'heatWave', day: 3 } } });
  const rh = SR.rng.create(4), sh = rh.state();
  T.eq([SR.rules.calendar.intraday(hw, 600, 1200, rh), rh.state()], [[], sh], 'a Heat Wave day stays Clear (no draw)');
  u2();
  // Through the pipeline: a 2 h row from 11:00 passes 12:00.
  let piped = 0;
  for (let i = 0; i < 300; i++) {
    const w = H.state(SR, { clock: { min: 660 } });
    A.run(w, STUDY, {}, H.ctx(SR, 500 + i));
    if (w.world.weather !== 'clear') piped++;
  }
  T.ok(piped > 0 && piped < 150, 'the pipeline rolls it as an action passes 12:00', piped);
  const night = H.state(SR, { clock: { min: 600 } });
  const cn = H.ctx(SR, 6), sn = cn.rng.state();
  A.run(night, row('noop', { group: 'special', timeRule: 'free', effects: [] }), {}, cn);
  T.eq(cn.rng.state(), sn, 'an action that spends no time rolls nothing');
  undo();
}

T.section('the new-game roll (GDD §4.2, B-02)');
{
  const rng = SR.rng.create(11);
  const rolls = [];
  for (let i = 0; i < 500; i++) rolls.push(SR.rules.state.roll(rng));
  T.ok(rolls.every((r) => [r.str, r.int, r.cha].every((v) => v >= 1 && v <= 10) && r.extra >= 3 && r.extra <= 9), 'stats rand(1..10), extra rand(3..9) (orig)');
  T.ok([1, 10].every((v) => rolls.some((r) => r.str === v)) && [3, 9].every((v) => rolls.some((r) => r.extra === v)), 'both ends of each range come up');
  T.eq(SR.rules.state.roll(SR.rng.create(5)), SR.rules.state.roll(SR.rng.create(5)), 'deterministic per stream');
  const a = SR.rng.create(8), b = SR.rng.create(8);
  SR.rules.state.roll(a);
  for (let i = 0; i < 4; i++) b.next();
  T.eq(a.state(), b.state(), 'four draws');
  T.eq(SR.rules.state.fair(), { str: 7, int: 7, cha: 7, extra: 6 }, 'the Fair start');
}

T.section('GDD §6.1 P0 rows through the pipeline');
{
  // U of S: Study (free, 2 h, +2 INT), Business class ($20, 2 h, +4 INT), Gym (2 h, +2 STR, -4 HP);
  // +1 karma per activity, at most +3 a day; "Too hurt" at HP ≤ 4.
  const s = H.state(SR, { money: { cash: 100 } });
  run(s, STUDY);
  T.eq([s.stats.int, s.clock.min, s.stats.karma], [9, 600, 1], 'Study: +2 INT, 2 h, +1 karma');
  run(s, CLASS);
  T.eq([s.stats.int, s.money.cash, s.clock.min, s.edu.classes.biz], [13, 80, 720, 1], 'Business class: $20, +4 INT, a Business class counted');
  run(s, GYM);
  T.eq([s.stats.str, s.stats.hp, s.stats.hpMax, s.stats.karma], [9, 18, 24, 3], 'Gym: +2 STR (HP max 24), -4 HP; karma +3');
  run(s, STUDY);
  T.eq(s.stats.karma, 3, 'U of S karma stops at +3 a day');
  s.stats.hp = 4;
  T.eq(preview(s, GYM).reason, 'reason.tooHurt', 'Gym: "Too hurt" at HP 4');
  s.stats.hp = 5;
  const g = preview(s, GYM);
  T.eq([g.ok, g.gains.find((x) => x.key === 'str').n], [true, 1], 'at HP 5 the gym runs, Winded after its own cost: +1');
  // Sticky's: beer $20, +2 CHA, 1 h, Buzz +1, cut off at Buzz 5; a bottle $30 into the Bag.
  const b = H.state(SR, { money: { cash: 200 }, clock: { min: 1080 } });
  run(b, BEER);
  T.eq([b.money.cash, b.stats.cha, b.stats.buzz, b.clock.min], [180, 9, 1, 1140], 'a beer: $20, +2 CHA, Buzz 1, 1 h');
  b.stats.buzz = 5;
  T.eq(preview(b, BEER).reason, 'reason.tooBuzzed', 'Sticky cuts you off at Buzz 5');
  run(b, BOTTLE);
  T.eq([b.items.booze, b.money.cash], [1, 150], 'a bottle: $30');
  // McSticks and the store: food 30 m, refused at full HP, the employee discount at McSticks only.
  const f = H.state(SR, { stats: { hp: 10 } });
  run(f, FRIES);
  T.eq([f.money.cash, f.stats.hp], [91, 22], 'fries as a Fry Cook: $9 (25 % off), +20 HP up to HP max');
  T.eq(preview(f, FRIES).reason, 'reason.fullHp', 'refused at full HP');
  f.stats.hp = 1;
  run(f, NACHOS);
  T.eq([f.money.cash, f.stats.hp], [87, 8], 'nachos at the store: $4, no employee discount');
  // The Bag: smoke a pack (1 h, +1 CHA, -10 HP, -1 karma; needs HP > 10).
  const k = H.state(SR, { items: { smokes: 1 } });
  run(k, SMOKE);
  T.eq([k.stats.cha, k.stats.hp, k.stats.karma, k.items.smokes, k.clock.min], [8, 12, -1, 0, 540], 'smoke: +1 CHA, -10 HP, -1 karma, a pack used, 1 h');
  k.items.smokes = 1;
  k.stats.hp = 10;
  T.eq(preview(k, SMOKE).reason, 'reason.tooHurt', '"Too hurt" at HP ≤ 10');
  // McSticks Work (Full): $42, 6 h, +1 karma; the wall: 18:00 yes, 18:30 no.
  const w = H.state(SR, { clock: { min: 1080 } });
  T.ok(preview(w, WORK).ok, 'a 6 h shift can start at 18:00');
  w.clock.min = 1110;
  T.eq(preview(w, WORK).reason, 'reason.tooLate', '… not at 18:30');
  w.clock.min = 480;
  run(w, WORK);
  T.eq([w.money.cash, w.clock.min, w.stats.karma, w.job.shiftsAtRank.mcsticks], [142, 840, 1, 1], 'a Full shift: $42, 6 h, +1 karma, one shift at rank');
}

T.section('training feedback (UI §4.3) through training.apply');
{
  const s = H.state(SR);
  let r = run(s, STUDY);
  T.eq([r.stamps, r.toasts], [[{ key: 'stamp.stats.int', vars: { n: 2 } }], []], 'Study: the "+2 INTELLIGENCE!" stamp, as the stat effect gives it');
  s.stats.hp = 4;
  r = run(s, STUDY);
  T.eq([r.stamps.length, r.toasts.map((x) => x.key)], [0, ['toast.stats.winded']], 'Winded: +1, no stamp, the Winded toast');
  const m = H.state(SR, { stats: { int: 998 } });
  const p = preview(m, STUDY);
  T.ok(p.gains.some((g) => g.kind === 'stat' && g.key === 'int' && g.n === 1 && g.capped), 'the preview notes "(max)" at the cap');
  r = run(m, STUDY);
  T.eq([m.stats.int, r.toasts.map((x) => x.key)], [999, ['toast.stats.maxed']], 'the gain past 999 is lost, with the maxed-out toast');
}

T.section('the night foreseen (SR.rules.night.preview, B-07)');
{
  const cases = [
    { stats: { hp: 3 }, furniture: { owned: { bed: 1, books: 1, treadmill: 1 } } },
    { stats: { hp: 20 }, items: { pills: 1 }, furniture: { owned: { freezer: 1, minibar: 1 } } },
    { stats: { hp: 1, str: 93, hpMax: 108 }, homes: { owned: ['apt', 'mansion'], living: 'mansion' }, furniture: { owned: { bed: 1, freezer: 1, books: 1 } } },
  ];
  cases.forEach((patch, i) => {
    const s = H.state(SR, patch);
    const p = SR.rules.night.preview(s);
    const hp0 = s.stats.hp, st0 = { str: s.stats.str, int: s.stats.int, cha: s.stats.cha };
    SR.rules.night.run(s, H.ctx(SR, 5), { kind: 'sleep' });
    const sum = {};
    p.gains.forEach((g) => { sum[g.stat] = (sum[g.stat] || 0) + g.n; });
    const got = {}, real = {};
    ['str', 'int', 'cha'].forEach((k) => {
      if (sum[k]) got[k] = sum[k];
      if (s.stats[k] !== st0[k]) real[k] = s.stats[k] - st0[k];
    });
    T.eq([p.hp, got], [s.stats.hp - hp0, real], 'case ' + (i + 1) + ': the preview matches the night (HP ' + p.hp + ', gains ' + JSON.stringify(got) + ')');
  });
  const d = H.state(SR);
  T.eq([SR.rules.night.restoreHp(d), SR.rules.night.preview(d).hp], [20, 0], 'day 1: a restore of 20 (orig), nothing to restore at full HP');
}

T.section('the report copy (UI §5.11, §5.12)');
{
  const s = H.state(SR, { clock: { day: 6 }, jail: { daysLeft: 2, served: 0, reason: 'store', bailBase: 500 } });
  SR.rules.effects.addMsg(s, 'vm.mel.test', {});
  const rep = SR.rules.night.run(s, H.ctx(SR, 3), { kind: 'jail' });
  const keys = rep.lines.map((l) => l.key);
  T.ok(keys.indexOf('report.unreadOne') >= 0 && keys.indexOf('report.unread') < 0, 'one unread message: the singular line');
  T.ok(keys.indexOf('report.jail.summary') >= 0, 'a Saturday night in jail (no market): the summary without a mover');
  T.ok(SR.text.has('report.unreadOne') && SR.text.has('report.jail.summaryMarket'), 'their text keys exist');
}

T.section('a 40-day run on the rules (BUILD_PLAN §4.14, rule level)');
{
  // A small scripted bot on the test rows: works, studies, eats, buys the bed, TV, alarm and
  // pills, sleeps every night; the game must end after day 40 with its results.
  const BED = row('buyBed', { group: 'buy', effects: [['fn', 'homes.buyFurniture', 'bed']] });
  const TV = row('buyTv', { group: 'buy', effects: [['fn', 'homes.buyFurniture', 'tv']] });
  const ALARM = row('buyAlarm', { group: 'buy', cost: { cash: 200 }, priceTarget: 'item.pawn.alarm', effects: [['fn', 'items.buy', 'alarm', 1, 'pawn']] });
  const PILL = row('buyPill', { group: 'buy', cost: { cash: 45 }, priceTarget: 'item.store.pills', effects: [['fn', 'items.buy', 'pills', 1, 'store']] });
  const APPLY = row('apply', { group: 'work', effects: [['fn', 'jobs.apply', 'nli']] });
  const PROMOTE = row('promote', { group: 'work', effects: [['fn', 'jobs.promote', 'nli']] });
  const NLI = row('nliWork', { group: 'work', cost: { min: 'shift.min' }, requires: [['fn', 'jobs.canWork', 'nli']], effects: [['fn', 'jobs.work', 'nli']] });
  ['standard', 'relaxed', 'hardcore'].forEach((difficulty) => {
    const s = H.state(SR, { money: { cash: 3500 } }, { seed: 21, difficulty: difficulty, length: 40 });
    const ctx = H.ctx(SR, 77);
    let acts = 0, errors = 0, nights = 0;
    const tryAct = (id, params) => {
      const p = A.preview(s, id, params || {}, { source: 'sim' });
      if (!p.ok) return false;
      acts++;
      try { return A.run(s, id, params || {}, ctx).ok; } catch (e) { errors++; return false; }
    };
    while (!s.over && nights < 60) {
      if (s.stats.hp < s.stats.hpMax / 2) tryAct(FRIES);
      [[BED, 700], [ALARM, 400], [TV, 2700]].forEach((b) => { if (s.money.cash > b[1]) tryAct(b[0]); });
      if (s.items.pills < 1 && s.money.cash > 500) tryAct(PILL);
      tryAct(APPLY);
      tryAct(PROMOTE);
      if (!tryAct(NLI)) tryAct(WORK);
      while (tryAct(STUDY)) { if (s.stats.hp < 8) tryAct(FRIES); }
      const r = A.run(s, SLEEP, {}, ctx);
      nights++;
      if (!r.ok) errors++;
    }
    T.eq([s.over, s.result && s.result.reason, s.clock.day, errors], [true, 'time', 41, 0], difficulty + ': 40 days of work, study and sleep reach the results');
    T.ok(s.furniture.owned.bed === 1 && s.furniture.owned.tv === 1 && s.items.alarm === 1, difficulty + ': the bed, the TV and the alarm were bought', s.furniture.owned);
    T.ok(s.job.ranks.nli && s.stats.int > 100 && s.result.netWorth > 0 && s.result.rank, difficulty + ': an NLI job, INT past 100, a ranked net worth', [s.job.ranks.nli, s.stats.int, s.result.netWorth, s.result.rank]);
    T.eq([s.stats.hpMax, s.history.nw.length], [SR.tuning.start.hpMaxBase + s.stats.str, 41], difficulty + ': the HP max invariant holds; a history point per morning');
    T.eq(A.run(s, STUDY, {}, ctx).reason, 'reason.gameOver', difficulty + ': nothing runs after the end');
  });
}

T.section('the 40-day run with a robbery, a smuggle and a fall (BUILD_PLAN §4.14, rule level)');
{
  // The conflict rules are W2-RulesC's; this checks that the kernel and the night carry them.
  const ROB = row('rob', { group: 'crime', timeRule: 'robbery', confirm: 'crime.rob.confirm.store', requires: [['fn', 'crime.canRob', 'store']], effects: [['fn', 'crime.rob', 'store']] });
  row('rob:resolve', { group: 'crime', timeRule: 'free', effects: [['fn', 'crime.robResolve', 'store']] });
  const SMUGGLE = row('smuggle', { group: 'special', timeRule: 'trip', cost: { cash: 'trade.ticket' }, effects: [['fn', 'trade.smuggle']] });
  const TAKE = row('take', { group: 'special', timeRule: 'free', effects: [['fn', 'trade.take']] });
  const FALL = row('fall', { group: 'special', timeRule: 'free', effects: [['hurt', 10, 'fall'], ['emit', 'fall', { count: 1, x: 0, y: 0 }]] });
  const s = H.state(SR, { money: { cash: 3000 } }, { seed: 33, length: 40 });
  const ctx = H.ctx(SR, 44);
  const seen = {};
  let errors = 0;
  const act = (id, params) => { try { return A.run(s, id, params || {}, ctx); } catch (e) { errors++; return { ok: false, reason: String(e) }; } };
  for (let n = 0; n < 60 && !s.over; n++) {
    const day = s.clock.day;
    if (s.jail) {
      const jd = SR.rules.crime.jailDay(s, 'hp', ctx);
      seen.jailed = true;
      if (jd && jd.ok === false) errors++;
      continue;
    }
    if (day === 5) {
      s.items.gun = 1; s.items.ammo = 20; s.clock.min = 1230;
      const r = act(ROB);
      seen.rob = r.ok && r.open && r.open.resolve === 'testw2e.rob:resolve' && s.clock.min === 1440;
      const rr = act('testw2e.rob:resolve', { beats: [true, true, false] });
      seen.loot = rr.ok && rr.events.some((e) => e.name === 'rob' && e.payload.outcome === 'win');
      seen.robTwice = act('testw2e.rob:resolve', { beats: [true, true, true] }).reason;
    }
    if (day === 8) {
      Object.assign(s.stats, { str: 300, hpMax: 315, hp: 300 });
      s.items.phone = 1; s.items.booze = 10; s.clock.min = 0;
      const r = act(SMUGGLE, { city: 'gusty', kind: 'smuggle' });
      seen.trip = r.ok && s.clock.min === 1440;
      if (s.trade.offer) seen.deal = act(TAKE).ok;
    }
    if (day === 12) {
      s.stats.hp = 5;
      const r = act(FALL);
      seen.hospital = r.ok && r.down && r.down.outcome === 'hospital' && s.clock.day === 13 && s.clock.min === 720;
      continue;
    }
    if (!s.over && s.clock.min < 1440 && s.stats.hp > s.stats.hpMax / 2) act(STUDY);
    act(SLEEP);
  }
  T.eq([seen.rob, seen.loot, seen.robTwice], [true, true, 'reason.notNow'], 'day 5: the store robbery opens the Hold-up at 20:30, pays once, the clock at 24:00');
  T.ok(seen.trip, 'day 8: the red-eye leaves at 00:00 and takes the day', seen);
  T.ok(seen.hospital, 'day 12: a fall at 5 HP runs the hospital night; 12:00 the next day');
  T.eq([s.over, s.result && s.result.reason, errors], [true, 'time', 0], 'the run still reaches the results after 40 days');
}

T.section('a debug-assisted election run on the nights (GDD §4.17, §4.7 steps 3, 5, 12)');
{
  // The night's election steps with the real election rules (W2-RulesC): the morning nomination
  // check, the 7 campaign nights, election night on the report, then the office salary.
  const ACCEPT = row('accept', { group: 'special', timeRule: 'free', effects: [['fn', 'election.accept']] });
  let won = 0, lost = 0, runs = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = H.state(SR, { homes: { owned: ['apt', 'castle'], living: 'castle' }, money: { cash: 400000 },
      stats: { str: 700, int: 700, cha: 700, karma: 60 } }, { seed: seed, length: 0 });
    s.stats.hpMax = SR.tuning.start.hpMaxBase + s.stats.str;
    const ctx = H.ctx(SR, 100 + seed);
    let rep = run(s, SLEEP, {}, 100 + seed).report;
    if (seed === 1) T.eq([s.election.status, s.election.path, s.msgs.some((m) => m.key === 'vm.board.nominated')], ['nominated', 'president', true], 'the morning after qualifying: nominated by the Electoral Board');
    const acc = A.run(s, ACCEPT, { chest: 2 }, ctx);
    if (seed === 1) T.eq([acc.ok, s.election.status, s.money.cash], [true, 'campaign', 200000], 'accepted with the biggest war chest ($200,000)');
    let nights = 0;
    while (s.election.status === 'campaign' && nights < 10) { rep = A.run(s, SLEEP, {}, ctx).report; nights++; }
    runs++;
    if (seed === 1) T.eq([nights, !!rep.election, rep.lines.some((l) => l.section === 'election')], [7, true, true], 'election night after campaign day 7, on the report');
    if (s.election.status === 'office') {
      won++;
      const cash = s.money.cash;
      A.run(s, SLEEP, {}, ctx);
      if (won === 1) T.eq([s.job.office !== null, s.money.cash - cash >= SR.tuning.election.salary], [true, true], 'in office: the salary arrives at night (step 3)');
    } else if (s.election.status === 'lost') lost++;
  }
  T.eq(won + lost, runs, 'every run ends in office or lost (' + won + ' / ' + lost + ')');
  T.ok(won > 0, 'with the biggest chest and 700s the office is won in some runs', won);
}

T.section('a long Unlimited run (history thinning, day 365)');
{
  const s = H.state(SR, {}, { seed: 5, length: 0 });
  const ctx = H.ctx(SR, 8);
  for (let d = 1; d < 400; d++) A.run(s, SLEEP, {}, ctx);
  T.eq([s.over, s.clock.day], [false, 400], 'Unlimited never ends by itself');
  T.ok(s.player.cars.sports.owned && s.msgs.some((m) => m.key === 'vm.crew.day365'), 'day 365: the call and the sports car');
  T.eq(s.history.nw.length, 120 + Math.floor((400 - 120) / 7), 'daily history to day 120, then weekly');
  T.ok(Object.keys(s.stocks).every((t) => s.stocks[t].price >= 1 && s.stocks[t].hist.length <= 30), 'every ticker stays at or above $1 (reverse splits) with 30 points of history');
  T.ok(s.money.rate >= 0.25 && s.money.rate <= 3.5 && s.money.rateHist.length === 30, 'the rate stays in 0.25-3.5 with a 30-point board');
}

T.section('review fixes: an ended Keep-playing run takes no more actions (GDD §4.19, §5)');
{
  const g = H.state(SR, { clock: { day: 40, min: 1320 } }, { length: 40 });
  run(g, SLEEP);
  SR.rules.endgame.keepPlaying(g);
  g.stats.hp = 5;
  T.ok(run(g, FRIES).ok, 'a Keep-playing run is live: rows run');
  g.stats.hp = 5;
  T.eq(run(g, RETIRE).over, { reason: 'retire' }, 'Retire ends it');
  const r = run(g, FRIES), p = preview(g, FRIES);
  T.eq([r.ok, r.reason, p.ok, p.reason, g.stats.hp], [false, 'reason.gameOver', false, 'reason.gameOver', 5],
    'after Retire every row refuses (run and preview) and nothing changes');
  const d = H.state(SR, { clock: { day: 16 }, stats: { hp: 5 } }, { length: 15, difficulty: 'hardcore' });
  d.over = true;
  d.result = SR.rules.endgame.results(d, 'time');
  SR.rules.endgame.keepPlaying(d);
  const fall = run(d, 'testw2e.fall2');
  T.eq([fall.down.outcome, fall.over, d.over], ['death', { reason: 'death' }, true], 'a Hardcore death in a Keep-playing run ends it (DECEASED)');
  T.eq([run(d, SLEEP).reason, preview(d, STUDY).reason], ['reason.gameOver', 'reason.gameOver'], '… and the dead play no further');
}

T.section('review fixes: Overtime only right after a Full shift, nothing in between (B-05, GDD §4.6)');
{
  const undo = H.features(SR, { hustles: true });
  const shift = (track) => row('shift_' + track, { group: 'work', variants: ['full', 'half', 'overtime'], cost: { min: 'shift.min', hp: 'shift.hp' },
    requires: [['fn', 'jobs.canWork', track]], effects: [['fn', 'jobs.work', track]] });
  const MC = shift('mcsticks'), NLI = shift('nli');
  const ENTER = row('enterSilent', { group: 'special', timeRule: 'free', silent: true, effects: [] });
  const s = H.state(SR, { stats: { str: 50, hp: 65, hpMax: 65 }, job: { ranks: { nli: 'ceo' } } });
  run(s, MC, { variant: 'full' });
  T.ok(preview(s, MC, { variant: 'overtime' }).ok, 'right after the McSticks Full shift, its Overtime is open');
  const c0 = s.money.cash;
  run(s, ENTER);   // walking into NLI runs world.enter (silent, free)
  const x = run(s, NLI, { variant: 'overtime' });
  T.eq([x.ok, x.reason, s.money.cash - c0], [false, 'reason.overtimeNotNow', 0], 'a McSticks shift opens no Overtime at NLI (a CEO\'s $900 for a cook\'s shift)');
  run(s, NLI, { variant: 'full' });
  const ot = run(s, NLI, { variant: 'overtime' });
  T.eq([ot.ok, s.job.overtimeToday], [true, 1], 'the NLI Full shift, then its Overtime: allowed');
  const t = H.state(SR, { stats: { hp: 22 } });
  run(t, MC, { variant: 'full' });
  run(t, ENTER);
  T.eq([t.job.lastFullEnd, preview(t, MC, { variant: 'overtime' }).reason], [-1, 'reason.overtimeNotNow'], 'any action in between (a free one too) ends the chance');
  const u = H.state(SR, { stats: { hp: 22 } });
  run(u, MC, { variant: 'full' });
  const end = u.job.lastFullEnd;
  run(u, MC, { variant: 'full', m: 5 });
  T.eq([run(u, ENTER).ok, u.job.lastFullEnd], [true, -1], 'the mark is cleared by the next action');
  T.ok(end > 0, 'a Full shift sets it', end);
  const refused = H.state(SR, { stats: { hp: 22 } });
  run(refused, MC, { variant: 'full' });
  run(refused, FRIES);   // full HP: refused, nothing happened
  T.ok(preview(refused, MC, { variant: 'overtime' }).ok, 'a refused action is no action in between');
  undo();
}

T.section('review fixes: SR.act announces an error as a refusal (CONTRACT §8.9)');
{
  SR.def.fn('testw2e.boom', (s) => { s.money.cash = 999999; throw new Error('boom'); });
  const BOOM = row('boom', { group: 'special', timeRule: 'free', effects: [['fn', 'testw2e.boom']] });
  const s = H.state(SR);
  SR.state = s;
  SR.rng.rules.setState(s.rng.rules);
  const heard = [];
  const off = SR.events.on('action:done', (p) => heard.push([p.id, p.result.ok, p.result.reason]));
  const oe = console.error;
  console.error = () => {};
  const r = SR.act(BOOM);
  console.error = oe;
  off();
  T.eq([r.ok, r.reason, s.money.cash, heard], [false, 'reason.error', 100, [[BOOM, false, 'reason.error']]],
    'the state is rolled back and action:done carries the refusal');
  SR.state = null;
}

T.section('review fixes: the bank.charge named fn reports a write-off like the charge effect (B-09)');
{
  const FN = row('chargeFn', { group: 'special', timeRule: 'free', effects: [['fn', 'bank.charge', 500, 'tow']] });
  const FX = row('chargeFx', { group: 'special', timeRule: 'free', effects: [['charge', 500, 'tow']] });
  const a = H.state(SR, { money: { cash: 100, bank: 50 } }), b = H.state(SR, { money: { cash: 100, bank: 50 } });
  const ra = run(a, FN), rb = run(b, FX);
  T.eq([a.money.cash, a.money.bank, ra.toasts.map((t) => [t.key, t.vars.n, t.kind])], [0, 0, [['toast.act.writtenOff', 350, 'warning']]],
    'cash, then bank, the rest written off and said so');
  T.eq(ra.toasts, rb.toasts, 'the same toast as the charge effect');
  const rich = H.state(SR, { money: { cash: 400, bank: 200 } });
  T.eq([run(rich, FN).toasts, rich.money.cash, rich.money.bank, SR.reg.fn['bank.charge'](H.state(SR), {}, {}, 30, 'tow').paid], [[], 0, 100, 30],
    'no toast when it is paid in full');
}

T.section('review fixes: a night\'s stat gains are announced once (CONTRACT §8.7)');
{
  const s = H.state(SR, { furniture: { owned: { books: 1, treadmill: 1 } } });
  const r = run(s, SLEEP);
  const mine = r.events.filter((e) => e.name === 'stat'), theirs = r.report.events.filter((e) => e.name === 'stat');
  T.eq([mine.length, theirs.map((e) => e.payload.key + '+' + e.payload.n).sort()], [0, ['int+2', 'str+2']],
    'the furniture gains ride on the Report (the report scene re-emits them), not a second time on the Result');
  T.ok(r.deltas.some((d) => d.kind === 'stat' && d.key === 'int' && d.n === 2), '… the Result still has the Delta');
  const j = H.state(SR, { clock: { day: 3 }, jail: { daysLeft: 3, served: 0, reason: 'store', bailBase: 500 } });
  const rj = run(j, 'testw2e.jailDay', { choice: 'str' });
  T.eq(rj.events.filter((e) => e.name === 'stat').map((e) => e.payload), [{ key: 'str', n: 2, total: 9 }], 'a Jail Day workout (no night gain) keeps its own `stat` event');
}

T.done();
