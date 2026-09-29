// js/data/stocks.js — owner: W1-E. SR.def.stock: the six fictional tickers of BALANCE B-10
// (GDD §4.9). A def carries the company's identity and its quirk; the numbers (start price and its
// spread, drift μ, volatility σ, quirk sizes) live in SR.tuning.stocks and are read by
// SR.rules.stocks at call time; a prio-20 boot hook copies start, mu and sigma onto the defs.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // quirk: the nightly rule of the ticker (SR.rules.stocks.tick; GDD §4.9):
  //   burgerDay   MCS: +5 % on the Burger Day city event (P1 `calendar`)
  //   ceoDrift    NLI: extra drift while you are CEO with ≥ 3 NLI shifts that week
  //   casinoWin   SLC: -4 % the night after you win more than $5,000 there in a day
  //   rain        PPR: -3 % after a rainy day (P1 `weather`)
  //   falls       GLU: +2 % after a day with any fall
  //   penny       SKY: none; the volatile penny stock
  SR.def.stock('MCS', { name: 'stock.MCS', company: 'stock.MCS.company', quirk: 'burgerDay', icon: 'fries', order: 1, p: 0 });
  SR.def.stock('NLI', { name: 'stock.NLI', company: 'stock.NLI.company', quirk: 'ceoDrift', icon: 'work', order: 2, p: 0 });
  SR.def.stock('SLC', { name: 'stock.SLC', company: 'stock.SLC.company', quirk: 'casinoWin', icon: 'slots', order: 3, p: 0 });
  SR.def.stock('PPR', { name: 'stock.PPR', company: 'stock.PPR.company', quirk: 'rain', icon: 'paper', order: 4, p: 0 });
  SR.def.stock('GLU', { name: 'stock.GLU', company: 'stock.GLU.company', quirk: 'falls', icon: 'scrap', order: 5, p: 0 });
  SR.def.stock('SKY', { name: 'stock.SKY', company: 'stock.SKY.company', quirk: 'penny', icon: 'bus', order: 6, p: 0 });

  // Copies the B-10 numbers onto the defs for display (the rules read SR.tuning directly).
  SR.onBoot(20, function () {
    var t = SR.tuning.stocks;
    if (!t) return;
    Object.keys(SR.reg.stock).forEach(function (id) {
      var row = t[id], def = SR.reg.stock[id];
      if (!row) return;
      ['start', 'mu', 'sigma'].forEach(function (k) { if (row[k] !== undefined) def[k] = row[k]; });
    });
  }, { headless: true });
})();
