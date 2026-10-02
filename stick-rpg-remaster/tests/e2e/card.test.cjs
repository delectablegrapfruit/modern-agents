// tests/e2e/card.test.cjs — owner: W1-D. The building card, the sub-screen host and the building
// scene in the real game page (index.html over file://, the kernel's input, loop and debug API,
// W1-R's action pipeline), with the test buildings of tests/sheets/components-fixtures.js
// (BUILD_PLAN §3.5 acceptance):
//   - rows come from SR.preview: feature-off and `hidden` rows dropped, disabled rows with their
//     reason, groups in order, hotkeys 1-9; a disabled row shows its reason and plays the error
//     feedback; world.enter and door:entered / door:exited on arrival and leaving;
//   - hold-confirm repeats a `repeatable` row every tuning.time.repeatHoldMs until refused, and
//     never repeats a row with confirm, minigame or screen; R repeats the card's last action;
//     a stat-gain stamp shows once per hold and never stops it, and the held key's repeats do not
//     skip it (CONTRACT D47); Tab moves focus and never opens the Pocket in a building (D57);
//     a minigame or Hustle that cannot run yet shows a toast, never an unhandled rejection;
//   - a test sub-screen mounts, refreshes after ctx.act and when a child pops, vetoes Back (the
//     host asks to confirm) and unmounts; card.open('testbank', { screen }) from another building
//     lands on it; keyboard, a mocked gamepad and touch (a drag scrolls the long card body; a
//     long-press repeats);
//   - the compact HUD follows the actions; screenshots at 1280×720, 1366×768, 1920×1080 and the
//     touch-compact layout; zero console errors.
//   node tests/e2e/card.test.cjs      (screenshots: shots/W1-D/, git-ignored)
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const FIXTURES = path.join(h.ROOT, 'tests', 'sheets', 'components-fixtures.js');
const SHOTS = path.join(h.ROOT, 'shots', 'W1-D');

async function setup(opts) {
  const t = await h.open(opts || {});
  await t.page.addScriptTag({ path: FIXTURES });
  await t.page.evaluate(() => {
    const SR = window.SR, W1D = window.W1D;
    if (SR.debug && typeof SR.debug.newGame === 'function') SR.debug.newGame({ seed: 7 });
    W1D.fakes();
    W1D.content();
    if (SR.debug && typeof SR.debug.fast === 'function') SR.debug.fast(true);
    window.__sfx = [];
    if (SR.reg.sfx && !SR.reg.sfx.error) SR.def.sfx('error', { bus: 'ui', gain: 0.3, layers: [] });
    const real = SR.audio.sfx;
    SR.audio.sfx = function (name) { window.__sfx.push(name); return typeof real === 'function' ? real.apply(this, arguments) : null; };
    window.__music = [];
    const realMusic = SR.audio.music;
    SR.audio.music = function (id, o) { window.__music.push([id, o || null]); return typeof realMusic === 'function' ? realMusic.apply(this, arguments) : undefined; };
    window.__ev = [];
    ['enter', 'door:entered', 'door:exited', 'action:done'].forEach((n) => SR.events.on(n, (p) => window.__ev.push({ n, p: n === 'action:done' ? { id: p.id, ok: p.result.ok } : p })));
    window.__pad = { id: 'Xbox Wireless Controller (mock)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad, null, null, null] });
    window.__padSet = (b, on) => { window.__pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
  });
  return t;
}

(async () => {
  const T = h.suite('e2e card (W1-D)');
  let t = await setup();
  const P = t.page;
  const ev = (fn, arg) => P.evaluate(fn, arg);
  const step = (n) => ev((n) => window.W1D.step(n), n);
  const state = () => ev(() => ({ cash: window.SR.state.money.cash, bank: window.SR.state.money.bank, hp: window.SR.state.stats.hp, min: window.SR.state.clock.min, gum: window.SR.state.items.gum }));
  const set = (patch) => ev((p) => window.SR.debug.set(p), patch);
  const focusRow = (id) => ev((id) => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="row-' + id + '"]')), id);
  const active = () => ev(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  const pad = async (b) => { await ev((b) => { window.__padSet(b, true); window.W1D.step(1); window.__padSet(b, false); window.W1D.step(1); }, b); };

  // ------------------------------------------------------------ rows from SR.preview
  T.section('the building scene and its rows');
  T.eq(await ev(() => typeof window.SR.preview), 'function', 'SR.preview is the real pipeline (W1-R)');
  await set({ stats: { str: 200, hpMax: 215, hp: 10, cha: 7 }, money: { cash: 24 } });
  await t.enter('testshop');
  await step(1);
  T.eq(await t.scenes(), ['building'], 'SR.debug.enter opens the building scene');
  const dom = await ev(() => ({
    card: !!document.querySelector('#ui [data-scene="building"] .bcard'),
    hud: !!document.querySelector('#ui [data-scene="building"] .hud.is-compact'),
    title: document.querySelector('#ui [data-id="card-title"]').textContent,
    groups: Array.from(document.querySelectorAll('#ui .bcard-group')).map((g) => g.textContent),
    greet: (document.querySelector('#ui [data-id="card-greeting"]') || {}).textContent || '',
  }));
  T.ok(dom.card && dom.hud, 'the card and the compact HUD are mounted');
  T.eq(dom.title, 'Test Shop', 'the card title is the building name');
  T.eq(dom.groups, ['Eat', 'Buy', 'Work', 'Train', 'Services', 'Crime', 'Special'], 'groups in the order Eat · Buy · Work · Train · Services · Crime · Special');
  T.ok(/test shop/i.test(dom.greet), 'the owner greets in a SpeechBubble');
  const rows = await ev(() => window.SR.ui.card.rows());
  T.eq(rows.map((r) => r.id), ['testshop.shake', 'testshop.fries', 'testshop.burger', 'testshop.feast', 'testshop.gum', 'testshop.fancy', 'testshop.work',
    'testshop.promo', 'testshop.study', 'testshop.ledger', 'testshop.rob', 'testshop.badRepeat1', 'testshop.badRepeat2', 'testshop.badRepeat3'],
  'every action of the building, sorted; the feature-off and `hidden` rows are dropped');
  T.eq(rows.map((r) => r.hotkey), [1, 2, 3, 4, 5, 6, 7, 8, 9, null, null, null, null, null], 'hotkeys 1-9 on the first nine visible rows');
  const promo = rows.find((r) => r.id === 'testshop.promo');
  T.ok(!promo.enabled && /CHA 200/.test(promo.reason), 'a disabled row carries its reason', promo);
  T.ok(await ev(() => /CHA 200/.test(document.querySelector('#ui [data-row="testshop.promo"] .arow-reason').textContent)), 'and shows it in place of the gains');
  const fancy = rows.find((r) => r.id === 'testshop.fancy');
  T.ok(!fancy.enabled && fancy.chips.some((c) => /1,500/.test(c)), 'a row you cannot afford is disabled with its cost chip', fancy);
  const ledger = rows.find((r) => r.id === 'testshop.ledger');
  T.eq(ledger.chips, [], 'a sub-screen row shows no cost chips');
  const evs = await ev(() => window.__ev.slice());
  T.ok(evs.some((e) => e.n === 'door:entered' && e.p.id === 'testshop'), 'door:entered { id }');
  T.ok(evs.some((e) => e.n === 'enter' && e.p.building === 'testshop'), 'world.enter ran on arrival (the enter rule event)');
  T.eq(await active(), 'row-testshop.shake', 'the first row has focus');
  await t.shot(path.join(SHOTS, 'card-1280.png'));

  // ------------------------------------------------------------ hotkeys, refusals, R
  T.section('hotkeys, refusal feedback, R');
  await set({ money: { cash: 100 } });
  let s0 = await state();
  await P.keyboard.press('Digit2');
  let s1 = await state();
  T.ok(s1.cash === s0.cash - 12 && s1.hp === s0.hp + 20 && s1.min === s0.min + 30, 'hotkey 2 runs Fries once ($12, +20 HP, 30m)', [s0, s1]);
  await P.keyboard.press('KeyR');
  const s2 = await state();
  T.eq(s2.cash, s1.cash - 12, 'R repeats the card\'s last repeatable action');
  await ev(() => { window.__sfx.length = 0; window.SR.debug.fast(false); });   // fast mode skips the shake
  await focusRow('testshop.promo');
  await P.keyboard.press('Enter');
  const ref = await ev(() => ({ shake: document.querySelector('#ui [data-id="row-testshop.promo"]').classList.contains('is-shaking'), sfx: window.__sfx.slice(), aria: document.getElementById('aria').getAttribute('data-last') }));
  T.ok(ref.shake && ref.sfx.indexOf('error') >= 0 && /CHA 200/.test(ref.aria), 'a disabled row refuses: shake, error sound, the reason read out', ref);
  await ev(() => window.SR.debug.fast(true));
  T.eq((await state()).cash, s2.cash, 'and nothing ran');
  await ev(() => window.SR.ui.hud.flush());
  T.eq(await ev(() => document.querySelector('#ui [data-id="hud-cash"]').textContent), '$' + s2.cash, 'the compact HUD shows the new cash');
  // R re-runs the card's last action only when that action is repeatable (ARCHITECTURE §11): after
  // a non-repeatable run it refuses instead of reaching back to an older repeatable one.
  await set({ money: { cash: 100 }, stats: { hp: 10, heat: 0 } });
  await P.keyboard.press('Digit2');
  await focusRow('testshop.rob');
  await P.keyboard.press('Enter');
  await t.clickUI('confirm-row-yes');
  const robbed = await ev(() => ({ last: window.SR.ui.card.debug().last, heat: window.SR.state.stats.heat }));
  T.ok(robbed.last === 'testshop.rob' && robbed.heat > 0, 'a confirmed non-repeatable row runs and becomes the last action', robbed);
  s0 = await state();
  await ev(() => { window.__sfx.length = 0; });
  await P.keyboard.press('KeyR');
  T.ok((await state()).cash === s0.cash && (await ev(() => window.__sfx.indexOf('error') >= 0)), 'R after it refuses (error sound) and does not re-run the older Fries');
  await set({ stats: { heat: 0, karma: 0 } });
  // The HUD ghost follows the focused row's new preview after a run (UI.md §1.1). (The pointer
  // goes to the diorama first: hovering a row ghosts that row.)
  await P.mouse.move(40, 700);
  await set({ money: { cash: 100 }, stats: { hp: 200 } });
  await focusRow('testshop.fries');
  const gh0 = await ev(() => ({ hp: document.querySelector('#ui [data-id="hud-hp"] .meter-ghost').style.width, cash: document.querySelector('#ui [data-id="hud-cash-ghost"]').textContent }));
  await P.keyboard.press('Enter');
  const gh1 = await ev(() => ({ hp: document.querySelector('#ui [data-id="hud-hp"] .meter-ghost').style.width, cash: document.querySelector('#ui [data-id="hud-cash-ghost"]').textContent,
    enabled: window.SR.ui.card.rows().find((r) => r.id === 'testshop.fries').enabled }));
  T.ok(parseFloat(gh0.hp) > 0 && gh0.cash === '-$12', 'focusing Fries ghosts +HP and -$12 on the HUD', gh0);
  T.ok(!gh1.enabled && parseFloat(gh1.hp) === 0 && gh1.cash === '', 'after the run fills HP the row refuses and the stale ghost is gone', gh1);

  // ------------------------------------------------------------ hold-to-repeat
  T.section('hold confirm repeats a repeatable row every repeatHoldMs until refused');
  const holdMs = await ev(() => window.SR.tuning.time.repeatHoldMs);
  const every = Math.round(holdMs / (1000 / 60));
  T.eq(holdMs, 350, 'tuning.time.repeatHoldMs = 350 (BALANCE B-01)');
  await set({ money: { cash: 24 }, stats: { hp: 10 } });
  await focusRow('testshop.shake');
  await P.keyboard.down('Enter');
  T.eq((await state()).cash, 16, 'the press runs it once');
  await step(every - 1);
  T.eq((await state()).cash, 16, 'nothing more before ' + holdMs + ' ms');
  await step(1);
  T.eq((await state()).cash, 8, 'the second run at ' + holdMs + ' ms (' + every + ' steps)');
  await step(every);
  T.eq((await state()).cash, 0, 'the third run ' + holdMs + ' ms later');
  await step(every);
  T.ok(!(await ev(() => window.SR.ui.card.repeating())), 'refused (Need $8): the repeat stops');
  await step(every * 3);
  T.eq((await state()).cash, 0, 'and stays stopped while the key is still held');
  await P.keyboard.up('Enter');
  await set({ money: { cash: 50 } });
  await focusRow('testshop.badRepeat1');
  await P.keyboard.down('Enter');
  await step(every * 3);
  T.eq(await t.scenes(), ['building', 'confirm'], 'a row with confirm asks once (the confirm overlay), no repeat');
  T.ok(!(await ev(() => window.SR.ui.card.repeating())), 'and never repeats');
  await P.keyboard.up('Enter');
  await P.keyboard.press('Escape');
  T.eq(await t.scenes(), ['building'], 'Esc cancels the confirm');
  T.eq((await state()).cash, 50, 'nothing was bought');
  await focusRow('testshop.badRepeat3');
  await P.keyboard.down('Enter');
  await step(every * 3);
  // A def's `minigame` is its Hustle button (CONTRACT §8.2): the row itself runs the plain action, so
  // a repeatable shift repeats while the Hustle never does (W2-Food request 2; GDD §4.4).
  T.eq((await state()).cash, 46, 'a repeatable row with a Hustle button repeats its plain run (1 + 3 runs)');
  T.ok(await ev(() => window.SR.ui.card.rows().filter((r) => r.id === 'testshop.badRepeat3')[0].repeatable), 'and the card marks it repeatable');
  await P.keyboard.up('Enter');
  await focusRow('testshop.badRepeat2');
  await P.keyboard.down('Enter');
  await step(every * 3);
  T.eq(await ev(() => window.SR.ui.card.screens()), ['test.child'], 'a row with a screen opens its sub-screen once and never repeats');
  await P.keyboard.up('Enter');
  await P.keyboard.press('Escape');
  T.eq(await ev(() => window.SR.ui.card.screens()), [], 'Esc closes the sub-screen (back one crumb)');
  T.eq(await active(), 'row-testshop.badRepeat2', 'focus returns to the row that opened it');
  // A stat gain ≥ 2 stamps once per hold; later stat stamps are coalesced and do not stop it
  // (GDD §4.4, CONTRACT D47), and the held key's own repeats never skip the showing stamp.
  const stampsShown = () => ev(() => document.querySelectorAll('#ui .ui-layer--stamp .stamp:not(.is-leaving)').length);
  await ev(() => { window.SR.debug.fast(false); window.SR.ui.stamp.clear(); window.__sfx.length = 0; });
  await set({ stats: { int: 7, hp: 200 }, clock: { min: 480 } });   // not Winded (HP ≥ 25 %), so +2 a run
  await focusRow('testshop.study');
  await P.keyboard.down('Enter');
  const st1 = await ev(() => ({ int: window.SR.state.stats.int, stamp: window.SR.ui.stamp.current(), sfx: window.__sfx.slice() }));
  await P.keyboard.down('Enter');       // the OS key repeats of the held Enter (repeat: true)
  await P.keyboard.down('Enter');
  const stRep = await ev(() => window.SR.ui.stamp.current());
  await step(every);
  await step(every);
  const st2 = await ev(() => ({ int: window.SR.state.stats.int, stamps: document.querySelectorAll('#ui .ui-layer--stamp .stamp:not(.is-leaving)').length, busyOther: window.SR.ui.stamp.busy({ ignoreStat: true }),
    repeating: window.SR.ui.card.repeating() }));
  await P.keyboard.up('Enter');
  T.ok(st1.int === 9 && /INTELLIGENCE/.test(st1.stamp || ''), 'the first run stamps "+2 INTELLIGENCE!"', st1);
  T.ok(st1.sfx.indexOf('stamp') >= 0 || !(await ev(() => !!window.SR.reg.sfx.stamp)), 'the stamp thuds (W1-S\'s `stamp` recipe)', st1.sfx);
  T.ok(/INTELLIGENCE/.test(stRep || ''), 'the held key\'s repeats do not skip the stat stamp (only a new press does)', stRep);
  T.ok(st2.int === 13 && st2.stamps <= 1 && !st2.busyOther && st2.repeating, 'the repeat goes on through the stat stamp; no stamp per repeat', st2);
  // The hold's first gain ≥ 2 stamps even when an earlier run of the same hold gained less.
  await ev(() => window.SR.ui.stamp.clear());
  await set({ stats: { int: 7, hp: 10 }, clock: { min: 480 } });    // Winded (HP < 25 %): +1 a run
  await focusRow('testshop.study');
  await P.keyboard.down('Enter');
  const w1 = await ev(() => ({ int: window.SR.state.stats.int, stamp: window.SR.ui.stamp.current() }));
  await set({ stats: { hp: 200 } });                                // rested: the next runs gain +2
  await step(every);
  const w2 = await ev(() => ({ int: window.SR.state.stats.int, stamp: window.SR.ui.stamp.current() }));
  await step(every);
  const w3 = { int: await ev(() => window.SR.state.stats.int), stamps: await stampsShown(), repeating: await ev(() => window.SR.ui.card.repeating()) };
  await P.keyboard.up('Enter');
  T.ok(w1.int === 8 && w1.stamp === null, 'Winded, the hold\'s first run gains +1: no stamp', w1);
  T.ok(w2.int === 10 && /INTELLIGENCE/.test(w2.stamp || ''), 'the hold\'s first gain ≥ 2 stamps', w2);
  T.ok(w3.int === 12 && w3.stamps <= 1 && w3.repeating, 'the next one is coalesced and the repeat goes on', w3);
  // R is one run per press, not a hold: its stat gain stamps.
  await ev(() => window.SR.ui.stamp.clear());
  await P.keyboard.press('KeyR');
  const rR = await ev(() => ({ int: window.SR.state.stats.int, stamp: window.SR.ui.stamp.current() }));
  T.ok(rR.int === 14 && /INTELLIGENCE/.test(rR.stamp || ''), 'R (one run per press) stamps its stat gain', rR);
  await ev(() => { window.SR.ui.stamp.clear(); window.SR.debug.fast(true); });
  // Holding the pad's A repeats too.
  await set({ money: { cash: 100 }, stats: { hp: 10 } });
  await focusRow('testshop.fries');
  s0 = await state();
  await ev(() => { window.__padSet(0, true); window.W1D.step(1); });
  await step(every);
  await ev(() => { window.__padSet(0, false); window.W1D.step(1); });
  T.eq((await state()).cash, s0.cash - 24, 'holding A runs it and repeats it after ' + holdMs + ' ms');
  await step(every * 2);
  T.eq((await state()).cash, s0.cash - 24, 'releasing A stops the repeat');
  // A Hustle button keeps its focus when the rows refresh (they rebuild the row's extras).
  await ev(() => window.SR.debug.feature('hustles', true));
  await ev(() => window.SR.ui.card.refresh());
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="row-testshop.badRepeat3-hustle"]')));
  await ev(() => window.SR.ui.card.refresh());
  T.eq(await active(), 'row-testshop.badRepeat3-hustle', 'the Hustle button keeps focus through a refresh');
  // A Hustle whose skin is not registered yet: SR.minigame.run rejects and the card shows a toast
  // (no unhandled rejection; the zero-console-errors check below covers it).
  await ev(() => window.SR.ui.toast.clear());
  s0 = await state();
  await P.keyboard.press('Enter');
  await P.waitForTimeout(30);
  const hustleToasts = await ev(() => window.SR.ui.toast.list().map((x) => x.text));
  T.ok(hustleToasts.some((x) => /not set up yet/.test(x)) && (await state()).cash === s0.cash,
    'a Hustle whose skin is still a stub shows "The table is not set up yet" and charges nothing', hustleToasts);
  await ev(() => window.SR.ui.toast.clear());
  await ev(() => window.SR.debug.feature('hustles', false));
  await ev(() => window.SR.ui.card.refresh());
  T.eq(await active(), 'row-testshop.badRepeat3', 'and focus falls back to its row when the button goes away');
  // Tab moves focus in the card and never opens the Pocket here; the pad's View button, or any
  // other binding of `pocket`, does (CONTRACT §15.5, D57). A stand-in Pocket while it is a stub.
  await ev(() => {
    const SR = window.SR;
    if (!SR.reg.scene.pocket) SR.scenes.register('pocket', { kind: 'overlay', onAction: () => true });
    SR.input.bind('pocket', ['Tab', 'KeyP', 'Pad8']);
  });
  await focusRow('testshop.shake');
  await P.keyboard.press('Tab');
  const tabbed = { scenes: await t.scenes(), active: await active() };
  T.ok(tabbed.scenes.join() === 'building' && tabbed.active !== 'row-testshop.shake', 'Tab moves focus in the card and does not open the Pocket', tabbed);
  await P.keyboard.press('KeyP');
  T.eq(await t.scenes(), ['building', 'pocket'], 'another key bound to `pocket` opens it');
  await ev(() => window.SR.scenes.pop());
  await pad(8);
  T.eq(await t.scenes(), ['building', 'pocket'], 'the pad\'s View button opens it');
  await ev(() => { window.SR.scenes.pop(); window.SR.input.bind('pocket', null); });
  await step(1);
  // Clicking a variant keeps focus on its row (the option under the pointer is rebuilt).
  await P.click('#ui [data-id="row-testshop.work-variant-overtime"]');
  T.eq([await active(), await ev(() => window.SR.ui.card.rows().find((r) => r.id === 'testshop.work').variant)], ['row-testshop.work', 'overtime'],
    'a click on a variant selects it and focus lands on its row');
  await P.click('#ui [data-id="row-testshop.work-variant-full"]');

  // ------------------------------------------------------------ gamepad navigation
  T.section('a mocked gamepad drives the card');
  await focusRow('testshop.shake');
  await pad(13);
  T.eq(await active(), 'row-testshop.fries', 'D-pad ↓ moves to the next row');
  await pad(12);
  T.eq(await active(), 'row-testshop.shake', 'D-pad ↑ moves back');
  s0 = await state();
  await pad(0);
  T.eq((await state()).cash, s0.cash - 8, 'A runs the focused row');
  await focusRow('testshop.work');
  await pad(5);
  T.eq(await ev(() => window.SR.ui.card.rows().find((r) => r.id === 'testshop.work').variant), 'half', 'RB changes the row\'s variant (Full → Half)');
  await pad(4);
  T.eq(await ev(() => window.SR.ui.card.rows().find((r) => r.id === 'testshop.work').variant), 'full', 'LB changes it back');

  // ------------------------------------------------------------ sub-screens
  T.section('the sub-screen host');
  await set({ money: { cash: 100, bank: 0 } });
  // The bank gets a registered interior (W1-A's kit): the scene draws it instead of its placeholder.
  await ev(() => window.SR.def.interior('testbank', { wall: { type: 'panels', color: 'int.default.wall' }, floor: { type: 'planks' },
    window: { x: 60, y: 90, w: 220, h: 140 }, props: [{ type: 'counter', x: 120, y: 470, w: 520 }],
    owner: { id: 'penny', x: 360, y: 430 }, you: { x: 250, y: 560 } }));
  await ev(() => { window.__ev.length = 0; window.W1D.log.length = 0; window.SR.ui.card.open('testbank', { screen: 'test.form' }); });
  await step(1);
  T.ok(await ev(() => window.SR.ui.building.info().interior), 'a registered interior replaces the placeholder diorama (SR.art.interior)');
  T.eq(await ev(() => window.__music.slice(-1)[0]), ['paper_sky', { fade: 0.6 }], 'entering cross-fades to the building\'s song in 600 ms (ART_AUDIO §13.4)');
  T.eq(await t.scenes(), ['building'], 'card.open(\'testbank\', { screen }) from another building …');
  T.eq(await ev(() => [window.SR.ui.card.current(), window.SR.ui.card.screens()]), ['testbank', ['test.form']], '… lands on the bank with the sub-screen open');
  const moved = await ev(() => window.__ev.slice());
  T.ok(moved.some((e) => e.n === 'door:exited' && e.p.id === 'testshop' && typeof e.p.spentMin === 'number') &&
       moved.some((e) => e.n === 'door:entered' && e.p.id === 'testbank'), 'door:exited (with spentMin) then door:entered', moved.filter((e) => e.n !== 'action:done'));
  T.eq(await ev(() => window.W1D.log.slice()), ['mount test.form'], 'the sub-screen mounted');
  T.eq(await active(), 'test-amount-plus', 'focus starts on its first enabled control that is not a text field (− starts disabled)');
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id="breadcrumb"] .crumb, #ui [data-id="breadcrumb"] .crumb-sep')).map((e) => e.textContent.trim()).join(' ')), '‹Test Bank › Ledger', 'the Breadcrumb reads "Test Bank › Ledger"');
  T.ok(await ev(() => document.querySelector('#ui [data-id="card-rows"]').hidden), 'the rows are replaced by the sub-screen');
  await t.shot(path.join(SHOTS, 'card-sub.png'));
  await ev(() => window.SR.debug.fast(false));      // fast mode skips the flying chips
  await t.clickUI('test-tip');
  const sub1 = await ev(() => ({ refreshes: Number(document.querySelector('#ui [data-subscreen="test.form"]').getAttribute('data-refreshes')), text: document.querySelector('#ui [data-id="test-balance"]').textContent, s: { cash: window.SR.state.money.cash, bank: window.SR.state.money.bank },
    fly: document.querySelectorAll('#ui .ui-layer--fly .chip--fly').length, scene: window.SR.ui.building.info(), last: window.SR.ui.card.debug().last }));
  await ev(() => window.SR.debug.fast(true));
  T.ok(sub1.s.cash === 90 && sub1.s.bank === 10, 'ctx.act commits through SR.act (−$10 cash, +$10 bank)', sub1);
  T.ok(sub1.refreshes === 1 && /Bank \$10/.test(sub1.text), 'the host refreshes the sub-screen once after ctx.act', sub1);
  T.ok(sub1.fly >= 2 && sub1.scene.ownerPose === 'happy' && sub1.scene.floats >= 1,
    'and plays the row feedback: chips fly to the HUD, the proprietor reacts, float texts rise', sub1);
  T.eq(sub1.last, 'testbank.tip', 'a sub-screen commit is the card\'s last action (R will not reach past it)');
  await t.clickUI('test-open-child');
  T.eq(await ev(() => window.SR.ui.card.screens()), ['test.form', 'test.child'], 'ctx.push opens a child');
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-id="breadcrumb"] .crumb, #ui [data-id="breadcrumb"] .crumb-sep')).map((e) => e.textContent.trim()).join(' ')), '‹Test Bank › Ledger › Receipt', 'the Breadcrumb grows');
  await t.clickUI('test-child-done');
  await P.waitForTimeout(20);
  const log1 = await ev(() => window.W1D.log.slice());
  T.eq(log1, ['mount test.form', 'mount test.child hello', 'unmount test.child', 'child popped done'], 'ctx.pop(result) unmounts the child and resolves its push()');
  T.eq(await ev(() => Number(document.querySelector('#ui [data-subscreen="test.form"]').getAttribute('data-refreshes'))), 2, 'the parent refreshes when a child pops');
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="test-amount-input"]')));
  await P.keyboard.type('50');
  await P.keyboard.press('Escape');
  T.eq(await active(), 'test-amount-plus', 'the first Esc only leaves the typed field');
  await P.keyboard.press('Escape');
  T.eq(await t.scenes(), ['building', 'confirm'], 'Back with a typed amount: the sub-screen vetoes and the host asks to confirm');
  await t.shot(path.join(SHOTS, 'card-veto.png'));
  await t.clickUI('confirm-discard-no');
  T.eq(await ev(() => window.SR.ui.card.screens()), ['test.form'], '"Stay" keeps the sub-screen');
  await P.keyboard.press('Escape');
  await t.clickUI('confirm-discard-yes');
  T.eq(await ev(() => window.SR.ui.card.screens()), [], '"Leave it" closes it');
  T.eq(await ev(() => window.W1D.log.slice(-1)[0]), 'unmount test.form', 'and unmounts it');
  T.ok(!(await ev(() => document.querySelector('#ui [data-id="card-rows"]').hidden)), 'the rows are back');
  T.eq(await active(), 'row-testbank.form', 'focus is back on a row');
  // A sub-screen opened from a row, and the read-only state view.
  await P.keyboard.press('Enter');
  T.eq(await ev(() => window.SR.ui.card.screens()), ['test.form'], 'a row with `screen` opens its sub-screen');
  T.ok(/read-only/.test(await ev(() => window.W1D.roError || '')), 'ctx.state is a read-only view (a write throws)');
  T.eq(await ev(() => window.SR.state.money.cash), 90, 'and the state is unchanged by the attempt');
  await P.keyboard.press('Escape');
  // Door params reach a row's sub-screen; the row's own screenParams win over them.
  await ev(() => {
    const SR = window.SR;
    SR.def.text({ 'act.testbank.receipt': 'Ask for a receipt' });
    SR.def.action('testbank.receipt', { building: 'testbank', group: 'services', order: 30, icon: 'info', label: 'act.testbank.receipt', p: 0,
      screen: 'test.child', screenParams: { note: 'row' } });
    window.W1D.log.length = 0;
    SR.ui.card.open('testbank', { params: { note: 'door', mode: 'test' } });
  });
  await step(1);
  await focusRow('testbank.receipt');
  await P.keyboard.press('Enter');
  T.eq(await ev(() => window.W1D.log.slice()), ['mount test.child row'], 'a row\'s screenParams override the door params of the same name');
  await P.keyboard.press('Escape');
  // A row whose minigame cannot run yet (its skin still a stub): SR.minigame.run rejects, the card
  // shows a toast, and nothing is left as an unhandled rejection.
  await ev(() => {
    const SR = window.SR;
    SR.def.text({ 'act.testbank.table': 'Try the new table' });
    SR.def.action('testbank.table', { building: 'testbank', group: 'special', order: 10, icon: 'warning', label: 'act.testbank.table', p: 0,
      effects: [['open', 'test.none']] });
    SR.ui.toast.clear();
    SR.ui.card.refresh();
  });
  await focusRow('testbank.table');
  await P.keyboard.press('Enter');
  await P.waitForTimeout(30);
  const tableToasts = await ev(() => window.SR.ui.toast.list().map((x) => x.text));
  T.ok(tableToasts.some((x) => /not set up yet/.test(x)), 'a row whose minigame is not registered yet shows "The table is not set up yet"', tableToasts);
  T.eq(t.errors(), [], 'and no unhandled rejection or console error');
  await ev(() => window.SR.ui.toast.clear());

  // ------------------------------------------------------------ the dialog sheet over a building
  T.section('the dialog sheet (UI.md §5.7)');
  const openDlg = (o) => ev((o) => { window.__dlg = 'pending'; window.SR.ui.dialog.open(o).then((r) => { window.__dlg = r; }); }, o);
  await openDlg({ name: 'Officer Pat', text: 'Hold it right there.', choices: [{ id: 'talk', label: 'ui.ok' }, { id: 'run', label: 'ui.no' }] });
  T.eq(await ev(() => Array.from(document.querySelectorAll('#ui .dlg .btn-key')).map((k) => k.textContent)), ['1', '2'], 'each choice shows its hotkey digit (UI.md §5.7)');
  await ev(() => { window.__sfx.length = 0; });
  await P.keyboard.press('Escape');
  T.eq([await t.scenes(), await ev(() => window.__dlg), await ev(() => window.__sfx.indexOf('error') >= 0)], [['building', 'dialog'], 'pending', true],
    'Esc does nothing (an error cue) when the dialog offers no Leave: a stop cannot be escaped');
  await P.keyboard.press('Digit2');
  await P.waitForTimeout(20);
  T.eq(await ev(() => window.__dlg), { choice: 'run' }, 'hotkey 2 picks the second choice');
  await ev(() => window.SR.debug.fast(false));      // let the line type
  await openDlg({ name: 'Harold', text: 'The sky ate my hat once. Still waiting for it to come back down.',
    choices: [{ id: 'give', label: 'ui.ok' }, { id: 'leave', label: 'ui.leave' }] });
  await P.waitForTimeout(60);
  await P.keyboard.press('Enter');
  await P.waitForTimeout(30);
  const typed = await ev(() => {
    const sp = document.querySelector('#ui [data-id="dialog-text"]');
    return { r: window.__dlg, shown: sp ? sp.querySelector('.speech-text').textContent.length : -1, full: sp ? sp.querySelector('.speech-ghost').textContent.length : -2 };
  });
  T.ok(typed.r === 'pending' && typed.shown === typed.full, 'Enter while the line types completes it and commits nothing', typed);
  await P.keyboard.press('Enter');
  await P.waitForTimeout(20);
  T.eq(await ev(() => window.__dlg), { choice: 'give' }, 'the next Enter picks the focused choice');
  await ev(() => window.SR.debug.fast(true));

  // ------------------------------------------------------------ wave-2 requests (desk-present)
  T.section('wave-2 requests: row: false, greetings, titles, chips, stingers, the Pocket over a dialog');
  await ev(() => {
    const SR = window.SR;
    SR.def.text({ 'act.testshop.commitOnly': 'Commit only', 'act.testshop.flagIt': 'Change the situation', 'act.testshop.brawl': 'Start a brawl',
      'act.testshop.newBed': 'Take a bed', 'test.greetA': 'Situation A, first words.', 'test.greetA2': 'Situation A, other words.',
      'test.greetB': 'Situation B now.', 'test.titleB': 'Test Shop (B)' });
    // W2-Civic 1: a sub-screen's commit is never a card row.
    SR.def.action('testshop.commitOnly', { building: 'testshop', group: 'special', order: 50, icon: 'warning', label: 'act.testshop.commitOnly', p: 0, row: false, effects: [] });
    SR.def.action('testshop.flagIt', { building: 'testshop', group: 'special', order: 60, icon: 'star', label: 'act.testshop.flagIt', p: 0, effects: [['flag', 'w2greet']] });
    SR.def.action('testshop.brawl', { building: 'testshop', group: 'special', order: 70, icon: 'warning', label: 'act.testshop.brawl', p: 0,
      effects: [['karma', -2], ['open', 'test.none']] });
    SR.def.fn('test.giveBed', function (s) { s.furniture.owned.bed = 1; return {}; });
    // A sub-screen taller than the card body (W2-Money 2).
    SR.def.subscreen('test.tall', { title: 'ui.back', mount: function (root) { const d = document.createElement('div'); d.style.height = '2000px'; d.textContent = 'tall'; root.appendChild(d); } });
    SR.def.action('testshop.newBed', { building: 'testshop', group: 'special', order: 80, icon: 'bed', label: 'act.testshop.newBed', p: 0,
      cost: { cash: 5 }, effects: [['fn', 'test.giveBed']] });
    // W2-Civic 6 / W2-Home 7: a greeting fn with variants, and a title fn, that follow the situation.
    SR.def.fn('greet.testshop', function (s, params, ctx) {
      return s.flags.w2greet ? { key: 'test.greetB' } : { key: ctx.rng.chance(0.5) ? 'test.greetA' : 'test.greetA2' };
    });
    SR.def.fn('title.testshop', function (s) { return s.flags.w2greet ? 'test.titleB' : null; });
    // W2-Civic 5: a building's song by the state.
    SR.def.fn('music.testshop', function () { return { id: 'paper_sky', variant: 'w2' }; });
    window.__stingers = [];
    const realSting = SR.audio.stinger;
    SR.audio.stinger = function (id) { window.__stingers.push(id); return typeof realSting === 'function' ? realSting.apply(this, arguments) : null; };
    window.__beds = [];
    const realBed = SR.audio.ambience;
    SR.audio.ambience = function (id, lv) { window.__beds.push([id, lv]); return typeof realBed === 'function' ? realBed.apply(this, arguments) : undefined; };
    window.__music.length = 0;
    SR.debug.set({ money: { cash: 500 }, stats: { hp: 10 }, flags: { w2greet: false }, furniture: { owned: { bed: 0 } } });
  });
  await t.enter('testshop');
  await step(2);
  const w2rows = await ev(() => window.SR.ui.card.rows().map((r) => r.id));
  T.ok(w2rows.indexOf('testshop.commitOnly') < 0 && w2rows.indexOf('testshop.flagIt') >= 0, 'an action marked row: false is never a card row (W2-Civic 1)', w2rows);
  T.ok(await ev(() => window.SR.preview('testshop.commitOnly').ok === true), 'and it still previews and commits through SR.act (a sub-screen\'s ctx.act)');
  T.eq(await ev(() => window.__music.slice(-1)[0]), ['paper_sky', { fade: 0.6, variant: 'w2' }], 'the song comes from music.<building> with its variant (W2-Civic 5)');
  const greetText = () => ev(() => { const e = document.querySelector('#ui [data-id="card-greeting"]'); return e ? e.textContent : ''; });
  const g0 = await greetText();
  T.ok(/Situation A/.test(g0), 'the greeting fn speaks first', g0);
  await focusRow('testshop.fries');
  await P.keyboard.press('Enter');
  await step(1);
  T.eq(await greetText(), g0, 'an action that leaves the situation alone keeps the same line (no new variant re-typed)');
  await focusRow('testshop.flagIt');
  await P.keyboard.press('Enter');
  await step(1);
  T.ok(/Situation B/.test(await greetText()), 'an action that changes the situation re-picks the greeting (W2-Civic 6)', await greetText());
  T.eq(await ev(() => document.querySelector('#ui [data-id="card-title"]').textContent), 'Test Shop (B)', 'and title.<building> renames the card (W2-Home 7)');
  // W2-Night 3: a row whose Result opens a minigame flies no chips across the frame opening over it.
  await ev(() => window.SR.debug.fast(false));
  await focusRow('testshop.brawl');
  await P.keyboard.press('Enter');
  const flying = await ev(() => document.querySelectorAll('#ui .chip--fly').length);
  await focusRow('testshop.fries');
  await P.keyboard.press('Enter');
  const flyingFries = await ev(() => document.querySelectorAll('#ui .chip--fly').length);
  await ev(() => { window.SR.debug.fast(true); window.SR.ui.toast.clear(); });
  T.ok(flying === 0 && flyingFries > 0, 'a Result with `open` flies no chips; a plain one still does (W2-Night 3)', { flying, flyingFries });
  await P.waitForTimeout(300);
  // W2-Goods 1: a furniture Delta floats nothing over your stick (the chip names the piece).
  await step(70);                                   // the earlier floats rise and go (900 ms)
  await focusRow('testshop.newBed');
  await P.keyboard.press('Enter');
  const bedFloats = await ev(() => window.SR.ui.building.info().floats);
  T.eq(bedFloats, 1, 'buying a piece floats only the cash, not "bed" (W2-Goods 1)');
  // W2-Goods 1, W2-Home 8, W2-Money 1, W2-Civic 4: chips name the piece, the home, the rank, the item.
  const names = await ev(() => {
    const SR = window.SR, c = (d) => { const el = SR.ui.chip.fromDelta(d); return el ? el.textContent : null; };
    const g = (gain) => SR.ui.chip.gains({ gains: [gain] })[0].textContent;
    SR.debug.set({ job: { ranks: { nli: null } }, furniture: { owned: { bed: 1 } } });
    return {
      bed: c({ kind: 'furniture', key: 'bed', n: 1, from: 0, to: 1 }), pod: c({ kind: 'furniture', key: 'bed', n: 1, from: 1, to: 2 }),
      podGain: g({ kind: 'furniture', key: 'bed', n: 1 }),
      living: c({ kind: 'home', key: 'living', n: 2, from: 'apt', to: 'pent' }), owned: c({ kind: 'home', key: 'owned', n: 1, from: ['apt'], to: ['apt', 'pent'] }),
      sold: c({ kind: 'home', key: 'owned', n: -1, from: ['apt', 'pent'], to: ['apt'] }), homeGain: g({ kind: 'home', key: 'living', n: 1 }),
      rank: c({ kind: 'job', key: 'nli', n: 1, from: null, to: 'janitor' }), rankGain: g({ kind: 'job', key: 'nli', n: 1 }),
      diploma: g({ kind: 'item', key: 'diplomas', n: 1 }),
      want: { bed: SR.text('furn.bed'), pod: SR.text('furn.pod'), pent: SR.text('home.pent'), janitor: SR.text('job.janitor'), diploma: SR.text('item.diploma') },
    };
  });
  T.eq([names.bed, names.pod, names.podGain], [names.want.bed, names.want.pod, names.want.pod], 'a furniture chip names the piece at its tier (Delta and Preview gain)');
  T.eq([names.living, names.owned, names.homeGain], [names.want.pent, names.want.pent, 'New home'], 'a home chip names the home (living, owned), "New home" for a bare gain');
  T.ok(names.sold.indexOf(names.want.pent) >= 0 && /^-/.test(names.sold), 'a sale reads "-1 <home>"', names.sold);
  T.eq([names.rank, names.rankGain], [names.want.janitor, names.want.janitor], 'a job chip names the rank, not the track "nli" (Delta, and the gain off the ladder)');
  T.eq(names.diploma, '+1 ' + names.want.diploma, 'an item chip keyed by its state list names the item ("+1 Diploma", not "diplomas")');
  // W2-Music 1 / W2-Transit 7: the Stamp's stinger by its key.
  const stings = await ev(() => {
    const S = window.SR.ui.stamp;
    return ['stamp.jobs.janitor', 'stamp.jobs.hired', 'stamp.training.business', 'stamp.hospital.flatlined', 'stamp.crime.jailed', 'stamp.stats.int', 'stamp.crime.store']
      .map((key) => S.stingerFor({ key })).concat([S.stingerFor({ key: 'stamp.stats.int', sting: false }), S.stingerFor({ text: 'HELLO' })]);
  });
  T.eq(stings, ['promotion', 'stamp', null, null, null, 'stamp', 'stamp', null, 'stamp'],
    'stingers: promotion for a rank, none for a degree, FLATLINED and BOOKED (their scenes play theirs), the triad otherwise; sting: false silences');
  const played = await ev(() => {
    const SR = window.SR;
    SR.ui.stamp.clear();
    window.__stingers.length = 0;
    SR.ui.stamp({ key: 'stamp.hospital.flatlined', text: 'FLATLINED' });
    SR.ui.stamp.clear();
    SR.ui.stamp({ key: 'stamp.jobs.janitor', text: 'JANITOR' });
    SR.ui.stamp.clear();
    return { calls: window.__stingers.slice(), promo: !!(SR.reg.song && SR.reg.song['stingers.promotion']) };
  });
  T.eq(played.calls, played.promo ? ['promotion'] : ['stamp'], 'FLATLINED lands without the triad; a promotion plays the fanfare', played);
  // W2-Money 2: a sub-screen opened from low in a scrolled list starts at the top.
  await ev(() => { const b = document.querySelector('#ui [data-id="card-body"]'); b.style.maxHeight = '200px'; b.scrollTop = 400; });
  const scrolled = await ev(() => document.querySelector('#ui [data-id="card-body"]').scrollTop);
  await ev(() => { window.SR.ui.card.push('test.tall', {}); });   // (its promise resolves on pop)
  const top = await ev(() => document.querySelector('#ui [data-id="card-body"]').scrollTop);
  T.ok(scrolled > 0 && top === 0, 'a sub-screen opens scrolled to the top of the card body (W2-Money 2)', { scrolled, top });
  await ev(() => { window.SR.ui.card.pop(); document.querySelector('#ui [data-id="card-body"]').style.maxHeight = ''; });
  // W2-Pocket 2: the Pocket opens over a dialog by its keys (not Tab), unless the dialog says no.
  if (await ev(() => !!window.SR.reg.scene.pocket)) {
    await openDlg({ id: 'street-test', person: 'harold', text: 'Spare a minute?', choices: [{ id: 'leave', label: 'ui.leave' }] });
    T.eq(await ev(() => (window.SR.ui.dialog.current() || {}).id), 'street-test', 'SR.ui.dialog.current() gives the open sheet\'s params');
    await P.keyboard.press('Tab');
    T.eq(await t.scenes(), ['building', 'dialog'], 'Tab does not open the Pocket over a dialog (D57)');
    await P.keyboard.press('KeyI');
    await step(1);
    const pk = await ev(() => ({ stack: window.SR.scenes.stack(), tab: window.SR.ui.pocket && window.SR.ui.pocket.current ? window.SR.ui.pocket.current().tab : null }));
    T.eq([pk.stack, pk.tab], [['building', 'dialog', 'pocket'], 'bag'], 'the Bag key opens the Pocket on the Bag over the street dialog (W2-Pocket 2)', pk);
    await ev(() => window.SR.scenes.pop());
    await ev(() => window.SR.scenes.pop({ choice: 'leave' }));
    await openDlg({ id: 'stop-test', name: 'Officer Pat', text: 'Hands where I can see them.', pocket: false, choices: [{ id: 'talk', label: 'ui.ok' }] });
    await P.keyboard.press('KeyI');
    await step(1);
    T.eq(await t.scenes(), ['building', 'dialog'], 'a dialog with pocket: false keeps the Pocket shut');
    await ev(() => window.SR.scenes.pop({ choice: 'talk' }));
  }
  // W2-Music 4: an interior's ambience bed under its song, faded on leaving.
  await ev(() => { window.__beds.length = 0; });
  await t.enter('bank');
  await step(2);
  const bedsIn = await ev(() => window.__beds.slice());
  await t.enter('testbank');
  await step(2);
  const bedsOut = await ev(() => window.__beds.slice());
  T.ok(bedsIn.some((b) => b[0] === 'office' && b[1] === 1) && bedsOut.some((b) => b[0] === 'office' && b[1] === 0),
    'the bank plays the office hum and fades it when you leave (W2-Music 4)', bedsOut);
  // Toasts over a menu panel sit at the bottom centre and let taps through ("Saved to Slot 1." covered
  // Slot 1's own Save here at the lane's usual y 104).
  if (await ev(() => !!window.SR.reg.scene.saveload)) {
    const laneAt = () => ev(() => { const l = document.querySelector('#ui .toast-lane'); const b = l.getBoundingClientRect(); return { top: Math.round(b.top), pe: getComputedStyle(l).pointerEvents }; });
    await ev(() => { window.SR.ui.toast.clear(); window.SR.scenes.push('saveload', { mode: 'save' }); });
    await step(2);
    await ev(() => { window.SR.ui.toast({ text: 'Saved to Slot 1.' }); });
    const over = await laneAt();
    await ev(() => { window.SR.ui.toast.clear(); window.SR.scenes.pop(); });
    await step(2);
    await ev(() => { window.SR.ui.toast({ text: 'Back in the shop.' }); });
    const back = await laneAt();
    T.ok(over.top >= 560 && over.pe === 'none' && back.top < 200 && back.pe === 'auto', 'over Save / Load the toasts sit at the bottom and let taps through; elsewhere at the top lane', { over, back });
  }
  await ev(() => {
    const SR = window.SR;
    ['greet.testshop', 'title.testshop', 'music.testshop'].forEach((k) => { delete SR.reg.fn[k]; });
    SR.ui.toast.clear();
  });
  T.eq(t.errors(), [], 'zero console errors (wave-2 requests)');

  // ------------------------------------------------------------ leaving
  T.section('leaving');
  await ev(() => { window.__ev.length = 0; });
  await P.keyboard.press('Escape');
  const after = await t.scenes();
  const cityRegistered = await ev(() => !!window.SR.reg.scene.city);
  T.eq(after, [cityRegistered ? 'city' : 'title'], 'Esc with no sub-screen leaves for the city (' + (cityRegistered ? 'city' : 'title while city is a stub') + ')');
  T.ok((await ev(() => window.__ev.slice())).some((e) => e.n === 'door:exited' && e.p.id === 'testbank'), 'door:exited on leaving');
  // The city mounts its own full HUD (UI §5.5); the building's card and compact strip must go.
  T.eq(await ev(() => document.querySelectorAll('#ui [data-scene="building"], #ui .bcard, #ui .hud.is-compact').length), 0, 'the card and the compact HUD unmount');

  // ------------------------------------------------------------ resolutions
  T.section('screenshots at other resolutions');
  for (const [w, hgt] of [[1366, 768], [1920, 1080]]) {
    await P.setViewportSize({ width: w, height: hgt });
    await P.waitForTimeout(250);
    await t.enter('testshop');
    await step(2);
    await t.shot(path.join(SHOTS, 'card-' + w + 'x' + hgt + '.png'));
    const fit = await ev(() => { const r = document.querySelector('#ui .bcard').getBoundingClientRect(); return r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && r.top >= 0; });
    T.ok(fit, 'the card fits the stage at ' + w + '×' + hgt);
  }
  T.eq(t.errors(), [], 'zero console errors (desktop)');
  await t.close();

  // ------------------------------------------------------------ touch
  T.section('touch: tap, long-press repeat, drag-scroll, touch-compact');
  t = await setup({ touch: true, width: 844, height: 390 });
  const Q = t.page;
  const qev = (fn, arg) => Q.evaluate(fn, arg);
  await qev(() => window.SR.debug.set({ stats: { str: 200, hpMax: 215, hp: 10 }, money: { cash: 200 } }));
  await t.enter('testshop');
  await qev(() => window.W1D.step(2));
  const compact = await qev(() => ({ layout: document.getElementById('app').getAttribute('data-layout'), card: document.querySelector('#ui .bcard').getBoundingClientRect().toJSON(), w: window.innerWidth, h: window.innerHeight }));
  T.eq(compact.layout, 'compact', 'a coarse pointer at 844×390 uses the touch-compact layout');
  T.ok(Math.abs(compact.card.right - compact.w) <= 1 && compact.card.top <= 1 && Math.abs(compact.card.bottom - compact.h) <= 1, 'the card becomes a full-height right-hand sheet', compact);
  await t.shot(path.join(SHOTS, 'card-touch-compact.png'));
  let c0 = await qev(() => window.SR.state.money.cash);
  await Q.tap('#ui [data-id="row-testshop.fries"]');
  T.eq(await qev(() => window.SR.state.money.cash), c0 - 12, 'a tap runs a row once');
  // Long-press: at 500 ms the row runs and then repeats every repeatHoldMs while the finger stays.
  const cdp = await t.context.newCDPSession(Q);
  const box = await Q.locator('#ui [data-id="row-testshop.shake"]').boundingBox();
  const px = box.x + box.width / 2, py = box.y + box.height / 2;
  c0 = await qev(() => window.SR.state.money.cash);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] });
  await Q.waitForTimeout(650);
  const lp1 = await qev(() => window.SR.state.money.cash);
  await qev(() => window.W1D.step(21));
  const lp2 = await qev(() => window.SR.state.money.cash);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await Q.waitForTimeout(100);
  await qev(() => window.W1D.step(42));
  const lp3 = await qev(() => window.SR.state.money.cash);
  T.ok(lp1 === c0 - 8 && lp2 === c0 - 16 && lp3 === lp2, 'a long-press runs at 500 ms, repeats while held, stops on release (no extra tap)', [c0, lp1, lp2, lp3]);
  // A long-press whose finger then drags away (the browser takes the pan: pointercancel, no click)
  // must not swallow the next tap on that row.
  c0 = await qev(() => window.SR.state.money.cash);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] });
  await Q.waitForTimeout(650);
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py - i * 15 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await Q.waitForTimeout(100);
  await qev(() => window.W1D.step(2));
  const lp4 = await qev(() => window.SR.state.money.cash);
  await qev(() => { const b = document.querySelector('#ui [data-id="card-body"]'); b.scrollTop = 0; });
  await Q.tap('#ui [data-id="row-testshop.shake"]');
  const lp5 = await qev(() => window.SR.state.money.cash);
  T.ok(lp4 === c0 - 8 && lp5 === lp4 - 8, 'after a long-press that dragged off, the next tap on the row runs it', [c0, lp4, lp5]);
  // Drag-scroll the long card body.
  const body = await Q.locator('#ui [data-id="card-body"]').boundingBox();
  const sc0 = await qev(() => { const b = document.querySelector('#ui [data-id="card-body"]'); return { top: b.scrollTop, room: b.scrollHeight - b.clientHeight }; });
  T.ok(sc0.room > 50, 'the card body is longer than the card (' + sc0.room + ' px to scroll)');
  const bx = body.x + body.width / 2, by0 = body.y + body.height * 0.8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx, y: by0 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bx, y: by0 - i * 15 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await Q.waitForTimeout(300);
  const sc1 = await qev(() => document.querySelector('#ui [data-id="card-body"]').scrollTop);
  T.ok(sc1 > sc0.top + 40, 'a touch drag scrolls the card body (' + sc0.top + ' → ' + sc1 + ')');
  T.eq(await qev(() => getComputedStyle(document.querySelector('#ui [data-id="card-body"]')).touchAction), 'pan-y', 'the card body is touch-action: pan-y');
  // W2-City request 4: the city HUD fits a phone between its 16 px gutters (the Pause button ran past
  // the window at 844 × 390), and on a narrower phone too.
  if (await qev(() => !!window.SR.reg.scene.city)) {
    for (const [w, hgt] of [[844, 390], [667, 375]]) {
      await t.resize(w, hgt);
      await t.goto('city');
      await qev(() => window.W1D.step(2));
      const fitHud = await qev(() => {
        const r = (s) => { const el = document.querySelector('#ui [data-scene="city"] ' + s); return el ? el.getBoundingClientRect().toJSON() : null; };
        return { vw: window.innerWidth, hud: r('.hud'), right: r('.hud-right'), pause: r('[data-id="hud-pause"]'), centre: r('.hud-centre'), left: r('.hud-left') };
      });
      T.ok(fitHud.pause && fitHud.pause.right <= fitHud.vw - 8 && fitHud.right.right <= fitHud.vw - 8 && fitHud.left.right <= fitHud.centre.left && fitHud.centre.right <= fitHud.right.left,
        'the city HUD fits ' + w + '×' + hgt + ': its cards side by side, Pause inside the window', fitHud);
    }
  }
  T.eq(t.errors(), [], 'zero console errors (touch)');
  await t.close();

  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
