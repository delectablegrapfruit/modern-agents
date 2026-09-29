// js/data/text/en-city.js — owner: W2-City. The city's own words (docs/CONTRACT.md §7): the
// pedestrians' one-line barks (bark.ped.*, ≤ 60 characters; P1, flag `cityReacts`, GDD §3.11: by
// context — bumped, karma band, a famous face, weather, time of day, and each archetype's own) and
// the three ambulance-chaser voicemails after a car hit (vm.carhit.1..3, ≤ 280; night step 11 sends
// one the next morning with vars { n, money, cheque }: 20 % of them carry a settlement cheque, and
// each reads naturally with or without one, the $0 being the lawyers' joke). All original writing.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.text({
    // Barks by context (P1).
    'bark.ped.bumped.1': 'Hey, watch the crease!',
    'bark.ped.bumped.2': 'Excuse you. I was walking here.',
    'bark.ped.bumped.3': 'Ow. You folded my elbow.',
    'bark.ped.good.1': 'Hi! Love what you do for this city!',
    'bark.ped.good.2': 'There goes the nicest stick on the sheet.',
    'bark.ped.good.3': 'My kid wants to be you when she\'s drawn.',
    'bark.ped.bad.1': 'Don\'t look at them. Keep walking.',
    'bark.ped.bad.2': 'Hold on to your wallets, people.',
    'bark.ped.bad.3': 'I\'m crossing the street. Twice.',
    'bark.ped.famous.1': 'Isn\'t that...? No way. Is it?',
    'bark.ped.famous.2': 'I saw you in the paper! The business pages!',
    'bark.ped.famous.3': 'Can I get a signature? On my hand is fine.',
    'bark.ped.rain.1': 'This rain goes straight through paper.',
    'bark.ped.rain.2': 'My umbrella is winning. For now.',
    'bark.ped.rain.3': 'Soggy again. Great.',
    'bark.ped.morning.1': 'Too early. Why is the sky so bright?',
    'bark.ped.morning.2': 'Coffee first, then the rest of my life.',
    'bark.ped.morning.3': 'Morning! Mind the edge, it moves.',
    'bark.ped.night.1': 'The stars look hand-drawn tonight.',
    'bark.ped.night.2': 'Late, huh? Same here.',
    'bark.ped.night.3': 'Who keeps leaving the moon on?',
    'bark.ped.office.1': 'Three meetings about one meeting. Classic.',
    'bark.ped.office.2': 'If anyone asks, I\'m at my desk.',
    'bark.ped.office.3': 'My tie is on too tight to think.',
    'bark.ped.student.1': 'I should be studying. I am walking.',
    'bark.ped.student.2': 'Finals are a myth my professor made up.',
    'bark.ped.student.3': 'My backpack weighs more than my grades.',
    'bark.ped.jogger.1': 'On your left! Wait, that\'s the edge.',
    'bark.ped.jogger.2': 'Lap twelve. Or two. I lost count.',
    'bark.ped.jogger.3': 'Can\'t stop. Momentum is everything.',
    'bark.ped.tourist.1': 'Is that the famous sky? It\'s so big!',
    'bark.ped.tourist.2': 'Say "paper"! Hold still, please.',
    'bark.ped.tourist.3': 'Which way to the edge? For photos.',
    'bark.ped.shopper.1': 'Everything\'s on sale if you squint.',
    'bark.ped.shopper.2': 'I only came out for one thing. Look.',
    'bark.ped.shopper.3': 'My bag has a bag inside it.',
    'bark.ped.nightowl.1': 'The night is young. I am not.',
    'bark.ped.nightowl.2': 'Glow stick says party. Legs say bed.',
    'bark.ped.nightowl.3': 'Is it still tonight or already tomorrow?',
    'bark.ped.busker.1': 'Tips welcome. Requests tolerated.',
    'bark.ped.busker.2': 'This next one is about a folded corner.',
    'bark.ped.busker.3': 'Thank you, thank you, you\'re too kind.',

    // The morning after a car hit (night step 11): the lawyers call. vars { n, money, cheque }.
    'vm.carhit.1': 'Hi, this is Crumple & Fold, attorneys at paper. We saw you meet a bumper yesterday. We squeezed the driver\'s insurer and won you {money}. Our fee took everything else. Next time you\'re flattened, think of us first!',
    'vm.carhit.2': 'Were you hit by a car? You were. We checked. Dent, Dent & Partners recovered {money} for your pain and suffering. If that looks small, so were your injuries. Stay in the road, friend. We\'ll be here.',
    'vm.carhit.3': 'This message is for the stick who got creased on the street. Settlement secured: {money}. Please hold for our jingle. Sue-per Lawyers, we never fold! That was the jingle. Goodbye.',
  });
})();
