// js/data/actions/jail.js — owner: W2-Transit (W3-Crime in wave 3). The Jail Day card's rows (GDD
// §4.10, §6.6; BALANCE B-11c; CONTRACT §8.10):
//   jail.day    the day's choice (params { choice: 'str' | 'int' | 'cha' | 'hp' }): Work out +2 STR,
//               Read +2 INT, Make friends +2 CHA (P1 `tours`: +1 reputation in a random city), Keep
//               your head down +10 HP; then the jail night (the economy runs, no restore, no
//               furniture; daysLeft - 1); released at 08:00 when daysLeft reaches 0 (Heat 20, the
//               `release` rule event). The Result carries the night's Report (`report`, kind 'jail').
//   jail.bail   P1 `police`: call a lawyer (needs a phone): the remaining days × the per-day bail
//               stored at arrest, cash first, then the bank; released at once.
// Owner `jail` (CONTRACT §8.2): never a card row; the jail scene (js/scenes/jail.js) shows them on
// the Jail Day card (js/ui/screens/jail.js). Both run whatever the clock says (timeRule 'free'): the
// day in the cell is the night's, not the wall's.
// Pure data: no DOM, no platform RNG.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.action('jail.day', {
    building: 'jail', group: 'special', order: 10, icon: 'time', label: 'act.jail.day',
    p: 0, timeRule: 'free',
    effects: [['fn', 'crime.jailDay']],
  });

  SR.def.action('jail.bail', {
    building: 'jail', group: 'special', order: 20, icon: 'bail', label: 'act.jail.bail', desc: 'desc.jail.bail',
    p: 1, feature: 'police', timeRule: 'free',
    requires: [['fn', 'crime.canBail']],
    effects: [['fn', 'crime.payBail']],
  });
})();
