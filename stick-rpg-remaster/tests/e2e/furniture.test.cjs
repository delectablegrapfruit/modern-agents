// tests/e2e/furniture.test.cjs — owner: W2-Goods. Fine Line Furnishings in the real game page
// (index.html over file://; BUILD_PLAN §4.5 acceptance, GDD §4.15 / §6.1, BALANCE B-07, B-08):
//   - the card: Sofia's greeting and the showroom row only (the commits are never rows);
//   - the showroom (`furniture.browse`): the slot meter of the home you live in, one tile per P0
//     piece at its B-08b price with its slots and effect; buying (click, and the spend confirm at or
//     above `game.confirmSpendOver`); a piece that does not fit shows "Needs a free slot" and is
//     refused; the satellite needs the TV and takes no slot; slots per home 3 / 5 / 7 / 10 / 14;
//   - bought pieces work at the next sleep (the books' INT, the bed in the restore);
//   - P1 `homesPlus`: the satellite retires, an owned piece offers its upgrade at the net price (no
//     "Owned" badge on it), the freezer names its Leftovers, the selected tile is aria-current, and
//     the live preview draws the home with the selected piece ghosted in; P1 `karmaTiers`: the
//     Good-karma price with its discount badge;
//   - the interior draws (Sofia, the display bed), the accessibility audit of the card and the
//     showroom, screenshots at 1280×720 (day and night) and 1920×1080, zero console errors.
//   node tests/e2e/furniture.test.cjs      (screenshots: shots/W2-Goods/, git-ignored)
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Goods');

(async () => {
  const T = h.suite('e2e furniture (W2-Goods)');
  const t = await h.open({ fast: true });
  const P = t.page;
  const ev = (fn, arg) => P.evaluate(fn, arg);
  const text = (sel) => ev((sel) => { const e = document.querySelector('#ui ' + sel); return e ? e.textContent.trim() : null; }, sel);
  const tiles = () => ev(() => Array.from(document.querySelectorAll('#ui [data-id="furn-grid"] > button')).map((b) => ({
    id: b.getAttribute('data-id'), piece: b.getAttribute('data-piece'), disabled: b.getAttribute('aria-disabled') === 'true', text: b.textContent,
    price: (b.querySelector('[data-chip="money"] .chip-v') || { textContent: '' }).textContent })));
  const tile = async (base) => (await tiles()).find((x) => x.id === 'furn-' + base) || null;
  const meter = () => ev(() => { const e = document.querySelector('#ui [data-id="furn-slots"]'); return e ? [Number(e.getAttribute('aria-valuenow')), Number(e.getAttribute('aria-valuemax'))] : null; });
  const owned = () => ev(() => JSON.parse(JSON.stringify(window.SR.state.furniture.owned)));
  const cash = () => t.get('money.cash');
  const quiet = () => ev(() => { if (window.SR.ui.toast && window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });
  const showroom = async () => { await t.enter('furniture'); await t.step(2); await t.clickUI('row-furniture.showroom'); await t.step(2); };

  await t.newGame({ seed: 31 });
  await t.set({ money: { cash: 20000 } });
  await t.setTime(15 * 60);
  await ev(() => window.SR.settings.set('game.confirmSpendOver', 0));

  // ------------------------------------------------------------ the card
  T.section('the Fine Line card');
  await t.enter('furniture');
  await t.step(2);
  T.eq(await text('[data-id="card-title"]'), 'Fine Line Furnishings', 'the card title');
  T.ok(/bed/i.test((await text('[data-id="card-greeting"]')) || ''), 'Sofia greets an empty home: start with a bed');
  T.eq(await ev(() => window.SR.ui.building.info().interior), true, 'the Fine Line interior is registered and drawn');
  T.eq(await ev(() => window.SR.ui.card.rows().map((r) => r.id)), ['furniture.showroom'], 'one row: the showroom (the commits are never rows)');
  await t.step(30);
  await t.shot(path.join(SHOTS, 'furniture-card-day.png'));

  // ------------------------------------------------------------ the showroom
  T.section('the showroom (furniture.browse)');
  await t.clickUI('row-furniture.showroom');
  await t.step(2);
  T.eq(await ev(() => window.SR.ui.card.screens()), ['furniture.browse'], 'the row opens furniture.browse');
  T.eq(await text('.crumb--here'), 'Showroom', 'the breadcrumb names it');
  let ts = await tiles();
  T.eq(ts.map((x) => x.piece), ['bed', 'tv', 'pc', 'books', 'treadmill', 'freezer', 'minibar', 'satellite'], 'one tile per P0 piece, in order (the aquarium is P2)');
  const price = (x) => x.price;
  T.eq(ts.map(price), ['$500', '$2,500', '$2,000', '$2,000', '$3,500', '$2,500', '$5,000', '$3,000'], 'B-08b prices');
  T.ok(/1 slot/.test(ts[0].text) && /No slot/.test(ts[7].text), 'slots on each tile (the satellite takes none)');
  T.ok(/10 %/.test(ts[0].text) && /\+2 INT/.test(ts[3].text), 'effects from the tables: the bed +10 %, the books +2 INT a night');
  T.eq(await meter(), [0, 3], 'the apartment: 0 of 3 slots used');
  T.ok(/Needs the Flatland 60 TV first/.test(ts[7].text) && ts[7].disabled, 'the satellite needs the TV first');
  await ev(() => { window.SR.debug.feature('karmaTiers', true); window.SR.debug.set({ stats: { karma: 60 } }); window.SR.ui.card.refresh(); });
  const good = await tile('bed');
  T.ok(good.price === '$450' && await ev(() => !!document.querySelector('#ui [data-id="furn-bed"] .badge')),
    'Good karma (P1 karmaTiers, B-28a furniture.*): the bed at $450, with the discount named like a card row');
  await ev(() => { window.SR.debug.feature('karmaTiers', false); window.SR.debug.set({ stats: { karma: 0 } }); window.SR.ui.card.refresh(); });
  await t.shot(path.join(SHOTS, 'furniture-showroom.png'));
  const a1 = await t.eval(A.audit, '#ui');
  T.eq(a1.issues, [], 'the showroom passes the accessibility audit (' + a1.controls + ' controls)');

  T.section('buying and the slots');
  let c0 = await cash();
  await t.clickUI('furn-bed');
  await t.step(2);
  T.eq([(await owned()).bed, c0 - (await cash())], [1, 500], 'a click buys the Featherfold Bed: -$500');
  T.ok(/Owned/i.test((await tile('bed')).text), 'its tile now says Owned');
  T.eq(await meter(), [1, 3], 'the meter: 1 of 3');
  await t.clickUI('furn-tv');
  await t.clickUI('furn-pc');
  await t.step(2);
  T.eq(await meter(), [3, 3], 'the bed, the TV and the PC fill the apartment');
  let b = await tile('books');
  T.ok(b.disabled && /Needs a free slot/.test(b.text), 'a piece that does not fit still shows: "Needs a free slot"');
  c0 = await cash();
  // (a DOM click: Playwright will not click an aria-disabled control)
  await ev(() => document.querySelector('#ui [data-id="furn-books"]').click());
  await t.step(2);
  T.eq([(await owned()).books, await cash()], [undefined, c0], 'and clicking it buys nothing');
  await t.clickUI('furn-satellite');
  await t.step(2);
  T.eq([(await owned()).satellite, await meter()], [1, [3, 3]], 'the satellite (needs the TV, no slot) still fits');
  await quiet();
  await t.shot(path.join(SHOTS, 'furniture-showroom-full.png'));

  T.section('the spend confirm');
  await ev(() => window.SR.settings.set('game.confirmSpendOver', 1000));
  await t.set({ homes: { owned: ['apt', 'apt2'], living: 'apt2' } });
  await showroom();
  T.eq(await meter(), [3, 5], 'moved into the bigger apartment: 3 of 5');
  await t.clickUI('furn-books');
  await t.step(2);
  T.eq(await t.scenes(), ['building', 'confirm'], 'a $2,000 piece asks first (game.confirmSpendOver 1000)');
  await t.clickUI('confirm-furniture-yes');
  await t.step(3);
  T.eq((await owned()).books, 1, 'confirmed: the Grand Atlas is bought');
  await ev(() => window.SR.settings.set('game.confirmSpendOver', 0));

  T.section('slots per home (B-08a)');
  const slots = [];
  for (const home of ['apt', 'apt2', 'pent', 'mansion', 'castle']) {
    await t.set({ homes: { owned: ['apt', 'apt2', 'pent', 'mansion', 'castle'], living: home } });
    await ev(() => window.SR.rules.homes.restock(window.SR.state));
    await showroom();
    slots.push((await meter())[1]);
  }
  T.eq(slots, [3, 5, 7, 10, 14], 'the meter follows the home you live in: 3, 5, 7, 10, 14');
  await t.set({ homes: { living: 'apt2' } });
  await ev(() => window.SR.rules.homes.restock(window.SR.state));

  T.section('bought pieces work at the next sleep');
  const int0 = await t.get('stats.int');
  await t.night('sleep');
  T.eq((await t.get('stats.int')) - int0, 2, 'the Grand Atlas bought today: +2 INT on the next night');
  await t.set({ stats: { str: 85, hpMax: 100, hp: 1 } });
  await t.night('sleep');
  T.eq(await t.get('stats.hp'), 1 + Math.floor(100 * (0.25 + 0.10 + 0.05)) + 15, 'the bed (+10 %) and the bigger apartment (+5 %) in the restore (B-07)');

  // ------------------------------------------------------------ P1: homesPlus
  T.section('P1 homesPlus: upgrades and the live preview');
  await ev(() => window.SR.debug.feature('homesPlus', true));
  await t.setTime(15 * 60);
  await showroom();
  ts = await tiles();
  T.ok(!ts.some((x) => x.piece === 'satellite' && x.id === 'furn-satellite' && !/Owned/.test(x.text)), 'the P0 satellite is no longer sold');
  const bed = await tile('bed');
  T.ok(bed.piece === 'pod' && /Upgrade to Hibernation Pod/.test(bed.text) && price(bed) === '$3,750', 'the bed offers the Hibernation Pod at $3,750 (4,000 less half the bed)');
  T.ok(!/Owned/i.test(bed.text), 'an upgrade tile carries no "Owned" badge (it would read as the upgrade owned)');
  T.ok(/Leftovers: \+25 HP once a day/.test((await tile('freezer')).text), 'with homesPlus the freezer tile names its Leftovers (B-07)');
  T.ok(await ev(() => !!document.querySelector('#ui [data-id="furn-preview"]')), 'the live preview is shown');
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="furn-treadmill"]')));
  await t.step(1);
  T.ok(/Preview: your Bigger Apartment/.test(await text('[data-id="furn-preview-caption"]')), 'it names your home');
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id="furn-grid"] > button')).filter((b) => b.getAttribute('aria-current') === 'true').map((b) => b.getAttribute('data-id'))),
    ['furn-treadmill'], 'the selected tile is the set\'s current item (aria-current), not a pressed toggle');
  const inked = await ev(() => {
    const c = document.querySelector('#ui [data-id="furn-preview"]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n / (d.length / 4);
  });
  T.ok(inked > 0.9, 'and draws the home (' + Math.round(inked * 100) + ' % of its pixels painted)');
  c0 = await cash();
  await t.clickUI('furn-bed');
  await t.step(2);
  T.eq([(await owned()).bed, c0 - (await cash())], [2, 3750], 'the upgrade: the bed becomes the Hibernation Pod for $3,750');
  T.ok(/Top of the line/.test((await tile('bed')).text), 'and its tile says so');
  await quiet();
  await t.shot(path.join(SHOTS, 'furniture-showroom-p1.png'));
  const a2 = await t.eval(A.audit, '#ui');
  T.eq(a2.issues, [], 'the P1 showroom passes the accessibility audit');
  await t.press('back');
  await t.step(2);
  T.eq(await ev(() => window.SR.ui.card.screens()), [], 'Back closes the showroom');
  await ev(() => window.SR.debug.feature('homesPlus', false));

  // ------------------------------------------------------------ night, a wide window, errors
  T.section('night, 1920×1080 and the audit of the card');
  await t.setTime(22 * 60);
  await t.enter('furniture');
  for (let i = 0; i < 4; i++) await t.step(30);   // renders across the render core's 1.5 s clock tween: the window shows the night
  await quiet();
  T.ok(/late|bed/i.test((await text('[data-id="card-greeting"]')) || ''), 'at night Sofia says so');
  await t.shot(path.join(SHOTS, 'furniture-card-night.png'));
  const a3 = await t.eval(A.audit, '#ui');
  T.eq(a3.issues, [], 'the card passes the accessibility audit (' + a3.controls + ' controls)');
  await t.resize(1920, 1080);
  await t.setTime(13 * 60);
  await showroom();
  for (let i = 0; i < 4; i++) await t.step(30);   // renders across the 1.5 s clock tween
  await quiet();
  await t.shot(path.join(SHOTS, 'furniture-showroom-1920.png'));
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
