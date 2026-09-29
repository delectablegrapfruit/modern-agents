# Requests from W1-E (Economy and life rules)

Each request: the file, the exact change, why, and the workaround used meanwhile (BUILD_PLAN §1.3).

## R1. `js/data/text/en-prog.js` (W1-R): the refusal reasons of the economy rules

**Change.** Add these `reason.*` keys (vars in braces are what the rules pass):

```js
'reason.amount': 'Enter an amount',
'reason.needBank': 'Need {money} in the bank',
'reason.loanOpen': 'Repay your loan first',
'reason.creditFrozen': 'Credit frozen until day {day}',
'reason.creditLimit': 'Credit limit {money}',
'reason.noLoan': 'No loan to repay',
'reason.cdMin': 'At least {money}',
'reason.cdMax': 'At most {n} CDs',
'reason.cdTotal': 'CDs are capped at {money} in all',
'reason.noCd': 'No such CD',
'reason.noTicker': 'Unknown stock',
'reason.maxShares': 'That is a lot of shares',
'reason.positionCap': 'Position cap {money}',
'reason.noShares': "You don't hold that many",
'reason.noHome': 'No such home',
'reason.owned': 'Already yours',
'reason.livingHere': 'You live here',
'reason.cantSell': "The bank won't buy the apartment",
'reason.cantLet': 'Nobody rents the apartment',
'reason.let': 'Already let out',
'reason.notLet': 'Not let out',
'reason.noPiece': 'Not sold here',
'reason.needPiece': 'Needs the {name} first',
'reason.needSlot': 'Needs a free slot',
'reason.maxTier': 'Already upgraded',
'reason.hired': 'Already hired',
'reason.notHired': 'Apply first',
'reason.topRank': 'Top of the ladder',
'reason.needShifts': 'Need {need} shifts at this rank (you: {have})',
'reason.needRating': 'Need a rating of {need} (you: {have})',
'reason.overtimeNotNow': 'Only right after a full shift',
'reason.noTraining': 'Not offered here',
'reason.needClasses': 'Need {need} classes (you: {have})',
'reason.graduated': 'Already graduated',
```

**Why.** CONTRACT §7 gives every `reason.*` key to `en-prog.js`; these are raised by
`js/rules/{bank,stocks,homes,jobs,training}.js`. `reason.needSlot` carries GDD §6.1's exact copy
("Needs a free slot"), distinct from W1-R's `reason.noSlots` of the `freeSlots` condition. The rules
reuse W1-R's `reason.needCash` `{ n, money }`, `reason.needStat` `{ stat, min, have }`,
`reason.dailyLimit`, `reason.weeklyLimit`, `reason.tooHurt`, `reason.featureOff`,
`reason.notOwned`, `reason.notLivingHere`, `reason.unavailable` with W1-R's vars.
**Meanwhile.** The keys render as `⟦reason.x⟧` and warn once (never an error).

## R2. `js/rules/state.js` (W1-R): `daily.shifts` and the day-1 history point

**Change.** (a) Add `shifts: 0` to `daily` in `defaults()` (the day's shift count; Motivation
Monday's "+1 CHA on the first shift", B-05 `mondayBonus`). (b) In `create()`, seed `history` with the
day-1 point in the shape the night appends: `history.nw = [[1, netWorth]]`, `str = [[1, str]]`, and so
on (`[day, value]` pairs; ARCHITECTURE §15's "one point per morning to day 120, then weekly" needs the
day with each point once it thins out).
**Why.** The first-shift test needs a daily counter the night resets; the results graphs need day 1.
**Meanwhile.** `jobs.work` treats a missing `daily.shifts` as 0 and the night's generic reset zeroes
it; the history starts on day 2.

## R3. `docs/CONTRACT.md` §8.6, §8.8 (lead): W1-E's public names beyond the table

**Change.** Add to the §8.6 rows (all implemented and tested):

- `SR.rules.bank`: `income(s, n, src, to)` → `{ credited, toLien }` (the lien rule for income the
  night credits), `paidRate(s)`, `cdPrincipal(s)`, `maturities(s)`, `lienSources()`.
- `SR.rules.stocks`: `quirkShock(t, facts)`, `reveal(s, source)`, `revealed(s)`, `spread(s)`,
  `tickers()`; the tip is `state.tip = { day, ticker, dir, truthful, size, pct, reliability,
  revealed: { tv, paper, market, mingle, harold } }`.
- `SR.rules.homes`: `freeSlots`, `has(s, base)` → tier in use, `pieces`, `removePiece`, `restock`,
  `channels(s)`, `nightly(s)`, `perk(s)`, `perkOk(s, homeId)`, `usePerk(s)`, `rentOf`, `saleOf`,
  `rents(s)`, `homesValue`, `furnitureValue`, `tierId(base, tier)`.
- `SR.rules.jobs`: `ladder`, `missingReason(p)`, `shiftCost(s, variant)`, `canWork(s, track,
  variant)`, `weeklyBonus(s)`, `legacyRank(s)`, `hustleSkin(s, track)` → `{ skin, step }`,
  `takeoverDue(s)`, `takeover(s, m)`.
- `SR.rules.training`: `can(s, id, opts)`, `classTrack(id)`, `canGraduate(s, track)`.
- `SR.rules.calendar`: `weekdayOf`, `eventDays`, `storm(s)`, `next(from, rng)`.
- `SR.rules.endgame`: `breakdown(s)`, `column(karma)`, `tier(nw)`, `banners(s, reason)`.
- `SR.rules.news`: `lead(s)`. `SR.rules.night`: `SUBSETS`, `steps` (numbered GDD §4.7 steps).
- `night.run(s, ctx, opts)`: `opts` also takes `bill`, `paid`, `writtenOff`, `cause` (the Stick
  General lines, from `health.down`) and `trace` (an array the step numbers are pushed to; tests).
- Report: an optional `achievements: [ids]` (step 12, when `achievements` is on). Down: `events`
  (the `down` rule event; `act.js` already reads it).
- Named fns (for the wave-2 building data): `bank.{deposit, withdraw, loan, repay, openCd, breakCd,
  charge, canLoan, hasLoan}` (params `amount` / `index`), `stocks.{buy, sell, reveal}` (params
  `ticker`, `n`, `where`), `homes.{buy, sell, moveIn, letOut, endLet, buyFurniture, upgrade, fits,
  perkHere, usePerk}` (params `homeId` / `piece`, or an argument), `jobs.{canWork, work, canPromote,
  promote, canApply, apply, hustleSkin}` (a track argument or `params.track`; `params.variant`,
  `params.m`), `shift.min` and `shift.hp` (costs by `params.variant`), `training.{apply, can,
  seminarOk, canGraduate, graduate}` (a source id argument; `params.track` for seminars).
  Module functions return partial Results whose `log` / `msgs` the pipeline's merge delivers
  (as `js/rules/effects.js` does); `deltas` in them are informational (the pipeline diffs).

Also freeze `SR.rules.effects.{run, addMsg, merge, partial}` (W1-R): `night.js` delivers its
voicemails through `addMsg` (one message id sequence and the 150 retention rule) and runs arc
effects through `run`.
**Why.** These are called across packages (building data, sub-screens, the report, the sim).
**Meanwhile.** Implemented as listed.

## R4. `docs/CONTRACT.md` §7 (lead): `vm.crew.*` → `en-econ.js`

**Change.** Add `vm.crew.*` (the day-365 call "from your friendly remaster crew", raised by night
step 11) to `en-econ.js` (W1-E) in the key-owner table.
**Why.** No NPC owns it and the night (a W1-E module) raises it (D27's rule for module-raised keys).
**Meanwhile.** `vm.crew.day365` is defined in `en-econ.js`.

## R5. `js/data/text/en-money.js` (W2-Money): Penny's loan voicemails

**Change.** Add `vm.penny.loan5`, `vm.penny.loan1` (vars `{ days, n, money }`) and
`vm.penny.default` (vars `{ n, money, lien }`).
**Why.** Night step 2 queues them (GDD §6.8 "loan warnings (5 and 1 days left)"; B-09 `loan.warn`);
`vm.<npc>.*` belongs to the NPC's file, and Penny Wise is the bank's.
**Meanwhile.** They render as `⟦vm.penny.loan5⟧`; the report's own `report.loanDays` line carries
the same facts.

## R6. `js/data/text/en-news.js` (W2-Home): the keys `SR.rules.news` returns

**Change.** Define `news.head.<kind>` for every B-29 kind plus `news.head.absurd` (arrays of
templates; vars are the log entry's vars plus `variant`), `news.tv.<kind>` (the TV news leading with
the same entry) and `news.story` (the 30 stories).
**Why.** `headline(s)` returns `{ key: 'news.head.<kind>' | 'news.head.absurd', vars }` (B-29) and
`tvStory(s, rng)` returns `news.tv.<kind>` or `news.story`; the template is picked by
`vars.variant`, a hash of the seed and the day (no rules draw).
**Meanwhile.** Missing keys render as `⟦news.head.absurd⟧` (warning only).

## R7. `js/rules/election.js` (W1-C): the split of night step 5

**Change (agreement, nothing to edit if it matches).** `night.js` does step 5's bookkeeping from
`tuning.election`: on a campaign night the rival's `-rand(1..3)`, `campaignDay += 1`, the debate
no-show (`debate.noShow`) when `campaignDay` becomes 5 without `debateDone`, and the lapse of an
unaccepted nomination (`acceptWithin`, then `retryFromDay = day + retry`). After campaign day 7 it
calls `SR.rules.election.electionNight(s, rng)` and expects a partial Result `{ won, poll, roll,
path, events?, msgs?, log? }` that also sets the status (office / lost); msgs and log are delivered
by the night. At step 12 it calls `nominationCheck(s)` and, in office, `officeMorning(s, rng)`,
absorbing any partial Result. `campaignDay` is 1 on the first campaign day. Decree ids are the
camelCase keys of B-17 (`casinoLevy`, `statueOfMe`, `mandatoryHats`, `toughOnCrime`, `fourDayWeek`,
`seizeBank` in `decreesUsed`), as `tuning.priceMods` uses them.
**Why.** GDD §4.7 puts these nightly rules in the night; W1-C's functions then need not apply the
rival's gain or the no-show a second time.
**Meanwhile.** The night test stubs the election functions.

## R8. `js/rules/crime.js` (W1-C): jail release

**Change (agreement).** The jail night (step 10) decrements `jail.daysLeft` and increments
`jail.served`; releasing (`jail = null`, Heat 20, the `release` event, 08:00 outside City Hall)
stays with `SR.rules.crime.jailDay` when `daysLeft` reaches 0.
**Why.** GDD §4.7 names only the decrement in the jail subset.

## R9. `docs/BALANCE.md` B-10 (lead): the EV table's INT 100 row

**Change.** The implemented tip shock is a log return (B-10 `tick`), so a true 3-5 % tip moves the
price by e^s - 1 (4.08 % on average) and a false one by 1 - e^(-s/2) (1.98 %). The exact EV per "up"
tip is $61 at INT 100, $274 at 250, $931 at 500 and $1,714 at 999; the table's rounding (4 % / 2 %)
gives $50 / $250 / $890 / $1,640. Rows 250-999 are within 10 %, but INT 100 is a small difference
of large terms (+22 %). Proposed rows: $60 / $275 / $930 / $1,715 per up tip, $30 / $135 / $465 /
$855 per market day.
**Why.** `tests/node/stocks.test.cjs` reproduces the table by simulation (±15 %); the simulation
matches the exact values within 5 % at every INT, and matches the table at 250-999.
**Meanwhile.** The test checks INT 100 against the table at ±$15 and the exact EV at ±5 %.

## R10. `docs/CONTRACT.md` (lead): the Fold's flag for the MET THE ARTIST banner

**Change.** Name the state flag that marks the Theory of the Fold finished; W1-E reads
`state.flags.foldDone` in `endgame.banners`.
**Why.** B-18's MET THE ARTIST banner; W3-Park sets it.
**Meanwhile.** `flags.foldDone`.

## R11. `js/art/icons.js` (W1-A): two item icons

**Change (optional).** Icons `coupon` (the flyer coupon) and `shirt` (Harold's clean shirt).
**Why.** ART_AUDIO §10 lists neither; the items use `money` and `star` meanwhile.
