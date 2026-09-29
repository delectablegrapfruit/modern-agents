// js/rules/check.js — owner: W1-R. SR.rules.check: the one stat-check formula (GDD §4.3) with the
// check modifiers of BALANCE B-28b (ARCHITECTURE §6.10), the roll, and the dotted-glob matcher
// that price and check modifiers share. Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // GDD §4.3 / B-28b: chance = clamp(stat / (stat + max(D_MIN, D + ΣdD)) + Σadd, MIN, MAX).
  // BALANCE writes these three numbers in the formula but has no key for them (requests/W1-R.md).
  var CHANCE_MIN = 0.05;
  var CHANCE_MAX = 0.95;
  var D_MIN = 1;

  /**
   * Matches a dotted id against a dotted glob: `*` matches one segment; a trailing `*` matches one
   * or more remaining segments ('holdup.*' matches 'holdup.store.str'; 'holdup.*.str' does not
   * match 'holdup.bank.cha').
   * @returns {boolean}
   */
  function match(glob, id) {
    var g = String(glob).split('.'), p = String(id).split('.');
    for (var i = 0; i < g.length; i++) {
      if (g[i] === '*' && i === g.length - 1) return p.length > i;
      if (i >= p.length) return false;
      if (g[i] !== '*' && g[i] !== p[i]) return false;
    }
    return g.length === p.length;
  }

  /** @returns {boolean} the id matches any glob of the list (and none of `except`). */
  function matchAny(globs, id, except) {
    if (except && except.some(function (g) { return match(g, id); })) return false;
    return (globs || []).some(function (g) { return match(g, id); });
  }

  /** @returns {boolean} a modifier row applies to a state: its flag is on and its `when` holds. */
  function rowApplies(row, s, ctx) {
    if (row.feature && !SR.features[row.feature]) return false;
    if (!row.when || !row.when.length) return true;
    if (!s || !SR.rules.conditions) return false;
    return SR.rules.conditions.all(s, row.when, ctx || {}).ok;
  }

  /**
   * The check modifier rows of B-28b that apply to a check id in a state.
   * @returns {object[]} rows of SR.tuning.checkMods
   */
  function mods(s, checkId, ctx) {
    if (!checkId) return [];
    return SR.tuning.checkMods.filter(function (row) {
      return matchAny(row.checks, checkId, row.except) && rowApplies(row, s, ctx);
    });
  }

  /**
   * The probability of passing a stat check (GDD §4.3, B-28b): dD rows are summed into D (D ≥ 1),
   * add rows onto the probability, then the clamp to 0.05..0.95; an `always` row returns its value.
   * @param {number} stat the stat value
   * @param {number} D the difficulty (25 easy, 75 medium, 200 hard, 500 heroic, or stated)
   * @param {{s: object, checkId: string}=} opts the state and the check id (both needed for modifiers)
   * @returns {number} 0.05..0.95 (or 1 for an `always` row)
   */
  function chance(stat, D, opts) {
    opts = opts || {};
    var rows = opts.s ? mods(opts.s, opts.checkId, opts.ctx) : [];
    var dD = 0, add = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind === 'always') return r.value;
      if (r.kind === 'dD') dD += r.value;
      else if (r.kind === 'add') add += r.value;
    }
    stat = Math.max(0, Number(stat) || 0);
    var d = Math.max(D_MIN, (Number(D) || 0) + dD);
    return SR.util.clamp(stat / (stat + d) + add, CHANCE_MIN, CHANCE_MAX);
  }

  /** Rolls a probability with one draw of the given stream. @returns {boolean} */
  function roll(rng, p) { return rng.float() < p; }

  SR.rules.check = { chance: chance, roll: roll, mods: mods, match: match, matchAny: matchAny, rowApplies: rowApplies };
})();
