# Requests from W2-Exterior (Building exteriors and signature facades), wave 2

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). W2-Exterior owns `js/art/{exteriors-detail,props,logos,skyline}.js` and
`tests/sheets/exteriors-detail.html` (plus its tests `tests/node/exterior-detail.test.cjs` and
`tests/e2e/exterior.test.cjs`).

## 1. `js/data/text/en-world.js` (W2-City): the sign words the facades and props show

- **File:** `js/data/text/en-world.js` (W2-City in wave 2; `place.*` is its namespace, CONTRACT §7).
- **Change:** register, next to the other `place.sign.*` keys:

  ```js
  'place.sign.forSale': 'FOR SALE',                 // For Sale boards on homes you own no tier of (P0)
  'place.sign.slushee': 'SLUSHEE',                  // Five-O's slushee sign (ART_AUDIO §5.2)
  'place.sign.departures': 'DEPARTURES',            // the depot's departures board
  'place.sign.skybus': 'SKY BUS',                   // the parked Sky Bus's destination sign
  'place.sign.nliAd': 'WE DRAW THE LINE',           // the NLI rooftop billboard's slogan
  'place.sign.ceo': 'YOUR CEO',                     // the billboard with your portrait (P1, cityReacts)
  'place.sign.billboard.1': 'FRIES ON A STICK',     // the five street billboards (ART_AUDIO §6)
  'place.sign.billboard.2': 'THINK INSIDE THE LINES',
  'place.sign.billboard.3': 'EVERY CLOUD PAYS',
  'place.sign.billboard.4': 'CASH FOR YOUR STUFF',
  'place.sign.billboard.5': 'BRAIN FREEZE ZONE',
  ```
- **Why:** text goes through `SR.text` keys (ARCHITECTURE §21) and W2-Exterior has no text file.
- **Meanwhile:** the art calls `SR.text.has(key)` first, so these signs stay blank (no `⟦key⟧`, no
  validator error) until the keys land; `tests/sheets/exteriors-detail.html` installs the wording
  above as test fakes (CONTRACT D27), and `tests/node/exterior-detail.test.cjs` lists the pending
  ones as info.

## 2. `js/art/exteriors.js` (W1-G; the lead in wave 2): three painter hooks and one fix

- **(a) The castle's tallest cone tower (a fix).** In `ARCH.castle`, `tallest = towers.reduce(... t.x >
  a.x ...)` picks the first tower with the largest x, the **north-east** turret, but the +40 applies
  only in the `south.forEach` loop, so no tower is ever taller (ART_AUDIO §5.2: "the tallest cone
  tower"). Change to pick among the south towers: `var tallest = south.reduce(function (a, t) {
  return !a || t.x > a.x ? t : a; }, null);` (after `south` is computed). **Meanwhile:** the castle
  shows four equal towers; the detail does not paint over them. **With the fix,** set
  `CASTLE_TALLEST = 40` at the top of `js/art/exteriors-detail.js` in the same change, so the karma
  flags (P1) stay on the raised south-east pennant (the detail picks the same tower).
- **(b) Detail neon.** Add `neon: []` to `detailGeom()`; a detail pushes `{ rect: [x0, y0, x1, y1],
  draw(ctx) }` and `neonFor` bakes each into one more small neon sprite (≤ 256 × 128 device px,
  tube stroke `tone(trim, 1)` with the same glow), so Sticky's beer mug (ART_AUDIO §5.2 "a neon
  beer mug") glows at night. **Meanwhile:** the mug is painted on the albedo (with a neon-yellow
  frame) and only darkens with the grade.
- **(c) A sign lettering style.** Let `SR.def.exterior(id, { signStyle: { role, weight } })` (roles of
  `SR.art.draw.FONTS`, or a `script` stack) choose the font `textOn` uses for the roof sign, the
  canopy and plates **and** the neon trace, so "STICKY'S" can be neon script (ART_AUDIO §5.2)
  without the tube tracing different letters than the paint. **Meanwhile:** Sticky's keeps the
  display face (the trace matches); Fine Line (not a neon building) repaints its roof sign and
  canopy in the thin serif itself.
- **(d) Expose what the painter drew.** Add to `detailGeom()`: `roofSign` (the shop roof sign's board
  rect), `post` (the north porch's sign post `{ x, y, h, w }`) and `tops` (the def's tall roof
  features as rects). **Meanwhile:** the furniture and store details recompute the roof sign board
  from the painter's formula (`g.roofSign ||` fallback in `exteriors-detail.js`) and the castle,
  City Hall, McSticks and casino details read `exterior.tops` from the worldmap entry.
- **(e) Optional: signatures in the occlusion cover.** Add the tall signature rects (those above the
  building's own projected rects, e.g. NLI's rooftop billboard over the north end of Bank Lane) to
  `g.cover`, so a walker the billboard hides fades it like a mass. **Meanwhile:** a 24 u strip of Bank
  Lane (y 1236-1260) under the billboard hides a walker without the fade.
- **Why:** BUILD_PLAN §4.2 gives W2-Exterior the detail; the painter owns sprites, neon and signs.

## 3. `js/render/buildings.js` (W1-G; the lead in wave 2): props that react to the state

- **Change:** in `propKey(p)`, append the prop's state key when the hook exists:
  `+ '|' + (SR.art.props && SR.art.props.stateKey ? SR.art.props.stateKey(p.type, p.variant || 0, p.a || 0) : '')`.
- **Why:** the statue on the plinth (President / Dictator) and the wanted posters on shelters and
  lamp posts (Heat ≥ `tuning.crime.police.posters`) are drawn by `SR.art.props.draw` from the state
  while `cityReacts` is on (GDD §3.14); the prop sprite cache is keyed by type, variant, angle and
  zoom only, so a cached sprite would keep its old look until evicted. `stateKey` returns `''` for
  every static prop (no extra sprites).
- **Meanwhile:** harmless in wave 2 (`cityReacts` is off, every key is `''`); W3-Light needs it.

## 4. `js/render/ground.js` (W1-G; the lead): call the railing and wall painters

- **Change:** in the chunk bake's rim step, call `SR.art.props.railing(ctx, r.a, r.b)` and
  `SR.art.props.wall(ctx, w.a, w.b, w.w)` when they exist, instead of the built-in `railing` /
  `wall` (CONTRACT §15.2 says the ground bake calls them; it currently always draws its own).
- **Why:** ART_AUDIO §6 lists railings (posts every 48 u) and the castle wall among the props.
- **Meanwhile:** the render core's own railings and wall show (they look close); optional.

## 5. `js/render/sky.js` (W1-G; the lead in wave 2, W3-Light in wave 3): count the island sprites

- **Change:** in `stats()`, add `SR.art.skyline.stats().px` (when present) to `px` and `bytes`.
- **Why:** since `SR.art.skyline.draw` replaces the placeholder islands, their six 360 × 260
  sprites (2.2 MB, repainted in place on the 5-minute tint) live in `js/art/skyline.js`; the sky's
  ≤ 6 MB budget (ARCHITECTURE §17) should see them.
- **Meanwhile:** `SR.art.skyline.stats()` reports them; `tests/e2e/exterior.test.cjs` checks the size.

## 6. `tests/sheets/render.html` (W1-G; the lead): load the glyphs and the city names

- **Change:** add `<script src="../../js/art/logos.js"></script>` after `skyline.js` and
  `<script src="../../js/data/text/en-conflict.js"></script>` after `en-world.js`.
- **Why:** the render sheet (and the `render-*` goldens) show the city as the game does; without
  `logos.js` the bank's "$", NLI's lines, the pawn's balls, McSticks' mascot, City Hall's clock and the
  billboards' glyphs are missing there, and without the city names the depot's departures board is blank.
- **Meanwhile:** `tests/e2e/exterior.test.cjs` captures the city through `index.html`, which loads both.

## 7. `tests/visual/goldens/*.json` (W1-Q; the lead): re-record five goldens

- **Change:** `node tests/visual/visual.cjs --record --only exteriors,render-noon,render-dusk,render-night,render-castle`
  (after request 6, if applied).
- **Why:** the building detail, props and skyline change these scenes on purpose (the exteriors
  sheet shows every building's detail; the render views show props, facades and islands).
- **Meanwhile:** `tests/visual/visual.cjs` fails these five (251, 167, 13, 8 and 3 cells).

## 8. `js/data/worldmap.js` (W2-City, fixes only): the props ART_AUDIO §6 lists that the map lacks

- **Change:** add, through the generator's clearance rules (`clearForProp`, 24 u clear of porches,
  ≥ 80 u from unrailed edges): the five billboards (`{ type: 'billboard', variant: 0..4 }`, on lawns
  facing the avenues), a few planters, mailboxes and newspaper boxes on the sidewalks by the doors
  (`planter`, `mailbox`, `newsbox`), and the fountain's jet at its centre (`{ type: 'fountainJet',
  x: 3840, y: 1460 }`; the basin stays baked in the ground). Parked cars (`{ type: 'car', variant:
  0..3, a: <heading°> }`) and ducks at the pond (`{ type: 'duck' }`, P1 park, W3-Park) are drawn too.
- **Why:** ART_AUDIO §6: "billboards (5)", planters, mailboxes, newspaper boxes, "the fountain
  (animated water)", parked cars; `SR.art.props` draws every one of these types.
- **Meanwhile:** these types are drawn on the contact sheet only.

## 9. `docs/CONTRACT.md` §15.2-§15.3 (lead): the additive names and two readings

- **Record:**
  - `SR.art.props`: besides `draw`, `size`, `railing`, `wall`: `stateKey(type, variant, a)` (the
    state a prop's look depends on; `''` when static), `types()`, `variants(type)`; prop types `tree`
    (0 oak, 1 poplar, 2 cloud tree), `lamp`, `bench` (a 90 / 270 along a north-south path; variant 1
    Harold's), `hydrant`, `bin`, `planter`, `mailbox`, `newsbox`, `shelter`, `billboard` (0-4),
    `sawhorse`, `plinth`, `chessTable`, `binoculars`, `car`, `fountainJet`, `duck`, `memorial`,
    `forSale`, `flagpole` (0 city, 1 President, 2 Dictator).
  - `SR.art.skyline`: besides `draw`: `screenOf(view, worldmap, island)`, `cities()`, `invalidate()`,
    `stats()`.
  - `SR.art.logos` (`js/art/logos.js`): `draw(ctx, name, x, y, h, { lw, mono, colour, shade, min,
    outline })`, `aspect(name)`, `names()`, `has(name)`; glyphs `burger`, `lines`, `dollar`, `cloud`,
    `balls`, `mug`, `slushee`, `sofa`, `bus`, `mortarboard`, `clock`.
  - `SR.art.exteriorDetail` (`js/art/exteriors-detail.js`): `stateKey(buildingId, state)`,
    `refresh()` (invalidates `building:<id>` for every sprite whose key changed; a priority-40 boot
    hook calls it on `action:done`, `day:started`, `save:loaded`, `home:changed`, `job:changed`,
    `election:changed`, `karma:changed`, `game:over`), `baked()`, `stateful()`.
- **Readings (please confirm or correct):**
  - **For Sale signs are P0.** GDD §3.4 lists the castle and the mansion as "For Sale until bought"
    and home doors' For Sale mode is P0 (GDD §8), so the boards show on every home you own no tier
    of (Paperview's top floor, the mansion, the castle, Edgeview) without a flag; ART_AUDIO §5.2
    lists them among the P1 reacting elements.
  - **The kid's memorial is P0.** BALANCE's `kid.givePack` row (P0) says the 10th pack leaves "a
    memorial prop"; it shows at his corner (2090, 1110) once `npc.kid.dead`, without a flag. The
    other reacting elements (billboard portrait, castle flags, the butler, the statue, banners,
    wanted posters) are drawn only while `cityReacts` is on.
  - The memorial is painted inside the mansion's sprite (a signature rect at the kid's corner
    widens its bounds), because props are static worldmap entries; W3-Life may move it to a dynamic
    prop list if the render core grows one.

## 10. `js/art/exteriors.js` (lead): the house eaves are cropped by 2 u

- **Change:** in `geom()`, widen the bounds of `house` masses by the pitched roof's eave overhang
  (about 8 u plus half the ink) instead of the shared 6 u pad, e.g. `var pad = arch === 'house' ? 10 : 6;`.
- **Why:** a pixel probe (the review of W2-Exterior: each building baked into bounds widened by 400 u)
  finds the painter's own pixels up to 8 u west of Paperview's and Hillcrest's masses, 2 u outside the
  6 u pad, so the sprite crops a sliver of the west eave and its ink line at every zoom. The detail
  itself stays inside the bounds (`tests/e2e/exterior.test.cjs` checks it).
- **Meanwhile:** nothing; the crop is 2 u wide.
