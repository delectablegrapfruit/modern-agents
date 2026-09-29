// js/rules/endgame.js — owner: W1-E. SR.rules.endgame: net worth and its breakdown, the rank stamp
// by karma column and net-worth tier, the banners, the legacy score, a run's results and the Hall
// of Fame bucket of a game length (BALANCE B-18; GDD §4.19; UI §5.14). Pure.
// Numbers: SR.tuning.endgame (B-18: net-worth weights, rank floors, legacy), SR.tuning.difficulty
// (B-16 legacyMult); the rank cells (names, columns) are js/data/ranks.js.
(function () {
  'use strict';
  var SR = window.SR;

  function T() { return SR.tuning.endgame; }

  // The Hall of Fame tabs, in the order of tuning.endgame.hof.lengths (15, 40, 100, 0 = Unlimited).
  var BUCKET_NAMES = ['short', 'medium', 'long', 'unlimited'];

  var endgame = {
    /**
     * Every part of net worth (B-18): cash + bank + CD principal + stocks at market - loan - lien
     * + homes × 0.9 + furniture × 0.25 + a bought sports car at $30,000.
     * @returns {{cash: number, bank: number, cds: number, stocks: number, loan: number, lien: number, homes: number, furniture: number, car: number, total: number}}
     */
    breakdown: function (s) {
      var m = s.money, nw = T().netWorth;
      var b = {
        cash: m.cash, bank: m.bank, cds: SR.rules.bank.cdPrincipal(s),
        stocks: Math.floor(SR.rules.stocks.value(s)),
        loan: m.loan ? m.loan.amount : 0, lien: m.lien || 0,
        homes: SR.rules.homes.homesValue(s), furniture: SR.rules.homes.furnitureValue(s),
        car: s.player && s.player.cars && s.player.cars.sports && s.player.cars.sports.bought ? nw.sportsCar : 0,
      };
      b.total = b.cash + b.bank + b.cds + b.stocks - b.loan - b.lien + b.homes + b.furniture + b.car;
      return b;
    },

    /** @returns {number} net worth (B-18). */
    netWorth: function (s) { return endgame.breakdown(s).total; },

    /** @returns {string} the rank column: 'good' (karma > +20), 'evil' (< -20) or 'neutral' (orig). */
    column: function (karma) {
      var c = T().column;
      return karma > c.good ? 'good' : karma < c.evil ? 'evil' : 'neutral';
    },

    /** @returns {number} the rank tier of a net worth: how many floors of B-18 it reaches (0 = below $0). */
    tier: function (nw) {
      return T().ranks.filter(function (floor) { return nw >= floor; }).length;
    },

    /**
     * The rank stamp: the row of B-18 your net worth reaches, in your karma column (the three
     * bottom rows are shared).
     * @param {number=} nw a net worth to rank instead of the state's
     * @returns {{id: string, key: string, column: string, tier: number, min: (number|null), netWorth: number}}
     */
    rank: function (s, nw) {
      if (nw === undefined) nw = endgame.netWorth(s);
      var col = endgame.column(s.stats.karma), tier = endgame.tier(nw), id = null;
      Object.keys(SR.reg.rank).forEach(function (k) {
        var r = SR.reg.rank[k];
        if (r.tier === tier && (r.column === 'all' || r.column === col)) id = k;
      });
      return { id: id, key: 'rank.' + id, column: col, tier: tier, min: tier ? T().ranks[tier - 1] : null, netWorth: nw };
    },

    /**
     * The banners of the results front page (B-18): 'president' | 'dictator' (in office at the
     * end), 'unverified' (the cheat name), 'deceased' (death), 'metArtist' (the Theory of the Fold).
     * @returns {string[]}
     */
    banners: function (s, reason) {
      var out = [];
      if (s.job.office) out.push(s.job.office);
      if (s.mode.cheat) out.push('unverified');
      if (reason === 'death') out.push('deceased');
      if (s.flags.foldDone) out.push('metArtist');
      return out;
    },

    /**
     * The legacy score (P1 `achievements`; B-18): (floor(NW / 100) + STR + INT + CHA + 5·|karma| +
     * 250·achievements this run + 500·job rank + 10,000 if elected) × the difficulty multiplier.
     * @returns {number}
     */
    legacy: function (s) {
      var L = T().legacy, nw = endgame.netWorth(s), st = s.stats;
      var ach = Object.keys(s.achievements || {}).length;
      var st0 = s.election && s.election.status;
      var elected = !!(s.job.office || st0 === 'office' || st0 === 'removed');
      var raw = Math.floor(nw / L.nwDiv) + st.str + st.int + st.cha + L.karmaMult * Math.abs(st.karma) +
        L.achievement * ach + L.jobRank * SR.rules.jobs.legacyRank(s) + (elected ? L.elected : 0);
      return Math.floor(raw * SR.tuning.difficulty[s.mode.difficulty].legacyMult);
    },

    /**
     * The Hall of Fame bucket of a game length: 15 short, 40 medium, 100 long, 0 unlimited; a Custom
     * length files under the nearest (ties to the longer; above 100: long).
     * @returns {string} 'short' | 'medium' | 'long' | 'unlimited'
     */
    hofBucket: function (length) {
      var lengths = T().hof.lengths, i;
      if (!length) return BUCKET_NAMES[lengths.indexOf(0)];
      var timed = lengths.filter(function (l) { return l > 0; }), best = timed[0];
      if (length > timed[timed.length - 1]) best = timed[timed.length - 1];
      else for (i = 0; i < timed.length; i++) if (Math.abs(length - timed[i]) <= Math.abs(length - best)) best = timed[i];
      return BUCKET_NAMES[lengths.indexOf(best)];
    },

    /**
     * A run's results for the Final Edition (UI §5.14): stored as state.result.
     * @param {string} reason 'time' | 'death' | 'retire'
     * @returns {object}
     */
    results: function (s, reason) {
      var b = endgame.breakdown(s), r = endgame.rank(s, b.total);
      return {
        reason: reason, day: s.clock.day, length: s.mode.length, difficulty: s.mode.difficulty,
        name: s.player.name, netWorth: b.total, breakdown: b, rank: r.id, rankKey: r.key, column: r.column,
        banners: endgame.banners(s, reason), legacy: endgame.legacy(s), bucket: endgame.hofBucket(s.mode.length),
        ranked: !s.mode.cheat && !s.mode.keepPlaying,
        title: SR.rules.jobs.bestTitle(s), home: s.homes.living,
        stats: { str: s.stats.str, int: s.stats.int, cha: s.stats.cha, karma: s.stats.karma },
      };
    },
  };

  SR.rules.endgame = endgame;
})();
