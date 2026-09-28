// The Home Screen web app, tested in Node (run from scripts/test.cjs): the offline copy lists every file the page loads,
// sw.js parses and does what it says, the deployed build is stamped, the manifest and icons are whole, and the page
// only turns the offline copy on where it belongs (served over http(s), not in the macOS app, not from a file).
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const web = require('./web-build.cjs');

const GAME = web.GAME;
const read = (f) => fs.readFileSync(path.join(GAME, f), 'utf8');

/** A PNG's width and height, from its header. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.toString('latin1', 1, 4), 'PNG', path.basename(file) + ' is a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** The top-left pixel's alpha (255 without an alpha channel). The first pixel of the first row is stored as it is,
 *  whatever the row's filter. */
function cornerAlpha(file) {
  const b = fs.readFileSync(file), type = b[25];
  const chunks = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o), kind = b.toString('latin1', o + 4, o + 8);
    if (kind === 'IDAT') chunks.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = require('zlib').inflateSync(Buffer.concat(chunks));
  return type === 6 ? raw[4] : type === 2 ? 255 : -1;
}

/** sw.js run in a pretend worker: its listeners, the caches it opens and what it adds, the pages it would fetch. */
function fakeWorker(src, scope = 'https://example.github.io/lull/') {
  const on = {}, stores = {}, fetched = [];
  const cacheFor = (name) => (stores[name] = stores[name] || {
    added: [], map: new Map(),
    addAll(reqs) { for (const r of reqs) { this.added.push(r.url); this.map.set(r.url, 'cached ' + r.url); } return Promise.resolve(); },
    put(k, v) { this.map.set(typeof k === 'string' ? k : k.url, v); return Promise.resolve(); },
    match(k) { const u = (typeof k === 'string' ? k : k.url).split('?')[0]; return Promise.resolve(this.map.get(u)); },
  });
  const self = {
    addEventListener: (t, fn) => { on[t] = fn; },
    registration: { scope }, location: { origin: new URL(scope).origin },
    clients: { claim: () => Promise.resolve() }, skipped: false, skipWaiting() { this.skipped = true; },
  };
  const ctx = {
    self, URL, console,
    Request: class { constructor(url, init) { this.url = url; this.init = init; } },
    caches: {
      open: (n) => Promise.resolve(cacheFor(n)),
      keys: () => Promise.resolve(Object.keys(stores)),
      delete: (n) => { delete stores[n]; return Promise.resolve(true); },
    },
    fetch: (req) => { fetched.push(req.url || req); return Promise.resolve({ ok: true, type: 'basic', clone() { return this; }, net: true }); },
  };
  vm.runInNewContext(src, ctx, { filename: 'sw.js' });
  const wait = (type, extra) => { let p = Promise.resolve(); on[type](Object.assign({ waitUntil: (x) => { p = x; } }, extra)); return p; };
  const respond = (url, mode) => { let p; on.fetch({ request: { url, method: 'GET', mode: mode || 'no-cors' }, respondWith: (x) => { p = x; } }); return p; };
  return { on, stores, fetched, self, wait, respond, cacheFor };
}

/** js/webapp.js run in a pretend page: whether it registers the worker, asks for lasting storage, marks the body. */
function fakePage({ href, native = false, standalone = false, userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }) {
  const calls = { register: [], persist: 0 }, classes = new Set(), listeners = {};
  const doc = {
    readyState: 'complete', hidden: false,
    body: { classList: { add: (c) => classes.add(c) } },
    documentElement: { dataset: { theme: 'dark' } },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const nav = {
    standalone, userAgent,
    storage: { persisted: () => Promise.resolve(false), persist: () => { calls.persist++; return Promise.resolve(true); } },
    serviceWorker: {
      controller: null,
      addEventListener: () => {},
      register: (url, opts) => { calls.register.push([url, opts]); return new Promise(() => {}); },
    },
  };
  const win = {
    location: new URL(href), navigator: nav, document: doc,
    matchMedia: () => ({ matches: false }),
    addEventListener: (t, fn) => { listeners[t] = fn; },
    Lull: { native: { available: native } },
  };
  win.window = win;
  vm.runInNewContext(read('js/webapp.js'), { window: win, globalThis: win });
  return { calls, classes, web: win.Lull.WebApp };
}

/**
 * Runs the web app's tests through test.cjs's `test`. Some wait on promises (the worker's caches): those settle first
 * and then report through `test` in order; the returned promise resolves once all have.
 */
module.exports = async function webTests(syncTest) {
  console.log('web app');
  const queue = [];
  const test = (name, fn) => queue.push([name, fn]);

  test('the offline copy lists every file the page loads, and nothing that is not there', () => {
    const list = web.precacheList();
    assert.strictEqual(new Set(list).size, list.length, 'no file twice');
    for (const f of list) assert(fs.existsSync(path.join(GAME, f)), 'sw.js lists ' + f + ', which is not in Game/');
    const unlisted = web.gameFiles().filter((f) => !list.includes(f));
    assert.deepStrictEqual(unlisted, [], 'files in Game/ missing from FILES in sw.js (add them, or the web app breaks offline)');
    const refs = web.referencedFiles();
    for (const f of ['index.html', 'css/lull.css', 'js/app.js', 'js/webapp.js', 'manifest.webmanifest', 'icons/apple-touch-icon.png']) {
      assert(list.includes(f), f + ' precached');
    }
    assert(refs.includes('js/util.js') && refs.includes('icons/icon-maskable-512.png'), 'the scan finds scripts and icons');
    const missing = refs.filter((f) => !list.includes(f));
    assert.deepStrictEqual(missing, [], 'files the page names but sw.js does not precache');
    for (const f of refs) assert(fs.existsSync(path.join(GAME, f)), 'the page names ' + f + ', which is not there');
  });

  test('every script the page loads is in index.html, in the order FILES keeps them', () => {
    const html = read('index.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const list = web.precacheList().filter((f) => f.endsWith('.js'));
    assert.deepStrictEqual(list, scripts);
  });

  test('sw.js parses, precaches FILES into a cache named for its build, and serves from it', async () => {
    const src = read('sw.js');
    new vm.Script(src, { filename: 'sw.js' });
    assert(/const BUILD = 'dev';/.test(src), 'the committed worker is unstamped');
    const w = fakeWorker(web.stampedWorker('abc123def456'));
    for (const t of ['install', 'activate', 'fetch', 'message']) assert.strictEqual(typeof w.on[t], 'function', t);
    await w.wait('install');
    const cache = w.stores['lull-abc123def456'];
    assert(cache, 'the cache is named for the build');
    assert.deepStrictEqual(cache.added, web.precacheList().map((f) => 'https://example.github.io/lull/' + f));
    // An old build's cache goes on activate; other caches on the origin are not Lull's to delete.
    w.cacheFor('lull-0123456789ab'); w.cacheFor('someone-else');
    await w.wait('activate');
    assert.deepStrictEqual(Object.keys(w.stores).sort(), ['lull-abc123def456', 'someone-else']);
    // Cache first: the start URL (with a query too) is index.html, a script is itself; nothing touches the network.
    assert.strictEqual(await w.respond('https://example.github.io/lull/?from=home', 'navigate'), 'cached https://example.github.io/lull/index.html');
    assert.strictEqual(await w.respond('https://example.github.io/lull/js/app.js'), 'cached https://example.github.io/lull/js/app.js');
    assert.deepStrictEqual(w.fetched, []);
    assert.strictEqual(w.respond('https://fonts.example.com/x.css'), undefined, 'other origins are left alone');
    w.on.message({ data: { type: 'skip-waiting' } });
    assert(w.self.skipped, 'the page can ask the waiting build to take over');
  });

  test('unstamped (a local server), the worker asks the network first and keeps what it gets', async () => {
    const w = fakeWorker(read('sw.js'), 'http://localhost:8000/');
    const res = await w.respond('http://localhost:8000/js/app.js');
    assert(res.net && w.fetched.length === 1);
    assert(w.stores['lull-dev'].map.has('http://localhost:8000/js/app.js'));
  });

  test('the deployed build: every listed file copied, sw.js stamped with a hash of their contents', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lull-web-'));
    try {
      const { hash, files } = web.build(out);
      assert(/^[0-9a-f]{12}$/.test(hash), hash);
      assert.strictEqual(hash, web.buildHash(), 'the same files make the same hash');
      for (const f of files) assert(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(GAME, f))), f);
      const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
      new vm.Script(sw, { filename: 'sw.js' });
      assert(sw.includes(`const BUILD = '${hash}';`));
      assert.strictEqual(sw.replace(hash, 'dev'), read('sw.js'), 'nothing else changes');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  });

  test('the manifest: name, start, scope, display, colours and icons, all relative (the site lives under /modern-agents/)', () => {
    const m = JSON.parse(read('manifest.webmanifest'));
    assert.strictEqual(m.name, 'Lull');
    assert.strictEqual(m.short_name, 'Lull');
    assert.strictEqual(m.start_url, './');
    assert.strictEqual(m.scope, './');
    // The app's identity: id resolves against the start URL's origin (not the manifest's folder), and with no id it is
    // the start URL. It must be the site's folder: the host's root is shared by every Pages site of the account.
    const at = 'https://delectablegrapfruit.github.io/modern-agents/manifest.webmanifest';
    const start = new URL(m.start_url, at);
    const id = 'id' in m ? new URL(m.id, start.origin) : start;
    assert.strictEqual(start.href, 'https://delectablegrapfruit.github.io/modern-agents/');
    assert.strictEqual(id.href, 'https://delectablegrapfruit.github.io/modern-agents/', 'the id is the site folder');
    assert(['standalone', 'fullscreen'].includes(m.display));
    assert.strictEqual(m.orientation, 'portrait');
    assert(/^#[0-9a-f]{6}$/i.test(m.background_color) && /^#[0-9a-f]{6}$/i.test(m.theme_color));
    const css = read('css/lull.css');
    const dark = css.match(/:root, :root\[data-theme="dark"\] \{\s*--bg: (\d+), (\d+), (\d+);/);
    assert(dark, 'the dark theme ground');
    const hex = '#' + dark.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    assert.strictEqual(m.background_color.toLowerCase(), hex, 'the launch colour is the dark theme');
    const need = { 'any 192': 0, 'any 512': 0, 'maskable 512': 0 };
    for (const i of m.icons) {
      assert(!i.src.startsWith('/') && !/^[a-z]+:/i.test(i.src), i.src + ' is relative');
      const [w, h] = pngSize(path.join(GAME, i.src));
      assert.strictEqual(i.sizes, w + 'x' + h, i.src + ' is the size it says');
      const k = (i.purpose || 'any') + ' ' + w;
      if (k in need) need[k]++;
    }
    assert.deepStrictEqual(Object.values(need), [1, 1, 1], JSON.stringify(need));
  });

  test('index.html: manifest, icons and the phone tags; nothing starts at the site root', () => {
    const html = read('index.html');
    const has = (re, what) => assert(re.test(html), what);
    has(/<link rel="manifest" href="manifest\.webmanifest">/, 'manifest');
    has(/<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/, 'apple-touch-icon');
    has(/<meta name="apple-mobile-web-app-capable" content="yes">/, 'apple-mobile-web-app-capable');
    has(/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/, 'status bar');
    has(/<meta name="apple-mobile-web-app-title" content="Lull">/, 'title');
    has(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)">/, 'theme-color dark');
    has(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)">/, 'theme-color light');
    const vp = html.match(/<meta name="viewport" content="([^"]+)">/)[1];
    for (const part of ['width=device-width', 'initial-scale=1', 'maximum-scale=1', 'user-scalable=no', 'viewport-fit=cover']) assert(vp.includes(part), part);
    for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) assert(!m[1].startsWith('/'), m[1] + ' is relative');
    assert.deepStrictEqual(pngSize(path.join(GAME, 'icons/apple-touch-icon.png')), [180, 180]);
    assert.deepStrictEqual(pngSize(path.join(GAME, 'icons/icon-32.png')), [32, 32]);
    // The apple-touch-icon fills its square (iOS rounds it; transparent corners would show black).
    assert.strictEqual(cornerAlpha(path.join(GAME, 'icons/apple-touch-icon.png')), 255, 'an opaque corner');
    assert.strictEqual(cornerAlpha(path.join(GAME, 'icons/icon-maskable-512.png')), 255, 'the maskable one too');
  });

  test('the offline copy only where it belongs: served over http(s), never in the macOS app or from a file', () => {
    const served = fakePage({ href: 'https://example.github.io/modern-agents/' });
    assert.strictEqual(JSON.stringify(served.calls.register), JSON.stringify([['sw.js', { scope: './' }]]));
    assert.strictEqual(served.web.served, true);
    assert(!served.classes.has('webapp'));
    const file = fakePage({ href: 'file:///Users/me/Lull/Game/index.html' });
    assert.strictEqual(file.calls.register.length, 0);
    const app = fakePage({ href: 'https://example.github.io/modern-agents/', native: true, standalone: true });
    assert.strictEqual(app.calls.register.length, 0, 'the macOS app has its own save file and no need of one');
    assert(!app.classes.has('webapp'));
    const home = fakePage({ href: 'https://example.github.io/modern-agents/', standalone: true });
    assert(home.classes.has('webapp'), 'from the Home Screen the page runs full screen');
    assert.strictEqual(home.calls.register.length, 1);
  });

  test('the save asks to be kept: from the Home Screen and in a tab, not in a Firefox tab, the macOS app or a file', async () => {
    const at = 'https://example.github.io/modern-agents/';
    const fox = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
    const pages = {
      home: fakePage({ href: at, standalone: true }),
      tab: fakePage({ href: at }),
      foxTab: fakePage({ href: at, userAgent: fox }),
      foxHome: fakePage({ href: at, standalone: true, userAgent: fox }),
      mac: fakePage({ href: at, native: true, standalone: true }),
      file: fakePage({ href: 'file:///Users/me/Lull/Game/index.html' }),
    };
    await new Promise((r) => setTimeout(r, 0));
    const asked = Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, p.calls.persist]));
    assert.deepStrictEqual(asked, { home: 1, tab: 1, foxTab: 0, foxHome: 1, mac: 0, file: 0 }, 'Firefox asks the player in a prompt; the macOS app keeps its own file');
    assert.strictEqual(pages.home.web.persisted, true);
    assert.strictEqual(pages.tab.web.persisted, true);
    assert.strictEqual(pages.foxTab.web.persisted, null);
  });

  test('CI deploys the site to GitHub Pages from branch lull, after the game job, with the Pages permissions', () => {
    const yml = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'lull.yml'), 'utf8');
    const job = (yml.match(/\n  pages:\n([\s\S]*?)(?=\n  [a-z]+:\n|$)/) || [])[1];
    assert(job, 'a pages job');
    for (const line of ['needs: game', "if: github.event_name == 'push' && github.ref == 'refs/heads/lull'", 'pages: write', 'id-token: write', 'name: github-pages',
      'run: node Lull/scripts/web-build.cjs "$RUNNER_TEMP/site"', 'uses: actions/configure-pages@', 'uses: actions/upload-pages-artifact@', 'uses: actions/deploy-pages@', 'path: ${{ runner.temp }}/site']) {
      assert(job.includes(line), line);
    }
    // A newer push cancels an older run everywhere but on lull, where cancelling would cut a deployment short.
    const top = (yml.match(/\nconcurrency:\n([\s\S]*?)\n\n/) || [])[1];
    assert(top && top.includes("cancel-in-progress: ${{ github.ref != 'refs/heads/lull' }}"), 'runs on lull are not cancelled');
    assert(/concurrency:\n\s+group: lull-pages\n\s+cancel-in-progress: false/.test(job), 'deployments wait their turn');
  });

  test('no emoji in the web app files', () => {
    const files = ['sw.js', 'manifest.webmanifest'].map((f) => path.join(GAME, f))
      .concat(['web-build.cjs', 'web-icons.cjs', 'web-test.cjs'].map((f) => path.join(__dirname, f)));
    const found = [];
    for (const f of files) for (const ch of fs.readFileSync(f, 'utf8')) if (/\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(ch)) found.push(path.basename(f) + ' ' + ch);
    assert.deepStrictEqual(found, []);
  });

  for (const [name, fn] of queue) {
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    syncTest(name, () => { if (err) throw err; });
  }
};
