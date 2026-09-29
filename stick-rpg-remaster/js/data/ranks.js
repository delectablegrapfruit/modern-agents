// js/data/ranks.js — owner: W2-RulesE (W1-E in wave 1). SR.def.rank: the end-of-game rank stamps of BALANCE B-18
// (GDD §4.19). A def names one cell of the rank table: `tier` is its row (0 = below $0; tier t ≥ 1
// is reached at net worth ≥ SR.tuning.endgame.ranks[t - 1]) and `column` is 'all' for the three
// shared rows, else 'neutral' | 'good' | 'evil' (karma > +20 good, < -20 evil, otherwise neutral;
// orig). The floors themselves live in tuning; every name is new (text keys rank.<id>).
// SR.rules.endgame.rank picks the cell of your tier and column.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  function rank(id, tier, column) { SR.def.rank(id, { name: 'rank.' + id, tier: tier, column: column, p: 0 }); }

  // The shared bottom rows: below $0, from $0, from $500.
  rank('in_the_red', 0, 'all');
  rank('flat_as_paper', 1, 'all');
  rank('crumpled', 2, 'all');

  // Tiers 3..12 (from $1,500 to $15,000,000): [neutral, good, evil].
  [
    ['stick_figure', 'nice_stick', 'troublemaker'],
    ['doodle', 'helping_hand', 'hoodlum'],
    ['sketch_artist', 'neighbourhood_hero', 'hustler'],
    ['go_getter', 'pillar_of_the_community', 'racketeer'],
    ['big_shot', 'humanitarian', 'crime_boss'],
    ['tycoon', 'beloved_benefactor', 'kingpin'],
    ['magnate', 'living_legend', 'overlord'],
    ['mogul', 'patron_of_the_page', 'supervillain'],
    ['paper_titan', 'guardian_angel', 'scourge_of_the_skies'],
    ['supreme_scribble', 'halo_incarnate', 'pure_red_menace'],
  ].forEach(function (row, i) {
    rank(row[0], i + 3, 'neutral');
    rank(row[1], i + 3, 'good');
    rank(row[2], i + 3, 'evil');
  });
})();
