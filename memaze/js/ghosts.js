/* Memaze — ghost racing, in Time Trial only: every run is recorded; your fastest clear of a level replays as a
 * see-through copy of your picture, on the same clock as you. */
(function () {
  'use strict';
  const MZ = window.MZ, G = MZ.Game, Gen = MZ.Gen;
  const S = () => MZ.Save.settings;
  const DT = 0.1;          // seconds between recorded positions
  const MAX_N = 9000;      // 15 minutes of recording at most
  const KEEP = 80;         // ghosts kept; the least recently raced go first
  const SNAP = 150;        // a jump this far between samples is a checkpoint respawn: no sliding across the void
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const boxWorld = () => 2 * Gen.BALL_R * clamp(S().player.size, 0.6, 1.25);

  // ----- storage -----
  let db = null;
  const load = () => db || (db = MZ.store.load('ghosts', {}) || {});
  function persist() {
    const d = load();
    for (let tries = 0; tries < 6; tries++) {
      if (MZ.store.save('ghosts', d)) return;
      const keys = Object.keys(d).sort((a, b) => (d[a].at || 0) - (d[b].at || 0)); // full: drop the oldest half
      if (keys.length <= 1) return;
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => delete d[k]);
    }
  }
  // One ghost per maze (any change to the maze makes a new key); only Time Trial records and shows them.
  function keyOf(g) {
    if (!g.maze || g.mode !== 'trial') return null;
    const m = g.maze;
    return [m.seed, m.nodes.length, m.edges.length, Math.round(m.start.x), Math.round(m.start.y), Math.round(m.goal.x), Math.round(m.goal.y)].join('.');
  }
  function encode(xs, ys) {
    const out = new Array(xs.length * 2);
    let px = 0, py = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = Math.round(xs[i]), y = Math.round(ys[i]);
      out[2 * i] = x - px; out[2 * i + 1] = y - py;
      px = x; py = y;
    }
    return out;
  }
  function decode(rec) {
    const p = rec.p, n = p.length / 2, xs = new Float32Array(n), ys = new Float32Array(n);
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += p[2 * i]; y += p[2 * i + 1]; xs[i] = x; ys[i] = y; }
    return { key: null, time: rec.t, xs, ys, n };
  }

  // ----- recording -----
  G.ghost = null; G.ghostKey = null; G.rec = null;

  const beginLevel = G.beginLevel;
  G.beginLevel = function (start, timeLimit, fresh) {
    beginLevel.apply(this, arguments);
    const key = keyOf(this);
    this.rec = key ? { key, xs: [start.x], ys: [start.y] } : null;
    if (key !== this.ghostKey || !this.ghost) {
      const r = key && load()[key];
      this.ghost = r ? decode(r) : null;
      this.ghostKey = key;
    }
  };

  const step = G.step;
  G.step = function (dt) {
    step.call(this, dt);
    const r = this.rec;
    if (!r || r.xs.length >= MAX_N) return;
    while (r.xs.length * DT <= this.elapsed && r.xs.length < MAX_N) { r.xs.push(this.ball.x); r.ys.push(this.ball.y); }
  };

  // The clear: the last position lands exactly on the finishing time, and a faster run replaces the ghost.
  const results = G.results;
  G.results = function () {
    const res = results.apply(this, arguments);
    const r = this.rec;
    this.rec = null;
    if (!r || r.xs.length >= MAX_N || res.time == null) return res;
    while (r.xs.length * DT <= res.time) { r.xs.push(this.ball.x); r.ys.push(this.ball.y); }
    const d = load(), prev = d[r.key];
    if (prev && prev.t <= res.time) { prev.at = Date.now(); persist(); return res; }
    d[r.key] = { t: res.time, at: Date.now(), p: encode(r.xs, r.ys) };
    const keys = Object.keys(d);
    if (keys.length > KEEP) keys.sort((a, b) => d[a].at - d[b].at).slice(0, keys.length - KEEP).forEach((k) => delete d[k]);
    persist();
    this.ghost = decode(d[r.key]);
    this.ghostKey = r.key;
    MZ.toast(prev ? 'Beat your ghost by ' + (prev.t - res.time).toFixed(2) + ' s' : 'Ghost saved: race it next time');
    return res;
  };

  // Where the ghost is at the player's time: {x, y, alpha}, or null.
  G.ghostAt = function (t) {
    const g = this.ghost;
    if (!g || !this.maze || this.ghostKey !== keyOf(this) || g.n < 2) return null;
    const fade = t > g.time ? 1 - (t - g.time) / 1.2 : 1; // at the goal it fades out
    if (fade <= 0) return null;
    const f = Math.min(t / DT, g.n - 1), i = Math.min(Math.floor(f), g.n - 2), k = Math.min(1, f - i);
    const ax = g.xs[i], ay = g.ys[i], bx = g.xs[i + 1], by = g.ys[i + 1];
    if (Math.hypot(bx - ax, by - ay) > SNAP) return k < 0.5 ? { x: ax, y: ay, a: fade } : { x: bx, y: by, a: fade };
    return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, a: fade };
  };

  const reset = MZ.Save.reset;
  MZ.Save.reset = function () {
    db = {}; MZ.store.remove('ghosts'); G.ghost = null; G.ghostKey = null;
    return reset.apply(this, arguments);
  };

  // ----- drawing: a see-through copy of the player's picture, and an arrow at the screen edge when it's off screen -----
  const RP = MZ.Renderer.prototype, draw = RP.draw;
  RP.draw = function (s) {
    draw.call(this, s);
    const g = MZ.Game;
    if (!s.world || s.world !== g.world || g.state === 'menu' || g.state === 'boot') return;
    const p = g.ghostAt(g.elapsed);
    if (!p) return;
    const ctx = this.ctx, W = boxWorld(), src = g.sprite && g.sprite.canvas, cam = s.cam;
    ctx.save();
    ctx.globalAlpha = 0.42 * p.a;
    if (src && src.width > 0 && src.height > 0) {
      ctx.filter = 'grayscale(0.7) brightness(1.15)';
      ctx.drawImage(src, p.x - W / 2, p.y - W / 2, W, W);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, W * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    const sp = this.toScreen(cam, p.x, p.y), w = this.w, h = this.h, r = W * cam.zoom * 0.5;
    if (sp.x > -r && sp.x < w + r && sp.y > -r && sp.y < h + r) return;
    const cx = w / 2, cy = h / 2, dx = sp.x - cx, dy = sp.y - cy;
    const padX = 30, padTop = 96, padBot = 30;
    const sc = Math.min(dx > 0 ? (w - padX - cx) / dx : dx < 0 ? (padX - cx) / dx : Infinity, dy > 0 ? (h - padBot - cy) / dy : dy < 0 ? (padTop - cy) / dy : Infinity);
    let ex = cx + dx * sc, ey = cy + dy * sc;
    const ang = Math.atan2(dy, dx), mm = MZ.$('#minimap');
    if (mm && !mm.hidden) { // keep the arrow off the map
      const b = mm.getBoundingClientRect(), gap = 24;
      if (ex > b.left - gap && ex < b.right + gap && ey > b.top - gap && ey < b.bottom + gap) {
        if (Math.abs(ex - (b.left - gap)) < Math.abs(ey - (b.top - gap))) ex = b.left - gap; else ey = b.top - gap;
      }
    }
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 0.85 * p.a;
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(16,13,32,0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.rotate(ang);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  // ----- HUD: the time to beat, under par; red once the ghost has finished -----
  const hudGhost = () => MZ.$('#hud-ghost');
  let last = null;
  G.on('frame', () => {
    const el = hudGhost();
    if (!el) return;
    const g = MZ.Game, show = g.ghost && g.maze && g.ghostKey === keyOf(g) && g.state !== 'menu';
    const txt = show ? 'Ghost ' + MZ.fmtClock(g.ghost.time) : '';
    const late = !!(show && g.elapsed > g.ghost.time);
    const k = txt + late;
    if (k === last) return;
    last = k;
    el.textContent = txt;
    el.classList.toggle('late', late);
  });
})();
