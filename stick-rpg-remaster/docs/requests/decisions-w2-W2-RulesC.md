# Wave 2: decisions of the rules desk W2-RulesC (crime, trips, fights, casino, election)

Scope (BUILD_PLAN §4.0): `js/rules/{crime,trade,fight,casino,election}.js`,
`js/data/{cities,decrees}.js`, `js/data/text/en-conflict.js` and their Node tests
(`tests/node/{crime,trade,fight,casino,election}.test.cjs`, `tests/node/w1c-kit.cjs`). W2-RulesC is
the successor of W1-C; `js/data/fighters.js` moved to W2-Night (BUILD_PLAN §7). Each line is
request id → decision → reason. Requests addressed to W2-RulesE, or parts of a request that target
a file this desk does not own, are named "not this desk".

## Sweeps

| Sweep | When | Requests found for this desk |
|---|---|---|
| 1 | start of the wave | none in `docs/requests/W2-*.md` (no wave-2 request file existed yet). The wave-1 decision files list no deferred item for W2-RulesC (their Deferred tables name no rules desk); the wave-1 items that touch this desk's files were settled at the wave-1 integration (below) |
| 2 | mid-wave (continuous, as each request file appeared) | `W2-Food.md` item 4 (below). Read and nothing for this desk: `W2-Civic.md` (its campaign rows call `election.*` as CONTRACT §8.10 records), `W2-Goods.md`, `W2-Exterior.md` (reads `tuning.crime.police.posters` and the cities' palette keys, both present), `W2-Transit.md` (its rows call `trade.*` / `crime.*` as recorded; the tour hook's forfeit `{ wins: 0 }` gets the -20 % of `trade.tour`), `W2-Night.md` ("nothing is asked of the rules desks": every §8.10 call worked), `W2-City.md` (`world.city` runs `election.check`), `W2-Home.md` (its item 1 is `act.js`, W2-RulesE's), `W2-RulesE.md` |
| 3 | before finishing | nothing new for this desk: `W2-Money.md`, `W2-Street.md` and `W2-Pocket.md` (new) name no conflict rule or file of this desk; `W2-RulesE.md` 4 and `decisions-w2-W2-RulesE.md` answer this desk's request 3 (applied: `casino.card: null` in `defaults()`); `W2-Food.md` 4 records the adopted order of its scratch resolve |
| 4 | after the pause (resumed), before handing off | nothing new for this desk: the files changed since sweep 3 (`W2-Front.md` 1-5, `W2-Transit.md` 1-5, `W2-Home.md` 1-9, `decisions-w2-W2-RulesE.md` sweep 4) name no conflict rule or file of this desk (W2-Transit 5, Keep playing after a game that ended in jail, is W2-Front's; the cell still releases through `crime.jailDay`, and a sentence already served releases at once); this desk's request 5 (`phone.boardInfo` → `election.acceptBy`) was applied by W2-Pocket after the pause (`js/data/actions/phone.js` reads `SR.rules.election.acceptBy`), so the Board's voicemail, City Hall, the Campaign HQ and the phone name the same day; W2-Food, W2-Front and W2-Pocket's edits after the pause and `decisions-w2-W2-RulesE.md` sweep 5 add nothing for this desk |
| 5 | the review | nothing new for this desk: the items added since sweep 4 (`W2-City.md` 6-7, `W2-Civic.md` 6, `W2-Front.md` 6, `W2-Exterior.md` 10-11 and its item 6 update, which asks the lead's render sheet to load `cities.js` and `en-conflict.js` as they are, `W2-RulesE.md` 6, `decisions-w2-W2-RulesE.md` sweep 6) name other owners' files; `W2-Night.md` still asks nothing of the rules desks |

## Requests from wave-2 packages

- **W2-Food 4** (`js/rules/casino.js`: pay the scratch card at its reveal) → applied → the start's
  feedback (the flying `+$100` chip and the money count) spoiled the reveal. `casino.scratch` still
  takes the card (unless the row's `cost.items.scratch` did) and draws the roll at once (one draw,
  so the reveal cannot change it), but keeps it as the card in progress `state.casino.card = { roll,
  pay, tier, day }` and credits nothing; the new named fn **`casino.scratchResolve`** pays it at the
  reveal (income `prize`, through the lien), raises `gamble { game: 'scratch', bet: 5, net: prize -
  5, pay, roll }` and closes the record; with no card in progress it refuses (`reason.notNow`), so a
  stray or repeated resolve pays nothing, and the record's prize wins over the engine's echoed
  `{ net }`. A card whose resolve never came is paid before the next one is drawn. No karma
  (B-14e). W2-Food adopted it in the wave (`store.scratchPlay:resolve` runs `[['fn',
  'store.scratchDone'], ['fn', 'casino.scratchResolve']]`: Dee reads `state.casino.card` before it
  is paid and closed; `tests/e2e/store.test.cjs` passes); the header of `js/minigames/scratch.js` ("credits it when the row runs") is W2-Food's to
  update. The state field and the
  CONTRACT records are requested in `docs/requests/W2-RulesC.md` 3-4 (RulesE: `state.js`
  defaults; the lead: CONTRACT §8.8 / §8.9). Tested in `casino.test.cjs` (module and pipeline).
- **W2-Civic's review note to W2-Pocket** (the phone's `phone.boardInfo` says "accept by day
  `nominatedDay + acceptWithin`", one day late) → not a request to this desk; helped with an
  additive name → **`SR.rules.election.acceptBy(s)`**: the last day the offer can be accepted
  (`nominatedDay + acceptWithin - 1`, the day whose night lapses it; `null` when no offer waits).
  The Board's voicemail now takes its `day` from it, and every screen (City Hall, the phone, the
  castle's Campaign HQ) can read the same day instead of repeating the arithmetic. Pinned against
  the night's lapse in `election.test.cjs`; the CONTRACT record is `docs/requests/W2-RulesC.md` 4.
- **W2-Food 1-3, 5** → not this desk (`tools/validate.cjs`, `js/ui/card.js` and `en-ui.js`: the
  lead / W2-Front; `js/rules/jobs.js`: W2-RulesE).

## Wave-1 items that name this desk or its files

- **W1-W 4** (`js/data/decrees.js`: "if W2-RulesC renames `guardRails` to `guard_rails`, nothing
  breaks") → no change → CONTRACT D54 fixes the camelCase decree ids (`tuning.priceMods`, the
  night, jobs, the bank and the world read B-17's key names); `guardRails` stays.
- **W1-E R7** (the split of night step 5) and **W1-E R8** (the jail release) → no change → the
  agreement holds in the wave-2 tree: `electionNight` only rolls and sets the status, the night
  does the rival's gain, `campaignDay`, the no-show and the lapse; the jail night counts down and
  `crime.jailDay` releases at `daysLeft` 0 (both pinned by `election.test.cjs` / `crime.test.cjs`).
- **W1-M 9** (Hold-up run params) → no change → `crime.holdupParams` returns `target`, a numeric
  `D` and `stake: true` (pinned by `crime.test.cjs`).
- **W1-C 10** (text keys other files define: `vm.board.*`, `vm.doodle.*`, `vm.crayon.*` for
  W2-Civic; `mg.holdup.*` for W2-Food; `taunt.<fighter>.*` for W2-Night; `news.head.<kind>` for
  W2-Home) → not this desk (the wave-2 owners of those files; the lead's Deferred table carries
  them). The rules keep naming them.
- **W1-C 12** (the pit boss's +1 rule, Quick-fight numbers) → deferred to W3-Balance by the lead;
  no change here.

## Ownership notes

- The headers of this desk's files and suites now name the wave-2 owner (`owner: W2-RulesC`), so
  wave-2 packages address requests here rather than to W1-C.

## Rule fixes and additions of this desk (from its own review)

- **A served sentence could never end outside `crime.jailDay`** (a jail night run directly, as
  `tests/balance/sim.cjs` does with its default choice `'rest'`, counted `daysLeft` down to -1, -2,
  ... and never released) → `crime.jailDay` now releases at once when `jail.daysLeft ≤ 0`, whatever
  the choice, with no gain and no further night (Heat 20, the `release` event). The simulator's own
  fix is requested from the lead (`docs/requests/W2-RulesC.md` 1). Tested in `crime.test.cjs`.
- **`SR.rules.election.acceptBy(s)`** (above) and **`casino.scratchResolve`** (W2-Food 4): the two
  additive names of this desk in wave 2; the CONTRACT records are `docs/requests/W2-RulesC.md` 4.

## Fixes from the adversarial review (wave 2)

No public name changes; each is pinned in the suite named.

- **The debate's counts were unbounded** (`js/rules/election.js` `debate`): losses were read as
  `beats.length - wins`, so a result naming only its wins (`{ wins: 2 }`) counted -2 losses and
  moved the poll +10 instead of +6, and `{ wins: 9 }` gave +27. Wins are now held to the 3 questions
  (B-17 `debate.questions`), losses to the questions left, neither below 0; the Duel's own results
  (`wins + losses = beats.length ≤ 3`) are unchanged (`election.test.cjs`).
- **A won or fled fight could leave 0 HP** (`js/rules/fight.js` `finish`): a `win` or `run` result
  echoing `hpLeft: 0` set HP 0, and the pipeline then downed the player with cause `other` (death
  in Hardcore); a `NaN` left HP `NaN`. Only a loss reaches 0 now (a win or a run keeps at least 1),
  and a non-finite `hpLeft` keeps your HP (`fight.test.cjs`).
- **`casino.bjHand`'s echoed net was unbounded** (`js/rules/casino.js` `bjRound`): the `{ bet, net }`
  form paid any net (`{ bet: 10, net: 100000 }` paid $100,000), while the echoed `wagered` was
  already capped at a hard-coded 2 × bet. One bound now comes from B-14b's rules (`maxStake`: a
  double, or the hands a split allows, doubled only with double-after-split: 2 × bet today): the
  echoed net is clamped to ±that, `wagered` uses it, and a played `{ round }` staking more (or with
  no hands) is refused with `reason.badBet`. The engine's `{ round, shoe, trueCount }` calls are
  unaffected (`casino.test.cjs`).
- **The Scratch row's preview showed an unrevealed card's prize** (`js/rules/casino.js`
  `scratchRound`): with a card left in progress (a reload mid-reveal), the dry run paid it, so the
  "Scratch a card" row showed e.g. "+$10,000" as if the next card paid it. The dry run
  (`ctx.preview`) no longer pays it; the row itself still pays it before drawing the next card
  (`casino.test.cjs`).
- **A stale header** (`js/data/decrees.js`) pointed at named constants in `election.js` that the
  wave-1 integration moved to `tuning.election`; it now names the tuning rows.

## Notes for the wave-2 data (how the conflict rules read through `SR.act`)

- `SR.act`'s Result keeps only the fields of CONTRACT §8.3: the module functions' extras (`released`,
  `days`, `trip`, `spin`, `suspicion`, `delta`) are not in it. Read the rule events instead: `rob`,
  `jail`, `release` (the jail scene's "out at 08:00"), `trip` (with the story's `key` / `vars`),
  `fight`, `gamble` (with the round's facts), `election` (with the poll); plus `jailed`, `report`,
  `open`, `over`. The feature packages' files already do (checked: store, bank, bar, casino, trip,
  jail, cityhall).
- A preview dry-runs its row on a copy with a neutral stream: rows whose effect runs a night
  (`jail.day`, a red-eye that can end in a bust) show the night's economy among their gains, and a
  trip row shows one typical outcome; the bus board reads `SR.rules.trade.{ticket, mugChance,
  bustThreshold}` and the Jail Day card `SR.tuning.crime.jail.day` for their chips instead.

## Checks

- `node tests/node/{crime,trade,fight,casino,election}.test.cjs`: 115 / 73 / 68 / 108 / 117 passed,
  0 failed (after the review's fixes above). New in wave 2: the game can end in jail (the arrest night of the last day, a Jail Day
  night, Keep playing), the release of a served sentence, the scratch card paid at its reveal
  (module and pipeline), a debug-assisted election run from the Board's call to office through
  the pipeline and the real nights (a police catch mid-campaign counts as campaign days; the
  debate on day 4; election night; the salary), `acceptBy` against the night's lapse.
- `node tests/node/load.cjs rules` / `all`: 0 errors; `node tools/validate.cjs --wave 2`: nothing
  from this desk's files; `node tools/shingles.cjs`: clean; `tests/e2e/conflict-sheet.test.cjs`
  and W2-Food's `tests/e2e/store.test.cjs` (the scratch change) pass; the conflict sheet captured
  into `shots/W2-RulesC/` (cities, decrees, fighters) shows every city's palette keys resolved and
  every decree card named.
- Final run after the pause, `node tools/run-all.cjs --jobs 2` (node, tools, balance, e2e): every
  suite of this desk and every suite that drives the conflict rules passes (every Node suite but
  `invariants`, `tests/balance/sim.cjs --selftest`, `tests/e2e/{slice,conflict-sheet,store,bank,bar,casino,
  fight,darts,bus,jail,election,hospital,results}.test.cjs`); a scratch smoke over file:// (the
  store robbery and its resolve, a bar fight, a slot pull, a roulette spin, the red-eye, the city
  check) shows zero console errors. The failing suites name no file of this desk and their owners
  have filed them, or they belong to other packages: `tests/node/invariants.test.cjs` (W2-City 1),
  `tools/validate.cjs --selftest` (W2-Food 6, W2-Money 5b), `tests/e2e/boot.test.cjs` (W2-Front 1),
  `tests/e2e/a11y.test.cjs` (W2-Pocket 1); `tests/e2e/{minigames,stage,ui-kit,world,render}` fail
  in the minigame frame, the stage's focus, a clock-ring overflow, three sampled edge falls and the
  render budget under two jobs (none of them reads a conflict rule; left to their owners).
