# Wave-1 integration: decisions of the rules desk (desk-rules)

Scope: requests whose target is one of `js/rules/*`, `js/data/*.js` (except `worldmap.js`,
`actions/world.js`, `features.js`), `js/data/text/{en-prog,en-econ,en-conflict}.js` and
`tests/node/*` (except `load.cjs`, `core.test.cjs`). Each line is request id → decision → reason.
Parts of a request that target another owner's file (docs, kernel, UI, wave-2 data) are named as
such and left to that owner. Tests: `node tools/run-all.cjs --only node,tools,balance` passes
(35 of 35; `validate --wave 1`: 0 errors).

## Lead decisions (recorded)

- **Script-size budget (W1-G 7, W1-Q 3)** → lead decision: ARCHITECTURE §17 "Script size" becomes
  8 MB of JS (comments included) and `tests/perf/perf.cjs` `BUDGET.scriptBytes` 8 MiB; the
  boot-time budget stays → not in desk-rules' files (ARCHITECTURE is the lead's, `tests/perf/*`
  W1-Q's); nothing to apply here.
- **Day-1 fries price (W1-R 9)** → lead decision: the employee discount applies (GDD / BALANCE
  B-28a win), so fries cost $9 on day 1 → the rules already produce $9; pinned by
  `tests/node/mods.test.cjs` (a new-game preview of the fries row: `$9`, badge `employee`),
  `tests/node/act.test.cjs` (`money:changed` delta -9) and `tests/e2e/slice.test.cjs`. The
  BUILD_PLAN §3.12 slice text ("$12" → "$9") is the lead's file.
- **Hold-to-repeat (W1-D 4, W1-R 10)** → lead decision: a repeat stops at any stamp except a
  stat-gain stamp, which shows once per hold → no rules change: `js/rules/effects.js` keeps raising
  `stamp.stats.<stat>` for every gain ≥ 2 and the card (`SR.ui.stamp.busy({ ignoreStat: true })`,
  W1-D) shows the first one per hold. The GDD §4.4 / UI §1.3 / ARCHITECTURE §11 wording is the
  lead's.

## W1-C (conflict and chance rules)

- **W1-C 1** (state: `trade.offer`, `fight.open`, `casino.match`, `crime.open`) → applied in
  `js/rules/state.js` `defaults()` (all `null`) → the resolve guards need these facts to survive a
  save; additive v1 fields that the save's deep-fill supplies to older saves (tested in
  `state.test.cjs`). Recording them in ARCHITECTURE §6.1 is the lead's.
- **W1-C 2** (`jail` effect passes `ctx`) → applied (`C.jail(s, reason, ctx)`) → the arrest night
  must draw from the caller's stream (tested in `act.test.cjs`).
- **W1-C 3** (night step 12 campaign morning) → no change needed → `js/rules/night.js` already
  absorbs `campaignMorning` on a campaign morning (tested in `night.test.cjs`).
- **W1-C 6** (Public Library Act on Study) → no change in desk-rules' files; deferred to
  **W2-Civic** → `SR.rules.training.gain(s, 'study')` already reads `decree.studyGain`; the Study
  row in `js/data/buildings/uofs.js` is wave-2 content and only has to use that gain.
- **W1-C 7** (numbers into `tuning.js`) → applied → BUILD_PLAN §1.7. New rows:
  `fight.quirks.{wobbly.miss 0.30, pyro.fireballOdds 2, iron.armor 0.30}` (fighters.js now names
  only the quirk id; `SR.rules.fight` merges the row, a def field would override it),
  `election.publicLibrary.study` 3, `election.universalFries.karma` 10, `election.cityNameMax` 16,
  `casino.darts.autoWindowSec` 600; `election.js` and `casino.js` read them.
  `SR.rules.casino.darts.AUTO_WINDOW_SEC` stays as a read-only getter of the row (name stability).
  Mirroring the rows in BALANCE is the lead's.
- **W1-C 8** (reason keys) → applied with one change → `reason.barred` and `reason.badBet` are in
  `en-prog.js` and used by `casino.js` (back-off, invalid bets and stakes, table limit);
  `reason.redEye` already existed with UI §10's copy "Buses leave at {time}", which wins over the
  proposed "The red-eye leaves at {time}"; `trade.canBoard` now refuses with it (was
  `reason.notNow`). `reason.barred` reads "Lucky Lou backed you off: back on day {day}" because
  `barredUntil` is the first day you may play again.
- **W1-C 4, 5, 9, 10, 11, 12** → not desk-rules' files (`js/core/rng.js`, `js/data/actions/world.js`,
  CONTRACT records, wave-2 text files, BALANCE notes) → no change here.

## W1-E (economy and life rules)

- **W1-E R1** (34 `reason.*` keys) → applied in `en-prog.js`, text as proposed → CONTRACT §7 gives
  `reason.*` to en-prog; `validate --wave 1` went from 35 errors to 0 (also W1-Q 10).
- **W1-E R2** (`daily.shifts`, day-1 history) → applied → `daily.shifts: 0` in `defaults()` (the
  night's generic reset zeroes it); `create()` seeds `history.<series> = [[1, value]]` for nw, str,
  int, cha, karma (the night's `[day, value]` shape). Tests in `state.test.cjs` / `night.test.cjs`.
- **W1-E R3** (`Down.toasts` into `Result.toasts`) → applied in `js/rules/act.js` `down()` (tested
  with Second Wind). The CONTRACT §8.6 / §8.8 records and freezing `SR.rules.effects.{run, addMsg,
  merge, partial}` are the lead's.
- **W1-E R4** → no change needed → `en-econ.js` already defines `vm.crew.day365` and
  `vm.skywatch.*`; the CONTRACT §7 row is the lead's.
- **W1-E R7** (the split of night step 5) → agreement confirmed → `electionNight` only rolls and
  sets the status; the night does the rival's gain, `campaignDay`, the no-show and the lapse.
- **W1-E R8** (jail release) → agreement confirmed → the jail night counts down; `crime.jailDay`
  releases at `daysLeft` 0.
- **W1-E R5, R6, R9, R10, R11** → not desk-rules' files (W2-Money, W2-Home text; BALANCE; CONTRACT;
  W1-A icons, done).

## W1-K-M1

- **W1-K-M1 3** (engine limits as named constants) → no change to `tuning.js` → they are
  ARCHITECTURE engine limits, not BALANCE numbers, and the 33 table names are frozen. The same
  reasoning keeps `effects.js` `MSG_MAX` (150, the retention `js/core/save.js` also applies).

## W1-M (minigames)

- **W1-M 4** (tuning rows) → applied under the requested names: `jobs.hustle.orderup.items` [2, 5],
  `jobs.hustle.sortit.streak` { step 0.1, max 1.5, every 3 }, `jobs.hustle.sortit.travelSec`
  [3.2, 2.2], `street.junker.ring.arc` { base 20, perInt 0.2, from 200, min 8, max 70 },
  `world.assist` { speed 0.7, sweet 1.5, wobble 0.5 } → BUILD_PLAN §1.7. The engines
  (`shiftrush.js`, `timingring.js`; W1-M's, "lead (requests)" in wave 2) still use their named
  constants and should read these rows through `SR.minigame.tune`.
- **W1-M 5** (sortit belt cadence) → reading confirmed, no new key → the belt brings
  `itemsPerCorrect` items per ticket interval (2 s → 1 s); an `itemEverySec` row would be a second
  source for a derived value. Documented on the `sortit` row.
- **W1-M 9** (Hold-up run params) → no change needed → `crime.holdupParams` returns `target`, a
  numeric `D` and `stake: true`.

## W1-Q (quality tooling)

- **W1-Q 5** (income source on cash / bank Deltas) → applied → `js/rules/effects.js` records
  income credits by source while an action runs (`trackIncome()` / `noteIncome()`; `credit()` and
  `SR.rules.bank.income` report to it); `js/rules/act.js` sets `key` on a positive cash or bank
  Delta to the source that credited the most to that field (`{ kind: 'cash', key: 'wage', n, from,
  to }`; CONTRACT §8.3 `key?`). Credits without a source name none. Tested in `act.test.cjs`.
- **W1-Q 10** → done by W1-E R1.

## W1-R (rules kernel)

- **W1-R 1, 4** → no change → the keys already live in `tuning.js` and `tuning.test.cjs` pins the
  names; the BALANCE entries are the lead's.
- **W1-R 2** (a tuning home for the check clamp) → rejected for tuning → a 34th table would change
  CONTRACT §3.6's frozen table list, and these are formula constants of GDD §4.3 / B-28b, not tuned
  values; `CHANCE_MIN`, `CHANCE_MAX` and `D_MIN` stay in `js/rules/check.js`.
- **W1-R 3** (`news.msgMax`, `training.stampMin`) → rejected for tuning → the inbox limit is
  ARCHITECTURE §15 retention, which `js/core/save.js` also applies (a tuning copy would split one
  value across two sources), and the stamp threshold is UI §4.3 presentation; both stay named
  constants in `effects.js` (as W1-K-M1 3).
- **W1-R 5, 6, 7** → CONTRACT records → the lead's; no code change.
- **W1-R 8** → applied by W1-Q.
- **W1-R 9, 10** → lead decisions (above).
- **W1-R 11** (rule readings) → accepted as implemented → each follows GDD / BALANCE and is covered
  by the kernel suites; no change.
- **W1-R 12** (`stat` events from the night) → applied → steps 7 and 9 pass the Report to
  `SR.rules.stats.add`, so nightly furniture gains and Mandatory Hats raise `stat { key, n, total }`
  in `Report.events` (tested in `night.test.cjs`).

## W1-W (world geometry)

- **W1-W 1** (seven world numbers) → applied as flat `SR.tuning.world` keys (`skateAccel`,
  `carRange`, `carRadius`, `carLength`, `driveZoomEase`, `teeterAssistMs`, `navCacheSec`), the
  names `js/world/world.js` reads first → BUILD_PLAN §1.7. The B-15 entries are the lead's.
- **W1-W 2** (freeze the `world` names) → applied → `tuning.test.cjs` pins the eight names and
  asserts that the old spellings are gone.
- **W1-W 3** (the car-hit voicemail) → applied in `js/rules/night.js` step 11 → GDD §3.10 / B-15
  `carHit`: on `flags.carHitVm` one of `vm.carhit.1..3` (a new `world.carHit.voicemails: 3`), 20 %
  with a cheque of 50 + rand(0..150) credited to cash as income `prize` (the lien applies) and the
  report line `report.carHitCheque` (en-econ); the flag is cleared (one call however many hits).
  The voicemail's vars are `{ n, money, cheque }` (n 0 without a cheque); its three texts are
  W2-City's (`en-city.js`), which should read naturally with or without a cheque.
- **W1-W 4** → no change → `guardRails` stays the decree id.

## Requests about wave-2 content in js/data (deferred)

- **W1-A 7** (person ids and looks in `js/data/people.js` and building data) → deferred to
  **W2-Street** (people.js) and the wave-2 building owners → wave-2 content; the ids are recorded
  in W1-A's request.
- **W1-D 7** (home door modes and greetings in `js/data/buildings/home.js`) → deferred to
  **W2-Home** → wave-2 content; the ARCHITECTURE §7 / §8.4 wording is the lead's.

## New public names from this desk (for the lead's CONTRACT fold)

`SR.rules.effects.{INCOME, trackIncome, noteIncome}`; the cash / bank Delta `key`; the state fields
`trade.offer`, `fight.open`, `casino.match`, `crime.open`, `daily.shifts`; the day-1 history points;
the text keys `reason.barred`, `reason.badBet`, `report.carHitCheque` and the 34 of W1-E R1; the
tuning rows listed above.
