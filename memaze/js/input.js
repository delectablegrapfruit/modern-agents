/* Memaze — input. Dragging moves the world under the player (it never moves on screen):
 *   tilt  the drag works like a joystick that tilts the board; the ball rolls with momentum (Super Monkey Ball)
 *   grab  the world sticks to your finger 1:1 and keeps its momentum when you let go (precise, Scary-Maze style)
 * Keys (WASD/arrows), a gamepad's left stick and the phone's tilt sensor add to the tilt in either scheme. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { clamp } = MZ;

  class Input {
    constructor(el, joy) {
      this.el = el;
      this.joy = joy;
      this.cfg = { scheme: 'tilt', sensitivity: 1, invert: false, joystick: true, gyro: false };
      this.enabled = false;
      this.pointers = new Map();
      this.drag = null; // {id, ox, oy, x, y}
      this.grabDX = 0; this.grabDY = 0;
      this.samples = [];
      this.keys = new Set();
      this.gyro = null; this.gyroZero = null;
      this.onZoom = null;
      this.pinch = null;

      el.addEventListener('pointerdown', (e) => this.down(e));
      el.addEventListener('pointermove', (e) => this.move(e));
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e));
      el.addEventListener('lostpointercapture', (e) => this.up(e));
      el.addEventListener('wheel', (e) => { if (this.enabled && this.onZoom) { e.preventDefault(); this.onZoom(Math.exp(-e.deltaY * 0.0015)); } }, { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const k = this.keyDir(e.code);
        if (k) { this.keys.add(e.code); if (this.enabled) e.preventDefault(); }
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
    }
    keyDir(code) {
      return { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[code];
    }
    radius() { return 70 / clamp(this.cfg.sensitivity, 0.3, 3); }

    down(e) {
      // A finger already down during READY steers as soon as GO.
      if (!this.enabled && document.body.dataset.state !== 'intro') return;
      MZ.Audio.unlock();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (this.pointers.size === 2) {
        const [a, b] = Array.from(this.pointers.values());
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        this.release();
        return;
      }
      if (this.drag) return;
      this.drag = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      this.samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      this.showJoy();
    }
    move(e) {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = Array.from(this.pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.onZoom && this.pinch.d > 0) this.onZoom(d / this.pinch.d);
        this.pinch.d = d;
        return;
      }
      const g = this.drag;
      if (!g || g.id !== e.pointerId) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const last = events.length ? events[events.length - 1] : e;
      this.grabDX += last.clientX - g.x;
      this.grabDY += last.clientY - g.y;
      g.x = last.clientX; g.y = last.clientY;
      // Floating joystick: the centre follows the finger once it's past full tilt, so reversing is instant.
      const R = this.radius(), dx = g.x - g.ox, dy = g.y - g.oy, d = Math.hypot(dx, dy);
      if (d > R) { g.ox = g.x - (dx / d) * R; g.oy = g.y - (dy / d) * R; }
      const now = performance.now();
      this.samples.push({ x: g.x, y: g.y, t: now });
      while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
      this.showJoy();
    }
    up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && this.drag.id === e.pointerId) this.release(true);
    }
    release(fling) {
      if (this.drag && fling && this.samples.length > 1) {
        const a = this.samples[0], b = this.samples[this.samples.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
        this.fling = { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
        if (performance.now() - b.t > 80) this.fling = null;
      }
      this.drag = null;
      this.samples = [];
      if (this.joy) this.joy.classList.remove('on');
    }
    showJoy() {
      const j = this.joy, g = this.drag;
      if (!j || !g || this.cfg.scheme !== 'tilt' || !this.cfg.joystick) { if (j) j.classList.remove('on'); return; }
      j.classList.add('on');
      j.style.transform = 'translate(' + g.ox + 'px,' + g.oy + 'px)';
      const k = j.querySelector('.knob');
      k.style.transform = 'translate(' + (g.x - g.ox) + 'px,' + (g.y - g.oy) + 'px)';
    }

    // Accumulated finger movement since the last call (grab scheme), in screen pixels.
    takeGrab() {
      const d = { x: this.grabDX, y: this.grabDY, active: !!this.drag && !this.pinch };
      this.grabDX = 0; this.grabDY = 0;
      return d;
    }
    takeFling() { const f = this.fling; this.fling = null; return f; }

    // Direction the ball is pushed, |v| ≤ 1, in world axes.
    vector() {
      let x = 0, y = 0;
      const sgn = this.cfg.invert ? 1 : -1; // default: the world follows the finger, so the ball goes the other way
      if (this.cfg.scheme === 'tilt' && this.drag && !this.pinch) {
        const R = this.radius();
        x += ((this.drag.x - this.drag.ox) / R) * sgn;
        y += ((this.drag.y - this.drag.oy) / R) * sgn;
      }
      for (const code of this.keys) { const k = this.keyDir(code); if (k) { x += k[0]; y += k[1]; } }
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) {
        if (!gp || !gp.connected) continue;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.15) { x += ax; y += ay; }
        if (gp.buttons[14] && gp.buttons[14].pressed) x -= 1;
        if (gp.buttons[15] && gp.buttons[15].pressed) x += 1;
        if (gp.buttons[12] && gp.buttons[12].pressed) y -= 1;
        if (gp.buttons[13] && gp.buttons[13].pressed) y += 1;
      }
      if (this.cfg.gyro && this.gyro && this.gyroZero) {
        const gx = (this.gyro.gamma - this.gyroZero.gamma) / 22, gy = (this.gyro.beta - this.gyroZero.beta) / 22;
        const o = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        if (o === 90) { x += gy; y -= gx; } else if (o === -90 || o === 270) { x -= gy; y += gx; } else if (o === 180) { x -= gx; y -= gy; } else { x += gx; y += gy; }
      }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    }

    async enableGyro() {
      const DOE = window.DeviceOrientationEvent;
      if (!DOE) throw new Error('No tilt sensor on this device.');
      if (!window.isSecureContext) throw new Error('Phone tilt needs a secure page (https or localhost). Over Wi-Fi from serve.py, drag instead.');
      if (typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission();
        if (r !== 'granted') throw new Error('Tilt permission was not granted.');
      }
      if (!this._gyroBound) {
        this._gyroBound = true;
        window.addEventListener('deviceorientation', (e) => {
          if (e.beta == null) return;
          this.gyro = { beta: e.beta, gamma: e.gamma };
          if (!this.gyroZero) this.gyroZero = { beta: e.beta, gamma: e.gamma };
        });
      }
      this.gyroZero = null;
    }
    calibrate() { if (this.gyro) this.gyroZero = { beta: this.gyro.beta, gamma: this.gyro.gamma }; }

    gamepadButtons() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const out = new Set();
      for (const gp of pads) if (gp && gp.connected) gp.buttons.forEach((b, i) => { if (b.pressed) out.add(i); });
      return out;
    }
  }

  MZ.Input = Input;
})();
