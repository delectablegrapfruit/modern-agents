// js/core/rng.js — owner: W1-K (lead). SR.rng: sfc32 generators (4 × 32-bit state) and the three
// streams rules, world and fx (ARCHITECTURE §14; docs/CONTRACT.md §6). Pure: no DOM, browser API
// or the browser's random source (Node-loadable). js/main.js reseeds the fx stream from it at boot.
(function () {
  'use strict';
  var SR = window.SR;
  // Math held in a local: in Node's vm contexts (the Node suites, the balance simulator) every
  // global lookup costs ~150 ns, and int() makes several (docs/requests/W1-C.md 4).
  var M = Math;

  /** @returns {function(): number} a splitmix32 sequence from a uint32 seed (used only to seed). */
  function splitmix32(x) {
    return function () {
      x = (x + 0x9e3779b9) | 0;
      var z = x;
      z = M.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = M.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
  }

  /** @returns {number} a uint32 seed from any number or string. */
  function toSeed(n) {
    if (typeof n === 'number' && isFinite(n) && M.floor(n) === n) return n >>> 0;
    return SR.util.hash(n);
  }

  /**
   * Creates an independent sfc32 stream.
   * @param {number|string} seed
   * @returns {object} { seed, next, float, int, pick, chance, weighted, state, setState }
   */
  function create(seed) {
    var a = 0, b = 0, c = 0, d = 0;

    /** @returns {number} the next uint32 (PractRand sfc32: t = a + b + counter). */
    function next() {
      var t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return t >>> 0;
    }

    var s = {
      /** Reseeds the stream: splitmix32(seed) fills a, b, c; the counter starts at 1; 12 draws are discarded. */
      seed: function (n) {
        var sm = splitmix32(toSeed(n));
        a = sm() | 0; b = sm() | 0; c = sm() | 0; d = 1;
        for (var i = 0; i < 12; i++) next();
        return s;
      },
      next: next,
      /** @returns {number} a float in [0, 1), or in [lo, hi) when both are given (one draw). */
      float: function (lo, hi) {
        var f = next() / 4294967296;
        return lo === undefined ? f : lo + f * (hi - lo);
      },
      /** @returns {number} an integer in [lo, hi], both inclusive (one draw). */
      int: function (lo, hi) {
        var l = M.ceil(M.min(lo, hi)), h = M.floor(M.max(lo, hi));
        return l + M.floor((next() / 4294967296) * (h - l + 1));
      },
      /** @returns {*} a uniformly chosen element (one draw; undefined for an empty array). */
      pick: function (arr) { return arr[s.int(0, arr.length - 1)]; },
      /** @returns {boolean} true with probability p (one draw, whatever p). */
      chance: function (p) { return next() / 4294967296 < p; },
      /**
       * @param {Array<[*, number]>} pairs [[value, weight], ...]; weights ≤ 0 never win
       * @returns {*} a value chosen by weight (one draw), or null when no weight is positive
       */
      weighted: function (pairs) {
        var total = 0, i, w;
        for (i = 0; i < pairs.length; i++) { w = +pairs[i][1]; if (w > 0) total += w; }
        var r = (next() / 4294967296) * total;
        if (!(total > 0)) return null;
        var last = null;
        for (i = 0; i < pairs.length; i++) {
          w = +pairs[i][1];
          if (!(w > 0)) continue;
          if (r < w) return pairs[i][0];
          r -= w;
          last = pairs[i][0];
        }
        return last;
      },
      /** @returns {number[]} the state [a, b, c, d] as uint32s (saved as state.rng.rules). */
      state: function () { return [a >>> 0, b >>> 0, c >>> 0, d >>> 0]; },
      /** Restores a state returned by state(). */
      setState: function (st) {
        if (!st || st.length !== 4 || !Array.prototype.every.call(st, function (v) { return typeof v === 'number' && isFinite(v); })) {
          throw new TypeError('SR.rng setState: expected [a, b, c, d] (four numbers)');
        }
        a = st[0] | 0; b = st[1] | 0; c = st[2] | 0; d = st[3] | 0;
        return s;
      },
    };
    s.seed(seed === undefined ? 0 : seed);
    return s;
  }

  SR.rng = {
    create: create,
    // Default seeds until a game starts: rules is reseeded with state.seed (new game) or restored
    // from state.rng.rules (load); world with hash(seed, day) each morning; fx by js/main.js at boot.
    rules: create(1),
    world: create(2),
    fx: create(3),
    /** Reseeds the world stream for a game day: hash(seed, day). */
    reseedWorld: function (seed, day) { SR.rng.world.seed(SR.util.hash(seed, day)); },
  };

  // Each morning the world stream follows the day (ARCHITECTURE §14).
  SR.onBoot(10, function () {
    SR.events.on('day:started', function (p) {
      var s = SR.state;
      if (s && s.seed !== undefined) SR.rng.reseedWorld(s.seed, p && p.day !== undefined ? p.day : s.clock.day);
    });
  }, { headless: true });
})();
