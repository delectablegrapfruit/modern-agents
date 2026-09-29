// tests/e2e/pocket.test.cjs — owner: W2-Pocket. The Pocket (BUILD_PLAN §4.12; UI §5.9, §6; GDD §6.4):
// every tab by keyboard (Tab, Q / E, the arrows and Enter, M / I / J, Esc and Tab to close, and Esc's
// `pause` never reaching the scene below), mouse (the HUD button, the rail, the close button, the
// scrim), gamepad (a mocked standard pad: Select, LB / RB, the D-pad, A, B) and touch (a coarse
// pointer at 844 × 390: taps, a swipe to turn the page, lists that scroll with a finger); the Bag:
// smoking (orig rules: 1 h, +1 CHA, -10 HP, -1 karma; "Too hurt" at HP ≤ 10), the pill toggle,
// takeout (P1), and Give over a street dialog running the dialog row's own action (the same state as
// the row gives); the Map: pins, filters, zoom, a place's card and a waypoint that leads the
// click-to-walk route (over the city at once, from a building once you step out, cleared on
// arrival); Stats, Journal (First Day, Help), Messages (no phone: at home only); the P1 Phone
// (apps, the Cab, Summon car, contacts) and Achievements behind their flags; the a11y audit of every
// tab; screenshots in shots/W2-Pocket/; zero console errors and no missing text keys.
//   node tests/e2e/pocket.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Pocket');
// BALANCE B-03 `smoke` and B-04a `smoke`, copied (not read from tuning) so the test checks the rules.
const SMOKE = { min: 60, cha: 1, hp: 10, karma: -1 };
const P0_TABS = ['journal', 'map', 'stats', 'bag', 'messages'];

(async () => {
  const T = h.suite('e2e pocket (W2-Pocket)');
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ fast: true });
  const P = t.page;
  const ev = (fn, arg) => t.eval(fn, arg);

  /** Runs a section; a throw fails it without stopping the suite. */
  const section = async (name, fn) => {
    T.section(name);
    try { await fn(); } catch (e) { T.ok(false, 'threw: ' + (e && e.stack || e)); }
  };
  const stack = () => t.scenes();
  const cur = () => ev(() => { const c = window.SR.ui.pocket.current(); return c ? c.tab : null; });
  const dbg = () => ev(() => window.SR.ui.pocket.debug());
  const active = () => ev(() => { const a = document.activeElement; return a ? a.getAttribute('data-id') : null; });
  const exists = (id) => ev((id) => !!document.querySelector('#ui [data-id="' + id + '"]'), id);
  /** A new game in the city (tutorial on, day 1), then a deep patch of the state. */
  const fresh = async (patch, seed) => {
    await t.newGame({ seed: seed || 11 });
    await t.goto('city');
    if (patch) await t.set(patch);
    await t.step(1);
  };
  const closeAll = () => ev(() => { const SR = window.SR; while (SR.scenes.stack().length > 1) SR.scenes.pop(); return SR.scenes.stack(); });
  const mockPad = () => ev(() => {
    window.__pad = { id: 'Xbox Wireless Controller (mock)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad, null, null, null] });
    return true;
  });
  const pad = (b) => ev((b) => {
    const set = (on) => { window.__pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; window.__pad.timestamp++; };
    set(true); window.SR.loop.step(1); set(false); window.SR.loop.step(1);
    return true;
  }, b);

  // ------------------------------------------------------------------------------------------------
  await section('the Pocket opens over the city and freezes it', async () => {
    await fresh({ items: { smokes: 3, pills: 1, booze: 2 } });
    T.eq(await ev(() => !!window.SR.reg.scene.pocket && window.SR.reg.scene.pocket.kind), 'overlay', 'the pocket scene is an overlay (CONTRACT §11.3)');
    await t.key('Tab');
    await t.step(1);
    T.eq(await stack(), ['city', 'pocket'], 'Tab opens the Pocket over the city');
    const d = await dbg();
    T.eq(d.tabs, P0_TABS, 'the P0 tabs in the rail\'s order: Journal · Map · Stats · Bag · Messages (Phone and Achievements hide with their flags)');
    T.eq(await active(), 'pocket-tab-' + d.tab, 'focus starts on the open tab of the rail');
    const box = await ev(() => { const r = document.querySelector('#ui [data-id="pocket"]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
    T.eq(box, [80, 48, 1120, 640], 'the notebook fills UI §2.2\'s region 80-1200 × 48-688');
    const frozen = await ev(() => { const SR = window.SR, a = SR.state.clock.min, x = SR.world.player.x; SR.debug.hold('right', 30); return [SR.state.clock.min === a, SR.world.player.x === x]; });
    T.eq(frozen, [true, true], 'the city freezes under it (blocksUpdate): holding right moves nobody');
    T.eq(await ev(() => window.SR.input.contexts().indexOf('tabs') >= 0), true, 'the `tabs` input context is pushed while it is open');
    await t.key('Tab');
    await t.step(1);
    T.eq(await stack(), ['city'], 'Tab closes it again (D57), and the `tabs` context goes with it');
    T.eq(await ev(() => window.SR.input.contexts().indexOf('tabs')), -1, '… popped');
  });

  // ------------------------------------------------------------------------------------------------
  await section('keyboard: Q / E, arrows and Enter, M / I / J, Esc', async () => {
    await fresh({ items: { smokes: 3 } });
    await ev(() => window.SR.ui.pocket.open('journal'));
    await t.step(1);
    const seen = [await cur()];
    for (let k = 0; k < P0_TABS.length; k++) { await t.key('KeyE'); seen.push(await cur()); }
    T.eq(seen, P0_TABS.concat(['journal']), 'E walks every tab and wraps (tabNext)');
    await t.key('KeyQ');
    T.eq(await cur(), 'messages', 'Q goes back (tabPrev), wrapping');
    const panels = [];
    for (const id of P0_TABS) {
      await ev((id) => window.SR.ui.pocket.select(id), id);
      panels.push(await ev((id) => { const p = document.querySelector('#ui [data-id="pocket-panel"][data-tab="' + id + '"]'); return !!p && p.childNodes.length > 0 && !p.querySelector('[data-id="pocket-nogame"]'); }, id));
    }
    T.eq(panels, P0_TABS.map(() => true), 'every tab mounts its own page');
    // Arrows move focus along the rail; Enter opens the focused tab.
    await ev(() => { window.SR.ui.pocket.select('journal'); window.SR.ui.focus.focus(document.querySelector('#ui [data-id="pocket-tab-journal"]')); });
    await t.key('ArrowDown');
    T.eq(await active(), 'pocket-tab-map', 'ArrowDown moves focus to the next tab');
    await t.key('Enter');
    T.eq(await cur(), 'map', 'Enter opens it');
    await t.key('ArrowDown'); await t.key('ArrowDown');
    await t.key('Enter');
    T.eq(await cur(), 'bag', 'and so on down the rail');
    await t.key('ArrowRight');
    const inPage = await ev(() => { const a = document.activeElement; return !!a && !!a.closest('[data-id="pocket-panel"][data-tab="bag"]'); });
    T.ok(inPage, 'ArrowRight moves focus into the page');
    // M / I / J jump; the same key again closes.
    await t.key('KeyM');
    T.eq(await cur(), 'map', 'M jumps to the Map');
    await t.key('KeyJ');
    T.eq(await cur(), 'journal', 'J to the Journal');
    await t.key('KeyI');
    T.eq(await cur(), 'bag', 'I to the Bag');
    await t.key('KeyI');
    T.eq(await stack(), ['city'], 'I again closes it');
    await t.key('KeyM');
    T.eq([await stack(), await cur()], [['city', 'pocket'], 'map'], 'M in the city opens the Pocket on its Map');
    // Esc: back and pause in one press; the pause menu must not open under the closing Pocket.
    await t.key('Escape');
    await t.step(1);
    T.eq(await stack(), ['city'], 'Esc closes it, and its `pause` does not reach the city (no pause menu)');
    await ev(() => window.SR.ui.pocket.open('bag'));
    await t.key('Backspace');
    T.eq(await stack(), ['city'], 'Backspace (back) closes it too');
  });

  // ------------------------------------------------------------------------------------------------
  await section('mouse: the HUD button, the rail, the close button and the scrim', async () => {
    await fresh({ items: { smokes: 3 } });
    await t.clickUI('hud-pocket');
    await t.step(1);
    T.eq(await stack(), ['city', 'pocket'], 'the HUD\'s Pocket button opens it');
    const got = [];
    for (const id of P0_TABS) { await t.clickUI('pocket-tab-' + id); got.push(await cur()); }
    T.eq(got, P0_TABS, 'a click on each rail tab opens it');
    T.eq(await ev(() => Array.from(document.querySelectorAll('#ui [data-scene="pocket"] [role="tab"][aria-selected="true"]')).map((b) => b.getAttribute('data-tab')).filter(Boolean)), ['messages'],
      'exactly the open tab is aria-selected');
    await t.clickUI('pocket-close');
    T.eq(await stack(), ['city'], 'the close button closes it');
    await t.clickUI('hud-pocket');
    await P.mouse.click(40, 700);
    await t.step(1);
    T.eq(await stack(), ['city'], 'a click on the dimmed world (the scrim) closes it');
    // From a building: the compact HUD's button; Tab there moves focus and never opens it.
    await t.enter('mcsticks');
    await t.step(1);
    await t.key('Tab');
    T.eq(await stack(), ['building'], 'Tab in a building card moves focus instead (D57)');
    await t.clickUI('hud-pocket');
    await t.step(1);
    T.eq(await stack(), ['building', 'pocket'], 'the compact HUD\'s button opens it over a building');
    await t.key('Tab');
    T.eq(await stack(), ['building'], 'and Tab closes it there too');
  });

  // ------------------------------------------------------------------------------------------------
  await section('gamepad: Select, LB / RB, the D-pad, A and B', async () => {
    await fresh({ items: { smokes: 3 } });
    await mockPad();
    await pad(8);
    T.eq(await stack(), ['city', 'pocket'], 'Select (View) opens the Pocket');
    await ev(() => window.SR.ui.pocket.select('journal'));
    await pad(5);
    T.eq(await cur(), 'map', 'RB: the next tab');
    await pad(5); await pad(5);
    T.eq(await cur(), 'bag', 'RB again');
    await pad(4);
    T.eq(await cur(), 'stats', 'LB: the previous tab');
    await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="pocket-tab-stats"]')));
    await pad(13);
    T.eq(await active(), 'pocket-tab-bag', 'D-pad down moves focus along the rail');
    await pad(0);
    T.eq(await cur(), 'bag', 'A opens the focused tab');
    await pad(1);
    await t.step(1);
    T.eq(await stack(), ['city'], 'B closes it');
    await pad(8);
    await pad(8);
    T.eq(await stack(), ['city'], 'Select toggles it closed');
  });

  // ------------------------------------------------------------------------------------------------
  await section('the Bag: smoke a pack (orig), "Too hurt" at HP ≤ 10', async () => {
    await fresh({ items: { smokes: 2 } });
    await ev(() => window.SR.ui.pocket.open('bag', { item: 'smokes' }));
    await t.step(1);
    const s0 = await t.state();
    const pv0 = await t.preview('bag.smoke', {});
    T.ok(pv0.ok, 'a pack in the Bag at full HP can be smoked', { reason: pv0.reason, vars: pv0.vars, clock: s0.clock, stats: s0.stats, over: s0.over, jail: s0.jail });
    T.eq(await ev(() => document.querySelector('#ui [data-id="bag-use"]').getAttribute('data-action')), 'bag.smoke', 'the smokes\' Use is bag.smoke (items.js `use`)');
    const chips = await ev(() => Array.from(document.querySelectorAll('#ui [data-id="bag-use-chips"] .chip')).map((c) => c.getAttribute('data-chip')));
    T.ok(['time', 'hp', 'item', 'stat', 'karma'].every((k) => chips.indexOf(k) >= 0), 'its chips show the hour, the HP, the pack, +1 CHA and the karma', chips);
    await t.clickUI('bag-use');
    await t.step(1);
    const s1 = await t.state();
    T.eq([s1.clock.min - s0.clock.min, s1.stats.cha - s0.stats.cha, s0.stats.hp - s1.stats.hp, s1.stats.karma - s0.stats.karma, s0.items.smokes - s1.items.smokes],
      [SMOKE.min, SMOKE.cha, SMOKE.hp, SMOKE.karma, 1], 'Smoke a pack: 1 h, +1 CHA, -10 HP, -1 karma, one pack used (B-03, B-04a; orig)');
    await t.set({ stats: { hp: 10 } });
    await ev(() => window.SR.ui.pocket.refresh());
    await t.step(1);
    const refused = await ev(() => ({ dis: document.querySelector('#ui [data-id="bag-use"]').getAttribute('aria-disabled'),
      reason: (document.querySelector('#ui [data-id="bag-use-reason"]') || {}).textContent || '' }));
    T.eq(refused.dis, 'true', 'at HP 10 the Use is disabled…');
    T.eq(refused.reason, await ev(() => window.SR.text('reason.tooHurt', { n: 10 })), '… with "Too hurt" (HP must be above 10, orig)');
    const before = await t.state();
    await ev(() => document.querySelector('#ui [data-id="bag-use"]').click());   // a disabled control still takes the click (and refuses)
    await t.step(1);
    const after = await t.state();
    T.eq([after.items.smokes, after.stats.hp, after.clock.min], [before.items.smokes, before.stats.hp, before.clock.min], 'and a click refuses: nothing changes');
    await t.set({ stats: { hp: 11 } });
    T.eq((await t.preview('bag.smoke', {})).ok, true, 'HP 11 may smoke');
    // The pill toggle (free; W2-RulesE's items.pillToggle): the switch flips clock.pillAuto.
    const p0 = (await t.state()).clock.pillAuto;
    await ev(() => document.querySelector('#ui [data-id="bag-pill-toggle"]').click());
    await t.step(1);
    const p1 = await t.state();
    T.eq([p1.clock.pillAuto, p1.clock.min], [!p0, after.clock.min], 'the pill toggle flips the auto-use and takes no time');
    await closeAll();
  });

  // ------------------------------------------------------------------------------------------------
  await section('the Bag\'s Give runs the dialog row\'s own action', async () => {
    const talk = async () => {
      await fresh({ items: { booze: 2 }, money: { cash: 100 } }, 23);
      return ev(() => {
        const SR = window.SR, spot = SR.world.streetnpcs.placeOf('harold');
        SR.debug.teleport(spot.x + 30, spot.y);
        SR.world.streetnpcs.talk('harold');
        return { stack: SR.scenes.stack(), choices: Array.from(document.querySelectorAll('#ui [data-scene="dialog"] [data-choice]')).map((e) => e.getAttribute('data-choice')) };
      });
    };
    const hasStreet = await ev(() => !!(window.SR.world.streetnpcs && typeof window.SR.world.streetnpcs.talk === 'function'));
    if (!hasStreet) { T.ok(false, 'W2-Street\'s street dialog is needed for this section'); return; }
    // 1. The dialog's own row, for reference.
    const d1 = await talk();
    T.eq(d1.stack, ['city', 'dialog'], 'Harold\'s dialog is open');
    const row = await ev(() => window.SR.world.streetnpcs.giveAction('booze', 'harold'));
    T.ok(d1.choices.indexOf(row) >= 0, 'the dialog offers the bottle gift as a row (' + row + ')');
    const ref0 = await t.state();
    await t.clickUI('choice-' + row);
    await t.step(2);
    const ref1 = await t.state();
    await closeAll();
    // 2. The same gift from the Bag, over the same dialog.
    await talk();
    await ev(() => { window.__done = []; window.__off = window.SR.events.on('action:done', (p) => window.__done.push(p.id)); });
    await t.clickUI('hud-pocket');
    await t.step(1);
    T.eq([await stack(), await cur()], [['city', 'dialog', 'pocket'], 'bag'], 'the Pocket opens over the dialog, on the Bag');
    T.ok(await exists('bag-talking'), 'the Bag says who you are talking to');
    await ev(() => window.SR.ui.pocket.select('bag', { item: 'booze' }));
    await t.step(1);
    T.eq(await ev(() => document.querySelector('#ui [data-id="bag-give"]').getAttribute('data-action')), row, 'the bottle\'s Give is the dialog row\'s action');
    const bag0 = await t.state();
    await t.clickUI('bag-give');
    await t.step(1);
    const bag1 = await t.state();
    T.eq(await ev(() => window.__done.filter((id) => id.indexOf('street.') === 0)), [row], 'Give ran exactly that action through SR.act');
    const diff = (a, b) => ({ booze: b.items.booze - a.items.booze, cha: b.stats.cha - a.stats.cha, karma: b.stats.karma - a.stats.karma,
      min: b.clock.min - a.clock.min, cash: b.money.cash - a.money.cash, bottles: (b.npc.harold.bottles || 0) - (a.npc.harold.bottles || 0) });
    T.eq(diff(bag0, bag1), diff(ref0, ref1), 'and changed the state exactly as the dialog row did (the bottle, the first-gift CHA, the hour, Harold\'s count)');
    T.eq(await stack(), ['city', 'dialog', 'pocket'], 'the dialog stays open under the Pocket');
    // Cash: the wallet's Give is Give $10; an item Harold does not take has no Give.
    await ev(() => window.SR.ui.pocket.select('bag', { item: 'cash' }));
    await t.step(1);
    T.eq(await ev(() => document.querySelector('#ui [data-id="bag-give"]').getAttribute('data-action')), await ev(() => window.SR.world.streetnpcs.giveAction('cash', 'harold')), 'the wallet gives the $10 row');
    await t.set({ items: { smokes: 2 } });
    await ev(() => window.SR.ui.pocket.select('bag', { item: 'smokes' }));
    await t.step(1);
    T.eq([await exists('bag-give'), await exists('bag-give-no')], [false, true], 'smokes: Harold won\'t take them (no Give)');
    await ev(() => { window.__off(); });
    await closeAll();
    await ev(() => window.SR.ui.pocket.open('bag', { item: 'booze' }));
    await t.step(1);
    T.eq([await exists('bag-give'), await exists('bag-talking')], [false, false], 'without a dialog under it the Bag has no Give');
    await closeAll();
  });

  // ------------------------------------------------------------------------------------------------
  await section('the Map: pins, filters, zoom, a place\'s card', async () => {
    await fresh();
    await t.key('KeyM');
    await t.step(1);
    const m0 = (await dbg()).panel;
    T.ok(m0.shown.indexOf('mcsticks') >= 0 && m0.shown.indexOf('person:harold') >= 0, 'doors and people are pinned', m0.shown);
    T.ok(m0.view.z <= 0.25 && m0.view.z >= m0.zMin - 1e-9, 'it opens on the whole island (zoom ' + m0.view.z.toFixed(3) + ')');
    await t.clickUI('map-zoom-in');
    const z1 = (await dbg()).panel.view.z;
    T.ok(Math.abs(z1 / m0.view.z - 1.5) < 1e-6, 'the + button zooms in ×1.5');
    for (let k = 0; k < 12; k++) await t.clickUI('map-zoom-in');
    T.eq((await dbg()).panel.view.z, 1, 'up to 1 (1 px per u)');
    await t.key('Minus');
    T.ok((await dbg()).panel.view.z < 1, 'Minus (zoomOut) zooms out');
    await t.clickUI('map-filter-people');
    const m1 = (await dbg()).panel;
    T.eq([m1.filters.people, m1.shown.some((id) => id.indexOf('person:') === 0), m1.shown.indexOf('mcsticks') >= 0], [false, false, true], 'the People filter hides the people, not the doors');
    await t.clickUI('map-filter-people');
    await t.clickUI('map-place-mcsticks');
    const card = await ev(() => ({ sel: window.SR.ui.pocket.debug().panel.sel, name: (document.querySelector('#ui [data-id="map-card-name"]') || {}).textContent,
      walk: (document.querySelector('#ui [data-id="map-card-walk"]') || {}).textContent || '', acts: (document.querySelector('#ui [data-id="map-card-actions"]') || {}).textContent || '' }));
    T.eq([card.sel, card.name], ['mcsticks', await ev(() => window.SR.text('place.mcsticks'))], 'a place from the list opens its card');
    T.ok(/\d+ s/.test(card.walk) && card.acts.length > 0, 'the card shows the walking time and what there is to do', card);
    // A click on a pin picks it (the card closed and the whole island in view); a drag pans.
    await t.key('Escape');
    for (let k = 0; k < 12; k++) await t.clickUI('map-zoom-out');
    const pinAt = await ev(() => { const d = window.SR.ui.pocket.panelDef('map'); return d.toScreen('bank'); });
    const cv = await ev(() => { const r = document.querySelector('#ui [data-id="map-canvas"]').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    await P.mouse.click(cv.x + pinAt.x, cv.y + pinAt.y);
    T.eq((await dbg()).panel.sel, 'bank', 'a click on a pin picks that place');
    const v0 = (await dbg()).panel.view;
    await P.mouse.move(cv.x + 300, cv.y + 200); await P.mouse.down(); await P.mouse.move(cv.x + 200, cv.y + 150, { steps: 5 }); await P.mouse.up();
    const v1 = (await dbg()).panel.view;
    T.ok(v1.x > v0.x && v1.y > v0.y, 'dragging pans the map', { v0, v1 });
    await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="map-canvas"]')));
    await t.key('ArrowLeft');
    T.ok((await dbg()).panel.view.x < v1.x, 'the arrows pan the focused map');
    await t.key('Escape');
    await t.step(1);
    T.eq([await stack(), (await dbg()).panel.sel], [['city', 'pocket'], null], 'Esc first closes the place\'s card…');
    await t.key('Escape');
    await t.step(1);
    T.eq(await stack(), ['city'], '… then the Pocket');
  });

  // ------------------------------------------------------------------------------------------------
  await section('a waypoint leads the click-to-walk route', async () => {
    await fresh();
    await t.key('KeyM');
    await t.clickUI('map-place-mcsticks');
    await t.clickUI('map-waypoint');
    await t.step(1);
    const r = await ev(() => { const SR = window.SR, P = SR.world.player; return { stack: SR.scenes.stack(), door: P.route && P.route.door, path: P.path.length, wp: SR.render.minimap.wp }; });
    T.eq(r.stack, ['city'], 'Set waypoint closes the Pocket over the city');
    T.ok(r.door === 'mcsticks' && r.path > 0, 'the click-to-walk route leads to the McSticks door', r);
    const door = await ev(() => { const d = window.SR.world.geometry.doorById.mcsticks; return { x: d.tc[0], y: d.tc[1] }; });
    T.ok(r.wp && Math.abs(r.wp.x - door.x) < 1 && Math.abs(r.wp.y - door.y) < 1, 'the minimap pins the waypoint', r.wp);
    let arrived = null;
    for (let k = 0; k < 20 && !arrived; k++) {
      await t.step(60);
      arrived = await ev(() => { const top = window.SR.scenes.top(); return top && top.id === 'building' ? top.params.id : null; });
    }
    T.eq(arrived, 'mcsticks', 'following it, you walk into McSticks');
    T.eq(await ev(() => window.SR.render.minimap.wp), null, 'arriving clears the waypoint');
    // From a building: the route starts once you step outside.
    await ev(() => window.SR.ui.pocket.open('map'));
    await t.clickUI('map-place-bank');
    await t.clickUI('map-waypoint');
    await t.step(1);
    T.eq([await stack(), (await dbg()).panel.pending], [['building', 'pocket'], true], 'inside a building the waypoint waits (the Pocket stays open)');
    await closeAll();
    await ev(() => window.SR.ui.card.leave());
    await t.step(2);
    const r2 = await ev(() => { const P = window.SR.world.player; return { stack: window.SR.scenes.stack(), door: P.route && P.route.door, path: P.path.length }; });
    T.ok(r2.stack.join() === 'city' && r2.door === 'bank' && r2.path > 0, 'stepping out, the route to the bank starts', r2);
  });

  // ------------------------------------------------------------------------------------------------
  await section('the Map never traps focus; waypoints clear at a home door and at a person', async () => {
    await fresh();
    await t.key('KeyM');
    await t.step(1);
    // Keyboard and pad: the focused map pans with the arrows up to its edge, then the arrow moves
    // focus on like anywhere else (UI §6: every screen completable without a pointer).
    const leave = async (key) => {
      await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="map-canvas"]')));
      const x0 = (await dbg()).panel.view;
      for (let k = 0; k < 60; k++) { await t.key(key); const a = await active(); if (a !== 'map-canvas') return { to: a, moved: JSON.stringify((await dbg()).panel.view) !== JSON.stringify(x0) }; }
      return null;
    };
    const l = await leave('ArrowLeft');
    T.ok(l && l.moved && l.to !== 'map-canvas', 'Left pans the map to its edge, then focus moves on (out of the map)', l);
    const u = await leave('ArrowUp');
    T.ok(u && u.moved && u.to !== 'map-canvas', 'Up pans to the top edge, then focus leaves the map too', u);
    // A home door (the Apartments): door:entered names the building 'home', the waypoint still clears.
    const home = await ev(() => window.SR.world.homeDoor(window.SR.state).id);
    await ev(() => { const d = window.SR.world.geometry.doorById.mcsticks; window.SR.debug.teleport(d.exit.x, d.exit.y); });
    await ev((id) => window.SR.ui.pocket.open('map', { place: id }), home);
    await t.step(1);
    await t.clickUI('map-waypoint');
    await t.step(1);
    T.eq([await stack(), await ev(() => !!window.SR.render.minimap.wp)], [['city'], true], 'a waypoint on the home door: the Pocket closes, the minimap pins it');
    let inside = null;
    for (let k = 0; k < 20 && !inside; k++) {
      await t.step(60);
      inside = await ev(() => { const top = window.SR.scenes.top(); return top && top.id === 'building' ? top.params.id : null; });
    }
    T.eq([inside, await ev(() => window.SR.render.minimap.wp)], ['home', null], 'walking in at the home door clears it (the door is SR.world.doors.last)');
    await ev(() => window.SR.ui.card.leave());
    await t.step(2);
    // A person: talking to them clears a waypoint set on them.
    const hasStreet = await ev(() => !!(window.SR.world.streetnpcs && typeof window.SR.world.streetnpcs.talk === 'function'));
    if (hasStreet) {
      await ev(() => window.SR.ui.pocket.open('map', { place: 'person:harold' }));
      await t.step(1);
      T.eq((await dbg()).panel.sel, 'person:harold', 'Harold is a place on the map');
      await t.clickUI('map-waypoint');
      await t.step(1);
      T.ok(await ev(() => !!window.SR.render.minimap.wp), 'a waypoint on Harold');
      await ev(() => { const SR = window.SR, spot = SR.world.streetnpcs.placeOf('harold'); SR.world.player.cancelRoute(); SR.debug.teleport(spot.x + 30, spot.y); SR.world.streetnpcs.talk('harold'); });
      await t.step(1);
      T.eq(await ev(() => window.SR.render.minimap.wp), null, 'talking to him clears it');
      // Over the dialog you are already outside: Set waypoint pins the place, no "head outside" route waits.
      await t.clickUI('hud-pocket');
      await t.step(1);
      await ev(() => window.SR.ui.pocket.select('map', { place: 'bank' }));
      await t.step(1);
      await ev(() => window.SR.ui.toast.clear());
      await t.clickUI('map-waypoint');
      await t.step(1);
      const over = await ev(() => ({ stack: window.SR.scenes.stack(), pending: window.SR.ui.pocket.debug().panel.pending, toasts: window.SR.ui.toast.list().map((x) => x.text) }));
      const later = await ev(() => window.SR.text('pocket.map.waypointLater'));
      T.ok(over.stack.join() === 'city,dialog,pocket' && over.pending === false && over.toasts.indexOf(later) < 0,
        'over a street dialog the waypoint is pinned, with no route waiting for a door to step out of', over);
      await closeAll();
    }
    // Inside a building Set waypoint turns into Clear waypoint, and keyboard focus follows it.
    await t.enter('mcsticks');
    await t.step(1);
    await ev(() => window.SR.ui.pocket.open('map', { place: 'uofs' }));
    await t.step(1);
    T.ok(await exists('map-waypoint'), 'the U of S has no waypoint yet (Set waypoint)');
    await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="map-waypoint"]')));
    await t.key('Enter');
    T.eq(await active(), 'map-clear-waypoint', 'Enter on Set waypoint: focus moves to Clear waypoint (not lost)');
    await t.key('Enter');
    T.eq([await active(), (await dbg()).panel.wp], ['map-waypoint', null], 'and Enter again clears it, focus back on Set waypoint');
    await closeAll();
  });

  // ------------------------------------------------------------------------------------------------
  await section('numbers from the rules and the tuning: the Give label, ranges, Winded, Road to Office', async () => {
    const hasStreet = await ev(() => !!(window.SR.world.streetnpcs && typeof window.SR.world.streetnpcs.talk === 'function'));
    if (hasStreet) {
      await fresh({ items: { booze: 1 }, money: { cash: 100 } }, 23);
      await ev(() => { const SR = window.SR, spot = SR.world.streetnpcs.placeOf('harold'); SR.debug.teleport(spot.x + 30, spot.y); SR.world.streetnpcs.talk('harold'); });
      await t.clickUI('hud-pocket');
      await ev(() => window.SR.ui.pocket.select('bag', { item: 'cash' }));
      await t.step(1);
      const give = await ev(() => (document.querySelector('#ui [data-id="bag-give"]') || {}).textContent || '');
      const row = await ev(() => { const el = document.querySelector('#ui [data-scene="dialog"] [data-choice="street.harold.give10"]'); return el ? el.textContent : ''; });
      const want = await ev(() => window.SR.text('act.harold.give10', { money: window.SR.text.money(window.SR.preview('street.harold.give10', {}).cost.cash) }));
      T.ok(give.indexOf(want) >= 0 && give.indexOf('{') < 0 && row.indexOf(want) >= 0, 'the wallet\'s Give reads like the dialog row ("' + want + '"), its {money} filled in', { give, row });
      await closeAll();
    }
    await fresh({ stats: { hp: 1, karma: 50 } });
    await ev(() => window.SR.ui.pocket.open('stats'));
    await t.step(1);
    const factor = await ev(() => Math.round(window.SR.tuning.training.winded.factor * 100));
    T.ok((await ev(() => (document.querySelector('#ui [data-id="stats-winded"]') || {}).textContent || '')).indexOf(factor + ' %') >= 0, 'Winded names the tuning\'s factor (' + factor + ' %)');
    const ranges = await ev(() => {
      const SR = window.SR, st = SR.tuning.start, keep = [st.heatRange, st.karmaRange];
      st.heatRange = [0, 150]; st.karmaRange = [-200, 200];
      SR.ui.pocket.select('journal'); SR.ui.pocket.select('stats');
      const fill = document.querySelector('#ui [data-id="stats-karma-fill"]');
      const out = { heatMax: document.querySelector('#ui [data-id="stats-heat"]').getAttribute('aria-valuemax'), karmaFill: fill ? fill.style.width : null };
      st.heatRange = keep[0]; st.karmaRange = keep[1];
      SR.ui.pocket.select('journal'); SR.ui.pocket.select('stats');
      out.karmaFill0 = document.querySelector('#ui [data-id="stats-karma-fill"]').style.width;
      return out;
    });
    T.eq(ranges, { heatMax: '150', karmaFill: '12.5%', karmaFill0: '25%' }, 'the Heat meter and the karma slider follow tuning.start heatRange / karmaRange');
    // The Road to Office (P1 `advisor`) agrees with the nomination check itself.
    await ev(() => window.SR.debug.feature('advisor', true));
    await t.set({ homes: { living: 'castle', owned: ['apt', 'castle'] }, money: { cash: 150000, bank: 60000 }, stats: { str: 700, int: 700, cha: 600, karma: -30 } });
    await ev(() => window.SR.ui.pocket.select('journal'));
    await t.step(1);
    const road = await ev(() => ({ road: window.SR.ui.pocket.debug().panel.road, missing: window.SR.rules.election.qualifies(window.SR.state).missing,
      karma: (document.querySelector('#ui [data-id="journal-road-karma"]') || {}).textContent || '' }));
    T.eq(road.road.filter((r) => !r.ok).map((r) => r.id), ['stats'], 'the Road to Office ticks what qualifies() ticks (castle, money, karma; not the stats)', road);
    T.ok(road.missing.length === 1 && road.missing[0] === 'stats' && /-25/.test(road.karma) && road.karma.indexOf('{') < 0, 'the Dictator path reads "Karma -25 or less"', road);
    await ev(() => window.SR.debug.feature('advisor', false));
    await closeAll();
  });

  // ------------------------------------------------------------------------------------------------
  await section('Stats, Journal and Messages', async () => {
    await fresh({ stats: { str: 20, hpMax: 35, hp: 30, int: 12, cha: 9, karma: 42 }, money: { cash: 240, bank: 500 } });
    await ev(() => window.SR.ui.pocket.open('stats'));
    await t.step(1);
    const st = await ev(() => {
      const q = (id) => (document.querySelector('#ui [data-id="' + id + '"]') || {}).textContent || '';
      return { name: q('stats-name'), str: q('stats-chip-str'), karma: q('stats-karma-value'), hp: q('stats-hp'), total: q('stats-nw-total'),
        sparks: document.querySelectorAll('#ui [data-scene="pocket"] .spark').length, worth: window.SR.ui.pocket.debug().panel.worth };
    });
    T.ok(/20/.test(st.str) && /\+42/.test(st.karma) && /30/.test(st.hp), 'STR, karma and HP are read from the state', st);
    T.eq(st.sparks, 3, 'a 14-day Sparkline per stat');
    T.ok(st.total.indexOf(await ev((n) => window.SR.text.money(n), st.worth)) >= 0, 'the net-worth total is SR.rules.endgame\'s', st);
    // Journal: the First Day list ticks from the state; Help pages.
    await ev(() => window.SR.ui.pocket.select('journal'));
    const fd0 = (await dbg()).panel.firstDay;
    T.eq(fd0, { messages: false, eat: false, work: false, study: false, sleep: false }, 'the First Day list starts empty on day 1 (tutorial on)');
    await t.set({ stats: { hp: 10 } });
    await t.act('mcsticks.fries', {});
    await t.act('mcsticks.work', { variant: 'full' });
    await ev(() => window.SR.ui.pocket.refresh());
    await t.step(1);
    const fd1 = (await dbg()).panel.firstDay;
    T.eq([fd1.eat, fd1.work], [true, true], 'eating and a shift tick their lines');
    T.eq(await ev(() => document.querySelector('#ui [data-id="journal-fd-work"]').getAttribute('data-done')), 'true', '… on the page too');
    await t.clickUI('journal-help-karma');
    T.eq(await ev(() => document.querySelector('#ui [data-id="journal-help-page"] p').textContent), await ev(() => window.SR.text('pocket.help.karma.body', window.SR.ui.pocket.debug().panel.helpVars)), 'a Help topic opens its page');
    // Every page's numbers come from SR.tuning (no placeholder left, no stale number).
    const pages = [];
    for (const k of (await dbg()).panel.topics) {
      await t.clickUI('journal-help-' + k);
      pages.push([k, await ev(() => document.querySelector('#ui [data-id="journal-help-page"] p').textContent)]);
    }
    T.eq(pages.filter((p) => /[{}?]/.test(p[1])).map((p) => p[0]), [], 'every Help page reads whole (its numbers filled in)');
    const nums = await ev(() => { const T = window.SR.tuning; return { hp: T.start.hpMaxBase, fall: T.world.fall.hp, rob: window.SR.text.time(T.crime.store.startBefore), money: window.SR.text.money(T.election.requires.money) }; });
    const page = (k) => (pages.filter((p) => p[0] === k)[0] || [k, ''])[1];
    T.ok(page('stats').indexOf('HP max is ' + nums.hp + ' plus STR') >= 0 && page('getAround').indexOf(nums.fall + ' HP lighter') >= 0 &&
      page('crime').indexOf('before ' + nums.rob) >= 0 && page('endgame').indexOf(nums.money) >= 0, 'the Help pages quote the tuning (HP base, the fall, the hold-up hour, the war money)', nums);
    await t.setDay(2);
    await ev(() => window.SR.ui.pocket.refresh());
    await t.step(1);
    T.eq(await exists('journal-firstday'), false, 'the First Day list closes on day 2');
    // Messages: without a phone only at home; with one anywhere.
    await t.set({ items: { phone: 0 } });
    await ev(() => window.SR.ui.pocket.select('messages'));
    await t.step(1);
    T.eq(await exists('msg-nophone'), true, 'no phone: "messages play at home"');
    await t.set({ items: { phone: 1 } });
    await ev(() => { window.SR.ui.pocket.select('stats'); window.SR.ui.pocket.select('messages'); });
    await t.step(1);
    T.eq([await exists('msg-nophone'), (await dbg()).panel.screens], [false, ['home.messages']], 'with a phone the inbox reads anywhere (home.messages in the Pocket)');
    await closeAll();
    await t.set({ items: { phone: 0 } });
    await t.enter('home');
    await t.step(1);
    await ev(() => window.SR.ui.pocket.open('messages'));
    await t.step(1);
    T.eq([await stack(), await exists('msg-nophone'), (await dbg()).panel.screens], [['building', 'pocket'], false, ['home.messages']],
      'no phone, but at home: the Pocket\'s inbox plays (the card under it is home)');
    await closeAll();
  });

  // ------------------------------------------------------------------------------------------------
  await section('P1 behind their flags: Phone, Achievements, takeout', async () => {
    await fresh({ items: { phone: 1 }, money: { cash: 500 } });
    await ev(() => window.SR.ui.pocket.open('journal'));
    T.eq((await dbg()).tabs.indexOf('phone'), -1, 'Phone hides while `phone` is off');
    await ev(() => { window.SR.debug.feature('phone', true); window.SR.debug.feature('achievements', true); window.SR.ui.pocket.refresh(); });
    await t.step(1);
    T.eq((await dbg()).tabs, P0_TABS.concat(['phone', 'achievements']), 'with the flags on the rail grows Phone and Achievements');
    await ev(() => window.SR.ui.pocket.select('phone'));
    const apps = (await dbg()).panel.apps;
    T.ok(['cab', 'stocks', 'contacts', 'summon'].every((a) => apps.indexOf(a) >= 0), 'the phone\'s apps', apps);
    await t.clickUI('phone-app-cab');
    T.ok(await exists('row-cab-mcsticks'), 'the Cab app lists the doors');
    const cash0 = (await t.state()).money.cash;
    await t.clickUI('row-cab-mcsticks');
    await t.step(1);
    const s = await t.state();
    T.eq([await stack(), cash0 - s.money.cash], [['city'], 15], 'a cab to McSticks: $15, the Pocket closes');
    const near = await ev(() => { const d = window.SR.world.geometry.doorById.mcsticks, P = window.SR.world.player; return Math.hypot(P.x - d.exit.x, P.y - d.exit.y) < 64; });
    T.ok(near, 'you step out at its door');
    await ev(() => { window.SR.ui.pocket.open('phone'); });
    await t.clickUI('phone-app-contacts');
    T.ok((await dbg()).panel.contacts.indexOf('cabs') >= 0 && (await dbg()).panel.contacts.indexOf('hospital') >= 0, 'contacts without a flag of their own are listed');
    T.eq((await dbg()).panel.contacts.indexOf('lawyer'), -1, 'the lawyer hides with `police`');
    T.eq(await ev(() => Object.keys(window.SR.reg.contact).filter((id) => /^buyer\d+$/.test(id)).length), await ev(() => window.SR.tuning.bus.buyerVoicemail.buyers),
      'one buyer contact per B-12 buyer (phone.js BUYERS matches tuning.bus.buyerVoicemail.buyers)');
    const cabRole = await ev(() => { const r = Array.from(document.querySelectorAll('#ui [data-id="phone-contacts"] .list-meta')).map((e) => e.textContent); return r; });
    T.ok(cabRole.indexOf(await ev(() => window.SR.text('contact.cabs.role', { money: window.SR.text.money(window.SR.tuning.world.cab.cash) }))) >= 0,
      'Sky Cabs\' line names the fare from the tuning', cabRole);
    await t.set({ player: { cars: { junker: { owned: true, x: 727, y: 1113 } } } });
    await ev(() => { window.SR.ui.pocket.select('journal'); window.SR.ui.pocket.select('phone'); });
    await t.clickUI('phone-app-summon');
    await t.clickUI('row-phone.summon');
    await t.step(1);
    const car = (await t.state()).player.cars.junker;
    const pl = await ev(() => ({ x: window.SR.world.player.x, y: window.SR.world.player.y }));
    T.ok(Math.hypot(car.x - pl.x, car.y - pl.y) < 400 && !(car.x === 727 && car.y === 1113), 'Summon car brings the junker to the nearest road', { car, pl });
    // The Electoral Board (while nominated) names the last day to accept: SR.rules.election.acceptBy.
    await t.set({ election: { status: 'nominated', nominatedDay: 1 } });
    await ev(() => { window.SR.ui.pocket.select('journal'); window.SR.ui.pocket.select('phone'); });
    await t.clickUI('phone-app-contacts');
    T.ok((await dbg()).panel.contacts.indexOf('board') >= 0, 'the Electoral Board is listed while you are nominated');
    const board = await t.act('phone.board', {});
    const toast = (board.toasts || []).filter((x) => x.key === 'toast.phone.board')[0];
    const by = await ev(() => window.SR.rules.election.acceptBy(window.SR.state));
    T.ok(toast && toast.vars.day === by && by === 1 + (await ev(() => window.SR.tuning.election.acceptWithin)) - 1,
      'the Board\'s call names the last day to accept, the day the voicemail and City Hall name (acceptBy: ' + by + ')', toast);
    await t.set({ election: { status: 'none', nominatedDay: 0 } });
    // Red (P1 `arcs`, after your first gram): "Where you at?" pins Dealer Alley on the minimap.
    await ev(() => window.SR.debug.feature('arcs', true));
    await t.set({ npc: { dealer: { bought: 1 } } });
    await ev(() => { window.SR.ui.pocket.select('journal'); window.SR.ui.pocket.select('phone'); });
    await t.clickUI('phone-app-contacts');
    await t.clickUI('phone-contacts-red');
    await t.clickUI('row-phone.red');
    await t.step(1);
    const red = await ev(() => { const sp = window.SR.reg.worldmap.main.spots.dealerAlley, wp = window.SR.render.minimap.wp; return { at: !!wp && wp.x === sp[0] && wp.y === sp[1], mapWp: window.SR.ui.pocket.panelDef('map').waypoint() }; });
    T.ok(red.at && red.mapWp && red.mapWp.id === 'dealerAlley', 'Red\'s call pins Dealer Alley (the minimap and the Map\'s waypoint)', red);
    await ev(() => window.SR.debug.feature('arcs', false));
    await ev(() => window.SR.ui.pocket.select('achievements'));
    T.ok(await exists('ach-none') || await exists('ach-grid'), 'the Achievements tab shows its placeholder (W3-Prog fills it)');
    await ev(() => { window.SR.debug.feature('shopsPlus', true); });
    await t.set({ items: { takeout: ['fries'] }, stats: { hp: 1 } });
    await ev(() => window.SR.ui.pocket.select('bag', { item: 'takeout' }));
    await t.step(1);
    T.eq(await ev(() => document.querySelector('#ui [data-id="bag-use"]').getAttribute('data-action')), 'bag.eatTakeout', 'takeout (P1 shopsPlus) eats from the Bag');
    await t.clickUI('bag-use');
    await t.step(1);
    const ts = await t.state();
    T.eq([ts.items.takeout.length, ts.stats.hp], [0, 21], 'the fries to go: +20 HP, gone from the Bag');
    await ev(() => { ['phone', 'achievements', 'shopsPlus'].forEach((f) => window.SR.debug.feature(f, false)); });
    await closeAll();
  });

  // ------------------------------------------------------------------------------------------------
  await section('a11y: every tab passes the audit; screenshots', async () => {
    await fresh({ items: { smokes: 3, pills: 2, booze: 4, phone: 1, alarm: 1 }, money: { cash: 1240, bank: 3000 }, furniture: { owned: { bed: 1 } } });
    await ev(() => { window.SR.debug.feature('phone', true); window.SR.debug.feature('achievements', true); });
    await ev(() => window.SR.ui.pocket.open('journal'));
    await t.step(1);
    const noToasts = () => ev(() => { if (window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });   // the captures show the notebook, not the last toast
    for (const id of P0_TABS.concat(['phone', 'achievements'])) {
      await t.clickUI('pocket-tab-' + id);
      await t.step(1);
      const a = await t.eval(A.audit, '#ui [data-scene="pocket"]');
      T.eq(a.issues, [], 'tab ' + id + ': names, roles and contrast (' + a.controls + ' controls, ' + a.checked + ' text nodes)');
      await noToasts();
      await t.shot(path.join(SHOTS, 'pocket-' + id + '-1280x720.png'));
    }
    const rail = await ev(() => Array.from(document.querySelectorAll('#ui [data-scene="pocket"] .pocket-tab-label')).map((l) => [l.getAttribute('data-id') || l.textContent, Math.round(l.getBoundingClientRect().height)]));
    T.ok(rail.every((r) => r[1] <= 24), 'every rail label fits on one line at 1280 × 720 ("Achievements" included)', rail);
    T.eq(await ev(() => document.querySelector('#ui [data-id="pocket-tab-achievements"]').getAttribute('aria-label')), 'Achievements', 'its name has no soft hyphen');
    // Stats with two weeks behind them: the Sparklines draw a line.
    await ev(() => {
      const s = window.SR.state, d0 = s.clock.day;
      ['str', 'int', 'cha', 'karma'].forEach((k, j) => { s.history[k] = []; for (let d = 1; d <= 14; d++) s.history[k].push([d0 - 14 + d, [7, 7, 7, 0][j] + Math.round(d * [2.5, 1.5, 1, 3][j] + (d % 3))]); });
      Object.assign(s.stats, { str: 42, int: 30, cha: 24, karma: 38 });
      window.SR.ui.pocket.select('journal');
    });
    await t.clickUI('pocket-tab-stats');
    await t.step(1);
    await noToasts();
    await t.shot(path.join(SHOTS, 'pocket-stats-history-1280x720.png'));
    await ev(() => { window.SR.debug.feature('phone', false); window.SR.debug.feature('achievements', false); });
    await closeAll();
    await t.resize(1920, 1080);
    await ev(() => window.SR.ui.pocket.open('bag'));
    await t.step(1);
    await noToasts();
    await t.shot(path.join(SHOTS, 'pocket-bag-1920x1080.png'));
    await ev(() => window.SR.ui.pocket.select('map'));
    await noToasts();
    await t.shot(path.join(SHOTS, 'pocket-map-1920x1080.png'));
    await closeAll();
    await t.resize(1280, 720);
    await ev(() => window.SR.settings.set('access.textScale', 1.5));
    await ev(() => window.SR.ui.pocket.open('stats'));
    await t.step(1);
    await noToasts();
    await t.shot(path.join(SHOTS, 'pocket-stats-text150.png'));
    const clipped = await ev(() => { const p = document.querySelector('#ui [data-id="pocket-panel"]'); return p.scrollWidth > p.clientWidth + 1; });
    T.eq(clipped, false, 'at 150 % text the page reflows (no sideways overflow)');
    await ev(() => window.SR.settings.set('access.textScale', 1));
    await closeAll();
    T.eq(t.errors(), [], 'zero console errors on the game page');
    const missing = await ev(() => window.SR.text.missing().filter((k) => /^(pocket|act\.bag|act\.phone|desc\.bag|desc\.phone|contact|toast\.bag|toast\.phone)\./.test(k)));
    T.eq(missing, [], 'every Pocket text key resolves');
  });
  await t.close();

  // ------------------------------------------------------------------------------------------------
  await section('touch: taps, a swipe, lists that scroll with a finger (844 × 390)', async () => {
    const u = await h.open({ width: 844, height: 390, touch: true, fast: true });
    try {
      await u.newGame({ seed: 5 });
      await u.goto('city');
      await u.set({ items: { smokes: 3, booze: 2 } });
      await u.step(1);
      const tapUI = async (id) => {
        const r = await u.eval((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
        if (!r) throw new Error('no ' + id);
        await u.page.touchscreen.tap(r.x, r.y);
        await u.step(1);
      };
      await tapUI('hud-pocket');
      T.eq(await u.scenes(), ['city', 'pocket'], 'a tap on the HUD\'s Pocket button opens it');
      const fits = await u.eval(() => { const r = document.querySelector('#ui [data-id="pocket"]').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
      T.ok(fits, 'the notebook is centred inside the phone\'s screen (touch-compact)');
      await tapUI('pocket-tab-stats');
      T.eq(await u.eval(() => window.SR.ui.pocket.current().tab), 'stats', 'a tap on a tab opens it');
      // Swipe the page: pointer events with pointerType touch (SR.ui.swipe).
      await u.eval(() => {
        const p = document.querySelector('#ui [data-id="pocket-panel"]'), r = p.getBoundingClientRect(), y = r.top + 40;
        const fire = (type, x) => p.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, pointerId: 7, isPrimary: true }));
        fire('pointerdown', r.left + 300); fire('pointerup', r.left + 100);
      });
      T.eq(await u.eval(() => window.SR.ui.pocket.current().tab), 'bag', 'swiping left turns to the next tab');
      await u.eval(() => window.SR.ui.pocket.select('stats'));
      const css = await u.eval(() => getComputedStyle(document.querySelector('#ui [data-id="pocket-panel"]')).touchAction);
      T.eq(css, 'pan-y', 'the page scrolls with a finger (touch-action pan-y)');
      const box = await u.eval(() => { const p = document.querySelector('#ui [data-id="pocket-panel"]'); p.scrollTop = 0; const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, over: p.scrollHeight > p.clientHeight }; });
      T.ok(box.over, 'the Stats page is taller than the notebook here');
      // A real finger drag (CDP touch events), not a programmatic scroll.
      const cdp = await u.context.newCDPSession(u.page);
      const fx = Math.round(box.x), fy = Math.round(box.y);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy }] });
      for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx, y: fy - k * 15 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await u.page.waitForTimeout(300);
      const top = await u.eval(() => document.querySelector('#ui [data-id="pocket-panel"]').scrollTop);
      T.ok(top > 20, 'a finger drag scrolls it (scrollTop ' + top + ')');
      await u.eval(() => window.SR.ui.pocket.select('map'));
      const listCss = await u.eval(() => getComputedStyle(document.querySelector('#ui [data-id="map-places"]')).touchAction);
      T.eq(listCss, 'pan-y', 'the Map\'s place list scrolls with a finger too');
      // A sideways finger drag on the map pans it and does not turn the page (the swipe skips it).
      const drag = await u.eval(() => {
        const SR = window.SR, cv = document.querySelector('#ui [data-id="map-canvas"]'), r = cv.getBoundingClientRect(), y = r.top + r.height / 2;
        const x0 = SR.ui.pocket.debug().panel.view.x;
        const fire = (type, x) => cv.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, pointerId: 9, isPrimary: true, button: 0 }));
        fire('pointerdown', r.left + r.width / 2 + 100);
        for (let k = 1; k <= 10; k++) fire('pointermove', r.left + r.width / 2 + 100 - k * 20);
        fire('pointerup', r.left + r.width / 2 - 100);
        return { tab: SR.ui.pocket.current().tab, panned: SR.ui.pocket.debug().panel.view.x !== x0 };
      });
      T.eq(drag, { tab: 'map', panned: true }, 'a sideways drag on the map pans it and keeps the Map tab (no page turn)');
      const clearToasts = () => u.eval(() => { if (window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });
      await clearToasts();
      await u.shot(path.join(SHOTS, 'pocket-map-touch-844x390.png'));
      await u.eval(() => window.SR.ui.pocket.select('bag'));
      await clearToasts();
      await u.shot(path.join(SHOTS, 'pocket-bag-touch-844x390.png'));
      // 150 % text on the narrow notebook: the detail pane wraps below the tiles instead of squeezing
      // the tile column until its headings clip (UI §8: no clipping at 150 %).
      await u.eval(() => { window.SR.settings.set('access.textScale', 1.5); window.SR.ui.pocket.select('stats'); window.SR.ui.pocket.select('bag'); });
      await u.step(1);
      const wrap = await u.eval(() => {
        const q = (id) => document.querySelector('#ui [data-id="' + id + '"]').getBoundingClientRect();
        const clipped = Array.from(document.querySelectorAll('#ui [data-id="bag-grid"] h3, #ui [data-id="bag-detail"] h3')).filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
        return { below: q('bag-detail').top >= q('bag-grid').bottom - 1, clipped };
      });
      T.eq(wrap, { below: true, clipped: [] }, 'at 150 % text the Bag\'s detail wraps below the tiles, nothing clipped');
      await u.shot(path.join(SHOTS, 'pocket-bag-touch-text150.png'));
      await u.eval(() => { window.SR.settings.set('access.textScale', 1); window.SR.ui.pocket.select('stats'); window.SR.ui.pocket.select('bag'); });
      await u.step(1);
      // The narrow rail with every tab (P1 flags on): a long label breaks at its soft hyphen, not mid-letter.
      await u.eval(() => { window.SR.debug.feature('phone', true); window.SR.debug.feature('achievements', true); window.SR.ui.pocket.refresh(); });
      await u.step(1);
      const narrow = await u.eval(() => { const l = document.querySelector('#ui [data-id="pocket-tab-achievements"] .pocket-tab-label'); return l ? { w: l.getBoundingClientRect().width, rail: document.querySelector('#ui [data-id="pocket-rail"]').getBoundingClientRect().width } : null; });
      T.ok(narrow && narrow.rail < 168, 'the compact notebook has the narrow rail', narrow);
      await u.eval(() => window.SR.ui.pocket.select('journal'));
      await clearToasts();
      await u.shot(path.join(SHOTS, 'pocket-rail-touch-844x390.png'));
      await u.eval(() => { window.SR.debug.feature('phone', false); window.SR.debug.feature('achievements', false); window.SR.ui.pocket.refresh(); });
      await u.step(1);
      await tapUI('pocket-close');
      T.eq(await u.scenes(), ['city'], 'a tap on ✕ closes it');
      T.eq(u.errors(), [], 'zero console errors (touch)');
    } finally { await u.close(); }
  });

  return T.done();
})().catch((e) => { console.error(e); process.exit(1); });
