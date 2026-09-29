# Paper Sky: Contract

The frozen public surface of the game, delivered by W1-K at milestone M0 (BUILD_PLAN §3.1). It is
generated from ARCHITECTURE.md (the design of record) and pins down every name that more than one
package touches: the namespace, the registration kinds, the action pipeline's shapes, the rule
events, the sub-screen contract and ids, the scenes, the input actions and context maps, the
minigame and audio formats, and the test entry points.

- **Changes** go through the requests protocol (BUILD_PLAN §1.3): write `docs/requests/<package>.md`
  with the exact change; the lead applies it here and in ARCHITECTURE at integration.
- **Precedence.** Where this document records a decision (§21), it refines ARCHITECTURE until the
  lead folds the decision back into ARCHITECTURE. Everything else here restates ARCHITECTURE.
- **Status tags.** *(M0)* is implemented and tested now; *(M1)* is frozen here and implemented by
  W1-K by the end of wave 1; a package name in brackets marks the owner of a name.
- **Wave-1 integration.** The lead folded D1-D60 (§21) into ARCHITECTURE, UI, GDD, BALANCE and
  ART_AUDIO, and recorded the additive public names the wave-1 packages reported (§8.9, §8.10,
  §13.1, §14.4, §15.1-§15.5, §18.1; the same lists stand in ARCHITECTURE). Nothing frozen was
  renamed. The decisions of each request are in `docs/requests/decisions-w1-*.md`.

Contents: §1 files and the load-time rule · §2 the SR namespace · §3 registries and boot ·
§4 kernel status · §5 SR.util · §6 SR.rng · §7 SR.text and text keys · §8 the rules layer ·
§9 events · §10 sub-screens · §11 scenes · §12 input · §13 minigames · §14 audio ·
§15 world, render, art and UI names · §16 saves and settings · §17 debug API and the e2e harness ·
§18 the Node loader · §19 feature flags · §20 loop, stage and quality · §21 decisions.

## 1. Files, load order and the load-time rule

- **One global, `window.SR`.** Every file is one IIFE:
  `(function () { 'use strict'; var SR = window.SR; ... })();` (ARCHITECTURE §21).
- **Header.** Every file starts with a comment naming its path, its owner package and its purpose:
  `// js/data/buildings/mcsticks.js — owner: W2-Food. McSticks: building, actions, ...`.
- **Stubs.** Every `js/**` and `css/**` file of ARCHITECTURE §19 exists from M0 (D1). A stub is the
  header plus `(function () { 'use strict'; /* stub, owner: W2-Food */ })();` and registers
  nothing. Its owner replaces the whole file (header kept, purpose updated). A file is a stub while
  it still carries the `/* stub, owner: … */` marker; `tools/validate.cjs --wave N` detects stubs by
  that marker, so an owner removes it with the first real content.
- **Working before a dependency lands (D27).** A shipped file never defines, or supplies a fallback
  for, a name another file owns (not even `SR.act = SR.act || …`): under shuffled loading it would
  overwrite the real one or be overwritten. Until a dependency lands, a package fakes it only in
  its own tests and contact sheets, installed after the scripts load and before `SR.boot`. Shipped
  code that calls a module which may still be a stub checks that it exists first (`if
  (SR.rules.arcs) …`). This is required for the wave-3 modules that wave-1 code calls
  (`SR.rules.arcs`, `encounters`, `achievements`, `advisor`) and for the kernel's M1 modules
  (`SR.loop`, `SR.stage`, `SR.quality`, `SR.input`, `SR.save`, `SR.settings`).
- **`index.html`** (lead only) lists every script in this group order: boot → core → rules → data →
  world → render → art → ui → minigames → audio → scenes → main, and within a group in the order
  of ARCHITECTURE §19. `tests/node/load.cjs` reads the order from `index.html`, so it is the one
  list of scripts. The page has exactly these DOM ids: `#app` > `#stage` > `canvas#world`,
  `canvas#fx`, `div#ui`, `div#aria` (`role="status" aria-live="polite"`), in that order.
- **Load-time rule.** At load time a file may only define functions, call `SR.def.*`,
  `SR.scenes.register`, `SR.minigame.register`, `SR.onBoot`, and assign its own API object
  (`SR.world.traffic = {...}`). It never calls another module or reads another registry at load
  time; that goes into an `SR.onBoot` hook. Only `js/boot/*` (first) and `js/main.js` (last) depend
  on their position; the shuffled-load tests load everything else in random order.
- **Namespace objects are extended, never replaced** (D2). `js/boot/namespace.js` creates `SR.rules`,
  `SR.world`, `SR.render`, `SR.art`, `SR.ui`, `SR.audio`, `SR.scenes` and `SR.minigame`. A module
  adds its members (`SR.rules.bank = {...}`, `Object.assign(SR.minigame, { run })`); assigning a new
  object to one of these eight names breaks other files' registrations.
- **Pure files** (`js/boot/*`, `js/core/rng.js`, `js/core/text.js`, `js/rules/*`, `js/data/**`) never
  touch `document`, browser APIs on `window` (only `window.SR`), canvas, audio or `Math.random`.
  **Node-loadable registration files** (`js/art/palette.js`, `icons.js`, `interiors/*.js`,
  `exteriors-detail.js`, `props.js`, `logos.js`, `js/minigames/skins/*.js`, `js/audio/sfx.js`,
  `js/audio/songs/*.js`, `js/ui/subscreens/*.js`) touch no DOM, canvas, audio or browser API at load
  time; drawing and DOM building happen only inside functions called later.
- **DOM attributes:** `data-id` on every UI element tests address; `data-nav` on focusable
  elements for spatial navigation (UI §6); `data-scene="<id>"` on each scene's UI root (D13).
- **Style:** ARCHITECTURE §21. Colour literals only in `js/art/palette.js` and `css/tokens.css`.

## 2. The SR namespace

| Name | Type | Owner (file) | Notes |
|---|---|---|---|
| `SR.VERSION`, `SR.W`, `SR.H`, `SR.STEP` | `'0.1.0'`, 1280, 720, 1/60 | W1-K (`boot/namespace.js`) | *(M0)* |
| `SR.def.<kind>` | registration functions | W1-K (`boot/namespace.js`) | §3 *(M0)* |
| `SR.reg.<kind>[id]` | registered defs | W1-K | §3 *(M0)* |
| `SR.registry` | registry inspection | W1-K | §3.4 *(M0)* |
| `SR.onBoot(prio, fn, opts)`, `SR.boot(opts)`, `SR.booted` | boot | W1-K | §3.5 *(M0)* |
| `SR.util` | helpers | W1-K (`boot/util.js`) | §5 *(M0)* |
| `SR.events` | event bus | W1-K (`boot/events.js`) | §9 *(M0)* |
| `SR.rng` | random streams | W1-K (`core/rng.js`) | §6 *(M0)* |
| `SR.text` | text lookup and formatting | W1-K (`core/text.js`) | §7 *(M0)* |
| `SR.scenes` | scene stack | W1-K (`core/scenes.js`) | §11 *(M0 core; M1 transitions)* |
| `SR.debug` | test and debug API | W1-K (`core/debug.js`) | §17 *(M0 subset; M1 rest)* |
| `SR.loop`, `SR.stage`, `SR.quality` | loop, stage, presets | W1-K | §20 *(M1)* |
| `SR.input` | input actions | W1-K (`core/input.js`) | §12 *(M1)* |
| `SR.save`, `SR.settings` | saves, settings | W1-K | §16 *(M1)* |
| `SR.state` | the live game state (`null` outside a game) | W1-R schema | §8.8 |
| `SR.tuning` | BALANCE tables (`= SR.reg.tuning`) | W1-R (`data/tuning.js`) | §3.2 |
| `SR.features` | feature flags (`= SR.reg.features`) | W1-K (`data/features.js`) | §19 |
| `SR.rules.<module>` | pure rule modules | W1-R, W1-E, W1-C, W3 | §8.6 |
| `SR.act(id, params)`, `SR.preview(id, params)` | the action pipeline | W1-R (`rules/act.js`) | §8 |
| `SR.world`, `SR.render`, `SR.art`, `SR.ui`, `SR.minigame`, `SR.audio` | module namespaces | §15 | |

## 3. Registries and boot

### 3.1 Registration kinds

Every content kind registers through `SR.def.<kind>`; ids are non-empty strings (numbers are
converted), `snake_case` for content and dotted for actions, fns and text keys.

| Kind | Call | Stored as | File(s) | Key fields |
|---|---|---|---|---|
| `tuning` | `SR.def.tuning({ time: {...}, start: {...} })` | `SR.tuning.<table>` | `data/tuning.js` | the BALANCE tables, keyed as BALANCE names them |
| `features` | `SR.def.features({ weather: false, ... })` | `SR.features.<flag>` (boolean) | `data/features.js` | §19 |
| `fn` | `SR.def.fn('bank.deposit', fn)` | `SR.reg.fn[name]` (a function) | any rules or data file | §8.5 |
| `worldmap` | `SR.def.worldmap({...})` | `SR.reg.worldmap.main` | `data/worldmap.js` | ARCHITECTURE §8.1 |
| `building` | `SR.def.building(id, def)` | `SR.reg.building[id]` | `data/buildings/<id>.js` | `id, name (place.<id>), owner, portrait, music, interior, greetings[], groups[], exteriorId, modes?` |
| `action` | `SR.def.action(id, def)` | `SR.reg.action[id]` | `data/buildings/*.js`, `data/actions/*.js` | §8.2 |
| `subscreen` | `SR.def.subscreen(id, def)` | `SR.reg.subscreen[id]` | `ui/subscreens/*.js` | §10 |
| `item` | `SR.def.item(id, def)` | `SR.reg.item[id]` | `data/items.js` | `id, name, icon, price, stack, use?, give?, category, p, feature?` |
| `job` | `SR.def.job(id, def)` | | `data/jobs.js` | BALANCE B-05 rows |
| `home`, `furniture` | `SR.def.home(id, def)`, `SR.def.furniture(id, def)` | | `data/homes.js`, `data/furniture.js` | B-08 rows + interior draw ids + `door` |
| `stock` | `SR.def.stock(ticker, def)` | | `data/stocks.js` | B-10 rows |
| `city` | `SR.def.city(id, def)` | | `data/cities.js` | B-12 rows + sky island art params (palette keys `city.<id>.*`) |
| `fighter` | `SR.def.fighter(id, def)` | | `data/fighters.js` | `n, name, palette ('fighter.<n>'), accessory, quirk, taunts[], hp?, p?` |
| `decree` | `SR.def.decree(id, def)` | | `data/decrees.js` | `id, path ('any'\|'president'\|'dictator'), once, effects, night?, p, feature` |
| `rank`, `perk`, `achievement` | `SR.def.rank/perk/achievement(id, def)` | | `data/ranks.js`, `data/perks.js`, `data/achievements.js` | GDD tables |
| `encounter` | `SR.def.encounter(id, def)` | | `data/encounters.js` | `id, weight, cap, when, where, conditions, choices: [{label, preview, effects}]` |
| `arc` | `SR.def.arc(npc, def)` | | `data/arcs.js` | `npc, stages: {id: {on: '<event>', match: {...}, cond, effects, next}}` (§9.1) |
| `event` | `SR.def.event(id, def)` | | `data/events.js` | `{kind, id, text, choices}` |
| `person` | `SR.def.person(id, def)` | | `data/people.js` | `id, name, look, voice, schedule: [[weekdays, from, to, placeId, cond?]], barks` |
| `contact` | `SR.def.contact(id, def)` | | `data/actions/phone.js` | `id, name, unlock: [conds], actions: [actionIds], p, feature` |
| `skin` | `SR.def.skin(id, def)` | | `minigames/skins/*.js` | `engine, params, art, text, auto` (§13) |
| `song`, `sfx` | `SR.def.song(id, def)`, `SR.def.sfx(name, recipe)` | | `audio/songs/*.js`, `audio/sfx.js` | §14 |
| `text` | `SR.def.text({ key: 'string' \| ['variants'] })` | `SR.reg.text[key]` | `data/text/en-*.js` only | §7 |
| `interior` | `SR.def.interior(id, def)` | | `art/interiors/<id>.js` | ART_AUDIO §9 (palette keys) |
| `exterior` | `SR.def.exterior(id, { detail(ctx, geom, state), signature: [rects] })` | | `art/exteriors-detail.js` | ARCHITECTURE §9.3 |
| `icon` | `SR.def.icon(name, draw(ctx, size, state))` | a function (or an object) | `art/icons.js` | ART_AUDIO §10 |
| `scene` | `SR.scenes.register(id, def)` | `SR.reg.scene[id]` | scene and overlay files | §11 (D2) |
| `minigame` | `SR.minigame.register(id, def)` | `SR.reg.minigame[id]` | `minigames/*.js` | §13 (D2) |

`SR.def.scene` and `SR.def.minigame` exist (they are the same functions) but the spelling of record
is `SR.scenes.register` / `SR.minigame.register`.

### 3.2 Semantics (D3-D6)

- **Id kinds** store `SR.reg.<kind>[id] = def`. An object def gets `def.id = id` if it has no `id`;
  a def whose `id` differs from the registered id is an error. `fn` defs must be functions; `icon`
  defs are functions or objects; every other id kind takes a plain object.
- **Map kinds** (`tuning`, `features`, `text`) take one object; each key is an id. So two files may
  not define the same tuning table, flag or text key. `SR.tuning` and `SR.features` *are*
  `SR.reg.tuning` and `SR.reg.features`. Feature values must be booleans; text values strings or
  non-empty arrays of strings. Tuning tables are stored as given (no `id` added).
- **Single kind** `worldmap`: `SR.def.worldmap(def)` stores `SR.reg.worldmap.main`.
- **The file of every registration is recorded** (from the call stack; D4).
- **Errors** (duplicate id, bad id, bad def) are collected during loading and **thrown by
  `SR.boot` with both file names**, e.g. `item "gun": duplicate id (first in js/data/items.js,
  again in js/data/buildings/pawn.js)`. The first registration is kept.
- **After boot** (tests, sheets) a new id registers normally; a duplicate throws at once.

### 3.3 Why scenes and engines are registration kinds

ARCHITECTURE spells scene and engine registration `SR.scenes.register` / `SR.minigame.register`, but
under the load-time rule and shuffled loading a scene file may run before `js/core/scenes.js`.
Both functions therefore live in `js/boot/namespace.js` and store into the kinds `scene` and
`minigame`; `js/core/scenes.js` and `js/minigames/framework.js` read those registries (D2).

### 3.4 `SR.registry` *(M0)*

| Member | Returns |
|---|---|
| `SR.registry.kinds` | the 32 kind names (§3.1) |
| `SR.registry.entries(kind)` | `[{ id, def, file }]` in registration order |
| `SR.registry.file(kind, id)` | the root-relative file that registered it (`'js/data/items.js'`; `'?'` when the call came from outside `js/`), `undefined` for an unregistered id |
| `SR.registry.errors()` | `[{ kind, id, message, files }]` collected so far |
| `SR.registry.hooks()` | `[{ prio, headless, file }]` in run order |
| `SR.registry.fileFromStack(stack)` | the parser behind `file` (tests only) |

### 3.5 Boot *(M0)*

- `SR.onBoot(prio, fn, { headless })`: `fn(opts)` runs at boot. Priorities: **10** core, **20** data
  validation and indexing, **30** world build, **40** render caches, **50** UI mount, **60** audio,
  **90** first scene. Ties run in registration (load) order. `{ headless: true }` marks a Node-safe
  hook. Calling `onBoot` after boot started throws.
- `SR.boot(opts)` → `{ hooks, headless }`: throws the registration errors (§3.2); runs the hooks by
  priority (`opts.headless`: only headless hooks); a failing hook throws
  `SR.boot: hook (prio 20, js/rules/act.js) failed: <message>` (the original error is `cause`);
  sets `SR.booted = true`; then, unless headless, `SR.scenes.go(scene, opts.sceneParams)` where
  `scene` is `opts.scene` or `'boot'` when omitted; `opts.scene: false` starts no scene (contact
  sheets). A second call throws.
- `js/main.js` calls `SR.boot()` on `DOMContentLoaded`; Node calls `SR.boot({ headless: true })`
  through `tests/node/load.cjs`.
- **Priority 20 (D28).** A data hook indexes and checks its own module's registrations (for example
  `act.js` may index actions per building and check condition and effect names). Cross-reference
  validation, "every id reference resolves" (icons, sfx, songs, skins, sub-screens, text keys, fns,
  palette keys), is `tools/validate.cjs` (W1-Q), which loads mode `all`. A boot hook never throws
  because an id of another kind is missing: mode `rules` does not load the registration files of
  mode `all`, and during a wave many referenced files are still stubs. It may warn once
  (`SR.util.warnOnce`).

### 3.6 Tuning tables

`SR.tuning` has the tables that BALANCE's headings name, and those names are frozen: `time` (B-01),
`start`, `training`, `karma`, `jobs`, `items`, `sleep`, `homes`, `furniture`, `bank`, `stocks`,
`crime`, `bus`, `fight`, `casino`, `world`, `difficulty`, `election`, `endgame`, `weather`,
`calendar`, `encounters`, `perks`, `traffic`, `crowd`, `street`, `park`, `civic`, `priceMods`,
`checkMods`, `news`, `duel`, `health` (B-31). W1-R names the fields inside each table in
`js/data/tuning.js`. The fields ARCHITECTURE already names are frozen: `time.repeatHoldMs`,
`start.hpMaxBase`, `news.weights` and `news.minWeight`; at the wave-1 integration also the
`tuning.world` fields other packages read (`surfaceDrive.cap`, `park.range`, `door.trigger.offset`,
`camera.lookAhead`, `projection.k`, `fall.total`, `fall.skipAfter`, `carHit.knockdown`; W1-W request
2) and the tuning names BALANCE now records (D55). The karma colour bands of B-04c are palette
entries (§15), not tuning; `tuning.karma` holds only the band-index formula. Engine and
presentation limits are named constants in their files, not tuning (D49).

## 4. Kernel status at M0

| File | M0 | M1 |
|---|---|---|
| `js/boot/namespace.js`, `util.js`, `events.js` | complete | |
| `js/core/rng.js`, `text.js` | complete | |
| `js/core/scenes.js` | stack, overlays, queue, dispatch, fallback `boot` / `title` stubs | transitions (§11.4) |
| `js/core/debug.js` | `seed`, `feature`, `goto`, `ui` | the rest of §17.1, `#debug`, `#artbible` |
| `js/main.js`, `js/data/features.js`, `index.html`, `.gitignore` | complete | |
| `js/core/loop.js`, `stage.js`, `quality.js`, `input.js`, `save.js`, `settings.js` | stubs | ARCHITECTURE §2-§3, §11, §15-§16 |
| `tests/node/load.cjs`, `tests/harness.cjs` | complete | |
| `tests/node/core.test.cjs`, `tests/e2e/boot.test.cjs` | M0 parts | save, migration, input, stage, slice suites |

**M1 status (W1-K-M1).** `loop.js`, `stage.js`, `quality.js`, `input.js`, `save.js`, `settings.js`
and the rest of `debug.js` (§17.1, `#debug`, `#artbible`) are implemented, with the M1 additions to
`tests/harness.cjs`, the fixtures in `tests/fixtures/`, the M1 part of `tests/node/core.test.cjs` and
`tests/e2e/{boot,stage,input,save,slice}.test.cjs` (the slice runs the steps whose modules have
landed; `--strict` fails on the pending ones). The additions to the frozen names are D33-D42. Scene
transitions (§11.4, `js/core/scenes.js`) were not part of W1-K-M1; the lead added them at the
wave-1 integration (D44).

## 5. `SR.util` *(M0)*

`isObject(v)` (a plain object from any realm) · `clamp(v, lo, hi)` · `lerp(a, b, t)` ·
`invLerp(a, b, v)` · `cubicBezier(x1, y1, x2, y2)` → easing fn · `easeLinear`, `easeIn` (cubic),
`easeOut`, `easeInOut`, `easeSpring` (the UI motion tokens `--ease-out`, `--ease-inout`,
`--ease-spring` as functions of t) · `fmt(str, vars)` (`{name}` substitution; unknown or null vars
stay as `{name}`) · `hash(...args)` → uint32 (FNV-1a over `String(arg)` with a separator per
argument, then fmix32; used for `hash(seed, day)`) · `crc32(str)` → uint32 (IEEE, over UTF-8;
`crc32('123456789') = 0xCBF43926`) · `clone(v)` (deep, JSON-like) · `equal(a, b)` (deep) ·
`deepFill(target, defaults)` (fills fields that are missing or `undefined` with copies of the
defaults, recursing into plain objects present in both; keeps existing values, arrays and unknown
fields; the save migration's deep-fill) · `merge(target, patch)` (deep; objects merge, arrays and
everything else replace; `SR.debug.set`) · `pad(n, width)` · `warnOnce(key, msg)` → boolean.

## 6. `SR.rng` *(M0)*

sfc32 (PractRand: `t = a + b + counter`), 4 × 32-bit state `[a, b, c, d]` (`d` is the counter).

| Stream | Seeded with | Saved | Used by |
|---|---|---|---|
| `SR.rng.rules` | `state.seed` on a new game; restored from `state.rng.rules` on load | yes (`state.rng.rules = SR.rng.rules.state()` before every save) | every rule and every outcome that touches state, minigame outcomes (`ctx.rng`, `host.rng`) |
| `SR.rng.world` | `SR.util.hash(state.seed, day)` each morning: `SR.rng.reseedWorld(seed, day)` (automatic on `day:started`; call it on new game and load) | no | traffic, pedestrians, cosmetic placement |
| `SR.rng.fx` | `Math.random()` at boot (`js/main.js`, prio 10) | no | particles, text variants, jitter, sfx `vary` |

Stream API: `seed(n)` (reseed; integers are used as is, anything else through `SR.util.hash`;
splitmix32 fills a, b, c, the counter starts at 1, 12 draws are discarded) · `next()` → uint32 ·
`float()` → [0, 1), `float(lo, hi)` → [lo, hi) · `int(a, b)` → integer in [a, b], both inclusive ·
`pick(arr)` · `chance(p)` → boolean · `weighted(pairs)` with `pairs = [[value, weight], ...]`
(weights ≤ 0 never win; `null` if none is positive) · `state()` → `[a, b, c, d]` (uint32s, JSON-safe)
· `setState(st)`. **Every call except `state` / `setState` / `seed` consumes exactly one draw**,
whatever its arguments, so sequences stay aligned. `SR.rng.create(seed)` makes an independent
stream (tests, the balance simulator). Defaults before a game: rules 1, world 2, fx 3.
`tests/node/core.test.cjs` holds golden sequences; the algorithm never changes without a save
migration. `js/rules` and `js/data` never contain `Math.random` (a test greps them).

## 7. `SR.text` and text keys *(M0)*

- `SR.text(key, vars)` → string with `{name}` substitution. An array value picks `vars.variant`
  (wrapped modulo the length) or else a draw from `SR.rng.fx`. A missing key renders `⟦key⟧`, is
  logged once with `console.warn` (never `console.error`, so a stub-era key does not fail the
  zero-errors checks) and is listed by `SR.text.missing()`.
- `SR.text.has(key)` · `SR.text.money(n, { sign, cents, compact })` → `$1,240`, `-$20`, `+$20` with
  `sign`, `$12.34` with `cents`, `$1.2M` / `$2.5B` with `compact` from a million up (HUD only);
  rounds half away from zero; never `-$0` · `SR.text.num(n, digits)` → `12,345.6` ·
  `SR.text.time(min, h12)` → `14:30` or `2:30 PM` (1440 reads `24:00`; `h12` defaults to the
  setting `game.clock24 === false`) · `SR.text.dur(min)` → `30m`, `2h`, `1h 30m` (the words "rest of
  day" are a text key) · `SR.text.pct(p, digits)` → `62 %`.
- **Keys are registered only in `js/data/text/en-*.js`**, each owned by one package (ARCHITECTURE
  §7.2, §19; D16). **Length limits** by prefix: `act.` ≤ 28, `bark.` ≤ 60, `toast.` ≤ 80,
  `greet.` ≤ 140, `news.` ≤ 220, `vm.` ≤ 280, `card.` ≤ 400, `enc.` ≤ 400, `event.` ≤ 400 (GDD
  §6.11's "event and encounter cards ≤ 400"; D51).
- **Key namespaces and owner files** (the validator's `--wave` prefix map in `tools/validate.cjs`
  follows this table; a key's first two segments decide):

| Keys | Owner file (wave-1/2 package) |
|---|---|
| `game.title`, `game.tag`, `ui.*` (incl. `ui.fanNote`), `hud.*`, `set.*` (settings), `key.*` (glyph names), `cap.*` (sound captions), `mg.frame.*` (the minigame frame and the generic engine strings), `mg.shiftrush.*`, `mg.timingring.*`, `mg.duel.*` (the W1-M engines' own strings) | `en-ui.js` (W1-D; W2-Front in wave 2) |
| `reason.*` (every refusal reason: `reason.tooHurt`, `reason.featureOff`, ...), `perk.*`, `toast.act.*` (the pipeline's own toasts, e.g. the forced-charge write-off); in wave 3 `ach.*`, `advisor.*` | `en-prog.js` (W1-R) |
| `item.*`, `job.*`, `home.<tier>`, `furn.*`, `stock.*`, `rank.*`, `report.*` (every morning-report line), `vm.crew.*` (the day-365 call) and `vm.skywatch.*` (weather alerts), both raised by night step 11 | `en-econ.js` (W1-E) |
| `city.*`, `fighter.*`, `decree.*`, `crime.*`, `trip.*` (outcomes) | `en-conflict.js` (W1-C) |
| `place.*`, `door.*` (door tags and modes), `ori.*` (Pilot Ori), `act.world.*`, `desc.world.*`, `toast.world.*` | `en-world.js` (W1-W; W2-City in wave 2) |
| `toast.<module>.*`, `stamp.<module>.*` raised by a rule module that is not a building (a stat gain, a promotion, a hospital bill) (D27) | the module owner's file: `stats`, `perks`, `time` en-prog (W1-R); `jobs`, `training`, `night`, `health`, `homes`, `stocks` en-econ (W1-E); `crime`, `trade`, `fight`, `election` en-conflict (W1-C). `bank` and `casino` are building ids, so their keys follow the next row |
| `<prefix>.<building>.*` for `act`, `desc`, `greet`, `toast`, `stamp`, `card`, and `sub.<subscreenId>` | the building's file: `home` en-home; `mcsticks`, `store` en-food; `pawn`, `furniture` en-goods; `bank`, `nli` en-money; `uofs`, `cityhall` en-civic; `bar`, `casino` en-night; `bus`, `trip`, `jail`, `hospital` en-transit; `street`, `harold`, `kid`, `dealer`, `junker` en-street; `park` en-park |
| `mg.<engine or skin>.*` (titles, labels) | the engine's or skin's owner: `fight`, `darts`, `slots`, `blackjack`, `roulette` en-night; `scratch`, `orderup`, `holdup` en-food; `sortit`, `pitch`, `boardroom` en-money; `debate` en-civic; `hotwire` en-street; `interview`, `interrogation` en-events; `tourhook` en-transit |
| `act.bag.*`, `act.phone.*`, `desc.bag.*`, `desc.phone.*`, `contact.*`, `pocket.*` | `en-pocket.js` (W2-Pocket; D16) |
| `news.*`, `tv.*` | `en-news.js`, `en-home.js` (W2-Home) |
| `bark.ped.*`, `vm.carhit.*` | `en-city.js` (W2-City) |
| `vm.<npc>.*`, `bark.<npc>.*` | the NPC's file: `harold`, `kid`, `skid`, `dealer`, `red`, `newguy`, `junker`, `mcholland` en-street; `mel`, `dee` en-food; `vinnie`, `sofia` en-goods; `penny`, `bea`, `gil`, `frankie`, `terry` en-money; `quill`, `plume`, `board`, `doodle`, `crayon` en-civic; `sticky`, `lou` en-night; `tabby` en-transit; `crease`, `margin`, `preacher` en-park; `ori` en-world |
| `front.*` (title menu, new game, intro, results) | `en-front.js` (W2-Front) |
| `enc.*`, `arc.*`, `event.*` | `en-events.js` (W3-Life) |
| `taunt.<fighter>.*` | `en-night.js` (W2-Night) |

## 8. The rules layer

### 8.1 Entry points

```js
SR.preview(id, params) → Preview    // pure; never mutates
SR.act(id, params, opts) → Result   // mutates SR.state through rules, then emits (§8.7); opts.source (§8.9)
SR.rules.act.preview(state, id, params, ctx) / SR.rules.act.run(state, id, params, ctx)   // pure forms
SR.rules.act.price(s, base, target, ctx) → { price, applied: [modIds], consumes }        // ARCHITECTURE §6.10
ctx = { rng: SR.rng.rules, now: state.clock.min, source: 'ui' | 'sim' | 'debug' }
```

Pipeline of `run` (ARCHITECTURE §6.2): look up → feature flag (off → refused, `reason.featureOff`)
→ `requires` in order (first failure is the reason) → time rule (`timeFits` unless `timeRule`) →
price (§6.10) and cash → cost (cash, time, HP, items) → `effects` in order → each rule event to
`SR.rules.arcs.onEvent` → `stats.hp ≤ 0` → `SR.rules.health.down` → deltas → Result.
**Hard money rule:** cash, bank and item counts never go below 0; forced charges go through
`SR.rules.bank.charge(s, n, reason)` → `{ paid, writtenOff }`.

### 8.2 Action definition

Ids are `<building>.<verb>` (`mcsticks.fries`); minigame resolutions are `<id>:resolve`
(`store.rob:resolve`, `timeRule: 'free'`, never shown as rows, `params` = the minigame result).

| Field | Meaning |
|---|---|
| `building` | a building id, or an owner `world`, `bag`, `phone`, `jail`, `trip`, `hospital`, `street:<npc>`, `park:<spot>`, `enc:<encounterId>` |
| `group` | `eat`, `buy`, `work`, `train`, `services`, `crime`, `special` (the card shows them in this order) |
| `order`, `icon`, `label` (text key `act.*`), `desc` (text key `desc.*`, optional), `hotkey` | row presentation |
| `p` | priority tag 0 / 1 / 2 (GDD §0) |
| `feature` | the Appendix B flag; **required on every def with `p ≥ 1`** (validated) |
| `cost` | `{ cash, min, hp, items: { key: n } }`; a string value is computed by the named fn of that name (`min: 'shift.min'`) |
| `priceTarget` | which price modifiers apply (default: the action id) |
| `requires` | condition list (§8.4) |
| `effects` | effect list (§8.4) |
| `variants` | e.g. `['full', 'half', 'overtime']`: a segmented control; the choice arrives as `params.variant` |
| `minigame` | `{ skin, auto }`: the row opens a minigame (Hustle button) |
| `screen`, `screenParams` | the row opens a sub-screen (§10) instead of running; no cost chips |
| `timeRule` | `'robbery'` \| `'trip'` \| `'free'` (instead of `timeFits`) |
| `repeatable` | R and hold-to-repeat; **only** on defs without `confirm`, `minigame`, `screen` or an irreversible effect (crime, loans, fights, property, election) — validated |
| `confirm` | text key: the UI asks first |
| `hidden` | condition list: when it holds, the row is hidden instead of disabled |
| `silent` | no feedback (`world.enter`) |

**HP costs:** every voluntary action with an HP cost `c` (in `cost.hp`, or a guaranteed or possible
`hurt`, worst case) requires `['hpAbove', c]` (reason `reason.tooHurt`). Involuntary damage is
exempt.

### 8.3 Preview, Result, Delta

```js
Preview = { ok, reason /* text key or null */, vars, cost: { cash, min, hp, items: {} },
            gains: [{ kind, key, n, min, max, capped }], chance: null | 0..1,
            badges: ['wed-half-price', ...], hotkey, repeatable, screen, hidden }
// feature off or `hidden` conditions hold → { hidden: true } (rows are dropped)

Result = { ok, id, reason?, vars?, deltas: [Delta], msgs: [{ key, vars }],
           toasts: [{ key, vars, kind }], stamps: [{ key, vars }], sfx: [name], anims: [name],
           achievements: [id], open: null | { minigame, skin, params, resolve: '<id>:resolve' },
           events: [{ name, payload }], log: [{ kind, weight, vars }], down: null | Down,
           jailed: null | { reason, days }, over: null | { reason } }

Delta = { kind: 'cash'|'bank'|'hp'|'hpMax'|'time'|'stat'|'karma'|'heat'|'buzz'|'item'|'job'|'home'|'furniture'|'lien',
          key?, n, from, to }
```

- `reason` values are text keys (`reason.<name>`); the UI shows `SR.text(reason, vars)` (D15).
- `gains[].kind` uses the Delta kinds; `n` is the typical amount, `min` / `max` a range, `capped`
  marks "(full)" / "(max)".
- Toast `kind`: `info`, `reward`, `warning`, `achievement` (UI §2.3).
- `anims` (from the `anim` effect) and `achievements` (ids unlocked by the `achievement` effect) are
  refinements (D14).

### 8.4 Conditions and effects

Lists of arrays: `requires: [['hpBelowMax'], ['cashAtLeast', 12]]`, `effects: [['heal', 20],
['emit', 'eat', { item: 'fries' }]]`. Each condition returns `{ ok, reason, vars }`.

**Conditions** (`js/rules/conditions.js`): `timeFits`, `cashAtLeast(n)`, `hpBelowMax`, `hpAbove(n)`,
`stat(key, min)`, `statBelow(key, max)`, `karma(min, max)`, `item(key, min)`, `noItem(key)`,
`flag(key)`, `notFlag(key)`, `feature(flag)`, `job(id)`, `jobTrack(track)`, `jobAtLeast(id)`,
`homeTier(min)`, `livesIn(id)`, `owns(homeId)`, `furniture(id, minTier)`, `freeSlots(n)`,
`weekday(list)`, `timeBetween(a, b)` (start allowed when `a ≤ now < b`), `weather(list)`,
`heat(min, max)`, `buzzBelow(n)`, `dailyBelow(key, n)`, `weeklyBelow(key, n)`, `npcStage(npc, stage)`,
`election(status)`, `perk(id)`, `difficulty(list)`, `phone`, `cityEvent(id)`, `not(cond)`,
`any(list)`, `all(list)`, `fn(name, ...args)`.

**Effects** (`js/rules/effects.js`): `cash(n, src)`, `bank(n, src)`, `charge(n, reason)`, `heal(n)`,
`hurt(n, cause)`, `stat(key, n)`, `karma(n)`, `heat(n)`, `buzz(n)`, `item(key, n)`, `flag(key, v)`,
`time(min)`, `setTime(min)`, `daily(key, n)`, `weekly(key, n)`, `record(key, n)`, `msg(key, vars)`,
`toast(key, vars)`, `stamp(key, vars)`, `sfx(name)`, `anim(name)`, `achievement(id)`,
`npcStage(npc, stage)`, `open(skin, params)`, `emit(name, payload)`, `log(kind, vars)`,
`jail(reason)`, `check(checkId, stat, D, winEffects, loseEffects)`, `chance(p, aEffects, bEffects)`,
`fn(name, ...args)`. Income sources that pass through the lien: `wage`, `rent`, `salary`,
`interest`, `deal`, `tour`, `loot`, `win`, `prize`. HP-0 causes: `fall`, `carHit`, `carCrash`,
`fight`, `mugger`, `goons`, `other`.

**`open(skin, params)` (D29).** Its first argument is a skin id (`holdup`, `hotwire`, `orderup`) or,
for an engine without skins, the engine id (`fight`, `darts`, `slots`, `blackjack`, `roulette`,
`scratch`). Rules never look skins up (skins load only in mode `all`), so the effect copies that
name into both fields: `Result.open = { minigame: name, skin: name, params, resolve: '<action
id>:resolve' }`. `SR.minigame.run` resolves it (§13).

### 8.5 Named functions (D15)

`SR.def.fn('<area>.<verb>', function (s, params, ctx, ...args) {...})`. Data names them in
`['fn', name, ...args]` (condition or effect) or as a string cost field. The return value depends on
the use: as a **condition** `{ ok, reason?, vars? }`; as an **effect** a partial Result whose
fields are appended to the action's Result (`deltas`, `msgs`, `toasts`, `stamps`, `sfx`, `anims`,
`achievements`, `events`, `log`) or set (`open`, `down`, `jailed`, `over`), or nothing; as a **cost**
a number. Named fns are pure like the rest of the rules layer.

### 8.6 Rule modules (pure; `s` is the state)

| Module (owner) | Public functions |
|---|---|
| `SR.rules.state` (W1-R) | `create(opts)`, `defaults()` |
| `SR.rules.act` (W1-R) | `run`, `preview`, `price` (§8.1) |
| `SR.rules.check` (W1-R) | `chance(stat, D, { s, checkId })` → 0.05..0.95, `roll(rng, p)` |
| `SR.rules.time` (W1-R) | `canStart(s, min)`, `spend(s, min)`, `setTo(s, min)`, `weekday(s)`, `week(s)`, `isMarketDay(day)`, `fmt(min, h12)` |
| `SR.rules.stats` (W1-R) | `add(s, key, n, src)` → applied, `karma(s, n)`, `heat(s, n)`, `buzz(s, n)`, `heal(s, n)`, `hurt(s, n, cause)`, `band(k)`, `tier(k)`, `winded(s)` |
| `SR.rules.log` (W1-R) | `add(s, kind, vars)`, `roll(s)` |
| `SR.rules.perks` (W1-R) | `offers(s)`, `choose(s, id)`, `has(s, id)` |
| `SR.rules.jobs` (W1-E) | `bestTitle(s)`, `canApply(s, track)`, `promotion(s, track)` → `{ok, next, missing}`, `promote(s, track)`, `work(s, track, variant, m)`, `wage(s, id)`, `creditLimit(s)` |
| `SR.rules.training` (W1-E) | `apply(s, id)`, `graduate(s, track)`, `seminarOk(s, track)` |
| `SR.rules.night` (W1-E) | `run(s, ctx, { kind: 'sleep'\|'jail'\|'hospital' })` → Report |
| `SR.rules.health` (W1-E) | `down(s, cause, ctx)` → Down, `bill(s)` |
| `SR.rules.news` (W1-E) | `headline(s)` → `{ key, vars }`, `tvStory(s, rng)` |
| `SR.rules.bank` (W1-E) | `deposit`, `withdraw`, `charge(s, n, reason)`, `loan(s, n)`, `repay`, `openCd`, `breakCd`, `interest(s)`, `rateStep(s)`, `loanNight(s)`, `default(s)` |
| `SR.rules.stocks` (W1-E) | `tick(s, facts)`, `drawTip(s, rng)`, `reliability(s)`, `buy(s, t, n)`, `sell(s, t, n)`, `cap(s, t)`, `value(s)`, `reverseSplit(s, t)` |
| `SR.rules.homes` (W1-E) | `buy(s, id)`, `sell`, `moveIn`, `letOut`, `endLet`, `slotsUsed(s)`, `slots(s)`, `buyFurniture(s, id)`, `upgrade(s, id)`, `sleepBonus(s)`, `doorHomes(doorId)` |
| `SR.rules.calendar` (W1-E) | `today(s)`, `rollWeather(s, rng)`, `cityEvent(s)`, `rollCityEvent(s, rng)` |
| `SR.rules.endgame` (W1-E) | `netWorth(s)`, `rank(s)`, `legacy(s)`, `results(s, reason)`, `hofBucket(length)` |
| `SR.rules.crime` (W1-C) | `robPrecheck(s, target)`, `holdupParams(s, target)`, `robResolve(s, target, beats)`, `jail(s, reason)`, `jailDay(s, choice)`, `bail(s)`, `payBail(s)`, `fine(s, points)`, `policeTalk(s)`, `policeBribe(s)`, `policeRun(s)` |
| `SR.rules.trade` (W1-C) | `canBoard(s, kind, cityId)`, `trip(s, cityId)` → Trip, `take(s, trip)`, `haggle(s, trip)`, `tour(s, cityId, hookResult)`, `rollDemand(s)` |
| `SR.rules.fight` (W1-C) | `create(s, kind, n)` → Fight, `playerMove(f, move)`, `endTurn(f)`, `enemyTurn(f)`, `autoPlay(s, f, rng)`, `finish(s, f, choice)` |
| `SR.rules.casino` (W1-C) | `slots.spin(rng, bet)`, `slots.rtp()`, `bj.*` (shoe, deal, hit, stand, double, split, dealer, settle, counts, `suspicion(s, bet, trueCount)`, `basic(hand, up)`), `roulette.spin(rng)`, `roulette.settle(bets, pocket)`, `scratch(rng)`, `darts.score(dx, dy)`, `darts.wobble(t, params)`, `darts.autoThrows(s, params, rng)`, `vip(s)` |
| `SR.rules.election` (W1-C) | `nominationCheck(s)`, `accept(s, chest)`, `campaign(s, actionId)`, `debate(s, beats)`, `electionNight(s, rng)`, `officeMorning(s)`, `decreeOffer(s, rng)`, `decree(s, id)` |
| `SR.rules.encounters` (W3-Life) | `seed(s, rng)`, `active(s, now)`, `resolve(s, id, choice)` |
| `SR.rules.arcs` (W3-Life) | `onEvent(s, ev, ctx)` → effects |
| `SR.rules.achievements` (W3-Prog) | `evaluate(s, ev, profile)` → ids |
| `SR.rules.advisor` (W3-Prog) | `goals(s)` → up to 3 `{ key, vars, progress }` |

### 8.7 What `SR.act` emits (D14)

After `run`, `SR.act` emits on `SR.events`, in this order: (1) every `Result.events` entry under its
own name (the rule events of §9.1); (2) UI events derived from the deltas: `time:advanced`,
`stat:changed` (str, int, cha, hp, hpMax), `karma:changed`, `money:changed` (cash, bank),
`heat:changed`, `buzz:changed`, `item:changed`, `job:changed`, `home:changed`; (3)
`msg:received` per new message, `achievement:unlocked` per `Result.achievements` id,
`player:down` when `down` is set; (4) **`action:done { id, result }` last** (the Hardcore ironman
write listens to it). The report scene re-emits a night Report's `events` the same way.

### 8.8 Down, Report and the state

```js
Down = { outcome: 'secondWind' | 'hospital' | 'death', cause, bill, writtenOff, report /* hospital night */ }

Report = { kind: 'sleep'|'jail'|'hospital', day /* the new day */, endedDay, weekday /* of the new day */,
  lines: [{ section: 'overnight'|'money'|'markets'|'weather'|'today'|'jail'|'hospital'|'election',
            icon, key, vars, weight }],
  headline: { key, vars }, weather: { today }, election: null | { won, poll, roll, path },
  events: [{ name, payload }], ended: null | 'time', dead: null | 'loan' }
```

**State schema v1** is ARCHITECTURE §6.1, verbatim and frozen (owner W1-R, `js/rules/state.js`).
The wave-1 integration added fields to v1 (D43; deep-fill gives older saves their defaults, so the
version stays 1): `trade.offer`, `fight.open`, `casino.match`, `crime.open` (the "in progress"
records, `null` when nothing is open), `daily.shifts` (0), `history` points as `[day, value]`
pairs seeded with day 1 by `create()`, and the flags `flags.foldDone` (the Theory of the Fold
finished; W3-Park sets it, the MET THE ARTIST banner reads it) and `flags.carHitVm` (a car hit
today: night step 11 queues the ambulance-chaser voicemail and clears it).
Top-level keys: `v, seed, rng, mode, clock, player, stats, money, job, edu, perks, items, homes,
furniture, stocks, tip, trade, fight, casino, crime, daily, weekly, npc, election, world, jail,
pending, msgs, log, journal, records, history, achievements, flags, over, result`.
`week(s) = floor((s.clock.day - 1) / 7)`. Invariant: `stats.hpMax === tuning.start.hpMaxBase + stats.str`.

### 8.9 Additive rule names (wave-1 integration)

Nothing frozen changes; an optional trailing `rng` / `ctx` is added where a rule draws.

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

### 8.10 How building data calls the conflict rules

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

## 9. Events

`SR.events.on(name, fn)` → unsubscribe function; `fn(payload, name)`; `'*'` receives every event ·
`off(name, fn)` (also removes a `once` listener by its function) · `once(name, fn)` → unsubscribe ·
`emit(name, payload)` → number of listeners called · `count(name)` · `errors` (the last 50 listener
errors). Synchronous and re-entrant; listeners run in subscription order, then `'*'`; a listener
removed during an emit is skipped, one added is not called; a throwing listener is caught, logged
with `console.error` and kept in `errors` (D12). *(M0)*

### 9.1 Rule events (frozen)

Raised only through `Result.events` / `Report.events` (`['emit', name, payload]` or named fns) and
re-emitted on the bus under the same name. Arcs match them with `on: '<name>'` and a `match` object
compared field by field.

| Event | Payload | Raised by |
|---|---|---|
| `enter` | `{ building }` | `world.enter` |
| `talk` | `{ npc }` | `street.<npc>.talk` |
| `gift` | `{ npc, item, n }` (`item`: `cash`, `booze`, `takeout`, `shirt`, `smokes`, `gum`) | street gift actions |
| `buy` | `{ item, n, where, price }` | every purchase |
| `sell` | `{ item, n, where, price }` | pawn sell, home sell, stock sell |
| `eat` | `{ item, hp, where }` | food, takeout, leftovers |
| `shift` | `{ track, rank, variant, m, pay }` | work |
| `train` | `{ id, stat, n }` | training, TV, jail workouts |
| `promote` / `graduate` | `{ track, from, to }` / `{ track }` | jobs, U of S |
| `night` | `{ day, weekday, kind }` | `night.run` (after the day advanced) |
| `trip` | `{ city, kind: 'smuggle'\|'tour', outcome: 'sold'\|'mugged'\|'busted'\|'screwed'\|'noBuyers'\|'wasted'\|'walked'\|'toured', units, cash }` | `trip.*` |
| `rob` | `{ target: 'store'\|'bank', outcome: 'win'\|'lose', loot }` | robbery resolve |
| `jail` / `release` | `{ reason, days }` / `{ reason, bailed }` | `crime.jail`, jail days, bail |
| `fight` | `{ kind: 'bar'\|'ring'\|'goons', n, outcome: 'win'\|'lose'\|'run' }` | fight resolve |
| `gamble` | `{ game, bet, net }` | casino, scratch, darts matches |
| `fall` | `{ count, x, y }` | `world.fall` |
| `carHit` / `carCrash` | `{ count }` / `{}` | `world.carHit`, `world.carCrash` |
| `down` | `{ cause, outcome }` | `health.down` |
| `loan` | `{ kind: 'take'\|'repay'\|'default', amount }` | bank |
| `home` | `{ kind: 'buy'\|'sell'\|'moveIn'\|'let'\|'endLet', id }` | homes |
| `election` | `{ status, poll }` | election rules |
| `decree` | `{ id }` | Mayor's Office |
| `encounter` | `{ id, choice, outcome }` | encounters |
| `scrap` | `{ n }` | Theory of the Fold pickups |
| `stat` | `{ key, n, total }` | `stats.add` (perks, achievements; not shown) |

Payload extras (additive fields, §8.9): `trip` adds `key`, `vars`, `mugged`; `gamble` adds the
round's facts. Night gains (nightly furniture, Mandatory Hats) raise `stat` into `Report.events`
through `stats.add(s, key, n, src, report)`.

### 9.2 UI events

| Event | Payload | Emitted by |
|---|---|---|
| `action:done` | `{ id, result }` | `SR.act` (last) |
| `time:advanced` | `{ from, to, reason }` | `SR.act` |
| `day:started` | `{ day, report }` | the report scene (W2-Home) after a night |
| `stat:changed` | `{ key, from, to, delta }` (str, int, cha, hp, hpMax) | `SR.act` |
| `karma:changed` | `{ from, to }` | `SR.act` |
| `money:changed` | `{ cash, bank, delta, reason }` | `SR.act` |
| `heat:changed`, `buzz:changed` | `{ from, to }` | `SR.act` |
| `item:changed` | `{ key, from, to }` | `SR.act` |
| `job:changed` | `{ track, from, to }` | `SR.act` |
| `home:changed` | `{ living, owned }` | `SR.act` |
| `door:entered` / `door:exited` | `{ id, min }` / `{ id, spentMin }` | the building scene (W1-D) |
| `player:down` | `{ cause, outcome, down }` | `SR.act`; the hospital scene (W2-Transit) queues the scene |
| `minigame:done` | `{ id, skin, result }` | the minigame scene (W1-M) |
| `msg:received` | `{ id, from }` | `SR.act`, the report scene |
| `achievement:unlocked` | `{ id }` | `SR.act`; W3-Prog's evaluator |
| `perk:offered` / `perk:chosen` | `{ stat, level, options }` / `{ id }` | W1-R / W3-Prog |
| `weather:changed` | `{ from, to }` | W3-Light |
| `npc:stage` | `{ npc, from, to }` | W3-Life |
| `election:changed` | `{ status, poll }` | W1-C via `SR.act` |
| `game:over` | `{ reason: 'time'\|'death'\|'retire', result }` | `SR.act` / the report scene; `js/scenes/results.js` queues the results |
| `save:written` | `{ slot }` | `SR.save` (W1-K) |
| `settings:changed` | `{ key, value }` | `SR.settings` (W1-K) |
| `input:device` | `{ device }` | `SR.input` (W1-K) |
| `caption` | `{ key, dir }` | `SR.audio.caption` (W1-S) |
| `stage:resized` | `{ k, uiK, dpr, scale, compact }` | `SR.stage` (W1-K; D22) |
| `quality:changed` | `{ preset, auto }` | `SR.quality` (W1-K; D22) |
| `save:loaded` | `{ slot }` (`null` for a state object) | `SR.save.load` (W1-K; D34) |
| `save:broken` | `{ slot, reason, key }` (the UI says "This save couldn't be read") | `SR.save` quarantine (W1-K; D34) |
| `input:pad` | `{ connected, id }` (gamepad hot-plug) | `SR.input` (W1-K; D33) |
| `debug:changed` | `{ flag, on }` (`grid`, `time`, `projected`) | `SR.debug` (W1-K; D39) |

## 10. Sub-screens

```js
SR.def.subscreen('bank.deposit', {
  title: 'sub.bank.deposit',          // breadcrumb text key
  p: 0, feature: undefined,           // feature required when p ≥ 1
  mount(root, ctx) {},                // build DOM into root (the host clears root on unmount)
  refresh(ctx) {},                    // after every ctx.act, a clock or money change, and when a child pops
  unmount() {},                       // remove listeners and timers
  back(ctx) { return true; },         // optional: false vetoes Back (the host then asks to confirm)
  onAction(action, ev, ctx) {},       // optional: input actions not consumed by focus navigation
});
ctx = { state /* read-only view */, params, building /* host building id or null */, host: 'card' | 'pocket',
        preview(id, p) → Preview, act(id, p) → Result, push(subscreenId, params), pop(result),
        replace(subscreenId, params), close(), text, ui /* SR.ui components */ }
```

- A row whose action has `screen` opens the sub-screen instead of running; its preview still
  evaluates `requires` (it can be disabled with a reason) and shows no cost chips.
- A sub-screen never mutates state: it calls `ctx.preview` for live chips and `ctx.act` to commit;
  the host plays the Result's feedback, calls `refresh`, and handles `open` / `down` / `jailed`.
- **Host API** (W1-D, `js/ui/card.js`): `SR.ui.card.open(buildingId, { params, screen,
  screenParams })`, `SR.ui.card.push(id, params)`, `pop(result)`, `replace(id, params)`,
  `refresh()`; `SR.ui.subhost.create(root, { onClose })` (the Pocket uses it).

**Frozen ids:**

| Id | P (flag) | File | Package |
|---|---|---|---|
| `bank.deposit`, `bank.withdraw`, `bank.loan`, `bank.rates` | P0 | `ui/subscreens/bank.js` | W2-Money |
| `bank.cds` | P1 (`homesPlus`) | `ui/subscreens/bank.js` | W2-Money |
| `bank.realestate` (`params.homeId` focuses a property) | P0; sell and let P1 (`homesPlus`) | `ui/subscreens/realestate.js` | W2-Money |
| `nli.jobs` | P0 | `ui/subscreens/jobs.js` | W2-Money |
| `home.stocks` | P0; the tip P1 (`stockTips`) | `ui/subscreens/stocks.js` | W2-Home |
| `home.tv` | P0 | `ui/subscreens/tv.js` | W2-Home |
| `home.messages` | P0 | `ui/subscreens/messages.js` | W2-Home |
| `furniture.browse` | P0 | `ui/subscreens/furniture.js` | W2-Goods |
| `pawn.shop` (Buy / Sell tabs) | P0; Sell P1 (`shopsPlus`) | `ui/subscreens/shop.js` | W2-Goods |
| `uofs.transcript` | P1 (`degrees`) | `ui/subscreens/transcript.js` | W2-Civic |
| `cityhall.campaign` | P0 | `ui/subscreens/campaign.js` | W2-Civic |
| `bus.board` | P0; demand, reputation and tours P1 (`tours`) | `ui/subscreens/bus.js` | W2-Transit |
| `cityhall.mayor` | P1 (`civicPlus`) | `ui/subscreens/mayor.js` | W3-Crime |
| `casino.vip` | P1 (`nightlife`) | `ui/subscreens/vip.js` | W3-Nightlife |

Test sub-screens use ids under `test.*` (never shipped).

## 11. Scenes

### 11.1 API *(M0)*

`SR.scenes.register(id, def)` (load-time safe) · `go(id, params, opts)` (replace the whole stack;
→ `Promise` resolved when its transition ends, §11.4) ·
`push(id, params)` → Promise resolved by `pop(result)` (or with `undefined` if `go` removes the
scene) · `pop(result)` · `replace(id, params, opts)` (a pending push promise carries over) ·
`queue(id, params, opts)` (the deferred change of ARCHITECTURE §5: `go` as soon as the top is a base
scene; a later call replaces a pending one) · `top()` → `{ id, def, params } | null` · `stack()` →
ids bottom to top · `get(id)` → def · `update(dt)`, `render(ctx, alpha)`, `dispatch(action, ev)`
(called by the loop and input). Scene changes requested while one runs (from `enter`, `exit`,
`pop`) run right after it, in order.

### 11.2 Scene def

```js
{ kind: 'base' | 'overlay',            // default 'base'
  enter(params), exit(), pause(), resume(), update(dt), render(ctx, alpha),
  onAction(action, ev),                 // presses (and key repeats) of input actions, top scene only
  ui: { mount(root, params), unmount() },   // root = <div data-scene="<id>"> appended to #ui by the kernel
  blocksUpdate, blocksRender, music }   // update stops below a blocksUpdate scene; render starts at the topmost blocksRender scene
```

Lifecycle order: `go` exits the stack top down (`ui.unmount`, then `exit`), then `enter(params)`,
`ui.mount(root, params)`, `SR.audio.music(music)`. `push` calls `pause()` on the scene below;
`pop` calls `resume()` on it after the popped scene exits.

**Overlay stacking** (wave-1 integration). Scene roots are positioned (`css/base.css`) but form no
stacking context, so an overlay's content competes by z-index with the scenes below it: the city
HUD (`--z-hud`) and the building card (`--z-card`) paint over an overlay that sets none. An overlay
that covers them gives its root the class `modal-root` (`--z-modal`: `confirm`, `report`) or
`dialog-root` (`--z-overlay`: `dialog`), or gives its own frame a z-index of at least
`var(--z-overlay)` (the minigame frame). Wave-2 overlays (`pocket`, `pause`, `settings`,
`saveload`) do the same.

### 11.3 Scene ids

| Id | Kind | Registered in | Package |
|---|---|---|---|
| `boot`, `title`, `newgame`, `intro`, `results` | base | `js/scenes/<id>.js` | W2-Front |
| `city` | base | `js/scenes/city.js` | W2-City |
| `building` (`params = { id, params, screen?, screenParams? }`) | base | `js/scenes/building.js` | W1-D |
| `minigame` (`params = { id, skin, params }`) | overlay, blocks update | `js/scenes/minigame.js` | W1-M |
| `report` (`params.report`) | overlay, blocks update | `js/scenes/report.js` | W2-Home |
| `jail`, `hospital`, `death`, `bustrip` | base | `js/scenes/<id>.js` | W2-Transit |
| `halloffame`, `credits`, `profile` | base | `js/ui/screens/<id>.js` | W2-Front |
| `pocket` | overlay | `js/ui/pocket/pocket.js` | W2-Pocket |
| `pause`, `settings`, `saveload` | overlay | `js/ui/screens/<id>.js` | W2-Front |
| `dialog` (keeps the city rendering, frozen) | overlay | `js/ui/dialog.js` | W1-D |
| `confirm` | overlay | `js/ui/modal.js` | W1-D |
| `perk` | overlay | `js/ui/screens/perk.js` | W3-Prog |
| `artbible` (`#artbible`) | base | `js/core/debug.js` (M1; draws `SR.art.bible.draw`) | W1-K (D25) |

Until W2-Front registers `boot` and `title`, the kernel's fallbacks run: `boot` goes straight to
`title`, and `title` shows the stub `[data-id="title-stub"]`. A registered scene always wins.
Deferred changes: `player:down` → `js/scenes/hospital.js`, `jail` → `js/scenes/jail.js`,
`game:over` → `js/scenes/results.js`, each through `SR.scenes.queue`.

### 11.4 Transitions *(M1)*

`SR.scenes.go(id, params, { transition })` and `replace` accept a third argument: `transition` is
`'pageTurn'` (default for `go`; `replace` swaps at once unless a kind is named), `'doorZoom'`,
`'fade'` or `false`; an unknown kind means `pageTurn`. The swap runs inside
`SR.render.fx.transition(kind, swap)` (W1-G) → `Promise` resolved when the transition ends. It
captures the outgoing frame on `#fx`, calls `swap()` exactly once (the kernel changes the stack
there, synchronously, so the stack has changed when `go` returns), then animates the cut (D30).
Reduced Motion turns every transition into `fade`. The change **swaps at once** (no transition, a
resolved Promise) for `{ transition: false }`, while `SR.debug.fast()` is true, for a change
requested while another one runs (from `enter` / `exit`), for the first scene (an empty stack) and
while `SR.render.fx.transition` does not exist. `push`, `pop` and `queue`'s wait never transition;
`queue` passes its options to `go`. Tests pass `false` or call `SR.debug.fast(true)` (D44).

## 12. Input *(M1; the names and bindings are frozen now)*

### 12.1 Actions and default bindings

Bindings are strings: a `KeyboardEvent.code` (`'KeyE'`, `'Enter'`, `'Digit1'`, `'ArrowUp'`),
`'Pad<n>'` (standard-mapping gamepad button n), `'WheelUp'` / `'WheelDown'`, or `'Mouse<n>'`.

| Action | Kind | Keyboard | Gamepad | Touch |
|---|---|---|---|---|
| `up`, `down`, `left`, `right` | digital | `ArrowUp`/`KeyW`, `ArrowDown`/`KeyS`, `ArrowLeft`/`KeyA`, `ArrowRight`/`KeyD` | `Pad12`-`Pad15` (D-pad), left stick past 0.5 | stick |
| `move` | axis `{x, y}` | from `up/down/left/right` | left stick (dead zone 0.2), D-pad | floating stick, left half |
| `interact` | press | `KeyE`, `Enter`, `NumpadEnter`, `Space` | `Pad0` (A) | Action button, tap |
| `confirm` | press | `Enter`, `NumpadEnter`, `Space`, `KeyE` | `Pad0` | tap |
| `back` | press | `Escape`, `Backspace` (`Mouse2` with `rightClickBack`) | `Pad1` (B) | ✕ / ← button |
| `skate` | hold (toggle with `skateToggle`) | `ShiftLeft`, `ShiftRight` | `Pad7` (RT) | Skate toggle |
| `car` | press | `KeyC` | `Pad3` (Y) | Car button |
| `pocket` | press | `Tab` | `Pad8` (Select) | Pocket button |
| `map`, `bag`, `journal` | press | `KeyM`, `KeyI`, `KeyJ` | — | tabs |
| `minimap` | press | `KeyN` | — | minimap button |
| `pause` | press | `Escape` | `Pad9` (Start) | ☰ button |
| `tabPrev`, `tabNext` | press | `KeyQ`, `KeyE` in the `tabs` context only | `Pad4` (LB), `Pad5` (RB) | swipe |
| `row1` … `row9` | press | `Digit1`-`Digit9`, `Numpad1`-`Numpad9` | — | — |
| `repeat` | press | `KeyR` (holding `confirm` repeats too) | holding `Pad0` | long-press |
| `zoomIn`, `zoomOut` | press | `Equal`, `NumpadAdd`, `WheelUp` / `Minus`, `NumpadSubtract`, `WheelDown` | — | pinch |
| `zoomCycle` | press | — | `Pad10` (RS click) | — |
| `minimalHud` | press | `KeyH` | — | — |

A key bound to several actions fires each of them; scenes react to the actions they care about
(Esc is both `back` and `pause`; the top scene decides). Touch buttons in the DOM call
`SR.input.inject(action, down)`.

### 12.2 API

`SR.input.on(action, fn)` → unsubscribe; `fn(ev)` on press, key repeat and release ·
`off(action, fn)` · `held(action)` → boolean · `axis('move')` → `{ x, y }` (length ≤ 1) ·
`bind(action, bindings, context?)` (replaces the bindings; saved in `settings.controls`) ·
`bindings(action, context?)` → strings (for KeyHint glyphs) · `pushContext(name, map, { shadow:
true })` / `popContext(name)` (removes the most recent context of that name) · `inject(action,
down)` (tests, touch buttons) · `typing()` → boolean · `last` = `'kb'|'mouse'|'pad'|'touch'` (emits
`input:device` on change).
**Event:** `ev = { action, down, repeat, device, context /* name or null */, code /* binding or null */ }`.
Scenes receive presses (`down: true`, repeats included) through `onAction(action, ev)` via
`SR.scenes.dispatch`; releases only through `SR.input.on`.

### 12.3 Context maps

A context map is `{ action: [bindings] }`, e.g. the minigame `keys` of §13. While a context is on
top, a binding it lists fires only the context's action (shadowing the global action on that
binding); unbound keys keep their global meaning (`pause` and `back` stay on Esc / B unless the
context rebinds them). Contexts are remappable per context (Settings › Controls). Named contexts:

| Context | Map |
|---|---|
| `tabs` (tabbed screens: Pocket, Settings, Profile) | `tabPrev: ['KeyQ']`, `tabNext: ['KeyE']` |
| `blackjack` | `hit: ['KeyH', 'Pad0']`, `stand: ['KeyS', 'Pad1']`, `double: ['KeyD', 'Pad2']`, `split: ['KeyP', 'Pad3']`, `chip1`-`chip5`: `Digit1`-`Digit5` |
| `roulette` | `clearBets: ['KeyC']`, `spin: ['Space']`, `place: ['Enter']`, `chip1`-`chip4`: `Digit1`-`Digit4` (arrows and the D-pad move the active space; Backspace stays `back`) |
| `fight` | `move1`-`move7`: `Digit1`-`Digit7` |
| `orderup` | `bin1`-`bin6`: `Digit1`-`Digit6`, `serve: ['Enter']` |

Other engines name their contexts after their engine id and list their keys in `keys`. An engine
may name another context (`context`): Shift Rush uses `orderup` for both its skins, so Settings ›
Controls remaps the three W1-M contexts `orderup`, `timingring` and `duel` (§13.1).
**Text entry:** while a TextField, NumberField or any `input` / `textarea` has focus, only
`confirm` (Enter), `back` (Esc) and Tab / Shift+Tab act.

## 13. Minigames

```js
SR.minigame.register('darts', {
  music: 'last_call_shuffle', title: 'mg.darts.title',
  keys: { throw: ['Space'], aimUp: ['ArrowUp'] },          // the context map, pushed by the frame
  create(host, params) { return { update(dt) {}, render(ctx) {}, onAction(a, ev) {}, destroy() {} }; },
  auto(state, params, rng) { return { score: 164 }; },      // a SAMPLED outcome; omitted = no Auto
});
SR.minigame.run(id, params) → Promise<Result>   // params.skin names the skin; pushes the 'minigame' scene
host = { state /* read-only */, rng: SR.rng.rules, fx: SR.rng.fx, ui /* DOM root */, audio, assist,
         device: 'kb'|'pad'|'touch'|'mouse', finish(result), text, aria(text), label(id, text) }
SR.def.skin('orderup', { engine: 'shiftrush', params, art, text, auto })
```

- Engines: `fight`, `darts`, `slots`, `blackjack`, `roulette`, `scratch`, `shiftrush`, `timingring`,
  `duel`. Skins: Shift Rush `orderup`, `sortit`; Timing Ring `pitch`, `hotwire`; Duel `holdup`,
  `boardroom`, `debate`, `interview`, `interrogation`, `tourhook`.
- A building runs a Result's `open` as `SR.minigame.run(open.minigame, Object.assign({ skin:
  open.skin }, open.params))`, then `SR.act(open.resolve, result)` (D18).
- `SR.minigame.run(id, params)` takes an engine id or a skin id (D29). A skin id runs
  `SR.reg.skin[id].engine` with that skin (`params.skin = id`). An engine id runs the engine with
  `params.skin` when that names a skin, else with no skin (so `run('blackjack', { skin: 'blackjack' })`
  from an `open` is fine).
- **Result shapes:** fight `{ outcome: 'win'|'lose'|'run', hpLeft }`; darts `{ score, throws:
  [pts] }`; slots / blackjack / roulette `{ net }`; shiftrush / timingring `{ m, hits, misses }`
  (hotwire `{ started, misses }`); duel `{ beats: [bool], wins, losses, sum? }` (boardroom adds
  `sum`); scratch `{ net }`.
- Auto policies: ARCHITECTURE §10 (a real sample, never the expected value; roulette has none).
- Hardcore: `state.pending = { resolve, worst }` is saved before a stake-bearing minigame opens.

### 13.1 Additive minigame names (wave-1 integration)

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

## 14. Audio

### 14.1 API (W1-S)

`SR.audio.sfx(name, { x, y, gain, pitch })` → handle `{ stop(), set({ gain, pitch, x, y }) }` (D20) ·
`SR.audio.music(id, { fade, variant })` · `SR.audio.stinger(id)` · `SR.audio.ambience(id, level)` ·
`SR.audio.setVolume(bus, v)` · `SR.audio.duck(db, ms)` · `SR.audio.caption(textKey, dir)` (emits
`caption`) · `SR.audio.renderOffline(kind /* 'song'|'sfx' */, id, seconds)` → `Promise<AudioBuffer>`.
`SR.audio.stinger(id)` takes a stinger song id (`'stingers.promotion'`); a bare name
(`'promotion'`) means `stingers.<name>` (§14.2). `SR.audio.validate(kind, def)`: §14.3 (D31).
Buses: `music`, `sfx`, `ambience`, `ui`, `voice` → compressor → makeup trim → master gain →
destination (the Master slider sits after the compressor; D50, §14.4). Caption keys: `cap.horn`,
`cap.siren`, `cap.answering`, `cap.edgeWind`, `cap.thunder`, `cap.knock` (in `en-ui.js`).

### 14.2 Song format (ART_AUDIO §13.8, frozen)

```js
SR.def.song('crossroads_strut', {
  bpm: 104, swing: 0.12,            // 0..0.5: every second 16th is delayed by swing × one 16th
  meter: [4, 4], stepsPerBeat: 4,   // a bar = meter[0] × stepsPerBeat steps
  key: 'E', scale: 'dorian', gain: 0.7,
  inst: {                           // track name → instrument preset and mix
    bass:  { preset: 'slap', gain: 0.8, pan: 0 },
    clav:  { preset: 'clav', gain: 0.45, pan: -0.3 },
    lead:  { preset: 'brass', gain: 0.5, pan: 0.2 },
    drums: { preset: 'kit', gain: 0.7 },
  },
  patterns: {
    intro: { bars: 2, tracks: { drums: 'k . h . s . h . k . h . s . h o | k . h . s . h . k k h . s . h o' } },
    A1: { bars: 2, tracks: {
      bass:  'E2:2 . E2 . G2:2 . A2 . | B2:3 . . A2 G2 . E2:2 . D2 . E2:4 . . . . . . .',
      lead:  'F4:2 . A4:2 . C5:2 . D5:3 . . C5:4 . . . | . . . . . . . . . . . . . . . .',
      drums: 'k . h . s . h . k k h . s . h o | k . h . s . h . k . h . s ! h o',
    } },
  },
  order: ['intro', 'A1', 'A1', 'B1', 'A2'], loopFrom: 1,   // plays order, then loops from index loopFrom
  variants: { rain: { tracks: { drums: { A1: 'k . z . s . z . k . z . s . z z | ...' } }, inst: { lead: { gain: 0.4 } } } },
  motif: [{ pattern: 'A1', track: 'lead', step: 0 }],
});
```

- **Steps:** tokens separated by spaces, one per step; `|` is ignored. Every track string of a
  pattern has exactly `bars × meter[0] × stepsPerBeat` tokens (validated). The example above is
  ART_AUDIO's and is abbreviated: its `drums` tracks have the full 32 tokens, but `bass` (26) and
  `lead` (29) are short and would fail validation, so never use it as a valid fixture.
- **Tokens:** `.` starts nothing (a sounding note continues within its length, otherwise it is a
  rest); `-` explicit note-off; a note `<letter>[#|b]<octave>` (scientific pitch: `C4` = MIDI 60,
  `A4` = 440 Hz); a chord `[C4 E4 G4]`; an optional length `:<steps>` (default 1); an optional
  velocity suffix after the length, `!` 1.0 or `?` 0.4 (default 0.75): `C#4:3!`, `[C4 E4 G4]:4?`.
  A note ends at its length, at `-`, or at the track's next note, whichever comes first (D19).
- **Drum tracks** are tracks whose preset is `kit`; their tokens are `k` kick, `s` snare, `h`
  closed hat, `o` open hat, `c` clap, `b` brush, `r` rim, `z` shaker, `t` tom, with the `!` / `?`
  suffixes and no length.
- **A bare `!` or `?` token** re-triggers the track's previous note, chord or drum hit at accent or
  ghost velocity (the ART_AUDIO example's `s ! h o` is a snare double) (D19).
- Presets: `bass`, `slap`, `lead`, `whistle`, `keys`, `clav`, `pluck`, `pad`, `brass`, `bell`,
  `vibes`, `organ`, `harmonica`, `kit` (ART_AUDIO §13.2). `pan` -1..1; gains 0..1.
- `variants.<name>`: `tracks.<track>.<pattern>` step strings that replace the pattern's track, and
  `inst.<track>` overrides; selected with `SR.audio.music(id, { variant })`.
- **Stingers** are songs with an `order` of one pattern and no `loopFrom`; `js/audio/songs/
  stingers.js` registers `stingers.fall`, `stingers.rescue`, `stingers.jail`, `stingers.flatlined`,
  `stingers.promotion`, `stingers.degree`, `stingers.jackpot`, `stingers.election_win`,
  `stingers.election_loss`, `stingers.stamp` (D21).
- **Song ids** (one file each in `js/audio/songs/`): `paper_sky`, `crossroads_strut`,
  `home_sweet_paper` (W1-S); `streetlights`, `fry_day`, `funky_aisle`, `pawnbroker_blues`,
  `showroom_smooth`, `compound_interest`, `please_hold`, `campus_canon`, `last_call_shuffle`,
  `high_roller_lounge`, `brawl_hall`, `tick_tock_trouble`, `midnight_express`, `hail_to_the_stick`,
  `doing_time`, `waiting_room`, `morning_edition`, `final_edition`, `stingers` (W2-Music).
- `motif` marks the leitmotif (0, +4, +7, +9, +7 semitones) in `paper_sky`, `crossroads_strut`,
  `morning_edition`, `stingers.promotion` and `final_edition`.

### 14.3 SFX recipe format (ART_AUDIO §13.8, frozen)

```js
SR.def.sfx('coin', {
  bus: 'sfx', gain: 0.5, priority: 1, caption: null,       // caption: a cap.* text key
  layers: [
    { osc: 'square', freq: [988, 1319], at: [0, 0.06],       // sequential pitches at these offsets (s)
      env: { a: 0.005, d: 0.05, s: 0, r: 0.02 }, dur: 0.12 },
    { noise: 'white', filter: { type: 'bandpass', freq: 2000, q: 2 },
      env: { a: 0.005, d: 0.04, s: 0, r: 0.01 }, dur: 0.05, start: 0 },
  ],
  vary: { pitch: 0.03, gain: 0.1 },                           // random ± per play (fx stream)
});
```

- Recipe fields: `bus` (`music`|`sfx`|`ambience`|`ui`|`voice`; default `sfx`), `gain`, `priority`
  (0 loops, 1 world one-shots, 2 UI, 3 stamp and stingers), `caption` (text key or `null`),
  `layers`, `vary`, optional `loop: true` (sustains until the handle's `stop()`; D20).
- A layer has **exactly one source** (D20): `osc: 'sine'|'square'|'saw'|'triangle'|'pulse'` (with
  `duty` 0..1 for `pulse`, default 0.5); `noise: 'white'|'pink'`; `pluck: true` (Karplus-Strong);
  `fm: { carrier, ratio, index, indexDecay }` (ART_AUDIO names all four: `carrier` is the carrier's
  waveform, an `osc` type, default `'sine'`; the modulator runs at `ratio × freq`; `indexDecay`: the
  time constant in seconds of the index's exponential decay; omitted = constant). Tonal sources
  (`osc`, `pluck`, `fm`, whose carrier it is) take `freq` (Hz, or a list with `at` offsets in seconds)
  **or** `sweep: [from, to, seconds, 'exp'|'lin']` instead of `freq`.
- Optional `filter: { type /* a BiquadFilterNode type */, freq, q, sweep? }`; `env: { a, d, s, r }`
  in seconds (`s` is the sustain level) with `a ≥ 0.005`; `start` (offset, s); `dur` (gate, s);
  `gain` per layer.
- **The format validator (D31)** is W1-S's `SR.audio.validate(kind, def)` → `string[]` of problems
  (empty when valid), with `kind` `'song'` or `'sfx'`. It is pure and lives in `js/audio/music.js`,
  next to the step-string parser it reuses. W1-S keeps `music.js` free of DOM, audio and browser
  API calls at load time, so `tools/validate.cjs` and `tests/node/music.test.cjs` can load it with
  `load({ mode: 'all', extra: ['js/audio/music.js'] })` and check every `SR.reg.song` and
  `SR.reg.sfx` entry. Objective checks: ARCHITECTURE §18.

### 14.4 Additive audio names and format rules (wave-1 integration)

D19, D20, D21 and D31 are confirmed by W1-S as implemented; nothing in the frozen formats changed.

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

## 15. World, render, art and UI names

| Namespace | Names (owner) |
|---|---|
| `SR.world` (W1-W unless noted) | `update(dt)`; `geometry` (walkable polygon, `edgeDistance(x, y)`, `railedAt(x, y)`, `nearestSafe(x, y, minInside)`, projected rects, porches, the sidewalk graph, the nav grid); `collide.move(body, dx, dy)` → `{ x, y, hit, offGround, surface }`; `nav.path(from, to)` → points; `camera.update(dt)`; `player.update(dt, input)`; `doors.update(dt)`, `doors.resolve(doorId, s)` → `{ scene: 'building', id, params }`; `fall.update(dt)`; `traffic.update(dt)`, `pedestrians.update(dt)` (W2-City); `streetnpcs.update(dt)` (W2-Street); `markers.update(dt)` (W3-Life); `police.update(dt)` (W3-Crime); `weather.update(dt)` (W3-Light). Entity fields: ARCHITECTURE §8.2. World actions (`js/data/actions/world.js`): `world.fall { x, y }`, `world.carHit`, `world.carCrash`, `world.carFished { car }`, `world.enter { building }` |
| `SR.render` (W1-G) | `frame(ctx, alpha)`, `invalidate(what)` (`'building:<id>'`, `'chunks'`, `'sky'`, `'all'`), `stats()`, `fx.transition(kind, swap)` → `Promise` (`pageTurn`, `doorZoom`, `fade`; §11.4), `fx.confetti()`, `fx.jolt()`, `fx.render()` (per frame, D30), `sky.drawWindow(ctx, rect)` |
| `SR.art` (W1-A unless noted) | `palette` (with `.ui`, `.sky`, karma bands `karma.good[i]` / `karma.evil[i]`, `bld.<id>.*`, `int.<id>.*`, `fighter.<n>`, `city.<id>.*`), `paper.grain()`, `draw.{inkStroke, paperFill, tone, roundRect, poly, text, shadow}`, `stick.{draw(ctx, pose, opts), clip(name, t), poses}`, `portraits.draw(ctx, personId, size, mood)`, `vehicles.draw(ctx, type, dir, x, y, opts)`, `icon(ctx, name, x, y, size)`, `iconURL(name, size)`, `logo.draw(ctx, t)`, `bible.draw(ctx)`, `interior(id)` → `{ drawStatic(ctx, state), drawAnim(ctx, t, state, actors) }`; `exterior.build(def, zoom, dpr)` → `{ albedo, windows, neon, bounds }` (W1-G) |
| `SR.ui` (W1-D) | `dom.h`; components `button`, `chip`, `actionRow`, `card`, `speech`, `meter`, `clockRing`, `statChip`, `karmaMedallion`, `toast`, `stamp`, `modal`, `confirm`, `tabs`, `segmented`, `numberField`, `textField`, `slider`, `toggle`, `list`, `keyHint`, `tooltip`, `portrait`, `sparkline`, `lineChart`, `progress`, `badge`, `breadcrumb`, `contextPrompt`; `focus` (scopes, spatial navigation over `[data-nav]`); `hud.{mount, unmount, compact(bool), flush()}` (`flush`: per frame, D30); `card.{open, refresh, push, pop, replace}`; `subhost.create(root, { onClose })`; `dialog.open(opts)` → `Promise<{ choice, n }>` (choices may carry `number: { min, max, step, label }`) |
| `SR.minigame` (W1-M) | `register`, `run` (§13) |
| `SR.audio` (W1-S) | §14.1 |

**Palette keys (D32).** A palette key is the dotted path of an entry of `SR.art.palette`, a numeric
segment indexing an array: `'grass'` → `SR.art.palette.grass`, `'bld.bank.walls'` →
`.bld.bank.walls`, `'int.mcsticks.floorB'`, `'city.gusty.tower'`, `'karma.good.3'` → `.karma.good[3]`,
`'fighter.7'` → `.fighter[7]`. A leaf is a CSS colour string; `.sky` holds the keyframes of
ART_AUDIO §2.2 and `.ui` the canvas mirror of `css/tokens.css`. `palette.js` is Node-loadable, so
`tools/validate.cjs` checks every key that data names by walking this path, and every drawing
module resolves keys the same way.

**The shape of `SR.art.palette`** (D32 says how a key resolves; this is which keys exist).
`palette.sky` is an array of keyframes `{ h, top, horizon, ambient, light }` (`h` and `light` are
the only numeric leaves); `palette.ui` mirrors `css/tokens.css` under the token names without the
leading `--` (`'ui.ink-900'`, `'ui.money-ink'`, plus `white`, `gold`, `newsprint`), with
non-enumerable camelCase aliases (`'ui.ink900'`); the karma bands are `karma.good.0..9` /
`karma.evil.0..9` (B-04c); `fighter.0` is the Ring's masked regulars and `fighter.1..12` the
ladder; every `int.<id>` has the neutral set `wall wallHi wallShade trim floorA floorB counter
accent light` (ids `default home apt apt2 pent mansion castle mcsticks store pawn furniture bank nli
uofs cityhall bar casino bus jail hospital trip news`); every `city.<id>` has `ground base tower
roof accent trim window`; `bld.<id>` has `walls shade roof trim` plus a few named extras
(`skylight`, `plate`, `ivy`, `dome`, `bulb`, `stripe`, `gate`, `moat`, `garden`) and `bld.default`
exists; the other groups are `light` (emissives), `weather`, `stick`, `acc` (accessories), `kit`
(interior materials), `mat` (the bible's five materials), `car`, `prop` (pre-seeded for
`js/art/props.js`), `npc` (ART_AUDIO §2.3) and `fx` (coins, confetti, stamp ink, newsprint).

### 15.1 `SR.world` additive names (wave-1 integration)

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

### 15.2 `SR.render` and the exterior painter

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

### 15.3 `SR.art`

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

### 15.4 `SR.ui`

- **Conventions** (W1-D): every component is a factory taking one options object and returning its
  root element; `id` becomes `data-id`; focusable parts carry `data-nav`; stateful components expose
  `el.update(partialOpts)` (and `el.value` for inputs); chips carry `data-chip="<kind>"`.
- **`SR.ui.dom`** (`js/ui/dom.js`): `h(tag, attrs, ...children)`, `svg`, `clear`, `on`, `t(keyOrText,
  vars)`, `setting(key)`, `token(name)` (a CSS custom property for canvas drawing, following the
  high-contrast and colour-blind swaps), `paint(paletteKey)`, `reduced()`, `fast()`, `uiRoot()`,
  `layer(name)`, `announce(text)` (#aria; messages raised in the same moment are joined into one
  update), `sfx(name, opts)` (guarded), `haptic(ms)`, `icon(name, size)` (an `<img>` from
  `SR.art.iconURL`, or a placeholder square), `now()`, `frame(el)`, `logicalRect(el)`,
  `refuse(el, reason)` (error sound + 120 ms shake + #aria), `applySettings()`, `invalidateTokens()`.
- **Components** (`js/ui/components.js`) besides the frozen list: `iconButton`, `swipe(target, onLeft,
  onRight)`, `STATS`, `button({ hotkey })` (a digit badge before the label), `segmented({ focusHost
  })`, `chip.gains(preview)`, `chip.costs(preview, { state, def })`, `chip.fromDelta(delta)`,
  `chip.text(opts)`, `karmaMedallion.band(k)`, `karmaMedallion.tier(k)`, `keyHint.glyph(code)`,
  `keyHint.refreshAll()`, `tooltip(target, content)` → detach, `tooltip.hide()`.
- **`SR.ui.focus`** (`js/ui/focus.js`): `push(root, { id, initial, restore, autofocus })` → scope,
  `pop(scope)`, `current()`, `focused()`, `first()`, `focus(el)`, `move(dir)`, `tab(back)`,
  `handle(action, ev)` → consumed, `activate(el)`, `navigables(root)`, `setHandler(el, fn)`,
  `isTextTarget(el)`, `depth()`.
- **Toast, stamp, modal**: `SR.ui.toast(opts)` (`{ key, vars, text, kind, icon, chips, id, static,
  duration }`) with `.list()`, `.clear()`, `.caption({ key, dir })`; `SR.ui.stamp(opts)` (`{ key,
  vars, text, kind, size, stat, static }`) with `.busy({ ignoreStat })`, `.skip()`, `.swallow()`,
  `.clear()`, `.current()`; `SR.ui.modal(opts)` (a box) with `.open(opts)` →
  `Promise<actionId|null>`, and `SR.ui.confirm({ title, text, vars, yes, no, danger })` →
  `Promise<boolean>` (both through the `confirm` overlay).
- **`SR.ui.hud`**: besides `mount(root, { compact, minimal })`, `unmount`, `compact(bool)`, `flush()`:
  `ghost(preview | null)` (UI §1, principle 1: ghost deltas), `minimal(bool)`, `target(kind, key)` (where a flying
  chip lands), `pulse(kind, key)`, `invalidate()`, `el()`.
- **`SR.ui.card(opts)`** is also the Card component (`{ id, title, brand, portrait, greeting,
  greetingVars, voice, onLeave, readout }` → element with `body`, `setGreeting`, `setReadout`,
  `leave`); besides `open / refresh / push / pop / replace`: `feedback(result, originEl, opts)` (UI
  §4.3 for any host), `rows()`, `debug()` (`SR.debug.ui()` calls it), `current()`, `screens()`,
  `repeating()`, `stopRepeat()`, `leave()`, and the scene hooks `mount(root, sceneParams, hooks)`,
  `unmount()`, `onAction(action, ev)`, `update(dt)`.
- **`SR.ui.subhost.create(root, { onClose, onOpen, building, host, rootLabel, feedback, onResult,
  focusScope })`** → `{ push(id, params) → Promise<popResult>, pop(result), replace, close, refresh,
  back() → handled, onAction(action, ev) → consumed, top(), depth(), ids(), destroy(), el }`.
  `feedback(result, originEl)` replaces the default feedback; `onResult(result, actionId)` runs after
  each `ctx.act`. The sub-screen `ctx` adds `refresh()`; `ctx.state` is a read-only Proxy view (a
  write throws a TypeError).
- **`SR.ui.dialog.open(opts)`** (`{ id, person, portrait, name, text, vars, mood, voice, cancel,
  choices: [{ id, label, vars, action, params, chips, chance, disabled, reason, variant, number: {
  min, max, step, label, value, money, quick } }] }`) → `Promise<{ choice, n }>`: `action` is
  previewed for the choice's chips and enabled state and the caller runs it; `cancel` names the
  choice Esc returns (default `'leave'` when offered, else Esc does nothing with an error cue, so a
  police stop cannot be escaped; `false`: Esc does nothing). While the line still types, Enter /
  Space / A only complete it (a hotkey 1-4 still picks its choice). Also `dialog.refresh()`,
  `dialog.isOpen()`. `SR.ui.building.info()` (tests: `{ id, interior, floats, ownerPose }`).
- **How the card reads building data** (for W2-Home and every building owner): `building.modes` is
  `{ live: [actionIds], owned: [...], forSale: [...] }` (or `{ mode: { actions: [...] } }`); when
  the scene's `params.mode` names one, the card shows exactly those actions in that order, else
  every action with `building: <id>`. Scene params are merged into every preview and act (`{ homeId,
  mode, variant }`). Greetings: a named fn `greet.<buildingId>` (`(s, params, ctx)` → `{ key, vars }`
  or a key) chooses the greeting by first visit, time, karma, weather or job (UI §5.6); without it
  the card picks one of `building.greetings[]`, else `greet.<id>` if registered. A row with `screen`
  passes the door params to its sub-screen; the row's own `screenParams` win over a door param of
  the same name. The Hustle button reads `{ skin, step }` from `jobs.hustleSkin` and runs
  `SR.minigame.run(skin, { skin, step, auto, ...params })`.

### 15.5 The UI input rule

DOM UI takes its input from `SR.input` actions: a scene's `onAction` offers each action to
`SR.ui.focus.handle(action, ev)` first (arrows move focus inside the current focus scope or are
consumed by the focused control; `confirm` activates the focused control), then handles what is
left (`back`, `rowN`, `repeat`, `tabPrev` / `tabNext` ...). UI scenes ignore `interact` (E, Enter,
Space and A also fire `confirm`). While `SR.input` is live, `js/ui/focus.js` suppresses the
browser's own Enter / Space activation of focused controls, so a key activates once; Tab /
Shift+Tab move focus in DOM order and wrap inside the scope. A stamp consumes (`ev.consumed`) every
action of the press that skips it. Tab is `pocket` everywhere (§12.1), but only the city opens the
Pocket on it: other scenes ignore `pocket` when `ev.code === 'Tab'`, and the Pocket closes on it
(D57).

## 16. Saves and settings *(M1)*

- **Keys:** `sr1.slot1`, `sr1.slot2`, `sr1.slot3`, `sr1.auto`, `sr1.suspend`, `sr1.ironman`,
  `sr1.profile`, `sr1.settings`, `sr1.tmp`, `sr1.broken.<timestamp>`. Classic mode's `srpg.save` is
  never touched.
- **Envelope:** `{ fmt: 'sr-save', v, meta: { name, day, length, difficulty, title, netWorth, savedAt,
  playSec, thumb }, state }`; write order tmp → slot → remove tmp; ≤ 60 KB.
- **Export code:** `'PSKY1:' + base64(JSON of the envelope) + ':' + crc32hex`, where `crc32hex` is
  `SR.util.crc32` of the base64 part as 8 lowercase hex digits (D23).
- **`SR.save`** (W1-K): `CURRENT` (the schema version), `migrations[n]` (`fn(state)` from v n-1 to
  v n), `write(slot)` → envelope meta, `read(slot)` → state or `null`, `load(slot)` (read and make
  it the live game), `list()` → `[{ slot, meta }]`, `remove(slot)`, `exportCode()`,
  `importCode(code)` → state, `exportFile()`, `importFile(file)` → `Promise<state>`, `profile()` /
  `saveProfile(p)`.
- **`SR.settings`** (W1-K): `get(key)`, `set(key, value)` (emits `settings:changed`, persists),
  `all()`. Keys are dotted paths into the ARCHITECTURE §16 schema: `'game.clock24'`,
  `'audio.music'`, `'access.reducedMotion'`, `'controls.keys'`.

## 17. Debug API and the e2e harness

### 17.1 `SR.debug` (always present)

*(M0)* `seed(n)` → rules state, `feature(flag, on)`, `goto(sceneId, params)` → stack, `ui()` →
`{ scenes }`. *(M1)* `newGame(opts)`, `set(patch)` (deep merge into the state), `get(path)`,
`act(id, params)`, `preview(id, params)`, `enter(buildingId)`, `teleport(x, y)`, `setTime(min)`,
`setDay(d)`, `step(frames)`, `press(action)`, `hold(action, frames)`, `mg(result)` (forces the next
minigame's result), `fast(bool)`, `perf()`, `shot()` (data URL), `ui()` (adds card rows with enabled
state and chips, toasts), `grid(bool)`, `time(bool)`, `night(kind)`, `down(cause)`,
`quality(preset)`, `projected(bool)`. URL flags: `#debug` (FPS and perf overlay), `#artbible`.
The overlay toggles `grid`, `time` and `projected` set `SR.debug.flags` and emit `debug:changed`;
they invalidate no render cache (the overlays are drawn every frame; D46).

### 17.2 `tests/harness.cjs` *(M0)*

`const t = await require('../harness.cjs').open({ width, height, dpr, touch, hash, live, quality,
timeout, url })` opens `index.html` over `file://` in Chromium, waits for `SR.booted`, pauses the
loop and pins the preset (High) once those exist. Methods: `newGame(opts)`, `set(patch)`,
`state()`, `act(id, params)`, `preview(id, params)`, `enter(buildingId)`, `goto(sceneId, params)`,
`step(frames)`, `press(action)`, `hold(action, frames)`, `clickUI(dataId)` (a real click on the
visible `#ui [data-id]`), `uiText()`, `teleport(x, y)`, `setTime(min)`, `seed(n)`, `mg(result)`,
`quality(preset)`, `shot(file)`, `pixels(x, y, w, h)` (RGBA of `#world` for a logical rect),
`perf()`, `errors()` (console errors, page errors, failed requests), `close()`; extras: `page`,
`browser`, `context`, `eval(fn, arg)`, `debug(name, ...args)`, `ui()`, `scenes()`, `key(code)`,
`warnings()`. A method whose `SR.debug` function has not landed rejects with "not available yet".
Exports: `open`, `ROOT`, `INDEX_URL`, `suite`, `playwright`. Screenshots go to `shots/<package>/`.

**Contact sheets** (`tests/sheets/<name>.html`, owned by what they show) load `js/boot/*`, then
`js/core/*` and the scripts they show, by relative paths (`../../js/boot/namespace.js`). They never
load `js/main.js`. Once the scripts have loaded, a sheet calls `SR.boot({ scene: false })` (it
may register test content and fakes first; D27). `open({ url })` then waits for `SR.booted` like
the game page.

## 18. The Node loader: `tests/node/load.cjs` *(M0)*

- CLI: `node tests/node/load.cjs rules|all [--shuffle <seed>] [--no-boot] [--list] [--quiet]`; exit
  code 1 on any load or boot error.
- Mode **`rules`**: `js/boot/*`, `js/core/rng.js`, `js/core/text.js`, `js/rules/*`, `js/data/**`.
  Mode **`all`** (the validator's): `rules` plus every Node-loadable registration file (§1). Files
  come from `index.html` in its order; `--shuffle` keeps `js/boot/*` first and shuffles the rest.
- The context has `window = globalThis`, `console`, the JS built-ins and nothing else: no
  `document`, timers, storage, audio or canvas, so a file touching them at load time fails the
  load; `Math.random` throws. After loading, `SR.boot({ headless: true })` runs.
- Module: `load({ mode, files, extra, shuffle, boot, keepGoing, allowRandom, console })` →
  `{ SR, context, files, errors, boot }` (throws on the first error unless `keepGoing`);
  `files(mode)`, `indexScripts()`, `context(opts)`, `run(context, code, rel)`, `shuffled(list,
  seed)`, `suite(name)` → `{ section, ok, eq, throws, done }` (the shared reporter; `eq` compares
  JSON). Values from the context belong to another realm: compare with JSON or
  `assert.deepEqual`, never `assert.deepStrictEqual`.

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

## 19. Feature flags (`js/data/features.js`)

All `false` at M0; the lead flips them at integration. **P1:** `weather`, `shadows`, `timelapse`,
`cityReacts`, `calendar`, `hustles`, `shiftEvents`, `degrees`, `perks`, `karmaTiers`, `homesPlus`,
`stockTips`, `shopsPlus`, `tours`, `police`, `civicPlus`, `nightlife`, `arcs`, `encounters`, `park`,
`scraps`, `advisor`, `achievements`, `tutorial`, `phone`. **P2:** `customLength`, `fleaMarket`,
`aquarium`, `lean`, `wardrobe`. What each enables: BUILD_PLAN Appendix B. `SR.debug.feature(flag,
on)` flips one at runtime (tests); an unknown flag throws.

## 20. Loop, stage and quality *(M1)*

- **`SR.loop`**: `pause()`, `resume()`, `step(frames)` (exactly n fixed steps, then one render),
  `time` (seconds of unpaused play), `paused`, `perf` = `{ update: { p50, p95 }, render: { p50, p95 },
  fps, draws }` over the last 300 frames, `fpsCap` (60 | 30). Per step: input poll →
  `SR.scenes.update(STEP)` → tweens; per frame: `SR.scenes.render(SR.stage.ctx, alpha)` →
  `SR.render.fx.render()` (W1-G: draws the running transition, confetti and jolt on `#fx`, clears
  it when idle) → `SR.ui.hud.flush()` (W1-D: applies the batched HUD writes); the loop calls each
  only if it exists (D30). The hidden tab pauses the loop and suspends audio.
- **`SR.stage`**: `toLogical(clientX, clientY)` → `{ x, y }`, `fullscreen(toggle)`, `resize()`, and
  read-only `k`, `uiK`, `dpr`, `scale` (device px per logical unit), `compact` (the touch-compact
  layout), `portrait`, `world` / `fx` (the canvases), `ctx` / `fxCtx` (their 2D contexts, transform
  set to logical units). Emits `stage:resized` (D22).
- **`SR.quality`**: `set(preset)` (`'auto'|'high'|'medium'|'low'`), `preset` (the effective one),
  `auto` (boolean), `params` = `{ maxDpr, renderScale, shadowHours, particles, crowd, rain, lean }`
  (ARCHITECTURE §2 table; `particles` and `crowd` are factors). Emits `quality:changed`.

## 21. Decisions

Where the documents disagreed or left a gap, W1-K decided as follows (ARCHITECTURE stays the
design of record; the lead folds these back at integration). **D1-D42 were folded into
ARCHITECTURE, UI, GDD, BALANCE and ART_AUDIO at the wave-1 integration**, together with D43-D60,
which the lead decided there on the packages' requests (`docs/requests/decisions-w1-*.md`). Where
an older document still reads otherwise, the decision here wins and the lead corrects the document.

- **D1 Stub scope.** Every `js/**` and `css/**` file of ARCHITECTURE §19 is stubbed and listed in
  `index.html`, including other wave-1 packages' files (their owners overwrite them). Tests, tools,
  contact sheets, `README.md` and reports are not stubbed: the page never loads them, and an empty
  test file would pass vacuously.
- **D2 Load-time-safe registration of scenes and engines.** `SR.scenes.register` and
  `SR.minigame.register` are defined in `js/boot/namespace.js` and store into the kinds `scene`
  and `minigame`, so shuffled loading works. The eight namespace objects that `namespace.js`
  creates are extended, never replaced.
- **D3 Map and single kinds.** `tuning`, `features` and `text` take one object whose keys are ids
  (duplicate tables, flags and keys across files are boot errors); `worldmap` is stored as
  `SR.reg.worldmap.main`. `SR.tuning` / `SR.features` are the registries themselves.
- **D4 File attribution.** Registrations and boot hooks learn their file from the call stack (a
  pure-JS technique that works in Chrome, Firefox, Safari and Node), because `document.currentScript`
  is off limits in pure files. `SR.registry` exposes kinds, entries, files, errors and hooks for
  the validator and tests.
- **D5 Ids.** Numeric ids become strings; `''` and `'__proto__'` are rejected; object defs of id
  kinds get `def.id`, and a conflicting `def.id` is an error.
- **D6 After boot.** New ids may register (tests); a duplicate throws at once.
- **D7 Boot options.** `SR.boot({ scene, sceneParams })` chooses the first scene (`false`: none, for
  contact sheets); `SR.booted` marks completion; ties in priority run in load order; a failing
  hook's error names its priority and file.
- **D8 Seeding.** ARCHITECTURE §1 keeps `rng.js` free of `Math.random` while §14 seeds fx from it:
  `js/main.js` reseeds `SR.rng.fx` in a prio-10 boot hook. `rng.js` reseeds the world stream on
  `day:started` (`SR.rng.reseedWorld`).
- **D9 RNG details.** `create`, `seed`, `next`, `float(lo, hi)`; one draw per call; `weighted`
  takes `[[value, weight]]` and returns `null` without a positive weight; the seeding algorithm is
  fixed by golden tests.
- **D10 Text details.** `has`, `missing`, `dur`, `pct` added; a missing key warns (not errors) once;
  `time()` follows `game.clock24`; money never shows `-$0`.
- **D11 Util names.** `ease*` are `easeLinear`, `easeIn`, `easeOut`, `easeInOut`, `easeSpring`
  (the last three are the CSS motion tokens); `fmt` is `{name}` substitution; `deepFill`, `clone`,
  `equal`, `merge`, `pad`, `warnOnce`, `isObject`, `invLerp`, `cubicBezier` are added.
- **D12 Event bus details.** `on` returns an unsubscribe function; listeners get `(payload, name)`;
  `'*'` receives everything; listener errors are logged with `console.error` and kept.
- **D13 Scene details.** `top()` returns the entry, `stack()` the ids; scene defs declare
  `kind: 'overlay'` (the deferred queue needs it); `SR.scenes.queue` is the deferred change; each
  scene's UI gets its own `<div data-scene>` in `#ui`; the kernel provides fallback `boot` and
  `title` scenes until W2-Front's land.
- **D14 Result refinements.** `Result.anims` (the `anim` effect had no field) and
  `Result.achievements` (ids unlocked by the `achievement` effect; `SR.act` emits
  `achievement:unlocked`); toasts are `{ key, vars, kind }`, stamps `{ key, vars }`, sfx names; the
  emission order of §8.7 with `action:done` last.
- **D15 Reasons and named fns.** Refusal reasons are text keys `reason.<name>`; named fns take
  `(s, params, ctx, ...args)` and return a condition result, a partial Result or a number by use.
- **D16 Text ownership.** `reason.*` belongs to `en-prog.js` (W1-R owns the conditions; §7.2 split
  "generic reasons" and "reasons" across two files). W2-Pocket registers content but had no text
  file, against ARCHITECTURE §7.2's rule, so **`js/data/text/en-pocket.js` (W2-Pocket) is added**
  to `index.html` (after `en-front.js`); in wave 3 it follows `phone.js` to W3-Econ for phone keys
  and stays with the lead (requests) for the rest. Captions `cap.*`, the title strings and the
  minigame frame's `mg.frame.*` live in `en-ui.js` (W1-S and W1-M send their keys to W1-D). Text
  is registered only in `js/data/text/en-*.js`.
- **D17 Input details.** Digital `up`/`down`/`left`/`right` actions (menus, focus, roulette) compose
  the `move` axis; `zoomCycle` names the RS click; Q/E tabs come from a `tabs` context so E keeps
  its global meaning elsewhere; bindings are `KeyboardEvent.code` / `Pad<n>` strings; scenes get
  presses only.
- **D18 Minigame params.** `SR.minigame.run(id, params)` carries the skin as `params.skin`; the
  scratch engine (not in ARCHITECTURE §10's list) returns `{ net }` like the other casino games.
- **D19 Song steps.** Drum tracks are those with preset `kit`; the suffix order is
  `note[:len][!|?]`; a note ends at its length, `-` or the next note; a bare `!` / `?` token
  re-triggers the previous hit (so ART_AUDIO's own example stays valid); pitches are scientific.
- **D20 SFX layers.** One source per layer (`osc`, `noise`, `pluck: true`, `fm: {...}`); `sweep`
  replaces `freq` on the layer; `indexDecay` is a time constant; `loop: true` plus a handle from
  `SR.audio.sfx` for engine, skate, rain and roulette loops. `SR.audio.renderOffline` returns a
  `Promise<AudioBuffer>` (an `OfflineAudioContext` renders asynchronously).
- **D21 Stinger ids** are `snake_case` like song ids (`stingers.election_win`).
- **D22 M1 names** for loop, stage, quality, save and settings (§16, §20) and the events
  `stage:resized` (render caches re-bake on a scale change) and `quality:changed`.
- **D23 Export code** checksum: CRC-32 of the base64 part, 8 lowercase hex digits.
- **D24 `.gitignore`.** The repository root ignores every `tools/` directory and `Tests/Fixtures/`
  (which matches `tests/fixtures/` on case-insensitive file systems); the project's `.gitignore`
  re-includes `/tools/` and `/tests/fixtures/`.
- **D25 `artbible` scene** is registered by `js/core/debug.js` (M1) for the `#artbible` route.
- **D26 Debug and harness at M0.** `SR.debug` ships `seed`, `feature`, `goto` and `ui` now; the
  harness exposes every ARCHITECTURE §18 method and rejects clearly until the debug function lands.
- **D27 Working before a dependency lands** (M0 review). No shipped file defines or backs up
  another file's names. Fakes live in the package's own tests and sheets; shipped code checks that
  stub-era modules exist before calling them (§1). Keys that a rule module raises itself
  (`toast.<module>.*`, `stamp.<module>.*`) belong to the module owner's text file (§7).
- **D28 Boot-time validation.** Priority-20 hooks index and check their own module's registrations.
  Cross-reference validation is `tools/validate.cjs` (W1-Q), and a boot hook never throws over a
  missing id of another kind (§3.5), because ARCHITECTURE §7 names no owner for an in-page
  cross-reference check and mode `rules` cannot resolve icons, sounds, skins or sub-screens.
- **D29 `open` and `SR.minigame.run`.** The `open` effect's name is a skin id or an unskinned
  engine's id, copied into `Result.open.minigame` and `.skin`. `SR.minigame.run` accepts either
  (§8.4, §13), because rules cannot see skins.
- **D30 Frame calls.** `SR.render.fx.transition` returns a Promise and calls `swap` once. The loop
  calls `SR.render.fx.render()` and `SR.ui.hud.flush()` each frame. ARCHITECTURE §3 and §5 name
  these steps but not their functions (§11.4, §15, §20).
- **D31 Audio format validator.** `SR.audio.validate(kind, def)` lives in `js/audio/music.js`,
  which is load-time clean for Node. `tools/validate.cjs` loads it as an `extra` file. The `fm`
  layer keeps ART_AUDIO's `carrier` field (the carrier waveform), which an earlier draft of this
  document had dropped. `SR.audio.stinger` accepts `stingers.<name>` or `<name>` (§14). W1-S
  confirms or files a request, together with D19-D21.
- **D32 Palette keys** are dotted paths into `SR.art.palette` (§15). ART_AUDIO names the keys but
  not how they resolve, and the validator (W1-Q), the painter (W1-G) and the kit (W1-A) must agree.
- **D33 Input (M1).** Additions: `SR.input.poll(dt)` (the loop calls it every fixed step; it
  polls the gamepads), `actions()`, `defaults()` → `{ global, contexts }` (CONTRACT §12.1, §12.3),
  `contexts()` → the pushed context names, `releaseAll()`, the read-only `stick` (`{ active, ox, oy,
  x, y }`, for drawing the touch stick) and `on('*', fn)`. `pushContext(name, map?, opts)` returns a
  function that pops exactly that context; `map` defaults to the named context of §12.3, else to the
  `keys` of the engine registered under that name (`bindings(action, name)` reads the same default
  before the frame pushes it). Popping
  releases what the context pressed, and a key held across the pop stays inert until released.
  Events carry `consumed` (a listener sets it to keep a press from the scene), `preventDefault()`
  and `defaultPrevented`. Enter and Space always become actions; `js/ui/focus.js` (W1-D) suppresses
  the browser's own activation of focused controls and activates them on `confirm`, so there is one
  path. Bound keys lose their browser default except Tab; keys with Ctrl, Meta or Alt are left to
  the browser; the left mouse button is never a binding source (DOM clicks, click-to-walk); the
  device (`last`) follows `pointerdown`'s pointerType, so a tap's compatibility mousedown keeps it on
  `touch`. While typing, the pad keeps A (`confirm`) and B (`back`). Remaps are stored split:
  `controls.keys[action]` (every non-pad code) and `controls.pad[action]` (`Pad<n>`), contexts in
  `controls.contexts[ctx][action]`; `bind(action, null[, ctx])` restores the default. With
  `game.rightClickBack`, `Mouse2` joins `back`; with `game.skateToggle`, `held('skate')` is a latch
  flipped by each press. Pad directions (D-pad and the stick past 0.5) repeat for menus after 0.4 s,
  every 0.1 s. The touch stick: a touch starting on the left half of `canvas#world`, 64 logical units
  of travel, dead zone 0.2. Hot-plug emits `input:pad` and shows a toast with `ui.pad.connected` /
  `ui.pad.disconnected` once those keys exist.
- **D34 Saves (M1).** Additions to `SR.save`: `storage` (`get`, `set`, `remove`, `keys(prefix)`,
  `detect()`, `persistent`; localStorage with an in-memory fallback), `available` (false = memory only:
  the boot's warning toast), `SLOTS`, `lastError` (`{ slot, reason, key }`), `retain(state)` (the §15
  caps), `validate(state)` → problems, `recover()` (finishes a write interrupted between tmp and the
  slot; run at boot), `playSec()`, `flush()` (writes a debounced ironman or autosave now) and
  `copyCode()` → `Promise<{ copied, code, fallback }>` (the clipboard, else the read-only,
  pre-selected textarea modal `[data-id="save-code"]` in `#ui`). `load(x)` takes a slot **or a state
  object** (a new game from `SR.rules.state.create`, an imported code or file): it deep-fills,
  validates and makes it live (the rules stream from `state.rng.rules`, else seeded from
  `state.seed`; the world stream for the day; the play clock). `write(slot, state?)` can write a
  state other than the live one; `exportCode(slot?)` and `exportFile(slot?)` take a slot too.
  Errors carry `code` / `reason`: `quota`, `hardcore` (a manual slot on Hardcore), `nogame`, `invalid`
  (`write` refuses a state that `validate` rejects, so a readable save is never replaced by one the
  read would quarantine), and for
  reads and imports `corrupt`, `format`, `newer`, `migration`, `invalid`, `code`, `checksum`. A read
  failure quarantines (except `newer`, which is kept and refused) and emits `save:broken`; when the
  quarantine copy cannot be written (a full storage) the slot is kept and `lastError.key` is `null`; `load`
  emits `save:loaded`. `meta` adds `slot`, `min` and `inProgress` (the ironman card's "In progress ·
  Day 12, 14:30"). Autosave: `day:started` writes `auto` (Hardcore: `ironman`, `inProgress` false);
  `door:exited` writes `auto` at most once a minute (a later exit is deferred, not dropped).
  Ironman: the run keeps the single ironman slot when its B-16 row says `saves: 'ironman'`
  (`tuning.difficulty.<difficulty>`; Hardcore). `action:done` with an HP, money or karma delta (or any
  `:resolve`) schedules a write `tuning.difficulty.<difficulty>.ironmanDebounceMs` (2 s) later with
  `mode.inProgress = true`; the minigame frame (W1-M) sets `state.pending` and calls
  `SR.save.write('ironman')` before a stake-bearing round (a write with `pending` is marked
  `inProgress` too); the resolve action's `action:done` clears
  `pending`; loading an ironman save with `pending` runs `SR.act(pending.resolve, pending.worst)`
  first; `game:over` (death) and `player:down` (death) delete the slot; a debounced ironman write or
  a deferred autosave is flushed when the tab hides (`visibilitychange`, `pagehide`). The retention
  limits (150 messages, 120 daily history points then weekly, 20 log entries a day, 30 rate and stock
  points) are engine constants of ARCHITECTURE §15 in `save.js` (the log follows
  `tuning.news.logMax` and the stock history `tuning.stocks.history` when present). History points are
  thinned only when they carry their day (`{ day }` or `[day, value]`). The profile defaults to
  `{ v: 1, achievements, hallOfFame, badges, hintsSeen, totals }` (W2-Front / W3-Prog fill it).
- **D35 Settings (M1).** `SR.settings` adds `reset(key?)` (every key: emits `settings:changed` with
  `key: '*'`), `defaults()` and `reload()`. `set` throws on an unknown key, a group, a wrong type or
  a value outside `display.quality` (auto, high, medium, low), `display.fpsCap` (60, 30),
  `access.textScale` (1, 1.25, 1.5), `access.colorblind` (none, protan, deutan, tritan),
  `access.reducedMotion` (system, on, off), `access.typewriterCps` (30, 60, 120, 0 = instant), volumes
  0..1. `settings:changed` fires only on a change. Stored settings are sanitised on load (bad values
  back to defaults, unknown keys dropped); loading is lazy, so boot-hook order does not matter.
- **D36 Loop (M1).** Additions: `start()` (boot), `steps` (fixed steps run). `perf.draws` is the p95
  of `drawImage` + `fill` + `fillRect` calls per rendered frame on the two stage contexts (render
  caches drawing into their own canvases are not counted); `perf.drawImages` and `perf.fills` give
  `{ p50, p95, max }` and `perf.frames` the sample count. `step(n)` records one perf sample (the n
  updates and one render) but never feeds `fps`, which counts requestAnimationFrame frames only and
  restarts its window on `resume()` (a pause gap never drags it down). Each frame the loop resets both stage contexts to the logical transform
  before rendering, then calls `SR.stage.tick()` (the letterbox colour). It feeds each rendered
  frame's work time to `SR.quality.sample`. The world canvas is not cleared by the loop: base scenes
  paint their own frame. A tab hidden while the loop was paused by a test stays paused when shown.
- **D37 Stage (M1).** k is snapped so the stage width is a whole number of device pixels (left and
  top rounded to device pixels; Chrome keeps layout positions in 1/64 CSS px). The backing store is
  capped at 2560 × 1440 keeping the aspect. Additions: `box` (`{ left, top, width, height, backingW,
  backingH }`), `horizon(min)` (the letterbox colour: the `horizon` of `SR.art.palette.sky`
  keyframes `{ h, horizon }`, interpolated; `var(--paper-1)` until the palette has them),
  `tick()` and `resetPortrait()`. `#app` carries `data-layout="stage" | "compact"` and
  `data-portrait` for CSS. In the compact layout `#ui` is `position: fixed` at the window's origin.
  The portrait card is `[data-id="stage-portrait"]` (class `sr-turn-card`) in `#ui`, text
  `ui.stage.turn` and `ui.stage.playAnyway`; "Play anyway" hides it for the session. The layout
  styles of the stage layers are set inline by `stage.js`; `css/base.css` (W1-D) holds the rest. Besides
  `resize`, `orientationchange`, `fullscreenchange` and a pointer-type change, a `(resolution: <dpr>dppx)`
  media query re-lays the stage out when the device pixel ratio changes without a resize (the window
  moved to another monitor).
- **D38 Quality (M1).** Additions: `sample(workMs, at?)` (the loop's feed; tests pass `at`) and
  `presets()`. `params` is the effective set (the touch-compact profile caps `maxDpr` at 1.5): one
  frozen object per preset and layout, so it can be read every frame without allocating.
  `set` never persists; `display.quality` drives the preset at boot and on change. Auto judges only a
  full 5 s window (≥ 30 samples), at most every 250 ms; after a change the window restarts.
- **D39 Debug (M1).** `newGame(opts)` = `SR.save.load(SR.rules.state.create(opts))` (seed 12345 when
  omitted; `opts.scene` / `opts.sceneParams` then go to a scene) and returns the state. `goto` and
  `enter` pass `{ transition: false }`. `enter(id)` resolves door ids, and `'home'` through the lived-in
  home's door, with `SR.world.doors.resolve`; any other id opens that building def. `teleport` calls
  `SR.world.teleport(x, y)` (W1-W: doors disarmed around the spot, camera snapped) and falls back to
  writing the player's `x`, `y`. `mg(result)` is `SR.minigame.force(result)` (W1-M). `fast()` with no argument
  reads the flag; `fast(true)` also sets `html.sr-fast`, which zeroes CSS transitions and animations.
  `grid`, `time`, `projected` set `SR.debug.flags.<name>` (toggle when called without an argument)
  and emit `debug:changed`; the world and render modules draw those overlays every frame, so no
  render cache is invalidated (D46). `night(kind)` re-emits the Report's events, then emits `day:started { day, report }` as
  the report scene does after a night (the world stream follows the new day; HUD, card and autosave
  react); `down(cause)` sets HP 0, calls
  `SR.rules.health.down` and emits `player:down`. `ui()` → `{ scenes, top, contexts, items: [{ id,
  tag, text, enabled, focused? }], rows: [{ id, action, text, enabled, chips }], toasts, card? }`
  (`rows` are the ActionRows, `data-id="row-<action id>"`; `toasts` from `SR.ui.toast.list()`;
  `card` from `SR.ui.card.debug()` when W1-D provides it). `overlay(on)` shows the `#debug` overlay;
  the `artbible` scene leaves on `back` (dropping `#artbible` from the URL).
- **D40 Crispness check.** ARCHITECTURE §2 says 1366 × 768 gives k = 0.7125, but there k =
  768 / 720 ≈ 1.067 (1.0664 after snapping); k = 0.7125 is a 912 × 513 window. `stage.test.cjs`
  checks both, by comparing text in `#ui` with the same text laid out natively at 16·k px at the same
  sub-pixel offset (they must match; a browser-scaled bitmap control must not).
- **D41 Harness (M1).** `open({ fast })` calls `SR.debug.fast(true)`; `quality: null` pins nothing.
  Extras: `get(path)`, `setDay(d)`, `fast(on)`, `night(kind)`, `down(cause)`, `inject(action,
  down)`, `resize(w, h)` (viewport plus an immediate `SR.stage.resize()`) and `reload()` (storage
  survives; waits for the boot, pauses and pins again).
- **D42 Fixtures.** `tests/fixtures/state-v1.json` (a complete day-12 v1 state),
  `save-v1-missing.json` (fields missing, an unknown field), `save-v1-invalid.json`,
  `save-v9-newer.json`, `save-corrupt.txt`, `export-v1.txt` (a golden export code made with Node's
  own base64 and `zlib.crc32`) and `settings-v1.json`. The wave-2 capture
  `save-v1-wave2.json` joins them at the wave-2 exit (BUILD_PLAN §4.14).

- **D43 State schema v1 additions** (wave-1 integration; W1-C request 1, W1-E R2 and R10, W1-W 3).
  `trade.offer`, `fight.open`, `casino.match`, `crime.open` (`null`; the record of a start whose
  resolve is still to come: it survives a save, so Hardcore's `pending.worst` and a trip's event card
  resolve after a reload, and every resolve fn pays once), `daily.shifts` (the day's shift count:
  Motivation Monday), `history` points `[day, value]` seeded with day 1 (so a thinned history keeps
  its days), `flags.foldDone` and `flags.carHitVm`. They are additive and deep-filled, so the
  version stays 1 and no migration is needed. `js/rules/state.js` has them in `defaults()` /
  `create()` since the wave-1 integration (desk-rules).
- **D44 Scene transitions** (wave-1 integration; W1-K-M1 request 4). `js/core/scenes.js` runs `go`
  (default `pageTurn`) and a `replace` that names a kind inside `SR.render.fx.transition`, and
  swaps at once for `{ transition: false }`, `SR.debug.fast()`, a change requested inside another
  change, an empty stack and a missing `SR.render.fx` (§11.4). `go` and `replace` return the
  transition's Promise. The stack changes synchronously inside the swap, so no caller waits.
- **D45 Script size budget: 8 MB** of JS (2^20-byte MB, comments included, the scripts `index.html`
  lists), gated by `tests/perf/perf.cjs` `BUDGET.scriptBytes = 8 × 2^20`; the boot-time budget is
  unchanged. The 1.8 MB figure was already spent after wave 1 (1.82 MB with about 150 files still
  stubs) with three content waves to go, and classic scripts from `file://` load fast; there is no
  minification step (W1-G request 7, W1-Q 3).
- **D46 Debug overlays invalidate nothing** (W1-G request 4). `grid`, `time` and `projected` are
  drawn every frame from `SR.debug.flags`; re-baking 40 chunks and every sprite on a toggle showed
  placeholders for frames. A module that ever bakes an overlay listens to `debug:changed`.
- **D47 Hold-to-repeat and stat stamps** (W1-D request 4, W1-R 10). A repeat stops at any modal,
  dialog, minigame or stamp **except a stat-gain stamp**: during a hold the first run's stat stamp
  shows and later ones are coalesced (float texts and the flying chips still show every gain);
  promotion, degree, jackpot and rank stamps still stop it. `SR.ui.stamp.busy({ ignoreStat: true })`
  is the card's check. GDD §4.4, UI §1 and §4.3, ARCHITECTURE §11.
- **D48 Day-1 fries cost $9** (W1-R request 9). The rules win: B-02 starts you as a Fry Cook and
  B-28a's `employee` row takes 25 % off McSticks food while you hold a McSticks job, so the B-06
  price of $12 becomes $9; BUILD_PLAN §3.12's slice text and `tests/e2e/slice.test.cjs` say $9.
- **D49 Engine limits stay named constants** (W1-K-M1 request 3, W1-R 2 and 3, W1-S 4, W1-G 6).
  BALANCE holds game-balance numbers; engine and presentation limits stay named constants at the
  top of their files, citing their section: the save retention and budget, autosave gap, Auto
  quality thresholds and presets, stage and input constants, the loop's catch-up steps
  (ARCHITECTURE §2-§3, §11, §15); the stat-check clamp 0.05..0.95 and D ≥ 1 (GDD §4.3's formula;
  the 33 tuning table names are frozen, §3.6); the inbox cap of 150 (one rule shared by
  `effects.js` and `save.js`, ARCHITECTURE §15) and the stamp threshold "gain ≥ 2" (a UI feedback
  rule, UI §4.3); the audio mix constants; the render core's lamp, neon, light and budget numbers.
  The ironman debounce and rule are balance (`tuning.difficulty`).
- **D50 The audio graph as built** (W1-S request 4). Buses → compressor (hard knee) → makeup trim →
  master gain → destination; the bus levels of ART_AUDIO §13.7 are trims under the sliders; the
  voice bus follows the SFX slider; music notes are voice priority 2.5. The engine suspends its own
  context while the tab is hidden (W1-K-M1 request 5 needs no loop hook). §14.1 and ARCHITECTURE §12
  follow.
- **D51 Text ownership settled.** `door.*` and `ori.*` belong to `en-world.js` (W1-W, then W2-City),
  not `en-city.js`, which holds barks and the car-hit voicemails; `report.*` (every morning-report
  line) belongs to `en-econ.js`, not `en-home.js`; `reason.*` is `en-prog.js` (D16), so `en-ui.js`
  holds no "generic reasons"; the prefix rows of §7 follow `tools/validate.cjs` (W1-Q request 4,
  W1-E R4); `enc.` and `event.` keys are ≤ 400 characters (W1-Q request 9). ARCHITECTURE §7.2 and
  §19 list `en-pocket.js` (D16).
- **D52 The ContextPrompt appears within 96 u** (the Interact range, B-15 `door.prompt`) of a door
  or a person you can talk to; from 96 to 160 u a door shows only its plain name tag. UI §2.3 and
  §5.5 said 160 u for the prompt, against GDD §3.6, ARCHITECTURE §8.4 and B-15.
- **D53 CPU gates read JS work** (W1-Q request 2, W1-G 5). Headless Chromium rasterises canvases in
  software on the main thread and flushes a frame's recording inside whatever canvas call comes
  next, so `tests/perf/perf.cjs` gates each frame's JS work (frame time minus the time inside native
  canvas calls, path building excepted), p95 over the tour, and reports the raw frame and native
  times without gating them (ARCHITECTURE §17).
- **D54 Camel-case decree ids** (W1-C request 9, W1-W 4): decree ids are the camelCase keys of B-17
  (`casinoLevy`, `seizeBank`, `guardRails`, ...), an exception to §3.1's `snake_case` for content,
  because tuning rows, the night, jobs, the bank and the world already read them.
- **D55 BALANCE and `tuning.js` names** (W1-R requests 1 and 4, W1-C 7, W1-M 4 and 5, W1-W 1 and 2).
  BALANCE records the tuning names that differ from its old keys (`health.hospital.hpPct`,
  `endgame.ranks` / `endgame.column`, `weather.forecastAccuracy`) and the numbers the packages held
  as constants (world, hustle, hotwire, Assist, darts, election, fight quirks, the kernel's GDD
  ranges), marked *(w1)*; `js/data/tuning.js` has every one of them since the wave-1 integration
  (desk-rules), and the engines that still hold a named constant (`shiftrush.js`, `timingring.js`)
  should read the row through `SR.minigame.tune`. The B-15 field names of `tuning.world` are
  frozen. The sortit belt brings `itemsPerCorrect` items per ticket interval (no `itemEverySec`).
- **D56 The minigame play area is its own canvas** `[data-id="mg-canvas"]` in the frame (W1-M
  request 3), so pointer mapping is exact in the touch-compact layout; the minigame scene
  `blocksRender` and ignores the stage context (§13.1, ARCHITECTURE §10, §18).
- **D57 The UI input rule** (W1-D request 2): focus first (`SR.ui.focus.handle`), then the scene;
  one activation per key; Tab moves focus inside a scope and opens the Pocket only in the city
  (§15.5, ARCHITECTURE §11, UI §6).
- **D58 Render core decisions** (W1-G request 6): the grade covers the sheet, not the sky; traffic
  cars on the 8 directions are cached sprites; the "props, actors and neon ≤ 8 MB" line is split
  into LRUs (cars 1.25 Mpx, props 0.5 Mpx, neon 0.2 Mpx, lights 0.03 Mpx); tints repaint in place;
  hidden lights dim with the building over them; grain on sprites is `source-atop` ink; people on
  an east / west mat sort in front of that building; the sky pass is skipped when the sheet covers
  the view (ARCHITECTURE §9.4).
- **D59 Small rule readings confirmed** (W1-R request 11): McHolland's bribe blocks Heat gains
  while `day <= bribedUntil` (inclusive); Heat Wave scales `cost.hp`, `hpAbove` and `hurt` of `train`
  and `work` actions (ceil × 1.5); Hard Landing caps `hurt` with cause `fall` or `carHit` at 5; Iron
  Stomach multiplies `heal` in `eat` actions (floor × 1.25); Buzz wears off on the clock's 2-hour
  grid (no state field); Winded is judged after the action's own HP cost; the `weather` condition
  reads Clear while the `weather` flag is off. GDD §4.2, §4.14, §3.12, §6.2 and §6.8 say so.
- **D60 Interiors take the door params** (W1-D request 6, W1-A answer A): `SR.art.interior(id,
  params)` receives the door resolver's params, and `drawAnim(ctx, t, state, actors)` the proprietor
  and you (§15.3, ARCHITECTURE §9.2).
