// Pooled spark particles: streaks stretched along their velocity that slow down, fade, bounce off the
// arena walls and are swept around (and swallowed by) active gravity wells. The oldest particle is recycled
// when full.
'use strict';
(function () {
  const GW = window.GW;
  const { TAU, rand } = GW;

  class Particles {
    constructor(max) {
      this.max = max;
      const F = () => new Float32Array(max);
      this.x = F(); this.y = F(); this.vx = F(); this.vy = F();
      this.life = F(); this.maxLife = F();
      this.r = F(); this.g = F(); this.b = F();
      this.len = F(); this.drag = F();
      this.head = 0;
    }

    clear() { this.life.fill(0); }

    add(x, y, vx, vy, life, c, len = 1, drag = 0.94) {
      const i = this.head;
      this.head = (i + 1) % this.max;
      this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
      this.life[i] = this.maxLife[i] = life;
      this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
      this.len[i] = len; this.drag[i] = drag;
    }

    // Classic burst: most sparks fast, a few slow, colours blended between two tints.
    burst(x, y, n, c1, c2, speed = 1, life = 150, len = 1) {
      for (let i = 0; i < n; i++) {
        const s = 16 * speed * (1 - 1 / rand(1, 10));
        const a = rand(0, TAU);
        const t = Math.random();
        const c = [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
        this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1), c, len);
      }
    }

    update(w, h, holes) {
      const { x, y, vx, vy, life, drag } = this;
      const nh = holes.length;
      for (let i = 0; i < this.max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= 1;
        let X = x[i] + vx[i], Y = y[i] + vy[i];
        let VX = vx[i], VY = vy[i];
        if (X < 0) { X = 0; VX = Math.abs(VX); } else if (X > w) { X = w; VX = -Math.abs(VX); }
        if (Y < 0) { Y = 0; VY = Math.abs(VY); } else if (Y > h) { Y = h; VY = -Math.abs(VY); }
        for (let k = 0; k < nh; k++) {
          const hb = holes[k];
          const dx = hb.x - X, dy = hb.y - Y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 250000) continue;
          const d = Math.sqrt(d2) + 0.001;
          if (d < hb.r) life[i] *= 0.7; // swallowed: fade out fast inside the well
          const nx = dx / d, ny = dy / d;
          const pull = 10000 / (d2 + 10000);
          VX += nx * pull; VY += ny * pull;
          if (d < 400) { const t = 45 / (d + 100); VX += ny * t; VY -= nx * t; }
        }
        const dm = drag[i];
        VX *= dm; VY *= dm;
        if (Math.abs(VX) + Math.abs(VY) < 1e-4) { VX = 0; VY = 0; }
        x[i] = X; y[i] = Y; vx[i] = VX; vy[i] = VY;
      }
    }

    draw(R) {
      const { x, y, vx, vy, life, maxLife, r, g, b, len } = this;
      for (let i = 0; i < this.max; i++) {
        if (life[i] <= 0) continue;
        const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        let a = Math.min(1, Math.min((2 * life[i]) / maxLife[i], sp));
        a *= a;
        if (a < 0.01) continue;
        const L = 20 * len[i] * Math.min(Math.min(1, 0.2 * sp + 0.1), a) + 1.5;
        const ux = sp > 0 ? vx[i] / sp : 1, uy = sp > 0 ? vy[i] / sp : 0;
        R.line(x[i] - ux * L, y[i] - uy * L, x[i], y[i], 1.5, r[i] * a, g[i] * a, b[i] * a);
      }
    }
  }

  GW.Particles = Particles;
})();
