// js/rules/stocks.js — owner: W2-RulesE (W1-E in wave 1). SR.rules.stocks: the six tickers' nightly ticks with their
// quirks and the tip's shock, reverse splits, the daily tip (P1 `stockTips`) and its reliability,
// trades with the fee, the spread and the position cap, and portfolio value (BALANCE B-10;
// GDD §4.9). Pure: randomness only from the rng passed in.
// Numbers: SR.tuning.stocks (B-10), SR.tuning.perks (Market Sense).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {object} SR.tuning.stocks (B-10). */
  function T() { return SR.tuning.stocks; }
  /** @returns {string[]} the tickers in their fixed order (the draw order of every tick; B-10). */
  function tickers() { return T().tickers; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function refuse(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function perk(s, id) { return !!(SR.features.perks && SR.rules.perks.has(s, id)); }
  function delta(kind, key, from, to) { var d = { kind: kind, n: to - from, from: from, to: to }; if (key) d.key = key; return d; }

  // Where a tip can be learned (GDD §4.9): state.tip.revealed.<source>.
  var TIP_SOURCES = ['tv', 'paper', 'market', 'mingle', 'harold'];

  var stocks = {
    tickers: tickers,
    TIP_SOURCES: TIP_SOURCES,

    /** @returns {number} the tip's reliability: min(0.75, 0.5 + INT/2000) with this morning's INT (B-10). */
    reliability: function (s) {
      var r = T().tip.reliability;
      return Math.min(r.max, r.base + s.stats.int / r.intDiv);
    },

    /** @returns {number} the position cap per ticker: cost basis ≤ 10,000 + 100 × INT (B-10). */
    cap: function (s) {
      var c = T().positionCap;
      return c.base + c.perInt * s.stats.int;
    },

    /** @returns {number} the spread (0.5 %; 0 with Market Sense). */
    spread: function (s) { return perk(s, 'marketSense') ? SR.tuning.perks.marketSense.spread : T().spread; },

    /** @returns {number} the holdings at market price (net worth). */
    value: function (s) {
      return tickers().reduce(function (a, t) { var st = s.stocks[t]; return a + (st ? st.held * st.price : 0); }, 0);
    },

    /**
     * The market night (night step 1; market days only). logret = μ + σ·z + shock with
     * z = 2·(u1 + u2 + u3 - 1.5) (three draws per ticker, in ticker order), price = round2(price·e^logret);
     * a close below $1 reverse-splits; the 30-night history is kept (B-10).
     * @param {object} facts { rng, day (the ended day: its tip shocks tonight), ceo, nliShifts,
     *   casinoWin ($ won there today), rain, falls, burgerDay, scare, rebound } (see quirkShock)
     * @returns {{movers: object[], splits: object[], tip: (null|object), logs: object[]}}
     */
    tick: function (s, facts) {
      facts = facts || {};
      var rng = facts.rng || SR.rng.rules, out = { movers: [], splits: [], tip: null, logs: [] };
      var tip = s.tip && s.tip.day === facts.day ? s.tip : null;
      tickers().forEach(function (t) {
        var row = T()[t], st = s.stocks[t];
        var z = 2 * (rng.float() + rng.float() + rng.float() - 1.5);
        var shock = stocks.quirkShock(t, facts);
        if (facts.scare) shock += T().stockScare.shock;
        if (facts.rebound) shock += T().stockScare.rebound;
        if (tip && tip.ticker === t) {
          var sign = tip.dir === 'up' ? 1 : -1;
          shock += tip.truthful ? sign * tip.size : -sign * tip.size * T().tip.falseShock;
        }
        var from = st.price;
        var to = round2(from * Math.exp(row.mu + row.sigma * z + shock));
        st.prev = from;
        st.price = to;
        st.hist = (st.hist || []).concat([to]).slice(-T().history);
        var mover = { ticker: t, from: from, to: to, pct: (to - from) / from * 100 };
        if (to < T().reverseSplit.below) out.splits.push(stocks.reverseSplit(s, t));
        out.movers.push(mover);
        if (st.held > 0 && Math.abs(mover.pct) >= SR.tuning.news.stockMove * 100) out.logs.push({ kind: 'stockMove', vars: { ticker: t, pct: Math.round(mover.pct) } });
      });
      if (tip) out.tip = { ticker: tip.ticker, dir: tip.dir, truthful: tip.truthful, seen: stocks.revealed(s) };
      return out;
    },

    /**
     * The quirk shock of a ticker tonight (GDD §4.9): NLI +0.30 % drift while you are CEO with ≥ 3
     * NLI shifts that week; SLC -4 % after you won more than $5,000 there in a day; PPR -3 % after
     * a rainy day; GLU +2 % after a day with any fall; MCS +5 % on Burger Day.
     * @param {object} facts { ceo: you are CEO, nliShifts: NLI shifts this week, casinoWin: $ won at
     *   the casino today, rain: it rained (P1 weather), falls: any fall today, burgerDay }
     * @returns {number} the log-return shock
     */
    quirkShock: function (t, facts) {
      var q = T()[t].quirk;
      if (!q) return 0;
      var shock = 0;
      if (q.ceoDrift !== undefined && facts.ceo && facts.nliShifts >= q.ceoShifts) shock += q.ceoDrift;
      if (q.casinoWin !== undefined && facts.casinoWin > q.casinoWin) shock += q.shock;
      if (q.rain !== undefined && facts.rain) shock += q.rain;
      if (q.fall !== undefined && facts.falls) shock += q.fall;
      if (q.burgerDay !== undefined && facts.burgerDay) shock += q.burgerDay;
      return shock;
    },

    /**
     * Reverse split of a ticker that closed below $1: price × 10, held = floor(held / 10), the
     * leftover shares paid out at the close, cost basis unchanged, history × 10 (B-10). A holding of
     * fewer than 10 shares is paid out entirely, and its cost basis goes with it (a position of 0
     * shares keeps no basis, which would otherwise eat the position cap for good).
     * @returns {{ticker: string, from: number, to: number, leftover: number, paid: number}}
     */
    reverseSplit: function (s, t) {
      var st = s.stocks[t], k = T().reverseSplit.factor;
      var close = st.price, leftover = st.held % k;
      var paid = Math.floor(leftover * close);
      st.price = round2(close * k);
      st.prev = round2(st.prev * k);
      st.hist = (st.hist || []).map(function (p) { return round2(p * k); });
      st.held = Math.floor(st.held / k);
      if (!st.held) st.basis = 0;
      if (paid) s.money.cash += paid;
      return { ticker: t, from: close, to: st.price, leftover: leftover, paid: paid };
    },

    /**
     * Draws the day's tip (night step 10, P1 `stockTips`): a ticker, a direction, its truth with
     * this morning's reliability and the shock size 3 + rand(0..2) % (B-10). Four draws.
     * @returns {object} state.tip
     */
    drawTip: function (s, rng) {
      rng = rng || SR.rng.rules;
      var list = tickers(), t = T().tip.trueShock;
      var ticker = rng.pick(list);
      var dir = rng.chance(0.5) ? 'up' : 'down';
      var rel = stocks.reliability(s);
      var truthful = rng.chance(rel);
      var size = t.base + rng.int(t.extra[0], t.extra[1]) / t.extraDiv;
      var revealed = {};
      TIP_SOURCES.forEach(function (k) { revealed[k] = false; });
      s.tip = { day: s.clock.day, ticker: ticker, dir: dir, truthful: truthful, size: size, pct: Math.round(size * 100),
        reliability: rel, revealed: revealed };
      return s.tip;
    },

    /**
     * The chance that a source reveals today's tip (B-10 tip.sources): TV News 0.60, Mingle 0.30
     * (1 with the Regular perk), Market Watch, the paper and Harold 1.
     * @returns {number}
     */
    revealChance: function (s, source) {
      var src = T().tip.sources;
      if (source === 'tv') return src.tvNews;
      if (source === 'mingle') return perk(s, 'regular') ? src.mingleRegular : src.mingle;
      if (source === 'market') return src.marketWatch;
      if (source === 'paper') return src.paper;
      return 1;
    },

    /** Marks today's tip as learned from a source ('tv' | 'paper' | 'market' | 'mingle' | 'harold'). @returns {boolean} */
    reveal: function (s, source) {
      if (!SR.features.stockTips || !s.tip || s.tip.day !== s.clock.day) return false;
      s.tip.revealed[source] = true;
      return true;
    },

    /** @returns {boolean} today's tip has been revealed by any source (the Stocks app may show it). */
    revealed: function (s) {
      if (!s.tip) return false;
      return TIP_SOURCES.some(function (k) { return s.tip.revealed && s.tip.revealed[k]; });
    },

    /**
     * Buys n whole shares at price × 1.005 plus the $5 fee, within the position cap (B-10).
     * @returns {{ok: boolean, reason?: string, vars?: object, cost?: number, events?: object[], deltas?: object[]}}
     */
    buy: function (s, t, n, where) {
      var st = s.stocks[t];
      if (!st) return refuse('reason.noTicker');
      if (!(typeof n === 'number' && Math.floor(n) === n && n >= 1)) return refuse('reason.amount');
      if (st.held + n > T().maxShares) return refuse('reason.maxShares', { n: T().maxShares });
      var fill = st.price * (1 + stocks.spread(s)), value = n * fill;
      var cost = Math.round(value) + T().fee;
      var cap = stocks.cap(s);
      if (st.basis + value > cap + 1e-9) return refuse('reason.positionCap', { n: cap, money: SR.text.money(cap) });
      if (cost > s.money.cash) return refuse('reason.needCash', { n: cost, money: SR.text.money(cost), have: s.money.cash });
      var c0 = s.money.cash;
      s.money.cash -= cost;
      st.held += n;
      st.basis = round2(st.basis + value);
      s.records.spent = (s.records.spent || 0) + cost;
      return { ok: true, cost: cost, deltas: [delta('cash', null, c0, s.money.cash)],
        events: [{ name: 'buy', payload: { item: t, n: n, where: where || 'stocks', price: cost } }] };
    },

    /**
     * Sells n shares you hold (no shorts) at price × 0.995 minus the $5 fee (B-10).
     * @returns {{ok: boolean, reason?: string, proceeds?: number, events?: object[], deltas?: object[]}}
     */
    sell: function (s, t, n, where) {
      var st = s.stocks[t];
      if (!st) return refuse('reason.noTicker');
      if (!(typeof n === 'number' && Math.floor(n) === n && n >= 1)) return refuse('reason.amount');
      if (n > st.held) return refuse('reason.noShares', { n: st.held });
      var proceeds = Math.max(0, Math.round(n * st.price * (1 - stocks.spread(s))) - T().fee);
      var c0 = s.money.cash;
      st.basis = round2(st.basis * (st.held - n) / st.held);
      st.held -= n;
      s.money.cash += proceeds;
      return { ok: true, proceeds: proceeds, deltas: [delta('cash', null, c0, s.money.cash)],
        events: [{ name: 'sell', payload: { item: t, n: n, where: where || 'stocks', price: proceeds } }] };
    },
  };

  SR.rules.stocks = stocks;

  // --- named functions for the trading screens (home.stocks, the phone) ---
  function res(r) { return r.ok ? r : { ok: false, reason: r.reason, vars: r.vars }; }
  SR.def.fn('stocks.buy', function (s, params) { return res(stocks.buy(s, params.ticker, params.n, params.where)); });
  SR.def.fn('stocks.sell', function (s, params) { return res(stocks.sell(s, params.ticker, params.n, params.where)); });
  /** ['fn', 'stocks.reveal', 'tv']: a source reveals today's tip (the caller rolls its chance). */
  SR.def.fn('stocks.reveal', function (s, params, ctx, source) { stocks.reveal(s, source || params.source); return {}; });

  /**
   * Effect ['fn', 'stocks.maybeReveal', source] (P1 `stockTips`): a viewing, a mingle or a paper
   * reveals today's tip with the source's chance of B-10 `tip.sources` (TV News 60 %, Mingle 30 %
   * or 100 % with Regular, Market Watch and the Daily Fold always, Harold always) and says so in a
   * toast. It draws nothing while the flag is off, on a day without a tip, or once the tip is
   * known, so a P0 row that carries it (TV News) keeps the P0 random stream unchanged.
   */
  SR.def.fn('stocks.maybeReveal', function (s, params, ctx, source) {
    source = source || (params && params.source);
    if (!SR.features.stockTips || !s.tip || s.tip.day !== s.clock.day || stocks.revealed(s)) return {};
    if (TIP_SOURCES.indexOf(source) < 0) return {};
    var p = stocks.revealChance(s, source);
    if (p < 1 && !((ctx && ctx.rng) || SR.rng.rules).chance(p)) return {};
    stocks.reveal(s, source);
    var t = s.tip;
    return { toasts: [{ key: 'toast.stocks.tip', kind: 'info',
      vars: { ticker: t.ticker, dir: t.dir, arrow: t.dir === 'up' ? '▲' : '▼', rel: SR.text.pct(t.reliability, 0), source: source } }] };
  });
})();
