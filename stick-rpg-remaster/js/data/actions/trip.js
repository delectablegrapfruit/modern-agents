// js/data/actions/trip.js — owner: W2-Transit (W3-Crime in wave 3). The Sky Bus trips (GDD §4.1,
// §4.11; BALANCE B-01, B-12; CONTRACT §8.10): the rows the destination board (`bus.board`) previews
// and the trip scene (js/scenes/bustrip.js) commits, and the decisions of the trip's event card.
//   trip.redeye       the red-eye to a city (params { city, kind: 'smuggle' }): boards only at 00:00
//                     (timeRule 'trip' reads params.kind; reason.redEye), the ticket as the row's
//                     cost (cost.cash 'trade.ticket', so trade.smuggle does not take it again), then
//                     SR.rules.trade's original check order; an offer waits in state.trade.offer
//   trip.take         take the buyer's offer (-5 karma, +5 Heat per 10 units, the cash)
//   trip.haggle       P1 `tours`: chance(CHA, 150) for +12 %, or the buyer walks
//   trip.walk         walk away from the offer
//   trip.tour         P1 `tours`: a speaking tour (params { city, kind: 'tour' }, 06:00-10:00), which
//                     opens the `tourhook` skin; trip.tour:resolve pays it (trade.tour)
//   bus.wait          P1 `tours`: "Wait for the tour bus" on the board before 06:00 sets the clock to
//                     06:00 (B-01 time.waitTour), nothing else
// Every row has owner `trip` (CONTRACT §8.2), so none is ever a card row of the depot. The final
// outcomes arrive as the `trip` rule event with the story's text key and vars (CONTRACT §8.9); a
// bust jails at once (the arrest night runs inside trade.smuggle; Result.jailed and .report).
// Pure data and named functions: no DOM, no platform RNG.
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {number} the minute "Wait for the tour bus" sets (B-01 time.waitTour, 06:00). */
  SR.def.fn('trip.waitUntil', function () { return SR.tuning.time.waitTour; });

  /**
   * A condition: the tour buses have not started boarding yet (now < time.waitTour), so waiting
   * for them makes sense. @returns {{ok: boolean, reason: (string|null), vars: (object|null)}}
   */
  SR.def.fn('trip.beforeTours', function (s) {
    var at = SR.tuning.time.waitTour;
    return s.clock.min < at ? { ok: true, reason: null, vars: null }
      : { ok: false, reason: 'reason.notAfter', vars: { time: SR.rules.time.fmt(at) } };
  });

  SR.def.action('trip.redeye', {
    building: 'trip', group: 'special', order: 10, icon: 'redeye', label: 'act.trip.redeye', desc: 'desc.trip.redeye',
    p: 0, timeRule: 'trip', confirm: 'card.trip.confirmRedeye',
    cost: { cash: 'trade.ticket' },
    requires: [['fn', 'trade.canBoard', 'smuggle']],
    effects: [['fn', 'trade.smuggle']],
  });

  SR.def.action('trip.take', {
    building: 'trip', group: 'special', order: 20, icon: 'money', label: 'act.trip.take', desc: 'desc.trip.take',
    p: 0, timeRule: 'free',
    effects: [['fn', 'trade.take']],
  });

  SR.def.action('trip.haggle', {
    building: 'trip', group: 'special', order: 30, icon: 'cha', label: 'act.trip.haggle', desc: 'desc.trip.haggle',
    p: 1, feature: 'tours', timeRule: 'free',
    effects: [['fn', 'trade.haggle']],
  });

  SR.def.action('trip.walk', {
    building: 'trip', group: 'special', order: 40, icon: 'leave', label: 'act.trip.walk', desc: 'desc.trip.walk',
    p: 0, timeRule: 'free',
    effects: [['fn', 'trade.walk']],
  });

  SR.def.action('trip.tour', {
    building: 'trip', group: 'special', order: 50, icon: 'tour', label: 'act.trip.tour', desc: 'desc.trip.tour',
    p: 1, feature: 'tours', timeRule: 'trip', confirm: 'card.trip.confirmTour',
    cost: { cash: 'trade.ticket' },
    requires: [['fn', 'trade.canBoard', 'tour']],
    effects: [['fn', 'trade.tourStart']],
  });

  SR.def.action('trip.tour:resolve', {
    building: 'trip', group: 'special', order: 51, icon: 'tour', label: 'act.trip.tour',
    p: 1, feature: 'tours', timeRule: 'free',
    effects: [['fn', 'trade.tour']],
  });

  SR.def.action('bus.wait', {
    building: 'trip', group: 'special', order: 60, icon: 'time', label: 'act.bus.wait', desc: 'desc.bus.wait',
    p: 1, feature: 'tours', timeRule: 'free',
    hidden: [['not', ['fn', 'trip.beforeTours']]],
    effects: [['setTime', 'trip.waitUntil']],
  });
})();
