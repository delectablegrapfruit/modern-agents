# Wave-2 integration: decisions of the presentation desk (desk-present)

Scope: still-open requests whose target is one of `css/*`, `js/ui/*` (the framework files: `dom`,
`components`, `focus`, `toast`, `stamp`, `modal`, `hud`, `card` and its sub-screen host, `dialog`),
`js/art/*` (the kit, palette, actors, portraits, icons, the exterior painter `exteriors.js` with its
coupled constant in `exteriors-detail.js`, `interiors/kit.js`), `js/audio/*` (the engine and the
music framework, not the songs), `js/scenes/building.js`, `js/data/text/en-ui.js`,
`tests/e2e/{ui-kit,card,a11y,art,audio}*.cjs` and `tests/sheets/*`. Each line is request id →
decision → reason. Parts of a request that target another desk's file are named "not this desk"
(desk-lead's answers and the contract records are in `decisions-w2-desk-lead.md`; the validator,
render and world files are desk-world's). Every applied item is tested; the new checks fail
against the tree as it was before this desk's changes.

## W2-City

- **W2-City 3** (`css/components.css`: the city's touch cluster and minimap classes) → applied, values
  as asked: `.city-minimap` (+ its canvas), `.city-touch`, `.city-touch-btn` → UI.md keeps component
  styles in the stylesheet. `js/scenes/city.js` (W2-City's) still sets the same inline values; dropping
  the inline copies is its owner's (W4-UI) one-line change.
- **W2-City 4** (the city HUD clips at 844 × 390) → applied in `css/components.css`, touch-compact
  layout only: the grid's column gap 8 px, the left card loses its 508 px floor, a 128 px HP track,
  shrinkable outer columns; under 780 CSS px the name and job line goes (the medallion stays), under
  700 the ClockRing is 48 → UI §2.2 / §5.5: the whole HUD on a phone, between the 16 px gutters.
  Measured: 844 × 390, 740 × 360, 667 × 375 and 640 × 360 fit (Pause 10-25 px inside the window). The
  same rule set narrows the compact context prompt to `min(480px, 100% - 336px)`, clear of the 272 px
  touch cluster (it ran under the Car button at 667 × 375). Tested in `tests/e2e/card.test.cjs`
  (touch: the city HUD at 844 × 390 and 667 × 375). UI §2.2's tap-to-expand strip for rows 2-3 is
  touch polish → **W3-Input**.
- **W2-City 1, 2, 5, 6, 7** → not this desk.

## W2-Civic

- **W2-Civic 1** (`card.js`: skip actions marked `row: false`) → applied in `cardActions()` (the
  building's list and a home door's mode list) → D62. Tested (a `row: false` action is no row and
  still previews and commits).
- **W2-Civic 4** (`components.js`: name a list item's chip by its item def) → applied: `itemDef(key)`
  finds the def whose `key` is the state key (`diplomas` → the Diploma) for the name and the icon.
  Tested ("+1 Diploma").
- **W2-Civic 5** (a building's song by the state) → applied in `js/scenes/building.js`: the named fn
  `music.<buildingId>` (a song id, or `{ id, variant }`) wins over `def.music`; the call stays
  `[id, { fade: 0.6 }]` without a variant. Tested. The `js/scenes/minigame.js` half (`musicBelow()`)
  → not this desk (desk-lead's open issue).
- **W2-Civic 6** (`card.js`: re-pick a greeting fn's line after an action) → applied (`followState`):
  after each committed action (a row, a sub-screen's `ctx.act`, a minigame's `:resolve`) and on
  `home:changed`, the greeting fn runs again and the bubble re-types only when the returned key
  differs from the one shown (`el.greetingKey`, which also sees `js/scenes/report.js`'s own
  `setGreeting`). So that a fn picking a variant with `ctx.rng` does not re-type another variant
  after every action, the fn now draws from a stream seeded once per visit (one fx draw at mount, only
  for a building with a greeting fn). Tested (an unrelated action keeps the line; a change of
  situation re-picks it).
- **W2-Civic 2, 3** → not this desk.

## W2-Exterior

- **W2-Exterior 2a** (the castle's tallest cone tower) → applied in `js/art/exteriors.js` (the tallest
  is picked among the south towers, `TALLEST_RAISE = 40`) with `CASTLE_TALLEST = 40` in
  `js/art/exteriors-detail.js` in the same change, as the request asks (W2-Exterior has ended; the
  file is the lead's until W3-Light) → ART_AUDIO §5.2 "the tallest cone tower". The raised tower keeps
  its slit window at the height of the other south tower (the raise lengthens the shaft above it), so
  no lit window sits inside the keep's roof line (`tests/e2e/render.test.cjs`). The flags' bounds
  already cover the +20 u (a turret's bound reaches 118 u above its top; the pennant needs 82).
- **W2-Exterior 2d** (expose what the painter drew) → applied: the detail geometry carries
  `roofSign` (the shop roof sign's board), `post` (the north porch's sign post) and `tops` (the def's
  tall roof features as `{ kind, rect, h }`) → additive; the detail's own `roofBoard()` workaround
  may switch to it (W3-Light, the file's wave-3 owner).
- **W2-Exterior 2b** (detail neon: Sticky's mug glowing at night) → deferred to **W3-Light** (takes
  over `exteriors-detail.js` and the lamp and neon timing) → a lighting polish: the mug is painted
  with its neon-yellow frame and darkens with the grade meanwhile; the hook needs a new baked sprite
  kind in the painter and its budget counted (ARCHITECTURE §9.1 neon sprites).
- **W2-Exterior 2c** (a sign lettering style, neon script for STICKY'S) → deferred to **W4-Visual**
  (the art-bible audit, owner of `js/art/**`) → polish; the display face traces the same letters.
- **W2-Exterior 2e** (signatures in the occlusion cover; optional) → deferred to **W4-Visual** →
  polish (a 24 u strip of Bank Lane); adding signature rects to `g.cover` blindly would also fade a
  building for a walker at the kid's memorial, a street-level signature inside the mansion's sprite.
- **W2-Exterior 6** (`tests/sheets/render.html`: load the glyphs and the city names) → applied:
  `logos.js` after `skyline.js`, `en-conflict.js` after `en-world.js`, `cities.js` after
  `worldmap.js` → the render sheet shows the city as the game does.
- **W2-Exterior 10** (the house eaves cropped by 2 u) → applied: `pad = arch === 'house' ? 10 : 6`.
- **W2-Exterior 7** (re-record the goldens `exteriors`, `render-noon`, `render-dusk`, `render-night`,
  `render-castle`) → not this desk (`tests/visual/*`); after 2a, 6 and 10 they move on purpose
  (the castle's tower, the house sprites' bounds, the render sheet's glyphs and departures board).
- **W2-Exterior 1, 3, 4, 5, 8, 9, 11** → not this desk.

## W2-Food

- **W2-Food 2** (`card.js`: shifts may repeat next to a Hustle) → applied: `isRepeatable` ignores
  `minigame` (the Hustle button; the row itself runs the plain Auto action, the Hustle never repeats)
  and refuses a row whose effects `open` a minigame → D61. `tests/e2e/card.test.cjs`'s wave-1 check
  "a row with a minigame never repeats" now reads "a repeatable row with a Hustle button repeats its
  plain run". The validator's rule → not this desk; until it changes `mcsticks.work` / `nli.work`
  stay unrepeatable in data.
- **W2-Food 5** (`en-ui.js`: variant and badge labels) → no change needed: applied by W2-Front
  (`ui.variant.here` / `.takeout` and a `ui.badge.<id>` for every B-28a modifier).
- **W2-Food 1, 3, 4, 6** → not this desk.

## W2-Front

- **W2-Front 6** (`components.js`: a tooltip outlives a target that leaves the DOM) → applied: while a
  tip shows, a frame watch hides it once its target is disconnected (no blur or pointerleave fires for
  a removed element). Tested in `tests/e2e/ui-kit.test.cjs`.
- **W2-Front 1-5, 7** → not this desk.

## W2-Goods

- **W2-Goods 1** (`components.js`, `building.js`: furniture and home chips name the piece) →
  applied: a `furniture` chip names the piece at the tier it reaches (`to`, or the owned tier plus `n`
  for a Preview gain: the Hibernation Pod for an upgrade), a `home` chip the home (below), and
  `spawnFloats` floats no `furniture`, `home` or `job` Delta (`NO_FLOAT`). Tested.
- **W2-Goods 4** (`en-ui.js`: `ui.badge.goodKarma`, `couponClipper`) → no change needed (W2-Front
  applied).
- **W2-Goods 2, 3** → not this desk.

## W2-Home

- **W2-Home 2** (`kit.js`: per-params variants of one interior id) → applied:
  `SR.def.interior(id, { variants: { <key>: def }, variant(state, params) → key })`. The renderer
  picks the variant at each `drawStatic` / `drawAnim` from the state and the door's params, so a move
  at the door redraws the right room when the building scene re-bakes its static layer
  (`home:changed`); a variant is the base def overlaid by its own fields, cached per `id:key`, with its
  own palette set (its `palette`, else `int.<key>`); an unknown key draws the base def. Tested in
  `tests/e2e/art.test.cjs`. Moving `js/art/interiors/home.js` onto it (one def instead of the frame
  with per-tier `fromDef` rooms) is its owner's (W4-Visual) change; the workaround keeps working.
- **W2-Home 3** (what `def.palette` means for an interior) → applied on the kit's side: the short name
  (`'apt'`) and the full palette key the validator checks (`'int.apt'`) both resolve to
  `SR.art.palette.int.apt`, so a def written for the validator draws right. Tested. The validator
  half → not this desk.
- **W2-Home 7** (`card.js`: a home card that follows its door in place) → applied: the greeting
  follows on `home:changed` and after every action (W2-Civic 6), and an optional named fn
  **`title.<buildingId>`** (→ a text key, or `{ key }`) names the card by the state and the door's
  params; `el.setTitle` renames it in place. Tested. A `title.home` fn ("For Sale" at a For Sale
  door) is `js/data/buildings/home.js`'s (W3-Econ in wave 3); the title reads "Home" until then.
- **W2-Home 8** (`components.js`: the float text of a `home` Delta) → applied: `living` names the
  home moved into, `owned` the home bought (or "-1 <home>" for a sale), a home-id key its home; a
  Preview gain, which carries no `from` / `to`, reads the new `ui.chip.home` "New home"; and
  `home` Deltas no longer float (W2-Goods 1). Tested.
- **W2-Home 1, 4, 5, 6, 9** → not this desk.

## W2-Money

- **W2-Money 1** (`components.js`, `building.js`: a `job` chip names the rank) → applied: the chip
  names `job.<to>` (the rank reached); a Preview gain (only `n`) reads the rank off the track's ladder
  (`tuning.jobs.ladder`) from the state; else `job.<key>`, else the employer's place name; `job`
  Deltas do not float. Tested ("Janitor", not "nli").
- **W2-Money 2** (`card.js`: a sub-screen opens scrolled to the top) → applied: `show()` also resets
  the scrolling ancestors of the host up to the scene root (the card's `.bcard-body`, the Pocket's
  page). Tested with a sub-screen taller than the card body.
- **W2-Money 3-7** → not this desk.

## W2-Music

- **W2-Music 1** (`stamp.js`: the stinger by the stamp's key) and **W2-Transit 7** (a stamp without
  the level-up stinger) → applied together: a table picks the stinger by `o.key` (`stamp.jobs.*`
  except `hired` → `promotion`; `stamp.training.*`, `stamp.hospital.flatlined`, `stamp.crime.jailed` →
  none, their scenes play their own; anything else → `stamp`), `o.sting` overrides it (`false`, or a
  stinger id), and an unregistered fanfare falls back to the triad. The card passes the rules'
  stamp `key` along with its text. Tested (the table; FLATLINED lands silent; a promotion plays the
  fanfare). `js/ui/screens/hospital.js`'s wrapper of `SR.audio.stinger` is now redundant (its owner
  may drop it); `js/ui/screens/report.js` (W2-Home) stamps the election result by text only, so its
  stamp still plays the triad beside `stingers.election_win` / `_loss`: passing `sting: false` there
  is its owner's one-word change (W4-UI).
- **W2-Music 4** (`building.js`: the interior ambience beds) → applied: a table by building id
  (`casino`, `bar`, `mcsticks` → fryer, `nli` / `bank` / `cityhall` → office, `uofs` → campus) starts
  the bed at level 1 under the song on enter and sets it to 0 (the 1 s fade) on exit → ART_AUDIO
  §13.6 / §13.7; a table in the scene keeps the frozen building fields as they are. Tested (the bank's
  office hum, faded on leaving).
- **W2-Music 2, 3** → not this desk.

## W2-Night

- **W2-Night 3** (`card.js`: no flying chips across a minigame that opens) → applied in
  `feedback()`: chips fly unless `res.open` is set (or `opts.flyChips` says otherwise), so every host
  (rows, `ctx.act`, the Pocket) follows it. Tested.
- **W2-Night 1, 2, 4-7** → not this desk.

## W2-Pocket

- **W2-Pocket 1** (`tests/e2e/a11y.test.cjs`: no real-Tab walk through the Pocket) → applied, with
  the optional arrow walk: the Pocket and each of its tabs are audited without Tab (it closes the
  Pocket, D57) and walked with `SR.ui.focus.move` (every stop in scope, ringed and named). The walk
  found a real gap: the Bag tiles' inline `box-shadow: var(--e-1)` hid the inset focus ring, so
  `css/base.css`'s `[data-nav].nav-inset:focus` ring is now `!important` (UI §2.3: focus always
  visible).
- **W2-Pocket 2** (`dialog.js`: open the Pocket over a street dialog by key and pad) → applied as asked
  (`bag`, `map`, `journal`, and `pocket` except from Tab; no key repeats), plus a dialog param
  `pocket: false` that keeps it shut (a police stop may want that) and `SR.ui.dialog.current()`.
  Tested.
- **W2-Pocket 4** (Esc is `back` then `pause`) → no change needed on the card's side: the card already
  swallows a `pause` whose key is a `back` binding, and the city ignores the `pause` of the Esc that
  brought it back (W2-City); `tests/e2e/card.test.cjs` "Esc with no sub-screen leaves for the city"
  ends on `['city']`.
- **W2-Pocket 6** (`css/components.css`: the Pocket's classes) → applied with the inline values:
  `.pocket-root`, `.pocket`, `.pocket-rail`, `.pocket-main`, `.pocket-head`, `.pocket-tab` (a vertical
  Tab, selected by `aria-selected`), `.pocket-tab-label`, `.pocket-page`, `.bag-tile` (selected by
  `aria-selected`), `.bag-detail`, `.phone`, `.phone-screen`. The notebook's per-layout place and size
  stay with `pocket.js`'s `layout()`. Dropping the inline copies is the Pocket's owner's (W4-UI).
- **W2-Pocket 3, 5, 7** → not this desk.

## W2-Transit

- **W2-Transit 6** (`components.js`: a detached tooltip drops its pending show) → applied: the target
  waiting out its 400 ms is remembered (`tipPending`), and detaching or hiding that target clears the
  timer (a blur before 400 ms used to show the tip anyway). Tested in `tests/e2e/ui-kit.test.cjs` (a
  button updated before its 400 ms never shows its old tip).
- **W2-Transit 7** → applied with W2-Music 1 (above).
- **W2-Transit 1-5** → not this desk.

## Wave-2 RulesC and wave-1 carry-overs

- **W2-RulesC 2** (`tests/e2e/conflict-sheet.test.cjs`, `tests/sheets/conflict.html`) → the sheet needs
  no change; the change asked is in the test (not this desk's file list).
- The wave-1 items deferred to wave-2 packages through this desk's files (W1-S 8: `stingers.stamp`)
  are closed: W2-Music registered the stinger, and the Stamp now picks it by key.

## Found during integration (no request filed)

- **The ClockRing at 24:00** (`components.js`, `css/components.css`) → fixed: the late pulse scaled the
  whole svg (×1.08) past its component box, which `tests/e2e/ui-kit.test.cjs`'s clip audit caught
  whenever it sampled the peak (the "clock-ring overflow" the rules desks saw under load). The ring's
  face (`.clk-face`, a `<g>`) now pulses inside the svg's own box (45 × 1.08 < 50). A deterministic
  check at the peak of the pulse is added.
- **Toasts over the Save / Load panel** (`css/components.css`) → fixed: the lane at y 104 sat on Slot 1
  (the "Saved to Slot 1." toast covered that slot's own Save here, and a tap on it dismissed the
  toast instead). While Save / Load, Settings or Pause is up, the lane sits at the bottom centre,
  clear of the panels' header rows and footer buttons, and lets taps through. Tested in
  `tests/e2e/card.test.cjs`.

## New public names from this desk (for the lead's CONTRACT fold; desk-lead recorded them in §15.6)

- `card.js`: the action field `row: false` (D62); `isRepeatable` per D61; the named fn
  `title.<buildingId>`; the greeting re-pick after actions (`followState`); `SR.ui.card.feedback(res,
  origin, { flyChips })`; the Card component's `el.setTitle(text, vars)` and `el.greetingKey`.
- `building.js`: the named fn `music.<buildingId>`; the interior beds; `NO_FLOAT`.
- `components.js`: `chip({ ..., from, to })`; text key `ui.chip.home` ("New home", `en-ui.js`).
- `stamp.js`: `o.key` picks the stinger; `o.sting`; `SR.ui.stamp.stinger()`, `SR.ui.stamp.stingerFor(o)`.
- `dialog.js`: the dialog param `pocket: false`; `SR.ui.dialog.current()`.
- `kit.js`: `variants` / `variant(state, params)`; `palette` as `'apt'` or `'int.apt'`; the variant
  renderer's `variant(state)` (tests).
- `exteriors.js`: the detail geometry's `roofSign`, `post`, `tops`.

## Tests

- `node tools/run-all.cjs --only e2e --jobs 2` after the bulk of the changes: 41 of 43 suites; the two
  failures were this desk's and are fixed: `a11y` (the Pocket's new arrow walk found the Bag tiles'
  hidden ring → `base.css`), `render` (the raised castle tower's lit window inside the keep's roof
  line → the window stays at the other south tower's height).
- Re-run after the fixes (two at a time): e2e `card` 138 / 0 (111 before; the new checks fail against
  the tree before this desk's changes), `ui-kit` 90 / 0 (88), `a11y` 126 / 0, `art` 38 / 0 (35),
  `render` 117 / 0, `exterior` 35 / 0, `sheets` 99 / 0, `frontend` 145 / 0, `pocket` 150 / 0,
  `saveslots` 41 / 0, `settings` 57 / 0, `street` 144 / 0; `audio` 136 / 0 in the full run.
- Node: `tokens` 56 / 0, `art` 255 / 0, `exterior-detail` 71 / 0, `music` 144 / 0;
  `tests/node/load.cjs all` and `rules`: 0 errors; `tools/validate.cjs --wave 2`: 0 errors (7
  warnings, W3-Park's stubs); `tools/shingles.cjs`: ok.
- `tests/visual/visual.cjs`: 28 / 5; the five are exactly W2-Exterior 7's goldens (`exteriors`,
  `render-noon`, `-dusk`, `-night`, `-castle`), which failed before this desk too and move further on
  purpose; `card-testshop`, `kit-mcsticks` and `artbible` match.

## Open issues

- `tests/visual/goldens/*` (not this desk): `exteriors`, `render-*` (W2-Exterior 7) need
  `node tests/visual/visual.cjs --record --only exteriors,render-noon,render-dusk,render-night,render-castle`
  (after 2a, 6 and 10 here). The game-page goldens of wave 2 are not recorded yet.
- `js/scenes/minigame.js` `musicBelow()` should read `music.<buildingId>` like the building scene
  (W2-Civic 5's second half; desk-lead's open issue).
- Owners' one-line follow-ups (no request needed, recorded above): `title.home` for the For Sale door
  (`home.js`), `sting: false` on the election stamp (`report.js`), dropping the inline style copies in
  `city.js` and the Pocket files, the hospital's stinger wrapper.
