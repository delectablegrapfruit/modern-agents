# Requests from W1-A (Art kit and actors), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). 1-3 are for the lead (CONTRACT, ARCHITECTURE, ART_AUDIO); 4 for W1-D; 5 for
W3-Park (through the lead); 6 for W1-Q; 7 for W2 packages (through the lead). Requests addressed to
W1-A by other packages are answered at the end.

## 1. `docs/CONTRACT.md` §15 (lead): the rest of `SR.art`

- **File:** `docs/CONTRACT.md` §15, the `SR.art` row (and ARCHITECTURE §9.2 for the interior).
- **Change:** record these additive names (all in W1-A's files; the frozen ones are implemented as
  written):
  - `SR.art.draw`: `color(keyOrColour)` (the D32 resolver every drawing module can use), `parse`,
    `hex`, `mix(a, b, t)`, `alpha(c, a)`, `luma`, `lineWidth(ctx, u, minPx)`, `font(size, weight,
    role)`, `FONTS`, `stamp(ctx, str, x, y, opts)` (ART_AUDIO §11) and `floatText(ctx, str, x, y,
    colourKey, t)` (ART_AUDIO §12). `tone(base, -1|0|1)` returns `#RRGGBB[AA]`.
  - `SR.art.paper`: `grain(kind)` → the 256 × 256 canvas (`'multiply'` | `'speck'`), `grainURL(alpha)`,
    `pattern(ctx, kind)`, `apply(ctx, x, y, w, h, alpha)` (the 6 % / 4 % multiply), `tornRect(ctx, x,
    y, w, h, opts)`, `SIZE`. A prio-40 boot hook sets `--grain` on `<html>` unless the stylesheet set
    one.
  - `SR.art.stick`: `draw(ctx, pose, opts)` with `opts = { x, y, view: 'city'|'side', facing:
    'down'|'up'|'left'|'right', scale, look, player, karma, head, torso, limb, mood, t, rot, mount:
    'board', upper, anchor: 'feet'|'hip', shadow, alpha, splay }` (`pose` may be a pose array, a pose
    name or a clip name evaluated at `opts.t`); `clip(name, t, out)` (a pooled result unless `out`);
    `poses`, `clips` (`{ dur, loop, keys }`), `duration(name)`, `looks`, `look(id)`, `pedLook(n)`,
    `karmaColor(k)`, `metrics(view, child)`, `joints(pose, opts)`, `ACCESSORIES`, `accessory(name)`.
    Clip names: `idle walk skate drive sit talk eat drink work work_desk work_mop work_cook work_serve
    study lift cheer happy shock wave cower knocked fall teeter sleep guard punch kick fireball inkbeam
    hurt win lose`. Moods: `neutral happy sad angry surprised hurt sleep smug worried blink` (aliases
    `shock`, `idle`, ...).
  - `SR.art.portraits`: `draw(ctx, personId, size, mood, opts)` with `opts = { blink, bg, karma, frame }`,
    `toCanvas(personId, size, mood, opts)`, `SIZES`.
  - `SR.art.vehicles`: `draw(ctx, type, dir, x, y, opts)` with `opts = { angle, t, brake, lights,
    flashReduction, driver, shadow, alpha, scale, z, bank, pilot, carry }`; types `compact sedan taxi
    van police junker sports skybus plane` (`player` → junker, `cab` → taxi); `lamps(type, dir, angle)`
    → `{ head, tail }` screen offsets for the emissive pass, `size(type)`, `dirFromAngle(a)`, `TYPES`.
  - `SR.art.icon(ctx, name, x, y, size, state)` (top-left at x, y; `state: 'disabled'`),
    `SR.art.iconURL(name, size, state)`, `SR.art.icon.CATEGORIES`, `.names()`, `.TABLE`.
  - `SR.art.logo`: `draw(ctx, t, { x, y, width, title, tag, color })` → box, `duration` (1.2 s),
    `measure(title, width)`.
  - `SR.art.bible.draw(ctx, { t })`, `SR.art.bible.sampleInterior()`.
  - `SR.art.interior(id, params)` (see answer A below), `SR.art.interior.fromDef(id, def)`,
    `.types()`, `.kit`. The interior def fields beyond ART_AUDIO §9: wall types `plain tiles panels
    brick stripes stone wallpaper` (+ `alt`, `wainscot`, `wainscotH`), floor types `checker tiles
    planks carpet concrete` (+ `tile`, `rows`; `perspective` 0 flat .. 1 true one-point), `floorY`,
    `vp`, `palette` (the `int.<id>` set name), `fns` (named custom fns: a function or `{ static(ctx,
    kit, state), anim(ctx, kit, t, state) }`); prop fields `sortY`, `when(state, params)`,
    `pick(state, params)`, `flip`, `text` (a text key), `items`, `person`, `alt`.
- **Why:** other packages already call several of these (W1-G `vehicles.dirFromAngle`, W1-D the
  interior params and portrait opts); recording them keeps later waves from re-deriving them.
- **Meanwhile:** documented in each file's header.

## 2. `docs/CONTRACT.md` §15 / ART_AUDIO §2 (lead): the palette's shape

- **File:** `docs/CONTRACT.md` §15 (palette keys, D32) and ART_AUDIO §2.
- **Change:** record: `palette.sky` is an array of `{ h, top, horizon, ambient, light }` (the only
  non-colour leaves: `h` and `light` are numbers); `palette.ui` mirrors `css/tokens.css` under the
  token names without dashes (`'ui.ink-900'`, `'ui.money-ink'`, plus W1-D's `white`, `gold`,
  `newsprint`), with non-enumerable camelCase aliases (`'ui.ink900'`); the karma bands are
  `karma.good.0..9` / `karma.evil.0..9`; `fighter.0` is the Ring's masked regulars, `fighter.1..12`
  the ladder; every `int.<id>` has the neutral set `wall wallHi wallShade trim floorA floorB counter
  accent light` (ids: `default home apt apt2 pent mansion castle mcsticks store pawn furniture bank nli
  uofs cityhall bar casino bus jail hospital trip news`); `city.<id>` has `ground base tower roof accent
  trim window`; `bld.<id>` adds a few named extras (`skylight`, `plate`, `ivy`, `dome`, `bulb`, `stripe`,
  `gate`, `moat`, `garden`) and `bld.default`; the other groups are `light` (emissives), `weather`,
  `stick`, `acc` (accessories), `kit` (interior materials), `mat` (the bible's five materials), `car`,
  `prop` (pre-seeded for js/art/props.js), `fx` (coins, confetti, stamp ink, newsprint).
- **Why:** D32 fixes how keys resolve but not which exist; the validator and W2 packages need the set.
- **Meanwhile:** as shipped; `tests/node/art.test.cjs` asserts the doc-defined values.

## 3. ART_AUDIO §7 (lead): "12 joints"

- **File:** `docs/ART_AUDIO.md` §7.
- **Change:** "Rig: 14 points (head, neck, shoulders L/R, elbows L/R, hands L/R, hips L/R, knees L/R,
  feet L/R) driven by a pose of 12 numbers (lean, head, two arm and two leg segments per side, lift,
  rot)".
- **Why:** the list in §7 names 14 points while the sentence says 12; the 12 is the pose's degrees
  of freedom.
- **Meanwhile:** implemented as the corrected sentence.

## 4. `js/data/text/en-ui.js` (W1-D): the art bible's section labels

- **File:** `js/data/text/en-ui.js`.
- **Change:** add
  `'ui.bible.title': 'Art bible'`, `'ui.bible.palette': 'Palette'`, `'ui.bible.materials':
  'Materials'`, `'ui.bible.lines': 'Line weights'`, `'ui.bible.doors': 'Door treatments'`,
  `'ui.bible.poses': 'Poses and looks'`, `'ui.bible.karma': 'Karma bands'`, `'ui.bible.interior':
  'Interior corner'`, `'ui.bible.icons': 'Icons'`, `'ui.bible.grain': 'Paper grain'`,
  `'ui.bible.stamp': 'Stamp'`, `'ui.bible.float': 'FloatText'`.
- **Why:** the #artbible page labels its sections through `SR.text` (ART_AUDIO §1); W1-A has no text
  file and `ui.*` keys belong to en-ui.js (CONTRACT §7).
- **Meanwhile:** a missing label shows its key's last segment (PALETTE, LINES, ...; no ⟦⟧ and no
  warning); the Stamp and FloatText samples reuse `stamp.stats.int` and `reason.stat.int` (en-prog).

## 5. `js/data/text/en-park.js` (W3-Park, through the lead): Brother Margin's sandwich board

- **File:** `js/data/text/en-park.js` (wave 3).
- **Change:** add `'bark.preacher.board': 'THE FOLD IS COMING'` (ART_AUDIO §7).
- **Why:** the board's lettering is a text key; the preacher's keys live in W3-Park's file.
- **Meanwhile:** the board shows scribbled lines (the contact sheets fake the key).

## 6. `tools/validate.cjs`, `tests/perf/calibrate.js` (W1-Q)

- **Change:** (a) the palette-key walk treats `sky.<i>.h` and `sky.<i>.light` as the numeric
  keyframe fields they are; the palette's `ui` aliases are non-enumerable. (b) When
  `tests/perf/calibrate.js` lands, `tests/sheets/art-sheet.js` should use it: its local stand-in
  workload assumes 35 ms on the reference machine (measured 59 ms on this 2.1 GHz Xeon container).
- **Why:** BUILD_PLAN §3.6 measures the rig "calibrated as in ARCHITECTURE §17".
- **Meanwhile:** the local calibration; the raw costs (0.05-0.06 ms per city character with its
  shadow, 0.09 ms per 96 px portrait, rasterisation included) are within the uncalibrated budgets.

## 7. W2 packages (through the lead): person ids and looks

- **File:** `js/data/people.js` (W2-Street), `js/data/buildings/*.js` (`owner`, `portrait`),
  interiors' `owner.id`.
- **Change:** use these person ids, which `SR.art.stick.look` / `SR.art.portraits.draw` know:
  `harold kid dealer newguy mcholland sticky mel dee vinnie sofia penny bea gil frankie terry lou
  tabby quill plume crease preacher ori doodle crayon officer board stranger player`, fighters as
  their data/fighters.js id or `fighter.<n>`, pedestrians as a number; or give `person.look` a look
  object `{ head: 'npc.<name>', acc: ['beanie', ...], col: { beanie: 'acc.red' }, child }`.
- **Why:** ART_AUDIO §7 names the people but no ids; W1-W's worldmap already uses `harold`, `kid`,
  `dealer`, `preacher`, `crease`, `mcholland`.
- **Meanwhile:** aliases resolve the long forms (`skid`, `red`, `margin`, `lucky_lou`, ...).

## Requests to W1-A, answered

- **A. W1-D request 6** (`SR.art.interior(id, doorParams)` and the `actors` shape): applied.
  `SR.art.interior(id, params)` keeps the params on the renderer (`r.params`) and hands them to
  props' `when(state, params)` / `pick(state, params)` and to custom fns (`kit.params`). `drawAnim`
  accepts `{ owner: { id | look, pose | clip, mood, t }, you: { pose | clip, ... } }`; the poses
  `idle talk happy shock work` (and `react-happy`, `react-shock`) are clips, and happy / shock set the
  face. An id without a registered def returns a neutral room in its `int.<id>` palette, so the scene
  may call the factory for any building.
- **B. W1-E request R11** (icons `coupon`, `shirt`): applied (category `extra`).
- **C. W1-D request 3** (tokens.css additions): `palette.ui` mirrors `white`, `gold`, `newsprint`; the
  karma bands are `palette.karma` (the same values as `--karma-good-*` / `--karma-evil-*`).
