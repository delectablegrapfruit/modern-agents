// tests/e2e/settings.test.cjs — owner: W2-Front. Settings (BUILD_PLAN §4.11; UI.md §5.15, §8;
// ARCHITECTURE §16): every tab (Game, Controls, Audio, Display, Accessibility) changes its setting live
// (the kernel, the audio, the loop and the accessibility classes follow), Q / E switch tabs (the `tabs`
// context), "Tutorial for this game" writes the save, Safe edges and No gusts under Assist, the
// remapping UI (a key, a pad button, a minigame context, the conflict warning, Esc cancels, Reset),
// everything persists across a reload, the a11y audit of every tab. Screenshots: shots/W2-Front/.
//   node tests/e2e/settings.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Front');

(async () => {
  const T = h.suite('e2e settings (W2-Front)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => t.eval(fn, arg);
  const info = () => ev(() => { const d = window.SR.reg.scene.settings; return d && d.info() ? JSON.parse(JSON.stringify(d.info())) : null; });
  const get = (k) => ev((k) => window.SR.settings.get(k), k);
  const shot = (name) => t.shot(path.join(SHOTS, name + '.png'));
  const checked = (id) => ev((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); return el ? el.getAttribute('aria-checked') : null; }, id);
  const open = async (tab) => { await ev((tab) => { window.SR.scenes.push('settings', tab ? { tab } : {}); }, tab); await t.step(1); };
  const close = async () => { await t.press('back'); await t.step(1); };

  await ev(() => window.SR.settings.reset());
  await t.goto('title');

  // ------------------------------------------------------------------------------------------------
  T.section('opening, tabs, Q / E');
  await t.clickUI('title-settings');
  await t.step(1);
  T.eq([await t.scenes(), (await info()).tab], [['title', 'settings'], 'game'], 'Settings opens over the title on the Game tab');
  T.ok((await ev(() => window.SR.input.contexts())).indexOf('tabs') >= 0, 'the tabs input context is on');
  const order = [];
  for (let i = 0; i < 5; i++) { await t.key('KeyE'); order.push((await info()).tab); }
  T.eq(order, ['controls', 'audio', 'display', 'access', 'game'], 'E steps through Game · Controls · Audio · Display · Accessibility (and wraps)');
  await t.key('KeyQ');
  T.eq((await info()).tab, 'access', 'Q steps back');
  for (const tab of ['game', 'controls', 'audio', 'display', 'access']) {
    await t.clickUI('set-tabs-' + tab);
    await t.step(1);
    await A.check(T, t, 'settings: ' + tab, '#ui [data-scene="settings"]', { max: 30 });
    await shot('settings-' + tab);
  }
  await close();
  T.eq([await t.scenes(), await ev(() => window.SR.input.contexts())], [['title'], []], 'Esc closes it and pops the tabs context');

  // ------------------------------------------------------------------------------------------------
  T.section('Game');
  await open('game');
  T.ok(!(await ev(() => !!document.querySelector('#ui [data-id="set-row-game.tutorial"]'))), 'no "Tutorial for this game" without a game');
  await t.clickUI('set-game.clock24');
  T.eq(await get('game.clock24'), false, '24-hour clock off');
  await t.clickUI('set-game.holdRepeat');
  T.eq(await get('game.holdRepeat'), false, 'hold Enter to repeat off');
  await t.clickUI('set-game.confirmSpendOver-plus');
  T.eq(await get('game.confirmSpendOver'), 1100, 'confirm spends over: + $100');
  await close();
  await t.newGame({ seed: 51, name: 'Tutee', tutorial: true });
  await t.goto('city');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-settings'); await t.step(1);
  T.eq(await t.scenes(), ['city', 'pause', 'settings'], 'Settings from the pause menu');
  await t.clickUI('set-game.tutorial');
  T.eq([await t.get('mode.tutorial'), await get('game.hints')], [false, true], '"Tutorial for this game" writes the save (mode.tutorial), not the settings');
  await close();
  T.eq(await t.scenes(), ['city', 'pause'], 'and Esc returns to the pause menu');
  await close();

  // ------------------------------------------------------------------------------------------------
  T.section('Audio and Display');
  await open('audio');
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="set-audio.music"]')));
  await t.press('left'); await t.press('left');
  T.eq(await get('audio.music'), 0.6, 'the Music slider steps by 5 % with the arrows (0.7 → 0.6)');
  await t.clickUI('set-audio.mono');
  T.eq(await get('audio.mono'), true, 'mono on');
  await t.clickUI('set-tabs-display');
  await t.clickUI('set-display.quality-low');
  T.eq([await get('display.quality'), await ev(() => window.SR.quality.preset)], ['low', 'low'], 'quality Low (SR.quality follows)');
  await t.clickUI('set-display.fpsCap-30');
  T.eq([await get('display.fpsCap'), await ev(() => window.SR.loop.fpsCap)], [30, 30], 'the 30 fps cap (the loop follows)');
  await t.clickUI('set-display.screenShake');
  T.eq(await get('display.screenShake'), false, 'screen shake off');
  await t.clickUI('set-display.fullscreen');
  await page.waitForTimeout(200);
  T.eq(typeof (await get('display.fullscreen')), 'boolean', 'Fullscreen asks the stage (headless may refuse; the setting records the outcome)');
  T.ok(!(await ev(() => !!document.querySelector('#ui [data-id="set-display.lean"]'))), 'lean waits for its P2 flag');
  await close();

  // ------------------------------------------------------------------------------------------------
  T.section('Accessibility');
  await open('access');
  await t.clickUI('set-access.textScale-1.25');
  T.eq([await get('access.textScale'), await ev(() => document.documentElement.style.getPropertyValue('--ui-scale'))], [1.25, '1.25'], 'text size 125 % (--ui-scale)');
  await t.clickUI('set-access.highContrast');
  T.ok(await ev(() => document.documentElement.classList.contains('hc')), 'high contrast (html.hc)');
  await A.check(T, t, 'settings: accessibility in high contrast at 125 %', '#ui [data-scene="settings"]', { max: 30 });
  await shot('settings-access-hc-125');
  await t.clickUI('set-access.colorblind-deutan');
  T.eq(await ev(() => document.documentElement.getAttribute('data-cb')), 'deutan', 'colour-blind palette: deutan');
  await t.clickUI('set-access.reducedMotion-on');
  T.ok(await ev(() => document.documentElement.classList.contains('rm')), 'reduced motion on (html.rm)');
  await t.clickUI('set-access.safeEdges');
  await t.clickUI('set-access.noGusts');
  T.eq([await get('access.safeEdges'), await get('access.noGusts')], [true, true], 'Safe edges and No gusts, under Assist');
  await t.clickUI('set-access.typewriterCps-0');
  T.eq(await get('access.typewriterCps'), 0, 'typewriter speed: instant');
  await t.clickUI('set-access.highContrast');
  await t.clickUI('set-access.textScale-1');
  await close();

  // ------------------------------------------------------------------------------------------------
  T.section('Controls: remapping');
  await open('controls');
  T.eq((await info()).ctx, 'global', 'the Everywhere context first');
  T.ok((await info()).contexts.indexOf('blackjack') >= 0 && (await info()).contexts.indexOf('orderup') >= 0 && (await info()).contexts.indexOf('timingring') >= 0,
    'every minigame context is listed (CONTRACT §12.3)', (await info()).contexts);
  await t.clickUI('set-kb-map');
  T.eq((await info()).capture, { action: 'map', ctx: 'global', device: 'kb' }, 'Change key waits for a key');
  T.ok(/Press a key or button/.test(await t.uiText()), 'and says so');
  await t.key('KeyK');
  await t.step(1);
  T.eq([(await info()).capture, await ev(() => window.SR.input.bindings('map'))], [null, ['KeyK']], 'the next key is the new binding (Map → K)');
  T.eq(await t.scenes(), ['city', 'settings'], 'the key did nothing else (no Pocket, no Map)');
  await t.clickUI('set-kb-journal');
  await t.key('KeyE');
  await t.step(1);
  T.ok(/Also bound to Interact, Confirm/.test(await ev(() => (document.querySelector('#ui [data-id="set-note-journal"]') || {}).textContent || '')), 'a conflict warning names the other actions on that key');
  await t.clickUI('set-kb-bag');
  await t.key('Escape');
  await t.step(1);
  T.eq([(await info()).capture, await ev(() => window.SR.input.bindings('bag'))], [null, ['KeyI']], 'Esc cancels a remap');
  await t.clickUI('set-pad-btn-map');
  await ev(() => { window.__pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 1, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; });
  await t.step(2);
  await ev(() => { window.__pad.buttons[2] = { pressed: true, value: 1 }; });
  await t.step(2);
  await ev(() => { window.__pad.buttons[2] = { pressed: false, value: 0 }; });
  await t.step(2);
  T.eq(await ev(() => window.SR.input.bindings('map')), ['KeyK', 'Pad2'], 'Change button takes the next pad button (Map → X)');
  await ev(() => { delete navigator.getGamepads; });
  await t.clickUI('set-ctx-blackjack');
  T.eq((await info()).ctx, 'blackjack', 'a minigame context');
  await t.clickUI('set-kb-hit');
  await t.key('KeyJ');
  await t.step(1);
  T.eq([await ev(() => window.SR.input.bindings('hit', 'blackjack')), await ev(() => window.SR.input.bindings('map'))], [['KeyJ', 'Pad0'], ['KeyK', 'Pad2']], 'remaps inside its context only (Hit → J; the pad button kept)');
  await shot('settings-controls-blackjack');
  await close();

  // ------------------------------------------------------------------------------------------------
  T.section('everything persists across a reload');
  const before = await ev(() => { const S = window.SR.settings; return ['game.clock24', 'game.holdRepeat', 'game.confirmSpendOver', 'audio.music', 'audio.mono', 'display.quality', 'display.fpsCap',
    'display.screenShake', 'access.colorblind', 'access.reducedMotion', 'access.safeEdges', 'access.noGusts', 'access.typewriterCps'].map((k) => [k, S.get(k)]); });
  await t.reload();
  const after = await ev((keys) => keys.map((k) => [k, window.SR.settings.get(k)]), before.map((x) => x[0]));
  T.eq(after, before, 'the stored settings come back after a reload');
  T.eq([await ev(() => window.SR.input.bindings('map')), await ev(() => window.SR.input.bindings('hit', 'blackjack'))], [['KeyK', 'Pad2'], ['KeyJ', 'Pad0']], 'and so do the remaps');
  T.ok(await ev(() => document.documentElement.classList.contains('rm') && document.documentElement.getAttribute('data-cb') === 'deutan'), 'the accessibility classes apply at boot');
  await t.key('KeyZ');
  await open('game');
  T.eq(await checked('set-game.clock24'), 'false', 'the screen shows the stored values');
  await t.clickUI('set-tabs-controls');
  T.ok(/K/.test(await ev(() => document.querySelector('#ui [data-id="set-keys-map"]').textContent)), 'including the remapped Map key');
  await t.clickUI('set-controls-reset');
  await t.clickUI('set-ctx-blackjack');
  await t.clickUI('set-controls-reset');
  T.eq([await ev(() => window.SR.input.bindings('map')), await ev(() => window.SR.input.bindings('hit', 'blackjack'))], [['KeyM'], ['KeyH', 'Pad0']], 'Reset to defaults restores each context');
  await close();
  await ev(() => window.SR.settings.reset());

  T.section('result');
  T.eq(await ev(() => window.SR.text.missing()), [], 'every text key Settings showed resolves');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
