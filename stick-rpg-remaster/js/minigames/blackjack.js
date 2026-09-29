// js/minigames/blackjack.js — owner: W2-Night. The Blackjack engine (GDD §4.13, §6.5; BALANCE
// B-14b; UI §5.8): a 6-deck shoe with the cut card at 75 %, the dealer stands on soft 17 and peeks,
// naturals pay 3:2, double on any first two cards (not after a split), split once (split aces take
// one card each), no insurance or surrender; bets $5-$500 (VIP Gold ×5, P1); 60 hands a day.
// The rules play the cards: the engine deals from a copy of the state's shoe
// (SR.rules.casino.bj.shoeOf) with SR.rules.casino.bj.{deal, hit, stand, double, split, dealer} and
// host.rng (the rules stream), then applies each finished hand at once with
// SR.act('casino.blackjack.hand:resolve', { round, shoe, trueCount }) (casino.bjHand: the net, karma
// -1 up to -10 a day, the day's hand count, the pit boss (P1) and the shoe kept in the state).
// A hand left mid-play is lost: the forfeit carries its stake as `live` (casino.sessionEnd applies
// it); a hand already decided (its cards still being revealed) is applied as played before you
// leave, never forfeited. On Hardcore the same loss is written to `state.pending` while a hand is
// out, so closing the tab mid-hand cannot undo it (ARCHITECTURE §10, §15).
// Auto ("By the book"): plays the current hand (or deals one at the current bet) with basic
// strategy (SR.rules.casino.bj.playBook); the bet is still yours. Session result: { net, rounds,
// wagered } (a sampled Auto without the frame carries `apply: true` for casino.settle and its
// `shoe`, which casino.sessionEnd keeps).
// Input: the `blackjack` context (CONTRACT §12.3: H hit, S stand, D double, P split, 1-5 chips; pad
// A hit, B stand, X double, Y split), so H / S / D never move you or toggle the HUD; Enter (or A)
// deals. Chips 1-4 add $5 / $25 / $100 / $500 (×5 at VIP Gold), chip 5 clears the bet (the original's
// grey chip). Accessible state: host.label('table', ...) and #aria ("Dealer shows 10. You have 17.").
(function () {
  'use strict';
  var SR = window.SR;

  // Presentation constants (UI §5.8).
  var CARD = { w: 88, h: 124, r: 10, step: 34 };
  var DEALER_Y = 64, HAND_Y = 272;
  var REVEAL_S = 0.16, DEALER_S = 0.32, OUTCOME_S = 1.3;
  var CHIPS = [5, 25, 100, 500];       // the original's chips; the fifth is the clear chip
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var CHIP_COL = ['acc.red', 'acc.green', 'acc.black', 'acc.purple'];

  function B() { return SR.rules.casino.bj; }
  function BJ() { return SR.tuning.casino.bj; }
  function fast() { try { return !!(SR.debug && typeof SR.debug.fast === 'function' && SR.debug.fast() === true); } catch (e) { return false; } }
  function pal(k) { return SR.art && SR.art.draw ? SR.art.draw.color(k) : ''; }
  function money(n) { return SR.text.money(n, { cents: n % 1 !== 0 }); }
  function live() { return SR.state; }
  function cash() { var s = live(); return s && s.money ? s.money.cash : 0; }
  function limits(state) {
    try { return SR.rules.casino.vip(state).bjBets.slice(); } catch (e) { return BJ().bets.slice(); }
  }
  function hardcore() { var s = live(); return !!(s && s.mode && s.mode.difficulty === 'hardcore'); }
  function cardSharp(state) {
    return !!(SR.features.perks && SR.rules.perks && typeof SR.rules.perks.has === 'function' && state && SR.rules.perks.has(state, 'cardSharp'));
  }

  function create(host, params) {
    var T = host.text;
    var lim = limits(live() || host.state);
    var gold = lim[1] > BJ().bets[1];
    var chipVals = CHIPS.map(function (c) { return gold ? c * BJ().vipGoldMult : c; });
    var sh = B().shoeOf(live() || host.state, host.rng);
    var bet = Math.min(lim[1], Math.max(lim[0], Number(params && params.bet) || lim[0]));
    var r = null, tc = 0;                     // the round in play and the true count when it was bet
    var phase = 'bet';                        // bet | play | reveal | outcome | closed
    var vis = null;                           // cards shown: { dealer, hole, hands: [n] }
    var revealT = 0, outcomeT = 0, outcome = null;
    var session = { net: 0, rounds: 0, wagered: 0 };
    var finished = false, barred = false, sel = 0;
    var chipSel = 0;                          // the D-pad's chip (0-3, 4 = the clear chip): pads have no digits
    var ownPending = null;

    // ---- DOM ---------------------------------------------------------------------------------------
    var bar = host.el('div', { 'data-id': 'mg-bj-controls', style: {
      position: 'absolute', left: '16px', top: '488px', width: '1248px', height: '80px', display: 'flex', gap: '8px', alignItems: 'stretch',
      pointerEvents: 'none' } });
    host.ui.appendChild(bar);

    function btn(id, label, badge, onPress, opts) {
      var b = host.button({ id: 'mg-bj-' + id, label: label, badge: badge, onPress: onPress, variant: opts && opts.primary ? 'primary' : null, aria: opts && opts.aria });
      b.style.height = '72px';
      b.style.justifyContent = 'center';
      if (opts && opts.grow) b.style.flex = '1 1 0';
      if (opts && opts.off) {
        // disabled the design system's way (UI §2.3): ink-500 on paper-2, never faded by opacity
        b.setAttribute('aria-disabled', 'true');
        b.style.background = 'var(--paper-2)'; b.style.color = 'var(--ink-500)'; b.style.boxShadow = 'none'; b.setAttribute('data-shadow', 'none');
      }
      bar.appendChild(b);
      return b;
    }

    function controls() {
      while (bar.firstChild) bar.removeChild(bar.firstChild);
      var busy = phase === 'reveal' || phase === 'outcome' || finished;
      if (phase === 'bet' || phase === 'outcome' || phase === 'closed') {
        chipVals.forEach(function (v, i) {
          var b = btn('chip-' + (i + 1), money(v), String(i + 1), function () { chip(i); }, { aria: T('mg.blackjack.chip', { money: money(v) }), off: busy || barred });
          b.style.minWidth = '104px';
          if (!(busy || barred)) b.style.background = 'var(--paper-0)';
          if (host.device === 'pad' && chipSel === i && !busy) host.ring(b, true);
        });
        var cl = btn('clear', T('mg.blackjack.clear'), '5', function () { chip(4); }, { off: busy || !bet });
        if (host.device === 'pad' && chipSel === 4 && !busy) host.ring(cl, true);
        btn('deal', T('mg.blackjack.deal'), null, function () { deal(); }, { primary: true, grow: true, off: busy || barred || !canDeal().ok });
      } else {
        var h = r && B().hand(r);
        btn('hit', T('mg.blackjack.hit'), 'H', function () { act('hit'); }, { grow: true, off: phase !== 'play' });
        btn('stand', T('mg.blackjack.stand'), 'S', function () { act('stand'); }, { grow: true, off: phase !== 'play' });
        btn('double', T('mg.blackjack.double'), 'D', function () { act('double'); }, { grow: true, off: phase !== 'play' || !canDouble() });
        btn('split', T('mg.blackjack.split'), 'P', function () { act('split'); }, { grow: true, off: phase !== 'play' || !canSplit() });
        if (h) { /* the active hand is outlined on the table */ }
      }
      var co = btn('cashout', T('mg.blackjack.cashOut'), null, function () { cashOut(); }, { off: phase === 'play' || phase === 'reveal' || finished });
      co.style.minWidth = '150px';
    }

    function canDeal() {
      var s = live();
      if (!s) return { ok: false, reason: 'reason.noGame' };
      var g = SR.rules.casino.canPlay(s, 'blackjack');
      if (!g.ok) return g;
      if (bet < lim[0]) return { ok: false, reason: 'reason.badBet', vars: { n: bet } };
      if (cash() < bet) return { ok: false, reason: 'reason.needCash', vars: { n: bet, money: SR.text.money(bet) } };
      return { ok: true };
    }
    function canDouble() { return !!(r && B().canDouble(r) && cash() >= B().wagered(r) + B().hand(r).bet); }
    function canSplit() { return !!(r && B().canSplit(r) && cash() >= B().wagered(r) + B().hand(r).bet); }

    function cardName(c) { return T('mg.blackjack.rank.' + B().rank(c)); }
    function totalText(cards) {
      var v = B().value(cards);
      return v.soft && v.total < 21 ? T('mg.blackjack.softTotal', { total: v.total }) : String(v.total);
    }

    function mirror() {
      var parts = [];
      var s = live();
      host.label('status', T('mg.blackjack.handsToday', { n: Math.min(BJ().handsPerDay, (s && s.daily ? s.daily.bjHands || 0 : 0) + (r && phase !== 'bet' && phase !== 'outcome' ? 1 : 0)), max: BJ().handsPerDay }));
      host.label('info', T('mg.blackjack.bet', { money: money(bet) }));
      if (r) {
        parts.push(r.holeShown ? T('mg.blackjack.dealerHas', { total: totalText(r.dealer) }) : T('mg.blackjack.dealerShows', { card: cardName(r.up) }));
        r.hands.forEach(function (h, i) {
          parts.push(r.hands.length > 1 ? T('mg.blackjack.handHas', { n: i + 1, total: totalText(h.cards) }) : T('mg.blackjack.youHave', { total: totalText(h.cards) }));
        });
      } else parts.push(T('mg.blackjack.placeBet'));
      host.label('table', parts.join(' '));
      host.label('session', T('mg.blackjack.status', { money: money(bet), n: session.rounds, net: SR.text.money(session.net, { sign: true }) }));
    }

    function chip(i) {
      if (phase !== 'bet' && phase !== 'outcome' || finished || barred) return;
      if (phase === 'outcome') toBet();
      if (i >= chipVals.length) {
        bet = 0;
        host.audio.sfx('chips');
        host.aria(T('mg.blackjack.bet', { money: money(0) }));
      } else {
        var next = Math.min(lim[1], bet + chipVals[i]);
        if (next === bet || next > cash()) { host.audio.sfx('error'); host.aria(T(next > cash() ? 'reason.needCash' : 'bark.lou.limit', { money: SR.text.money(next) })); return; }
        bet = next;
        host.audio.sfx('chips');
        host.aria(T('mg.blackjack.bet', { money: money(bet) }));
      }
      controls();
      mirror();
    }

    // ---- the hand ------------------------------------------------------------------------------------
    function deal() {
      if (phase === 'outcome') toBet();
      if (phase !== 'bet' || finished || !host.interactive()) return;
      var g = canDeal();
      if (!g.ok) { host.audio.sfx('error'); host.aria(T(g.reason || 'reason.notNow', g.vars || {})); return; }
      // The shoe as the rules keep it (each applied hand stores it); a state without one keeps the
      // shoe this table shuffled when it opened, so no second shuffle is drawn from the rules stream.
      var st = live();
      if (B().validShoe(st && st.casino && st.casino.shoe)) sh = B().shoeOf(st, host.rng);
      tc = B().counts(sh).trueCount;
      r = B().deal(sh, bet, host.rng);
      vis = { dealer: 0, hole: false, hands: [0] };
      host.audio.sfx('card_deal');
      pend();
      afterMove();
    }

    function act(what) {
      if (phase !== 'play' || !r || finished || !host.interactive()) return;
      var ok = false;
      if (what === 'hit') ok = B().hit(r, sh, host.rng);
      else if (what === 'stand') ok = B().stand(r);
      else if (what === 'double') ok = canDouble() && B().double(r, sh, host.rng);
      else if (what === 'split') ok = canSplit() && B().split(r, sh, host.rng);
      if (!ok) { host.audio.sfx('error'); return; }
      host.audio.sfx(what === 'stand' ? 'click' : 'card_deal');
      if (what === 'double' || what === 'split') pend();
      afterMove(what);
    }

    /** After a deal or a move: the dealer plays once every hand is done, then the cards are revealed. */
    function afterMove(what) {
      if (r.phase === 'dealer') B().dealer(r, sh, host.rng);
      phase = r.phase === 'over' ? 'reveal' : 'play';
      if (phase === 'play') {
        var h = B().hand(r);
        var line = what === 'hit' || what === 'double' ? T('mg.blackjack.youDrew', { card: cardName(h.cards[h.cards.length - 1]) }) + ' ' : '';
        if (!what) line = T('mg.blackjack.dealerShows', { card: cardName(r.up) }) + ' ';
        host.aria(line + (r.hands.length > 1 ? T('mg.blackjack.handHas', { n: r.active + 1, total: totalText(h.cards) }) : T('mg.blackjack.youHave', { total: totalText(h.cards) })));
      }
      revealT = 0;
      sel = 0;
      if (fast()) revealAll();
      controls();
      mirror();
      if (phase === 'reveal' && fast()) apply();
    }

    function revealAll() {
      if (!r) return;
      vis = { dealer: r.dealer.length, hole: r.holeShown, hands: r.hands.map(function (h) { return h.cards.length; }) };
    }
    function revealed() {
      if (!r || !vis) return true;
      if (vis.hands.length !== r.hands.length) return false;
      for (var i = 0; i < r.hands.length; i++) if (vis.hands[i] < r.hands[i].cards.length) return false;
      if (r.holeShown && !vis.hole) return false;
      return vis.dealer >= r.dealer.length;
    }
    /** One step of the reveal: the player's cards, then the hole card, then each dealer draw. */
    function revealStep() {
      if (vis.hands.length !== r.hands.length) { vis.hands = r.hands.map(function () { return 1; }); return REVEAL_S; }   // a split: two hands of one card
      if (vis.dealer < 1) { vis.dealer = 1; return REVEAL_S; }
      for (var i = 0; i < r.hands.length; i++) if (vis.hands[i] < r.hands[i].cards.length) { vis.hands[i]++; return REVEAL_S; }
      if (vis.dealer < 2) { vis.dealer = 2; return REVEAL_S; }
      if (r.holeShown && !vis.hole) { vis.hole = true; host.audio.sfx('card_deal'); return DEALER_S; }
      if (vis.dealer < r.dealer.length) {
        vis.dealer++;
        host.audio.sfx('card_deal');
        host.aria(T('mg.blackjack.dealerDrew', { card: cardName(r.dealer[vis.dealer - 1]) }));
        return DEALER_S;
      }
      return 0;
    }

    /** Applies the finished hand through the rules and shows how it went. */
    function apply() {
      if (!r || phase !== 'reveal') return;
      var round = r, staked = B().wagered(r);
      var res = SR.act('casino.blackjack.hand:resolve', { round: round, shoe: sh, trueCount: tc });
      clearPend();
      var ev = res && res.ok ? (res.events || []).filter(function (e) { return e.name === 'gamble'; })[0] : null;
      if (!ev) {
        // Refused (it should not be: the hand was checked when it was dealt): nothing was taken.
        host.audio.sfx('error');
        host.aria(T(res && res.reason ? res.reason : 'reason.notNow', res && res.vars || {}));
        outcome = { key: 'mg.blackjack.push', vars: {}, net: 0 };
      } else {
        var g = ev.payload, net = g.net;
        session.rounds += 1;
        session.net += net;
        session.wagered += staked;
        var dealerTotal = B().total(round.dealer);
        var key = round.playerBJ && !round.dealerBJ ? 'mg.blackjack.natural' : net > 0 ? 'mg.blackjack.won' : net < 0 ? 'mg.blackjack.lost' : 'mg.blackjack.push';
        outcome = { key: key, vars: { money: money(Math.abs(net)) }, net: net, bust: round.hands.every(function (h) { return h.busted; }), dealerBust: dealerTotal > 21 };
        host.audio.sfx(net > 0 ? 'coin' : net < 0 ? 'loss' : 'chips');
        var line = (round.holeShown ? T('mg.blackjack.dealerHas', { total: totalText(round.dealer) }) + ' ' : '') + T(key, outcome.vars);
        if (key === 'mg.blackjack.natural' && net > 0) line += ' ' + T('mg.blackjack.won', { money: money(net) });
        host.aria(line);
        if (g.backedOff) {
          barred = true;
          host.aria(T('bark.lou.backoff') + ' ' + T('mg.blackjack.backedOff', { day: g.barredUntil }));
        }
      }
      phase = 'outcome';
      outcomeT = fast() ? 0 : OUTCOME_S;
      if (bet > cash()) bet = Math.max(0, Math.min(bet, Math.floor(cash() / lim[0]) * lim[0]));
      controls();
      mirror();
      if (!outcomeT) toBet();
    }

    function toBet() {
      if (phase !== 'outcome') return;
      phase = 'bet';
      r = null;
      vis = null;
      outcome = null;
      controls();
      mirror();
      if (barred && !finished) { finished = true; host.finish(sessionResult()); }
    }

    // Hardcore: a hand that is out is a live stake; closing the tab now counts as losing it.
    function pend() {
      if (!hardcore() || !r) return;
      var s = live(), stake = B().wagered(r);
      ownPending = { resolve: 'casino.blackjack:resolve', worst: { net: session.net - stake, rounds: session.rounds, wagered: session.wagered + stake, live: stake,
        shoe: SR.util.clone(sh) } };
      s.pending = ownPending;
      if (SR.save && typeof SR.save.write === 'function') { try { SR.save.write('ironman'); } catch (e) { SR.util.warnOnce('bj-ironman', 'blackjack: ironman write failed (' + e.message + ')'); } }
    }
    function clearPend() {
      var s = live();
      if (s && ownPending && s.pending === ownPending) s.pending = null;
      ownPending = null;
    }

    function liveStake() { return r && (phase === 'play' || phase === 'reveal') ? B().wagered(r) : 0; }
    function sessionResult() { return { net: session.net, rounds: session.rounds, wagered: session.wagered }; }

    function cashOut() {
      if (finished || phase === 'play' || phase === 'reveal' || !host.interactive()) return;
      finished = true;
      host.finish(sessionResult());
    }

    // ---- drawing ---------------------------------------------------------------------------------
    function drawCard(ctx, c, x, y, back) {
      SR.art.draw.roundRect(ctx, x, y, CARD.w, CARD.h, CARD.r);
      ctx.fillStyle = back ? pal('bld.casino.walls') : pal('kit.paper');
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      if (back) {
        SR.art.draw.roundRect(ctx, x + 8, y + 8, CARD.w - 16, CARD.h - 16, 6);
        ctx.strokeStyle = pal('kit.paper'); ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = pal('kit.paper');
        ctx.beginPath(); ctx.arc(x + CARD.w / 2 - 12, y + CARD.h / 2 + 4, 10, 0, Math.PI * 2); ctx.arc(x + CARD.w / 2 + 4, y + CARD.h / 2 - 4, 13, 0, Math.PI * 2);
        ctx.arc(x + CARD.w / 2 + 18, y + CARD.h / 2 + 6, 9, 0, Math.PI * 2); ctx.fill();
        return;
      }
      var suit = Math.floor(c / 13) % 4, red = suit === 1 || suit === 2;
      ctx.fillStyle = red ? pal('kit.red') : host.color('ink-900');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = host.font(24, 900);
      ctx.fillText(RANKS[c % 13], x + 8, y + 28);
      ctx.font = host.font(20, 400);
      ctx.fillText(SUITS[suit], x + 8, y + 50);
      ctx.textAlign = 'center';
      ctx.font = host.font(44, 400);
      ctx.fillText(SUITS[suit], x + CARD.w / 2 + 6, y + CARD.h / 2 + 22);
    }

    function drawHand(ctx, cards, n, x, y, active, label) {
      for (var i = 0; i < n; i++) drawCard(ctx, cards[i], x + i * CARD.step, y, false);
      if (active) {
        ctx.lineWidth = 4; ctx.strokeStyle = host.color('focus');
        SR.art.draw.roundRect(ctx, x - 8, y - 8, CARD.w + (n - 1) * CARD.step + 16, CARD.h + 16, 14); ctx.stroke();
      }
      if (n) {
        var tot = B().value(cards.slice(0, n));
        var s = tot.total > 21 ? T('mg.blackjack.bust') : tot.soft && tot.total < 21 ? T('mg.blackjack.soft', { total: tot.total }) : String(tot.total);
        pill(ctx, x + CARD.w + (n - 1) * CARD.step + 14, y + 20, (label ? label + ' · ' : '') + s, tot.total > 21 ? 'hp-100' : 'paper-0');
      }
    }

    function pill(ctx, x, y, s, bg) {
      ctx.font = host.font(18, 900);
      var w = ctx.measureText(s).width + 24;
      SR.art.draw.roundRect(ctx, x, y - 18, w, 32, 16);
      ctx.fillStyle = host.color(bg || 'paper-0'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = host.color('ink-900'); ctx.stroke();
      ctx.fillStyle = host.color('ink-900'); ctx.textAlign = 'left'; ctx.fillText(s, x + 12, y + 5);
    }

    function drawChips(ctx, amount, x, y) {
      var left = amount, stack = 0;
      for (var i = chipVals.length - 1; i >= 0 && stack < 12; i--) {
        while (left >= chipVals[i] && stack < 12) {
          left -= chipVals[i];
          ctx.beginPath(); ctx.ellipse(x, y - stack * 6, 30, 12, 0, 0, Math.PI * 2);
          ctx.fillStyle = pal(CHIP_COL[i]); ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
          ctx.setLineDash([5, 5]); ctx.strokeStyle = pal('kit.paper'); ctx.beginPath(); ctx.ellipse(x, y - stack * 6, 22, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          stack++;
        }
      }
    }

    function render(ctx) {
      ctx.fillStyle = pal('kit.felt'); ctx.fillRect(0, 0, 1280, 576);
      ctx.strokeStyle = pal('kit.paper'); ctx.globalAlpha = 0.35; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(640, -260, 760, 700, 0, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.font = host.font(16, 700); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'center';
      ctx.globalAlpha = 0.7;
      ctx.fillText(T('mg.blackjack.felt', { n: 17, a: BJ().natural * 2, b: 2 }), 640, 250);
      ctx.globalAlpha = 1;
      // the shoe and the discard tray
      ctx.fillStyle = pal('kit.woodDark'); SR.art.draw.roundRect(ctx, 1110, 30, 130, 90, 12); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = pal('inkLine'); ctx.stroke();
      var left = sh.cards.length - sh.pos;
      ctx.fillStyle = pal('bld.casino.walls'); ctx.fillRect(1122, 44, 106 * left / sh.cards.length, 62);
      ctx.strokeRect(1122, 44, 106, 62);
      // the dealer
      ctx.textAlign = 'left'; ctx.font = host.font(18, 900, true); ctx.fillStyle = pal('kit.paper');
      ctx.fillText(T('mg.blackjack.dealer').toUpperCase(), 440, DEALER_Y - 12);
      if (r && vis) {
        for (var i = 0; i < vis.dealer; i++) drawCard(ctx, r.dealer[i], 440 + i * CARD.step, DEALER_Y, i === 1 && !vis.hole);
        if (vis.dealer >= 2 && vis.hole) {
          var dv = B().total(r.dealer.slice(0, vis.dealer));
          pill(ctx, 440 + CARD.w + (vis.dealer - 1) * CARD.step + 14, DEALER_Y + 20, dv > 21 ? T('mg.blackjack.bust') : String(dv), dv > 21 ? 'money-100' : 'paper-0');
        }
        var n = r.hands.length;
        ctx.textAlign = 'left'; ctx.font = host.font(18, 900, true); ctx.fillStyle = pal('kit.paper');
        ctx.fillText(T('mg.blackjack.you').toUpperCase(), n > 1 ? 250 : 440, HAND_Y - 12);
        r.hands.forEach(function (h, k) {
          var x = n > 1 ? 250 + k * 420 : 440;
          drawHand(ctx, h.cards, vis.hands[k] || 0, x, HAND_Y, phase === 'play' && n > 1 && k === r.active, n > 1 ? T('mg.blackjack.handN', { n: k + 1 }) : '');
          drawChips(ctx, h.bet, x + 30, HAND_Y + CARD.h + 60);
        });
      } else {
        ctx.font = host.font(22, 700); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'center';
        ctx.fillText(T('mg.blackjack.placeBet'), 640, HAND_Y + 60);
        drawChips(ctx, bet, 640, HAND_Y + 150);
        ctx.font = host.font(26, 900, true); ctx.fillStyle = pal('kit.paper');
        ctx.fillText(T('mg.blackjack.bet', { money: money(bet) }), 640, HAND_Y + 196);
      }
      if (outcome) {
        ctx.font = host.font(40, 900, true); ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = pal('inkLine');
        var s = T(outcome.key, outcome.vars);
        ctx.strokeText(s, 900, 250); ctx.fillStyle = outcome.net > 0 ? pal('kit.gold') : pal('kit.paper'); ctx.fillText(s, 900, 250);
      }
      if (cardSharp(live() || host.state)) {
        var cn = B().counts(sh);
        ctx.font = host.font(16, 700); ctx.fillStyle = pal('kit.paper'); ctx.textAlign = 'left';
        ctx.fillText(T('mg.blackjack.counts', { running: cn.running, tc: cn.trueCount.toFixed(1) }), 30, 40);
      }
      ctx.textAlign = 'left';
    }

    host.hints([
      { range: ['chip1', 'chip5'], label: 'mg.blackjack.hintChips', only: 'kb' },
      { actions: ['left', 'right', 'up'], label: 'mg.blackjack.hintChips', only: 'pad' },
      { action: 'confirm', label: 'mg.blackjack.hintDeal', only: 'kb' },
      { action: 'hit', label: 'mg.blackjack.hit' },
      { action: 'stand', label: 'mg.blackjack.stand' },
      { action: 'double', label: 'mg.blackjack.double' },
      { action: 'split', label: 'mg.blackjack.split' },
      { label: 'mg.blackjack.hintTap', only: 'touch' },
    ]);
    controls();
    mirror();
    host.aria(T('mg.blackjack.startAria', { money: money(bet) }));

    return {
      update: function (dt) {
        if (phase === 'reveal' || (phase === 'play' && !revealed())) {
          revealT -= dt;
          var guard = 0;
          while (revealT <= 0 && !revealed() && guard++ < 16) revealT += revealStep() || REVEAL_S;
          if (phase === 'reveal' && revealed() && revealT <= 0) apply();
        } else if (phase === 'outcome') {
          outcomeT -= dt;
          if (outcomeT <= 0) toBet();
        }
      },
      render: render,
      onAction: function (a, ev) {
        if (ev && ev.repeat) return;
        var m = /^chip(\d)$/.exec(a);
        if (m) { chip(+m[1] - 1); return; }
        if (a === 'confirm') { if (phase === 'bet' || phase === 'outcome') deal(); return; }
        if (a === 'hit') { if (phase === 'bet' || phase === 'outcome') deal(); else act('hit'); return; }
        // Pads have no digits: in the betting phase the D-pad picks a chip and Up places it.
        var pad = ev && ev.device === 'pad';
        if (pad && (a === 'left' || a === 'right') && (phase === 'bet' || phase === 'outcome')) {
          chipSel = (chipSel + (a === 'left' ? 4 : 1)) % 5;
          host.aria(chipSel < 4 ? T('mg.blackjack.chip', { money: money(chipVals[chipSel]) }) : T('mg.blackjack.clear'));
          controls();
          return;
        }
        if (pad && a === 'up' && (phase === 'bet' || phase === 'outcome')) { chip(chipSel); return; }
        if (a === 'stand' || a === 'double' || a === 'split') act(a);
      },
      pointer: function () {},
      /** "By the book": the current hand (or one dealt at the current bet) with basic strategy. */
      auto: function (rng) {
        if (phase === 'outcome') toBet();
        if (phase === 'bet' && !finished && canDeal().ok) {
          var st = live();
          if (B().validShoe(st && st.casino && st.casino.shoe)) sh = B().shoeOf(st, rng);
          tc = B().counts(sh).trueCount;
          r = B().deal(sh, bet, rng);
          pend();
        }
        if (r && (phase === 'bet' || phase === 'play' || phase === 'reveal')) {
          if (r.phase !== 'over') B().playBook(r, sh, rng);
          phase = 'reveal';
          revealAll();
          apply();
          if (phase === 'outcome') { revealAll(); }
        }
        finished = true;
        controls();
        var out = sessionResult();
        out.auto = true;
        return out;
      },
      replay: function () {},
      /**
       * Leaving now: the session so far, the stake of a hand still out, and the shoe past its cards.
       * A hand already decided (the dealer's cards still being turned over) is not abandoned: it is
       * applied as played first, so leaving then can never turn a win into a forfeit.
       */
      progress: function () {
        if (phase === 'reveal' && r && r.phase === 'over' && !finished) { revealAll(); apply(); }
        var o = sessionResult();
        o.live = liveStake();
        if (o.live) o.shoe = SR.util.clone(sh);
        return o;
      },
      peek: function () {
        return { phase: phase, bet: bet, limits: lim.slice(), chips: chipVals.slice(), round: r ? SR.util.clone(r) : null, vis: vis ? SR.util.clone(vis) : null,
          shoe: { pos: sh.pos, cut: sh.cut, running: sh.running, size: sh.cards.length }, session: sessionResult(), outcome: outcome ? outcome.key : null,
          barred: barred, finished: finished, pending: !!ownPending };
      },
      destroy: function () { /* a pending hand stays pending: forfeit / the Hardcore hook resolve it */ },
    };
  }

  SR.minigame.register('blackjack', {
    title: 'mg.blackjack.title',
    music: 'high_roller_lounge',
    keys: { hit: ['KeyH', 'Pad0'], stand: ['KeyS', 'Pad1'], double: ['KeyD', 'Pad2'], split: ['KeyP', 'Pad3'],
      chip1: ['Digit1'], chip2: ['Digit2'], chip3: ['Digit3'], chip4: ['Digit4'], chip5: ['Digit5'] },
    assist: false,
    confirmExit: true,
    create: create,
    /**
     * One hand by the book without the frame (the simulator): params.bet (default the table minimum)
     * on a copy of the state's shoe; `apply: true` so casino.settle applies it, and the shoe past the
     * hand's cards so casino.sessionEnd keeps it (the next sample deals new cards).
     * @returns {object} { game, net, rounds, wagered, apply, auto, shoe }
     */
    auto: function (state, params, rng) {
      var lim = limits(state), bet = Math.min(lim[1], Math.max(lim[0], Number(params && params.bet) || lim[0]));
      var out = { game: 'blackjack', net: 0, rounds: 0, wagered: 0, apply: true, auto: true };
      if (!state || !state.money || state.money.cash < bet) return out;
      var sh = B().shoeOf(state, rng), r = B().deal(sh, bet, rng);
      out.net = B().playBook(r, sh, rng);
      out.rounds = 1;
      out.wagered = B().wagered(r);
      out.shoe = sh;
      return out;
    },
    /** @returns {object} between hands nothing is at stake (a dealt hand writes its own pending). */
    worst: function () { return { net: 0, rounds: 0, wagered: 0, live: 0 }; },
    /** @returns {object} leaving mid-hand loses that hand's stake (`live`); otherwise the session as played. */
    forfeit: function (params, progress) {
      var p = progress || {}, stake = p.live || 0;
      var out = { net: (p.net || 0) - stake, rounds: p.rounds || 0, wagered: (p.wagered || 0) + stake, live: stake, exited: true };
      if (stake && p.shoe) out.shoe = p.shoe;   // the cards that hand used stay dealt
      return out;
    },
    /** @returns {string} the banner line. */
    summary: function (r, text) {
      var n = Math.round(Number(r && r.net) || 0);
      return text(n > 0 ? 'mg.blackjack.up' : n < 0 ? 'mg.blackjack.down' : 'mg.blackjack.even', { money: SR.text.money(Math.abs(n)) });
    },
  });
})();
