// tests/node/stocks.test.cjs — owner: W2-RulesE (W1-E in wave 1). SR.rules.stocks (BALANCE B-10; GDD §4.9): the tick's
// mean and σ over 10^5 draws, every quirk and the tip's shock (common random numbers), reverse
// splits, the tip's reliability and draw, trades with the fee, the spread and the position cap, no
// shorts, and the B-10 EV table reproduced by simulation.
//   node tests/node/stocks.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('stocks (W1-E)');
const SR = H.boot();
const S = SR.rules.stocks;
const TS = SR.tuning.stocks;

/** A minimal state for ticks and trades: the six tickers at `price`, no holdings. */
function market(price, extra) {
  const stocks = {};
  TS.tickers.forEach((t) => { stocks[t] = { price: price, prev: price, hist: [], held: 0, basis: 0 }; });
  return Object.assign({ seed: 1, clock: { day: 1 }, stocks: stocks, tip: null, money: { cash: 1e9 }, stats: { int: 0 },
    records: { spent: 0 }, perks: { owned: [], pending: [] } }, extra || {});
}
/** @returns {object} each ticker's log return between two price maps. */
function logrets(before, s) {
  const out = {};
  TS.tickers.forEach((t) => { out[t] = Math.log(s.stocks[t].price / before[t]); });
  return out;
}
/**
 * Ticks two copies of a market from the same RNG state, with facts a and b (and setupB applied to
 * the second copy only); returns their log-return differences, rounded to 4 places.
 */
function crn(factsA, factsB, setupB) {
  const a = market(1000), b = market(1000);
  if (setupB) setupB(b);
  const ra = SR.rng.create(77), rb = SR.rng.create(77);
  S.tick(a, Object.assign({ rng: ra, day: 1 }, factsA));
  S.tick(b, Object.assign({ rng: rb, day: 1 }, factsB));
  const out = {};
  TS.tickers.forEach((t) => { out[t] = Math.round(Math.log(b.stocks[t].price / a.stocks[t].price) * 10000) / 10000; });
  return out;
}

T.section('the tick: mean and σ of the log return over 10^5 draws (B-10)');
{
  const rng = SR.rng.create(2026), N = 100000, samples = {};
  TS.tickers.forEach((t) => { samples[t] = []; });
  const s = market(1000);
  for (let i = 0; i < N; i++) {
    TS.tickers.forEach((t) => { s.stocks[t].price = 1000; s.stocks[t].hist = []; });
    S.tick(s, { rng: rng, day: 1 });
    TS.tickers.forEach((t) => { samples[t].push(Math.log(s.stocks[t].price / 1000)); });
  }
  TS.tickers.forEach((t) => {
    const m = H.stats(samples[t]), mu = TS[t].mu, sigma = TS[t].sigma;
    // μ is a fraction of σ (0 for SLC), so "within 5 %" is read as |mean - μ| ≤ 5 % of σ, and σ within 5 %.
    T.ok(Math.abs(m.mean - mu) <= 0.05 * sigma, t + ': mean ' + m.mean.toFixed(5) + ' vs μ ' + mu);
    T.ok(Math.abs(m.sd / sigma - 1) <= 0.05, t + ': σ ' + m.sd.toFixed(5) + ' vs ' + sigma);
  });
  const r0 = SR.rng.create(3), r1 = SR.rng.create(3);
  S.tick(market(10), { rng: r0, day: 1 });
  for (let i = 0; i < 18; i++) r1.next();
  T.eq(r0.state(), r1.state(), 'a tick draws exactly three numbers per ticker');
}

T.section('quirks and shocks (common random numbers)');
{
  const zero = { MCS: 0, NLI: 0, SLC: 0, PPR: 0, GLU: 0, SKY: 0 };
  const only = (t, v) => Object.assign({}, zero, { [t]: v });
  T.eq(crn({}, { ceo: true, nliShifts: 3 }), only('NLI', 0.003), 'NLI +0.30 % while CEO with ≥ 3 NLI shifts that week');
  T.eq(crn({}, { ceo: true, nliShifts: 2 }), zero, '… not with 2 shifts');
  T.eq(crn({}, { casinoWin: 5001 }), only('SLC', -0.04), 'SLC -4 % after winning more than $5,000 there');
  T.eq(crn({}, { casinoWin: 5000 }), zero, '… not at exactly $5,000');
  T.eq(crn({}, { rain: true }), only('PPR', -0.03), 'PPR -3 % after a rainy day');
  T.eq(crn({}, { falls: 2 }), only('GLU', 0.02), 'GLU +2 % after a day with a fall');
  T.eq(crn({}, { burgerDay: true }), only('MCS', 0.05), 'MCS +5 % on Burger Day');
  T.eq(crn({}, { scare: true }), { MCS: -0.05, NLI: -0.05, SLC: -0.05, PPR: -0.05, GLU: -0.05, SKY: -0.05 }, 'stock scare: every ticker -5 %');
  T.eq(crn({}, { rebound: true }), { MCS: 0.05, NLI: 0.05, SLC: 0.05, PPR: 0.05, GLU: 0.05, SKY: 0.05 }, '… and +5 % the next market night');
  const tip = (truthful, dir) => (s) => { s.tip = { day: 1, ticker: 'SLC', dir: dir, truthful: truthful, size: 0.04, pct: 4, revealed: {} }; };
  T.eq(crn({}, { day: 1 }, tip(true, 'up')), only('SLC', 0.04), 'a true "up" tip adds its size to that ticker only');
  T.eq(crn({}, { day: 1 }, tip(false, 'up')), only('SLC', -0.02), 'a false one moves it the other way at half the size');
  T.eq(crn({}, { day: 1 }, tip(true, 'down')), only('SLC', -0.04), 'a true "down" tip');
  const a = market(10), before = { MCS: 10, NLI: 10, SLC: 10, PPR: 10, GLU: 10, SKY: 10 };
  a.tip = { day: 1, ticker: 'NLI', dir: 'up', truthful: true, size: 0.05, pct: 5, revealed: { tv: true } };
  const r = S.tick(a, { rng: SR.rng.create(1), day: 2 });
  T.eq([r.tip, logrets(before, a).NLI !== undefined], [null, true], 'a tip of another day does not shock tonight');
  const b = market(10);
  b.tip = { day: 1, ticker: 'NLI', dir: 'up', truthful: false, size: 0.05, pct: 5, revealed: { tv: true } };
  T.eq(S.tick(b, { rng: SR.rng.create(1), day: 1 }).tip, { ticker: 'NLI', dir: 'up', truthful: false, seen: true }, 'the report learns whether a seen tip was right');
  const c = market(100);
  c.stocks.GLU.held = 10;
  const rc = S.tick(c, { rng: { float: () => 0.999999 }, day: 1 });
  T.eq(rc.logs.map((l) => l.kind + ':' + l.vars.ticker), [], 'no stockMove below ±10 %');
  const d = market(100);
  d.stocks.SKY.held = 10;
  const rd = S.tick(d, { rng: { float: () => 0 }, day: 1 });
  T.eq(rd.logs.map((l) => l.kind + ':' + l.vars.ticker), ['stockMove:SKY'], 'a held ticker moving ±10 % is logged (B-29)');
}

T.section('reverse splits');
{
  const s = market(3);
  s.money.cash = 0;
  Object.assign(s.stocks.SKY, { price: 1.0, prev: 1.1, held: 25, basis: 50, hist: [1.1, 1.0] });
  const r = S.tick(s, { rng: { float: () => 0 }, day: 1 });
  const close = r.movers.filter((m) => m.ticker === 'SKY')[0].to;
  T.ok(close < 1, 'SKY closed below $1', close);
  T.eq(r.splits.length, 1, 'a close below $1 reverse-splits');
  const sp = r.splits[0];
  T.eq([s.stocks.SKY.price, s.stocks.SKY.held, s.stocks.SKY.basis], [Math.round(close * 1000) / 100, 2, 50], 'price × 10, holdings / 10 (floor), basis unchanged');
  T.eq([sp.leftover, sp.paid, s.money.cash], [5, Math.floor(5 * close), Math.floor(5 * close)], 'the 5 leftover shares are paid out at the close');
  T.eq(s.stocks.SKY.hist.map((p) => Math.round(p * 100)), [1100, 1000, Math.round(close * 1000)], 'the history is rescaled');
  T.ok(Object.keys(s.stocks).every((t) => t === 'SKY' || s.stocks[t].price >= 1), 'only the ticker below $1 splits');

  // Fewer than 10 shares: all of them are paid out, and the basis goes with them (review fix: a
  // 0-share position kept its basis, which then ate the position cap for good).
  const o = market(3, { money: { cash: 0 }, stats: { int: 0 } });
  Object.assign(o.stocks.SKY, { price: 0.95, prev: 1.2, held: 7, basis: 9, hist: [] });
  const so = S.reverseSplit(o, 'SKY');
  T.eq([o.stocks.SKY.held, o.stocks.SKY.basis, so.leftover, so.paid, o.money.cash], [0, 0, 7, 6, 6], 'a 7-share holding is paid out whole; no basis is left');
  o.money.cash = 1e6;
  const fill = o.stocks.SKY.price * (1 + TS.spread), n = Math.floor(S.cap(o) / fill);
  T.ok(S.buy(o, 'SKY', n).ok, 'the full position cap is free again after the payout', n);
  const k = market(3, { money: { cash: 0 } });
  Object.assign(k.stocks.SKY, { price: 0.95, prev: 1.2, held: 12, basis: 30, hist: [] });
  S.reverseSplit(k, 'SKY');
  T.eq([k.stocks.SKY.held, k.stocks.SKY.basis], [1, 30], 'a holding that survives keeps its basis (B-10: unchanged)');
}

T.section('the tip: reliability and the draw');
{
  const rel = (int) => S.reliability({ stats: { int: int } });
  T.eq([rel(0), rel(100), rel(300), rel(500), rel(999)], [0.5, 0.55, 0.65, 0.75, 0.75], 'min(0.75, 0.5 + INT/2000)');
  const restore = H.features(SR, { stockTips: true });
  const s = market(10, { stats: { int: 300 }, clock: { day: 3 } });
  const rng = SR.rng.create(12);
  let up = 0, truth = 0, sizes = {}, tickers = {};
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const t = S.drawTip(s, rng);
    if (t.dir === 'up') up++;
    if (t.truthful) truth++;
    sizes[t.pct] = (sizes[t.pct] || 0) + 1;
    tickers[t.ticker] = 1;
  }
  T.ok(Math.abs(up / N - 0.5) < 0.015, 'up and down tips are equally likely', up / N);
  T.ok(Math.abs(truth / N - 0.65) < 0.015, 'truthful with the reliability (0.65 at INT 300)', truth / N);
  T.eq(Object.keys(sizes).sort(), ['3', '4', '5'], 'size 3 + rand(0..2) %');
  T.eq(Object.keys(tickers).sort(), TS.tickers.slice().sort(), 'any ticker');
  T.eq([s.tip.day, s.tip.reliability], [3, 0.65], 'the tip remembers its day and reliability');
  T.ok(!S.revealed(s), 'unrevealed when drawn');
  T.ok(S.reveal(s, 'paper') && S.revealed(s) && s.tip.revealed.paper, 'a source reveals it');
  s.clock.day = 4;
  T.ok(!S.reveal(s, 'tv'), 'yesterday\'s tip cannot be revealed today');
  restore();
  const r0 = SR.rng.create(8), r1 = SR.rng.create(8);
  S.drawTip(market(10), r0);
  for (let i = 0; i < 4; i++) r1.next();
  T.eq(r0.state(), r1.state(), 'a tip draw takes exactly four numbers');
}

T.section('trades: fee, spread, cap, no shorts');
{
  const s = market(10, { money: { cash: 5000 }, stats: { int: 0 } });
  const b = S.buy(s, 'NLI', 100);
  T.eq([b.ok, b.cost, s.money.cash, s.stocks.NLI.held, s.stocks.NLI.basis], [true, 1010, 3990, 100, 1005], 'buy 100 at $10: fills at 10.05, +$5 fee');
  const sl = S.sell(s, 'NLI', 40);
  T.eq([sl.proceeds, s.money.cash, s.stocks.NLI.held, s.stocks.NLI.basis], [393, 4383, 60, 603], 'sell 40: 398 at 9.95, -$5 fee; basis falls pro rata');
  T.eq(S.sell(s, 'NLI', 61).reason, 'reason.noShares', 'no short selling: only shares you hold');
  T.eq(S.buy(s, 'NLI', 1.5).reason, 'reason.amount', 'whole shares only');
  T.eq(S.buy(s, 'XYZ', 1).reason, 'reason.noTicker', 'unknown ticker');
  const c = market(10, { money: { cash: 1e6 }, stats: { int: 0 } });
  T.eq(S.cap(c), 10000, 'the cap at INT 0: $10,000');
  T.eq(S.buy(c, 'MCS', 996).reason, 'reason.positionCap', 'cost basis above the cap is refused');
  T.ok(S.buy(c, 'MCS', 995).ok, '995 shares at 10.05 fit under $10,000');
  T.ok(S.buy(c, 'NLI', 995).ok, 'the cap is per ticker');
  c.stats.int = 500;
  T.eq(S.cap(c), 60000, 'the cap at INT 500: $60,000');
  const m = market(10, { money: { cash: 5000 }, perks: { owned: ['marketSense'], pending: [] } });
  const rp = H.features(SR, { perks: true });
  T.eq(S.buy(m, 'MCS', 100).cost, 1005, 'Market Sense: no spread');
  rp();
  T.eq(S.buy(market(10, { money: { cash: 1e9 }, stats: { int: 999 } }), 'SKY', TS.maxShares + 1).reason, 'reason.maxShares', '7-digit share limit');
  T.eq(S.value(s), 600, 'portfolio value at market price');
  T.eq(b.events[0], { name: 'buy', payload: { item: 'NLI', n: 100, where: 'stocks', price: 1010 } }, 'the `buy` rule event');
  T.eq(SR.reg.fn['stocks.sell'](s, { ticker: 'NLI', n: 10 }, {}).ok, true, 'named fn stocks.sell');
  T.eq(SR.reg.fn['stocks.buy'](s, { ticker: 'NLI', n: 10000 }, {}).reason, 'reason.positionCap', 'named fn stocks.buy refuses with a reason');
}

T.section('the B-10 EV table by simulation');
{
  // One "up" tip traded at the cap: buy before, sell after the market night. Common random numbers
  // strip the market's own drift and noise (the table ignores them): EV = profit - the untipped move.
  // Each trial draws a real tip (ticker, size) and a real market night, and weighs its true and false
  // branches by the reliability (the truth draw itself is tested above), which keeps the error small.
  const restore = H.features(SR, { stockTips: true });
  const table = [[100, 50], [250, 250], [500, 890], [999, 1640]];
  const exact = (int) => {   // the implemented rule: shocks are log returns (e^s - 1), sizes 3-5 %
    const rel = Math.min(0.75, 0.5 + int / 2000), cap = 10000 + 100 * int;
    const up = [0.03, 0.04, 0.05].reduce((a, x) => a + Math.exp(x) - 1, 0) / 3;
    const down = [0.03, 0.04, 0.05].reduce((a, x) => a + 1 - Math.exp(-x / 2), 0) / 3;
    return cap * (rel * up - (1 - rel) * down - 0.01) - 10;
  };
  const rng = SR.rng.create(4242), N = 20000;
  /** A market at the B-10 start prices (with their random spread) for one trial. */
  function start(int) {
    const s = market(0, { stats: { int: int }, money: { cash: 1e7 } });
    TS.tickers.forEach((t) => { s.stocks[t].price = s.stocks[t].prev = TS[t].start + rng.int(-TS[t].jitter, TS[t].jitter); });
    return s;
  }
  table.forEach(([int, want]) => {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const s0 = start(int), tip = S.drawTip(s0, rng), t = tip.ticker, p0 = s0.stocks[t].price;
      const night = rng.state(), rel = S.reliability(s0);
      const bare = JSON.parse(JSON.stringify(s0));
      bare.tip = null;
      S.tick(bare, { rng: SR.rng.create(1).setState(night), day: s0.clock.day });
      [true, false].forEach((truthful) => {
        const s = JSON.parse(JSON.stringify(s0));
        Object.assign(s.tip, { dir: 'up', truthful: truthful });
        const n = Math.floor(S.cap(s) / (p0 * (1 + TS.spread)));
        const cost = S.buy(s, t, n).cost;
        S.tick(s, { rng: SR.rng.create(1).setState(night), day: s.clock.day });
        const ev1 = S.sell(s, t, n).proceeds - cost - n * (bare.stocks[t].price - p0);
        sum += (truthful ? rel : 1 - rel) * ev1;
      });
    }
    const ev = sum / N, ex = exact(int);
    T.ok(Math.abs(ev / ex - 1) <= 0.05, 'INT ' + int + ': simulated EV $' + ev.toFixed(0) + ' matches the rule\'s exact EV $' + ex.toFixed(0) + ' (±5 %)');
    if (int === 100) {
      // The table's INT 100 row rounds the shocks to 4 % / 2 %; the exact EV is $61 (a small
      // difference of large terms). Checked at ±$15 here; docs/requests/W1-E.md asks BALANCE for $60.
      T.ok(Math.abs(ev - want) <= 15, 'INT 100: EV $' + ev.toFixed(0) + ' vs the table\'s $' + want + ' (±$15; see the request)');
    } else {
      T.ok(Math.abs(ev / want - 1) <= 0.15, 'INT ' + int + ': EV $' + ev.toFixed(0) + ' vs the table\'s $' + want + ' (±15 %)');
    }
  });
  restore();
}

T.done();
