// js/data/buildings/home.js — owner: W2-Home. the home building in Live / Owned / For Sale modes and its actions (GDD §6.1).
// wave-1 slice placeholder, owner W2-Home (BUILD_PLAN §3.12; the lead at the wave-1 integration).
// Only what the grey-box vertical slice needs: the home building, whose Live mode lists two rows
// (ARCHITECTURE §7.3), Sleep and Messages. Sleep runs the night through the named fn home.sleep,
// which hands the night's Report to the UI as Result.report (CONTRACT §8.9); its preview skips the
// night. Messages opens home.messages (a W2-Home sub-screen, still a stub). Owned and For Sale list
// no rows yet; TV, Computer, Save, Tour and the greetings are W2-Home's. The owner replaces the
// whole file.
(function () {
  'use strict';
  /* stub, owner: W2-Home */
  var SR = window.SR;

  SR.def.building('home', {
    name: 'place.home', music: 'home_sweet_paper', groups: ['services'], greetings: [],
    modes: { live: ['home.sleep', 'home.messages'], owned: [], forSale: [] },
  });

  SR.def.action('home.sleep', {
    building: 'home', group: 'services', order: 10, icon: 'sleep', label: 'act.home.sleep', p: 0,
    timeRule: 'free', effects: [['fn', 'home.sleep']],
  });
  SR.def.action('home.messages', {
    building: 'home', group: 'services', order: 20, icon: 'messages', label: 'act.home.messages', p: 0,
    screen: 'home.messages',
  });

  /** Effect: the night (GDD §4.7); the Report goes to the report scene through Result.report. */
  SR.def.fn('home.sleep', function (s, params, ctx) {
    if (ctx && ctx.preview) return {};
    return { report: SR.rules.night.run(s, ctx, { kind: 'sleep' }) };
  });
})();
