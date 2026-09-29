# Requests from W2-City (wave 2)

W2-City built the city scene, traffic, pedestrians and the minimap (BUILD_PLAN §4, W2-City).
Each item: the file, the exact change, why, and what W2-City does meanwhile.

## 1. `tests/node/invariants.test.cjs` (W1-W; lead in wave 2): the world action list

- **Change:** the check "the five world actions of ARCHITECTURE §8.3" becomes "the world actions":
  ```js
  T.eq(Object.keys(SR.reg.action).filter((id) => id.indexOf('world.') === 0).sort(),
    ['world.cab', 'world.carCrash', 'world.carFished', 'world.carHit', 'world.city', 'world.enter', 'world.fall', 'world.retire'],
    'the world actions of ARCHITECTURE §8.3 (plus world.city, CONTRACT §8.10, world.retire and the cab stub)');
  ```
- **Why:** CONTRACT §8.10 / ARCHITECTURE §8 (line 762) asks W2-City for the silent, free action
  that runs `['fn', 'election.check']` when you step into the city: `world.city`. BUILD_PLAN's
  W2-City line asks for the cab stub; its time and money go through `SR.act` like everything else,
  so it is an action too: `world.cab` (below). W2-Front's request 2 asks this file for
  `world.retire` (Retire from the pause menu through `SR.act`, applied in review). All three live
  in `js/data/actions/world.js`, the file W2-City owns in wave 2.
- **Meanwhile:** the invariants suite reports 211 passed, 1 failed (only this check).

## 2. `docs/ARCHITECTURE.md` §8.3 and `docs/CONTRACT.md` §8.9 / §15.1 (lead): record the additive names

Nothing frozen changes; these are the names W2-City's files expose.

- **Actions** (`js/data/actions/world.js`):
  - `world.city` — building `world`, silent, `timeRule: 'free'`, `p: 0`, effect
    `['fn', 'election.check']`; the city scene runs it at mount (each time you step outside).
  - `world.retire` — building `world`, silent, `timeRule: 'free'`, `p: 0`, effect
    `['fn', 'endgame.retire']` (W2-RulesE's fn; a timed game is refused with `reason.timedGame`);
    `js/ui/screens/pause.js` (W2-Front) runs it for Retire, and the pipeline emits
    `game:over { reason: 'retire' }`. Text `act.world.retire`.
  - `world.cab` `{ door }` — P1 behind the `phone` feature; requires `['phone']` and
    `['fn', 'world.cabOk']`; cost `{ cash: 'world.cabCash', min: 'world.cabMin' }`
    (`SR.tuning.world.cab.cash` $15 and `.min` 30 minutes, or only what is left of the day; a ride
    that would end past 24:00 goes only to your home door, and at 24:00 takes no minutes). Named
    fns: `world.cabOk`, `world.cabMin`, `world.cabCash`.
- **`SR.world.cab(doorId)`** (js/scenes/city.js): runs `world.cab`, places you at the door
  (`SR.world.place`), toasts `toast.world.cabRide` and brings the city back if needed. For
  W2-Pocket's phone (a Cab row) or anything else that offers a ride; the result is returned.
- **`SR.world.traffic`** (js/world/traffic.js): `update(dt)`, `cars` (the live cars, with
  ARCHITECTURE §8.2's fields `id lane x y a v vTarget kind state honkT`, plus `phase` (= `state`:
  `drop`, `drive`, `tumble`), `len w z visible braking why px py`), `live` (false stops the simulation; the city
  scene sets it on enter/exit), `spawning`, `stats { spawned, exited, despawned, hits, crashes,
  noticed, missed, blocked }`, `last` (the last hit or crash), `skids` (item 5), `noticeChance(karma)`, `reset()`,
  `clear()`, `occupied()`, `zebraClear(zebraId)` (may a walker step onto that crosswalk now),
  `routes`, `net`, `add(routeKey, opts)`, `pick(lane)`, `range()`, `density()`, `probe(car)`,
  `touches(car, x, y, r)`, `overlap(a, b)`, `invalidate()`.
- **`SR.world.pedestrians`** (js/world/pedestrians.js): `update(dt)`, `list` (each walker has
  ARCHITECTURE §8.2's `id x y node next speed archetype look state bark`, plus `facing zebra hopT
  barkT visible px py`; `look` is a look object `{ head: 'npc.<name>', acc, col }`, the third form
  CONTRACT §15.3 lets `SR.art.stick.draw` take), `live`, `stats { spawned, recycled, crossed, waved, barks }`,
  `lastBark`, `target(min)` (hour table × rain × `SR.quality.params.crowd`, ≤ `maxPeds`),
  `reset()`, `clear()`, `invalidate()`, `get(id)`, `archetypes`.
- **The `zebra` field** on world entities: a walker that carries a `zebra` field counts as on a
  crosswalk only while that field holds the zebra id (it has committed to crossing). Entities
  without the field (W2-Street's people, W3-Crime's officers) count by position, so cars stop for
  them on any crosswalk without anything to do on their side. A walker that wants to cross asks
  `SR.world.traffic.zebraClear(id)` first (cars get a 3 s turn after a crossing held them up, and
  keep it, up to 10 s, while a car stands at that crosswalk's stop line waiting for a busy box).
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
- **The city's sounds** (ART_AUDIO §13.5): footsteps (`step`, `step_grass`, `step_paper` on the
  Dog-Ear) every 70 u on foot, `skate_loop` and `skate_push` on the board, `engine_loop` pitched
  by speed and `ignition` in the car, and on entering a door its own sound (`door_bell` shops and
  the pawn shop, `door_whoosh` towers and halls, `door_ding` the casino, `door_creak` the rest);
  the Fold Rescue plays `stingers.fall` and `stingers.rescue` once W2-Music registers them
  (guarded, besides the `fall_whistle` and `plane_swoop` sfx).
- **Actor sources** the city adds while it is up: `city.fold` (the stand-in during the Fold
  Rescue) and `city.sports` (the player's parked sports car; the junker is W2-Street's
  `street.junker`). The minimap hides with the minimal HUD (`.hud.is-minimal`).
- **Text keys:** en-world `act.world.{city,cab,retire,talk,look,junker,car,carAria,action,actionAria,
  skate,skateAria,minimap,minimapOpen,touch}`, `toast.world.{midnight,midnightCab,cabRide}`
  (`toast.world.carFished` now takes `{ money }`, the B-15 tow);
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

## 6. `js/data/tuning.js` (W2-RulesE) and BALANCE B-22 (lead): two crowd numbers the GDD names

- **Change:** add to `tuning.crowd`: `turnRange: 80` (GDD §3.11: idle pedestrians within 80 u turn
  toward the player) and `scurry: 0.2` (GDD §3.11: at karma ≤ -50 one in five scurries), with a
  B-22 row each (*(w2)*).
- **Why:** BUILD_PLAN §1.7: a number the GDD sets and BALANCE lacks is a named constant plus a
  request. Both are P1 (`cityReacts`).
- **Meanwhile:** `js/world/pedestrians.js` holds them as `TURN_R` and `SCURRY_P` and switches to
  `SR.tuning.crowd.turnRange` / `.scurry` once they exist.

## 7. `tests/e2e/world.test.cjs` (W1-W; lead in wave 2): keep traffic out of the headless world

- **Change:** in `install()`, after the helpers, add
  `if (W.traffic) W.traffic.live = false; if (W.pedestrians) W.pedestrians.live = false;`.
- **Why:** the suite drives `SR.world.update` with its own `SR.state` while W2-Front's title scene
  is on the stack, and the title backdrop (`js/ui/screens/title.js`) switches traffic and walkers
  on. Cars then run under the test's player: at the West Ave road end (480, 1319) a car blocks
  the walk off the rim, and three falls lose 10 more HP to a car hit. How far the traffic has got
  depends on how many real frames the title ran before the harness paused the loop, so the suite
  is flaky: three standalone runs failed 3 checks ("falls trigger at 200 sampled unrailed edge
  points" 199, "no sample failed to fall", "every fall costs 10 HP"), with W2-City's traffic.js
  before and after this review alike, while it passed inside `tools/run-all.cjs`. Traffic is right
  to run under the title (no game: no player to hit) and in the city.
- **Meanwhile:** nothing on W2-City's side.

## Answers to requests addressed to W2-City's files

- **W2-Front 2** (`world.retire` in `js/data/actions/world.js`, `act.world.retire` in
  `en-world.js`): applied as asked (tested in `tests/e2e/city.test.cjs`: a timed game is refused,
  an Unlimited run retires with `Result.over` and `game:over { reason: 'retire' }`;
  `tests/e2e/frontend.test.cjs` passes on the SR.act path).
- **W2-Exterior 1** (`place.sign.*` words in `en-world.js`): applied.
- **W2-Exterior 8** (billboards, planters, mailboxes, newspaper boxes, the fountain jet, parked cars
  and ducks in `js/data/worldmap.js`): not applied in wave 2. W2-City holds the worldmap for
  fixes only (BUILD_PLAN §4.1); the new types are not solids in `js/world/geometry.js` (W1-W), so
  people and cars would pass through them, parked cars need bays the map lacks (every lane carries
  traffic), and the visual goldens move. Forwarded to the lead for wave 3, when W3-Park holds the
  worldmap, together with the solids.
- **W2-Pocket 3** (Tab keeps its browser default in the city): applied.
- **W2-Street 1** (the street people's barks): applied (`barks()` shows `bark` while `barkT > 0`
  over the name tag). **W2-Street 2** (parked cars, a note): the city now draws the player's
  parked sports car (`city.sports`); the junker stays W2-Street's `street.junker`.
