// Keyboard + mouse, gamepads (standard mapping) and touch twin-sticks, folded into move / aim / bomb / pause.
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

  class Input {
    constructor(canvas) {
      this.keys = new Set();
      this.edges = new Set(); // presses not yet consumed by a simulation step
      this.menuEdges = [];    // presses for menu navigation, consumed each frame
      this.mouse = { x: -1, y: -1, down: false, seen: false };
      this.touch = { left: null, right: null, used: false };
      this.pad = null;
      this.padPrev = [];
      this.device = 'mouse';
      this.autofire = false;

      addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
        if (!e.repeat) this.edges.add(e.code);
        this.keys.add(e.code);
        if (/^Arrow/.test(e.code)) this.device = 'keys';
        if (this.gameKeys && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      });
      addEventListener('keyup', (e) => this.keys.delete(e.code));
      addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') {
          this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true;
          this.device = 'mouse';
          if (e.button === 0) this.mouse.down = true;
          if (e.button === 2) this.edges.add('Mouse2');
          return;
        }
        this.touch.used = true;
        this.device = 'touch';
        const s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        if (e.clientX < innerWidth / 2) { if (!this.touch.left) this.touch.left = s; }
        else if (!this.touch.right) this.touch.right = s;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') {
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
        if (e.pointerType === 'mouse') { if (e.button === 0) this.mouse.down = false; return; }
        for (const k of ['left', 'right']) if (this.touch[k] && this.touch[k].id === e.pointerId) this.touch[k] = null;
      };
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
      addEventListener('gamepadconnected', () => { this.device = 'pad'; });
    }

    // Once per animation frame.
    poll() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; break; }
      this.pad = pad;
      if (!pad) return;
      const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
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
    consume() { this.edges.clear(); }

    pressed(...codes) { return codes.some((c) => this.edges.has(c)); }
    held(...codes) { return codes.some((c) => this.keys.has(c)); }

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
      let x = 0, y = 0;
      if (this.held('KeyA')) x -= 1;
      if (this.held('KeyD')) x += 1;
      if (this.held('KeyW')) y -= 1;
      if (this.held('KeyS')) y += 1;
      if (x || y) { const l = Math.hypot(x, y); return [x / l, y / l]; }
      return [0, 0];
    }

    // Returns {dx, dy} for a firing direction, {mouse: true} to fire at the mouse cursor, or null.
    aim() {
      if (this.pad) {
        const [x, y, m] = stick(this.pad.axes[2] || 0, this.pad.axes[3] || 0);
        if (m > 0.25) return { dx: x, dy: y };
      }
      const t = this.touch.right;
      if (t) {
        const dx = t.x - t.ox, dy = t.y - t.oy;
        if (Math.hypot(dx, dy) > 12) return { dx, dy };
      }
      let x = 0, y = 0;
      if (this.held('ArrowLeft', 'KeyJ')) x -= 1;
      if (this.held('ArrowRight', 'KeyL')) x += 1;
      if (this.held('ArrowUp', 'KeyI')) y -= 1;
      if (this.held('ArrowDown', 'KeyK')) y += 1;
      if (x || y) return { dx: x, dy: y };
      if (this.mouse.seen && (this.mouse.down || (this.autofire && this.device === 'mouse'))) return { mouse: true };
      return null;
    }

    bomb() {
      return this.pressed('Space', 'Mouse2', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Pad4', 'Pad5', 'Pad6', 'Pad7', 'Touch-bomb');
    }
  }

  GW.Input = Input;
})();
