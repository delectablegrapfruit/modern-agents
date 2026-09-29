# Paper Sky: Build Plan

Four waves of parallel AI-agent work. Wave 1 builds the engine, the rules and the design system
that everything else stands on. Wave 2 ships the **Remastered Original** (every P0 item): a
complete game even if later waves slip. Wave 3 adds the expanded game (P1). Wave 4 polishes,
balances, verifies and ships P2 extras. File names, APIs and numbers come from ARCHITECTURE,
GDD, UI, ART_AUDIO and BALANCE; this plan says who builds what, in which order, and how it is
accepted.

## 1. Rules of engagement

1. **Work happens in** `/home/user/modern-agents/stick-rpg-remaster/` on branch
   `claude/stick-rpg-remaster`. The recreation in `../stick-rpg/` is never modified.
2. **Agents own files, not features.** A package edits only the files listed as its own for the
   current wave (and new test, sheet and screenshot files under its own names). Everything else is
   read-only. File ownership per wave is authoritative in this document (§3-§6, §7).
3. **Requests protocol.** A package that needs a change in a file it doesn't own writes
   `docs/requests/<package>.md` with: file, exact change, why, and a workaround used meanwhile. The
   lead applies or rejects requests at the wave's integration step and records the decision there.
   Public names in `docs/CONTRACT.md` change only this way.
4. **Only the lead** edits `index.html`, `js/boot/*`, `js/core/*` (except files §7 transfers to a
   package for a wave), `js/main.js`, `js/data/features.js`, `tests/harness.cjs`,
   `tests/node/load.cjs`, `docs/*.md` (except `docs/requests/*`), `.gitignore`, and commits.
   Package reports that the plan names live in `reports/` (`reports/balance-report.md`:
   W3-Balance; `reports/QA.md`: W4-QA; `reports/perf-manual.md`: the lead) and are edited by those
   packages. Screenshots go to `shots/<package>/` and visual-test dumps to `tests/visual/out/`;
   both are git-ignored, so "no binary files" (checked on tracked files) never conflicts with them.
   Agents never run `git add`, `git commit`, `git stash`, `git checkout` or anything that changes
   git state.
5. **Scope control.** Content carries P0 / P1 / P2 tags (GDD). A package may not add a system that
   is not in the GDD; ideas go into its report under `proposals`. P1 and P2 behaviour stays behind
   its feature flag (Appendix B) until the lead enables it.
6. **Definition of done** for every package:
   - its acceptance criteria below, and its tests passing (`node tests/<suite>/<file>.cjs`);
   - `node tools/validate.cjs --wave N` (N = the current wave), `node tools/shingles.cjs` and the
     banned-strings check pass on its files; no colour literals outside `palette.js` /
     `tokens.css`; no `Math.random` in rules or data; every def it adds with `p ≥ 1` has its
     `feature` flag; every text key it references resolves (in its own text file, or in a file
     still a stub, which `--wave` reports as a warning);
   - opening `index.html` from disk shows no console errors caused by its files;
   - screenshots or contact-sheet captures in `shots/<package>/` for anything visual, compared by
     the agent against UI.md / ART_AUDIO.md and the art bible;
   - a report: what was built, files, test commands and results, requests, deviations (with
     reasons), open issues, proposals.
7. **Numbers** come from `SR.tuning` (BALANCE). A package that needs a number that BALANCE lacks
   uses a clearly named constant in its own file and files a request to move it to `tuning.js`.
8. **Rule fixes during wave 2** go to the two rules-desk packages (§4.0), not to the lead: they own
   the rules and core data files for the whole wave and answer requests within the wave.
9. **Style:** ARCHITECTURE §21.

## 2. Waves at a glance

| Wave | Goal | Packages | Exit gate |
|---|---|---|---|
| 1 Foundation | Kernel, rules (P0 and P1, pure), design system, art kit, world geometry, render core, audio engine, minigame engines, test tooling | 11 | The **grey-box vertical slice** runs end to end on the real map (§3.12) |
| 2 Remastered Original | Every P0 building, action, person, minigame, screen and song | 15 (13 feature packages + 2 rules desks) | **Remastered Original**: a scripted 40-day run and a debug-assisted election run pass; every original building, street interaction, minigame and endgame rule is present (§4.14) |
| 3 Expanded | Every P1 item; the balance sim green | 10 | All P1 flags on; save schema v2; balance bands met; the city reacts; onboarding completes a Day 1 by prompts alone (§5.11) |
| 4 Polish and ship | Performance, visual consistency, writing, QA playthroughs, P2 extras, fixes by area, README | 7 | Release checklist (§6.7) |

Each wave ends with an **integration step** run by the lead: merge all packages, apply requests,
flip flags, run `node tools/run-all.cjs` (every suite), review contact sheets and screenshots at
1280×720 and 1920×1080 (day and night), fix integration breaks, update `docs/CONTRACT.md`, commit.

## 3. Wave 1: Foundation (11 packages)

Everyone starts at once. **W1-K delivers milestone M0 first** (§3.1): the namespace, the registries,
every script tag, the stubs, the text helper, the RNG, the event bus, the Node loader and
`docs/CONTRACT.md`. Until M0 lands (about the first hour), other packages write pure code and data
against the interfaces in ARCHITECTURE and run Node tests with a local copy of `load.cjs` from M0 as
soon as it exists. Packages that need a running page (UI, render, audio, minigames) use their
contact-sheet pages (`tests/sheets/*.html`), which load only the scripts they need plus
`js/boot/*` and `js/core/*`.

**Frozen at M0 in `docs/CONTRACT.md`:** every public name of ARCHITECTURE; the registration kinds of
§7 (including `fn`, `subscreen`, `contact`, `exterior`); the action fields of §6.3 (`screen`,
`feature`, `repeatable` rules); the Preview, Result, Down and Report shapes (§6.2, §6.6, §6.7); the
rule-event vocabulary (§6.8); the sub-screen contract and ids (§7.1); the input actions and the
context-map API (§11); the song and sfx data formats (ART_AUDIO §13.8). W1-S and W1-D send their
parts to W1-K within the first hour; later changes go through requests.

### 3.1 W1-K Kernel (lead)

- **Files:** `index.html`; `.gitignore`; `js/boot/{namespace,util,events}.js`;
  `js/core/{rng,loop,stage,quality,input,scenes,save,settings,text,debug}.js`;
  `js/data/features.js`; `js/main.js`; `tests/harness.cjs`; `tests/node/load.cjs`;
  `tests/fixtures/*`; `tests/node/core.test.cjs`; `tests/e2e/{boot,slice,input,save,stage}.test.cjs`;
  `docs/CONTRACT.md`; a stub for every file in ARCHITECTURE §19 not owned by another wave-1
  package.
- **Depends on:** nothing.
- **M0 (first):** `index.html` with every script tag in the §4 order and the stage layers; stubs;
  `SR` with `SR.def.<kind>` for every kind in ARCHITECTURE §7, `SR.reg`, `onBoot(prio, fn, {
  headless })` / `boot(opts)`; `SR.events`; `SR.rng` (sfc32, three streams); `SR.text`; `SR.util`;
  `tests/node/load.cjs` with its `rules` and `all` modes (ARCHITECTURE §18); `docs/CONTRACT.md`.
- **M1 (end of wave):** loop (fixed step, pause, step, work-time `perf`, the hidden-tab pause),
  stage (letterbox, canvases sized to the stage, `#ui` scaled with CSS `zoom`, the touch-compact
  layout switch and the portrait card, DPR, backing store, `toLogical`, fullscreen), quality
  presets and Auto on work time, input (keyboard, mouse, touch, gamepad → actions; context maps;
  the text-entry rule; the `minimap` action; remap; `inject`), scenes (stack, transitions via
  `SR.render.fx`, the deferred scene-change queue of ARCHITECTURE §5), save (envelope, tmp swap,
  migrations, deep-fill, quarantine, retention caps, the Hardcore ironman write rules and
  `pending`, the export code with the textarea fallback, file import/export), settings (schema,
  persistence), the debug API (ARCHITECTURE §20), the `#debug` overlay and the `#artbible` route.
- **Integration task:** the grey-box vertical slice (§3.12).
- **Provides:** everything in ARCHITECTURE §2-§5, §11, §13-§16, §20.
- **Acceptance:** boot → title stub from `file://` with zero console errors; the stage letterboxes
  correctly at 1280×720, 1920×1080, 2560×1080, 1366×768 and 800×1280 and switches to the
  touch-compact layout at 844×390 on a coarse pointer (canvas and UI aligned to the pixel); text is
  crisp at 1366×768 (the stage test's sharpness check); `SR.rng` streams are deterministic per
  seed and the rules stream round-trips through a save; a v1 fixture with missing fields
  deep-fills; a synthetic, test-only migration chain runs in order; a corrupt save is quarantined;
  the export code round-trips, and the textarea fallback appears when the clipboard rejects; a
  1,000-message state is pruned to 150 by the retention rule; mocked `navigator.getGamepads` and
  touch events produce the same actions as the keyboard; a pushed context shadows H/S/D on the
  keyboard and pops cleanly; typing in a TextField fires no action but Enter / Esc / Tab;
  `SR.loop.step(n)` advances exactly n steps; hiding the tab pauses the loop.
- **Tests:** `tests/node/core.test.cjs`, `tests/e2e/{boot,input,save,slice,stage}.test.cjs`.

### 3.2 W1-R Rules kernel

- **Files:** `js/rules/{state,check,conditions,effects,act,time,stats,perks,log}.js`;
  `js/data/{tuning,perks}.js`; `js/data/text/en-prog.js`;
  `tests/node/{state,act,time,stats,perks,tuning,mods}.test.cjs`.
- **Depends on:** M0.
- **Provides:** `SR.rules.state.create/defaults` (the full v1 schema of ARCHITECTURE §6.1);
  `SR.act`, `SR.preview`, `SR.rules.act.{run,preview,price}` with the whole pipeline of §6.2 (feature
  gate, arcs hook, the HP-0 hook calling `SR.rules.health.down`, the hard money rule and
  `bank.charge` via the named fn, rule events, the log); every condition and effect of §6.4;
  `SR.def.fn` usage; `SR.rules.{check,time,stats,perks,log}` including the price and check modifier
  pipelines (§6.10) and `week(s)`; `SR.tuning` with **every BALANCE table B-01 to B-31
  transcribed**, keyed as BALANCE names them; the perk defs and their text.
- **Acceptance:** preview never mutates the state (deep-equal before and after, for every
  registered action in the test fixtures); a feature-flagged def previews as hidden while its flag
  is off; the time wall equals the original's checks (a 6 h shift can start at 18:00 and not at
  18:30; a 2 h class at 22:00 and not 22:30; food at 23:30; **a robbery at 20:30 and not at
  21:00**); `hpAbove` refuses with "Too hurt"; a forced charge larger than cash + bank leaves both
  at 0 and reports the write-off; karma clamps after every change; HP max = 15 + STR after every
  STR gain and never changes otherwise; Winded halves gains (floor, min 1); the degree bonus adds
  1; caps at 999; the B-28a examples (Friday beer with Regular under Beer Subsidy = $10; fries to
  go as an employee with a flyer coupon = $7, coupon consumed) and B-28b rows (Relaxed touches only
  its listed checks); perk offers appear exactly at 100/250/450/700; the log keeps 20 entries by
  weight; the tuning test checks 80 values against a table copied from BALANCE, including one from
  each of B-26 to B-31.
- **Tests:** the files above, run under `tests/node/load.cjs`.

### 3.3 W1-E Economy and life rules

- **Files:** `js/rules/{jobs,training,night,bank,stocks,homes,calendar,endgame,health,news}.js`;
  `js/data/{items,jobs,homes,furniture,stocks,ranks}.js`; `js/data/text/en-econ.js`;
  `tests/node/{jobs,training,night,bank,stocks,homes,calendar,endgame,health,news}.test.cjs`.
- **Depends on:** W1-R interfaces (can stub `SR.rules.stats.add` until W1-R lands).
- **Provides:** ARCHITECTURE §6.5 functions of these modules, **including P1 rules** (degrees,
  seminars, CDs, letting, selling, tier-2 furniture, home perks, the daily tip, Workstation
  trading and the catalogue, the weekly calendar and city events, the weather roll, Half and
  Overtime shifts, hustle multipliers, the rating, the weekly bonus, the CEO takeover hook) behind
  feature flags; `SR.rules.night.run` with every numbered step of GDD §4.7 and the jail and
  hospital subsets; `SR.rules.health.down` (ARCHITECTURE §6.7); `SR.rules.news.headline`; loan
  default with seizure and the lien; the interest cap; reverse splits; the text of items, jobs,
  homes, furniture, stocks, ranks and report lines.
- **Acceptance:** the night runs in GDD §4.7 order (a test records every step's side effect in
  order, including the Friday bonus, campaign counter and election night hooks (stubbed election
  rules), decree cash, the car tow, arc and loan timers and a Hardcore default that finishes the
  night before death); the jail and hospital subsets skip exactly their steps; `isMarketDay` uses
  the ended day (ticks happen after Mon-Fri, never after Sat-Sun); HP 0 gives Second Wind, hospital
  (bill, write-off, HP = 50 %, wake 12:00, next day) or death by difficulty; sleep restore examples
  of BALANCE B-07 hold; interest tiers with CDs reducing T1 and the $25,000 cap; the rate step stays
  in 0.25-3.5 and its mean over 10⁵ nights is 1.5 ± 0.05; loan default per difficulty, and net
  worth after a default ≤ net worth after repaying; stock tick mean and σ over 10⁵ draws within 5 %
  of BALANCE; a close below $1 reverse-splits; the tip is drawn at step 10 with that morning's INT;
  reliability formula; position cap and spread; the B-10 EV table reproduced by simulation within
  ±15 %; promotion gates and shift counts; weekly bonus on Fridays only; home perk only for the
  lived-in home; net worth with the lien; every rank boundary; legacy score; Hall of Fame buckets;
  weather chain frequencies within ±2 % over 10⁵ days; the headline picks by B-29 weight.
- **Tests:** as listed.

### 3.4 W1-C Conflict and chance rules

- **Files:** `js/rules/{crime,trade,fight,casino,election}.js`; `js/data/{cities,fighters,decrees}.js`;
  `js/data/text/en-conflict.js`; `tests/node/{crime,trade,fight,casino,election}.test.cjs`.
- **Depends on:** W1-R interfaces.
- **Provides:** §6.5 functions of these modules, including P1 rules (police outcomes, bail, tours,
  haggling, reputation, the Underground Ring, Guard, VIP, the pit boss and counting, scratch, darts
  matches and Auto samples, decrees with offers, campaign caps) behind flags; the fight Auto policy;
  the text of cities, fighters, decrees and crime and trip outcomes.
- **Acceptance:** Hold-up odds by Monte Carlo (10⁵) within ±2 % of the B-11b reference odds; robbery
  preconditions (gun and ammo ≥ 10; start before 21:00; STR ≥ 100 and once a week for the bank; -10
  / -20 karma win or lose); bank D grows by 100 per robbery in 14 days; jail length and bail
  formulas; trip resolution follows the original order (a table of 12 scripted scenarios with
  fixed seeds); offer formulas at CHA 30 / 150 / 300 / 600; tour requirements, weekly limit and fee;
  fight damage ranges and AP at STR 10 / 100 / 300 / 999; the Quick-fight Auto uses real rolls;
  ring scaling; slots RTP computed exactly = 0.9225 and hit rate 0.2125; blackjack: basic strategy
  over a fixed-seed 4 × 10⁶ hands gives a house edge in 0.35-0.75 %, naturals pay 3:2, split and
  double rules, 60 hands a day; suspicion follows B-14b for a non-counter and a counter; roulette
  pays every bet type and 0 / 00 lose outside bets; **scratch EV = $3.00 exactly by enumeration**;
  darts ring radii and the Auto sample distribution of B-14f (±3 %); poll maths, caps, halving,
  clamp, rival gain, debate no-show and the election roll of B-17; decree offers are 3 eligible
  cards and once-only decrees never return.
- **Tests:** as listed.

### 3.5 W1-D Design system and UI framework

- **Files:** `css/{tokens,base,components}.css`; `js/ui/{dom,components,focus,toast,stamp,modal,hud,card,
  dialog}.js`; `js/scenes/building.js`; `js/data/text/en-ui.js`; `tests/sheets/components.html`;
  `tests/node/tokens.test.cjs`; `tests/e2e/{ui-kit,card}.test.cjs`.
- **Depends on:** M0; W1-A icons (uses a placeholder square until they land).
- **Provides:** `SR.ui.dom.h`; every component of UI §2.3 (`SR.ui.button`, `chip`, `actionRow`, `card`,
  `speech`, `meter`, `clockRing`, `statChip`, `karmaMedallion`, `toast`, `stamp`, `modal`, `confirm`,
  `tabs`, `segmented`, `numberField`, `textField`, `slider`, `toggle`, `list`, `keyHint`, `tooltip`,
  `portrait`, `sparkline`, `lineChart`, `progress`, `badge`, `breadcrumb`, `contextPrompt`);
  `SR.ui.focus` (scopes, spatial navigation); `SR.ui.hud.{mount, unmount, compact(bool)}` bound to
  events, in the 3-row layout of UI §4.1; `SR.ui.card.{open(buildingId, { params, screen,
  screenParams }), refresh(), push(id, params), pop(result), replace}` building rows from
  `SR.preview` (hiding feature-off rows) with hotkeys, repeat of `repeatable` rows only, and ghost
  deltas; **the sub-screen host** of ARCHITECTURE §7.1 (`SR.ui.subhost.create`, lifecycle,
  breadcrumbs, Back veto, feedback after `ctx.act`); `SR.ui.dialog.open(opts) → Promise<{ choice, n
  }>` with NumberField choices; the `building` scene (interior via `SR.art.interior(id)` or a
  placeholder, card, compact HUD, `world.enter` on arrival, leave → city); `touch-action` rules on
  scroll containers; the tokens of UI §2.1 (primary buttons on `--primary-600`, `--str-ink`
  #963F07, `--ink-500` #5C6070, `--fs-28`).
- **Acceptance:** the gallery shows every component in every state at 100 / 125 / 150 % text with
  no clipping; keyboard, mocked gamepad and touch can operate every component; focus is always
  visible; hold-Enter repeats a `repeatable` row every 350 ms until refused and never repeats a
  row with `confirm`, `minigame` or `screen`; a disabled row shows its reason and plays the error
  feedback; a test sub-screen mounts, refreshes after `ctx.act`, vetoes Back and unmounts, and
  `card.open('bank', { screen })` from another building lands on it; a touch drag scrolls a long
  card body; the token test passes (every pair of UI §2.1); the a11y audit passes on the gallery;
  High contrast and Reduced motion classes switch.
- **Tests:** as listed.

### 3.6 W1-A Art kit and actors

- **Files:** `js/art/{palette,paper,draw,stick,portraits,vehicles,icons,logo,bible}.js`;
  `js/art/interiors/kit.js`; `tests/sheets/{art,icons,actors,kit}.html`.
- **Depends on:** M0.
- **Provides:** `SR.art.palette` (ART_AUDIO §2, the UI mirror, the karma bands `karma.good[i]` /
  `karma.evil[i]` of BALANCE B-04c, the building palettes `bld.<id>.*` of ART_AUDIO §5.2, a
  pre-seeded `int.<id>.*` set for every interior, `fighter.<n>`, `city.<id>.*`; the only colour
  literals in `js/`), `SR.art.paper.grain()`, `SR.art.draw.{inkStroke, paperFill, tone, roundRect,
  poly, text, shadow}`, `SR.art.stick.{draw(ctx, pose, opts), clip(name, t), poses}`,
  `SR.art.portraits.draw(ctx, personId, size, mood)`, `SR.art.vehicles.draw(ctx, type, dir, x, y,
  opts)` (including the Fold Rescue plane), `SR.def.icon` registrations and `SR.art.icon(ctx, name,
  x, y, size)`, `SR.art.iconURL(name, size)`, `SR.art.logo.draw(ctx, t)`, `SR.art.bible.draw(ctx)`,
  `SR.art.interior(id)` factory for kit-defined interiors (`drawStatic`, `drawAnim`; colours as
  palette keys). `palette.js` and `icons.js` are Node-loadable (no drawing at load time).
- **Acceptance:** every icon of ART_AUDIO §10; the rig with every clip of ART_AUDIO §7 in 4 city
  facings and side view; all 10 karma bands each side; every named person's look; 8 vehicle types
  in 8 directions; drawing one city character ≤ 0.08 ms and one portrait ≤ 0.5 ms (measured in the
  sheet, calibrated as in ARCHITECTURE §17); the kit draws the ART_AUDIO §9 McSticks example from
  palette keys; the art bible screen is complete; the validator finds no colour literal outside
  `palette.js`.
- **Tests:** contact sheets captured by `tests/e2e/sheets.test.cjs` (owned by W1-Q) with no errors.

### 3.7 W1-W World geometry

- **Files:** `js/data/worldmap.js`; `js/data/actions/world.js`; `js/data/text/en-world.js`;
  `js/world/{geometry,collision,nav,camera,player,doors,fall,world}.js`;
  `tests/node/invariants.test.cjs`; `tests/e2e/world.test.cjs`.
- **Depends on:** M0; W1-R (`SR.act`, stubbed until it lands).
- **Provides:** the complete world map of GDD §3 in the ARCHITECTURE §8.1 format (outline, `newLand`,
  holes, railings, walls, every street, path, junction, zebra and portal, every building's masses,
  door, kerb point and signature, people's spots, interactables, home lots, park features, sky
  islands, scraps, spawn points; lamps and trees generated from seeded rules and kept 24 u clear of
  porches); `SR.world.geometry` (walkable polygon, projected rects, porches), `collide`, `nav`,
  `camera`, `player` (vehicle surfaces, parking, people hopping aside), `doors` (the resolver of
  ARCHITECTURE §8.4, the trigger dwell with the 45° rule, re-arm, prompt ranges), `fall` (with
  Safe edges), `update`; the sidewalk graph and nav grid; the world actions (`world.fall`,
  `carHit`, `carCrash`, `carFished`, `enter`) and their text (place names, door tags, world toasts).
- **Acceptance:** every §8.1 invariant passes, including the visibility rule (no porch or signature
  covered by another building's projected rect), the door-face rule with its two listed exceptions,
  `newLand`, reachability (within 32 u of a connected nav cell) and scraps ≥ 64 u from edges; a
  headless walker visits every sidewalk-graph node without getting stuck; walking along the Main
  Street sidewalks past every east / west door enters none of them, and walking into each door
  enters it; exiting never re-enters; falls trigger at 200 sampled unrailed edge points and never
  through railings or the castle wall, and never with Safe edges; walk / skate / junker / sports
  speed ratios 1 / 2 / 3 / 5 within 2 %; a car on a sidewalk is capped at 200 u/s; "Park and enter"
  works at every door's kerb; teeter grace saves when reversing within 150 ms; click-to-walk reaches
  every door and every scrap from the apartment; the door resolver returns Live / Owned / For Sale
  correctly for all four home doors in 8 ownership states; the camera clamps to the island bounds
  ±480.
- **Tests:** as listed.

### 3.8 W1-G Render core

- **Files:** `js/render/{renderer,sky,ground,buildings,actors,lighting,particles,worldui,fx}.js`;
  `js/art/exteriors.js`; `tests/sheets/exteriors.html`; `tests/e2e/render.test.cjs`.
- **Depends on:** W1-W data, W1-A palette and draw (placeholders until they land).
- **Provides:** `SR.render.{frame(ctx, alpha), invalidate(what), stats(), fx.transition(kind, swap),
  fx.confetti(), fx.jolt()}`, `SR.render.sky.drawWindow(ctx, rect)`, `SR.art.exterior.build(def,
  zoom, dpr)` with every archetype, masses and door treatment (south step, east / west awning, the
  north porch and canopy); chunk baking at the current zoom with the 40-chunk LRU; the building
  sprite cache (lazy, 1.5-screen window, 12 Mpx LRU, sprite DPR ≤ 1.5, flat placeholders until
  baked); the Y-sorted pass with occlusion fade; grade and emissive passes with the ART_AUDIO §2.2
  keyframes (window rect batches and small neon sprites, no full-size emissive canvases);
  particles; world UI (tags, prompts, float texts, route line); a debug hour scrubber and the
  projected-rect overlay.
- **Acceptance:** the whole island renders with torn edges and the thickness band, the Dog-Ear flap,
  the Bus Hole, the sky and distant-island placeholders; every building drawn by its archetype and
  masses with its palette and door treatment, the north porches visible; zoom levels 0.8 / 1.0 /
  1.25; lighting at every keyframe hour; `SR.render.stats()` stays within the memory budgets of
  ARCHITECTURE §17 at 1920×1080, DPR 1 and 2, every zoom, after a full-map camera tour; the perf
  test (stub actors: 40 walkers, 14 cars) meets the calibrated CPU and draw-count budgets on High;
  screenshots at 08:00, 13:00, 19:00, 23:00.
- **Tests:** as listed.

### 3.9 W1-S Audio

- **Files:** `js/audio/{engine,synth,sfx,music,ambience}.js`; `js/audio/songs/{paper_sky,crossroads_strut,
  home_sweet_paper}.js`; `tests/sheets/sound.html`; `tests/node/music.test.cjs`;
  `tests/e2e/audio.test.cjs`.
- **Depends on:** M0.
- **Provides:** `SR.audio` API (ARCHITECTURE §12) including `renderOffline`; the frozen song and sfx
  data formats (ART_AUDIO §13.8) and their validator (sent to W1-K for `CONTRACT.md` in the first
  hour); every SFX recipe of ART_AUDIO §13.5; the instruments of §13.2; ambience beds of §13.6;
  captions; suspend on a hidden tab.
- **Acceptance:** the sound-test page plays every sfx and the three songs; the objective audio test
  of ARCHITECTURE §18 passes for every sfx and the three songs (peaks, RMS, no clicks, loop seam,
  no NaN or denormals, pattern lengths, the leitmotif at the `motif` annotations of `paper_sky` and
  `crossroads_strut`); tempo holds within 1 ms over 60 s (scheduler test); cross-fades and ducking
  work; ≤ 24 voices under a stress button; offline rendering of 60 s of the busiest song plus the
  sfx stress costs ≤ 3 % of real time (calibrated); the context unlocks on the first key, click or
  tap and not on a gamepad button; the song-data validator passes.
- **Tests:** as listed.

### 3.10 W1-M Minigame framework and engines

- **Files:** `js/minigames/{framework,shiftrush,timingring,duel}.js`; `js/scenes/minigame.js`;
  `tests/sheets/minigames.html`; `tests/e2e/minigames.test.cjs`.
- **Depends on:** M0, W1-D components, W1-A draw.
- **Provides:** `SR.minigame.{register, run}`, `SR.def.skin`, the frame of UI §5.8 (context input maps
  pushed and popped, the accessible state mirror and `host.aria`, the Hardcore `pending` hook),
  Auto / Assist / pause, the three reskinnable engines with their stance (the counter table of
  B-30), sweet-arc (difficulty steps) and grading rules (m clamped to 0.7-1.3), driven by skins;
  test skins inside the sheet.
- **Acceptance:** each engine plays with keyboard, mouse, mocked gamepad and touch; the context map
  shadows the city keys while open; Auto returns a **sampled** outcome from `host.rng` (a Duel Auto
  over 10⁴ seeded runs matches the analytic win rate within ±2 %; the hotwire Auto hit rate equals
  arc / 360°; Shift Rush and pitch Auto return m = 1.0 exactly); pause freezes timers; outcomes that
  touch rules use `host.rng`; stance mode applies the counter table (halved and doubled D) and the
  hint accuracy formula; results have the ARCHITECTURE §10 shapes; the aria mirror announces each
  beat.
- **Tests:** as listed.

### 3.11 W1-Q Quality tooling

- **Files:** `tools/{validate.cjs,banned.txt,shingles.cjs,run-all.cjs}`; `tests/node/shuffle.test.cjs`;
  `tests/e2e/{shuffle,a11y,sheets}.test.cjs`; `tests/visual/visual.cjs` (+ `goldens/`);
  `tests/perf/{perf.cjs,calibrate.js,baseline.json}`; `tests/balance/{sim.cjs,bots.cjs}` (scaffold).
- **Depends on:** M0.
- **Provides:** the validator of ARCHITECTURE §18 (mode `all` loading, `--wave N`, feature, repeatable,
  `hpAbove`, palette-key, colour-literal, text-length and song-format checks), `banned.txt`
  (Appendix A), the shingle check against `../stick-rpg/js/**` string literals (8-word runs, case-
  and punctuation-insensitive), the binary check on tracked files, the shuffled-load tests, the
  visual-golden tool (record and compare modes, preset pinned), the perf runner with the calibration
  factor and the relative gate, the a11y audit, the sheets smoke test, the balance-sim scaffold
  (loads rules in Node, runs a bot interface `decide(state, ctx) → actionId + params` for N days,
  prints CSV), and `run-all`.
- **Acceptance:** every tool runs on the M0 stub tree and on the wave-1 result; the banned check
  fails on a planted string (each list: substring, `[word]`, `[upper]`, `[only-in]`) and passes
  otherwise; the shingle check finds a planted 8-word run; the validator fails on a planted colour
  literal, a P1 def without `feature`, a `repeatable` robbery and a `hurt` without `hpAbove`, and
  `--wave 1` downgrades stub-owned text keys to warnings; the golden tool detects a 1-cell change;
  the perf gate fails a planted 25 % regression; the sim runs 20 seeds × 100 days with a trivial
  bot in under 30 s.

### 3.12 Wave 1 exit: the grey-box vertical slice (lead integration)

With the real modules: boot → title (stub menu) → new game (defaults) → the apartment's building
scene (door resolver: Paperview, Live mode) with the card (Messages, Sleep rows from placeholder
data) → Leave → walk on the real map (render core painter, real geometry, a placeholder stick) →
enter McSticks (placeholder interior, real card) → Fries (+20 HP, $12, 30 m) and Work Full ($42, 6
h, +1 karma) through `SR.act` → walk home → Sleep → a placeholder report with sections → Save →
reload → equal state. Falls work at the Main Street south end; a debug-forced HP 0 runs
`SR.rules.health.down` (the hospital night; the scene itself is a stub until W2-Transit) and the
city resumes the next day at 12:00 outside Paperview. A test sub-screen opens from a card row. The minigame
scene runs a Timing Ring test skin with a context map. The sound test plays. All wave-1 suites pass;
zero console errors.

## 4. Wave 2: The Remastered Original (15 packages, P0)

Every package works on P0 content (P1 rows may be added to data behind their `feature` flags, but
are not required). Each building package owns the building's data file, its interior, its
sub-screens, its skins, its text file, its `:resolve` actions and its tests.

### 4.0 The rules desks (W2-RulesE, W2-RulesC)

Two small packages keep the rules moving while 13 feature packages build on them; they replace
"lead (requests)" for rule files in wave 2. They answer requests in `docs/requests/*.md` continuously
(not only at integration), fix bugs found by the feature packages, add named functions the data
needs, and keep every Node suite green.

| Package | Files owned in wave 2 | Scope |
|---|---|---|
| **W2-RulesE** | `js/rules/{state,check,conditions,effects,act,time,stats,log,perks,jobs,training,night,bank,stocks,homes,calendar,endgame,health,news}.js`; `js/data/{tuning,perks,items,jobs,homes,furniture,stocks,ranks}.js`; `js/data/text/{en-prog,en-econ}.js`; their Node tests | the kernel and the economy (successor of W1-R and W1-E) |
| **W2-RulesC** | `js/rules/{crime,trade,fight,casino,election}.js`; `js/data/{cities,decrees}.js`; `js/data/text/en-conflict.js`; their Node tests | crime, trips, fights, casino, election (successor of W1-C) |

Acceptance: every request answered (applied or rejected with a reason) before the wave's
integration; all Node suites green at every hand-off; changes to public names only through the
lead.

### 4.1 W2-City

- **Files:** `js/scenes/city.js`; `js/world/{traffic,pedestrians}.js`; `js/render/minimap.js`;
  `js/data/text/en-city.js`; `tests/e2e/{city,traffic,crowd}.test.cjs`. Wave-2 owner of
  `js/data/worldmap.js` (fixes only), `js/data/actions/world.js` and `js/data/text/en-world.js`.
- **Depends on:** W1-W, W1-G, W1-D (HUD), W1-A (stick, vehicles), W1-R.
- **Provides:** the `city` scene (world update and render, HUD, context prompt and door tags within
  their ranges, entering buildings via `SR.world.doors.resolve` and `SR.scenes.go('building', {
  id, params })`, street people via `SR.scenes.push('dialog')`, the Fold Rescue presentation with
  Pilot Ori's lines, car hits and crashes, the car fished out of the clouds, the 24:00 state, the
  cab stub, the `minimap` action); traffic (GDD §3.10, B-22, T-junction branch odds); pedestrians
  (GDD §3.11 basic; hopping aside from your car); the minimap.
- **Acceptance:** a 30-minute soak (at ×8 step speed) with no stuck or overlapping cars; cars drop in
  at portals and tumble off road ends; a scripted player in a lane is hit (-10 HP, knockdown 1.14 s,
  a voicemail next morning) or braked for per the notice formula (Monte Carlo ±3 %); zebras always
  stop cars; pedestrian counts follow the hour table × the pinned preset's crowd factor; your car
  never hurts a pedestrian or a named NPC; a fall costs 10 HP, no time, and lands ≥ 64 u inside; a
  fall or car hit at 10 HP reaches the hospital flow (Standard) and death (Hardcore); the minimap
  shows doors and the player.

### 4.2 W2-Exterior

- **Files:** `js/art/{exteriors-detail,props,logos,skyline}.js`; `tests/sheets/exteriors-detail.html`.
- **Depends on:** W1-G painter, W1-A.
- **Provides:** the ART_AUDIO §5.2 detail for all 16 buildings through `SR.def.exterior(id, { detail,
  signature })` (≤ 150 lines each; Node-loadable) including the north porches' sign posts and
  canopies, For Sale signs and the hooks for reacting elements (billboard, flags, statue, bunting,
  posters, memorial) driven by state (drawn only when their flags are on); props (ART_AUDIO §6;
  kept 24 u clear of porches); the six distant islands and the Sky Ribbon; road-end sawhorses.
- **Acceptance:** the contact sheet shows every building at 3 zooms by day and night; a veteran
  recognises each original building by colour and silhouette (review against ART_AUDIO §5.2);
  the visibility invariant still passes with the detail drawn (signature rects registered);
  sprite build ≤ 30 ms per building per zoom (calibrated), spread over frames mass by mass.

### 4.3 W2-Home

- **Files:** `js/data/buildings/home.js`; `js/art/interiors/home.js`; `js/ui/subscreens/{tv,messages,
  stocks}.js`; `js/ui/screens/report.js`; `js/scenes/report.js`; `js/data/text/{en-home,en-news}.js`;
  `tests/e2e/home.test.cjs`.
- **Depends on:** W1-E / W2-RulesE (night, stocks, homes, news), W1-D (card, sub-screen host), W1-W
  (door resolver), W2-Money (`bank.realestate`, for Tour), W1-A kit.
- **Provides:** the home card in its three modes (GDD §3.6): **Live** (Sleep, Messages, TV, Computer,
  Save, Campaign HQ shortcut), **Owned** (the interior with Move in, Let out / End the let behind
  `homesPlus`, Sell via `bank.realestate`, Leave) and **For Sale** (the For Sale card with Tour →
  `bank.realestate` focused on the home, and Leave), plus Paperview's "Top floor: Tour"; the five
  home interiors with every furniture piece drawn in place; the sub-screens `home.tv`,
  `home.messages` (inbox with archive and the 150 cap) and `home.stocks` (no shorts; the tip shown
  only once revealed); the report scene with every edition (morning, Stick General, election night)
  laid out by line `section`; 20 headline templates keyed by B-29 kinds, 30 news stories, 10
  fitness and 10 dating shows.
- **Acceptance:** sleeping from each home applies B-07; pills and alarm give a 00:00 wake; the
  report shows each section of GDD §4.7 and never today's tip or tomorrow's forecast unrevealed; the
  headline follows B-29 for a scripted log; the last day of a timed game leads to the results; every
  home door opens the right mode in 8 ownership states and Tour buys a home through
  `bank.realestate`; buying a furniture piece shows it in the interior; stocks trade with fees,
  spread and the cap, and cannot go short.

### 4.4 W2-Food

- **Files:** `js/data/buildings/{mcsticks,store}.js`; `js/art/interiors/{mcsticks,store}.js`;
  `js/minigames/scratch.js`; `js/minigames/skins/{orderup,holdup}.js`; `js/data/text/en-food.js`;
  `tests/e2e/{mcsticks,store}.test.cjs`.
- **Depends on:** W2-RulesE, W2-RulesC (robbery), W1-M (duel, shiftrush).
- **Provides:** McSticks (food, work as cook, the Order Up skin behind the `hustles` flag), Funkytown
  Five-O (snacks, smokes, pills, robbery with the Hold-up skin and its `:resolve` action; P1 rows
  behind `shopsPlus` / `stockTips`: paper, scratch, gum), their interiors and proprietors (Mel, Dee).
- **Acceptance:** every price, HP value and time of B-06 after the B-28a modifiers; refusal at full
  HP; food rows repeat, the robbery row never does; robbery requires a gun and ≥ 10 ammo and a start
  before 21:00 (20:30 yes, 21:00 no), sends the clock to 24:00, uses 5-9 ammo, costs -10 karma win
  or lose, and pays or jails per B-11b; Auto plays the Hold-up with real rolls.

### 4.5 W2-Goods

- **Files:** `js/data/buildings/{pawn,furniture}.js`; `js/art/interiors/{pawn,furniture}.js`;
  `js/ui/subscreens/{shop,furniture}.js`; `js/data/text/en-goods.js`; `tests/e2e/{pawn,furniture}.test.cjs`.
- **Depends on:** W2-RulesE (homes, items), W1-D, W1-A kit.
- **Provides:** the pawn shop (`pawn.shop`: P0 items; P1 rows behind flags, including the clean
  shirt behind `arcs`), Fine Line (`furniture.browse`) with the slot rules, the P0 satellite, the
  live preview of a piece in the home interior (P1 flag), proprietors Vinnie and Sofia.
- **Acceptance:** B-06 pawn prices and stacks (ammo refused at ≥ 95); furniture slots per home;
  items that don't fit show "Needs a free slot"; bought pieces work at the next sleep.

### 4.6 W2-Money

- **Files:** `js/data/buildings/{bank,nli}.js`; `js/art/interiors/{bank,nli}.js`;
  `js/ui/subscreens/{bank,realestate,jobs}.js`; `js/minigames/skins/{sortit,pitch,boardroom}.js`;
  `js/data/text/en-money.js`; `tests/e2e/{bank,nli}.test.cjs`.
- **Depends on:** W2-RulesE, W2-RulesC (bank robbery), W1-M, W1-D (sub-screen host).
- **Provides:** the sub-screens `bank.deposit`, `bank.withdraw`, `bank.loan` (with the lien and the
  freeze), `bank.rates`, `bank.cds` (P1), `bank.realestate` (buy, move in; `homeId` focus for Tours
  and the phone; sell and let behind `homesPlus`), `nli.jobs`; bank robbery (once a week) with its
  `:resolve`; NLI apply, promote (missing requirements listed), work Full; the skins behind
  `hustles`; proprietors Penny Wise and Bea / Terry; promotion voicemails.
- **Acceptance:** B-09 rules through the UI, including default per difficulty (seizure order, lien,
  karma, freeze) and the interest cap; the promotion ladder at every threshold (INT, CHA, shifts);
  the weekly bonus; bank robbery rules of B-11b; `bank.realestate` works when pushed from a home
  door and from the Pocket.

### 4.7 W2-Civic

- **Files:** `js/data/buildings/{uofs,cityhall}.js`; `js/art/interiors/{uofs,cityhall}.js`;
  `js/ui/subscreens/{transcript,campaign}.js`; `js/minigames/skins/debate.js`;
  `js/data/text/en-civic.js`; `tests/e2e/{uofs,election}.test.cjs`.
- **Depends on:** W2-RulesE (training), W2-RulesC (election), W1-M (duel), W2-Home (the
  election-night edition).
- **Provides:** U of S (study, business class, gym; P1 rows behind flags); City Hall's Election
  Office (`cityhall.campaign`): the nomination acceptance (14 days), the war chest (cash, then bank),
  the 7-day campaign with caps, halving and the rival's gain, the debate on day 4 (and its
  no-show), election night text for the report, the office salary; the rivals and the Electoral
  Board's call; proprietors Dean Quill and Clerk Plume.
- **Acceptance:** B-03 values for study, class and gym (+1 karma, max +3 a day; "Too hurt" at HP ≤
  4); nomination per B-17 (castle, $200k cash + bank, 666 / 777 and karma sign) and its lapse; poll
  maths examples, caps and clamp; a debug-assisted run from nomination to office passes; campaign
  days in jail still count; a loss allows a new nomination 30 days later.

### 4.8 W2-Night

- **Files:** `js/data/buildings/{bar,casino}.js`; `js/art/interiors/{bar,casino}.js`;
  `js/minigames/{fight,darts,slots,blackjack,roulette}.js`; `js/data/fighters.js`;
  `js/data/text/en-night.js`; `tests/e2e/{bar,casino,fight,darts}.test.cjs`.
- **Depends on:** W2-RulesC, W1-M framework, W1-A (fight rigs).
- **Provides:** Sticky's (beer, bottle, bar fight with the 12-regular ladder and Quick fight, darts
  practice, Buzz cut-off), the casino (slots, blackjack with its context map and 60-hand day,
  roulette with every bet type and C to clear), every `:resolve` action, the "(it froze)" joke,
  proprietors Sticky and Lucky Lou, fighters' taunts, the accessible state mirror of each game.
- **Acceptance:** fight AP, moves and enemy table per B-13 in a scripted fight; a Standard loss
  leaves HP 1 and never reaches the hospital; the wallet choice (-3 karma); gambling karma -1 per
  pull, spin and hand, capped at -10 a day; slots pay per B-14a; blackjack and roulette rules per
  B-14b/c through the UI; H / S / D never move the player or toggle the HUD during blackjack; darts
  ring radii, aim model and wobble per B-14f; screen-reader announcements for each game.

### 4.9 W2-Transit

- **Files:** `js/data/buildings/bus.js`; `js/data/actions/{jail,trip,hospital}.js`;
  `js/art/interiors/{bus,special}.js`; `js/ui/subscreens/bus.js`; `js/ui/screens/{jail,hospital}.js`;
  `js/scenes/{jail,hospital,death,bustrip}.js`; `js/data/text/en-transit.js`;
  `tests/e2e/{bus,jail,hospital}.test.cjs`.
- **Depends on:** W2-RulesC (trade, crime), W2-RulesE (night subsets, health).
- **Provides:** the depot's board (`bus.board`), the red-eye (00:00 only), the trip scene and event
  cards (`trip.take`, `trip.haggle`, `trip.walk`, `trip:resolve`), jail (`jail.day` choices, the jail
  night, the one-line report, `jail.bail` behind `police`, timed-game end in jail), the `player:down`
  listener that queues the hospital or death scene, the hospital flow (FLATLINED gag, bill card,
  Stick General edition via W2-Home's report, `hospital.discharge`, 12:00 at the home door), and
  FLATLINED on Hardcore.
- **Acceptance:** trips only at 00:00 with a ticket; the original check order with fixed seeds; the
  bust threshold with Heat; jail length; the game can end in jail and in hospital; the hospital bill
  per difficulty with the shortfall written off; a fall at 5 HP inside a dialog waits for the dialog
  to close before the hospital scene.

### 4.10 W2-Street

- **Files:** `js/data/people.js`; `js/data/buildings/street.js`; `js/world/streetnpcs.js`;
  `js/minigames/skins/hotwire.js`; `js/data/text/en-street.js`; `tests/e2e/street.test.cjs`.
- **Depends on:** W2-City (dialog entry), W1-D dialog (NumberField choices), W1-A portraits.
- **Provides:** Harold ($10 and bottle gifts with the first-gift charm bonuses), Skid (packs, the
  skateboard, the 10th-pack death and McHolland's call), Red (product at $400 bought as n grams,
  max 99), the junker (hotwire at INT 350, 1 h; failure below it, 1 h), the day-1 job offer and every
  original voicemail beat in new words, the P0 schedules of GDD §6.2 and dialogue.
- **Acceptance:** every B-26 P0 row reproduced (tests mirror the recreation's numbers: +6 CHA first
  $10, +8 CHA first bottle, +2 karma and 60 min per $10, 60 min and no karma per bottle; 60 min and
  -2 karma a pack; -30 karma and removal at 10 packs; Red: no time, -ceil(n/10) karma; hotwire needs
  INT 350, fails and costs 60 min below it, and fits the wall).

### 4.11 W2-Front

- **Files:** `css/screens.css`; `js/scenes/{boot,title,newgame,intro,results}.js`;
  `js/ui/screens/{title,newgame,pause,settings,saveload,results,halloffame,credits,profile}.js`;
  `js/art/intro.js`; `js/data/text/en-front.js`; wave-2 owner of `js/data/text/en-ui.js`;
  `tests/e2e/{frontend,settings,saveslots,results}.test.cjs`.
- **Depends on:** W1-K, W1-D, W1-A logo, W2-RulesE endgame, W1-S.
- **Provides:** boot ("Press any key or click", the pad note), title (live city backdrop, save card,
  Classic link with the Back note, Achievements → the `profile` scene), the new-game wizard (orig
  roll, Fair start, name TextField, cheat name), the intro, pause, settings (all tabs; remapping UI
  basic incl. contexts; Safe edges and No gusts), save / load UI with More (codes, textarea
  fallback, files), the results page (count-up, stamp, banners, Copy summary format, Hall of Fame
  buckets), Hall of Fame (P1 flag), the profile scene, credits with the fan note and the return
  link.
- **Acceptance:** a new game with each length and difficulty; `PAPERGOD` applies B-02; Classic opens
  `../stick-rpg/index.html` after a suspend save; results show the right rank at every B-18
  boundary (debug-set net worths); Copy summary matches UI §5.14; settings persist across reloads;
  the profile scene opens with no game running. Each overlay (pause, settings, save / load)
  registers its own scene in its own file.

### 4.12 W2-Pocket

- **Files:** `js/ui/pocket/{pocket,journal,map,stats,bag,phone,achievements}.js`;
  `js/data/actions/{bag,phone}.js`; `tests/e2e/pocket.test.cjs`.
- **Depends on:** W1-D (sub-screen host), W1-W (map data), W1-A icons, W2-RulesE.
- **Provides:** the notebook and its tabs (UI §5.9): Journal (First Day list, Help), Map (pan, zoom,
  pins, waypoint), Stats, Bag (`bag.smoke`, `bag.eatTakeout`, `bag.give`, the pill toggle, Info),
  Messages, Phone (P1 flag: the apps and the contacts table as actions and `SR.def.contact`),
  Achievements (placeholder until wave 3).
- **Acceptance:** every tab by keyboard, mouse, gamepad and touch (lists scroll by touch); smoking
  from the Bag (orig rules, "Too hurt" at HP ≤ 10); Give from the Bag runs the same action as the
  dialog row; a waypoint leads the click-to-walk route.

### 4.13 W2-Music

- **Files:** `js/audio/songs/{streetlights,fry_day,funky_aisle,pawnbroker_blues,showroom_smooth,
  compound_interest,please_hold,campus_canon,last_call_shuffle,high_roller_lounge,brawl_hall,
  tick_tock_trouble,midnight_express,hail_to_the_stick,doing_time,waiting_room,morning_edition,
  final_edition,stingers}.js`; `tests/sheets/music.html`.
- **Depends on:** W1-S (the frozen formats).
- **Provides:** every song and stinger of ART_AUDIO §13.4 with the leitmotif and its `motif`
  annotation where listed.
- **Acceptance:** each song and stinger passes the objective audio test (ARCHITECTURE §18: peak ≤
  -10 dBFS, RMS in range, no clicks, loop seam ≤ 0.05, no NaN or denormals, pattern lengths, the
  leitmotif at its annotations); tempo holds; the sheet plays each one. Ear review is optional
  and done by the user.

### 4.14 Wave 2 exit: "Remastered Original"

- Every P0 row of GDD §6.1 works through the UI; every original street interaction; the five
  original minigames; the election; results; all three difficulties; all four lengths.
- A scripted **40-day run** through `SR.debug` (a bot that works, studies, buys the bed, TV and
  alarm, robs the store once, smuggles once, falls at low HP once and sleeps) reaches the results
  with zero console errors, and a **debug-assisted election run** (stats and money set, castle
  bought) reaches office through the election-night edition.
- The lead captures `tests/fixtures/save-v1-wave2.json` (a mid-game v1 save with the satellite) for
  the wave-3 v2 migration.
- Veteran review: a reviewer agent compares the city and each building with the original's
  reference screenshots for topology and identity (not look).
- The lead tags this commit as the fallback release.

## 5. Wave 3: The expanded game (10 packages, P1)

The lead flips each package's feature flags at integration when its acceptance passes. §7 lists
the ownership transfers for this wave. At the wave-3 integration the lead bumps the save schema to
**v2** (`js/core/save.js` migration: the P0 `satellite` → the `skydish` tier; ARCHITECTURE §15)
and tests it on the wave-2 fixture. Rule files move from the rules desks to the wave-3 owners below.

### 5.1 W3-Life (arcs, encounters, events)

- **Files:** `js/rules/{encounters,arcs}.js`; `js/data/{encounters,arcs,events}.js`; `js/world/markers.js`;
  `js/minigames/skins/{interview,interrogation}.js`; `js/data/text/en-events.js`; takes over
  `js/data/people.js`, `js/data/buildings/street.js`, `js/world/streetnpcs.js`, `js/data/text/en-street.js`;
  `tests/node/{arcs,encounters}.test.cjs`; `tests/e2e/life.test.cjs`.
- **Provides:** GDD §6.2 arcs on the rule events of ARCHITECTURE §6.8 (Harold's comeback with the
  `interview` skin and his barfly branch, their exclusivity, Skid's good branch and skate contest
  window, Red's credit line, goons and replacement, McHolland's informant offer, weekly tip and
  bribe, and the `interrogation` skin), the P1 schedules, the 14 encounters (B-20: caps, windows,
  HP guards), city events (B-19) and campaign events, shift events (24: 3 per rank).
- **Acceptance:** each arc completes in a scripted e2e run, and each branch-closing step closes the
  other branch; encounters spawn 1-3 a day with the weights, caps, windows and conditions (night
  encounters never at 00:00-04:00 on a normal day); every event's choices apply their numbers.

### 5.2 W3-Park (park, Point Margin, Theory of the Fold)

- **Files:** `js/data/buildings/park.js`; `js/data/text/en-park.js`; takes over `js/art/props.js`,
  `js/data/worldmap.js` and `js/data/text/en-world.js`; `tests/e2e/park.test.cjs`.
- **Provides:** jog, chess (Professor Crease), ducks, bench nap, the skate bowl, the binoculars,
  Brother Margin, the 5 Torn Scraps with their conditions, the finale and the Fold Map.
- **Acceptance:** each walk-up works with its B-27 numbers; the scraps quest completes in a scripted
  run (with debug time and weather) using click-to-walk to each scrap; scraps 3 and 5 only appear
  under their conditions; the §8.1 invariants still pass.

### 5.3 W3-Light (lighting, weather, the city reacts)

- **Files:** `js/world/weather.js`; `js/render/{shadows,weatherfx}.js`; takes over `js/render/{sky,
  lighting}.js`, `js/art/{exteriors-detail,skyline}.js`, `js/data/text/en-news.js`;
  `tests/e2e/light.test.cjs`.
- **Provides:** sun shadows by preset, weather visuals and gusts (with No gusts and Safe edges),
  the forecast reveal in the HUD tooltip, the time-lapse on exit (listens to `door:exited` with the
  minutes spent), lamp and neon timing, the city-reacts table (GDD §3.14, crowd reactions at ±50)
  and its headlines.
- **Acceptance:** screenshots at the 9 keyframe hours × 5 weathers; perf within budget on each preset;
  every reaction appears when its trigger is set by debug.

### 5.4 W3-Prog (perks, achievements, advisor, Hall of Fame)

- **Files:** `js/rules/{achievements,advisor}.js`; `js/data/achievements.js`; `js/ui/screens/perk.js`;
  takes over `js/rules/perks.js`, `js/data/perks.js`, `js/data/text/en-prog.js`,
  `js/ui/pocket/{journal,stats,achievements}.js`, `js/ui/screens/{halloffame,results,profile}.js`,
  `js/ui/hud.js`; `tests/node/{achievements,advisor}.test.cjs`; `tests/e2e/prog.test.cjs`.
- **Provides:** the perk card and every perk's rule hook (B-21; hooks already in rules behind flags);
  48 achievements with the profile store and their text in `en-prog.js`; the Advisor, its
  tracked-goal line on the HUD and the Road to Office; the Hall of Fame, the legacy score, the
  profile scene's tabs and the results page's net-worth and stat graphs.
- **Acceptance:** every achievement unlockable by a debug scenario; perks change exactly their rule;
  the Advisor never suggests an impossible goal (fuzzed over 1,000 random states).

### 5.5 W3-Econ (economy depth)

- **Files:** takes over `js/rules/{bank,stocks,homes,jobs,calendar,training}.js`,
  `js/data/{items,jobs,homes,furniture,stocks,ranks}.js`, `js/data/text/en-econ.js`,
  `js/data/buildings/{bank,nli,mcsticks,home,furniture,uofs,store,pawn}.js`,
  `js/data/actions/phone.js`, `js/ui/pocket/phone.js`,
  `js/ui/subscreens/{bank,realestate,stocks,furniture,transcript,jobs}.js`; `tests/e2e/econ.test.cjs`.
- **Provides (enables and presents):** CDs, letting and selling, tier-2 furniture and home perks,
  Nap, Leftovers, the daily tip across its sources, Workstation phone trading and the catalogue,
  Market Watch, online course, Half and Overtime shifts, the hustles (Auto default) and rating, the
  CEO takeover, Shift Manager, degrees and seminars, the weekly calendar prices, the Daily Fold,
  scratch cards, gum, knuckles, vest, used skateboard, Sell at the pawn shop, the Phone's apps and
  contacts table (UI §5.9).
- **Acceptance:** each feature through the UI with its BALANCE numbers; stock profit share < 25 % in
  the sim (with W3-Balance); the tip is never visible before a source reveals it.

### 5.6 W3-Nightlife

- **Files:** `js/ui/subscreens/vip.js`; takes over `js/rules/{fight,casino}.js`,
  `js/data/fighters.js`, `js/data/buildings/{bar,casino}.js`, `js/art/interiors/{bar,casino}.js`,
  `js/minigames/{fight,darts,slots,blackjack,roulette}.js`, `js/data/text/en-night.js`;
  `tests/e2e/nightlife.test.cjs`.
- **Provides:** Buzz effects, Mingle, Open Mic, darts matches (3 a day), Guard, Buy a drink,
  Champion, the Underground Ring, the VIP desk (`casino.vip`), the pit boss for everyone, card
  counting and the back-off, the Classic cabinet.
- **Acceptance:** B-13 ring scaling in a scripted fight at STR 300 and 800; VIP thresholds; the
  back-off triggers at the suspicion threshold with a scripted counting strategy; the counting sim
  of B-14b stays ≤ +0.3 % of the amount wagered (with W3-Balance); darts Auto EV against the Rookie
  at INT 100, Buzz 0 is ≤ 0.

### 5.7 W3-Crime (police, civic, trade)

- **Files:** `js/world/police.js`; `js/ui/subscreens/mayor.js`; `js/minigames/skins/tourhook.js`; takes
  over `js/rules/{crime,trade,election}.js`, `js/data/{decrees,cities}.js`,
  `js/data/buildings/{cityhall,bus}.js`, `js/data/actions/{jail,trip}.js`,
  `js/ui/subscreens/{bus,campaign}.js`, `js/data/text/{en-civic,en-transit,en-conflict}.js`;
  `tests/e2e/crime.test.cjs`.
- **Provides:** officers on foot with Talk / Bribe / Run and pursuit, wanted posters (with W3-Light),
  the Precinct desk (fines, bail with the net-worth rate, McHolland's rows), charity box, soup
  kitchen, the city-event rows (Blood Drive, Recycling Drive), kiss babies and campaign events, the
  Mayor's Office (3-card offers, path and once rules, Rename the City's TextField) and every
  decree's effect, speaking tours (requirements, weekly limit, window) with the hook, haggling,
  reputation and the Rumour board.
- **Acceptance:** B-11d numbers; each decree's rule verified; tour fees, requirements and the weekly
  limit per B-12; haggle odds; bail per B-11c.

### 5.8 W3-Onboard

- **Files:** `js/ui/tutorial.js`; `tests/e2e/onboarding.test.cjs`.
- **Provides:** the Day 1 script and one-shot hints of UI §9, re-readable in Help; coach marks.
- **Acceptance:** a scripted player that only follows prompts and waypoints completes Day 1 (message,
  food, a shift, a study, sleep) with no other input.

### 5.9 W3-Input (input and accessibility polish)

- **Files:** takes over `js/core/input.js`, `js/ui/focus.js`, `css/{base,components}.css`,
  `js/ui/screens/settings.js`; `tests/e2e/{a11y-full,input-full}.test.cjs`.
- **Provides:** full remapping with conflicts, glyph sets, haptics, every UI §8 option verified, touch
  layout polish.
- **Acceptance:** a keyboard-only 15-day run, a gamepad-only run and a touch-only run through the
  harness; every setting changes its target; contrast audit on every screen.

### 5.10 W3-Balance

- **Files:** takes over `js/data/tuning.js`, `tests/balance/{sim.cjs,bots.cjs}`; writes
  `reports/balance-report.md`.
- **Provides:** the Grinder, Saint, Kingpin and Tourist bots with normal and expert (assisted-hustle)
  policies (BALANCE B-23), the band and relative assertions, the counting and darts sims (with
  W3-Nightlife), the CSV and chart output, and tuning within the B-25 protocol. Other packages
  request number changes from W3-Balance.
- **Acceptance:** every B-23 band met on the final wave-3 build; before and after curves in the
  report; changed values mirrored into BALANCE.md by the lead.

### 5.11 Wave 3 exit

All P1 flags on; the save schema at v2 with the wave-2 fixture migrating; every wave-2 and wave-3
suite green; the balance sim green, including the castle band (the expert Saint owns the castle by
day 100 in ≥ 50 % of 20 seeds; asserted over seeds, never one run); a Day-1 onboarding run passes;
visual goldens re-recorded for the 16 scenes; the lead's headed perf pass recorded in
`reports/perf-manual.md`.

## 6. Wave 4: Polish and ship (7 packages)

Fixes are owned **by area**, so QA's bug list is worked in parallel: W4-QA files each bug against the
package that owns the file (table below), and each owner fixes its own area and ships the P2 items
that live there.

| Package | Owns | Delivers | Acceptance |
|---|---|---|---|
| **W4-Perf** | `js/render/*`, `js/world/*` (code, not `worldmap.js`), `js/core/quality.js` | profiling fixes, cache tuning, Auto preset thresholds, GC hunts, the P2 lean option; QA fixes in its area | ARCHITECTURE §17 met in `tests/perf` (calibrated CPU, draw-count and memory budgets, relative gate) on High (DPR 1 and 2) and Low (×4 throttle), day and night-in-rain; the lead's headed pass at 60 fps |
| **W4-Visual** | `js/art/**`, `css/*` | the art-bible audit of every exterior, interior, icon and actor; consistency fixes; the goldens refresh; QA fixes in its area | a reviewer checklist per building and screen at 1280×720, 1920×1080 (DPR 1 and 2) and 2560×1080; goldens committed |
| **W4-Writing** | `js/data/text/*` | one voice pass over every line, greeting variants to ≥ 6 per building, headline templates to 60, TV shows | the validator's length limits; zero banned strings; zero shingles; a tone checklist |
| **W4-QA** | `tests/e2e/playthrough-*.test.cjs`, `tests/balance/*`, `reports/QA.md` | scripted full runs: 15-day Grinder, 40-day Kingpin, 100-day Saint, Unlimited to election with debug time skip, Hardcore death (HP 0 and loan default), loan default per difficulty, a reload mid-fight on Hardcore, a 1,000-day save; a bug list filed against the area owners | every run finishes with zero console errors; blockers closed by their owners |
| **W4-Rules** | `js/rules/**`, `js/data/**` (except text and `tuning.js`), `tests/node/**` | QA fixes in rules and data; P2 rules and data: Custom length (state and Hall of Fame bucket), the flea market (rules and rows), the aquarium (furniture row and Relax), wardrobe state | P2 features behind their flags pass their tests; its QA blockers closed; all Node suites green |
| **W4-UI** | `js/ui/**`, `js/scenes/**`, `js/minigames/**`, `js/core/input.js` | QA fixes in UI, scenes and minigames; P2 UI: the Custom length control, the flea market card, the wardrobe screen, extra greeting hooks | P2 features behind their flags pass their e2e tests; its QA blockers closed |
| **W4-R** (lead) | `README.md`, `docs/*`, `index.html`, `js/data/tuning.js`, `js/data/features.js` | README (play, controls, the fan note, Classic mode and the Back button), release notes, `docs/CONTRACT.md` final, tuning changes on request | §6.7 |

### 6.7 Release checklist

`node tools/run-all.cjs` green; opening `index.html` by double-click works in Chrome, Firefox and
Safari; the fan note on boot, title, credits and README; Classic mode opens and Back returns; no
binary assets among tracked files; no banned strings; perf budget met (CI gates and the headed
pass); saves from the wave-2 tag migrate; the title and the kept names confirmed by the user (GDD
§1.3); the lead's final playthrough of a Short game by hand.

## 7. Ownership transfers (authoritative)

| File(s) | Wave 1 | Wave 2 | Wave 3 | Wave 4 |
|---|---|---|---|---|
| `js/data/worldmap.js` | W1-W | W2-City | W3-Park | W4-Rules |
| `js/data/tuning.js` | W1-R | W2-RulesE | W3-Balance | lead |
| `js/data/features.js` | W1-K | lead | lead | lead |
| `js/data/text/en-ui.js` | W1-D | W2-Front | W3-Onboard | W4-Writing |
| `js/data/text/en-econ.js` | W1-E | W2-RulesE | W3-Econ | W4-Writing |
| `js/data/text/en-conflict.js` | W1-C | W2-RulesC | W3-Crime | W4-Writing |
| `js/data/text/en-prog.js` | W1-R | W2-RulesE | W3-Prog | W4-Writing |
| `js/data/text/en-world.js` | W1-W | W2-City | W3-Park | W4-Writing |
| `js/data/text/*` (others) | — | the creating W2 package | per §5 takeovers, else unchanged | W4-Writing |
| `js/rules/{state,check,conditions,effects,act,time,stats,log}.js` | W1-R | W2-RulesE | lead (requests) | W4-Rules |
| `js/rules/{jobs,training,bank,stocks,homes,calendar}.js` | W1-E | W2-RulesE | W3-Econ | W4-Rules |
| `js/rules/{night,endgame,health,news}.js` | W1-E | W2-RulesE | lead (requests) | W4-Rules |
| `js/rules/{crime,trade,election}.js` | W1-C | W2-RulesC | W3-Crime | W4-Rules |
| `js/rules/{fight,casino}.js` | W1-C | W2-RulesC | W3-Nightlife | W4-Rules |
| `js/rules/perks.js`, `js/data/perks.js` | W1-R | W2-RulesE | W3-Prog | W4-Rules |
| `js/data/{items,jobs,homes,furniture,stocks,ranks}.js` | W1-E | W2-RulesE | W3-Econ | W4-Rules |
| `js/data/{cities,decrees}.js` | W1-C | W2-RulesC | W3-Crime | W4-Rules |
| `js/data/fighters.js` | W1-C | W2-Night | W3-Nightlife | W4-Rules |
| `js/data/actions/world.js` | W1-W | W2-City | lead (requests) | W4-Rules |
| `js/data/actions/{bag,phone}.js` | — | W2-Pocket | lead (bag); W3-Econ (phone) | W4-Rules |
| `js/data/actions/{jail,trip}.js` | — | W2-Transit | W3-Crime | W4-Rules |
| `js/data/actions/hospital.js` | — | W2-Transit | lead (requests) | W4-Rules |
| `js/data/people.js`, `js/data/buildings/street.js` | — | W2-Street | W3-Life | W4-Rules |
| `js/world/streetnpcs.js` | — | W2-Street | W3-Life | W4-Perf |
| `js/data/buildings/{bank,nli,mcsticks,home,furniture,uofs,store,pawn}.js` | — | W2 creators | W3-Econ | W4-Rules |
| `js/data/buildings/{bar,casino}.js` | — | W2-Night | W3-Nightlife | W4-Rules |
| `js/data/buildings/{cityhall,bus}.js` | — | W2-Civic / W2-Transit | W3-Crime | W4-Rules |
| `js/ui/subscreens/{bank,realestate,stocks,furniture,transcript,jobs}.js` | — | W2 creators | W3-Econ | W4-UI |
| `js/ui/subscreens/{bus,campaign}.js` | — | W2-Transit / W2-Civic | W3-Crime | W4-UI |
| `js/ui/subscreens/{tv,messages,shop}.js`, `js/ui/screens/report.js`, `js/scenes/report.js` | — | W2 creators | unchanged | W4-UI |
| `js/ui/pocket/{journal,stats,achievements}.js` | — | W2-Pocket | W3-Prog | W4-UI |
| `js/ui/pocket/phone.js` | — | W2-Pocket | W3-Econ | W4-UI |
| `js/ui/pocket/map.js` | — | W2-Pocket | W3-Park | W4-UI |
| `js/ui/pocket/{pocket,bag}.js` | — | W2-Pocket | lead (requests) | W4-UI |
| `js/ui/screens/{halloffame,results,profile}.js` | — | W2-Front | W3-Prog | W4-UI |
| `js/ui/hud.js` | W1-D | lead (requests) | W3-Prog | W4-UI |
| `js/ui/card.js`, `js/ui/dialog.js`, `js/ui/components.js` | W1-D | lead (requests) | lead (requests) | W4-UI |
| `js/ui/screens/settings.js` | — | W2-Front | W3-Input | W4-UI |
| `js/core/input.js` | W1-K | lead | W3-Input | W4-UI |
| `js/ui/focus.js`, `css/{base,components}.css` | W1-D | lead (requests) | W3-Input | W4-Visual (css) / W4-UI (focus) |
| `js/render/{sky,lighting}.js` | W1-G | lead (requests) | W3-Light | W4-Perf |
| `js/art/{exteriors-detail,skyline}.js` | — | W2-Exterior | W3-Light | W4-Visual |
| `js/art/props.js` | — | W2-Exterior | W3-Park | W4-Visual |
| `js/art/interiors/{bar,casino}.js` | — | W2-Night | W3-Nightlife | W4-Visual |
| `js/minigames/{fight,darts,slots,blackjack,roulette}.js` | — | W2-Night | W3-Nightlife | W4-UI |
| `js/minigames/{framework,shiftrush,timingring,duel}.js`, `js/scenes/minigame.js` | W1-M | lead (requests) | lead (requests) | W4-UI |
| `tests/balance/*` | W1-Q | lead | W3-Balance | W4-QA |

A file not listed stays with its creator (or the lead, when the creating package has ended) and
changes only through requests.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Art looks inconsistent across many agents | the art bible screen in wave 1; one palette file; shared draw primitives, rig, kit and painter; contact sheets per package; the wave-4 visual audit |
| Scope creep turns the remaster into a sequel | GDD §2.4 rejects list; P tags; feature flags; the lead's sign-off for any new system |
| Balance is off | every number in `tuning.js`; the rules are pure and simulated; B-23 bands in CI; the B-25 knob order |
| Canvas performance on weak laptops | memory-bounded chunk and sprite caches from wave 1; quantized zoom; quality presets with Auto on work time; calibrated CPU gates and a relative gate in CI; a headed pass on the reference machine in waves 3 and 4 |
| Headless CI cannot measure GPU frame rates or hear audio | CPU work, draw counts and cache sizes are gated instead of fps (ARCHITECTURE §17); audio is rendered offline and checked objectively (§18) |
| Rule bugs block 13 parallel packages in wave 2 | two rules desks own the rules and answer requests during the wave (§4.0) |
| `file://` limits (no fetch, modules, fonts; audio unlock) | data as JS; classic scripts; system fonts; the boot screen unlocks audio; every test runs over `file://` |
| Load-order bugs in one namespace | the load-time rule; deferred boot hooks; the shuffled-load tests |
| Parallel merge conflicts | strict ownership; `index.html` pre-seeded with stubs; registries; the frozen CONTRACT (events, sub-screens, formats); requests |
| Nondeterminism breaks tests | three RNG streams with the rules stream saved; a fixed-step loop; the harness pauses the clock |
| Copyright slips (names, text, look) | `banned.txt`; the shingle check against the recreation; fictional cities, tickers and products; no binary assets; a names audit in wave 4 |
| Wave 3 slips | wave 2's exit is a complete, tagged, shippable game |

## Appendix A: `tools/banned.txt` (case-insensitive substrings)

Original product, place, person, rank, channel, screen and message strings, plus near echoes:

```
StickNews
Stick News
Drunken Darts
YOU DIED
McSlave
Coma-Snooze
Snooze Master
SnoozeMaster
Behemoth-Vision
Behemoth Vision
Circuit-Breaker
Circuit Breaker 5000
Byte-Brick
StickChoice
Stick-Choice
Stick-o-pedia
Stickopedia
Stickannica
XGenica
Stick-Fitness
Deep Freeze
Suds'n'Bubbles
Suds n Bubbles
Fizz & Bubbles
Fizz & Chips
Super Slots 3000
Lucky Stick 3000
Stickman Master Builders
United Nations of Stick
League of Stick Nations
HEYZEUS
CHEATER!!!
Know When to Draw the Line
Uber Bar
Funkadelic Grape
Biznitchin
Supafly Orange
Narcotics of the World
Your safety is our concern
Pure Energy
WUSS
GIRL SCOUT
BOY SCOUT
GOOD SAMARITAN
EXTRAORDINARILY GOOD
EXTRAORDINARILY EVIL
SELFLESS MILLIONAIRE
PHILANTHROPIST
APOSTLE
MR. DOG
JUVENILE DELINQUENT
WHITE COLLAR CRIMINAL
PETTY CRIMINAL
CAR JACKER
DRUG LORD
UNDENIABLY WICKED
GENUINE HELLRAISER
SEED OF EVIL
MR. NATAS
MULTIMILLIONAIRE
DEMI GOD
DEMIGOD
BILLIONAIRE GOD
UTTER FAILURE
Taquisha
DJ Beefstick
```

**Exception:** the string `XGen` may appear only in the fan-note sentence ("Fan remaster. Not
affiliated with or endorsed by XGen Studios.", text key `ui.fanNote` in `en-ui.js`) and in
`README.md`; the check (`[only-in] XGen: ui.fanNote, README.md`) fails anywhere else.

Whole-word checks (a separate list in the same file, marked `[word]`): `XGS`, `FSY`, `DYC`, `MLG`,
`SR2`, `SAR` (the original's tickers), `Brooklyn`, `Detroit`, `Camden`, `Richard`, `Stuart`,
`Debbie` (names from the original's voicemails; the fictional cities and new names replace them).

Upper-case whole-word checks (marked `[upper]`, case-sensitive, so ordinary prose may still say
"genius"): `GENIUS`, `SAINT` (the original's rank stamps; the perk is *Mastermind* and the karma
tier *Angelic*).

**Kept on purpose** (they carry the "same game" identity and are not banned): the names listed in
GDD §1.3 (pending the user's confirmation together with the title), the "(it froze)" joke button,
and the phrase "JUST KIDDING" of the hospital gag.

## Appendix B: feature flags (`js/data/features.js`)

All start `false` except P0 behaviour, which has no flag. The lead flips them at integration.
**Every def with `p ≥ 1`** (action, item, encounter, event, arc, contact, sub-screen, decree, perk,
achievement) carries `feature: '<flag>'` from this table; cards, previews, the Bag, the Pocket,
dialogs and encounter seeding hide it while the flag is off, and the validator rejects a P1 / P2
def without one. There is no other switch (no `tuning.*.enabled`).

| Flag | Enables | Package |
|---|---|---|
| `weather` | the Markov weather, forecasts and weather effects | W3-Light |
| `shadows` | sun shadows | W3-Light |
| `timelapse` | the time-lapse on exit | W3-Light |
| `cityReacts` | billboard, flags, statue, bunting, posters, headlines, crowd reactions at ±50 | W3-Light |
| `calendar` | weekly bonuses (the Thursday, Friday and Wednesday prices), city events and their City Hall rows | W3-Econ / W3-Life |
| `hustles` | Hustle buttons, rating, shift variants, Shift Manager, CEO takeover | W3-Econ |
| `shiftEvents` | shift event cards | W3-Life |
| `degrees` | extra classes, seminars, degrees, transcript | W3-Econ |
| `perks` | stat-milestone perks | W3-Prog |
| `karmaTiers` | karma tier perks and glyphs (the Good-tier discount and Heat decay, the Bad-tier Hold-up bonus and Red's discount) | W3-Prog |
| `homesPlus` | tier-2 furniture, home perks, nap, leftovers, let and sell (and the Owned-mode rows), CDs, the Workstation catalogue (sports car, delivery), Paperweight Realty contact | W3-Econ |
| `stockTips` | the daily tip, Market Watch, Workstation trading, the paper | W3-Econ |
| `shopsPlus` | knuckles, vest, used skateboard, pawn Sell, scratch, gum, takeout, mega meal, Bag takeout | W3-Econ |
| `tours` | speaking tours, haggling, reputation, rumours, the vest in muggings | W3-Crime |
| `police` | officers on foot, the Precinct desk, bail and the lawyer contact, McHolland on the street and his interrogation, informant rows | W3-Crime |
| `civicPlus` | charity box, soup kitchen, kiss babies, campaign events, decrees | W3-Crime / W3-Life |
| `nightlife` | Buzz effects, Mingle, Open Mic, darts matches, Guard, Buy a drink, Champion, the Ring, the VIP desk, the pit boss and card counting, the Classic cabinet | W3-Nightlife |
| `arcs` | Harold, Skid, Red and McHolland arcs (the shirt, gum gifts, Red's credit, the junker's Timing Ring, Red's weekly price) | W3-Life |
| `encounters` | street encounters | W3-Life |
| `park` | the park walk-ups, Point Margin, Brother Margin | W3-Park |
| `scraps` | Theory of the Fold | W3-Park |
| `advisor` | the Advisor and the Road to Office | W3-Prog |
| `achievements` | achievements, the Hall of Fame, the legacy score and the results graphs | W3-Prog |
| `tutorial` | the full Day 1 script and hints (P0 has the First Day list only) | W3-Onboard |
| `phone` | the Pocket's Phone tab: the Cab and Summon-car apps, Stocks by phone (with the Workstation), and the contacts that have no flag of their own | W3-Econ |
| `customLength` | Custom 7-365 days | W4-Rules / W4-UI |
| `fleaMarket` | the Sunday flea market | W4-Rules / W4-UI |
| `aquarium` | the aquarium | W4-Rules |
| `lean` | the perspective lean option | W4-Perf |
| `wardrobe` | changing accessories after creation | W4-Rules / W4-UI |
