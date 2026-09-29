// tests/e2e/boot.test.cjs — owner: W1-K (lead). Boot from file:// (M0 part of BUILD_PLAN §3.1):
// index.html has the stage layers and every script; SR boots; the boot scene hands over to the
// title (the kernel's stub until W2-Front registers its scenes); zero console errors.
//   node tests/e2e/boot.test.cjs        (screenshot: shots/W1-K/boot-title.png, git-ignored)
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const { indexScripts } = require('../node/load.cjs');

(async () => {
  const T = h.suite('e2e boot');
  const t = await h.open();
  const { page } = t;

  T.section('page');
  const layers = await page.evaluate(() => {
    const q = (s) => !!document.querySelector(s);
    return {
      app: q('body > #app'), stage: q('#app > #stage'), world: q('#stage > canvas#world'),
      fx: q('#stage > canvas#fx'), ui: q('#stage > div#ui'), aria: q('#stage > div#aria[aria-live="polite"]'),
      order: Array.from(document.getElementById('stage').children).map((e) => e.id),
    };
  });
  T.ok(layers.app && layers.stage && layers.world && layers.fx && layers.ui && layers.aria, 'stage layers #app > #stage > #world, #fx, #ui, #aria', layers);
  T.eq(layers.order, ['world', 'fx', 'ui', 'aria'], 'layer order world, fx, ui, aria');
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.getAttribute('src')));
  T.eq(scripts, indexScripts(), 'every script tag loaded in index order');
  const missing = scripts.filter((s) => !fs.existsSync(path.join(h.ROOT, s)));
  T.eq(missing, [], 'every script exists on disk');
  T.eq(scripts[0], 'js/boot/namespace.js', 'namespace.js first');
  T.eq(scripts[scripts.length - 1], 'js/main.js', 'main.js last');

  T.section('boot');
  T.ok(await page.evaluate(() => window.SR.booted === true), 'SR.booted');
  T.eq(await t.scenes(), ['title'], 'boot hands over to title');
  T.ok(await page.locator('#ui [data-scene="title"] [data-id="title-stub"]').isVisible(), 'the title stub is visible in #ui');
  const text = await t.uiText();
  T.ok(/PAPER SKY/i.test(text), 'the title reads PAPER SKY', text);
  T.ok(await page.evaluate(() => window.SR.rng.fx.state().join() !== window.SR.rng.create(3).state().join()), 'the fx stream was reseeded at boot');

  T.section('debug (M0)');
  T.eq(await t.ui(), { scenes: ['title'] }, 'SR.debug.ui() lists the scene stack');
  T.eq(await t.goto('boot'), ['title'], 'SR.debug.goto(boot) lands on the title again');
  let rejected = '';
  try { await t.newGame(); } catch (e) { rejected = e.message; }
  T.ok(/not available yet/.test(rejected), 'a debug function that has not landed rejects clearly');

  const shot = path.join(h.ROOT, 'shots', 'W1-K', 'boot-title.png');
  await t.shot(shot);
  T.eq(t.errors(), [], 'zero console errors, page errors and failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
