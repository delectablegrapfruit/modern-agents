// Lull — the Factory's belt, drawn like the board: the same well, grid, skin and palette. Minos ride left to right;
// a defective one wears a crack — click it off the belt.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render } = L;
  const { rr, rgba, drawCell, FX } = Render;

  class BeltView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fx = new FX();
      this.hover = null;
      this.rects = [];
      this.t = 0;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
    }

    /** The belt's lane in CSS pixels, and the cell size minos are drawn at. */
    lane() {
      const pad = 1, h = this.h - 2 * pad;
      return { x: pad, y: pad, w: this.w - 2 * pad, h, s: Math.max(5, Math.min(14, Math.floor(h / 6))) };
    }

    itemAt(px, py) {
      for (const r of this.rects) if (px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6) return r.item;
      return null;
    }

    /** Where an item is, for effects. */
    itemCenter(it) {
      const r = this.rects.find((x) => x.item === it);
      return r ? [r.x + r.w / 2, r.y + r.h / 2] : null;
    }

    render(dt, belt, look) {
      const ctx = this.ctx, th = look.theme;
      this.t += dt;
      this.fx.update(dt);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const ln = this.lane(), s = ln.s;
      // The well, as on the board.
      ctx.fillStyle = th.well; rr(ctx, ln.x, ln.y, ln.w, ln.h, 10); ctx.fill();
      ctx.save();
      ctx.beginPath(); rr(ctx, ln.x, ln.y, ln.w, ln.h, 10); ctx.clip();
      // The belt: faint slats sliding along (the board's grid colour).
      const off = (this.t * belt.speed * Math.max(4, Math.min(16, Math.floor((ln.h * 0.66) / (belt.tallest || 1))))) % (s * 2);
      ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
      for (let x = ln.x - s * 2 + off; x < ln.x + ln.w; x += s * 2) { ctx.beginPath(); ctx.moveTo(x + 0.5, ln.y + ln.h * 0.22); ctx.lineTo(x + 0.5, ln.y + ln.h * 0.78); ctx.stroke(); }
      ctx.fillStyle = rgba(th.accent, 0.05); ctx.fillRect(ln.x, ln.y + ln.h * 0.22, ln.w, ln.h * 0.56);
      ctx.restore();
      ctx.strokeStyle = th.line; ctx.lineWidth = 1; rr(ctx, ln.x + 0.5, ln.y + 0.5, ln.w - 1, ln.h - 1, 10); ctx.stroke();
      // Minos, at one cell size (the tallest flat mino fills about two thirds of the belt), clipped to the belt so
      // they slide in and out of view.
      this.rects = [];
      const cs = Math.max(4, Math.min(16, Math.floor((ln.h * 0.66) / belt.tallest)));
      belt.length = ln.w / cs;
      const cy = ln.y + ln.h / 2;
      ctx.save();
      ctx.beginPath(); rr(ctx, ln.x, ln.y, ln.w, ln.h, 10); ctx.clip();
      for (const it of belt.items) {
        const x0 = ln.x + it.x * cs, y0 = cy - (it.h * cs) / 2;
        const color = look.colors[it.color] || th.accent;
        it.cells.forEach(([x, y], i) => {
          const px = x0 + x * cs, py = y0 + (it.h - 1 - y) * cs;
          drawCell(ctx, look.skin, i === it.mark ? Render.mix(color, '#3a2a22', 0.55) : color, px, py, cs);
          if (i === it.mark) {
            ctx.strokeStyle = '#140f0c'; ctx.lineWidth = Math.max(1, cs * 0.12);
            ctx.beginPath(); ctx.moveTo(px + cs * 0.2, py + cs * 0.1); ctx.lineTo(px + cs * 0.55, py + cs * 0.45); ctx.lineTo(px + cs * 0.35, py + cs * 0.6); ctx.lineTo(px + cs * 0.8, py + cs * 0.95); ctx.stroke();
          }
        });
        const r = { x: x0, y: y0, w: it.w * cs, h: it.h * cs, item: it };
        this.rects.push(r);
        if (this.hover === it) { ctx.strokeStyle = it.defect ? th.accent : th.muted; ctx.lineWidth = 1.5; rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 6); ctx.stroke(); }
      }
      ctx.restore();
      this.fx.draw(ctx);
    }
  }

  L.BeltView = BeltView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
