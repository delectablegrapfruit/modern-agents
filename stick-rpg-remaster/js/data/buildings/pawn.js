// js/data/buildings/pawn.js — owner: W2-Goods. The pawn shop (GDD §6.1, §6.2, §6.4; BALANCE B-06,
// B-28a): the building and Vinnie, one purchase row per item he sells, the counter (`pawn.shop`,
// js/ui/subscreens/shop.js), the P1 Sell action the counter commits, Vinnie's greeting and the
// named fns the rows use.
//
// Card rows (group buy, in GDD §6.1 order): pawn.knife, pawn.gun, pawn.ammo, pawn.alarm,
// pawn.phone (P0, orig); pawn.knuckles, pawn.vest, pawn.skateboard (P1 `shopsPlus`); pawn.shirt
// (P1 `arcs`, shown once Harold asks for it). Each row carries `item` (the Bag key it sells).
// pawn.counter (group services) opens the counter. pawn.sell ({ item }) is the counter's Sell tab
// commit (P1 `shopsPlus`); it is never a card row (hidden without params.item).
//
// Numbers: SR.tuning.items (B-06: price, per, stack, refuseAt, pawnBuyback, pawnBuybackSmooth) are
// read at run time through the named fns below (the load-time rule): the price is the row's cost
// (so B-28a's `item.pawn.<id>` modifiers apply through priceTarget), the stack check and the Bag
// are W2-RulesE's `items.room` / `items.buy` (ammo: 5 at a time, so refused at ≥ 95, orig). What
// an item does (`pawn.use`, for the toasts and the counter) quotes the tables the rules read.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // Vinnie suggests the vest once you have spent this many days in jail (GDD §6.2 "if you are jailed
  // often"): a greeting choice, so a presentation constant (CONTRACT D49), not a BALANCE number.
  var VEST_HINT_JAIL_DAYS = 3;
  // The night hours of the greeting: the ClockRing's shaded night, 20:00-06:00 (UI §2.3).
  var NIGHT_FROM = 1200, NIGHT_TO = 360;

  function items() { return SR.tuning.items; }
  /** @returns {string|null} the item a pawn row sells: the action's `item`, else params.item. */
  function itemOf(params, ctx) {
    var def = ctx && ctx.def;
    if (def && def.item) return def.item;
    return params && typeof params.item === 'string' ? params.item : null;
  }
  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  SR.def.building('pawn', {
    name: 'place.pawn', owner: 'vinnie', portrait: 'vinnie', music: 'pawnbroker_blues', interior: 'pawn',
    exteriorId: 'pawn', groups: ['buy', 'services'], greetings: ['greet.pawn.plain'],
  });

  /**
   * A purchase row: the B-06 price as the cost (named fn `pawn.price`, modifiers by
   * `item.pawn.<id>`), room in the Bag (`items.room`), then the item into the Bag with the `buy`
   * rule event (`items.buy`) and a one-line note on what it does (`pawn.note`).
   */
  function row(id, o) {
    var def = {
      building: 'pawn', group: 'buy', order: o.order, icon: o.icon || id, label: 'act.pawn.' + id, item: id,
      p: o.p || 0,
      cost: { cash: 'pawn.price' },
      priceTarget: 'item.pawn.' + id,
      requires: [['fn', 'items.room', id, 'pawn.per']].concat(o.requires || []),
      effects: [['fn', 'items.buy', id, 'pawn.per', 'pawn'], ['fn', 'pawn.note', id], ['sfx', 'purchase']],
    };
    if (o.feature) def.feature = o.feature;
    if (o.hidden) def.hidden = o.hidden;
    if (o.repeatable) def.repeatable = true;
    SR.def.action('pawn.' + id, def);
  }

  // P0 (orig): knife $100, hand gun $400, ammo 5 for $10 (max 99, refused at ≥ 95), CD alarm clock
  // $200, cell phone $200. Ammo repeats (R, hold): the other gear stacks to 1.
  row('knife', { order: 10 });
  row('gun', { order: 20 });
  row('ammo', { order: 30, repeatable: true });
  row('alarm', { order: 40 });
  row('phone', { order: 50, icon: 'cellphone' });
  // P1 `shopsPlus`: brass knuckles $300, kevlar vest $900, a used skateboard $300 "if you have none"
  // (the Pro Deck counts as a board).
  row('knuckles', { order: 60, p: 1, feature: 'shopsPlus' });
  row('vest', { order: 70, p: 1, feature: 'shopsPlus' });
  row('skateboard', { order: 80, p: 1, feature: 'shopsPlus', requires: [['noItem', 'prodeck']] });
  // P1 `arcs`: the clean shirt for Harold's comeback, $20, shown once he asks (B-26 harold.comeback).
  row('shirt', { order: 90, p: 1, feature: 'arcs', icon: 'shirt', hidden: [['not', ['fn', 'pawn.shirtAsked']]] });

  // The counter: every item with what it does, what you hold and (P1) the Sell tab.
  SR.def.action('pawn.counter', {
    building: 'pawn', group: 'services', order: 10, icon: 'shop', label: 'act.pawn.counter', p: 0,
    screen: 'pawn.shop',
  });

  // Sell (P1 `shopsPlus`): Vinnie buys back anything he sells at 40 % of its price (55 % with the
  // Smooth Talker perk; B-06 pawnBuyback), one item or one box of ammo at a time.
  // row: false (W2-Civic request 1, the lead's card.js): never a card row; until the card reads it,
  // `hidden` without params.item keeps it off the card.
  SR.def.action('pawn.sell', {
    building: 'pawn', group: 'services', order: 20, icon: 'sell', label: 'act.pawn.sell', p: 1, feature: 'shopsPlus', row: false,
    hidden: [['fn', 'pawn.noItem']],
    requires: [['fn', 'pawn.sellable']],
    effects: [['fn', 'pawn.sell'], ['sfx', 'coin']],
  });

  // ---- named fns --------------------------------------------------------------------------------

  /** Cost: the B-06 price of the row's item (the pipeline applies B-28a's modifiers). */
  SR.def.fn('pawn.price', function (s, params, ctx) {
    var row = items()[itemOf(params, ctx)];
    return row ? row.price : 0;
  });

  /** Count: the units one purchase adds (B-06 `per`: ammo 5, everything else 1). */
  SR.def.fn('pawn.per', function (s, params, ctx) {
    var row = items()[itemOf(params, ctx)];
    return row && row.per ? row.per : 1;
  });

  /**
   * What an item does, for the counter's detail line (`card.pawn.use.<id>`) and the purchase toast
   * (`toast.pawn.<id>`): `{ id, vars }` with the numbers from the tables the rules themselves read
   * (B-13 the knife and knuckles in a punch, the vest; B-01 the alarm; B-11b the hold-up's ammo;
   * B-06 the ammo box and the board's speed). The vest also halves what a mugger takes only while
   * P1 `tours` is on (js/rules/trade.js), so it then reads `vestTours`.
   * @returns {{id: string, vars: object}}
   */
  function use(id) {
    var row = items()[id] || {}, F = SR.tuning.fight;
    switch (id) {
      case 'knife': return { id: id, vars: { n: F.moves.punch.knife } };
      case 'knuckles': return { id: id, vars: { n: F.moves.punch.knuckles } };
      case 'gun': return { id: id, vars: { n: SR.tuning.crime.store.requires.ammo } };
      case 'ammo': return { id: id, vars: { n: row.per, max: row.stack } };
      case 'alarm': return { id: id, vars: { h: Math.round(SR.tuning.time.alarmMinus / 60) } };
      case 'vest':
        if (SR.features.tours) return { id: 'vestTours', vars: { pct: SR.text.pct(F.vest), mug: SR.text.pct(SR.tuning.bus.mugLoss.vestCash) } };
        return { id: id, vars: { pct: SR.text.pct(F.vest) } };
      case 'skateboard': return { id: id, vars: { n: row.speed } };
      default: return { id: id, vars: {} };
    }
  }

  /** `pawn.use` for the UI (js/ui/subscreens/shop.js): the item is the argument or params.item. */
  SR.def.fn('pawn.use', function (s, params, ctx, id) { return use(id || (params && params.item)); });

  /**
   * Effect ['fn', 'pawn.note', id]: the toast that says what a one-off item does (`pawn.use`); ammo,
   * the repeatable row, has none.
   */
  SR.def.fn('pawn.note', function (s, params, ctx, id) {
    if (id === 'ammo' || !SR.reg.action['pawn.' + id]) return null;
    var u = use(id);
    return { toasts: [{ key: 'toast.pawn.' + u.id, vars: u.vars, kind: 'info' }] };
  });

  /**
   * Condition: Harold has asked for the clean shirt (B-26 harold.comeback: after 5 gifts of $10 and
   * one takeout; not once he has it, nor on the barfly branch, which closes the comeback).
   */
  SR.def.fn('pawn.shirtAsked', function (s) {
    var h = s.npc && s.npc.harold, cb = SR.tuning.street.harold.comeback;
    if (!h || h.shirt || h.branch === 'barfly') return no('reason.notYet');
    return (h.gave10 || 0) >= cb.give10s && (h.takeout || 0) >= cb.takeouts ? { ok: true } : no('reason.notYet');
  });

  /** Condition (for `hidden`): no item named, so the Sell action is not a card row. */
  SR.def.fn('pawn.noItem', function (s, params) {
    return params && typeof params.item === 'string' && params.item ? no('reason.unavailable') : { ok: true };
  });

  /** @returns {string[]} the Bag keys Vinnie sells (and so buys back): the `item` of every pawn row. */
  function sold() {
    var out = [];
    SR.registry.entries('action').forEach(function (e) {
      if (e.def.building === 'pawn' && e.def.item) out.push(e.def.item);
    });
    return out;
  }

  /** @returns {{n: number, price: number}} what one sale of an item hands over and pays (B-06). */
  function sale(s, id) {
    var t = items(), row = t[id] || {}, per = row.per || 1;
    var n = Math.min(per, SR.rules.conditions.count(s, id));
    var rate = SR.rules.perks && SR.rules.perks.has(s, 'smoothTalker') ? t.pawnBuybackSmooth : t.pawnBuyback;
    return { n: n, price: Math.max(0, Math.floor((row.price || 0) * rate * n / per + 0.5)) };
  }

  /** Condition: params.item is something Vinnie sells and you hold one of. */
  SR.def.fn('pawn.sellable', function (s, params) {
    var id = params && params.item;
    if (sold().indexOf(id) < 0) return no('reason.unavailable');
    if (SR.rules.conditions.count(s, id) < 1) return no('reason.needItem', { item: SR.rules.conditions.nameOf('item', id) });
    return { ok: true };
  });

  /**
   * Effect: sells one of params.item (ammo: one box of 5, or what is left) for 40 % of its B-06
   * price (55 % with Smooth Talker), raising the `sell` rule event.
   */
  SR.def.fn('pawn.sell', function (s, params, ctx) {
    var id = params && params.item;
    var d = sale(s, id);
    if (d.n < 1) return no('reason.needItem', { item: SR.rules.conditions.nameOf('item', id) });
    var r = SR.rules.effects.run(s, [['item', id, -d.n], ['cash', d.price]], ctx);
    if (r.ok === false) return r;
    r.events = (r.events || []).concat([{ name: 'sell', payload: { item: id, n: d.n, where: 'pawn', price: d.price } }]);
    return r;
  });

  /**
   * Vinnie's greeting (UI §5.6: by time, karma, weather and what you carry; GDD §6.2: he suggests
   * the vest if you are jailed often). Returns a key; array keys pick a variant.
   */
  SR.def.fn('greet.pawn', function (s) {
    var it = s.items || {}, st = s.stats || {}, K = SR.tuning.karma.tiers;
    if (SR.features.shopsPlus && !it.vest && ((s.records && s.records.jailDays) || 0) >= VEST_HINT_JAIL_DAYS) return { key: 'greet.pawn.vest' };
    if (it.gun && (it.ammo || 0) < SR.tuning.crime.store.requires.ammo) return { key: 'greet.pawn.ammo' };
    if (st.karma <= K.bad) return { key: 'greet.pawn.evil' };
    if (st.karma >= K.good) return { key: 'greet.pawn.good' };
    // weather is P1: without its flag the sky stays clear (conditions.js reads it the same way)
    if (SR.features.weather && s.world && s.world.weather === 'rain') return { key: 'greet.pawn.rain' };
    if (s.clock && (s.clock.min >= NIGHT_FROM || s.clock.min < NIGHT_TO)) return { key: 'greet.pawn.night' };
    return { key: 'greet.pawn.plain' };
  });
})();
