// Shared Playwright helpers for the automated checks. Loads index.html over file:// in Chromium.
// Usage:  const h = require('./harness.cjs'); const { page, errors, close } = await h.open();
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');

async function open(opts = {}) {
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 550, height: 400 }, deviceScaleFactor: opts.scale || 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  await page.goto('file://' + path.join(ROOT, 'index.html') + (opts.query || ''));
  await page.waitForFunction(() => window.SRPG && SRPG.engine && SRPG.engine.sceneName);
  if (!opts.live) await page.evaluate(() => SRPG.engine.pause(true)); // drive ticks by hand
  return {
    browser, page, errors,
    // Run n logic ticks synchronously, then redraw.
    step: (n = 1) => page.evaluate((n) => { SRPG.engine.step(n); SRPG.engine.draw(); }, n),
    newGame: (o) => page.evaluate((o) => { SRPG.debug.newGame(o); SRPG.engine.draw(); }, o || {}),
    open: (id) => page.evaluate((id) => { SRPG.debug.open(id); SRPG.engine.draw(); }, id),
    state: () => page.evaluate(() => SRPG.debug.state()),
    set: (p) => page.evaluate((p) => { SRPG.debug.set(p); SRPG.engine.draw(); }, p),
    // Hold keys for n ticks (keys: array of engine key names, e.g. ['ArrowUp', 'Shift']).
    hold: (keys, n) => page.evaluate(([keys, n]) => {
      keys.forEach((k) => (SRPG.engine.keys[k] = true));
      SRPG.engine.step(n);
      keys.forEach((k) => (SRPG.engine.keys[k] = false));
      SRPG.engine.draw();
    }, [keys, n]),
    // Click a DOM button in #ui by its data-id or by its visible text.
    clickUI: async (idOrText) => {
      const ok = await page.evaluate((t) => {
        const all = Array.from(document.querySelectorAll('#ui [data-id], #ui .ibtn, #ui .tbtn'));
        const el = all.find((e) => e.getAttribute('data-id') === t) ||
          all.find((e) => e.textContent.replace(/\s+/g, ' ').trim().toUpperCase() === String(t).toUpperCase()) ||
          all.find((e) => e.textContent.replace(/\s+/g, ' ').trim().toUpperCase().indexOf(String(t).toUpperCase()) === 0);
        if (!el) return false;
        el.click();
        SRPG.engine.draw();
        return true;
      }, idOrText);
      if (!ok) throw new Error('clickUI: no button ' + idOrText);
    },
    uiText: () => page.evaluate(() => document.getElementById('ui').innerText),
    shot: (file) => page.screenshot({ path: file }),
    close: () => browser.close(),
  };
}

module.exports = { open, ROOT };
