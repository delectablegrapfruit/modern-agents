// js/core/input.js — owner: W1-K. SR.input: keyboard, mouse, touch and gamepad → actions
// (ARCHITECTURE §11; docs/CONTRACT.md §12). Scenes and UI listen to actions, never raw keys.
// - Bindings are KeyboardEvent.code strings, 'Pad<n>' (standard gamepad buttons), 'Mouse<n>' and
//   'WheelUp' / 'WheelDown'. Defaults: CONTRACT §12.1; remaps live in settings.controls (keys,
//   pad, contexts) and are applied at once.
// - Context maps (pushContext / popContext) shadow the global meaning of the bindings they list
//   while on top; popping releases whatever the context had pressed, and a key held across the pop
//   stays inert until it is released.
// - Text entry: while an input / textarea / select / contenteditable has focus only Enter
//   (confirm), Esc (back) and Tab (the browser's focus move) act; the pad keeps A (confirm) and
//   B (back).
// - Presses (and key repeats) reach the top scene through SR.scenes.dispatch; SR.input.on
//   listeners get presses, repeats and releases. A listener may set ev.consumed = true to keep a
//   press from the scene. Enter / Space always become actions: js/ui/focus.js suppresses the
//   browser's own activation of focused controls and activates them on `confirm` instead.
// - Gamepads are polled every fixed step (the loop calls poll), dead zone 0.2, D-pad and stick
//   repeats for menus; a pad press is never a user activation (audio, fullscreen).
// - Touch: a floating stick on the left half of canvas#world (move and the digital directions);
//   touch buttons in the DOM call inject(action, down).
// Load-time clean: listeners are attached in a boot hook (Node tests load this file).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // CONTRACT §12.1 (frozen).
  var DEFAULTS = {
    up: ['ArrowUp', 'KeyW', 'Pad12'],
    down: ['ArrowDown', 'KeyS', 'Pad13'],
    left: ['ArrowLeft', 'KeyA', 'Pad14'],
    right: ['ArrowRight', 'KeyD', 'Pad15'],
    interact: ['KeyE', 'Enter', 'NumpadEnter', 'Space', 'Pad0'],
    confirm: ['Enter', 'NumpadEnter', 'Space', 'KeyE', 'Pad0'],
    back: ['Escape', 'Backspace', 'Pad1'],
    skate: ['ShiftLeft', 'ShiftRight', 'Pad7'],
    car: ['KeyC', 'Pad3'],
    pocket: ['Tab', 'Pad8'],
    map: ['KeyM'],
    bag: ['KeyI'],
    journal: ['KeyJ'],
    minimap: ['KeyN'],
    pause: ['Escape', 'Pad9'],
    tabPrev: ['Pad4'],
    tabNext: ['Pad5'],
    repeat: ['KeyR'],
    zoomIn: ['Equal', 'NumpadAdd', 'WheelUp'],
    zoomOut: ['Minus', 'NumpadSubtract', 'WheelDown'],
    zoomCycle: ['Pad10'],
    minimalHud: ['KeyH'],
  };
  for (var r = 1; r <= 9; r++) DEFAULTS['row' + r] = ['Digit' + r, 'Numpad' + r];

  // The named contexts of CONTRACT §12.3 (engines push their own `keys`; these are the defaults
  // pushContext(name) uses when no map is given, and what Settings › Controls lists).
  var CONTEXTS = {
    tabs: { tabPrev: ['KeyQ'], tabNext: ['KeyE'] },
    blackjack: { hit: ['KeyH', 'Pad0'], stand: ['KeyS', 'Pad1'], double: ['KeyD', 'Pad2'], split: ['KeyP', 'Pad3'],
                 chip1: ['Digit1'], chip2: ['Digit2'], chip3: ['Digit3'], chip4: ['Digit4'], chip5: ['Digit5'] },
    roulette: { clearBets: ['KeyC'], spin: ['Space'], place: ['Enter'],
                chip1: ['Digit1'], chip2: ['Digit2'], chip3: ['Digit3'], chip4: ['Digit4'] },
    fight: { move1: ['Digit1'], move2: ['Digit2'], move3: ['Digit3'], move4: ['Digit4'], move5: ['Digit5'], move6: ['Digit6'], move7: ['Digit7'] },
    orderup: { bin1: ['Digit1'], bin2: ['Digit2'], bin3: ['Digit3'], bin4: ['Digit4'], bin5: ['Digit5'], bin6: ['Digit6'], serve: ['Enter'] },
  };

  var DIRS = { up: 1, down: 1, left: 1, right: 1 };
  var DEAD_ZONE = 0.2;             // sticks (§11)
  var DIGITAL_AT = 0.5;            // a stick past this fires up / down / left / right
  var REPEAT_DELAY_S = 0.4;        // pad direction repeat for menus: first repeat ...
  var REPEAT_EVERY_S = 0.1;        // ... then every 100 ms
  var STICK_RADIUS = 64;           // touch stick travel in logical units
  var CODE_RE = /^[A-Z][A-Za-z0-9]*$/;
  var KEY_FALLBACK = { Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', ' ': 'Space', Backspace: 'Backspace',
                       ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };

  var global = {};                 // action -> effective bindings
  var index = {};                  // binding -> [actions]
  var built = false;
  var stack = [];                  // context entries { name, base, map, shadow }
  var pressedBy = {};              // binding -> [{ action, entry }] pressed by it ([] = inert until released)
  var holds = {};                  // action -> { source: true }
  var listeners = {};              // action ('*' = all) -> [fn]
  var last = 'kb';
  var skateLatch = false;
  var pad = { prev: [], rep: {}, stick: { x: 0, y: 0 }, dirRep: {} };
  var stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, rawX: 0, rawY: 0 };
  var attached = false;

  function isPad(b) { return /^Pad\d+$/.test(b); }
  function setting(key) { try { return SR.settings ? SR.settings.get(key) : undefined; } catch (e) { return undefined; } }

  function controls() {
    var c = setting('controls');
    return SR.util.isObject(c) ? c : { keys: {}, pad: {}, contexts: {} };
  }

  /**
   * @returns {object} the default map of a named context: CONTRACT §12.3, else the `keys` of the
   *   engine it is named after (CONTRACT §12.3: "other engines name their contexts after their
   *   engine id"), else an empty map.
   */
  function namedMap(name) {
    if (hasOwn.call(CONTEXTS, name)) return CONTEXTS[name];
    var mg = SR.reg && SR.reg.minigame && hasOwn.call(SR.reg.minigame, name) ? SR.reg.minigame[name] : null;
    return mg && SR.util.isObject(mg.keys) ? mg.keys : {};
  }

  /** @returns {object} a context's effective map: its base with the saved per-action remaps. */
  function effective(name, base) {
    var over = (controls().contexts || {})[name] || {};
    var out = {};
    Object.keys(base || {}).forEach(function (a) { out[a] = base[a].slice(); });
    Object.keys(over).forEach(function (a) { if (Array.isArray(over[a])) out[a] = over[a].slice(); });
    return out;
  }

  /** Recomputes the global bindings and the binding index from the defaults and the settings. */
  function rebuild() {
    var c = controls();
    var keys = c.keys || {}, pads = c.pad || {};
    global = {};
    index = {};
    Object.keys(DEFAULTS).forEach(function (a) {
      var kb = Array.isArray(keys[a]) ? keys[a] : DEFAULTS[a].filter(function (b) { return !isPad(b); });
      var pd = Array.isArray(pads[a]) ? pads[a] : DEFAULTS[a].filter(isPad);
      var list = kb.concat(pd);
      if (a === 'back' && setting('game.rightClickBack') === true && list.indexOf('Mouse2') < 0) list = list.concat(['Mouse2']);
      global[a] = list;
      list.forEach(function (b) { (index[b] = index[b] || []).push(a); });
    });
    stack.forEach(function (e) { e.map = effective(e.name, e.base); });
    built = true;
  }
  function ensure() { if (!built) rebuild(); }

  /** @returns {{actions: string[], entry: object|null}} what a binding fires now (top context first). */
  function resolve(code) {
    ensure();
    for (var i = stack.length - 1; i >= 0; i--) {
      var e = stack[i], hit = [];
      for (var a in e.map) if (hasOwn.call(e.map, a) && e.map[a].indexOf(code) >= 0) hit.push(a);
      if (hit.length) {
        if (!e.shadow) (index[code] || []).forEach(function (g) { if (hit.indexOf(g) < 0) hit.push(g); });
        return { actions: hit, entry: e };
      }
    }
    return { actions: (index[code] || []).slice(), entry: null };
  }

  // ------------------------------------------------------------------------------------------
  // Held state and events.

  function holdAdd(action, src) { (holds[action] = holds[action] || {})[src] = true; }
  /** @returns {boolean} the action is no longer held by any source. */
  function holdRemove(action, src) {
    var h = holds[action];
    if (!h) return true;
    delete h[src];
    for (var k in h) if (hasOwn.call(h, k)) return false;
    delete holds[action];
    return true;
  }
  function heldBy(action, pred) {
    var h = holds[action];
    if (!h) return false;
    for (var k in h) if (hasOwn.call(h, k) && pred(k)) return true;
    return false;
  }

  function setDevice(d) {
    if (d === last) return;
    last = d;
    if (SR.events) SR.events.emit('input:device', { device: d });
  }

  function emitTo(list, ev) {
    if (!list) return;
    list = list.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](ev); } catch (e) { if (typeof console !== 'undefined') console.error('SR.input: a listener of "' + ev.action + '" threw', e); }
    }
  }

  /** Delivers one action event to the listeners and (presses) to the top scene. */
  function fire(action, down, repeat, device, entry, code, raw) {
    if (down && !repeat && action === 'skate' && setting('game.skateToggle') === true) skateLatch = !skateLatch;
    var ev = {
      action: action, down: !!down, repeat: !!repeat, device: device || last,
      context: entry ? entry.name : null, code: code || null, consumed: false, defaultPrevented: false,
      preventDefault: function () { ev.defaultPrevented = true; if (raw && raw.preventDefault) raw.preventDefault(); },
    };
    emitTo(listeners[action], ev);
    emitTo(listeners['*'], ev);
    if (down && !ev.consumed && SR.scenes && typeof SR.scenes.dispatch === 'function') SR.scenes.dispatch(action, ev);
    return ev;
  }

  /** A binding went down: press every action it resolves to (or the given ones). */
  function codeDown(code, device, raw, actions, entry) {
    if (pressedBy[code]) codeUp(code, raw);       // a lost release: close the old press first
    var res = actions ? { actions: actions, entry: entry || null } : resolve(code);
    if (!res.actions.length) return 0;
    pressedBy[code] = res.actions.map(function (a) { return { action: a, entry: res.entry }; });
    res.actions.forEach(function (a) { holdAdd(a, 'b:' + code); });
    res.actions.forEach(function (a) { fire(a, true, false, device, res.entry, code, raw); });
    return res.actions.length;
  }
  /** A held binding repeats (OS key repeat, pad menu repeat). */
  function codeRepeat(code, device, raw) {
    var prev = pressedBy[code];
    if (!prev) return 0;
    prev.forEach(function (p) { fire(p.action, true, true, device, p.entry, code, raw); });
    return prev.length;
  }
  /** A binding went up: release what it pressed. */
  function codeUp(code, raw) {
    var prev = pressedBy[code];
    if (!prev) return;
    delete pressedBy[code];
    prev.forEach(function (p) { if (holdRemove(p.action, 'b:' + code)) fire(p.action, false, false, last, p.entry, code, raw); });
  }

  /** Holds or releases an action from a non-binding source (a stick direction). */
  function setSource(action, on, src, device) {
    var has = !!(holds[action] && holds[action][src]);
    if (on && !has) { holdAdd(action, src); fire(action, true, false, device, null, null); }
    else if (!on && has && holdRemove(action, src)) fire(action, false, false, device, null, null);
  }

  function analogDirs(x, y, src, device) {
    setSource('left', x < -DIGITAL_AT, src, device);
    setSource('right', x > DIGITAL_AT, src, device);
    setSource('up', y < -DIGITAL_AT, src, device);
    setSource('down', y > DIGITAL_AT, src, device);
  }

  /** Applies the radial dead zone, rescaled so the edge of the zone reads 0. */
  function deadZone(x, y) {
    var len = Math.sqrt(x * x + y * y);
    if (len <= DEAD_ZONE) return { x: 0, y: 0 };
    var k = Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE)) / len;
    return { x: x * k, y: y * k };
  }

  function releaseAll() {
    Object.keys(pressedBy).forEach(function (c) { codeUp(c); });
    Object.keys(holds).forEach(function (a) {
      Object.keys(holds[a] || {}).forEach(function (src) { if (holdRemove(a, src)) fire(a, false, false, last, null, null); });
    });
    stick.id = null; stick.x = stick.y = 0;
  }

  // ------------------------------------------------------------------------------------------
  // Devices.

  /** @returns {boolean} a text field has focus (only Enter, Esc and Tab act). */
  function typing() {
    if (typeof document === 'undefined') return false;
    var el = document.activeElement;
    if (!el || el === document.body || !el.tagName) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName !== 'INPUT') return false;
    return !/^(button|checkbox|radio|range|submit|reset|color|file|image)$/i.test(el.type || 'text');
  }

  function keyCode(e) { return e.code || KEY_FALLBACK[e.key] || ''; }

  function onKeyDown(e) {
    var code = keyCode(e);
    if (!code) return;
    setDevice('kb');
    if (e.repeat) {
      if (pressedBy[code] && codeRepeat(code, 'kb', e) && code !== 'Tab' && !typing()) e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;       // browser and OS shortcuts stay theirs
    if (typing()) {
      if (code === 'Enter' || code === 'NumpadEnter') codeDown(code, 'kb', e, ['confirm'], null);
      else if (code === 'Escape') codeDown(code, 'kb', e, ['back'], null);
      return;                                            // Tab and typing keep their default
    }
    if (codeDown(code, 'kb', e) && code !== 'Tab') e.preventDefault();
  }
  function onKeyUp(e) { var code = keyCode(e); if (code) codeUp(code, e); }

  // The device comes from pointerdown (pointerType): a touch tap also fires a compatibility
  // mousedown, which must not flip input.last back to 'mouse'.
  function onMouseDown(e) {
    if (typing() || e.button === 0) return;               // the left button is DOM clicks and click-to-walk
    codeDown('Mouse' + e.button, 'mouse', e);
  }
  function onMouseUp(e) { codeUp('Mouse' + e.button, e); }
  function onContextMenu(e) { if (resolve('Mouse2').actions.length) e.preventDefault(); }
  function onWheel(e) {
    if (e.ctrlKey || !e.deltaY) return;                   // Ctrl + wheel is the browser's zoom
    setDevice('mouse');
    var code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    if (codeDown(code, 'mouse', e)) codeUp(code, e);
  }
  function onPointerDown(e) { setDevice(e.pointerType === 'mouse' ? 'mouse' : 'touch'); }

  // The floating touch stick: a touch that starts on the left half of the world.
  function stickPoint(e) { return SR.stage && SR.stage.toLogical ? SR.stage.toLogical(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY }; }
  function onStickDown(e) {
    if (e.pointerType !== 'touch' || stick.id !== null) return;
    var p = stickPoint(e);
    if (p.x >= SR.W / 2) return;
    stick.id = e.pointerId; stick.ox = p.x; stick.oy = p.y; stick.x = stick.y = stick.rawX = stick.rawY = 0;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onStickMove(e) {
    if (e.pointerId !== stick.id) return;
    var p = stickPoint(e);
    var x = (p.x - stick.ox) / STICK_RADIUS, y = (p.y - stick.oy) / STICK_RADIUS;
    var len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }
    stick.rawX = x; stick.rawY = y;
    var d = deadZone(x, y);
    stick.x = d.x; stick.y = d.y;
    analogDirs(x, y, 't:stick', 'touch');
    if (e.cancelable) e.preventDefault();
  }
  function onStickUp(e) {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.x = stick.y = stick.rawX = stick.rawY = 0;
    analogDirs(0, 0, 't:stick', 'touch');
  }

  /**
   * Polls the gamepads (called by the loop every fixed step): button edges become presses and
   * releases of their 'Pad<n>' bindings, the left stick drives `move` and past 0.5 the digital
   * directions; held directions repeat for menu navigation.
   * @param {number=} dt the step in seconds (SR.STEP)
   */
  function poll(dt) {
    dt = typeof dt === 'number' ? dt : SR.STEP;
    var nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.getGamepads !== 'function') return;
    var list;
    try { list = nav.getGamepads() || []; } catch (e) { return; }
    // Most players have no pad: nothing to do (and nothing allocated) unless one is connected or
    // one was still pressed or deflected on the last poll (its releases must go out).
    var any = false;
    for (var c = 0; c < list.length && !any; c++) any = !!(list[c] && list[c].connected !== false);
    if (!any && !pad.prev.length && !pad.stick.x && !pad.stick.y) return;
    var pressed = [], sx = 0, sy = 0, best = 0, active = false;
    for (var i = 0; i < list.length; i++) {
      var gp = list[i];
      if (!gp || gp.connected === false) continue;
      var btns = gp.buttons || [];
      for (var b = 0; b < btns.length; b++) {
        var bt = btns[b];
        if (bt && (typeof bt === 'object' ? (bt.pressed || bt.value > 0.5) : bt > 0.5)) pressed[b] = true;
      }
      var ax = gp.axes || [];
      var x = +ax[0] || 0, y = +ax[1] || 0, m = x * x + y * y;
      if (m > best) { best = m; sx = x; sy = y; }
    }
    var typingNow = typing();
    var n = Math.max(pressed.length, pad.prev.length);
    for (var k = 0; k < n; k++) {
      var on = !!pressed[k], was = !!pad.prev[k], code = 'Pad' + k;
      if (on && !was) {
        active = true;
        pad.rep[k] = 0;
        if (typingNow) {
          if (k === 0) codeDown(code, 'pad', null, ['confirm'], null);
          else if (k === 1) codeDown(code, 'pad', null, ['back'], null);
        } else codeDown(code, 'pad', null);
      } else if (!on && was) {
        codeUp(code);
      } else if (on && was && pressedBy[code] && pressedBy[code].some(function (p) { return DIRS[p.action]; })) {
        pad.rep[k] = (pad.rep[k] || 0) + dt;
        if (pad.rep[k] >= REPEAT_DELAY_S) { pad.rep[k] -= REPEAT_EVERY_S; codeRepeat(code, 'pad'); }
      }
    }
    pad.prev = pressed;
    var d = deadZone(sx, sy);
    pad.stick.x = d.x; pad.stick.y = d.y;
    if (d.x || d.y) active = true;
    if (!typingNow) {
      analogDirs(sx, sy, 's:pad', 'pad');
      Object.keys(DIRS).forEach(function (a) {
        if (holds[a] && holds[a]['s:pad']) {
          pad.dirRep[a] = (pad.dirRep[a] || 0) + dt;
          if (pad.dirRep[a] >= REPEAT_DELAY_S) { pad.dirRep[a] -= REPEAT_EVERY_S; fire(a, true, true, 'pad', null, null); }
        } else pad.dirRep[a] = 0;
      });
    }
    if (active) setDevice('pad');
  }

  function onPadConnection(e) {
    var on = e.type === 'gamepadconnected';
    if (SR.events) SR.events.emit('input:pad', { connected: on, id: e.gamepad ? e.gamepad.id : '' });
    // The hot-plug toast (ARCHITECTURE §11), once js/ui/toast.js and its text keys are there.
    var key = on ? 'ui.pad.connected' : 'ui.pad.disconnected';
    if (SR.ui.toast && typeof SR.ui.toast === 'function' && SR.text.has(key)) {
      try { SR.ui.toast({ key: key, kind: 'info' }); } catch (err) { /* a toast never breaks input */ }
    }
    if (!on) { pad.prev.forEach(function (p, i) { if (p) codeUp('Pad' + i); }); pad.prev = []; analogDirs(0, 0, 's:pad', 'pad'); pad.stick.x = pad.stick.y = 0; }
  }

  function attach() {
    if (attached || typeof window.addEventListener !== 'function' || typeof document === 'undefined') return;
    attached = true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('gamepadconnected', onPadConnection);
    window.addEventListener('gamepaddisconnected', onPadConnection);
    var world = document.getElementById('world');
    if (world) {
      world.addEventListener('wheel', onWheel, { passive: true });
      world.addEventListener('pointerdown', onStickDown);
      world.addEventListener('pointermove', onStickMove);
      world.addEventListener('pointerup', onStickUp);
      world.addEventListener('pointercancel', onStickUp);
    }
    try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) last = 'touch'; } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------------------------------
  // The API.

  /** Subscribes fn(ev) to an action's presses, repeats and releases ('*': every action). @returns {function()} unsubscribe */
  function on(action, fn) {
    if (typeof fn !== 'function') throw new Error('SR.input.on("' + action + '"): fn must be a function');
    (listeners[action] = listeners[action] || []).push(fn);
    return function () { off(action, fn); };
  }
  /** Removes a listener. */
  function off(action, fn) {
    var l = listeners[action];
    if (!l) return;
    var i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }

  /** @returns {boolean} the action is held (skate follows the toggle setting). */
  function held(action) {
    if (action === 'skate' && setting('game.skateToggle') === true) return skateLatch;
    return !!holds[action];
  }

  /** @returns {{x: number, y: number}} the move axis (keys and D-pad, left stick, touch stick), length ≤ 1. */
  function axis(name) {
    if (name !== undefined && name !== 'move') return { x: 0, y: 0 };
    var digital = function (a) { return heldBy(a, function (src) { return src.charAt(0) !== 's' && src.charAt(0) !== 't'; }); };
    var x = (digital('right') ? 1 : 0) - (digital('left') ? 1 : 0);
    var y = (digital('down') ? 1 : 0) - (digital('up') ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    x += pad.stick.x + stick.x;
    y += pad.stick.y + stick.y;
    var len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y };
  }

  /**
   * Replaces an action's bindings (saved in settings.controls; null restores the default).
   * @param {string} action
   * @param {string[]|null} bindings codes: 'KeyE', 'Pad0', 'Mouse2', 'WheelUp'
   * @param {string=} context a context name: remaps the action inside that context only
   */
  function bind(action, bindings, context) {
    if (bindings !== null && (!Array.isArray(bindings) || !bindings.every(function (b) { return typeof b === 'string' && CODE_RE.test(b); }))) {
      throw new Error('SR.input.bind: bindings must be an array of codes such as KeyE, Pad0, Mouse2');
    }
    var c = controls();
    if (context) {
      var ctx = SR.util.clone(c.contexts || {});
      ctx[context] = ctx[context] || {};
      if (bindings === null) delete ctx[context][action]; else ctx[context][action] = bindings.slice();
      SR.settings.set('controls.contexts', ctx);
    } else {
      if (!hasOwn.call(DEFAULTS, action)) throw new Error('SR.input.bind: unknown action "' + action + '"');
      var keys = SR.util.clone(c.keys || {}), pads = SR.util.clone(c.pad || {});
      if (bindings === null) { delete keys[action]; delete pads[action]; }
      else {
        keys[action] = bindings.filter(function (b) { return !isPad(b); });
        pads[action] = bindings.filter(isPad);
      }
      SR.settings.set('controls.keys', keys);
      SR.settings.set('controls.pad', pads);
    }
    rebuild();
  }

  /** @returns {string[]} an action's effective bindings, globally or in a context (KeyHint glyphs). */
  function bindings(action, context) {
    ensure();
    if (context) {
      for (var i = stack.length - 1; i >= 0; i--) if (stack[i].name === context) return (stack[i].map[action] || []).slice();
      return (effective(context, namedMap(context))[action] || []).slice();
    }
    return (global[action] || []).slice();
  }

  /** Releases what a context pressed; keys still down stay inert until released. */
  function dropEntry(e) {
    Object.keys(pressedBy).forEach(function (code) {
      var list = pressedBy[code];
      var mine = list.filter(function (p) { return p.entry === e; });
      if (!mine.length) return;
      pressedBy[code] = list.filter(function (p) { return p.entry !== e; });
      mine.forEach(function (p) { if (holdRemove(p.action, 'b:' + code)) fire(p.action, false, false, last, e, code); });
    });
  }

  /**
   * Pushes a context map on top: while on top, a binding it lists fires only its action.
   * @param {string} name 'tabs', 'blackjack', an engine or skin id
   * @param {object=} map { action: [bindings] } (default: the named context of CONTRACT §12.3, or
   *   the `keys` of the engine of that name)
   * @param {{shadow: boolean}=} opts shadow: false also fires the global actions of its bindings
   * @returns {function()} pops exactly this context
   */
  function pushContext(name, map, opts) {
    ensure();
    var base = map || namedMap(name);
    if (!SR.util.isObject(base) || !Object.keys(base).every(function (a) { return Array.isArray(base[a]); })) {
      throw new Error('SR.input.pushContext("' + name + '"): the map must be { action: [bindings] }');
    }
    var e = { name: String(name), base: SR.util.clone(base), map: effective(name, base), shadow: !(opts && opts.shadow === false) };
    stack.push(e);
    return function () { var i = stack.indexOf(e); if (i >= 0) { stack.splice(i, 1); dropEntry(e); } };
  }

  /** Removes the most recent context of that name (and releases what it pressed). */
  function popContext(name) {
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === name) { var e = stack.splice(i, 1)[0]; dropEntry(e); return true; }
    }
    return false;
  }

  /**
   * Presses or releases an action directly (touch buttons, tests); the scene gets the press.
   * @param {string} action a global or context action
   * @param {boolean} down
   */
  function inject(action, down) {
    var entry = null;
    for (var i = stack.length - 1; i >= 0 && !entry; i--) if (hasOwn.call(stack[i].map, action)) entry = stack[i];
    if (down) { holdAdd(action, 'i:inject'); fire(action, true, false, last, entry, null); }
    else if (holds[action] && holds[action]['i:inject'] && holdRemove(action, 'i:inject')) fire(action, false, false, last, entry, null);
  }

  SR.input = {
    on: on,
    off: off,
    held: held,
    axis: axis,
    bind: bind,
    bindings: bindings,
    pushContext: pushContext,
    popContext: popContext,
    inject: inject,
    typing: typing,
    poll: poll,
    /** @returns {string[]} the global action names (Settings › Controls). */
    actions: function () { return Object.keys(DEFAULTS); },
    /** @returns {object} the default bindings: { global: {...}, contexts: {...} } (CONTRACT §12). */
    defaults: function () { return { global: SR.util.clone(DEFAULTS), contexts: SR.util.clone(CONTEXTS) }; },
    /** @returns {string[]} the pushed context names, bottom to top. */
    contexts: function () { return stack.map(function (e) { return e.name; }); },
    /** Releases every held key, button and stick (window blur; tests). */
    releaseAll: releaseAll,
  };
  Object.defineProperty(SR.input, 'last', { enumerable: true, get: function () { return last; } });
  /** The touch stick for drawing it: { active, ox, oy, x, y } in logical units (x, y after the dead zone). */
  Object.defineProperty(SR.input, 'stick', {
    enumerable: true,
    get: function () { return { active: stick.id !== null, ox: stick.ox, oy: stick.oy, x: stick.x, y: stick.y }; },
  });

  // Remaps and the input settings apply at once (pure: also in Node).
  SR.onBoot(10, function () {
    rebuild();
    SR.events.on('settings:changed', function (p) {
      var k = p && p.key;
      if (k === '*' || k === 'game.rightClickBack' || (typeof k === 'string' && k.indexOf('controls') === 0)) rebuild();
      if (k === 'game.skateToggle' || k === '*') skateLatch = false;
    });
  }, { headless: true });
  SR.onBoot(10, attach);
})();
