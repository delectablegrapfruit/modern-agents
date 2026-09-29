# Requests from W1-R (Rules kernel), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-4 ask for changes in lead-owned files; items 5-7 are records of additive
public names for the lead to fold into `docs/CONTRACT.md`; item 8 is for W1-Q; items 9-11 are
decisions the lead should confirm; item 12 is for W1-E.

## 1. BALANCE.md: document the numbers the kernel needs that BALANCE does not tabulate

- **File:** `docs/BALANCE.md` (lead).
- **Change:** add these keys to the tables named:
  - B-02 `start.heatRange` = [0, 100] and `start.buzzRange` = [0, 5] (GDD §4.2 states both ranges).
  - B-01 `time.weekdays` = mon..sun (the names conditions accept), `time.skateContestMin` = 120 (the
    B-01 row states "120 min" in prose), `time.buzzDecayMin` = 120 (GDD §4.2: Buzz -1 per 2 game
    hours; added in the W1-R review, used by `SR.rules.time.spend` / `setTo`).
  - B-03 `training.degree.tracks` = { biz: int, kin: str, thr: cha } (the degree bonus needs the
    track → stat map), `training.winded.min` = 1.
- **Why:** BUILD_PLAN §1.7: every rule number lives in `SR.tuning`; these are already in
  `js/data/tuning.js` (W1-R owns it) and BALANCE should mirror it key for key.
- **Meanwhile:** the keys exist in `tuning.js` with a "(GDD, not in BALANCE)" comment.

## 2. A tuning home for the stat-check clamp (0.05..0.95, D ≥ 1)

- **File:** `docs/CONTRACT.md` §3.6 (lead) and then `js/data/tuning.js` (W1-R / W2-RulesE).
- **Change:** either allow a 34th table `check: { min: 0.05, max: 0.95, dMin: 1 }` (B-28b's formula
  numbers, GDD §4.3's difficulty names could join it: easy 25, medium 75, hard 200, heroic 500), or
  confirm that these three formula constants stay named constants in `js/rules/check.js`.
- **Why:** the 33 table names are frozen and `checkMods` is a list of rows, so there is no key to
  put the clamp in without a contract change.
- **Meanwhile:** `CHANCE_MIN`, `CHANCE_MAX`, `D_MIN` in `js/rules/check.js`.

## 3. A tuning home for the inbox size and the stamp threshold

- **File:** `docs/BALANCE.md` / `docs/CONTRACT.md` (lead), then `js/data/tuning.js`.
- **Change:** add `news.msgMax` = 150 (ARCHITECTURE §15 retention) and a UI feedback threshold
  `training.stampMin` = 2 (UI §4.3: "a Stamp plays for stat gains ≥ 2"), or confirm they stay
  constants.
- **Why:** `js/rules/effects.js` prunes the inbox on delivery (so the 150 cap holds between saves,
  with the same rule as the save's retention) and raises `stamp.stats.<stat>` for gains ≥ 2.
- **Meanwhile:** `MSG_MAX` and `STAMP_MIN_GAIN` in `js/rules/effects.js`.

## 4. BALANCE key names that differ in tuning.js

- **File:** `docs/BALANCE.md` (lead).
- **Change:** B-31's key `hospital.hp` is `health.hospital.hpPct` in tuning (W1-E's night reads that
  name); B-18's rank table is `endgame.ranks` (the floors) and `endgame.column` (the karma columns);
  the forecast accuracy of B-19 is `weather.forecastAccuracy`. Either note these names in BALANCE or
  ask for a rename in wave 2 (W2-RulesE and the night change together).
- **Why:** W1-E and W1-R converged on these names during the wave; renaming again now would break
  W1-E's `night.js`, `calendar.js` and `endgame.js`.
- **Meanwhile:** the names above; `tests/node/tuning.test.cjs` pins them.

## 5. CONTRACT §8: additive names of the rules kernel (record them)

- **File:** `docs/CONTRACT.md` §8.1, §8.4-§8.6 (lead). Nothing frozen changes; these are additions.
- `SR.act(id, params, opts)`: an optional `opts.source` ('ui' default, 'sim', 'debug').
- `SR.rules.state.VERSION` (1).
- `SR.rules.time.weekdayOf(day)`, `dayIndex(nameOrIndex)`, `left(s)`.
- `SR.rules.stats.gain(s, key, n, src)` (what a gain would do, no mutation), `column(k)` (B-18 rank
  column), `KEYS`; `add(s, key, n, src, out)`: an optional `out` receives the `stat` rule event for
  callers outside the pipeline (the night). **Gain sources:** 'train' (default: degree bonus and
  Winded), 'furniture' (Winded only), 'fixed' (neither), any other ('reward', 'decree', ...: the
  degree bonus only).
- `SR.rules.log.weight(kind)`.
- `SR.rules.perks.update(s)` (queues due offers; called by `stats.add`), `optionsFor(stat, level)`.
- `SR.rules.check.mods(s, checkId)`, `match(glob, id)`, `matchAny(globs, id, except)`,
  `rowApplies(row, s, ctx)`.
- `SR.rules.conditions` = `{ names, eval(s, cond, ctx), all(s, list, ctx), num, count, path, nameOf,
  label, holds, rankIndex }`; `SR.rules.effects` = `{ names, run(s, list, ctx, res?), one, merge,
  partial, isPartial, credit, charge, addMsg, pruneMsgs, MSG_MAX }`. `effects.run(s, list, ctx)`
  without `res` returns a partial Result (W1-E's night and W1-W's world fns use it).
- `SR.rules.act.GROUPS`, `actions(owner)` (ids in card order, `:resolve` left out), `snapshot(s)`,
  `diff(a, b)`.
- Named fns registered by W1-R: `mods.param`, `mods.decree`, `mods.atLeast`, `mods.redWeek` (B-28a
  rows) and `perks.choose` (params.id).
- Effect arguments beyond ARCHITECTURE §6.4: `stat(key, n, src)`, `item(key, n, value)` (list items
  push / remove `value`), `toast(key, vars, kind)`; numeric arguments may name a named fn.
- `timeRule: 'trip'` applies B-01's boarding windows by the trip's kind, read from `params.kind` (or
  `params.variant`) in the `trip` event's vocabulary: `'smuggle'` (also `'redeye'`) boards only at
  `time.redEyeDeparts` (00:00; reason `reason.redEye`, "Buses leave at 00:00", UI §10), `'tour'` at
  06:00-10:00 inclusive (`time.tourWindow`; `reason.tourWindow`); without a kind any time before the
  wall (`reason.dayOver` at 24:00). W2-Transit's bus board passes the kind; W1-C's `trade.canBoard`
  may check the same windows.

## 6. CONTRACT §8.3 / §8.5: how the pipeline treats a named fn's partial Result

- **File:** `docs/CONTRACT.md` §8.5 (lead).
- **Change (record):** `ok: false` refuses the action and rolls the state and the stream back;
  returned `msgs` and `log` entries are *delivered* by the pipeline (a fn returns them instead of
  adding them itself), except the entries of a partial Result built by `SR.rules.effects.run(s,
  list, ctx)`, which that call delivered already and the pipeline only reports; `deltas` are ignored (the pipeline computes every delta by diffing the state,
  so changes made by any path are reported once); `report` is a set field like `open` (for a sleep
  action to hand its night Report to the UI); `chance` is read by previews only.
- **Also record:** a Preview carries `id`; hidden previews are `{ id, hidden: true }`; a Preview gain
  may carry `from` / `to` for non-numeric deltas; `SR.act` emits `action:done` for refusals too
  (`result.ok` is false), and derives `perk:offered`, `election:changed` and `game:over`; the `down`
  rule event comes from `Down.events` when `health.down` supplies it (W1-E's does), else the
  pipeline adds it.

## 7. Price modifier `value` may name a named fn

- **File:** `docs/CONTRACT.md` §8 / ARCHITECTURE §6.10 (lead).
- **Change (record):** a `priceMods` row's `value` may be a named fn's name (`redWeek` uses
  `mods.redWeek`: rand(90..110)/100 derived from hash(seed, 'redWeek', week), so it needs no state
  field and holds all week); rows may carry `feature`, `except`, and `consume` + `item`.

## 8. W1-Q: the validator's vocabulary and prefix map

- **File:** `tools/validate.cjs` (W1-Q).
- **Change:** read the known condition and effect names from `SR.rules.conditions.names` and
  `SR.rules.effects.names` (mode `all` loads the rules); map the prefix `toast.act.*` to
  `en-prog.js` (the forced-charge write-off toast `toast.act.writtenOff`). Note that `js/rules/act.js`
  already warns once at boot (prio 20) about unknown names and P1 actions without a flag (D28).
- **Meanwhile:** nothing needed; keys resolve in `en-prog.js`.

## 9. Decision: the employee discount on day 1

- The player starts as a Fry Cook (B-02 `startJob`) and B-28a's `employee` row gives 25 % off
  McSticks food "while you hold a McSticks job", so fries cost **$9** on day 1. BUILD_PLAN §3.12's
  slice script says "Fries (+20 HP, $12, 30 m)". Either the slice text changes to $9, or the row
  gets a condition (e.g. only from Shift Manager). The kernel follows BALANCE ($9).

## 10. Decision: stat stamps and hold-to-repeat

- UI §4.3 wants a Stamp for every stat gain ≥ 2 and GDD §4.4 stops a repeat at any stamp, so holding
  Enter on Study or a class would stop after one repeat. The kernel raises `stamp.stats.<stat>`
  (D27: stamps a rule module raises are its own); W1-D's card may choose not to stop repeats for
  stat stamps. Please confirm which document wins.

## 11. Decision: small rule readings W1-R made

- McHolland's bribe blocks Heat gains while `day <= npc.mcholland.bribedUntil` (inclusive).
- Heat Wave scales `cost.hp`, `hpAbove` and `hurt` of actions in the `train` and `work` groups
  (ceil × 1.5).
- Hard Landing caps `hurt` with cause `fall` or `carHit` at 5; Iron Stomach multiplies `heal` in
  actions of the `eat` group (floor × 1.25).
- Before `SR.rules.bank.charge` loads, the `charge` effect applies B-09's cash → bank → write-off
  itself (a guarded path, removed once W1-E's module is always present if the lead prefers).
- B-23 to B-25 have no tuning path: their bands belong to `tests/balance` (W1-Q / W3-Balance).
- Buzz wears off on the clock's 2-hour grid (-1 each time an action's time passes 02:00, 04:00, ...,
  24:00; `SR.rules.time.spend` / `setTo`), so it needs no state field; sleep still resets it.
- Winded is judged after the action's own HP cost (the pipeline pays the cost, then runs the
  effects), and the preview shows the halved gain.
- The `weather` condition reads Clear while the `weather` flag is off (B-19: the flag is the only
  switch), as `cityEvent` reads no event while `calendar` is off.

## 12. W1-E: `stat` rule events from the night

- **File:** `js/rules/night.js` (W1-E; W2-RulesE in wave 2).
- **Change:** pass the Report as the fifth argument of `SR.rules.stats.add` in step 7 (nightly
  furniture) and step 9 (Mandatory Hats), so the `stat` rule events `{ key, n, total }` of CONTRACT
  §9.1 reach `Report.events` (the report scene re-emits them; achievements and the advisor listen).
- **Why:** outside the action pipeline `stats.add` raises the event only into `out`; the pipeline
  derives it from the deltas for actions, but night gains are not actions.
- **Meanwhile:** nightly gains raise no `stat` event.
