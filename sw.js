/* Offline cache for the app shell (only active when served over http(s); file:// needs no service worker). */
const VERSION = 'books-offline-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './css/app.css', './css/reader.css',
  './js/util.js', './js/icons.js', './js/zip.js', './js/db.js', './js/epub.js', './js/ui.js', './js/library.js', './js/reader.js', './js/app.js', './js/samples.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => hit)));
});
