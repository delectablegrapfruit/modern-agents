# Wave-2 integration: decisions of the world desk (desk-world)

Scope: requests whose target is one of `js/world/*`, `js/render/*`, `js/minigames/*` (the framework
and the engines; skins only where a request names them), `js/scenes/{minigame,city}.js`,
`js/data/worldmap.js`, `js/data/actions/world.js`, `js/data/text/en-world.js`, `tools/*`,
`tests/perf/*`, `tests/visual/*` and `tests/e2e/{world,render,minigames,city,traffic,crowd}*.cjs`,
plus the open issues `decisions-w2-desk-lead.md` left in these files. Read: every file in
`docs/requests/` (W1-* and W2-* requests, the wave-1 decision files and the wave-2 ones of desk-lead,
W2-RulesC and W2-RulesE). Each line is request id → decision → reason. Parts of a request that target
another owner's file are named "not this desk" at the end.

## W2-City

- **W2-City 3** (`css/components.css`: the touch cluster and minimap classes) → the classes are in
  the integration tree (desk-lead); applied on this side: `js/scenes/city.js` drops its inline copies
  (`.city-touch`, `.city-touch-btn`, `.city-minimap` and its canvas now come from the stylesheet);
  each button keeps only its size and place, the minimap only its touch `top: 104px` (and `bottom:
  auto` with it) → the request's own "Meanwhile" (W2-City or the lead drops the inline copies once
  the classes land); UI.md keeps component styles in the stylesheet. Test: `tests/e2e/city.test.cjs`
  (the touch layout at 844 × 390 and the desktop minimap, unchanged checks) passes.
- **W2-City 5** (`js/render/renderer.js`: the skid marks in the ground pass) → applied: `frame()`
  draws `SR.world.traffic.skids` right after the ground chunks and before the shadows, in the world
  transform, with `SR.art.vehicles.skid(ctx, kind, a, x, y, len, alpha)`; marks more than 200 u off
  the view are skipped; `SR.render.stats().frame.skids` counts the marks drawn → ART_AUDIO §8 and
  `vehicles.js`'s `skid()` ("the ground pass draws the marks under the cars"); nothing outside the
  renderer can add to the ground pass. Test: `tests/e2e/render.test.cjs` "wave-2 hooks": the order is
  ground → skid → shadows, the call carries the mark's fields in the world transform, the far mark is
  skipped, the streaks change the road's pixels and go when traffic drops the mark.
- **W2-City 7** (`tests/e2e/world.test.cjs`: keep traffic out of the headless world) → applied:
  `install()` switches `SR.world.traffic` and `SR.world.pedestrians` off (`live = false`), clears the
  cars and empties the walkers, so none stands in the player's way → the title backdrop (W2-Front)
  switches them on and this suite drives `SR.world` with its own state under the title; traffic and
  walkers have their own suites (`traffic.test.cjs`, `crowd.test.cjs`). The suite: 77 / 77.
- **W2-City 6** (`tuning.crowd.turnRange` / `.scurry`) → no change needed: `js/world/pedestrians.js`
  already reads both rows (W2-RulesE added them); `TURN_R` / `SCURRY_P` stay as the fallbacks of a
  table without them (the comment now says so).
- **W2-City's answer to W2-Exterior 8** (the props of ART_AUDIO §6 in `js/data/worldmap.js`) →
  deferred to **W3-Park**, as desk-lead decided → the worldmap is held "for fixes only" in wave 2
  (BUILD_PLAN §4.1); the new types are not solids in `js/world/geometry.js`, parked cars need bays
  the map lacks, and the goldens move. W3-Park adds the entries with the solids (a request for
  `geometry.js`, this desk's file in wave 3 through the lead).
- **W2-City 1, 2** (desk-lead applied / recorded), **4** (`js/ui/hud.js`) → not this desk.

## W2-Civic

- **W2-Civic 5, second half** (`js/scenes/minigame.js` `musicBelow()`: a building's song by the
  state; desk-lead's open issue) → applied: when a minigame with its own song closes over a building,
  the frame plays the building's song as `js/scenes/building.js` does on entering: the named fn
  `music.<building>` first (a song id or `{ id, variant }`, called `(state, params, { source: 'ui',
  now })`, a throw warned once), else `def.music`; `playMusic` passes a variant when one is named →
  ART_AUDIO §13.4 (City Hall's march in office); one rule for both places. Test:
  `tests/e2e/minigames.test.cjs` (the real page): in McSticks the building's song comes back, and a
  `music.mcsticks` fn's `{ id, variant }` is what the frame plays.

## W2-Exterior

- **W2-Exterior 3** (`js/render/buildings.js` `propKey`: props that react to the state) → applied:
  the key appends `SR.art.props.stateKey(type, variant, a)` when the hook exists (`''` for a static
  prop; a throw counts as `''`) → the statue and the wanted posters (W3-Light, P1 `cityReacts`) would
  otherwise keep a stale cached sprite. Test: `render.test.cjs`: a lamp whose state key changes
  re-bakes, the other props in view stay cached.
- **W2-Exterior 4** (`js/render/ground.js`: call the railing and wall painters) → applied: the chunk
  bake's rim step draws each railing with `SR.art.props.railing(ctx, a, b)` and the castle wall with
  `SR.art.props.wall(ctx, a, b, w)` when they exist (after the same cull; a throw falls back to the
  built-in drawing, warned once) → CONTRACT §15.2 says the ground bake calls them; ART_AUDIO §6 lists
  railings and walls among the props. Test: `render.test.cjs`: both painters are called with the
  worldmap's railings and walls. No golden moved beyond its tolerance from this change.
- **W2-Exterior 5** (`js/render/sky.js` `stats()`: count the skyline's island sprites) → applied:
  `px` / `bytes` add `SR.art.skyline.stats().px`, `islands` adds its count, and a new `skyline`
  field gives the share → ARCHITECTURE §17's sky ≤ 6 MB budget must see the 2.1 MB of island sprites
  `js/art/skyline.js` holds. Tests: `render.test.cjs` (the sky stats count them; the memory tour
  still passes "sky and clouds ≤ 6 MB" at DPR 1 and 2) and `tests/perf/perf.cjs` (its sky gate reads
  the same stats).
- **W2-Exterior 7** (`tests/visual/goldens/*.json`: re-record five goldens) → applied: `node
  tests/visual/visual.cjs --record --only exteriors,render-noon,render-dusk,render-night,render-castle`
  → the compare run before recording failed exactly these five (423, 18, 14, 7 and 165 cells); the
  diff grids show only W2-Exterior's intended changes (the building details and For Sale boards, the
  logos and McSticks' arches, the props painter's lamps and hydrants, Paperview's roof sign). Request 6
  (`tests/sheets/render.html` loads `logos.js`, `en-conflict.js`, `cities.js`) was already in the
  integration tree, so the render goldens show the city as the game does. Visual: 33 passed, 0
  failed (the 15 game scenes without a golden stay unrecorded: W4-Visual records the 16 game scenes
  on the final tree, BUILD_PLAN §6).
- **W2-Exterior 6** (`tests/sheets/render.html`) → no change needed: in the integration tree.
- **W2-Exterior 8** → deferred to **W3-Park** (above, with W2-City's answer).
- **W2-Exterior 1** (W2-City applied), **2, 10** (`js/art/exteriors.js`; desk-lead), **9**
  (records), **11** (W2-Front applied) → not this desk.

## W2-Food, W2-Money (the validator)

- **W2-Food 1 / W2-Money 5** (`tools/validate.cjs`: no `:resolve` for a Hustle row) → applied: only
  an action whose effects `open` a minigame must have `<id>:resolve`; a `minigame` field (the row's
  Hustle button) no longer asks for one; the `hpAbove` rule still includes a `:resolve` if a row has
  one → D61 (CONTRACT §8.2, §15.4: the Hustle commits its own row with `{ m, hustle }`).
- **W2-Food 2** (`tools/validate.cjs`: shifts may repeat next to a Hustle) → applied: the
  `repeatable` rule no longer lists `minigame`; `confirm`, `screen`, an `open` effect, the crime
  group, the robbery / trip time rules and the irreversible effects still forbid it → D61 ("nothing
  with a minigame ever repeats" means a row whose run opens one). The `card.js` half was the lead's.
- **W2-Food 6 / W2-Money 5b** (`tools/validate.cjs --selftest`: plants that collide with real files)
  → applied: (a) `validate()` loads the tree without the files a plant names (a planted path replaces
  the real file of that path instead of running after it); (b) the case "a frozen sub-screen outside
  its file" also plants an empty `js/ui/subscreens/tv.js`, so `home.tv` is registered only by the
  planted `qa.js` → the self-test was written against the stub tree; W2-Food's `orderup.js`, W2-Home's
  `tv.js` and W2-Money's `bank.js` now register the same ids. `--selftest`: 47 / 47 (was 38 passed,
  3 failed), with five new checks: a row that opens a minigame without its `:resolve` fails, a
  repeatable row whose run opens a minigame fails, a repeatable Hustle row without a `:resolve`
  passes, and the two interior-palette checks below.
- **W2-Food 3-5, W2-Money 1-4, 6, 7** → not this desk (rules, UI, text, records).

## W2-Home

- **W2-Home 3** (`tools/validate.cjs` / `kit.js`: what an interior's `palette` means) → applied on
  the validator's side, as the kit now reads it (the integration tree's `kit.js` `paletteSet` takes
  `'apt'` or `'int.apt'`): an interior's `palette` names a set of `SR.art.palette.int`, short or as
  its key, and is checked as a set (an unknown one fails: missing palette); its `@name` keys resolve in
  the set the kit draws with (the def's palette, else the variant's key, else `int.<id>`, else
  `int.default`, then `int.default.<name>`); per-params `variants` (W2-Home 2) are checked one by one,
  each as the base def overlaid by its own fields, and need `variant(state, params)` → a def written
  for the kit no longer fails the validator. Tests: `--selftest` "an interior palette that names no
  set" fails, and `'apt'`, `'int.apt'` and a variant interior add no error.
- **W2-Home 1, 2, 4-9** → not this desk.

## W2-Night

- **W2-Night 7** (`js/scenes/minigame.js`: ask before leaving blackjack only while a hand is out) →
  applied, both forms the request offers: the instance may answer `exitRisk()` → boolean (asked at
  once, no side effects), else the def's `confirmExit` may be a function `(progress, params) →
  boolean` (called with `inst.progress()` and the run's params); a throw asks; `true` still always
  asks and a live stake always asks. `js/minigames/blackjack.js` answers with `exitRisk()` (a hand
  dealt and not yet settled: `play` or `reveal`), so between hands Exit leaves at once instead of
  saying "this round counts as a loss", which was untrue there. Blackjack uses the instance form
  because its `progress()` applies a decided hand (the reveal) as played: asking through it would
  settle the hand before the player chose to leave → the request; the framework header documents
  both. Tests: `minigames.test.cjs` (test engines: a def function asks with the loss line when at
  risk and leaves at once otherwise; an instance's `exitRisk()` answers before `confirmExit: true`;
  the real page: blackjack between hands closes on Exit with no question); `casino.test.cjs` (a hand
  out asks; leaving during the reveal pays the decided hand) passes, 117 / 117.
- **W2-Night 5** (the table chips as tuning) → no change needed: `blackjack.js` and `roulette.js`
  already read `SR.tuning.casino.chips` (W2-RulesE added the row).
- **W2-Night 4** (pad bindings in the `roulette` / `blackjack` contexts) → deferred to **W3-Input**
  with **W3-Nightlife**, as desk-lead decided → a contract change of §12.3's frozen maps; the engines'
  global-action fallbacks (RB spins, LB clears, Y changes the chip, the D-pad picks and places) cover
  pad play meanwhile.
- **W2-Music's note on darts** (`js/minigames/darts.js` could name `tick_tock_trouble`) → no change:
  W2-Music says either is in spec and asks nothing; the frame ducks Sticky's `last_call_shuffle` 6 dB
  under the board (ART_AUDIO §13.4 "minigames duck the song 6 dB"); W3-Nightlife may pick the song.
- **W2-Night 1-3, 6** → not this desk.

## W2-RulesE

- **W2-RulesE 6** (`tests/e2e/world.test.cjs`: the fall samples meet the traffic) → applied with
  W2-City 7 (above): the 200 falls, the West Ave road end (480, 1319) and "every fall costs 10 HP and
  no time" pass without a car in the way.
- **W2-RulesE 1-5, 7, 8** → not this desk.

## W2-Street

- **W2-Street 3** (`tools/validate.cjs` `textOwner`: the `person.*` names) → applied: `person.*` →
  `js/data/text/en-street.js` → D73 and CONTRACT §7; a missing name key is now reported with its
  owner. Test: `--selftest` pins it.
- **W2-Street 7** (`js/scenes/city.js`: the camera eases 10 % toward the speaker) → applied: while a
  street dialog is open (`SR.world.streetnpcs.talking` with its `speaker()`, or the city's own
  fallback sheet with the person's position; the lean holds under an overlay over the sheet, such
  as the Pocket's Bag, so it never compounds), the city's `render` moves the camera from where it
  stood when the sheet opened 10 % of the way toward the speaker over 0.3 s (smoothstep on the loop's
  clock), `x / y` and `px / py` together; Reduced Motion (`html.rm`): it stays put; `SR.debug` fast
  mode: at once; closing the sheet hands the camera back to its spring. A test hook
  `SR.scenes.get('city').debug.lean()` reports it → UI.md §5.7 "The camera eases 10 % toward the
  speaker" (the Dialog sheet is P0); the Dialog scene blocks the update, so only the city's render can
  move the camera. Tests: `city.test.cjs` with Harold: 10 % at once in fast mode, eased over 0.3 s
  without it, still with Reduced Motion, unchanged after the Pocket opens and closes over the sheet,
  released on close.
- **W2-Street 1, 2** (W2-City applied / a note), **4** (W2-Home applied), **5, 6** → not this desk.

## Other wave-2 items read

- **W2-Transit 4** (the `tourhook` skin, `js/minigames/skins/tourhook.js`, still a stub) → deferred
  to **W3-Crime**, as desk-lead decided → the request names it for W3-Crime (the trip's wave-3 owner);
  the trip scene's Auto / forfeit fallback covers it.
- **W2-RulesC's note on `js/minigames/scratch.js`'s header** ("credits it when the row runs") → no
  change needed: the header already says the row's `:resolve` pays the card (`casino.scratchResolve`).
- **W2-Pocket 3** (Tab in the city) and **W2-Front 2** (`world.retire`) → applied by W2-City in the
  wave; nothing left.
- **"The minigames Space-press failure"** (named in this desk's brief; no request file reports it) →
  no change needed: `tests/e2e/minigames.test.cjs` "Space presses the ring on the real page" passes
  alone, twice in parallel, and (that check) inside `run-all --only e2e --jobs 2`. The press goes to a minigame
  opened over the title's boot card; W2-Front's gate (`js/ui/screens/title.js` `onGateKey`, a
  capture-phase `keydown` that swallows the first key) now returns early when a scene stands above
  the title ("a test's minigame, #debug"), which is the guard this check needs. Should it fail again,
  that guard is the first place to look.

## Wave-1 carry-overs (decisions-w1-*.md)

Every wave-1 item for this desk's files was closed in wave 1 (`decisions-w1-desk-world.md`); the
wave-1 Deferred table's wave-2 items that touch these files were W2-City's (the nomination check,
`vm.carhit.*`, the city's calls, adaptive music) and W2-Exterior's (`SR.art.props`,
`SR.art.skyline`): all landed in wave 2 and are recorded by desk-lead. Still open from wave 1: the
perf baseline (below).

## Deferred (for wave-3 and wave-4 packages)

| Package | Item |
|---|---|
| W3-Park | the worldmap props of ART_AUDIO §6 and their solids in `js/world/geometry.js` (W2-Exterior 8, via W2-City) |
| W3-Input (with W3-Nightlife) | pad bindings in the `roulette` / `blackjack` contexts (W2-Night 4) |
| W3-Crime | the `tourhook` skin (W2-Transit 4) |
| W4-Visual | goldens for the 15 game scenes that have none yet (ARCHITECTURE §18's 16; `artbible` has one) |

## Not this desk

W2-City 1, 2, 4; W2-Civic 1-4, 5 (first half), 6; W2-Exterior 1, 2, 9-11; W2-Food 3-5; W2-Front 1-7;
W2-Goods 1-4; W2-Home 1, 2, 4-9; W2-Money 1-4, 6, 7; W2-Music 1-4; W2-Night 1-3, 6; W2-Pocket 1, 2,
4-7; W2-RulesC 1-6; W2-RulesE 1-5, 7, 8; W2-Street 1, 2, 4-6; W2-Transit 1-3, 5-7 (docs, kernel, UI,
rules, audio, sheets, content and text files: desk-lead and the other desks answer them).

## Tests

Run on this desk's files after the changes (other desks were editing in parallel; `--jobs 2`):

- This desk's suites: `tests/e2e/world.test.cjs` 77 / 77, `render.test.cjs` 117 / 117 (with the
  wave-2 hooks), `minigames.test.cjs` 139 / 139 (with the exit question and the song below; "Space
  presses the ring on the real page" passes), `city.test.cjs` 74 / 74 (with the lean), `traffic` and
  `crowd` (in run-all); `node tools/validate.cjs --selftest` 47 / 47 and `--wave 2` 0 errors (7
  warnings: the park's worldmap actions, W3-Park's stub), `tests/visual/visual.cjs` 33 / 33 and
  `--selftest`, `tests/perf/perf.cjs --selftest` and `--quick` 19 / 19 (scripts 3.34 MB ≤ 8 MB; sky
  3.5 MB ≤ 6 MB with the skyline counted); `node tests/node/load.cjs all` (155 files) and `rules`
  (90 files): 0 errors.
- `node tools/run-all.cjs --only node,tools --jobs 2`: 40 of 40; `--only visual,perf`: 4 of 4.
- `node tools/run-all.cjs --only e2e --jobs 2`: 39 of 43 (398 s). `casino` failed on this desk's first
  blackjack change (the question asked through `progress()`, which settles a revealing hand): fixed
  with `exitRisk()`, `casino.test.cjs` 117 / 117 alone. `minigames` failed on a test edited while the
  run was going: 139 / 139 alone. `mcsticks` and `nli` fail on the rules' boot warning for the
  repeatable shift rows (open issues; not this desk's files). Re-run after the last city change:
  `street.test.cjs` 144 / 144, `pocket.test.cjs` 150 / 150.

## Open issues

- **Records for the lead** (additive; nothing frozen changes): CONTRACT §13 / ARCHITECTURE §10's
  engine def: `confirmExit` may be `(progress, params) → boolean`, and an instance may have
  `exitRisk()` → boolean, which answers first (blackjack's does);
  `SR.render.stats()`: `frame.skids` (marks drawn) and `sky.skyline` (the skyline's share of the
  sky's px, now counted in `sky.px` / `bytes`); the city scene def's `debug.lean()`; the frame's
  `musicBelow()` follows `music.<building>` like `building.js`.
- **D61 in the rules' boot check** (`js/rules/act.js`, the rules desk's file): its priority-20 hook
  still warns "repeatable but has confirm, minigame or screen" for a `minigame` (Hustle) row. The
  content desk has meanwhile made `mcsticks.work` and `nli.work` repeatable and dropped their no-op
  `:resolve` actions (D61), so that warning now fails `tests/e2e/mcsticks.test.cjs` and
  `nli.test.cjs` ("no warnings about props, palette keys or missing … text"). The fix is one line in
  act.js (drop `e.def.minigame` from the condition, as D61 and this desk's validator do); not this
  desk's file. The validator accepts both data forms.
- `tests/perf/baseline.json` still has no recording (the relative gate only warns); the lead records it
  on the final integration tree (`node tests/perf/perf.cjs --record` and `--record --quick`).
