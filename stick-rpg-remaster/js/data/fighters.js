// js/data/fighters.js — owner: W1-C. SR.def.fighter: Sticky's ladder (GDD §6.3, n = 1-12; P0),
// the Underground Ring's masked regulars (P1 `nightlife`) and Red's goons (P1 `arcs`).
// A def is identity and content only: its name text key (fighter.<id>.name, en-conflict.js), the
// palette key of its head ('fighter.<n>', ART_AUDIO §2.3), one accessory (js/art/stick.js), a quirk
// and three taunt keys (taunt.<id>.*, en-night.js, W2-Night). The fight numbers (HP, power P, the
// ring's scaling) are SR.tuning.fight (BALANCE B-13) and are read by SR.rules.fight; a def may
// override them with `hp` / `P` (none does today).
//
// Quirks (GDD §6.3) are data the fight rules interpret (js/rules/fight.js); a quirk names its id
// and the rules take its sizes from SR.tuning.fight.quirks[id] (a def's own field would override):
//   miss        a fraction of the fighter's attacks miss (Wobbly Pete, `wobbly`: 30 %)
//   always      the fighter always uses this move (The Accountant: kick; data, not a number)
//   fireballOdds the fireball band of the enemy roll is this many times as wide (The Professor, `pyro`: ×2)
//   armor       the fighter takes this fraction less damage (Iron Irma, `iron`: 30 %)
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** Registers a ladder regular: n is the rung (1-12); its palette key is 'fighter.<n>'. */
  function regular(id, n, accessory, quirk) {
    SR.def.fighter(id, {
      n: n, name: 'fighter.' + id + '.name', palette: 'fighter.' + n, accessory: accessory,
      quirk: quirk || null, quirkText: quirk ? 'fighter.' + id + '.quirk' : null,
      taunts: ['taunt.' + id + '.1', 'taunt.' + id + '.2', 'taunt.' + id + '.3'],
      ladder: true, p: 0,
    });
  }

  regular('wobbly_pete', 1, 'beanie', { id: 'wobbly' });
  regular('big_lou', 2, 'chain');
  regular('the_accountant', 3, 'glasses', { id: 'kicker', always: 'kick' });
  regular('karate_kyle', 4, 'headband');
  regular('biker_barb', 5, 'sunglasses');
  regular('two_beers_ted', 6, 'cup');
  regular('mad_dog_morty', 7, 'capback');
  regular('the_professor', 8, 'mortarboard', { id: 'pyro' });
  regular('iron_irma', 9, 'hardhat', { id: 'iron' });
  regular('sergeant_stomp', 10, 'peakedcap');
  regular('bouncers_cousin', 11, 'headset');
  regular('old_man_knuckles', 12, 'fedora');   // the champion of Sticky's

  /** Registers a masked ring regular (palette 'fighter.0', a mask); bout k takes them in order. */
  function masked(id, order) {
    SR.def.fighter(id, {
      n: 0, name: 'fighter.' + id + '.name', palette: 'fighter.0', accessory: 'mask', quirk: null,
      taunts: ['taunt.' + id + '.1', 'taunt.' + id + '.2', 'taunt.' + id + '.3'],
      ring: true, order: order, p: 1, feature: 'nightlife',
    });
  }

  masked('the_stranger', 1);
  masked('paper_tiger', 2);
  masked('folded_fist', 3);
  masked('origami_ogre', 4);

  // Red's goons (GDD §6.2; B-26 red.credit): two forced fights at ladder rung tuning.fight.goons.n.
  SR.def.fighter('red_goon', {
    n: 0, name: 'fighter.red_goon.name', palette: 'fighter.6', accessory: 'hood', quirk: null,
    taunts: ['taunt.red_goon.1', 'taunt.red_goon.2', 'taunt.red_goon.3'],
    goon: true, p: 1, feature: 'arcs',
  });
})();
