// js/data/buildings/casino.js — owner: W2-Night. The Silver Lining Casino: the building, its rows
// and their :resolve actions (GDD §6.1, §4.13; BALANCE B-14a-c). Gambling takes no time (orig).
//   Rows (P0): Paper Jackpot slots, blackjack, roulette. Each opens its engine (js/minigames/
//   slots.js, blackjack.js, roulette.js) with the `open` effect; the VIP desk (casino.vip) is
//   W3-Nightlife's (P1).
//   Rounds: the engines apply every round the moment it is decided, through SR.act on the round
//   actions below (CONTRACT §8.10: casino.slotsSpin { bet }, casino.bjHand { round, shoe,
//   trueCount }, casino.rouletteSpin { bets }), and read the round's facts from the Result's
//   `gamble` event. Round actions are minigame resolutions: ids ending in `:resolve`
//   (timeRule 'free', never card rows; CONTRACT §8.2), one per decided round.
//   Session resolves (casino.<game>:resolve, params = the engine's result { net, ... }): nothing
//   left to pay for a played session (its rounds were applied); casino.settle applies a sampled
//   session (`apply: true`, SR.minigame.auto in the simulator); casino.sessionEnd applies a
//   blackjack hand abandoned mid-play (`live`: its stake is lost, its cards stay dealt: `shoe`),
//   keeps a sampled blackjack session's shoe and hand count, and says how the visit went.
// Karma -1 per pull, spin and hand, at most -10 a day; VIP points (P1) and the `gamble` event are
// SR.rules.casino.applyRound's. Proprietor: Lucky Lou (pit boss). Pure data and named fns.
(function () {
  'use strict';
  var SR = window.SR;

  var GAMES = ['slots', 'blackjack', 'roulette'];
  // Greeting hours (UI §5.6 flavour, not balance). The other thresholds are SR.tuning's, read when
  // Lou speaks: VIP Silver's points (B-14d), the smallest bet (B-14a/b), Angelic karma (B-04b).
  var LATE_FROM = 22 * 60, LATE_TO = 4 * 60;

  function partial() { return SR.rules.effects.partial(); }
  function tune(path) {
    var v = SR.tuning;
    String(path).split('.').forEach(function (k) { v = v === undefined || v === null ? undefined : v[k]; });
    return v;
  }

  /**
   * Keeps a blackjack shoe the engine hands back (a hand abandoned mid-play, a sampled Auto): the
   * cards it dealt stay dealt. A hole card still face down is turned over as the dealer sweeps the
   * hand, so the Hi-Lo running count takes it in (B-14b; the Card Sharp readout stays true).
   */
  function keepShoe(s, shoe) {
    var C = SR.rules.casino;
    if (!shoe || !C.bj.validShoe(shoe)) return;
    var sh = SR.util.clone(shoe);
    if (typeof sh.hole === 'number' && sh.hole >= 0) { sh.running += C.bj.hilo(sh.hole); sh.hole = -1; }
    s.casino.shoe = sh;
  }

  /**
   * Effect of casino.<game>:resolve after casino.settle: a blackjack hand left mid-play loses its
   * stake (`live`, from the engine's forfeit or Hardcore's pending worst: B-14b hand, karma, hand
   * count), then one toast for the visit's net when any round was played.
   * @param {string} game 'slots' | 'blackjack' | 'roulette'
   * @returns {object} a partial Result
   */
  SR.def.fn('casino.sessionEnd', function (s, params, ctx, game) {
    params = params || {};
    var res = partial(), C = SR.rules.casino;
    var live = Math.max(0, Math.floor(Number(params.live) || 0));
    if (game === 'blackjack' && params.apply && C) {
      // A sampled session (SR.minigame.auto: the simulator) was applied by casino.settle; its hands
      // count toward the 60-hand day and its shoe moves on, so the next sample deals new cards.
      s.daily.bjHands = (s.daily.bjHands || 0) + Math.max(0, Math.floor(Number(params.rounds) || 0));
      keepShoe(s, params.shoe);
    }
    if (game === 'blackjack' && live > 0 && C && !params.apply) {
      // The abandoned hand's cards stay dealt: its shoe replaces the state's, so leaving and coming
      // back never re-deals cards you have seen.
      keepShoe(s, params.shoe);
      var lost = Math.min(live, s.money.cash);
      s.daily.bjHands = (s.daily.bjHands || 0) + 1;
      var r = C.applyRound(s, 'blackjack', live, -lost, { hands: s.daily.bjHands, forfeit: true });
      Array.prototype.push.apply(res.events, r.events || []);
      Array.prototype.push.apply(res.log, r.log || []);
      res.toasts.push({ key: 'toast.casino.forfeit', vars: { n: lost, money: SR.text.money(lost) }, kind: 'warning' });
    }
    var rounds = Number(params.rounds || params.hands || params.spins || 0);
    if (rounds > 0 || params.net) {
      var net = Math.round(Number(params.net) || 0);
      var key = net > 0 ? 'toast.casino.up' : net < 0 ? 'toast.casino.down' : 'toast.casino.even';
      res.toasts.push({ key: key, vars: { n: Math.abs(net), money: SR.text.money(Math.abs(net)) }, kind: net > 0 ? 'reward' : 'info' });
    }
    return res;
  });

  /**
   * The greeting (UI §5.6): the back-off, a big day, an empty wallet, karma, the hour; else one of
   * the plain lines.
   * @returns {{key: string, vars: object}}
   */
  SR.def.fn('greet.casino', function (s, params, ctx) {
    var c = s.casino || {}, min = s.clock.min;
    var pick = function (list) { return list[ctx && ctx.rng ? ctx.rng.int(0, list.length - 1) : 0]; };
    if (SR.features.nightlife && s.clock.day < (c.barredUntil || 0)) return { key: 'greet.casino.barred', vars: {} };
    var whale = Number(tune('casino.vip.silver.points')) || Infinity;
    var smallest = Math.min((tune('casino.slots.bets') || [Infinity])[0], Number(tune('casino.bj.minimum')) || Infinity);
    var angelic = Number(tune('karma.tiers.angelic'));
    if ((c.winToday || 0) > 0 || (SR.features.nightlife && (c.points || 0) >= whale)) return { key: 'greet.casino.whale', vars: {} };
    if (s.money.cash < smallest) return { key: 'greet.casino.broke', vars: {} };
    if (!isNaN(angelic) && s.stats.karma >= angelic) return { key: 'greet.casino.saint', vars: {} };
    if (min >= LATE_FROM || min < LATE_TO) return { key: 'greet.casino.late', vars: {} };
    return { key: pick(['greet.casino.1', 'greet.casino.2', 'greet.casino.3', 'greet.casino.4']), vars: {} };
  });

  SR.def.building('casino', {
    name: 'place.casino', owner: 'lou', portrait: 'lou', music: 'high_roller_lounge', interior: 'casino',
    exteriorId: 'casino', groups: ['special'],
    greetings: ['greet.casino.1', 'greet.casino.2', 'greet.casino.3', 'greet.casino.4'],
  });

  var ICONS = { slots: 'slots', blackjack: 'blackjack', roulette: 'roulette' };
  var ROUND = { slots: ['pull', 'casino.slotsSpin'], blackjack: ['hand', 'casino.bjHand'], roulette: ['spin', 'casino.rouletteSpin'] };

  GAMES.forEach(function (game, i) {
    // The row: opens the table (casino.canPlay: blackjack's back-off (P1) and 60 hands a day, cash
    // for the smallest bet). No time: gambling takes none (orig).
    SR.def.action('casino.' + game, {
      building: 'casino', group: 'special', order: 10 + i * 10, icon: ICONS[game], label: 'act.casino.' + game,
      desc: 'desc.casino.' + game, p: 0,
      requires: [['fn', 'casino.canPlay', game]],
      effects: [['open', game, {}]],
    });
    // The session's resolve: the engine's { net, ... } (its rounds are already applied).
    SR.def.action('casino.' + game + ':resolve', {
      building: 'casino', p: 0, timeRule: 'free',
      effects: [['fn', 'casino.settle'], ['fn', 'casino.sessionEnd', game]],
    });
    // One decided round (the engines call it; never a card row).
    SR.def.action('casino.' + game + '.' + ROUND[game][0] + ':resolve', {
      building: 'casino', p: 0, timeRule: 'free',
      effects: [['fn', ROUND[game][1]]],
    });
  });
})();
