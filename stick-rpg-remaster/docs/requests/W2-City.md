# Requests from W2-City (wave 2)

W2-City built the city scene, traffic, pedestrians and the minimap (BUILD_PLAN §4, W2-City).
Each item: the file, the exact change, why, and what W2-City does meanwhile.

## 1. `tests/node/invariants.test.cjs` (W1-W; lead in wave 2): the world action list

- **Change:** the check "the five world actions of ARCHITECTURE §8.3" becomes "the world actions":
  ```js
  T.eq(Object.keys(SR.reg.action).filter((id) => id.indexOf('world.') === 0).sort(),
    ['world.cab', 'world.carCrash', 'world.carFished', 'world.carHit', 'world.city', 'world.enter', 'world.fall'],
    'the world actions of ARCHITECTURE §8.3 (plus world.city, CONTRACT §8.10, and the cab stub)');
  ```
- **Why:** CONTRACT §8.10 / ARCHITECTURE §8 (line 762) asks W2-City for the silent, free action
  that runs `['fn', 'election.check']` when you step into the city: `world.city`. BUILD_PLAN's
  W2-City line asks for the cab stub; its time and money go through `SR.act` like everything else,
  so it is an action too: `world.cab` (below). Both live in `js/data/actions/world.js`, the file
  W2-City owns in wave 2.
- **Meanwhile:** the invariants suite reports 211 passed, 1 failed (only this check).

## 2. `docs/ARCHITECTURE.md` §8.3 and `docs/CONTRACT.md` §8.9 / §15.1 (lead): record the additive names

Nothing frozen changes; these are the names W2-City's files expose.

- **Actions** (`js/data/actions/world.js`):
  - `world.city` — building `world`, silent, `timeRule: 'free'`, `p: 0`, effect
    `['fn', 'election.check']`; the city scene runs it at mount (each time you step outside).
  - `world.cab` `{ door }` — P1 behind the `phone` feature; requires `['phone']` and
    `['fn', 'world.cabOk']`; cost `{ cash: 'world.cabCash', min: 'world.cabMin' }`
    (`SR.tuning.world.cab.cash` $15 and `.min` 30 minutes, or only what is left of the day; a ride
    that would end past 24:00 goes only to your home door, and at 24:00 takes no minutes). Named
    fns: `world.cabOk`, `world.cabMin`, `world.cabCash`.
- **`SR.world.cab(doorId)`** (js/scenes/city.js): runs `world.cab`, places you at the door
  (`SR.world.place`), toasts `toast.world.cabRide` and brings the city back if needed. For
  W2-Pocket's phone (a Cab row) or anything else that offers a ride; the result is returned.
- **`SR.world.traffic`** (js/world/traffic.js): `update(dt)`, `cars` (the live cars; each has
  `x y a kind len w v phase z visible braking why`), `live` (false stops the simulation; the city
  scene sets it on enter/exit), `spawning`, `stats { spawned, exited, despawned, hits, crashes,
  noticed, missed, blocked }`, `last` (the last hit or crash), `skids` (item 5), `noticeChance(karma)`, `reset()`,
  `clear()`, `occupied()`, `zebraClear(zebraId)` (may a walker step onto that crosswalk now),
  `routes`, `net`, `add(routeKey, opts)`, `pick(lane)`, `range()`, `density()`, `probe(car)`,
  `touches(car, x, y, r)`, `overlap(a, b)`, `invalidate()`.
- **`SR.world.pedestrians`** (js/world/pedestrians.js): `update(dt)`, `list` (each walker has
  `x y kind look state zebra hopT`), `live`, `stats { spawned, recycled, crossed, waved, barks }`,
  `lastBark`, `target(min)` (hour table × rain × `SR.quality.params.crowd`, ≤ `maxPeds`),
  `reset()`, `clear()`, `invalidate()`, `get(id)`, `archetypes`.
- **The `zebra` field** on world entities: a walker that carries a `zebra` field counts as on a
  crosswalk only while that field holds the zebra id (it has committed to crossing). Entities
  without the field (W2-Street's people, W3-Crime's officers) count by position, so cars stop for
  them on any crosswalk without anything to do on their side. A walker that wants to cross asks
  `SR.world.traffic.zebraClear(id)` first (cars get their turn after a crossing held them up).
- **`SR.render.minimap`** (js/render/minimap.js): `SIZE`, `toMap(x, y)`, `toWorld(mx, my)`,
  `waypoint(x, y)` / `waypoint(null)` (a pin; the minimap also shows
  `state.journal.waypoint` when set — for W2-Pocket's map), `draw(canvas)`, `tick(canvas, t, force)`
  (10 Hz), `invalidate()`.
- **Street talk convention** (the city scene, ARCHITECTURE §8.3 "a street person →
  `SR.scenes.push('dialog', { person })`"): when `SR.world.streetnpcs.talk(id, entity)` exists the
  city calls it and W2-Street owns the dialog. Otherwise the city opens `SR.ui.dialog` itself with
  the rows of `SR.rules.act.actions('street:' + id)` (an action's `number` def becomes the dialog's
  number field), a Leave row, and the greeting from fn `greet.<id>`, then `person.greetings`, then
  the text key `greet.<id>`. A row that opens a minigame runs it and its `:resolve` like a card.
- **The city scene def** has `get music()` (crossroads_strut by day, streetlights from 19:30 to
  05:30, rain variant) and `debug { prompt(), talk(id), songFor(min), song() }` for tests.
- **Text keys:** en-world `act.world.{city,cab,talk,look,junker,car,carAria,action,actionAria,
  skate,skateAria,minimap,minimapOpen,touch}`, `toast.world.{midnight,midnightCab,cabRide}`;
  en-city `bark.ped.<context>.1-3` and `vm.carhit.1-3` (vars `{ n, money, cheque }`).
- **Why:** so the other wave-2 and wave-3 packages (W2-Street, W2-Pocket, W3-Crime, W3-Light,
  W3-Park) can use them without guessing.
- **Meanwhile:** implemented as listed.

## 3. `css/components.css` (W1-D; lead in wave 2): the city's touch cluster and minimap classes

- **Change:** add
  ```css
  .city-minimap { position: absolute; right: 16px; bottom: 16px; width: 184px; height: 184px; padding: 0;
    border: var(--line); border-radius: var(--r-m); background: var(--paper-0); box-shadow: var(--e-2);
    overflow: hidden; cursor: pointer; z-index: var(--z-hud); }
  .city-minimap canvas { display: block; width: 184px; height: 184px; }
  .city-touch { position: absolute; right: 16px; bottom: 16px; width: 272px; height: 96px;
    pointer-events: none; z-index: var(--z-hud); }
  .city-touch-btn { position: absolute; padding: 0; border-radius: var(--r-pill); display: flex;
    flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    pointer-events: auto; touch-action: none; }
  ```
  (each button's size and place — Car and Skate 64 px at `right` 192 / 112 px, Action 96 px at the
  corner — and the touch minimap's `top: 104px` stay on the elements).
- **Why:** UI.md keeps component styles in the stylesheet; W2-City cannot edit css/.
- **Meanwhile:** js/scenes/city.js sets the same values as inline styles, using only the CSS
  variables of tokens.css (no colour literals). Once the classes land, W2-City (or the lead)
  drops the inline copies.

## 4. `js/ui/hud.js` / `css/components.css` (W1-D; lead in wave 2): the HUD clips at 844 × 390

- **Change:** in the compact HUD (phone landscape, `SR.stage.compact`), let the right-hand cash /
  pocket card shrink or wrap so it fits inside the 16 px gutter; at 844 × 390 its right edge (the
  pocket buttons) runs past the screen.
- **Why:** seen in `shots/W2-City/city-touch-844x390.png`; the minimap and the touch cluster sit
  under it on the right, and UI.md §5.5 asks for the whole HUD on a phone.
- **Meanwhile:** nothing on W2-City's side; the city's own touch layout (row of Car / Skate /
  Action, minimap below the HUD at `top: 104px`) is tested not to overlap at that size.

## 5. `js/render/renderer.js` (W1-G; lead in wave 2): draw the skid marks in the ground pass

- **Change:** in `frame()`, right after `call('ground', 'draw', ...)` and before the shadows, draw
  `SR.world.traffic.skids` (by convention, like the cars of §8.6) under everything else, in the
  world transform:
  ```js
  var Tr = SR.world && SR.world.traffic, V = SR.art && SR.art.vehicles;
  if (Tr && Tr.skids && Tr.skids.length && V && V.skid) {
    ctx.save(); worldTransform(ctx);
    for (var i = 0; i < Tr.skids.length; i++) { var k = Tr.skids[i]; V.skid(ctx, k.kind, k.a, k.x, k.y, k.len, k.alpha); }
    ctx.restore();
  }
  ```
- **Why:** ART_AUDIO §8 asks for skid marks on hard braking, and js/art/vehicles.js's `skid()` says
  "traffic decides when a car brakes hard; the ground pass draws the marks under the cars". Traffic
  now keeps them (`{ kind, a, x, y, len, alpha, t }`, at most 16, each fading over 8 s; only an
  emergency stop from 240 u/s or faster lays one, with the `brake` squeal). Nothing outside the
  renderer can add to the ground pass (no hook), and drawing them after the frame would put them
  over the cars.
- **Meanwhile:** the marks exist in `SR.world.traffic.skids` (tested in tests/e2e/traffic.test.cjs)
  but are not drawn.
