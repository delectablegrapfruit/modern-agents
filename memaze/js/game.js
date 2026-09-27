/* Memaze — the game: modes, level flow, movement, camera, pickups, win/lose media, and the per-frame loop. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { clamp, lerp, hashStr, hashInts, rng } = MZ;
  const Gen = MZ.Gen;
  const R = Gen.BALL_R;

  const KEY_SPEED = 140; // keys and gamepad, world units per second
  const VIEW = 0.24;     // the player's box fills this much of the screen's shorter side
  const BUFFER = 0.035;  // hitbox forgiveness: solid pixels may reach this far (share of the box) over the edge
  const boxWorld = () => 2 * R * clamp(S().player.size, 0.6, 1.25); // the player's square box, in world units

  const S = () => MZ.Save.settings;

  // ---------- full-screen win / lose media ----------
  const FX = {
    playing: null,
    async play(kind) {
      if (this.playing) this.playing.finish();
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
          el.classList.add('out');
          setTimeout(() => {
            if (this.token === token) { MZ.Media.unmount(host); el.hidden = true; el.classList.remove('out'); }
            if (fresh) fresh.revoke();
            resolve();
          }, 180);
          if (this.playing === handle) this.playing = null;
        };
        const started = performance.now();
        const skip = (e) => {
          // Held movement keys (auto-repeat) and the keys you steer with don't skip the animation.
          if (e && e.type === 'keydown' && (e.repeat || MZ.Game.input.keyDir(e.code) || /Shift|Control|Alt|Meta/.test(e.key))) return;
          if (performance.now() - started > 250) { if (e && e.preventDefault) e.preventDefault(); finish(); }
        };
        const token = (this.token = {});
        const handle = (this.playing = { finish });
        el.classList.remove('out');
        el.addEventListener('pointerdown', skip);
        window.addEventListener('keydown', skip);
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

  // ---------- the player sprite (a DOM element pinned to the screen centre) ----------
  // What a slot shows. 'random' re-rolls only when forced (a new level), or when the file it rolled is gone.
  function choose(holder, slot, sel, force) {
    if (sel === 'random' && !force && holder.item && MZ.Media.get(holder.item.id)) return MZ.Media.get(holder.item.id);
    return MZ.Media.resolve(slot, sel);
  }
  // Same file, same URL (a file replaced on disk gets a new one), same keying: nothing to remount.
  const keyOf = (item, chroma) => (item && item.kind !== 'builtin' ? item.id + '|' + item.url + '|' + JSON.stringify(chroma) : null);

  const Player = {
    item: null, key: null,
    apply(force) {
      const cfg = S().player;
      const item = choose(this, 'player', cfg.media, force);
      const key = keyOf(item, cfg.chroma);
      if (!force && key === this.key) return;
      this.item = item;
      this.key = key;
      if (Game.sprite) Game.sprite.load(item, { chroma: cfg.chroma });
    },
  };
  const GoalMedia = {
    item: null, itemId: null,
    apply(force) {
      const cfg = S().goal;
      const host = MZ.$('#goal-media');
      const item = cfg.media === 'default:portal' ? null : choose(this, 'goal', cfg.media, force);
      const id = keyOf(item, cfg.chroma);
      if (id === this.itemId && !(force && cfg.media === 'random')) return;
      this.item = item;
      this.itemId = id;
      if (!id) { MZ.Media.unmount(host); host.hidden = true; return; }
      host.hidden = false;
      MZ.Media.mount(host, item, { muted: true, loop: true, chroma: cfg.chroma });
    },
    get active() { return !!this.itemId; },
  };
  const Backdrop = {
    renderer: null, item: null, itemId: null,
    init() { if (MZ.Background) this.renderer = MZ.Background.create(MZ.$('#bg')); },
    apply(force) {
      const b = S().background;
      let pattern = b.pattern;
      if (!MZ.Save.isUnlocked(pattern)) pattern = 'rgb';
      if (this.renderer) this.renderer.setConfig(S().rgb, pattern, { motion: S().display.reducedMotion ? 0.25 : 1, parallax: b.parallax });
      const host = MZ.$('#bg-media');
      const item = b.kind === 'media' ? choose(this, 'background', b.media, force) : null;
      const id = keyOf(item, b.chroma);
      this.item = item;
      if (force && b.media === 'random') this.itemId = null;
      host.dataset.fit = b.fit === 'tile' && item && item.kind !== 'image' ? 'cover' : b.fit; // a video can't tile: fill instead
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
    maze: null, world: null, gems: [], beacons: [],
    ball: { x: 0, y: 0 },
    cam: { x: 0, y: 0, zoom: 1 }, userZoom: 1,
    t: 0, playT: 0, clock: 0, elapsed: 0, restarts: 0, gemsTaken: 0, stateT: 0, lastTick: -1, attract: 0,
    FX, Player, Backdrop, GoalMedia,

    init() {
      this.renderer = new MZ.Renderer(MZ.$('#maze'));
      this.minimap = new MZ.Minimap(MZ.$('#minimap'));
      this.input = new MZ.Input(MZ.$('#stage'));
      this.sprite = new MZ.Sprite(MZ.$('#player-canvas'));
      this.input.onZoom = (k) => { this.userZoom = clamp(this.userZoom * k, 0.45, 2.2); };
      Backdrop.init();
      this.applySettings();
      window.addEventListener('resize', () => this.resize());
      this.resize();
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
      let last = performance.now(), fpsN = 0, fpsT = 0;
      const loop = (now) => {
        const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.25, raw); // real time: the clock keeps pace with a 1:1 drag at low fps
        last = now;
        fpsN++; fpsT += raw;
        if (fpsT > 0.5) { this.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
        try { this.frame(dt); } catch (e) { console.error(e); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    applySettings() {
      const s = S();
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
      this.renderer.resize(w, h, dpr);
      Backdrop.resize(w, h, dpr);
      this.minimap.size();
      if (this.maze) this.minimap.setMaze(this.maze), this.revealAll();
      this.baseZoom = (VIEW * Math.min(w, h)) / boxWorld();
      this.menuZoom = clamp(Math.min(w, h) / 820, 0.58, 1.25) * 0.55;
    },
    // The world rectangle the screen shows right now: the map uncovers exactly what has been in it.
    viewRect() {
      const z = this.cam.zoom || 1, hw = innerWidth / 2 / z, hh = innerHeight / 2 / z;
      return { x0: this.cam.x - hw, y0: this.cam.y - hh, x1: this.cam.x + hw, y1: this.cam.y + hh };
    },
    revealAll() { if (this.trail) for (const r of this.trail) this.minimap.reveal(r); },
    // Remember what the screen shows (for the map), and mark gems, beacons and the goal once they have been on it.
    look() {
      const v = this.viewRect(), inside = (o, r) => o.x + r > v.x0 && o.x - r < v.x1 && o.y + r > v.y0 && o.y - r < v.y1;
      if (this.gems) for (const g of this.gems) if (!g.seen && inside(g, 15)) { g.seen = true; if (g.key && this.run.seenKeys) this.run.seenKeys.add(g.key); }
      if (this.beacons) for (const bc of this.beacons) if (!bc.seen && inside(bc, bc.r)) { bc.seen = true; this.run.seenKeys.add(bc.key); }
      if (this.maze && !this.maze.goal.seen && inside(this.maze.goal, this.maze.goal.r)) this.maze.goal.seen = true;
      const last = this.trail[this.trail.length - 1];
      const moved = !last || Math.abs(v.x0 - last.x0) + Math.abs(v.y0 - last.y0) + Math.abs(v.x1 - last.x1) + Math.abs(v.y1 - last.y1) > 12;
      if (this.maze) this.minimap.reveal(v);
      if (moved) {
        this.trail.push(v);
        if (this.mode === 'endless') {
          const k = this.seenKey(v.x0 + (v.x1 - v.x0) / 2, v.y0 + (v.y1 - v.y0) / 2);
          if (!this.seenBuckets.has(k)) this.seenBuckets.set(k, []);
          this.seenBuckets.get(k).push(v);
          if (this.trail.length > 400) this.trail.shift(); // endless keeps its history in the buckets
        } else if (this.trail.length > 20000) this.trail.splice(0, 5000);
      }
      return v;
    },
    seenKey(x, y) { return Math.floor(x / 600) + ',' + Math.floor(y / 600); },
    // Endless: the remembered screen rectangles near a point.
    seenNear(x, y, R) {
      const out = [];
      for (let i = Math.floor((x - R - 300) / 600); i <= Math.floor((x + R + 300) / 600); i++) {
        for (let j = Math.floor((y - R - 300) / 600); j <= Math.floor((y + R + 300) / 600); j++) {
          const list = this.seenBuckets.get(i + ',' + j);
          if (list) out.push(...list);
        }
      }
      return out;
    },
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
      this.run = { seed: (Math.random() * 1e9) | 0, cleared: 0, lives: 3, prevBest: MZ.Save.progress.gauntletBest };
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
      this.run = { seed, seedText, lives: 3, taken: new Set(), lit: new Set(), seenKeys: new Set(), best: 0, gems: 0, beaconsLit: 0, check: null };
      this.trail = [];
      this.seenBuckets = new Map();
      this.maze = null;
      this.world = new MZ.World();
      this.chunks = new Map();
      this.chunkAt = null;
      this.loadChunks(0, 0);
      const c0 = this.chunks.get('0,0').data;
      this.run.check = { x: c0.start.x, y: c0.start.y };
      this.run.origin = { x: c0.start.x, y: c0.start.y, r: c0.discs[0].r };
      this.meta = { label: 'Endless' };
      this.minimap.maze = null;
      this.beginLevel(c0.start, 75, true);
    },

    loadMaze(params, meta) {
      const m = Gen.generate(params);
      this.maze = m;
      this.world = MZ.World.fromMaze(m);
      this.gems = m.gems.map((g) => Object.assign({ taken: false }, g));
      this.beacons = null;
      this.meta = meta;
      this.minimap.setMaze(m);
      this.trail = [];
      this.restarts = 0;
      this.beginLevel(m.start, m.timeLimit, true);
      this.emit('level');
    },

    // Straight into play: the player appears on the start marker and the clock runs. 'random' media re-rolls only on a new maze.
    beginLevel(start, timeLimit, fresh) {
      Player.apply(fresh && S().player.media === 'random');
      GoalMedia.apply(fresh && S().goal.media === 'random');
      if (fresh && S().background.media === 'random' && S().background.kind === 'media') Backdrop.apply(true);
      this.ball.x = start.x; this.ball.y = start.y;
      this.clock = timeLimit;
      this.elapsed = 0;
      this.playT = 0; // vanishing bridges run on this clock: it only moves during play, from 0 on every (re)start
      this.gemsTaken = this.gems ? this.gems.filter((g) => g.taken).length : 0;
      this.lastTick = -1;
      this.cam.x = start.x; this.cam.y = start.y;
      this.cam.zoom = this.zoomTarget();
      this.setState('play');
      MZ.Audio.Music.ensure();
      this.emit('begin');
    },

    restartLevel() {
      if (this.mode === 'endless') return;
      this.restarts = this.state === 'result' ? 0 : this.restarts + 1; // Retry after a clear is a fresh attempt
      this.gems.forEach((g) => (g.taken = false));
      this.beginLevel(this.maze.start, this.maze.timeLimit);
    },

    setState(st) {
      this.state = st;
      this.stateT = 0;
      this.input.enabled = st === 'play';
      if (st !== 'play') this.input.release();
      this.input.takeGrab(); // drop finger travel from before (the maze would jump)
      document.body.dataset.state = st;
      this.emit('state', st);
    },

    pause() {
      if (this.state !== 'play') return;
      this.setState('paused');
    },
    resume() {
      if (this.state !== 'paused') return;
      this.setState('play');
    },
    quit() {
      FX.skip();
      if (this.mode === 'endless' && this.run) {
        const P = MZ.Save.progress;
        P.endlessBest = Math.max(P.endlessBest, this.endlessScore());
        MZ.Save.saveProgress();
      }
      this.mode = null;
      this.maze = null;
      this.world = null;
      this.setState('menu');
      this.emit('quit');
    },

    // ----- per frame -----
    frame(dt) {
      const st = this.state;
      this.t += dt;
      this.stateT += dt;
      if (st === 'play') {
        this.cam.zoom = this.zoomTarget(); // zoom follows the pinch/wheel exactly, no easing
        this.sprite.update(performance.now()); // this frame's picture is this frame's hitbox
        this.step(dt);
      } else if (st === 'menu') this.stepAttract(dt);
      if (st !== 'menu' && st !== 'boot') { this.cam.x = this.ball.x; this.cam.y = this.ball.y; }
      this.draw();
    },

    // The maze follows the finger 1:1 (the player stays put on screen); keys and gamepad move at a steady speed.
    step(dt) {
      const b = this.ball, inp = this.input, cfg = S().controls;
      this.playT += dt;
      if (S().gameplay.timer || this.mode === 'endless') {
        this.clock -= dt;
        const sec = Math.ceil(this.clock);
        if (this.clock < 10 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; MZ.Audio.play('tick'); this.emit('tick', sec); }
        if (this.clock <= 0) { this.clock = 0; this.lose('time'); return; }
      }
      this.elapsed += dt;

      const d = inp.takeGrab(), u = inp.vector();
      const sg = cfg.invert ? 1 : -1, k = clamp(cfg.speed || 1, 0.5, 2) / this.cam.zoom;
      const mx = d.x * sg * k + u.x * KEY_SPEED * dt, my = d.y * sg * k + u.y * KEY_SPEED * dt;
      const walls = S().gameplay.rule === 'casual';
      // Standing still can still end badly: a bridge vanishing underneath, or an animation frame reaching over the edge.
      if (this.hitAt(b.x, b.y) && !(walls && this.unstick())) { this.lose('fall'); return; }
      // Move in slices far shorter than the hitbox buffer, so the first touch is found and no gap is ever skipped.
      const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / (boxWorld() * BUFFER * 0.5)));
      const sx = mx / n, sy = my / n;
      for (let i = 0; i < n; i++) {
        if (!this.hitAt(b.x + sx, b.y + sy)) { b.x += sx; b.y += sy; }
        else if (!walls) { b.x += sx; b.y += sy; this.lose('fall'); return; }
        else if (sx && !this.hitAt(b.x + sx, b.y)) b.x += sx; // Walls: slide along the edge...
        else if (sy && !this.hitAt(b.x, b.y + sy)) b.y += sy;
        else { // ...or stop right at it
          let lo = 0, hi = 1;
          for (let j = 0; j < 6; j++) { const f = (lo + hi) / 2; if (this.hitAt(b.x + sx * f, b.y + sy * f)) hi = f; else lo = f; }
          b.x += sx * lo; b.y += sy * lo;
          break;
        }
        if (this.pickups()) return;
      }
      if (this.mode === 'endless') this.endlessTick();
    },

    // Does the player's picture, placed at (x, y), touch the void? Every solid pixel of the current frame is tested
    // (outline, plus a grid inside), each allowed the small buffer over the edge. Before the picture has loaded, the
    // box's inscribed circle stands in.
    hitAt(x, y) {
      const m = this.sprite.mask, W = boxWorld(), buf = W * BUFFER, t = this.playT, w = this.world;
      const q = w.query(x, y, t);
      if (!m) return q.depth < W * 0.45 - buf;
      if (q.depth >= m.maxR * W) return false; // the whole box fits inside the corridor
      if (!m.n) return false;
      const p = m.pts;
      for (let i = 0; i < p.length; i += 2) if (w.query(x + p[i] * W, y + p[i + 1] * W, t).depth < -buf) return true;
      return false;
    },
    // Walls: something pushed the picture over the edge while standing still (a new animation frame): step clear if a
    // free spot is close by.
    unstick() {
      const b = this.ball, W = boxWorld();
      for (let r = W * 0.02; r <= W * 0.2; r += W * 0.02) {
        for (let a = 0; a < 16; a++) {
          const x = b.x + Math.cos(a * Math.PI / 8) * r, y = b.y + Math.sin(a * Math.PI / 8) * r;
          if (!this.hitAt(x, y)) { b.x = x; b.y = y; return true; }
        }
      }
      return false;
    },
    // Does the picture overlap a circle (a gem, a beacon, the goal)?
    touches(cx, cy, r) {
      const b = this.ball, m = this.sprite.mask, W = boxWorld();
      const d2 = (cx - b.x) ** 2 + (cy - b.y) ** 2;
      if (!m) return d2 < (r + W * 0.45) ** 2;
      if (d2 > (r + m.maxR * W) ** 2) return false;
      const p = m.pts, r2 = r * r;
      for (let i = 0; i < p.length; i += 2) if ((b.x + p[i] * W - cx) ** 2 + (b.y + p[i + 1] * W - cy) ** 2 <= r2) return true;
      return false;
    },

    pickups() {
      if (this.gems) {
        for (const g of this.gems) {
          if (g.taken || !this.touches(g.x, g.y, 15)) continue;
          g.taken = true;
          this.gemsTaken++;
          MZ.Audio.play('gem');
          if (this.mode === 'endless') { this.run.taken.add(g.key); this.run.gems = (this.run.gems || 0) + 1; this.clock += 3; this.emit('bonus', '+3s'); }
          this.emit('gem');
        }
      }
      if (this.beacons) {
        for (const bc of this.beacons) {
          if (bc.lit || !this.touches(bc.x, bc.y, bc.r * 0.8)) continue;
          bc.lit = true;
          this.run.lit.add(bc.key);
          this.run.beaconsLit++;
          this.run.check = this.run.safe = { x: bc.x, y: bc.y }; // the next respawn point, until a later junction
          this.clock += 12;
          MZ.Audio.play('beacon');
          this.emit('bonus', '+12s');
        }
      }
      if (this.maze) {
        const g = this.maze.goal, gr = g.r * (GoalMedia.active ? clamp(S().goal.size, 0.66, 1) : 0.66); // the drawn GOAL circle (or goal media)
        if (this.touches(g.x, g.y, gr)) { this.win(); return true; }
      }
      return false;
    },

    async lose(reason) {
      if (reason === 'fall') MZ.Save.progress.stats.falls++;
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
      MZ.Audio.play('win');
      const st = MZ.Save.progress.stats;
      st.wins++;
      st.gems += this.gemsTaken;
      const res = this.results(); // saved before the win media, so closing the tab during it keeps the clear
      await FX.play('win');
      if (this.state !== 'fx') return;
      if (this.mode === 'gauntlet') {
        this.run.cleared++;
        if (this.run.cleared > MZ.Save.progress.gauntletBest) { MZ.Save.progress.gauntletBest = this.run.cleared; MZ.Save.saveProgress(); }
        if (this.run.cleared % 5 === 0 && this.run.lives < 5) { this.run.lives++; MZ.toast('Extra life'); }
        this.emit('unlocks', MZ.Save.newlyUnlocked());
        return this.nextGauntlet();
      }
      this.setState('result');
      this.emit('result', res);
      this.emit('unlocks', MZ.Save.newlyUnlocked());
    },

    // Stars: one for finishing, one for beating par, one for every gem.
    results() {
      const m = this.maze, time = Math.round(this.elapsed * 100) / 100; // the time shown: par and best compare what the player sees
      const allGems = this.gems.length === 0 || this.gemsTaken >= this.gems.length;
      const stars = 1 + (time <= m.parTime ? 1 : 0) + (allGems ? 1 : 0);
      const res = { mode: this.mode, time, par: m.parTime, gems: this.gemsTaken, gemsTotal: this.gems.length, stars, restarts: this.restarts, best: null, newBest: false };
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
        res = { mode: 'gauntlet', score: this.run.cleared, best: P.gauntletBest, newBest: this.run.cleared > this.run.prevBest };
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
      // Enough chunks around the player to fill the screen at the current zoom (plus a lattice step), at least two.
      const half = Math.max(innerWidth, innerHeight) / 2 / Math.min(this.cam.zoom, this.zoomTarget());
      const ring = Math.max(2, Math.ceil((half + E.ES) / span));
      if (this.chunkAt && cx === this.chunkAt.x && cy === this.chunkAt.y && ring === this.chunkAt.r) return;
      this.chunkAt = { x: cx, y: cy, r: ring };
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        const k = cx + dx + ',' + (cy + dy);
        if (this.chunks.has(k)) continue;
        const data = E.chunk(this.run.seed, cx + dx, cy + dy);
        data.gems.forEach((g, i) => { g.key = k + ':g' + i; g.taken = this.run.taken.has(g.key); g.seen = this.run.seenKeys.has(g.key); });
        data.beacons.forEach((b, i) => { b.key = k + ':b' + i; b.lit = this.run.lit.has(b.key); b.seen = this.run.seenKeys.has(b.key); });
        this.world.addPart(k, data);
        this.chunks.set(k, { data });
      }
      for (const k of Array.from(this.chunks.keys())) {
        const [x, y] = k.split(',').map(Number);
        if (Math.abs(x - cx) > ring + 1 || Math.abs(y - cy) > ring + 1) { this.world.removePart(k); this.chunks.delete(k); }
      }
      this.gems = []; this.beacons = [];
      for (const { data } of this.chunks.values()) { this.gems.push(...data.gems); this.beacons.push(...data.beacons); }
    },
    endlessTick() {
      const b = this.ball, r = this.run;
      this.loadChunks(b.x, b.y);
      r.best = Math.max(r.best, Math.hypot(b.x - r.origin.x, b.y - r.origin.y) / Gen.endless.ES);
      const q = this.world.query(b.x, b.y, this.playT);
      if (q.seg && !q.seg.blink && !this.hitAt(b.x, b.y)) {
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
      this.beginLevel(p, this.clock + 0.0001);
      this.clock = Math.max(this.clock, 5);
    },

    // ----- attract mode behind the title screen: a slow pan along a maze -----
    stepAttract(dt) {
      if (!this.attractMaze) {
        const lv = Math.min(MZ.Save.progress.journey.unlocked, 40);
        const m = Gen.generate(Gen.levelParams(Math.max(4, lv)));
        this.attractMaze = m;
        this.attractWorld = MZ.World.fromMaze(m);
        this.attractPts = [];
        for (const i of m.mainPath) this.attractPts.push(m.nodes[i]);
      }
      const pts = this.attractPts, sp = S().display.reducedMotion ? 0 : 0.15;
      this.attract = (this.attract + dt * sp) % Math.max(1, pts.length - 1);
      const i = Math.floor(this.attract), f = this.attract - i;
      // Snaps into place on the first frames of the menu, then glides.
      const A = pts[i], B = pts[Math.min(pts.length - 1, i + 1)], k = this.stateT < 0.1 ? 1 : 1 - Math.exp(-dt * 1.5);
      this.cam.x = lerp(this.cam.x, lerp(A.x, B.x, f), k);
      this.cam.y = lerp(this.cam.y, lerp(A.y, B.y, f), k);
      this.cam.zoom = lerp(this.cam.zoom, this.menuZoom, k);
    },

    // ----- drawing -----
    draw() {
      const b = this.ball, s = S(), t = this.t;
      const menu = this.state === 'menu' || this.state === 'boot', pt = menu ? t : this.playT; // bridges stop while not playing
      const rgb = Backdrop.color(t);
      Backdrop.draw(t, this.cam);
      const maze = menu ? this.attractMaze : this.maze;
      const world = menu ? this.attractWorld : this.world;
      const seed = maze ? maze.seed : this.run && this.run.seed ? this.run.seed : 7;
      const showPlayer = !menu;
      this.renderer.draw({
        world, cam: this.cam, t: pt, floor: s.display.floor, hue: seed % 360, rgb,
        start: maze ? maze.start : this.mode === 'endless' && this.run ? this.run.origin : null,
        goal: maze ? Object.assign({ media: GoalMedia.active && !menu }, maze.goal) : null,
        gems: menu ? maze && maze.gems : this.gems,
        beacons: this.mode === 'endless' && !menu ? this.beacons : null,
      });

      // Player sprite: the user's media, upright and still at the centre of the screen.
      const pl = MZ.$('#player');
      if (showPlayer) {
        const css = boxWorld() * this.cam.zoom, size = css.toFixed(1) + 'px';
        this.sprite.update(performance.now(), false, css, Math.min(window.devicePixelRatio || 1, s.display.quality));
        pl.hidden = false;
        pl.style.width = pl.style.height = size;
        pl.style.transform = 'translate(-50%,-50%)';
      } else pl.hidden = true;

      // Goal media, positioned in world space.
      const gm = MZ.$('#goal-media');
      if (GoalMedia.active && maze && !menu) {
        const p = this.renderer.toScreen(this.cam, maze.goal.x, maze.goal.y), sz = maze.goal.r * 2 * this.cam.zoom * s.goal.size;
        gm.style.transform = 'translate(' + (p.x - sz / 2).toFixed(1) + 'px,' + (p.y - sz / 2).toFixed(1) + 'px)';
        gm.style.width = gm.style.height = sz.toFixed(1) + 'px';
        gm.hidden = false;
      } else gm.hidden = true;

      // Minimap: fogged, uncovered by what the screen shows (tracked even while the map is hidden).
      const view = menu || !this.world ? null : this.look();
      const mm = s.gameplay.minimap;
      const mmEl = MZ.$('#minimap');
      if (!menu && view && mm !== 'off') {
        mmEl.hidden = false;
        if (this.minimap.dirty) {
          // Sized once it's actually on screen (it's hidden while a level is built).
          this.minimap.dirty = false;
          if (this.minimap.size() && this.maze) { this.minimap.setMaze(this.maze); this.revealAll(); }
        }
        if (this.mode === 'endless') this.minimap.drawRadar(this.world, b, this.beacons, view, this.seenNear(b.x, b.y, 1000).concat([view]));
        else this.minimap.draw(b, this.maze && this.maze.goal, this.gems, view);
      } else mmEl.hidden = true;
      this.emit('frame');
    },
  });

  MZ.Game = Game;
})();
