// js/data/actions/hospital.js — owner: W2-Transit. Stick General's one row (GDD §4.16, §6.6;
// ARCHITECTURE §6.7): hospital.discharge acknowledges the bill card. The bill, the write-off and the
// hospital night have already run inside SR.rules.health.down when HP reached 0 (the day advanced,
// HP = 50 % of HP max, the clock at 12:00), so the discharge changes nothing in the rules: it is the
// action the card's button runs (action:done marks the moment the player leaves the ward) before the
// Stick General edition of the report and the city at the home door (js/scenes/hospital.js).
// Owner `hospital` (CONTRACT §8.2), free (timeRule 'free') and silent.
// Pure data: no DOM, no platform RNG.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.action('hospital.discharge', {
    building: 'hospital', group: 'special', order: 10, icon: 'home', label: 'act.hospital.discharge',
    desc: 'desc.hospital.discharge', p: 0, timeRule: 'free', silent: true,
    effects: [],
  });
})();
