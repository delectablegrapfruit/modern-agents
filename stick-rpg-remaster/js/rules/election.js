// js/rules/election.js — owner: W1-C. SR.rules.election: the nomination, the war chest, the seven
// campaign days, the debate, election night, the office and its decrees (GDD §4.17; BALANCE B-17;
// ARCHITECTURE §6.5). Status: none → nominated → campaign → office | lost; office → removed (a
// karma flip); lost, removed and a lapsed offer may run again from retryFromDay.
//
// Who calls what:
//   the night (js/rules/night.js, W1-E): step 5 the rival's daily gain, the campaign counter, the
//     debate no-show and electionNight(s, rng); the lapse of an unaccepted offer; step 12
//     nominationCheck(s) every morning and officeMorning(s, rng) while in office. Their partial
//     Results (msgs, log, events, lines) are delivered by the night.
//   City Hall's data (W2-Civic): 'election.accept' (args or params.chest), 'election.campaign'
//     (args the campaign action; its cost may be the action's `cost: { cash: 'election.cash', min:
//     'election.min' }`), 'election.canCampaign', 'election.debateStart' / 'election.debate', and
//     the Mayor's Office (P1 `civicPlus`): 'election.decree' (params.id, params.name).
//   Stepping into the city (orig: the nomination is checked there): 'election.check'.
// Every poll change is rounded to 0.1 and the poll is clamped to 0..100 after every change.
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var ACTIONS = ['rally', 'tvAd', 'doorKnock', 'kissBabies', 'intimidate', 'bribe'];
  var RIVAL = { president: 'doodle', dictator: 'crayon' };   // Mayor Doodle / General Crayon (GDD §6.2)
  // GDD §4.17 numbers that BALANCE B-17 does not tabulate (docs/requests/W1-C.md asks to move them):
  var PUBLIC_LIBRARY_STUDY = 3;      // Public Library Act: Study gives +3 INT
  var UNIVERSAL_FRIES_KARMA = 10;    // Universal Basic Fries: +10 karma

  function T() { return SR.tuning.election; }
  function feat(flag) { return !!SR.features[flag]; }
  function perk(s, id) { return !!(SR.rules.perks && SR.rules.perks.has(s, id)); }
  function yes() { return { ok: true, reason: null, vars: null }; }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function refuse(r) { return { ok: false, reason: r.reason, vars: r.vars || {} }; }
  function partial() { return SR.rules.effects.partial(); }
  function round1(x) { return Math.round(x * 10 + (x >= 0 ? 1e-9 : -1e-9)) / 10; }
  function money(n) { return SR.text.money(n); }

  /** @returns {number} a poll value rounded to 0.1 and clamped to 0..100 (B-17 pollClamp). */
  function clampPoll(v) { var c = T().pollClamp; return round1(SR.util.clamp(v, c[0], c[1])); }

  function lowest(s) { return Math.min(s.stats.str, s.stats.int, s.stats.cha); }

  function electionEvent(s) { return { name: 'election', payload: { status: s.election.status, poll: s.election.poll } }; }

  function line(res, icon, key, vars, weight) {
    (res.lines || (res.lines = [])).push({ section: 'election', icon: icon, key: key, vars: vars || {}, weight: weight || 0 });
  }

  // --------------------------------------------------------------------------------------------
  // The nomination (B-17 requires)

  /**
   * The nomination requirements (B-17; orig): live in the castle, cash + bank ≥ $200,000, and all
   * stats ≥ 666 with karma ≥ +25 (President) or all stats ≥ 777 with karma ≤ -25 (Dictator).
   * @returns {{ok: boolean, path: (string|null), missing: string[]}} missing: 'home', 'money',
   *   'stats', 'karma' (against the path the karma sign points to; the Road to Office lists them)
   */
  function qualifies(s) {
    var R = T().requires, missing = [];
    if (s.homes.living !== R.home) missing.push('home');
    if (s.money.cash + s.money.bank < R.money) missing.push('money');
    var k = s.stats.karma, low = lowest(s), path = k < 0 ? 'dictator' : 'president';
    var P = R[path];
    if (low < P.stats) missing.push('stats');
    if (path === 'president' ? k < P.karmaMin : k > P.karmaMax) missing.push('karma');
    return { ok: missing.length === 0, path: missing.length === 0 ? path : null, want: path, missing: missing };
  }

  /**
   * The morning (and city-entry) nomination check (GDD §4.17): when you qualify, are not already
   * running or in office, and day ≥ retryFromDay, the Electoral Board calls: status 'nominated'.
   * @returns {object} a partial Result (+ nominated: boolean; lines for the report)
   */
  function nominationCheck(s) {
    var el = s.election, res = partial();
    res.nominated = false;
    if (['none', 'lost', 'removed'].indexOf(el.status) < 0 || s.clock.day < (el.retryFromDay || 0)) return res;
    var q = qualifies(s);
    if (!q.ok) return res;
    el.status = 'nominated';
    el.path = q.path;
    el.nominatedDay = s.clock.day;
    el.poll = 0;
    el.chest = 0;
    el.campaignDay = 0;
    el.debateDone = false;
    res.nominated = true;
    var vars = { path: q.path, days: T().acceptWithin, day: s.clock.day + T().acceptWithin - 1 };
    res.msgs.push({ key: 'vm.board.nominated', vars: vars });
    res.log.push({ kind: 'nominated', vars: { path: q.path } });
    res.events.push(electionEvent(s));
    res.toasts.push({ key: 'toast.election.nominated', vars: vars, kind: 'reward' });
    line(res, 'ballot', 'toast.election.nominated', vars, 85);
    return res;
  }

  /** @returns {object|null} a war-chest tier (B-17) by index 0..2 or by its cash amount. */
  function chestTier(chest) {
    var W = T().warChest, n = Number(chest);
    if (n >= 0 && n < W.length && Math.floor(n) === n) return W[n];
    for (var i = 0; i < W.length; i++) if (W[i].cash === n) return W[i];
    return null;
  }

  /**
   * The starting poll (B-17): 30 + (lowest stat - 600) / 20 + |karma| / 10 + the chest's bonus, +5
   * with Magnetic (P1 perk), rounded to 0.1, clamped 0..100.
   * @returns {number}
   */
  function startPoll(s, chest) {
    var P = T().startPoll, tier = chestTier(chest);
    var v = P.base + (lowest(s) - P.statFrom) / P.statDiv + Math.abs(s.stats.karma) / P.karmaDiv + (tier ? tier.poll : 0);
    if (perk(s, 'magnetic')) v += P.magnetic;
    return clampPoll(v);
  }

  /**
   * Accepts the nomination (GDD §4.17): within 14 days, the requirements still met, the war chest
   * paid in full from cash, then the bank. Campaign day 1 is today.
   * @param {number} chest a tier index 0..2 or its cash (50,000 / 100,000 / 200,000)
   * @returns {object} a partial Result (ok: false with the reason)
   */
  function accept(s, chest) {
    var el = s.election, tier = chestTier(chest);
    if (el.status !== 'nominated') return no('reason.notNow');
    if (!tier) return no('reason.unavailable');
    var q = qualifies(s);
    if (!q.ok) return no('reason.notYet', { missing: q.missing.join(',') });
    if (s.money.cash + s.money.bank < tier.cash) return no('reason.needCash', { n: tier.cash, money: money(tier.cash) });
    var fromCash = Math.min(s.money.cash, tier.cash);
    s.money.cash -= fromCash;
    s.money.bank -= tier.cash - fromCash;
    el.path = q.path;
    el.status = 'campaign';
    el.chest = tier.cash;
    el.poll = startPoll(s, tier.cash);
    el.campaignDay = 1;
    el.debateDone = false;
    el.runs = (el.runs || 0) + 1;
    var res = partial();
    res.events.push(electionEvent(s));
    res.toasts.push({ key: 'toast.election.accepted', vars: { poll: el.poll, money: money(tier.cash) }, kind: 'reward' });
    res.sfx.push('stamp');
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // The campaign (B-17)

  /**
   * Whether a campaign action can run now (a condition): campaigning, the action's path, the flag
   * of Kiss babies (P1 `civicPlus`), today's cap.
   * @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  function canCampaign(s, id) {
    var el = s.election, A = T()[id];
    if (ACTIONS.indexOf(id) < 0 || !A) return no('reason.unknown', { id: id });
    if (id === 'kissBabies' && !feat('civicPlus')) return no('reason.featureOff');
    if (el.status !== 'campaign') return no('reason.notNow');
    if (A.path && el.path !== A.path) return no('reason.notNow');
    if ((s.daily.campaign && s.daily.campaign[id] || 0) >= A.cap) return no('reason.dailyLimit');
    return yes();
  }

  /** @returns {number} the check chance of a chance-based action (Kiss babies, Intimidate), else null. */
  function actionChance(s, id) {
    var A = T()[id];
    if (id === 'kissBabies') return SR.rules.check.chance(s.stats.cha, A.D, { s: s, checkId: 'campaign.kissBabies' });
    if (id === 'intimidate') return SR.rules.check.chance(s.stats[A.stat || 'str'], A.D, { s: s, checkId: 'campaign.intimidate' });
    return null;
  }

  /**
   * A campaign action (B-17): its cost (cash and time) unless the action's cost already took it,
   * the poll change (half, rounded to 0.1, for a repeat the same day), karma and Heat, today's use.
   * Draws: Kiss babies and Intimidate roll their check; a bribe rolls the scandal (10 %, -6).
   * @param {string} id 'rally' | 'tvAd' | 'doorKnock' | 'kissBabies' | 'intimidate' | 'bribe'
   * @param {object=} ctx the pipeline context ({ rng, cost })
   * @returns {object} a partial Result (+ delta; chance for previews)
   */
  function campaign(s, id, ctx) {
    ctx = ctx || { rng: SR.rng.rules };
    var c = canCampaign(s, id);
    if (!c.ok) return refuse(c);
    var A = T()[id], el = s.election, rng = ctx.rng || SR.rng.rules;
    var paid = !!(ctx.cost && (ctx.cost.cash > 0 || ctx.cost.min > 0));
    if (!paid) {
      if (s.money.cash < (A.cash || 0)) return no('reason.needCash', { n: A.cash, money: money(A.cash) });
      if (!SR.rules.time.canStart(s, A.min || 0)) return no('reason.tooLate', { time: SR.rules.time.fmt(SR.tuning.time.dayEnd) });
      s.money.cash -= A.cash || 0;
      SR.rules.time.spend(s, A.min || 0);
    }
    var daily = s.daily.campaign || (s.daily.campaign = {});
    var used = daily[id] || 0, res = partial(), change, p = actionChance(s, id), scandal = false;
    switch (id) {
      case 'rally': change = A.base + s.stats.cha / A.chaDiv; break;
      case 'kissBabies': change = SR.rules.check.roll(rng, p) ? A.poll : 0; break;
      case 'intimidate': change = SR.rules.check.roll(rng, p) ? A.poll : A.fail; break;
      default: change = A.poll;
    }
    change = round1(used >= 1 ? change * T().repeatHalf : change);
    if (id === 'doorKnock') SR.rules.stats.karma(s, A.karma);
    if (id === 'intimidate' || id === 'bribe') {
      SR.rules.stats.karma(s, A.karma);
      SR.rules.stats.heat(s, A.heat);
    }
    if (id === 'bribe' && SR.rules.check.roll(rng, A.scandal.chance)) {
      scandal = true;
      change = round1(change + A.scandal.poll);
    }
    var from = el.poll;
    el.poll = clampPoll(el.poll + change);
    daily[id] = used + 1;
    res.delta = round1(el.poll - from);
    if (p !== null) res.chance = p;
    res.events.push(electionEvent(s));
    res.toasts.push({ key: scandal ? 'toast.election.scandal' : 'toast.election.poll',
      vars: { delta: (res.delta >= 0 ? '+' : '') + res.delta, poll: el.poll }, kind: res.delta >= 0 ? 'reward' : 'warning' });
    return res;
  }

  /** @returns {{ok: boolean, reason: (string|null), vars: (object|null)}} the debate can start: day 4, once. */
  function canDebate(s) {
    var el = s.election;
    if (el.status !== 'campaign') return no('reason.notNow');
    if (el.campaignDay !== T().debate.day) return no('reason.wrongDay');
    if (el.debateDone) return no('reason.alreadyDone');
    return yes();
  }

  /** @returns {object} the `debate` skin's run params (B-17 / B-30: stance mode, 3 beats, D 500). */
  function debateParams(s) {
    var D = T().debate;
    return { D: D.D, beats: D.questions, check: 'duel.debate', mode: 'stance', path: s.election.path, rival: RIVAL[s.election.path] || null };
  }

  /**
   * Opens the debate (the named fn 'election.debateStart'; its 2 h are the action's cost).
   * @returns {object} a partial Result with `open`
   */
  function debateStart(s, ctx) {
    var c = canDebate(s);
    if (!c.ok) return refuse(c);
    var res = partial();
    res.open = { minigame: 'debate', skin: 'debate', params: debateParams(s), resolve: ctx && ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * The debate's result (B-17): +3 per won question, -2 per lost one; the debate is done.
   * @param {object|boolean[]} r the Duel result ({ beats, wins, losses }) or its beats
   * @returns {object} a partial Result
   */
  function debate(s, r) {
    var c = canDebate(s);
    if (!c.ok) return refuse(c);
    var D = T().debate, beats = Array.isArray(r) ? r : r && Array.isArray(r.beats) ? r.beats : [];
    var wins = r && !Array.isArray(r) && typeof r.wins === 'number' ? r.wins : beats.filter(Boolean).length;
    var losses = r && !Array.isArray(r) && typeof r.losses === 'number' ? r.losses : beats.length - wins;
    var el = s.election, from = el.poll;
    el.poll = clampPoll(el.poll + D.win * wins + D.lose * losses);
    el.debateDone = true;
    var res = partial();
    res.delta = round1(el.poll - from);
    res.events.push(electionEvent(s));
    res.toasts.push({ key: 'toast.election.debate', vars: { wins: wins, losses: losses, delta: (res.delta >= 0 ? '+' : '') + res.delta, poll: el.poll },
      kind: res.delta >= 0 ? 'reward' : 'warning' });
    return res;
  }

  /**
   * A campaign event (P1 `civicPlus`; B-17 eventChance): 40 % a campaign day, one of the 12 of
   * B-17 uniformly (2 draws when it happens, 1 otherwise). Meant for the morning of a campaign day.
   * @returns {object} a partial Result (+ event id or null; lines for the report)
   */
  function campaignMorning(s, rng) {
    var res = partial(), el = s.election;
    res.event = null;
    if (!feat('civicPlus') || el.status !== 'campaign') return res;
    rng = rng || SR.rng.rules;
    if (!SR.rules.check.roll(rng, T().eventChance)) return res;
    var ids = Object.keys(T().events), id = ids[rng.int(0, ids.length - 1)];
    var from = el.poll;
    el.poll = clampPoll(el.poll + T().events[id]);
    res.event = id;
    var vars = { delta: (el.poll - from >= 0 ? '+' : '') + round1(el.poll - from), poll: el.poll };
    res.events.push(electionEvent(s));
    line(res, 'campaign', 'toast.election.event.' + id, vars, 35);
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Election night and the office

  /**
   * Election night (B-17 win): poll + rand(-5..5) ≥ 50 (1 draw). A win takes office (job 8 / 9,
   * orig titles; the first decree offer the next morning); a loss keeps the money spent (orig) and
   * allows another run from 30 days later.
   * @returns {{won: boolean, poll: number, roll: number, path: string, events: object[], msgs: object[], log: object[]}}
   */
  function electionNight(s, rng) {
    var el = s.election, W = T().win, res = partial();
    rng = rng || SR.rng.rules;
    var roll = rng.int(W.jitter[0], W.jitter[1]);
    var won = el.poll + roll >= W.threshold, path = el.path || 'president';
    var rival = RIVAL[path];
    if (won) {
      el.status = 'office';
      s.job.office = path;
      el.decrees = [];
      el.offer = [];
      el.nextDecreeDay = s.clock.day + 1;
      el.flipMornings = 0;
      res.log.push({ kind: 'electionWon', vars: { path: path, poll: el.poll } });
      res.msgs.push({ key: 'vm.' + rival + '.concede', vars: { poll: el.poll } });
    } else {
      el.status = 'lost';
      el.retryFromDay = s.clock.day + T().retry;
      res.log.push({ kind: 'electionLost', vars: { path: path, poll: el.poll } });
      res.msgs.push({ key: 'vm.' + rival + '.gloat', vars: { poll: el.poll } });
    }
    res.events.push(electionEvent(s));
    res.won = won;
    res.poll = el.poll;
    res.roll = roll;
    res.path = path;
    return res;
  }

  /**
   * Leaves office (a karma flip: impeached or a coup): the office and its decrees end; the money is
   * kept; another run from 30 days later.
   * @returns {object} a partial Result
   */
  function remove(s) {
    var el = s.election, path = s.job.office || el.path, res = partial();
    s.job.office = null;
    el.status = 'removed';
    el.decrees = [];
    el.offer = [];
    el.nextDecreeDay = 0;
    el.flipMornings = 0;
    el.retryFromDay = s.clock.day + T().retry;
    var key = path === 'dictator' ? 'coup' : 'impeached';
    res.log.push({ kind: 'removed', vars: { path: path, how: key } });
    res.msgs.push({ key: 'vm.board.' + key, vars: { day: el.retryFromDay } });
    res.events.push(electionEvent(s));
    res.toasts.push({ key: 'toast.election.' + key, vars: {}, kind: 'warning' });
    line(res, 'election', 'toast.election.' + key, { day: el.retryFromDay }, 95);
    return res;
  }

  /**
   * The office morning (GDD §4.17): the karma-flip counter (a President below 0 or a Dictator above
   * 0 for 3 mornings in a row is removed) and, with `civicPlus`, a decree offer when due (on taking
   * office and every 7 days after; an unpicked offer is replaced).
   * @returns {object} a partial Result (lines for the report)
   */
  function officeMorning(s, rng) {
    var el = s.election, res = partial(), path = s.job.office;
    if (!path) return res;
    var k = s.stats.karma, wrong = path === 'dictator' ? k > 0 : k < 0;
    el.flipMornings = wrong ? (el.flipMornings || 0) + 1 : 0;
    if (el.flipMornings >= T().flip) return remove(s);
    if (wrong) line(res, 'warning', 'toast.election.flipWarn', { n: el.flipMornings, of: T().flip }, 60);
    if (feat('civicPlus') && s.clock.day >= (el.nextDecreeDay || 0)) {
      el.offer = decreeOffer(s, rng);
      el.nextDecreeDay = s.clock.day + T().decreeEvery;
      if (el.offer.length) line(res, 'decree', 'toast.election.decreeOffer', { n: el.offer.length }, 40);
    }
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Decrees (P1 `civicPlus`)

  /** @returns {string} the path an office holder's decrees are chosen for. */
  function pathOf(s) { return s.job.office || s.election.path || 'president'; }

  /**
   * The decrees that may be offered (GDD §4.17): the flag is on, the path matches ('any' or yours),
   * not active, and a once-only decree never used before.
   * @returns {string[]} ids in registration order
   */
  function eligible(s) {
    var el = s.election, path = pathOf(s);
    return SR.registry.entries('decree').filter(function (e) {
      var d = e.def;
      if (d.feature && !SR.features[d.feature]) return false;
      if (d.path !== 'any' && d.path !== path) return false;
      if ((el.decrees || []).indexOf(e.id) >= 0) return false;
      if (d.once && (el.decreesUsed || []).indexOf(e.id) >= 0) return false;
      return true;
    }).map(function (e) { return e.id; });
  }

  /**
   * Three random eligible decrees (fewer when fewer are eligible), without repeats; one draw per card.
   * @returns {string[]}
   */
  function decreeOffer(s, rng) {
    rng = rng || SR.rng.rules;
    var pool = eligible(s), out = [];
    while (out.length < T().decreeOffer && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    return out;
  }

  /**
   * Issues a decree from the Mayor's desk: it stays active for the term (a once-only decree is also
   * remembered forever), its issue effects run (Seize the Bank's $250,000, Rename the City's name),
   * the offer closes.
   * @param {string} id a decree on offer
   * @param {object=} params { name } for Rename the City
   * @returns {object} a partial Result
   */
  function decree(s, id, params, ctx) {
    var el = s.election, def = SR.reg.decree[id];
    if (!feat('civicPlus')) return no('reason.featureOff');
    if (!s.job.office || !def) return no('reason.notNow');
    if ((el.offer || []).indexOf(id) < 0) return no('reason.notNow');
    if (def.path !== 'any' && def.path !== pathOf(s)) return no('reason.notNow');
    ctx = Object.assign({ rng: SR.rng.rules }, ctx || {}, { params: params || {} });
    var res = partial();
    // Issue effects: named fns merge straight into this Result; other effects run through the
    // pipeline's runner, whose messages and log entries are delivered at once (so they are not
    // handed back to be delivered twice).
    var list = def.effects || [];
    for (var i = 0; i < list.length; i++) {
      var eff = list[i];
      if (eff[0] === 'fn' && typeof SR.reg.fn[eff[1]] === 'function') {
        var r = SR.reg.fn[eff[1]].apply(null, [s, ctx.params, ctx].concat(eff.slice(2)));
        if (r && r.ok === false) return r;
        if (r) ['msgs', 'toasts', 'stamps', 'sfx', 'anims', 'events', 'log'].forEach(function (k) { Array.prototype.push.apply(res[k], r[k] || []); });
      } else {
        var tmp = SR.rules.effects.run(s, [eff], ctx);
        if (tmp.ok === false) return { ok: false, reason: tmp.reason, vars: tmp.vars };
        ['toasts', 'stamps', 'sfx', 'anims', 'events'].forEach(function (k) { Array.prototype.push.apply(res[k], tmp[k] || []); });
      }
    }
    (el.decrees || (el.decrees = [])).push(id);
    if (def.once) (el.decreesUsed || (el.decreesUsed = [])).push(id);
    el.offer = [];
    res.log.push({ kind: 'decree', vars: { id: id } });
    res.events.push({ name: 'decree', payload: { id: id } });
    res.stamps.push({ key: 'stamp.election.decree', vars: { id: id } });
    return res;
  }

  /** @returns {string} the decree's name text key for the office holder's path (Tough on Crime / Martial Law). */
  function decreeName(s, id) {
    var d = SR.reg.decree[id];
    if (!d) return '';
    return d.names && d.names[pathOf(s)] ? d.names[pathOf(s)] : d.name;
  }

  // --------------------------------------------------------------------------------------------
  // Named fns (CONTRACT §8.5)

  /** The campaign action a row stands for: params.action, else its id's last segment ('cityhall.rally'). */
  function actionOf(params, ctx, arg) {
    if (arg) return arg;
    if (params && params.action) return params.action;
    var id = ctx && ctx.id ? String(ctx.id).replace(/:resolve$/, '') : '';
    return id.slice(id.lastIndexOf('.') + 1);
  }

  SR.def.fn('election.check', function (s) { return nominationCheck(s); });
  SR.def.fn('election.qualifies', function (s) {
    var q = qualifies(s);
    return q.ok ? yes() : no('reason.notYet', { missing: q.missing.join(',') });
  });
  SR.def.fn('election.accept', function (s, params, ctx, chest) { return accept(s, chest !== undefined ? chest : params.chest); });
  SR.def.fn('election.canCampaign', function (s, params, ctx, id) { return canCampaign(s, actionOf(params, ctx, id)); });
  SR.def.fn('election.campaign', function (s, params, ctx, id) { return campaign(s, actionOf(params, ctx, id), ctx); });
  SR.def.fn('election.cash', function (s, params, ctx) { var A = T()[actionOf(params, ctx)]; return A ? A.cash || 0 : 0; });
  SR.def.fn('election.min', function (s, params, ctx) { var A = T()[actionOf(params, ctx)]; return A ? A.min || 0 : 0; });
  SR.def.fn('election.canDebate', function (s) { return canDebate(s); });
  SR.def.fn('election.debateStart', function (s, params, ctx) { return debateStart(s, ctx); });
  SR.def.fn('election.debate', function (s, params) { return debate(s, params); });
  SR.def.fn('election.decree', function (s, params, ctx) { return decree(s, params.id, params, ctx); });

  // Decree issue effects (js/data/decrees.js) and the Public Library's study gain.
  SR.def.fn('decree.seizeBank', function (s) {
    var B = T().seizeBank;
    SR.rules.effects.credit(s, 'cash', B.cash, 'loot');
    SR.rules.stats.karma(s, B.karma);
    return { toasts: [{ key: 'toast.election.seized', vars: { n: B.cash, money: money(B.cash) }, kind: 'reward' }] };
  });
  SR.def.fn('decree.universalFries', function (s) {
    SR.rules.stats.karma(s, UNIVERSAL_FRIES_KARMA);
    return {};
  });
  SR.def.fn('decree.renameCity', function (s, params) {
    var name = typeof (params && params.name) === 'string' ? params.name.replace(/\s+/g, ' ').trim().slice(0, SR.tuning.start.nameMax) : '';
    if (!name) return { ok: false, reason: 'reason.unavailable', vars: {} };
    s.election.cityName = name;
    return {};
  });
  /** A numeric argument for U of S Study: tuning.training.study.gain, or 3 under the Public Library Act. */
  SR.def.fn('decree.studyGain', function (s) {
    var active = ((s.election && s.election.decrees) || []).indexOf('publicLibrary') >= 0;
    return active ? PUBLIC_LIBRARY_STUDY : SR.tuning.training.study.gain;
  });

  SR.rules.election = {
    ACTIONS: ACTIONS.slice(),
    RIVAL: { president: RIVAL.president, dictator: RIVAL.dictator },
    clampPoll: clampPoll,
    qualifies: qualifies,
    nominationCheck: nominationCheck,
    chestTier: chestTier,
    startPoll: startPoll,
    accept: accept,
    canCampaign: canCampaign,
    actionChance: actionChance,
    campaign: campaign,
    canDebate: canDebate,
    debateParams: debateParams,
    debateStart: debateStart,
    debate: debate,
    campaignMorning: campaignMorning,
    electionNight: electionNight,
    remove: remove,
    officeMorning: officeMorning,
    eligible: eligible,
    decreeOffer: decreeOffer,
    decree: decree,
    decreeName: decreeName,
  };
})();
