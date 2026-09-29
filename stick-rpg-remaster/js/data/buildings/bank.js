// js/data/buildings/bank.js — owner: W2-Money. The Bank of the 2nd Dimension (GDD §4.8, §4.10,
// §4.15, §6.1, §6.2; BALANCE B-08a, B-09, B-11b): the building and Penny Wise, the card rows that open
// the bank's sub-screens (Deposit, Withdraw, Get a loan, Repay the loan, the Real Estate desk, the
// interest-rate board; P1 `homesPlus`: CDs), the robbery with its `:resolve` (CONTRACT §8.10), the
// commits the sub-screens run through ctx.act, Penny's greeting and the named fns those rows use.
//
// Card rows (group services, in GDD §6.1 order): bank.depositOpen, bank.withdrawOpen,
// bank.loanOpen, bank.repayOpen, bank.realestateOpen, bank.ratesOpen, bank.cdsOpen (P1); group
// crime: bank.rob. Sub-screen commits (never card rows: `row: false`, and `hidden` while their
// parameter is missing, so the card, which passes none, drops them): bank.deposit, bank.withdraw,
// bank.loan, bank.repay ({ amount }); bank.buyHome, bank.moveIn ({ homeId }; P1: bank.sellHome,
// bank.letHome, bank.endLet); P1: bank.openCd ({ amount }), bank.breakCd ({ index }).
// The Real Estate commits are the bank's even when bank.realestate is pushed from a home door (a
// For Sale Tour) or the Pocket: SR.act does not ask where you stand.
//
// Numbers are read at run time (the load-time rule) from SR.tuning (B-09 bank, B-08a homes, B-11b
// crime) through W2-RulesE's and W2-RulesC's named fns (bank.*, homes.*, crime.*); this file only
// adds the feedback (toasts, Penny's voicemail) and the greeting. Money moves take no time
// (GDD §4.1: deposits are free), so every commit is timeRule 'free'.
// Pure data and named functions: no DOM, no platform RNG (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  function money(n) { return SR.text.money(n); }
  function homeName(id) { return SR.text('home.' + id); }

  // ---- the building ----------------------------------------------------------------------------

  SR.def.building('bank', {
    name: 'place.bank', owner: 'penny', portrait: 'penny', music: 'compound_interest', interior: 'bank',
    exteriorId: 'bank', groups: ['services', 'crime'],
    greetings: ['greet.bank.default'],
  });

  // ---- card rows: each opens its sub-screen (UI §5.6) ------------------------------------------

  /** A row that opens one of the bank's sub-screens (no cost chips; its requires still gate it). */
  function screenRow(id, o) {
    var def = {
      building: 'bank', group: 'services', order: o.order, icon: o.icon, label: 'act.bank.' + id, p: o.p || 0,
      timeRule: 'free', screen: o.screen,
    };
    if (o.screenParams) def.screenParams = o.screenParams;
    if (o.requires) def.requires = o.requires;
    if (o.feature) def.feature = o.feature;
    SR.def.action('bank.' + id + 'Open', def);
  }

  screenRow('deposit', { order: 10, icon: 'deposit', screen: 'bank.deposit' });
  screenRow('withdraw', { order: 20, icon: 'withdraw', screen: 'bank.withdraw' });
  // Get a loan: one at a time (orig), never while credit is frozen; Repay only with a loan open.
  // Both open the loan page, which also shows the lien and the freeze (UI §5.6 Bank › Loan).
  screenRow('loan', { order: 30, icon: 'loan', screen: 'bank.loan', requires: [['fn', 'bank.canLoan']] });
  screenRow('repay', { order: 40, icon: 'repay', screen: 'bank.loan', screenParams: { focus: 'repay' }, requires: [['fn', 'bank.hasLoan']] });
  screenRow('realestate', { order: 50, icon: 'realestate', screen: 'bank.realestate' });
  screenRow('rates', { order: 60, icon: 'rateboard', screen: 'bank.rates' });
  screenRow('cds', { order: 70, icon: 'cd', screen: 'bank.cds', p: 1, feature: 'homesPlus' });

  // ---- the sub-screens' commits ------------------------------------------------------------------

  /** A commit behind a sub-screen: free, never a card row (hidden while `param` is missing). */
  function commit(id, o) {
    var def = {
      building: 'bank', group: 'services', order: 100 + o.order, icon: o.icon, label: o.label, p: o.p || 0,
      timeRule: 'free', row: false,
      hidden: [['fn', 'bank.noParam', o.param]],
      effects: o.effects,
    };
    if (o.feature) def.feature = o.feature;
    SR.def.action('bank.' + id, def);
  }

  commit('deposit', { order: 1, icon: 'deposit', label: 'act.bank.depositNow', param: 'amount',
    effects: [['fn', 'bank.deposit'], ['sfx', 'coin']] });
  commit('withdraw', { order: 2, icon: 'withdraw', label: 'act.bank.withdrawNow', param: 'amount',
    effects: [['fn', 'bank.withdraw'], ['sfx', 'cash_tick']] });
  commit('loan', { order: 3, icon: 'loan', label: 'act.bank.takeLoan', param: 'amount',
    effects: [['fn', 'bank.loan'], ['fn', 'bank.loanTaken'], ['sfx', 'cash_tick']] });
  commit('repay', { order: 4, icon: 'repay', label: 'act.bank.repayNow', param: 'amount',
    effects: [['fn', 'bank.repay'], ['fn', 'bank.repaid'], ['sfx', 'coin']] });
  commit('buyHome', { order: 5, icon: 'realestate', label: 'act.bank.buyHome', param: 'homeId',
    effects: [['fn', 'homes.buy'], ['fn', 'bank.homeBought'], ['sfx', 'purchase']] });
  commit('moveIn', { order: 6, icon: 'home', label: 'act.bank.moveIn', param: 'homeId',
    effects: [['fn', 'homes.moveIn'], ['fn', 'bank.movedIn'], ['sfx', 'door_ding']] });
  // P1 `homesPlus`: sell and let from the desk (GDD §4.15), CDs (B-09 cd.*).
  commit('sellHome', { order: 7, icon: 'sell', label: 'act.bank.sellHome', param: 'homeId', p: 1, feature: 'homesPlus',
    effects: [['fn', 'homes.sell'], ['fn', 'bank.homeSold'], ['sfx', 'coin']] });
  commit('letHome', { order: 8, icon: 'realestate', label: 'act.bank.letHome', param: 'homeId', p: 1, feature: 'homesPlus',
    effects: [['fn', 'homes.letOut'], ['fn', 'bank.homeLet']] });
  commit('endLet', { order: 9, icon: 'realestate', label: 'act.bank.endLet', param: 'homeId', p: 1, feature: 'homesPlus',
    effects: [['fn', 'homes.endLet'], ['fn', 'bank.letEnded']] });
  commit('openCd', { order: 10, icon: 'cd', label: 'act.bank.openCd', param: 'amount', p: 1, feature: 'homesPlus',
    effects: [['fn', 'bank.openCd'], ['fn', 'bank.cdOpened'], ['sfx', 'coin']] });
  commit('breakCd', { order: 11, icon: 'cd', label: 'act.bank.breakCd', param: 'index', p: 1, feature: 'homesPlus',
    effects: [['fn', 'bank.cdBroken'], ['fn', 'bank.breakCd']] });

  /**
   * Hidden condition ['fn', 'bank.noParam', key]: holds while params[key] is missing, so a commit
   * previews as hidden on the card (which passes no amount or home) and runs from its sub-screen.
   */
  SR.def.fn('bank.noParam', function (s, params, ctx, key) {
    var v = params ? params[key] : undefined;
    return { ok: v === undefined || v === null || v === '' };
  });

  /** Effect after bank.loan: the terms in a toast (B-09 loan.days). */
  SR.def.fn('bank.loanTaken', function (s) {
    var l = s.money.loan;
    if (!l) return null;
    return { toasts: [{ key: 'toast.bank.loan', vars: { n: l.amount, money: money(l.amount), days: l.daysLeft }, kind: 'info' }] };
  });

  /** Effect after bank.repay: what is left, or the loan closed. */
  SR.def.fn('bank.repaid', function (s, params) {
    var l = s.money.loan, n = Number(params && params.amount) || 0;
    if (!l) return { toasts: [{ key: 'toast.bank.repaid', vars: {}, kind: 'reward' }] };
    return { toasts: [{ key: 'toast.bank.repay', vars: { n: n, money: money(n), left: money(l.amount) }, kind: 'info' }] };
  });

  /** Effect after homes.buy: the toast and Penny's voicemail (GDD §6.2: property tours). */
  SR.def.fn('bank.homeBought', function (s, params) {
    var id = params.homeId, v = { home: homeName(id) };
    return { toasts: [{ key: 'toast.bank.homeBought', vars: v, kind: 'reward' }], msgs: [{ key: 'vm.penny.homeBought', vars: v }] };
  });

  /** Effect after homes.moveIn. */
  SR.def.fn('bank.movedIn', function (s, params) {
    return { toasts: [{ key: 'toast.bank.movedIn', vars: { home: homeName(params.homeId) }, kind: 'info' }] };
  });

  /** Effect after homes.sell (P1). */
  SR.def.fn('bank.homeSold', function (s, params) {
    var id = params.homeId;
    return { toasts: [{ key: 'toast.bank.sold', vars: { home: homeName(id), money: money(SR.rules.homes.saleOf(id)) }, kind: 'reward' }] };
  });

  /** Effect after homes.letOut (P1): the nightly rent (B-08a). */
  SR.def.fn('bank.homeLet', function (s, params) {
    var id = params.homeId;
    return { toasts: [{ key: 'toast.bank.let', vars: { home: homeName(id), money: money(SR.rules.homes.rentOf(id)) }, kind: 'info' }] };
  });

  /** Effect after homes.endLet (P1). */
  SR.def.fn('bank.letEnded', function (s, params) {
    return { toasts: [{ key: 'toast.bank.endLet', vars: { home: homeName(params.homeId) }, kind: 'info' }] };
  });

  /** Effect after bank.openCd (P1): the maturity day (B-09 cd.days). */
  SR.def.fn('bank.cdOpened', function (s, params) {
    var n = Number(params && params.amount) || 0;
    var day = s.clock.day + SR.tuning.bank.cd.days - 1;
    return { toasts: [{ key: 'toast.bank.cdOpen', vars: { n: n, money: money(n), day: day }, kind: 'info' }] };
  });

  /** Effect before bank.breakCd (P1; it reads the CD before it goes): the amount returned. */
  SR.def.fn('bank.cdBroken', function (s, params) {
    var cd = s.money.cds && s.money.cds[params.index];
    if (!cd) return null;
    var back = cd.amount - Math.floor(cd.amount * SR.tuning.bank.cd.breakPenalty);
    return { toasts: [{ key: 'toast.bank.cdBreak', vars: { n: back, money: money(back) }, kind: 'info' }] };
  });

  // ---- the robbery (GDD §4.10; B-11b; CONTRACT §8.10) ---------------------------------------------

  // A gun, ≥ 10 ammo, STR ≥ 100, once a week, start before 21:00 (latest 20:30); the start
  // (crime.rob) takes 5-9 ammo, -20 karma and +60 Heat win or lose, sets the clock to 24:00 and
  // opens the Hold-up at D = 400 + Heat + 100 × bank robberies in the last 14 days; the :resolve
  // pays $3,000 + rand(0..12,000) on two successes, else jail (base 7) and the gun and ammo are
  // confiscated. Never repeatable.
  SR.def.action('bank.rob', {
    building: 'bank', group: 'crime', order: 10, icon: 'rob', label: 'act.bank.rob', p: 0,
    timeRule: 'robbery',
    requires: [['fn', 'crime.canRob', 'bank']],
    effects: [['fn', 'crime.rob', 'bank']],
    confirm: 'crime.rob.confirm.bank',
  });
  SR.def.action('bank.rob:resolve', {
    building: 'bank', p: 0, timeRule: 'free',
    effects: [['fn', 'crime.robResolve', 'bank'], ['fn', 'bank.pennyReacts']],
  });

  /**
   * Effect: Penny's line on the Hold-up's outcome, after crime.robResolve settled it (it refuses a
   * stray resolve, so this never runs without a robbery). params = the Duel result.
   */
  SR.def.fn('bank.pennyReacts', function (s, params) {
    var p = params || {};
    var wins = Array.isArray(p.beats) ? p.beats.filter(Boolean).length : Number(p.wins) || 0;
    var win = wins >= SR.tuning.crime.bank.need;
    return { toasts: [{ key: win ? 'bark.penny.robWin' : 'bark.penny.robLose', vars: {}, kind: 'info' }] };
  });

  // ---- Penny Wise's greeting (UI §5.6: first visit, time, karma, weather, job; GDD §6.2) --------

  // Presentation thresholds of the greeting, not balance (CONTRACT D49).
  var MORNING_BEFORE = 660;     // "morning" before 11:00
  var LATE_FROM = 1320;         // "late" from 22:00
  var RICH_FROM = 100000;       // a balance past B-09's first interest tier ($100,000) is "rich"
  var BROKE_BELOW = 10;         // under $10 in cash and bank together

  /**
   * The card's greeting (CONTRACT §15.4 `greet.<building>`): the first match wins. Penny remembers
   * a robbery (records.bankRobberies), watches the loan's countdown (B-09 loan.warn), the lien and
   * the freeze, and your balance. Karma uses the B-04b tier bounds as words only.
   * @returns {{key: string, vars?: object}}
   */
  SR.def.fn('greet.bank', function (s) {
    var m = s.money, tier = SR.rules.stats.tier(s.stats.karma), min = s.clock.min;
    var warn = SR.tuning.bank.loan.warn, far = Math.max.apply(null, warn);
    if (s.records.bankRobberies > 0) return { key: s.stats.heat > 0 ? 'greet.bank.robbed' : 'greet.bank.forgiven' };
    if (m.loan && m.loan.amount > 0 && m.loan.daysLeft <= far) return { key: 'greet.bank.loanDue', vars: { days: m.loan.daysLeft } };
    if (m.lien > 0) return { key: 'greet.bank.lien' };
    if (m.creditFrozenUntil && s.clock.day < m.creditFrozenUntil) return { key: 'greet.bank.frozen', vars: { day: m.creditFrozenUntil } };
    if (s.clock.day === 1) return { key: 'greet.bank.first' };
    if (m.bank >= RICH_FROM) return { key: 'greet.bank.rich' };
    if (m.cash + m.bank < BROKE_BELOW) return { key: 'greet.bank.broke' };
    if (SR.features.weather && s.world && s.world.weather === 'rain') return { key: 'greet.bank.rain' };
    if (tier === 'good' || tier === 'angelic') return { key: 'greet.bank.good' };
    if (tier === 'bad' || tier === 'wicked') return { key: 'greet.bank.bad' };
    if (min < MORNING_BEFORE) return { key: 'greet.bank.morning' };
    if (min >= LATE_FROM) return { key: 'greet.bank.late' };
    return { key: 'greet.bank.default' };
  });
})();
