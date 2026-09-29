# Requests from W1-M (Minigame framework and engines), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-3 record additive public names for the lead to fold into
`docs/CONTRACT.md` §13 and §15; items 4-5 ask W1-R for tuning rows; item 6 is for W1-D (and the
`pitch` skin's owner); items 7-8 are for W1-S; item 9 is for W1-C; item 10 is a wording fix in
`en-ui.js`. (Items 2, 4, 6 and 9 were revised and item 10 added in the W1-M review.)

## 1. CONTRACT §13 / §15: the rest of `SR.minigame`

- **File:** `docs/CONTRACT.md` §13 and the `SR.minigame` row of §15 (lead).
- **Change:** besides `register` and `run`, record (all in `js/minigames/framework.js`, except
  `current` in `js/scenes/minigame.js`):
  - `lookup(id, params)` → `{ id /* engine */, def, skinId, skin, params /* skin params + run params */ } | null`
  - `auto(id, params, rng?, state?)` → a sampled result, or `null` for a game without Auto (the
    balance simulator and tests use it; defaults `SR.rng.rules`, `SR.state`)
  - `force(result)` → queued count: the next `run` resolves with it at once, without the frame
    (`SR.debug.mg` already calls it)
  - `chance(stat, D, { s, checkId })` (→ `SR.rules.check.chance`, or GDD §4.3's bare formula until
    it exists), `roll(rng, p)` (→ `SR.rules.check.roll`), `tune(path, default)` (a dotted read of
    `SR.tuning`)
  - `autoPolicy(lookup)`, `worst(lookup)`, `forfeit(lookup, progress)`, `isStake(lookup)`,
    `glyph(code)`, `bindings(action, context, keys)`, `engines()`
  - `current()` → the open round (`{ id, skin, params, t, panel, finished, replaying, result, assist,
    device, context, contextPushed, announced, inst, host }`) or `null` (tests, tools)
- **Why:** engines, the building card, tests and the simulator need them; none collides with a
  frozen name.
- **Meanwhile:** shipped as listed.

## 2. CONTRACT §13: the engine, instance, host and skin fields W1-M added

- **File:** `docs/CONTRACT.md` §13 (lead).
- **Change:** record these optional fields (all additive; the frozen ones are unchanged):
  - **Engine def:** `worst(params)` (Hardcore's `pending.worst`), `forfeit(params, progress)`
    (leaving early; default `worst`), `summary(result, text, skin, params)` → the banner line,
    `assist: false` (hides Assist), `confirmExit: true` (Exit always asks), `stake: true`,
    `replay` (seconds), `context` (the input context's name; default the engine id, per §12.3;
    Shift Rush sets `orderup`, the name §12.3 gives its keys).
  - **Instance:** `pointer(kind, x, y, ev)` (`'down'|'move'|'up'` in play-area units, 1280 × 576),
    `auto(rng)` (Auto from the current position), `replay(result)`, `progress()`,
    `assistChanged(on)`, `peek()` (tests). `render(ctx)` receives a context in play-area units,
    clipped to the play area.
  - **Host:** `params`, `skin`, `skinId`, `area { w, h }`, `t`, `paused` (the pause panel is up
    or another overlay covers the frame), `interactive()`, `haptic(ms)` (UI §6, through
    `SR.ui.dom.haptic`),
    `hints([{ action | actions | range, label, only: 'kb'|'pad'|'touch' }])` (the bottom bar),
    `color(token)` (a `css/tokens.css` property such as `'ink-900'`, else `SR.art.palette.ui`),
    `font(px, weight, display)`, `chance(stat, D, checkId)`, `roll(p)`, `el`, `button`, `chip`,
    `ring`. `label('info', text)` and `label('status', text)` are the visible top- and bottom-bar
    slots; other ids go to the visually hidden mirror. `audio` is `{ sfx, stinger }`, silent for
    sounds that are not registered.
  - **Skin:** `context` (overrides the engine's context name; rarely needed: every skin of an
    engine shares one context, so Settings › Controls remaps `orderup`, `timingring` and `duel`),
    `stake`, `music`, `params` may be
    `fn(state, runParams)`, `auto: false` (no Auto) or a policy fn.
  - **Results:** Duel adds `picks: [optionId]` (the Ruthless karma of B-30 is the rules' to apply),
    `stances` in stance mode and `m` in cards mode; the hotwire result adds `hits`; Auto results
    carry `auto: true`; a result from leaving early carries `exited: true`.
  - **Run params the frame reads:** `stake` (a number is shown as "Stake $n"), `auto: true` (open
    straight into the Auto replay; the card passes it for `game.alwaysAuto`), `resolve` (the
    resolve action id for the Hardcore hook; without it the frame uses the last `Result.open` seen
    on `action:done`).
- **Why:** so wave-2 engine and skin authors (W2-Night, W2-Food, W2-Money, W2-Civic, W2-Street) code
  against written names.
- **Meanwhile:** documented in the headers of `js/minigames/framework.js` and `js/scenes/minigame.js`.

## 3. The minigame scene draws into its own canvas

- **File:** `docs/ARCHITECTURE.md` §10 and §18 (lead); `tests/visual/visual.cjs` (W1-Q).
- **Change:** note that the frame's play area is a `<canvas data-id="mg-canvas">` inside the
  frame (in `#ui`), sized to the play area's device pixels; the scene's `render(ctx, alpha)` draws
  there and ignores the stage context. A visual golden of a minigame reads that canvas, not
  `#world`.
- **Why:** the touch-compact layout (ARCHITECTURE §2) anchors `#ui` regions to the window while the
  world canvas stays letterboxed, so a play area drawn on `#world` would not line up with the
  frame's bars and its DOM controls; an own canvas keeps pointer mapping exact in every layout.
- **Meanwhile:** as described; the scene `blocksRender`, so the city is not redrawn under it.

## 4. `js/data/tuning.js` (W1-R): rows for the numbers the engines hold as constants

- **File:** `js/data/tuning.js` (W1-R) and BALANCE B-05 / B-15 / B-26 (lead).
- **Change:** add, with these names (the engines already read them through `SR.minigame.tune`
  once they exist):
  - `jobs.hustle.orderup.items: [2, 5]` — GDD §6.5 "tickets list 2-5 items"
    (now `ITEMS_PER_TICKET` in `shiftrush.js`).
  - `jobs.hustle.sortit.streak: { step: 0.1, max: 1.5, every: 3 }` — GDD §6.5 "streaks step ×1.1
    to ×1.5"; `every` (right sorts per step) is a design number (now `STREAK_*`).
  - `jobs.hustle.sortit.travelSec: [3.2, 2.2]` — how long a belt item takes, start → end of the
    round (a design number; now `BELT_TRAVEL`).
  - `street.junker.ring.arc: { base: 20, perInt: 0.2, from: 200, min: 8, max: 70 }` — GDD §6.5's
    hotwire arc clamp(20° + (INT - 200)/5, 8°, 70°), which B-26's row does not state (now
    `HOTWIRE_ARC` in `timingring.js`). "Up to 5 presses" needs no row: it is B-26's
    `hits + misses - 1`, and the engine derives it.
  - `world.assist: { speed: 0.7, sweet: 1.5, wobble: 0.5 }` — GDD §6.5 Assist: -30 % speed, +50 %
    sweet spots, half the wobble (B-15 already holds the other Assist options; B-14f's wobble
    ×0.5 is the same number). Now `ASSIST_SPEED` / `ASSIST_ARC` in the engines.
- **Why:** BUILD_PLAN §1.7.
- **Meanwhile:** the named constants above, each citing GDD §6.5.

## 5. Confirm the sortit belt cadence

- **File:** BALANCE B-05 `hustle.orderup / sortit` (lead), `js/data/tuning.js` (W1-R).
- **Change:** confirm, or replace with an explicit `jobs.hustle.sortit.itemEverySec`, this
  reading: on the belt, `sortit.itemsPerCorrect` (3) items arrive per ticket interval, i.e. every
  `ticketEverySec / 3` = 2 s speeding to 1 s.
- **Why:** BALANCE gives sortit the same "tickets every 6 s → 3 s" as orderup and "1 correct per 3
  items"; one item per 6-3 s would cap m below 1.0 (about 7 items = 2.3 correct in 30 s), so the
  hustle could never pay the Auto shift's 1.0.
- **Meanwhile:** `shiftrush.js` uses `ticketEverySec / itemsPerCorrect`; a clean round with
  streaks reaches m ≈ 1.2-1.3.

## 6. `js/ui/card.js` (W1-D): the Hustle button's step, and rejected runs

- **File:** `js/ui/card.js` `runHustle` and `runMinigame` (W1-D); `js/minigames/skins/pitch.js`
  (W2-Money).
- **Change:** (a) the named fn `jobs.hustleSkin` now returns the skin id (`'orderup'`; checked in
  the review), so `runHustle` opens the right skin, but the Timing Ring's difficulty `step`
  (Salesperson 0, Executive 1; B-05 `pitchStep`) never reaches the engine. Either `runHustle` passes
  `step: SR.rules.jobs.hustleSkin(s, track).step`, or the `pitch` skin derives it in its params fn
  (`params: function (s) { return { mode: 'grade', step: SR.tuning.jobs.hustle.pitchStep[s.job.ranks.nli] || 0 }; }`).
  (b) Both `SR.minigame.run(...).then(...)` chains lack a rejection handler: while a skin file is
  still a stub, `run` rejects ("unknown engine or skin") and the page logs an unhandled rejection.
  Add `.catch` with the `ui.minigamePending` toast.
- **Why:** Executive pitches would otherwise play at Salesperson speed; zero console errors.
- **Meanwhile:** the engine reads `params.step` (default 0); nothing in W1-M's files.

## 7. `js/audio/sfx.js` (W1-S): the minigame sounds

- **File:** `js/audio/sfx.js` (W1-S).
- **Change:** register (or tell W1-M the names you chose for) ART_AUDIO §13.5's "Timing Ring tick
  and hit, Shift Rush item and bin sounds": `mg_hit`, `mg_miss`, `mg_item`, `mg_bin`, `mg_serve`,
  plus the UI `error`.
- **Why:** the engines call `host.audio.sfx(name)`, which skips names that are not registered.
- **Meanwhile:** silent.

## 8. `SR.audio.duck` for the length of a minigame

- **File:** `js/audio/music.js` / `engine.js` (W1-S), CONTRACT §14.1 (lead).
- **Change:** a way to hold a duck while the frame is open (ART_AUDIO §13.4: "minigames duck the
  song 6 dB"), e.g. `SR.audio.duck(6, Infinity)` held until `SR.audio.duck(0)`.
- **Why:** `duck(db, ms)` takes a duration and a round has none.
- **Meanwhile:** the frame switches to an engine's or skin's `music` when it has one (casino,
  fights) and restores the building's song on close; it does not duck.

## 9. `js/rules/crime.js` (W1-C): the Hold-up run params

- **File:** `js/rules/crime.js` `holdupParams(s, target)` (W1-C).
- **Change:** include `target: 'store' | 'bank'`, `D` (a number, or `{ base, perHeat }` for
  60 + Heat; the bank's `100 × robberies in 14 days` needs a number) and `stake: true`.
- **Why:** the Duel now derives B-28b's check id from the skin and `target` (`holdup.store.<stat>`
  / `holdup.bank.<stat>`; `tour.hook.<stat>` for the tour hook), so Relaxed, Bad karma and
  Intimidating apply without a `check` param; without `target` a bank job would read the store's
  modifiers (they are the same rows today). `stake` turns on the Hardcore pending hook. The skin
  row `duel.holdup` already gives mode, beats, need and options.
- **Meanwhile:** the test skin in `tests/sheets/minigames.html` passes `check: 'holdup.store'` and D;
  the defaults are tested in `tests/e2e/minigames.test.cjs` (review probes).

## 10. `js/data/text/en-ui.js` (W1-D; W2-Front in wave 2): the Duel's D chips

- **File:** `js/data/text/en-ui.js`, keys `mg.frame.duel.halved` and `mg.frame.duel.doubled`.
- **Change:** today they read "countered: easier" / "countered: harder", but the halved D belongs
  to the option that **beats** the stance (Facts vs Emotion) and only the doubled one is countered
  (B-30). Suggested: `'mg.frame.duel.halved': 'beats their stance'`,
  `'mg.frame.duel.doubled': 'their stance counters it'` (the D number beside them already says
  easier or harder).
- **Why:** the chip is the only on-card explanation of the counter table (UI §5.8 stance mode).
- **Meanwhile:** unchanged; the engine only picks the key.
