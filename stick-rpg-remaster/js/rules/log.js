// js/rules/log.js — owner: W1-R. SR.rules.log: the daily log that feeds the morning headline and
// the TV news (ARCHITECTURE §6.9; BALANCE B-29). Entries are { kind, weight, vars }; at most 20 a
// day, kept by weight. Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {number} the B-29 weight of a log kind (0 for an unknown kind, which is warned once). */
  function weight(kind) {
    var w = SR.tuning.news.weights;
    if (Object.prototype.hasOwnProperty.call(w, kind)) return w[kind];
    SR.util.warnOnce('log.kind:' + kind, 'SR.rules.log: unknown log kind "' + kind + '" (BALANCE B-29), weight 0');
    return 0;
  }

  /**
   * Adds an entry to today's log. When 20 entries are already there, a heavier entry replaces the
   * lightest one (the oldest of equals); a lighter or equal one is dropped. The list stays in
   * chronological order, so "ties: the latest" (the headline rule) is the last of equals.
   * @param {object} s state
   * @param {string} kind a B-29 kind ('promoted', 'fall', ...)
   * @param {object=} vars template variables for news.head.<kind>
   * @returns {object|null} the entry added, or null when it was dropped
   */
  function add(s, kind, vars) {
    var max = SR.tuning.news.logMax;
    var entry = { kind: String(kind), weight: weight(kind), vars: vars ? SR.util.clone(vars) : {} };
    var today = s.log.today;
    if (today.length >= max) {
      var low = 0;
      for (var i = 1; i < today.length; i++) if (today[i].weight < today[low].weight) low = i;
      if (entry.weight <= today[low].weight) return null;
      today.splice(low, 1);
    }
    today.push(entry);
    return entry;
  }

  /** Night step 9: today's log becomes yesterday's; today starts empty. */
  function roll(s) {
    s.log.yesterday = s.log.today;
    s.log.today = [];
  }

  SR.rules.log = { add: add, roll: roll, weight: weight };
})();
