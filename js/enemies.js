// Enemy roster: shape, colour, value and behaviour for every enemy type, plus the ship outline.
// Speeds and forces are per 1/60 s step, distances in arena units (world px). Outlines are +x forward.
'use strict';
(function () {
  const GW = window.GW;
  const { TAU, rand, clamp, hex, mix, wrapAngle, poly } = GW;

  const WHITE = [1, 1, 1];

  const seek = (e, g, accel) => {
    const p = g.player;
    if (!p.alive) return [0, 0];
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    return [(dx / d) * accel, (dy / d) * accel];
  };

  // Outlines in world px (or model units where a scale is noted).
  const GRUNT = [[0, -1], [1, 0], [0, 1], [-1, 0]];                        // scaled by (sx, sy)
  const sq = (h) => [[h, h], [-h, h], [-h, -h], [h, -h]];
  const WEAVER_SQ = sq(20.5);
  const WEAVER_DIA = [[20.5, 0], [0, 20.5], [-20.5, 0], [0, -20.5]];
  const SPINNER_SQ = sq(22);
  const TINY_SQ = sq(13.5);
  const DIAG_A = [[1, 1], [-1, -1]], DIAG_B = [[-1, 1], [1, -1]];          // scaled by the half-size
  // OpenGW snake head (14-vertex loop, rounded dome front, V-notch rear), shifted -0.5 model units along x.
  const SNAKE_HEAD = [[1.53, 0], [1.404, 0.4], [1.0575, 0.71], [0.558, 0.9], [0.135, 0.9], [-0.288, 0.68], [-0.513, 0.46],
    [0, 0], [-0.513, -0.46], [-0.288, -0.68], [0.135, -0.9], [0.558, -0.9], [1.0575, -0.71], [1.404, -0.4]]
    .map(([x, y]) => [x - 0.5, y]);
  const SNAKE_HEAD_SCALE = 17;
  const SNAKE_TAIL_W = (s, len) => 0.5 + 8 * (1 - s / len); // half-width of tail segment s
  // Repulsor: a U with forward prongs and an X across the bowl (model units, x1.64 px).
  const REPULSOR = [[-1, 8], [8, 8], [12, 11.5], [8, 15], [-5, 15], [-14, 5], [-14, -5], [-5, -15], [8, -15], [12, -11.5], [8, -8], [-1, -8]];
  const REPULSOR_OPEN = [[[-1, 8], [-14, -5]], [[-1, -8], [-14, 5]], [[8, 8], [8, 15]], [[8, -15], [8, -8]]];
  const REPULSOR_SCALE = 1.64;
  // Mayfly: three open strokes, a crossed "A" with the apex forward (model units, x10.9 px).
  const MAYFLY = [[[1.25, -0.25], [-0.9, 1]], [[1.25, 0.25], [-0.9, -1]], [[-0.5, 1.2], [-0.5, -1.2]]];
  const MAYFLY_SCALE = 10.9;

  const col = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  const BH_R = 34, BH_WAKE = 34 * 1.4, BH_GROW = 1.4, BH_MAX = 68;

  const DEFS = {
    wanderer: {
      name: 'Wanderer', r: 20, points: 25, col: hex('#C060FF'), bounce: true,
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
        const s = 23 * sc;
        for (let i = 0; i < 4; i++) {
          poly(R, [[0, 0], [s, 0], [s, s]], e.x, e.y, e.angle + i * Math.PI / 2, 1, 1, 2.2, r, g, b);
        }
      },
    },

    grunt: {
      name: 'Grunt', r: 22, points: 50, col: hex('#50F0FF'),
      desc: 'Homes in on you, slowly but relentlessly.',
      update(e, g) {
        const [ax, ay] = seek(e, g, 0.58 + Math.min(0.2, g.time / 36000));
        e.vx = (e.vx + ax) * 0.8;
        e.vy = (e.vy + ay) * 0.8;
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const w = Math.sin(e.t * 0.07) * 4;
        poly(R, GRUNT, e.x, e.y, 0, (22 + w) * sc, (29 - w) * sc, 2.2, r, g, b);
      },
    },

    weaver: {
      name: 'Weaver', r: 20, points: 100, col: hex('#4DFF6A'),
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
        poly(R, WEAVER_SQ, e.x, e.y, e.angle, sc, sc, 2.2, r, g, b);
        poly(R, WEAVER_DIA, e.x, e.y, e.angle, sc, sc, 2.2, r, g, b);
      },
    },

    spinner: {
      name: 'Spinner', r: 21, points: 100, col: hex('#FF55DD'),
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
          if (m) { m.vx = Math.cos(a) * 5; m.vy = Math.sin(a) * 5; m.immune = 20; }
        }
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const h = 22 * sc;
        poly(R, SPINNER_SQ, e.x, e.y, e.angle, sc, sc, 2.2, r, g, b);
        poly(R, DIAG_A, e.x, e.y, e.angle, h, h, 2.2, r, g, b, false);
        poly(R, DIAG_B, e.x, e.y, e.angle, h, h, 2.2, r, g, b, false);
      },
    },

    minispinner: {
      name: 'Mini Spinner', r: 13, points: 50, col: hex('#FF7DF0'), spawnTime: 0,
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
        // Newborn tinies are invulnerable and fade from white to pink.
        const c = e.immune > 0 ? mix(WHITE, this.col, 1 - Math.min(1, e.immune / 20)) : this.col;
        const [r, g, b] = col(c, k);
        const h = 13.5 * sc;
        poly(R, TINY_SQ, e.x, e.y, e.angle, sc, sc, 2.2, r, g, b);
        poly(R, DIAG_A, e.x, e.y, e.angle, h, h, 2.2, r, g, b, false);
        poly(R, DIAG_B, e.x, e.y, e.angle, h, h, 2.2, r, g, b, false);
      },
    },

    snake: {
      name: 'Snake', r: 15, points: 150, col: hex('#A050FF'), tailCol: hex('#FFB050'),
      desc: 'Wanders the arena. Only the head can be destroyed; the tail soaks up bullets and is deadly to touch.',
      init(e) {
        e.len = 22;
        e.gap = 4;
        e.hn = e.len * e.gap + 1;
        e.hist = new Float32Array(e.hn * 2);
        for (let i = 0; i < e.hn; i++) { e.hist[i * 2] = e.x; e.hist[i * 2 + 1] = e.y; }
        e.hi = 0;
        e.heading = rand(0, TAU);
        e.wig = rand(0, TAU);
        e.retime = 0; // pick a wander target on the first update
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
      // A random point in the arena at least 400 px away.
      retarget(e, g) {
        const m = 120;
        // Fallback: the far corner (always well over 400 px away in this arena).
        let x = e.x < g.W / 2 ? g.W - m : m, y = e.y < g.H / 2 ? g.H - m : m;
        for (let i = 0; i < 16; i++) {
          const tx = rand(m, g.W - m), ty = rand(m, g.H - m);
          if (Math.hypot(tx - e.x, ty - e.y) >= 400) { x = tx; y = ty; break; }
        }
        e.tx = x; e.ty = y;
        e.retime = rand(180, 300);
      },
      update(e, g) {
        e.wig += 0.085;
        if (--e.retime <= 0 || Math.hypot(e.tx - e.x, e.ty - e.y) < 100) this.retarget(e, g);
        let target = Math.atan2(e.ty - e.y, e.tx - e.x);
        const m = 90;
        if (e.x < m || e.x > g.W - m || e.y < m || e.y > g.H - m) target = Math.atan2(g.H / 2 - e.y, g.W / 2 - e.x);
        e.heading += clamp(wrapAngle(target - e.heading), -0.045, 0.045) + Math.sin(e.wig) * 0.075;
        const sp = 3.6;
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
        const [tr, tg, tb] = col(this.tailCol, 0.9 * k);
        let px = e.x, py = e.y;
        const n = e.spawn > 0 ? 0 : e.len;
        for (let s = 0; s < n; s++) {
          const x = e.segs[s * 2], y = e.segs[s * 2 + 1];
          const a = Math.atan2(py - y, px - x);
          const w = SNAKE_TAIL_W(s, e.len);
          poly(R, [[8, 0], [-8, w], [-8, -w]], x, y, a, 1, 1, 2.2, tr, tg, tb);
          px = x; py = y;
        }
        const [r, g, b] = col(this.col, k);
        const s = SNAKE_HEAD_SCALE * sc;
        poly(R, SNAKE_HEAD, e.x, e.y, e.angle, s, s, 2.2, r, g, b);
      },
    },

    blackhole: {
      name: 'Gravity Well', r: BH_R, points: 150, col: hex('#FF3030'), spawnTime: 60, noPush: true,
      desc: 'Dormant until shot. Awake, it drags in you and every enemy and bends your bullets away, adding the value of all it swallows. Overfed, it bursts into Protons.',
      init(e) { e.active = false; e.hp = 25; e.absorbed = 0; e.value = 150; e.spray = rand(0, TAU); e.pop = 0; e.rv = 0; },
      update(e, g) {
        // Radius: dormant 34; awake 34*1.4 plus 1.4 per swallow (cap 68). Waking pops it with a springy overshoot.
        const target = e.active ? Math.min(BH_MAX, BH_WAKE + e.absorbed * BH_GROW) : BH_R;
        if (e.pop > 0) {
          e.pop--;
          e.rv = e.rv * 0.72 + (target - e.r) * 0.25;
          e.r += e.rv;
        } else {
          e.rv = 0;
          e.r += (target - e.r) * 0.25;
        }
        if (!e.active) {
          // Dormant: creep slowly toward the player.
          const [ax, ay] = seek(e, g, 0.03);
          e.vx = (e.vx + ax) * 0.98;
          e.vy = (e.vy + ay) * 0.98;
          const s = Math.hypot(e.vx, e.vy);
          if (s > 0.35) { e.vx *= 0.35 / s; e.vy *= 0.35 / s; }
          return;
        }
        e.vx *= 0.9; e.vy *= 0.9;
        e.spray -= TAU / 50;
        g.grid.applyImplosive(Math.sin(e.spray / 2) * 10 + 20, e.x, e.y, 200 + e.absorbed * 6);
        // Random-hued sparks appear around it and get sucked in.
        for (let i = 0; i < 2; i++) {
          const a = rand(0, TAU), d = rand(2, 5) * e.r;
          const ca = Math.cos(a), sa = Math.sin(a);
          g.particles.add(e.x + ca * d, e.y + sa * d, -sa * 2 - ca, ca * 2 - sa, 120, GW.hsv(rand(0, 6), 0.8, 1));
        }
      },
      hit(e, bl, g) {
        e.flash = 5;
        // White sparks from the rim point facing the bullet.
        const a = Math.atan2(bl.y - e.y, bl.x - e.x);
        const rx = e.x + Math.cos(a) * e.r, ry = e.y + Math.sin(a) * e.r;
        for (let i = 0; i < 16; i++) {
          const b = a + rand(-0.6, 0.6), s = rand(3, 7);
          g.particles.add(rx, ry, Math.cos(b) * s, Math.sin(b) * s, 25, WHITE);
        }
        if (!e.active) {
          // The first hit only wakes it.
          e.active = true;
          e.hp = 25;
          e.pop = 20;
          e.rv = 0;
          e.r += 3;
          g.audio.play('bhwake');
          g.grid.applyExplosive(40, e.x, e.y, 200);
          return 'absorb';
        }
        g.audio.play('bhhit');
        if (--e.hp <= 0) return 'kill';
        return 'absorb';
      },
      draw(e, R, k, sc) {
        const fl = e.flash > 0 ? 2 : 1;
        if (!e.active) {
          const [r, g, b] = col(this.col, k * fl);
          R.circle(e.x, e.y, e.r * sc, 2.6, r, g, b, 30);
          return;
        }
        const rad = e.r * sc * (1 + 0.08 * Math.sin(e.t * 0.3));
        R.circle(e.x, e.y, rad * 1.25, 5, 0.45 * k, 0.06 * k, 0.06 * k, 40);
        R.circle(e.x, e.y, rad, 2.6, 1.6 * k * fl, 1.1 * k * fl, 1.1 * k * fl, 36);
      },
    },

    proton: {
      name: 'Proton', r: 13, points: 50, col: hex('#5A7CFF'), spawnTime: 0, bounce: true,
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
        R.circle(e.x, e.y, 13 * sc, 2.2, r, g, b, 16);
      },
    },

    repulsor: {
      name: 'Repulsor', r: 22, points: 100, col: hex('#FF4A30'),
      desc: 'Lines up on you, then charges. Its front shield never breaks; hit it from the side or behind.',
      init(e) { e.mode = 'aim'; e.off = 0; e.brake = 0; e.shieldOn = false; },
      update(e, g) {
        // The shield shows while any bullet is within 300 px.
        e.shieldOn = false;
        for (const b of g.bullets) {
          if (!b.alive) continue;
          const dx = b.x - e.x, dy = b.y - e.y;
          if (dx * dx + dy * dy < 90000) { e.shieldOn = true; break; }
        }
        const p = g.player;
        if (!p.alive) { e.vx *= 0.9; e.vy *= 0.9; return; }
        const diff = wrapAngle(Math.atan2(p.y - e.y, p.x - e.x) - e.angle);
        if (e.mode === 'brake') {
          e.vx *= 0.85; e.vy *= 0.85;
          if (--e.brake <= 0) e.mode = 'aim';
        } else if (e.mode === 'aim') {
          e.angle += clamp(diff, -0.05, 0.05);
          e.vx *= 0.9; e.vy *= 0.9;
          if (Math.abs(diff) < 0.2) { e.mode = 'charge'; e.off = 0; }
        } else {
          e.vx = (e.vx + Math.cos(e.angle) * 0.3) * 0.95;
          e.vy = (e.vy + Math.sin(e.angle) * 0.3) * 0.95;
          e.off = Math.abs(diff) > Math.PI / 3 ? e.off + 1 : 0;
          if (e.off >= 20) { e.mode = 'brake'; e.brake = 10; }
        }
      },
      hit(e, bl, g) {
        const a = Math.atan2(bl.y - e.y, bl.x - e.x);
        if (Math.abs(wrapAngle(a - e.angle)) < 0.7) {
          const nx = Math.cos(a), ny = Math.sin(a);
          const dot = bl.vx * nx + bl.vy * ny;
          if (dot < 0) { bl.vx -= 2 * dot * nx; bl.vy -= 2 * dot * ny; }
          bl.x = e.x + nx * (e.r + 8); bl.y = e.y + ny * (e.r + 8);
          bl.deflected = true;
          e.flash = 6;
          e.vx -= nx * 2.5; e.vy -= ny * 2.5;
          g.audio.play('deflect');
          return 'deflect';
        }
        return 'kill';
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const s = REPULSOR_SCALE * sc;
        poly(R, REPULSOR, e.x, e.y, e.angle, s, s, 2.2, r, g, b);
        for (const seg of REPULSOR_OPEN) poly(R, seg, e.x, e.y, e.angle, s, s, 2.2, r, g, b, false);
        if (!e.shieldOn && !(e.flash > 0)) return;
        // Shield: three lines across the front that ripple outward and grow.
        const f = 1.2 * k * (e.flash > 0 ? 1.6 : 1);
        const ca = Math.cos(e.angle), sa = Math.sin(e.angle);
        for (let i = 0; i < 3; i++) {
          const q = (e.t + 4 * i) % 12;
          const fwd = (22 + q) * sc, half = 18 * (q / 12) * sc;
          const cx = e.x + ca * fwd, cy = e.y + sa * fwd;
          R.line(cx - sa * half, cy + ca * half, cx + sa * half, cy - ca * half, 1.6, this.col[0] * f, this.col[1] * f, this.col[2] * f);
        }
      },
    },

    mayfly: {
      name: 'Mayfly', r: 11, points: 10, col: hex('#8060FF'), spawnTime: 30,
      desc: 'Arrives in huge, fast swarms from the corners.',
      init(e) { e.ph = rand(0, TAU); },
      update(e, g) {
        const [ax, ay] = seek(e, g, 0.6);
        e.vx = (e.vx + ax + rand(-1.3, 1.3)) * 0.86;
        e.vy = (e.vy + ay + rand(-1.3, 1.3)) * 0.86;
        e.ph += 0.7;
        e.angle = Math.atan2(e.vy, e.vx) + 0.3 * Math.sin(e.ph);
      },
      draw(e, R, k, sc) {
        const [r, g, b] = col(this.col, k);
        const s = MAYFLY_SCALE * sc;
        for (const seg of MAYFLY) poly(R, seg, e.x, e.y, e.angle, s, s, 2.2, r, g, b, false);
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
      t: 0, spawn: d.spawnTime !== undefined ? d.spawnTime : 45, alive: true, flash: 0, immune: 0, indicate: 0,
    };
    e.spawnTotal = e.spawn;
    if (d.init) d.init.call(d, e);
    return e;
  };

  // Draws one live enemy in the arena: the spawn-in collapse (scale 2.6 -> 1 while flickering in) and the
  // killer's blink after it has taken a life (drawn 5 steps on, 5 off while e.indicate counts down).
  GW.drawEnemy = function (e, R, g) {
    let k = 1, sc = 1;
    if (e.spawn > 0) {
      const f = e.spawn / e.spawnTotal;
      sc = 1 + 1.6 * f;
      k = (1 - f) * (0.55 + 0.45 * Math.sin(0.8 * e.spawn));
    }
    if (e.indicate > 0 && Math.floor(e.indicate / 5) % 2 === 1) return;
    e.def.draw(e, R, k * 1.1, sc, g || null);
  };

  // Player ship: the OpenGW claw, +x forward. A pointed chevron at the back, hooked prongs leading, and a
  // V-notch mouth. 39.4 long x 46.4 wide.
  GW.SHIP = [[-23.2, 0], [-3.5, 23.2], [16.2, 11.6], [0.5, 16.7], [-9.3, 0], [0.5, -16.7], [16.2, -11.6], [-3.5, -23.2]];
})();
