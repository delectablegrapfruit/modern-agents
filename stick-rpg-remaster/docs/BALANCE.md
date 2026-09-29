# Paper Sky: Balance Tables

Every number of the game in one place. `js/data/tuning.js` mirrors this document key for key:
each table names its `tuning` path, and the implementer copies the values verbatim. The balance
wave changes numbers only in `tuning.js` (and then here), driven by the simulator (§B-25).
GDD sections are cited as GDD §n. Money is in dollars, time in minutes unless a column says h.
(orig) marks values of the original game. Colours are not numbers: the karma bands and every
palette live in `js/art/palette.js` (B-04c). Tables B-26 to B-31 (street, park and civic, price and
check modifiers, news weights, Duel skins, health) follow the tuning protocol B-25.

| Table | `tuning` path | W1 owner (transcribes it) |
|---|---|---|
| B-01 … B-31 | as named in each heading | W1-R transcribes every table into `js/data/tuning.js`; a missing value is a W1-R bug |

**Wave-1 integration.** Rows marked *(w1)* were added at the wave-1 integration: numbers the GDD
states that the kernel, the engines and the world needed as keys (CONTRACT D55). `js/data/tuning.js`
has them under the same names; a module that still holds a named fallback of the same value
switches to the row. Where `tuning.js` names a key differently from an older BALANCE key, the table
gives the tuning name (the old one in brackets). Engine and presentation limits (the save's
retention and budget, the stat-check clamp, the inbox cap, the stamp threshold, the mix, the render
budgets) are named constants in their files, not tuning (CONTRACT D49).

## B-01 Time — `tuning.time`

| Key | Value | Notes |
|---|---|---|
| `stepMin` | 30 | all costs are multiples of 30 m |
| `dayEnd` | 1440 | the wall: start only if `now + cost ≤ 1440` |
| `wake` | 480 | 08:00 (orig) |
| `alarmMinus` | 240 | alarm clock (orig) |
| `pillMinus` | 240 | caffeine pill (orig) |
| `pillRestorePenalty` | 20 | HP off the night's restore (orig) |
| `robStartBefore` | 1260 | a robbery may start only while `now < 1260` (orig `time < 21`); with 30 m steps the latest start is 20:30 |
| `redEyeDeparts` | 0 | 00:00 only (orig) |
| `tourWindow` | [360, 600] | board a speaking tour at any time with 06:00 ≤ now ≤ 10:00; the bus leaves when you board |
| `waitTour` | 360 | "Wait for the tour bus" (bus board, before 06:00) sets the clock to 06:00 |
| `openMicWindow` | [1080, 1440] | Tuesday, start at 18:00 or later (the wall applies) |
| `skateContestWindow` | [720, 1080] | Sunday 12:00-18:00, 120 min |
| `encounterDayWindow` | [wake, 1380] | day encounters are seeded between the wake time and 23:00 |
| `encounterNightWindow` | [1260, 1440] plus [0, 240] on days with wake ≤ 0 | the mugger and the pickpocket |
| `tripEndsAt` | 1440 | bus trips and robberies set the clock here |
| `repeatHoldMs` | 350 | hold Enter / A repeat interval (only `repeatable` actions; setting `holdRepeat`) |
| `weekStart` | 0 | day 1 is Monday (weekday 0); `week = floor((day - 1) / 7)` for every weekly limit |
| `marketNights` | [0,1,2,3,4] | the nights that end Mon-Fri tick the market (decided by the ended day's weekday) |
| `weekdays` *(w1)* | mon, tue, wed, thu, fri, sat, sun | the names conditions accept (`weekday(list)`) |
| `skateContestMin` *(w1)* | 120 | watching the Sunday skate contest (the `skateContestWindow` row's "120 min") |
| `buzzDecayMin` *(w1)* | 120 | Buzz -1 each time an action's time passes a multiple of 120 min on the clock (GDD §4.2) |

## B-02 New character — `tuning.start`

| Key | Value |
|---|---|
| `statRoll` | rand(1..10) each for STR, INT, CHA (orig) |
| `extraRoll` | rand(3..9) points to distribute (orig) |
| `fairStart` | 7 / 7 / 7 + 6 extra |
| `cash` | Relaxed 300, Standard 100 (orig), Hardcore 100 |
| `hpMaxBase` | 15 (HP max = 15 + STR always, orig; only STR gains change it) |
| `statCap` | 999 |
| `karmaRange` | -100..+100 |
| `heatRange` *(w1)* | [0, 100] (GDD §4.2) |
| `buzzRange` *(w1)* | [0, 5] (GDD §4.2) |
| `nameMax` | 16 characters |
| `cheat` | name `PAPERGOD` → STR/INT/CHA 555, cash 10,000, name "Totally Legit", achievements off |
| `startJob` | Fry Cook (hired, orig) |
| `startPlace` | inside the apartment (home screen), 08:00, day 1 |

## B-03 Training — `tuning.training`

`gain` is before degree (+1) and Winded (×0.5, floor, min 1) modifiers. Every action with an HP cost
`c` requires HP > c (reason "Too hurt"; `hpAbove(c)`); Heat Wave multiplies training HP costs by
1.5 (rounded up) and the requirement with them.

| Id | Where | Cash | Min | Gain | HP | Daily limit | Extra |
|---|---|---|---|---|---|---|---|
| `study` | uofs | 0 | 120 | INT +2 | 0 | none | Speed Reader: 90 min |
| `classBiz` | uofs | 20 (Wed 10) | 120 | INT +4 | 0 | none | counts 1 Business class |
| `gym` | uofs | 0 | 120 | STR +2 | -4 | none | |
| `classKin` | uofs | 20 (Wed 10) | 120 | STR +4 | -6 | none | counts 1 Kinesiology class |
| `classThr` | uofs | 20 (Wed 10) | 120 | CHA +4 | 0 | none | counts 1 Theatre class |
| `seminar` | uofs | 150 (Mastermind: 0) | 180 | track stat +10 | 0 | 2 per day, all tracks | needs stat ≥ 150 and ≥ 10 classes in the track |
| `onlineCourse` | home (Workstation) | 10 | 120 | INT +3 | 0 | 1 | |
| `tvNews` | home (TV) | 0 | 60 | INT +2 | 0 | 2 | 60 % of viewings reveal the daily tip |
| `tvFitness` | home (satellite) | 0 | 60 | STR +2 | 0 | 2 | |
| `tvDating` | home (satellite) | 0 | 60 | CHA +2 | 0 | 2 | |
| `tvMarket` | home (satellite, P1) | 0 | 60 | INT +1 | 0 | 1 | always reveals the daily tip |
| `beer` | bar | 20 (Fri 15; Regular perk 15; Beer Subsidy 10) | 60 | CHA +2 | 0 | Buzz < 5 | Buzz +1 |
| `mingle` | bar | 5 | 60 | CHA +1 | 0 | none | rumour; 30 % reveals the daily tip (Regular perk: 100 %) |
| `openMic` | bar, Tue ≥ 18:00 | 0 | 120 | CHA +3 | 0 | 1 per week (`weekly.openMic`) | tips 5 + floor(CHA/20) (Crowd Pleaser ×2) |
| `jog` | park | 0 | 60 | STR +1 | -3 | none | |
| `chess` | park | stake 20 | 60 | INT +1 | 0 | 3 | win +20 on chance(INT, 150), else -20 |
| `paper` | store | 2 | 30 | INT +1 | 0 | 1 | reveals the daily tip and the forecast; Speed Reader: 0 min |
| `smoke` | bag | 1 pack ($10) | 60 | CHA +1 | -10 | needs HP > 10 | karma -1 (orig) |
| `barFightWin` | bar | — | 180 | STR +3 (HP max rises with it) | fight | none | orig |
| `nightFurnitureT1` | sleep | — | — | +2 per tier-1 stat piece | — | — | orig +1 |
| `nightFurnitureT2` | sleep | — | — | +4 per tier-2 stat piece | — | — | |

| Key | Value |
|---|---|
| `degree.classes` | 20 classes in one track |
| `degree.bonusStat` | +25 once |
| `degree.perGain` | +1 on every later gain of that stat, except nightly furniture |
| `degree.ceremonyMin` | 60 |
| `degree.tracks` *(w1)* | biz → INT, kin → STR, thr → CHA (the degree bonus's track → stat map) |
| `uofsKarma` | +1 per U of S activity (orig), max +3 per day |
| `winded.threshold` | HP < 25 % of HP max |
| `winded.factor` | 0.5 (floor, min 1) |
| `winded.min` *(w1)* | 1 (the minimum of a Winded gain); Winded is judged after the action's own HP cost |
| `nap` | 120 min, +15 % of HP max (floor), 1 per day, home only |

**Value-of-an-hour check** (points per hour → cost per point): study 1.0 → $0; class 2.0 → $5
($2.5 Wed); seminar 3.3 → $15; TV 2.0 → $0 (capped at 2 h per channel); beer 2.0 → $10; jog 1.0;
gym 1.0.

## B-04 Karma — `tuning.karma`

### B-04a Changes

| Event | Δ | Notes |
|---|---|---|
| Full shift, any job | +1 | orig |
| Promotion | +3 | orig |
| U of S activity | +1 | orig; max +3 a day |
| Give Harold $10 | +2 | orig (costs 60 min; B-26) |
| Give Harold a bottle | 0 | orig (60 min) |
| Give Harold takeout / the kid gum | +1 | once a day each (P1) |
| Charity box | +1 per $100 | max +10 a day |
| Soup kitchen | +4 | |
| Encounter help | +2..+5 | per encounter (B-20) |
| Buy a beaten opponent a drink | +1 | |
| Speaking tour | +2 | |
| Turn in Red | +15 | |
| Harold repays you | +10 | |
| Kid's good ending | +10 | |
| Door-knocking (President campaign) | +1 | |
| Hold court (castle perk) | +1 | |
| Feed the ducks / listen to Brother Margin | +1 | once a day each |
| Smoke a pack | -1 | orig |
| Gamble (slot pull, roulette spin, blackjack hand) | -1 | orig; max -10 a day |
| Start a bar fight | -2 | orig |
| Take the wallet | -3 | orig |
| Give the kid a pack | -2 | orig |
| The kid dies | -30 | orig |
| Buy product from Red | -1 per 10 g, rounded up | new; one NumberField purchase of n grams costs -ceil(n / 10) |
| Take a smuggling deal | -5 | orig |
| Rob the store | -10 | orig; win or lose |
| Rob the bank | -20 | win or lose |
| Default on a loan | -10 | |
| Hotwire the junker | -5 | |
| Keep a found wallet | -5 | |
| Intimidate rivals / Bribe officials | -5 / -10 | |
| Bribe a police officer | -3 | |
| Seize the Bank decree | -30 | |
| Statue of Me decree | +2 / -2 a night | President / Dictator (night step 9) |

### B-04b Tiers (P1)

| Tier | Range | Perk |
|---|---|---|
| Angelic | ≥ +80 | halo glyph; all Good perks |
| Good | +50..+79 | 10 % off at McSticks, the store, the pawn shop and Fine Line; savings rate +0.25; Heat decays 15 a night (instead of 10) |
| Neutral | -49..+49 | none |
| Bad | -79..-50 | +0.15 on each Hold-up beat; Red charges 10 % less |
| Wicked | ≤ -80 | horns glyph; all Bad perks; smuggling offers +10 %; McHolland stops offering deals |

A karma-tier discount and a perk discount on the same price never stack: only the largest
percentage discount applies (B-28a). Crowd reactions (waving at ≥ +50, stepping aside at ≤ -50)
belong to the `cityReacts` flag, not to the tiers, and use the same ±50 thresholds.

### B-04c Colour bands (orig palettes)

Band index `i = clamp(ceil(|karma| / 10) - 1, 0, 9)` (0..10 → 0, 11..20 → 1, ..., 91..100 → 9).
`tuning.karma` holds only this index formula; the colours below live in `js/art/palette.js` as
`karma.good[i]` and `karma.evil[i]` (the only place hex is allowed, with `css/tokens.css`).

| i | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| good | #0066CC | #017CF8 | #218FFE | #45A2FE | #70B7FE | #8FC8FE | #BFDFFF | #DFEFFF | #EEF7FF | #FFFFFF |
| evil | #0066CC | #0110C9 | #6500CA | #9700CA | #BA01C9 | #C9018D | #CA005B | #CA001A | #CA0000 | #CA0000 |

Rank columns: karma > +20 good, < -20 evil, otherwise neutral (orig).

## B-05 Jobs — `tuning.jobs`

| Id | Title | Track | INT | CHA | Shifts at current rank | $/h | Full 6 h | Credit limit |
|---|---|---|---|---|---|---|---|---|
| `cook` | Fry Cook | mcsticks | 0 | 0 | — | 7 | 42 | 1,000 |
| `manager` | Shift Manager (P1) | mcsticks | 0 | 20 | 15 cook shifts | 10 | 60 | 2,000 |
| `janitor` | Janitor | nli | 20 | 0 | — | 10 | 60 | 2,000 |
| `mail` | Mail Room Clerk | nli | 40 | 0 | 3 | 15 | 90 | 3,000 |
| `sales` | Salesperson | nli | 75 | 25 | 3 | 25 | 150 | 5,000 |
| `exec` | Executive | nli | 120 | 50 | 4 | 50 | 300 | 10,000 |
| `vp` | Vice President | nli | 180 | 90 | 5 | 120 | 720 | 25,000 |
| `ceo` | CEO | nli | 250 | 140 | 6 | 300 | 1,800 | 50,000 |
| `office` | President / Dictator | city | election | | | $10,000 a night | | 250,000 |

In office you keep your NLI rank and may still work shifts.

| Key | Value |
|---|---|
| `shift.full` | 360 min, +1 karma |
| `shift.half` | 180 min, same $/h, no karma, counts 0.5 shift |
| `shift.overtime` | 120 min at 1.5× $/h, -10 HP (needs HP > 10), once a day, only right after a Full shift with no action in between (`job.lastFullEnd == now`) (Workaholic: no HP cost, twice) |
| `employeeDiscount` | 25 % at McSticks while you hold a McSticks job |
| `weeklyBonus` | Friday night: exec 10 %, vp 20 %, ceo 30 % of the week's NLI wages (Mon-Fri); `weekNliWages` and `weekNliShifts` reset on Monday morning |
| `hustle.m` | 0.7..1.3; Auto exactly 1.0; rain +20 % tips on `orderup` (m × 1.2, cap 1.3) |
| `hustle.skins` | cook, manager → `orderup`; janitor, mail → `sortit`; sales → `pitch` step 0; exec → `pitch` step 1; vp, ceo → `boardroom` |
| `hustle.orderup` / `sortit` | m = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3); 30 s; tickets every 6 s → 3 s; sortit counts 1 correct per 3 items: on the belt `itemsPerCorrect` (3) items arrive per ticket interval, one every `ticketEverySec / 3` = 2 s → 1 s (so a clean round with streaks reaches m ≈ 1.2-1.3) |
| `hustle.orderup.items` *(w1)* | [2, 5] items per ticket (GDD §6.5) |
| `hustle.sortit.streak` *(w1)* | { step: 0.1, max: 1.5, every: 3 }: every 3 right sorts in a row the multiplier steps ×1.1, up to ×1.5 (GDD §6.5) |
| `hustle.sortit.travelSec` *(w1)* | [3.2, 2.2]: a belt item takes 3.2 s end to end at the start of the round, 2.2 s at its end |
| `hustle.pitch` | 5 presses; needle 180 + 30 × step °/s; sweet arc = min(0.40, 0.08 + CHA/4000) of the ring; m = 0.7 + 0.12 per hit |
| `rating` | EMA α 0.3, start 1.0; VP and CEO need ≥ 0.9 |
| `shiftEventChance` | 0.25 |
| `shiftEvents` | 24 in data: 3 per rank × 8 ranks (cook, manager, janitor, mail, sales, exec, vp, ceo) |
| `ceoTakeover` | 3rd week as CEO (`ceoSinceDay + 14 ≤ day < ceoSinceDay + 21`, once); Boardroom at D × 2; m ≥ 1.2 → +$20,000 |
| `mondayBonus` | +1 CHA on the first shift of a Monday |
| `relaxedWages` | ×1.25 |
| `fourDayWeek` | ×1.25 (decree) |

Promotion shift counts: Networker perk -1 at each rank (min 0).

## B-06 Items and prices — `tuning.items`

| Id | Where | Price | Effect | Min | Stack | P |
|---|---|---|---|---|---|---|
| `milkshake` | mcsticks | 8 | +12 HP | 30 | eat now | P0 |
| `fries` | mcsticks | 12 | +20 HP | 30 | eat now | P0 |
| `cheeseburger` | mcsticks | 25 | +40 HP | 30 | eat now | P0 |
| `tripleburger` | mcsticks | 50 (Thu 40) | +80 HP | 30 | eat now | P0 |
| `megameal` | mcsticks, HP max ≥ 200 | 120 (Thu 100) | +200 HP | 30 | eat now | P1 |
| `takeout` | mcsticks | item price + 2 | the item's HP, eaten later (30 m) | 0 to buy | 5 | P1 |
| `slushee` | store | 1 | +1 HP | 30 | eat now | P0 |
| `candybar` | store | 2 | +3 HP | 30 | eat now | P0 |
| `nachos` | store | 4 | +7 HP | 30 | eat now | P0 |
| `smokes` | store | 10 | see B-03 `smoke` | 0 | 99 (orig) | P0 |
| `pills` | store | 45 | wake -4 h, restore -20 HP | 0 | 99 (orig) | P0 |
| `paper` | store | 2 | B-03 `paper` | 30 | 1 per day | P1 |
| `scratch` | store | 5 | B-14e | 0 | 20 | P1 |
| `gum` | store | 1 | kid arc | 0 | 9 | P1 |
| `knife` | pawn | 100 | punch and kick +2 dmg (orig) | 0 | 1 | P0 |
| `gun` | pawn | 400 | robbery, trips (orig) | 0 | 1 | P0 |
| `ammo` | pawn | 10 per 5 | refused at ≥ 95 (orig) | 0 | 99 | P0 |
| `alarm` | pawn | 200 | wake -4 h (orig) | 0 | 1 | P0 |
| `phone` | pawn | 200 | trips, apps (orig) | 0 | 1 | P0 |
| `knuckles` | pawn | 300 | punch +4 dmg | 0 | 1 | P1 |
| `vest` | pawn | 900 | -30 % fight damage taken; halves cash lost in muggings | 0 | 1 | P1 |
| `skateboard` | pawn (used) | 300 | ×2 speed; only if you have none | 0 | 1 | P1 |
| `booze` | bar | 30 | commodity (orig "bottle of beer") | 0 | 999 | P0 |
| `snow` | Red | 400 (modifiers B-28a) | commodity (orig price); bought as n grams with a NumberField, -ceil(n/10) karma | 0 | 99 (orig) | P0 |
| `shirt` | pawn | 20 | Harold's comeback (shown once he asks) | 0 | 1 | P1 (`arcs`) |
| `sportscar` | Workstation catalogue | 60,000 | the sports car, delivered to its home lot, `bought: true` | 0 | 1 | P1 (`homesPlus`) |
| catalogue furniture | Workstation catalogue | Fine Line price × 1.10 (delivery) | any Fine Line piece without walking there | 0 | — | P1 (`homesPlus`) |

| Key | Value |
|---|---|
| `pawnBuyback` | 40 % of price for pawn items (Smooth Talker 55 %) |
| `refuseAtFullHp` | true (orig) |
| `ironStomach` | food heals ×1.25 |

Every discount, special price and markup (employee, Good tier, Coupon Clipper, the flyer coupon,
Thursday and Friday prices, the Regular perk, Beer Subsidy, Free Fries Friday, Burger Day, Red's
prices, the takeout surcharge, catalogue delivery) is a row of **B-28a**, applied in its fixed
order.

## B-07 Sleep — `tuning.sleep`

`restore = floor(hpMax × (base + bed + freezer + home)) + flat - pill`, capped at HP max, min 0.

| Key | Value |
|---|---|
| `base` | 0.25 |
| `flat` | 15 |
| `bed` | tier 1 0.10, tier 2 0.20 |
| `freezer` | 0.05 (any home) |
| `home` | apartment 0, bigger apartment 0.05, penthouse 0.10, mansion 0.15, castle 0.20 |
| `pill` | 20 |
| `heatDecay` | 10 a night; 15 at Good karma or better with `karmaTiers` (P1); 25 with Tough on Crime (replaces the others) |
| `buzzReset` | 0 |
| `leftovers` | freezer: 30 min, +25 HP, once a day |
| `relax` | aquarium: 30 min, +10 HP, +1 karma, once a day (P2) |

Examples: HP max 22 (day 1): 5 + 15 = 20 (orig 20). HP max 100 with a bed: 35 + 15 = 50. HP max 600
in the castle with Pod and freezer: 0.70 × 600 + 15 = 435.

## B-08 Homes and furniture — `tuning.homes`, `tuning.furniture`

### B-08a Homes

| Id | Price | Slots | Sleep bonus | Rent a night (0.6 %) | Sell (90 %) | Perk | Perk cost |
|---|---|---|---|---|---|---|---|
| `apt` | 0 | 3 | 0 | — | — | — | — |
| `apt2` | 10,000 | 5 | 0.05 | 60 | 9,000 | Stargaze: +1 INT, +1 CHA | 60 min, daily |
| `pent` | 40,000 | 7 | 0.10 | 240 | 36,000 | Party: +8 CHA | 180 min, $500, weekly |
| `mansion` | 100,000 | 10 | 0.15 | 600 | 90,000 | Swim: +2 STR, +10 HP | 60 min, daily |
| `castle` | 500,000 | 14 | 0.20 | 3,000 | 450,000 | Hold court: +2 CHA, +1 karma | 60 min, daily |

Perks: only the home you live in (one `daily.homePerk`); the party is once per calendar week
(`weekly.party`). Doors: `apt` and `apt2` share the Paperview door (`home_apt`); `pent` →
`home_pent`; `mansion` → `home_mansion`; `castle` → `home_castle`.

### B-08b Furniture

| Id | Name | Tier | Price | Slots | Effect | Upgrades to (credit 50 % of tier-1 price) | P |
|---|---|---|---|---|---|---|---|
| `bed` | Featherfold Bed | 1 | 500 | 1 | sleep +0.10 | `pod` Hibernation Pod, 4,000, 1 slot, +0.20 | P0 / P1 |
| `tv` | Flatland 60 TV | 1 | 2,500 | 1 | News channel | `skydish` SkyDish Satellite, 3,000, 1 slot, + Fitness, Dating, Market Watch | P0 / P1 |
| `pc` | Pixelwright PC | 1 | 2,000 | 1 | Stocks | `workstation` Pixelwright Workstation, 8,000, 1 slot, phone trading, trend arrows, catalogue, online course | P0 / P1 |
| `books` | Grand Atlas of Everything | 1 | 2,000 | 1 | +2 INT a night | `library` Grand Library, 12,000, 2 slots, +4 | P0 / P1 |
| `treadmill` | Tread-Millionaire | 1 | 3,500 | 1 | +2 STR a night | `homegym` Home Gym, 15,000, 2 slots, +4 | P0 / P1 |
| `freezer` | Glacier Chest | 1 | 2,500 | 1 | sleep +0.05; Leftovers | none | P0 |
| `minibar` | Globetrotter Bar Cart | 1 | 5,000 | 1 | +2 CHA a night | `lounge` Cocktail Lounge, 18,000, 2 slots, +4 | P0 / P1 |
| `aquarium` | Paper Reef Aquarium | 1 | 1,200 | 1 | Relax | none | P2 |

P0 satellite: `satellite` SkyDish Satellite, 3,000, no slot, needs `tv`, adds Fitness and Dating.
In P1 it becomes the `skydish` upgrade; the save schema's v2 migration (wave-3 integration) turns
an owned `satellite` into `tv` tier 2, keeping the channels.
Net cost of an upgrade = tier-2 price - 50 % of tier-1 price (pod 3,750, skydish 1,750,
workstation 7,000, library 11,000, homegym 13,250, lounge 15,500).

## B-09 Bank — `tuning.bank`

| Key | Value |
|---|---|
| `rateStart` | rand(10..30) / 10 % per day |
| `rateStep` | `r ← clamp(r + 0.2 × (1.5 - r) + rand(-3..3)/10, 0.25, 3.5)` |
| `goodBonus` | +0.25 on the paid rate (Good tier) |
| `tiers` | T1 ≤ 100,000 at r; T2 100,000-1,000,000 at r/2; T3 > 1,000,000 at r/4 (Tax Wizard: T1 ≤ 200,000) |
| `interest` | `min(25,000, floor(T1·r/100 + T2·r/200 + T3·r/400))`; T1 room is reduced by open CD principal; 0 after Seize the Bank |
| `interestCap` | 25,000 a night |
| `cd.min` | 1,000 |
| `cd.days` | 7 |
| `cd.rate` | r (at opening) × 1.2 per day, simple, paid at maturity |
| `cd.maxOpen` | 3 |
| `cd.maxPrincipal` | 100,000 in total |
| `cd.breakPenalty` | 10 % of principal, no interest |
| `loan.days` | 15 (orig) |
| `loan.rate` | r + 1 % per day, compounding nightly |
| `loan.limit` | by best job, B-05 (orig max 1,000) |
| `loan.warn` | voicemail at 5 and 1 days left |
| `default.seize` | in order until the debt is paid: bank → cash → CDs (broken, principal - 10 %) → stocks (sold at price × 0.995, no fee) → furniture, most expensive first, at 50 % of price → homes not lived in, most expensive first, at 90 % |
| `default.lien` | whatever is still owed becomes `money.lien`; while > 0, 50 % of every income credit (sources `wage`, `rent`, `salary`, `interest`, `deal`, `tour`, `loot`, `win`, `prize`) goes to it; net worth subtracts it |
| `default.penalty` | -10 karma; credit frozen 60 days |
| `default.standard` | seize + lien + penalty; HP = 1 |
| `default.relaxed` | seize + lien + penalty; HP unchanged |
| `default.hardcore` | death (orig): `flags.dead = 'loan'`, the night finishes, then the game ends |
| `charge` | forced charges (bill, tow, tab, mugging, goons' debt, fines): cash → bank → written off; never negative |
| `quickAmounts` | 10 %, 50 %, All; typed integers 1..9,999,999 |

## B-10 Stocks — `tuning.stocks`

| Ticker | Company | Start price | μ per night | σ per night | Quirk |
|---|---|---|---|---|---|
| MCS | McSticks Corp | 12 + rand(-3..3) | +0.20 % | 2.0 % | Burger Day event +5 % |
| NLI | New Lines Inc | 30 + rand(-6..6) | +0.25 % | 3.0 % | +0.30 % drift while you are CEO with ≥ 3 NLI shifts that week |
| SLC | Silver Lining Casino | 20 + rand(-5..5) | 0 | 5.0 % | -4 % the night after you win > 5,000 there in a day |
| PPR | Paper Mills of the 2nd Dimension | 8 + rand(-2..2) | +0.10 % | 2.5 % | -3 % after a rainy day |
| GLU | Glue & Sons | 5 + rand(-1..1) | +0.15 % | 1.5 % | +2 % after a day with any fall |
| SKY | Skyward Air | 3 + rand(-1..1) | -0.10 % | 8.0 % | penny stock |

| Key | Value |
|---|---|
| `tick` | market nights only (B-01); `logret = μ + σ·z + shock`, `z = 2·(u1+u2+u3-1.5)`; `price = round2(price·e^logret)` |
| `reverseSplit` | a close below 1.00: price × 10, held = floor(held / 10), the leftover shares paid out at the close, basis unchanged, history × 10 (replaces the original's $1 floor) |
| `shorts` | none: you can only sell shares you hold |
| `tip.perDay` | exactly 1 per market day; ticker, direction and truth drawn at night step 10 (the start of the day) with that morning's INT |
| `tip.reliability` | `min(0.75, 0.5 + INT/2000)` |
| `tip.sources` | TV News 60 % of viewings; the Daily Fold; Market Watch; Mingle 30 % (Regular: 100 %); Harold's Monday voicemail (arc). Never the report or the HUD |
| `tip.trueShock` | ±(3 + rand(0..2)) % in the stated direction |
| `tip.falseShock` | half the size, in the opposite direction |
| `fee` | $5 per trade |
| `spread` | 0.5 % (buy at price × 1.005, sell at price × 0.995); Market Sense: 0 |
| `positionCap` | cost basis per ticker ≤ 10,000 + 100 × INT |
| `maxShares` | 9,999,999 per ticker (orig 7-digit field) |
| `history` | 30 market nights |
| `stockScare` | event: all tickers -5 %, then +5 % the next market night |

**EV check** (one "up" tip traded at the cap, buy before and sell after the market night):
EV ≈ cap × (rel × 4.08 % - (1 - rel) × 1.98 % - 1 %) - $10. The shock is a log return (`tick`), so
a true 3-5 % tip moves the price by e^s - 1 (4.08 % on average) and a false one by 1 - e^(-s/2)
(1.98 %). Half the tips point down and cannot be traded for profit (no shorts), so the **EV per
market day is about half** the EV per up tip. (The table was corrected at the wave-1 integration:
the old 4 % / 2 % rounding gave $50 at INT 100, a small difference of large terms.)

| INT | reliability | cap | EV per up tip | EV per market day |
|---|---|---|---|---|
| 100 | 0.55 | 20,000 | $60 | $30 |
| 250 | 0.625 | 35,000 | $275 | $135 |
| 500 | 0.75 | 60,000 | $930 | $465 |
| 999 | 0.75 | 109,900 | $1,715 | $855 |

## B-11 Crime — `tuning.crime`

### B-11a Heat sources

| Source | Heat |
|---|---|
| Rob the store (success or fail) | +30 |
| Rob the bank (success or fail) | +60 |
| Take a smuggling deal | +5 per 10 units (rounded up) |
| Start a bar fight | +5 |
| Hotwire success / alarm | +15 / +10 |
| Intimidate rivals / Bribe officials | +10 / +20 |
| Nightly decay | -10 (P1 `karmaTiers`: -15 at Good or better; Tough on Crime: -25 instead) |
| Precinct fine | -1 per $50 |
| Released from jail | set to 20 |
| McHolland tip / bribe | Heat ×0.5 (floor), 30 min, once a week, informant only, not at Wicked / no Heat gains for 7 days ($2,000; karma < 0) |
| McHolland interrogation (street) | win: -10 / lose: jail 2 + floor(Heat/25) days |

### B-11b Robbery

| Key | Store | Bank |
|---|---|---|
| requires | gun, ammo ≥ 10 (orig) | gun, ammo ≥ 10, STR ≥ 100, not yet this week (`weekly.bankRob`) |
| start | now < 21:00 (orig; latest 20:30) | now < 21:00 |
| clock | → 24:00 (orig) | → 24:00 |
| ammo used | rand(5..9) (orig) | rand(5..9) |
| beats | 3, best of three | 3, best of three |
| D per beat | 60 + Heat | 400 + Heat + 100 × (bank robberies in the last 14 days) |
| check ids and modifiers | `holdup.store.<stat>`: B-28b (Relaxed +0.10; P1: Bad/Wicked +0.15, Intimidating: STR beats D - 20; cap 0.95) | `holdup.bank.<stat>`: same |
| loot | 100 + rand(0..499) | 3,000 + rand(0..12,000) |
| karma | -10, win or lose (orig) | -20, win or lose |
| Heat | +30, win or lose | +60, win or lose |
| jail base on failure | 3 (Hardcore 5, orig) | 7 |
| confiscates | nothing | gun and ammo |

Reference odds, store, Heat 0, CHA every beat: CHA 50 → 45 % per beat, 43 % to win; CHA 100 →
62.5 %, 68 %; CHA 300 → 83 %, 93 %. (Orig at CHA 100: 59 %.)

### B-11c Jail

| Key | Value |
|---|---|
| days | base + floor(Heat at arrest / 25) |
| bases | store 3 (Hardcore 5), bank 7, bust 5 (orig), police catch 2 |
| Charming Rogue | -2 days, min 1 |
| per day | a Jail Day choice: STR +2 / INT +2 / CHA +2 (P1: +1 rep in a random city) / +10 HP; then the jail night (GDD §4.7 subset: the economy, no restore, no furniture); a one-line report |
| bail (P1) | `remainingDays × max(500, floor(0.02 × net worth at arrest))`, needs a phone (Charming Rogue × 0.5); `jail.bailBase` stores the per-day amount at arrest |
| release | clock 08:00 the morning after the last jail night, outside City Hall; Heat 20 |
| campaign | jail days are campaign days (the counter still advances) |

### B-11d Police (P1)

| Key | Value |
|---|---|
| appear | Heat ≥ 40: one officer per 20 Heat (Dictator ×2, Martial Law ×2), max 6 |
| engage | bump, or within 64 u for 1 s at Heat ≥ 60 |
| talk | chance(CHA, 50 + 2 × Heat) (Fast Talker: D - 40); success -10 Heat |
| bribe | $20 × Heat (Fast Talker ×0.5); -30 Heat; -3 karma |
| run | 3 s head start; officer 300 u/s; lost on entering any building; caught → jail 2 + floor(Heat/25) |
| check ids | `police.talk` (Relaxed +0.10; Fast Talker D - 40) |
| wanted posters | Heat ≥ 50 |

## B-12 Bus depot — `tuning.bus`

### B-12a Cities (each mirrors one original handler)

| Id | City | Ticket | Mugging range | Buyers want | Booze demand | Product demand | Bust rule | Mirrors (orig) |
|---|---|---|---|---|---|---|---|---|
| `crayonburg` | Crayonburg | 115 | 125 | either (random) | 1.0 | 1.0 | ≥ threshold | Brooklyn ($115, 125, random, ≥ 50) |
| `rustbelt` | Rustbelt Rise | 100 | 150 | product | — | 1.1 | > threshold | Detroit ($100, 150, product) |
| `glitter` | Glitter Gulch | 100 | 150 | product | — | 1.2 | > | Los Angeles ($100, 150, product) |
| `gusty` | Gustytown | 115 | 125 | booze | 1.2 | — | > | Chicago ($115, 125, booze) |
| `eraser` | Port Eraser | 130 | 110 | booze | 1.3 | — | > | Camden ($130, 110, booze) |
| `pegas` | Las Pegas | 130 | 110 | either | 1.1 | 1.1 | > | Las Vegas ($130, 110, random) |

| Key | Value |
|---|---|
| `demandDaily` | × rand(85..115)/100 per city per day (shown on the Rumour board, P1) |
| `bustThreshold` | 50 - floor(Heat/5) (Pack Mule +10); checked against each commodity you carry, before the buyers' want is drawn (orig) |
| `mugCheck` | STR < 100 + rand(0..range) → mugged (orig); always safe at STR ≥ 100 + range (210 / 225 / 250) |
| `mugLoss` | all cash and goods (orig); vest: half the cash |
| `screwed` | 10 % (orig), -1 % per city reputation, min 3 % |
| `offer.booze` | `max(5, min(CHA/6, 50) ± rand(0..4))` × demand (orig formula) |
| `offer.product` | `max(50, min(2·CHA, 600) ± rand(0..49))` × demand (orig formula) |
| `offer.wicked` | +10 % (Wicked tier) |
| `haggle` | check `trade.haggle`: chance(CHA, 150) (Smooth Talker +0.10; no Relaxed bonus) → +12 %; failure: the buyer walks |
| `take` | -5 karma (orig), +5 Heat per 10 units, +1 reputation (max 10) |
| `buyerVoicemail` | 50 % chance per deal, 5 buyers, once each (orig) |
| `tour.requires` | CHA ≥ 150, karma ≥ 0, phone, and job ≥ Executive or the Theatre degree |
| `tour.limit` | one tour per city per week (`trade.tourWeek[city] ≠ week(s)`) |
| `tour.window` | board at 06:00-10:00 (B-01 `tourWindow`) |
| `tour.fee` | `floor(CHA × 3 × tourDemand × (1 + 0.05 × reputation))`, tourDemand rand(80..130)/100 per city per day; Silver Tongue ×1.15; Sky Bus Nationalised ×1.2 |
| `tour.hook` | one Duel beat (skin `tourhook`, B-30), check `tour.hook.<stat>`: chance(stat, 150); ±20 %; Crowd Pleaser: always wins |
| `tour.karma` | +2; +1 reputation |
| `nationalised` | tickets $0 (decree) |

**EV check** (P1 numbers). Product at CHA ≥ 300, best of 4 product cities (demand ≈ 1.25): about
$750 a unit, $350 margin, × 50 units = $17,500 per trip, minus Heat fines ($1,250 to clear +25
Heat) → ≈ $16,000 per trip day **when the trip is safe** (STR ≥ 100 + the city's range: 210 for
Las Pegas and Port Eraser, 225 for Crayonburg and Gustytown, 250 for Rustbelt Rise and Glitter
Gulch; below that, P(mugged) = (100 + range - STR) / (range + 1) and a mugging loses ≈ $20,000 of
product and all cash). Booze at CHA ≥ 300 in Port Eraser: ≈ $65 a bottle, $35 margin × 50 =
$1,750. Tour at CHA 600, reputation 10, average demand 1.05: 600 × 3 × 1.05 × 1.5 ≈ **$2,835 per
tour day** (best city on a good day ≈ $3,400), at most 6 tours a week (one per city): about a CEO
day with overtime, never a multiple of it. At CHA 150 (the earliest tour, as an Executive) ≈ $470.

## B-13 Fights — `tuning.fight`

| Key | Value |
|---|---|
| `startCost` | 180 min, -2 karma (orig), +5 Heat |
| `ap` | min(floor(STR/20) + 1, 15) (orig); Harold corner man +1; Brawler +1 |
| `punch` | 1 AP, rand((STR+10)/10) + 2·knife + 4·knuckles + min(Buzz, 3) |
| `kick` | 2 AP, rand(STR/4.5) + 2·knife + 1 (orig) |
| `fireball` | 3 AP, rand(STR/2.5) (orig) |
| `inkBeam` | 4 AP, rand(STR/1.5) (orig's strongest move) |
| `guard` | 1 AP (P1): next enemy hit -50 %, two guards -75 % |
| `minDamage` | 1 (orig) |
| `crit` | 10 % (15 % at CHA ≥ 300), ×1.5 |
| `heavyHitter` | player damage ×1.25 |
| `ladder.hp` | 8 + 12n + rand(0..4n), n = 1..12 |
| `ladder.power` | P = 6 + 9n |
| `enemyMove` | roll = rand(P) + 1: > 40 Ink Beam rand(P/1.5); > 20 fireball rand(P/2.5); > 10 kick rand(P/4.5); else punch rand(P/10) + 1 (orig thresholds) |
| `vest` | -30 % damage taken |
| `win` | +3 STR (orig; HP max rises with STR, never separately) |
| `wallet` | 10 + 15n + rand(0..10n), -3 karma (orig prize) |
| `drink` | -$5, +1 CHA, +1 karma (P1) |
| `lose.standard` | HP 1, 10 % of cash lost (the tab; cash only) |
| `lose.relaxed` | HP 1 |
| `lose.hardcore` | HP 0 → `health.down(s, 'fight')`: death unless Second Wind (orig) |
| `auto` | "Quick fight": each turn spend AP on the move with the highest expected damage per AP (ties: cheaper), never Guard or Run; real rolls from the rules RNG |
| `run` | no further cost (orig) |
| `champion` | beat #12: +$1,000, title |
| `afterChampion` | bar fights draw n = rand(8..12) |
| `ring.day` | Saturday, champions only, 1 bout a day, 180 min |
| `ring.power` | 120 + 0.8 × STR + 20k (k = ring bout number, from 1) |
| `ring.hp` | 150 + 1.1 × STR + 30k |
| `ring.purse` | 500 + 250k |
| `goons` | Red's goons: a forced fight at ladder n = 6, twice in a row (B-26 `red.credit`) |
| `quirks.wobbly.miss` *(w1)* | 0.30: Wobbly Pete's attacks miss 30 % of the time (GDD §6.3) |
| `quirks.pyro.fireballOdds` *(w1)* | 2: The Professor's fireball odds ×2 |
| `quirks.iron.armor` *(w1)* | 0.30: Iron Irma takes 30 % less damage |

Ladder reference (n, HP range, P): 1: 20-24, 15 · 3: 44-56, 33 · 6: 80-104, 60 · 9: 116-152, 87 ·
12: 152-200, 114.

## B-14 Casino — `tuning.casino`

### B-14a Paper Jackpot slots

Each of 3 reels has 20 stops: Dollar ×1, Seven ×2, BAR ×3, Bell ×4, Cherry ×4, Blank ×6.
Payouts are × bet, stake included (the bet is taken first; the payout is added).

| Line | Pays | Ways (of 8,000) | Contribution |
|---|---|---|---|
| $ $ $ | 700 | 1 | 700 |
| 7 7 7 | 100 | 8 | 800 |
| BAR BAR BAR | 40 | 27 | 1,080 |
| Bell Bell Bell | 20 | 64 | 1,280 |
| Cherry Cherry Cherry | 15 | 64 | 960 |
| Cherry Cherry, reel 3 not Cherry | 5 | 256 | 1,280 |
| Cherry on reel 1, reel 2 not Cherry | 1 | 1,280 | 1,280 |
| **Total** | | **1,700 (hit rate 21.25 %)** | **7,380 → RTP 92.25 %** |

Bets 5 / 25 / 100 (orig); 500 at VIP Silver. Auto-spin: 10 pulls. Casino Levy: $$$ ×560 (RTP 90.5 %).
Casino Night: Bell ×3 ×24 (RTP 95.45 %). A unit test computes RTP exactly from the strips.

### B-14b Blackjack

6 decks, cut card at 75 % penetration, dealer stands on soft 17, natural 3:2, double on any first
two cards (not after a split), split once (no resplit; split aces get one card each), no
insurance, no surrender. Bets 5-500 (VIP Gold ×5). House edge 0.5-0.6 % with basic strategy
(test: 10⁶ basic-strategy hands, edge in 0.3-0.8 %).
| Key | Value |
|---|---|
| `bj.handsPerDay` | 60 (`daily.bjHands`) |
| `bj.minimum` | the table minimum, $5 |
| `bj.suspicion.spread` | +1 for a hand whose bet ≥ 4 × the table minimum ($20) while the true count ≥ +2 (P1 `nightlife`; for every player; ×0.75 with Card Sharp) |
| `bj.suspicion.flat` | -0.5 for any other hand whose bet equals the previous hand's bet (`casino.lastBet`); floor 0 |
| `bj.backoff` | at 8 suspicion (11 with CHA ≥ 400): barred from blackjack for 7 days; suspicion resets to 0 |
| `bj.cardSharp` | shows the Hi-Lo running count and the true count (running / decks left) |
| `bj.counting.target` | optimal Hi-Lo play within these rules earns ≤ +0.3 % of the amount wagered, averaged over 20 seeds × 100 days of 60 hands (a sim test, W3-Nightlife with W3-Balance). If it exceeds: raise `bj.suspicion.spread` to 1.5, then lower `bj.backoff` to 6 |

Tests use a fixed seed: 4 × 10⁶ basic-strategy hands give a house edge in 0.35-0.75 %.

### B-14c Roulette

American wheel, 38 pockets, the correct red set {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36}.

| Bet | Pays (x:1) |
|---|---|
| straight (incl. 0, 00) | 35 |
| split | 17 |
| street | 11 |
| corner | 8 |
| six line | 5 |
| dozen, column | 2 |
| red/black, odd/even, 1-18/19-36 | 1 |

0 and 00 lose all outside bets. Table limit 2,000 per spin (orig); VIP Gold 10,000. House edge
5.26 %.

### B-14d VIP (P1)

| Key | Value |
|---|---|
| points | 1 per $100 wagered (×2 on Saturday) |
| Silver | 500 points: 2 free drinks a day (0 min, +1 CHA, +1 Buzz each), $500 slot bet |
| Gold | 2,500 points: table limits ×5 |

### B-14e Scratch card (P1)

$5. One roll of 1..10,000: **1 → $10,000; 2-101 → $100; 102-1,101 → $10**; else $0.
EV = 10,000 × 1/10,000 + 100 × 100/10,000 + 10 × 1,000/10,000 = $1.00 + $1.00 + $1.00 = **$3.00
exactly**, RTP 60 %. No karma.

### B-14f Darts

Units are **board pixels**: logical pixels of the minigame play area (the board is drawn at radius
220 px, centred in the play area).

| Key | Value |
|---|---|
| `darts` | 10 per game (orig) |
| `rings` | radius ≤ 19 → 50; ≤ 40 → 35; ≤ 138 → 15; ≤ 220 → 5; beyond → 0 (the original's proportions 6.65 / 14.5 / 49.2 / 78.7 of 78.7, scaled to 220) |
| `aim` | aim point = the pointer (mouse, touch) or a crosshair steered by the stick (500 px/s at full tilt) or the arrows (400 px/s), smoothed with a 0.2 s time constant; the dart lands at aim point + wobble at the moment of the throw |
| `wobble` | Lissajous: `A × (sin(2π·0.53·t + φx), sin(2π·0.71·t + φy))`, t in seconds of play, φx and φy drawn from the rules RNG per game; `A = 120 × (1 + 0.4 × Buzz) × (1 - min(INT, 600)/1200)` px; Assist ×0.5 |
| `ghostBoard` | Buzz ≥ 2: a second board drawn offset and faded; it never scores |
| `practice` | 30 min, +1 CHA the first game each day, no stake |
| `match` | 60 min; at most 3 a day (`daily.dartsMatches`); stake 10-200; Rookie 160 (pays 2×), Regular 230 (2×), Shark 320 (3×); you win on score ≥ target |
| `auto` | 10 throws at the centre, each at a uniformly random time (the wobble's value there); sampled |
| `autoWindowSec` *(w1)* | 600: the Auto's random throw times are drawn from [0, 600) s, much longer than the wobble's periods |

Reference (Auto, Buzz 0, 10⁵ simulated games): INT 100: mean 145, P(≥ 160) 0.25; INT 300: mean 166,
P(≥ 160) 0.50, P(≥ 230) 0.01; INT 600: mean 187, P(≥ 160) 0.83, P(≥ 230) 0.08, P(≥ 320) ≈ 0. Shark is
won only by timing the throw.

## B-15 Movement and world — `tuning.world`

| Key | Value |
|---|---|
| `walk` | 280 u/s, accel 0.08 s |
| `skate` | 560 (×2) · Pro Deck 700 (×2.5) · Marathoner ×1.15 on walk and skate |
| `junker` | 840 (×3), accel 0.6 s, turn 3.2 rad/s, reverse 200 |
| `sports` | 1400 (×5), accel 0.9 s, turn 3.8 rad/s |
| `surfaceDrive` | asphalt ×1; paths and plazas ×0.6; sidewalks and lawns: speed capped at 200 u/s |
| `park` | "Park and enter" within 64 u of a door's `kerb` point, or drive into the door trigger |
| `carVsPeople` | pedestrians and named NPCs hop 24 u aside with a bark; no HP, karma or Heat |
| `homeLots` | junker: apartment lawn [636, 1064, 818, 1162]; sports car: mansion drive [1770, 1080, 1960, 1160] |
| `playerRadius` | 14 u |
| `door.trigger` | 96 × 48 u box centred 24 u outside the door; dwell 0.2 s counted only while the move input is within 45° of the inward normal (or a click-to-walk route ends in the box); interact range 96 u |
| `door.prompt` | "[E] Enter ..." within 96 u; plain name tag from 96 to 160 u |
| `door.exit` | 56 u outside, facing away; the trigger re-arms when the player is more than 64 u from its centre |
| `door.porchN` | north doors: porch depth 0.5 × h_annex + 32 = 56 u; the outer 32 u always visible |
| `camera` | spring ω 8/s; dead zone 96 × 64; look-ahead 0.25 s capped 140 u; zoom 0.8 / 1.0 / 1.25; bounds = island bbox ± 480 u |
| `projection` | screenY = y - 0.5 × z |
| `occlusionAlpha` | 0.35 over 150 ms |
| `edgeWarn` | 60 u (fog 90 u) |
| `teeter` | 150 ms |
| `fall` | 1.5 s total (drop 0.55, catch 0.5, land 0.45); skippable after 0.5 s; -10 HP (orig; Hard Landing -5); no time (orig); land ≥ 64 u inside |
| `carTow` | $100 forced charge at night step 10; the car returns to its home lot |
| `carHit` | -10 HP (orig), knockdown 1.14 s (orig 40 ticks), voicemail next morning (1 of `voicemails` = 3; night step 11 on `flags.carHitVm`, once however many hits), 20 % with a settlement 50 + rand(0..150) credited as income `prize` |
| `carCrash` | -5 HP each, bounce |
| `cab` | $15, 30 min, phone; allowed at 24:00 to home |
| `windGust` | 40 u/s outward within 48 u of an unrailed edge, 2 s bursts, 0.5 s warning; off with Assist › No gusts |
| `safeEdges` | Assist › Safe edges: unrailed edges bounce like railings (no falls; fall achievements and Ori's lines off) |
| `navGrid` | 32 u cells, 40 u edge margin; "reachable" = within 32 u of a connected cell's centre |
| `scrapEdgeMin` | 64 u from any unrailed edge |
| `skateAccel` *(w1)* | 0.25 s: skateboard and Pro Deck reach top speed (GDD §3.8) |
| `carRange` *(w1)* | 64 u: C / Y enters or leaves your car within 64 u of it (GDD §3.8) |
| `carRadius` / `carLength` *(w1)* | 26 / 96 u: a car's collision capsule (a 96 × 52 car) |
| `driveZoomEase` *(w1)* | 0.6 s: driving eases the zoom one level out (GDD §3.7) |
| `teeterAssistMs` *(w1)* | 300: Assist's longer teeter grace (UI §8) |
| `navCacheSec` *(w1)* | 1: nav paths are cached for 1 s (ARCHITECTURE §8.2) |
| `assist` *(w1)* | { speed: 0.7, sweet: 1.5, wobble: 0.5 }: GDD §6.5 Assist for the minigames: -30 % speed, +50 % sweet spots, half the wobble (the same ×0.5 as B-14f) |

**Field names in `tuning.world` are frozen** (CONTRACT §3.6): `surfaceDrive.cap`, `park.range`,
`door.trigger.offset`, `camera.lookAhead`, `projection.k`, `fall.total`, `fall.skipAfter`,
`carHit.knockdown` (the rows above give their values). The world reads every key through
`SR.world.cfg`, and `tests/node/invariants.test.cjs` fails if one stops resolving.

## B-16 Difficulty — `tuning.difficulty`

| Key | Relaxed | Standard | Hardcore |
|---|---|---|---|
| startCash | 300 | 100 | 100 |
| hp0 | hospital (B-31), bill 0 | hospital (B-31), bill max(50, 10 % of cash + bank) | death (Second Wind first) |
| loanDefault | seize + lien + penalty (B-09), keep HP | seize + lien + penalty, HP 1 | death after the night |
| wageMult | 1.25 | 1 | 1 |
| checkBonus | +0.10 on the checks B-28b lists | 0 | 0 |
| storeJailBase | 3 | 3 | 5 |
| fightLoseCash | 0 | 10 % | death |
| saves | 3 slots + auto + suspend | 3 slots + auto + suspend | 1 ironman slot: written after every action that changes HP, money or karma (debounced 2 s), before a stake-bearing minigame (with `pending`) and every night; reload resumes it; deleted on death |
| legacyMult | 0.75 | 1 | 1.5 |

## B-17 Endgame — `tuning.election`

| Key | Value |
|---|---|
| `requires` | live in the castle; cash + bank ≥ 200,000; President: all stats ≥ 666 and karma ≥ +25; Dictator: all stats ≥ 777 and karma ≤ -25 |
| `acceptWithin` | 14 days after the call; then the offer lapses |
| `keepOnceAccepted` | true: after accepting, falling below any requirement does not cancel the campaign |
| `warChest` | 50,000 → +5; 100,000 → +12; 200,000 → +25 (orig tiers; paid in full from cash, then bank) |
| `startPoll` | 30 + (lowest stat - 600)/20 + |karma|/10 + chest; Magnetic +5; rounded to 0.1 |
| `pollClamp` | 0..100 after every change |
| `campaignDays` | 7; the counter advances every night, including jail and hospital nights; election night after day 7 |
| `rivalDaily` | poll -rand(1..3) each campaign night |
| `repeatHalf` | the 2nd (3rd) use of the same action on the same day gives half its poll change, rounded to 0.1 |
| `rally` | $5,000, 180 min, +1 + CHA/250, cap 2 a day |
| `tvAd` | $25,000, 0 min, +4, cap 1 a day |
| `doorKnock` | 0, 120 min, +1, +1 karma, President only, cap 2 a day |
| `kissBabies` | 0, 60 min, +1 on chance(CHA, 300), President only (P1), cap 3 a day |
| `debate` | day 4, 120 min, 3 questions, +3 win / -2 loss, Duel stance mode (B-30), D 500, cap 1; **no-show -5** at the night that ends day 4 |
| `intimidate` | 0, 120 min, +3 on chance(STR, 500) else -3, -5 karma, +10 Heat, Dictator only, cap 1 a day |
| `bribe` | $50,000, 60 min, +8, -10 karma, +20 Heat, 10 % scandal -6, cap 1 a day |
| `eventChance` | 0.40 a day (12 events: scandal -5, endorsement +4, gaffe -2, viral meme +3, rival stumbles +2, weather washout -1, celebrity nod +3, old tweet -4, debate clip +2, paper shortage -1, parade +2, pigeon incident -1) |
| `win` | poll + rand(-5..5) ≥ 50 |
| `retry` | after a loss, a lapse, an impeachment or a coup: nominated again from day + 30 (`retryFromDay`); no limit on runs |
| `salary` | 10,000 a night, anywhere |
| `decreeEvery` | 7 days; the first offer on taking office |
| `decreeOffer` | 3 random eligible decrees (path matches, not active, once-only not used); pick one or keep the offer open |
| `flip` | 3 consecutive mornings with the wrong karma sign → removed from office (decrees end) |
| `casinoLevy` | +2,000 a night (night step 3) |
| `statueOfMe` | ±2 karma a night (night step 9); a festival headline |
| `mandatoryHats` | +1 CHA a night (night step 9) |
| `toughOnCrime` | Heat -25 a night (replaces the normal decay); police ×2 |
| `seizeBank` | +250,000 once; savings interest 0 forever; -30 karma |
| `publicLibrary.study` *(w1)* | 3: Study gives +3 INT while the Public Library Act is active (GDD §4.17) |
| `universalFries.karma` *(w1)* | 10: the Universal Fries decree's karma (GDD §4.17) |
| `cityNameMax` *(w1)* | 16 characters: Rename the City (a TextField, like `start.nameMax`) |

Decree ids are the camelCase keys above (`casinoLevy`, `seizeBank`, ...; CONTRACT D54).

Example: lowest stat 700, karma +60, $200k: 30 + 5 + 6 + 25 = 66 %; the rival alone takes about 14
points over 7 nights, so doing nothing risks a loss (52 ± 5). Lowest stat 666, karma +25, $50k: 30
+ 3.3 + 2.5 + 5 = 40.8 %; with two rallies (+3.66, +1.83), two door-knocks (+1, +0.5) and a TV ad
(+4) a day at CHA 666: +11 a day, $35,000 a day, → about 100 before the clamp; one rally and one
door-knock a day (+4.66) end near 59.

## B-18 Net worth, ranks, legacy — `tuning.endgame`

Net worth = cash + bank + CD principal + stocks at market price - loan - lien + homes × 0.9 +
furniture prices × 0.25 + (a bought sports car, `cars.sports.bought`) 30,000.

Tuning names: the floors are `endgame.ranks` (index 0 = below 0), the karma columns
`endgame.column` (`{ good: 20, evil: -20 }`).

| Net worth ≥ | Neutral | Good (karma > +20) | Evil (karma < -20) |
|---|---|---|---|
| below 0 | IN THE RED | IN THE RED | IN THE RED |
| 0 | FLAT AS PAPER | FLAT AS PAPER | FLAT AS PAPER |
| 500 | CRUMPLED | CRUMPLED | CRUMPLED |
| 1,500 | STICK FIGURE | NICE STICK | TROUBLEMAKER |
| 5,000 | DOODLE | HELPING HAND | HOODLUM |
| 15,000 | SKETCH ARTIST | NEIGHBOURHOOD HERO | HUSTLER |
| 40,000 | GO-GETTER | PILLAR OF THE COMMUNITY | RACKETEER |
| 100,000 | BIG SHOT | HUMANITARIAN | CRIME BOSS |
| 250,000 | TYCOON | BELOVED BENEFACTOR | KINGPIN |
| 600,000 | MAGNATE | LIVING LEGEND | OVERLORD |
| 1,500,000 | MOGUL | PATRON OF THE PAGE | SUPERVILLAIN |
| 5,000,000 | PAPER TITAN | GUARDIAN ANGEL | SCOURGE OF THE SKIES |
| 15,000,000 | SUPREME SCRIBBLE | HALO INCARNATE | PURE RED MENACE |

Banners: PRESIDENT OF STICKS / DICTATOR OF STICKS (in office at the end), *UNVERIFIED* (cheat),
DECEASED (death), MET THE ARTIST sticker (Theory of the Fold).

Legacy = (floor(NW/100) + STR + INT + CHA + 5·|karma| + 250·achievements this run + 500·jobRank +
10,000 if elected) × legacyMult. jobRank: cook 0, manager or janitor 1, mail 2, sales 3, exec 4,
vp 5, ceo 6, office 7. Hall of Fame: top 10 per length (15, 40, 100, unlimited). A Custom length
files under the nearest of 15 / 40 / 100 (ties to the longer; over 100 → 100); a Keep-playing run
is entered once, at its original end; the cheat name is never entered.

## B-19 Weather and calendar — `tuning.weather`, `tuning.calendar`

Markov chain for tomorrow (rows = today):

| From \ To | Clear | Cloudy | Rain | Fog | Windy |
|---|---|---|---|---|---|
| Clear | .60 | .25 | .08 | .05 | .02 |
| Cloudy | .35 | .30 | .25 | .05 | .05 |
| Rain | .20 | .35 | .35 | .05 | .05 |
| Fog | .50 | .30 | .10 | .10 | .00 |
| Windy | .50 | .30 | .10 | .00 | .10 |

Day 1 is Clear. Forecast (`weather.forecastAccuracy`): correct with 0.8, otherwise a random other
state; revealed for the day
by TV News, The Daily Fold, Market Watch or the binoculars (`daily.forecastSeen`). Intra-day: at
12:00 and 18:00, 30 % to move one step along the same chain; any Rain sets `todayHadRain`. Storm:
15 % of Rain days. The only switch is the feature flag `weather` (off in P0: always Clear; the
`weather` condition then reads Clear too).

| Calendar key | Value |
|---|---|
| `mon` | +1 CHA on the first shift |
| `tue` | Open Mic 18:00-24:00 |
| `wed` | classes $10 |
| `thu` | triple burger 40, mega meal 100 |
| `fri` | beer 15; weekly bonus |
| `sat` | Underground Ring; VIP points ×2 |
| `sun` | flea market 08:00-18:00 (P2, sell at 60 %); skate contest window 12:00-18:00 (kid arc) |
| `cityEventEvery` | 7 days, one of 6 (table below) |

**City events** (`tuning.calendar.events`, P1 flag `calendar`). Each Sunday night one event and its
day for the coming week are drawn (weights equal; Casino Night is always that Friday; Stock scare
only Monday-Thursday so that both its market nights exist). Monday's paper announces it.

| Id | Day | Effect (only on its day unless stated) |
|---|---|---|
| `burgerDay` | any | McSticks food 50 % off (a percent discount, B-28a); MCS +5 % shock that market night |
| `heatWave` | any | weather forced Clear; every training and work HP cost ×1.5 (rounded up; the "Too hurt" threshold follows); milkshakes heal ×2 |
| `casinoNight` | Friday | slots Bell Bell Bell pays ×24 instead of ×20 (RTP 95.45 %) |
| `recyclingDrive` | any | City Hall row "Donate furniture": give one owned piece (tier 1 or 2; not in storage-only homes' limit) → +1 karma per full $500 of its price (min +1, max +10), once; the piece is gone |
| `stockScare` | Mon-Thu | all tickers -5 % that market night, +5 % the next |
| `bloodDrive` | any | City Hall row "Give blood": 60 min, -20 HP (needs HP > 20), +5 karma, +$50, once |

## B-20 Encounters — `tuning.encounters` (P1)

| Key | Value |
|---|---|
| per day | rand(1..3), seeded at night step 10 at random sidewalk nodes and times inside `encounterDayWindow` / `encounterNightWindow` (B-01): day encounters between the wake time and 23:00; the mugger and the pickpocket between 21:00 and 24:00, and 00:00-04:00 only on a day that started at 00:00 |
| lifetime | each "!" lasts 3 game hours or until taken; a missed one disappears |
| cap | the Cap column: at most that many of one id per day (all 1) and per week (Week cap) |
| HP guard | a choice with an HP loss is offered only above its worst case (fight: HP > 20; climb: HP > 10) |

| Id | Weight | Cap / day | Week cap | Condition | Outcome numbers | Check ids |
|---|---|---|---|---|---|---|
| tourist | 10 | 1 | 3 | day | +2 karma; 50 % $10 | |
| wallet | 8 | 1 | 2 | any | return +5 karma / keep 20 + rand(0..130), -5 karma | |
| magician | 6 | 1 | 3 | 10:00-22:00 | tip $5: 50 % +1 CHA / heckle +1 CHA -1 karma | |
| mugger | 6 | 1 | 2 | night | pay 20 + rand(0..80) (forced charge) / fight chance(STR, 75), fail -20 HP and the cash / run chance(STR, 25), fail = the fight's failure | `enc.mugger.fight`, `enc.mugger.run` |
| flyer | 8 | 1 | 2 | day | coupon 50 % one McSticks food (`items.coupon`, max 1) | |
| jogger | 6 | 1 | 3 | 06:00-12:00 | stake $20, chance(STR, 75), +1 STR | `enc.jogger` |
| petition | 6 | 1 | 3 | day | +1 karma | |
| pickpocket | 5 | 1 | 2 | night | chance(INT, 75) or lose 5 % cash | `enc.pickpocket` |
| cat | 4 | 1 | 2 | park, day | chance(STR, 25): +3 karma / -10 HP | `enc.cat` |
| oldlady | 5 | 1 | 3 | 08:00-18:00 | 30 min, +3 karma | |
| scout | 3 | 1 | 1 | CHA ≥ 200 | 180 min, $500 | |
| busker | 6 | 1 | 3 | park or plaza | tip 2-20: +1 karma per $10 | |
| stalledcar | 4 | 1 | 2 | roads, day | STR ≥ 40: $20, +1 STR | |
| puddle | 6 | 1 | 3 | rain | dodge chance(INT, 25) or -1 CHA | `enc.puddle` |

## B-21 Perks — `tuning.perks` (P1)

| Id | Stat, level | Rule key and value |
|---|---|---|
| `ironStomach` | STR 100 | food heal ×1.25 |
| `hardLanding` | STR 100 | fall and car-hit damage 5 |
| `brawler` | STR 250 | fight AP +1 |
| `packMule` | STR 250 | bust threshold +10 |
| `intimidating` | STR 450 | Hold-up STR beats D - 20 (B-28b); street muggers flee (the encounter resolves as "he flees") |
| `marathoner` | STR 450 | walk and skate ×1.15 |
| `secondWind` | STR 700 | once a day HP 0 → 1 (`health.down` step 1; `daily.secondWind`) |
| `heavyHitter` | STR 700 | fight damage ×1.25 |
| `speedReader` | INT 100 | study 90 min; paper 0 min |
| `couponClipper` | INT 100 | 10 % off McSticks, store, pawn |
| `marketSense` | INT 250 | stock spread 0 |
| `tinkerer` | INT 250 | hotwire from INT 150; Timing Ring sweet spots ×1.5 |
| `workaholic` | INT 450 | overtime: no HP, twice a day |
| `cardSharp` | INT 450 | shows the Hi-Lo counts; suspicion gains ×0.75 (B-14b) |
| `mastermind` | INT 700 | seminars $0 (a fixed price, B-28a) |
| `taxWizard` | INT 700 | interest T1 up to 200,000 |
| `regular` | CHA 100 | beer $15; Mingle always tips |
| `smoothTalker` | CHA 100 | pawn buys at 55 %; Haggle +0.10 |
| `silverTongue` | CHA 250 | tour fee ×1.15 |
| `fastTalker` | CHA 250 | police Talk D - 40; bribes ×0.5 |
| `networker` | CHA 450 | promotions need 1 shift fewer |
| `crowdPleaser` | CHA 450 | Open Mic tips ×2; tour hook always succeeds |
| `magnetic` | CHA 700 | campaign poll +5 |
| `charmingRogue` | CHA 700 | jail -2 days (min 1); bail ×0.5 |

## B-22 Traffic and pedestrians — `tuning.traffic`, `tuning.crowd`

| Key | Value |
|---|---|
| lanes | Main S X 2398, N X 2580; West Ave W Y 1424, E Y 1616; East Ave W Y 2286, E Y 2476 |
| spawnInterval | per lane rand(3..6) s 07:00-20:00; rand(8..14) s otherwise |
| maxCars | 14 |
| cruise | rand(360..520) u/s |
| gap | 72 u |
| brake | 1400 u/s² |
| notice | clamp(0.55 + karma/250, 0.2, 0.95) within 220 u ahead; always on a zebra |
| junction | T-junctions, Main is the through road: from Main straight 0.7, turn 0.3; from the avenue left 0.5, right 0.5; one car in the box; no U-turns; every in-portal reaches an out-portal |
| rain / fog | braking distance ×1.3 / speed ×0.8 |
| simulateRange | 2 screens from the camera |
| peds by hour | 06-09: 18 · 09-17: 26 · 17-21: 30 · 21-02: 12 · 02-06: 4 · rain ×0.5 · × preset crowd factor (High 1, Medium 1, Low 0.5; tests pin High) |
| maxPeds | 40 |
| pedSpeed | rand(90..140) u/s |
| pedSeparation | 20 u |
| barkInterval | ≥ 4 s between barks on screen |

## B-23 Progression targets (asserted by the simulator)

**Bots** (rule-level, `tests/balance/sim.cjs`; GDD §7):
- **Grinder:** legal only. Works (Full; Overtime from Executive; a second Full shift from CEO when
  hours allow), trains toward the next promotion and then its lowest stat, buys the furniture and
  homes in B-08 order, banks everything above $500. No stocks, tours or crime.
- **Saint:** Grinder plus the daily stock tip from INT 100 when a source reveals an "up" tip (at
  half the bank or the cap), speaking tours on 3 days a week once eligible (CHA ≥ 150 and
  Executive) in the best city not toured this week, charity at karma < +50.
- **Kingpin:** Grinder plus red-eye smuggling of product on 4 days a week with a phone, **only to a
  city where the trip is safe** (STR ≥ 100 + its range: from STR 210 Las Pegas, from 250 the best
  product city), paying Heat fines to keep Heat ≤ 10 when cash allows, the bank job once a week from
  STR 100 when its best-of-three odds are ≥ 0.6, and store robberies when broke; karma negative.
- **Tourist:** legal; works only until Executive, then trains CHA and tours every day it can (one
  per city per week), banking the fees. It exists to bound the tour channel.
- Each bot runs two policies: **normal** (75 % of the day's usable hours; every hustle on Auto,
  m = 1.0) and **expert** (100 %, alarm + pill from day 20, hustles with m drawn per shift from an
  "assisted player" distribution N(1.15, 0.08) clamped to 0.7-1.3, and endgame focus: once all
  stats ≥ 690 it stops training and skips tier-2 furniture and the mansion).
- 20 seeds × 100 days per bot and policy (expert Saint and Kingpin: 130 days for the nomination
  assertion). Assert the **median** over seeds.

| Day | Grinder normal | Grinder expert | Saint / Kingpin expert |
|---|---|---|---|
| 3 | job ≥ Janitor; INT 25-45 | Janitor; INT 35-50 | — |
| 10 | Mail Room-Salesperson; INT 65-110 | Salesperson; INT 110-160 | — |
| 15 | Salesperson-Executive; NW 500-3,000 | Executive; NW 1,500-8,000 | — |
| 25 | VP (Exec-CEO); INT 180-280 | CEO | CEO |
| 40 | CEO or VP; home ≥ apt2; NW 15,000-50,000 | CEO; NW 40,000-100,000 | NW 30,000-100,000 |
| 70 | home ≥ pent; min stat 300-450; NW 45,000-120,000 | min stat 400-600; NW 150,000-350,000 | min stat 500-700; NW 150,000-400,000 |
| 100 | min stat 550-750; NW 120,000-320,000 | NW 400,000-800,000 | NW 450,000-1,000,000; castle owned in ≥ 50 % of seeds |
| nomination | — | — | nominated by day 100 in ≥ 25 % of seeds of at least one of the two bots; median nomination day ≤ 115 |

Relative assertions: at day 100 the median NW of Saint normal and Kingpin normal is ≥ 1.1 × Grinder
normal's and ≤ 2.0 × it; the Tourist's median NW at day 100 is ≤ 1.2 × Saint expert's; no bot's
median NW at day 100 exceeds 3,000,000; stock profit is < 25 % of any bot's total income; tour fees
are < 40 % of the Saint's income; bank-robbery loot is < 30 % of the Kingpin's income; a Kingpin
run spends ≥ 3 days in jail on average; the castle band ("owned in ≥ 50 % of seeds") is asserted
over the 20 seeds, never on a single run.

## B-24 Economy curves (per-day income by phase, expert policy, for review)

| Phase | Wages | Interest | Stocks | Tours / smuggling | Typical total |
|---|---|---|---|---|---|
| Days 1-10 | $40-150 | < $5 | 0 | 0 | $50-150 |
| Days 10-25 | $150-900 | $5-40 | 0-$50 | 0 | $200-1,000 |
| Days 25-50 | $2,300-5,800 (CEO, OT, bonus) | $100-1,500 | $50-250 | tours from CHA 150 as an Executive: $450-1,500 per tour day; smuggling from STR 210 (safe cities): $5-16k per trip day; the bank job ≈ $9,000 × its odds, once a week | $3,000-7,000 |
| Days 50-100 | $5,800 | $1,500-3,500 | $250-800 | tours $1,500-3,400 per tour day (≤ 6 a week); smuggling $8-16k per trip day | $6,000-12,000 |
| Office (Unlimited) | +$10,000 | tiered, ≤ $25,000 | capped | — | $15,000-35,000 |

## B-25 Tuning protocol

- The sim prints a CSV per bot × policy × day (cash, bank, NW, stats, job, home, Heat, income by
  source) and an ASCII chart; CI fails when a B-23 median falls outside its band.
- **Knobs, in order of preference** (change the first that fixes the miss):
  1. early pace: `training.classBiz` gain, `jobs.*.shifts`;
  2. mid pace: `jobs.vp/ceo` wages, `training.seminar` gain;
  3. late money: `bus.tour.fee` coefficient, `bus.offer.product` demand, `bank.tiers`,
     `bank.interestCap`, `crime.bail` (the net-worth share);
  4. endgame: `election.warChest`, `homes.castle` (last resort; the castle price is iconic).
- Never change: the orig-marked values (INT gates, food prices and HP, pawn prices, the $400 gram,
  the $500,000 castle, the $200,000 nomination, 666 / 777, the 15-day loan) without the lead's
  sign-off.

## B-26 Street — `tuning.street`

Every street interaction is an action in `data/buildings/street.js` (`building: 'street:<npc>'`).

| Key | Value | P |
|---|---|---|
| `harold.give10` | $10, 60 min, +2 karma; the first gift also +6 CHA (orig) | P0 |
| `harold.giveBottle` | 1 bottle, 60 min, 0 karma (orig); the first also +8 CHA (orig) | P0 |
| `harold.giveTakeout` | 1 takeout, 30 min, +1 karma, once a day | P1 `arcs` |
| `harold.comeback` | after 5 × $10 and 1 takeout he asks for a clean shirt; giving it (30 min) plays the `interview` (B-30): 2 wins → hired today, otherwise hired 3 days later; 14 days after hiring he repays $2,000 (+10 karma); from then on his Monday voicemail carries the stock tip | P1 `arcs` |
| `harold.barfly` | 5 bottles → Sticky's loyal patron; corner man: +1 AP in bar fights and the ring | P1 `arcs` |
| `harold.exclusive` | the branch that first reaches its 3rd step (the shirt given / the 5th bottle) closes the other; gifts stay available with their orig effects | P1 |
| `kid.givePack` | 1 pack, 60 min, -2 karma (orig); 1st pack: the skateboard (orig); 10th: he dies, -30 karma, McHolland's call (orig), a memorial prop | P0 |
| `kid.giveGum` | 1 gum, 30 min, +1 karma; counts once per day toward the good branch | P1 `arcs` |
| `kid.good` | gum on 3 different days → he quits; the skate contest is the first Sunday ≥ 3 days later, window 12:00-18:00, watching it takes 120 min; reward: the Pro Deck, +10 karma | P1 `arcs` |
| `kid.exclusive` | the 3rd pack closes the gum branch; the 3rd gum day closes the packs | P1 |
| `red.buy` | $400 a gram before modifiers (B-28a); a NumberField of n = 1..(99 - held) grams; 0 min (orig); -ceil(n / 10) karma (new) | P0 |
| `red.credit` | offered once 50 g have been bought in total: take 20 g now (if they fit under 99), owe 20 × the day's price, payable in full at Red ("Pay Red") within 7 days. Paid: re-offered 7 days later. Missed: at the first city entry after the due day, two goons attack: two forced fights in a row at ladder n = 6. Win both: the debt is cancelled, credit ends for good, +10 Heat. Lose: the debt becomes a forced charge, the fight's lose rules apply, credit ends for good | P1 `arcs` |
| `red.loyal` | -10 % once 100 g have been bought in total (B-28a `redLoyal`) | P1 |
| `red.week` | price factor rand(90..110)/100 drawn each Monday (B-28a `redWeek`) | P1 |
| `red.turnIn` | through McHolland (informant): +15 karma, $1,000; New Guy on the same beat 14 days later at ×1.15 | P1 |
| `junker.hotwire` | INT ≥ 350: the car is yours, 60 min, -5 karma, +15 Heat (new); INT < 350: the attempt fails, 60 min (orig) | P0 |
| `junker.ring` | INT 200-349 (Tinkerer: 150-349): the Timing Ring `hotwire` instead (60 min, needs HP > 45): 3 hits start the car (then as above); each miss -15 HP; 3 misses trip the alarm (+10 Heat, no car) | P1 `arcs` |
| `shirt` | $20 at the pawn, stack 1, shown once Harold asks | P1 `arcs` |
| `junker.ring.arc` *(w1)* | { base: 20, perInt: 0.2, from: 200, min: 8, max: 70 }: the hotwire sweet arc clamp(20° + (INT - 200) / 5, 8°, 70°) (GDD §6.5); "up to 5 presses" is `hits + misses - 1` | P1 `arcs` |

## B-27 Park and civic — `tuning.park`, `tuning.civic`

| Key | Value | P |
|---|---|---|
| `park.jog` | 60 min, +1 STR, -3 HP (needs HP > 3) | P1 `park` |
| `park.chess` | stake $20, 60 min, +1 INT, win +$20 on chance(INT, 150) (check `park.chess`) else -$20, 3 a day | P1 `park` |
| `park.ducks` | $2, 30 min, +1 karma, once a day | P1 `park` |
| `park.benchNap` | 60 min, +10 HP, once a day; at karma < 0, 10 % chance a pickpocket takes floor(10 % of cash) | P1 `park` |
| `park.skate` | needs a skateboard or the Pro Deck; 60 min, +1 STR, +1 CHA, once a day | P1 `park` |
| `park.binoculars` | $1, 30 min: reveals tomorrow's forecast for the day and shows a distant city; the first use unlocks *Sightseer*; used at 00:00 with all 5 scraps: the finale | P1 `park` |
| `park.preacher` | listen, 30 min, 06:00-22:00, +1 karma once a day | P1 `park` |
| `park.crease` | talk, free: starts and advances the Theory of the Fold | P1 `scraps` |
| `scraps.reward` | +15 INT, the Fold Map, *Paper Trail*, the MET THE ARTIST sticker | P1 `scraps` |
| `civic.charity` | $100-$1,000 in $100 steps, +1 karma per $100, at most +10 karma a day | P1 `civicPlus` |
| `civic.soup` | 180 min, +4 karma, +1 CHA, once a day | P1 `civicPlus` |
| `civic.fine` | $50 per Heat point, any number of points up to your Heat | P1 `police` |
| `civic.mchollandOffer` | the informant offer at the Precinct desk when Heat ≥ 20 or after the kid's death; never at Wicked | P1 `police` |
| `civic.mchollandTip` | "Pass a tip": 30 min, once a week, informant, not Wicked: Heat × 0.5 (floor) | P1 `police` |
| `civic.mchollandBribe` | $2,000, karma < 0: no Heat gains for 7 days | P1 `police` |
| `civic.commercial` | the talent scout's shoot: 180 min, $500 | P1 `encounters` |
| `civic.bloodDrive`, `civic.recycling` | City Hall rows of the city events (B-19) | P1 `calendar` |

## B-28 Price and check modifiers — `tuning.priceMods`, `tuning.checkMods`

### B-28a Prices

Order (ARCHITECTURE §6.10): (1) markups `×` and `add` on the base; (2) **fixed** prices: take the
minimum of the price and every applicable fixed price; (3) **percent** discounts: only the largest
applies; (4) round half up, minimum $0. Price targets are dotted names: `food.mcsticks.<item>`,
`food.store.<item>`, `item.store.<id>`, `item.pawn.<id>`, `item.bar.beer`, `item.bar.bottle`,
`furniture.<id>`, `catalogue.<id>`, `class.<track>`, `seminar.<track>`, `ticket.<city>`,
`product.red`, `police.bribe`, `bail`.

| Id | Kind | Value | Targets | When |
|---|---|---|---|---|
| `takeout` | add | +2 | `food.mcsticks.*` bought to go | the Takeout variant (P1 `shopsPlus`) |
| `catalogueDelivery` | markup | ×1.10 | `catalogue.*` (not the sports car) | always (P1 `homesPlus`) |
| `redWeek` | markup | × this week's factor 0.90-1.10 | `product.red` | P1 `arcs` |
| `newGuy` | markup | ×1.15 | `product.red` | Red was turned in |
| `thuTriple` | fixed | 40 | `food.mcsticks.tripleburger` | Thursday (P1 `calendar`) |
| `thuMega` | fixed | 100 | `food.mcsticks.megameal` | Thursday (P1 `calendar`) |
| `friBeer` | fixed | 15 | `item.bar.beer` | Friday (P1 `calendar`) |
| `regular` | fixed | 15 | `item.bar.beer` | perk `regular` |
| `beerSubsidy` | fixed | 10 | `item.bar.beer` | decree |
| `freeFriesFriday` | fixed | 0 | `food.mcsticks.*` | decree, on Fridays |
| `wedClasses` | fixed | 10 | `class.*` | Wednesday (P1 `calendar`) |
| `mastermind` | fixed | 0 | `seminar.*` | perk `mastermind` |
| `nationalised` | fixed | 0 | `ticket.*` | decree |
| `employee` | percent | 25 | `food.mcsticks.*` | you hold a McSticks job |
| `goodKarma` | percent | 10 | `food.mcsticks.*`, `food.store.*`, `item.store.*`, `item.pawn.*`, `furniture.*`, `catalogue.*` | karma ≥ +50 (P1 `karmaTiers`) |
| `couponClipper` | percent | 10 | `food.mcsticks.*`, `food.store.*`, `item.store.*`, `item.pawn.*` | perk |
| `flyerCoupon` | percent | 50, `consume: true` | `food.mcsticks.*` | `items.coupon ≥ 1` (used only if it is the one applied) |
| `burgerDay` | percent | 50 | `food.mcsticks.*` | city event |
| `redLoyal` | percent | 10 | `product.red` | 100 g bought in total (P1 `arcs`) |
| `redBad` | percent | 10 | `product.red` | karma ≤ -50 (P1 `karmaTiers`) |
| `fastTalker` | percent | 50 | `police.bribe` | perk |
| `charmingRogue` | percent | 50 | `bail` | perk |

Examples: a beer on a Friday with the Regular perk under Beer Subsidy costs min(20, 15, 15, 10) =
$10. Fries to go as an employee with a flyer coupon: (12 + 2) × 0.5 = $7 (the coupon, the larger
discount, is used up; the employee discount is not added).

### B-28b Checks

`chance = clamp(stat / (stat + max(1, D + ΣdD)) + Σadd, 0.05, 0.95)`; a row with `always` returns 1.
Check ids: `holdup.store.{str,cha,int}`, `holdup.bank.{str,cha,int}`, `police.talk`,
`trade.haggle`, `tour.hook.{cha,int,str}`, `duel.debate.*`, `duel.interview.*`,
`duel.interrogation.*`, `duel.boardroom.*`, `enc.mugger.fight`, `enc.mugger.run`,
`enc.pickpocket`, `enc.cat`, `enc.jogger`, `enc.puddle`, `park.chess`, `campaign.kissBabies`,
`campaign.intimidate`, `shift.event.*`.

| Id | Kind | Value | Checks | When |
|---|---|---|---|---|
| `relaxed` | add | +0.10 | `holdup.*`, `police.talk`, `enc.*` | Relaxed difficulty |
| `badKarma` | add | +0.15 | `holdup.*` | karma ≤ -50 (P1 `karmaTiers`) |
| `intimidating` | dD | -20 | `holdup.*.str` | perk |
| `fastTalker` | dD | -40 | `police.talk` | perk |
| `smoothTalker` | add | +0.10 | `trade.haggle` | perk |
| `crowdPleaser` | always | 1 | `tour.hook.*` | perk |

Relaxed deliberately does **not** touch haggling, the tour hook, the other Duels, chess, the
campaign, shift events, fights, the casino or hotwiring.

The clamp (0.05..0.95) and D ≥ 1 are the formula of GDD §4.3, named constants in
`js/rules/check.js`, not a tuning table (CONTRACT D49).

## B-29 News and the daily log — `tuning.news`

`log` entries carry these weights; the morning headline is the heaviest entry of yesterday's log
(ties: the latest) if its weight ≥ `minWeight` = 10, otherwise a random city-absurdity template.
At most 20 entries a day.

| Kind | Weight | | Kind | Weight |
|---|---|---|---|---|
| `electionWon` | 100 | | `homeBought` | 45 |
| `removed` (impeached / coup) | 95 | | `jackpot` (slots $$$) | 45 |
| `electionLost` | 90 | | `casinoBig` (net win > $5,000 in a day) | 40 |
| `nominated` | 85 | | `ringWin` | 40 |
| `jailed` | 80 | | `fallMilestone` (the 20th fall, then every 25th) | 38 |
| `bankRobbery` | 78 | | `decree` | 35 |
| `hospital` | 70 | | `tour` | 30 |
| `castleBought` | 68 | | `smuggleDeal` | 20 |
| `promotedCeo` | 66 | | `fightWin` | 18 |
| `kidDied` | 64 | | `carHit` | 15 |
| `promoted` | 60 | | `stockMove` (a held ticker ±10 %) | 12 |
| `champion` | 58 | | `fall` | 10 |
| `degree` | 55 | | `storm` | 8 |
| `haroldRepaid`, `kidGood` | 52 | | `redTurnedIn` | 48 |
| `storeRobbery`, `busted` | 50 | | | |

Headline keys: `news.head.<kind>` (arrays of templates; P0 20 templates in all, P1 60). The log's
daily cap is `logMax` (20); the inbox cap of 150 messages is the save retention rule of
ARCHITECTURE §15, a constant shared by `effects.js` and `save.js` (CONTRACT D49).

## B-30 Duel skins — `tuning.duel`

**Stance mode:** each beat the opponent's stance is drawn uniformly (Logic, Emotion, Force) from
the rules RNG; the hint is right with probability min(0.95, 0.5 + INT/1000), otherwise it names
one of the other two at random. The option that beats the stance (Facts > Emotion, Charm > Force,
Pressure > Logic) has D × 0.5; the option the stance counters (Logic > Charm, Emotion > Pressure,
Force > Facts) has D × 2; the third has D.

| Skin | Mode | Beats | Options (label: stat) | D | Win | Lose | Auto |
|---|---|---|---|---|---|---|---|
| `holdup` | plain | 3, best of 3 | Intimidate: STR · Sweet-talk: CHA · Outwit: INT | store 60 + Heat; bank 400 + Heat + 100 × robberies in 14 days | 2 successes: loot (B-11b) | 2 failures: jail | best shown odds per beat, rolled |
| `debate` | stance | 3 | Facts: INT · Charm: CHA · Pressure: STR | 500 | +3 poll per won beat | -2 per lost beat | best odds given the hint, rolled |
| `interview` | stance | 3 | References: INT · A good word: CHA · Loom meaningfully: STR | 100 | ≥ 2 wins: Harold hired today | hired 3 days later | same |
| `interrogation` | stance | 3 | Facts: INT · Charm: CHA · Pressure: STR | 200 + Heat | ≥ 2 wins: -10 Heat | jail 2 + floor(Heat/25) days ("questioning") | same |
| `tourhook` | plain | 1 | Anecdote: CHA · Statistics: INT · Stunt: STR | 150 | fee ×1.2 | fee ×0.8 | best odds, rolled |
| `boardroom` | cards | 3 cards of 2-3 options | Safe: INT, D 100, success +0.05..+0.10 / failure -0.05..0 · Bold: CHA, D 250, +0.10..+0.20 / -0.15..-0.05 · Ruthless: STR, D 250, +0.10..+0.20 / -0.15..-0.05 and -1 karma | ×2 for the CEO takeover | m = clamp(1.0 + Σ, 0.7, 1.3); takeover: m ≥ 1.2 → +$20,000 | | the option with the best expected m change (INT ≥ 200 shows it to players), rolled; outcomes uniform in their range from the rules RNG, rounded to 0.01 |

## B-31 Health — `tuning.health`

| Key | Value |
|---|---|
| `tooHurt` | a voluntary action with worst-case HP cost c requires HP > c |
| `secondWind` | perk: HP 0 → 1, once a day (`daily.secondWind`) |
| `hospital.bill` | Standard: max(50, floor(0.10 × (cash + bank))), a forced charge; Relaxed: 0 |
| `hospital.hpPct` (was `hospital.hp`) | 0.5: HP = floor(0.5 × hpMax), set (not added) |
| `hospital.wake` | 720 (12:00) the next day, outside the home door you live at |
| `hospital.night` | the GDD §4.7 hospital subset (economy, no furniture gains) |
| `hardcore` | HP 0 → death (after Second Wind) |
