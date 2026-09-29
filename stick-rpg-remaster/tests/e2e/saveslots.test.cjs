// tests/e2e/saveslots.test.cjs — owner: W2-Front. Save / Load (BUILD_PLAN §4.11; UI.md §5.16;
// ARCHITECTURE §15): the slot cards (3 + Auto + Suspend: thumbnail, name, day / length, title, net
// worth, play time, saved at), Save here / Load / Delete with their confirms, the title's Load and
// Continue (the latest save), More: Copy save code (the clipboard, else the textarea), Paste save code
// (bad and damaged codes say so), Download file and Import file, Hardcore's single ironman slot ("In
// progress · Day d, hh:mm"; no manual save), a full storage ("delete a save"), an unreadable save and
// one from a newer version. Screenshots: shots/W2-Front/.
//   node tests/e2e/saveslots.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Front');
const TMP = SHOTS;               // the downloaded save lands beside the screenshots (git-ignored)

(async () => {
  const T = h.suite('e2e saveslots (W2-Front)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => t.eval(fn, arg);
  const info = () => ev(() => { const d = window.SR.reg.scene.saveload; return d && d.info() ? JSON.parse(JSON.stringify(d.info())) : null; });
  const shot = (name) => t.shot(path.join(SHOTS, name + '.png'));
  const cardText = (slot) => ev((slot) => { const c = document.querySelector('#ui [data-id="slot-' + slot + '"]'); return c ? c.innerText.replace(/\s+/g, ' ') : null; }, slot);
  const has = (id) => ev((id) => !!document.querySelector('#ui [data-id="' + id + '"]'), id);
  const toasts = () => ev(() => window.SR.ui.toast.list().map((x) => x.text));
  const clearSaves = () => ev(() => { const S = window.SR.save; S.storage.keys('sr1.').forEach((k) => { if (k !== 'sr1.settings' && k !== 'sr1.profile') S.storage.remove(k); }); window.SR.ui.toast.clear(); });

  // ------------------------------------------------------------------------------------------------
  T.section('saving from the pause menu');
  await clearSaves();
  await t.newGame({ seed: 41, name: 'Rikki', length: 40 });
  await t.set({ clock: { day: 12, min: 870 }, money: { cash: 4210 }, job: { ranks: { nli: 'sales' } } });
  await t.goto('city');
  await t.step(2);
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-save'); await t.step(1);
  let si = await info();
  T.eq([si.mode, si.slots], ['save', ['slot1', 'slot2', 'slot3', 'auto', 'suspend']], 'Save opens the slots in save mode: 3 slots, Auto and Suspend');
  T.ok(await has('sl-save-slot1') && !(await has('sl-save-auto')), 'Save here on the manual slots only');
  await t.clickUI('sl-save-slot1');
  await t.step(1);
  const c1 = await cardText('slot1');
  T.ok(/Rikki · Day 12 \/ 40/.test(c1) && /Salesperson · \$4,/.test(c1) && /Standard · \d+m/.test(c1) && /Saved /.test(c1), 'the card: name, day / length, title, net worth, difficulty, play time, saved at', c1);
  T.ok(await ev(() => { const i = document.querySelector('#ui [data-id="slot-slot1"] img.sl-thumb'); return !!(i && /^data:image\/jpeg/.test(i.src)); }), 'and the 160 × 90 thumbnail of the world');
  T.ok((await toasts()).some((x) => /Saved to Slot 1/.test(x)), 'a toast confirms it');
  await t.set({ clock: { day: 13 } });
  await t.clickUI('sl-save-slot1');
  await t.step(1);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'saving over a slot asks first');
  await t.clickUI('sl-confirm-save-yes');
  await t.step(1);
  T.ok(/Day 13 \/ 40/.test(await cardText('slot1')), 'and overwrites it');
  await t.set({ clock: { day: 14 } });
  await t.clickUI('sl-save-slot2');
  await t.step(1);
  await A.check(T, t, 'save-load (save mode)', '#ui [data-scene="saveload"]');
  await shot('saveload-save');

  // ------------------------------------------------------------------------------------------------
  T.section('loading and deleting');
  await t.clickUI('sl-mode-load');
  si = await info();
  T.eq(si.mode, 'load', 'the Save | Load switch');
  T.ok(!(await has('sl-save-slot3')) && await has('sl-load-slot1'), 'load mode: Load on the saved slots, no Save here');
  await t.set({ clock: { day: 20 } });
  await t.clickUI('sl-load-slot1');
  await t.step(1);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'loading over a running game asks first');
  await t.clickUI('sl-confirm-load-yes');
  await t.step(2);
  T.eq([await t.scenes(), await t.get('clock.day')], [['city'], 13], 'Load makes the save the live game, in the city');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-load'); await t.step(1);
  await t.clickUI('sl-delete-slot2');
  await t.step(1);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'Delete asks first');
  await t.clickUI('sl-confirm-delete-yes');
  await t.step(1);
  T.ok(/Empty/.test(await cardText('slot2')) && !(await ev(() => window.SR.save.storage.get('sr1.slot2'))), 'and the slot is empty');
  await t.press('back'); await t.step(1);
  await t.press('back'); await t.step(1);

  T.section('the title: Load with no game running, Continue picks the latest');
  await ev(() => { window.SR.state = null; });
  await t.goto('title');
  await t.clickUI('title-load'); await t.step(1);
  T.eq((await info()).mode, 'load', 'Load opens the slots in load mode');
  T.ok(!(await has('sl-mode')), 'no Save | Load switch without a game');
  await t.clickUI('sl-load-slot1');
  await t.step(2);
  T.eq([await t.scenes(), await t.get('player.name'), await t.get('clock.day')], [['city'], 'Rikki', 13], 'with no game running, Load needs no confirm');
  await t.set({ clock: { day: 15 } });
  await ev(() => window.SR.save.write('auto'));
  await ev(() => { window.SR.state = null; });
  await t.goto('title');
  T.ok(/Day 15 \/ 40/i.test(await ev(() => document.querySelector('#ui [data-id="title-save"]').innerText)), 'the title\'s save card shows the most recent save (the autosave)');
  await t.clickUI('title-continue');
  await t.step(2);
  T.eq(await t.get('clock.day'), 15, 'Continue loads the latest of suspend / auto / slots');

  // ------------------------------------------------------------------------------------------------
  T.section('More: save codes and files');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-save'); await t.step(1);
  await t.clickUI('sl-more-toggle'); await t.step(1);
  T.ok(await has('sl-copy') && await has('sl-paste-input') && await has('sl-download') && await has('sl-import'), 'Copy save code, Paste save code, Download file, Import file');
  await A.check(T, t, 'save-load More', '#ui [data-scene="saveload"]');
  await shot('saveload-more');
  await ev(() => { window.__clip = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { window.__clip = s; return Promise.resolve(); } } }); });
  await t.clickUI('sl-copy');
  await page.waitForFunction(() => window.__clip !== null, null, { timeout: 3000 }).catch(() => {});
  const code = await ev(() => window.__clip);
  T.ok(/^PSKY1:[A-Za-z0-9+/=]+:[0-9a-f]{8}$/.test(code || ''), 'Copy save code puts the PSKY1 code on the clipboard');
  await ev(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
  await t.clickUI('sl-copy');
  await page.waitForSelector('#ui [data-id="save-code"]', { timeout: 3000 }).catch(() => {});
  const fb = await ev(() => { const a = document.querySelector('#ui [data-id="save-code-text"]'); return a ? { ro: a.readOnly, ok: /^PSKY1:/.test(a.value), focused: document.activeElement === a } : null; });
  T.ok(fb && fb.ro && fb.ok && fb.focused, 'when the clipboard refuses: the read-only, pre-selected textarea', fb);
  await page.keyboard.press('Escape');
  await t.step(1);
  await t.set({ clock: { day: 30 } });
  await page.locator('#ui [data-id="sl-paste-input"]').fill('PSKY1:not-a-code');
  await t.clickUI('sl-paste-go');
  T.ok(/That is not a Paper Sky save code|damaged/.test(await t.uiText()), 'a bad code says so');
  await page.locator('#ui [data-id="sl-paste-input"]').fill(code.slice(0, -1) + (code.slice(-1) === '0' ? '1' : '0'));
  await t.clickUI('sl-paste-go');
  T.ok(/damaged/.test(await t.uiText()), 'a damaged code (checksum) says so');
  await page.locator('#ui [data-id="sl-paste-input"]').fill(code);
  await t.clickUI('sl-paste-go');
  await t.step(1);
  await t.clickUI('sl-confirm-load-yes');
  await t.step(2);
  T.eq([await t.scenes(), await t.get('clock.day')], [['city'], 15], 'Paste save code loads the game the code holds');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-save'); await t.step(1);
  await t.clickUI('sl-more-toggle'); await t.step(1);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), t.clickUI('sl-download')]);
  T.ok(/^paper-sky-rikki-day15\.json$/.test(dl.suggestedFilename()), 'Download file saves a JSON file', dl.suggestedFilename());
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, 'W2-Front-save.json');
  await dl.saveAs(file);
  await t.set({ clock: { day: 31 } });
  await page.locator('#ui [data-id="sl-file"]').setInputFiles(file);
  await page.waitForFunction(() => window.SR.scenes.top().id === 'confirm', null, { timeout: 5000 }).catch(() => {});
  await t.clickUI('sl-confirm-load-yes');
  await t.step(2);
  T.eq([await t.scenes(), await t.get('clock.day')], [['city'], 15], 'Import file loads it back');

  // ------------------------------------------------------------------------------------------------
  T.section('Hardcore: one ironman slot, no manual save');
  await clearSaves();
  await t.newGame({ seed: 43, name: 'Iron', difficulty: 'hardcore' });
  await t.goto('city');
  await t.set({ clock: { min: 870 } });
  await ev(() => { window.SR.state.mode.inProgress = true; window.SR.save.write('ironman'); });
  await t.press('pause'); await t.step(1);
  T.ok(!(await has('pause-save')), 'the pause menu has no Save');
  await t.clickUI('pause-load'); await t.step(1);
  si = await info();
  T.eq([si.mode, si.slots], ['load', ['ironman']], 'Save / Load shows only the ironman slot');
  T.ok(/In progress · Day 1, 14:30/.test(await cardText('ironman')), '"In progress · Day 1, 14:30" while a day is under way', await cardText('ironman'));
  T.ok(!(await has('sl-delete-ironman')), 'the live run\'s slot cannot be deleted from here');
  await t.clickUI('sl-more-toggle'); await t.step(1);
  T.ok(await has('sl-copy') && !(await has('sl-paste-input')) && !(await has('sl-import')), 'More exports only (no Paste or Import into a Hardcore run)');
  await shot('saveload-hardcore');
  await t.press('back'); await t.step(1);
  await t.press('back'); await t.step(1);

  // ------------------------------------------------------------------------------------------------
  T.section('a full storage, an unreadable save, a newer save');
  await clearSaves();
  await t.newGame({ seed: 44, name: 'Quota' });
  await t.goto('city');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-save'); await t.step(1);
  await ev(() => { const S = window.SR.save.storage; window.__set = S.set; S.set = function () { const e = new Error('full'); e.code = 'quota'; throw e; }; });
  await t.clickUI('sl-save-slot3');
  await t.step(1);
  T.ok((await toasts()).some((x) => /Storage is full\. Delete a save to make room\./.test(x)), 'a full storage asks to delete a save (quota)');
  await ev(() => { window.SR.save.storage.set = window.__set; });
  await ev(() => { const S = window.SR.save.storage; S.set('sr1.slot2', '{broken'); S.set('sr1.slot3', JSON.stringify({ fmt: 'sr-save', v: 99, meta: { name: 'Future', day: 3, length: 40, difficulty: 'standard', savedAt: 1 }, state: { v: 99 } })); });
  await t.press('back'); await t.step(1);
  await t.clickUI('pause-load'); await t.step(1);
  T.ok(/couldn't be read/.test(await cardText('slot2')) && !(await has('sl-load-slot2')) && await has('sl-delete-slot2'), 'an unreadable save says "This save couldn\'t be read" (Delete only)');
  await ev(() => window.SR.ui.toast.clear());
  await t.clickUI('sl-load-slot3');
  await t.step(1);
  await t.clickUI('sl-confirm-load-yes');
  await t.step(1);
  T.ok((await toasts()).some((x) => /newer version of Paper Sky/.test(x)), 'a save from a newer version is refused with a friendly message');
  T.ok(await ev(() => !!window.SR.save.storage.get('sr1.slot3')), 'and kept (not quarantined)');
  await shot('saveload-broken');

  T.section('result');
  T.eq(await ev(() => window.SR.text.missing()), [], 'every text key Save / Load showed resolves');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
