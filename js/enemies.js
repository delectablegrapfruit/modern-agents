// Enemy roster: shape, colour, value and behaviour for every enemy type.
// Speeds and forces are per 1/60 s step, distances in arena units.
'use strict';
(function () {
  const GW = window.GW;
  const { TAU, rand, clamp, hex, wrapAngle, poly } = GW;

  const seek = (e, g, accel) => {
    const p = g.player;
    if (!p.alive) return [0, 0];
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    return [(dx / d) * accel, (dy / d) * accel];
  };

  const DIAMOND = [[1, 0], [0, 0.82], [-1, 0], [0, -0.82]];
  const SQUARE = [[0.75, 0.75], [-0.75, 0.75], [-0.75, -0.75], [0.75, -0.75]];
  const REPULSOR = [[1, 0], [-0.75, 0.85], [-0.35, 0], [-0.75, -0.85]];

  const col = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  const DEFS = {
    wanderer: {
      name: 'Wanderer', r: 15, points: 25, col: hex('#b44cff'), bounce: true,
      desc: 'Drifts aimlessly. Only dangerous if you fly into it.',
      init(e) { e.dir = rand(0, TAU); },
      update(e, g) {
        e.dir += rand(-0.1, 0.1);
        if (e.t % 6 === 0 && (e.x < 60 || e.x > g.W - 60 || e.y < 60 || e.y > g.H - 60)) {
          e.dir = Math.atan2(g.H / 2 - e.y, g.W / 2 - e.x) + rand(-Math.PI / 2, Math.PI / 2);
        }
        e.vx = (e.vx + Math.cos(e.dir) * 0.4) * 0.8;
        e.vy = (e.vy + Math.sin(e.dir) * 0.4) * 0.8;
        e.angle -= 0.06;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const s = e.r * 0.78 * sc;
        for (let i = 0; i < 4; i++) {
          poly(R, [[0, 0], [s, 0], [s, s]], e.x, e.y, e.angle + i * Math.PI / 2, 1, 1, 2, r, g, b);
        }
      },
    },

    grunt: {
      name: 'Grunt', r: 15, points: 50, col: hex('#35b8ff'),
      desc: 'Homes in on you, slowly but relentlessly.',
      update(e, g) {
        const [ax, ay] = seek(e, g, 0.58 + Math.min(0.2, g.time / 36000));
        e.vx = (e.vx + ax) * 0.8;
        e.vy = (e.vy + ay) * 0.8;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const w = Math.sin(e.t * 0.16) * 0.14;
        poly(R, DIAMOND, e.x, e.y, 0, e.r * (1 + w) * sc, e.r * (1 - w) * sc, 2.2, r, g, b);
        poly(R, DIAMOND, e.x, e.y, 0, e.r * 0.45 * (1 - w) * sc, e.r * 0.45 * (1 + w) * sc, 1.4, r * 0.7, g * 0.7, b * 0.7);
      },
    },

    weaver: {
      name: 'Weaver', r: 15, points: 100, col: hex('#3dff5c'),
      desc: 'Chases you and dodges out of the way of your shots.',
      update(e, g) {
        let [ax, ay] = seek(e, g, 0.72);
        for (const bl of g.bullets) {
          const rx = e.x - bl.x, ry = e.y - bl.y;
          const d2 = rx * rx + ry * ry;
          if (d2 > 22500) continue;
          const bs = Math.hypot(bl.vx, bl.vy) || 1;
          const ux = bl.vx / bs, uy = bl.vy / bs;
          const along = rx * ux + ry * uy;
          if (along < 0) continue;
          const perp = -rx * uy + ry * ux;
          if (Math.abs(perp) > 42) continue;
          const s = perp >= 0 ? 1 : -1;
          const f = 1.7 * (1 - along / 150);
          ax += -uy * s * f;
          ay += ux * s * f;
        }
        e.vx = (e.vx + ax) * 0.8;
        e.vy = (e.vy + ay) * 0.8;
        e.angle += 0.035;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const s = e.r * sc;
        poly(R, SQUARE, e.x, e.y, e.angle, s, s, 2.2, r, g, b);
        poly(R, [[0.75, 0.75], [-0.75, -0.75]], e.x, e.y, e.angle, s, s, 1.6, r, g, b, false);
        poly(R, [[-0.75, 0.75], [0.75, -0.75]], e.x, e.y, e.angle, s, s, 1.6, r, g, b, false);
      },
    },

    spinner: {
      name: 'Spinner', r: 16, points: 100, col: hex('#ff3bd0'),
      desc: 'Breaks into three Mini Spinners when you shoot it.',
      init(e) { e.wob = rand(0, TAU); },
      update(e, g) {
        e.wob += 0.07;
        let [ax, ay] = seek(e, g, 0.7);
        ax += -ay * Math.sin(e.wob) * 0.9;
        ay += ax * Math.sin(e.wob) * 0.9;
        e.vx = (e.vx + ax) * 0.8;
        e.vy = (e.vy + ay) * 0.8;
        e.angle += 0.09;
      },
      onDeath(e, g, byPlayer) {
        if (!byPlayer) return;
        for (let i = 0; i < 3; i++) {
          const a = e.angle + (i * TAU) / 3;
          const m = g.spawn('minispinner', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, true);
          if (m) { m.vx = Math.cos(a) * 5; m.vy = Math.sin(a) * 5; m.immune = 12; }
        }
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const s = e.r * sc;
        poly(R, SQUARE, e.x, e.y, e.angle, s, s, 2.2, r, g, b);
        poly(R, SQUARE, e.x, e.y, -e.angle * 1.5 + Math.PI / 4, s * 0.55, s * 0.55, 1.6, r, g, b);
      },
    },

    minispinner: {
      name: 'Mini Spinner', r: 9, points: 50, col: hex('#ff7df0'), spawnTime: 0,
      desc: 'Loops erratically towards you.',
      init(e) { e.orb = rand(0, TAU); e.spin = Math.random() < 0.5 ? -1 : 1; },
      update(e, g) {
        e.orb += 0.13 * e.spin;
        const [sx, sy] = seek(e, g, 0.38);
        e.vx = (e.vx + Math.cos(e.orb) * 1.05 + sx) * 0.84;
        e.vy = (e.vy + Math.sin(e.orb) * 1.05 + sy) * 0.84;
        e.angle += 0.2;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        poly(R, SQUARE, e.x, e.y, e.angle, e.r * 1.1 * sc, e.r * 1.1 * sc, 1.8, r, g, b);
      },
    },

    snake: {
      name: 'Snake', r: 11, points: 150, col: hex('#ff9420'),
      desc: 'Only the head can be destroyed. The tail soaks up bullets and is deadly to touch.',
      init(e) {
        e.len = 22;
        e.gap = 4;
        e.hn = e.len * e.gap + 1;
        e.hist = new Float32Array(e.hn * 2);
        for (let i = 0; i < e.hn; i++) { e.hist[i * 2] = e.x; e.hist[i * 2 + 1] = e.y; }
        e.hi = 0;
        e.heading = rand(0, TAU);
        e.wig = rand(0, TAU);
        e.segs = new Float32Array(e.len * 2);
        this.trail(e);
      },
      trail(e) {
        for (let s = 0; s < e.len; s++) {
          let j = (e.hi - (s + 1) * e.gap) % e.hn;
          if (j < 0) j += e.hn;
          e.segs[s * 2] = e.hist[j * 2];
          e.segs[s * 2 + 1] = e.hist[j * 2 + 1];
        }
      },
      update(e, g) {
        e.wig += 0.085;
        const p = g.player;
        let target = p.alive ? Math.atan2(p.y - e.y, p.x - e.x) : e.heading;
        const m = 90;
        if (e.x < m || e.x > g.W - m || e.y < m || e.y > g.H - m) target = Math.atan2(g.H / 2 - e.y, g.W / 2 - e.x);
        e.heading += clamp(wrapAngle(target - e.heading), -0.035, 0.035) + Math.sin(e.wig) * 0.075;
        const sp = 3.1;
        e.vx = Math.cos(e.heading) * sp;
        e.vy = Math.sin(e.heading) * sp;
        e.angle = e.heading;
      },
      after(e) {
        e.hi = (e.hi + 1) % e.hn;
        e.hist[e.hi * 2] = e.x;
        e.hist[e.hi * 2 + 1] = e.y;
        this.trail(e);
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const tail = hex('#ffd23c');
        let px = e.x, py = e.y;
        for (let s = 0; s < (e.spawn > 0 ? 0 : e.len); s++) {
          const x = e.segs[s * 2], y = e.segs[s * 2 + 1];
          const a = Math.atan2(py - y, px - x);
          const f = 1 - s / e.len;
          const size = (3 + 5 * f) * sc;
          const c = GW.mix(this.col, tail, s / e.len);
          poly(R, [[1, 0], [-0.8, 0.9], [-0.8, -0.9]], x, y, a, size, size, 1.6, c[0] * k, c[1] * k, c[2] * k);
          px = x; py = y;
        }
        const s = e.r * sc;
        poly(R, [[1.25, 0], [0, 0.8], [-0.9, 0], [0, -0.8]], e.x, e.y, e.angle, s, s, 2.4, r, g, b);
        poly(R, [[0.5, 0], [-0.3, 0.3], [-0.3, -0.3]], e.x, e.y, e.angle, s, s, 1.4, r, g, b);
      },
    },

    blackhole: {
      name: 'Gravity Well', r: 20, points: 150, col: hex('#ff2b3d'), spawnTime: 60, noPush: true,
      desc: 'Dormant until shot. Awake, it drags in you, your bullets and every enemy, adding the value of all it swallows. Overfed, it bursts into Protons.',
      init(e) { e.active = false; e.hp = 18; e.absorbed = 0; e.value = 150; e.spray = rand(0, TAU); },
      update(e, g) {
        e.vx *= 0.9; e.vy *= 0.9;
        const target = 20 + Math.min(26, e.absorbed * 1.2);
        e.r += (target - e.r) * 0.1;
        if (!e.active) return;
        e.spray -= TAU / 50;
        g.grid.applyImplosive(Math.sin(e.spray / 2) * 10 + 20, e.x, e.y, 200 + e.absorbed * 6);
        if (e.t % 2 === 0) {
          const sp = rand(10, 14);
          const vx = Math.cos(e.spray) * sp, vy = Math.sin(e.spray) * sp;
          const c = GW.hsv(rand(0, 0.6), 0.6, 1);
          g.particles.add(e.x + vy * 1.5 + rand(-4, 4), e.y - vx * 1.5 + rand(-4, 4), vx, vy, 170, c, 1, 0.96);
        }
      },
      hit(e, bl, g) {
        e.flash = 5;
        if (!e.active) {
          e.active = true;
          g.audio.play('bhwake');
          g.grid.applyExplosive(40, e.x, e.y, 200);
        }
        g.audio.play('bhhit');
        if (--e.hp <= 0) return 'kill';
        return 'absorb';
      },
      draw(e, R, k, sc, g) {
        const [r, g2, b] = col(this.col, k * (e.flash > 0 ? 2 : 1));
        const pulse = e.active ? 1 + Math.sin(e.t * 0.25) * 0.08 : 1;
        const rad = e.r * sc * pulse;
        R.circle(e.x, e.y, rad, 2.6, r, g2, b, 30);
        R.circle(e.x, e.y, rad * 0.64, 1.8, r * 0.8, g2 * 0.8, b * 0.8, 24);
        if (e.active) {
          const a = e.t * 0.08;
          for (let i = 0; i < 4; i++) R.circle(e.x, e.y, rad * 1.28, 1.6, r * 0.7, g2 * 0.7, b * 0.7, 5, a + (i * TAU) / 4, 0.8);
          for (let i = 0; i < 3; i++) R.circle(e.x, e.y, rad * 0.35, 1.4, r, g2, b, 4, -a * 1.7 + (i * TAU) / 3, 1.2);
        } else {
          R.circle(e.x, e.y, rad * 0.3, 1.2, r * 0.5, g2 * 0.5, b * 0.5, 12);
        }
      },
    },

    proton: {
      name: 'Proton', r: 6, points: 50, col: hex('#4f8dff'), spawnTime: 0, bounce: true,
      desc: 'Flung out of a bursting Gravity Well. Very fast; bounces off the walls.',
      init(e) { const a = rand(0, TAU), s = rand(5, 8.5); e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s; },
      update(e, g) {
        const [ax, ay] = seek(e, g, 0.12);
        e.vx += ax; e.vy += ay;
        const s = Math.hypot(e.vx, e.vy) || 1;
        const t = clamp(s, 4.5, 8.5) / s;
        e.vx *= t; e.vy *= t;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        R.circle(e.x, e.y, e.r * sc, 2, r, g, b, 12);
        R.circle(e.x, e.y, e.r * 0.35 * sc, 1.4, r, g, b, 6);
      },
    },

    repulsor: {
      name: 'Repulsor', r: 15, points: 150, col: hex('#ff3a30'),
      desc: 'Its front shield deflects bullets. Hit it from the side or behind.',
      init(e) { e.shield = 6; },
      update(e, g) {
        const p = g.player;
        if (p.alive) e.angle += clamp(wrapAngle(Math.atan2(p.y - e.y, p.x - e.x) - e.angle), -0.05, 0.05);
        e.vx = (e.vx + Math.cos(e.angle) * 0.95) * 0.8;
        e.vy = (e.vy + Math.sin(e.angle) * 0.95) * 0.8;
      },
      hit(e, bl, g) {
        const a = Math.atan2(bl.y - e.y, bl.x - e.x);
        if (Math.abs(wrapAngle(a - e.angle)) < 1.1 && e.shield > 0) {
          const nx = Math.cos(a), ny = Math.sin(a);
          const dot = bl.vx * nx + bl.vy * ny;
          if (dot < 0) { bl.vx -= 2 * dot * nx; bl.vy -= 2 * dot * ny; }
          bl.x = e.x + nx * (e.r + 8); bl.y = e.y + ny * (e.r + 8);
          bl.deflected = true;
          e.shield--;
          e.flash = 6;
          e.vx -= nx * 2.5; e.vy -= ny * 2.5;
          g.audio.play('deflect');
          return 'deflect';
        }
        return 'kill';
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const s = e.r * sc;
        poly(R, REPULSOR, e.x, e.y, e.angle, s, s, 2.2, r, g, b);
        const sh = e.shield / 6;
        const f = (0.35 + 0.65 * sh) * (e.flash > 0 ? 2 : 1) * k;
        R.circle(e.x, e.y, s * 1.45, 2.8, 1 * f, 0.55 * f, 0.5 * f, 8, e.angle - 1.1, 2.2);
      },
    },

    mayfly: {
      name: 'Mayfly', r: 7, points: 10, col: hex('#8ad8ff'), spawnTime: 30,
      desc: 'Arrives in huge, fast swarms from the corners.',
      init(e) { e.ph = rand(0, TAU); },
      update(e, g) {
        const [ax, ay] = seek(e, g, 0.6);
        e.vx = (e.vx + ax + rand(-1.3, 1.3)) * 0.86;
        e.vy = (e.vy + ay + rand(-1.3, 1.3)) * 0.86;
        e.angle = Math.atan2(e.vy, e.vx);
        e.ph += 0.7;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const f = (0.35 + 0.65 * Math.abs(Math.sin(e.ph))) * e.r * sc;
        poly(R, [[0, 0], [-0.9, 1], [0.9, 1]], e.x, e.y, e.angle + Math.PI / 2, f, f, 1.6, r, g, b);
        poly(R, [[0, 0], [-0.9, -1], [0.9, -1]], e.x, e.y, e.angle + Math.PI / 2, f, f, 1.6, r, g, b);
      },
    },
  };

  for (const k in DEFS) DEFS[k].type = k;

  GW.Enemies = DEFS;
  GW.ENEMY_ORDER = ['wanderer', 'grunt', 'weaver', 'spinner', 'minispinner', 'snake', 'blackhole', 'proton', 'repulsor', 'mayfly'];

  GW.makeEnemy = function (type, x, y) {
    const d = DEFS[type];
    const e = {
      type, def: d, x, y, vx: 0, vy: 0, r: d.r, points: d.points, angle: rand(0, TAU),
      t: 0, spawn: d.spawnTime !== undefined ? d.spawnTime : 45, alive: true, flash: 0, immune: 0,
    };
    e.spawnTotal = e.spawn;
    if (d.init) d.init.call(d, e);
    return e;
  };

  GW.SHIP = [[16, 0], [-7, -12], [-13, -9], [-3, -2.5], [-3, 2.5], [-13, 9], [-7, 12]];
})();
