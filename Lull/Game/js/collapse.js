// Lull — the window rolled up into its title bar (a window shade), and the idle pieces that drift along it meanwhile.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const CHEVRON_UP = L.Icons.icon('chevUp');
  const CHEVRON_DOWN = L.Icons.icon('chevDown');

  // ---- the idle bar --------------------------------------------------------------------------------------------------
  //
  // Pieces on a slow march: four lanes along the bar, and tetrominoes come in from the left and step right one cell at a
  // time, all of them together on one shared beat — a short eased glide, then a rest. Now and then, on the beat and
  // never more than one at a time, a piece turns as it steps (the game's own SRS rotation about the same centre, drawn
  // turning, never kicked out of line) or slides a lane up or down. A new one comes in after a few beats' wait, drawn
  // afresh each time, and never closer than a couple of empty columns to the one ahead, so they never touch,
  // land or stack: each fades in at the left, walks on, and fades out before the expand button.

  const ROWS = 4;
  const BEAT = 0.9; // seconds between steps: every piece moves on the same beat
  const GLIDE = 0.55; // seconds a step takes to draw, eased from cell to cell; the rest of the beat is still
  const SPAWN_MIN = 8, SPAWN_MAX = 16; // beats between one piece coming in and the next
  const SPACE = 2; // empty columns kept between two pieces, whatever their lanes
  const FLOURISH = 0.2; // the chance, each beat, that one piece turns or changes lane as it steps
  const REST = 6; // beats a piece walks straight on after a turn or a lane change
  const FADE_IN = 4, FADE_OUT = 6; // columns over which a piece appears at the left and is gone at the right
  const FPS = 30;
  const IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * k);
  // A coordinate on a whole device pixel when it is one already, give or take rounding; left as it is mid-glide.
  const snap = (v, px) => { const r = Math.round(v / px) * px; return Math.abs(r - v) < 1e-6 ? r : v; };

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
      this.beats = 0;
      this.pieces = [];
      this.look = null;
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

    /**
     * Sizes the canvas to its box. As the bar opens at a new width (or with nothing left on it) the march is walked
     * ahead so it is full from end to end; while it is showing, a new column count keeps every piece where it is,
     * counted from the left, and the beat and the wait for the next one go on as they were, so dragging the edge never
     * reshuffles the bar.
     */
    resize(opening) {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
      this.dpr = dpr; this.w = w; this.h = h;
      this.s = Math.max(4, Math.floor((h - 12) / ROWS));
      this.top = Math.round((h - this.s * ROWS) / 2);
      const cols = Math.max(8, Math.floor((w - 12) / this.s));
      this.left = w - 4 - cols * this.s;
      if (cols === this.cols) return;
      if (!this.cols || opening) { this.reset(cols); return; }
      this.cols = cols;
      for (let i = this.pieces.length - 1; i >= 0; i--) if (this.span(this.pieces[i]).lo >= cols) this.pieces.splice(i, 1);
      if (!this.pieces.length) this.reset(cols);
    }

    /** Starts the march over, walked on unseen until the bar is full of pieces on their way, and at rest. */
    reset(cols) {
      this.cols = cols;
      this.pieces = [];
      this.bag = null; this.gap = 0;
      this.beats = 0;
      this.due = 1 + Math.floor(this.rand() * 3);
      for (let i = 0, n = cols + SPAWN_MAX * 2; i < n; i++) this.tick();
      for (const p of this.pieces) { p.ox = 0; p.oy = 0; p.oa = 0; }
      this.t = 0; this.g0 = -GLIDE; this.next = BEAT * 0.5;
    }

    /** A piece's cells on the bar, [col, lane] with lane 0 at the bottom (y up, like the board). */
    cellsOf(p, rot, x, y) {
      const r = rot == null ? p.rot : rot, px = x == null ? p.x : x, py = y == null ? p.y : y;
      return L.Pieces.get(p.id).rots[r].map(([cx, cy]) => [px + cx, py + cy]);
    }

    /** The span of columns a piece covers, in a pose (its own by default). */
    span(p, rot, x) {
      const b = L.Pieces.get(p.id).rotBounds[rot == null ? p.rot : rot], px = x == null ? p.x : x;
      return { lo: px + b.minX, hi: px + b.maxX };
    }

    /** Whether a piece fits in a pose: inside the four lanes, with SPACE empty columns to every other piece. */
    fits(p, rot, x, y) {
      const b = L.Pieces.get(p.id).rotBounds[rot], lo = x + b.minX, hi = x + b.maxX;
      if (y + b.minY < 0 || y + b.maxY >= ROWS) return false;
      for (const q of this.pieces) {
        if (q === p) continue;
        const o = this.span(q);
        if (o.lo <= hi + SPACE && o.hi >= lo - SPACE) return false;
      }
      return true;
    }

    /** One beat: every piece steps right together; maybe one of them turns or changes lane as it goes; one may enter. */
    tick() {
      this.beats++;
      // The front of the line goes first, so nobody waits on a piece that is about to move.
      this.pieces.sort((a, b) => this.span(b).hi - this.span(a).hi);
      for (const p of this.pieces) {
        p.ox = 0; p.oy = 0; p.oa = 0;
        if (this.fits(p, p.rot, p.x + 1, p.y)) { p.x += 1; p.ox = -1; }
      }
      if (this.rand() < FLOURISH && this.pieces.length) {
        const p = this.pieces[Math.floor(this.rand() * this.pieces.length)], sp = this.span(p);
        // Only where it can be seen whole, and not again for a while.
        if (p.ox && this.beats >= p.calm && sp.lo >= FADE_IN && sp.hi < this.cols - FADE_OUT) {
          if (this.rand() < 0.6) this.turn(p, this.rand() < 0.7 ? 1 : -1);
          else this.shift(p, this.rand() < 0.5 ? 1 : -1);
        }
      }
      // Past the right edge and gone.
      for (let i = this.pieces.length - 1; i >= 0; i--) {
        if (this.span(this.pieces[i]).lo >= this.cols) { this.pieces.splice(i, 1); this.exited++; }
      }
      if (this.beats >= this.due) this.spawn();
    }

    /**
     * A turn as the game makes it: the next SRS rotation about the box centre, its first test, with no kick. A kick
     * would carry the piece sideways or into another lane as it turns, out of step with the rest, so where the plain
     * turn does not fit the piece just walks on this beat.
     */
    turn(p, dir) {
      const to = (p.rot + dir + 4) % 4;
      if (!this.fits(p, to, p.x, p.y)) return false;
      p.rot = to; p.oa = -dir;
      p.calm = this.beats + REST; this.turns = (this.turns || 0) + 1;
      return true;
    }

    shift(p, dy) {
      if (!this.fits(p, p.rot, p.x, p.y + dy)) return false;
      p.y += dy; p.oy = -dy;
      p.calm = this.beats + REST; this.shifts = (this.shifts || 0) + 1;
      return true;
    }

    /** A new piece just out of sight past the left edge, in any lane it fits; it steps in on the next beat. */
    spawn() {
      const p = { n: this.serial + 1, id: this.nextId(), rot: Math.floor(this.rand() * 4), x: 0, y: 0, ox: 0, oy: 0, oa: 0, calm: 0 };
      const b = L.Pieces.get(p.id).rotBounds[p.rot];
      const lanes = ROWS - b.h + 1;
      p.y = Math.floor(this.rand() * lanes) - b.minY;
      p.x = -1 - b.maxX;
      if (!this.fits(p, p.rot, p.x, p.y)) { this.bag.push(p.id); return; } // too close to the last one: next beat
      this.serial = p.n;
      p.calm = this.beats + REST;
      this.pieces.push(p);
      // The next one after a few beats, and not the same few as last time.
      let gap;
      do gap = SPAWN_MIN + Math.floor(this.rand() * (SPAWN_MAX - SPAWN_MIN + 1)); while (gap === this.gap);
      this.gap = gap;
      this.due = this.beats + gap;
    }

    /** Advances bar time; the beat falls every BEAT seconds, whatever the frame rate. */
    step(dt) {
      this.t += dt;
      while (this.t >= this.next) { this.g0 = this.next; this.next += BEAT; this.tick(); }
    }

    /** How far through the beat's glide the pieces are drawn, 0 to 1 (1 at rest, and always with reduced motion). */
    progress() {
      if (this.isReduced()) return 1;
      return ease(Math.max(0, Math.min(1, (this.t - this.g0) / GLIDE)));
    }

    draw() {
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const look = this.look || (this.look = this.getLook());
      const light = !!(look.theme && look.theme.name === 'light');
      ctx.__dpr = this.dpr; ctx.__light = light;
      // Quiet on the bar: the equipped palette and skin, softened, with no track or lanes drawn under them.
      const soft = light ? 0.78 : 0.7;
      const s = this.s, left = this.left, top = this.top, cols = this.cols, px = 1 / this.dpr;
      const u = 1 - this.progress();
      for (const p of this.pieces) {
        const type = L.Pieces.get(p.id), c = (type.n - 1) / 2, color = look.colors[type.color];
        // The box centre, where the piece is drawn this frame, in cells (y up).
        const bx = p.x + c + p.ox * u, by = p.y + c + p.oy * u;
        const a = p.oa * u * Math.PI / 2, cos = Math.cos(a), sin = Math.sin(a), k = Math.max(Math.abs(cos), Math.abs(sin));
        for (const cell of type.rots[p.rot]) {
          // The cell's place about the box centre, on screen (y down), carried back by what is left of a turn.
          const U = cell[0] - c, V = c - cell[1];
          const gx = bx + U * cos - V * sin, gy = (ROWS - 1 - by) + U * sin + V * cos;
          const alpha = soft * Math.max(0, Math.min(1, (gx + 1) / FADE_IN, (cols - 1 - gx) / FADE_OUT));
          if (alpha <= 0.01) continue;
          // Whole device pixels wherever the cell sits on the grid (at rest, and as a turn sets off), finer in a glide.
          const x = snap(left + gx * s, px), y = snap(top + gy * s, px);
          if (k === 1) L.Render.drawCell(ctx, look.skin, color, x, y, s, alpha);
          else {
            // Mid-turn the cells stay upright, so their light never swings round; they draw in a little as the piece
            // turns, just enough that no two of them overlap, and are whole again when it lands.
            ctx.save();
            ctx.translate(x + s / 2, y + s / 2); ctx.scale(k, k);
            L.Render.drawCell(ctx, look.skin, color, -s / 2, -s / 2, s, alpha);
            ctx.restore();
          }
        }
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.look = this.getLook();
      this.resize(true);
      this.draw();
      this.last = performance.now();
      let drawn = true, still = 0;
      const loop = (now) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        if (document.hidden) { this.last = now; return; }
        if (now - this.last < 1000 / FPS - 2) return;
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;
        if (this.isReduced()) {
          // A still, composed frame: redrawn now and then only so a change of theme or look shows.
          if ((still += dt) > 0.5) { still = 0; this.look = this.getLook(); this.draw(); }
          return;
        }
        const beats = this.beats;
        this.step(dt);
        if (this.beats !== beats) this.look = this.getLook();
        // Drawn only while the pieces glide, and once more as they come to rest.
        const gliding = this.t - this.g0 < GLIDE;
        if (gliding || !drawn) { this.draw(); this.frames++; drawn = !gliding; }
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  BarIdle.BEAT = BEAT; BarIdle.GLIDE = GLIDE; BarIdle.SPAWN_MIN = SPAWN_MIN; BarIdle.SPAWN_MAX = SPAWN_MAX; BarIdle.SPACE = SPACE; BarIdle.ROWS = ROWS;

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
        // Achievements earned while rolled up are told now, when their toasts can be seen (and clicked).
        if (!first) setTimeout(() => app.announceUnheard(), 300);
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
