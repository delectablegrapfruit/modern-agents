# Paper Sky: Architecture

The technical contract. Every public name here is frozen at the end of wave 1's kernel milestone
(BUILD_PLAN W1-K, M0) and changes only through the lead (the requests protocol, BUILD_PLAN §1).
GDD = game design, BALANCE = numbers, UI = screens and components, ART_AUDIO = art and sound.
`docs/CONTRACT.md` pins the names down; its decisions D1-D60 and the additive names the wave-1
packages reported are folded into this document at the wave-1 integration (the D numbers are
cited where they apply), so the two agree.

## 1. Constraints and principles

- **Vanilla JavaScript (ES2017), no build step, no dependencies.** The game runs by opening
  `index.html` from disk (`file://`) in current Chrome, Edge, Firefox and Safari. Classic
  `<script>` tags only: no ES modules, no `fetch`, no workers, no web fonts, no network.
- **One global namespace: `window.SR`.** Every file is an IIFE with `'use strict'` that adds to `SR`.
- **Canvas 2D for the world, interiors and minigames; DOM for the UI.** All art is drawn in code.
  Small original SVG path strings authored for this project are allowed (icons may use them).
- **Web Audio**, everything synthesized; original music stored as pattern data.
- **localStorage** saves, wrapped in try/catch with an in-memory fallback.
- **Rules are pure.** `js/rules/*`, `js/data/*`, `js/boot/*`, `js/core/rng.js` and `js/core/text.js`
  never touch `document`, `window` browser APIs (other than `window.SR`), canvas, audio or
  `Math.random`. They load in Node through `tests/node/load.cjs` for unit tests and the balance
  simulator.
- **Content is data.** Buildings, actions, items, jobs, people, events, skins, songs, sfx and text are
  JS data files that register themselves. Code interprets them.
- **Agents own files, not features.** Registration is order-independent and deferred to boot, so
  parallel agents never edit a shared list (except `index.html`, which the lead pre-seeds with
  every planned file).

## 2. Stage, resolution and scaling

| Item | Rule |
|---|---|
| Logical stage | 1280 × 720 (16:9). All game and UI coordinates are logical. `SR.W = 1280`, `SR.H = 720`. |
| DOM layout | `#app` fills the window. `#stage` is a box of `1280k × 720k` CSS px centred in `#app`, `k = min(winW/1280, winH/720)`. The canvases are sized in CSS px to the stage box (no transform). `#ui` is a 1280 × 720 logical box scaled with **CSS `zoom: uiK`** (not `transform`), so text is laid out and rasterised at the final size and stays crisp at fractional scales. `uiK = k` except in the touch-compact layout below. |
| Touch-compact layout | When the primary pointer is coarse (`matchMedia('(pointer: coarse)')`) and `k < 0.92`, `uiK = 0.92` (so a 48 px touch target is ≥ 44 CSS px) and `#ui` becomes a logical box of `winW/uiK × winH/uiK` laid over the whole window; UI regions anchor to its edges instead of the 1280 × 720 grid (UI §2.2). The world canvases keep the letterboxed stage. |
| Portrait | On a coarse pointer with `winH > winW`, a "Turn your device sideways" card covers the stage (with "Play anyway", which keeps the letterbox). |
| Letterbox | `#app`'s background is the current sky horizon colour (updated every 5 game minutes), so bars never look like black borders. |
| Layers inside `#stage` | `canvas#world` (z 0), `canvas#fx` (z 1: transitions, confetti, stamps' paper jolt; `pointer-events: none`), `div#ui` (z 2: HUD, cards, menus), `div#aria` (visually hidden live region). |
| Canvas backing store | `width = round(1280 · k · dpr · renderScale)`, capped at 2560 × 1440; the context transform maps logical units to device pixels. `dpr = min(devicePixelRatio, preset.maxDpr)`. |
| Resize | debounced 150 ms; caches whose device scale changed by more than 5 % are invalidated. |
| Minimum | 640 × 360 window; below that k keeps shrinking. |
| Input coordinates | `SR.stage.toLogical(clientX, clientY)` maps a client point to logical world-stage units using the stage box and k. DOM UI handles its own pointer events. |
| Fullscreen | `SR.stage.fullscreen(toggle)` uses the Fullscreen API on `#app` (needs a user activation: a click or a key; a gamepad button is not one). |
| Crispness check | `tests/e2e/stage.test.cjs` lays out text in `#ui` at 1366 × 768 (k ≈ 1.067; 1.0664 after snapping) and at 912 × 513 (k = 0.7125) and asserts it matches the same text laid out natively at 16·k px at the same sub-pixel offset (a browser-scaled bitmap would not; D40). |

**Quality presets** (`SR.quality`, P0 structure, P1 tuning):

| Preset | maxDpr | renderScale | Sun shadows | Particles | Crowd | Rain streaks | Lean (P2) |
|---|---|---|---|---|---|---|---|
| High | 2 | 1 | re-baked hourly | 100 % | 100 % | 300 | optional |
| Medium | 1.5 | 1 | every 2 h | 70 % | 100 % | 200 | off |
| Low | 1 | 0.75 | off | 40 % | 50 % | 90 | off |

**Auto** (default): it measures **work time** (`SR.loop.perf` update + render CPU time per frame),
never the frame interval, so a 30 fps cap does not look slow. Over a rolling 5 s window, if the
90th-percentile work time exceeds 12 ms, step down one preset; if it stays under 7 ms for 20 s, step
up; at most one change per 20 s. Tests pin the preset (`SR.quality.set('high')` in the harness by
default) and assert preset-dependent counts as `count × preset factor`.

**`SR.stage` as built (D22, D37).** `toLogical(clientX, clientY)`, `fullscreen(toggle)`, `resize()`,
`box` (`{ left, top, width, height, backingW, backingH }`), `horizon(min)` (the letterbox colour:
the `horizon` of `SR.art.palette.sky` keyframes, interpolated; `var(--paper-1)` until the palette
has them), `tick()` (called by the loop each frame), `resetPortrait()`, and read-only `k`, `uiK`,
`dpr`, `scale` (device px per logical unit), `compact`, `portrait`, `world` / `fx` and `ctx` /
`fxCtx` (transform set to logical units). k is snapped so the stage width is a whole number of
device pixels (left and top rounded to device pixels). `#app` carries `data-layout="stage" |
"compact"` and `data-portrait`; in the compact layout `#ui` is `position: fixed` at the window's
origin. The portrait card is `[data-id="stage-portrait"]` in `#ui` (text `ui.stage.turn` and
`ui.stage.playAnyway`; "Play anyway" hides it for the session). The stage layers' layout styles are
set inline by `stage.js`; `css/base.css` holds the rest. Besides `resize`, `orientationchange`,
`fullscreenchange` and a pointer-type change, a `(resolution: <dpr>dppx)` media query re-lays the
stage out when the device pixel ratio changes without a resize. Emits `stage:resized { k, uiK, dpr,
scale, compact }` (render caches re-bake on a scale change).

**`SR.quality` as built (D22, D38).** `set(preset)` (`'auto'|'high'|'medium'|'low'`; never persists:
`display.quality` drives the preset at boot and on change), `preset` (the effective one), `auto`,
`params` = `{ maxDpr, renderScale, shadowHours, particles, crowd, rain, lean }` (one frozen object per
preset and layout, readable every frame without allocating; the touch-compact profile caps `maxDpr`
at 1.5), `sample(workMs, at?)` (the loop's feed; tests pass `at`), `presets()`. Auto judges only a
full 5 s window (≥ 30 samples), at most every 250 ms; after a change the window restarts. Emits
`quality:changed { preset, auto }`.

## 3. Main loop

- `SR.loop`: fixed-step simulation at 60 Hz (`SR.STEP = 1/60`) with an accumulator and at most 5
  catch-up steps per frame; rendering on `requestAnimationFrame` with the interpolation alpha.
  Optional 30 fps cap (renders every other rAF).
- Game logic never reads wall-clock time. Real-time animation (UI tweens, minigames) uses the
  loop's `SR.loop.time` (seconds of unpaused play), which tests can step.
- `SR.loop.pause()`, `resume()`, `step(frames)` (tests: exactly n fixed steps, then one render),
  `start()` (boot), `steps` (fixed steps run), `time`, `paused`, `fpsCap` (60 | 30), `perf` = `{
  update: {p50, p95}, render: {p50, p95}, fps, draws, drawImages, fills, frames }` over the last 300
  frames (D36): `draws` is the p95 of `drawImage` + `fill` + `fillRect` calls per rendered frame on
  the two stage contexts (render caches drawing into their own canvases are not counted);
  `drawImages` and `fills` give `{ p50, p95, max }`. `step(n)` records one perf sample but never
  feeds `fps`, which counts animation frames only and restarts its window on `resume()`.
- Order per step: input poll (`SR.input.poll(dt)`) → active scene stack `update(dt)` (top down,
  stopping at a scene that `blocksUpdate`) → tweens. Per frame: both stage contexts reset to the
  logical transform → `SR.stage.tick()` (the letterbox colour) → scenes `render(ctx, alpha)` bottom
  up (skipping below a scene that `blocksRender`) → `SR.render.fx.render()` (the running transition,
  confetti and jolt on `#fx`; clears it when idle) → `SR.ui.hud.flush()` (the batched HUD writes);
  the loop calls each only if it exists (D30). The world canvas is not cleared by the loop: base
  scenes paint their own frame. Each rendered frame's work time feeds `SR.quality.sample`.
- `perf.update` and `perf.render` are CPU times measured with `performance.now()` around the
  update steps and the render calls of a frame (work time); `perf.draws` counts `drawImage` and
  path fills per frame (the CI proxy for GPU load, §17).
- **Hidden tab:** on `visibilitychange` to hidden the loop pauses and the `AudioContext` is
  suspended (the audio engine listens itself, D50); on visible the context resumes (if it was
  unlocked) and, if the top scene is `city` or `minigame`, the `pause` overlay opens. Game time
  never advances while hidden. A loop that a test paused stays paused when the tab shows again.

## 4. Namespace, registration and boot

```js
window.SR = {
  VERSION: '0.1.0', W: 1280, H: 720, STEP: 1 / 60,
  def: {},        // registration functions: SR.def.building(id, def), SR.def.action(id, def), ...
  reg: {},        // registered definitions by kind: SR.reg.building[id]
  onBoot(prio, fn, opts), boot(opts),   // deferred initialisation; opts = { headless: true } marks Node-safe hooks
  util, events, rng, text,    // boot + core
  loop, stage, quality, input, scenes, save, settings, debug,
  state: null,    // the live game state (rules read/write it only through SR.act and rules functions)
  tuning: {}, features: {},   // BALANCE values and P1/P2 feature flags (data files)
  rules: {},      // pure rule modules
  act(id, params), preview(id, params),
  world: {}, render: {}, art: {}, ui: {}, minigame: {}, audio: {},
};
```

- `js/boot/namespace.js` creates `SR`, the registry machinery and `SR.def.<kind>` for every kind in
  §7 (including `fn`, `subscreen`, `contact` and `exterior`). A registration stores `(id, def,
  file)`; duplicate ids throw at boot with both file names. `SR.def.fn(name, fn)` is a kind like any
  other (W1-R uses it; W1-K creates it). As built (D2-D7): `SR.scenes.register` and
  `SR.minigame.register` also live in `namespace.js` and store into the kinds `scene` and
  `minigame`, so a scene or engine file may load before `js/core/scenes.js` or the framework; the
  eight namespace objects it creates (`rules`, `world`, `render`, `art`, `ui`, `audio`, `scenes`,
  `minigame`) are extended, never replaced. `tuning`, `features` and `text` are map kinds (one object
  whose keys are ids; a duplicate table, flag or key across files is a boot error) and `worldmap` is
  stored as `SR.reg.worldmap.main`; `SR.tuning` / `SR.features` are the registries themselves.
  Registrations and boot hooks learn their file from the call stack (D4; `SR.registry` exposes
  kinds, entries, files, errors and hooks). Numeric ids become strings; `''` and `'__proto__'` are
  rejected; an object def gets `def.id`, and a conflicting `def.id` is an error (D5). After boot a
  new id registers normally and a duplicate throws at once (D6).
- **Load-time rule:** a file may only define functions and call `SR.def.*` / assign its own API
  object (`SR.world.traffic = {...}`). It must not call another module or read another registry at
  load time. Everything that needs other modules goes into `SR.onBoot(prio, fn, opts)`.
- **Working before a dependency lands (D27).** A shipped file never defines, or supplies a fallback
  for, a name another file owns (not even `SR.act = SR.act || …`): under shuffled loading it would
  overwrite the real one or be overwritten. Until a dependency lands, a package fakes it only in its
  own tests and contact sheets, installed after the scripts load and before `SR.boot`. Shipped code
  that calls a module which may still be a stub checks that it exists first (`if (SR.rules.arcs)
  …`).
- **Node-loadable registration files.** Every file that registers content (`js/data/**`,
  `js/art/palette.js`, `js/art/icons.js`, `js/art/interiors/*.js`, `js/art/exteriors-detail.js`,
  `js/art/props.js`, `js/art/logos.js`, `js/minigames/skins/*.js`, `js/audio/sfx.js`,
  `js/audio/songs/*.js`, `js/ui/subscreens/*.js`) touches no DOM, canvas, audio or browser API at
  load time: drawing and DOM building happen only inside functions called later. The validator
  loads them all in Node (§18).
- `SR.boot(opts)` (called by `js/main.js` on `DOMContentLoaded`): runs boot hooks by priority
  (`10` core, `20` data validation and indexing, `30` world build, `40` render caches, `50` UI
  mount, `60` audio, `90` first scene), then `SR.scenes.go('boot')`. `SR.boot({ headless: true })`
  (Node) runs only hooks registered with `{ headless: true }` and never starts a scene. As built
  (D7): `SR.boot({ scene, sceneParams })` chooses the first scene (`false`: none, for contact
  sheets); `SR.booted` marks completion; ties in priority run in load order; a failing hook throws
  `SR.boot: hook (prio 20, js/rules/act.js) failed: <message>`; registration errors are thrown by
  `SR.boot` with both file names. **Priority 20 (D28)** indexes and checks a module's own
  registrations; cross-reference validation ("every id reference resolves") is
  `tools/validate.cjs`, and a boot hook never throws because an id of another kind is missing (it
  may warn once).
- **Script order in `index.html`:** boot → core → rules → data → world → render → art → ui →
  minigames → audio → scenes → main. Because of the load-time rule, order only matters for
  `js/boot/*` (first) and `js/main.js` (last). `tests/node/shuffle.test.cjs` and
  `tests/e2e/shuffle.test.cjs` load everything else in random order and boot.
- **Stubs:** from wave 1, `index.html` lists every file of §19. Files not yet written exist as a
  stub: `(function () { 'use strict'; /* stub, owner: W2-Food */ })();` (D1: every `js/**` and
  `css/**` file; tests, tools, sheets and reports are never stubbed). A file is a stub while it
  carries that marker; its owner removes the marker with the first real content.
- **Script size:** the scripts `index.html` lists hold at most 8 MB of JS, comments included (§17,
  D45); there is no minification step.
- **`SR.util`** (D11): `isObject`, `clamp`, `lerp`, `invLerp`, `cubicBezier(x1, y1, x2, y2)`,
  `easeLinear`, `easeIn`, `easeOut`, `easeInOut`, `easeSpring` (the last three are the CSS motion
  tokens), `fmt(str, vars)` (`{name}` substitution), `hash(...args)` → uint32, `crc32(str)`,
  `clone`, `equal`, `deepFill(target, defaults)` (the migration's deep-fill: fills missing or
  `undefined` fields, keeps unknown ones), `merge(target, patch)` (`SR.debug.set`), `pad`,
  `warnOnce(key, msg)`.

## 5. Scenes

```js
SR.scenes.register('city', {
  enter(params) {}, exit() {}, pause() {}, resume() {},
  update(dt) {},                 // fixed step
  render(ctx, alpha) {},         // #world canvas
  onAction(action, ev) {},       // input actions (§11): 'interact', 'back', 'pocket', ...
  ui: { mount(root) {}, unmount() {} },   // DOM in #ui
  blocksUpdate: true, blocksRender: false, music: 'crossroads_strut',
});
SR.scenes.go(id, params, opts)       // replace the whole stack (with a transition) → Promise
SR.scenes.push(id, params)           // overlay → Promise resolved by pop(result)
SR.scenes.pop(result)
SR.scenes.replace(id, params, opts)  // replace the top (a pending push promise carries over)
SR.scenes.queue(id, params, opts)    // the deferred change (below)
SR.scenes.top(), SR.scenes.stack(), SR.scenes.get(id)
```

| Scene id | Kind | Blocks update below | Notes |
|---|---|---|---|
| `boot` | base | | fan note, "press any key" (audio unlock), loads profile and settings |
| `title` | base | | live city camera drift behind the menu |
| `newgame` | base | | 3-step wizard |
| `intro` | base | | skippable cutscene |
| `city` | base | | the world |
| `building` | base | | interior canvas + action card; `params = { id, params }`: `id` is a building def id and `params` come from the door resolver (§8.4), e.g. `{ homeId: 'pent', mode: 'owned' }`; optional `screen` / `screenParams` open a sub-screen on entry (§7.1) |
| `minigame` | overlay | yes | `params = { id, skin, params }`, resolves with the result |
| `report` | overlay | yes | The Daily Fold: morning, Stick General and election-night editions (`params.report`: its `kind` and `election`); jail nights show a strip on the Jail Day card instead |
| `jail`, `hospital`, `death` | base | | `hospital` and `death` are entered only through the `player:down` flow (§6.7) |
| `bustrip` | base | | Sky Ribbon ride and the event card |
| `results` | base | | Final Edition |
| `halloffame`, `credits`, `profile` | base | | `profile` (title → Achievements): the profile's achievements with run day, badges ("Old School"), lifetime totals; works without a running game |
| `pocket`, `pause`, `dialog`, `settings`, `saveload`, `perk`, `confirm` | overlay | yes | `dialog` keeps the city rendering (frozen). Each overlay registers itself in its own UI file (`pocket.js`, `pause.js`, `dialog.js`, `settings.js`, `saveload.js`, `perk.js`, `modal.js`); `halloffame`, `credits` and `profile` register in their screen files |

**Transitions** (`SR.render.fx.transition(kind, swap)`): `pageTurn` (350 ms, the outgoing frame
folds away diagonally on `#fx`), `doorZoom` (200 ms zoom toward the door, then `pageTurn`),
`fade` (200 ms; used for all transitions with Reduced Motion). `go` runs `pageTurn` unless
`opts.transition` names another kind or `false`; `replace` swaps at once unless a kind is named.
The transition captures the outgoing frame, calls the kernel's swap exactly once (the stack changes
synchronously there) and resolves the returned Promise when the cut ends. A change swaps at once
for `{ transition: false }`, while `SR.debug.fast()` is true, when requested from inside another
change (`enter` / `exit`), for the first scene (an empty stack) and while `SR.render.fx` is missing
(D44). `push` and `pop` never transition.

**Scene details (D13, D25).** `top()` returns `{ id, def, params }`, `stack()` the ids bottom to
top; overlays declare `kind: 'overlay'` (the deferred queue needs it); each scene's UI gets its own
`<div data-scene="<id>">` in `#ui`; lifecycle: `go` exits the stack top down (`ui.unmount`, then
`exit`), then `enter(params)`, `ui.mount(root, params)`, `SR.audio.music(music)`; `push` pauses the
scene below and `pop` resumes it. Until W2-Front registers `boot` and `title`, the kernel's fallbacks
run (`boot` goes straight to `title`; `title` shows `[data-id="title-stub"]`); a registered scene
always wins. The `artbible` scene (`#artbible`) is registered by `js/core/debug.js`.

**Deferred scene changes.** Rules never change scenes. When a Result or a night Report asks for a
scene change (`down`, `jail`, `game over`), `SR.act` emits the event (§13) and one listener queues
`SR.scenes.go(...)`; the queue runs when the top of the stack is a base scene (any open minigame,
dialog or sub-screen resolves or closes first). Owners: `player:down` → `js/scenes/hospital.js`
(W2-Transit); `jail` (a rule event, §6.8) → `js/scenes/jail.js` (W2-Transit); `game:over` →
`js/scenes/results.js` (W2-Front).

## 6. State and the rules layer

### 6.1 State schema (v1)

`SR.state` is one plain-JSON object. `js/rules/state.js` owns the schema, `SR.rules.state.create(opts)`
builds a new game, and `SR.rules.state.defaults()` returns a fully populated default used by the
migration's deep-fill. **One source per value:** per-save values live here, per-profile values in
settings (§16); nothing is stored twice.

```js
{
  v: 1, seed: 12345, rng: { rules: [a, b, c, d] },
  mode: { length: 40 /* 15|40|100|0=unlimited|7..365 (P2) */, difficulty: 'standard',
          tutorial: true /* the Day 1 script for this run */, cheat: false, keepPlaying: false,
          inProgress: false /* Hardcore: the ironman slot holds a mid-day state (§15) */ },
  clock: { day: 1, min: 480, wake: 480, pillAuto: true /* the Bag toggle */ },
  player: { name: 'Stick', look: { acc: 'none' }, x: 998, y: 1088, facing: 180,
            driving: null /* null|'junker'|'sports' */,
            cars: { junker: { owned: false, bought: false, x: 727, y: 1113, a: 0, towed: false },
                    sports: { owned: false, bought: false, x: 1865, y: 1120, a: 0, towed: false } },
            lastSafe: { x, y } },
  stats: { str: 7, int: 7, cha: 7, karma: 0, hp: 22, hpMax: 22, heat: 0, buzz: 0 },
         // invariant: hpMax === tuning.start.hpMaxBase + str (only SR.rules.stats.add('str') changes it)
  money: { cash: 100, bank: 0, rate: 2.0, rateHist: [], cds: [] /* {amount, rate, dayOpened} */,
           loan: null /* {amount, daysLeft} */, lien: 0, creditFrozenUntil: 0 },
  job: { ranks: { mcsticks: 'cook', nli: null }, shiftsAtRank: { mcsticks: 0, nli: 0 },
         totalShifts: 0, rating: 1.0, weekNliWages: 0, weekNliShifts: 0, overtimeToday: 0,
         lastFullEnd: -1 /* clock min when today's last Full shift ended (Overtime must follow it) */,
         ceoSinceDay: 0, office: null /* null|'president'|'dictator' */ },
  edu: { classes: { biz: 0, kin: 0, thr: 0 }, degrees: { biz: false, kin: false, thr: false } },
  perks: { owned: [], pending: [] /* [{stat, level, options:[a,b]}] */ },
  items: { smokes: 0, pills: 0, gum: 0, paper: 0, scratch: 0, takeout: [], knife: 0, knuckles: 0,
           gun: 0, ammo: 0, vest: 0, alarm: 0, phone: 0, skateboard: 0, prodeck: 0, booze: 0,
           snow: 0, shirt: 0, scraps: [], coupon: 0, diplomas: [] },
  homes: { owned: ['apt'], living: 'apt', lets: {} /* homeId -> dayLet */ },
  furniture: { owned: {} /* id -> 1|2 (tier) */, storage: [] },
  stocks: { MCS: { price: 12, prev: 12, hist: [], held: 0, basis: 0 } /* ...6 */ },
  tip: null /* {day, ticker, dir, truthful, revealed: {tv, paper, market, mingle, harold}} */,
  trade: { rep: {}, visited: {}, smuggleProfit: 0, tours: 0, demand: {}, tourDemand: {},
           tourWeek: {} /* cityId -> week index of the last tour there */, buyers: [0,0,0,0,0],
           offer: null /* the trip waiting for a decision: {kind: 'smuggle', city, day, outcome: 'offer',
                          want, units, perUnit, total, key, vars} or a booked {kind: 'tour', city, day} */ },
  fight: { won: 0, champion: false, ringBouts: 0, open: null /* the fight in progress {kind, n, k, fighter, day} */ },
  casino: { points: 0, barredUntil: 0, suspicion: 0, winToday: 0, shoe: null, lastBet: 0,
            match: null /* a darts match in progress {tier, stake, day} */ },
  crime: { bankRobDays: [] /* days of bank robberies, pruned after 14 days */,
           open: null /* the robbery in progress {target, day} */ },
  daily: { tv: {}, beers: 0, gambleKarma: 0, uofsKarma: 0, seminars: 0, paper: 0, chess: 0, nap: 0,
           benchNap: 0, online: 0, dartsPractice: 0, dartsMatches: 0, bjHands: 0, homePerk: 0,
           charity: 0, ducks: 0, preacher: 0, skate: 0, soup: 0, leftovers: 0, relax: 0,
           secondWind: 0, vipDrinks: 0, falls: 0, forecastSeen: false, shifts: 0 /* today's shifts */,
           campaign: { rally: 0, tvAd: 0, doorKnock: 0, kissBabies: 0, intimidate: 0, bribe: 0 } },
  weekly: { index: 0 /* = week(s) */, openMic: 0, party: 0, mchollandTip: 0, bankRob: 0 },
  npc: { harold: { gave10: 0, bottles: 0, takeout: 0, shirt: false, branch: null /* null|'comeback'|'barfly' */,
                   stage: 'start', hiredDay: 0, repayDay: 0 },
         kid: { packs: 0, gumDays: 0, lastGumDay: 0, branch: null, stage: 'start', dead: false, contestDay: 0 },
         dealer: { bought: 0, credit: null /* {grams, owed, dueDay} */, creditEnded: false,
                   goonsDue: false, stage: 'red', turnedInDay: 0 },
         mcholland: { stage: 'none' /* none|informant|closed */, bribedUntil: 0 },
         crease: { stage: 'none' } },
  election: { status: 'none' /* none|nominated|campaign|office|lost|removed */, path: null,
              nominatedDay: 0, poll: 0, campaignDay: 0, chest: 0, debateDone: false,
              decrees: [] /* active */, decreesUsed: [] /* once-only ids already issued */,
              offer: [] /* decree ids on the Mayor's desk */, nextDecreeDay: 0,
              retryFromDay: 0, flipMornings: 0, runs: 0, cityName: null },
  world: { weather: 'clear', tomorrow: 'clear', forecast: 'clear', todayHadRain: false,
           encounters: [], cityEvent: null /* {id, day} */, skateContestDay: 0 },
  jail: null /* {daysLeft, served, reason, bailBase} */,
  pending: null /* Hardcore only: {resolve, worst} while a stake-bearing minigame is open (§15) */,
  msgs: [] /* {id, from, key, vars, day, read, archived}; at most 150 (§15) */,
  log: { today: [], yesterday: [] } /* {kind, weight, vars}; at most 20 per day (§6.9) */,
  journal: { hintsSeen: {}, tracked: null },
  records: { falls: 0, carHits: 0, fightsWon: 0, ringWins: 0, jailDays: 0, jailWorkouts: 0,
             robberies: 0, bankRobberies: 0, hospital: 0, shiftsMcsticks: 0, citiesVisited: 0, spent: 0 },
  history: { nw: [], str: [], int: [], cha: [], karma: [] } /* [day, value] points: day 1 from create(),
             then one per morning to day 120, then weekly (§15) */,
  achievements: {},  // id -> day unlocked (this run)
  flags: {},         // includes flags.dead = 'loan' during a Hardcore default night, flags.foldDone (the
                     // Theory of the Fold finished: MET THE ARTIST), flags.carHitVm (night step 11's voicemail)
  over: false, result: null,
}
```

`week(s) = floor((s.clock.day - 1) / 7)`. Every weekly limit (Open Mic, the party, McHolland's tip,
bank robbery, one tour per city) compares against `week(s)`; `weekly.*` resets when the index
changes (night step 9).

The **"in progress" records** (`trade.offer`, `fight.open`, `casino.match`, `crime.open`; added at the
wave-1 integration, D43, like `daily.shifts`, the `[day, value]` history points and the two flags)
hold the facts of a start whose `:resolve` is still to come: a minigame result carries only its §10
shape, the facts must survive a save (Hardcore's `pending.worst` resolves after a reload; a trip's
event card is a decision you may reload into), and each resolve fn refuses unless its record is
open and closes it, so a stray or repeated `:resolve` never pays twice. They are deep-filled, so
the schema stays v1.

### 6.2 The action pipeline

```js
SR.preview(id, params) → Preview      // pure; never mutates; used by every ActionRow, every frame the card is dirty
SR.act(id, params, opts) → Result     // mutates SR.state through rules, emits events; opts.source
SR.rules.act.preview(state, id, params, ctx) / SR.rules.act.run(state, id, params, ctx)  // the pure forms
```

`ctx = { rng: SR.rng.rules, now: state.clock.min, source: 'ui'|'sim'|'debug' }`. Refusal reasons
are text keys `reason.<name>` (the UI shows `SR.text(reason, vars)`); named fns take `(s, params,
ctx, ...args)` and return a condition result, a partial Result or a number by use (D15). `anims`
(the `anim` effect) and `achievements` (the `achievement` effect; `SR.act` emits
`achievement:unlocked`) are D14's refinements. `SR.act` emits in this order: every
`Result.events` entry under its own name, the UI events derived from the deltas, `msg:received`,
`achievement:unlocked`, `player:down`, and **`action:done` last** (for refusals too).

**Preview** `{ ok, reason, vars, cost: { cash, min, hp, items: {} }, gains: [{ kind, key, n, min,
max, capped }], chance: null | 0..1, badges: ['wed-half-price', ...], hotkey, repeatable, screen,
hidden }`. An action whose `feature` flag is off previews as `{ hidden: true }`; cards, the Bag,
the Pocket and dialogs drop hidden rows.

**Result** `{ ok, id, reason?, vars?, deltas: [Delta], msgs: [{ key, vars }], toasts: [{ key, vars,
kind }], stamps: [{ key, vars }], sfx: [name], anims: [name], achievements: [id],
open: null | { minigame, skin, params, resolve: '<id>:resolve' },
events: [{ name, payload }], log: [{ kind, weight, vars }], down: null | Down (§6.7),
jailed: null | { reason, days }, over: null | { reason } }`. **Delta** = `{ kind: 'cash'|'bank'|'hp'|
'hpMax'|'time'|'stat'|'karma'|'heat'|'buzz'|'item'|'job'|'home'|'furniture'|'lien', key?, n, from, to }`.

**Pipeline of `run`:** look up the action → feature flag (off → refused, reason `featureOff`) →
evaluate `requires` in order (the first failure is the reason) → check the time rule (`timeFits`
unless the action declares `timeRule`) → compute the price (§6.10) and check cash → apply cost
(cash, time, HP, items) → run `effects` in order → pass each rule event to
`SR.rules.arcs.onEvent` (its effects join this Result) → if `stats.hp ≤ 0`, call
`SR.rules.health.down` (§6.7) → collect deltas → return the Result. `SR.act` (also in
`js/rules/act.js`, still free of browser APIs) then emits the result's rule events and
`action:done` on `SR.events` (§13) and returns; `js/core/save.js` listens to `action:done` and
writes the Hardcore ironman slot when HP, money or karma changed (§15). Minigame actions return `open`; the building scene runs the minigame and calls
`SR.act('<id>:resolve', result)`.

**Hard money rule:** cash, bank and every item count never go below 0. Voluntary costs are
checked first (the action is refused). **Forced charges** (a hospital bill, the car tow, the fight
"tab", a mugging, Red's goons, loan seizure, a fine) go through `SR.rules.bank.charge(s, n, reason)`
→ `{ paid, writtenOff }`: cash first, then bank, and any shortfall is written off (logged).

### 6.3 Action definition

```js
SR.def.action('mcsticks.fries', {
  building: 'mcsticks', group: 'eat', order: 20, icon: 'fries', label: 'act.mcsticks.fries',
  p: 0,                                        // priority tag (GDD §0)
  cost: { cash: 12, min: 30 },
  priceTarget: 'food.mcsticks.fries',          // which price modifiers apply (§6.10, B-28a; default = the action id)
  requires: [['hpBelowMax']],
  effects: [['heal', 20], ['emit', 'eat', { item: 'fries', where: 'mcsticks' }], ['sfx', 'eat'], ['anim', 'eat']],
  repeatable: true,
});
SR.def.action('nli.work', {
  building: 'nli', group: 'work', icon: 'work', label: 'act.nli.work', p: 0,
  variants: ['full', 'half', 'overtime'],      // a segmented control on the row (P1 adds half/overtime)
  cost: { min: 'shift.min' },                  // string = computed by a named fn
  requires: [['jobTrack', 'nli']],
  effects: [['fn', 'jobs.work']],
  minigame: { skin: 'jobs.hustleSkin', auto: true },   // Hustle button (P1)
});
SR.def.action('bank.depositOpen', {
  building: 'bank', group: 'services', icon: 'deposit', label: 'act.bank.deposit', p: 0,
  screen: 'bank.deposit',                      // the row opens a sub-screen (§7.1) instead of running
});
SR.def.action('uofs.classThr', { building: 'uofs', group: 'train', p: 1, feature: 'degrees', /* ... */ });
```

Fields: `building` (a building id, or one of the non-building owners `world`, `bag`, `phone`,
`jail`, `trip`, `hospital`, `street:<npc>`, `park:<spot>`, `enc:<encounterId>`), `group` (`eat`,
`buy`, `work`, `train`, `services`, `crime`, `special`), `order`, `icon`, `label` (text key),
`desc` (text key, optional), `p`, **`feature`** (the flag of Appendix B; **required on every def
with `p ≥ 1`**, validated), `cost` (`cash`, `min`, `hp`, `items`), `priceTarget`, `requires`,
`effects`, `variants`, `minigame`, **`screen`** (a sub-screen id; with `screenParams`),
`timeRule` (`'robbery'` | `'trip'` | `'free'`), `repeatable`, `confirm` (text key: the UI asks
first), `hidden` (condition list: hide instead of disable), `hotkey`, `silent` (no feedback; used
by `world.enter`).

- **`repeatable: true`** is allowed only on defs without `confirm`, `minigame`, `screen` or an
  irreversible effect (crime, loans, fights, property, election actions); the validator enforces
  it. Only repeatable rows respond to R and hold-to-repeat (§11, UI §1).
- **HP costs:** every voluntary action with an HP cost `c` (in `cost.hp` or a guaranteed or
  possible `hurt` in its effects, worst case) has the requirement `['hpAbove', c]` (reason key
  `reason.tooHurt`, "Too hurt"). The validator checks that every `hurt` in a def with `p` has a
  matching `hpAbove`. Involuntary damage (falls, car hits, crashes, muggers' forced outcomes,
  fights' enemy turns) is exempt and is what can reach 0 HP (§6.7).
- Each building file defines its own `'<id>:resolve'` actions for its minigames (robberies,
  fights, darts, the casino games, trips, hotwiring, the debate); they are `timeRule: 'free'`,
  never shown as rows, and take the minigame result as `params`.

### 6.4 Conditions and effects

**Conditions** (`js/rules/conditions.js`; each returns `{ ok, reason, vars }`): `timeFits`,
`cashAtLeast(n)`, `hpBelowMax`, `hpAbove(n)` (reason "Too hurt"), `stat(key, min)`,
`statBelow(key, max)`, `karma(min, max)`, `item(key, min)`, `noItem(key)`, `flag(key)`,
`notFlag(key)`, `feature(flag)`, `job(id)`, `jobTrack(track)`, `jobAtLeast(id)`, `homeTier(min)`,
`livesIn(id)`, `owns(homeId)`, `furniture(id, minTier)`, `freeSlots(n)`, `weekday(list)`,
`timeBetween(a, b)` (a window: start allowed when `a ≤ now < b`), `weather(list)`, `heat(min, max)`,
`buzzBelow(n)`, `dailyBelow(key, n)`, `weeklyBelow(key, n)`, `npcStage(npc, stage)`,
`election(status)`, `perk(id)`, `difficulty(list)`, `phone`, `cityEvent(id)`, `not(cond)`,
`any(list)`, `all(list)`, `fn(name, ...args)`.

**Effects** (`js/rules/effects.js`): `cash(n, src)`, `bank(n, src)`, `charge(n, reason)` (forced;
§6.2), `heal(n)`, `hurt(n, cause)`, `stat(key, n)`, `karma(n)`, `heat(n)`, `buzz(n)`, `item(key, n)`,
`flag(key, v)`, `time(min)`, `setTime(min)`, `daily(key, n)`, `weekly(key, n)`, `record(key, n)`,
`msg(key, vars)`, `toast(key, vars)`, `stamp(key, vars)`, `sfx(name)`, `anim(name)`,
`achievement(id)`, `npcStage(npc, stage)`, `open(skin, params)`, `emit(name, payload)` (a rule
event, §6.8), `log(kind, vars)` (§6.9), `jail(reason)`, `check(checkId, stat, D, winEffects,
loseEffects)` (checkId selects check modifiers, §6.10), `chance(p, aEffects, bEffects)`,
`fn(name, ...args)`. Stat gains go through `SR.rules.stats.add`, which applies the degree bonus,
Winded and the cap, raises `hpMax` with STR and records the applied amount in the delta. Positive
`cash` / `bank` with an income `src` (`wage`, `rent`, `salary`, `interest`, `deal`, `tour`, `loot`,
`win`, `prize`) pass through the lien (B-09): while `money.lien > 0`, half goes to the lien.

**Named functions** cover everything not declarative: `SR.def.fn('bank.deposit', (s, params,
ctx) => Result)`. Data refers to them by name. Names are `<area>.<verb>`.

### 6.5 Rule modules (pure; `s` is the state)

| Module | Public functions |
|---|---|
| `SR.rules.check` | `chance(stat, D, opts)` → 0.05..0.95 after check modifiers (§6.10; `opts = { s, checkId }`); `roll(rng, p)` → bool |
| `SR.rules.time` | `canStart(s, min)`, `spend(s, min)`, `setTo(s, min)`, `weekday(s)` (of `s.clock.day`), `week(s)`, `isMarketDay(day)` (Mon-Fri), `fmt(min, h12)` |
| `SR.rules.stats` | `add(s, key, n, src)` → applied, `karma(s, n)`, `heat(s, n)`, `buzz(s, n)`, `heal(s, n)`, `hurt(s, n, cause)` (clamps at 0), `band(k)` (0..9 index into the palette's karma bands), `tier(k)`, `winded(s)` |
| `SR.rules.log` | `add(s, kind, vars)` (weight from `tuning.news.weights`), `roll(s)` (today → yesterday) |
| `SR.rules.perks` | `offers(s)` → pending list, `choose(s, id)`, `has(s, id)` |
| `SR.rules.jobs` | `bestTitle(s)`, `canApply(s, track)`, `promotion(s, track)` → `{ok, next, missing}`, `promote(s, track)`, `work(s, track, variant, m)`, `wage(s, id)`, `creditLimit(s)` |
| `SR.rules.training` | `apply(s, id)`, `graduate(s, track)`, `seminarOk(s, track)` |
| `SR.rules.night` | `run(s, ctx, { kind: 'sleep'|'jail'|'hospital' })` → Report (§6.6) |
| `SR.rules.health` | `down(s, cause, ctx)` → Down (§6.7), `bill(s)` |
| `SR.rules.news` | `headline(s)` → `{ key, vars }` from `log.yesterday` (§6.9), `tvStory(s, rng)` |
| `SR.rules.bank` | `deposit`, `withdraw`, `charge(s, n, reason)`, `loan(s, n)`, `repay`, `openCd`, `breakCd`, `interest(s)`, `rateStep(s)`, `loanNight(s)`, `default(s)` (seizure order and lien, B-09) |
| `SR.rules.stocks` | `tick(s, facts)`, `drawTip(s, rng)`, `reliability(s)`, `buy(s, t, n)`, `sell(s, t, n)`, `cap(s, t)`, `value(s)`, `reverseSplit(s, t)` |
| `SR.rules.homes` | `buy(s, id)`, `sell`, `moveIn`, `letOut`, `endLet`, `slotsUsed(s)`, `slots(s)`, `buyFurniture(s, id)`, `upgrade(s, id)`, `sleepBonus(s)`, `doorHomes(doorId)` |
| `SR.rules.crime` | `robPrecheck(s, target)`, `holdupParams(s, target)`, `robResolve(s, target, beats)`, `jail(s, reason)`, `jailDay(s, choice)`, `bail(s)` → cost, `payBail(s)`, `fine(s, points)`, `policeTalk/Bribe/Run(s)` |
| `SR.rules.trade` | `canBoard(s, kind, cityId)`, `trip(s, cityId)` → Trip, `take(s, trip)`, `haggle(s, trip)`, `tour(s, cityId, hookResult)`, `rollDemand(s)` |
| `SR.rules.fight` | `create(s, kind, n)` → Fight, `playerMove(f, move)`, `endTurn(f)`, `enemyTurn(f)`, `autoPlay(s, f, rng)` (the Auto policy, §10), `finish(s, f, choice)` |
| `SR.rules.casino` | `slots.spin(rng, bet)`, `slots.rtp()`, `bj.*` (shoe, deal, hit, stand, double, split, dealer, settle, counts, `suspicion(s, bet, trueCount)`, `basic(hand, up)`), `roulette.spin(rng)`, `roulette.settle(bets, pocket)`, `scratch(rng)`, `darts.score(dx, dy)`, `darts.wobble(t, params)`, `darts.autoThrows(s, params, rng)`, `vip(s)` |
| `SR.rules.election` | `nominationCheck(s)`, `accept(s, chest)`, `campaign(s, actionId)` (caps and halving, B-17), `debate(s, beats)`, `electionNight(s, rng)`, `officeMorning(s)`, `decreeOffer(s, rng)`, `decree(s, id)` |
| `SR.rules.calendar` | `today(s)` → bonuses, `rollWeather(s, rng)`, `cityEvent(s)`, `rollCityEvent(s, rng)` |
| `SR.rules.encounters` | `seed(s, rng)`, `active(s, now)`, `resolve(s, id, choice)` |
| `SR.rules.arcs` | `onEvent(s, ev, ctx)` → effects (Harold, kid, Red, McHolland, Crease) |
| `SR.rules.achievements` | `evaluate(s, ev, profile)` → ids |
| `SR.rules.advisor` | `goals(s)` → up to 3 `{ key, vars, progress }` |
| `SR.rules.endgame` | `netWorth(s)`, `rank(s)`, `legacy(s)`, `results(s, reason)`, `hofBucket(length)` |

Every module also has the additive names of §6.11 (recorded at the wave-1 integration).

### 6.6 The night

`SR.rules.night.run(s, ctx, { kind })` applies the fixed, unit-tested order of **GDD §4.7** (every
nightly rule has a numbered step there) and returns a **Report**:

```js
{ kind: 'sleep'|'jail'|'hospital',
  day /* the new day */, endedDay, weekday /* of the new day */,
  lines: [{ section: 'overnight'|'money'|'markets'|'weather'|'today'|'jail'|'hospital'|'election',
            icon, key, vars, weight }],
  headline: { key, vars },               // SR.rules.news.headline (§6.9)
  weather: { today },                     // today's weather only; the forecast is never in the report (GDD §3.12)
  election: null | { won, poll, roll, path },   // non-null on election night: the report scene shows the
                                               // election-night edition first, whatever the kind
  events: [{ name, payload }],            // rule events raised during the night (§6.8)
  ended: null | 'time', dead: null | 'loan' }
```

`kind: 'sleep'` runs every step; `'jail'` and `'hospital'` run the subsets listed in GDD §4.7. The
night is the only place the day advances. `SR.rules.time.isMarketDay(endedDay)` (captured before
any step) decides the market tick, so the ticks happen on the nights after Monday to Friday.

### 6.7 HP 0: `SR.rules.health`

`SR.rules.health.down(s, cause, ctx)` is called by the action pipeline whenever HP reaches 0 (the
night never deals damage). `cause` ∈ `fall`, `carHit`, `carCrash`, `fight`, `mugger`, `goons`, `other`.

```js
Down = { outcome: 'secondWind' | 'hospital' | 'death', cause, bill, writtenOff, report /* hospital night */ }
```

1. **Second Wind** (perk, unused today): HP = 1, `daily.secondWind = 1`, outcome `secondWind`
   (a toast; nothing else happens).
2. **Hardcore:** outcome `death`: `s.over = true`, `s.result = endgame.results(s, 'death')`.
3. **Relaxed / Standard:** outcome `hospital`: the bill (B-31) is charged with `bank.charge`
   (cash, then bank, shortfall written off), `records.hospital += 1`, then `night.run(s, ctx, {
   kind: 'hospital' })` runs immediately (the hospital night, GDD §4.7): the day advances, the
   economy runs without furniture gains, HP is set to `floor(0.5 × hpMax)` and the clock to 12:00.
   The player is placed outside their home door (`spawn.afterHospital = 'homeDoor'`). A timed
   game can end during the hospital night; the results follow the Stick General report.

`SR.act` emits `player:down { cause, outcome }`; `js/scenes/hospital.js` (W2-Transit) queues the
presentation (§5): `hospital` plays the FLATLINED gag, the bill card and the Stick General report,
then the city at 12:00; `death` plays the FLATLINED stamp, then the results with the DECEASED
banner. Fights on Standard and Relaxed never reach 0 HP (a loss leaves HP 1, B-13); on Hardcore a
fight loss calls `down(s, 'fight')`.

### 6.8 Rule events (frozen at M0)

Rules raise events only through `Result.events` and `Report.events` (`['emit', name, payload]` or
named functions), so Node tests and the simulator see them. `SR.act` and the report scene re-emit
each one on `SR.events` under the same name. Arcs (`data/arcs.js`, `on: '<name>'` plus a `match`
object compared field by field with the payload), achievements and the log listen to these.

| Event | Payload | Raised by |
|---|---|---|
| `enter` | `{ building }` | `world.enter` (the building scene on entry; silent, free) |
| `talk` | `{ npc }` | opening a street dialog (`street.<npc>.talk`, silent) |
| `gift` | `{ npc, item, n }` (`item`: `cash`, `booze`, `takeout`, `shirt`, `smokes`, `gum`) | street gift actions |
| `buy` | `{ item, n, where, price }` | every purchase (items, furniture, homes, product) |
| `sell` | `{ item, n, where, price }` | pawn sell, home sell, stock sell |
| `eat` | `{ item, hp, where }` | food, takeout, leftovers |
| `shift` | `{ track, rank, variant, m, pay }` | work |
| `train` | `{ id, stat, n }` | training actions, TV, jail workouts |
| `promote` / `graduate` | `{ track, from, to }` / `{ track }` | jobs, U of S |
| `night` | `{ day, weekday, kind }` | `night.run` (after the day advanced) |
| `trip` | `{ city, kind: 'smuggle'|'tour', outcome: 'sold'|'mugged'|'busted'|'screwed'|'noBuyers'|'wasted'|'walked'|'toured', units, cash }` | `trip.*` |
| `rob` | `{ target: 'store'|'bank', outcome: 'win'|'lose', loot }` | robbery resolve |
| `jail` / `release` | `{ reason, days }` / `{ reason, bailed }` | `crime.jail`, jail days, bail |
| `fight` | `{ kind: 'bar'|'ring'|'goons', n, outcome: 'win'|'lose'|'run' }` | fight resolve |
| `gamble` | `{ game, bet, net }` | casino, scratch, darts matches |
| `fall` | `{ count, x, y }` | `world.fall` |
| `carHit` / `carCrash` | `{ count }` / `{}` | `world.carHit`, `world.carCrash` |
| `down` | `{ cause, outcome }` | `health.down` |
| `loan` | `{ kind: 'take'|'repay'|'default', amount }` | bank |
| `home` | `{ kind: 'buy'|'sell'|'moveIn'|'let'|'endLet', id }` | homes |
| `election` | `{ status, poll }` | election rules |
| `decree` | `{ id }` | Mayor's Office |
| `encounter` | `{ id, choice, outcome }` | encounters |
| `scrap` | `{ n }` | Theory of the Fold pickups |
| `stat` | `{ key, n, total }` | `stats.add` (for perks and achievements; not shown) |

### 6.9 The daily log and the headline

`state.log.today` collects `{ kind, weight, vars }` entries written by the `log` effect (at most 20 a
day; a 21st entry replaces the lowest-weight one if heavier). Night step 9 moves `today` to
`yesterday`. `SR.rules.news.headline(s)` picks the heaviest entry of `log.yesterday` (ties: the
latest) whose weight ≥ `tuning.news.minWeight`, and returns the headline key `news.head.<kind>`
with its vars; otherwise a random "city absurdity" template. The TV news leads with the same
entry. Kinds and weights: BALANCE B-29.

### 6.10 Price and check modifiers

**Prices:** `SR.rules.act.price(s, base, target, ctx)` → `{ price, applied: [modIds], consumes }`.
`target` is the action's `priceTarget` (or an item id for named-function purchases). The
modifiers are rows of `tuning.priceMods` (BALANCE B-28a), each `{ id, kind, value, targets, when }`
where `targets` are dotted globs (`food.mcsticks.*`, `item.pawn.*`) and `when` is a condition list.
Order: (1) markups and surcharges on the base (`markup` ×, then `add` +); (2) **fixed** prices:
take the minimum of the price and every applicable fixed price; (3) **percent** discounts: only the
single largest applies; (4) round half up to whole dollars, minimum $0. A modifier with
`consume: true` (the flyer coupon) is used up only if it is the one applied.

**Checks:** `SR.rules.check.chance(stat, D, { s, checkId })` applies the rows of
`tuning.checkMods` (B-28b) whose `checks` glob matches `checkId` and whose `when` holds: first `dD`
rows (summed into D, D ≥ 1), then `add` rows (summed onto the probability), then the clamp to
0.05..0.95; a row with `always: true` returns 1. Every check in the game has a `checkId`
(`holdup.store.str`, `police.talk`, `enc.mugger.fight`, ...; the list is in B-28b).

### 6.11 Additive rule names (wave-1 integration)

Nothing frozen changes; an optional trailing `rng` / `ctx` is added where a rule draws (CONTRACT
§8.9 lists the same names).

- **Pipeline** (W1-R): `SR.act(id, params, opts)` takes `opts.source` (`'ui'` default, `'sim'`,
  `'debug'`). `SR.act` emits `action:done` for refusals too (`result.ok` false) and derives
  `perk:offered`, `election:changed` and `game:over`; the `down` rule event comes from `Down.events`
  when `health.down` supplies it, else the pipeline adds it, and `Down.toasts` (Second Wind's toast)
  join `Result.toasts`. A Preview carries `id`; a hidden preview is `{ id, hidden: true }`; a gain
  may carry `from` / `to` for non-numeric deltas. `SR.rules.act.GROUPS`, `actions(owner)` (ids in
  card order, `:resolve` left out), `snapshot(s)`, `diff(a, b)`. `SR.rules.state.VERSION` (1).
- **A named fn's partial Result:** `ok: false` refuses the action and rolls the state and the rules
  stream back; returned `msgs` and `log` entries are **delivered by the pipeline** (a fn returns them
  instead of adding them itself), except those of a partial Result built by
  `SR.rules.effects.run(s, list, ctx)`, which that call delivered already and the pipeline only
  reports; `deltas` are ignored (the pipeline diffs the state, so a change made by any path is
  reported once); `report` is a set field like `open` (a sleep action hands its night Report to the
  UI); `chance` is read by previews only.
- **Effect arguments** beyond the frozen effect list: `stat(key, n, src)`, `item(key, n, value)` (list items
  push / remove `value`), `toast(key, vars, kind)`; any numeric argument may name a named fn.
  **`timeRule: 'trip'`** applies B-01's boarding windows by the trip's kind, read from `params.kind`
  (or `params.variant`) in the `trip` event's vocabulary: `'smuggle'` (also `'redeye'`) boards only
  at `time.redEyeDeparts` (00:00; `reason.redEye`), `'tour'` at 06:00-10:00 inclusive
  (`time.tourWindow`; `reason.tourWindow`); without a kind any time before the wall
  (`reason.dayOver`). **Price modifiers:** a `priceMods` row's `value` may name a named fn (`redWeek`
  uses `mods.redWeek`: rand(90..110)/100 from hash(seed, 'redWeek', week), so it holds all week with
  no state field); rows may carry `feature`, `except`, and `consume` + `item`.
- **`SR.rules.time`**: `weekdayOf(day)`, `dayIndex(nameOrIndex)`, `left(s)`. **`stats`**: `gain(s,
  key, n, src)` (what a gain would do, no mutation), `column(k)` (the B-18 rank column), `KEYS`;
  `add(s, key, n, src, out)`: an optional `out` receives the `stat` rule event for callers outside
  the pipeline (the night passes its Report). Gain sources: `'train'` (default: degree bonus and
  Winded), `'furniture'` (Winded only), `'fixed'` (neither), any other (`'reward'`, `'decree'`, ...:
  the degree bonus only). **`log`**: `weight(kind)`. **`perks`**: `update(s)` (queues due offers;
  `stats.add` calls it), `optionsFor(stat, level)`. **`check`**: `mods(s, checkId)`, `match(glob,
  id)`, `matchAny(globs, id, except)`, `rowApplies(row, s, ctx)`.
- **`SR.rules.conditions`** = `{ names, eval(s, cond, ctx), all(s, list, ctx), num, count, path,
  nameOf, label, holds, rankIndex }`; **`SR.rules.effects`** = `{ names, run(s, list, ctx, res?), one,
  merge, partial, isPartial, credit, charge, addMsg, pruneMsgs, MSG_MAX, INCOME, trackIncome,
  noteIncome }`. **`effects.run`, `addMsg`, `merge` and `partial` are frozen**: the night delivers
  its voicemails through `addMsg` (one message id sequence and the 150 retention rule) and runs arc
  effects through `run`; `run(s, list, ctx)` without `res` returns a partial Result.
  **Income on Deltas:** while an action runs, `credit()` and `SR.rules.bank.income` report income
  credits by source (`trackIncome()` / `noteIncome()`), and a positive `cash` / `bank` Delta
  carries `key` = the source (`INCOME`: `wage`, `rent`, `salary`, `interest`, `deal`, `tour`,
  `loot`, `win`, `prize`) that credited the most to it (`{ kind: 'cash', key: 'wage', n, from, to
  }`); credits without a source name none (the balance simulator's income by source).
- **`SR.rules.jobs`** (W1-E): `ladder`, `missingReason(p)`, `shiftCost(s, variant)`, `canWork(s,
  track, variant, ctx)` (Overtime's "Too hurt" follows the Heat Wave `ctx.hpScale`),
  `weeklyBonus(s)`, `legacyRank(s)`, `hustleSkin(s, track)` → `{ skin, step }`, `takeoverDue(s)`,
  `takeover(s, m)`, `rainTips(s, track, m)`; `work(s, track, variant, m, opts)` takes `{ hustle: true
  }` when `m` is a played hustle's result (rain tips apply to a played Order Up only; Auto stays 1.0).
  **`training`**: `can(s, id, opts)`, `classTrack(id)`, `canGraduate(s, track)`, `gain(s, id)`
  (Study follows the Public Library Act through `decree.studyGain`), `minutes(s, id)` (Speed Reader),
  `napHp(s)`. **`bank`**: `income(s, n, src, to)` → `{ credited, toLien }`, `paidRate(s)`,
  `cdPrincipal(s)`, `maturities(s)`, `lienSources()`. **`stocks`**: `quirkShock(t, facts)`,
  `reveal(s, source)`, `revealed(s)`, `spread(s)`, `tickers()`.
- **`SR.rules.homes`**: `freeSlots`, `has(s, base)` → the tier in use, `pieces`, `removePiece`
  (restocks stored pieces into freed slots), `restock`, `channels(s)`, `nightly(s)`, `perk(s)`,
  `perkOk(s, homeId)`, `usePerk(s)`, `rentOf`, `saleOf`, `rents(s)`, `homesValue`, `furnitureValue`,
  `tierId(base, tier)`, `buyCar(s, opts)` (the Workstation catalogue's sports car, P1 `homesPlus`).
  Furniture defs may carry `retiredBy: '<flag>'` (not sold while that flag is on).
- **`SR.rules.calendar`**: `weekdayOf`, `eventDays`, `storm(s)`, `next(from, rng)`; `today(s).bonuses`
  lists Tuesday (Open Mic), Saturday (the Ring, VIP points) and Sunday (the skate contest) only
  while their own flags (`nightlife`, `arcs`) are on as well as `calendar`. **`endgame`**:
  `breakdown(s)`, `column(karma)`, `tier(nw)`, `banners(s, reason)`. **`news`**: `lead(s)`.
  **`night`**: `SUBSETS`, `steps` (the numbered GDD §4.7 steps); `run(s, ctx, opts)` also takes
  `bill`, `paid`, `writtenOff`, `cause` (the Stick General lines, from `health.down`) and `trace`
  (an array the step numbers are pushed to; tests). A Report may carry `achievements: [ids]` (step
  12, when `achievements` is on); a Down carries `events` and `toasts`.
- **`SR.rules.crime`** (W1-C): `holdupD`, `holdupChances`, `holdupAuto(s, params, rng)`,
  `recentBankRobberies`, `rob(s, target, ctx)` (the start), `jailDays`, `bailBase`, `release`,
  `canBail`, `talkChance`, `bribeCost`, `interrogation`, `mchollandTip`, `mchollandBribe`,
  `JAIL_CHOICES`; `jail(s, reason, ctx)`, `jailDay(s, choice, ctx)`, `policeRun(s, caught, ctx)`
  take an optional `ctx`; `holdupParams` returns `{ target, D, check: 'holdup.<target>', beats, need,
  bestOf, stake: true, options, chances }`.
- **`SR.rules.trade`**: `cityIds`, `ticket`, `demand`, `dailyDemand`, `tourDemand`, `reputation`,
  `bustThreshold`, `busted`, `screwedChance`, `mugChance`, `offerPerUnit`, `offerMult`, `board`,
  `smuggle(s, city, ctx)`, `pending(s)`, `walk`, `tourBase`, `tourFee`, `tourParams`, `tourStart`.
  **`fight`**: `MOVES`, `ap`, `nextN`, `opponent`, `moves(f)` (cost, range, EV, allowed), `range`,
  `expected`, `run(f)`, `autoMove`, `result`, `start`, `resolve`, `canStart`.
- **`SR.rules.casino`**: `slots.{SYMBOLS, LINES, strip, pays(s), line, enumerate, hitRate, round}`;
  `bj.{rank, value, total, hilo, reshuffle, draw, shoeOf, validShoe, canDouble, canSplit, hand,
  wagered, playBook, round}`; `roulette.{DOUBLE_ZERO (37 = 00), OUTSIDE, covers, isRed, legal,
  round}`; `scratchPrize`, `scratchEV`, `scratchRound`; `darts.{amp, params, practice, matchStart,
  match, AUTO_WINDOW_SEC}`; `vipDrink`, `canPlay`, `applyRound`.
- **`SR.rules.election`**: `ACTIONS`, `RIVAL`, `clampPoll`, `qualifies`, `chestTier`, `startPoll`,
  `canCampaign`, `actionChance`, `canDebate`, `debateParams`, `debateStart`, `campaignMorning(s, rng)`,
  `remove`, `eligible`, `decreeName`. **Night step 5 is split:** the night does the bookkeeping from
  `tuning.election` (the rival's -rand(1..3), `campaignDay += 1` (1 on the first campaign day), the
  debate no-show, the lapse of an unaccepted nomination); after campaign day 7 it calls
  `electionNight(s, rng)` → a partial Result `{ won, poll, roll, path, events?, msgs?, log? }` that
  also sets the status. At step 12 it calls `nominationCheck(s)`, then on a campaign morning
  `campaignMorning(s, rng)`, and in office `officeMorning(s, rng)`, absorbing each partial Result.
  The jail night (step 10) decrements `jail.daysLeft` and increments `jail.served`; the release
  itself (jail `null`, Heat 20, the `release` event, 08:00 outside City Hall) stays with
  `crime.jailDay` when `daysLeft` reaches 0.
- **The "in progress" records** (ARCHITECTURE §6.1): the resolve fns `crime.robResolve`, `fight.resolve`,
  `casino.dartsMatch`, `trade.tour` and `trade.take` / `haggle` / `walk` refuse with `reason.notNow`
  unless today's start (`crime.open`, `fight.open`, `casino.match`, `trade.offer`) is still open, and
  close it; the open record's facts (target, kind, rung, tier, stake, city) win over anything the
  minigame result echoes. So a stray or repeated `:resolve` never pays twice.
- **Named fns for data** (W1-E): `bank.{deposit, withdraw, loan, repay, openCd, breakCd, charge,
  canLoan, hasLoan}` (params `amount` / `index`); `stocks.{buy, sell, reveal}` (params `ticker`, `n`,
  `where`); `homes.{buy, sell, moveIn, letOut, endLet, buyFurniture, upgrade, fits, perkHere,
  usePerk, buyCar}` (params `homeId` / `piece`, or an argument); `jobs.{canWork, work, canPromote,
  promote, canApply, apply, hustleSkin, takeoverDue, takeover}` (a track argument or `params.track`;
  `params.variant`, `params.m`, `params.auto`); `shift.min`, `shift.hp` (costs by `params.variant`);
  `training.{apply, can, seminarOk, canGraduate, graduate, studyMin, paperMin, napHp}`. (W1-C):
  `crime.{canRob, rob, robResolve, jail, jailDay, canBail, bailCost, payBail, fine, policeTalk,
  policeBribe, policeRun, interrogation, mchollandTip, mchollandBribe}`; `trade.{canBoard, ticket,
  smuggle, take, haggle, walk, tourStart, tour, demand}`; `fight.{start, resolve, canStart}`;
  `casino.{canPlay, slotsSpin, bjHand, rouletteSpin, scratch, dartsPractice, dartsMatchStart,
  dartsMatch, vipDrink, settle}`; `election.{check, qualifies, accept, canCampaign, campaign, cash,
  min, canDebate, debateStart, debate, decree}`; `decree.{seizeBank, universalFries, renameCity,
  studyGain}`. (W1-R): `mods.{param, decree, atLeast, redWeek}`, `perks.choose` (`params.id`).
  Module functions return partial Results whose `log` / `msgs` the pipeline delivers.
- **Rule-event payload extras** (fields added to the frozen rule-event payloads): `trip` adds `key`,
  `vars` (the event card's story) and `mugged` (tours); `gamble` adds the round's facts (`reels`,
  `stops`, `line`, `mult`; `pocket`, `wins`; `hands`, `suspicion`, `backedOff`, `barredUntil`;
  `tier`, `score`; `pay`, `roll`).
- **Decree ids are camelCase** (`casinoLevy`, `statueOfMe`, `mandatoryHats`, `toughOnCrime`,
  `fourDayWeek`, `seizeBank`, `guardRails`, ...), an exception to the `snake_case` rule for content
  ids, because `tuning.priceMods`, the night, jobs, the bank and the world read B-17's key names.

### 6.12 How building data calls the conflict rules

How the wave-2 building data calls the conflict rules (W1-C; for W2-Food, W2-Money, W2-Night,
W2-Transit, W2-Civic):

- **Robberies:** the row `{ timeRule: 'robbery', requires: [['fn', 'crime.canRob', 'store']],
  effects: [['fn', 'crime.rob', 'store']], confirm: 'crime.rob.confirm.store' }` and its `:resolve`
  `{ timeRule: 'free', effects: [['fn', 'crime.robResolve', 'store']] }`; the same with `'bank'`.
- **Fights:** `{ cost: { min: 180 }, effects: [['fn', 'fight.start', 'bar']] }` and `:resolve` with
  `['fn', 'fight.resolve', 'bar']`; the engine plays `Result.open.params.fight` with
  `SR.rules.fight.{playerMove, endTurn, run}` and `host.rng`, its `auto` is
  `SR.rules.fight.autoPlay(state, params.fight, rng)`, and its result may add `choice: 'drink'` (P1).
- **Casino:** the engines apply each round with `SR.act` on rows calling `casino.slotsSpin` (params
  `{ bet }`), `casino.bjHand` (`{ bet, net, wagered, trueCount, shoe }`, `wagered` being the round's
  whole stake, `bj.wagered(round)`; or `{ round, shoe, trueCount }` after playing on a copy of
  `SR.rules.casino.bj.shoeOf(state)`), `casino.rouletteSpin` (`{ bets }`; a pocket is 0-36 or
  `'00'`), and read the round's facts from the `gamble` event of the Result; the minigame's `{ net }`
  resolve then needs no money effect. `casino.settle` with `params.apply` applies a whole session.
- **Darts (Sticky's):** practice rows call `casino.dartsPractice` (`cost: { min: 30 }`); a match row
  (P1) calls `casino.dartsMatchStart` (`{ tier, stake }`, `cost: { min: 60 }`), and its `:resolve`
  `['fn', 'casino.dartsMatch']` with the engine's `{ score }` pays the match stored in
  `state.casino.match`.
- **Trips:** the bus board's rows call `trade.smuggle` (`{ city }`, `timeRule: 'trip'`; with `cost:
  { cash: 'trade.ticket' }` the row shows the ticket as a chip and the fn does not take it again);
  an offer waits in `state.trade.offer` for rows calling `trade.take`, `trade.haggle` (P1),
  `trade.walk`; final outcomes arrive as the `trip` event with the story's key and vars. Tours:
  `trade.tourStart` and its `:resolve` `['fn', 'trade.tour']`.
- **Jail:** the Jail Day card's rows call `crime.jailDay` (`{ choice: 'str' | 'int' | 'cha' | 'hp' }`)
  and `crime.payBail` (P1); the Result carries the night's `report`; `release` in its events means
  the jail scene places the player outside City Hall at 08:00.
- **City Hall:** `election.accept` (`{ chest: 0 | 1 | 2 }`), campaign rows with `cost: { cash:
  'election.cash', min: 'election.min' }`, `requires: [['fn', 'election.canCampaign']]` and `effects:
  [['fn', 'election.campaign']]` (the campaign action is the id's last segment: `cityhall.rally`),
  the debate's `election.debateStart` / `election.debate`, the Mayor's Office `election.decree`
  (`{ id, name }`). Stepping into the city runs a silent, free action whose effect is
  `['fn', 'election.check']` besides the morning check (GDD §4.17; W2-City adds it).

## 7. Data-driven content

Every kind registers through `SR.def.<kind>(id, def)`. `SR.boot`'s priority-20 hooks index each
module's own registrations and check them (headless); **cross-reference validation** ("every id
reference resolves": icons, sfx, songs, skins, sub-screens, text keys, fns, palette keys) is
`tools/validate.cjs` in Node, which loads mode `all` (D28), because mode `rules` cannot see icons,
sounds, skins or sub-screens and many referenced files are stubs during a wave.
**Every def with `p ≥ 1` carries `feature: '<flag>'`** (BUILD_PLAN Appendix B); cards, previews,
the Bag, the Pocket, dialogs and encounter seeding filter on `SR.features`.

| Kind | File(s) | Key fields |
|---|---|---|
| `tuning` | `data/tuning.js` | the BALANCE tables (`SR.def.tuning({...})`, read as `SR.tuning`) |
| `features` | `data/features.js` | `SR.def.features({ weather: false, hustles: false, ... })`, read as `SR.features`; the only switch for P1 / P2 behaviour |
| `fn` | any rules or data file | `SR.def.fn('bank.deposit', (s, params, ctx) => Result)` |
| `worldmap` | `data/worldmap.js` | §8.1 |
| `building` | `data/buildings/<id>.js` | `id, name (text key place.<id>), owner, portrait, music, interior, greetings[], groups[], exteriorId, modes?` (home: `live`, `owned`, `forSale`: `{ live: [actionIds], ... }`, how the card reads them: §7.1) |
| `action` | `data/buildings/*.js`, `data/actions/*.js` | §6.3 |
| `subscreen` | `ui/subscreens/*.js` | §7.1 |
| `item` | `data/items.js` | `id, name, icon, price, stack, use?, give?, category, p, feature?` |
| `job` | `data/jobs.js` | B-05 rows |
| `home`, `furniture` | `data/homes.js`, `data/furniture.js` | B-08 rows + interior draw ids + `door` (the worldmap door id of a home) |
| `stock` | `data/stocks.js` | B-10 rows |
| `city` | `data/cities.js` | B-12 rows + sky island art params (palette keys `city.<id>.*`, never hex) |
| `fighter` | `data/fighters.js` | `n, name, palette ('fighter.<n>'), accessory, quirk, taunts[], hp?, p?` |
| `decree` | `data/decrees.js` | `id, path ('any'|'president'|'dictator'), once (bool), effects, night? (nightly effects), p, feature`; ids are B-17's camelCase keys (D54) |
| `rank`, `perk`, `achievement` | `data/*.js` | GDD tables |
| `encounter` | `data/encounters.js` | `id, weight, cap, when, where, conditions, choices: [{label, preview, effects}]` |
| `arc` | `data/arcs.js` | `npc, stages: {id: {on: '<event>', match: {...}, cond, effects, next}}` (events: §6.8) |
| `event` | `data/events.js` | shift events, city events, campaign events: `{kind, id, text, choices}` |
| `person` | `data/people.js` | named NPCs: `id, name, look, voice, schedule: [[weekdays, from, to, placeId, cond?]], barks` (the schedule table: GDD §6.2) |
| `contact` | `data/actions/phone.js` | Phone contacts: `id, name, unlock: [conds], actions: [actionIds], p, feature` (UI §5.9) |
| `skin` | `minigames/skins/*.js` | `engine, params, art, text, auto` (§10) |
| `song`, `sfx` | `audio/songs/*.js`, `audio/sfx.js` | the data formats of ART_AUDIO §13.8 (frozen at M0) |
| `text` | `data/text/en-*.js` | `SR.def.text({ 'act.mcsticks.fries': 'Fries', ... })` |
| `interior` | `art/interiors/<id>.js` | ART_AUDIO §9 (colours as palette keys) |
| `exterior` | `art/exteriors-detail.js` | `SR.def.exterior(id, { detail(ctx, geom, state), signature: [rects] })` (the only style; §9.3) |
| `icon` | `art/icons.js` | `SR.def.icon(name, draw(ctx, size, state))` |

### 7.1 Sub-screens

A sub-screen is a page that replaces a card body (or a Pocket panel) with a Breadcrumb and its own
content. Any host can show any sub-screen: the building card, the Pocket's Phone tab (Stocks,
Paperweight Realty) and a home door in For Sale mode all use the same ids.

```js
SR.def.subscreen('bank.deposit', {
  title: 'sub.bank.deposit',          // breadcrumb text key
  p: 0, feature: undefined,           // feature required when p ≥ 1
  mount(root, ctx) {},                // build DOM into root (the host clears root on unmount)
  refresh(ctx) {},                    // after every ctx.act, a clock or money change, and when a child sub-screen pops
  unmount() {},                       // remove listeners and timers
  back(ctx) { return true; },         // optional: false vetoes Back (the host then asks to confirm, e.g. a half-typed amount)
  onAction(action, ev, ctx) {},       // optional: input actions not consumed by focus navigation
});
// ctx = { state (read-only view), params, building (host building id or null), host: 'card'|'pocket',
//         preview(id, p) → Preview, act(id, p) → Result, push(subscreenId, params), pop(result),
//         replace(subscreenId, params), close(), text, ui (SR.ui components) }
```

- **Opening from a row:** an action with `screen: '<subscreenId>'` (and optional `screenParams`)
  opens it instead of running; the row's preview still evaluates `requires` (so it can be disabled
  with a reason) and shows no cost chips.
- **Parameters to rules:** a sub-screen never mutates state; it calls `ctx.preview(id, params)` for
  live chips (e.g. `bank.deposit` with `{ amount }`, `stocks.buy` with `{ ticker, n }`, `roulette`
  bets are in the minigame, not here) and `ctx.act(id, params)` to commit. The host plays the
  Result's feedback (chips, stamps, sounds), calls `refresh`, and handles `open` / `down` / `jailed`
  like any row.
- **Host API** (`js/ui/card.js`, W1-D): `SR.ui.card.open(buildingId, { params, screen,
  screenParams })` enters a building (from another building or the city) and optionally opens a
  sub-screen on arrival; `SR.ui.card.push(id, params)`, `pop(result)`, `replace`, `refresh()`;
  `SR.ui.subhost.create(root, { onClose })` makes a host inside any DOM root (the Pocket uses it).
  As built, `subhost.create` takes more options and returns a host object, the sub-screen `ctx`
  adds `refresh()` and `ctx.state` is a read-only Proxy (a write throws); how the card reads
  `building.modes`, greetings and door params is in §7.3.
- **Frozen ids** (owner file): `bank.deposit`, `bank.withdraw`, `bank.loan`, `bank.rates`,
  `bank.cds` (P1) (`subscreens/bank.js`); `bank.realestate` with `params.homeId` to focus a property
  (`realestate.js`); `nli.jobs` (`jobs.js`); `home.stocks` (`stocks.js`), `home.tv` (`tv.js`),
  `home.messages` (`messages.js`); `furniture.browse` (`furniture.js`); `pawn.shop` with Buy / Sell
  tabs (`shop.js`); `uofs.transcript` (P1) (`transcript.js`); `cityhall.campaign` (`campaign.js`);
  `bus.board` (`bus.js`); `cityhall.mayor` (P1) (`mayor.js`); `casino.vip` (P1) (`vip.js`).

### 7.2 Text

`SR.text(key, vars)` returns the string with `{name}` style substitution; an array value picks a
variant with the fx RNG unless `vars.variant` is given. Formatting helpers: `SR.text.money(n, {
sign, cents, compact })`, `SR.text.time(min, h12)`, `SR.text.num(n, digits)`, `SR.text.dur(min)`,
`SR.text.pct(p, digits)`, `SR.text.has(key)`, `SR.text.missing()` (D10: a missing key renders
`⟦key⟧` and warns once with `console.warn`, never `console.error`; `time()` follows `game.clock24`;
money never shows `-$0`). Length limits per slot (GDD §6.11) are enforced by the validator via key
prefixes (`act.` ≤ 28, `bark.` ≤ 60, `toast.` ≤ 80, `greet.` ≤ 140, `vm.` ≤ 280, `card.` ≤ 400,
`enc.` ≤ 400, `event.` ≤ 400, `news.` ≤ 220).

**Every package that registers content owns a text file for its keys** (§19), and text is
registered only in `js/data/text/en-*.js`. Wave 1 has `en-ui.js` (W1-D: UI chrome, HUD, settings,
glyph names, captions `cap.*`, the title strings, the minigame frame `mg.frame.*` and the W1-M
engines' `mg.shiftrush.*` / `mg.timingring.*` / `mg.duel.*`), `en-econ.js` (W1-E: items, jobs,
homes, furniture, stocks, ranks, every morning-report line `report.*`, the night's `vm.crew.*` and
`vm.skywatch.*`), `en-conflict.js` (W1-C: cities, fighters, decrees, crime and trip outcome keys),
`en-prog.js` (W1-R: perks and **every** `reason.*`, and `toast.act.*`; W3-Prog adds achievements,
the Advisor and the perk card) and `en-world.js` (W1-W: place names `place.<id>`, door tags and
modes `door.*`, Pilot Ori `ori.*`, `act.world.*`, `desc.world.*`, world toasts). Keys that a rule
module raises itself (`toast.<module>.*`, `stamp.<module>.*`) belong to the module owner's file
(D27); `vm.<npc>.*` and `bark.<npc>.*` to the NPC's file; `en-pocket.js` (W2-Pocket) holds
`act.bag.*`, `act.phone.*`, `contact.*`, `pocket.*` (D16). CONTRACT §7 has the full prefix table,
which `tools/validate.cjs` (`textOwner`) follows (D51). The validator also has a `--wave N` mode: a
missing key whose prefix belongs to a file that is still a stub is a warning instead of an error.

### 7.3 How the card reads building data

For W2-Home and every building owner (`js/ui/card.js`, W1-D): `building.modes` is
`{ live: [actionIds], owned: [...], forSale: [...] }` (or `{ mode: { actions: [...] } }`); when
the scene's `params.mode` names one, the card shows exactly those actions in that order, else
every action with `building: <id>`. Scene params are merged into every preview and act (`{ homeId,
mode, variant }`). Greetings: a named fn `greet.<buildingId>` (`(s, params, ctx)` → `{ key, vars }`
or a key) chooses the greeting by first visit, time, karma, weather or job (UI §5.6); without it
the card picks one of `building.greetings[]`, else `greet.<id>` if registered. A row with `screen`
passes the door params to its sub-screen; the row's own `screenParams` win over a door param of
the same name. The Hustle button reads `{ skin, step }` from `jobs.hustleSkin` and runs
`SR.minigame.run(skin, { skin, step, auto, ...params })`.

## 8. World model

### 8.1 World map data

```js
SR.def.worldmap({
  size: { w: 5120, h: 4608 },
  transform: { sx: 2, sy: 2, ox: 2560, oy: 2304 },          // original map → world (documentation + tests)
  outline: [[480, 620], [860, 200], /* GDD §3.3 */],
  newLand: [{ id: 'castleRim', rect: [480, 200, 1746, 784] }], // land the original never had (GDD §2.5)
  holes: [{ id: 'bushole', rect: [3599, 2752, 3746, 3124] }],
  railings: [{ a: [3434, 656], b: [4228, 656] }, { a: [4396, 840], b: [4396, 1642] }],
  walls: [{ a: [860, 210], b: [1746, 210], w: 20 }, { a: [1736, 200], b: [1736, 656], w: 20 }],
  streets: [
    { id: 'main', kind: 'asphalt', rect: [2308, 656, 2670, 4100],
      lanes: [{ id: 'mainS', axis: 'y', dir: 1, at: 2398 }, { id: 'mainN', axis: 'y', dir: -1, at: 2580 }] },
    { id: 'mainSW', kind: 'sidewalk', rect: [2138, 656, 2308, 4100] },
    /* ... every row of GDD §3.3 ... */
  ],
  junctions: [{ id: 'J1', kind: 'T', through: 'main', rect: [2308, 1328, 2670, 1712] },
              { id: 'J2', kind: 'T', through: 'main', rect: [2308, 2192, 2670, 2570] }],
  zebras: [{ rect: [2308, 1260, 2670, 1328] }, /* ... */],
  portals: [{ lane: 'mainS', end: 'in', at: [2398, 656] }, { lane: 'mainS', end: 'out', at: [2398, 4100] }, /* ... */],
  buildings: [
    { id: 'mcsticks', masses: [{ role: 'main', rect: [1460, 1900, 2120, 2330], h: 160 }],
      door: { face: 'E', x: 2120, y: 2050, kerb: [2330, 2050] },
      exterior: { archetype: 'shop', palette: 'bld.mcsticks', sign: 'sign.mcsticks', detail: 'mcsticks' } },
    { id: 'furniture', masses: [{ role: 'main', rect: [640, 2016, 1428, 2262], h: 160 },
                                { role: 'annex', rect: [1090, 1920, 1390, 2016], h: 48 }],
      door: { face: 'N', x: 1240, y: 1920, kerb: [1240, 1712] }, /* ... */ },
    { id: 'nli', masses: [{ role: 'main', rect: [2842, 1360, 3370, 1970], h: 200 },
                          { role: 'tower', rect: [2930, 1600, 3370, 1970], h: 600 }], /* ... */ },
  ],
  props: [{ type: 'tree', x: 2900, y: 600, variant: 1 }, /* lamps every 256 u on sidewalks, benches, hydrants, bins */],
  people: [{ id: 'harold', x: 2160, y: 2440 }, { id: 'kid', x: 2090, y: 1110 }, { id: 'dealer', path: [[2880, 3420], [2960, 3420]] }],
  interactables: [{ id: 'junker', kind: 'car', rect: [636, 1064, 818, 1162] },
                  { id: 'lookout', kind: 'spot', x: 4210, y: 4330, r: 48, action: 'park.lookout' }],
  homeLots: { junker: [636, 1064, 818, 1162], sports: [1770, 1080, 1960, 1160] },
  skyIslands: [{ city: 'crayonburg', x: -900, y: -600, scale: 0.5, parallax: 0.15 }, /* six */],
  scraps: [{ n: 1, x: 720, y: 460, when: 'always' }, /* GDD §6.9 */],
  spawn: { newGame: 'home_apt', afterJail: [3840, 1208], afterHospital: 'homeDoor' },
});
```

Units are u; rects are `[x0, y0, x1, y1]`. A building is one or more **masses** (`main`, `annex`,
`tower`), each a footprint with a height; the first `main` mass is the collision footprint's
anchor and every mass is solid. `door.kerb` is the point on the nearest drivable surface in front
of the door (used for parking, §8.5). `SR.world.geometry` derives: the walkable polygon (outline
minus holes minus solids), `edgeDistance(x, y)`, `railedAt(x, y)`, `nearestSafe(x, y, minInside)`,
the sidewalk graph (nodes every 128 u along the centre lines of sidewalks, paths and plazas, linked
across zebras), the nav grid (32 u cells, walkable cells ≥ 40 u from an unrailed edge), and for each
mass its **projected rect** `[x0, y0 - 0.5h, x1, y1]` (screen space before the camera).

**Porches.** Every door has a porch rect, derived from the face: S: `[x-48, y, x+48, y+40]` (step
and mat); E / W: the awning `[x, y-48, x±32, y+48]` plus the mat; N: the ground-plane porch
`[x-48, y - (0.5·h_annex + 32), x+48, y]` (mat, step and night light spill) plus the canopy drawn on
the annex roof's north edge. A porch's **visible strip** is the porch minus the door's own
building's projected rects; for a north door that leaves the outer 32 u.

**Invariants** (tested, `tests/node/invariants.test.cjs`):
- every door trigger lies on walkable ground reachable from the start;
- no mass overlaps another building's mass, a street or a path;
- **visibility:** every door's visible strip is ≥ 96 × 24 u and intersects no other building's
  projected rect; every `exterior.signature` rect (the bank's red facade, U of S's pediment, City
  Hall's dome and facade, the casino's dice, the NLI billboard) intersects no other building's
  projected rect; tested geometrically on the rects above;
- every original building's door face equals the original's, **except `home_castle`** (the original
  entered it through the mansion door) **and `home_pent`** (no original building); both are
  listed as (changed) / (new) in GDD §2;
- every piece of land outside the original's ground is either one of the three sky pockets, the
  Dog-Ear flap, or listed in `newLand`;
- the lane graph: **every in-portal reaches an out-portal**, and every lane segment is on some
  in-to-out route; every junction has a box;
- every prop lies on the island and off asphalt; railings lie on the outline;
- **reachable** means: the point is within 32 u of the centre of a nav-grid cell connected to the
  start cell, and the segment between them lies inside the walkable polygon. Every scrap,
  interactable, spawn point and door trigger is reachable; every scrap is ≥ 64 u from any unrailed
  edge (so gusts never push you off while picking one up);
- 200 sampled points just outside unrailed edges trigger a fall and none across railings do.

### 8.2 Entities and systems

Plain objects in arrays, updated by systems in a fixed order each step by `SR.world.update(dt)`:

1. `SR.world.player.update(dt, input)` — movement, vehicle, click-to-walk path following.
2. `SR.world.fall.update(dt)` — teeter and fall sequence (pauses 1 and 3-8 while active).
3. `SR.world.doors.update(dt)` — triggers, prompts, tags, entering (§8.4).
4. `SR.world.traffic.update(dt)` — cars (pool of 16), junction boxes, noticing, hits.
5. `SR.world.pedestrians.update(dt)` — pool of 40, sidewalk graph walking, reactions.
6. `SR.world.streetnpcs.update(dt)` — named people and schedules; `SR.world.police.update(dt)` — officers (P1).
7. `SR.world.markers.update(dt)` — encounter "!" markers, scraps, glints.
8. `SR.world.weather.update(dt)` — visual weather state, gusts (skipped with Assist › No gusts).
9. `SR.world.camera.update(dt)`.

| Entity | Fields |
|---|---|
| player | `x, y, vx, vy, facing, mode ('walk'|'skate'|'drive'), knockdown, teeter, path[]` |
| car | `id, lane, x, y, a, v, vTarget, kind ('compact'|'sedan'|'taxi'|'van'|'police'|'player'), state, honkT` |
| pedestrian | `id, x, y, node, next, speed, archetype, look, state ('walk'|'pause'|'wave'|'flee'|'hop'), bark` |
| person | `id, x, y, facing, pose, visible` (from `data/people.js` schedules) |
| marker | `id, kind ('encounter'|'scrap'), x, y, expiresAt` |

Spatial hash: 256 u cells for static solids (built at boot) and a per-step dynamic hash for cars
and pedestrians. `SR.world.collide.move(body, dx, dy)` → `{ x, y, hit, offGround, surface }`.
`SR.world.nav.path(from, to)` → points (A* with octile heuristic; ≤ 2 ms; cached for 1 s).
The renderer finds the entities by convention, without a registration call (§8.6).

### 8.3 World ↔ rules boundary

The world never changes rule state directly. It raises requests that go through rules, all
defined in **`js/data/actions/world.js`** (W1-W): `world.fall` (`{ x, y }`), `world.carHit`,
`world.carCrash`, `world.carFished` (`{ car }`: the car went off an edge; the tow is charged at
night) and `world.enter` (`{ building }`, silent and free: raises the `enter` event). The junker
is a street dialog (W2-Street), not a world action. A door →
`SR.world.doors.resolve` (§8.4) → `SR.scenes.go('building', ...)`; a street person →
`SR.scenes.push('dialog', { person })`. Position fields in `state.player` are written by the world
once per second and on scene changes (they are saved).

### 8.4 Doors

- **Resolver** (`js/world/doors.js`, W1-W): `SR.world.doors.resolve(doorId, s)` →
  `{ scene: 'building', id, params }`. For a non-home door, `id = doorId`, `params = {}`. The four
  home doors (`home_apt` holds the tiers `apt` and `apt2`; `home_pent`, `home_mansion`,
  `home_castle` one tier each; `SR.rules.homes.doorHomes(doorId)`) resolve to `id: 'home'` with
  `params = { homeId, mode }`:
  - `mode: 'live'` when `s.homes.living` is one of the door's tiers (`homeId = living`);
  - else `mode: 'owned'` when you own one of its tiers (`homeId` = the best owned tier);
  - else `mode: 'forSale'` (`homeId` = the cheapest tier at that door).
  So Paperview is one door that shows the tier you live in (or own). `data/buildings/home.js`
  (W2-Home) implements all three modes: `live` is the full home card; `owned` shows that home's
  interior with Move in, Let out / End let (P1), Sell (opens `bank.realestate`) and Leave; `forSale`
  shows the For Sale card (price, slots, sleep bonus, perk) with **Tour** (`screen:
  'bank.realestate'`, `screenParams: { homeId }`, from which you can buy) and Leave.
- **Trigger:** a 96 × 48 u box (long side along the face) centred 24 u outside the door. Walking
  enters after 0.2 s of **dwell counted only while the move input points within 45° of the door's
  inward normal** (or while a click-to-walk route ends inside the trigger), so walking along a
  sidewalk past a door never enters it. Interact (E / A) enters within 96 u.
- **Re-arm:** after exiting (placed 56 u outside the door, facing away) or cancelling, the trigger
  is disarmed until the player is more than 64 u from its centre.
- **Prompt:** the ContextPrompt "[E] Enter McSticks" shows within 96 u (the Interact range, B-15
  `door.prompt`); from 96 to 160 u only a plain name tag shows (D52; UI §2.3 follows).
  `SR.world.doors.prompt` and `.tags` carry them to the city scene (§8.6).

### 8.5 Vehicles

- Surfaces: asphalt at full speed; paths and plazas at 60 %; **sidewalks and lawns capped at 200
  u/s** (a car may cross or drive on them slowly).
- **Parking at a door:** while driving, the prompt "[E] Park and enter" shows within 64 u of a
  door's `kerb` point; Interact parks the car there (aligned with the kerb) and enters on foot.
  Driving into a door trigger does the same. C / Y enters or leaves your car within 64 u of it.
- **Pedestrians and named NPCs** are never hurt by your car: they hop 24 u aside with a bark
  ("Hey!"); no HP, karma or Heat change. Traffic cars: a crash is `world.carCrash` (-5 HP, both
  bounce).
- **Off an edge:** the car sails off, you are rescued on foot, `world.carFished` records it; the
  night charges the tow ($100, forced charge) and puts the car on its **home lot**
  (`worldmap.homeLots`: the junker on the apartment lawn, the sports car on the mansion drive).
- **Ownership:** `state.player.cars.<car> = { owned, bought, x, y, a, towed }`; `bought` is true
  only for a catalogue purchase (net worth counts a bought sports car, B-18); the day-365 gift and
  the hotwired junker have `bought: false`.

### 8.6 Additive world names (wave-1 integration)

- **`SR.world`** (W1-W): `ready`, `time`, `cfg` (the B-15 numbers; `cfg.missing` lists any that do
  not resolve), `entities(kind)` (`'car'`, `'ped'`, `'person'`, `'police'`: the live array of
  `traffic`, `pedestrians`, `streetnpcs`, `police`), `build()`, `start(s)` (the player from
  `state.player`, in the car named by `driving`), `place(spec, s)` and `spawnPoint(spec, s)`
  (`'newGame'`, `'afterJail'`, `'afterHospital'`, a door id, `'homeDoor'`, `[x, y]`), `homeDoor(s)`,
  `teleport(x, y)` (doors disarmed around the spot, camera snapped), `sync(s)` (positions →
  `state.player`, once a second and on scene changes), `onAction(action)` (`interact`, `car`,
  `zoomIn`, `zoomOut`, `zoomCycle`; any action skips a fall after 0.5 s), `readInput()`,
  `safeEdges(s)` (on while `access.safeEdges` is set or the Guard Rails decree is active),
  `assist()`; `update(dt, input?)` takes an optional `{ x, y, skate }` input (tests, headless walkers).
- **`SR.world.geometry`**: `bounds`, `polygon`, `edges` (`{ a, b, railed, out }`), `solids`,
  `buildings[id]` (`projected`, `tops`, `signature`, `door`), `doors`, `doorById`, `porches`,
  `lanes`, `graph` (`{ nodes, edges: [a, b, zebraId], adj }`), `onGround`, `walkable(x, y, r)`,
  `surfaceAt` (`asphalt`, `sidewalk`, `path`, `plaza`, `lawn`, `hole`, `sky`), `zebraAt`,
  `nearestEdge`, `nearEdge(x, y, m, railed)`, `solidAt`, `solidsNear`, `solidDist`, `project`,
  `projected(id)`, `projectedRects()`, `util`.
- **`SR.world.collide`**: `dynamic` (the per-step dynamic hash, rebuilt at the start of every
  `SR.world.update` from `entities()`: `near(x, y, r, kinds?, out?)`, `add(e, kind)`, `rebuild()`,
  `clear()`, `count`); `move(body, dx, dy)` also takes `body.len` and `body.a` (a car's 96 × 52
  capsule along its heading).
- **`SR.world.nav`**: `reachable(x, y)`, `nearest(x, y, minInside)`, `lineClear`, `gridClear`,
  `segmentInside`, `cellAt`, `center`, `connected`, `walk`, `stats`.
- **`SR.world.player`**: `walkTo(x, y)` (click-to-walk; a click on a building routes to its door),
  `toggleCar()`, `board(car)`, `park(x, y, a)`, `carNear()`, `knock(sec)` (the car-hit knockdown),
  `hopAside(entity)`, `cancelRoute()`, `topSpeed()`, `hasBoard()`, `doorAt(x, y)` (the door a click
  means: a porch or trigger, else the frontmost building hit); fields `car`, `a`, `v`, `route`,
  `surface`, `lastSafe`, and `px`, `py` (the position at the start of the last step, which the
  renderer interpolates by alpha).
- **`SR.world.doors`**: `prompt` (`{ kind: 'enter'|'park', door, name, verb }`; the same object while
  it names the same door, so a new object means a new prompt to announce), `tags` (a reused array),
  `last`, `enter(id, via)`, `exit(id?)`, `interact()`, `parkAndEnter(id)`, `kerbHeading(door, a)`,
  `tagFor(id)`, `doorHomes(id)`, `disarmNear(x, y)`, `go(resolution)` (the scene change:
  `SR.scenes.go('building', { id, params }, { transition: 'doorZoom' })`).
- **`SR.world.fall`**: `phase` (`none`, `teeter`, `drop`, `catch`, `land`), `t`, `x`, `y`, `to`,
  `car`, `saved` (the last teeter save: "Phew"), `last`, `active()`, `skip()`, `focus()`.
- **`SR.world.camera`**: `x`, `y`, `px`, `py` (the centre at the start of the last step), `zoom`,
  `level`, `target`, `snap`, `setLevel`, `zoomIn`, `zoomOut`, `cycle`, `view()`,
  `toScreen(x, y, z)`, `toWorld(sx, sy)`, `bounds()`.
- **The entity lists the renderer draws** (a convention, no registration call): the Y-sorted pass
  draws `SR.world.traffic.cars`, `SR.world.pedestrians.list`, `SR.world.streetnpcs.list`,
  `SR.world.police.list`, `SR.world.markers.list` and `SR.world.player`. Fields read: car `{ x, y,
  a (radians, 0 east), kind (compact | sedan | taxi | van | police), braking }`; walker / person
  `{ x, y, facing (degrees clockwise from north, or 'up' | 'down' | 'left' | 'right'), state ('walk'
  | 'pause' | 'wave' | 'flee' | 'hop'), look (a look id, or the pedestrian's number), clip?, pose?,
  visible, active?, bark, hopT }`; marker `{ x, y }`; optional `px, py` (the previous step's
  position) are interpolated with the frame's alpha. `js/render/actors.js` also accepts `list`,
  `pool`, `peds`, `people`, `npcs`, `officers` and `markers`, and
  `SR.render.actors.source(name, fn, kind)` for anything else.
- **People hop aside:** the player's car moves any walker within reach of its body 24 u aside
  (`state: 'hop'`, `hopT: 0.6`, `bark: 'toast.world.hey'`) and never hurts them. **Driving into a
  door:** like walking, the car enters (parks and enters on foot) only while it moves within 45° of
  the way in.
- **Worldmap fields beyond the ARCHITECTURE §8.1 example:** `pockets`, `jogLoop`, `links` (lawn walkways joining
  the jog loop and Margin Path to the sidewalk graph), `features` (fountain, plinth, pond, skate
  bowl, duck spot, chess tables, Harold's bench, busker spot, the Bite, the Dog-Ear), `spots`
  (people's places, for `data/people.js` placeIds), `skyRibbon`; per building `name`, `orig`,
  `homes` (a home door's tiers), `exterior.roof`, `exterior.floors`, `exterior.tops` (tall roof
  features: turrets, the dome, the roof sign, the dice) and `exterior.signature` (rects in
  projected space, x, y - 0.5 z); `exterior.palette` names a palette group (`bld.<id>`),
  `exterior.detail` an `SR.def.exterior` id, `exterior.sign` a text key `place.sign.<id>`.

For the city scene (W2-City): on `enter`, `SR.world.start(SR.state)` for a new or loaded game, or
`SR.world.doors.exit()` when coming back from a building; `SR.world.update(SR.STEP)` each step;
presses go to `SR.world.onAction(action)`; click / tap to walk is `SR.world.player.walkTo(p.x,
p.y)` with `p = SR.world.camera.toWorld(q.x, q.y)` and `q = SR.stage.toLogical(cx, cy)`; the
ContextPrompt and door tags come from `SR.world.doors.prompt` and `.tags`; "Phew" is
`SR.world.fall.saved`; the Fold Rescue plays from `SR.world.fall.phase / t / x / y / to`; traffic
calls `SR.world.player.knock()` and `SR.act('world.carHit')` on a hit and `SR.act('world.carCrash')`
on a crash. After jail `SR.world.place('afterJail')`; after the hospital
`SR.world.place('afterHospital')`. The touch stick is `SR.input.axis('move')` (and
`SR.input.stick` to draw it); a touch that starts on the right half of the world is free for
tap-to-walk.

## 9. Render pipeline

### 9.1 City frame order

1. **Sky** (`render/sky.js`): gradient cached in an offscreen canvas and repainted every 5 game
   minutes or on a weather change; sun / moon / stars; the distant islands and the Sky Ribbon
   (parallax 0.15, `art/skyline.js`); 3 cut-paper cloud layers (parallax 0.3 / 0.5 / 0.7) with the
   sheet's underside shadow.
2. **Island underside** (`render/ground.js`): the paper-thickness band along south, east and west
   facing edges, from the torn outline (baked into the chunks).
3. **Ground chunks** (`render/ground.js`): grass, asphalt, sidewalks, plazas, lane paint, zebras,
   the Dog-Ear flap print, decals, baked into **512 × 512 device-pixel chunks** at the current zoom
   only (a zoom change re-bakes progressively, showing the previous zoom's chunks scaled until
   then); LRU of 40 chunks (40 MB; 20 on the touch-compact profile); at most 2 bakes per frame
   within 3 ms, prioritised by camera distance plus velocity look-ahead.
4. **Shadows (P1)** (`render/shadows.js`): building shadows as roof polygons projected along the
   sun vector (length h × 0.5 / tan(altitude), capped at 3h), baked per chunk, re-baked each game
   hour on High (2 h on Medium, never on Low), cross-faded over 0.5 s; skipped at night.
5. **Y-sorted pass** (`render/buildings.js`, `render/actors.js`): building albedo sprites (§9.3),
   prop sprites (cached per type, variant and zoom), cars, pedestrians, people and the player
   (vector each frame), world text. Sort key = ground contact y (a building's is its southmost
   mass's y1); insertion sort (nearly sorted). Occlusion fade (GDD §3.7) applies alpha when drawing
   the building sprite.
6. **Grade**: fill the view with the hour's ambient colour using `multiply`; skipped when white.
7. **Emissive** (`lighter`): per building, its lit windows as a rect list (window rects from the
   painter, filtered by the seeded lit schedule, drawn as batched `fillRect`s in `glassLit`) and
   its neon as small cached sprites (≤ 256 × 128 device px each), all × the light factor; lamp
   pools (cached radial sprites r 90 u), headlights (cached cone), fountain lights. There is no
   full-size emissive canvas per building.
8. **Weather** (`render/weatherfx.js`): rain streaks as one batched path, puddle ripples, fog
   gradient, lightning flash (Flash Reduction aware).
9. **Post**: edge-danger vignette, Buzz sway (a small sinusoidal transform), hit flash.
10. **World UI** (`render/worldui.js`): door tags, "!" markers, name tags, float texts ("+2 INT"),
    the click-to-walk dotted line.
11. **Particles** (`render/particles.js`): pooled (max 400 × preset factor): dust, coins, sparks,
    confetti, rain splashes, paper scraps, cloud wisps.
12. **Minimap** (`render/minimap.js`): its own 184 × 184 canvas in the HUD, redrawn at 10 Hz from a
    pre-rendered map image plus dots.

**Invalidation:** `SR.render.invalidate(what)` with `what` = `'building:<id>'` (billboard,
flags, statue, For Sale sign), `'chunks'`, `'sky'`, `'all'`.

### 9.2 Interiors

The `building` scene (`js/scenes/building.js`) draws `SR.art.interior(id, params)`: `drawStatic(ctx, state)` into a cached
1280 × 720 layer (redrawn on resize or a state change such as new furniture) and
`drawAnim(ctx, t, state, actors)` every frame. `params` are the door resolver's (`{ homeId, mode }`,
so the home interior draws the tier and mode); `actors` is `{ owner: { id, pose }, you: { pose } }`
with poses `idle | talk | happy | shock | work` (react-happy on a purchase, react-shock on a crime,
work while you work; UI §5.6; D60). An id without a registered interior returns a neutral room in
its `int.<id>` palette. The composition keeps x 0-760 for the scene and
x 776-1248 for the card. Every interior has a window that shows the live sky via
`SR.render.sky.drawWindow(ctx, rect)` (hour gradient, weather streaks).

### 9.3 Building sprites and the exterior painter

`SR.art.exterior.build(def, zoom, dpr)` → `{ albedo, windows: [rects], neon: [{ sprite, x, y }],
bounds }` for one building, from its worldmap entry: masses, door face (awning, south step or
north porch and canopy), archetype (`box`, `tower`, `hall`, `shop`, `castle`, `house`, `depot`),
palette key, window grid (seeded lit pattern), roof type (`flat`, `pitched`, `dome`, `crenel`),
sign, props, and the per-building detail registered with `SR.def.exterior(id, { detail(ctx,
geom, state), signature })` (≤ 150 lines each) for the signature bits.

**Sprite cache (memory-bounded).** Building albedo sprites are baked **only at the current zoom**,
lazily, for buildings whose projected bounds intersect the view expanded by half a view on every
side, at most one bake per frame (≤ 30 ms, spread over frames by baking mass by mass). They live
in an LRU keyed by building and zoom with a **device-pixel budget of 12 Mpx** (48 MB; 6 Mpx on the
touch-compact profile); the farthest sprites are evicted first. Sprite DPR is capped at 1.5
(sprites are drawn scaled on DPR 2 screens). A sprite not yet baked is drawn as flat mass boxes in
its palette for the frames until it is ready. Reacting elements (billboard, flags, For Sale sign)
re-bake only their building (`SR.render.invalidate('building:<id>')`).

### 9.4 Render core decisions (wave-1, D58)

- **The grade covers the sheet, not the sky.** The multiply fill covers the torn outline, its band,
  every building's bounds and every actor's box (one Path2D), because the ART_AUDIO §2.2 sky colours
  are final; clouds and the distant islands are tinted by the ambient inside their caches.
- **Traffic cars on the 8 directions are cached sprites** per type, direction, lamp state and zoom
  (one `drawImage` each); a car between directions (turning) and the player's car stay vectors (a
  vector car costs about 22 path fills, so 14 of them alone would pass the 250-fill budget). The
  "props, actors and neon ≤ 8 MB" line of §17 is split: car sprites an LRU of 1.25 Mpx (boxes fitted
  to each direction), prop sprites an LRU of 0.5 Mpx, neon ≤ 0.2 Mpx, light sprites 0.03 Mpx; a
  sprite that would only fit by evicting one drawn this frame is drawn as vectors instead.
- **Sky tints in place.** Each cloud variant and island keeps one canvas repainted when the
  5-minute tint moves on, so a clock tween or the time-lapse never piles tints up.
- **Hidden lights.** A light source (car cone and tail lights, lamp pool, door spill, fountain)
  whose ground point lies under a building drawn after it is dimmed by that building's opacity.
  Tail lights come from `SR.art.vehicles.lamps` and are skipped for a car heading south.
- **Grain on sprites** is laid `source-atop` as ink with alpha (1 − paper luminance) × 6 %, which
  darkens like the multiply but never touches a transparent pixel. Lit windows under signs, name
  plates, blade signs and awnings, and the castle's north-tower slits behind the keep, are dropped.
- **Bake zooms.** A zoom easing between levels draws from the nearest level's caches; a zoom below
  the smallest level (overviews, the title's wide shots) bakes at its own zoom rounded to 0.05.
- **The sky pass is skipped** when every 64 u cell of the view is interior sheet;
  `SR.render.frame` clears the canvas first so the browser can drop the previous frame's recording.
- **People on an east / west door mat sort in front of that building** (its awning hangs over the
  mat); the occlusion fade stays for masses and tall roof features. Building footprints are baked
  as a dark slab, which is what a faded building shows underneath.
- **Numbers.** The B-15 values are read from `SR.tuning.world` (`camera.zooms`, `occlusionAlpha`,
  `door.prompt` / `door.tag`, `edgeWarn`, `projection.k`) with named fallbacks; the presentation
  numbers of ART_AUDIO §2-§3 and §17 (lamps 19:45-06:45, neon 19:00-07:00, lamp pools r 90 u,
  headlights 160 u / 35°, flicker 2 % / 120 ms, the lit-window schedule, chunk and sprite budgets)
  are named constants in their render files (D49).

### 9.5 Additive render and art names (wave-1 integration)

- **`SR.render`** (W1-G): `view` (overrides `{ x, y, zoom, min, day, weather, tween }`; a `null`
  field follows `SR.world.camera` and `SR.state`) and `setView(patch)` (the title's camera drift,
  the debug hour scrubber, sheets, tests); `toScreen(x, y, z)` / `toWorld(sx, sy)` (logical stage
  units, the last frame's view); `warm(ctx?)` (bakes every chunk and sprite the view needs at once:
  tests, sheets, the title's first frame); `time()` (the displayed minute, tweened 1.5 s after a
  clock jump); `lastView()`; `debug.{projected(on), hours(on)}` (also driven by
  `SR.debug.flags.projected` / `.time`).
- **`SR.render.fx`**: besides `transition`, `confetti`, `jolt`, `render`: `shake(amp, ms)`,
  `flash(ms, alpha)`, `offset()`, `flashAlpha()`, `busy()`, `state()` (`{ transition, confetti,
  jolt }`).
- **`SR.render.particles`**: `emit(kind, x, y, n, opts)`, `burst(kind, x, y, opts)`, `update(dt)`,
  `draw(ctx, view)`, `clear()`, `stats()`; kinds `dust`, `coin`, `spark`, `confetti`, `splash`,
  `scrap`, `wisp` (world units; the pool is 400 × `quality.params.particles`).
- **`SR.render.worldui`**: `tag(x, y, text, { key, z })`, `prompt(x, y, text, opts)`, `marker(x, y)`,
  `float(x, y, text, colour)`, `route(points | null)`, `doorTags` (tags, prompts and markers are per
  frame; `colour` is a palette key or a stat name: `str`, `int`, `cha`, `hp`, `money`, `time`,
  `heat`, `karma`).
- **`SR.render.actors`**: `source(name, fn, kind)`, `player()`, `playerPos()`, `cars()`,
  `carType(e)`, `carBox(type, dir)`, `stats()` (`{ count, px, budgetPx }` of the car sprite LRU).
- **`SR.render.lighting.at(min, weather)`** → `{ top, horizon, ambient, light, white }` and
  `SR.render.sky.colors` (the same); `SR.render.buildings.{sprite(id), litWindows(id, min, day),
  litFraction(id, min), neon(id)}`; `SR.render.ground.{model(), skyVisible(view), edgeInfo(x, y)}`.
- **`SR.art.exterior`** (W1-G, `js/art/exteriors.js`): besides `build(def, zoom, dpr)`:
  `baker(def, zoom, dpr)`, `geom(def)`, `colours(geom)`, `placeholder(ctx, def)`, `reset()`,
  `archetypes`, `PROJ` (a read-only getter of the projection factor in use). `build()`'s result also
  carries `id`, `zoom`, `dpr`, `scale` (px per u), `px`, `neonPx`, and each neon entry `{ sprite, x,
  y, w, h, px }`; `bounds` is `[x0, y0, x1, y1]` in projected world units (x, y - 0.5 z), like every
  rect.
- **Hooks W2-Exterior provides** (`js/art/props.js`, `js/art/skyline.js`; the render core owns the
  caches, the draw order and the budgets): `SR.art.props.draw(ctx, type, variant, a)` (a prop with
  its ground contact point at the origin, in world units; cached as a sprite per type, variant,
  angle and zoom), `SR.art.props.size(type, variant, a)` → `{ w, h, ax, ay }` (u; the anchor is the
  contact point inside the box), and `SR.art.skyline.draw(ctx, view, worldmap)` (the six distant
  islands and the Sky Ribbon, in stage units during the sky pass; `view` carries `x, y, zoom, W, H,
  t, min, light, sky.ambient`). Railings and the castle wall are baked into the ground chunks from
  worldmap geometry; optional `SR.art.props.railing(ctx, a, b)` / `wall(ctx, a, b, w)` are called
  by the ground bake when they exist. Until then `js/render/buildings.js` and `js/render/sky.js`
  draw placeholders.
- **`SR.art.draw`** (W1-A): besides `inkStroke`, `paperFill`, `tone`, `roundRect`, `poly`, `text`,
  `shadow`: `color(keyOrColour)` (the D32 resolver every drawing module uses), `parse`, `hex`,
  `mix(a, b, t)`, `alpha(c, a)`, `luma`, `lineWidth(ctx, u, minPx)`, `font(size, weight, role)`,
  `FONTS`, `stamp(ctx, str, x, y, opts)` (ART_AUDIO §11), `floatText(ctx, str, x, y, colourKey, t)`
  (ART_AUDIO §12); `tone(base, -1|0|1)` returns `#RRGGBB[AA]`.
- **`SR.art.paper`**: `grain(kind)` → the 256 × 256 canvas (`'multiply'` | `'speck'`),
  `grainURL(alpha)`, `pattern(ctx, kind)`, `apply(ctx, x, y, w, h, alpha)` (the 6 % / 4 % multiply),
  `tornRect(ctx, x, y, w, h, opts)`, `SIZE`. A priority-40 boot hook sets `--grain` on `<html>`
  unless the stylesheet set one.
- **`SR.art.stick`**: `draw(ctx, pose, opts)` with `opts = { x, y, view: 'city'|'side', facing:
  'down'|'up'|'left'|'right', scale, look, player, karma, head, torso, limb, mood, t, rot, mount:
  'board', upper, anchor: 'feet'|'hip', shadow, alpha, splay }`; `pose` is a pose array, a pose name
  or a clip name evaluated at `opts.t` (a name that is both a pose and a clip plays the clip when
  `opts.t` is given); `player: true` without a `look` draws `SR.state.player.look`. Also
  `clip(name, t, out)` (a pooled result unless `out`), `poses`, `clips` (`{ dur, loop, keys }`),
  `duration(name)`, `looks`, `look(id)`, `pedLook(n)`, `karmaColor(k)`, `metrics(view, child)`,
  `joints(pose, opts)`, `ACCESSORIES`, `accessory(name)`. Clips: `idle walk skate drive sit talk eat
  drink work work_desk work_mop work_cook work_serve study lift cheer happy shock wave cower knocked
  fall teeter sleep guard punch kick fireball inkbeam hurt win lose`; moods `neutral happy sad angry
  surprised hurt sleep smug worried blink`.
- **`SR.art.portraits`**: `draw(ctx, personId, size, mood, opts)` with `opts = { blink, bg, karma,
  frame }`, `toCanvas(personId, size, mood, opts)`, `SIZES`.
- **`SR.art.vehicles`**: `draw(ctx, type, dir, x, y, opts)` with `opts = { angle, t, brake, lights,
  flashReduction, driver, shadow, alpha, scale, z, bank, pilot, carry }`; types `compact sedan taxi
  van police junker sports skybus plane` (`player` → junker, `cab` → taxi); `lamps(type, dir,
  angle)` → `{ head, tail }` screen offsets for the emissive pass; `skid(ctx, type, angle, x, y, len,
  alpha)` (a ground decal W2-City keeps and fades); `size(type)`, `dirFromAngle(a)`, `lightPhase(t)`
  (0 | 1: which half of the police bar is lit; they swap every 0.5 s, at most 2 flashes a second),
  `TYPES`. `driver: { look, karma, player }` or `true` shows the driver's head and shoulders (the
  open sports car the whole upper body); a driver with a `look` is an NPC unless `player: true`.
- **Icons and logo**: `SR.art.icon(ctx, name, x, y, size, state)` (top-left at x, y; `state:
  'disabled'`), `SR.art.iconURL(name, size, state)`, `SR.art.icon.CATEGORIES`, `.names()`, `.TABLE`;
  `SR.art.logo.draw(ctx, t, { x, y, width, title, tag, color })` → box, `.duration` (1.2 s),
  `.measure(title, width)`; `SR.art.bible.draw(ctx, { t })`, `SR.art.bible.sampleInterior()`.
- **Interiors**: `SR.art.interior(id, params)` → `{ drawStatic(ctx, state), drawAnim(ctx, t, state,
  actors) }`; the building scene passes the door resolver's params (`{ homeId, mode }`), which reach
  props' `when(state, params)` / `pick(state, params)` and custom fns (`kit.params`); `actors` is
  `{ owner: { id | look, pose | clip, mood, t }, you: { pose | clip, ... } }` with the poses `idle
  talk happy shock work` (and `react-happy`, `react-shock`; happy and shock set the face). An id
  without a registered def returns a neutral room in its `int.<id>` palette, so the scene may call
  the factory for any building. Also `SR.art.interior.fromDef(id, def)`, `.types()`, `.kit`.
  Interior def fields beyond ART_AUDIO §9: wall types `plain tiles panels brick stripes stone
  wallpaper` (+ `alt`, `wainscot`, `wainscotH`), floor types `checker tiles planks carpet concrete`
  (+ `tile`, `rows`; `perspective` 0 flat .. 1 true one-point), `floorY`, `vp`, `palette` (the
  `int.<id>` set), `fns` (named custom fns: a function or `{ static(ctx, kit, state), anim(ctx, kit,
  t, state) }`); prop fields `sortY`, `when`, `pick`, `flip`, `text` (a text key), `items`, `person`,
  `alt`. `drawAnim` repaints the live sky in every window and redraws what the static layer put in
  front of a window; a custom `static` fn that paints over a window repeats that part in its `anim`.
- **Person ids** that `SR.art.stick.look` and `SR.art.portraits.draw` know (for `data/people.js`,
  building `owner` / `portrait` and interiors' `owner.id`): `harold kid dealer newguy mcholland
  sticky mel dee vinnie sofia penny bea gil frankie terry lou tabby quill plume crease preacher ori
  doodle crayon officer board stranger player`; fighters by their `data/fighters.js` id or
  `fighter.<n>`; pedestrians by number; or a look object `{ head: 'npc.<name>', acc: ['beanie', ...],
  col: { beanie: 'acc.red' }, child }`. Aliases resolve the long forms (`skid`, `red`, `margin`,
  `lucky_lou`, ...); an unknown id draws the plain look and warns once.

## 10. Minigame framework

```js
SR.minigame.register('darts', {
  music: 'last_call_shuffle', title: 'mg.darts.title',
  keys: { throw: ['Space'], aimUp: ['ArrowUp'] /* ... */ },   // the context input map (§11), pushed on create
  create(host, params) { return { update(dt) {}, render(ctx) {}, onAction(a, ev) {}, destroy() {} }; },
  auto(state, params, rng) { return { score: 164 }; },   // a SAMPLED outcome (table below); omitted = no Auto
});
SR.minigame.run(id, params) → Promise<Result>   // pushes the 'minigame' scene
// host = { state (read-only view), rng: SR.rng.rules, fx: SR.rng.fx, ui (DOM root), audio,
//          assist: bool, device: 'kb'|'pad'|'touch'|'mouse', finish(result), text,
//          aria(text) /* announce to #aria */, label(id, text) /* a visible-to-AT DOM mirror */ }
```

- **Frame:** the `minigame` scene draws the shared frame (UI §5.8): top bar (title, stake, cash,
  Exit), the play area (`touch-action: none`), a bottom control bar with key hints, and Auto /
  Assist toggles. The frame pushes the engine's `keys` as an input context (§11) and pops it on
  exit.
- **Determinism:** anything that decides money or rule outcomes (cards, reels, the wheel, enemy
  rolls, check beats, Auto samples, darts phases) uses `host.rng` (the rules stream) through
  `SR.rules.*`. Skill games use input for the rest.
- **Auto is a sample, never the expected value.** Each engine's `auto` plays the game with a fixed
  policy and real draws from `host.rng`:

| Engine / skin | Auto policy | Notes |
|---|---|---|
| Fight | turn by turn: spend AP on the move with the highest expected damage per AP (ties: the cheaper move), never Guard, never Run; real rolls (`SR.rules.fight.autoPlay`) | shown as a fast-forwarded log (2 s) |
| Darts (practice, match) | 10 throws aimed at the centre, each released at a uniformly random time of the wobble (`SR.rules.casino.darts.autoThrows`) | |
| Timing Ring `hotwire` | each of up to 5 presses hits with p = sweet arc / 360° | misses cost HP as usual |
| Timing Ring `pitch`, Shift Rush (hustles) | m = 1.0 exactly (the Auto shift of GDD §4.6; not a sample) | the baseline pay, never above it |
| Duel (every skin) | each beat picks the option with the best shown odds (stance mode: using the hinted stance) and rolls it | |
| Blackjack | "By the book": plays the current hand with basic strategy (`bj.basic`) | the bet is still yours |
| Slots | Auto-spin 10 pulls at the current bet | |
| Scratch | scratches all panels | |
| Roulette | none | |

- **Result shapes:** fight `{ outcome: 'win'|'lose'|'run', hpLeft }`; darts `{ score, throws: [pts] }`;
  slots / blackjack / roulette `{ net }` (the rules already applied each round); shiftrush /
  timingring `{ m, hits, misses }` (hotwire `{ started, misses }`); duel `{ beats: [bool], wins,
  losses, sum? }` (boardroom adds `sum`, the m change).
- **Skins** (`SR.def.skin(id, { engine, params, art, text })`) configure an engine: Shift Rush
  `orderup`, `sortit`; Timing Ring `pitch`, `hotwire`; Duel `holdup`, `boardroom`, `debate`,
  `interview`, `interrogation`, `tourhook` (their numbers: BALANCE B-30).
- **Accessible state:** every engine mirrors its state into DOM labels in the frame and announces
  changes through `host.aria` ("Dealer shows 10. You have 17.", "Red 32 wins, you lose $50",
  "Your HP 34, his HP 20, 3 AP left", "Line: BAR BAR BAR, pays $200"). Roulette colours also carry
  patterns.
- Pause (Esc / Start) freezes every timer. A minigame never changes the action's time cost.
- **Hardcore:** before a stake-bearing minigame opens (fights, robberies, casino rounds, darts
  matches, trips' haggle) `state.pending = { resolve, worst }` is saved to the ironman slot; a reload
  with `pending` set applies `worst` (the loss) immediately (§15).
- **Params (D18, D29):** `SR.minigame.run(id, params)` takes an engine id or a skin id and carries
  the skin as `params.skin`; the `open` effect's name is a skin id or an unskinned engine's id,
  copied into `Result.open.minigame` and `.skin`. The scratch engine returns `{ net }` like the
  other casino games.

### 10.1 Additive minigame names (wave-1 integration)

- **`SR.minigame`** (W1-M), besides `register` and `run` (`js/minigames/framework.js`, except
  `current` in `js/scenes/minigame.js`): `lookup(id, params)` → `{ id /* engine */, def, skinId, skin,
  params /* skin params + run params */ } | null`; `auto(id, params, rng?, state?)` → a sampled
  result, or `null` for a game without Auto (defaults `SR.rng.rules`, `SR.state`; the simulator and
  tests use it); `force(result)` → queued count (the next `run` resolves with it at once, without the
  frame; `SR.debug.mg`); `chance(stat, D, { s, checkId })` and `roll(rng, p)` (→ `SR.rules.check`),
  `tune(path, default)` (a dotted read of `SR.tuning`); `autoPolicy(lookup)`, `worst(lookup)`,
  `forfeit(lookup, progress)`, `isStake(lookup)`, `glyph(code)`, `bindings(action, context, keys)`,
  `engines()`; `current()` → the open round (`{ id, skin, params, t, panel, finished, replaying,
  result, assist, device, context, contextPushed, announced, inst, host }`) or `null`.
- **Engine def (optional fields):** `worst(params)` (Hardcore's `pending.worst`), `forfeit(params,
  progress)` (leaving early; default `worst`), `summary(result, text, skin, params)` → the banner
  line, `assist: false` (hides Assist), `confirmExit: true`, `stake: true`, `replay` (seconds),
  `context` (the input context's name; default the engine id; Shift Rush sets `orderup`, the name
  CONTRACT §12.3 gives its keys).
- **Instance:** `pointer(kind, x, y, ev)` (`'down'|'move'|'up'` in play-area units, 1280 × 576),
  `auto(rng)` (Auto from the current position), `replay(result)`, `progress()`,
  `assistChanged(on)`, `peek()` (tests). `render(ctx)` receives a context in play-area units,
  clipped to the play area.
- **Host:** besides the host fields above: `params`, `skin`, `skinId`, `area { w, h }`, `t`, `paused` (the pause
  panel is up or another overlay covers the frame), `interactive()`, `haptic(ms)`, `hints([{ action
  | actions | range, label, only: 'kb'|'pad'|'touch' }])` (the bottom bar), `color(token)` (a
  `css/tokens.css` property such as `'ink-900'`, else `SR.art.palette.ui`), `font(px, weight,
  display)`, `chance(stat, D, checkId)`, `roll(p)`, `el`, `button`, `chip`, `ring`.
  `label('info', text)` and `label('status', text)` are the visible top- and bottom-bar slots; other
  ids go to the visually hidden mirror. `audio` is `{ sfx, stinger }`, silent for sounds that are
  not registered.
- **Skin (optional fields):** `context`, `stake`, `music`, `params` may be `fn(state, runParams)`,
  `auto: false` (no Auto) or a policy fn. Every skin of an engine shares one input context, so
  Settings › Controls remaps `orderup`, `timingring` and `duel`.
- **Results:** Duel adds `picks: [optionId]` (the Ruthless karma of B-30 is the rules' to apply),
  `stances` in stance mode and `m` in cards mode; the hotwire result adds `hits`; Auto results carry
  `auto: true`; a result from leaving early carries `exited: true`.
- **Run params the frame reads:** `stake` (a number is shown as "Stake $n"), `auto: true` (open
  straight into the Auto replay; the card passes it for `game.alwaysAuto`), `resolve` (the resolve
  action id for the Hardcore hook; without it the frame uses the last `Result.open` seen on
  `action:done`), `step` (the Timing Ring's difficulty step, B-05 `hustle.pitch`).
- **The play area is its own canvas** `<canvas data-id="mg-canvas">` inside the frame (in `#ui`),
  sized to the play area's device pixels; the scene's `render(ctx, alpha)` draws there and ignores
  the stage context (it `blocksRender`, so the city is not redrawn under it). The touch-compact
  layout anchors `#ui` to the window while `#world` stays letterboxed, so only an own canvas keeps
  pointer mapping exact in every layout; a visual golden of a minigame reads that canvas.

## 11. Input

`SR.input` maps devices to **actions**; scenes and UI listen to actions, never to raw keys.

| Action | Default keys | Gamepad (standard mapping) | Touch |
|---|---|---|---|
| `move` (axis) | WASD, arrows | left stick, D-pad | floating stick, left half |
| `interact` / `confirm` | E, Enter, Space | A (0) | Action button / tap |
| `back` | Esc, Backspace | B (1) | ✕ / ← button |
| `skate` (hold) | Shift | RT (7) | Skate toggle |
| `car` | C | Y (3) | Car button |
| `pocket` | Tab | Select (8) | Pocket button |
| `map`, `bag`, `journal` | M, I, J | — (tabs via LB/RB) | tabs |
| `minimap` | N | — | minimap button |
| `pause` | Esc (in the city) | Start (9) | ☰ button |
| `tabPrev` / `tabNext` | Q / E (only in tabbed screens) | LB (4) / RB (5) | swipe |
| `row1..row9` | 1-9 | — | — |
| `repeat` | R, hold Enter | hold A | long-press |
| `zoomIn` / `zoomOut` | + / - , wheel | RS click (10) cycles | pinch |
| `minimalHud` | H | — | — |

- **Context maps.** `SR.input.pushContext(name, map, { shadow: true })` / `popContext(name)`: a
  context binds its own actions (e.g. `blackjack`: `hit` H, `stand` S, `double` D, `split` P,
  `chip1..5` 1-5; `roulette`: `clearBets` C, `spin` Space, `chip1..4` 1-4; `fight`: `move1..7`
  1-7; `orderup`: `bin1..6` 1-6, `serve` Enter). While a context is on top, a key or button it binds
  fires only the context's action (the global action on that key is shadowed); unbound keys keep
  their global meaning (`pause` and `back` stay on Esc / B unless the context rebinds them).
  Minigames and the fight push their context through the frame; contexts are remappable per
  context in Settings › Controls.
- **Text entry.** While a TextField, NumberField or any `input` / `textarea` has focus, only
  `confirm` (Enter), `back` (Esc) and Tab / Shift+Tab act; every other key types into the field
  (WASD, digits, M, I, J, E, R never fire actions).
- **Repeat.** `repeat` (R) re-runs the last action **of the current card only**, and only if its
  def is `repeatable`; hold-Enter / hold-A repeats every `tuning.time.repeatHoldMs` until the
  action is refused, a modal, dialog, stamp or minigame opens, or the key is released. **A
  stat-gain stamp does not stop it** (D47): during a hold the first run's stat stamp shows and later
  ones are coalesced (float texts and the flying chips still show every gain; the card checks
  `SR.ui.stamp.busy({ ignoreStat: true })`); promotion, degree, jackpot and rank stamps still stop
  it. It can be disabled (`settings.game.holdRepeat`). R does nothing in the city.
- **UI input rule (D57).** DOM UI takes its input from `SR.input` actions: a scene's `onAction`
  offers each action to `SR.ui.focus.handle(action, ev)` first (arrows move focus inside the
  current focus scope or are consumed by the focused control; `confirm` activates the focused
  control), then handles what is left (`back`, `rowN`, `repeat`, `tabPrev` / `tabNext` ...). UI
  scenes ignore `interact` (E, Enter, Space and A also fire `confirm`). While `SR.input` is live,
  `js/ui/focus.js` suppresses the browser's own Enter / Space activation of focused controls, so a
  key activates once; Tab / Shift+Tab move focus in DOM order and wrap inside the scope. A stamp
  consumes (`ev.consumed`) every action of the press that skips it. Tab is `pocket` everywhere,
  but only the city opens the Pocket on it: other scenes ignore `pocket` when `ev.code === 'Tab'`,
  and the Pocket closes on it.
- Keyboard: `keydown` / `keyup` on `window`; bindings remappable and saved in settings.
- Mouse: click-to-walk on the world canvas; DOM buttons handle their own clicks; right-click =
  `back` (optional setting).
- Gamepad: polled every frame via `navigator.getGamepads()`, dead zone 0.2, hot-plug toasts. A
  gamepad press is **not** a user activation: audio unlock and fullscreen need one key press,
  click or tap (the boot screen says "Press any key or click"; a pad-only player sees "Sound
  starts after one click or key press" and plays muted until then).
- Touch: pointer events. `touch-action: none` only on `canvas#world` and minigame play areas;
  scroll containers (card bodies, Pocket lists, sub-screens, settings, save slots) use
  `touch-action: pan-y`; everything else `manipulation`. The left half of the world is the stick
  zone.
- `SR.input.last` = `'kb'|'mouse'|'pad'|'touch'`; `SR.events` emits `input:device` on change; key
  glyphs follow it.
- `SR.input.on(action, fn)`, `off`, `axis('move')` → `{x, y}`, `held(action)`, `bind(action,
  keys, context?)`, `inject(action, down)` (tests), `pushContext`, `popContext`, `typing()` → bool.
- **As built (D17, D33).** Digital `up` / `down` / `left` / `right` actions (menus, focus, roulette)
  compose the `move` axis; `zoomCycle` is the RS click; Q / E tabs come from a `tabs` context, so E
  keeps its global meaning elsewhere; bindings are `KeyboardEvent.code` / `Pad<n>` / `Mouse<n>` /
  `WheelUp|Down` strings (CONTRACT §12.1); scenes get presses only (releases through `on`). Also
  `poll(dt)` (the loop calls it every fixed step; it polls the gamepads), `actions()`, `defaults()`
  → `{ global, contexts }`, `contexts()`, `releaseAll()`, the read-only `stick` (`{ active, ox, oy,
  x, y }`, for drawing the touch stick), `bindings(action, context?)` and `on('*', fn)`.
  `pushContext(name, map?, opts)` returns a function that pops exactly that context; `map` defaults
  to the named context of CONTRACT §12.3, else to the `keys` of the engine registered under that
  name. Popping releases what the context pressed, and a key held across the pop stays inert until
  released. Events carry `consumed` (a listener sets it to keep a press from the scene),
  `preventDefault()` and `defaultPrevented`. Enter and Space always become actions; bound keys lose
  their browser default except Tab; keys with Ctrl, Meta or Alt are left to the browser; the left
  mouse button is never a binding source (DOM clicks, click-to-walk); the device follows
  `pointerdown`'s pointerType. While typing, the pad keeps A (`confirm`) and B (`back`). Remaps are
  stored split: `controls.keys[action]` (every non-pad code), `controls.pad[action]` (`Pad<n>`),
  contexts in `controls.contexts[ctx][action]`; `bind(action, null[, ctx])` restores the default.
  With `game.rightClickBack`, `Mouse2` joins `back`; with `game.skateToggle`, `held('skate')` is a
  latch. Pad directions repeat for menus after 0.4 s, every 0.1 s. Hot-plug emits `input:pad` and
  shows `ui.pad.connected` / `ui.pad.disconnected` toasts.

## 12. Audio

- `js/audio/engine.js`: an `AudioContext` created on the first user activation (a key, click or
  tap; §11). Graph: sources → bus gains (`music`, `sfx`, `ambience`, `ui`, `voice`) →
  `DynamicsCompressor` (threshold -14 dB, ratio 3, hard knee) → makeup trim → master gain →
  destination (D50: the Master slider sits after the compressor, so it never changes how hard the
  compressor works). One shared white-noise buffer (2 s) made at unlock. Suspended while the tab is
  hidden (§3; the engine listens to `visibilitychange` itself).
- `js/audio/synth.js`: voices from oscillators, noise, biquads and ADSR gains; Karplus-Strong pluck
  (noise burst into a delay line); FM keys; pool of 24 voices with oldest-low-priority stealing.
- `js/audio/sfx.js`: `SR.def.sfx(name, recipe)`; recipes are data (ART_AUDIO §13.8).
- `js/audio/music.js`: a tracker: 25 ms timer schedules 120 ms ahead on `currentTime`. Songs are
  data (`SR.def.song(id, {...})`, ART_AUDIO §13.8). Cross-fade 1.2 s; duck 6 dB under dialogs,
  voicemails and stingers. The engine can render any song or sfx into an `OfflineAudioContext`
  (`SR.audio.renderOffline(kind, id, seconds)` → `Promise<AudioBuffer>`, D20) for the objective audio tests
  (§18).
- `js/audio/ambience.js`: city bed, rain, wind (driven by edge distance), casino murmur, bar
  chatter, fryer, birds and crickets by hour.
- **API:** `SR.audio.sfx(name, { x, y, gain, pitch })`, `SR.audio.music(id, { fade, variant })`,
  `SR.audio.stinger(id)`, `SR.audio.ambience(id, level)`, `SR.audio.setVolume(bus, v)`,
  `SR.audio.duck(db, ms)`, `SR.audio.caption(textKey, dir)` (emits `caption` for UI),
  `SR.audio.renderOffline(kind, id, seconds)`.
- Spatial: `StereoPannerNode` by screen-x offset; gain = 1/(1 + d/400) within 900 u.
- The song and sfx formats are ART_AUDIO §13.8 (frozen); D19-D21 and D31 are confirmed as built:
  drum tracks are `kit` tracks, `note[:len][!|?]`, a note ends at its length, `-` or the next note,
  a bare `!` / `?` re-triggers the previous hit; one source per sfx layer, `sweep` replaces `freq`,
  `indexDecay` is a time constant, `loop: true` returns a handle; stinger ids are
  `stingers.<snake_case>`; `SR.audio.validate(kind, def)` → `string[]` lives in the load-time clean
  `js/audio/music.js`.

### 12.1 Additive audio names and the mix (wave-1 integration)

- **`SR.audio.sfx(name, o)`** (W1-S): `o` also takes `pan` (-1..1 for a non-spatial sound) and `at`
  (a delay in seconds); `gain` is a multiplier and `pitch` a frequency ratio (1 = as written). It
  always returns a handle `{ name, inert, voice, playing(), stop(), set({ gain, pitch, x, y }) }`
  (`set({ pitch })` retunes a loop). An unknown name warns once and returns an **inert handle**
  (`inert: true`, `playing()` false, no-op `stop` / `set`), as does a one-shot played while the audio
  is not running, culled (> 900 u) or dropped by the pool. A **loop** handle is never inert: its
  voice starts, or starts again, on a `set()` once the audio runs, the sound is within 900 u and a
  voice is free; a `set()` beyond 900 u releases the voice; after `stop()` it stays silent. A
  voice-bus recipe ducks the song 4 dB for its length.
- **`SR.audio.duck(db, ms)`** returns a release function; `ms` omitted or `Infinity` holds the duck
  until `duck(0)` (which releases every held duck) or the release function; overlapping ducks take
  the deepest (attack 80 ms, release 400 ms).
- **`SR.audio.music(id, { fade, variant })`**: a falsy id fades out; the same id with another
  variant switches on the next bar line; a request made while the context is not running (locked,
  a hidden tab, a system interruption), a stop included, applies when it runs; a song left for
  another resumes at its position when it returns within 180 s. It returns nothing.
- **`SR.audio.stinger(id)`** → `{ id, stop() }` or `null` (unknown id, locked).
- **`SR.audio.ambience(id, level)`**: beds `city`, `birds`, `crickets`, `rain`, `wind`, `fog`,
  `casino`, `bar`, `fryer`, `office`, `campus`, `park`; level 0..1 (default 1); 0 fades out over 1 s
  and stops; calls made while the context is not running apply when it runs; a bed the voice pool
  steals restarts once a voice is free; `.list()`, `.time(min)` (a clock override; the default reads
  `SR.state.clock.min`), `.status()`.
- **`SR.audio.renderOffline(kind, id, seconds, opts)`**: `kind` may also be `'ambience'`; `seconds`
  is optional (a song: one pass of its order plus one bar; a stinger: its order plus 1 s; a
  one-shot: its length plus 20 ms; a loop: 2 s, released so it ends in silence; a bed: 4 s); `opts`:
  `sampleRate` (44100), `variant`, `pos` `{ order, step }`, `seed`, `vary` (sfx; default off),
  `level` and `min` (a bed), `sfx: [{ at, name, gain, pitch, pan }]` (more one-shots: the stress
  script), `chunk` (seconds per offline suspend, default 0.25; `false` schedules everything first).
- **Also:** `SR.audio.unlock()` (creates or resumes the context from a key, click or tap handler),
  `state()` → `'locked' | 'unsupported' | 'suspended' | 'running' | 'closed'`, `stats()` (voices,
  peak, stolen, dropped, duck, bus gains, mono, what plays), `levels()` (RMS dBFS per bus),
  `lengthOf('song' | 'sfx', id)` (seconds), `listener(x, y, zoom)` (a spatial listener override; the
  default is `SR.world.camera`). `SR.audio.synth`, `SR.audio.tracker` and `SR.audio.engine` are
  internal to W1-S's files and tests.
- **Registered sound names other packages play:** UI `click`, `open`, `close`, `confirm`, `error`,
  `toggle`, `blip` (voice bus; `pitch` is a ratio), `purchase`, `ticktock`, `hover`, `typewriter`,
  `stamp`; minigames `mg_hit`, `mg_miss`, `mg_item`, `mg_bin`, `mg_serve`, `mg_tick`. The Stamp plays
  the stinger `stingers.stamp` once W2-Music registers it, else the `stamp` sfx.
- **Songs, as the validator reads them:** `bpm`, `meter`, `stepsPerBeat`, `inst`, `patterns`,
  `order` are required; `swing`, `key`, `scale` (documentation only), `gain`, `loopFrom`,
  `variants`, `motif` are optional; an unknown field is a problem (it catches typos such as `bmp`).
  Song, instrument and variant gains are 0..1, pans -1..1. Swing delays every odd step, and only when
  `stepsPerBeat` is even. Pitches are MIDI 12..108 (C0-C8), lengths 1..256. A chord is one voice
  (its notes share the preset's filter and envelope). A `motif` annotation starts on a note of a
  pitched track; the five onsets are read from there (the top note of a chord), following `order`
  into the next pattern, and must read 0, +4, +7, +9, +7. A song whose id starts `stingers.` has an
  order of one pattern and no `loopFrom`. **Additive: a per-pattern `bpm`** (`patterns.<p>.bpm`,
  20..300; default the song's; each pattern's steps are timed from its own start), for
  `final_edition`'s 84 → 100.
- **SFX, as the validator reads them:** `env` is required on every layer and `dur` on every layer of
  a one-shot; every layer of a `loop` recipe needs a sustain (`env.s > 0`); a noise layer takes no
  `freq`, `at` or `sweep` (use a filter); `duty` is for `osc: 'pulse'` (or a pulse FM carrier);
  `caption` is a `cap.*` key or `null`; `gain` (recipe and layer) 0..1; `vary.pitch` and `vary.gain`
  0..0.5; `priority` 0..3. `fm.index` is the standard modulation index (peak deviation / modulator
  frequency). The `pitch` option and `vary.pitch` scale every frequency of a recipe, its sweeps and
  its filters. Envelopes: attack linear; decay exponential to the sustain (with `s = 0`, to -60 dB
  and then 5 ms to exactly 0); release exponential to -60 dB and then 5 ms to 0 (no denormals).
- **The mix as built:** the bus levels are **trims under the player's sliders** (music 0 dB and sfx
  0 dB, whose material peaks at ≤ -10 / ≤ -6 dBFS; ambience -24 dB, ui -12 dB, voice -16 dB); the
  voice bus follows the SFX slider (Settings has no voice slider). The graph is sources → buses →
  compressor (threshold -14 dB, ratio 3, **hard knee**) → a makeup trim that removes the automatic
  makeup gain Web Audio compressors add (so material below -14 dBFS passes at unity) → **master
  gain** (the Master slider) → destination: the slider is a clean output volume and never changes
  how hard the compressor works. The compressor's 6 ms lookahead delays the output. Music notes are
  priority 2.5 in the voice pool (above UI 2 and world one-shots 1, below stingers and the Stamp 3).
  Mono downmixes after the master gain. The engine suspends its own context while the tab is hidden
  and resumes it (if it was unlocked) when the tab shows again.

## 13. Event bus

`SR.events.on(name, fn)`, `off`, `once`, `emit(name, payload)`; synchronous; listeners must not
throw (errors are caught and logged). Rules emit only through Result `events` (applied by `SR.act`
and the report scene for `SR.rules.night`), so Node tests can collect them. The **rule events** of
§6.8 (`gift`, `buy`, `shift`, `night`, `trip`, `jail`, `fight`, `fall`, `carHit`, `down`, ...) are
re-emitted on the bus under their own names. UI events:

| Event | Payload |
|---|---|
| `action:done` | `{ id, result }` |
| `time:advanced` | `{ from, to, reason }` |
| `day:started` | `{ day, report }` |
| `stat:changed` | `{ key, from, to, delta }` (str, int, cha, hp, hpMax) |
| `karma:changed` | `{ from, to }` |
| `money:changed` | `{ cash, bank, delta, reason }` |
| `heat:changed`, `buzz:changed` | `{ from, to }` |
| `item:changed` | `{ key, from, to }` |
| `job:changed` | `{ track, from, to }` |
| `home:changed` | `{ living, owned }` |
| `door:entered` / `door:exited` | `{ id, min }` / `{ id, spentMin }` (minutes spent inside; the time-lapse listens) |
| `player:down` | `{ cause, outcome, down }` (§6.7; the hospital listener queues the scene) |
| `minigame:done` | `{ id, skin, result }` |
| `msg:received` | `{ id, from }` |
| `achievement:unlocked` | `{ id }` |
| `perk:offered` / `perk:chosen` | `{ stat, level, options }` / `{ id }` |
| `weather:changed` | `{ from, to }` |
| `npc:stage` | `{ npc, from, to }` |
| `election:changed` | `{ status, poll }` |
| `game:over` | `{ reason: 'time'|'death'|'retire', result }` |
| `save:written` | `{ slot }` |
| `settings:changed` | `{ key, value }` |
| `input:device` | `{ device }` |
| `caption` | `{ key, dir }` |
| `stage:resized` | `{ k, uiK, dpr, scale, compact }` (render caches re-bake on a scale change; D22) |
| `quality:changed` | `{ preset, auto }` (D22) |
| `save:loaded` | `{ slot }` (`null` for a state object; D34) |
| `save:broken` | `{ slot, reason, key }` (the UI says "This save couldn't be read"; D34) |
| `input:pad` | `{ connected, id }` (gamepad hot-plug; D33) |
| `debug:changed` | `{ flag, on }` (`grid`, `time`, `projected`; D39) |

As built (D12): `on(name, fn)` returns an unsubscribe function; listeners get `(payload, name)`;
`'*'` receives every event; `once`, `count(name)`; listeners run in subscription order, then `'*'`;
a throwing listener is caught, logged with `console.error` and kept in `SR.events.errors` (the
last 50).

## 14. Randomness

`js/core/rng.js`: sfc32 generators with 4 × 32-bit state.

| Stream | Seed | Saved | Used by |
|---|---|---|---|
| `SR.rng.rules` | `state.seed` | yes (`state.rng.rules`) | every rule, every outcome that touches state, minigame outcomes |
| `SR.rng.world` | hash(seed, day) at each morning | no | traffic, pedestrians, cosmetic world placement |
| `SR.rng.fx` | `Math.random()` at boot | no | particles, text variants, jitter |

API per stream: `int(a, b)` inclusive, `float()`, `pick(arr)`, `chance(p)`, `weighted(pairs)`,
`state()`, `setState(s)`. A test greps `js/rules` and `js/data` for `Math.random` and fails on any hit.
As built (D8, D9): also `SR.rng.create(seed)` (an independent stream: tests, the simulator),
`seed(n)`, `next()` → uint32, `float(lo, hi)`; **every call except `state` / `setState` / `seed`
consumes exactly one draw**, so sequences stay aligned; `weighted([[value, weight], ...])` returns
`null` without a positive weight; seeding is splitmix32 with 12 discarded draws, fixed by golden
tests (the algorithm never changes without a save migration). `js/main.js` reseeds `SR.rng.fx`
from `Math.random()` in a prio-10 boot hook (so `rng.js` stays pure), and `SR.rng.reseedWorld(seed,
day)` runs on every `day:started`. Defaults before a game: rules 1, world 2, fx 3.

## 15. Saves, versioning and migration

| Key | Content |
|---|---|
| `sr1.slot1`, `sr1.slot2`, `sr1.slot3` | manual slots |
| `sr1.auto` | autosave (every sleep, and on leaving a building, debounced to 60 s) |
| `sr1.suspend` | "Suspend & quit" and before opening Classic mode; deleted on load |
| `sr1.ironman` | Hardcore's single slot (see below; deleted on death) |
| `sr1.profile` | achievements (with run day), Hall of Fame, badges ("Old School"), hints seen, lifetime totals |
| `sr1.settings` | settings |
| `sr1.tmp` | write buffer |
| `sr1.broken.<timestamp>` | quarantined unreadable saves |

- Classic mode's `srpg.save` is never touched.
- **Envelope:** `{ fmt: 'sr-save', v, meta: { name, day, length, difficulty, title, netWorth,
  savedAt, playSec, thumb }, state }`. `thumb` is a 160 × 90 JPEG data URL (quality 0.6, ≈ 8 KB) of
  the world canvas at save time.
- **Write:** serialise → write `sr1.tmp` → write the slot → remove `sr1.tmp`. On `QuotaExceededError`
  the UI asks the player to delete a slot. Budget ≤ 60 KB per save.
- **Retention (keeps Unlimited runs under budget):** `msgs` holds at most 150 entries: when full,
  the oldest read non-archived message is pruned, then the oldest read archived one (unread
  messages are never pruned; a 151st unread message drops the oldest unread one). `history` keeps
  one point per morning up to day 120 and one per week (every 7th morning) after that. `log` keeps
  two days, `rateHist` 30 points, stock `hist` 30 market nights. A test builds a 1,000-day
  Unlimited state (random play by the sim) and asserts its save is ≤ 60 KB.
- **Hardcore ironman:** the slot is written after every action that changes HP, money or karma
  (debounced 2 s, and immediately before a stake-bearing minigame opens, with `state.pending`),
  plus every night; `mode.inProgress = true` marks a mid-day state. Loading it resumes the current
  state, not the morning; if `pending` is set, its `worst` result is applied first (closing the tab
  mid-fight is a loss). There is no manual save or load on Hardcore.
- **Read:** parse → check `fmt` → run `SR.save.migrations[n]` for `n = v+1 .. CURRENT` → deep-fill
  missing fields from `SR.rules.state.defaults()` (unknown fields kept) → validate (clock, money
  finite and ≥ 0, stats in range). A failure copies the raw string to `sr1.broken.<ts>` and shows
  "This save couldn't be read". A save from a newer version refuses to load with a friendly message.
- **Versions:** v1 is the schema of §6.1 (waves 1-2). **v2** is introduced at the wave-3
  integration: its migration turns the P0 `satellite` into the `skydish` tier-2 TV (keeping the
  channels), adds any P1 fields not deep-filled, and is tested with a v1 fixture captured from the
  wave-2 tag (`tests/fixtures/save-v1-wave2.json`). In wave 1 the migration runner is tested with a
  synthetic, test-only migration chain and a v1 fixture with missing fields.
- **Export / import** (Save / Load › More, UI §5.16; the only place): "Copy save code": `PSKY1:` +
  base64(JSON) + `:` + CRC32 hex; import validates the prefix and checksum. If
  `navigator.clipboard.writeText` is unavailable or rejects, a modal shows the code in a read-only,
  pre-selected textarea ("Press Ctrl+C / Cmd+C"). "Paste save code" uses a TextField. A JSON file
  download (Blob) and `<input type=file>` import also work on `file://`.
- **Classic mode** opens `../stick-rpg/index.html` in the same tab after a suspend save; the
  browser's Back button returns to the remaster's title, where Continue resumes the suspend save
  (the recreation is never modified). The title's Classic confirm and the credits say so.
- Each migration has a fixture test (`tests/node/core.test.cjs`, fixtures in `tests/fixtures/`, D42:
  `state-v1.json`, `save-v1-missing.json`, `save-v1-invalid.json`, `save-v9-newer.json`,
  `save-corrupt.txt`, `export-v1.txt`, `settings-v1.json`; `save-v1-wave2.json` joins them at the
  wave-2 exit).
- **Export code checksum (D23):** CRC-32 (`SR.util.crc32`) of the base64 part, 8 lowercase hex digits.
- **`SR.save` as built (D34).** `CURRENT`, `migrations[n]`, `write(slot, state?)` (a state other than
  the live one may be written) → meta, `read(slot)` → state or `null`, `load(slot | state)` (a slot,
  or a state object: a new game from `SR.rules.state.create`, an imported code or file; it
  deep-fills, validates and makes it live: the rules stream from `state.rng.rules`, else seeded from
  `state.seed`, the world stream for the day, the play clock), `list()`, `remove(slot)`,
  `exportCode(slot?)`, `importCode(code)`, `exportFile(slot?)`, `importFile(file)`, `profile()`,
  `saveProfile(p)`, and `storage` (`get`, `set`, `remove`, `keys(prefix)`, `detect()`, `persistent`;
  localStorage with an in-memory fallback), `available` (false = memory only: the boot's warning
  toast), `SLOTS`, `lastError` (`{ slot, reason, key }`), `retain(state)`, `validate(state)` →
  problems, `recover()` (finishes a write interrupted between tmp and the slot; run at boot),
  `playSec()`, `flush()` (writes a debounced ironman or autosave now) and `copyCode()` →
  `Promise<{ copied, code, fallback }>` (the clipboard, else the textarea modal
  `[data-id="save-code"]`). Errors carry `code` / `reason`: `quota`, `hardcore` (a manual slot on
  Hardcore), `nogame`, `invalid` (`write` refuses a state that `validate` rejects), and for reads and
  imports `corrupt`, `format`, `newer`, `migration`, `invalid`, `code`, `checksum`. A read failure
  quarantines (except `newer`, which is kept and refused) and emits `save:broken`; when the
  quarantine copy cannot be written the slot is kept and `lastError.key` is `null`; `load` emits
  `save:loaded`. `meta` adds `slot`, `min` and `inProgress`. Autosave: `day:started` writes `auto`
  (Hardcore: `ironman`); `door:exited` writes `auto` at most once a minute (a later exit is
  deferred, not dropped). Ironman: when `tuning.difficulty.<difficulty>.saves` is `'ironman'`,
  `action:done` with an HP, money or karma delta (or any `:resolve`) schedules a write
  `ironmanDebounceMs` (2 s) later with `mode.inProgress = true`; the minigame frame sets
  `state.pending` and calls `SR.save.write('ironman')` before a stake-bearing round; the resolve's
  `action:done` clears `pending`; loading an ironman save with `pending` runs
  `SR.act(pending.resolve, pending.worst)` first; death deletes the slot; a pending write is
  flushed when the tab hides. History points are thinned only when they carry their day. The
  retention limits and the 60 KB budget are engine constants in `save.js` (D49; the log follows
  `tuning.news.logMax` and the stock history `tuning.stocks.history`). The profile defaults to
  `{ v: 1, achievements, hallOfFame, badges, hintsSeen, totals }`.

## 16. Settings

Per-profile preferences only (per-save values such as the pill toggle and the tutorial live in the
state). `SR.settings.get(key)`, `set(key, value)` (emits `settings:changed`, saves), `all()`. Schema:

```js
{ game: { clock24: true, hints: true /* one-shot hints on later runs */, alwaysAuto: false,
          confirmSpendOver: 1000, holdRepeat: true, rightClickBack: false, skateToggle: false,
          minimalHud: false, minimap: true },
  audio: { master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6, ui: 0.7, mono: false },
  display: { quality: 'auto', fpsCap: 60, fullscreen: false, screenShake: true, lean: false },
  access: { textScale: 1, highContrast: false, colorblind: 'none', reducedMotion: 'system',
            flashReduction: false, captions: false, assist: false, safeEdges: false, noGusts: false,
            typewriterCps: 60, haptics: true },
  controls: { keys: {}, pad: {}, contexts: {} } }
```

`access.safeEdges` makes unrailed edges bounce you back like Guard Rails (no falls; the fall
achievements and Pilot Ori's lines are disabled while it is on); `access.noGusts` turns off wind
gusts (GDD §3.12).

As built (D35): `SR.settings` adds `reset(key?)` (every key: emits `settings:changed` with `key:
'*'`), `defaults()` and `reload()`. `set` throws on an unknown key, a group, a wrong type or a
value outside `display.quality` (auto, high, medium, low), `display.fpsCap` (60, 30),
`access.textScale` (1, 1.25, 1.5), `access.colorblind` (none, protan, deutan, tritan),
`access.reducedMotion` (system, on, off), `access.typewriterCps` (30, 60, 120, 0 = instant), volumes
0..1. `settings:changed` fires only on a change. Stored settings are sanitised on load (bad values
back to defaults, unknown keys dropped); loading is lazy, so boot-hook order does not matter.

## 17. Performance budget

**Reference machine** (the target, used for the manual headed pass): a mid-range laptop with a
4-core mobile CPU (Intel Core i5-1135G7 / AMD Ryzen 5 5500U class), integrated GPU (Iris Xe /
Vega 7), 8-16 GB RAM, Chrome stable, 1920 × 1080 at DPR 1 and 1.5.

| Item | Budget on the reference machine |
|---|---|
| Frame rate | 60 fps; p95 frame ≤ 16.7 ms on High; ≤ 33 ms on Low with ×4 CPU throttle |
| Update (all world systems) | ≤ 2 ms per step (40 pedestrians, 16 cars, player, markers) |
| World render (CPU submit) | ≤ 6 ms (≈ 20 chunk blits, ≤ 30 building / prop sprites, ≤ 70 vector actors); ≤ 400 `drawImage` and ≤ 250 path fills per frame |
| Lighting + weather | ≤ 2 ms (1 multiply fill, ≤ 60 additive sprites plus window rect batches, rain as one path) |
| DOM | ≤ 1 ms per frame; HUD writes only on change (batched); no layout reads in the loop |
| Chunk baking | ≤ 3 ms per frame, ≤ 2 chunks; building sprites one mass per frame |
| GC | no per-frame allocation in hot loops; pools for particles, float texts, cars, pedestrians, paths |
| Memory | ≤ 160 MB in total: chunks 40 × 1 MB = 40 MB; building sprites 12 Mpx = 48 MB; props, actors and neon ≤ 8 MB (split into LRUs: car sprites 1.25 Mpx, prop sprites 0.5 Mpx, neon 0.2 Mpx, light sprites 0.03 Mpx; §9.4); one interior static layer ≤ 15 MB (2560 × 1440 max); two stage canvases ≤ 30 MB; sky, clouds and minimap ≤ 6 MB; JS heap ≤ 30 MB. Touch-compact profile (phones, iOS Safari's canvas cap): chunks 20, sprites 6 Mpx, maxDpr 1.5 → ≤ 100 MB |
| Boot | ≤ 1.5 s from `file://` to the boot screen; the title city bakes progressively |
| Script size | ≤ 8 MB of JS in total (2^20-byte MB, comments included, the scripts `index.html` lists; raised from 1.8 MB at the wave-1 integration, D45), no binary assets |
| Audio | ≤ 24 voices; rendering cost ≤ 3 % of real time; music scheduled 120 ms ahead |
| Save | serialise + write ≤ 20 ms |

**How it is checked.** Headless CI containers have no GPU (software raster) and noisy CPUs, so CI
never asserts absolute frame rates:
1. **CPU work budgets:** `tests/perf/perf.cjs` runs the scripted 60 s tour (§18) and reads
   `SR.loop.perf` (update and render CPU time, draw counts). Budgets are scaled by a **calibration
   factor**: at start the runner times a fixed JS workload (`tests/perf/calibrate.js`, ≈ 20 ms on
   the reference machine) and multiplies every CPU budget by `measured / reference` (clamped
   0.5-4). Draw-count budgets are absolute. **What is gated (D53):** headless Chromium rasterises
   2D canvases in software on the main thread and flushes a large frame's recording in the middle of
   whatever canvas call comes next (10-30 ms at 1920 × 1080), which a GPU does off the CPU; emulated
   GPU raster (SwiftShader) stalls the main thread instead. The runner therefore gates each frame's
   **JS work**: the frame's time minus the time spent inside native canvas calls (test-only timers on
   `CanvasRenderingContext2D.prototype` and on the stage contexts' own instance methods, path
   building excepted), p95 over a 60 s tour of one step and one render per frame, camera up to about
   430 u/s. Update ≤ 2 ms per step, render ≤ 11 ms (world 6 + lighting 2 + baking 3), frame ≤ 16.7
   ms, all × the factor; baking per frame (`SR.render.stats().frame.parts.bakeGround +
   bakeBuildings`) ≤ 3 ms × factor and ≤ 2 chunks; Low under ×4 throttle: frame JS work ≤ 33 ms ×
   factor. The raw frame time and the native canvas time are reported, not gated. Before a stop the
   runner calls `SR.render.warm()` and forces a raster readback outside the timed frame.
2. **Relative gate:** the p95 update and render times are compared with
   `tests/perf/baseline.json` (recorded by the lead at each wave integration on the same machine
   fingerprint); a regression of more than 20 % fails. A different fingerprint only warns.
3. **Memory:** the render caches report their device-pixel totals (`SR.render.stats()`), asserted
   against the budgets above at 1920 × 1080, DPR 1 and 2, every zoom (0.8 / 1 / 1.25) over the
   route; the render caches + the stage canvases + the JS heap ≤ 160 MB (the parts' budgets add up
   to more than the total, so the total binds).
4. **Audio:** `SR.audio.renderOffline` renders 60 s of the busiest song plus an sfx stress script
   in an `OfflineAudioContext`; the wall time must be ≤ 3 % of 60 s × the calibration factor.
5. **Absolute fps** (60 fps on High at 1080p; 30 fps on Low under ×4 throttle) is a **headed
   manual pass** on the reference machine by the lead at the wave-3 and wave-4 integrations,
   recorded in `reports/perf-manual.md`.

## 18. Testing

All tests run with `node tools/run-all.cjs` (Node ≥ 18, Playwright with Chromium). Headless browser
tests open `index.html` over `file://`. Seeds are fixed in every statistical test.

| Suite | Location | What |
|---|---|---|
| Node loader | `tests/node/load.cjs` | creates a `vm` context with `window = globalThis` (no `document`), loads files in index order and runs `SR.boot({ headless: true })`. Mode `rules`: `js/boot/*`, `js/core/rng.js`, `js/core/text.js`, `js/rules/*`, `js/data/**`. Mode `all` (the validator): `rules` plus every registration file of §4 (`js/art/palette.js`, `icons.js`, `interiors/*.js`, `exteriors-detail.js`, `props.js`, `logos.js`, `js/minigames/skins/*.js`, `js/audio/sfx.js`, `js/audio/songs/*.js`, `js/ui/subscreens/*.js`). A file that touches the DOM at load time fails the load |
| Rule unit tests | `tests/node/*.test.cjs` | every action's preview and run against expected deltas (table-driven from data); the time wall; the night order (every numbered step of GDD §4.7 records its side effect in order; the jail and hospital subsets); HP 0 outcomes per difficulty; interest tiers, the nightly cap and loans by difficulty; loan default never raises net worth; stock ticks, reverse splits, tip reliability and caps; robbery odds (Monte Carlo 10⁵, ±2 %); trip resolution order; fight damage ranges; slots RTP computed exactly (0.9225); blackjack engine against a basic-strategy table and a fixed-seed 4 × 10⁶-hand edge in 0.35-0.75 %; counting EV (B-14b); roulette payouts; scratch EV exactly $3.00; darts scoring and Auto samples; poll maths and campaign caps; price and check modifier stacking (B-28); rank table at every boundary; net worth; perks; save migrations; the 1,000-day save size |
| Content validation | `tools/validate.cjs [--wave N]` | loads mode `all`; every id reference resolves (items, icons, sfx, songs, skins, sub-screens, text keys, buildings, fns, palette keys); only known condition / effect names; text length limits; `p` on every def and `feature` on every def with `p ≥ 1`; `repeatable` only where allowed; every HP-costing voluntary def has `hpAbove`; song and sfx data formats (ART_AUDIO §13.8); no duplicate ids; quest and arc stages reachable; **no colour literals** (`#[0-9a-fA-F]{3,8}\b`, `rgb(`, `rgba(`, `hsl(`) in `js/**` or `css/**` except `js/art/palette.js` and `css/tokens.css` |
| Copyright checks | `tools/banned.txt`, `tools/shingles.cjs` | no banned string (case-insensitive) in `js/`, `css/`, `index.html`; no 8-word run shared with the recreation's `js/**` strings; no binary files among **tracked** files (`git ls-files`; `shots/`, `tests/visual/out/` and `tests/perf/out/` are git-ignored) |
| City invariants | `tests/node/invariants.test.cjs` | §8.1 |
| Shuffled load | `tests/node/shuffle.test.cjs`, `tests/e2e/shuffle.test.cjs` | load non-boot scripts in 5 random orders; boot must succeed with no errors |
| E2E | `tests/e2e/*.test.cjs` via `tests/harness.cjs` | boot with zero console errors; new-game flow; walking, collisions, doors (every door, the dwell and re-arm rules); falls (-10 HP, respawn inside, no time); a scripted car hit; skate / car speed ratios; click-to-walk; every building's actions (generated per action: cost, effect, refusal when short of time or cash); every sub-screen mounts, refreshes and unmounts; sleep → report → next day; HP 0 → hospital / death; save / load / export / import round trips (clipboard and textarea fallback); letterbox at 1280×720, 1920×1080, 1366×768, 2560×1080, 800×1280, and the touch-compact layout at 844×390; text crispness at 1366×768 and 912×513 (§2, D40); keyboard-only, mocked-gamepad and touch navigation through title → city → building → pocket; a touch drag scrolls a long card body |
| Audio (objective) | `tests/e2e/audio.test.cjs` | for every song (one full order + 1 bar) and every sfx, `SR.audio.renderOffline` at 44.1 kHz: peak ≤ -10 dBFS for songs and ≤ -6 dBFS for sfx; song RMS in [-30, -16] dBFS; no NaN, no denormals (0 < |x| < 1e-30); max first difference ≤ 0.25 (no clicks) and, at the loop seam of two consecutive loops, ≤ 0.05; sfx start and end within 5 ms at |x| < 0.01; every pattern's step count = bars × meter × stepsPerBeat; every `order` entry exists; the leitmotif's interval sequence (0, +4, +7, +9, +7 semitones) is found at every `motif` annotation of the songs ART_AUDIO §13.3 lists. Ear review is an optional user step |
| Visual regression | `tests/visual/visual.cjs` | 16 fixed scenes (seeded, fixed time and weather, preset High); read back the canvas (a minigame scene: its own `[data-id="mg-canvas"]`, D56), downsample in-page to 64 × 36 average colours, compare to `tests/visual/goldens/*.json` (per-cell tolerance 12 / 255); failures dump PNGs to `tests/visual/out/` |
| Contact sheets | `tests/sheets/*.html` | art, icons, components, exteriors, interiors, actors, minigames, sound test; each opens from disk; reviewers screenshot them |
| Performance | `tests/perf/perf.cjs` | a scripted 60 s city tour at 1920 × 1080, DPR 1 and 2, noon and night-in-rain, crowd and traffic full, preset pinned (High, then Low with ×4 CPU throttle via CDP); asserts the JS-work, draw-count and memory budgets with the calibration factor and the relative gate of §17, the script size (≤ 8 MB) and the boot time |
| Balance | `tests/balance/sim.cjs` | BALANCE B-23 bots × policies × 20 seeds; prints CSV and asserts bands |
| Accessibility | `tests/e2e/a11y.test.cjs`, `tests/node/tokens.test.cjs` | tab through every building card, pocket tab and menu (focus order, visible ring, ARIA names); computed-style contrast audit ≥ 4.5:1 for text; the token test parses `css/tokens.css` and asserts every `-ink` / `-100` pair, white on `--primary-600` and `--danger`, and `--ink-500` on `--paper-0/1/2` are ≥ 4.5:1 |

**Harness** (`tests/harness.cjs`): `open({ width, height, dpr, touch })`, `newGame(opts)`,
`set(patch)`, `state()`, `act(id, params)`, `preview(id, params)`, `enter(buildingId)`,
`goto(sceneId, params)`, `step(frames)`, `press(action)`, `hold(action, frames)`,
`clickUI(dataId)`, `uiText()`, `teleport(x, y)`, `setTime(min)`, `seed(n)`, `mg(result)` (forces
the next minigame's result), `quality(preset)` (default High), `shot(file)`, `pixels(x, y, w, h)`,
`perf()`, `errors()`, `close()`. The clock is paused; tests step it. As built (D26, D41): `open`
also takes `hash`, `live` (keep the loop running), `quality` (`null` pins nothing), `fast`
(`SR.debug.fast(true)`), `timeout` and `url` (a contact sheet); extras `page`, `browser`, `context`,
`eval(fn, arg)`, `debug(name, ...args)`, `ui()`, `scenes()`, `key(code)`, `warnings()`, `get(path)`,
`setDay(d)`, `fast(on)`, `night(kind)`, `down(cause)`, `inject(action, down)`, `resize(w, h)` and
`reload()` (storage survives); a method whose `SR.debug` function has not landed rejects with "not
available yet". Exports `open`, `ROOT`, `INDEX_URL`, `suite`, `playwright`. **Contact sheets**
(`tests/sheets/<name>.html`) load `js/boot/*`, `js/core/*` and the scripts they show by relative
paths, never `js/main.js`, register their test content and fakes, then call `SR.boot({ scene:
false })`. **The Node loader** (`tests/node/load.cjs`, CONTRACT §18): `node tests/node/load.cjs
rules|all [--shuffle <seed>] [--no-boot] [--list] [--quiet]`; module `load({ mode, files, extra,
shuffle, boot, keepGoing, allowRandom, console })` → `{ SR, context, files, errors, boot }`,
`files(mode)`, `indexScripts()`, `context(opts)`, `run(context, code, rel)`, `shuffled(list, seed)`,
`suite(name)`; the context has no `document`, timers, storage, audio or canvas, and `Math.random`
throws.

### 18.1 Quality tools (W1-Q)

- **`tools/validate.cjs [--wave N] [--root dir] [--json] [--quiet] [--selftest]`** (W1-Q); module
  `validate({ root, wave, plant, isStub })` → `{ errors, warnings, info, stats }` (`errors` /
  `warnings` are `{ check, where, msg }`) and `textOwner(key)` (the prefix map of CONTRACT §7).
  `--wave N` makes a missing reference a warning when the file that should register it still
  carries the stub marker (text keys by the prefix map; icons, sfx, songs, skins, sub-screens,
  buildings, actions, fns, palette keys by their owner file) and lists wave-≤ N files that are still
  stubs as warnings; strict (no `--wave`) is the release gate. Besides the data it checks the ids
  code names outright: the first argument of any `text('…')` call, every `'reason.…'` literal,
  `{ key: '<ns>.…' }` for the text-only namespaces, `audio.sfx / music / stinger('…')`,
  `art.icon(ctx, '…')` and `iconURL('…')` (a key the same file tests with `has('…')` is optional; a
  key built with `+` is skipped); the frozen names (sub-screens in their files with their P / flag,
  skins on their engines, songs in their files); `open` names a skin or an unskinned engine (D29);
  an opening row's `hpAbove` covers the possible voluntary hurt of its `:resolve`. The causes
  `fall`, `carHit`, `carCrash`, `fight`, `mugger`, `goons` are involuntary everywhere, and `world.*`
  actions are exempt from the `hpAbove` rule.
- **`tools/shingles.cjs [--shingles] [--banned] [--binary] [--root dir] [--ref dir] [--paths a,b]
  [--selftest]`**: the three copyright checks in one tool (all three by default; "the banned-strings
  check" is `node tools/shingles.cjs --banned`). Words are compared lower-case without punctuation,
  with placeholders, interpolations and plain numbers as one wildcard. Outside a git work tree the
  binary check walks the files minus the git-ignored directories. **`tools/banned.txt`**:
  `[substring]` (default), `[word]`, `[upper]` and `[only-in] term: where, where` lists; `#`
  comments; a marker alone switches the list, a marker with text is a one-line entry.
- **`tools/run-all.cjs [--wave N | --strict] [--only g,g] [--skip g,g] [--full] [--jobs N] [--bail]
  [--verbose] [--list]`**, groups `node`, `tools`, `balance`, `e2e`, `visual`, `perf`; without
  `--wave` it infers the wave from the stubs left (strict when none is left); an unknown group or a
  `--wave` outside 1-4 is a usage error (exit 2); a suite past its timeout gets SIGTERM, then SIGKILL
  5 s later.
- **`tests/e2e/a11y.test.cjs`** exports `audit(rootSel)` (in-page: names, roles, image alternatives,
  dialog names, text contrast ≥ 4.5 / 3, text ≥ 12 px), `tabWalk(t)` (real Tab presses through the
  current focus scope: order, scope, ring, names), `check(T, t, label, rootSel)` and
  `focusEveryNav()`, so any e2e suite can audit its screens (`await t.eval(A.audit, '#ui')`).
- **`tests/perf/calibrate.js`**: a classic script or a Node module; in a page `window.SRCalibrate`,
  in Node `require()`: `run(runs?)` → `{ ms, factor, reference, checksum, runs }`, `factor(ms)`,
  `REFERENCE_MS` (20). It never touches `window.SR`. Contact sheets load it with a `<script>` tag.
- **`tests/visual/visual.cjs [--record] [--only a,b] [--list] [--goldens dir] [--strict]
  [--selftest]`**; goldens are `tests/visual/goldens/<scene>.json` = `{ id, kind, source, sel, grid:
  [64, 36], tolerance: 12, size, preset, viewport, dpr, rows: [36 strings of 64 RRGGBB] }`. A scene
  that has a golden and can no longer be captured fails (never "pending"). Minigame scenes read
  `[data-id="mg-canvas"]`.
- **`tests/perf/perf.cjs [--quick] [--record] [--only id,id] [--json file] [--selftest]`**;
  `tests/perf/baseline.json` = `{ v: 1, note, tours: { <frames>: { fingerprint, recorded,
  calibration, frames, configs: { <config>: { driver, update, render } } } } }`, one recording per
  tour length: the lead runs `--record` and `--record --quick` (run-all's default) at each
  integration, and each run is gated against the recording of its own tour length.
- **`tests/balance/sim.cjs`**: `simulate({ bot, policy, seeds, days, difficulty, length, SR })`,
  `csv`, `summary`, `chart`, `assertBands`, `BANDS`; bots (`tests/balance/bots.cjs`) are `{ name,
  decide(state, ctx) → { id, params } | null, minigame?, init?, jailChoice? }` with the `ctx`
  documented in that file's header.

## 19. File list and ownership

Owners are the work packages of BUILD_PLAN (Wn-X) that **create** each file. A later wave may
reassign a file (BUILD_PLAN §5 lists every wave-3 and wave-4 reassignment and is authoritative);
within a wave exactly one package owns each file.

```
stick-rpg-remaster/
  index.html                          W1-K   every script tag, #app/#stage/#world/#fx/#ui/#aria
  .gitignore                          W1-K   shots/, tests/visual/out/, tests/perf/out/; re-includes /tools/ and
                                             /tests/fixtures/ (D24: a parent ignore hides every tools/ directory)
  README.md                           W4-R
  css/tokens.css                      W1-D   design tokens (UI.md §2)
  css/base.css                        W1-D   reset, stage, typography, a11y modes
  css/components.css                  W1-D   every component class
  css/screens.css                     W2-Front (title, newgame, report, results layouts)
  js/boot/namespace.js                W1-K   SR, SR.def.*, SR.reg, onBoot/boot
  js/boot/util.js                     W1-K   clamp, lerp, ease*, fmt, hash, deepFill, crc32
  js/boot/events.js                   W1-K   SR.events
  js/core/rng.js                      W1-K
  js/core/loop.js                     W1-K
  js/core/stage.js                    W1-K
  js/core/quality.js                  W1-K
  js/core/input.js                    W1-K
  js/core/scenes.js                   W1-K
  js/core/save.js                     W1-K
  js/core/settings.js                 W1-K
  js/core/text.js                     W1-K
  js/core/debug.js                    W1-K
  js/rules/state.js                   W1-R
  js/rules/check.js                   W1-R
  js/rules/conditions.js              W1-R
  js/rules/effects.js                 W1-R
  js/rules/act.js                     W1-R
  js/rules/time.js                    W1-R
  js/rules/stats.js                   W1-R
  js/rules/log.js                     W1-R   the daily log (§6.9)
  js/rules/perks.js                   W1-R (W3-Prog in wave 3)
  js/rules/jobs.js                    W1-E
  js/rules/training.js                W1-E
  js/rules/night.js                   W1-E
  js/rules/bank.js                    W1-E
  js/rules/stocks.js                  W1-E
  js/rules/homes.js                   W1-E
  js/rules/calendar.js                W1-E
  js/rules/endgame.js                 W1-E
  js/rules/health.js                  W1-E   HP 0: Second Wind, hospital night, death (§6.7)
  js/rules/news.js                    W1-E   headline and TV story selection (§6.9)
  js/rules/crime.js                   W1-C
  js/rules/trade.js                   W1-C
  js/rules/fight.js                   W1-C
  js/rules/casino.js                  W1-C
  js/rules/election.js                W1-C
  js/rules/encounters.js              W3-Life
  js/rules/arcs.js                    W3-Life
  js/rules/achievements.js            W3-Prog
  js/rules/advisor.js                 W3-Prog
  js/data/tuning.js                   W1-R   all of BALANCE (including the price and check modifier tables, B-28)
  js/data/features.js                 W1-K   feature flags for P1 / P2 content (BUILD_PLAN Appendix B); the lead flips them
  js/data/worldmap.js                 W1-W
  js/data/items.js                    W1-E
  js/data/jobs.js                     W1-E
  js/data/homes.js                    W1-E
  js/data/furniture.js                W1-E
  js/data/stocks.js                   W1-E
  js/data/ranks.js                    W1-E
  js/data/cities.js                   W1-C
  js/data/fighters.js                 W1-C
  js/data/decrees.js                  W1-C
  js/data/perks.js                    W1-R
  js/data/achievements.js             W3-Prog
  js/data/encounters.js               W3-Life
  js/data/arcs.js                     W3-Life
  js/data/events.js                   W3-Life   shift events, city events, campaign events (all P1)
  js/data/people.js                   W2-Street
  js/data/buildings/home.js           W2-Home
  js/data/buildings/mcsticks.js       W2-Food
  js/data/buildings/store.js          W2-Food
  js/data/buildings/pawn.js           W2-Goods
  js/data/buildings/furniture.js      W2-Goods
  js/data/buildings/bank.js           W2-Money
  js/data/buildings/nli.js            W2-Money
  js/data/buildings/uofs.js           W2-Civic
  js/data/buildings/cityhall.js       W2-Civic
  js/data/buildings/bar.js            W2-Night
  js/data/buildings/casino.js         W2-Night
  js/data/buildings/bus.js            W2-Transit
  js/data/buildings/street.js         W2-Street
  js/data/buildings/park.js           W3-Park
  js/data/actions/world.js            W1-W   world.fall, carHit, carCrash, carFished, enter (§8.3)
  js/data/actions/bag.js              W2-Pocket   bag.smoke, bag.eatTakeout, bag.give, bag.usePill toggle, bag.info
  js/data/actions/phone.js            W2-Pocket (W3-Econ in wave 3)   phone.* apps, contacts (SR.def.contact), phone.save
  js/data/actions/jail.js             W2-Transit  jail.day (the choice), jail.bail
  js/data/actions/trip.js             W2-Transit  trip.take, trip.haggle, trip.walk, trip:resolve, bus.wait
  js/data/actions/hospital.js         W2-Transit  hospital.discharge (acknowledges the bill card)
  js/data/text/en-ui.js               W1-D   UI chrome, HUD, settings, glyphs, captions, the minigame frame (W2-Front in wave 2)
  js/data/text/en-econ.js             W1-E        items, jobs, homes, furniture, stocks, ranks, every report.* line (W3-Econ in wave 3)
  js/data/text/en-conflict.js         W1-C        cities, fighters, decrees, crime and trip outcomes (W3-Crime in wave 3)
  js/data/text/en-prog.js             W1-R        perks, every reason.* (W3-Prog in wave 3: achievements, Advisor, perk card)
  js/data/text/en-world.js            W1-W        place names, door tags (door.*), world toasts, Pilot Ori (ori.*) (W2-City in wave 2)
  js/data/text/en-home.js             W2-Home     home, TV shows, messages UI (the report's lines are en-econ's report.*)
  js/data/text/en-news.js             W2-Home     Daily Fold headlines, TV news stories
  js/data/text/en-food.js             W2-Food     McSticks, Five-O
  js/data/text/en-goods.js            W2-Goods    pawn, Fine Line
  js/data/text/en-money.js            W2-Money    bank, NLI, shift events
  js/data/text/en-civic.js            W2-Civic    U of S, City Hall, campaign, rivals
  js/data/text/en-night.js            W2-Night    Sticky's, casino, fighters' taunts
  js/data/text/en-transit.js          W2-Transit  bus, trips, cities, jail, hospital
  js/data/text/en-street.js           W2-Street   Harold, Skid, Red, junker, voicemails of the original's beats
  js/data/text/en-city.js             W2-City     pedestrian barks, car-hit voicemails (Pilot Ori and door tags are en-world's)
  js/data/text/en-front.js            W2-Front    title, intro, new game, results headlines
  js/data/text/en-pocket.js           W2-Pocket   bag and phone actions, contacts, Pocket strings (D16; W3-Econ for phone keys in wave 3)
  js/data/text/en-events.js           W3-Life     encounters, arcs, city events
  js/data/text/en-park.js             W3-Park     park, Point Margin, Theory of the Fold
  js/world/geometry.js                W1-W
  js/world/collision.js               W1-W
  js/world/nav.js                     W1-W
  js/world/camera.js                  W1-W
  js/world/player.js                  W1-W
  js/world/doors.js                   W1-W
  js/world/fall.js                    W1-W
  js/world/world.js                   W1-W   SR.world.update orchestrator
  js/world/traffic.js                 W2-City
  js/world/pedestrians.js             W2-City
  js/world/streetnpcs.js              W2-Street
  js/world/markers.js                 W3-Life
  js/world/police.js                  W3-Crime
  js/world/weather.js                 W3-Light
  js/render/renderer.js               W1-G
  js/render/sky.js                    W1-G (W3-Light in wave 3)
  js/render/ground.js                 W1-G
  js/render/buildings.js              W1-G
  js/render/actors.js                 W1-G
  js/render/lighting.js               W1-G (W3-Light in wave 3)
  js/render/shadows.js                W3-Light
  js/render/weatherfx.js              W3-Light
  js/render/particles.js              W1-G
  js/render/worldui.js                W1-G
  js/render/minimap.js                W2-City
  js/render/fx.js                     W1-G   transitions, confetti, stamp jolt on #fx
  js/art/palette.js                   W1-A
  js/art/paper.js                     W1-A
  js/art/draw.js                      W1-A   inkStroke, paperFill, tone(), roundRect, poly, text helpers
  js/art/stick.js                     W1-A
  js/art/portraits.js                 W1-A
  js/art/vehicles.js                  W1-A
  js/art/icons.js                     W1-A
  js/art/logo.js                      W1-A
  js/art/bible.js                     W1-A   SR.art.bible.draw(ctx): the art-bible screen (#artbible)
  js/art/exteriors.js                 W1-G   painter + archetypes
  js/art/exteriors-detail.js          W2-Exterior
  js/art/props.js                     W2-Exterior
  js/art/logos.js                     W2-Exterior   brand glyphs for signs
  js/art/skyline.js                   W2-Exterior   distant islands, Sky Ribbon
  js/art/interiors/kit.js             W1-A
  js/art/interiors/<id>.js            the owner of data/buildings/<id>.js (home, mcsticks, store, pawn,
                                      furniture, bank, nli, uofs, cityhall, bar, casino, bus)
  js/art/interiors/special.js         W2-Transit   jail, hospital, trip card backdrops
  js/art/intro.js                     W2-Front
  js/ui/dom.js                        W1-D
  js/ui/components.js                 W1-D
  js/ui/focus.js                      W1-D
  js/ui/toast.js                      W1-D
  js/ui/stamp.js                      W1-D
  js/ui/modal.js                      W1-D
  js/ui/hud.js                        W1-D
  js/ui/card.js                       W1-D   building action card, ActionRow list, sub-screen host
  js/ui/dialog.js                     W1-D   street dialog, choice cards
  js/ui/tutorial.js                   W3-Onboard
  js/ui/subscreens/tv.js, messages.js, stocks.js              W2-Home
  js/ui/subscreens/shop.js, furniture.js                      W2-Goods
  js/ui/subscreens/bank.js, realestate.js, jobs.js            W2-Money
  js/ui/subscreens/transcript.js, campaign.js                 W2-Civic
  js/ui/subscreens/bus.js                                     W2-Transit
  js/ui/subscreens/mayor.js                                   W3-Crime   Mayor's Office decrees
  js/ui/subscreens/vip.js                                     W3-Nightlife   casino VIP desk
  js/ui/pocket/pocket.js, journal.js, map.js, stats.js, bag.js, phone.js, achievements.js   W2-Pocket
  js/ui/screens/title.js, newgame.js, pause.js, settings.js, saveload.js, results.js,
    halloffame.js, credits.js, profile.js                     W2-Front
  js/ui/screens/report.js                                     W2-Home
  js/ui/screens/jail.js, hospital.js                          W2-Transit
  js/ui/screens/perk.js                                       W3-Prog
  js/scenes/boot.js, title.js, newgame.js, intro.js, results.js   W2-Front
  js/scenes/city.js                   W2-City
  js/scenes/building.js               W1-D
  js/scenes/minigame.js               W1-M
  js/scenes/report.js                 W2-Home
  js/scenes/jail.js, hospital.js, death.js, bustrip.js        W2-Transit
  js/minigames/framework.js           W1-M
  js/minigames/shiftrush.js           W1-M
  js/minigames/timingring.js          W1-M
  js/minigames/duel.js                W1-M
  js/minigames/fight.js, darts.js, slots.js, blackjack.js, roulette.js   W2-Night
  js/minigames/scratch.js             W2-Food
  js/minigames/skins/orderup.js, holdup.js               W2-Food
  js/minigames/skins/sortit.js, pitch.js, boardroom.js   W2-Money
  js/minigames/skins/debate.js                           W2-Civic
  js/minigames/skins/hotwire.js                          W2-Street
  js/minigames/skins/interview.js, interrogation.js      W3-Life
  js/minigames/skins/tourhook.js                         W3-Crime
  js/audio/engine.js, synth.js, sfx.js, music.js, ambience.js   W1-S
  js/audio/songs/paper_sky.js, crossroads_strut.js, home_sweet_paper.js   W1-S
  js/audio/songs/<the other 19 songs>.js                 W2-Music
  js/main.js                          W1-K
  tests/harness.cjs                   W1-K
  tests/node/load.cjs                 W1-K
  tests/node/core.test.cjs            W1-K   the kernel's Node tests (M0 and M1, saves and migrations)
  tests/node/<module>.test.cjs        the module's owner
  tests/node/invariants.test.cjs      W1-W
  tests/node/tokens.test.cjs          W1-D
  tests/e2e/{boot,slice,input,save,stage}.test.cjs   W1-K
  tests/e2e/audio.test.cjs            W1-S (W2-Music adds its songs)
  tests/node/shuffle.test.cjs         W1-Q
  tests/e2e/<area>.test.cjs           the area's owner
  tests/e2e/shuffle.test.cjs, a11y.test.cjs   W1-Q
  tests/visual/visual.cjs + goldens   W1-Q (goldens refreshed by W4-Visual)
  tests/perf/perf.cjs, calibrate.js, baseline.json   W1-Q (baseline recorded by the lead; perf.cjs gates the 8 MB script budget)
  tests/balance/sim.cjs, bots.cjs     W1-Q (scaffold), W3-Balance (bots and bands)
  tests/sheets/<name>.html            the owner of what it shows
  tests/fixtures/                     W1-K
  tools/validate.cjs, banned.txt, shingles.cjs, run-all.cjs   W1-Q
  docs/*.md                           lead
  docs/CONTRACT.md                    W1-K   the frozen public names (generated from this document), the rule
                                             events (§6.8), sub-screen ids (§7.1) and the song / sfx formats
  docs/requests/<package>.md          each package writes its own
  reports/<name>.md                   the package named in BUILD_PLAN (balance-report: W3-Balance; QA: W4-QA;
                                      perf-manual: lead); not under docs/
```

Song files (`js/audio/songs/`): `paper_sky`, `crossroads_strut`, `streetlights`, `fry_day`,
`funky_aisle`, `pawnbroker_blues`, `showroom_smooth`, `compound_interest`, `please_hold`,
`campus_canon`, `last_call_shuffle`, `high_roller_lounge`, `home_sweet_paper`, `brawl_hall`,
`tick_tock_trouble`, `midnight_express`, `hail_to_the_stick`, `doing_time`, `waiting_room`,
`morning_edition`, `final_edition`, `stingers` (22 files).

## 20. Debug API

`SR.debug` (always present; the harness uses it): `newGame(opts)`, `set(patch)` (deep merge into
the state), `get(path)`, `act(id, params)`, `preview(id, params)`, `goto(sceneId, params)`,
`enter(buildingId)`, `teleport(x, y)`, `setTime(min)`, `setDay(d)`, `seed(n)`, `step(frames)`,
`press(action)`, `hold(action, frames)`, `mg(result)`, `fast(bool)` (skip animations and
typewriters), `perf()`, `shot()` (data URL), `ui()` (a JSON summary of visible UI: scene stack,
card rows with enabled state and chips, toasts), `grid(bool)` (draw nav grid, colliders, lanes),
`time(bool)` (hour scrubber overlay for lighting), `night(kind)` (runs `SR.rules.night.run`),
`down(cause)` (forces HP 0 through `SR.rules.health.down`), `quality(preset)`, `feature(flag, on)`,
`projected(bool)` (draws every mass's projected rect, porch and signature rect). URL flags: `index.html#debug` shows an FPS and
perf overlay; `#artbible` opens the art-bible scene (ART_AUDIO §1).

As built (D26, D39, D46): `newGame(opts)` = `SR.save.load(SR.rules.state.create(opts))` (seed 12345
when omitted; `opts.scene` / `opts.sceneParams` then go to a scene) and returns the state; `goto`
and `enter` pass `{ transition: false }`; `enter(id)` resolves door ids, and `'home'` through the
lived-in home's door, with `SR.world.doors.resolve`, any other id opens that building def;
`teleport` calls `SR.world.teleport(x, y)`; `mg(result)` is `SR.minigame.force(result)`; `fast()`
with no argument reads the flag and `fast(true)` also sets `html.sr-fast` (CSS transitions and
animations off) and makes scene changes swap at once; `grid`, `time`, `projected` set
`SR.debug.flags.<name>` (toggle without an argument) and emit `debug:changed`, invalidating no
render cache (the overlays are drawn every frame); `night(kind)` re-emits the Report's events, then
emits `day:started { day, report }` as the report scene does; `down(cause)` sets HP 0, calls
`SR.rules.health.down` and emits `player:down`; `ui()` → `{ scenes, top, contexts, items, rows,
toasts, card? }`; `overlay(on)` shows the `#debug` overlay; the `artbible` scene leaves on `back`.

## 21. Code style and conventions

- ES2017; `'use strict'`; one IIFE per file: `(function () { 'use strict'; var SR = window.SR; ... })();`
- 2-space indent, single quotes, semicolons, `const`/`let`, arrow functions allowed; no `class` for
  data (plain objects); no `async` in rules; UI and minigames may use Promises.
- Names: files `kebab` or single words; ids `snake_case` for content (`home_apt`), dotted text
  keys (`act.mcsticks.fries`), camelCase functions; action ids `<building>.<verb>`.
- No magic numbers in rules: read `SR.tuning`. Comments explain *why*, cite GDD / BALANCE ids, and
  mark original rules with `(orig)`.
- No DOM ids other than the stage layers; UI elements carry `data-id` for tests.
- Colours only from `css/tokens.css` (DOM) and `SR.art.palette` (canvas). Data files (interiors,
  exteriors, fighters, cities, skins) name **palette keys** (`'bld.mcsticks.walls'`,
  `'karma.good.3'`, `'fighter.7'`): a key is the dotted path of an entry of `SR.art.palette`, a
  numeric segment indexing an array, and the validator, the painter and the kit resolve it the same
  way (`SR.art.draw.color`, D32; ART_AUDIO §2 lists the groups); the karma bands live in `palette.js` and tuning only computes the
  band index. The validator's rule is exact: colour literals appear only in `js/art/palette.js`
  and `css/tokens.css` (§18).
- Every public function has a one-line JSDoc comment with its types.
- Error handling: user-visible failures become toasts; programmer errors throw in debug and are
  logged once in release.
