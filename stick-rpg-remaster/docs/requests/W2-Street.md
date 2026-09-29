# Requests from W2-Street (the street cast)

W2-Street built Homeless Harold, Skid the smokes kid, Red the dealer, the junker on the apartment
lawn, their dialogs and schedules, the hotwire skin and the day-1 job offer (BUILD_PLAN §4.10).
Each item: the file and its owner, the exact change, why, and the workaround used meanwhile.

## 1. `js/scenes/city.js` (W2-City): show the street people's barks

- **Change:** in `barks()`, draw a person's bark the way a pedestrian's is drawn, not only the
  hop's "Hey!":
  ```js
  for (var k = 0; k < people.length; k++) {
    var e = people[k];
    if (!e || e.visible === false) continue;
    if (e.bark === 'toast.world.hey' && e.hopUntil && now < e.hopUntil + BARK_AFTER_HOP) U.tag(e.x, e.y, txt(e.bark));
    else if (e.bark && e.barkT > 0) U.tag(e.x, e.y, txt(e.bark));
  }
  ```
- **Why:** a person def has `barks` (CONTRACT §3.1, ARCHITECTURE §7). `js/world/streetnpcs.js` sets
  `e.bark` (a `bark.<npc>.<n>` key, ≤ 60 characters) and `e.barkT` (3 s) when you walk within 180 u
  of Harold, Skid or Red, at most every 25 s. It uses the same fields the pedestrians use.
- **Meanwhile:** the fields are set and tested (`tests/e2e/street.test.cjs`), but nothing shows them.

## 2. `js/scenes/city.js` (W2-City) or W3: the player's parked cars (a note, no change asked)

- W2-Street draws the junker whenever it stands parked (owned or not, not towed, not driven). It is
  an `SR.render.actors` car source, `'street.junker'`, created in a priority-50 boot hook
  (`SR.world.streetnpcs.parkedJunker()`). Before this, nothing drew a parked player car. The unowned
  car on the lawn is W2-Street's, and a hotwired car must not vanish once it is yours.
- The sports car (the day-365 gift, P1 catalogue) has no parked sprite yet. If W2-City draws the
  player's parked cars in general, drop the junker from that source
  (`SR.render.actors.source('street.junker', null)`), so it is not drawn twice.

## 3. `docs/CONTRACT.md` §7 and `tools/validate.cjs` `textOwner` (lead): the `person.*` names

- **Change:** add a row `person.*` (the names of `data/people.js`) → `en-street.js` (W2-Street; W3-Life
  in wave 3), and `else if (a === 'person') f = 'en-street';` in `textOwner`.
- **Why:** `js/scenes/city.js`, `js/ui/dialog.js` and the answering machine
  (`js/ui/subscreens/messages.js`) read a person's `name` key and fall back to `person.<id>`. The
  prefix is in use, but no owner is recorded for it, so a missing name key has no owner to report.
- **Meanwhile:** `person.harold`, `person.kid`, `person.dealer` are in `en-street.js`. The validator
  accepts keys that have no owner.

## 4. `tests/e2e/home.test.cjs` (W2-Home): a new game starts with Mel's voicemail

- **Change:** in the section "messages: the inbox, the reader, the archive, the 150 cap", empty the
  inbox before adding the three test messages (`await put({ msgs: [] })` after `fresh()`), or expect
  `'Inbox (3)'` instead of `'Inbox (2)'`.
- **Why:** BUILD_PLAN §4.10 has W2-Street queue the day-1 job offer (UI §9 step 1: "inside the
  apartment, the answering machine blinks"). A new game now has W2-Food's `vm.mel.job`, from `mel`,
  unread, on day 1. `js/world/streetnpcs.js` runs the silent action `street.jobOffer` on
  `save:loaded` for a day-1 state that has neither the message nor `flags.jobOffer`. So the section
  starts with 4 messages, not 3.
- **Meanwhile:** nothing on W2-Street's side. This is the only assertion in the tree that counts the
  inbox of a new game (checked with `grep msgs tests/e2e`).

## 5. W2-Front (the new-game wizard) and W2-Pocket (the Bag's Give): notes, no change asked

- **W2-Front:** start a game through `SR.save.load(state)`, as `SR.debug.newGame` does, so that
  `save:loaded` queues Mel's offer. A flow that makes a game live another way can call
  `SR.world.streetnpcs.jobOffer()`. The action is idempotent: `requires: [['notFlag', 'jobOffer']]`.
- **W2-Pocket:** while a street dialog is open, `SR.world.streetnpcs.talking` holds the person's id.
  `SR.world.streetnpcs.giveAction(item)` returns the action the dialog's own row runs:
  - `cash` → `street.harold.give10`
  - `booze` → `street.harold.giveBottle`
  - `smokes` → `street.kid.givePack`
  
  These come from `gifts` in the person defs of `data/people.js`. Run the returned action with
  `SR.act`. The open sheet re-reads its rows on that action's `action:done`
  (`SR.ui.dialog.refresh()`). The $10 row's label `act.harold.give10` reads "Give {money}", so pass
  `{ money: SR.text.money(preview.cost.cash) }` as its vars, as the dialog does.

## 6. `docs/CONTRACT.md` §3.1 / §15.1 (lead): the additive names W2-Street exposes

Nothing frozen changes. Record:

- **`SR.world.streetnpcs`** (`js/world/streetnpcs.js`):
  - Fields: `people` (the live array), `talking`, `t`, `stats { judged, barks, talks, acts }`.
  - Functions: `update(dt)`; `talk(id, entity)` → Promise, resolved when the conversation ends, or
    `false`; `judge(snap)` → the list; `reset()`; `get(id)`; `placeOf(id, s?)` →
    `{ place, x, y, path } | null`; `giveAction(item, id?)`; `parkedJunker()`; `jobOffer()`.
  - Entity fields: `id, named, x, y, px, py, facing, state, look, clip, visible, active, talk, place,
    home, path, idle, bark, barkT, hopT, hopUntil`.
- **Person def fields** beyond CONTRACT §3.1: `portrait`, `idle` (`sit | stand | pace`; `pace`
  walks the worldmap `people` path of the same spot), `facing` (degrees), `gifts` ({ item: action
  id }), `p`. Schedule rows are `[weekdays, from, to, placeId, cond?]`:
  - weekdays: `'all'`, or a list of names or indices.
  - from / to: `from ≤ now < to`, where `to` 1440 includes 24:00 and a window with `from > to`
    wraps past midnight.
  - placeId: a worldmap `spots` name, or a building id (meaning inside that building).
  - The first row that holds places the person.
- **Actions** (`js/data/buildings/street.js`):
  - Harold: `street.harold.give10`, `street.harold.giveBottle`.
  - Skid: `street.kid.givePack`.
  - Red: `street.dealer.buy` (`{ n }`; it has a `number` field for the Dialog's NumberField, the
    convention W2-City's fallback sheet reads).
  - The junker: `street.junker.hotwire`; P1 `arcs`: `street.junker.ring` and
    `street.junker.ring:resolve`.
  - `street.<harold|kid|dealer|junker>.talk` (silent, free: the `talk` rule event).
  - `street.jobOffer` (silent, free, once).
  - Street actions name their B-26 row in a `tune` field (`'harold.give10'` →
    `SR.tuning.street.harold.give10`).
- **Named fns:**
  - Costs and amounts: `street.cash`, `street.min`, `street.karma`, `street.bottles`,
    `dealer.cash`, `dealer.karma`.
  - Conditions: `street.here`, `junker.owned`, `junker.ringInstead`, `kid.coughing`, and
    `junker.ringHp` (a number).
  - Effects: `street.gift`, `street.pack`, `dealer.bought`, `junker.hotwire`, `junker.ringStart`,
    `junker.ringResolve`.
  - Greetings: `greet.harold`, `greet.kid`, `greet.dealer`, `greet.junker`.
- **State written** (additive, deep-fill safe):
  - `npc.harold.gave10` / `bottles` and `npc.kid.packs` / `dead` / `stage: 'dead'`.
  - `npc.kid.diedDay`: the day of the tenth pack, for McHolland's P1 walk "within 3 days of the
    kid's death".
  - `npc.dealer.bought`.
  - `player.cars.junker.owned`.
  - `flags.jobOffer`, and `flags.junkerRing`: the ring attempt in progress, so its `:resolve` pays
    once.
- **Why:** so that W2-Pocket (Give), W3-Life (the arcs; the P1 schedule rows), W3-Crime (McHolland)
  and W3-Prog (the *Hot Wheels* achievement) can build on these names.
- **Meanwhile:** implemented as listed.
