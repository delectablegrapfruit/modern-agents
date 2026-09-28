// Lull — the Home Screen web app: the offline copy (sw.js) and its updates, lasting storage, and the status bar's colour.
// None of it runs in the macOS app (the native bridge is there) or from a file: only a page served over http(s).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const doc = root.document, nav = root.navigator || {};

  const served = !!(root.location && /^https?:$/.test(root.location.protocol));
  const native = !!(L.native && L.native.available);
  // Opened from the Home Screen (or installed): no browser around it, so the page runs under the phone's status bar.
  const standalone = nav.standalone === true || !!(root.matchMedia && (root.matchMedia('(display-mode: standalone)').matches || root.matchMedia('(display-mode: fullscreen)').matches));

  const web = (L.WebApp = { served, native, standalone, worker: 'off', persisted: null, updateReady: false });

  if (doc && doc.body && standalone && !native) doc.body.classList.add('webapp');

  // The browser's own bar follows the theme picked in Settings, not only the system's.
  const COLORS = { dark: '#0d1017', light: '#f0f2f6' };
  function syncThemeColor() {
    const theme = doc.documentElement.dataset.theme;
    if (!COLORS[theme]) return;
    for (const m of doc.querySelectorAll('meta[name="theme-color"]')) { m.removeAttribute('media'); m.setAttribute('content', COLORS[theme]); }
  }
  if (doc && !native && root.MutationObserver) {
    new MutationObserver(syncThemeColor).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    syncThemeColor();
  }

  if (!served || native) return;

  // The save lives in localStorage: ask that it be kept, most of all in a tab, which the browser may clear. Chromium and
  // Safari decide quietly; Firefox asks the player in a prompt, so a Firefox tab does not ask (its Home Screen app does).
  const firefox = /\bFirefox\//.test(nav.userAgent || '');
  if ((standalone || !firefox) && nav.storage && nav.storage.persist) {
    nav.storage.persisted().then((p) => p || nav.storage.persist()).then((p) => { web.persisted = !!p; }, () => { web.persisted = false; });
  }

  if (!nav.serviceWorker) return;
  let reloading = false;
  nav.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) return;
    root.location.reload();
  });

  /** A new build is installed and waiting: a quiet toast offers it now; otherwise it takes over at the next launch. */
  function ready(reg) {
    if (web.updateReady) return;
    web.updateReady = true;
    const say = () => {
      const t = L.UI && L.UI.toast && L.UI.toast('Update ready', null, 12000, 'retry', { onClick: () => web.apply(reg), label: 'Update ready. Reload' });
      if (t) t.classList.add('update');
    };
    if (L.app && L.app.store) say(); else root.addEventListener('load', () => setTimeout(say, 600), { once: true });
  }

  /** Saves, lets the waiting build take over, and reloads into it. */
  web.apply = (reg) => {
    if (L.app && L.app.saveNow) L.app.saveNow();
    const w = reg && reg.waiting;
    if (!w) { root.location.reload(); return; }
    reloading = true;
    w.postMessage({ type: 'skip-waiting' });
  };

  function watch(reg) {
    const track = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && nav.serviceWorker.controller) ready(reg); });
    };
    if (reg.waiting && nav.serviceWorker.controller) ready(reg);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    // A Home Screen app is seldom opened afresh: coming back to it looks for a new build too (at most every half hour).
    let checked = Date.now();
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden || Date.now() - checked < 30 * 60e3) return;
      checked = Date.now();
      reg.update().catch(() => {});
    });
  }

  function register() {
    nav.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
      web.worker = 'registered';
      web.registration = reg;
      watch(reg);
    }, (e) => { web.worker = 'failed'; web.error = String(e && e.message || e); });
  }
  if (doc.readyState === 'complete') register(); else root.addEventListener('load', register, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
