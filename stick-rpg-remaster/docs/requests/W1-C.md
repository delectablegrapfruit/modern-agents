# Requests from W1-C (Conflict and chance rules), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-3 are state and contract changes for the lead and W1-R; items 4-6 ask
other packages for small changes; item 7 moves numbers to `tuning.js`; item 8 asks for reason keys;
items 9-11 are records (additive public names, keys other files must define, how the wave-2
consumers should call the rules); item 12 is a balance note.

## 1. State schema v1: four "in progress" fields (W1-R `js/rules/state.js`, lead: ARCHITECTURE §6.1)

- **Change:** add to `defaults()`: `trade.offer: null`, `fight.open: null`, `casino.match: null`,
  `crime.open: null`.
  - `trade.offer` — the trip waiting for a decision: a smuggling offer `{ kind: 'smuggle', city, day,
    outcome: 'offer', want, units, perUnit, total, key, vars, ... }` (Take it / Haggle / Walk away) or a
    booked tour `{ kind: 'tour', city, day }` waiting for its hook's result.
  - `fight.open` — the fight in progress `{ kind, n, k, fighter, day }` (the wallet depends on the rung).
  - `casino.match` — a darts match in progress `{ tier, stake, day }`.
  - `crime.open` — the robbery in progress `{ target, day }` (set by the start, closed by the resolve).
- **Why:** a minigame result carries only its CONTRACT §13 shape (`{ outcome, hpLeft }`, `{ score }`,
  the Duel's beats), not the run params, so the `:resolve` actions need these facts from the state;
  they must also survive a save (Hardcore's `pending.worst` is resolved after a reload, and the trip's
  event card is a decision the player may reload into). They are also the guard that makes every
  resolve pay once: the named resolve fns (`crime.robResolve`, `fight.resolve`, `casino.dartsMatch`,
  `trade.tour`, and `trade.take` / `trade.haggle` / `trade.walk`) refuse with `reason.notNow` unless
  today's start is still open, and close it (W1-C review). A stray or repeated `:resolve` therefore
  never pays loot, a wallet, a purse, a match or a fee for something that did not start.
- **Meanwhile:** `js/rules/{crime,trade,fight,casino}.js` create the fields when needed and treat a
  missing one as `null`; `SR.util.deepFill` keeps unknown fields, so saves round-trip. The open
  record's facts (target, kind, rung, bout, tier, stake, city) win over anything the result echoes.

## 2. `js/rules/effects.js` (W1-R): pass the context to `SR.rules.crime.jail`

- **Change:** in the `jail` effect, `var r = C.jail(s, reason, ctx);` (today: `C.jail(s, reason)`).
- **Why:** `crime.jail` runs the arrest night at once (GDD §4.10), which draws from `ctx.rng`; without
  it the night falls back to `SR.rng.rules`, so a pure `SR.rules.act.run(s, id, params, ctx)` with its
  own stream (the balance simulator, tests) draws the arrest night from the wrong stream.
- **Meanwhile:** data should use the named fn `['fn', 'crime.jail', reason]`, which passes `ctx`.

## 3. `js/rules/night.js` (W1-E): the campaign events' morning hook

- **Change:** at step 12, after `nominationCheck`, `if (E && typeof E.campaignMorning === 'function')
  absorb(s, R, E.campaignMorning(s, ctx.rng));`.
- **Why:** B-17 `eventChance` (P1 `civicPlus`): 40 % of campaign days bring one of the 12 campaign
  events; the night is the only place that runs every morning with the rules stream.
- **Meanwhile:** `SR.rules.election.campaignMorning(s, rng)` exists and is tested.
- **Status (W1-C review):** W1-E's working copy of `js/rules/night.js` now absorbs it at step 12 on a
  campaign morning, as asked; nothing is left to do here once W1-E's copy is merged.

## 4. `js/core/rng.js` (W1-K): hold `Math` in a local

- **Change:** `var M = Math;` at the top of the IIFE and `M.ceil / M.min / M.floor / M.max` in `int()`.
- **Why:** in Node's `vm` contexts (every Node suite and the balance simulator) each global lookup
  costs about 150 ns; `int()` does five, so it takes about 0.8 µs instead of about 20 ns. Measured:
  10⁷ `int` calls 7.7 s. The W1-C and W1-E Monte Carlo tests and B-23's simulator all lean on it.
- **Meanwhile:** `js/rules/casino.js` shuffles with `rng.next()` and the same formula as `int()` (the
  same single draw and the same value), and `js/rules/{casino,fight}.js` hold `Math` locally; the
  4 × 10⁶-hand blackjack test runs in about 2 s.

## 5. Stepping into the city runs the nomination check (W1-W / W2-City)

- **Change:** when the player steps into the city (the city scene's entry, orig), run an action whose
  effect is `['fn', 'election.check']` (silent, `timeRule: 'free'`), e.g. a `world.city` action in
  `js/data/actions/world.js`.
- **Why:** GDD §4.17: the nomination is checked every morning (the night does it) and whenever you step
  into the city (the original checked it only there).
- **Meanwhile:** the morning check alone.

## 6. The Public Library Act on U of S Study (W2-Civic `js/data/buildings/uofs.js`)

- **Change:** Study's gain as `['stat', 'int', 'decree.studyGain']` (a numeric argument may name a
  named fn): it returns `tuning.training.study.gain`, or 3 while the decree is active.
- **Why:** GDD §4.17's Public Library Act ("Study gives +3 INT"); every other decree bites in the file
  that already reads it (priceMods, the night, jobs, bank, world).
- **Status (W1-C review):** W1-E's `SR.rules.training.gain(s, 'study')` already reads
  `decree.studyGain` (tested in `training.test.cjs`); W2-Civic's Study row only has to use that gain.

## 7. `js/data/tuning.js` (W1-R) and BALANCE: numbers W1-C holds as named constants or data

| Proposed key | Value | Now | Source |
|---|---|---|---|
| `fight.quirks.wobbly.miss` | 0.30 | `js/data/fighters.js` quirk data | GDD §6.3 Wobbly Pete |
| `fight.quirks.pyro.fireballOdds` | 2 | fighters.js | GDD §6.3 The Professor |
| `fight.quirks.iron.armor` | 0.30 | fighters.js | GDD §6.3 Iron Irma |
| `election.publicLibrary.study` | 3 | `PUBLIC_LIBRARY_STUDY` in election.js | GDD §4.17 |
| `election.universalFries.karma` | 10 | `UNIVERSAL_FRIES_KARMA` in election.js | GDD §4.17 |
| `election.cityNameMax` | 16 | reuses `start.nameMax` | GDD §4.17 (a TextField) |
| `casino.darts.autoWindowSec` | 600 | `AUTO_WINDOW_SEC` in casino.js | B-14f "a uniformly random time" |

The darts window only has to be much longer than the wobble's periods; with it the Auto samples
reproduce B-14f's reference (INT 100: mean 144.8, P(≥ 160) 0.248; INT 300: 165.4, 0.495, P(≥ 230)
0.005; INT 600: 187.2, 0.830, 0.078).

## 8. Reason keys (W1-R `js/data/text/en-prog.js`)

- **Change:** add `reason.redEye` ("The red-eye leaves at {time}"), `reason.barred` ("Lucky Lou has
  backed you off until day {day}"), `reason.badBet` ("That bet is not on the table").
- **Why:** clearer refusals for the bus board, blackjack after a back-off and invalid casino bets.
- **Meanwhile:** `reason.notNow` (with `vars.time` / `vars.day`) and `reason.unavailable`.

## 9. CONTRACT §8.6: the additive public names of W1-C (record)

Nothing frozen changes. Additions (all pure; an optional trailing `rng` / `ctx` where a rule draws):
- `SR.rules.crime`: `holdupD`, `holdupChances`, `holdupAuto(s, params, rng)` (the Duel's Auto policy
  as a rules sample), `recentBankRobberies`, `rob(s, target, ctx)` (the start), `jailDays`, `bailBase`,
  `release`, `canBail`, `talkChance`, `bribeCost`, `interrogation`, `mchollandTip`, `mchollandBribe`,
  `JAIL_CHOICES`; `jail(s, reason, ctx)`, `jailDay(s, choice, ctx)`, `policeRun(s, caught, ctx)`.
  `holdupParams` returns `{ target, D, check: 'holdup.<target>', beats, need, bestOf, stake: true,
  options, chances }` (W1-M's request 9).
- `SR.rules.trade`: `cityIds`, `ticket`, `demand`, `dailyDemand`, `tourDemand`, `reputation`,
  `bustThreshold`, `busted`, `screwedChance`, `mugChance`, `offerPerUnit`, `offerMult`, `board`,
  `smuggle(s, city, ctx)`, `pending(s)`, `walk`, `tourBase`, `tourFee`, `tourParams`, `tourStart`.
- `SR.rules.fight`: `MOVES`, `ap`, `nextN`, `opponent`, `moves(f)` (cost, range, EV, allowed),
  `range`, `expected`, `run(f)`, `autoMove`, `result`, `start`, `resolve`, `canStart`.
- `SR.rules.casino`: `slots.{SYMBOLS, LINES, strip, pays(s), line, enumerate, hitRate, round}`;
  `bj.{rank, value, total, hilo, reshuffle, draw, shoeOf, validShoe, canDouble, canSplit, hand,
  wagered, playBook, round}`; `roulette.{DOUBLE_ZERO (37 = 00), OUTSIDE, covers, isRed, legal, round}`;
  `scratchPrize`, `scratchEV`, `scratchRound`; `darts.{amp, params, practice, matchStart, match,
  AUTO_WINDOW_SEC}`; `vipDrink`, `canPlay`, `applyRound`.
- `SR.rules.election`: `ACTIONS`, `RIVAL`, `clampPoll`, `qualifies`, `chestTier`, `startPoll`,
  `canCampaign`, `actionChance`, `canDebate`, `debateParams`, `debateStart`, `campaignMorning`,
  `remove`, `eligible`, `decreeName`.
- **Named fns:** `crime.{canRob, rob, robResolve, jail, jailDay, canBail, bailCost, payBail, fine,
  policeTalk, policeBribe, policeRun, interrogation, mchollandTip, mchollandBribe}`; `trade.{canBoard,
  ticket, smuggle, take, haggle, walk, tourStart, tour, demand}`; `fight.{start, resolve, canStart}`;
  `casino.{canPlay, slotsSpin, bjHand, rouletteSpin, scratch, dartsPractice, dartsMatchStart,
  dartsMatch, vipDrink, settle}`; `election.{check, qualifies, accept, canCampaign, campaign, cash,
  min, canDebate, debateStart, debate, decree}`; `decree.{seizeBank, universalFries, renameCity,
  studyGain}`.
- **Rule-event payload extras** (fields added to the frozen payloads): `trip` adds `key`, `vars` (the
  event card's story), `mugged` (tours); `gamble` adds the round's facts (`reels`, `stops`, `line`,
  `mult`; `pocket`, `wins`; `hands`, `suspicion`, `backedOff`, `barredUntil`; `tier`, `score`; `pay`,
  `roll`).
- **Decree ids are camelCase** (`casinoLevy`, `toughOnCrime`, `seizeBank`, ...), against the
  snake_case rule for content ids, because `tuning.priceMods`, the night, jobs, bank and the world
  already read B-17's key names.

## 10. Text keys W1-C names that other files define (for the lead to pass on)

- `vm.board.nominated`, `vm.board.impeached`, `vm.board.coup`, `vm.doodle.concede`,
  `vm.doodle.gloat`, `vm.crayon.concede`, `vm.crayon.gloat` — W2-Civic (`en-civic.js`). Vars:
  `path`, `days`, `day`, `poll`.
- `mg.holdup.intimidate`, `mg.holdup.sweetTalk`, `mg.holdup.outwit` — the holdup skin (W2-Food).
- `taunt.<fighter>.1..3` for the 17 fighter ids of `js/data/fighters.js` — W2-Night (`en-night.js`).
- `news.head.<kind>` for the log kinds W1-C writes: `storeRobbery`, `bankRobbery`, `jailed`,
  `busted`, `smuggleDeal`, `tour`, `fightWin`, `champion`, `ringWin`, `jackpot`, `casinoBig`,
  `nominated`, `electionWon`, `electionLost`, `removed`, `decree` — W2-Home (`en-news.js`).
- The morning report's election lines use W1-C's own `toast.election.*` keys (≤ 80 characters), so
  no `report.*` key of `en-econ.js` is needed.

## 11. How the wave-2 packages call the conflict rules (record for W2-Food, W2-Money, W2-Night, W2-Transit, W2-Civic)

- **Robberies:** the row `{ timeRule: 'robbery', requires: [['fn', 'crime.canRob', 'store']], effects:
  [['fn', 'crime.rob', 'store']], confirm: 'crime.rob.confirm.store' }` and its `:resolve`
  `{ timeRule: 'free', effects: [['fn', 'crime.robResolve', 'store']] }`; the same with `'bank'`.
- **Fights:** `{ cost: { min: 180 }, effects: [['fn', 'fight.start', 'bar']] }` and `:resolve` with
  `['fn', 'fight.resolve', 'bar']`; the engine plays `Result.open.params.fight` with
  `SR.rules.fight.{playerMove, endTurn, run}` and `host.rng`, its `auto` is
  `SR.rules.fight.autoPlay(state, params.fight, rng)`, and its result may add `choice: 'drink'` (P1).
- **Casino:** the engines apply each round with `SR.act` on rows calling `casino.slotsSpin` (params
  `{ bet }`), `casino.bjHand` (`{ bet, net, wagered, trueCount, shoe }` — `wagered` is the round's
  whole stake, `bj.wagered(round)`, so a double or a split earns its VIP points — or `{ round, shoe,
  trueCount }` after playing on a copy of `SR.rules.casino.bj.shoeOf(state)`), `casino.rouletteSpin`
  (`{ bets }`; a pocket is a whole number 0-36 or `'00'`), and
  read the round's facts from the `gamble` event of the Result; the minigame's `{ net }` resolve then
  needs no money effect. `casino.settle` with `params.apply` applies a whole session at once instead.
- **Darts (Sticky's):** practice rows call `casino.dartsPractice` (`cost: { min: 30 }`); a match row
  (P1) calls `casino.dartsMatchStart` (params `{ tier, stake }`, `cost: { min: 60 }`), and its
  `:resolve` `['fn', 'casino.dartsMatch']` with the engine's `{ score }` pays the match stored in
  `state.casino.match` (tier and stake as paid; an echoed tier or stake is ignored).
- **Trips:** the bus board's rows call `trade.smuggle` (params `{ city }`, `timeRule: 'trip'`; with
  `cost: { cash: 'trade.ticket' }` the row shows the ticket as a chip and the fn does not take it
  again, likewise `election.campaign` with its cost fns); an
  offer waits in `state.trade.offer` for rows calling `trade.take`, `trade.haggle` (P1), `trade.walk`;
  final outcomes arrive as the `trip` event with the story's key and vars. Tours: `trade.tourStart`
  and its `:resolve` `['fn', 'trade.tour']`.
- **Jail:** the Jail Day card's rows call `crime.jailDay` (params `{ choice: 'str' | 'int' | 'cha' |
  'hp' }`) and `crime.payBail` (P1); the Result carries the night's `report`; `release` in its events
  means the jail scene places the player outside City Hall at 08:00.
- **City Hall:** `election.accept` (params `{ chest: 0 | 1 | 2 }`), campaign rows with `cost: { cash:
  'election.cash', min: 'election.min' }`, `requires: [['fn', 'election.canCampaign']]` and
  `effects: [['fn', 'election.campaign']]` (the campaign action is the id's last segment:
  `cityhall.rally`), the debate's `election.debateStart` / `election.debate`, the Mayor's Office
  `election.decree` (params `{ id, name }`).

## 12. Balance note for the lead and W3-Balance (no change requested now)

- B-14b's pit boss adds +1 for any hand of ≥ $20 at a true count ≥ +2, so a player who flat-bets $25
  is suspected in the same high-count runs as a counter: on one fixed shoe over 600 hands, a flat $25
  player and a $5-$100 counter were both backed off on hand 237. If that feels unfair, the +1 could
  require the bet to have risen since the previous hand.
- The Quick-fight Auto against the ladder (400 fights per cell, fresh characters of the given STR):
  rung 1 is won 95 % at STR 7; rung 3 needs STR ≈ 40; rung 6 ≈ 60 (83 %); rung 12 ≈ 100 (63 %).
