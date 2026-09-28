# Architecture

Plain browser JavaScript, no build step, no dependencies. `index.html` loads classic scripts in
order; everything hangs off one global, `window.SRPG`. Opening `index.html` from disk works.

The stage is the original's 550×400 at 35 ticks per second. The canvas draws the world and art;
menus, buttons, and text are DOM elements in `#ui`, laid out in the same 550×400 coordinate
space (the whole stage is CSS-scaled to fit the window).

```
js/core/namespace.js   SRPG.W/H/FPS, registerScreen, registerLocation, SRPG.rng, SRPG.util
js/core/draw.js        SRPG.draw: canvas helpers (rect, roundRect, circle, line, poly, text, wrap, stick, gradient)
js/core/ui.js          SRPG.ui: DOM widgets in #ui (panel, quote, text, iconButton, button, input, message, confirm, popText)
js/core/sound.js       SRPG.sound: synthesized sound effects and music loops (Web Audio)
js/core/engine.js      SRPG.engine: scenes, fixed 35 Hz tick, input, rendering
js/core/state.js       SRPG.newState(), SRPG.save (single save slot in localStorage)
js/core/game.js        SRPG.game: the current state `s` and shared rules (stats, karma, sleep, rank, end)
js/ui/icons.js         SRPG.icons.draw(ctx, name, size): every button icon, drawn in code
js/world/map.js        SRPG.MAP: city geometry, doors, the walking rules (verbatim from the original)
js/world/mapart.js     SRPG.mapArt: sky and the static city picture
js/world/sprites.js    SRPG.sprites: player, street people, cars (top-down)
js/systems/hud.js      SRPG.hud: HP bar, cash, clock, day, backpack and stats buttons
js/systems/panels.js   SRPG.panels: INVENTORY and STATS panels opened from the map HUD
js/scenes/city.js      'city' screen: walking, traffic, falling, street people
js/scenes/location.js  'location' screen: the generic building menu (see below)
js/scenes/title.js     'title' screen: title, instructions, new game length, create character, load
js/scenes/intro.js     'intro' screen: the opening story
js/scenes/results.js   'death' (YOU DIED) and 'results' (net worth and rank) screens
js/locations/*.js      each building / street dialog, registered with SRPG.registerLocation
js/minigames/*.js      fight, darts, slots, blackjack, roulette screens
js/main.js             boot + SRPG.debug (used by tests)
tests/*.cjs            Playwright checks (node tests/<name>.cjs)
```

## Screens

`SRPG.registerScreen(id, def)`; `SRPG.engine.go(id, params)` switches (the previous screen's
`exit()` runs, `#ui` is cleared, then `enter(params)`). Hooks, all optional:
`enter(params)`, `exit()`, `tick()` (35×/s), `render(ctx)`, `onKey(key, e)`, `onKeyUp(key, e)`,
`onClick(x, y, e)` (canvas/`#ui` background clicks, stage coordinates), `onMouseDown`, `onMouseUp`,
`onMouseMove`. Keys: `ArrowUp`…, `Shift`, `Enter`, `Escape`, `' '`, lower-case letters.
`SRPG.engine.keys[k]` is true while held. `SRPG.engine.frame` counts ticks.

Screen ids used across modules: `title`, `intro`, `city`, `location`, `death`, `results`,
`fight`, `darts`, `slots`, `blackjack`, `roulette`.

## State

`SRPG.game.s` is the whole game (see `state.js` for every field; names follow the original's
variables). Plain JSON; the save is `JSON.stringify(s)`. `s.time` is the hour (8 = 8 AM,
24 = midnight, can't act past 24); `s.day`; `s.cash`; `s.hp`/`s.hpmax`; `s.strength`,
`s.intelligence`, `s.charm` (cap 999); `s.karma` (−100…100, use `SRPG.game.addKarma`);
`s.items.*`; `s.msgs` (answering machine queue).

Shared rules live in `SRPG.game`: `addStat(name, n)` (strength also raises hpmax), `addKarma(n)`,
`heal(n)`, `hurt(n)`, `netWorth()`, `jobTitle()`, `personColor(karma)`, `pushMsg(text)`,
`sleep(mansion)` → summary object, `timeUp()`, `rank()`, `endGame()` → results, `die()` → YOU DIED.

## Locations (buildings and street dialogs)

```js
SRPG.registerLocation({
  id: 'mcsticks',
  hud: 'inside',                 // HUD mode: 'inside' (default) | 'map' | 'fight'
  music: 'inside',               // loop while inside; null = leave the music alone
  overlay: false,                // true: street dialog drawn over the frozen map (NPCs)
  exit: 'mcsticks',              // SRPG.MAP.exitNudge key used by LEAVE (default: id)
  panel: { x: 182, y: 47, w: 355, h: 250 },   // the blue menu panel (default shown)
  background(ctx, s, frame, g) {}, // interior art (full 550×400)
  foreground(ctx, s, frame, g) {}, // optional, drawn after background, before HUD
  onEnter(g) {}, onLeave(g) {}, tick(g) {},
  view(g) {                       // called on every rebuild; return the menu
    return {
      quote: 'Welcome ...',       // or quoteHtml
      body: 'html', bodyY: 44,
      rowTop: 58, rowGap: 48, colX: [5, 190],      // button grid (defaults shown)
      buttons: [{ icon: 'fries', label: 'FRIES <span class="hp">(+20 HP)</span> - $12',
                  col: 0, row: 1, w: 160, disabled: false, id: 'fries', onClick(g) {} }],
      leave: true, leaveAt: { col: 1, row: 3 },
      custom: false,              // true: view() built its own DOM, skip the default panel
    };
  },
});
```

After a button's `onClick`, the menu rebuilds (so labels/disabled states refresh) unless the
handler switched screens or opened a sub-screen. The `g` handle: `g.s`, `g.spend(n)` (false +
error sound if short), `g.canAfford(n)`, `g.error()`, `g.sfx(name)`, `g.pop(text)` (big rising
text + sound), `g.msg(text)`, `g.addKarma(n)`, `g.addStat(name, n)`, `g.heal(n)`,
`g.show({ title, titleColor, quote, body, icon, buttons, ok, panel })` (replace the panel with a
sub-screen), `g.back()`, `g.refresh()`, `g.leave()`, `g.go(screen, params)`, `g.endGame()`, `g.die()`.

Open one with `SRPG.location.open(id)`; minigames return with
`SRPG.location.open(id, { resume: true })` (no fade, no `onEnter`).

Location ids: `store`, `nli`, `bank`, `pawn`, `bar`, `casino`, `mcsticks`, `mansion`, `bus`,
`furniture`, `uofs`, `home` (apartment, dwelling 1–3), `oldapartment` (the apartment once you own
the mansion/castle), street: `smokes`, `hobo`, `dealer`, `parkedcar`.

## UI conventions

- Blue panel: `ui.panel(x, y, w, h, parent)`; quote text: `ui.quote(...)`; free text `ui.text(...)`.
- Menu entries: `ui.iconButton(parent, { icon, label, x, y, w, size, disabled, id }, onClick)`.
  Labels are HTML; red HP numbers use `<span class="hp">`.
- Plain buttons (OK, YES, DEAL, SPIN…): `ui.button(parent, label, onClick, { x, y, w, cls, id })`.
- Modals: `ui.message(text, cb, opts)`, `ui.confirm(text, yes, no, opts)`.
- Every clickable element gets a stable `data-id` (`id` option) so tests can click it.

## Icons

`SRPG.icons.draw(ctx, name, size)` draws into a `size`×`size` square. Names:

```
general   leave ok cancel house money work sleep save messages zzz
store     slushee candybar nachos smokes pills rob
nli       apply promotion janitor mailroom sales executive vicepresident ceo
bank      deposit withdraw loan repay realestate apartment penthouse mansion castle
pawn      alarm knife gun ammo cellphone
bar       beer bottle barfight darts
casino    slots blackjack roulette
mcsticks  milkshake fries burger tripleburger cook
bus       bus
furniture bed tv computer satellite books treadmill freezer minibar
uofs      study class gym
home      tv news stocks campaign fitness dating
street    give10 givebooze givesmokes cocaine hotwire
fight     punch kick fireball energy run
inventory skateboard car
```

## Sounds

`SRPG.sound.play(name)`: click error eat drink work purchase fall carhit crash footstep skate
ansmachine roulette reel handle win ignition punch swoosh fireball energy stat sleep dart cards
chip door breath stamp. `SRPG.sound.music(name | null)`: beginning main inside fight.

## Testing

`tests/harness.cjs` opens the game in headless Chromium over `file://`, pauses the clock and
exposes `newGame(state)`, `open(locationId)`, `step(n)`, `hold(keys, n)`, `clickUI(dataIdOrText)`,
`state()`, `set(patch)`, `uiText()`, `shot(file)`. `SRPG.debug` has the same entry points.
