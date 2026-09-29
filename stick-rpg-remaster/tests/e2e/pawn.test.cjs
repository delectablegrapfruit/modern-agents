// tests/e2e/pawn.test.cjs — owner: W2-Goods. The pawn shop in the real game page (index.html over
// file://; BUILD_PLAN §4.5 acceptance, GDD §6.1, BALANCE B-06):
//   - the card: Vinnie's greeting, one Buy row per P0 item at its B-06 price and the counter row;
//     hotkeys buy; a one-off item then shows "Already have …"; ammo 5 at a time (R repeats it) and
//     refused at ≥ 95 ("Can't carry more (max 99)"); "Need $400" when short;
//   - the counter (`pawn.shop`): mounts, lists the goods with the detail panel, buys by click and
//     hotkey, closes on Back; with `shopsPlus` the P1 rows, the Buy / Sell tabs (Q / E and the
//     `tabs` context) and a confirmed sale at 40 % (by click and by Enter; the confirm says how many;
//     focus stays in the list when the sold row leaves it, and on the tab when the list empties);
//     with `arcs` the clean shirt once Harold asks;
//   - the interior draws (Vinnie behind the counter), the accessibility audit of the card and the
//     counter, screenshots at 1280×720 (day and night) and 1920×1080, zero console errors.
//   node tests/e2e/pawn.test.cjs      (screenshots: shots/W2-Goods/, git-ignored)
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Goods');

(async () => {
  const T = h.suite('e2e pawn (W2-Goods)');
  const t = await h.open({ fast: true });
  const P = t.page;
  const ev = (fn, arg) => P.evaluate(fn, arg);
  const rows = () => ev(() => window.SR.ui.card.rows().map((r) => ({ id: r.id, enabled: r.enabled, reason: r.reason, chips: r.chips, hotkey: r.hotkey })));
  const row = async (id) => (await rows()).find((r) => r.id === id) || null;
  const items = () => ev(() => { const s = window.SR.state; return { cash: s.money.cash, knife: s.items.knife, gun: s.items.gun, ammo: s.items.ammo, alarm: s.items.alarm, phone: s.items.phone, shirt: s.items.shirt }; });
  const text = (sel) => ev((sel) => { const e = document.querySelector('#ui ' + sel); return e ? e.textContent.trim() : null; }, sel);
  const visible = (sel) => ev((sel) => { const e = document.querySelector('#ui ' + sel); return !!(e && e.offsetParent !== null && !e.hidden); }, sel);

  await t.newGame({ seed: 21 });
  await t.set({ money: { cash: 1000 }, items: { ammo: 0 } });
  await t.setTime(14 * 60);

  // ------------------------------------------------------------ the card
  T.section('the pawn shop card');
  await t.enter('pawn');
  await t.step(2);
  T.eq(await t.scenes(), ['building'], 'the door opens the building scene');
  T.eq(await text('[data-id="card-title"]'), 'Pawn Shop', 'the card title');
  T.ok(((await text('[data-id="card-greeting"]')) || '').length > 10, 'Vinnie greets you');
  T.eq(await ev(() => window.SR.ui.building.info().interior), true, 'the pawn interior is registered and drawn');
  let rs = await rows();
  T.eq(rs.map((r) => r.id), ['pawn.knife', 'pawn.gun', 'pawn.ammo', 'pawn.alarm', 'pawn.phone', 'pawn.counter'], 'P0: five Buy rows and the counter (P1 rows hidden)');
  T.eq(rs.slice(0, 5).map((r) => r.chips.find((c) => /^\$/.test(c))), ['$100', '$400', '$10', '$200', '$200'], 'B-06 prices on the cost chips');
  T.eq(rs.map((r) => r.hotkey), [1, 2, 3, 4, 5, 6], 'hotkeys 1-6');
  T.ok(rs.find((r) => r.id === 'pawn.ammo').chips.some((c) => /\+5 Ammo/.test(c)), 'ammo shows +5 Ammo');
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui .bcard-group')).map((g) => g.textContent.trim().toLowerCase())), ['buy', 'services'], 'groups Buy and Services');
  await t.step(30);
  await t.shot(path.join(SHOTS, 'pawn-card-day.png'));

  T.section('buying from the card');
  await t.press('row1');
  await t.step(2);
  let st = await items();
  T.eq([st.knife, st.cash], [1, 900], 'hotkey 1 buys the knife: -$100');
  let r = await row('pawn.knife');
  T.eq([r.enabled, r.reason], [false, 'Already have Knife'], 'then the knife row says "Already have Knife"');
  await t.press('row3');
  await t.step(1);
  await t.press('repeat');
  await t.step(2);
  st = await items();
  T.eq([st.ammo, st.cash], [10, 880], 'ammo: 5 rounds for $10, and R repeats it');
  await t.set({ items: { ammo: 94 } });
  await t.press('row3');
  await t.step(2);
  T.eq((await items()).ammo, 99, 'at 94 rounds a box still fits: 99');
  await t.set({ items: { ammo: 95 } });
  await ev(() => window.SR.ui.card.refresh());
  r = await row('pawn.ammo');
  T.eq([r.enabled, r.reason], [false, "Can't carry more (max 99)"], 'at 95 the box is refused (orig ≥ 95)');
  await t.set({ money: { cash: 150 } });
  await ev(() => window.SR.ui.card.refresh());
  r = await row('pawn.gun');
  T.eq([r.enabled, r.reason], [false, 'Need $400'], 'short of cash: "Need $400"');
  await t.press('row2');
  await t.step(2);
  T.eq((await items()).gun, 0, 'a refused row buys nothing');
  await t.set({ money: { cash: 1000 } });

  // ------------------------------------------------------------ the counter
  T.section('the counter (pawn.shop)');
  await t.clickUI('row-pawn.counter');
  await t.step(2);
  T.eq(await ev(() => window.SR.ui.card.screens()), ['pawn.shop'], 'the counter row opens pawn.shop');
  T.eq(await text('.crumb--here'), 'The counter', 'the breadcrumb names it');
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id="shop-list"] .arow')).map((e) => e.getAttribute('data-row'))),
    ['shop-buy-knife', 'shop-buy-gun', 'shop-buy-ammo', 'shop-buy-alarm', 'shop-buy-phone'], 'the goods, one row each');
  T.eq(await visible('[data-id="shop-tabs"]'), false, 'no Sell tab in P0');
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="row-shop-buy-alarm"]')));
  await t.step(1);
  T.eq(await text('[data-id="shop-detail-name"]'), 'CD Alarm Clock', 'focusing a row describes its item');
  T.ok(/4 h earlier/.test(await text('[data-id="shop-detail-use"]')), 'with what it does (B-06: wake 4 h earlier)');
  await t.clickUI('row-shop-buy-alarm');
  await t.step(2);
  st = await items();
  T.eq([st.alarm, st.cash], [1, 800], 'a click buys the alarm clock: -$200');
  T.ok(await ev(() => window.SR.ui.toast.list().some((x) => /earlier/.test(x.text || '') || x.key === 'toast.pawn.alarm')), 'a toast says what it does');
  T.eq(await text('[data-id="row-shop-buy-alarm"] .arow-reason'), 'Already have CD Alarm Clock', 'the list refreshes: the alarm is now refused');
  await t.press('row5');
  await t.step(2);
  T.eq((await items()).phone, 1, 'hotkey 5 inside the counter buys the phone');
  await t.shot(path.join(SHOTS, 'pawn-counter.png'));
  const a1 = await t.eval(A.audit, '#ui');
  T.eq(a1.issues, [], 'the counter passes the accessibility audit (' + a1.controls + ' controls)');
  await t.press('back');
  await t.step(2);
  T.eq(await ev(() => window.SR.ui.card.screens()), [], 'Back closes the counter');
  T.eq(await ev(() => document.activeElement && document.activeElement.getAttribute('data-id')), 'row-pawn.counter', 'focus returns to the counter row');

  // ------------------------------------------------------------ P1: shopsPlus
  T.section('P1 shopsPlus: knuckles, vest, used skateboard, and Sell');
  await ev(() => window.SR.debug.feature('shopsPlus', true));
  await t.enter('pawn');
  await t.step(2);
  rs = await rows();
  T.eq(rs.map((x) => x.id), ['pawn.knife', 'pawn.gun', 'pawn.ammo', 'pawn.alarm', 'pawn.phone', 'pawn.knuckles', 'pawn.vest', 'pawn.skateboard', 'pawn.counter'],
    'the P1 rows appear with their flag');
  T.eq(['pawn.knuckles', 'pawn.vest', 'pawn.skateboard'].map((id) => rs.find((x) => x.id === id).chips.find((c) => /^\$/.test(c))), ['$300', '$900', '$300'], 'at their B-06 prices');
  await t.clickUI('row-pawn.counter');
  await t.step(2);
  T.eq(await visible('[data-id="shop-tabs"]'), true, 'the counter has Buy / Sell tabs');
  T.ok(await ev(() => window.SR.input.contexts().indexOf('tabs') >= 0), 'the tabs context is pushed (Q / E)');
  await t.press('tabNext');
  await t.step(2);
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id="shop-list"] .arow')).map((e) => e.getAttribute('data-row'))),
    ['shop-sell-knife', 'shop-sell-ammo', 'shop-sell-alarm', 'shop-sell-phone'], 'E opens the Sell tab: what you hold that Vinnie buys back');
  T.ok(/40 %/.test(await text('[data-id="shop-intro"]')), 'at 40 % of the price');
  T.ok((await text('[data-id="row-shop-sell-knife"]')).indexOf('+$40') >= 0, 'the knife sells for +$40');
  await t.shot(path.join(SHOTS, 'pawn-counter-sell.png'));
  const cash0 = (await items()).cash;
  await t.clickUI('row-shop-sell-knife');
  await t.step(2);
  T.eq(await t.scenes(), ['building', 'confirm'], 'a sale asks first');
  await t.clickUI('confirm-shop-yes');
  await t.step(3);
  st = await items();
  T.eq([st.knife, st.cash - cash0], [0, 40], 'confirmed: the knife is sold for $40');
  T.ok(!(await visible('[data-id="row-shop-sell-knife"]')), 'and leaves the Sell list');
  const focused = () => ev(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  T.eq(await focused(), 'row-shop-sell-ammo', 'focus moves to the next row, not off the list (keyboard and pad)');
  await t.press('confirm');
  await t.step(2);
  T.eq(await text('.modal-text'), 'Sell 5 Ammo to Vinnie for $4?', 'Enter sells from the keyboard: a box of ammo, and the confirm says how many');
  const ammo0 = await t.get('items.ammo');
  await t.press('confirm');
  await t.step(3);
  T.eq([ammo0 - (await t.get('items.ammo')), await focused()], [5, 'row-shop-sell-ammo'], 'confirmed: 5 rounds sold, focus stays on the row');
  const a2 = await t.eval(A.audit, '#ui');
  T.eq(a2.issues, [], 'the Sell tab passes the accessibility audit');
  await t.set({ items: { knife: 1, ammo: 0, alarm: 0, phone: 0 } });
  await ev(() => window.SR.ui.card.refresh());
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="row-shop-sell-knife"]')));
  await t.press('confirm');
  await t.step(2);
  T.eq(await text('.modal-text'), 'Sell your Knife to Vinnie for $40?', 'one item: "Sell your Knife"');
  await t.press('confirm');
  await t.step(3);
  T.eq([await visible('[data-id="shop-empty"]'), await focused()], [true, 'shop-tabs-sell'], 'the last sale empties the list: "nothing Vinnie wants", focus on the Sell tab');
  await t.press('tabPrev');
  await t.step(1);
  T.ok(await visible('[data-id="row-shop-buy-knife"]'), 'Q goes back to the Buy tab');
  await t.press('back');
  await t.step(2);
  T.ok(await ev(() => window.SR.input.contexts().indexOf('tabs') < 0), 'closing the counter pops the tabs context');
  await ev(() => window.SR.debug.feature('shopsPlus', false));

  // ------------------------------------------------------------ P1: arcs, the clean shirt
  T.section('P1 arcs: the clean shirt, once Harold asks');
  await ev(() => window.SR.debug.feature('arcs', true));
  await t.enter('pawn');
  await t.step(2);
  T.ok(!(await row('pawn.shirt')), 'the shirt hides until Harold asks');
  await ev(() => { const c = window.SR.tuning.street.harold.comeback; window.SR.debug.set({ npc: { harold: { gave10: c.give10s, takeout: c.takeouts } } }); });
  await ev(() => window.SR.ui.card.refresh());
  r = await row('pawn.shirt');
  T.ok(r && r.enabled && r.chips.indexOf('$20') >= 0, 'then it shows at $20');
  await t.clickUI('row-pawn.shirt');
  await t.step(2);
  T.eq((await items()).shirt, 1, 'and goes into the Bag');
  await ev(() => window.SR.debug.feature('arcs', false));

  // ------------------------------------------------------------ night, a wide window, errors
  T.section('night, 1920×1080 and the audit of the card');
  await t.setTime(22 * 60);
  await t.enter('pawn');
  for (let i = 0; i < 4; i++) await t.step(30);   // renders across the render core's 1.5 s clock tween: the window shows the night
  await ev(() => window.SR.ui.toast.clear());
  T.ok(/late|lights/i.test((await text('[data-id="card-greeting"]')) || ''), 'at night Vinnie says so');
  await t.shot(path.join(SHOTS, 'pawn-card-night.png'));
  const a3 = await t.eval(A.audit, '#ui');
  T.eq(a3.issues, [], 'the card passes the accessibility audit (' + a3.controls + ' controls)');
  await t.resize(1920, 1080);
  await t.setTime(13 * 60);
  await t.enter('pawn');
  for (let i = 0; i < 4; i++) await t.step(30);   // renders across the 1.5 s clock tween
  await ev(() => window.SR.ui.toast.clear());
  await t.shot(path.join(SHOTS, 'pawn-card-1920.png'));
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
