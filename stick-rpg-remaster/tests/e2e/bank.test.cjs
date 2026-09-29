// tests/e2e/bank.test.cjs — owner: W2-Money. The Bank of the 2nd Dimension (BUILD_PLAN §4.6; GDD
// §4.8, §4.10, §4.15, §6.1; BALANCE B-05, B-08a, B-09, B-11b): first the rules through the bank's
// data in Node (the card rows and the sub-screens' commits, deposits and withdrawals, loans with the
// credit limit of every rung, the 5- and 1-day voicemails, default on each difficulty with the
// seizure order, the lien, the karma and the freeze, the interest tiers and the $25,000 cap, the
// Real Estate desk's buy / move in and the P1 sell and let, the bank robbery of B-11b, Penny's
// greetings), then the game in Chromium over file:// (every sub-screen by click and key, the loan's
// confirm, the last day ("due tonight") and repayments from cash, a default seen on the loan page,
// what a default does on each difficulty, the rate board's estimate at the stepped rate and the cap,
// a fortune capped at $9,999,999 per move with the focus kept in the card, `bank.realestate`
// pushed from the bank's desk, from a For Sale door's Tour, from a Pocket host, from the Live card's
// Properties and an Owned door's Sell (P1), the P1 CDs, let and sell, the robbery through the
// confirm and the Hold-up with Auto, a forced win and a forced loss, the weekly limit, the a11y
// audit of each screen) with zero console errors. Screenshots go to shots/W2-Money/ (git-ignored).
//   node tests/e2e/bank.test.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');
const { load } = require('../node/load.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Money');
const T = h.suite('e2e bank (W2-Money)');

// BALANCE, copied from the document (not read from tuning.js).
const CREDIT = { cook: 1000, janitor: 2000, mail: 3000, sales: 5000, exec: 10000, vp: 25000, ceo: 50000 };   // B-05
const OFFICE_CREDIT = 250000;
const LOAN = { days: 15, rateAdd: 1, warn: [5, 1] };                                                          // B-09
const DEFAULT = { karma: -10, frozen: 60, hpStandard: 1, lienShare: 0.5, cdPenalty: 0.10, furniture: 0.5, homes: 0.9 };
const CAP = 25000, T1 = 100000, T2 = 1000000;
const HOMES = { apt: [0, 3, 0], apt2: [10000, 5, 0.05], pent: [40000, 7, 0.10], mansion: [100000, 10, 0.15], castle: [500000, 14, 0.20] };   // B-08a price, slots, sleep
const RENT = { apt2: 60, pent: 240, mansion: 600, castle: 3000 }, SELL = { apt2: 9000, pent: 36000, mansion: 90000, castle: 450000 };
const ROB = { str: 100, ammo: [5, 9], karma: -20, heat: 60, D: 400, perRecent: 100, loot: [3000, 15000], jail: 7, start: 1260, clock: 1440 };   // B-11b bank
const CD = { min: 1000, days: 7, mult: 1.2, maxOpen: 3, max: 100000, penalty: 0.10 };

function rules() {
  const R = load({ mode: 'all', extra: ['js/minigames/framework.js', 'js/minigames/duel.js'] });
  const SR = R.SR;
  const A_ = SR.rules.act;
  let seed = 1;
  const ctx = () => ({ rng: SR.rng.create(seed++), source: 'sim' });
  const fresh = (patch) => { const s = SR.rules.state.create({ seed: 42 }); if (patch) SR.util.merge(s, patch); return s; };
  const flags = (on) => { Object.keys(SR.features).forEach((f) => { SR.features[f] = false; }); (on || []).forEach((f) => { SR.features[f] = true; }); };
  const pv = (s, id, p) => A_.preview(s, id, p || {}, ctx());
  const run = (s, id, p, c) => A_.run(s, id, p || {}, c || ctx());
  const night = (s, c) => SR.rules.night.run(s, c || ctx(), { kind: 'sleep' });
  const visible = (s, owner) => A_.actions(owner).filter((id) => !pv(s, id).hidden);

  T.section('the building, its rows and the sub-screens\' commits');
  flags([]);
  const b = SR.reg.building.bank;
  T.eq([b.owner, b.portrait, b.music, b.interior, b.exteriorId], ['penny', 'penny', 'compound_interest', 'bank', 'bank'], 'the bank: Penny Wise, compound_interest, its interior');
  T.eq(visible(fresh(), 'bank'), ['bank.depositOpen', 'bank.withdrawOpen', 'bank.loanOpen', 'bank.repayOpen', 'bank.realestateOpen', 'bank.ratesOpen', 'bank.rob'],
    'P0 card: Deposit, Withdraw, Get a loan, Repay, the Real Estate desk, the rate board, Rob the bank (GDD §6.1)');
  T.eq(['depositOpen', 'withdrawOpen', 'loanOpen', 'repayOpen', 'realestateOpen', 'ratesOpen'].map((k) => SR.reg.action['bank.' + k].screen),
    ['bank.deposit', 'bank.withdraw', 'bank.loan', 'bank.loan', 'bank.realestate', 'bank.rates'], 'each row opens its sub-screen');
  const commits = ['bank.deposit', 'bank.withdraw', 'bank.loan', 'bank.repay', 'bank.buyHome', 'bank.moveIn', 'bank.sellHome', 'bank.letHome', 'bank.endLet', 'bank.openCd', 'bank.breakCd'];
  T.ok(commits.every((id) => { const d = SR.reg.action[id]; return d && d.row === false && d.timeRule === 'free' && !d.repeatable; }), 'the commits: row false, free (no time), never repeatable');
  flags(['homesPlus']);
  T.ok(commits.every((id) => pv(fresh(), id).hidden) && !pv(fresh(), 'bank.deposit', { amount: 1 }).hidden, 'a commit hides without its parameter, and shows with it');
  T.eq(visible(fresh(), 'bank').indexOf('bank.cdsOpen') >= 0, true, 'P1 homesPlus: the CDs row');
  flags([]);
  T.eq(pv(fresh(), 'bank.cdsOpen').hidden, true, 'the CDs row hides while homesPlus is off');

  T.section('deposit and withdraw (GDD §4.8: free, any whole amount)');
  let s = fresh({ money: { cash: 500, bank: 0 }, clock: { min: 1440 } });
  let p = pv(s, 'bank.deposit', { amount: 200 });
  T.eq([p.ok, p.gains.map((g) => g.kind + g.n)], [true, ['cash-200', 'bank200']], 'the preview: -$200 cash, +$200 bank');
  let r = run(s, 'bank.deposit', { amount: 200 });
  T.eq([r.ok, s.money.cash, s.money.bank, s.clock.min], [true, 300, 200, 1440], 'deposit $200 at 24:00: free and allowed after midnight');
  T.eq([pv(s, 'bank.deposit', { amount: 301 }).reason, pv(s, 'bank.deposit', { amount: 0 }).reason, pv(s, 'bank.deposit', { amount: 1.5 }).reason],
    ['reason.needCash', 'reason.amount', 'reason.amount'], 'more than the cash, zero and a fraction are refused');
  r = run(s, 'bank.withdraw', { amount: 150 });
  T.eq([r.ok, s.money.cash, s.money.bank], [true, 450, 50], 'withdraw $150');
  T.eq(pv(s, 'bank.withdraw', { amount: 51 }).reason, 'reason.needBank', 'more than the balance: "Need $51 in the bank"');

  T.section('loans (B-09; the credit limit by your best job, B-05)');
  const limitOf = (ranks, office) => SR.rules.jobs.creditLimit(fresh({ job: { ranks: ranks, office: office || null } }));
  T.eq(Object.keys(CREDIT).map((id) => limitOf(id === 'cook' ? { mcsticks: 'cook', nli: null } : { mcsticks: null, nli: id })), Object.keys(CREDIT).map((k) => CREDIT[k]),
    'credit limit per rung: $1,000 cook ... $50,000 CEO');
  T.eq([limitOf({ mcsticks: 'cook', nli: 'exec' }), limitOf({ mcsticks: 'cook', nli: 'ceo' }, 'president')], [CREDIT.exec, OFFICE_CREDIT], 'the best job counts; in office $250,000');
  s = fresh({ money: { cash: 0, bank: 0, rate: 2 } });
  T.eq([pv(s, 'bank.loan', { amount: 1001 }).reason, pv(s, 'bank.loan', { amount: 1001 }).vars.money], ['reason.creditLimit', '$1,000'], 'a Fry Cook borrows up to $1,000');
  r = run(s, 'bank.loan', { amount: 1000 });
  T.eq([r.ok, s.money.cash, s.money.loan, r.toasts[0].key, r.events.find((e) => e.name === 'loan').payload], [true, 1000, { amount: 1000, daysLeft: LOAN.days }, 'toast.bank.loan', { kind: 'take', amount: 1000 }],
    'borrow $1,000: cash in hand, 15 days, the loan event');
  T.eq([pv(s, 'bank.loanOpen').reason, pv(s, 'bank.loan', { amount: 10 }).reason], ['reason.loanOpen', 'reason.loanOpen'], 'one loan at a time (orig): the row and the commit refuse');
  T.eq(pv(s, 'bank.repayOpen').ok, true, 'Repay the loan is open now');
  const n1 = night(s);
  // The night steps the rate first (0.25..3.5), then charges r + 1 % on the loan and counts down.
  T.ok(s.money.loan.daysLeft === LOAN.days - 1 && s.money.loan.amount >= 1000 + Math.floor(1000 * (0.25 + LOAN.rateAdd) / 100) &&
    s.money.loan.amount <= 1000 + Math.floor(1000 * (3.5 + LOAN.rateAdd) / 100), 'a night: r + 1 % interest and the countdown', s.money.loan);
  T.ok(n1.lines.some((l) => l.key === 'report.loanDays'), 'the morning report names the loan');
  const lw = fresh({ money: { cash: 0, bank: 0, rate: 1.5, loan: { amount: 2000, daysLeft: LOAN.warn[0] + 1 } } });
  night(lw);
  const vm5 = lw.msgs.filter((m) => m.key === 'vm.penny.loan5');
  lw.money.loan.daysLeft = LOAN.warn[1] + 1;
  night(lw);
  const vm1 = lw.msgs.filter((m) => m.key === 'vm.penny.loan1');
  T.eq([vm5.length, vm1.length, vm5[0].from, SR.text('vm.penny.loan5', vm5[0].vars).indexOf('⟦') < 0, /\$2,\d{3}/.test(SR.text('vm.penny.loan1', vm1[0].vars))],
    [1, 1, 'penny', true, true], 'Penny\'s voicemails at 5 and 1 days left name the amount (W1-E R5)');
  s = fresh({ money: { cash: 600, bank: 0, loan: { amount: 500, daysLeft: 3 } } });
  r = run(s, 'bank.repay', { amount: 200 });
  T.eq([r.ok, s.money.loan.amount, s.money.cash, r.toasts[0].key, r.toasts[0].vars.left], [true, 300, 400, 'toast.bank.repay', '$300'], 'a partial repayment');
  r = run(s, 'bank.repay', { amount: 1000 });
  T.eq([r.ok, s.money.loan, s.money.cash, r.toasts[0].key], [true, null, 100, 'toast.bank.repaid'], 'repaying more than owed takes only what is owed and closes the loan');
  T.eq(pv(s, 'bank.repayOpen').reason, 'reason.noLoan', 'no loan: "No loan to repay"');

  T.section('default (B-09, B-16): the seizure order, the lien, karma, the freeze, per difficulty');
  const due = (o) => fresh(SR.util.merge({ money: { rate: 0.25, loan: { amount: 20000, daysLeft: 1 } }, stats: { hp: 20 } }, o || {}));
  const owed = (st) => st.money.loan.amount + Math.floor(st.money.loan.amount * (st.money.rate + LOAN.rateAdd) / 100);
  // Owed after the last night: the amount plus r + 1 % at the stepped rate (0.25..3.5).
  const owedRange = (amount) => [amount + Math.floor(amount * (0.25 + LOAN.rateAdd) / 100), amount + Math.floor(amount * (3.5 + LOAN.rateAdd) / 100)];
  // Only the bank pays: the cash is untouched (the bank is seized before the cash).
  let d = due({ money: { bank: 30000, cash: 500 } });
  let range = owedRange(20000);
  night(d);
  T.eq([d.money.cash, d.money.lien, d.money.loan], [500, 0, null], 'a rich default: the bank pays it all, the cash is not touched');
  T.ok(d.money.bank >= 30000 - range[1] && d.money.bank <= 30000 - range[0] + Math.ceil(30000 * 3.5 / 100), 'the balance fell by the debt', d.money.bank);
  // Bank, cash, a CD (principal - 10 %), the TV at 50 %, then the top floor (not lived in) at 90 %;
  // the sale's surplus lands in cash.
  d = due({ money: { bank: 200, cash: 300, loan: { amount: 5000 }, cds: [{ amount: 1000, rate: 1, dayOpened: 1 }] }, furniture: { owned: { tv: 1 } }, homes: { owned: ['apt', 'apt2'], living: 'apt' } });
  range = owedRange(5000);
  const assets = 200 + 300 + 1000 * (1 - DEFAULT.cdPenalty) + 2500 * DEFAULT.furniture + HOMES.apt2[0] * DEFAULT.homes;
  night(d);
  T.eq([d.money.cds.length, !!d.furniture.owned.tv, d.homes.owned, d.money.lien, d.money.bank], [0, false, ['apt'], 0, 0], 'the repo men took the bank, the cash, the CD, the TV and the top floor');
  T.ok(d.money.cash >= assets - range[1] && d.money.cash <= assets - range[0] + 10, 'the sale\'s surplus lands in cash: the seized values less the debt', [d.money.cash, assets - range[1], assets - range[0]]);
  // Stocks come before furniture and homes: enough shares cover the debt, sold at the bid, the
  // fewest needed; the TV and the top floor stay, and nothing is left for a lien.
  d = due({ money: { bank: 0, cash: 0, loan: { amount: 5000 } }, stocks: { NLI: { held: 100, price: 100, basis: 100 } },
    furniture: { owned: { tv: 1 } }, homes: { owned: ['apt', 'apt2'], living: 'apt' } });
  night(d);
  const soldShares = 100 - d.stocks.NLI.held;
  T.ok(soldShares > 0 && soldShares < 100 && !!d.furniture.owned.tv && d.homes.owned.indexOf('apt2') >= 0 && d.money.lien === 0 && d.money.loan === null,
    'the seizure order: stocks (the fewest shares) before the furniture and the homes', { sold: soldShares, tv: d.furniture.owned.tv, homes: d.homes.owned, lien: d.money.lien });
  T.ok(d.money.cash >= 0 && d.money.cash < d.stocks.NLI.price, 'the last share sold leaves less than a share\'s price in cash', d.money.cash);
  // Nothing covers it: the lien, -10 karma, frozen 60 days, HP 1 (Standard).
  d = due({ money: { bank: 0, cash: 0 }, stats: { karma: 20 } });
  range = owedRange(20000);
  const day0 = d.clock.day;
  night(d);
  T.ok(d.money.lien >= range[0] && d.money.lien <= range[1], 'Standard: the whole debt becomes a lien', d.money.lien);
  // HP drops to 1 at the default (night step 2); the same night's sleep then restores from 1 (step 6).
  const wake1 = Math.min(d.stats.hpMax, DEFAULT.hpStandard + SR.rules.night.restoreHp(d));
  T.eq([d.stats.karma, d.money.creditFrozenUntil, d.stats.hp, d.money.loan], [20 + DEFAULT.karma, day0 + DEFAULT.frozen, wake1, null],
    'karma -10, credit frozen 60 days, HP to 1 (then the night\'s restore from 1)');
  const vmd = d.msgs.find((m) => m.key === 'vm.penny.default');
  T.ok(!!vmd && !/[{⟦]/.test(SR.text(vmd.key, vmd.vars)) && SR.text(vmd.key, vmd.vars).indexOf(SR.text.money(d.money.lien)) >= 0, 'Penny\'s default voicemail names the debt and the lien left', vmd && SR.text(vmd.key, vmd.vars));
  T.eq([pv(d, 'bank.loanOpen').reason, pv(d, 'bank.loanOpen').vars.day], ['reason.creditFrozen', day0 + DEFAULT.frozen], 'Get a loan: "Credit frozen until day N"');
  const w = fresh({ money: { lien: 1000 }, job: { ranks: { nli: 'janitor' } }, clock: { min: 480 } });
  run(w, 'nli.work', { variant: 'full' });
  T.eq([w.money.lien, w.money.cash], [1000 - 60 * DEFAULT.lienShare, 100 + 60 * DEFAULT.lienShare], 'the lien takes half of a $60 wage');
  const rel = due({ mode: { difficulty: 'relaxed' }, money: { bank: 0, cash: 0 } });
  night(rel);
  T.eq([rel.money.lien > 0, rel.stats.hp, rel.money.creditFrozenUntil > 0], [true, rel.stats.hpMax, true], 'Relaxed: the same, without the HP loss (a full night\'s restore)');
  const hc = due({ mode: { difficulty: 'hardcore' }, money: { bank: 0, cash: 0 } });
  const hr = night(hc);
  T.eq([hc.flags.dead, !!hc.over, hr.dead], ['loan', true, 'loan'], 'Hardcore: death by collection agents after the night (orig)');
  // Defaulting is never cheaper than repaying (GDD §4.8).
  const pay = due({ money: { bank: 40000, cash: 0 } }), dft = due({ money: { bank: 40000, cash: 0 } });
  run(pay, 'bank.withdraw', { amount: 40000 });
  run(pay, 'bank.repay', { amount: pay.money.loan.amount });
  night(pay);
  night(dft);
  T.ok(SR.rules.endgame.netWorth(dft) <= SR.rules.endgame.netWorth(pay), 'net worth after a default ≤ after repaying', [SR.rules.endgame.netWorth(dft), SR.rules.endgame.netWorth(pay)]);

  T.section('interest: the tiers and the $25,000 cap (B-09)');
  const I = (bank, rate) => SR.rules.bank.interest(fresh({ money: { bank: bank, rate: rate } }));
  T.eq([I(10000, 2), I(T1 + 100000, 2), I(T2 + 400000, 1), I(50000000, 3.5)],
    [200, Math.floor(T1 * 2 / 100 + 100000 * 2 / 200), Math.min(CAP, Math.floor(T1 / 100 + (T2 - T1) / 200 + 400000 / 400)), CAP], 'full rate to $100,000, half to $1,000,000, a quarter above, capped at $25,000');

  T.section('the Real Estate desk (B-08a; GDD §4.15)');
  s = fresh({ money: { cash: 4000, bank: 10000 } });
  p = pv(s, 'bank.buyHome', { homeId: 'apt2' });
  T.eq(p.ok, true, 'the top floor is for sale');
  r = run(s, 'bank.buyHome', { homeId: 'apt2' });
  T.eq([r.ok, s.money.cash, s.money.bank, s.homes.owned, s.homes.living], [true, 0, 4000, ['apt', 'apt2'], 'apt'], 'buy: cash first, then the bank; buying does not move you in');
  T.eq([r.toasts[0].key, r.msgs[0].key, r.log.some((l) => l.kind === 'homeBought'), r.events.some((e) => e.name === 'home' && e.payload.kind === 'buy')],
    ['toast.bank.homeBought', 'vm.penny.homeBought', true, true], 'the toast, Penny\'s voicemail, the log entry and the home event');
  T.eq([pv(s, 'bank.buyHome', { homeId: 'apt2' }).reason, pv(s, 'bank.buyHome', { homeId: 'pent' }).reason], ['reason.owned', 'reason.needCash'], 'owned: refused; the penthouse: "Need $40,000"');
  r = run(s, 'bank.moveIn', { homeId: 'apt2' });
  T.eq([r.ok, s.homes.living, r.toasts[0].key, s.clock.min], [true, 'apt2', 'toast.bank.movedIn', 480], 'Move in: free and instant');
  T.eq(pv(s, 'bank.moveIn', { homeId: 'apt2' }).reason, 'reason.livingHere', 'moving into the home you live in: refused');
  T.eq([pv(s, 'bank.sellHome', { homeId: 'apt' }).hidden, pv(s, 'bank.letHome', { homeId: 'apt' }).hidden], [true, true], 'sell and let hide while homesPlus is off (P1)');
  flags(['homesPlus']);
  s = fresh({ money: { cash: 0, bank: 50000 }, homes: { owned: ['apt', 'pent'], living: 'apt' } });
  r = run(s, 'bank.letHome', { homeId: 'pent' });
  T.eq([r.ok, s.homes.lets.pent, r.toasts[0].vars.money], [true, 1, '$' + RENT.pent], 'P1: let the penthouse for $240 a night');
  night(s);
  T.ok(s.money.bank > 50000 + RENT.pent - 1, 'a night of rent');
  r = run(s, 'bank.endLet', { homeId: 'pent' });
  T.eq([r.ok, s.homes.lets.pent], [true, undefined], 'P1: end the let');
  const b0 = s.money.bank;
  r = run(s, 'bank.sellHome', { homeId: 'pent' });
  T.eq([r.ok, s.money.bank - b0, s.homes.owned], [true, SELL.pent, ['apt']], 'P1: sell at 90 %, into the bank');
  T.eq(pv(s, 'bank.sellHome', { homeId: 'apt' }).reason, 'reason.livingHere', 'the home you live in cannot be sold');
  s = fresh({ money: { bank: 5000, rate: 2 } });
  r = run(s, 'bank.openCd', { amount: 1000 });
  T.eq([r.ok, s.money.bank, s.money.cds[0].amount, s.money.cds[0].rate, r.toasts[0].vars.day], [true, 4000, 1000, 2 * CD.mult, 1 + CD.days - 1], 'P1: a $1,000 CD at r × 1.2, maturing a week on');
  T.eq(pv(s, 'bank.openCd', { amount: 999 }).reason, 'reason.cdMin', 'at least $1,000');
  r = run(s, 'bank.breakCd', { index: 0 });
  T.eq([r.ok, s.money.bank, s.money.cds.length, r.toasts[0].vars.money], [true, 4000 + 1000 * (1 - CD.penalty), 0, '$900'], 'breaking it early returns the principal minus 10 %');
  flags([]);

  T.section('the bank robbery (B-11b)');
  const rob = SR.reg.action['bank.rob'];
  T.eq([rob.group, rob.timeRule, !!rob.repeatable, rob.confirm], ['crime', 'robbery', false, 'crime.rob.confirm.bank'], 'the row: crime, the robbery time rule, a confirm, never repeatable');
  const armed = (patch) => fresh(SR.util.merge({ items: { gun: 1, ammo: 20 }, stats: { str: ROB.str }, clock: { min: 1230 } }, patch || {}));
  T.eq(pv(fresh({ clock: { min: 600 } }), 'bank.rob').reason, 'reason.needItem', 'no gun: refused');
  T.eq(pv(armed({ items: { ammo: 9 } }), 'bank.rob').reason, 'reason.needItems', '9 ammo: refused (needs ≥ 10)');
  T.eq([pv(armed({ stats: { str: ROB.str - 1 } }), 'bank.rob').reason, pv(armed({ stats: { str: ROB.str - 1 } }), 'bank.rob').vars.min], ['reason.needStat', ROB.str], 'STR 99: refused ("Need STR 100")');
  T.eq(pv(armed(), 'bank.rob').ok, true, 'a gun, 10+ ammo and STR 100 at 20:30: allowed');
  T.eq(pv(armed({ clock: { min: ROB.start } }), 'bank.rob').reason, 'reason.robLate', 'at 21:00: refused');
  const used = new Set();
  let good = 0;
  for (let i = 0; i < 200; i++) {
    const st = armed({ stats: { heat: 10 } });
    const rr = run(st, 'bank.rob', {}, { rng: SR.rng.create(900 + i), source: 'sim' });
    used.add(20 - st.items.ammo);
    if (rr.ok && st.clock.min === ROB.clock && st.stats.karma === ROB.karma && st.stats.heat === 10 + ROB.heat && rr.open && rr.open.skin === 'holdup' &&
      rr.open.resolve === 'bank.rob:resolve' && rr.open.params.D === ROB.D + 10 && rr.open.params.target === 'bank' && st.weekly.bankRob === 1) good++;
  }
  T.eq([good, Array.from(used).sort()], [200, [5, 6, 7, 8, 9]], 'the start: 24:00, -20 karma, +60 Heat, rand(5..9) ammo, the Hold-up at D = 400 + Heat, the weekly counter');
  const twice = armed();
  run(twice, 'bank.rob');
  run(twice, 'bank.rob:resolve', { beats: [true, true], wins: 2 });
  twice.clock.min = 600;
  T.eq(pv(twice, 'bank.rob').reason, 'reason.weeklyLimit', 'once a week: "Come back next week"');
  const recent = armed({ crime: { bankRobDays: [1] }, clock: { day: 9 } });
  T.eq(run(recent, 'bank.rob').open.params.D, ROB.D + ROB.perRecent, 'a robbery in the last 14 days adds 100 to D');
  const loots = [];
  for (let i = 0; i < 300; i++) {
    const st = armed();
    run(st, 'bank.rob');
    const c0 = st.money.cash;
    const rr = run(st, 'bank.rob:resolve', { beats: [true, false, true], wins: 2, losses: 1 }, { rng: SR.rng.create(4000 + i), source: 'sim' });
    if (rr.ok) loots.push(st.money.cash - c0);
  }
  T.ok(loots.length === 300 && Math.min.apply(null, loots) >= ROB.loot[0] && Math.max.apply(null, loots) <= ROB.loot[1] && Math.max.apply(null, loots) - Math.min.apply(null, loots) > 8000,
    'two successes pay $3,000 + rand(0..12,000)', [Math.min.apply(null, loots), Math.max.apply(null, loots)]);
  const win = armed();
  run(win, 'bank.rob');
  const rw = run(win, 'bank.rob:resolve', { beats: [true, true], wins: 2 });
  T.eq([rw.ok, win.jail, rw.toasts.map((x) => x.key), rw.log.some((l) => l.kind === 'bankRobbery')], [true, null, ['toast.crime.bankWin', 'bark.penny.robWin'], true], 'a win: no jail, the log entry, Penny\'s bark');
  T.eq(run(win, 'bank.rob:resolve', { beats: [true, true], wins: 2 }).reason, 'reason.notNow', 'a second resolve pays nothing');
  const lose = armed();
  run(lose, 'bank.rob');
  const rl = run(lose, 'bank.rob:resolve', { beats: [false, false], wins: 0, losses: 2 });
  T.eq([rl.ok, rl.jailed, lose.items.gun, lose.items.ammo, lose.stats.karma, rl.toasts.map((x) => x.key)],
    [true, { reason: 'bank', days: ROB.jail + Math.floor(ROB.heat / 25) }, 0, 0, ROB.karma, ['toast.crime.bankLose', 'bark.penny.robLose']],
    'a loss: jail for 7 + floor(Heat / 25) days, the gun and ammo confiscated, -20 karma in all');
  const hp = armed({ stats: { cha: 300 } });
  const rop = run(hp, 'bank.rob').open;
  const a1 = SR.minigame.auto('holdup', rop.params, SR.rng.create(5), hp), a2 = SR.minigame.auto('holdup', rop.params, SR.rng.create(5), hp);
  T.eq([a1.auto, JSON.stringify(a1) === JSON.stringify(a2), a1.picks.every((x) => x === 'sweetTalk')], [true, true, true], 'Auto plays the best shown odds with real rolls (same seed, same round)');

  T.section('Penny\'s greetings');
  const g = SR.reg.fn['greet.bank'];
  const cases = [
    [fresh(), 'first'], [fresh({ clock: { day: 2, min: 600 } }), 'morning'], [fresh({ clock: { day: 2, min: 1350 } }), 'late'], [fresh({ clock: { day: 2, min: 900 } }), 'default'],
    [fresh({ clock: { day: 2 }, money: { bank: 150000 } }), 'rich'], [fresh({ clock: { day: 2 }, money: { cash: 3 } }), 'broke'],
    [fresh({ money: { loan: { amount: 100, daysLeft: 4 } } }), 'loanDue'], [fresh({ money: { loan: { amount: 100, daysLeft: 1 } } }), 'loanTonight'],
    [fresh({ money: { lien: 50 } }), 'lien'], [fresh({ money: { creditFrozenUntil: 30 } }), 'frozen'],
    [fresh({ records: { bankRobberies: 1 }, crime: { bankRobDays: [1] }, stats: { heat: 40 } }), 'robbed'], [fresh({ records: { bankRobberies: 1 }, crime: { bankRobDays: [1] } }), 'forgiven'],
    // A robbery older than 14 days (pruned from bankRobDays) is forgotten; the loan's countdown comes first.
    [fresh({ records: { bankRobberies: 1 }, clock: { day: 20, min: 900 } }), 'default'],
    [fresh({ records: { bankRobberies: 1 }, crime: { bankRobDays: [1] }, stats: { heat: 40 }, money: { loan: { amount: 100, daysLeft: 3 } } }), 'loanDue'],
    [fresh({ clock: { day: 2 }, stats: { karma: 60 } }), 'good'], [fresh({ clock: { day: 2 }, stats: { karma: -60 } }), 'bad'],
  ];
  T.eq(cases.map((c) => g(c[0]).key), cases.map((c) => 'greet.bank.' + c[1]), 'first visit, time, balance, the loan, the lien, the freeze, a robbery, karma');
  T.ok(cases.every((c) => SR.text.has('greet.bank.' + c[1]) && SR.text(g(c[0]).key, g(c[0]).vars).indexOf('{') < 0), 'every greeting is written and filled');
  return SR;
}

async function game() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ width: 1280, height: 720, fast: true });
  const E = (fn, arg) => t.page.evaluate(fn, arg);
  const rows = () => E(() => SR.ui.card.rows());
  const row = async (id) => (await rows()).find((r) => r.id === id);
  const sub = () => E(() => SR.ui.card.screens());
  const txt = (id) => E((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); return el ? el.textContent : null; }, id);
  const settle = async () => { await t.step(1); await t.step(100); };
  const fillAmount = async (id, n) => {
    await t.page.locator('#ui [data-id="' + id + '-input"]').fill(String(n));
    await t.step(1);
  };
  const quiet = () => E(() => { if (SR.ui.toast && SR.ui.toast.clear) SR.ui.toast.clear(); });
  const back = async () => { await t.press('back'); await t.step(2); if ((await t.scenes()).indexOf('confirm') >= 0) { await t.clickUI('confirm-discard-yes'); await t.step(2); } };

  await t.newGame({ seed: 31 });
  await t.set({ money: { cash: 1240, bank: 3000, rate: 1.85, rateHist: [1.2, 1.4, 1.9, 2.3, 2.6, 2.4, 2.0, 1.8, 1.6, 1.7, 1.5, 1.65] }, clock: { day: 3, min: 660 } });

  T.section('the card and the interior');
  await t.enter('bank');
  await settle();
  T.eq([await t.scenes(), (await E(() => SR.ui.building.info())).interior], [['building'], true], 'the bank opens with its registered interior');
  T.eq((await rows()).map((r) => r.id), ['bank.depositOpen', 'bank.withdrawOpen', 'bank.loanOpen', 'bank.repayOpen', 'bank.realestateOpen', 'bank.ratesOpen', 'bank.rob'], 'rows in card order');
  T.eq([(await row('bank.repayOpen')).enabled, (await row('bank.rob')).enabled], [false, false], 'Repay and Rob are shown, disabled');
  const greet = await txt('card-greeting');
  T.ok(greet && greet.length > 10 && greet.indexOf('⟦') < 0, 'Penny greets you', greet);
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-day.png'));
  await A.check(T, t, 'W2-Money bank card', '#ui [data-scene="building"]', { tab: false });

  T.section('Deposit and Withdraw by click, quick buttons and Enter');
  await t.clickUI('row-bank.depositOpen');
  await t.step(2);
  T.eq(await sub(), ['bank.deposit'], 'Deposit opens its sub-screen');
  T.eq([await E(() => document.activeElement.getAttribute('data-id')), await E(() => document.querySelector('#ui [data-id="bank-deposit-input"]').value)], ['bank-deposit-go', '1240'],
    'the amount starts at all your cash; the Deposit button has the focus');
  await t.clickUI('bank-deposit-q-p50');
  await t.step(1);
  T.eq(await txt('bank-deposit-go'), 'Deposit $620', '50 %: $620, on the button');
  T.ok(/-\$620/.test(await txt('bank-deposit-chips')) && /\+\$620/.test(await txt('bank-deposit-chips')), 'the chips preview the move', await txt('bank-deposit-chips'));
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-deposit.png'));
  await A.check(T, t, 'W2-Money bank.deposit', '#ui [data-scene="building"]');
  let s0 = await t.state();
  await t.clickUI('bank-deposit-go');
  await t.step(2);
  let s1 = await t.state();
  T.eq([s1.money.cash, s1.money.bank, s1.clock.min], [s0.money.cash - 620, s0.money.bank + 620, s0.clock.min], 'deposited $620, no time spent');
  await fillAmount('bank-deposit', 100);
  await E(() => SR.ui.focus.focus(document.querySelector('#ui [data-id="bank-deposit-input"]')));
  await t.page.keyboard.press('Enter');
  await t.step(2);
  T.eq((await t.state()).money.bank, s1.money.bank + 100, 'typing 100 and Enter deposits $100');
  await fillAmount('bank-deposit', 7);
  await t.press('back');
  await t.step(2);
  await t.press('back');
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'Back with an amount typed but not deposited asks to discard it');
  await t.clickUI('confirm-discard-yes');
  await t.step(2);
  T.eq(await sub(), [], 'discarded: back on the card');
  await t.clickUI('row-bank.withdrawOpen');
  await t.step(2);
  await fillAmount('bank-withdraw', 50);
  s0 = await t.state();
  await t.clickUI('bank-withdraw-go');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.money.cash - s0.money.cash, s0.money.bank - s1.money.bank], [50, 50], 'withdrew $50');
  await back();

  T.section('Get a loan (asks first), Repay');
  await t.set({ money: { cash: 200 } });
  await t.clickUI('row-bank.loanOpen');
  await t.step(2);
  T.eq(await sub(), ['bank.loan'], 'Get a loan opens the loan page');
  T.ok(/\$1,000/.test(await txt('bank-loan-limit')) && /Fry Cook/.test(await txt('bank-loan-limit')), 'the credit limit of your best job', await txt('bank-loan-limit'));
  T.ok(/15 days/.test(await txt('bank-loan-terms')) && /2\.85 %/.test(await txt('bank-loan-terms')), 'the terms: 15 days at r + 1 %', await txt('bank-loan-terms'));
  T.ok(/repo men/.test(await txt('bank-loan-default')), 'what a default does on this difficulty', await txt('bank-loan-default'));
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-loan.png'));
  await A.check(T, t, 'W2-Money bank.loan', '#ui [data-scene="building"]');
  await fillAmount('bank-borrow', 800);
  await t.clickUI('bank-borrow-go');
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'Borrow asks first');
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-loan-confirm.png'));
  await t.clickUI('confirm-loan-yes');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.money.cash, s1.money.loan], [1000, { amount: 800, daysLeft: 15 }], 'borrowed $800 for 15 days');
  T.ok((await E(() => SR.ui.toast.list().map((x) => x.text || x.key))).some((x) => /Loan approved/.test(String(x))), 'the toast names the terms');
  T.ok(/\$800/.test(await txt('bank-loan-current')) && /15 days/.test(await txt('bank-loan-current')), 'the page now shows the loan and its days', await txt('bank-loan-current'));
  await fillAmount('bank-repay', 300);
  await t.clickUI('bank-repay-go');
  await t.step(2);
  T.eq((await t.state()).money.loan.amount, 500, 'repaid $300');
  await back();
  T.eq([(await row('bank.loanOpen')).enabled, (await row('bank.loanOpen')).reason, (await row('bank.repayOpen')).enabled], [false, 'Repay your loan first', true], 'the card: Get a loan disabled, Repay open');
  await t.clickUI('row-bank.repayOpen');
  await t.step(2);
  T.eq(await E(() => document.activeElement.getAttribute('data-id')), 'bank-repay-go', 'Repay the loan lands on Repay');
  await t.clickUI('bank-repay-q-all');
  await t.step(1);
  await t.clickUI('bank-repay-go');
  await t.step(2);
  T.eq((await t.state()).money.loan, null, 'All repays the rest; the loan is closed');
  await back();

  T.section('the last day: "due tonight", and repayments come out of cash');
  await t.set({ money: { cash: 0, bank: 700, loan: { amount: 500, daysLeft: 1 } } });
  await t.goto('city');
  await t.enter('bank');
  await settle();
  T.ok(/due tonight/.test(await txt('card-greeting')), 'Penny: the loan is due tonight (never "in 1 days")', await txt('card-greeting'));
  await E(() => { SR.ui.card.push('bank.loan', { focus: 'repay' }); });
  await t.step(2);
  T.ok(/Due tonight/.test(await txt('bank-loan-current')) && /\$700 in the bank: Withdraw it first/.test(await txt('bank-repay-none')),
    'no cash on you: the page says to withdraw first (not "Need $1")', [await txt('bank-loan-current'), await txt('bank-repay-none')]);
  await back();
  await t.clickUI('row-bank.withdrawOpen');
  await t.step(2);
  await fillAmount('bank-withdraw', 300);
  await t.clickUI('bank-withdraw-go');
  await t.step(2);
  await back();
  await t.clickUI('row-bank.repayOpen');
  await t.step(2);
  T.ok(/\$400 in the bank: Withdraw first/.test(await txt('bank-repay-bank')) && await E(() => document.querySelector('#ui [data-id="bank-repay-input"]').value) === '300',
    '$300 in cash: Repay offers $300 and points at the $400 still in the bank', await txt('bank-repay-bank'));
  await t.clickUI('bank-repay-go');
  await t.step(2);
  T.eq((await t.state()).money.loan.amount, 200, 'repaid $300 from cash; $200 still owed');
  await t.set({ money: { loan: null } });
  await back();

  T.section('a default, seen on the loan page and the card');
  await t.set({ money: { cash: 0, bank: 0, loan: { amount: 3000, daysLeft: 1 } }, stats: { karma: 0 } });
  const rep = await t.debug('night', 'sleep');
  s1 = await t.state();
  const wake = await E(() => Math.min(SR.state.stats.hpMax, 1 + SR.rules.night.restoreHp(SR.state)));
  T.eq([s1.money.lien > 3000, s1.stats.hp, s1.stats.karma, s1.money.creditFrozenUntil, rep.lines.some((l) => l.key === 'report.loanDefault')], [true, wake, -10, s1.clock.day - 1 + 60, true],
    'Standard: a lien for the debt, HP to 1 (restored from 1 overnight), -10 karma, credit frozen 60 days, the report says so');
  await t.goto('city');
  await t.enter('bank');
  await settle();
  const lr = await row('bank.loanOpen');
  T.eq([lr.enabled, lr.reason], [false, 'Credit frozen until day ' + s1.money.creditFrozenUntil], 'Get a loan: "Credit frozen until day N"');
  T.ok(/lien/i.test(await txt('card-greeting')) || /frozen/i.test(await txt('card-greeting')), 'Penny mentions it', await txt('card-greeting'));
  await E(() => { SR.ui.card.push('bank.loan', {}); });   // push() returns a Promise resolved on pop: do not await it
  await t.step(2);
  T.ok(/\$3,\d{3}/.test(await txt('bank-lien-text')) && /day \d+/.test(await txt('bank-frozen-text')), 'the loan page shows the lien and the freeze', [await txt('bank-lien-text'), await txt('bank-frozen-text')]);
  T.eq(await E(() => {
    const lien = document.querySelector('#ui [data-id="bank-lien"]'), body = document.querySelector('#ui .bcard-body');
    const a = lien.getBoundingClientRect(), b = body.getBoundingClientRect();
    return [!!document.querySelector('#ui [data-id="bank-borrow-go"]'), a.top >= b.top && a.bottom <= b.bottom];
  }), [false, true], 'while frozen: no Borrow form, and the lien stays in view at the top');
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-default.png'));
  await back();

  T.section('the rate board and the cap');
  // Night step 2 steps the rate before it pays interest: the board estimates at the step's expected
  // rate, 3.2 + 0.2 × (1.5 - 3.2) = 2.86 % on $50,000 = $1,430 (B-09 rateStep; the jitter averages 0).
  await t.set({ money: { bank: 50000, rate: 3.2, lien: 0, creditFrozenUntil: 0 } });
  await t.clickUI('row-bank.ratesOpen');
  await t.step(2);
  T.ok(/earns about \$1,430/.test(await txt('bank-rates-tonight')), 'tonight\'s interest: about $1,430, at the rate the night will pay', await txt('bank-rates-tonight'));
  await back();
  await t.set({ money: { bank: 20000000, rate: 3.2, lien: 0, creditFrozenUntil: 0 } });
  await t.clickUI('row-bank.ratesOpen');
  await t.step(2);
  T.eq(await sub(), ['bank.rates'], 'the rate board opens');
  T.eq(await txt('bank-rate-value'), '3.20 % a day', 'today\'s rate');
  T.ok(/\$25,000: the nightly cap/.test(await txt('bank-rates-tonight')), 'a fortune earns the $25,000 cap', await txt('bank-rates-tonight'));
  T.ok(/drift back toward 1\.50 %/.test(await txt('bank-rates-forecast')), 'Penny\'s forecast: the rate drifts back to 1.5 %', await txt('bank-rates-forecast'));
  T.eq(await E(() => document.querySelector('#ui [data-id="bank-rate-chart"]').getAttribute('role')), 'img', 'the 30-day chart is an image with a text alternative');
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-rates.png'));
  await A.check(T, t, 'W2-Money bank.rates', '#ui [data-scene="building"]');
  await back();

  T.section('a fortune: the amount tops out at $9,999,999 (B-09); focus stays in the card');
  await t.set({ money: { cash: 0, bank: 20000000 } });
  await t.clickUI('row-bank.withdrawOpen');
  await t.step(2);
  T.eq([await E(() => document.querySelector('#ui [data-id="bank-withdraw-input"]').value), await E(() => document.querySelector('#ui [data-id="bank-withdraw-go"]').getAttribute('aria-disabled'))],
    ['9999999', null], 'Withdraw with $20,000,000 in the bank starts at $9,999,999, and the button works (not "Enter an amount")');
  await t.clickUI('bank-withdraw-go');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.money.cash, s1.money.bank], [9999999, 20000000 - 9999999], 'withdrew $9,999,999');
  await back();
  await t.clickUI('row-bank.depositOpen');
  await t.step(2);
  await t.clickUI('bank-deposit-go');
  await t.step(2);
  T.eq([(await t.state()).money.cash, await txt('bank-nothing') !== null, await E(() => { const a = document.activeElement; return !!a && a !== document.body && !!a.closest('[data-scene="building"]'); })],
    [0, true, true], 'deposited it all: "Nothing to move", and the focus moved to the breadcrumb, not the page body');
  await back();

  T.section('Real Estate at the bank\'s desk: buy, move in');
  await t.set({ money: { cash: 6000, bank: 5000 } });
  await t.clickUI('row-bank.realestateOpen');
  await t.step(2);
  T.eq(await sub(), ['bank.realestate'], 'the Real Estate desk opens');
  let peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq(peek.map((x) => x.id), ['apt', 'apt2', 'pent', 'mansion', 'castle'], 'five properties in B-08a order');
  T.eq(peek.find((x) => x.id === 'apt').buttons, [], 'the apartment you live in: no buttons');
  T.eq(peek.find((x) => x.id === 'pent').buttons.map((x) => [x.text, x.disabled]), [['Buy for $40,000', true]], 'the penthouse: Buy $40,000, disabled');
  T.ok(/Need \$40,000/.test(await txt('re-reason-pent')), 'with the reason', await txt('re-reason-pent'));
  T.ok(/Required to run for office/.test(await txt('re-castle')), 'the castle notes the election');
  T.eq(await E(() => document.querySelector('#ui [data-id="re-thumb-pent"] canvas') !== null), true, 'each card has its exterior thumbnail');
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-realestate.png'));
  await A.check(T, t, 'W2-Money bank.realestate', '#ui [data-scene="building"]');
  await t.clickUI('re-buy-apt2');
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'Buy asks first');
  await t.clickUI('confirm-re-yes');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.homes.owned, s1.money.cash, s1.money.bank], [['apt', 'apt2'], 0, 1000], 'bought the top floor: $6,000 cash, then $4,000 from the bank');
  peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq(peek.find((x) => x.id === 'apt2').buttons.map((x) => x.text), ['Move in'], 'the top floor offers Move in');
  await t.clickUI('re-moveIn-apt2');
  await t.step(2);
  T.eq((await t.state()).homes.living, 'apt2', 'moved in, from the bank');
  T.eq((await E(() => SR.reg.subscreen['bank.realestate'].peek())).find((x) => x.id === 'apt').buttons.map((x) => x.text), ['Move in'], 'and could move back down');
  await back();

  T.section('Real Estate from a For Sale door (Tour) and from the Pocket');
  await t.set({ money: { cash: 45000, bank: 0 }, homes: { living: 'apt' } });
  await E(() => { const r = SR.world.doors.resolve('home_pent', SR.state); SR.scenes.go('building', { id: r.id, params: r.params }, { transition: false }); });
  await t.step(2);
  await t.clickUI('row-home.tour');
  await t.step(2);
  T.eq(await sub(), ['bank.realestate'], 'Tour opens the bank\'s Real Estate page in the home card');
  peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq([peek[0].id, await txt('re-touring'), await E(() => document.activeElement.getAttribute('data-id'))], ['pent', 'On tour', 're-buy-pent'], 'the penthouse first, "On tour", Buy focused');
  await quiet();
  await t.shot(path.join(SHOTS, 'realestate-tour-pent.png'));
  await t.page.keyboard.press('Enter');
  await t.step(2);
  await t.clickUI('confirm-re-yes');
  await t.step(2);
  T.eq([(await t.state()).homes.owned.indexOf('pent') >= 0, (await t.state()).money.cash], [true, 5000], 'Enter, then Yes: the penthouse is yours');
  await back();
  T.eq((await rows()).map((r) => r.id), ['home.moveIn'], 'back on the door: Owned mode, Move in');
  await t.goto('city');
  await t.set({ money: { cash: 60000, bank: 50000 } });
  await E(() => {
    const root = document.createElement('div');
    root.setAttribute('data-id', 'test-pocket');
    root.style.cssText = 'position:absolute;left:80px;top:110px;width:560px;height:560px;overflow:auto;z-index:40;pointer-events:auto;background:var(--paper-1)';
    document.querySelector('#ui').appendChild(root);
    window.__pocketHost = SR.ui.subhost.create(root, { host: 'pocket', rootLabel: 'ui.back' });
    window.__pocketHost.push('bank.realestate', { homeId: 'mansion' });
  });
  await t.step(2);
  peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq([peek[0].id, peek[0].buttons.map((x) => [x.text, x.disabled])], ['mansion', [['Buy for $100,000', false]]], 'pushed from a Pocket host with homeId: the mansion first, Buy');
  await quiet();
  await t.shot(path.join(SHOTS, 'realestate-pocket.png'));
  await t.clickUI('re-buy-mansion');
  await t.step(2);
  await t.clickUI('confirm-re-yes');
  await t.step(2);
  await t.clickUI('re-moveIn-mansion');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.homes.owned.indexOf('mansion') >= 0, s1.homes.living, s1.money.cash + s1.money.bank], [true, 'mansion', 10000], 'bought and moved in from the Pocket host, no building needed');
  await E(() => { window.__pocketHost.destroy(); const r = document.querySelector('[data-id="test-pocket"]'); r.parentNode.removeChild(r); });

  T.section('what a default does, per difficulty, on the loan page (B-09, B-16)');
  const defaultLine = async (difficulty) => {
    await t.set({ mode: { difficulty: difficulty }, money: { loan: null, lien: 0, creditFrozenUntil: 0 } });
    await t.goto('city');
    await t.enter('bank');
    await settle();
    await t.clickUI('row-bank.loanOpen');
    await t.step(2);
    const line = await txt('bank-loan-default');
    await back();
    return line;
  };
  const lines = { standard: await defaultLine('standard'), relaxed: await defaultLine('relaxed'), hardcore: await defaultLine('hardcore') };
  T.ok(/repo men/.test(lines.standard) && /HP to 1/.test(lines.standard) && /Karma -10/.test(lines.standard) && /60 days/.test(lines.standard), 'Standard: the seizure, the lien, karma -10, HP to 1, frozen 60 days', lines.standard);
  T.ok(/repo men/.test(lines.relaxed) && !/HP/.test(lines.relaxed) && /60 days/.test(lines.relaxed), 'Relaxed: the same without the HP loss', lines.relaxed);
  T.ok(/collection agents/.test(lines.hardcore) && !/repo men/.test(lines.hardcore), 'Hardcore: the collection agents (death)', lines.hardcore);
  await t.set({ mode: { difficulty: 'standard' } });

  T.section('P1 homesPlus: CDs, let and sell at the desk; Properties from home; Sell from an Owned door');
  await t.newGame({ seed: 45 });
  await t.debug('feature', 'homesPlus', true);
  await t.set({ money: { cash: 1240, bank: 28000, rate: 2.2 }, homes: { owned: ['apt', 'apt2', 'pent'], living: 'apt2' }, clock: { day: 3, min: 660 } });
  await t.enter('bank');
  await settle();
  T.ok((await rows()).some((r) => r.id === 'bank.cdsOpen' && r.enabled), 'the CDs row shows with homesPlus');
  await t.clickUI('row-bank.cdsOpen');
  await t.step(2);
  T.eq(await sub(), ['bank.cds'], 'Certificates opens');
  await fillAmount('bank-cd', 5000);
  await t.clickUI('bank-cd-go');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.money.bank, s1.money.cds.length, s1.money.cds[0] && s1.money.cds[0].amount, s1.money.cds[0] && Math.round(s1.money.cds[0].rate * 1000) / 1000],
    [23000, 1, 5000, Math.round(2.2 * CD.mult * 1000) / 1000], 'a $5,000 CD from the bank at r × 1.2');
  T.ok(new RegExp('matures on day ' + (3 + CD.days - 1)).test(await txt('bank-cd-0')), 'the list shows it with its maturity day', await txt('bank-cd-0'));
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-cds-p1.png'));
  await A.check(T, t, 'W2-Money bank.cds (P1)', '#ui [data-scene="building"]');
  await t.clickUI('bank-cd-break-0');
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'Break asks first');
  await t.clickUI('confirm-cd-yes');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.money.bank, s1.money.cds.length], [23000 + 5000 * (1 - CD.penalty), 0], 'broken early: the principal minus 10 %, no interest');
  await back();
  await t.clickUI('row-bank.realestateOpen');
  await t.step(2);
  peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq(peek.find((x) => x.id === 'apt').buttons.map((x) => x.text), ['Move in'], 'the rent-free apartment: Move in only (no dead Let out / Sell for $0)');
  T.eq(peek.find((x) => x.id === 'pent').buttons.map((x) => [x.text, x.disabled]), [['Move in', false], ['Let out', false], ['Sell for $' + SELL.pent.toLocaleString('en-US'), false]], 'the penthouse: Move in, Let out, Sell');
  await t.clickUI('re-let-pent');
  await t.step(2);
  T.eq([(await t.state()).homes.lets.pent !== undefined, (await E(() => SR.reg.subscreen['bank.realestate'].peek())).find((x) => x.id === 'pent').buttons.map((x) => x.text)[1]], [true, 'End the let'], 'let out; the card offers End the let');
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-realestate-p1.png'));
  const bk = (await t.state()).money.bank;
  await t.clickUI('re-sell-pent');
  await t.step(2);
  await t.clickUI('confirm-re-yes');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.homes.owned.indexOf('pent'), s1.money.bank - bk, s1.homes.lets.pent], [-1, SELL.pent, undefined], 'sold at 90 %, into the bank; the let ends with it');
  await back();
  await E(() => { const r = SR.world.doors.resolve('home_apt', SR.state); SR.scenes.go('building', { id: r.id, params: r.params }, { transition: false }); });
  await t.step(2);
  await t.clickUI('row-home.properties');
  await t.step(2);
  peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq([await sub(), peek.map((x) => x.id), await txt('re-touring')], [['bank.realestate'], ['apt', 'apt2', 'pent', 'mansion', 'castle'], null],
    'Properties from the home you live in: the plain list in B-08a order, nothing "On tour"');
  await back();
  await t.set({ money: { cash: 0, bank: 200000 }, homes: { owned: ['apt', 'apt2', 'mansion'] } });
  await E(() => { const r = SR.world.doors.resolve('home_mansion', SR.state); SR.scenes.go('building', { id: r.id, params: r.params }, { transition: false }); });
  await t.step(2);
  await t.clickUI('row-home.sell');
  await t.step(2);
  peek = await E(() => SR.reg.subscreen['bank.realestate'].peek());
  T.eq([peek[0].id, await txt('re-touring'), await E(() => document.activeElement.getAttribute('data-id'))], ['mansion', null, 're-sell-mansion'],
    'Sell from the Owned mansion door: the mansion first, not "On tour", Sell focused');
  await back();
  await t.debug('feature', 'homesPlus', false);

  T.section('the bank robbery through the UI (Auto), a forced win and loss, the weekly limit');
  await t.newGame({ seed: 41 });
  await t.set({ items: { gun: 1, ammo: 30 }, stats: { str: 120, cha: 200 }, clock: { day: 2, min: 1230 } });
  await t.enter('bank');
  await settle();
  T.eq((await row('bank.rob')).enabled, true, 'armed, STR 120, 20:30: Rob the bank is enabled');
  s0 = await t.state();
  await t.clickUI('row-bank.rob');
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'it asks first');
  await t.clickUI('confirm-row-yes');
  await t.step(3);
  T.eq((await t.scenes()).slice(-1)[0], 'minigame', 'the Hold-up opens');
  s1 = await t.state();
  T.eq([s1.clock.min, s1.stats.karma - s0.stats.karma, s1.stats.heat - s0.stats.heat, s0.items.ammo - s1.items.ammo >= 5 && s0.items.ammo - s1.items.ammo <= 9],
    [1440, ROB.karma, ROB.heat, true], 'the start: 24:00, -20 karma, +60 Heat, 5-9 ammo');
  const frame = await E(() => ({ title: document.querySelector('[data-id="mg-title"]').textContent, opts: document.querySelectorAll('[data-id^="mg-duel-opt-"]').length }));
  T.ok(/Hold-up/.test(frame.title) && frame.opts === 3, 'the Hold-up with three options', frame);
  await quiet();
  await t.shot(path.join(SHOTS, 'holdup-bank.png'));
  await t.clickUI('mg-auto');
  await t.step(5);
  const after = await t.state();
  T.ok((await t.scenes()).indexOf('minigame') < 0, 'Auto finishes the round');
  T.ok(after.jail ? after.jail.reason === 'bank' && after.items.gun === 0 : after.money.cash - s1.money.cash >= ROB.loot[0], 'Auto rolled the beats: ' + (after.jail ? 'jail' : 'the loot'));
  await t.newGame({ seed: 42 });
  await t.set({ items: { gun: 1, ammo: 30 }, stats: { str: 120 }, clock: { day: 2, min: 1200 }, money: { cash: 0 } });
  await t.enter('bank');
  await settle();
  await t.mg({ beats: [true, true], wins: 2, losses: 0, picks: ['intimidate', 'intimidate'] });
  await t.clickUI('row-bank.rob');
  await t.step(1);
  await t.clickUI('confirm-row-yes');
  await t.step(3);
  s1 = await t.state();
  T.ok(s1.money.cash >= ROB.loot[0] && s1.money.cash <= ROB.loot[1] && !s1.jail && s1.records.bankRobberies === 1, 'two successes: $3,000-$15,000, no jail', s1.money.cash);
  T.ok((await E(() => SR.ui.toast.list().map((x) => x.text || x.key))).some((x) => /insured/i.test(String(x))), 'Penny reacts');
  await t.set({ clock: { day: 3, min: 600 } });
  await t.goto('city');
  await t.enter('bank');
  await settle();
  T.eq([(await row('bank.rob')).enabled, (await row('bank.rob')).reason], [false, 'Come back next week'], 'the same week: "Come back next week"');
  T.ok(/mask|hands/i.test(await txt('card-greeting')), 'Penny remembers you', await txt('card-greeting'));
  await t.newGame({ seed: 43 });
  await t.set({ items: { gun: 1, ammo: 30 }, stats: { str: 120 }, clock: { day: 2, min: 1200 } });
  await t.enter('bank');
  await settle();
  await t.mg({ beats: [false, false], wins: 0, losses: 2, picks: ['outwit', 'outwit'] });
  await t.clickUI('row-bank.rob');
  await t.step(1);
  await t.clickUI('confirm-row-yes');
  await t.step(3);
  s1 = await t.state();
  T.eq([s1.jail && s1.jail.reason, s1.items.gun, s1.items.ammo, s1.stats.karma], ['bank', 0, 0, ROB.karma], 'two failures: jail, the gun and ammo confiscated, -20 karma');

  T.section('the interior draws from palette keys; the night');
  const draw = await E(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const r = SR.art.interior('bank', {});
    try {
      r.drawStatic(ctx, null); r.drawAnim(ctx, 0.5, null, {});
      r.drawStatic(ctx, SR.state); r.drawAnim(ctx, 3.3, SR.state, { owner: { pose: 'react-shock' }, you: { pose: 'happy' } });
      return null;
    } catch (e) { return e.message; }
  });
  T.eq(draw, null, 'drawStatic / drawAnim with no state and the live state');
  await t.newGame({ seed: 44 });
  await t.set({ clock: { day: 2, min: 1320 } });
  await t.enter('bank');
  await settle();
  await quiet();
  await t.shot(path.join(SHOTS, 'bank-night.png'));
  T.ok(/21:00/.test((await row('bank.rob')).reason || '') || /Gun/i.test((await row('bank.rob')).reason || ''), 'at 22:00 without a gun the robbery is refused', (await row('bank.rob')).reason);
  const warns = (await t.warnings()).filter((x) => /interior|prop|palette|bank|realestate|penny|⟦/i.test(x) && !/no song/.test(x));
  T.eq(warns, [], 'no warnings about props, palette keys or missing bank text');
  T.eq(await t.errors(), [], 'zero console errors');
  await t.close();
}

(async () => {
  rules();
  await game();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
