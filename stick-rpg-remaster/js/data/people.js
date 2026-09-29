// js/data/people.js — owner: W2-Street. The named people of the street (GDD §6.2; ARCHITECTURE §7,
// §8.2; CONTRACT §3.1 `person`): who they are, how they look and sound, where they stand and when.
// Def: { id, name (text key person.<id>), look and portrait (SR.art.stick / SR.art.portraits person
// ids, ART_AUDIO §7), voice (a voice-blip sfx name or a pitch factor), schedule, idle ('sit' |
// 'stand' | 'pace': what they do at their spot; 'pace' walks the worldmap `people` path of that
// spot), facing (degrees clockwise from north while idle), barks (text keys a person calls out when
// you pass), gifts ({ item: action id }: what the Bag's Give runs while their dialog is open, GDD
// §6.4), p }.
// Schedule rows: [weekdays, from, to, placeId, cond?]: weekdays 'all' or a list of day names or
// indices (0 = Monday); from / to in clock minutes, from ≤ now < to (to 1440 includes 24:00; from >
// to wraps past midnight); placeId a worldmap `spots` name (or a building id: inside, not on the
// street); cond a condition list. The first row that holds places the person; a person no row
// places is not in the city (GDD §6.2). P0 rows only: the P1 changes of GDD §6.2 (Harold's bench
// and the McSticks counter, the skate bowl, New Guy, McHolland) are W3-Life's and W3-Crime's.
// Pure data (Node-loadable); js/world/streetnpcs.js reads it.
(function () {
  'use strict';
  var SR = window.SR;

  // Homeless Harold: Sticky's corner (2160, 2440), always (orig). He sits against the bar's wall,
  // legs out toward the street (facing east).
  SR.def.person('harold', {
    name: 'person.harold', look: 'harold', portrait: 'harold', voice: 'blip_low', p: 0,
    schedule: [['all', 0, 1440, 'haroldCorner']],
    idle: 'sit', facing: 90,
    barks: ['bark.harold.1', 'bark.harold.2', 'bark.harold.3'],
    gifts: { cash: 'street.harold.give10', booze: 'street.harold.giveBottle' },
  });

  // Skid, the smokes kid: the mansion corner (2090, 1110), always (orig); gone after the tenth pack.
  SR.def.person('kid', {
    name: 'person.kid', look: 'kid', portrait: 'kid', voice: 'blip_high', p: 0,
    schedule: [['all', 0, 1440, 'kidCorner', [['fn', 'street.here', 'kid']]]],
    idle: 'stand', facing: 180,
    barks: ['bark.kid.1', 'bark.kid.2', 'bark.kid.3'],
    gifts: { smokes: 'street.kid.givePack' },
  });

  // Red, the dealer: Dealer Alley, pacing X 2880-2960 at Y 3420, always (GDD §3.4, §6.2).
  SR.def.person('dealer', {
    name: 'person.dealer', look: 'dealer', portrait: 'dealer', voice: 0.8, p: 0,
    schedule: [['all', 0, 1440, 'dealerAlley']],
    idle: 'pace', facing: 180,
    barks: ['bark.dealer.1', 'bark.dealer.2', 'bark.dealer.3'],
    gifts: {},
  });
})();
