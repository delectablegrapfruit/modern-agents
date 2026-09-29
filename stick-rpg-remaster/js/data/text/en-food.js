// js/data/text/en-food.js — owner: W2-Food. The text of McSticks and Funkytown Five-O (CONTRACT §7):
// act.*, greet.*, toast.*, card.* of `mcsticks` and `store`; Manager Mel's voicemails (vm.mel.*) and
// Dee's barks (bark.dee.*); the minigame text of `orderup`, `holdup` and `scratch`
// (mg.orderup.*, mg.holdup.*, mg.scratch.*). Voice: dry, deadpan, cheerfully absurd (GDD §6.11).
// Limits: act ≤ 28, bark ≤ 60, toast ≤ 80, greet ≤ 140, vm ≤ 280, card ≤ 400 characters.
(function () {
  'use strict';
  window.SR.def.text({
    // ---- McSticks rows -------------------------------------------------------------------------
    'act.mcsticks.milkshake': 'Milkshake',
    'act.mcsticks.fries': 'Fries',
    'act.mcsticks.cheeseburger': 'Cheeseburger',
    'act.mcsticks.tripleburger': 'Triple Burger',
    'act.mcsticks.megameal': 'Mega Meal',
    'act.mcsticks.work': 'Work a shift',
    'act.mcsticks.promote': 'Ask for promotion',

    // ---- Manager Mel's greetings (UI §5.6) -------------------------------------------------------
    'greet.mcsticks.newHire': [
      'You must be the new hire. Paper hat on the hook, fryer by the wall. The fryer bites. Metaphorically.',
      'Welcome aboard! Our motto is "Everything tastes better on a stick." We are still testing the soup.',
    ],
    'greet.mcsticks.default': [
      'Fries are a vegetable if you squint.',
      'Welcome to McSticks. Our food is fast, our napkins are faster.',
      'Order up! Or down. We are flexible about direction.',
      'The ice cream machine works today. I will not be taking questions.',
    ],
    'greet.mcsticks.morning': [
      'Breakfast rush is two people and a pigeon. You make three.',
      'Morning! The fryer has been awake since four. It has opinions.',
    ],
    'greet.mcsticks.late': [
      'We never close. The fryer won\'t let us.',
      'Late shift crowd: you, me and whatever is humming in the walk-in.',
    ],
    'greet.mcsticks.hungry': [
      'You look like a "before" picture. Sit down. Eat something.',
      'Pale as a napkin. The Triple Burger has your name on it. Well, a number.',
    ],
    'greet.mcsticks.manager': [
      'Morning, boss. Co-boss. Me-boss, you-slightly-smaller-boss.',
      'Clipboard\'s by the register. Try to look worried, it helps.',
    ],
    'greet.mcsticks.moonlight': [
      'Back from the office tower? The fryer missed you. I did not. Okay, a bit.',
      'Big-shot job and you still smell of fries. I respect that.',
    ],
    'greet.mcsticks.rain': [
      'Rain is great for business. Nobody likes eating in a puddle.',
    ],
    'greet.mcsticks.good': [
      'Our favourite customer! Don\'t let it go to your head. It\'s already full of fries.',
    ],
    'greet.mcsticks.bad': [
      'Cash up front, please. Nothing personal. Okay, slightly personal.',
    ],

    // ---- McSticks feedback and the interior's signs -----------------------------------------------
    'toast.mcsticks.takeout': 'Bagged to go: {item}. It keeps until you or a friend needs it',
    'card.mcsticks.poster': 'FRY DAY IS EVERY DAY',
    'card.mcsticks.slogan': 'NOW WITH MORE STICK',

    // ---- Manager Mel's voicemails (GDD §6.2, §6.8) -----------------------------------------------
    // vm.mel.job is the day-1 job offer (new text for the orig premise); W2-Street queues it.
    'vm.mel.job': 'Hi, it\'s Mel from McSticks! Your application blew in through the window. Everything blows in up here. You\'re hired as our Fry Cook, paper hat included. Drop by any time, we never close. The fryer is waiting. It is always waiting.',
    'vm.mel.firstShift': 'Mel here. First shift and only one small fire. We put it on the menu as a special, so technically a win. Proud of you! Come back whenever. The fryer asked about you, which is new for the fryer.',
    'vm.mel.promoted': 'Mel again! You\'re Shift Manager now: a clipboard, a slightly taller hat and the keys to the walk-in. Please don\'t lock yourself in this time. We had to explain that to the health inspector with a diagram.',

    // ---- Funkytown Five-O rows -------------------------------------------------------------------
    'act.store.slushee': 'Slushee',
    'act.store.candybar': 'Candy bar',
    'act.store.nachos': 'Nachos',
    'act.store.smokes': 'Smokes (a pack)',
    'act.store.pills': 'Caffeine pills',
    'act.store.gum': 'Gum',
    'act.store.scratch': 'Buy a scratch card',
    'act.store.scratchPlay': 'Scratch a card',
    'act.store.paper': 'Read The Daily Fold',
    'act.store.rob': 'Rob the place',

    // ---- Dee's greetings (UI §5.6), robbery reactions included ------------------------------------
    'greet.store.first': [
      'Welcome to Five-O. Slushees are cold, nachos are warm, the fridge light is dramatic.',
    ],
    'greet.store.default': [
      'Buy something or loiter professionally.',
      'Five-O: open all night, like my eyes.',
      'The slushee machine is feeling blue today. Also red. Two flavours.',
      'If it fits in a pocket, we sell it. Please pay for the pocket.',
    ],
    'greet.store.morning': [
      'Morning. Nachos are not a breakfast food, but I won\'t tell.',
    ],
    'greet.store.late': [
      'It\'s late. The slushee machine and I are both running on fumes.',
      'Night shift. I\'ve read every label in the store twice.',
    ],
    'greet.store.rain': [
      'Umbrellas are sold out. We never had any. Have a candy bar.',
    ],
    'greet.store.good': [
      'Oh, it\'s you! The nice one. Take a free napkin. Take two.',
    ],
    'greet.store.bad': [
      'I\'ve got my eye on you. The other eye is on the alarm.',
    ],
    'greet.store.hot': [
      'Is that a siren or just my ears? Either way, buy quickly.',
    ],
    'greet.store.armed': [
      'Is that a gun in your pocket or... no, it\'s a gun. Just browsing?',
      'Nice pocket. Very heavy-looking pocket. Welcome to Five-O.',
    ],
    'greet.store.robbed': [
      'Oh. You. I moved the alarm button closer. Just so you know.',
      'Hands where I can see them. Kidding. Unless.',
    ],
    'greet.store.forgiven': [
      'I forgave you. The security camera did not.',
    ],

    // ---- Five-O feedback, Dee's barks and the interior's signs -----------------------------------
    'toast.store.paper': 'The Daily Fold, cover to cover. You feel informed and slightly inky',
    'toast.store.scratchWin': 'Three of a kind! Dee counts out {money} with a sigh',
    'toast.store.scratchLose': 'No match. Dee drops the card in the jar of lost hopes',
    'bark.dee.robWin': 'Take it! Take the gum too! Just go!',
    'bark.dee.robLose': 'The alarm\'s been on since you walked in.',
    'card.store.sign': 'SLUSHEE',
    'card.store.poster': 'LOITER RESPONSIBLY',
    'card.store.camera': 'SMILE',

    // ---- Order Up (the cook's hustle; Shift Rush skin, GDD §6.5) ----------------------------------
    'mg.orderup.title': 'Order Up!',
    'mg.orderup.subtitle': 'McSticks kitchen',
    'mg.orderup.bun': 'Bun',
    'mg.orderup.patty': 'Patty',
    'mg.orderup.cheese': 'Cheese',
    'mg.orderup.lettuce': 'Lettuce',
    'mg.orderup.fries': 'Fries',
    'mg.orderup.shake': 'Shake',

    // ---- Hold-up (robberies; Duel skin, GDD §4.10, B-30) ------------------------------------------
    'mg.holdup.title': 'Hold-up',
    'mg.holdup.intimidate': 'Intimidate',
    'mg.holdup.sweetTalk': 'Sweet-talk',
    'mg.holdup.outwit': 'Outwit',
    'mg.holdup.clerk': 'Dee, the clerk',
    'mg.holdup.teller': 'The teller',
    'mg.holdup.store.1': 'Dee looks up from a crossword. "Seven letters, means trouble?" You have an answer.',
    'mg.holdup.store.2': 'Dee\'s hand drifts under the counter. Toward the alarm, or the gum. Hard to say.',
    'mg.holdup.store.3': 'A customer walks in, sees you, and walks straight back out. Dee is thinking fast.',
    'mg.holdup.bank.1': 'The teller\'s smile freezes. "Deposit or withdrawal?" Very much the second one.',
    'mg.holdup.bank.2': 'A guard stirs by the ferns. The line behind you studies the ceiling.',
    'mg.holdup.bank.3': 'The vault door swings half open. Everyone is waiting to see who blinks.',
    'mg.holdup.hands': 'HANDS UP',

    // ---- Scratch card (P1; the scratch engine, B-14e) ---------------------------------------------
    'mg.scratch.title': 'Scratch card',
    'mg.scratch.card': 'LUCKY FOLD',
    'mg.scratch.rule': 'Match three to win',
    'mg.scratch.sym.prize': '{money}',                 // a prize symbol: its B-14e amount from the tuning
    'mg.scratch.sym.cloud': 'Cloud',
    'mg.scratch.sym.star': 'Star',
    'mg.scratch.sym.crane': 'Paper crane',
    'mg.scratch.panel': 'Panel {n}: {symbol}.',
    'mg.scratch.left': '{n} to scratch',
    'mg.scratch.done': 'All scratched',
    'mg.scratch.win': 'Three of a kind: you win {money}!',
    'mg.scratch.lose': 'No match this time.',
    'mg.scratch.summary': 'Card: {money} back',
    'mg.scratch.hint.scratch': 'Scratch the next panel',
    'mg.scratch.hint.panel': 'Scratch a panel',
    'mg.scratch.hint.drag': 'Drag to scratch',
  });
})();
