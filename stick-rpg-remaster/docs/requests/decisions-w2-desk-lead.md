# Wave-2 integration: decisions of the lead's desk (desk-lead)

Scope: requests whose target is one of `docs/*.md` (every design doc, CONTRACT, BUILD_PLAN),
`js/boot/*`, `js/core/*`, `index.html`, `js/main.js`, `js/data/features.js`, `tests/harness.cjs`,
`tests/node/load.cjs`, `tests/node/core.test.cjs`, `tests/node/invariants.test.cjs` and
`tests/e2e/{boot,slice,input,save,stage}.test.cjs`, plus every additive public name the wave-2
packages asked the lead to record, the doc conflicts they reported, and the wave-3 / wave-4
deferrals. Each line is request id → decision → reason. Parts of a request that target another
desk's file are named "not this desk"; where that desk had already changed its file in the
integration tree when this desk finished, the line says so, and the public names it added are
recorded here too (CONTRACT §15.6 "Applied to the lead's UI and painter files"). The decisions that
change or settle names are **D61-D73** in `docs/CONTRACT.md` §21; the additive names are in CONTRACT
§8.11, §8.12, §10.1, §11.5, §13.2, §14.5, §15.6, §16, §17.1 and, the same lists, ARCHITECTURE §5,
§6.13, §7.1, §7.4, §8.7, §9.6, §10.2, §12.2, §15, §20.

## W2-City

- **W2-City 1** (`tests/node/invariants.test.cjs`: the world-action list) → applied: the list is
  `world.cab`, `world.carCrash`, `world.carFished`, `world.carHit`, `world.city`, `world.enter`,
  `world.fall`, `world.retire`; the five involuntary actions keep their check (owner `world`, P0,
  free, never repeatable, no requirements), and two new checks pin `world.city` / `world.retire`
  (P0, silent, free, no cost or requirements, one named fn: `election.check` / `endgame.retire`) and
  `world.cab` (P1 behind `phone`, needs a phone, costs `world.cabCash` / `world.cabMin`) → CONTRACT
  §8.10 asked W2-City for `world.city`, W2-Front 2 for `world.retire`, BUILD_PLAN §4.1 for the cab;
  the suite: 214 / 214.
- **W2-City 2** (record the names) → applied: CONTRACT §8.12 (world actions), §15 table, §15.6
  (traffic, pedestrians, the `zebra` field, `SR.world.cab`, street talk, actor sources, the minimap,
  the city scene def's `music` / `debug`); ARCHITECTURE §7.4, §8.3, §8.7, §9.6; the city's sounds in
  CONTRACT §14.5 / ARCHITECTURE §12.2. The minimap's `state.journal.waypoint` read is not a v1
  field: the Pocket's waypoint is session state through `SR.render.minimap.waypoint` (recorded so).
- **W2-City 6** (BALANCE B-22: two crowd numbers) → applied: `crowd.turnRange` 80 and
  `crowd.scurry` 0.2, *(w2)* → W2-RulesE added the tuning rows; BALANCE mirrors tuning.
- **W2-City 3, 4** (`css/components.css`, `js/ui/hud.js`), **5** (`js/render/renderer.js`), **7**
  (`tests/e2e/world.test.cjs`) → not this desk.
- **W2-City's answer to W2-Exterior 8** (billboards, planters, mailboxes, newspaper boxes, the
  fountain jet, parked cars and ducks in the worldmap, forwarded to the lead) → deferred to
  **W3-Park** (the worldmap's and `props.js`'s wave-3 owner), with the new solids through a request
  for `js/world/geometry.js` → the types are not solids yet, parked cars need bays the map lacks,
  and the goldens move; BUILD_PLAN §4.1 holds the worldmap "for fixes only" in wave 2.

## W2-Civic

- **W2-Civic 1** (`row: false`) → applied in the contract: D62, CONTRACT §8.2 / §10.1,
  ARCHITECTURE §6.3 / §7.1 (an optional action field: never a card row; a sub-screen presents and
  commits it) → the campaign actions must be City Hall's actions (the validator and
  `election.campaign` need it), and W2-Goods 3 and W2-Money 6 ask the same. The card filter itself
  is `js/ui/card.js` (not this desk; `cardActions` skips `row: false` in the integration tree).
- **W2-Civic 3** (records) → applied: CONTRACT §8.12 / ARCHITECTURE §7.4 (the named fns, the
  campaign commits), §10.1 / §7.1 (`cityhall.campaign`'s statuses and test hooks), §13.2 / §10.2
  (the `debate` skin's params).
- **W2-Civic 2** → not this desk (W2-Music registered the `dictator` variant; recorded in CONTRACT
  §14.5). **W2-Civic 4, 5, 6** (`js/ui/components.js`, `js/scenes/building.js` /
  `js/scenes/minigame.js`, `js/ui/card.js`) → not this desk; the integration tree's `components.js`
  names an item chip by its def's `key`, `building.js` reads a named fn `music.<buildingId>`, and
  `card.js` re-picks a greeting fn's line after an action: those names are recorded (CONTRACT
  §15.6, ARCHITECTURE §9.6). `js/scenes/minigame.js` (`musicBelow()`) does not read
  `music.<buildingId>` yet (open issues).

## W2-Exterior

- **W2-Exterior 9** (the additive names and two readings) → applied: CONTRACT §15.2 / §15.6 and
  ARCHITECTURE §9.5 / §9.6 (`SR.art.props` types and helpers, `SR.art.skyline`, `SR.art.logos`,
  `SR.art.exteriorDetail`; the skyline's `view` carries `ppu, tx, ty, s`). **Readings confirmed**
  (D67): For Sale boards and the kid's memorial are P0, drawn from the state without a flag → home
  doors' For Sale mode is P0 (GDD §3.6, §8) and the memorial is part of BALANCE's P0 `kid.givePack`
  row; ART_AUDIO §5.2 now lists them apart from the P1 reacting elements, and GDD §3.14 says so
  under its table. The memorial living inside the mansion's sprite is recorded as W2-Exterior's
  choice (W3-Life may move it to a dynamic prop list).
- **W2-Exterior 8** → deferred to **W3-Park** (above, with W2-City's answer).
- **W2-Exterior 1** (W2-City applied), **2-7, 10** (render files, sheet, goldens), **11** (W2-Front
  applied) → not this desk. The painter's `roofSign`, `post`, `tops` (2d), the castle's tallest
  tower (2a) and the house eave pad (10), present in the integration tree, are recorded in CONTRACT
  §15.6.

## W2-Food

- **W2-Food 1** (no `:resolve` for a Hustle row) → applied in the contract (D61): CONTRACT §8.2's
  `minigame` row and ARCHITECTURE §6.3 say a Hustle commits its own row with `{ m, hustle }` and has
  no `:resolve` → ARCHITECTURE §6.3's own `nli.work` example has none, and CONTRACT §15.4's Hustle
  button commits the row. The validator check is `tools/validate.cjs` (not this desk); until it
  changes, `mcsticks.work:resolve` and `nli.work:resolve` stay as documented no-ops.
- **W2-Food 2** (shifts may repeat next to a Hustle) → applied in the contract (D61): `repeatable` is
  forbidden next to `confirm`, `screen`, an `open` effect or an irreversible effect; a `minigame`
  field (the Hustle button) no longer blocks it, and the repeat runs the row plainly, never the
  Hustle → GDD §4.4 and UI §1 list shifts among the repeatable actions, and "nothing with a minigame
  ever repeats" means a row whose run opens one. `js/ui/card.js`'s `isRepeatable` already follows
  it in the integration tree; the validator's rule is `tools/validate.cjs` (not this desk).
- **W2-Food 3** (W2-RulesE applied), **4** (W2-RulesC applied; recorded in CONTRACT §8.10 / §8.11),
  **5** (W2-Front applied), **6** (`tools/validate.cjs --selftest`) → not this desk.

## W2-Front

- **W2-Front 1** (`tests/e2e/boot.test.cjs`: the title after boot) → applied: the check accepts the
  kernel's `title-stub` or W2-Front's `title` (its boot card), and the header drops "the kernel's
  stub until W2-Front registers its scenes" → CONTRACT §11.3: a registered scene always wins. The
  suite: 48 / 48.
- **W2-Front 3** (a flag for the accessory carousel) → applied (D68): a new P1 flag
  **`accessories`** in `js/data/features.js`, BUILD_PLAN Appendix B (W2-Front built it; the lead
  flips it at the wave-3 integration), CONTRACT §19 and UI §5.3; `tests/node/core.test.cjs` counts
  31 flags → UI §5.3 makes the carousel P1, `wardrobe` is P2 and means changing accessories after
  creation, and the wave-3 exit turns every P1 flag on, so tying a P1 item to a P2 flag would hold it
  back a wave. `js/ui/screens/newgame.js` still shows the carousel with `wardrobe`; reading
  `accessories` instead is its owner's one-line change (open issues; both flags are off, so nothing
  differs today).
- **W2-Front 5** (the front end's names) → applied: CONTRACT §11.5 (scene params, `info()`,
  `newgame.begin`, `intro.skip`, the game-over routing), §15.6 (`SR.ui.title`, `saveload`,
  `newgame`, `results`, `settings`, `SR.art.intro`, the `front.hide` actor source), §16 (the
  profile's fields and the front end's save calls); ARCHITECTURE §5, §9.6, §15.
- **W2-Front 7** (the Custom length bounds) → BALANCE B-02 row `customLength` *(w2)* [7, 365]
  applied; the `start.customLength` tuning row is deferred to **wave 4** with the P2 `customLength`
  feature (W4-Rules / W4-UI request it from the lead, who owns `tuning.js` in wave 4) → it is P2,
  W2-RulesE has finished, and the wizard's `CUSTOM_MIN` / `CUSTOM_MAX` hold the same numbers behind
  the flag.
- **W2-Front 2** (W2-City applied; the invariants list is W2-City 1), **4** (W2-Music applied;
  recorded in CONTRACT §14.5), **6** (`js/ui/components.js`; the tooltip watch is in the tree) → not
  this desk.

## W2-Goods

- **W2-Goods 2** (Fine Line's live preview in Appendix B) → applied: the `homesPlus` row of BUILD_PLAN
  Appendix B adds "Fine Line's live preview of a piece in your home" → GDD §6.1 and BUILD_PLAN §4.5
  make the preview P1, and `homesPlus` holds the home's other P1 furniture.
- **W2-Goods 3** (the sub-screen commit convention and the goods' names) → applied: D62, CONTRACT
  §10.1 / ARCHITECTURE §7.1 (commits take their object as a parameter, carry `row: false` and hide
  without it; `pawn.shop`'s `params.tab` and the `tabs` context), CONTRACT §8.12 / ARCHITECTURE §7.4
  (the actions, `item` fields and named fns, `pawn.use`).
- **W2-Goods 1** (`components.js`, `building.js`; the chips and floats in the tree), **4** (W2-Front
  applied) → not this desk; the chip's `from` / `to` is recorded in CONTRACT §15.6.

## W2-Home

- **W2-Home 5** (W2-Home's names) → applied: CONTRACT §8.12 / ARCHITECTURE §7.4 (actions, named fns,
  the home door's `home.notMode` rows), §11.5 / §5 (the `report` scene's params, including `next` as
  a scene id and the hospital night's `afterHospital` step-out), §15.6 / §9.6 (`SR.ui.report`;
  `news.election.line`'s `{ n }`).
- **W2-Home 9** (Paperview's "Top floor: Tour" row after the top floor is bought) → applied (D71):
  GDD §3.6 → the Paperview door stays in Live mode while you live on the ground floor, so its Owned
  mode never shows the top floor's Move in; the row is the door's own way up.
- **W2-Home 1** (W2-RulesE applied; recorded as D63 in CONTRACT §8.7, §8.11, §9.2 and ARCHITECTURE
  §6.2, §6.13), **4** (W2-Front applied; recorded in §11.5), **6** (W2-Money applied) → not this
  desk. **W2-Home 2, 3, 7, 8** (`js/art/interiors/kit.js`, the validator, `card.js`,
  `components.js`) → not this desk; the kit's `variants` / `variant(state, params)` and short or
  full `palette`, the card's `title.<buildingId>` fn, `setTitle` and the greeting that follows the
  state, and the `home` chip, present in the tree, are recorded in CONTRACT §15.6.

## W2-Money

- **W2-Money 6** (W2-Money's names) → applied: CONTRACT §8.12 / ARCHITECTURE §7.4 (card rows,
  sub-screen commits with `row: false`, named fns, NLI's `owner` / `portrait` getters), §10.1 / §7.1
  (`bank.realestate` without a building, `params.homeId` and `mode`, `bank.loan`'s `focus`, the
  `peek()` hook), §13.2 / §10.2 (the `sortit`, `pitch`, `boardroom` skin params).
- **W2-Money 5** (no `:resolve` for a Hustle row) → as W2-Food 1 (D61): the contract part applied,
  the validator not this desk.
- **W2-Money 1, 2** (`components.js` / `building.js`, `card.js`; both changed in the tree), **3, 4, 7**
  (W2-RulesE applied), **5b** (`tools/validate.cjs --selftest`) → not this desk.

## W2-Music

- **W2-Music 2** (records) → applied: CONTRACT §14.5 / ARCHITECTURE §12.2 (the variant names, the
  tempi the table leaves open, `final_edition`'s shape, `please_hold`'s loop, the levels and render
  cost, the tests); ART_AUDIO §13.4's table names the `dictator`, `stamp` and `minor` variants and
  `streetlights`' rain variant; ART_AUDIO §13.1 notes `please_hold` and the one-shot songs; BUILD_PLAN
  §4.13 lists `tests/node/songs.test.cjs` and `tests/e2e/songs.test.cjs`.
- **W2-Music 3** (instrument wording the format approximates) → applied as a record: CONTRACT §14.5,
  ARCHITECTURE §12.2 and a note under ART_AUDIO §13.4 → no format change is requested; a per-note
  `bend` or `inst.detune` would be a W1-S format change for a later wave.
- **W2-Music 1** (`js/ui/stamp.js`: the stinger by the stamp's key), **4** (`js/scenes/building.js`:
  the interior beds) → not this desk; both are in the integration tree and recorded in CONTRACT §15.6
  (the stinger table, `o.sting`, `stamp.stinger()`, `stamp.stingerFor(o)`; the beds).

## W2-Night

- **W2-Night 1** (how the casino engines apply their rounds) → applied (D65): CONTRACT §8.10 /
  ARCHITECTURE §6.12 now say the round actions are minigame resolutions
  (`casino.slots.pull:resolve`, `casino.blackjack.hand:resolve`, `casino.roulette.spin:resolve`) and
  the session resolve runs `casino.settle` and `casino.sessionEnd`; the session result shapes are in
  CONTRACT §13.2 / ARCHITECTURE §10.2 → a `building: 'casino'` row would be a card row and a
  `hidden` one is refused by `SR.act`; §8.10's old wording could not be built.
- **W2-Night 2** (W2-Night's names) → applied: CONTRACT §8.12 / ARCHITECTURE §7.4 (the bar's and the
  casino's named fns), §13.2 / §10.2 (the engine def extras, `peek()`, `SR.tuning.casino.chips`).
- **W2-Night 4** (pad bindings for roulette in CONTRACT §12.3 and `js/core/input.js` CONTEXTS) →
  deferred to **W3-Input** (with **W3-Nightlife**, the engines' wave-3 owner) → the context maps are
  frozen, and naming `nextChip` (and Pad4 / Pad5 for clear and spin) in the context would shadow the
  global `car` (Y) the roulette engine answers today, so the binding and the engines' new action
  names must change together; W3-Input owns `input.js` in wave 3 and its acceptance is a
  gamepad-only run. Meanwhile the engines' global-action fallbacks let a pad play both tables
  (recorded in CONTRACT §13.2).
- **W2-Night 3** (`card.js`: no flying chips over an opening minigame; in the tree as
  `feedback({ flyChips })`), **5** (W2-RulesE applied; the BALANCE row is W2-RulesE 3), **6**
  (W2-RulesC applied, differently), **7** (`js/scenes/minigame.js`) → not this desk.

## W2-Pocket

- **W2-Pocket 7** (the Pocket's names) → applied: CONTRACT §8.12 / ARCHITECTURE §7.4 (the Bag and
  phone actions, named fns, contacts and their fields), §11.5 / §5 (the `pocket` scene's params),
  §15.6 / §9.6 (`SR.ui.pocket`, `data-no-swipe`). **No `bag.give`, no `phone.save`** (D69): GDD
  §6.4, BUILD_PLAN §4.12 and ARCHITECTURE §19 now say Give runs the person's own gift action (the
  dialog row's), Info is the Bag's detail pane, the toggle is `bag.pillToggle`, and the phone's Save
  is a UI hand-off to `saveload { mode: 'save' }` → GDD §6.4 itself says "the same actions as the
  dialog's rows", so a `bag.give` would be a second path to the same rule.
- **W2-Pocket 4** (Esc is `back` then `pause`) → recorded as the convention W2-Front and W2-Pocket
  follow (CONTRACT §11.5, ARCHITECTURE §5); the card part is `card.js` (not this desk).
- **W2-Pocket 1** (`tests/e2e/a11y.test.cjs`), **2** (`js/ui/dialog.js`; in the tree, with
  `SR.ui.dialog.current()` and `open({ pocket: false })`, recorded in CONTRACT §15.6), **3** (W2-City
  applied), **5** (W2-RulesE applied; D64), **6** (`css/components.css`) → not this desk.

## W2-RulesC

- **W2-RulesC 3** (`casino.card` in the schema) → applied (D64): ARCHITECTURE §6.1 (schema and the
  "in progress" records), CONTRACT §8.8.
- **W2-RulesC 4** (the desk's names) → applied: CONTRACT §8.10 (the scratch bullet; `world.city` named
  as the city check) and §8.11, ARCHITECTURE §6.12 and §6.13 (`casino.scratchResolve`,
  `scratchRound`, `acceptBy`, `jailDay`'s release, `casino.settle`'s stake rule, the debate's record).
- **W2-RulesC 6** (`daily.ring`, `daily.campaign.debate`) → the schema record applied (D64,
  ARCHITECTURE §6.1, CONTRACT §8.8); the `SR.rules.state.defaults()` part is `js/rules/state.js` (not
  this desk; W2-RulesE did not take it up) → the rules create both on first count and night step 9
  zeroes every key of `daily`, so nothing breaks meanwhile (open issues).
- **W2-RulesC 1** (`tests/balance/sim.cjs`), **2** (`tests/e2e/conflict-sheet.test.cjs`,
  `tests/sheets/conflict.html`) → not this desk. **W2-RulesC 5** → W2-Pocket applied it.

## W2-RulesE

- **W2-RulesE 1** (the desk's additive names) → applied: CONTRACT §8.4 and §8.11, ARCHITECTURE §6.4
  and §6.13 (named fns `items.*`, `homes.channel`, `stocks.maybeReveal`, `endgame.retire`; the module
  names; the `furniture` condition's reading; the text keys).
- **W2-RulesE 2** (when `SR.act` emits `game:over`) → applied (D63): CONTRACT §8.7, §8.11, §9.2;
  ARCHITECTURE §6.2, §6.13; the intra-day weather step is in the pipeline list (§8.11 / §6.13).
- **W2-RulesE 3** (BALANCE B-14: the chips) → applied: a B-14c key row `chips` *(w2)* [5, 25, 100,
  500].
- **W2-RulesE 4** (`casino.card`, `npc.kid.diedDay`, `records.meals`) → applied (D64): ARCHITECTURE
  §6.1, CONTRACT §8.8; the pipeline's `records.meals` count in §8.11 / §6.13.
- **W2-RulesE 5** (when a default's "HP = 1" applies) → applied (D70): BALANCE B-09
  `default.standard` and GDD §4.8 → GDD §4.7's fixed night order (the bank at step 2, the restore at
  step 6), which `tests/e2e/bank.test.cjs` pins.
- **W2-RulesE 8** (two pipeline details) → applied: CONTRACT §8.11 / ARCHITECTURE §6.13 (`job.lastFullEnd`
  cleared by any other action; derived `stat` events leave out a night Report's own gains; also the
  refusal once `over` is set and the `reason.error` refusal from the desk's review).
- **W2-RulesE 6** (`tests/e2e/world.test.cjs`), **7** (W2-Front and W2-Transit applied; the reading
  "`s.over` alone" is recorded in CONTRACT §8.11 and §11.5) → not this desk.

## W2-Street

- **W2-Street 3** (`person.*` text) → applied in the contract (D73): CONTRACT §7's prefix table and
  ARCHITECTURE §7.2 give `person.*` to `en-street.js`. The validator's `textOwner` line is
  `tools/validate.cjs` (not this desk).
- **W2-Street 6** (W2-Street's names) → applied: CONTRACT §3.1 (person fields), §8.12 / ARCHITECTURE
  §7 table and §7.4 (actions, `tune`, `number`, named fns, person def fields, the schedule row, the
  state written), §15.6 / §8.7 (`SR.world.streetnpcs`, barks P1, the `street.junker` source).
- **W2-Street 1, 2, 5** (notes; recorded: barks are P1, the parked cars' actor sources, `giveAction`,
  a new game through `SR.save.load`), **4** (W2-Home applied) → nothing more. **W2-Street 7** (the
  camera eases 10 % toward the speaker) → not this desk (`js/scenes/city.js`, W2-City's);
  `speaker()` is recorded.

## W2-Transit

- **W2-Transit 2** (the tour's resolve id and W2-Transit's names) → applied (D72): ARCHITECTURE §19's
  `trip.js` line (`trip.redeye`, `trip.tour`, `trip.tour:resolve`) and BUILD_PLAN §4.9; the names in
  CONTRACT §8.12, §11.5, §15.6 and ARCHITECTURE §5, §7.4, §9.6.
- **W2-Transit 3** (what `SR.debug.fast()` skips) → applied (D72): CONTRACT §17.1, ARCHITECTURE §20
  → `tests/e2e/slice.test.cjs` (strict, this desk's) runs with `fast` and passes (40 / 40) on it.
- **W2-Transit 4** (notes for W3-Crime) → deferred to **W3-Crime**: the `tourhook` skin (a stub; the
  trip scene's Auto or forfeit fallback is recorded in CONTRACT §13.2) and the lawyer contact
  unreachable from the cell (the Jail Day card's Bail row instead).
- **W2-Transit 1, 5** (W2-Front applied; recorded in CONTRACT §11.5), **6** (`components.js`; in the
  tree), **7** (`stamp.js`; in the tree as `o.sting` and the stinger table) → not this desk.

## Document conflicts settled

- **The day and night city songs** (ART_AUDIO §13.4's adaptive rule "share a harmonic grid" against
  its table: E dorian at 104 and D minor at 84; and the table's night "20:00-05:00" against the
  cross-fades at 19:30 / 05:30) → D66: the grid is the form, not the key (both are 28-bar loops whose
  A section is a two-bar minor i - IV vamp: Em7 - A, Dm9 - G13), so the cross-fades land on the same
  kind of bar; the night song plays 19:30-05:30 (the city scene's `songFor`). ART_AUDIO §13.4's
  table and rule, CONTRACT §14.5, ARCHITECTURE §12.2.
- **The casino's round rows** (CONTRACT §8.10 against `SR.act` and the card) → D65 (W2-Night 1).
- **`repeatable` next to `minigame`** (CONTRACT §8.2 against GDD §4.4's repeatable shifts) → D61.
- **The minigame result shapes** (CONTRACT §13 `{ net }` against the casino sessions) → CONTRACT
  §13.2.
- **For Sale boards and the memorial** (ART_AUDIO §5.2's P1 list against GDD §3.6 / §8 and BALANCE's
  P0 `kid.givePack`) → D67.
- **`bag.give`, `bag.usePill`, `bag.info`, `phone.save`** (GDD §6.4, BUILD_PLAN §4.12, ARCHITECTURE
  §19 against GDD §6.4's "the same actions as the dialog's rows") → D69.
- **`trip:resolve`** (ARCHITECTURE §19, BUILD_PLAN §4.9 against CONTRACT §8.2's `<id>:resolve`) → D72.
- **The default's HP** (BALANCE B-09 / GDD §4.8 against GDD §4.7's night order) → D70.
- **The Top floor row** (GDD §3.6 "while the top floor is unsold" against the Live-mode door) → D71.
- **The loop lengths** (ART_AUDIO §13.1's 60-120 s against `please_hold`'s 30 s joke and the
  one-shot songs) → ART_AUDIO §13.1 notes both.

## Wave-1 carry-overs (decisions-w1-*.md)

- The wave-1 Deferred table's wave-2 items that reached this desk's files are closed: W1-C 5 (the
  nomination check on entering the city: `world.city`, recorded), W1-S 8 (levels, render cost,
  `stingers.stamp`: recorded in CONTRACT §14.5), W1-K-M1 notes (the front end's save calls: CONTRACT
  §16), W1-A 7 (person ids and looks: W2-Street's `people.js`, recorded in §8.12), D57's Tab rule
  (W2-Pocket and W2-City follow it). Still deferred, unchanged: **W3-Park** (`bark.preacher.board`,
  setting `flags.foldDone`), **W3-Balance** (the pit boss's +1 and the Quick-fight numbers).
- The wave-1 lead's open issues outside this desk's files stand: `tests/perf/baseline.json` has no
  recording yet (the lead records it on the final integration tree), and the `tests/perf`,
  `tools/validate.cjs` items were closed by desk-world in wave 1.

## Deferred (for wave-3 and wave-4 packages)

| Package | Item |
|---|---|
| W3-Input (with W3-Nightlife) | pad bindings in the `roulette` / `blackjack` contexts and the engines' action names (W2-Night 4) |
| W3-Park | the worldmap props of ART_AUDIO §6 (billboards, planters, mailboxes, newspaper boxes, the fountain jet, parked cars, ducks) and their solids (W2-Exterior 8, via W2-City) |
| W3-Crime | the `tourhook` skin; the lawyer contact from the cell (W2-Transit 4) |
| lead, wave-3 integration | flip `accessories` with the P1 flags (D68) |
| W4-Rules / W4-UI (the lead adds the tuning row) | `start.customLength` [7, 365] with the P2 Custom length (W2-Front 7) |

## Tests

Run on this desk's files after the changes (other desks were editing their files in parallel):

- Node: `tests/node/core.test.cjs` 352 / 352 (31 flags), `tests/node/invariants.test.cjs` 214 / 214
  (the widened world-action list), `node tests/node/load.cjs all` (155 files, 0 errors) and `rules`
  (90 files, 0 errors); the suites that parse the edited docs: `tokens` 56 / 56, `art` 255 / 255
  (ART_AUDIO §2 / §5.2 / §9, BALANCE B-04c, UI §2.1, BUILD_PLAN Appendix A), `tuning` 39 / 39.
- e2e: `boot` 48 / 48, `slice` (strict) 40 / 40, `input` 75 / 75, `save` 41 / 41, `stage` 85 / 85.
- Tools: `node tools/validate.cjs --wave 2`: 0 errors (31 flags, 176 actions); `node
  tools/shingles.cjs`: clean. `node tools/run-all.cjs --only node,tools --jobs 2`: 39 of 40 suites
  pass; the failure is `tools/validate.cjs --selftest` (W2-Food 6 / W2-Money 5b: plants that collide
  with real files), not this desk's.

## Open issues

- `js/rules/state.js` `defaults()` should list `daily.ring: 0` and `daily.campaign.debate: 0` (D64,
  W2-RulesC 6) for its rules owner; harmless meanwhile.
- `js/ui/screens/newgame.js` should read `SR.features.accessories` instead of `wardrobe` for the
  carousel (D68); both flags are off.
- `tools/validate.cjs` (its owner): the `repeatable` rule and the "opens a minigame but has no
  `:resolve`" check should ignore a Hustle `minigame` (D61), the self-test's plants collide with the
  real wave-2 files (W2-Food 6, W2-Money 5b), and `textOwner` should map `person.*` to `en-street.js`
  (D73). Until the first lands, `mcsticks.work` / `nli.work` keep their no-op `:resolve` actions and
  stay unrepeatable.
- `js/scenes/minigame.js` (`musicBelow()`) does not read `music.<buildingId>` yet (W2-Civic 5's
  second half); City Hall's march under the debate comes from `campaign.js`'s workaround.
- BUILD_PLAN §4.14's exit items are the lead's integration work outside this desk's file list: the
  `tests/fixtures/save-v1-wave2.json` capture, the perf baseline, and the tag.
