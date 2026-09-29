// js/ui/pocket/bag.js — owner: W2-Pocket. The Pocket's Bag tab (UI §5.9; GDD §6.4): a grid of 64 px
// tiles with counts (the wallet first, then consumables, gear, goods, keys and papers; P1 items
// only while their flag is on), and a detail pane for the picked tile: its info text (Info), its
// Use command (the item's `use` action: bag.smoke, bag.eatTakeout; a Button with the action's cost
// and gain chips) and, while a street dialog is open under the Pocket, its Give command: the street
// person's own gift action for that item, the one their dialog row runs (the person's `gifts` map,
// W2-Street's SR.world.streetnpcs.giveAction; else the `street:<npc>` action whose def says
// `gift: '<item>'` or raises the `gift` rule event for it), so a gift from the Bag and from the
// dialog is one action. Below the grid: the caffeine-pill toggle (bag.pillToggle) and what you own
// that does not fit in a bag (furniture, homes, vehicles).
// Registered with SR.ui.pocket.panel at boot (prio 50). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var CATEGORIES = ['money', 'consumable', 'gear', 'commodity', 'key', 'document'];
  var TILE = 64;                                                         // UI §5.9: 64 px tiles
  // The gift an action gives when its def says nothing else: the icons of ART_AUDIO §10's street row.
  var GIFT_ICON = { give10: 'cash', givebooze: 'booze', givesmokes: 'smokes', givegum: 'gum' };
  var WALLET = 'cash';                                                   // the wallet tile's id (the `gift` item of money)

  var B = null;   // { root, ctx, sel, grid, detail, owned, pill }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }

  // ------------------------------------------------------------------------------------------------
  // What is in the Bag

  /** @returns {number} how many of an item you hold (a list's length; a car key 1 while owned). */
  function countOf(s, def) {
    var key = def.key;
    if (key === null || key === undefined) return 0;
    if (/^cars\./.test(key)) { var row = s.player.cars[key.slice(5)]; return row && row.owned ? 1 : 0; }
    var v = s.items[key];
    return Array.isArray(v) ? v.length : Number(v) || 0;
  }

  /** @returns {{id: string, def: object, n: number, category: string}[]} the tiles, grouped by category. */
  function tiles(s) {
    var out = [{ id: WALLET, def: { id: WALLET, name: 'pocket.bag.wallet', info: 'pocket.bag.walletInfo', icon: 'money', category: 'money' },
      n: s.money.cash, category: 'money' }];
    SR.registry.entries('item').forEach(function (e) {
      var def = e.def;
      if (!def.bag || def.category === 'food') return;
      if (def.feature && !(SR.features && SR.features[def.feature])) return;
      var n = countOf(s, def);
      if (n > 0) out.push({ id: def.id, def: def, n: n, category: def.category });
    });
    return out.sort(function (a, b) { return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category); });
  }

  // ------------------------------------------------------------------------------------------------
  // Give: the street person's own gift actions

  /** @returns {string|null} the Bag item a street action gives ('cash', 'booze', 'smokes', ...). */
  function giftItem(def) {
    if (!def) return null;
    if (typeof def.gift === 'string') return def.gift;
    var found = null;
    (function scan(list) {
      (list || []).forEach(function (e) {
        if (found || !Array.isArray(e)) return;
        if (e[0] === 'emit' && e[1] === 'gift' && e[2] && typeof e[2].item === 'string') found = e[2].item;
        else if (e[0] === 'fn' && e[1] === 'street.gift' && typeof e[4] === 'string') found = e[4];
        else if (e[0] === 'chance') { scan(e[2]); scan(e[3]); } else if (e[0] === 'check') { scan(e[4]); scan(e[5]); }
      });
    })(def.effects);
    return found || GIFT_ICON[def.icon] || null;
  }

  /** @returns {boolean} the action shows for the state (its preview is not hidden). */
  function shown(id) {
    var pv = B && B.ctx ? B.ctx.preview(id, {}) : SR.ui.pocket.preview(id, {});
    return !!(pv && !pv.hidden);
  }

  /**
   * The gift action for an item of the person you are talking to (null when they take none): the
   * person's own `gifts` map (W2-Street's SR.world.streetnpcs.giveAction, data/people.js), else
   * the one of their `street:<npc>` actions that gives it.
   * @param {{npc: string, actions: string[]}} talk SR.ui.pocket.talk()
   * @returns {string|null} the action id (the same one the dialog row runs)
   */
  function giftFor(talk, item) {
    if (!talk) return null;
    var SN = SR.world && SR.world.streetnpcs, id0 = null;
    if (SN && typeof SN.giveAction === 'function') { try { id0 = SN.giveAction(item, talk.npc); } catch (e) { id0 = null; } }
    if (!id0) {
      var p = SR.reg.person && SR.reg.person[talk.npc];
      if (p && p.gifts && typeof p.gifts[item] === 'string' && SR.reg.action[p.gifts[item]]) id0 = p.gifts[item];
    }
    if (id0) return shown(id0) ? id0 : null;
    for (var i = 0; i < talk.actions.length; i++) {
      var id = talk.actions[i];
      if (giftItem(SR.reg.action[id]) !== item || !shown(id)) continue;
      return id;
    }
    return null;
  }

  /**
   * Gives an item to the person whose dialog is open (the Bag's Give; GDD §6.4).
   * @returns {object|null} the Result, or null when there is no one to give it to
   */
  function give(item, origin) {
    var ctx = B && B.ctx;
    var talk = SR.ui.pocket.talk();
    var id = giftFor(talk, item);
    if (!id || !ctx) { D().refuse(origin || null, talk ? t('pocket.bag.giveNo', { name: talk.name }) : ''); return null; }
    return ctx.act(id, {}, origin || null);
  }

  // ------------------------------------------------------------------------------------------------
  // Rendering

  /**
   * An action block for the detail pane (the Use and Give commands): a Button with the action's
   * label, then its cost and gain chips (UI §2.3: the same chips as a card row), or the reason it
   * is refused. The pane is too narrow for a full ActionRow.
   * @param {string} dataId the button's data-id ('bag-use', 'bag-give')
   */
  function block(id, params, dataId, labelKey, labelVars) {
    var ctx = B.ctx, def = SR.reg.action[id], pv = ctx.preview(id, params);
    if (!def || !pv || pv.hidden) return null;
    var btn = SR.ui.button({ id: dataId, label: labelKey || def.label || 'act.' + id, vars: labelVars, icon: def.icon, variant: dataId === 'bag-use' ? 'primary' : 'secondary',
      disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars, cls: 'bag-act',
      onClick: function () {
        ctx.act(id, params, btn);
        var again = B && B.detail ? B.detail.querySelector('[data-id="' + dataId + '"]') : null;
        if (again) SR.ui.focus.focus(again);
      } });
    btn.style.width = '100%';
    btn.setAttribute('data-action', id);
    var chips = h('div', { class: 'bag-chips', 'data-id': dataId + '-chips', style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' } });
    if (!pv.ok && pv.reason) chips.appendChild(h('span', { class: 't-small', 'data-id': dataId + '-reason', style: { color: 'var(--danger-ink)', fontWeight: '600' } }, t(pv.reason, pv.vars)));
    else SR.ui.chip.costs(pv, { def: def }).concat(SR.ui.chip.gains(pv)).forEach(function (c) { chips.appendChild(c); });
    return h('div', { class: 'bag-block', style: { padding: 'var(--sp-2) 0', borderBottom: 'var(--line-thin)' } }, btn, chips);
  }

  function tileEl(tl) {
    var name = t(tl.def.name);
    var count = tl.id === WALLET ? SR.text.money(tl.n) : t('pocket.bag.count', { n: SR.text.num(tl.n) });
    var on = B.sel === tl.id;
    var b = h('button', { type: 'button', role: 'option', class: 'bag-tile nav-inset', 'data-nav': '', 'data-id': 'bag-tile-' + tl.id,
      'aria-selected': on ? 'true' : 'false', 'aria-label': t('pocket.bag.tile', { item: name, n: count }),
      style: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
        width: tl.id === WALLET ? 'auto' : TILE + 'px', minWidth: TILE + 'px', height: TILE + 'px', padding: '4px 6px', border: on ? '3px solid var(--primary-600)' : 'var(--line)',
        borderRadius: 'var(--r-m)', background: on ? 'var(--primary-100)' : 'var(--paper-0)', boxShadow: 'var(--e-1)', cursor: 'pointer' } },
      D().icon(tl.def.icon || tl.id, 32),
      h('span', { class: 't-small', 'aria-hidden': 'true', style: { fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-900)',
        lineHeight: '1', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, count));
    b.addEventListener('click', function () {
      D().sfx('click');
      B.sel = tl.id;
      render();
      var again = B.grid.querySelector('[data-id="bag-tile-' + tl.id + '"]');
      if (again) SR.ui.focus.focus(again);
    });
    SR.ui.tooltip(b, function () { return name; });
    return b;
  }

  function renderGrid(s, list) {
    D().clear(B.grid);
    var cat = null, box = null;
    list.forEach(function (tl) {
      if (tl.category !== cat) {
        cat = tl.category;
        B.grid.appendChild(h('h3', { class: 't-small', style: { margin: 'var(--sp-2) 0 var(--sp-1)', color: 'var(--ink-700)', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.02em' } }, t('pocket.bag.cat.' + cat)));
        box = h('div', { role: 'listbox', 'aria-label': t('pocket.bag.cat.' + cat), 'data-id': 'bag-cat-' + cat,
          style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' } });
        B.grid.appendChild(box);
      }
      box.appendChild(tileEl(tl));
    });
    if (list.length <= 1) B.grid.appendChild(h('p', { class: 't-body', 'data-id': 'bag-empty', style: { color: 'var(--ink-700)', margin: 'var(--sp-3) 0 0' } }, t('pocket.bag.empty')));
  }

  function renderDetail(s, list) {
    var d = B.detail, talk = SR.ui.pocket.talk();
    D().clear(d);
    if (talk) {
      d.appendChild(h('p', { class: 't-body', 'data-id': 'bag-talking', style: { margin: '0 0 var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)',
        borderRadius: 'var(--r-s)', background: 'var(--primary-100)', color: 'var(--ink-900)', fontWeight: '600' } }, t('pocket.bag.talking', { name: talk.name })));
    }
    var tl = null;
    list.forEach(function (x) { if (x.id === B.sel) tl = x; });
    if (!tl) {
      d.appendChild(h('p', { class: 't-body', 'data-id': 'bag-select', style: { color: 'var(--ink-700)', margin: '0' } }, t('pocket.bag.select')));
      return;
    }
    var def = tl.def;
    d.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' } },
      D().icon(def.icon || tl.id, 48),
      h('div', { style: { minWidth: '0' } },
        h('h3', { class: 't-h3', 'data-id': 'bag-name', style: { margin: '0', color: 'var(--ink-900)' } }, t(def.name)),
        h('p', { class: 't-small', 'data-id': 'bag-count', style: { margin: '0', color: 'var(--ink-700)' } },
          tl.id === WALLET ? SR.text.money(tl.n) : def.stack > 1 ? t('pocket.bag.have', { n: SR.text.num(tl.n), max: SR.text.num(def.stack) }) :
            tl.n > 1 ? t('pocket.bag.count', { n: tl.n }) : t('pocket.bag.haveOne')))));
    if (def.info && SR.text.has(def.info)) d.appendChild(h('p', { class: 't-body', 'data-id': 'bag-info', style: { margin: '0 0 var(--sp-3)', color: 'var(--ink-900)' } }, t(def.info)));
    var rows = h('div', { class: 'bag-rows', 'data-id': 'bag-rows', style: { borderTop: 'var(--line-thin)' } });
    // Use (a Bag action; the pill toggle is the switch below instead of a row).
    if (typeof def.use === 'string' && def.use !== 'bag.pillToggle') {
      var use = block(def.use, {}, 'bag-use');
      if (use) rows.appendChild(use);
    }
    if (def.use === 'bag.pillToggle') rows.appendChild(pillToggle(s, 'bag-pill-detail'));
    // Give, while a street dialog is open under the Pocket: the person's own gift action.
    if (talk) {
      var gid = giftFor(talk, tl.id);
      var g = gid ? block(gid, {}, 'bag-give') : null;
      if (g) rows.appendChild(g);
      else rows.appendChild(h('p', { class: 't-small', 'data-id': 'bag-give-no', style: { margin: 'var(--sp-2) 0', color: 'var(--ink-700)' } }, t('pocket.bag.giveNo', { name: talk.name })));
    }
    if (rows.childNodes.length) d.appendChild(rows);
  }

  /** @returns {{h: number, hp: number}} what a pill does tonight (B-06 `pills`: wakeMinus, restorePenalty). */
  function pillVars() {
    var p = SR.tuning.items && SR.tuning.items.pills;
    return { h: p ? p.wakeMinus / 60 : '?', hp: p ? p.restorePenalty : '?' };
  }

  function pillToggle(s, id) {
    var el = SR.ui.toggle({ id: id, label: 'pocket.bag.pillAuto', value: s.clock.pillAuto !== false, onChange: function (v) {
      B.ctx.act('bag.pillToggle', { on: v }, el);
    } });
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', padding: 'var(--sp-2) 0' } }, el,
      h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, t('pocket.bag.pillAutoHint', pillVars())));
  }

  function line(label, meta, id) {
    return h('li', { 'data-id': id || null, style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', padding: '4px 0',
      borderBottom: 'var(--line-thin)' } }, h('span', { style: { fontWeight: '600' } }, label), meta ? h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, meta) : null);
  }

  function section(title, items, id) {
    var ul = h('ul', { 'data-id': id, style: { listStyle: 'none', margin: '0', padding: '0' } });
    if (!items.length) ul.appendChild(h('li', { class: 't-small', style: { color: 'var(--ink-700)', padding: '4px 0' } }, t('pocket.bag.none')));
    items.forEach(function (x) { ul.appendChild(x); });
    return h('div', { style: { minWidth: '0' } }, h('h3', { class: 't-label', style: { margin: '0 0 var(--sp-1)', color: 'var(--ink-900)' } }, t(title)), ul);
  }

  function renderOwned(s) {
    var o = B.owned;
    D().clear(o);
    var furn = [];
    Object.keys(s.furniture.owned || {}).forEach(function (base) {
      var tier = s.furniture.owned[base], def = SR.reg.furniture && SR.reg.furniture[base];
      if (!def) return;
      var id = tier >= 2 && def.upgrade ? def.upgrade : base, show = SR.reg.furniture[id] || def;
      var stored = (s.furniture.storage || []).indexOf(base) >= 0 || (s.furniture.storage || []).indexOf(id) >= 0;
      furn.push(line(t(show.name), stored ? t('pocket.bag.stored') : tier >= 2 ? t('pocket.bag.upgraded') : '', 'bag-furn-' + base));
    });
    var homes = (s.homes.owned || []).map(function (id) {
      var def = SR.reg.home && SR.reg.home[id];
      var meta = s.homes.living === id ? t('pocket.bag.living') : s.homes.lets && s.homes.lets[id] !== undefined ? t('pocket.bag.let') : '';
      return line(def ? t(def.name) : id, meta, 'bag-home-' + id);
    });
    var cars = [];
    [['junker', 'junker'], ['sports', 'sportscar']].forEach(function (c) {
      var row = s.player.cars[c[0]], def = SR.reg.item[c[1]];
      if (!row || !row.owned) return;
      var meta = s.player.driving === c[0] ? t('pocket.bag.driving') : row.towed ? t('pocket.bag.towed') : t('pocket.bag.parked');
      cars.push(line(def ? t(def.name) : c[0], meta, 'bag-car-' + c[0]));
    });
    o.appendChild(h('h3', { class: 't-small', style: { margin: '0 0 var(--sp-2)', color: 'var(--ink-700)', fontWeight: '700', textTransform: 'uppercase',
      letterSpacing: '0.02em' } }, t('pocket.bag.owned')));
    o.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(calc(200px * var(--ui-scale)), 1fr))', gap: 'var(--sp-4)' } },
      section('pocket.bag.furniture', furn, 'bag-furniture'), section('pocket.bag.homes', homes, 'bag-homes'), section('pocket.bag.vehicles', cars, 'bag-vehicles')));
  }

  function render() {
    if (!B) return;
    var s = B.ctx.state;
    if (!s) return;
    var list = tiles(s);
    if (!list.some(function (x) { return x.id === B.sel; })) {
      // Talking to someone: the first thing they would take; else the first item (the wallet last).
      var talk = SR.ui.pocket.talk(), pick = null;
      if (talk) list.forEach(function (x) { if (!pick && giftFor(talk, x.id)) pick = x.id; });
      B.sel = pick || (list[1] ? list[1].id : list[0].id);
    }
    var a = document.activeElement, had = a && B.root.contains(a) ? a.getAttribute('data-id') : null;
    renderGrid(s, list);
    renderDetail(s, list);
    D().clear(B.pill);
    B.pill.appendChild(pillToggle(s, 'bag-pill-toggle'));
    renderOwned(s);
    if (had) {
      var again = B.root.querySelector('[data-id="' + had + '"]');
      if (again && again.hasAttribute('data-nav')) SR.ui.focus.focus(again);
      else if (again && again.querySelector('[data-nav]')) SR.ui.focus.focus(again.querySelector('[data-nav]'));
    }
  }

  function mount(root, ctx) {
    B = { root: root, ctx: ctx, sel: ctx.params && ctx.params.item ? ctx.params.item : null };
    B.grid = h('div', { class: 'bag-grid', 'data-id': 'bag-grid', style: { minWidth: '0' } });
    B.pill = h('div', { 'data-id': 'bag-pill', style: { marginTop: 'var(--sp-3)', borderTop: 'var(--line-thin)' } });
    B.detail = h('aside', { class: 'bag-detail', 'data-id': 'bag-detail', 'aria-label': t('pocket.bag.items'), 'aria-live': 'off',
      style: { minWidth: '0', padding: 'var(--sp-3)', border: 'var(--line)', borderRadius: 'var(--r-m)', background: 'var(--paper-0)', alignSelf: 'start' } });
    B.owned = h('div', { class: 'bag-owned', 'data-id': 'bag-owned', style: { marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-3)', borderTop: 'var(--line)' } });
    root.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(calc(240px * var(--ui-scale)), calc(320px * var(--ui-scale)))', gap: 'var(--sp-4)' } },
      h('div', { style: { minWidth: '0' } }, B.grid, B.pill), B.detail));
    root.appendChild(B.owned);
    render();
  }

  SR.onBoot(50, function () {
    if (!SR.ui.pocket || typeof SR.ui.pocket.panel !== 'function') return;
    SR.ui.pocket.panel('bag', {
      label: 'pocket.tab.bag', icon: 'bag',
      mount: mount,
      refresh: function (ctx) { if (B) { B.ctx = ctx; render(); } },
      unmount: function () { B = null; },
      /** @returns {object} the tiles, the picked one and its rows (tests). */
      debug: function () {
        if (!B || !B.ctx.state) return null;
        var talk = SR.ui.pocket.talk();
        return { sel: B.sel, tiles: tiles(B.ctx.state).map(function (x) { return { id: x.id, n: x.n }; }),
          give: talk ? giftFor(talk, B.sel) : null, use: B.sel && SR.reg.item[B.sel] ? SR.reg.item[B.sel].use || null : null };
      },
      giftFor: giftFor,
      giftItem: giftItem,
      give: give,
    });
  });
})();
