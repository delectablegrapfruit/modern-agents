# Requests from W1-K-M1 (Kernel M1: loop, stage, quality, input, save, settings, debug), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). The additive public names of M1 are recorded as decisions D33-D42 in
`docs/CONTRACT.md` §21 (and four events in §9.2); request 2 asks the lead to fold them into
ARCHITECTURE.

## 1. `js/data/text/en-ui.js` (W1-D): the gamepad hot-plug toast keys

- **File:** `js/data/text/en-ui.js`.
- **Change:** add `'ui.pad.connected': 'Controller connected'` and
  `'ui.pad.disconnected': 'Controller disconnected'` (ARCHITECTURE §11: "hot-plug toasts").
- **Why:** `js/core/input.js` shows `SR.ui.toast({ key, kind: 'info' })` on `gamepadconnected` /
  `gamepaddisconnected`; the kernel owns no text file.
- **Meanwhile:** the toast is skipped while `SR.text.has(key)` is false; the `input:pad
  { connected, id }` event is emitted either way. (The other kernel keys, `ui.stage.turn`,
  `ui.stage.playAnyway`, `ui.save.codeTitle`, `ui.save.copyHint` and `ui.close`, are already there.)

## 2. `docs/ARCHITECTURE.md` (lead): fold the M1 decisions and fix the crispness example

- **File:** `docs/ARCHITECTURE.md` §2, §3, §11, §15, §16, §18 (harness), §20.
- **Change:** fold D33-D42 of `docs/CONTRACT.md` (additive names: `SR.input.poll/actions/defaults/
  contexts/releaseAll/stick`, `on('*')`, `ev.consumed`; `SR.save.storage/available/SLOTS/lastError/
  retain/validate/recover/playSec/flush/copyCode`, `load(slot | state)`, `write(slot, state?)`;
  `SR.settings.reset/defaults/reload`; `SR.loop.start/steps` and the `perf` detail fields;
  `SR.stage.box/horizon/tick/resetPortrait`, `#app[data-layout]`; `SR.quality.sample/presets`;
  `SR.debug.flags/overlay`; the events `save:loaded`, `save:broken`, `input:pad`, `debug:changed`).
  In §2, the crispness row: "1366 × 768 (k = 0.7125)" is inconsistent: a 1366 × 768 window gives
  k = 768 / 720 ≈ 1.067; k = 0.7125 is a 912 × 513 window. Suggested text: "screenshots text in
  `#ui` at 1366 × 768 (k ≈ 1.067) and 912 × 513 (k = 0.7125) and asserts it matches the same text laid
  out natively at the final size".
- **Why:** CONTRACT refines ARCHITECTURE until the lead folds decisions back (CONTRACT, preamble).
- **Meanwhile:** `tests/e2e/stage.test.cjs` checks both sizes (D40).

## 3. Engine limits stay as named constants in the kernel files (lead to confirm)

- **Files:** `js/core/save.js`, `js/core/quality.js`, `js/core/input.js`, `js/core/loop.js`,
  `js/core/stage.js` (no change requested unless the lead prefers `js/data/tuning.js`).
- **Change:** none, or move these into a tuning table if the lead wants them there: retention
  (150 messages, history daily to day 120 then every 7th morning, 30 rate points; the log cap already
  reads `tuning.news.logMax` and the stock history `tuning.stocks.history`, with 20 / 30 as
  fallbacks), the save budget (60 KB), the autosave gap (60 s), the Auto quality thresholds (5 s window, 12 ms / 7 ms, 20 s), the quality preset table,
  the stage constants (2560 × 1440 cap, 0.92 compact scale, 150 ms resize debounce), the input
  constants (dead zone 0.2, digital threshold 0.5, pad repeat 0.4 s / 0.1 s, touch-stick travel
  64 u) and the loop's 5 catch-up steps.
- **Not in this list:** the ironman debounce and the ironman rule itself are read from
  `tuning.difficulty.<difficulty>` (`ironmanDebounceMs`, `saves: 'ironman'`; BALANCE B-16), with
  2 s / the id `hardcore` only as fallbacks.
- **Why:** BUILD_PLAN §1.7 asks for a request when a number is not in BALANCE. These are ARCHITECTURE
  §2, §3, §11 and §15 engine limits, not balance values, and the tuning table names are frozen
  (CONTRACT §3.6), so the kernel keeps them as clearly named constants citing their section.
- **Meanwhile:** named constants at the top of each file.

## 4. `js/core/scenes.js` (lead, M1 transitions): honour the no-transition paths

- **File:** `js/core/scenes.js`.
- **Change:** when the M1 transitions land (§11.4), treat `SR.debug.fast() === true` and a third
  argument `{ transition: false }` as "swap at once" (CONTRACT §11.4 already says so).
- **Why:** `SR.debug.goto`, `SR.debug.enter` and `SR.debug.newGame({ scene })` pass
  `{ transition: false }`, and the harness option `fast: true` calls `SR.debug.fast(true)`; e2e
  suites with the loop paused would otherwise wait on a transition that never animates.
- **Meanwhile:** the M0 `scenes.go` ignores the third argument, so nothing breaks today.

## 5. `js/audio/engine.js` (W1-S): suspend the AudioContext while the tab is hidden

- **File:** `js/audio/engine.js` (still a stub at this review).
- **Change:** on `visibilitychange` to hidden call `ctx.suspend()`; on visible `ctx.resume()` if the
  context was unlocked (ARCHITECTURE §3, §12: "Suspended while the tab is hidden"). Alternatively
  expose `SR.audio.suspend()` / `SR.audio.resume()` through a contract request and the loop will call
  them next to its own pause.
- **Why:** CONTRACT §20 says the hidden tab "pauses the loop and suspends audio", but §14.1 names no
  suspend / resume, so `js/core/loop.js` pauses only itself and cannot reach the context.
- **Meanwhile:** the loop pauses on a hidden tab (game time stands still); audio is not suspended
  until W1-S lands this.

## Notes for later packages (no change requested)

- **W2-Front:** start a new game with `SR.save.load(SR.rules.state.create(opts))` (it installs the
  rules and world streams and the play clock); show "This save couldn't be read" on `save:broken`
  (or when `SR.save.read` returns `null` with `SR.save.lastError.reason` other than `newer`), and
  the friendly newer-version message when the reason is `newer`; "Copy save code" is
  `SR.save.copyCode()` (it opens the textarea fallback itself); "Paste save code" is
  `SR.save.importCode(text)` then `SR.save.load(state)`; the boot's storage warning reads
  `SR.save.available`; `write` throws `code: 'quota'` for the "delete a slot" prompt.
- **W2-City / W1-W:** the touch stick is `SR.input.axis('move')` (and `SR.input.stick` for drawing
  it); a touch that starts on the right half of the world is free for tap-to-walk.
- **W1-M:** `SR.debug.mg` calls `SR.minigame.force`; the frame's `pending` + `SR.save.write
  ('ironman')` is exactly what the ironman rules expect (D34).
- **W2-Pocket / W1-D:** Tab is `pocket` everywhere (CONTRACT §12.1) and `js/ui/focus.js` also moves
  focus on Tab inside a scope; UI §6 wants Tab to open the Pocket only in the city and to close it in
  the Pocket. Scenes other than the city should ignore `pocket` when `ev.code === 'Tab'`, and the
  Pocket should either close on it or rely on focus movement, not both.
