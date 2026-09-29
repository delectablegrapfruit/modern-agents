# Requests from W1-G (Render core), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3).

## 1. `docs/CONTRACT.md` §15 (lead): record the render core's public names beyond the frozen five

- **File:** `docs/CONTRACT.md` §15, rows `SR.render` and `SR.art` (and ARCHITECTURE §9).
- **Change:** add, next to `frame`, `invalidate`, `stats`, `fx.*` and `sky.drawWindow`:
  - `SR.render.view` (overrides `{ x, y, zoom, min, day, weather, tween }`; a `null` field follows
    `SR.world.camera` and `SR.state`) and `SR.render.setView(patch)`: the title's camera drift, the
    debug hour scrubber, contact sheets and tests; `SR.render.toScreen(x, y, z)` /
    `toWorld(sx, sy)` (logical stage units, the last frame's view); `SR.render.warm(ctx?)` (bakes
    every chunk and sprite the view needs at once: tests, sheets, the title's first frame);
    `SR.render.time()` (the displayed minute, tweened 1.5 s after a clock jump);
    `SR.render.lastView()`; `SR.render.debug.{projected(on), hours(on)}` (also driven by
    `SR.debug.flags.projected` / `.time`).
  - `SR.render.fx.{shake(amp, ms), flash(ms, alpha), offset(), flashAlpha(), busy(), state()}`.
  - `SR.render.particles.{emit(kind, x, y, n, opts), burst(kind, x, y, opts), update(dt),
    draw(ctx, view), clear(), stats()}`; kinds `dust`, `coin`, `spark`, `confetti`, `splash`,
    `scrap`, `wisp` (world units; the pool is 400 × `quality.params.particles`).
  - `SR.render.worldui.{tag(x, y, text, { key, z }), prompt(x, y, text, opts), marker(x, y),
    float(x, y, text, colour), route(points | null), doorTags}` (tags, prompts and markers are
    per frame; `colour` is a palette key or a stat name: `str`, `int`, `cha`, `hp`, `money`,
    `time`, `heat`, `karma`).
  - `SR.render.actors.{source(name, fn, kind), player(), playerPos(), cars(), carType(e), carBox(type, dir),
    stats()}` (`stats()` → `{ count, px, budgetPx }` of the car sprite LRU).
  - `SR.render.lighting.at(min, weather)` → `{ top, horizon, ambient, light, white }` and
    `SR.render.sky.colors` (the same), `SR.render.buildings.{sprite(id), litWindows(id, min, day),
    litFraction(id, min), neon(id)}`, `SR.render.ground.{model(), skyVisible(view),
    edgeInfo(x, y)}`.
  - `SR.art.exterior.{baker(def, zoom, dpr), geom(def), colours(geom), placeholder(ctx, def),
    reset(), archetypes, PROJ}` (`PROJ`: a read-only getter of the projection factor in use); `build()`'s result also carries `id`, `zoom`, `dpr`, `scale` (px per u),
    `px`, `neonPx`, and each neon entry `{ sprite, x, y, w, h, px }`; `bounds` is
    `[x0, y0, x1, y1]` in projected world units (x, y - 0.5 z), like every rect.
- **Why:** W2-City (title drift, click-to-walk mapping, float texts, coin bursts, the route),
  W2-Exterior (the `detail` hook's `geom`), W3-Light (keyframes, `shadows.draw` /
  `weatherfx.draw` hooks) and W4-Perf build on them.
- **Meanwhile:** documented in each file's header and JSDoc.

## 2. The entity lists the renderer draws (W2-City, W2-Street, W3-Crime, W3-Life; no file change now)

- **Change (a convention, for CONTRACT §15 `SR.world`):** the Y-sorted pass draws the arrays
  `SR.world.traffic.cars`, `SR.world.pedestrians.list`, `SR.world.streetnpcs.list`,
  `SR.world.police.list` and `SR.world.markers.list` (W1-W's request §6 already names `list` for
  walkers), plus `SR.world.player`. Fields read: car `{ x, y, a (radians, 0 east), kind (compact |
  sedan | taxi | van | police), braking }`; walker / person `{ x, y, facing (degrees clockwise from
  north, or 'up' | 'down' | 'left' | 'right'), state ('walk' | 'pause' | 'wave' | 'flee' | 'hop'),
  look (a look id, or the pedestrian's number n), clip?, pose?, visible }`; marker `{ x, y }`.
  Optional `px, py` (the previous step's position) are interpolated with the frame's alpha.
- **Why:** the renderer finds the actors without a registration call from each system.
- **Meanwhile:** `js/render/actors.js` also accepts `list`, `pool`, `peds`, `people`, `npcs`,
  `officers`, `markers`, and `SR.render.actors.source(name, fn, kind)` for anything else (the
  test sheets' stub actors use it).

## 3. W2-Exterior: the props and skyline hooks the painter calls

- **Files:** `js/art/props.js`, `js/art/skyline.js` (W2-Exterior, wave 2).
- **Change:** expose `SR.art.props.draw(ctx, type, variant, a)` (draws a prop with its ground
  contact point at the origin, in world units; the renderer caches it as a sprite per type,
  variant, angle and zoom), `SR.art.props.size(type, variant, a)` → `{ w, h, ax, ay }` (u; the
  anchor is the contact point inside the box), and `SR.art.skyline.draw(ctx, view, worldmap)`
  (the six distant islands and the Sky Ribbon, in stage units during the sky pass; `view` carries
  `x, y, zoom, W, H, t, min, light, sky.ambient`). Railings and the castle wall are baked into the
  ground chunks from worldmap geometry; if W2-Exterior wants to draw them, add
  `SR.art.props.railing(ctx, a, b)` / `wall(ctx, a, b, w)` and the ground bake will call them.
- **Why:** ART_AUDIO §6 and §4 give props and the skyline to W2-Exterior; the render core owns
  the caches, the draw order and the budgets.
- **Meanwhile:** `js/render/buildings.js` draws placeholder props (tree ×3, lamp, bench, hydrant,
  bin, sawhorse, chess table, binoculars, plinth) from the pre-seeded `prop.*` palette keys, and
  `js/render/sky.js` draws placeholder islands (in `city.<id>.*`) with night pinpricks and the
  Sky Ribbon with tiny buses.

## 4. `js/core/debug.js` (W1-K): don't invalidate every cache on an overlay toggle

- **File:** `js/core/debug.js`, `setFlag`.
- **Change:** drop the `SR.render.invalidate('all')` call (or call it only for `grid` if W1-W's
  overlay needs it).
- **Why:** the `projected` and `time` overlays are drawn every frame from `SR.debug.flags`;
  invalidating everything throws away 40 chunks and every building sprite, so the next frames
  show placeholders while they re-bake.
- **Meanwhile:** harmless (caches rebuild within the per-frame budgets).

## 5. W1-Q (`tests/perf/*`) and the lead: how to read CPU budgets in headless Chromium

- **Files:** `tests/perf/perf.cjs`, `tests/perf/calibrate.js` (W1-Q).
- **Change:** when the runner measures render CPU, (a) call `SR.render.warm()` before a stop and
  force a raster readback (`getImageData(0, 0, 1, 1)` on `#world`) outside the timed frame, and
  (b) hold the CPU-submit budget (§17: world 6 ms + lighting 2 ms) against the median (or the best
  of 3 frames per stop) and the frame budget (16.7 ms) against the p95.
- **Why:** headless Chromium has no GPU: canvases rasterize on the main thread, and Chrome flushes
  its deferred 2D recording in the middle of a frame when it grows, so the p95 CPU time of a frame
  carries software raster (W4-Perf will see 20-30 ms flushes at stops with 54 actors although the
  submit cost is under 1 ms). Emulated GPU raster (`--use-angle=swiftshader`,
  `--enable-gpu-rasterization`) does not help: the main thread then stalls on SwiftShader.
- **Meanwhile:** `tests/e2e/render.test.cjs` does exactly this, with its own ≈ 20 ms calibration
  workload standing in for `tests/perf/calibrate.js` (measured factor 1.2-1.45 in this container).

## 6. ARCHITECTURE §9 (lead): decisions the render core took (please fold in)

- **The grade covers the sheet, not the sky.** The multiply fill covers the torn outline, its band,
  every building's bounds and every actor's box (one Path2D), because the ART_AUDIO §2.2 sky
  colours are final; clouds and the distant islands are tinted by the ambient inside their caches.
- **Traffic cars on the 8 directions are cached sprites** per type, direction, lamp state and zoom
  (one `drawImage` each); a car between directions (turning) and the player's car stay vectors.
  W1-A's vehicles cost about 22 path fills each, so 14 vector cars alone would pass the 250-fill
  budget (§17). The "props, actors and neon ≤ 8 MB" line is split: car sprites are an LRU of
  1.25 Mpx (boxes fitted to each direction), prop sprites an LRU of 0.5 Mpx, neon ≤ 0.2 Mpx, the
  light sprites 0.03 Mpx; a sprite that would only fit by evicting one drawn this frame is drawn as
  vectors instead (bounded memory, no thrash). (Review: the first cut cleared 64 car sprites at
  once and never evicted props; W1-Q's perf tour measured 12.1 MB.)
- **Sky tints in place.** The clouds and distant islands are pre-tinted by the ambient; each
  variant / city keeps one canvas repainted when the 5-minute tint moves on, so a clock tween or
  the time-lapse never piles tints up (the first cut reached 16.5 MB through a day's tints).
- **Hidden lights.** A light source (car cone and tail lights, lamp pool, door spill, fountain)
  whose ground point lies under a building drawn after it is dimmed by that building's opacity
  (hidden at 100 %, 65 % through a building faded to 35 %). Tail lights come from
  `SR.art.vehicles.lamps` and are skipped for a car heading south (its rear faces north).
- **The grain on sprites** is laid `source-atop` as ink with alpha (1 − paper luminance) × 6 %,
  which darkens like the multiply but never touches a transparent pixel (a multiply left a pale
  veil beside set-back tiers). Lit windows under signs, name plates, blade signs and awnings, and
  the castle's north-tower slits behind the keep, are dropped from the window list.
- **Bake zooms.** A zoom easing between levels draws from the nearest level's caches; a zoom below
  the smallest level (overviews, the title's wide shots) bakes at its own zoom rounded to 0.05.
- **The sky pass is skipped** when every 64 u cell of the view is interior sheet (the chunks cover
  every pixel); `SR.render.frame` clears the canvas first so the browser can drop the previous
  frame's recording.
- **People on an east / west door mat sort in front of that building** (its awning hangs over the
  mat); the occlusion fade stays for masses and tall roof features. Building footprints are baked
  as a dark slab, which is what a faded building shows underneath.
- **Numbers.** The B-15 values are read from `SR.tuning.world` (`camera.zooms`, `occlusionAlpha`,
  `door.prompt` / `door.tag`, `edgeWarn`, `projection.k`) with named fallbacks. The presentation
  numbers of ART_AUDIO §2-§3 and ARCHITECTURE §9 / §17 (lamps 19:45-06:45, neon 19:00-07:00, lamp
  pools r 90 u, headlights 160 u / 35°, flicker 2 % / 120 ms, the lit-window schedule, chunk and
  sprite budgets) are named constants in their render files; move them to `tuning.js` only if
  the lead wants them tunable.

## 7. ARCHITECTURE §17 (lead): the script-size budget has no room left

- **File:** ARCHITECTURE §17 ("Script size ≤ 1.8 MB of JS in total"), gated by
  `tests/perf/perf.cjs`.
- **Change:** decide how the budget is measured before wave 2 (for example: minified, or JS
  without comments and indentation, or a larger cap). At the wave-1 HEAD the 257 scripts of
  `index.html` held 1,886,472 bytes against a cap of 1,887,437 (965 bytes left); the render-core
  review fixes add about 12 KB (bounded caches, hidden lights, the painter fixes), and every wave-2
  package adds tens of KB.
- **Meanwhile:** nothing; `perf.cjs` reports the overrun (1.82 MB at the time of the review).

## 8. W1-Q (`tests/perf/perf.cjs`): time the stage contexts' own draw methods as native

- **File:** `tests/perf/perf.cjs`, `runTour` (W1-Q).
- **Change:** after wrapping `CanvasRenderingContext2D.prototype`, also wrap the own function
  properties of `SR.stage.ctx` and `SR.stage.fxCtx` (skipping the PATH names) with the same
  native timer, and restore them in the `finally`:
  `Object.getOwnPropertyNames(c).forEach((k) => { const f = c[k]; if (typeof f !== 'function' || PATH.test(k)) return; own.push([c, k, f]); c[k] = function () { const a = performance.now(); try { return f.apply(this, arguments); } finally { nAcc += performance.now() - a; } }; });`
- **Why:** `js/core/loop.js` (`instrument`) counts draws with per-instance `drawImage`, `fill` and
  `fillRect` wrappers that call the prototype's original methods, so the runner's prototype
  timers never see those calls on the stage contexts. Chromium's mid-frame raster flush often
  lands in them, and the runner then books it as JS work: `high-dpr2-noon` reports render JS p95
  ≈ 43 ms (native p95 ≈ 43 ms), all of it inside `drawImage` of building sprites. With the
  instance methods timed, the same tour measures JS p95 1.6 ms (render 1.5 ms) against
  11 ms × calibration.
- **Meanwhile:** the DPR 2 configurations fail the CPU gates in CI (measured: `high-dpr2-noon`,
  at HEAD and after the review alike); the DPR 1 and Low ×4 configurations pass.
