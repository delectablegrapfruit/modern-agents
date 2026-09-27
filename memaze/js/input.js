/* Memaze — input. The player stays at the centre of the screen; dragging moves the maze under it 1:1.
 * Keys (WASD/arrows) and a gamepad's left stick or d-pad move it at a steady speed. Pinch or scroll to zoom. */
(function () {
  'use strict';
  const MZ = window.MZ;

  class Input {
    constructor(el) {
      this.el = el;
      this.cfg = { invert: false, speed: 1 };
      this.enabled = false;
      this.pointers = new Map();
      this.drag = null; // {id, x, y}
      this.grabDX = 0; this.grabDY = 0;
      this.keys = new Set();
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

    down(e) {
      if (!this.enabled) return;
      MZ.Audio.unlock();
      if (e.isPrimary) { this.pointers.clear(); this.pinch = null; this.drag = null; } // nothing else is down: drop stale fingers
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (this.pointers.size === 2) {
        const [a, b] = Array.from(this.pointers.values());
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        this.release();
        return;
      }
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
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
      this.grabDX += e.clientX - g.x;
      this.grabDY += e.clientY - g.y;
      g.x = e.clientX; g.y = e.clientY;
    }
    up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && this.drag.id === e.pointerId) this.release();
    }
    release() { this.drag = null; }

    // Finger or mouse travel since the last call, in screen pixels.
    takeGrab() {
      const d = { x: this.grabDX, y: this.grabDY, active: !!this.drag && !this.pinch };
      this.grabDX = 0; this.grabDY = 0;
      return d;
    }

    // Keys and gamepad: the direction to move, |v| <= 1, in world axes.
    vector() {
      let x = 0, y = 0;
      for (const code of this.keys) { const k = this.keyDir(code); if (k) { x += k[0]; y += k[1]; } }
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of gamepads) {
        if (!gp || !gp.connected) continue;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, m = Math.hypot(ax, ay);
        if (m > 0.15) { const k = Math.min(1, (m - 0.15) / 0.8) / m; x += ax * k; y += ay * k; }
        if (gp.buttons[14] && gp.buttons[14].pressed) x -= 1;
        if (gp.buttons[15] && gp.buttons[15].pressed) x += 1;
        if (gp.buttons[12] && gp.buttons[12].pressed) y -= 1;
        if (gp.buttons[13] && gp.buttons[13].pressed) y += 1;
      }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    }

    gamepadButtons() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const out = new Set();
      for (const gp of gamepads) if (gp && gp.connected) gp.buttons.forEach((b, i) => { if (b.pressed) out.add(i); });
      return out;
    }
  }

  MZ.Input = Input;
})();
