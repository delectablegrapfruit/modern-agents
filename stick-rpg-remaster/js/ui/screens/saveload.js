// js/ui/screens/saveload.js — owner: W2-Front. The Save / Load overlay (UI §5.16; ARCHITECTURE §15)
// and the front end's save helpers (SR.ui.saveload).
//   The `saveload` scene (overlay; params { mode: 'save' | 'load' }): slot cards (3 + Auto + Suspend):
//   the 160 × 90 thumbnail, name, day / length, title, net worth, play time and when it was saved,
//   with Save here / Load / Delete (confirm). More (the only place for save codes and files): Copy
//   save code (the clipboard, else the read-only pre-selected textarea), Paste save code (a
//   TextField), Download file, Import file. A Hardcore game shows only its ironman slot ("In progress
//   · Day 12, 14:30" while a day is under way) and has no manual save (B-16). A full storage asks to
//   delete a slot; an unreadable save says so and is quarantined by SR.save.
//   SR.ui.saveload: latest() (the most recent readable save: Continue), continueLatest(),
//   load(slot | state) (loads and resumes), resume() (where a loaded game starts: the jail, a trip
//   buyer still waiting, else the city), suspend() (Suspend & quit, the Classic link: the suspend
//   slot, or the ironman slot on Hardcore), hardcore(state), SLOTS.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var MANUAL = ['slot1', 'slot2', 'slot3'];
  var SHOWN = ['slot1', 'slot2', 'slot3', 'auto', 'suspend'];
  var FILE_TYPES = '.json,.txt,application/json,text/plain';

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }
  function toast(key, vars, kind) { SR.ui.toast({ key: key, vars: vars, kind: kind || 'info' }); }

  // ------------------------------------------------------------------------------------------------
  // Helpers (also used by the title, the pause menu and the new-game wizard)
  // ------------------------------------------------------------------------------------------------
  /** @returns {boolean} the run keeps the single ironman slot (B-16 `saves: 'ironman'`: Hardcore). */
  function hardcore(s) {
    var d = s && s.mode && s.mode.difficulty;
    var row = d && SR.tuning.difficulty && SR.tuning.difficulty[d];
    return row ? row.saves === 'ironman' : d === 'hardcore';
  }
  function running() { return !!(SR.state && !SR.state.over); }

  /** @returns {{slot: string, meta: object}|null} the most recent readable save (Continue). */
  function latest() {
    var best = null;
    (SR.save ? SR.save.list() : []).forEach(function (e) {
      if (e.broken || !e.meta) return;
      if (!best || (e.meta.savedAt || 0) > (best.meta.savedAt || 0)) best = e;
    });
    return best;
  }

  /** Where a loaded game starts: the cell, a buyer still waiting on a trip, else the city. */
  function resume() {
    var s = SR.state;
    if (!s) { SR.scenes.go('title'); return; }
    if (s.over && !s.mode.keepPlaying && SR.reg.scene.results) { SR.scenes.go('results', { reason: s.result && s.result.reason, result: s.result }); return; }
    if (s.jail && SR.reg.scene.jail) { SR.scenes.go('jail', { resume: true }); return; }
    var T = SR.rules.trade, off = T && typeof T.pending === 'function' ? T.pending(s) : null;
    if (off && off.kind === 'smuggle' && SR.reg.scene.bustrip) { SR.scenes.go('bustrip', { resume: true }); return; }
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title');
  }

  /** The toast for a read that failed (SR.save.lastError: newer, or quarantined). */
  function readFailed() {
    var e = SR.save.lastError;
    toast(e && e.reason === 'newer' ? 'ui.save.newer' : 'ui.save.broken', null, 'warning');
  }

  /**
   * Makes a slot or a state the live game (SR.save.load) and resumes it.
   * @returns {boolean} loaded
   */
  function load(x) {
    var s = null;
    try { s = SR.save.load(x); } catch (e) { s = null; }
    if (!s) { readFailed(); return false; }
    resume();
    return true;
  }

  /** Continue (UI §3): the latest of suspend / auto / slots. @returns {boolean} */
  function continueLatest() {
    var e = latest();
    if (!e) { D().refuse(null, text('ui.save.none')); return false; }
    return load(e.slot);
  }

  /**
   * Suspend (Suspend & quit; before Classic mode): the suspend slot, deleted when it is loaded; a
   * Hardcore run writes its ironman slot, marked in progress.
   * @returns {object|null} the written meta
   */
  function suspend() {
    var s = SR.state;
    if (!s || s.over) return null;
    if (hardcore(s)) { s.mode.inProgress = true; return SR.save.write('ironman'); }
    return SR.save.write('suspend');
  }

  function slotName(slot) { return text('ui.save.slot.' + slot); }
  function when(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return text('ui.save.savedAt', { date: d.toLocaleDateString(), time: SR.text.time(d.getHours() * 60 + d.getMinutes()) });
  }

  /** Copies text (the clipboard, else a read-only, pre-selected textarea in a modal). */
  function copyText(str, title, id) {
    var fallback = function () {
      var area = h('textarea', { class: 'sl-code', 'data-id': id + '-text', readonly: true, rows: '6', spellcheck: 'false', 'aria-label': text(title), 'data-nav': '' });
      area.value = str;
      area.addEventListener('focus', function () { area.select(); });
      var body = h('div', null, h('p', { class: 'modal-text' }, text('ui.save.copyHint')), area);
      SR.ui.modal.open({ id: id, title: title, body: body, actions: [{ id: 'ok', label: 'ui.close', variant: 'primary' }] });
      setTimeout(function () { try { area.focus(); area.select(); } catch (e) { /* ignore */ } }, 0);
      return { copied: false, fallback: true };
    };
    var clip = null;
    try { clip = navigator.clipboard; } catch (e) { clip = null; }
    if (!clip || typeof clip.writeText !== 'function') return Promise.resolve(fallback());
    var p;
    try { p = clip.writeText(str); } catch (e) { return Promise.resolve(fallback()); }
    return Promise.resolve(p).then(function () { return { copied: true, fallback: false }; }, fallback);
  }

  // ------------------------------------------------------------------------------------------------
  // The overlay
  // ------------------------------------------------------------------------------------------------
  var V = null;   // the open screen: { root, params, mode, list, more, scope, file }

  function close() {
    var top = SR.scenes.top();
    if (top && top.id === 'saveload') SR.scenes.pop();
  }

  function confirmLoad() {
    if (!running()) return Promise.resolve(true);
    return SR.ui.confirm({ id: 'sl-confirm-load', title: 'ui.save.loadTitle', text: 'ui.save.loadText', yes: 'ui.save.load', danger: true });
  }

  function doSave(slot, btn) {
    var go = function () {
      try {
        SR.save.write(slot);
        toast('ui.save.saved', { slot: slotName(slot) }, 'info');
      } catch (e) {
        var code = e && (e.code || e.reason);
        toast(code === 'quota' ? 'ui.save.full' : code === 'hardcore' ? 'ui.save.hardcore' : 'ui.save.failed', null, 'warning');
        D().refuse(btn);
      }
      render();
    };
    var meta = SR.save.list().filter(function (e) { return e.slot === slot; })[0];
    if (!meta) { go(); return; }
    SR.ui.confirm({ id: 'sl-confirm-save', title: 'ui.save.replaceTitle', text: 'ui.save.replaceText', vars: { slot: slotName(slot) }, yes: 'ui.save.saveHere' })
      .then(function (ok) { if (ok) go(); });
  }

  function doLoad(slot) {
    confirmLoad().then(function (ok) {
      if (!ok) return;
      if (!load(slot)) render();
    });
  }

  function doDelete(slot) {
    SR.ui.confirm({ id: 'sl-confirm-delete', title: 'ui.save.deleteTitle', text: 'ui.save.deleteText', vars: { slot: slotName(slot) }, yes: 'ui.save.delete', danger: true })
      .then(function (ok) {
        if (!ok) return;
        SR.save.remove(slot);
        toast('ui.save.deleted', { slot: slotName(slot) });
        render();
      });
  }

  function importState(state) {
    confirmLoad().then(function (ok) {
      if (!ok) return;
      if (!load(state)) render();
    });
  }

  function importError(e) {
    var r = e && (e.reason || e.code);
    return r === 'code' ? 'ui.save.badCode' : r === 'checksum' ? 'ui.save.damaged' : r === 'newer' ? 'ui.save.newer' : 'ui.save.unreadable';
  }

  /** The slots this screen shows: Hardcore only its ironman slot; else 1-3, Auto, Suspend (and a Hardcore run's slot when no game runs). */
  function slots(list) {
    if (SR.state && !SR.state.over && hardcore(SR.state)) return ['ironman'];
    var out = SHOWN.slice();
    if (!running() && list.some(function (e) { return e.slot === 'ironman'; })) out.push('ironman');
    return out;
  }

  function cardFor(slot, entry) {
    var mode = V.mode;
    var hc = running() && hardcore(SR.state);
    var head = h('h3', { class: 'sl-name' }, slotName(slot));
    var body = h('div', { class: 'sl-info' }, head);
    var btns = h('div', { class: 'sl-btns' });
    var canSave = mode === 'save' && running() && !hc && MANUAL.indexOf(slot) >= 0;
    if (entry && entry.broken) {
      body.appendChild(h('p', { class: 'sl-line sl-broken' }, text('ui.save.broken')));
    } else if (entry && entry.meta) {
      var m = entry.meta;
      SR.ui.title.metaLines(m).forEach(function (ln, i) { body.appendChild(h('p', { class: i ? 'sl-line' : 'sl-line sl-who' }, ln)); });
      if (m.inProgress) body.appendChild(h('p', { class: 'sl-line sl-progress' }, text('ui.save.inProgress', { day: m.day, time: SR.text.time(m.min || 0) })));
      body.appendChild(h('p', { class: 'sl-line sl-when' }, when(m.savedAt)));
    } else {
      body.appendChild(h('p', { class: 'sl-line sl-empty' }, text('ui.save.empty')));
    }
    if (canSave) btns.appendChild(SR.ui.button({ id: 'sl-save-' + slot, label: 'ui.save.saveHere', size: 's', variant: 'primary', onClick: function (ev) { doSave(slot, ev && ev.currentTarget); } }));
    if (entry && entry.meta && !entry.broken) btns.appendChild(SR.ui.button({ id: 'sl-load-' + slot, label: 'ui.save.load', size: 's', variant: mode === 'load' ? 'primary' : 'secondary', onClick: function () { doLoad(slot); } }));
    if (entry && !(hc && slot === 'ironman')) btns.appendChild(SR.ui.button({ id: 'sl-delete-' + slot, label: 'ui.save.delete', size: 's', variant: 'ghost', onClick: function () { doDelete(slot); } }));
    return h('li', { class: 'sl-card paper', 'data-id': 'slot-' + slot }, SR.ui.title.thumb(entry && entry.meta, 'sl-thumb'), body, btns);
  }

  function buildMore() {
    var more = h('div', { class: 'sl-more', 'data-id': 'sl-more' });
    var hc = running() && hardcore(SR.state);
    var source = running() ? null : latest();
    var canExport = running() || !!source;
    more.appendChild(h('div', { class: 'sl-more-row' },
      SR.ui.button({ id: 'sl-copy', label: 'ui.save.copy', size: 's', disabled: !canExport, reason: 'ui.save.nothing', onClick: function () {
        if (running()) {
          SR.save.copyCode().then(function (r) { if (r && r.copied) toast('ui.save.copied'); });
          return;
        }
        var code;
        try { code = SR.save.exportCode(source.slot); } catch (e) { toast('ui.save.failed', null, 'warning'); return; }
        copyText(code, 'ui.save.codeTitle', 'sl-code-modal').then(function (r) { if (r && r.copied) toast('ui.save.copied'); });
      } }),
      SR.ui.button({ id: 'sl-download', label: 'ui.save.download', size: 's', disabled: !canExport, reason: 'ui.save.nothing', onClick: function () {
        try { SR.save.exportFile(running() ? undefined : source.slot); } catch (e) { toast('ui.save.failed', null, 'warning'); }
      } })));
    if (!hc) {
      var field = SR.ui.textField({ id: 'sl-paste', label: 'ui.save.pasteLabel', paste: true, placeholder: 'ui.save.pasteHint',
        onSubmit: function (v) { importCode(v); } });
      var file = h('input', { type: 'file', class: 'vh', accept: FILE_TYPES, 'data-id': 'sl-file', tabindex: '-1', 'aria-hidden': 'true' });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        SR.save.importFile(f).then(importState, function (e) { toast(importError(e), null, 'warning'); });
        file.value = '';
      });
      V.file = file;
      V.paste = field;
      more.appendChild(h('div', { class: 'sl-more-row' }, field,
        SR.ui.button({ id: 'sl-paste-go', label: 'ui.save.pasteGo', size: 's', onClick: function () { importCode(field.value); } })));
      more.appendChild(h('div', { class: 'sl-more-row' }, file,
        SR.ui.button({ id: 'sl-import', label: 'ui.save.import', size: 's', onClick: function () { file.click(); } })));
    }
    return more;
  }

  function importCode(v) {
    var state;
    try { state = SR.save.importCode(v); } catch (e) {
      if (V && V.paste) V.paste.update({ error: importError(e) });
      D().refuse(V && V.paste ? V.paste.input : null);
      return;
    }
    if (V && V.paste) V.paste.update({ error: '' });
    importState(state);
  }

  function render() {
    if (!V) return;
    var had = SR.ui.focus.focused();
    var hadId = had && had.getAttribute('data-id');
    var list = SR.save.list();
    if (SR.ui.tooltip && SR.ui.tooltip.hide) SR.ui.tooltip.hide();   // a card's tip would outlive the card
    D().clear(V.list);
    slots(list).forEach(function (slot) {
      V.list.appendChild(cardFor(slot, list.filter(function (e) { return e.slot === slot; })[0]));
    });
    D().clear(V.moreBox);
    if (V.moreOpen) V.moreBox.appendChild(buildMore());
    V.moreBtn.update({ label: V.moreOpen ? 'ui.save.less' : 'ui.save.more' });
    V.moreBtn.setAttribute('aria-expanded', V.moreOpen ? 'true' : 'false');
    if (V.seg) V.seg.update({ value: V.mode });
    var back = hadId ? V.panel.querySelector('[data-id="' + hadId + '"]') : null;
    if (back) SR.ui.focus.focus(back);
    else if (V.scope && !SR.ui.focus.focused()) SR.ui.focus.first(V.scope);
  }

  function mount(root, params) {
    params = params || {};
    var hc = running() && hardcore(SR.state);
    var mode = params.mode === 'save' && running() && !hc ? 'save' : 'load';
    V = { root: root, params: params, mode: mode, moreOpen: !!params.more };
    root.classList.add('modal-root');
    root.appendChild(h('div', { class: 'scrim', 'data-id': 'scrim' }));
    var head = h('div', { class: 'sl-head' }, h('h2', { class: 't-h2', 'data-id': 'sl-title' }, text(mode === 'save' ? 'ui.save.titleSave' : 'ui.save.titleLoad')));
    V.title = head.firstChild;
    if (running() && !hc) {
      V.seg = SR.ui.segmented({ id: 'sl-mode', label: 'ui.save.mode', value: mode,
        options: [{ id: 'save', label: 'ui.save.save' }, { id: 'load', label: 'ui.save.load' }],
        onChange: function (id) { V.mode = id; V.title.textContent = text(id === 'save' ? 'ui.save.titleSave' : 'ui.save.titleLoad'); render(); } });
      head.appendChild(V.seg);
    }
    if (hc) head.appendChild(h('p', { class: 'sl-note' }, text('ui.save.ironman')));
    V.list = h('ul', { class: 'sl-list scroll-y', 'data-id': 'sl-list', 'aria-label': text('ui.save.slots') });
    V.moreBtn = SR.ui.button({ id: 'sl-more-toggle', label: 'ui.save.more', size: 's', variant: 'ghost', onClick: function () { V.moreOpen = !V.moreOpen; render(); } });
    V.moreBox = h('div', { class: 'sl-more-box' });
    var foot = h('div', { class: 'sl-foot' }, V.moreBtn, SR.ui.button({ id: 'sl-close', label: 'ui.close', hint: 'back', onClick: close }));
    V.panel = h('section', { class: 'sl-panel paper', role: 'dialog', 'aria-modal': 'true', 'aria-label': text('ui.save.title'), 'data-id': 'saveload' },
      head, V.list, V.moreBox, foot);
    root.appendChild(V.panel);
    render();
    V.scope = SR.ui.focus.push(V.panel, { id: 'saveload' });
    D().sfx('open');
  }

  function unmount() {
    if (V && V.scope) SR.ui.focus.pop(V.scope);
    V = null;
  }

  SR.scenes.register('saveload', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: { mount: mount, unmount: unmount },
    resume: function () { render(); },
    onAction: function (action, ev) {
      if (ev && (ev.consumed || ev.down === false)) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back' && !(ev && ev.repeat)) { D().sfx('close'); close(); return true; }
      return action === 'pause' || action === 'pocket';
    },
    /** @returns {object|null} the open screen (tests). */
    info: function () {
      return V ? { mode: V.mode, more: V.moreOpen, slots: Array.prototype.map.call(V.list.querySelectorAll('[data-id^="slot-"]'), function (c) { return c.getAttribute('data-id').slice(5); }) } : null;
    },
  });

  SR.ui.saveload = {
    latest: latest,
    continueLatest: continueLatest,
    load: load,
    resume: resume,
    suspend: suspend,
    hardcore: hardcore,
    copyText: copyText,
    SLOTS: SHOWN.slice(),
  };
})();
