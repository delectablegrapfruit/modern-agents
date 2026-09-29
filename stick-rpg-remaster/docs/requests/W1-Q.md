# Requests from W1-Q (Quality tooling), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-4 and 8-10 are for the lead (CONTRACT, ARCHITECTURE, a kernel test, an
integration note); item 5 is for W1-R; item 6 for W1-G; item 7 for W1-A and W1-S. Requests addressed
to W1-Q by other packages were applied in W1-Q's files (listed at the end).

## 1. `docs/CONTRACT.md` §17-§18 (lead): record the quality tools' public interfaces

- **File:** `docs/CONTRACT.md` (a new §18.1 "Quality tools"), ARCHITECTURE §18.
- **Change:** record these names, which other packages call:
  - `tools/validate.cjs [--wave N] [--root dir] [--json] [--quiet] [--selftest]`; module
    `validate({ root, wave, plant, isStub }) → { errors, warnings, info, stats }` (`errors` /
    `warnings` are `{ check, where, msg }`) and `textOwner(key)` (the `--wave` prefix map of §7).
    `--wave N` makes a missing reference a warning when the file that should register it still
    carries the stub marker (text keys by the prefix map; icons, sfx, songs, skins, sub-screens,
    buildings, actions, fns, palette keys by their owner file); it also lists wave-≤N files that are
    still stubs as warnings. Strict (no `--wave`) is the release gate. Besides the data, it checks
    the ids that code names outright (review addition): the first argument of any `text('…')`
    call, every `'reason.…'` literal, `{ key: '<ns>.…' }` for the text-only namespaces (toast,
    stamp, vm, news, report, bark, greet, cap, tv, taunt, enc, event, arc, front, ori, ui, hud,
    reason, place, act, desc, card, sub, mg, ach, advisor, pocket, contact, key, set),
    `audio.sfx / music / stinger('…')`, `art.icon(ctx, '…')` and `iconURL('…')`; a key the same file
    tests with `has('…')` is optional and a key built with `+` is skipped. It also checks the
    frozen names: sub-screens in their CONTRACT §10 files with their P / flag (a row opening a P1
    one carries its flag), skins on their §13 engines in their files, songs in their §14.2 files;
    `open` names a skin or an engine without skins (D29); and an opening row's `hpAbove` covers the
    possible voluntary hurt of its `:resolve`.
  - `tools/shingles.cjs [--shingles] [--banned] [--binary] [--root dir] [--ref dir] [--paths a,b]
    [--selftest]`: the three copyright checks of ARCHITECTURE §18 in one tool (all three by default;
    "the banned-strings check" of BUILD_PLAN §1.6 is `node tools/shingles.cjs --banned`). Words
    are compared lower-case without punctuation, with placeholders, interpolations and plain
    numbers as one wildcard. Outside a git work tree (an exported tree) the binary check walks the
    files minus the git-ignored directories.
  - `tools/banned.txt` format: `[substring]` (default), `[word]`, `[upper]` and `[only-in] term:
    where, where` lists; `#` comments; a marker alone switches the list, a marker with text is a
    one-line entry.
  - `tools/run-all.cjs [--wave N | --strict] [--only g,g] [--skip g,g] [--full] [--jobs N] [--bail]
    [--verbose] [--list]`, groups `node`, `tools`, `balance`, `e2e`, `visual`, `perf`; without
    `--wave` it infers the wave from the stubs left (strict when none is left); an unknown group
    name or a `--wave` outside 1-4 is a usage error (exit 2); a suite past its timeout gets SIGTERM
    (Playwright closes its browsers), then SIGKILL 5 s later.
  - `tests/e2e/a11y.test.cjs` exports `audit(rootSel)` (in-page: names, roles, image alternatives,
    dialog names, text contrast ≥ 4.5 / 3, text ≥ 12 px), `tabWalk(t)` (real Tab presses through
    the current focus scope: order, scope, ring, names), `check(T, t, label, rootSel)` and
    `focusEveryNav()`, so any e2e suite can audit its screens: `await t.eval(A.audit, '#ui')`.
  - `tests/perf/calibrate.js`: a classic script or a Node module; in a page `window.SRCalibrate`,
    in Node `require()`: `run(runs?) → { ms, factor, reference, checksum, runs }`, `factor(ms)`,
    `REFERENCE_MS` (20). It never touches `window.SR`.
  - `tests/visual/visual.cjs [--record] [--only a,b] [--list] [--goldens dir] [--strict]
    [--selftest]`; goldens are `tests/visual/goldens/<scene>.json` = `{ id, kind, source, sel,
    grid: [64, 36], tolerance: 12, size, preset, viewport, dpr, rows: [36 strings of 64 RRGGBB] }`.
    A scene that has a golden and can no longer be captured fails (never "pending").
  - `tests/perf/perf.cjs [--quick] [--record] [--only id,id] [--json file] [--selftest]`;
    `tests/perf/baseline.json` = `{ v: 1, note, tours: { <frames>: { fingerprint, recorded,
    calibration, frames, configs: { <config>: { driver, update, render } } } } }`, one recording per
    tour length: the lead runs `--record` and `--record --quick` (run-all's default) at each
    integration, and each run is gated against the recording of its own tour length.
  - `tests/balance/sim.cjs`: `simulate({ bot, policy, seeds, days, difficulty, length, SR })`,
    `csv`, `summary`, `chart`, `assertBands`, `BANDS`; bots (`tests/balance/bots.cjs`) are
    `{ name, decide(state, ctx) → { id, params } | null, minigame?, init?, jailChoice? }` with the
    `ctx` documented in that file's header.
- **Why:** BUILD_PLAN §1.6 makes every package run these; waves 2-4 packages need written names.
- **Meanwhile:** documented in each file's header.

## 2. ARCHITECTURE §17 and §18 (lead): how the perf runner reads CPU budgets

- **File:** `docs/ARCHITECTURE.md` §17 ("How it is checked", item 1) and §18 (the Performance row).
- **Change:** add: "Headless Chromium rasterises 2D canvases in software on the main thread and
  flushes a large frame's recording in the middle of whatever canvas call comes next (10-30 ms at
  1920 × 1080), which a GPU does off the CPU; emulated GPU raster (SwiftShader) stalls the main
  thread instead. `tests/perf/perf.cjs` therefore gates each frame's **JS work**: the frame's time
  minus the time spent inside native canvas calls (test-only timers on
  `CanvasRenderingContext2D.prototype`, path building excepted), p95 over a 60 s tour of one step
  and one render per frame (the loop's own pace), camera up to about 430 u/s. Update ≤ 2 ms per
  step, render ≤ 11 ms (world 6 + lighting 2 + baking 3), frame ≤ 16.7 ms, all × the calibration
  factor; baking per frame from `SR.render.stats().frame.parts.bakeGround + bakeBuildings` ≤ 3 ms ×
  factor and ≤ 2 chunks; Low under ×4 throttle: frame JS work ≤ 33 ms × factor. The raw frame time
  and the native canvas time are reported, not gated. Memory: each cache against its budget over
  the route at zoom 0.8 / 1 / 1.25, and the render caches + the stage canvases + the JS heap ≤
  160 MB (the parts' budgets add up to more than the total, so the total binds)." (This also
  answers W1-G request 5.)
- **Why:** the raw headless p95 of a frame measures the container's software rasteriser (26 ms at
  High on the render sheet while the JS work is 1.7 ms), so it cannot gate the game's CPU cost.
- **Meanwhile:** implemented that way; the relative gate compares the same JS-work numbers.

## 3. ARCHITECTURE §17 (lead): the 1.8 MB script budget is already exceeded in wave 1

- **File:** `docs/ARCHITECTURE.md` §17 (Script size).
- **Change:** decide before wave 2 whether the budget is raised (for example to 4 MB) or held with a
  rule (comments count; no minification step exists): the 257 scripts of `index.html` already hold
  1.82 MB (2^20 bytes) with about 150 files still stubs, and the wave-1 files average about 12 KB.
- **Why:** `tests/perf/perf.cjs` gates it (≤ 1.8 × 2^20 bytes: ARCHITECTURE's "MB" is 2^20 bytes
  elsewhere in §17, a 1 MB chunk being 512 × 512 × 4); wave 2 adds about 100 more real files.
- **Meanwhile:** gated as written, so `tests/perf/perf.cjs` fails this one check today (every other
  budget it gates passes on the wave-1 tree).

## 4. CONTRACT §7 (lead): owners of keys the prefix table leaves open

- **File:** `docs/CONTRACT.md` §7 (the key-owner table).
- **Change:** record what `tools/validate.cjs` (`textOwner`) assumes: `mg.shiftrush.*`,
  `mg.timingring.*`, `mg.duel.*` (the generic engine strings) → `en-ui.js` with `mg.frame.*`;
  `toast.act.*` → `en-prog.js` (W1-R request 8); `vm.<npc>.*` / `bark.<npc>.*` by NPC: harold, kid,
  skid, dealer, red, newguy, junker, mcholland → `en-street.js`; mel, dee → `en-food.js`; vinnie,
  sofia → `en-goods.js`; penny, bea, gil, frankie, terry → `en-money.js`; quill, plume, board,
  doodle, crayon → `en-civic.js`; sticky, lou → `en-night.js`; tabby → `en-transit.js`; crease,
  margin, preacher → `en-park.js`; ori → `en-world.js`; `act.world.*`, `desc.world.*` →
  `en-world.js`; `act.bag.*`, `act.phone.*` → `en-pocket.js`.
- **Why:** the `--wave` downgrade and the owner check follow the table; these prefixes had no row.
- **Meanwhile:** implemented as listed; an unmapped prefix is an error when its key is missing.

## 5. `js/rules/effects.js`, `js/rules/act.js` (W1-R): the income source in cash and bank Deltas

- **File:** `js/rules/effects.js` (`credit`) and the Delta builder of `js/rules/act.js`.
- **Change:** a positive `cash` / `bank` Delta produced by an effect with an income source (`wage`,
  `rent`, `salary`, `interest`, `deal`, `tour`, `loot`, `win`, `prize`; CONTRACT §8.4) carries it
  as `key` (`{ kind: 'cash', key: 'wage', n, from, to }`), as CONTRACT §8.3's `key?` allows.
- **Why:** BALANCE B-25 and B-23 ("stock profit is < 25 % of any bot's total income", "tour fees are
  < 40 % of the Saint's income") need income by source; named fns (`jobs.work`, `trade.tour`) hide
  the source from the data.
- **Meanwhile:** `tests/balance/sim.cjs` (`sourceOf`) uses the Delta's `key` when it names a source,
  else the first `['cash' | 'bank', n, src]` of the action's effects, else its group (work → wage,
  crime → loot).

## 6. `tests/e2e/render.test.cjs` (W1-G): use the shared calibration

- **File:** `tests/e2e/render.test.cjs` (the `cal` block of the perf section).
- **Change:** `await page.addScriptTag({ path: path.join(h.ROOT, 'tests/perf/calibrate.js') });
  const cal = await page.evaluate(() => window.SRCalibrate.run());` and use `cal.factor`.
- **Why:** one calibration workload and reference for every CPU budget (ARCHITECTURE §17).
- **Meanwhile:** the stand-in workload in the test.

## 7. `tests/sheets/art-sheet.js` (W1-A), `tests/sheets/sound-sheet.js` (W1-S): the shared calibration

- **File:** the two sheets' local `calibrate()` stand-ins (answers W1-A request 6b and W1-S
  request 7b).
- **Change:** load `../perf/calibrate.js` with a `<script>` tag in the sheet (it defines
  `window.SRCalibrate` and nothing else) and use `SRCalibrate.run().factor`.
- **Why:** the stand-ins assume a 35 ms reference; `calibrate.js` is sized for 20 ms on the reference
  machine and measures 28-35 ms (factor 1.4-1.75) in this container.
- **Meanwhile:** the stand-ins.

## 8. `tests/e2e/input.test.cjs` (lead, W1-K): a race that hangs the suite under load

- **File:** `tests/e2e/input.test.cjs`, the rightClickBack check (line 213).
- **Change:** attach the `contextmenu` listener before the click, then await it:
  `await page.evaluate(() => { window.__menu = new Promise((res) => window.addEventListener('contextmenu', (e) => setTimeout(() => res(e.defaultPrevented)), { once: true })); });`
  `await page.mouse.click(640, 400, { button: 'right' });` … `await page.evaluate(() => window.__menu)`.
- **Why:** today `page.evaluate(...)` is started but not awaited before `page.mouse.click`, so on a
  busy machine the click can land before the listener exists and the promise never settles: under
  `node tools/run-all.cjs` (with another agent's perf tour running) the suite hung until run-all's
  timeout killed it; run alone it passes (75 / 75).
- **Meanwhile:** run-all times a suite out after 10 minutes and reports it as failed.

## 9. CONTRACT §7 (lead): length limits for event and encounter cards

- **File:** `docs/CONTRACT.md` §7 (the length limits) and ARCHITECTURE §7.2.
- **Change:** add `enc.` ≤ 400 and `event.` ≤ 400 to the prefix list.
- **Why:** GDD §6.11 validates "event and encounter cards ≤ 400", but the prefix list only has
  `card.` (the building cards' keys), so the keys of event and encounter cards (`enc.*`,
  `event.*`, en-events.js) had no limit.
- **Meanwhile:** `tools/validate.cjs` applies 400 to both prefixes (W1-Q review).

## 10. Integration note (lead): `validate --wave 1` reports W1-E's pending reason keys

- **File:** none (W1-E's own request, `docs/requests/W1-E.md`, asks for the `reason.*` keys of
  `js/rules/{bank,homes,jobs,stocks,training}.js` in `js/data/text/en-prog.js`).
- **Change:** apply W1-E's request before running `node tools/run-all.cjs`.
- **Why:** the validator now checks the text keys that code names (item 1). The 34 keys of that
  request are raised as refusal reasons by W1-E's rules but registered nowhere, so the card would
  show `⟦reason.hired⟧`; `node tools/validate.cjs --wave 1` reports them as 35 errors (one per key
  and file) until they are registered, and none once they are (checked by planting the request's
  keys).
- **Meanwhile:** nothing; the errors are real.

## Requests to W1-Q, applied in W1-Q's files

- **W1-R #8:** the validator reads `SR.rules.conditions.names` / `SR.rules.effects.names`; `toast.act.*`
  maps to `en-prog.js`.
- **W1-W #5:** a worldmap `exterior.palette` may name a palette group (`bld.<id>`); `exterior.detail`
  (an `SR.def.exterior` id) and the park `interactables[].action` ids are stub-era warnings under
  `--wave` (their owners are W2-Exterior and W3-Park); `exterior.sign` is a text key; `world.*`
  actions (building `world`) are exempt from the `hpAbove` rule, and the causes `fall`, `carHit`,
  `carCrash` (and `fight`, `mugger`, `goons`, CONTRACT §8.2) are involuntary everywhere.
- **W1-A #6a:** the palette walk accepts the numbers `sky.<i>.h` and `sky.<i>.light` and resolves the
  non-enumerable `ui` aliases by property access; every other leaf must be a colour.
- **W1-A #6b, W1-S #7b:** `tests/perf/calibrate.js` exists (item 7 above for the switch).
- **W1-S #7a:** `SR.audio.validate` checks every song and sfx; captions are checked as text keys.
- **W1-M #3:** visual scenes read a minigame's `[data-id="mg-canvas"]` (`minigame-*` scenes).
- **W1-G #5:** answered by item 2 (JS work per frame instead of best-of-3 stops).
