// js/core/quality.js — owner: W1-K. SR.quality: the quality presets High / Medium / Low and Auto
// (ARCHITECTURE §2; docs/CONTRACT.md §20). Auto measures work time (the update + render CPU time
// the loop reports per rendered frame, never the frame interval, so a 30 fps cap never looks slow):
// over a rolling 5 s window, a 90th percentile above 12 ms steps down one preset; staying under
// 7 ms for 20 s steps up; at most one change per 20 s. The touch-compact profile caps maxDpr at 1.5
// (§17). Emits quality:changed { preset, auto }; a change of maxDpr or renderScale re-sizes the
// stage. The Display setting (display.quality) drives it; SR.quality.set never persists (the harness
// pins High with it). Load-time clean (Node tests load it).
(function () {
  'use strict';
  var SR = window.SR;

  // ARCHITECTURE §2 (engine constants, not balance numbers). shadowHours: re-bake period (0 = off);
  // particles and crowd are factors; rain is the streak count; lean: the P2 option is allowed.
  var PRESETS = {
    high: { maxDpr: 2, renderScale: 1, shadowHours: 1, particles: 1, crowd: 1, rain: 300, lean: true },
    medium: { maxDpr: 1.5, renderScale: 1, shadowHours: 2, particles: 0.7, crowd: 1, rain: 200, lean: false },
    low: { maxDpr: 1, renderScale: 0.75, shadowHours: 0, particles: 0.4, crowd: 0.5, rain: 90, lean: false },
  };
  var ORDER = ['low', 'medium', 'high'];
  var AUTO_WINDOW_MS = 5000;     // rolling window of work-time samples
  var AUTO_DOWN_MS = 12;         // p90 above this steps down
  var AUTO_UP_MS = 7;            // p90 below this for AUTO_UP_HOLD_MS steps up
  var AUTO_UP_HOLD_MS = 20000;
  var AUTO_GAP_MS = 20000;       // at most one change per 20 s
  var AUTO_PCT = 0.9;
  var AUTO_MIN_SAMPLES = 30;     // about half a second of frames before judging
  var AUTO_JUDGE_MS = 250;       // the window is judged at most this often (no per-frame sort)
  var COMPACT_MAX_DPR = 1.5;     // touch-compact profile (§17)

  var q = { preset: 'high', auto: true, samples: [], lastChange: -Infinity, underSince: null, judged: -Infinity, cache: null, cacheKey: '' };

  function clock() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }

  /**
   * @returns {object} the effective parameters of the current preset: one frozen object per preset
   *   and layout, so the renderer can read it every frame without allocating.
   */
  function params() {
    var compact = !!(SR.stage && SR.stage.compact);
    var key = q.preset + (compact ? ':compact' : '');
    if (q.cacheKey !== key || !q.cache) {
      var p = Object.assign({}, PRESETS[q.preset]);
      if (compact) p.maxDpr = Math.min(p.maxDpr, COMPACT_MAX_DPR);
      q.cache = Object.freeze(p);
      q.cacheKey = key;
    }
    return q.cache;
  }

  function apply(preset, auto) {
    var before = params();
    var changed = preset !== q.preset || auto !== q.auto;
    q.preset = preset;
    q.auto = auto;
    q.samples.length = 0;
    q.underSince = null;
    q.judged = -Infinity;
    var after = params();
    if ((before.maxDpr !== after.maxDpr || before.renderScale !== after.renderScale) && SR.stage && typeof SR.stage.resize === 'function' && SR.stage.ctx) {
      SR.stage.resize();
    }
    if (changed && SR.events) SR.events.emit('quality:changed', { preset: q.preset, auto: q.auto });
  }

  /**
   * Chooses a preset.
   * @param {string} preset 'auto' | 'high' | 'medium' | 'low'
   * @returns {string} the effective preset
   */
  function set(preset) {
    if (preset === 'auto') { apply(q.preset, true); q.lastChange = -Infinity; return q.preset; }
    if (!PRESETS[preset]) throw new Error('SR.quality.set: unknown preset "' + preset + '" (auto, high, medium, low)');
    apply(preset, false);
    return q.preset;
  }

  function percentile(list, p) {
    var a = list.slice().sort(function (x, y) { return x - y; });
    return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  }

  /**
   * Feeds one rendered frame's work time to Auto (the loop calls this).
   * @param {number} workMs update + render CPU time of the frame
   * @param {number=} at the sample's time in ms (performance.now() by default; tests pass their own)
   * @returns {string|null} the new preset when Auto changed it
   */
  function sample(workMs, at) {
    if (!q.auto || typeof workMs !== 'number' || !isFinite(workMs)) return null;
    var t = typeof at === 'number' ? at : clock();
    var s = q.samples;
    s.push(t, workMs);
    var cut = 0;
    while (cut < s.length && s[cut] < t - AUTO_WINDOW_MS) cut += 2;
    if (cut) s.splice(0, cut);
    var n = s.length / 2;
    if (n < AUTO_MIN_SAMPLES || s[0] > t - AUTO_WINDOW_MS * 0.9) return null;   // wait for a full window
    if (t - q.judged < AUTO_JUDGE_MS) return null;
    q.judged = t;
    var ms = [];
    for (var i = 1; i < s.length; i += 2) ms.push(s[i]);
    var p90 = percentile(ms, AUTO_PCT);
    var idx = ORDER.indexOf(q.preset);
    if (p90 > AUTO_DOWN_MS) {
      q.underSince = null;
      if (idx > 0 && t - q.lastChange >= AUTO_GAP_MS) { q.lastChange = t; apply(ORDER[idx - 1], true); return q.preset; }
      return null;
    }
    if (p90 < AUTO_UP_MS) {
      if (q.underSince === null) q.underSince = t;
      if (idx < ORDER.length - 1 && t - q.underSince >= AUTO_UP_HOLD_MS && t - q.lastChange >= AUTO_GAP_MS) {
        q.lastChange = t;
        apply(ORDER[idx + 1], true);
        return q.preset;
      }
      return null;
    }
    q.underSince = null;
    return null;
  }

  SR.quality = {
    set: set,
    sample: sample,
    /** @returns {object} a copy of the preset table (ARCHITECTURE §2). */
    presets: function () { return SR.util.clone(PRESETS); },
  };
  Object.defineProperty(SR.quality, 'preset', { enumerable: true, get: function () { return q.preset; } });
  Object.defineProperty(SR.quality, 'auto', { enumerable: true, get: function () { return q.auto; } });
  Object.defineProperty(SR.quality, 'params', { enumerable: true, get: params });

  // The Display setting chooses the preset (applied at boot and whenever it changes; pure).
  SR.onBoot(10, function () {
    if (!SR.settings) return;
    var want = SR.settings.get('display.quality');
    if (want) set(want);
    SR.events.on('settings:changed', function (p) {
      if (p && p.key === 'display.quality') set(p.value);
      else if (p && p.key === '*' && p.value && p.value.display) set(p.value.display.quality);
    });
  }, { headless: true });
})();
