# Requests from W1-D (Design system and UI framework), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-4 are for the lead (CONTRACT, ARCHITECTURE, UI.md, GDD); 5 is for W1-S;
6 for W1-A; 7 for W2-Home through the lead; 8 answers W1-R's request 10. Requests addressed to
W1-D by other packages were applied in W1-D's files (listed at the end).

## 1. `docs/CONTRACT.md` §15 (lead): the rest of `SR.ui`

- **File:** `docs/CONTRACT.md` §15, the `SR.ui` row (and ARCHITECTURE §7.1 for the host).
- **Change:** record these additive names (all in W1-D's files; none collides with a frozen one):
  - **Conventions.** Every component is a factory taking one options object and returning its
    root element; `id` becomes `data-id`; focusable parts carry `data-nav`; stateful components
    expose `el.update(partialOpts)` (and `el.value` for inputs). Chips carry `data-chip="<kind>"`.
  - `SR.ui.dom` (`js/ui/dom.js`): `h(tag, attrs, ...children)`, `svg`, `clear`, `on`, `t(keyOrText,
    vars)`, `setting(key)`, `token(name)` (a CSS custom property for canvas drawing, following the
    high-contrast and colour-blind swaps), `paint(paletteKey)`, `reduced()`, `fast()`, `uiRoot()`,
    `layer(name)`, `announce(text)` (#aria), `sfx(name, opts)` (guarded), `haptic(ms)`,
    `icon(name, size)` (an `<img>` from `SR.art.iconURL`, or a placeholder square), `now()`,
    `frame(el)`, `logicalRect(el)`, `refuse(el, reason)` (error sound + 120 ms shake + #aria),
    `applySettings()`, `invalidateTokens()`.
  - Components (`js/ui/components.js`) besides the frozen list: `iconButton`, `swipe(target, onLeft,
    onRight)`, `STATS`, `chip.gains(preview)`, `chip.costs(preview, { state, def })`,
    `chip.fromDelta(delta)`, `chip.text(opts)`, `karmaMedallion.band(k)`, `karmaMedallion.tier(k)`,
    `keyHint.glyph(code)`, `keyHint.refreshAll()`, `tooltip(target, content)` → detach,
    `tooltip.hide()`.
  - `SR.ui.focus` (`js/ui/focus.js`): `push(root, { id, initial, restore, autofocus })` → scope,
    `pop(scope)`, `current()`, `focused()`, `first()`, `focus(el)`, `move(dir)`, `tab(back)`,
    **`handle(action, ev)` → consumed**, `activate(el)`, `navigables(root)`, `setHandler(el, fn)`,
    `isTextTarget(el)`, `depth()`.
  - `SR.ui.toast(opts)` (`{ key, vars, text, kind, icon, chips, id, static, duration }`) with
    `.list()`, `.clear()`, `.caption({ key, dir })`; `SR.ui.stamp(opts)` (`{ key, vars, text, kind,
    size, stat, static }`) with `.busy({ ignoreStat })`, `.skip()`, `.swallow()`, `.clear()`,
    `.current()`; `SR.ui.modal(opts)` (a box) with `.open(opts)` → `Promise<actionId|null>` and
    `SR.ui.confirm({ title, text, vars, yes, no, danger })` → `Promise<boolean>` (both through the
    `confirm` overlay).
  - `SR.ui.hud`: besides `mount(root, { compact, minimal })`, `unmount`, `compact(bool)`,
    `flush()`: `ghost(preview | null)` (UI.md §1.1 ghost deltas), `minimal(bool)`,
    `target(kind, key)` (where a flying chip lands), `pulse(kind, key)`, `invalidate()`, `el()`.
  - `SR.ui.card(opts)` is also the Card component (`{ id, title, brand, portrait, greeting,
    greetingVars, voice, onLeave, readout }` → element with `body`, `setGreeting`, `setReadout`,
    `leave`); besides `open / refresh / push / pop / replace`: `feedback(result, originEl, opts)`
    (UI.md §4.3 for any host), `rows()` and `debug()` (`SR.debug.ui()` calls it), `current()`,
    `screens()`, `repeating()`, `stopRepeat()`, `leave()`, and the scene hooks `mount(root,
    sceneParams, hooks)`, `unmount()`, `onAction(action, ev)`, `update(dt)`.
  - `SR.ui.subhost.create(root, { onClose, onOpen, building, host, rootLabel, feedback, focusScope })`
    → `{ push(id, params) → Promise<popResult>, pop(result), replace, close, refresh, back() →
    handled, onAction(action, ev) → consumed, top(), depth(), ids(), destroy(), el }`. `ctx` adds
    `refresh()`; `ctx.state` is a read-only Proxy view (a write throws a TypeError).
  - `SR.ui.dialog.open(opts)` (`{ id, person, portrait, name, text, vars, mood, voice, cancel,
    choices: [{ id, label, vars, action, params, chips, chance, disabled, reason, variant, number:
    { min, max, step, label, value, money, quick } }] }`): `action` is previewed for the choice's
    chips and enabled state, the caller runs it; `cancel` names the choice Esc returns (default
    `'leave'` when offered; `false`: Esc does nothing). Also `dialog.refresh()`, `dialog.isOpen()`.
  - `SR.ui.building.info()` (tests: `{ id, interior, floats, ownerPose }`).
- **Why:** wave-2 packages (Pocket, Front, Home, Money, Street ...) build every screen from these;
  they need written names. CONTRACT §15 lists only the component names.
- **Meanwhile:** documented in the header and JSDoc of each W1-D file; the contact sheet
  `tests/sheets/components.html` shows every component and state.

## 2. ARCHITECTURE §11 and UI.md §6 (lead): the UI input rule, as built

- **File:** `docs/ARCHITECTURE.md` §11, `docs/UI.md` §6.
- **Change:** add: "DOM UI takes its input from `SR.input` actions: a scene's `onAction` offers each
  action to `SR.ui.focus.handle(action, ev)` first (arrows move focus inside the current focus scope
  or are consumed by the focused control; `confirm` activates the focused control), then handles
  what is left (`back`, `rowN`, `repeat`, `tabPrev` / `tabNext` ...). UI scenes ignore `interact`
  (E, Enter, Space and A also fire `confirm`). While `SR.input` is live, `js/ui/focus.js`
  suppresses the browser's own Enter / Space activation of focused controls, so a key activates
  once; Tab / Shift+Tab move focus in DOM order and wrap inside the scope. A stamp consumes
  (`ev.consumed`) every action of the press that skips it."
- **Why:** W2 screens (Pocket, Pause, Settings, Save / Load, Title) must follow the same rule or a key
  activates twice or not at all. `js/core/input.js`'s header already describes W1-D's half.
- **Meanwhile:** the `building`, `dialog` and `confirm` scenes follow it; the contact sheet's
  `test.gallery` scene shows the minimal pattern.

## 3. UI.md §2.1 (lead): the tokens W1-D added

- **File:** `docs/UI.md` §2.1 (and ART_AUDIO §2 for `SR.art.palette.ui`, W1-A).
- **Change:** list the additions of `css/tokens.css`: `--white`, `--gold` (achievement toast edge),
  `--newsprint` (#F4F0E6, ART_AUDIO §11), `--grain-opacity` (1: `--grain` from `js/art/paper.js` is
  already the 4 % grain; 0 in high contrast), `--stamp-alpha` (.85), `--focus-ring`,
  `--focus-ring-inset`, the karma bands `--karma-good-0..9` / `--karma-evil-0..9` (B-04c), and the
  three colour-blind tables (`:root[data-cb="protan"|"deutan"|"tritan"]`, Okabe-Ito hues, each
  `-ink` ≥ 4.5:1 on its `-100`, asserted by `tests/node/tokens.test.cjs`). The accessibility root
  classes are `html.hc`, `html.rm`, `html.fr`, `html[data-cb]`, `html[data-device]`, and `--ui-scale`
  on `:root` (set by `js/ui/dom.js` from `SR.settings`).
- **Why:** the colour-blind tables and the karma bands are needed in the DOM (the medallion is CSS,
  and the colour-blind modes remap it); the rest are values UI.md uses without naming.
- **Meanwhile:** as shipped. `SR.art.palette.ui` already mirrors the §2.1 names (42 compared, equal).

## 4. GDD §4.4, UI.md §1.3 and ARCHITECTURE §11 (lead): hold-to-repeat and stat stamps

- **File:** `docs/GDD.md` §4.4, `docs/UI.md` §1.3, `docs/ARCHITECTURE.md` §11.
- **Change:** "a repeat stops at any modal, dialog, minigame or stamp, **except a stat-gain stamp**:
  during a hold the first run's stat stamp shows and later ones are coalesced (float texts and the
  flying chips still show every gain)".
- **Why:** answers W1-R's request 10. UI.md §4.3 stamps every stat gain ≥ 2 and GDD §4.4 stops a
  repeat at any stamp, so holding Enter on Study or a class would stop after one run, which defeats
  the repeat for training (GDD lists training among the repeatable actions).
- **Meanwhile:** built that way (`SR.ui.stamp.busy({ ignoreStat: true })` in the card's repeat
  check; `tests/e2e/card.test.cjs` "the repeat goes on through the stat stamp"). Promotion, degree
  and rank stamps still stop a repeat.

## 5. `js/audio/sfx.js` (W1-S): the UI sound names

- **File:** `js/audio/sfx.js` (W1-S).
- **Change:** register (or tell W1-D the names chosen for) ART_AUDIO §13.5's UI sounds under these
  names, which the UI plays: `click` (buttons, tabs, steppers), `open` / `close` (sub-screens,
  modals, dialogs, leaving), `confirm` (modal Yes, a Result without its own sfx), `error` (a refusal),
  `toggle` (Toggle, Segmented), `blip` (typewriter voice blips; played with `pitch`), `purchase` (a
  Result that spent cash and named no sfx), `ticktock` (the ClockRing sweep); and the stinger
  `stingers.stamp` (the Stamp's thud; falls back to `confirm`).
- **Why:** `SR.ui.dom.sfx` plays only registered names (a missing recipe is silent, never an error).
- **Meanwhile:** silent until the recipes exist.

## 6. `js/art/interiors/kit.js` (W1-A): what the building scene passes to an interior

- **File:** `js/art/interiors/kit.js` (W1-A) and ARCHITECTURE §9.2 (lead).
- **Change:** accept `SR.art.interior(id, doorParams)` (the scene passes the door resolver's params,
  e.g. `{ homeId, mode }`, so the home interior can draw the tier and mode), and document the
  `actors` argument of `drawAnim(ctx, t, state, actors)` as `{ owner: { id, pose }, you: { pose } }`
  with poses `idle | happy | shock | work` (react-happy on a purchase, react-shock on a crime,
  work while you work; UI.md §5.6).
- **Why:** UI.md §5.6's proprietor animations and the home door modes need both.
- **Meanwhile:** the building scene draws a paper placeholder diorama (tokens, the live-sky window
  through `SR.render.sky.drawWindow`, `SR.art.stick` figures) while `SR.art.interior` or the
  building's interior is missing; the extra argument is harmless to a factory that ignores it.

## 7. W2-Home (through the lead): home door modes and greetings in the card

- **File:** ARCHITECTURE §7 `building` row and §8.4 (lead), for `js/data/buildings/home.js` (W2-Home).
- **Change:** record how the card reads them: `building.modes` is `{ live: [actionIds], owned:
  [actionIds], forSale: [actionIds] }` (or `{ mode: { actions: [...] } }`); when the scene's
  `params.mode` names one, the card shows exactly those actions in that order, else every action with
  `building: <id>`. Scene params are merged into every preview and act (`{ homeId, mode, variant }`).
  Greetings: a named fn `greet.<buildingId>` (`SR.def.fn`, pure, `(s, params, ctx)` → `{ key, vars }`
  or a key) chooses the greeting "by first visit, time, karma, weather, job" (UI.md §5.6); without
  it the card picks one of `building.greetings[]` (text keys), else `greet.<id>` if registered.
- **Why:** so W2-Home and the other building owners write data the card already understands.
- **Meanwhile:** implemented in `js/ui/card.js` (`cardActions`, `pickGreeting`).

## 8. Answer to W1-R request 10 (stat stamps and hold-to-repeat)

- See item 4: the card coalesces stat stamps during a hold and de-duplicates its own derived stat
  stamp against the rules' `stamp.stats.<stat>` (same text), so a stat gain stamps once.

## Requests to W1-D applied in W1-D's files

- **W1-K-M1 #1:** `ui.pad.connected` and `ui.pad.disconnected` added to `js/data/text/en-ui.js`.
- **W1-M #6:** `js/ui/card.js` `runHustle` reads `{ skin, step }` (from the named fn or
  `SR.rules.jobs.hustleSkin(s, track)`) and runs `SR.minigame.run(skin, { skin, step, auto, ...params })`.
- **CONTRACT D16 (W1-M's and W1-K's keys):** `mg.frame.*` (the frame, Duel, Shift Rush and Timing
  Ring strings the engines reference today, with their variables), `ui.stage.turn`,
  `ui.stage.playAnyway`, `ui.save.codeTitle`, `ui.save.copyHint`, the six `cap.*` captions. W1-M may
  want to reword some `mg.frame.duel.*` / `sr.*` / `tr.*` lines (W2-Front owns the file in wave 2).
