// js/rules/bank.js — owner: W2-RulesE (W1-E in wave 1). SR.rules.bank: deposits, withdrawals, forced charges and the
// hard money rule, the lien, the savings rate and its tiered, capped interest, loans with their
// nightly countdown and default (seizure, lien, penalty), and CDs (BALANCE B-09; GDD §4.8;
// ARCHITECTURE §6.2, §6.5). Pure: no DOM, no browser API, randomness only from the rng passed in.
// Numbers: SR.tuning.bank (B-09), SR.tuning.homes / furniture (seizure values), SR.tuning.perks.
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {object} SR.tuning.bank (B-09). */
  function T() { return SR.tuning.bank; }

  /** @returns {string[]} the income sources that pass through the lien (B-09 default.lien). */
  function lienSources() { return T().default.lienSources; }
  // Retention, not balance: the rate board keeps 30 points (ARCHITECTURE §15).
  var RATE_HISTORY = 30;
  // Floating point, not balance: the floors of B-09 (interest, loan interest, a CD's interest) are
  // taken of products of decimal rates, which binary floats miss by ~1e-12 ($100,000 at 0.285 % is
  // 284.99999999999994, not 285). The exact values are multiples of 1e-7 or coarser (r has at most
  // 4 decimals, rateStep; a CD's rate r × 1.2 has 5), so nudging by 1e-8 restores the floor of the
  // exact value without ever lifting a value that is truly below a whole dollar.
  var FLOOR_EPS = 1e-8;
  /** @returns {number} floor of a money amount computed with decimal rates (see FLOOR_EPS). */
  function floorMoney(x) { return Math.floor(x + FLOOR_EPS); }

  /** @returns {boolean} the perk is owned and perks are on (P1). */
  function perk(s, id) { return !!(SR.features.perks && SR.rules.perks.has(s, id)); }
  /** @returns {boolean} a decree is active (or, for once-only ones, was issued) this term. */
  function decree(s, id) {
    var e = s.election || {};
    return (e.decrees || []).indexOf(id) >= 0 || (e.decreesUsed || []).indexOf(id) >= 0;
  }
  /** @returns {boolean} n is a whole amount the bank accepts (B-09 quickAmounts: 1..9,999,999). */
  function amountOk(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= T().typedMax; }
  function needCash(n, have) { return refuse('reason.needCash', { n: n, money: SR.text.money(n), have: have }); }
  function refuse(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function delta(kind, key, from, to) { var d = { kind: kind, n: to - from, from: from, to: to }; if (key) d.key = key; return d; }

  /** @returns {number} the open CDs' principal. */
  function cdPrincipal(s) {
    return (s.money.cds || []).reduce(function (a, c) { return a + c.amount; }, 0);
  }

  /** @returns {number} the savings rate paid tonight: r, +0.25 at Good karma or better (P1 `karmaTiers`). */
  function paidRate(s) {
    var r = s.money.rate;
    if (SR.features.karmaTiers) {
      var tier = SR.rules.stats.tier(s.stats.karma);
      if (tier === 'good' || tier === 'angelic') r += T().goodBonus;
    }
    return r;
  }

  var bank = {
    lienSources: lienSources,
    paidRate: paidRate,
    cdPrincipal: cdPrincipal,

    /**
     * Moves n from cash to the bank (free; GDD §4.8).
     * @returns {{ok: boolean, reason?: string, vars?: object, deltas?: object[]}}
     */
    deposit: function (s, n) {
      var m = s.money;
      if (!amountOk(n)) return refuse('reason.amount');
      if (n > m.cash) return needCash(n, m.cash);
      var c0 = m.cash, b0 = m.bank;
      m.cash -= n; m.bank += n;
      return { ok: true, amount: n, deltas: [delta('cash', null, c0, m.cash), delta('bank', null, b0, m.bank)] };
    },

    /** Moves n from the bank to cash. @returns {{ok: boolean, reason?: string, deltas?: object[]}} */
    withdraw: function (s, n) {
      var m = s.money;
      if (!amountOk(n)) return refuse('reason.amount');
      if (n > m.bank) return refuse('reason.needBank', { n: n, money: SR.text.money(n), have: m.bank });
      var c0 = m.cash, b0 = m.bank;
      m.bank -= n; m.cash += n;
      return { ok: true, amount: n, deltas: [delta('cash', null, c0, m.cash), delta('bank', null, b0, m.bank)] };
    },

    /**
     * A forced charge (hospital bill, tow, bar tab, mugging, goons, seizure, fine): cash first, then
     * the bank; any shortfall is written off. Cash and bank never go below 0 (ARCHITECTURE §6.2).
     * @param {number} n the amount (≤ 0 charges nothing)
     * @param {string} reason why (kept in the result for the report and the log)
     * @returns {{paid: number, writtenOff: number, fromCash: number, fromBank: number, reason: string}} (not a
     *   partial Result: the `charge` effect adds the written-off toast itself)
     */
    charge: function (s, n, reason) {
      var m = s.money;
      n = Math.max(0, Math.round(Number(n) || 0));
      var fromCash = Math.min(m.cash, n);
      m.cash -= fromCash;
      var fromBank = Math.min(m.bank, n - fromCash);
      m.bank -= fromBank;
      return { paid: fromCash + fromBank, writtenOff: n - fromCash - fromBank, fromCash: fromCash, fromBank: fromBank, reason: reason || null };
    },

    /**
     * Credits income: while a lien is owed, half of every income credit from a listed source goes
     * to it first (B-09 default.lien); the rest lands in cash or the bank.
     * @param {number} n the amount
     * @param {string} src 'wage' | 'rent' | 'salary' | 'interest' | 'deal' | 'tour' | 'loot' | 'win' | 'prize' | other
     * @param {string=} to 'cash' (default) | 'bank'
     * @returns {{credited: number, toLien: number, deltas: object[]}}
     */
    income: function (s, n, src, to) {
      var m = s.money;
      n = Math.max(0, Math.round(Number(n) || 0));
      to = to === 'bank' ? 'bank' : 'cash';
      var toLien = 0;
      // Half, rounded half up, as the `cash` / `bank` effects do (js/rules/effects.js credit).
      if (n > 0 && m.lien > 0 && lienSources().indexOf(src) >= 0) toLien = Math.min(m.lien, Math.floor(n * T().default.lienShare + 0.5));
      var out = { credited: n - toLien, toLien: toLien, deltas: [] };
      if (toLien) { var l0 = m.lien; m.lien -= toLien; out.deltas.push(delta('lien', null, l0, m.lien)); }
      if (out.credited) { var v0 = m[to]; m[to] += out.credited; out.deltas.push(delta(to, null, v0, m[to])); }
      // The action pipeline names the source on its cash / bank Delta (docs/requests/W1-Q.md 5).
      if (out.credited && SR.rules.effects && SR.rules.effects.noteIncome) SR.rules.effects.noteIncome(to, out.credited, src);
      return out;
    },

    /**
     * Takes a loan: one at a time (orig), up to the credit limit of your best job (B-05), not while
     * credit is frozen after a default; 15 days (orig).
     * @returns {{ok: boolean, reason?: string, vars?: object, events?: object[], deltas?: object[]}}
     */
    loan: function (s, n) {
      var m = s.money;
      if (m.loan && m.loan.amount > 0) return refuse('reason.loanOpen');
      if (m.creditFrozenUntil && s.clock.day < m.creditFrozenUntil) return refuse('reason.creditFrozen', { day: m.creditFrozenUntil });
      if (!amountOk(n)) return refuse('reason.amount');
      var limit = SR.rules.jobs.creditLimit(s);
      if (n > limit) return refuse('reason.creditLimit', { n: limit, money: SR.text.money(limit) });
      var c0 = m.cash;
      m.loan = { amount: n, daysLeft: T().loan.days };
      m.cash += n;
      return { ok: true, amount: n, deltas: [delta('cash', null, c0, m.cash)],
        events: [{ name: 'loan', payload: { kind: 'take', amount: n } }] };
    },

    /**
     * Repays n (partial repayment allowed) from cash; the loan closes at 0.
     * @returns {{ok: boolean, reason?: string, events?: object[], deltas?: object[]}}
     */
    repay: function (s, n) {
      var m = s.money;
      if (!m.loan || !(m.loan.amount > 0)) return refuse('reason.noLoan');
      if (!amountOk(n)) return refuse('reason.amount');
      n = Math.min(n, m.loan.amount);
      if (n > m.cash) return needCash(n, m.cash);
      var c0 = m.cash;
      m.cash -= n;
      m.loan.amount -= n;
      var left = m.loan.amount;
      if (left <= 0) m.loan = null;
      return { ok: true, amount: n, left: left, deltas: [delta('cash', null, c0, m.cash)],
        events: [{ name: 'loan', payload: { kind: 'repay', amount: n } }] };
    },

    /**
     * Opens a CD (P1 `homesPlus`) from the bank balance: ≥ $1,000, at most 3 open and $100,000 in
     * all, for 7 days at r × 1.2 a day, simple interest at the rate when opened (B-09 cd.*).
     * @returns {{ok: boolean, reason?: string, vars?: object, deltas?: object[]}}
     */
    openCd: function (s, n) {
      var m = s.money, c = T().cd;
      if (!SR.features.homesPlus) return refuse('reason.featureOff');
      if (!amountOk(n)) return refuse('reason.amount');
      if (n < c.min) return refuse('reason.cdMin', { n: c.min, money: SR.text.money(c.min) });
      if ((m.cds || []).length >= c.maxOpen) return refuse('reason.cdMax', { n: c.maxOpen });
      if (cdPrincipal(s) + n > c.maxPrincipal) return refuse('reason.cdTotal', { n: c.maxPrincipal, money: SR.text.money(c.maxPrincipal) });
      if (n > m.bank) return refuse('reason.needBank', { n: n, money: SR.text.money(n), have: m.bank });
      var b0 = m.bank;
      m.bank -= n;
      m.cds = (m.cds || []).concat([{ amount: n, rate: m.rate * c.rateMult, dayOpened: s.clock.day }]);
      return { ok: true, amount: n, deltas: [delta('bank', null, b0, m.bank)] };
    },

    /**
     * Breaks CD number i early: the principal minus 10 % back to the bank, no interest (B-09).
     * @returns {{ok: boolean, reason?: string, returned?: number, deltas?: object[]}}
     */
    breakCd: function (s, i) {
      var m = s.money;
      if (!m.cds || !m.cds[i]) return refuse('reason.noCd');
      var cd = m.cds[i], back = cd.amount - Math.floor(cd.amount * T().cd.breakPenalty);
      var b0 = m.bank;
      m.cds = m.cds.filter(function (x, j) { return j !== i; });
      m.bank += back;
      return { ok: true, returned: back, deltas: [delta('bank', null, b0, m.bank)] };
    },

    /**
     * Tonight's savings interest, not yet credited: floor(T1·r/100 + T2·r/200 + T3·r/400), capped
     * at $25,000; T1's room ($100,000, $200,000 with Tax Wizard) shrinks by the open CD principal;
     * 0 after Seize the Bank (B-09, B-17).
     * @returns {number}
     */
    interest: function (s) {
      if (decree(s, 'seizeBank')) return 0;
      var t = T().tiers, r = paidRate(s), bal = Math.max(0, s.money.bank);
      var top1 = perk(s, 'taxWizard') ? t.taxWizardT1 : t.t1;
      var b1 = Math.max(0, top1 - cdPrincipal(s)), b2 = Math.max(b1, t.t2);
      var t1 = Math.min(bal, b1), t2 = Math.min(Math.max(bal - b1, 0), b2 - b1), t3 = Math.max(0, bal - b2);
      var v = floorMoney(t1 * r / t.t1Div + t2 * r / t.t2Div + t3 * r / t.t3Div);
      return Math.max(0, Math.min(T().interestCap, v));
    },

    /**
     * The nightly rate step, mean-reverting to 1.5: r ← clamp(r + 0.2 × (1.5 - r) + rand(-3..3)/10,
     * 0.25, 3.5) (B-09 rateStep); keeps the 30-point history.
     * @param {object} rng the rules stream (one draw)
     * @returns {number} the new rate
     */
    rateStep: function (s, rng) {
      var p = T().rateStep, m = s.money;
      rng = rng || SR.rng.rules;
      var r = m.rate + p.pull * (p.toward - m.rate) + rng.int(p.jitter[0], p.jitter[1]) / p.jitterDiv;
      r = Math.round(SR.util.clamp(r, p.min, p.max) * 10000) / 10000;
      m.rateHist = (m.rateHist || []).concat([m.rate]).slice(-RATE_HISTORY);
      m.rate = r;
      return r;
    },

    /**
     * Pays out the CDs that mature tonight (7 days after opening): principal plus simple interest
     * at the opening rate, into the bank through the lien (interest only).
     * @returns {{amount: number, interest: number}[]} the matured CDs
     */
    maturities: function (s) {
      var m = s.money, c = T().cd, out = [], keep = [];
      (m.cds || []).forEach(function (cd) {
        if (s.clock.day - cd.dayOpened + 1 >= c.days) {
          var intr = floorMoney(cd.amount * cd.rate / 100 * c.days);
          m.bank += cd.amount;
          var got = bank.income(s, intr, 'interest', 'bank');
          out.push({ amount: cd.amount, interest: intr, toLien: got.toLien });
        } else keep.push(cd);
      });
      m.cds = keep;
      return out;
    },

    /**
     * The loan's night (step 2): interest at r + 1 % (compounding), the countdown, the 5- and
     * 1-day warnings; at 0 with money owed the caller runs default (B-09).
     * @returns {null|{interest: number, amount: number, daysLeft: number, warn: (number|null), due: boolean}}
     */
    loanNight: function (s) {
      var m = s.money, l = T().loan;
      if (!m.loan || !(m.loan.amount > 0)) return null;
      var intr = floorMoney(m.loan.amount * (m.rate + l.rateAdd) / 100);
      m.loan.amount += intr;
      m.loan.daysLeft -= 1;
      var d = m.loan.daysLeft;
      return { interest: intr, amount: m.loan.amount, daysLeft: d,
        warn: l.warn.indexOf(d) >= 0 ? d : null, due: d <= 0 };
    },

    /**
     * Loan default (B-09, B-16). Hardcore: flags.dead = 'loan' (death after the night). Standard
     * and Relaxed: the repo men seize, in order, until the debt is paid: the bank, cash, CDs
     * (broken, principal - 10 %), stocks (sold at the bid, no fee), furniture from the most
     * expensive down at 50 %, then homes you don't live in, most expensive first, at 90 % (a sale's
     * surplus goes to cash); what is still owed becomes the lien; -10 karma; credit frozen 60 days;
     * Standard also sets HP to 1.
     * @returns {{kind: string, owed: number, seized: object[], lien: number, events: object[]}}
     */
    default: function (s) {
      var m = s.money, d = T().default, owed = m.loan ? m.loan.amount : 0;
      var out = { kind: s.mode.difficulty, owed: owed, seized: [], lien: 0, events: [{ name: 'loan', payload: { kind: 'default', amount: owed } }] };
      if (s.mode.difficulty === 'hardcore') {
        s.flags.dead = d.hardcore.dead;
        out.dead = d.hardcore.dead;
        return out;
      }
      var left = owed;
      function take(kind, key, value) {
        if (left <= 0 || value <= 0) return 0;
        var used = Math.min(left, value);
        left -= used;
        out.seized.push({ kind: kind, key: key || null, value: value, applied: used });
        return value - used;   // the surplus of a sale
      }
      var fromBank = Math.min(m.bank, left);
      m.bank -= fromBank; take('bank', null, fromBank);
      var fromCash = Math.min(m.cash, left);
      m.cash -= fromCash; take('cash', null, fromCash);
      // CDs, broken.
      while (left > 0 && m.cds && m.cds.length) {
        var cd = m.cds.shift();
        m.cash += take('cd', null, cd.amount - Math.floor(cd.amount * d.cdPenalty));
      }
      // Stocks at the bid (price × 0.995), no fee; the fewest shares needed, most valuable holding first.
      var tickers = Object.keys(s.stocks || {}).filter(function (t) { return s.stocks[t].held > 0; })
        .sort(function (a, b) { return s.stocks[b].held * s.stocks[b].price - s.stocks[a].held * s.stocks[a].price || (a < b ? -1 : 1); });
      tickers.forEach(function (t) {
        if (left <= 0) return;
        var st = s.stocks[t], bid = st.price * d.stockSell;
        var n = Math.min(st.held, Math.max(1, Math.ceil(left / bid)));
        var value = Math.round(n * bid);
        st.basis = st.held ? Math.round(st.basis * (st.held - n) / st.held * 100) / 100 : 0;
        st.held -= n;
        m.cash += take('stock', t, value);
      });
      // Furniture, most expensive first, at 50 % of its (current tier's) price.
      var pieces = SR.rules.homes.pieces(s).sort(function (a, b) { return b.price - a.price || (a.id < b.id ? -1 : 1); });
      pieces.forEach(function (p) {
        if (left <= 0) return;
        SR.rules.homes.removePiece(s, p.base);
        m.cash += take('furniture', p.id, Math.floor(p.price * d.furniture));
      });
      // Homes you don't live in, most expensive first, at 90 %.
      var homes = s.homes.owned.filter(function (h) { return h !== s.homes.living; })
        .map(function (h) { return { id: h, price: SR.tuning.homes[h].price }; })
        .filter(function (h) { return h.price > 0; })
        .sort(function (a, b) { return b.price - a.price; });
      homes.forEach(function (h) {
        if (left <= 0) return;
        s.homes.owned = s.homes.owned.filter(function (x) { return x !== h.id; });
        if (s.homes.lets) delete s.homes.lets[h.id];
        m.cash += take('home', h.id, Math.floor(h.price * d.homes));
      });
      out.lien = left;
      m.lien = (m.lien || 0) + left;
      m.loan = null;
      m.creditFrozenUntil = s.clock.day + d.creditFrozenDays;
      out.karma = SR.rules.stats.karma(s, d.penaltyKarma);
      var hp = (d[s.mode.difficulty] || {}).hp;
      if (hp !== null && hp !== undefined) { s.stats.hp = Math.min(s.stats.hp, hp); out.hp = s.stats.hp; }
      return out;
    },
  };

  SR.rules.bank = bank;

  // --- named functions for the bank's actions (ARCHITECTURE §6.4; the Bank building data calls them) ---
  function asResult(r) {
    if (!r.ok) return { ok: false, reason: r.reason, vars: r.vars };
    return r;
  }
  /** @returns {number} an amount from params (amount or n) or the first extra argument. */
  function amt(params, arg) { return arg !== undefined ? arg : params && (params.amount !== undefined ? params.amount : params.n); }

  SR.def.fn('bank.deposit', function (s, params, ctx, n) { return asResult(bank.deposit(s, amt(params, n))); });
  SR.def.fn('bank.withdraw', function (s, params, ctx, n) { return asResult(bank.withdraw(s, amt(params, n))); });
  SR.def.fn('bank.loan', function (s, params, ctx, n) { return asResult(bank.loan(s, amt(params, n))); });
  SR.def.fn('bank.repay', function (s, params, ctx, n) { return asResult(bank.repay(s, amt(params, n))); });
  SR.def.fn('bank.openCd', function (s, params, ctx, n) { return asResult(bank.openCd(s, amt(params, n))); });
  SR.def.fn('bank.breakCd', function (s, params, ctx, i) { return asResult(bank.breakCd(s, i !== undefined ? i : params && params.index)); });
  /**
   * The forced charge as an effect: ['fn', 'bank.charge', n, reason] (or params.amount). Besides
   * { paid, writtenOff, ... } it carries the write-off toast the `charge` effect gives (a partial
   * Result the pipeline merges), so the row reports a shortfall whichever form it uses.
   */
  SR.def.fn('bank.charge', function (s, params, ctx, n, reason) {
    var r = bank.charge(s, amt(params, n), reason);
    r.toasts = r.writtenOff > 0 ? [{ key: 'toast.act.writtenOff',
      vars: { n: r.writtenOff, money: SR.text.money(r.writtenOff), reason: reason || null }, kind: 'warning' }] : [];
    return r;
  });

  // Conditions for the bank rows (a sub-screen row can be disabled with a reason).
  SR.def.fn('bank.canLoan', function (s) {
    var m = s.money;
    if (m.loan && m.loan.amount > 0) return refuse('reason.loanOpen');
    if (m.creditFrozenUntil && s.clock.day < m.creditFrozenUntil) return refuse('reason.creditFrozen', { day: m.creditFrozenUntil });
    return { ok: true };
  });
  SR.def.fn('bank.hasLoan', function (s) {
    return s.money.loan && s.money.loan.amount > 0 ? { ok: true } : refuse('reason.noLoan');
  });
})();
