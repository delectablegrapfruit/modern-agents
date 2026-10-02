// tests/e2e/boot.test.cjs — owner: W1-K (lead). Boot from file:// (BUILD_PLAN §3.1): index.html has
// the stage layers and every script; SR boots; the boot scene hands over to the title (W2-Front's,
// or the kernel's stub without it); the M1 kernel is live (loop, stage, quality, input,
// save, settings, the debug API, scene transitions through SR.render.fx); #debug shows the perf
// overlay; #artbible opens the art-bible scene; zero console errors.
//   node tests/e2e/boot.test.cjs        (screenshots: shots/W1-K-M1/, git-ignored)
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const { indexScripts } = require('../node/load.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-K-M1');

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
      ids: Array.from(document.querySelectorAll('[id]')).map((e) => e.id).sort(),
    };
  });
  T.ok(layers.app && layers.stage && layers.world && layers.fx && layers.ui && layers.aria, 'stage layers #app > #stage > #world, #fx, #ui, #aria', layers);
  T.eq(layers.order, ['world', 'fx', 'ui', 'aria'], 'layer order world, fx, ui, aria');
  T.eq(layers.ids, ['app', 'aria', 'fx', 'stage', 'ui', 'world'], 'no DOM ids other than the stage layers');
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.getAttribute('src')));
  T.eq(scripts, indexScripts(), 'every script tag loaded in index order');
  const missing = scripts.filter((s) => !fs.existsSync(path.join(h.ROOT, s)));
  T.eq(missing, [], 'every script exists on disk');
  T.eq(scripts[0], 'js/boot/namespace.js', 'namespace.js first');
  T.eq(scripts[scripts.length - 1], 'js/main.js', 'main.js last');

  T.section('boot');
  T.ok(await page.evaluate(() => window.SR.booted === true), 'SR.booted');
  T.eq(await t.scenes(), ['title'], 'boot hands over to title');
  T.ok(await page.locator('#ui [data-scene="title"]').first().isVisible(), 'the title scene is mounted in #ui');
  const text = await t.uiText();
  T.ok(/PAPER SKY/i.test(text), 'the title reads PAPER SKY', text.slice(0, 200));
  T.ok(await page.evaluate(() => window.SR.rng.fx.state().join() !== window.SR.rng.create(3).state().join()), 'the fx stream was reseeded at boot');

  T.section('the M1 kernel is live');
  const k = await page.evaluate(() => {
    const SR = window.SR;
    return {
      hooks: SR.registry.hooks().filter((x) => /^js\/core\//.test(x.file)).map((x) => x.file.replace('js/core/', '') + ':' + x.prio),
      paused: SR.loop.paused, preset: SR.quality.preset, auto: SR.quality.auto, k: SR.stage.k, ctx: !!SR.stage.ctx,
      transform: SR.stage.ctx.getTransform().a, backing: [SR.stage.world.width, SR.stage.world.height],
      input: typeof SR.input.on, save: SR.save.available, settings: SR.settings.get('display.quality'),
    };
  });
  T.ok(['loop.js:10', 'stage.js:10', 'quality.js:10', 'input.js:10', 'save.js:10', 'debug.js:50', 'debug.js:90'].every((x) => k.hooks.indexOf(x) >= 0), 'the kernel modules boot through SR.onBoot', k.hooks);
  T.eq([k.paused, k.preset, k.auto], [true, 'high', false], 'the harness paused the loop and pinned High');
  T.eq([k.k, k.backing, k.transform], [1, [1280, 720], 1], 'the stage is 1280 × 720 at 1280 × 720, DPR 1, in logical units');
  T.eq([k.input, k.save, k.settings], ['function', true, 'auto'], 'input, save (localStorage available from file://) and settings are live');
  const time0 = await page.evaluate(() => window.SR.loop.time);
  await t.step(30);
  T.ok(Math.abs((await page.evaluate(() => window.SR.loop.time)) - time0 - 0.5) < 1e-9, 'SR.debug.step(30) advances the loop by 0.5 s');
  const live = await page.evaluate(() => new Promise((res) => {
    const SR = window.SR, s0 = SR.loop.steps;
    SR.loop.resume();
    setTimeout(() => { const n = SR.loop.steps - s0; SR.loop.pause(); res({ n, perf: SR.loop.perf }); }, 400);
  }));
  T.ok(live.n >= 12 && live.n <= 30, 'resumed, the loop runs its fixed steps on requestAnimationFrame (~60 Hz)', live.n);
  T.ok(live.perf.frames > 5 && live.perf.fps > 20 && live.perf.update.p95 >= 0 && live.perf.render.p95 >= 0, 'SR.loop.perf fills with work times and fps', live.perf);

  T.section('the hidden tab pauses the loop');
  const hidden = await page.evaluate(() => new Promise((res) => {
    const SR = window.SR;
    let vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => vis === 'hidden' });
    const flip = (v) => { vis = v; document.dispatchEvent(new Event('visibilitychange')); };
    // A stand-in city and pause overlay unless the real ones are registered (W2-City, W2-Front).
    const stub = !SR.reg.scene.city && !SR.reg.scene.pause;
    if (stub) { SR.scenes.register('city', { kind: 'base' }); SR.scenes.register('pause', { kind: 'overlay', blocksUpdate: true }); SR.scenes.go('city'); }
    const out = { stub };
    flip('hidden'); flip('visible');
    out.stayedPaused = SR.loop.paused;                   // paused by the harness: coming back does not resume it
    SR.loop.resume();
    setTimeout(() => {
      flip('hidden');
      out.pausedWhenHidden = SR.loop.paused;
      const t0 = SR.loop.time, s0 = SR.loop.steps;
      setTimeout(() => {
        out.frozen = SR.loop.time === t0 && SR.loop.steps === s0;
        flip('visible');
        out.resumed = !SR.loop.paused;
        out.stack = SR.scenes.stack();
        setTimeout(() => {
          out.advancing = SR.loop.steps > s0;
          SR.loop.pause();
          if (stub) SR.scenes.go('title');
          delete document.visibilityState; delete document.hidden;
          res(out);
        }, 200);
      }, 300);
    }, 100);
  }));
  T.eq(hidden.stayedPaused, true, 'a loop paused by a test stays paused when the tab comes back');
  T.eq([hidden.pausedWhenHidden, hidden.frozen], [true, true], 'hiding the tab pauses the loop: no steps, SR.loop.time stands still');
  T.eq([hidden.resumed, hidden.advancing], [true, true], 'showing it again resumes the loop');
  if (hidden.stub) T.eq(hidden.stack, ['city', 'pause'], 'coming back to the city opens the pause overlay');

  T.section('debug API');
  const ui = await t.ui();
  T.eq([ui.scenes, ui.top, ui.contexts], [['title'], 'title', []], 'SR.debug.ui() lists the scene stack, the top and the input contexts');
  // The title on screen: W2-Front's (its boot card `title`, UI §5.1), or the kernel's fallback
  // `title-stub` (CONTRACT §11.3) when the front end is not loaded (W2-Front 1).
  T.ok(Array.isArray(ui.items) && ui.items.some((x) => x.id === 'title-stub' || x.id === 'title') && Array.isArray(ui.rows) && Array.isArray(ui.toasts), 'and the visible [data-id] items, card rows and toasts', ui.items);
  T.eq(await t.goto('boot'), ['title'], 'SR.debug.goto(boot) lands on the title again');
  const hasRules = await page.evaluate(() => !!(window.SR.rules.state && window.SR.rules.state.create));
  if (hasRules) {
    const s = await t.newGame({ seed: 4242 });
    T.eq([s.seed, await t.get('seed'), await t.get('clock.day')], [4242, 4242, 1], 'SR.debug.newGame(opts) starts a live game (W1-R create)');
    await t.set({ money: { cash: 999 } });
    T.eq(await t.get('money.cash'), 999, 'SR.debug.set deep-merges a patch; get reads a dotted path');
    T.eq(await t.setTime(1200), 1200, 'SR.debug.setTime');
  } else {
    T.ok(true, 'newGame skipped: SR.rules.state.create has not landed');
  }
  let rejected = '';
  try { await t.debug('nope'); } catch (e) { rejected = e.message; }
  T.ok(/not available yet/.test(rejected), 'an unknown or not-yet-landed debug function rejects clearly');
  T.eq(await t.fast(true), true, 'SR.debug.fast(true)');
  T.ok(await page.evaluate(() => document.documentElement.classList.contains('sr-fast')), 'fast marks html.sr-fast (CSS transitions off)');
  await t.fast(false);
  T.ok((await t.debug('shot')).indexOf('data:image/png;base64,') === 0, 'SR.debug.shot() returns a PNG data URL');
  T.eq(await t.debug('projected', true), true, 'SR.debug.projected(true) sets SR.debug.flags.projected');
  await t.debug('projected', false);
  const inval = await page.evaluate(() => {
    const SR = window.SR, R = SR.render, orig = R.invalidate, seen = [], changed = [];
    R.invalidate = function (w) { seen.push(w); return orig.apply(this, arguments); };
    const off = SR.events.on('debug:changed', (p) => changed.push(p.flag + ':' + p.on));
    try { SR.debug.grid(true); SR.debug.time(true); SR.debug.time(false); SR.debug.grid(false); } finally { R.invalidate = orig; off(); }
    return { seen, changed };
  });
  T.eq(inval, { seen: [], changed: ['grid:true', 'time:true', 'time:false', 'grid:false'] }, 'an overlay toggle emits debug:changed and invalidates no render cache (W1-G request 4)');

  T.section('scene transitions (CONTRACT §11.4)');
  const tr = await page.evaluate(() => {
    const SR = window.SR, fx = SR.render.fx, out = {};
    if (!SR.reg.scene['test.tr']) SR.scenes.register('test.tr', { kind: 'base' });
    const real = fx.transition, kinds = [];
    fx.transition = function (kind, swap) { kinds.push(kind); return real.call(this, kind, swap); };
    try {
      const p = SR.scenes.go('test.tr');
      out.stack = SR.scenes.stack();
      out.running = fx.state().transition;
      out.promise = !!p && typeof p.then === 'function';
      SR.loop.step(30);                                   // 0.5 s of loop time: the 350 ms page turn ends
      out.after = fx.state().transition;
      SR.scenes.go('title', undefined, { transition: false });
      out.none = fx.state().transition;
      SR.debug.fast(true);
      SR.scenes.go('test.tr');
      out.fast = fx.state().transition;
      SR.debug.fast(false);
      SR.scenes.go('title', undefined, { transition: 'fade' });
      out.fade = fx.state().transition;
      SR.loop.step(30);
    } finally { fx.transition = real; }
    out.kinds = kinds;
    return out;
  });
  T.eq([tr.stack, tr.running, tr.promise, tr.after], [['test.tr'], 'pageTurn', true, null], 'go runs a pageTurn through SR.render.fx (the stack changes at once; the fold ends with the loop time)');
  T.eq([tr.none, tr.fast, tr.fade, tr.kinds], [null, null, 'fade', ['pageTurn', 'fade']], '{ transition: false } and SR.debug.fast(true) swap at once; a named kind runs that transition');
  T.eq(await t.scenes(), ['title'], 'back on the title');

  fs.mkdirSync(SHOTS, { recursive: true });
  await t.shot(path.join(SHOTS, 'boot-title.png'));
  T.eq(t.errors(), [], 'zero console errors, page errors and failed requests');
  await t.close();

  T.section('#debug');
  const d = await h.open({ hash: '#debug' });
  await d.step(3);
  await d.page.waitForTimeout(300);
  const ov = await d.page.evaluate(() => {
    const el = document.querySelector('#app > [data-id="debug-overlay"]');
    return el ? { text: el.textContent, pe: getComputedStyle(el).pointerEvents } : null;
  });
  T.ok(!!ov && /fps/.test(ov.text) && /upd/.test(ov.text) && /quality high/.test(ov.text) && /scenes title/.test(ov.text), 'index.html#debug shows the FPS and perf overlay', ov);
  T.eq(ov && ov.pe, 'none', 'the overlay never takes the pointer');
  await d.shot(path.join(SHOTS, 'boot-debug-overlay.png'));
  await d.page.evaluate(() => { location.hash = ''; });
  await d.page.waitForTimeout(100);
  T.eq(await d.page.evaluate(() => !!document.querySelector('[data-id="debug-overlay"]')), false, 'removing #debug hides it');
  T.eq(d.errors(), [], 'zero console errors with #debug');
  await d.close();

  T.section('#artbible');
  const a = await h.open({ hash: '#artbible' });
  T.eq(await a.scenes(), ['artbible'], 'index.html#artbible opens the artbible scene instead of the boot scene');
  await a.step(1);
  const bible = await a.page.evaluate(() => !!(window.SR.art.bible && typeof window.SR.art.bible.draw === 'function'));
  if (bible) {
    const px = await a.pixels(0, 0, 1280, 720);
    let ink = 0;
    for (let i = 3; i < px.data.length; i += 4) if (px.data[i] > 0) ink++;
    T.ok(ink > px.width * px.height * 0.2, 'the art bible (W1-A) is drawn on canvas#world', ink);
  } else {
    T.ok(true, 'SR.art.bible.draw has not landed (W1-A): the scene stays blank');
  }
  await a.shot(path.join(SHOTS, 'boot-artbible.png'));
  await a.press('back');
  T.eq(await a.scenes(), ['title'], 'back leaves the art bible for the title');
  const cleared = await a.pixels(0, 0, 1280, 720);
  T.ok(!cleared.data.some((v, i) => i % 4 === 3 && v > 0), 'and clears the canvas it drew on');
  await a.page.evaluate(() => { location.hash = '#artbible'; });
  await a.page.waitForTimeout(100);
  T.eq(await a.scenes(), ['artbible'], 'a hash change to #artbible opens it at runtime');
  T.eq(a.errors(), [], 'zero console errors with #artbible');
  await a.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
