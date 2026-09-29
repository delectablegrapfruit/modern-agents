# Requests from W2-Pocket (wave 2)

W2-Pocket built the Pocket (BUILD_PLAN §4.12; UI §5.9): the `pocket` overlay and its tabs, the Bag
and Phone actions, the contacts and `en-pocket.js`. Each item: the file, the exact change, why, and
what W2-Pocket does meanwhile (BUILD_PLAN §1.3).

## 1. `tests/e2e/a11y.test.cjs` (W1-Q; the lead in wave 2): no real-Tab walk through the Pocket

- **Change:** in the "menus and the Pocket" loop, audit the Pocket without the Tab walk, for the
  menu itself and for each of its tabs:
  ```js
  const opts = id === 'pocket' ? { tab: false } : undefined;   // the Pocket closes on Tab (D57)
  await check(T, t, 'menu-' + id, '#ui [data-scene="' + id + '"]', opts);
  ...
  await check(T, t, 'menu-' + id + '-tab-' + tabs[k], '#ui [data-scene="' + id + '"]', opts);
  ```
  (Optionally walk its controls with the arrows, `SR.ui.focus.move('down')`, instead.)
- **Why:** UI §6 and CONTRACT §15.5 / D57 (deferred to W2-Pocket in `decisions-w1-desk-lead.md`):
  Tab fires `pocket` everywhere and the Pocket closes on it. The walk presses Tab, the Pocket
  closes on the first press, and the check reports "Tab reached 0 of 14 controls" (and the
  per-tab checks find no Pocket).
- **Meanwhile:** `node tests/e2e/a11y.test.cjs` has that 1 failure (99 of 100 pass).
  `tests/e2e/pocket.test.cjs` runs the same `A.audit` on every tab (names, roles, contrast: clean)
  and drives every tab by arrows and Enter, Q / E, the pad and touch.

## 2. `js/ui/dialog.js` (W1-D; the lead in wave 2): open the Pocket over a street dialog by key and pad

- **Change:** in the `dialog` scene's `onAction`, after `SR.ui.focus.handle`:
  ```js
  if (!(ev && ev.repeat) && SR.reg.scene.pocket && (action === 'bag' || action === 'map' || action === 'journal' ||
      (action === 'pocket' && !(ev && ev.code === 'Tab')))) {
    SR.scenes.push('pocket', action === 'pocket' ? {} : { tab: action });
    return;
  }
  ```
  Optional, additive: `SR.ui.dialog.current()` → the top dialog's params (`{ id, person, ... }`).
- **Why:** GDD §6.4 / UI §5.7: the Bag's Give works while a street dialog is open and runs the same
  action as the dialog's row. Today the sheet ignores `bag` / `pocket`, so only the HUD's Pocket
  button (mouse, touch) reaches the Bag from a dialog; a keyboard or pad player cannot.
- **Meanwhile:** the HUD button opens the Pocket over the dialog (on the Bag); the Pocket finds the
  person from `SR.world.streetnpcs.talking` (W2-Street), else the sheet's portrait `data-person` or
  its `street-<npc>` id, and reads `SR.ui.dialog.current` when it exists.

## 3. `js/scenes/city.js` (W2-City): Tab that opens the Pocket keeps its browser default

- **Change:** `case 'pocket': if (ev && ev.code === 'Tab' && ev.preventDefault) ev.preventDefault(); openOverlay('pocket'); return;`
- **Why:** SR.input keeps Tab's browser default (D33), so after the city opens the Pocket on Tab
  the same key press moves focus one control on inside the notebook that just opened (focus lands
  on the Map tab instead of the open tab).
- **Meanwhile:** the Pocket puts focus back on its open tab once that press is over (`setTimeout`
  0, only if focus is still on another rail tab).
- **Status:** applied by W2-City in the wave (`js/scenes/city.js`, `case 'pocket'`); the Pocket's
  guard stays as a no-op safety net for any other scene that opens it on Tab.

## 4. Observation for W2-Front (`js/ui/screens/pause.js`) and the lead (`js/ui/card.js`): Esc is `back` then `pause`

- **What:** one Esc press fires `back` and then `pause` (tests/e2e/input.test.cjs). An overlay that
  pops itself on `back` hands that press's `pause` to the scene below, and the city opens the
  pause menu. Seen: in the pause menu Esc closes it and the city reopens it (the stack stays
  `city, pause`); `tests/e2e/card.test.cjs` "Esc with no sub-screen leaves for the city" now ends
  on `['city', 'pause']` since the pause menu landed.
- **Suggested change:** close on `back` at the end of the press when its key is also bound to
  `pause` (`Promise.resolve().then(close)`), and swallow `pause` whose `ev.code` is a `back`
  binding meanwhile. That is what `js/ui/pocket/pocket.js` does (`backClose`), tested in
  `tests/e2e/pocket.test.cjs` ("Esc closes it, and its `pause` does not reach the city").
- **Meanwhile:** nothing on W2-Pocket's side.

## 5. `js/rules/state.js` / `js/rules/act.js` (W2-RulesE): `records.meals`

- **Change:** add `records.meals: 0` to `defaults()` (additive, deep-filled; v1 stays) and count
  each `eat` rule event a Result carries (`+1` per event, in the pipeline or the food fns).
- **Why:** the Journal's First Day list (UI §9, P0) ticks "Eat something" on day 1. The other four
  lines read the state (a read message, `job.totalShifts`, `daily.uofsKarma`, the day); eating
  leaves no trace, so a reload on day 1 forgets it.
- **Meanwhile:** the Journal listens to the `eat` rule event for the session and reads
  `records.meals > 0` when it exists.

## 6. `css/components.css` (W1-D; the lead in wave 2): the Pocket's classes

- **Change:** add the classes the Pocket's elements already carry, with the values its inline
  styles hold today: `.pocket-root { z-index: var(--z-overlay) }` (CONTRACT §11.2's overlay rule),
  `.pocket` (the notebook: absolute, `display: grid`, `--line`, `--r-l`, `--e-3`, `--paper-1`),
  `.pocket-rail` (`--paper-2`, the right `--line`), `.pocket-tab` (a vertical `.tab`: left border
  4 px, selected `--primary-600` and `--paper-1`), `.pocket-page` (`scroll-y`), `.bag-tile`
  (64 × 64, `--line`, `--r-m`, `--e-1`; selected 3 px `--primary-600` on `--primary-100`),
  `.bag-detail`, `.phone` (the `--ink-900` bezel, radius 28 px).
- **Why:** UI.md keeps component styles in the stylesheet; W2-Pocket cannot edit `css/`.
- **Meanwhile:** inline styles that use only `var(--…)` tokens (no colour literals); once the
  classes land the lead (or W4-Visual) drops the inline copies.

## 7. `docs/CONTRACT.md` §8.9, §10, §11.3, §15.4 and ARCHITECTURE §6.11, §7 (lead): record the additive names

Nothing frozen changes.

- **The `pocket` scene** (overlay, `blocksUpdate`): params `{ tab, params }` (`tab`: `journal`,
  `map`, `stats`, `bag`, `messages`, `phone` (P1 `phone`), `achievements` (P1 `achievements`);
  `params`: the tab's own, e.g. `{ item }` for the Bag, `{ place }` for the Map, `{ topic }` for the
  Journal's Help). Opened over a street dialog it opens on the Bag.
- **`SR.ui.pocket`** (`js/ui/pocket/pocket.js`): `panel(id, def)` (the tab files register their
  panels from a prio-50 boot hook), `tabs()`, `open(tab, params)`, `close()`, `select(tab,
  params)`, `isOpen()`, `current()` → `{ tab, tabs }`, `refresh()`, `act(id, params, originEl)`
  (SR.act + `SR.ui.card.feedback`; a Result with `open`, `down`, `jailed` or `over` closes the
  Pocket first), `preview`, `talk()` → `{ npc, name, actions }` (the street dialog under the
  Pocket), `panelDef(id)`, `waypoint({ id, x, y, name, door })`, `debug()`.
- **Actions** (`js/data/actions/bag.js`): `bag.smoke` (P0), `bag.eatTakeout` (P1 `shopsPlus`;
  `params.value` picks the meal), `bag.pillToggle` (P0; `params.on`); named fns `bag.min`,
  `bag.hp`, `bag.karma`, `bag.takeoutHp`, `bag.takeoutEaten`, `bag.pillNote`. **No `bag.give`
  def:** the Bag's Give runs the person's own gift action (`person.gifts[item]`, W2-Street's
  `SR.world.streetnpcs.giveAction`), the one the dialog row runs (GDD §6.4 "the same actions as
  the dialog's rows"); ARCHITECTURE §19's line for `bag.js` should drop `bag.give` / `bag.info`
  (Info is the Bag's detail pane) and name the toggle `bag.pillToggle` (GDD §6.4's name; §19 says
  `bag.usePill toggle`).
- **Actions** (`js/data/actions/phone.js`, all P1): `phone.summon` (`{ car, x, y, a }`, the UI
  finds the nearest road lane), `phone.stocks` (screen `home.stocks`, needs the Workstation),
  `phone.bail`, `phone.lawyer`, `phone.realty` (screen `bank.realestate`), `phone.red`,
  `phone.mcholland`, `phone.buyer1`-`5`, `phone.hospital`, `phone.board`; named fns `phone.min`,
  `phone.hasCar`, `phone.summon`, `phone.redKnown`, `phone.redInfo`, `phone.buyerKnown`,
  `phone.buyerName`, `phone.buyerInfo`, `phone.boardInfo` (its day is W2-RulesC's
  `SR.rules.election.acceptBy`: W2-RulesC's request 5 to W2-Pocket, applied), `phone.fare` (the cab
  fare as a contact's role vars). The Cab app and the map card's "Call a cab" use W2-City's
  `SR.world.cab(door)` (`world.cab`). **No `phone.save` def** (ARCHITECTURE §19 lists one): the
  phone's Save app, like Settings, is a UI hand-off that pushes W2-Front's `saveload` scene
  (`{ mode: 'save' }`; hidden on Hardcore), so §19's line for `phone.js` should drop `phone.save`.
- **A DOM convention inside the Pocket's page:** an element marked `data-no-swipe` (the Map's
  canvas) keeps its own finger gestures; a sideways drag that starts on it does not turn the tab.
- **Contacts** (`SR.def.contact`): `lawyer`, `realty`, `cabs`, `red`, `mcholland`, `buyer1`-`5`,
  `hospital`, `board`, with the fields of ARCHITECTURE §7 plus `role` (a text key), `icon`, `app`
  (`'cab'`: the call opens that app), `waypoint` (a worldmap `spots` id the call pins),
  `nameVars` and `roleVars` (`[fnName, ...args]`: the name's or the role's vars, a buyer's city,
  the cab fare).
- **Text keys** (`en-pocket.js`): `pocket.*`, `act.bag.*`, `desc.bag.*`, `toast.bag.*`,
  `act.phone.*`, `desc.phone.*`, `toast.phone.*`, `contact.*` (the validator's prefix map already
  gives all of them to `en-pocket.js`).
