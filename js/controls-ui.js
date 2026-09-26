// The Controls page (Help and Options > Controls): key rebinding with presets, keyboard fire feel, mouse aim
// and fire modes, and the fixed gamepad layout. Renders into #controls-root; settings live on the Input object.
'use strict';
(function () {
  const GW = window.GW;

  // ---- key labels -------------------------------------------------------------------------------------

  const NAMES = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt', MetaLeft: 'L Meta', MetaRight: 'R Meta', ContextMenu: 'Menu',
    Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'Pg Up', PageDown: 'Pg Dn',
    NumpadEnter: 'Num Enter', NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num *',
    NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumLock: 'Num Lock',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\',
  };
  let layout = null; // navigator.keyboard layout map, when the browser shares it
  let layoutAsked = false;

  function keyLabel(code) {
    if (layout && typeof layout.get === 'function' && !/^(Numpad|Arrow)/.test(code)) {
      const ch = layout.get(code);
      if (ch && ch.trim()) return ch.toUpperCase();
    }
    if (NAMES[code]) return NAMES[code];
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^Numpad(\d)$/.exec(code))) return 'Num ' + m[1];
    return code;
  }

  function askLayout() {
    if (layoutAsked) return;
    layoutAsked = true;
    try {
      const kb = navigator.keyboard;
      if (!kb || typeof kb.getLayoutMap !== 'function') return;
      Promise.resolve(kb.getLayoutMap()).then((map) => {
        layout = map;
        if (state.input) render();
      }).catch(() => {});
    } catch (err) { /* e.g. SecurityError in a cross-origin frame: keep QWERTY names */ }
  }

  // ---- state and rendering ----------------------------------------------------------------------------

  const CYCLES = {
    preset: { label: 'Keyboard layout', values: [['classic', 'Classic'], ['esdf', 'ESDF'], ['lefty', 'Left-handed']] },
    socd: { label: 'Opposite keys', values: [['last', 'Last pressed wins'], ['neutral', 'Cancel out']] },
    kbAim: { label: 'Key firing', values: [['smooth', 'Smooth'], ['snap', 'Snap']] },
    aimMode: { label: 'Mouse aim', values: [['cursor', 'Cursor'], ['locked', 'Locked to ship']] },
    sens: { label: 'Sensitivity', values: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((v) => [v, v.toFixed(2) + '×']) },
    autofire: { label: 'Mouse fire', values: [['hold', 'Hold button'], ['auto', 'Automatic']] },
  };
  const MAX_KEYS = 5;

  const state = { input: null, root: null, capture: null, msg: '' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function cycleHtml(key) {
    const c = CYCLES[key], ctl = state.input.controls;
    let v = c.values.find((x) => x[0] === ctl[key]);
    if (!v) v = key === 'preset' && ctl.preset === 'custom' ? ['custom', 'Custom'] : c.values[0];
    const hidden = key === 'sens' && ctl.aimMode !== 'locked';
    return `<button class="ctl-cycle" data-ctl="${key}"${hidden ? ' hidden' : ''}><span>${c.label}</span><em>‹ ${esc(v[1])} ›</em></button>`;
  }

  function rowHtml(action, label) {
    const list = state.input.controls.bindings[action];
    const cap = state.capture;
    const chips = list.map((code, i) => {
      if (action === 'pause' && code === 'Escape') return `<span class="ctl-key fixed" title="Esc always pauses">${esc(keyLabel(code))}</span>`;
      const on = cap && cap.action === action && cap.i === i;
      return `<button class="ctl-key${on ? ' capturing' : ''}" data-action="${action}" data-i="${i}">${on ? 'Press a key…' : esc(keyLabel(code))}</button>`;
    });
    if (list.length < MAX_KEYS) {
      const on = cap && cap.action === action && cap.i === -1;
      chips.push(`<button class="ctl-key add${on ? ' capturing' : ''}" data-action="${action}" data-i="-1" aria-label="Add a key for ${esc(label)}">${on ? 'Press a key…' : '+'}</button>`);
    }
    return `<div class="ctl-row"><span class="ctl-act">${esc(label)}</span><span class="ctl-keys">${chips.join('')}</span></div>`;
  }

  function render() {
    const root = state.root;
    if (!root || !state.input) return;
    const focused = document.activeElement && root.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    const A = GW.Input.ACTIONS;
    root.innerHTML = `
      <div class="ctl">
        <div class="ctl-col ctl-kb">
          <h3>Keyboard</h3>
          ${cycleHtml('preset')}
          <div class="ctl-rows">${A.map(([a, l]) => rowHtml(a, l)).join('')}</div>
          ${cycleHtml('socd')}
          ${cycleHtml('kbAim')}
          <button class="ctl-reset" data-ctl-reset>Reset to defaults</button>
          <p class="ctl-msg" aria-live="polite">${esc(state.msg)}</p>
        </div>
        <div class="ctl-col">
          <h3>Mouse</h3>
          ${cycleHtml('aimMode')}
          ${cycleHtml('sens')}
          ${cycleHtml('autofire')}
          <ul class="ctl-fixed">
            <li><b>Fire</b><span>Left button</span></li>
            <li><b>Bomb</b><span>Right, middle or side buttons</span></li>
          </ul>
          <h3>Gamepad</h3>
          <ul class="ctl-fixed ctl-pad">
            <li>Movement: Left stick</li>
            <li>Firing: Right stick</li>
            <li>Bomb: Triggers</li>
            <li>Pause: Start</li>
          </ul>
        </div>
      </div>`;
    if (focused) {
      const el = root.querySelector(focused);
      if (el) el.focus({ preventScroll: true });
    }
  }

  function focusKey(el) {
    if (el.dataset.ctl) return `[data-ctl="${el.dataset.ctl}"]`;
    if (el.hasAttribute('data-ctl-reset')) return '[data-ctl-reset]';
    if (el.dataset.action) return `.ctl-key[data-action="${el.dataset.action}"][data-i="${el.dataset.i}"]`;
    return null;
  }

  function say(msg) {
    state.msg = msg;
    const p = state.root && state.root.querySelector('.ctl-msg');
    if (p) p.textContent = msg;
  }

  const actionLabel = (a) => (GW.Input.ACTIONS.find((x) => x[0] === a) || [a, a])[1];

  // ---- cycling ----------------------------------------------------------------------------------------

  function adjustControl(el, dir) {
    const input = state.input;
    if (!input || !el || !el.dataset || !CYCLES[el.dataset.ctl]) return false;
    const key = el.dataset.ctl;
    const vals = CYCLES[key].values;
    let i = vals.findIndex((x) => x[0] === input.controls[key]);
    if (i < 0) i = dir > 0 ? -1 : 0;
    i = (i + dir + vals.length) % vals.length;
    input.setControl(key, vals[i][0]);
    if (key === 'preset') say(`${vals[i][1]} layout`);
    render();
    const a = GW.debug && GW.debug.audio;
    if (a && a.play) a.play('menu');
    return true;
  }

  // ---- key capture ------------------------------------------------------------------------------------

  function startCapture(action, i) {
    stopCapture();
    state.capture = { action, i };
    say(`Press a key for ${actionLabel(action)}. Esc cancels${i >= 0 ? ', Delete removes' : ''}.`);
    addEventListener('keydown', onCaptureKey, true);
    addEventListener('keyup', swallow, true);
    addEventListener('pointerdown', onCapturePointer, true);
    render();
  }

  function stopCapture() {
    if (!state.capture) return;
    state.capture = null;
    removeEventListener('keydown', onCaptureKey, true);
    removeEventListener('pointerdown', onCapturePointer, true);
    // Swallow the matching keyup a moment longer so it does not reach the menus.
    setTimeout(() => removeEventListener('keyup', swallow, true), 0);
  }

  function swallow(e) { e.stopImmediatePropagation(); }

  function pageVisible() {
    const scr = document.getElementById('scr-controls');
    return !!(state.root && state.root.isConnected && state.root.offsetParent !== null && (!scr || scr.classList.contains('active') || scr.offsetParent !== null));
  }

  function onCaptureKey(e) {
    if (!state.capture) return;
    if (!pageVisible()) { stopCapture(); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const { action, i } = state.capture;
    const code = e.code;
    const refocus = () => {
      const el = state.root && state.root.querySelector(`.ctl-key[data-action="${action}"][data-i="${i}"]`) ||
        state.root.querySelector(`.ctl-key[data-action="${action}"]`);
      if (el) el.focus({ preventScroll: true });
    };
    if (code === 'Escape' || !code || code === 'Unidentified') {
      stopCapture(); say('Cancelled.'); render(); refocus(); return;
    }
    if ((code === 'Delete' || code === 'Backspace') && i >= 0) {
      stopCapture();
      state.input.unbind(action, i);
      say(`Key removed from ${actionLabel(action)}.`);
      render(); refocus(); return;
    }
    if (code === 'KeyM') { say('M is reserved for mute. Press another key, or Esc to cancel.'); return; }
    stopCapture();
    const r = state.input.bind(action, code, i);
    const moved = r.moved.length ? ` (moved from ${r.moved.join(', ')})` : '';
    say(`${keyLabel(code)} bound to ${actionLabel(action)}${moved}.`);
    render();
    refocus();
  }

  function onCapturePointer(e) {
    if (e.target && e.target.closest && e.target.closest('.ctl-key.capturing')) return;
    stopCapture();
    say('');
    render();
  }

  // ---- entry points -----------------------------------------------------------------------------------

  function renderControls(input) {
    const root = document.getElementById('controls-root');
    if (!root || !input || !input.controls) return;
    state.input = input;
    if (state.root !== root) {
      state.root = root;
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', onKeydown);
    }
    stopCapture();
    state.msg = '';
    askLayout();
    render();
  }

  function onClick(e) {
    const b = e.target.closest && e.target.closest('button');
    if (!b || !state.root.contains(b)) return;
    if (b.classList.contains('ctl-cycle')) { adjustControl(b, 1); return; }
    if (b.hasAttribute('data-ctl-reset')) {
      stopCapture();
      state.input.resetControls();
      say('Controls reset to Classic.');
      render();
      const r = state.root.querySelector('[data-ctl-reset]');
      if (r) r.focus({ preventScroll: true });
      return;
    }
    if (b.classList.contains('ctl-key') && b.dataset.action) {
      const i = +b.dataset.i;
      if (state.capture && state.capture.action === b.dataset.action && state.capture.i === i) return;
      startCapture(b.dataset.action, i);
      const el = state.root.querySelector(`.ctl-key[data-action="${b.dataset.action}"][data-i="${i}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // Cycle buttons handle left / right themselves so the menu code does not also move focus.
  function onKeydown(e) {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('ctl-cycle')) return;
    const d = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    adjustControl(el, d);
  }

  GW.renderControls = renderControls;
  GW.adjustControl = adjustControl;
  GW.keyLabel = keyLabel;
})();
