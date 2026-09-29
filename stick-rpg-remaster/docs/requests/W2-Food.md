# Requests from W2-Food (McSticks and Funkytown Five-O)

Each item: file and owner, the exact change, why, and the workaround used meanwhile.

## 1. `tools/validate.cjs` (lead; W1-Q's file): no `:resolve` for a Hustle row

- **Change:** in the "opens a minigame but `<id>:resolve` is not registered" check, count only
  actions whose effects `open` a minigame (`opens`), not actions whose only minigame is the Hustle
  button (`d.minigame`). Keep `d.minigame` in the `hpAbove` worst-case rule if wanted.
- **Why:** the Hustle's result never goes through a `:resolve`: the card runs the skin and commits
  the row itself with `{ m, hustle }` (CONTRACT §15.4, `js/ui/card.js` `runHustle`), exactly as
  ARCHITECTURE §6.3's `nli.work` example has it (no resolve). W2-Money's `nli.work` meets the same
  error.
- **Workaround:** `js/data/buildings/mcsticks.js` registers a documented no-op
  `mcsticks.work:resolve` (`timeRule: 'free'`, no effects). It pays nothing and never shows as a
  row; remove it when the check changes.

## 2. `js/ui/card.js` and `tools/validate.cjs` (lead): shifts may repeat even with a Hustle button

- **Change:** `isRepeatable(def)` in `card.js` and the validator's `repeatable` rule should ignore
  `def.minigame` when it is a Hustle (a separate button on the row; the row itself runs with no
  minigame), so a shift row can be `repeatable: true` (R and hold-to-repeat run the plain Auto shift;
  the Hustle button never repeats).
- **Why:** GDD §4.4 and UI §1 list shifts among the repeatable actions; CONTRACT §8.2 forbids
  `repeatable` next to `minigame`, which today catches every shift row because of the P1 Hustle
  hook.
- **Workaround:** `mcsticks.work` is not repeatable (as ARCHITECTURE §6.3's `nli.work`); the tests
  record it. Food and goods rows repeat.

## 3. `js/rules/jobs.js` (W2-RulesE): an Auto hustle result is Auto

- **Change:** the named fn `jobs.work` treats `params.hustle && params.hustle.auto` like
  `params.auto`: `jobs.work(s, track, variant, params.m, { hustle: typeof params.m === 'number' &&
  !params.auto && !(params.hustle && params.hustle.auto) })`.
- **Why:** the card's Hustle commits `{ m: result.m, hustle: result }` (no top-level `auto`), so an
  Auto round (m = 1.0) still counts as a played hustle and gets the rain tips (× 1.2), while B-05
  says "Auto exactly 1.0" and `jobs.rainTips` says "Auto stays 1.0".
- **Workaround:** none needed in wave 2 (it needs both `hustles` and `weather`, P1).
- **Status:** applied by W2-RulesE during the wave (`docs/requests/decisions-w2-W2-RulesE.md`).

## 4. `js/rules/casino.js` (W2-RulesC): pay the scratch card at its reveal

- **Change:** `casino.scratch` draws the roll at the start as today, keeps it in an "in progress"
  record (like `crime.open`), and a new named fn `casino.scratchResolve` credits the prize (income
  `prize`) and closes the record; W2-Food's `store.scratchPlay:resolve` would call it.
- **Why:** the prize is credited at the start, so the card plays the start's feedback (the flying
  `+$100` chip and the money count) before the scratch frame opens: the reveal is spoiled.
- **Status:** applied by W2-RulesC during the wave (`casino.scratchResolve`,
  `docs/requests/decisions-w2-W2-RulesC.md`); `store.scratchPlay:resolve` now runs
  `[['fn', 'store.scratchDone'], ['fn', 'casino.scratchResolve']]` (Dee reads the card in progress,
  `state.casino.card`, before it is paid and closed, so her line follows the drawn prize and not the
  engine's echoed `{ net }`; a resolve with no card is refused by `casino.scratchResolve` and drops
  her line with it) and `tests/e2e/store.test.cjs` checks that nothing is paid before the reveal,
  the prize is paid at it, and Dee's line matches the card.

## 5. `js/data/text/en-ui.js` (W2-Front): variant and badge labels

- **Change:** add `'ui.variant.here': 'Eat here'`, `'ui.variant.takeout': 'To go'` (the Takeout
  variant of the McSticks food rows, P1 `shopsPlus`), and badge texts for the B-28a price modifiers
  a row can show: `'ui.badge.employee': 'STAFF 25 %'`, `'ui.badge.takeout': 'TO GO'`,
  `'ui.badge.flyerCoupon': 'COUPON'`, `'ui.badge.thuTriple': 'THURSDAY'`, `'ui.badge.thuMega':
  'THURSDAY'`, `'ui.badge.goodKarma': 'GOOD KARMA'`, `'ui.badge.couponClipper': 'CLIPPED'`,
  `'ui.badge.burgerDay': 'BURGER DAY'`, `'ui.badge.freeFriesFriday': 'FREE'`.
- **Why:** the card builds variant labels as `ui.variant.<id>` and a Preview badge id falls back to
  its id upper-cased (`FLYERCOUPON`); every Fry Cook sees the `employee` badge on day 1.
- **Workaround:** the P0 badge reads "EMPLOYEE" (the id); the variant labels only show with
  `shopsPlus` on.
- **Status:** applied by W2-Front during the wave (`js/data/text/en-ui.js` has `ui.variant.here` /
  `takeout` and the `ui.badge.*` texts; the card reads "STAFF 25 %", "Eat here" / "To go").

## 6. `tools/validate.cjs --selftest` (lead; W1-Q's file): plants that collide with real files

- **Change:** (a) in `validate()`, load the real tree without the files a plant names (a planted
  `rel` replaces the file of that path instead of running after it), e.g. pass
  `files: L.files('all').filter((f) => !hasOwn(plant, f))` to `L.load`; (b) the case "a frozen
  sub-screen outside its file" also plants an empty `js/ui/subscreens/tv.js`
  (`"(function () { 'use strict'; })();\n"`), so `home.tv` is registered only by the planted `qa.js`.
- **Why:** the self-test was written against the stub tree. The case "a skin on the wrong engine"
  plants `SR.def.skin('orderup', { engine: 'duel' })` as `js/minigames/skins/orderup.js`, which now
  runs after W2-Food's real file of the same path: the registry reports a duplicate `orderup`
  instead of the wrong engine, so the case fails. The same happens to "a frozen sub-screen outside
  its file" now that W2-Home's `tv.js` registers `home.tv`. The validator itself (non-selftest)
  passes: 0 errors.
- **Workaround:** none in W2-Food's files (the skin is correct); `node tools/validate.cjs
  --selftest` reports these two cases until the change.

## Notes (no change requested)

- **W2-Street:** Mel's day-1 job offer is `vm.mel.job` in `en-food.js` (the key the wave-1 fixtures
  already use); W2-Street queues it (BUILD_PLAN §4.10).
- **W2-Money:** the `holdup` skin serves the bank too: with `target: 'bank'` it shows Penny Wise at
  the window (portrait `penny`, labelled "Penny Wise, the teller", matching the `bark.penny.*` line
  that follows) and the `mg.holdup.bank.1..3` situations; `crime.holdupParams` supplies the rest.
- **W2-Music:** McSticks plays `fry_day`, Five-O `funky_aisle`, Order Up and the scratch card
  `tick_tock_trouble` (ART_AUDIO §13.4).
- **W2-RulesE:** the goods rows use `items.room` / `items.buy` from `js/rules/effects.js` (present
  in the working tree during this wave).
