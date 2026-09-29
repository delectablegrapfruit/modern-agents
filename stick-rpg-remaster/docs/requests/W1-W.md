# Requests from W1-W (World geometry), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3).

## 1. `js/data/tuning.js` (W1-R; W2-RulesE in wave 2) and BALANCE B-15: seven world numbers

- **File:** `js/data/tuning.js`, table `world` (and the B-15 table in `docs/BALANCE.md`, lead).
- **Change:** add these keys to `SR.tuning.world` (the design names the values, B-15 does not):

  ```js
  skateAccel: 0.25,        // GDD §3.8: skateboard and Pro Deck reach top speed in 0.25 s
  carRange: 64,            // GDD §3.8: C / Y enters or leaves your car within 64 u of it
  carRadius: 26,           // GDD §3.8: a car is 96 × 52; its collision capsule has half its width...
  carLength: 96,           // ...and its length along the heading
  driveZoomEase: 0.6,      // GDD §3.7: driving eases the zoom one level out over 0.6 s
  teeterAssistMs: 300,     // UI §8: Assist's longer teeter grace
  navCacheSec: 1,          // ARCHITECTURE §8.2: nav paths are cached for 1 s
  ```
- **Why:** BUILD_PLAN §1.7 (numbers come from `SR.tuning`).
- **Meanwhile:** `js/world/world.js` keeps them as named constants (`LOCAL`) and reads
  `SR.tuning.world.<key>` first, so adding the keys under these names takes effect with no change.

## 2. `js/data/tuning.js` (W1-R): freeze the `world` field names

- **Change:** keep the current names: `surfaceDrive.cap`, `park.range`, `door.trigger.offset`,
  `camera.lookAhead`, `projection.k`, `fall.total`, `fall.skipAfter`, `carHit.knockdown`.
- **Why:** they changed once during wave 1 (from `sidewalkCap`, `kerbRange`, `out`, `lookAheadSec`,
  `zFactor`, `totalSec`, `skippableAfter`, `knockdownSec`).
- **Meanwhile:** `js/world/world.js` accepts both spellings; `tests/node/invariants.test.cjs`
  fails if any world number stops resolving (`SR.world.cfg.missing` must be empty).

## 3. `js/rules/night.js` (W1-E; W2-RulesE in wave 2): the car-hit voicemail at step 11

- **Change:** in step 11, when `s.flags.carHitVm` is set, queue one of the three ambulance-chaser
  voicemails (`vm.carhit.1` … `vm.carhit.3`, text by W2-City in `en-city.js`); with probability
  `tuning.world.carHit.settlement.chance` (0.2) it carries a settlement cheque of
  `base + rand(rand[0]..rand[1])` ($50-$200, income `src` `'prize'`); then clear the flag.
- **Why:** GDD §3.10 / B-15 `carHit`: "one of three voicemails the next morning, 20 % with a
  settlement". `world.carHit` (`js/data/actions/world.js`) sets `['flag', 'carHitVm', true]`;
  the night is the only place that runs "the next morning".
- **Meanwhile:** the flag is set and nothing reads it (no voicemail yet). The tow of a car fished
  out of the clouds already works: `world.carFished` sets `player.cars.<car>.towed` and night step 10
  charges $100 and returns it to its home lot.

## 4. `js/data/decrees.js` (W1-C): the Guard Rails decree id

- **Change:** none. W1-C registered *Guard Rails for All* as `guardRails` (camelCase, against
  CONTRACT §3.1's `snake_case` for content ids); if W2-RulesC renames it to `guard_rails`, nothing
  breaks.
- **Why:** `SR.world.safeEdges()` (collisions make every edge bounce, no falls) is on while
  `access.safeEdges` is set **or** `state.election.decrees` contains the decree (GDD §3.9, §4.17).
- **Meanwhile:** the world checks both `guardRails` and `guard_rails`.

## 5. `tools/validate.cjs` (W1-Q): references the worldmap and the world actions make

- **Change:** accept, or report as stub-era warnings under `--wave 1`:
  - `worldmap.buildings[].exterior.palette` is a palette key naming an **object** (`bld.<id>`, whose
    leaves are `walls`, `shade`, `roof`, `trim`), as in the ARCHITECTURE §8.1 example;
  - `exterior.detail` names an `SR.def.exterior` id (W2-Exterior, wave 2) and `exterior.sign` a
    text key `place.sign.<id>` (`en-world.js`);
  - `worldmap.interactables[].action` names W3-Park's walk-up actions (`park.lookout`, `park.ducks`,
    `park.chess`, `park.bench`, `park.skate`, `park.jog`, `park.preacher`; `p: 1`, `feature: 'park'`),
    registered in wave 3;
  - the `hpAbove` rule: the five `world.*` actions are involuntary (falls, car hits and crashes are
    what may take HP to 0; ARCHITECTURE §6.3). Their damage runs W1-R's `hurt` effect through
    `SR.rules.effects.run` inside the named fns `world.fall`, `world.carHit`, `world.carCrash`, so
    a literal "every `hurt` in a def has `hpAbove`" check does not see it; if the validator
    inspects named fns, it should exempt the causes `fall`, `carHit` and `carCrash`.
- **Why:** BUILD_PLAN §1.6 (the validator passes on the package's files).
- **Meanwhile:** nothing; the world data follows ARCHITECTURE §8.1's example.
- **Status (review):** the landed `tools/validate.cjs --wave 1` reports 0 errors on the world files;
  the `park.*` actions and the `exterior.detail` ids are stub-era warnings until W3-Park and
  W2-Exterior land.

## 6. `docs/CONTRACT.md` §15 and ARCHITECTURE §8 (lead): the world's additive public names

- **Change:** record these names (additive; the frozen ones of §15 are implemented as written):
  - `SR.world`: `ready`, `time`, `cfg` (the B-15 numbers), `entities(kind)` (`'car'`, `'ped'`,
    `'person'`, `'police'`: the live entity array of `traffic`, `pedestrians`, `streetnpcs`, `police`
    under the names the renderer reads: `cars` / `peds` / `people` / `officers`, or `list`),
    `build()`, `start(s)` (the player from
    `state.player`, in the car named by `driving`), `place(spec, s)` and `spawnPoint(spec, s)`
    (`'newGame'`, `'afterJail'`, `'afterHospital'`, a door id, `'homeDoor'`, `[x, y]`), `homeDoor(s)`,
    `teleport(x, y)`, `sync(s)` (positions → `state.player`, once a second and on scene changes),
    `onAction(action)` (`interact`, `car`, `zoomIn`, `zoomOut`, `zoomCycle`; any action skips a
    fall after 0.5 s), `readInput()`, `safeEdges(s)`, `assist()`; `update(dt, input?)` takes an
    optional `{ x, y, skate }` input (tests, headless walkers).
  - `SR.world.geometry`: `bounds`, `polygon`, `edges` (`{ a, b, railed, out }`), `solids`,
    `buildings[id]` (`projected`, `tops`, `signature`, `door`), `doors`, `doorById`, `porches`,
    `lanes`, `graph` (`{ nodes, edges: [a, b, zebraId], adj }`), `onGround`, `walkable(x, y, r)`,
    `surfaceAt` (`asphalt`, `sidewalk`, `path`, `plaza`, `lawn`, `hole`, `sky`), `zebraAt`,
    `nearestEdge`, `nearEdge(x, y, m, railed)`, `solidAt`, `solidsNear`, `solidDist`, `project`,
    `projected(id)`, `projectedRects()`, `util`.
  - `SR.world.collide`: `dynamic` (the per-step dynamic hash of ARCHITECTURE §8.2, rebuilt at the
    start of every `SR.world.update` from `entities()`: `near(x, y, r, kinds?, out?)`, `add(e, kind)`,
    `rebuild()`, `clear()`, `count`); `move(body, dx, dy)` also takes `body.len` and `body.a` (a car's
    96 × 52 capsule along its heading).
  - `SR.world.nav`: `reachable(x, y)`, `nearest(x, y, minInside)`, `lineClear`, `gridClear`,
    `segmentInside`, `cellAt`, `center`, `connected`, `walk`, `stats`.
  - `SR.world.player`: `walkTo(x, y)` (click-to-walk; a click on a building routes to its door),
    `toggleCar()`, `board(car)`, `park(x, y, a)`, `carNear()`, `knock(sec)` (the car-hit knockdown),
    `hopAside(entity)`, `cancelRoute()`, `topSpeed()`, `hasBoard()`, `doorAt(x, y)` (the door a click
    means: a porch or trigger, else the frontmost building hit); fields `car`, `a`, `v`, `route`,
    `surface`, `lastSafe`, and `px`, `py` (the position at the start of the last step: the renderer
    interpolates by alpha) besides ARCHITECTURE §8.2's.
  - `SR.world.doors`: `prompt` (`{ kind: 'enter'|'park', door, name, verb }`), `tags`, `last`,
    `enter(id, via)`, `exit(id?)`, `interact()`, `parkAndEnter(id)`, `kerbHeading(door, a)`, `tagFor(id)`, `doorHomes(id)`,
    `disarmNear(x, y)`, `go(resolution)` (the scene change: `SR.scenes.go('building', { id, params },
    { transition: 'doorZoom' })`).
  - `SR.world.fall`: `phase` (`none`, `teeter`, `drop`, `catch`, `land`), `t`, `x`, `y`, `to`, `car`,
    `saved` (the last teeter save: "Phew"), `last`, `active()`, `skip()`, `focus()`.
  - `SR.world.camera`: `x`, `y`, `px`, `py` (the centre at the start of the last step), `zoom`,
    `level`, `target`, `snap`, `setLevel`, `zoomIn`, `zoomOut`, `cycle`, `view()`,
    `toScreen(x, y, z)`, `toWorld(sx, sy)`, `bounds()`.
  - **People hop aside:** a module that owns walkers (`SR.world.pedestrians`, `streetnpcs`,
    `police`) exposes them as an array (`peds` / `people` / `officers`, or `list`; see `entities`) of
    `{ x, y, visible?, active?, state, bark, hopT }`; the player's car moves any within reach of
    its body 24 u aside (`state: 'hop'`, `hopT: 0.6`, `bark: 'toast.world.hey'`) and never hurts them.
  - **Driving into a door:** like walking, the car enters (parks and enters on foot) only while it
    moves within 45° of the way in, so driving along a sidewalk past a door never enters it.
  - **worldmap fields beyond §8.1's example:** `pockets`, `jogLoop`, `links` (lawn walkways joining
    the jog loop and Margin Path to the sidewalk graph), `features` (fountain, plinth, pond, skate
    bowl, duck spot, chess tables, Harold's bench, busker spot, the Bite, the Dog-Ear), `spots`
    (people's places, for `data/people.js` placeIds), `skyRibbon`; per building `name`, `orig`,
    `homes` (a home door's tiers), `exterior.roof`, `exterior.floors`, `exterior.tops` (tall roof
    features: turrets, the dome, the roof sign, the dice) and `exterior.signature` (rects in
    projected space, x, y - 0.5 z).
- **Why:** later packages (W1-G, W2-City, W2-Street, W2-Transit, W3-Park) build on them.
- **Meanwhile:** they are documented in the files' JSDoc and the W1-W report.

## 7. Notes for later packages (no change requested)

- **W2-City (city scene):** on `enter`, `SR.world.start(SR.state)` for a new or loaded game, or
  `SR.world.doors.exit()` when coming back from a building; call `SR.world.update(SR.STEP)` each
  step and forward presses with `SR.world.onAction(action)`; click / tap to walk is
  `SR.world.player.walkTo(p.x, p.y)` with `q = SR.stage.toLogical(cx, cy)`, `p =
  SR.world.camera.toWorld(q.x, q.y)`; the ContextPrompt and door tags come from
  `SR.world.doors.prompt` and `.tags` (the prompt stays the same object while it names the same
  door, so a new object means a new prompt to announce; the tags array is reused); "Phew" is
  `SR.world.fall.saved`; the Fold Rescue plays from `SR.world.fall.phase / t / x / y / to`;
  traffic calls `SR.world.player.knock()` and `SR.act('world.carHit')` on a hit and
  `SR.act('world.carCrash')` on a crash; traffic and pedestrians can query
  `SR.world.collide.dynamic.near(x, y, r, kinds)` (rebuilt each step from their own arrays) and move
  walkers with `SR.world.collide.move` (allocation-free apart from its result).
- **W2-Transit:** after jail `SR.world.place('afterJail')`; after the hospital
  `SR.world.place('afterHospital')` (outside the lived-in home's door).
- **W1-G:** `SR.world.camera.x / y / zoom` and `toScreen`; `px` / `py` on the camera and the player
  for the alpha interpolation `js/render/renderer.js` and `actors.js` already do; projected rects,
  porches and signature rects for the `projected` overlay; `SR.world.nav` and `geometry.solids` for
  the `grid` overlay.
