// tests/node/casino.test.cjs — owner: W1-C. SR.rules.casino (GDD §4.13; BALANCE B-14): slots RTP
// and hit rate computed exactly from the strips; blackjack's house edge over a fixed-seed 4 × 10⁶
// basic-strategy hands, naturals 3:2, the split and double rules, the dealer's soft 17 and peek,
// basic strategy, 60 hands a day, the pit boss for a non-counter and a counter; roulette's every bet
// type and the zeros; the scratch card's EV by enumeration; darts' rings and the Auto sample
// distribution; the round appliers (karma cap, VIP points, winToday), VIP tiers, darts matches.
//   node tests/node/casino.test.cjs
'use strict';
const K = require('./w1c-kit.cjs');

const T = K.L.suite('casino (W1-C)');
const SR = K.boot();
K.fixtures(SR);
const CA = SR.rules.casino;
const BJ = CA.bj;
const TC = SR.tuning.casino;

T.section('slots: the strips and the exact RTP (B-14a)');
{
  const strip = CA.slots.strip();
  const counts = {};
  strip.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
  T.eq([strip.length, counts], [20, { blank: 6, bell: 4, cherry: 4, bar: 3, seven: 2, dollar: 1 }], '20 stops: $ ×1, 7 ×2, BAR ×3, Bell ×4, Cherry ×4, Blank ×6');
  const e = CA.slots.enumerate();
  T.eq([e.returned, e.total, e.hits], [7380, 8000, 1700], 'the pay table returns 7,380 of 8,000 on 1,700 winning ways');
  T.eq([CA.slots.rtp(), CA.slots.hitRate()], [0.9225, 0.2125], 'RTP 92.25 % and hit rate 21.25 %, computed exactly');
  T.eq(e.ways, { dollar3: 1, seven3: 8, bar3: 27, bell3: 64, cherry3: 64, cherry2: 256, cherry1: 1280 }, 'the ways of every line match B-14a');
  const levy = K.state(SR, { election: { decrees: ['casinoLevy'] } });
  T.eq([CA.slots.pays(levy).dollar3, CA.slots.rtp(CA.slots.pays(levy))], [560, 0.905], 'Casino Levy: $$$ ×560, RTP 90.5 %');
  const rc = K.features(SR, { calendar: true });
  const night = K.state(SR, { clock: { day: 5 }, world: { cityEvent: { id: 'casinoNight', day: 5 } } });
  T.eq(K.near(CA.slots.rtp(CA.slots.pays(night)), 0.9545, 1e-12), true, 'Casino Night: Bell ×3 ×24, RTP 95.45 %');
  rc();
  T.eq([CA.slots.line('dollar', 'dollar', 'dollar'), CA.slots.line('cherry', 'cherry', 'cherry'), CA.slots.line('cherry', 'cherry', 'bar'),
    CA.slots.line('cherry', 'bell', 'cherry'), CA.slots.line('bell', 'cherry', 'cherry'), CA.slots.line('blank', 'blank', 'blank')],
  ['dollar3', 'cherry3', 'cherry2', 'cherry1', null, null], 'lines read from reel 1');
  const c = K.counting(SR.rng.create(3));
  const sp = CA.slots.spin(c, 25);
  T.eq([c.draws, sp.win, sp.net], [3, 25 * sp.mult, 25 * sp.mult - 25], 'a pull: 3 draws; pays × bet, stake included');
}

T.section('blackjack: 4 × 10⁶ basic-strategy hands, a fixed seed (B-14b: edge 0.35-0.75 %)');
{
  const rng = SR.rng.create(20260929);
  const sh = BJ.shoe(rng);
  let net = 0, n = 0, naturals = 0, doubles = 0, splits = 0, reshuffles = 0, last = 0;
  const N = 4000000, t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = BJ.deal(sh, 2, rng);
    if (sh.pos < last) reshuffles++;
    if (r.playerBJ) naturals++;
    net += BJ.playBook(r, sh, rng);
    if (r.hands.length > 1) splits++;
    if (r.hands.some((h) => h.doubled)) doubles++;
    last = sh.pos;
    n++;
  }
  const edge = -net / (2 * n);
  T.ok(edge >= 0.0035 && edge <= 0.0075, 'house edge ' + (edge * 100).toFixed(3) + ' % (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  T.ok(K.near(naturals / n, 0.0475, 0.002), 'player naturals ≈ 4.75 % (' + (naturals / n * 100).toFixed(2) + ' %)');
  T.ok(K.near(doubles / n, 0.10, 0.02) && K.near(splits / n, 0.024, 0.01), 'doubles ≈ 10 %, splits ≈ 2.4 % of hands');
  T.ok(K.near(n / reshuffles, 312 * 0.75 / 5.4, 3), 'the shoe is reshuffled at the cut card (' + (n / reshuffles).toFixed(1) + ' hands a shoe)');
}

/** A shoe whose next cards are the given ranks (1 = ace, 10-13 tens), then plenty of twos. */
function stacked(ranks) {
  const cards = ranks.map((r) => r - 1).concat(new Array(200).fill(1));
  return { decks: 6, cards: cards, pos: 0, cut: 10000, running: 0, hole: -1 };
}

T.section('blackjack rules (B-14b)');
{
  // deal order: player, dealer up, player, dealer hole.
  let sh = stacked([1, 9, 13, 7]);
  let r = BJ.deal(sh, 10);
  T.eq([r.playerBJ, r.phase, BJ.settle(r), r.net], [true, 'over', 15, 15], 'a natural pays 3:2 (the round records its net)');
  sh = stacked([1, 1, 13, 12]);
  r = BJ.deal(sh, 10);
  T.eq([r.playerBJ, r.dealerBJ, BJ.settle(r), r.net], [true, true, 0, 0], 'natural against natural: a push');
  sh = stacked([10, 1, 6, 13]);
  r = BJ.deal(sh, 10);
  T.eq([r.dealerBJ, r.phase, BJ.canDouble(r), BJ.settle(r), r.net], [true, 'over', false, -10, -10], 'the dealer peeks under an ace: a natural takes only the bet');
  sh = stacked([10, 9, 6, 1]);
  r = BJ.deal(sh, 10);
  T.eq([r.dealerBJ, r.phase], [false, 'player'], 'no peek under a 9 (the hole ace waits)');
  sh = stacked([5, 6, 6, 10, 10]);
  r = BJ.deal(sh, 10);
  T.ok(BJ.canDouble(r) && BJ.double(r, sh), 'double on any first two cards');
  T.eq([r.hands[0].bet, r.hands[0].cards.length, r.phase], [20, 3, 'dealer'], 'the bet doubles, exactly one card');
  BJ.dealer(r, sh);
  T.eq([BJ.total(r.dealer), BJ.settle(r)], [18, 20], 'dealer 6 + 10 + 2 = 18; 21 wins the doubled bet');
  sh = stacked([8, 6, 8, 10, 8, 3, 10]);
  r = BJ.deal(sh, 10);
  T.ok(BJ.canSplit(r) && BJ.split(r, sh), 'split a pair');
  T.eq([r.hands.length, r.hands[0].cards.map(BJ.rank), BJ.canSplit(r), BJ.canDouble(r)], [2, [8, 8], false, false],
    'split once: no resplit of 8-8, no double after the split');
  BJ.stand(r);
  T.eq([r.active, r.hands[1].cards.map(BJ.rank)], [1, [8, 3]], 'the second hand plays next');
  sh = stacked([1, 9, 1, 9, 13, 12]);
  r = BJ.deal(sh, 10);
  BJ.split(r, sh);
  T.eq([r.hands.map((h) => h.cards.length), r.hands.every((h) => h.done), r.phase], [[2, 2], true, 'dealer'], 'split aces take one card each');
  BJ.dealer(r, sh);
  T.eq([BJ.total(r.hands[0].cards), BJ.total(r.dealer), BJ.settle(r)], [21, 18, 20], 'a 21 after a split is not a natural: 1:1 on each hand');
  sh = stacked([10, 1, 9, 6, 5]);
  r = BJ.deal(sh, 10);
  BJ.stand(r);
  BJ.dealer(r, sh);
  T.eq([BJ.value(r.dealer.slice(0, 2)), r.dealer.length, BJ.settle(r)], [{ total: 17, soft: true }, 2, 10], 'the dealer stands on soft 17');
  sh = stacked([10, 10, 9, 6, 5]);
  r = BJ.deal(sh, 10);
  BJ.stand(r);
  BJ.dealer(r, sh);
  T.eq([r.dealer.length, BJ.total(r.dealer), BJ.settle(r)], [3, 21, -10], 'the dealer hits 16');
  sh = stacked([10, 10, 6, 7, 9]);
  r = BJ.deal(sh, 10);
  BJ.hit(r, sh);
  T.eq([r.hands[0].busted, r.phase], [true, 'dealer'], 'a bust ends the hand');
  BJ.dealer(r, sh);
  T.eq([r.dealer.length, BJ.settle(r)], [2, -10], 'the dealer does not draw against busted hands');
  T.eq(JSON.stringify(TC.bj), JSON.stringify(Object.assign({}, TC.bj, { insurance: false, surrender: false })), 'no insurance, no surrender (not offered)');
}

T.section('basic strategy: 6 decks, S17, no double after split');
{
  const c = (r) => r - 1;
  const b = (ranks, up, extra) => BJ.basic(Object.assign({ cards: ranks.map(c), fromSplit: false }, extra || {}), c(up));
  T.eq([b([6, 5], 1), b([6, 5], 10), b([5, 4], 2), b([5, 4], 3), b([10, 2], 3), b([10, 2], 4), b([10, 6], 7), b([10, 7], 1)],
    ['hit', 'double', 'hit', 'double', 'hit', 'stand', 'hit', 'stand'], 'hard totals (11 v A hit, 11 v 10 double, 9 v 3 double, 12 v 4 stand)');
  T.eq([b([1, 7], 2), b([1, 7], 3), b([1, 7], 9), b([1, 6], 3), b([1, 2], 4), b([1, 2], 5), b([1, 8], 6)],
    ['stand', 'double', 'hit', 'double', 'hit', 'double', 'stand'], 'soft totals (A-7 v 2 stand, v 3 double, v 9 hit; A-8 always stands)');
  T.eq([b([8, 8], 1), b([1, 1], 10), b([4, 4], 5), b([9, 9], 7), b([9, 9], 8), b([2, 2], 3), b([2, 2], 4), b([6, 6], 2), b([10, 13], 6), b([5, 5], 9)],
    ['split', 'split', 'hit', 'stand', 'split', 'hit', 'split', 'hit', 'stand', 'double'], 'pairs without DAS');
  T.eq([b([5, 6], 6, { fromSplit: true }), b([1, 7], 4, { fromSplit: true }), b([8, 8], 10, { fromSplit: true })], ['hit', 'stand', 'hit'],
    'after a split: no double (hit, or stand on soft 18), no resplit');
  T.eq(b([5, 4, 2], 6), 'hit', 'three cards: no double');
}

T.section('hands a day, the round applier and the pit boss (B-14b)');
{
  const s = K.state(SR, { money: { cash: 10000 } });
  let ok = true;
  for (let i = 0; i < 60; i++) ok = ok && K.act(SR, s, 'bjHand', { bet: 10, net: i % 2 ? 10 : -10, trueCount: 0 }).ok;
  const r61 = K.act(SR, s, 'bjHand', { bet: 10, net: 10, trueCount: 0 });
  T.eq([ok, s.daily.bjHands, r61.reason, s.money.cash], [true, 60, 'reason.dailyLimit', 10000], 'at most 60 hands a day');
  T.eq([s.stats.karma, s.daily.gambleKarma], [-10, 10], 'karma -1 a hand (orig), at most -10 a day');
  SR.rules.night.run(s, K.ctx(SR, 1), {});
  T.eq([s.daily.bjHands, K.act(SR, s, 'bjHand', { bet: 10, net: 0 }).ok], [0, true], 'the count resets overnight');
  const sh = BJ.shoe(SR.rng.create(4));
  const rr = BJ.deal(sh, 10, SR.rng.create(4));
  BJ.playBook(rr, sh, SR.rng.create(4));
  const cash = s.money.cash;
  const byRound = K.act(SR, s, 'bjHand', { round: rr, shoe: sh, trueCount: 0 });
  T.eq([byRound.ok, s.money.cash - cash, s.casino.shoe.pos], [true, Math.round(BJ.settle(rr)), sh.pos], 'a played round is settled here and its shoe kept');
  T.eq(K.act(SR, s, 'bjHand', { bet: 4, net: 0 }).reason, 'reason.badBet', 'bets from $5');
  const dbl = K.act(SR, s, 'bjHand', { bet: 10, net: 20, wagered: 20, trueCount: 0 });
  const nat = K.act(SR, s, 'bjHand', { bet: 10, net: 15, trueCount: 0 });
  const odd = K.act(SR, s, 'bjHand', { bet: 10, net: 10, wagered: 90, trueCount: 0 });
  T.eq([dbl.events[0].payload.bet, nat.events[0].payload.bet, odd.events[0].payload.bet], [20, 10, 10],
    'the stake of an engine-played hand: a double or a split stakes its `wagered` (≤ 2 × the bet); a natural stakes the bet');
  T.eq(K.act(SR, s, 'bjHand', { bet: 501, net: 0 }).reason, 'reason.badBet', 'to $500');

  const sus = (seq, extra) => {
    const x = K.state(SR, Object.assign({ stats: { cha: 100 } }, extra || {}));
    return seq.map(([bet, tc]) => BJ.suspicion(x, bet, tc).to);
  };
  T.eq(sus([[20, 3], [20, 3]]), [0, 0], 'the pit boss is P1 (nightlife)');
  const rn = K.features(SR, { nightlife: true, perks: true });
  T.eq(sus([[5, 0], [5, 0], [5, 5], [20, 2], [20, 1], [20, 1], [100, 2.5], [5, 2.5], [5, 0]]), [0, 0, 0, 1, 0.5, 0, 1, 1, 0.5],
    'B-14b: +1 for a bet ≥ $20 at true count ≥ +2; -0.5 for a repeated bet (floor 0); anything else 0');
  T.eq(sus([[20, 2], [25, 2]], { perks: { owned: ['cardSharp'] } }), [0.75, 1.5], 'Card Sharp: ×0.75');
  const b = K.state(SR, { stats: { cha: 100 }, clock: { day: 10 } });
  let backed = null;
  for (let i = 0; i < 8; i++) { const r = BJ.suspicion(b, 20 + (i % 2), 3); if (r.backedOff) backed = { i, r }; }
  T.eq([backed && backed.i, b.casino.suspicion, b.casino.barredUntil, CA.canPlay(b, 'blackjack').reason], [7, 0, 17, 'reason.barred'],
    'at 8 suspicion: backed off for 7 days, suspicion resets');
  b.clock.day = 17;
  T.ok(CA.canPlay(b, 'blackjack').ok, 'welcome back on day 17');
  const hc = K.state(SR, { stats: { cha: 400 } });
  let n = 0;
  while (!BJ.suspicion(hc, 20 + (n % 2), 3).backedOff) n++;
  T.eq(n + 1, 11, 'CHA ≥ 400: backed off at 11');
  // A non-counter and a counter over 10 days of 60 hands each, on one shoe, by the book. Every hand's
  // change is checked against a reference of the B-14b rule.
  const play = (policy) => {
    const x = K.state(SR, { stats: { cha: 100 }, money: { cash: 1e6 } });
    const rng = SR.rng.create(77), shoe = BJ.shoe(rng);
    let hands = 0, backoffs = 0, first = null, rule = true, last = 0, susp = 0, rises = 0;
    for (let day = 1; day <= 10; day++) {
      x.clock.day = day;
      for (let h = 0; h < 60; h++) {
        if (x.clock.day < x.casino.barredUntil) break;
        if (shoe.pos >= shoe.cut) BJ.reshuffle(shoe, rng);
        const tc = BJ.counts(shoe).trueCount, bet = policy(tc);
        const r = BJ.deal(shoe, bet, rng);
        BJ.playBook(r, shoe, rng);
        // The reference: +1 for bet ≥ $20 at TC ≥ +2; else -0.5 for a repeated bet (floor 0); at 8: reset.
        let want = bet >= 20 && tc >= 2 ? susp + 1 : bet === last ? Math.max(0, susp - 0.5) : susp;
        if (want > susp) rises++;
        const backed = want >= 8;
        if (backed) want = 0;
        const sr = BJ.suspicion(x, bet, tc);
        rule = rule && sr.to === want && sr.backedOff === backed && (!backed || x.casino.barredUntil === day + 7);
        susp = want;
        last = bet;
        if (sr.backedOff) { backoffs++; if (first === null) first = hands; }
        hands++;
      }
    }
    return { hands, backoffs, first, rule, rises };
  };
  const flat5 = play(() => 5), flat25 = play(() => 25), counter = play((tc) => (tc >= 2 ? 100 : 5));
  T.ok(flat5.rule && flat25.rule && counter.rule, 'every hand follows B-14b for a non-counter ($5 and $25 flat) and a counter ($5-$100 on the count)');
  T.eq([flat5.rises, flat5.backoffs], [0, 0], 'a flat $5 player is never suspected');
  // B-14b watches every bet ≥ 4 × the minimum at a high count, so a flat $25 player on the same
  // shoe is suspected in the same runs as the counter (reported to the lead as a balance note).
  T.ok(counter.first !== null && counter.rises >= flat25.rises - 1,
    'the counter is backed off (hand ' + counter.first + '; the flat $25 player on the same cards: ' + flat25.first + ')');
  rn();
  const cc = BJ.counts(stacked([2, 3, 10, 5]));
  T.eq(cc.running, 0, 'no cards out: running count 0');
  const shc = stacked([2, 3, 10, 5, 13]);
  const rc = BJ.deal(shc, 5);
  T.eq([BJ.counts(shc).running, rc.holeShown], [1, false], 'Hi-Lo: 2 +1, 3 +1, 10 -1; the hole card is not counted until shown');
  BJ.stand(rc);
  BJ.dealer(rc, shc);
  T.eq(BJ.counts(shc).running, 1 + 1 - 1, 'the hole 5 counts when shown, the dealer\'s 10 too');
}

T.section('roulette: every bet type and the zeros (B-14c)');
{
  const RO = CA.roulette;
  const bets = [
    [{ type: 'straight', n: 17, amount: 10 }, 17, 360], [{ type: 'straight', n: '00', amount: 10 }, 37, 360],
    [{ type: 'split', nums: [17, 20], amount: 10 }, 20, 180], [{ type: 'split', nums: [0, '00'], amount: 10 }, 0, 180],
    [{ type: 'street', n: 16, amount: 10 }, 18, 120], [{ type: 'corner', nums: [17, 18, 20, 21], amount: 10 }, 21, 90],
    [{ type: 'sixLine', n: 13, amount: 10 }, 18, 60], [{ type: 'dozen', n: 2, amount: 10 }, 24, 30], [{ type: 'column', n: 3, amount: 10 }, 36, 30],
    [{ type: 'red', amount: 10 }, 1, 20], [{ type: 'black', amount: 10 }, 2, 20], [{ type: 'odd', amount: 10 }, 35, 20],
    [{ type: 'even', amount: 10 }, 36, 20], [{ type: 'low', amount: 10 }, 18, 20], [{ type: 'high', amount: 10 }, 19, 20],
  ];
  T.eq(bets.map(([bet, pocket]) => RO.settle([bet], pocket).returned), bets.map((b) => b[2]),
    'pays: straight 35, split 17, street 11, corner 8, six line 5, dozen and column 2, even money 1 (stake back)');
  T.eq(bets.map(([bet]) => RO.settle([bet], 5 === RO.covers(bet)[0] ? 6 : 5).returned === 0 || RO.covers(bet).indexOf(5) >= 0), bets.map(() => true),
    'a losing pocket returns nothing');
  const outside = ['dozen', 'column', 'red', 'black', 'odd', 'even', 'low', 'high'].map((type) => ({ type: type, n: 1, amount: 10 }));
  T.eq([0, 37].map((p) => RO.settle(outside, p).net), [-80, -80], '0 and 00 lose every outside bet');
  // The exact edge of every legal bet: each returns 36 units over 38 pockets.
  const L = RO.legal();
  const every = [];
  for (let n = 0; n <= 37; n++) every.push({ type: 'straight', n: n });
  Object.keys(L).forEach((t) => Object.keys(L[t]).forEach((k) => every.push({ type: t, nums: k.split(',').map(Number) })));
  [1, 2, 3].forEach((n) => { every.push({ type: 'dozen', n }); every.push({ type: 'column', n }); });
  ['red', 'black', 'odd', 'even', 'low', 'high'].forEach((t) => every.push({ type: t }));
  const bad = every.filter((b) => {
    let ret = 0;
    for (let p = 0; p < 38; p++) ret += RO.settle([Object.assign({ amount: 1 }, b)], p).returned;
    return ret !== 36;
  });
  T.eq([every.length, bad.length], [38 + 62 + 12 + 22 + 11 + 6 + 6, 0], 'every legal bet returns 36 of 38: house edge 5.26 % for all ' + every.length);
  T.eq([RO.covers({ type: 'split', nums: [17, 19] }), RO.covers({ type: 'corner', nums: [3, 4, 6, 7] }), RO.covers({ type: 'straight', n: 38 })], [null, null, null],
    'illegal bets are refused');
  T.eq([RO.covers({ type: 'straight', n: 2.5 }), RO.covers({ type: 'straight', n: -1 }), RO.covers({ type: 'straight', n: '' }), RO.covers({ type: 'straight', n: null }),
    RO.covers({ type: 'split', nums: [1.5, 2.5] }), RO.covers({ type: 'street', n: 1.2 }), RO.covers({ type: 'straight', n: '7' })], [null, null, null, null, null, null, [7]],
    'a pocket must be a whole number 0-36 or 00 (2.5 is not 2; review probe)');
  const s = K.state(SR, { money: { cash: 5000 } });
  T.eq(K.act(SR, s, 'roulette', { bets: [{ type: 'red', amount: 2001 }] }).reason, 'reason.badBet', 'the table limit: $2,000 a spin (orig)');
  const c = K.counting(SR.rng.create(8));
  const rr = RO.round(s, [{ type: 'red', amount: 100 }, { type: 'straight', n: 7, amount: 50 }], { rng: c });
  T.eq([c.draws, rr.events[0].payload.game, rr.events[0].payload.bet, s.stats.karma], [1, 'roulette', 150, -1], 'a spin: one draw, one gamble event, -1 karma');
  const hist = new Array(38).fill(0), rng = SR.rng.create(2);
  for (let i = 0; i < 38000; i++) hist[RO.spin(rng)]++;
  T.ok(Math.min.apply(null, hist) > 800 && Math.max.apply(null, hist) < 1200, 'the wheel is uniform over 38 pockets');
}

T.section('the scratch card (B-14e): EV $3.00 exactly');
{
  const ev = CA.scratchEV();
  T.eq([ev.ev, ev.rtp, ev.sum], [3, 0.6, 30000], 'by enumeration of 1..10,000: EV $3.00, RTP 60 %');
  T.eq([1, 2, 101, 102, 1101, 1102, 10000].map(CA.scratchPrize), [10000, 100, 100, 10, 10, 0, 0], 'the prize bands');
  const rs = K.features(SR, { shopsPlus: true });
  const s = K.state(SR, { items: { scratch: 2 }, money: { cash: 0 } });
  const r = CA.scratchRound(s, { rng: K.scripted(SR, { int: [50] }), id: 'bag.scratch' });
  T.eq([s.items.scratch, s.money.cash, r.open.minigame, r.open.params.pay, r.open.resolve, r.events[0].payload.net, s.stats.karma],
    [1, 100, 'scratch', 100, 'bag.scratch:resolve', 95, 0], 'scratching: one card used, the prize drawn and paid first, then the reveal; no karma');
  rs();
}

T.section('darts: the rings and the Auto sample (B-14f)');
{
  const D = CA.darts;
  T.eq([[0, 0], [19, 0], [0, 19.01], [40, 0], [40.01, 0], [138, 0], [0, 138.5], [220, 0], [220.1, 0], [300, 300]].map(([x, y]) => D.score(x, y)),
    [50, 50, 35, 35, 15, 15, 5, 5, 0, 0], 'rings: ≤ 19 → 50, ≤ 40 → 35, ≤ 138 → 15, ≤ 220 → 5, beyond → 0');
  const amp = (st, o) => D.amp(K.state(SR, { stats: st }), o);
  T.eq([amp({ int: 0 }), amp({ int: 100 }), amp({ int: 600 }), amp({ int: 999 }), amp({ int: 600 }, { assist: true })], [120, 110, 60, 60, 30],
    'the wobble: 120 × (1 - min(INT, 600) / 1200), Assist ×0.5');
  T.eq(amp({ int: 0, buzz: 2 }), 120, 'Buzz has no effect while nightlife is off');
  const rn = K.features(SR, { nightlife: true });
  T.eq(amp({ int: 0, buzz: 2 }), 120 * 1.8, 'Buzz widens it: ×(1 + 0.4 × Buzz) (P1)');
  rn();
  const p = D.params(K.state(SR, { stats: { int: 100 } }), null, SR.rng.create(1));
  const w0 = D.wobble(0, p), w1 = D.wobble(1 / 0.53, p);
  T.ok(K.near(w0.x, w1.x, 1e-9) && Math.hypot(w0.x, w0.y) <= p.A * Math.SQRT2 + 1e-9, 'the Lissajous wobble: sin(2π·0.53·t + φx), period 1 / 0.53 s on x');
  // Reference (Auto, Buzz 0, 10⁵ games): INT 100: mean 145, P(≥ 160) 0.25; INT 300: mean 166, P(≥ 160) 0.50,
  // P(≥ 230) 0.01; INT 600: mean 187, P(≥ 160) 0.83, P(≥ 230) 0.08, P(≥ 320) ≈ 0.
  [[100, 145, 0.25, 0.00], [300, 166, 0.50, 0.01], [600, 187, 0.83, 0.08]].forEach(([int, mean, p160, p230]) => {
    const s = K.state(SR, { stats: { int, buzz: 0 } });
    const rng = SR.rng.create(int);
    let sum = 0, a = 0, b = 0, c = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const r = D.autoThrows(s, { A: D.amp(s) }, rng);
      sum += r.score;
      if (r.score >= 160) a++;
      if (r.score >= 230) b++;
      if (r.score >= 320) c++;
    }
    T.ok(Math.abs(sum / N - mean) <= 0.03 * mean && K.near(a / N, p160, 0.03) && K.near(b / N, p230, 0.03) && c / N < 0.001,
      'INT ' + int + ': mean ' + (sum / N).toFixed(1) + ' (±3 % of ' + mean + '), P(≥ 160) ' + (a / N).toFixed(3) + ', P(≥ 230) ' + (b / N).toFixed(3));
  });
  const cnt = K.counting(SR.rng.create(1));
  const au = D.autoThrows(K.state(SR), {}, cnt);
  T.eq([au.throws.length, cnt.draws, au.auto], [10, 12, true], 'Auto: 10 throws, one draw each (+2 for the phases)');
}

T.section('darts practice and matches (B-14f)');
{
  const s = K.state(SR, { stats: { cha: 10 } });
  const r = D2(() => CA.darts.practice(s, K.ctx(SR, 1, { id: 'bar.darts' })));
  T.eq([s.stats.cha, r.open.params.mode, typeof r.open.params.phx], [11, 'practice', 'number'], 'practice: +1 CHA the first game each day');
  CA.darts.practice(s, K.ctx(SR, 2));
  T.eq(s.stats.cha, 11, 'only the first');
  T.eq(CA.darts.matchStart(s, 'rookie', 50, K.ctx(SR)).reason, 'reason.featureOff', 'matches are P1 (nightlife)');
  const rn = K.features(SR, { nightlife: true });
  const m = K.state(SR, { money: { cash: 500 } });
  T.eq([CA.darts.matchStart(m, 'rookie', 9, K.ctx(SR)).reason, CA.darts.matchStart(m, 'rookie', 201, K.ctx(SR)).reason, CA.darts.matchStart(m, 'boss', 50, K.ctx(SR)).reason],
    ['reason.badBet', 'reason.badBet', 'reason.badBet'], 'stakes $10-$200 against Rookie, Regular or Shark');
  const st = CA.darts.matchStart(m, 'shark', 100, K.ctx(SR, 1, { id: 'bar.dartsMatch' }));
  T.eq([m.money.cash, st.open.params.target, st.open.params.pays, m.daily.dartsMatches], [400, 320, 3, 1], 'the stake is taken at the start');
  const won = CA.darts.match(m, { score: 320 }, K.ctx(SR));
  T.eq([m.money.cash, won.events[0].payload.net, m.casino.match], [700, 200, null], 'Shark beaten: 3× the stake back');
  CA.darts.matchStart(m, 'rookie', 50, K.ctx(SR));
  const lost = CA.darts.match(m, { score: 159 }, K.ctx(SR));
  T.eq([m.money.cash, lost.events[0].payload.net], [650, -50], 'a lost match keeps the stake');
  CA.darts.matchStart(m, 'rookie', 50, K.ctx(SR));
  T.eq(CA.darts.matchStart(m, 'rookie', 50, K.ctx(SR)).reason, 'reason.dailyLimit', 'three matches a day');
  // Review probes: the resolve pays only the match that was paid for, once.
  const g = K.state(SR, { money: { cash: 500 } });
  T.eq([CA.darts.match(g, { score: 400, tier: 'shark', stake: 200 }, K.ctx(SR)).reason, g.money.cash], ['reason.notNow', 500],
    'no match in progress: a resolve pays nothing, whatever it echoes');
  CA.darts.matchStart(g, 'rookie', 10, K.ctx(SR));
  const echo = CA.darts.match(g, { score: 400, tier: 'shark', stake: 200 }, K.ctx(SR));
  T.eq([g.money.cash, echo.events[0].payload.tier, echo.events[0].payload.net], [510, 'rookie', 10],
    'the tier and stake paid for (Rookie, $10) win over the echoed Shark $200');
  T.eq([CA.darts.match(g, { score: 400 }, K.ctx(SR)).reason, g.money.cash], ['reason.notNow', 510], 'a repeated resolve is refused');
  CA.darts.matchStart(g, 'rookie', 10, K.ctx(SR));
  g.clock.day += 1;
  T.eq(CA.darts.match(g, { score: 400 }, K.ctx(SR)).reason, 'reason.notNow', 'a match from an earlier day is not paid later');
  rn();
}

function D2(fn) { return fn(); }

T.section('rounds on the state: karma, VIP, winToday (B-14, B-29)');
{
  const s = K.state(SR, { money: { cash: 100 } });
  T.eq(K.act(SR, s, 'slots', { bet: 500 }).reason, 'reason.badBet', '$500 slot bets need VIP Silver');
  T.eq(K.act(SR, s, 'slots', { bet: 30 }).reason, 'reason.badBet', 'bets are 5 / 25 / 100 (orig)');
  const pv = SR.rules.act.preview(s, 'testc.slots', { bet: 25 }, K.ctx(SR));
  T.eq([pv.ok, s.money.cash], [true, 100], 'a preview spins nothing');
  const r = K.act(SR, s, 'slots', { bet: 25 }, 3);
  const pay = r.events[0].payload;
  T.eq([r.ok, pay.game, pay.bet, s.money.cash, pay.reels.length, s.stats.karma], [true, 'slots', 25, 100 + pay.net, 3, -1], 'a pull through the pipeline: the gamble event carries the reels');
  const v = K.state(SR, { money: { cash: 1e6 }, clock: { day: 6 } });
  CA.applyRound(v, 'roulette', 1000, 0);
  T.eq(v.casino.points, 0, 'no VIP points while nightlife is off');
  const rn = K.features(SR, { nightlife: true });
  CA.applyRound(v, 'roulette', 1000, 0);
  v.clock.day = 7;
  CA.applyRound(v, 'slots', 100, 0);
  T.eq(v.casino.points, 21, '1 point per $100 wagered, ×2 on Saturday (day 6)');
  T.eq([1, 2, 3, 4, 5, 6, 7, 13].map((d) => { v.clock.day = d; return CA.vip(v).saturday; }), [false, false, false, false, false, true, false, true],
    'Saturday is the B-01 weekday \'sat\' (days 6 and 13)');
  v.casino.points = 500;
  T.eq([CA.vip(v).tier, CA.vip(v).slotBets, CA.vip(v).rouletteLimit, CA.vip(v).drinksLeft], ['silver', [5, 25, 100, 500], 2000, 2], 'Silver at 500 points');
  v.casino.points = 2500;
  T.eq([CA.vip(v).tier, CA.vip(v).rouletteLimit, CA.vip(v).bjBets], ['gold', 10000, [5, 2500]], 'Gold at 2,500: table limits ×5');
  const cha = v.stats.cha;
  CA.vipDrink(v); CA.vipDrink(v);
  T.eq([v.stats.cha - cha, v.stats.buzz, CA.vipDrink(v).reason], [2, 2, 'reason.dailyLimit'], 'two free drinks a day: +1 CHA, +1 Buzz each');
  rn();
  const w = K.state(SR, { money: { cash: 0 } });
  CA.applyRound(w, 'roulette', 100, 4000);
  const big = CA.applyRound(w, 'roulette', 100, 1500);
  T.eq([w.casino.winToday, big.log.map((l) => l.kind)], [5500, ['casinoBig']], 'winToday; casinoBig once the day\'s win passes $5,000');
  const l = K.state(SR, { money: { cash: 0, lien: 1000 } });
  CA.applyRound(l, 'slots', 5, 100);
  T.eq([l.money.cash, l.money.lien], [50, 950], 'winnings are income through the lien');
}

T.done();
