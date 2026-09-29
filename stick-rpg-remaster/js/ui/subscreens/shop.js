// js/ui/subscreens/shop.js — owner: W2-Goods. The sub-screen `pawn.shop` (CONTRACT §10; UI.md §5.6
// "Pawn › Buy / Sell: list rows; Sell tab (P1) lists pawnable items at 40 %"): the pawn shop's
// counter. The Buy list has one ActionRow per item Vinnie sells (the pawn rows of
// js/data/buildings/pawn.js, previewed live: price and gain chips, or the refusal); the Sell tab
// (P1 `shopsPlus`) lists what you hold that he buys back, at the price the `pawn.sell` preview
// shows. The focused row's item is described in a panel pinned to the bottom of the list (what it
// does, the pawn data's `pawn.use` line, and how many you hold of how many; in the touch-compact
// layout and at 150 % text the panel follows the list instead). When a sale takes the
// focused row off the list, focus moves to the row now in its place (or the tabs), not off the card.
// Input (CONTRACT §15.5): focus navigation first (the card), then here: 1-9 run the Nth row, Q / E
// and LB / RB switch tabs (the `tabs` context is pushed while the tabs show). A purchase at or
// above the `game.confirmSpendOver` setting asks first, like a card row; a sale always asks.
// Never mutates state: ctx.preview for the chips, ctx.act to commit.
// Node-loadable: no DOM, canvas or browser API at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var ICON_DETAIL = 48;  // the detail panel's icon (the ActionRow's is 40, UI.md §2.3)
  var SCROLL_TOP = 'calc(48px * var(--ui-scale))';      // the sticky breadcrumb's height
  var SCROLL_BOTTOM = 'calc(112px * var(--ui-scale))';  // the pinned detail panel's height
  // At 150 % text (UI.md §8) the pinned panel would leave the list about one row between it and the
  // breadcrumb, so from this text scale on it follows the list like in the touch-compact layout.
  var UNPIN_TEXT_SCALE = 1.5;

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }

  /** @returns {object[]} the pawn rows that sell a Bag item, in card order ({ id, item, def }). */
  function rows() {
    var ids = SR.rules.act && typeof SR.rules.act.actions === 'function' ? SR.rules.act.actions('pawn') : [];
    return ids.map(function (id) { return { id: id, def: SR.reg.action[id] }; })
      .filter(function (r) { return r.def && typeof r.def.item === 'string'; })
      .map(function (r) { return { id: r.id, item: r.def.item, def: r.def }; });
  }
  function flagOn(def) { return !def.feature || !!(SR.features && SR.features[def.feature]); }
  function held(state, key) {
    var v = state && state.items ? state.items[key] : 0;
    return Array.isArray(v) ? v.length : Number(v) || 0;
  }
  function itemName(key) {
    var def = SR.reg.item && SR.reg.item[key];
    return t(def && def.name ? def.name : 'item.' + key);
  }
  /** @returns {string} what an item does: the pawn data's `pawn.use` line (the toast's numbers). */
  function useLine(state, key) {
    var fn = SR.reg.fn && SR.reg.fn['pawn.use'];
    var u = fn ? fn(state, { item: key }, { source: 'ui' }, key) : { id: key, vars: {} };
    return t('card.pawn.use.' + u.id, u.vars);
  }
  /** @returns {number} how many units one sale hands over (a sale preview's item loss). */
  function soldOf(pv) {
    var n = 0;
    ((pv && pv.gains) || []).forEach(function (g) { if (g.kind === 'item' && g.n < 0) n -= g.n; });
    return n;
  }
  /** @returns {number} the price a purchase preview charges (its cost). */
  function priceOf(pv) { return pv && pv.cost ? pv.cost.cash || 0 : 0; }
  /** @returns {number} the cash a sale preview pays (its positive cash gain). */
  function payOf(pv) {
    var n = 0;
    ((pv && pv.gains) || []).forEach(function (g) { if (g.kind === 'cash' && g.n > 0) n += g.n; });
    return n;
  }
  /**
   * @returns {boolean} the detail panel stays pinned to the bottom of the card body: not in the
   *   touch-compact layout (the body is short) nor at 150 % text
   */
  function pinnable() {
    if (SR.stage && SR.stage.compact) return false;
    return (Number(D().setting('access.textScale')) || 1) < UNPIN_TEXT_SCALE;
  }
  /** @returns {number} the share of the price Vinnie pays back (B-06 pawnBuyback; Smooth Talker). */
  function buyback(state) {
    var T = SR.tuning.items;
    var smooth = SR.rules.perks && typeof SR.rules.perks.has === 'function' && state && SR.rules.perks.has(state, 'smoothTalker');
    return smooth ? T.pawnBuybackSmooth : T.pawnBuyback;
  }

  SR.def.subscreen('pawn.shop', {
    title: 'sub.pawn.shop',
    p: 0,

    mount: function (root, ctx) {
      var h = D().h, self = this;
      var M = this._m = { root: root, ctx: ctx, rows: [], focus: null, popTabs: null, alive: true };
      M.sellOn = !!(SR.features && SR.features.shopsPlus);
      M.tab = M.sellOn && ctx.params && ctx.params.tab === 'sell' ? 'sell' : 'buy';
      if (M.sellOn) {
        M.tabs = SR.ui.tabs({ id: 'shop-tabs', label: 'card.pawn.tabs', value: M.tab,
          tabs: [{ id: 'buy', label: 'card.pawn.tabBuy' }, { id: 'sell', label: 'card.pawn.tabSell' }],
          onChange: function (v) { M.tab = v; self.refresh(ctx); } });
        root.appendChild(M.tabs);
        if (SR.input && typeof SR.input.pushContext === 'function') {
          try { M.popTabs = SR.input.pushContext('tabs'); } catch (e) { M.popTabs = null; }
        }
      }
      M.intro = h('p', { class: 't-small t-ink-700', 'data-id': 'shop-intro' });
      root.appendChild(M.intro);
      M.list = h('div', { class: 'shop-list', role: 'group', 'data-id': 'shop-list', 'aria-label': t('card.pawn.goods') });
      root.appendChild(M.list);
      // The detail panel stays pinned to the bottom of the card body while the list scrolls (in the
      // touch-compact layout and at 150 % text the body is short, so it simply follows the list;
      // refresh re-reads that, and a text size or layout change refreshes).
      M.detail = h('div', { 'data-id': 'shop-detail', style: { bottom: '0', zIndex: '1',
        display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start', padding: 'var(--sp-2) var(--sp-1)',
        background: 'var(--paper-0)', borderTop: 'var(--line-thin)' } });
      root.appendChild(M.detail);
      M.unsubs = ['settings:changed', 'stage:resized'].map(function (name) {
        return SR.events.on(name, function () { self.refresh(); });
      });
      this.refresh(ctx);
    },

    refresh: function (ctx) {
      var M = this._m;
      if (!M || !M.alive) return;
      M.ctx = ctx || M.ctx;
      var self = this, h = D().h, state = M.ctx.state;
      var a = document.activeElement;
      var had = a && M.list.contains(a) ? a.getAttribute('data-id') : null;
      // where the focused row sat, so focus stays in the list when a sale removes that row
      var hadAt = -1;
      M.rows.forEach(function (r, i) { if (r.el && r.el.main === a) hadAt = i; });
      M.pinned = pinnable();
      M.detail.style.position = M.pinned ? 'sticky' : 'static';
      // The Buy list needs no intro (Vinnie's greeting is above); the Sell tab states his rate.
      M.intro.hidden = M.tab !== 'sell';
      M.intro.textContent = M.tab === 'sell' ? t('card.pawn.sellIntro', { pct: SR.text.pct(buyback(state)) }) : '';
      if (M.tabs && M.tabs.value !== M.tab) M.tabs.select(M.tab);
      D().clear(M.list);
      M.rows = [];
      var list = rows().filter(function (r) { return flagOn(r.def); });
      if (M.tab === 'sell') {
        list.filter(function (r) { return held(state, r.item) > 0; }).forEach(function (r) {
          var pv = M.ctx.preview('pawn.sell', { item: r.item });
          if (!pv || pv.hidden) return;
          M.rows.push({ id: 'sell-' + r.item, item: r.item, action: 'pawn.sell', params: { item: r.item }, pv: pv, def: SR.reg.action['pawn.sell'],
            icon: r.def.icon, label: (SR.reg.item[r.item] && SR.reg.item[r.item].name) || 'item.' + r.item, sell: true });
        });
      } else {
        list.forEach(function (r) {
          var pv = M.ctx.preview(r.id, {});
          if (!pv || pv.hidden) return;
          M.rows.push({ id: 'buy-' + r.item, item: r.item, action: r.id, params: {}, pv: pv, def: r.def, icon: r.def.icon, label: r.def.label });
        });
      }
      M.rows.forEach(function (row, i) {
        var pv = row.pv, n = held(state, row.item);
        var gains = SR.ui.chip.gains(pv);
        if (!row.sell) gains.push(SR.ui.chip({ kind: 'info', icon: 'bag', text: 'card.pawn.haveChip', vars: { n: n } }));
        row.el = SR.ui.actionRow({
          id: 'shop-' + row.id, hotkey: i < 9 ? i + 1 : null, icon: row.icon, label: row.label,
          gains: gains, costs: row.sell ? [] : SR.ui.chip.costs(pv, { def: row.def, state: state }),
          badges: pv.badges || [], disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
          onRun: function () { self.commit(row); },
          onFocus: function () { self.show(row); },
          onBlur: function () { if (SR.ui.hud) SR.ui.hud.ghost(null); },
        });
        // focus scrolling keeps the row clear of the sticky breadcrumb and the pinned detail panel
        row.el.main.style.scrollMarginTop = SCROLL_TOP;
        if (M.pinned) row.el.main.style.scrollMarginBottom = SCROLL_BOTTOM;
        M.list.appendChild(row.el);
      });
      if (!M.rows.length) M.list.appendChild(h('p', { class: 't-small t-ink-700', 'data-id': 'shop-empty' }, t(M.tab === 'sell' ? 'card.pawn.sellEmpty' : 'ui.nothingHere')));
      var again = had && M.list.querySelector('[data-id="' + had + '"]');
      if (!again && hadAt >= 0 && M.rows.length) again = M.rows[Math.min(hadAt, M.rows.length - 1)].el.main;
      if (!again && hadAt >= 0 && M.tabs) again = M.tabs.querySelector('[aria-selected="true"]') || M.tabs.querySelector('[data-nav]');
      if (again) SR.ui.focus.focus(again);
      var cur = null;
      M.rows.forEach(function (r) { if (M.focus && r.id === M.focus) cur = r; });
      this.show(cur || M.rows[0] || null, true);
    },

    /** Fills the detail panel with a row's item; quiet: no HUD ghost (a refresh, not a focus). */
    show: function (row, quiet) {
      var M = this._m;
      if (!M) return;
      var h = D().h, state = M.ctx.state;
      D().clear(M.detail);
      M.focus = row ? row.id : null;
      if (!row) { M.detail.hidden = true; return; }
      M.detail.hidden = false;
      var key = row.item, n = held(state, key), stack = ((SR.tuning.items[key] || {}).stack) || 1;
      var lines = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' } },
        h('strong', { 'data-id': 'shop-detail-name' }, itemName(key)),
        h('span', { class: 't-small', 'data-id': 'shop-detail-use' }, useLine(state, key)),
        h('span', { class: 't-small t-ink-700', 'data-id': 'shop-detail-have' },
          row.sell ? t('card.pawn.sellFor', { money: SR.text.money(payOf(row.pv)) })
            : stack > 1 ? t('card.pawn.haveMax', { n: n, max: stack }) : t('card.pawn.have', { n: n })));
      M.detail.appendChild(D().icon(row.icon || key, ICON_DETAIL));
      M.detail.appendChild(lines);
      if (!quiet && SR.ui.hud) SR.ui.hud.ghost(row.pv && row.pv.ok ? row.pv : null);
    },

    /** Runs a row: a purchase (asking first at or above the spend setting) or a sale (always asks). */
    commit: function (row) {
      var M = this._m;
      if (!M) return;
      var ctx = M.ctx, pv = ctx.preview(row.action, row.params);
      if (!pv || pv.hidden) return;
      if (!pv.ok) { D().refuse(row.el && row.el.main, pv.reason ? t(pv.reason, pv.vars) : ''); return; }
      var ask = null;
      if (row.sell) {
        var n = soldOf(pv);
        ask = { text: n > 1 ? 'card.pawn.sellConfirmN' : 'card.pawn.sellConfirm', vars: { n: n, item: itemName(row.item), money: SR.text.money(payOf(pv)) } };
      }
      else {
        var over = Number(D().setting('game.confirmSpendOver')) || 0, price = priceOf(pv);
        if (over > 0 && price >= over) ask = { text: 'ui.confirmSpend', vars: { money: SR.text.money(price) } };
      }
      if (!ask) { ctx.act(row.action, row.params); return; }
      SR.ui.confirm({ id: 'confirm-shop', title: row.sell ? 'act.pawn.sell' : row.label, text: ask.text, vars: ask.vars })
        .then(function (yes) { if (yes && M.alive) ctx.act(row.action, row.params); });
    },

    onAction: function (action, ev) {
      var M = this._m;
      if (!M || (ev && ev.down === false)) return false;
      if ((action === 'tabPrev' || action === 'tabNext') && M.tabs) {
        if (action === 'tabNext') M.tabs.next(); else M.tabs.prev();
        return true;
      }
      var m = /^row(\d)$/.exec(action);
      if (m) {
        if (ev && ev.repeat) return true;
        var row = M.rows[Number(m[1]) - 1];
        if (row && row.el) { SR.ui.focus.focus(row.el.main); this.commit(row); }
        return true;
      }
      return false;
    },

    unmount: function () {
      var M = this._m;
      if (!M) return;
      M.alive = false;
      (M.unsubs || []).forEach(function (off) { off(); });
      if (M.popTabs) { try { M.popTabs(); } catch (e) { /* already popped */ } }
      if (SR.ui.hud) SR.ui.hud.ghost(null);
      this._m = null;
    },
  });
})();
