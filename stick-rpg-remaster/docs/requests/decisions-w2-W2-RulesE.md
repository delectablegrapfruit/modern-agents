# Wave 2: decisions of the rules desk W2-RulesE (kernel and economy)

Scope (BUILD_PLAN §4.0): `js/rules/{state,check,conditions,effects,act,time,stats,log,perks,jobs,
training,night,bank,stocks,homes,calendar,endgame,health,news}.js`,
`js/data/{tuning,perks,items,jobs,homes,furniture,stocks,ranks}.js`, `js/data/text/{en-prog,en-econ}.js`
and their Node tests (`tests/node/{state,act,time,stats,perks,tuning,mods,jobs,training,night,bank,
stocks,homes,calendar,endgame,health,news,rulese}.test.cjs`, `tests/node/{w1r-kit,econ-helpers}.cjs`).
W2-RulesE is the successor of W1-R and W1-E; the headers of these files now name the wave-2 owner
(`owner: W2-RulesE`), so wave-2 packages address requests here. Each line is request id → decision
→ reason. Requests addressed to W2-RulesC, or parts of a request that target a file this desk does
not own, are named "not this desk".

## Sweeps

| Sweep | When | Requests found for this desk |
|---|---|---|
| 1 | start of the wave | none in `docs/requests/W2-*.md` (no wave-2 request file existed yet); the wave-1 decision files list no deferred item for W2-RulesE (their Deferred tables name no rules desk; W1-R 2 / 4 and W1-W 1 / 3, which named "W2-RulesE in wave 2", were settled at the wave-1 integration by desk-rules: rejected for tuning (D49) / applied) |
| 2 | mid-wave | `W2-RulesC.md` only (items 1-2 target the lead's `tests/balance/sim.cjs` and the W1-C sheet: not this desk; its proposal that the pipeline refuse non-jail rows while jailed is noted below) |
| 3 | mid-wave | `W2-Food.md` (item 3 is this desk's: applied; 1, 2, 4, 5 are other owners'); `W2-RulesC.md` 3 (applied); `W2-Civic.md` (items 1-3 are the lead's and W2-Music's: not this desk); `W2-Goods.md` (items 1-3 are the lead's: not this desk); `W2-Exterior.md` (items 1-9 are W2-City's and the lead's; it reads `tuning.crime.police.posters`, which exists: nothing to change); `W2-Transit.md` (items 1-4 are W2-Front's, the lead's and W3-Crime's: not this desk); `W2-Night.md` (items 1-4 are the lead's; "nothing is asked of the rules desks"; its `bar.canCarry` uses this desk's `reason.stackFull`); `W2-Home.md` (item 1 is this desk's: applied, with the jail exception; 2-6 other owners'); `W2-City.md` (items 1-4 are the lead's; `world.cab` reads `tuning.world.cab`, which exists) |
| 4 | late in the wave | `W2-Night.md` 5 (this desk's: applied); `W2-Civic.md` 4-5 (the lead's); `W2-Street.md` (1-5 other owners'; the schema part of 6 applied); `W2-Money.md` (3 and 4a applied, 4b answered; 1, 2, 5, 6 the lead's); `W2-Pocket.md` (5 applied; 1-4, 6, 7 other owners'); `W2-RulesC.md` 5 (W2-Pocket's); `W2-Front.md` (1-5 other owners'); `W2-Transit.md` 5 (W2-Front's) |
| 5 | after the pause (resumed) | nothing new for this desk: the items added since sweep 4 name other owners' files (`W2-Food.md` 6 and `W2-Money.md` 5b: the lead's `validate.cjs --selftest`; `W2-City.md` 5, `W2-Exterior.md` 10: the lead's render files; `W2-Goods.md` 4: W2-Front's `en-ui.js`, applied there; `W2-Home.md` 7-9: the lead's `card.js` / `components.js` and GDD; `W2-RulesC.md` 4: the lead's records); the wave-1 decision files' Deferred tables still name no rules desk |
| 6 | before finishing (resumed run) | nothing new for this desk: `W2-Civic.md` 6 (the lead's `card.js`: re-pick a greeting after an action) and its W2-Home note (W2-Music's variant); `W2-Food.md` (a W2-Money note and a status line); `W2-Pocket.md` 3 (applied by W2-City) and 7 (records); `W2-RulesC.md` 5 (applied by W2-Pocket: `phone.boardInfo` reads `election.acceptBy`). This desk's own `W2-RulesE.md` 6 records an e2e observation for the lead (the world suite's fall samples meet the traffic) |
| 7 | the adversarial review | two items addressed to this desk that sweeps 5 and 6 missed, both applied (below): `W2-City.md` 6 (`tuning.crowd.turnRange` / `scurry`) and `W2-Money.md` 7 (the loan's last day on the report); `W2-City.md` 7 is the lead's world suite |

## Requests from other wave-2 packages

- **W2-Home 1** (`js/rules/act.js`: no `game:over` from `SR.act` when the Result carries a night
  report) → applied with one exception → `SR.act` does not emit `game:over` when the game ends in a
  night the report scene presents: a sleep's Report (`Result.report`, kind `sleep`) or the hospital
  night's (`Result.down.report`); the report scene emits it once the paper is read (CONTRACT §9.2
  already names "SR.act / the report scene"; GDD §4.7 and §4.16: the results follow the report).
  `Result.over` is still set. **Exception:** a jail night's Report (kind `jail`, from
  `crime.jailDay`) is a line on the Jail Day card, not the report scene, and W2-Transit's jail scene
  goes to the results without emitting, so `SR.act` still emits `game:over` there (else a Hardcore
  loan default found by a jail night would never delete the ironman slot, `js/core/save.js`). Death
  at HP 0 (no report) is emitted as before. Tested in `rulese.test.cjs` with `SR.act` on the bus;
  `tests/e2e/{home,hospital,jail,slice}.test.cjs` pass with it. The CONTRACT §8.7 / §8.9 wording
  ("SR.act ... derives game:over") is the lead's to amend (`docs/requests/W2-RulesE.md` 2).
- **W2-Night 5** (`js/data/tuning.js`: the table chips) → applied → `tuning.casino.chips: [5, 25,
  100, 500]` (GDD §2.1 "$5 / $25 / $100 chips (+$500)", §6.5), next to the B-14 rows; the engines'
  named constants `CHIPS` (W2-Night's files) can read it. A field inside a frozen table, so no
  contract change; mirroring it in BALANCE B-14 as a *(w2)* row is the lead's
  (`docs/requests/W2-RulesE.md` 3). Pinned in `rulese.test.cjs`.
- **W2-Night 1-4, W2-Civic 4-5** → not this desk (the lead's). W2-Civic 4 notes that
  `training.graduate`'s preview gain is keyed `diplomas` (the state list), not the item id
  `diploma`: the Delta's `key` is the state key by contract (CONTRACT §8.3), so the chip lookup is
  the UI's (the request's own fix, in `components.js`).
- **W2-Street 6** (a record for the lead; its "state written" list names `npc.kid.diedDay`, a field
  the v1 schema lacked) → this desk's part applied → `npc.kid.diedDay: 0` joins `defaults()` (like
  `hiredDay`, `contestDay`), so `defaults()` stays fully populated for the save's deep-fill; the
  flags (`jobOffer`, `junkerRing`) are free-form `flags.*`. **W2-Street 1-5** → not this desk
  (W2-City, the lead, W2-Home, notes); its day-1 offer runs through its own silent action
  `street.jobOffer`, so `state.create` seeds no message (nothing asked of this desk).
- **W2-Money 3** (`jobs.js`, `en-prog.js`: every missing requirement on the row) → applied →
  `SR.rules.jobs.missingReason(p)` (and so `jobs.canPromote` / `jobs.canApply`) returns
  `reason.needAll` "Need {list}" when two or more requirements are missing, `list` the parts joined
  by " · " (`reason.part.stat` / `.shifts` / `.rating`: "INT 75 (you: 61) · CHA 25 (you: 14) · 3
  shifts (you: 1)") plus the raw `missing` list; one missing requirement keeps its own reason (GDD
  §4.6 "the row lists every missing requirement"). `jobs.test.cjs` and `rulese.test.cjs` pin it.
- **W2-Money 4a** (`night.js`: a formatted lien in `vm.penny.default`) → applied → the voicemail's
  vars add `lienMoney` (`SR.text.money(lien)`) next to the raw `lien`.
- **W2-Money 4b** (a question: Standard's "HP = 1" at a default is applied at night step 2, then
  step 6 restores, so you wake at 1 + the restore) → no change; this reading is intended → GDD §4.7
  numbers the default in step 2 (the bank) and the restore in step 6, and that order is the fixed,
  unit-tested night; the HP loss still costs everything above 1 before the restore (on day 2: 21 of
  22 instead of full; late in a run 126 of 500 instead of 500), while waking at 1 HP would leave a
  Winded player one fall from the hospital, a second penalty the GDD does not list. The wording
  "HP set to 1 before the night's restore" for BALANCE B-09 is asked of the lead
  (`docs/requests/W2-RulesE.md` 5); `tests/e2e/bank.test.cjs`'s expectation stands.
- **W2-Money 1, 2, 5, 6** → not this desk (the lead's).
- **W2-Pocket 5** (`state.js` / `act.js`: `records.meals`) → applied → `records.meals: 0` in
  `defaults()` (additive, deep-filled; v1 stays), and the pipeline adds 1 per `eat` rule event a
  Result carries (after the arcs, so an arc's `eat` counts too; nothing in a preview or a refused
  run), so the Journal's First Day "Eat something" (UI §9) survives a reload. Pinned in
  `rulese.test.cjs` and `state.test.cjs` (13 records).
- **W2-Pocket 1-4, 6, 7** → not this desk (the lead's, W2-City's, W2-Front's). W2-Pocket's Bag uses
  this desk's `items.pillToggle` and `training.apply('smoke')`.
- **W2-Front 2** (a `world.retire` action calling this desk's `endgame.retire`) → not this desk (the
  action belongs in `js/data/actions/world.js`, W2-City's, or where the lead puts it); the named fn
  is ready and tested (Retire through `SR.act` sets `Result.over` and emits `game:over`, reason
  `retire`). The row `world.retire` is registered now (W2-City's file, after the pause): through the
  pipeline it ends an Unlimited run with `over.reason` `retire` and refuses a timed one
  (`reason.timedGame`), and the action fuzz (176 actions) is clean with it. **W2-Front 1, 3-5** →
  not this desk. W2-Front's wizard uses `SR.rules.state.roll` /
  `fair`, and its results use `SR.rules.endgame.keepPlaying` (this desk's additions).
- **W2-Home 2-6** → not this desk (the kit, the validator, W2-Front's screens, CONTRACT records,
  W2-Money's real-estate sub-screen).
- **W2-City 6** (`js/data/tuning.js`: two crowd numbers of GDD §3.11) → applied (review sweep 7) →
  `tuning.crowd.turnRange: 80` (idle pedestrians within 80 u turn toward you) and
  `tuning.crowd.scurry: 0.2` (one in five scurries at karma ≤ -50), P1 `cityReacts`, fields inside
  a frozen table (no contract change); `js/world/pedestrians.js` already reads them by these names.
  The B-22 rows are the lead's (the request asks for them). Pinned in `rulese.test.cjs`.
- **W2-Money 7** (`night.js`, `en-econ.js`: the loan's last day on the report) → applied (review
  sweep 7) → night step 2 counts down before it defaults, so the morning with 1 day left is the
  last day: the Money line is `report.loanDueTonight` ("Loan: $515 owed, due tonight") instead of
  "Loan: 1 days left"; other mornings keep `report.loanDays`. Pinned in `rulese.test.cjs`
  (`tests/e2e/bank.test.cjs` checks a 14-days-left morning, unchanged).
- **W2-RulesC 3** (`js/rules/state.js`: `casino.card: null` in `defaults()`, the scratch card in
  progress `{ roll, pay, tier, day }` between `casino.scratch` and `casino.scratchResolve`) →
  applied → an additive "in progress" record like `casino.match` (D43): deep-filled, so the schema
  stays v1 (pinned in `state.test.cjs`, with the deep-fill of an older save). The ARCHITECTURE §6.1
  / CONTRACT §8.8 record is the lead's (W2-RulesC 3 asks for it).
- **W2-Food 3** (`js/rules/jobs.js`: an Auto hustle result is Auto) → applied → the named fn
  `jobs.work` treats `params.hustle.auto` (the card's Hustle commits `{ m, hustle: result }`, and
  Shift Rush's Auto and forfeit results carry `auto: true`) like `params.auto`, so an Auto round
  pays exactly 1.0 with no rain tips (B-05 "Auto exactly 1.0"); a played Order Up still gets them
  (tested in `rulese.test.cjs`: $42 Auto, $50 played, in the rain).
- **W2-Food 1, 2** (`tools/validate.cjs`, `js/ui/card.js`: Hustle rows without a `:resolve`, shift
  rows repeatable next to a Hustle) → not this desk (the lead's files). No rules change is needed
  either way: `jobs.work` pays the same row with or without `m`.
- **W2-Civic 1** (`js/ui/card.js`: skip actions marked `row: false`) → not this desk (the lead's);
  no rules change: `SR.rules.act.actions(owner)` keeps listing every action of an owner (the pawn
  shop's sub-screen and the W2 suites enumerate commits with it), so the card's own filter is the
  place for `row: false`. **W2-Civic 2, 3** → not this desk (W2-Music; the lead's CONTRACT records).
- **W2-Goods 1** (`components.js` / `building.js`: name the piece on `furniture` and `home` chips)
  → not this desk (the lead's); the rules' Deltas stay as frozen (CONTRACT §8.3): `furniture` keyed
  by the tier-1 id with `from` / `to` tiers, `home` keyed `living` (from / to home ids) or `owned`
  (from / to lists), which is what the chip needs. **W2-Goods 2, 3** → not this desk (the lead's
  docs).
- **W2-Food 4** (`casino.scratch`) → not this desk (W2-RulesC). **W2-Food 5** (`en-ui.js`) → not
  this desk (W2-Front). W2-Food's note that its goods rows use `items.room` / `items.buy` → they
  are part of this desk's additions (below).

- **W2-RulesC proposal** (the pipeline does not refuse other actions while `state.jail` is set, so
  a sim bot may work from the cell) → not a request; no change → the jail scene gates the UI
  (GDD §6.6), and a pipeline gate would need an allowlist (the Jail Day rows, bail, the P1 lawyer
  contact on the phone, the Bag's pill toggle) that belongs with the police and jail design of
  W3-Crime; the sim's bots can skip non-`jail` rows while `s.jail` is set.

## Rule fixes from the review of the GDD §6.1 P0 rows

Each is a bug or a gap the wave-2 building data would have hit; tested in
`tests/node/rulese.test.cjs` unless stated.

- **The `furniture(id, minTier)` condition counted pieces in storage** (GDD §4.15: "pieces beyond
  the new home's slots go to storage and do nothing") and could not name a tier-2 piece → it now
  holds only for a piece in use in the home you live in (`SR.rules.homes.has`: not stored; the P0
  satellite also needs the TV in use); a tier-2 id (`skydish`) asks for its base at tier 2; a stored
  piece refuses with the new `reason.inStorage` ("Flatland 60 TV is in storage"). So Computer
  (Stocks) and TV rows disable while their piece is stored.
- **Buying past a B-06 stack took the money and gave nothing** (the `item` effect clamps silently:
  a 100th pack of smokes cost $10) → new named fns `items.room` (condition) and `items.buy` (effect):
  n more of an item must fit its stack (smokes, pills, product 99; ammo 5 at a time, so refused at
  ≥ 95 as B-06 says; gear of stack 1 refuses "Already have Knife"; reason `reason.stackFull` "Can't
  carry more (max 99)"); `items.buy` also raises the frozen `buy` rule event with the price actually
  paid after the B-28a modifiers (`ctx.cost.cash`), which declarative data cannot know.
- **List items ignored their stack** (the `item` effect pushed takeout past B-06's 5) → the effect
  now stops a list item at its stack and notes "(max)" for the preview (`SR.rules.effects.addItem`,
  `room`).
- **No condition for the TV channels** (GDD §6.1 Watch TV: News with the TV, Fitness and Dating with
  the satellite; P1 Market Watch with the SkyDish) → named fn `homes.channel` (condition) over
  `SR.rules.homes.channels`, naming the missing piece in its reason.
- **Training rows gave no stat feedback**: `training.apply` (the named fn every U of S, TV, bar and
  Bag training row uses) added the gain without the `stat` effect's feedback of UI §4.3, so Study
  showed no "+2 INTELLIGENCE!" stamp from the rules, no Winded toast and no "(max)" note → the
  gain and its feedback are one helper now (`SR.rules.effects.gainStat`), used by both the `stat`
  effect and `training.apply` (which passes the pipeline ctx for the preview's note).
- **The intra-day weather had no rule** (GDD §3.12, B-19: "at 12:00 and 18:00, 30 % to move one
  step along the same chain; any Rain sets `todayHadRain`"; P1 `weather`) → `SR.rules.calendar.
  intraday(s, from, to, rng)`, called by the pipeline when an action's time passes a mark on the
  same day (not on a Heat Wave day); with the flag off nothing is drawn, so P0 runs are unchanged.
- **Home perks gave no stat feedback** (P1): `homes.usePerk` now uses the same helper (the party's
  "+8 CHARM!" stamp).
- **The morning report's copy**: "1 unread messages" → `report.unreadOne`; the jail's one-line
  summary lacked the market mover of UI §5.12 ("Interest +$42 · NLI ▲ 2 % · 1 message") → on a market
  night `report.jail.summaryMarket` with `ticker`, `arrow`, `pct` of the biggest mover
  (`night.test.cjs`).
- **A job rank B-05 does not know** (a hand-edited save: the save's validator checks the clock,
  money and stats, not the ranks) was "promoted" to the track's first rung (`indexOf` -1 + 1),
  worked $0 shifts, and made `jobs.bestTitle` throw inside `endgame.results` (found by a probe of
  the real NLI rows after the resume) → `jobs.promotion` gives it no next rung
  (`reason.topRank`), `jobs.canWork` refuses it (`reason.notHired`) and `bestTitle` skips it.

## Fixes from the adversarial review of the package

Each is tested in `tests/node/rulese.test.cjs` ("review fixes" sections).

- **An ended Keep-playing run kept playing.** `SR.rules.act.run` / `preview` refused only when
  `over && !mode.keepPlaying`, but `endgame.keepPlaying` clears `over`; so after a Retire or a
  Hardcore death in a Keep-playing run every row still ran (food healed, shifts paid, nights
  passed). → both refuse with `reason.gameOver` whenever `over` is set. The screens that test
  `!keepPlaying` the same way are other owners' (`docs/requests/W2-RulesE.md` 7).
- **Overtime after anyone's Full shift** (P1 `hustles`). `canWork` checked only
  `job.lastFullEnd == now` and walking is free, so a McSticks Full shift ($42) opened a CEO's
  Overtime at NLI ($900), against B-05 "only right after a Full shift with no action in between".
  → any other action that goes through clears the mark (entering a building runs `world.enter`);
  Full → Overtime at the same counter is unchanged (`W2-RulesE.md` 8a).
- **SR.act swallowed `action:done` when an action threw**: the refusal (`reason.error`) was
  returned without the event CONTRACT §8.9 promises for refusals → it is emitted like any other
  refusal (the state and the stream are rolled back first, as before).
- **A night's stat gains were announced twice**: the pipeline derived `stat` rule events from the
  Deltas of a Sleep (or a hospital or jail night), and the report scene, the jail and the hospital
  re-emit the Report's own `stat` events → the derived event leaves out what the Report raised
  (`W2-RulesE.md` 8b); a Jail Day workout keeps its own event.
- **`bank.charge` as a named-fn effect gave no write-off notice** (the `charge` effect does, B-09
  acceptance "reports the write-off") → the fn's result carries the same
  `toast.act.writtenOff`; its `paid` / `writtenOff` fields are unchanged.

## Named functions and rule helpers added for the wave-2 data (additive)

For the building, Pocket and front-end packages; CONTRACT §8.9 records are requested from the lead
in `docs/requests/W2-RulesE.md`.

- `items.room(key, n)`, `items.buy(key, n, where, value)` (above); `items.pillToggle` (effect: the
  Bag's caffeine-pill toggle flips `clock.pillAuto`, or sets `params.on`; GDD §6.4).
- `homes.channel(channel)` (above).
- `stocks.maybeReveal(source)` (effect, P1 `stockTips`): TV News, Mingle, Market Watch, the paper
  and Harold reveal today's tip with B-10's chances (`SR.rules.stocks.revealChance`: 0.60, 0.30 or 1
  with Regular, 1, 1, 1) and say so in a toast (`toast.stocks.tip`, en-econ); it draws nothing while
  the flag is off, without a tip or once the tip is known, so a P0 TV row can carry it.
- `endgame.retire` (effect) and `SR.rules.endgame.retire(s)` / `keepPlaying(s)` (GDD §4.19, §5:
  Retire ends an Unlimited or Keep-playing run with its results, reason `retire`; Keep playing
  continues an ended timed game unranked, keeping `state.result` of the original end for the Hall
  of Fame). `endgame.results` adds `achievements` (the count this run, UI §5.14).
- `SR.rules.state.roll(rng)` (the new-game wizard's orig roll: rand(1..10) per stat plus rand(3..9)
  extra, four draws of the caller's stream) and `SR.rules.state.fair()` (7 / 7 / 7 + 6), B-02.
- `SR.rules.training.left(s, id)`: views or uses left today (the TV sub-screen), null without a limit.
- `SR.rules.night.preview(s)` → `{ hp, pill, restore, gains }` (what tonight's sleep would restore
  and train, Winded judged on the restored HP as step 7 does) and `SR.rules.night.restoreHp(s,
  pill)` (the B-07 formula, now shared by night step 6): so the Sleep row's preview (W2-Home's
  `home.sleep` computes the formula itself today) can use the night's own numbers.
- Text keys: `reason.inStorage`, `reason.stackFull`, `reason.notOver`, `reason.timedGame` (en-prog);
  `toast.stocks.tip`, `report.unreadOne`, `report.jail.summaryMarket`, `report.loanDueTonight` (en-econ).

## Checks

- `tests/node/rulese.test.cjs` (new): the additions above, GDD §6.1 P0 rows through the pipeline
  with rows shaped like the wave-2 data (U of S, Sticky's beer and bottle, McSticks and store food
  with the employee discount, the Bag's smoke, the Full shift and the time wall), a 40-day rule-level
  run per difficulty (work, study, eat, buy the bed, TV, alarm and pills, sleep) reaching the results,
  a 40-day run with a store robbery (the Hold-up opened at 20:30, paid once), a red-eye smuggle and
  a fall at 5 HP (the hospital night), a debug-assisted election run on the real election rules
  (nomination, the 7 campaign nights, election night on the report, the office salary), the night
  foreseen (`night.preview` against the real night), the intra-day weather, every request applied
  above, and a 400-day Unlimited run (history thinning, day 365, reverse splits, the rate board).
- Updated suites: `state.test.cjs` (`casino.card`, 13 records), `jobs.test.cjs` (`reason.needAll`),
  `night.test.cjs` (the jail summary with the mover).
- A scratch fuzz of every registered action (117 at mid-wave, 175 at the end, the wave-2 data included; 60
  random states each; 176 on the resumed run): no preview mutated the state, none threw, and no run
  refused what its preview allowed.
- Resumed run: a probe of the real P0 rows of GDD §6.1 through the pipeline (McSticks, Five-O,
  pawn, Fine Line, bank, NLI, U of S, Sticky's, home, the Bag, the street cast: prices with B-28a,
  HP, time, the wall, the B-06 stacks, TV limits, the three difficulties, the rank table, the cheat
  name) matched GDD / BALANCE, save the unknown-rank case fixed above; index.html over file:// with
  a day of those rows through `SR.act` and a Sleep to the report: zero console errors.
- `node tools/run-all.cjs --jobs 2` on the resumed run: every Node suite of this desk passes; the
  failures are other owners' and filed (`invariants`: W2-City 1; `validate --selftest`: W2-Food 6 /
  W2-Money 5b; e2e `boot`: W2-Front 1; `a11y`: W2-Pocket 1; `world`: `W2-RulesE.md` 6; `minigames`,
  `stage`, `ui-kit`, `visual`: unchanged from the runs before the pause); `shuffle`, `card` and
  `art` failed only under the parallel load while other packages were saving files and pass alone;
  `slice` (strict) passes.
