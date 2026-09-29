// js/rules/crime.js — owner: W2-RulesC (W1-C in wave 1). SR.rules.crime: robberies (the Hold-up), jail, bail, fines and
// the police (GDD §4.10; BALANCE B-11, B-28b; ARCHITECTURE §6.5).
//
// Robbery flow (the store: W2-Food's data; the bank: W2-Money's): the row runs the named fn
// 'crime.rob' (args 'store' | 'bank'), which checks robPrecheck, applies the start (ammo rand(5..9),
// karma, Heat, the clock to 24:00, the bank's weekly limit and its 14-day memory) and returns
// Result.open for the `holdup` skin with holdupParams (D computed BEFORE this robbery's Heat) and
// marks the robbery in progress (state.crime.open = { target, day }); the building then runs
// '<id>:resolve' with the Duel result, whose 'crime.robResolve' (refused unless a robbery is in
// progress today) pays the loot on two successes or jails you on two failures (the bank also
// confiscates the gun and ammo).
// Heat at arrest includes the robbery's own Heat (it is added at the start, win or lose).
//
// Jail (GDD §4.10 "Arrest flow"): jail(s, reason, ctx) sets state.jail and runs the arrest night at
// once (SR.rules.night kind 'jail', which counts daysLeft down); each morning the Jail Day card's
// choice runs jailDay (the choice's gain, then the next jail night); when daysLeft reaches 0 you are
// released: Heat 20, 08:00 (the jail night's wake time), outside City Hall (the jail scene places
// you). Reasons: 'store', 'bank', 'bust', 'police', 'questioning' (and any other: the police base).
// Bail (P1 `police`), the Precinct fine and police stops (P1 `police`) are here too.
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var STATS = ['str', 'cha', 'int'];      // the Hold-up's options in B-30 order: Intimidate, Sweet-talk, Outwit
  var OPTION = { str: 'intimidate', cha: 'sweetTalk', int: 'outwit' };
  var JAIL_CHOICES = ['str', 'int', 'cha', 'hp'];

  function T() { return SR.tuning.crime; }
  function feat(flag) { return !!SR.features[flag]; }
  function perk(s, id) { return !!(SR.rules.perks && SR.rules.perks.has(s, id)); }
  function rng0(ctx) { return (ctx && ctx.rng) || SR.rng.rules; }
  function yes() { return { ok: true, reason: null, vars: null }; }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function partial() { return SR.rules.effects.partial(); }
  function money(n) { return SR.text.money(n); }
  function row(target) { return target === 'bank' ? T().bank : T().store; }
  function itemName(key) { return SR.rules.conditions.nameOf('item', key); }

  // --------------------------------------------------------------------------------------------
  // Robberies

  /** @returns {number} bank robberies in the last 14 days (state.crime.bankRobDays, pruned by the night). */
  function recentBankRobberies(s) {
    var keep = T().bank.D.recentDays;
    return (s.crime.bankRobDays || []).filter(function (d) { return s.clock.day - d < keep; }).length;
  }

  /**
   * The robbery's difficulty D per beat (B-11b): store 60 + Heat; bank 400 + Heat + 100 × bank
   * robberies in the last 14 days.
   * @returns {number}
   */
  function holdupD(s, target) {
    var D = row(target).D, d = D.base + D.perHeat * s.stats.heat;
    if (target === 'bank') d += D.perRecent * recentBankRobberies(s);
    return d;
  }

  /**
   * Whether a robbery can start (B-11b): a gun and ≥ 10 ammo (orig), now < 21:00 (orig; latest
   * 20:30); the bank also STR ≥ 100 and not yet this week.
   * @param {string} target 'store' | 'bank'
   * @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  function robPrecheck(s, target) {
    var R = row(target), req = R.requires;
    if ((s.items.gun || 0) < req.gun) return no('reason.needItem', { item: itemName('gun'), n: req.gun, have: s.items.gun || 0 });
    if ((s.items.ammo || 0) < req.ammo) return no('reason.needItems', { item: itemName('ammo'), n: req.ammo, have: s.items.ammo || 0 });
    if (target === 'bank') {
      if (s.stats.str < req.str) return no('reason.needStat', { stat: SR.rules.conditions.label('str'), min: req.str, have: s.stats.str });
      if ((s.weekly.bankRob || 0) >= req.perWeek) return no('reason.weeklyLimit');
    }
    if (s.clock.min >= R.startBefore) return no('reason.robLate', { time: SR.rules.time.fmt(R.startBefore) });
    return yes();
  }

  /**
   * The Hold-up's chance per option (B-11b, B-28b check ids holdup.<target>.<stat>).
   * @returns {{str: number, cha: number, int: number}}
   */
  function holdupChances(s, target, D) {
    if (D === undefined) D = holdupD(s, target);
    var out = {};
    STATS.forEach(function (k) {
      out[k] = SR.rules.check.chance(s.stats[k], D, { s: s, checkId: 'holdup.' + target + '.' + k });
    });
    return out;
  }

  /**
   * The run params of the `holdup` skin (B-30): D, the check id prefix the Duel appends the stat to,
   * the beats, the wins that decide it, the options, the shown chances and `stake` (Hardcore pending).
   * @returns {object}
   */
  function holdupParams(s, target) {
    target = target === 'bank' ? 'bank' : 'store';
    var R = row(target), D = holdupD(s, target);
    return {
      target: target, D: D, check: 'holdup.' + target, beats: R.beats, need: R.need, bestOf: true, stake: true,
      options: STATS.map(function (k) { return { id: OPTION[k], stat: k, label: 'mg.holdup.' + OPTION[k] }; }),
      chances: holdupChances(s, target, D),
    };
  }

  /**
   * A sampled Hold-up with the Auto policy (ARCHITECTURE §10: each beat the option with the best
   * shown odds, rolled; best of three): the simulator and the Monte Carlo test use it.
   * @returns {{beats: boolean[], wins: number, losses: number, picks: string[], auto: boolean}}
   */
  function holdupAuto(s, params, rng) {
    rng = rng || SR.rng.rules;
    var ch = params && params.chances ? params.chances : holdupChances(s, params && params.target || 'store');
    var best = STATS.reduce(function (a, k) { return ch[k] > ch[a] ? k : a; }, STATS[0]);
    var R = row(params && params.target), out = { beats: [], wins: 0, losses: 0, picks: [], auto: true };
    for (var i = 0; i < R.beats && out.wins < R.need && out.losses < R.beats - R.need + 1; i++) {
      var ok = SR.rules.check.roll(rng, ch[best]);
      out.beats.push(ok);
      out.picks.push(OPTION[best]);
      if (ok) out.wins++; else out.losses++;
    }
    return out;
  }

  /**
   * Starts a robbery (the named fn 'crime.rob'): the precheck, then the start that happens win or
   * lose (B-11b): ammo rand(5..9) (1 draw), karma, Heat, the clock to 24:00; the bank also its
   * weekly counter and its 14-day memory. Returns Result.open for the `holdup` skin.
   * @param {string} target 'store' | 'bank'
   * @param {object=} ctx the pipeline context ({ rng, id })
   * @returns {object} a partial Result (ok: false with the reason when the precheck fails)
   */
  function rob(s, target, ctx) {
    target = target === 'bank' ? 'bank' : 'store';
    var pre = robPrecheck(s, target);
    if (!pre.ok) return { ok: false, reason: pre.reason, vars: pre.vars };
    var R = row(target), rng = rng0(ctx), res = partial();
    var params = holdupParams(s, target);
    var used = rng.int(R.ammo[0], R.ammo[1]);
    s.items.ammo = Math.max(0, (s.items.ammo || 0) - used);
    SR.rules.stats.karma(s, R.karma);
    SR.rules.stats.heat(s, R.heat);
    SR.rules.time.setTo(s, R.clock);
    if (target === 'bank') {
      s.weekly.bankRob = (s.weekly.bankRob || 0) + 1;
      s.crime.bankRobDays = (s.crime.bankRobDays || []).concat([s.clock.day]);
      s.records.bankRobberies = (s.records.bankRobberies || 0) + 1;
    } else {
      s.records.robberies = (s.records.robberies || 0) + 1;
    }
    params.ammoUsed = used;
    // The robbery in progress (docs/requests/W1-C.md item 1): the named resolve fn requires it, so
    // a stray or repeated '<id>:resolve' can never pay loot for a robbery that was not started.
    s.crime.open = { target: target, day: s.clock.day };
    res.open = { minigame: 'holdup', skin: 'holdup', params: params, resolve: ctx && ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * The named fn 'crime.robResolve': resolves today's robbery in progress (state.crime.open, set by
   * rob) and closes it; its target wins over the data's argument. Refused when none is open.
   * @returns {object} a partial Result
   */
  function robResolveOpen(s, target, beats, ctx) {
    var open = s.crime && s.crime.open;
    if (!open || open.day !== s.clock.day) return { ok: false, reason: 'reason.notNow', vars: {} };
    s.crime.open = null;
    return robResolve(s, open.target || target, beats, ctx);
  }

  /** @returns {number} the successes of a Duel result or a beats array. */
  function winsOf(beats) {
    if (Array.isArray(beats)) return beats.filter(Boolean).length;
    if (beats && typeof beats.wins === 'number') return beats.wins;
    if (beats && Array.isArray(beats.beats)) return beats.beats.filter(Boolean).length;
    return 0;
  }

  /**
   * Resolves a robbery with the Hold-up's beats (B-11b): two successes win the loot (store
   * $100 + rand(0..499), bank $3,000 + rand(0..12,000); income 'loot', 1 draw); otherwise jail
   * (store base 3, Hardcore 5; bank 7) and the bank confiscates the gun and ammo.
   * @param {string} target 'store' | 'bank'
   * @param {boolean[]|object} beats the Duel result ({ beats, wins }) or its beats
   * @returns {object} a partial Result
   */
  function robResolve(s, target, beats, ctx) {
    target = target === 'bank' ? 'bank' : 'store';
    var R = row(target), rng = rng0(ctx), res;
    var win = winsOf(beats) >= R.need;
    if (win) {
      res = partial();
      var loot = R.loot.base + rng.int(R.loot.rand[0], R.loot.rand[1]);
      SR.rules.effects.credit(s, 'cash', loot, 'loot');
      res.stamps.push({ key: 'stamp.crime.' + target, vars: { n: loot, money: money(loot) } });
      res.toasts.push({ key: 'toast.crime.' + target + 'Win', vars: { n: loot, money: money(loot) }, kind: 'reward' });
      res.sfx.push('coin');   // ART_AUDIO §13.5 Money
      res.log.push({ kind: target === 'bank' ? 'bankRobbery' : 'storeRobbery', vars: { outcome: 'win', n: loot } });
      res.events.push({ name: 'rob', payload: { target: target, outcome: 'win', loot: loot } });
      return res;
    }
    if (target === 'bank') {
      R.confiscate.forEach(function (k) { s.items[k] = 0; });
      logNow(s, 'bankRobbery', { outcome: 'lose', n: 0 });
    }
    res = jail(s, target, ctx);
    res.events.unshift({ name: 'rob', payload: { target: target, outcome: 'lose', loot: 0 } });
    res.toasts.unshift({ key: 'toast.crime.' + target + 'Lose', vars: {}, kind: 'warning' });
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Jail

  /**
   * Jail length (B-11c): base + floor(Heat at arrest / 25); bases: store 3 (Hardcore 5, orig),
   * bank 7, bust 5 (orig), police 2 (also questioning); Charming Rogue -2 days (min 1).
   * @returns {number} days
   */
  function jailDays(s, reason) {
    var J = T().jail, B = J.bases, base;
    if (reason === 'store') base = s.mode.difficulty === 'hardcore' ? B.storeHardcore : B.store;
    else if (reason === 'bank') base = B.bank;
    else if (reason === 'bust') base = B.bust;
    else base = B.police;
    var days = base + Math.floor(s.stats.heat / J.heatDiv);
    if (perk(s, 'charmingRogue')) days = Math.max(J.charmingRogue.min, days + J.charmingRogue.days);
    return Math.max(1, days);
  }

  /** @returns {number} the per-day bail at arrest: max(500, floor(2 % of net worth)) (B-11c). */
  function bailBaseOf(s) {
    var B = T().bail;
    var nw = SR.rules.endgame && typeof SR.rules.endgame.netWorth === 'function' ? SR.rules.endgame.netWorth(s) : s.money.cash + s.money.bank;
    return Math.max(B.perDayMin, Math.floor(B.nwShare * nw));
  }

  /** Runs a jail night (SR.rules.night kind 'jail'); null while the night module is not loaded. */
  function jailNight(s, ctx) {
    var N = SR.rules.night;
    if (!N || typeof N.run !== 'function') {
      SR.util.warnOnce('rules.crime:night', 'SR.rules.crime: SR.rules.night is not loaded; the jail night is skipped');
      return null;
    }
    records(s);
    return N.run(s, { rng: rng0(ctx), now: s.clock.min, source: (ctx && ctx.source) || 'sim' }, { kind: 'jail' });
  }

  function records(s) { s.records.jailDays = (s.records.jailDays || 0) + 1; }

  /**
   * Writes a log entry at once. Entries of a partial Result are delivered after the named fn
   * returns, which is after the arrest night has rolled today's log into yesterday's; an arrest's
   * entries must be in the log of the day it happened (the next morning's headline).
   */
  function logNow(s, kind, vars) {
    if (SR.rules.log && typeof SR.rules.log.add === 'function') SR.rules.log.add(s, kind, vars);
  }

  /**
   * Arrests the player (GDD §4.10): state.jail = { daysLeft, served, reason, bailBase }, the jail
   * log entry, then the arrest night at once (a jail night: the economy runs, no restore, no
   * furniture; daysLeft counts down). A one-day sentence ends with that night.
   * @param {string} reason 'store' | 'bank' | 'bust' | 'police' | 'questioning'
   * @param {object=} ctx the pipeline context ({ rng })
   * @returns {object} a partial Result: { days, jailed, report (the arrest night), events, log, toasts }
   */
  function jail(s, reason, ctx) {
    var res = partial(), days = jailDays(s, reason);
    s.jail = { daysLeft: days, served: 0, reason: reason, bailBase: bailBaseOf(s) };
    res.days = days;
    res.jailed = { reason: reason, days: days };
    res.events.push({ name: 'jail', payload: { reason: reason, days: days } });
    res.stamps.push({ key: 'stamp.crime.jailed', vars: { days: days } });
    res.sfx.push('siren');  // ART_AUDIO §13.5 World: the two-tone siren
    logNow(s, 'jailed', { reason: reason, days: days });
    var rep = jailNight(s, ctx);
    if (rep) res.report = rep;
    if (s.jail && s.jail.daysLeft <= 0) mergeInto(res, release(s, false));
    return res;
  }

  function mergeInto(a, b) {
    ['msgs', 'toasts', 'stamps', 'sfx', 'anims', 'events', 'log'].forEach(function (k) { Array.prototype.push.apply(a[k], b[k] || []); });
  }

  /**
   * Releases the player (B-11c): Heat set to 20; the clock stays at the jail night's 08:00.
   * @param {boolean} bailed
   * @returns {object} a partial Result with the `release` event
   */
  function release(s, bailed) {
    var res = partial(), j = s.jail;
    if (!j) return res;
    s.jail = null;
    s.stats.heat = SR.util.clamp(T().jail.release.heat, SR.tuning.start.heatRange[0], SR.tuning.start.heatRange[1]);
    res.events.push({ name: 'release', payload: { reason: j.reason, bailed: !!bailed } });
    res.toasts.push({ key: bailed ? 'toast.crime.bailed' : 'toast.crime.released', vars: {}, kind: 'info' });
    return res;
  }

  /**
   * A Jail Day (B-11c): the choice's gain (Work out +2 STR, Read +2 INT, Make friends +2 CHA and,
   * P1 `tours`, +1 reputation in a random city; Keep your head down +10 HP), then the jail night;
   * released when daysLeft reaches 0.
   * @param {string} choice 'str' | 'int' | 'cha' | 'hp'
   * @returns {object} a partial Result: { report, released, ... } (ok: false when not in jail)
   */
  function jailDay(s, choice, ctx) {
    if (!s.jail) return { ok: false, reason: 'reason.notNow', vars: {} };
    // A sentence already served (its last jail night ran outside jailDay: a debug night, the balance
    // simulator) releases at once, with no gain and no further night, so nobody stays in a cell
    // with daysLeft ≤ 0 (W2-RulesC).
    if (s.jail.daysLeft <= 0) {
      var served = release(s, false);
      served.released = true;
      return served;
    }
    if (JAIL_CHOICES.indexOf(choice) < 0) return { ok: false, reason: 'reason.unavailable', vars: {} };
    var D = T().jail.day, res = partial(), rng = rng0(ctx);
    if (choice === 'hp') {
      SR.rules.stats.heal(s, D.hp);
    } else {
      var n = SR.rules.stats.add(s, choice, D[choice], 'train');
      res.events.push({ name: 'train', payload: { id: 'jail.' + choice, stat: choice, n: n } });
      if (choice === 'str') s.records.jailWorkouts = (s.records.jailWorkouts || 0) + 1;
      if (choice === 'cha' && feat('tours')) {
        var ids = SR.rules.trade && SR.rules.trade.cityIds ? SR.rules.trade.cityIds() : Object.keys(SR.tuning.bus.cities);
        if (ids.length) {
          var city = ids[rng.int(0, ids.length - 1)];
          var rep = s.trade.rep || (s.trade.rep = {});
          rep[city] = Math.min(SR.tuning.bus.take.repMax, (rep[city] || 0) + D.rep);
          res.toasts.push({ key: 'toast.crime.friend', vars: { city: SR.text('city.' + city + '.name') }, kind: 'info' });
        }
      }
    }
    var report = jailNight(s, ctx);   // the jail night counts daysLeft down and served up (night step 10)
    if (report) res.report = report;
    res.released = false;
    if (s.jail && s.jail.daysLeft <= 0) {
      mergeInto(res, release(s, false));
      res.released = true;
    }
    return res;
  }

  /**
   * The bail for the remaining days (B-11c, P1 `police`): daysLeft × the per-day amount stored at
   * arrest, after the price modifiers of target 'bail' (Charming Rogue ×0.5).
   * @returns {number} dollars (0 when not in jail)
   */
  function bail(s) {
    if (!s.jail) return 0;
    var base = Math.max(0, s.jail.daysLeft) * (s.jail.bailBase || bailBaseOf(s));
    return SR.rules.act.price(s, base, 'bail', {}).price;
  }

  /** @returns {{ok: boolean, reason: (string|null), vars: (object|null)}} whether bail can be paid now. */
  function canBail(s) {
    if (!feat('police')) return no('reason.featureOff');
    if (!s.jail) return no('reason.notNow');
    if (T().bail.needsPhone && !((s.items.phone || 0) > 0)) return no('reason.needPhone');
    var cost = bail(s);
    if (s.money.cash + s.money.bank < cost) return no('reason.needCash', { n: cost, money: money(cost) });
    return yes();
  }

  /**
   * Pays the bail (the lawyer takes cash, then a transfer from the bank) and releases you.
   * @returns {object} a partial Result (ok: false with the reason when not possible)
   */
  function payBail(s) {
    var c = canBail(s);
    if (!c.ok) return { ok: false, reason: c.reason, vars: c.vars };
    var cost = bail(s);
    var fromCash = Math.min(s.money.cash, cost);
    s.money.cash -= fromCash;
    s.money.bank -= cost - fromCash;
    var res = release(s, true);
    res.vars = { n: cost, money: money(cost) };
    return res;
  }

  /**
   * The Precinct fine (B-11a, B-27 civic.fine; P1 `police`): $50 per Heat point, any number of
   * points up to your Heat, paid in cash.
   * @param {number} points
   * @returns {object} a partial Result
   */
  function fine(s, points) {
    var per = SR.tuning.civic.fine.dollarsPerPoint;
    points = Math.floor(Number(points) || 0);
    if (points <= 0) return { ok: false, reason: 'reason.unavailable', vars: {} };
    points = Math.min(points, s.stats.heat);
    if (points <= 0) return { ok: false, reason: 'reason.heatLow', vars: { min: 1, have: s.stats.heat } };
    var cost = points * per;
    if (s.money.cash < cost) return { ok: false, reason: 'reason.needCash', vars: { n: cost, money: money(cost) } };
    s.money.cash -= cost;
    SR.rules.stats.heat(s, -points);
    var res = partial();
    res.toasts.push({ key: 'toast.crime.fine', vars: { n: points, money: money(cost) }, kind: 'info' });
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // The police (P1 `police`; B-11d)

  /** @returns {number} the chance of talking your way out: chance(CHA, 50 + 2 × Heat), check police.talk. */
  function talkChance(s) {
    var P = T().police.talk;
    return SR.rules.check.chance(s.stats.cha, P.D + P.perHeat * s.stats.heat, { s: s, checkId: 'police.talk' });
  }

  /**
   * Talk your way out (1 draw): success -10 Heat; failure leaves you to pick Bribe or Run.
   * @returns {object} a partial Result with `outcome` 'talked' | 'failed'
   */
  function policeTalk(s, ctx) {
    var P = T().police.talk, res = partial(), p = talkChance(s);
    var ok = SR.rules.check.roll(rng0(ctx), p);
    if (ok) SR.rules.stats.heat(s, P.heat);
    res.outcome = ok ? 'talked' : 'failed';
    res.chance = p;
    res.toasts.push({ key: ok ? 'toast.crime.talked' : 'toast.crime.talkFailed', vars: {}, kind: ok ? 'reward' : 'warning' });
    return res;
  }

  /** @returns {number} the bribe: $20 × Heat after the 'police.bribe' price modifiers (Fast Talker ×0.5). */
  function bribeCost(s) {
    return SR.rules.act.price(s, T().police.bribe.perHeat * s.stats.heat, 'police.bribe', {}).price;
  }

  /**
   * Bribe the officer (B-11d): $20 × Heat in cash, -30 Heat, -3 karma.
   * @returns {object} a partial Result (ok: false when short of cash)
   */
  function policeBribe(s) {
    var B = T().police.bribe, cost = bribeCost(s);
    if (s.money.cash < cost) return { ok: false, reason: 'reason.needCash', vars: { n: cost, money: money(cost) } };
    s.money.cash -= cost;
    SR.rules.stats.heat(s, B.heat);
    SR.rules.stats.karma(s, B.karma);
    var res = partial();
    res.outcome = 'bribed';
    res.toasts.push({ key: 'toast.crime.bribed', vars: { money: money(cost) }, kind: 'info' });
    return res;
  }

  /**
   * Run (B-11d): the chase is the world's (js/world/police.js); caught means jail for
   * 2 + floor(Heat / 25) days, escaping costs nothing.
   * @param {boolean=} caught default true
   * @returns {object} a partial Result
   */
  function policeRun(s, caught, ctx) {
    if (caught === false) {
      var res = partial();
      res.outcome = 'escaped';
      res.toasts.push({ key: 'toast.crime.escaped', vars: {}, kind: 'reward' });
      return res;
    }
    var j = jail(s, 'police', ctx);
    j.outcome = 'caught';
    return j;
  }

  /**
   * McHolland's interrogation (B-30 `interrogation`, P1): two wins of three: -10 Heat and he walks
   * off; otherwise jail for 2 + floor(Heat / 25) days ("questioning").
   * @param {object} r the Duel result ({ beats, wins })
   * @returns {object} a partial Result
   */
  function interrogation(s, r, ctx) {
    var I = SR.tuning.duel.interrogation;
    if (winsOf(r) >= I.need) {
      SR.rules.stats.heat(s, I.win.heat);
      var res = partial();
      res.toasts.push({ key: 'toast.crime.interrogationWin', vars: {}, kind: 'reward' });
      return res;
    }
    return jail(s, 'questioning', ctx);
  }

  /**
   * McHolland's "Pass a tip" (B-27 civic.mchollandTip, P1 `police`): an informant, not Wicked, once
   * a week: Heat × 0.5 (floor). Its 30 minutes are the Precinct row's cost.
   * @returns {object} a partial Result
   */
  function mchollandTip(s) {
    var M = SR.tuning.civic.mchollandTip, m = s.npc.mcholland || {};
    if (!feat('police')) return no('reason.featureOff');
    if (m.stage !== 'informant' || s.stats.karma <= SR.tuning.karma.tiers.wicked) return no('reason.notNow');
    if ((s.weekly.mchollandTip || 0) >= M.weekly) return no('reason.weeklyLimit');
    s.weekly.mchollandTip = (s.weekly.mchollandTip || 0) + 1;
    s.stats.heat = Math.floor(s.stats.heat * M.heatMult);
    var res = partial();
    res.toasts.push({ key: 'toast.crime.tip', vars: { heat: s.stats.heat }, kind: 'info' });
    return res;
  }

  /**
   * McHolland's bribe (B-27 civic.mchollandBribe, P1 `police`): $2,000 in cash at karma < 0; no Heat
   * gains for 7 days (npc.mcholland.bribedUntil, inclusive: today and the next 6).
   * @returns {object} a partial Result
   */
  function mchollandBribe(s) {
    var M = SR.tuning.civic.mchollandBribe;
    if (!feat('police')) return no('reason.featureOff');
    if (s.stats.karma >= M.karmaBelow) return no('reason.karmaHigh', { max: M.karmaBelow - 1, have: s.stats.karma });
    if (s.money.cash < M.cash) return no('reason.needCash', { n: M.cash, money: money(M.cash) });
    s.money.cash -= M.cash;
    var m = s.npc.mcholland || (s.npc.mcholland = { stage: 'none', bribedUntil: 0 });
    m.bribedUntil = s.clock.day + M.days - 1;
    var res = partial();
    res.toasts.push({ key: 'toast.crime.mchollandBribed', vars: { day: m.bribedUntil }, kind: 'info' });
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Named fns for the building data (CONTRACT §8.5)

  SR.def.fn('crime.canRob', function (s, params, ctx, target) { return robPrecheck(s, target || params.target); });
  SR.def.fn('crime.rob', function (s, params, ctx, target) { return rob(s, target || params.target, ctx); });
  SR.def.fn('crime.robResolve', function (s, params, ctx, target) { return robResolveOpen(s, target || params.target, params, ctx); });
  SR.def.fn('crime.jail', function (s, params, ctx, reason) { return jail(s, reason || params.reason || 'police', ctx); });
  SR.def.fn('crime.jailDay', function (s, params, ctx, choice) { return jailDay(s, choice || params.choice, ctx); });
  SR.def.fn('crime.canBail', function (s) { return canBail(s); });
  SR.def.fn('crime.bailCost', function (s) { return bail(s); });
  SR.def.fn('crime.payBail', function (s) { return payBail(s); });
  SR.def.fn('crime.fine', function (s, params, ctx, n) { return fine(s, n !== undefined ? n : params.points); });
  SR.def.fn('crime.policeTalk', function (s, params, ctx) { return policeTalk(s, ctx); });
  SR.def.fn('crime.policeBribe', function (s) { return policeBribe(s); });
  SR.def.fn('crime.policeRun', function (s, params, ctx) { return policeRun(s, params.caught !== false, ctx); });
  SR.def.fn('crime.interrogation', function (s, params, ctx) { return interrogation(s, params, ctx); });
  SR.def.fn('crime.mchollandTip', function (s) { return mchollandTip(s); });
  SR.def.fn('crime.mchollandBribe', function (s) { return mchollandBribe(s); });

  SR.rules.crime = {
    JAIL_CHOICES: JAIL_CHOICES.slice(),
    robPrecheck: robPrecheck,
    holdupD: holdupD,
    holdupChances: holdupChances,
    holdupParams: holdupParams,
    holdupAuto: holdupAuto,
    recentBankRobberies: recentBankRobberies,
    rob: rob,
    robResolve: robResolve,
    jailDays: jailDays,
    bailBase: bailBaseOf,
    jail: jail,
    jailDay: jailDay,
    release: release,
    bail: bail,
    canBail: canBail,
    payBail: payBail,
    fine: fine,
    talkChance: talkChance,
    policeTalk: policeTalk,
    bribeCost: bribeCost,
    policeBribe: policeBribe,
    policeRun: policeRun,
    interrogation: interrogation,
    mchollandTip: mchollandTip,
    mchollandBribe: mchollandBribe,
  };
})();
