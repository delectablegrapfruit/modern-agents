// js/data/buildings/bus.js — owner: W2-Transit. The bus depot (GDD §4.11, §6.1; UI §5.6): the
// building (Tabby at the ticket window, the song midnight_express, the depot interior), its one card
// row, the destination board (`bus.board`, js/ui/subscreens/bus.js), and Tabby's greeting, which is
// the departure clock ("Next red-eye in 9h 30m"; P0).
// The board's own rows (the red-eye per city, the P1 tours and "Wait for the tour bus") are the
// `trip` owner's actions in js/data/actions/trip.js, so they never show as card rows; the board
// previews and presents them, and the trip scene (js/scenes/bustrip.js) commits them.
// Pure data and named functions: no DOM, no platform RNG.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.building('bus', {
    name: 'place.bus', owner: 'tabby', portrait: 'tabby', music: 'midnight_express', interior: 'bus',
    greetings: ['greet.bus.wait'], groups: ['services'], exteriorId: 'bus', p: 0,
  });

  SR.def.action('bus.board', {
    building: 'bus', group: 'services', order: 10, icon: 'bus', label: 'act.bus.board', desc: 'desc.bus.board',
    p: 0, screen: 'bus.board',
  });

  /**
   * Tabby's greeting (the card reads the named fn greet.<buildingId>, CONTRACT §15.4): her trip
   * warnings first (GDD §6.2 "trip warnings"), then the departure clock. A bag at or over the bust
   * threshold (SR.rules.trade.bustThreshold: more than that is a bust anywhere, that many already in
   * Crayonburg), then goods with no loaded gun (a mugging, GDD §4.11 steps 2-3); at 00:00 the red-eye
   * is boarding; at the wall (24:00) the day's bus has gone; in the tour window (P1 `tours`) the tour
   * buses; from the Heat at which the police walk the streets (B-11d crime.police.appearHeat) a word
   * about customs; otherwise the time left until the next red-eye.
   * @returns {{key: string, vars: object}}
   */
  SR.def.fn('greet.bus', function (s) {
    var T = SR.tuning.time, now = s.clock.min, it = s.items || {};
    var goods = Math.max(it.booze || 0, it.snow || 0);
    var limit = SR.rules.trade && SR.rules.trade.bustThreshold ? SR.rules.trade.bustThreshold(s) : Infinity;
    if (goods > 0 && goods >= limit) return { key: 'greet.bus.heavy', vars: { n: limit } };
    if (goods > 0 && !((it.gun || 0) > 0 && (it.ammo || 0) > 0)) return { key: 'greet.bus.unarmed', vars: {} };
    if (now === T.redEyeDeparts) return { key: 'greet.bus.now', vars: {} };
    if (now >= T.dayEnd) return { key: 'greet.bus.late', vars: {} };
    var w = SR.tuning.bus.tour.window;
    if (SR.features.tours && now >= w[0] && now <= w[1]) return { key: 'greet.bus.tour', vars: {} };
    if (s.stats.heat >= SR.tuning.crime.police.appearHeat) return { key: 'greet.bus.heat', vars: {} };
    return { key: 'greet.bus.wait', vars: { left: SR.text.dur(T.dayEnd - now), time: SR.text.time(T.redEyeDeparts) } };
  });
})();
