// tests/e2e/store.test.cjs — owner: W2-Food. Funkytown Five-O (BUILD_PLAN §4.4; GDD §4.10, §6.1;
// BALANCE B-06, B-11b, B-14e, B-28a, B-30): first the rules in Node (every price, HP value and time
// of B-06, the full-HP refusal, repeatable snacks and goods with their stacks, the robbery's
// preconditions (a gun, ≥ 10 ammo, a start before 21:00: 20:30 yes, 21:00 no), its start (24:00,
// 5-9 ammo, -10 karma and +30 Heat win or lose), loot or jail per B-11b, a robbery row that never
// repeats, the Hold-up's Auto with real rolls against the B-11b reference odds, and the P1 rows:
// The Daily Fold, gum and scratch cards with the scratch engine), then the game in Chromium over
// file:// (the card, clicks and R, the robbery through the confirm and the Hold-up frame with Auto,
// a forced win and a forced loss, the scratch frame) with zero console errors. Screenshots go to
// shots/W2-Food/ (git-ignored).
//   node tests/e2e/store.test.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const { load } = require('../node/load.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Food');
const T = h.suite('e2e Funkytown Five-O (W2-Food)');

// BALANCE (copied from the document, not read from tuning.js).
const SNACKS = { slushee: [1, 1, 30], candybar: [2, 3, 30], nachos: [4, 7, 30] };   // B-06 price, HP, min
const GOODS = { smokes: [10, 0, 99], pills: [45, 0, 99] };                           // B-06 price, min, stack (orig)
const P1_GOODS = { gum: [1, 0, 9], scratch: [5, 0, 20] };
const ROB = { ammo: [5, 9], karma: -10, heat: 30, loot: [100, 599], jail: 3, jailHardcore: 5, D: 60, start: 1260, clock: 1440 };  // B-11b
const PAPER = { price: 2, min: 30, int: 1 };                                          // B-03 paper
const SCRATCH_PRICE = 5;                                                              // B-14e
const SCRATCH_PRIZES = [10000, 100, 10];                                              // B-14e, top prize first
const POSTERS_HEAT = 50;                                                              // B-11d wanted posters (Dee hears sirens)
const GOOD_PCT = 10;                                                                  // B-28a goodKarma (P1 karmaTiers)
const CLIPPER_PCT = 10;                                                               // B-28a couponClipper (P1 perks)
const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9);
// B-11b reference odds (store, Heat 0, CHA every beat): chance(CHA, 60) per beat; best of three.
const bestOf3 = (p) => p * p * (3 - 2 * p);

function rules() {
  const R = load({ mode: 'all', extra: ['js/minigames/framework.js', 'js/minigames/duel.js', 'js/minigames/scratch.js'] });
  const SR = R.SR;
  const A = SR.rules.act;
  let seed = 1;
  const ctx = () => ({ rng: SR.rng.create(seed++), source: 'sim' });
  const fresh = (patch) => { const s = SR.rules.state.create({ seed: 42 }); if (patch) SR.util.merge(s, patch); return s; };
  const flags = (on) => { Object.keys(SR.features).forEach((f) => { SR.features[f] = false; }); (on || []).forEach((f) => { SR.features[f] = true; }); };
  const pv = (s, id, p) => A.preview(s, id, p || {}, ctx());
  const run = (s, id, p, c) => A.run(s, id, p || {}, c || ctx());
  const armed = (patch) => fresh(SR.util.merge({ items: { gun: 1, ammo: 20 }, clock: { min: 1230 } }, patch || {}));

  T.section('the building and its rows');
  flags([]);
  const b = SR.reg.building.store;
  T.eq([b.owner, b.portrait, b.music, b.interior], ['dee', 'dee', 'funky_aisle', 'store'], 'Five-O: Dee, funky_aisle, its interior');
  const s0 = fresh({ stats: { hp: 1 } });
  T.eq(A.actions('store').filter((id) => !pv(s0, id).hidden), ['store.slushee', 'store.candybar', 'store.nachos', 'store.smokes', 'store.pills', 'store.rob'],
    'P0 card: three snacks, smokes, pills, the robbery (the P1 rows hide with their flags off)');

  T.section('B-06 snacks, eaten on the spot (P0)');
  Object.keys(SNACKS).forEach((f) => {
    const [price, hp, min] = SNACKS[f], id = 'store.' + f;
    const s = fresh({ stats: { hp: 1 } });
    const p = pv(s, id);
    T.eq([p.ok, p.cost.cash, p.cost.min, p.gains[0].n], [true, price, min, hp], f + ': $' + price + ', +' + hp + ' HP, ' + min + ' m');
    const before = SR.util.clone(s);
    const r = run(s, id);
    T.eq([r.ok, before.money.cash - s.money.cash, s.stats.hp - before.stats.hp, s.clock.min - before.clock.min], [true, price, hp, min], f + ': the run');
    T.eq(r.events.filter((e) => e.name === 'eat').map((e) => e.payload), [{ item: f, hp, where: 'store' }], f + ': the eat rule event');
    const pf = pv(fresh(), id);
    T.eq([pf.ok, pf.reason, pf.repeatable], [false, 'reason.fullHp', true], f + ': refused at full HP; repeatable');
  });

  T.section('smokes and caffeine pills (P0; stacks of 99, orig)');
  Object.keys(GOODS).forEach((g) => {
    const [price, min, stack] = GOODS[g], id = 'store.' + g;
    const s = fresh({ money: { cash: 1000 } });
    const p = pv(s, id);
    T.eq([p.ok, p.cost.cash, p.cost.min, p.gains[0].kind, p.gains[0].key, p.gains[0].n, p.repeatable], [true, price, min, 'item', g, 1, true], g + ': $' + price + ', ' + min + ' m, +1 in the Bag, repeatable');
    const r = run(s, id);
    T.eq([r.ok, s.items[g], r.events.find((e) => e.name === 'buy').payload], [true, 1, { item: g, n: 1, where: 'store', price }], g + ': bought, with the buy rule event');
    const full = fresh({ items: { [g]: stack } });
    const pf = pv(full, id);
    T.eq([pf.ok, pf.reason, pf.vars && pf.vars.max], [false, 'reason.stackFull', stack], g + ': refused at ' + stack + ' ("Can\'t carry more"), cash untouched');
  });
  flags(['karmaTiers']);
  const good = fresh({ stats: { karma: 60, hp: 1 } });
  T.eq(['nachos', 'smokes', 'pills'].map((x) => pv(good, 'store.' + x).cost.cash), [4, 10, 45].map((p) => roundHalfUp(p * (1 - GOOD_PCT / 100))),
    'Good karma (P1 karmaTiers): 10 % off, rounded half up ($4, $9, $41)');
  flags(['perks']);
  const clip = fresh({ stats: { hp: 1 }, perks: { owned: ['couponClipper'] } });
  const pclip = pv(clip, 'store.pills');
  T.eq([['nachos', 'smokes', 'pills'].map((x) => pv(clip, 'store.' + x).cost.cash), pclip.badges], [[4, 10, 45].map((p) => roundHalfUp(p * (1 - CLIPPER_PCT / 100))), ['couponClipper']],
    'Coupon Clipper (P1 perks): 10 % off snacks and goods, with its badge');
  flags(['perks', 'karmaTiers']);
  const both = fresh({ stats: { hp: 1, karma: 60 }, perks: { owned: ['couponClipper'] } });
  T.eq([pv(both, 'store.pills').cost.cash, pv(both, 'store.pills').badges.length], [roundHalfUp(45 * (1 - Math.max(GOOD_PCT, CLIPPER_PCT) / 100)), 1],
    'Good karma and Coupon Clipper together: only the largest percent applies (B-28a), pills $41, one badge');
  flags([]);

  T.section('the robbery: preconditions (B-11b)');
  const rob = SR.reg.action['store.rob'];
  T.eq([rob.group, rob.timeRule, !!rob.repeatable, rob.confirm, pv(armed(), 'store.rob').repeatable], ['crime', 'robbery', false, 'crime.rob.confirm.store', false],
    'the row: crime, the robbery time rule, a confirm, never repeatable');
  T.eq(pv(fresh({ clock: { min: 600 } }), 'store.rob').reason, 'reason.needItem', 'no gun: refused');
  T.eq(pv(fresh({ items: { gun: 1, ammo: 9 }, clock: { min: 600 } }), 'store.rob').reason, 'reason.needItems', 'a gun and 9 ammo: refused (needs ≥ 10)');
  T.eq(pv(armed({ items: { ammo: 10 } }), 'store.rob').ok, true, 'a gun and 10 ammo at 20:30: allowed');
  T.eq(pv(armed({ clock: { min: ROB.start - 1 } }), 'store.rob').ok, true, 'at 20:59: still allowed (now < 21:00)');
  T.eq(pv(armed({ clock: { min: ROB.start } }), 'store.rob').reason, 'reason.robLate', 'at 21:00: refused ("Too late")');
  T.eq(SR.text('reason.robLate', { time: '21:00' }), 'Too late: heists start before 21:00', 'the reason reads "Too late: heists start before 21:00"');

  T.section('the robbery: the start and the resolve (B-11b)');
  const used = new Set();
  let okStarts = 0;
  for (let i = 0; i < 300; i++) {
    const s = armed();
    const r = run(s, 'store.rob', {}, { rng: SR.rng.create(1000 + i), source: 'sim' });
    used.add(20 - s.items.ammo);
    if (r.ok && s.clock.min === ROB.clock && s.stats.karma === ROB.karma && s.stats.heat === ROB.heat && r.open && r.open.skin === 'holdup' &&
      r.open.resolve === 'store.rob:resolve' && r.open.params.D === ROB.D && r.open.params.stake === true) okStarts++;
  }
  T.eq(okStarts, 300, 'every start sends the clock to 24:00, costs -10 karma and +30 Heat, and opens the Hold-up (D 60 + Heat before it)');
  T.eq(Array.from(used).sort(), [5, 6, 7, 8, 9], 'it uses rand(5..9) ammo (orig)');
  const hot = armed({ stats: { heat: 40 } });
  T.eq(run(hot, 'store.rob').open.params.D, ROB.D + 40, 'D per beat = 60 + Heat');
  const loots = new Set();
  for (let i = 0; i < 400; i++) {
    const s = armed();
    run(s, 'store.rob');
    const c0 = s.money.cash;
    const r = run(s, 'store.rob:resolve', { beats: [true, true], wins: 2, losses: 0 }, { rng: SR.rng.create(5000 + i), source: 'sim' });
    if (!r.ok) continue;
    loots.add(s.money.cash - c0);
  }
  const lootList = Array.from(loots);
  T.ok(Math.min.apply(null, lootList) >= ROB.loot[0] && Math.max.apply(null, lootList) <= ROB.loot[1] && lootList.length > 250, 'two successes pay $100 + rand(0..499)', [Math.min.apply(null, lootList), Math.max.apply(null, lootList)]);
  const win = armed();
  run(win, 'store.rob');
  const rw = run(win, 'store.rob:resolve', { beats: [true, false, true], wins: 2, losses: 1 });
  T.eq([rw.ok, win.stats.karma, win.jail, rw.log.some((l) => l.kind === 'storeRobbery'), rw.toasts.map((x) => x.key)],
    [true, ROB.karma, null, true, ['toast.crime.storeWin', 'bark.dee.robWin']], 'a win: -10 karma in all, no jail, the log entry, Dee\'s reaction');
  T.eq(run(win, 'store.rob:resolve', { beats: [true, true], wins: 2 }).reason, 'reason.notNow', 'a second resolve pays nothing (notNow)');
  const lose = armed();
  run(lose, 'store.rob');
  const rl = run(lose, 'store.rob:resolve', { beats: [false, false], wins: 0, losses: 2 });
  T.eq([rl.ok, rl.jailed, lose.stats.karma, rl.toasts.map((x) => x.key)],
    [true, { reason: 'store', days: ROB.jail + Math.floor(ROB.heat / 25) }, ROB.karma, ['toast.crime.storeLose', 'bark.dee.robLose']], 'a loss: jail for 3 + floor(Heat / 25) days, -10 karma in all');
  // A result whose `wins` and `beats` disagree (a forced or hand-made result): Dee's line follows the
  // outcome the rules applied (crime.robResolve reads `wins` first), never her own count.
  const odd1 = armed();
  run(odd1, 'store.rob');
  const ro1 = run(odd1, 'store.rob:resolve', { beats: [true], wins: 2, losses: 0 });
  const odd2 = armed();
  run(odd2, 'store.rob');
  const ro2 = run(odd2, 'store.rob:resolve', { beats: [true, true, false], wins: 1 });
  T.eq([!odd1.jail, ro1.toasts.map((x) => x.key), !odd2.jail, ro2.toasts.map((x) => x.key)],
    [true, ['toast.crime.storeWin', 'bark.dee.robWin'], false, ['toast.crime.storeLose', 'bark.dee.robLose']], 'Dee reacts to the outcome that was applied (loot or the cell), whatever the result echoes');
  // A one-night sentence (a tuning where the arrest night already frees you) is still a loss to Dee.
  const JB = SR.tuning.crime.jail.bases, base0 = JB.store;
  JB.store = 0;
  const short = armed({ perks: { owned: ['charmingRogue'] } });
  flags(['perks']);
  run(short, 'store.rob');
  const rshort = run(short, 'store.rob:resolve', { beats: [false, false], wins: 0, losses: 2 });
  JB.store = base0;
  flags([]);
  T.eq([rshort.jailed && rshort.jailed.days, short.jail, rshort.toasts.map((x) => x.key).indexOf('bark.dee.robLose') >= 0], [1, null, true], 'released after the arrest night: Dee still reacts to a loss');
  const hard = armed({ mode: { difficulty: 'hardcore' } });
  run(hard, 'store.rob');
  T.eq(run(hard, 'store.rob:resolve', { beats: [false, false], wins: 0 }).jailed.days, ROB.jailHardcore + 1, 'Hardcore: base 5 (orig)');

  T.section('the Hold-up skin and its Auto (real rolls; B-11b, B-30)');
  const sk = SR.reg.skin.holdup;
  T.eq([sk.engine, sk.stake, SR.text.has(sk.text.title)], ['duel', true, true], 'the holdup skin: Duel engine, stake-bearing');
  const ps = sk.params(fresh(), { target: 'store' }), pb = sk.params(fresh(), { target: 'bank' });
  T.eq([ps.opponent.portrait, pb.opponent.portrait, ps.situations.length, ps.situations.concat(pb.situations).every((k) => SR.text.has(k)), SR.text(pb.opponent.name)], ['dee', 'penny', 3, true, 'Penny Wise, the teller'],
    'Dee at the store, Penny at the bank\'s window; three situations each, all written');
  T.ok(['intimidate', 'sweetTalk', 'outwit'].every((k) => SR.text.has('mg.holdup.' + k)), 'the three options are labelled (W1-C 10)');
  const one = armed({ stats: { cha: 100 } });
  const open = run(one, 'store.rob').open;
  const a1 = SR.minigame.auto('holdup', open.params, SR.rng.create(77), one);
  const a2 = SR.minigame.auto('holdup', open.params, SR.rng.create(77), one);
  T.eq([a1.auto, a1.picks.every((p) => p === 'sweetTalk'), a1.beats.length >= 2 && a1.beats.length <= 3, JSON.stringify(a1) === JSON.stringify(a2)], [true, true, true, true],
    'Auto picks the best shown odds (Sweet-talk at CHA 100) every beat, stops once decided, and replays the same with the same seed');
  const mc = (cha, n) => {
    const s = armed({ stats: { cha, str: 1, int: 1 } });
    const params = SR.rules.crime.holdupParams(s, 'store');
    const rng = SR.rng.create(cha * 31 + 7);
    let w = 0;
    for (let i = 0; i < n; i++) if (SR.minigame.auto('holdup', params, rng, s).wins >= 2) w++;
    return w / n;
  };
  [[50, 0.43], [100, 0.68], [300, 0.93]].forEach(([cha, ref]) => {
    const p = SR.rules.check.chance(cha, ROB.D, {}), want = bestOf3(p), got = mc(cha, 20000);
    T.ok(Math.abs(got - want) < 0.02 && Math.abs(want - ref) < 0.01, 'CHA ' + cha + ': Auto wins ' + (got * 100).toFixed(1) + ' % (analytic ' + (want * 100).toFixed(1) + ' %, B-11b ' + ref * 100 + ' %)');
  });
  const autoWin = armed({ stats: { cha: 300 } });
  run(autoWin, 'store.rob');
  const ar = SR.minigame.auto('holdup', SR.rules.crime.holdupParams(autoWin, 'store'), SR.rng.create(3), autoWin);
  const c1 = autoWin.money.cash;
  const rr = run(autoWin, 'store.rob:resolve', ar);
  T.ok(rr.ok && (ar.wins >= 2 ? autoWin.money.cash > c1 && !autoWin.jail : !!autoWin.jail), 'an Auto round resolves the robbery by its sampled beats');
  flags([]);
  const relaxed = armed({ mode: { difficulty: 'relaxed' }, stats: { cha: 100 } });
  T.ok(Math.abs(SR.rules.crime.holdupParams(relaxed, 'store').chances.cha - (SR.rules.check.chance(100, 60, {}) + 0.10)) < 1e-9, 'Relaxed adds +0.10 to the Hold-up beats (B-28b)');

  T.section('P1: The Daily Fold (stockTips), gum and scratch cards (shopsPlus)');
  flags(['stockTips', 'shopsPlus']);
  const pp = fresh({ stats: { hp: 1 } });
  const p0 = SR.util.clone(pp);
  const rp = run(pp, 'store.paper');
  T.eq([rp.ok, p0.money.cash - pp.money.cash, pp.clock.min - p0.clock.min, pp.stats.int - p0.stats.int, pp.daily.forecastSeen], [true, PAPER.price, PAPER.min, PAPER.int, true],
    'The Daily Fold: $2, 30 m, +1 INT, and the forecast is seen');
  T.eq(pv(pp, 'store.paper').reason, 'reason.dailyLimit', 'once a day');
  const tipS = fresh({ tip: { day: 1, ticker: 'MCS', dir: 'up', truthful: true, reliability: 0.6, revealed: { tv: false, paper: false, market: false, mingle: false, harold: false } } });
  const rtip = run(tipS, 'store.paper');
  const tipToast = rtip.toasts.find((x) => x.key === 'toast.stocks.tip');
  T.eq([tipS.tip.revealed.paper, !!tipToast, tipToast && tipToast.vars.ticker, tipToast && SR.text(tipToast.key, tipToast.vars)], [true, true, 'MCS', 'Today\'s tip: MCS ▲ (60 % reliable)'],
    'it reveals today\'s stock tip and names it in a toast');
  const tipTv = fresh({ tip: { day: 1, ticker: 'NLI', dir: 'down', truthful: true, reliability: 0.6, revealed: { tv: true, paper: false, market: false, mingle: false, harold: false } } });
  const rtv = run(tipTv, 'store.paper');
  T.eq([tipTv.tip.revealed.paper, rtv.toasts.some((x) => x.key === 'toast.stocks.tip')], [true, false], 'a tip already seen on TV is marked as read in the paper without a second tip toast');
  Object.keys(P1_GOODS).forEach((g) => {
    const [price, min, stack] = P1_GOODS[g];
    const s = fresh();
    const p = pv(s, 'store.' + g);
    T.eq([p.ok, p.cost.cash, p.cost.min, p.repeatable], [true, price, min, true], g + ': $' + price + ', ' + min + ' m, repeatable');
    T.eq(pv(fresh({ items: { [g]: stack } }), 'store.' + g).reason, 'reason.stackFull', g + ': at most ' + stack);
  });
  const sc = fresh();
  T.eq(pv(sc, 'store.scratchPlay').reason, 'reason.needItem', 'scratching needs a card');
  run(sc, 'store.scratch');
  const c2 = sc.money.cash;
  const rs = run(sc, 'store.scratchPlay');
  T.eq([rs.ok, sc.items.scratch, rs.open && rs.open.minigame, rs.open && rs.open.resolve, typeof (rs.open && rs.open.params.pay)], [true, 0, 'scratch', 'store.scratchPlay:resolve', 'number'],
    'scratching uses the card and opens the scratch engine with the prize already drawn');
  T.eq(sc.money.cash, c2, 'nothing is paid before the reveal (the start\'s feedback cannot spoil it)');
  const res = SR.minigame.auto('scratch', rs.open.params, SR.rng.create(1), sc);
  T.eq([res.net, res.auto], [rs.open.params.pay - SCRATCH_PRICE, true], 'the engine\'s Auto reveals the drawn prize: { net: prize - $5 }');
  const rr2 = run(sc, 'store.scratchPlay:resolve', res);
  T.eq([rr2.ok, sc.money.cash - c2, rr2.toasts.map((x) => x.key)], [true, rs.open.params.pay, [res.net + SCRATCH_PRICE > 0 ? 'toast.store.scratchWin' : 'toast.store.scratchLose']],
    'the resolve pays the drawn prize and Dee reads the card out');
  T.eq(run(sc, 'store.scratchPlay:resolve', res).reason, 'reason.notNow', 'a second resolve pays nothing');
  let paidWins = 0;
  for (let i = 0; i < 400 && !paidWins; i++) {
    const w = fresh({ items: { scratch: 1 } });
    const st = run(w, 'store.scratchPlay', {}, { rng: SR.rng.create(9000 + i), source: 'sim' });
    if (st.open.params.pay > 0) { const c3 = w.money.cash; run(w, 'store.scratchPlay:resolve', { net: st.open.params.pay - SCRATCH_PRICE }); paidWins = w.money.cash - c3 === st.open.params.pay ? 1 : -1; }
  }
  T.eq(paidWins, 1, 'a winning card pays its prize at the reveal');
  // Dee reads the drawn card, not the engine's echo: a winning card resolved with a losing { net }
  // (a forced result) is still paid, and her line says so.
  let deeCard = null;
  for (let i = 0; i < 400 && !deeCard; i++) {
    const w = fresh({ items: { scratch: 1 } });
    const st = run(w, 'store.scratchPlay', {}, { rng: SR.rng.create(9500 + i), source: 'sim' });
    if (st.open.params.pay > 0) {
      const c4 = w.money.cash;
      const rd = run(w, 'store.scratchPlay:resolve', { net: -SCRATCH_PRICE });
      deeCard = { paid: w.money.cash - c4, pay: st.open.params.pay, toasts: rd.toasts.filter((x) => /^toast\.store\./.test(x.key)).map((x) => [x.key, x.vars.money]) };
    }
  }
  T.eq(deeCard && [deeCard.paid, deeCard.toasts], deeCard && [deeCard.pay, [['toast.store.scratchWin', SR.text.money(deeCard.pay)]]], 'Dee\'s line follows the drawn card, whatever the engine echoes', deeCard);
  const E = SR.reg.minigame.scratch;
  const prizes = SR.tuning.casino.scratch.prizes.map((p) => p.pay);
  T.eq([['big', 'mid', 'small', 'cloud'].map((k) => E.payOfSymbol(k)), E.tierOf(SCRATCH_PRIZES[0])], [SCRATCH_PRIZES.concat([0]), 3],
    'the prize symbols stand for B-14e\'s $10,000, $100 and $10 (read from the tuning: ' + prizes.join(', ') + ')');
  const fx = SR.rng.create(11);
  let threeAlike = 0;
  for (let i = 0; i < 5000; i++) { const sy = E.symbols({ pay: 0, tier: 0 }, fx, 3); if (sy[0] === sy[1] && sy[1] === sy[2]) threeAlike++; }
  T.eq([threeAlike, E.symbols({ pay: 10000, tier: 3 }, fx, 3), E.symbols({ pay: 100, tier: 2 }, fx, 3), E.symbols({ pay: 10, tier: 1 }, fx, 3)],
    [0, ['big', 'big', 'big'], ['mid', 'mid', 'mid'], ['small', 'small', 'small']], 'a winning card shows its prize three times; a losing card never matches three');
  const rng = SR.rng.create(123);
  let wins = 0, sum = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) { const r = SR.minigame.auto('scratch', {}, rng, sc); if (r.net > -SCRATCH_PRICE) wins++; sum += r.net; }
  T.ok(Math.abs(wins / N - 0.1101) < 0.004, 'without a drawn prize Auto samples one: ' + (wins / N * 100).toFixed(2) + ' % of cards win (B-14e: 11.01 %)');
  flags([]);

  T.section('Dee\'s greetings');
  const g = SR.reg.fn['greet.store'];
  const cases = [
    [fresh(), 'first'], [fresh({ clock: { day: 2, min: 600 } }), 'morning'], [fresh({ clock: { day: 2, min: 1350 } }), 'late'],
    [fresh({ clock: { day: 2, min: 900 } }), 'default'], [fresh({ clock: { day: 2 }, stats: { heat: 60 } }), 'hot'],
    [fresh({ items: { gun: 1, ammo: 10 } }), 'armed'], [fresh({ records: { robberies: 1 }, stats: { heat: 20 } }), 'robbed'],
    [fresh({ records: { robberies: 1 } }), 'forgiven'], [fresh({ clock: { day: 2 }, stats: { karma: 70 } }), 'good'], [fresh({ clock: { day: 2 }, stats: { karma: -70 } }), 'bad'],
  ];
  T.eq(cases.map((c) => g(c[0]).key), cases.map((c) => 'greet.store.' + c[1]), 'the greeting follows first visit, time, Heat, a loaded gun, past robberies and karma');
  T.eq([g(fresh({ clock: { day: 2, min: 900 }, stats: { heat: POSTERS_HEAT - 1 } })).key, g(fresh({ clock: { day: 2, min: 900 }, stats: { heat: POSTERS_HEAT } })).key],
    ['greet.store.default', 'greet.store.hot'], 'Dee hears sirens from Heat ' + POSTERS_HEAT + ' (the wanted posters\' threshold, tuning.crime.police.posters)');
  T.ok(cases.every((c) => SR.text.has('greet.store.' + c[1])), 'every greeting is written');
  const wet = fresh({ clock: { day: 2, min: 900 }, world: { weather: 'rain' } });
  T.eq(g(wet).key, 'greet.store.default', 'rain is not mentioned while the weather flag is off (P0 is always Clear)');
  flags(['weather']);
  T.eq([g(wet).key, SR.text.has('greet.store.rain')], ['greet.store.rain', true], '... and is with it (P1 weather)');
  flags([]);
}

async function game() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ width: 1280, height: 720, fast: true });
  const E = (fn, arg) => t.page.evaluate(fn, arg);
  const rows = () => E(() => SR.ui.card.rows());
  await t.newGame({ seed: 11 });
  await t.set({ stats: { hp: 5 }, clock: { day: 2, min: 900 }, money: { cash: 300 } });

  T.section('the card');
  await t.enter('store');
  await t.step(2);
  T.eq([await t.scenes(), (await E(() => SR.ui.building.info())).interior], [['building'], true], 'Five-O opens with its registered interior');
  let rs = await rows();
  T.eq(rs.map((r) => r.id), ['store.slushee', 'store.candybar', 'store.nachos', 'store.smokes', 'store.pills', 'store.rob'], 'rows in card order');
  const robRow = rs.find((r) => r.id === 'store.rob');
  T.eq([robRow.enabled, robRow.repeatable], [false, false], 'Rob the place: shown, disabled without a gun, never repeatable');
  T.ok(/gun/i.test(robRow.reason || ''), 'its reason names the gun', robRow.reason);
  // The window's sky tweens 1.5 s of loop time after a clock jump (W1-G); SR.loop.step(n) renders
  // once, after its n steps, so one render notices the jump and the next one lands on the new hour.
  await t.step(1);
  await t.step(100);
  await t.shot(path.join(SHOTS, 'store-day.png'));

  T.section('snacks and goods by click and R');
  let s0 = await t.state();
  await t.clickUI('row-store.nachos');
  await t.step(2);
  let s1 = await t.state();
  T.eq([s1.stats.hp - s0.stats.hp, s0.money.cash - s1.money.cash, s1.clock.min - s0.clock.min], [7, 4, 30], 'Nachos by click: +7 HP, -$4, 30 m');
  await t.clickUI('row-store.smokes');
  await t.step(2);
  await t.press('repeat');
  await t.step(2);
  s1 = await t.state();
  T.eq(s1.items.smokes, 2, 'Smokes by click, then R buys another pack');

  T.section('the robbery through the UI (Auto)');
  await t.set({ items: { gun: 1, ammo: 20 }, clock: { min: 1230 }, stats: { cha: 150 } });
  await t.press('back');
  await t.step(2);
  await t.enter('store');
  await t.step(2);
  rs = await rows();
  T.eq(rs.find((r) => r.id === 'store.rob').enabled, true, 'armed at 20:30: the row is enabled');
  const greet = await E(() => document.querySelector('[data-id="card-greeting"]').textContent);
  T.ok(greet.length > 10 && greet.indexOf('⟦') < 0, 'Dee notices the gun', greet);
  s0 = await t.state();
  await E(() => SR.ui.focus.focus(document.querySelector('#ui [data-id="row-store.rob"]')));
  await t.page.keyboard.down('Enter');
  await t.step(90);
  await t.page.keyboard.up('Enter');
  T.eq([(await t.scenes()).filter((x) => x === 'confirm').length, (await t.state()).clock.min, await E(() => SR.ui.card.repeating())], [1, 1230, false],
    'holding Enter on Rob the place asks once and never repeats (a confirm row)');
  await t.clickUI('confirm-row-no');
  await t.step(2);
  T.eq(await t.scenes(), ['building'], 'Cancel: back to the card, nothing happened');
  await t.clickUI('row-store.rob');
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'a click asks first');
  await t.clickUI('confirm-row-yes');
  await t.step(3);
  T.eq((await t.scenes()).slice(-1)[0], 'minigame', 'the Hold-up opens');
  s1 = await t.state();
  T.eq([s1.clock.min, s1.stats.karma - s0.stats.karma, s1.stats.heat - s0.stats.heat, s0.items.ammo - s1.items.ammo >= 5 && s0.items.ammo - s1.items.ammo <= 9],
    [1440, -10, 30, true], 'the start: 24:00, -10 karma, +30 Heat, 5-9 ammo');
  const frame = await E(() => ({ title: document.querySelector('[data-id="mg-title"]').textContent, opts: Array.from(document.querySelectorAll('[data-id^="mg-duel-opt-"]')).map((b) => b.textContent) }));
  T.ok(/Hold-up/.test(frame.title) && frame.opts.length === 3 && /Intimidate/.test(frame.opts[0]) && /Sweet-talk/.test(frame.opts[1]) && /Outwit/.test(frame.opts[2]), 'Hold-up: Intimidate, Sweet-talk, Outwit with their odds', frame);
  await t.shot(path.join(SHOTS, 'holdup-store.png'));
  await t.clickUI('mg-duel-opt-2');
  await t.step(10);
  await t.shot(path.join(SHOTS, 'holdup-store-beat.png'));
  await t.clickUI('mg-auto');
  await t.step(5);
  const after = await t.state();
  T.ok((await t.scenes()).indexOf('minigame') < 0, 'Auto finishes the round and the frame closes');
  const won = !after.jail;
  T.ok(won ? after.money.cash - s1.money.cash >= 100 && after.money.cash - s1.money.cash <= 599 : after.jail.reason === 'store',
    'Auto rolled the beats: ' + (won ? 'a clean getaway with $' + (after.money.cash - s1.money.cash) : 'jail for ' + after.jail.daysLeft + ' days'));

  T.section('a forced win and a forced loss');
  await t.newGame({ seed: 12 });
  await t.set({ items: { gun: 1, ammo: 30 }, clock: { day: 3, min: 1200 }, money: { cash: 50 } });
  await t.enter('store');
  await t.step(2);
  await t.mg({ beats: [true, true], wins: 2, losses: 0, picks: ['sweetTalk', 'sweetTalk'] });
  await t.clickUI('row-store.rob');
  await t.step(1);
  await t.clickUI('confirm-row-yes');
  await t.step(3);
  s1 = await t.state();
  T.ok(s1.money.cash >= 150 && s1.money.cash <= 649 && !s1.jail && s1.records.robberies === 1, 'two successes: $100-$599 in cash, no jail', s1.money.cash);
  const toasts = await E(() => SR.ui.toast.list().map((x) => x.text || x.key));
  T.ok(toasts.some((x) => /gum/i.test(String(x))), 'Dee reacts', toasts);
  await t.newGame({ seed: 13 });
  await t.set({ items: { gun: 1, ammo: 30 }, clock: { day: 3, min: 1200 } });
  await t.enter('store');
  await t.step(2);
  await t.mg({ beats: [false, false], wins: 0, losses: 2, picks: ['outwit', 'outwit'] });
  await t.clickUI('row-store.rob');
  await t.step(1);
  await t.clickUI('confirm-row-yes');
  await t.step(3);
  s1 = await t.state();
  T.eq([s1.jail && s1.jail.reason, s1.stats.karma], ['store', -10], 'two failures: jail, and the -10 karma stands');

  T.section('the Hold-up at the bank (the skin W2-Money plays)');
  await t.newGame({ seed: 14 });
  await E(() => SR.ui.toast.clear());   // the store robbery's toasts would cover the frame in the screenshot
  await t.set({ items: { gun: 1, ammo: 20 }, stats: { str: 120 }, clock: { day: 2, min: 900 } });
  await E(() => { window.__hb = null; const p = SR.rules.crime.holdupParams(SR.state, 'bank'); SR.minigame.run('holdup', Object.assign({ skin: 'holdup' }, p)).then((r) => { window.__hb = r; }); });
  await t.step(3);
  const bank = await E(() => ({ sit: (document.querySelector('[data-id="mg-duel-situation"]') || {}).textContent || '', opts: document.querySelectorAll('[data-id^="mg-duel-opt-"]').length }));
  T.ok(/teller/i.test(bank.sit) && bank.opts === 3, 'the bank\'s teller and her situation lines, three options', bank);
  await t.press('opt1');
  await t.step(5);
  await t.shot(path.join(SHOTS, 'holdup-bank.png'));
  await t.clickUI('mg-auto');
  await t.step(200);
  const hb = await E(() => window.__hb);
  T.ok(hb && hb.beats.length >= 2 && hb.beats.length <= 3 && (hb.wins >= 2 || hb.losses >= 2), 'Auto finishes the bank Hold-up with real rolls', hb);

  T.section('P1: the scratch card frame (shopsPlus)');
  await t.newGame({ seed: 21 });
  await E(() => SR.ui.toast.clear());
  await t.debug('feature', 'shopsPlus', true);
  await t.set({ clock: { day: 2, min: 600 } });
  await t.enter('store');
  await t.step(2);
  await t.clickUI('row-store.scratch');
  await t.step(2);
  s0 = await t.state();
  await E(() => { window.__scratchDone = []; SR.events.on('action:done', (p) => { if (p.id === 'store.scratchPlay:resolve' && p.result.ok) window.__scratchDone.push(p.result.toasts.map((x) => x.key)); }); });
  await t.clickUI('row-store.scratchPlay');
  await t.step(3);
  T.eq((await t.scenes()).slice(-1)[0], 'minigame', 'Scratch a card opens the scratch frame');
  const pk = await E(() => SR.minigame.current().inst.peek());
  T.eq([pk.left, pk.symbols.length], [3, 3], 'three covered panels');
  await t.shot(path.join(SHOTS, 'scratch-covered.png'));
  // drag across the first panel with the mouse
  const box = await t.page.locator('[data-id="mg-canvas"]').boundingBox();
  const p0 = pk.panels[0];
  const toPx = (x, y) => [box.x + x * box.width / 1280, box.y + y * box.height / 576];
  await t.page.mouse.move(...toPx(p0.x + 10, p0.y + 20));
  await t.page.mouse.down();
  for (let row = 0; row < 7; row++) for (let k = 0; k <= 10; k++) await t.page.mouse.move(...toPx(p0.x + (row % 2 ? 200 - k * 20 : k * 20), p0.y + 15 + row * 30));
  await t.page.mouse.up();
  await t.step(1);
  const pk2 = await E(() => SR.minigame.current().inst.peek());
  T.eq(pk2.revealed[0], true, 'dragging across a panel scratches it off');
  await t.press('scratch');
  await t.step(1);
  await t.shot(path.join(SHOTS, 'scratch-scratched.png'));
  await t.press('scratch');
  await t.step(1);
  const pk3 = await E(() => SR.minigame.current() && SR.minigame.current().inst.peek());
  T.ok(!pk3 || pk3.done, 'Space scratches the rest');
  await t.step(120);
  T.ok((await t.scenes()).indexOf('minigame') < 0, 'the card closes after the reveal');
  s1 = await t.state();
  T.eq(s1.items.scratch, 0, 'the card was used');
  const deeLine = await E(() => window.__scratchDone.map((keys) => keys.filter((k) => /^toast\.store\.scratch/.test(k))).reduce((a, b) => a.concat(b), []));
  T.eq([s1.money.cash - s0.money.cash, s1.casino.card, deeLine], [pk.pay, null, [pk.pay > 0 ? 'toast.store.scratchWin' : 'toast.store.scratchLose']],
    'the reveal pays the drawn prize ($' + pk.pay + '), closes the card, and Dee reads it out');
  await E(() => { window.__sj = null; SR.minigame.run('scratch', { skin: 'scratch', roll: 1, pay: 10000, panels: 3 }).then((r) => { window.__sj = r; }); });
  await t.step(3);
  for (let k = 0; k < 3; k++) { await t.press('scratch'); await t.step(1); }
  const jack = await E(() => ({ panels: (document.querySelector('[data-id="mg-label-panels"]') || {}).textContent || '', peek: SR.minigame.current().inst.peek() }));
  T.ok(jack.peek.tier === 3 && jack.peek.symbols.every((x) => x === 'big') && (jack.panels.match(/\$10,000/g) || []).length === 3,
    'a $10,000 card (no tier given): three top-prize symbols labelled with the tuning\'s amount, and the jackpot tier', jack.panels);
  await t.step(200);
  T.eq(await E(() => window.__sj), { net: 10000 - SCRATCH_PRICE }, 'its result: { net: prize - $5 }');

  T.section('the interior draws from palette keys; the night');
  const draw = await E(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const r = SR.art.interior('store', {});
    try {
      r.drawStatic(ctx, null); r.drawAnim(ctx, 0.5, null, {});
      r.drawStatic(ctx, SR.state); r.drawAnim(ctx, 3.3, SR.state, { owner: { pose: 'react-shock' }, you: { pose: 'happy' } });
      return null;
    } catch (e) { return e.message; }
  });
  T.eq(draw, null, 'drawStatic / drawAnim with no state and the live state');
  await t.newGame({ seed: 22 });
  await t.debug('feature', 'shopsPlus', false);
  await E(() => SR.ui.toast.clear());
  await t.set({ clock: { day: 2, min: 1320 }, records: { robberies: 1 }, stats: { heat: 20 }, items: { gun: 1, ammo: 20 } });
  await t.enter('store');
  // The window's sky tweens 1.5 s of loop time after a clock jump (W1-G); SR.loop.step(n) renders
  // once, after its n steps, so one render notices the jump and the next one lands on the new hour.
  await t.step(1);
  await t.step(100);
  await t.shot(path.join(SHOTS, 'store-night.png'));
  rs = await rows();
  T.ok(/21:00/.test(rs.find((r) => r.id === 'store.rob').reason || ''), 'at 22:00 the robbery is refused: "Too late: heists start before 21:00"', rs.find((r) => r.id === 'store.rob').reason);
  const warns = (await t.warnings()).filter((x) => /interior|prop|palette|store|holdup|scratch|⟦/i.test(x));
  T.eq(warns, [], 'no warnings about props, palette keys or missing Five-O text');
  T.eq(await t.errors(), [], 'zero console errors');
  await t.close();
}

(async () => {
  rules();
  await game();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
