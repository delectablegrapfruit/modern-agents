// tests/node/bank.test.cjs — owner: W1-E. SR.rules.bank (BALANCE B-09; GDD §4.8): deposits and
// withdrawals, forced charges and the hard money rule, the lien, interest tiers with CDs and the
// $25,000 cap, the rate step's range and mean, CDs, loans by job, their countdown, and default per
// difficulty (seizure order, lien, penalty), including "never cheaper than repaying".
//   node tests/node/bank.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('bank (W1-E)');
const SR = H.boot();
const B = SR.rules.bank;

T.section('deposit, withdraw, charge');
{
  const s = H.state(SR, { money: { cash: 500, bank: 100 } });
  T.ok(B.deposit(s, 200).ok && s.money.cash === 300 && s.money.bank === 300, 'deposit moves cash to the bank');
  T.eq(B.deposit(s, 301).reason, 'reason.needCash', 'a deposit above cash is refused');
  T.eq(B.deposit(s, 2.5).reason, 'reason.amount', 'amounts are whole numbers');
  T.eq(B.deposit(s, 0).reason, 'reason.amount', 'zero is not an amount');
  T.eq(B.deposit(s, SR.tuning.bank.typedMax + 1).reason, 'reason.amount', 'amounts stop at 9,999,999');
  T.ok(B.withdraw(s, 300).ok && s.money.cash === 600 && s.money.bank === 0, 'withdraw moves the bank to cash');
  T.eq(B.withdraw(s, 1).reason, 'reason.needBank', 'a withdrawal above the balance is refused');

  const c = H.state(SR, { money: { cash: 30, bank: 50 } });
  const r = B.charge(c, 100, 'hospital');
  T.eq([r.paid, r.writtenOff, r.fromCash, r.fromBank, c.money.cash, c.money.bank], [80, 20, 30, 50, 0, 0],
    'a forced charge takes cash, then the bank, and writes off the rest (never below 0)');
  T.ok(!('deltas' in r) && !('events' in r), 'charge returns a plain { paid, writtenOff } (the charge effect adds the write-off toast)');
  const c2 = H.state(SR, { money: { cash: 300, bank: 0 } });
  T.eq([B.charge(c2, 100, 'tow').paid, c2.money.cash], [100, 200], 'a charge covered by cash touches only cash');
}

T.section('the lien');
{
  const s = H.state(SR, { money: { cash: 0, bank: 0, lien: 1000 } });
  const g = B.income(s, 301, 'wage', 'cash');
  T.eq([g.toLien, g.credited, s.money.lien, s.money.cash], [151, 150, 849, 150], 'half of income (rounded half up) goes to the lien');
  B.income(s, 100, 'gift', 'cash');
  T.eq(s.money.cash, 250, 'a source outside the list (a gift) skips the lien');
  const t = H.state(SR, { money: { cash: 0, bank: 0, lien: 30 } });
  const g2 = B.income(t, 200, 'rent', 'bank');
  T.eq([g2.toLien, t.money.lien, t.money.bank], [30, 0, 170], 'the lien takes no more than it is owed');
  T.eq(SR.tuning.bank.default.lienSources.slice().sort(), ['deal', 'interest', 'loot', 'prize', 'rent', 'salary', 'tour', 'wage', 'win'],
    'the nine income sources of B-09');
}

T.section('interest tiers and the cap');
{
  function interest(bank, rate, patch) {
    const s = H.state(SR, { money: { bank: bank, rate: rate } });
    if (patch) SR.util.merge(s, patch);
    return B.interest(s);
  }
  T.eq(interest(50000, 2), 1000, 'T1: $50,000 at 2 % → $1,000');
  T.eq(interest(150000, 2), 2500, 'T2 at r/2: $150,000 at 2 % → 2,000 + 500');
  T.eq(interest(2000000, 2), 16000, 'T3 at r/4: $2,000,000 at 2 % → 2,000 + 9,000 + 5,000');
  T.eq(interest(5000000, 3.5), 25000, 'capped at $25,000 a night');
  T.eq(interest(1234, 1.7), Math.floor(1234 * 1.7 / 100), 'floored to whole dollars');
  T.eq(interest(100000, 2, { money: { cds: [{ amount: 50000, rate: 2.4, dayOpened: 1 }] } }), 1500,
    'open CD principal shrinks the T1 room: $100,000 with a $50,000 CD → 1,000 + 500');
  const restore = H.features(SR, { perks: true });
  T.eq(interest(200000, 2, { perks: { owned: ['taxWizard'] } }), 4000, 'Tax Wizard: T1 up to $200,000');
  restore();
  T.eq(interest(200000, 2, { perks: { owned: ['taxWizard'] } }), 3000, 'the perk does nothing while `perks` is off');
  const r2 = H.features(SR, { karmaTiers: true });
  T.eq(interest(10000, 2, { stats: { karma: 60 } }), 225, 'Good karma tier: +0.25 on the paid rate (P1)');
  T.eq(interest(10000, 2, { stats: { karma: 40 } }), 200, 'neutral karma: the plain rate');
  r2();
  T.eq(interest(10000, 2, { stats: { karma: 60 } }), 200, 'no tier bonus while `karmaTiers` is off');
  T.eq(interest(100000, 2, { election: { decreesUsed: ['seizeBank'] } }), 0, 'Seize the Bank: savings interest is 0 forever');
}

T.section('the rate step');
{
  const s = H.state(SR, { money: { rate: 2.0 } });
  const rng = SR.rng.create(99);
  let lo = Infinity, hi = -Infinity, sum = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) {
    const r = B.rateStep(s, rng);
    lo = Math.min(lo, r); hi = Math.max(hi, r); sum += r;
    s.money.rateHist = [];
  }
  T.ok(lo >= 0.25 && hi <= 3.5, 'the rate stays within 0.25-3.5 over 10^5 nights', [lo, hi]);
  T.ok(Math.abs(sum / N - 1.5) <= 0.05, 'its mean over 10^5 nights is 1.5 ± 0.05', sum / N);
  const t = H.state(SR, { money: { rate: 3.5 } });
  for (let i = 0; i < 40; i++) B.rateStep(t, rng);
  T.eq(t.money.rateHist.length, 30, 'the rate board keeps 30 points');
  const u = H.state(SR, { money: { rate: 0.25 } });
  const r0 = SR.rng.create(5), r1 = SR.rng.create(5);
  B.rateStep(u, r0);
  r1.next();
  T.eq(r0.state(), r1.state(), 'one rate step draws exactly one number');
}

T.section('CDs (P1 homesPlus)');
{
  const s = H.state(SR, { money: { bank: 150000, rate: 2 } });
  T.eq(B.openCd(s, 5000).reason, 'reason.featureOff', 'CDs are off in P0');
  const restore = H.features(SR, { homesPlus: true });
  T.eq(B.openCd(s, 999).reason, 'reason.cdMin', 'at least $1,000');
  T.ok(B.openCd(s, 60000).ok && B.openCd(s, 30000).ok, 'two CDs open');
  T.eq(B.openCd(s, 20000).reason, 'reason.cdTotal', 'total principal at most $100,000');
  T.ok(B.openCd(s, 10000).ok, 'a third CD');
  T.eq(B.openCd(s, 1000).reason, 'reason.cdMax', 'at most 3 open');
  T.eq(s.money.bank, 50000, 'CD principal leaves the bank balance');
  T.eq(s.money.cds[0].rate, 2.4, 'rate r × 1.2 at opening');
  const back = B.breakCd(s, 2);
  T.eq([back.returned, s.money.bank, s.money.cds.length], [9000, 59000, 2], 'breaking early returns the principal - 10 %, no interest');
  // Maturity: opened day 1, lock 7 days → paid at the night that ends day 7.
  s.clock.day = 6;
  T.eq(B.maturities(s).length, 0, 'not mature on day 6');
  s.clock.day = 7;
  const m = B.maturities(s);
  T.eq([m.length, m[0].interest, s.money.cds.length], [2, Math.floor(60000 * 2.4 / 100 * 7), 0], 'matured on day 7 with simple interest');
  T.eq(s.money.bank, 59000 + 90000 + Math.floor(60000 * 0.168) + Math.floor(30000 * 0.168), 'principal and interest back in the bank');
  restore();
}

T.section('loans');
{
  const s = H.state(SR, { money: { cash: 0, bank: 0, rate: 2 } });
  T.eq(B.loan(s, 1001).reason, 'reason.creditLimit', 'a cook borrows up to $1,000');
  T.ok(B.loan(s, 1000).ok && s.money.cash === 1000 && s.money.loan.daysLeft === 15, 'a 15-day loan (orig)');
  T.eq(B.loan(s, 10).reason, 'reason.loanOpen', 'one loan at a time (orig)');
  T.eq(B.repay(s, 400).left, 600, 'partial repayment');
  T.eq(B.repay(s, 5000).left, 0, 'repaying more than owed closes the loan');
  T.eq(s.money.loan, null, 'the loan is gone');
  T.eq(B.repay(s, 5).reason, 'reason.noLoan', 'nothing to repay');
  const e = H.state(SR, { job: { ranks: { nli: 'exec' } } });
  T.ok(!B.loan(e, 10001).ok && B.loan(e, 10000).ok, 'an Executive borrows up to $10,000 (B-05)');
  const o = H.state(SR, { job: { office: 'president' } });
  T.ok(B.loan(o, 250000).ok, 'in office: $250,000');
  const f = H.state(SR, { money: { creditFrozenUntil: 20 } });
  T.eq(B.loan(f, 100).reason, 'reason.creditFrozen', 'credit frozen after a default');

  const n = H.state(SR, { money: { rate: 2, loan: { amount: 1000, daysLeft: 6 } } });
  const a = B.loanNight(n);
  T.eq([a.interest, a.amount, a.daysLeft, a.warn, a.due], [30, 1030, 5, 5, false], 'interest at r + 1 %, compounding; the 5-day warning');
  const b = B.loanNight(n);
  T.eq([b.amount, b.warn], [1030 + Math.floor(1030 * 0.03), null], 'compounds on the new amount; no warning at 4');
  n.money.loan.daysLeft = 2;
  T.eq(B.loanNight(n).warn, 1, 'the 1-day warning');
  T.eq(B.loanNight(n).due, true, 'due at 0');
}

T.section('default per difficulty');
{
  const h = H.state(SR, { money: { cash: 5000, loan: { amount: 900, daysLeft: 0 } } }, { difficulty: 'hardcore' });
  const dh = B.default(h);
  T.eq([dh.dead, h.flags.dead, h.money.cash], ['loan', 'loan', 5000], 'Hardcore: flags.dead = loan, nothing seized (death after the night)');

  // Standard: every seizure stage in order.
  const s = H.state(SR, {
    money: { cash: 300, bank: 200, loan: { amount: 20000, daysLeft: 0 }, cds: [{ amount: 1000, rate: 2, dayOpened: 1 }] },
    stocks: { NLI: { price: 10, held: 100, basis: 1000 } },
    furniture: { owned: { bed: 1, minibar: 1 }, storage: [] },
    homes: { owned: ['apt', 'apt2', 'pent'], living: 'apt', lets: { apt2: 3 } },
    stats: { karma: 5, hp: 20 },
  });
  const d = B.default(s);
  T.eq(d.seized.map((x) => x.kind), ['bank', 'cash', 'cd', 'stock', 'furniture', 'furniture', 'home'],
    'seizure order: bank → cash → CDs → stocks → furniture (dearest first) → homes (dearest first)');
  T.eq(d.seized.slice(0, 5).map((x) => x.applied), [200, 300, 900, 995, 2500], 'values: CD - 10 %, stocks at the bid, furniture at 50 %');
  T.eq(d.seized[5].key, 'bed', 'the cheaper piece goes second');
  T.eq([d.seized[6].key, d.seized[6].value], ['pent', 36000], 'the dearest home you do not live in, at 90 %');
  const owedAfterFurniture = 20000 - 200 - 300 - 900 - 995 - 2500 - 250;
  T.eq(s.money.cash, 36000 - owedAfterFurniture, 'a sale\'s surplus goes to cash');
  T.eq([s.homes.owned, Object.keys(s.furniture.owned), s.stocks.NLI.held], [['apt', 'apt2'], [], 0], 'what was seized is gone');
  T.eq([s.money.lien, s.money.loan, s.money.creditFrozenUntil], [0, null, s.clock.day + 60], 'no lien when the assets covered it; credit frozen 60 days');
  T.eq([s.stats.karma, s.stats.hp], [-5, 1], 'Standard: -10 karma, HP to 1');

  const l = H.state(SR, { money: { cash: 100, bank: 0, loan: { amount: 1000, daysLeft: 0 } }, stats: { hp: 20 } }, { difficulty: 'relaxed' });
  const dl = B.default(l);
  T.eq([dl.lien, l.money.lien, l.stats.hp, l.stats.karma], [900, 900, 20, -10], 'Relaxed: the rest becomes the lien; HP unchanged');
  T.eq(dl.events[0], { name: 'loan', payload: { kind: 'default', amount: 1000 } }, 'the `loan` rule event');
}

T.section('default is never cheaper than repaying (net worth)');
{
  // Two runs from one state and one seed: repay at once, or let the loan run out and default.
  function run(repay) {
    const s = H.state(SR, { money: { cash: 0, bank: 30000, rate: 2 }, job: { ranks: { nli: 'exec' } } });
    B.loan(s, 10000);
    B.deposit(s, 10000);
    if (repay) { B.withdraw(s, 10000); B.repay(s, 10000); }
    const c = H.ctx(SR, 4);
    for (let i = 0; i < 16; i++) SR.rules.night.run(s, c, { kind: 'sleep' });
    return s;
  }
  const a = run(true), b = run(false);
  const nwA = SR.rules.endgame.netWorth(a), nwB = SR.rules.endgame.netWorth(b);
  T.ok(b.money.creditFrozenUntil > 0 && !b.money.loan, 'the unpaid loan defaulted');
  T.ok(nwB <= nwA, 'net worth after a default ≤ net worth after repaying', [nwB, nwA]);
  // A richer case: furniture and stocks at stake, cash short.
  function run2(repay) {
    const s = H.state(SR, { money: { cash: 0, bank: 0, rate: 1.5 }, job: { ranks: { nli: 'ceo' } },
      furniture: { owned: { minibar: 1, books: 1 } }, stocks: { SKY: { price: 3, held: 1000, basis: 3000 } } });
    B.loan(s, 20000);
    if (repay) B.repay(s, 20000);
    const c = H.ctx(SR, 8);
    for (let i = 0; i < 16; i++) SR.rules.night.run(s, c, { kind: 'sleep' });
    return SR.rules.endgame.netWorth(s);
  }
  T.ok(run2(false) <= run2(true), 'also with furniture and stocks seized');
}

T.section('named fns');
{
  const s = H.state(SR, { money: { cash: 100 } });
  T.eq(SR.reg.fn['bank.deposit'](s, { amount: 40 }, {}).ok, true, 'bank.deposit reads params.amount');
  T.eq(s.money.bank, 40, '… and moves the money');
  T.eq(SR.reg.fn['bank.withdraw'](s, { amount: 400 }, {}).reason, 'reason.needBank', 'a refusal comes back as { ok: false, reason }');
  T.eq(SR.reg.fn['bank.hasLoan'](s, {}, {}).ok, false, 'condition bank.hasLoan');
  T.eq(SR.reg.fn['bank.charge'](s, {}, {}, 30, 'tow').paid, 30, 'bank.charge as an effect');
}

T.done();
