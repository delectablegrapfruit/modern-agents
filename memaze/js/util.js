/* Memaze — shared helpers: seeded randomness, maths, storage, small DOM helpers.
 * Classic scripts sharing window.MZ, so the game also runs straight from file://. */
(function () {
  'use strict';
  const MZ = (window.MZ = window.MZ || {});

  // ---------- hashing & seeded randomness ----------
  function hashStr(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function hashInts() {
    let h = 0x9e3779b9;
    for (let i = 0; i < arguments.length; i++) {
      h = Math.imul(h ^ (arguments[i] | 0), 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
    }
    return h >>> 0;
  }
  const h01 = function () { return hashInts.apply(null, arguments) / 4294967296; };

  function rng(seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    r.weighted = (pairs) => { // [[item, weight], ...]
      let total = 0;
      for (const p of pairs) total += p[1];
      let x = r() * total;
      for (const p of pairs) { if ((x -= p[1]) < 0) return p[0]; }
      return pairs[pairs.length - 1][0];
    };
    return r;
  }

  // ---------- maths ----------
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // Squared distance from point to segment, plus the closest point's t.
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - px, cy = ay + dy * t - py;
    return cx * cx + cy * cy;
  }
  function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by);
    const d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  function segSegDist2(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(segDist2(ax, ay, cx, cy, dx, dy), segDist2(bx, by, cx, cy, dx, dy),
      segDist2(cx, cy, ax, ay, bx, by), segDist2(dx, dy, ax, ay, bx, by));
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) return '--:--';
    sec = Math.max(0, sec);
    if (sec < 10) return sec.toFixed(1);
    const s = Math.ceil(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function fmtClock(sec) { // 1:05.32 for results
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  // ---------- storage (localStorage can throw or be absent) ----------
  const store = {
    load(key, def) {
      try { const v = localStorage.getItem('memaze.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    save(key, val) {
      try { localStorage.setItem('memaze.' + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem('memaze.' + key); } catch (e) { /* ignore */ } },
  };

  // Fill missing keys of `saved` from `defs`, recursively; keeps saved values of matching type.
  function merge(defs, saved) {
    if (defs === null) return saved === undefined ? null : saved; // a null default takes any saved value
    if (saved == null || typeof saved !== typeof defs || Array.isArray(defs) !== Array.isArray(saved)) return clone(defs);
    if (typeof defs !== 'object' || Array.isArray(defs) || defs === null) return saved;
    const out = {};
    for (const k in defs) out[k] = k in saved ? merge(defs[k], saved[k]) : clone(defs[k]);
    for (const k in saved) if (!(k in defs)) out[k] = saved[k];
    return out;
  }
  const clone = (v) => (v == null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

  // ---------- events ----------
  function emitter(obj) {
    const ls = {};
    obj.on = (ev, fn) => { (ls[ev] = ls[ev] || []).push(fn); return () => obj.off(ev, fn); };
    obj.off = (ev, fn) => { if (ls[ev]) ls[ev] = ls[ev].filter((f) => f !== fn); };
    obj.emit = (ev, a, b) => { (ls[ev] || []).slice().forEach((f) => f(a, b)); };
    return obj;
  }

  // ---------- DOM ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }

  function toast(msg, ms) {
    const host = $('#toasts');
    if (!host) return;
    const el = h('div', { class: 'toast' }, msg);
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, ms || 2600);
  }

  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  Object.assign(MZ, {
    hashStr, hashInts, h01, rng, clamp, lerp, smooth, easeOutBack, easeInOut,
    segDist2, segsCross, segSegDist2, fmtTime, fmtClock, store, merge, clone, emitter, $, $$, h, toast, download, today,
  });
})();
