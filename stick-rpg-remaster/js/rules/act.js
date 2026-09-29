// js/rules/act.js — owner: W2-RulesE (W1-R in wave 1). The action pipeline (ARCHITECTURE §6.2, §6.10; CONTRACT §8):
// SR.rules.act.{run, preview, price} (pure forms on a state) and SR.act / SR.preview (on SR.state,
// emitting the rule and UI events of CONTRACT §8.7 on SR.events). Still free of browser APIs.
//
// run: look up → feature flag → `requires` in order → the time rule → price (§6.10) and cash →
// cost (cash, time, HP, items) → `effects` in order → each rule event to SR.rules.arcs.onEvent →
// HP ≤ 0 → SR.rules.health.down → deltas → Result. A named fn that refuses (ok: false) rolls the
// whole action back. preview: the same checks, then a dry run on a copy of the state with a
// neutral random stream (the real rules stream and SR.state are never touched).
(function () {
  'use strict';
  var SR = window.SR;

  var GROUPS = ['eat', 'buy', 'work', 'train', 'services', 'crime', 'special'];   // card order (UI §5.6)
  var MAX_ARC_EVENTS = 64;   // rule events passed to the arcs per action (a guard against loops)

  function C() { return SR.rules.conditions; }

  // --------------------------------------------------------------------------------------------
  // Results

  /** @returns {object} an empty Result (CONTRACT §8.3) for action id. */
  function makeResult(id) {
    return {
      ok: true, id: id, reason: null, vars: null, deltas: [], msgs: [], toasts: [], stamps: [], sfx: [],
      anims: [], achievements: [], open: null, events: [], log: [], down: null, jailed: null, over: null,
    };
  }

  /** @returns {object} a refusal Result: nothing changed. */
  function refusal(id, reason, vars) {
    var r = makeResult(id);
    r.ok = false;
    r.reason = reason;
    r.vars = vars || {};
    return r;
  }

  // --------------------------------------------------------------------------------------------
  // Prices (§6.10, B-28a)

  function modValue(row, s, ctx) {
    if (typeof row.value === 'string') {
      var f = SR.reg.fn[row.value];
      if (typeof f !== 'function') {
        SR.util.warnOnce('price.fn:' + row.value, 'SR.rules.act.price: named fn "' + row.value + '" of modifier "' + row.id + '" is not registered');
        return row.kind === 'markup' ? 1 : 0;
      }
      return Number(f(s, (ctx && ctx.params) || {}, ctx || {})) || 0;
    }
    return Number(row.value) || 0;
  }

  /**
   * The price of something after the modifiers of B-28a, in their fixed order: (1) markups (×) then
   * surcharges (+) on the base; (2) fixed prices: the minimum of the price and each applicable fixed
   * price; (3) percent discounts: only the largest applies (on a tie, one that uses nothing up);
   * (4) round half up to whole dollars, minimum $0. A `consume` row is used up only if applied.
   * @param {object} s state
   * @param {number} base the base price
   * @param {string} target the price target ('food.mcsticks.fries', 'item.bar.beer', ...)
   * @param {object=} ctx the pipeline context (params, for rows that read them)
   * @returns {{price: number, applied: string[], consumes: (null|{id: string, item: string, n: number})}}
   */
  function price(s, base, target, ctx) {
    ctx = ctx || {};
    var K = SR.rules.check;
    var rows = SR.tuning.priceMods.filter(function (r) {
      return K.matchAny(r.targets, target, r.except) && K.rowApplies(r, s, ctx);
    });
    var p = Number(base) || 0, applied = [], consumes = null;
    rows.forEach(function (r) { if (r.kind === 'markup') { p *= modValue(r, s, ctx); applied.push(r.id); } });
    rows.forEach(function (r) { if (r.kind === 'add') { p += modValue(r, s, ctx); applied.push(r.id); } });
    var fixed = null;
    rows.forEach(function (r) {
      if (r.kind !== 'fixed') return;
      var v = modValue(r, s, ctx);
      if (v < p) { p = v; fixed = r.id; }
    });
    if (fixed) applied.push(fixed);
    if (p > 0) {
      var best = null;
      rows.forEach(function (r) {
        if (r.kind !== 'percent') return;
        var v = modValue(r, s, ctx);
        if (v <= 0) return;
        if (!best || v > best.v || (v === best.v && best.row.consume && !r.consume)) best = { row: r, v: v };
      });
      if (best) {
        p *= 1 - Math.min(100, best.v) / 100;
        applied.push(best.row.id);
        if (best.row.consume) consumes = { id: best.row.id, item: best.row.item, n: 1 };
      }
    }
    return { price: Math.max(0, Math.floor(p + 0.5 + 1e-9)), applied: applied, consumes: consumes };
  }

  // Red's weekly price factor (B-26 red.week): rand(90..110) / 100 per week, drawn from the seed and
  // the week so it needs no state field and is the same all week.
  SR.def.fn('mods.redWeek', function (s) {
    var w = SR.tuning.street.red.week;
    var u = SR.util.hash(s.seed, 'redWeek', SR.rules.time.week(s)) / 4294967296;
    return (w.rand[0] + Math.floor(u * (w.rand[1] - w.rand[0] + 1))) / w.div;
  });

  // --------------------------------------------------------------------------------------------
  // Context, cost and the static checks

  /** Heat Wave (P1 calendar) scales training and work HP costs ×1.5, rounded up (B-19). */
  function hpScale(s, def) {
    if (!SR.features.calendar || (def.group !== 'train' && def.group !== 'work')) return 1;
    var ev = s.world && s.world.cityEvent;
    return ev && ev.id === 'heatWave' && ev.day === s.clock.day ? SR.tuning.calendar.events.heatWave.hpMult : 1;
  }

  /**
   * The pipeline context: the caller's ctx ({ rng, now, source }) plus the action, its params, its
   * resolved cost and price, and the working fields effects write (chance, notes, cause, refused).
   */
  function makeCtx(s, def, id, params, ctx, preview) {
    ctx = ctx || {};
    var c = {
      rng: ctx.rng || SR.rng.rules, now: s.clock.min, source: ctx.source || 'ui',
      id: id, def: def, params: params, preview: !!preview,
      hpScale: hpScale(s, def), chance: null, notes: {}, cause: null, refused: null, depth: 0,
    };
    var cost = def.cost || {}, num = C().num;
    c.cost = { cash: 0, min: Math.max(0, num(s, cost.min, c)), hp: Math.max(0, num(s, cost.hp, c)), items: {} };
    if (cost.items) Object.keys(cost.items).forEach(function (k) { c.cost.items[k] = Math.max(0, num(s, cost.items[k], c)); });
    if (c.cost.hp && c.hpScale !== 1) c.cost.hp = Math.ceil(c.cost.hp * c.hpScale);
    var base = Math.max(0, num(s, cost.cash, c));
    c.price = base > 0 ? price(s, base, def.priceTarget || id, c) : { price: 0, applied: [], consumes: null };
    c.cost.cash = c.price.price;
    return c;
  }

  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  /**
   * The boarding window of a take-the-day trip (GDD §4.1, §4.11; B-01): the kind comes from
   * params.kind (or params.variant), in the vocabulary of the `trip` rule event: 'smuggle' (the
   * red-eye, 'redeye' accepted) leaves only at redEyeDeparts (00:00); 'tour' boards any time in
   * tourWindow (06:00-10:00, both inclusive). Without a kind, any time before the wall.
   */
  function tripRule(s, c) {
    var T = SR.tuning.time, now = s.clock.min, p = c.params || {};
    var kind = p.kind || p.variant;
    if (now >= T.dayEnd) return no('reason.dayOver');
    if (kind === 'smuggle' || kind === 'redeye') {
      return now === T.redEyeDeparts ? { ok: true } : no('reason.redEye', { time: SR.rules.time.fmt(T.redEyeDeparts) });
    }
    if (kind === 'tour') {
      var w = T.tourWindow;
      return now >= w[0] && now <= w[1] ? { ok: true }
        : no('reason.tourWindow', { from: SR.rules.time.fmt(w[0]), to: SR.rules.time.fmt(w[1]) });
    }
    return { ok: true };
  }

  /** The time rule: timeFits unless the action declares timeRule 'robbery' | 'trip' | 'free'. */
  function timeRule(s, def, c) {
    var T = SR.tuning.time;
    switch (def.timeRule) {
      case 'free': return { ok: true };
      case 'robbery':
        return s.clock.min < T.robStartBefore ? { ok: true } : no('reason.robLate', { time: SR.rules.time.fmt(T.robStartBefore) });
      case 'trip':
        return tripRule(s, c);
      default:
        return C().eval(s, ['timeFits'], c);
    }
  }

  /**
   * The static checks after the feature gate, in pipeline order: requires, the time rule, the
   * HP cost (HP > c), cash for the price, item costs. @returns {object|null} the first failure
   */
  function gate(s, def, c) {
    var r = C().all(s, def.requires, c);
    if (!r.ok) return r;
    r = timeRule(s, def, c);
    if (!r.ok) return r;
    if (c.cost.hp > 0 && s.stats.hp <= c.cost.hp) return no('reason.tooHurt', { n: c.cost.hp });
    if (s.money.cash < c.cost.cash) return no('reason.needCash', { n: c.cost.cash, money: SR.text.money(c.cost.cash) });
    var keys = Object.keys(c.cost.items);
    for (var i = 0; i < keys.length; i++) {
      var need = c.cost.items[keys[i]], have = C().count(s, keys[i]);
      if (have < need) return no(need > 1 ? 'reason.needItems' : 'reason.needItem', { item: C().nameOf('item', keys[i]), n: need, have: have });
    }
    return null;
  }

  /** @returns {boolean} the action is unavailable before any check: its flag is off or `hidden` holds. */
  function isHidden(s, def, c) {
    if (def.feature && !SR.features[def.feature]) return true;
    return !!(def.hidden && def.hidden.length && C().all(s, def.hidden, c).ok);
  }

  // --------------------------------------------------------------------------------------------
  // Snapshots and deltas

  var TRACKS = ['mcsticks', 'nli'];

  /** The values deltas and UI events are computed from. */
  function snapshot(s) {
    var items = {};
    Object.keys(s.items).forEach(function (k) { items[k] = C().count(s, k); });
    return {
      day: s.clock.day, min: s.clock.min,
      cash: s.money.cash, bank: s.money.bank, lien: s.money.lien,
      hp: s.stats.hp, hpMax: s.stats.hpMax, str: s.stats.str, int: s.stats.int, cha: s.stats.cha,
      karma: s.stats.karma, heat: s.stats.heat, buzz: s.stats.buzz,
      items: items,
      jobs: { mcsticks: s.job.ranks.mcsticks, nli: s.job.ranks.nli, office: s.job.office },
      living: s.homes.living, owned: s.homes.owned.slice(),
      furniture: SR.util.clone(s.furniture.owned),
      over: !!s.over,
    };
  }

  function jobIndex(track, id) {
    if (id === null || id === undefined) return -1;
    if (track === 'office') return 0;
    return C().rankIndex(id);
  }

  /** @returns {object[]} the Deltas (CONTRACT §8.3) from snapshot a to b, in a fixed order. */
  function diff(a, b) {
    var out = [];
    function num(kind, key, from, to) {
      if (from === to) return;
      var d = { kind: kind, n: to - from, from: from, to: to };
      if (key) d.key = key;
      out.push(d);
    }
    var dt = (b.day - a.day) * SR.tuning.time.dayEnd + (b.min - a.min);
    if (dt) out.push({ kind: 'time', n: dt, from: a.min, to: b.min });
    num('cash', null, a.cash, b.cash);
    num('bank', null, a.bank, b.bank);
    num('lien', null, a.lien, b.lien);
    num('hp', null, a.hp, b.hp);
    ['str', 'int', 'cha'].forEach(function (k) { num('stat', k, a[k], b[k]); });
    num('hpMax', null, a.hpMax, b.hpMax);
    num('karma', null, a.karma, b.karma);
    num('heat', null, a.heat, b.heat);
    num('buzz', null, a.buzz, b.buzz);
    var keys = Object.keys(a.items);
    Object.keys(b.items).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    keys.forEach(function (k) { num('item', k, a.items[k] || 0, b.items[k] || 0); });
    TRACKS.concat(['office']).forEach(function (t) {
      var f = a.jobs[t], to = b.jobs[t];
      if (f !== to) out.push({ kind: 'job', key: t, n: jobIndex(t, to) - jobIndex(t, f), from: f, to: to });
    });
    if (a.living !== b.living) {
      var order = SR.tuning.homes.order;
      out.push({ kind: 'home', key: 'living', n: order.indexOf(b.living) - order.indexOf(a.living), from: a.living, to: b.living });
    }
    if (a.owned.slice().sort().join() !== b.owned.slice().sort().join()) {
      out.push({ kind: 'home', key: 'owned', n: b.owned.length - a.owned.length, from: a.owned, to: b.owned });
    }
    var fk = Object.keys(a.furniture);
    Object.keys(b.furniture).forEach(function (k) { if (fk.indexOf(k) < 0) fk.push(k); });
    fk.forEach(function (k) { num('furniture', k, a.furniture[k] || 0, b.furniture[k] || 0); });
    return out;
  }

  // --------------------------------------------------------------------------------------------
  // The pipeline

  /**
   * Replaces the contents of s with backup (keeping the object's identity) and rewinds the stream.
   * The backup is the state serialised before the action (the state is plain JSON, ARCHITECTURE
   * §6.1): serialising costs a fraction of a deep clone, and it is parsed only on a rollback.
   */
  function restore(s, backup, rng, rngState) {
    if (typeof backup === 'string') backup = JSON.parse(backup);
    Object.keys(s).forEach(function (k) { delete s[k]; });
    Object.keys(backup).forEach(function (k) { s[k] = backup[k]; });
    if (rng && rngState && typeof rng.setState === 'function') rng.setState(rngState);
  }

  function applyCost(s, c) {
    var cost = c.cost;
    if (cost.cash > 0) {
      s.money.cash -= cost.cash;
      if (s.records) s.records.spent = (s.records.spent || 0) + cost.cash;
    }
    var used = c.price.consumes;
    if (used && used.item) {
      var cur = s.items[used.item];
      if (Array.isArray(cur)) cur.splice(0, used.n);
      else s.items[used.item] = Math.max(0, (Number(cur) || 0) - used.n);
    }
    if (cost.min > 0) SR.rules.time.spend(s, cost.min);
    if (cost.hp > 0) SR.rules.stats.hurt(s, cost.hp, 'cost');
    Object.keys(cost.items).forEach(function (k) {
      var n = cost.items[k], v = s.items[k];
      if (Array.isArray(v)) v.splice(0, n);
      else s.items[k] = Math.max(0, (Number(v) || 0) - n);
    });
  }

  /** Passes each rule event (including those the arcs raise) once to SR.rules.arcs.onEvent. */
  function arcs(s, c, res) {
    var A = SR.rules.arcs;
    if (!A || typeof A.onEvent !== 'function') return;
    for (var i = 0; i < res.events.length && i < MAX_ARC_EVENTS && !c.refused; i++) {
      var out = A.onEvent(s, res.events[i], c);
      if (!out) continue;
      if (Array.isArray(out)) SR.rules.effects.run(s, out, c, res);
      else SR.rules.effects.merge(s, out, c, res);
    }
  }

  /** HP 0: SR.rules.health.down (W1-E; ARCHITECTURE §6.7) with the cause of the last hurt. */
  function down(s, c, res) {
    var H = SR.rules.health;
    if (!H || typeof H.down !== 'function') {
      SR.util.warnOnce('act.down', 'SR.rules.act: HP reached 0 but SR.rules.health.down is not loaded yet');
      return;
    }
    var cause = c.cause || 'other';
    var d = H.down(s, cause, c);
    if (!d) return;
    res.down = d;
    // health.down may raise the `down` rule event itself (Down.events); otherwise it is added here.
    // Its toasts (Second Wind's, ARCHITECTURE §6.7) join the Result's (docs/requests/W1-E.md R3).
    if (Array.isArray(d.events)) Array.prototype.push.apply(res.events, d.events);
    if (Array.isArray(d.toasts)) Array.prototype.push.apply(res.toasts, d.toasts);
    if (!res.events.some(function (e) { return e.name === 'down'; })) {
      res.events.push({ name: 'down', payload: { cause: d.cause || cause, outcome: d.outcome } });
    }
  }

  /**
   * Cost, effects, the arcs hook and the HP-0 hook, on s. Sets c.afterCost for previews and
   * c.income (what was credited to cash and bank by income source, CONTRACT §8.4).
   */
  function execute(s, def, c, res) {
    var closeIncome = SR.rules.effects.trackIncome();
    var day0 = s.clock.day, min0 = s.clock.min;
    try {
      applyCost(s, c);
      c.afterCost = snapshot(s);
      SR.rules.effects.run(s, def.effects, c, res);
      if (c.refused) return;
      arcs(s, c, res);
      if (c.refused) return;
      // records.meals counts the `eat` rule events (the Journal's First Day "Eat something"
      // survives a reload; docs/requests/W2-Pocket.md 5).
      var meals = 0;
      for (var i = 0; i < res.events.length; i++) if (res.events[i].name === 'eat') meals++;
      if (meals && s.records) s.records.meals = (s.records.meals || 0) + meals;
      // The weather may move at 12:00 and 18:00 as the action's time passes them (P1 `weather`;
      // nothing is drawn while the flag is off). A night (the day advanced) rolls its own.
      var Cal = SR.rules.calendar;
      if (SR.features.weather && Cal && typeof Cal.intraday === 'function' && s.clock.day === day0 && s.clock.min > min0) {
        Cal.intraday(s, min0, s.clock.min, c.rng);
      }
      if (!c.preview && !res.down && !s.over && s.stats.hp <= 0) down(s, c, res);
    } finally {
      c.income = closeIncome();
    }
  }

  /** @returns {(string|null)} the income source that credited the most to a field ('cash' | 'bank'). */
  function mainSource(rec) {
    var best = null;
    Object.keys(rec || {}).forEach(function (k) { if (!best || rec[k] > rec[best]) best = k; });
    return best;
  }

  /**
   * The stat gains a night Report the Result carries has raised as `stat` rule events already (the
   * furniture of night step 7, the hats of step 9): the report scene, the jail and the hospital
   * re-emit a Report's events (CONTRACT §8.7), so the pipeline does not derive them a second time.
   * @returns {object} key → the gain those events cover
   */
  function nightStats(res) {
    var out = {};
    [res.report, res.down && res.down.report].forEach(function (rep) {
      if (!rep || !Array.isArray(rep.events)) return;
      rep.events.forEach(function (e) {
        if (e && e.name === 'stat' && e.payload) out[e.payload.key] = (out[e.payload.key] || 0) + (Number(e.payload.n) || 0);
      });
    });
    return out;
  }

  /**
   * Deltas, the `stat` rule events derived from them, and `over`. A positive cash or bank Delta
   * names its income source as `key` when an income credit reached that field (the source that
   * credited the most; CONTRACT §8.3 `key?`, docs/requests/W1-Q.md 5). A gain made inside a night
   * whose Report is in the Result is left to that Report's own `stat` events (nightStats).
   */
  function finish(s, before, res, c) {
    res.deltas = diff(before, snapshot(s));
    var night = nightStats(res);
    res.deltas.forEach(function (d) {
      if (d.kind === 'stat' && d.n > 0 && d.n > (night[d.key] || 0)) {
        res.events.push({ name: 'stat', payload: { key: d.key, n: d.n - (night[d.key] || 0), total: d.to } });
      }
      if ((d.kind === 'cash' || d.kind === 'bank') && d.n > 0 && c && c.income) {
        var src = mainSource(c.income[d.kind]);
        if (src) d.key = src;
      }
    });
    if (!before.over && s.over && !res.over) {
      var reason = s.result && s.result.reason ? s.result.reason : res.down && res.down.outcome === 'death' ? 'death' : 'time';
      res.over = { reason: reason };
    }
  }

  /**
   * Runs an action on a state (the pure form of SR.act).
   * @param {object} s the state (mutated)
   * @param {string} id the action id
   * @param {object=} params action parameters (variant, amount, a minigame result, ...)
   * @param {{rng: object, now: number, source: string}=} ctx rng defaults to SR.rng.rules
   * @returns {object} the Result (CONTRACT §8.3); ok: false leaves the state and the stream untouched
   */
  function run(s, id, params, ctx) {
    params = params || {};
    var def = SR.reg.action[id];
    if (!def) return refusal(id, 'reason.unknown', { id: id });
    // An ended game takes no actions. A Keep-playing run is live again (endgame.keepPlaying clears
    // `over`), so `over` set once more (a Retire, a Hardcore death) ends it for good.
    if (s.over) return refusal(id, 'reason.gameOver');
    if (def.feature && !SR.features[def.feature]) return refusal(id, 'reason.featureOff');
    var c = makeCtx(s, def, id, params, ctx, false);
    if (isHidden(s, def, c)) return refusal(id, 'reason.unavailable');
    var g = gate(s, def, c);
    if (g) return refusal(id, g.reason, g.vars);

    var before = snapshot(s);
    var fullEnd = s.job ? s.job.lastFullEnd : -1;
    var backup = JSON.stringify(s);
    var rngState = c.rng && typeof c.rng.state === 'function' ? c.rng.state() : null;
    var res = makeResult(id);
    try {
      execute(s, def, c, res);
    } catch (e) {
      restore(s, backup, c.rng, rngState);
      throw e;
    }
    if (c.refused) {
      restore(s, backup, c.rng, rngState);
      return refusal(id, c.refused.reason, c.refused.vars);
    }
    // B-05 / GDD §4.6: Overtime follows a Full shift "with no other action in between". The mark
    // (job.lastFullEnd) is the Full shift's end; any other action that goes through, a free one
    // too (walking into another building runs world.enter), clears it, so a McSticks shift cannot
    // open Overtime at NLI and a stop at the counter in between ends the chance.
    if (s.job && fullEnd >= 0 && s.job.lastFullEnd === fullEnd) s.job.lastFullEnd = -1;
    finish(s, before, res, c);
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Previews

  /**
   * A neutral random stream for dry runs: every draw returns the same fraction u, so a preview
   * shows a typical outcome (u = 0.5) and its range (u = 0 and u → 1) without revealing the real
   * rules stream's next draws.
   */
  function fixedRng(u) {
    var draws = 0;
    var r = {
      next: function () { draws++; return Math.floor(u * 4294967296) >>> 0; },
      float: function (lo, hi) { draws++; return lo === undefined ? u : lo + u * (hi - lo); },
      int: function (lo, hi) {
        draws++;
        var l = Math.ceil(Math.min(lo, hi)), h = Math.floor(Math.max(lo, hi));
        return l + Math.floor(u * (h - l + 1));
      },
      pick: function (arr) { draws++; return arr[Math.min(arr.length - 1, Math.floor(u * arr.length))]; },
      chance: function (p) { draws++; return u < p; },
      weighted: function (pairs) {
        draws++;
        var total = 0;
        pairs.forEach(function (x) { if (x[1] > 0) total += x[1]; });
        if (!(total > 0)) return null;
        var t = u * total, last = null;
        for (var i = 0; i < pairs.length; i++) {
          if (!(pairs[i][1] > 0)) continue;
          if (t < pairs[i][1]) return pairs[i][0];
          t -= pairs[i][1];
          last = pairs[i][0];
        }
        return last;
      },
      state: function () { return [0, 0, 0, 0]; },
      setState: function () { return r; },
      seed: function () { return r; },
      draws: function () { return draws; },
    };
    return r;
  }

  /** Turns a lazy field of a copy into a plain data property. */
  function setField(o, k, v) {
    Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
  }

  /**
   * A copy of the state for a dry run whose top-level objects are cloned on first access, so a
   * preview pays only for the parts its action reads (a food row never clones the inbox, the
   * history or the markets; every card refresh previews each row). It behaves as a plain object:
   * keys enumerate in order, JSON and SR.util.clone see every field, assignment and delete work.
   * @returns {object}
   */
  function lazyCopy(s) {
    var copy = {};
    Object.keys(s).forEach(function (k) {
      var v = s[k];
      if (v === null || typeof v !== 'object') { copy[k] = v; return; }
      Object.defineProperty(copy, k, {
        enumerable: true, configurable: true,
        get: function () { var c = SR.util.clone(v); setField(copy, k, c); return c; },
        set: function (x) { setField(copy, k, x); },
      });
    });
    return copy;
  }

  /**
   * Runs the action on a copy of s with a fixed stream. The live state, SR.state and the real
   * rules stream are protected even from a named fn that reaches for them.
   */
  function dryRun(s, def, id, params, ctx, u) {
    var copy = lazyCopy(s);
    var rng = fixedRng(u);
    var c = makeCtx(copy, def, id, params, { rng: rng, source: ctx && ctx.source }, true);
    var res = makeResult(id);
    var live = SR.state, rulesState = SR.rng.rules.state();
    if (live === s) SR.state = copy;
    try {
      execute(copy, def, c, res);
    } finally {
      SR.state = live;
      SR.rng.rules.setState(rulesState);
    }
    return { c: c, res: res, after: c.refused ? null : snapshot(copy), draws: rng.draws() };
  }

  /** @returns {object[]} Preview gains from a dry run: the deltas after the cost, with caps noted. */
  function gainsOf(run) {
    return diff(run.c.afterCost, run.after).map(function (d) {
      // Effects note a gain cut by a cap: 'hp' (overheal: "(full)"), 'stat:<key>' (999: "(max)"),
      // 'item:<key>' (the stack).
      var note = d.kind === 'hp' ? 'hp' : d.kind === 'stat' || d.kind === 'item' ? d.kind + ':' + d.key : null;
      var capped = !!(note && run.c.notes[note]);
      var g = { kind: d.kind, n: d.n, min: d.n, max: d.n, capped: capped };
      if (d.key !== undefined) g.key = d.key;
      if (typeof d.n !== 'number') { g.from = d.from; g.to = d.to; }
      return g;
    });
  }

  /**
   * Previews an action on a state without changing it (the pure form of SR.preview).
   * @returns {object} Preview (CONTRACT §8.3): { ok, reason, vars, cost, gains, chance, badges,
   *   hotkey, repeatable, screen, hidden }; { hidden: true } while the flag is off or `hidden` holds
   */
  function preview(s, id, params, ctx) {
    params = params || {};
    var def = SR.reg.action[id];
    if (!def) return { id: id, hidden: true, ok: false, reason: 'reason.unknown', vars: { id: id } };
    if (def.feature && !SR.features[def.feature]) return { id: id, hidden: true };
    // The static checks see a neutral stream too: a named condition or cost that draws must not
    // move the real rules stream from a preview.
    var c = makeCtx(s, def, id, params, { rng: fixedRng(0.5), source: ctx && ctx.source }, true);
    if (isHidden(s, def, c)) return { id: id, hidden: true };
    var p = {
      id: id, ok: true, reason: null, vars: null,
      cost: { cash: c.cost.cash, min: c.cost.min, hp: c.cost.hp, items: SR.util.clone(c.cost.items) },
      gains: [], chance: null, badges: c.price.applied.slice(),
      hotkey: def.hotkey || null, repeatable: !!def.repeatable, screen: def.screen || null, hidden: false,
    };
    if (s.over) { p.ok = false; p.reason = 'reason.gameOver'; p.vars = {}; return p; }
    if (def.screen) {
      // A sub-screen row: its requires can disable it; it shows no cost chips (ARCHITECTURE §7.1).
      p.cost = { cash: 0, min: 0, hp: 0, items: {} };
      p.badges = [];
      var rq = C().all(s, def.requires, c);
      if (!rq.ok) { p.ok = false; p.reason = rq.reason; p.vars = rq.vars; }
      return p;
    }
    var g = gate(s, def, c);
    if (g) { p.ok = false; p.reason = g.reason; p.vars = g.vars; return p; }

    var mid = dryRun(s, def, id, params, ctx, 0.5);
    if (mid.c.refused) { p.ok = false; p.reason = mid.c.refused.reason; p.vars = mid.c.refused.vars; return p; }
    p.gains = gainsOf(mid);
    p.chance = mid.c.chance;
    if (mid.draws > 0) {
      // Random amounts: widen each gain to the range seen at both ends of the stream.
      [dryRun(s, def, id, params, ctx, 0), dryRun(s, def, id, params, ctx, 1 - 1e-9)].forEach(function (ext) {
        if (!ext.after) return;
        gainsOf(ext).forEach(function (e) {
          var m = null;
          p.gains.forEach(function (x) { if (x.kind === e.kind && x.key === e.key) m = x; });
          if (!m) { m = { kind: e.kind, n: 0, min: 0, max: 0, capped: e.capped }; if (e.key !== undefined) m.key = e.key; p.gains.push(m); }
          if (typeof e.n === 'number') { m.min = Math.min(m.min, e.n); m.max = Math.max(m.max, e.n); }
        });
      });
    }
    return p;
  }

  // --------------------------------------------------------------------------------------------
  // SR.act / SR.preview: the live forms

  var reported = {};
  function reportError(where, id, e) {
    if (reported[where + id]) return;
    reported[where + id] = true;
    if (typeof console !== 'undefined' && console.error) console.error('SR.' + where + '("' + id + '") failed', e);
  }

  /** The values the UI events of §8.7 (3) compare before and after an action. */
  function uiSnapshot(s) {
    return {
      msgIds: s.msgs.map(function (m) { return m.id; }),
      pending: s.perks.pending.map(function (o) { return o.stat + ':' + o.level; }),
      election: s.election.status + ':' + s.election.poll,
    };
  }

  /** Emits a Result on SR.events in the order of CONTRACT §8.7, action:done last. */
  function emitAll(s, res, before) {
    var E = SR.events;
    res.events.forEach(function (ev) { E.emit(ev.name, ev.payload); });
    function each(kind, fn) { res.deltas.forEach(function (d) { if (d.kind === kind) fn(d); }); }
    each('time', function (d) { E.emit('time:advanced', { from: d.from, to: d.to, reason: res.id }); });
    each('stat', function (d) { E.emit('stat:changed', { key: d.key, from: d.from, to: d.to, delta: d.n }); });
    each('hp', function (d) { E.emit('stat:changed', { key: 'hp', from: d.from, to: d.to, delta: d.n }); });
    each('hpMax', function (d) { E.emit('stat:changed', { key: 'hpMax', from: d.from, to: d.to, delta: d.n }); });
    each('karma', function (d) { E.emit('karma:changed', { from: d.from, to: d.to }); });
    var money = 0, moved = false;
    res.deltas.forEach(function (d) { if (d.kind === 'cash' || d.kind === 'bank') { money += d.n; moved = true; } });
    if (moved) E.emit('money:changed', { cash: s.money.cash, bank: s.money.bank, delta: money, reason: res.id });
    each('heat', function (d) { E.emit('heat:changed', { from: d.from, to: d.to }); });
    each('buzz', function (d) { E.emit('buzz:changed', { from: d.from, to: d.to }); });
    each('item', function (d) { E.emit('item:changed', { key: d.key, from: d.from, to: d.to }); });
    each('job', function (d) { E.emit('job:changed', { track: d.key, from: d.from, to: d.to }); });
    if (res.deltas.some(function (d) { return d.kind === 'home'; })) E.emit('home:changed', { living: s.homes.living, owned: s.homes.owned.slice() });

    s.msgs.forEach(function (m) { if (before.msgIds.indexOf(m.id) < 0) E.emit('msg:received', { id: m.id, from: m.from }); });
    res.achievements.forEach(function (id) { E.emit('achievement:unlocked', { id: id }); });
    s.perks.pending.forEach(function (o) {
      if (before.pending.indexOf(o.stat + ':' + o.level) < 0) E.emit('perk:offered', { stat: o.stat, level: o.level, options: o.options.slice() });
    });
    if (s.election.status + ':' + s.election.poll !== before.election) E.emit('election:changed', { status: s.election.status, poll: s.election.poll });
    if (res.down) E.emit('player:down', { cause: res.down.cause, outcome: res.down.outcome, down: res.down });
    if (res.over && !overByReport(res)) E.emit('game:over', { reason: res.over.reason, result: s.result });
    E.emit('action:done', { id: res.id, result: res });
  }

  /**
   * A game that ends in a night the report scene presents (a sleep's Report in Result.report, the
   * hospital night's in Result.down.report) is announced by the report scene once the paper has
   * been read (CONTRACT §9.2: game:over comes from SR.act or the report scene; GDD §4.7 / §4.16:
   * the results follow the report), so SR.act does not emit game:over for it; Result.over still
   * says so. A jail night's Report is a line on the Jail Day card, not the report scene, so its
   * end is announced here (docs/requests/W2-Home.md 1).
   * @returns {boolean}
   */
  function overByReport(res) {
    return !!((res.report && res.report.kind !== 'jail') || (res.down && res.down.report));
  }

  /**
   * Runs an action on the live game (SR.state) with the rules stream, keeps state.rng.rules in step,
   * and emits the Result's rule events, the UI events and action:done (CONTRACT §8.7).
   * @param {string} id the action id
   * @param {object=} params action parameters
   * @param {{source: string}=} opts source 'ui' (default) | 'sim' | 'debug'
   * @returns {object} the Result (a refusal when no game runs or the action threw; the error is logged)
   */
  SR.act = function (id, params, opts) {
    var s = SR.state;
    if (!s) return refusal(id, 'reason.noGame');
    var ctx = { rng: SR.rng.rules, now: s.clock.min, source: (opts && opts.source) || 'ui' };
    var before = uiSnapshot(s);
    var res;
    try {
      res = run(s, id, params, ctx);
    } catch (e) {
      // run has rolled the state and the stream back; the refusal is announced like any other
      // (CONTRACT §8.9: action:done for refusals too), so a listener waiting on it is not left hanging.
      reportError('act', id, e);
      res = refusal(id, 'reason.error');
    }
    if (s.rng) s.rng.rules = SR.rng.rules.state();
    emitAll(s, res, before);
    return res;
  };

  /**
   * Previews an action on the live game; never changes anything.
   * @returns {object} Preview (CONTRACT §8.3)
   */
  SR.preview = function (id, params) {
    var s = SR.state;
    if (!s) return { id: id, ok: false, reason: 'reason.noGame', vars: {}, hidden: false, gains: [], badges: [], chance: null, cost: { cash: 0, min: 0, hp: 0, items: {} } };
    try {
      return preview(s, id, params, { rng: SR.rng.rules, now: s.clock.min, source: 'ui' });
    } catch (e) {
      reportError('preview', id, e);
      return { id: id, ok: false, reason: 'reason.error', vars: {}, hidden: false, gains: [], badges: [], chance: null, cost: { cash: 0, min: 0, hp: 0, items: {} } };
    }
  };

  // --------------------------------------------------------------------------------------------
  // Actions per building

  /**
   * The actions of an owner (a building id, 'world', 'bag', 'street:<npc>', ...) in card order:
   * by group (eat, buy, work, train, services, crime, special), then `order`, then id.
   * '<id>:resolve' actions are never rows and are left out.
   * @returns {string[]} action ids
   */
  function actions(building) {
    return SR.registry.entries('action')
      .filter(function (e) { return e.def.building === building && !/:resolve$/.test(e.id); })
      .sort(function (a, b) {
        var ga = GROUPS.indexOf(a.def.group), gb = GROUPS.indexOf(b.def.group);
        if (ga < 0) ga = GROUPS.length;
        if (gb < 0) gb = GROUPS.length;
        return ga - gb || (a.def.order || 0) - (b.def.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      })
      .map(function (e) { return e.id; });
  }

  /** Warns once about condition and effect names this module does not know (D28: never throws). */
  function checkNames(list, known, what, id) {
    (list || []).forEach(function (x) {
      var name = Array.isArray(x) ? x[0] : x;
      if (known.indexOf(name) < 0) SR.util.warnOnce('act.names:' + what + ':' + name, 'SR.rules.act: action "' + id + '" uses an unknown ' + what + ' "' + name + '"');
      if (!Array.isArray(x)) return;
      if (what === 'condition' && (name === 'not')) checkNames([x[1]], known, what, id);
      if (what === 'condition' && (name === 'any' || name === 'all')) checkNames(x[1], known, what, id);
      if (what === 'effect' && name === 'check') { checkNames(x[4], known, what, id); checkNames(x[5], known, what, id); }
      if (what === 'effect' && name === 'chance') { checkNames(x[2], known, what, id); checkNames(x[3], known, what, id); }
    });
  }

  // Priority 20 (D28): index-free check of this module's own vocabulary in every registered action.
  SR.onBoot(20, function () {
    var cn = SR.rules.conditions.names, en = SR.rules.effects.names;
    SR.registry.entries('action').forEach(function (e) {
      checkNames(e.def.requires, cn, 'condition', e.id);
      checkNames(e.def.hidden, cn, 'condition', e.id);
      checkNames(e.def.effects, en, 'effect', e.id);
      if (e.def.p >= 1 && !e.def.feature) SR.util.warnOnce('act.feature:' + e.id, 'SR.rules.act: action "' + e.id + '" has p ' + e.def.p + ' but no feature flag');
      // CONTRACT §8.2: R and hold-to-repeat never apply to a confirm, a minigame or a sub-screen row.
      if (e.def.repeatable && (e.def.confirm || e.def.minigame || e.def.screen)) {
        SR.util.warnOnce('act.repeatable:' + e.id, 'SR.rules.act: action "' + e.id + '" is repeatable but has confirm, minigame or screen');
      }
    });
  }, { headless: true });

  SR.rules.act = {
    GROUPS: GROUPS.slice(),
    run: run,
    preview: preview,
    price: price,
    actions: actions,
    snapshot: snapshot,
    diff: diff,
  };
})();
