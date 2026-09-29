// tests/node/endgame.test.cjs — owner: W1-E. SR.rules.endgame (BALANCE B-18; GDD §4.19): net worth
// with every part (the lien included), every rank boundary in every karma column, the banners, the
// legacy score by difficulty, the Hall of Fame buckets, and a run's results.
//   node tests/node/endgame.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('endgame (W1-E)');
const SR = H.boot();
const E = SR.rules.endgame;

T.section('net worth');
{
  const s = H.state(SR, {
    money: { cash: 1000, bank: 20000, cds: [{ amount: 5000, rate: 2, dayOpened: 1 }], loan: { amount: 3000, daysLeft: 4 }, lien: 700 },
    stocks: { NLI: { price: 12.5, held: 100 }, SKY: { price: 3.3, held: 3 } },
    homes: { owned: ['apt', 'pent'] }, furniture: { owned: { bed: 2, tv: 1 } },
    player: { cars: { sports: { owned: true, bought: true } } },
  });
  const b = E.breakdown(s);
  T.eq([b.cash, b.bank, b.cds, b.stocks, b.loan, b.lien, b.homes, b.furniture, b.car],
    [1000, 20000, 5000, 1259, 3000, 700, 36000, 1000 + 625, 30000], 'every part: CD principal, stocks at market, homes × 0.9, furniture × 0.25, a bought sports car');
  T.eq(E.netWorth(s), 1000 + 20000 + 5000 + 1259 - 3000 - 700 + 36000 + 1625 + 30000, 'net worth = assets - loan - lien');
  const g = H.state(SR, { player: { cars: { sports: { owned: true, bought: false } } } });
  T.eq(E.breakdown(g).car, 0, 'the day-365 gift is not counted (only a bought car)');
  T.eq(E.netWorth(H.state(SR, { money: { cash: 0, lien: 50 } })), -50, 'the lien can make net worth negative');
}

T.section('every rank boundary');
{
  const floors = SR.tuning.endgame.ranks;
  const cols = { neutral: 0, good: 21, evil: -21 };
  let bad = [];
  Object.keys(cols).forEach((col) => {
    const s = H.state(SR, { stats: { karma: cols[col] } });
    for (let t = 0; t <= floors.length; t++) {
      const cell = Object.keys(SR.reg.rank).filter((id) => SR.reg.rank[id].tier === t && (SR.reg.rank[id].column === 'all' || SR.reg.rank[id].column === col))[0];
      const lo = t === 0 ? -1e9 : floors[t - 1], hi = t === floors.length ? 1e12 : floors[t] - 1;
      [lo, hi].forEach((nw) => { const r = E.rank(s, nw); if (r.id !== cell || r.column !== col) bad.push([col, nw, r.id, cell]); });
    }
  });
  T.eq(bad, [], 'the first and last dollar of every tier land in its cell, in each column (' + (floors.length + 1) * 3 * 2 + ' checks)');
  const k = (karma, nw) => E.rank(H.state(SR, { stats: { karma: karma } }), nw).id;
  T.eq([k(20, 1500), k(21, 1500), k(-20, 1500), k(-21, 1500)], ['stick_figure', 'nice_stick', 'stick_figure', 'troublemaker'],
    'columns: karma > +20 good, < -20 evil (orig)');
  T.eq([k(0, -1), k(0, 0), k(0, 499), k(0, 500), k(0, 1499)], ['in_the_red', 'flat_as_paper', 'flat_as_paper', 'crumpled', 'crumpled'], 'the shared bottom rows');
  T.eq([k(50, 15000000), k(-99, 5000000), k(0, 100000)], ['halo_incarnate', 'scourge_of_the_skies', 'big_shot'], 'the top tiers are reachable (the original\'s dead tier is gone)');
  T.ok(Object.keys(SR.reg.rank).every((id) => SR.text.has('rank.' + id)), 'every rank has its stamp text');
}

T.section('legacy, banners, the Hall of Fame');
{
  const s = H.state(SR, { money: { cash: 12345, bank: 0 }, stats: { str: 100, int: 200, cha: 300, karma: -40 },
    job: { ranks: { nli: 'exec' } }, achievements: { fall_1: 3, jail_1: 9 } });
  const raw = 123 + 100 + 200 + 300 + 5 * 40 + 250 * 2 + 500 * 4;
  T.eq(E.legacy(s), raw, 'legacy = NW/100 + stats + 5·|karma| + 250·achievements + 500·job rank (Standard ×1)');
  s.mode.difficulty = 'hardcore';
  T.eq(E.legacy(s), Math.floor(raw * 1.5), 'Hardcore ×1.5');
  s.mode.difficulty = 'relaxed';
  T.eq(E.legacy(s), Math.floor(raw * 0.75), 'Relaxed ×0.75');
  const o = H.state(SR, { job: { office: 'president' }, election: { status: 'office' } });
  T.eq(E.legacy(o) - E.legacy(H.state(SR, {})), 10000 + 500 * 7, 'elected: +10,000 and job rank 7');
  T.eq(E.banners(o, 'time'), ['president'], 'the office banner');
  T.eq(E.banners(H.state(SR, { mode: { cheat: true } }), 'death'), ['unverified', 'deceased'], 'UNVERIFIED, DECEASED');
  const b = (len) => E.hofBucket(len);
  T.eq([b(15), b(40), b(100), b(0)], ['short', 'medium', 'long', 'unlimited'], 'the standard lengths');
  T.eq([b(7), b(27), b(28), b(70), b(71), b(101), b(365)], ['short', 'short', 'medium', 'long', 'long', 'long', 'long'],
    'Custom lengths: the nearest (27 → 15, 28 → 40), ties to the longer (70 → 100), above 100 long');
}

T.section('results');
{
  const s = H.state(SR, { clock: { day: 41 }, money: { cash: 41380 }, stats: { karma: 34 } }, { length: 40 });
  const r = E.results(s, 'time');
  T.eq([r.reason, r.day, r.length, r.netWorth, r.rank, r.column, r.bucket, r.ranked, r.title, r.home],
    ['time', 41, 40, 41380, 'pillar_of_the_community', 'good', 'medium', true, 'cook', 'apt'], 'the Final Edition\'s facts');
  T.ok(typeof r.legacy === 'number' && r.breakdown.cash === 41380, 'with the legacy and the breakdown');
  T.eq(E.results(H.state(SR, { mode: { keepPlaying: true } }), 'time').ranked, false, 'a Keep-playing run is unranked');
}

T.done();
