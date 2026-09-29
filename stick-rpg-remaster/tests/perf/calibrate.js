// tests/perf/calibrate.js — owner: W1-Q. The calibration workload of ARCHITECTURE §17: a fixed,
// deterministic JS workload shaped like the game's CPU work (entity updates on plain objects, a
// Y-sort, float maths, text formatting, map lookups, a typed-array pixel pass). Its median time
// divided by REFERENCE_MS (its time on the reference machine) is the calibration factor, clamped
// to 0.5-4, by which every CPU budget is multiplied; draw-count and memory budgets are absolute.
//
// Loads anywhere: a classic <script> or page.addScriptTag in a page (window.SRCalibrate; it never
// touches window.SR), or require() in Node.
//   SRCalibrate.run(runs?) → { ms, factor, reference, checksum, runs: [ms...] }
//   SRCalibrate.factor(ms) → the clamped factor · SRCalibrate.workload() → checksum (one run)
//
// REFERENCE_MS is the design target (about 20 ms on the reference machine: a 4-core i5-1135G7 /
// Ryzen 5 5500U laptop in Chrome stable). The workload is sized so that a 2.1 GHz Xeon cloud
// container, about 1.5 times slower per core, measures about 30 ms in Chromium (factor ≈ 1.5).
// The lead re-derives REFERENCE_MS on the reference machine in the headed pass
// (reports/perf-manual.md) and changes only this constant.
(function (root) {
  'use strict';
  var REFERENCE_MS = 20;
  var MIN_FACTOR = 0.5;
  var MAX_FACTOR = 4;

  function now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  /** One run of the workload. @returns {number} a checksum (the same on every run and machine). */
  function workload() {
    var seed = 0x9e3779b9;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    var sum = 0;
    var i;
    var k;
    // 1. entity updates: plain objects with positions and velocities (world systems)
    var ents = [];
    for (i = 0; i < 1500; i++) ents.push({ x: rnd() * 5120, y: rnd() * 4608, vx: rnd() - 0.5, vy: rnd() - 0.5, r: 8, hit: 0 });
    for (k = 0; k < 60; k++) {
      for (i = 0; i < ents.length; i++) {
        var e = ents[i];
        e.x += e.vx * 16;
        e.y += e.vy * 16;
        if (e.x < 0 || e.x > 5120) { e.vx = -e.vx; e.hit++; }
        if (e.y < 0 || e.y > 4608) { e.vy = -e.vy; e.hit++; }
      }
    }
    for (i = 0; i < ents.length; i++) sum += ents[i].hit;
    // 2. the Y-sort of a frame's drawables
    for (k = 0; k < 6; k++) {
      var items = ents.slice();
      items.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      sum += Math.round(items[0].y) & 7;
    }
    // 3. float maths (projection, lighting falloff)
    var f = 0;
    for (i = 0; i < 560000; i++) f += Math.sqrt(i) * Math.sin(i * 0.001) + Math.atan2(i & 255, 17);
    sum += Math.round(f) & 255;
    // 4. text formatting (the HUD, toasts, text keys)
    var parts = [];
    for (i = 0; i < 20000; i++) {
      var n = Math.floor(rnd() * 1000000);
      parts.push('$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' · ' + (i % 24) + ':' + ('0' + (i % 60)).slice(-2));
    }
    sum += parts.join('|').length & 1023;
    // 5. map lookups (registries, caches)
    var m = new Map();
    for (i = 0; i < 60000; i++) m.set('k' + (i % 5000), i);
    for (i = 0; i < 60000; i++) sum += (m.get('k' + (i % 5000)) & 1);
    // 6. a typed-array pixel pass (grain, grids)
    var px = new Uint8ClampedArray(256 * 256 * 4);
    for (k = 0; k < 8; k++) {
      for (i = 0; i < px.length; i += 4) { px[i] = (i >> 2) & 255; px[i + 1] = (px[i] * 3 + k) & 255; px[i + 2] = (px[i + 1] ^ px[i]) & 255; px[i + 3] = 255; }
    }
    sum += px[px.length - 2];
    return sum >>> 0;
  }

  /** @returns {{ms: number, runs: number[], checksum: number}} the median of `runs` timed runs after 2 warm-ups. */
  function measure(runs) {
    runs = runs || 7;
    var checksum = workload();
    workload();
    var times = [];
    for (var i = 0; i < runs; i++) {
      var t0 = now();
      var c = workload();
      times.push(now() - t0);
      if (c !== checksum) throw new Error('calibrate.js: the workload is not deterministic');
    }
    var sorted = times.slice().sort(function (a, b) { return a - b; });
    return { ms: sorted[Math.floor(sorted.length / 2)], runs: times, checksum: checksum };
  }

  /** @returns {number} the calibration factor for a measured time, clamped to 0.5-4. */
  function factor(ms) { return Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, ms / REFERENCE_MS)); }

  var api = {
    REFERENCE_MS: REFERENCE_MS, MIN_FACTOR: MIN_FACTOR, MAX_FACTOR: MAX_FACTOR,
    workload: workload, measure: measure, factor: factor,
    /** @returns {{ms: number, factor: number, reference: number, checksum: number, runs: number[]}} */
    run: function (runs) {
      var m = measure(runs);
      return { ms: m.ms, factor: factor(m.ms), reference: REFERENCE_MS, checksum: m.checksum, runs: m.runs };
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.SRCalibrate = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
