// js/ui/screens/settings.js — owner: W2-Front. The `settings` overlay (UI §5.15, §8; ARCHITECTURE §16):
// tabs Game · Controls · Audio · Display · Accessibility; every change applies live and is saved at
// once through SR.settings (the kernel, the audio engine, the render core and W1-D's accessibility
// classes follow settings:changed). Q / E (LB / RB) switch tabs (the `tabs` input context).
//   Game: 24 h clock, hints on later runs, "Tutorial for this game" (only while a game runs; it writes
//     the save's mode.tutorial), always Auto for hustles, confirm spends over $, hold Enter to repeat,
//     right-click = back, skate toggle, minimap, minimal HUD.
//   Controls: remap the keyboard and the gamepad per action, globally and per input context (the
//     `tabs` context and every minigame engine's context): "Change key" / "Change button" wait for the
//     next key or pad button (Esc cancels), a conflict warning names the other action on that key,
//     and "Reset to defaults" restores the context.
//   Audio: Master, Music, SFX, Ambience, UI sliders; mono. Display: quality, fps cap, fullscreen,
//     screen shake, lean (P2 `lean`). Accessibility: text size, high contrast, colour-blind palette,
//     reduced motion, flash reduction, captions, Assist with its Safe edges and No gusts, typewriter
//     speed, vibration.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var TABS = ['game', 'controls', 'audio', 'display', 'access'];
  var VOLUMES = ['master', 'music', 'sfx', 'ambience', 'ui'];
  var VOLUME_STEP = 0.05;
  var SPEND_STEP = 100, SPEND_MAX = 1000000;     // the confirm-spend NumberField ($)
  var STATE_KEYS_MAX = 40;                       // pad buttons polled while waiting for a remap

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }
  function get(key) { try { return SR.settings.get(key); } catch (e) { return undefined; } }
  function set(key, value) {
    try { SR.settings.set(key, value); return true; } catch (e) {
      SR.util.warnOnce('settings.' + key, 'settings: ' + e.message);
      return false;
    }
  }
  function running() { return !!(SR.state && !SR.state.over); }

  var S = null;   // the open screen: { root, panel, tabs, body, tab, scope, ctxPop, capture, ctx, notes }

  // ------------------------------------------------------------------------------------------------
  // Rows
  // ------------------------------------------------------------------------------------------------
  function row(key, control, extra) {
    return h('div', { class: ['set-row', extra || ''], 'data-id': 'set-row-' + key }, control);
  }
  function toggleRow(key, label, opts) {
    opts = opts || {};
    var value = opts.get ? opts.get() : !!get(key);
    return row(key, SR.ui.toggle({ id: 'set-' + key, label: label, value: value, disabled: opts.disabled, reason: opts.reason,
      onChange: function (v) { if (opts.set) opts.set(v); else set(key, v); } }), opts.cls);
  }
  function segRow(key, label, options, opts) {
    opts = opts || {};
    var cur = String(get(key));
    var seg = SR.ui.segmented({ id: 'set-' + key, label: label, value: cur,
      options: options.map(function (o) { return { id: String(o.value), label: text(o.label, o.vars) }; }),
      onChange: function (id) {
        var hit = options.filter(function (o) { return String(o.value) === id; })[0];
        if (hit) set(key, hit.value);
      } });
    return row(key, h('div', { class: 'set-seg' }, h('span', { class: 'set-label', 'aria-hidden': 'true' }, text(label)), seg));
  }
  function sliderRow(key, label) {
    return row(key, SR.ui.slider({ id: 'set-' + key, label: label, value: Number(get(key)) || 0, min: 0, max: 1, step: VOLUME_STEP,
      onChange: function (v) { set(key, Math.round(v * 100) / 100); } }));
  }

  // ------------------------------------------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------------------------------------------
  function tabGame(box) {
    ['clock24', 'hints'].forEach(function (k) { box.appendChild(toggleRow('game.' + k, 'set.game.' + k)); });
    if (running()) {
      box.appendChild(toggleRow('game.tutorial', 'set.game.tutorial', {
        get: function () { return !!SR.state.mode.tutorial; },
        set: function (v) { if (running()) SR.state.mode.tutorial = !!v; },
      }));
    }
    box.appendChild(toggleRow('game.alwaysAuto', 'set.game.alwaysAuto'));
    box.appendChild(row('game.confirmSpendOver', SR.ui.numberField({ id: 'set-game.confirmSpendOver', label: 'set.game.confirmSpendOver',
      value: Number(get('game.confirmSpendOver')) || 0, min: 0, max: SPEND_MAX, step: SPEND_STEP, money: true,
      onChange: function (v) { set('game.confirmSpendOver', v); } })));
    ['holdRepeat', 'rightClickBack', 'skateToggle', 'minimap', 'minimalHud'].forEach(function (k) { box.appendChild(toggleRow('game.' + k, 'set.game.' + k)); });
  }

  function tabAudio(box) {
    VOLUMES.forEach(function (k) { box.appendChild(sliderRow('audio.' + k, 'set.audio.' + k)); });
    box.appendChild(toggleRow('audio.mono', 'set.audio.mono'));
  }

  function tabDisplay(box) {
    box.appendChild(segRow('display.quality', 'set.display.quality', ['auto', 'high', 'medium', 'low'].map(function (q) { return { value: q, label: 'set.display.quality.' + q }; })));
    box.appendChild(segRow('display.fpsCap', 'set.display.fpsCap', [60, 30].map(function (n) { return { value: n, label: 'set.display.fps', vars: { n: n } }; })));
    box.appendChild(toggleRow('display.fullscreen', 'set.display.fullscreen', {
      set: function (v) {
        var st = SR.stage;
        if (!st || typeof st.fullscreen !== 'function') { set('display.fullscreen', v); return; }
        Promise.resolve(st.fullscreen(v)).then(function (on) { set('display.fullscreen', !!on); }, function () { set('display.fullscreen', false); })
          .then(function () { if (S && S.tab === 'display') showTab('display'); });
      },
    }));
    box.appendChild(toggleRow('display.screenShake', 'set.display.screenShake'));
    if (SR.features.lean) box.appendChild(toggleRow('display.lean', 'set.display.lean'));
  }

  function tabAccess(box) {
    box.appendChild(segRow('access.textScale', 'set.access.textScale', [1, 1.25, 1.5].map(function (n) { return { value: n, label: 'ui.pct', vars: { n: Math.round(n * 100) } }; })));
    box.appendChild(toggleRow('access.highContrast', 'set.access.highContrast'));
    box.appendChild(segRow('access.colorblind', 'set.access.colorblind', ['none', 'protan', 'deutan', 'tritan'].map(function (c) { return { value: c, label: 'set.access.colorblind.' + c }; })));
    box.appendChild(segRow('access.reducedMotion', 'set.access.reducedMotion', [
      { value: 'system', label: 'set.access.reducedMotion.system' }, { value: 'on', label: 'ui.on' }, { value: 'off', label: 'ui.off' }]));
    ['flashReduction', 'captions', 'assist'].forEach(function (k) { box.appendChild(toggleRow('access.' + k, 'set.access.' + k)); });
    ['safeEdges', 'noGusts'].forEach(function (k) { box.appendChild(toggleRow('access.' + k, 'set.access.' + k, { cls: 'set-sub' })); });
    box.appendChild(segRow('access.typewriterCps', 'set.access.typewriterCps', [30, 60, 120, 0].map(function (n) {
      return n ? { value: n, label: 'set.access.cps', vars: { n: n } } : { value: 0, label: 'set.access.typewriterCps.instant' };
    })));
    box.appendChild(toggleRow('access.haptics', 'set.access.haptics'));
  }

  // ---- Controls (remapping) ----
  /** @returns {string[]} the input contexts Settings › Controls remaps: tabs, then every engine's. */
  function contexts() {
    var out = ['global', 'tabs'];
    var M = SR.reg.minigame || {};
    Object.keys(M).sort().forEach(function (id) {
      var c = M[id].context || id;
      if (M[id].keys && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  /** @returns {string[]} the actions of a context, in their default order. */
  function actionsOf(ctx) {
    if (ctx === 'global') return SR.input.actions();
    var d = SR.input.defaults().contexts[ctx];
    if (d) return Object.keys(d);
    var M = SR.reg.minigame || {};
    for (var id in M) if ((M[id].context || id) === ctx && M[id].keys) return Object.keys(M[id].keys);
    return [];
  }
  function bindingsOf(action, ctx) { return SR.input.bindings(action, ctx === 'global' ? undefined : ctx); }
  function isPad(b) { return /^Pad\d+$/.test(b); }
  function uniq(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }); }
  function glyph(b) { return SR.ui.keyHint && SR.ui.keyHint.glyph ? SR.ui.keyHint.glyph(b) : b; }
  function actionLabel(a) {
    if (SR.text.has('set.act.' + a)) return text('set.act.' + a);
    var m = /^([a-z]+?)(\d+)$/i.exec(a);
    if (m && SR.text.has('set.act.' + m[1] + 'N')) return text('set.act.' + m[1] + 'N', { n: m[2] });
    return a;
  }
  function contextLabel(c) { return SR.text.has('set.ctx.' + c) ? text('set.ctx.' + c) : c; }

  /** The other actions of the context bound to this binding (the conflict warning). */
  function conflicts(action, ctx, code) {
    return actionsOf(ctx).filter(function (a) { return a !== action && bindingsOf(a, ctx).indexOf(code) >= 0; });
  }

  function applyBinding(action, ctx, device, code) {
    var cur = bindingsOf(action, ctx);
    var keep = cur.filter(function (b) { return device === 'pad' ? !isPad(b) : isPad(b); });
    var list = device === 'pad' ? keep.concat([code]) : [code].concat(keep);
    try { SR.input.bind(action, list, ctx === 'global' ? undefined : ctx); } catch (e) { SR.util.warnOnce('settings.bind', 'settings: ' + e.message); return; }
    var c = conflicts(action, ctx, code);
    S.notes[ctx + ':' + action] = c.length ? text('set.controls.conflict', { action: c.map(actionLabel).join(', ') }) : '';
    D().sfx('confirm');
  }

  function startCapture(action, ctx, device) {
    S.capture = { action: action, ctx: ctx, device: device, pads: padSnapshot() };
    showTab('controls');
    D().announce(text('set.controls.press'));
  }
  function stopCapture() { S.capture = null; showTab('controls'); }

  function padSnapshot() {
    var out = {};
    var pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    for (var i = 0; pads && i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.buttons) continue;
      for (var b = 0; b < p.buttons.length && b < STATE_KEYS_MAX; b++) if (p.buttons[b] && p.buttons[b].pressed) out[b] = true;
    }
    return out;
  }
  /** While waiting for a pad button: the first newly pressed one. */
  function pollPad() {
    if (!S || !S.capture || S.capture.device !== 'pad') return;
    var now = padSnapshot(), was = S.capture.pads;
    for (var b in now) {
      if (!was[b]) { var c = S.capture; S.capture = null; applyBinding(c.action, c.ctx, 'pad', 'Pad' + b); showTab('controls'); return; }
    }
    S.capture.pads = now;
  }
  /** While waiting for a key: the next key down is the new binding (Esc cancels); nothing else sees it. */
  function onCaptureKey(e) {
    if (!S || !S.capture || S.capture.device !== 'kb') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;               // the auto-repeat of the Enter that pressed "Change key" is not a choice
    var code = e.code || '';
    if (code === 'Escape' || !/^[A-Z][A-Za-z0-9]*$/.test(code)) { stopCapture(); return; }
    var c = S.capture;
    S.capture = null;
    applyBinding(c.action, c.ctx, 'kb', code);
    showTab('controls');
  }

  function resetContext(ctx) {
    if (ctx === 'global') { set('controls.keys', {}); set('controls.pad', {}); }
    else {
      var all = get('controls.contexts') || {};
      if (all[ctx]) { delete all[ctx]; set('controls.contexts', all); }
    }
    Object.keys(S.notes).forEach(function (k) { if (k.indexOf(ctx + ':') === 0) delete S.notes[k]; });
    D().sfx('toggle');
    showTab('controls');
  }

  function tabControls(box) {
    var ctxs = contexts();
    if (ctxs.indexOf(S.ctx) < 0) S.ctx = 'global';
    var pick = h('div', { class: 'set-ctx', role: 'group', 'aria-label': text('set.controls.context'), 'data-id': 'set-ctx' });
    ctxs.forEach(function (c) {
      var b = SR.ui.button({ id: 'set-ctx-' + c, label: contextLabel(c), size: 's', variant: c === S.ctx ? 'primary' : 'secondary',
        onClick: function () { if (S.capture) return; S.ctx = c; showTab('controls'); } });
      b.setAttribute('aria-pressed', c === S.ctx ? 'true' : 'false');
      pick.appendChild(b);
    });
    box.appendChild(h('div', { class: 'set-row set-row--ctx' }, h('span', { class: 'set-label' }, text('set.controls.context')), pick));
    var table = h('div', { class: 'set-binds', role: 'list', 'data-id': 'set-binds' });
    actionsOf(S.ctx).forEach(function (a) {
      var list = bindingsOf(a, S.ctx);
      var kb = uniq(list.filter(function (b) { return !isPad(b); }).map(glyph)).join(' · ') || text('set.controls.none');
      var pad = uniq(list.filter(isPad).map(glyph)).join(' · ') || text('set.controls.none');
      var cap = S.capture && S.capture.action === a && S.capture.ctx === S.ctx ? S.capture.device : null;
      var note = S.notes[S.ctx + ':' + a] || '';
      table.appendChild(h('div', { class: 'set-bind', role: 'listitem', 'data-id': 'set-bind-' + a },
        h('span', { class: 'set-bind-name' }, actionLabel(a)),
        h('span', { class: 'set-bind-keys', 'data-id': 'set-keys-' + a }, cap === 'kb' ? text('set.controls.press') : kb),
        SR.ui.button({ id: 'set-kb-' + a, label: 'set.controls.changeKey', size: 's', variant: cap === 'kb' ? 'primary' : 'ghost',
          onClick: function () { if (S.capture) stopCapture(); else startCapture(a, S.ctx, 'kb'); } }),
        h('span', { class: 'set-bind-keys', 'data-id': 'set-pad-' + a }, cap === 'pad' ? text('set.controls.press') : pad),
        SR.ui.button({ id: 'set-pad-btn-' + a, label: 'set.controls.changePad', size: 's', variant: cap === 'pad' ? 'primary' : 'ghost',
          onClick: function () { if (S.capture) stopCapture(); else startCapture(a, S.ctx, 'pad'); } }),
        note ? h('span', { class: 'set-bind-note', 'data-id': 'set-note-' + a, role: 'status' }, note) : null));
    });
    box.appendChild(table);
    box.appendChild(h('div', { class: 'set-row' }, SR.ui.button({ id: 'set-controls-reset', label: 'set.controls.reset', size: 's', variant: 'secondary',
      onClick: function () { resetContext(S.ctx); } })));
  }

  var BUILD = { game: tabGame, controls: tabControls, audio: tabAudio, display: tabDisplay, access: tabAccess };

  function showTab(id) {
    if (!S) return;
    var had = SR.ui.focus.focused();
    var hadId = had && had.getAttribute('data-id');
    var keepScroll = S.tab === id ? S.body.scrollTop : 0;
    S.tab = id;
    if (SR.ui.tooltip && SR.ui.tooltip.hide) SR.ui.tooltip.hide();   // a stepper's tip would outlive its tab
    D().clear(S.body);
    var box = h('div', { class: 'set-tab', role: 'tabpanel', 'data-id': 'set-tab-' + id, 'aria-label': text('set.tab.' + id) });
    BUILD[id](box);
    S.body.appendChild(box);
    S.body.scrollTop = keepScroll;
    if (S.tabs.value !== id) S.tabs.select(id);
    var back = hadId ? S.panel.querySelector('[data-id="' + hadId + '"]') : null;
    if (back) SR.ui.focus.focus(back);
  }

  function close() {
    var top = SR.scenes.top();
    if (top && top.id === 'settings') { D().sfx('close'); SR.scenes.pop(); }
  }

  function mount(root, params) {
    params = params || {};
    S = { root: root, tab: TABS.indexOf(params.tab) >= 0 ? params.tab : 'game', ctx: 'global', capture: null, notes: {} };
    root.classList.add('modal-root');
    root.appendChild(h('div', { class: 'scrim', 'data-id': 'scrim' }));
    S.tabs = SR.ui.tabs({ id: 'set-tabs', label: 'set.title', value: S.tab,
      tabs: TABS.map(function (id) { return { id: id, label: 'set.tab.' + id }; }),
      onChange: function (id) { if (S.capture) S.capture = null; showTab(id); } });
    S.body = h('div', { class: 'set-body scroll-y', 'data-id': 'set-body' });
    S.panel = h('section', { class: 'set-panel paper', role: 'dialog', 'aria-modal': 'true', 'aria-label': text('set.title'), 'data-id': 'settings' },
      h('div', { class: 'set-head' }, h('h2', { class: 't-h2' }, text('set.title')),
        SR.ui.button({ id: 'set-close', label: 'ui.close', size: 's', hint: 'back', onClick: close })),
      S.tabs, S.body);
    S.tabs.swipe = SR.ui.swipe ? SR.ui.swipe(S.body, function () { S.tabs.next(); }, function () { S.tabs.prev(); }) : null;
    root.appendChild(S.panel);
    showTab(S.tab);
    S.scope = SR.ui.focus.push(S.panel, { id: 'settings' });
    S.ctxPop = SR.input && typeof SR.input.pushContext === 'function' ? SR.input.pushContext('tabs') : null;
    window.addEventListener('keydown', onCaptureKey, true);
    D().sfx('open');
  }

  function unmount() {
    window.removeEventListener('keydown', onCaptureKey, true);
    if (SR.ui.tooltip && SR.ui.tooltip.hide) SR.ui.tooltip.hide();
    if (S) {
      if (S.ctxPop) S.ctxPop();
      if (S.tabs && S.tabs.swipe) S.tabs.swipe();
      if (S.scope) SR.ui.focus.pop(S.scope);
    }
    S = null;
  }

  SR.scenes.register('settings', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: { mount: mount, unmount: unmount },
    update: function () { pollPad(); },
    onAction: function (action, ev) {
      if (!S || (ev && (ev.consumed || ev.down === false))) return false;
      if (S.capture) {                                  // waiting for a key or button: nothing else acts
        if (action === 'back' && S.capture.device === 'pad' && ev && ev.device !== 'pad') stopCapture();
        return true;
      }
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (action === 'tabNext') { S.tabs.next(); return true; }
      if (action === 'tabPrev') { S.tabs.prev(); return true; }
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back' && !(ev && ev.repeat)) { close(); return true; }
      return true;
    },
    /** @returns {object|null} the open tab and the remap state (tests). */
    info: function () {
      return S ? { tab: S.tab, ctx: S.ctx, capture: S.capture ? { action: S.capture.action, ctx: S.capture.ctx, device: S.capture.device } : null,
        contexts: contexts(), notes: SR.util.clone(S.notes) } : null;
    },
  });

  SR.ui.settings = { contexts: contexts, actionsOf: actionsOf, actionLabel: actionLabel };
})();
