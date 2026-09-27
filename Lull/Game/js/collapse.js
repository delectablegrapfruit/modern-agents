// Lull — the window rolled up into its title bar (a window shade), and the idle pieces that drift along it meanwhile.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const CHEVRON_UP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.8L8 6.3l3.5 3.5"/></svg>';
  const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.3L8 9.8l3.5-3.5"/></svg>';

  // ---- the idle bar --------------------------------------------------------------------------------------------------
  //
  // Pieces on a march: four lanes along the bar, and tetrominoes come in from the left and step right one cell at a
  // time, the way a player taps them across the board. Now and then one turns (the game's own SRS rotations, about the
  // same centre and with the same kicks) or shifts a lane up or down. They never touch, never land and never stack:
  // each walks on off the right edge, behind the expand button, and more keep coming.

  const ROWS = 4;
  const TICK = 0.14; // seconds between a piece's moves: a step right every other tick, maybe a turn or a nudge between
  const SLIDE = 0.07; // seconds a step takes to draw, a short ease from cell to cell
  const IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

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
      this.serial = 0;
      this.exited = 0;
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

    /** Sizes the canvas to its box; a new column count starts the march afresh, walked ahead so it is never empty. */
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
      this.pieces = [];
      this.t = 0;
      this.gap = 0;
      // Walk a while unseen, so the bar is already full of pieces on their way.
      const warm = (cols * 2 * TICK + 4) * 30;
      for (let i = 0; i < warm; i++) this.step(1 / 30);
    }

    /** A piece's cells on the bar, [col, lane] with lane 0 at the bottom (y up, like the board). */
    cellsOf(p, rot, x, y) {
      const r = rot == null ? p.rot : rot, px = x == null ? p.x : x, py = y == null ? p.y : y;
      return L.Pieces.get(p.id).rots[r].map(([cx, cy]) => [px + cx, py + cy]);
    }

    /** Whether a piece fits there: inside the four lanes and clear of every other piece. */
    fits(p, rot, x, y) {
      const cells = this.cellsOf(p, rot, x, y);
      for (const [, cy] of cells) if (cy < 0 || cy >= ROWS) return false;
      for (const q of this.pieces) {
        if (q === p) continue;
        for (const [ax, ay] of this.cellsOf(q)) for (const [bx, by] of cells) if (ax === bx && ay === by) return false;
      }
      return true;
    }

    /** The span of columns a piece covers. */
    span(p) {
      let lo = Infinity, hi = -Infinity;
      for (const [cx] of this.cellsOf(p)) { if (cx < lo) lo = cx; if (cx > hi) hi = cx; }
      return { lo, hi };
    }

    /** Moves a piece by whole cells, remembering where it was drawn so the step can ease across. */
    move(p, dx, dy) {
      p.x += dx; p.y += dy;
      p.sx = this.slideOf(p, 'x') - dx; p.sy = this.slideOf(p, 'y') - dy; p.st = 0;
    }

    slideOf(p, axis) {
      const k = Math.min(1, p.st / SLIDE), e = 1 - k * k * (3 - 2 * k);
      return (axis === 'x' ? p.sx : p.sy) * e;
    }

    /** A turn as the game makes it: the next SRS rotation about the box centre, trying its kicks in order. */
    turn(p, dir) {
      const type = L.Pieces.get(p.id), to = (p.rot + dir + 4) % 4;
      for (const [kx, ky] of L.Pieces.kicksFor(type, p.rot, to)) {
        if (this.fits(p, to, p.x + kx, p.y + ky)) { p.rot = to; p.x += kx; p.y += ky; return true; }
      }
      return false;
    }

    spawn() {
      const p = { n: ++this.serial, id: this.nextId(), rot: 0, x: 0, y: 0, sx: 0, sy: 0, st: 1, phase: 0 };
      p.rot = Math.floor(this.rand() * 4);
      const type = L.Pieces.get(p.id), b = type.rotBounds[p.rot];
      // Any lane it fits in, and just out of sight past the left edge.
      const lanes = [];
      for (let y = -b.minY; y + b.maxY < ROWS; y++) lanes.push(y);
      p.y = lanes[Math.floor(this.rand() * lanes.length)];
      p.x = -1 - b.maxX;
      if (!this.fits(p)) return;
      p.due = this.t + TICK;
      this.pieces.push(p);
      this.gap = 3 + Math.floor(this.rand() * 6);
    }

    step(dt) {
      this.t += dt;
      for (const p of this.pieces) p.st += dt;
      // The front of the line goes first, so nobody waits on a piece that is about to move.
      const order = this.pieces.slice().sort((a, b) => this.span(b).hi - this.span(a).hi);
      for (const p of order) {
        while (p.due <= this.t) {
          p.due += TICK;
          p.phase ^= 1;
          if (p.phase) {
            if (this.fits(p, p.rot, p.x + 1, p.y)) this.move(p, 1, 0);
          } else {
            const r = this.rand();
            if (r < 0.1) this.turn(p, this.rand() < 0.7 ? 1 : -1);
            else if (r < 0.16) { const dy = this.rand() < 0.5 ? 1 : -1; if (this.fits(p, p.rot, p.x, p.y + dy)) this.move(p, 0, dy); }
          }
        }
      }
      // Off the right edge and gone.
      for (let i = this.pieces.length - 1; i >= 0; i--) {
        if (this.span(this.pieces[i]).lo >= this.cols) { this.pieces.splice(i, 1); this.exited++; }
      }
      // A new one once the last has come far enough in.
      let lo = Infinity;
      for (const p of this.pieces) lo = Math.min(lo, this.span(p).lo);
      if (lo >= this.gap) this.spawn();
    }

    draw() {
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, this.w, this.h);
      const look = this.getLook();
      const th = look.theme || {};
      const s = this.s, top = this.top, left = this.left;
      // The lanes: a recessed track the length of the bar, like the tabs' track.
      L.Render.rr(ctx, left - 3.5, top - 2.5, this.cols * s + 6, ROWS * s + 5, 6);
      ctx.fillStyle = th.well || 'rgba(0,0,0,0.3)'; ctx.fill();
      ctx.strokeStyle = th.grid || 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.save();
      // Clipped to the track: pieces come out of its left end and pass under its right, by the expand button.
      ctx.beginPath(); ctx.rect(left, top - 2, this.cols * s, ROWS * s + 4); ctx.clip();
      for (const p of this.pieces) {
        const color = look.colors[L.Pieces.get(p.id).color];
        const ox = this.slideOf(p, 'x'), oy = this.slideOf(p, 'y');
        for (const [cx, cy] of this.cellsOf(p)) {
          const gx = cx + ox;
          // Out of nothing over the first couple of columns.
          const a = Math.max(0, Math.min(1, (gx + 1) / 3));
          if (a > 0) L.Render.drawCell(ctx, look.skin, color, left + gx * s, top + (ROWS - 1 - cy - oy) * s, s, a);
        }
      }
      ctx.restore();
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
