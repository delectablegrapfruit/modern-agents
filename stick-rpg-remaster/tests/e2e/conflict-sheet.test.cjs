// tests/e2e/conflict-sheet.test.cjs — owner: W1-C. Opens tests/sheets/conflict.html from file://
// in Chromium: every fighter draws with a known accessory, every city's palette keys resolve to
// colours, every decree card has its text, zero console errors; captures the sheet into
// shots/W1-C/ (git-ignored) for review against ART_AUDIO §2.3, §4, §7 and UI §5.8.
//   node tests/e2e/conflict-sheet.test.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-C');
const URL = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'conflict.html')).href;

(async () => {
  const T = h.suite('e2e conflict sheet (W1-C)');
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ url: URL, width: 1280, height: 720 });
  const { page } = t;
  await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 10000 });
  const info = await page.evaluate(() => {
    const D = SR.art.draw;
    return {
      fighters: SR.registry.entries('fighter').length,
      cards: document.querySelectorAll('.fighters .card').length,
      unknownAcc: SR.registry.entries('fighter').filter((e) => !SR.art.stick.look || !SR.art.stick.look(e.id)).map((e) => e.id),
      colours: SR.registry.entries('city').map((e) => Object.values(e.def.art.colours).map((k) => D.color(k))),
      decrees: Array.from(document.querySelectorAll('.decrees .card b')).map((b) => b.textContent),
      missing: SR.text.missing ? SR.text.missing() : [],
      errors: window.__sheet.errors,
    };
  });
  T.eq([info.fighters, info.cards], [17, 17], 'the 12 regulars, 4 masked ring fighters and the goon are drawn');
  T.ok(info.colours.every((c) => c.length === 7 && c.every((x) => typeof x === 'string' && /^#|^rgb/.test(x))), 'every city palette key resolves to a colour');
  T.ok(info.decrees.length === 14 && info.decrees.every((x) => x && x.indexOf('⟦') < 0), 'every decree card has its name');
  T.eq(info.missing.filter((k) => /^(city|fighter|decree|crime|trip)\./.test(k)), [], 'no missing W1-C text keys');
  T.eq(info.errors, [], 'no page errors');
  const warns = (await t.warnings()).filter((w) => /accessory|palette|fighter|city\./.test(w));
  T.eq(warns, [], 'no warnings about accessories or palette keys');
  await page.screenshot({ path: path.join(SHOTS, 'conflict-sheet.png'), fullPage: true });
  const top = await page.$('.fighters');
  if (top) await top.screenshot({ path: path.join(SHOTS, 'fighters.png') });
  const cities = await page.$('.cities');
  if (cities) await cities.screenshot({ path: path.join(SHOTS, 'cities.png') });
  const dec = await page.$('.decrees');
  if (dec) await dec.screenshot({ path: path.join(SHOTS, 'decrees.png') });
  T.eq(await t.errors(), [], 'zero console errors, page errors and failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
