// js/rules/perks.js — owner: W1-R (W3-Prog in wave 3). SR.rules.perks: the stat-milestone perks
// (GDD §4.14; BALANCE B-21; P1, flag `perks`). Each time STR, INT or CHA first reaches 100, 250, 450
// or 700, an offer of that milestone's two perks waits in state.perks.pending until one is chosen.
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  function on() { return !!SR.features.perks; }

  /** @returns {string[]} the ids of the registered perks of a stat and level, in registration order. */
  function optionsFor(stat, level) {
    return SR.registry.entries('perk')
      .filter(function (e) { return e.def.stat === stat && e.def.level === level; })
      .map(function (e) { return e.id; });
  }

  /** @returns {boolean} the milestone was offered already (it is pending, or one of its perks is owned). */
  function offered(s, stat, level) {
    var p = s.perks;
    if (p.pending.some(function (o) { return o.stat === stat && o.level === level; })) return true;
    return optionsFor(stat, level).some(function (id) { return p.owned.indexOf(id) >= 0; });
  }

  /**
   * Queues an offer for every milestone the stats have reached and that was never offered (called
   * by SR.rules.stats.add after a gain). Nothing happens while the `perks` flag is off.
   * @returns {object[]} the new offers { stat, level, options: [a, b] }
   */
  function update(s) {
    if (!on()) return [];
    var added = [];
    SR.rules.stats.KEYS.forEach(function (stat) {
      SR.tuning.perks.levels.forEach(function (level) {
        if (s.stats[stat] < level || offered(s, stat, level)) return;
        var options = optionsFor(stat, level);
        if (!options.length) return;
        var o = { stat: stat, level: level, options: options };
        s.perks.pending.push(o);
        added.push(SR.util.clone(o));
      });
    });
    return added;
  }

  /** @returns {object[]} a copy of the pending offers [{ stat, level, options }] (empty while `perks` is off). */
  function offers(s) {
    return on() ? SR.util.clone(s.perks.pending) : [];
  }

  /**
   * Picks one perk of a pending offer; the offer closes and the perk is kept forever.
   * @returns {{ok: boolean, reason: (string|undefined), id: string, stat: string, level: number}}
   */
  function choose(s, id) {
    if (!on()) return { ok: false, reason: 'reason.featureOff' };
    var i = -1;
    s.perks.pending.some(function (o, j) { if (o.options.indexOf(id) >= 0) { i = j; return true; } return false; });
    if (i < 0) return { ok: false, reason: 'reason.perkNotOffered', vars: { id: id } };
    var o = s.perks.pending.splice(i, 1)[0];
    s.perks.owned.push(id);
    return { ok: true, id: id, stat: o.stat, level: o.level };
  }

  /** @returns {boolean} the perk is owned (and the `perks` flag is on). */
  function has(s, id) {
    return on() && !!s.perks && s.perks.owned.indexOf(id) >= 0;
  }

  // Data can choose a perk through an action: ['fn', 'perks.choose'] with params.id (W3-Prog's card).
  SR.def.fn('perks.choose', function (s, params) {
    var r = choose(s, params && params.id);
    return r.ok ? {} : { ok: false, reason: r.reason, vars: r.vars };
  });

  SR.rules.perks = { offers: offers, choose: choose, has: has, update: update, optionsFor: optionsFor };
})();
