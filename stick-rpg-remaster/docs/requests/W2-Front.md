# Requests from W2-Front (wave 2)

W2-Front built the front end (BUILD_PLAN §4.11): boot and the title, the new-game wizard, the intro,
pause, settings, save / load, the Final Edition, the Hall of Fame, the profile and the credits. Each
item: the file, the exact change, why, and what W2-Front does meanwhile. The last section answers the
requests other packages addressed to W2-Front.

## 1. `tests/e2e/boot.test.cjs` (lead): the title after boot is no longer the kernel's stub

- **Change:** line 114, `ui.items.some((x) => x.id === 'title-stub')` →
  `ui.items.some((x) => x.id === 'title-stub' || x.id === 'title')`, and the header's "(the kernel's
  stub until W2-Front registers its scenes)" can drop the parenthesis.
- **Why:** the check asserts the kernel's fallback title (`[data-id="title-stub"]`, CONTRACT §11.3)
  among the visible items. W2-Front's `title` scene (registered, so it wins) shows its own screen:
  right after boot the boot card (`title`, `title-gate`, `title-gate-press`; UI §5.1), after a key
  the menu (`title-new`, …). Everything else in the suite passes (47 of 48): the boot still hands
  over to the title at once, `goto('boot')` lands on the title, the title reads PAPER SKY, and the
  loop and hidden-tab checks are unaffected (the city is neither stepped nor drawn while the opaque
  boot card covers it).
- **Meanwhile:** that one check fails in `boot.test.cjs`; nothing W2-Front can change in its files
  without shipping a fake `title-stub` element.

## 2. A `world.retire` action (W2-City's `js/data/actions/world.js`, or the lead's choice of file)

- **Change:** register
  `SR.def.action('world.retire', { building: 'world', group: 'special', order: 99, p: 0, label: 'act.world.retire', timeRule: 'free', silent: true, effects: [['fn', 'endgame.retire']] })`
  and the text `'act.world.retire': 'Retire'` in `en-world.js`.
- **Why:** Retire (GDD §5: Unlimited and Keep-playing runs, from the pause menu) should run through
  `SR.act`, so that the pipeline sets `Result.over` and emits `game:over` (CONTRACT §8.7, §9.2).
  W2-RulesE added the named fn `endgame.retire` for the front end (decisions-w2-W2-RulesE.md), but no
  data row calls it, and W2-Front owns no action file.
- **Meanwhile:** `js/ui/screens/pause.js` uses `world.retire` when it is registered; until then it
  calls `SR.rules.endgame.retire(SR.state)` and emits `game:over { reason: 'retire', result }` itself
  (tested in `tests/e2e/frontend.test.cjs`: Retire → the results, reason `retire`).
  The world-action list that `tests/node/invariants.test.cjs` pins (W2-City request 1) would then
  include `world.retire` as well.
- **Status:** applied by W2-City during the wave (`js/data/actions/world.js`, `act.world.retire` in
  `en-world.js`); the pause menu's Retire now runs through `SR.act` (frontend suite green).

## 3. A feature flag for the new-game accessory carousel (lead: `js/data/features.js`, BUILD_PLAN Appendix B)

- **Change:** add a flag for UI §5.3's accessory carousel (P1; e.g. `accessories`), or record that it
  belongs to `wardrobe`.
- **Why:** UI §5.3 marks the carousel (none, cap, beanie, glasses, bow tie, scarf, headphones, top
  hat) P1, and every P1 behaviour stays behind a flag, but Appendix B has none for it; `wardrobe` (P2)
  is "changing accessories after creation".
- **Meanwhile:** the carousel is built and shows while `wardrobe` is on (`SR.features.wardrobe`); the
  chosen accessory goes to `state.player.look.acc` (the schema's shape).

## 4. `js/audio/songs/final_edition.js` (W2-Music): the variant names the results use

- **Change (a note):** the results scene plays `final_edition` with `{ variant: 'minor' }` when the
  net worth is below $1,500 and switches to `{ variant: 'stamp' }` when the rank stamp lands (the key
  change up a tone; ART_AUDIO §13.4). Naming the two variants so makes them play; other names need a
  line here.
- **Why:** ART_AUDIO §13.4 asks for both behaviours but no format names them.
- **Meanwhile:** a missing variant plays the base song (the call is guarded by
  `SR.reg.song.final_edition.variants`).
- **Status (review):** W2-Music's `final_edition.js` now registers exactly these two variants
  (`stamp`, `minor`), and `stingers.stamp` exists; nothing is left to do here.

## 5. `docs/CONTRACT.md` / ARCHITECTURE (lead): the front end's additive names (nothing frozen changes)

- **Scene params:** `title { gate }` (the boot card; the boot scene passes it), `newgame { seed }`,
  `results { reason, result }` (result defaults to `state.result`, then the rules' results for the
  reason), `saveload { mode: 'save' | 'load', more }`, `settings { tab }`, `halloffame { tab }`,
  `profile { tab }`. Every front-end scene def has `info()` for tests; `newgame.begin(opts)` and
  `intro.skip()`.
- **`SR.ui.title`** = `{ mount, backdrop: { enter, exit, update, render, at }, classic, navigate,
  swallowClick, badge, metaLines, playTime, difficultyName, thumb, CLASSIC_URL }` (the P1 Classic cabinet in
  Sticky's calls `SR.ui.title.classic()`). **`SR.ui.saveload`** = `{ latest, continueLatest, load,
  resume, suspend, quit, hardcore, copyText, SLOTS }`. **`SR.ui.newgame`** = `{ mount, create, roll, fair,
  step, options, cheatName, ACCESSORIES }`. **`SR.ui.results`** = `{ build, summary, headline, file,
  dayShown, rankText }`. **`SR.ui.settings`** = `{ contexts, actionsOf, actionLabel }`.
  **`SR.art.intro`** = `{ draw, beatAt, BEATS, DURATION }`. The render actor source `front.hide`
  (the title and the intro hide the player).
- **The profile's fields** (D34 leaves them to W2-Front / W3-Prog): `hallOfFame.<short|medium|long|
  unlimited>` = up to `tuning.endgame.hof.top` entries `{ run, name, rank, rankKey, netWorth, legacy,
  day, difficulty, date, banners }` sorted by legacy; `totals` = `{ runs, days, falls, fights, best:
  { <bucket>: netWorth }, seen }` (`seen` remembers the recent runs so a run is filed once);
  `badges.oldSchool` / `badges.metArtist` (the date earned); `hintsSeen.whatsNew`.
- **The game:over routing** (ARCHITECTURE §5; answers W2-Transit 1): the results scene queues itself
  on `game:over` once the action is done, unless the report, death, hospital, jail or results scene
  is on the stack, the reason is `death` with the death scene registered, or a `player:down` / `jail`
  came in the same turn; those scenes go to the results themselves.
- **Why:** the requests protocol (BUILD_PLAN §1.3) records public names here.
- **Meanwhile:** implemented as listed.

## 6. `js/ui/components.js` (lead / W1-D): a tooltip outlives a target that leaves the DOM

- **Change:** in `showTip`, once shown, re-check the owner each frame (or in `hideTip`'s callers) and
  hide the tip when `tipOwner.isConnected` is false; e.g. a `requestAnimationFrame` loop that runs
  only while `tipEl` is shown: `if (tipOwner && !tipOwner.isConnected) hideTip();`.
- **Why:** Chrome fires no `blur` or `pointerleave` for an element that is removed while focused or
  hovered. A screen that rebuilds its content (a Settings tab, a wizard step, a list re-render) left
  the "More" tip of a number field's + button floating over the next tab (seen in
  `shots/W2-Front/settings-controls.png` after the Tab walk of the Game tab).
- **Meanwhile:** W2-Front's Settings (tab switch and close), the new-game wizard (step switch) and
  Save / Load (re-render) call `SR.ui.tooltip.hide()` before they clear their content.

## Requests addressed to W2-Front, answered

- **W2-Transit 1** (`js/scenes/results.js`: let the death, hospital and jail scenes finish before
  the results) → applied as in item 5; `tests/e2e/results.test.cjs` checks Hardcore (FLATLINED first,
  then DECEASED) and the paper-first path after a timed game's last night.
- **W2-Transit 5** (`js/scenes/results.js`: Keep playing after a game that ended in jail) → applied:
  Keep playing goes to `jail { resume: true }` while `state.jail` is set, else the city at the home
  door; tested in `tests/e2e/results.test.cjs`.
- **W2-Pocket 4** (Esc is `back` then `pause`) → applied in `js/ui/screens/pause.js`: the menu
  marks itself on `resume` (Settings or Save / Load closed) and swallows that same event's `pause`
  when its key is a `back` binding, as the city does; Settings and Save / Load close on `back` as
  before. Tested in `tests/e2e/frontend.test.cjs` with the real Esc key (Esc opens the menu, the Esc
  that closes Settings or Save / Load leaves it up, the next Esc resumes).
- **W2-Home 4** (`saveload { mode: 'save' }`, `results { reason, result }`) → applied (item 5).
- **W2-Goods 4** (`ui.badge.goodKarma`, `ui.badge.couponClipper`) → applied with every B-28a id
  (below).
- **W1-M 10** (the Duel's D chips) → applied: `mg.frame.duel.halved` "beats their stance",
  `mg.frame.duel.doubled` "their stance counters it".
- **W2-Street 5** (a new game through `SR.save.load(state)`) → followed (the wizard and the intro).
- **W2-Food 5** (`en-ui.js`: variant and badge labels) → applied: `ui.variant.here` / `.takeout`
  and a `ui.badge.<id>` for every B-28a price modifier (22, including the nine asked for).
- **W1-K-M1 notes** (the save UI calls) → followed: a new game is `SR.save.load(SR.rules.state.create
  (opts))`; "This save couldn't be read" on `save:broken` and for an unreadable slot; the friendly
  newer-version message for `newer`; Copy save code is `SR.save.copyCode()` for the live game (its
  own textarea fallback); Paste save code is `importCode` then `load`; the boot's warning reads
  `SR.save.available`; a `quota` error asks to delete a save.
- **W1-S 8** (the gamepad-only unlock line) → applied: the boot card reads "Press A to start. Sound
  begins after one click or key press." when a gamepad is connected, and the title shows "Sound
  begins after one click or key press." while the audio is locked and the last input was the pad.
- **W2-Exterior 11** (`pause.js`, `results.js`: re-bake the building details on quitting to the
  title) → applied in the review: both leave through `SR.ui.saveload.quit()`, which nulls the state
  and then calls `SR.art.exteriorDetail.refresh()` (tested in `tests/e2e/frontend.test.cjs`).
