# W2-Civic requests (wave 2)

Package W2-Civic: the University of Stick and City Hall's Election Office (BUILD_PLAN §4.7).
Files: `js/data/buildings/{uofs,cityhall}.js`, `js/art/interiors/{uofs,cityhall}.js`,
`js/ui/subscreens/{transcript,campaign}.js`, `js/minigames/skins/debate.js`,
`js/data/text/en-civic.js`, `tests/e2e/{uofs,election}.test.cjs`, `tests/node/civic.test.cjs`.

## 1. `js/ui/card.js` (lead): skip actions marked `row: false`

- **File:** `js/ui/card.js`, `cardActions()` (the building-card row list); records in CONTRACT §8.2
  (action fields) and ARCHITECTURE §6.3.
- **Exact change:** in the filter of `cardActions()` that keeps `a.building === C.id &&
  !/:resolve$/.test(a.id)`, also drop `a.row === false`:
  `return a.building === C.id && !/:resolve$/.test(a.id) && a.row !== false;`
  and add to the action-field table: "`row` | `false`: never a card row; the action is committed
  from a sub-screen (`ctx.act`), which presents it (optional; default: a row)".
- **Why:** the campaign actions (`cityhall.rally`, `tvAd`, `doorKnock`, `kissBabies`,
  `intimidate`, `bribe`, `debate`) and `cityhall.accept` belong to the Election Office sub-screen
  (UI §5.6 "Campaign HQ": the poll Meter, "used 1 / 2 today", the halved repeat). They must be
  actions of the building `cityhall` (the validator requires a registered building owner, and
  `election.campaign` reads the campaign action from the id's last segment), so today the card
  lists them as rows too, where the poll change (not a Delta kind) cannot be shown. W2-Money's
  commit actions behind its bank sub-screens have the same need.
- **Workaround meanwhile:** the rows carry `row: false` already (the card ignores the unknown
  field); `hidden` keeps them off the card except during a campaign (`cityhall.offCampaign`,
  `cityhall.offDebate`), and `cityhall.accept` hides without a `chest` param (`cityhall.noChest`),
  so it is never a card row. During a campaign the City Hall card therefore shows the campaign rows
  as well; they work, without the poll chip.

## 2. W2-Music: the `dictator` variant of `hail_to_the_stick`

- **File:** `js/audio/songs/hail_to_the_stick.js` (W2-Music).
- **Exact change:** name the B♭-minor arrangement of ART_AUDIO §13.4 ("Dictator: B♭ minor") the
  variant `dictator` (`variants: { dictator: { ... } }`).
- **Why:** `cityhall.campaign` plays `SR.audio.music('hail_to_the_stick', { fade: 0.6, variant:
  'dictator' })` while a Dictator campaigns or holds office (the President gets the base song), and
  so does City Hall itself in office. The `debate` skin has no song of its own (review: the frame
  ducks the march below it, as ART_AUDIO §13.4 has minigames do, so the variant carries through).
- **Workaround meanwhile:** an unknown variant plays the base song (the tracker falls back), so
  nothing breaks; until the song lands the validator warns (stub) and the audio engine is silent.

## 3. Records for CONTRACT (lead; no change to a frozen name)

- Named fns added by W2-Civic (CONTRACT §8.5): `uofs.cash`, `uofs.min`, `uofs.hp` (the U of S
  rows' costs, read from `tuning.training` by the action id; graduation takes
  `degree.ceremonyMin`), `uofs.invited` (a seminar's stat and class requirement, for `hidden`),
  `greet.uofs`, `greet.cityhall` (the card's greeting fns of CONTRACT §15.4),
  `cityhall.offCampaign(path)`, `cityhall.offDebate`, `cityhall.noChest` (hidden-conditions).
- The `debate` skin's params fn adds `opponent { name, portrait }`, `situations` (three of
  `mg.debate.q.1..9`, chosen by `SR.util.hash(seed, 'debate', runs)`) and `subtitle` to
  `SR.rules.election.debateParams`.
- The `cityhall.campaign` def carries two test hooks (read through `SR.reg.subscreen`, no public
  name): `diary()` (this session's campaign news) and `outcomes(actionId)` (a row's poll change).

## 4. `js/ui/components.js` (lead): name a list item's chip by its item def (review)

- **File:** `js/ui/components.js`, `itemName(key)` (used by `chip()` for `kind: 'item'`).
- **Exact change:** when `SR.reg.item[key]` is missing, look for the item def whose `key` field is
  `key` (`js/data/items.js`: `item('diploma', { key: 'diplomas', ... })`) and use its `name` (and
  `chipIcon` its `icon`).
- **Why:** graduation (`training.graduate`) adds to the state list `items.diplomas`, so the
  preview's gain is `{ kind: 'item', key: 'diplomas' }` and the card's "Graduate in …" rows read
  "+1 diplomas" with a placeholder icon instead of "+1 Diploma".
- **Workaround meanwhile:** the transcript's Graduate rows map the gain to the item id before
  building their chips (`js/ui/subscreens/transcript.js`, `namedGains`); the card rows keep the raw
  key until this lands.

## 5. `js/scenes/building.js` and `js/scenes/minigame.js` (lead): a building's song by the state (review)

- **File:** `js/scenes/building.js` (`enter`: `SR.audio.music(def.music, …)`) and
  `js/scenes/minigame.js` (`musicBelow()`).
- **Exact change:** when the named fn `music.<building>` exists, play its result `{ id, variant }`
  (or a song id) instead of `def.music`, in both places.
- **Why:** ART_AUDIO §13.4 plays `hail_to_the_stick` in "City Hall in office" and `campus_canon`
  in the lobby otherwise; a building def names one static song.
- **Workaround meanwhile:** `js/ui/subscreens/campaign.js` listens to `door:entered` for
  `cityhall` and asks for the march in office (the scene has just asked for `campus_canon`, so the
  march replaces it on the next bar line), and keeps it when the Election Office closes in office.

## 6. `js/ui/card.js` (lead): re-pick a greeting fn's line after an action (review)

- **File:** `js/ui/card.js` (`pickGreeting` runs once, in `mount`).
- **Exact change:** after each committed action (the card's `onResult` / `refresh`), run
  `greet.<building>` again and call `C.el.setGreeting(key, vars)` only when the returned **key**
  differs from the one shown (so an array greeting does not re-type a new variant after every
  action).
- **Why:** accepting the nomination in the Election Office leaves Clerk Plume's bubble reading "Your
  nomination sits on my desk until the end of day 15" above a running campaign (her campaign line,
  `greet.cityhall.campaign`, only shows on the next visit); the same holds for the U of S after a
  graduation (`greet.uofs.graduate`).
- **Workaround meanwhile:** none needed; the line is right again on the next visit.

## Notes for other packages (no change requested)

- **W2-Home (review):** the election-night edition (`js/ui/screens/report.js`) plays
  `SR.audio.music('hail_to_the_stick')` for either winner; ART_AUDIO §13.4 gives the Dictator the
  B♭-minor arrangement, which `cityhall.campaign` asks for as `{ variant: e.path === 'dictator' ?
  'dictator' : undefined }` (request 2 names it for W2-Music). Passing the same variant on a
  Dictator's win keeps the march in one key from the edition into City Hall.
- **W2-Home:** the castle's Campaign HQ row opens `cityhall.campaign`, which handles every status
  (none, nominated, campaign, office, lost, removed), so the row may also show in office if you
  want the office page at home. The election-night edition's front page uses your
  `news.election.*` keys; the rivals' side of the night is the voicemails `vm.doodle.concede` /
  `gloat` and `vm.crayon.concede` / `gloat` (vars `poll`) and the Board's `vm.board.nominated`
  (`path`, `days`, `day`), `impeached` / `coup` (`day`) in `en-civic.js`.
- **W2-Pocket (review):** `phone.boardInfo` (`js/data/actions/phone.js`) tells "accept at City Hall
  by day {day}" with `nominatedDay + acceptWithin`, one day late: the offer lapses in the night that
  ends day `nominatedDay + acceptWithin - 1` (night step 5), which is the day the Board's voicemail,
  Clerk Plume and the Election Office name. Suggested: `day: s.election.nominatedDay + E.acceptWithin - 1`.
  *Resolved:* `phone.boardInfo` now reads `SR.rules.election.acceptBy(s)`, which Clerk Plume and the
  Election Office also use.
- **W2-City:** the nomination check on stepping into the city (W1-C 5, deferred to you) is the
  only other entry of `election.check`; nothing in W2-Civic's files depends on it.
