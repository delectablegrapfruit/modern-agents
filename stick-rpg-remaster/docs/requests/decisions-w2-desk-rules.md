# Wave-2 integration: decisions of the rules desk (desk-rules)

Scope: still-open requests whose target is one of `js/rules/*`, `js/data/*.js` (except `worldmap.js`,
`actions/world.js`, `features.js`), `js/data/text/{en-prog,en-econ,en-conflict}.js` and
`tests/node/*` (except `load.cjs`, `core.test.cjs`, `invariants.test.cjs`); `tests/sim/` does not
exist. Read: every file in `docs/requests/` (the W1-* and W2-* requests, the wave-1 decision files,
the wave-2 decision files of W2-RulesC and W2-RulesE, and those of desk-lead, desk-present,
desk-world and desk-content, including their open issues). Each line is request id → decision →
reason. Parts of a request that target another desk's file are named "not this desk". Every applied
item is tested; each new check fails against the tree as it was before this desk's change.

## Applied

- **W2-RulesC 6** (`js/rules/state.js`: two daily counters; desk-lead's open issue under D64) →
  applied: `SR.rules.state.defaults()` lists `daily.ring: 0` (today's Underground Ring bouts, B-13
  `ring.perDay`, counted by `fight.start(s, 'ring')`, read by `fight.canStart`) and
  `daily.campaign.debate: 0` (the debates opened today by `election.debateStart`, which the named fn
  `election.debate` requires; B-17 `debate.cap`) → ARCHITECTURE §6.1 records both (D64), and
  `defaults()` must stay fully populated so the save's deep-fill gives older saves every v1 field.
  Additive; the version stays 1. The rules' own `(n || 0) + 1` guards stay (harmless), the night's
  step 9 zeroes both with the rest of `daily`, and `js/ui/subscreens/campaign.js` lists only B-17's
  six actions, so the `debate` key shows nowhere. Tests: `tests/node/state.test.cjs` (the campaign
  keys now end in `debate`; both counters start 0; an older v1 save without them is deep-filled).
- **D61 in the rules' boot check** (W2-Food 2's rules part; the open issue of desk-world and
  desk-content: `js/rules/act.js`) → applied: the priority-20 registration check warns about
  `repeatable` only next to `confirm`, `screen` or an `open` effect (also inside `chance` / `check`
  branches), no longer next to `minigame`; the message reads "is repeatable but has confirm, screen
  or an open effect" → CONTRACT §8.2 / D61: a Hustle (`minigame`, the row's own button) does not block
  repeat, and the rule now matches `js/ui/card.js` `isRepeatable` and `tools/validate.cjs`. The full
  tree boots with no `SR.rules` warning. Tests: `tests/node/act.test.cjs` "boot-time vocabulary check"
  (a repeatable Hustle shift row is not warned; a repeatable row with an `open` effect, one nested in
  `chance` → `check`, and one with a `screen` are). The data flip (`repeatable: true` on
  `mcsticks.work` / `nli.work`, and the two e2e assertions "not repeatable until js/rules/act.js
  follows CONTRACT D61") is the buildings' owner's: not this desk (Deferred, below; now unblocked).

## Verified (applied in the wave by W2-RulesE / W2-RulesC; nothing left in this desk's files)

- **W2-Food 3** (`jobs.work`: an Auto hustle result is Auto) → `params.hustle.auto` counts as Auto
  (`js/rules/jobs.js`; `rulese.test.cjs`).
- **W2-Food 4** (`casino.scratchResolve`: the scratch card paid at its reveal) → in the tree with
  `casino.card` (`casino.test.cjs`).
- **W2-Home 1** (no `game:over` from `SR.act` for a night the report scene presents, jail excepted)
  → in `js/rules/act.js` (`rulese.test.cjs`; D63).
- **W2-Money 3** (`reason.needAll`, `jobs.missingReason`), **4a** (`lienMoney` in
  `vm.penny.default`), **4b** (answered; D70), **7** (`report.loanDueTonight`) → in `jobs.js`,
  `night.js`, `en-prog.js`, `en-econ.js` (`jobs.test.cjs`, `rulese.test.cjs`).
- **W2-Night 5** (`tuning.casino.chips` [5, 25, 100, 500]) → in `tuning.js`; BALANCE B-14c mirrors it.
- **W2-Night 6** (a fractional blackjack payout) → applied differently by W2-RulesC (`wholeNet`: the
  fraction paid as a whole dollar with its own probability, keyed by a hash, so a natural pays exactly
  3:2 on average and the house edge stays B-14b's) → rounding toward the house, as proposed, would
  have overshot the edge (1.13 % against 0.73 % exact). Pinned in `casino.test.cjs` ("a natural on an
  odd bet pays 3:2 on average").
- **W2-Pocket 5** (`records.meals`) → in `defaults()` and counted by the pipeline per `eat` event
  (`state.test.cjs`, `rulese.test.cjs`; D64).
- **W2-City 6** (`tuning.crowd.turnRange` 80, `scurry` 0.2) → in `tuning.js`; BALANCE B-22 mirrors
  both.
- **W2-Street 6**, the schema part (`npc.kid.diedDay: 0`) → in `defaults()`.
- **W2-RulesC 3** (`casino.card: null`) → in `defaults()` (`state.test.cjs`; D64).
- **W2-RulesC's proposal** (the pipeline refuses non-jail rows while jailed; "not a request") → no
  change, as W2-RulesE decided → the jail scene gates the UI (GDD §6.6), and a pipeline gate needs an
  allowlist (the Jail Day rows, bail, the P1 lawyer, the pill toggle) that belongs to W3-Crime's police
  and jail design; the sim's bots can skip non-`jail` rows while `s.jail` is set.

## Deferred (wave-3 / wave-4 packages)

- **W2-Front 7** (`tuning.start.customLength` [7, 365]) → **W4-Rules / W4-UI** with the P2
  `customLength` feature, as desk-lead and desk-content decided → it is P2; BALANCE B-02 already has
  the row and says the tuning row lands with the feature; the wizard's `CUSTOM_MIN` / `CUSTOM_MAX`
  hold the same numbers behind the flag.
- **W2-Food 2, the data half** (`repeatable: true` on `mcsticks.work` and `nli.work`) → **W3-Econ**
  (the wave-3 owner of `js/data/buildings/{mcsticks,nli}.js`), as desk-content deferred it → no longer
  blocked: `js/rules/act.js` follows D61 now (above), so the flip is one field per row plus the two e2e
  assertions; not this desk's files.
- **W1-C 12** (the pit boss's +1 rule; the Quick-fight Auto numbers; a balance note) → stays with
  **W3-Balance**, as the wave-1 lead deferred it → a tuning question for the B-25 protocol, not a
  defect.

| Package | Item |
|---|---|
| W4-Rules / W4-UI | `start.customLength` [7, 365] with the P2 Custom length (W2-Front 7) |
| W3-Econ | `repeatable: true` on `mcsticks.work` / `nli.work` and their e2e assertions (W2-Food 2; the rules part is done) |
| W3-Balance | the pit boss's +1 and the Quick-fight numbers (W1-C 12) |

## Rejected

- None.

## Not this desk

- **W2-RulesC 1** (`tests/balance/sim.cjs`: the jail loop's default choice `'hp'` and the sim's own
  `ctx`) and **W2-RulesC 2** (`tests/e2e/conflict-sheet.test.cjs` / `tests/sheets/conflict.html`) → not
  in any desk's file list at this integration (desk-lead, desk-present and desk-world each named them
  "not this desk"); open issues below. The rules side of item 1 is in the tree: `crime.jailDay`
  releases at once when `jail.daysLeft ≤ 0`, so a sim run gets out one day late instead of never.
- Every other W2-* item names a docs, kernel, UI, render, world, validator, content or text file of
  another owner (answered in `decisions-w2-desk-{lead,present,world,content}.md`).
- The wave-1 requests that named this desk's files were answered at the wave-1 integration
  (`decisions-w1-desk-rules.md`); nothing of them is open here besides W1-C 12 (above).

## BALANCE rows (for desk-lead)

None new. The two tuning rows the rules desks added in wave 2 are mirrored (B-14c `chips`, B-22
`crowd.turnRange` / `crowd.scurry`); B-02 `customLength` is a BALANCE row whose tuning row is deferred
(above). This desk adds no tuning row.

## New public names from this desk (for the lead's CONTRACT fold)

- State: `daily.ring`, `daily.campaign.debate` now in `SR.rules.state.defaults()` (the schema record
  is D64's, already in ARCHITECTURE §6.1).
- The boot warning's text: "action \"<id>\" is repeatable but has confirm, screen or an open effect"
  (was "… confirm, minigame or screen"); CONTRACT D61's sentence "until then `mcsticks.work` and
  `nli.work` stay unrepeatable with no-op `:resolve` actions" can now drop "with no-op `:resolve`
  actions" (desk-content removed them) and point the remaining flip at W3-Econ.

## Tests

Run after the changes (other desks were editing their files in parallel; suites two at a time):

- Node: `tests/node/act.test.cjs` 146 / 0 (the boot check's new cases), `tests/node/state.test.cjs`
  52 / 0 (the two counters); `node tests/node/load.cjs all` (155 files) and `rules` (90 files):
  0 errors, and the full tree boots with no `SR.rules` warning (no repeatable Hustle row yet).
- `node tools/run-all.cjs --only node,tools,balance --jobs 2`: 41 of 41 (every Node suite,
  `validate --wave 2` and its `--selftest`, `shingles`, `sim.cjs --selftest`).
- e2e that read the changed rules: `mcsticks` 109 / 0 and `nli` 108 / 0 ("no warnings" at boot),
  `election` 83 / 0 (the debate's record), `fight` 80 / 0 and `bar` 30 / 0 (the Ring's counter),
  `save` 41 / 0 (the deep-fill), `slice` (strict) 40 / 0.

## Open issues

- **W2-RulesC 1** (`tests/balance/sim.cjs`, the lead's in wave 2, W3-Balance's in wave 3) is
  unclaimed: the sim still passes `'rest'` to `crime.jailDay` (refused) and no `ctx`; suggested
  owner W3-Balance (BUILD_PLAN §5.10 takes over `sim.cjs`).
- **W2-RulesC 2** (`tests/e2e/conflict-sheet.test.cjs`: 17 fighters pinned exactly; captures to
  `shots/W1-C/`) is unclaimed; suggested owner W3-Nightlife (the wave-3 owner of the fight rules) or
  the lead.
