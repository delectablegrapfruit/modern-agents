# Requests from W2-Money (the bank, New Lines Inc., real estate, the bank job), wave 2

Package W2-Money (BUILD_PLAN §4.6). Files: `js/data/buildings/{bank,nli}.js`,
`js/art/interiors/{bank,nli}.js`, `js/ui/subscreens/{bank,realestate,jobs}.js`,
`js/minigames/skins/{sortit,pitch,boardroom}.js`, `js/data/text/en-money.js`,
`tests/e2e/{bank,nli}.test.cjs`. Each entry: file, exact change, why, and the workaround used meanwhile.

## 1. `js/ui/components.js` and `js/scenes/building.js` (lead, W1-D's files): a `job` chip names the rank

- **File:** `js/ui/components.js` (`chip.gains`, `chip.fromDelta`, `chipText` case `'job'`) and
  `js/scenes/building.js` (`spawnFloats`).
- **Change:** `chip.gains` and `chip.fromDelta` pass the gain's / Delta's `to` into the chip
  (`chip({ kind, key, n, to })`); `chipText` for `kind: 'job'` names `job.<to>` when `o.to` is a
  string (`to` is the new rank id: `janitor`, `mail`, ... , `ceo`), else `job.<key>` as today. In
  `spawnFloats`, skip `job` Deltas like `item` (or float the rank's title). The same shape as
  W2-Goods request 1 (furniture and home chips).
- **Why:** the rules' job Delta is `{ kind: 'job', key: 'nli', n: 1, from: null, to: 'janitor' }`
  (CONTRACT §8.3: `key` is the track). `chipText` looks up `job.nli`, which does not exist, and
  falls back to the raw key, so the NLI card's "Apply for a job" row previews a chip reading "nli",
  and a promotion flies an "nli" chip and floats "nli" over your head (the McSticks Shift Manager
  promotion, P1, does the same with "mcsticks"). Seen in `shots/W2-Money/look-nli.png`.
- **Meanwhile:** nothing in W2-Money's files can fix it; the promotion's stamp (`stamp.jobs.<rank>`,
  "JANITOR", "MAIL ROOM", ...) and the new boss's voicemail name the rank.

## 2. `js/ui/card.js` (lead, W1-D's file): a sub-screen opens scrolled to the top

- **File:** `js/ui/card.js`, `createSubhost` → `show()`.
- **Change:** besides `body.scrollTop = 0`, reset the scrolling ancestor the host lives in (the
  card's `.bcard-body`): e.g. `for (var p = root; p && p !== document.body; p = p.parentElement)
  if (p.scrollTop) p.scrollTop = 0;` before the first control is focused.
- **Why:** the card body is the scroll container; `.subhost-body` never scrolls. A sub-screen opened
  from a row low in the list (the bank's "Interest-rate board", row 6) inherits the row list's
  offset, so its first lines sit under the sticky breadcrumb and are cut off.
- **Meanwhile:** `bank.*`, `bank.realestate` and `nli.jobs` reset their own scrolling ancestors on
  mount (`toTop(root)`, stopping at the scene root). Other packages' sub-screens (a sub-screen with
  no focusable control near its top) still show the effect.

## 3. `js/rules/jobs.js` and `js/data/text/en-prog.js` (W2-RulesE): every missing requirement on the row — applied in the wave

- **Change (as filed):** `reason.needAll` ("Need {list}") and `jobs.missingReason` listing every
  missing requirement when there are two or more (GDD §4.6 "The row lists every missing
  requirement").
- **Status:** applied by W2-RulesE during the wave (`reason.needAll`, `reason.part.*` in en-prog.js;
  `jobs.missingReason`). NLI's rows now use the desk's `jobs.canApply` / `jobs.canPromote`
  directly; the interim conditions `nli.canApply` / `nli.canPromote` are gone.

## 4. `js/rules/night.js` (W2-RulesE): a formatted lien in Penny's default voicemail; the HP of a default — answered in the wave

- **Change (as filed):** (a) add `lienMoney: SR.text.money(d.lien)` to `vm.penny.default`'s vars;
  (b) a question: B-09's Standard "HP = 1" is applied at night step 2 and the same night's restore
  (step 6) heals from 1.
- **Status:** (a) applied by W2-RulesE; `vm.penny.default` now names the lien left (`{lienMoney}`).
  (b) answered: the reading is intended (the fixed night order); the BALANCE wording is asked of the
  lead in `docs/requests/W2-RulesE.md` 5. `tests/e2e/bank.test.cjs` expects `min(hpMax, 1 + restore)`
  after a Standard default and a full restore on Relaxed.

## 5. `tools/validate.cjs` (lead): no `:resolve` for a Hustle row (as W2-Food request 1)

- **Change / why:** as W2-Food request 1: a row whose `minigame` is a Hustle (`minigame: { skin:
  'nli.hustleSkin' }`) commits its own action with `{ m, hustle }` and never runs a `:resolve`.
- **Meanwhile:** `nli.work:resolve` is a deliberate no-op (free, no effects), like
  `mcsticks.work:resolve`.

## 5b. `tools/validate.cjs --selftest` (lead): the plant on `js/ui/subscreens/bank.js` (supports W2-Food request 6)

- **Change / why:** W2-Food request 6 (a): load the real tree without the files a plant names. Its
  case "a P1 frozen sub-screen with the wrong flag" plants `bank.cds` as `js/ui/subscreens/bank.js`,
  which now runs after this package's real `bank.js`: the registry reports a duplicate `bank.cds`
  instead of the wrong flag (`--selftest`: 3 failed, with W2-Food's `orderup` and W2-Home's
  `home.tv`).
- **Meanwhile:** nothing in W2-Money's files (`bank.cds` is registered correctly, P1 `homesPlus`);
  the validator itself passes with 0 errors.

## 6. `docs/CONTRACT.md` §8.2 / §8.9 / §10 / §15.4 and ARCHITECTURE (lead): records of W2-Money's names

Nothing frozen changes; records only.

- **Actions (card rows):** `bank.depositOpen`, `bank.withdrawOpen`, `bank.loanOpen`,
  `bank.repayOpen` (screen `bank.loan`, `screenParams: { focus: 'repay' }`), `bank.realestateOpen`,
  `bank.ratesOpen`, `bank.cdsOpen` (P1 `homesPlus`), `bank.rob` (+ `bank.rob:resolve`);
  `nli.apply`, `nli.promote`, `nli.work` (+ the no-op `nli.work:resolve`), `nli.ladderOpen`,
  `nli.takeover` (P1 `hustles`, + `nli.takeover:resolve`).
- **Sub-screen commits** (`row: false`, hidden while their parameter is missing; W2-Goods request 3
  and W2-Civic request 1 describe the same convention): `bank.deposit`, `bank.withdraw`,
  `bank.loan`, `bank.repay`, `bank.openCd` (`{ amount }`), `bank.breakCd` (`{ index }`),
  `bank.buyHome`, `bank.moveIn`, `bank.sellHome`, `bank.letHome`, `bank.endLet` (`{ homeId }`).
  Any host may run the Real Estate commits (a home door's Tour, the Pocket's P1 Paperweight Realty):
  `bank.realestate` needs no building.
- **Named fns:** `bank.noParam(key)` (hidden condition), `bank.loanTaken`, `bank.repaid`,
  `bank.homeBought`, `bank.movedIn`, `bank.homeSold`, `bank.homeLet`, `bank.letEnded`,
  `bank.cdOpened`, `bank.cdBroken`, `bank.pennyReacts` (feedback effects), `greet.bank`;
  `nli.newBoss` (the voicemail after a rung), `nli.hustleSkin`, `nli.ruthless` (B-30's -1 karma per Ruthless pick,
  read from `params.hustle.picks` or a resolve's `picks`), `nli.takeoverOpen`, `nli.takeoverNews`,
  `greet.nli`.
- **Building def accessors:** `SR.reg.building.nli.owner` / `.portrait` (and the NLI interior's
  `owner.id`) are getters of the live game: `'terry'` from Vice President up, else `'bea'`
  (ART_AUDIO §9 "Bea (or Terry at VP+)"; GDD §6.2).
- **Skin params:** `sortit` → `{ mode: 'conveyor', set: 'janitor' | 'mail', subtitle, bins, items }`
  (a run's `set` wins over the rank); `pitch` → `{ mode: 'grade', subtitle }` (the step comes with the
  run); `boardroom` → `{ opponent, situations (3 of mg.boardroom.card.1..9 by hash(seed, 'boardroom',
  day, shift | takeover)), cards (2-3 options each), cardOptions (labels), subtitle }`.
- **Test hook (no public name):** `SR.reg.subscreen['bank.realestate'].peek()` → the property order
  and each card's buttons.

## Notes for other packages (no change requested)

- **W2-Pocket:** the P1 Paperweight Realty contact (UI §5.9, `homesPlus`) can push
  `bank.realestate` through `SR.ui.subhost.create(root, { host: 'pocket' })` with no params (or
  `{ homeId }`); buy, move in, sell and let all work there (`tests/e2e/bank.test.cjs` does it).
- **W2-Home:** Tour / Top floor / Sell (P1) pass the door's `{ homeId, mode }`; the page puts that
  home first, marked "On tour", with its first button focused. After a purchase the door is Owned.
- **W2-Music:** the bank plays `compound_interest`, NLI `please_hold`, the three skins
  `tick_tock_trouble` (ART_AUDIO §13.4); until they land the validator warns and the page is silent.
