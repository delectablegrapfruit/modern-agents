# Requests from W2-RulesC (rules desk: crime, trips, fights, casino, election), wave 2

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). The desk's own decisions on requests addressed to it are in
`docs/requests/decisions-w2-W2-RulesC.md`.

## 1. `tests/balance/sim.cjs` (lead in wave 2): the jail loop never releases the player

- **Change:** in the night block (today line 165),
  ```js
  if (kind === 'jail' && SR.rules.crime && has(SR.rules.crime.jailDay)) {
    const jd = SR.rules.crime.jailDay(s, has(bot.jailChoice) ? bot.jailChoice(s, ctx) : 'hp', { rng, source: 'sim' });
    // jailDay runs the jail night itself (and releases on the last one): no second night.
  }
  ```
  i.e. the default choice `'hp'` (the Jail Day's "Keep your head down", one of
  `SR.rules.crime.JAIL_CHOICES = ['str', 'int', 'cha', 'hp']`) instead of `'rest'`, and the sim's
  own stream as `ctx`. The existing `if (s.clock.day === day)` guard already skips the extra night
  when `jailDay` ran one.
- **Why:** `'rest'` is not a Jail Day choice, so `crime.jailDay` refuses it (`reason.unavailable`)
  and the sim then runs `night.run(..., { kind: 'jail' })` directly: the countdown goes on, but the
  release (Heat 20, `jail = null`, CONTRACT §8.9 "the release stays with `crime.jailDay`") never
  happens, so a bot that is ever jailed stays in the cell for the rest of the run (probed: daysLeft
  2, 1, 0, -1, -2, ...). Without `ctx`, `jailDay` also draws from `SR.rng.rules` instead of the
  seed's stream (the "Make friends" reputation city with `tours`), so runs depend on the global
  stream.
- **Meanwhile:** `crime.jailDay` now releases at once when `daysLeft ≤ 0` whatever the choice
  (W2-RulesC, tested in `crime.test.cjs`), so a stuck sim run gets out one day late instead of never.
- **Proposal (not a request):** bots should only pick `jail` actions while `s.jail` is set; the
  pure pipeline does not refuse other actions in jail (the jail scene gates the UI), so a bot may
  "work a shift" from the cell today.

## 2. `tests/e2e/conflict-sheet.test.cjs`, `tests/sheets/conflict.html` (W1-C's; the lead's in wave 2)

- **Change:** either transfer both to W2-RulesC for wave 2 (the successor of W1-C), or, in the
  test, `T.eq([info.fighters, info.cards], [17, 17], ...)` → `T.ok(info.cards === info.fighters &&
  info.fighters >= 17, ...)` and `SHOTS = shots/W2-RulesC` (or `shots/<owner>`).
- **Why:** the sheet shows `js/data/fighters.js`, which moved to W2-Night in wave 2 (BUILD_PLAN §7);
  a masked ring fighter or a goon added there would fail a suite nobody in wave 2 owns. Captures
  still go to `shots/W1-C/`.
- **Meanwhile:** unchanged; the suite passes (17 fighters). W2-RulesC captured the sheet into
  `shots/W2-RulesC/` with a scratch script for its review.

## 3. `js/rules/state.js` (W2-RulesE) and ARCHITECTURE §6.1 / CONTRACT §8.8, D43 (lead): the scratch card in progress

- **Change:** add `card: null` to `casino` in `SR.rules.state.defaults()` (next to `match`), and
  record it with the other "in progress" records: `casino.card` = the scratch card being revealed
  `{ roll, pay, tier, day }`, set by the named fn `casino.scratch` and closed by
  `casino.scratchResolve`.
- **Why:** W2-Food request 4 (applied here): the prize is paid at the reveal, not at the start, so
  the drawn roll must wait in the state between the row and its `:resolve` (and survive a save), and
  the resolve pays once (like `crime.open`, `casino.match`). Additive and deep-filled; v1 stays.
- **Meanwhile:** `js/rules/casino.js` creates the field when needed and treats a missing one as
  `null` (as W1-C did for the four D43 records before the wave-1 integration).
- **Status:** `state.js` part applied by W2-RulesE in the wave (`defaults()` has `casino.card: null`,
  pinned in `state.test.cjs`); the ARCHITECTURE / CONTRACT record is the lead's (W2-RulesE request 4
  asks for it too).

## 4. `docs/CONTRACT.md` §8.9 / §8.10 and ARCHITECTURE §6.11 / §6.12 (lead): record the wave-2 additive names of W2-RulesC

- **Change:** nothing frozen changes; add:
  - §8.9 `SR.rules.casino`: `scratchResolve(s)`; named fns for data: `casino.scratchResolve`
    (the scratch row's `:resolve`: pays the card in progress, refused with `reason.notNow` when
    none is open). `SR.rules.casino.scratchRound(s, ctx)` no longer credits the prize: it keeps the
    card in `casino.card` and opens the engine (a card left unpaid is paid before the next one,
    except in a preview's dry run, so the row never shows that unrevealed prize).
  - §8.9 "The in progress records": add `casino.scratchResolve` / `casino.card` to the list, and
    `election.debate` / `daily.campaign.debate` (the debates opened today by `election.debateStart`;
    added by the second review: a stray debate resolve no longer pays).
  - §8.10 Casino: `casino.settle` with `apply` refuses a stake beyond its rounds × the largest
    round the table allows (`reason.badBet`), and a blackjack session while backed off or past the
    day's 60 hands (second review).
  - §8.9 `SR.rules.crime`: `jailDay` releases at once (no gain, no night) when `jail.daysLeft ≤ 0`.
  - §8.9 `SR.rules.election`: `acceptBy(s)` → the last day the nomination can be accepted
    (`nominatedDay + acceptWithin - 1`; `null` when no offer waits); the Board's voicemail's `day`.
  - §8.10: "Scratch (P1 `shopsPlus`): the row `{ cost: { items: { scratch: 1 } }, effects: [['fn',
    'casino.scratch']] }` and its `:resolve` `['fn', 'casino.scratchResolve']` (the engine's
    `{ net }` is only an echo)."
- **Why:** W2-Food request 4; the jail fix of request 1; one reading of the acceptance deadline
  for City Hall, the phone and the Campaign HQ (W2-Civic's review note to W2-Pocket).
- **Meanwhile:** live in the tree and tested (`tests/node/casino.test.cjs`, `crime.test.cjs`).

## 5. `js/data/actions/phone.js` (W2-Pocket): the Board's "accept by" day

- **Change:** in `phone.boardInfo`, `day: s.election.nominatedDay + E.acceptWithin` →
  `day: SR.rules.election.acceptBy(s)` (new in the wave: `nominatedDay + acceptWithin - 1`, the last
  day the offer can be accepted; `null` when none waits).
- **Why:** night step 5 lapses the offer in the night that ends day `nominatedDay + acceptWithin -
  1` (the 14 days count the day of the call); the Board's voicemail, Clerk Plume and the Election
  Office name that day, the phone says one day later (W2-Civic's review note in
  `docs/requests/W2-Civic.md`). Pinned in `tests/node/election.test.cjs`.
- **Meanwhile:** nothing (P1 `phone`).
- **Status:** applied by W2-Pocket in the wave (`phone.boardInfo` reads
  `SR.rules.election.acceptBy(s)`; recorded in `docs/requests/W2-Pocket.md`).

## 6. `js/rules/state.js` (W2-RulesE) and ARCHITECTURE §6.1 (lead): two daily counters

- **Change:** in `SR.rules.state.defaults()` and the `daily` line of ARCHITECTURE §6.1, add
  `ring: 0` to `daily` (next to `dartsMatches`): today's Underground Ring bouts (B-13 `ring.perDay`,
  P1 `nightlife`), counted by `SR.rules.fight.start(s, 'ring')` and read by `fight.canStart`; and
  `debate: 0` to `daily.campaign`: the debates opened today by `election.debateStart`, which the
  named fn `election.debate` (the debate's `:resolve`) requires (B-17 `debate.cap` 1).
- **Why:** they are the only state fields the conflict rules write that the frozen v1 schema does
  not list (found by the second review's sweep of every field this desk writes; `debate` is new in
  that review). Additive and deep-filled; v1 stays.
- **Meanwhile:** `js/rules/fight.js` and `js/rules/election.js` create them when first counted
  (`(n || 0) + 1`), and the night's step 9 zeroes every key of `daily`, nested ones too, so both
  rules already hold (probed: the Ring refused after a bout, open again the next Saturday; a stray
  debate resolve refused). `js/ui/subscreens/campaign.js` lists only B-17's six actions, so the
  extra campaign key shows nowhere.
