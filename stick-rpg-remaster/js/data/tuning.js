// js/data/tuning.js — owner: W1-R. SR.def.tuning: every BALANCE table B-01 to B-31, keyed as
// BALANCE names them (docs/CONTRACT.md §3.6), read as SR.tuning.<table>.<key>.
// Pure data (Node-loadable). Conventions used throughout:
// - money in dollars, time in game minutes (clock minutes since midnight), unless a key says Ms / Sec;
// - `[a, b]` after a rand() in BALANCE is the inclusive range of the rules RNG draw;
// - percentages of BALANCE are stored as fractions (2.0 % → 0.020) except where the key says Pct
//   (a whole-number percent, e.g. a price discount of 25);
// - a table row of BALANCE is an object keyed by its id; a BALANCE key `a.b` is nested as { a: { b } };
// - weekdays are 0..6 with day 1 = Monday = 0 (B-01 weekStart); names 'mon'..'sun' in conditions;
// - (orig) marks the original game's values (never changed without the lead, B-25).
// B-23 (progression targets), B-24 (economy curves) and B-25 (the tuning protocol) have no tuning
// path: they are the simulator's bands (tests/balance) and review notes, not game numbers.
// Keys marked "(GDD, not in BALANCE)" are numbers the rules need that BALANCE does not tabulate;
// docs/requests/W1-R.md asks the lead to add them to BALANCE.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.tuning({
    // ---------------------------------------------------------------------------------------------
    // B-01 Time
    time: {
      stepMin: 30,                     // all costs are multiples of 30 m
      dayEnd: 1440,                    // the wall: start only if now + cost ≤ 1440
      wake: 480,                       // 08:00 (orig)
      alarmMinus: 240,                 // alarm clock (orig)
      pillMinus: 240,                  // caffeine pill (orig)
      pillRestorePenalty: 20,          // HP off the night's restore (orig)
      robStartBefore: 1260,            // a robbery may start only while now < 1260 (orig time < 21); latest 20:30
      redEyeDeparts: 0,                // 00:00 only (orig)
      tourWindow: [360, 600],          // board a speaking tour with 06:00 ≤ now ≤ 10:00 (both inclusive)
      waitTour: 360,                   // "Wait for the tour bus" sets the clock to 06:00
      openMicWindow: [1080, 1440],     // Tuesday, start at 18:00 or later (the wall applies)
      skateContestWindow: [720, 1080], // Sunday 12:00-18:00
      skateContestMin: 120,            // watching the contest takes 120 min
      encounterDayWindow: ['wake', 1380],  // from the wake time to 23:00
      encounterNightWindow: { late: [1260, 1440], early: [0, 240], earlyIfWakeAtMost: 0 },
      tripEndsAt: 1440,                // bus trips and robberies set the clock here
      repeatHoldMs: 350,               // hold Enter / A repeat interval (repeatable actions only)
      weekStart: 0,                    // day 1 is Monday (weekday 0); week = floor((day - 1) / 7)
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      buzzDecayMin: 120,               // Buzz -1 per 2 game hours (GDD §4.2, not in BALANCE)
      marketNights: [0, 1, 2, 3, 4],   // the nights that end Mon-Fri tick the market (by the ended day)
    },

    // ---------------------------------------------------------------------------------------------
    // B-02 New character
    start: {
      statRoll: [1, 10],               // rand(1..10) each for STR, INT, CHA (orig)
      extraRoll: [3, 9],               // points to distribute (orig)
      fairStart: { str: 7, int: 7, cha: 7, extra: 6 },
      cash: { relaxed: 300, standard: 100, hardcore: 100 },   // Standard 100 (orig)
      hpMaxBase: 15,                   // HP max = 15 + STR always (orig)
      statCap: 999,
      karmaRange: [-100, 100],
      nameMax: 16,
      cheat: { name: 'PAPERGOD', stats: 555, cash: 10000, rename: 'Totally Legit', achievements: false },
      startJob: 'cook',                // Fry Cook, hired (orig)
      startPlace: { home: 'apt', day: 1, min: 480 },   // inside the apartment, 08:00, day 1
      heatRange: [0, 100],             // (GDD §4.2, not in BALANCE)
      buzzRange: [0, 5],               // (GDD §4.2, not in BALANCE)
    },

    // ---------------------------------------------------------------------------------------------
    // B-03 Training. `gain` is before the degree (+1) and Winded (×0.5, floor, min 1) modifiers.
    // `hp` is the HP cost c (the action requires HP > c); `daily` / `weekly` are limits.
    training: {
      study: { where: 'uofs', cash: 0, min: 120, stat: 'int', gain: 2, hp: 0, daily: null, speedReaderMin: 90 },
      classBiz: { where: 'uofs', cash: 20, wedCash: 10, min: 120, stat: 'int', gain: 4, hp: 0, daily: null, track: 'biz' },
      gym: { where: 'uofs', cash: 0, min: 120, stat: 'str', gain: 2, hp: 4, daily: null },
      classKin: { where: 'uofs', cash: 20, wedCash: 10, min: 120, stat: 'str', gain: 4, hp: 6, daily: null, track: 'kin' },
      classThr: { where: 'uofs', cash: 20, wedCash: 10, min: 120, stat: 'cha', gain: 4, hp: 0, daily: null, track: 'thr' },
      seminar: { where: 'uofs', cash: 150, mastermindCash: 0, min: 180, gain: 10, hp: 0, daily: 2, needStat: 150, needClasses: 10 },
      onlineCourse: { where: 'home', cash: 10, min: 120, stat: 'int', gain: 3, hp: 0, daily: 1 },
      tvNews: { where: 'home', cash: 0, min: 60, stat: 'int', gain: 2, hp: 0, daily: 2, tipReveal: 0.60 },
      tvFitness: { where: 'home', cash: 0, min: 60, stat: 'str', gain: 2, hp: 0, daily: 2 },
      tvDating: { where: 'home', cash: 0, min: 60, stat: 'cha', gain: 2, hp: 0, daily: 2 },
      tvMarket: { where: 'home', cash: 0, min: 60, stat: 'int', gain: 1, hp: 0, daily: 1, tipReveal: 1 },
      beer: { where: 'bar', cash: 20, friCash: 15, regularCash: 15, subsidyCash: 10, min: 60, stat: 'cha', gain: 2, hp: 0, buzzBelow: 5, buzz: 1 },
      mingle: { where: 'bar', cash: 5, min: 60, stat: 'cha', gain: 1, hp: 0, daily: null, tipReveal: 0.30, regularTipReveal: 1 },
      openMic: { where: 'bar', weekday: 1, cash: 0, min: 120, stat: 'cha', gain: 3, hp: 0, weekly: 1, tipBase: 5, tipChaDiv: 20, crowdPleaser: 2 },
      jog: { where: 'park', cash: 0, min: 60, stat: 'str', gain: 1, hp: 3, daily: null },
      chess: { where: 'park', stake: 20, min: 60, stat: 'int', gain: 1, hp: 0, daily: 3, D: 150, win: 20 },
      paper: { where: 'store', cash: 2, min: 30, speedReaderMin: 0, stat: 'int', gain: 1, hp: 0, daily: 1 },
      smoke: { where: 'bag', items: { smokes: 1 }, min: 60, stat: 'cha', gain: 1, hp: 10, karma: -1 },   // orig
      barFightWin: { where: 'bar', min: 180, stat: 'str', gain: 3 },                                    // orig
      nightFurnitureT1: { gain: 2 },   // per tier-1 stat piece (orig +1)
      nightFurnitureT2: { gain: 4 },   // per tier-2 stat piece
      degree: { classes: 20, bonusStat: 25, perGain: 1, ceremonyMin: 60, tracks: { biz: 'int', kin: 'str', thr: 'cha' } },
      uofsKarma: { n: 1, dailyMax: 3 },                  // +1 per U of S activity (orig), max +3 a day
      winded: { threshold: 0.25, factor: 0.5, min: 1 },  // HP < 25 % of HP max: gains ×0.5, floor, min 1
      nap: { min: 120, hpPct: 0.15, daily: 1, where: 'home' },
    },

    // ---------------------------------------------------------------------------------------------
    // B-04 Karma. B-04c: the colours live in js/art/palette.js (karma.good[i], karma.evil[i]); tuning
    // holds only the band index i = clamp(ceil(|karma| / div) - 1, 0, max).
    karma: {
      changes: {                       // B-04a
        fullShift: 1, promotion: 3, uofs: 1, uofsDailyMax: 3,               // orig
        haroldGive10: 2, haroldBottle: 0,                                   // orig
        haroldTakeout: 1, kidGum: 1,                                        // once a day each (P1)
        charityPer100: 1, charityDailyMax: 10, soupKitchen: 4,
        encounterHelp: [2, 5], buyDrink: 1, tour: 2, turnInRed: 15, haroldRepays: 10, kidGood: 10,
        doorKnock: 1, holdCourt: 1, ducks: 1, preacher: 1,
        smoke: -1, gamble: -1, gambleDailyMax: 10, barFight: -2, wallet: -3, kidPack: -2, kidDies: -30,   // orig
        redPer10g: -1,                 // -ceil(n / 10) for n grams
        smuggle: -5, robStore: -10,    // orig
        robBank: -20, loanDefault: -10, hotwire: -5, keepWallet: -5,
        intimidate: -5, bribeOfficials: -10, bribePolice: -3, seizeBank: -30,
        statueOfMe: { president: 2, dictator: -2 },   // a night (night step 9)
      },
      tiers: {                         // B-04b (P1 karmaTiers): lower bounds; neutral is -49..+49
        angelic: 80, good: 50, bad: -50, wicked: -80,
        goodPerks: { discountPct: 10, rateBonus: 0.25, heatDecay: 15 },
        badPerks: { holdupAdd: 0.15, redDiscountPct: 10 },
        wickedPerks: { smuggleOffer: 0.10 },
      },
      band: { div: 10, max: 9 },       // B-04c: 0..10 → 0, 11..20 → 1, ..., 91..100 → 9
      rankColumn: { good: 20, evil: -20 },   // rank columns: karma > +20 good, < -20 evil (orig)
      crowd: 50,                       // cityReacts: waving at ≥ +50, stepping aside at ≤ -50
    },

    // ---------------------------------------------------------------------------------------------
    // B-05 Jobs. Rows: int / cha requirements, shifts at the current rank, $/h, a Full 6 h shift, credit.
    jobs: {
      ladder: { mcsticks: ['cook', 'manager'], nli: ['janitor', 'mail', 'sales', 'exec', 'vp', 'ceo'] },
      cook: { track: 'mcsticks', int: 0, cha: 0, shifts: 0, wage: 7, full: 42, credit: 1000, p: 0 },
      manager: { track: 'mcsticks', int: 0, cha: 20, shifts: 15, wage: 10, full: 60, credit: 2000, p: 1 },
      janitor: { track: 'nli', int: 20, cha: 0, shifts: 0, wage: 10, full: 60, credit: 2000, p: 0 },
      mail: { track: 'nli', int: 40, cha: 0, shifts: 3, wage: 15, full: 90, credit: 3000, p: 0 },
      sales: { track: 'nli', int: 75, cha: 25, shifts: 3, wage: 25, full: 150, credit: 5000, p: 0 },
      exec: { track: 'nli', int: 120, cha: 50, shifts: 4, wage: 50, full: 300, credit: 10000, p: 0 },
      vp: { track: 'nli', int: 180, cha: 90, shifts: 5, wage: 120, full: 720, credit: 25000, rating: 0.9, p: 0 },
      ceo: { track: 'nli', int: 250, cha: 140, shifts: 6, wage: 300, full: 1800, credit: 50000, rating: 0.9, p: 0 },
      office: { track: 'city', salary: 10000, credit: 250000 },   // President / Dictator: $10,000 a night
      shift: {
        full: { min: 360, karma: 1, counts: 1, payMult: 1 },
        half: { min: 180, karma: 0, counts: 0.5, payMult: 1 },
        overtime: { min: 120, payMult: 1.5, hp: 10, perDay: 1, workaholicHp: 0, workaholicPerDay: 2 },
      },
      employeeDiscount: 25,            // % at McSticks while you hold a McSticks job
      weeklyBonus: { exec: 0.10, vp: 0.20, ceo: 0.30, weekday: 4 },   // Friday night, of the week's NLI wages
      hustle: {
        m: [0.7, 1.3], auto: 1.0, rainTips: 1.2,
        skins: { cook: 'orderup', manager: 'orderup', janitor: 'sortit', mail: 'sortit', sales: 'pitch', exec: 'pitch', vp: 'boardroom', ceo: 'boardroom' },
        pitchStep: { sales: 0, exec: 1 },
        // items: tickets list 2-5 items (GDD §6.5, not in BALANCE; docs/requests/W1-M.md 4).
        orderup: { base: 0.7, perCorrect: 0.075, perWrong: 0.1, sec: 30, ticketEverySec: [6, 3], items: [2, 5] },
        // The belt brings itemsPerCorrect items per ticket interval: one every ticketEverySec / 3 =
        // 2 s speeding to 1 s (docs/requests/W1-M.md 5). streak: ×(1 + step) per `every` right sorts
        // in a row, up to max (GDD §6.5 ×1.1 to ×1.5); travelSec: an item's time down the belt, start
        // → end of the round (design numbers, not in BALANCE; W1-M request 4).
        sortit: { base: 0.7, perCorrect: 0.075, perWrong: 0.1, sec: 30, ticketEverySec: [6, 3], itemsPerCorrect: 3,
          streak: { step: 0.1, max: 1.5, every: 3 }, travelSec: [3.2, 2.2] },
        pitch: { presses: 5, needleDegSec: 180, needlePerStep: 30, arcBase: 0.08, arcChaDiv: 4000, arcMax: 0.40, base: 0.7, perHit: 0.12 },
      },
      rating: { alpha: 0.3, start: 1.0, need: 0.9 },
      shiftEventChance: 0.25,
      shiftEvents: { perRank: 3, ranks: ['cook', 'manager', 'janitor', 'mail', 'sales', 'exec', 'vp', 'ceo'] },
      ceoTakeover: { fromDays: 14, toDays: 21, dMult: 2, mNeed: 1.2, bonus: 20000 },
      mondayBonus: { stat: 'cha', n: 1 },
      relaxedWages: 1.25,
      fourDayWeek: 1.25,
      networker: -1,                   // promotion shift counts -1 at each rank (min 0)
    },

    // ---------------------------------------------------------------------------------------------
    // B-06 Items and prices. `hp` heals when eaten; stack 0 = eaten on the spot; `min` time to use.
    items: {
      milkshake: { where: 'mcsticks', price: 8, hp: 12, min: 30, stack: 0, p: 0 },
      fries: { where: 'mcsticks', price: 12, hp: 20, min: 30, stack: 0, p: 0 },
      cheeseburger: { where: 'mcsticks', price: 25, hp: 40, min: 30, stack: 0, p: 0 },
      tripleburger: { where: 'mcsticks', price: 50, thuPrice: 40, hp: 80, min: 30, stack: 0, p: 0 },
      megameal: { where: 'mcsticks', price: 120, thuPrice: 100, hp: 200, min: 30, stack: 0, needHpMax: 200, p: 1 },
      takeout: { where: 'mcsticks', add: 2, buyMin: 0, eatMin: 30, stack: 5, p: 1 },
      slushee: { where: 'store', price: 1, hp: 1, min: 30, stack: 0, p: 0 },
      candybar: { where: 'store', price: 2, hp: 3, min: 30, stack: 0, p: 0 },
      nachos: { where: 'store', price: 4, hp: 7, min: 30, stack: 0, p: 0 },
      smokes: { where: 'store', price: 10, min: 0, stack: 99, p: 0 },                    // orig
      pills: { where: 'store', price: 45, min: 0, stack: 99, wakeMinus: 240, restorePenalty: 20, p: 0 },   // orig
      paper: { where: 'store', price: 2, min: 30, perDay: 1, p: 1 },
      scratch: { where: 'store', price: 5, min: 0, stack: 20, p: 1 },
      gum: { where: 'store', price: 1, min: 0, stack: 9, p: 1 },
      knife: { where: 'pawn', price: 100, min: 0, stack: 1, dmg: 2, p: 0 },               // punch and kick +2 (orig)
      gun: { where: 'pawn', price: 400, min: 0, stack: 1, p: 0 },                         // orig
      ammo: { where: 'pawn', price: 10, per: 5, min: 0, stack: 99, refuseAt: 95, p: 0 },  // orig
      alarm: { where: 'pawn', price: 200, min: 0, stack: 1, wakeMinus: 240, p: 0 },       // orig
      phone: { where: 'pawn', price: 200, min: 0, stack: 1, p: 0 },                       // orig
      knuckles: { where: 'pawn', price: 300, min: 0, stack: 1, dmg: 4, p: 1 },
      vest: { where: 'pawn', price: 900, min: 0, stack: 1, dmgTaken: 0.30, mugCash: 0.5, p: 1 },
      skateboard: { where: 'pawn', price: 300, min: 0, stack: 1, speed: 2, p: 1 },
      booze: { where: 'bar', price: 30, min: 0, stack: 999, p: 0 },                       // orig "bottle of beer"
      snow: { where: 'red', price: 400, min: 0, stack: 99, p: 0 },                        // orig price; -ceil(n/10) karma
      shirt: { where: 'pawn', price: 20, min: 0, stack: 1, p: 1 },
      sportscar: { where: 'catalogue', price: 60000, min: 0, stack: 1, p: 1 },
      catalogue: { markup: 1.10 },     // Fine Line price × 1.10 (delivery)
      pawnBuyback: 0.40,               // 40 % of price for pawn items
      pawnBuybackSmooth: 0.55,         // Smooth Talker
      refuseAtFullHp: true,            // orig
      ironStomach: 1.25,               // food heals ×1.25 (perk)
    },

    // ---------------------------------------------------------------------------------------------
    // B-07 Sleep: restore = floor(hpMax × (base + bed + freezer + home)) + flat - pill, ≤ HP max, ≥ 0.
    sleep: {
      base: 0.25,
      flat: 15,
      bed: [0, 0.10, 0.20],            // by bed tier (0 = none, 1, 2)
      freezer: 0.05,
      home: { apt: 0, apt2: 0.05, pent: 0.10, mansion: 0.15, castle: 0.20 },
      pill: 20,
      heatDecay: { base: 10, good: 15, toughOnCrime: 25 },   // good needs karmaTiers (P1); Tough on Crime replaces both
      buzzReset: 0,
      leftovers: { min: 30, hp: 25, daily: 1 },              // freezer
      relax: { min: 30, hp: 10, karma: 1, daily: 1 },        // aquarium (P2)
    },

    // ---------------------------------------------------------------------------------------------
    // B-08a Homes. rent a night = 0.6 % of the price; sell = 90 %.
    homes: {
      order: ['apt', 'apt2', 'pent', 'mansion', 'castle'],
      apt: { price: 0, slots: 3, sleep: 0, rent: 0, sell: 0, door: 'home_apt', perk: null },
      apt2: { price: 10000, slots: 5, sleep: 0.05, rent: 60, sell: 9000, door: 'home_apt',
        perk: { id: 'stargaze', min: 60, every: 'day', int: 1, cha: 1 } },
      pent: { price: 40000, slots: 7, sleep: 0.10, rent: 240, sell: 36000, door: 'home_pent',
        perk: { id: 'party', min: 180, cash: 500, every: 'week', cha: 8 } },
      mansion: { price: 100000, slots: 10, sleep: 0.15, rent: 600, sell: 90000, door: 'home_mansion',
        perk: { id: 'swim', min: 60, every: 'day', str: 2, hp: 10 } },
      castle: { price: 500000, slots: 14, sleep: 0.20, rent: 3000, sell: 450000, door: 'home_castle',
        perk: { id: 'holdCourt', min: 60, every: 'day', cha: 2, karma: 1 } },
      rentRate: 0.006,
      sellRate: 0.9,
    },

    // B-08b Furniture. `upgrade` names the tier-2 piece; an upgrade credits 50 % of the tier-1 price.
    furniture: {
      bed: { tier: 1, price: 500, slots: 1, sleep: 0.10, upgrade: 'pod', p: 0 },
      pod: { tier: 2, from: 'bed', price: 4000, slots: 1, sleep: 0.20, p: 1 },
      tv: { tier: 1, price: 2500, slots: 1, channels: ['news'], upgrade: 'skydish', p: 0 },
      skydish: { tier: 2, from: 'tv', price: 3000, slots: 1, channels: ['news', 'fitness', 'dating', 'market'], p: 1 },
      pc: { tier: 1, price: 2000, slots: 1, upgrade: 'workstation', p: 0 },          // stocks
      workstation: { tier: 2, from: 'pc', price: 8000, slots: 1, p: 1 },             // phone trading, trend arrows, catalogue, online course
      books: { tier: 1, price: 2000, slots: 1, nightly: { int: 2 }, upgrade: 'library', p: 0 },
      library: { tier: 2, from: 'books', price: 12000, slots: 2, nightly: { int: 4 }, p: 1 },
      treadmill: { tier: 1, price: 3500, slots: 1, nightly: { str: 2 }, upgrade: 'homegym', p: 0 },
      homegym: { tier: 2, from: 'treadmill', price: 15000, slots: 2, nightly: { str: 4 }, p: 1 },
      freezer: { tier: 1, price: 2500, slots: 1, sleep: 0.05, p: 0 },               // Leftovers
      minibar: { tier: 1, price: 5000, slots: 1, nightly: { cha: 2 }, upgrade: 'lounge', p: 0 },
      lounge: { tier: 2, from: 'minibar', price: 18000, slots: 2, nightly: { cha: 4 }, p: 1 },
      aquarium: { tier: 1, price: 1200, slots: 1, p: 2 },                            // Relax
      satellite: { tier: 1, price: 3000, slots: 0, needs: 'tv', channels: ['fitness', 'dating'], p: 0 },   // P0 add-on; v2 turns it into skydish
      upgradeCredit: 0.5,
    },

    // ---------------------------------------------------------------------------------------------
    // B-09 Bank. Rates are in % per day (r = 2.0 means 2 % a day).
    bank: {
      rateStart: { rand: [10, 30], div: 10 },
      rateStep: { toward: 1.5, pull: 0.2, jitter: [-3, 3], jitterDiv: 10, min: 0.25, max: 3.5 },
      goodBonus: 0.25,
      tiers: { t1: 100000, t2: 1000000, t1Div: 100, t2Div: 200, t3Div: 400, taxWizardT1: 200000 },
      interestCap: 25000,
      cd: { min: 1000, days: 7, rateMult: 1.2, maxOpen: 3, maxPrincipal: 100000, breakPenalty: 0.10 },
      loan: { days: 15, rateAdd: 1, warn: [5, 1] },     // 15 days (orig); limit: the best job's credit (B-05)
      default: {
        seize: ['bank', 'cash', 'cds', 'stocks', 'furniture', 'homes'],
        cdPenalty: 0.10, stockSell: 0.995, furniture: 0.5, homes: 0.9,
        lienShare: 0.5,
        lienSources: ['wage', 'rent', 'salary', 'interest', 'deal', 'tour', 'loot', 'win', 'prize'],
        penaltyKarma: -10, creditFrozenDays: 60,
        standard: { hp: 1 }, relaxed: { hp: null }, hardcore: { dead: 'loan' },
      },
      charge: ['cash', 'bank'],        // forced charges: cash → bank → written off; never negative
      quickAmounts: [0.10, 0.50, 1],
      typedMax: 9999999,
    },

    // ---------------------------------------------------------------------------------------------
    // B-10 Stocks. mu / sigma are per market night as fractions of a log-return (+0.20 % → 0.0020).
    stocks: {
      tickers: ['MCS', 'NLI', 'SLC', 'PPR', 'GLU', 'SKY'],
      MCS: { start: 12, jitter: 3, mu: 0.0020, sigma: 0.020, quirk: { burgerDay: 0.05 } },
      NLI: { start: 30, jitter: 6, mu: 0.0025, sigma: 0.030, quirk: { ceoDrift: 0.0030, ceoShifts: 3 } },
      SLC: { start: 20, jitter: 5, mu: 0, sigma: 0.050, quirk: { casinoWin: 5000, shock: -0.04 } },
      PPR: { start: 8, jitter: 2, mu: 0.0010, sigma: 0.025, quirk: { rain: -0.03 } },
      GLU: { start: 5, jitter: 1, mu: 0.0015, sigma: 0.015, quirk: { fall: 0.02 } },
      SKY: { start: 3, jitter: 1, mu: -0.0010, sigma: 0.080, quirk: null },   // penny stock
      tick: { z: 'irwinHall3' },       // logret = mu + sigma·z + shock, z = 2·(u1+u2+u3-1.5); price = round2(price·e^logret)
      reverseSplit: { below: 1.00, factor: 10 },
      shorts: false,
      tip: {
        perDay: 1,
        reliability: { base: 0.5, intDiv: 2000, max: 0.75 },
        sources: { tvNews: 0.60, mingle: 0.30, mingleRegular: 1, marketWatch: 1, paper: 1 },
        trueShock: { base: 0.03, extra: [0, 2], extraDiv: 100 },   // ±(3 + rand(0..2)) % in the stated direction
        falseShock: 0.5,               // half the size, opposite direction
      },
      fee: 5,
      spread: 0.005,
      positionCap: { base: 10000, perInt: 100 },
      maxShares: 9999999,              // orig 7-digit field
      history: 30,
      stockScare: { shock: -0.05, rebound: 0.05 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-11 Crime
    crime: {
      heat: {                          // B-11a
        robStore: 30, robBank: 60, smugglePer10: 5, barFight: 5, hotwire: 15, hotwireAlarm: 10,
        intimidate: 10, bribeOfficials: 20,
        decay: 10, decayGood: 15, decayTough: 25,
        fineDollarsPerPoint: 50, release: 20,
        mchollandTip: { mult: 0.5, min: 30, perWeek: 1 },
        mchollandBribe: { cash: 2000, days: 7 },
        interrogation: { win: -10, jailBase: 2, heatDiv: 25 },
      },
      store: {                         // B-11b
        requires: { gun: 1, ammo: 10 },                 // orig
        startBefore: 1260, clock: 1440,                 // orig
        ammo: [5, 9], beats: 3, need: 2,                // ammo used rand(5..9) (orig)
        D: { base: 60, perHeat: 1 },
        loot: { base: 100, rand: [0, 499] },
        karma: -10, heat: 30,                           // karma orig
        jailBase: 3, jailBaseHardcore: 5,               // hardcore orig
        confiscate: [],
      },
      bank: {
        requires: { gun: 1, ammo: 10, str: 100, perWeek: 1 },
        startBefore: 1260, clock: 1440,
        ammo: [5, 9], beats: 3, need: 2,
        D: { base: 400, perHeat: 1, perRecent: 100, recentDays: 14 },
        loot: { base: 3000, rand: [0, 12000] },
        karma: -20, heat: 60,
        jailBase: 7,
        confiscate: ['gun', 'ammo'],
      },
      jail: {                          // B-11c
        heatDiv: 25,                   // days = base + floor(Heat at arrest / 25)
        bases: { store: 3, storeHardcore: 5, bank: 7, bust: 5, police: 2 },   // bust orig
        charmingRogue: { days: -2, min: 1 },
        day: { str: 2, int: 2, cha: 2, hp: 10, rep: 1 },
        release: { min: 480, heat: 20 },
      },
      bail: { perDayMin: 500, nwShare: 0.02, charmingRogue: 0.5, needsPhone: true },   // P1
      police: {                        // B-11d (P1)
        appearHeat: 40, heatPerOfficer: 20, maxOfficers: 6, dictatorMult: 2, martialLawMult: 2,
        engage: { range: 64, sec: 1, heat: 60 },
        talk: { D: 50, perHeat: 2, fastTalkerDD: -40, heat: -10 },
        bribe: { perHeat: 20, fastTalker: 0.5, heat: -30, karma: -3 },
        run: { headStartSec: 3, speed: 300, jailBase: 2, heatDiv: 25 },
        posters: 50,
      },
    },

    // ---------------------------------------------------------------------------------------------
    // B-12 Bus depot. `bust`: 'gte' checks carried ≥ threshold, 'gt' carried > threshold.
    bus: {
      cities: {
        crayonburg: { ticket: 115, mug: 125, wants: 'either', booze: 1.0, product: 1.0, bust: 'gte' },
        rustbelt: { ticket: 100, mug: 150, wants: 'product', booze: null, product: 1.1, bust: 'gt' },
        glitter: { ticket: 100, mug: 150, wants: 'product', booze: null, product: 1.2, bust: 'gt' },
        gusty: { ticket: 115, mug: 125, wants: 'booze', booze: 1.2, product: null, bust: 'gt' },
        eraser: { ticket: 130, mug: 110, wants: 'booze', booze: 1.3, product: null, bust: 'gt' },
        pegas: { ticket: 130, mug: 110, wants: 'either', booze: 1.1, product: 1.1, bust: 'gt' },
      },
      demandDaily: { rand: [85, 115], div: 100 },
      bustThreshold: { base: 50, heatDiv: 5, packMule: 10 },   // 50 - floor(Heat/5) (orig)
      mugCheck: { base: 100 },                                  // STR < 100 + rand(0..range) → mugged (orig)
      mugLoss: { cash: 1, goods: 1, vestCash: 0.5 },            // all cash and goods (orig)
      screwed: { base: 0.10, perRep: 0.01, min: 0.03 },         // 10 % (orig)
      offer: {
        booze: { min: 5, chaDiv: 6, cap: 50, jitter: 4 },       // max(5, min(CHA/6, 50) ± rand(0..4)) × demand (orig)
        product: { min: 50, chaMult: 2, cap: 600, jitter: 49 }, // max(50, min(2·CHA, 600) ± rand(0..49)) × demand (orig)
        wicked: 0.10,
      },
      haggle: { D: 150, bonus: 0.12, smoothTalker: 0.10 },
      take: { karma: -5, heatPer10: 5, rep: 1, repMax: 10 },    // karma orig
      buyerVoicemail: { chance: 0.5, buyers: 5 },               // orig
      tour: {
        requires: { cha: 150, karma: 0, phone: 1, job: 'exec', degree: 'thr' },
        perCityPerWeek: 1,
        window: [360, 600],
        fee: { chaMult: 3, demand: [80, 130], demandDiv: 100, perRep: 0.05, silverTongue: 1.15, nationalised: 1.2 },
        hook: { D: 150, win: 1.2, lose: 0.8 },
        karma: 2, rep: 1,
      },
      nationalised: { ticket: 0 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-13 Fights. rand(x) is an integer draw in 1..x as the original's.
    fight: {
      startCost: { min: 180, karma: -2, heat: 5 },               // karma orig
      ap: { strDiv: 20, base: 1, max: 15, harold: 1, brawler: 1 },   // min(floor(STR/20) + 1, 15) (orig)
      moves: {
        punch: { ap: 1, strAdd: 10, div: 10, knife: 2, knuckles: 4, buzzMax: 3 },   // rand((STR+10)/10) + 2·knife + 4·knuckles + min(Buzz, 3)
        kick: { ap: 2, div: 4.5, knife: 2, add: 1 },            // rand(STR/4.5) + 2·knife + 1 (orig)
        fireball: { ap: 3, div: 2.5 },                          // orig
        inkBeam: { ap: 4, div: 1.5 },                           // orig's strongest move
        guard: { ap: 1, one: 0.5, two: 0.75 },                  // P1: next hit -50 %, two guards -75 %
      },
      minDamage: 1,                    // orig
      crit: { chance: 0.10, chanceHighCha: 0.15, cha: 300, mult: 1.5 },
      heavyHitter: 1.25,
      ladder: { n: 12, hp: { base: 8, perN: 12, randPerN: 4 }, power: { base: 6, perN: 9 } },
      enemyMove: {                     // roll = rand(P) + 1 (orig thresholds)
        inkBeam: { over: 40, div: 1.5 }, fireball: { over: 20, div: 2.5 }, kick: { over: 10, div: 4.5 }, punch: { div: 10, add: 1 },
      },
      vest: 0.30,                      // -30 % damage taken
      win: { str: 3 },                 // orig
      wallet: { base: 10, perN: 15, randPerN: 10, karma: -3 },   // orig prize
      drink: { cash: 5, cha: 1, karma: 1 },                      // P1: buy a beaten opponent a drink: costs $5, +1 CHA, +1 karma
      lose: { standard: { hp: 1, cashPct: 0.10 }, relaxed: { hp: 1, cashPct: 0 }, hardcore: { down: true } },
      run: { cost: 0 },                // orig
      champion: { n: 12, prize: 1000 },
      afterChampion: [8, 12],
      ring: {
        weekday: 5, perDay: 1, min: 180,                       // Saturday, champions only
        power: { base: 120, str: 0.8, perK: 20 },
        hp: { base: 150, str: 1.1, perK: 30 },
        purse: { base: 500, perK: 250 },
      },
      goons: { n: 6, fights: 2 },
      // The ladder regulars' quirks (GDD §6.3, not in BALANCE; docs/requests/W1-C.md 7), by the quirk
      // id of js/data/fighters.js: Wobbly Pete misses 30 % of his attacks, The Professor's fireball
      // band is ×2 as wide, Iron Irma takes 30 % less damage. (The Accountant's `always: 'kick'` is data.)
      quirks: { wobbly: { miss: 0.30 }, pyro: { fireballOdds: 2 }, iron: { armor: 0.30 } },
    },

    // ---------------------------------------------------------------------------------------------
    // B-14 Casino
    casino: {
      slots: {                         // B-14a: 3 reels × 20 stops; pays × bet, stake included
        stops: { dollar: 1, seven: 2, bar: 3, bell: 4, cherry: 4, blank: 6 },
        reelStops: 20,
        pays: { dollar3: 700, seven3: 100, bar3: 40, bell3: 20, cherry3: 15, cherry2: 5, cherry1: 1 },
        rtp: 0.9225, hitRate: 0.2125,
        bets: [5, 25, 100], vipBet: 500, autoSpins: 10,   // bets orig
        levy: { dollar3: 560 }, casinoNight: { bell3: 24 },
      },
      bj: {                            // B-14b
        decks: 6, penetration: 0.75, standSoft17: true, natural: 1.5,
        doubleAnyTwo: true, doubleAfterSplit: false, splits: 1, splitAcesOneCard: true,
        insurance: false, surrender: false,
        bets: [5, 500], vipGoldMult: 5,
        handsPerDay: 60, minimum: 5,
        suspicion: { spread: 1, spreadBetMult: 4, spreadTrueCount: 2, flat: -0.5, cardSharp: 0.75 },
        backoff: { at: 8, atHighCha: 11, cha: 400, days: 7 },
        counting: { target: 0.003, fallbackSpread: 1.5, fallbackBackoff: 6 },
        edge: [0.0035, 0.0075],        // the fixed-seed test band
      },
      roulette: {                      // B-14c: American wheel
        pockets: 38,
        red: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
        pays: { straight: 35, split: 17, street: 11, corner: 8, sixLine: 5, dozen: 2, column: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 },
        limit: 2000, vipLimit: 10000,  // limit orig
      },
      vip: {                           // B-14d (P1)
        pointPerDollars: 100, saturdayMult: 2,
        silver: { points: 500, drinks: 2, drinkMin: 0, drinkCha: 1, drinkBuzz: 1, slotBet: 500 },
        gold: { points: 2500, limitMult: 5 },
      },
      scratch: {                       // B-14e (P1): one roll of 1..10,000; EV $3.00 exactly
        price: 5, roll: [1, 10000],
        prizes: [{ from: 1, to: 1, pay: 10000 }, { from: 2, to: 101, pay: 100 }, { from: 102, to: 1101, pay: 10 }],
        karma: 0,
      },
      darts: {                         // B-14f; units are board pixels
        perGame: 10,                   // orig
        boardRadius: 220,
        rings: [{ r: 19, pts: 50 }, { r: 40, pts: 35 }, { r: 138, pts: 15 }, { r: 220, pts: 5 }],
        aim: { stickPxSec: 500, arrowsPxSec: 400, smoothSec: 0.2 },
        wobble: { fx: 0.53, fy: 0.71, A: 120, perBuzz: 0.4, intCap: 600, intDiv: 1200, assist: 0.5 },
        // Auto releases each throw at a uniformly random time in 0..autoWindowSec of the wobble; far
        // longer than its periods, so the two phases are effectively independent (B-14f `auto`).
        autoWindowSec: 600,
        ghostBoardBuzz: 2,
        practice: { min: 30, cha: 1 },
        match: { min: 60, perDay: 3, stake: [10, 200],
          rookie: { target: 160, pays: 2 }, regular: { target: 230, pays: 2 }, shark: { target: 320, pays: 3 } },
      },
      karma: { gamble: -1, dailyMax: 10 },   // orig: -1 per pull, spin or hand; max -10 a day
    },

    // ---------------------------------------------------------------------------------------------
    // B-15 Movement and world (u, u/s, s)
    world: {
      walk: { speed: 280, accel: 0.08 },
      skate: { speed: 560, proDeck: 700, marathoner: 1.15 },
      junker: { speed: 840, accel: 0.6, turn: 3.2, reverse: 200 },
      sports: { speed: 1400, accel: 0.9, turn: 3.8 },
      surfaceDrive: { asphalt: 1, path: 0.6, cap: 200 },   // sidewalks and lawns: speed capped at 200 u/s
      park: { range: 64 },             // "Park and enter" within 64 u of a door's kerb point
      carVsPeople: { hop: 24 },
      homeLots: { junker: [636, 1064, 818, 1162], sports: [1770, 1080, 1960, 1160] },
      playerRadius: 14,
      door: {
        trigger: { w: 96, h: 48, offset: 24 }, dwell: 0.2, angle: 45, interact: 96,   // the box's centre 24 u outside the door
        prompt: 96, tag: 160, exit: 56, rearm: 64,
        porchN: { annexFactor: 0.5, add: 32, depth: 56, visible: 32 },
      },
      camera: { omega: 8, deadZone: [96, 64], lookAhead: 0.25, lookCap: 140, zooms: [0.8, 1.0, 1.25], bounds: 480 },   // look-ahead in s
      projection: { k: 0.5 },          // screenY = y - 0.5 × z
      occlusionAlpha: { alpha: 0.35, ms: 150 },
      edgeWarn: { dist: 60, fog: 90 },
      teeter: 150,                     // ms
      fall: { total: 1.5, drop: 0.55, catch: 0.5, land: 0.45, skipAfter: 0.5, hp: 10, hardLanding: 5, min: 0, landInside: 64 },   // s; -10 HP, no time (orig)
      carTow: { cash: 100 },
      carHit: { hp: 10, knockdown: 1.14, voicemails: 3, settlement: { chance: 0.2, base: 50, rand: [0, 150] } },   // -10 HP, knockdown 1.14 s = 40 ticks, 1 of 3 voicemails (orig)
      carCrash: { hp: 5 },
      cab: { cash: 15, min: 30 },
      windGust: { speed: 40, range: 48, burstSec: 2, warnSec: 0.5 },
      navGrid: { cell: 32, margin: 40, reach: 32 },
      scrapEdgeMin: 64,
      // Numbers the design names that B-15 does not tabulate (docs/requests/W1-W.md 1), read by
      // js/world/world.js under these names:
      skateAccel: 0.25,                // s: skateboard and Pro Deck reach top speed (GDD §3.8)
      carRange: 64,                    // u: C / Y enters or leaves your car within 64 u of it (GDD §3.8)
      carRadius: 26,                   // u: a car is 96 × 52; its collision capsule has half its width ...
      carLength: 96,                   // u: ... and its length along the heading (GDD §3.8)
      driveZoomEase: 0.6,              // s: driving eases the zoom one level out (GDD §3.7)
      teeterAssistMs: 300,             // ms: Assist's longer teeter grace (UI §8)
      navCacheSec: 1,                  // s: nav paths are cached (ARCHITECTURE §8.2)
      // Minigame Assist (GDD §6.5, not in BALANCE; docs/requests/W1-M.md 4): -30 % speed, +50 % sweet
      // spots, half the wobble (B-14f's darts wobble ×0.5 is the same number).
      assist: { speed: 0.7, sweet: 1.5, wobble: 0.5 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-16 Difficulty
    difficulty: {
      relaxed: { startCash: 300, hp0: 'hospital', bill: { min: 0, pct: 0 }, loanDefault: 'seize', loanHp: null,
        wageMult: 1.25, checkBonus: 0.10, storeJailBase: 3, fightLoseCashPct: 0, saves: 'slots', legacyMult: 0.75 },
      standard: { startCash: 100, hp0: 'hospital', bill: { min: 50, pct: 0.10 }, loanDefault: 'seize', loanHp: 1,
        wageMult: 1, checkBonus: 0, storeJailBase: 3, fightLoseCashPct: 0.10, saves: 'slots', legacyMult: 1 },
      hardcore: { startCash: 100, hp0: 'death', bill: null, loanDefault: 'death', loanHp: null,
        wageMult: 1, checkBonus: 0, storeJailBase: 5, fightLoseCashPct: null, saves: 'ironman', ironmanDebounceMs: 2000, legacyMult: 1.5 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-17 Endgame: nomination, campaign, office
    election: {
      requires: { home: 'castle', money: 200000,
        president: { stats: 666, karmaMin: 25 }, dictator: { stats: 777, karmaMax: -25 } },   // 666 / 777 and $200,000 orig
      acceptWithin: 14,
      keepOnceAccepted: true,
      warChest: [{ cash: 50000, poll: 5 }, { cash: 100000, poll: 12 }, { cash: 200000, poll: 25 }],   // orig tiers
      startPoll: { base: 30, statFrom: 600, statDiv: 20, karmaDiv: 10, magnetic: 5, round: 0.1 },
      pollClamp: [0, 100],
      campaignDays: 7,
      rivalDaily: [1, 3],
      repeatHalf: 0.5,
      rally: { cash: 5000, min: 180, base: 1, chaDiv: 250, cap: 2 },
      tvAd: { cash: 25000, min: 0, poll: 4, cap: 1 },
      doorKnock: { cash: 0, min: 120, poll: 1, karma: 1, cap: 2, path: 'president' },
      kissBabies: { cash: 0, min: 60, poll: 1, D: 300, cap: 3, path: 'president', p: 1 },
      debate: { day: 4, min: 120, questions: 3, win: 3, lose: -2, D: 500, cap: 1, noShow: -5 },
      intimidate: { cash: 0, min: 120, poll: 3, fail: -3, D: 500, stat: 'str', karma: -5, heat: 10, cap: 1, path: 'dictator' },
      bribe: { cash: 50000, min: 60, poll: 8, karma: -10, heat: 20, scandal: { chance: 0.10, poll: -6 }, cap: 1 },
      eventChance: 0.40,
      events: { scandal: -5, endorsement: 4, gaffe: -2, viralMeme: 3, rivalStumbles: 2, weatherWashout: -1,
        celebrityNod: 3, oldTweet: -4, debateClip: 2, paperShortage: -1, parade: 2, pigeonIncident: -1 },
      win: { threshold: 50, jitter: [-5, 5] },
      retry: 30,
      salary: 10000,
      decreeEvery: 7,
      decreeOffer: 3,
      flip: 3,
      casinoLevy: 2000,
      statueOfMe: 2,
      mandatoryHats: 1,
      toughOnCrime: { heat: -25, police: 2 },
      seizeBank: { cash: 250000, karma: -30 },
      // GDD §4.17 numbers B-17 does not tabulate (docs/requests/W1-C.md 7):
      publicLibrary: { study: 3 },     // Public Library Act: Study gives +3 INT
      universalFries: { karma: 10 },   // Universal Basic Fries: +10 karma when issued
      cityNameMax: 16,                 // Rename the City: a TextField of at most 16 characters
    },

    // ---------------------------------------------------------------------------------------------
    // B-18 Net worth, ranks, legacy. Rank names are rank defs (js/data/ranks.js) and rank.* text.
    endgame: {
      netWorth: { homes: 0.9, furniture: 0.25, sportsCar: 30000 },
      ranks: [0, 500, 1500, 5000, 15000, 40000, 100000, 250000, 600000, 1500000, 5000000, 15000000],   // index 0 = below 0 (in the red)
      column: { good: 20, evil: -20 },   // rank columns: karma > +20 good, < -20 evil (orig)
      legacy: {
        nwDiv: 100, karmaMult: 5, achievement: 250, jobRank: 500, elected: 10000,
        jobRanks: { cook: 0, manager: 1, janitor: 1, mail: 2, sales: 3, exec: 4, vp: 5, ceo: 6, office: 7 },
      },
      hof: { top: 10, lengths: [15, 40, 100, 0] },
    },

    // ---------------------------------------------------------------------------------------------
    // B-19 Weather and calendar
    weather: {
      states: ['clear', 'cloudy', 'rain', 'fog', 'windy'],
      chain: {                         // rows = today, columns = tomorrow
        clear: { clear: 0.60, cloudy: 0.25, rain: 0.08, fog: 0.05, windy: 0.02 },
        cloudy: { clear: 0.35, cloudy: 0.30, rain: 0.25, fog: 0.05, windy: 0.05 },
        rain: { clear: 0.20, cloudy: 0.35, rain: 0.35, fog: 0.05, windy: 0.05 },
        fog: { clear: 0.50, cloudy: 0.30, rain: 0.10, fog: 0.10, windy: 0.00 },
        windy: { clear: 0.50, cloudy: 0.30, rain: 0.10, fog: 0.00, windy: 0.10 },
      },
      day1: 'clear',
      forecastAccuracy: 0.8,          // the forecast is right with 0.8, else another state at random
      intraday: { at: [720, 1080], chance: 0.30 },
      storm: 0.15,
    },
    calendar: {
      mon: { stat: 'cha', n: 1 },                        // +1 CHA on the first shift
      tue: { openMic: [1080, 1440] },
      wed: { classCash: 10 },
      thu: { tripleburger: 40, megameal: 100 },
      fri: { beer: 15, weeklyBonus: true },
      sat: { ring: true, vipMult: 2 },
      sun: { flea: [480, 1080], fleaSell: 0.6, skateContest: [720, 1080] },
      cityEventEvery: 7,
      events: {                        // P1 calendar; drawn each Sunday night with equal weights
        burgerDay: { day: 'any', pct: 50, mcsShock: 0.05 },
        heatWave: { day: 'any', weather: 'clear', hpMult: 1.5, milkshakeHeal: 2 },
        casinoNight: { day: 'fri', bell3: 24 },
        recyclingDrive: { day: 'any', karmaPerDollars: 500, karmaMin: 1, karmaMax: 10 },
        stockScare: { day: ['mon', 'tue', 'wed', 'thu'], shock: -0.05, rebound: 0.05 },
        bloodDrive: { day: 'any', min: 60, hp: 20, karma: 5, cash: 50 },
      },
    },

    // ---------------------------------------------------------------------------------------------
    // B-20 Encounters (P1). capDay / capWeek per id; D is the chance(stat, D) difficulty.
    encounters: {
      perDay: [1, 3],
      lifetimeMin: 180,
      hpGuard: { fight: 20, climb: 10 },
      tourist: { weight: 10, capDay: 1, capWeek: 3, when: 'day', karma: 2, cashChance: 0.5, cash: 10 },
      wallet: { weight: 8, capDay: 1, capWeek: 2, when: 'any', returnKarma: 5, keep: { base: 20, rand: [0, 130], karma: -5 } },
      magician: { weight: 6, capDay: 1, capWeek: 3, window: [600, 1320], tip: 5, chaChance: 0.5, heckle: { cha: 1, karma: -1 } },
      mugger: { weight: 6, capDay: 1, capWeek: 2, when: 'night', pay: { base: 20, rand: [0, 80] }, fight: { D: 75, hp: 20 }, run: { D: 25 } },
      flyer: { weight: 8, capDay: 1, capWeek: 2, when: 'day', coupon: { pct: 50, max: 1 } },
      jogger: { weight: 6, capDay: 1, capWeek: 3, window: [360, 720], stake: 20, D: 75, str: 1 },
      petition: { weight: 6, capDay: 1, capWeek: 3, when: 'day', karma: 1 },
      pickpocket: { weight: 5, capDay: 1, capWeek: 2, when: 'night', stat: 'int', D: 75, cashPct: 0.05 },
      cat: { weight: 4, capDay: 1, capWeek: 2, when: 'day', where: 'park', stat: 'str', D: 25, karma: 3, hp: 10 },
      oldlady: { weight: 5, capDay: 1, capWeek: 3, window: [480, 1080], min: 30, karma: 3 },
      scout: { weight: 3, capDay: 1, capWeek: 1, cha: 200, min: 180, cash: 500 },
      busker: { weight: 6, capDay: 1, capWeek: 3, where: ['park', 'plaza'], tip: [2, 20], karmaPerDollars: 10 },
      stalledcar: { weight: 4, capDay: 1, capWeek: 2, when: 'day', where: 'roads', str: 40, cash: 20, strGain: 1 },
      puddle: { weight: 6, capDay: 1, capWeek: 3, when: 'rain', stat: 'int', D: 25, cha: -1 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-21 Perks (P1). The perk defs (stat, level, text) are js/data/perks.js; these are the rules.
    perks: {
      levels: [100, 250, 450, 700],
      ironStomach: { heal: 1.25 },
      hardLanding: { damage: 5 },
      brawler: { ap: 1 },
      packMule: { bust: 10 },
      intimidating: { dD: -20 },
      marathoner: { speed: 1.15 },
      secondWind: { perDay: 1, hp: 1 },
      heavyHitter: { damage: 1.25 },
      speedReader: { studyMin: 90, paperMin: 0 },
      couponClipper: { pct: 10 },
      marketSense: { spread: 0 },
      tinkerer: { hotwireInt: 150, sweet: 1.5 },
      workaholic: { overtimeHp: 0, overtimePerDay: 2 },
      cardSharp: { suspicion: 0.75 },
      mastermind: { seminarCash: 0 },
      taxWizard: { t1: 200000 },
      regular: { beer: 15, mingleTip: 1 },
      smoothTalker: { pawn: 0.55, haggle: 0.10 },
      silverTongue: { tour: 1.15 },
      fastTalker: { dD: -40, bribe: 0.5 },
      networker: { shifts: -1 },
      crowdPleaser: { openMic: 2, tourHook: 1 },
      magnetic: { poll: 5 },
      charmingRogue: { jailDays: -2, jailMin: 1, bail: 0.5 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-22 Traffic and pedestrians. Lanes: Main southbound x 2398 / northbound x 2580; West Ave
    // westbound y 1424 / eastbound y 1616; East Ave westbound y 2286 / eastbound y 2476.
    traffic: {
      lanes: { main: { s: 2398, n: 2580 }, west: { w: 1424, e: 1616 }, east: { w: 2286, e: 2476 } },
      spawnInterval: { day: [3, 6], night: [8, 14], dayFrom: 420, dayTo: 1200 },   // s; 07:00-20:00
      maxCars: 14,
      cruise: [360, 520],
      gap: 72,
      brake: 1400,
      notice: { base: 0.55, karmaDiv: 250, min: 0.2, max: 0.95, range: 220 },   // always on a zebra
      junction: { mainStraight: 0.7, mainTurn: 0.3, avenueLeft: 0.5, avenueRight: 0.5, boxCars: 1 },
      rain: { brake: 1.3 },
      fog: { speed: 0.8 },
      simulateRange: 2,                // screens from the camera
    },
    crowd: {
      byHour: [                        // from / to in clock minutes (to < from wraps past midnight)
        { from: 360, to: 540, n: 18 }, { from: 540, to: 1020, n: 26 }, { from: 1020, to: 1260, n: 30 },
        { from: 1260, to: 120, n: 12 }, { from: 120, to: 360, n: 4 },
      ],
      rain: 0.5,
      preset: { high: 1, medium: 1, low: 0.5 },
      maxPeds: 40,
      speed: [90, 140],
      separation: 20,
      barkIntervalSec: 4,
    },

    // ---------------------------------------------------------------------------------------------
    // B-26 Street (every street interaction is an action of data/buildings/street.js)
    street: {
      harold: {
        give10: { cash: 10, min: 60, karma: 2, firstCha: 6 },          // orig
        giveBottle: { items: { booze: 1 }, min: 60, karma: 0, firstCha: 8 },   // orig
        giveTakeout: { min: 30, karma: 1, daily: 1 },                  // P1 arcs
        comeback: { give10s: 5, takeouts: 1, shirtMin: 30, interviewWins: 2, lateDays: 3, repayDays: 14, repay: 2000, repayKarma: 10 },
        barfly: { bottles: 5, ap: 1 },
        exclusive: { step: 3 },
      },
      kid: {
        givePack: { min: 60, karma: -2, skateboardAt: 1, deathAt: 10, deathKarma: -30 },   // orig
        giveGum: { min: 30, karma: 1 },
        good: { gumDays: 3, contestDelayDays: 3, contestWindow: [720, 1080], watchMin: 120, karma: 10 },
        exclusive: { packs: 3, gumDays: 3 },
      },
      red: {
        buy: { price: 400, maxHeld: 99, min: 0, karmaPer10g: -1 },    // $400 a gram, 0 min (orig)
        credit: { afterGrams: 50, grams: 20, dueDays: 7, reofferDays: 7, goons: { n: 6, fights: 2 }, winHeat: 10 },
        loyal: { grams: 100, pct: 10 },
        week: { rand: [90, 110], div: 100 },
        turnIn: { karma: 15, cash: 1000, newGuyDays: 14, newGuyMarkup: 1.15 },
      },
      junker: {
        hotwire: { int: 350, min: 60, karma: -5, heat: 15 },         // INT < 350 fails, 60 min (orig)
        ring: { int: [200, 349], tinkererInt: 150, min: 60, hpAbove: 45, hits: 3, missHp: 15, misses: 3, alarmHeat: 10,
          // The sweet arc: clamp(base + (INT - from) × perInt, min, max) degrees (GDD §6.5; docs/requests/W1-M.md 4).
          arc: { base: 20, perInt: 0.2, from: 200, min: 8, max: 70 } },
      },
      shirt: { price: 20, stack: 1 },
    },

    // B-27 Park and civic
    park: {
      jog: { min: 60, str: 1, hp: 3 },
      chess: { stake: 20, min: 60, int: 1, D: 150, win: 20, daily: 3 },
      ducks: { cash: 2, min: 30, karma: 1, daily: 1 },
      benchNap: { min: 60, hp: 10, daily: 1, pickpocket: { karmaBelow: 0, chance: 0.10, cashPct: 0.10 } },
      skate: { min: 60, str: 1, cha: 1, daily: 1 },
      binoculars: { cash: 1, min: 30 },
      preacher: { min: 30, window: [360, 1320], karma: 1, daily: 1 },
      crease: { cash: 0, min: 0 },
      scraps: { count: 5, int: 15 },
    },
    civic: {
      charity: { step: 100, max: 1000, karmaPerDollars: 100, dailyKarma: 10 },
      soup: { min: 180, karma: 4, cha: 1, daily: 1 },
      fine: { dollarsPerPoint: 50 },
      mchollandOffer: { heat: 20 },
      mchollandTip: { min: 30, weekly: 1, heatMult: 0.5 },
      mchollandBribe: { cash: 2000, days: 7, karmaBelow: 0 },
      commercial: { min: 180, cash: 500 },
      bloodDrive: { min: 60, hp: 20, karma: 5, cash: 50 },
      recycling: { karmaPerDollars: 500, karmaMin: 1, karmaMax: 10 },
    },

    // ---------------------------------------------------------------------------------------------
    // B-28a Price modifiers (ARCHITECTURE §6.10): kind markup (×) and add (+) on the base, then
    // fixed (the minimum wins), then percent (only the largest applies), then round half up, ≥ $0.
    // targets / except are dotted globs; `when` is a condition list; `feature` gates a P1 row;
    // `value` may name a named fn (SR.def.fn) that returns the number; `consume` + `item` use up one
    // item only if that row is the percent discount applied.
    priceMods: [
      { id: 'takeout', kind: 'add', value: 2, targets: ['food.mcsticks.*'], when: [['fn', 'mods.param', 'variant', 'takeout']], feature: 'shopsPlus' },
      { id: 'catalogueDelivery', kind: 'markup', value: 1.10, targets: ['catalogue.*'], except: ['catalogue.sportscar'], when: [], feature: 'homesPlus' },
      { id: 'redWeek', kind: 'markup', value: 'mods.redWeek', targets: ['product.red'], when: [], feature: 'arcs' },
      { id: 'newGuy', kind: 'markup', value: 1.15, targets: ['product.red'], when: [['fn', 'mods.atLeast', 'npc.dealer.turnedInDay', 1]] },
      { id: 'thuTriple', kind: 'fixed', value: 40, targets: ['food.mcsticks.tripleburger'], when: [['weekday', ['thu']]], feature: 'calendar' },
      { id: 'thuMega', kind: 'fixed', value: 100, targets: ['food.mcsticks.megameal'], when: [['weekday', ['thu']]], feature: 'calendar' },
      { id: 'friBeer', kind: 'fixed', value: 15, targets: ['item.bar.beer'], when: [['weekday', ['fri']]], feature: 'calendar' },
      { id: 'regular', kind: 'fixed', value: 15, targets: ['item.bar.beer'], when: [['perk', 'regular']] },
      { id: 'beerSubsidy', kind: 'fixed', value: 10, targets: ['item.bar.beer'], when: [['fn', 'mods.decree', 'beerSubsidy']] },
      { id: 'freeFriesFriday', kind: 'fixed', value: 0, targets: ['food.mcsticks.*'], when: [['fn', 'mods.decree', 'freeFriesFriday'], ['weekday', ['fri']]] },
      { id: 'wedClasses', kind: 'fixed', value: 10, targets: ['class.*'], when: [['weekday', ['wed']]], feature: 'calendar' },
      { id: 'mastermind', kind: 'fixed', value: 0, targets: ['seminar.*'], when: [['perk', 'mastermind']] },
      { id: 'nationalised', kind: 'fixed', value: 0, targets: ['ticket.*'], when: [['fn', 'mods.decree', 'nationalised']] },
      { id: 'employee', kind: 'percent', value: 25, targets: ['food.mcsticks.*'], when: [['jobTrack', 'mcsticks']] },
      { id: 'goodKarma', kind: 'percent', value: 10, targets: ['food.mcsticks.*', 'food.store.*', 'item.store.*', 'item.pawn.*', 'furniture.*', 'catalogue.*'], when: [['karma', 50, null]], feature: 'karmaTiers' },
      { id: 'couponClipper', kind: 'percent', value: 10, targets: ['food.mcsticks.*', 'food.store.*', 'item.store.*', 'item.pawn.*'], when: [['perk', 'couponClipper']] },
      { id: 'flyerCoupon', kind: 'percent', value: 50, consume: true, item: 'coupon', targets: ['food.mcsticks.*'], when: [['item', 'coupon', 1]] },
      { id: 'burgerDay', kind: 'percent', value: 50, targets: ['food.mcsticks.*'], when: [['cityEvent', 'burgerDay']], feature: 'calendar' },
      { id: 'redLoyal', kind: 'percent', value: 10, targets: ['product.red'], when: [['fn', 'mods.atLeast', 'npc.dealer.bought', 100]], feature: 'arcs' },
      { id: 'redBad', kind: 'percent', value: 10, targets: ['product.red'], when: [['karma', null, -50]], feature: 'karmaTiers' },
      { id: 'fastTalker', kind: 'percent', value: 50, targets: ['police.bribe'], when: [['perk', 'fastTalker']] },
      { id: 'charmingRogue', kind: 'percent', value: 50, targets: ['bail'], when: [['perk', 'charmingRogue']] },
    ],

    // B-28b Check modifiers: chance = clamp(stat / (stat + max(1, D + ΣdD)) + Σadd, 0.05, 0.95);
    // a row of kind always returns its value (1). `checks` are dotted globs over check ids.
    checkMods: [
      { id: 'relaxed', kind: 'add', value: 0.10, checks: ['holdup.*', 'police.talk', 'enc.*'], when: [['difficulty', ['relaxed']]] },
      { id: 'badKarma', kind: 'add', value: 0.15, checks: ['holdup.*'], when: [['karma', null, -50]], feature: 'karmaTiers' },
      { id: 'intimidating', kind: 'dD', value: -20, checks: ['holdup.*.str'], when: [['perk', 'intimidating']] },
      { id: 'fastTalker', kind: 'dD', value: -40, checks: ['police.talk'], when: [['perk', 'fastTalker']] },
      { id: 'smoothTalker', kind: 'add', value: 0.10, checks: ['trade.haggle'], when: [['perk', 'smoothTalker']] },
      { id: 'crowdPleaser', kind: 'always', value: 1, checks: ['tour.hook.*'], when: [['perk', 'crowdPleaser']] },
    ],

    // ---------------------------------------------------------------------------------------------
    // B-29 News and the daily log
    news: {
      minWeight: 10,
      logMax: 20,
      weights: {
        electionWon: 100, removed: 95, electionLost: 90, nominated: 85, jailed: 80, bankRobbery: 78,
        hospital: 70, castleBought: 68, promotedCeo: 66, kidDied: 64, promoted: 60, champion: 58,
        degree: 55, haroldRepaid: 52, kidGood: 52, storeRobbery: 50, busted: 50, redTurnedIn: 48,
        homeBought: 45, jackpot: 45, casinoBig: 40, ringWin: 40, fallMilestone: 38, decree: 35,
        tour: 30, smuggleDeal: 20, fightWin: 18, carHit: 15, stockMove: 12, fall: 10, storm: 8,
      },
      casinoBig: 5000,                 // net win > $5,000 in a day
      fallMilestone: { first: 20, every: 25 },
      stockMove: 0.10,                 // a held ticker ±10 %
      templates: { p0: 20, p1: 60 },   // headline templates news.head.<kind>
    },

    // ---------------------------------------------------------------------------------------------
    // B-30 Duel skins. Stance mode: the option whose stat beats the stance has D × beat, the one
    // the stance counters has D × countered, the third plain D.
    duel: {
      stance: {
        stances: ['logic', 'emotion', 'force'],
        hint: { base: 0.5, intDiv: 1000, max: 0.95 },
        beat: 0.5, countered: 2,
        optionBeats: { int: 'emotion', cha: 'force', str: 'logic' },      // Facts > Emotion, Charm > Force, Pressure > Logic
        stanceCounters: { logic: 'cha', emotion: 'str', force: 'int' },   // Logic > Charm, Emotion > Pressure, Force > Facts
      },
      holdup: { mode: 'plain', beats: 3, need: 2, options: { intimidate: 'str', sweetTalk: 'cha', outwit: 'int' } },
      debate: { mode: 'stance', beats: 3, options: { facts: 'int', charm: 'cha', pressure: 'str' }, D: 500, win: 3, lose: -2 },
      interview: { mode: 'stance', beats: 3, need: 2, options: { references: 'int', goodWord: 'cha', loom: 'str' }, D: 100 },
      interrogation: { mode: 'stance', beats: 3, need: 2, options: { facts: 'int', charm: 'cha', pressure: 'str' },
        D: { base: 200, perHeat: 1 }, win: { heat: -10 }, jail: { base: 2, heatDiv: 25 } },
      tourhook: { mode: 'plain', beats: 1, options: { anecdote: 'cha', statistics: 'int', stunt: 'str' }, D: 150, win: 1.2, lose: 0.8 },
      boardroom: {
        mode: 'cards', cards: 3,
        options: {
          safe: { stat: 'int', D: 100, win: [0.05, 0.10], lose: [-0.05, 0] },
          bold: { stat: 'cha', D: 250, win: [0.10, 0.20], lose: [-0.15, -0.05] },
          ruthless: { stat: 'str', D: 250, win: [0.10, 0.20], lose: [-0.15, -0.05], karma: -1 },
        },
        m: [0.7, 1.3], takeoverDMult: 2, takeover: { m: 1.2, bonus: 20000 }, showBestInt: 200, round: 0.01,
      },
    },

    // ---------------------------------------------------------------------------------------------
    // B-31 Health
    health: {
      tooHurt: 'above',                // a voluntary action with worst-case HP cost c requires HP > c
      secondWind: { perDay: 1, hp: 1 },
      hospital: {
        bill: { standard: { min: 50, pct: 0.10 }, relaxed: { min: 0, pct: 0 } },   // a forced charge
        hpPct: 0.5,                    // B-31 hospital.hp: floor(0.5 × hpMax), set (not added)
        wake: 720,                     // 12:00 the next day, outside the home door you live at
        night: 'hospital',
      },
      hardcore: 'death',
    },
  });
})();
