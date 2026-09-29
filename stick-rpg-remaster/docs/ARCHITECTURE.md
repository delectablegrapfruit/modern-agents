# Paper Sky: Architecture

The technical contract. Every public name here is frozen at the end of wave 1's kernel milestone
(BUILD_PLAN W1-K, M0) and changes only through the lead (the requests protocol, BUILD_PLAN §1).
GDD = game design, BALANCE = numbers, UI = screens and components, ART_AUDIO = art and sound.

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
| Crispness check | `tests/e2e/stage.test.cjs` screenshots a card at 1366 × 768 (k = 0.7125) and asserts glyph edges are not blurred (a sharpness metric on a rendered text sample versus 1280 × 720). |

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

## 3. Main loop

- `SR.loop`: fixed-step simulation at 60 Hz (`SR.STEP = 1/60`) with an accumulator and at most 5
  catch-up steps per frame; rendering on `requestAnimationFrame` with the interpolation alpha.
  Optional 30 fps cap (renders every other rAF).
- Game logic never reads wall-clock time. Real-time animation (UI tweens, minigames) uses the
  loop's `SR.loop.time` (seconds of unpaused play), which tests can step.
- `SR.loop.pause()`, `resume()`, `step(frames)` (tests), `perf` = `{ update: {p50, p95}, render:
  {p50, p95}, fps }` over the last 300 frames.
- Order per step: input poll → active scene stack `update(dt)` (top down, stopping at a scene that
  `blocksUpdate`) → tweens. Per frame: scenes `render(ctx, alpha)` bottom up (skipping below a
  scene that `blocksRender`) → `SR.render.fx` → DOM HUD diff flush.
- `perf.update` and `perf.render` are CPU times measured with `performance.now()` around the
  update steps and the render calls of a frame (work time); `perf.draws` counts `drawImage` and
  path fills per frame (the CI proxy for GPU load, §17).
- **Hidden tab:** on `visibilitychange` to hidden the loop pauses and the `AudioContext` is
  suspended; on visible the context resumes (if it was unlocked) and, if the top scene is `city`
  or `minigame`, the `pause` overlay opens. Game time never advances while hidden.

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
  other (W1-R uses it; W1-K creates it).
- **Load-time rule:** a file may only define functions and call `SR.def.*` / assign its own API
  object (`SR.world.traffic = {...}`). It must not call another module or read another registry at
  load time. Everything that needs other modules goes into `SR.onBoot(prio, fn, opts)`.
- **Node-loadable registration files.** Every file that registers content (`js/data/**`,
  `js/art/palette.js`, `js/art/icons.js`, `js/art/interiors/*.js`, `js/art/exteriors-detail.js`,
  `js/art/props.js`, `js/art/logos.js`, `js/minigames/skins/*.js`, `js/audio/sfx.js`,
  `js/audio/songs/*.js`, `js/ui/subscreens/*.js`) touches no DOM, canvas, audio or browser API at
  load time: drawing and DOM building happen only inside functions called later. The validator
  loads them all in Node (§18).
- `SR.boot(opts)` (called by `js/main.js` on `DOMContentLoaded`): runs boot hooks by priority
  (`10` core, `20` data validation and indexing, `30` world build, `40` render caches, `50` UI
  mount, `60` audio, `90` first scene), then `SR.scenes.go('boot')`. `SR.boot({ headless: true })`
  (Node) runs only hooks registered with `{ headless: true }` and never starts a scene.
- **Script order in `index.html`:** boot → core → rules → data → world → render → art → ui →
  minigames → audio → scenes → main. Because of the load-time rule, order only matters for
  `js/boot/*` (first) and `js/main.js` (last). `tests/node/shuffle.test.cjs` and
  `tests/e2e/shuffle.test.cjs` load everything else in random order and boot.
- **Stubs:** from wave 1, `index.html` lists every file of §19. Files not yet written exist as a
  stub: `(function () { 'use strict'; /* stub, owner: W2-Food */ })();`.

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
SR.scenes.go(id, params)       // replace the whole stack (with a transition)
SR.scenes.push(id, params)     // overlay → Promise resolved by pop(result)
SR.scenes.pop(result)
SR.scenes.replace(id, params)  // replace the top
SR.scenes.top(), SR.scenes.stack()
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
`fade` (200 ms; used for all transitions with Reduced Motion).

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
           tourWeek: {} /* cityId -> week index of the last tour there */, buyers: [0,0,0,0,0] },
  fight: { won: 0, champion: false, ringBouts: 0 },
  casino: { points: 0, barredUntil: 0, suspicion: 0, winToday: 0, shoe: null, lastBet: 0 },
  crime: { bankRobDays: [] /* days of bank robberies, pruned after 14 days */ },
  daily: { tv: {}, beers: 0, gambleKarma: 0, uofsKarma: 0, seminars: 0, paper: 0, chess: 0, nap: 0,
           benchNap: 0, online: 0, dartsPractice: 0, dartsMatches: 0, bjHands: 0, homePerk: 0,
           charity: 0, ducks: 0, preacher: 0, skate: 0, soup: 0, leftovers: 0, relax: 0,
           secondWind: 0, vipDrinks: 0, falls: 0, forecastSeen: false,
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
  history: { nw: [], str: [], int: [], cha: [], karma: [] } /* one point per morning to day 120, then weekly (§15) */,
  achievements: {},  // id -> day unlocked (this run)
  flags: {},         // includes flags.dead = 'loan' during a Hardcore default night
  over: false, result: null,
}
```

`week(s) = floor((s.clock.day - 1) / 7)`. Every weekly limit (Open Mic, the party, McHolland's tip,
bank robbery, one tour per city) compares against `week(s)`; `weekly.*` resets when the index
changes (night step 9).

### 6.2 The action pipeline

```js
SR.preview(id, params) → Preview      // pure; never mutates; used by every ActionRow, every frame the card is dirty
SR.act(id, params)     → Result       // mutates SR.state through rules, emits events
SR.rules.act.preview(state, id, params, ctx) / SR.rules.act.run(state, id, params, ctx)  // the pure forms
```

`ctx = { rng: SR.rng.rules, now: state.clock.min, source: 'ui'|'sim'|'debug' }`.

**Preview** `{ ok, reason, vars, cost: { cash, min, hp, items: {} }, gains: [{ kind, key, n, min,
max, capped }], chance: null | 0..1, badges: ['wed-half-price', ...], hotkey, repeatable, screen,
hidden }`. An action whose `feature` flag is off previews as `{ hidden: true }`; cards, the Bag,
the Pocket and dialogs drop hidden rows.

**Result** `{ ok, id, reason?, vars?, deltas: [Delta], msgs: [{ key, vars }], toasts: [...],
stamps: [...], sfx: [...], open: null | { minigame, skin, params, resolve: '<id>:resolve' },
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
  priceTarget: 'food.mcsticks',                // which price modifiers apply (§6.10; default = the action id)
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
where `targets` are dotted globs (`food.mcsticks`, `item.pawn.*`) and `when` is a condition list.
Order: (1) markups and surcharges on the base (`markup` ×, then `add` +); (2) **fixed** prices:
take the minimum of the price and every applicable fixed price; (3) **percent** discounts: only the
single largest applies; (4) round half up to whole dollars, minimum $0. A modifier with
`consume: true` (the flyer coupon) is used up only if it is the one applied.

**Checks:** `SR.rules.check.chance(stat, D, { s, checkId })` applies the rows of
`tuning.checkMods` (B-28b) whose `checks` glob matches `checkId` and whose `when` holds: first `dD`
rows (summed into D, D ≥ 1), then `add` rows (summed onto the probability), then the clamp to
0.05..0.95; a row with `always: true` returns 1. Every check in the game has a `checkId`
(`holdup.store.str`, `police.talk`, `enc.mugger.fight`, ...; the list is in B-28b).

## 7. Data-driven content

Every kind registers through `SR.def.<kind>(id, def)`. `SR.boot` indexes them and validates
cross-references (priority 20, headless); `tools/validate.cjs` runs the same validation in Node.
**Every def with `p ≥ 1` carries `feature: '<flag>'`** (BUILD_PLAN Appendix B); cards, previews,
the Bag, the Pocket, dialogs and encounter seeding filter on `SR.features`.

| Kind | File(s) | Key fields |
|---|---|---|
| `tuning` | `data/tuning.js` | the BALANCE tables (`SR.def.tuning({...})`, read as `SR.tuning`) |
| `features` | `data/features.js` | `SR.def.features({ weather: false, hustles: false, ... })`, read as `SR.features`; the only switch for P1 / P2 behaviour |
| `fn` | any rules or data file | `SR.def.fn('bank.deposit', (s, params, ctx) => Result)` |
| `worldmap` | `data/worldmap.js` | §8.1 |
| `building` | `data/buildings/<id>.js` | `id, name (text key place.<id>), owner, portrait, music, interior, greetings[], groups[], exteriorId, modes?` (home: `live`, `owned`, `forSale`) |
| `action` | `data/buildings/*.js`, `data/actions/*.js` | §6.3 |
| `subscreen` | `ui/subscreens/*.js` | §7.1 |
| `item` | `data/items.js` | `id, name, icon, price, stack, use?, give?, category, p, feature?` |
| `job` | `data/jobs.js` | B-05 rows |
| `home`, `furniture` | `data/homes.js`, `data/furniture.js` | B-08 rows + interior draw ids + `door` (the worldmap door id of a home) |
| `stock` | `data/stocks.js` | B-10 rows |
| `city` | `data/cities.js` | B-12 rows + sky island art params (palette keys `city.<id>.*`, never hex) |
| `fighter` | `data/fighters.js` | `n, name, palette ('fighter.<n>'), accessory, quirk, taunts[], hp?, p?` |
| `decree` | `data/decrees.js` | `id, path ('any'|'president'|'dictator'), once (bool), effects, night? (nightly effects), p, feature` |
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
- **Frozen ids** (owner file): `bank.deposit`, `bank.withdraw`, `bank.loan`, `bank.rates`,
  `bank.cds` (P1) (`subscreens/bank.js`); `bank.realestate` with `params.homeId` to focus a property
  (`realestate.js`); `nli.jobs` (`jobs.js`); `home.stocks` (`stocks.js`), `home.tv` (`tv.js`),
  `home.messages` (`messages.js`); `furniture.browse` (`furniture.js`); `pawn.shop` with Buy / Sell
  tabs (`shop.js`); `uofs.transcript` (P1) (`transcript.js`); `cityhall.campaign` (`campaign.js`);
  `bus.board` (`bus.js`); `cityhall.mayor` (P1) (`mayor.js`); `casino.vip` (P1) (`vip.js`).

### 7.2 Text

`SR.text(key, vars)` returns the string with `{name}` style substitution; an array value picks a
variant with the fx RNG unless `vars.variant` is given. Formatting helpers: `SR.text.money(n)`,
`SR.text.time(min)`, `SR.text.num(n)`. Missing keys render `⟦key⟧` and log once. Length limits per
slot (GDD §6.11) are enforced by the validator via key prefixes (`act.` ≤ 28, `bark.` ≤ 60,
`toast.` ≤ 80, `greet.` ≤ 140, `vm.` ≤ 280, `card.` ≤ 400, `news.` ≤ 220).

**Every package that registers content owns a text file for its keys** (§19): wave 1 has
`en-ui.js` (W1-D), `en-econ.js` (W1-E: items, jobs, homes, furniture, stocks, ranks, report line
keys), `en-conflict.js` (W1-C: cities, fighters, decrees, crime and trip outcome keys),
`en-prog.js` (W1-R: perks and reasons; W3-Prog adds achievements, the Advisor and the perk card)
and `en-world.js` (W1-W: place names `place.<id>`, door tags, world action toasts). The validator
also has a `--wave N` mode: a missing key whose prefix belongs to a file that is still a stub
(prefix map in `tools/validate.cjs`) is a warning instead of an error.

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
- **Prompt:** the ContextPrompt "[E] Enter McSticks" shows within 96 u (the Interact range); from
  96 to 160 u only a plain name tag shows.

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

`SR.scenes.building` draws `SR.art.interior(id)`: `drawStatic(ctx, state)` into a cached
1280 × 720 layer (redrawn on resize or a state change such as new furniture) and
`drawAnim(ctx, t, state, actors)` every frame. The composition keeps x 0-760 for the scene and
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
  action is refused, a modal, dialog, stamp queue or minigame opens, or the key is released. It
  can be disabled (`settings.game.holdRepeat`). R does nothing in the city.
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

## 12. Audio

- `js/audio/engine.js`: an `AudioContext` created on the first user activation (a key, click or
  tap; §11). Graph: sources → bus gains (`music`, `sfx`, `ambience`, `ui`, `voice`) → master →
  `DynamicsCompressor` (threshold -14 dB, ratio 3) → destination. One shared white-noise buffer (2 s)
  made at unlock. Suspended while the tab is hidden (§3).
- `js/audio/synth.js`: voices from oscillators, noise, biquads and ADSR gains; Karplus-Strong pluck
  (noise burst into a delay line); FM keys; pool of 24 voices with oldest-low-priority stealing.
- `js/audio/sfx.js`: `SR.def.sfx(name, recipe)`; recipes are data (ART_AUDIO §13.8).
- `js/audio/music.js`: a tracker: 25 ms timer schedules 120 ms ahead on `currentTime`. Songs are
  data (`SR.def.song(id, {...})`, ART_AUDIO §13.8). Cross-fade 1.2 s; duck 6 dB under dialogs,
  voicemails and stingers. The engine can render any song or sfx into an `OfflineAudioContext`
  (`SR.audio.renderOffline(kind, id, seconds)` → `AudioBuffer`) for the objective audio tests
  (§18).
- `js/audio/ambience.js`: city bed, rain, wind (driven by edge distance), casino murmur, bar
  chatter, fryer, birds and crickets by hour.
- **API:** `SR.audio.sfx(name, { x, y, gain, pitch })`, `SR.audio.music(id, { fade, variant })`,
  `SR.audio.stinger(id)`, `SR.audio.ambience(id, level)`, `SR.audio.setVolume(bus, v)`,
  `SR.audio.duck(db, ms)`, `SR.audio.caption(textKey, dir)` (emits `caption` for UI),
  `SR.audio.renderOffline(kind, id, seconds)`.
- Spatial: `StereoPannerNode` by screen-x offset; gain = 1/(1 + d/400) within 900 u.

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

## 14. Randomness

`js/core/rng.js`: sfc32 generators with 4 × 32-bit state.

| Stream | Seed | Saved | Used by |
|---|---|---|---|
| `SR.rng.rules` | `state.seed` | yes (`state.rng.rules`) | every rule, every outcome that touches state, minigame outcomes |
| `SR.rng.world` | hash(seed, day) at each morning | no | traffic, pedestrians, cosmetic world placement |
| `SR.rng.fx` | `Math.random()` at boot | no | particles, text variants, jitter |

API per stream: `int(a, b)` inclusive, `float()`, `pick(arr)`, `chance(p)`, `weighted(pairs)`,
`state()`, `setState(s)`. A test greps `js/rules` and `js/data` for `Math.random` and fails on any hit.

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
- Each migration has a fixture test (`tests/node/save.test.cjs`, fixtures in `tests/fixtures/`).

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
| Memory | ≤ 160 MB in total: chunks 40 × 1 MB = 40 MB; building sprites 12 Mpx = 48 MB; props, actors and neon ≤ 8 MB; one interior static layer ≤ 15 MB (2560 × 1440 max); two stage canvases ≤ 30 MB; sky, clouds and minimap ≤ 6 MB; JS heap ≤ 30 MB. Touch-compact profile (phones, iOS Safari's canvas cap): chunks 20, sprites 6 Mpx, maxDpr 1.5 → ≤ 100 MB |
| Boot | ≤ 1.5 s from `file://` to the boot screen; the title city bakes progressively |
| Script size | ≤ 1.8 MB of JS in total, no binary assets |
| Audio | ≤ 24 voices; rendering cost ≤ 3 % of real time; music scheduled 120 ms ahead |
| Save | serialise + write ≤ 20 ms |

**How it is checked.** Headless CI containers have no GPU (software raster) and noisy CPUs, so CI
never asserts absolute frame rates:
1. **CPU work budgets:** `tests/perf/perf.cjs` runs the scripted 60 s tour (§18) and reads
   `SR.loop.perf` (update and render CPU time, draw counts). Budgets are scaled by a **calibration
   factor**: at start the runner times a fixed JS workload (`tests/perf/calibrate.js`, ≈ 20 ms on
   the reference machine) and multiplies every CPU budget by `measured / reference` (clamped
   0.5-4). Draw-count budgets are absolute.
2. **Relative gate:** the p95 update and render times are compared with
   `tests/perf/baseline.json` (recorded by the lead at each wave integration on the same machine
   fingerprint); a regression of more than 20 % fails. A different fingerprint only warns.
3. **Memory:** the render caches report their device-pixel totals (`SR.render.stats()`), asserted
   against the budgets above at 1920 × 1080, DPR 1 and 2, every zoom.
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
| E2E | `tests/e2e/*.test.cjs` via `tests/harness.cjs` | boot with zero console errors; new-game flow; walking, collisions, doors (every door, the dwell and re-arm rules); falls (-10 HP, respawn inside, no time); a scripted car hit; skate / car speed ratios; click-to-walk; every building's actions (generated per action: cost, effect, refusal when short of time or cash); every sub-screen mounts, refreshes and unmounts; sleep → report → next day; HP 0 → hospital / death; save / load / export / import round trips (clipboard and textarea fallback); letterbox at 1280×720, 1920×1080, 1366×768, 2560×1080, 800×1280, and the touch-compact layout at 844×390; text crispness at 1366×768 (§2); keyboard-only, mocked-gamepad and touch navigation through title → city → building → pocket; a touch drag scrolls a long card body |
| Audio (objective) | `tests/e2e/audio.test.cjs` | for every song (one full order + 1 bar) and every sfx, `SR.audio.renderOffline` at 44.1 kHz: peak ≤ -10 dBFS for songs and ≤ -6 dBFS for sfx; song RMS in [-30, -16] dBFS; no NaN, no denormals (0 < |x| < 1e-30); max first difference ≤ 0.25 (no clicks) and, at the loop seam of two consecutive loops, ≤ 0.05; sfx start and end within 5 ms at |x| < 0.01; every pattern's step count = bars × meter × stepsPerBeat; every `order` entry exists; the leitmotif's interval sequence (0, +4, +7, +9, +7 semitones) is found at every `motif` annotation of the songs ART_AUDIO §13.3 lists. Ear review is an optional user step |
| Visual regression | `tests/visual/visual.cjs` | 16 fixed scenes (seeded, fixed time and weather, preset High); read back the canvas, downsample in-page to 64 × 36 average colours, compare to `tests/visual/goldens/*.json` (per-cell tolerance 12 / 255); failures dump PNGs to `tests/visual/out/` |
| Contact sheets | `tests/sheets/*.html` | art, icons, components, exteriors, interiors, actors, minigames, sound test; each opens from disk; reviewers screenshot them |
| Performance | `tests/perf/perf.cjs` | a scripted 60 s city tour at 1920 × 1080, DPR 1 and 2, noon and night-in-rain, crowd and traffic full, preset pinned (High, then Low with ×4 CPU throttle via CDP); asserts the CPU work, draw-count and memory budgets with the calibration factor and the relative gate of §17 |
| Balance | `tests/balance/sim.cjs` | BALANCE B-23 bots × policies × 20 seeds; prints CSV and asserts bands |
| Accessibility | `tests/e2e/a11y.test.cjs`, `tests/node/tokens.test.cjs` | tab through every building card, pocket tab and menu (focus order, visible ring, ARIA names); computed-style contrast audit ≥ 4.5:1 for text; the token test parses `css/tokens.css` and asserts every `-ink` / `-100` pair, white on `--primary-600` and `--danger`, and `--ink-500` on `--paper-0/1/2` are ≥ 4.5:1 |

**Harness** (`tests/harness.cjs`): `open({ width, height, dpr, touch })`, `newGame(opts)`,
`set(patch)`, `state()`, `act(id, params)`, `preview(id, params)`, `enter(buildingId)`,
`goto(sceneId, params)`, `step(frames)`, `press(action)`, `hold(action, frames)`,
`clickUI(dataId)`, `uiText()`, `teleport(x, y)`, `setTime(min)`, `seed(n)`, `mg(result)` (forces
the next minigame's result), `quality(preset)` (default High), `shot(file)`, `pixels(x, y, w, h)`,
`perf()`, `errors()`, `close()`. The clock is paused; tests step it.

## 19. File list and ownership

Owners are the work packages of BUILD_PLAN (Wn-X) that **create** each file. A later wave may
reassign a file (BUILD_PLAN §5 lists every wave-3 and wave-4 reassignment and is authoritative);
within a wave exactly one package owns each file.

```
stick-rpg-remaster/
  index.html                          W1-K   every script tag, #app/#stage/#world/#fx/#ui/#aria
  .gitignore                          W1-K   shots/, tests/visual/out/, tests/perf/out/
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
  js/data/text/en-ui.js               W1-D   UI chrome, HUD, settings, generic reasons (W2-Front in wave 2)
  js/data/text/en-econ.js             W1-E        items, jobs, homes, furniture, stocks, ranks, report line keys (W3-Econ in wave 3)
  js/data/text/en-conflict.js         W1-C        cities, fighters, decrees, crime and trip outcomes (W3-Crime in wave 3)
  js/data/text/en-prog.js             W1-R        perks, reasons (W3-Prog in wave 3: achievements, Advisor, perk card)
  js/data/text/en-world.js            W1-W        place names, door tags, world toasts, Pilot Ori (W2-City in wave 2)
  js/data/text/en-home.js             W2-Home     home, TV shows, messages UI, report lines
  js/data/text/en-news.js             W2-Home     Daily Fold headlines, TV news stories
  js/data/text/en-food.js             W2-Food     McSticks, Five-O
  js/data/text/en-goods.js            W2-Goods    pawn, Fine Line
  js/data/text/en-money.js            W2-Money    bank, NLI, shift events
  js/data/text/en-civic.js            W2-Civic    U of S, City Hall, campaign, rivals
  js/data/text/en-night.js            W2-Night    Sticky's, casino, fighters' taunts
  js/data/text/en-transit.js          W2-Transit  bus, trips, cities, jail, hospital
  js/data/text/en-street.js           W2-Street   Harold, Skid, Red, junker, voicemails of the original's beats
  js/data/text/en-city.js             W2-City     barks, Pilot Ori, car-hit voicemails, door tags
  js/data/text/en-front.js            W2-Front    title, intro, new game, results headlines
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
  tests/node/<module>.test.cjs        the module's owner
  tests/node/invariants.test.cjs      W1-W
  tests/node/tokens.test.cjs          W1-D
  tests/e2e/stage.test.cjs            W1-K
  tests/e2e/audio.test.cjs            W1-S (W2-Music adds its songs)
  tests/node/shuffle.test.cjs         W1-Q
  tests/e2e/<area>.test.cjs           the area's owner
  tests/e2e/shuffle.test.cjs, a11y.test.cjs   W1-Q
  tests/visual/visual.cjs + goldens   W1-Q (goldens refreshed by W4-Visual)
  tests/perf/perf.cjs, calibrate.js, baseline.json   W1-Q (baseline recorded by the lead)
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
  `'karma.good.3'`, `'fighter.7'`); the karma bands live in `palette.js` and tuning only computes the
  band index. The validator's rule is exact: colour literals appear only in `js/art/palette.js`
  and `css/tokens.css` (§18).
- Every public function has a one-line JSDoc comment with its types.
- Error handling: user-visible failures become toasts; programmer errors throw in debug and are
  logged once in release.
