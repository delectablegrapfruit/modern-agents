# Requests from W2-RulesE (rules desk: kernel and economy), wave 2

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). The desk's own decisions on requests addressed to it are in
`docs/requests/decisions-w2-W2-RulesE.md`.

## 1. `docs/CONTRACT.md` §8.4 / §8.9 and ARCHITECTURE §6.4 / §6.11 (lead): record the wave-2 additive rule names

- **Change:** nothing frozen changes; add to §8.9 (and the matching ARCHITECTURE §6.11 lists):
  - **Named fns for data:** `items.{room, buy, pillToggle}` (`['fn', 'items.room', key, n]` a
    condition: n more fit the B-06 stack, reasons `reason.stackFull` / `reason.haveItem`;
    `['fn', 'items.buy', key, n, where, value]` an effect: puts n in the Bag within the stack and
    raises `buy { item, n, where, price }` with the price paid after B-28a, n defaulting to
    `params.n` or 1; `items.pillToggle` flips `clock.pillAuto` or sets `params.on`);
    `homes.channel` (a condition: `'news' | 'fitness' | 'dating' | 'market'` can be watched);
    `stocks.maybeReveal` (an effect, P1 `stockTips`: a source reveals today's tip with its B-10
    chance and a `toast.stocks.tip`; no draw while the flag is off, without a tip or once known);
    `endgame.retire` (an effect: ends an Unlimited or Keep-playing run, `over.reason` `retire`).
  - **Module names:** `SR.rules.state.{roll(rng), fair()}`; `SR.rules.training.left(s, id)`;
    `SR.rules.stocks.revealChance(s, source)`; `SR.rules.endgame.{retire(s), keepPlaying(s)}`;
    `SR.rules.night.{preview(s), restoreHp(s, pill)}`; `SR.rules.calendar.intraday(s, from, to, rng)`
    (P1 `weather`, called by the pipeline as an action's time passes 12:00 / 18:00);
    `SR.rules.effects.{room(s, key), addItem(s, key, n, value, ctx), gainStat(s, key, n, src, ctx, res)}`; `endgame.results(...)` adds
    `achievements` (the count this run).
  - **Condition semantics (§8.4):** `furniture(id, minTier)` holds only for a piece **in use** in
    the home you live in (not in storage; the satellite needs the TV in use); a tier-2 id names its
    base at tier 2; a stored piece refuses with `reason.inStorage`.
- **Why:** the wave-2 building, Pocket and front-end packages call them (decisions file, "Named
  functions and rule helpers"); the furniture reading is GDD §4.15 ("pieces in storage do
  nothing").
- **Meanwhile:** all are live in the tree and tested (`tests/node/rulese.test.cjs`); the files'
  JSDoc documents them.

## 2. `docs/CONTRACT.md` §8.7 / §8.9 / §9.2 and ARCHITECTURE §6.2 / §13 (lead): when SR.act emits `game:over`

- **Change:** §8.9's "`SR.act` ... derives `perk:offered`, `election:changed` and `game:over`" gains:
  "except when the game ends in a night the report scene presents (`Result.report` of kind `sleep`,
  or `Result.down.report`): the report scene emits `game:over` after the last page; `Result.over`
  is set either way. A jail night's end (kind `jail`) and a death at HP 0 are emitted by `SR.act`."
  Also record the pipeline's new step between the arcs and the HP-0 hook: the intra-day weather
  (`SR.rules.calendar.intraday`, P1 `weather`) when the action's time passes 12:00 or 18:00.
- **Why:** W2-Home request 1 (the Final Edition before the results, GDD §4.7 / §4.16); the jail
  exception keeps the Hardcore ironman deletion (`save.js` listens to `game:over` with `death`) for a
  loan default found by a jail night, whose card goes to the results without the report scene.
- **Meanwhile:** live in the tree, tested in `tests/node/rulese.test.cjs`; `tests/e2e/{home,hospital,
  jail,slice}.test.cjs` pass.

## 3. `docs/BALANCE.md` B-14 (lead): mirror the table chips

- **Change:** add a row to B-14 (after B-14c): "`chips` *(w2)* | [5, 25, 100, 500] | the blackjack and
  roulette chips (GDD §2.1, §6.5)".
- **Why:** W2-Night request 5, applied in `js/data/tuning.js` (`tuning.casino.chips`); BALANCE
  mirrors tuning key for key.
- **Meanwhile:** the row lives in `tuning.js` with a comment citing the GDD.

## 4. ARCHITECTURE §6.1 / CONTRACT §8.8 (lead): two additive state fields

- **Change:** add to the v1 schema (additive, deep-filled; the version stays 1): `casino.card: null`
  (the scratch card being revealed `{ roll, pay, tier, day }`, one of the "in progress" records:
  W2-RulesC request 3), `npc.kid.diedDay: 0` (the day of the tenth pack, W2-Street request 6) and
  `records.meals: 0` (the `eat` rule events, counted by the pipeline after the arcs: W2-Pocket
  request 5; also a line for ARCHITECTURE §6.2's pipeline).
- **Why:** `js/rules/state.js` `defaults()` has both now, so the save's deep-fill gives older saves
  their defaults; the schema text is the lead's.
- **Meanwhile:** in the tree; pinned in `tests/node/state.test.cjs` (`casino.card`).

## 5. `docs/BALANCE.md` B-09 and GDD §4.8 (lead): when a default's "HP = 1" applies

- **Change:** B-09 `default.standard` → "seize + lien + penalty; HP set to 1 at night step 2, before
  the night's restore (step 6)"; GDD §4.8 "HP drops to 1" → "HP drops to 1 (the night's sleep then
  restores as usual)".
- **Why:** W2-Money request 4b asked which reading holds; the rules follow GDD §4.7's step order
  (the bank at step 2, the restore at step 6), and `tests/e2e/bank.test.cjs` pins it.
- **Meanwhile:** the behaviour as described; documented in `decisions-w2-W2-RulesE.md`.

## 6. `tests/e2e/world.test.cjs` (W1-W's; the lead's in wave 2): the fall samples meet the traffic (an observation)

- **Change:** in the "edges: 200 falls" section, keep the traffic out of the 120 steps after each
  landing (pause or clear W2-City's `SR.world.traffic` for the section, as the section already
  resets the fall and the doors), or judge the HP of a fall from `records.falls` and the fall's own
  Delta rather than `hp0 - tuning.world.fall.hp`.
- **Why:** with W2-City's traffic live, samples 16, 176 and 181 land and are then hit by a car
  (`records.carHits` +1, a `carHit` log entry, HP -10 more), so "every fall costs 10 HP and no
  time" fails although the fall itself cost exactly 10 HP and no time (reproduced with the check
  instrumented; the rules' `world.fall` and `world.carHit` both behave as B-15 says). Sample 182
  (480, 1319) not falling is the same section, likely a car or a walker in the approach.
- **Meanwhile:** nothing in this desk's files; the suite reports 74 passed, 3 failed.

## 7. `js/ui/screens/saveload.js` (W2-Front), `js/ui/screens/jail.js` and `js/scenes/hospital.js` (W2-Transit): an ended Keep-playing run is over

- **Change:** read "the game is over" as `s.over` alone: `saveload.js` `resume()` (`s.over &&
  !s.mode.keepPlaying` → `s.over`), `jail.js` (`v.mode = 'over'`) and `hospital.js` `leave()`
  (`s && s.over && !s.mode.keepPlaying` → `s && s.over`).
- **Why:** `SR.rules.endgame.keepPlaying` clears `over` when a timed game continues, so `over` is
  set again only when the Keep-playing run itself ends: a Retire from the pause menu, or a Hardcore
  death (HP 0 or a loan default; GDD §4.19 *Deceased*). With `!keepPlaying` in the test, a Hardcore
  death in a Keep-playing run leaves the ward for the city instead of the results, and a save of a
  retired Keep-playing run resumes in the city. The pipeline now refuses every action once `over`
  is set (review fix below; before it, a retired Keep-playing run went on playing).
- **Meanwhile:** `SR.act` / `SR.preview` refuse with `reason.gameOver`, so nothing can change the
  ended run; only the screens route wrongly.

## 8. ARCHITECTURE §6.2 / CONTRACT §8.1 (lead): two pipeline details from the review

- **Change:** record in the pipeline text: (a) an action that goes through clears `job.lastFullEnd`
  unless it set it (a Full shift), so Overtime follows a Full shift "with no other action in
  between" (B-05, GDD §4.6); (b) a `stat` rule event derived from the Deltas leaves out the gain a
  night Report in the Result (`Result.report`, `Result.down.report`) raised itself, because the
  report scene, the jail and the hospital re-emit that Report's events (§8.7).
- **Why:** (a) with only `lastFullEnd == now`, a McSticks Full shift opened a CEO's Overtime at NLI
  (walking is free: $900 for a cook's shift); (b) the furniture's nightly gains were emitted twice
  (once by `SR.act`, once by the report scene).
- **Meanwhile:** live in `js/rules/act.js`, pinned in `tests/node/rulese.test.cjs` ("review fixes").
