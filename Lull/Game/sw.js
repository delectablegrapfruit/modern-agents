// Lull — the offline copy, for the Home Screen web app and any browser that serves the game over http(s).
//
// Every file the game needs is kept in one cache named for the build, and served from it first: once the page has
// loaded, it runs with no network at all. A new build (a new hash in BUILD, stamped by scripts/web-build.cjs when the
// site is deployed) installs beside the old one and waits: it takes over at the next launch, or at once when the page
// asks (its quiet "Update ready" toast). The old caches go when it does.
//
// FILES is every file the page loads (the board options' files go in place of their part: lines, one part each).
// scripts/test.cjs checks it against the files in Game/ and every one that
// index.html, the manifest, the scripts and the stylesheet name, so a new file cannot be left out of the offline copy.
// Unstamped (BUILD 'dev', a local server) it asks the network first and keeps what it gets, so edits show on reload.
'use strict';

const BUILD = 'dev';
const CACHE = 'lull-' + BUILD;
const FILES = [
  "index.html",
  "manifest.webmanifest",
  "css/lull.css",
  "js/util.js",
  "js/icons.js",
  "js/pieces.js",
  "js/board.js",
  "js/recipe.js",
  "js/engine.js",
  "js/items.js",
  "js/library.js",
  "js/puzzlegen.js",
  "js/factory.js",
  "js/store.js",
  "js/achievements.js",
  "js/fxphysics.js",
  "js/render.js",
  "js/factoryview.js",
  "js/voice-data.js",
  "js/audio.js",
  "js/input.js",
  "js/touch.js",
  "js/hints.js",
  "js/ui.js",
  "js/modes.js",
  "js/retiredview.js",
  "js/collapse.js",
  "css/shapes.css",
  "js/polytable.js",
  "js/minsize.js",
  "js/shapes.js",
  "js/shapepicker.js",
  "js/mirror.js",
  "js/mirrorview.js",
  // part:jelly
  // part:protect
  // part:battle
  "js/app.js",
  "js/webapp.js",
  "icons/icon-32.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

const scope = () => self.registration.scope;
const url = (f) => new URL(f, scope()).href;

self.addEventListener('install', (e) => {
  // 'reload': past the browser's own HTTP cache, so a new build never stores an old file.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(url(f), { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lull-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page's "Update ready" toast: the waiting build takes over now, and the page reloads into it.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Any page in scope (the start URL "./", index.html, with or without a query) is the game's one page.
  const key = req.mode === 'navigate' ? url('index.html') : req;
  e.respondWith(BUILD === 'dev' ? networkFirst(req, key) : cacheFirst(req, key));
});

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key, { ignoreSearch: true });
  return hit || fetch(req);
}

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok && res.type === 'basic') cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
