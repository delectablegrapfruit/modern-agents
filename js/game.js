// The game world: player ship, bullets, enemies, gravity wells, bombs, scoring, lives, camera and the
// attract-mode autopilot. Runs at a fixed 60 steps per second.
'use strict';
(function () {
  const GW = window.GW;
  const { TAU, rand, clamp, lerp, hex, mix } = GW;

  const W = 1800, H = 1150;          // arena
  const VIEW_W = 1200, VIEW_H = 780; // at least this much of it is on screen
  const MULT_KILLS = [0, 25, 50, 100, 200, 400, 800, 1200, 1600, 2000];
  const LIFE_EVERY = 75000, BOMB_EVERY = 100000;
  const WEAPON_AT = 10000, WEAPON_SWAP = 600;
  const WEAPONS = {
    twin: { name: 'TWIN SHOT', cd: 6, speed: 12, shots: [[0, -6], [0, 6]] },
    rapid: { name: 'RAPID FIRE', cd: 4, speed: 13, shots: [[-0.045, 0], [0, 0], [0.045, 0]] },
    spread: { name: 'SPREAD FIRE', cd: 6, speed: 12, shots: [[-0.17, 0], [-0.06, 0], [0.06, 0], [0.17, 0]] },
  };

  const WHITE = [1, 1, 1];
  const YELLOW = hex('#ffd84a');
  const SPARK = hex('#9fd8ff');
  const EXHAUST_MID = hex('#ffbb1e'), EXHAUST_SIDE = hex('#c82609');

  const randVec = (max) => { const a = rand(0, TAU), m = rand(0, max); return [Math.cos(a) * m, Math.sin(a) * m]; };

  class Game {
    constructor(audio) {
      this.audio = audio;
      this.W = W;
      this.H = H;
      this.grid = new GW.Grid(W, H, 25);
      this.particles = new GW.Particles(7000);
      this.spawner = new GW.Spawner(this);
      this.cam = { x: W / 2, y: H / 2, zoom: 1, vw: VIEW_W, vh: VIEW_H };
      this.dev = { w: 1280, h: 720, dpr: 1 };
      this.onEvent = () => {};
      this.newGame(true);
    }

    newGame(demo) {
      this.demo = demo;
      this.enemies = [];
      this.bullets = [];
      this.player = { x: W / 2, y: H / 2, vx: 0, vy: 0, ex: 0, ey: 0, r: 11, angle: -Math.PI / 2, alive: true, cd: 0, respawn: 0 };
      this.score = 0;
      this.lives = 3;
      this.bombs = 3;
      this.kills = 0;
      this.mult = 1;
      this.nextLife = LIFE_EVERY;
      this.nextBomb = BOMB_EVERY;
      this.time = 0;       // frames alive, drives difficulty
      this.frames = 0;
      this.lifeFrames = 0; // frames since the last death
      this.weaponClock = 0;
      this.weapon = 'twin';
      this.ring = null;
      this.over = false;
      this.msgs = [];
      this.stats = { shots: 0, kills: 0, byType: {}, bombs: 0, deaths: 0, maxMult: 1, frames: 0 };
      this.aiWander = rand(0, TAU);
      this.particles.clear();
      this.spawner.reset();
      if (!demo) this.respawnFx();
    }

    setViewport(w, h, dpr) { this.dev = { w, h, dpr }; }

    msg(text, col, frames = 110) {
      this.msgs = this.msgs.filter((m) => m.text !== text);
      this.msgs.push({ text, col: col || '#ffffff', t: frames, total: frames });
      if (this.msgs.length > 4) this.msgs.shift();
    }

    // ---- simulation -------------------------------------------------------------------------------------

    step(input) {
      this.frames++;
      const p = this.player;
      if (p.alive) { this.time++; this.lifeFrames++; if (!this.demo) this.stats.frames++; }
      if (this.demo) { this.time = Math.min(this.time, 60 * 150); this.bombs = 3; }
      const holes = this.enemies.filter((e) => e.type === 'blackhole' && e.alive && e.active);
      this.updatePlayer(input);
      this.updateBullets(holes);
      this.spawner.update();
      this.updateEnemies(holes);
      this.collide();
      this.updateRing();
      this.updateWeapon();
      this.particles.update(W, H, holes);
      this.grid.update();
      if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
      if (this.bullets.some((b) => !b.alive)) this.bullets = this.bullets.filter((b) => b.alive);
      for (const m of this.msgs) m.t--;
      this.msgs = this.msgs.filter((m) => m.t > 0);
      this.audio.hum(holes.length * 0.35);
      this.updateCamera();
    }

    updatePlayer(input) {
      const p = this.player;
      if (!p.alive) {
        if (p.respawn > 0 && --p.respawn === 0) {
          if (this.lives <= 0 && !this.demo) {
            this.over = true;
            this.onEvent('gameover');
          } else this.respawn();
        }
        return;
      }
      let mx = 0, my = 0, aim = null;
      if (this.demo) {
        [mx, my, aim] = this.ai();
      } else {
        [mx, my] = input.move();
        const a = input.aim();
        if (a) {
          if (a.mouse) {
            const [wx, wy] = this.screenToWorld(input.mouse.x, input.mouse.y);
            aim = [wx - p.x, wy - p.y];
          } else aim = [a.dx, a.dy];
        }
        if (input.bomb()) this.useBomb();
      }
      const speed = 7.2;
      p.vx += (mx * speed - p.vx) * 0.45;
      p.vy += (my * speed - p.vy) * 0.45;
      p.x = clamp(p.x + p.vx + p.ex, p.r, W - p.r);
      p.y = clamp(p.y + p.vy + p.ey, p.r, H - p.r);
      p.ex *= 0.86;
      p.ey *= 0.86;
      if (mx * mx + my * my > 0.01) {
        p.angle = Math.atan2(p.vy, p.vx);
        this.exhaust();
      }
      if (p.cd > 0) p.cd--;
      if (aim && (aim[0] || aim[1]) && p.cd <= 0) this.fire(Math.atan2(aim[1], aim[0]));
    }

    exhaust() {
      const p = this.player;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < 0.5) return;
      const ux = p.vx / sp, uy = p.vy / sp;
      const bx = -ux * 3, by = -uy * 3;
      const s = 0.6 * Math.sin((this.frames / 60) * 10);
      const qx = by * s, qy = -bx * s;
      const ex = p.x - ux * 12, ey = p.y - uy * 12;
      const P = this.particles;
      const [r1, r2] = randVec(1);
      P.add(ex, ey, bx + r1, by + r2, 45, [0.7, 0.7, 0.7], 0.6);
      P.add(ex, ey, bx + r1, by + r2, 45, EXHAUST_MID.map((c) => c * 0.7), 0.6);
      const [a1, a2] = randVec(0.3), [b1, b2] = randVec(0.3);
      P.add(ex, ey, bx + qx + a1, by + qy + a2, 45, EXHAUST_SIDE.map((c) => c * 0.8), 0.6);
      P.add(ex, ey, bx - qx + b1, by - qy + b2, 45, EXHAUST_SIDE.map((c) => c * 0.8), 0.6);
    }

    fire(a) {
      const p = this.player, w = WEAPONS[this.weapon];
      p.cd = w.cd;
      const c = Math.cos(a), s = Math.sin(a);
      for (const [da, lat] of w.shots) {
        const ang = a + da + rand(-0.02, 0.02) + rand(-0.02, 0.02);
        this.bullets.push({
          x: p.x + c * 12 - s * lat, y: p.y + s * 12 + c * lat,
          vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed, speed: w.speed, alive: true, life: 240,
        });
      }
      if (!this.demo) this.stats.shots++;
      this.audio.play('shoot');
    }

    updateBullets(holes) {
      for (const b of this.bullets) {
        if (!b.alive) continue;
        if (holes.length) {
          for (const h of holes) {
            const dx = h.x - b.x, dy = h.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > 90000) continue;
            const d = Math.sqrt(d2) + 0.01;
            const f = 5000 / (d2 + 1600);
            b.vx += (dx / d) * f;
            b.vy += (dy / d) * f;
          }
          const s = Math.hypot(b.vx, b.vy) || 1;
          b.vx *= b.speed / s;
          b.vy *= b.speed / s;
        }
        b.x += b.vx;
        b.y += b.vy;
        if (--b.life <= 0) { b.alive = false; continue; }
        this.grid.applyExplosive(0.25 * b.speed, b.x, b.y, 70);
        if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
          b.alive = false;
          const x = clamp(b.x, 0, W), y = clamp(b.y, 0, H);
          for (let i = 0; i < 22; i++) {
            const [vx, vy] = randVec(9);
            this.particles.add(x, y, vx, vy, 50, SPARK, 1, 0.96);
          }
          this.audio.play('wall');
        }
      }
    }

    updateEnemies(holes) {
      const es = this.enemies;
      for (const e of es) {
        if (!e.alive) continue;
        if (e.indicate > 0) {
          // The enemy that took the player's life blinks in place, then vanishes without an explosion.
          if (--e.indicate <= 0) e.alive = false;
          continue;
        }
        if (e.flash > 0) e.flash--;
        if (e.immune > 0) e.immune--;
        if (e.spawn > 0) { e.spawn--; continue; }
        e.t++;
        const d = e.def;
        d.update(e, this);
        e.x += e.vx;
        e.y += e.vy;
        const r = e.r;
        if (e.x < r) { e.x = r; e.vx = d.bounce ? Math.abs(e.vx) : 0; }
        else if (e.x > W - r) { e.x = W - r; e.vx = d.bounce ? -Math.abs(e.vx) : 0; }
        if (e.y < r) { e.y = r; e.vy = d.bounce ? Math.abs(e.vy) : 0; }
        else if (e.y > H - r) { e.y = H - r; e.vy = d.bounce ? -Math.abs(e.vy) : 0; }
        if (d.after) d.after(e);
      }

      const p = this.player;
      for (const h of holes) {
        if (!h.alive || h.indicate > 0) continue;
        for (const e of es) {
          if (!e.alive || e === h || e.spawn > 0 || e.indicate > 0 || e.type === 'blackhole') continue;
          const dx = h.x - e.x, dy = h.y - e.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 102400) continue;
          const d = Math.sqrt(d2) + 0.01;
          if (d < h.r * 0.85 + e.r * 0.4) { this.absorb(h, e); if (!h.alive) break; continue; }
          const f = 1.6 * (1 - d / 320);
          e.vx += (dx / d) * f;
          e.vy += (dy / d) * f;
        }
        if (p.alive && h.alive) {
          const dx = h.x - p.x, dy = h.y - p.y;
          const d = Math.hypot(dx, dy) + 0.01;
          if (d < 320) {
            const f = 0.72 * (1 - d / 320);
            p.ex += (dx / d) * f;
            p.ey += (dy / d) * f;
          }
        }
      }

      // Enemies shoulder each other apart (sweep and prune along x).
      const act = this.pushList || (this.pushList = []);
      act.length = 0;
      for (const e of es) if (e.alive && e.spawn <= 0 && !(e.indicate > 0) && !e.def.noPush) act.push(e);
      act.sort((a, b) => a.x - b.x);
      const n = act.length;
      for (let i = 0; i < n; i++) {
        const a = act[i];
        const reach = a.r + 24; // no pushable enemy is wider than 22
        for (let j = i + 1; j < n; j++) {
          const b = act[j];
          const dx = a.x - b.x;
          if (-dx > reach) break;
          const rr = a.r + b.r;
          if (-dx > rr) continue;
          const dy = a.y - b.y;
          if (dy > rr || dy < -rr) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const k = 10 / (d2 + 1);
          a.vx += dx * k; a.vy += dy * k;
          b.vx -= dx * k; b.vy -= dy * k;
        }
      }
    }

    absorb(h, e) {
      e.alive = false;
      h.absorbed++;
      h.value += e.value || e.points;
      h.hp += 2;
      h.flash = 4;
      this.particles.burst(e.x, e.y, 24, e.def.col, [1, 1, 1], 0.4, 70);
      this.audio.play('absorb');
      if (h.absorbed >= 20) this.burstHole(h);
    }

    // An overfed Gravity Well bursts into 18 Protons.
    burstHole(h) {
      h.alive = false;
      for (let i = 0; i < 18; i++) this.spawn('proton', h.x + rand(-10, 10), h.y + rand(-10, 10), true);
      this.particles.burst(h.x, h.y, 400, h.def.col, [1, 0.85, 0.29], 1.4, 190);
      this.grid.applyExplosive(160, h.x, h.y, 320);
      this.audio.play('bhburst');
    }

    spawn(type, x, y, quiet) {
      if (!GW.Enemies[type]) return null;
      const e = GW.makeEnemy(type, x, y);
      this.enemies.push(e);
      if (!quiet) this.audio.play('spawn_' + type);
      return e;
    }

    collide() {
      const es = this.enemies, p = this.player;
      const spark = (x, y, n, speed, life, c) => {
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), m = rand(0, speed);
          this.particles.add(x, y, Math.cos(a) * m, Math.sin(a) * m, life, c, 0.6);
        }
      };
      for (const b of this.bullets) {
        if (!b.alive) continue;
        for (const e of es) {
          if (!e.alive || e.spawn > 0 || e.immune > 0 || e.indicate > 0) continue;
          const rr = e.r + 4;
          const dx = e.x - b.x;
          if (dx > rr || dx < -rr) continue;
          const dy = e.y - b.y;
          if (dy > rr || dy < -rr || dx * dx + dy * dy > rr * rr) continue;
          const res = e.def.hit ? e.def.hit(e, b, this) : 'kill';
          if (res === 'kill') {
            b.alive = false;
            this.killEnemy(e, true);
          } else if (res === 'absorb') {
            b.alive = false; // the enemy's hit() made its own sparks
          }
          break;
        }
        if (!b.alive) continue;
        // Snake tails soak up bullets.
        for (const e of es) {
          if (e.type !== 'snake' || !e.alive || e.spawn > 0 || e.indicate > 0) continue;
          for (let s = 1; s < e.len; s++) {
            const dx = e.segs[s * 2] - b.x, dy = e.segs[s * 2 + 1] - b.y;
            if (dx * dx + dy * dy < 81) {
              b.alive = false;
              spark(b.x, b.y, 8, 6, 35, e.def.tailCol || e.def.col);
              this.audio.play('tail');
              break;
            }
          }
          if (!b.alive) break;
        }
      }

      if (!p.alive) return;
      const hitR = p.hitR || p.r * 0.75;
      for (const e of es) {
        if (!e.alive || e.spawn > 0 || e.indicate > 0) continue;
        const rr = hitR + e.r * 0.8;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < rr * rr) { this.killPlayer(e); return; }
        if (e.type === 'snake') {
          const tr = hitR * 0.9 + 5;
          for (let s = 1; s < e.len; s++) {
            const sx = e.segs[s * 2] - p.x, sy = e.segs[s * 2 + 1] - p.y;
            if (sx * sx + sy * sy < tr * tr) { this.killPlayer(e); return; }
          }
        }
      }
    }

    killEnemy(e, byPlayer) {
      if (!e.alive) return;
      e.alive = false;
      const d = e.def;
      const big = e.type === 'blackhole';
      const n = byPlayer ? (big ? 380 : e.type === 'mayfly' ? 45 : 110) : 36;
      this.particles.burst(e.x, e.y, n, d.col, mix(d.col, WHITE, 0.55), big ? 1.4 : 1, big ? 190 : 150);
      if (e.type === 'snake') {
        for (let s = 0; s < e.len; s += 2) {
          this.particles.burst(e.segs[s * 2], e.segs[s * 2 + 1], byPlayer ? 8 : 3, d.col, YELLOW, 0.5, 90);
        }
      }
      if (byPlayer || big) this.grid.applyExplosive(big ? 110 : 22, e.x, e.y, big ? 280 : 130);
      this.audio.play('explode', big ? 1.6 : e.type === 'mayfly' || e.type === 'proton' ? 0.55 : 1);
      if (d.onDeath) d.onDeath(e, this, byPlayer);
      if (byPlayer) {
        this.kills++;
        if (!this.demo) {
          this.stats.kills++;
          this.stats.byType[e.type] = (this.stats.byType[e.type] || 0) + 1;
        }
        this.addScore((e.value || e.points) * this.mult);
        this.updateMult();
        if (big) this.onEvent('holekill', e);
      }
    }

    killPlayer() {
      const p = this.player;
      p.alive = false;
      p.respawn = 150;
      if (!this.demo) { this.lives--; this.stats.deaths++; }
      const P = this.particles;
      for (let i = 0; i < 1200; i++) {
        const s = 16 * (1 - 1 / rand(1, 10));
        const a = rand(0, TAU);
        P.add(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, 190, mix(WHITE, YELLOW, Math.random()), 1, 0.96);
      }
      this.grid.applyDirected(0, 0, 5000, p.x, p.y, 50);
      this.grid.applyExplosive(90, p.x, p.y, 350);
      this.audio.play('death');
      for (const e of this.enemies) this.killEnemy(e, false);
      for (const b of this.bullets) b.alive = false;
      this.ring = null;
      this.kills = 0;
      this.mult = 1;
      this.lifeFrames = 0;
      this.time = Math.floor(this.time * 0.92);
      this.spawner.pause(40);
      this.onEvent('death');
    }

    respawn() {
      const p = this.player;
      Object.assign(p, { x: W / 2, y: H / 2, vx: 0, vy: 0, ex: 0, ey: 0, alive: true, cd: 20 });
      this.spawner.pause(90);
      this.respawnFx();
    }

    respawnFx() {
      const p = this.player;
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * TAU, r = 120;
        this.particles.add(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, -Math.cos(a) * 6, -Math.sin(a) * 6, 24, mix(WHITE, SPARK, Math.random()), 1, 0.97);
      }
      this.grid.applyImplosive(60, p.x, p.y, 220);
      this.audio.play('respawn');
    }

    useBomb() {
      const p = this.player;
      if (!p.alive || this.bombs <= 0 || this.ring) return;
      this.bombs--;
      if (!this.demo) this.stats.bombs++;
      this.ring = { x: p.x, y: p.y, r: 0, kills: 0 };
      this.audio.play('bomb');
      this.spawner.pause(100);
      for (let i = 0; i < 600; i++) {
        const a = rand(0, TAU), s = rand(6, 26);
        this.particles.add(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, 100, mix(WHITE, SPARK, Math.random()), 1.2, 0.95);
      }
      this.onEvent('bomb');
    }

    updateRing() {
      const g = this.ring;
      if (!g) return;
      g.r += 30;
      this.grid.applyRing(g.x, g.y, g.r, 70, 1.4);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - g.x, dy = e.y - g.y, rr = g.r + e.r;
        if (dx * dx + dy * dy < rr * rr) { this.killEnemy(e, false); g.kills++; }
      }
      if (g.r > Math.hypot(W, H)) {
        this.onEvent('bombdone', g.kills);
        this.ring = null;
      }
    }

    addScore(n) {
      this.score += n;
      if (this.demo) return;
      while (this.score >= this.nextLife) {
        this.lives++;
        this.nextLife += LIFE_EVERY;
        this.msg('EXTRA LIFE', '#9dffb0');
        this.audio.play('life');
      }
      while (this.score >= this.nextBomb) {
        this.bombs++;
        this.nextBomb += BOMB_EVERY;
        this.msg('EXTRA BOMB', '#ffe45c');
        this.audio.play('bombup');
      }
    }

    updateMult() {
      let m = 1;
      for (let i = MULT_KILLS.length - 1; i >= 0; i--) if (this.kills >= MULT_KILLS[i]) { m = i + 1; break; }
      if (m > this.mult) {
        this.mult = m;
        if (!this.demo) {
          this.msg('MULTIPLIER x' + m, '#7ef7ff', 80);
          this.audio.play('mult');
          this.stats.maxMult = Math.max(this.stats.maxMult, m);
        }
      }
    }

    updateWeapon() {
      if (!this.player.alive) return;
      let w = 'twin';
      if (this.score >= WEAPON_AT) {
        w = Math.floor(this.weaponClock / WEAPON_SWAP) % 2 === 0 ? 'rapid' : 'spread';
        this.weaponClock++;
      }
      if (w !== this.weapon) {
        this.weapon = w;
        if (!this.demo) {
          this.msg(WEAPONS[w].name, '#ffcf5a', 90);
          this.audio.play('upgrade');
        }
      }
    }

    // Attract-mode pilot: flee what is close, stay off the walls, shoot the nearest thing.
    ai() {
      const p = this.player;
      let mx = 0, my = 0, best = null, bd = Infinity, crowd = 0;
      const flee = (x, y, range, w) => {
        const dx = x - p.x, dy = y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > range * range) return;
        const d = Math.sqrt(d2) + 1;
        const f = (range / d - 1) * w;
        mx -= (dx / d) * f;
        my -= (dy / d) * f;
      };
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (e.spawn <= 0 && d2 < bd) { bd = d2; best = e; }
        if (d2 < 120 * 120) crowd++;
        flee(e.x, e.y, e.type === 'blackhole' ? (e.active ? 380 : 120) : 230, e.spawn > 0 ? 0.4 : 1);
        if (e.type === 'snake') for (let s = 2; s < e.len; s += 4) flee(e.segs[s * 2], e.segs[s * 2 + 1], 120, 0.8);
      }
      const m = 170;
      if (p.x < m) mx += ((m - p.x) / m) * 3;
      if (p.x > W - m) mx -= ((p.x - (W - m)) / m) * 3;
      if (p.y < m) my += ((m - p.y) / m) * 3;
      if (p.y > H - m) my -= ((p.y - (H - m)) / m) * 3;
      this.aiWander += rand(-0.08, 0.08);
      mx += Math.cos(this.aiWander) * 0.5;
      my += Math.sin(this.aiWander) * 0.5;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      if (crowd >= 6) this.useBomb();
      const aim = best ? [best.x + best.vx * 8 - p.x, best.y + best.vy * 8 - p.y] : null;
      return [mx, my, aim];
    }

    // ---- view -------------------------------------------------------------------------------------------

    updateCamera() {
      const { w, h } = this.dev;
      const c = this.cam;
      // Portrait screens (phones) get a narrower but closer view so the arena fills more of the height.
      c.zoom = w >= h ? Math.min(w / VIEW_W, h / VIEW_H) : Math.min(w / 720, h / 1150);
      c.vw = w / c.zoom;
      c.vh = h / c.zoom;
      const p = this.player;
      if (p.alive) {
        c.x += (p.x - c.x) * 0.1;
        c.y += (p.y - c.y) * 0.1;
      }
      const m = 60;
      const fit = (v, view, size) => { const lo = view / 2 - m, hi = size - view / 2 + m; return lo > hi ? size / 2 : clamp(v, lo, hi); };
      c.x = fit(c.x, c.vw, W);
      c.y = fit(c.y, c.vh, H);
    }

    screenToWorld(cssX, cssY) {
      const { w, h, dpr } = this.dev, c = this.cam;
      return [c.x + (cssX * dpr - w / 2) / c.zoom, c.y + (cssY * dpr - h / 2) / c.zoom];
    }

    worldToScreen(x, y) {
      const { w, h, dpr } = this.dev, c = this.cam;
      return [((x - c.x) * c.zoom + w / 2) / dpr, ((y - c.y) * c.zoom + h / 2) / dpr];
    }

    draw(R, opts) {
      const c = this.cam;
      R.begin(c.x, c.y, c.zoom);
      this.grid.draw(R, c.x, c.y, opts.gridHi);

      const bw = 3.2, b0 = 0.42, b1 = 0.62, b2 = 1.0;
      R.line(0, 0, W, 0, bw, b0, b1, b2);
      R.line(W, 0, W, H, bw, b0, b1, b2);
      R.line(W, H, 0, H, bw, b0, b1, b2);
      R.line(0, H, 0, 0, bw, b0, b1, b2);

      this.particles.draw(R);

      for (const e of this.enemies) {
        if (!e.alive) continue;
        let k = 1, sc = 1;
        if (e.spawn > 0) {
          const f = e.spawn / e.spawnTotal;
          sc = 1 + f * 1.6;
          k = (1 - f) * (0.55 + 0.45 * Math.sin(e.spawn * 0.8));
        }
        e.def.draw(e, R, k * 1.1, sc, this);
      }

      for (const b of this.bullets) {
        R.line(b.x - b.vx * 0.9, b.y - b.vy * 0.9, b.x, b.y, 2.6, 1.35, 1.05, 0.45);
      }

      const p = this.player;
      if (p.alive) GW.poly(R, GW.SHIP, p.x, p.y, p.angle, 1, 1, 2.3, 1.4, 1.4, 1.4);

      if (this.ring) {
        const g = this.ring;
        const f = 1 - g.r / Math.hypot(W, H);
        R.circle(g.x, g.y, g.r, 9, 0.5 * f + 0.2, 0.75 * f + 0.2, 1.3 * f + 0.2, 128);
        R.circle(g.x, g.y, g.r * 0.93, 3, 0.4 * f, 0.5 * f, 1 * f, 128);
      }
      R.end();
    }
  }

  GW.Game = Game;
  GW.WEAPONS = WEAPONS;
  GW.MULT_KILLS = MULT_KILLS;
  GW.RULES = { LIFE_EVERY, BOMB_EVERY, WEAPON_AT, WEAPON_SWAP };
})();
