// js/ui/pocket/pocket.js — owner: W2-Pocket. The Pocket (UI §5.9): the `pocket` overlay scene
// (CONTRACT §11.3), a paper notebook that slides up over the dimmed, frozen world, with a tab rail
// (Journal · Map · Stats · Bag · Messages · Phone · Achievements) and one panel at a time.
//   SR.ui.pocket.panel(id, def)       registers a tab panel (the tab files call it from a prio-50
//                                     boot hook, so shuffled loading works): { label, icon, order,
//                                     feature, visible(s), badge(s), needsGame, mount(root, ctx),
//                                     refresh(ctx), unmount(ctx), onAction(action, ev, ctx) → consumed,
//                                     debug(ctx) }
//   SR.ui.pocket.open(tab, params)    opens the Pocket on a tab (or switches tab while open)
//   SR.ui.pocket.close() · select(tab, params) · isOpen() · current() → { tab, tabs } · refresh()
//   SR.ui.pocket.act(id, params, originEl) → Result: SR.act with the card's feedback (UI §4.3),
//                                     then a refresh; a Result that opens a minigame, jails you or
//                                     takes you down closes the Pocket first (the scene queue waits
//                                     for a base scene on top)
//   SR.ui.pocket.talk() → { npc, name, actions } | null: the street dialog the Pocket was opened
//                                     over (the Bag's Give runs that person's own gift action)
//   SR.ui.pocket.debug()              the open tab, the tabs, the panel's own debug (tests)
// Panel ctx: { state, params, root, pocket, act, preview, select, close, refresh, below, base,
//   building, talk() }.
// Input (UI §6; CONTRACT §15.5, D57): the `tabs` context maps Q / E (LB / RB) to tabPrev / tabNext;
// arrows and Enter go to SR.ui.focus first, then the panel; Tab (`pocket`) closes it (and does not
// also move focus); Esc / B close it (a panel may use `back` first to close an inner view); M, I, J
// jump to Map, Bag and Journal (the same key again closes); Start opens Pause instead. Esc is both
// `back` and `pause`: the close waits for the end of that key press, so its `pause` is not handed to
// the scene below (which would open the pause menu). Touch: tap a tab, swipe the page sideways.
// Colours: tokens only (inline var(--…)). Load-time rule: defines functions and registers the scene.
(function () {
  'use strict';
  var SR = window.SR;

  var ORDER = ['journal', 'map', 'stats', 'bag', 'messages', 'phone', 'achievements'];   // UI §5.9
  var NB = { x: 80, y: 48, w: 1120, h: 640, rail: 168 };   // UI §2.2: the Pocket notebook, tab rail 168 wide
  var GUTTER = 16;                                           // touch-compact: centred with 16 px gutters
  var RAIL_NARROW = 160;                                     // the rail on a narrow (compact) notebook: "Messages" and its badge fit
  var SLIDE_MS = 350;                                        // UI §5.9: slides up in 350 ms
  var SLIDE_PX = 48;
  var NAV = { up: true, down: true, left: true, right: true, confirm: true };   // the actions that resume a lost focus
  var REFRESH_EVENTS = ['time:advanced', 'money:changed', 'stat:changed', 'karma:changed', 'heat:changed', 'buzz:changed',
    'item:changed', 'job:changed', 'home:changed', 'day:started', 'msg:received', 'action:done', 'settings:changed'];

  var panels = {};           // id -> panel def
  var P = null;              // the open notebook
  var lastTab = 'journal';   // the Pocket reopens where you left it (this session)

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function assign(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  // ------------------------------------------------------------------------------------------------
  // Panels

  /**
   * Registers a tab panel.
   * @param {string} id one of journal, map, stats, bag, messages, phone, achievements
   * @param {object} def the panel (see the header)
   */
  function panel(id, def) {
    def.id = id;
    panels[id] = def;
  }

  /** @returns {boolean} a panel shows for the state (its flag on, its own visible() test). */
  function shows(id, s) {
    var def = panels[id];
    if (!def) return false;
    if (def.feature && !(SR.features && SR.features[def.feature])) return false;
    if (typeof def.visible === 'function') {
      try { return def.visible(s) !== false; } catch (e) { return false; }
    }
    return true;
  }

  /** @returns {string[]} the tabs to show, in the rail's order. */
  function tabsFor(s) { return ORDER.filter(function (id) { return shows(id, s); }); }

  function callPanel(def, name, a, b, c) {
    if (!def || typeof def[name] !== 'function') return undefined;
    try { return def[name](a, b, c); } catch (e) {
      console.error('SR.ui.pocket: panel "' + def.id + '" ' + name + '() threw', e);
      return undefined;
    }
  }

  // ------------------------------------------------------------------------------------------------
  // The scene stack around the Pocket

  /** @returns {string|null} the scene right under the Pocket. */
  function below() {
    var st = SR.scenes.stack(), i = st.lastIndexOf('pocket');
    return i > 0 ? st[i - 1] : null;
  }
  /** @returns {string|null} the base scene (the bottom of the stack). */
  function base() { var st = SR.scenes.stack(); return st.length ? st[0] : null; }
  /** @returns {string|null} the building whose card is under the Pocket. */
  function building() {
    if (base() !== 'building' || !SR.ui.card || typeof SR.ui.card.current !== 'function') return null;
    return SR.ui.card.current();
  }

  function personName(npc) {
    var p = SR.reg.person && SR.reg.person[npc];
    if (p && p.name) return t(p.name);
    return t('pocket.bag.someone');
  }

  /**
   * The street person whose dialog lies under the Pocket: W2-Street's SR.world.streetnpcs.talking,
   * else SR.ui.dialog.current() when W1-D's host offers it, else the open sheet's portrait
   * (`data-person`) or its id (`street-<npc>`, the city's own dialogs). Only a person with
   * `street:<npc>` actions counts (not a police stop or an encounter).
   * @returns {{npc: string, name: string, actions: string[]}|null}
   */
  function talk() {
    var st = SR.scenes.stack(), i = st.lastIndexOf('pocket');
    var under = i >= 0 ? st.slice(0, i) : st;
    if (under.indexOf('dialog') < 0 || !SR.state) return null;
    var npc = null;
    var SN = SR.world && SR.world.streetnpcs;
    if (SN && typeof SN.talking === 'string' && SN.talking) npc = SN.talking;
    if (!npc && SR.ui.dialog && typeof SR.ui.dialog.current === 'function') {
      try { var cur = SR.ui.dialog.current(); npc = cur && (cur.person || null); } catch (e) { npc = null; }
    }
    if (!npc && typeof document !== 'undefined') {
      var sheets = document.querySelectorAll('#ui [data-scene="dialog"] .dlg');
      var sheet = sheets.length ? sheets[sheets.length - 1] : null;
      if (sheet) {
        var por = sheet.querySelector('[data-person]');
        npc = por ? por.getAttribute('data-person') : null;
        var m = /^street-(.+)$/.exec(sheet.getAttribute('data-id') || '');
        if (!npc && m) npc = m[1];
      }
    }
    if (!npc) return null;
    var ids = SR.rules.act && typeof SR.rules.act.actions === 'function' ? SR.rules.act.actions('street:' + npc)
      : Object.keys(SR.reg.action).filter(function (id) { return SR.reg.action[id].building === 'street:' + npc && !/:resolve$/.test(id); });
    if (!ids || !ids.length) return null;
    return { npc: npc, name: personName(npc), actions: ids.slice() };
  }

  // ------------------------------------------------------------------------------------------------
  // Running actions from the Pocket

  function preview(id, params) {
    if (typeof SR.preview !== 'function') return { ok: false, reason: 'ui.rulesPending' };
    try { return SR.preview(id, params || {}) || { ok: false, reason: 'ui.rulesPending' }; } catch (e) {
      SR.util.warnOnce('pocket.preview.' + id, 'SR.ui.pocket: preview("' + id + '") threw: ' + e.message);
      return { ok: false, reason: 'ui.rulesPending' };
    }
  }

  /** Runs a Result's minigame (a gift that plays the interview, P1) and its :resolve, as a card does. */
  function runMinigame(open) {
    if (!SR.minigame || typeof SR.minigame.run !== 'function') { SR.ui.toast({ key: 'ui.minigamePending', kind: 'warning' }); return; }
    var p;
    try { p = SR.minigame.run(open.minigame, assign({ skin: open.skin, resolve: open.resolve }, open.params || {})); } catch (e) {
      console.error('SR.ui.pocket: SR.minigame.run failed', e);
      return;
    }
    Promise.resolve(p).then(function (result) {
      if (!open.resolve || !result) return;
      var res = SR.act(open.resolve, result);
      if (SR.ui.card && SR.ui.card.feedback) SR.ui.card.feedback(res, null, {});
      if (SR.ui.dialog && SR.ui.dialog.isOpen()) SR.ui.dialog.refresh();
    }, function (e) {
      SR.util.warnOnce('pocket.mg.' + open.minigame, 'SR.ui.pocket: minigame "' + open.minigame + '" did not run: ' + (e && e.message));
      SR.ui.toast({ key: 'ui.minigamePending', kind: 'warning', id: 'toast-minigame' });
    });
  }

  /**
   * Commits an action from a Pocket control: SR.act, the feedback of UI §4.3 (chips fly from the
   * control, toasts, stamps, sounds), then the panel refreshes.
   * @returns {object} the Result
   */
  function act(id, params, origin) {
    if (typeof SR.act !== 'function') return { ok: false, id: id, reason: 'ui.rulesPending' };
    var res = SR.act(id, params || {}) || { ok: false, id: id, reason: 'ui.rulesPending' };
    if (SR.ui.card && typeof SR.ui.card.feedback === 'function') SR.ui.card.feedback(res, origin || null, {});
    else if (!res.ok) D().refuse(origin || null, res.reason ? t(res.reason, res.vars) : '');
    if (SR.ui.dialog && typeof SR.ui.dialog.isOpen === 'function' && SR.ui.dialog.isOpen()) SR.ui.dialog.refresh();
    if (res.ok && (res.down || res.jailed || res.over || res.open)) {
      close();
      if (res.open && !res.down) runMinigame(res.open);
      return res;
    }
    refresh();
    return res;
  }

  // ------------------------------------------------------------------------------------------------
  // The notebook

  function weekday(s) {
    if (SR.rules.time && typeof SR.rules.time.weekday === 'function') {
      try { return SR.rules.time.weekday(s); } catch (e) { /* fall through */ }
    }
    return ((s.clock.day - 1) % 7 + 7) % 7;
  }

  function dateLine(s) {
    if (!s || !s.clock) return '';
    var v = { weekday: t('pocket.weekday.' + weekday(s)), day: s.clock.day, length: s.mode.length, time: SR.text.time(s.clock.min) };
    return t(s.mode.length ? 'pocket.date' : 'pocket.dateUnlimited', v);
  }

  function makeCtx(id, params) {
    var ctx = {
      params: params || {},
      root: null,
      pocket: SR.ui.pocket,
      act: act,
      preview: preview,
      select: function (tab, p) { select(tab, p); },
      close: function () { close(); },
      refresh: function () { refresh(); },
      below: below,
      base: base,
      building: building,
      talk: talk,
      text: SR.text,
      ui: SR.ui,
      tab: id,
    };
    Object.defineProperty(ctx, 'state', { enumerable: true, get: function () { return SR.state; } });
    return ctx;
  }

  function layout() {
    if (!P) return;
    var W = P.root.offsetWidth || SR.W, H = P.root.offsetHeight || SR.H;
    var stage = W === SR.W && H === SR.H;
    var w = Math.min(NB.w, W - 2 * GUTTER), hh = Math.min(NB.h, H - 2 * GUTTER);
    var x = stage ? NB.x : Math.round((W - w) / 2), y = stage ? NB.y : Math.round((H - hh) / 2);
    var rail = w < 960 ? RAIL_NARROW : NB.rail;
    var st = P.nb.style;
    st.left = x + 'px'; st.top = y + 'px'; st.width = w + 'px'; st.height = hh + 'px';
    st.gridTemplateColumns = 'calc(' + rail + 'px * var(--ui-scale)) minmax(0, 1fr)';   // the rail grows with the text size (UI §8)
    P.nb.setAttribute('data-size', stage ? 'stage' : 'compact');
  }

  /** @returns {string} a label without its soft hyphens (they only mark where a narrow rail may break a word). */
  function plain(k, v) { return t(k, v).replace(/\u00AD/g, ''); }

  function railButton(id) {
    var def = panels[id];
    // nav-inset: the rail scrolls (overflow), which would clip an outer focus ring to two stray lines.
    var b = h('button', { type: 'button', role: 'tab', class: 'tab pocket-tab nav-inset', 'data-nav': '', 'data-id': 'pocket-tab-' + id,
      'data-tab': id, 'aria-selected': 'false',
      style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', width: '100%', minHeight: 'var(--tap)', margin: '0',
        padding: '6px 2px 6px 6px', border: '0', borderLeft: '4px solid transparent', borderRadius: '0', background: 'transparent',
        color: 'var(--ink-900)', fontWeight: '700', textAlign: 'left', cursor: 'pointer' } },
      h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex', flex: 'none', width: '20px' } }, D().icon(def.icon || id, 20)),
      // Labels wrap rather than clip (UI §8: no clipping at 150 % text; the narrow compact rail): at
      // spaces, at a soft hyphen of the text table (Achieve-ments), else anywhere.
      h('span', { class: 'pocket-tab-label', style: { flex: '1 1 auto', minWidth: '0', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: '1.15' } }, t(def.label)),
      // The unread count trails the label (UI §5.9's "MESSAGES •").
      h('span', { class: 'pocket-tab-badge', 'data-id': 'pocket-badge-' + id, style: { display: 'none', flex: 'none', lineHeight: '1' } }));
    b.addEventListener('click', function () {
      D().sfx('click');
      select(id);
      SR.ui.focus.focus(b);
    });
    return b;
  }

  function buildRail() {
    var s = SR.state;
    D().clear(P.rail);
    P.tabs = tabsFor(s);
    P.buttons = {};
    P.rail.appendChild(h('h2', { class: 't-label', 'data-id': 'pocket-title', style: { margin: '0 0 var(--sp-2)', padding: '0 var(--sp-3)',
      fontFamily: 'var(--font-display)', fontWeight: '900', letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--ink-900)' } }, t('pocket.title')));
    var list = h('div', { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t('pocket.tabs'), 'data-id': 'pocket-tabs',
      style: { display: 'flex', flexDirection: 'column', gap: '2px' } });
    P.tabs.forEach(function (id) {
      var b = railButton(id);
      P.buttons[id] = b;
      list.appendChild(b);
    });
    P.rail.appendChild(list);
    markTabs();
  }

  function markTabs() {
    if (!P) return;
    var s = SR.state;
    P.tabs.forEach(function (id) {
      var b = P.buttons[id], on = id === P.tab;
      if (!b) return;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.classList.toggle('is-selected', on);
      b.style.background = on ? 'var(--paper-1)' : 'transparent';
      b.style.borderLeftColor = on ? 'var(--primary-600)' : 'transparent';
      var badge = b.querySelector('.pocket-tab-badge');
      var text = null;
      if (s && typeof panels[id].badge === 'function') { try { text = panels[id].badge(s); } catch (e) { text = null; } }
      D().clear(badge);
      if (text) badge.appendChild(SR.ui.badge({ text: text.text || text, kind: 'new' }));
      badge.style.display = text ? 'inline-flex' : 'none';   // an empty badge takes no room (nor the flex gap)
      b.setAttribute('aria-label', plain(panels[id].label) + (text && text.aria ? ', ' + text.aria : ''));
    });
  }

  function mountPanel() {
    var def = panels[P.tab];
    P.lastRect = null;
    D().clear(P.page);
    P.page.setAttribute('data-tab', P.tab);
    P.page.setAttribute('aria-label', plain(def.label));
    P.page.scrollTop = 0;
    P.ctx = makeCtx(P.tab, P.params);
    P.ctx.root = P.page;
    if (!SR.state && def.needsGame !== false) {
      P.page.appendChild(h('p', { class: 't-body', 'data-id': 'pocket-nogame', style: { color: 'var(--ink-700)' } }, t('pocket.noGame')));
      P.mounted = null;
      return;
    }
    P.mounted = def;
    callPanel(def, 'mount', P.page, P.ctx);
  }

  function unmountPanel() {
    if (!P || !P.mounted) return;
    callPanel(P.mounted, 'unmount', P.ctx);
    P.mounted = null;
  }

  /**
   * Switches to a tab.
   * @param {string} id
   * @param {object=} params the panel's params (a Map place to show, the Bag's item ...)
   * @returns {boolean} the tab shows now
   */
  function select(id, params) {
    if (!P) return false;
    if (P.tabs.indexOf(id) < 0) { D().refuse(null); return false; }
    if (id === P.tab && !params) return true;
    unmountPanel();
    P.tab = id;
    P.params = params || {};
    lastTab = id;
    markTabs();
    mountPanel();
    D().announce(t('pocket.opened', { tab: plain(panels[id].label) }));
    return true;
  }

  function step(d) {
    if (!P || !P.tabs.length) return;
    var i = P.tabs.indexOf(P.tab);
    var next = P.tabs[(i + d + P.tabs.length) % P.tabs.length];
    var hadRail = P.rail.contains(document.activeElement);
    D().sfx('click');
    select(next);
    if (hadRail || !P.page.contains(document.activeElement)) SR.ui.focus.focus(P.buttons[next]);
  }

  var refreshQueued = false;
  /** Re-reads the state into the header, the rail badges and the open panel (batched per tick). */
  function refresh() {
    if (!P || refreshQueued) return;
    refreshQueued = true;
    Promise.resolve().then(function () {
      refreshQueued = false;
      if (!P) return;
      var s = SR.state;
      P.date.textContent = dateLine(s);
      var tabs = tabsFor(s);
      if (tabs.join() !== P.tabs.join()) {
        // A flag or the state changed which tabs show: rebuild the rail, keeping focus on it.
        var onRail = P.rail.contains(document.activeElement);
        buildRail();
        if (tabs.indexOf(P.tab) < 0) select(tabs[0] || 'journal');
        if (onRail && P.buttons[P.tab]) SR.ui.focus.focus(P.buttons[P.tab]);
        if (tabs.indexOf(P.tab) < 0 || !P.mounted) return;
      } else markTabs();
      if (P.mounted) callPanel(P.mounted, 'refresh', P.ctx);
    });
  }

  function mount(root, params) {
    params = params || {};
    var s = SR.state;
    var tabs = tabsFor(s);
    // Opened over a street dialog, the Pocket opens on the Bag (its Give; GDD §6.4).
    var dflt = talk() && tabs.indexOf('bag') >= 0 ? 'bag' : lastTab;
    var want = params.tab && tabs.indexOf(params.tab) >= 0 ? params.tab : tabs.indexOf(dflt) >= 0 ? dflt : tabs[0] || 'journal';
    P = { root: root, tab: want, params: params.params || {}, tabs: tabs, buttons: {}, ctx: null, mounted: null, unsubs: [],
      closing: false };
    root.classList.add('pocket-root');
    root.style.zIndex = 'var(--z-overlay)';
    var scrim = h('div', { class: 'scrim', 'data-id': 'pocket-scrim' });
    scrim.addEventListener('click', function () { close(); });
    root.appendChild(scrim);

    P.rail = h('nav', { class: 'pocket-rail', 'data-id': 'pocket-rail', 'aria-label': t('pocket.tabs'),
      style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', padding: 'var(--sp-4) 0', background: 'var(--paper-2)',
        borderRight: 'var(--line)', overflowY: 'auto', minHeight: '0' } });
    P.date = h('p', { class: 't-label', 'data-id': 'pocket-date', style: { margin: '0', flex: '1 1 auto', color: 'var(--ink-900)' } });
    var closeBtn = SR.ui.iconButton({ id: 'pocket-close', label: 'pocket.close', icon: 'cancel', size: 's', onClick: function () { close(); } });
    var head = h('header', { class: 'pocket-head', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '0 0 var(--sp-3)',
      borderBottom: 'var(--line-thin)', marginBottom: 'var(--sp-3)' } },
      P.date, SR.ui.keyHint({ action: 'pocket', id: 'pocket-close-key' }), closeBtn);
    P.page = h('div', { class: 'pocket-page scroll-y', role: 'tabpanel', 'data-id': 'pocket-panel',
      style: { flex: '1 1 auto', minHeight: '0', overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', paddingRight: 'var(--sp-1)' } });
    var main = h('div', { class: 'pocket-main', style: { display: 'flex', flexDirection: 'column', minWidth: '0', minHeight: '0',
      padding: 'var(--sp-4) var(--sp-5) var(--sp-4) var(--sp-5)', background: 'var(--paper-1)' } }, head, P.page);
    P.nb = h('section', { class: 'pocket paper', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('pocket.aria'), 'data-id': 'pocket',
      style: { position: 'absolute', display: 'grid', gridTemplateRows: '100%', overflow: 'hidden', background: 'var(--paper-1)',
        border: 'var(--line)', borderRadius: 'var(--r-l)', boxShadow: 'var(--e-3)', color: 'var(--ink-900)' } }, P.rail, main);
    root.appendChild(P.nb);
    if (SR.ui.tooltip && SR.ui.tooltip.hide) SR.ui.tooltip.hide();   // the HUD button's tip must not linger over the notebook
    layout();
    buildRail();
    P.date.textContent = dateLine(s);
    P.scope = SR.ui.focus.push(P.nb, { id: 'pocket', autofocus: false });
    if (SR.input && typeof SR.input.pushContext === 'function') {
      try { P.popContext = SR.input.pushContext('tabs'); } catch (e) { P.popContext = null; }
    }
    mountPanel();
    if (P.buttons[P.tab]) SR.ui.focus.focus(P.buttons[P.tab]);
    // Opened by Tab in the city, the key's own default action still runs after this and moves
    // focus one control on; put it back on the open tab once that key press is over.
    var mine = P;
    setTimeout(function () {
      if (P !== mine || !P.buttons[P.tab]) return;
      var a = document.activeElement;
      if (a && a !== P.buttons[P.tab] && P.rail.contains(a)) SR.ui.focus.focus(P.buttons[P.tab]);
    }, 0);
    // Where focus last was on the page, so a control a panel re-renders away can hand it on (regainFocus).
    P.page.addEventListener('focusin', function (e) {
      if (P && e.target && e.target.getBoundingClientRect) P.lastRect = e.target.getBoundingClientRect();
    });
    // Swipe the page sideways on touch to turn tabs (UI §6).
    if (SR.ui.swipe) P.unsubs.push(SR.ui.swipe(P.page, function () { step(1); }, function () { step(-1); }));
    REFRESH_EVENTS.forEach(function (name) { P.unsubs.push(SR.events.on(name, function () { refresh(); })); });
    P.unsubs.push(SR.events.on('stage:resized', function () { layout(); }));
    if (!D().reduced() && typeof P.nb.animate === 'function') {
      // Transform only: an opacity fade would leave text translucent mid-animation (the a11y audit).
      P.nb.animate([{ transform: 'translateY(' + SLIDE_PX + 'px)' }, { transform: 'translateY(0)' }], { duration: SLIDE_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
    D().sfx('open');
    D().announce(t('pocket.opened', { tab: plain(panels[P.tab] ? panels[P.tab].label : 'pocket.title') }));
  }

  function unmount() {
    if (!P) return;
    var p = P;
    unmountPanel();
    P = null;
    p.unsubs.forEach(function (f) { try { f(); } catch (e) { /* already gone */ } });
    if (p.popContext) { try { p.popContext(); } catch (e) { /* popped */ } }
    if (p.scope) SR.ui.focus.pop(p.scope);
    SR.ui.tooltip && SR.ui.tooltip.hide && SR.ui.tooltip.hide();
  }

  /** Closes the Pocket (only when it is the top scene). */
  function close() {
    var top = SR.scenes.top();
    if (!top || top.id !== 'pocket') return false;
    D().sfx('close');
    SR.scenes.pop();
    return true;
  }

  function bindingsOf(action) {
    if (SR.input && typeof SR.input.bindings === 'function') {
      try { return SR.input.bindings(action) || []; } catch (e) { return []; }
    }
    return action === 'pause' ? ['Escape', 'Pad9'] : action === 'back' ? ['Escape', 'Backspace', 'Pad1'] : [];
  }

  /**
   * Back closes the Pocket. A key that is also `pause` (Esc) fires `pause` right after `back` in
   * the same press: the close waits for the end of that press so the scene below never gets it.
   */
  function backClose(ev) {
    if (ev && ev.code && bindingsOf('pause').indexOf(ev.code) >= 0) {
      if (P.closing) return;
      P.closing = true;
      Promise.resolve().then(function () { if (P) { P.closing = false; close(); } });
      return;
    }
    close();
  }

  /**
   * A panel re-rendered the focused control away (the last pack smoked, a phone app switched):
   * focus fell to the document. The next arrow or confirm lands on the page control nearest to
   * where focus was, instead of jumping to the top of the rail (SR.ui.focus's empty-scope rule).
   * @returns {boolean} focus was put back (the key press is spent on it)
   */
  function regainFocus() {
    var a = document.activeElement;
    if (!P.lastRect || (a && a !== document.body && P.nb.contains(a))) return false;
    var r = P.lastRect, cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bd = Infinity;
    SR.ui.focus.navigables(P.page).forEach(function (el) {
      var q = el.getBoundingClientRect(), d = Math.hypot(q.left + q.width / 2 - cx, q.top + q.height / 2 - cy);
      if (d < bd) { bd = d; best = el; }
    });
    return best ? SR.ui.focus.focus(best) : false;
  }

  /** Start / a pause key that is not `back`: the pause menu replaces the Pocket. */
  function toPause() {
    if (!SR.reg.scene.pause) { D().refuse(null); return; }
    D().sfx('close');
    SR.scenes.replace('pause', {});
  }

  function onAction(action, ev) {
    if (!P) return false;
    ev = ev || {};
    if (ev.down === false) return false;
    if (P.closing) return true;   // the rest of the Esc press that closes the Pocket
    if ((action === 'confirm' || action === 'back' || action === 'pocket') && !ev.repeat && SR.ui.stamp && SR.ui.stamp.swallow && SR.ui.stamp.swallow()) return true;
    if (action === 'interact') return true;   // Enter / Space / A also fire confirm
    if (action === 'pocket') { if (!ev.repeat) close(); return true; }
    if (NAV[action] && regainFocus()) return true;
    if (SR.ui.focus.handle(action, ev)) return true;
    if (P.mounted && callPanel(P.mounted, 'onAction', action, ev, P.ctx) === true) return true;
    switch (action) {
      case 'tabPrev': case 'tabNext':
        if (!ev.repeat) step(action === 'tabPrev' ? -1 : 1);
        return true;
      case 'map': case 'bag': case 'journal':
        if (ev.repeat) return true;
        if (P.tab === action) close(); else if (P.tabs.indexOf(action) >= 0) { select(action); if (P && P.buttons[action]) SR.ui.focus.focus(P.buttons[action]); }
        return true;
      case 'back':
        if (!ev.repeat) backClose(ev);
        return true;
      case 'pause':
        if (ev.code && bindingsOf('back').indexOf(ev.code) >= 0) return true;
        if (!ev.repeat) toPause();
        return true;
      default:
        return true;   // the world below waits (the city is frozen)
    }
  }

  // ------------------------------------------------------------------------------------------------
  // The Messages tab: W2-Home's home.messages sub-screen, hosted in the Pocket (UI §5.9: the inbox
  // reads anywhere with a phone, else "messages play at home"; at home it always plays).

  var MSG = null;   // { host }

  function unread(s) {
    return (s && s.msgs ? s.msgs : []).filter(function (m) { return m && !m.read && !m.archived; }).length;
  }

  panel('messages', {
    label: 'pocket.tab.messages', icon: 'messages',
    badge: function (s) { var n = unread(s); return n ? { text: t('pocket.unread', { n: n }), aria: t('pocket.unreadAria', { n: n }) } : null; },
    mount: function (root, ctx) {
      if (!SR.ui.subhost || !SR.reg.subscreen || !SR.reg.subscreen['home.messages']) {
        root.appendChild(h('p', { class: 't-body', style: { color: 'var(--ink-700)' } }, t('ui.subMissing')));
        return;
      }
      MSG = { host: SR.ui.subhost.create(root, { host: 'pocket', building: ctx.building(), rootLabel: 'pocket.tab.messages', focusScope: false }) };
      var crumbs = MSG.host.el.querySelector('.subhost-crumbs');
      if (crumbs) crumbs.style.display = 'none';   // the tab is the whole screen: no Back crumb to an empty page
      MSG.host.push('home.messages', {});
    },
    refresh: function () { if (MSG) MSG.host.refresh(); },
    unmount: function () { if (MSG) MSG.host.destroy(); MSG = null; },
    onAction: function (action, ev) {
      // Q / E stay the Pocket's tabs; the inbox / archive switch is a click or the arrows.
      if (!MSG || action === 'tabPrev' || action === 'tabNext') return false;
      return MSG.host.onAction(action, ev);
    },
    debug: function () { return MSG ? { screens: MSG.host.ids() } : null; },
  });

  SR.scenes.register('pocket', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: { mount: mount, unmount: unmount },
    onAction: onAction,
    update: function (dt) { if (P && P.mounted && typeof P.mounted.update === 'function') callPanel(P.mounted, 'update', dt, P.ctx); },
  });

  SR.ui.pocket = {
    panel: panel,
    /** @returns {string[]} the tabs the Pocket shows for the live state. */
    tabs: function () { return tabsFor(SR.state); },
    /**
     * Opens the Pocket on a tab (pushes the scene), or switches to that tab while it is open.
     * @param {string=} tab
     * @param {object=} params the tab's params
     */
    open: function (tab, params) {
      if (P) { if (tab) select(tab, params); return; }
      SR.scenes.push('pocket', { tab: tab, params: params });
    },
    close: close,
    select: function (tab, params) { return select(tab, params); },
    isOpen: function () { return !!P; },
    /** @returns {{tab: string, tabs: string[]}|null} */
    current: function () { return P ? { tab: P.tab, tabs: P.tabs.slice() } : null; },
    refresh: refresh,
    act: act,
    preview: preview,
    talk: talk,
    /** @returns {object|null} a registered panel def (its own helpers: the Bag's giftFor, the Map's waypoint ...). */
    panelDef: function (id) { return panels[id] || null; },
    /**
     * Sets the waypoint (the Map tab's): { id, x, y, name, door }.
     * @returns {boolean}
     */
    waypoint: function (spec) {
      var d = panels.map;
      return d && typeof d.waypointTo === 'function' ? d.waypointTo(spec) : false;
    },
    /** @returns {object|null} the open tab, the tabs and the panel's debug(ctx) (tests). */
    debug: function () {
      if (!P) return null;
      var d = P.mounted && typeof P.mounted.debug === 'function' ? callPanel(P.mounted, 'debug', P.ctx) : null;
      return { tab: P.tab, tabs: P.tabs.slice(), panel: d || null, talk: talk() };
    },
  };
})();
