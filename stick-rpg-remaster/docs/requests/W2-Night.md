# Requests from W2-Night (Nightlife: Sticky's, fights, darts, the casino), wave 2

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-2 are records for the lead (CONTRACT / ARCHITECTURE); item 3 is a small UI
change in a file the lead owns in wave 2; item 4 is a contract proposal for the input contexts;
item 5 asks W2-RulesE for one tuning row (the conflict rules needed no change: every call of
CONTRACT §8.10 worked as recorded). Items 6-7 come from the package's review: a rounding in the
casino rules (W2-RulesC) and the frame's exit question (lead).

## 1. CONTRACT §8.10 / ARCHITECTURE §6.12 (lead): record how the casino engines apply their rounds

- **Change (record only; nothing frozen changes):** add to the "Casino" bullet: the round actions
  are minigame resolutions, one per decided round, so no card shows them:
  `casino.slots.pull:resolve { bet }` → `casino.slotsSpin`, `casino.blackjack.hand:resolve { round,
  shoe, trueCount }` → `casino.bjHand`, `casino.roulette.spin:resolve { bets }` →
  `casino.rouletteSpin` (all `building: 'casino'`, `timeRule: 'free'`, in
  `js/data/buildings/casino.js`). The session resolves `casino.<game>:resolve` run
  `['fn', 'casino.settle']` (a sampled session with `apply: true`) then
  `['fn', 'casino.sessionEnd', game]` (W2-Night: a blackjack hand abandoned mid-play loses its
  stake `live` and keeps its cards dealt through `shoe`, its hole card counted; a sampled blackjack
  session keeps its `shoe` and counts its hands toward the day; one toast for the visit's net).
- **Why:** CONTRACT §8.10 says the engines "apply each round with `SR.act` on rows calling
  `casino.slotsSpin`…", but a `building: 'casino'` action is a card row, and a `hidden` one is
  refused by `SR.act`; the `:resolve` suffix is the only way the card and
  `SR.rules.act.actions()` leave an action out (`js/ui/card.js` `cardActions`, `act.js`).
- **Session result shapes** (CONTRACT §13 says `{ net }`): slots, blackjack and roulette return
  `{ net, rounds, wagered }` (+ `auto: true` from Auto, `exited: true` from Exit); a blackjack exit
  mid-hand adds `live` (the stake lost) and `shoe`; a sampled Auto without the frame
  (`SR.minigame.auto`, the simulator) returns `{ game, net, rounds, wagered, apply: true }`
  (blackjack adds `shoe`). A blackjack hand already decided when you leave (its cards still being
  revealed) is applied as played first, so it is never a forfeit.
- **Meanwhile:** implemented and tested as above (`tests/e2e/casino.test.cjs`).

## 2. CONTRACT §8.9 / §13.1 (lead): additive names of W2-Night

- **Named fns** (`js/data/buildings/bar.js`): `bar.beerCash`, `bar.beerMin`, `bar.beerBuzz`,
  `bar.bottleCash`, `bar.fightMin`, `bar.dartsMin`, `bar.ringMin` (cost and effect numbers read
  from `SR.tuning` at call time: B-03 `beer`, B-06 `booze`, B-13 `startCost` / `ring.min`, B-14f
  `practice.min`), `bar.canDrink` (condition: Buzz below B-03's cut-off, `reason.tooBuzzed`),
  `bar.canCarry` (condition: the B-06 stack, `reason.stackFull`), `bar.bought` (effect: the `buy`
  rule event with the price actually paid), `bar.dartsDone` (the practice round's toast),
  `greet.bar`; (`js/data/buildings/casino.js`) `casino.sessionEnd`, `casino.minChip` (the smallest
  table chip, `SR.tuning.casino.chips[0]`: the roulette row's `cashAtLeast`), `greet.casino`.
- **Engine def extras** (read-only helpers for tests and sheets): `SR.reg.minigame.darts.CENTER`,
  `SR.reg.minigame.slots.symbol(ctx, host, sym, x, y, scale)`, `SR.reg.minigame.roulette.{spotAt,
  hit, ORDER}`; every engine's instance has `peek()`.
- **Why:** CONTRACT lists the public names; these are new and other packages (W3-Nightlife, the
  balance simulator) will read them.

## 3. `js/ui/card.js` (lead, requests in wave 2): no flying chips across a minigame that opens

- **Change:** in `commit()`, when `res.ok && res.open`, call `feedback(res, r.el, { ..., flyChips:
  false })` (or defer the row's feedback until `runMinigame`'s promise settles), so the row's chips
  do not fly to the HUD while the minigame frame opens over it.
- **Why:** Start a bar fight's "-2 karma · +5 Heat · 3h" and Darts practice's "+1 CHA · 30m" chips
  fly across the fight and darts screens for about a second as they open (seen in
  `shots/W2-Night/explore-fight-1.png`: the chips land on the move bar). Any row with `open`
  (the store and bank robberies, the hustles) does the same.
- **Meanwhile:** nothing (cosmetic, about 1 s).

## 4. CONTRACT §12.3 and `js/core/input.js` CONTEXTS (lead; W3-Input in wave 3): pad bindings for roulette

- **Change (proposal for the next contract revision):** `roulette: { clearBets: ['KeyC', 'Pad4'],
  spin: ['Space', 'Pad5'], place: ['Enter'], chip1-chip4: Digit1-Digit4, nextChip: ['Pad3'] }`.
- **Why:** the frozen roulette map binds Spin, Clear and the chips to keys only, so a pad cannot
  spin. The engine keeps the frozen map and answers the global actions a pad still fires there: RB
  (`tabNext`) spins, LB (`tabPrev`) clears, Y (`car`) changes the chip, A (`confirm`) places, the
  D-pad moves. Blackjack likewise has no pad chips: its D-pad picks a chip and Up places it (only
  for `ev.device === 'pad'`, so WASD never bets). Naming these in the context would let Settings ›
  Controls remap them.
- **Meanwhile:** the global-action fallbacks above (tested for blackjack in
  `tests/e2e/casino.test.cjs`).

## 5. `js/data/tuning.js` (W2-RulesE): the table chips as tuning

- **Change:** add `casino.chips: [5, 25, 100, 500]` (GDD §2.1 "$5 / $25 / $100 chips (+$500)", §6.5
  "chips 5/25/100/500"; B-14b/c do not list them).
- **Why:** BUILD_PLAN §1.7: a number BALANCE lacks lives in a named constant of the package's file
  until it moves to `tuning.js`. The blackjack chips (the fifth chip clears the bet) and the roulette
  chips are those four denominations.
- **Meanwhile:** the named constant `CHIPS` in `js/minigames/blackjack.js` and
  `js/minigames/roulette.js` (review, wave 2).

## 6. `js/rules/casino.js` (W2-RulesC): a fractional blackjack payout is rounded up for the player

- **Change:** in `applyRound`, round a fractional net toward the house instead of to the nearest
  dollar: `net = net < 0 ? -Math.ceil(-net) : Math.floor(net)` (or keep cents; B-14b does not say).
  Today `net = Mth.round(net)` (line 702) turns the 3:2 natural on a $5 bet (`bj.settle`: +7.5) into
  +$8, and on every odd bet ($15, $25, $35, ...) adds 50 cents to each natural.
- **Why:** B-14b sets the house edge at 0.5-0.6 % with basic strategy. A Node simulation of 400,000
  $5 hands by the book (`bj.deal` + `bj.playBook`, seed 99) gives 0.598 % on the exact nets and
  0.195 % on the nets `applyRound` actually pays, so at the table minimum the rounding takes two
  thirds of the edge away (and makes W3-Nightlife's counting target of ≤ +0.3 % harder to hold).
  The node suite's edge test measures `bj.settle`'s exact nets, so it does not see it.
- **Meanwhile:** nothing in W2-Night: the blackjack engine applies each hand through
  `casino.bjHand { round, shoe, trueCount }`, so the rules settle and pay it; the engine shows
  the amount the rules paid (the `gamble` event's `net`).

## 7. `js/scenes/minigame.js` (lead): ask before leaving blackjack only while a hand is out

- **Change:** let an engine's `confirmExit` be a function of the round's progress
  (`confirmExit(progress) → boolean`, called by `requestExit` with `inst.progress()`), or let the
  instance answer `exitRisk()`. Blackjack would then return `progress.live > 0`.
- **Why:** blackjack sets `confirmExit: true` so that leaving with a hand out never loses the
  stake without a question (casino.sessionEnd applies the forfeit). Between hands nothing is at
  stake, but the frame still asks, with `mg.frame.quitLoss` ("Walk away now and this round counts
  as a loss."), which is untrue there.
- **Meanwhile:** blackjack always asks before leaving (Cash out leaves at once between hands).
