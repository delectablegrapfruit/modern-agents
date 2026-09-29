// js/data/text/en-goods.js — owner: W2-Goods. Text for the pawn shop and Fine Line Furnishings
// (GDD §6.1, §6.2): the card rows (act.pawn.*, act.furniture.*), Vinnie's and Sofia's greetings
// (greet.pawn.*, greet.furniture.*), the purchase toasts (toast.pawn.*, toast.furniture.*), the
// sub-screen titles (sub.pawn.shop, sub.furniture.browse) and the counter's and the showroom's
// lines (card.pawn.*, card.furniture.*). Numbers arrive as {vars} from SR.tuning (BALANCE B-01,
// B-06, B-07, B-08b, B-12, B-13: the tables the rules read), never written into a line; item and
// piece names are en-econ.js's (item.*, furn.*), home names home.<tier>.
// Limits (CONTRACT §7): act ≤ 28, greet ≤ 140, toast ≤ 80, card ≤ 400.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.text({
    // ---- the pawn shop: card rows ----
    'act.pawn.knife': 'Buy a knife',
    'act.pawn.gun': 'Buy a hand gun',
    'act.pawn.ammo': 'Buy a box of ammo',
    'act.pawn.alarm': 'Buy a CD alarm clock',
    'act.pawn.phone': 'Buy a cell phone',
    'act.pawn.knuckles': 'Buy brass knuckles',
    'act.pawn.vest': 'Buy a kevlar vest',
    'act.pawn.skateboard': 'Buy a used skateboard',
    'act.pawn.shirt': 'Buy a clean shirt',
    'act.pawn.counter': 'Browse the counter',
    'act.pawn.sell': 'Sell to Vinnie',

    // ---- Vinnie (the card picks one by time, karma, weather and what you carry) ----
    'greet.pawn.plain': [
      'Welcome in. Everything here has a past, and none of it is any of your business.',
      'Vinnie. Pleasure. Browse all you like, just keep your elbows off the glass.',
      'You buy, I sell, nobody takes notes. No questions asked. That is the whole system.',
      'Fresh stock this week. Well. Fresh to you.',
    ],
    'greet.pawn.night': 'Late shopper, huh? I keep the lights low and my memory lower.',
    'greet.pawn.evil': 'Ah, a professional. The serious merchandise is behind the glass.',
    'greet.pawn.good': 'You look like somebody who returns shopping carts. Weird. Welcome anyway.',
    'greet.pawn.rain': 'Wipe your feet. The merchandise does not like puddles and neither do I.',
    'greet.pawn.ammo': 'I hear an empty clip from across the street. Ammo comes by the box.',
    'greet.pawn.vest': 'You have been doing some time, huh? A vest will not keep you out. It might keep you in one piece.',

    // ---- the pawn shop: toasts after a purchase (one-off items teach what they do) ----
    'toast.pawn.knife': 'Your punches and kicks now deal +{n} damage in a fight.',
    'toast.pawn.gun': 'A hold-up needs at least {n} rounds. Vinnie sells them by the box.',
    'toast.pawn.alarm': 'From tomorrow morning you wake up {h} h earlier.',
    'toast.pawn.phone': 'Your messages now reach you wherever you are.',
    'toast.pawn.knuckles': 'Your punches now deal +{n} damage in a fight.',
    'toast.pawn.vest': 'Fights now hurt {pct} less.',
    'toast.pawn.vestTours': 'Fights now hurt {pct} less, and a mugger takes only {mug} of your cash.',
    'toast.pawn.skateboard': 'Hold the skate button to roll at {n}× walking speed.',
    'toast.pawn.shirt': 'Crisp and pressed. Harold is going to want to see this.',

    // ---- the counter (pawn.shop) ----
    'sub.pawn.shop': 'The counter',
    'card.pawn.tabs': 'Buy or sell',
    'card.pawn.tabBuy': 'Buy',
    'card.pawn.tabSell': 'Sell',
    'card.pawn.goods': 'Goods behind the counter',
    'card.pawn.have': 'You have {n}.',
    'card.pawn.haveMax': 'You have {n} of {max}.',
    'card.pawn.haveChip': 'Have {n}',
    'card.pawn.use.knife': 'Fights: punches and kicks deal +{n} damage.',
    'card.pawn.use.gun': 'Needed for a hold-up (with {n} or more rounds) and for the red-eye bus.',
    'card.pawn.use.ammo': 'Sold {n} rounds to a box. You can carry {max}; a hold-up uses a handful.',
    'card.pawn.use.alarm': 'Every morning you wake up {h} h earlier.',
    'card.pawn.use.phone': 'Read your messages anywhere, and find buyers on a red-eye trip.',
    'card.pawn.use.knuckles': 'Fights: punches deal +{n} damage.',
    'card.pawn.use.vest': 'Fights: you take {pct} less damage.',
    'card.pawn.use.vestTours': 'Fights: you take {pct} less damage. A mugger takes only {mug} of your cash.',
    'card.pawn.use.skateboard': 'Skate at {n}× walking speed. Only if you have no board yet.',
    'card.pawn.use.shirt': "For Harold's job interview at McSticks.",
    'card.pawn.sellIntro': 'Vinnie buys back anything he sells, at {pct} of the price. Ammo goes by the box.',
    'card.pawn.sellEmpty': 'You have nothing Vinnie wants. He only buys back what he sells.',
    'card.pawn.sellConfirm': 'Sell your {item} to Vinnie for {money}?',
    'card.pawn.sellConfirmN': 'Sell {n} {item} to Vinnie for {money}?',
    'card.pawn.sellFor': 'Vinnie pays {money}.',

    // ---- Fine Line Furnishings: card rows ----
    'act.furniture.showroom': 'Browse the showroom',
    'act.furniture.buy': 'Buy a piece',
    'act.furniture.upgrade': 'Upgrade a piece',

    // ---- Sofia ----
    'greet.furniture.plain': [
      'Welcome to Fine Line. Every piece is hand-drawn, and most of them are load-bearing.',
      'Browse all you like. The display bed turns whether you buy it or not.',
      'Furniture is architecture you can carry. I say that to everyone, and I mean it every time.',
      'Looking to fill a room? I only judge a little, and only the curtains.',
    ],
    'greet.furniture.empty': 'An empty home? Start with a bed. Everything starts with a bed.',
    'greet.furniture.full': 'Your place is full to the last corner. A bigger home would give your taste some room.',
    'greet.furniture.castle': 'A castle! Finally, a client whose walls deserve the whole catalogue.',
    'greet.furniture.night': 'Open late for the insomniacs. Have you considered a better bed?',
    'greet.furniture.evil': 'I will take your money, darling. I simply will not ask where it has been.',

    // ---- Fine Line: toasts after a purchase ("bought pieces work at the next sleep") ----
    'toast.furniture.sleep': '{name} delivered. Sleep restores more HP from tonight.',
    'toast.furniture.nightly': '{name} delivered. It trains you every night from tonight.',
    'toast.furniture.home': '{name} delivered. It is waiting for you at home.',
    'toast.furniture.stored': '{name} delivered. It waits in storage until your home has room.',

    // ---- the showroom (furniture.browse) ----
    'sub.furniture.browse': 'Showroom',
    'card.furniture.slots': 'Slots in your {home}',
    'card.furniture.storage': '{n} in storage: they do nothing until there is room.',
    'card.furniture.slot0': 'No slot',
    'card.furniture.slot1': '1 slot',
    'card.furniture.slotN': '{n} slots',
    'card.furniture.upgradeTo': 'Upgrade to {name}',
    'card.furniture.owned': 'Owned',
    'card.furniture.inStorage': 'In storage',
    'card.furniture.topTier': 'Top of the line',
    'card.furniture.pieces': 'Pieces on the floor',
    'card.furniture.preview': 'Preview: the {name} in your {home}.',
    'card.furniture.previewHint': 'Pick a piece to see it in your {home}.',
    'card.furniture.previewHome': 'Your {home} as it is now.',
    'card.furniture.effect.bed': 'Sleep restores {pct} more of your HP max.',
    'card.furniture.effect.pod': 'Sleep restores {pct} more of your HP max.',
    'card.furniture.effect.tv': 'Watch the News at home.',
    'card.furniture.effect.skydish': 'Adds Fitness, Dating and Market Watch to your TV.',
    'card.furniture.effect.satellite': 'Adds Fitness and Dating to your TV. Needs the TV, takes no slot.',
    'card.furniture.effect.pc': 'Trade stocks from home.',
    'card.furniture.effect.workstation': 'Trade by phone, trend arrows, the catalogue and online courses.',
    'card.furniture.effect.books': '+{n} INT every night.',
    'card.furniture.effect.library': '+{n} INT every night.',
    'card.furniture.effect.treadmill': '+{n} STR every night.',
    'card.furniture.effect.homegym': '+{n} STR every night.',
    'card.furniture.effect.freezer': 'Sleep restores {pct} more of your HP max, in any home.',
    'card.furniture.effect.freezerPlus': 'Sleep restores {pct} more of your HP max, in any home. Leftovers: +{hp} HP once a day.',
    'card.furniture.effect.minibar': '+{n} CHA every night.',
    'card.furniture.effect.lounge': '+{n} CHA every night.',
    'card.furniture.effect.aquarium': 'Relax by the tank once a day: +{hp} HP and +{karma} karma.',

    // ---- the showroom's signs (drawn in the diorama) ----
    'card.furniture.sign.beds': 'BEDS',
    'card.furniture.sign.living': 'LIVING',
    'card.furniture.sign.kitchen': 'KITCHEN',
    'card.pawn.sign.cash': 'CASH PAID',
  });
})();
