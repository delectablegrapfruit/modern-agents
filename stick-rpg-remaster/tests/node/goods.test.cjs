// tests/node/goods.test.cjs — owner: W2-Goods. The pawn shop and Fine Line Furnishings as data, on
// the real rules pipeline in Node (BUILD_PLAN §4.5 acceptance, GDD §4.15 / §6.1, BALANCE B-06,
// B-07, B-08, B-28a):
//   - every pawn row costs its B-06 price and gives its B-06 amount; stacks (gear 1, ammo 5 at a
//     time to 99, refused at ≥ 95); refusals (need cash, already have); the `buy` rule event with
//     the price paid; B-28a's `item.pawn.*` modifiers; P1 rows only behind their flags; the clean
//     shirt only once Harold asks; P1 Sell at 40 % (55 % Smooth Talker), ammo by the box;
//   - Fine Line: the card shows only the showroom row; slots per home (B-08a); "Needs a free
//     slot"; the P0 satellite needs the TV, takes no slot and retires with `homesPlus`; the P2
//     aquarium hides; P1 upgrades at the net price; bought pieces work at the next sleep (night
//     steps 6 and 7); the delivery toasts;
//   - the greeting fns name registered keys (rain only with the `weather` flag); what each item does
//     (`pawn.use`) quotes the tables the rules read, the vest's mugging line only with `tours`; the
//     sub-screens are registered P0 in their files; the buildings name their exteriors.
//   node tests/node/goods.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('node goods (W2-Goods)');
let undo = null;
const { SR } = L.load({ mode: 'all' });

function game(patch, opts) {
  const s = SR.rules.state.create(Object.assign({ seed: 11 }, opts || {}));
  if (patch) SR.util.merge(s, patch);
  SR.state = s;
  SR.rng.rules.seed(11);
  return s;
}
function flags(map) {
  const old = {};
  Object.keys(map).forEach((k) => { old[k] = SR.features[k]; SR.features[k] = !!map[k]; });
  return () => Object.keys(old).forEach((k) => { SR.features[k] = old[k]; });
}
const pv = (id, p) => SR.preview(id, p || {});
const act = (id, p) => SR.act(id, p || {}, { source: 'debug' });
const TI = SR.tuning.items, TF = SR.tuning.furniture;

// ------------------------------------------------------------------------------------------------
T.section('the pawn shop: rows, prices and amounts (B-06)');
game({ money: { cash: 100000 } });
T.eq(SR.rules.act.actions('pawn'), ['pawn.knife', 'pawn.gun', 'pawn.ammo', 'pawn.alarm', 'pawn.phone', 'pawn.knuckles', 'pawn.vest',
  'pawn.skateboard', 'pawn.shirt', 'pawn.counter', 'pawn.sell'], 'the pawn actions in card order');
const P0 = ['knife', 'gun', 'ammo', 'alarm', 'phone'];
T.eq(P0.map((k) => pv('pawn.' + k).cost.cash), P0.map((k) => TI[k].price), 'P0 prices are B-06: ' + P0.map((k) => '$' + TI[k].price).join(', '));
T.eq(P0.map((k) => pv('pawn.' + k).cost.cash), [100, 400, 10, 200, 200], 'and read $100, $400, $10 (5 rounds), $200, $200 (orig)');
T.eq(P0.map((k) => pv('pawn.' + k).cost.min), [0, 0, 0, 0, 0], 'buying takes no time (B-06 min 0)');
T.eq(P0.map((k) => (pv('pawn.' + k).gains.find((g) => g.kind === 'item') || {}).n), [1, 1, 5, 1, 1], 'each gives one, ammo a box of 5');
T.ok(['knuckles', 'vest', 'skateboard', 'shirt', 'sell'].every((k) => pv('pawn.' + k).hidden), 'P1 rows and the Sell action hide while their flags are off');
T.ok(!pv('pawn.counter').hidden && pv('pawn.counter').screen === 'pawn.shop', 'the counter row opens pawn.shop');
T.eq(SR.reg.action['pawn.ammo'].repeatable, true, 'ammo repeats (R / hold); the one-off gear does not');
T.ok(P0.filter((k) => k !== 'ammo').every((k) => !SR.reg.action['pawn.' + k].repeatable), 'no other P0 row repeats');

T.section('buying: the Bag, the event, stacks and refusals');
let s = game({ money: { cash: 1000 } });
let r = act('pawn.knife');
T.ok(r.ok && s.items.knife === 1 && s.money.cash === 900, 'a knife: -$100, +1 knife');
T.eq(r.events.filter((e) => e.name === 'buy').map((e) => e.payload), [{ item: 'knife', n: 1, where: 'pawn', price: 100 }], 'the buy rule event with the price paid');
T.eq(r.toasts.map((x) => [x.key, x.vars]), [['toast.pawn.knife', { n: TI.knife.dmg }]], 'a toast says what it does (+' + TI.knife.dmg + ', B-06)');
r = act('pawn.knife');
T.eq([r.ok, r.reason, r.vars.item, s.money.cash], [false, 'reason.haveItem', 'Knife', 900], 'a second knife: "Already have Knife", nothing spent');
s = game({ money: { cash: 1000 }, items: { ammo: 0 } });
r = act('pawn.ammo');
T.ok(r.ok && s.items.ammo === 5 && s.money.cash === 990, 'ammo: -$10, +5 rounds');
s.items.ammo = 94;
T.ok(act('pawn.ammo').ok && s.items.ammo === 99, 'at 94 rounds a box still fits: 99, the stack');
[95, 96, 98, 99].forEach((n) => {
  s.items.ammo = n;
  const p = pv('pawn.ammo');
  T.eq([p.ok, p.reason, p.vars && p.vars.max], [false, 'reason.stackFull', 99], 'at ' + n + ' rounds the box is refused (orig: ≥ 95), "max 99"');
});
s = game({ money: { cash: 399 } });
T.eq([pv('pawn.gun').ok, pv('pawn.gun').reason, pv('pawn.gun').vars.money], [false, 'reason.needCash', '$400'], 'short of cash: "Need $400"');
s = game({ money: { cash: 5000 } });
['alarm', 'phone', 'gun'].forEach((k) => act('pawn.' + k));
T.eq([s.items.alarm, s.items.phone, s.items.gun, s.money.cash], [1, 1, 1, 4200], 'the alarm, the phone and the gun: $800 in all');

T.section('B-28a: the pawn targets item.pawn.<id>');
undo = flags({ perks: true });
s = game({ money: { cash: 1000 }, perks: { owned: ['couponClipper'] } });
T.eq([pv('pawn.knife').cost.cash, pv('pawn.gun').cost.cash, pv('pawn.ammo').cost.cash], [90, 360, 9], 'Coupon Clipper: 10 % off every pawn row');
r = act('pawn.knife');
T.eq(r.events.find((e) => e.name === 'buy').payload.price, 90, 'and the buy event carries the discounted price');
undo();
undo = flags({ karmaTiers: true });
s = game({ money: { cash: 1000 }, stats: { karma: 60 } });
T.eq(pv('pawn.alarm').cost.cash, 180, 'Good karma (P1 karmaTiers): 10 % off');
undo();

T.section('P1 rows (shopsPlus, arcs)');
undo = flags({ shopsPlus: true });
s = game({ money: { cash: 5000 } });
['knuckles', 'vest', 'skateboard'].forEach((k) => {
  const p = pv('pawn.' + k);
  T.ok(!p.hidden && p.ok && p.cost.cash === TI[k].price, k + ' shows at $' + TI[k].price + ' (B-06)');
});
T.eq([SR.reg.action['pawn.knuckles'].feature, SR.reg.action['pawn.vest'].feature, SR.reg.action['pawn.skateboard'].feature, SR.reg.action['pawn.shirt'].feature],
  ['shopsPlus', 'shopsPlus', 'shopsPlus', 'arcs'], 'each P1 row carries its flag (Appendix B)');
s.items.skateboard = 1;
T.eq(pv('pawn.skateboard').reason, 'reason.haveItem', 'a used skateboard only if you have none');
s.items.skateboard = 0; s.items.prodeck = 1;
T.eq([pv('pawn.skateboard').reason, pv('pawn.skateboard').vars.item], ['reason.haveItem', 'Pro Deck'], 'the Pro Deck counts as a board');
T.ok(pv('pawn.shirt').hidden, 'the shirt hides while arcs is off');
undo();
undo = flags({ arcs: true });
s = game({ money: { cash: 100 } });
T.ok(pv('pawn.shirt').hidden, 'arcs on: the shirt hides until Harold asks');
const cb = SR.tuning.street.harold.comeback;
s.npc.harold.gave10 = cb.give10s; s.npc.harold.takeout = cb.takeouts;
T.ok(!pv('pawn.shirt').hidden && pv('pawn.shirt').cost.cash === TI.shirt.price, 'after ' + cb.give10s + ' × $10 and ' + cb.takeouts + ' takeout he asks: the shirt shows at $' + TI.shirt.price);
r = act('pawn.shirt');
T.ok(r.ok && s.items.shirt === 1, 'the shirt goes into the Bag');
T.eq(pv('pawn.shirt').reason, 'reason.haveItem', 'one shirt is enough');
s.npc.harold.shirt = true; s.items.shirt = 0;
T.ok(pv('pawn.shirt').hidden, 'once given, it hides again');
s.npc.harold.shirt = false; s.npc.harold.branch = 'barfly';
T.ok(pv('pawn.shirt').hidden, 'the barfly branch closes the comeback: no shirt');
undo();

T.section('P1 Sell: 40 % of the price, ammo by the box (B-06 pawnBuyback)');
undo = flags({ shopsPlus: true, perks: true });
s = game({ money: { cash: 0 }, items: { knife: 1, ammo: 13, booze: 2 } });
T.ok(pv('pawn.sell').hidden, 'Sell without an item is never a card row');
r = act('pawn.sell', { item: 'knife' });
T.ok(r.ok && s.items.knife === 0 && s.money.cash === TI.knife.price * TI.pawnBuyback, 'a knife sells for $' + TI.knife.price * TI.pawnBuyback);
T.eq(r.events.filter((e) => e.name === 'sell').map((e) => e.payload), [{ item: 'knife', n: 1, where: 'pawn', price: 40 }], 'the sell rule event');
T.eq([pv('pawn.sell', { item: 'knife' }).reason], ['reason.needItem'], 'nothing left to sell: "Need Knife"');
r = act('pawn.sell', { item: 'ammo' });
T.eq([r.ok, s.items.ammo, s.money.cash], [true, 8, 44], 'ammo sells a box of 5 for $4');
act('pawn.sell', { item: 'ammo' });
r = act('pawn.sell', { item: 'ammo' });
T.eq([r.ok, s.items.ammo, s.money.cash], [true, 0, 50], 'and the last 3 rounds for $2 (3/5 of a box, rounded)');
T.eq(pv('pawn.sell', { item: 'booze' }).reason, 'reason.unavailable', 'Vinnie only buys back what he sells');
s = game({ money: { cash: 0 }, items: { shirt: 1 } });
T.eq([pv('pawn.sell', { item: 'shirt' }).reason, act('pawn.sell', { item: 'shirt' }).ok, s.items.shirt], ['reason.unavailable', false, 1],
  'nor what he does not sell now: the clean shirt while arcs is off (the Sell tab\'s list)');
undo();
undo = flags({ shopsPlus: true, arcs: true });
r = act('pawn.sell', { item: 'shirt' });
T.eq([r.ok, s.items.shirt, s.money.cash], [true, 0, Math.round(TI.shirt.price * TI.pawnBuyback)], 'with arcs on he buys it back like the rest');
undo();
undo = flags({ shopsPlus: true, perks: true });
s = game({ money: { cash: 0 }, items: { vest: 1 }, perks: { owned: ['smoothTalker'] } });
T.eq(SR.reg.fn['pawn.rate'](s), TI.pawnBuybackSmooth, 'pawn.rate (the Sell tab\'s intro) reads 55 % with Smooth Talker');
r = act('pawn.sell', { item: 'vest' });
T.eq(s.money.cash, Math.round(TI.vest.price * TI.pawnBuybackSmooth), 'Smooth Talker: a vest sells at 55 % ($' + Math.round(TI.vest.price * TI.pawnBuybackSmooth) + ')');
T.eq(SR.reg.fn['pawn.rate'](game()), TI.pawnBuyback, 'and 40 % without it');
undo();

T.section('refusals change nothing (bogus parameters, previews)');
undo = flags({ shopsPlus: true });
s = game({ money: { cash: 1000 }, items: { knife: 1, ammo: 12 } });
let snap = JSON.stringify(s);
['constructor', 'toString', '__proto__', 'prodeck', 'booze', '', 42].forEach((item) => {
  r = act('pawn.sell', { item: item });
  T.ok(!r.ok && JSON.stringify(s) === snap, 'Sell refuses ' + JSON.stringify(item) + ' (' + r.reason + ') and changes nothing');
});
T.eq([act('pawn.knife', { item: 'gun' }).reason, s.items.gun], ['reason.haveItem', 0], 'a row sells its own item whatever params.item says');
snap = JSON.stringify(s);
['pawn.knife', 'pawn.gun', 'pawn.ammo', 'pawn.vest', 'pawn.counter'].forEach((id) => pv(id));
[{ item: 'knife' }, { item: 'ammo' }, {}].forEach((p) => pv('pawn.sell', p));
T.ok(JSON.stringify(s) === snap, 'previews of every pawn row and of Sell never mutate the state');
undo();
s = game({ money: { cash: 100000 } });
snap = JSON.stringify(s);
['pod', 'library', 'zzz', '', 'constructor'].forEach((piece) => {
  r = act('furniture.buy', { piece: piece });
  T.ok(!r.ok && JSON.stringify(s) === snap, 'Fine Line refuses to sell ' + JSON.stringify(piece) + ' (' + r.reason + ')');
});
['bed', 'tv', 'pc', 'books', 'treadmill', 'freezer', 'minibar', 'satellite'].forEach((k) => pv('furniture.buy', { piece: k }));
T.ok(JSON.stringify(s) === snap, 'previews of every piece never mutate the state');

T.section('the clean shirt closes with the barfly branch (B-26 harold.exclusive)');
undo = flags({ arcs: true });
s = game({ money: { cash: 100 } });
const HB = SR.tuning.street.harold;
s.npc.harold.gave10 = HB.comeback.give10s; s.npc.harold.takeout = HB.comeback.takeouts;
s.npc.harold.bottles = HB.barfly.bottles - 1;
T.ok(!pv('pawn.shirt').hidden, 'asked, with ' + (HB.barfly.bottles - 1) + ' bottles given: the shirt shows');
s.npc.harold.bottles = HB.barfly.bottles;
T.ok(pv('pawn.shirt').hidden, 'the ' + HB.barfly.bottles + 'th bottle before the shirt ends the comeback: the shirt hides');
undo();

// ------------------------------------------------------------------------------------------------
T.section('Fine Line: the card and the showroom\'s actions');
s = game({ money: { cash: 100000 } });
T.eq(SR.rules.act.actions('furniture'), ['furniture.showroom', 'furniture.buy', 'furniture.upgrade'], 'the Fine Line actions');
T.ok(!pv('furniture.showroom').hidden && pv('furniture.showroom').screen === 'furniture.browse', 'the showroom row opens furniture.browse');
T.ok(pv('furniture.buy').hidden && pv('furniture.upgrade').hidden, 'the commits without a piece are not card rows');
T.eq(SR.reg.action['furniture.upgrade'].feature, 'homesPlus', 'upgrades are P1 homesPlus');

T.section('prices, slots per home and "Needs a free slot" (B-08)');
const PIECES = ['bed', 'tv', 'pc', 'books', 'treadmill', 'freezer', 'minibar'];
T.eq(PIECES.map((k) => TF[k].price), [500, 2500, 2000, 2000, 3500, 2500, 5000], 'B-08b tier-1 prices');
PIECES.forEach((k) => {
  s = game({ money: { cash: 100000 } });
  r = act('furniture.buy', { piece: k });
  T.ok(r.ok && s.furniture.owned[k] === 1 && s.money.cash === 100000 - TF[k].price, k + ': -$' + TF[k].price + ', owned');
});
T.eq(['apt', 'apt2', 'pent', 'mansion', 'castle'].map((h) => SR.rules.homes.slots(game({ homes: { owned: [h], living: h } }))), [3, 5, 7, 10, 14],
  'slots per home: 3, 5, 7, 10, 14');
s = game({ money: { cash: 100000 } });
['bed', 'tv', 'pc'].forEach((k) => act('furniture.buy', { piece: k }));
const full = pv('furniture.buy', { piece: 'books' });
T.eq([full.ok, full.reason, SR.text(full.reason)], [false, 'reason.needSlot', 'Needs a free slot'], 'the apartment is full after three pieces: "Needs a free slot"');
T.ok(pv('furniture.buy', { piece: 'satellite' }).ok, 'the satellite takes no slot, so it still fits (with the TV)');
T.eq(act('furniture.buy', { piece: 'satellite' }).ok && SR.rules.homes.channels(s).fitness && SR.rules.homes.channels(s).dating, true, 'it adds Fitness and Dating');
s = game({ money: { cash: 100000 }, homes: { owned: ['apt', 'apt2'], living: 'apt2' } });
['bed', 'tv', 'pc', 'books', 'treadmill'].forEach((k) => act('furniture.buy', { piece: k }));
T.eq([SR.rules.homes.slotsUsed(s), pv('furniture.buy', { piece: 'freezer' }).reason], [5, 'reason.needSlot'], 'the bigger apartment holds five');
s = game({ money: { cash: 100000 } });
T.eq([pv('furniture.buy', { piece: 'satellite' }).reason, SR.text(pv('furniture.buy', { piece: 'satellite' }).reason, pv('furniture.buy', { piece: 'satellite' }).vars)],
  ['reason.needPiece', 'Needs the Flatland 60 TV first'], 'the satellite needs the TV first');
s = game({ money: { cash: 400 } });
T.eq([pv('furniture.buy', { piece: 'bed' }).reason], ['reason.needCash'], 'short of cash: refused');
T.eq(pv('furniture.buy', { piece: 'aquarium' }).reason, 'reason.featureOff', 'the P2 aquarium is not on sale while its flag is off');
undo = flags({ aquarium: true });
s = game({ money: { cash: 100000 } });
r = act('furniture.buy', { piece: 'aquarium' });
T.ok(r.ok && s.furniture.owned.aquarium === 1 && s.money.cash === 100000 - TF.aquarium.price && SR.rules.homes.slotsUsed(s) === TF.aquarium.slots,
  'with its flag the aquarium sells at $' + TF.aquarium.price + ' for ' + TF.aquarium.slots + ' slot (B-08b)');
undo();

T.section('P1 upgrades and the satellite\'s retirement (homesPlus)');
undo = flags({ homesPlus: true });
s = game({ money: { cash: 100000 } });
T.eq(pv('furniture.buy', { piece: 'satellite' }).reason, 'reason.unavailable', 'with homesPlus the P0 satellite is retired (the SkyDish is the TV\'s tier 2)');
act('furniture.buy', { piece: 'bed' });
const c0 = s.money.cash;
r = act('furniture.upgrade', { piece: 'bed' });
T.ok(r.ok && s.furniture.owned.bed === 2 && c0 - s.money.cash === 3750, 'the Hibernation Pod: $4,000 less 50 % of the bed = $3,750');
T.eq(r.toasts.map((x) => x.key), ['toast.furniture.sleep'], 'the delivery toast');
T.eq(pv('furniture.upgrade', { piece: 'bed' }).reason, 'reason.maxTier', 'already upgraded');
s = game({ money: { cash: 100000 }, homes: { owned: ['apt', 'apt2'], living: 'apt2' } });
['bed', 'tv', 'pc', 'books', 'treadmill'].forEach((k) => act('furniture.buy', { piece: k }));
s.homes.living = 'apt';
SR.rules.homes.restock(s);
T.eq(s.furniture.storage, ['books', 'treadmill'], 'back in the apartment, the books and the treadmill go to storage (GDD §4.15)');
r = act('furniture.upgrade', { piece: 'books' });
T.eq([r.ok, s.furniture.owned.books, s.furniture.storage.indexOf('books') >= 0], [true, 2, true], 'a stored piece can be upgraded; the Grand Library stays in storage');
T.eq(r.toasts.map((x) => [x.key, x.vars.name]), [['toast.furniture.stored', 'Grand Library']], 'and the delivery toast says it waits in storage, not that it trains you tonight');
const int1 = s.stats.int;
SR.rules.night.run(s, { rng: SR.rng.create(3), source: 'sim' }, { kind: 'sleep' });
T.eq(s.stats.int, int1, 'indeed: no INT from a stored library');
s = game({ money: { cash: 100000 } });
['bed', 'tv', 'books'].forEach((k) => act('furniture.buy', { piece: k }));
T.eq([pv('furniture.upgrade', { piece: 'books' }).reason, pv('furniture.upgrade', { piece: 'bed' }).ok], ['reason.needSlot', true],
  'in a full apartment the Grand Library (2 slots) needs a free slot; the Pod (1 slot) does not');
undo();
undo = flags({ homesPlus: true, karmaTiers: true });
s = game({ money: { cash: 100000 }, stats: { karma: 60 } });
act('furniture.buy', { piece: 'bed' });
const netPod = TF.pod.price - Math.floor(TF.bed.price * TF.upgradeCredit);
const good = SR.rules.act.price(s, netPod, 'furniture.pod', {}).price;
T.eq([good, pv('furniture.upgrade', { piece: 'bed' }).gains.find((g) => g.kind === 'cash').n], [Math.round(netPod * 0.9), -good],
  'Good karma (B-28a furniture.*) takes 10 % off the upgrade\'s net price too ($' + good + '), the price the showroom\'s tile computes');
undo();

T.section('bought pieces work at the next sleep (night steps 6 and 7)');
s = game({ money: { cash: 100000 }, stats: { int: 50 } });
act('furniture.buy', { piece: 'books' });
T.eq(s.stats.int, 50, 'the books do nothing the day you buy them');
let rep = SR.rules.night.run(s, { rng: SR.rng.create(3), source: 'sim' }, { kind: 'sleep' });
T.eq(s.stats.int, 50 + TF.books.nightly.int, 'the next night: +' + TF.books.nightly.int + ' INT (B-08b)');
T.ok(rep && rep.lines && rep.lines.length > 0, 'the morning report is built');
const restore = (withBed) => {
  const st = game({ money: { cash: 100000 }, stats: { str: 85, hpMax: 100, hp: 1 } });
  if (withBed) act('furniture.buy', { piece: 'bed' });
  SR.rules.night.run(st, { rng: SR.rng.create(3), source: 'sim' }, { kind: 'sleep' });
  return st.stats.hp;
};
const hpMax = 100;
T.eq(restore(true) - restore(false), Math.floor(hpMax * (0.25 + TF.bed.sleep)) - Math.floor(hpMax * 0.25),
  'a bed bought today raises tonight\'s restore by floor(HP max × 0.10) (B-07)');
s = game({ money: { cash: 100000 } });
r = act('furniture.buy', { piece: 'books' });
T.eq(r.toasts.map((x) => [x.key, x.vars.name]), [['toast.furniture.nightly', 'Grand Atlas of Everything']], 'a stat piece: "it trains you every night from tonight"');
r = act('furniture.buy', { piece: 'tv' });
T.eq(r.toasts.map((x) => x.key), ['toast.furniture.home'], 'the TV: "waiting for you at home"');
T.eq([act('furniture.buy', { piece: 'freezer' }).toasts.map((x) => x.key), act('furniture.buy', { piece: 'satellite' }).toasts.map((x) => x.key)],
  [['toast.furniture.sleep'], ['toast.furniture.home']], 'the freezer restores more tonight; the satellite waits at home');
T.eq(r.events.filter((e) => e.name === 'buy').map((e) => e.payload), [{ item: 'tv', n: 1, where: 'furniture', price: 2500 }], 'the buy rule event');

// ------------------------------------------------------------------------------------------------
T.section('greetings, text and registrations');
const greetPawn = [
  [{}, 'greet.pawn.plain'],
  [{ items: { gun: 1, ammo: 0 } }, 'greet.pawn.ammo'],
  [{ stats: { karma: -60 } }, 'greet.pawn.evil'],
  [{ stats: { karma: 60 } }, 'greet.pawn.good'],
  [{ clock: { min: 1320 } }, 'greet.pawn.night'],
];
greetPawn.forEach(([patch, key]) => T.eq(SR.reg.fn['greet.pawn'](game(patch)).key, key, 'Vinnie: ' + key));
undo = flags({ shopsPlus: true });
T.eq(SR.reg.fn['greet.pawn'](game({ records: { jailDays: 5 } })).key, 'greet.pawn.vest', 'Vinnie suggests the vest after days in jail (shopsPlus)');
undo();
undo = flags({ weather: false });
T.eq(SR.reg.fn['greet.pawn'](game({ world: { weather: 'rain' } })).key, 'greet.pawn.plain', 'weather off (P1): no rain greeting, whatever the state holds');
undo();
undo = flags({ weather: true });
T.eq(SR.reg.fn['greet.pawn'](game({ world: { weather: 'rain' } })).key, 'greet.pawn.rain', 'weather on: Vinnie minds the puddles');
undo();

T.section('what the items do (pawn.use): the numbers the rules read');
const use = (id) => SR.reg.fn['pawn.use'](game(), {}, {}, id);
const TF8 = SR.tuning.fight;
T.eq([use('knife').vars.n, use('knuckles').vars.n], [TF8.moves.punch.knife, TF8.moves.punch.knuckles], 'knife and knuckles: the punch bonuses of B-13');
T.eq(use('alarm').vars.h, SR.tuning.time.alarmMinus / 60, 'the alarm: B-01 alarmMinus in hours (the night reads it)');
T.eq(use('gun').vars.n, SR.tuning.crime.store.requires.ammo, 'the gun: the hold-up\'s ammo (B-11b)');
T.eq(use('ammo').vars, { n: TI.ammo.per, max: TI.ammo.stack }, 'ammo: the box and the stack (B-06)');
undo = flags({ tours: false });
T.eq([use('vest').id, use('vest').vars.pct], ['vest', SR.text.pct(TF8.vest)], 'the vest: fights only while tours is off (the mugging half is P1 tours)');
undo();
undo = flags({ tours: true, shopsPlus: true });
T.eq([use('vest').id, use('vest').vars.mug], ['vestTours', SR.text.pct(SR.tuning.bus.mugLoss.vestCash)], 'with tours: a mugger takes only the B-12 vest share');
s = game({ money: { cash: 5000 } });
T.eq(act('pawn.vest').toasts.map((x) => x.key), ['toast.pawn.vestTours'], 'and the purchase toast says so');
undo();
T.eq(['knife', 'gun', 'ammo', 'alarm', 'phone', 'knuckles', 'vest', 'skateboard', 'shirt'].map((k) => use(k).id).concat(['vestTours'])
  .filter((k) => !SR.text.has('card.pawn.use.' + k)), [], 'every item has its use line');
[false, true].forEach((tours) => {
  undo = flags({ tours: tours });
  const unfilled = ['knife', 'gun', 'ammo', 'alarm', 'phone', 'knuckles', 'vest', 'skateboard', 'shirt'].map((k) => {
    const u = use(k);
    return [SR.text('card.pawn.use.' + u.id, u.vars), k === 'ammo' ? '' : SR.text('toast.pawn.' + u.id, u.vars)];
  }).reduce((a, b) => a.concat(b), []).filter((x) => /[{}⟦]/.test(x));
  T.eq(unfilled, [], 'every use line and toast has its numbers (tours ' + (tours ? 'on' : 'off') + ')');
  undo();
});
T.eq(['pawn', 'furniture'].map((b) => SR.reg.building[b].exteriorId), ['pawn', 'furniture'], 'the buildings name their exteriors (CONTRACT §3.1)');
const greetFurn = [
  [{}, 'greet.furniture.empty'],
  [{ furniture: { owned: { tv: 1 } } }, 'greet.furniture.plain'],
  [{ furniture: { owned: { bed: 1, tv: 1, pc: 1 } } }, 'greet.furniture.full'],
  [{ furniture: { owned: { tv: 1 } }, homes: { owned: ['apt', 'castle'], living: 'castle' } }, 'greet.furniture.castle'],
  [{ furniture: { owned: { tv: 1 } }, clock: { min: 1300 } }, 'greet.furniture.night'],
];
greetFurn.forEach(([patch, key]) => T.eq(SR.reg.fn['greet.furniture'](game(patch)).key, key, 'Sofia: ' + key));
const keys = [];
['pawn', 'furniture'].forEach((b) => {
  SR.rules.act.actions(b).forEach((id) => keys.push(SR.reg.action[id].label));
  ['plain', 'night', 'evil'].forEach((g) => keys.push('greet.' + b + '.' + g));
});
PIECES.concat(['satellite', 'pod', 'skydish', 'workstation', 'library', 'homegym', 'lounge', 'aquarium', 'freezerPlus', 'skydishBasic']).forEach((k) => keys.push('card.furniture.effect.' + k));
keys.push('card.furniture.preview', 'card.furniture.previewHint', 'card.furniture.previewHome');
keys.push('toast.pawn.vestTours', 'toast.furniture.stored', 'toast.furniture.sleep', 'toast.furniture.nightly', 'toast.furniture.home', 'card.pawn.sellConfirm', 'card.pawn.sellConfirmN', 'card.pawn.sellIntro', 'card.pawn.sellFor', 'card.pawn.sellEmpty');
['knife', 'gun', 'ammo', 'alarm', 'phone', 'knuckles', 'vest', 'skateboard', 'shirt'].forEach((k) => keys.push('card.pawn.use.' + k, k === 'ammo' ? 'card.pawn.haveMax' : 'toast.pawn.' + k));
T.eq(keys.filter((k) => !SR.text.has(k)), [], 'every key the goods name is registered (' + keys.length + ')');
T.ok(SR.rules.act.actions('pawn').concat(SR.rules.act.actions('furniture')).every((id) => SR.text(SR.reg.action[id].label).length <= 28), 'action labels are ≤ 28 characters');
T.eq(['pawn.shop', 'furniture.browse'].map((id) => [SR.registry.file('subscreen', id), SR.reg.subscreen[id].p, SR.reg.subscreen[id].title]),
  [['js/ui/subscreens/shop.js', 0, 'sub.pawn.shop'], ['js/ui/subscreens/furniture.js', 0, 'sub.furniture.browse']], 'the sub-screens are P0 in their frozen files');
T.eq(['pawn', 'furniture'].map((id) => [SR.reg.building[id].owner, SR.reg.building[id].interior, !!SR.reg.interior[id]]),
  [['vinnie', 'pawn', true], ['sofia', 'furniture', true]], 'the buildings: Vinnie and Sofia, and their interiors');

T.done();
