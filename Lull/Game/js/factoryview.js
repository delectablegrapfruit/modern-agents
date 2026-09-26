// Lull — the factory floor on screen: presses, the belt, the inspector's gate, the shipping chute. Click a defective
// mino to pull it off the line.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Factory, Render } = L;
  const { rgba, shade, hsl, drawCell, rr, FONT } = Render;

  const TIER_MAX_H = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];

  class BeltView {
    constructor(canvas, belt) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.belt = belt;
      this.cssW = 0; this.cssH = 0; this.dpr = 1;
      this.texts = [];
      this.hover = null;
      this.lastStamp = -10;
      this.armAnim = null;
      this.t = 0;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w !== this.cssW || h !== this.cssH || dpr !== this.dpr) {
        this.cssW = w; this.cssH = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
    }

    geom() {
      const W = this.cssW, H = this.cssH;
      const x0 = Math.min(84, W * 0.18), x1 = W - Math.min(64, W * 0.14);
      const beltY = Math.round(H * 0.68), beltH = Math.max(10, Math.round(H * 0.1));
      const cs = Math.max(5, Math.min(20, Math.floor((H * 0.42) / Math.max(2, TIER_MAX_H[this.belt.f.tier] + 0.5))));
      return { W, H, x0, x1, beltY, beltH, cs, gateX: x0 + (x1 - x0) * Factory.Belt.INSPECT };
    }

    /** The cells of an item laid out landscape, cached on the item. */
    shape(it) {
      if (!it.draw) {
        let cells = it.cells;
        const b = L.Pieces.boundsOf(cells);
        if (b.h > b.w) cells = cells.map(([x, y]) => [y, x]);
        it.draw = L.Pieces.normalize(cells);
        it.db = L.Pieces.boundsOf(it.draw);
      }
      return it.draw;
    }

    itemRect(it, g) {
      this.shape(it);
      const w = it.db.w * g.cs, h = it.db.h * g.cs;
      const cx = g.x0 + (g.x1 - g.x0) * Math.min(it.x, 1.04);
      let y = g.beltY - h;
      if (it.gone === 'auto' || it.gone === 'caught' || it.gone === 'wasted') y -= it.fade * 40;
      if (it.gone === 'shipped') y += it.fade * 30;
      return { x: cx - w / 2, y, w, h };
    }

    /** The item under the pointer (the nearest one when their boxes overlap). */
    itemAt(px, py) {
      const g = this.geom();
      let best = null, bestD = Infinity;
      for (const it of this.belt.items) {
        if (it.gone) continue;
        const r = this.itemRect(it, g);
        if (px < r.x - 6 || px > r.x + r.w + 6 || py < r.y - 6 || py > r.y + r.h + 6) continue;
        const d = Math.hypot(px - (r.x + r.w / 2), py - (r.y + r.h / 2));
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    }

    handleEvents(events, fmtCredits) {
      const g = this.geom();
      for (const e of events) {
        if (e.kind === 'stamp') { this.lastStamp = this.t; continue; }
        const it = e.item;
        const r = it ? this.itemRect(it, g) : { x: g.x1, y: g.beltY - 20, w: 0, h: 0 };
        const x = r.x + r.w / 2, y = r.y - 6;
        const v = Factory.rates(this.belt.f).V * (it ? it.batch : 1);
        if (e.kind === 'caught') this.pop('Caught ✓ +' + fmtCredits(v * 0.5), x, y, '#7bd88f');
        else if (e.kind === 'auto') { this.pop('Inspector +' + fmtCredits(v * 0.2), x, y, '#9ccfd8'); this.armAnim = { t: 0 }; }
        else if (e.kind === 'escaped') this.pop('Defect shipped −' + fmtCredits(v * 0.6), g.x1, g.beltY - 50, '#eb6f92');
        else if (e.kind === 'wasted') this.pop('That one was fine', x, y, '#f6c177');
      }
    }

    pop(str, x, y, color) { this.texts.push({ str, x, y, color, t: 0 }); if (this.texts.length > 12) this.texts.shift(); }

    render(dt, look, theme) {
      this.t += dt;
      for (const tx of this.texts) tx.t += dt;
      this.texts = this.texts.filter((tx) => tx.t < 1.6);
      if (this.armAnim) { this.armAnim.t += dt; if (this.armAnim.t > 0.6) this.armAnim = null; }
      const ctx = this.ctx, g = this.geom(), f = this.belt.f;
      if (!g.W) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, g.W, g.H);

      // Floor and wall.
      ctx.fillStyle = theme.well; rr(ctx, 0.5, 0.5, g.W - 1, g.H - 1, 10); ctx.fill();
      ctx.fillStyle = rgba(theme.accent, 0.05);
      for (let k = 0; k < 5; k++) { const wx = g.W * (0.12 + k * 0.19); rr(ctx, wx, g.H * 0.1, g.W * 0.1, g.H * 0.2, 3); ctx.fill(); }

      // Belt.
      const bx = g.x0 - 6, bw = g.x1 - g.x0 + 12;
      ctx.fillStyle = '#2b2f38'; rr(ctx, bx, g.beltY, bw, g.beltH, g.beltH / 2); ctx.fill();
      ctx.strokeStyle = '#4a5060'; ctx.lineWidth = 1; ctx.stroke();
      const speed = (g.x1 - g.x0) / this.belt.travel;
      ctx.save(); ctx.beginPath(); rr(ctx, bx, g.beltY, bw, g.beltH, g.beltH / 2); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
      const off = (this.t * speed) % 14;
      for (let x = bx - 14 + off; x < bx + bw; x += 14) { ctx.beginPath(); ctx.moveTo(x, g.beltY + 2); ctx.lineTo(x - 4, g.beltY + g.beltH - 2); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#1b1e25';
      const rollers = Math.max(3, Math.floor(bw / 36));
      for (let k = 0; k <= rollers; k++) {
        const rx = bx + g.beltH / 2 + (bw - g.beltH) * (k / rollers);
        ctx.beginPath(); ctx.arc(rx, g.beltY + g.beltH + 5, 4, 0, Math.PI * 2); ctx.fill();
      }

      // Press.
      const pressW = Math.max(40, g.x0 - 18), pressX = 8, pressTop = g.H * 0.16;
      const since = this.t - this.lastStamp;
      const stroke = since < 0.35 ? Math.sin((since / 0.35) * Math.PI) : 0;
      ctx.fillStyle = '#3a4150'; rr(ctx, pressX, pressTop, pressW, g.beltY - pressTop - 4, 6); ctx.fill();
      ctx.fillStyle = theme.accent; ctx.fillRect(pressX + 6, pressTop + 6, pressW - 12, 4);
      ctx.fillStyle = '#596275';
      const headY = pressTop + 16 + stroke * (g.beltY - pressTop - 40);
      ctx.fillRect(pressX + pressW - 14, pressTop + 14, 6, headY - pressTop - 10);
      ctx.fillRect(pressX + pressW - 24, headY, 26, 8);
      ctx.fillStyle = '#e8eaf0'; ctx.font = '600 10px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('×' + L.fmt(Factory.rates(f).presses), pressX + pressW / 2 - 6, pressTop + 28);
      ctx.textAlign = 'start';

      // Inspector gate.
      const armDrop = this.armAnim ? Math.sin((this.armAnim.t / 0.6) * Math.PI) : 0;
      const inspect = f.up.inspect > 0;
      ctx.strokeStyle = inspect ? '#9ccfd8' : rgba('#9ccfd8', 0.25); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(g.gateX - 16, g.beltY); ctx.lineTo(g.gateX - 16, g.H * 0.12); ctx.lineTo(g.gateX + 16, g.H * 0.12); ctx.lineTo(g.gateX + 16, g.beltY); ctx.stroke();
      if (inspect) {
        ctx.fillStyle = '#9ccfd8';
        const armY = g.H * 0.12 + 6 + armDrop * (g.beltY - g.H * 0.12 - 30);
        ctx.fillRect(g.gateX - 2, g.H * 0.12, 4, armY - g.H * 0.12);
        ctx.fillRect(g.gateX - 9, armY, 18, 4);
        ctx.fillStyle = theme.muted; ctx.font = '600 9px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText(Math.round(Factory.rates(f).C * 100) + '%', g.gateX, g.H * 0.12 - 4);
        ctx.textAlign = 'start';
      }

      // Chute.
      ctx.fillStyle = '#3a4150';
      ctx.beginPath(); ctx.moveTo(g.x1 + 4, g.beltY + g.beltH); ctx.lineTo(g.W - 6, g.beltY + g.beltH); ctx.lineTo(g.W - 12, g.H - 6); ctx.lineTo(g.x1 + 12, g.H - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = theme.muted; ctx.font = '600 9px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('SHIP', (g.x1 + g.W) / 2, g.H - 12); ctx.textAlign = 'start';

      // Items.
      const lens = f.up.lens > 0;
      for (const it of this.belt.items) {
        const r = this.itemRect(it, g);
        const alpha = it.gone ? Math.max(0, 1 - it.fade) : 1;
        if (alpha <= 0) continue;
        const color = hsl(it.hue, 62, 64);
        if (lens && it.defect && !it.gone) {
          ctx.save(); ctx.shadowColor = '#ff5a6e'; ctx.shadowBlur = 12; ctx.fillStyle = 'rgba(255,90,110,0.12)'; rr(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 4); ctx.fill(); ctx.restore();
        }
        if (this.hover === it && !it.gone) { ctx.strokeStyle = rgba(theme.accent, 0.9); ctx.lineWidth = 1.5; rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 5); ctx.stroke(); }
        const cells = this.shape(it);
        cells.forEach(([cx, cy], i) => {
          const x = r.x + (cx - it.db.minX) * g.cs, y = r.y + (it.db.maxY - cy) * g.cs;
          const scorched = it.defect === 'burnt' && i === it.mark % cells.length;
          drawCell(ctx, look.skin, scorched ? '#3b2a22' : color, x, y, g.cs, alpha);
          if (it.defect === 'crack' && i === it.mark % cells.length) {
            ctx.strokeStyle = 'rgba(20,20,24,' + 0.85 * alpha + ')'; ctx.lineWidth = Math.max(1, g.cs * 0.09);
            ctx.beginPath(); ctx.moveTo(x + g.cs * 0.15, y + g.cs * 0.2); ctx.lineTo(x + g.cs * 0.5, y + g.cs * 0.55); ctx.lineTo(x + g.cs * 0.4, y + g.cs * 0.7); ctx.lineTo(x + g.cs * 0.85, y + g.cs * 0.9); ctx.stroke();
          }
          if (scorched) { ctx.fillStyle = 'rgba(255,140,60,' + 0.35 * alpha + ')'; ctx.fillRect(x + g.cs * 0.3, y + g.cs * 0.3, g.cs * 0.25, g.cs * 0.2); }
        });
        if (it.batch > 1 && !it.gone) {
          ctx.fillStyle = theme.muted; ctx.font = '600 9px ' + FONT; ctx.textAlign = 'center';
          ctx.fillText('×' + L.fmt(it.batch), r.x + r.w / 2, g.beltY + g.beltH + 14); ctx.textAlign = 'start';
        }
      }

      // Floating notes.
      for (const tx of this.texts) {
        const k = tx.t / 1.6;
        ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        ctx.font = '700 11px ' + FONT; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeText(tx.str, tx.x, tx.y - k * 22);
        ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y - k * 22);
        ctx.globalAlpha = 1; ctx.textAlign = 'start';
      }
    }
  }

  L.BeltView = BeltView;
  void shade;
})(typeof globalThis !== 'undefined' ? globalThis : this);
