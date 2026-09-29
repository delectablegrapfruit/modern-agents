// js/ui/subscreens/furniture.js — owner: W2-Goods. The sub-screen `furniture.browse` (CONTRACT §10;
// UI.md §5.6 "Fine Line › Browse: piece cards in a 2-column grid with price, slots, effect;
// selecting one ghosts it into your current home's interior preview; Buy / Upgrade"; GDD §4.15,
// §6.1). The slot meter of the home you live in (B-08a) and what sits in storage; one tile per
// tier-1 piece of B-08b in display order (the P0 satellite until `homesPlus` retires it, the P2
// aquarium behind its flag) showing the piece you would get (its tier 2 once you own the tier 1,
// P1 `homesPlus`), its effect, price (with the B-28a discount named, like a card row's badge) and
// slots, and the refusal of its preview ("Needs a free slot": a piece that does not fit still
// shows, GDD §6.1). Activating a tile commits `furniture.buy` / `furniture.upgrade` ({ piece }),
// asking first at or above the `game.confirmSpendOver` setting like a card row. The selected tile
// is the set's current item (aria-current). P1 (`homesPlus`): the live preview draws your home's
// interior (SR.art.interior('home', { homeId, mode: 'live' })) with the selected piece ghosted in,
// from a view of the state with its own furniture record that owns the piece. The preview is a strip
// that stays in view under the breadcrumb while the grid scrolls (a full-width preview filled the
// card body, so browsing any tile below the first row scrolled it away); in the touch-compact
// layout and at 150 % text it scrolls with the grid.
// Never mutates state: ctx.preview for the refusals and prices, ctx.act to commit.
// Node-loadable: no DOM, canvas or browser API at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var ICON = 40;                         // a tile's icon (the ActionRow's size, UI.md §2.3)
  var PREVIEW = { x: 0, y: 200, w: 760, h: 520 };   // the part of the 1280 × 720 home interior shown (its scene, x 0-760, down to the front spots)
  var PREVIEW_H = 140;                   // the preview's logical height in the card: small enough to stay in view over a row of tiles
  var PREVIEW_PAD = 16;                  // the preview strip's padding, half above and half below the preview
  var GHOST_ALPHA = 0.55;                // the ghosted piece (UI.md §5.6 "ghosts it into ... the preview")
  var CRUMBS_H = 'calc(48px * var(--ui-scale))';    // the sticky breadcrumb's height (js/ui/card.js), until measured
  var UNSTICK_TEXT_SCALE = 1.5;          // at 150 % text (UI.md §8) the strip would leave no room for a tile

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }
  function TF() { return SR.tuning.furniture; }
  function flagOn(def) { return !def.feature || !!(SR.features && SR.features[def.feature]); }
  function homes() { return SR.rules.homes; }

  /** @returns {string[]} the tier-1 pieces the showroom sells now, in display order. */
  function bases() {
    return Object.keys(SR.reg.furniture || {}).filter(function (id) {
      var d = SR.reg.furniture[id];
      if (d.tier !== 1 || !TF()[id] || !flagOn(d)) return false;
      return !(d.retiredBy && SR.features[d.retiredBy]);
    }).sort(function (a, b) { return SR.reg.furniture[a].order - SR.reg.furniture[b].order; });
  }

  /** The numbers of a piece's effect line (B-07, B-08b). */
  function effectVars(id) {
    var row = TF()[id] || {}, def = SR.reg.furniture[id] || {};
    if (def.stat && row.nightly) return { n: row.nightly[def.stat] };
    if (id === 'freezer') return { pct: SR.text.pct(row.sleep), hp: SR.tuning.sleep.leftovers.hp };
    if (typeof row.sleep === 'number') return { pct: SR.text.pct(row.sleep) };
    if (id === 'aquarium') return { hp: SR.tuning.sleep.relax.hp, karma: SR.tuning.sleep.relax.karma };
    return {};
  }
  /** @returns {string} the effect line's key: the freezer's Leftovers row is P1 (`homesPlus`, home.js). */
  function effectKey(id) {
    return 'card.furniture.effect.' + (id === 'freezer' && SR.features.homesPlus ? 'freezerPlus' : id);
  }
  function slotsText(n) {
    return n <= 0 ? t('card.furniture.slot0') : n === 1 ? t('card.furniture.slot1') : t('card.furniture.slotN', { n: n });
  }
  function homeName(id) { return SR.text.has('home.' + id) ? SR.text('home.' + id) : String(id); }
  /**
   * @returns {string} how far below the top of the card body the preview strip sticks: the height of
   *   the host's sticky breadcrumb (js/ui/card.js), read from the layout so no scrolled content shows
   *   between the two; a pixel less, so a fractional height at a large stage scale leaves no sliver
   *   (the breadcrumb paints over the strip's top padding)
   */
  function crumbsTop(root) {
    var host = root && typeof root.closest === 'function' ? root.closest('.subhost') : null;
    var crumbs = host ? host.querySelector('.subhost-crumbs') : null;
    return crumbs && crumbs.offsetHeight > 1 ? (crumbs.offsetHeight - 1) + 'px' : CRUMBS_H;
  }
  /**
   * @returns {boolean} the preview strip stays in view while the grid scrolls: not in the
   *   touch-compact layout (the body is short) nor at 150 % text
   */
  function stickable() {
    if (SR.stage && SR.stage.compact) return false;
    return (Number(D().setting('access.textScale')) || 1) < UNSTICK_TEXT_SCALE;
  }
  /**
   * @returns {object} a state for the home interior to draw: the sub-screen's read-only view with its
   *   own furniture record (a plain object the preview may change), without copying the whole state
   */
  function viewWith(state, furniture) {
    var v = {};
    Object.keys(state).forEach(function (k) { v[k] = state[k]; });
    v.furniture = furniture;
    return v;
  }

  /**
   * What a tile offers for a base piece: buy it, upgrade it (P1), or nothing (owned).
   * @returns {{base, shown, tier, stored, action, params, price, badges, slots, status}}
   */
  function offer(state, base) {
    var def = SR.reg.furniture[base], tier = (state.furniture.owned && state.furniture.owned[base]) || 0;
    var stored = (state.furniture.storage || []).indexOf(base) >= 0;
    var o = { base: base, tier: tier, stored: stored, shown: base, action: null, params: { piece: base }, price: 0, badges: [], status: null };
    // B-28a's `furniture.<id>` modifiers (the Good-tier discount): homes.buyFurniture / upgrade apply
    // them inside the rule, so the preview carries no badges; the tile names them like a card row
    function priced(n, target) {
      var p = SR.rules.act.price(state, n, target, {});
      o.price = p.price;
      o.badges = (p.applied || []).slice();
    }
    if (!tier) {
      o.action = 'furniture.buy';
      priced(TF()[base].price, 'furniture.' + base);
    } else if (tier === 1 && def.upgrade && SR.features.homesPlus && TF()[def.upgrade]) {
      o.action = 'furniture.upgrade';
      o.shown = def.upgrade;
      var net = TF()[def.upgrade].price - Math.floor(TF()[base].price * TF().upgradeCredit);
      priced(net, 'furniture.' + def.upgrade);
      // the title says "Upgrade to …": an "Owned" badge here would read as if the upgrade were owned
      o.status = stored ? 'card.furniture.inStorage' : null;
    } else {
      o.shown = homes().tierId(base, tier);
      o.status = stored ? 'card.furniture.inStorage' : tier >= 2 ? 'card.furniture.topTier' : 'card.furniture.owned';
    }
    o.slots = TF()[o.shown] ? TF()[o.shown].slots : 0;
    return o;
  }

  SR.def.subscreen('furniture.browse', {
    title: 'sub.furniture.browse',
    p: 0,

    mount: function (root, ctx) {
      var h = D().h, self = this;
      var M = this._m = { root: root, ctx: ctx, tiles: [], sel: null, alive: true, previewKey: null, sticky: false };
      M.meter = SR.ui.progress({ id: 'furn-slots', value: 0, max: 1, kind: 'primary' });
      root.appendChild(M.meter);
      M.storage = h('p', { class: 't-small t-ink-700', 'data-id': 'furn-storage', hidden: true });
      root.appendChild(M.storage);
      if (SR.features && SR.features.homesPlus) {
        // the canvas keeps the crop's aspect at PREVIEW_H (its width follows the backing store's)
        M.canvas = h('canvas', { 'data-id': 'furn-preview', role: 'img', style: { height: PREVIEW_H + 'px', width: 'auto', display: 'block',
          flex: '0 0 auto', border: 'var(--line-thin)', borderRadius: 'var(--r-m)', background: 'var(--paper-2)' } });
        M.caption = h('p', { class: 't-small t-ink-700', 'data-id': 'furn-preview-caption', style: { margin: '0', flex: '1 1 8em', minWidth: '0' } });
        M.figure = h('figure', { 'data-id': 'furn-preview-figure', style: { margin: '0', display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          gap: 'var(--sp-2)', zIndex: '1', background: 'var(--paper-0)', padding: (PREVIEW_PAD / 2) + 'px 0' } }, M.canvas, M.caption);
        root.appendChild(M.figure);
      }
      M.grid = h('div', { 'data-id': 'furn-grid', role: 'group', 'aria-label': t('card.furniture.pieces'),
        // two columns at 100 % text; one column once the text size setting makes a tile too narrow (UI.md §8)
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(calc(180px * var(--ui-scale)), 1fr))', gap: 'var(--sp-2)' } });
      root.appendChild(M.grid);
      M.unsubs = ['settings:changed', 'stage:resized'].map(function (name) {
        return SR.events.on(name, function () { self.refresh(); });
      });
      this.refresh(ctx);
    },

    refresh: function (ctx) {
      var M = this._m;
      if (!M || !M.alive) return;
      M.ctx = ctx || M.ctx;
      var self = this, state = M.ctx.state, H = homes();
      var a = document.activeElement;
      var had = a && M.grid.contains(a) ? a.getAttribute('data-id') : null;
      M.laidOut = false;
      // the slot meter of the home you live in (B-08a) and the pieces in storage
      var total = H.slots(state), used = H.slotsUsed(state), home = homeName(state.homes.living);
      M.meter.update({ value: used, max: total, label: 'card.furniture.slots', vars: { home: home } });
      var stored = (state.furniture.storage || []).length;
      M.storage.hidden = !stored;
      M.storage.textContent = stored ? t('card.furniture.storage', { n: stored }) : '';
      D().clear(M.grid);
      M.tiles = bases().map(function (base) { return self.tile(offer(state, base)); });
      M.tiles.forEach(function (tl) { M.grid.appendChild(tl.el); });
      var again = had && M.grid.querySelector('[data-id="' + had + '"]');
      if (again) SR.ui.focus.focus(again);
      var sel = null;
      M.tiles.forEach(function (tl) { if (tl.o.base === M.sel) sel = tl; });
      this.select(sel || M.tiles[0] || null, true);
    },

    /** Builds a tile for an offer: icon, name, effect, price and slot chips, status or refusal. */
    tile: function (o) {
      var M = this._m, h = D().h, self = this, state = M.ctx.state;
      var pv = o.action ? M.ctx.preview(o.action, o.params) : null;
      if (pv && pv.hidden) pv = null;
      if (pv && pv.ok) (pv.gains || []).forEach(function (g) { if (g.kind === 'cash' && g.n < 0) o.price = -g.n; });
      var def = SR.reg.furniture[o.shown] || {};
      var name = t(def.name || 'furn.' + o.shown);
      var title = o.action === 'furniture.upgrade' ? t('card.furniture.upgradeTo', { name: name }) : name;
      var enabled = !!(pv && pv.ok);
      var chips = h('span', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } });
      if (o.action) chips.appendChild(SR.ui.chip({ kind: 'money', n: o.price, cost: true, short: state.money.cash < o.price }));
      if (o.action) o.badges.forEach(function (b) { chips.appendChild(SR.ui.badge({ text: b, kind: 'info' })); });
      chips.appendChild(SR.ui.chip({ kind: 'info', icon: 'home', text: slotsText(o.slots) }));
      var status = o.status ? t(o.status) : '';
      var reason = pv && !pv.ok && pv.reason ? t(pv.reason, pv.vars) : '';
      // The button's name is its content (name, effect, price, slots, status or refusal).
      var el = h('button', { type: 'button', class: ['btn', 'btn--secondary', enabled ? '' : 'is-disabled'], 'data-nav': '',
        'data-id': 'furn-' + o.base, 'data-piece': o.shown, 'aria-disabled': enabled ? null : 'true',
        style: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: '4px',
          width: '100%', height: '100%', padding: 'var(--sp-2)', textAlign: 'left', whiteSpace: 'normal' } },
        h('span', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
          D().icon(def.icon || o.shown, ICON), h('strong', { 'data-id': 'furn-' + o.base + '-name' }, title)),
        h('span', { class: 't-small', 'data-id': 'furn-' + o.base + '-effect', style: { fontWeight: '400' } }, t(effectKey(o.shown), effectVars(o.shown))),
        chips,
        status ? h('span', { style: { display: 'flex' } }, SR.ui.badge({ text: status, kind: o.stored ? 'warn' : 'info', id: 'furn-' + o.base + '-status' })) : null,
        reason ? h('span', { class: 't-small', 'data-id': 'furn-' + o.base + '-reason', style: { color: 'var(--danger-ink)', fontWeight: '600' } }, reason) : null);
      var tl = { o: o, pv: pv, el: el, title: title };
      el.addEventListener('focus', function () { self.select(tl); });
      el.addEventListener('mouseenter', function () { self.select(tl); });
      // the HUD's ghost deltas belong to the tile under focus or the pointer only
      el.addEventListener('blur', function () { if (SR.ui.hud) SR.ui.hud.ghost(null); });
      el.addEventListener('mouseleave', function () { if (SR.ui.hud && document.activeElement !== el) SR.ui.hud.ghost(null); });
      el.addEventListener('click', function () { self.commit(tl); });
      return tl;
    },

    /**
     * Lays out the preview strip (sticky or not; under the breadcrumb, whose height is only known
     * once the host shows it, so this runs on every selection) and the tiles' scroll margins, which
     * keep a focused tile clear of the breadcrumb and the strip when focus scrolls.
     */
    layout: function () {
      var M = this._m;
      if (!M) return;
      var top = crumbsTop(M.root), sticky = !!M.figure && stickable();
      if (M.laidOut && top === M.top && sticky === M.sticky) return;
      M.laidOut = true;
      M.top = top;
      M.sticky = sticky;
      if (M.figure) {
        M.figure.style.position = sticky ? 'sticky' : 'static';
        M.figure.style.top = top;
      }
      var margin = sticky ? 'calc(' + top + ' + ' + (PREVIEW_H + PREVIEW_PAD) + 'px)' : top;
      M.tiles.forEach(function (x) { x.el.style.scrollMarginTop = margin; });
    },

    /** Selects a tile: its HUD ghost and (P1) the preview of the piece in your home. */
    select: function (tl, quiet) {
      var M = this._m;
      if (!M) return;
      this.layout();
      M.sel = tl ? tl.o.base : null;
      // the selected tile (the one in the preview) is the set's current item, not a pressed toggle:
      // activating a tile buys it
      M.tiles.forEach(function (x) {
        if (x === tl) x.el.setAttribute('aria-current', 'true'); else x.el.removeAttribute('aria-current');
        x.el.style.borderColor = x === tl ? 'var(--primary-600)' : '';
      });
      if (!quiet && SR.ui.hud) SR.ui.hud.ghost(tl && tl.pv && tl.pv.ok ? tl.pv : null);
      this.drawPreview(tl);
    },

    /** Buys or upgrades the tile's piece (asking first at or above the spend setting). */
    commit: function (tl) {
      var M = this._m;
      if (!M || !tl) return;
      var o = tl.o, ctx = M.ctx;
      if (!o.action) { D().refuse(tl.el, t(o.status || 'card.furniture.owned')); return; }
      var pv = ctx.preview(o.action, o.params);
      if (!pv || pv.hidden) return;
      if (!pv.ok) { D().refuse(tl.el, pv.reason ? t(pv.reason, pv.vars) : ''); return; }
      var over = Number(D().setting('game.confirmSpendOver')) || 0;
      if (!(over > 0 && o.price >= over)) { ctx.act(o.action, o.params); return; }
      // the confirm names the piece, as the tile does ("Upgrade to Grand Library")
      SR.ui.confirm({ id: 'confirm-furniture', title: tl.title, text: 'ui.confirmSpend', vars: { money: SR.text.money(o.price) } })
        .then(function (yes) { if (yes && M.alive) ctx.act(o.action, o.params); });
    },

    /**
     * P1 (`homesPlus`): draws the home you live in (its interior's static layer, the scene part)
     * and the same home with the selected piece, ghosted over it. Your home as it is is drawn once
     * per home, furniture and size and reused for every tile; only the ghost is drawn per tile.
     */
    drawPreview: function (tl) {
      var M = this._m;
      if (!M || !M.canvas) return;
      var state = M.ctx.state, living = state.homes.living;
      var furn = JSON.stringify(state.furniture);
      var scale = Math.min(2, (SR.stage && SR.stage.scale) || 1);
      var hgt = Math.round(PREVIEW_H * scale), w = Math.round(PREVIEW_H * PREVIEW.w / PREVIEW.h * scale);
      var key = living + ':' + w + 'x' + hgt + ':' + (tl ? tl.o.base + ':' + tl.o.shown : '-') + ':' + furn;
      var shown = tl && tl.o.action ? SR.reg.furniture[tl.o.shown] : null;
      // a piece on offer is ghosted in; an owned one is shown as the home has it (nothing to ghost)
      M.caption.textContent = shown ? t('card.furniture.preview', { name: t(shown.name || 'furn.' + tl.o.shown), home: homeName(living) })
        : t(tl ? 'card.furniture.previewHome' : 'card.furniture.previewHint', { home: homeName(living) });
      M.canvas.setAttribute('aria-label', M.caption.textContent);
      if (key === M.previewKey) return;
      M.previewKey = key;
      if (M.canvas.width !== w) M.canvas.width = w;
      if (M.canvas.height !== hgt) M.canvas.height = hgt;
      var c = M.canvas.getContext('2d');
      if (!c || !SR.art || typeof SR.art.interior !== 'function') return;
      var k = w / PREVIEW.w;
      /** Draws the home's interior for a state into a (reused) canvas of the preview's size. */
      function layer(cv, s) {
        cv.width = w;
        cv.height = hgt;
        var g = cv.getContext('2d');
        g.setTransform(k, 0, 0, k, 0, 0);
        g.translate(-PREVIEW.x, -PREVIEW.y);
        try { SR.art.interior('home', { homeId: living, mode: 'live' }).drawStatic(g, s); } catch (e) {
          SR.util.warnOnce('goods.preview', 'furniture.browse: the home interior failed to draw: ' + e.message);
        }
        return cv;
      }
      var baseKey = living + ':' + w + 'x' + hgt + ':' + furn;
      if (!M.base || M.baseKey !== baseKey) {
        M.base = layer(M.base || document.createElement('canvas'), viewWith(state, JSON.parse(furn)));
        M.baseKey = baseKey;
      }
      c.clearRect(0, 0, w, hgt);
      c.drawImage(M.base, 0, 0);
      if (!tl || !tl.o.action) return;
      var off = M.off = M.off || document.createElement('canvas');
      if (SR.reg.interior && SR.reg.interior.home) {
        var ghost = JSON.parse(furn);
        ghost.owned[tl.o.base] = tl.o.action === 'furniture.upgrade' ? 2 : 1;
        ghost.storage = (ghost.storage || []).filter(function (b) { return b !== tl.o.base; });
        layer(off, viewWith(state, ghost));
      } else {
        // No home interior registered yet: the piece's icon in the middle of the room.
        off.width = w;
        off.height = hgt;
        var d = SR.reg.furniture[tl.o.shown] || {}, size = Math.round(hgt * 0.6);
        if (typeof SR.art.icon === 'function') SR.art.icon(off.getContext('2d'), d.icon || tl.o.shown, Math.round((w - size) / 2), Math.round((hgt - size) / 2), size);
      }
      c.save();
      c.globalAlpha = GHOST_ALPHA;
      c.drawImage(off, 0, 0);
      c.restore();
    },

    unmount: function () {
      var M = this._m;
      if (!M) return;
      M.alive = false;
      (M.unsubs || []).forEach(function (off) { off(); });
      if (SR.ui.hud) SR.ui.hud.ghost(null);
      this._m = null;
    },
  });
})();
