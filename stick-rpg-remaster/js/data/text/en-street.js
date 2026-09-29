// js/data/text/en-street.js — owner: W2-Street. The text of the street cast (CONTRACT §7): Homeless
// Harold, Skid the smokes kid, Red the dealer and the junker on the apartment lawn (act.*, greet.*,
// card.*, toast.* of `street`, `harold`, `kid`, `dealer`, `junker`), their barks (bark.<npc>.*),
// their names (person.<id>, read by the dialog, the city's prompt and the answering machine), the
// original's street voicemail beat in new words (McHolland's call after the tenth pack,
// vm.mcholland.*) and the hotwire skin (mg.hotwire.*). Mel's day-1 job offer is W2-Food's
// `vm.mel.job` (en-food.js); W2-Street only queues it. Voice: dry, deadpan, cheerfully absurd, and
// the edgy beats played with cartoon distance (GDD §6.11). Limits: act ≤ 28, bark ≤ 60, toast ≤ 80,
// greet ≤ 140, vm ≤ 280, card ≤ 400 characters. Numbers arrive as vars ({money}, {price}, {n}).
(function () {
  'use strict';
  window.SR.def.text({
    // ---- names (the dialog's heading, "[E] Talk to …", the answering machine) -------------------
    'person.harold': 'Homeless Harold',
    'person.kid': 'Skid',
    'person.dealer': 'Red',
    'card.junker.name': 'An unlocked car',

    // ---- dialog rows (UI §5.7) -----------------------------------------------------------------------
    'act.street.talk': 'Talk',
    'act.street.jobOffer': 'The day-one job offer',
    'act.harold.give10': 'Give {money}',
    'act.harold.giveBottle': 'Give a bottle',
    'act.kid.givePack': 'Give a pack of smokes',
    'act.dealer.buy': 'Buy snow',
    'act.junker.hotwire': 'Try to hotwire it',
    'act.junker.ring': 'Feel for the right wires',
    'card.dealer.grams': 'Grams',
    'card.dealer.max': 'All I can carry',
    'card.dealer.afford': 'All I can afford',

    // ---- Homeless Harold ---------------------------------------------------------------------------
    'greet.harold.day': [
      'Spare a little change for a man the wind forgot?',
      'The sky ate my hat once. Still waiting for it to come back down.',
      'Anything that jingles, friend? Coins, keys, a sense of purpose?',
      'Lovely day for sitting. I\'ve been sitting since about Tuesday.',
    ],
    'greet.harold.night': [
      'Cold one tonight. The paper curls up at the corners when it gets cold.',
      'Still up? Me too. The lamp post and I are keeping each other company.',
    ],
    'greet.harold.friend': [
      'My favourite patron of the arts! The art is sitting right here. The art is me.',
      'Ah, my benefactor returns. I kept your bit of pavement warm.',
    ],
    'card.harold.first10': 'Well, bless your crinkly paper heart! Nobody\'s done that since the rain stopped. You\'ve got a real way with people, you know. It shows.',
    'card.harold.thanks10': [
      'Straight into my savings sock. The sock pays no interest, but it\'s warm.',
      'Much obliged. With this I can almost afford to look at a sandwich.',
      'I used to run a bank, you know. Well. I used to run past one, quite fast.',
      'Thank you kindly. It goes toward my retirement. I\'m retired now, mostly from having money.',
      'Bless you. Mind the edges out there. I went over once. Nice pilot, terrible snacks.',
      'Ten whole dollars! I\'ll have it framed. Then I\'ll spend the frame.',
      'The wind here only ever blows east. Everything I ever owned lives in the east now.',
      'Much appreciated. If you ever need advice on doing nothing at all, I\'m your man.',
    ],
    'card.harold.firstBottle': 'Oh, a cold one! My oldest and dearest friend! I\'d hug you, but I\'d drop it. You really know how to make a fellow feel special.',
    'card.harold.thanksBottle': [
      '*glug* Aaah. That\'s the good stuff. Well. It\'s the stuff.',
      '*hic* I\'m not tipsy. The city\'s leaning. It does that on Thursdays.',
      'Cheers! To you, to me, and to whoever\'s paying. That\'s you again.',
      '*hic* You\'re a kind soul. A tall, thin, two-dimensional kind soul.',
      'I\'ll save half of it for later. *glug* ...I\'ll save the bottle for later.',
      '*humming* A hundred bottles of pop on the wall... hang on, this isn\'t pop.',
      '*hic* Did the street always have two lamp posts? Never mind. Thank you. Both of you.',
    ],
    'bark.harold.1': 'Spare some change?',
    'bark.harold.2': 'Mind the edges, friend!',
    'bark.harold.3': 'Fine weather for sitting!',

    // ---- Skid, the smokes kid ----------------------------------------------------------------------
    'greet.kid.first': 'Yo! Hey! Got any smokes? I\'m totally old enough. My ID just, uh... blew off the edge. Happens all the time up here.',
    'greet.kid.again': [
      '*hack* Oh hey, it\'s you! My supplier. My hero. *wheeze*',
      'Dude! You came back! Got another pack? It\'s for science.',
    ],
    'greet.kid.worse': [
      '*cough cough* ...dude... *cough* ...got another one?',
      '*wheeze* Hey... hey. You\'re kinda blurry today. Cool shirt though.',
    ],
    'card.kid.firstPack': 'Sick! You\'re, like, the coolest grown-up ever. Here, take my board. I\'m way too busy smoking to skate anyway.',
    'card.kid.thanks': [
      'Rad. Totally rad. You\'re my favourite adult.',
      '*cough* Sweet. The kids at school are gonna think I\'m so mature.',
      'Thanks! My mom thinks I\'m at chess club. Chess club is a lot like this.',
      'Nice. Menthol next time, maybe? Just putting it out there.',
      '*puff* Awesome. I\'m gonna quit next week. Or the week after that.',
    ],
    'card.kid.cough': [
      '*HACK HACK* ...thanks... *wheeze* ...I\'m fine, it\'s just the paper dust.',
      '*cough* Dude... I can\'t feel my... *cough* ...anything. Thanks though.',
      '*wheeze* My voice is doing a thing. Is it doing a thing? *hack*',
      '*cough* Is the sky supposed to be spinning? Whatever. Thanks, man.',
    ],
    'card.kid.last': '*cough* ...thanks... dude... *wheeze* ...everything\'s going all... grey... and crumply... tell the skate bowl... I said... rad...',
    'toast.kid.skateboard': 'Skid gave you his skateboard!',
    'bark.kid.1': 'Psst! Got any smokes?',
    'bark.kid.2': 'Yo! Over here!',
    'bark.kid.3': 'Nice shoes, dude.',
    'vm.mcholland.kid': 'Detective McHolland. The kid on the mansion corner smoked himself clean off the page today, and a little bird says the packs came from you. I can\'t prove it. Yet. Don\'t leave the island, and find yourself a good lawyer.',

    // ---- Red, the dealer ---------------------------------------------------------------------------
    'greet.dealer.pitch': 'Psst. Over here, by the bins. Premium snow, fresh off the top shelf of the sky. {price} a gram, and you never saw me.',
    'greet.dealer.regular': [
      'My best customer. The usual? Don\'t answer that out loud.',
      'Back again. The alley missed you. The alley won\'t say it, but it did.',
    ],
    'card.dealer.sold': [
      '{n} g. Pleasure doing business. We never met, and neither did you.',
      'There you go, {n} g. Now walk normal. No, more normal than that.',
      'Done. If anybody asks, you were buying directions.',
    ],
    'bark.dealer.1': 'Psst. Over here.',
    'bark.dealer.2': 'Keep walking. Or don\'t.',
    'bark.dealer.3': 'Fresh snow. No questions.',

    // ---- the junker on the apartment lawn ----------------------------------------------------------
    'greet.junker.look': 'A yellow car sits on the lawn, doors unlocked. No keys, just a tangle of wires under the dashboard. Which one is which?',
    'greet.junker.smart': 'A yellow car sits on the lawn, doors unlocked. No keys, but you can see exactly which wire under the dash goes where.',
    'card.junker.failed': 'You pull every wire at once. The horn honks a little tune and the radio finds a talk show about gutters. Not even close. It would take a lot more brains than that.',
    'card.junker.started': 'Red to blue, blue to yellow... the engine coughs, then purrs like a paper tiger. It\'s yours now. Walk up to it and hop in.',
    'card.junker.alarm': 'Wrong wire! The alarm wails like a kettle at a funeral. Somebody will remember that. Best leave it for today.',
    'card.junker.gaveUp': 'You back away from the wires. They win this round.',
    'toast.junker.yours': 'The junker is yours. Walk up to it to get in.',
    'toast.junker.alarm': 'The car alarm went off.',

    // ---- the hotwire skin (Timing Ring) ------------------------------------------------------------
    'mg.hotwire.title': 'Hotwire',
    'mg.hotwire.subtitle': 'Three sparks start it',
  });
})();
