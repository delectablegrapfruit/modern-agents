/* Memaze — the game: modes, level flow, movement, camera, pickups, win/lose media, and the per-frame loop. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { clamp, lerp, hashStr, hashInts, rng } = MZ;
  const Gen = MZ.Gen;
  const R = Gen.BALL_R;

  const KEY_SPEED = 140; // keys and gamepad, world units per second
  const VIEW = 0.12;     // the player's box fills this much of the screen's shorter side (the widest view: zoom only goes in)
  const MAX_ZOOM = 4;    // how far pinch, wheel and +/- zoom in
  const BUFFER = 0.035;  // hitbox forgiveness: solid pixels may reach this far (share of the box) over the edge
  const boxWorld = () => 2 * R * clamp(S().player.size, 0.6, 1.25); // the player's square box, in world units

  // Health, like the shields in Bungie's Halo: two hits. A touch of the edge costs one (Extra hits go first) and leaves
  // your picture faded; a second touch before it has recharged loses. No rapid hits: after one, the edges hold like
  // walls for a moment, and until you've been clear of the edge for a beat, so holding against it never counts twice.
  // Once you've been off the edge long enough, the shield recharges: the picture fills back in with the rising sound.
  const HEARTS = 2, MAX_BONUS = 2;
  const REGEN = 5;    // seconds clear of the edge until you're healed
  const RECHARGE = 1; // ...the last of which is the recharge
  const GUARD = 0.75; // seconds the edges hold after a hit (and after a Bullet or Launch lands)
  const CLEAR = 0.25; // after a hit, seconds off the edge before it can hurt again
  // Mystery boxes and items.
  const BOX_R = 16, BOX_BACK = 25, ROLL = 1.1; // touch radius; seconds until a shattered box is back; roulette length
  const SHATTER = 0.7;                         // seconds a shattered box's pieces fly
  const ITEMS = {
    star: { name: 'Invincible', w: 18, dur: 8 },
    heart: { name: 'Extra hit', w: 16 },
    bullet: { name: 'Bullet', w: 12 },
    launch: { name: 'Launch', w: 12 },
    carpet: { name: 'Magic carpet', w: 18, dur: 6 },
    shrink: { name: 'Shrink', w: 16, dur: 10 },
  };
  const BULLET_V = 520, BULLET_RUN = 1800; // Bullet: speed and how far it carries you (it finishes on a junction)
  const APEX_VIEW = 2000;                  // Launch: world units across the screen's shorter side at the top
  const UP = 0.45, AIR = 1.4, DOWN = 0.55; // Launch: seconds going up, at the top, coming down (you steer throughout)
  const HITSTOP = 0.07, SHAKE = 0.32;      // a hit: the game freezes this long, then the view shakes this long
  const SHRINK = 0.5;
  const smooth = (k) => k * k * (3 - 2 * k);
  const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return l; };

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
    checkpoints: [], cpIdx: -1, boxes: [],
    hp: HEARTS, bonus: 0, hurtT: REGEN, guardT: 0, stuck: false, clearT: 0, touched: false, runT: 0, scale: 1, item: null, roll: null, fx: {}, lastSafe: null,
    FX, Player, Backdrop, GoalMedia, ITEMS, HEARTS, MAX_BONUS, REGEN,

    init() {
      this.renderer = new MZ.Renderer(MZ.$('#maze'));
      this.minimap = new MZ.Minimap(MZ.$('#minimap'));
      this.input = new MZ.Input(MZ.$('#stage'));
      this.sprite = new MZ.Sprite(MZ.$('#player-canvas'));
      this.input.onZoom = (k) => this.zoomBy(k);
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
      document.documentElement.classList.toggle('reduce-flash', s.display.reduceFlash);
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
      const keep = (o) => { if (o.key && this.run && this.run.seenKeys) this.run.seenKeys.add(o.key); };
      if (this.gems) for (const g of this.gems) if (!g.seen && inside(g, 15)) { g.seen = true; keep(g); }
      if (this.beacons) for (const bc of this.beacons) if (!bc.seen && inside(bc, bc.r)) { bc.seen = true; keep(bc); }
      if (this.boxes) for (const bx of this.boxes) if (!bx.seen && inside(bx, BOX_R)) { bx.seen = true; keep(bx); }
      if (this.maze) for (const c of this.checkpoints) if (!c.seen && inside(c, c.r)) c.seen = true;
      if (this.maze && !this.maze.goal.seen && inside(this.maze.goal, this.maze.goal.r)) this.maze.goal.seen = true;
      const last = this.trail[this.trail.length - 1];
      const moved = !last || Math.abs(v.x0 - last.x0) + Math.abs(v.y0 - last.y0) + Math.abs(v.x1 - last.x1) + Math.abs(v.y1 - last.y1) > 12;
      if (this.maze) this.minimap.reveal(v);
      if (moved) {
        this.trail.push(v);
        if (this.mode === 'endless') {
          // Filed under every bucket it covers (a Launch sees far more than one), so the radar finds it from anywhere inside.
          const i0 = Math.floor(v.x0 / 600), i1 = Math.floor(v.x1 / 600), j0 = Math.floor(v.y0 / 600), j1 = Math.floor(v.y1 / 600);
          const one = (i1 - i0 + 1) * (j1 - j0 + 1) <= 4;
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            if (one && (i !== Math.floor((v.x0 + v.x1) / 1200) || j !== Math.floor((v.y0 + v.y1) / 1200))) continue;
            const k = i + ',' + j;
            if (!this.seenBuckets.has(k)) this.seenBuckets.set(k, []);
            this.seenBuckets.get(k).push(v);
          }
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
    timed() { return this.mode === 'endless' || (S().gameplay.timer && this.mode !== 'trial'); }, // a clock counting down
    zoomTarget() { return this.baseZoom * S().gameplay.zoom * this.userZoom; },
    zoomBy(k) { this.userZoom = clamp(this.userZoom * k, 1, MAX_ZOOM); }, // never wider than the default view

    // ----- starting things -----
    startJourney(level) {
      this.mode = 'journey';
      this.run = { level };
      const p = Gen.levelParams(level);
      this.loadMaze(p, { label: 'Level ' + level, level });
    },
    // Time Trial: any level reached so far, no mystery boxes, no time limit; your best run races you as a ghost.
    startTrial(level) {
      this.mode = 'trial';
      this.run = { level };
      this.loadMaze(Gen.levelParams(level), { label: 'Time Trial · Level ' + level, level });
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
      this.run = { seed, seedText, lives: 3, taken: new Set(), lit: new Set(), seenKeys: new Set(), boxTaken: new Map(), best: 0, gems: 0, beaconsLit: 0, check: null };
      this.checkpoints = [];
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
      // Flags stand on their own round platforms; boxes sit on junctions and dead ends.
      this.checkpoints = Gen.checkpoints(m);
      this.cpIdx = -1;
      if (this.checkpoints.length) this.world.addPart('checkpoints', { discs: this.checkpoints.map((c) => ({ x: c.x, y: c.y, r: c.r })) });
      this.boxes = Gen.boxes(m, this.checkpoints).map((b) => ({ x: b.x, y: b.y, takenAt: null, seen: false }));
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
      this.resetPower();
      this.cam.zoom = this.zoomTarget();
      this.setState('play');
      MZ.Audio.Music.ensure();
      this.emit('begin');
    },

    restartLevel() {
      if (this.mode === 'endless') return;
      this.restarts = this.state === 'result' ? 0 : this.restarts + 1; // Retry after a clear is a fresh attempt
      this.gems.forEach((g) => (g.taken = false));
      this.cpIdx = -1;
      for (const c of this.checkpoints) c.lit = false;
      for (const b of this.boxes) b.takenAt = null;
      this.beginLevel(this.maze.start, this.maze.timeLimit);
    },

    // Back on the last flag: the clock, the time taken, collected gems and the bridges all carry on.
    respawnAtCheckpoint() {
      const c = this.checkpoints[this.cpIdx];
      this.restarts++;
      this.ball.x = c.x; this.ball.y = c.y;
      this.cam.x = c.x; this.cam.y = c.y;
      this.resetPower();
      this.cam.zoom = this.zoomTarget();
      this.lastTick = -1;
      this.setState('play');
      MZ.Audio.Music.ensure();
      this.emit('begin');
      this.emit('bonus', 'Back to checkpoint');
    },

    // Full hearts, empty item slot, no effects running.
    resetPower() {
      this.hp = HEARTS; this.bonus = 0; this.hurtT = REGEN; this.guardT = 0; this.stuck = false; this.clearT = 0;
      this.stopT = 0; this.shakeT = 0; this.hitAtT = null; this.beepT = 0;
      this.item = null; this.roll = null; this.fx = {}; this.scale = 1;
      this.lastSafe = { x: this.ball.x, y: this.ball.y };
      this.emit('power');
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
        this.cam.zoom = this.zoomTarget() * this.liftZoom(); // zoom follows the pinch/wheel exactly, no easing
        this.sprite.update(performance.now()); // this frame's picture is this frame's hitbox
        if (this.stopT > 0) { this.stopT -= dt; this.input.takeGrab(); } // the hit-stop: finger travel meanwhile is dropped
        else this.step(dt);
      } else if (st === 'menu') this.stepAttract(dt);
      if (st !== 'menu' && st !== 'boot') {
        // The view shakes after a hit (the picture stays put at the centre; the maze jolts around it).
        let sx = 0, sy = 0;
        if (this.shakeT > 0) {
          this.shakeT -= dt;
          if (!S().display.reducedMotion && st === 'play') {
            const a = (8 * (Math.max(0, this.shakeT) / SHAKE) ** 2) / this.cam.zoom;
            sx = Math.sin(this.t * 97) * a; sy = Math.cos(this.t * 71) * a;
          }
        }
        this.cam.x = this.ball.x + sx; this.cam.y = this.ball.y + sy;
      }
      this.draw();
    },

    // The maze follows the finger 1:1 (the player stays put on screen); keys and gamepad move at a steady speed.
    step(dt) {
      const b = this.ball, inp = this.input, cfg = S().controls, fx = this.fx;
      this.playT += dt;
      this.runT += dt;
      if (this.timed()) {
        this.clock -= dt;
        const sec = Math.ceil(this.clock);
        if (this.clock < 10 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; MZ.Audio.play('tick'); this.emit('tick', sec); }
        if (this.clock <= 0) { this.clock = 0; this.lose('time'); return; }
      }
      this.elapsed += dt;
      this.tickPower(dt);
      if (fx.bullet || fx.launch) { this.touched = false; this.offEdge(dt); this.fly(dt); if (this.state === 'play' && this.mode === 'endless') this.endlessTick(); return; }

      const d = inp.takeGrab(), u = inp.vector();
      const sg = cfg.invert ? 1 : -1, k = clamp(cfg.speed || 1, 0.5, 2) / this.cam.zoom;
      const mx = d.x * sg * k + u.x * KEY_SPEED * dt, my = d.y * sg * k + u.y * KEY_SPEED * dt;
      const free = fx.carpet > 0; // the magic carpet floats over the void
      const soft = S().gameplay.rule === 'casual' || this.shielded(); // edges hold like walls
      this.touched = false;
      // Standing still can still go wrong: a bridge vanishing underneath, an animation frame reaching over the edge, the
      // carpet running out over the void. That costs a heart (unless shielded), then you're put on the nearest floor.
      if (!free && this.hitAt(b.x, b.y)) {
        this.touched = true;
        if (!(soft && this.unstick())) {
          if (!this.shielded() && this.hurt()) return;
          if (this.hitAt(b.x, b.y) && !this.unstick()) this.rescue();
        }
      }
      // Move in slices far shorter than the hitbox buffer, so the first touch is found and no gap is ever skipped.
      const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / (this.box() * BUFFER * 0.5)));
      const sx = mx / n, sy = my / n;
      for (let i = 0; i < n; i++) {
        if (free || !this.hitAt(b.x + sx, b.y + sy)) { b.x += sx; b.y += sy; }
        else {
          this.touched = true;
          if (!soft) { this.toEdge(sx, sy); if (this.hurt()) return; break; } // a hit: stop right at the edge
          if (sx && !this.hitAt(b.x + sx, b.y)) b.x += sx; // Walls: slide along the edge...
          else if (sy && !this.hitAt(b.x, b.y + sy)) b.y += sy;
          else { this.toEdge(sx, sy); break; } // ...or stop right at it
        }
        if (this.pickups()) return;
      }
      this.offEdge(dt);
      this.noteSafe();
      if (this.mode === 'endless') this.endlessTick();
    },
    // After a hit, the edge can hurt again only once you've been clear of it for a beat.
    offEdge(dt) {
      if (this.touched) { this.clearT = 0; return; }
      this.clearT += dt;
      if (this.stuck && this.clearT >= CLEAR) this.stuck = false;
    },
    toEdge(sx, sy) {
      const b = this.ball;
      let lo = 0, hi = 1;
      for (let j = 0; j < 6; j++) { const f = (lo + hi) / 2; if (this.hitAt(b.x + sx * f, b.y + sy * f)) hi = f; else lo = f; }
      b.x += sx * lo; b.y += sy * lo;
    },
    box() { return boxWorld() * this.scale; }, // the player's box right now (Shrink makes it smaller)

    goalR() { return this.maze.goal.r * (GoalMedia.active ? clamp(S().goal.size, 0.66, 1) : 0.66); }, // the drawn GOAL circle (or goal media)

    // ----- health -----
    // How hurt the player looks: 1 right after a hit, fading to 0 as they heal; 0 at full health.
    hurtLevel() { return this.hp < HEARTS ? 1 - clamp(this.hurtT / REGEN, 0, 1) : 0; },
    recharging() { return this.hp < HEARTS && this.hurtT >= REGEN - RECHARGE; },
    // How solid the picture looks: faded while the shield is down, filling back in as it recharges.
    shieldLook() { return this.hp >= HEARTS ? 1 : this.recharging() ? 0.45 + 0.55 * clamp((this.hurtT - REGEN + RECHARGE) / RECHARGE, 0, 1) : 0.45; },
    boxesOn() { return S().gameplay.boxes && this.mode !== 'trial'; }, // Time Trial has no mystery boxes
    shielded() { const fx = this.fx; return this.guardT > 0 || this.stuck || fx.star > 0 || !!fx.bullet || !!fx.launch; },
    hurt() {
      if (this.bonus > 0) this.bonus--; else this.hp--;
      this.hurtT = 0;
      // Felt as well as seen: a moment's freeze, the view shaking, the shield bursting into sparks, a buzz on phones.
      this.hitAtT = this.t;
      this.stopT = HITSTOP;
      this.shakeT = SHAKE;
      this.beepT = 0.6;
      try { if (navigator.vibrate) navigator.vibrate(this.hp > 1 || this.bonus ? 50 : [60, 40, 90]); } catch (e) { /* not allowed here */ }
      this.guardT = GUARD;
      this.stuck = true; // this touch is spent: the next one has to be a new one
      this.clearT = 0;
      MZ.Audio.play('hurt');
      this.emit('hit', this.hp + this.bonus);
      this.emit('power');
      if (this.hp > 0) return false;
      this.lose('fall');
      return true;
    },
    // Hearts grow back, effects run down, the roulette lands, and a shrunk picture grows back once there is room for it.
    tickPower(dt) {
      const fx = this.fx;
      if (this.guardT > 0) this.guardT = Math.max(0, this.guardT - dt);
      if (!this.stuck) { // healing waits until you're off the edge
        const was = this.hurtT;
        this.hurtT += dt;
        if (this.hp < HEARTS && was < REGEN - RECHARGE && this.hurtT >= REGEN - RECHARGE) MZ.Audio.play('recharge');
      }
      if (this.hp < HEARTS && this.hurtT >= REGEN) { this.hp = HEARTS; this.emit('power'); }
      if (this.hp < HEARTS && !this.recharging() && (this.beepT -= dt) <= 0) { this.beepT = 0.8; MZ.Audio.play('low'); } // shield's down
      if (this.roll && (this.roll.t += dt) >= ROLL) this.endRoll();
      for (const k of ['star', 'carpet', 'shrink']) {
        if (!(fx[k] > 0)) continue;
        fx[k] -= dt;
        if (fx[k] <= 0) { fx[k] = 0; MZ.Audio.play('expire'); this.emit('power'); }
      }
      const want = fx.shrink > 0 ? SHRINK : 1;
      if (this.scale > want) this.scale = Math.max(want, this.scale - dt * 2.5);
      else if (this.scale < want) {
        const was = this.scale, b = this.ball;
        this.scale = Math.min(want, this.scale + dt * 1.5);
        if (!fx.carpet && !fx.bullet && !fx.launch && this.hitAt(b.x, b.y) && !this.unstick()) this.scale = was; // no room yet
      }
    },
    // Remember the last spot on solid floor (not a vanishing bridge): where a fall with nowhere closer ends up.
    noteSafe() {
      const b = this.ball;
      if (this.fx.carpet > 0) return;
      const q = this.world.query(b.x, b.y, this.playT);
      if (q.seg && !q.seg.blink && q.depth > 0) this.lastSafe = { x: b.x, y: b.y };
    },
    // Put the player on the nearest solid floor where the whole picture fits.
    rescue() {
      const b = this.ball, w = this.world, t = this.playT;
      const ok = (x, y) => { const q = w.query(x, y, t); return q.seg && !q.seg.blink && q.depth > 0 && !this.hitAt(x, y); };
      for (let r = 6; r <= 600; r += 6) {
        const n = Math.max(12, Math.round(r / 4));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
          if (ok(x, y)) { b.x = x; b.y = y; this.input.takeGrab(); return true; }
        }
      }
      const p = this.lastSafe || (this.maze ? this.maze.start : this.run.check);
      b.x = p.x; b.y = p.y;
      this.input.takeGrab();
      return false;
    },

    // ----- mystery boxes and items -----
    pickItem() {
      const w = {};
      let sum = 0;
      for (const id in ITEMS) {
        let v = ITEMS[id].w;
        if (id === 'heart') v = this.bonus >= MAX_BONUS ? 0 : v + (this.hp < HEARTS ? 10 : 0);
        sum += w[id] = v;
      }
      let x = Math.random() * sum;
      for (const id in w) if ((x -= w[id]) < 0) return id;
      return 'star';
    },
    endRoll() {
      const id = this.roll.id;
      this.roll = null;
      if (id === 'heart') {
        this.bonus = Math.min(MAX_BONUS, this.bonus + 1);
        MZ.Audio.play('heal');
      } else this.item = id;
      MZ.Audio.play('item');
      this.emit('bonus', ITEMS[id].name);
      this.emit('power');
    },
    giveItem(id) { if (ITEMS[id]) { this.roll = { t: ROLL, id }; this.endRoll(); } },
    useItem() {
      const id = this.item, fx = this.fx;
      if (!id || this.state !== 'play' || fx.bullet || fx.launch) return false;
      if (id === 'bullet') {
        const route = this.bulletRoute();
        if (!route) { MZ.toast('Nowhere to fly', 1200); return false; }
        fx.bullet = route;
      } else if (id === 'launch') {
        fx.launch = { t: 0, T: UP + AIR + DOWN, apex: clamp(Math.min(innerWidth, innerHeight) / APEX_VIEW / this.zoomTarget(), 0.02, 1) };
      } else fx[id] = ITEMS[id].dur;
      this.item = null;
      MZ.Audio.play(id === 'launch' ? 'launch' : id === 'bullet' ? 'bullet' : 'use');
      this.emit('use', id);
      this.emit('power');
      return true;
    },

    // The corridors as a graph: junctions by position (a finished maze's, or every loaded endless chunk's).
    graph() {
      const edges = this.maze ? this.maze.edges : [].concat(...Array.from(this.chunks.values(), (c) => c.data.edges));
      const ids = new Map(), pos = [], adj = [], solid = [];
      const id = (p) => {
        const k = Math.round(p.x * 4) + ',' + Math.round(p.y * 4);
        let i = ids.get(k);
        if (i == null) { i = pos.length; ids.set(k, i); pos.push(p); adj.push([]); solid.push(false); }
        return i;
      };
      const E = edges.map((e) => {
        const r = { e, a: id(e.pts[0]), b: id(e.pts[e.pts.length - 1]), len: polyLen(e.pts) };
        adj[r.a].push(r); adj[r.b].push(r);
        if (e.type !== 'blink') solid[r.a] = solid[r.b] = true;
        return r;
      });
      return { E, pos, adj, solid, id: (p) => ids.get(Math.round(p.x * 4) + ',' + Math.round(p.y * 4)) };
    },
    // Bullet: the route from here along the corridors, toward GOAL (stopping short of it), or in Endless outward, as far
    // as the run allows, finishing on a junction with solid floor.
    bulletRoute() {
      const b = this.ball, g = this.graph();
      let at = null, bd = Infinity; // the nearest point on any corridor
      for (const r of g.E) {
        const p = r.e.pts;
        let acc = 0;
        for (let i = 1; i < p.length; i++) {
          const ax = p[i - 1].x, ay = p[i - 1].y, dx = p[i].x - ax, dy = p[i].y - ay, L2 = dx * dx + dy * dy, sl = Math.sqrt(L2);
          const f = L2 ? clamp(((b.x - ax) * dx + (b.y - ay) * dy) / L2, 0, 1) : 0;
          const d = Math.hypot(ax + dx * f - b.x, ay + dy * f - b.y);
          if (d < bd) { bd = d; at = { r, s: acc + f * sl }; }
          acc += sl;
        }
      }
      if (!at || bd > 300) return null;
      // Shortest distances from here, leaving by either end of this corridor.
      const n = g.pos.length, dist = new Float64Array(n).fill(Infinity), prev = new Array(n).fill(null), done = new Uint8Array(n);
      dist[at.r.a] = at.s; dist[at.r.b] = Math.min(dist[at.r.b], at.r.len - at.s);
      if (at.r.a === at.r.b) dist[at.r.a] = Math.min(at.s, at.r.len - at.s);
      for (;;) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0) break;
        done[u] = 1;
        for (const r of g.adj[u]) {
          const v = r.a === u ? r.b : r.a;
          if (dist[u] + r.len < dist[v]) { dist[v] = dist[u] + r.len; prev[v] = r; }
        }
      }
      let target = -1;
      if (this.maze) target = g.id(this.maze.goal);
      else {
        const o = this.run.origin;
        let far = -1;
        for (let i = 0; i < n; i++) {
          if (!g.solid[i] || dist[i] > BULLET_RUN * 1.4) continue;
          const d = Math.hypot(g.pos[i].x - o.x, g.pos[i].y - o.y);
          if (d > far) { far = d; target = i; }
        }
      }
      if (target == null || target < 0 || dist[target] === Infinity) return null;
      // Walk back from the target, then lay the corridors out from here.
      const chain = [];
      let v = target;
      while (prev[v]) { const r = prev[v], u = r.a === v ? r.b : r.a; chain.push({ r, from: u, to: v }); v = u; }
      chain.reverse();
      const pts = [{ x: b.x, y: b.y }], nodeAt = [];
      const push = (q) => { const l = pts[pts.length - 1]; if (Math.hypot(q.x - l.x, q.y - l.y) > 0.01) pts.push({ x: q.x, y: q.y }); };
      // From here to the junction the route leaves by.
      const P = at.r.e.pts, cP = [0];
      for (let i = 1; i < P.length; i++) cP.push(cP[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
      if (v === at.r.b && v !== at.r.a) { for (let i = 0; i < P.length; i++) if (cP[i] >= at.s) push(P[i]); }
      else for (let i = P.length - 1; i >= 0; i--) if (cP[i] <= at.s) push(P[i]);
      for (const c of chain) {
        const Q = c.r.a === c.from ? c.r.e.pts : c.r.e.pts.slice().reverse();
        for (const q of Q) push(q);
        nodeAt.push({ i: pts.length - 1, solid: g.solid[c.to] });
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      let len = cum[cum.length - 1];
      if (this.maze) { // stop short of GOAL: the finish is yours
        const G = this.maze.goal, stop = this.goalR() + this.box() * 0.75 + 12;
        for (let i = 1; i < pts.length; i++) {
          if (Math.hypot(pts[i].x - G.x, pts[i].y - G.y) >= stop) continue;
          let lo = cum[i - 1], hi = cum[i];
          for (let j = 0; j < 20; j++) { const m = (lo + hi) / 2, q = this.along(pts, cum, m); if (Math.hypot(q.x - G.x, q.y - G.y) < stop) hi = m; else lo = m; }
          len = lo;
          break;
        }
      }
      // Run out at the first solid junction past the Bullet's reach.
      if (len > BULLET_RUN) for (const nd of nodeAt) if (nd.solid && cum[nd.i] >= BULLET_RUN && cum[nd.i] < len) { len = cum[nd.i]; break; }
      if (len < 40) return null;
      return { pts, cum, len, s: 0, t: 0, dir: 0 };
    },
    along(pts, cum, s) {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const f = clamp((s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), 0, 1);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    },
    // How high a Launch is right now, 0 on the ground to 1 at the top.
    lift() {
      const L = this.fx.launch;
      if (!L) return 0;
      return L.t < UP ? smooth(L.t / UP) : L.t < UP + AIR ? 1 : smooth(clamp((L.T - L.t) / DOWN, 0, 1));
    },
    liftZoom() { const L = this.fx.launch; return L ? Math.exp(Math.log(L.apex) * this.lift()) : 1; },
    // The Bullet steers for you (finger travel meanwhile is dropped). A Launch goes wherever you steer it, over anything,
    // at the zoomed-out camera's scale, and comes down right where it is: on the board, or in the void.
    fly(dt) {
      const fx = this.fx, b = this.ball, grab = this.input.takeGrab();
      if (fx.bullet) {
        const B = fx.bullet;
        B.t += dt;
        const to = Math.min(B.len, B.s + BULLET_V * Math.min(1, 0.3 + B.t * 2.5) * dt);
        const n = Math.max(1, Math.ceil((to - B.s) / (this.box() * 0.25)));
        const from = B.s;
        for (let i = 1; i <= n; i++) {
          const q = this.along(B.pts, B.cum, from + ((to - from) * i) / n);
          if (q.x !== b.x || q.y !== b.y) B.dir = Math.atan2(q.y - b.y, q.x - b.x);
          b.x = q.x; b.y = q.y;
          B.s = from + ((to - from) * i) / n;
          if (this.pickups()) return;
        }
        if (B.s >= B.len) { fx.bullet = null; this.land(); }
        return;
      }
      const L = fx.launch;
      L.t = Math.min(L.T, L.t + dt);
      const cfg = S().controls, u = this.input.vector(), sg = cfg.invert ? 1 : -1, k = clamp(cfg.speed || 1, 0.5, 2) / this.cam.zoom;
      const kz = KEY_SPEED / this.liftZoom(); // keys keep their speed on screen
      b.x += grab.x * sg * k + u.x * kz * dt;
      b.y += grab.y * sg * k + u.y * kz * dt;
      if (this.maze) { const B = this.maze.bounds; b.x = clamp(b.x, B.minX - 150, B.maxX + 150); b.y = clamp(b.y, B.minY - 150, B.maxY + 150); }
      if (L.t < L.T) return;
      // Down where you are. On the board, fine (a small nudge clears an edge); in the void, it's a fall: a hit, then the
      // nearest floor.
      fx.launch = null;
      this.cam.zoom = this.zoomTarget();
      this.input.takeGrab();
      MZ.Audio.play('land');
      this.emit('power');
      if (this.hitAt(b.x, b.y) && !this.unstick()) {
        if (!this.shielded() && this.hurt()) return;
        this.rescue();
      }
      this.noteSafe();
      this.pickups();
    },
    land() {
      const b = this.ball;
      this.cam.zoom = this.zoomTarget();
      this.guardT = Math.max(this.guardT, GUARD);
      if (this.hitAt(b.x, b.y) && !this.unstick()) this.rescue();
      this.noteSafe();
      this.input.takeGrab();
      MZ.Audio.play('land');
      this.emit('power');
    },

    // Does the player's picture, placed at (x, y), touch the void? Every solid pixel of the current frame is tested
    // (outline, plus a grid inside), each allowed the small buffer over the edge. Before the picture has loaded, the
    // box's inscribed circle stands in.
    hitAt(x, y) {
      const m = this.sprite.mask, W = this.box(), buf = W * BUFFER, t = this.playT, w = this.world;
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
      const b = this.ball, W = this.box();
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
      const b = this.ball, m = this.sprite.mask, W = this.box();
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
      // Flags: touching one lights it (and any before it); a loss then comes back here.
      const cps = this.checkpoints;
      if (this.maze && cps.length) {
        for (let i = cps.length - 1; i > this.cpIdx; i--) {
          const c = cps[i];
          if (!this.touches(c.x, c.y, c.r * 0.5)) continue;
          this.cpIdx = i;
          for (let j = 0; j <= i; j++) cps[j].lit = true;
          MZ.Audio.play('beacon');
          this.emit('bonus', cps.length > 1 ? 'Checkpoint ' + (i + 1) + '/' + cps.length : 'Checkpoint');
          break;
        }
      }
      // Boxes: touching one shatters it; an empty slot spins for an item (a full one gets nothing). It's back later.
      if (this.boxes && this.boxesOn()) {
        for (const bx of this.boxes) {
          if (bx.takenAt != null && this.runT - bx.takenAt < BOX_BACK) continue;
          bx.takenAt = null;
          if (!this.touches(bx.x, bx.y, BOX_R)) continue;
          bx.takenAt = this.runT;
          if (bx.key) this.run.boxTaken.set(bx.key, this.runT);
          MZ.Audio.play('shatter');
          if (!this.item && !this.roll) { this.roll = { t: 0, id: this.pickItem() }; MZ.Audio.play('box'); }
          this.emit('power');
        }
      }
      if (this.maze) {
        const g = this.maze.goal;
        if (this.touches(g.x, g.y, this.goalR())) { this.win(); return true; }
      }
      return false;
    },

    // Out of hearts, or out of time. A lit flag takes you back to it (not after time runs out); otherwise the maze
    // starts over. Gauntlet and Endless also cost a life.
    async lose(reason) {
      if (reason === 'fall') MZ.Save.progress.stats.falls++;
      this.fx = {};
      this.roll = null;
      this.setState('fx');
      this.emit('lose', reason);
      this.emit('power');
      MZ.Audio.play('lose');
      MZ.Save.saveProgress();
      await FX.play('lose');
      if (this.state !== 'fx') return; // quit meanwhile
      const cp = reason !== 'time' && this.maze && this.cpIdx >= 0 && this.checkpoints[this.cpIdx];
      if (this.mode === 'gauntlet') {
        this.run.lives--;
        if (this.run.lives <= 0) return this.gameOver();
        return cp ? this.respawnAtCheckpoint() : this.restartLevel();
      }
      if (this.mode === 'endless') {
        this.run.lives--;
        if (this.run.lives <= 0 || reason === 'time') return this.gameOver();
        return this.respawn();
      }
      return cp ? this.respawnAtCheckpoint() : this.restartLevel();
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
      } else if (this.mode === 'trial') {
        const L = this.run.level, prev = P.trials[L];
        res.newBest = prev == null || time < prev;
        P.trials[L] = prev == null ? time : Math.min(prev, time);
        res.best = P.trials[L];
        res.prev = prev;
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
        data.boxes.forEach((b, i) => { b.key = k + ':x' + i; b.takenAt = this.run.boxTaken.has(b.key) ? this.run.boxTaken.get(b.key) : null; b.seen = this.run.seenKeys.has(b.key); });
        this.world.addPart(k, data);
        this.chunks.set(k, { data });
      }
      for (const k of Array.from(this.chunks.keys())) {
        const [x, y] = k.split(',').map(Number);
        if (Math.abs(x - cx) > ring + 1 || Math.abs(y - cy) > ring + 1) { this.world.removePart(k); this.chunks.delete(k); }
      }
      this.gems = []; this.beacons = []; this.boxes = [];
      for (const { data } of this.chunks.values()) { this.gems.push(...data.gems); this.beacons.push(...data.beacons); this.boxes.push(...data.boxes); }
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
      const showPlayer = !menu, fx = this.fx, boxesOn = !menu && this.boxesOn();
      this.renderer.draw({
        world, cam: this.cam, t: pt, floor: s.display.floor, hue: seed % 360, rgb, clock: t,
        start: maze ? maze.start : this.mode === 'endless' && this.run ? this.run.origin : null,
        goal: maze ? Object.assign({ media: GoalMedia.active && !menu }, maze.goal) : null,
        gems: menu ? maze && maze.gems : this.gems,
        beacons: this.mode === 'endless' && !menu ? this.beacons : null,
        flags: !menu && maze ? this.checkpoints : null,
        boxes: boxesOn ? this.boxes.filter((x) => x.takenAt == null || this.runT - x.takenAt >= BOX_BACK) : null,
        boxAge: (x) => (x.takenAt == null ? 9 : this.runT - x.takenAt - BOX_BACK),
        shards: boxesOn ? this.boxes.filter((x) => x.takenAt != null && this.runT - x.takenAt < SHATTER).map((x) => ({ x: x.x, y: x.y, k: (this.runT - x.takenAt) / SHATTER })) : null,
        // Under the player: a Launch's shadow on the ground, the magic carpet (flickering as it runs out), the Bullet.
        under: showPlayer && this.state !== 'menu' ? {
          x: b.x, y: b.y, W: this.box(), lift: this.lift(),
          carpet: fx.carpet > 0 ? (fx.carpet > 1.5 || Math.floor(fx.carpet * 8) % 2 ? 1 : 0.35) : 0,
          shield: this.bonus, // Extra hits: gold rings around the player
          burst: this.hitAtT != null && this.t - this.hitAtT < 0.45 ? (this.t - this.hitAtT) / 0.45 : null, // the shield breaking
          crackle: this.hp < HEARTS && !this.recharging() && this.state === 'play' ? this.t : null, // ...and fizzing while it's down
          bullet: fx.bullet ? fx.bullet.dir : null,
        } : null,
      });

      // Player sprite: the user's media, upright and still at the centre of the screen (up in the air on a Launch).
      const pl = MZ.$('#player');
      if (showPlayer) {
        const lift = this.lift(), z = lift ? this.zoomTarget() * (1 + 0.3 * lift) : this.cam.zoom;
        const css = this.box() * z, size = css.toFixed(1) + 'px';
        this.sprite.update(performance.now(), false, css, Math.min(window.devicePixelRatio || 1, s.display.quality));
        pl.hidden = false;
        pl.style.width = pl.style.height = size;
        pl.style.transform = lift ? 'translate(-50%,calc(-50% - ' + (lift * Math.min(innerWidth, innerHeight) * 0.14).toFixed(1) + 'px))' : 'translate(-50%,-50%)';
        // Health shows on the picture only: on a hit the shield flares and the picture jolts; it blinks while the edges
        // hold, stays faded and drained of colour while the shield is down, and fills back in with a shimmer as it
        // recharges.
        const flare = this.state === 'play' && this.hitAtT != null && this.t - this.hitAtT < 0.3, look = this.shieldLook();
        const cls = (fx.star > 0 ? ' invincible' + (fx.star < 1.5 ? ' ending' : '') : '') + (this.guardT > 0 && this.state === 'play' ? ' guard' : '') +
          (fx.bullet ? ' bullet' : '') + (flare ? ' flare' : '') + (this.recharging() ? ' recharge' : '') + (look < 1 ? ' down' : '');
        if (pl.className !== cls.trim()) pl.className = cls.trim();
        const pm = pl.firstElementChild, op = look >= 1 ? '' : look.toFixed(2), gray = look >= 1 ? '' : ((1 - look) / 0.55 * 0.9).toFixed(2);
        if (pm.style.opacity !== op) pm.style.opacity = op;
        if (pm.style.getPropertyValue('--gray') !== gray) pm.style.setProperty('--gray', gray);
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
        if (this.mode === 'endless') this.minimap.drawRadar(this.world, b, this.beacons, view, this.seenNear(b.x, b.y, 1000).concat([view]), boxesOn ? this.boxes : null);
        else this.minimap.draw(b, this.maze && this.maze.goal, this.gems, view, this.checkpoints, boxesOn ? this.boxes : null);
      } else mmEl.hidden = true;
      this.emit('frame');
    },
  });

  MZ.Game = Game;
})();
