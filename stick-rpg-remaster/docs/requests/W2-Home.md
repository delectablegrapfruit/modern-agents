# Requests from W2-Home (wave 2)

W2-Home built the homes (every dwelling, its door modes and interiors), sleep, the TV, the answering
machine, the computer (stocks), the Save row and the Daily Fold (BUILD_PLAN §4.3). Each item gives
the file, the exact change, why, and what W2-Home does until then.

## 1. `js/rules/act.js` (W2-RulesE): no `game:over` from SR.act when the Result carries a night report

- **Change:** in the emission step, skip `E.emit('game:over', …)` when `res.report` is set (a
  sleep, a jail night) or `res.down && res.down.report` is set (a hospital night). The report
  scene's finish emits `game:over` once the paper has been read. Its guard (an `overAt`
  `{ state, day }` taken from the bus) already stops a second emission.
- **Why:** GDD §4.7 / §4.16 say the Final Edition comes before the results. SR.act emits `game:over`
  before `action:done`, and the report scene is pushed on `action:done` (for `home.sleep`) or by
  the hospital/jail scenes. A results scene that queues itself on `game:over` (W2-Front) runs as
  soon as the top is a base scene. So on the last day of a timed game it would replace the city
  before the last paper shows, and it would do the same after a Hardcore loan default found by the
  night.
- **Meanwhile:** `js/scenes/report.js` records the last `game:over`. On the final page it emits
  `game:over` only when none was emitted for this game and day. Then it pops and queues `results`
  (or goes to `title` while results is a stub), unless `results` or `death` is already on the
  stack. `tests/e2e/home.test.cjs` checks for exactly one `game:over` for both endings. With
  W2-Front's current stub the order is right. Once a real results listener lands, it is right only
  if the listener waits (see W2-Transit request 1) or this change is made.

## 2. `js/art/interiors/kit.js` (lead / W1 art owner): per-params variants of one interior id

- **Change:** allow `SR.def.interior(id, { variants: { <key>: def, … }, variant(state, params) → key })`.
  The kit keeps a renderer per `id + ':' + key` and draws the variant's walls, floor, window, lights
  and props, with its own `palette`.
- **Why:** there is one building, `home`, but five dwellings (apt, apt2, pent, mansion, castle), and
  each has its own walls, floor and palette (ART_BIBLE interiors). The kit caches one renderer per id
  and reads walls and floor once from the def.
- **Meanwhile:** `js/art/interiors/home.js` registers a plain frame def whose custom `room` fn draws the
  tier's room from `SR.art.interior.fromDef('home.' + tier, TIER_DEFS[tier])` (cached per tier). The
  frame's own props carry each tier's furniture, wrapped in a tier `when`. Side effect: the paper grain
  is drawn twice (frame and room). It can't be seen at the kit's alpha, but it costs a little on the
  static layer, which is cached.

## 3. `tools/validate.cjs` / `js/art/interiors/kit.js` (lead): what `def.palette` means for an interior

- **Change:** make the two agree. The kit reads `def.palette` as the short set name
  (`SR.art.palette.int[def.palette]`, e.g. `'apt'`), while the validator checks it as a full palette
  key (`refPalette(v, …, { group: true })`, e.g. `'int.apt'`). Either the validator prefixes `int.`
  for interiors, or the kit strips it.
- **Why:** a def written for one of them fails the other. The frame def with `palette: 'home'`
  failed validation, and `palette: 'int.apt'` would fall back to `int.default` in the kit.
- **Meanwhile:** the registered `home` def has no `palette` field. The per-tier defs passed to
  `fromDef` (not validated) use the kit's short form.

## 4. `js/ui/screens/saveload.js` + `js/scenes/results.js` (W2-Front): two parameters W2-Home passes

- **Change (record/implement):** the home's Save row pushes `saveload` with `{ mode: 'save' }` (UI
  §5.13 "Save from home"). The report's last page queues `results` with `{ reason, result }` (the
  same shape `game:over` carries) only when no `results` or `death` scene is already on the stack.
- **Why:** so W2-Front's screens accept what W2-Home sends.
- **Meanwhile:** while `saveload` is unregistered, the Save row writes `slot1` itself
  (`SR.save.write('slot1')`) and shows `toast.home.saved` (or `toast.home.saveFailed`).

## 5. `docs/CONTRACT.md` §15.4 / ARCHITECTURE §7 (lead): the additive names W2-Home exposes

Nothing frozen changes. Record:

- **UI:** `SR.ui.report = { build(report, opts) → page element (with .button, .next(), .onShow()),
  newsVars(vars), headline(report), COLUMNS }` (js/ui/screens/report.js).
- **Scene `report` params:** `{ report, next: 'city' | 'pop' | <scene id>, events: bool, dayStarted:
  bool }`. The default `next` is `'pop'` for a jail report and `'city'` (at the home door) otherwise.
  On a `sleep` Result the scene pushes itself on `action:done` (if the top is not already a report).
- **Actions:** `home.sleep`, `home.nap`, `home.leftovers`, `home.tv`, `home.online`,
  `home.stargaze`, `home.party`, `home.swim`, `home.holdCourt`, `home.messages`, `home.computer`,
  `home.save`, `home.properties`, `home.campaign`, `home.topFloor`, `home.moveIn`, `home.letOut`,
  `home.endLet`, `home.sell`, `home.tour`. The sub-screen actions are `home.tvNews`, `home.tvFitness`,
  `home.tvDating`, `home.tvMarket` (P1), `home.msgRead`, `home.msgArchive`, `home.stockBuy` and
  `home.stockSell`.
- **Named fns:** `home.notMode`, `home.hasPiece`, `home.dailyOk`, `home.isLet`, `home.tvMin`,
  `home.napMin`, `home.leftoversMin`, `home.leftoversHp`, `home.onlineMin`, `home.onlineCash`,
  `home.perkMin`, `home.perkCash`, `home.sleep`, `home.moveIn`, `home.letOut`, `home.endLet`,
  `home.ateLeftovers`, `home.tvExtra`, `home.msgRead`, `home.msgArchive`, `home.effective`,
  `greet.home`.
- **The home door:** the card's mode is the door resolver's, and rows switch in place with the
  effective mode (params.homeId or the living home). Every row carries a `hidden` list with
  `['fn', 'home.notMode', mode]`, so moving in or buying at a door changes the rows without
  reopening the card.
- **Why:** these are the names other packages and tests use: W2-Transit's hospital/jail reports
  open `report`, W2-Civic's campaign row, and W2-Money's `bank.realestate` gets `{ homeId }` from
  Tour, Top floor and Sell.

## 6. `js/ui/subscreens/realestate.js` (W2-Money): what the home doors send

- **Change (record):** `home.tour`, `home.sell`, `home.properties` and `home.topFloor` push
  `bank.realestate` with the door's params (`{ homeId }`, `home.topFloor` → `{ homeId: 'apt2' }`).
  The sub-screen should open on that home's listing.
- **Meanwhile:** the rows are in place. Until the sub-screen is registered, pressing one shows the
  card host's `ui.subMissing` toast (the validator warns). `tests/e2e/home.test.cjs` registers a stand-in
  `bank.realestate` only when the real one is missing, and buys through `homes.buy` from it.

## 7. `js/ui/card.js` (W1-D, through the lead): a home card that follows its door in place

- **Change:** when the building's rows switch in place because the door's mode changed (`home:changed`
  while the home card is up: a purchase through Tour, Move in, Let out / End the let), re-pick the
  greeting with `greet.<buildingId>`, and let a building name its title per mode (for example an
  optional named fn `title.<buildingId>` → a text key), so the For Sale door reads "For Sale" rather
  than "Home" (UI §5.6: "a For Sale card").
- **Why:** the card picks its greeting once, at mount. Buying the penthouse at its For Sale door
  (Tour → Buy) left "For sale: the Penthouse Suite. $40,000 ..." over the Move in row, and it stayed
  there after moving in (review of W2-Home, reproduced in `tests/e2e/home.test.cjs`).
- **Meanwhile:** `js/scenes/report.js` (the home card's UI hand-offs) listens to `home:changed` and,
  when the door's mode, home or let changed, calls the Card component's own `setGreeting` (CONTRACT
  §15.4) on `#ui [data-id="card"]` with `greet.home`. The title still reads "Home" in every mode.

## 8. `js/ui/components.js` (W1-D): the float text of a `home` Delta

- **Change:** `SR.ui.chip.fromDelta` gives a `home` Delta (`key: 'living' | 'owned'`, non-numeric
  `from` / `to`) a readable chip (the home's name, e.g. "Penthouse Suite", or none), not its key.
- **Why:** buying or moving in at a home door floats the raw words "owned" and "living" over your
  stick in the building scene (`js/scenes/building.js` spawnFloats → chip.fromDelta).
- **Meanwhile:** nothing on W2-Home's side (the floats are the building scene's).

## 9. GDD §3.6 (lead): Paperview's "Top floor: Tour" row after the top floor is bought

- **Change (record):** the row stays while you live in the apartment, also once the top floor is
  yours; it opens the Real Estate page focused on the top floor, whose card then offers Move in.
- **Why:** the Paperview door stays in Live mode while you live on the ground floor, so its Owned
  mode (with Move in) never appears for the top floor: once bought, the only way up was the bank's
  desk. GDD §3.6 names the row "while ... the top floor is unsold"; this keeps the door's own way up.
- **Meanwhile:** applied in `js/data/buildings/home.js` (tested in `tests/e2e/home.test.cjs`).

## Status notes (review)

- Items 4 and 6: W2-Front's `saveload` and W2-Money's `bank.realestate` have landed; the Save row
  opens `saveload` in save mode, and Tour, Top floor, Sell and Properties open the real Real Estate
  page on the door's home (its card first, "On tour"). The test buys and moves in through it.
- Item 1 was applied by W2-RulesE (with the jail-night exception).
- W2-Street request 4 (a new game holds Mel's voicemail): applied in `tests/e2e/home.test.cjs`.
