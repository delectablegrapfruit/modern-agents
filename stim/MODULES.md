# stim modules

`app.js` is one IIFE. The core (helpers, state, sound, gestures, notifications, the app framework) sits at the top and the OS layer (You, home widgets, interruptions, scheduler, heartbeat, keyboard, boot) at the bottom. In between, each module owns one marked section:

```
// ==== MODULE feed: ... ====
...
// ==== /MODULE feed ====
```

`styles.css` has a matching block per module: `/* ==== MODULE feed ==== */ … /* ==== /MODULE feed ==== */`.

A module only edits inside its own JS section and its own CSS block. Everything it needs from outside (state, achievements, stats, quests, icons, waiting items, background ticks) is registered from inside the section.

## Bundles

Home-screen apps are bundles of apps (`BUNDLES` in the core). Each bundle has a `nav` mode:

| nav | Looks like | Used by |
| --- | --- | --- |
| `pills` (default for 2+ tabs) | Pill tabs under the header | Casino, Markets, Goals |
| `bottom` | Tab bar at the bottom with icons | Feed, Shop |
| `launcher` | First tab is a home screen; the others open like separate apps, with a splash and a back button | Play |
| `none` | Single app | Inbox, You |

## An app

```js
def({
  id: 'posts',            // unique; also the tab id
  name: 'Home',           // tab label, notification title, splash title
  tag: 'For you',         // header subtitle while this tab is open
  c: '#7b61ff',           // accent color; the app's body gets --c
  art: '<svg …>',         // optional: full icon markup; otherwise G[id] is drawn as a glyph
  badge: () => n,         // red count on the tab and summed on the home icon
  ping: () => 'text' | { text, until, urgent } | null, // a random notification when the scheduler picks this app
  build(body, right) {},  // once, the first time the tab opens. `right` is the header's right side
  open() {}, close() {},  // tab shown / hidden (also on bundle close)
  render() {},            // after open, and whenever you call it
  tick() {},              // every second while this tab is open
  key(e) {},              // desktop keys while open; return true when handled (keyup arrives for Space)
  bg() {},                // every second, open or not
  wait: () => [{ t, due, hot, r, sub, id }], // rows for the home screen's "Waiting for you"
  init() {},              // once at boot, before anything renders
});
```

In `wait()` items, `due` is a timestamp deadline (listed first, with a countdown), `hot` marks something that will expire soon, `r` is right-side text, `sub` replaces the subtitle, and `id` overrides which tab the row opens.

## Registries and state

- `const F = slice('feed', { … })`: this module's persistent state under `S.feed`, merged with defaults. Never edit `DEF`.
- `addAch([[id, name, description, icon, () => test], …])`: achievements shown in You. Call `unlock(id)` for event-based ones.
- `addStats([[label, () => value], …])`: stats shown in You.
- `addQuests([[statKey, 'Do it {n} times', lo, hi], …])`: quest templates, where progress reads `S[statKey]`. Keep the counter a top-level number on `S` (e.g. `S.posts = (S.posts || 0) + 1`).
- `G.myId = '<path …/>'`: the glyph for a new icon (24×24, stroke).

## Core helpers

| Area | Helpers |
| --- | --- |
| DOM and utilities | `$`, `$$`, `html`, `restart`, `R`, `rnd`, `ri`, `pick`, `pickW`, `chance`, `clamp`, `wait`, `now`, `T`, `fmt`, `cd`, `dur`, `ago`, `cap`, `I(name)`, `IF(name)`, `glyph(id)`, `subIcon(id)`, `bundleIcon(B)` |
| Feel | `sfx.*` (tap crit pop card tick click open close ding whoosh fresh big nope clear coin win level combo thunk lever riser swoosh match shake scratch giggle munch beat lose unlock), `haptic(strong)`, `holdTone()`, `noise()` |
| Economy | `earn(n, x, y, { raw })` (hits, times the combo multiplier unless raw), `spend(n)` (returns false if short), `act()` (extends the combo), `mult()` |
| Visuals | `toast(msg)`, `floatText(x, y, text)`, `burst(x, y, opts)`, `confetti(n)`, `centerOf(el)` (phone coordinates), `FW` and `FH` (phone size), `scale`, `framed`, `reduced` |
| Notifications | `notify(appId, text, { until, urgent, silent })` (`{left}` in text shows the time left to `until`), `alertOnce(key, appId, text, gapMs, o)`, `muted(appId)`, `paceK()` |
| Overlays | `sheet(title, el)` (returns close), `modal(innerHTML)` (returns el) |
| Gestures | `drag(el, { axis: 'x' or 'y' or 'any', skip, onStart, onMove(dx, dy), onEnd(dx, dy) })`, `PTR(scroller, asyncRefresh)` (the scroller contains `spinner` then `.ptr-body`), `track(scroller)`, `suppressClick()` |
| Framework | `openApp(id)`, `showTab(B, id)`, `curApp`, `curBundle`, `S`, `save()` |

Mouse users can drag any scroller to scroll it, with fling and scroll-snap. Canvas elements, inputs and `drag()` gestures already opt out. Add `data-nodrag` to anything else that handles its own pointer movement.

## Copy

Write like the real product would: straight-faced, never winking at the user or describing the tactic. The design carries the joke.

## Tests

`window.stim` exposes `S`, `APPS`, `BUNDLES`, `openApp`, `showTab`, `closeApp`, `ping`, `notify`, `curApp` and `curBundle` for Playwright.
