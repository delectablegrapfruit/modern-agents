// js/data/buildings/mcsticks.js — owner: W2-Food. McSticks: building, actions, :resolve actions (GDD §6.1).
// wave-1 slice placeholder, owner W2-Food (BUILD_PLAN §3.12; the lead at the wave-1 integration).
// Only what the grey-box vertical slice needs: the building and two rows, Fries (B-06: $12, less
// B-28a's employee discount through priceTarget; +20 HP; 30 m) and Work (a Full shift through
// jobs.work on the mcsticks track: B-05, $42, 6 h, +1 karma). The other food, takeout, the
// Half / Overtime variants, the Order Up hustle, greetings and Mel are W2-Food's. The owner
// replaces the whole file.
(function () {
  'use strict';
  /* stub, owner: W2-Food */
  var SR = window.SR;

  SR.def.building('mcsticks', { name: 'place.mcsticks', owner: 'mel', portrait: 'mel', music: 'fry_day', groups: ['eat', 'work'], greetings: [] });

  SR.def.action('mcsticks.fries', {
    building: 'mcsticks', group: 'eat', order: 20, icon: 'fries', label: 'act.mcsticks.fries', p: 0,
    cost: { cash: 12, min: 30 }, priceTarget: 'food.mcsticks.fries', requires: [['hpBelowMax']],
    effects: [['heal', 20], ['emit', 'eat', { item: 'fries', hp: 20, where: 'mcsticks' }], ['sfx', 'eat'], ['anim', 'eat']],
    repeatable: true,
  });
  SR.def.action('mcsticks.work', {
    building: 'mcsticks', group: 'work', order: 10, icon: 'work', label: 'act.mcsticks.work', p: 0,
    cost: { min: 'shift.min' }, requires: [['jobTrack', 'mcsticks']], effects: [['fn', 'jobs.work', 'mcsticks']],
  });
})();
