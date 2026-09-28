# Ronin core for the web — `core.js` + `ronin.wasm`

The game's real Swift code (RoninCore: the fight, the career; RoninArt: the figures as vector shapes, the ragdolls)
compiled to WebAssembly, behind a small JavaScript API. `core.js` is an ES module with no dependencies (it carries its
own minimal WASI shim). Everything below is what the macOS app (`Sources/Ronin`) reads, named as the Swift names it.

## Building

```sh
web/build.sh           # → web/dist/ronin.wasm and web/dist/core.js
web/build.sh --test    # and run web/test/core.test.mjs on the result (Node 22+)
```

Needs Docker (image `swift:6.0`, Swift 6.0.3). The SwiftWasm 6.0.3 SDK is downloaded once into
`$RONIN_WASM_CACHE` (default `~/.cache/ronin-wasm`), where the build also goes. `wasm-opt -Oz` runs when `wasm-opt`
is on the PATH (or via `npx binaryen` when Node is; `RONIN_WASM_OPT=0` skips it, `RONIN_WASM_OPT=/path/to/wasm-opt`
picks one). `web/dist/` is not committed.

The web package (`web/Package.swift`) depends on the root package by path; the root package, the app and CI are
untouched by it. For WASI, RoninCore and RoninArt import no Foundation at all (`#if os(WASI)`: WASILibc for the
maths, a few Core Graphics value types from `Geometry+WASI.swift`, the SVG preview writer and `SaveGame.load(Data)`
left out); on every other platform they are exactly as before.

## Loading

```js
import { loadCore, drawSketch } from './core.js';
const core = await loadCore('ronin.wasm');          // a URL, an ArrayBuffer / typed array, or a WebAssembly.Module
```

`loadCore` fetches the bytes and instantiates them itself (it does not need the server's `application/wasm` MIME
type). It throws an `Error` with a readable message if WebAssembly is missing or blocked (e.g. a CSP without
`'wasm-unsafe-eval'`), if the fetch fails, or if the file is not the module. Options: `loadCore(src, { log, error })`
receive anything the Swift runtime prints (default: the console).

All calls are synchronous after loading. Any call given bad arguments throws `Error('Ronin core: …')`.

## The frame loop

```js
core.newGame({ seed: 42 });            // or core.loadSave(localStorage.ronin)
// each animation frame:
const events = core.advance(dt);      // seconds since the last frame (the fight steps at 1/120 s inside)
const s = core.state();               // everything to draw this frame
// on input:
const more = core.strike('left');     // or 'right'
// after the fight has ended (s.outcome), when the player clicks the banner:
core.next();
// when the app would have saved (after an outcome, every 10 s of play, after a menu action):
if (s.saveDue) localStorage.ronin = core.saveJSON();
```

`advance` and `strike` mirror `GameSession.advance` / `strike`: they apply the crowd rules, step the fight, and when
it ends book it into the career (rank, runs, records) at once.

## API

### Career and fight

| call | returns | what it is in the app |
|---|---|---|
| `newGame({seed?, mode?})` | `true` | a new `Career(seed:)` (random seed when left out) and its first fight. Keeps the rules and the autopilot. |
| `loadSave(json)` | bool | `SaveGame.load`: the career and fight in progress (an older save keeps its career, its stage rolled afresh). `false` if not even the career reads. |
| `saveJSON()` | string | the save file, exactly what the app's `Store` writes (`SaveGame` as JSON). Keep it as text: it holds 64-bit seeds. Clears `saveDue`. |
| `career()` | object | see **career()** below |
| `begin({mode?, stage?, endless?})` | bool (changed) | `mode`: Difficulty menu (`choose`). `endless: true`: Endless menu, a run on `stage` (default the current stage). `endless: false`: back to the campaign. `stage` without `endless`: the campaign jumped to that stage (`jump`). Nothing given: nothing changes. |
| `next()` | `true` | clicking the banner after an outcome (`GameSession.next`): the next stage after a win, the run's start after a fall. Also usable any time: a fresh fight of what the career says is next. |
| `restart()` | `true` | menu Restart Stage (walks away from the fight, hearts lost stay lost, kills count); on a finished fight: Next Stage / Start Over. `career().restartTitle` is the menu item's text. |
| `choose(mode)` | `true` | Difficulty menu: `'shoshin' | 'bushido' | 'shura' | 'oni'` (also `'Bushidō'`, or 0–3). |
| `startEndless(stage)` | `true` | Endless menu: a run on an unlocked stage (clamped to `career().unlocked.to`). |
| `leaveEndless()` | `true` | Endless menu's Campaign item. |
| `jump(stage)` | `true` | development: the campaign moved to any stage. |
| `reset({seed?})` | `true` | Reset Career (the mode kept). |
| `setAutopilot(on)` | bool | the fight played by the perfect pilot (`Fight.autopilot`); carried to the next fight by `next()`. |
| `setRules(partial)` | rules | Development menu crowd rules (`Crowding`): the fields given change, the rest stay. `setRules(core.standardRules())` restores the game's. |
| `rules()` / `standardRules()` / `queueRules()` | rules | the rules in use / `Crowding.standard` / `Crowding.queue` |
| `advance(dt)` | events[] | `GameSession.advance(dt)` |
| `strike(side)` | events[] | `GameSession.strike`; `side`: `'left' | 'right'` (or -1 / 1) |
| `state()` | object | see **state()** |
| `stage(stage?, mode?)` | object | see **stage()** |
| `banner()` | object or null | the banner over a finished fight (also `career().banner`) |
| `raiseBruteClub(side)` / `setWarlordGuard()` | id / true | the app's self-test situations |

Rules object: `{passThrough, slipPast, runnersPassAll, passBusy, shove, noBruteKnockback, isStandard, passes}`.
The rules are not part of the save (in the app they are a preference); keep them yourself if they should persist.

The Development menu's "Queue" item: `setRules({passThrough:false, slipPast:false, runnersPassAll:false, passBusy:false, shove:false})`
(or, when already a queue, back to the game's passing rules).

### Events

`advance` and `strike` return plain objects, one per `FightEvent`, in order. `type` is the Swift case name. Events
about a foe also carry `kind`, `x` and `bearer` as he was when it happened (a foe cut down is gone from the next
`state()`).

| type | fields |
|---|---|
| `arrived` | `foe` (+kind, x, bearer) |
| `warlord` | `foe` — the boss stepped onto the lane |
| `cut` | `side`, `foe`, `killed` |
| `whiff` | `side` — a cut at nothing: the ronin stumbles |
| `deflected` | `side`, `arrow` |
| `loosed` | `archer`, `arrow` |
| `pierced` | `foe`, `arrow`, `killed` — a deflected arrow found a foe |
| `raised` | `foe` — raised his weapon (or drew his bow) |
| `wounded` | `foe` (null for an arrow), `damage`, `arrow` (bool) |
| `leapt` / `landed` | `foe` |
| `bloodlust` | `on` |
| `milestone` | `combo` — every 25th link |
| `flung` | `foe` — the gourd-bearer fell, the gourd is in the air (`state().gourd`) |
| `healed` | `foe`, `restored` — the gourd caught: a heart back, or points with none missing |
| `shattered` / `fled` | `foe` |
| `shard` | `foe`, `count` — sen-no-sen |
| `mended` | `restored` — shards made a heart |
| `scattered` | `count` |
| `guarded` | `foe` — the warlord began to raise his guard |
| `parried` | `side`, `foe` |
| `summoned` | `foe`, `allies` (ids) |
| `turned` | `side`, `foe` — the brute's blow turned aside at the glare |
| `ended` | `outcome`: `'victory' | 'defeat'` |
| `promotion` | `rank` — bridge-only: the booked fight earned a rank (after `ended`) |

### state()

One call per frame (≈60 µs). Numbers are lane units (the ronin at 0, the panel shows −1…1, foes enter at
±`Tuning.edge`) and seconds.

- Fight: `stage, mode, endless, seed` (decimal string), `setting` (name), `settingIndex, time, outcome` (null,
  `'victory'`, `'defeat'`), `hp, maxHP, shards, score, bonus, runScore` (the run so far, `GameSession.runScore`),
  `combo, multiplier, bloodlust` (`inBloodlust`), `reach, gourdBonus, remaining, progress, arrived, defeated,
  rosterCount, roster` (kinds in order), `bearerIndex, healed, bossID, spawnTimer, difficulty` (`{stage, mode, pace,
  windup, interval, crowd, pairs, boss, warlordHP, dancerHP}`), `stats` (`{kills, cuts, whiffs, deflects, arrowKills,
  wounds, damage, bestCombo, parried, glanced, turned}`), `rules`.
- Session: `autopilot, promotion` (rank earned by the fight just booked, or null), `saveDue` (the app would have saved
  by now), `attempt`.
- `hero`: `{facing, stumble, isStumbling, cooldown, held}` (`held`: a cut pressed during the cooldown, or null).
- `target`: `{left, right}` — what a cut each way would hit now (`Fight.target`): `{type:'foe', id}`,
  `{type:'arrow', id}`, `{type:'gourd'}` or null.
- `foes[]`: `id, kind, x, side` (`Foe.side`: the landing side while leaping), `laneSide` (`Side.of(x)`), `distance, gap,
  phase` (`advancing | windup | recoil | leaping | aiming | dying | guarding | fleeing`), `timer, span, progress, hp,
  maxHP, hits, speed, windup, leapFrom, leapTo, bearer, hover, darting, darts, lingered, guardRest, chained, summons,
  alive, targetable, contact, width` (`kind.width`), `guardAge, guardSet, senNoSen, readying, clubGlares, turns`
  (`Fight.turns(foe)`: a cut now turns the brute's blow), `isBoss`.
- `arrows[]`: `id, from, x, velocity, deflected, side`.
- `gourd`: null or `{from, start, land, timer, span, progress, x, catchable, side}`.

### career()

`seed, mode, modeTitle, stage` (the campaign's), `current` (the next fight's stage), `cleared` (highest cleared),
`unlocked {from, to}`, `carried, carriedShards, isEndless, endless` (run or null), `run` (the run in progress),
`runScore, bestCampaignRun, bestEndlessRun` (on the endless run's stage), `bestEndless` (most clears in a row, this
mode), `attempt, kills, merit, rank, nextRank {kills, title, killsNeeded}` or null, `falls, flawless, bestCombo,
bestScore, score, streak, lastRun, lastRunIsBest, promotion, autopilot, restartTitle`, `modes[]` (the Difficulty menu:
`{mode, title, gist, hearts, maxHearts, stage, reached, cleared, bestCampaignRun, bestEndless, kills, selected}`),
`endlessStages[]` (the Endless menu: `{stage, warlord, best, selected}` for every unlocked stage; the app thins the list
past 30 to 1, every fifth and the last), `byMode` (the raw books: `stages, hearts, shards, reached, highest,
bestEndless, killsByMode, runs, bestRuns`), and `banner`.

A run: `{start, stage, hearts, shards, cleared, score, kills, bestCombo}`.

`banner` (null while the fight goes on), as `DuelScene.showBanner` builds it: `{outcome, title` (`FLAWLESS | CLEARED |
FALLEN`), `stats: [{icon, text}]` (icons `skull, swords, clock`, or after a fall `steps | infinity, skull, swords`),
`score, caption` (after a fall: `STAGE n`, where it sends him), `bestRun, marks` (e.g. `['SWORD SAINT', 'BEST RUN']`),
`action` (`play | again`)}.

### stage(stage, mode)

`{stage, mode, modeTitle, setting, settingIndex, boss, introduces` (kind first met here, or null), `difficulty,
rosterSize, kinds` (relative weights of what can come), `card, tips}`.

`card` is the stage's title card (`DuelScene.introduce`): `{title: 'STAGE n', subtitle: 'BUSHIDŌ   ·   CRIMSON
DUSK', endless, crest` (a warlord stage with nothing new), `lines: [{icon, kind?, text}], hold}`. Icons: `buttons`
(which mouse button cuts which way; `unlessHintShown`: the app skips it once learnt or with floor hints on),
`figure` (the new kind's idle figure, tinted gold), `crest` (warlord), `gourd`, `infinity`, `shards`. `hold`: seconds
the card stays up between fading in (0.18–0.22 s) and out (0.3 s). `tips`: each kind's line, as the card words it
under the current rules.

### Figures

- `core.tuning` — constants: `Tuning.*`, `kinds.{grunt…}` (`title, baseHP, speed, windup, damage, range, width,
  bounty, tip`), `modes.{shoshin…}` (`title, gist, level, hearts, pace, windup, interval, stumble, crowd, reach,
  score, rankWeight`), `kindOrder, modeOrder, settings` (names by index), `ranks` (the ladder), `cuts` (cut names),
  `Frame.*` (frame counts: `cutFrames, walkFrames`, …), `Figure` (`canvas {width, height}` in figure heights, `feet`,
  `anchor`, `struckVariants, retreatStep, clashGap`, and per cast `casts.{hero…}`: `pixelHeight, height` (the build's
  height, ronin = 1), `unit` (sketch pixels per figure height), `stride`, `width, canvasHeight` (the sketch's canvas)),
  `Palette` (rgb 0–1), `rules.standard / rules.queue`, `saveVersion`.
- `core.anchor` — `Figure.anchor` (feet on the canvas, fractions, y up).
- `core.figureSize(cast, ronin)` — `Figures.size`: a cast's whole canvas on screen for a ronin `ronin` pixels tall.
- `core.frames(cast)` — frame keys drawn for the cast (`Figure.frames(for:)`); `core.has(cast, frame)`.
- `core.footing(cast, frame)` — `Figure.footing`: `{front:{x,y}, back:{x,y}}` in figure heights from the spot stood on.
- `core.figure(cast, frame)` — `{footing, tip` (`Figure.tip`, or null for a bow), `contact` (`Figure.contact`),
  `club` (the brute's `{grip, head}`, `FoeSprite.club`; null for others), `smeared, armed, airborne, roll, blade,
  blade2, lean, clutch, sheathed, anatomy {hip, waist, chest, neck, head, headRadius, knee, height}}`. Points in
  figure heights from the feet (x toward the way he faces, y up) except `anatomy` (canvas pixels, y up).
- `core.clashGap(heroFrame = 'clash(0)', warlordFrame = 'clash(0)')` — `Figure.clashGap`.
- `core.sketch(cast, frame, {armed = true, sheathed = false})` — one frame drawn, see below. `sheathed` (the hero):
  the frame with the blade kept in its scabbard, as the app draws a blow, a winded breath or the fall before the
  stage's draw (`HeroSprite.sheathedPiece`).

Casts: `'hero'`, `'grunt'`, `'runner'`, `'brute'`, `'dancer'`, `'archer'`, `'warlord'` (`'foe:grunt'` works too).

Frame keys mirror the Swift `Frame` enum: `idle(k)`, `iai(k)`, `walk(k)`, `windup(k)`, `strike(k)`, `stagger(k)`,
`leap`, `aim`, `loose`, `die(k)`, `block`, `cut(<cut>,k)`, `recover(<cut>,k)`, `chain(<cut>,k)`, `shuffle(k)`,
`winded(cycle,k)`, `reel(way,k)`, `stumble(k)`, `repelled(k)`, `hurt(k)`, `flourish(k)`, `fall(k)`, `clash(k)`,
`retreat(k)`; cuts: `kesa, gyaku, shomen, dou, tsuki, sune, nukitsuke`. Any frame can be sketched for any cast
(the app only uses the ones `frames(cast)` lists).

### Sketches

```js
{
  cast, frame, width, height,        // the canvas, in pixels
  anchor: {x, y},                    // the feet, in pixels (y up)
  anchorUnit: {x, y},                // the same as fractions of the canvas (= Figure.anchor)
  unit,                              // pixels per figure height of this cast; pixelHeight: per ronin height
  bounds: {x, y, width, height},     // what is drawn, grown by the rim (Sketch.bounds(margin: rimRadius*3+2)): the app's texture crop
  smeared,                           // Figures.smeared: leave no ghost of the previous pose behind this frame
  rim: {color: [r,g,b], alpha, radius},
  underlay: [shape], body: [shape], overlay: [shape],
}
shape = {
  path: Float32Array | undefined,    // commands, below
  ellipse: {x, y, w, h} | undefined, // the rect it fills
  fill: [r,g,b,a] | null, stroke: [r,g,b,a] | null,  // components 0–1
  width,                             // stroke width, pixels
  round,                             // stroke caps and joins round; else butt caps, miter joins
}
```

Coordinates are the sketch's pixels with **y up** (flip when drawing to a canvas). Path commands, flat:
`0 x y` move, `1 x y` line, `2 cx cy x y` quadratic curve (control point first, as `quadraticCurveTo`), `3` close.

Draw as the app does (`Sketch.image(in:)`): the `underlay` shapes; then the `body` shapes as one layer with a soft
glow of `rim.color` at `rim.alpha` around the whole layer (CG shadow, blur `rim.radius × 1.6`); then the `overlay`.
Each shape: fill, then stroke. `drawSketch(ctx, sketch, {rim = true, layer?})` in core.js does exactly this onto a
2D canvas (y flipped; the sketch's top-left at the current origin), and `shapePath(shape)` gives a `Path2D`.
To place a figure like the app: scale by `roninPixels / sketch.pixelHeight`, and put `sketch.anchor` (flipped:
`height - anchor.y`) on the figure's feet; a foe facing left is mirrored about the anchor.

Sizes: the hero has 210 frames, the foes 26–31. All frames of all casts take ≈150 ms to fetch in Node (the hero's
cut frames ≈1 ms each, most ≈0.2–0.5 ms): preload them in the background and keep them.

#### Sketch binary layout (what `ronin_sketch` writes; `decodeSketch(floats)` reads it)

Float32, little-endian. Header (20): `version(1), width, height, rimR, rimG, rimB, rimA, rimRadius, nUnderlay, nBody,
nOverlay, boundsX, boundsY, boundsW, boundsH, smeared(0/1), unit, anchorX, anchorY, pixelHeight`. Then each shape
(underlay, body, overlay in order): `kind(0 path, 1 ellipse), flags(1 fill, 2 stroke, 4 round), fillRGBA(4),
strokeRGBA(4), width, n`, then `n` floats of data (ellipse: `x, y, w, h`; path: the commands above).

### Ragdolls — `core.ragdoll`

The dead, as the app's `Carnage` (Sources/Ronin/Carnage.swift) makes them: RoninArt's `Ragdoll`, a jointed body let
fall under its own weight, kept in the core by id until removed. Doll points are in the figure's own heights from the
spot he stood on (x toward the way he faced, y up, the ground at 0); the page mirrors them for a figure facing left
(`facing` −1) and scales them by `ronin × build height` (`tuning.Figure.casts[cast].height`) screen pixels per figure
height. Rolls are random as in the app; `ragdoll.seed(n)` makes them repeatable.

What the app does at a killing cut (`DuelScene.sever`), for the page to follow:

1. The foe's figure freezes, drawn white, in `ragdoll.struck(cast, variant)` (variant random in
   `0..<tuning.Figure.struckVariants`) until the blade lands (the hero's cut's impact delay).
2. Which way he comes apart, from the cut (with gore on; with gore off every man is felled whole): `kesa` →
   `'falling'`, `gyaku`/`nukitsuke` → `'rising'`, `dou` → `'level'`, `sune` → `'legs'`, `shomen` → `'head'`, `tsuki`
   → `'level'` now and then (the gore's `tears`), else felled whole; the warlord always loses his head; how often a
   cut severs at all is the gore's `severs` (Carnage.swift `Gore`). Shot by a deflected arrow: felled whole, from the
   frame he was in.
3. `ragdoll.sever(cast, severance, {variant, back, force})` with `back = away × facing` (away: +1 if the cut went
   right, −1 left; facing: +1 if he stood left of the ronin, facing right) and `force` 1.5 for the warlord, 1.25 for
   the brute, 1 otherwise. Returns:
   - slant or level: `{upper, lower, standFor, weapon}` — `upper` flies (already reaching for a pose), `lower` stands
     on its planted feet; after `standFor` seconds call `ragdoll.collapse(lower)`.
   - `'legs'`: `{body, weapon}` — down onto his knees and over.
   - `'head'`: `{body, standFor, head, weapon}` — the headless body stands `standFor` then `collapse(body)`; the head
     is a rigid piece: draw `ragdoll.head(cast, variant)` (on the whole canvas where it was; `wound` in canvas pixels
     y up, `angle` the way blood leaves it) and fly it yourself (the app throws it up and away, spinning, gravity,
     one bounce, then it skids and lies).
   - `weapon`: `{hand, turn, bow}` — his weapon leaves his hand (`Carnage.drop`): draw `ragdoll.weapon(cast)` (lying
     level, its grip at the canvas's middle), turned by `facing × turn`, the grip at `hand` (figure heights), and fly
     it as a rigid piece.
4. Felled whole: `ragdoll.fell(cast, {variant | frame, force})` → `{body, weapon}`.
5. Each frame: `ragdoll.step(dt)` (all dolls; fast path) → `[{id, time, settled, resting, hip, moved, bleeding:
   {at, angle}, wounded, standing}]`. Redraw a doll with `ragdoll.draw(id)` when `moved × scale` passes about half a
   pixel (the app: 0.6 points; a slow one at most every 1/40 s, a few per frame always, more while 3 ms allow). A
   doll whose `settled` turns true is done: draw it once more and keep the picture; `remove(id)` it.
6. `ragdoll.draw(id)` → a sketch of `doll.framed().pose`, with `place: {x, y}`: put the sketch's `anchor` (its feet
   on the canvas) at `origin + (facing·place.x, place.y) × scale`, where origin is the spot he stood on.
7. Blood leaves `bleeding.at` (doll terms) at `bleeding.angle` (radians from +x, before mirroring).

Lower level: `create(cast, {frame | variant, style: 'plain'|'felled'|'hamstrung'|'cut', severed: {part:
'above'|'below'|'headless', at, slant}, back, force, lift})`, `collapse(id)`, `reach(id, target = 'wild' | 'thrown'
| 'struck' | frameKey, {variant, fling})`, `raise(id, dy)`, `push(id, joint, {x, y})`, `thrown(id, {x, y}, spin)`,
`planted(id, on)`, `wounded(id, joint, along)`, `stir(id, amount)`, `step(dt, ids, {points: true})` (with the 11
joints), `info(id)`, `remove(ids)`, `clear()`, `count()`, `joints` (`{low: 0, high: 1, head: 2, frontKnee: 3,
frontFoot: 4, backKnee: 5, backFoot: 6, frontElbow: 7, frontHand: 8, backElbow: 9, backHand: 10}`).

Costs (Node, one doll): `step` ≈ 30 µs of physics per doll per 1/60 s (plus ≈ 40 µs per call), `draw` ≈ 100 µs.

## Size and speed

`ronin.wasm`: ≈4.3 MB (≈1.55 MB gzipped) after `wasm-opt -Oz`; ≈6.7 MB straight from the linker. Most of it is the
Swift standard library (≈5.5 MB of the unoptimised size). Foundation is not linked at all: the bridge carries its
own Codable JSON coder (`JSONCoding.swift`), checked against Foundation's (`web/test/native`: saves written by either
read back identically by both). Loading and starting it takes ≈30 ms in Node.

Per call, in Node 22 (a browser is similar): `state()` ≈ 30–110 µs (more foes, more), `advance(1/60)` ≈ 5–30 µs,
`strike` ≈ 10 µs, other calls ≈ 15–90 µs, `sketch` ≈ 0.1–1.4 ms (all 376 frames of all casts ≈ 150 ms).

## Wire format (for maintainers)

Exports: `ronin_buffer(n) → ptr` (an input buffer of n bytes), `ronin_out() → ptr` (the last output),
`ronin_rpc(len) → outLen` (JSON request `{op, …}` → `{ok, result | error}`), `ronin_advance(dt) → len`,
`ronin_strike(side ∓1) → len`, `ronin_state() → len` (JSON), `ronin_sketch(len) → len` (input
`cast|frame|armed|sheathed`, output floats), `ronin_piece(len) → len` (JSON `{kind: doll|struck|head|weapon, …}` →
floats), `ronin_dolls_step(dt) → len` (JSON), `ronin_doll_draw(id) → len` (floats: the sketch, then `place.x,
place.y`). The module is a WASI reactor: `_initialize` once, then any export. Outputs stay valid until the next call.

Checks: `web/build.sh --test` (the module, in Node), and the save format against Foundation's:
`docker run --rm -v "$PWD":/work -w /work/web/test/native swift:6.0 swift run -c release --scratch-path /tmp/b`.
