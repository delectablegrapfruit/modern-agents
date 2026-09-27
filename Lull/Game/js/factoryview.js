// Lull — the Factory floor, drawn like the board: the same well, grid, skin and palette. Four bays of presses along a
// beam, each forming its piece in a small mold window; the belt below carries finished pieces right, up a straight
// lift and into the bin, four minos wide, where every full row is one line. Laid out on a 42 × 25 cell grid.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { LINE } = L;
  const { rr, rgba, drawCell, ghostCell, FX, FONT } = Render;

  const COLS = 42, ROWS = 25, CAPTION = 16;
  const WIN = { y: 8.5, w: 7, h: 4 };      // each press's mold window, in cells
  const LANE = { top: 19.5, bottom: 23.5 }; // the belt
  const FLOOR = 24;
  const BIN_X = 37;                        // the bin's left wall; room to its right for the tick numbers
  const LIFT = { x0: 35, x1: 36.75 };      // the lift's shaft: from the belt's end to just short of the bin
  const MONO = '"Lull Line", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const cssVar = (k, dflt) => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim() || dflt; } catch (e) { return dflt; } };
  const ease = (k) => k * k;

  /** A shape's cells, bottom row first and left to right: the order a press forms them in. */
  const order = new WeakMap();
  function formOrder(cells) {
    let o = order.get(cells);
    if (!o) { o = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]); order.set(cells, o); }
    return o;
  }

  class FloorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fx = new FX();
      this.t = 0;
      this.slide = 0;              // the belt's slats, in cells
      this.drops = new WeakMap();  // belt item → when it left its press
      this.flying = [];            // minos on their way up the lift: { c, t0 }
      this.dips = [0, 0, 0, 0];    // each ram's dip, seconds left
      this.built = [-9, -9, -9, -9];
      this.later = [];             // timed effects: { at, fn }
      this.caption = '';
      this.w = 1; this.h = 1; this.dpr = 1;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      const cs = Math.max(3, Math.floor(Math.min((w - 8) / COLS, (h - 6 - CAPTION) / ROWS)));
      this.cs = cs;
      this.ox = Math.round((w - COLS * cs) / 2);
      this.oy = Math.round(3 + (h - 6 - CAPTION - ROWS * cs) / 2);
    }

    X(c) { return this.ox + c * this.cs; }
    Y(r) { return this.oy + r * this.cs; }

    /** The bin's geometry for a factory: its rows' height and where its top sits (in rows of the grid). */
    bin(f) {
      const rows = Factory.BIN_ROWS[f.binLevel], cs = this.cs;
      const rowH = Math.min(cs, (23 * cs) / rows);
      return { rows, rowH, top: FLOOR - (rows * rowH) / cs };
    }

    /** What the pointer is over: a built press, an empty bay, or the bin. */
    hitTest(px, py, f) {
      const cx = (px - this.ox) / this.cs, cy = (py - this.oy) / this.cs;
      if (cx >= 0 && cx < 4 * Factory.BAY && cy >= 0 && cy < LANE.top) {
        const k = Math.min(3, Math.floor(cx / Factory.BAY));
        return k < f.presses ? { kind: 'press', k } : { kind: 'bay', k };
      }
      if (cx >= 35 && cx <= COLS && cy >= this.bin(f).top - 1.5 && cy <= ROWS) return { kind: 'bin' };
      return null;
    }

    /** Step events become motion: rams dip, pieces fall to the belt, minos ride the lift. */
    events(evs, reduced) {
      for (const e of evs) {
        if (e.kind === 'mino') this.dips[e.k] = 0.18;
        else if (e.kind === 'drop') this.drops.set(e.item, this.t);
        else if (e.kind === 'enter' && !reduced) {
          const t0 = Math.max(this.t, this.flying.length ? this.flying[this.flying.length - 1].t0 + 0.08 : 0);
          for (let i = 0; i < e.item.n; i++) this.flying.push({ c: e.item.c, t0: t0 + i * 0.08 });
        }
      }
    }

    builtPress(k) { this.built[k] = this.t; }

    /** Collected rows lift out of the bin, bottom up (at most 120 cells, over at most 1.2 s). */
    collected(res, f, look, reduced, gem) {
      const cs = this.cs, b = this.bin(f), rows = res.collected;
      const every = Math.max(1, Math.ceil((rows * 4) / 120)), gap = Math.min(0.04, 1.2 / rows);
      const s = Math.max(3, Math.min(cs, b.rowH));
      this.flying = [];
      for (let r = 0; r < rows; r += every) {
        const cells = [];
        for (let c = 0; c < 4; c++) cells.push({ x: this.X(BIN_X) + c * cs + (cs - s) / 2, y: this.Y(FLOOR) - (r + 1) * b.rowH, color: look.colors[parseInt(res.taken[r * 4 + c], 16)] || look.theme.accent });
        this.later.push({ at: this.t + r * gap, fn: () => this.fx.burst(look.effect, cells, s, reduced) });
      }
      // One label, inside the bin just under its top (clear of the lift and the floor's edge); a quick second collect adds to it.
      const live = this.collectLabel && this.fx.texts.includes(this.collectLabel) ? this.collectLabel : null;
      const total = rows + (live ? live.rows : 0);
      if (live) this.fx.texts.splice(this.fx.texts.indexOf(live), 1);
      this.fx.text('+' + total + ' ' + LINE, this.X(BIN_X + 2), Math.max(this.Y(b.top), this.oy) + 34, gem || '#8fe3ff', 14);
      this.collectLabel = this.fx.texts[this.fx.texts.length - 1];
      this.collectLabel.rows = total;
    }

    render(dt, f, look, hover) {
      const ctx = this.ctx, th = look.theme, cs = this.cs;
      this.t += dt;
      // The theme's warning colour, looked up now and then rather than every frame (it only changes with the theme).
      if (!this.warn || this.t - this.warnAt > 1) { this.warn = cssVar('--warn', '#f6c177'); this.warnAt = this.t; }
      const warn = this.warn;
      this.fx.update(dt);
      for (let k = 0; k < 4; k++) this.dips[k] = Math.max(0, this.dips[k] - dt);
      const due = this.later.length ? this.later.filter((l) => l.at <= this.t) : this.later;
      if (due.length) { this.later = this.later.filter((l) => l.at > this.t); for (const l of due) l.fn(); }
      const waiting = Factory.isFull(f);
      if (!waiting) this.slide = (this.slide + Factory.BELT.speed * dt) % 2;
      const reduced = !!this.reduced;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr; // crisp cell sprites
      ctx.clearRect(0, 0, this.w, this.h);
      // The well, as on the board, but plain: the equipped backdrop belongs to the play boards, not the floor.
      ctx.fillStyle = th.well; rr(ctx, 0.5, 0.5, this.w - 1, this.h - 1, 10); ctx.fill();
      ctx.save();
      ctx.beginPath(); rr(ctx, 0.5, 0.5, this.w - 1, this.h - 1, 10); ctx.clip();

      this.drawBeam(ctx, f, th);
      for (let k = 0; k < 4; k++) this.drawPress(ctx, f, look, k, warn, reduced, hover);
      this.drawBelt(ctx, f, look);
      this.drawLift(ctx, f, look);
      this.drawBin(ctx, f, look, warn, waiting, hover);
      this.drawFlying(ctx, f, look, reduced);
      // The floor everything stands on.
      ctx.fillStyle = th.line; ctx.fillRect(this.X(0), Math.round(this.Y(FLOOR)), COLS * cs, 1);
      this.fx.draw(ctx);
      if (this.caption) this.drawCaption(ctx, th);
      ctx.restore();
      ctx.strokeStyle = th.line; ctx.lineWidth = 1; rr(ctx, 0.5, 0.5, this.w - 1, this.h - 1, 10); ctx.stroke();
    }

    drawBeam(ctx, f, th) {
      const cs = this.cs, y = this.Y(0.3), hgt = cs * 1.1;
      ctx.fillStyle = th.grid; ctx.fillRect(this.X(0), y, 4 * Factory.BAY * cs, hgt);
      ctx.fillStyle = th.line; ctx.fillRect(this.X(0), Math.round(y + hgt), 4 * Factory.BAY * cs, 1);
      ctx.font = '600 ' + Math.max(7, Math.round(cs * 0.8)) + 'px ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = th.muted; ctx.globalAlpha = k < f.presses ? 1 : 0.45;
        ctx.fillText(String(Factory.MOLDS[k]), this.X((k + 0.5) * Factory.BAY), y + hgt / 2 + 0.5);
      }
      ctx.globalAlpha = 1;
    }

    drawPress(ctx, f, look, k, warn, reduced, hover) {
      const cs = this.cs, th = look.theme, n = Factory.MOLDS[k];
      const wx = this.X(k * Factory.BAY + (Factory.BAY - WIN.w) / 2), wy = this.Y(WIN.y), ww = WIN.w * cs, wh = WIN.h * cs;
      const hot = hover && (hover.kind === 'press' || hover.kind === 'bay') && hover.k === k;
      if (k >= f.presses) {
        // An empty bay: a dashed outline, its size and its price.
        ctx.save();
        ctx.setLineDash([3, 3]); ctx.strokeStyle = th.line; ctx.lineWidth = 1;
        rr(ctx, wx + 0.5, this.Y(2.2) + 0.5, ww - 1, wy + wh - this.Y(2.2) - 1, 6); ctx.stroke();
        ctx.restore();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = th.muted; ctx.globalAlpha = hot ? 0.95 : 0.6;
        ctx.font = '700 ' + Math.max(9, Math.round(cs * 1.2)) + 'px ' + MONO;
        ctx.fillText(String(n), wx + ww / 2, this.Y(5.6));
        ctx.font = '600 ' + Math.max(8, Math.round(cs * 0.8)) + 'px ' + MONO;
        ctx.fillText(Factory.PRESS_COST[k].toLocaleString('en-US') + ' ' + LINE, wx + ww / 2, this.Y(7.8));
        ctx.globalAlpha = 1;
        return;
      }
      const m = f.molds[k], cells = Factory.shapes(n)[m.s], color = look.colors[m.c] || th.accent;
      const fade = Math.min(1, (this.t - this.built[k]) / 0.6);
      ctx.globalAlpha = fade;
      // The ram: a rod from the beam and a plate that dips as each mino is pressed (and breathes, gently).
      const bob = reduced || m.held ? 0 : Math.sin(this.t * 1.3 + k * 1.7);
      const dip = this.dips[k] > 0 && !reduced ? 2 : 0;
      const plateY = this.Y(7.2) + bob + dip, cx = wx + ww / 2;
      ctx.fillStyle = th.line; ctx.fillRect(Math.round(cx - cs * 0.3), this.Y(1.5), Math.round(cs * 0.6), plateY - this.Y(1.5));
      ctx.fillStyle = th.grid; rr(ctx, wx + cs * 0.8, plateY, ww - cs * 1.6, cs * 0.9, 3); ctx.fill();
      ctx.strokeStyle = th.line; ctx.lineWidth = 1; rr(ctx, wx + cs * 0.8 + 0.5, plateY + 0.5, ww - cs * 1.6 - 1, cs * 0.9 - 1, 3); ctx.stroke();
      // Faint guides down to the belt: where this press's pieces fall.
      ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath();
      for (const gx of [wx + cs * 0.5, wx + ww - cs * 0.5]) { ctx.moveTo(Math.round(gx) + 0.5, wy + wh + 8); ctx.lineTo(Math.round(gx) + 0.5, this.Y(LANE.top) - 3); }
      ctx.stroke(); ctx.setLineDash([]);
      // The mold window: formed cells in the skin, the rest as ghosts.
      ctx.fillStyle = th.well; ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.beginPath();
      for (let c = 1; c < WIN.w; c++) { const px = Math.round(wx + c * cs) + 0.5; ctx.moveTo(px, wy); ctx.lineTo(px, wy + wh); }
      for (let r = 1; r < WIN.h; r++) { const py = Math.round(wy + r * cs) + 0.5; ctx.moveTo(wx, py); ctx.lineTo(wx + ww, py); }
      ctx.stroke();
      ctx.strokeStyle = hot ? th.muted : th.line; ctx.strokeRect(Math.round(wx) + 0.5, Math.round(wy) + 0.5, Math.round(ww) - 1, Math.round(wh) - 1);
      const formed = Math.floor(m.p * n + 1e-9), px0 = wx + ((WIN.w - cells.w) / 2) * cs, pyb = wy + wh;
      const ghost = look.ghost === 'off' ? 'faint' : look.ghost;
      formOrder(cells).forEach(([x, y], i) => {
        const px = Math.round(px0 + x * cs), py = Math.round(pyb - (y + 1) * cs);
        if (i < formed) drawCell(ctx, look.skin, color, px, py, cs);
        else ghostCell(ctx, ghost, color, px, py, cs);
      });
      // Progress to the next mino, the lamp (running or holding), and the pin.
      const frac = m.held ? 1 : (m.p * n) % 1;
      ctx.fillStyle = th.grid; ctx.fillRect(wx, wy + wh + 3, ww, 2);
      ctx.fillStyle = m.held ? warn : th.accent; ctx.fillRect(wx, wy + wh + 3, ww * frac, 2);
      ctx.fillStyle = m.held ? warn : th.accent;
      ctx.beginPath(); ctx.arc(wx + ww - 4, wy + 4, 2, 0, Math.PI * 2); ctx.fill();
      if (m.pin >= 0) {
        ctx.font = '600 9px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = th.fg; ctx.fillText('◇', wx + 2, wy + 1);
      }
      ctx.globalAlpha = 1;
    }

    /** Where a belt piece is drawn: on the belt, or still falling from its press. */
    drawBelt(ctx, f, look) {
      const cs = this.cs, th = look.theme, x0 = this.X(0), x1 = this.X(Factory.BELT.len);
      const top = this.Y(LANE.top), bot = this.Y(LANE.bottom);
      ctx.fillStyle = th.well; ctx.fillRect(x0, top, x1 - x0, bot - top);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, top, x1 - x0, bot - top); ctx.clip();
      ctx.strokeStyle = th.grid; ctx.lineWidth = 1; ctx.beginPath();
      for (let c = this.slide - 2; c < Factory.BELT.len; c += 2) { const px = Math.round(this.X(c)) + 0.5; ctx.moveTo(px, top); ctx.lineTo(px, bot); }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = th.line; ctx.fillRect(x0, Math.round(top) - 1, x1 - x0, 1); ctx.fillRect(x0, Math.round(bot), x1 - x0, 1);
      for (const it of f.belt) {
        const cells = Factory.shapes(it.n)[it.s], color = look.colors[it.c] || th.accent;
        const t0 = this.drops.get(it);
        let yb = bot;
        if (t0 != null && this.t - t0 < 0.35) yb = this.Y(WIN.y + WIN.h) + (bot - this.Y(WIN.y + WIN.h)) * ease((this.t - t0) / 0.35);
        const px0 = this.X(it.x);
        for (const [x, y] of cells) drawCell(ctx, look.skin, color, Math.round(px0 + x * cs), Math.round(yb - (y + 1) * cs), cs);
      }
    }

    /** The lift between the belt's end and the bin: a straight shaft, no bends. Each mino rises (or sinks) in it to the
     *  row it will fill, then steps right into its slot, 0.6 s each, eased (drawFlying). */
    drawLift(ctx, f, look) {
      const th = look.theme, b = this.bin(f);
      const x0 = this.X(LIFT.x0), x1 = this.X(LIFT.x1), top = this.Y(Math.min(b.top, LANE.top)), bot = this.Y(FLOOR);
      ctx.fillStyle = th.well; ctx.fillRect(x0, top, x1 - x0, bot - top);
      ctx.fillStyle = th.grid;
      ctx.fillRect(Math.round(x0), top, 1, bot - top); ctx.fillRect(Math.round(x1) - 1, top, 1, bot - top);
    }

    /** Minos on the lift, drawn over the bin's wall as they step in. */
    drawFlying(ctx, f, look, reduced) {
      const cs = this.cs, th = look.theme, b = this.bin(f), bot = this.Y(FLOOR);
      if (reduced) { this.flying = []; return; }
      this.flying = this.flying.filter((m) => this.t - m.t0 < 0.6);
      const len = f.bin.length, n = this.flying.length, fly = Math.max(3, Math.round(cs * 0.8)), land = Math.min(cs, b.rowH);
      const sx = this.X((LIFT.x0 + LIFT.x1) / 2), sy = this.Y(LANE.bottom - 0.5);
      this.flying.forEach((m, j) => {
        const k = (this.t - m.t0) / 0.6;
        if (k < 0) return;
        const i = Math.max(0, len - n + j), r = Math.floor(i / 4), c = i % 4;
        const tx = this.X(BIN_X + c + 0.5), ty = bot - (r + 0.5) * b.rowH;
        // Up the shaft for the first part of the trip (by distance), then across; eased at both ends.
        const up = Math.abs(ty - sy), across = tx - sx, d = (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)) * (up + across);
        const x = d <= up ? sx : sx + (d - up), y = d <= up ? sy + (ty - sy) * (up ? d / up : 1) : ty;
        const s = d <= up ? fly : fly + (land - fly) * ((d - up) / (across || 1));
        drawCell(ctx, look.skin, look.colors[m.c] || th.accent, Math.round(x - s / 2), Math.round(y - s / 2), Math.max(2, Math.round(s)));
      });
    }

    drawBin(ctx, f, look, warn, waiting, hover) {
      const cs = this.cs, th = look.theme, b = this.bin(f);
      const x = this.X(BIN_X), w = 4 * cs, bottom = this.Y(FLOOR), top = this.Y(b.top);
      ctx.fillStyle = th.well; ctx.fillRect(x, top, w, bottom - top);
      // Minos still on the lift are not in the bin yet.
      const shown = Math.max(0, f.bin.length - this.flying.filter((m) => m.t0 + 0.6 > this.t).length);
      const cell = b.rowH >= 8, s = Math.min(cs, b.rowH);
      for (let i = 0; i < shown; i++) {
        const r = Math.floor(i / 4), c = i % 4, color = look.colors[parseInt(f.bin[i], 16)] || th.accent;
        const y = bottom - (r + 1) * b.rowH;
        if (cell) drawCell(ctx, look.skin, color, Math.round(x + c * cs + (cs - s) / 2), Math.round(y), Math.round(s));
        else { ctx.fillStyle = color; ctx.fillRect(x + c * cs + 0.5, y, cs - 1, Math.max(1, b.rowH - (b.rowH > 3 ? 0.5 : 0))); }
      }
      // A faint line over every full row (only over the top one when rows are thin).
      const full = Math.floor(shown / 4);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      if (cell) for (let r = 0; r < full; r++) ctx.fillRect(x, Math.round(bottom - (r + 1) * b.rowH), w, 1);
      else if (full) ctx.fillRect(x, Math.round(bottom - full * b.rowH), w, 1);
      // Walls, ticks every 12 rows, a number every 24.
      ctx.strokeStyle = hover && hover.kind === 'bin' ? th.muted : th.line; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) - 0.5, top - 2); ctx.lineTo(Math.round(x) - 0.5, bottom + 0.5); ctx.lineTo(Math.round(x + w) + 0.5, bottom + 0.5); ctx.lineTo(Math.round(x + w) + 0.5, top - 2);
      ctx.stroke();
      ctx.fillStyle = th.muted; ctx.font = '600 7px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (let r = 12; r <= b.rows; r += 12) {
        const y = Math.round(bottom - r * b.rowH) + 0.5;
        ctx.fillRect(Math.round(x + w) + 1, y, 3, 1);
        if (r % 24 === 0 && b.rows > 12) ctx.fillText(String(r), Math.round(x + w) + 5, y);
      }
      // A full bin glows at the mouth.
      if (waiting || f.bin.length > Factory.capacity(f) - 4) {
        const g = ctx.createLinearGradient(0, top - cs, 0, top + cs * 0.6);
        g.addColorStop(0, rgba(warn, 0)); g.addColorStop(0.6, rgba(warn, 0.35)); g.addColorStop(1, rgba(warn, 0));
        ctx.fillStyle = g; ctx.fillRect(x - 2, top - cs, w + 4, cs * 1.6);
      }
    }

    drawCaption(ctx, th) {
      ctx.font = '600 10px ' + MONO;
      const w = Math.min(this.w - 12, ctx.measureText(this.caption).width + 14), x = 6, y = this.h - CAPTION - 3;
      ctx.fillStyle = th.fog; rr(ctx, x, y, w, CAPTION, 8); ctx.fill();
      ctx.strokeStyle = th.line; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, w - 1, CAPTION - 1, 8); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w - 6, CAPTION); ctx.clip();
      ctx.fillStyle = th.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(this.caption, x + 7, y + CAPTION / 2 + 0.5);
      ctx.restore();
    }
  }

  /** A shape on its own little canvas (mold picker, stats): pressed ones in the skin, the rest faint. */
  function shapeCanvas(look, cells, size, color, pressed) {
    const c = document.createElement('canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
    c.style.width = size + 'px'; c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    const b = L.Pieces.boundsOf(cells), s = Math.max(2, Math.floor(Math.min((size - 4) / b.w, (size - 4) / b.h, 10)));
    const ox = Math.round((size - b.w * s) / 2), oy = Math.round((size - b.h * s) / 2);
    for (const [x, y] of cells) {
      const px = ox + (x - b.minX) * s, py = oy + (b.maxY - y) * s;
      if (pressed) drawCell(ctx, look.skin, color, px, py, s);
      // Not pressed yet: one faint look at every size (a ghost's outline would not survive the small ones).
      else { ctx.fillStyle = rgba(look.theme.muted || '#9aa1ae', 0.32); ctx.fillRect(px + 0.5, py + 0.5, s - 1, s - 1); }
    }
    return c;
  }

  L.FloorView = FloorView;
  L.FactoryArt = { shapeCanvas, FONT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
