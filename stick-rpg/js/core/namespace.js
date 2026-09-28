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

  // Flash's string-to-number (checked in Ruffle): a leading 0 with only digits 0-7 is octal ('0100'
  // is 64), 0x/0X is hex, leading spaces are skipped, anything else non-numeric is NaN. flashInt is
  // AS1 int(): truncation to a 32-bit integer, NaN and Infinity become 0.
  function flashNumber(v) {
    if (typeof v === 'number') return v;
    var t = String(v);
    if (/^0[0-7]+$/.test(t)) return parseInt(t, 8);
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t.slice(2), 16);
    t = t.replace(/^\s+/, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
    return Number(t);
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
