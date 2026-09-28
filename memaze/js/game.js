/* Memaze — the game: modes, level flow, movement, camera, pickups, win/lose media, and the per-frame loop. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { clamp, lerp, hashStr, hashInts, rng, segDist2 } = MZ;
  const Gen = MZ.Gen;
  const R = Gen.BALL_R;

  const KEY_SPEED = 140; // keys and gamepad, world units per second
  const GLIDE = 230;     // mouse Glide at full tilt (pointer far from the picture), world units per second
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
    launch: { name: 'Launch', w: 3 },
    carpet: { name: 'Magic carpet', w: 3, dur: 3.5 }, // these two are the rarest (and the carpet is short)
    shrink: { name: 'Shrink', w: 16, dur: 10 },
    path: { name: 'Path', w: 12, dur: 6 }, // shows the way to GOAL for a while
  };
  const BULLET_V = 520, BULLET_RUN = 1800; // Bullet: speed and how far it carries you (it finishes on a junction)
  const GEM_CHARM = 5, MAX_LIVES = 9;      // Gauntlet: every this many gems pays out (a life, a shield, an item, time)
  const STONE_BACK = 10, KNOCK = 90;       // Gauntlet's cyclone stones: seconds a smashed one stays gone; how far one throws you
  const APEX_VIEW = 1100;                  // Launch: world units across the screen's shorter side at the top
  const REACH = 340;                       // Launch: how far from take-off you can steer; clouds mark the border
  const UP = 0.3, AIR = 0.75, DOWN = 0.4;  // Launch: seconds going up, at the top, coming down (you steer throughout)
  const HOP = 0.08, HOP_GROW = 0.18;       // ...how high the picture rises on screen (share of the shorter side), how much it grows
  const HITSTOP = 0.07, SHAKE = 0.32;      // a hit: the game freezes this long, then the view shakes this long
  const BREAK = 0.6, BUILD = 0.5;          // a loss shatters the picture (seconds the pieces fly); it flies back together as you spawn
  const SHRINK = 0.5;
  const STRIKE = 0.45, STORM = 0.95;      // Shrink: a thundercloud gathers, its lightning strikes (then you shrink), it clears
  const ICE_GRIP = 2.2;   // on ice, how fast your movement catches up with your drag (per second): low = more drift
  const ICE_MAX = 700;    // ...and the fastest you can slide
  const smooth = (k) => k * k * (3 - 2 * k);
  // The picture cut into glassy shards: a jittered 4x4 grid over its visible part b (box units, 0-1), each cell split
  // along a random diagonal. Each shard has its own heading out from the middle, distance (in box sizes) and spin.
  function cutShards(seed, b) {
    const r = rng(seed), N = 4, P = [], mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const inner = i > 0 && j > 0 && i < N && j < N;
      const u = (i + (inner ? r.range(-0.3, 0.3) : 0)) / N, v = (j + (inner ? r.range(-0.3, 0.3) : 0)) / N;
      P.push({ x: b.x0 + u * (b.x1 - b.x0), y: b.y0 + v * (b.y1 - b.y0) });
    }
    const at = (i, j) => P[j * (N + 1) + i], out = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      for (const tri of r.chance(0.5) ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]) {
        const cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
        const ang = Math.atan2(cy - my, cx - mx) + r.range(-0.5, 0.5);
        out.push({ pts: tri, c: { x: cx, y: cy }, dx: Math.cos(ang), dy: Math.sin(ang), v: span * r.range(0.35, 0.85) * (0.7 + (1.2 * Math.hypot(cx - mx, cy - my)) / span), w: r.range(-3, 3) });
      }
    }
    return out;
  }
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
    t: 0, flow: 0, playT: 0, clock: 0, elapsed: 0, restarts: 0, gemsTaken: 0, stateT: 0, lastTick: -1, attract: 0,
    checkpoints: [], cpIdx: -1, boxes: [],
    hp: HEARTS, bonus: 0, hurtT: REGEN, guardT: 0, stuck: false, clearT: 0, touched: false, runT: 0, scale: 1, item: null, roll: null, fx: {}, lastSafe: null,
    FX, Player, Backdrop, GoalMedia, ITEMS, ROLL, HEARTS, MAX_BONUS, REGEN, ICE_GRIP, GEM_CHARM,

    init() {
      this.renderer = new MZ.Renderer(MZ.$('#maze'));
      this.minimap = new MZ.Minimap(MZ.$('#minimap'));
      this.input = new MZ.Input(MZ.$('#stage'));
      this.sprite = new MZ.Sprite(MZ.$('#player-canvas'));
      this.input.onZoom = (k) => this.zoomBy(k);
      this.input.onUse = () => this.useItem();
      this.input.onUnlock = () => { if (this.state === 'play') this.pause(); }; // Esc let the captured mouse go
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
      this.input.mouseMode = s.controls.mouse || 'glide';
      if (this.input.mouseMode !== 'lock') this.input.unlock();
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
      let v = this.viewRect();
      const dark = this.maze && this.maze.dark;
      if (dark) { const b = this.ball; v = { x0: Math.max(v.x0, b.x - dark), y0: Math.max(v.y0, b.y - dark), x1: Math.min(v.x1, b.x + dark), y1: Math.min(v.y1, b.y + dark) }; } // only what the light reaches
      const inside = (o, r) => o.x + r > v.x0 && o.x - r < v.x1 && o.y + r > v.y0 && o.y - r < v.y1;
      const keep = (o) => { if (o.key && this.run && this.run.seenKeys) this.run.seenKeys.add(o.key); };
      if (this.gems) for (const g of this.gems) if (!g.seen && inside(g, 15)) { g.seen = true; keep(g); }
      if (this.beacons) for (const bc of this.beacons) if (!bc.seen && inside(bc, bc.r)) { bc.seen = true; keep(bc); }
      if (this.boxes) for (const bx of this.boxes) if (!bx.seen && inside(bx, BOX_R)) { bx.seen = true; keep(bx); }
      if (this.maze) for (const c of this.checkpoints) if (!c.seen && inside(c, c.r)) c.seen = true;
      if (this.maze) {
        const m = this.maze;
        for (const o of [].concat(m.doors, m.keys, m.plates, m.gates, m.squeezes || [], m.gboxes || [])) if (!o.seen && inside(o, 20)) o.seen = true;
        for (const q of m.gaps || []) if (!q.seen && (inside(q.a, 30) || inside(q.b, 30))) q.seen = true;
        for (const st of m.stones || []) if (!st.seen && inside({ x: st.jx, y: st.jy }, 40)) st.seen = true;
        for (const pt of m.portals) for (const e of [pt.a, pt.b]) if (!e.seen && inside(e, pt.r)) e.seen = true;
        for (const mv of m.movers) if (!mv.seen && (inside(mv.a, mv.r) || inside(mv.b, mv.r))) mv.seen = true;
      }
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
    // Chapters: level by level, ten to a chapter, the tenth a boss.
    startJourney(level) {
      this.mode = 'journey';
      this.run = { level };
      this.loadMaze(MZ.Levels.levelParams(level), { label: MZ.Levels.label(level), level });
    },
    // Time Trial: any level reached so far, no mystery boxes, no time limit; your best run races you as a ghost.
    startTrial(level) {
      this.mode = 'trial';
      this.run = { level };
      this.loadMaze(MZ.Levels.levelParams(level), { label: 'Time Trial · ' + MZ.Levels.label(level), level });
    },
    // Gauntlet: an endless run of mazes. o = { seedText, style: 'progressive' | 'random', diff }; the same seed (and
    // settings) always gives the same run.
    startGauntlet(o) {
      o = Object.assign({ style: 'progressive', diff: 'normal' }, o);
      const D = MZ.Levels.GAUNTLET[o.diff] || MZ.Levels.GAUNTLET.normal, key = o.style + '/' + o.diff;
      const seedText = o.seedText || MZ.randomSeed();
      this.mode = 'gauntlet';
      this.run = { seed: hashStr('memaze/gauntlet/' + seedText), seedText, userSeed: !!o.seedText, style: o.style, diff: o.diff, key, cleared: 0, lives: D.lives, prevBest: MZ.Save.progress.gauntlet[key] || 0 };
      this.item = null; this.roll = null; this.bonus = 0; // a fresh run starts empty-handed
      this.run.gems = 0;
      this.nextGauntlet();
    },
    nextGauntlet() {
      const r = this.run, p = MZ.Levels.gauntletParams(r, r.cleared);
      // The item in your slot (or the one spinning in) and your Extra hit shields come along.
      const keep = this.item, rings = this.bonus; // (a spin still going landed when the maze was cleared)
      this.loadMaze(p, { label: 'Gauntlet · ' + (p.boss ? 'Boss · ' : '') + 'Depth ' + (r.cleared + 1), depth: r.cleared + 1 });
      if (keep && ITEMS[keep]) this.item = keep;
      this.bonus = rings;
      this.emit('power');
    },
    startEndless() {
      this.mode = 'endless';
      const seed = hashStr('memaze/endless/' + String(Math.random()));
      this.run = { seed, lives: 3, taken: new Set(), lit: new Set(), seenKeys: new Set(), boxTaken: new Map(), best: 0, gems: 0, beaconsLit: 0, check: null };
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
      const m = MZ.Levels.build(params);
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
      this.resetMech();
      this.beginLevel(m.start, m.timeLimit, true);
      this.emit('level', m);
    },
    // Keys back where they were, doors shut, switches up, portals ready.
    resetMech() {
      const m = this.maze;
      this.keysHeld = new Map(); // colour -> how many keys of it you carry
      this.warpLock = null;
      this.vel = { x: 0, y: 0 };
      if (!m) return;
      for (const d of m.doors) { d.open = false; d.openAt = null; d.seen = false; }
      for (const k of m.keys) { k.taken = false; k.seen = false; }
      for (const pl of m.plates) { pl.down = false; pl.seen = false; }
      for (const pt of m.portals) pt.seen = false;
      for (const q of [].concat(m.gaps || [], m.squeezes || [])) q.seen = false;
      for (const gb of m.gboxes || []) { gb.out = false; gb.back = null; gb.seen = false; gb.bornAt = null; gb.gotAt = null; }
      for (const st of m.stones || []) { st.brokeAt = null; st.seen = false; }
      this.world.sw = {};
    },
    mod(id) { return !!(this.maze && this.maze.mods && this.maze.mods.includes(id)); },

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
      this.assemble();
      MZ.Audio.Music.ensure();
      this.emit('begin');
    },

    restartLevel() {
      if (this.mode === 'endless') return;
      this.restarts = this.state === 'result' ? 0 : this.restarts + 1; // Retry after a clear is a fresh attempt
      if (this.mode !== 'gauntlet') this.gems.forEach((g) => (g.taken = false)); // Gauntlet gems are banked as you take them
      this.cpIdx = -1;
      for (const c of this.checkpoints) c.lit = false;
      for (const b of this.boxes) b.takenAt = null;
      this.resetMech();
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
      this.assemble();
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
      if (st !== 'play') { this.input.release(); this.input.unlock(); }
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
      if (fx.bullet || fx.launch || fx.bubble) { this.touched = false; this.offEdge(dt); this.fly(dt); if (this.state === 'play' && this.mode === 'endless') this.endlessTick(); return; }

      this.carry(dt);
      const d = inp.takeGrab(), u = inp.vector();
      const sg = cfg.invert !== this.mod('mirror') ? 1 : -1, k = clamp(cfg.speed || 1, 0.5, 2) / this.cam.zoom;
      const gl = this.glideVec(), gk = GLIDE * clamp(cfg.speed || 1, 0.5, 2) * (this.mod('mirror') ? -1 : 1) * dt;
      let mx = d.x * sg * k + u.x * KEY_SPEED * dt + gl.x * gk, my = d.y * sg * k + u.y * KEY_SPEED * dt + gl.y * gk;
      const free = fx.carpet > 0; // the magic carpet floats over the void
      // Ice: your movement only slowly catches up with your drag, and keeps sliding after you stop.
      if (dt > 0) {
        const q = !free && this.world.query(b.x, b.y, this.playT), v = this.vel;
        if (q && q.seg && q.seg.ice) {
          const a = 1 - Math.exp(-dt * ICE_GRIP);
          v.x += (mx / dt - v.x) * a; v.y += (my / dt - v.y) * a;
          const sp = Math.hypot(v.x, v.y);
          if (sp > ICE_MAX) { v.x *= ICE_MAX / sp; v.y *= ICE_MAX / sp; }
          mx = v.x * dt; my = v.y * dt;
        } else { v.x = mx / dt; v.y = my / dt; }
      }
      let soft = S().gameplay.rule === 'casual' || this.shielded(); // edges hold like walls
      this.touched = false;
      // Standing still can still go wrong: an animation frame reaching over the edge (a touch), or a bridge vanishing
      // underneath, the carpet running out over the void (a fall).
      if (!free && this.hitAt(b.x, b.y)) {
        this.touched = true;
        // A fall (the bubble) only when the floor is gone from under the picture's middle. Otherwise the picture
        // itself reached over the edge (a new animation frame while pressed into a wall or a corner): back onto the
        // floor, and it's a touch.
        if (!this.unstick() && (!(this.world.query(b.x, b.y, this.playT).depth > 0) || !this.unstick(0.8))) { this.fall(); return; }
        if (!soft) { if (this.hurt()) return; soft = true; } // that was this frame's hit: the edges hold now
      }
      // Move in slices far shorter than the hitbox buffer, so the first touch is found and no gap is ever skipped.
      const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / (this.box() * BUFFER * 0.5)));
      const sx = mx / n, sy = my / n;
      for (let i = 0; i < n; i++) {
        if (this.barred(b.x, b.y, b.x + sx, b.y + sy)) { // a shut door or a one-way gate: a wall, never a hit
          this.vel.x = this.vel.y = 0;
          if (sx && !this.barred(b.x, b.y, b.x + sx, b.y) && (free || !this.hitAt(b.x + sx, b.y))) b.x += sx;
          else if (sy && !this.barred(b.x, b.y, b.x, b.y + sy) && (free || !this.hitAt(b.x, b.y + sy))) b.y += sy;
          else break;
        } else if (free || !this.hitAt(b.x + sx, b.y + sy)) { b.x += sx; b.y += sy; }
        else {
          this.touched = true;
          this.vel.x = this.vel.y = 0;
          if (!soft) { this.toEdge(sx, sy); if (this.hurt()) return; break; } // a hit: stop right at the edge
          if (sx && !this.hitAt(b.x + sx, b.y)) b.x += sx; // Walls: slide along the edge...
          else if (sy && !this.hitAt(b.x, b.y + sy)) b.y += sy;
          else { this.toEdge(sx, sy); break; } // ...or stop right at it
        }
        if (this.pickups()) return;
        if (this.warped) { this.warped = false; break; }
      }
      if (this.stoneContact()) return;
      this.offEdge(dt);
      this.noteSafe();
      if (this.mode === 'endless') this.endlessTick();
    },
    // Gauntlet's cyclone stones: touching one throws you back (a hit, unless the edges are walls or you're shielded);
    // with Invincible you smash it instead, and it's back STONE_BACK s later. True if the hit lost the maze.
    stoneContact() {
      const m = this.maze;
      if (!m || !m.stones || !m.stones.length) return false;
      for (const st of m.stones) {
        if (st.brokeAt != null && this.playT - st.brokeAt < STONE_BACK) continue;
        st.brokeAt = null;
        const p = MZ.stoneAt(st, this.playT);
        if (!this.touches(p.x, p.y, st.r)) continue;
        if (this.fx.star > 0) { st.brokeAt = this.playT; st.brokeX = p.x; st.brokeY = p.y; MZ.Audio.play('shatter'); this.emit('bonus', 'Smashed!'); continue; }
        this.knockback(p);
        MZ.Audio.play('land');
        if (S().gameplay.rule !== 'casual' && !this.shielded() && this.hurt()) return true;
      }
      return false;
    },
    // Thrown away from p, up to KNOCK units, whichever way the floor allows most (never over the edge or through a bar).
    knockback(p) {
      const b = this.ball, a0 = Math.atan2(b.y - p.y, b.x - p.x);
      let best = null, bd = -1;
      for (const da of [0, 0.6, -0.6, 1.3, -1.3, 2, -2]) {
        const dx = Math.cos(a0 + da), dy = Math.sin(a0 + da);
        let x = b.x, y = b.y, d = 0;
        for (; d < KNOCK; d += 4) { const nx = x + dx * 4, ny = y + dy * 4; if (this.hitAt(nx, ny) || this.barred(x, y, nx, ny)) break; x = nx; y = ny; }
        if (d > bd + 8) { bd = d; best = { x, y }; } // (straight away is preferred unless another way goes clearly further)
      }
      if (best) { b.x = best.x; b.y = best.y; }
      this.vel.x = this.vel.y = 0;
      this.input.takeGrab();
    },
    // After a hit, the edge can hurt again only once you've been clear of it for a beat.
    offEdge(dt) {
      if (this.touched) { this.clearT = 0; return; }
      this.clearT += dt;
      if (this.stuck && this.clearT >= CLEAR) this.stuck = false;
    },
    // A moving platform carries whoever stands on it.
    carry(dt) {
      const b = this.ball;
      for (const mv of this.world.movers) {
        const p0 = MZ.moverAt(mv, this.playT - dt), p1 = MZ.moverAt(mv, this.playT);
        if (Math.hypot(b.x - p0.x, b.y - p0.y) < mv.r - 2) { b.x += p1.x - p0.x; b.y += p1.y - p0.y; return; }
      }
    },
    // Moving the centre from (x0, y0) to (x1, y1): does a shut door or a one-way gate (crossed the wrong way) stop it?
    // Bumping into a door with its key in your pocket opens it (and uses the key up).
    barred(x0, y0, x1, y1) {
      const m = this.maze;
      if (!m) return false;
      for (const d of m.doors) {
        if (d.open || !this.overBar(x1, y1, d)) continue;
        if (this.keysHeld.get(d.color)) { this.openDoor(d); continue; }
        // Already on the bar (a Launch came down on it, Shrink ran out next to it): stepping away is always allowed.
        if (this.overBar(x0, y0, d) && segDist2(x1, y1, d.ax, d.ay, d.bx, d.by) > segDist2(x0, y0, d.ax, d.ay, d.bx, d.by)) continue;
        return true;
      }
      for (const g of m.gates) if ((x1 - x0) * g.nx + (y1 - y0) * g.ny < 0 && MZ.segsCross(x0, y0, x1, y1, g.ax, g.ay, g.bx, g.by)) return true;
      if (this.scale > SHRINK + 0.05) for (const q of m.squeezes || []) { // a shrink gate: only a shrunk picture gets through
        if (!this.overBar(x1, y1, q)) continue;
        if (this.overBar(x0, y0, q) && segDist2(x1, y1, q.ax, q.ay, q.bx, q.by) > segDist2(x0, y0, q.ax, q.ay, q.bx, q.by)) continue; // stepping off it
        return true;
      }
      return false;
    },
    openDoor(d) {
      d.open = true;
      d.openAt = this.t;
      this.keysHeld.set(d.color, this.keysHeld.get(d.color) - 1);
      MZ.Audio.play('unlock');
      this.emit('power');
    },
    // Does the picture at (x, y) overlap a door's bar (the capsule DOOR_R either side of it, exactly as it's drawn)?
    overBar(x, y, d) {
      const mask = this.sprite.mask, W = this.box(), R = MZ.Levels.DOOR_R, reach = (mask ? mask.maxR : 0.5) * W + R;
      if (segDist2(x, y, d.ax, d.ay, d.bx, d.by) > reach * reach) return false;
      if (!mask) return true;
      const p = mask.pts;
      for (let i = 0; i < p.length; i += 2) if (segDist2(x + p[i] * W, y + p[i + 1] * W, d.ax, d.ay, d.bx, d.by) < R * R) return true;
      return false;
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
    shielded() { const fx = this.fx; return this.guardT > 0 || this.stuck || fx.star > 0 || !!fx.bullet || !!fx.launch || !!fx.bubble || this.building(); },
    // Mouse Glide: where the pointer says to head (|v| <= 1). The picture's own area is a rest spot.
    glideVec() {
      const css = this.box() * this.cam.zoom;
      return (this.glide = this.input.glide(innerWidth / 2, innerHeight / 2, Math.max(24, css * 0.6), Math.min(innerWidth, innerHeight) * 0.3));
    },
    // ...shown as a small chevron at the picture's edge pointing the way, stronger the faster you glide.
    drawGlide(css, v) {
      const m = Math.hypot(v.x, v.y);
      if (m < 0.03 || this.state !== 'play') return;
      const g = this.renderer.ctx, dpr = this.renderer.dpr, a = Math.atan2(v.y, v.x), r = Math.max(24, css * 0.6) + 10;
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.translate(this.renderer.w / 2 + Math.cos(a) * r, this.renderer.h / 2 + Math.sin(a) * r);
      g.rotate(a);
      g.globalAlpha = 0.25 + 0.6 * m;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-6, -9); g.lineTo(4, 0); g.lineTo(-6, 9);
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 7; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke();
      g.restore();
    },
    // A loss shatters the picture; spawning in, the pieces fly back together (you can already move, and nothing hurts).
    shatter() {
      if (S().display.reducedMotion) return false;
      this.pieces = { kind: 'break', t0: this.t, T: BREAK, seed: hashInts(Math.floor(this.t * 1000), 0x5a7) };
      MZ.Audio.play('shatter');
      return true;
    },
    assemble() {
      this.pieces = S().display.reducedMotion ? null : { kind: 'build', t0: this.t, T: BUILD, seed: hashInts(Math.floor(this.t * 1000), 0xb17d) };
    },
    building() { return !!(this.pieces && this.pieces.kind === 'build' && this.t - this.pieces.t0 < this.pieces.T); },
    // The shards, cut from the picture as it looks this frame, in screen space around the centre (css: the box in px).
    drawPieces(css) {
      const P = this.pieces, k = clamp((this.t - P.t0) / P.T, 0, 1);
      if (P.kind === 'build' && k >= 1) { this.pieces = null; this.formedAt = this.t; MZ.Audio.play('pop'); return; }
      if (P.kind === 'break' && k >= 1) return; // gone until the next spawn
      const src = this.shardCanvas || (this.shardCanvas = document.createElement('canvas'));
      if (!this.sprite.snapshot(src)) return;
      if (!P.list) P.list = cutShards(P.seed, this.opaqueBounds(src)); // cut once the picture is there to cut
      const g = this.renderer.ctx, dpr = this.renderer.dpr, cx = this.renderer.w / 2, cy = this.renderer.h / 2;
      // Breaking: a burst that slows, the shards spinning, shrinking and fading. Building: in from afar, settling.
      const e = P.kind === 'break' ? 1 - Math.pow(1 - k, 2.4) : Math.pow(1 - k, 3);
      const alpha = P.kind === 'break' ? (k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6) : Math.min(1, k * 3);
      const sc = P.kind === 'break' ? 1 - 0.25 * k : 1;
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = alpha;
      for (const s of P.list) {
        const d = s.v * css * e;
        g.save();
        g.translate(cx + (s.c.x - 0.5) * css + s.dx * d, cy + (s.c.y - 0.5) * css + s.dy * d);
        g.rotate(s.w * e);
        g.scale(sc, sc);
        g.beginPath();
        s.pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, (p.x - s.c.x) * css, (p.y - s.c.y) * css));
        g.closePath();
        g.clip();
        g.drawImage(src, -s.c.x * css, -s.c.y * css, css, css);
        g.restore();
      }
      g.restore();
    },
    // Where picture c is visible (alpha over half), in box units, a little padded; the whole box if it can't be read.
    opaqueBounds(c) {
      const n = 48, s = this.boundsCanvas || (this.boundsCanvas = document.createElement('canvas'));
      s.width = s.height = n;
      const g = s.getContext('2d', { willReadFrequently: true });
      let d;
      try { g.drawImage(c, 0, 0, n, n); d = g.getImageData(0, 0, n, n).data; } catch (e) { return { x0: 0, y0: 0, x1: 1, y1: 1 }; }
      let x0 = n, y0 = n, x1 = -1, y1 = -1;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 < 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
      return { x0: Math.max(0, (x0 - 1) / n), y0: Math.max(0, (y0 - 1) / n), x1: Math.min(1, (x1 + 2) / n), y1: Math.min(1, (y1 + 2) / n) };
    },
    // Shrink's thundercloud, over the picture at the centre of the screen (css: the picture's box in px): it gathers,
    // flickers, a bolt strikes the picture with a flash, and it drifts apart.
    drawStorm(css, W) {
      const g = this.renderer.ctx, dpr = this.renderer.dpr, cx = this.renderer.w / 2, cy = this.renderer.h / 2;
      const size = Math.max(W.size || css, 40), t = W.t, r = rng(W.seed); // sized as the picture was when summoned: it doesn't shrink with you
      const grow = smooth(clamp(t / 0.3, 0, 1)), fade = 1 - smooth(clamp((t - STRIKE - 0.2) / (STORM - STRIKE - 0.2), 0, 1));
      const ky = cy - size * (1.6 + 0.2 * (1 - grow)), kw = size * 1.05 * (0.4 + 0.6 * grow);
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = fade;
      const puffs = [[-0.62, 0.12, 0.42], [-0.25, -0.12, 0.55], [0.2, -0.18, 0.6], [0.6, 0.08, 0.45], [0, 0.18, 0.5]];
      const lit = !W.hit && (Math.floor(t * 22) % 5 === 0) && t > 0.15; // flickers before it strikes
      for (const [col, dy, sc] of [['#1d1f2e', 0.1, 1], [lit ? '#8d95c4' : '#4a4f6e', 0, 1], [lit ? '#b3bbe6' : '#5d6385', -0.1, 0.6]]) {
        g.fillStyle = col; // each layer one shape, so no seams where the puffs overlap
        g.beginPath();
        for (const [px, py, pr] of puffs) { g.moveTo(cx + px * kw + pr * kw * sc, ky + (py + dy) * kw); g.arc(cx + px * kw, ky + (py + dy) * kw, pr * kw * sc, 0, Math.PI * 2); }
        g.fill();
      }
      // An angry face: brows slanting down to the middle, eyes glaring down at you (flashing as it strikes), a frown.
      const fx0 = cx, fy = ky + 0.02 * kw, mad = W.hit && t < STRIKE + 0.25;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.fillStyle = mad ? '#fff3a0' : '#f4f6ff';
        g.beginPath(); g.ellipse(fx0 + s * 0.22 * kw, fy, 0.1 * kw, 0.075 * kw, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d1f2e';
        g.beginPath(); g.arc(fx0 + s * 0.19 * kw, fy + 0.025 * kw, 0.045 * kw, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#141522'; g.lineWidth = Math.max(2, 0.055 * kw);
        g.beginPath(); g.moveTo(fx0 + s * 0.36 * kw, fy - 0.15 * kw); g.lineTo(fx0 + s * 0.1 * kw, fy - 0.06 * kw); g.stroke();
      }
      g.strokeStyle = '#141522'; g.lineWidth = Math.max(2, 0.045 * kw);
      g.beginPath(); g.arc(fx0, fy + 0.27 * kw, 0.12 * kw, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      if (W.hit && t < STRIKE + 0.2 && Math.floor((t - STRIKE) * 30) % 3 !== 1) { // the bolt, flickering
        const pts = [[cx + r.range(-0.1, 0.1) * kw, ky + 0.35 * kw]], y1 = cy - css * 0.25, n = 6;
        for (let i = 1; i < n; i++) pts.push([cx + r.range(-0.22, 0.22) * size, pts[0][1] + ((y1 - pts[0][1]) * i) / n]);
        pts.push([cx, y1]);
        g.lineJoin = 'miter'; g.lineCap = 'round';
        for (const [col, w] of [['rgba(150,190,255,0.5)', 16], ['rgba(40,40,80,0.6)', 8], ['#fff8d6', 5]]) {
          g.strokeStyle = col; g.lineWidth = w;
          g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      }
      if (W.hit && t < STRIKE + 0.18) { // the flash where it hits
        const k = (t - STRIKE) / 0.18, rad = g.createRadialGradient(cx, cy, 0, cx, cy, size * 1.1);
        rad.addColorStop(0, 'rgba(255,252,220,' + (0.8 * (1 - k)).toFixed(3) + ')'); rad.addColorStop(1, 'rgba(255,252,220,0)');
        g.globalAlpha = 1; g.fillStyle = rad; g.fillRect(cx - size * 1.2, cy - size * 1.2, size * 2.4, size * 2.4);
      }
      g.restore();
    },
    // ...and once whole, a faint ring snaps out from it.
    drawFormed(css, k) {
      const g = this.renderer.ctx, dpr = this.renderer.dpr;
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 0.55 * (1 - k);
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.renderer.w / 2, this.renderer.h / 2, css * (0.5 + 0.35 * (1 - (1 - k) * (1 - k))), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    },
    // A fall into the void: a hit (unless shielded), then a bubble floats you back to the last solid ground you stood
    // on, like the bubble in Mario Galaxy. True if the hit lost the level.
    fall() {
      if (!this.shielded() && this.hurt()) return true;
      const b = this.ball, to = this.lastSafe || (this.maze ? this.maze.start : this.run.check), d = Math.hypot(to.x - b.x, to.y - b.y);
      this.fx.bubble = { a: { x: b.x, y: b.y }, b: { x: to.x, y: to.y }, t: 0, T: clamp(0.9 + d / 700, 1.1, 2.4) };
      this.input.takeGrab();
      MZ.Audio.play('bubble');
      this.emit('power');
      return false;
    },
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
      if (fx.storm) {
        const W = fx.storm;
        W.t += dt;
        if (!W.hit && W.t >= STRIKE) { W.hit = true; fx.shrink = ITEMS.shrink.dur; this.shakeT = Math.max(this.shakeT, 0.2); MZ.Audio.play('zap'); this.emit('power'); }
        if (W.t >= STORM) fx.storm = null;
      }
      for (const k of ['star', 'carpet', 'shrink', 'path']) {
        if (!(fx[k] > 0)) continue;
        fx[k] -= dt;
        if (fx[k] <= 0) { fx[k] = 0; MZ.Audio.play('expire'); this.emit('power'); }
      }
      if (fx.path > 0 && (this.pathT = (this.pathT || 0) - dt) <= 0) { this.pathT = 0.35; this.pathLine = this.pathRoute() || this.pathLine; } // it follows you
      const want = fx.shrink > 0 ? SHRINK : 1;
      if (this.scale > want) this.scale = Math.max(want, this.scale - dt * 2.5);
      else if (this.scale < want) {
        const was = this.scale, b = this.ball;
        this.scale = Math.min(want, this.scale + dt * 1.5);
        if (!fx.carpet && !fx.bullet && !fx.launch && this.hitAt(b.x, b.y) && !this.unstick()) this.scale = was; // no room yet
      }
    },
    // Remember the last spot on solid floor (not a vanishing bridge), with the whole picture on it: where a fall's
    // bubble takes you back to.
    noteSafe() {
      const b = this.ball;
      if (this.fx.carpet > 0 && this.hitAt(b.x, b.y)) return; // floating over the void
      const q = this.world.query(b.x, b.y, this.playT);
      if (q.seg && !q.seg.dyn && q.depth > 0) this.lastSafe = { x: b.x, y: b.y };
    },
    // Put the player on the nearest solid floor where the whole picture fits.
    rescue() {
      const b = this.ball, w = this.world, t = this.playT;
      const ok = (x, y) => { const q = w.query(x, y, t); return q.seg && !q.seg.dyn && q.depth > 0 && !this.hitAt(x, y); };
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

    // ----- Gauntlet gems: their own count, and every GEM_CHARM of them pays out at once -----
    gauntletGem() {
      const r = this.run, P = MZ.Save.progress;
      r.gems = (r.gems || 0) + 1;
      P.gauntletGems = (P.gauntletGems || 0) + 1;
      if (r.gems % GEM_CHARM === 0) this.gemCharm();
    },
    // What the next GEM_CHARM gems will give: a life; with lives unlimited or full, an Extra hit shield; with those
    // full too, an item (if the slot is free); else time.
    nextCharm() {
      const r = this.run;
      if (isFinite(r.lives) && r.lives < MAX_LIVES) return 'life';
      if (this.bonus < MAX_BONUS) return 'shield';
      if (!this.item && !this.roll) return 'item';
      return 'time';
    },
    gemCharm() {
      const what = this.nextCharm();
      if (what === 'life') { this.run.lives++; this.emit('bonus', 'Gems: extra life'); MZ.Audio.play('heal'); }
      else if (what === 'shield') { this.bonus++; this.emit('bonus', 'Gems: Extra hit'); MZ.Audio.play('heal'); }
      else if (what === 'item') { this.roll = { t: 0, id: this.pickItem() }; this.emit('bonus', 'Gems: an item'); MZ.Audio.play('box'); }
      else { this.clock += 10; this.emit('bonus', 'Gems: +10s'); MZ.Audio.play('item'); }
      this.emit('power');
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
      } else if (id === 'shrink') {
        fx.storm = { t: 0, hit: false, seed: hashInts(Math.floor(this.t * 1000), 0x57), size: this.box() * this.cam.zoom }; // the strike does the shrinking (the cloud keeps this size)
        MZ.Audio.play('storm');
      } else if (id === 'path') {
        const P = this.pathRoute();
        if (!P) { MZ.toast('No way to show from here', 1200); return false; }
        this.pathLine = P; this.pathT = 0.35;
        fx.path = ITEMS.path.dur;
      } else if (id === 'launch') {
        fx.launch = { t: 0, T: UP + AIR + DOWN, apex: clamp(Math.min(innerWidth, innerHeight) / APEX_VIEW / this.zoomTarget(), 0.02, 1), from: { x: this.ball.x, y: this.ball.y } };
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
        if (e.type === 'normal' || e.type === 'bridge') solid[r.a] = solid[r.b] = true;
        return r;
      });
      return { E, pos, adj, solid, id: (p) => ids.get(Math.round(p.x * 4) + ',' + Math.round(p.y * 4)) };
    },
    // Where on the corridors the player is: the nearest point on any of them ({r, s}: corridor and distance along it).
    nearestOnCorridor(g) {
      const b = this.ball;
      let at = null, bd = Infinity;
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
      return bd > 300 ? null : at;
    },
    // Shortest distances along the corridors from `at` (leaving by either end of its corridor), past what's passable
    // now: not shut doors (unless you carry their key), not switched-off bridges, and, with `gates`, one-way gates
    // only the way they point.
    corridorDists(g, at, gates) {
      const m = this.maze, closed = new Set(m ? m.doors.filter((d) => !d.open && !this.keysHeld.get(d.color)).map((d) => d.edge) : []);
      if (m && this.scale > SHRINK + 0.05) for (const q of m.squeezes || []) closed.add(q.edge);
      const shut = (e) => closed.has(e.id) || (e.type === 'switch' && (this.world.sw[e.sw.g] | 0) !== e.sw.on);
      const gateOn = new Map(gates && m ? m.gates.map((q) => [q.edge, g.id(m.nodes[q.from])]) : []); // edge -> the node it's entered from
      const n = g.pos.length, dist = new Float64Array(n).fill(Infinity), prev = new Array(n).fill(null), done = new Uint8Array(n);
      dist[at.r.a] = at.s; dist[at.r.b] = Math.min(dist[at.r.b], at.r.len - at.s);
      if (at.r.a === at.r.b) dist[at.r.a] = Math.min(at.s, at.r.len - at.s);
      for (;;) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0) break;
        done[u] = 1;
        for (const r of g.adj[u]) {
          if (shut(r.e)) continue;
          if (gateOn.has(r.e.id) && gateOn.get(r.e.id) !== u) continue;
          const v = r.a === u ? r.b : r.a;
          if (dist[u] + r.len < dist[v]) { dist[v] = dist[u] + r.len; prev[v] = r; }
        }
      }
      return { dist, prev };
    },
    // The polyline from the player along the corridors to junction `target` (nodeAt: where each junction falls on it).
    chainPoints(g, at, prev, target) {
      const b = this.ball, chain = [];
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
      return { pts, nodeAt, cum };
    },
    // The junction nearest GOAL (as the corridors go) that `dist` reaches: where to head when GOAL itself is shut off.
    nearGoal(g, dist) {
      const n = g.pos.length, target = g.id(this.maze.goal), dg = new Float64Array(n).fill(Infinity), dn = new Uint8Array(n);
      dg[target] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!dn[i] && dg[i] < Infinity && (u < 0 || dg[i] < dg[u])) u = i;
        if (u < 0) break;
        dn[u] = 1;
        for (const r of g.adj[u]) { const v = r.a === u ? r.b : r.a; if (dg[u] + r.len < dg[v]) dg[v] = dg[u] + r.len; }
      }
      let best = Infinity, at = -1;
      for (let i = 0; i < n; i++) if (dist[i] < Infinity && g.solid[i] && dg[i] < best) { best = dg[i]; at = i; }
      return at;
    },
    // Path: the way from here to GOAL along the corridors as they are now (not through doors you can't open, switched-off
    // bridges, or one-way gates the wrong way). If GOAL is shut off, the way to what opens it: the nearest key still
    // lying about, or a switch; else as close to GOAL as you can get. Endless: to the nearest unlit beacon.
    pathRoute() {
      const g = this.graph(), at = this.nearestOnCorridor(g);
      if (!at) return null;
      const { dist, prev } = this.corridorDists(g, at, true);
      let target = -1;
      if (this.maze) {
        target = g.id(this.maze.goal);
        if (!(dist[target] < Infinity)) target = this.opener(g, dist);
        if (target < 0) target = this.nearGoal(g, dist);
      } else target = this.nearestOf(g, dist, (this.beacons || []).filter((bc) => !bc.lit));
      if (target < 0 || !(dist[target] < Infinity)) return null;
      return this.chainPoints(g, at, prev, target);
    },
    // Of these spots, the junction nearest along the corridors (-1: none reachable).
    nearestOf(g, dist, list) {
      let best = -1;
      for (const p of list) { const i = g.id(p); if (i != null && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i; }
      return best;
    },
    // With GOAL shut off: what opens the way. The gap you hold the item for, else the nearest key still lying about,
    // switch, or item box whose item you don't have.
    opener(g, dist) {
      const m = this.maze, gapStarts = (m.gaps || []).filter((q) => this.item === q.item).map((q) => q.a);
      if (gapStarts.length) return this.nearestOf(g, dist, gapStarts);
      const boxes = (m.gboxes || []).filter((gb) => !gb.out && this.item !== gb.item);
      return this.nearestOf(g, dist, m.keys.filter((k) => !k.taken).concat(m.plates, boxes));
    },
    // Bullet: the route from here along the corridors, toward GOAL (stopping short of it), or in Endless outward, as far
    // as the run allows, finishing on a junction with solid floor. Shut doors and switched-off bridges stop it too: with
    // GOAL shut off it flies to what opens the way (the key, say).
    bulletRoute() {
      const g = this.graph(), at = this.nearestOnCorridor(g);
      if (!at) return null;
      const { dist, prev } = this.corridorDists(g, at, true), n = g.pos.length; // (never backwards through a one-way gate)
      let target = -1;
      if (this.maze) {
        target = g.id(this.maze.goal);
        if (dist[target] === Infinity) { // GOAL is behind a shut door or a missing bridge: to what opens the way (a key), else close
          target = this.opener(g, dist);
          if (target < 0) target = this.nearGoal(g, dist);
        }
      } else {
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
      const { pts, nodeAt, cum } = this.chainPoints(g, at, prev, target);
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
      if (fx.bubble) { // floating back: no steering, no pickups, then the bubble pops on solid ground
        const U = fx.bubble;
        U.t = Math.min(U.T, U.t + dt);
        const e = smooth(U.t / U.T);
        b.x = U.a.x + (U.b.x - U.a.x) * e;
        b.y = U.a.y + (U.b.y - U.a.y) * e;
        if (U.t < U.T) return;
        fx.bubble = null;
        this.popAtT = this.t;
        this.guardT = Math.max(this.guardT, GUARD);
        if (this.hitAt(b.x, b.y) && !this.unstick()) this.rescue(); // that ground changed meanwhile (a switch, say)
        this.noteSafe();
        this.input.takeGrab();
        MZ.Audio.play('pop');
        this.emit('power');
        return;
      }
      if (fx.bullet) {
        const B = fx.bullet;
        B.t += dt;
        const to = Math.min(B.len, B.s + BULLET_V * Math.min(1, 0.3 + B.t * 2.5) * dt);
        const n = Math.max(1, Math.ceil((to - B.s) / (this.box() * 0.25)));
        const from = B.s;
        for (let i = 1; i <= n; i++) {
          const q = this.along(B.pts, B.cum, from + ((to - from) * i) / n);
          if (q.x !== b.x || q.y !== b.y) B.dir = Math.atan2(q.y - b.y, q.x - b.x);
          if (this.maze) for (const d of this.maze.doors) if (!d.open && MZ.segsCross(b.x, b.y, q.x, q.y, d.ax, d.ay, d.bx, d.by)) this.openDoor(d); // flying through with its key
          b.x = q.x; b.y = q.y;
          B.s = from + ((to - from) * i) / n;
          if (this.pickups()) return;
        }
        if (B.s >= B.len) { fx.bullet = null; this.land(); }
        return;
      }
      const L = fx.launch;
      L.t = Math.min(L.T, L.t + dt);
      const cfg = S().controls, u = this.input.vector(), sg = cfg.invert !== this.mod('mirror') ? 1 : -1, k = clamp(cfg.speed || 1, 0.5, 2) / this.cam.zoom;
      const kz = KEY_SPEED / this.liftZoom(), gl = this.glideVec(), gz = (GLIDE * clamp(cfg.speed || 1, 0.5, 2) * (this.mod('mirror') ? -1 : 1)) / this.liftZoom(); // keys and Glide keep their speed on screen
      b.x += grab.x * sg * k + u.x * kz * dt + gl.x * gz * dt;
      b.y += grab.y * sg * k + u.y * kz * dt + gl.y * gz * dt;
      const ox = b.x - L.from.x, oy = b.y - L.from.y, od = Math.hypot(ox, oy); // no further than the clouds
      if (od > REACH) { b.x = L.from.x + (ox / od) * REACH; b.y = L.from.y + (oy / od) * REACH; }
      if (L.t < L.T) return;
      // Down where you are. On the board, fine (a small nudge clears an edge); in the void, it's a fall: a hit, then the
      // nearest floor.
      fx.launch = null;
      this.cam.zoom = this.zoomTarget();
      this.input.takeGrab();
      MZ.Audio.play('land');
      this.emit('power');
      if (this.hitAt(b.x, b.y) && !this.unstick()) { this.fall(); return; }
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
    unstick(far) {
      const b = this.ball, W = this.box();
      for (let r = W * 0.02; r <= W * (far || 0.2); r += W * 0.02) {
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
          if (this.mode === 'gauntlet') this.gauntletGem();
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
      if (this.maze) {
        const m = this.maze;
        // Keys go in your pocket; a door of their colour opens when you bump into it.
        for (const k of m.keys) {
          if (k.taken || !this.touches(k.x, k.y, MZ.Levels.KEY_R)) continue; // the key's drawn token
          k.taken = true;
          this.keysHeld.set(k.color, (this.keysHeld.get(k.color) || 0) + 1);
          MZ.Audio.play('key');
          this.emit('power');
        }
        // Switches flip their bridges each time you step on (not while you stand there).
        for (const pl of m.plates) {
          const on = this.touches(pl.x, pl.y, pl.r * 0.6);
          if (on && !pl.down) { this.world.sw[pl.g] = (this.world.sw[pl.g] | 0) ^ 1; pl.pressAt = this.t; MZ.Audio.play('switch'); }
          pl.down = on;
        }
        // Portals: step on one, come out of its twin (which won't send you back until you've stepped off it).
        if (this.warpLock && !this.touches(this.warpLock.x, this.warpLock.y, this.warpLock.r * 0.45)) this.warpLock = null;
        if (!this.warpLock) {
          for (const pt of m.portals) {
            const [A, B] = this.touches(pt.a.x, pt.a.y, pt.r * 0.45) ? [pt.a, pt.b] : this.touches(pt.b.x, pt.b.y, pt.r * 0.45) ? [pt.b, pt.a] : [];
            if (!A) continue;
            this.ball.x = B.x; this.ball.y = B.y;
            this.warpLock = { x: B.x, y: B.y, r: pt.r };
            this.warpAt = this.t; this.warpColor = pt.color;
            this.warped = true;
            this.vel.x = this.vel.y = 0;
            MZ.Audio.play('warp');
            break;
          }
        }
      }
      // Item boxes (puzzles): always there (Time Trial and boxes off too), always give their item (instead of what you
      // hold), and come back a moment after that item is spent, so a wasted one can be fetched again.
      if (this.maze && this.maze.gboxes) {
        const fx = this.fx;
        for (const gb of this.maze.gboxes) {
          if (gb.out) {
            const busy = this.item === gb.item || (gb.item === 'carpet' && fx.carpet > 0) || (gb.item === 'launch' && !!fx.launch) || (gb.item === 'shrink' && (!!fx.storm || fx.shrink > 0));
            if (busy) gb.back = null;
            else if (gb.back == null) gb.back = this.runT + 1.5;
            else if (this.runT >= gb.back) { gb.out = false; gb.bornAt = this.runT; }
            continue;
          }
          if (!this.touches(gb.x, gb.y, BOX_R + 2)) continue;
          gb.out = true; gb.back = null; gb.gotAt = this.runT;
          this.roll = null; this.item = gb.item;
          MZ.Audio.play('shatter'); MZ.Audio.play('item');
          this.emit('bonus', ITEMS[gb.item].name);
          this.emit('power');
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
      const flow = ++this.flow; // a newer win or loss (or a quit) takes over from this one
      if (reason === 'fall') MZ.Save.progress.stats.falls++;
      this.fx = {};
      this.roll = null;
      this.setState('fx');
      this.emit('lose', reason);
      this.emit('power');
      MZ.Audio.play('lose');
      MZ.Save.saveProgress();
      if (this.shatter()) { // the pieces fly before the lose screen covers them
        await new Promise((res) => setTimeout(res, BREAK * 850));
        if (this.state !== 'fx' || this.flow !== flow) return;
      }
      await FX.play('lose');
      if (this.state !== 'fx' || this.flow !== flow) return; // quit meanwhile
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
      const flow = ++this.flow;
      if (this.roll) this.endRoll(); // a spin still going lands now, so the slot shows what you really got
      this.setState('fx');
      MZ.Audio.play('win');
      const st = MZ.Save.progress.stats;
      st.wins++;
      if (this.mode !== 'gauntlet') st.gems += this.gemsTaken; // Gauntlet gems are counted apart (see gauntletGem)
      const res = this.results(); // saved before the win media, so closing the tab during it keeps the clear
      await FX.play('win');
      if (this.state !== 'fx' || this.flow !== flow) return;
      if (this.mode === 'gauntlet') {
        this.run.cleared++;
        const G = MZ.Save.progress.gauntlet, k = this.run.key;
        if (this.run.cleared > (G[k] || 0)) { G[k] = this.run.cleared; MZ.Save.saveProgress(); }
        if (this.run.cleared % 5 === 0 && isFinite(this.run.lives) && this.run.lives < 5) { this.run.lives++; MZ.toast('Extra life'); }
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
      }
      MZ.Save.saveProgress();
      return res;
    },

    gameOver() {
      const P = MZ.Save.progress;
      let res;
      if (this.mode === 'gauntlet') {
        res = { mode: 'gauntlet', score: this.run.cleared, best: P.gauntlet[this.run.key] || 0, newBest: this.run.cleared > this.run.prevBest, style: this.run.style, diff: this.run.diff, gems: this.run.gems || 0 };
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
      if (q.seg && !q.seg.dyn && !this.hitAt(b.x, b.y)) {
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
        const m = MZ.Levels.build(MZ.Levels.levelParams(Math.max(4, lv)));
        this.attractMaze = m;
        this.attractWorld = MZ.World.fromMaze(m);
        this.attractPts = []; // along the corridors as drawn (junction to junction would cut across curves and void)
        for (let i = 0; i + 1 < m.mainPath.length; i++) {
          const u = m.mainPath[i], v = m.mainPath[i + 1], e = m.edges.find((x) => (x.a === u && x.b === v) || (x.a === v && x.b === u));
          const P = !e ? [m.nodes[u], m.nodes[v]] : e.a === u ? e.pts : e.pts.slice().reverse();
          for (let k = this.attractPts.length ? 1 : 0; k < P.length; k++) this.attractPts.push(P[k]);
        }
        if (!this.attractPts.length) this.attractPts.push(m.start);
        this.attractCum = [0];
        for (let i = 1; i < this.attractPts.length; i++) this.attractCum.push(this.attractCum[i - 1] + Math.hypot(this.attractPts[i].x - this.attractPts[i - 1].x, this.attractPts[i].y - this.attractPts[i - 1].y));
      }
      const pts = this.attractPts, cum = this.attractCum, sp = S().display.reducedMotion ? 0 : 24; // world units per second
      this.attract = (this.attract + dt * sp) % Math.max(1, cum[cum.length - 1]);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < this.attract) i++;
      const A = pts[i - 1] || pts[0], B = pts[i] || A, f = clamp((this.attract - (cum[i - 1] || 0)) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
      // Snaps into place on the first frames of the menu, then glides.
      const k = this.stateT < 0.1 ? 1 : 1 - Math.exp(-dt * 1.5);
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
        mech: maze && maze.doors ? maze : null, // doors and keys, switches, gates, platforms, portals, ice
        stonesT: pt, // (cyclone stones run on the play clock)
        path: !menu && fx.path > 0 && this.pathLine ? { pts: this.pathLine.pts, a: Math.min(1, (ITEMS.path.dur - fx.path) * 4, fx.path * 1.5) } : null,
        boxes: boxesOn ? this.boxes.filter((x) => x.takenAt == null || this.runT - x.takenAt >= BOX_BACK) : null,
        boxAge: (x) => (x.takenAt == null ? 9 : this.runT - x.takenAt - BOX_BACK),
        shards: (boxesOn ? this.boxes.filter((x) => x.takenAt != null && this.runT - x.takenAt < SHATTER).map((x) => ({ x: x.x, y: x.y, k: (this.runT - x.takenAt) / SHATTER })) : [])
          .concat(!menu && maze && maze.gboxes ? maze.gboxes.filter((x) => x.gotAt != null && this.runT - x.gotAt < SHATTER).map((x) => ({ x: x.x, y: x.y, k: (this.runT - x.gotAt) / SHATTER, gold: true })) : []),
        runT: this.runT,
        // Under the player: a Launch's shadow on the ground, the magic carpet (flickering as it runs out), the Bullet.
        under: showPlayer && this.state !== 'menu' ? {
          x: b.x, y: b.y, W: this.box(), lift: this.lift(),
          carpet: fx.carpet > 0 ? (fx.carpet > 1.5 || Math.floor(fx.carpet * 8) % 2 ? 1 : 0.35) : 0,
          shield: this.bonus, // Extra hits: gold rings around the player
          burst: this.hitAtT != null && this.t - this.hitAtT < 0.45 ? (this.t - this.hitAtT) / 0.45 : null, // the shield breaking
          crackle: this.hp < HEARTS && !this.recharging() && this.state === 'play' && !fx.bubble ? this.t : null, // ...and fizzing while it's down
          bubble: fx.bubble ? fx.bubble.t / fx.bubble.T : null,
          pop: this.popAtT != null && this.t - this.popAtT < 0.35 ? (this.t - this.popAtT) / 0.35 : null,
          bullet: fx.bullet ? fx.bullet.dir : null,
          warp: this.warpAt != null && this.t - this.warpAt < 0.5 ? { k: (this.t - this.warpAt) / 0.5, color: this.warpColor } : null,
        } : null,
      });
      if (!menu && this.maze && this.maze.dark) this.renderer.drawDark(this.cam, b, this.maze.dark); // only a small circle of light
      if (fx.launch && !menu) this.renderer.drawClouds(this.cam, fx.launch.from, REACH, this.lift(), t); // how far a Launch can go

      // Player sprite: the user's media, upright and still at the centre of the screen (up in the air on a Launch).
      const pl = MZ.$('#player');
      if (showPlayer) {
        const lift = this.lift(), z = lift ? this.zoomTarget() * (1 + HOP_GROW * lift) : this.cam.zoom;
        const css = this.box() * z, size = css.toFixed(1) + 'px';
        this.sprite.update(performance.now(), false, css, Math.min(window.devicePixelRatio || 1, s.display.quality));
        pl.hidden = false;
        pl.style.width = pl.style.height = size;
        pl.style.transform = lift ? 'translate(-50%,calc(-50% - ' + (lift * Math.min(innerWidth, innerHeight) * HOP).toFixed(1) + 'px))' : 'translate(-50%,-50%)';
        if (this.pieces) this.drawPieces(css);
        if (fx.storm) this.drawStorm(css, fx.storm);
        if (this.glide && !this.pieces) this.drawGlide(css, this.glide);
        if (this.formedAt != null && this.t - this.formedAt < 0.3) this.drawFormed(css, (this.t - this.formedAt) / 0.3);
        pl.style.visibility = this.pieces ? 'hidden' : ''; // in pieces: those are drawn instead
        // Health shows on the picture only: on a hit the shield flares and the picture jolts; it blinks while the edges
        // hold, stays faded and drained of colour while the shield is down, and fills back in with a shimmer as it
        // recharges.
        const flare = this.state === 'play' && this.hitAtT != null && this.t - this.hitAtT < 0.3, look = this.shieldLook();
        const cls = (fx.star > 0 ? ' invincible' + (fx.star < 1.5 ? ' ending' : '') : '') + (this.guardT > 0 && this.state === 'play' ? ' guard' : '') +
          (fx.bullet ? ' bullet' : '') + (fx.bubble ? ' bubbled' : '') + (flare ? ' flare' : '') + (this.recharging() ? ' recharge' : '') + (look < 1 ? ' down' : '');
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
      if (!menu && view && mm !== 'off' && !this.mod('nomap')) {
        mmEl.hidden = false;
        if (this.minimap.dirty) {
          // Sized once it's actually on screen (it's hidden while a level is built).
          this.minimap.dirty = false;
          if (this.minimap.size() && this.maze) { this.minimap.setMaze(this.maze); this.revealAll(); }
        }
        if (this.mode === 'endless') this.minimap.drawRadar(this.world, b, this.beacons, view, this.seenNear(b.x, b.y, 1000).concat([view]), boxesOn ? this.boxes : null);
        else this.minimap.draw(b, this.maze && this.maze.goal, this.gems, view, this.checkpoints, boxesOn ? this.boxes : null, this.maze, fx.path > 0 && this.pathLine ? this.pathLine.pts : null);
      } else mmEl.hidden = true;
      this.emit('frame');
    },
  });

  MZ.Game = Game;
})();
