// js/data/actions/phone.js — owner: W2-Pocket (W3-Econ in wave 3). The cell phone's apps and
// contacts (UI §5.9; GDD §4.18, §6.2): every call is an action run through SR.act from the
// Pocket's Phone tab (js/ui/pocket/phone.js), and every contact is an SR.def.contact
// `{ id, name, role, unlock: [conds], actions: [actionIds], p, feature }` (ARCHITECTURE §7).
// Everything here is P1: the Phone tab and its apps are `phone`; a contact with a flag of its own
// (the lawyer and McHolland `police`, the realty `homesPlus`, Red `arcs`, the buyers `tours`) hides
// with that flag. Every call needs a phone (the `phone` condition).
//   Apps: the Cab (W2-City's world.cab through SR.world.cab(door)), Stocks (home.stocks with the
//   Workstation), Contacts, the Car (phone.summon: your car to the nearest road cell, free),
//   Settings and Save (UI hand-offs to W2-Front's scenes).
//   Contact fields beyond ARCHITECTURE §7: `role` (a text key under the name), `app` (the app a
//   call opens: Sky Cabs → the Cab app), `waypoint` (a worldmap spot the call pins: Red's alley),
//   `nameVars` / `roleVars` ([fnName, ...args]: a named fn giving the name's or the role's vars: a
//   buyer's city, the cab fare).
// Numbers: SR.tuning.civic.mchollandTip (B-27), tuning.election (B-17), tuning.bus (B-12).
// Pure data and named fns (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var BUYERS = 5;   // B-12 `buyerVoicemail.buyers` (orig: five buyers); the defs are listed per buyer
  // The buyer's words for today's demand (B-12 demandDaily, rand(85..115) / 100): the top, middle
  // and bottom thirds of that range. Presentation only; the price itself is the rules'.
  var DEMAND_HIGH = 1.05, DEMAND_LOW = 0.95;

  function no(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function yes() { return { ok: true }; }
  function money(n) { return SR.text.money(n); }

  /** @returns {object|null} the buyer's voicemail (trip.vm.buyer<n>), which names their city. */
  function buyerMsg(s, n) {
    var from = 'buyer' + n;
    for (var i = s.msgs.length - 1; i >= 0; i--) if (s.msgs[i] && s.msgs[i].from === from) return s.msgs[i];
    return null;
  }
  /** @returns {string|null} the city id whose display name the buyer's voicemail carries. */
  function buyerCity(s, n) {
    var m = buyerMsg(s, n), name = m && m.vars ? m.vars.city : null;
    if (!name) return null;
    var ids = Object.keys(SR.reg.city || {});
    for (var i = 0; i < ids.length; i++) if (SR.text('city.' + ids[i] + '.name') === name || ids[i] === name) return ids[i];
    return null;
  }

  // ---- named fns (CONTRACT §8.5) ------------------------------------------------------------------

  /** Cost: minutes of a call (McHolland's tip by phone: B-27 `civic.mchollandTip.min`). @returns {number} */
  SR.def.fn('phone.min', function (s, params, ctx) {
    return ctx && ctx.id === 'phone.mcholland' ? SR.tuning.civic.mchollandTip.min : 0;
  });

  /** Condition: you own a car that is not at the tow lot and not the one you are driving. */
  SR.def.fn('phone.hasCar', function (s, params) {
    var cars = s.player && s.player.cars, want = params && params.car;
    var ids = want ? [want] : ['junker', 'sports'];
    for (var i = 0; i < ids.length; i++) {
      var row = cars && cars[ids[i]];
      if (row && row.owned && !row.towed && s.player.driving !== ids[i]) return yes();
    }
    return no('reason.unavailable');
  });

  /**
   * Effect: Summon car (GDD §4.18): the car appears where the phone says, the nearest road cell,
   * which the UI finds from the world geometry and passes as params { car, x, y, a }.
   * @returns {object} a partial Result
   */
  SR.def.fn('phone.summon', function (s, params) {
    var p = params || {}, cars = s.player.cars;
    var id = p.car && cars[p.car] ? p.car : cars.sports && cars.sports.owned && !cars.sports.towed ? 'sports' : 'junker';
    var row = cars[id];
    if (!row || !row.owned || row.towed || s.player.driving === id) return no('reason.unavailable');
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y)) return no('reason.unavailable');
    row.x = Math.round(p.x);
    row.y = Math.round(p.y);
    row.a = typeof p.a === 'number' && isFinite(p.a) ? Math.round(p.a * 1000) / 1000 : row.a;
    return { toasts: [{ key: 'toast.phone.summoned', vars: {}, kind: 'info' }] };
  });

  /** Role vars: the cab fare (W2-City's world.cab; tuning `world.cab.cash`). @returns {{money: string}} */
  SR.def.fn('phone.fare', function () {
    return { money: money(SR.tuning.world.cab.cash) };
  });

  /** Condition: Red's number is in your phone after your first gram, until he is turned in. */
  SR.def.fn('phone.redKnown', function (s) {
    var d = s.npc.dealer || {};
    return (d.bought || 0) > 0 && !d.turnedInDay ? yes() : no('reason.notYet');
  });

  /** Effect: "Where you at?": what you owe Red and when (the UI pins Dealer Alley). */
  SR.def.fn('phone.redInfo', function (s) {
    var c = (s.npc.dealer || {}).credit;
    if (c && c.owed) return { toasts: [{ key: 'toast.phone.red', vars: { money: money(c.owed), day: c.dueDay }, kind: 'info' }] };
    return { toasts: [{ key: 'toast.phone.redNone', vars: {}, kind: 'info' }] };
  });

  /** Condition: buyer n left you a voicemail (trade.take's 50 % chance, orig). */
  SR.def.fn('phone.buyerKnown', function (s, params, ctx, n) {
    var b = s.trade && s.trade.buyers;
    return b && b[(n || 1) - 1] ? yes() : no('reason.notYet');
  });

  /** Name vars: the buyer's city. @returns {{city: string}} */
  SR.def.fn('phone.buyerName', function (s, params, ctx, n) {
    var id = buyerCity(s, n || 1);
    return { city: id ? SR.text('city.' + id + '.name') : '?' };
  });

  /** Effect: a buyer's demand hint for their city today (B-12 daily demand; P1 `tours`). */
  SR.def.fn('phone.buyerInfo', function (s, params, ctx, n) {
    var id = buyerCity(s, n || 1), T = SR.rules.trade;
    var d = id && T && typeof T.dailyDemand === 'function' ? T.dailyDemand(s, id) : 1;
    var hint = d >= DEMAND_HIGH ? 'high' : d <= DEMAND_LOW ? 'low' : 'normal';
    return { toasts: [{ key: 'toast.phone.buyer', vars: { name: SR.text('contact.buyer.name', { city: id ? SR.text('city.' + id + '.name') : '?' }),
      city: id ? SR.text('city.' + id + '.name') : '?', demand: SR.text('toast.phone.demand.' + hint) }, kind: 'info' }] };
  });

  /**
   * Effect: the Electoral Board reads the acceptance deadline and the smallest war chest (B-17).
   * The day is SR.rules.election.acceptBy (the last day the offer can be accepted, the day whose
   * night lapses it), the one the Board's voicemail, Clerk Plume and the Election Office name.
   */
  SR.def.fn('phone.boardInfo', function (s) {
    var E = SR.tuning.election, day = SR.rules.election && SR.rules.election.acceptBy ? SR.rules.election.acceptBy(s) : null;
    if (s.election.status !== 'nominated' || day == null) return { toasts: [{ key: 'toast.phone.boardNone', vars: {}, kind: 'info' }] };
    return { toasts: [{ key: 'toast.phone.board', vars: { day: day, money: money(E.warChest[0].cash) }, kind: 'info' }] };
  });

  // ---- actions (building 'phone': the Phone tab runs them) -----------------------------------------

  /** A phone call: needs a phone; free unless it says so; never a repeat. */
  function call(id, o) {
    var def = {
      building: 'phone', group: o.group || 'services', order: o.order, icon: o.icon, label: o.label || 'act.' + id, p: 1, feature: o.feature,
      requires: [['phone']].concat(o.requires || []),
      effects: o.effects || [],
    };
    if (o.desc) def.desc = o.desc;
    if (o.cost) def.cost = o.cost; else def.timeRule = 'free';
    if (o.screen) def.screen = o.screen;
    if (o.timeRule) def.timeRule = o.timeRule;
    SR.def.action(id, def);
  }

  // Apps.
  call('phone.summon', { order: 10, icon: 'car', feature: 'phone', desc: 'desc.phone.summon',
    requires: [['fn', 'phone.hasCar']], effects: [['fn', 'phone.summon'], ['sfx', 'ignition']] });
  call('phone.stocks', { order: 20, icon: 'workstation', feature: 'phone', desc: 'desc.phone.stocks',
    requires: [['furniture', 'workstation']], screen: 'home.stocks' });

  // Contacts' calls.
  call('phone.bail', { order: 30, icon: 'bail', label: 'act.phone.bail', feature: 'police', group: 'crime',
    requires: [['fn', 'crime.canBail']], effects: [['fn', 'crime.payBail']] });
  call('phone.lawyer', { order: 31, icon: 'phone', feature: 'police',
    effects: [['toast', 'toast.phone.lawyer', {}, 'info'], ['sfx', 'phone_ring']] });
  call('phone.realty', { order: 40, icon: 'realestate', feature: 'homesPlus', screen: 'bank.realestate' });
  call('phone.red', { order: 50, icon: 'dealer', feature: 'arcs',
    requires: [['fn', 'phone.redKnown']], effects: [['fn', 'phone.redInfo'], ['sfx', 'phone_ring']] });
  call('phone.mcholland', { order: 60, icon: 'precinct', feature: 'police', cost: { min: 'phone.min' },
    requires: [['npcStage', 'mcholland', 'informant']], effects: [['fn', 'crime.mchollandTip']] });
  for (var n = 1; n <= BUYERS; n++) {
    call('phone.buyer' + n, { order: 70 + n, icon: 'city', label: 'act.phone.buyer', feature: 'tours',
      requires: [['fn', 'phone.buyerKnown', n]], effects: [['fn', 'phone.buyerInfo', n], ['sfx', 'phone_ring']] });
  }
  call('phone.hospital', { order: 80, icon: 'hospital', feature: 'phone',
    effects: [['toast', 'toast.phone.hospital', {}, 'info'], ['sfx', 'phone_ring']] });
  call('phone.board', { order: 90, icon: 'ballot', feature: 'phone',
    requires: [['election', 'nominated']], effects: [['fn', 'phone.boardInfo'], ['sfx', 'phone_ring']] });

  // ---- contacts (UI §5.9's table, in its order) ------------------------------------------------------

  SR.def.contact('lawyer', { name: 'contact.lawyer.name', role: 'contact.lawyer.role', icon: 'bail', unlock: [],
    actions: ['phone.bail', 'phone.lawyer'], p: 1, feature: 'police' });
  SR.def.contact('realty', { name: 'contact.realty.name', role: 'contact.realty.role', icon: 'realestate', unlock: [],
    actions: ['phone.realty'], p: 1, feature: 'homesPlus' });
  SR.def.contact('cabs', { name: 'contact.cabs.name', role: 'contact.cabs.role', roleVars: ['phone.fare'], icon: 'cab', unlock: [],
    actions: [], app: 'cab', p: 1, feature: 'phone' });
  SR.def.contact('red', { name: 'contact.red.name', role: 'contact.red.role', icon: 'dealer', unlock: [['fn', 'phone.redKnown']],
    actions: ['phone.red'], waypoint: 'dealerAlley', p: 1, feature: 'arcs' });
  SR.def.contact('mcholland', { name: 'contact.mcholland.name', role: 'contact.mcholland.role', icon: 'precinct',
    unlock: [['npcStage', 'mcholland', 'informant']], actions: ['phone.mcholland'], p: 1, feature: 'police' });
  for (var b = 1; b <= BUYERS; b++) {
    SR.def.contact('buyer' + b, { name: 'contact.buyer.name', nameVars: ['phone.buyerName', b], role: 'contact.buyer.role', icon: 'city',
      unlock: [['fn', 'phone.buyerKnown', b]], actions: ['phone.buyer' + b], p: 1, feature: 'tours' });
  }
  SR.def.contact('hospital', { name: 'contact.hospital.name', role: 'contact.hospital.role', icon: 'hospital', unlock: [],
    actions: ['phone.hospital'], p: 1, feature: 'phone' });
  SR.def.contact('board', { name: 'contact.board.name', role: 'contact.board.role', icon: 'ballot', unlock: [['election', 'nominated']],
    actions: ['phone.board'], p: 1, feature: 'phone' });
})();
