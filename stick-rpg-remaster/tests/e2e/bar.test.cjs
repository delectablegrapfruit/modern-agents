// tests/e2e/bar.test.cjs — owner: W2-Night. Sticky's on the real index.html (BUILD_PLAN §4.8; GDD
// §6.1, §4.2, §4.12, §4.13; BALANCE B-03 beer, B-06 booze, B-13, B-14f, B-28a; UI §5.6):
//   the card's rows and groups (the Ring hidden while `nightlife` is off); Drink a beer ($20, 60 m,
//   CHA +2 through the training rules, Buzz +1, repeatable with R) and the B-28a prices (Friday, the
//   Regular perk, Beer Subsidy: the $10 example); Sticky's cut-off at Buzz 5; Buy a bottle ($30, no
//   time, the booze stack of 999); the fight and darts rows open their engines; the greetings (the
//   champion, the gossip, the cut-off); the Underground Ring bout (P1) pays its purse; the interior
//   by day and night with the ladder board; zero console errors.
// Screenshots: shots/W2-Night/bar-*.png.   node tests/e2e/bar.test.cjs
'use strict';
const K = require('./night-kit.cjs');

(async () => {
  const T = K.h.suite('e2e bar');
  const k = await K.open({});
  const { t, E } = k;

  async function atBar(opts, patch, min) {
    await t.newGame(Object.assign({ seed: 777 }, opts || {}));
    await t.setTime(min === undefined ? 18 * 60 : min);
    if (patch) await t.set(patch);
    await t.enter('bar');
    await t.step(2);
    await k.quiet();
    await k.clearLogs();
  }
  const rowsOf = async () => (await t.ui()).rows;
  const rowOf = async (id) => (await rowsOf()).filter((r) => r.action === id)[0];

  // ------------------------------------------------------------------------------------------
  T.section('the card (GDD §6.1: P0 rows)');
  await atBar();
  let rows = await rowsOf();
  T.eq(rows.map((r) => r.action), ['bar.bottle', 'bar.beer', 'bar.darts', 'bar.fight'], 'Buy · Train · Special: a bottle, a beer, darts practice, a bar fight');
  T.ok(rows.every((r) => r.enabled), 'all enabled at 18:00 with $100');
  const info = await E(() => SR.ui.building.info());
  T.ok(info && info.id === 'bar' && info.interior, 'the building scene draws the bar interior (SR.art.interior)');
  await t.step(40);
  T.eq(await k.audit('#ui'), [], 'the Sticky\'s card passes the a11y audit');
  const card = await t.uiText();
  T.ok(/Sticky/i.test(card), 'the card is Sticky\'s', card.slice(0, 80));

  // ------------------------------------------------------------------------------------------
  T.section('Drink a beer (B-03 beer): $20, 60 m, CHA +2, Buzz +1');
  let pv = await t.preview('bar.beer');
  T.eq([pv.ok, pv.cost.cash, pv.cost.min, pv.repeatable], [true, 20, 60, true], '$20 and 1 h; repeatable');
  T.ok(pv.gains.some((g) => g.kind === 'stat' && g.key === 'cha' && g.n === 2) && pv.gains.some((g) => g.kind === 'buzz' && g.n === 1), 'the row shows CHA +2 and Buzz +1');
  let s0 = await k.state();
  await k.row('bar.beer');
  let s1 = await k.state();
  T.eq([s1.money.cash - s0.money.cash, s1.clock.min - s0.clock.min, s1.stats.cha - s0.stats.cha, s1.stats.buzz - s0.stats.buzz], [-20, 60, 2, 1],
    'one beer: -$20, +60 m, CHA +2, Buzz +1');
  const ev = (await k.acted()).filter((a) => a.id === 'bar.beer')[0];
  T.ok(ev && ev.events.some((e) => e.name === 'train' && e.payload.id === 'beer') && ev.events.some((e) => e.name === 'buy' && e.payload.price === 20),
    'the train and buy rule events (the price paid)', ev && ev.events);
  // The first press may only skip the CHA stamp (a stamp swallows the press that skips it, UI §4.3).
  for (let i = 0; i < 3 && (await k.state()).stats.buzz < 2; i++) { await k.quiet(); await t.key('KeyR'); await t.step(2); }
  T.eq((await k.state()).stats.buzz, 2, 'R repeats the beer (a repeatable row)');

  T.section('B-28a: Friday $15, the Regular perk $15, Beer Subsidy $10 (the example: min(20, 15, 15, 10))');
  await E(() => SR.debug.feature('calendar', true));
  await atBar({}, null, 18 * 60);
  await t.setDay(5);   // day 5 is a Friday (day 1 Monday)
  await t.step(1);
  pv = await t.preview('bar.beer');
  T.eq(pv.cost.cash, 15, 'Friday: $15 (P1 `calendar`)');
  await t.set({ perks: { owned: ['regular'] }, election: { decrees: ['beerSubsidy'] } });
  pv = await t.preview('bar.beer');
  T.eq(pv.cost.cash, 10, 'Friday + Regular + Beer Subsidy: $10 (B-28a example)');
  await E(() => SR.debug.feature('calendar', false));

  T.section('Sticky cuts you off at Buzz 5');
  await atBar({}, { stats: { buzz: 4 } });
  await k.row('bar.beer');
  const beer = await rowOf('bar.beer');
  T.eq([(await k.state()).stats.buzz, beer.enabled], [5, false], 'at Buzz 5 the beer row is disabled');
  const reason = await E(() => SR.text('reason.tooBuzzed'));
  T.ok(beer.text.indexOf(reason) >= 0 || (await t.uiText()).indexOf(reason) >= 0, 'with the reason "' + reason + '"');
  const g5 = await E(() => SR.reg.fn['greet.bar'](SR.state, {}, { rng: SR.rng.create(1) }).key);
  T.eq(g5, 'greet.bar.buzzed', 'Sticky\'s greeting notices (greet.bar)');

  // ------------------------------------------------------------------------------------------
  T.section('Buy a bottle to go (B-06 booze): $30, no time, stack 999');
  await atBar({}, { money: { cash: 1000 } });
  s0 = await k.state();
  await k.row('bar.bottle');
  s1 = await k.state();
  T.eq([s1.money.cash - s0.money.cash, s1.clock.min - s0.clock.min, s1.items.booze - s0.items.booze], [-30, 0, 1], 'a bottle: -$30, no time, +1 booze');
  await t.set({ items: { booze: 999 } });
  await E(() => SR.ui.card.refresh());
  const bottle = await rowOf('bar.bottle');
  pv = await t.preview('bar.bottle');
  T.eq([bottle.enabled, pv.reason], [false, 'reason.stackFull'], 'at 999 bottles the row is refused: can\'t carry more');

  // ------------------------------------------------------------------------------------------
  T.section('the fight and darts rows open their engines');
  await atBar();
  await k.row('bar.darts');
  T.eq((await k.cur()).id, 'darts', 'Darts practice opens the darts engine');
  await t.clickUI('mg-exit');
  await k.closed();
  await k.quiet();
  await k.row('bar.fight');
  T.eq((await k.cur()).id, 'fight', 'Start a bar fight opens the fight engine');
  await t.clickUI('mg-exit');
  await t.step(1);
  await t.key('Digit2');
  await k.closed();
  await t.setTime(21 * 60);
  pv = await t.preview('bar.fight');
  T.ok(pv.ok && pv.cost.min === 180, 'a bar fight takes 3 h: at 21:00 it still ends by 24:00');
  await t.setTime(21 * 60 + 30);
  pv = await t.preview('bar.fight');
  T.eq([pv.ok, pv.reason], [false, 'reason.tooLate'], 'at 21:30 it would end after midnight ("Ends after midnight")');

  // ------------------------------------------------------------------------------------------
  T.section('greetings (UI §5.6; the champion, the gossip)');
  const greets = await E(() => {
    const g = SR.reg.fn['greet.bar'], s = JSON.parse(JSON.stringify(SR.state)), out = {};
    s.fight.champion = true; out.champ = g(s, {}, { rng: SR.rng.create(2) }).key;
    s.fight.champion = false; s.fight.won = 3;
    for (let i = 0; i < 40 && !out.gossip; i++) { const r = g(s, {}, { rng: SR.rng.create(100 + i) }); if (r.key === 'greet.bar.gossip') out.gossip = SR.text(r.key, r.vars); }
    s.fight.won = 0; s.clock.day = 1; out.fresh = g(s, {}, { rng: SR.rng.create(3) }).key;
    return out;
  });
  T.eq(greets.champ, 'greet.bar.champ', 'the champion is greeted as such');
  T.ok(/The Accountant/.test(greets.gossip || ''), 'fight gossip names the last man you beat', greets.gossip);
  T.eq(greets.fresh, 'greet.bar.fresh', 'a first-days greeting points at the ladder');

  // ------------------------------------------------------------------------------------------
  T.section('the Underground Ring (P1 `nightlife`): Saturdays, champions, the purse');
  await atBar({ stats: { str: 200 } }, { fight: { champion: true, won: 12 } });
  T.ok(!(await rowOf('bar.ring')), 'the Ring row is hidden while `nightlife` is off');
  await E(() => SR.debug.feature('nightlife', true));
  await t.setDay(6);   // Saturday
  await t.setTime(20 * 60);
  await t.step(2);
  const ring = await rowOf('bar.ring');
  T.ok(ring && ring.enabled, 'Saturday, a champion: the Ring row is open');
  await t.mg({ outcome: 'win', hpLeft: 100 });
  const r0 = await k.state();
  await k.row('bar.ring');
  await t.step(2);
  const r1 = await k.state();
  T.eq([r1.money.cash - r0.money.cash, r1.fight.ringBouts], [500 + 250 * 1, 1], 'bout 1 won: the purse $500 + $250k (B-13 ring.purse)');
  T.eq((await rowOf('bar.ring')).enabled, false, 'one bout a day');
  await E(() => SR.debug.feature('nightlife', false));

  // ------------------------------------------------------------------------------------------
  T.section('the interior by day and night (ART_AUDIO §9: neon mug, dartboard, the ladder board)');
  await atBar({}, { fight: { won: 3 } }, 13 * 60);
  await t.step(120);   // the drawn clock eases 1.5 s after a jump (the render core's tween)
  await k.shot('bar-day');
  await atBar({}, { fight: { won: 3 } }, 23 * 60);
  await t.step(120);   // the drawn clock eases 1.5 s after a jump (the render core's tween)
  await k.shot('bar-night');
  const board = await E(() => {
    const d = SR.reg.interior.bar;
    return { custom: d.custom, owner: d.owner.id, props: d.props.map((p) => p.type) };
  });
  T.ok(board.owner === 'sticky' && ['neon', 'dartboard', 'bar', 'taps', 'stool', 'shelf'].every((x) => board.props.indexOf(x) >= 0) && board.custom === 'ladderBoard',
    'Sticky behind the bar with the neon mug, dartboard, taps, stools, shelf and the ladder board', board);

  T.section('no console errors');
  T.eq(t.errors(), [], 'zero console errors, page errors or failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
