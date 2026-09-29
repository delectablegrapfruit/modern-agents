# Requests from W2-Goods (pawn shop and Fine Line Furnishings)

Each entry: file, exact change, why, and the workaround used meanwhile.

## 1. `js/ui/components.js` and `js/scenes/building.js` (lead, W1-D's files): furniture and home chips name the piece

- **File:** `js/ui/components.js` (`chipText`, cases `'home'` and `'furniture'`) and
  `js/scenes/building.js` (`spawnFloats`).
- **Change:** in `chipText`, a `furniture` chip names the piece at its tier: the key is the tier-1
  id of the Delta (`bed`), so `SR.text(SR.reg.furniture[SR.rules.homes.tierId(key, to)].name)` when
  `o.to` is known, else `SR.text(SR.reg.furniture[key].name)` (`furn.*`, en-econ.js); a `home`
  chip with key `living` names `home.<to>`, with key `owned` the home added. In `spawnFloats`, skip
  `furniture` and `home` Deltas like `item` (they are not stat floats).
- **Why:** buying at Fine Line (`homes.buyFurniture`) produces the Delta `{ kind: 'furniture', key:
  'bed', n: 1, from: 0, to: 1 }`; `chipText` looks the key up as an item and falls back to the raw
  id, so the flying chip and the building scene's FloatText show "bed" / "satellite" over your head
  (seen in `shots/W2-Goods/furniture-showroom-full.png`). Moving house (W2-Home) shows "living".
- **Meanwhile:** nothing in W2-Goods' files: the showroom tile updates to "Owned" and the delivery
  toast names the piece (`toast.furniture.*`), so the purchase still reads correctly.

## 2. BUILD_PLAN Appendix B (lead): the flag of Fine Line's live preview

- **File:** `docs/BUILD_PLAN.md` Appendix B, row `homesPlus`.
- **Change:** add "Fine Line's live preview of a piece in your home" to what `homesPlus` enables.
- **Why:** GDD §6.1 and BUILD_PLAN §4.5 make the preview P1, but no Appendix B row names it;
  `homesPlus` already covers the rest of the home's P1 furniture (tier 2, the catalogue).
- **Meanwhile:** `js/ui/subscreens/furniture.js` shows the preview only while `homesPlus` is on.

## 3. CONTRACT §8.2 / §10 (lead): record the sub-screen commit convention and the goods' names

- **File:** `docs/CONTRACT.md` §8.2 (action fields) and §10 (sub-screens); ARCHITECTURE §7.1.
- **Change (a record, nothing renamed):** "A sub-screen's commit action takes its object as a
  parameter and is `hidden` without it (a named condition such as `furniture.noPiece`), so the card,
  which lists every action of its building, never shows it as a row; the preview and `SR.act` with
  the parameter work as usual." W2-Goods supports W2-Civic's request 1 (`row: false`, skipped by
  `cardActions()` in `js/ui/card.js`): `pawn.sell`, `furniture.buy` and `furniture.upgrade` carry
  `row: false` already, so either rule keeps them off the card. The additive public names of W2-Goods: actions `pawn.knife`,
  `pawn.gun`, `pawn.ammo`, `pawn.alarm`, `pawn.phone`, `pawn.knuckles`, `pawn.vest`,
  `pawn.skateboard`, `pawn.shirt` (each with an `item` field naming the Bag key it sells),
  `pawn.counter` (screen `pawn.shop`), `pawn.sell` (`{ item }`, P1 `shopsPlus`),
  `furniture.showroom` (screen `furniture.browse`), `furniture.buy` (`{ piece }`),
  `furniture.upgrade` (`{ piece }`, P1 `homesPlus`); named fns `pawn.{price, per, note,
  shirtAsked, noItem, sellable, sell, rate}` (`pawn.rate(s)` → the buyback share `pawn.sell` pays,
  0.40 or 0.55 with Smooth Talker; the Sell tab's intro reads it), `furniture.{noPiece, delivered}`, `greet.pawn`,
  `greet.furniture`, and `pawn.use` (`(s, params, ctx, item)` → `{ id, vars }`: what an item does,
  for the purchase toast `toast.pawn.<id>` and the counter's line `card.pawn.use.<id>`, its numbers
  read from the tables the rules use; like `greet.<building>`, a data fn the UI reads); `pawn.shop` takes `params.tab` (`'buy'` | `'sell'`) and pushes the `tabs`
  input context while its tabs show (CONTRACT §12.3 lists `tabs` for the Pocket, Settings and
  Profile; a tabbed sub-screen uses it the same way).
- **Why:** other wave-2 packages face the same problem (the bank's deposit and loan, the stocks
  screen) and the lead's 40-day bot buys "the bed, TV and alarm": `SR.act('furniture.buy', { piece:
  'bed' })`, `SR.act('pawn.alarm')`.
- **Meanwhile:** documented in the headers of `js/data/buildings/{pawn,furniture}.js`.

## 4. `js/data/text/en-ui.js` (W2-Front): badge text for the B-28a modifiers the goods show

- **File:** `js/data/text/en-ui.js` (the `ui.badge.*` keys `SR.ui.badge` looks a bare Preview badge
  id up under).
- **Change:** add `'ui.badge.goodKarma': 'GOOD KARMA'` and `'ui.badge.couponClipper': 'COUPON
  CLIPPER'` (and, for the other shops, `employee`, `flyerCoupon`, `burgerDay`, `regular`, ... as
  their owners see fit).
- **Why:** a Preview's `badges` are the ids of the B-28a rows applied (`act.price(...).applied`);
  without a `ui.badge.<id>` key the badge falls back to the id upper-cased, so a pawn row with Coupon
  Clipper reads "COUPONCLIPPER" and one with Good karma (P1 `karmaTiers`) "GOODKARMA"; the showroom's
  tiles name the same discount (`furniture.*`) and read the same.
- **Meanwhile:** nothing: the price itself is right; only the badge's wording is off.

