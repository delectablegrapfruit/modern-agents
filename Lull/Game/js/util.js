// Lull — shared helpers: seeded randomness, seed codes, number formatting, a tiny event bus, the native bridge.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // ---- hashing and seeded randomness -------------------------------------------------------------------------------

  /** 32-bit hash of a string (FNV-1a with a murmur finaliser). */
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** sfc32: small, fast, good enough for games; the same seed gives the same stream on every machine. */
  class RNG {
    constructor(seed) {
      if (typeof seed === 'string') seed = hash32(seed);
      seed = seed >>> 0;
      // splitmix32 to spread a single word over the four state words
      const sm = () => {
        seed = (seed + 0x9e3779b9) >>> 0;
        let z = seed;
        z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
        z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
        return (z ^ (z >>> 15)) >>> 0;
      };
      this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
      for (let i = 0; i < 12; i++) this.u32();
    }
    u32() {
      let { a, b, c, d } = this;
      const t = (((a + b) >>> 0) + d) >>> 0;
      d = (d + 1) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) >>> 0;
      this.a = a; this.b = b; this.c = c; this.d = d;
      return t;
    }
    next() { return this.u32() / 4294967296; }
    int(n) { return Math.floor(this.next() * n); }
    range(lo, hi) { return lo + this.int(hi - lo + 1); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[this.int(arr.length)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
    /** Picks from [{w, ...}] (or items with weightFn) proportionally to weight. */
    weighted(items, weightFn) {
      const wf = weightFn || ((it) => it.w);
      let total = 0;
      for (const it of items) total += Math.max(0, wf(it));
      if (total <= 0) return items[this.int(items.length)];
      let r = this.next() * total;
      for (const it of items) {
        r -= Math.max(0, wf(it));
        if (r < 0) return it;
      }
      return items[items.length - 1];
    }
    state() { return [this.a, this.b, this.c, this.d]; }
    static from(state) {
      const r = new RNG(0);
      [r.a, r.b, r.c, r.d] = state;
      return r;
    }
  }

  // ---- seed codes -----------------------------------------------------------------------------------------------------

  const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I: easy to read aloud and type

  /** Seven symbols, base 32, most significant first (a 32-bit number's top symbol is one of 2–5). */
  function codeFromInt(n) {
    n = n >>> 0;
    let s = '';
    for (let i = 0; i < 7; i++) { s = CODE_ALPHABET[n % 32] + s; n = Math.floor(n / 32); }
    return s;
  }

  /** Any seven-symbol code reads as a number (codes made by codeFromInt read back exactly). */
  function intFromCode(code) {
    code = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (code.length !== 7) return null;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const v = CODE_ALPHABET.indexOf(code[i]);
      if (v < 0) return null;
      n = (n * 32 + v) % 4294967296;
    }
    return n >>> 0;
  }

  // ---- formatting ---------------------------------------------------------------------------------------------------

  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  /** Short number: 999, 1.23K, 45.6M … */
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    if (n < 1000) return (neg ? '-' : '') + (n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString());
    let i = 0;
    while (n >= 1000 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
    const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
    return (neg ? '-' : '') + n.toFixed(digits) + SUFFIXES[i];
  }

  /** Whole number with thousands separators. */
  function fmtInt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + (m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }

  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function pct(x, digits) { return (x * 100).toFixed(digits == null ? 0 : digits) + '%'; }

  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---- events -------------------------------------------------------------------------------------------------------

  class Emitter {
    constructor() { this._h = {}; }
    on(name, fn) { (this._h[name] = this._h[name] || []).push(fn); return () => this.off(name, fn); }
    off(name, fn) { const a = this._h[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    emit(name, ...args) { const a = this._h[name]; if (a) for (const fn of a.slice()) fn(...args); }
  }

  // ---- native bridge (the macOS floating panel), absent in a plain browser ------------------------------------------

  const native = {
    get available() {
      return !!(root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.lull);
    },
    info: root.LULL_NATIVE || null,
    post(type, payload) {
      if (!this.available) return false;
      try {
        root.webkit.messageHandlers.lull.postMessage(Object.assign({ type }, payload || {}));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  function decodeBase64Utf8(b64) {
    const bin = root.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  Object.assign(L, {
    hash32, RNG, codeFromInt, intFromCode, CODE_ALPHABET,
    fmt, fmtInt, fmtDuration, fmtClock, pct, dateKey, clamp, lerp,
    Emitter, native, decodeBase64Utf8,
    bus: new Emitter(),
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
