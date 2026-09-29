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
`start.hpMaxBase`, `news.weights` and `news.minWeight`. The karma colour bands of B-04c are palette
entries (§15), not tuning; `tuning.karma` holds only the band-index formula.

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
transitions (§11.4, `js/core/scenes.js`) were not part of W1-K-M1.

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
  `greet.` ≤ 140, `news.` ≤ 220, `vm.` ≤ 280, `card.` ≤ 400.
- **Key namespaces and owner files** (the validator's `--wave` prefix map in `tools/validate.cjs`
  follows this table; a key's first two segments decide):

| Keys | Owner file (wave-1/2 package) |
|---|---|
| `game.title`, `game.tag`, `ui.*` (incl. `ui.fanNote`), `hud.*`, `set.*` (settings), `key.*` (glyph names), `cap.*` (sound captions), `mg.frame.*` (the minigame frame and the generic engine strings) | `en-ui.js` (W1-D; W2-Front in wave 2) |
| `reason.*` (every refusal reason: `reason.tooHurt`, `reason.featureOff`, ...), `perk.*`; in wave 3 `ach.*`, `advisor.*` | `en-prog.js` (W1-R) |
| `item.*`, `job.*`, `home.<tier>`, `furn.*`, `stock.*`, `rank.*`, `report.*` | `en-econ.js` (W1-E) |
| `city.*`, `fighter.*`, `decree.*`, `crime.*`, `trip.*` (outcomes) | `en-conflict.js` (W1-C) |
| `place.*`, `door.*`, `ori.*` (Pilot Ori), `act.world.*`, `toast.world.*` | `en-world.js` (W1-W) |
| `toast.<module>.*`, `stamp.<module>.*` raised by a rule module that is not a building (a stat gain, a promotion, a hospital bill) (D27) | the module owner's file: `stats`, `perks`, `time` en-prog (W1-R); `jobs`, `training`, `night`, `health`, `homes`, `stocks` en-econ (W1-E); `crime`, `trade`, `fight`, `election` en-conflict (W1-C). `bank` and `casino` are building ids, so their keys follow the next row |
| `<prefix>.<building>.*` for `act`, `desc`, `greet`, `toast`, `stamp`, `card`, and `sub.<subscreenId>` | the building's file: `home` en-home; `mcsticks`, `store` en-food; `pawn`, `furniture` en-goods; `bank`, `nli` en-money; `uofs`, `cityhall` en-civic; `bar`, `casino` en-night; `bus`, `trip`, `jail`, `hospital` en-transit; `street`, `harold`, `kid`, `dealer`, `junker` en-street; `park` en-park |
| `mg.<engine or skin>.*` (titles, labels) | the engine's or skin's owner: `fight`, `darts`, `slots`, `blackjack`, `roulette` en-night; `scratch`, `orderup`, `holdup` en-food; `sortit`, `pitch`, `boardroom` en-money; `debate` en-civic; `hotwire` en-street; `interview`, `interrogation` en-events; `tourhook` en-transit |
| `act.bag.*`, `act.phone.*`, `contact.*`, `pocket.*` | `en-pocket.js` (W2-Pocket; D16) |
| `news.*`, `tv.*` | `en-news.js`, `en-home.js` (W2-Home) |
| `bark.ped.*`, `vm.carhit.*` | `en-city.js` (W2-City) |
| `vm.<npc>.*`, `bark.<npc>.*` | the NPC's file (street cast en-street; Mel en-food; NLI staff en-money; Electoral Board and rivals en-civic) |
| `front.*` (title menu, new game, intro, results) | `en-front.js` (W2-Front) |
| `enc.*`, `arc.*`, `event.*` | `en-events.js` (W3-Life) |
| `taunt.<fighter>.*` | `en-night.js` (W2-Night) |

## 8. The rules layer

### 8.1 Entry points

```js
SR.preview(id, params) → Preview    // pure; never mutates
SR.act(id, params)     → Result     // mutates SR.state through rules, then emits (§8.7)
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
Top-level keys: `v, seed, rng, mode, clock, player, stats, money, job, edu, perks, items, homes,
furniture, stocks, tip, trade, fight, casino, crime, daily, weekly, npc, election, world, jail,
pending, msgs, log, journal, records, history, achievements, flags, over, result`.
`week(s) = floor((s.clock.day - 1) / 7)`. Invariant: `stats.hpMax === tuning.start.hpMaxBase + stats.str`.

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

`SR.scenes.register(id, def)` (load-time safe) · `go(id, params)` (replace the whole stack) ·
`push(id, params)` → Promise resolved by `pop(result)` (or with `undefined` if `go` removes the
scene) · `pop(result)` · `replace(id, params)` (a pending push promise carries over) ·
`queue(id, params)` (the deferred change of ARCHITECTURE §5: `go` as soon as the top is a base
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
`'pageTurn'` (default for `go`), `'doorZoom'`, `'fade'` or `false`; the swap runs inside
`SR.render.fx.transition(kind, swap)` (W1-G) → `Promise` resolved when the transition ends. It
captures the outgoing frame on `#fx`, calls `swap()` exactly once (the kernel changes the stack
there), then animates the cut (D30). Reduced Motion turns every transition into `fade`.
Tests pass `false` or call `SR.debug.fast(true)`.

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

Other engines name their contexts after their engine id and list their keys in `keys`.
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

## 14. Audio

### 14.1 API (W1-S)

`SR.audio.sfx(name, { x, y, gain, pitch })` → handle `{ stop(), set({ gain, pitch, x, y }) }` (D20) ·
`SR.audio.music(id, { fade, variant })` · `SR.audio.stinger(id)` · `SR.audio.ambience(id, level)` ·
`SR.audio.setVolume(bus, v)` · `SR.audio.duck(db, ms)` · `SR.audio.caption(textKey, dir)` (emits
`caption`) · `SR.audio.renderOffline(kind /* 'song'|'sfx' */, id, seconds)` → `Promise<AudioBuffer>`.
`SR.audio.stinger(id)` takes a stinger song id (`'stingers.promotion'`); a bare name
(`'promotion'`) means `stingers.<name>` (§14.2). `SR.audio.validate(kind, def)`: §14.3 (D31).
Buses: `music`, `sfx`, `ambience`, `ui`, `voice` → master → compressor. Caption keys: `cap.horn`,
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
design of record; the lead folds these back at integration).

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
  `grid`, `time`, `projected` set `SR.debug.flags.<name>` (toggle when called without an argument),
  emit `debug:changed` and invalidate the render caches; the world and render modules draw those
  overlays. `night(kind)` re-emits the Report's events, then emits `day:started { day, report }` as
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
