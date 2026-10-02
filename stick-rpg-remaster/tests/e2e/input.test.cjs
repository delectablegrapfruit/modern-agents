// tests/e2e/input.test.cjs — owner: W1-K (lead). SR.input in the browser (ARCHITECTURE §11;
// CONTRACT §12; BUILD_PLAN §3.1): real keys → actions (listeners and the top scene), repeats,
// held and axis, the default-prevention policy; a pushed context shadows H / S / D and pops
// cleanly; typing in a text field fires no action but Enter / Esc / Tab; a mocked
// navigator.getGamepads and touch (the floating stick through real touch events, touch buttons
// through inject) produce the same actions as the keyboard; the wheel, right-click back, the
// minimap key, remaps that survive a reload, input:device and blur.
//   node tests/e2e/input.test.cjs
'use strict';
const h = require('../harness.cjs');

/** Installs the recorder: every SR.input event as 'action+' / 'action-' ('r' repeat, '@ctx'), and a test scene. */
const RECORDER = () => {
  const SR = window.SR;
  window.__log = [];
  window.__scene = [];
  window.__devices = [];
  SR.input.on('*', (ev) => window.__log.push(ev.action + (ev.down ? '+' : '-') + (ev.repeat ? 'r' : '') + (ev.context ? '@' + ev.context : '')));
  SR.events.on('input:device', (p) => window.__devices.push(p.device));
  SR.scenes.register('test.input', { kind: 'base', onAction(a, ev) { window.__scene.push(a + (ev.repeat ? 'r' : '')); } });
  SR.scenes.go('test.input');
  // A mockable gamepad list (navigator.getGamepads is polled every loop step).
  window.__pads = [null, null, null, null];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads });
  window.__pad = (buttons, axes) => {
    window.__pads[0] = { id: 'Mock pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: axes || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.indexOf(i) >= 0, touched: false, value: buttons.indexOf(i) >= 0 ? 1 : 0 })) };
  };
  window.__pad([]);
  return true;
};
const take = (page) => page.evaluate(() => { const l = window.__log.splice(0); return l; });
const takeScene = (page) => page.evaluate(() => window.__scene.splice(0));
const sorted = (l) => l.slice().sort();

(async () => {
  const T = h.suite('e2e input');
  const t = await h.open({ touch: false });
  const { page } = t;
  await page.evaluate(RECORDER);

  T.section('keyboard → actions');
  const cases = [
    ['KeyW', ['up+', 'up-']], ['ArrowLeft', ['left+', 'left-']], ['KeyE', ['interact+', 'confirm+', 'interact-', 'confirm-']],
    ['Escape', ['back+', 'pause+', 'back-', 'pause-']], ['Backspace', ['back+', 'back-']], ['Tab', ['pocket+', 'pocket-']],
    ['KeyC', ['car+', 'car-']], ['KeyM', ['map+', 'map-']], ['KeyI', ['bag+', 'bag-']], ['KeyJ', ['journal+', 'journal-']],
    ['KeyN', ['minimap+', 'minimap-']], ['KeyR', ['repeat+', 'repeat-']], ['KeyH', ['minimalHud+', 'minimalHud-']],
    ['Digit3', ['row3+', 'row3-']], ['Numpad7', ['row7+', 'row7-']], ['Equal', ['zoomIn+', 'zoomIn-']], ['Minus', ['zoomOut+', 'zoomOut-']],
    ['Space', ['interact+', 'confirm+', 'interact-', 'confirm-']], ['KeyQ', []], ['KeyZ', []],
  ];
  for (const [key, want] of cases) {
    await t.key(key);
    T.eq(await take(page), want, key + ' → ' + (want.length ? want.filter((a) => a.endsWith('+')).map((a) => a.slice(0, -1)).join(' + ') : 'nothing'));
  }
  T.eq(await takeScene(page), ['up', 'left', 'interact', 'confirm', 'back', 'pause', 'back', 'pocket', 'car', 'map', 'bag', 'journal', 'minimap', 'repeat', 'minimalHud', 'row3', 'row7', 'zoomIn', 'zoomOut', 'interact', 'confirm'],
    'the top scene gets every press through onAction (releases only reach SR.input.on)');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowDown');
  T.eq(await take(page), ['down+', 'down+r', 'down+r'], 'key repeats arrive as presses with repeat: true');
  T.eq(await takeScene(page), ['down', 'downr', 'downr'], 'and reach the scene (menus repeat)');
  await page.keyboard.down('KeyD');
  const both = await page.evaluate(() => ({ held: [window.SR.input.held('down'), window.SR.input.held('right'), window.SR.input.held('up')], axis: window.SR.input.axis('move') }));
  T.ok(both.held.join() === 'true,true,false' && Math.abs(both.axis.x - Math.SQRT1_2) < 1e-9 && Math.abs(both.axis.y - Math.SQRT1_2) < 1e-9, 'held() and axis(move) follow the keys (diagonal normalised)', both);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('KeyD');
  T.eq(await page.evaluate(() => window.SR.input.axis('move')), { x: 0, y: 0 }, 'released: axis 0');
  await take(page);
  await page.keyboard.down('ShiftLeft');
  T.eq(await page.evaluate(() => window.SR.input.held('skate')), true, 'Shift held: skate held');
  await page.keyboard.up('ShiftLeft');
  T.eq(await page.evaluate(() => window.SR.input.held('skate')), false, 'released: not held');
  await take(page);
  await page.keyboard.down('ControlLeft');
  await t.key('KeyR');
  await page.keyboard.up('ControlLeft');
  T.eq(await take(page), [], 'Ctrl + R stays the browser\'s (no repeat action)');
  const prevented = await page.evaluate(() => {
    const out = {};
    const spy = (e) => { out[e.code] = e.defaultPrevented; };
    window.addEventListener('keydown', spy);
    for (const code of ['Space', 'ArrowDown', 'Tab', 'KeyQ']) window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, cancelable: true, bubbles: true }));
    for (const code of ['Space', 'ArrowDown', 'Tab', 'KeyQ']) window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, cancelable: true, bubbles: true }));
    window.removeEventListener('keydown', spy);
    return out;
  });
  T.eq(prevented, { Space: true, ArrowDown: true, Tab: false, KeyQ: false }, 'bound keys lose their browser default (scrolling); Tab keeps focus movement; unbound keys are untouched');
  await take(page); await takeScene(page);
  const consumed = await page.evaluate(() => {
    const off = window.SR.input.on('car', (ev) => { ev.consumed = true; });
    window.SR.input.inject('car', true); window.SR.input.inject('car', false);
    off();
    return window.__scene.splice(0);
  });
  T.eq(consumed, [], 'a listener that sets ev.consumed keeps the press from the scene');
  await take(page);

  T.section('one press acts in one scene');
  // E at a door: interact opens the building, and E's confirm must not be pressed into it, where it
  // would run the card's focused first row (a milkshake, a study, Sleep). Found at the wave-2 exit gate.
  await page.evaluate(() => {
    const SR = window.SR;
    SR.scenes.register('test.door', { kind: 'base', onAction(a) { window.__scene.push('door:' + a); if (a === 'interact') SR.scenes.go('test.inside', null, { transition: false }); } });
    SR.scenes.register('test.inside', { kind: 'base', onAction(a, ev) { window.__scene.push('inside:' + a + (ev.repeat ? 'r' : '')); } });
    SR.scenes.go('test.door', null, { transition: false });
  });
  await take(page); await takeScene(page);
  await page.keyboard.down('KeyE');
  const held = await page.evaluate(() => [window.SR.scenes.stack(), window.SR.input.held('interact'), window.SR.input.held('confirm')]);
  await page.keyboard.down('KeyE');
  await page.keyboard.up('KeyE');
  T.eq([await takeScene(page), await take(page), held], [['door:interact', 'inside:interactr'], ['interact+', 'interact+r', 'interact-'], [['test.inside'], true, false]],
    'E at a door: interact changes the scene; its confirm is not pressed (nor repeated, nor held) in the new one');
  await t.key('KeyE');
  T.eq(await takeScene(page), ['inside:interact', 'inside:confirm'], 'the next press of E reaches the new scene whole');
  await page.evaluate(() => window.SR.scenes.go('test.input', null, { transition: false }));
  await take(page); await takeScene(page);

  T.section('context maps (blackjack shadows H / S / D)');
  await page.evaluate(() => { window.__pop = window.SR.input.pushContext('blackjack'); });
  for (const [key, want] of [['KeyH', ['hit+@blackjack', 'hit-@blackjack']], ['KeyS', ['stand+@blackjack', 'stand-@blackjack']], ['KeyD', ['double+@blackjack', 'double-@blackjack']],
    ['KeyP', ['split+@blackjack', 'split-@blackjack']], ['Digit2', ['chip2+@blackjack', 'chip2-@blackjack']], ['KeyW', ['up+', 'up-']], ['Escape', ['back+', 'pause+', 'back-', 'pause-']]]) {
    await t.key(key);
    T.eq(await take(page), want, 'in blackjack ' + key + ' → ' + want.filter((a) => /\+/.test(a)).map((a) => a.split('+')[0]).join(' + ') + (/@/.test(want[0]) ? ' (the global action is shadowed)' : ' (not in the map: global)'));
  }
  T.eq(await takeScene(page), ['hit', 'stand', 'double', 'split', 'chip2', 'up', 'back', 'pause'], 'the scene gets the context actions');
  await page.keyboard.down('KeyS');
  T.eq([await take(page), await page.evaluate(() => [window.SR.input.held('stand'), window.SR.input.held('down')])], [['stand+@blackjack'], [true, false]], 'S held in the context holds stand, never down (the player does not move)');
  await page.evaluate(() => window.__pop());
  T.eq([await take(page), await page.evaluate(() => [window.SR.input.contexts(), window.SR.input.held('stand')])], [['stand-@blackjack'], [[], false]], 'popping the context releases stand');
  await page.keyboard.down('KeyS');
  await page.keyboard.up('KeyS');
  T.eq([await take(page), await takeScene(page)], [[], ['stand']], 'the S still held across the pop stays inert until released (no stray down)');
  await t.key('KeyH');
  T.eq(await take(page), ['minimalHud+', 'minimalHud-'], 'after the pop, H is minimalHud again');
  await page.evaluate(() => window.SR.input.pushContext('tabs'));
  await t.key('KeyE');
  T.eq(await take(page), ['tabNext+@tabs', 'tabNext-@tabs'], 'the tabs context turns E into tabNext only');
  await page.evaluate(() => window.SR.input.popContext('tabs'));
  await takeScene(page);

  T.section('text entry');
  await page.evaluate(() => {
    const ui = document.getElementById('ui');
    for (const id of ['test-field', 'test-field-2']) {
      const i = document.createElement('input');
      i.type = 'text'; i.setAttribute('data-id', id);
      i.style.cssText = 'position:absolute;left:40px;top:' + (id === 'test-field' ? 200 : 260) + 'px;width:300px;height:44px;pointer-events:auto';
      ui.appendChild(i);
    }
    document.querySelector('[data-id="test-field"]').focus();
  });
  T.eq(await page.evaluate(() => window.SR.input.typing()), true, 'typing() while a text field has focus');
  await page.keyboard.type('wasd e1 mijhrn');
  T.eq([await take(page), await page.evaluate(() => document.querySelector('[data-id="test-field"]').value)], [[], 'wasd e1 mijhrn'], 'letters, digits and space type into the field and fire no action');
  await t.key('Enter');
  T.eq(await take(page), ['confirm+', 'confirm-'], 'Enter fires confirm only (not interact)');
  await t.key('Escape');
  T.eq(await take(page), ['back+', 'back-'], 'Esc fires back only (not pause)');
  await t.key('Tab');
  T.eq([await take(page), await page.evaluate(() => document.activeElement.getAttribute('data-id'))], [[], 'test-field-2'], 'Tab moves focus to the next field and fires no pocket');
  await page.evaluate(() => { window.__pad([0]); window.SR.loop.step(1); window.__pad([3]); window.SR.loop.step(1); window.__pad([1]); window.SR.loop.step(1); window.__pad([]); window.SR.loop.step(1); });
  T.eq(await take(page), ['confirm+', 'confirm-', 'back+', 'back-'], 'on the pad only A (confirm) and B (back) act while typing');
  await page.evaluate(() => { document.activeElement.blur(); document.querySelectorAll('[data-id^="test-field"]').forEach((e) => e.remove()); });
  T.eq(await page.evaluate(() => window.SR.input.typing()), false, 'typing() is false again after blur');
  await takeScene(page);

  T.section('gamepad and touch produce the keyboard\'s actions');
  // [name, key, pad button, touch]: touch is a stick direction or a touch button (inject).
  const table = [
    ['up', 'ArrowUp', 12, 'stick'], ['down', 'ArrowDown', 13, 'stick'], ['left', 'ArrowLeft', 14, 'stick'], ['right', 'ArrowRight', 15, 'stick'],
    ['interact', 'KeyE', 0, 'button'], ['back', 'Backspace', 1, 'button'], ['car', 'KeyC', 3, 'button'], ['pocket', 'Tab', 8, 'button'], ['skate', 'ShiftLeft', 7, 'button'],
  ];
  const cdp = await t.context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const stickTo = { up: [0, -60], down: [0, 60], left: [-60, 0], right: [60, 0] };
  for (const [name, key, btn, touch] of table) {
    await t.key(key);
    const kb = await take(page);
    await page.evaluate((b) => { window.__pad([b]); window.SR.loop.step(1); window.__pad([]); window.SR.loop.step(1); }, btn);
    const pad = await take(page);
    let tc;
    if (touch === 'stick') {
      const [dx, dy] = stickTo[name];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 + dx, y: 400 + dy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      tc = await take(page);
    } else {
      // A touch button calls inject; E also fires confirm on the keyboard and pad (the Action button is interact).
      await page.evaluate((a) => { window.SR.input.inject(a, true); window.SR.input.inject(a, false); }, name);
      tc = await take(page);
    }
    const drop = (l) => sorted(l.filter((a) => !/^confirm/.test(a)));
    T.ok(JSON.stringify(sorted(kb)) === JSON.stringify(sorted(pad)) && JSON.stringify(drop(kb)) === JSON.stringify(drop(tc)) && drop(kb).length === 2,
      name + ': keyboard ' + key + ', pad button ' + btn + ' and touch (' + touch + ') give the same actions', { kb, pad, tc });
  }
  await takeScene(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 332, y: 400, id: 2 }] });
  const half = await page.evaluate(() => ({ axis: window.SR.input.axis('move'), stick: window.SR.input.stick, right: window.SR.input.held('right'), last: window.SR.input.last }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 400, y: 400, id: 2 }] });
  const full = await page.evaluate(() => window.SR.input.axis('move'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  T.ok(half.stick.active && Math.abs(half.axis.x - 0.375) < 0.02 && half.axis.y === 0 && !half.right, 'the floating stick: 32 of 64 units → axis 0.375 after the dead zone, below the 0.5 digital threshold', half);
  T.ok(Math.abs(full.x - 1) < 1e-9, 'full travel → axis 1', full);
  T.eq(half.last, 'touch', 'input.last is touch');
  await page.evaluate(() => { window.__devices.length = 0; window.__md = 0; window.addEventListener('mousedown', () => { window.__md++; }, { once: true }); });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 300, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(50);
  const tap = await page.evaluate(() => ({ last: window.SR.input.last, devices: window.__devices.slice(), md: window.__md }));
  T.ok(tap.last === 'touch' && tap.devices.length === 0, 'a tap (and the compatibility mousedown it fires: ' + tap.md + ') keeps input.last on touch', tap);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 400, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1000, y: 400, id: 3 }] });
  T.eq(await page.evaluate(() => window.SR.input.stick.active), false, 'a touch on the right half is not the stick');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await take(page);
  await page.evaluate(() => { window.__pad([], [0.9, -0.95, 0, 0]); window.SR.loop.step(1); });
  const ps = await page.evaluate(() => ({ axis: window.SR.input.axis('move'), up: window.SR.input.held('up'), right: window.SR.input.held('right') }));
  T.ok(ps.up && ps.right && Math.abs(Math.hypot(ps.axis.x, ps.axis.y) - 1) < 1e-9, 'the pad stick past 0.5 holds up and right; axis length capped at 1', ps);
  await page.evaluate(() => { window.__pad([]); window.SR.loop.step(1); });
  await take(page); await takeScene(page);

  T.section('mouse, wheel, right-click back');
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(50);
  T.eq(await take(page), ['zoomIn+', 'zoomIn-', 'zoomOut+', 'zoomOut-'], 'the wheel over the world: WheelUp → zoomIn, WheelDown → zoomOut');
  await page.mouse.click(640, 400, { button: 'right' });
  T.eq(await take(page), [], 'right-click does nothing by default');
  await page.evaluate(() => window.SR.settings.set('game.rightClickBack', true));
  // The listener is in place before the click (awaited), so a busy machine cannot race it (W1-Q request 8).
  await page.evaluate(() => { window.__menu = new Promise((res) => window.addEventListener('contextmenu', (e) => setTimeout(() => res(e.defaultPrevented)), { once: true })); });
  await page.mouse.click(640, 400, { button: 'right' });
  T.eq([await take(page), await page.evaluate(() => window.__menu)], [['back+', 'back-'], true], 'with rightClickBack: right-click is back (Mouse2) and the context menu is suppressed');
  await page.evaluate(() => window.SR.settings.set('game.rightClickBack', false));
  await takeScene(page);

  T.section('devices, blur, remaps');
  await page.evaluate(() => { window.__devices.length = 0; });
  await t.key('KeyW');
  await page.evaluate(() => { window.__pad([0]); window.SR.loop.step(1); window.__pad([]); window.SR.loop.step(1); });
  await page.mouse.click(10, 10);
  await t.key('KeyW');
  T.eq(await page.evaluate(() => window.__devices), ['kb', 'pad', 'mouse', 'kb'], 'input:device { device } fires on each change of device (glyphs follow input.last)');
  await take(page);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  T.eq([await take(page), await page.evaluate(() => window.SR.input.held('up'))], [['up+', 'up-'], false], 'a window blur releases held keys (no stuck movement)');
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.SR.input.bind('interact', ['KeyF', 'Pad2']));
  await t.reload();
  await page.evaluate(RECORDER);
  T.eq(await page.evaluate(() => [window.SR.input.bindings('interact'), window.SR.settings.get('controls.keys.interact')]), [['KeyF', 'Pad2'], ['KeyF']], 'a remap is saved in settings.controls and survives a reload');
  await t.key('KeyF');
  await t.key('KeyE');
  T.eq(await take(page), ['interact+', 'interact-', 'confirm+', 'confirm-'], 'F is interact now; E is only confirm');
  await page.evaluate(() => window.SR.input.bind('hit', ['KeyG'], 'blackjack'));
  await page.evaluate(() => window.SR.input.pushContext('blackjack'));
  await t.key('KeyG'); await t.key('KeyH');
  T.eq(await take(page), ['hit+@blackjack', 'hit-@blackjack', 'minimalHud+', 'minimalHud-'], 'a context remap applies when the context is pushed (G is hit, H is global again)');
  await page.evaluate(() => { window.SR.input.popContext('blackjack'); window.SR.input.bind('interact', null); window.SR.input.bind('hit', null, 'blackjack'); });
  T.eq(await page.evaluate(() => [window.SR.input.bindings('interact'), window.SR.input.bindings('hit', 'blackjack')]), [['KeyE', 'Enter', 'NumpadEnter', 'Space', 'Pad0'], ['KeyH', 'Pad0']], 'bind(action, null) restores the defaults');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
