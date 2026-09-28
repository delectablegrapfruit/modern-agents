#!/usr/bin/env node
// The Home Screen web app in headless Chromium, as a phone would have it: the site built as it is deployed
// (scripts/web-build.cjs) and served over http under /modern-agents/ (as GitHub Pages serves it); the offline copy
// installs, the page reloads and plays with the server gone and the network off, the manifest and icons are whole, a
// new build is offered by its quiet toast and taken up with a tap, and the page runs full screen from the Home Screen
// inside the phone's safe areas, in both themes. An iPhone is emulated in Chromium (no WebKit here): its size, touch,
// pixel ratio and user agent; navigator.standalone for a Home Screen launch; the safe-area insets through --safe-*.
//   node Lull/scripts/web-browser-test.cjs [screenshot-dir]      (browser-test.cjs runs it too)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const web = require('./web-build.cjs');

const BASE = '/modern-agents/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const IPHONE = {
  viewport: { width: 393, height: 852 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
// An iPhone 15's insets, portrait: the Dynamic Island's status bar and the home indicator.
const SAFE = ':root { --safe-top: 59px; --safe-bottom: 34px; }';

/** A small static server for `dir` under BASE; stop() closes it and every open connection. */
function serve(dir, port) {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
    p = p.slice(BASE.length) || 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(fs.readFileSync(file));
    server.hits = (server.hits || 0) + 1;
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => server.listen(port || 0, '127.0.0.1', () => resolve({
    server, port: server.address().port,
    stop: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  })));
}

async function run({ browser, check, OUT }) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'lull-site-'));
  const { hash, files } = web.build(site);
  let srv = await serve(site);
  const url = `http://127.0.0.1:${srv.port}${BASE}`;
  const ctx = await browser.newContext(Object.assign({}, IPHONE));
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failed.push(r.url()));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name, p = page) => { if (OUT) await p.screenshot({ path: path.join(OUT, name + '.png') }); };

  try {
    // ---- installs --------------------------------------------------------------------------------------------------
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller && window.Lull && Lull.WebApp && Lull.WebApp.worker === 'registered', null, { timeout: 15000 });
    const installed = await ev(async (h) => {
      const keys = await caches.keys(), c = await caches.open('lull-' + h), reqs = await c.keys();
      const reg = await navigator.serviceWorker.ready;
      return { keys, n: reqs.length, scope: reg.scope, state: reg.active && reg.active.state, urls: reqs.map((r) => r.url) };
    }, hash);
    check('the offline copy installs: one cache, named for the build', installed.keys.length === 1 && installed.keys[0] === 'lull-' + hash && installed.state === 'activated', JSON.stringify(installed.keys));
    check('it holds every file of the build', installed.n === files.length && files.every((f) => installed.urls.includes(url + f)), installed.n + ' of ' + files.length);
    check('its scope is the site\'s folder, not the host\'s root', installed.scope === url, installed.scope);
    check('a browser tab is not the Home Screen app', !(await ev(() => document.body.classList.contains('webapp'))));
    await page.waitForFunction(() => Lull.WebApp.persisted !== null, null, { timeout: 5000 }).catch(() => {});
    check('a browser tab asks that the save be kept too', await ev(() => Lull.WebApp.persisted !== null));

    // ---- the manifest and the icons --------------------------------------------------------------------------------
    const man = await ev(async () => {
      const href = document.querySelector('link[rel="manifest"]').href;
      const m = await (await fetch(href)).json();
      const sizes = [];
      for (const i of m.icons) {
        const img = new Image();
        img.src = new URL(i.src, href).href;
        await img.decode();
        sizes.push([i.src, i.sizes, img.naturalWidth + 'x' + img.naturalHeight, i.purpose || 'any']);
      }
      const touch = new Image();
      touch.src = document.querySelector('link[rel="apple-touch-icon"]').href;
      await touch.decode();
      return { m, sizes, touch: touch.naturalWidth + 'x' + touch.naturalHeight, start: new URL(m.start_url, href).href, scope: new URL(m.scope, href).href };
    });
    check('the manifest parses: Lull, standalone, portrait, the dark ground', man.m.name === 'Lull' && man.m.short_name === 'Lull' && man.m.display === 'standalone' && man.m.orientation === 'portrait' && man.m.background_color === '#0d1017', JSON.stringify(man.m).slice(0, 200));
    check('start and scope are the site\'s folder', man.start === url && man.scope === url, man.start + ' ' + man.scope);
    // The browser's own reading: the app's id (its identity once installed) is the site's folder, not the host's root.
    const cdp = await ctx.newCDPSession(page);
    const app = await cdp.send('Page.getAppManifest');
    const parsed = app.manifest || {};
    check('the browser reads the manifest without errors; the app\'s id is the site\'s folder', app.errors.length === 0 && parsed.id === url && parsed.startUrl === url && parsed.scope === url,
      JSON.stringify({ errors: app.errors, id: parsed.id, start: parsed.startUrl, scope: parsed.scope }));
    await cdp.detach();
    check('every icon loads at its size (192, 512, maskable 512)', man.sizes.every(([, s, real]) => s === real) && man.sizes.some(([, s, , p]) => s === '512x512' && p === 'maskable'), JSON.stringify(man.sizes));
    check('the apple-touch-icon loads, 180 px', man.touch === '180x180', man.touch);

    // ---- offline -------------------------------------------------------------------------------------------------
    await page.waitForSelector('.modal');
    await page.keyboard.press('Enter');
    await ev(() => Lull.app.saveNow());
    await srv.stop();
    await ctx.setOffline(true);
    const hitsBefore = srv.server.hits;
    failed.length = 0;
    await page.reload();
    await page.waitForFunction(() => window.Lull && Lull.app && Lull.app.modes && Lull.app.modes.play && Lull.app.modes.play.game.piece, null, { timeout: 10000 });
    await page.waitForTimeout(400);
    const off = await ev(() => ({ online: navigator.onLine, controlled: !!navigator.serviceWorker.controller, modal: !!document.querySelector('.modal'), font: document.fonts.check('600 12px "Lull Sans"'), css: getComputedStyle(document.getElementById('app')).display }));
    check('offline, the page reloads from the offline copy (server stopped, network off)', !off.online && off.controlled && off.css === 'flex' && srv.server.hits === hitsBefore, JSON.stringify(off));
    check('offline, nothing failed to load', failed.length === 0, failed.join(', '));
    check('offline, the save is still there (no welcome again)', !off.modal);
    const x0 = await ev(() => Lull.app.modes.play.game.piece.x);
    await page.keyboard.press('ArrowLeft');
    const x1 = await ev(() => Lull.app.modes.play.game.piece.x);
    const pieces = await ev(() => Lull.app.modes.play.game.s.pieces);
    await page.keyboard.press('Space');
    const played = await ev((n) => Lull.app.modes.play.game.s.pieces === n + 1, pieces);
    check('offline, the game plays (a move and a drop)', x1 === x0 - 1 && played, x0 + ' -> ' + x1);
    await shot('w10-offline');

    // ---- a new build ---------------------------------------------------------------------------------------------
    // The site changes on the server: one file, and the worker stamped with the new hash (as web-build would).
    fs.appendFileSync(path.join(site, 'css', 'lull.css'), '\n/* build two */\n');
    const hash2 = 'b2' + hash.slice(2);
    fs.writeFileSync(path.join(site, 'sw.js'), fs.readFileSync(path.join(site, 'sw.js'), 'utf8').replace(hash, hash2));
    srv = await serve(site, srv.port);
    await ctx.setOffline(false);
    await ev(() => Lull.WebApp.registration.update());
    await page.waitForSelector('.toast.link:has-text("Update ready")', { timeout: 15000 });
    const waiting = await ev(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, keys: await caches.keys() }; });
    check('a new build installs beside the old one and waits (the old cache still serves)', waiting.waiting && waiting.keys.length === 2, JSON.stringify(waiting));
    check('the page says so quietly: one toast, "Update ready"', (await page.locator('.toast').allTextContents()).filter((t) => /Update ready/.test(t)).length === 1);
    await page.waitForTimeout(300);
    await shot('w20-update-ready');
    await ev(() => { Lull.app.modes.play.game.s.score = 4242; Lull.app.store.touch(); });
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.tap('.toast.link')]);
    await page.waitForFunction(() => window.Lull && Lull.app && Lull.app.store, null, { timeout: 10000 });
    const after = await ev(async () => {
      const css = await (await fetch('css/lull.css')).text();
      return { keys: await caches.keys(), two: css.includes('/* build two */'), controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL };
    });
    check('a tap on it reloads into the new build, and the old cache is gone', after.keys.length === 1 && after.keys[0] === 'lull-' + hash2 && after.two, JSON.stringify(after));
    check('nothing is lost across the update', await ev(() => Lull.app.modes.play.game.s.score === 4242));
    check('no page errors (web app)', errors.length === 0, errors.slice(0, 5).join('\n'));
    await ctx.close();

    // ---- from the Home Screen: full screen inside the safe areas, both themes -------------------------------------
    for (const theme of ['dark', 'light']) {
      const home = await browser.newContext(Object.assign({}, IPHONE, { colorScheme: theme }));
      await home.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));
      const p = await home.newPage();
      const perrors = [];
      p.on('pageerror', (e) => perrors.push(e.message));
      await p.goto(url);
      await p.addStyleTag({ content: SAFE });
      await p.waitForSelector('.modal');
      await p.keyboard.press('Enter');
      await p.evaluate((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
      await p.waitForFunction(() => Lull.WebApp.persisted !== null, null, { timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(400);
      const box = await p.evaluate(() => {
        const r = document.getElementById('app').getBoundingClientRect(), band = getComputedStyle(document.body, '::before');
        return { top: r.top, bottom: innerHeight - r.bottom, left: r.left, right: innerWidth - r.right, webapp: document.body.classList.contains('webapp'),
          ground: getComputedStyle(document.body).backgroundColor, band: band.content !== 'none' ? band.backgroundColor + ' ' + band.height : 'none',
          color: document.querySelector('meta[name="theme-color"]').content, persisted: Lull.WebApp.persisted };
      });
      check(`Home Screen (${theme}): full screen, clear of the status bar and the home indicator`, box.webapp && box.top === 59 && box.bottom === 34 && box.left === 0 && box.right === 0, JSON.stringify(box));
      check(`Home Screen (${theme}): the theme's ground around it; the browser colour follows the theme`, box.ground === (theme === 'dark' ? 'rgb(13, 16, 23)' : 'rgb(240, 242, 246)') && box.color === (theme === 'dark' ? '#0d1017' : '#f0f2f6'), JSON.stringify(box));
      check(`Home Screen (${theme}): the status bar's white words ${theme === 'light' ? 'on a dark band' : 'on the dark ground'}`, theme === 'light' ? /^rgb\(57, 66, 85\) 59px$/.test(box.band) : box.band === 'none', box.band);
      check(`Home Screen (${theme}): asks that the save be kept`, box.persisted !== null, String(box.persisted));
      check(`Home Screen (${theme}): no page errors`, perrors.length === 0, perrors.join('\n'));
      if (OUT) {
        // The phone's own status bar, drawn over the picture to judge it by (white, as black-translucent makes it).
        await p.evaluate(() => {
          const bar = document.createElement('div');
          bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:59px;display:flex;align-items:center;justify-content:space-between;padding:6px 34px 0 50px;color:#fff;font:600 17px -apple-system,Inter,sans-serif;z-index:9999;pointer-events:none';
          bar.innerHTML = '<span>9:41</span><span style="display:flex;gap:6px;align-items:center"><i style="width:18px;height:11px;border-radius:2px;background:#fff;display:block"></i><i style="width:25px;height:12px;border:1.5px solid #fff;border-radius:4px;display:block"></i></span>';
          const pill = document.createElement('div');
          pill.style.cssText = 'position:fixed;left:50%;top:11px;width:125px;height:37px;margin-left:-62px;border-radius:20px;background:#000;z-index:9999;pointer-events:none';
          const ind = document.createElement('div');
          ind.style.cssText = 'position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:' + (document.documentElement.dataset.theme === 'light' ? '#111' : '#fff') + ';z-index:9999;pointer-events:none';
          document.body.append(bar, pill, ind);
        });
        await shot('w30-home-screen-' + theme, p);
      }
      await home.close();
    }
  } finally {
    await srv.stop().catch(() => {});
    fs.rmSync(site, { recursive: true, force: true });
  }
}

module.exports = run;

if (require.main === module) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) {
      console.error('Playwright is not installed; skipping the web app browser test.');
      process.exit(0);
    }
  }
  let failures = 0;
  const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra && !ok ? ' — ' + extra : '')); if (!ok) failures++; };
  (async () => {
    const opts = {};
    if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
    const browser = await chromium.launch(opts);
    console.log('web app');
    await run({ browser, check, OUT: process.argv[2] || null });
    await browser.close();
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
