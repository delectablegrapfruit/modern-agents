/* Shared helpers for the reader web core — the subset of the web app's util.js that epub.js and reader-core.js use.
   Classic script (no modules) so the page loads the same way from a custom scheme, a bundle and a test server. */
(function (global) {
  'use strict';
  const U = {};

  U.uuid = function () {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };

  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  /* Leading + trailing throttle: the app sees the first event immediately and always the final state. */
  U.throttle = function (fn, ms) {
    let last = 0, t;
    return function (...a) {
      const now = Date.now(), rem = ms - (now - last);
      if (rem <= 0) { last = now; fn.apply(this, a); }
      else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn.apply(this, a); }, rem); }
    };
  };
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  // Path helpers for zip-internal hrefs
  U.dirname = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  U.basename = p => p.slice(p.lastIndexOf('/') + 1);
  U.isAbsoluteURL = s => /^[a-z][a-z0-9+.-]*:/i.test(s || '');
  U.resolvePath = function (baseDir, rel) {
    if (!rel) return baseDir;
    if (U.isAbsoluteURL(rel)) return rel;
    let clean = rel.split('#')[0].split('?')[0];
    try { clean = decodeURIComponent(clean); } catch (e) { /* keep raw */ }
    const parts = (clean.startsWith('/') ? [] : (baseDir ? baseDir.split('/') : [])).concat(clean.split('/'));
    const out = [];
    for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
    return out.join('/');
  };
  U.fragmentOf = href => { const i = (href || '').indexOf('#'); return i < 0 ? '' : href.slice(i + 1); };

  U.wordCount = text => (String(text || '').match(/\S+/g) || []).length;
  U.hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  global.U = U;
})(window);
