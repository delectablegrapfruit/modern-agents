// js/ui/pocket/phone.js — owner: W2-Pocket (W3-Econ in wave 3). The Pocket's Phone tab (UI §5.9;
// P1 `phone`): owning the cell phone turns this page into a phone with an app grid: Cab (pick a
// door: W2-City's world.cab through SR.world.cab, $15, 30 m; home at 24:00), Stocks (home.stocks by
// phone, with the Workstation), Contacts (SR.def.contact: every call is an action row; Sky Cabs
// opens the Cab app, Red's call pins Dealer Alley), Car (phone.summon: your car rolls up to the
// nearest road), Settings and Save (W2-Front's scenes; Save is hidden on Hardcore). Without a
// phone the page says where to buy one. The actions and contacts are js/data/actions/phone.js.
// Registered with SR.ui.pocket.panel at boot (prio 50). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var APPS = ['cab', 'stocks', 'contacts', 'summon', 'settings', 'save'];
  var APP_ICON = { cab: 'cab', stocks: 'workstation', contacts: 'phone', summon: 'car', settings: 'settings', save: 'save' };
  var SCREEN_W = 420;          // the phone's screen (px), centred on the page

  var F = null;   // { root, ctx, app, contact, sub }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function hasPhone(s) { return !!(s && s.items && s.items.phone > 0); }
  function hardcore(s) {
    var row = SR.tuning.difficulty && SR.tuning.difficulty[s.mode.difficulty];
    return !!(row && row.saves === 'ironman');
  }

  /** @returns {string[]} the apps on the home screen. */
  function apps(s) {
    return APPS.filter(function (a) {
      if (a === 'save') return !hardcore(s) && !!SR.reg.scene.saveload;
      if (a === 'settings') return !!SR.reg.scene.settings;
      if (a === 'cab') return !!SR.reg.action['world.cab'];
      return true;
    });
  }

  /** @returns {object[]} the contacts you have (flag on, unlocked), in UI §5.9's order. */
  function contacts(s) {
    var K = SR.rules.conditions;
    return SR.registry.entries('contact').map(function (e) { return e.def; }).filter(function (c) {
      if (c.feature && !(SR.features && SR.features[c.feature])) return false;
      if (!c.unlock || !c.unlock.length) return true;
      try { return K.all(s, c.unlock, { source: 'ui', now: s.clock.min }).ok; } catch (e) { return false; }
    });
  }

  function contactName(c) {
    var vars = null;
    if (Array.isArray(c.nameVars) && SR.reg.fn[c.nameVars[0]]) {
      try { vars = SR.reg.fn[c.nameVars[0]].apply(null, [SR.state, {}, { source: 'ui' }].concat(c.nameVars.slice(1))); } catch (e) { vars = null; }
    }
    return t(c.name, vars || undefined);
  }

  /** @returns {{x: number, y: number, a: number}|null} the nearest point of a road lane to (x, y). */
  function roadNear(x, y) {
    var m = SR.reg.worldmap && SR.reg.worldmap.main, best = null, bd = Infinity;
    ((m && m.streets) || []).forEach(function (st) {
      if (st.kind !== 'asphalt') return;
      var r = st.rect, wide = r[2] - r[0] >= r[3] - r[1];
      var px = wide ? Math.max(r[0], Math.min(r[2], x)) : (r[0] + r[2]) / 2;
      var py = wide ? (r[1] + r[3]) / 2 : Math.max(r[1], Math.min(r[3], y));
      var d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { x: px, y: py, a: wide ? 0 : Math.PI / 2 }; }
    });
    return best;
  }

  // ------------------------------------------------------------------------------------------------
  // Rows

  function row(id, params, extra) {
    var ctx = F.ctx, def = SR.reg.action[id];
    if (!def) return null;
    var pv = ctx.preview(id, params);
    if (!pv || pv.hidden) return null;
    var el = SR.ui.actionRow({ id: id, icon: def.icon, label: def.label || 'act.' + id, gains: SR.ui.chip.gains(pv),
      costs: def.screen ? [] : SR.ui.chip.costs(pv, { def: def }), disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
      onRun: function () {
        if (def.screen) { openScreen(def.screen, def.screenParams || {}); return; }
        var res = ctx.act(id, params, el.main);
        if (res && res.ok && extra) extra(res);
      } });
    return el;
  }

  function openScreen(id, params) {
    if (!SR.ui.subhost || !SR.reg.subscreen || !SR.reg.subscreen[id]) { SR.ui.toast({ key: 'ui.subMissing', kind: 'warning' }); return; }
    F.app = 'screen';
    render();
    F.sub = SR.ui.subhost.create(F.screen, { host: 'pocket', building: F.ctx.building(), rootLabel: 'pocket.phone.home', focusScope: false,
      onClose: function () { if (F) { F.sub = null; F.app = null; render(); } } });
    F.sub.push(id, params || {});
  }

  // ------------------------------------------------------------------------------------------------
  // Screens

  function back() {
    return SR.ui.button({ id: 'phone-home', label: 'pocket.phone.home', icon: 'back', size: 's', variant: 'ghost', onClick: function () {
      if (F.contact) F.contact = null; else F.app = null;
      render();
    } });
  }

  function homeScreen(s, box) {
    box.appendChild(h('h3', { class: 't-label', style: { margin: '0 0 var(--sp-2)', color: 'var(--ink-900)' } }, t('pocket.phone.apps')));
    var grid = h('div', { role: 'group', 'aria-label': t('pocket.phone.apps'), 'data-id': 'phone-apps',
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)' } });
    apps(s).forEach(function (a) {
      var b = h('button', { type: 'button', class: 'btn btn--secondary', 'data-nav': '', 'data-id': 'phone-app-' + a,
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minHeight: '88px', padding: 'var(--sp-2)' } },
        D().icon(APP_ICON[a], 32), h('span', {}, t('pocket.phone.app.' + a)));
      b.addEventListener('click', function () {
        D().sfx('click');
        if (a === 'settings') { SR.scenes.push('settings', {}); return; }
        if (a === 'save') { SR.scenes.push('saveload', { mode: 'save' }); return; }
        if (a === 'stocks') {
          var pv = F.ctx.preview('phone.stocks', {});
          if (!pv.ok) { D().refuse(b, pv.reason ? t(pv.reason, pv.vars) : ''); SR.ui.toast({ key: pv.reason || 'ui.refused', vars: pv.vars, kind: 'warning', id: 'toast-refused' }); return; }
          openScreen('home.stocks', {});
          return;
        }
        F.app = a;
        render();
      });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }

  function cabScreen(s, box) {
    box.appendChild(h('h3', { class: 't-label', style: { margin: 'var(--sp-2) 0' } }, t('pocket.phone.cabTitle')));
    var g = SR.world.geometry, list = h('div', { 'data-id': 'phone-cab-list', role: 'group', 'aria-label': t('pocket.phone.cabTitle') });
    ((g && g.doors) || []).forEach(function (d) {
      var pv = F.ctx.preview('world.cab', { door: d.id });
      if (!pv || pv.hidden) return;
      var el = SR.ui.actionRow({ id: 'cab-' + d.id, icon: 'cab', label: d.name, gains: [], costs: SR.ui.chip.costs(pv, { def: SR.reg.action['world.cab'] }),
        disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
        onRun: function () {
          var res = typeof SR.world.cab === 'function' ? SR.world.cab(d.id) : SR.act('world.cab', { door: d.id });
          if (SR.ui.card && SR.ui.card.feedback) SR.ui.card.feedback(res || { ok: false }, res && res.ok ? null : el.main, {});
          if (res && res.ok) F.ctx.close();
        } });
      list.appendChild(el);
    });
    box.appendChild(list);
  }

  function contactsScreen(s, box) {
    if (F.contact) {
      var c = SR.reg.contact[F.contact];
      box.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', margin: 'var(--sp-2) 0' } },
        D().icon(c.icon || 'phone', 40),
        h('div', {}, h('h3', { class: 't-h3', 'data-id': 'phone-contact-name', style: { margin: '0' } }, contactName(c)),
          c.role ? h('p', { class: 't-small', style: { margin: '0', color: 'var(--ink-700)' } }, t(c.role)) : null)));
      if (c.app === 'cab') { F.app = 'cab'; F.contact = null; render(); return; }
      var rows = h('div', { 'data-id': 'phone-contact-rows', style: { borderTop: 'var(--line-thin)' } });
      (c.actions || []).forEach(function (id) {
        var r = row(id, {}, function () {
          var spot = c.waypoint && SR.reg.worldmap && SR.reg.worldmap.main.spots && SR.reg.worldmap.main.spots[c.waypoint];
          if (spot) SR.ui.pocket.waypoint({ id: c.waypoint, x: spot[0], y: spot[1], name: t('pocket.map.spot.' + c.waypoint) });
        });
        if (r) rows.appendChild(r);
      });
      box.appendChild(rows);
      return;
    }
    box.appendChild(h('h3', { class: 't-label', style: { margin: 'var(--sp-2) 0' } }, t('pocket.phone.contactsTitle')));
    var list = contacts(s);
    if (!list.length) { box.appendChild(h('p', { class: 't-body', style: { color: 'var(--ink-700)' } }, t('pocket.phone.noContacts'))); return; }
    box.appendChild(SR.ui.list({ id: 'phone-contacts', label: 'pocket.phone.contactsTitle', items: list.map(function (c) {
      return { id: c.id, icon: c.icon || 'phone', label: contactName(c), meta: c.role };
    }), onSelect: function (it) { F.contact = it.id; render(); } }));
  }

  function summonScreen(s, box) {
    box.appendChild(h('h3', { class: 't-label', style: { margin: 'var(--sp-2) 0' } }, t('pocket.phone.carTitle')));
    var P = SR.world.player, spot = P && typeof P.x === 'number' ? roadNear(P.x, P.y) : null;
    var any = false;
    ['junker', 'sports'].forEach(function (car) {
      var r = s.player.cars[car];
      if (!r || !r.owned) return;
      any = true;
      var el = row('phone.summon', spot ? { car: car, x: spot.x, y: spot.y, a: spot.a } : { car: car });
      if (el) box.appendChild(el);
    });
    if (!any) box.appendChild(h('p', { class: 't-body', style: { color: 'var(--ink-700)' } }, t('pocket.phone.noCar')));
  }

  function render() {
    if (!F) return;
    var s = F.ctx.state;
    if (F.sub && F.app === 'screen') return;   // a sub-screen owns the phone's screen
    D().clear(F.root);
    if (!s) return;
    if (!hasPhone(s)) {
      var price = SR.tuning.items && SR.tuning.items.phone ? SR.tuning.items.phone.price : 0;
      F.root.appendChild(h('p', { class: 't-body', 'data-id': 'phone-none', style: { color: 'var(--ink-900)' } }, t('pocket.phone.none', { money: SR.text.money(price) })));
      return;
    }
    F.screen = h('div', { class: 'phone-screen', 'data-id': 'phone-screen', style: { minHeight: '360px', padding: 'var(--sp-3)', borderRadius: 'var(--r-m)',
      background: 'var(--paper-0)', border: 'var(--line)' } });
    var frame = h('div', { class: 'phone', 'data-id': 'phone', style: { width: SCREEN_W + 'px', maxWidth: '100%', margin: '0 auto', padding: 'var(--sp-4) var(--sp-3)',
      borderRadius: '28px', background: 'var(--ink-900)', boxShadow: 'var(--e-2)' } },
      h('p', { class: 't-small', 'aria-hidden': 'true', style: { margin: '0 0 var(--sp-2)', textAlign: 'center', color: 'var(--paper-0)', fontVariantNumeric: 'tabular-nums' } },
        SR.text.time(s.clock.min)),
      F.screen);
    F.root.appendChild(frame);
    if (F.app === 'screen') return;
    if (F.app || F.contact) F.screen.appendChild(back());
    if (!F.app) homeScreen(s, F.screen);
    else if (F.app === 'cab') cabScreen(s, F.screen);
    else if (F.app === 'contacts') contactsScreen(s, F.screen);
    else if (F.app === 'summon') summonScreen(s, F.screen);
  }

  SR.onBoot(50, function () {
    if (!SR.ui.pocket || typeof SR.ui.pocket.panel !== 'function') return;
    SR.ui.pocket.panel('phone', {
      label: 'pocket.tab.phone', icon: 'cellphone', feature: 'phone',
      mount: function (root, ctx) { F = { root: root, ctx: ctx, app: ctx.params && ctx.params.app || null, contact: null, sub: null }; render(); },
      refresh: function (ctx) {
        if (!F) return;
        F.ctx = ctx;
        if (F.sub) { F.sub.refresh(); return; }
        var a = document.activeElement, had = a && F.root.contains(a) ? a.getAttribute('data-id') : null;
        render();
        if (had) { var again = F.root.querySelector('[data-id="' + had + '"]'); if (again && again.hasAttribute('data-nav')) SR.ui.focus.focus(again); }
      },
      unmount: function () { if (F && F.sub) F.sub.destroy(); F = null; },
      onAction: function (action, ev) {
        if (!F || (ev && ev.down === false)) return false;
        if (F.sub) {
          if (action === 'tabPrev' || action === 'tabNext') return false;
          if (F.sub.onAction(action, ev)) return true;
          if (action === 'back' && !(ev && ev.repeat)) { F.sub.back(); return true; }
          return false;
        }
        if (action === 'back' && !(ev && ev.repeat) && (F.app || F.contact)) {
          if (F.contact) F.contact = null; else F.app = null;
          render();
          return true;
        }
        return false;
      },
      debug: function () { return F ? { app: F.app, contact: F.contact, screens: F.sub ? F.sub.ids() : [], apps: SR.state ? apps(SR.state) : [],
        contacts: SR.state ? contacts(SR.state).map(function (c) { return c.id; }) : [] } : null; },
    });
  });
})();
