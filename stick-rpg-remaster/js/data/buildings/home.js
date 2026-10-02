// js/data/buildings/home.js — owner: W2-Home. The home building (GDD §3.6, §4.7, §4.15, §6.1): one
// building def for every dwelling, its card in Live, Owned and For Sale mode, and every home action
// (sleep, TV channels, the computer's trades, messages, save, the P1 nap, perks and leftovers).
//
// Modes (ARCHITECTURE §7.3, §8.4). The door resolver opens `home` with params { homeId, mode };
// the card shows the actions listed under building.modes[mode]. Every row is also `hidden` unless
// the door's *current* mode is its own (named fn home.notMode, which reads the state the way the
// resolver does), so buying at a For Sale door (Tour → bank.realestate) or moving in at an Owned
// one swaps the rows in place, without leaving the building. Each mode's list therefore also names
// the rows it can turn into.
//
// Sleep hands its night to the UI as Result.report (CONTRACT §8.9); js/scenes/report.js opens the
// report scene for it. Rows that open a sub-screen: TV (home.tv), Computer (home.stocks), Messages
// (home.messages), Campaign HQ (cityhall.campaign), Tour / Top floor / Properties / Sell
// (bank.realestate). The Save row is a free action whose UI hand-off (the save screen) is in
// js/scenes/report.js. Numbers: SR.tuning.sleep (B-07), homes (B-08a), training (B-03, the TV
// rows and the nap), stocks (B-10, through SR.rules.stocks). Pure data and named fns (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // The greeting's times of day (UI §5.6: "by first visit, time, ..."; presentation, CONTRACT D49):
  // morning until noon, the day until 18:00, then the evening (late after tuning.time.dayEnd).
  var NOON = 720, EVENING = 1080;

  function refuse(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  // ---------------------------------------------------------------------------------------------
  // The door's mode, as SR.world.doors.resolve would give it now (ARCHITECTURE §8.4).

  /** @returns {string|null} the worldmap door of a home id (SR.def.home `door`). */
  function doorOfHome(id) { var d = id && SR.reg.home[id]; return d ? d.door : null; }

  /**
   * The door behind params.homeId (the lived-in home's door without one) and what it opens now:
   * Live when you live behind it, else Owned (the best tier you own there), else For Sale (its
   * cheapest tier).
   * @returns {{door: string, mode: string, homeId: string}}
   */
  function effective(s, params) {
    var door = doorOfHome(params && params.homeId) || doorOfHome(s.homes.living);
    var tiers = SR.rules.homes.doorHomes(door);
    if (tiers.indexOf(s.homes.living) >= 0) return { door: door, mode: 'live', homeId: s.homes.living };
    var owned = tiers.filter(function (h) { return s.homes.owned.indexOf(h) >= 0; });
    if (owned.length) return { door: door, mode: 'owned', homeId: owned[owned.length - 1] };
    return { door: door, mode: 'forSale', homeId: tiers[0] };
  }

  // ---------------------------------------------------------------------------------------------
  // The building

  // Rows by mode. A mode lists its own rows first, then the rows it can turn into in place.
  var LIVE = ['home.sleep', 'home.nap', 'home.leftovers', 'home.tv', 'home.online', 'home.stargaze', 'home.party',
    'home.swim', 'home.holdCourt', 'home.messages', 'home.computer', 'home.save', 'home.properties', 'home.campaign',
    'home.topFloor'];
  var OWNED = ['home.moveIn', 'home.letOut', 'home.endLet', 'home.sell'];
  var FOR_SALE = ['home.tour'];

  SR.def.building('home', {
    name: 'place.home', portrait: 'player', music: 'home_sweet_paper', interior: 'home',
    groups: ['eat', 'train', 'services', 'special'], greetings: [],
    modes: {
      live: LIVE.concat(OWNED),
      owned: OWNED.concat(LIVE),
      forSale: FOR_SALE.concat(OWNED, LIVE),
    },
  });

  /** A `hidden` list: the row shows only while the door is in `mode` (and every extra condition fails). */
  function onlyIn(mode, extra) {
    var any = [['fn', 'home.notMode', mode]].concat(extra || []);
    return any.length === 1 ? any : [['any', any]];
  }

  function row(id, def) {
    def.building = 'home';
    def.label = def.label || 'act.' + id;
    SR.def.action(id, def);
  }

  // ---- Live mode (GDD §6.1) -------------------------------------------------------------------
  row('home.sleep', {
    group: 'services', order: 10, icon: 'sleep', p: 0, timeRule: 'free',
    hidden: onlyIn('live'), effects: [['fn', 'home.sleep']],
  });
  row('home.nap', {
    group: 'services', order: 20, icon: 'sleep', p: 1, feature: 'homesPlus',
    cost: { min: 'home.napMin' }, hidden: onlyIn('live'),
    requires: [['hpBelowMax'], ['fn', 'home.dailyOk', 'nap']],
    effects: [['heal', 'training.napHp'], ['daily', 'nap', 1]],
  });
  row('home.leftovers', {
    group: 'eat', order: 10, icon: 'freezer', p: 1, feature: 'homesPlus',
    cost: { min: 'home.leftoversMin' }, hidden: onlyIn('live'),
    requires: [['fn', 'home.hasPiece', 'freezer'], ['hpBelowMax'], ['fn', 'home.dailyOk', 'leftovers']],
    effects: [['heal', 'home.leftoversHp'], ['daily', 'leftovers', 1], ['fn', 'home.ateLeftovers']],
  });
  row('home.tv', {
    group: 'services', order: 15, icon: 'tv', p: 0, screen: 'home.tv',
    hidden: onlyIn('live'), requires: [['fn', 'home.hasPiece', 'tv']],
  });
  row('home.online', {
    group: 'train', order: 20, icon: 'workstation', p: 1, feature: 'homesPlus',
    cost: { cash: 'home.onlineCash', min: 'home.onlineMin' }, hidden: onlyIn('live'),
    requires: [['fn', 'home.hasPiece', 'pc', 2], ['fn', 'training.can', 'onlineCourse']],
    effects: [['fn', 'training.apply', 'onlineCourse']],
  });
  // The home perks (P1 `homesPlus`, B-08a): only the home you live in has one; SR.def.home names
  // these ids (js/data/homes.js `perk`).
  [['stargaze', 'apt2', 'star'], ['party', 'pent', 'minibar'], ['swim', 'mansion', 'hp'], ['holdCourt', 'castle', 'castle']]
    .forEach(function (p, i) {
      row('home.' + p[0], {
        group: 'train', order: 30 + i, icon: p[2], p: 1, feature: 'homesPlus',
        cost: { min: 'home.perkMin', cash: 'home.perkCash' }, hidden: onlyIn('live', [['not', ['livesIn', p[1]]]]),
        requires: [['fn', 'homes.perkHere', p[1]]], effects: [['fn', 'homes.usePerk']],
      });
    });
  row('home.messages', {
    group: 'services', order: 30, icon: 'messages', p: 0, screen: 'home.messages', hidden: onlyIn('live'),
  });
  row('home.computer', {
    group: 'services', order: 40, icon: 'pc', p: 0, screen: 'home.stocks',
    hidden: onlyIn('live'), requires: [['fn', 'home.hasPiece', 'pc']],
  });
  row('home.save', {
    group: 'services', order: 50, icon: 'save', p: 0, timeRule: 'free',
    hidden: onlyIn('live', [['difficulty', ['hardcore']]]), effects: [],
  });
  row('home.properties', {
    group: 'services', order: 60, icon: 'realestate', p: 1, feature: 'homesPlus', screen: 'bank.realestate',
    hidden: onlyIn('live'),
  });
  row('home.campaign', {
    group: 'special', order: 10, icon: 'campaign', p: 0, screen: 'cityhall.campaign',
    hidden: onlyIn('live', [['not', ['livesIn', 'castle']], ['not', ['election', ['nominated', 'campaign']]]]),
  });
  // Paperview's top floor (GDD §3.6): while you live in the apartment, the Real Estate page focused
  // on the bigger apartment: Buy while it is unsold, and Move in once it is yours. (The door stays
  // in Live mode while you live on the ground floor, so this row is the Paperview door's way up.)
  row('home.topFloor', {
    group: 'special', order: 20, icon: 'apt2', p: 0, screen: 'bank.realestate', screenParams: { homeId: 'apt2' },
    hidden: onlyIn('live', [['not', ['livesIn', 'apt']]]),
  });

  // ---- Owned mode ------------------------------------------------------------------------------
  row('home.moveIn', {
    group: 'services', order: 10, icon: 'home', p: 0, timeRule: 'free',
    hidden: onlyIn('owned'), effects: [['fn', 'home.moveIn']],
  });
  row('home.letOut', {
    group: 'services', order: 20, icon: 'realestate', p: 1, feature: 'homesPlus', timeRule: 'free',
    hidden: onlyIn('owned', [['fn', 'home.isLet']]), effects: [['fn', 'home.letOut']],
  });
  row('home.endLet', {
    group: 'services', order: 20, icon: 'realestate', p: 1, feature: 'homesPlus', timeRule: 'free',
    hidden: onlyIn('owned', [['not', ['fn', 'home.isLet']]]), effects: [['fn', 'home.endLet']],
  });
  row('home.sell', {
    group: 'services', order: 30, icon: 'sell', p: 1, feature: 'homesPlus', screen: 'bank.realestate',
    hidden: onlyIn('owned'),
  });

  // ---- For Sale mode ---------------------------------------------------------------------------
  row('home.tour', {
    group: 'services', order: 10, icon: 'realestate', p: 0, screen: 'bank.realestate', hidden: onlyIn('forSale'),
  });

  // ---- Sub-screen actions (never rows: no mode lists them) --------------------------------------
  // TV channels (B-03): 1 h each, 2 viewings a day per channel (Market Watch 1). News needs the TV;
  // Fitness and Dating the satellite (P0) or the SkyDish (P1); Market Watch the SkyDish (P1).
  var TV = { tvNews: 'news', tvFitness: 'fitness', tvDating: 'dating', tvMarket: 'market' };
  Object.keys(TV).forEach(function (k, i) {
    var def = {
      group: 'train', order: 100 + i, icon: ['news', 'str', 'cha', 'rateboard'][i], p: 0,
      cost: { min: 'home.tvMin' }, repeatable: true,
      requires: [['fn', 'homes.channel', TV[k]], ['fn', 'training.can', k]],
      effects: [['fn', 'training.apply', k], ['fn', 'home.tvExtra', k]],
    };
    // TV News and Market Watch may reveal today's tip (P1 stockTips; B-10 tip.sources, W2-RulesE).
    if (k === 'tvNews' || k === 'tvMarket') def.effects.splice(1, 0, ['fn', 'stocks.maybeReveal', k === 'tvNews' ? 'tv' : 'market']);
    if (k === 'tvMarket') { def.p = 1; def.feature = 'stockTips'; }
    row('home.' + k, def);
  });
  // Messages (free; orig: no time). params { id } (and { archived } for the archive toggle).
  row('home.msgRead', { group: 'services', order: 200, icon: 'messages', p: 0, timeRule: 'free', effects: [['fn', 'home.msgRead'], ['sfx', 'answering_beep']] });
  row('home.msgArchive', { group: 'services', order: 201, icon: 'messages', p: 0, timeRule: 'free', effects: [['fn', 'home.msgArchive']] });
  // The computer's trades (B-10; free): params { ticker, n }; the fee, the spread and the position
  // cap are SR.rules.stocks'. Whole shares, no shorts (Sell only what you hold).
  row('home.stockBuy', {
    group: 'services', order: 210, icon: 'pc', p: 0, timeRule: 'free',
    requires: [['fn', 'home.hasPiece', 'pc']], effects: [['fn', 'stocks.buy']],
  });
  row('home.stockSell', {
    group: 'services', order: 211, icon: 'pc', p: 0, timeRule: 'free',
    requires: [['fn', 'home.hasPiece', 'pc']], effects: [['fn', 'stocks.sell']],
  });

  // ---------------------------------------------------------------------------------------------
  // Named functions (pure; CONTRACT §8.5)

  /** Condition: the door behind params.homeId is not in `mode` now (the rows' `hidden`). */
  SR.def.fn('home.notMode', function (s, params, ctx, mode) {
    return effective(s, params).mode !== mode ? { ok: true } : refuse('reason.unavailable');
  });

  /** Condition ['fn', 'home.hasPiece', base, tier]: the piece is in use at home at that tier (default 1). */
  SR.def.fn('home.hasPiece', function (s, params, ctx, base, tier) {
    if (SR.rules.homes.has(s, base) >= (tier || 1)) return { ok: true };
    var id = (tier || 1) >= 2 ? SR.rules.homes.tierId(base, 2) : base;
    return refuse('reason.needFurniture', { furn: SR.text('furn.' + id) });
  });

  /** Condition ['fn', 'home.dailyOk', 'nap' | 'leftovers']: once a day (B-03 nap, B-07 leftovers). */
  SR.def.fn('home.dailyOk', function (s, params, ctx, key) {
    var max = key === 'nap' ? SR.tuning.training.nap.daily : SR.tuning.sleep.leftovers.daily;
    return (s.daily[key] || 0) < max ? { ok: true } : refuse('reason.dailyLimit');
  });

  /** Condition: the door's home is let out (P1 `homesPlus`). */
  SR.def.fn('home.isLet', function (s, params) {
    var id = effective(s, params).homeId, lets = s.homes.lets || {};
    return lets[id] !== undefined ? { ok: true } : refuse('reason.notLet');
  });

  // Costs by name (a cost field cannot pass an argument; ctx.id names the row).
  SR.def.fn('home.tvMin', function (s, params, ctx) {
    var row = SR.tuning.training[String(ctx && ctx.id).replace('home.', '')];
    return row ? row.min : SR.tuning.training.tvNews.min;
  });
  SR.def.fn('home.napMin', function () { return SR.tuning.training.nap.min; });
  SR.def.fn('home.leftoversMin', function () { return SR.tuning.sleep.leftovers.min; });
  SR.def.fn('home.leftoversHp', function () { return SR.tuning.sleep.leftovers.hp; });
  SR.def.fn('home.onlineMin', function () { return SR.tuning.training.onlineCourse.min; });
  SR.def.fn('home.onlineCash', function () { return SR.tuning.training.onlineCourse.cash; });
  /** The perk of the home you live in (B-08a): its minutes and its cash (the party's $500). */
  SR.def.fn('home.perkMin', function (s) { var p = SR.tuning.homes[s.homes.living].perk; return p ? p.min : 0; });
  SR.def.fn('home.perkCash', function (s) { var p = SR.tuning.homes[s.homes.living].perk; return p && p.cash ? p.cash : 0; });

  /**
   * Effect: the night (GDD §4.7); its Report reaches the UI as Result.report. A preview does not run
   * the night: it shows the HP it restores and the furniture's nightly gains on the dry-run copy.
   */
  SR.def.fn('home.sleep', function (s, params, ctx) {
    if (ctx && ctx.preview) {
      // The night's own forecast (B-07 restore after the cap, then the furniture's nightly gains).
      var f = SR.rules.night.preview(s);
      s.stats.hp += f.hp;
      f.gains.forEach(function (g) { s.stats[g.stat] += g.n; });
      // ARCHITECTURE §6.1's invariant (stats.add keeps it on the real night): HP max follows STR.
      s.stats.hpMax = SR.tuning.start.hpMaxBase + s.stats.str;
      return {};
    }
    return { report: SR.rules.night.run(s, ctx, { kind: 'sleep' }) };
  });

  /** Effect: move into the door's home (free and instant; furniture that doesn't fit is stored). */
  SR.def.fn('home.moveIn', function (s, params) {
    var r = SR.rules.homes.moveIn(s, effective(s, params).homeId);
    return r.ok ? { events: r.events, toasts: r.toasts } : refuse(r.reason, r.vars);
  });
  /** Effects: let the door's home out, end the let (P1 `homesPlus`). */
  SR.def.fn('home.letOut', function (s, params) {
    var r = SR.rules.homes.letOut(s, effective(s, params).homeId);
    return r.ok ? { events: r.events } : refuse(r.reason, r.vars);
  });
  SR.def.fn('home.endLet', function (s, params) {
    var r = SR.rules.homes.endLet(s, effective(s, params).homeId);
    return r.ok ? { events: r.events } : refuse(r.reason, r.vars);
  });

  /** Effect: the `eat` rule event of the freezer's leftovers (P1 `homesPlus`). */
  SR.def.fn('home.ateLeftovers', function () {
    return { events: [{ name: 'eat', payload: { item: 'leftovers', hp: SR.tuning.sleep.leftovers.hp, where: 'home' } }] };
  });

  /**
   * Effect ['fn', 'home.tvExtra', row]: TV News and Market Watch show tomorrow's forecast for the day
   * (GDD §3.12, P1 `weather`); the tip is stocks.maybeReveal's (the row's previous effect).
   */
  SR.def.fn('home.tvExtra', function (s, params, ctx, row) {
    if (!SR.tuning.training[row] || !SR.tuning.training[row].tipReveal) return {};
    if (SR.features.weather) s.daily.forecastSeen = true;
    return {};
  });

  function findMsg(s, id) {
    for (var i = 0; i < s.msgs.length; i++) if (s.msgs[i].id === id) return s.msgs[i];
    return null;
  }
  /** Effect: plays a message (marks it read). params { id }. */
  SR.def.fn('home.msgRead', function (s, params) {
    var m = findMsg(s, params && params.id);
    if (!m) return refuse('reason.unavailable');
    m.read = true;
    return {};
  });
  /** Effect: archives a message (params { id, archived: false } puts it back in the inbox). */
  SR.def.fn('home.msgArchive', function (s, params) {
    var m = findMsg(s, params && params.id);
    if (!m) return refuse('reason.unavailable');
    m.read = true;
    m.archived = params.archived !== false;
    return {};
  });

  /**
   * The card's greeting (UI §5.6; CONTRACT §15.4): Live by the answering machine and the hour;
   * Owned names the home and its let; For Sale the facts of the listing (price, slots, sleep bonus,
   * perk). Your own voice: the portrait is yours.
   * @returns {{key: string, vars: object}}
   */
  SR.def.fn('greet.home', function (s, params) {
    var e = effective(s, params || {}), row = SR.tuning.homes[e.homeId] || {};
    var vars = { home: SR.text('home.' + e.homeId), place: SR.text('home.' + e.homeId + '.place'), name: s.player.name };
    if (e.mode === 'forSale') {
      vars.price = SR.text.money(row.price || 0);
      vars.slots = row.slots;
      vars.sleep = Math.round((row.sleep || 0) * 100);
      vars.perk = row.perk ? SR.text('home.' + e.homeId + '.perk') : SR.text('greet.home.noPerk');
      return { key: 'greet.home.forSale', vars: vars };
    }
    if (e.mode === 'owned') {
      var isLet = !!(s.homes.lets && s.homes.lets[e.homeId] !== undefined);
      if (isLet) vars.rent = SR.text.money(row.rent || 0);
      return { key: isLet ? 'greet.home.let' : 'greet.home.owned', vars: vars };
    }
    var unread = s.msgs.filter(function (m) { return !m.read && !m.archived; }).length;
    var min = s.clock.min;
    // The first morning (a new game holds Mel's job offer, so the machine is usually blinking: UI §9).
    if (s.clock.day === 1 && min === SR.tuning.time.wake && e.homeId === 'apt') return { key: unread ? 'greet.home.firstCall' : 'greet.home.first', vars: vars };
    if (unread) { vars.n = unread; return { key: unread === 1 ? 'greet.home.unread1' : 'greet.home.unread', vars: vars }; }
    if (min >= SR.tuning.time.dayEnd) return { key: 'greet.home.late', vars: vars };
    return { key: min < NOON ? 'greet.home.morning' : min < EVENING ? 'greet.home.day' : 'greet.home.evening', vars: vars };
  });

  /**
   * The card's title (CONTRACT §15.6: js/ui/card.js reads `title.<building>` at mount and after
   * each action or home change): a For Sale door reads "For Sale" (UI §5.6 "a For Sale card"), and
   * turns into "Home" in place once the home is bought (W2-Home request 7). null: the building's name.
   * @returns {string|null} a text key
   */
  SR.def.fn('title.home', function (s, params) {
    return effective(s, params || {}).mode === 'forSale' ? 'card.home.title.forSale' : null;
  });

  // Exposed for the home's UI files and tests (what the resolver would say now).
  SR.def.fn('home.effective', function (s, params) { return effective(s, params); });
})();
