// js/boot/util.js — owner: W1-K (lead). SR.util: small pure helpers shared by every layer:
// clamp, lerp, easing, fmt, hash, crc32, deepFill, clone, equal, merge (ARCHITECTURE §19;
// docs/CONTRACT.md §5). Pure: no DOM or browser API (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;
  var toStr = Object.prototype.toString;

  /** @returns {boolean} v is a plain object (not an array or null), from any realm. */
  function isObject(v) { return v !== null && typeof v === 'object' && toStr.call(v) === '[object Object]'; }

  /** @returns {number} v limited to [lo, hi]. */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  /** @returns {number} a + (b - a) · t. */
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** @returns {number} the t for which lerp(a, b, t) = v (0 when a = b). */
  function invLerp(a, b, v) { return a === b ? 0 : (v - a) / (b - a); }

  /**
   * CSS-style cubic Bézier easing (control points (x1, y1), (x2, y2); ends at (0,0) and (1,1)).
   * @returns {function(number): number}
   */
  function cubicBezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function sx(t) { return ((ax * t + bx) * t + cx) * t; }
    function sy(t) { return ((ay * t + by) * t + cy) * t; }
    function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return sy(t);
        var d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      var lo = 0, hi = 1;
      t = x;
      for (var j = 0; j < 40; j++) {
        var v = sx(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }

  /**
   * Replaces {name} in str with vars.name; unknown or null vars stay as {name}.
   * @returns {string}
   */
  function fmt(str, vars) {
    str = String(str);
    if (!vars) return str;
    return str.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) {
      return hasOwn.call(vars, k) && vars[k] != null ? String(vars[k]) : m;
    });
  }

  /**
   * Deterministic 32-bit hash of its arguments (numbers, strings, booleans), e.g. hash(seed, day).
   * FNV-1a over the UTF-16 code units of String(arg), a separator per argument, then fmix32.
   * @returns {number} uint32
   */
  function hash() {
    var h = 0x811c9dc5;
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i]);
      for (var j = 0; j < s.length; j++) {
        var c = s.charCodeAt(j);
        h = Math.imul(h ^ (c & 0xff), 0x01000193);
        h = Math.imul(h ^ (c >>> 8), 0x01000193);
      }
      h = Math.imul(h ^ 0x1f, 0x01000193);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }
  /** @returns {number[]} the UTF-8 bytes of str. */
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  /**
   * CRC-32 (IEEE, as zip / PNG) of the UTF-8 bytes of str; crc32('123456789') = 0xCBF43926.
   * @returns {number} uint32
   */
  function crc32(str) {
    var t = crcTable(), b = utf8(String(str)), c = 0xffffffff;
    for (var i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** @returns {*} a deep copy of a JSON-like value (plain objects, arrays, primitives). */
  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (isObject(v)) {
      var o = {};
      for (var k in v) if (hasOwn.call(v, k)) o[k] = clone(v[k]);
      return o;
    }
    return v;
  }

  /** @returns {boolean} deep structural equality of JSON-like values. */
  function equal(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false;
      return true;
    }
    if (isObject(a)) {
      if (!isObject(b)) return false;
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (var j = 0; j < ka.length; j++) if (!hasOwn.call(b, ka[j]) || !equal(a[ka[j]], b[ka[j]])) return false;
      return true;
    }
    return false;
  }

  /**
   * Fills every field missing from target (undefined) with a copy of defaults', recursing into
   * plain objects present in both; existing values, arrays and unknown fields are kept.
   * @returns {object} target
   */
  function deepFill(target, defaults) {
    if (!isObject(target) || !isObject(defaults)) return target;
    for (var k in defaults) {
      if (!hasOwn.call(defaults, k)) continue;
      if (!hasOwn.call(target, k) || target[k] === undefined) target[k] = clone(defaults[k]);
      else if (isObject(target[k]) && isObject(defaults[k])) deepFill(target[k], defaults[k]);
    }
    return target;
  }

  /**
   * Deep-merges patch into target: plain objects merge recursively, anything else (arrays
   * included) replaces. Used by SR.debug.set.
   * @returns {object} target
   */
  function merge(target, patch) {
    if (!isObject(target) || !isObject(patch)) return target;
    for (var k in patch) {
      if (!hasOwn.call(patch, k) || k === '__proto__') continue;
      if (isObject(patch[k]) && isObject(target[k])) merge(target[k], patch[k]);
      else target[k] = clone(patch[k]);
    }
    return target;
  }

  /** @returns {string} n as a string left-padded with zeros to width. */
  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  var warned = {};
  /** Logs a console warning the first time key is seen. @returns {boolean} true if it logged. */
  function warnOnce(key, msg) {
    if (hasOwn.call(warned, key)) return false;
    warned[key] = true;
    if (typeof console !== 'undefined' && console.warn) console.warn(msg === undefined ? key : msg);
    return true;
  }

  SR.util = {
    isObject: isObject,
    clamp: clamp,
    lerp: lerp,
    invLerp: invLerp,
    cubicBezier: cubicBezier,
    easeLinear: function (t) { return t; },
    easeIn: function (t) { return t * t * t; },
    // The UI motion tokens of UI.md §2.1 (--ease-out, --ease-inout, --ease-spring) for canvas tweens.
    easeOut: cubicBezier(0.2, 0.8, 0.2, 1),
    easeInOut: cubicBezier(0.65, 0, 0.35, 1),
    easeSpring: cubicBezier(0.34, 1.56, 0.64, 1),
    fmt: fmt,
    hash: hash,
    crc32: crc32,
    clone: clone,
    equal: equal,
    deepFill: deepFill,
    merge: merge,
    pad: pad,
    warnOnce: warnOnce,
  };
})();
