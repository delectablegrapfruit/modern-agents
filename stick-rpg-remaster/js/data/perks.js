// js/data/perks.js — owner: W2-RulesE (W1-R in wave 1; W3-Prog in wave 3). SR.def.perk: the 24 stat-milestone perks of
// GDD §4.14 (P1, flag `perks`). Each milestone (a stat reaching 100, 250, 450 or 700) offers its two
// perks; their rule values are SR.tuning.perks (BALANCE B-21), their text perk.<id>.name / .desc
// (en-prog.js). The icon is the stat's icon (ART_AUDIO §10). Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // [id, stat, level] in GDD §4.14 order: the two perks of each milestone are listed together.
  var PERKS = [
    ['ironStomach', 'str', 100], ['hardLanding', 'str', 100],
    ['brawler', 'str', 250], ['packMule', 'str', 250],
    ['intimidating', 'str', 450], ['marathoner', 'str', 450],
    ['secondWind', 'str', 700], ['heavyHitter', 'str', 700],
    ['speedReader', 'int', 100], ['couponClipper', 'int', 100],
    ['marketSense', 'int', 250], ['tinkerer', 'int', 250],
    ['workaholic', 'int', 450], ['cardSharp', 'int', 450],
    ['mastermind', 'int', 700], ['taxWizard', 'int', 700],
    ['regular', 'cha', 100], ['smoothTalker', 'cha', 100],
    ['silverTongue', 'cha', 250], ['fastTalker', 'cha', 250],
    ['networker', 'cha', 450], ['crowdPleaser', 'cha', 450],
    ['magnetic', 'cha', 700], ['charmingRogue', 'cha', 700],
  ];

  PERKS.forEach(function (p) {
    SR.def.perk(p[0], {
      stat: p[1],
      level: p[2],
      name: 'perk.' + p[0] + '.name',
      desc: 'perk.' + p[0] + '.desc',
      icon: p[1],
      rule: 'perks.' + p[0],            // SR.tuning.perks.<id>
      p: 1,
      feature: 'perks',
    });
  });
})();
