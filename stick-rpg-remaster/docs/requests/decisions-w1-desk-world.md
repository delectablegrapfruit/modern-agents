# Wave-1 integration: decisions of the world desk (desk-world)

Scope: requests whose target is one of `js/world/*`, `js/render/*`, `js/minigames/*`,
`js/scenes/minigame.js`, `js/data/worldmap.js`, `js/data/actions/world.js`,
`js/data/text/en-world.js`, `tools/*`, `tests/perf/*`, `tests/visual/*`,
`tests/e2e/{world,render,minigames}*.cjs` and `tests/node/invariants.test.cjs`, plus the open issues
desk-lead left in these files. Each line is request id → decision → reason. Parts of a request
that target another owner's file (docs, kernel, UI, rules, wave-2 files) are left to that owner and
named "not this desk" at the end.

## Lead decisions (applied and recorded)

- **Script-size budget (W1-G 7, W1-Q 3)** → applied in `tests/perf/perf.cjs`: `BUDGET.scriptBytes =
  8 * MIB` (was `1.8 * MIB`), the gate's message and the header read "≤ 8 MB of JS, comments
  included (D45)", and `--selftest` pins the value; the boot-time budget (1,500 ms × factor) is
  unchanged → ARCHITECTURE §17 and CONTRACT D45 (desk-lead) already say 8 MB; the 1.8 MB figure was
  spent after wave 1 (the 257 scripts hold 1.83 MB today) with three content waves to go, and
  classic scripts from `file://` load fast. `perf.cjs --quick` now passes the size gate.
- **Day-1 fries price (W1-R 9)** → nothing in this desk's files: no world, render, minigame, tool,
  perf or visual file names the price (BUILD_PLAN §3.12 and `slice.test.cjs` say $9: desk-lead;
  the rules produce $9: desk-rules).
- **Hold-to-repeat (W1-D 4, W1-R 10)** → nothing in this desk's files: the minigame frame is one of
  the things a repeat stops at, unchanged; the stat-stamp exception lives in `js/ui/card.js` (W1-D)
  and the wording in GDD §4.4 / UI / ARCHITECTURE §11 (desk-lead, D47).

## W1-A (art kit)

- **W1-A 6** (`tools/validate.cjs` palette walk; `tests/perf/calibrate.js`) → no change needed →
  W1-Q applied both in wave 1: the palette walk accepts the numbers `sky.<i>.h` / `sky.<i>.light`
  and resolves the non-enumerable `ui` aliases (`validate.cjs`, the palette section), and
  `calibrate.js` is the shared workload the art and sound sheets load.
- **W1-A 8** (`js/render/actors.js`: one police light phase) → applied: the cached-sprite path takes
  its phase from `SR.art.vehicles.lightPhase(v.t)` (the local formula stays only as a fallback for
  a vehicles module without it) and still bakes at `t = phase × 0.5 + 0.01` → one definition of the
  light bar's rhythm. Test: `tests/e2e/render.test.cjs` "police light bar (cached sprites)": a spy
  sees the call, the same phase draws the same pixels and the other phase swaps the bar.

## W1-C (conflict and chance rules)

- **W1-C 5** (the nomination check on stepping into the city: a silent, free `world.*` action with
  `['fn', 'election.check']` in `js/data/actions/world.js`) → deferred to **W2-City** → the row is
  only useful with its call site, the city scene's entry (wave-2 work), and CONTRACT §8.10 /
  ARCHITECTURE §6.12 already say "W2-City adds it"; W2-City owns `js/data/actions/world.js` and
  `en-world.js` (its `act.world.*` label) in wave 2 (BUILD_PLAN §4.1, §7). The named fn
  `election.check` exists (W1-C), so W2-City adds the row and runs it with `SR.act` on entering the
  city.
- **W1-C 11** (how the wave-2 engines call the conflict rules) → deferred to **W2-Night**
  (`js/minigames/{fight,darts,slots,blackjack,roulette}.js`) and **W2-Food** (`scratch.js`) → those
  engines are wave-2 stubs in `js/minigames/`; CONTRACT §8.10 records the calls.

## W1-G (render core)

- **W1-G 2** (the entity lists the renderer draws) → no change → `js/render/actors.js` already reads
  the listed arrays (and `source()`); the convention is recorded for W2-City, W2-Street, W3-Crime
  and W3-Life (CONTRACT §15.1, desk-lead).
- **W1-G 3** (props and skyline hooks) → deferred to **W2-Exterior** (`js/art/props.js`,
  `js/art/skyline.js`) → `js/render/buildings.js` and `sky.js` already call
  `SR.art.props.{draw, size}` and `SR.art.skyline.draw` when they exist and draw placeholders
  meanwhile; nothing changes on the render side.
- **W1-G 5** (`tests/perf/*`: how to read CPU budgets headless) → no change needed → answered by
  W1-Q 2 / D53: `perf.cjs` gates each frame's JS work (native canvas time subtracted), rasterises
  every frame outside its timing (`getImageData` on `#world`) and warms the caches at each memory
  stop; `tests/e2e/render.test.cjs` keeps its own median / p95 check with the shared calibration.
- **W1-G 7** → lead decision (above).
- **W1-G 8** (`tests/perf/perf.cjs`: time the stage contexts' own draw methods as native) →
  applied: `runTour` also wraps the own function properties of `SR.stage.ctx` and `SR.stage.fxCtx`
  (path building excepted) with the native timer and restores them in the `finally`; one depth
  counter makes a timed wrapper that reaches another (the loop's per-instance `drawImage` / `fill` /
  `fillRect` calling a timed prototype method) count once → `js/core/loop.js` counts draws with
  per-instance wrappers the prototype timers never saw, so Chromium's mid-frame raster flush was
  booked as JS work. Measured on `high-dpr2-noon` (`--only high-dpr2-noon`): JS work p95 1.60 ms,
  render 1.60 ms (raw frame p95 48.3 ms, of which native 47.4 ms), all gates pass (the request
  reported ≈ 43 ms before). `--selftest` checks the wrapping is in place.

## W1-M (minigames)

- **W1-M 3** (a minigame golden reads `[data-id="mg-canvas"]`) → no change needed → W1-Q applied
  it: the `minigame-*` scenes of `tests/visual/visual.cjs` read the frame's canvas;
  `minigame-test-pitch` matches its golden.
- **W1-M 4** (engines read the new tuning rows) → applied (also desk-lead's open issue, D55):
  `js/minigames/shiftrush.js` reads `jobs.hustle.orderup.items`, `jobs.hustle.sortit.streak`
  (`step`, `max`, `every`), `jobs.hustle.sortit.travelSec` and `world.assist.speed`;
  `js/minigames/timingring.js` reads `street.junker.ring.arc` (`base`, `perInt`, `from`, `min`,
  `max`) and `world.assist.{speed, sweet}`, all through `SR.minigame.tune`; the named constants stay
  as fallbacks for a table without the row. The engine defs' `ASSIST_SPEED` / `ASSIST_ARC` keep
  their names and now read the table. Run params may still override (`streakEvery`, `travelFrom`,
  `travelTo` join the list). Test: `tests/e2e/minigames.test.cjs` "tuning rows": today's values
  equal the rows, and a planted table flows into both engines (items, streak multiplier, belt,
  the hotwire arc clamp, Assist); the existing Assist check (needle 147°/s, arc × 1.5) still passes.
- **W1-M 5** (the sortit belt cadence) → confirmed, no change → the belt already brings
  `itemsPerCorrect` items per ticket interval (`ticketEverySec / itemsPerCorrect`); BALANCE B-05 and
  D55 record the reading, and no `itemEverySec` row exists.
- **W1-M 8 / W1-S 6** (hold a 6 dB duck while a minigame is open) → applied in
  `js/scenes/minigame.js`: a game without its own song holds `SR.audio.duck(6, Infinity)` from
  `enter` and calls the returned release function on `exit` (never `duck(0)`, which would release
  other callers' held ducks); a game with its own `music` switches to it and does not duck →
  ART_AUDIO §13.4 "minigames duck the song 6 dB"; W1-S's `duck` now holds with `Infinity`. Tests:
  `tests/e2e/minigames.test.cjs` (the real page): `(6, Infinity)` while open, released on close,
  and no duck for a skin with a song.

## W1-Q (quality tooling)

- **W1-Q 4 / W1-E R4** (key owners; desk-lead's open issue: `textOwner` does not map `vm.crew.*`
  and `vm.skywatch.*`) → applied in `tools/validate.cjs`: a `VM_TEXT` map gives `vm.carhit.*` to
  `en-city.js` and `vm.crew.*`, `vm.skywatch.*` to `en-econ.js`, as CONTRACT §7 now says (D51);
  `--selftest` checks them with `door.*`, `ori.*` (en-world) and `report.*` (en-econ) →
  a missing voicemail of night step 11 is reported with its owner. `validate --wave 1`: 0 errors,
  no `text-owner` warning.
- **W1-Q 6** (`tests/e2e/render.test.cjs` uses the shared calibration) → no change needed → the perf
  section already loads `tests/perf/calibrate.js` and uses `SRCalibrate.run(9).factor`.
- **Visual golden `artbible`** (desk-lead's test note) → re-recorded
  (`node tests/visual/visual.cjs --record --only artbible`) → the art bible now draws its section
  labels from W1-A request 4's `ui.bible.*` keys (en-ui.js); the old golden differed only in the
  label cells (44 cells in rows 1, 2, 7, 12, 13, 22, 23, 32; 26 beyond the tolerance), and the
  scene and capture settings are unchanged.

## W1-R (rules kernel)

- **W1-R 8** (`tools/validate.cjs`: the condition / effect vocabulary, `toast.act.*`) → no change
  needed → applied by W1-Q in wave 1 (the validator reads `SR.rules.conditions.names` /
  `SR.rules.effects.names`; `--selftest` pins `toast.act.*` → en-prog).

## W1-S (audio)

- **W1-S 6** → applied with W1-M 8 (above).
- **W1-S 7** (`tools/validate.cjs`, `tests/perf/calibrate.js`: nothing needed) → confirmed.

## W1-W (world geometry)

- **W1-W 1** (seven world numbers in `SR.tuning.world`) → applied on the world side: desk-rules added
  the flat keys, so `js/world/world.js` now reads `skateAccel`, `carRange`, `carRadius`,
  `carLength`, `driveZoomEase`, `teeterAssistMs`, `navCacheSec` as ordinary tuning paths (their
  design values moved from the `LOCAL` table into the B-15 fallback table, so a lost key is
  reported in `cfg.missing` like every other; the `SR.world.LOCAL` export is gone, nothing read it).
- **W1-W 2** (freeze the `world` field names) → applied: `world.js` drops the old spellings
  (`sidewalkCap`, `kerbRange`, `out`, `lookAheadSec`, `zFactor`, `totalSec`, `skippableAfter`,
  `knockdownSec`); each number has one path → CONTRACT §3.6 / D55 freeze the names and
  `tuning.test.cjs` asserts the old ones are gone. Tests: `tests/node/invariants.test.cjs` (one
  path per number; the seven equal the table; a tuned value wins, a removed key falls back to
  B-15 and is listed in `cfg.missing`).
- **W1-W 4** (Guard Rails decree id) → no change → D54 keeps `guardRails`; `SR.world.safeEdges`
  also accepting `guard_rails` is harmless.
- **W1-W 5** (`tools/validate.cjs`: the worldmap's and world actions' references) → no change needed
  → applied by W1-Q in wave 1; `validate --wave 1` reports 0 errors on the world files.
- **W1-W 7** (notes for later packages) → recorded, no change → the calls are W2-City's and
  W2-Transit's (desk-lead deferred them); the render side (W1-G) already interpolates with `px` /
  `py`.
- **W1-K-M1 notes** (the touch stick and tap-to-walk; `SR.debug.mg` → `SR.minigame.force`) → no
  change → the world side needs none (W2-City wires the input); `SR.minigame.force` already backs
  `SR.debug.mg` (tested in `minigames.test.cjs`).

## Not this desk

W1-A 1-5, 7; W1-C 1-4, 6-10, 12; W1-D 1-8; W1-E R1-R11; W1-G 1, 4, 6; W1-K-M1 1-5; W1-M 1, 2, 6, 7, 9,
10; W1-Q 1-3, 5, 7-10; W1-R 1-7, 9-12; W1-S 1-5, 8; W1-W 3, 6 (docs, kernel, UI, rules, audio,
sheets and wave-2 text files: desk-lead and desk-rules answered them).

## Tests

Run on this desk's files after the changes: `tests/node/invariants.test.cjs` (189 checks),
`tests/e2e/world.test.cjs` (77), `tests/e2e/render.test.cjs` (110, with the police light bar),
`tests/e2e/minigames.test.cjs` (131, with the tuning rows and the duck), `tools/validate.cjs
--selftest` (41) and `--wave 1` (0 errors), `tests/perf/perf.cjs --selftest` (17) and
`--only high-dpr2-noon` (16), `tests/visual/visual.cjs` (every golden matches after the `artbible`
re-record).

`node tools/run-all.cjs --jobs 3`: 54 of 55 suites pass (229 s), including `visual` (the
`artbible` failure desk-lead and desk-present reported is gone) and `perf --quick` (the 1.8 MB
failure is gone: 1.83 MB ≤ 8 MB). The one failure is outside this desk's files and load-dependent:
`tests/e2e/audio.test.cjs` "crossroads_strut 60 s + 480 sfx rendered ≤ 3 % × calibration" measured
3.13 % with two other suites running beside it; run alone it passes (2.94 %, 86 / 86). W1-S's
request 7 already notes this song renders at 2.6-2.9 % of the 3 % budget.

## Open issues

- `tests/perf/baseline.json` still has no recording, so the relative gate only warns. The lead
  records it with `node tests/perf/perf.cjs --record` and `--record --quick` once the integration
  tree is final (ARCHITECTURE §17); recording now, while the other desks still edit, would pin a
  moving tree.
- `tests/e2e/audio.test.cjs` (W1-S's suite; desk-present's file) sits close to its offline-render
  budget, so it can fail under `run-all --jobs 3` load (above); W2-Music's songs must stay lighter
  than `crossroads_strut` (W1-S 8), or the suite could judge the render with `--jobs 1`.
