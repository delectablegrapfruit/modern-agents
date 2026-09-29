// js/rules/effects.js — owner: W1-R. SR.rules.effects: every action effect of ARCHITECTURE §6.4
// (CONTRACT §8.4). An effect is an array [name, ...args] run against the state by the action
// pipeline (js/rules/act.js), which passes a context `ctx` and the Result `res` being built.
// Stat changes go through SR.rules.stats; money through the hard money rule and the lien.
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // Numbers the rules need that BALANCE does not tabulate (docs/requests/W1-R.md asks to move them):
  var MSG_MAX = 150;         // ARCHITECTURE §15: the inbox holds at most 150 messages
  var STAMP_MIN_GAIN = 2;    // UI §4.3: a Stamp plays for stat gains ≥ 2
  var MAX_DEPTH = 16;        // nested check / chance / fn lists (a guard against data loops)

  // The Result.msgs / Result.log entries that addMsg / addLog have delivered to the state already.
  // A named fn may return the partial Result of effects.run(s, list, ctx) (W1-W's world fns do);
  // merge then reports those entries without delivering them a second time.
  var delivered = new WeakSet();

  function cond() { return SR.rules.conditions; }
  function num(s, v, ctx) { return cond().num(s, v, ctx); }

  /** @returns {object} a (dotted) counter bag's parent and key for daily / weekly / records paths. */
  function slot(obj, p) {
    var parts = String(p).split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      if (!SR.util.isObject(obj[parts[i]])) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    return { obj: obj, key: parts[parts.length - 1] };
  }
  function inc(obj, p, n) {
    var t = slot(obj, p);
    t.obj[t.key] = (Number(t.obj[t.key]) || 0) + n;
  }

  /**
   * Credits or debits cash or bank. Positive income from a lien source (B-09: wage, rent, salary,
   * interest, deal, tour, loot, win, prize) sends half (rounded half up) to money.lien while it is
   * > 0. A debit never takes the balance below 0 (the hard money rule; forced charges use charge).
   * @returns {number} the amount that reached the balance
   */
  function credit(s, field, n, src) {
    var m = s.money;
    n = Math.round(Number(n) || 0);
    if (n > 0) {
      var D = SR.tuning.bank.default;
      if (src && m.lien > 0 && D.lienSources.indexOf(src) >= 0) {
        var toLien = Math.min(m.lien, Math.floor(n * D.lienShare + 0.5));
        m.lien -= toLien;
        n -= toLien;
      }
      m[field] += n;
      return n;
    }
    var take = Math.min(m[field], -n);
    m[field] -= take;
    return -take;
  }

  /**
   * A forced charge (hospital bill, tow, fight tab, mugging, goons, seizure, fine): cash first, then
   * the bank, any shortfall written off (B-09 `charge`). Goes through SR.rules.bank.charge (W1-E), or
   * the named fn 'bank.charge'; before either is loaded, the same rule is applied here.
   * @returns {{paid: number, writtenOff: number}}
   */
  function charge(s, n, reason, ctx, res) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (!n) return { paid: 0, writtenOff: 0 };
    var r;
    if (SR.rules.bank && typeof SR.rules.bank.charge === 'function') r = SR.rules.bank.charge(s, n, reason);
    else if (typeof SR.reg.fn['bank.charge'] === 'function') r = SR.reg.fn['bank.charge'](s, ctx.params || {}, ctx, n, reason);
    else {
      SR.util.warnOnce('fx.charge', 'SR.rules.effects: SR.rules.bank.charge is not loaded yet; charging cash then bank here');
      var fromCash = Math.min(s.money.cash, n);
      s.money.cash -= fromCash;
      var fromBank = Math.min(s.money.bank, n - fromCash);
      s.money.bank -= fromBank;
      r = { paid: fromCash + fromBank, writtenOff: n - fromCash - fromBank };
    }
    if (isPartial(r)) merge(s, r, ctx, res);
    else if (r && r.writtenOff > 0) {
      res.toasts.push({ key: 'toast.act.writtenOff', vars: { n: r.writtenOff, money: SR.text.money(r.writtenOff), reason: reason || null }, kind: 'warning' });
    }
    return r && typeof r.paid === 'number' ? { paid: r.paid, writtenOff: r.writtenOff || 0 } : { paid: 0, writtenOff: 0 };
  }

  /** @returns {number} the next message id (ids only grow; the newest message is never pruned). */
  function nextMsgId(s) {
    var max = 0;
    for (var i = 0; i < s.msgs.length; i++) if (typeof s.msgs[i].id === 'number' && s.msgs[i].id > max) max = s.msgs[i].id;
    return max + 1;
  }

  /**
   * Keeps the inbox at 150 (ARCHITECTURE §15): drop the oldest read message that is not archived,
   * then the oldest read archived one; unread messages go only when nothing else is left.
   */
  function pruneMsgs(s) {
    var m = s.msgs;
    while (m.length > MSG_MAX) {
      var i = m.findIndex(function (x) { return x.read && !x.archived; });
      if (i < 0) i = m.findIndex(function (x) { return x.read; });
      if (i < 0) i = 0;
      m.splice(i, 1);
    }
  }

  /**
   * Delivers a message (a voicemail) to the inbox.
   * @param {string} key a text key (vm.<npc>.*); `from` defaults to its second segment
   * @returns {object} the message
   */
  function addMsg(s, key, vars, res) {
    var parts = String(key).split('.');
    var from = vars && vars.from ? vars.from : parts[0] === 'vm' && parts[1] ? parts[1] : parts[0];
    var msg = { id: nextMsgId(s), from: from, key: key, vars: vars ? SR.util.clone(vars) : {}, day: s.clock.day, read: false, archived: false };
    s.msgs.push(msg);
    pruneMsgs(s);
    if (res) {
      var entry = { key: key, vars: msg.vars };
      delivered.add(entry);
      res.msgs.push(entry);
    }
    return msg;
  }

  /** Adds to the daily log (weight from B-29) and reports the entry in the Result. */
  function addLog(s, kind, vars, res) {
    var e = SR.rules.log.add(s, kind, vars);
    if (e && res) {
      var entry = SR.util.clone(e);
      delivered.add(entry);
      res.log.push(entry);
    }
    return e;
  }

  var RESULT_FIELDS = ['ok', 'deltas', 'msgs', 'toasts', 'stamps', 'sfx', 'anims', 'achievements', 'events', 'log', 'open', 'down', 'jailed', 'over', 'report', 'chance'];
  /** @returns {boolean} v looks like a partial Result returned by a named fn. */
  function isPartial(v) {
    return SR.util.isObject(v) && RESULT_FIELDS.some(function (k) { return hasOwn.call(v, k); });
  }

  /**
   * Merges a named fn's partial Result into the Result (ARCHITECTURE §6.4 / CONTRACT §8.5):
   * `ok: false` refuses the whole action (the pipeline rolls the state back); msgs and log entries
   * are delivered (added to the state) here, so a fn returns them instead of adding them itself
   * (entries that effects.run delivered already, in a partial Result it built, are only reported);
   * toasts, stamps, sfx, anims, achievements and events are appended; open, down, jailed, over
   * and report are set. `deltas` are ignored: the pipeline computes deltas from the state.
   */
  function merge(s, r, ctx, res) {
    if (!r) return;
    if (r.ok === false) { ctx.refused = { reason: r.reason || 'reason.unavailable', vars: r.vars || {} }; return; }
    (r.msgs || []).forEach(function (m) {
      if (m && delivered.has(m)) res.msgs.push(m);
      else addMsg(s, m.key, m.vars, res);
    });
    (r.log || []).forEach(function (l) {
      if (l && delivered.has(l)) res.log.push(l);
      else addLog(s, l.kind, l.vars, res);
    });
    ['toasts', 'stamps', 'sfx', 'anims', 'achievements', 'events'].forEach(function (k) {
      if (Array.isArray(r[k])) Array.prototype.push.apply(res[k], r[k]);
    });
    ['open', 'down', 'jailed', 'over', 'report'].forEach(function (k) {
      if (r[k] !== undefined && r[k] !== null) res[k] = r[k];
    });
    if (typeof r.chance === 'number' && ctx.preview && typeof ctx.chance !== 'number') ctx.chance = r.chance;
  }

  function note(ctx, key) { if (ctx.notes) ctx.notes[key] = true; }
  function hasToast(res, key) { return res.toasts.some(function (t) { return t.key === key; }); }

  /** Runs a nested effect list (check / chance branches) with a depth guard. */
  function nested(s, list, ctx, res) {
    ctx.depth = (ctx.depth || 0) + 1;
    if (ctx.depth > MAX_DEPTH) throw new Error('SR.rules.effects: effect lists nested deeper than ' + MAX_DEPTH + ' (' + ctx.id + ')');
    run(s, list, ctx, res);
    ctx.depth--;
  }

  var E = {
    /** cash(n, src): a credit (income src passes through the lien) or a debit (never below 0). */
    cash: function (s, a, ctx) { credit(s, 'cash', num(s, a[0], ctx), a[1]); },
    bank: function (s, a, ctx) { credit(s, 'bank', num(s, a[0], ctx), a[1]); },
    /** charge(n, reason): a forced charge (cash → bank → written off). */
    charge: function (s, a, ctx, res) { charge(s, num(s, a[0], ctx), a[1], ctx, res); },
    /** heal(n): up to HP max; food of the eat group heals ×1.25 with Iron Stomach (B-06, B-21). */
    heal: function (s, a, ctx) {
      var n = num(s, a[0], ctx);
      if (ctx.def && ctx.def.group === 'eat' && SR.rules.perks.has(s, 'ironStomach')) n = Math.floor(n * SR.tuning.items.ironStomach);
      var got = SR.rules.stats.heal(s, n);
      if (got < n) note(ctx, 'hp');
    },
    /** hurt(n, cause): HP loss (Hard Landing caps falls and car hits at 5; Heat Wave ×1.5 on training and work). */
    hurt: function (s, a, ctx) {
      var n = num(s, a[0], ctx), cause = a[1] || 'other';
      if ((cause === 'fall' || cause === 'carHit') && SR.rules.perks.has(s, 'hardLanding')) n = Math.min(n, SR.tuning.perks.hardLanding.damage);
      if (ctx.hpScale && ctx.hpScale !== 1) n = Math.ceil(n * ctx.hpScale);
      if (SR.rules.stats.hurt(s, n, cause) > 0) ctx.cause = cause;
    },
    /** stat(key, n, src): a stat gain through SR.rules.stats.add (src default 'train'). */
    stat: function (s, a, ctx, res) {
      var key = a[0], n = num(s, a[1], ctx), src = a[2];
      if (SR.rules.stats.KEYS.indexOf(key) < 0) { SR.rules.stats.add(s, key, n, src); return; }
      var g = SR.rules.stats.gain(s, key, n, src);
      var applied = SR.rules.stats.add(s, key, n, src);
      if (g.capped) {
        note(ctx, 'stat:' + key);
        if (!hasToast(res, 'toast.stats.maxed')) res.toasts.push({ key: 'toast.stats.maxed', vars: { stat: cond().label(key), cap: SR.tuning.start.statCap }, kind: 'info' });
      }
      if (g.winded && n > 0 && !hasToast(res, 'toast.stats.winded')) res.toasts.push({ key: 'toast.stats.winded', vars: {}, kind: 'warning' });
      if (applied >= STAMP_MIN_GAIN) res.stamps.push({ key: 'stamp.stats.' + key, vars: { n: applied } });
    },
    karma: function (s, a, ctx) { SR.rules.stats.karma(s, num(s, a[0], ctx)); },
    heat: function (s, a, ctx) { SR.rules.stats.heat(s, num(s, a[0], ctx)); },
    buzz: function (s, a, ctx) { SR.rules.stats.buzz(s, num(s, a[0], ctx)); },
    /**
     * item(key, n, value): adds or removes items, never below 0 nor above the B-06 stack. List items
     * (takeout, scraps, diplomas) push `value` n times, or remove n entries (that value first).
     */
    item: function (s, a, ctx) {
      var key = a[0], n = Math.round(num(s, a[1] === undefined ? 1 : a[1], ctx));
      var cur = s.items[key];
      if (Array.isArray(cur)) {
        if (n > 0) for (var i = 0; i < n; i++) cur.push(a[2] === undefined ? null : a[2]);
        else for (var j = 0; j < -n && cur.length; j++) {
          var at = a[2] === undefined ? -1 : cur.indexOf(a[2]);
          cur.splice(at < 0 ? cur.length - 1 : at, 1);
        }
        return;
      }
      var row = SR.tuning.items[key], cap = row && row.stack > 0 ? row.stack : Infinity;
      var next = SR.util.clamp((Number(cur) || 0) + n, 0, cap);
      if (next < (Number(cur) || 0) + n && n > 0) note(ctx, 'item:' + key);
      s.items[key] = next;
    },
    flag: function (s, a) { s.flags[a[0]] = a.length > 1 ? a[1] : true; },
    time: function (s, a, ctx) { SR.rules.time.spend(s, num(s, a[0], ctx)); },
    setTime: function (s, a, ctx) { SR.rules.time.setTo(s, num(s, a[0], ctx)); },
    daily: function (s, a, ctx) { inc(s.daily, a[0], a[1] === undefined ? 1 : num(s, a[1], ctx)); },
    weekly: function (s, a, ctx) { inc(s.weekly, a[0], a[1] === undefined ? 1 : num(s, a[1], ctx)); },
    record: function (s, a, ctx) { inc(s.records, a[0], a[1] === undefined ? 1 : num(s, a[1], ctx)); },
    msg: function (s, a, ctx, res) { addMsg(s, a[0], a[1], res); },
    /** toast(key, vars, kind): info | reward | warning | achievement. */
    toast: function (s, a, ctx, res) { res.toasts.push({ key: a[0], vars: a[1] ? SR.util.clone(a[1]) : {}, kind: a[2] || 'info' }); },
    stamp: function (s, a, ctx, res) { res.stamps.push({ key: a[0], vars: a[1] ? SR.util.clone(a[1]) : {} }); },
    sfx: function (s, a, ctx, res) { res.sfx.push(a[0]); },
    anim: function (s, a, ctx, res) { res.anims.push(a[0]); },
    /** achievement(id): unlocks once per run (P1 `achievements`; never on a cheat run). */
    achievement: function (s, a, ctx, res) {
      if (!SR.features.achievements || s.mode.cheat) return;
      if (s.achievements[a[0]] !== undefined) return;
      s.achievements[a[0]] = s.clock.day;
      res.achievements.push(a[0]);
    },
    npcStage: function (s, a) {
      if (!SR.util.isObject(s.npc[a[0]])) s.npc[a[0]] = {};
      s.npc[a[0]].stage = a[1];
    },
    /** open(skin, params): the row opens a minigame; the building runs it, then '<id>:resolve' (D29). */
    open: function (s, a, ctx, res) {
      res.open = { minigame: a[0], skin: a[0], params: a[1] ? SR.util.clone(a[1]) : {}, resolve: ctx.id ? ctx.id + ':resolve' : null };
    },
    /** emit(name, payload): a rule event (ARCHITECTURE §6.8), re-emitted on SR.events by SR.act. */
    emit: function (s, a, ctx, res) { res.events.push({ name: a[0], payload: a[1] ? SR.util.clone(a[1]) : {} }); },
    log: function (s, a, ctx, res) { addLog(s, a[0], a[1], res); },
    /** jail(reason): through SR.rules.crime.jail (W1-C); sets Result.jailed and the `jail` event. */
    jail: function (s, a, ctx, res) {
      var reason = a[0], C = SR.rules.crime;
      if (!C || typeof C.jail !== 'function') {
        SR.util.warnOnce('fx.jail', 'SR.rules.effects: jail needs SR.rules.crime.jail (not loaded yet)');
        return;
      }
      var r = C.jail(s, reason);
      if (isPartial(r)) merge(s, r, ctx, res);
      var days = typeof r === 'number' ? r : r && typeof r.days === 'number' ? r.days : s.jail && s.jail.daysLeft ? s.jail.daysLeft : 0;
      if (!res.jailed) res.jailed = { reason: reason, days: days };
      if (!res.events.some(function (e) { return e.name === 'jail'; })) res.events.push({ name: 'jail', payload: { reason: reason, days: res.jailed.days } });
    },
    /**
     * check(checkId, stat, D, winEffects, loseEffects): a stat check with the B-28b modifiers,
     * rolled on ctx.rng. A preview records the chance and shows the win branch.
     */
    check: function (s, a, ctx, res) {
      var p = SR.rules.check.chance(s.stats[a[1]], num(s, a[2], ctx), { s: s, checkId: a[0], ctx: ctx });
      if (ctx.preview) {
        if (!(typeof ctx.chance === 'number')) ctx.chance = p;
        nested(s, a[3], ctx, res);
        return;
      }
      nested(s, SR.rules.check.roll(ctx.rng, p) ? a[3] : a[4], ctx, res);
    },
    /** chance(p, aEffects, bEffects): aEffects with probability p, else bEffects. */
    chance: function (s, a, ctx, res) {
      var p = num(s, a[0], ctx);
      if (ctx.preview) {
        if (!(typeof ctx.chance === 'number')) ctx.chance = p;
        nested(s, a[1], ctx, res);
        return;
      }
      nested(s, SR.rules.check.roll(ctx.rng, p) ? a[1] : a[2], ctx, res);
    },
    /** fn(name, ...args): a named fn (s, params, ctx, ...args) → a partial Result (merged). */
    fn: function (s, a, ctx, res) {
      var f = SR.reg.fn[a[0]];
      if (typeof f !== 'function') {
        SR.util.warnOnce('fx.fn:' + a[0], 'SR.rules.effects: named fn "' + a[0] + '" is not registered');
        ctx.refused = { reason: 'reason.unavailable', vars: {} };
        return;
      }
      merge(s, f.apply(null, [s, ctx.params || {}, ctx].concat(a.slice(1))), ctx, res);
    },
  };

  /**
   * Runs one effect.
   * @param {object} s state
   * @param {Array} eff [name, ...args]
   * @param {object} ctx the pipeline context (id, def, params, rng, preview, notes, chance, ...)
   * @param {object} res the Result being built
   */
  function one(s, eff, ctx, res) {
    var name = Array.isArray(eff) ? eff[0] : eff;
    if (!hasOwn.call(E, name)) {
      SR.util.warnOnce('fx:' + name, 'SR.rules.effects: unknown effect "' + name + '" (' + (ctx.id || 'no action') + ')');
      return;
    }
    E[name](s, Array.isArray(eff) ? eff.slice(1) : [], ctx, res);
  }

  /** @returns {object} an empty partial Result for effects run outside the action pipeline. */
  function partial() {
    return { deltas: [], msgs: [], toasts: [], stamps: [], sfx: [], anims: [], achievements: [], events: [], log: [],
      open: null, down: null, jailed: null, over: null };
  }

  /**
   * Runs an effect list in order; stops when a named fn refused (ctx.refused).
   * Outside the pipeline (the night's arc effects, a named fn) call it as run(s, list, ctx): it then
   * builds and returns a partial Result (ok: false with the reason if a named fn refused; the
   * caller owns any rollback). ctx needs at least { rng }; params default to {}.
   * @returns {object} res
   */
  function run(s, list, ctx, res) {
    var own = !res;
    if (own) res = partial();
    ctx = ctx || { rng: SR.rng.rules };
    list = list || [];
    for (var i = 0; i < list.length && !ctx.refused; i++) one(s, list[i], ctx, res);
    if (own && ctx.refused) { res.ok = false; res.reason = ctx.refused.reason; res.vars = ctx.refused.vars; }
    return res;
  }

  SR.rules.effects = {
    /** The effect names of ARCHITECTURE §6.4 (the validator checks data against them). */
    names: Object.keys(E),
    run: run,
    partial: partial,
    one: one,
    merge: merge,
    isPartial: isPartial,
    credit: credit,
    charge: charge,
    addMsg: addMsg,
    pruneMsgs: pruneMsgs,
    MSG_MAX: MSG_MAX,
  };
})();
