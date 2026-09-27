// Lull — the window rolled up into its title bar (a window shade), and the idle pieces that drift along it meanwhile.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const CHEVRON_UP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.8L8 6.3l3.5 3.5"/></svg>';
  const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.3L8 9.8l3.5-3.5"/></svg>';

  // ---- the idle bar --------------------------------------------------------------------------------------------------
  //
  // Tetris lying on its side: four rows along the bar, "down" is to the right. Pieces drift in from the left, a few
  // in flight at once, pick their lane and turn as they near the stack by the expand button, and settle; a full column
  // glows softly and goes, and the stack slides over. It plays itself forever and never tops out (if it ever grew past
  // half the bar it would fade out and start again).

  const ROWS = 4;
  const SPEED = 4.5; // cells per second
  const GAP = 12; // columns between pieces in flight
  const COMMIT = 7; // columns from the stack where a piece chooses its spot
  const GLOW = 0.7; // seconds a clearing column glows
  const IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  /** A piece's rotation as [col, row] cells from its top-left, and its size. */
  function shape(id, rot) {
    const t = L.Pieces.get(id), b = L.Pieces.boundsOf(t.rots[rot]);
    const cells = t.rots[rot].map(([x, y]) => [x - b.minX, b.maxY - y]);
    return { cells, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1, color: t.color };
  }

  class BarIdle {
    constructor(canvas, getLook, isReduced) {
      this.cv = canvas;
      this.getLook = getLook;
      this.isReduced = isReduced;
      this.running = false;
      this.raf = 0;
      this.last = 0;
      this.frames = 0;
      this.cols = 0;
      this.seed = 1 + Math.floor(Math.random() * 1e6);
      if (root.ResizeObserver) new ResizeObserver(() => { if (this.running) { this.resize(); this.draw(); } }).observe(canvas);
    }

    rand() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

    nextId() {
      if (!this.bag || !this.bag.length) {
        this.bag = IDS.slice();
        for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      }
      return this.bag.pop();
    }

    /** Sizes the canvas to its box; a new column count starts a fresh well, played ahead so it is never empty. */
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
      this.dpr = dpr; this.w = w; this.h = h;
      this.s = Math.max(4, Math.floor((h - 12) / ROWS));
      this.top = Math.round((h - this.s * ROWS) / 2);
      const cols = Math.max(8, Math.floor((w - 16) / this.s));
      this.left = w - 4 - cols * this.s;
      if (cols !== this.cols) this.reset(cols);
    }

    reset(cols) {
      this.cols = cols;
      this.grid = Array.from({ length: cols }, () => new Array(ROWS).fill(null));
      this.flying = [];
      this.clearing = null;
      this.fade = 0;
      this.nextAt = 0;
      this.t = 0;
      // Play a while unseen: pieces spread along the bar and a small stack already there.
      for (let i = 0; i < 40 * 30; i++) this.step(1 / 30);
    }

    fits(cells, x, y) {
      for (const [cx, cy] of cells) {
        const gx = x + cx, gy = y + cy;
        if (gy < 0 || gy >= ROWS || gx >= this.cols) return false;
        if (gx >= 0 && this.grid[gx][gy]) return false;
      }
      return true;
    }

    /** How far right a shape slides in a lane before it rests. */
    landing(sh, y) {
      let x = -sh.w;
      while (this.fits(sh.cells, x + 1, y)) x++;
      return x;
    }

    /** The leftmost filled column (the stack's surface), or the wall. */
    surface() {
      for (let x = 0; x < this.cols; x++) if (this.grid[x].some(Boolean)) return x;
      return this.cols;
    }

    /** The best spot for a piece: full columns first, then few holes, a short and even stack; a little chance. */
    choose(id) {
      let best = null;
      for (let rot = 0; rot < (id === 'O' ? 1 : 4); rot++) {
        const sh = shape(id, rot);
        for (let y = 0; y + sh.h <= ROWS; y++) {
          const x = this.landing(sh, y);
          if (x < 0) continue;
          const g = this.grid.map((c) => c.slice());
          for (const [cx, cy] of sh.cells) g[x + cx][y + cy] = 1;
          let full = 0;
          for (let c = 0; c < this.cols; c++) if (g[c].every(Boolean)) full++;
          const rest = g.filter((c) => !c.every(Boolean));
          const depth = [];
          let holes = 0;
          for (let r = 0; r < ROWS; r++) {
            let seen = false, d = 0;
            for (let c = 0; c < rest.length; c++) {
              if (rest[c][r]) seen = true;
              else if (seen) holes++;
              if (!seen) d++;
            }
            depth.push(rest.length - d);
          }
          let bump = 0;
          for (let r = 1; r < ROWS; r++) bump += Math.abs(depth[r] - depth[r - 1]);
          const score = full * 6 - holes * 5 - Math.max(...depth) * 1.2 - bump * 0.7 + this.rand() * 0.6;
          if (!best || score > best.score) best = { score, rot, y, sh };
        }
      }
      return best;
    }

    spawn() {
      const id = this.nextId(), rot = Math.floor(this.rand() * 4);
      const sh = shape(id, rot);
      const y = Math.floor(this.rand() * (ROWS - sh.h + 1));
      this.flying.push({ id, sh, x: -sh.w - 1, y, dy: y, target: null });
    }

    step(dt) {
      this.t += dt;
      if (this.fade > 0) {
        this.fade += dt;
        if (this.fade > 1.2) { this.grid = this.grid.map(() => new Array(ROWS).fill(null)); this.fade = 0; }
        return;
      }
      if (this.clearing) {
        this.clearing.t += dt;
        if (this.clearing.t >= GLOW) this.collapseColumns();
      }
      for (const col of this.grid) for (const c of col) if (c && c.off > 0) c.off = Math.max(0, c.off - dt * 10);
      // Spawn when the last piece has come far enough in.
      const lastP = this.flying[this.flying.length - 1];
      if (!lastP || lastP.x >= -lastP.sh.w - 1 + GAP) this.spawn();
      const surf = this.surface();
      for (const p of this.flying.slice()) {
        p.x += SPEED * dt;
        if (!p.target && p.x + p.sh.w >= surf - COMMIT) {
          const c = this.choose(p.id);
          if (!c) { this.fade = 0.001; this.flying = []; return; }
          p.target = c;
          p.sh = c.sh;
          p.x = Math.min(p.x, this.landing(c.sh, c.y));
          p.from = p.dy; p.tween = 0;
        }
        if (p.target) {
          p.tween = Math.min(1, p.tween + dt * 1.6);
          const e = p.tween * p.tween * (3 - 2 * p.tween);
          p.dy = p.from + (p.target.y - p.from) * e;
          const land = this.landing(p.sh, p.target.y);
          if (p.x >= land) this.lock(p, land);
        }
      }
      if (this.surface() < this.cols / 2) { this.fade = 0.001; this.flying = []; }
    }

    lock(p, x) {
      this.flying.splice(this.flying.indexOf(p), 1);
      const color = p.sh.color;
      for (const [cx, cy] of p.sh.cells) this.grid[x + cx][p.target.y + cy] = { color, off: 0 };
      if (!this.clearing) {
        const cols = [];
        for (let c = 0; c < this.cols; c++) if (this.grid[c].every(Boolean)) cols.push(c);
        if (cols.length) this.clearing = { cols, t: 0 };
      }
    }

    /** The glowing columns go; everything to their left slides right into the gap. */
    collapseColumns() {
      const gone = new Set(this.clearing.cols);
      this.clearing = null;
      const kept = [];
      for (let c = 0; c < this.cols; c++) if (!gone.has(c)) kept.push(this.grid[c]);
      const empty = this.cols - kept.length;
      const next = Array.from({ length: empty }, () => new Array(ROWS).fill(null)).concat(kept);
      // Each kept column slides right by the cleared columns to its right.
      let shift = 0;
      for (let c = this.cols - 1; c >= 0; c--) {
        if (gone.has(c)) { shift++; continue; }
        for (const cell of this.grid[c]) if (cell) cell.off += shift;
      }
      this.grid = next;
      // Anything else now full clears next.
      const cols = [];
      for (let c = 0; c < this.cols; c++) if (this.grid[c].every(Boolean)) cols.push(c);
      if (cols.length) this.clearing = { cols, t: 0 };
    }

    draw() {
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, this.w, this.h);
      const look = this.getLook();
      const th = look.theme || {};
      const s = this.s, top = this.top, left = this.left;
      // The well: a recessed lane the length of the bar, like the tabs' track.
      L.Render.rr(ctx, left - 3.5, top - 2.5, this.cols * s + 6, ROWS * s + 5, 6);
      ctx.fillStyle = th.well || 'rgba(0,0,0,0.3)'; ctx.fill();
      ctx.strokeStyle = th.grid || 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(left, top - 2, this.cols * s + 2, ROWS * s + 4); ctx.clip();
      const fadeA = this.fade > 0 ? Math.max(0, 1 - this.fade / 1.2) : 1;
      const glowing = this.clearing ? new Set(this.clearing.cols) : null;
      const gt = this.clearing ? this.clearing.t / GLOW : 0;
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < ROWS; r++) {
          const cell = this.grid[c][r];
          if (!cell) continue;
          const a = glowing && glowing.has(c) ? Math.max(0, 1 - gt * 1.3) : 1;
          if (a > 0) L.Render.drawCell(ctx, look.skin, look.colors[cell.color], left + (c - cell.off) * s, top + r * s, s, a * fadeA);
        }
      }
      for (const p of this.flying) {
        // Pieces come in out of nothing over the first few columns.
        for (const [cx, cy] of p.sh.cells) {
          const a = Math.max(0, Math.min(1, (p.x + cx) / 3)) * fadeA;
          if (a > 0) L.Render.drawCell(ctx, look.skin, look.colors[p.sh.color], left + (p.x + cx) * s, top + (p.dy + cy) * s, s, a);
        }
      }
      ctx.restore();
      if (glowing) {
        // A soft light where the column was: up and gone in the time the cells fade.
        const a = Math.sin(Math.min(1, gt) * Math.PI) * 0.75;
        for (const c of glowing) {
          const x = left + c * s + s / 2;
          const g = ctx.createRadialGradient(x, top + ROWS * s / 2, 0, x, top + ROWS * s / 2, s * 2.6);
          g.addColorStop(0, L.Render.rgba(th.accent || '#9ad', a));
          g.addColorStop(1, L.Render.rgba(th.accent || '#9ad', 0));
          ctx.fillStyle = g;
          ctx.fillRect(x - s * 3, 0, s * 6, this.h);
        }
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.resize();
      this.draw();
      this.last = performance.now();
      const loop = (t) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        if (document.hidden) { this.last = t; return; }
        // About 30 fps; with reduced motion the bar holds still.
        if (t - this.last < 32 || this.isReduced()) return;
        const dt = Math.min(0.1, (t - this.last) / 1000);
        this.last = t;
        this.step(dt);
        this.draw();
        this.frames++;
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  // ---- collapsing and expanding ----------------------------------------------------------------------------------------

  const Collapse = {
    on: false,
    idle: null,

    init(app) {
      this.app = app;
      const btn = document.getElementById('btn-collapse');
      btn.addEventListener('click', () => this.toggle());
      // Double-clicking the empty bar rolls the window up or down (in the app the panel sees that click and says so).
      document.getElementById('titlebar').addEventListener('dblclick', (e) => {
        const t = e.target;
        if (!t || !t.closest || t.closest('button, input') || !t.closest('[data-drag]')) return;
        e.preventDefault();
        this.toggle();
      });
      this.idle = new BarIdle(document.getElementById('bar-idle'), () => app.look(),
        () => app.settings.motion === 'reduced' || !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches));
      this.set(!!app.state.collapsed, true);
    },

    toggle() { this.set(!this.on); },

    set(on, first) {
      const app = this.app;
      if (on === this.on && !first) return;
      this.on = on;
      app.state.collapsed = on;
      if (!first) app.store.touch();
      if (on) {
        // Like switching away from the tab: Classic pauses, the music stops, the factory runs on unseen.
        if (app.tab === 'classic') { app.modes.classic.togglePause(true); L.Music.stop(); }
        if (app.tab === 'factory') app.modes.factory.hide();
        app.keys && app.keys.releaseAll();
        const tip = document.querySelector('#app > .tip');
        if (tip) tip.classList.add('hidden');
      }
      document.body.classList.toggle('collapsed', on);
      const btn = document.getElementById('btn-collapse');
      btn.innerHTML = on ? CHEVRON_DOWN : CHEVRON_UP;
      btn.setAttribute('aria-label', on ? 'Expand' : 'Collapse');
      btn.setAttribute('aria-expanded', String(!on));
      btn.dataset.tip = on ? 'Expand' : 'Collapse';
      if (on) this.idle.start();
      else {
        this.idle.stop();
        if (app.tab === 'factory' && !first) app.modes.factory.show();
        app.onResize();
      }
      L.native.post('collapse', { on, height: Math.round(document.getElementById('app').getBoundingClientRect().height), animate: !first });
      app.postDragRegions();
    },
  };

  // Its key, listed after the tabs' in Settings ▸ Keys.
  if (L.KEY_HELP) {
    const at = L.KEY_HELP.findIndex(([k]) => /^⌘1/.test(k));
    L.KEY_HELP.splice(at < 0 ? L.KEY_HELP.length : at + 1, 0, ['⌘J', 'Collapse into the title bar, or expand']);
  }

  L.Collapse = Collapse;
  L.BarIdle = BarIdle;
})(typeof globalThis !== 'undefined' ? globalThis : this);
