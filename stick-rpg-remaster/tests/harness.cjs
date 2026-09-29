// tests/harness.cjs — owner: W1-K (lead). Playwright helpers for the e2e suites: opens index.html
// over file:// in Chromium and drives the game through SR.debug (ARCHITECTURE §18, §20;
// docs/CONTRACT.md §17). After boot the loop is paused and the quality preset pinned to High
// (M1); tests step the clock. Options: width, height, dpr, touch (a coarse-pointer mobile context),
// hash, live (keep the loop running), quality, fast (SR.debug.fast(true)), timeout, url.
//
//   const h = require('../harness.cjs');
//   const t = await h.open({ width: 1280, height: 720 });
//   await t.goto('title'); console.log(await t.scenes(), t.errors()); await t.close();
//
// A method whose SR.debug function has not landed yet rejects with a clear message.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/** Playwright from the project, NODE_PATH, or the global prefix of this Node (npm install -g playwright). */
function loadPlaywright() {
  const bin = path.dirname(process.execPath);
  const tries = ['playwright', path.join(bin, '..', 'lib', 'node_modules', 'playwright'), path.join(bin, 'node_modules', 'playwright')];
  for (const p of tries) {
    try { return require(p); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  throw new Error('tests/harness.cjs: Playwright not found (npm install -g playwright, then npx playwright install chromium)');
}
const playwright = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const INDEX_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const { suite } = require('./node/load.cjs');

/**
 * Opens the game.
 * @param {object} opts width, height (default 1280 × 720), dpr (1), touch (a coarse-pointer mobile
 *   context), hash ('#debug', '#artbible'), live (true: do not pause the loop), quality (default
 *   'high'), timeout (boot wait, ms, default 10000), url (another page, e.g. a contact sheet)
 */
async function open(opts = {}) {
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({
    viewport: { width: opts.width || 1280, height: opts.height || 720 },
    deviceScaleFactor: opts.dpr || 1,
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch,
  });
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
    else if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  const url = (opts.url || INDEX_URL) + (opts.hash || '');
  /** Waits for SR.booted, then pauses the loop, pins the preset and applies fast (unless opted out). */
  const settle = async () => {
    try {
      await page.waitForFunction(() => window.SR && window.SR.booted === true, null, { timeout: opts.timeout || 10000 });
    } catch (e) {
      await browser.close();
      throw new Error('harness.open: SR did not boot (' + e.message + ')\n' + errors.join('\n'));
    }
    await page.evaluate(([live, quality, fast]) => {
      const SR = window.SR;
      if (!live && SR.loop && typeof SR.loop.pause === 'function') SR.loop.pause();
      if (quality && SR.quality && typeof SR.quality.set === 'function') SR.quality.set(quality);
      if (fast && SR.debug && typeof SR.debug.fast === 'function') SR.debug.fast(true);
    }, [!!opts.live, opts.quality === undefined ? 'high' : opts.quality, !!opts.fast]);
  };
  await page.goto(url);
  await settle();

  /** Calls SR.debug[name](...args) in the page and returns its (JSON) result. */
  const debug = (name, ...args) => page.evaluate(([name, args]) => {
    const d = window.SR && window.SR.debug;
    if (!d || typeof d[name] !== 'function') throw new Error('SR.debug.' + name + ' is not available yet (W1-K M1)');
    const r = d[name].apply(d, args);
    return r === undefined ? null : JSON.parse(JSON.stringify(r));
  }, [name, args]);

  const t = {
    browser, context, page, url,
    debug,
    /** Evaluates fn(arg) in the page. */
    eval: (fn, arg) => page.evaluate(fn, arg),
    newGame: (o) => debug('newGame', o || {}),
    set: (patch) => debug('set', patch),
    state: () => page.evaluate(() => (window.SR.state ? JSON.parse(JSON.stringify(window.SR.state)) : null)),
    act: (id, params) => debug('act', id, params),
    preview: (id, params) => debug('preview', id, params),
    enter: (buildingId) => debug('enter', buildingId),
    goto: (sceneId, params) => debug('goto', sceneId, params),
    step: (frames) => debug('step', frames === undefined ? 1 : frames),
    press: (action) => debug('press', action),
    hold: (action, frames) => debug('hold', action, frames),
    teleport: (x, y) => debug('teleport', x, y),
    setTime: (min) => debug('setTime', min),
    seed: (n) => debug('seed', n),
    mg: (result) => debug('mg', result),
    quality: (preset) => debug('quality', preset),
    perf: () => debug('perf'),
    ui: () => debug('ui'),
    get: (p) => debug('get', p),
    setDay: (d) => debug('setDay', d),
    fast: (on) => debug('fast', on === undefined ? true : on),
    night: (kind) => debug('night', kind),
    down: (cause) => debug('down', cause),
    /** Presses (down: true) or releases an action through SR.input.inject. */
    inject: (action, down) => page.evaluate(([a, d]) => { window.SR.input.inject(a, d); return true; }, [action, down !== false]),
    /** Resizes the viewport and lays the stage out at once (skipping the 150 ms resize debounce). */
    resize: async (width, height) => {
      await page.setViewportSize({ width, height });
      return page.evaluate(() => { window.SR.stage.resize(); return window.SR.stage.box; });
    },
    /** Reloads the page (storage survives) and waits for the boot again, paused and pinned. */
    reload: async () => { await page.reload(); await settle(); },
    /** @returns {Promise<string[]>} the scene stack, bottom to top. */
    scenes: () => page.evaluate(() => window.SR.scenes.stack()),
    /** Clicks the visible #ui element with data-id (a real pointer click). */
    clickUI: async (dataId) => {
      const loc = page.locator('#ui [data-id="' + String(dataId).replace(/"/g, '\\"') + '"]').filter({ visible: true }).first();
      if (!(await loc.count())) throw new Error('clickUI: no visible #ui [data-id="' + dataId + '"]');
      await loc.click();
    },
    uiText: () => page.evaluate(() => document.getElementById('ui').innerText),
    /** Presses a real key (KeyboardEvent.code or a Playwright key name). */
    key: (code) => page.keyboard.press(code),
    /** Screenshot to file (directories created); shots belong in shots/<package>/ (git-ignored). */
    shot: async (file) => {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      await page.screenshot({ path: file });
      return file;
    },
    /**
     * Reads canvas#world pixels for a logical rect (x, y, w, h in the 1280 × 720 stage).
     * @returns {Promise<{width: number, height: number, data: number[]}>} RGBA bytes of the backing store
     */
    pixels: (x, y, w, h) => page.evaluate(([x, y, w, h]) => {
      const c = document.getElementById('world');
      const k = c.width / (window.SR.W || 1280);
      const sx = Math.round(x * k), sy = Math.round(y * k);
      const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
      const img = c.getContext('2d').getImageData(sx, sy, sw, sh);
      return { width: sw, height: sh, data: Array.from(img.data) };
    }, [x, y, w, h]),
    /** @returns {string[]} console errors, page errors and failed requests so far. */
    errors: () => errors.slice(),
    /** @returns {string[]} console warnings so far (e.g. missing text keys). */
    warnings: () => warnings.slice(),
    close: () => browser.close(),
  };
  return t;
}

module.exports = { open, ROOT, INDEX_URL, suite, playwright };
