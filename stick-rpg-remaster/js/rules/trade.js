// js/rules/trade.js — owner: W2-RulesC (W1-C in wave 1). SR.rules.trade: the bus depot's trips (GDD §4.11; BALANCE B-12;
// ARCHITECTURE §6.5): smuggling on the red-eye (P0) and speaking tours (P1 `tours`), with the daily
// demand, reputation, haggling and the vest in muggings (P1 `tours`).
//
// Smuggling (the named fn 'trade.smuggle', params.city or args city): canBoard('smuggle') (00:00
// only, the ticket), the ticket (price target ticket.<city>; not taken twice when the row's cost is
// the named fn 'trade.ticket'), the clock to 24:00, then trip(), which
// resolves the original's handler in its order (GDD §4.11):
//   1 nothing to sell → wasted · 2 no gun → mugged · 3 no ammo → mugged · 4 STR < 100 + rand(0..range)
//   → mugged · 5 no phone → no buyers · 6 carrying more than 50 - floor(Heat/5) of either commodity
//   (Crayonburg: at least that many) → busted (jail) · 7 screwed (10 %; P1 -1 % per reputation, min
//   3 %) · 8 the buyer's want (Crayonburg and Las Pegas draw it) and the offer for all of it.
// Draws, in order: the mugging roll (always), then only when the trip reaches them: the screwed roll,
// the want (cities that want either), the offer's jitter and its sign. A final outcome raises the
// `trip` rule event (its payload also carries the story's text key and vars); an offer waits in
// state.trade.offer until 'trade.take', 'trade.haggle' (P1) or 'trade.walk'.
// Tours (P1): 'trade.tourStart' boards (06:00-10:00, the ticket, the clock to 24:00) and opens the
// `tourhook` skin; '<id>:resolve' runs 'trade.tour' with the hook's result (the city waits in
// state.trade.offer): the mugging check (pocket cash only), the fee wired to the bank.
// Demand varies per city per day from hash(seed, day, city) (like Red's weekly price), so it needs
// no draw and every screen shows the same number all day; rollDemand writes it to state.trade.
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var GOODS = { booze: 'booze', product: 'snow' };   // commodity → the item key (orig "booze" and the product)

  function B() { return SR.tuning.bus; }
  function feat(flag) { return !!SR.features[flag]; }
  function perk(s, id) { return !!(SR.rules.perks && SR.rules.perks.has(s, id)); }
  function rng0(ctx) { return (ctx && ctx.rng) || SR.rng.rules; }
  function yes() { return { ok: true, reason: null, vars: null }; }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function partial() { return SR.rules.effects.partial(); }
  function money(n) { return SR.text.money(n); }
  function cityName(id) { return SR.text.has('city.' + id + '.name') ? SR.text('city.' + id + '.name') : id; }
  function goodsName(c) { return SR.text('trip.goods.' + c); }
  function trade(s) { return s.trade || (s.trade = {}); }

  /** @returns {string[]} the city ids in destination-board order (the defs; else the tuning table). */
  function cityIds() {
    var defs = SR.registry.entries('city').map(function (e) { return e.def; });
    if (defs.length) return defs.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).map(function (d) { return d.id; });
    return Object.keys(B().cities);
  }

  /** @returns {object|null} a city's B-12a row. */
  function row(id) { return Object.prototype.hasOwnProperty.call(B().cities, id) ? B().cities[id] : null; }

  /** @returns {number} the ticket after the price modifiers (target ticket.<city>; Nationalised: $0). */
  function ticket(s, id) {
    var r = row(id);
    return r ? SR.rules.act.price(s, r.ticket, 'ticket.' + id, {}).price : 0;
  }

  /** @returns {number} a uniform integer lo..hi derived from hash(seed, tag, day, city): the same all day, no draw. */
  function dayRand(s, tag, id, lo, hi) {
    var u = SR.util.hash(s.seed, tag, s.clock.day, id) / 4294967296;
    return lo + Math.floor(u * (hi - lo + 1));
  }

  /** @returns {number} today's demand factor of a city (P1 `tours`: rand(85..115) / 100; else 1). */
  function dailyDemand(s, id) {
    if (!feat('tours')) return 1;
    var D = B().demandDaily;
    return dayRand(s, 'demand', id, D.rand[0], D.rand[1]) / D.div;
  }

  /** @returns {number} today's tour demand of a city: rand(80..130) / 100 (B-12 tour.fee). */
  function tourDemand(s, id) {
    var F = B().tour.fee;
    return dayRand(s, 'tourDemand', id, F.demand[0], F.demand[1]) / F.demandDiv;
  }

  /**
   * The demand multiplier on an offer: the city's B-12a column for the commodity × today's factor.
   * @param {string} commodity 'booze' | 'product'
   * @returns {number} 0 when the city's buyers never want it
   */
  function demand(s, id, commodity) {
    var r = row(id);
    if (!r || r[commodity] === null || r[commodity] === undefined) return 0;
    return r[commodity] * dailyDemand(s, id);
  }

  /**
   * Writes today's demand of every city to state.trade (the Rumour board, P1) and returns it.
   * @returns {{day: number, demand: object, tourDemand: object}}
   */
  function rollDemand(s) {
    var t = trade(s), d = { day: s.clock.day }, td = { day: s.clock.day };
    cityIds().forEach(function (id) { d[id] = dailyDemand(s, id); td[id] = tourDemand(s, id); });
    t.demand = d;
    t.tourDemand = td;
    return { day: s.clock.day, demand: d, tourDemand: td };
  }

  /** @returns {number} a city's reputation 0..10 (P1 `tours`; 0 while the flag is off). */
  function reputation(s, id) {
    if (!feat('tours')) return 0;
    var r = trade(s).rep || {};
    return r[id] || 0;
  }

  function addRep(s, id, n) {
    if (!feat('tours')) return 0;
    var t = trade(s), r = t.rep || (t.rep = {}), from = r[id] || 0;
    r[id] = Math.min(B().take.repMax, from + n);
    return r[id] - from;
  }

  /** @returns {number} the bust threshold: 50 - floor(Heat / 5) (orig), Pack Mule +10 (P1 perk). */
  function bustThreshold(s) {
    var b = B().bustThreshold;
    return b.base - Math.floor(s.stats.heat / b.heatDiv) + (perk(s, 'packMule') ? b.packMule : 0);
  }

  /** @returns {boolean} carrying too much of either commodity for this city's bust rule (orig). */
  function busted(s, id) {
    var r = row(id), t = bustThreshold(s);
    var over = function (n) { return r.bust === 'gte' ? n >= t : n > t; };
    return over(s.items.booze || 0) || over(s.items.snow || 0);
  }

  /** @returns {number} the chance of being screwed: 10 % (orig), P1 -1 % per reputation, min 3 %. */
  function screwedChance(s, id) {
    var sc = B().screwed;
    return Math.max(sc.min, sc.base - sc.perRep * reputation(s, id));
  }

  /** @returns {number} P(mugged) at step 4 for the UI: STR < 100 + rand(0..range). */
  function mugChance(s, id) {
    var r = row(id), base = B().mugCheck.base;
    if (!r) return 0;
    return SR.util.clamp((base + r.mug - s.stats.str) / (r.mug + 1), 0, 1);
  }

  /**
   * The offer per unit (orig formulas, B-12): booze max(5, min(CHA/6, 50) ± rand(0..4)), product
   * max(50, min(2·CHA, 600) ± rand(0..49)); 2 draws (the jitter, then its sign). Before demand.
   * @param {string} commodity 'booze' | 'product'
   * @returns {number}
   */
  function offerPerUnit(s, commodity, rng) {
    var O = B().offer, cha = s.stats.cha, v;
    rng = rng || SR.rng.rules;
    if (commodity === 'booze') {
      v = Math.min(cha / O.booze.chaDiv, O.booze.cap);
      var jb = rng.int(0, O.booze.jitter);
      v += rng.int(0, 1) ? jb : -jb;
      return Math.max(O.booze.min, v);
    }
    v = Math.min(O.product.chaMult * cha, O.product.cap);
    var jp = rng.int(0, O.product.jitter);
    v += rng.int(0, 1) ? jp : -jp;
    return Math.max(O.product.min, v);
  }

  /** @returns {number} the multiplier on every offer: demand × Wicked +10 % (P1 `karmaTiers`). */
  function offerMult(s, id, commodity) {
    var m = demand(s, id, commodity);
    if (feat('karmaTiers') && SR.rules.stats.tier(s.stats.karma) === 'wicked') m *= 1 + B().offer.wicked;
    return m;
  }

  // --------------------------------------------------------------------------------------------
  // Boarding

  /** @returns {boolean} the job is Executive or better (NLI ladder) or the player is in office. */
  function execOrBetter(s) {
    var need = B().tour.requires.job;
    return SR.rules.conditions.eval(s, ['jobAtLeast', need], {}).ok || !!s.job.office;
  }

  /**
   * Whether the bus can be boarded (B-12, B-01): 'smuggle' only at 00:00 (orig) with the ticket;
   * 'tour' (P1 `tours`) at 06:00-10:00 with CHA ≥ 150, karma ≥ 0, a phone, a job of Executive or
   * better or the Theatre degree, one tour per city per week, and the ticket.
   * @param {string} kind 'smuggle' | 'tour'
   * @param {{paid: boolean}=} opts paid: the ticket was already taken (the row's cost), skip its check
   * @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  function canBoard(s, kind, id, opts) {
    if (!row(id)) return no('reason.unknown', { id: id });
    if (kind === 'tour') {
      if (!feat('tours')) return no('reason.featureOff');
      var R = B().tour.requires, w = B().tour.window;
      if (s.stats.cha < R.cha) return no('reason.needStat', { stat: SR.rules.conditions.label('cha'), min: R.cha, have: s.stats.cha });
      if (s.stats.karma < R.karma) return no('reason.karmaLow', { min: R.karma, have: s.stats.karma });
      if (R.phone && !((s.items.phone || 0) > 0)) return no('reason.needPhone');
      var degree = !!(SR.features.degrees && s.edu && s.edu.degrees && s.edu.degrees[R.degree]);
      if (!execOrBetter(s) && !degree) return no('reason.needJob', { job: SR.rules.conditions.nameOf('job', R.job) });
      var tw = trade(s).tourWeek || {};
      if (tw[id] === SR.rules.time.week(s)) return no('reason.weeklyLimit');
      if (s.clock.min < w[0]) return no('reason.notBefore', { time: SR.rules.time.fmt(w[0]) });
      if (s.clock.min > w[1]) return no('reason.notAfter', { time: SR.rules.time.fmt(w[1]) });
    } else if (s.clock.min !== SR.tuning.time.redEyeDeparts) {
      return no('reason.redEye', { time: SR.rules.time.fmt(SR.tuning.time.redEyeDeparts) });
    }
    var t = ticket(s, id);
    if (!(opts && opts.paid) && s.money.cash < t) return no('reason.needCash', { n: t, money: money(t) });
    return yes();
  }

  /** @returns {boolean} the action's own cost already took the ticket (`cost: { cash: 'trade.ticket' }`). */
  function paidBy(ctx) { return !!(ctx && ctx.cost && ctx.cost.cash > 0); }

  /**
   * Pays the ticket (unless the row's cost did), takes the day (the clock to 24:00) and marks the
   * city visited. @returns {number} the ticket
   */
  function board(s, id, paid) {
    var t = ticket(s, id);
    if (!paid) {
      s.money.cash -= t;
      if (s.records) s.records.spent = (s.records.spent || 0) + t;
    }
    SR.rules.time.setTo(s, SR.tuning.time.tripEndsAt);
    var tr = trade(s), v = tr.visited || (tr.visited = {});
    v[id] = true;
    s.records.citiesVisited = Object.keys(v).length;
    return t;
  }

  // --------------------------------------------------------------------------------------------
  // The smuggling trip

  /** @returns {number} a stable variant index for a story (the same trip always tells the same one). */
  function variant(s, id, tag) { return SR.util.hash(s.seed, s.clock.day, id, tag) % 1000; }

  function story(trip, key, vars) {
    trip.key = key;
    trip.vars = Object.assign({ city: cityName(trip.city), variant: trip.variant }, vars || {});
    return trip;
  }

  function tripEvent(trip) {
    return { name: 'trip', payload: { city: trip.city, kind: trip.kind, outcome: trip.outcome, units: trip.units || 0,
      cash: trip.cash || 0, key: trip.key, vars: trip.vars } };
  }

  /** Mugged at steps 2-4: all cash (P1 `tours`: the vest keeps half) and all goods (orig). */
  function mug(s, trip) {
    var L = B().mugLoss;
    var share = feat('tours') && (s.items.vest || 0) > 0 ? L.vestCash : L.cash;
    var lost = Math.floor(s.money.cash * share);
    trip.lost = { cash: lost, booze: s.items.booze || 0, snow: s.items.snow || 0 };
    s.money.cash -= lost;
    s.items.booze = 0;
    s.items.snow = 0;
    trip.outcome = 'mugged';
  }

  /**
   * Resolves a smuggling trip to a city in the original's order (see the header). The ticket and
   * the clock are the caller's (smuggle); a bust jails at once (the arrest night runs).
   * @param {object} s state (mutated)
   * @param {string} id city id
   * @param {object=} ctx the pipeline context ({ rng })
   * @returns {object} the Trip: { kind: 'smuggle', city, day, outcome: 'wasted'|'mugged'|'noBuyers'|
   *   'busted'|'screwed'|'offer', why, want, units, perUnit, total, lost, key, vars, jail? }
   */
  function trip(s, id, ctx) {
    var r = row(id), rng = rng0(ctx);
    var tr = { kind: 'smuggle', city: id, day: s.clock.day, outcome: null, why: null, want: null, units: 0, perUnit: 0,
      total: 0, cash: 0, lost: null, variant: variant(s, id, 'trip') };
    var roll = rng.int(0, r.mug);    // the original draws the mugging threshold first, every trip
    var booze = s.items.booze || 0, snow = s.items.snow || 0;
    if (booze + snow === 0) {
      tr.outcome = 'wasted';
      return story(tr, 'trip.wasted');
    }
    if (!((s.items.gun || 0) > 0)) { mug(s, tr); tr.why = 'noGun'; return story(tr, 'trip.mugged.noGun', lostVars(tr)); }
    if (!((s.items.ammo || 0) > 0)) { mug(s, tr); tr.why = 'noAmmo'; return story(tr, 'trip.mugged.noAmmo', lostVars(tr)); }
    if (s.stats.str < B().mugCheck.base + roll) { mug(s, tr); tr.why = 'weak'; return story(tr, 'trip.mugged.weak', lostVars(tr)); }
    if (!((s.items.phone || 0) > 0)) { tr.outcome = 'noBuyers'; tr.why = 'noPhone'; return story(tr, 'trip.noBuyers.noPhone'); }
    if (busted(s, id)) {
      tr.outcome = 'busted';
      tr.units = booze + snow;
      tr.lost = { cash: 0, booze: booze, snow: snow, gun: s.items.gun || 0, ammo: s.items.ammo || 0 };
      s.items.booze = 0;
      s.items.snow = 0;
      s.items.gun = 0;
      s.items.ammo = 0;
      return story(tr, 'trip.busted');
    }
    if (SR.rules.check.roll(rng, screwedChance(s, id))) {
      tr.outcome = 'screwed';
      tr.lost = { cash: 0, booze: booze, snow: snow };
      tr.units = booze + snow;
      s.items.booze = 0;
      s.items.snow = 0;
      return story(tr, 'trip.screwed');
    }
    var want = r.wants === 'either' ? (rng.int(0, 1) ? 'product' : 'booze') : r.wants;
    tr.want = want;
    var units = s.items[GOODS[want]] || 0;
    if (!units) { tr.outcome = 'noBuyers'; tr.why = 'noWant'; return story(tr, 'trip.noBuyers.noWant', { goods: goodsName(want) }); }
    var per = offerPerUnit(s, want, rng) * offerMult(s, id, want);
    tr.units = units;
    tr.perUnit = Math.round(per * 100) / 100;
    tr.total = Math.round(per * units);
    tr.outcome = 'offer';
    story(tr, 'trip.offer', { units: units, goods: goodsName(want), n: tr.total, money: money(tr.total) });
    trade(s).offer = SR.util.clone(tr);
    return tr;
  }

  function lostVars(tr) {
    return { n: tr.lost.cash, money: money(tr.lost.cash), booze: tr.lost.booze, snow: tr.lost.snow };
  }

  /**
   * Boards the red-eye and resolves the trip (the named fn 'trade.smuggle').
   * @returns {object} a partial Result: the `trip` event of a final outcome (a bust also jails:
   *   jailed, report), and `trip` (the Trip); an offer waits in state.trade.offer
   */
  function smuggle(s, id, ctx) {
    var c = canBoard(s, 'smuggle', id, { paid: paidBy(ctx) });
    if (!c.ok) return { ok: false, reason: c.reason, vars: c.vars };
    board(s, id, paidBy(ctx));
    var tr = trip(s, id, ctx), res = partial();
    res.trip = tr;
    if (tr.outcome === 'offer') return res;
    if (tr.outcome === 'busted') {
      if (SR.rules.log) SR.rules.log.add(s, 'busted', { city: id });   // before the arrest night rolls the log
      var C = SR.rules.crime;
      if (C && typeof C.jail === 'function') {
        res = C.jail(s, 'bust', ctx);
        tr.jail = res.days;
        res.trip = tr;
      }
      res.events.unshift(tripEvent(tr));
      res.toasts.unshift({ key: 'toast.trade.busted', vars: {}, kind: 'warning' });
      return res;
    }
    res.events.push(tripEvent(tr));
    if (tr.outcome === 'mugged') res.toasts.push({ key: 'toast.trade.mugged', vars: lostVars(tr), kind: 'warning' });
    return res;
  }

  /** @returns {object|null} the pending offer (a Trip) if it is today's, else null. */
  function pending(s, tr, kind) {
    tr = tr || trade(s).offer;
    if (!tr || tr.day !== s.clock.day || (kind && tr.kind !== kind)) return null;
    return tr;
  }

  /**
   * Take it (B-12 take): the cash (income 'deal', through the lien), the goods go, -5 karma (orig),
   * +5 Heat per 10 units (rounded up), +1 reputation (P1), and a 50 % chance of a voicemail from one
   * of 5 buyers, each once (orig; 1 draw).
   * @param {object=} tr the Trip (default: state.trade.offer)
   * @returns {object} a partial Result with the `trip` event (outcome 'sold')
   */
  function take(s, tr, ctx, bonus) {
    tr = pending(s, tr, 'smuggle');
    if (!tr || tr.outcome !== 'offer') return { ok: false, reason: 'reason.notNow', vars: {} };
    var K = B().take, V = B().buyerVoicemail, rng = rng0(ctx), res = partial();
    var total = bonus ? Math.round(tr.total * bonus) : tr.total;
    var key = GOODS[tr.want], units = Math.min(tr.units, s.items[key] || 0);
    // A trip handed in again after its goods are gone (an explicit, already-taken Trip) sells nothing.
    if (units <= 0) return { ok: false, reason: 'reason.notNow', vars: {} };
    if (units < tr.units) total = Math.round(total * units / tr.units);
    s.items[key] = (s.items[key] || 0) - units;
    SR.rules.effects.credit(s, 'cash', total, 'deal');
    SR.rules.stats.karma(s, K.karma);
    SR.rules.stats.heat(s, K.heatPer10 * Math.ceil(units / 10));
    addRep(s, tr.city, K.rep);
    var t = trade(s);
    t.smuggleProfit = (t.smuggleProfit || 0) + total;
    var buyers = t.buyers || (t.buyers = []);
    var r = rng.int(0, Math.round(V.buyers / V.chance) - 1);
    if (r < V.buyers && !buyers[r]) {
      buyers[r] = 1;
      res.msgs.push({ key: 'trip.vm.buyer' + (r + 1), vars: { from: 'buyer' + (r + 1), city: cityName(tr.city) } });
    }
    t.offer = null;
    var done = Object.assign({}, tr, { outcome: 'sold', units: units, cash: total });
    story(done, bonus ? 'trip.haggled' : 'trip.sold', { units: units, goods: goodsName(tr.want), n: total, money: money(total) });
    res.events.push(tripEvent(done));
    res.log.push({ kind: 'smuggleDeal', vars: { city: tr.city, n: total } });
    res.toasts.push({ key: 'toast.trade.sold', vars: { n: total, money: money(total), units: units }, kind: 'reward' });
    res.trip = done;
    return res;
  }

  /**
   * Haggle (P1 `tours`, B-12 haggle): chance(CHA, 150) (check trade.haggle; Smooth Talker +0.10;
   * 1 draw): the deal at +12 %; on failure the buyer walks.
   * @returns {object} a partial Result
   */
  function haggle(s, tr, ctx) {
    if (!feat('tours')) return { ok: false, reason: 'reason.featureOff', vars: {} };
    tr = pending(s, tr, 'smuggle');
    if (!tr || tr.outcome !== 'offer') return { ok: false, reason: 'reason.notNow', vars: {} };
    var H = B().haggle, p = SR.rules.check.chance(s.stats.cha, H.D, { s: s, checkId: 'trade.haggle' });
    if (SR.rules.check.roll(rng0(ctx), p)) {
      var r = take(s, tr, ctx, 1 + H.bonus);
      r.chance = p;
      return r;
    }
    var w = walk(s, tr, 'trip.haggleFailed');
    w.chance = p;
    return w;
  }

  /** Walk away (or the buyer walks after a failed haggle): nothing changes hands. */
  function walk(s, tr, key) {
    tr = pending(s, tr, 'smuggle');
    if (!tr) return { ok: false, reason: 'reason.notNow', vars: {} };
    trade(s).offer = null;
    var res = partial(), done = Object.assign({}, tr, { outcome: 'walked', cash: 0 });
    story(done, key || 'trip.walked', { goods: goodsName(tr.want) });
    res.events.push(tripEvent(done));
    res.trip = done;
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Speaking tours (P1 `tours`)

  /**
   * The fee before the hook (B-12 tour.fee): CHA × 3 × tourDemand × (1 + 0.05 × reputation),
   * Silver Tongue ×1.15, Sky Bus Nationalised ×1.2.
   * @returns {number} (not rounded; tour() floors the final fee)
   */
  function tourBase(s, id) {
    var F = B().tour.fee;
    var fee = s.stats.cha * F.chaMult * tourDemand(s, id) * (1 + F.perRep * reputation(s, id));
    if (perk(s, 'silverTongue')) fee *= F.silverTongue;
    if (decree(s, 'nationalised')) fee *= F.nationalised;
    return fee;
  }

  function decree(s, id) { return ((s.election && s.election.decrees) || []).indexOf(id) >= 0; }

  /** @returns {number} the fee for a hook result: won ×1.2, lost ×0.8, none ×1 (floored). */
  function tourFee(s, id, hookWon) {
    var H = B().tour.hook;
    var m = hookWon === true ? H.win : hookWon === false ? H.lose : 1;
    return Math.floor(tourBase(s, id) * m + 1e-9);
  }

  /** @returns {object} the `tourhook` skin's run params: one plain beat at D 150, check tour.hook.<stat>. */
  function tourParams(s, id) {
    var H = B().tour.hook;
    return { city: id, D: H.D, check: 'tour.hook', beats: 1, need: 1, bestOf: true, stake: false, fee: tourFee(s, id, null) };
  }

  /**
   * Boards a speaking tour (the named fn 'trade.tourStart'): the checks, the ticket, the day, and
   * Result.open for the hook; the city waits in state.trade.offer for the resolve.
   * @returns {object} a partial Result
   */
  function tourStart(s, id, ctx) {
    var c = canBoard(s, 'tour', id, { paid: paidBy(ctx) });
    if (!c.ok) return { ok: false, reason: c.reason, vars: c.vars };
    var params = tourParams(s, id);
    board(s, id, paidBy(ctx));
    trade(s).offer = { kind: 'tour', city: id, day: s.clock.day, outcome: 'offer' };
    var res = partial();
    res.open = { minigame: 'tourhook', skin: 'tourhook', params: params, resolve: ctx && ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * The tour (B-12): the mugging check of step 4 takes only the cash in your pocket (the vest keeps
   * half; 1 draw); the fee (with the hook's ±20 %) is wired to the bank (income 'tour'); +2 karma,
   * +1 reputation; the city's week is used.
   * @param {string=} id the city (default: the tour waiting in state.trade.offer)
   * @param {object=} hook the Duel result ({ beats, wins }); missing: no hook bonus
   * @returns {object} a partial Result with the `trip` event (outcome 'toured')
   */
  function tour(s, id, hook, ctx) {
    var t = trade(s), wait = pending(s, null, 'tour');
    id = id || (wait && wait.city);
    if (!row(id)) return { ok: false, reason: 'reason.notNow', vars: {} };
    var r = row(id), rng = rng0(ctx), res = partial(), K = B().tour;
    var won = hook ? ((typeof hook.wins === 'number' ? hook.wins : (hook.beats || []).filter(Boolean).length) > 0) : null;
    var roll = rng.int(0, r.mug);
    var tr = { kind: 'tour', city: id, day: s.clock.day, outcome: 'toured', units: 0, cash: 0, mugged: false, variant: variant(s, id, 'tour') };
    if (s.stats.str < B().mugCheck.base + roll) {
      var share = (s.items.vest || 0) > 0 ? B().mugLoss.vestCash : B().mugLoss.cash;
      var lost = Math.floor(s.money.cash * share);
      s.money.cash -= lost;
      tr.mugged = true;
      tr.lost = { cash: lost };
      res.toasts.push({ key: 'toast.trade.tourMugged', vars: { n: lost, money: money(lost) }, kind: 'warning' });
    }
    var fee = tourFee(s, id, won);
    SR.rules.effects.credit(s, 'bank', fee, 'tour');
    SR.rules.stats.karma(s, K.karma);
    addRep(s, id, K.rep);
    var tw = t.tourWeek || (t.tourWeek = {});
    tw[id] = SR.rules.time.week(s);
    t.tours = (t.tours || 0) + 1;
    if (wait && wait.city === id) t.offer = null;
    tr.cash = fee;
    tr.hook = won;
    story(tr, tr.mugged ? 'trip.tour.mugged' : 'trip.toured', { n: fee, money: money(fee) });
    res.events.push(tripEvent(tr));
    res.log.push({ kind: 'tour', vars: { city: id, n: fee } });
    res.toasts.push({ key: 'toast.trade.toured', vars: { n: fee, money: money(fee), city: cityName(id) }, kind: 'reward' });
    res.trip = tr;
    return res;
  }

  // --------------------------------------------------------------------------------------------
  // Named fns (CONTRACT §8.5): conditions, effects and a cost

  function cityOf(params, arg) { return arg || (params && params.city); }
  SR.def.fn('trade.canBoard', function (s, params, ctx, kind, id) { return canBoard(s, kind || params.kind || 'smuggle', cityOf(params, id)); });
  SR.def.fn('trade.ticket', function (s, params, ctx, id) { return ticket(s, cityOf(params, id)); });
  SR.def.fn('trade.smuggle', function (s, params, ctx, id) { return smuggle(s, cityOf(params, id), ctx); });
  SR.def.fn('trade.take', function (s, params, ctx) { return take(s, null, ctx); });
  SR.def.fn('trade.haggle', function (s, params, ctx) { return haggle(s, null, ctx); });
  SR.def.fn('trade.walk', function (s) { return walk(s, null); });
  SR.def.fn('trade.tourStart', function (s, params, ctx, id) { return tourStart(s, cityOf(params, id), ctx); });
  // The tour's resolve pays only the tour booked today (state.trade.offer, set by tourStart), once:
  // a stray or repeated resolve, or one naming another city, is refused.
  SR.def.fn('trade.tour', function (s, params, ctx, id) {
    var wait = pending(s, null, 'tour');
    if (!wait || (id && id !== wait.city)) return { ok: false, reason: 'reason.notNow', vars: {} };
    return tour(s, wait.city, params, ctx);
  });
  SR.def.fn('trade.demand', function (s) { rollDemand(s); return {}; });

  SR.rules.trade = {
    GOODS: { booze: GOODS.booze, product: GOODS.product },
    cityIds: cityIds,
    ticket: ticket,
    demand: demand,
    dailyDemand: dailyDemand,
    tourDemand: tourDemand,
    rollDemand: rollDemand,
    reputation: reputation,
    bustThreshold: bustThreshold,
    busted: busted,
    screwedChance: screwedChance,
    mugChance: mugChance,
    offerPerUnit: offerPerUnit,
    offerMult: offerMult,
    canBoard: canBoard,
    board: board,
    trip: trip,
    smuggle: smuggle,
    pending: function (s) { return pending(s, null, null); },
    take: take,
    haggle: haggle,
    walk: walk,
    tourBase: tourBase,
    tourFee: tourFee,
    tourParams: tourParams,
    tourStart: tourStart,
    tour: tour,
  };
})();
