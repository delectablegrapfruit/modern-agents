# Wave-1 integration: decisions of the presentation desk (desk-present)

Scope: requests whose target is one of `css/*`, `js/ui/*`, `js/art/*`, `js/audio/*`,
`js/scenes/building.js`, `js/data/text/en-ui.js`, `tests/sheets/*` and
`tests/e2e/{ui-kit,card,audio,art}.test.cjs`. Each line is request id → decision → reason. Parts of a
request that target another desk's file (docs, kernel, rules, W1-Q's tools, `js/scenes/minigame.js`,
`js/render/*`) are named "not this desk" (desk-lead's and desk-rules' answers are in
`decisions-w1-desk-lead.md` and `decisions-w1-desk-rules.md`). Several requests were already
answered by the package that owned the target file during wave 1; those are confirmed against the
code here, not re-applied.

## Lead decisions (recorded)

- **Hold-to-repeat (W1-D 4, W1-R 10)** → applied in `js/ui/card.js`: a repeat stops at any modal,
  dialog, minigame or stamp except a stat-gain stamp, which shows once per hold (CONTRACT D47, GDD
  §4.4, UI §1 and §4.3). The wave-1 card already coalesced stat stamps during a hold
  (`SR.ui.stamp.busy({ ignoreStat: true })` in the repeat check); three gaps against "once per hold"
  are closed:
  - a hold now carries a record (`{ statShown }`) that its runs share, so the **first** run of the
    hold that gains ≥ 2 stamps it, even when an earlier run of the same hold gained less (Winded);
    before, only the hold's first run could stamp;
  - **R** is one run per press, not a hold: its stat gain stamps again (it was coalesced like a
    hold's repeat);
  - a held key's **OS repeats** no longer skip the showing stamp: `card.onAction` skipped the current
    stamp on any `confirm` / `interact` / `back` / `repeat` / `rowN` event, repeats included, so a
    held Enter cut the stat stamp at the first key repeat (~500 ms); now only a new press skips it
    (as `js/ui/stamp.js`'s own listener already did), and repeats are consumed while it shows.
  Tested in `tests/e2e/card.test.cjs` (Playwright's second `keyboard.down` is an OS repeat); the new
  checks fail against the wave-1 card.
- **Script-size budget (W1-G 7, W1-Q 3)** → not in this desk's files (ARCHITECTURE: desk-lead,
  applied; `tests/perf/perf.cjs`: W1-Q). This desk's changes add about 2.5 KB to the scripts `index.html` lists (`card.js` +1.7 KB,
  `en-ui.js` +0.7 KB, `building.js` +0.1 KB).
- **Day-1 fries price (W1-R 9)** → nothing in this desk's files: the card suites' "Fries $12" is the
  fixture row `testshop.fries` (`tests/sheets/components-fixtures.js`, building `testshop`), which no
  McSticks discount touches; the slice test (desk-lead) expects $9.

## W1-A (art kit)

- **W1-A 4** (`ui.bible.*` section labels in `en-ui.js`) → applied, text as proposed (12 keys) →
  the #artbible page labels its sections through `SR.text` (ART_AUDIO §1) and `ui.*` belongs to
  `en-ui.js` (CONTRACT §7). Tested in `tests/e2e/art.test.cjs` (every `ui.bible.*` key that
  `js/art/bible.js` names resolves). Side effect: the `artbible` visual golden captured the
  placeholder labels (26 cells in the header and section titles differ); see Open issues.
- **W1-A 6b** (the actors sheet on the shared calibration) → no change needed → `tests/sheets/actors.html`
  loads `tests/perf/calibrate.js` and `art-sheet.js` `calibrate()` uses `SRCalibrate.run()`; the
  local workload runs only when the file is missing, and `tests/e2e/art.test.cjs` reports
  "calibration ×1.6 (tests/perf/calibrate.js)".
- **W1-A answers A, B, C** (in W1-A's files, which are this desk's) → confirmed as landed:
  `SR.art.interior(id, params)` and the `actors` argument (D60; `tests/e2e/card.test.cjs` draws a
  registered interior), icons `coupon` and `shirt` (category `extra`), `palette.ui` mirrors `white`,
  `gold`, `newsprint` and the karma bands.
- **W1-A 1-3, 5, 7** → not this desk (docs, W3-Park, W2 data). **W1-A 8** → not this desk
  (`js/render/actors.js`); `SR.art.vehicles.lightPhase` already swaps every 0.5 s.

## W1-D (design system and UI)

- **W1-D 4** → lead decision (above).
- **W1-D 5** (`js/audio/sfx.js`: the UI sound names) → no change needed → W1-S registered `click`,
  `open`, `close`, `confirm`, `error`, `toggle`, `blip`, `purchase`, `ticktock` (plus `hover`,
  `typewriter`, `stamp`); `js/ui/stamp.js` plays the `stamp` recipe (`confirm` when it is missing) and
  `stingers.stamp` once W2-Music registers it (deferred to **W2-Music** by desk-lead).
- **W1-D 6** (`js/art/interiors/kit.js`: the door params and actors) → no change needed → landed in
  wave 1 (D60); the building scene passes both.
- **W1-D 7** (home door modes and greetings) → no change in this desk's files → `js/ui/card.js`
  already reads `building.modes`, `greet.<id>` and `building.greetings`; the data is deferred to
  **W2-Home** (desk-lead).
- **W1-D 1, 2, 3, 8** → not this desk (docs; 8 is the answer to W1-R 10).

## W1-E (economy)

- **W1-E R11** (`js/art/icons.js`: icons `coupon`, `shirt`) → no change needed → W1-A added both.

## W1-G (render core)

- **W1-G 3** (`js/art/props.js`, `js/art/skyline.js`: `SR.art.props.{draw, size}`,
  `SR.art.skyline.draw`, optional `railing` / `wall`) → deferred to **W2-Exterior** → both files are
  M0 stubs that BUILD_PLAN §4.2 / §7 give to W2-Exterior in wave 2; the hook shapes are recorded in
  CONTRACT §15.2 (desk-lead) and `js/render/{buildings,sky}.js` draw placeholders meanwhile.
- **W1-G 1** (`SR.art.exterior.*` names in `js/art/exteriors.js`) → no code change → a record,
  folded into CONTRACT §15.2 by desk-lead.

## W1-K-M1 (kernel M1)

- **W1-K-M1 1** (`ui.pad.connected`, `ui.pad.disconnected`) → no change needed → already in
  `en-ui.js` (W1-D).
- **W1-K-M1 5** (`js/audio/engine.js`: suspend the context while the tab is hidden) → no change
  needed → the engine suspends on `visibilitychange` to hidden and resumes a context it suspended
  when the tab shows (D50); `tests/e2e/audio.test.cjs` "the hidden tab suspends the context".
- **W1-K-M1 notes, "W2-Pocket / W1-D"** (Tab is `pocket` everywhere) → applied on the card's side →
  CONTRACT §15.5 / D57: scenes other than the city ignore `pocket` when `ev.code === 'Tab'`. The card
  ignored every keyboard `pocket` (it opened the Pocket only for `ev.device === 'pad'`), so a key
  remapped to `pocket` did nothing in a building; it now ignores exactly Tab (which moves focus) and
  opens the Pocket for any other binding (the pad's View button included). Tested in
  `tests/e2e/card.test.cjs` with a stand-in Pocket overlay. The Pocket closing on Tab is **W2-Pocket**'s
  (desk-lead deferred it).

## W1-M (minigames)

- **W1-M 6a** (the Hustle's Timing Ring `step`) → no change needed → `runHustle` passes `step` from
  the named fn's `{ skin, step }` or `SR.rules.jobs.hustleSkin(s, track)` (W1-D, in wave 1); the
  `pitch` skin need not derive it.
- **W1-M 6b** (rejected runs) → applied → `runMinigame` had no rejection handler (an unhandled
  rejection while a skin is a stub) and `runHustle`'s only warned; both now warn once and show the
  `ui.minigamePending` toast ("The table is not set up yet. Come back later."). Tested in
  `tests/e2e/card.test.cjs` (a Hustle of an unregistered skin charges nothing and toasts; a row whose
  `open` names an unregistered skin toasts with zero console errors).
- **W1-M 7** (the minigame sounds) → no change needed → W1-S registered `mg_hit`, `mg_miss`,
  `mg_item`, `mg_bin`, `mg_serve`, `mg_tick` and `error`.
- **W1-M 8** (a held duck) → no change needed → `SR.audio.duck(db, Infinity)` (or `ms` omitted) holds
  until `SR.audio.duck(0)` or the returned release function; `tests/e2e/audio.test.cjs` "duck(6,
  Infinity) holds". Calling it from the frame is W1-S 6 (`js/scenes/minigame.js`), not this desk.
- **W1-M 10** (the Duel's D chips) → applied, text as proposed: `mg.frame.duel.halved` "beats their
  stance", `mg.frame.duel.doubled` "their stance counters it" → B-30: the halved D belongs to the
  option that beats the stance and only the doubled one is countered; the old "countered: easier"
  said the opposite of the rule.
- **W1-M 1-5, 9** → not this desk.

## W1-Q (quality tooling)

- **W1-Q 7** (`tests/sheets/art-sheet.js`, `tests/sheets/sound-sheet.js`: the shared calibration) →
  no change needed → `actors.html` and `sound.html` load `../perf/calibrate.js` and both sheets'
  `calibrate()` use `SRCalibrate.run()`; the stand-ins remain only for a checkout without the file
  (W1-A 6b, W1-S 7b).
- **W1-Q 1-6, 8-10** → not this desk.

## W1-R (rules kernel)

- **W1-R 10** → lead decision (above). **W1-R 3** (`training.stampMin`) → rejected for tuning by
  desk-lead (D49); the card keeps `STAT_STAMP_MIN = 2` (UI §4.3) as a named constant, like the
  rules' `STAMP_MIN_GAIN`.

## W1-S (audio)

- **W1-S 5** (`js/scenes/building.js`: enter with a 600 ms cross-fade) → applied →
  `SR.audio.music(def.music, { fade: MUSIC_FADE_S })` with `MUSIC_FADE_S = 0.6` (ART_AUDIO §13.4:
  "entering a building cross-fades to its song in 600 ms"; the default is ARCHITECTURE §12's 1.2 s).
  Tested in `tests/e2e/card.test.cjs` (the fixture bank now has `music: 'paper_sky'`; the call is
  `['paper_sky', { fade: 0.6 }]`).
- **W1-S 8** (guidance: `stingers.stamp`, the `stamp` recipe) → no change needed → `js/ui/stamp.js`
  already plays the `stamp` recipe and the stinger once it is registered.
- **W1-S 6** → not this desk (`js/scenes/minigame.js`). **W1-S 1-4, 7** → not this desk (docs, W1-Q).

## New public names from this desk (for the lead's CONTRACT fold)

- `SR.ui.card.feedback(result, originEl, opts)`: `opts.hold` = a hold's record `{ statShown }` shared
  by its runs (stat stamps show until one has shown in that hold); `opts.repeat` without a hold keeps
  its wave-1 meaning (stat stamps coalesced). Additive; the frozen names are unchanged.
- Text keys: `ui.bible.{title, palette, materials, lines, doors, poses, karma, interior, icons, grain,
  stamp, float}`; reworded `mg.frame.duel.halved` / `.doubled`.
- The card's `pocket` rule (D57) and the building scene's 0.6 s song cross-fade, as above.

## Tests

`node tools/run-all.cjs --jobs 3`: 54 of 55 suites pass (223 s). This desk's suites all pass:
e2e `card` (111 checks; 99 before, and the new ones fail against the wave-1 card), `art` (35),
`ui-kit`, `audio`, and the sheets they capture (`sheets`, `a11y`, `minigames`); Node `tokens`, `art`,
`music`; `validate --wave 1` and `shingles` on the edited text; the `card-testshop` and `exteriors`
goldens match. The one failure is `tests/visual/visual.cjs` `artbible` (Open issues).

## Open issues

- `tests/visual/goldens/artbible.json` (W1-Q; W4-Visual refreshes goldens) was recorded while the
  bible showed its fallback labels; with W1-A 4's keys the header ("ART BIBLE") and the section
  titles differ in 26 cells. The golden needs `node tests/visual/visual.cjs --record --only artbible`
  (desk-lead reported the same). The capture was checked by eye: only the labels changed.
