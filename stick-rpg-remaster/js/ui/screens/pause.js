// js/ui/screens/pause.js — owner: W2-Front. The `pause` overlay (UI §5.10; ARCHITECTURE §5): a
// 480-wide card over the dimmed world: Resume · Settings · Save (hidden on Hardcore) · Load ·
// Suspend & quit · Retire (Unlimited, and a Keep-playing run) · Quit to title. Quit and Retire ask to
// confirm. Over a minigame (the loop opens it when a hidden tab comes back) it offers only Resume and
// Settings: the round's own panel handles leaving. Esc / Start / B resume; the Esc that closes Settings
// or Save / Load (it fires `back`, then `pause`) leaves the menu up (docs/requests/W2-Pocket.md 4).
// Retire ends the run with its results (GDD §5): the world.retire row (W2-City; it calls the named fn
// endgame.retire through SR.act, which emits game:over); the results follow once the menu is gone
// (js/scenes/results.js). Without that row the item is not offered.
// Suspend & quit writes the suspend slot (Hardcore: its ironman slot) and returns to the title; Quit
// to title leaves the game without a save (the last save stays; a Hardcore run's debounced ironman
// write lands first, B-16). Either way no game runs afterwards (SR.ui.saveload.quit).
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var P = null;   // the open menu: { root, card, scope, over, arrived }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }

  function running() { return !!(SR.state && !SR.state.over); }
  function hardcore() { return !!(SR.ui.saveload && SR.ui.saveload.hardcore(SR.state)); }
  function unlimited() { var s = SR.state; return !!(s && s.mode && (s.mode.length === 0 || s.mode.keepPlaying)); }
  /** @returns {string|null} the scene below the menu. */
  function below() { var st = SR.scenes.stack(); var i = st.lastIndexOf('pause'); return i > 0 ? st[i - 1] : null; }

  /** @returns {boolean} whether a key code is bound to `back` (Esc fires `back`, then `pause`). */
  function isBackKey(code) {
    var I = SR.input;
    if (!code || !I || typeof I.bindings !== 'function') return false;
    try { return I.bindings('back').indexOf(code) >= 0; } catch (e) { return false; }
  }

  /** The menu is on top again (Settings or Save / Load closed): until this input event is over, its `pause` is the press that closed them. */
  function arrive() {
    if (!P) return;
    P.arrived = true;
    Promise.resolve().then(function () { if (P) P.arrived = false; });
  }

  function close() {
    var top = SR.scenes.top();
    if (top && top.id === 'pause') { D().sfx('close'); SR.scenes.pop(); }
  }

  /** Leaves the game for the title; no game runs afterwards (a Hardcore run's pending write lands first). */
  function toTitle() { SR.ui.saveload.quit(); }

  function suspendQuit(btn) {
    try { if (running()) SR.ui.saveload.suspend(); } catch (e) {
      SR.ui.toast({ key: (e && e.code) === 'quota' ? 'ui.save.full' : 'ui.save.failed', kind: 'warning' });
      D().refuse(btn);
      return;
    }
    SR.ui.toast({ key: 'ui.pause.suspended', kind: 'info' });
    toTitle();
  }

  function quit() {
    SR.ui.confirm({ id: 'pause-quit', title: 'ui.pause.quitTitle', text: hardcore() ? 'ui.pause.quitHardcore' : 'ui.pause.quitText', yes: 'ui.pause.quit', danger: true })
      .then(function (ok) { if (ok) toTitle(); });
  }

  /** @returns {boolean} the world.retire row exists (W2-City; it runs the named fn endgame.retire). */
  function canRetire() { return !!(SR.reg.action['world.retire'] && typeof SR.act === 'function'); }

  /**
   * Retire (GDD §5) through SR.act('world.retire'): the pipeline sets Result.over and emits game:over
   * (CONTRACT §9.2). The menu never changes the state or raises game:over itself (D27).
   */
  function retire() {
    SR.ui.confirm({ id: 'pause-retire', title: 'ui.pause.retireTitle', text: 'ui.pause.retireText', yes: 'ui.pause.retire', danger: true })
      .then(function (ok) {
        if (!ok || !running() || !canRetire()) return;
        var r = SR.act('world.retire', {});
        if (!r || !r.ok) { SR.ui.toast({ key: r && r.reason ? r.reason : 'ui.refused', vars: r && r.vars, kind: 'warning' }); return; }
        close();
      });
  }

  function items() {
    var list = [{ id: 'resume', label: 'ui.pause.resume', variant: 'primary', run: close }];
    list.push({ id: 'settings', label: 'set.title', run: function () { SR.scenes.push('settings'); } });
    if (P.over === 'minigame' || !running()) return list;
    if (!hardcore()) list.push({ id: 'save', label: 'ui.pause.save', run: function () { SR.scenes.push('saveload', { mode: 'save' }); } });
    list.push({ id: 'load', label: 'ui.pause.load', run: function () { SR.scenes.push('saveload', { mode: 'load' }); } });
    list.push({ id: 'suspend', label: 'ui.pause.suspend', run: function (ev) { suspendQuit(ev && ev.currentTarget); } });
    if (unlimited() && canRetire()) list.push({ id: 'retire', label: 'ui.pause.retire', run: retire });
    list.push({ id: 'quit', label: 'ui.pause.quit', variant: 'danger', run: quit });
    return list;
  }

  SR.scenes.register('pause', {
    kind: 'overlay',
    blocksUpdate: true,
    resume: arrive,
    ui: {
      mount: function (root) {
        P = { root: root, over: null };
        P.over = below();
        root.classList.add('modal-root');
        var scrim = h('div', { class: 'scrim', 'data-id': 'scrim' });
        scrim.addEventListener('click', close);
        root.appendChild(scrim);
        var list = h('div', { class: 'pause-list', role: 'group', 'aria-label': text('ui.pause.title') });
        items().forEach(function (it) {
          list.appendChild(SR.ui.button({ id: 'pause-' + it.id, label: it.label, variant: it.variant || 'secondary', cls: 'pause-item', onClick: it.run }));
        });
        var day = SR.state && SR.state.clock ? (SR.state.mode.length ? text('front.save.dayOf', { day: SR.state.clock.day, length: SR.state.mode.length })
          : text('front.save.day', { day: SR.state.clock.day })) : '';
        P.card = h('section', { class: 'pause-card paper', role: 'dialog', 'aria-modal': 'true', 'aria-label': text('ui.pause.title'), 'data-id': 'pause' },
          h('h2', { class: 't-h2' }, text('ui.pause.title')),
          day ? h('p', { class: 'pause-day', 'data-id': 'pause-day' }, day + ' · ' + SR.text.time(SR.state.clock.min)) : null,
          list);
        root.appendChild(P.card);
        P.scope = SR.ui.focus.push(P.card, { id: 'pause' });
        D().sfx('open');
        D().announce(text('ui.pause.title'));
      },
      unmount: function () {
        if (P && P.scope) SR.ui.focus.pop(P.scope);
        P = null;
      },
    },
    onAction: function (action, ev) {
      if (!P || (ev && (ev.consumed || ev.down === false))) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (action === 'pause' && P.arrived && ev && isBackKey(ev.code)) return true;   // docs/requests/W2-Pocket.md 4
      if (SR.ui.focus.handle(action, ev)) return true;
      if ((action === 'back' || action === 'pause') && !(ev && ev.repeat)) { close(); return true; }
      return true;          // the world below waits (rows, the Pocket, the car ...)
    },
    /** @returns {object|null} the menu's entries (tests). */
    info: function () {
      return P ? { over: P.over, items: Array.prototype.map.call(P.card.querySelectorAll('[data-id^="pause-"]'), function (b) { return b.getAttribute('data-id').slice(6); })
        .filter(function (id) { return id !== 'day'; }) } : null;
    },
  });
})();
