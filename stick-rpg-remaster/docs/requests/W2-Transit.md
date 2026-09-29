# Requests from W2-Transit (wave 2)

W2-Transit built the bus depot, the Sky Bus trip, jail, the hospital and FLATLINED (BUILD_PLAN §4.9).
Each item: the file, the exact change, why, and what W2-Transit does meanwhile.

## 1. `js/scenes/results.js` (W2-Front): let the death, hospital and jail scenes finish before the results

- **Change:** in the `game:over` listener, do not queue `results` at once when a W2-Transit scene
  presents the end: when `payload.reason === 'death'` and `SR.reg.scene.death` exists, or when the top
  of the stack (or the change already queued) is `death`, `hospital` or `jail`. Those scenes go to
  `results` themselves, with `SR.scenes.go('results', { reason, result: SR.state.result })`:
  `death` after the FLATLINED stamp, the dirge and the ink blot (3.4 s, or a press); `hospital`
  through W2-Home's Stick General report, whose finish already queues `results` when the night ended
  the game; `jail` from the Jail Day card's "Read the Final Edition" button.
- **Why:** `SR.act` emits `player:down` before `game:over` in the same action (CONTRACT §8.7). The
  `player:down` listener (js/scenes/hospital.js) queues `death`, which runs at once when the top is a
  base scene; a `game:over` listener that queues `results` then replaces it before FLATLINED is seen
  (GDD §4.16 "FLATLINED, then the results"; UI §5.12). The same holds for a timed game that ends in a
  hospital or jail night ("the results follow the Stick General report", GDD §4.16), and for a Hardcore
  loan default, where js/scenes/death.js queues `death` on the morning report's `day:started` (with
  `report.dead`) and a later `queue('results')` would replace that pending change.
- **Meanwhile:** the W2-Transit scenes go to `results` when it is registered (else `title`); the e2e
  suites accept either scene at the end, so they pass before and after W2-Front's results land.
- **Status (review):** W2-Front's `js/scenes/results.js` now skips a `death` game over while the death
  scene is registered and any game over while `death`, `hospital`, `jail` or `report` is on the
  stack (`PRESENTERS`); `tests/e2e/hospital.test.cjs` asserts that FLATLINED stays up on Hardcore.

## 2. `docs/ARCHITECTURE.md` §19 and `docs/CONTRACT.md` (lead): the tour's resolve id and the additive names

- **Change:** in ARCHITECTURE §19, `js/data/actions/trip.js … trip:resolve` → `trip.tour:resolve`; the
  file also registers `trip.redeye` and `trip.tour`. Record the additive names in CONTRACT §15.4 /
  ARCHITECTURE §7 (nothing frozen changes):
  - actions: `bus.board` (the depot's one card row, `screen: 'bus.board'`); owner `trip`:
    `trip.redeye` (params `{ city, kind: 'smuggle' }`, 00:00, the ticket as `cost.cash
    'trade.ticket'`), `trip.take`, `trip.haggle` (P1 `tours`), `trip.walk`, `trip.tour` (P1 `tours`,
    params `{ city, kind: 'tour' }`) and its `trip.tour:resolve`, `bus.wait` (P1 `tours`); owner `jail`:
    `jail.day` (params `{ choice }`), `jail.bail` (P1 `police`); owner `hospital`:
    `hospital.discharge`;
  - named fns: `greet.bus` (Tabby's departure clock), `trip.waitUntil`, `trip.beforeTours`;
  - scene params: `bustrip` `{ city, kind, from }` or `{ resume: true }`; `jail` `{ report, jailed,
    from }` or `{ resume: true }`; `hospital` `{ down, cause }`; `death` `{ down, cause, reason }`
    (or `{ reason, dead }` after a loan default); each of the four scene defs has an `info()` for tests;
  - `SR.ui.jail` = `{ card(opts), view(state, report, extra), summary(report), booked(days, reason), CHOICES }` and
    `SR.ui.hospital` = `{ card(opts), gag(), lines(down, state) }` (js/ui/screens/{jail,hospital}.js);
  - the island painter `SR.reg.interior.trip.fns.island(ctx, cityId, x, y, scale, t, { night, still })`
    (js/art/interiors/special.js; the trip scene uses it, W2-Exterior's skyline may) and its baked
    far-island sprite `fns.islandSprite(cityId, scale, night, px)` → `{ canvas, x, y, w, h }`.
- **Why:** the `<id>:resolve` convention of CONTRACT §8.2 needs the opening row's id (`trip.tour`
  opens the `tourhook` skin, so `trip.tour:resolve` resolves it); "trip:resolve" has no opening row.
  The rest are the names W2-Transit's files expose to tests and to other packages.
- **Meanwhile:** implemented as listed.

## 3. `docs/ARCHITECTURE.md` §20 / `docs/CONTRACT.md` §17.1 (lead): what `SR.debug.fast()` skips here

- **Change (record):** with `SR.debug.fast()` the hospital scene skips its presentation (the gag,
  the Stick General card, the report): its first update runs `hospital.discharge`, finishes the
  hospital night (its events, `day:started`) and brings the city at 12:00 outside the home door (or
  the results when the night ended the game); the death scene goes on to the results on its first
  update; the trip scene skips both rides (the event card still waits for its decision); the jail's
  Jail Day card always waits for a choice.
- **Why:** `tests/e2e/slice.test.cjs` (strict, lead-owned) runs with `fast: true` and expects the city
  two steps after `SR.debug.down('fall')`, the behaviour of the wave-1 placeholder this file replaced.
  The presentation itself is tested with `fast(false)` in `tests/e2e/hospital.test.cjs`.
- **Meanwhile:** implemented; the slice passes (40 / 40).

## 4. For W3-Crime (wave-3 owner of `js/data/actions/{jail,trip}.js`, `bus.js`, `bus.board`): notes, no change requested now

- The `tourhook` skin (`js/minigames/skins/tourhook.js`) is still a stub: the trip scene runs
  `SR.minigame.run('tourhook')` on arrival and, when it cannot run, resolves with
  `SR.minigame.auto(...)` or a forfeit (`{ beats: [], wins: 0, exited: true }`, the hook's -20 %).
  Its text keys `mg.tourhook.*` belong to `en-transit.js` by the prefix map.
- The jail scene blocks the Pocket while you serve (only the pause menu opens), so the phone's
  lawyer contact (UI §5.9, P1 `police`) is not reachable from the cell; the Jail Day card has the
  Bail row (P1 `police`) instead.

## 5. `js/scenes/results.js` (W2-Front): "Keep playing" after a game that ended in jail goes back to the cell

- **Change:** in `keepPlaying()`, after `SR.rules.endgame.keepPlaying(s)` succeeds, when `s.jail` is
  set go to the cell instead of the city: `SR.scenes.go('jail', { resume: true })` (as
  `js/ui/screens/saveload.js` already does on a load), else the current `SR.world.place('homeDoor')`
  and `go('city')`.
- **Why:** a timed game can end during a jail night (GDD §4.10) with days still to serve. Keep playing
  clears `s.over`, and the current code puts the player on the street at the home door with
  `state.jail` still set (seen in review: `{ daysLeft: 3, served: 2 }` after "Read the Final Edition"
  → Keep playing): the sentence is skipped, Walk out never runs (Heat is not set to 20), and the cell
  only comes back at the next night (the jail's `day:started` listener).
- **Meanwhile:** nothing in W2-Transit's files can see the Keep-playing choice (it emits no event); the
  jail scene takes the player back after the next night.


## 6. `js/ui/components.js` (lead; W1-D's): a detached tooltip must also drop its pending show

- **Change:** in `tooltip(target, content)`, the detach function (and `hideTip(owner)`) should clear a
  tooltip that is still *pending* for that target, not only one already shown: `hideTip(owner)` returns
  early when `owner !== tipOwner`, and `tipOwner` is set only once the tip shows, so a hover or focus
  less than 400 ms before a `button.update()` leaves `tipTimer` running. E.g. keep the pending target
  (`tipPending = target` in `later()`) and in `hideTip(owner)` clear the timer when `owner === tipPending`.
- **Why:** seen in review on the Jail Day card: hover the refused "Walk out", then serve the last day
  (or the day that ends a timed game): the button is updated to "Walk out" (enabled) or "Read the Final
  Edition", its old tooltip is detached, and 400 ms later the old tooltip still shows "Walk out" over it
  (the content closure keeps the old label). Any button whose disabled reason goes away while hovered
  can show the same stale tip.
- **Meanwhile:** `js/scenes/jail.js` calls `SR.ui.tooltip.hide()` (which clears the pending timer) when
  the card's mode changes; `tests/e2e/jail.test.cjs` covers it ("no stale tooltip of the refused Walk out").
