// js/rules/homes.js — owner: W1-E. SR.rules.homes: buying, selling, moving in and letting homes,
// furniture slots, tier-2 upgrades, storage, the sleep bonus, TV channels, home doors and the
// net-worth values of homes and furniture (BALANCE B-08; GDD §4.15; ARCHITECTURE §8.4).
// Pure. Numbers: SR.tuning.homes (B-08a), SR.tuning.furniture (B-08b), SR.tuning.sleep (B-07),
// SR.tuning.endgame (B-18).
// Furniture state: furniture.owned[baseId] = tier (1 | 2), keyed by the tier-1 id; storage lists
// the base ids of pieces that don't fit the home you live in (they do nothing).
(function () {
  'use strict';
  var SR = window.SR;

  function TH() { return SR.tuning.homes; }
  function TF() { return SR.tuning.furniture; }
  function refuse(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function delta(kind, key, from, to) { var d = { kind: kind, n: to - from, from: from, to: to }; if (key) d.key = key; return d; }
  function feature(def) { return !def.feature || !!SR.features[def.feature]; }

  /** @returns {string[]} the tier-1 furniture ids in their display order. */
  function bases() {
    return Object.keys(SR.reg.furniture).filter(function (id) { return SR.reg.furniture[id].tier === 1; })
      .sort(function (a, b) { return SR.reg.furniture[a].order - SR.reg.furniture[b].order; });
  }
  /** @returns {string} the furniture id of a base piece at a tier ('bed', 2 → 'pod'). */
  function tierId(base, tier) {
    var def = SR.reg.furniture[base];
    return tier === 2 && def && def.upgrade ? def.upgrade : base;
  }
  /** @returns {number} the slots a piece uses (tuning; the P0 satellite uses none). */
  function slotSize(id) { return TF()[id] ? TF()[id].slots : 0; }
  /** @returns {number} the price of a piece at its tier. */
  function priceOf(id) { return TF()[id] ? TF()[id].price : 0; }
  /** @returns {object} a price through the price modifiers of B-28a (W1-R's pipeline), or the base. */
  function modPrice(s, base, target, ctx) {
    if (SR.rules.act && typeof SR.rules.act.price === 'function') return SR.rules.act.price(s, base, target, ctx || {});
    return { price: base, applied: [], consumes: null };
  }

  var homes = {
    tierId: tierId,

    /** @returns {string[]} the home ids whose door is doorId, in tier order (ARCHITECTURE §8.4). */
    doorHomes: function (doorId) {
      return Object.keys(SR.reg.home).filter(function (id) { return SR.reg.home[id].door === doorId; })
        .sort(function (a, b) { return SR.reg.home[a].order - SR.reg.home[b].order; });
    },

    /** @returns {number} the furniture slots of the home you live in. */
    slots: function (s) { return TH()[s.homes.living].slots; },

    /** @returns {number} the slots used by the pieces that are not in storage. */
    slotsUsed: function (s) {
      var own = s.furniture.owned, store = s.furniture.storage || [];
      return Object.keys(own).reduce(function (a, b) {
        return store.indexOf(b) >= 0 ? a : a + slotSize(tierId(b, own[b]));
      }, 0);
    },

    /** @returns {number} free slots in the home you live in. */
    freeSlots: function (s) { return homes.slots(s) - homes.slotsUsed(s); },

    /**
     * @returns {number} the tier of a base piece if you own it and it is in use (not in storage;
     *   the satellite also needs the TV in use), else 0
     */
    has: function (s, base) {
      var t = s.furniture.owned[base] || 0;
      if (!t || (s.furniture.storage || []).indexOf(base) >= 0) return 0;
      var def = SR.reg.furniture[base];
      if (def && def.needs && !homes.has(s, def.needs)) return 0;
      return t;
    },

    /** @returns {object[]} every owned piece (storage included): { id, base, tier, price, slots, active }. */
    pieces: function (s) {
      var own = s.furniture.owned;
      return Object.keys(own).map(function (b) {
        var id = tierId(b, own[b]);
        return { id: id, base: b, tier: own[b], price: priceOf(id), slots: slotSize(id), active: homes.has(s, b) > 0 };
      });
    },

    /** Removes a piece you own (seizure, donation). @returns {boolean} */
    removePiece: function (s, base) {
      if (!s.furniture.owned[base]) return false;
      delete s.furniture.owned[base];
      s.furniture.storage = (s.furniture.storage || []).filter(function (b) { return b !== base; });
      return true;
    },

    /**
     * Refills the slots of the home you live in: pieces in display order until the slots are full;
     * the rest go to storage (GDD §4.15: furniture moves with you).
     * @returns {string[]} the storage list
     */
    restock: function (s) {
      var free = homes.slots(s), store = [];
      bases().forEach(function (b) {
        var t = s.furniture.owned[b];
        if (!t) return;
        var size = slotSize(tierId(b, t));
        if (size <= free) free -= size; else store.push(b);
      });
      s.furniture.storage = store;
      return store;
    },

    /**
     * The sleep bonus of the home you live in (B-07): bed +0.10 / +0.20, freezer +0.05, home
     * +0 .. +0.20.
     * @returns {{bed: number, freezer: number, home: number, total: number}}
     */
    sleepBonus: function (s) {
      var S = SR.tuning.sleep;
      var out = { bed: S.bed[homes.has(s, 'bed')] || 0, freezer: homes.has(s, 'freezer') ? S.freezer : 0,
        home: S.home[s.homes.living] || 0 };
      out.total = out.bed + out.freezer + out.home;
      return out;
    },

    /**
     * The TV channels you can watch at home (GDD §6.1): News with the TV; Fitness and Dating with
     * the P0 satellite or the SkyDish; Market Watch with the SkyDish (P1 `stockTips`).
     * @returns {{news: boolean, fitness: boolean, dating: boolean, market: boolean}}
     */
    channels: function (s) {
      var out = { news: false, fitness: false, dating: false, market: false };
      ['tv', 'satellite'].forEach(function (base) {
        var t = homes.has(s, base);
        if (!t) return;
        (TF()[tierId(base, t)].channels || []).forEach(function (c) { out[c] = true; });
      });
      if (!SR.features.stockTips) out.market = false;
      return out;
    },

    /**
     * Tonight's furniture gains (night step 7): every piece in use with a nightly stat gain (B-08b:
     * +2 a night per tier-1 piece, +4 per tier-2), in display order.
     * @returns {{id: string, base: string, stat: string, n: number}[]}
     */
    nightly: function (s) {
      var out = [];
      bases().forEach(function (b) {
        var t = homes.has(s, b);
        if (!t) return;
        var id = tierId(b, t), g = TF()[id] && TF()[id].nightly;
        if (g) Object.keys(g).forEach(function (stat) { out.push({ id: id, base: b, stat: stat, n: g[stat] }); });
      });
      return out;
    },

    /**
     * The home perk you can use: the one of the home you live in (GDD §4.15; owning several homes
     * does not give several perks).
     * @returns {{home: string, id: string, action: string}|null}
     */
    perk: function (s) {
      var id = s.homes.living, row = TH()[id], def = SR.reg.home[id];
      if (!row || !row.perk || !def) return null;
      return { home: id, id: row.perk.id, action: def.perk };
    },

    /**
     * Whether a home's perk can be used now (P1 `homesPlus`): only in the home you live in, once a
     * day across all homes (daily.homePerk), the party once a calendar week (weekly.party).
     * @returns {{ok: boolean, reason?: string}}
     */
    perkOk: function (s, homeId) {
      if (!SR.features.homesPlus) return refuse('reason.featureOff');
      if (s.homes.living !== homeId) return refuse('reason.notLivingHere');
      var row = TH()[homeId];
      if (!row || !row.perk) return refuse('reason.unavailable');
      if ((s.daily.homePerk || 0) >= 1) return refuse('reason.dailyLimit');
      if (row.perk.every === 'week' && (s.weekly.party || 0) >= 1) return refuse('reason.weeklyLimit');
      return { ok: true };
    },

    /**
     * Uses the perk of the home you live in (its time and cash are the action's costs): the stat
     * gains ('reward': the degree bonus, not Winded), HP and karma of B-08a, and the counters.
     * @returns {{ok: boolean, reason?: string, events?: object[]}}
     */
    usePerk: function (s) {
      var id = s.homes.living, ok = homes.perkOk(s, id);
      if (!ok.ok) return ok;
      var p = TH()[id].perk;
      ['str', 'int', 'cha'].forEach(function (k) { if (p[k]) SR.rules.stats.add(s, k, p[k], 'reward'); });
      if (p.hp) SR.rules.stats.heal(s, p.hp);
      if (p.karma) SR.rules.stats.karma(s, p.karma);
      s.daily.homePerk = (s.daily.homePerk || 0) + 1;
      if (p.every === 'week') s.weekly.party = (s.weekly.party || 0) + 1;
      return { ok: true, perk: p.id };
    },

    /** @returns {number} the nightly rent of a let home: 0.6 % of its price (B-08a). */
    rentOf: function (id) { return TH()[id].rent; },

    /** @returns {number} the sale price of a home: 90 % (B-08a). */
    saleOf: function (id) { return TH()[id].sell; },

    /** @returns {{id: string, amount: number}[]} tonight's rents (the let homes you own). */
    rents: function (s) {
      var lets = s.homes.lets || {};
      return Object.keys(lets).filter(function (id) { return s.homes.owned.indexOf(id) >= 0 && id !== s.homes.living; })
        .sort(function (a, b) { return SR.reg.home[a].order - SR.reg.home[b].order; })
        .map(function (id) { return { id: id, amount: homes.rentOf(id) }; });
    },

    /** @returns {number} net-worth value of the homes you own (× 0.9, B-18). */
    homesValue: function (s) {
      var k = SR.tuning.endgame.netWorth.homes;
      return s.homes.owned.reduce(function (a, id) { return a + Math.floor(TH()[id].price * k); }, 0);
    },

    /** @returns {number} net-worth value of the furniture you own, storage included (× 0.25, B-18). */
    furnitureValue: function (s) {
      var k = SR.tuning.endgame.netWorth.furniture;
      return homes.pieces(s).reduce(function (a, p) { return a + Math.floor(p.price * k); }, 0);
    },

    /**
     * Buys a home (the Real Estate desk or a For Sale sign's Tour): cash first, then the bank. It
     * does not move you in (GDD §4.15).
     * @returns {{ok: boolean, reason?: string, vars?: object, price?: number, events?: object[], log?: object[], deltas?: object[]}}
     */
    buy: function (s, id) {
      var row = TH()[id];
      if (!row || !SR.reg.home[id]) return refuse('reason.noHome');
      if (s.homes.owned.indexOf(id) >= 0) return refuse('reason.owned');
      var price = row.price, m = s.money;
      if (m.cash + m.bank < price) return refuse('reason.needCash', { n: price, money: SR.text.money(price), have: m.cash + m.bank });
      var c0 = m.cash, b0 = m.bank;
      var fromCash = Math.min(m.cash, price);
      m.cash -= fromCash;
      m.bank -= price - fromCash;
      s.homes.owned.push(id);
      s.records.spent = (s.records.spent || 0) + price;
      // The log entry is delivered by the pipeline's merge (SR.rules.effects.merge).
      var out = { ok: true, price: price, deltas: [], log: [{ kind: id === 'castle' ? 'castleBought' : 'homeBought', vars: { home: id, name: SR.text('home.' + id) } }],
        events: [{ name: 'buy', payload: { item: id, n: 1, where: 'bank', price: price } }, { name: 'home', payload: { kind: 'buy', id: id } }] };
      if (m.cash !== c0) out.deltas.push(delta('cash', null, c0, m.cash));
      if (m.bank !== b0) out.deltas.push(delta('bank', null, b0, m.bank));
      out.deltas.push({ kind: 'home', key: id, n: 1, from: 0, to: 1 });
      return out;
    },

    /**
     * Sells a home you own and don't live in at 90 %, into the bank (P1 `homesPlus`).
     * @returns {{ok: boolean, reason?: string, price?: number, events?: object[], deltas?: object[]}}
     */
    sell: function (s, id) {
      if (!SR.features.homesPlus) return refuse('reason.featureOff');
      if (s.homes.owned.indexOf(id) < 0) return refuse('reason.notOwned');
      if (s.homes.living === id) return refuse('reason.livingHere');
      if (!(TH()[id].price > 0)) return refuse('reason.cantSell');
      var price = homes.saleOf(id), b0 = s.money.bank;
      s.homes.owned = s.homes.owned.filter(function (h) { return h !== id; });
      if (s.homes.lets) delete s.homes.lets[id];
      s.money.bank += price;
      return { ok: true, price: price, deltas: [delta('bank', null, b0, s.money.bank), { kind: 'home', key: id, n: -1, from: 1, to: 0 }],
        events: [{ name: 'sell', payload: { item: id, n: 1, where: 'bank', price: price } }, { name: 'home', payload: { kind: 'sell', id: id } }] };
    },

    /**
     * Moves into a home you own (free and instant): ends its let, then refills the slots (pieces
     * that don't fit go to storage).
     * @returns {{ok: boolean, reason?: string, storage?: string[], events?: object[]}}
     */
    moveIn: function (s, id) {
      if (s.homes.owned.indexOf(id) < 0) return refuse('reason.notOwned');
      if (s.homes.living === id) return refuse('reason.livingHere');
      if (s.homes.lets) delete s.homes.lets[id];
      s.homes.living = id;
      var store = homes.restock(s);
      return { ok: true, storage: store, events: [{ name: 'home', payload: { kind: 'moveIn', id: id } }],
        toasts: store.length ? [{ key: 'toast.homes.storage', vars: { n: store.length }, kind: 'info' }] : [] };
    },

    /** Lets out a home you own but don't live in (P1 `homesPlus`); rent is paid at night. */
    letOut: function (s, id) {
      if (!SR.features.homesPlus) return refuse('reason.featureOff');
      if (s.homes.owned.indexOf(id) < 0) return refuse('reason.notOwned');
      if (s.homes.living === id) return refuse('reason.livingHere');
      if (!(TH()[id].price > 0)) return refuse('reason.cantLet');
      s.homes.lets = s.homes.lets || {};
      if (s.homes.lets[id] !== undefined) return refuse('reason.let');
      s.homes.lets[id] = s.clock.day;
      return { ok: true, rent: homes.rentOf(id), events: [{ name: 'home', payload: { kind: 'let', id: id } }] };
    },

    /** Ends a let (P1 `homesPlus`). */
    endLet: function (s, id) {
      if (!SR.features.homesPlus) return refuse('reason.featureOff');
      if (!s.homes.lets || s.homes.lets[id] === undefined) return refuse('reason.notLet');
      delete s.homes.lets[id];
      return { ok: true, events: [{ name: 'home', payload: { kind: 'endLet', id: id } }] };
    },

    /**
     * Buys a tier-1 piece (or the P0 satellite) at Fine Line or from the Workstation catalogue
     * (P1, × 1.10 delivery): it needs a free slot ("Needs a free slot"), cash, and the TV for the
     * satellite. Price modifiers of B-28a apply (`furniture.<id>` / `catalogue.<id>`).
     * @param {object=} opts { where: 'furniture' | 'catalogue', ctx }
     * @returns {{ok: boolean, reason?: string, vars?: object, price?: number, events?: object[], deltas?: object[]}}
     */
    buyFurniture: function (s, id, opts) {
      opts = opts || {};
      var def = SR.reg.furniture[id];
      if (!def || def.tier !== 1 || !TF()[id]) return refuse('reason.noPiece');
      if (!feature(def)) return refuse('reason.featureOff');
      if (s.furniture.owned[id]) return refuse('reason.owned');
      if (def.needs && !s.furniture.owned[def.needs]) return refuse('reason.needPiece', { name: SR.text('furn.' + def.needs) });
      if (slotSize(id) > homes.freeSlots(s)) return refuse('reason.needSlot');
      var where = opts.where === 'catalogue' ? 'catalogue' : 'furniture';
      if (where === 'catalogue' && !SR.features.homesPlus) return refuse('reason.featureOff');
      var p = modPrice(s, priceOf(id), where + '.' + id, opts.ctx);
      if (p.price > s.money.cash) return refuse('reason.needCash', { n: p.price, money: SR.text.money(p.price), have: s.money.cash });
      var c0 = s.money.cash;
      s.money.cash -= p.price;
      s.furniture.owned[id] = 1;
      s.records.spent = (s.records.spent || 0) + p.price;
      return { ok: true, price: p.price, applied: p.applied,
        deltas: [delta('cash', null, c0, s.money.cash), { kind: 'furniture', key: id, n: 1, from: 0, to: 1 }],
        events: [{ name: 'buy', payload: { item: id, n: 1, where: where, price: p.price } }] };
    },

    /**
     * Upgrades a tier-1 piece to its tier 2 (P1 `homesPlus`): pays the tier-2 price minus 50 % of
     * the tier-1 price; a piece in use needs room for any extra slot.
     * @param {string} id the tier-1 id ('bed') or the tier-2 id ('pod')
     * @returns {{ok: boolean, reason?: string, price?: number, events?: object[], deltas?: object[]}}
     */
    upgrade: function (s, id, opts) {
      opts = opts || {};
      var def = SR.reg.furniture[id];
      if (!def) return refuse('reason.noPiece');
      var base = def.base, up = SR.reg.furniture[base] && SR.reg.furniture[base].upgrade;
      if (!SR.features.homesPlus || !up) return refuse('reason.featureOff');
      var tier = s.furniture.owned[base] || 0;
      if (!tier) return refuse('reason.needPiece', { name: SR.text('furn.' + base) });
      if (tier >= 2) return refuse('reason.maxTier');
      var inUse = (s.furniture.storage || []).indexOf(base) < 0;
      if (inUse && slotSize(up) - slotSize(base) > homes.freeSlots(s)) return refuse('reason.needSlot');
      var net = priceOf(up) - Math.floor(priceOf(base) * TF().upgradeCredit);
      var p = modPrice(s, net, 'furniture.' + up, opts.ctx);
      if (p.price > s.money.cash) return refuse('reason.needCash', { n: p.price, money: SR.text.money(p.price), have: s.money.cash });
      var c0 = s.money.cash;
      s.money.cash -= p.price;
      s.furniture.owned[base] = 2;
      s.records.spent = (s.records.spent || 0) + p.price;
      return { ok: true, price: p.price,
        deltas: [delta('cash', null, c0, s.money.cash), { kind: 'furniture', key: base, n: 1, from: 1, to: 2 }],
        events: [{ name: 'buy', payload: { item: up, n: 1, where: 'furniture', price: p.price } }] };
    },
  };

  SR.rules.homes = homes;

  // --- named functions for the Real Estate desk, the home doors and Fine Line ---
  function res(r) { return r.ok ? r : { ok: false, reason: r.reason, vars: r.vars }; }
  function pid(params, arg, key) { return arg !== undefined ? arg : params && (params[key] !== undefined ? params[key] : params.id); }
  SR.def.fn('homes.buy', function (s, params, ctx, id) { return res(homes.buy(s, pid(params, id, 'homeId'))); });
  SR.def.fn('homes.sell', function (s, params, ctx, id) { return res(homes.sell(s, pid(params, id, 'homeId'))); });
  SR.def.fn('homes.moveIn', function (s, params, ctx, id) { return res(homes.moveIn(s, pid(params, id, 'homeId'))); });
  SR.def.fn('homes.letOut', function (s, params, ctx, id) { return res(homes.letOut(s, pid(params, id, 'homeId'))); });
  SR.def.fn('homes.endLet', function (s, params, ctx, id) { return res(homes.endLet(s, pid(params, id, 'homeId'))); });
  SR.def.fn('homes.buyFurniture', function (s, params, ctx, id) {
    return res(homes.buyFurniture(s, pid(params, id, 'piece'), { where: params && params.where, ctx: ctx }));
  });
  SR.def.fn('homes.upgrade', function (s, params, ctx, id) { return res(homes.upgrade(s, pid(params, id, 'piece'), { ctx: ctx })); });
  /** Condition: the perk of params.homeId (or the argument) can be used now. */
  SR.def.fn('homes.perkHere', function (s, params, ctx, id) { return homes.perkOk(s, pid(params, id, 'homeId')); });
  /** Effect: use the perk of the home you live in. */
  SR.def.fn('homes.usePerk', function (s) { return res(homes.usePerk(s)); });
  /** Condition: the piece would fit ("Needs a free slot"). */
  SR.def.fn('homes.fits', function (s, params, ctx, id) {
    id = pid(params, id, 'piece');
    return (TF()[id] ? TF()[id].slots : 0) <= homes.freeSlots(s) ? { ok: true } : refuse('reason.needSlot');
  });
})();
