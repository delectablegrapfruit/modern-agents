// Enemy waves. A steady trickle of single enemies plus periodic set pieces (corner rushes, rings around the
// player, walls of enemies, Mayfly swarms, Snakes, Gravity Wells), all ramping with time alive.
'use strict';
(function () {
  const GW = window.GW;
  const { rand, TAU, weighted, clamp } = GW;

  // Set-piece sizes are 0.7x the original tuning, to make up for the ~1.9x larger enemy bodies.
  const N = (n) => Math.max(1, Math.round(n * 0.7));

  class Spawner {
    constructor(g) {
      this.g = g;
      this.reset();
    }

    reset() {
      this.trickle = 50;
      this.event = 60 * 14;
      this.lull = 60;
    }

    pause(frames) { this.lull = Math.max(this.lull, frames); }

    update() {
      const g = this.g;
      if (!g.player.alive) return;
      if (this.lull > 0) { this.lull--; return; }
      const t = g.time / 60;
      const cap = Math.min(320, 60 + t * 1.6);
      if (--this.trickle <= 0) {
        this.trickle = Math.max(8, Math.round(42 - t * 0.2));
        if (g.enemies.length < cap) this.single(t);
      }
      if (--this.event <= 0) {
        this.event = Math.max(100, Math.round(440 - t * 1.8));
        if (g.enemies.length < cap * 0.85) this.setPiece(t);
      }
    }

    holes() { return this.g.enemies.reduce((n, e) => n + (e.type === 'blackhole' && e.alive ? 1 : 0), 0); }
    holeCap(t) { return Math.min(8, 2 + Math.floor(t / 60)); }

    // A random spot at least minD from the player.
    spot(minD = 280, margin = 40) {
      const g = this.g, p = g.player;
      for (let i = 0; i < 16; i++) {
        const x = rand(margin, g.W - margin), y = rand(margin, g.H - margin);
        if (Math.hypot(x - p.x, y - p.y) >= minD) return [x, y];
      }
      return null;
    }

    put(type, x, y, minD = 170) {
      const g = this.g, p = g.player;
      x = clamp(x, 25, g.W - 25);
      y = clamp(y, 25, g.H - 25);
      if (Math.hypot(x - p.x, y - p.y) < minD) return null;
      return g.spawn(type, x, y);
    }

    single(t) {
      const holesOk = t >= 40 && this.holes() < this.holeCap(t);
      const type = weighted([
        ['wanderer', t < 10 ? 10 : t < 60 ? 4 : 2],
        ['grunt', t < 7 ? 0 : 5],
        ['weaver', t < 20 ? 0 : 3 + Math.min(3, t / 60)],
        ['spinner', t < 35 ? 0 : 2 + Math.min(3, t / 80)],
        ['snake', t < 55 ? 0 : 0.7 + Math.min(1.5, t / 150)],
        ['blackhole', holesOk ? 0.8 : 0],
        ['repulsor', t < 80 ? 0 : 1 + Math.min(2, t / 120)],
      ]);
      const s = type === 'blackhole' ? this.spot(300) : this.spot();
      if (type && s) this.put(type, s[0], s[1]);
    }

    groupType(t) {
      return weighted([
        ['wanderer', t < 45 ? 3 : 0.8],
        ['grunt', 4],
        ['weaver', t < 25 ? 0 : 3],
        ['spinner', t < 40 ? 0 : 2],
      ]);
    }

    corners(type, n) {
      const g = this.g, m = 60;
      const cs = [[m, m, 1, 1], [g.W - m, m, -1, 1], [m, g.H - m, 1, -1], [g.W - m, g.H - m, -1, -1]];
      for (const [cx, cy, dx, dy] of cs) {
        if (Math.hypot(cx - g.player.x, cy - g.player.y) < 260) continue;
        for (let i = 0; i < n; i++) {
          const k = i * 9;
          this.put(type, cx + dx * (k * 0.7 + rand(0, 30)), cy + dy * (k * 0.7 + rand(0, 30)), 200);
        }
      }
    }

    setPiece(t) {
      const g = this.g, p = g.player;
      const ev = weighted([
        ['corners', t >= 14 ? 4 : 0],
        ['cluster', t >= 22 ? 2 : 0],
        ['edge', t >= 32 ? 2 : 0],
        ['ring', t >= 45 ? 2 : 0],
        ['holes', t >= 50 && this.holes() < this.holeCap(t) ? 1 : 0],
        ['snakes', t >= 60 ? 1 : 0],
        ['mayflies', t >= 70 ? 1.3 : 0],
        ['repulsors', t >= 90 ? 1 : 0],
      ]);
      if (!ev) return;
      switch (ev) {
        case 'corners':
          this.corners(this.groupType(t), N(3 + Math.floor(Math.min(12, t / 20))));
          break;
        case 'cluster': {
          const s = this.spot(380, 90);
          if (!s) break;
          const type = this.groupType(t);
          const n = N(6 + Math.floor(Math.min(24, t / 10)));
          for (let i = 0; i < n; i++) {
            const a = rand(0, TAU), r = rand(0, 70);
            this.put(type, s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r);
          }
          break;
        }
        case 'edge': {
          const type = GW.pick(t < 60 ? ['grunt', 'wanderer'] : ['grunt', 'weaver', 'wanderer']);
          const n = N(10 + Math.floor(Math.min(30, t / 6)));
          // The wall furthest from the player.
          const d = [p.x, g.W - p.x, p.y, g.H - p.y];
          const side = d.indexOf(Math.max(...d));
          for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n;
            if (side === 0) this.put(type, 40, f * g.H);
            else if (side === 1) this.put(type, g.W - 40, f * g.H);
            else if (side === 2) this.put(type, f * g.W, 40);
            else this.put(type, f * g.W, g.H - 40);
          }
          break;
        }
        case 'ring': {
          const type = GW.pick(['grunt', 'weaver']);
          const n = N(10 + Math.floor(Math.min(22, t / 10)));
          const rad = 330;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            this.put(type, p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, 200);
          }
          break;
        }
        case 'holes': {
          const n = Math.min(this.holeCap(t) - this.holes(), N(2 + Math.floor(Math.min(3, t / 120))));
          for (let i = 0; i < n; i++) {
            const s = this.spot(320, 120);
            if (s) this.put('blackhole', s[0], s[1], 300);
          }
          break;
        }
        case 'snakes': {
          const n = N(2 + Math.floor(Math.min(4, t / 100)));
          for (let i = 0; i < n; i++) {
            const s = this.spot(350, 100);
            if (s) this.put('snake', s[0], s[1]);
          }
          break;
        }
        case 'mayflies':
          this.corners('mayfly', N(10 + Math.floor(Math.min(25, t / 10))));
          break;
        case 'repulsors':
          this.corners('repulsor', N(1 + Math.floor(Math.min(4, t / 120))));
          break;
      }
    }
  }

  GW.Spawner = Spawner;
})();
