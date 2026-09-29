// js/rules/stats.js — owner: W1-R. SR.rules.stats: stat gains (the degree bonus, Winded and the 999
// cap; HP max = 15 + STR), karma, Heat, Buzz, HP, the karma band and tier (GDD §4.2, §4.5;
// ARCHITECTURE §6.5; BALANCE B-02, B-03, B-04). Pure: no DOM, browser API or unseeded randomness.
(function () {
  'use strict';
  var SR = window.SR;

  var STATS = ['str', 'int', 'cha'];

  // Gain sources (the `src` of add): which modifiers apply (GDD §4.5).
  //   'train' (the default): every training gain of B-03 (classes, TV, beer, jail workouts, a won
  //       bar fight): the degree bonus and Winded;
  //   'furniture': nightly furniture: Winded only (the degree bonus excludes it);
  //   'fixed': exact amounts (the degree's own +25, the cheat, debug): neither;
  //   anything else ('reward', 'decree', 'gift', 'event', ...): the degree bonus only.
  var NO_DEGREE = { furniture: true, fixed: true };
  var WINDED = { train: true, furniture: true };

  /** @returns {number} v as a whole number (truncated toward zero), 0 when not finite. */
  function whole(v) { v = Number(v); return isFinite(v) ? (v < 0 ? Math.ceil(v) : Math.floor(v)) : 0; }

  /** @returns {boolean} HP is below 25 % of HP max (GDD §4.2: training gains are halved). */
  function winded(s) {
    return s.stats.hp < SR.tuning.training.winded.threshold * s.stats.hpMax;
  }

  /** @returns {boolean} a degree in the track of this stat is held (P1 `degrees`). */
  function degreeIn(s, key) {
    if (!SR.features.degrees || !s.edu || !s.edu.degrees) return false;
    var tracks = SR.tuning.training.degree.tracks;
    return Object.keys(tracks).some(function (t) { return tracks[t] === key && !!s.edu.degrees[t]; });
  }

  /**
   * What a gain of n would do, without changing the state (previews, toasts).
   * @param {object} s state
   * @param {string} key 'str' | 'int' | 'cha'
   * @param {number} n the table gain (before modifiers)
   * @param {string=} src 'train' (default) | 'furniture' | 'fixed' | 'reward' (or any other source)
   * @returns {{n: number, applied: number, degree: boolean, winded: boolean, capped: boolean}}
   *   n: the gain after the degree bonus and Winded; applied: after the 999 cap
   */
  function gain(s, key, n, src) {
    var T = SR.tuning, g = whole(n);
    var out = { n: g, applied: 0, degree: false, winded: false, capped: false };
    if (g <= 0) {
      out.applied = -Math.min(s.stats[key], -g);
      return out;
    }
    src = src || 'train';
    if (!NO_DEGREE[src] && degreeIn(s, key)) { g += T.training.degree.perGain; out.degree = true; }
    if (WINDED[src] && winded(s)) {
      g = Math.max(T.training.winded.min, Math.floor(g * T.training.winded.factor));
      out.winded = true;
    }
    out.n = g;
    out.applied = Math.max(0, Math.min(g, T.start.statCap - s.stats[key]));
    out.capped = out.applied < g;
    return out;
  }

  /**
   * Adds to a stat through every rule of GDD §4.2 / §4.5: the degree bonus (+1), Winded (×0.5,
   * floor, min 1), the 999 cap (a gain past it is lost), HP max = 15 + STR (the applied STR is added
   * to HP max; nothing else changes HP max), perk milestones (P1). Losses floor at 0.
   * 'karma', 'heat', 'buzz' and 'hp' are forwarded to their own functions.
   * @param {object} s state
   * @param {string} key 'str' | 'int' | 'cha' (or 'karma' | 'heat' | 'buzz' | 'hp')
   * @param {number} n the gain (negative: a loss)
   * @param {string=} src gain source: 'train' (default) | 'furniture' | 'fixed' | 'reward' (or any other)
   * @param {{events: object[]}=} out optional Result / Report: receives the `stat` rule event
   *   { key, n, total } (the action pipeline derives it from the deltas instead)
   * @returns {number} the applied change
   */
  function add(s, key, n, src, out) {
    if (key === 'karma') return karma(s, n);
    if (key === 'heat') return heat(s, n);
    if (key === 'buzz') return buzz(s, n);
    if (key === 'hp') return n >= 0 ? heal(s, n) : -hurt(s, -n);
    if (STATS.indexOf(key) < 0) throw new Error('SR.rules.stats.add: unknown stat "' + key + '"');
    var T = SR.tuning;
    var applied = gain(s, key, n, src).applied;
    if (!applied) return 0;
    s.stats[key] += applied;
    if (key === 'str') {
      // The invariant of ARCHITECTURE §6.1: hpMax === hpMaxBase + str.
      s.stats.hpMax = T.start.hpMaxBase + s.stats.str;
      if (s.stats.hp > s.stats.hpMax) s.stats.hp = s.stats.hpMax;
    }
    if (applied > 0 && SR.rules.perks && typeof SR.rules.perks.update === 'function') SR.rules.perks.update(s);
    if (out) (out.events || (out.events = [])).push({ name: 'stat', payload: { key: key, n: applied, total: s.stats[key] } });
    return applied;
  }

  /** Changes karma, clamped to -100..+100 after every change (GDD §4.2). @returns {number} applied */
  function karma(s, n) {
    var r = SR.tuning.start.karmaRange, from = s.stats.karma;
    s.stats.karma = SR.util.clamp(from + whole(n), r[0], r[1]);
    return s.stats.karma - from;
  }

  /** @returns {boolean} McHolland's bribe blocks Heat gains today (B-11a; bribedUntil is inclusive). */
  function heatBlocked(s) {
    var m = s.npc && s.npc.mcholland;
    return !!(m && m.bribedUntil && s.clock.day <= m.bribedUntil);
  }

  /** Changes Heat within 0..100 (gains are blocked during McHolland's bribe). @returns {number} applied */
  function heat(s, n) {
    n = whole(n);
    if (n > 0 && heatBlocked(s)) return 0;
    var r = SR.tuning.start.heatRange, from = s.stats.heat;
    s.stats.heat = SR.util.clamp(from + n, r[0], r[1]);
    return s.stats.heat - from;
  }

  /** Changes Buzz within 0..5. @returns {number} applied */
  function buzz(s, n) {
    var r = SR.tuning.start.buzzRange, from = s.stats.buzz;
    s.stats.buzz = SR.util.clamp(from + whole(n), r[0], r[1]);
    return s.stats.buzz - from;
  }

  /** Heals up to HP max (overheal is lost). @returns {number} the HP actually gained */
  function heal(s, n) {
    var from = s.stats.hp;
    s.stats.hp = Math.min(s.stats.hpMax, from + Math.max(0, whole(n)));
    if (s.stats.hp < from) s.stats.hp = from;   // never lowers HP that is above max (debug states)
    return s.stats.hp - from;
  }

  /**
   * Takes HP, clamped at 0; reaching 0 is resolved by the action pipeline (SR.rules.health.down).
   * @param {string=} cause fall | carHit | carCrash | fight | mugger | goons | other
   * @returns {number} the HP actually lost
   */
  function hurt(s, n, cause) { // cause is informational; the pipeline tracks it for health.down
    var from = s.stats.hp;
    s.stats.hp = Math.max(0, from - Math.max(0, whole(n)));
    return from - s.stats.hp;
  }

  /** @returns {number} the karma colour band 0..9: clamp(ceil(|k| / 10) - 1, 0, 9) (B-04c). */
  function band(k) {
    var b = SR.tuning.karma.band;
    return SR.util.clamp(Math.ceil(Math.abs(Number(k) || 0) / b.div) - 1, 0, b.max);
  }

  /** @returns {string} the karma tier (B-04b): 'angelic' | 'good' | 'neutral' | 'bad' | 'wicked'. */
  function tier(k) {
    var t = SR.tuning.karma.tiers;
    if (k >= t.angelic) return 'angelic';
    if (k >= t.good) return 'good';
    if (k <= t.wicked) return 'wicked';
    if (k <= t.bad) return 'bad';
    return 'neutral';
  }

  /** @returns {string} the rank column of B-18: 'good' (karma > +20), 'evil' (< -20) or 'neutral'. */
  function column(k) {
    var c = SR.tuning.karma.rankColumn;
    return k > c.good ? 'good' : k < c.evil ? 'evil' : 'neutral';
  }

  SR.rules.stats = {
    KEYS: STATS.slice(),
    add: add,
    gain: gain,
    karma: karma,
    heat: heat,
    buzz: buzz,
    heal: heal,
    hurt: hurt,
    band: band,
    tier: tier,
    column: column,
    winded: winded,
  };
})();
