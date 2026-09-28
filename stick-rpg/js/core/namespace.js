// Global namespace and registries. Every other script attaches to window.SRPG.
// Classic scripts (not ES modules) so the game runs straight from file:// as well as over http.
(function () {
  'use strict';
  var SRPG = (window.SRPG = window.SRPG || {});

  // The original Flash stage: 550x400 at 35 frames per second. All game logic runs on that
  // fixed 35 Hz tick; the stage is CSS-scaled to fit the window.
  SRPG.W = 550;
  SRPG.H = 400;
  SRPG.FPS = 35;

  SRPG.screens = {}; // id -> full-screen scene definition (minigames, fight, results...)
  SRPG.locations = {}; // id -> building definition shown by the generic location scene

  SRPG.registerScreen = function (id, def) {
    if (!id || !def) throw new Error('registerScreen: missing id/def');
    SRPG.screens[id] = def;
  };
  SRPG.registerLocation = function (def) {
    if (!def || !def.id) throw new Error('registerLocation: missing id');
    SRPG.locations[def.id] = def;
  };

  // Random numbers. random(n) has Flash's AS1 semantics: n is first truncated to an integer, then
  // the result is an integer in [0, n-1] (0 when n < 1). Seedable so tests can pin outcomes.
  var seed = null;
  function next() {
    if (seed === null) return Math.random();
    seed = (seed + 0x6d2b79f5) >>> 0; // mulberry32
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  SRPG.rng = {
    seed: function (n) { seed = n >>> 0; },
    unseed: function () { seed = null; },
    float: next, // [0, 1)
    random: function (n) { n = Math.floor(n); return n > 0 ? Math.floor(next() * n) : 0; },
    pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
  };

  // Flash's string-to-number, as Ruffle runs the original (probed there string by string):
  // - hex: 0x / 0X, an optional sign after it, hex digits; folded into 32 bits, so '0xFFFFFFFF' is
  //   -1 and '0x80000000' is -2147483648; the sign applies afterwards ('0x-1' is -1);
  // - octal: an optional sign, a leading 0 and only digits 0-7 ('0100' is 64, '+010' 8, '-010' -8),
  //   also folded into 32 bits; no leading spaces allowed ('09' and ' 010' are decimal);
  // - decimal: leading spaces, tabs, CR and LF are skipped (not other white space), anything after
  //   the number makes it NaN, and an exponent mark without digits is ignored ('12e' is 12, '.' 0).
  // flashInt is AS1 int(): truncation to a 32-bit integer, NaN and Infinity become 0.
  function flashNumber(v) {
    if (typeof v === 'number') return v;
    var t = String(v);
    var m = /^0[xX]([-+]?)([0-9a-fA-F]+)$/.exec(t);
    var n, i;
    if (m) {
      for (n = 0, i = 0; i < m[2].length; i++) n = ((n << 4) | parseInt(m[2].charAt(i), 16)) | 0;
      return m[1] === '-' ? -n | 0 : n;
    }
    m = /^([-+]?)0([0-7]+)$/.exec(t);
    if (m) {
      for (n = 0, i = 0; i < m[2].length; i++) n = ((n << 3) | +m[2].charAt(i)) | 0;
      return m[1] === '-' ? -n | 0 : n;
    }
    m = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?)(\d*))?$/.exec(t.replace(/^[ \t\r\n]+/, ''));
    if (!m || (m[2] === '' && m[3] === undefined)) return NaN;
    n = Number((m[2] || '0') + '.' + (m[3] || '0') + (m[5] ? 'e' + (m[4] || '') + m[5] : ''));
    return m[1] === '-' ? -n : n;
  }
  function flashInt(v) {
    var n = flashNumber(v);
    return isFinite(n) ? n | 0 : 0;
  }

  SRPG.util = {
    flashNumber: flashNumber,
    flashInt: flashInt,
    clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    commas: function (n) {
      var neg = n < 0;
      var s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-' : '') + s;
    },
    money: function (n) { return (n < 0 ? '-$' : '$') + SRPG.util.commas(Math.abs(n)); },
    escape: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    // 12-hour clock label used by the TV news ("StickNews at 3").
    hour12: function (t) { return t > 12 ? t - 12 : t; },
  };
})();
