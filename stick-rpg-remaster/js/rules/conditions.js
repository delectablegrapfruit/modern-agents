// js/rules/conditions.js — owner: W1-R. SR.rules.conditions: every action condition of
// ARCHITECTURE §6.4 (CONTRACT §8.4). A condition is an array [name, ...args] and returns
// { ok, reason, vars }; reason is a text key reason.* (en-prog.js) and vars its display values.
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  function yes() { return { ok: true, reason: null, vars: null }; }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  /**
   * Resolves a numeric argument: a number, or the name of a named fn (SR.def.fn) returning one.
   * @returns {number}
   */
  function num(s, v, ctx) {
    if (typeof v === 'string' && hasOwn.call(SR.reg.fn, v)) {
      ctx = ctx || {};
      return Number(SR.reg.fn[v](s, ctx.params || {}, ctx)) || 0;
    }
    return Number(v) || 0;
  }

  /** @returns {number} how many of an item the player holds (list items count their entries). */
  function count(s, key) {
    var v = s.items ? s.items[key] : 0;
    if (Array.isArray(v)) return v.length;
    return typeof v === 'number' ? v : v ? 1 : 0;
  }

  /** @returns {*} the value at a dotted path of an object (undefined when absent). */
  function path(obj, p) {
    var parts = String(p).split('.');
    for (var i = 0; i < parts.length && obj !== undefined && obj !== null; i++) obj = obj[parts[i]];
    return obj;
  }

  /**
   * A display name for a registered id, for reason vars: the def's name / label / title text key,
   * else <prefix>.<id>.name or <prefix>.<id> when registered, else the id itself.
   * @returns {string}
   */
  function nameOf(kind, id, prefix) {
    var def = SR.reg[kind] && SR.reg[kind][id];
    var keys = [def && def.name, def && def.label, def && def.title, (prefix || kind) + '.' + id + '.name', (prefix || kind) + '.' + id];
    for (var i = 0; i < keys.length; i++) {
      if (typeof keys[i] === 'string' && SR.text.has(keys[i])) return SR.text(keys[i]);
    }
    return String(id);
  }

  /** @returns {string} a stat's short label for reasons (STR, INT, CHA, HP max, ...). */
  function label(key) {
    return SR.text.has('reason.stat.' + key) ? SR.text('reason.stat.' + key) : String(key).toUpperCase();
  }

  function list(v) { return Array.isArray(v) ? v : [v]; }

  /** @returns {boolean} the player holds this job in any track (or 'office' while in office). */
  function holds(s, id) {
    if (id === 'office') return !!s.job.office;
    var r = s.job.ranks;
    return Object.keys(r).some(function (t) { return r[t] === id; });
  }

  /** @returns {number} the rank index of a job within its ladder (-1 if not on one). */
  function rankIndex(id) {
    var row = SR.tuning.jobs[id], ladder = row && SR.tuning.jobs.ladder[row.track];
    return ladder ? ladder.indexOf(id) : -1;
  }

  /** @returns {number} a home tier: the index of a home id in B-08 order, or a number as is. */
  function homeTierOf(v) {
    return typeof v === 'number' ? v : SR.tuning.homes.order.indexOf(v);
  }

  var C = {
    /** The wall: now + the action's time cost ≤ 24:00 (GDD §4.1). */
    timeFits: function (s, a, ctx) {
      var min = ctx.cost ? ctx.cost.min : 0;
      return SR.rules.time.canStart(s, min) ? yes() : no('reason.tooLate', { time: SR.rules.time.fmt(SR.tuning.time.dayEnd) });
    },
    cashAtLeast: function (s, a, ctx) {
      var n = num(s, a[0], ctx);
      return s.money.cash >= n ? yes() : no('reason.needCash', { n: n, money: SR.text.money(n) });
    },
    hpBelowMax: function (s) { return s.stats.hp < s.stats.hpMax ? yes() : no('reason.fullHp'); },
    /** A voluntary HP cost c needs HP > c (B-31); Heat Wave scales c for training and work (ctx.hpScale). */
    hpAbove: function (s, a, ctx) {
      var c = num(s, a[0], ctx);
      if (ctx.hpScale && ctx.hpScale !== 1) c = Math.ceil(c * ctx.hpScale);
      return s.stats.hp > c ? yes() : no('reason.tooHurt', { n: c });
    },
    stat: function (s, a) {
      var v = s.stats[a[0]];
      return v >= a[1] ? yes() : no('reason.needStat', { stat: label(a[0]), min: a[1], have: v });
    },
    statBelow: function (s, a) {
      var v = s.stats[a[0]];
      return v < a[1] ? yes() : no('reason.statAbove', { stat: label(a[0]), max: a[1], have: v });
    },
    karma: function (s, a) {
      var k = s.stats.karma;
      if (a[0] !== null && a[0] !== undefined && k < a[0]) return no('reason.karmaLow', { min: a[0], have: k });
      if (a[1] !== null && a[1] !== undefined && k > a[1]) return no('reason.karmaHigh', { max: a[1], have: k });
      return yes();
    },
    item: function (s, a) {
      var n = a[1] === undefined ? 1 : a[1], have = count(s, a[0]);
      if (have >= n) return yes();
      return no(n > 1 ? 'reason.needItems' : 'reason.needItem', { item: nameOf('item', a[0]), n: n, have: have });
    },
    noItem: function (s, a) { return count(s, a[0]) === 0 ? yes() : no('reason.haveItem', { item: nameOf('item', a[0]) }); },
    flag: function (s, a) { return s.flags[a[0]] ? yes() : no('reason.notYet'); },
    notFlag: function (s, a) { return s.flags[a[0]] ? no('reason.alreadyDone') : yes(); },
    feature: function (s, a) { return SR.features[a[0]] ? yes() : no('reason.featureOff'); },
    job: function (s, a) { return holds(s, a[0]) ? yes() : no('reason.needJob', { job: nameOf('job', a[0]) }); },
    jobTrack: function (s, a) {
      var ok = a[0] === 'city' ? !!s.job.office : s.job.ranks[a[0]] !== null && s.job.ranks[a[0]] !== undefined;
      return ok ? yes() : no('reason.staffOnly', { place: nameOf('building', a[0], 'place') });
    },
    jobAtLeast: function (s, a) {
      var id = a[0], row = SR.tuning.jobs[id], ok;
      if (id === 'office' || (row && row.track === 'city')) ok = !!s.job.office;
      else ok = !!row && rankIndex(s.job.ranks[row.track]) >= rankIndex(id);
      return ok ? yes() : no('reason.needJob', { job: nameOf('job', id) });
    },
    homeTier: function (s, a) {
      return homeTierOf(s.homes.living) >= homeTierOf(a[0]) ? yes() : no('reason.needHome');
    },
    livesIn: function (s, a) { return s.homes.living === a[0] ? yes() : no('reason.notLivingHere'); },
    owns: function (s, a) { return s.homes.owned.indexOf(a[0]) >= 0 ? yes() : no('reason.notOwned'); },
    furniture: function (s, a) {
      var tier = s.furniture.owned[a[0]] || 0, need = a[1] === undefined ? 1 : a[1];
      return tier >= need ? yes() : no('reason.needFurniture', { furn: nameOf('furniture', a[0], 'furn') });
    },
    freeSlots: function (s, a) {
      var H = SR.rules.homes, n = a[0] === undefined ? 1 : a[0];
      if (!H || typeof H.slots !== 'function' || typeof H.slotsUsed !== 'function') {
        SR.util.warnOnce('cond.freeSlots', 'SR.rules.conditions: freeSlots needs SR.rules.homes (not loaded yet); allowed');
        return yes();
      }
      return H.slots(s) - H.slotsUsed(s) >= n ? yes() : no('reason.noSlots');
    },
    weekday: function (s, a) {
      var today = SR.rules.time.weekday(s);
      var ok = list(a[0]).some(function (d) { return SR.rules.time.dayIndex(d) === today; });
      return ok ? yes() : no('reason.wrongDay');
    },
    /** A window: the action may start when a ≤ now < b. */
    timeBetween: function (s, a) {
      var now = s.clock.min;
      if (now < a[0]) return no('reason.notBefore', { time: SR.rules.time.fmt(a[0]) });
      if (now >= a[1]) return no('reason.notAfter', { time: SR.rules.time.fmt(a[1]) });
      return yes();
    },
    /** Today's weather is one of the list; while the `weather` flag is off it is always Clear (B-19). */
    weather: function (s, a) {
      var w = SR.features.weather ? s.world.weather : SR.tuning.weather.day1;
      return list(a[0]).indexOf(w) >= 0 ? yes() : no('reason.weather');
    },
    heat: function (s, a) {
      var h = s.stats.heat;
      if (a[0] !== null && a[0] !== undefined && h < a[0]) return no('reason.heatLow', { min: a[0], have: h });
      if (a[1] !== null && a[1] !== undefined && h > a[1]) return no('reason.heatHigh', { max: a[1], have: h });
      return yes();
    },
    buzzBelow: function (s, a) { return s.stats.buzz < a[0] ? yes() : no('reason.tooBuzzed'); },
    dailyBelow: function (s, a) { return (Number(path(s.daily, a[0])) || 0) < a[1] ? yes() : no('reason.dailyLimit'); },
    weeklyBelow: function (s, a) { return (Number(path(s.weekly, a[0])) || 0) < a[1] ? yes() : no('reason.weeklyLimit'); },
    npcStage: function (s, a) {
      var n = s.npc[a[0]];
      return n && list(a[1]).indexOf(n.stage) >= 0 ? yes() : no('reason.notNow');
    },
    election: function (s, a) { return list(a[0]).indexOf(s.election.status) >= 0 ? yes() : no('reason.notNow'); },
    perk: function (s, a) {
      return SR.rules.perks && SR.rules.perks.has(s, a[0]) ? yes() : no('reason.needPerk', { perk: nameOf('perk', a[0]) });
    },
    difficulty: function (s, a) { return list(a[0]).indexOf(s.mode.difficulty) >= 0 ? yes() : no('reason.difficulty'); },
    phone: function (s) { return count(s, 'phone') > 0 ? yes() : no('reason.needPhone'); },
    /** The week's city event is today (P1 `calendar`). */
    cityEvent: function (s, a) {
      var ev = s.world.cityEvent;
      return SR.features.calendar && ev && ev.id === a[0] && ev.day === s.clock.day ? yes() : no('reason.noEvent');
    },
    not: function (s, a, ctx) { return evalOne(s, a[0], ctx).ok ? no('reason.unavailable') : yes(); },
    any: function (s, a, ctx) {
      var first = null, conds = a[0] || [];
      for (var i = 0; i < conds.length; i++) {
        var r = evalOne(s, conds[i], ctx);
        if (r.ok) return r;
        if (!first) first = r;
      }
      return first || yes();
    },
    all: function (s, a, ctx) { return all(s, a[0] || [], ctx); },
    /** A named fn used as a condition: (s, params, ctx, ...args) → { ok, reason?, vars? } or a boolean. */
    fn: function (s, a, ctx) {
      var name = a[0], f = SR.reg.fn[name];
      if (typeof f !== 'function') {
        SR.util.warnOnce('cond.fn:' + name, 'SR.rules.conditions: named fn "' + name + '" is not registered');
        return no('reason.unavailable');
      }
      var r = f.apply(null, [s, ctx.params || {}, ctx].concat(a.slice(1)));
      if (r === true || r === undefined || r === null) return yes();
      if (r === false) return no('reason.unavailable');
      return r.ok === false ? no(r.reason || 'reason.unavailable', r.vars) : yes();
    },
  };

  /**
   * Evaluates one condition.
   * @param {object} s state
   * @param {Array|string} cond [name, ...args] (a bare name for conditions without arguments)
   * @param {object=} ctx { params, cost, hpScale, def, ... } from the action pipeline
   * @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  function evalOne(s, cond, ctx) {
    ctx = ctx || {};
    var name = Array.isArray(cond) ? cond[0] : cond;
    var args = Array.isArray(cond) ? cond.slice(1) : [];
    if (!hasOwn.call(C, name)) {
      SR.util.warnOnce('cond:' + name, 'SR.rules.conditions: unknown condition "' + name + '"');
      return no('reason.unavailable');
    }
    return C[name](s, args, ctx);
  }

  /** @returns {{ok: boolean, reason: (string|null), vars: (object|null)}} the first failure of a list, or ok. */
  function all(s, conds, ctx) {
    conds = conds || [];
    for (var i = 0; i < conds.length; i++) {
      var r = evalOne(s, conds[i], ctx);
      if (!r.ok) return r;
    }
    return yes();
  }

  SR.rules.conditions = {
    /** The condition names of ARCHITECTURE §6.4 (the validator checks data against them). */
    names: Object.keys(C),
    eval: evalOne,
    all: all,
    // Helpers shared with effects.js and act.js.
    num: num,
    count: count,
    path: path,
    nameOf: nameOf,
    label: label,
    holds: holds,
    rankIndex: rankIndex,
  };

  // Named conditions used by the price modifier rows of B-28a (js/data/tuning.js priceMods).
  /** The action's params carry key = value (the Takeout variant: variant = 'takeout'). */
  SR.def.fn('mods.param', function (s, params, ctx, key, value) {
    return { ok: !!params && params[key] === value };
  });
  /** A decree is active (Beer Subsidy, Free Fries Friday, Sky Bus Nationalised). */
  SR.def.fn('mods.decree', function (s, params, ctx, id) {
    return { ok: !!(s.election && s.election.decrees && s.election.decrees.indexOf(id) >= 0) };
  });
  /** The number at a dotted state path is ≥ n (Red's loyalty at 100 g; New Guy once Red is turned in). */
  SR.def.fn('mods.atLeast', function (s, params, ctx, p, n) {
    return { ok: (Number(path(s, p)) || 0) >= n };
  });
})();
