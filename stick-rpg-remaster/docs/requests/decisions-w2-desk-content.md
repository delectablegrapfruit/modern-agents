# Wave-2 integration: decisions of the content desk (desk-content)

Scope: still-open requests whose target is a package-owned content file of wave 2:
`js/data/buildings/*`, `js/art/interiors/*` (not `kit.js`), `js/ui/subscreens/*`, `js/ui/screens/*`,
the front-end, report, jail, hospital, trip and death scenes (`js/scenes/{report,jail,hospital,
bustrip,death,title,intro,newgame,results}.js`), `js/minigames/skins/*`, `js/audio/songs/*`,
`js/data/text/en-*.js` except `en-ui.js` and `en-world.js`, and their tests. This includes the
"meanwhile" workarounds those files carry for requests that other desks have now applied, the
follow-ups the other desks left to these files' owners (`decisions-w2-desk-lead.md` and
`decisions-w2-desk-present.md` open issues), the wave-2 requests one package addressed to another,
and the wave-1 deferrals to wave-2 content. Each line is request id → decision → reason. Parts of a
request that target another desk's file are named "not this desk". Every applied item is tested.

## Requests applied in this desk's files

- **W2-Food 1 / W2-Money 5** (no `:resolve` for a Hustle row) → applied in the data: the
  documented no-op actions `mcsticks.work:resolve` (`js/data/buildings/mcsticks.js`) and
  `nli.work:resolve` (`js/data/buildings/nli.js`) are gone → D61 (CONTRACT §8.2 `minigame`: the Hustle
  button commits the row with `{ m, hustle }`), and desk-world's validator no longer asks a Hustle
  row for a `:resolve` (`tools/validate.cjs --wave 2`: 0 errors, 174 actions). Tests:
  `tests/e2e/mcsticks.test.cjs` and `nli.test.cjs` pin "the Hustle row has no `:resolve`".
- **W2-Food 2** (shift rows repeat next to a Hustle) → **not applied yet; the rows stay
  unrepeatable** → D61 allows it and the card and the validator follow D61, but `js/rules/act.js`'s
  registration check (a priority-20 boot hook) still warns "repeatable but has confirm, minigame or
  screen" for any `minigame` row. With `repeatable: true` on `mcsticks.work` / `nli.work` every boot
  logs two console warnings (the validator lists them as `[console]` WARNs) and the McSticks and NLI
  suites fail their "no warnings" checks. The flip is one field in each row once act.js drops
  `e.def.minigame` from that condition (see Deferred and Open issues). The tests now say so ("not
  repeatable until js/rules/act.js follows CONTRACT D61"). desk-world's open issue on the same check
  saw an intermediate state of this desk (the rows repeatable); in the tree as left by this desk the
  rows are unrepeatable and both suites pass.
- **W2-Front 3 / D68** (the accessory carousel's flag; desk-lead's open issue) → applied:
  `js/ui/screens/newgame.js` reads `SR.features.accessories` (one helper, `carousel()`, for the step-3
  carousel, the preview and the new game's `look`) instead of `wardrobe` → D68: the carousel is P1
  and `wardrobe` (P2) is changing accessories after creation. Test: `tests/e2e/frontend.test.cjs`
  ("`wardrobe` alone shows no carousel", "with `accessories` on, step 3 shows the carousel", the
  chosen accessory reaches `player.look.acc`).
- **W2-Home 7, second half** (a For Sale door's card title; desk-present's follow-up) → applied: the
  named fn **`title.home`** (`js/data/buildings/home.js`) returns `card.home.title.forSale` ("For
  Sale", new in `en-home.js`) at a For Sale door and `null` otherwise (the building's name, "Home")
  → UI §5.6 "a For Sale card"; the card (desk-present) re-asks it after each action and on
  `home:changed`, so the title turns into "Home" in place after Tour → Buy. Test:
  `tests/e2e/home.test.cjs` (the title before the purchase and after it).
- **W2-Civic 5** (City Hall's song by the state; the workaround in `campaign.js`) → applied: the named
  fn **`music.cityhall`** (`js/data/buildings/cityhall.js`) returns `{ id: 'hail_to_the_stick',
  variant }` while you hold office (`dictator` for a Dictator) and `null` otherwise (the lobby keeps
  `campus_canon`) → ART_AUDIO §13.4 "City Hall in office"; `js/scenes/building.js` (desk-present) and
  `js/scenes/minigame.js` (desk-world) read `music.<building>`. `js/ui/subscreens/campaign.js` drops
  its `door:entered` hook, and its `restoreMusic` (closing the Election Office) asks the same fn, else
  the host's `music`, so one rule names the building's song everywhere. Tests:
  `tests/node/civic.test.cjs` (the fn's three answers; the `dictator` variant registered) and
  `tests/e2e/election.test.cjs` (a Dictator's City Hall in office plays the `dictator` march from
  the door; the President's march and "closing the Election Office keeps the march" still pass).
- **W2-Civic's note to W2-Home** (the election-night edition plays the Dictator's variant) →
  applied in `js/ui/screens/report.js`: a Dictator's win plays `hail_to_the_stick` with `{ variant:
  'dictator' }` (the President's stays plain) → ART_AUDIO §13.4 (Dictator: B♭ minor), so the march
  stays in one key from the paper into City Hall.
- **W2-Music 1, follow-up for `report.js`** (desk-present: the election stamp still played the
  level-up triad beside `stingers.election_win` / `_loss`) → applied: the result's Stamp passes its
  `key` and `sting: false` → the result has its own stinger. Test: `tests/e2e/home.test.cjs`
  ("election night: the Dictator's march in its `dictator` variant, the President's plain; no
  level-up triad under the result's stamp", spying `SR.audio.music` / `stinger`).
- **W2-Transit 7 / W2-Music 1, follow-up for `hospital.js`** (the stinger wrapper is redundant) →
  applied: `SR.ui.hospital.flatlined()` no longer swaps `SR.audio.stinger` around the FLATLINED
  stamp; the stamp passes `sting: false` (the Stamp's table also gives `stamp.hospital.flatlined`
  none) → `js/ui/stamp.js` takes `o.sting` since this integration. `tests/e2e/hospital.test.cjs`
  ("only the dirge plays") passes on it.
- **W2-Civic 4, the transcript's workaround** → applied (removed): `namedGains` in
  `js/ui/subscreens/transcript.js` is gone; the Graduate rows pass the preview as is →
  `js/ui/components.js` names a list item's chip by the def whose `key` is the state key.
  `tests/e2e/uofs.test.cjs` ("+1 Diploma", not "diplomas") passes on the components' lookup.
- **W2-Money 2, the sub-screens' workaround** → applied (removed): the `toTop(root)` helpers of
  `js/ui/subscreens/{bank,realestate,jobs}.js` are gone → the sub-screen host resets its scrolling
  ancestors after mounting (`js/ui/card.js` `show()`, for the card and the Pocket alike);
  `tests/e2e/card.test.cjs` pins it, and `bank`, `nli`, `pocket` pass without the helpers.
- **W2-Home 7, the report scene's workaround** → kept, narrowed in its comment: `js/scenes/report.js`
  still re-checks the home card's greeting after every `action:done` → the card follows its own
  commits and `home:changed`, but a let from the Pocket (P1) changes no `home` Delta and raises no
  `home:changed`; the card skips a key it already shows, so nothing re-types twice. The Save row's
  `slot1` fallback is likewise kept as a guard for a build without `saveload`.

## Requests verified (nothing left to do in this desk's files)

Wave-2 requests addressed from one wave-2 package to another:

- **W2-Home 4 → W2-Front** (`saveload { mode: 'save' }`, `results { reason, result }`) → applied by
  W2-Front: the Save row pushes `saveload` in save mode; the report's last page queues `results` with
  `{ reason, result }` (`js/scenes/report.js`, `js/ui/screens/saveload.js`).
- **W2-Home 6 → W2-Money** (`bank.realestate` opens on `params.homeId`) → applied by W2-Money
  (`js/ui/subscreens/realestate.js`; `tests/e2e/home.test.cjs` buys through the real page).
- **W2-Civic 2 → W2-Music** (`hail_to_the_stick` → `dictator`) → applied by W2-Music; now also played
  by `music.cityhall` and the election-night edition (above).
- **W2-Front 4 → W2-Music** (`final_edition` → `stamp`, `minor`) → applied by W2-Music.
- **W2-Food 5 / W2-Goods 4 → W2-Front** (variant and badge texts) → applied by W2-Front (`en-ui.js`,
  not this desk).
- **W2-Exterior 11 → W2-Front** (re-bake the building detail on quitting to the title) → applied by
  W2-Front (`SR.ui.saveload.quit()` calls `SR.art.exteriorDetail.refresh()`).
- **W2-RulesE 7 → W2-Front / W2-Transit** (`s.over` alone means over) → applied:
  `js/ui/screens/{saveload,jail}.js` and `js/scenes/hospital.js` read `s.over`.
- **W2-RulesC 5 → W2-Pocket** (`phone.boardInfo` reads `election.acceptBy`), **W2-Street 4 →
  W2-Home** (the inbox test), **W2-Street 5 → W2-Front** (a new game through `SR.save.load`),
  **W2-Transit 1, 5 → W2-Front** (results after the presenting scenes; Keep playing back to the cell),
  **W2-Pocket 4 → W2-Front** (Esc is `back` then `pause` in the pause menu), **W2-Front 2 → W2-City**
  (`world.retire`) → applied by their owners during the wave (status lines in the request files).
- **W2-RulesC (decisions): the header of `js/minigames/scratch.js`** → already says "the row's
  `:resolve` pays the card (`casino.scratchResolve`)".

Wave-1 deferrals to wave-2 content (the Deferred table of `decisions-w1-desk-lead.md`), checked on the
loaded tree (`tests/node/load.cjs all`):

- **W2-Home**: `building.modes` (`live`, `owned`, `forSale`) and `greet.home` (W1-D 7); `news.head.<kind>`
  and `news.tv.<kind>` for all 31 B-29 kinds, `news.head.absurd`, `news.story` (W1-E R6, W1-C 10) →
  present.
- **W2-Money**: `vm.penny.loan5`, `loan1`, `default` (W1-E R5) → present.
- **W2-Civic**: every `vm.board.*`, `vm.doodle.*`, `vm.crayon.*` key `js/rules/election.js` names (W1-C
  10) → present; the Study row runs `training.apply('study')`, which reads `training.gain` and so the
  Public Library Act (W1-C 6) → as asked.
- **W2-Food**: `mg.holdup.intimidate`, `sweetTalk`, `outwit` (W1-C 10) → present.
- **W2-Night**: `taunt.<fighter>.1..3` for all 17 fighters (W1-C 10) → present.
- **W2-City**: `vm.carhit.1..3` in `en-city.js` (W1-W 3) → present.
- **W2-Transit**: `SR.world.place('afterJail' / 'afterHospital')` (W1-W 7) → used by the jail and
  hospital scenes and the report scene.
- **W2-Music**: `stingers.stamp`, levels and render cost (W1-S 8) → closed by W2-Music and desk-lead.
  `js/audio/songs/stingers.js`'s header no longer says the promotion fanfare "waits for a caller" (the
  Stamp plays it by key).

## Rejected

- None.

## Deferred (for wave-3 and wave-4 packages)

- **W2-Food 2 / D61, the shift rows' `repeatable`** → deferred to **W3-Econ** (the wave-3 owner of
  `js/data/buildings/{mcsticks,nli}.js`), after the **lead** (`js/rules/act.js` is "lead (requests)"
  in wave 3) drops `e.def.minigame` from act.js's registration check → this desk cannot edit
  `js/rules/act.js`, and the flip alone would put two boot warnings on every page.
- **W2-Home 2, 3** (`js/art/interiors/home.js` onto the kit's `variants` / `variant(state, params)`,
  with a `palette` field) → deferred to **W4-Visual** (owner of `js/art/**` in wave 4) → a refactor
  with no visible change: the kit's variants and palette names landed this integration
  (desk-present), and the frame-plus-`fromDef` workaround draws the right room; its one cost (the
  paper grain painted twice on the cached static layer) is invisible at the kit's alpha.
- **W2-Transit 4** (the `tourhook` skin, still a stub in `js/minigames/skins/tourhook.js`) →
  **W3-Crime**, as desk-lead deferred it (P1 `tours`; BUILD_PLAN §5.7 gives the file to W3-Crime).
- **W2-Front 7** (`start.customLength`) → **wave 4** with the P2 Custom length, as desk-lead deferred
  it; `CUSTOM_MIN` / `CUSTOM_MAX` stay in `newgame.js` meanwhile.

| Package | Item |
|---|---|
| lead (wave 3, `js/rules/act.js`), then W3-Econ | act.js's boot check follows D61; then `repeatable: true` on `mcsticks.work` and `nli.work` (W2-Food 2) |
| W4-Visual | `js/art/interiors/home.js` as one def with per-tier `variants` and `palette` (W2-Home 2, 3) |
| W3-Crime | the `tourhook` skin (W2-Transit 4) |
| W4-Rules / W4-UI | `start.customLength` [7, 365] with the P2 Custom length (W2-Front 7) |

## Not this desk

- **W2-Pocket 6** (dropping the Pocket's inline style copies now that `css/components.css` has the
  classes) → `js/ui/pocket/*` is not in this desk's file list (W4-UI, as desk-present noted).
- **W2-City 3** (the city's inline copies) and **W2-Street 7** (the camera's lean) → `js/scenes/city.js`
  (desk-world).
- **W2-Night 5, 7** (the engines' chips from `tuning.casino.chips`, blackjack's `confirmExit`) →
  `js/minigames/{blackjack,roulette}.js` (engines, not skins) are not in this desk's file list;
  both are in the tree (`chipsBase()` / `CHIPS` read `SR.tuning.casino.chips`; blackjack's
  `confirmExit(progress)` and `exitRisk()`, desk-world).
- Every other request names a rules, kernel, UI-framework, render, world, validator or docs file
  (desk-lead, desk-present, desk-world).

## Tests

Run on the tree after the changes (other desks were editing their files in parallel; suites two at a
time):

- Node: `node tools/run-all.cjs --only node,tools --jobs 2`: 40 of 40 (with `tests/node/civic.test.cjs`
  131 / 0, `songs` 53 / 0, `goods` 133 / 0, `transit` 103 / 0); `node tests/node/load.cjs all` (155
  files) and `rules` (90 files): 0 errors; `node tools/validate.cjs --wave 2`: 0 errors, 7 warnings
  (W3-Park's stubs; 249 fns, 174 actions); `node tools/shingles.cjs`: ok.
- e2e: `mcsticks` 109 / 0, `nli` 108 / 0, `election` 83 / 0, `home` 117 / 0, `frontend` 148 / 0, `uofs`
  36 / 0, `bank` 173 / 0, `hospital` 51 / 0, `pawn` 59 / 0, `furniture` 49 / 0, `results` 52 / 0,
  `slice` (strict) 40 / 0, `pocket` 150 / 0, `card` 138 / 0, `a11y` 126 / 0.

## Open issues

- **`js/rules/act.js`** (its owner; "lead (requests)" in wave 3): the priority-20 registration check
  should warn on `repeatable` only with `confirm`, `screen` or an `open` effect, not with `minigame`
  (D61, as `tools/validate.cjs` and `js/ui/card.js` already do). Until it does, the shift rows stay
  unrepeatable (Deferred above).
- **CONTRACT D61** (desk-lead's doc) ends "until then `mcsticks.work` and `nli.work` stay unrepeatable
  with no-op `:resolve` actions": the no-op actions are gone now; the rows stay unrepeatable only
  until act.js follows. Record for the lead's next fold, with the new names of this desk: the named
  fns `title.home` and `music.cityhall`, and the text key `card.home.title.forSale` (`en-home.js`).
