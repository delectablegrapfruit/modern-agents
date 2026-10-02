// js/ui/subscreens/realestate.js — owner: W2-Money. The sub-screen `bank.realestate` (CONTRACT §10;
// UI.md §5.6 "Bank › Real Estate: property cards: exterior thumbnail, price, slots, sleep bonus,
// perk, rent; Buy / Sell / Move in / Let out"; GDD §3.6, §4.15; BALANCE B-08a). Paperweight Realty
// at the bank's desk: one card per home of B-08a, each with its exterior thumbnail (the render
// core's painter, W1-G), the price (or "rent-free" for the apartment), furniture slots and sleep
// bonus, your status (you live here / yours / let out / for sale) and its buttons: Buy (asks first;
// cash, then the bank), Move in; P1 `homesPlus`: the home perk, the nightly rent, Sell (asks
// first) and Let out / End the let.
// Hosts: the bank's card (the Real Estate desk row), a home door (For Sale → Tour and Paperview's
// "Top floor: Tour" pass `params.homeId`; Owned → Sell, P1), and the Pocket's phone (P1 Paperweight
// Realty, SR.ui.subhost with host 'pocket'): `params.homeId` puts that property first, framed, with
// the focus on its first button, marked "On tour" while it is for sale (Sell takes the focus when an
// Owned door's Sell row sent you; the home you live in is never singled out, so the Live card's
// Properties row shows the plain list). Nothing here depends on the host building.
// Commits: bank.buyHome, bank.moveIn, bank.sellHome, bank.letHome, bank.endLet ({ homeId };
// js/data/buildings/bank.js), each through ctx.act; refusals and prices come from ctx.preview.
// Never mutates state. Node-loadable: no DOM, canvas or browser API at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var THUMB = { w: 128, h: 84, pad: 4 };   // the exterior thumbnail in the card (logical px)
  var THUMB_DPR = 2;                       // its backing store per logical px (crisp at uiK ≤ 2)
  var thumbs = {};                         // door building id → a baked canvas (the session's cache)

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function money(n) { return SR.text.money(n); }
  function TH() { return SR.tuning.homes; }
  function homeName(id) { return SR.text('home.' + id); }

  /** @returns {string[]} the home ids in B-08a order (feature-off homes left out). */
  function homeIds() {
    return (TH().order || Object.keys(SR.reg.home)).filter(function (id) {
      var d = SR.reg.home[id];
      return d && (!d.feature || SR.features[d.feature]);
    });
  }

  /** @returns {object|null} the worldmap building entry behind a home's door (the thumbnail's model). */
  function doorBuilding(id) {
    var door = SR.reg.home[id] && SR.reg.home[id].door;
    var map = SR.reg.worldmap && SR.reg.worldmap.main;
    var list = map && map.buildings;
    if (!door || !list) return null;
    if (Array.isArray(list)) { for (var i = 0; i < list.length; i++) if (list[i].id === door) return list[i]; return null; }
    return list[door] || null;
  }

  /**
   * The exterior thumbnail of a home: the building baked once by SR.art.exterior (W1-G) and scaled
   * into THUMB; the home's icon when the painter is not there.
   * @returns {HTMLElement}
   */
  function thumbnail(id) {
    var label = t('card.bank.re.thumb', { home: homeName(id) });
    var def = doorBuilding(id), E = SR.art && SR.art.exterior;
    var canvas = null;
    if (def && E && typeof E.build === 'function' && typeof E.geom === 'function') {
      try {
        var key = def.id;
        if (!thumbs[key]) {
          var b = E.geom(def).bounds, bw = b[2] - b[0], bh = b[3] - b[1];
          var zoom = Math.min((THUMB.w - 2 * THUMB.pad) / bw, (THUMB.h - 2 * THUMB.pad) / bh);
          var res = E.build(def, zoom, THUMB_DPR);
          thumbs[key] = { img: res.albedo, w: bw * zoom, h: bh * zoom };
        }
        var th = thumbs[key];
        canvas = document.createElement('canvas');
        canvas.width = THUMB.w * THUMB_DPR;
        canvas.height = THUMB.h * THUMB_DPR;
        var c = canvas.getContext('2d');
        c.setTransform(THUMB_DPR, 0, 0, THUMB_DPR, 0, 0);
        c.fillStyle = D().token('--primary-100');
        c.fillRect(0, 0, THUMB.w, THUMB.h);
        c.drawImage(th.img, (THUMB.w - th.w) / 2, (THUMB.h - th.h) / 2, th.w, th.h);
      } catch (e) {
        SR.util.warnOnce('re.thumb.' + id, 'bank.realestate: the thumbnail of ' + id + ' failed: ' + e.message);
        canvas = null;
      }
    }
    var frame = h('div', { 'data-id': 're-thumb-' + id, role: 'img', 'aria-label': label,
      style: { flex: '0 0 auto', width: THUMB.w + 'px', height: THUMB.h + 'px', border: 'var(--line)', borderRadius: 'var(--r-s)', overflow: 'hidden',
        background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' } });
    if (canvas) {
      canvas.style.width = THUMB.w + 'px';
      canvas.style.height = THUMB.h + 'px';
      canvas.style.display = 'block';
      canvas.setAttribute('aria-hidden', 'true');
      frame.appendChild(canvas);
    } else {
      var ic = SR.reg.home[id] && SR.reg.home[id].icon;
      frame.appendChild(D().icon(ic || 'realestate', 48));
    }
    return frame;
  }

  /** @returns {{key: string, kind: string}} the status badge of a home. */
  function status(s, id) {
    if (s.homes.living === id) return { key: 'card.bank.re.status.live', kind: 'money' };
    if (s.homes.owned.indexOf(id) >= 0) {
      if (s.homes.lets && s.homes.lets[id] !== undefined) return { key: 'card.bank.re.status.let', kind: 'info' };
      return { key: 'card.bank.re.status.owned', kind: 'money' };
    }
    return { key: 'card.bank.re.status.sale', kind: 'warn' };
  }

  /** The fact lines of a home (B-08a): price, slots, sleep bonus; P1 the perk and the rent. */
  function facts(id) {
    var row = TH()[id], def = SR.reg.home[id] || {};
    var out = [];
    out.push(row.price > 0 ? t('card.bank.re.price', { money: money(row.price) }) : t('card.bank.re.free'));
    out.push(t('card.bank.re.slots', { n: row.slots }));
    out.push(row.sleep > 0 ? t('card.bank.re.sleep', { pct: SR.text.pct(row.sleep) }) : t('card.bank.re.sleep0'));
    if (SR.features.homesPlus) {
      if (row.perk && SR.text.has('home.' + id + '.perk')) out.push(t('card.bank.re.perk', { perk: SR.text('home.' + id + '.perk') }));
      if (row.rent > 0) out.push(t('card.bank.re.rent', { money: money(row.rent) }));
    }
    // The home the nomination asks you to live in (B-17 election.requires.home; orig the castle).
    var req = SR.tuning.election && SR.tuning.election.requires ? SR.tuning.election.requires.home : null;
    return { line: out.join(' · '), castle: !!def && id === req };
  }

  /** The buttons a home offers now, each with its commit and preview. */
  function offers(M, id) {
    var s = M.ctx.state, owned = s.homes.owned.indexOf(id) >= 0, living = s.homes.living === id;
    var p = { homeId: id }, out = [];
    function add(kind, action, label, vars, variant) {
      var pv = M.ctx.preview(action, p);
      if (!pv || pv.hidden) return;
      out.push({ kind: kind, action: action, label: label, vars: vars || {}, variant: variant, pv: pv });
    }
    if (!owned) add('buy', 'bank.buyHome', 'card.bank.re.buy', { money: money(TH()[id].price) }, 'primary');
    if (owned && !living) {
      add('moveIn', 'bank.moveIn', 'card.bank.re.moveIn', {}, 'primary');
      // The rent-free apartment is never let or sold (SR.rules.homes: reason.cantLet / cantSell):
      // no dead "Let out" / "Sell for $0" buttons on its card.
      if (TH()[id].price > 0) {
        if (s.homes.lets && s.homes.lets[id] !== undefined) add('endLet', 'bank.endLet', 'card.bank.re.endLet', {});
        else add('let', 'bank.letHome', 'card.bank.re.let', { money: money(TH()[id].rent) });
        add('sell', 'bank.sellHome', 'card.bank.re.sell', { money: money(TH()[id].sell) }, 'danger');
      }
    }
    return out;
  }

  /**
   * The home the page opens on (GDD §3.6): a door's or a row's `params.homeId`, except the home you
   * live in (the Live card's P1 Properties row passes the door's own home: the list then keeps its
   * B-08a order). Returns { id, tour, first }: `tour` marks a home for sale ("On tour"), `first` the
   * offer that takes the focus (Sell when an Owned door's P1 Sell row sent you, `params.mode` 'owned').
   */
  function focusOf(M, ids) {
    var s = M.ctx.state, p = M.ctx.params || {}, id = p.homeId;
    if (ids.indexOf(id) < 0 || s.homes.living === id) return null;
    var owned = s.homes.owned.indexOf(id) >= 0;
    return { id: id, tour: !owned, first: owned && p.mode === 'owned' ? 'sell' : null };
  }

  /** Runs an offer: Buy and Sell ask first (property is irreversible, CONTRACT §8.2), the rest runs. */
  function run(M, id, o) {
    var pv = M.ctx.preview(o.action, { homeId: id });
    if (!pv || pv.hidden) return;
    if (!pv.ok) { D().refuse(o.el, pv.reason ? t(pv.reason, pv.vars) : ''); return; }
    var ask = null;
    if (o.kind === 'buy') ask = { title: 'card.bank.re.buyTitle', text: 'card.bank.re.buyConfirm', vars: { home: homeName(id), money: money(TH()[id].price) } };
    if (o.kind === 'sell') ask = { title: 'card.bank.re.sellTitle', text: 'card.bank.re.sellConfirm', vars: { home: homeName(id), money: money(TH()[id].sell) }, danger: true };
    if (!ask) { M.focusAfter = 're-' + id; M.ctx.act(o.action, { homeId: id }); return; }
    SR.ui.confirm({ id: 'confirm-re', title: ask.title, text: ask.text, vars: ask.vars, danger: !!ask.danger })
      .then(function (yes) { if (yes && M.alive) { M.focusAfter = 're-' + id; M.ctx.act(o.action, { homeId: id }); } });
  }

  /** One property card; `focus` is focusOf's record when this is the home the page opened on. */
  function card(M, id, focus) {
    var s = M.ctx.state, st = status(s, id), f = facts(id), home = SR.reg.home[id] || {};
    var touring = !!(focus && focus.tour);
    var head = h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
      h('h3', { class: 't-h3', 'data-id': 're-name-' + id, style: { margin: '0', fontSize: 'calc(18px * var(--ui-scale))' } }, homeName(id)),
      SR.ui.badge({ text: st.key, kind: st.kind, id: 're-status-' + id }),
      touring ? SR.ui.badge({ text: 'card.bank.re.touring', kind: 'new', id: 're-touring' }) : null);
    var place = h('div', { class: 't-small', style: { color: 'var(--ink-700)' } }, home.place ? t(home.place) : '');
    var lines = h('div', { class: 't-small', 'data-id': 're-facts-' + id, style: { margin: 'var(--sp-1) 0' } }, f.line);
    var info = h('div', { style: { minWidth: '0', flex: '1 1 auto' } }, head, place, lines,
      f.castle ? h('div', { class: 't-small', 'data-id': 're-castle', style: { color: 'var(--ink-700)', fontWeight: '700' } }, t('card.bank.re.castle')) : null);
    var top = h('div', { style: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' } }, thumbnail(id), info);
    var btns = h('div', { 'data-id': 're-actions-' + id, style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' } });
    var reason = null;
    var list = offers(M, id);
    // The focused home's first offer takes the focus, or the one its host asked for (focusOf).
    var lead = focus ? (list.filter(function (o) { return o.kind === focus.first && o.pv.ok; })[0] || list[0]) : null;
    list.forEach(function (o) {
      o.el = SR.ui.button({ id: 're-' + o.kind + '-' + id, label: o.label, vars: o.vars, size: 's', variant: o.variant || 'secondary',
        disabled: !o.pv.ok, reason: o.pv.reason, reasonVars: o.pv.vars, autofocus: o === lead,
        onClick: function () { run(M, id, o); } });
      btns.appendChild(o.el);
      if (!o.pv.ok && o.kind === 'buy' && o.pv.reason) reason = t(o.pv.reason, o.pv.vars);
    });
    var extra = [];
    if (reason) extra.push(h('div', { class: 'arow-reason t-small', 'data-id': 're-reason-' + id, style: { marginTop: 'var(--sp-1)' } }, reason));
    var owned = s.homes.owned.indexOf(id) >= 0, living = s.homes.living === id;
    if (owned && !living && SR.rules.homes.slotsUsed(s) > TH()[id].slots) {
      extra.push(h('div', { class: 't-small', 'data-id': 're-storage-' + id, style: { color: 'var(--ink-700)', marginTop: 'var(--sp-1)' } },
        t('card.bank.re.storage', { n: TH()[id].slots })));
    }
    return h('section', { 'data-id': 're-' + id, role: 'group', 'aria-label': homeName(id),
      style: { padding: 'var(--sp-3)', margin: '0 0 var(--sp-3)', borderRadius: 'var(--r-m)', background: 'var(--paper-0)',
        border: focus ? '3px solid var(--primary-600)' : 'var(--line-thin)' } }, top, btns.childNodes.length ? btns : null, extra);
  }

  function render(M) {
    var root = M.root, s = M.ctx.state, a = document.activeElement;
    var inside = !!(a && root.contains(a));
    var had = inside ? a.getAttribute('data-id') : null;
    D().clear(root);
    root.appendChild(h('p', { class: 't-small', 'data-id': 're-intro', style: { margin: '0', color: 'var(--ink-700)' } }, t('card.bank.re.intro')));
    root.appendChild(h('p', { class: 't-small', 'data-id': 're-means', style: { margin: '0', fontWeight: '700' } },
      t('card.bank.re.means', { cash: money(s.money.cash), bank: money(s.money.bank) })));
    var ids = homeIds();
    var focus = focusOf(M, ids);
    if (focus) ids = [focus.id].concat(ids.filter(function (id) { return id !== focus.id; }));
    var list = h('div', { 'data-id': 're-list', role: 'list', 'aria-label': t('card.bank.re.list') });
    ids.forEach(function (id) {
      var c = card(M, id, focus && id === focus.id ? focus : null);
      c.setAttribute('role', 'listitem');
      list.appendChild(c);
    });
    root.appendChild(list);
    if (!inside && !M.focusAfter) return;
    var el = had && root.querySelector('[data-id="' + had + '"]');
    if (!el || el.getAttribute('aria-disabled') === 'true') {
      var sec = M.focusAfter && root.querySelector('[data-id="' + M.focusAfter + '"]');
      el = (sec && sec.querySelector('[data-nav]:not([aria-disabled="true"])')) || root.querySelector('[data-autofocus]') || root.querySelector('[data-nav]');
    }
    // Nothing left to press on the page: the host's Breadcrumb, never the page body (UI.md §8).
    if (!el) {
      var host = root.closest ? root.closest('[data-id="subhost"]') : null;
      el = host ? SR.ui.focus.navigables(host)[0] : null;
    }
    M.focusAfter = null;
    if (el) SR.ui.focus.focus(el);
  }

  var mounts = [];
  function of(ctx) { for (var i = mounts.length - 1; i >= 0; i--) if (mounts[i].ctx === ctx) return mounts[i]; return mounts[mounts.length - 1] || null; }

  SR.def.subscreen('bank.realestate', {
    title: 'sub.bank.realestate',
    p: 0,
    mount: function (root, ctx) {
      var M = { root: root, ctx: ctx, alive: true, focusAfter: null };
      mounts.push(M);
      render(M);   // the host opens it scrolled to the top (js/ui/card.js; W2-Money request 2)
    },
    refresh: function (ctx) {
      var M = of(ctx);
      if (!M || !M.alive) return;
      M.ctx = ctx || M.ctx;
      render(M);
    },
    unmount: function () {
      var M = mounts.pop();
      if (M) M.alive = false;
    },
    /** Test hook (no public name): the property order and each home's offers as the screen shows them. */
    peek: function () {
      var M = mounts[mounts.length - 1];
      if (!M) return null;
      return Array.prototype.map.call(M.root.querySelectorAll('section[data-id^="re-"]'), function (sec) {
        return { id: sec.getAttribute('data-id').slice(3), buttons: Array.prototype.map.call(sec.querySelectorAll('button'), function (b) {
          return { id: b.getAttribute('data-id'), text: b.getAttribute('aria-label'), disabled: b.getAttribute('aria-disabled') === 'true' };
        }) };
      });
    },
  });
})();
