# Wave-1 integration: decisions of the lead's desk (desk-lead)

Scope: requests whose target is one of `docs/*.md` (every design doc, CONTRACT, BUILD_PLAN),
`js/boot/*`, `js/core/*`, `index.html`, `js/main.js`, `js/data/features.js`, `tests/harness.cjs`,
`tests/node/load.cjs`, `tests/node/core.test.cjs`, `tests/e2e/{boot,slice,input,save,stage}.test.cjs`,
plus the requests addressed to wave-2 / wave-3 packages "through the lead" (passed on under
**Deferred**). Each line is request id → decision → reason. The decisions that change or settle
names are numbered **D43-D60** in `docs/CONTRACT.md` §21; D1-D42 and the additive names are folded
into ARCHITECTURE, UI, GDD, BALANCE and ART_AUDIO. Parts of a request that target another desk's
file are named "not this desk" (desk-rules' answers: `decisions-w1-desk-rules.md`).

## Lead decisions (applied and recorded)

- **Script-size budget (W1-G 7, W1-Q 3)** → applied in the docs: ARCHITECTURE §17 "Script size ≤ 8 MB
  of JS" (2^20-byte MB, comments included; also §4, §18, §19), CONTRACT D45; the boot-time budget is
  unchanged → the 1.8 MB figure was already spent after wave 1 (1.82 MB, ~150 stubs left) with three
  content waves to go, and classic scripts from `file://` load fast. **Not applied here:**
  `tests/perf/perf.cjs` `BUDGET.scriptBytes = 8 * MIB` (and its "≤ 1.8 MB" message), a W1-Q file
  outside this desk's list; see Open issues.
- **Day-1 fries price (W1-R 9)** → applied: BUILD_PLAN §3.12 now reads "$9: the $12 of B-06 less the
  25 % employee discount a Fry Cook gets, B-28a", and `tests/e2e/slice.test.cjs` expects -$9; CONTRACT
  D48 → GDD / BALANCE win (B-02 start job, B-28a `employee` row); the rules already produce $9
  (desk-rules pins it in `mods.test.cjs`, `act.test.cjs`).
- **Hold-to-repeat (W1-D 4, W1-R 10)** → applied: GDD §4.4, UI §1 (principle 3) and §4.3,
  ARCHITECTURE §11, CONTRACT D47: a repeat stops at any modal, dialog, minigame or stamp except a
  stat-gain stamp, which shows once per hold (later ones coalesced; floats and chips still show every
  gain); promotion, degree, jackpot and rank stamps still stop it → training is repeatable (GDD lists
  it), and one stamp per hold keeps UI §4.3's receipt.

## W1-A (art kit)

- **W1-A 1** (the rest of `SR.art`) → applied: CONTRACT §15.3, ARCHITECTURE §9.5, ART_AUDIO §9 (the
  interior params and actors) → additive names in W1-A's files; other packages already call them.
- **W1-A 2** (the palette's shape) → applied: ART_AUDIO §2 (a paragraph before §2.1, outside the rows
  `tests/node/art.test.cjs` parses), CONTRACT §15 after D32's paragraph → D32 says how keys resolve,
  not which exist.
- **W1-A 3** ("12 joints") → applied: ART_AUDIO §7 "14 points driven by a pose of 12 numbers" → the
  list named 14 points.
- **W1-A 5** (`bark.preacher.board` in `en-park.js`) → deferred to **W3-Park** (a wave-3 text file);
  recorded in ART_AUDIO §7.
- **W1-A 7** (person ids and looks) → applied as a record: ART_AUDIO §7, CONTRACT §15.3 → the data is
  deferred to **W2-Street** (`people.js`) and the wave-2 building owners (`owner`, `portrait`).
- **W1-A answer A** (interior params, actors) → recorded: ARCHITECTURE §9.2, CONTRACT D60.
- **W1-A 4, 6, 8** → not this desk (`en-ui.js`, W1-Q files, `js/render/actors.js`).

## W1-C (conflict and chance rules)

- **W1-C 1** (four "in progress" fields) → applied in the docs: ARCHITECTURE §6.1 (schema and why),
  CONTRACT §8.8 and D43 → additive v1 fields, deep-filled, so no migration; `js/rules/state.js` has
  them (desk-rules).
- **W1-C 4** (`js/core/rng.js`: `Math` in a local) → applied: `var M = Math;` and `M.ceil / min /
  floor / max / imul` → one global lookup per call instead of five in Node's vm; the golden
  sequences of `tests/node/core.test.cjs` are unchanged (same draws, same values).
- **W1-C 5** (the nomination check on stepping into the city) → recorded in the call conventions
  (CONTRACT §8.10, ARCHITECTURE §6.12) → the action row is `js/data/actions/world.js` (W1-W, W2-City in
  wave 2); deferred to **W2-City**.
- **W1-C 7** (numbers → tuning / BALANCE) → applied in BALANCE: B-13 `quirks.*`, B-14f
  `autoWindowSec`, B-17 `publicLibrary.study`, `universalFries.karma`, `cityNameMax` (marked *(w1)*)
  → BUILD_PLAN §1.7; `tuning.js` has the rows (desk-rules).
- **W1-C 9** (additive names) → applied: CONTRACT §8.9, ARCHITECTURE §6.11; camelCase decree ids as
  D54 → other packages call them; the decree names are read by tuning rows already.
- **W1-C 10** (keys other files define) → deferred: `vm.board.*`, `vm.doodle.*`, `vm.crayon.*` to
  **W2-Civic** (`en-civic.js`, vars `path`, `days`, `day`, `poll`); `mg.holdup.{intimidate, sweetTalk,
  outwit}` to **W2-Food**; `taunt.<fighter>.1..3` for the 17 fighter ids to **W2-Night**
  (`en-night.js`); `news.head.<kind>` for W1-C's log kinds to **W2-Home** (`en-news.js`).
- **W1-C 11** (how wave-2 data calls the rules) → applied: CONTRACT §8.10, ARCHITECTURE §6.12.
- **W1-C 12** (balance note: the pit boss's +1, Quick-fight numbers) → deferred to **W3-Balance** →
  no change requested; B-14b stays as written until the simulator says otherwise.
- **W1-C 2, 3, 6, 8** → not this desk (desk-rules answered them).

## W1-D (design system and UI framework)

- **W1-D 1** (the rest of `SR.ui`) → applied: CONTRACT §15.4, ARCHITECTURE §7.1 / §7.3, a pointer in
  UI §2.3 ("Component API") → wave-2 screens build from these names.
- **W1-D 2** (the UI input rule) → applied: CONTRACT §15.5, ARCHITECTURE §11, UI §6; D57 → one
  activation per key for every W2 screen.
- **W1-D 3** (tokens added) → applied: UI §2.1, a bullet after the `css` block (kept out of the block
  and without `--name: #hex` text, which `tokens.test.cjs` and `art.test.cjs` parse).
- **W1-D 4** → lead decision (above).
- **W1-D 6** (interior params and actors) → applied: ARCHITECTURE §9.2, ART_AUDIO §9, D60.
- **W1-D 7** (home modes and greetings) → applied as a record: ARCHITECTURE §7 (building row) and
  §7.3, CONTRACT §15.4 → the data is deferred to **W2-Home** (`js/data/buildings/home.js`).
- **W1-D 5, 8** → not this desk (W1-S answered 5; 8 is the answer to W1-R 10).

## W1-E (economy and life rules)

- **W1-E R3** (public names; freeze `SR.rules.effects.{run, addMsg, merge, partial}`) → applied:
  CONTRACT §8.9, ARCHITECTURE §6.11 → the night delivers voicemails through `addMsg` and runs arc
  effects through `run`, so their shape is shared across packages.
- **W1-E R4** (`vm.crew.*`, `vm.skywatch.*` → `en-econ.js`) → applied: CONTRACT §7 → no NPC owns them
  and the night (W1-E) raises them (D27's rule).
- **W1-E R5** (`vm.penny.loan5`, `loan1`, `default`) → deferred to **W2-Money** (`en-money.js`; vars
  `{ days, n, money }` / `{ n, money, lien }`).
- **W1-E R6** (`news.head.<kind>`, `news.head.absurd`, `news.tv.<kind>`, `news.story`) → deferred to
  **W2-Home** (`en-news.js`; vars: the log entry's plus `variant`).
- **W1-E R9** (B-10 EV table) → applied: BALANCE B-10 formula (4.08 % / 1.98 %) and rows $60 / $275 /
  $930 / $1,715 per up tip, $30 / $135 / $465 / $855 per market day → the shock is a log return; the
  old rounding was 22 % off at INT 100 (checked by hand against the formula).
- **W1-E R10** (the Fold's flag) → applied: `flags.foldDone` in ARCHITECTURE §6.1, CONTRACT §8.8 and
  D43 → W3-Park sets it (deferred to **W3-Park**), `endgame.banners` reads it.
- **W1-E R1, R2, R7, R8, R11** → not this desk (R2's schema recorded in D43).

## W1-G (render core)

- **W1-G 1** (render names) → applied: CONTRACT §15.2, ARCHITECTURE §9.5.
- **W1-G 2** (the entity lists the renderer draws) → applied as a convention: CONTRACT §15.1,
  ARCHITECTURE §8.2 / §8.6 → W2-City, W2-Street, W3-Crime, W3-Life expose these arrays.
- **W1-G 3** (props and skyline hooks) → recorded: CONTRACT §15.2, ARCHITECTURE §9.5 → the files are
  deferred to **W2-Exterior** (`js/art/props.js`, `js/art/skyline.js`).
- **W1-G 4** (`js/core/debug.js`: no invalidate on an overlay toggle) → applied: `setFlag` emits
  `debug:changed` only; D46, CONTRACT §17.1 / D39, ARCHITECTURE §20; tested in
  `tests/e2e/boot.test.cjs` (a spy on `SR.render.invalidate` sees no call) → the overlays are drawn
  every frame; nothing bakes them (checked: no module reads the flags into a cache).
- **W1-G 5** (reading CPU budgets headless) → applied as W1-Q 2 (ARCHITECTURE §17, D53).
- **W1-G 6** (render decisions) → applied: ARCHITECTURE §9.4 and the §17 memory split, D58.
- **W1-G 7** → lead decision (above).
- **W1-G 8** → not this desk (`tests/perf/perf.cjs`, W1-Q).

## W1-K-M1 (kernel M1)

- **W1-K-M1 2** (fold D33-D42; the crispness example) → applied: ARCHITECTURE §2 (crispness row, stage,
  quality), §3 (loop), §11 (input), §13 (events), §15 (saves, fixtures), §16 (settings), §18
  (harness, loader), §20 (debug) → CONTRACT refines ARCHITECTURE until folded; 1366 × 768 gives
  k ≈ 1.067, 0.7125 is a 912 × 513 window (D40).
- **W1-K-M1 3** (engine limits stay named constants) → confirmed: D49 → ARCHITECTURE §2-§3, §11, §15
  engine limits are not BALANCE numbers, and the tuning table names are frozen (CONTRACT §3.6).
- **W1-K-M1 4** (`js/core/scenes.js`: honour the no-transition paths) → applied with the M1
  transitions themselves (they were not part of W1-K-M1): `go` (default `pageTurn`) and a `replace`
  that names a kind run inside `SR.render.fx.transition`; `{ transition: false }`, `SR.debug.fast()`,
  a change requested inside another change, the first scene and a missing `SR.render.fx` swap at
  once; the stack still changes synchronously; `go` / `replace` return the transition's Promise;
  `queue` passes options. CONTRACT §11.1 / §11.4, D44, ARCHITECTURE §5. Tests:
  `tests/node/core.test.cjs` (15 checks with a fake `SR.render.fx`) and `tests/e2e/boot.test.cjs`
  (the real page-turn runs and ends with the loop time; `false` and fast swap at once).
- **W1-K-M1 5** (suspend audio on a hidden tab) → no change needed → `js/audio/engine.js` (W1-S)
  suspends and resumes its own context on `visibilitychange`; ARCHITECTURE §3 / §12, D50.
- **W1-K-M1 notes** → recorded: the W2-Front save UI calls (ARCHITECTURE §15, deferred to
  **W2-Front**), the touch stick and tap-to-walk (ARCHITECTURE §8.6, **W2-City**), Tab and the Pocket
  (UI §6, CONTRACT §15.5, D57; **W2-Pocket**).
- **W1-K-M1 1** → not this desk (`en-ui.js`; applied by W1-D).

## W1-M (minigames)

- **W1-M 1, 2** (the rest of `SR.minigame`; engine, instance, host, skin, result and run-param
  fields) → applied: CONTRACT §13.1, ARCHITECTURE §10.1 (plus `step`, the run param the card now
  passes).
- **W1-M 3** (the play area's own canvas) → applied: ARCHITECTURE §10.1 and §18 (visual), UI §5.8,
  D56.
- **W1-M 4** (tuning rows) → applied in BALANCE: B-05 `hustle.orderup.items`, `hustle.sortit.streak`,
  `hustle.sortit.travelSec`, B-15 `assist`, B-26 `junker.ring.arc` (*(w1)*); `tuning.js` has them
  (desk-rules) → BUILD_PLAN §1.7.
- **W1-M 5** (sortit belt cadence) → confirmed: BALANCE B-05 now states `itemsPerCorrect` items per
  ticket interval (2 s → 1 s); no `itemEverySec` key (a derived value; same answer as desk-rules).
- **W1-M 6-10** → not this desk (card, audio, crime, text files).

## W1-Q (quality tooling)

- **W1-Q 1** (the tools' public interfaces) → applied: CONTRACT §18.1, ARCHITECTURE §18.1.
- **W1-Q 2** (how the perf runner reads CPU budgets) → applied: ARCHITECTURE §17 ("What is gated"),
  §17 memory, §18 performance row; D53 (also answers W1-G 5).
- **W1-Q 3** → lead decision (above).
- **W1-Q 4** (owners of the open prefixes) → applied: CONTRACT §7 table (engine strings, `toast.act.*`,
  every NPC, `act.world.*` / `desc.world.*`, `act.bag.*` / `act.phone.*`), ARCHITECTURE §7.2; D51.
- **W1-Q 8** (`tests/e2e/input.test.cjs` race) → applied: the `contextmenu` listener is installed by an
  awaited `evaluate` before the right-click and read back from `window.__menu` → the click can no
  longer land before the listener exists; the suite passes (75 / 75).
- **W1-Q 9** (`enc.` and `event.` ≤ 400) → applied: CONTRACT §7, ARCHITECTURE §7.2 → GDD §6.11.
- **W1-Q 10** → nothing left: desk-rules registered W1-E R1's keys.
- **W1-Q 5, 6, 7** → not this desk.

## W1-R (rules kernel)

- **W1-R 1** (BALANCE rows) → applied: B-01 `weekdays`, `skateContestMin`, `buzzDecayMin`; B-02
  `heatRange`, `buzzRange`; B-03 `degree.tracks`, `winded.min` → BALANCE mirrors `tuning.js` key for
  key.
- **W1-R 2** (a tuning home for the check clamp) → rejected for tuning (D49): a 34th table changes
  CONTRACT §3.6's frozen list, and the clamp is GDD §4.3's formula; recorded under BALANCE B-28b.
- **W1-R 3** (`news.msgMax`, `training.stampMin`) → rejected for tuning (D49): the inbox cap is
  ARCHITECTURE §15's retention, shared with `save.js` (one source), and the stamp threshold is UI
  §4.3 presentation; recorded under BALANCE B-29.
- **W1-R 4** (key names that differ) → applied: BALANCE B-18 (`endgame.ranks`, `endgame.column`),
  B-19 (`weather.forecastAccuracy`), B-31 (`hospital.hpPct`, was `hospital.hp`) → W1-E's modules
  already read these names; no rename.
- **W1-R 5, 6, 7** (additive kernel names, partial Results, named-fn price values) → applied:
  CONTRACT §8.1, §8.8, §8.9; ARCHITECTURE §6.2, §6.11 (with desk-rules' `INCOME`, `trackIncome`,
  `noteIncome` and the Delta `key` of W1-Q 5).
- **W1-R 9, 10** → lead decisions (above).
- **W1-R 11** (small rule readings) → confirmed: D59; GDD §4.2 (Winded after the action's HP cost,
  Buzz on the 2-hour grid), §4.14 (Iron Stomach, Hard Landing), §6.8 (Heat Wave), §3.12 (weather
  reads Clear while the flag is off), §6.2 (McHolland's bribe inclusive).
- **W1-R 8, 12** → not this desk.

## W1-S (audio)

- **W1-S 1** (D19-D21, D31 confirmed) → recorded: CONTRACT §14.4, ARCHITECTURE §12.
- **W1-S 2** (what the formats leave open; per-pattern `bpm`) → applied: CONTRACT §14.4, ARCHITECTURE
  §12.1, ART_AUDIO §13.8 (the `coin` example note).
- **W1-S 3** (the rest of `SR.audio`; the held duck) → applied: CONTRACT §14.4, ARCHITECTURE §12.1.
- **W1-S 4** (the mix as built) → applied: ART_AUDIO §13.7, CONTRACT §14.1 (graph order), ARCHITECTURE
  §12; D50 → the Master slider after the compressor is a clean output volume.
- **W1-S 8** (guidance) → deferred as notes: **W2-Music** (levels, render cost, `stingers.stamp`),
  **W2-City** (adaptive music, beds, edge sounds), **W2-Front** (the unlock line) → recorded in
  CONTRACT §14.4 / ART_AUDIO §13.5; the full text stays in `W1-S.md` §8.
- **W1-S 5, 6, 7** → not this desk (`js/scenes/building.js` W1-D, `js/scenes/minigame.js` W1-M, W1-Q).

## W1-W (world geometry)

- **W1-W 1** (seven world numbers) → applied in BALANCE B-15 (*(w1)* rows); `tuning.js` has them
  (desk-rules).
- **W1-W 2** (freeze the `world` field names) → applied: CONTRACT §3.6 and a BALANCE B-15 note.
- **W1-W 3** → recorded in BALANCE B-15 `carHit` (desk-rules applied the night step, with
  `carHit.voicemails` 3); the three texts `vm.carhit.1..3` (vars `{ n, money, cheque }`) are deferred
  to **W2-City** (`en-city.js`).
- **W1-W 4** (`guardRails`) → recorded as D54.
- **W1-W 6** (world names) → applied: CONTRACT §15.1, ARCHITECTURE §8.6.
- **W1-W 7** (notes for later packages) → recorded: ARCHITECTURE §8.6 → **W2-City**, **W2-Transit**.
- **W1-W 5** → not this desk (W1-Q).

## Document conflicts settled

- **ContextPrompt distance** → 96 u (the Interact range) for the prompt; 96-160 u a plain door name
  tag (D52): UI §2.3 and §5.5 said 160 u against GDD §3.6, ARCHITECTURE §8.4 and B-15.
- **Text ownership** → `door.*`, `ori.*` in `en-world.js` (not `en-city.js`); `report.*` in `en-econ.js`
  (not `en-home.js`); `reason.*` in `en-prog.js` (ARCHITECTURE §19 said "generic reasons" for
  `en-ui.js`); D51, ARCHITECTURE §7.2 and §19, CONTRACT §7.
- **`en-pocket.js`** (D16) → added to ARCHITECTURE §19 and §7.2.
- **Cross-reference validation** → ARCHITECTURE §7 said `SR.boot` validates cross-references; D28 gives
  that to `tools/validate.cjs` (ARCHITECTURE §4, §7).
- **The crispness example** → D40 (ARCHITECTURE §2, §18).
- **Audio graph order** → buses → compressor → makeup trim → master gain (CONTRACT §14.1 and
  ARCHITECTURE §12 drew master before the compressor); D50.
- **`renderOffline`** → returns `Promise<AudioBuffer>` (D20; ARCHITECTURE §12 said `AudioBuffer`).
- **Police light bar** → "2 Hz" in ART_AUDIO §8 now reads "halves swapping every 0.5 s, at most 2
  flashes a second" (`lightPhase`).
- **Migration fixture tests** → ARCHITECTURE §15 named `tests/node/save.test.cjs`, which does not
  exist; they are in `tests/node/core.test.cjs`.

## Deferred (for wave-2 and wave-3 packages)

| Package | Carried from wave 1 |
|---|---|
| W2-City | the nomination check on entering the city (W1-C 5); `vm.carhit.1..3` texts (W1-W 3); the city scene's calls (W1-W 7, W1-K-M1 notes); adaptive music and beds (W1-S 8) |
| W2-Home | `building.modes` and greetings in `home.js` (W1-D 7); `news.head.<kind>`, `news.head.absurd`, `news.tv.<kind>`, `news.story` (W1-E R6, W1-C 10) |
| W2-Money | `vm.penny.loan5`, `loan1`, `default` (W1-E R5) |
| W2-Civic | `vm.board.*`, `vm.doodle.*`, `vm.crayon.*` (W1-C 10); the Study row uses `training.gain` (W1-C 6) |
| W2-Food | `mg.holdup.intimidate`, `sweetTalk`, `outwit` (W1-C 10) |
| W2-Night | `taunt.<fighter>.1..3` for the 17 fighters (W1-C 10) |
| W2-Street | person ids and looks in `people.js` (W1-A 7) |
| W2-Transit | `SR.world.place('afterJail' / 'afterHospital')` (W1-W 7) |
| W2-Exterior | `SR.art.props.{draw, size}`, `SR.art.skyline.draw` (W1-G 3) |
| W2-Music | levels and render cost, `stingers.stamp` (W1-S 8) |
| W2-Front | the save UI calls (W1-K-M1 notes); the gamepad-only unlock line (W1-S 8) |
| W2-Pocket | Tab closes the Pocket; other scenes ignore Tab's `pocket` (W1-K-M1 notes, D57) |
| W3-Park | `bark.preacher.board` (W1-A 5); set `flags.foldDone` (W1-E R10) |
| W3-Balance | the pit boss's +1 rule and the Quick-fight numbers (W1-C 12) |

## Tests

`node tools/run-all.cjs --jobs 3`: 53 of 55 suites pass. This desk's suites all pass: `core` (Node,
352 checks, with the 15 new transition checks), e2e `boot` (49), `input` (75), `slice` (21; 4 steps
still pending on wave-2 content), `save`, `stage`; `validate --wave 1`, `shingles`, `tokens` and
`art` (which parse UI §2.1, BALANCE B-04c and ART_AUDIO §2) pass on the edited docs. The two
failures are outside this desk's files:

- `tests/perf/perf.cjs --quick`: "the 257 scripts of index.html hold 1.83 MB of JS (≤ 1.8 MB)"
  → the 8 MiB lead decision is not yet in `perf.cjs` (below). Every other perf gate passes.
- `tests/visual/visual.cjs`: the `artbible` golden differs in the header (26 cells) → the art bible
  now draws its labels from `ui.bible.*` ("ART BIBLE"), which W1-A request 4 added to `en-ui.js` at
  this integration; the golden (W1-Q) needs `node tests/visual/visual.cjs --record --only artbible`.
  Scene transitions play no part: the #artbible route starts on an empty stack and the visual run
  sets `SR.debug.fast(true)`.

## Open issues

- `tests/perf/perf.cjs` (W1-Q's file) still gates `BUDGET.scriptBytes = 1.8 * MIB` and prints "≤ 1.8
  MB"; the lead decision (8 MiB) needs that one-line change by the file's owner.
- The perf relative gate has no baseline yet: the lead records `tests/perf/baseline.json` with
  `node tests/perf/perf.cjs --record` and `--record --quick` once the integration tree is final
  (ARCHITECTURE §17).
- `tools/validate.cjs` `textOwner` (W1-Q) does not map `vm.crew.*` and `vm.skywatch.*`, which
  CONTRACT §7 now gives to `en-econ.js` (W1-E R4); the keys exist, so nothing fails today, but a
  missing one would be reported without its owner.
- `js/minigames/shiftrush.js` and `js/minigames/timingring.js` still use named constants for the
  rows desk-rules added (`jobs.hustle.*`, `street.junker.ring.arc`, `world.assist`); they should read
  them through `SR.minigame.tune` (W1-M's files; "lead (requests)" in wave 2).
