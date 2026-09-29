// tests/e2e/save.test.cjs — owner: W1-K (lead). Saves in the browser (ARCHITECTURE §15-§16;
// BUILD_PLAN §3.1): a save in real localStorage survives a page reload and loads to an equal state
// with the rules stream where it was; the tmp → slot → remove tmp order; a full storage; quarantine;
// the export code (the clipboard, and the textarea fallback when the clipboard rejects or is
// missing); file export (a download) and import; autosave on sleep and on leaving a building; the
// Hardcore ironman rules (debounced writes after HP / money / karma changes, `pending` applied on
// reload, no manual slots, deleted on death); settings that persist; memory-only storage; and
// Classic mode's srpg.save left alone. The game states come from SR.rules.state.create (W1-R).
//   node tests/e2e/save.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-K-M1');

(async () => {
  const T = h.suite('e2e save');
  const t = await h.open();
  const { page } = t;
  const hasRules = await page.evaluate(() => !!(window.SR.rules.state && typeof window.SR.rules.state.create === 'function'));
  if (!hasRules) {
    T.ok(true, 'skipped: SR.rules.state.create (W1-R) has not landed');
    await t.close();
    T.done();
    return;
  }
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('srpg.save', 'the classic save'); });

  T.section('a slot survives a reload');
  await t.newGame({ seed: 2026, name: 'Reload Test' });
  await t.set({ money: { cash: 321 }, clock: { day: 5, min: 900 } });
  const order = await page.evaluate(() => {
    const log = [], P = Storage.prototype, set = P.setItem, rem = P.removeItem;
    P.setItem = function (k, v) { if (/^sr1\./.test(k)) log.push('set ' + k); return set.call(this, k, v); };
    P.removeItem = function (k) { if (/^sr1\./.test(k)) log.push('remove ' + k); return rem.call(this, k); };
    for (let i = 0; i < 17; i++) window.SR.rng.rules.next();
    window.SR.save.write('slot1');
    P.setItem = set; P.removeItem = rem;
    return log;
  });
  T.eq(order, ['set sr1.tmp', 'set sr1.slot1', 'remove sr1.tmp'], 'write order in localStorage: tmp, slot, remove tmp');
  const before = await page.evaluate(() => ({ state: JSON.parse(JSON.stringify(window.SR.state)), next: Array.from({ length: 10 }, () => window.SR.rng.rules.int(1, 1e6)) }));
  const env = await page.evaluate(() => JSON.parse(localStorage.getItem('sr1.slot1')));
  T.ok(env.meta.thumb.indexOf('data:image/jpeg;base64,') === 0, 'meta.thumb is a JPEG data URL of the world canvas');
  const size = await page.evaluate(() => localStorage.getItem('sr1.slot1').length);
  T.ok(size <= 60 * 1024, 'a day-5 save is within the 60 KB budget (' + Math.round(size / 1024) + ' KB)');
  await t.reload();
  T.eq(await t.state(), null, 'after a reload no game runs');
  T.eq(await page.evaluate(() => window.SR.save.list().map((x) => [x.slot, x.meta.name, x.meta.day])), [['slot1', 'Reload Test', 5]], 'list() reads the slot\'s meta');
  await page.evaluate(() => window.SR.save.load('slot1'));
  const after = await page.evaluate(() => ({ state: JSON.parse(JSON.stringify(window.SR.state)), next: Array.from({ length: 10 }, () => window.SR.rng.rules.int(1, 1e6)) }));
  T.eq(after.state, before.state, 'load(slot1) gives an equal state');
  T.eq(after.next, before.next, 'and the rules stream continues where it was saved');

  T.section('quota, quarantine');
  const quota = await page.evaluate(() => {
    const P = Storage.prototype, set = P.setItem;
    P.setItem = function (k, v) { if (k === 'sr1.slot2') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
    let code = null;
    try { window.SR.save.write('slot2'); } catch (e) { code = e.code; }
    P.setItem = set;
    return { code, tmp: localStorage.getItem('sr1.tmp'), slot2: localStorage.getItem('sr1.slot2') };
  });
  T.eq(quota, { code: 'quota', tmp: null, slot2: null }, 'a QuotaExceededError becomes an Error with code quota (the UI asks to delete a slot); tmp is removed');
  const q = await page.evaluate(() => {
    localStorage.setItem('sr1.slot3', '{"fmt":"sr-save","v":1,"state":{"clock":');
    const got = window.SR.save.read('slot3');
    const e = window.SR.save.lastError;
    return { got, reason: e.reason, raw: localStorage.getItem(e.key), slot: localStorage.getItem('sr1.slot3'), keys: Object.keys(localStorage).filter((k) => k.indexOf('sr1.broken.') === 0).length };
  });
  T.eq(q, { got: null, reason: 'corrupt', raw: '{"fmt":"sr-save","v":1,"state":{"clock":', slot: null, keys: 1 }, 'a corrupt save is quarantined to sr1.broken.<ts> and its slot cleared');

  T.section('export code, clipboard and the textarea fallback');
  await page.evaluate(() => {
    window.__acts = [];
    window.SR.scenes.register('test.save', { kind: 'base', onAction(a) { window.__acts.push(a); } });
    window.SR.scenes.go('test.save');
  });
  const rt = await page.evaluate(() => { const c = window.SR.save.exportCode(); return { ok: JSON.stringify(window.SR.save.importCode(c)) === JSON.stringify(window.SR.state), c: c.slice(0, 6) }; });
  T.eq(rt, { ok: true, c: 'PSKY1:' }, 'exportCode → importCode round-trips in the page');
  const okCopy = await page.evaluate(() => {
    let written = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { written = s; return Promise.resolve(); } } });
    return window.SR.save.copyCode().then((r) => ({ copied: r.copied, same: r.code === written, modal: !!document.querySelector('[data-id="save-code"]') }));
  });
  T.eq(okCopy, { copied: true, same: true, modal: false }, 'copyCode writes the code to the clipboard (no modal)');
  const rejected = await page.evaluate(() => {
    document.body.focus();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
    return window.SR.save.copyCode().then((r) => {
      const area = document.querySelector('#ui [data-id="save-code"] textarea[data-id="save-code-text"]');
      return { copied: r.copied, fallback: r.fallback, value: area && area.value === r.code, readOnly: area && area.readOnly,
        focused: document.activeElement === area, selected: area && area.selectionStart === 0 && area.selectionEnd === r.code.length };
    });
  });
  T.eq(rejected, { copied: false, fallback: true, value: true, readOnly: true, focused: true, selected: true }, 'when the clipboard rejects, a modal shows the code in a read-only, pre-selected textarea');
  T.ok(await page.locator('#ui [data-id="save-code"]').isVisible(), 'the fallback modal is visible');
  const hint = await page.locator('[data-id="save-code-hint"]').innerText();
  T.ok(hint.length > 0, 'with the copy hint (ui.save.copyHint)', hint);
  await t.shot(path.join(SHOTS, 'save-code-fallback.png'));
  await t.key('KeyE');
  await t.key('Escape');
  T.eq([await page.locator('[data-id="save-code"]').count(), await page.evaluate(() => window.__acts.splice(0))], [0, []], 'Esc closes it, and no key reached the game underneath');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); return window.SR.save.copyCode(); });
  T.eq(await page.locator('[data-id="save-code"]').count(), 1, 'without a clipboard API the fallback appears too');
  await t.clickUI('save-code-close');
  T.eq(await page.locator('[data-id="save-code"]').count(), 0, 'the Close button closes it');
  // "Copy save code" run with Enter: the modal opens during the keydown, so the keyup lands in it.
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.setAttribute('data-id', 'test-copy'); b.style.cssText = 'position:absolute;left:8px;top:8px;width:120px;height:44px;pointer-events:auto';
    document.getElementById('ui').appendChild(b);
    window.__offCopy = window.SR.input.on('confirm', (ev) => { if (ev.down && !ev.repeat) window.SR.save.copyCode(); });
    b.focus();
  });
  await page.keyboard.down('Enter');
  const mid = await page.evaluate(() => ({ modal: !!document.querySelector('[data-id="save-code"]'), held: window.SR.input.held('confirm') }));
  await page.keyboard.up('Enter');
  const rel = await page.evaluate(() => ({ confirm: window.SR.input.held('confirm'), interact: window.SR.input.held('interact') }));
  T.eq([mid, rel], [{ modal: true, held: true }, { confirm: false, interact: false }], 'Enter that opens the fallback is released inside it: confirm and interact are not left held');
  await page.evaluate(() => { window.__offCopy(); document.querySelector('[data-id="test-copy"]').remove(); window.__acts.length = 0; });
  await t.key('KeyW');
  await t.key('Escape');
  T.eq([await page.locator('[data-id="save-code"]').count(), await page.evaluate(() => window.__acts.splice(0))], [0, []], 'Esc closes it again with nothing reaching the scene');

  T.section('file export and import');
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.SR.save.exportFile())]);
  const file = await download.path();
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  T.ok(/^paper-sky-reload-test-day5\.json$/.test(download.suggestedFilename()) && json.fmt === 'sr-save' && json.state.money.cash === 321, 'exportFile downloads the envelope as JSON (' + download.suggestedFilename() + ')');
  const imp = await page.evaluate((text) => {
    const SR = window.SR;
    const f1 = new File([text], 'save.json', { type: 'application/json' });
    const f2 = new File([SR.save.exportCode()], 'code.txt', { type: 'text/plain' });
    const f3 = new File(['not a save'], 'bad.json');
    return Promise.all([SR.save.importFile(f1), SR.save.importFile(f2), SR.save.importFile(f3).then(() => 'resolved', (e) => e.reason)])
      .then(([a, b, c]) => ({ a: a.money.cash, b: b.money.cash, c, live: SR.state.money.cash }));
  }, fs.readFileSync(file, 'utf8'));
  T.eq(imp, { a: 321, b: 321, c: 'corrupt', live: 321 }, 'importFile reads an exported JSON file or a text file holding a code, and rejects junk with a reason');

  T.section('autosave');
  await page.evaluate(() => { localStorage.removeItem('sr1.auto'); window.SR.events.emit('day:started', { day: 6 }); });
  T.ok(await page.evaluate(() => !!localStorage.getItem('sr1.auto')), 'day:started (after a sleep) writes the auto slot');
  const auto = await page.evaluate(() => {
    const SR = window.SR;
    localStorage.removeItem('sr1.auto');
    SR.events.emit('door:exited', { id: 'mcsticks', spentMin: 30 });
    const immediate = !!localStorage.getItem('sr1.auto');
    SR.save.flush();
    return { immediate, flushed: !!localStorage.getItem('sr1.auto') };
  });
  T.eq(auto, { immediate: false, flushed: true }, 'leaving a building within 60 s of the last autosave defers the write (at most one a minute)');
  const hideFlush = await page.evaluate(() => {
    const SR = window.SR;
    localStorage.removeItem('sr1.auto');
    SR.events.emit('door:exited', { id: 'mcsticks', spentMin: 30 });
    const deferred = !localStorage.getItem('sr1.auto');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const written = !!localStorage.getItem('sr1.auto');
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    return { deferred, written };
  });
  T.eq(hideFlush, { deferred: true, written: true }, 'a deferred autosave is written when the tab hides (not lost if the tab closes)');
  await page.evaluate(() => { window.SR.save.write('suspend'); window.SR.save.load('suspend'); });
  T.eq(await page.evaluate(() => localStorage.getItem('sr1.suspend')), null, 'loading the suspend slot deletes it');

  T.section('Hardcore ironman');
  await t.newGame({ seed: 77, difficulty: 'hardcore', name: 'Iron' });
  const manual = await page.evaluate(() => { try { window.SR.save.write('slot1'); return 'written'; } catch (e) { return e.code; } });
  T.eq(manual, 'hardcore', 'no manual saves on Hardcore');
  await page.evaluate(() => { localStorage.removeItem('sr1.ironman'); localStorage.removeItem('sr1.auto'); });
  // The debounce is B-16's tuning.difficulty.hardcore.ironmanDebounceMs (2 s); shortened here to keep the suite quick.
  const debounce = await page.evaluate(() => { const row = window.SR.tuning.difficulty.hardcore; const was = row.ironmanDebounceMs; row.ironmanDebounceMs = 400; return was; });
  T.eq(debounce, 2000, 'the ironman debounce comes from tuning.difficulty.hardcore.ironmanDebounceMs (2 s, BALANCE B-16)');
  await page.evaluate(() => window.SR.events.emit('action:done', { id: 'store.snack', result: { ok: true, id: 'store.snack', deltas: [{ kind: 'cash', n: -5, from: 100, to: 95 }] } }));
  T.eq(await page.evaluate(() => localStorage.getItem('sr1.ironman')), null, 'a money change schedules the ironman write (debounced)');
  await page.waitForTimeout(150);
  T.eq(await page.evaluate(() => localStorage.getItem('sr1.ironman')), null, 'not yet before the debounce');
  await page.waitForTimeout(500);
  const iron = await page.evaluate(() => JSON.parse(localStorage.getItem('sr1.ironman')));
  T.ok(!!iron && iron.meta.inProgress === true && iron.state.mode.inProgress === true, 'written after the (tuning) debounce, marked mode.inProgress (a mid-day state)', iron && iron.meta);
  await page.evaluate(() => { localStorage.removeItem('sr1.ironman'); window.SR.events.emit('action:done', { id: 'uofs.study', result: { ok: true, id: 'uofs.study', deltas: [{ kind: 'stat', key: 'int', n: 2, from: 7, to: 9 }, { kind: 'time', n: 120, from: 480, to: 600 }] } }); });
  await page.waitForTimeout(700);
  T.eq(await page.evaluate(() => localStorage.getItem('sr1.ironman')), null, 'an action that changes no HP, money or karma does not write it');
  await page.evaluate(() => { window.SR.events.emit('day:started', { day: 2 }); });
  const night = await page.evaluate(() => ({ iron: JSON.parse(localStorage.getItem('sr1.ironman')), auto: localStorage.getItem('sr1.auto') }));
  T.ok(!!night.iron && night.iron.state.mode.inProgress === false && night.auto === null, 'every night writes it at once (inProgress false; no auto slot on Hardcore)');
  // W1-M's frame stores `pending` and writes the slot before a stake-bearing minigame opens.
  await page.evaluate(() => { const s = window.SR.state; s.pending = { resolve: 'bar.fight:resolve', worst: { outcome: 'lose', hpLeft: 1 } }; window.SR.save.write('ironman'); });
  await t.reload();
  const pend = await page.evaluate(() => {
    const SR = window.SR, calls = [];
    const real = SR.act;
    SR.act = function (id, p) { calls.push([id, p]); return { ok: true, id, deltas: [] }; };   // a test spy (W1-R's pipeline is not under test here)
    const s = SR.save.load('ironman');
    SR.act = real;
    return { calls, pending: s.pending, stored: JSON.parse(localStorage.getItem('sr1.ironman')).state.pending };
  });
  T.eq(pend, { calls: [['bar.fight:resolve', { outcome: 'lose', hpLeft: 1 }]], pending: null, stored: null }, 'reloading mid-minigame applies the pending worst result first (a loss) and rewrites the slot');
  await page.evaluate(() => window.SR.events.emit('game:over', { reason: 'death', result: {} }));
  T.eq(await page.evaluate(() => localStorage.getItem('sr1.ironman')), null, 'death deletes the ironman slot');

  T.section('settings persist; Classic untouched');
  await page.evaluate(() => { window.SR.settings.set('audio.music', 0.3); window.SR.settings.set('display.fpsCap', 30); });
  await t.reload();
  T.eq(await page.evaluate(() => [window.SR.settings.get('audio.music'), window.SR.loop.fpsCap]), [0.3, 30], 'settings survive a reload (and the loop reads fpsCap)');
  await page.evaluate(() => window.SR.settings.reset());
  T.eq(await page.evaluate(() => [window.SR.settings.get('display.fpsCap'), window.SR.loop.fpsCap]), [60, 60], 'settings.reset() puts the loop back to 60 fps too');
  T.eq(await page.evaluate(() => localStorage.getItem('srpg.save')), 'the classic save', 'Classic mode\'s srpg.save is never touched');
  T.ok(await page.evaluate(() => Object.keys(localStorage).every((k) => k === 'srpg.save' || k.indexOf('sr1.') === 0)), 'every other key is under sr1.');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();

  T.section('storage unavailable');
  {
    const m = await h.open();
    await m.context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); });
    await m.reload();
    const r = await m.page.evaluate(() => {
      const SR = window.SR;
      SR.save.load(SR.rules.state.create({ seed: 1 }));
      SR.save.write('slot1');
      SR.settings.set('audio.sfx', 0.2);
      return { available: SR.save.available, read: SR.save.read('slot1').seed, sfx: SR.settings.get('audio.sfx') };
    });
    T.eq(r, { available: false, read: 1, sfx: 0.2 }, 'when localStorage throws, saves and settings live in memory (SR.save.available false for the boot warning)');
    T.eq(m.errors(), [], 'and nothing logs an error');
    await m.close();
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
