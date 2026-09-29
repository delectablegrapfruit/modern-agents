// js/rules/casino.js — owner: W1-C. SR.rules.casino: the Silver Lining's games and Sticky's darts
// (GDD §4.13; BALANCE B-14; ARCHITECTURE §6.5, §10).
//   slots      "Paper Jackpot": three 20-stop reels, the published pay table, RTP 92.25 % computed
//              exactly from the strips (B-14a); Casino Levy and Casino Night change one line.
//   bj         blackjack (B-14b): 6 decks, cut card at 75 %, dealer stands on soft 17 and peeks, 3:2
//              naturals, double any first two (not after a split), split once (aces take one card),
//              no insurance or surrender; the Hi-Lo counts, basic strategy, the pit boss (P1).
//   roulette   American, 38 pockets (00 is pocket 37), every bet type; 0 and 00 lose outside bets.
//   scratch    one draw of 1..10,000 (B-14e, P1 `shopsPlus`); EV $3.00 exactly.
//   darts      the ring radii, the Lissajous wobble and the Auto sample (B-14f).
//   vip        comp points and tiers (B-14d, P1 `nightlife`).
// The game functions are pure over their own objects (a shoe, a round, bets) and draw only from the
// stream they are given (host.rng in the engines, ctx.rng in the named fns). The appliers change
// the state, one round at a time (the engines call the round actions, so "the rules already applied
// each round" when the minigame returns { net }): the named fns 'casino.slotsSpin', 'casino.bjHand',
// 'casino.rouletteSpin', 'casino.scratch', 'casino.dartsPractice', 'casino.dartsMatchStart',
// 'casino.dartsMatch', 'casino.vipDrink', 'casino.settle' and the condition 'casino.canPlay'.
// Every gamble round: -1 karma (orig) up to -10 a day, VIP points (P1), casino.winToday (the SLC
// quirk and the casinoBig log), the `gamble` rule event { game, bet, net } (plus the round's facts).
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  // Built-ins held locally: in Node's vm contexts (the tests and the balance simulator) every global
  // lookup costs ~150 ns, and these functions run millions of times there.
  var Mth = Math, isArray = Array.isArray;

  var SYMBOLS = ['dollar', 'seven', 'bar', 'bell', 'cherry', 'blank'];
  var LINES = ['dollar3', 'seven3', 'bar3', 'bell3', 'cherry3', 'cherry2', 'cherry1'];
  var DOUBLE_ZERO = 37;          // roulette: the 00 pocket

  function C() { return SR.tuning.casino; }
  function BJ() { return SR.tuning.casino.bj; }
  function feat(flag) { return !!SR.features[flag]; }
  function perk(s, id) { return !!(SR.rules.perks && SR.rules.perks.has(s, id)); }
  function rng0(ctx) { return (ctx && ctx.rng) || SR.rng.rules; }
  function yes() { return { ok: true, reason: null, vars: null }; }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function partial() { return SR.rules.effects.partial(); }
  function money(n) { return SR.text.money(n); }
  function decree(s, id) { return ((s.election && s.election.decrees) || []).indexOf(id) >= 0; }
  /** @returns {boolean} today is a Saturday (B-14d: VIP points ×2), by the B-01 weekday names. */
  function saturday(s) { return SR.rules.time.weekday(s) === SR.rules.time.dayIndex('sat'); }

  // ============================================================================================
  // Slots (B-14a)

  var stripCache = null;
  /**
   * The reel strip: the B-14a stop counts spread evenly around 20 stops (every reel uses it; the
   * odds depend only on the counts).
   * @returns {string[]} 20 symbol names
   */
  function strip() {
    var st = C().slots.stops, key = JSON.stringify(st);
    if (stripCache && stripCache.key === key) return stripCache.strip;
    var slots = [];
    SYMBOLS.forEach(function (sym, si) {
      for (var j = 0; j < st[sym]; j++) slots.push({ sym: sym, at: (j + 0.5) / st[sym] + si * 1e-3 });
    });
    slots.sort(function (a, b) { return a.at - b.at; });
    stripCache = { key: key, strip: slots.map(function (x) { return x.sym; }) };
    return stripCache.strip;
  }

  /**
   * The pay table in force (× bet, stake included): B-14a, with Casino Levy ($$$ ×560, P1 decree)
   * and Casino Night (Bell ×3 ×24, P1 `calendar` city event).
   * @returns {object} { dollar3, seven3, bar3, bell3, cherry3, cherry2, cherry1 }
   */
  function pays(s) {
    var S = C().slots, p = SR.util.clone(S.pays);
    if (s && decree(s, 'casinoLevy')) Object.assign(p, S.levy);
    if (s && feat('calendar') && SR.rules.calendar && typeof SR.rules.calendar.cityEvent === 'function' &&
        SR.rules.calendar.cityEvent(s) === 'casinoNight') Object.assign(p, S.casinoNight);
    return p;
  }

  /** @returns {string|null} the winning line of three symbols (B-14a), or null. */
  function line(a, b, c) {
    if (a === b && b === c && a !== 'blank') return a + '3';
    if (a === 'cherry' && b === 'cherry') return 'cherry2';
    if (a === 'cherry') return 'cherry1';
    return null;
  }

  /**
   * One pull (3 draws: the reels' stops).
   * @param {object} rng a stream
   * @param {number} bet
   * @param {object=} table the pay table (default B-14a)
   * @returns {{stops: number[], reels: string[], line: (string|null), mult: number, win: number, net: number}}
   */
  function spin(rng, bet, table) {
    var S = strip(), P = table || C().slots.pays, n = S.length;
    var stops = [rng.int(0, n - 1), rng.int(0, n - 1), rng.int(0, n - 1)];
    var reels = stops.map(function (i) { return S[i]; });
    var l = line(reels[0], reels[1], reels[2]);
    var mult = l ? P[l] : 0;
    return { stops: stops, reels: reels, line: l, mult: mult, win: bet * mult, net: bet * mult - bet };
  }

  /** Enumerates the 20³ outcomes: the exact return and hit rate of a pay table. */
  function enumerate(table) {
    var S = strip(), P = table || C().slots.pays, n = S.length, ret = 0, hits = 0, ways = {};
    LINES.forEach(function (l) { ways[l] = 0; });
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) for (var k = 0; k < n; k++) {
      var l = line(S[i], S[j], S[k]);
      if (!l) continue;
      hits++;
      ways[l]++;
      ret += P[l];
    }
    var total = n * n * n;
    return { rtp: ret / total, hitRate: hits / total, ways: ways, total: total, returned: ret, hits: hits };
  }

  // ============================================================================================
  // Blackjack (B-14b). A card is 0..51: rank = card % 13 + 1 (1 ace, 11-13 faces); value min(rank, 10).

  function rank(c) { return c % 13 + 1; }
  function cval(c) { var r = c % 13 + 1; return r > 10 ? 10 : r; }
  /** @returns {number} the Hi-Lo tag: 2-6 +1, 7-9 0, tens and aces -1. */
  function hilo(c) { var v = cval(c); return v >= 2 && v <= 6 ? 1 : v === 1 || v === 10 ? -1 : 0; }

  /**
   * rng.int(0, n - 1) with the same single draw and the same value (CONTRACT §6: lo + floor(next /
   * 2^32 × (hi - lo + 1))), taken from next() directly: the shuffle runs 311 of them per shoe.
   */
  function below(rng, n) {
    return typeof rng.next === 'function' ? Mth.floor((rng.next() / 4294967296) * n) : rng.int(0, n - 1);
  }

  function shuffleInPlace(a, rng) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = below(rng, i + 1), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  }

  /**
   * A new shuffled shoe (B-14b: 6 decks; the cut card at 75 %). One draw per card but one.
   * @returns {{decks: number, cards: number[], pos: number, cut: number, running: number, hole: number}}
   */
  function newShoe(rng, decks) {
    decks = decks || BJ().decks;
    var cards = new Array(decks * 52);
    for (var i = 0; i < cards.length; i++) cards[i] = i % 52;
    shuffleInPlace(cards, rng || SR.rng.rules);
    return { decks: decks, cards: cards, pos: 0, cut: Mth.floor(cards.length * BJ().penetration), running: 0, hole: -1 };
  }

  /** Reshuffles a shoe in place (the running count starts again). */
  function reshuffle(sh, rng) {
    shuffleInPlace(sh.cards, rng || SR.rng.rules);
    sh.pos = 0;
    sh.running = 0;
    sh.hole = -1;
  }

  /** Draws a card; a hidden card (the dealer's hole card) is counted when revealed. */
  function draw(sh, rng, hidden) {
    if (sh.pos >= sh.cards.length) reshuffle(sh, rng);
    var c = sh.cards[sh.pos++];
    if (!hidden) sh.running += hilo(c);
    return c;
  }

  /** @returns {{total: number, soft: boolean}} a hand's best total (an ace counts 11 while it fits). */
  function value(cards) {
    var t = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) { var v = cval(cards[i]); t += v; if (v === 1) aces++; }
    var soft = aces > 0 && t + 10 <= 21;
    return { total: soft ? t + 10 : t, soft: soft };
  }

  function total(cards) { return value(cards).total; }

  /**
   * The Hi-Lo counts of a shoe: running, decks left, true count (running / decks left).
   * @returns {{running: number, decksLeft: number, trueCount: number, cardsLeft: number}}
   */
  function counts(sh) {
    var left = sh.cards.length - sh.pos, decksLeft = left / 52;
    return { running: sh.running, decksLeft: decksLeft, trueCount: decksLeft > 0 ? sh.running / decksLeft : 0, cardsLeft: left };
  }

  function newHand(cards, bet, fromSplit) {
    return { cards: cards, bet: bet, doubled: false, fromSplit: !!fromSplit, splitAces: false, done: false, busted: false };
  }

  /**
   * Deals a round (reshuffles first when the cut card has come out): player, dealer up, player,
   * dealer hole. The dealer peeks under an ace or a ten; a natural on either side ends the round.
   * @param {object} sh the shoe (mutated)
   * @param {number} bet
   * @returns {object} the round: { bet, hands: [...], active, dealer: [up, hole], up, phase:
   *   'player' | 'dealer' | 'over', playerBJ, dealerBJ, holeShown }
   */
  function deal(sh, bet, rng) {
    if (sh.pos >= sh.cut) reshuffle(sh, rng);
    var p1 = draw(sh, rng), up = draw(sh, rng), p2 = draw(sh, rng), hole = draw(sh, rng, true);
    sh.hole = hole;
    var r = { bet: bet, hands: [newHand([p1, p2], bet, false)], active: 0, dealer: [up, hole], up: up,
      phase: 'player', playerBJ: false, dealerBJ: false, holeShown: false, net: null };
    r.playerBJ = total(r.hands[0].cards) === 21;
    var uv = cval(up);
    if (uv === 1 || uv === 10) r.dealerBJ = total(r.dealer) === 21;
    if (r.dealerBJ || r.playerBJ) {
      reveal(r, sh);
      r.hands[0].done = true;
      r.phase = 'over';
    }
    return r;
  }

  function reveal(r, sh) {
    if (r.holeShown) return;
    r.holeShown = true;
    sh.running += hilo(r.dealer[1]);
    sh.hole = -1;
  }

  function hand(r) { return r.hands[r.active]; }

  /** Moves to the next unfinished hand, or to the dealer's turn. */
  function advance(r) {
    while (r.active < r.hands.length && r.hands[r.active].done) r.active++;
    if (r.active >= r.hands.length) { r.active = r.hands.length - 1; r.phase = 'dealer'; }
  }

  /** @returns {boolean} the active hand may double: two cards, not after a split (B-14b). */
  function canDouble(r) {
    var h = hand(r);
    return r.phase === 'player' && h.cards.length === 2 && !(h.fromSplit && !BJ().doubleAfterSplit);
  }

  /** @returns {boolean} the active hand may split: a pair of equal value, once per round (B-14b). */
  function canSplit(r) {
    var h = hand(r);
    return r.phase === 'player' && h.cards.length === 2 && r.hands.length <= BJ().splits && cval(h.cards[0]) === cval(h.cards[1]);
  }

  /** Hit: one card; a bust or 21 finishes the hand. @returns {boolean} */
  function hit(r, sh, rng) {
    if (r.phase !== 'player') return false;
    var h = hand(r);
    h.cards.push(draw(sh, rng));
    var t = total(h.cards);
    if (t > 21) { h.busted = true; h.done = true; } else if (t === 21) h.done = true;
    advance(r);
    return true;
  }

  /** Stand. @returns {boolean} */
  function stand(r) {
    if (r.phase !== 'player') return false;
    hand(r).done = true;
    advance(r);
    return true;
  }

  /** Double: the bet ×2, exactly one card. @returns {boolean} */
  function double(r, sh, rng) {
    if (!canDouble(r)) return false;
    var h = hand(r);
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(sh, rng));
    if (total(h.cards) > 21) h.busted = true;
    h.done = true;
    advance(r);
    return true;
  }

  /** Split once: two hands of one card each plus a new card each; split aces take one card only. */
  function split(r, sh, rng) {
    if (!canSplit(r)) return false;
    var h = hand(r), aces = cval(h.cards[0]) === 1;
    var a = newHand([h.cards[0], draw(sh, rng)], h.bet, true), b = newHand([h.cards[1], draw(sh, rng)], h.bet, true);
    [a, b].forEach(function (x) {
      if (aces && BJ().splitAcesOneCard) { x.splitAces = true; x.done = true; }
      else if (total(x.cards) === 21) x.done = true;
    });
    r.hands.splice(r.active, 1, a, b);
    advance(r);
    return true;
  }

  /** The dealer's turn: the hole card is shown; draws to 17, stands on soft 17 (B-14b). */
  function dealer(r, sh, rng) {
    if (r.phase === 'over') return r;
    reveal(r, sh);
    r.phase = 'dealer';
    var live = r.hands.some(function (h) { return !h.busted; });
    if (live) {
      for (;;) {
        var v = value(r.dealer);
        if (v.total > 17 || (v.total === 17 && (!v.soft || BJ().standSoft17))) break;
        r.dealer.push(draw(sh, rng));
      }
    }
    r.phase = 'over';
    return r;
  }

  /**
   * The round's net (exact; a $5 natural pays 7.5): a dealer natural takes the bet (a natural
   * pushes); a player natural pays 3:2; a bust loses; a dealer bust pays every live hand; else the
   * higher total wins.
   * @returns {number}
   */
  function settle(r) {
    var nat = BJ().natural;
    if (r.dealerBJ) return (r.net = r.playerBJ ? 0 : -r.bet);
    if (r.playerBJ) return (r.net = nat * r.bet);
    var d = total(r.dealer), net = 0;
    r.hands.forEach(function (h) {
      var t = total(h.cards);
      if (h.busted || t > 21) net -= h.bet;
      else if (d > 21 || t > d) net += h.bet;
      else if (t < d) net -= h.bet;
    });
    r.net = net;
    return net;
  }

  /** @returns {number} the dealer up card's value 2..11 (ace 11) from a card or a rank. */
  function upValue(up) {
    var v = typeof up === 'number' && up >= 0 && up < 52 ? cval(up) : up;
    return v === 1 ? 11 : Mth.min(10, v);
  }

  // Basic strategy, 6 decks, S17, no double after split (B-14b). Rows: dealer 2..11 (11 = ace).
  function inRange(u, a, b) { return u >= a && u <= b; }
  function hardPlay(t, u) {
    if (t <= 8) return 'hit';
    if (t === 9) return inRange(u, 3, 6) ? 'double' : 'hit';
    if (t === 10) return inRange(u, 2, 9) ? 'double' : 'hit';
    if (t === 11) return inRange(u, 2, 10) ? 'double' : 'hit';
    if (t === 12) return inRange(u, 4, 6) ? 'stand' : 'hit';
    if (t <= 16) return inRange(u, 2, 6) ? 'stand' : 'hit';
    return 'stand';
  }
  function softPlay(t, u) {
    if (t <= 14) return inRange(u, 5, 6) ? 'double' : 'hit';
    if (t <= 16) return inRange(u, 4, 6) ? 'double' : 'hit';
    if (t === 17) return inRange(u, 3, 6) ? 'double' : 'hit';
    if (t === 18) return inRange(u, 3, 6) ? 'doubleStand' : inRange(u, 9, 11) ? 'hit' : 'stand';
    return 'stand';
  }
  function pairPlay(v, u) {
    switch (v) {
      case 1: case 8: return true;
      case 10: case 5: case 4: return false;
      case 9: return inRange(u, 2, 6) || u === 8 || u === 9;
      case 7: return inRange(u, 2, 7);
      case 6: return inRange(u, 3, 6);
      default: return inRange(u, 4, 7);   // 2s and 3s
    }
  }

  /**
   * Basic strategy for these rules (6 decks, S17, no double after split, split once).
   * @param {object|number[]} h a hand ({ cards, fromSplit }) or its cards
   * @param {number} up the dealer's up card (0..51) or its value (2..11 / 1 = ace)
   * @param {object=} r the round (whether a split is still allowed)
   * @returns {string} 'hit' | 'stand' | 'double' | 'split'
   */
  function basic(h, up, r) {
    var cards = isArray(h) ? h : h.cards, u = upValue(up);
    var two = cards.length === 2, fromSplit = !isArray(h) && h.fromSplit;
    var mayDouble = two && !(fromSplit && !BJ().doubleAfterSplit);
    var maySplit = two && cval(cards[0]) === cval(cards[1]) && (!r || r.hands.length <= BJ().splits) && !fromSplit;
    if (maySplit && pairPlay(cval(cards[0]), u)) return 'split';
    var v = value(cards), a = v.soft ? softPlay(v.total, u) : hardPlay(v.total, u);
    if (a === 'doubleStand') return mayDouble ? 'double' : 'stand';
    if (a === 'double' && !mayDouble) return 'hit';
    return a;
  }

  /**
   * Plays a dealt round "by the book" (the Auto policy: basic strategy), then the dealer.
   * @returns {number} the net (exact)
   */
  function playBook(r, sh, rng) {
    var guard = 0;
    while (r.phase === 'player' && guard++ < 64) {
      var a = basic(hand(r), r.up, r);
      if (a === 'split') split(r, sh, rng);
      else if (a === 'double') double(r, sh, rng);
      else if (a === 'hit') hit(r, sh, rng);
      else stand(r);
    }
    dealer(r, sh, rng);
    return settle(r);
  }

  /** @returns {number} the total staked on a round (doubles and splits included). */
  function wagered(r) { return r.hands.reduce(function (a, h) { return a + h.bet; }, 0); }

  /** @returns {boolean} a shoe object has the expected shape (a saved or engine-returned shoe). */
  function validShoe(sh) {
    return !!(sh && isArray(sh.cards) && sh.cards.length >= 52 && typeof sh.pos === 'number' &&
      sh.pos >= 0 && sh.pos <= sh.cards.length && typeof sh.cut === 'number' && typeof sh.running === 'number');
  }

  /** @returns {object} the state's shoe (a copy), or a fresh one from rng. */
  function shoeOf(s, rng) {
    var sh = s.casino.shoe;
    return validShoe(sh) ? SR.util.clone(sh) : newShoe(rng || SR.rng.rules);
  }

  /**
   * The pit boss (P1 `nightlife`; B-14b): a hand whose bet ≥ 4 × the table minimum while the true
   * count ≥ +2 adds +1 suspicion (×0.75 with Card Sharp); any other hand that repeats the previous
   * bet takes 0.5 off (floor 0). At 8 (11 with CHA ≥ 400) you are backed off for 7 days and it resets.
   * @param {number} bet this hand's bet
   * @param {number} trueCount the true count when the bet was placed
   * @returns {{from: number, to: number, backedOff: boolean, barredUntil: number}}
   */
  function suspicion(s, bet, trueCount) {
    var c = s.casino, S = BJ().suspicion, K = BJ().backoff;
    var from = c.suspicion || 0, to = from, backed = false;
    if (feat('nightlife')) {
      if (bet >= S.spreadBetMult * BJ().minimum && trueCount >= S.spreadTrueCount) to += S.spread * (perk(s, 'cardSharp') ? S.cardSharp : 1);
      else if (bet === c.lastBet) to = Mth.max(0, to + S.flat);
      to = Mth.round(to * 1000) / 1000;
      var limit = s.stats.cha >= K.cha ? K.atHighCha : K.at;
      if (to >= limit) {
        c.barredUntil = s.clock.day + K.days;
        to = 0;
        backed = true;
      }
      c.suspicion = to;
    }
    c.lastBet = bet;
    return { from: from, to: to, backedOff: backed, barredUntil: c.barredUntil || 0 };
  }

  // ============================================================================================
  // Roulette (B-14c)

  var OUTSIDE = ['dozen', 'column', 'red', 'black', 'odd', 'even', 'low', 'high'];
  var legalCache = null;

  /** The legal inside combinations of the American layout, as sorted keys per bet type. */
  function legal() {
    if (legalCache) return legalCache;
    var L = { split: {}, street: {}, corner: {}, sixLine: {} };
    function add(t, nums) { L[t][nums.slice().sort(function (a, b) { return a - b; }).join(',')] = true; }
    for (var k = 1; k <= 36; k++) {
      var col = (k - 1) % 3;
      if (col < 2) add('split', [k, k + 1]);
      if (k <= 33) add('split', [k, k + 3]);
      if (col < 2 && k <= 32) add('corner', [k, k + 1, k + 3, k + 4]);
      if (col === 0) {
        add('street', [k, k + 1, k + 2]);
        if (k <= 31) add('sixLine', [k, k + 1, k + 2, k + 3, k + 4, k + 5]);
      }
    }
    [[0, DOUBLE_ZERO], [0, 1], [0, 2], [DOUBLE_ZERO, 2], [DOUBLE_ZERO, 3]].forEach(function (p) { add('split', p); });
    legalCache = L;
    return L;
  }

  /** @returns {number} a pocket from 0..36, '00' or 37; NaN for anything else (never a legal bet). */
  function pocketOf(v) {
    if (v === '00') return DOUBLE_ZERO;
    var n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
    return Mth.floor(n) === n && n >= 0 && n <= DOUBLE_ZERO ? n : NaN;
  }

  /** @returns {boolean} the pocket is red (B-14c's red set). */
  function isRed(p) { return p >= 1 && p <= 36 && C().roulette.red.indexOf(p) >= 0; }

  /**
   * The pockets a bet covers, or null when the bet is not legal.
   * @param {{type: string, n: (number|string), nums: Array}} bet
   * @returns {number[]|null}
   */
  function covers(bet) {
    var t = bet && bet.type, out = [], p;
    if (t === 'straight') {
      p = pocketOf(bet.n !== undefined ? bet.n : bet.nums && bet.nums[0]);
      return (p >= 0 && p <= 36) || p === DOUBLE_ZERO ? [p] : null;
    }
    if (t === 'split' || t === 'street' || t === 'corner' || t === 'sixLine') {
      var nums = isArray(bet.nums) ? bet.nums.map(pocketOf) : null;
      if (!nums && (t === 'street' || t === 'sixLine')) {
        var first = pocketOf(bet.n);
        nums = [];
        for (var i = 0; i < (t === 'street' ? 3 : 6); i++) nums.push(first + i);
      }
      if (!nums) return null;
      var key = nums.slice().sort(function (a, b) { return a - b; }).join(',');
      return legal()[t][key] ? nums : null;
    }
    for (p = 1; p <= 36; p++) {
      var ok = false;
      switch (t) {
        case 'dozen': ok = Mth.ceil(p / 12) === bet.n; break;
        case 'column': ok = ((p - 1) % 3) + 1 === bet.n; break;
        case 'red': ok = isRed(p); break;
        case 'black': ok = !isRed(p); break;
        case 'odd': ok = p % 2 === 1; break;
        case 'even': ok = p % 2 === 0; break;
        case 'low': ok = p <= 18; break;
        case 'high': ok = p >= 19; break;
        default: return null;
      }
      if (ok) out.push(p);
    }
    return out.length ? out : null;
  }

  /** @returns {number} one spin: a pocket 0..37 (37 = 00); one draw. */
  function rouletteSpin(rng) { return rng.int(0, C().roulette.pockets - 1); }

  /**
   * Settles bets on a pocket (B-14c pays x:1; 0 and 00 lose every outside bet).
   * @param {object[]} bets [{ type, n?, nums?, amount }]
   * @param {number} pocket 0..37
   * @returns {{net: number, wagered: number, returned: number, wins: number[], invalid: number[]}}
   */
  function rouletteSettle(bets, pocket) {
    var P = C().roulette.pays, out = { net: 0, wagered: 0, returned: 0, wins: [], invalid: [] };
    (bets || []).forEach(function (b, i) {
      var amt = Mth.max(0, Mth.floor(Number(b.amount) || 0)), cov = covers(b);
      if (!cov || !amt) { out.invalid.push(i); return; }
      out.wagered += amt;
      if (cov.indexOf(pocket) >= 0) {
        out.returned += amt * (P[b.type] + 1);
        out.wins.push(i);
      }
    });
    out.net = out.returned - out.wagered;
    return out;
  }

  // ============================================================================================
  // Scratch card (B-14e, P1 `shopsPlus`)

  /** @returns {number} the prize of a roll 1..10,000. */
  function scratchPrize(roll) {
    var list = C().scratch.prizes;
    for (var i = 0; i < list.length; i++) if (roll >= list[i].from && roll <= list[i].to) return list[i].pay;
    return 0;
  }

  /** One card: one draw of 1..10,000. @returns {{roll: number, pay: number, tier: number}} */
  function scratch(rng) {
    var R = C().scratch.roll, roll = (rng || SR.rng.rules).int(R[0], R[1]), pay = scratchPrize(roll);
    var tier = 0;
    C().scratch.prizes.forEach(function (p, i) { if (pay === p.pay && pay > 0) tier = C().scratch.prizes.length - i; });
    return { roll: roll, pay: pay, tier: tier };
  }

  /** @returns {{ev: number, rtp: number}} the exact EV by enumerating every roll (B-14e: $3.00). */
  function scratchEV() {
    var R = C().scratch.roll, sum = 0;
    for (var r = R[0]; r <= R[1]; r++) sum += scratchPrize(r);
    var ev = sum / (R[1] - R[0] + 1);
    return { ev: ev, rtp: ev / C().scratch.price, sum: sum };
  }

  // ============================================================================================
  // Darts (B-14f; units are board pixels)

  /** @returns {number} the points of a dart landing at (dx, dy) from the centre (the ring radii). */
  function dartsScore(dx, dy) {
    var r = Mth.sqrt(dx * dx + dy * dy), rings = C().darts.rings;
    for (var i = 0; i < rings.length; i++) if (r <= rings[i].r) return rings[i].pts;
    return 0;
  }

  /**
   * The wobble's amplitude: 120 × (1 + 0.4 × Buzz) × (1 - min(INT, 600) / 1200) px; Buzz only with
   * `nightlife` (P1); Assist ×0.5.
   * @param {{assist: boolean}=} opts
   * @returns {number}
   */
  function dartsAmp(s, opts) {
    var W = C().darts.wobble, buzz = feat('nightlife') ? (s.stats.buzz || 0) : 0;
    var a = W.A * (1 + W.perBuzz * buzz) * (1 - Mth.min(s.stats.int, W.intCap) / W.intDiv);
    return opts && opts.assist ? a * W.assist : a;
  }

  /**
   * A game's wobble params: the amplitude and the two phases (2 draws from the rules stream).
   * @returns {{A: number, fx: number, fy: number, phx: number, phy: number, darts: number}}
   */
  function dartsParams(s, opts, rng) {
    rng = rng || SR.rng.rules;
    var W = C().darts.wobble, TAU = 2 * Mth.PI;
    var p = { A: dartsAmp(s, opts), fx: W.fx, fy: W.fy, phx: rng.float(0, TAU), phy: rng.float(0, TAU), darts: C().darts.perGame };
    return Object.assign(p, opts && opts.target ? { target: opts.target } : {});
  }

  /** @returns {{x: number, y: number}} the crosshair's offset at t seconds of play (the Lissajous wobble). */
  function wobble(t, p) {
    var TAU = 2 * Mth.PI;
    return { x: p.A * Mth.sin(TAU * p.fx * t + p.phx), y: p.A * Mth.sin(TAU * p.fy * t + p.phy) };
  }

  /**
   * Auto (B-14f): 10 throws aimed at the centre, each released at a uniformly random time of the
   * wobble (one draw each; the phases are drawn first when params lack them). A real sample.
   * @returns {{score: number, throws: number[], auto: boolean}}
   */
  function autoThrows(s, params, rng) {
    rng = rng || SR.rng.rules;
    var p = params && typeof params.phx === 'number' ? params : Object.assign({}, params || {}, dartsParams(s, params, rng));
    if (typeof p.A !== 'number') p.A = dartsAmp(s, params);
    // Each throw is released at a uniform time in a window far longer than the wobble's periods
    // (1 / 0.53 s and 1 / 0.71 s), so the two phases are effectively independent (B-14f `auto`).
    var n = p.darts || C().darts.perGame, win = C().darts.autoWindowSec, throws = [], score = 0;
    for (var i = 0; i < n; i++) {
      var w = wobble(rng.float(0, win), p), pts = dartsScore(w.x, w.y);
      throws.push(pts);
      score += pts;
    }
    return { score: score, throws: throws, auto: true };
  }

  // ============================================================================================
  // VIP (B-14d, P1 `nightlife`) and the limits

  /**
   * The VIP desk: points, tier ('none' | 'silver' | 'gold'), the next tier, today's drinks and the
   * limits it unlocks.
   * @returns {object}
   */
  function vip(s) {
    var V = C().vip, on = feat('nightlife'), pts = on ? (s.casino.points || 0) : 0;
    var tier = !on ? 'none' : pts >= V.gold.points ? 'gold' : pts >= V.silver.points ? 'silver' : 'none';
    var next = tier === 'none' ? { tier: 'silver', points: V.silver.points } : tier === 'silver' ? { tier: 'gold', points: V.gold.points } : null;
    var gold = tier === 'gold', silver = tier !== 'none';
    return {
      on: on, points: pts, tier: tier, next: next, progress: next ? Mth.min(1, pts / next.points) : 1,
      drinksLeft: silver ? Mth.max(0, V.silver.drinks - (s.daily.vipDrinks || 0)) : 0,
      saturday: saturday(s),
      slotBets: C().slots.bets.concat(silver ? [C().slots.vipBet] : []),
      bjBets: [BJ().bets[0], BJ().bets[1] * (gold ? BJ().vipGoldMult : 1)],
      rouletteLimit: gold ? C().roulette.vipLimit : C().roulette.limit,
    };
  }

  /**
   * Whether a game can be played now (a condition): blackjack's back-off (P1) and 60 hands a day,
   * darts matches (P1, 3 a day), and cash for the smallest bet.
   * @param {string} game 'slots' | 'blackjack' | 'roulette' | 'darts'
   * @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  function canPlay(s, game) {
    var c = s.casino;
    if (game === 'blackjack') {
      if (feat('nightlife') && s.clock.day < (c.barredUntil || 0)) return no('reason.barred', { day: c.barredUntil });
      if ((s.daily.bjHands || 0) >= BJ().handsPerDay) return no('reason.dailyLimit');
      if (s.money.cash < BJ().bets[0]) return no('reason.needCash', { n: BJ().bets[0], money: money(BJ().bets[0]) });
    } else if (game === 'slots') {
      if (s.money.cash < C().slots.bets[0]) return no('reason.needCash', { n: C().slots.bets[0], money: money(C().slots.bets[0]) });
    } else if (game === 'roulette') {
      if (s.money.cash < 1) return no('reason.needCash', { n: 1, money: money(1) });
    } else if (game === 'darts') {
      var M = C().darts.match;
      if (!feat('nightlife')) return no('reason.featureOff');
      if ((s.daily.dartsMatches || 0) >= M.perDay) return no('reason.dailyLimit');
      if (s.money.cash < M.stake[0]) return no('reason.needCash', { n: M.stake[0], money: money(M.stake[0]) });
    }
    return yes();
  }

  // ============================================================================================
  // Applying a round to the state

  /**
   * Applies one gamble round (B-14): the net to cash (a win is income 'win', through the lien),
   * -1 karma up to -10 a day (orig; not for darts or scratch), VIP points on the stake (P1; ×2 on
   * Saturday), casino.winToday, the jackpot and casinoBig log entries, the `gamble` event.
   * @param {string} game 'slots' | 'blackjack' | 'roulette' | 'darts' | 'scratch'
   * @param {number} bet the amount staked this round
   * @param {number} net the round's net (whole dollars)
   * @param {object=} facts extra fields for the `gamble` payload (reels, pocket, ...)
   * @returns {object} a partial Result
   */
  function applyRound(s, game, bet, net, facts) {
    var res = partial(), c = s.casino, K = C().karma;
    net = Mth.round(net);
    if (net > 0) SR.rules.effects.credit(s, 'cash', net, 'win');
    else if (net < 0) s.money.cash = Mth.max(0, s.money.cash + net);
    if (game !== 'darts' && game !== 'scratch' && (s.daily.gambleKarma || 0) < K.dailyMax) {
      SR.rules.stats.karma(s, K.gamble);
      s.daily.gambleKarma = (s.daily.gambleKarma || 0) + 1;
    }
    if (feat('nightlife') && game !== 'scratch' && game !== 'darts') {
      var mult = saturday(s) ? C().vip.saturdayMult : 1;
      c.points = Mth.round(((c.points || 0) + bet / C().vip.pointPerDollars * mult) * 100) / 100;
    }
    if (game !== 'scratch' && game !== 'darts') {
      var before = c.winToday || 0;
      c.winToday = before + net;
      var big = SR.tuning.news.casinoBig;
      if (before <= big && c.winToday > big) res.log.push({ kind: 'casinoBig', vars: { n: c.winToday } });
    }
    res.events.push({ name: 'gamble', payload: Object.assign({ game: game, bet: bet, net: net }, facts || {}) });
    return res;
  }

  /** @returns {object|null} a refusal partial when the stake is not affordable. */
  function short(s, n) { return s.money.cash < n ? { ok: false, reason: 'reason.needCash', vars: { n: n, money: money(n) } } : null; }

  /**
   * One slot pull on the state (the named fn 'casino.slotsSpin', params.bet): the bet must be one of
   * the allowed bets (5 / 25 / 100; 500 at VIP Silver).
   * @returns {object} a partial Result; the `gamble` payload carries reels, line and mult
   */
  function slotsRound(s, bet, ctx) {
    bet = Mth.floor(Number(bet) || 0);
    if (vip(s).slotBets.indexOf(bet) < 0) return { ok: false, reason: 'reason.badBet', vars: { n: bet } };
    var sh = short(s, bet);
    if (sh) return sh;
    var r = spin(rng0(ctx), bet, pays(s));
    var res = applyRound(s, 'slots', bet, r.net, { reels: r.reels, stops: r.stops, line: r.line, mult: r.mult });
    if (r.line === 'dollar3') res.log.push({ kind: 'jackpot', vars: { n: r.win } });
    res.spin = r;
    return res;
  }

  /**
   * One finished blackjack hand on the state (the named fn 'casino.bjHand'): params { bet, net,
   * wagered?, trueCount, shoe } (the engine plays the round with the functions above on a copy of
   * the state's shoe; `wagered` is the round's total stake with doubles and splits, bj.wagered) or
   * { round, shoe, trueCount } (the net and the stake are settled here). Applies the round, the
   * day's hand count, the pit boss (P1) and keeps the shoe in state.casino.shoe.
   * @returns {object} a partial Result
   */
  function bjRound(s, p) {
    p = p || {};
    var gate = canPlay(s, 'blackjack');
    if (!gate.ok) return { ok: false, reason: gate.reason, vars: gate.vars };
    var bet = Mth.floor(Number(p.bet !== undefined ? p.bet : p.round && p.round.bet) || 0);
    var lim = vip(s).bjBets;
    if (bet < lim[0] || bet > lim[1]) return { ok: false, reason: 'reason.badBet', vars: { n: bet } };
    var net = p.round ? settle(p.round) : Number(p.net) || 0;
    // The stake (VIP points, the gamble payload, the cash it needed): a played round's own, else the
    // engine's `wagered` (a double or a split stakes up to 2 × the bet), else the bet or the loss.
    var told = Mth.floor(Number(p.wagered) || 0);
    var staked = p.round ? wagered(p.round) : Mth.max(bet, -net, told >= bet && told <= 2 * bet ? told : 0);
    var sh = short(s, staked);
    if (sh) return sh;
    s.daily.bjHands = (s.daily.bjHands || 0) + 1;
    var tc = typeof p.trueCount === 'number' ? p.trueCount : 0;
    var sus = suspicion(s, bet, tc);
    if (validShoe(p.shoe)) s.casino.shoe = SR.util.clone(p.shoe);
    var res = applyRound(s, 'blackjack', staked, net, { hands: s.daily.bjHands, suspicion: sus.to,
      backedOff: sus.backedOff, barredUntil: sus.barredUntil });
    res.suspicion = sus;
    return res;
  }

  /**
   * One roulette spin on the state (the named fn 'casino.rouletteSpin', params.bets): the bets must
   * be legal and within the table limit ($2,000 a spin, orig; $10,000 at VIP Gold); one draw.
   * @returns {object} a partial Result; the `gamble` payload carries the pocket
   */
  function rouletteRound(s, bets, ctx) {
    if (!isArray(bets) || !bets.length) return { ok: false, reason: 'reason.badBet', vars: {} };
    var total = 0;
    for (var i = 0; i < bets.length; i++) {
      var amt = Mth.floor(Number(bets[i].amount) || 0);
      if (amt <= 0 || !covers(bets[i])) return { ok: false, reason: 'reason.badBet', vars: { i: i } };
      total += amt;
    }
    if (total > vip(s).rouletteLimit) return { ok: false, reason: 'reason.badBet', vars: { n: total } };
    var sh = short(s, total);
    if (sh) return sh;
    var pocket = rouletteSpin(rng0(ctx)), r = rouletteSettle(bets, pocket);
    var res = applyRound(s, 'roulette', r.wagered, r.net, { pocket: pocket === DOUBLE_ZERO ? '00' : pocket, wins: r.wins });
    res.spin = { pocket: pocket, result: r };
    return res;
  }

  /**
   * Scratches a card (the named fn 'casino.scratch', P1 `shopsPlus`): uses one card from the Bag
   * (unless the action's cost did), draws its prize now (so the reveal can't change it), credits it
   * (income 'prize') and opens the `scratch` engine to reveal it. No karma (B-14e).
   * @returns {object} a partial Result with `open`
   */
  function scratchRound(s, ctx) {
    var paid = ctx && ctx.cost && ctx.cost.items && ctx.cost.items.scratch > 0;
    if (!paid) {
      if (!((s.items.scratch || 0) > 0)) return { ok: false, reason: 'reason.needItem', vars: { item: SR.rules.conditions.nameOf('item', 'scratch') } };
      s.items.scratch -= 1;
    }
    var r = scratch(rng0(ctx)), price = C().scratch.price;
    if (r.pay > 0) SR.rules.effects.credit(s, 'cash', r.pay, 'prize');
    var res = applyRound(s, 'scratch', price, 0, { pay: r.pay, roll: r.roll });
    res.events[res.events.length - 1].payload.net = r.pay - price;
    res.open = { minigame: 'scratch', skin: 'scratch', params: { roll: r.roll, pay: r.pay, tier: r.tier, panels: 3 },
      resolve: ctx && ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * Darts practice (B-14f `practice`; P0): +1 CHA the first game each day, no stake; opens the engine.
   * @returns {object} a partial Result with `open`
   */
  function dartsPractice(s, ctx) {
    var P = C().darts.practice, res = partial();
    if (!(s.daily.dartsPractice > 0)) SR.rules.stats.add(s, 'cha', P.cha, 'train');
    s.daily.dartsPractice = (s.daily.dartsPractice || 0) + 1;
    res.open = { minigame: 'darts', skin: 'darts', params: Object.assign({ mode: 'practice' }, dartsParams(s, ctx && ctx.params, rng0(ctx))),
      resolve: ctx && ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * Starts a darts match (P1 `nightlife`; B-14f `match`): 3 a day, a stake of $10-$200 taken now,
   * against Rookie (160, pays 2×), Regular (230, 2×) or Shark (320, 3×).
   * @param {string} tier 'rookie' | 'regular' | 'shark'
   * @returns {object} a partial Result with `open`
   */
  function dartsMatchStart(s, tier, stake, ctx) {
    var M = C().darts.match, gate = canPlay(s, 'darts');
    if (!gate.ok) return { ok: false, reason: gate.reason, vars: gate.vars };
    if (!M[tier] || !M[tier].target) return { ok: false, reason: 'reason.badBet', vars: {} };
    stake = Mth.floor(Number(stake) || 0);
    if (stake < M.stake[0] || stake > M.stake[1]) return { ok: false, reason: 'reason.badBet', vars: { n: stake } };
    var sh = short(s, stake);
    if (sh) return sh;
    s.money.cash -= stake;
    s.daily.dartsMatches = (s.daily.dartsMatches || 0) + 1;
    s.casino.match = { tier: tier, stake: stake, day: s.clock.day };
    var res = partial();
    res.open = { minigame: 'darts', skin: 'darts', params: Object.assign({ mode: 'match', tier: tier, target: M[tier].target,
      pays: M[tier].pays, stake: stake }, dartsParams(s, ctx && ctx.params, rng0(ctx))), resolve: ctx && ctx.id ? ctx.id + ':resolve' : null };
    return res;
  }

  /**
   * Resolves today's darts match (state.casino.match, set by matchStart) with the engine's
   * { score }: score ≥ target pays stake × pays (the stake was taken at the start). The tier and the
   * stake are the ones paid for, never the result's echo; without a match in progress the resolve
   * is refused, so a stray or repeated resolve pays nothing.
   * @returns {object} a partial Result
   */
  function dartsMatch(s, r, ctx) {
    r = r || {};
    var M = C().darts.match, m = s.casino.match;
    if (!m || m.day !== s.clock.day) return { ok: false, reason: 'reason.notNow', vars: {} };
    var tier = m.tier, stake = m.stake;
    if (!M[tier] || !(stake > 0)) return { ok: false, reason: 'reason.notNow', vars: {} };
    var won = (Number(r.score) || 0) >= M[tier].target;
    var back = won ? stake * M[tier].pays : 0;
    if (back > 0) SR.rules.effects.credit(s, 'cash', back, 'win');
    s.casino.match = null;
    var res = partial();
    res.events.push({ name: 'gamble', payload: { game: 'darts', bet: stake, net: back - stake, tier: tier, score: Number(r.score) || 0 } });
    return res;
  }

  /**
   * A free VIP drink (P1 `nightlife`, Silver: 2 a day, 0 min, +1 CHA, +1 Buzz).
   * @returns {object} a partial Result
   */
  function vipDrink(s) {
    var v = vip(s), S = C().vip.silver;
    if (!v.on) return { ok: false, reason: 'reason.featureOff', vars: {} };
    if (v.tier === 'none') return { ok: false, reason: 'reason.notYet', vars: {} };
    if (v.drinksLeft <= 0) return { ok: false, reason: 'reason.dailyLimit', vars: {} };
    s.daily.vipDrinks = (s.daily.vipDrinks || 0) + 1;
    SR.rules.stats.add(s, 'cha', S.drinkCha, 'train');
    SR.rules.stats.buzz(s, S.drinkBuzz);
    return partial();
  }

  // Named fns (CONTRACT §8.5)
  SR.def.fn('casino.canPlay', function (s, params, ctx, game) { return canPlay(s, game || params.game); });
  SR.def.fn('casino.slotsSpin', function (s, params, ctx) { return slotsRound(s, params.bet, ctx); });
  SR.def.fn('casino.bjHand', function (s, params) { return bjRound(s, params); });
  SR.def.fn('casino.rouletteSpin', function (s, params, ctx) { return rouletteRound(s, params.bets, ctx); });
  SR.def.fn('casino.scratch', function (s, params, ctx) { return scratchRound(s, ctx); });
  SR.def.fn('casino.dartsPractice', function (s, params, ctx) { return dartsPractice(s, ctx); });
  SR.def.fn('casino.dartsMatchStart', function (s, params, ctx, tier) { return dartsMatchStart(s, tier || params.tier, params.stake, ctx); });
  SR.def.fn('casino.dartsMatch', function (s, params, ctx) { return dartsMatch(s, params, ctx); });
  SR.def.fn('casino.vipDrink', function (s) { return vipDrink(s); });
  /**
   * A whole session's net in one go ('<id>:resolve' of an engine that did not apply its rounds):
   * params { game, net, rounds, wagered }; karma once per round (the daily cap still holds).
   */
  SR.def.fn('casino.settle', function (s, params) {
    var game = params.game || 'slots', rounds = Mth.max(0, Mth.floor(Number(params.rounds) || 0));
    if (!params.apply) return {};
    var res = applyRound(s, game, Mth.max(0, Number(params.wagered) || 0), Number(params.net) || 0, { rounds: rounds });
    for (var i = 1; i < rounds && (s.daily.gambleKarma || 0) < C().karma.dailyMax; i++) {
      SR.rules.stats.karma(s, C().karma.gamble);
      s.daily.gambleKarma = (s.daily.gambleKarma || 0) + 1;
    }
    return res;
  });

  SR.rules.casino = {
    slots: {
      SYMBOLS: SYMBOLS.slice(), LINES: LINES.slice(),
      strip: strip, pays: pays, line: line, spin: spin,
      /** @returns {number} the exact RTP of a pay table (default B-14a: 0.9225). */
      rtp: function (table) { return enumerate(table).rtp; },
      /** @returns {number} the exact hit rate (B-14a: 0.2125). */
      hitRate: function (table) { return enumerate(table).hitRate; },
      enumerate: enumerate,
      round: slotsRound,
    },
    bj: {
      rank: rank, value: value, total: total, hilo: hilo,
      shoe: newShoe, reshuffle: reshuffle, draw: draw, shoeOf: shoeOf, validShoe: validShoe,
      deal: deal, hit: hit, stand: stand, double: double, split: split, dealer: dealer, settle: settle,
      canDouble: canDouble, canSplit: canSplit, hand: hand, wagered: wagered,
      counts: counts, suspicion: suspicion, basic: basic, playBook: playBook,
      round: bjRound,
    },
    roulette: {
      DOUBLE_ZERO: DOUBLE_ZERO, OUTSIDE: OUTSIDE.slice(),
      spin: rouletteSpin, settle: rouletteSettle, covers: covers, isRed: isRed, legal: legal,
      round: rouletteRound,
    },
    scratch: scratch,
    scratchPrize: scratchPrize,
    scratchEV: scratchEV,
    scratchRound: scratchRound,
    darts: {
      score: dartsScore, amp: dartsAmp, params: dartsParams, wobble: wobble, autoThrows: autoThrows,
      practice: dartsPractice, matchStart: dartsMatchStart, match: dartsMatch,
      /** @deprecated read SR.tuning.casino.darts.autoWindowSec (kept for W1-C's recorded name). */
      get AUTO_WINDOW_SEC() { return C().darts.autoWindowSec; },
    },
    vip: vip,
    vipDrink: vipDrink,
    canPlay: canPlay,
    applyRound: applyRound,
  };
})();
