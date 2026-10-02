# Paper Sky: Game Design Document

*Paper Sky* is a fan remaster of the 2005 Flash game Stick RPG Complete. It is a new browser game
with new code, art, sound, music and writing. The game rules follow the original where this
document says so. Every screen that shows credits carries the line *"Fan remaster. Not affiliated
with or endorsed by XGen Studios."*

This is the design contract. The implementers follow it literally. Companion documents:

| Document | Holds |
|---|---|
| `BALANCE.md` | Every number: prices, wages, gains, odds, thresholds, targets. The source for `js/data/tuning.js`. |
| `UI.md` | Screens, flows, the design system, input, accessibility, onboarding |
| `ART_AUDIO.md` | Procedural art direction and audio direction |
| `ARCHITECTURE.md` | Engine, data formats, APIs, saves, tests, file list |
| `BUILD_PLAN.md` | Waves, work packages, ownership, acceptance criteria |

## 0. Conventions

- **(orig)** means the rule or value of Stick RPG Complete v1.22, as implemented in
  `/home/user/modern-agents/stick-rpg` (the faithful recreation). **(new)** marks a remaster
  addition. **(changed)** marks an original rule the remaster alters.
- **u** means world units. The world is the original map scaled ×2 (§3.2). At zoom 1.0,
  1 u = 1 logical pixel of the 1280×720 stage.
- **h / m** are in-game hours and minutes. The clock runs in 30 m steps.
- `rand(a..b)` is an inclusive integer uniform draw from the rules RNG. `chance(stat, D)` is the
  single stat-check formula of §4.3.
- **B-xx** points to a table in `BALANCE.md`. When this document and BALANCE disagree,
  BALANCE wins and the mismatch is a bug in this document.
- Every content item carries a priority tag. **P0** is required for the *Remastered Original*
  milestone at the end of wave 2: a complete, shippable remaster of everything the original had.
  **P1** is the expanded game (wave 3). **P2** is optional polish that can be cut without leaving
  holes (wave 4).

## 1. Vision and pillars

### 1.1 Pitch

You wake up as a stick figure in a city printed on one sheet of paper, floating in the sky of the
2nd Dimension. You have $100, a handful of points in everything, and a job offer from a burger
joint on your answering machine. Every action costs hours of a 24-hour day. Walking is free.
Walk off an edge and you fall. Study, flip burgers, climb the corporate ladder, drink for charm,
brawl for strength, gamble, rob, smuggle, or buy a castle and run for President (or Dictator) of
Sticks.

The remaster should feel like the game people remember, at the fidelity and polish they imagine
it had. Nothing that made the original work is removed. Every system gets the second layer it
never had, and the city becomes a place worth looking at.

### 1.2 Pillars

1. **The clock is the currency.** A 24-hour day. Only actions move the clock; walking, menus and
   dialogs are free. Every action shows its hour cost before you commit.
2. **Three stats, one conscience.** Strength, Intelligence and Charm (0 to 999) plus Karma (-100 to
   +100), which colours your stick. Every system reads these four numbers. The only other meters
   are small, visible and situational: Heat (crime) and Buzz (drinks).
3. **A city that is a toy.** A small, legible city you learn by heart. It is a sheet of paper in the
   sky: it has torn edges, a folded corner and a hole, and you can walk off it. Every original
   building stands on the same side of the same road, with its door on the same face (the castle,
   which the original entered through the mansion, gets its own door; §2.2).
4. **Choices with receipts.** Every button shows what it costs and what it gives. Every night
   ends with a newspaper. Every game ends with a front page that sums up your life.
5. **Irreverent, never mean-spirited.** Dry, absurd jokes in every line. All writing is new.

### 1.3 Title and naming policy

- Logo: **PAPER SKY**, with a torn paper tag *"a Stick RPG fan remaster"*. The title strings live
  in the text table (`text:game.title`, `text:game.tag`) so they can be changed without code.
- Kept names (they carry the "same game" identity): the 2nd Dimension, McSticks, Funkytown Five-O,
  Fine Line Furnishings, New Lines Inc. (NLI), University of Stick (U of S), Sticky's, Silver
  Lining Casino, Homeless Harold, Sticky, Detective McHolland, President / Dictator of Sticks.
- Everything else is new: products, minor characters, TV shows, rank names, perk and tier names,
  stock tickers, bus cities, minigame titles, stamps and every line of prose. `tools/banned.txt`
  (ARCHITECTURE §18, BUILD_PLAN Appendix A) lists strings of the original that must never appear,
  including its product names, TV channel, job title for the cook, rank names, cheat name, death
  screen text, darts title, election caller and near echoes of them. No perk, tier, rank or title
  may reuse one of the original's rank words (so: *Mastermind*, not "Genius"; *Angelic*, not
  "Saintly").
- **Decided by the lead (2026-09-29):** the title **Paper Sky** with the tag *"a Stick RPG fan
  remaster"*, and the kept names above. Changing either later is a text-table edit (`en-ui.js`,
  `en-world.js`) plus the logo strings, with no code change.

## 2. What stays, what changes, what is new

### 2.1 What stays identical

| Element | Kept as in the original |
|---|---|
| Premise | A stick figure in the 2nd Dimension's floating paper city. Walk off an edge and you fall: -10 HP (orig), no time passes (orig). |
| Clock | Day counter, 24-hour day, default wake 08:00, actions cost time, walking costs nothing, nothing runs past 24:00, sleep advances the day. Alarm clock and caffeine pill each wake you 4 h earlier; together they give a 00:00 start (orig). |
| Stats | STR / INT / CHA capped at 999; Karma -100..+100; **HP max = 15 + STR**, always (stored, and changed only by STR gains). |
| Karma colour | 10 bands each way: blue at 0, lighter to white at +100, purple to red at -100 (orig palettes, B-04c). |
| Map topology | Main Street north-south through the middle, West Avenue branching west in the upper half, East Avenue branching east at mid-height. Every original building on the same side of the same road with its door on the same face, in the same order (§3); the one exception is the castle (changed, §2.2). |
| Buildings | Home (apartment → bigger apartment → penthouse → mansion → castle), McSticks, Funkytown Five-O, pawn shop, Fine Line Furnishings, bank, NLI, U of S, Sticky's, Silver Lining Casino, bus depot. Every original action is still there (§6.1). |
| Job ladder | McSticks cook, then Janitor, Mail Room Clerk, Salesperson, Executive, Vice President, CEO at NLI. INT gates 20 / 40 / 75 / 120 / 180 / 250 (orig). One rung per request (orig). |
| Street cast | The smokes kid (skateboard for the first pack, the tenth pack kills him), Homeless Harold ($10 or a bottle), the dealer ($400 a gram), the parked junker (hotwire at 350 INT). |
| Vehicles | Skateboard ×2 (hold Shift), hotwired junker ×3, sports car ×5 (the day-365 gift). |
| Fights | AP per turn = min(floor(STR/20) + 1, 15). Punch 1 AP, kick 2, fireball 3, strongest move 4, with the original damage formulas. +3 STR per win (HP max rises with it). The winner may take the loser's wallet at -3 karma. |
| Casino | Slots, blackjack and roulette with $5 / $25 / $100 chips (+$500), a karma cost for gambling, a $2,000 roulette table limit (orig). |
| Smuggling | A midnight-only bus to other cities to sell bottles of beer or grams of product. Needs a phone and a loaded gun; low STR gets you mugged; more than 50 units gets you busted; the offer per unit grows with CHA (orig formulas and check order); -5 karma per deal. |
| Robbery | Store robbery needs a gun and **≥ 10 ammo**, must start **before 21:00** (orig: `time < 21`; with 30 m steps the latest start is 20:30), sends the clock to 24:00, uses 5-9 ammo and costs -10 karma whether it succeeds or fails (orig). |
| Endgame | Castle + $200,000 + all stats ≥ 666 with good karma → candidate for President of Sticks; all ≥ 777 with bad karma → Dictator. Money buys the campaign. The office pays every night. |
| Game length | 15, 40, 100 days or unlimited; the game ends when the day passes the length. |
| Ending | A net-worth count-up and a karma-flavoured rank stamp (new names). |
| Easter eggs | A cheat name (new text), the day-365 phone call and sports car, the bar fight's "(it froze)" button (now a joke), hold Enter to repeat an action. |

### 2.2 What changes, and why

| Change | Why |
|---|---|
| 16:9, 1280×720 logical stage, letterboxed; crisp vector art at any DPI; fixed 3/4 top-down projection; day/night lighting, weather, animated interiors; original synthesized music. | Fidelity |
| The city is a ×2 transform of the original map, plus three former sky pockets (Civic Plaza, Stickwood Park, Edgeview), a folded corner (the Dog-Ear) and one strip of **new land, the Castle Rim** (changed). The outline is a torn sheet whose irregularities are landmarks. | World design |
| **The castle (changed)** stands on the Castle Rim north of the apartment row with its own south door. The original drew it overlapping the mansion's footprint with its door face east and entered it through the mansion door when you lived there; a ×2 map cannot fit it there without covering the mansion. | Readable map, one door per home |
| **Edgeview Tower (new)** gives the penthouse a building of its own (the original penthouse had none). | World design |
| Lawns and plazas are walkable (the original walked only on roads), so edges can be reached almost anywhere. | A city that is a toy |
| Clock in 30 m steps; food costs 30 m (orig 1 h); beer costs 1 h (orig 2 h). One uniform wall: an action starts only if it ends by 24:00. | Granularity, clarity |
| Training follows a "value of an hour" rule (§4.5); TV capped at 2 h per channel per day. | The original made TV strictly best and the gym and study nearly worthless |
| Sleep restores a share of HP max, not a flat 20/30/40. | The flat restore stopped mattering at high STR |
| Bank interest mean-reverts around 1.5 %/day and is tiered; loans scale with your job. | The original's 1-6 %/day compounding made the bank the only strategy |
| Stocks have personalities and one INT-weighted tip per market day, with position caps and a spread. | INT pays in the market, without a money engine |
| Promotions need shifts at the current rank and, from Salesperson, some CHA. | The ladder is a climb, not a click |
| Standard difficulty turns 0 HP and a defaulted loan into setbacks; Hardcore keeps them lethal (orig). A setback is never cheaper than paying: the repo men seize assets and leave a lien. | Longer runs; the joke survives on Hardcore |
| Honest casino rules: real blackjack, a correct American wheel, a slot machine with a published pay table. | Fair, readable gambling |
| Bar-fight opponents are a named ladder with their own power (the original used your STR). | Fights you can read |
| Bus destinations are fictional floating cities you can see in the sky. | Fits the setting; avoids real-place stereotypes |
| Net worth counts stocks, homes and furniture; the rank table's unreachable tier is fixed. | Honest end screen |
| The election gains a 7-day campaign with poll maths and a debate; the office issues decrees. | The endgame becomes a place, not a message |

### 2.3 What is new (each deepens an existing system)

| New | Deepens | P |
|---|---|---|
| City Hall and Civic Plaza (Election Office, charity, soup kitchen, Precinct desk, Mayor's Office) | Endgame, karma, crime | P0 (Election Office) / P1 (rest) |
| Heat meter (0-100) | Crime: robbery odds, bus busts, jail length, police | P0 |
| Hustle minigames per job tier (Auto always allowed) | Work | P1 |
| Degrees and seminars at U of S | Training | P1 |
| Stat-milestone perks (pick 1 of 2 at 100/250/450/700) | Build choice without new stats | P1 |
| Karma tiers with small perks | Karma | P1 |
| Stickwood Park (jog, chess, ducks, bench, skate bowl) and Point Margin lookout | Free training, the edge as a place | P1 |
| Street encounters ("!" pedestrians) | Karma and money in small doses | P1 |
| Arcs for Harold, the kid, the dealer, McHolland | The original street cast get a beginning, middle and end | P1 |
| Speaking tours by bus | A legal, good-karma mirror of smuggling | P1 |
| Underground Ring (Saturdays, champions only) | Fights stay a challenge past the ladder | P1 |
| Decrees after the election | The endgame changes city rules | P1 |
| Weather (Markov chain, forecast) and a weekly calendar of bonuses | Time and place | P1 |
| Buzz (drinks affect darts and fights) | Sticky's | P1 |
| The Daily Fold (newspaper, morning report, results front page with graphs) | Receipts | P0 (report) / P1 (graphs) |
| The Advisor (3 suggested goals) and the Road to Office checklist | Onboarding, progression | P1 |
| "The city reacts to you" (billboard, statue, flags, posters, headlines) | Karma, ladder, endgame | P1 |
| Theory of the Fold: one secret collectible quest (5 Torn Scraps at the sheet's landmarks) | Exploration, the edge as a reward | P1 |
| Pocket journal / phone (tabs) | The original's inventory and stats panels | P0 |
| Achievements, Hall of Fame, legacy score | The end rank, kept across games | P1 |
| Classic mode (title menu, and a cabinet in Sticky's) opens the untouched recreation | Respect for the original | P0 (title) / P1 (cabinet) |

### 2.4 Rejected on purpose

Street time (moving outdoors costing clock time), opening hours or Sunday closures on original
buildings, a grid of full-width avenues, relationships and romance, pets, tattoos, tarot, fishing,
karaoke, mini-golf, street racing, extra career tracks, extra islands, Fame and Syndicate meters,
Alderman and Mayor races. Each would make the game a sequel instead of a remaster. Any new system
beyond §2.3 needs the lead's sign-off (BUILD_PLAN §1).

### 2.5 Decisions log (conflicts between the three proposals, resolved)

| Topic | Decision |
|---|---|
| Base design | The core-first proposal, with the world proposal's presentation and the expanded proposal's structure grafted on. |
| Map source of truth | The original map (`stick-rpg/js/world/map.js`) through the fixed transform X = 2x + 2560, Y = 2y + 2304 (§3.2). New pieces fill the original's sky pockets, plus exactly one strip of new land, the **Castle Rim** (X 480-1746, Y 200-784; `worldmap.newLand`), because the castle needs its own footprint (changed). |
| Projection | Fixed 3/4 top-down (screen y = ground y - 0.5 × height) with cached sprites. The per-frame perspective "lean" is a P2 option on the High preset only. Heights and setbacks are chosen so that no building covers another's door, porch or signature facade (§3.4, ARCHITECTURE §8.1). |
| Door faces | Original faces kept, except the castle (changed: south, its own door) and Edgeview Tower (new: west). East/west doors get an awning, blade sign, mat and light spill. A north face is never visible in this projection, so the two north doors (Fine Line, bus depot) are shown as a **porch**: a low entrance annex puts the door north of the main block, and the door is drawn as a ground-plane porch (mat, step, light spill) north of the annex plus a canopy and sign on the annex roof's north edge (§3.6). |
| Walking and time | Walking is always free. No street-time option. |
| Opening hours | None. Every building is open 24 h. The weekly calendar only adds bonuses. |
| Bus timing | Smuggling runs leave only at 00:00 (orig): the alarm-plus-pill puzzle survives. Speaking tours leave 06:00-10:00. |
| Store robbery | Needs a gun and ≥ 10 ammo (orig). |
| Bar-fight prize | The prize is the wallet: taking it gives the money and costs -3 karma (orig). |
| Stock tips | At most one tip per market day, reliability capped at 0.75, shocks 3-5 %, a per-ticker position cap, a 0.5 % spread, no short selling. |
| Fights past the ladder | The Underground Ring scales opponents with your STR. |
| Minigames | 9 engine files; hustles, hold-ups, debates and hotwiring are skins of 3 reskinnable engines (§6.5). Minigames never save time. Auto plays a real, sampled outcome, never the expected value; hustle pay tops out at ×1.3. |
| Falls | The Fold Rescue paper plane, capped at 1.5 s. No time cost (orig). |
| Collectible quest | Exactly one: Theory of the Fold (Torn Scraps). |
| Perks | 24 perks, each a single rule, never a stat-gain multiplier (§4.14). |
| Promotion gates | INT (orig) plus shifts at rank plus modest CHA from Salesperson up. No STR gates. |
| Karma for President/Dictator | ≥ +25 / ≤ -25 (the original's > 0 / < 0 let one point decide). |

## 3. World

### 3.1 The sheet

The city is one sheet of paper floating in the sky. Its outline is the original ground plus three
former sky pockets and a folded corner. Every irregularity is a landmark:

| Landmark | Where (u) | What it is |
|---|---|---|
| **The Dog-Ear** | NW corner. Crease from A(480, 620) to B(860, 200). | The corner is folded over. North-west of the crease is sky. The flap (triangle A, B, C'(898, 578)) lies on the sheet and shows the back of the paper: a greyer tone with faint mirrored print showing through (a nod to the original's mirrored signs). The crease is an unrailed edge. |
| **Castle Rim** (new land, changed) | X 480-1746, Y 200-784 | The castle's grounds, north of the apartment row and west of the mansion (the original drew the castle behind the mansion). A stone wall runs along the north and east rim. |
| **The NE Notch** | X ≥ 4228, Y < 840 | A torn-away corner of the Civic Plaza. The promenade railing is broken here. |
| **Civic Plaza** | X 3434-4396, Y 656-1642 (the original's NE sky pocket) | City Hall, Origin Plaza, the fountain and the statue plinth. Railed promenade on the north and east rims. |
| **Stickwood Park** | X 480-1646, Y 2262-4100 (the original's SW sky pocket) | Lawn, jog loop, pond, chess tables, skate bowl, Harold's bench. Unrailed west and south edges. |
| **The Bite** | a semicircular tear in the park's south edge, centre (1060, 4100), r 220 | An edge you can walk into. |
| **Edgeview** | X 3444-4396, Y 3124-4000 (the original's SE sky pocket) | Edgeview Tower (the penthouse) on a lawn. |
| **Point Margin** | tongue X 4060-4300, Y 4000-4440 | The lookout: coin binoculars at (4210, 4330), Brother Margin the edge preacher. Unrailed. |
| **The Bus Hole** | X 3599-3746, Y 2752-3124 (the original's bus-lot hole) | A hole in the paper beside the parked Sky Bus. Buses drop through it onto the Sky Ribbon. |
| **The Sky Ribbon** | sky layer | A paper-strip highway that curls from under the Bus Hole east into the sky toward the distant cities (drawn in the sky, not walkable). |
| **Road ends** | Main Street north (Y 656) and south (Y 4100), West Avenue west (X 480), East Avenue east (X 4396) | Every road runs off the paper, as in the original. Cars drop in at one end and tumble off the other. |

**Edges.** The island polygon (§3.3) minus the Bus Hole is walkable ground. It is drawn with a
torn-edge pass (midpoint displacement, amplitude 6-14 u, seeded per edge) and a 24 u paper
thickness band on edges that face south, east or west. **Railings** run only on the Civic
Promenade (Civic Plaza north rim X 3434-4228 and east rim Y 840-1642) and the castle wall. About
80 % of the reachable rim is unrailed.

**Distant islands.** The six bus destinations float in the sky as small paper cities with
parallax 0.15: skylines by day, pinprick lights by night. The Sky Ribbon visibly connects to two
of them (Port Eraser and Las Pegas). Positions are data (`worldmap.skyIslands`).

### 3.2 Coordinates and the transform

- World box: X 0-5120, Y 0-4608 (sky included). X grows east, Y grows south.
- **Original geometry is the source of truth.** Every original footprint, door, road and the bus
  hole comes from `stick-rpg/js/world/map.js` through **X = 2·x + 2560, Y = 2·y + 2304**. Walking
  speed is ×2 too (280 u/s against the original's 140 px/s), so a veteran's walk to Sticky's takes
  the same time it always did. Where the original's drawn rectangles overlapped (they included
  wall art), the ground footprints below are trimmed; the table is authoritative.
- One grid cell for the overview map below is 128 u.

### 3.3 Outline, streets and paths (u)

**Island outline** (clockwise, the Bite as an 11-segment arc):
(480,620) → (860,200) → (1746,200) → (1746,656) → (4228,656) → (4228,840) → (4396,840) →
(4396,4000) → (4300,4000) → (4300,4440) → (4060,4440) → (4060,4000) → (3444,4000) →
(3444,4100) → (1280,4100) → arc through (1060,3880) → (840,4100) → (480,4100) → back to (480,620).
**Hole:** Bus Hole X 3599-3746, Y 2752-3124.

| Street / path | Asphalt or path rect | Sidewalks | Notes |
|---|---|---|---|
| **Main Street** | X 2308-2670, Y 656-4100 | W X 2138-2308, E X 2670-2842 (interrupted by the avenues) | Runs off both ends. Lanes (drive on the right): southbound centre X 2398, northbound X 2580. |
| **West Avenue** | X 480-2308, Y 1328-1712 | N Y 1168-1328, S Y 1712-1870 (X 480-2138) | Runs off the west edge. Westbound lane Y 1424, eastbound Y 1616. |
| **East Avenue** | X 2670-4396, Y 2192-2570 | N Y 2032-2192, S Y 2570-2730 (X 2842-4396) | Runs off the east edge. Westbound Y 2286, eastbound Y 2476. |
| Junction J1 (Main × West Ave) | X 2308-2670, Y 1328-1712 | | T-junction |
| Junction J2 (Main × East Ave) | X 2308-2670, Y 2192-2570 | | T-junction |
| Zebra crossings | J1: Main N arm Y 1260-1328, S arm Y 1712-1780, West Ave mouth X 2160-2290. J2: Main N arm Y 2124-2192, S arm Y 2570-2638, East Ave mouth X 2690-2820. Mid-block: Main Y 3190-3258. | | Cars always stop for a pedestrian on a zebra (§3.9). |
| Castle Drive (path) | X 1420-1548, Y 620-1168, and the castle forecourt X 940-1548, Y 540-620 | | West Ave N sidewalk to the castle door |
| Bank Lane (path) | X 2842-3434, Y 1232-1360 | | Main E sidewalk to Civic Plaza |
| Origin Plaza (plaza) | X 3434-4396, Y 1160-1642 | | Fountain (3840,1460) r 90 solid; statue plinth 64×64 centred at (3840,1290) solid |
| Campus Walk (path) | X 3370-3450, Y 1642-2032 | | Plaza to East Ave |
| Park Path (path) | X 1646-2138, Y 3130-3258 | | Main W sidewalk into the park |
| Dealer Alley / Edgeview Walk (path) | X 2842-3700, Y 3390-3518 | | Main E sidewalk to Edgeview Tower |
| Margin Path (path) | X 4140-4260, Y 3730-4000 | | Tower lawn to Point Margin |
| Jog loop (park path, 64 wide) | rounded rectangle, outer X 600-1540, Y 2400-3800, corner r 160 | | |

### 3.4 Buildings (u)

Footprint = ground rectangle of each **mass** (a building is a main block plus an optional
entrance annex or a set-back tower). Height h is in u before the 0.5 projection factor. Door = face
and the centre of the door on that face. "Orig" = the original's position. **Heights and setbacks
are chosen so that no building's projected rectangle `[x0, y0 - 0.5h, x1, y1]` covers another
building's door porch or signature facade** (the ARCHITECTURE §8.1 visibility invariant); the
signature column lists what must stay visible.

| Id | Building | Masses: footprint X0-X1, Y0-Y1 (h) | Door | Orig / notes | Signature | P |
|---|---|---|---|---|---|---|
| `home_apt` | Paperview Apartments (your apartment; the bigger apartment is its top floor) | 608-1404, 784-1040 (200) | S (998, 1040) | NW block, door S | | P0 |
| `home_castle` | The Castle (For Sale until bought) | 940-1540, 240-540 (360; towers 460) | S (1240, 540) | **(changed)** on the Castle Rim with its own door, 144 u north of the apartment's projected roof (orig: behind the mansion, face E, entered through the mansion door) | south face, flags | P0 |
| `home_mansion` | Hillcrest Mansion (For Sale until bought) | 1746-2138, 700-1064 (200) | E (2138, 890) | Door E onto Main | | P0 |
| `bank` | Bank of the 2nd Dimension | 2842-3434, 656-1232 (280) | W (2842, 1135) | Door W onto Main | the red south facade | P0 |
| `nli` | New Lines Inc. tower | podium 2842-3370, 1360-1970 (200); tower 2930-3370, 1600-1970 (600) | W (2842, 1640) | Door W onto Main; the tallest building. The tower is set back 240 u from the north face so the bank's facade stays visible | rooftop billboard | P0 |
| `uofs` | University of Stick | 3450-4380, 1690-2000 (220) | S (3885, 2000) | Door S onto East Ave | the pediment | P0 |
| `cityhall` | City Hall (with the Precinct desk) | 3560-4120, 720-1160 (300; dome 420) | S (3840, 1160) | New, in the NE pocket | dome and facade | P0 |
| `furniture` | Fine Line Furnishings | main 640-1428, 2016-2262 (160); entrance annex 1090-1390, 1920-2016 (48) | N (1240, 1920), shown as a porch | Door N onto West Ave | | P0 |
| `mcsticks` | McSticks | 1460-2120, 1900-2330 (160; roof sign 260) | E (2120, 2050) | Door E onto Main | roof sign | P0 |
| `bar` | Sticky's | 1646-2100, 2384-3088 (180) | E (2100, 2537) | Door E onto Main; Harold outside | | P0 |
| `casino` | Silver Lining Casino | 1646-2100, 3296-4000 (260; dice 360) | E (2100, 3676) | Door E onto Main | the roof dice | P0 |
| `store` | Funkytown Five-O | 2842-3474, 2736-3390 (160) | W (2842, 3055) | Door W onto Main | | P0 |
| `pawn` | Pawn Shop | 2842-3444, 3518-4088 (170) | W (2842, 3681) | Door W onto Main; the dealer by its corner | | P0 |
| `bus` | Bus Depot | main 3782-4396, 2832-3124 (180); entrance annex 3960-4220, 2736-2832 (48) | N (4089, 2736), shown as a porch | Door N onto East Ave; the Bus Hole to its west | | P0 |
| `skybus` | The parked Sky Bus (solid prop) | 3510-3596, 2746-3124 (70) | none | The original's parked bus | | P0 |
| `home_pent` | Edgeview Tower (penthouse suite) | podium 3700-4140, 3290-3730 (120); tower 3760-4100, 3450-3730 (520) | W (3700, 3454) | **(new)**: the original penthouse had no building. The tower is set back so the bus depot's south face stays visible | crown lettering | P0 |

Street people and fixed interactables (standing points, u):

| Id | Who / what | Position | Orig | P |
|---|---|---|---|---|
| `harold` | Homeless Harold | (2160, 2440), Main W sidewalk by Sticky's | Outside Sticky's | P0 |
| `kid` | Skid, the smokes kid | (2090, 1110), lawn at the mansion's SE corner | By the mansion | P0 |
| `dealer` | Red, the dealer | paces X 2880-2960 at Y 3420 in Dealer Alley (clear of the pawn shop's projected roof) | Between the store and the pawn shop | P0 |
| `junker` | The Junker (parked, unlocked) | car rect X 636-818, Y 1064-1162 on the apartment lawn | Apartment lawn | P0 |
| `lookout` | Point Margin coin binoculars | (4210, 4330) | new | P1 |
| `preacher` | Brother Margin | (4120, 4200), 06:00-22:00 | new | P1 |
| `crease` | Professor Crease | park chess tables (1290, 3520), 10:00-20:00 | new | P1 |
| `mcholland` | Detective McHolland | walks the sidewalks when Heat ≥ 40, or for 3 days after the kid dies; otherwise at the Precinct desk (schedule: §6.2) | new walker (orig name) | P1 |

Park layout (P1): pond ellipse centre (1000, 3000), rx 220, ry 150 (solid); duck spot (1240, 3000);
chess tables at (1240, 3480), (1340, 3480), (1290, 3560); skate bowl X 1240-1460, Y 2500-2700;
Harold's bench (760, 2620); benches every 400 u along the jog loop; busker spot (1560, 3190).

### 3.5 Overview map

Derived from the tables above (1 character = 128 u; the tables are authoritative).

```
     0         1         2         3
     0123456789012345678901234567890123456789
  1  ~~~~~~~.......~~~~~~~~~~~~~~~~~~~~~~~~~~
  2  ~~~~~~.KKKKK..~~~~~~~~~~~~~~~~~~~~~~~~~~
  3  ~~~~~..KKKKK..~~~~~~~~~~~~~~~~~~~~~~~~~~
  4  ~~~~...:::::::~~~~~~~~~~~~~~~~~~~~~~~~~~
  5  ~~~~.......:..MMM:|||:BBBBB......~~~~~~~
  6  ~~~~.AAAAAA:..MMM:|||:BBBBB.HHHH.~~~~~~~
  7  ~~~~.AAAAAA:..MMM:|||:BBBBB.HHHH..~~~~~~
  8  ~~~~j......:....k:|||:BBBBB.HHHH..~~~~~~
  9  ~~~~::::::::::::::|||:BBBBB:::::::~~~~~~
 10  ~~~~==============+++:::::::::::::~~~~~~
 11  ~~~~==============+++:NNNN.:::o:::~~~~~~
 12  ~~~~==============+++:NNNN.:::::::~~~~~~
 13  ~~~~::::::::::::::|||:NNNN:UUUUUUU~~~~~~
 14  ~~~~::::::::::::::|||:NNNN:UUUUUUU~~~~~~
 15  ~~~~.....ffGGGGGG:|||:....:UUUUUUU~~~~~~
 16  ~~~~.FFFFFFGGGGGG:|||:::::::::::::~~~~~~
 17  ~~~~.FFFFFFGGGGGG:+++=============~~~~~~
 18  ~~~~.............:+++=============~~~~~~
 19  ~~~~.........SSSh:+++=============~~~~~~
 20  ~~~~.........SSS.:|||:::::::::::::~~~~~~
 21  ~~~~.........SSS.:|||:OOOOOb~..dd.~~~~~~
 22  ~~~~..,,,,...SSS.:|||:OOOOOb~.DDDD~~~~~~
 23  ~~~~..,,,,...SSS.:|||:OOOOOb~.DDDD~~~~~~
 24  ~~~~.........:::::|||:OOOOO.......~~~~~~
 25  ~~~~.............:|||:OOOOO.......~~~~~~
 26  ~~~~.........CCC.:|||:r::::::EEE..~~~~~~
 27  ~~~~......t..CCC.:|||:WWWWW..EEE..~~~~~~
 28  ~~~~.........CCC.:|||:WWWWW..EEE..~~~~~~
 29  ~~~~.........CCC.:|||:WWWWW.....:.~~~~~~
 30  ~~~~....~....CCC.:|||:WWWWW.....:.~~~~~~
 31  ~~~~...~~~.......:|||:WWWWW~~~~~..~~~~~~
 32  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.L~~~~~~
 33  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..~~~~~~
```

Legend: `~` sky · `.` lawn (walkable) · `,` pond (solid) · `:` sidewalk, path or plaza · `|` `=`
asphalt · `+` junction box · `K` home_castle · `A` home_apt · `M` home_mansion · `B` bank · `H`
cityhall · `N` nli · `U` uofs · `f` furniture annex · `F` furniture · `G` mcsticks · `S` bar ·
`C` casino · `O` store · `W` pawn · `b` skybus · `d` bus annex · `D` bus · `E` home_pent ·
`j` junker · `k` kid · `h` Harold · `r` dealer · `o` fountain · `t` chess tables · `L` Point
Margin lookout. The Dog-Ear flap is the lawn wedge at rows 2-4, columns 4-6; the Bite is the sky
bay at rows 30-31, columns 7-9; the Bus Hole is the `~` at column 28, rows 21-23.

### 3.6 Doors

- **Trigger.** Each door has a trigger box 96 × 48 u (long side along the face) centred 24 u
  outside the door. Walking enters after 0.2 s in the box **while your move input points within
  45° of the way into the door** (or a click-to-walk route ends in the box), so walking along the
  sidewalk past a door never enters it (orig: walk into the door). Interact enters within 96 u.
- **Prompt.** Within 96 u (the Interact range) the context prompt reads "[E] Enter McSticks";
  from 96 to 160 u only a plain name tag floats over the door.
- **Exit.** You are placed 56 u outside the door, facing away (orig: an 8 px nudge). The trigger
  re-arms only after you move more than 64 u from it, so you never bounce back in.
- **Driving.** Within 64 u of a door's kerb point the prompt reads "[E] Park and enter": the car
  parks at the kerb and you enter on foot (§3.8).
- **Visibility rule** (fixed 3/4 projection, where only roofs and south faces are visible):
  - a **south** door is drawn in the visible facade with a step and a mat;
  - an **east or west** door gets an awning that projects 32 u over the sidewalk, a blade sign, a
    doormat and a light spill at night;
  - a **north** door cannot be seen in any facade, so it is shown as a **porch**: the entrance
    annex (h 48) moves the door north of the main block, a ground-plane porch north of the annex
    (mat, step, a standing sign post and the night light spill, 0.5 × 48 + 32 = 56 u deep) and a
    canopy with the sign on the annex roof's north edge. The outer 32 u of the porch are never
    covered by the building's own roofs;
  - for every door, the visible part of its porch or awning, and every building's signature
    (§3.4), is never covered by another building's projected rectangle, and no prop stands within
    24 u of a porch. The invariants test checks this geometrically (ARCHITECTURE §8.1).
- **Home doors** (resolved by `SR.world.doors.resolve`, ARCHITECTURE §8.4). Paperview holds the
  apartment and the bigger apartment (its top floor) behind one door; Edgeview Tower holds the
  penthouse; the mansion and the castle one tier each. A home door opens the home card in one of
  three modes:
  - **Live** (you live there): the full home card (sleep, TV, computer, messages, save, ...).
    Paperview shows whichever of its tiers you live in.
  - **Owned** (you own a tier there but live elsewhere): that home's interior with **Move in**
    (free, instant), **Let out / End the let** (P1), **Sell** (P1, opens the bank's Real Estate page)
    and Leave.
  - **For Sale** (you own no tier there): a For Sale card (price, slots, sleep bonus, perk) with
    **Tour**, which opens the bank's Real Estate page focused on that property (`bank.realestate`
    with `homeId`), where you can buy it on the spot. While you live in the apartment, the
    Paperview card also has a "Top floor: Tour" row, also once the top floor is yours: it opens the
    Real Estate page on the top floor, whose card then offers Move in (the Paperview door stays in
    Live mode while you live on the ground floor, so its Owned mode never shows for the top floor;
    decided at the wave-2 integration, CONTRACT D71).

### 3.7 Camera and projection

- **Projection:** fixed 3/4 top-down. Ground is drawn top-down; height z is drawn upward:
  `screenY = worldY - 0.5 × z`. Buildings show their roof and south face. Characters, trees and
  lamps are upright standees. Everything is sorted by its ground contact y.
- **Occlusion fade:** a building whose projected rectangle covers the player, a door the player
  is within 160 u of, a named NPC or an active "!" marker fades to 35 % alpha over 150 ms. (The
  §3.4 layout guarantees that doors and signatures never need it; the fade is for people.)
- **Follow:** critically damped spring (ω = 8/s), 96 × 64 u dead zone, look-ahead of 0.25 s of
  velocity capped at 140 u.
- **Zoom:** three quantized levels, 0.8 / 1.0 / 1.25 (mouse wheel, `-`/`+`, pinch, RS-click).
  Driving eases one level out (0.6 s). Zoom scales the world layer only.
- **Bounds:** the camera centre is clamped to the island bounding box expanded by 480 u, so you
  always see sky past an edge but never scroll into empty sky.
- **Lean (P2):** on the High preset only, an optional setting draws each roof shifted horizontally
  by `clamp((cx - camX)/640, -1, 1) × 0.08 × h` with side walls as flat quads.

### 3.8 Movement and collisions

| Mode | Top speed u/s | Accel to top | Ratio (orig) | Notes |
|---|---|---|---|---|
| Walk | 280 | 0.08 s | ×1 | 8 directions plus analog; diagonals normalised (orig cut them to ×0.75 per axis) |
| Skateboard | 560 | 0.25 s | ×2 | Hold Shift / RT (toggle option); board drawn under you |
| Pro Deck | 700 | 0.25 s | ×2.5 (new) | Kid arc reward |
| Junker | 840 | 0.6 s | ×3 | Arcade steering, 3.2 rad/s; the back key brakes, then reverses at 200 |
| Sports car | 1400 | 0.9 s | ×5 | 3.8 rad/s; tyre squeal particles |

- The player is a circle of r 14 u at the feet. Building footprints, props (tree r 20, lamp r 6,
  hydrant r 6, bench 48 × 16 box), the pond, the fountain, the plinth, the parked Sky Bus and the
  castle wall are solid. Resolution slides along walls per axis with a 6 u corner-rounding nudge.
- Pedestrians push softly and never block. Cars are 96 × 52 u oriented boxes.
- **Vehicles** drive at full speed on asphalt and at 60 % on paths and plazas; on **sidewalks and
  lawns they are capped at 200 u/s** (you can cross a sidewalk or creep onto one, never race on
  it). C / Y enters or leaves your car when you stand within 64 u of it. Parked cars stay where you
  leave them (saved). To stop at a building, drive within 64 u of its door's kerb point and press
  Interact ("Park and enter"), or drive slowly into the door's trigger.
- **Your car and people:** pedestrians, Harold, Skid, Red and every other named NPC hop aside with
  a bark ("Hey!") when your car reaches them: no damage, no karma, no Heat. Hitting a traffic car
  is a crash: -5 HP, both cars bounce.
- **Your cars** are saved as `{ owned, bought, x, y, a }` (junker and sports car). Each has a **home
  lot**: the junker the apartment lawn, the sports car the mansion drive (delivered there even if
  you don't own the mansion).
- **Click / tap to walk:** A* over a 32 u nav grid of walkable cells, keeping 40 u from edges and
  never crossing sky. The route draws as a dotted ink line. Any movement input cancels it. Every
  scrap, interactable and door is reachable: within 32 u of a connected nav cell (ARCHITECTURE §8.1).

### 3.9 Edges and falling: the Fold Rescue

- **Warning:** within 60 u of an unrailed edge, a wind bed fades in (0 → -12 dB), paper fibres
  flutter on the rim and a soft vignette appears on that side (off with Reduced Motion).
- **Teeter grace:** when the player's centre leaves the walkable polygon (or enters the Bus Hole),
  they windmill for 150 ms. Reversing input in that window saves them ("phew").
- **The fall (1.5 s total, skippable by any key after 0.5 s):** 0.55 s drop (shrink, spin, the
  camera holds, clouds rush up), 0.5 s the **Fold Rescue** paper plane swoops in and catches you,
  0.45 s it drops you on the nearest nav node at least 64 u inside the edge with a paper crinkle.
- **Cost:** **-10 HP (orig), no time (orig).** Hard Landing perk: -5 HP. If this takes HP to 0,
  §4.16's "HP reaches 0" rules apply (Second Wind, Stick General, or death on Hardcore).
- **Pilot Ori** (the Fold Rescue pilot) says a running-gag line (toast bubble after landing) on
  falls 1, 2, 5, 10, 25 and 50.
- **Cars:** the car sails off; you are rescued on foot; the car is "fished out of the clouds" and
  back at its **home lot** the next morning for a $100 tow (a forced charge: cash, then bank, any
  shortfall written off; a message).
- Traffic cars that reach a road end tumble into the clouds (orig gag).
- Decree *Guard Rails for All* (§4.17) and the Assist option **Safe edges** (UI §8): edges bounce
  you back; no more falls (Safe edges also disables the fall achievements and Pilot Ori's gags).

### 3.10 Traffic (P0)

- **Portals:** cars drop into their lane at a road end from the sky, landing with a small bounce,
  and leave by rolling off the far end and tumbling. Main N end spawns southbound, Main S end
  spawns northbound, West Ave W end spawns eastbound, East Ave E end spawns westbound.
- **Density:** per lane, spawn interval rand(3..6) s from 07:00 to 20:00 and rand(8..14) s at night
  (B-22). At most 14 cars. Cars simulate within 2 screens of the camera; others despawn.
- **Junctions** (both are T-junctions with Main Street as the through road): a car on Main goes
  straight with 0.7 and turns into the avenue with 0.3; a car arriving from the avenue turns left
  or right with 0.5 each; never a U-turn. The junction box holds one car at a time; others wait at
  the stop line. Car-following keeps a 72 u gap with smooth braking. This never deadlocks. Every
  in-portal reaches an out-portal.
- **Cruise:** rand(360..520) u/s. Rain: braking distance ×1.3. Fog: speed ×0.8.
- **The player in the lane:** a driver with the player ahead in its lane within 220 u notices with
  probability `clamp(0.55 + karma/250, 0.2, 0.95)` (good people get braked for), brakes at
  1400 u/s² and honks. A driver who doesn't notice hits. A player standing on a zebra is always
  noticed.
- **Car hit (P0):** -10 HP (orig), 1.14 s knockdown (orig: 40 ticks at 35 Hz), and one of three new
  ambulance-chaser voicemails the next morning (orig: one of three). 20 % of those voicemails
  include a $50-$200 "settlement" cheque (new). Driving into another car: -5 HP, both bounce. If a
  hit or a crash takes HP to 0, §4.16 applies.
- Decree *Pedestrian Supremacy*: every driver always notices.

### 3.11 Pedestrians (P0 basic, P1 reactions)

- Target counts by hour: 06-09 → 18, 09-17 → 26, 17-21 → 30, 21-02 → 12, 02-06 → 4; rain × 0.5;
  × the quality preset's crowd factor (Low 0.5). At most 40 active, simulated near the camera,
  recycled out of view.
- They walk the sidewalk graph (nodes every 128 u along sidewalks, paths and plazas, generated from
  the street table), pause at shop windows and benches, and cross roads only on zebras.
- 8 archetypes: office stick (tie), student (backpack), jogger, tourist (camera), shopper (bag),
  night owl (glow stick), busker (park and plaza only), police officer (only when Heat ≥ 40, §4.10).
  Head colours come from a neutral list that never overlaps the karma palette.
- **Reactions (P1, flag `cityReacts`):** karma ≥ +50 → people wave (a bubble); karma ≤ -50 → they
  step away, one in five scurries. Idle pedestrians within 80 u turn toward the player. (±50 is
  the only threshold for crowd reactions, here and in §3.14.)
- **Barks (P1):** one-line bubbles (≤ 60 chars), at most one on screen every 4 s, chosen by
  context: bumped, karma band, job ≥ Executive ("Isn't that...?"), weather, time of day.
- Street encounters (§6.7) are pedestrians marked with a "!" bubble.

### 3.12 Day, night and weather

- **Lighting** is keyframed by hour and interpolated per game minute (ART_AUDIO §3). Because the
  clock jumps when you act, lighting tweens for 1.5 s after each jump. **Time-lapse on exit (P1):**
  leaving a building after spending ≥ 1 h plays a 1.2 s tween from the old time to the new: clouds
  race, shadows swing, lamps switch on, with a soft tick-tock accelerando.
- **Weather (P1, flag `weather`; P0 is always Clear)** is rolled each night from a Markov chain
  (B-19); while the flag is off, every weather condition reads Clear. Tomorrow's **forecast** (80 %
  accurate) is information you get: TV News, The Daily Fold, Market Watch and the Point Margin
  binoculars reveal it for the day (then the HUD weather tooltip shows it too); the morning report
  shows only today's weather. At 12:00 and 18:00 the weather may
  move one step (30 %), ramping over 20 real seconds; any Rain during the day sets
  `world.todayHadRain`.

| Weather | Presentation | Rule effects |
|---|---|---|
| Clear | crisp shadows | none |
| Cloudy | soft shadows, drifting cloud shadows | none |
| Rain | streaks, puddle ripples, wet sheen, umbrellas; 15 % of rain days are storms (lightning, thunder) | pedestrians × 0.5; car braking × 1.3; McSticks hustle tips +20 %; PPR stock -3 % that night |
| Windy | litter, flapping edges | within 48 u of an unrailed edge, gusts push you 40 u/s outward in 2 s bursts, always announced by a 0.5 s whoosh and a vignette flash (with Reduced Motion: the whoosh and a static edge tint). Assist › **No gusts** turns gusts off; **Safe edges** also stops the fall |
| Fog | cloud banks spill over the edges; vignette beyond 500 u | cars × 0.8; edge warning radius 90 u |

### 3.13 The weekly calendar (P1; bonuses only, nothing ever closes)

Day 1 is a Monday.

| Day | Bonus |
|---|---|
| Mon | Motivation Monday: +1 CHA on your first shift of the day (any job) |
| Tue | Open Mic at Sticky's, 18:00-24:00 (§6.1) |
| Wed | Half-price classes at U of S ($10) |
| Thu | Triple Thursday at McSticks: Triple Burger $40, Mega Meal $100 |
| Fri | Happy hour at Sticky's (beer $15 all day); NLI weekly bonus paid at night (§4.6) |
| Sat | Underground Ring at Sticky's (champions, §4.12); double VIP comp points at the casino |
| Sun | Flea market on Origin Plaza, 08:00-18:00 (P2: sell any item at 60 %); skate contest window 12:00-18:00 at the park bowl (kid arc) |

Timed events are **windows**, never instants: you can start them at any time inside the window
(the action still has to end by 24:00). Stocks move only on market nights: the nights after Monday
to Friday (§4.9). A **week** is `floor((day - 1) / 7)` (Monday to Sunday); every "once a week"
limit uses it.

### 3.14 The city reacts to you (P1)

| Trigger | World change |
|---|---|
| Job ≥ Executive | Some barks recognise you; the NLI lobby greeting uses your name |
| CEO | The NLI rooftop billboard shows your portrait (your stick, accessory and karma colour) |
| Own the mansion / castle | A butler waves at the mansion gate; castle tower flags fly in your karma colour |
| President | Your statue on the Origin Plaza plinth, blue bunting on Main Street |
| Dictator | A red statue with a raised fist, red banners, twice the police, pedestrians bow nervously |
| Karma ≥ +50 / ≤ -50 | Pedestrians wave / step aside (§3.11); at ≤ -80 a pigeon flock follows you ("even the birds know") |
| Heat ≥ 50 | Wanted posters of your face on the bus shelters and lamp posts |
| Anything in yesterday's log (robbery, bust, promotion, graduation, the 20th fall, ...) | The next Daily Fold headlines the heaviest entry (B-29); the TV news leads with it |
| Decree Mandatory Hats | Every stick wears a hat |

For Sale boards on the homes you own no tier of and the kid's memorial (after the tenth pack) are
not part of this P1 table: they belong to P0 rows (the home doors' For Sale mode, BALANCE's
`kid.givePack`) and show without a flag (CONTRACT D67).

## 4. Mechanics

All rules live in `js/rules/*.js` as pure functions of the state (no DOM, no canvas, no audio). They
run in Node for unit tests and the balance simulator. All numbers come from `js/data/tuning.js`,
which mirrors BALANCE.md.

### 4.1 Time

- The clock counts minutes since midnight (0-1440) in 30 m steps. You wake at 08:00 (orig).
- **One wall:** an action may start only if `now + cost ≤ 1440`. The original's scattered checks
  (a 6 h shift needs time < 19, a class < 23, food < 24, a bar fight < 22) are all this rule.
- **Take-the-day actions:** a robbery must start before 21:00 (orig `time < 21`; latest start
  20:30) and sets the clock to 24:00 (orig). Bus trips set the clock to 24:00 (orig).
- **Windows:** smuggling runs board only at 00:00 (orig); speaking tours board at any time from
  06:00 to 10:00 (the bus leaves when you board); Open Mic, the skate contest and the flea market
  are windows too (§3.13). The bus board has a **Wait for the tour bus** row before 06:00 that
  sets the clock to 06:00 (no other effect).
- **Free:** walking, driving, menus, dialogs, messages, deposits, trades, gambling (orig: no time),
  saving.
- At 24:00 the ClockRing pulses and only free actions and sleep remain. Walk home, or take a cab
  home with a phone (§4.18, allowed at 24:00).
- **Weekdays:** day 1 is Monday; `weekday = (day - 1) mod 7`; `week = floor((day - 1) / 7)`.

### 4.2 Stats, HP, karma, Heat and Buzz

- **New character:** each stat is rand(1..10), plus rand(3..9) extra points to distribute (orig),
  with unlimited rerolls (orig). **Fair start** gives 7 / 7 / 7 + 6.
- **Caps:** STR / INT / CHA ≤ 999; gains past the cap are lost (orig). Karma is clamped to
  -100..+100 after every change (orig clamped lazily).
- **HP max = 15 + STR (orig), always.** HP max is stored but changes only through STR gains
  (`SR.rules.stats.add('str', n)` adds the applied n to both); nothing else raises HP max. A gain
  lost to the 999 cap raises neither.
- **Winded (new):** while HP < 25 % of HP max, training gains are halved (floor, minimum 1). Shown as
  a status icon. Food matters all game. Winded is judged after the action's own HP cost (the gym's
  -4 can make its own gain Winded), and the preview shows the halved gain.
- **Heat (new, 0-100):** crime attention (§4.10). Shown on the HUD only while > 0.
- **Buzz (new, 0-5, P1):** +1 per beer or casino drink; -1 per 2 game hours (on the clock's 2-hour
  grid: each time an action's time passes 02:00, 04:00, ..., 24:00); reset by sleep. Sticky
  cuts you off at Buzz 5. Effects: walk sway at ≥ 3 (cosmetic, off with Reduced Motion); darts
  wobble × (1 + 0.4 × Buzz); a ghost dartboard at ≥ 2 (orig drew one always); punch damage +1 per
  Buzz (max +3). Shown as a status icon "Tipsy ×n".
- **Karma** changes follow B-04a. Karma tiers (P1, flag `karmaTiers`, B-04b): Angelic ≥ +80, Good
  +50..+79, Neutral -49..+49, Bad -79..-50, Wicked ≤ -80, each with a small perk (the faster Heat
  decay at Good is one of them, so it is off in P0). For colour-blind players a halo / horns glyph
  and a karma pip on the HUD carry the same information.
- **HP 0** is handled in one place (§4.16, ARCHITECTURE §6.7). Every *voluntary* action that costs
  HP is refused with "Too hurt" unless your HP is above its worst-case cost, so only involuntary
  damage (falls, car hits, crashes, a mugger's or an enemy's blow) can take you to 0.

### 4.3 The stat check

`chance(stat, D) = clamp(stat / (stat + D), 0.05, 0.95)`, with difficulty D = 25 (easy), 75
(medium), 200 (hard), 500 (heroic), or a stated value. The UI always shows the percentage before
you choose. Perks, karma tiers and Relaxed difficulty adjust named checks through one table
(BALANCE B-28b): e.g. Relaxed adds +0.10 to the Hold-up beats, the police Talk and the street
encounters' checks, and to nothing else.

### 4.4 Actions

Every building action, street interaction and item use is an **action** with a cost (money, time,
HP, items), requirements, and effects (ARCHITECTURE §6). The UI shows a pure **preview** of every
action (cost chips, gain chips, the chance of success, or the reason it is unavailable) before you
commit. The first failing requirement becomes a one-line reason: "Ends after midnight", "Need
$20", "Need INT 75", "Full HP", "Too hurt". Content tagged P1 or P2 carries its feature flag
(BUILD_PLAN Appendix B) and simply does not appear while the flag is off. **Forced charges** (a
hospital bill, a tow, the bar tab, a mugging, a seizure) take cash first, then the bank, and write
off any shortfall: cash and bank never go below zero.

**Repeat:** R repeats the last action of the building card you are in; holding Enter / A repeats it
every 0.35 s until it is refused (a deliberate nod to the original's hold-Enter feel). Only actions
marked `repeatable` repeat: food, training, TV, shifts, buying consumables. Nothing with a confirm,
a minigame, a sub-screen or an irreversible effect (crime, loans, fights, property, the campaign)
ever repeats, and a repeat stops at any modal, dialog, stamp or minigame, **except a stat-gain
stamp**: during a hold the first run's stat stamp shows and later ones are coalesced (the float
texts and flying chips still show every gain), so holding Enter on Study or a class keeps training;
a promotion, degree, jackpot or rank stamp still stops it (decided at the wave-1 integration).
Settings › Game can turn hold-to-repeat off.

### 4.5 Training: the value of an hour (B-03)

Design rule: a **free** source gives about 1 point per hour; a **paid** source 2 per hour for about
$10 per hour; a **premium** source 4 per hour for about $40 per hour. TV gives 2 per hour but only
2 h per channel per day. Furniture adds points while you sleep.

| Source | Where | Cost | Time | Gain | Limit | P |
|---|---|---|---|---|---|---|
| Study | U of S library | free | 2 h | +2 INT (orig +1) | none | P0 |
| Business class | U of S | $20 ($10 Wed) | 2 h | +4 INT (orig "go to class" +2) | none | P0 |
| Gym | U of S | free | 2 h | +2 STR (orig +1), -4 HP | none | P0 |
| Kinesiology class | U of S | $20 ($10 Wed) | 2 h | +4 STR, -6 HP | none | P1 |
| Theatre class | U of S | $20 ($10 Wed) | 2 h | +4 CHA | none | P1 |
| Seminar (per track) | U of S | $150 | 3 h | +10 in the track's stat | stat ≥ 150 and ≥ 10 classes in the track; 2 seminars a day | P1 |
| Online course | home, Workstation | $10 | 2 h | +3 INT | 1 a day | P1 |
| TV: News | home TV | free | 1 h | +2 INT (orig) | 2 a day | P0 |
| TV: Fitness / Dating | SkyDish | free | 1 h | +2 STR / +2 CHA (orig, satellite) | 2 a day each | P0 |
| TV: Market Watch | SkyDish | free | 1 h | +1 INT and today's stock tip | 1 a day | P1 |
| Drink a beer | Sticky's | $20 ($15 Fri) | 1 h | +2 CHA (orig 2 h) | Buzz 5 | P0 |
| Mingle | Sticky's | $5 tip | 1 h | +1 CHA and a rumour | none | P1 |
| Open Mic | Sticky's, Tue 18:00-24:00 | free | 2 h | +3 CHA, tips $5 + floor(CHA/20) | 1 a week | P1 |
| Jog | Park jog loop | free | 1 h | +1 STR, -3 HP | none | P1 |
| Chess hustle | Park (Professor Crease) | $20 stake | 1 h | +1 INT; win $20 on chance(INT, 150) | 3 a day | P1 |
| The Daily Fold | Funkytown Five-O | $2 | 30 m | +1 INT, today's tip, forecast | 1 a day | P1 |
| Smoke a pack | anywhere (Bag) | 1 pack | 1 h | +1 CHA, -10 HP, -1 karma (orig) | needs HP > 10 (orig) | P0 |
| Bar fight win | Sticky's | risk | 3 h | +3 STR (HP max rises with it; orig) | none | P0 |
| Nightly furniture | home | purchase | sleep | +2 per tier-1 piece, +4 per tier-2 piece (orig +1) | none | P0 / P1 |

- **Degrees (P1):** 20 classes in one track (Business, Kinesiology, Theatre) earn a degree:
  +25 to that stat once, a diploma decoration at home (no slot), and **+1 on every later gain of
  that stat** except nightly furniture. Graduation is a 1 h ceremony (confetti, a stamp).
- **U of S karma:** every U of S activity gives +1 karma (orig), at most +3 a day (new).
- **Winded** halves every gain in this table.
- **Too hurt:** the gym (-4), Kinesiology (-6), jogging (-3), smoking (-10) and every other HP cost
  need HP above the cost (B-03).

### 4.6 Jobs (B-05)

| # | Title | Employer | Needs INT (orig) | Needs CHA | Shifts at current rank | Wage $/h (orig → new) |
|---|---|---|---|---|---|---|
| 1 | Fry Cook | McSticks | none | none | none | 6 → 7 |
| 1b | Shift Manager (P1) | McSticks | none | 20 | 15 cook shifts | new: 10 |
| 2 | Janitor | NLI | 20 | none | none | 8 → 10 |
| 3 | Mail Room Clerk | NLI | 40 | none | 3 | 10 → 15 |
| 4 | Salesperson | NLI | 75 | 25 | 3 | 15 → 25 |
| 5 | Executive | NLI | 120 | 50 | 4 | 25 → 50 |
| 6 | Vice President | NLI | 180 | 90 | 5 | 50 → 120 |
| 7 | CEO | NLI | 250 | 140 | 6 | 100 → 300 |
| 8/9 | President / Dictator of Sticks | City Hall | election | | | $10,000 a night (orig $5,000) |

- You start hired at McSticks (orig premise). **Apply / promote:** one rung per request (orig). The
  row lists every missing requirement. A promotion gives +3 karma (orig), a voicemail from your new
  boss and a Stamp.
- **Moonlighting:** you may still cook at McSticks after joining NLI (the original moved you off).
  Your displayed title is your best job, or your office. **In office** you keep your NLI job and
  can still work shifts (and the Four-Day Week decree pays them ×1.25).
- **Shifts:** **Full** 6 h (orig), +1 karma (orig). **Half** 3 h at the same hourly pay, no karma,
  counts 0.5 toward the shift requirement. **Overtime** right after a Full shift (no other action
  in between): +2 h at 1.5× pay, -10 HP (needs HP > 10), once a day. All must end by 24:00.
- **Hustle (P1):** each shift row has a main button (Auto, pay multiplier m = 1.0 exactly) and a
  Hustle button that plays the job's minigame skin (§6.5) for **m in 0.7-1.3**. The hustle lasts a
  fixed real duration and the shift costs the same hours either way. A setting "Always Auto"
  hides the Hustle button. Skins by rank: cook and Shift Manager `orderup`; Janitor and Mail Room
  `sortit`; Salesperson (difficulty step 0) and Executive (step 1) `pitch`; VP and CEO
  `boardroom`. **Performance rating** = moving average of m (α 0.3, start 1.0); VP and CEO
  promotions need rating ≥ 0.9, which Auto always keeps.
- **Shift events (P1):** 25 % of shifts show a choice card with a stat check: **24 events, 3 per
  rank** for the 8 ranks (cook, Shift Manager, Janitor, Mail Room, Salesperson, Executive, VP, CEO),
  in `data/events.js`. Example: "The copier eats the quarterly report": fix it (INT, D 75) / kick it
  (STR, D 25) / blame the intern (CHA, D 75, -1 karma).
- **Weekly bonus:** Friday night, Executive 10 %, VP 20 %, CEO 30 % of that week's NLI wages (Monday
  to Friday; the week's counters reset on Monday morning).
- **CEO takeover (P1):** in your third week as CEO, a hostile takeover event plays the Boardroom
  skin at double difficulty (B-30); m ≥ 1.2 pays a $20,000 bonus; a loss only brings a humiliating
  voicemail.

### 4.7 Food, consumables and sleep

- **Food** costs 30 m (orig 1 h) and is refused at full HP (orig). Overheal shows as "+x (full)".
  Prices and HP are the original's (B-06). Store snacks are eaten on the spot. McSticks takeout
  (+$2) goes into the Bag and is eaten later (30 m) or given to Harold.
- **Sleep** at home runs **the night** (`SR.rules.night.run`, ARCHITECTURE §6.6). Every nightly
  rule of the game is a numbered step here, in this fixed, unit-tested order:
  0. **Capture** the facts of the day being ended: `endedDay`, its weekday, `isMarketDay`
     (Mon-Fri), `todayHadRain`, `daily.falls`, `casino.winToday`, `job.weekNliShifts`, whether a
     pill will be used (you own one and the pill toggle is on) and whether the alarm is owned.
  1. **Stocks** (market days only): each ticker ticks (§4.9) with its quirks (NLI CEO drift, SLC
     casino win, PPR rain, GLU falls, Burger Day, Stock scare) and the day's tip shock; prices that
     close below $1 reverse-split; history appended.
  2. **Bank:** rate step; savings interest (tiered, capped per night, 0 after *Seize the Bank*);
     CD maturities; loan interest; loan countdown and the 5- and 1-day warnings; at 0 with money
     owed, **default** (§4.8): Standard and Relaxed seize assets now; **Hardcore sets
     `flags.dead = 'loan'` and the night continues**.
  3. **Income:** rent from lets; the office salary; nightly decree cash (*Casino Levy* +$2,000).
     Income passes through the lien, if any (§4.8).
  4. **Weekly:** if the ended day is a Friday, the NLI weekly bonus.
  5. **Election** (§4.17): if the ended day was a campaign day (including a day in jail or in
     hospital), the rival's daily gain, then `campaignDay += 1`; the debate no-show penalty after
     day 4; **election night** after campaign day 7 (the report becomes the election-night
     edition); an unaccepted nomination lapses 14 days after the call.
  6. **HP restore:** `floor(hpMax × (0.25 + bed + freezer + home)) + 15`, capped at HP max. Bed
     +0.10 (tier 1) / +0.20 (tier 2); freezer +0.05; home +0 / 0.05 / 0.10 / 0.15 / 0.20 (apartment
     → castle). **A caffeine pill takes 20 HP off the restore (orig).** (The original restored a
     flat 20, 30 with a bed, 40 with bed and freezer in the mansion; this formula gives 20 at the
     start and keeps sleep meaningful at high STR.)
  7. **Nightly furniture gains.**
  8. **The day advances:** `day += 1`; today's weather = yesterday's "tomorrow"; tomorrow is rolled
     (Markov, B-19) and its forecast drawn; `todayHadRain` resets; wake time = 08:00, -4 h with the
     alarm clock, -4 h with a pill (one is used up).
  9. **Meters and counters:** Heat -10 (-15 at Good karma or better with `karmaTiers`; -25 with
     *Tough on Crime*, which replaces the others); Buzz 0; nightly decree stat effects (*Statue of
     Me* ±2 karma, *Mandatory Hats* +1 CHA); daily counters reset (TV, beers, gambling karma, U of
     S karma, the paper, chess, naps, darts, blackjack hands, campaign caps, once-a-day effects,
     falls, forecast seen); on a Monday morning the weekly counters reset (`weekly.*`,
     `weekNliWages`, `weekNliShifts`); the log rolls (today → yesterday).
  10. **Timers:** the car tow for any car fished out of the clouds ($100 forced charge; the car
      returns to its home lot); arc timers (Red's credit due → the goons, McHolland's bribe
      expiry, Harold's hiring and his repayment 14 days later, New Guy's arrival, the kid's
      contest day); bank-robbery days older than 14 are pruned; the week's city event is drawn on
      Sunday night; the new day's **stock tip** (market days) is drawn with today's INT; street
      encounters are seeded for the day.
  11. **Messages:** voicemails queued (lawyers after car hits, buyers, arcs, loan warnings, the
      Electoral Board, rivals, weather alerts, the office). **Day 365** in any mode: the phone call
      and the red sports car on its home lot (orig).
  12. **Morning:** nomination check (§4.17); the office morning (karma-flip counter, a decree offer
      when due); perk offers stay pending; achievements evaluated; history appended (daily to day
      120, then weekly); the report built with its headline (B-29); autosave (Hardcore: the
      ironman slot).
  13. **End:** if `flags.dead` is set, the game ends in death (Hardcore default: the report, then
      FLATLINED and the results with the DECEASED banner). Otherwise **a timed game ends when `day >
      length` (orig decided fix)**: the results follow the report.
- **Jail night** (`kind: 'jail'`, one per jail day, after the Jail Day choice): steps 0-5, 8
  (wake 08:00 in the cell), 9, 10 (plus `jail.daysLeft -= 1`; no encounters are seeded), 11, 12
  (a one-line jail report; no perk card) and 13. No HP restore (step 6) and no furniture (step 7).
- **Hospital night** (`kind: 'hospital'`, after HP 0 on Relaxed or Standard, §4.16): steps 0-5,
  step 6 replaced by **HP = floor(0.5 × HP max)**, no furniture (step 7), step 8 with the wake time
  fixed at **12:00**, then 9-13; the report is the *Stick General edition*.
- **The morning report** is *The Daily Fold, Morning Edition* (UI §5.11), in sections: Overnight
  (HP restored, gains, pill used), Your money (interest and rate, rent, salary, bonus, loan
  countdown, lien), Markets (yesterday's movers only), Weather (today's weather only), and Today in
  the city (calendar bonus, city event, unread messages, Heat), under one headline about yesterday.
- **Nap:** 2 h at home, +15 % of HP max, once a day; never advances the day.

### 4.8 The bank (B-09)

- **Deposit / withdraw** any whole amount: typed, or 10 % / 50 % / All buttons. The original's
  Flash-number exploits (1E24, octal) are gone; Classic mode keeps them.
- **Savings rate r** (% per day) starts at rand(10..30)/10. Each night
  `r ← clamp(r + 0.2 × (1.5 - r) + rand(-3..3)/10, 0.25, 3.5)`, mean-reverting to 1.5 (orig drifted
  -0.5..+0.4 with a floor of 0). Good karma tier: +0.25 on the rate you are paid.
- **Interest (tiered)** = `floor(T1 × r/100 + T2 × r/200 + T3 × r/400)`, where T1 is the balance up
  to $100,000 (minus open CD principal), T2 the part from $100,000 to $1,000,000 and T3 the part
  above, **capped at $25,000 a night** (so Unlimited runs grow linearly at the top, not
  exponentially). The original's 32-bit truncation is dropped.
- **Certificates (CDs, P1):** lock ≥ $1,000 for 7 days at `r × 1.2` per day, simple interest at the
  rate when opened, paid at maturity. At most 3 open, total principal ≤ $100,000. Breaking one early
  returns the principal minus 10 % and no interest.
- **Loans:** one at a time (orig), 15 days (orig). The credit limit depends on your best job (B-09).
  Daily interest r + 1 % (orig: r). Partial repayment allowed.
- **Default** (the countdown reaches 0 with money owed): **Hardcore:** death by "collection agents"
  (orig; the night finishes first, §4.7). **Standard:** the repo men seize, in order, until the
  debt is paid: the bank balance, cash, CDs (broken: principal - 10 %), stocks (sold at the bid,
  no fee), furniture from the most expensive down at 50 % of its price, then homes you don't live
  in at 90 %. Whatever is still owed becomes a **lien**: half of all your income (wages, rent,
  salary, interest, deals, tour fees, loot, winnings) goes to it until it is paid; net worth
  counts it as debt. Default also costs **-10 karma**, **HP drops to 1** (at night step 2, before
  the night's restore at step 6, so you wake with 1 HP plus the restore; CONTRACT D70), and credit
  is frozen for **60 days**. **Relaxed:** the same without the HP loss. Defaulting is never cheaper
  than repaying (a unit test asserts that net worth after a default ≤ net worth after repaying the
  same loan).
- **Interest-rate board:** today's rate and a 30-day sparkline.

### 4.9 Stocks (B-10)

- Six fictional tickers with drift μ and volatility σ: MCS McSticks Corp, NLI New Lines Inc, SLC
  Silver Lining Casino, PPR Paper Mills of the 2nd Dimension, GLU Glue & Sons, SKY Skyward Air.
- **Market nights** (after Mon-Fri): `logret = μ + σ·z + shock`, with `z = 2·(u1 + u2 + u3 - 1.5)`,
  and `price = round2(price·e^logret)`. **Reverse split (changed):** a price that closes below
  $1.00 is multiplied by 10 and every holding divided by 10 (floor; the leftover shares are paid
  out at the closing price; the cost basis is unchanged; the history is rescaled). The original's
  $1 floor made a penny stock a free bet, so it is gone.
- **Quirks:** NLI drift +0.3 % while you are CEO and worked ≥ 3 NLI shifts that week; SLC -4 % the
  night after you win more than $5,000 there in a day; PPR -3 % after a rainy day; GLU +2 % after a
  day with any fall.
- **The daily tip (P1):** on each market day there is **exactly one** tip: a ticker and a direction,
  drawn at the start of the day (night step 10). Its truth is drawn at the same time with
  probability **`min(0.75, 0.5 + INT/2000)`** using that morning's INT, and the Stocks app shows that
  reliability. You only learn the tip from a source: TV News (60 % of viewings), The Daily Fold,
  Market Watch, Mingle (30 %) and, after his arc, Harold's Monday voicemail; nothing shows it for
  free (not the report, not the HUD). A true tip adds ±(3 + rand(0..2)) % in the stated direction on
  that market night; a false one moves the other way at half that size.
- **No short selling.** An "up" tip is a buy; a "down" tip is a reason to sell what you hold.
- **Trading** (P0) at the home computer (orig), or anywhere by phone with the Workstation (P1).
  Whole shares only. **Cost:** $5 per trade plus a 0.5 % spread on the trade value (buys fill 0.5 %
  above the price, sells 0.5 % below). **Position cap:** the cost basis held in one ticker ≤
  $10,000 + $100 × INT. The app keeps a 30-day history and shows average cost and unrealised P/L.
- With the cap, the spread, one tip a day and no shorts, the expected profit of trading every "up"
  tip at INT 500 is about 1.5 % of the capped position per tip (≈ $890), and since half the tips
  point down, about **$450 per market day** on average: below a CEO shift. The balance sim asserts
  it (BALANCE B-10, B-24).

### 4.10 Crime, Heat, police and jail (B-11)

- **Heat** rises with crime (B-11a) and falls 10 a night (P1 with `karmaTiers`: 15 at Good karma or
  better). At the Precinct desk (P1) you can pay it off at $50 per point.
- **Rob the store (P0):** needs a gun and **≥ 10 ammo** (orig), must start before 21:00 (orig
  `time < 21`: latest start 20:30), sets the clock to 24:00 (orig) and uses rand(5..9) ammo (orig).
  **-10 karma and +30 Heat win or lose (orig karma).** It plays the **Hold-up** (Duel skin): three
  beats; at each you pick *Intimidate* (STR), *Sweet-talk* (CHA) or *Outwit* (INT), each shown with
  its odds `chance(stat, 60 + Heat)` after check modifiers (Relaxed +0.10; P1: Bad or Wicked karma
  +0.15; cap 0.95; B-28b). Two successes win: loot **$100 + rand(0..499)** (orig rand(0..499)).
  Two failures: jail. *(For comparison: the original's success chance at CHA 100 is 59 %; choosing
  CHA every beat here gives 62.5 % per beat and 68 % over best of three.)* **Auto** plays each beat
  with the best odds and rolls it.
- **Rob the bank (P0):** needs a gun, ≥ 10 ammo and STR ≥ 100; **once a week**; start before 21:00;
  clock to 24:00; uses rand(5..9) ammo. Same flow with `D = 400 + Heat + 100 × (bank robberies in
  the last 14 days)`. Loot **$3,000 + rand(0..12,000)** (orig: the store's rand(0..499)). -20 karma,
  +60 Heat, win or lose.
- **Jail:** days = base + floor(Heat at arrest / 25). Base: store robbery 3 (Hardcore 5, orig),
  bank robbery 7, smuggling bust 5 (orig), police catch 2. A bank robbery or a bust confiscates the
  gun and ammo (orig: busts only). Each jail day runs the nightly economy (interest, loans, stocks,
  rent, salary) but not furniture, and shows the **Jail Day** card: Work out (+2 STR), Read (+2 INT),
  Make friends (+2 CHA; P1: +1 reputation in a random city), Keep your head down (+10 HP), with a
  one-line summary of the night. **Bail (P1):** with a phone, "call a lawyer" for **max($500, 2 % of
  your net worth at arrest) per remaining day** (Charming Rogue ×0.5), so bail stays a real cost
  late in the game. Jail days count toward a timed game and can end it (orig decided fix); they
  also count as campaign days. Heat is set to 20 on release, at 08:00 outside City Hall.
- **Arrest flow:** `crime.jail(s, reason)` sets `jail = { daysLeft, reason }` and runs the arrest
  night at once (a jail night, §4.7). Each morning in jail shows the Jail Day card; its choice
  runs the next jail night. When `daysLeft` reaches 0 you are released.
- **Police (P1):** at Heat ≥ 40, one officer per 20 Heat walks the sidewalks (Dictator: ×2). Bump
  into one, or stay within 64 u for 1 s at Heat ≥ 60, and you choose: *Talk your way out*
  (`chance(CHA, 50 + 2 × Heat)`, -10 Heat on success; on failure you must pick again from Bribe or
  Run), *Bribe* ($20 × Heat, -30 Heat, -3 karma), or *Run* (a 3 s head start; officers run 300 u/s,
  so walking loses and skating escapes; entering any building loses them; caught = 2 + floor(Heat /
  25) days in jail).
- **Detective McHolland (P1):** offers informant work (§6.2); after the kid's death he calls (orig).
  Bumping into him on the street plays the **interrogation** instead of a police stop (§6.5).

### 4.11 The bus depot: smuggling and speaking tours (B-12)

- **The red-eye (P0):** smuggling trips leave **only at 00:00** (orig), so you need the alarm clock
  and a caffeine pill. The trip takes the whole day (clock → 24:00, orig). Ticket per city (B-12).
- **Destinations** are fictional floating cities, each mirroring one original handler (ticket,
  mugging range, what buyers want): Crayonburg, Rustbelt Rise, Glitter Gulch, Gustytown, Port Eraser,
  Las Pegas (B-12). Demand varies ±15 % per city per day, hinted by rumours (P1).
- **Trip resolution, in the original order** (new parts marked):
  1. Nothing to sell: a wasted trip.
  2. No gun: mugged; you lose all cash and goods. *(P1: a kevlar vest saves half the cash.)*
  3. A gun but no ammo: mugged.
  4. STR < 100 + rand(0..range): mugged (so STR ≥ 100 + range is always safe: 210, 225 or 250).
  5. No cell phone: no buyers.
  6. **Busted** if you carry more than 50 - floor(Heat/5) units of either commodity (Crayonburg: at
     least that many), whatever the buyers want (orig): goods, gun and ammo lost, jail (§4.10).
  7. **Screwed** with probability 10 % (P1: -1 % per city reputation, minimum 3 %): goods lost.
  8. **Offer** per unit (orig formulas): booze `max(5, min(CHA/6, 50) ± rand(0..4))`, product
     `max(50, min(2·CHA, 600) ± rand(0..49))`, × the city's demand. The buyer takes all of the
     commodity they want (orig). **Take it** (-5 karma (orig), +5 Heat per 10 units, +1 city
     reputation), **Haggle** (P1: `chance(CHA, 150)` for +12 %; on failure the buyer walks), or
     **Walk away**.
- **Speaking tour (P1):** needs CHA ≥ 150, karma ≥ 0, a phone, and **a job of Executive or higher
  or a Theatre degree** (someone has to book you). **One tour per city per week.** Board at any
  time from 06:00 to 10:00 (the bus leaves when you board); the tour takes the rest of the day
  (clock → 24:00). No goods. Fee `floor(CHA × 3 × tourDemand × (1 + 0.05 × reputation))`,
  tourDemand 0.8-1.3 per city per day, reputation 0-10 per city; wired to the bank. The mugging
  check (step 4) applies but can only take the cash in your pocket. +2 karma, +1 reputation. One
  Duel "hook" beat (Anecdote CHA, Statistics INT or Stunt STR, `chance(stat, 150)`) is worth ±20 %.
  At CHA 600, reputation 10 and average demand a tour pays about $2,800: about a CEO's day, not
  a multiple of it.
- **Supply (orig):** bottles of beer $30 at Sticky's; product $400 a gram from Red (P1: ±10 % by
  week, and the dealer arc).
- **Presentation:** the Sky Bus drives into the Bus Hole, rides the Sky Ribbon past the clouds to the
  destination island (a 6 s scene, skippable), then an illustrated event card, then the ride home.

### 4.12 Bar fights and the Underground Ring (B-13)

- Starting a bar fight costs 3 h (must end by 24:00), -2 karma (orig) and +5 Heat.
- **Opponent ladder (P0):** 12 named regulars in order (§6.3). Opponent n = fights won + 1 (orig
  counter), capped at 12; after the champion, ordinary bar fights draw a random regular from 8-12.
  Opponent n has HP `8 + 12n + rand(0..4n)` and power `P = 6 + 9n`. (The original used *your* STR
  as their power; that quirk is fixed.)
- **Your turn:** AP = `min(floor(STR/20) + 1, 15)` (orig; +1 with Harold as corner man, +1 Brawler
  perk). `rand(x)` = floor(random × floor(x)) (orig). Moves: Punch 1 AP `rand((STR+10)/10) + 2·knife
  + 4·knuckles + Buzz(≤3)`; Kick 2 AP `rand(STR/4.5) + 2·knife + 1`; Fireball 3 AP `rand(STR/2.5)`;
  **Ink Beam** 4 AP `rand(STR/1.5)` (the original's strongest move, renamed); **Guard** 1 AP (P1:
  the next enemy hit does -50 %, two guards -75 %). Minimum damage 1 (orig). Any attack crits 10 %
  of the time for ×1.5 (+5 % at CHA ≥ 300). End Turn passes remaining AP.
- **Enemy turn:** one attack. `roll = rand(P) + 1`: above 40 Ink Beam `rand(P/1.5)`; above 20
  fireball `rand(P/2.5)`; above 10 kick `rand(P/4.5)`; else punch `rand(P/10) + 1` (the original's
  thresholds with P in place of your STR). A kevlar vest takes 30 % off (P1).
- **Win:** +3 STR (HP max rises with it; orig). Then **Take the wallet**: $10 + 15n + rand(0..10n)
  at -3 karma (the original's prize and karma), or **Buy him a drink** (P1): -$5, +1 CHA, +1 karma.
- **Lose:** Hardcore: HP 0, which is death unless Second Wind saves you (orig; §4.16). Standard: the
  bouncer throws you out: HP 1, 10 % of your cash goes on "the tab". Relaxed: HP 1, no cash lost.
  A fight never sends you to Stick General. **Run away:** no further cost (orig).
- **Auto ("Quick fight"):** the fight plays itself turn by turn with real rolls, spending AP on the
  move with the best expected damage per AP; never Guard, never Run.
- **Champion (P1):** beating #12 makes you Champion of Sticky's ($1,000).
- **Underground Ring (P1):** Saturdays after you are champion, one bout a day (3 h). Bout k (your
  k-th ring bout) has `P = 120 + 0.8 × STR + 20k` and `HP = 150 + 1.1 × STR + 30k`, so the ring keeps
  pace with you. Purse $500 + $250 × k. A loss uses the bar's lose rules.
- **"(it froze)"** button: kept as a joke; it plays a fake 2 s freeze, then a wink, then resumes.

### 4.13 Gambling (B-14)

- Gambling takes no time (orig). **Karma -1 per slot pull, roulette spin or blackjack hand (orig),
  at most -10 a day (new).**
- **Slots (P0) "Paper Jackpot":** three 20-stop reels, published pay table, **RTP 92.25 %**, hit rate
  21.25 % (B-14a). Bets $5 / $25 / $100 (orig), $500 at VIP Silver. Auto-spin 10 pulls.
- **Blackjack (P0):** 6-deck shoe, reshuffle at 75 %; dealer stands on soft 17; a natural pays 3:2;
  double on any first two cards (not after a split); split once (split aces take one card each); no
  insurance or surrender. Bets $5-$500. House edge about 0.5 %. **At most 60 hands a day.**
- **The pit boss (P1, flag `nightlife`)** watches everyone, counter or not: a hand whose bet is
  ≥ 4 × the table minimum ($20) while the true count is ≥ +2 adds +1 suspicion (×0.75 with Card
  Sharp); any other hand whose bet equals the previous hand's bet (a *flat bet*) takes 0.5 off
  (floor 0). At 8 suspicion (11 with CHA ≥ 400) you are **backed off** from blackjack for 7 days and
  suspicion resets. **Card Sharp perk:** shows the Hi-Lo running and true count. Design target:
  optimal Hi-Lo play inside these rules earns ≤ +0.3 % of the amount wagered (B-14b).
- **Roulette (P0):** American, 38 pockets, every bet type (straight 35:1, split 17, street 11, corner
  8, six line 5, dozen 2, column 2, red/black, odd/even, 1-18/19-36 1:1). 0 and 00 lose all outside
  bets. Table limit $2,000 (orig), $10,000 at VIP Gold. House edge 5.26 %.
- **VIP (P1):** 1 comp point per $100 wagered (double on Saturdays). Silver (500 points): 2 free
  drinks a day at the casino bar (+1 CHA, +1 Buzz each, 0 h) and the $500 slot bet. Gold (2,500):
  table limits ×5.
- **Scratch card (P1, store, $5):** one draw of 1..10,000: 1 → $10,000; 2-101 → $100; 102-1,101 →
  $10; else nothing. EV exactly $3.00, RTP 60 %; no karma.
- **Darts (Sticky's):** *Practice* (P0; 30 m; +1 CHA the first time each day; free and prizeless
  like the original's darts). *Match* (P1; 1 h; **at most 3 a day**): stake $10-$200 against Rookie
  (target 160, pays 2×), Regular (230, 2×) or Shark (320, 3×). 10 darts; rings 50 / 35 / 15 / 5 / 0
  in the original's proportions; the crosshair = your aim point plus a Lissajous wobble whose size
  grows with Buzz and shrinks with INT (geometry: B-14f).

### 4.14 Perks (P1, B-21)

Each time STR, INT or CHA first reaches 100, 250, 450 or 700, a Perk card offers two perks; you
keep one forever (24 perks). A pending pick waits on the Stats tab if you close the card.
**Perks never multiply stat gains** (degrees own that). Discounts never stack: of all percentage
discounts on a price, only the largest applies (BALANCE B-28a).

| Stat | 100 | 250 | 450 | 700 |
|---|---|---|---|---|
| STR | Iron Stomach: food heals +25 % (the heal of an eat action, rounded down) · Hard Landing: falls and car hits cost 5 HP (at most 5) | Brawler: +1 AP per fight turn · Pack Mule: smuggling bust threshold +10 units | Intimidating: Hold-up STR beats use D - 20; street muggers flee · Marathoner: walk and skate +15 % speed | Second Wind: once a day, HP 0 leaves you at 1 HP · Heavy Hitter: fight damage +25 % |
| INT | Speed Reader: Study and the Daily Fold take 30 m less · Coupon Clipper: 10 % off at McSticks, the store and the pawn shop | Market Sense: no 0.5 % stock spread · Tinkerer: Hotwire from INT 150; Timing Ring sweet spots +50 % | Workaholic: Overtime costs no HP and can be taken twice · Card Sharp: shows the Hi-Lo count; suspicion gains ×0.75 (§4.13) | Mastermind: seminars are free · Tax Wizard: the full-rate interest tier is $200,000 |
| CHA | Regular: beer $15 and Mingle always gives the daily tip · Smooth Talker: pawn buys at 55 %; Haggle +0.10 | Silver Tongue: tour fees +15 % · Fast Talker: police Talk uses D - 40; bribes -50 % | Networker: each promotion needs one shift fewer · Crowd Pleaser: Open Mic tips ×2; the tour hook always succeeds | Magnetic: campaign poll starts +5 · Charming Rogue: jail sentences -2 days (min 1); bail -50 % |

### 4.15 Homes and furniture (B-08)

| Home | Price (orig → new) | Where | Slots | Sleep bonus | Home perk (the home you live in; once a day unless stated) | P |
|---|---|---|---|---|---|---|
| Apartment | free | Paperview | 3 | +0 | none | P0 |
| Bigger Apartment | $25,000 → $10,000 | Paperview top floor | 5 | +5 % | Balcony: stargaze 1 h, +1 INT +1 CHA (P1) | P0 |
| Penthouse Suite | $50,000 → $40,000 | Edgeview Tower | 7 | +10 % | Throw a party: 3 h, $500, +8 CHA, once a week (P1) | P0 |
| Mansion | $100,000 | Hillcrest Mansion | 10 | +15 % | Swim: 1 h, +2 STR, +10 HP (P1) | P0 |
| Castle | $500,000 | The Castle | 14 | +20 % | Hold court: 1 h, +2 CHA, +1 karma (P1); required for the election (orig) | P0 |

- Buy at the bank's Real Estate desk ("Paperweight Realty", orig: the bank) or through a For Sale
  sign's **Tour**, which opens the same Real Estate page at the door (§3.6). Homes can be bought in
  any order (orig). **Move in** at the home's door (Owned mode), free and instant. Furniture moves
  with you; pieces beyond the new home's slots go to storage and do nothing.
- **Home perks** belong to the home you live in; owning several homes does not give several perks
  (one shared `daily.homePerk`). The party is once per calendar week (§3.13).
- **Let out (P1)** a home you own but don't live in for 0.6 % of its price a night (bigger apartment
  $60, penthouse $240, mansion $600, castle $3,000). **Sell (P1)** at the bank for 90 %. Net worth
  counts homes at 90 %.
- **Furniture** (B-08b) is gated by **slots** instead of the original's per-home gates; the default
  order still comes out the same (apartment: bed, TV, computer; bigger apartment adds books and
  treadmill; penthouse adds minibar and freezer). **Tier 2 (P1)** replaces tier 1 and credits 50 %
  of the tier-1 price. Some tier-2 pieces take 2 slots.

| Piece (tier 1) | Price | Effect (orig → new) | Tier 2 (P1) | Price | Tier-2 effect |
|---|---|---|---|---|---|
| Featherfold Bed | $500 | restore +10 HP → +10 % of HP max | Hibernation Pod | $4,000 | +20 % |
| Flatland 60 TV | $2,500 | News channel (orig) | SkyDish Satellite | $3,000 | + Fitness, Dating, Market Watch |
| Pixelwright PC | $2,000 | Stocks (orig) | Pixelwright Workstation | $8,000 | stocks by phone, trend arrows, catalogue, online course |
| Grand Atlas of Everything | $2,000 | +1 INT a night → +2 | Grand Library (2 slots) | $12,000 | +4 INT a night |
| Tread-Millionaire | $3,500 | +1 STR a night → +2 | Home Gym (2 slots) | $15,000 | +4 STR a night |
| Glacier Chest freezer | $2,500 | +10 HP, mansion only → +5 % restore anywhere; Leftovers 30 m +25 HP once a day | none | | |
| Globetrotter Bar Cart | $5,000 | +1 CHA a night → +2 | Cocktail Lounge (2 slots) | $18,000 | +4 CHA a night |
| Paper Reef Aquarium (P2) | $1,200 | Relax: 30 m, +10 HP, +1 karma, once a day | none | | |

Note: in P0 (wave 2) the satellite is sold as the original's separate piece (SkyDish Satellite
$3,000, needs the TV, no slot); in P1 it becomes the TV's tier 2 with the 50 % credit. The
satellite's Fitness and Dating channels exist in P0. The save schema moves to **v2** at the wave-3
integration, and its migration turns an owned P0 satellite into the `skydish` tier (ARCHITECTURE §15).

### 4.16 Difficulty and failure (B-16)

| | Relaxed | Standard (default) | Hardcore |
|---|---|---|---|
| Starting cash | $300 | $100 (orig) | $100 |
| HP reaches 0 | Stick General: the gag (below), no bill | Stick General: the gag, a bill of max($50, 10 % of cash + bank) | **FLATLINED**, then the results with the DECEASED banner (orig) |
| Loan default | repo men and a lien, no HP loss | repo men and a lien, HP to 1 | death after the night (orig) |
| Wages | ×1.25 | ×1 | ×1 |
| Check bonus | +0.10 on the checks B-28b lists | none | none |
| Store robbery jail base | 3 days | 3 days | 5 days (orig) |
| Saves | 3 slots, autosave, suspend | same | one ironman slot, written after every action that changes HP, money or karma and every night; reloading resumes that state; deleted on death |
| Legacy multiplier | ×0.75 | ×1 | ×1.5 |

**HP reaches 0** (only involuntary damage can do it, §4.2), in this order (ARCHITECTURE §6.7):
1. **Second Wind** (perk, once a day): you stay at 1 HP.
2. **Hardcore:** death. The FLATLINED stamp, then the results.
3. **Relaxed / Standard:** the "FLATLINED ... BZZT ... JUST KIDDING" gag, then **Stick General**
   (an off-map sky hospital). The bill is charged from cash, then the bank; any shortfall is
   written off (cash never goes negative). The **hospital night** runs at once (§4.7: the economy
   runs, no furniture gains, HP = 50 % of HP max) and you are discharged at **12:00 the next day**
   outside your home's door, after the Stick General edition of the report. A timed game can end
   in hospital.

### 4.17 The endgame: nomination, campaign, office (B-17)

- **Nomination (P0)** is checked every morning and whenever you step into the city (orig: on
  entering the city). Requirements: you **live in the castle** (orig), hold **≥ $200,000 in cash +
  bank** (orig: cash only), and either **all stats ≥ 666 and karma ≥ +25** (President) or **all stats
  ≥ 777 and karma ≤ -25** (Dictator). The Electoral Board of the 2nd Dimension calls (status
  `nominated`); the Journal's **Road to Office** checklist (P1) shows what is missing long before.
- **Accept** at City Hall's Election Office within **14 days** of the call and pick a **war chest**
  (the original's campaign tiers): $50,000 → +5 poll, $100,000 → +12, $200,000 → +25, paid from cash
  first, then the bank. The conditions must still hold when you accept. An offer not accepted in
  14 days **lapses** (night step 5). **Once accepted, the nomination is yours** even if your money,
  stats or karma later drop.
- **Starting poll** = 30 + (lowest stat - 600)/20 + |karma|/10 + war chest bonus (+5 Magnetic),
  rounded to 0.1. The poll is always clamped to **0-100**.
- **Seven campaign days**, then **election night** in the night that ends campaign day 7. Every day
  counts, including days in jail or in hospital. Each campaign night the **rival campaigns too**:
  poll -rand(1..3).
- **Campaign actions** (Election Office rows; each has a **daily cap**, and repeating the same
  action on the same day gives **half** its poll change, rounded to 0.1):

| Action | Cost | Time | Poll | Cap a day | Notes | P |
|---|---|---|---|---|---|---|
| Rally | $5,000 | 3 h | +1 + CHA/250 | 2 | | P0 |
| TV ad blitz | $25,000 | none | +4 | 1 | also from the phone | P0 |
| Door-knocking | free | 2 h | +1 | 2 | +1 karma; President only | P0 |
| Kiss babies | free | 1 h | +1 on chance(CHA, 300), else 0 | 3 | President only | P1 |
| Debate (day 4 only) | none | 2 h | 3 questions, +3 per win, -2 per loss | 1 | Duel skin `debate`; **not showing up by the end of day 4 costs -5** | P0 |
| Intimidate the rivals | none | 2 h | +3 on chance(STR, 500), else -3 | 1 | Dictator only; -5 karma, +10 Heat | P0 |
| Bribe officials | $50,000 | 1 h | +8 | 1 | -10 karma, +20 Heat, 10 % scandal (-6) | P0 |

  Each campaign day has a 40 % chance of a campaign event (12 in data, P1): scandal -5,
  endorsement +4, gaffe -2, viral meme +3, and so on.
  Example: a President starting at 40.8 % who does nothing loses about 14 points to the rival by
  election night; two rallies, two door-knocks and a TV ad a day (+11 a day at CHA 666, $35,000 a
  day) win comfortably. Money buys the campaign, as in the original.
- **Election night:** you win if `poll + rand(-5..5) ≥ 50`. The morning report is the
  **election-night edition** (UI §5.11): the result, the poll bar and the roll, a stamp and the
  march or the sad trombone. A loss keeps the money spent (orig).
- **Another run:** after a loss, a lapsed offer, an impeachment or a coup you can be nominated again
  from 30 days later (`retryFromDay`), as often as you qualify (the original never allowed a second
  run).
- **In office (P0):** job 8 / 9 (orig titles), **$10,000 every night wherever you sleep** (orig:
  $5,000 and only in the mansion or castle). You keep your NLI job and may still work.
- **Decrees (P1):** on taking office and every 7 days after, the Mayor's Office offers **3 random
  eligible decrees** and you pick one (or keep the offer for later). Eligible means: your path
  matches the decree's (`any`, `president`, `dictator`), it is not already active, and a once-only
  decree has not been used. A decree stays active for the rest of the term; there are no repeats.
  **Karma flip:** a President at karma < 0 for 3 mornings in a row is impeached; a Dictator at karma >
  0 for 3 mornings faces a coup. Either way the office and its decrees are lost and the money kept.

| Decree | Path | Once | Effect |
|---|---|---|---|
| Guard Rails for All | any | | edges bounce you back; no falls |
| Free Fries Friday | any | | McSticks food costs nothing on Fridays |
| Pedestrian Supremacy | any | | every driver always notices you |
| Casino Levy | any | | +$2,000 a night; the slots' $$$ line pays ×560 instead of ×700 (RTP 90.5 %) |
| Public Library Act | any | | Study gives +3 INT |
| Beer Subsidy | any | | beer costs $10 |
| Four-Day Week | any | | all shifts pay ×1.25 |
| Sky Bus Nationalised | any | | bus tickets free; tour fees +20 % |
| Mandatory Hats | any | | every stick wears a hat; +1 CHA a night from compliments |
| Statue of Me | any | | a festival: a second, gilded statue of you on Main Street and a festival headline; +2 karma a night (President) or -2 (Dictator) |
| Tough on Crime / Martial Law | any (name by path) | | Heat drops 25 a night; twice the police |
| Rename the City | any | yes | type a new name (a TextField), used on the results front page |
| Seize the Bank | dictator | yes | +$250,000 once; savings interest is 0 forever; -30 karma |
| Universal Basic Fries | president | yes | +10 karma; a celebratory news story |

### 4.18 Vehicles and getting around

- **Skateboard (P0):** the kid's gift after the first pack (orig), or $300 used at the pawn shop
  (P1). ×2. The kid's good ending gives a **Pro Deck** ×2.5 (P1).
- **Junker (P0):** hotwire the lot's car. INT ≥ 350 succeeds (orig), taking 1 h (the wall applies;
  the original had no clock check). Below INT 350 the P0 attempt fails and still costs 1 h (orig).
  **P1:** with INT 200-349 (150 with Tinkerer) you may instead try the Hotwire skin of the Timing
  Ring (1 h; needs HP > 45, its worst case): three hits start it; each miss is a -15 HP shock; three
  misses trip the alarm (+10 Heat, no car). Stealing it costs -5 karma and +15 Heat (new).
- **Sports car (P0):** the day-365 gift (orig), delivered to its home lot on the mansion drive, or
  $60,000 from the Workstation catalogue (P1; `bought: true`, which net worth counts).
- **Cab (P1):** needs a phone: $15 to any door on the map, 30 m (allowed at 24:00 when the
  destination is home).
- **Summon car (P1):** with a phone, your car appears on the nearest road cell, free.

### 4.19 Net worth, ranks, legacy (B-18)

- **Net worth** = cash + bank + CDs + stocks at market - loan - lien + homes at 90 % + furniture at
  25 % + a bought sports car at $30,000. (Orig: cash + bank - loan.)
- **Rank:** a stamp chosen by karma column (> +20 good, < -20 evil, otherwise neutral; orig) and
  net-worth tier (B-18). Every name is new. The original's unreachable tier is gone. A banner
  above the stamp names PRESIDENT OF STICKS or DICTATOR OF STICKS, or *UNVERIFIED* for the cheat
  name.
- **Rank table** (copied from BALANCE B-18, which is authoritative):

| Net worth ≥ | Neutral | Good (karma > +20) | Evil (karma < -20) |
|---|---|---|---|
| below $0 / $0 / $500 | IN THE RED / FLAT AS PAPER / CRUMPLED (all columns) | | |
| $1,500 | STICK FIGURE | NICE STICK | TROUBLEMAKER |
| $5,000 | DOODLE | HELPING HAND | HOODLUM |
| $15,000 | SKETCH ARTIST | NEIGHBOURHOOD HERO | HUSTLER |
| $40,000 | GO-GETTER | PILLAR OF THE COMMUNITY | RACKETEER |
| $100,000 | BIG SHOT | HUMANITARIAN | CRIME BOSS |
| $250,000 | TYCOON | BELOVED BENEFACTOR | KINGPIN |
| $600,000 | MAGNATE | LIVING LEGEND | OVERLORD |
| $1,500,000 | MOGUL | PATRON OF THE PAGE | SUPERVILLAIN |
| $5,000,000 | PAPER TITAN | GUARDIAN ANGEL | SCOURGE OF THE SKIES |
| $15,000,000 | SUPREME SCRIBBLE | HALO INCARNATE | PURE RED MENACE |

- **Endings.** A run ends in one of four ways, each with its own Final Edition headline family:
  *Time's up* (a timed game passes its last day, including in jail), *Retired* (Unlimited, from the
  pause menu), *Deceased* (Hardcore: HP 0 or a defaulted loan; the DECEASED banner) and *Quit*
  (no results). Being in office at the end adds the PRESIDENT / DICTATOR banner and the statue
  photo; finishing the Theory of the Fold adds the MET THE ARTIST sticker; the cheat name adds
  *UNVERIFIED*. After a timed game's results, **Keep playing** continues it unranked.
- **Legacy score (P1)** = (floor(net worth / 100) + STR + INT + CHA + 5 × |karma| + 250 × achievements
  unlocked this run + 500 × job rank + 10,000 if elected) × the difficulty multiplier, where job
  rank is Fry Cook 0, Shift Manager or Janitor 1, Mail Room 2, Salesperson 3, Executive 4, VP 5,
  CEO 6, office 7. The top 10 per game length form the **Hall of Fame** (Short, Medium, Long,
  Unlimited). A Custom length (P2) is filed under the nearest of 15 / 40 / 100 days (ties go to the
  longer; above 100 days: Long); a Keep-playing run is entered once, at its original end, and never
  again; the cheat name is never entered.

## 5. Game modes

| Setting | Options |
|---|---|
| Length | Short 15, Medium 40, Long 100, Unlimited (orig); Custom 7-365 (P2) |
| Difficulty | Relaxed, Standard, Hardcore (§4.16) |
| Unlimited | adds **Retire** to the pause menu, which goes to the results |
| After a timed game | **Keep playing** continues it as an unranked Unlimited game |
| Tutorial | on / off at creation (the Day 1 script of this run, stored in the save); Settings › Game › Hints turns the one-shot hints off for later runs |
| Classic | the title menu (and Sticky's cabinet, P1) opens `../stick-rpg/index.html`, the untouched 1:1 recreation, in the same tab after a suspend save; the browser's Back button returns to the remaster's title, where Continue resumes |
| Cheat name (P0) | naming yourself `PAPERGOD` gives 555 in every stat and $10,000, renames you "Totally Legit", disables achievements and the Hall of Fame, and prints *UNVERIFIED* on the results |

## 6. Content

### 6.1 Buildings and every action

Format: **Action** (cost, time): effect. Every action is data in `js/data/buildings/<id>.js`
(ARCHITECTURE §6). Every building's card has a greeting line chosen by first visit, time, karma,
weather and job (≥ 6 variants per building, P1; 2 in P0).

**Home** (every tier; the interior art changes with the tier) — owner portrait: your own stick.
The door opens the card in Live, Owned or For Sale mode (§3.6); the rows below are Live mode.
- Sleep (P0): the night (§4.7), then the morning report.
- Nap (P1): 2 h, +15 % HP max, once a day.
- Messages (P0): free; an inbox with an archive (orig: a replay-once queue). Without a phone,
  messages are read only at home (orig).
- Watch TV (P0): News (needs the TV); with the satellite, Fitness and Dating; Market Watch (P1).
- Computer (P0): Stocks (needs the PC). Workstation (P1): Catalogue (sports car $60,000; furniture
  delivery at +10 %), Online course.
- Home perks (P1): stargaze / party / swim / hold court (§4.15); Leftovers (freezer); Relax
  (aquarium, P2).
- Save (P0; Hardcore: saving is automatic). Properties (P1): opens `bank.realestate` (move in, let
  out, sell from anywhere you own).
- Campaign HQ (P0, castle only, while nominated): a shortcut to City Hall's Election Office rows.

**McSticks** — Manager Mel. Food is 30 m and refused at full HP. Employees get 25 % off.
- Milkshake $8, +12 HP (orig) · Fries $12, +20 HP (orig) · Cheeseburger $25, +40 HP (orig) · Triple
  Burger $50, +80 HP (orig; $40 Thu) — P0.
- Mega Meal $120, +200 HP; appears once HP max ≥ 200 ($100 Thu) — P1.
- Takeout: any food "to go" at +$2 into the Bag — P1.
- Work: Cook (Full / Half / Overtime; Order Up hustle P1) — P0 (Full), P1 (Half, OT).
- Ask for a promotion: Shift Manager — P1.

**Funkytown Five-O** — the clerk, Dee.
- Slushee $1 +1 HP, Candy bar $2 +3 HP, Nachos $4 +7 HP (orig; 30 m, eaten here) — P0.
- Smokes $10 a pack, max 99 (orig) · Caffeine pills $45 each, max 99 (orig) — P0.
- The Daily Fold $2 · Scratch card $5 · Gum $1 (max 9; kid arc) — P1.
- Rob the place (Hold-up) — P0.

**Pawn Shop** — Vinnie.
- Knife $100 (+2 punch and kick damage, orig) · Hand gun $400 (orig) · Ammo 5 for $10, max 99
  (orig) · CD alarm clock $200 (orig) · Cell phone $200 (orig) — P0.
- Brass knuckles $300 (+4 punch) · Kevlar vest $900 (-30 % damage in fights and muggings) · Used
  skateboard $300 (if you have none) — P1.
- Sell: 40 % of the price for anything bought here — P1.
- A clean shirt $20 (Harold's comeback; appears once he asks for it) — P1.

**Fine Line Furnishings** — the salesperson, Sofia. Every piece and upgrade in §4.15. Browsing
shows a live preview of the piece in your current home (P1). A piece that doesn't fit shows
"Needs a free slot" instead of hiding (orig hid it).

**Bank of the 2nd Dimension** — Penny Wise, teller.
- Deposit, Withdraw, Get a loan, Repay (orig) — P0 (each opens its sub-screen).
- Real Estate desk (`bank.realestate`): buy homes (orig) — P0; sell, let and view rentals — P1.
- Interest-rate board with a 30-day sparkline — P0. CDs — P1.
- Rob the bank — P0.

**New Lines Inc.** — Bea, your boss; Gil in the mail room; Frankie in sales; Terry, your
assistant from VP up.
- Apply for a job (orig) · Ask for a promotion (orig; shows missing requirements) · Work (Full) —
  P0.
- Work Half / Overtime, the hustles (Sort It, Pitch, Boardroom), the bulletin board (weekly bonus,
  rating) — P1.

**University of Stick** — Dean Quill.
- Study, Business class, Gym (orig) — P0.
- Kinesiology class, Theatre class, Seminar, Transcript (classes per track, degree progress),
  Graduate — P1.

**Sticky's** — Sticky, the barkeep.
- Drink a beer $20, Buy a bottle of beer $30 (orig), Get into a bar fight (orig), Darts practice
  (the original's darts, free and prizeless) — P0.
- Mingle, Darts match (3 a day), Open Mic (Tue 18:00-24:00), the Underground Ring (Sat, champions),
  the Classic cabinet ("Play the 2005 original": suspend-save, then open Classic mode) — P1.

**Silver Lining Casino** — Lucky Lou, pit boss.
- Slots, Blackjack, Roulette (orig) — P0.
- VIP desk (`casino.vip`: points, tier and progress, today's free drinks, the limits table) — P1.

**Bus Depot** — Tabby, at the ticket window.
- Destination board (`bus.board`: 6 cities, orig count) with the red-eye smuggling run per city — P0.
- Speaking tour per city (window 06:00-10:00; "Wait for the tour bus" before 06:00), Rumour board
  (demand hints, your reputation) — P1.
- The departure clock ("Next red-eye: 00:00") — P0.

**City Hall** (new) — Clerk Plume.
- Election Office: accept a nomination, pick the war chest, campaign actions, the debate — P0.
- Mayor's Office: decrees, once in office — P1.
- Charity box: $100-$1,000, +1 karma per $100 (at most +10 a day) — P1.
- Soup kitchen: 3 h, +4 karma, +1 CHA, once a day — P1.
- Precinct desk: pay off Heat ($50 per point), bail, Detective McHolland (informant deals, his
  weekly tip, the bribe; §6.2) — P1.
- City-event rows (Blood Drive, Recycling Drive) on their day — P1 (B-19).
All numbers of City Hall's civic rows and of the park: BALANCE B-27.

**Stickwood Park and Point Margin** (outdoor; walk up to things and press Interact) — P1.
- Jog loop (1 h, +1 STR, -3 HP; needs HP > 3) · Chess tables (Professor Crease; chess hustle; the
  Theory of the Fold quest) · Duck pond (feed the ducks: $2, 30 m, +1 karma, once a day) · Harold's
  bench · Park bench nap (1 h, +10 HP, once a day; at karma < 0, 10 % chance a pickpocket takes 10 %
  of your cash) · Skate bowl (with a board: 1 h, +1 STR, +1 CHA, once a day; kid arc; the Sunday
  skate contest window 12:00-18:00).
- Point Margin binoculars ($1, 30 m: reveals tomorrow's forecast for the day, a view of a distant
  city; first use is an achievement) · Brother Margin (listen 30 m, 06:00-22:00: +1 karma once a
  day, a sermon about the void).

### 6.2 Characters and arcs

| Character | Role | Arc | P |
|---|---|---|---|
| **Homeless Harold** (orig) | Sticky's corner (schedule below) | **Give $10** (1 h, +2 karma; the first gift also +6 CHA, orig). **Give a bottle** (1 h, no karma; the first also +8 CHA, orig). **Comeback (new):** after 5 gifts of $10 and one McSticks takeout ("Give" in the Bag), he asks for a clean shirt (pawn, $20). Giving it plays the **interview** (Duel skin: you vouch for him to Mel); he is hired at McSticks (seen at the counter), and 14 days after hiring he repays $2,000 (+10 karma, achievement *Second Chances*) and phones in the Monday stock tip from then on. **Barfly branch:** 5 bottles and he becomes Sticky's most loyal patron and your corner man in fights (+1 AP). | P0 / P1 |
| **Skid, the smokes kid** (orig) | Mansion corner | **Give a pack** (1 h, -2 karma, orig). First pack: the skateboard (orig). The 10th pack kills him: -30 karma and McHolland's call (orig; kept, played with cartoon distance); a skateboard with flowers leans on the lamp post afterwards. **Good branch (new):** give him gum (30 m, +1 karma) on 3 different days; he quits, trains at the skate bowl, and wins the Sunday skate contest (the first Sunday at least 3 days later; you watch it inside the 12:00-18:00 window, 2 h); he gives you his Pro Deck (+10 karma, *Role Model*). | P0 / P1 |
| **Red, the dealer** (orig) | Dealer Alley | Sells product at $400 a gram (orig), up to 99 held: **Buy n grams** with a NumberField, no time (orig), -1 karma per 10 g (rounded up; new). **Credit line (new):** once you have bought 50 g in total, Red offers 20 g on credit: you owe 20 × the price of the day, payable in full at Red ("Pay Red") within 7 days. Paid: he offers credit again a week later. Missed: the morning after the due day his **two goons** ambush you the next time you step into the city (two forced fights in a row at ladder n = 6). Win both: the debt is cancelled, Red's credit ends for good, +10 Heat. Lose: the debt is a forced charge (cash, then bank, the rest written off) and the fight's lose rules apply; credit ends for good. After 100 g bought, -10 % prices. He can be turned in to McHolland (+15 karma, $1,000); "New Guy" replaces him 14 days later at +15 % prices. | P0 / P1 |
| **The Junker** (orig) | Apartment lawn | Hotwire at INT 350 (orig; below it the attempt fails and costs 1 h, orig); the Timing Ring attempt from INT 200 (P1). | P0 / P1 |
| **Detective McHolland** (orig name) | Walks at Heat ≥ 40 or for 3 days after the kid's death; otherwise at the Precinct desk | **Informant** (after you accept his offer at the Precinct desk, possible at Heat ≥ 20 or after the kid's death): turn in Red (+15 karma, $1,000), and **Pass a tip**, a Precinct row (30 m, once a week) that halves your Heat. Evil path (karma < 0): **bribe** him $2,000 for 7 days without Heat gains (through the 7th day inclusive). He stops offering informant deals at Wicked karma. Meeting him on the street plays the **interrogation** (§6.5). | P1 |
| **Sticky** (orig) | Barkeep | Runs the ladder and the ring; cuts you off at Buzz 5; fight gossip in greetings. | P0 |
| **Manager Mel** | McSticks | Your first boss: the day-1 job offer (new text for the orig premise), Shift Manager promotion, comic voicemails. | P0 |
| **Dean Quill** | U of S | Degree ceremonies, seminar invitations. | P1 |
| **Vinnie** | Pawn Shop | "No questions asked"; suggests the vest if you are jailed often. | P0 |
| **Penny Wise** | Bank | Rate forecasts, loan warnings, property tours. | P0 |
| **Bea, Gil, Frankie, Terry** | NLI | Promotion voicemails, shift events, the CEO takeover; Terry nervously asks the CEO to dinner (a nod to the original's CEO voicemail beat, new writing). | P0 / P1 |
| **Dee** | Five-O clerk | Greetings, robbery reactions. | P0 |
| **Sofia** | Fine Line | Greetings. | P0 |
| **Tabby** | Bus depot | Rumour board, trip warnings. | P0 |
| **Lucky Lou** | Casino | VIP tiers, the back-off. | P0 |
| **Clerk Plume** | City Hall | Elections, decrees. | P0 |
| **Mayor Doodle / General Crayon** | Election rivals (President / Dictator race) | The debate, attack ads, concession or revenge voicemails. | P0 |
| **Professor Crease** | Park chess tables | Chess hustle; the Theory of the Fold quest. | P1 |
| **Brother Margin** | Point Margin | The edge preacher; part of the Theory of the Fold. | P1 |
| **Pilot Ori** | The Fold Rescue | Falls. | P0 |
| **The Electoral Board** | Phone | Nomination call. | P0 |

**Arc rules** (every street number: BALANCE B-26).
- **Branches are exclusive from their third step.** Harold: the comeback's third step is giving
  the shirt, the barfly's is the 5th bottle; whichever happens first closes the other branch. The
  kid: the 3rd pack closes the gum branch (he refuses gum), and the 3rd gum day closes the packs
  (he refuses smokes). Before that, both paths stay open.
- **The original beats always stay:** Harold accepts $10 and bottles at any of his spots, with their
  karma and first-gift bonuses, whatever his branch; the kid's first-pack skateboard and the
  10th-pack death are unchanged.
- Arcs listen to the rule events of ARCHITECTURE §6.8 (`gift`, `buy`, `talk`, `enter`, `night`,
  `fight`, ...).

**Schedules** (`data/people.js`; a person not scheduled anywhere is not in the city):

| Person | P0 | P1 changes |
|---|---|---|
| Harold | Sticky's corner (2160, 2440), always (orig) | Comeback, once hired: McSticks counter 10:00-16:00 (inside, in the interior art), his park bench (760, 2620) 06:00-10:00 and 16:00-22:00, Sticky's corner otherwise. Barfly: Sticky's corner, and inside the bar interior 20:00-02:00 |
| Skid | mansion corner (2090, 1110), always (orig); gone after the 10th pack | Gum branch: the skate bowl 10:00-18:00, the mansion corner otherwise; after the contest: only at the bowl on Sundays |
| Red | Dealer Alley, pacing, always | Turned in: gone; New Guy on the same beat 14 days later |
| McHolland | — | on foot 08:00-22:00 while Heat ≥ 40 or within 3 days of the kid's death; Precinct desk 09:00-17:00 otherwise |
| Professor Crease | — | park chess tables 10:00-20:00 |
| Brother Margin | — | Point Margin 06:00-22:00 |

### 6.3 Fight roster (Sticky's ladder, n = 1-12; P0)

1 Wobbly Pete (30 % of his attacks miss) · 2 Big Lou (no relation to Lucky Lou) · 3 The Accountant
(always kicks) · 4 Karate Kyle · 5 Biker Barb · 6 Two-Beers Ted · 7 Mad Dog Morty · 8 The Professor
(fireball odds ×2) · 9 Iron Irma (takes 30 % less damage) · 10 Sergeant Stomp · 11 The Bouncer's
Cousin · 12 Old Man Knuckles (the champion). Each is data (`js/data/fighters.js`): name, palette
key, accessory, optional P and HP overrides, a quirk flag, three taunt lines. The ring's opponents are
masked regulars ("The Stranger", "Paper Tiger", ...), data too.

### 6.4 Items (the Bag)

| Group | Items | P |
|---|---|---|
| Consumables | smokes (orig), caffeine pills (orig; auto-use toggle), McSticks takeout, gum, scratch cards, The Daily Fold | P0 / P1 |
| Gear | knife (orig), hand gun (orig), ammo (orig), CD alarm clock (orig), cell phone (orig), skateboard (orig) / Pro Deck, brass knuckles, kevlar vest, a clean shirt (Harold's comeback) | P0 / P1 |
| Commodities | bottles of beer (orig "booze"), product (orig contraband; its label is "snow" in the text table) | P0 |
| Keys | junker (orig), sports car (orig) | P0 |
| Documents | diplomas, property deeds, bus ticket stubs (the red-eye stub is a souvenir), Torn Scraps | P1 |

Bag actions (`js/data/actions/bag.js`): `bag.smoke` (P0; 1 h, +1 CHA, -10 HP, -1 karma, needs HP >
10), `bag.eatTakeout` (P1; 30 m, the meal's HP), Give (to the street person whose dialog is
open: $10, a bottle, takeout, gum, a pack or the shirt; it runs that person's own gift action, the
same action as the dialog's row, so it has no action of its own; CONTRACT D69), `bag.pillToggle`
(free), and Info (the Bag's detail pane). The cell phone turns the Pocket into a phone (UI §5.9)
whose apps and contacts are actions in `js/data/actions/phone.js`.

### 6.5 Minigames: engines and skins

Every minigame runs in one framework (ARCHITECTURE §10): fixed duration or fixed number of beats,
**Auto** for every engine but roulette, an **Assist** option (-30 % speed, +50 % sweet spots, half
the wobble), pause at any time, keyboard, mouse, touch and gamepad, and a screen-reader mirror of
its state. **Auto plays a real round** with a fixed policy and real draws (never the expected
value, so it can lose): the fight takes the best expected damage per AP each turn; darts throw at
random moments of the wobble; the hotwire ring hits each press with p = sweet arc / 360°; every
Duel beat takes the best shown odds and rolls; blackjack plays the hand by the book; a hustle's
Auto is simply the normal shift (m = 1.0). **Minigames never save time:** the action's hour cost is
the same whatever you do in the game.

| Engine (file) | Skins | Rules summary | Result | P |
|---|---|---|---|---|
| Fight (`fight.js`) | bar fight, Underground Ring, Red's goons | §4.12; big side-view rigs; 60 ms hit stop | win / lose / run | P0 |
| Darts (`darts.js`) | practice, match | 10 darts on a board of radius 220 px (the play area's pixels); rings in the original's proportions (B-14f); the crosshair is your aim point plus a Lissajous wobble of amplitude `120 × (1 + 0.4 × Buzz) × (1 - min(INT, 600)/1200)` px; the aim point follows the pointer (or the stick / arrows) with 0.2 s smoothing; the dart lands where the crosshair is when you throw; a ghost board at Buzz ≥ 2 is only a distraction; click, Space or A throws | score | P0 |
| Slots (`slots.js`) | Paper Jackpot | §4.13; reels stop at 1.2 / 1.6 / 2.0 s (press to stop early) | payout | P0 |
| Blackjack (`blackjack.js`) | table | §4.13; H hit, S stand, D double, P split (an input context, so these keys don't move or toggle the HUD) | payout | P0 |
| Roulette (`roulette.js`) | table | §4.13; click-to-bet board, chips 5/25/100/500, C clears the bets, Space spins; 5 s spin (skip after 2 s), last-12 history; no Auto | payout | P0 |
| Scratch (`scratch.js`) | scratch card | drag or press to scratch 3 panels; the result is drawn before you scratch | payout | P1 |
| Shift Rush (`shiftrush.js`) | `orderup` (cook, Shift Manager), `sortit` (Janitor, Mail Room) | 30 s. *orderup:* tickets list 2-5 items from 6 bins; press 1-6 in order, Enter serves; tickets every 6 s speeding to 3 s. *sortit:* items slide down; Left / Down / Right sends each to one of 3 bins; streaks step ×1.1 to ×1.5 | m = clamp(0.7 + 0.075 × correct - 0.1 × wrong, 0.7, 1.3) (sortit scores 1 correct per 3 items) | P1 |
| Timing Ring (`timingring.js`) | `pitch` (Salesperson: step 0, Executive: step 1), `hotwire` (junker: step 0) | A needle sweeps a ring at 180°/s + 30°/s per difficulty step. *pitch:* 5 presses; sweet arc 8 % + CHA/40 % of the ring (cap 40 %); m = 0.7 + 0.12 per hit. *hotwire:* sweet arc clamp(20° + (INT - 200)/5, 8°, 70°); up to 5 presses; 3 hits start the car, each miss -15 HP, 3 misses = alarm | m or success | P1 |
| Duel (`duel.js`) | `holdup` (P0), `debate` (P0), `boardroom` (P1), `interview` (Harold, P1), `interrogation` (McHolland, P1), `tourhook` (P1) | N beats; each beat offers 2-4 options, each with a stat, a difficulty D and shown odds. **Stance mode** (debate, interview, interrogation): the opponent takes a stance each beat (Logic, Emotion or Force), hinted correctly with probability min(0.95, 0.5 + INT/1000) (otherwise the hint names another stance). The three options are Facts (INT), Charm (CHA) and Pressure (STR). **Counter table:** Facts beats Emotion, Charm beats Force, Pressure beats Logic (the option that beats the stance has **D halved**); Logic counters Charm, Emotion counters Pressure, Force counters Facts (the countered option has **D doubled**); the third option is neutral | successes per beat | P0 / P1 |

Skins are data files (`js/minigames/skins/<skin>.js`) with art hooks, option labels and text; their
numbers (beats, options, stats, D, win and lose effects, Auto policy) are BALANCE B-30. When each
Duel skin plays:
- **holdup:** robbing the store or the bank (§4.10).
- **debate:** City Hall, campaign day 4 (§4.17).
- **boardroom:** the VP and CEO hustle (3 decision cards with 2-3 options each; each option has a
  stat, a D and an m change on success and on failure; INT ≥ 200 shows each option's expected
  value; m = 1.0 + the sum, clamped 0.7-1.3) and the CEO takeover (the same at double D).
- **interview:** giving Harold the clean shirt: you vouch for him to Manager Mel (3 beats, stance
  mode, D 100). Two wins: hired today. Otherwise: hired 3 days later.
- **interrogation:** bumping into McHolland on the street (3 beats, stance mode, D 200 + Heat). Two
  wins: -10 Heat and he walks off. Otherwise: jail for 2 + floor(Heat / 25) days ("questioning").
- **tourhook:** the speaking tour's hook (1 beat, plain: Anecdote CHA, Statistics INT, Stunt STR, D
  150; ±20 % of the fee).

### 6.6 Jail Day, hospital, death

- **Jail Day card** (§4.10): one choice per day; a one-line summary of last night (interest, a
  stock mover, a message); a day ticker with gags; the bail button (P1).
- **Hospital card** (Relaxed / Standard): the FLATLINED stamp, a defibrillator "BZZT", "...JUST
  KIDDING", then Stick General's bill (with any written-off shortfall) and the Stick General
  edition of the morning report; discharge at 12:00 outside your home.
- **FLATLINED** (Hardcore: HP 0 or a defaulted loan): the stamp, then the results with a DECEASED
  banner.

### 6.7 Street encounters (P1; 1-3 a day, a "!" over a pedestrian)

Each is data with conditions (time, karma, stats, weather), a weight and a daily cap (B-20). They
are seeded each morning at times inside the day you actually have: day encounters between your
wake time and 23:00; **night** encounters (the mugger, the pickpocket) between 21:00 and 24:00,
and between 00:00 and 04:00 only on a day you woke at or before 00:00. A choice that can cost HP
is offered only when your HP is above its worst case (Fight the mugger: HP > 20; Climb for the
cat: HP > 10).

| Encounter | Choices → outcomes |
|---|---|
| Lost tourist | Point the way: +2 karma, 50 % a $10 tip |
| Dropped wallet | Return it: +5 karma · Keep it: $20-$150, -5 karma |
| Street magician | Tip $5: 50 % +1 CHA · Heckle: +1 CHA, -1 karma |
| Mugger (night) | Pay $20-$100 · Fight: chance(STR, 75); failure -20 HP and the cash · Run: chance(STR, 25); a failed run is the Fight's failure (Intimidating perk: he flees) |
| Flyer guy | A coupon: half price on your next McSticks meal |
| Jogger race | $20 stake, chance(STR, 75), +1 STR either way |
| Petition | Sign: +1 karma |
| Pickpocket (night) | Notice with chance(INT, 75), or lose 5 % of your cash |
| Cat up a tree (park) | Climb: chance(STR, 25): +3 karma; a fall: -10 HP |
| Old lady crossing Main | Help (30 m): +3 karma; the cars honk |
| Talent scout (CHA ≥ 200) | A commercial shoot: 3 h, $500 (the wall applies) |
| Busker | Tip $2-$20: +1 karma per $10 |
| Stalled car | Push it (STR ≥ 40): $20, +1 STR |
| Puddle splash (rain) | -1 CHA unless you dodge (chance(INT, 25)) |

### 6.8 Events, messages, TV

- **Voicemails** (≥ 120 in data): the day-1 job offer (Mel), promotions, lawyers after car hits
  (3 new variants for the original's 3), buyers after deals (5, like the original's 5, new names),
  arcs, the Electoral Board, rivals, the day-365 call (from "your friendly remaster crew"), loan
  warnings (5 and 1 days left), weather alerts. P0 covers the original's beats; P1 the rest.
- **City events (P1, one a week, data; every number in B-19):** Burger Day (McSticks food half
  price, MCS +5 %), Heat Wave (the HP costs of training and work, their "Too hurt" thresholds and
  their possible hurt ×1.5, rounded up), Casino Night (a Friday: the slots' Bell ×3
  line pays ×24 instead of ×20, RTP 95.45 %), Paper Recycling Drive (donate a furniture piece at City
  Hall for karma), Stock scare (all tickers -5 % then a rebound), Blood Drive at City Hall (1 h, -20
  HP, +5 karma, $50). The week's event and its day are drawn on Sunday night and announced in
  Monday's paper.
- **TV** (P0 news; P1 channels): 30 news stories (weather, the day's tip, city absurdities that react
  to you, e.g. "Local stick falls off edge for the 20th time"), 10 fitness shows, 10 dating shows,
  8 Market Watch segments.
- **The Daily Fold:** the headline is chosen from yesterday's log: the heaviest entry by the
  priority table B-29 (a promotion outweighs a fall; an election outweighs everything), with a
  "city absurdity" template when nothing happened (P0: 20 templates; P1: 60). The TV news leads
  with the same story.

### 6.9 Theory of the Fold (P1; the one secret quest)

Professor Crease believes the city is "a sheet of paper on somebody's desk". He asks you to find 5
**Torn Scraps**, one at each landmark of the sheet:

| # | Landmark | Position (u) | Condition |
|---|---|---|---|
| 1 | Dog-Ear flap | (720, 460) | always |
| 2 | NE Notch | (4180, 890) | always |
| 3 | The Bite rim | (1060, 3810) | only 04:00-07:00 |
| 4 | Point Margin tip | (4125, 4372) | always |
| 5 | Bus Hole rim | (3672, 3190) | only in fog or rain |

Every scrap sits at least 64 u from any unrailed edge and within 32 u of a reachable nav cell, so
it can be reached by click-to-walk and a gust can never push you off while you pick it up.

Each scrap is a glint (visible within 200 u) and a pickup with one line of a mysterious diary.
Reward: +15 INT, the **Fold Map** (all interactables on the Pocket map) and a finale: at Point
Margin at midnight, the binoculars show a giant desk lamp and a hand holding a pencil. Brother
Margin admits he just likes the view. Achievement *Paper Trail*; the results page gets a small
"MET THE ARTIST" sticker.

### 6.10 Achievements (P1, 48; stored per profile with the run day of unlock)

| id | Name | Condition |
|---|---|---|
| fall_1 | Paper Cut | first fall (fall achievements are off while Safe edges is on) |
| fall_25 | Frequent Flyer | 25 falls |
| carhit_1 | Speed Bump | hit by a car |
| mcsticks_10 | Fry Guy | 10 McSticks shifts |
| job_mail | Upwardly Mobile | Mail Room Clerk |
| job_exec | Corner Office | Executive |
| job_ceo | Big Cheese | CEO |
| degree_1 | Honour Roll | a degree |
| degree_3 | Triple Major | all three degrees |
| stats_100 | Triple Threat | all stats ≥ 100 |
| stats_500 | Renaissance Stick | all stats ≥ 500 |
| stat_999 | Maxed Out | any stat 999 |
| nw_100k | Six Figures | net worth $100,000 |
| nw_1m | Seven Figures | net worth $1,000,000 |
| spent_100k | Big Spender | $100,000 spent |
| home_2 | Homeowner | buy any home |
| let_1 | Landlord | let out a home |
| castle | King of the Castle | buy the castle |
| furniture_7 | Interior Decorator | 7 different furniture pieces owned at once (an upgraded piece counts once; the P0 satellite does not count) |
| fight_1 | Bar Brawler | win a bar fight |
| champion | Sticky's Champion | beat #12 |
| ring_5 | Ring Rat | 5 Underground Ring wins |
| darts_bull | Bullseye | hit a 50 |
| darts_500 | Perfect Darts | 500 points in one game |
| slots_jackpot | Jackpot | three dollar signs |
| bj_natural | Twenty-One | a natural blackjack |
| roulette_straight | Straight Up | win a straight roulette bet |
| backed_off | Backed Off | barred for counting |
| rob_store | Five-Finger Discount | rob the store |
| rob_bank | The Big Score | rob the bank |
| jail_1 | Jailbird | go to jail |
| jail_gym | Model Inmate | 3 jail workouts |
| harold | Second Chances | Harold's comeback |
| kid_good | Role Model | the kid's good ending |
| kid_bad | Bad Influence | the kid's sad ending |
| hotwire | Hot Wheels | hotwire the junker |
| cities_6 | Grand Tour | visit all 6 cities |
| smuggle_50k | Contraband King | $50,000 from smuggling |
| tours_10 | Chatterbox | 10 speaking tours |
| snitch | Snitch | turn in Red |
| karma_100 | Halo | karma +100 |
| karma_neg100 | Horns | karma -100 |
| president | Hail to the Stick | win as President |
| dictator | Supreme Leader | win as Dictator |
| night_owl | Night Owl | start an action at 00:00 |
| lookout | Sightseer | use the Point Margin binoculars |
| scraps | Paper Trail | finish the Theory of the Fold |
| day_365 | Anniversary | reach day 365 |

Achievements are disabled for the cheat name. "Old School" (open Classic mode) is a profile
badge on the title screen, not an achievement. Achievement ids are snake_case; names never repeat a
perk's name. The title's **Achievements** entry opens the `profile` scene (UI §5.18), which works
without a running game.

### 6.11 Writing and tone

- **Voice:** dry, deadpan, cheerfully absurd. It punches up (corporations, banks, bureaucracy) more
  than down. The world's own logic is played straight.
- **Paper puns are seasoning, not the meal:** at most one per screen.
- The original's edgier material (the smoking kid, contraband, brawls, dictatorship) stays, framed
  satirically and never gleefully cruel. The contraband's display label is "snow".
- **Length limits (validated):** action labels ≤ 28 characters; barks ≤ 60; toasts ≤ 80; greetings
  ≤ 140; voicemails ≤ 280; event and encounter cards ≤ 400; news stories ≤ 220.
- **Volume target:** about 1,200 lines in `js/data/text/en-*.js`. No text is copied from the original
  or reused from the recreation's paraphrases (a shingle check enforces it, ARCHITECTURE §18).

## 7. Progression and balance targets (summary; BALANCE B-23 holds the asserted bands)

| Day | Normal player (Standard) | Skilled player |
|---|---|---|
| 3 | Janitor, INT ~30 | Janitor on day 2, alarm clock bought |
| 10 | Mail Room or Salesperson | Salesperson, INT ~130 |
| 15 (end of Short) | Salesperson, net worth $1-3k (CRUMPLED to STICK FIGURE) | Executive, $3-8k (STICK FIGURE / DOODLE) |
| 25 | Vice President, stats ~30 / 210 / 110 | CEO |
| 40 (end of Medium) | CEO, bigger apartment, $20-45k (SKETCH ARTIST / GO-GETTER) | CEO, penthouse, $40-90k (GO-GETTER) |
| 70 | CEO, penthouse, stats ~370 / 570 / 360, $50-110k | stats ~550-650, $180-330k |
| 100 (end of Long) | penthouse or mansion, $150-300k (BIG SHOT / TYCOON) | castle bought around day 90-100; nominated around day 95-110 (a quarter of expert runs make it inside the Long game); $450k-900k (TYCOON / MAGNATE) |
| 365+ | | in Unlimited, the office salary plus capped interest (≤ $35,000 a night together) reach the $5M tier about a year in; the $15M tier takes most of two years |

- **Stats:** about 20-30 points a day early (paid training at 2/h plus TV), 40-60 late (seminars,
  satellite, tier-2 furniture, degrees). All stats at 666 takes about 70-80 days of focused play.
- **Money:** wages grow about ×1.5-2.5 per rung and flatten at CEO's $1,800 a shift. Late
  acceleration comes from four channels, each tied to a play style and none worth more than about
  a CEO's day: savings interest (safe, tiered, capped at $25,000 a night), stock tips (clever,
  capped, about $450 a market day), speaking tours (good, CHA, one per city per week) and smuggling
  (evil, fastest, Heat and jail risk; the bank job once a week). The two big sinks are the castle
  ($500,000) and the war chest ($50,000-$200,000).
- **Guards against runaway:** tiered and capped interest, the -10 gambling karma cap, house edges,
  the pit boss and the 60-hand day, 3 darts matches a day, Auto that samples real outcomes, hustle
  pay capped at ×1.3, Heat-scaled busts, bail that scales with net worth, repo seizures and the
  lien, TV and seminar daily limits, one stock tip a day with position caps and no shorts.
- **Verification:** `tests/balance/sim.cjs` runs four rule-level bots (Grinder, Saint, Kingpin,
  Tourist) × 20 seeds × 100 days in Node and asserts the B-23 bands. Tuning changes only
  `tuning.js`.

## 8. Content priority roll-up

| Priority | Scope |
|---|---|
| **P0 — Remastered Original (wave 2 exit)** | The whole city and every original building, action, item, price and street interaction; the job ladder; bank, loans, real estate, tier-1 furniture and the satellite; stocks without tips; store and bank robbery with the Hold-up; jail (basic); HP 0 (Stick General, FLATLINED on Hardcore); home doors in Live / Owned / For Sale mode; bus red-eye smuggling; bar fights (ladder), darts practice, slots, blackjack, roulette; the election (nomination, war chest, 7-day campaign, debate, office salary); City Hall's Election Office; Heat; difficulty modes; game lengths; results and ranks; saves; the HUD, building cards, Pocket (Bag, Stats, Messages, Map), morning report, title, new game, intro, settings; traffic, pedestrians, falls with the Fold Rescue; day/night lighting; the core soundtrack. |
| **P1 — Expanded (wave 3)** | Weather and calendar; hustles and shift events; degrees and seminars; perks; karma tiers; tier-2 furniture, home perks, letting and selling; CDs; stock tips; speaking tours, haggling, reputation, rumours; the Underground Ring, Guard, Buy a drink; VIP and scratch cards; darts matches; Mingle and Open Mic; the park and Point Margin; arcs; encounters; police on foot and the Precinct desk; bail; decrees; the city reacts; time-lapse on exit; sun shadows; the Advisor, Road to Office, onboarding; achievements, Hall of Fame, legacy score; Theory of the Fold; the Classic cabinet; graphs on the results page. |
| **P2 — Polish (wave 4, cuttable)** | Custom game length; the flea market; the aquarium; the perspective lean; wardrobe changes after creation; more greeting and headline variants; extra TV shows. |
