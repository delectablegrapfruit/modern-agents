/* Memaze — the game: modes, level flow, ball physics, camera, pickups, win/lose media, and the per-frame loop. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { clamp, lerp, hashStr, hashInts, rng } = MZ;
  const Gen = MZ.Gen;
  const R = Gen.BALL_R;

  const PHYS = {
    acc: 950, maxV: 600, fric: 1.05, boost: 380, boostMax: 900, grabMax: 2200,
    surf: {
      normal: { acc: 1, fric: 1 }, bridge: { acc: 1, fric: 1 }, blink: { acc: 1, fric: 1 },
      ice: { acc: 0.45, fric: 0.14 }, sticky: { acc: 0.75, fric: 4.2 },
    },
  };

  const S = () => MZ.Save.settings;

  // ---------- full-screen win / lose media ----------
  const FX = {
    playing: null,
    async play(kind) {
      const cfg = S()[kind];
      const el = MZ.$('#fx'), host = MZ.$('#fx-media');
      const item = cfg.on ? MZ.Media.resolve(kind, cfg.media) : null;
      const fresh = item ? await MZ.Media.freshUrl(item) : null;
      return new Promise((resolve) => {
        el.hidden = false;
        el.className = 'fx fx-' + kind + ' anim-' + (S().display.reducedMotion ? 'none' : cfg.anim) + (S().display.reduceFlash ? ' calm' : '');
        host.style.setProperty('--fx-size', Math.round(cfg.size * 100) + '%');
        host.dataset.fit = cfg.fit;
        let done = false, timer = 0, m = null;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          el.removeEventListener('pointerdown', skip);
          window.removeEventListener('keydown', skip);
          MZ.Audio.Music.duck(false);
          Confetti.stop();
          el.classList.add('out');
          setTimeout(() => { MZ.Media.unmount(host); if (fresh) fresh.revoke(); el.hidden = true; el.classList.remove('out'); resolve(); }, 180);
          this.playing = null;
        };
        const started = performance.now();
        const skip = (e) => { if (performance.now() - started > 250) { if (e && e.preventDefault) e.preventDefault(); finish(); } };
        this.playing = { finish };
        el.addEventListener('pointerdown', skip);
        window.addEventListener('keydown', skip);
        if (kind === 'win' && !S().display.reduceFlash) Confetti.start();
        if (!item) { timer = setTimeout(finish, kind === 'win' ? 1200 : 700); return; }
        m = MZ.Media.mount(host, Object.assign({}, item, { url: fresh.url }), { muted: !cfg.sound, loop: false, chroma: cfg.chroma });
        if (item.kind === 'video') {
          const v = m.el;
          v.volume = clamp(S().audio.master * S().audio.media, 0, 1);
          if (cfg.sound) MZ.Audio.Music.duck(true);
          v.addEventListener('ended', finish);
          v.addEventListener('error', () => { timer = setTimeout(finish, 600); });
          const cap = cfg.maxVideo > 0 ? cfg.maxVideo : 600;
          timer = setTimeout(finish, cap * 1000);
        } else {
          timer = setTimeout(finish, cfg.duration * 1000);
        }
      });
    },
    skip() { if (this.playing) this.playing.finish(); },
  };

  const Confetti = {
    raf: 0, parts: [],
    start() {
      const c = MZ.$('#fx-confetti'), g = c.getContext('2d');
      c.width = innerWidth; c.height = innerHeight;
      this.parts = [];
      for (let i = 0; i < 140; i++) {
        this.parts.push({
          x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 900,
          r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: 'hsl(' + ((Math.random() * 360) | 0) + ',90%,60%)',
        });
      }
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        g.clearRect(0, 0, c.width, c.height);
        for (const p of this.parts) {
          p.vy += 1100 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); g.restore();
        }
        this.raf = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(this.raf);
      const c = MZ.$('#fx-confetti');
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
    },
  };

  // ---------- the player sprite (a DOM element pinned to the screen centre) ----------
  const Player = {
    itemId: null, chromaKey: '',
    apply(force) {
      const cfg = S().player;
      const item = MZ.Media.resolve('player', cfg.media);
      const ck = JSON.stringify(cfg.chroma);
      if (!force && item && item.id === this.itemId && ck === this.chromaKey && cfg.media !== 'random') return;
      this.itemId = item ? item.id : null;
      this.chromaKey = ck;
      MZ.Media.mount(MZ.$('#player-media'), item, { muted: true, loop: true, chroma: cfg.chroma });
    },
  };
  const GoalMedia = {
    itemId: null,
    apply() {
      const cfg = S().goal;
      const host = MZ.$('#goal-media');
      const item = cfg.media === 'default:portal' ? null : MZ.Media.resolve('goal', cfg.media);
      const id = item && item.kind !== 'builtin' ? item.id + JSON.stringify(cfg.chroma) : null;
      if (id === this.itemId) return;
      this.itemId = id;
      if (!id) { MZ.Media.unmount(host); host.hidden = true; return; }
      host.hidden = false;
      MZ.Media.mount(host, item, { muted: true, loop: true, chroma: cfg.chroma });
    },
    get active() { return !!this.itemId; },
  };
  const Backdrop = {
    renderer: null, itemId: null,
    init() { if (MZ.Background) this.renderer = MZ.Background.create(MZ.$('#bg')); },
    apply() {
      const b = S().background;
      let pattern = b.pattern;
      if (!MZ.Save.isUnlocked(pattern)) pattern = 'rgb';
      if (this.renderer) this.renderer.setConfig(S().rgb, pattern, { motion: S().display.reducedMotion ? 0.25 : 1, parallax: b.parallax });
      const host = MZ.$('#bg-media');
      const item = b.kind === 'media' ? MZ.Media.resolve('background', b.media) : null;
      const id = item && item.kind !== 'builtin' ? item.id + JSON.stringify(b.chroma) : null;
      host.dataset.fit = b.fit;
      host.style.setProperty('--dim', b.dim);
      host.style.setProperty('--blur', b.blur + 'px');
      if (id !== this.itemId) {
        this.itemId = id;
        if (id) MZ.Media.mount(host, item, { muted: true, loop: true, chroma: b.chroma });
        else MZ.Media.unmount(host);
      }
      if (item && item.kind === 'image' && b.fit === 'tile') host.style.backgroundImage = 'url("' + item.url + '")';
      else host.style.backgroundImage = '';
      host.hidden = !id;
      MZ.$('#bg').style.visibility = id && !b.rgbUnder ? 'hidden' : 'visible';
    },
    resize(w, h, dpr) {
      const c = MZ.$('#bg'), k = Math.min(dpr, 1.5);
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      if (this.renderer) this.renderer.resize(c.width, c.height);
    },
    draw(t, cam) {
      if (!this.renderer || MZ.$('#bg').style.visibility === 'hidden') return;
      this.renderer.render(t, cam);
    },
    color(t) {
      if (this.renderer) return this.renderer.colors(t, 1)[0]; // same (motion-scaled) clock as the background
      return MZ.Background ? MZ.Background.color(S().rgb, t, 0) : '#ff00aa';
    },
  };

  // ---------- the game ----------
  const Game = MZ.emitter({
    state: 'boot', mode: null, run: null, meta: null,
    maze: null, world: null, gems: [], pads: [], beacons: [],
    ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, scale: 1, alpha: 1, face: 0, mirror: 1, boostCap: PHYS.maxV },
    cam: { x: 0, y: 0, zoom: 1 }, userZoom: 1, tiltVis: { x: 0, y: 0 },
    t: 0, clock: 0, elapsed: 0, falls: 0, gemsTaken: 0, particles: [], stateT: 0, lastTick: -1,
    padCool: 0, attract: 0,
    FX, Player, Backdrop, GoalMedia, PHYS,

    init() {
      this.renderer = new MZ.Renderer(MZ.$('#maze'));
      this.minimap = new MZ.Minimap(MZ.$('#minimap'));
      this.input = new MZ.Input(MZ.$('#stage'), MZ.$('#joy'));
      this.input.onZoom = (k) => { this.userZoom = clamp(this.userZoom * k, 0.45, 2.2); };
      Backdrop.init();
      this.applySettings();
      window.addEventListener('resize', () => this.resize());
      this.resize();
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
      let last = performance.now(), fpsN = 0, fpsT = 0;
      const loop = (now) => {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        fpsN++; fpsT += dt;
        if (fpsT > 0.5) { this.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
        try { this.frame(dt); } catch (e) { console.error(e); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    applySettings() {
      const s = S();
      Object.assign(this.input.cfg, s.controls);
      MZ.Audio.setVolumes({ master: s.audio.master, sfx: s.audio.sfx, music: s.audio.music, media: s.audio.media });
      MZ.Audio.Music.set(s.music.media);
      document.documentElement.classList.toggle('reduced-motion', s.display.reducedMotion);
      Player.apply();
      GoalMedia.apply();
      Backdrop.apply();
      this.resize();
    },

    resize() {
      const w = innerWidth, h = innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, S().display.quality);
      const margin = S().controls.tilt3d && !S().display.reducedMotion ? Math.round(Math.max(w, h) * 0.12) : 0;
      this.renderer.resize(w, h, dpr, margin);
      Backdrop.resize(w, h, dpr);
      this.minimap.size();
      if (this.maze) this.minimap.setMaze(this.maze), this.revealAll();
      this.baseZoom = clamp(Math.min(w, h) / 820, 0.58, 1.25);
    },
    revealAll() { if (this.trail) for (const p of this.trail) this.minimap.reveal(p.x, p.y); },
    zoomTarget() { return this.baseZoom * S().gameplay.zoom * this.userZoom; },

    // ----- starting things -----
    startJourney(level) {
      this.mode = 'journey';
      this.run = { level };
      const p = Gen.levelParams(level);
      this.loadMaze(p, { label: 'Level ' + level, level });
    },
    startGauntlet() {
      this.mode = 'gauntlet';
      this.run = { seed: (Math.random() * 1e9) | 0, cleared: 0, lives: 3 };
      this.nextGauntlet();
    },
    nextGauntlet() {
      const r = this.run, lv = 3 + Math.round(r.cleared * 1.6);
      const p = Gen.tierParams(lv, rng(hashInts(r.seed, r.cleared)));
      p.seed = hashInts(r.seed, r.cleared, 99);
      p.timeFactor *= 0.9;
      this.loadMaze(p, { label: 'Gauntlet · Maze ' + (r.cleared + 1) });
    },
    startDaily() {
      const day = MZ.today();
      this.mode = 'daily';
      this.run = { day };
      const r = rng(hashStr('memaze/daily/' + day));
      const p = Gen.tierParams(14 + r.int(0, 10), r);
      p.seed = hashStr('memaze/daily/seed/' + day);
      this.loadMaze(p, { label: 'Daily · ' + day });
    },
    startCustom(o) {
      this.mode = 'custom';
      this.run = { opts: o };
      const p = Gen.customParams(o);
      this.loadMaze(p, { label: 'Seed “' + o.seed + '”' });
    },
    startEndless(seedText) {
      this.mode = 'endless';
      const seed = hashStr('memaze/endless/' + (seedText || String(Math.random())));
      this.run = { seed, seedText, lives: 3, taken: new Set(), lit: new Set(), best: 0, gems: 0, beaconsLit: 0, check: null };
      this.maze = null;
      this.world = new MZ.World();
      this.chunks = new Map();
      this.chunkAt = null;
      this.loadChunks(0, 0);
      const c0 = this.chunks.get('0,0').data;
      this.run.check = { x: c0.start.x, y: c0.start.y };
      this.run.origin = { x: c0.start.x, y: c0.start.y, r: c0.discs[0].r };
      this.falls = 0;
      this.firstTry = true;
      this.meta = { label: 'Endless', sub: 'Seed ' + (seedText || '#' + (seed % 100000)) };
      this.minimap.maze = null;
      this.beginLevel(c0.start, 75);
    },

    loadMaze(params, meta) {
      const m = Gen.generate(params);
      this.maze = m;
      this.world = MZ.World.fromMaze(m);
      this.gems = m.gems.map((g) => Object.assign({ taken: false }, g));
      this.pads = m.pads;
      this.beacons = null;
      this.meta = Object.assign({ sub: m.name + ' · #' + m.seed.toString(36) }, meta);
      this.minimap.setMaze(m);
      this.trail = [];
      this.falls = 0;
      this.firstTry = true;
      this.beginLevel(m.start, m.timeLimit);
      this.emit('level');
    },

    beginLevel(start, timeLimit) {
      Player.apply(S().player.media === 'random');
      GoalMedia.apply();
      if (S().background.media === 'random' && S().background.kind === 'media') { Backdrop.itemId = null; Backdrop.apply(); }
      const b = this.ball;
      Object.assign(b, { x: start.x, y: start.y, vx: 0, vy: 0, spin: 0, scale: 1, alpha: 1, boostCap: PHYS.maxV });
      this.startPos = { x: start.x, y: start.y };
      this.timeLimit = timeLimit;
      this.clock = timeLimit;
      this.elapsed = 0;
      this.gemsTaken = this.gems ? this.gems.filter((g) => g.taken).length : 0;
      this.particles = [];
      this.lastTick = -1;
      this.input.release();
      this.input.takeGrab();
      this.cam.x = start.x; this.cam.y = start.y;
      this.introLen = this.firstTry ? 1.7 : 0.7;
      this.setState('intro');
      MZ.Audio.Music.ensure();
      this.emit('begin');
    },

    restartLevel() {
      if (this.mode === 'endless') return;
      this.gems.forEach((g) => (g.taken = false));
      this.firstTry = false;
      this.beginLevel(this.maze.start, this.maze.timeLimit);
    },

    setState(st) {
      this.state = st;
      this.stateT = 0;
      this.input.enabled = st === 'play';
      if (st !== 'play') this.input.release();
      document.body.dataset.state = st;
      this.emit('state', st);
    },

    pause() {
      if (this.state !== 'play' && this.state !== 'intro') return;
      this.pausedFrom = this.state;
      this.setState('paused');
      MZ.Audio.roll(0, false);
    },
    resume() {
      if (this.state !== 'paused') return;
      this.setState(this.pausedFrom || 'play');
    },
    quit() {
      FX.skip();
      this.mode = null;
      this.maze = null;
      this.world = null;
      this.setState('menu');
      MZ.Audio.roll(0, false);
      this.emit('quit');
    },

    // ----- per frame -----
    frame(dt) {
      const st = this.state;
      this.t += dt;
      this.stateT += dt;
      const zt = this.zoomTarget();
      if (st === 'intro') {
        const k = clamp(this.stateT / this.introLen, 0, 1);
        const fit = this.fitZoom();
        this.cam.zoom = Math.exp(lerp(Math.log(Math.min(fit, zt)), Math.log(zt), MZ.easeInOut(k)));
        if (this.stateT >= this.introLen) { this.setState('play'); MZ.Audio.play('go'); this.emit('go'); }
      } else if (st === 'play') {
        this.cam.zoom = lerp(this.cam.zoom, zt, 1 - Math.exp(-dt * 8));
        this.step(dt);
      } else if (st === 'fall') {
        this.stepFall(dt);
      } else if (st === 'goal') {
        this.stepGoal(dt);
      } else if (st === 'menu') {
        this.stepAttract(dt);
      }
      if (st !== 'menu' && st !== 'boot') { this.cam.x = this.ball.x; this.cam.y = this.ball.y; }
      this.stepParticles(dt);
      this.draw(dt);
    },

    fitZoom() {
      if (!this.maze) return 0.35;
      const b = this.maze.bounds, x = this.ball.x, y = this.ball.y;
      const dx = Math.max(x - b.minX, b.maxX - x) + 60, dy = Math.max(y - b.minY, b.maxY - y) + 60;
      return clamp(Math.min(innerWidth / (2 * dx), innerHeight / (2 * dy)), 0.06, 1);
    },

    step(dt) {
      const b = this.ball, inp = this.input, cfg = S().controls;
      if (S().gameplay.timer || this.mode === 'endless') {
        this.clock -= dt;
        const sec = Math.ceil(this.clock);
        if (this.clock < 10 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; MZ.Audio.play('tick'); this.emit('tick', sec); }
        if (this.clock <= 0) { this.clock = 0; this.lose('time'); return; }
      }
      this.elapsed += dt;
      this.padCool = Math.max(0, this.padCool - dt);

      const u = inp.vector();
      const grab = cfg.scheme === 'grab' ? inp.takeGrab() : null;
      if (cfg.scheme === 'grab') {
        const f = inp.takeFling();
        if (f) {
          const sg = cfg.invert ? 1 : -1, z = this.cam.zoom;
          b.vx = clamp((f.vx * sg) / z, -PHYS.grabMax, PHYS.grabMax);
          b.vy = clamp((f.vy * sg) / z, -PHYS.grabMax, PHYS.grabMax);
        }
      } else inp.takeGrab();

      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      const sens = clamp(cfg.sensitivity, 0.3, 3);
      for (let i = 0; i < n; i++) {
        const q = this.world.query(b.x, b.y, this.t);
        const sf = PHYS.surf[q.seg && q.depth > -4 ? q.seg.type : 'normal'] || PHYS.surf.normal;
        b.surface = q.seg ? q.seg.type : 'normal';
        let mx, my;
        if (grab && grab.active) {
          // The world sticks to the finger: move by the drag, remember its velocity for the fling.
          const sg = cfg.invert ? 1 : -1, z = this.cam.zoom;
          mx = (grab.x * sg) / z / n + u.x * PHYS.acc * 0.35 * h * h;
          my = (grab.y * sg) / z / n + u.y * PHYS.acc * 0.35 * h * h;
          b.vx = lerp(b.vx, mx / h, 0.3);
          b.vy = lerp(b.vy, my / h, 0.3);
        } else {
          b.vx += u.x * PHYS.acc * sf.acc * sens * h;
          b.vy += u.y * PHYS.acc * sf.acc * sens * h;
          const f = Math.exp(-PHYS.fric * sf.fric * h);
          b.vx *= f; b.vy *= f;
          b.boostCap = Math.max(PHYS.maxV, b.boostCap - 500 * h);
          const sp = Math.hypot(b.vx, b.vy), cap = b.boostCap * (sf === PHYS.surf.ice ? 1.15 : 1);
          if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
          mx = b.vx * h; my = b.vy * h;
        }
        // Move in slices no longer than a fraction of the ball, so no gap is ever skipped.
        const dist = Math.hypot(mx, my), k = Math.max(1, Math.ceil(dist / (R * 0.4)));
        for (let j = 0; j < k; j++) {
          b.x += mx / k; b.y += my / k;
          if (!this.onFloor()) { this.fall(); return; }
        }
        if (this.pickups()) return;
      }
      const sp = Math.hypot(b.vx, b.vy);
      MZ.Audio.roll(sp, S().audio.roll);
      if (this.maze && ((this.trailT = (this.trailT || 0) + dt) > 0.15)) {
        this.trailT = 0;
        this.minimap.reveal(b.x, b.y);
        this.trail.push({ x: b.x, y: b.y });
        if (this.trail.length > 4000) this.trail.splice(0, 2000);
      }
      if (this.mode === 'endless') this.endlessTick();
    },

    onFloor() {
      const b = this.ball, rule = S().gameplay.rule;
      const q = this.world.query(b.x, b.y, this.t);
      const need = rule === 'strict' ? R * 0.55 : -2;
      if (q.depth >= need) return true;
      if (rule === 'casual' && q.seg && q.depth > -R * 1.5) {
        const s = q.seg, dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
        const tt = l2 ? clamp(((b.x - s.ax) * dx + (b.y - s.ay) * dy) / l2, 0, 1) : 0;
        const cx = s.ax + dx * tt, cy = s.ay + dy * tt;
        let nx = b.x - cx, ny = b.y - cy;
        const d = Math.hypot(nx, ny) || 1;
        nx /= d; ny /= d;
        b.x = cx + nx * (s.hw - 1.5);
        b.y = cy + ny * (s.hw - 1.5);
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) {
          b.vx -= nx * vn * 1.35; b.vy -= ny * vn * 1.35;
          if (vn > 140 && this.t - (this.bumpT || 0) > 0.12) { this.bumpT = this.t; MZ.Audio.play('bump'); }
        }
        return true;
      }
      return false;
    },

    pickups() {
      const b = this.ball;
      if (this.gems) {
        for (const g of this.gems) {
          if (g.taken || (g.x - b.x) ** 2 + (g.y - b.y) ** 2 > (R + 18) ** 2) continue;
          g.taken = true;
          this.gemsTaken++;
          MZ.Audio.play('gem');
          this.burst(g.x, g.y, '#3cf2ff', 14);
          if (this.mode === 'endless') { this.run.taken.add(g.key); this.run.gems = (this.run.gems || 0) + 1; this.clock += 3; this.emit('bonus', '+3s'); }
          this.emit('gem');
        }
      }
      if (this.pads && this.padCool <= 0) {
        for (const p of this.pads) {
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > p.r * p.r) continue;
          const along = b.vx * p.dx + b.vy * p.dy;
          const add = Math.max(0, PHYS.boost - Math.max(0, along) * 0.4);
          b.vx += p.dx * add; b.vy += p.dy * add;
          b.boostCap = PHYS.boostMax;
          this.padCool = 0.45;
          MZ.Audio.play('boost');
          this.burst(p.x, p.y, '#ffb300', 10);
          break;
        }
      }
      if (this.beacons) {
        for (const bc of this.beacons) {
          if (bc.lit || (bc.x - b.x) ** 2 + (bc.y - b.y) ** 2 > bc.r * bc.r) continue;
          bc.lit = true;
          this.run.lit.add(bc.key);
          this.run.beaconsLit++;
          this.run.check = { x: bc.x, y: bc.y };
          this.clock += 12;
          MZ.Audio.play('beacon');
          this.burst(bc.x, bc.y, '#50ffa0', 18);
          this.emit('bonus', 'Checkpoint +12s');
        }
      }
      if (this.maze) {
        const g = this.maze.goal;
        if ((g.x - b.x) ** 2 + (g.y - b.y) ** 2 < (g.r * 0.5) ** 2) { this.reachGoal(); return true; }
      }
      return false;
    },

    burst(x, y, color, n) {
      if (S().display.reducedMotion) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 260;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, size: 4 + Math.random() * 5, color });
      }
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 30, color, shape: 'ring' });
    },
    stepParticles(dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
      }
    },

    fall() {
      this.falls++;
      MZ.Save.progress.stats.falls++;
      this.firstTry = false;
      this.setState('fall');
      MZ.Audio.play('fall');
      MZ.Audio.roll(0, false);
    },
    stepFall(dt) {
      const b = this.ball, k = clamp(this.stateT / 0.85, 0, 1);
      b.vx *= Math.exp(-dt * 2.5); b.vy *= Math.exp(-dt * 2.5);
      b.x += b.vx * dt * 0.6; b.y += b.vy * dt * 0.6;
      b.scale = 1 - 0.78 * MZ.smooth(k);
      b.alpha = 1 - k * k;
      b.spin += dt * 9;
      if (k >= 1) this.lose('fall');
    },

    reachGoal() {
      this.setState('goal');
      this.goalFrom = { x: this.ball.x, y: this.ball.y };
      MZ.Audio.play('win');
      MZ.Audio.roll(0, false);
    },
    stepGoal(dt) {
      const b = this.ball, g = this.maze.goal, k = clamp(this.stateT / 0.7, 0, 1), e = MZ.smooth(k);
      b.x = lerp(this.goalFrom.x, g.x, e);
      b.y = lerp(this.goalFrom.y, g.y, e);
      b.scale = 1 - 0.5 * e;
      b.spin += dt * (4 + 10 * e);
      if (k >= 1) this.win();
    },

    async lose(reason) {
      this.setState('fx');
      this.emit('lose', reason);
      MZ.Audio.play('lose');
      MZ.Save.saveProgress();
      await FX.play('lose');
      if (this.state !== 'fx') return; // quit meanwhile
      if (this.mode === 'gauntlet') {
        this.run.lives--;
        if (this.run.lives <= 0) return this.gameOver();
        return this.restartLevel();
      }
      if (this.mode === 'endless') {
        this.run.lives--;
        if (this.run.lives <= 0 || reason === 'time') return this.gameOver();
        return this.respawn();
      }
      this.restartLevel();
    },

    async win() {
      this.setState('fx');
      const st = MZ.Save.progress.stats;
      st.wins++;
      st.gems += this.gemsTaken;
      MZ.Save.saveProgress();
      await FX.play('win');
      if (this.state !== 'fx') return;
      const res = this.results();
      if (this.mode === 'gauntlet') {
        this.run.cleared++;
        if (this.run.cleared > MZ.Save.progress.gauntletBest) { MZ.Save.progress.gauntletBest = this.run.cleared; MZ.Save.saveProgress(); }
        if (this.run.cleared % 5 === 0 && this.run.lives < 5) { this.run.lives++; MZ.toast('Extra life!'); }
        this.emit('unlocks', MZ.Save.newlyUnlocked());
        return this.nextGauntlet();
      }
      this.setState('result');
      this.emit('result', res);
      this.emit('unlocks', MZ.Save.newlyUnlocked());
    },

    // Stars: ★ finish · ★ beat par · ★ every gem.
    results() {
      const m = this.maze, time = this.elapsed;
      const allGems = this.gems.length === 0 || this.gemsTaken >= this.gems.length;
      const stars = 1 + (time <= m.parTime ? 1 : 0) + (allGems ? 1 : 0);
      const res = { mode: this.mode, time, par: m.parTime, gems: this.gemsTaken, gemsTotal: this.gems.length, stars, falls: this.falls, label: this.meta.label, sub: this.meta.sub, best: null, newBest: false };
      const P = MZ.Save.progress;
      if (this.mode === 'journey') {
        const L = this.run.level, rec = P.journey.levels[L] || { stars: 0, best: null, gems: 0 };
        res.newBest = rec.best == null || time < rec.best;
        res.prevStars = rec.stars;
        rec.stars = Math.max(rec.stars, stars);
        rec.best = rec.best == null ? time : Math.min(rec.best, time);
        rec.gems = Math.max(rec.gems || 0, this.gemsTaken);
        P.journey.levels[L] = rec;
        P.journey.unlocked = Math.max(P.journey.unlocked, L + 1);
        res.best = rec.best;
        res.level = L;
      } else if (this.mode === 'daily') {
        const d = this.run.day, prev = P.daily[d];
        res.newBest = prev == null || time < prev;
        if (prev == null) P.dailyDone++;
        P.daily[d] = prev == null ? time : Math.min(prev, time);
        res.best = P.daily[d];
      }
      MZ.Save.saveProgress();
      return res;
    },

    gameOver() {
      const P = MZ.Save.progress;
      let res;
      if (this.mode === 'gauntlet') {
        res = { mode: 'gauntlet', score: this.run.cleared, best: P.gauntletBest, newBest: this.run.cleared >= P.gauntletBest && this.run.cleared > 0 };
      } else {
        const sc = this.endlessScore();
        res = { mode: 'endless', score: sc, best: Math.max(P.endlessBest, sc), newBest: sc > P.endlessBest, gems: this.run.gems || 0, dist: Math.round(this.run.best), beacons: this.run.beaconsLit };
        P.endlessBest = Math.max(P.endlessBest, sc);
      }
      P.stats.runs++;
      MZ.Save.saveProgress();
      this.setState('over');
      this.emit('over', res);
      this.emit('unlocks', MZ.Save.newlyUnlocked());
    },

    // ----- endless -----
    endlessScore() { const r = this.run; return Math.round(r.best * 10) + (r.gems || 0) * 25 + r.beaconsLit * 50; },
    loadChunks(bx, by) {
      const E = Gen.endless, span = E.EC * E.ES;
      const cx = Math.floor(bx / span), cy = Math.floor(by / span);
      if (this.chunkAt && cx === this.chunkAt.x && cy === this.chunkAt.y) return;
      this.chunkAt = { x: cx, y: cy };
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const k = cx + dx + ',' + (cy + dy);
        if (this.chunks.has(k)) continue;
        const data = E.chunk(this.run.seed, cx + dx, cy + dy);
        data.gems.forEach((g, i) => { g.key = k + ':' + i; g.taken = this.run.taken.has(g.key); });
        data.beacons.forEach((b, i) => { b.key = k + ':' + i; b.lit = this.run.lit.has(b.key); });
        this.world.addPart(k, data);
        this.chunks.set(k, { data });
      }
      for (const k of Array.from(this.chunks.keys())) {
        const [x, y] = k.split(',').map(Number);
        if (Math.abs(x - cx) > 3 || Math.abs(y - cy) > 3) { this.world.removePart(k); this.chunks.delete(k); }
      }
      this.gems = []; this.pads = []; this.beacons = [];
      for (const { data } of this.chunks.values()) { this.gems.push(...data.gems); this.pads.push(...data.pads); this.beacons.push(...data.beacons); }
    },
    endlessTick() {
      const b = this.ball, r = this.run;
      this.loadChunks(b.x, b.y);
      r.best = Math.max(r.best, Math.hypot(b.x - r.origin.x, b.y - r.origin.y) / Gen.endless.ES);
      const q = this.world.query(b.x, b.y, this.t);
      if (q.seg && !q.seg.blink && q.depth > R) {
        // Remember the nearest safe junction for respawns.
        let best = null, bd = Infinity;
        const k = this.chunkKey(b.x, b.y), c = this.chunks.get(k);
        if (c) for (const nd of c.data.safeNodes) { const d = (nd.x - b.x) ** 2 + (nd.y - b.y) ** 2; if (d < bd) { bd = d; best = nd; } }
        if (best && bd < 60 * 60) r.safe = { x: best.x, y: best.y };
      }
    },
    chunkKey(x, y) { const span = Gen.endless.EC * Gen.endless.ES; return Math.floor(x / span) + ',' + Math.floor(y / span); },
    respawn() {
      const p = this.run.safe || this.run.check;
      this.firstTry = false;
      this.beginLevel(p, this.clock + 0.0001);
      this.clock = Math.max(this.clock, 5);
    },

    // ----- attract mode behind the title screen -----
    stepAttract(dt) {
      if (!this.attractMaze) {
        const lv = Math.min(MZ.Save.progress.journey.unlocked, 40);
        const m = Gen.generate(Gen.levelParams(Math.max(4, lv)));
        this.attractMaze = m;
        this.attractWorld = MZ.World.fromMaze(m);
        this.attractPts = [];
        for (const i of m.mainPath) this.attractPts.push(m.nodes[i]);
      }
      const pts = this.attractPts, sp = S().display.reducedMotion ? 0.12 : 0.35;
      this.attract = (this.attract + dt * sp) % Math.max(1, pts.length - 1);
      const i = Math.floor(this.attract), f = MZ.smooth(this.attract - i);
      const A = pts[i], B = pts[Math.min(pts.length - 1, i + 1)];
      this.cam.x = lerp(this.cam.x, lerp(A.x, B.x, f), 0.03);
      this.cam.y = lerp(this.cam.y, lerp(A.y, B.y, f), 0.03);
      this.cam.zoom = lerp(this.cam.zoom, this.baseZoom * 0.55, 0.03);
    },

    // ----- drawing -----
    draw(dt) {
      const b = this.ball, s = S(), t = this.t;
      const menu = this.state === 'menu' || this.state === 'boot';
      const rgb = Backdrop.color(t);
      Backdrop.draw(t, this.cam);
      const maze = menu ? this.attractMaze : this.maze;
      const world = menu ? this.attractWorld : this.world;
      const seed = maze ? maze.seed : this.run && this.run.seed ? this.run.seed : 7;
      const showBall = !menu && this.state !== 'boot';
      this.renderer.draw({
        world, cam: this.cam, t, floor: s.display.floor, hue: seed % 360, rgb,
        pads: menu ? maze && maze.pads : this.pads,
        start: maze ? maze.start : this.mode === 'endless' && this.run ? this.run.origin : null,
        goal: maze ? Object.assign({ media: GoalMedia.active && !menu }, maze.goal) : null,
        gems: menu ? maze && maze.gems : this.gems,
        beacons: this.mode === 'endless' && !menu ? this.beacons : null,
        particles: this.particles,
        ball: showBall ? { x: b.x, y: b.y, r: R, shadow: this.state === 'fall' ? Math.max(0, 1 - this.stateT * 4) : 1 } : null,
      });

      // 3D board tilt follows the push on the ball (reads like Monkey Ball's tilting stage).
      const board = MZ.$('#board');
      let tx = 0, ty = 0;
      if (this.state === 'play' && s.controls.tilt3d && !s.display.reducedMotion) {
        const u = this.input.vector();
        tx = u.x; ty = u.y;
        if (s.controls.scheme === 'grab') { tx = clamp(b.vx / 900, -1, 1); ty = clamp(b.vy / 900, -1, 1); }
      }
      const kk = 1 - Math.exp(-dt * 6);
      this.tiltVis.x = lerp(this.tiltVis.x, tx, kk);
      this.tiltVis.y = lerp(this.tiltVis.y, ty, kk);
      const T = 9;
      board.style.transform = Math.abs(this.tiltVis.x) + Math.abs(this.tiltVis.y) > 0.002
        ? 'perspective(1100px) rotateX(' + (-this.tiltVis.y * T).toFixed(2) + 'deg) rotateY(' + (this.tiltVis.x * T).toFixed(2) + 'deg)' : '';

      // Player sprite.
      const pl = MZ.$('#player');
      if (showBall) {
        const cfg = s.player, size = 2 * R * this.cam.zoom * cfg.size;
        const sp = Math.hypot(b.vx, b.vy);
        if (cfg.spin === 'roll') b.spin += (b.vx / R) * dt * (this.state === 'play' ? 1 : 0);
        let rot = b.spin;
        if (cfg.spin === 'lean') rot = clamp(b.vx / PHYS.maxV, -1, 1) * 0.35 + (this.state === 'fall' || this.state === 'goal' ? b.spin : 0);
        if (cfg.spin === 'face') { if (sp > 40) b.face = b.face + wrapAngle(Math.atan2(b.vy, b.vx) - b.face) * Math.min(1, dt * 10); rot = b.face; }
        if (cfg.spin === 'none') rot = this.state === 'fall' || this.state === 'goal' ? b.spin : 0;
        if (cfg.mirror) { if (b.vx < -30) b.mirror = -1; else if (b.vx > 30) b.mirror = 1; } else b.mirror = 1;
        pl.hidden = false;
        pl.style.width = pl.style.height = size.toFixed(1) + 'px';
        pl.style.opacity = b.alpha;
        pl.style.transform = 'translate(-50%,-50%) rotate(' + rot.toFixed(3) + 'rad) scale(' + (b.scale * b.mirror).toFixed(3) + ',' + b.scale.toFixed(3) + ')';
      } else pl.hidden = true;

      // Goal media (inside the tilting board, positioned in world space).
      const gm = MZ.$('#goal-media');
      if (GoalMedia.active && maze && !menu) {
        const p = this.renderer.toScreen(this.cam, maze.goal.x, maze.goal.y), sz = maze.goal.r * 2 * this.cam.zoom * s.goal.size;
        gm.style.transform = 'translate(' + (p.x - sz / 2).toFixed(1) + 'px,' + (p.y - sz / 2).toFixed(1) + 'px)';
        gm.style.width = gm.style.height = sz.toFixed(1) + 'px';
        gm.hidden = false;
      } else gm.hidden = true;

      // Minimap.
      const mm = s.gameplay.minimap;
      const mmEl = MZ.$('#minimap');
      if (!menu && mm !== 'off') {
        mmEl.hidden = false;
        if (this.mode === 'endless') this.minimap.drawRadar(this.world, b, t, this.beacons);
        else this.minimap.draw(mm, b, this.maze && this.maze.goal, this.gems, t);
      } else mmEl.hidden = true;
      this.emit('frame');
    },
  });

  function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  MZ.Game = Game;
})();
