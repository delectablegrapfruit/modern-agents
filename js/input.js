// Keyboard + mouse, gamepads (standard mapping) and touch twin-sticks, folded into move / aim / bomb / pause.
// Keyboard bindings, SOCD handling, key-fire smoothing, mouse aim mode (cursor or pointer-locked) and mouse fire
// mode are player settings, stored under GW.store key 'controls' and edited on the Controls page (controls-ui.js).
'use strict';
(function () {
  const GW = window.GW;

  const DEAD = 0.22;
  const stick = (x, y) => {
    const m = Math.hypot(x, y);
    if (m < DEAD) return [0, 0, 0];
    const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
    return [x * k, y * k, Math.min(1, (m - DEAD) / (1 - DEAD))];
  };

  // ---- actions, presets, settings ---------------------------------------------------------------------

  const ACTIONS = [
    ['moveUp', 'Move up'], ['moveDown', 'Move down'], ['moveLeft', 'Move left'], ['moveRight', 'Move right'],
    ['fireUp', 'Fire up'], ['fireDown', 'Fire down'], ['fireLeft', 'Fire left'], ['fireRight', 'Fire right'],
    ['fireUpLeft', 'Fire up-left'], ['fireUpRight', 'Fire up-right'],
    ['fireDownLeft', 'Fire down-left'], ['fireDownRight', 'Fire down-right'],
    ['bomb', 'Bomb'], ['pause', 'Pause'],
  ];
  const NUMPAD_FIRE = {
    fireUp: ['Numpad8'], fireDown: ['Numpad5', 'Numpad2'], fireLeft: ['Numpad4'], fireRight: ['Numpad6'],
    fireUpLeft: ['Numpad7'], fireUpRight: ['Numpad9'], fireDownLeft: ['Numpad1'], fireDownRight: ['Numpad3'],
  };
  const PRESETS = {
    classic: {
      label: 'Classic',
      moveUp: ['KeyW'], moveDown: ['KeyS'], moveLeft: ['KeyA'], moveRight: ['KeyD'],
      fireUp: ['ArrowUp', 'KeyI', 'Numpad8'], fireDown: ['ArrowDown', 'KeyK', 'Numpad5', 'Numpad2'],
      fireLeft: ['ArrowLeft', 'KeyJ', 'Numpad4'], fireRight: ['ArrowRight', 'KeyL', 'Numpad6'],
      fireUpLeft: ['Numpad7'], fireUpRight: ['Numpad9'], fireDownLeft: ['Numpad1'], fireDownRight: ['Numpad3'],
      bomb: ['Space', 'KeyE'], pause: ['Escape', 'KeyP'],
    },
    esdf: {
      label: 'ESDF',
      moveUp: ['KeyE'], moveDown: ['KeyD'], moveLeft: ['KeyS'], moveRight: ['KeyF'],
      fireUp: ['ArrowUp'].concat(NUMPAD_FIRE.fireUp), fireDown: ['ArrowDown'].concat(NUMPAD_FIRE.fireDown),
      fireLeft: ['ArrowLeft'].concat(NUMPAD_FIRE.fireLeft), fireRight: ['ArrowRight'].concat(NUMPAD_FIRE.fireRight),
      fireUpLeft: ['Numpad7'], fireUpRight: ['Numpad9'], fireDownLeft: ['Numpad1'], fireDownRight: ['Numpad3'],
      bomb: ['Space', 'KeyA'], pause: ['Escape', 'KeyP'],
    },
    lefty: {
      label: 'Left-handed',
      moveUp: ['ArrowUp'], moveDown: ['ArrowDown'], moveLeft: ['ArrowLeft'], moveRight: ['ArrowRight'],
      fireUp: ['KeyW'], fireDown: ['KeyS'], fireLeft: ['KeyA'], fireRight: ['KeyD'],
      fireUpLeft: [], fireUpRight: [], fireDownLeft: [], fireDownRight: [],
      bomb: ['Enter', 'NumpadEnter', 'Numpad0'], pause: ['Escape', 'KeyP'],
    },
  };
  const presetBindings = (name) => {
    const p = PRESETS[name] || PRESETS.classic;
    const b = {};
    for (const [a] of ACTIONS) b[a] = p[a].slice();
    return b;
  };
  const DEFAULT_CONTROLS = { preset: 'classic', socd: 'last', kbAim: 'smooth', aimMode: 'cursor', sens: 1, autofire: 'hold' };

  // Fire keys contribute to both fire axes when they are diagonals.
  const AXES = {
    moveX: [['moveLeft'], ['moveRight']],
    moveY: [['moveUp'], ['moveDown']],
    fireX: [['fireLeft', 'fireUpLeft', 'fireDownLeft'], ['fireRight', 'fireUpRight', 'fireDownRight']],
    fireY: [['fireUp', 'fireUpLeft', 'fireUpRight'], ['fireDown', 'fireDownLeft', 'fireDownRight']],
  };
  const FIRE_ACTIONS = ['fireUp', 'fireDown', 'fireLeft', 'fireRight', 'fireUpLeft', 'fireUpRight', 'fireDownLeft', 'fireDownRight'];
  const ALWAYS_BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];

  const D2R = Math.PI / 180;
  const STEP_MAX = 15 * D2R, SNAP_OVER = 135 * D2R, GRACE_STEPS = 4;
  const LOCK_MAX = 220, LOCK_MIN = 12;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const store = () => GW.store || { get: (k, d) => d, set() {} };

  function loadControls() {
    const saved = store().get('controls', null) || {};
    const c = Object.assign({}, DEFAULT_CONTROLS, saved);
    if (!['last', 'neutral'].includes(c.socd)) c.socd = 'last';
    if (!['smooth', 'snap'].includes(c.kbAim)) c.kbAim = 'smooth';
    if (!['cursor', 'locked'].includes(c.aimMode)) c.aimMode = 'cursor';
    if (!['hold', 'auto'].includes(c.autofire)) c.autofire = 'hold';
    c.sens = Math.min(3, Math.max(0.5, +c.sens || 1));
    if (c.preset !== 'custom' && !PRESETS[c.preset]) c.preset = 'classic';
    const base = presetBindings(c.preset === 'custom' ? 'classic' : c.preset);
    const b = {};
    const sb = saved.bindings && typeof saved.bindings === 'object' ? saved.bindings : null;
    for (const [a] of ACTIONS) {
      b[a] = sb && Array.isArray(sb[a]) ? sb[a].filter((x) => typeof x === 'string') : base[a];
    }
    if (!b.pause.includes('Escape')) b.pause.unshift('Escape');
    c.bindings = b;
    return c;
  }

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = new Set();
      this.order = [];        // held key codes, oldest first (SOCD "last wins")
      this.edges = new Set(); // presses not yet consumed by a simulation step
      this.menuEdges = [];    // presses for menu navigation, consumed each frame
      this.mouse = { x: -1, y: -1, down: false, seen: false };
      this.touch = { left: null, right: null, used: false };
      this.pad = null;
      this.padPrev = [];
      this.device = 'mouse';
      this.autofire = false;
      this.gameKeys = false;
      this.onPause = () => {};
      this.off = { x: 0, y: -150 }; // locked-aim offset from the ship, CSS px
      this.tick = 0;
      this.kb = { active: false, lastTick: -9, angle: 0, prevN: 0, grace: 0, diag: null };
      this.lastTouch = -1e9;
      this.unlockedAt = -1e9;
      this.controls = loadControls();
      this.applyControls();

      // Esc that the browser also used to leave pointer lock must not un-pause straight away.
      addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && performance.now() - this.unlockedAt < 250) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);

      addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
        if (!e.repeat) this.edges.add(e.code);
        this.keys.add(e.code);
        if (!this.order.includes(e.code)) this.order.push(e.code);
        if (this.fireCodes.has(e.code)) this.device = 'keys';
        if (this.gameKeys && (ALWAYS_BLOCK.includes(e.code) || /^Numpad/.test(e.code) || this.boundCodes.has(e.code))) e.preventDefault();
      });
      addEventListener('keyup', (e) => {
        this.keys.delete(e.code);
        const i = this.order.indexOf(e.code);
        if (i >= 0) this.order.splice(i, 1);
      });
      addEventListener('blur', () => { this.keys.clear(); this.order.length = 0; this.mouse.down = false; });

      // ---- mouse buttons: mousedown/mouseup see every button even when chorded (pointer events do not)
      const fromTouch = (e) => (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) || performance.now() - this.lastTouch < 800;
      addEventListener('mousedown', (e) => {
        if (fromTouch(e)) return;
        this.device = 'mouse';
        if (!this.isLocked()) { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true; }
        if (e.button === 0) this.mouse.down = true;
        else if (e.button >= 1 && e.button <= 4) this.edges.add('Mouse' + e.button);
        if (e.button === 1) e.preventDefault(); // no autoscroll
        if (this.gameKeys && this.controls.aimMode === 'locked' && !this.isLocked() && e.target === canvas) this.requestLock();
      });
      addEventListener('mouseup', (e) => {
        if (fromTouch(e)) return;
        if (e.button === 0) this.mouse.down = false;
        if (e.button === 3 || e.button === 4) e.preventDefault(); // no back / forward navigation
      });
      addEventListener('auxclick', (e) => { if (this.gameKeys) e.preventDefault(); });

      // ---- browser interference
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('contextmenu', (e) => { if (this.gameKeys) e.preventDefault(); });
      canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
      canvas.addEventListener('dragstart', (e) => e.preventDefault());
      canvas.addEventListener('selectstart', (e) => e.preventDefault());

      canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') {
          // Keep receiving moves and the release when the drag leaves the canvas or the window.
          try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          return;
        }
        this.lastTouch = performance.now();
        this.touch.used = true;
        this.device = 'touch';
        const s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        if (e.clientX < innerWidth / 2) { if (!this.touch.left) this.touch.left = s; }
        else if (!this.touch.right) this.touch.right = s;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') {
          this.mouse.down = (e.buttons & 1) !== 0; // self-heal a missed mouseup
          if (this.isLocked()) {
            const mx = e.movementX || 0, my = e.movementY || 0;
            if (Math.abs(mx) + Math.abs(my) > 2) this.device = 'mouse';
            const s = this.controls.sens;
            let x = this.off.x + mx * s, y = this.off.y + my * s;
            const l = Math.hypot(x, y);
            if (l > LOCK_MAX) { x *= LOCK_MAX / l; y *= LOCK_MAX / l; }
            this.off.x = x; this.off.y = y;
            return;
          }
          if (Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y) > 2) this.device = 'mouse';
          this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true;
          return;
        }
        for (const k of ['left', 'right']) {
          const s = this.touch[k];
          if (s && s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; }
        }
      });
      const up = (e) => {
        if (e.pointerType === 'mouse') return; // handled by mouseup
        this.lastTouch = performance.now();
        for (const k of ['left', 'right']) if (this.touch[k] && this.touch[k].id === e.pointerId) this.touch[k] = null;
      };
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);

      // ---- pointer lock
      document.addEventListener('pointerlockchange', () => {
        if (this.isLocked()) {
          this.device = 'mouse';
          if (Math.hypot(this.off.x, this.off.y) <= LOCK_MIN) { this.off.x = 0; this.off.y = -150; }
        } else {
          // Lost while playing = the browser's Esc gesture (or a focus change): pause.
          if (this.gameKeys) { this.unlockedAt = performance.now(); this.firePause(); }
        }
      });
      document.addEventListener('pointerlockerror', () => { /* stays in cursor behaviour */ });

      // ---- gamepads
      addEventListener('gamepadconnected', () => { this.device = 'pad'; });
      addEventListener('gamepaddisconnected', (e) => {
        const mine = this.pad && e.gamepad && e.gamepad.index === this.pad.index;
        if (mine) this.pad = null;
        if (this.gameKeys && (mine || this.device === 'pad')) this.firePause();
      });
    }

    firePause() { try { if (typeof this.onPause === 'function') this.onPause(); } catch (err) { console.error(err); } }

    // ---- settings -------------------------------------------------------------------------------------

    applyControls() {
      const b = this.controls.bindings;
      this.fireCodes = new Set(FIRE_ACTIONS.flatMap((a) => b[a]));
      this.boundCodes = new Set(ACTIONS.flatMap(([a]) => b[a]));
      this.autofire = this.controls.autofire === 'auto';
      if (this.controls.aimMode !== 'locked' && this.isLocked()) this.releaseLock();
    }

    saveControls() {
      this.applyControls();
      store().set('controls', this.controls);
    }

    setControl(key, value) {
      if (key === 'preset') {
        this.controls.preset = value;
        if (PRESETS[value]) this.controls.bindings = presetBindings(value);
      } else this.controls[key] = value;
      this.saveControls();
    }

    resetControls() {
      this.controls = Object.assign({}, DEFAULT_CONTROLS, { bindings: presetBindings('classic') });
      this.saveControls();
    }

    // Binds `code` to `action`, replacing the key at index i (or appending when i < 0 / out of range).
    // A code already used by another action is moved. Returns the labels of the actions it was taken from.
    bind(action, code, i) {
      const b = this.controls.bindings;
      if (!b[action] || !code) return { moved: [] };
      const moved = [];
      for (const [a, label] of ACTIONS) {
        if (a === action) continue;
        if (a === 'pause' && code === 'Escape') continue;
        const j = b[a].indexOf(code);
        if (j >= 0) { b[a].splice(j, 1); moved.push(label); }
      }
      const list = b[action];
      const old = i >= 0 && i < list.length ? list[i] : null;
      if (action === 'pause' && old === 'Escape') return { moved }; // Esc is never unbound from pause
      const dup = list.indexOf(code);
      if (old != null) {
        list[i] = code;
        if (dup >= 0 && dup !== i) list.splice(dup, 1);
      } else if (dup < 0) list.push(code);
      this.controls.preset = 'custom';
      this.saveControls();
      return { moved };
    }

    unbind(action, i) {
      const list = this.controls.bindings[action];
      if (!list || i < 0 || i >= list.length) return;
      if (action === 'pause' && list[i] === 'Escape') return;
      list.splice(i, 1);
      this.controls.preset = 'custom';
      this.saveControls();
    }

    isPause(code) { return this.controls.bindings.pause.includes(code); }

    // ---- pointer lock ---------------------------------------------------------------------------------

    isLocked() { return !!this.canvas && document.pointerLockElement === this.canvas; }

    requestLock() {
      if (this.controls.aimMode !== 'locked' || this.isLocked()) return;
      const c = this.canvas;
      if (!c || !c.requestPointerLock) return;
      const attempt = (opts) => {
        try {
          const r = opts ? c.requestPointerLock(opts) : c.requestPointerLock();
          return r && typeof r.then === 'function' ? r : Promise.resolve();
        } catch (err) { return Promise.reject(err); }
      };
      // Raw (unaccelerated) movement where supported; otherwise plain lock; otherwise stay in cursor mode.
      attempt({ unadjustedMovement: true }).catch(() => attempt(null)).catch(() => {});
    }

    releaseLock() {
      try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (err) { /* ignore */ }
    }

    // ---- per-frame polling ----------------------------------------------------------------------------

    // Once per animation frame.
    poll() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads || []) if (p && p.connected) { pad = p; break; }
      this.pad = pad;
      if (!pad) return;
      const now = pad.buttons.map((b, i) => {
        if (!b) return false;
        // Analogue triggers: press above 0.5, release only below 0.3, so a resting finger cannot chatter.
        if (i === 6 || i === 7) return this.padPrev[i] ? b.value >= 0.3 : b.value > 0.5;
        return b.pressed || b.value > 0.5;
      });
      now.forEach((d, i) => {
        if (d && !this.padPrev[i]) { this.edges.add('Pad' + i); this.menuEdges.push('Pad' + i); this.device = 'pad'; }
      });
      this.padPrev = now;
      const [lx, ly] = [pad.axes[0] || 0, pad.axes[1] || 0];
      const dir = Math.abs(lx) > Math.abs(ly) ? (lx > 0.6 ? 'Right' : lx < -0.6 ? 'Left' : '') : (ly > 0.6 ? 'Down' : ly < -0.6 ? 'Up' : '');
      if (dir && dir !== this.stickDir) this.menuEdges.push('Stick' + dir);
      this.stickDir = dir;
      if (Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0) > 0.4 || Math.hypot(lx, ly) > 0.4) this.device = 'pad';
    }

    // Called after each simulation step: presses have been seen.
    consume() { this.edges.clear(); this.tick++; }

    pressed(...codes) { return codes.some((c) => this.edges.has(c)); }
    held(...codes) { return codes.some((c) => this.keys.has(c)); }

    // -1, 0 or +1 for one axis, resolving opposite keys per the SOCD setting.
    axis(name) {
      const b = this.controls.bindings;
      const [negA, posA] = AXES[name];
      const neg = negA.flatMap((a) => b[a]), pos = posA.flatMap((a) => b[a]);
      if (this.controls.socd === 'last') {
        for (let i = this.order.length - 1; i >= 0; i--) {
          const c = this.order[i];
          const n = neg.includes(c), p = pos.includes(c);
          if (n !== p) return n ? -1 : 1;
        }
        return 0;
      }
      return (pos.some((c) => this.keys.has(c)) ? 1 : 0) - (neg.some((c) => this.keys.has(c)) ? 1 : 0);
    }

    move() {
      if (this.pad) {
        const [x, y, m] = stick(this.pad.axes[0] || 0, this.pad.axes[1] || 0);
        if (m > 0) return [x, y];
        const b = this.pad.buttons;
        const dx = (b[15] && b[15].pressed ? 1 : 0) - (b[14] && b[14].pressed ? 1 : 0);
        const dy = (b[13] && b[13].pressed ? 1 : 0) - (b[12] && b[12].pressed ? 1 : 0);
        if (dx || dy) { const l = Math.hypot(dx, dy); return [dx / l, dy / l]; }
      }
      const t = this.touch.left;
      if (t) {
        const dx = (t.x - t.ox) / 55, dy = (t.y - t.oy) / 55;
        const l = Math.hypot(dx, dy);
        if (l > 0.12) return l > 1 ? [dx / l, dy / l] : [dx, dy];
      }
      const x = this.axis('moveX'), y = this.axis('moveY');
      if (x || y) { const l = Math.hypot(x, y); return [x / l, y / l]; }
      return [0, 0];
    }

    // Keyboard 8-way fire with release grace and optional smoothing. Called once per simulation step.
    keyAim() {
      const kb = this.kb;
      const fresh = kb.lastTick === this.tick - 1 || kb.lastTick === this.tick;
      kb.lastTick = this.tick;
      if (!fresh) { kb.active = false; kb.prevN = 0; kb.grace = 0; }
      let x = this.axis('fireX'), y = this.axis('fireY');
      const n = (x ? 1 : 0) + (y ? 1 : 0);
      if (n === 0) {
        kb.active = false; kb.prevN = 0; kb.grace = 0; kb.diag = null;
        return null;
      }
      if (n === 2) { kb.grace = 0; kb.diag = [x, y]; }
      else if (kb.prevN === 2 && kb.diag) kb.grace = GRACE_STEPS;
      kb.prevN = n;
      if (n === 1 && kb.grace > 0) {
        // Still one half of the diagonal just released: keep firing the diagonal for a few steps.
        if (kb.diag && (x ? x === kb.diag[0] : y === kb.diag[1])) { x = kb.diag[0]; y = kb.diag[1]; kb.grace--; }
        else kb.grace = 0;
      }
      const target = Math.atan2(y, x);
      if (this.controls.kbAim === 'snap' || !kb.active) kb.angle = target;
      else {
        const d = wrap(target - kb.angle);
        if (Math.abs(d) > SNAP_OVER) kb.angle = target;
        else kb.angle = wrap(kb.angle + Math.max(-STEP_MAX, Math.min(STEP_MAX, d)));
      }
      kb.active = true;
      if (this.controls.kbAim === 'snap') return { dx: x, dy: y };
      return { dx: Math.cos(kb.angle), dy: Math.sin(kb.angle) };
    }

    // Returns {dx, dy[, locked]} for a firing direction, {mouse: true} to fire at the mouse cursor, or null.
    aim() {
      if (this.pad) {
        // Raw right stick, no rescale: light pushes fire in exactly the direction pushed.
        const rx = this.pad.axes[2] || 0, ry = this.pad.axes[3] || 0;
        if (Math.hypot(rx, ry) > 0.3) return { dx: rx, dy: ry };
      }
      const t = this.touch.right;
      if (t) {
        const dx = t.x - t.ox, dy = t.y - t.oy;
        if (Math.hypot(dx, dy) > 12) return { dx, dy };
      }
      const k = this.keyAim();
      if (k) return k;
      const firing = this.mouse.down || (this.autofire && this.device === 'mouse');
      if (this.isLocked()) {
        if (firing && Math.hypot(this.off.x, this.off.y) > LOCK_MIN) return { dx: this.off.x, dy: this.off.y, locked: true };
        return null;
      }
      if (this.mouse.seen && firing) return { mouse: true };
      return null;
    }

    bomb() {
      return this.pressed(...this.controls.bindings.bomb, 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4', 'Pad4', 'Pad5', 'Pad6', 'Pad7', 'Touch-bomb');
    }

    // Where the HUD should draw the aim reticle, in CSS px, or null when there should be none.
    reticle(game) {
      if (this.device !== 'mouse' || !game || game.demo) return null;
      const p = game.player;
      if (!p || !p.alive) return null;
      if (this.isLocked()) {
        if (!game.worldToScreen) return null;
        const [x, y] = game.worldToScreen(p.x, p.y);
        return [x + this.off.x, y + this.off.y];
      }
      if (!this.mouse.seen) return null;
      return [this.mouse.x, this.mouse.y];
    }
  }

  Input.ACTIONS = ACTIONS;
  Input.PRESETS = PRESETS;
  Input.presetBindings = presetBindings;
  GW.Input = Input;
})();
