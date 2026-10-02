// js/data/features.js — owner: W1-K; the lead flips flags at each wave's integration (BUILD_PLAN §7).
// The feature flags of BUILD_PLAN Appendix B, read as SR.features.<flag>. Every def with p ≥ 1
// carries feature: '<flag>' from this list; cards, previews, the Bag, the Pocket, dialogs and
// encounter seeding hide it while the flag is off. There is no other switch for P1 / P2 behaviour.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.features({
    // P1 (wave 3)
    weather: false,       // the Markov weather, forecasts and weather effects (W3-Light)
    shadows: false,       // sun shadows (W3-Light)
    timelapse: false,     // the time-lapse on exit (W3-Light)
    cityReacts: false,    // billboard, flags, statue, bunting, posters, headlines, crowd reactions (W3-Light)
    calendar: false,      // weekly bonuses, city events and their City Hall rows (W3-Econ / W3-Life)
    hustles: false,       // Hustle buttons, rating, shift variants, Shift Manager, CEO takeover (W3-Econ)
    shiftEvents: false,   // shift event cards (W3-Life)
    degrees: false,       // extra classes, seminars, degrees, transcript (W3-Econ)
    perks: false,         // stat-milestone perks (W3-Prog)
    karmaTiers: false,    // karma tier perks and glyphs (W3-Prog)
    homesPlus: false,     // tier-2 furniture, home perks, nap, leftovers, let / sell, CDs, Workstation catalogue, Paperweight Realty (W3-Econ)
    stockTips: false,     // the daily tip, Market Watch, Workstation trading, the paper (W3-Econ)
    shopsPlus: false,     // knuckles, vest, used skateboard, pawn Sell, scratch, gum, takeout, mega meal (W3-Econ)
    tours: false,         // speaking tours, haggling, reputation, rumours, the vest in muggings (W3-Crime)
    police: false,        // officers, the Precinct desk, bail and the lawyer, McHolland, informant rows (W3-Crime)
    civicPlus: false,     // charity box, soup kitchen, kiss babies, campaign events, decrees (W3-Crime / W3-Life)
    nightlife: false,     // Buzz effects, Mingle, Open Mic, darts matches, Guard, the Ring, VIP, pit boss, the Classic cabinet (W3-Nightlife)
    arcs: false,          // Harold, Skid, Red and McHolland arcs (W3-Life)
    encounters: false,    // street encounters (W3-Life)
    park: false,          // the park walk-ups, Point Margin, Brother Margin (W3-Park)
    scraps: false,        // Theory of the Fold (W3-Park)
    advisor: false,       // the Advisor and the Road to Office (W3-Prog)
    achievements: false,  // achievements, the Hall of Fame, the legacy score, the results graphs (W3-Prog)
    tutorial: false,      // the full Day 1 script and hints; P0 has the First Day list only (W3-Onboard)
    phone: false,         // the Pocket's Phone tab: Cab, Summon car, Stocks by phone, flagless contacts (W3-Econ)
    accessories: false,   // the new-game accessory carousel, UI §5.3 (built by W2-Front; CONTRACT D68)
    // P2 (wave 4)
    customLength: false,  // Custom 7-365 days (W4-Rules / W4-UI)
    fleaMarket: false,    // the Sunday flea market (W4-Rules / W4-UI)
    aquarium: false,      // the aquarium (W4-Rules)
    lean: false,          // the perspective lean option (W4-Perf)
    wardrobe: false,      // changing accessories after creation (W4-Rules / W4-UI)
  });
})();
