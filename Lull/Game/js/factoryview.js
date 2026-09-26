// Lull — the factory floor on screen: a press that stamps and steams, a moving belt, the inspector's arm, a reject
// bin, a shipping crate that fills and rolls away. Click defects off the belt, golden minos for lines, and shapes a
// rush order asks for.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Factory, Render, Pieces } = L;
  const { rgba, shade, hsl, drawCell, rr, FONT } = Render;

  const TIER_MAX_H = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  class BeltView {
    constructor(canvas, belt) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.belt = belt;
      this.cssW = 0; this.cssH = 0; this.dpr = 1;
      this.texts = [];
      this.parts = [];
      this.hover = null;
      this.lastStamp = -10;
      this.armT = -10;
      this.crate = 0;
      this.crateOut = 0;
      this.flash = null;
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
      const x0 = Math.round(Math.min(96, W * 0.2)), x1 = Math.round(W - Math.min(78, W * 0.17));
      const floorY = Math.round(H - 18);
      const beltH = Math.max(12, Math.round(H * 0.07));
      const beltY = Math.round(floorY - beltH - 26);
      const room = beltY - Math.max(58, H * 0.26);
      const cs = Math.max(6, Math.min(24, Math.floor(room / Math.max(2, TIER_MAX_H[this.belt.f.tier] + 0.6))));
      return { W, H, x0, x1, beltY, beltH, floorY, cs, gateX: x0 + (x1 - x0) * Factory.Belt.INSPECT, bin: { x: x0 + 6, y: floorY - 4 }, crate: { x: x1 + 8, y: floorY } };
    }

    /** The cells of an item laid out landscape, cached on the item. */
    shape(it) {
      if (!it.draw) {
        let cells = it.cells;
        const b = Pieces.boundsOf(cells);
        if (b.h > b.w) cells = cells.map(([x, y]) => [y, x]);
        it.draw = Pieces.normalize(cells);
        it.db = Pieces.boundsOf(it.draw);
      }
      return it.draw;
    }

    /** Where an item is on screen, including its flight once it leaves the belt. */
    itemRect(it, g) {
      this.shape(it);
      const w = it.db.w * g.cs, h = it.db.h * g.cs;
      const cx = g.x0 + (g.x1 - g.x0) * Math.min(it.x, 1);
      let x = cx - w / 2, y = g.beltY - h;
      if (it.stamp < 0.25) y -= (1 - ease(it.stamp / 0.25)) * 26; // dropping out of the press
      if (it.gone) {
        const k = ease(Math.min(1, it.fade));
        let tx = x, ty = y;
        if (it.gone === 'caught' || it.gone === 'wasted' || it.gone === 'auto') { tx = g.bin.x; ty = g.bin.y - h; }
        else if (it.gone === 'golden') { tx = g.W - 60; ty = -h; }
        else if (it.gone === 'packed') { tx = g.W / 2 - w / 2; ty = 8; }
        else if (it.gone === 'shipped') { tx = g.crate.x + 10; ty = g.floorY - h - 6; }
        const arc = it.gone === 'shipped' ? 0 : -Math.sin(k * Math.PI) * 40;
        x = x + (tx - x) * k; y = y + (ty - y) * k + arc;
      }
      return { x, y, w, h };
    }

    itemAt(px, py) {
      const g = this.geom();
      let best = null, bestD = Infinity;
      for (const it of this.belt.items) {
        if (it.gone) continue;
        const r = this.itemRect(it, g);
        if (px < r.x - 7 || px > r.x + r.w + 7 || py < r.y - 7 || py > r.y + r.h + 7) continue;
        const d = Math.hypot(px - (r.x + r.w / 2), py - (r.y + r.h / 2));
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    }

    handleEvents(events, fmtCredits) {
      const g = this.geom();
      for (const e of events) {
        if (e.kind === 'stamp') { this.lastStamp = this.t; this.puff(g.x0 - 10, Math.max(48, g.H * 0.2) + 6, 4); continue; }
        const it = e.item;
        const r = it ? this.itemRect(it, g) : { x: g.W / 2, y: g.beltY - 40, w: 0, h: 0 };
        const x = r.x + r.w / 2, y = r.y - 8;
        const V = Factory.rates(this.belt.f).V * (it ? it.batch : 1);
        if (e.kind === 'caught') { this.pop('Pulled ✓ +' + fmtCredits(V * 0.5 * this.belt.streakMult()), x, y, '#7bd88f'); this.burst(x, y + r.h / 2, '#7bd88f', 10); }
        else if (e.kind === 'auto') { this.armT = this.t; this.pop('Inspector', x, y, '#9ccfd8'); }
        else if (e.kind === 'escaped') { this.pop('Defect shipped −' + fmtCredits(V * 0.6), g.x1 - 10, g.beltY - 64, '#eb6f92'); this.flash = { color: '#eb6f92', t: this.t }; }
        else if (e.kind === 'wasted') { this.pop('That one was fine', x, y, '#f6c177'); this.flash = { color: '#f6c177', t: this.t }; }
        else if (e.kind === 'golden') { this.pop('Golden! +' + e.lines + ' ◆', x, y, '#ffd866'); this.burst(x, y + r.h / 2, '#ffd866', 22); }
        else if (e.kind === 'packed') { this.pop('Packed ' + e.rush.got + '/' + e.rush.need, x, y, '#c4a7e7'); this.burst(x, y + r.h / 2, '#c4a7e7', 10); }
        else if (e.kind === 'rushDone') { this.pop('Rush order filled!', g.W / 2, 60, '#c4a7e7'); this.burst(g.W / 2, 40, '#c4a7e7', 30); }
        else if (e.kind === 'shipped') { this.crate = Math.min(1, this.crate + 0.12); if (this.crate >= 1 && !this.crateOut) this.crateOut = this.t; }
      }
    }

    pop(str, x, y, color) { this.texts.push({ str, x, y, color, t: 0 }); if (this.texts.length > 10) this.texts.shift(); }
    puff(x, y, n) { for (let i = 0; i < n; i++) this.parts.push({ kind: 'steam', x: x + Math.random() * 16, y, vx: (Math.random() - 0.5) * 12, vy: -18 - Math.random() * 16, life: 0, max: 1.4 + Math.random() * 0.8, r: 5 + Math.random() * 6 }); }
    burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 120; this.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0, max: 0.5 + Math.random() * 0.4, color }); } }

    render(dt, look, theme, opts) {
      opts = opts || {};
      this.t += dt;
      for (const tx of this.texts) tx.t += dt;
      this.texts = this.texts.filter((tx) => tx.t < 1.6);
      for (const p of this.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'spark') p.vy += 260 * dt; else p.r += dt * 6; }
      this.parts = this.parts.filter((p) => p.life < p.max);
      if (this.parts.length > 160) this.parts.splice(0, this.parts.length - 160);
      const ctx = this.ctx, g = this.geom(), f = this.belt.f, belt = this.belt;
      if (!g.W) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, g.W, g.H);
      const dark = theme.name !== 'light';

      // Wall, windows with a slow sky, pipes, floor.
      ctx.save();
      rr(ctx, 0.5, 0.5, g.W - 1, g.H - 1, 12); ctx.clip();
      const wall = ctx.createLinearGradient(0, 0, 0, g.H);
      wall.addColorStop(0, dark ? '#1b2030' : '#e4e8f0'); wall.addColorStop(1, dark ? '#10131b' : '#cfd5df');
      ctx.fillStyle = wall; ctx.fillRect(0, 0, g.W, g.H);
      const winY = 14, winH = Math.max(24, g.beltY * 0.28);
      for (let k = 0; k < 5; k++) {
        const wx = g.W * (0.08 + k * 0.19), ww = g.W * 0.12;
        const sky = ctx.createLinearGradient(0, winY, 0, winY + winH);
        sky.addColorStop(0, dark ? '#24365a' : '#9cc3ec'); sky.addColorStop(1, dark ? '#3a2f55' : '#dcecfb');
        ctx.fillStyle = sky; rr(ctx, wx, winY, ww, winH, 3); ctx.fill();
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)';
        const cloud = ((this.t * 4 + k * 57) % (ww + 40)) - 20;
        ctx.beginPath(); ctx.ellipse(wx + cloud, winY + winH * 0.4, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = dark ? '#2b3246' : '#b8c0cc'; ctx.lineWidth = 2; rr(ctx, wx, winY, ww, winH, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wx + ww / 2, winY); ctx.lineTo(wx + ww / 2, winY + winH); ctx.stroke();
      }
      ctx.fillStyle = dark ? '#2a3040' : '#aab3c1';
      ctx.fillRect(0, winY + winH + 8, g.W, 5);
      ctx.fillStyle = dark ? '#0c0e14' : '#bcc3cf'; ctx.fillRect(0, g.floorY, g.W, g.H - g.floorY);
      ctx.strokeStyle = 'rgba(242,193,78,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(0, g.floorY + 1.5); ctx.lineTo(g.W, g.floorY + 1.5); ctx.stroke(); ctx.setLineDash([]);

      // Error flash.
      if (this.flash && this.t - this.flash.t < 0.5) { ctx.fillStyle = rgba(this.flash.color, 0.18 * (1 - (this.t - this.flash.t) / 0.5)); ctx.fillRect(0, 0, g.W, g.H); }

      // Belt with treads and turning rollers.
      const bx = g.x0 - 8, bw = g.x1 - g.x0 + 16;
      ctx.fillStyle = '#3a4150'; ctx.fillRect(bx + 10, g.beltY + g.beltH, 6, g.floorY - g.beltY - g.beltH); ctx.fillRect(bx + bw - 16, g.beltY + g.beltH, 6, g.floorY - g.beltY - g.beltH);
      const speed = (g.x1 - g.x0) / belt.travel;
      ctx.fillStyle = '#23272f'; rr(ctx, bx, g.beltY, bw, g.beltH, g.beltH / 2); ctx.fill();
      ctx.save(); ctx.beginPath(); rr(ctx, bx, g.beltY, bw, g.beltH, g.beltH / 2); ctx.clip();
      ctx.fillStyle = '#343a46'; ctx.fillRect(bx, g.beltY, bw, 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 2;
      const off = (this.t * speed) % 12;
      for (let x = bx - 12 + off; x < bx + bw + 12; x += 12) { ctx.beginPath(); ctx.moveTo(x, g.beltY + 3); ctx.lineTo(x - 4, g.beltY + g.beltH); ctx.stroke(); }
      ctx.restore();
      const rollers = Math.max(3, Math.floor(bw / 44));
      for (let k = 0; k <= rollers; k++) {
        const rx = bx + g.beltH / 2 + (bw - g.beltH) * (k / rollers), ry = g.beltY + g.beltH / 2, rad = g.beltH / 2 - 2;
        ctx.fillStyle = '#4b5263'; ctx.beginPath(); ctx.arc(rx, ry, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1a1d24'; ctx.lineWidth = 1.2;
        const a = this.t * speed / Math.max(1, rad);
        for (let s = 0; s < 3; s++) { const aa = a + s * 2.094; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(aa) * rad, ry + Math.sin(aa) * rad); ctx.stroke(); }
      }

      // Reject bin.
      const bin = g.bin;
      ctx.fillStyle = '#4a2f36'; rr(ctx, bin.x - 20, bin.y - 24, 40, 24, 4); ctx.fill();
      ctx.fillStyle = '#eb6f92'; ctx.fillRect(bin.x - 20, bin.y - 24, 40, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '700 8px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('REJECT', bin.x, bin.y - 9); ctx.textAlign = 'start';

      // The press: stamps, then steams.
      const pressW = Math.max(36, Math.min(56, g.x0 - 36)), pressX = 6, pressTop = Math.max(48, g.H * 0.2);
      const since = this.t - this.lastStamp;
      const stroke = since < 0.3 ? Math.sin((since / 0.3) * Math.PI) : 0;
      const body = ctx.createLinearGradient(pressX, 0, pressX + pressW, 0);
      body.addColorStop(0, '#4a556b'); body.addColorStop(1, '#2d3442');
      ctx.fillStyle = body; rr(ctx, pressX, pressTop, pressW, g.floorY - pressTop, 7); ctx.fill();
      ctx.fillStyle = theme.accent; ctx.fillRect(pressX + 6, pressTop + 7, pressW - 12, 4);
      ctx.fillStyle = '#e8eaf0'; ctx.font = '700 10px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('×' + L.fmt(Factory.rates(f).presses), pressX + pressW / 2, pressTop + 26);
      ctx.font = '600 8px ' + FONT; ctx.fillStyle = 'rgba(232,234,240,0.6)'; ctx.fillText(Factory.TIERS[f.tier].short.toUpperCase(), pressX + pressW / 2, pressTop + 38);
      ctx.textAlign = 'start';
      // Gauge that swings with every stamp.
      const gx = pressX + pressW / 2, gy = pressTop + 58;
      ctx.fillStyle = '#1b1f28'; ctx.beginPath(); ctx.arc(gx, gy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f6c177'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx, gy); const ga = -2.4 + stroke * 1.8 + Math.sin(this.t * 2) * 0.08; ctx.lineTo(gx + Math.cos(ga) * 7, gy + Math.sin(ga) * 7); ctx.stroke();
      // A beam out over the belt, and the stamping head that drops on it.
      const headX = g.x0 + 4, beamY = pressTop + 12;
      ctx.fillStyle = '#5b6477'; ctx.fillRect(pressX + pressW - 4, beamY, headX - pressX - pressW + 22, 10);
      const headY = beamY + 10 + 6 + stroke * Math.max(8, g.beltY - beamY - 64);
      ctx.fillStyle = '#6b7488'; ctx.fillRect(headX - 3, beamY + 10, 6, headY - beamY - 10);
      ctx.fillStyle = '#8a93a8'; rr(ctx, headX - 18, headY, 36, 11, 2); ctx.fill();
      ctx.fillStyle = theme.accent; ctx.fillRect(headX - 18, headY + 9, 36, 2);
      if (since < 0.12) { ctx.fillStyle = 'rgba(255,220,150,0.45)'; ctx.beginPath(); ctx.arc(headX, headY + 14, 12, 0, Math.PI * 2); ctx.fill(); }

      // Inspector's gate and arm.
      const inspect = f.up.inspect > 0;
      const gTop = Math.max(40, g.H * 0.18);
      ctx.strokeStyle = inspect ? '#7fb2bd' : rgba('#9ccfd8', 0.25); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(g.gateX - 20, g.beltY); ctx.lineTo(g.gateX - 20, gTop); ctx.lineTo(g.gateX + 20, gTop); ctx.lineTo(g.gateX + 20, g.beltY); ctx.stroke();
      if (inspect) {
        const at = this.t - this.armT, grab = at < 0.6 ? Math.sin((at / 0.6) * Math.PI) : 0;
        const reach = gTop + 10 + grab * (g.beltY - gTop - 30);
        ctx.strokeStyle = '#9ccfd8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(g.gateX, gTop); ctx.lineTo(g.gateX - 8 * grab, (gTop + reach) / 2); ctx.lineTo(g.gateX, reach); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g.gateX - 8, reach + 8); ctx.lineTo(g.gateX, reach); ctx.lineTo(g.gateX + 8, reach + 8); ctx.stroke();
        ctx.fillStyle = at < 0.6 ? '#eb6f92' : '#7bd88f'; ctx.beginPath(); ctx.arc(g.gateX, gTop - 6, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = theme.muted; ctx.font = '600 9px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText(Math.round(Factory.rates(f).C * 100) + '%', g.gateX, gTop - 14); ctx.textAlign = 'start';
      }

      // Shipping crate: fills up, rolls away, a new one rolls in.
      const out = this.crateOut ? (this.t - this.crateOut) / 1.2 : 0;
      if (out >= 1) { this.crateOut = 0; this.crate = 0; }
      const crateX = g.crate.x + (out > 0 ? (out < 0.5 ? out * 2 * 90 : (1 - (out - 0.5) * 2) * -40) : 0);
      const cw = Math.min(66, g.W - g.x1 - 4), ch = 34;
      ctx.fillStyle = '#8a5a2b'; rr(ctx, crateX, g.floorY - ch, cw, ch, 3); ctx.fill();
      ctx.strokeStyle = '#6a4220'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(crateX, g.floorY - ch); ctx.lineTo(crateX + cw, g.floorY); ctx.moveTo(crateX + cw, g.floorY - ch); ctx.lineTo(crateX, g.floorY); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(crateX + 4, g.floorY - ch - 4, (cw - 8) * (out > 0 ? 1 : this.crate), 3);
      ctx.fillStyle = theme.muted; ctx.font = '700 8px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('SHIP', crateX + cw / 2, g.floorY - ch - 8); ctx.textAlign = 'start';

      // Items.
      const rush = belt.rush;
      for (const it of belt.items) {
        const r = this.itemRect(it, g);
        const alpha = it.gone ? Math.max(0, 1 - Math.max(0, it.fade - 0.55) / 0.45) : 1;
        if (alpha <= 0) continue;
        const color = it.golden ? '#ffd24a' : hsl(it.hue, 62, 64);
        if (!it.gone) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, g.beltY + 2, r.w / 2 + 2, 3, 0, 0, Math.PI * 2); ctx.fill(); }
        const wanted = rush && !it.gone && !it.defect && Pieces.freeKey(it.cells) === rush.key;
        if (wanted) { ctx.save(); ctx.strokeStyle = '#c4a7e7'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -this.t * 20; rr(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, 5); ctx.stroke(); ctx.restore(); }
        if (it.golden && !it.gone) { ctx.save(); ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 14 + Math.sin(this.t * 6) * 5; ctx.fillStyle = 'rgba(255,210,74,0.2)'; rr(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 4); ctx.fill(); ctx.restore(); }
        if (this.hover === it && !it.gone) { ctx.strokeStyle = rgba(theme.accent, 0.95); ctx.lineWidth = 2; rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 5); ctx.stroke(); }
        const cells = this.shape(it);
        cells.forEach(([cx, cy], i) => {
          const x = r.x + (cx - it.db.minX) * g.cs, y = r.y + (it.db.maxY - cy) * g.cs;
          const scorched = it.defect === 'burnt' && i === it.mark % cells.length;
          drawCell(ctx, look.skin, scorched ? '#3b2a22' : color, x, y, g.cs, alpha);
          if (it.defect === 'crack' && i === it.mark % cells.length) {
            ctx.strokeStyle = 'rgba(20,20,24,' + 0.9 * alpha + ')'; ctx.lineWidth = Math.max(1, g.cs * 0.09);
            ctx.beginPath(); ctx.moveTo(x + g.cs * 0.15, y + g.cs * 0.2); ctx.lineTo(x + g.cs * 0.5, y + g.cs * 0.55); ctx.lineTo(x + g.cs * 0.4, y + g.cs * 0.7); ctx.lineTo(x + g.cs * 0.85, y + g.cs * 0.9); ctx.stroke();
          }
          if (scorched) { ctx.fillStyle = 'rgba(255,140,60,' + 0.45 * alpha + ')'; ctx.fillRect(x + g.cs * 0.3, y + g.cs * 0.3, g.cs * 0.25, g.cs * 0.2); }
        });
        if (it.golden && !it.gone) { ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * Math.sin(this.t * 8)) + ')'; ctx.fillRect(r.x + r.w * 0.2, r.y + 2, 2, 2); }
        if (it.gone === 'wasted' && it.fade < 0.6) { ctx.strokeStyle = '#f6c177'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke(); }
        if (it.batch > 1 && !it.gone) {
          ctx.fillStyle = theme.muted; ctx.font = '600 9px ' + FONT; ctx.textAlign = 'center';
          ctx.fillText('×' + L.fmt(it.batch), r.x + r.w / 2, g.beltY + g.beltH + 12); ctx.textAlign = 'start';
        }
      }

      // Particles.
      for (const p of this.parts) {
        const k = p.life / p.max;
        if (p.kind === 'steam') { ctx.fillStyle = 'rgba(220,226,238,' + 0.28 * (1 - k) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = rgba(p.color, 1 - k); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
      }

      // HUD: QC streak (top left) and a rush order (top centre).
      const st = f.streak, mult = belt.streakMult();
      ctx.fillStyle = dark ? 'rgba(10,12,18,0.72)' : 'rgba(255,255,255,0.8)'; rr(ctx, 8, 8, 132, 30, 7); ctx.fill();
      ctx.fillStyle = theme.fg; ctx.font = '700 11px ' + FONT; ctx.fillText('QC streak ' + st, 16, 21);
      ctx.fillStyle = mult > 1 ? '#7bd88f' : theme.muted; ctx.textAlign = 'right'; ctx.fillText('×' + mult.toFixed(2), 132, 21); ctx.textAlign = 'start';
      ctx.fillStyle = rgba(theme.accent, 0.2); rr(ctx, 16, 27, 116, 4, 2); ctx.fill();
      ctx.fillStyle = '#7bd88f'; rr(ctx, 16, 27, 116 * Math.min(1, st / 20), 4, 2); ctx.fill();
      if (rush) {
        const bw2 = Math.min(230, g.W - 170), bxx = Math.max(148, (g.W - bw2) / 2);
        ctx.fillStyle = dark ? 'rgba(40,26,60,0.88)' : 'rgba(240,230,255,0.92)'; rr(ctx, bxx, 8, bw2, 30, 7); ctx.fill();
        ctx.strokeStyle = '#c4a7e7'; ctx.lineWidth = 1.5; rr(ctx, bxx, 8, bw2, 30, 7); ctx.stroke();
        ctx.fillStyle = theme.fg; ctx.font = '700 10px ' + FONT; ctx.fillText('RUSH ' + rush.got + '/' + rush.need, bxx + 8, 21);
        const ib = Pieces.boundsOf(rush.cells), is = Math.min(5, 18 / Math.max(ib.w, ib.h));
        for (const [cx, cy] of rush.cells) { ctx.fillStyle = '#c4a7e7'; ctx.fillRect(bxx + 78 + (cx - ib.minX) * is, 11 + (ib.maxY - cy) * is, is - 0.5, is - 0.5); }
        ctx.fillStyle = theme.muted; ctx.font = '600 9px ' + FONT; ctx.fillText('click matching shapes', bxx + 104, 21);
        ctx.fillStyle = rgba('#c4a7e7', 0.25); rr(ctx, bxx + 8, 29, bw2 - 16, 4, 2); ctx.fill();
        ctx.fillStyle = '#c4a7e7'; rr(ctx, bxx + 8, 29, (bw2 - 16) * Math.max(0, rush.time / rush.total), 4, 2); ctx.fill();
      }

      // Floating notes.
      for (const tx of this.texts) {
        const k = tx.t / 1.6;
        ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(tx.str, tx.x, tx.y - k * 24);
        ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y - k * 24);
        ctx.globalAlpha = 1; ctx.textAlign = 'start';
      }
      ctx.restore();
      void opts; void shade;
    }
  }

  L.BeltView = BeltView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
