// js/core/debug.js — owner: W1-K (lead). SR.debug: the test and debug API (ARCHITECTURE §20;
// docs/CONTRACT.md §17), always present; tests/harness.cjs drives the game through it.
// M0 provides seed, feature, goto and ui; M1 adds the rest (newGame, set, get, act, preview,
// enter, teleport, setTime, setDay, step, press, hold, mg, fast, perf, shot, grid, time, night,
// down, quality, projected) and the #debug overlay and #artbible route.
(function () {
  'use strict';
  var SR = window.SR;

  SR.debug = {
    /** Reseeds the rules stream (and the running game's seed, if any). */
    seed: function (n) {
      SR.rng.rules.seed(n);
      if (SR.state) { SR.state.seed = n; SR.state.rng = { rules: SR.rng.rules.state() }; }
      return SR.rng.rules.state();
    },
    /** Turns a feature flag (BUILD_PLAN Appendix B) on or off at runtime. */
    feature: function (flag, on) {
      if (!Object.prototype.hasOwnProperty.call(SR.features, flag)) throw new Error('SR.debug.feature: unknown flag "' + flag + '"');
      SR.features[flag] = !!on;
      return SR.features[flag];
    },
    /** Replaces the scene stack with sceneId. */
    goto: function (sceneId, params) { SR.scenes.go(sceneId, params); return SR.scenes.stack(); },
    /** @returns {object} a JSON summary of the visible UI (M0: the scene stack). */
    ui: function () { return { scenes: SR.scenes.stack() }; },
  };
})();
