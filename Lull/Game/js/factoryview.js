// Lull — the Mino Works on canvas: the ticket rail, the five stations (Orders, Mold, Kiln, Paint, Line) and the
// customer's review. Everything is drawn in a 480 × 540 design space and scaled to fit; the walls and floor
// stretch to fill whatever is left over.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { rr, rgba, shade, mix, FONT } = Render;

  const W = 480, H = 540, RAIL = 92;
  const CLAY = '#d9d0c3';
  const GOLD = '#ffd35a';
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (k) => 1 - Math.pow(1 - clamp01(k), 3);

  function font(size, weight) { return (weight || 600) + ' ' + size + 'px ' + FONT; }

  function text(ctx, str, x, y, size, color, align, weight, base) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = base || 'middle';
    ctx.fillText(str, x, y);
  }

  function star(ctx, cx, cy, r, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, r * 0.18); ctx.stroke(); }
  }

  function flame(ctx, cx, by, s, t, phase) {
    const wob = Math.sin(t * 9 + (phase || 0)) * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx, by);
    ctx.bezierCurveTo(cx - s * 0.5, by, cx - s * 0.45, by - s * 0.55, cx + wob, by - s);
    ctx.bezierCurveTo(cx + s * 0.45, by - s * 0.55, cx + s * 0.5, by, cx, by);
    const g = ctx.createLinearGradient(0, by - s, 0, by);
    g.addColorStop(0, '#ffd166'); g.addColorStop(1, '#ff6b3d');
    ctx.fillStyle = g; ctx.fill();
  }

  /** A cell as the workshop draws it: rounded, softly lit. */
  function block(ctx, x, y, s, color, o) {
    o = o || {};
    const r = Math.max(2, s * 0.18);
    ctx.fillStyle = color;
    rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rr(ctx, x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.28, r * 0.6); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    rr(ctx, x + 0.5, y + s * 0.78, s - 1, s * 0.22 - 0.5, r * 0.6); ctx.fill();
    if (o.outline) { ctx.strokeStyle = o.outline; ctx.lineWidth = 1.5; rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, r); ctx.stroke(); }
  }

  function button(ctx, hits, id, x, y, w, h, label, o) {
    o = o || {};
    const hover = o.hover === id && !o.disabled;
    const col = o.disabled ? '#8a8f99' : (o.color || '#f28c38');
    ctx.save();
    ctx.globalAlpha = o.disabled ? 0.55 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(ctx, x, y + 3, w, h, h / 2); ctx.fill();
    ctx.fillStyle = hover ? shade(col, 0.08) : col;
    rr(ctx, x, y + (hover ? 1 : 0), w, h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, x + 4, y + 3 + (hover ? 1 : 0), w - 8, h * 0.38, h / 3); ctx.fill();
    text(ctx, label, x + w / 2, y + h / 2 + (hover ? 1 : 0), o.size || Math.min(17, h * 0.42), '#fff', 'center', 800);
    ctx.restore();
    if (!o.disabled) hits.push({ id, x, y, w, h, data: o.data });
  }

  /** The shape of an order in a box, in its paints, with its stickers. */
  function drawShape(ctx, order, cx, cy, maxW, maxH, o) {
    o = o || {};
    const b = Factory.bounds(order.cells);
    const s = Math.floor(Math.min(maxW / b.w, maxH / b.h, o.max || 30));
    const x0 = cx - (b.w * s) / 2, y0 = cy - (b.h * s) / 2;
    order.cells.forEach(([x, y], i) => {
      const col = o.plain ? o.plain : Factory.PAINTS[order.colors[i]].c;
      block(ctx, x0 + x * s, y0 + y * s, s, col);
      if (!o.noStickers && order.stickers.includes(i)) star(ctx, x0 + x * s + s / 2, y0 + y * s + s / 2, s * 0.3, GOLD, 'rgba(120,80,0,0.6)');
    });
    return { s, x0, y0 };
  }

  /** A paper ticket: order number, the piece, its firing and quantity. */
  function drawTicket(ctx, order, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    if (o.angle) { ctx.translate(x + w / 2, y); ctx.rotate(o.angle); ctx.translate(-(x + w / 2), -y); }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, x + 2, y + 4, w, h, 4); ctx.fill();
    ctx.fillStyle = '#fbf7ee';
    rr(ctx, x, y, w, h, 4); ctx.fill();
    if (o.active) { ctx.strokeStyle = o.accent || '#f28c38'; ctx.lineWidth = 3; rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 5); ctx.stroke(); }
    // Header strip
    const hh = Math.max(14, h * 0.17);
    ctx.fillStyle = '#efe6d2';
    rr(ctx, x, y, w, hh, 4); ctx.fill();
    ctx.fillRect(x, y + hh - 4, w, 4);
    text(ctx, '#' + order.no, x + 7, y + hh / 2 + 1, Math.max(9, hh * 0.58), '#6b5f4b', 'left', 800);
    if (order.qty > 1) text(ctx, '×' + order.qty, x + w - 7, y + hh / 2 + 1, Math.max(9, hh * 0.62), '#c2552d', 'right', 800);
    // Footer: the firing, as flames (1 soft, 2 firm, 3 hard)
    const fh = Math.max(12, h * 0.17);
    const fy = y + h - fh;
    ctx.strokeStyle = 'rgba(107,95,75,0.25)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 5, fy); ctx.lineTo(x + w - 5, fy); ctx.stroke(); ctx.setLineDash([]);
    const fs = fh * 0.62;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < order.fire ? 1 : 0.18;
      flame(ctx, x + 10 + fs * 0.5 + i * fs * 0.95, fy + fh * 0.82, fs, 0, 0);
    }
    ctx.globalAlpha = 1;
    if (o.big) text(ctx, Factory.FIRING[order.fire].name, x + w - 7, fy + fh / 2, Math.max(9, fh * 0.5), '#6b5f4b', 'right', 700);
    drawShape(ctx, order, x + w / 2, y + hh + (h - hh - fh) / 2, w - 16, h - hh - fh - 10, { max: o.big ? 26 : 14 });
    // The clip it hangs from.
    if (o.clip) {
      ctx.fillStyle = '#9aa3b2'; rr(ctx, x + w / 2 - 9, y - 7, 18, 12, 3); ctx.fill();
      ctx.fillStyle = '#c7ced9'; rr(ctx, x + w / 2 - 9, y - 7, 18, 4, 2); ctx.fill();
    }
    ctx.restore();
  }

  const STAGE_BADGE = {
    mold: { glyph: '▦', color: '#c98f5a' },
    kiln: { glyph: '♨', color: '#e0643c' },
    paint: { glyph: '●', color: '#8a6fc4' },
  };

  function caption(ctx, str, x, y) {
    ctx.font = font(15, 800);
    const w = ctx.measureText(str).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x - w / 2, y - 16, w, 32, 16); ctx.fill();
    text(ctx, str, x, y + 1, 15, '#fff', 'center', 800);
  }

  class WorksView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hits = [];
      this.hover = null;
      this.pointer = null; // in design space
      this.fx = []; // floating texts, flying minos, puffs
      this.t = 0;
      this.k = 1; this.ox = 0; this.oy = 0;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w !== this.cw || h !== this.ch || dpr !== this.dpr) {
        this.cw = w; this.ch = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      this.k = Math.min(w / W, h / H);
      // Centred sideways; pinned to the top, with the floor running on below.
      this.ox = (w - W * this.k) / 2; this.oy = 0;
    }

    /** Canvas pixels (CSS) to design space. */
    toDesign(px, py) { return [(px - this.ox) / this.k, (py - this.oy) / this.k]; }

    hitAt(px, py) {
      const [x, y] = this.toDesign(px, py);
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
      }
      return null;
    }

    float(str, x, y, color, size) { this.fx.push({ kind: 'text', str, x, y, color, size: size || 15, t: 0, dur: 1.1 }); }
    puff(x, y, color, n) {
      for (let i = 0; i < (n || 8); i++) { const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60; this.fx.push({ kind: 'puff', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, color, r: 4 + Math.random() * 6, t: 0, dur: 0.5 + Math.random() * 0.4 }); }
    }
    mist(x, y, color) { this.fx.push({ kind: 'mist', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, color, r: 2 + Math.random() * 3, t: 0, dur: 0.35 + Math.random() * 0.3 }); }
    fling(item, x0, y0, x1, y1, cell) { this.fx.push({ kind: 'fling', item, x0, y0, x1, y1, cell, t: 0, dur: 0.55 }); }

    stepFx(dt) {
      for (const f of this.fx) {
        f.t += dt;
        if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.exp(-3 * dt); f.vy *= Math.exp(-3 * dt); }
      }
      this.fx = this.fx.filter((f) => f.t < f.dur);
    }

    drawFx(ctx) {
      for (const f of this.fx) {
        const k = f.t / f.dur, a = 1 - k;
        if (f.kind === 'text') {
          ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.font = font(f.size, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeText(f.str, f.x, f.y - k * 26); ctx.fillStyle = f.color; ctx.fillText(f.str, f.x, f.y - k * 26); ctx.restore();
        } else if (f.kind === 'puff' || f.kind === 'mist') {
          ctx.fillStyle = rgba(f.color, (f.kind === 'mist' ? 0.5 : 0.35) * a);
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k), 0, Math.PI * 2); ctx.fill();
        } else if (f.kind === 'fling') {
          const e = ease(k), x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 60;
          ctx.save(); ctx.translate(x, y); ctx.rotate(k * 5); ctx.globalAlpha = k < 0.85 ? 1 : (1 - k) / 0.15;
          this.drawItem(ctx, f.item, 0, 0, f.cell, true);
          ctx.restore();
        }
      }
    }

    // ---- frame ---------------------------------------------------------------------------------------------------

    /**
     * st: { station, f, work: { inbox, tickets }, active, printing, judge, kilnSlots, paintTool, line, look, t, dt,
     *       spraying }
     */
    render(st) {
      const ctx = this.ctx;
      this.t = st.t;
      this.stepFx(st.dt || 0);
      this.hits = [];
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.cw, this.ch);
      ctx.translate(this.ox, this.oy);
      ctx.scale(this.k, this.k);
      // The visible area in design space (the walls stretch to fill it).
      this.vx0 = -this.ox / this.k; this.vx1 = (this.cw - this.ox) / this.k;
      this.vy0 = -this.oy / this.k; this.vy1 = (this.ch - this.oy) / this.k;
      const scene = { orders: this.drawOrders, mold: this.drawMold, kiln: this.drawKiln, paint: this.drawPaint, line: this.drawLine }[st.station];
      ctx.save();
      scene.call(this, ctx, st);
      ctx.restore();
      this.drawRail(ctx, st);
      if (st.judge) { this.hits = []; this.drawJudge(ctx, st); }
      this.drawFx(ctx);
    }

    wall(ctx, top, bottom, y0, y1) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(this.vx0, y0, this.vx1 - this.vx0, y1 - y0);
    }

    floor(ctx, y, color, edge) {
      ctx.fillStyle = color; ctx.fillRect(this.vx0, y, this.vx1 - this.vx0, this.vy1 - y);
      ctx.fillStyle = edge; ctx.fillRect(this.vx0, y, this.vx1 - this.vx0, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(this.vx0, y + 10, this.vx1 - this.vx0, 4);
    }

    // ---- the rail --------------------------------------------------------------------------------------------------

    drawRail(ctx, st) {
      const top = Math.min(0, this.vy0);
      ctx.fillStyle = '#2a2f39'; ctx.fillRect(this.vx0, top, this.vx1 - this.vx0, RAIL - top);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(this.vx0, RAIL - 3, this.vx1 - this.vx0, 3);
      // The rod
      ctx.fillStyle = '#7d8696'; ctx.fillRect(this.vx0, 12, this.vx1 - this.vx0, 5);
      ctx.fillStyle = '#b3bccb'; ctx.fillRect(this.vx0, 12, this.vx1 - this.vx0, 1.5);
      const tickets = st.work.tickets;
      for (let i = 0; i < 3; i++) {
        const x = 14 + i * 110, y = 18, w = 98, h = 68;
        const job = tickets[i];
        if (!job) {
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
          rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4); ctx.stroke(); ctx.setLineDash([]);
          continue;
        }
        let tx = x, ty = y;
        if (job.fly != null && job.fly < 1) {
          const e = ease(job.fly);
          tx = 360 + (x - 360) * e; ty = 300 + (y - 300) * e;
        }
        const swing = job.hung != null ? Math.sin((this.t - job.hung) * 9) * Math.exp(-(this.t - job.hung) * 3) * 0.08 : 0;
        const hover = this.hover && this.hover.id === 'ticket' && this.hover.data === i;
        drawTicket(ctx, job.order, tx, ty + (hover ? 2 : 0), w, h, { active: job === st.active, clip: true, angle: swing });
        // Where it is on the line, and whether the kiln wants it out.
        const b = STAGE_BADGE[job.stage];
        if (b) {
          let col = b.color, pulse = 0;
          if (job.stage === 'kiln') {
            const d = Math.abs(job.heat - Factory.FIRING[job.order.fire].at);
            if (d <= Factory.FIRE_BAND) { col = '#4caf6a'; pulse = 1; }
            else if (job.heat > Factory.FIRING[job.order.fire].at) { col = '#d64545'; pulse = 1; }
          }
          const r = 9 + (pulse ? Math.sin(this.t * 8) * 1.5 : 0);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(tx + w - 4, ty + h - 4, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fbf7ee'; ctx.lineWidth = 2; ctx.stroke();
          text(ctx, b.glyph, tx + w - 4, ty + h - 3.5, 11, '#fff', 'center', 800);
        }
        this.hits.push({ id: 'ticket', x, y, w, h, data: i });
      }
      // Rank medal: stars toward the next rank, as a ring.
      const f = st.f, need = Factory.rankNeed(f.rank), cx = 430, cy = 50;
      ctx.fillStyle = '#1f232b'; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(f.rp / need)); ctx.stroke(); ctx.lineCap = 'butt';
      text(ctx, 'RANK', cx, cy - 9, 8.5, '#aab3c2', 'center', 800);
      text(ctx, String(f.rank), cx, cy + 7, 20, '#fff', 'center', 800);
      this.hits.push({ id: 'rank', x: cx - 30, y: cy - 30, w: 60, h: 60 });
    }

    // ---- Orders ------------------------------------------------------------------------------------------------------

    drawOrders(ctx, st) {
      this.wall(ctx, '#3f7480', '#2d5862', RAIL, 420);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let x = Math.floor(this.vx0 / 24) * 24; x < this.vx1; x += 24) ctx.fillRect(x, RAIL, 12, 420 - RAIL);
      this.floor(ctx, 420, '#7b5236', '#9a6a45');
      const inbox = st.work.inbox, tickets = st.work.tickets;
      // A clock on the wall, for company.
      ctx.fillStyle = '#f3efe6'; ctx.beginPath(); ctx.arc(420, 150, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1f2d33'; ctx.lineWidth = 3; ctx.stroke();
      const now = new Date(), hA = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2, mA = now.getMinutes() / 60 * Math.PI * 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(420, 150); ctx.lineTo(420 + Math.sin(hA) * 13, 150 - Math.cos(hA) * 13); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(420, 150); ctx.lineTo(420 + Math.sin(mA) * 19, 150 - Math.cos(mA) * 19); ctx.stroke();
      ctx.lineCap = 'butt';

      // The monitor: the inbox of online orders.
      const mx = 28, my = 128, mw = 250, mh = 196;
      ctx.fillStyle = '#4a4f5a'; ctx.fillRect(mx + mw / 2 - 10, my + mh, 20, 30);
      ctx.fillStyle = '#3a3e47'; rr(ctx, mx + mw / 2 - 50, my + mh + 26, 100, 10, 5); ctx.fill();
      ctx.fillStyle = '#1d2129'; rr(ctx, mx, my, mw, mh, 12); ctx.fill();
      const sx = mx + 10, sy = my + 10, sw = mw - 20, sh = mh - 20;
      ctx.fillStyle = '#eef3f6'; rr(ctx, sx, sy, sw, sh, 6); ctx.fill();
      ctx.fillStyle = '#5aa9e6'; rr(ctx, sx, sy, sw, 26, 6); ctx.fill(); ctx.fillRect(sx, sy + 20, sw, 6);
      text(ctx, '✉  Inbox', sx + 10, sy + 13, 12, '#fff', 'left', 800);
      if (inbox.length) text(ctx, inbox.length + ' new', sx + sw - 10, sy + 13, 11, '#fff', 'right', 800);
      if (!inbox.length) {
        const dots = '.'.repeat(1 + Math.floor(this.t * 2) % 3);
        text(ctx, 'Waiting for orders' + dots, sx + 18, sy + sh / 2 + 8, 12, '#7b8794', 'left', 600);
      } else {
        const o = inbox[0];
        drawShape(ctx, o, sx + 64, sy + 26 + (sh - 26) / 2, 100, sh - 56, { max: 24 });
        text(ctx, 'Order #' + o.no, sx + 128, sy + 50, 13, '#2d3440', 'left', 800);
        let yy = sy + 74;
        const line = (str) => { text(ctx, str, sx + 128, yy, 11, '#5a6472', 'left', 600); yy += 17; };
        line(Factory.FIRING[o.fire].name + ' firing');
        line(o.second != null ? 'Two-tone' : Factory.PAINTS[o.paint].name);
        if (o.stickers.length) line(o.stickers.length + ' sticker' + (o.stickers.length > 1 ? 's' : ''));
        if (o.qty > 1) line('Quantity ' + o.qty);
        if (inbox.length > 1) {
          for (let i = 1; i < inbox.length; i++) {
            ctx.fillStyle = '#dbe3ea'; rr(ctx, sx + sw - 16 - (i - 1) * 16, sy + sh - 18, 10, 10, 3); ctx.fill();
          }
        }
      }
      if (inbox.length && Math.sin(this.t * 5) > 0) { ctx.fillStyle = '#ef6f6c'; ctx.beginPath(); ctx.arc(sx + sw - 6, sy + 4, 6, 0, Math.PI * 2); ctx.fill(); }

      // The printer.
      const px = 306, py = 290, pw = 150, ph = 96;
      const printing = st.printing;
      if (printing) {
        // The ticket feeding out of the slot.
        const k = ease(printing.t / printing.dur);
        const th = 76 * k;
        ctx.save(); ctx.beginPath(); ctx.rect(px, py - 90, pw, 90 + 8); ctx.clip();
        drawTicket(ctx, printing.order, px + 26, py + 4 - th, 98, 76, {});
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(ctx, px + 4, py + 8, pw, ph, 12); ctx.fill();
      ctx.fillStyle = '#dfe3e8'; rr(ctx, px, py, pw, ph, 12); ctx.fill();
      ctx.fillStyle = '#c7ccd4'; rr(ctx, px, py + ph - 26, pw, 26, 10); ctx.fill();
      ctx.fillStyle = '#2e333c'; rr(ctx, px + 20, py + 2, pw - 40, 7, 3); ctx.fill();
      ctx.fillStyle = printing ? (Math.sin(this.t * 20) > 0 ? '#6cc486' : '#3f7d52') : inbox.length ? '#6cc486' : '#5c636e';
      ctx.beginPath(); ctx.arc(px + pw - 20, py + 30, 5, 0, Math.PI * 2); ctx.fill();
      text(ctx, 'PRINT', px + 22, py + 30, 9, '#8a919c', 'left', 800);

      const full = tickets.length >= 3;
      button(ctx, this.hits, 'accept', mx + 35, 384, 180, 46, full ? 'Rail full' : printing ? 'Printing…' : 'Accept order', { disabled: !inbox.length || full || !!printing, hover: this.hover && this.hover.id, color: '#4caf6a' });
      if (tickets.some((j) => j.stage === 'mold') && !printing) button(ctx, this.hits, 'goto', 322, 440, 118, 38, 'Mold ▸', { data: 'mold', hover: this.hover && this.hover.id, size: 14 });
    }

    /** The active ticket, pinned beside the work so it can be copied. */
    pinned(ctx, st, job) {
      if (!job) return;
      drawTicket(ctx, job.order, 18, 112, 132, 164, { big: true, angle: -0.03 });
      ctx.fillStyle = '#d64545'; ctx.beginPath(); ctx.arc(84, 116, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(82, 114, 2, 0, Math.PI * 2); ctx.fill();
    }

    empty(ctx, msg, goto, label) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, 120, 250, 240, 96, 16); ctx.fill();
      text(ctx, msg, 240, 278, 14, '#fff', 'center', 700);
      button(ctx, this.hits, 'goto', 175, 298, 130, 36, label, { data: goto, hover: this.hover && this.hover.id, size: 14 });
    }

    // ---- Mold --------------------------------------------------------------------------------------------------------

    moldGeom(job) {
      const n = job ? job.grid : 5;
      const c = Math.min(40, Math.floor(250 / n));
      return { n, c, x: 312 - (n * c) / 2, y: 262 - (n * c) / 2 };
    }

    drawMold(ctx, st) {
      this.wall(ctx, '#c28a55', '#a8713f', RAIL, 440);
      ctx.fillStyle = 'rgba(80,45,15,0.28)';
      for (let y = RAIL + 14; y < 440; y += 20) for (let x = Math.floor(this.vx0 / 20) * 20 + 10; x < this.vx1; x += 20) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      this.floor(ctx, 440, '#5b6270', '#7a8391');
      const job = st.active && st.active.stage === 'mold' ? st.active : null;
      this.pinned(ctx, st, job);
      const g = this.moldGeom(job);
      // The tray
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, g.x - 14, g.y - 10, g.n * g.c + 28, g.n * g.c + 28, 16); ctx.fill();
      ctx.fillStyle = '#4a505c'; rr(ctx, g.x - 14, g.y - 14, g.n * g.c + 28, g.n * g.c + 28, 16); ctx.fill();
      ctx.fillStyle = '#5d6472'; rr(ctx, g.x - 14, g.y - 14, g.n * g.c + 28, 8, 6); ctx.fill();
      const filled = job ? new Set(job.built) : new Set();
      for (let y = 0; y < g.n; y++) for (let x = 0; x < g.n; x++) {
        const cx = g.x + x * g.c, cy = g.y + y * g.c, key = x + ',' + y;
        const hov = job && this.hover && this.hover.id === 'cell' && this.hover.data === key;
        ctx.fillStyle = '#2b2f37'; rr(ctx, cx + 2, cy + 2, g.c - 4, g.c - 4, 5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, cx + 2, cy + 2, g.c - 4, 4, 3); ctx.fill();
        if (filled.has(key)) {
          const shim = (Math.sin(this.t * 3 + x * 0.9 + y * 0.7) + 1) / 2;
          const grd = ctx.createLinearGradient(cx, cy, cx, cy + g.c);
          grd.addColorStop(0, mix('#ffd07a', '#ffe7a8', shim)); grd.addColorStop(1, '#ff7a3d');
          ctx.fillStyle = grd; rr(ctx, cx + 3, cy + 3, g.c - 6, g.c - 6, 6); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(ctx, cx + 7, cy + 6, g.c - 14, 4, 2); ctx.fill();
        }
        if (hov) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(ctx, cx + 2, cy + 2, g.c - 4, g.c - 4, 5); ctx.stroke(); }
        if (job) this.hits.push({ id: 'cell', x: cx, y: cy, w: g.c, h: g.c, data: key });
      }
      // The pour glow
      if (job && filled.size) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,140,60,0.06)'; rr(ctx, g.x - 14, g.y - 14, g.n * g.c + 28, g.n * g.c + 28, 16); ctx.fill();
        ctx.restore();
      }
      // The ladle, pouring where you point.
      if (job && this.hover && this.hover.id === 'cell') {
        const h = this.hover;
        const lx = h.x + h.w / 2, ly = h.y - 6;
        ctx.fillStyle = '#6d7380'; ctx.beginPath(); ctx.arc(lx + 16, ly - 18, 13, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#ff9a4a'; ctx.fillRect(lx + 3, ly - 18, 16, 3);
        ctx.strokeStyle = '#6d7380'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx + 28, ly - 18); ctx.lineTo(lx + 56, ly - 34); ctx.stroke();
      }
      if (!job) { this.empty(ctx, st.work.tickets.length ? 'Pick a ticket to pour' : 'No order in the mold', 'orders', 'Orders'); return; }
      const hov = this.hover && this.hover.id;
      button(ctx, this.hits, 'clear', 176, 470, 92, 40, 'Empty', { hover: hov, color: '#7a8391', size: 14, disabled: !filled.size });
      const free = st.freeSlot != null;
      button(ctx, this.hits, 'toKiln', 282, 466, 176, 46, free ? 'Into the kiln ▸' : 'Kiln is full', { hover: hov, disabled: !filled.size || !free, color: '#e0643c' });
    }

    // ---- Kiln --------------------------------------------------------------------------------------------------------

    kilnDoor(i, n) {
      const w = 116, gap = 20, total = 3 * w + 2 * gap;
      void n;
      return { x: 240 - total / 2 + i * (w + gap), y: 150, w, h: 150 };
    }

    drawKiln(ctx, st) {
      // Brick wall
      this.wall(ctx, '#8e4b3a', '#7a3f31', RAIL, 450);
      ctx.fillStyle = 'rgba(60,20,12,0.35)';
      for (let row = 0, y = RAIL; y < 450; y += 18, row++) {
        ctx.fillRect(this.vx0, y, this.vx1 - this.vx0, 2);
        for (let x = Math.floor(this.vx0 / 40) * 40 + (row % 2) * 20; x < this.vx1; x += 40) ctx.fillRect(x, y, 2, 18);
      }
      this.floor(ctx, 450, '#4a4146', '#5d5358');
      // The kiln
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, 26, 124, 436, 316, 22); ctx.fill();
      ctx.fillStyle = '#545a66'; rr(ctx, 22, 118, 436, 316, 22); ctx.fill();
      ctx.fillStyle = '#646b78'; rr(ctx, 22, 118, 436, 14, 10); ctx.fill();
      const slots = st.kiln, owned = st.kilnSlots, hov = this.hover && this.hover.id;
      for (let i = 0; i < 3; i++) {
        const d = this.kilnDoor(i, owned);
        const job = slots[i];
        const locked = i >= owned;
        // Door: an arched window into the fire.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(d.x, d.y + d.h); ctx.lineTo(d.x, d.y + d.w / 2); ctx.arc(d.x + d.w / 2, d.y + d.w / 2, d.w / 2, Math.PI, 0); ctx.lineTo(d.x + d.w, d.y + d.h); ctx.closePath();
        ctx.fillStyle = '#2a2d33'; ctx.fill();
        ctx.clip();
        if (job) {
          const heat = job.heat;
          const grd = ctx.createRadialGradient(d.x + d.w / 2, d.y + d.h, 10, d.x + d.w / 2, d.y + d.h, d.h * 1.1);
          grd.addColorStop(0, mix('#ffb347', '#fff1b8', heat)); grd.addColorStop(0.6, mix('#b8421f', '#ff7a2d', heat)); grd.addColorStop(1, '#3a1a12');
          ctx.fillStyle = grd; ctx.fillRect(d.x, d.y, d.w, d.h);
          for (let k = 0; k < 5; k++) flame(ctx, d.x + 12 + k * (d.w - 24) / 4, d.y + d.h + 4, 26 + 8 * Math.sin(this.t * 5 + k), this.t, k);
          // The piece inside, darkening as it fires.
          const pc = Factory.norm(job.built.map((k) => k.split(',').map(Number)));
          const b = Factory.bounds(pc), s = Math.min(18, 80 / Math.max(b.w, b.h));
          const x0 = d.x + d.w / 2 - (b.w * s) / 2, y0 = d.y + d.h * 0.55 - (b.h * s) / 2;
          const col = mix('#ffb070', heat > 0.9 ? '#5a3a2a' : '#c9b7a3', clamp01(heat * 1.4));
          for (const [x, y] of pc) block(ctx, x0 + x * s, y0 + y * s, s, col);
        } else if (locked) {
          ctx.fillStyle = '#23262c'; ctx.fillRect(d.x, d.y, d.w, d.h);
        } else {
          const grd = ctx.createRadialGradient(d.x + d.w / 2, d.y + d.h, 5, d.x + d.w / 2, d.y + d.h, d.h);
          grd.addColorStop(0, '#6b2c1a'); grd.addColorStop(1, '#241412');
          ctx.fillStyle = grd; ctx.fillRect(d.x, d.y, d.w, d.h);
          for (let k = 0; k < 3; k++) { ctx.globalAlpha = 0.5; flame(ctx, d.x + 30 + k * 28, d.y + d.h + 2, 14 + 4 * Math.sin(this.t * 4 + k), this.t, k); }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        ctx.strokeStyle = '#2e3239'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(d.x, d.y + d.h); ctx.lineTo(d.x, d.y + d.w / 2); ctx.arc(d.x + d.w / 2, d.y + d.w / 2, d.w / 2, Math.PI, 0); ctx.lineTo(d.x + d.w, d.y + d.h); ctx.closePath(); ctx.stroke();
        if (locked) {
          ctx.fillStyle = '#6b7280'; rr(ctx, d.x + d.w / 2 - 14, d.y + 70, 28, 22, 4); ctx.fill();
          ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(d.x + d.w / 2, d.y + 70, 9, Math.PI, 0); ctx.stroke();
          text(ctx, 'Upgrade', d.x + d.w / 2, d.y + 115, 11, '#8a919c', 'center', 700);
          continue;
        }
        // The gauge: the ticket's band in green, the heat as a needle.
        const gx = d.x + 4, gy = d.y + d.h + 18, gw = d.w - 8, gh = 16;
        ctx.fillStyle = '#23262c'; rr(ctx, gx - 3, gy - 3, gw + 6, gh + 6, 8); ctx.fill();
        const grd = ctx.createLinearGradient(gx, 0, gx + gw, 0);
        grd.addColorStop(0, '#f7d98b'); grd.addColorStop(0.5, '#f29a4a'); grd.addColorStop(1, '#8e2f1c');
        ctx.fillStyle = grd; rr(ctx, gx, gy, gw, gh, 6); ctx.fill();
        if (job) {
          const at = Factory.FIRING[job.order.fire].at, band = Factory.FIRE_BAND;
          ctx.fillStyle = 'rgba(76,175,106,0.85)'; ctx.fillRect(gx + gw * (at - band), gy, gw * band * 2, gh);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(gx + gw * (at - band), gy, gw * band * 2, gh);
          const nx = gx + gw * job.heat;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(nx, gy - 2); ctx.lineTo(nx - 6, gy - 10); ctx.lineTo(nx + 6, gy - 10); ctx.closePath(); ctx.fill();
          ctx.fillRect(nx - 1.5, gy - 2, 3, gh + 4);
          const inBand = Math.abs(job.heat - at) <= band;
          button(ctx, this.hits, 'pull', d.x + 8, gy + 28, d.w - 16, 36, inBand ? 'Take out!' : 'Take out', { data: i, hover: hov, color: inBand ? '#4caf6a' : job.heat > at ? '#d64545' : '#7a8391', size: 14 });
          this.hits.push({ id: 'pull', x: d.x, y: d.y, w: d.w, h: d.h, data: i });
          text(ctx, '#' + job.order.no, d.x + d.w / 2, d.y + 22, 11, 'rgba(255,255,255,0.8)', 'center', 800);
        } else {
          text(ctx, 'empty', d.x + d.w / 2, gy + 46, 11, 'rgba(255,255,255,0.45)', 'center', 700);
        }
      }
      const waiting = st.work.tickets.filter((j) => j.stage === 'mold' && j.built.length).length;
      if (!slots.some(Boolean) && !waiting) text(ctx, 'Pour a shape in the Mold, then fire it here.', 240, 468, 12, 'rgba(255,255,255,0.7)', 'center', 600);
    }

    // ---- Paint -------------------------------------------------------------------------------------------------------

    paintGeom(job) {
      const pc = job.built.map((k) => k.split(',').map(Number));
      let mx = Infinity, my = Infinity;
      for (const [x, y] of pc) { mx = Math.min(mx, x); my = Math.min(my, y); }
      const b = Factory.bounds(pc.map(([x, y]) => [x - mx, y - my]));
      const s = Math.min(46, Math.floor(Math.min(230 / b.w, 250 / b.h)));
      const cx = 312, cy = 378 - (b.h * s) / 2;
      return { pc, mx, my, s, x0: cx - (b.w * s) / 2, y0: cy - (b.h * s) / 2, b };
    }

    cellRect(g, i) { const [x, y] = g.pc[i]; return { x: g.x0 + (x - g.mx) * g.s, y: g.y0 + (y - g.my) * g.s, s: g.s }; }

    coatColor(coat) {
      const total = (coat || []).reduce((a, v) => a + (v || 0), 0);
      if (!total) return CLAY;
      let r = 0, g = 0, b = 0;
      coat.forEach((v, i) => { if (!v) return; const [cr, cg, cb] = Render.rgb(Factory.PAINTS[i].c); r += cr * v; g += cg * v; b += cb * v; });
      const avg = '#' + [r, g, b].map((c) => Math.round(c / total).toString(16).padStart(2, '0')).join('');
      return mix(CLAY, avg, Math.min(1, total / 0.9));
    }

    drawPaint(ctx, st) {
      this.wall(ctx, '#6f5d93', '#574877', RAIL, 440);
      // Vent grille
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; rr(ctx, 360, 108, 100, 60, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let k = 0; k < 5; k++) ctx.fillRect(368, 116 + k * 10, 84, 4);
      this.floor(ctx, 440, '#8a6a4a', '#a58360');
      const job = st.active && st.active.stage === 'paint' ? st.active : null;
      this.pinned(ctx, st, job);
      // Turntable
      ctx.fillStyle = '#3f3552'; ctx.beginPath(); ctx.ellipse(312, 392, 120, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9a90ad'; ctx.beginPath(); ctx.ellipse(312, 386, 116, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b4abc6'; ctx.beginPath(); ctx.ellipse(312, 384, 104, 15, 0, 0, Math.PI * 2); ctx.fill();
      const hov = this.hover && this.hover.id;
      this.drawShelf(ctx, st);
      if (!job) { this.empty(ctx, st.work.tickets.length ? 'Pick a fired piece to paint' : 'Nothing to paint yet', 'kiln', 'Kiln'); return; }
      const g = this.paintGeom(job);
      this.paintG = g;
      job.built.forEach((k, i) => {
        const c = this.cellRect(g, i);
        block(ctx, c.x, c.y, c.s, this.coatColor(job.coat[i]));
        // Clay speckle where the paint is thin.
        const total = (job.coat[i] || []).reduce((a, v) => a + (v || 0), 0);
        if (total < 0.6) { ctx.fillStyle = 'rgba(120,100,80,' + (0.25 * (1 - total / 0.6)) + ')'; for (let q = 0; q < 4; q++) ctx.fillRect(c.x + c.s * (0.25 + 0.4 * (q % 2)), c.y + c.s * (0.3 + 0.35 * (q >> 1)), 2, 2); }
        if (job.stickers.includes(i)) star(ctx, c.x + c.s / 2, c.y + c.s / 2, c.s * 0.3, GOLD, 'rgba(120,80,0,0.6)');
      });
      this.hits.push({ id: 'canvas', x: g.x0 - 30, y: g.y0 - 30, w: g.b.w * g.s + 60, h: g.b.h * g.s + 60 });
      // The tool at the pointer
      const p = this.pointer;
      if (p && p[1] > RAIL && p[1] < 440) {
        if (st.paintTool === 'sticker') { ctx.globalAlpha = 0.7; star(ctx, p[0], p[1], 10, GOLD, 'rgba(120,80,0,0.6)'); ctx.globalAlpha = 1; }
        else if (typeof st.paintTool === 'number') {
          const col = Factory.PAINTS[st.paintTool].c;
          ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.arc(p[0], p[1], g.s * 0.75, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          // The spray gun
          ctx.fillStyle = '#3a3f4a'; rr(ctx, p[0] + 10, p[1] + 10, 26, 12, 4); ctx.fill();
          ctx.fillRect(p[0] + 26, p[1] + 20, 7, 18);
          ctx.fillStyle = col; ctx.fillRect(p[0] + 6, p[1] + 13, 6, 6);
        }
      }
      button(ctx, this.hits, 'ship', 356, 108 + 70, 108, 44, 'Ship ▸', { hover: hov, color: '#4caf6a' });
    }

    drawShelf(ctx, st) {
      const info = Factory.rankInfo(st.f.rank);
      ctx.fillStyle = '#5b4632'; ctx.fillRect(this.vx0, 470, this.vx1 - this.vx0, 10);
      const n = info.colors, extra = (info.stickers ? 1 : 0) + 1;
      const slot = Math.min(50, 440 / (n + extra));
      const x0 = 240 - (slot * (n + extra)) / 2;
      const hov = this.hover && this.hover.id;
      for (let i = 0; i < n; i++) {
        const sel = st.paintTool === i;
        const x = x0 + i * slot + (slot - 36) / 2, y = 428 - (sel ? 10 : 0) - (hov === 'can' && this.hover.data === i ? 3 : 0);
        const c = Factory.PAINTS[i].c;
        if (sel) { ctx.fillStyle = rgba(c, 0.35); ctx.beginPath(); ctx.ellipse(x + 18, 470, 24, 6, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#c9ced6'; rr(ctx, x, y, 36, 42, 5); ctx.fill();
        ctx.fillStyle = c; ctx.fillRect(x, y + 10, 36, 22);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 4, y + 12, 5, 18);
        ctx.fillStyle = '#e3e7ec'; rr(ctx, x - 1, y - 2, 38, 7, 3); ctx.fill();
        if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; rr(ctx, x - 3, y - 4, 42, 48, 7); ctx.stroke(); }
        this.hits.push({ id: 'can', x: x - 4, y: y - 6, w: 44, h: 52, data: i });
      }
      let i = n;
      if (info.stickers) {
        const sel = st.paintTool === 'sticker';
        const x = x0 + i * slot + (slot - 36) / 2, y = 430 - (sel ? 10 : 0);
        ctx.fillStyle = '#fbf7ee'; rr(ctx, x, y, 36, 40, 4); ctx.fill();
        for (let q = 0; q < 4; q++) star(ctx, x + 10 + (q % 2) * 16, y + 11 + (q >> 1) * 17, 6, GOLD, 'rgba(120,80,0,0.5)');
        if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; rr(ctx, x - 3, y - 3, 42, 46, 6); ctx.stroke(); }
        this.hits.push({ id: 'sticker', x: x - 4, y: y - 6, w: 44, h: 52 });
        i++;
      }
      // The rag: wipes the piece back to bare clay.
      const x = x0 + i * slot + (slot - 36) / 2, y = 436;
      ctx.fillStyle = '#e9e1d2';
      ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.quadraticCurveTo(x + 4, y, x + 18, y + 4); ctx.quadraticCurveTo(x + 36, y + 2, x + 34, y + 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, 'wipe', x + 18, y + 20, 9, '#7a6d5a', 'center', 800);
      this.hits.push({ id: 'rag', x: x - 4, y: y - 6, w: 44, h: 44 });
    }

    // ---- Line --------------------------------------------------------------------------------------------------------

    beltX(x) { return 150 + x * 250; }

    drawItem(ctx, it, cx, by, s, centered) {
      const b = Factory.bounds(it.cells);
      const x0 = cx - (b.w * s) / 2, y0 = centered ? -(b.h * s) / 2 : by - b.h * s;
      const col = it.golden ? GOLD : Factory.PAINTS[it.color].c;
      it.cells.forEach(([x, y], i) => {
        const px = x0 + x * s, py = y0 + y * s;
        if (it.defect === 'blob' && i === it.mark) {
          ctx.fillStyle = shade(col, -0.25);
          ctx.beginPath(); ctx.ellipse(px + s / 2, py + s / 2, s * 0.42, s * 0.36, 0.5, 0, Math.PI * 2); ctx.fill();
          return;
        }
        if (it.defect === 'chip' && i === it.mark) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + s - 1, py + 1); ctx.lineTo(px + s * 0.35, py + s * 0.55); ctx.lineTo(px + 1, py + s - 1); ctx.closePath(); ctx.fill();
          return;
        }
        block(ctx, px, py, s, it.defect === 'burnt' && i === it.mark ? '#3b2a22' : col);
        if (it.defect === 'crack' && i === it.mark) {
          ctx.strokeStyle = '#1d1a18'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(px + s * 0.2, py + s * 0.1); ctx.lineTo(px + s * 0.5, py + s * 0.45); ctx.lineTo(px + s * 0.35, py + s * 0.6); ctx.lineTo(px + s * 0.75, py + s * 0.95); ctx.stroke();
        }
      });
      if (it.golden) {
        const tw = (Math.sin(this.t * 6 + it.id) + 1) / 2;
        star(ctx, x0 + b.w * s - 2, y0 + 2, 3 + tw * 3, '#fffbe6');
      }
      if (it.defect === 'burnt' && !centered) {
        const [mx, my] = it.cells[it.mark];
        const px = x0 + mx * s + s / 2, py = y0 + my * s;
        const k = (this.t * 0.8 + it.id * 0.37) % 1;
        ctx.fillStyle = 'rgba(90,90,90,' + (0.5 * (1 - k)) + ')'; ctx.beginPath(); ctx.arc(px + Math.sin(k * 6) * 3, py - k * 16, 3 + k * 4, 0, Math.PI * 2); ctx.fill();
      }
      return { x: x0, y: y0, w: b.w * s, h: b.h * s };
    }

    drawLine(ctx, st) {
      this.wall(ctx, '#4b5b72', '#3a475a', RAIL, 430);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = RAIL + 60; y < 430; y += 70) ctx.fillRect(this.vx0, y, this.vx1 - this.vx0, 2);
      this.floor(ctx, 430, '#33363d', '#44484f');
      const line = st.line, S = 16, beltY = 346;
      // The press straddles the start of the belt; the belt runs to the crate.
      const since = this.t - (st.lastStamp || -9);
      const drop = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) * 60 : 0;
      ctx.fillStyle = '#2b2e34'; ctx.fillRect(98, 150, 12, 280); ctx.fillRect(190, 150, 12, 280);
      ctx.fillStyle = '#2b2e34'; ctx.fillRect(250, beltY + 26, 10, 58); ctx.fillRect(392, beltY + 26, 10, 58);
      ctx.fillStyle = '#23262c'; rr(ctx, 104, beltY, 318, 26, 13); ctx.fill();
      ctx.fillStyle = '#3a3f48';
      const off = (this.t * line.speed * Math.max(1, Factory.rates(st.f).M / 0.25) * 250) % 18;
      ctx.save(); ctx.beginPath(); rr(ctx, 104, beltY, 318, 26, 13); ctx.clip();
      for (let x = 104 - 18 + off; x < 430; x += 18) ctx.fillRect(x, beltY + 3, 8, 4);
      ctx.restore();
      for (let x = 116; x < 420; x += 26) { ctx.fillStyle = '#5a606b'; ctx.beginPath(); ctx.arc(x, beltY + 18, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#9aa3b2'; ctx.fillRect(144, 196, 12, 60 + drop);
      ctx.fillStyle = '#c3cad6'; rr(ctx, 118, 254 + drop, 64, 16, 4); ctx.fill();
      ctx.fillStyle = '#e0b43a'; rr(ctx, 90, 126, 120, 72, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, 96, 130, 108, 10, 5); ctx.fill();
      ctx.save(); ctx.beginPath(); rr(ctx, 90, 176, 120, 22, 0); ctx.clip();
      for (let x = 80; x < 220; x += 20) { ctx.fillStyle = '#2b2e34'; ctx.beginPath(); ctx.moveTo(x, 198); ctx.lineTo(x + 10, 198); ctx.lineTo(x + 20, 176); ctx.lineTo(x + 10, 176); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      // The crate
      ctx.fillStyle = '#a0703f'; rr(ctx, 410, 318, 62, 56, 6); ctx.fill();
      ctx.fillStyle = '#8a5d33'; for (let k = 0; k < 3; k++) ctx.fillRect(410, 322 + k * 18, 62, 4);
      ctx.fillStyle = '#c28a55'; ctx.fillRect(410, 318, 62, 6);
      // The bin
      const bx = 196, by = 404;
      ctx.fillStyle = '#b8453a'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 90, by); ctx.lineTo(bx + 80, by + 70); ctx.lineTo(bx + 10, by + 70); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d0584b'; ctx.fillRect(bx - 4, by - 6, 98, 10);
      text(ctx, '✕', bx + 45, by + 36, 22, 'rgba(255,255,255,0.8)', 'center', 800);
      // QC arm
      const qc = st.f.up.qc || 0;
      if (qc) {
        const ax = this.beltX(0.72), since2 = this.t - (st.lastArm || -9), reach = since2 < 0.4 ? Math.sin((since2 / 0.4) * Math.PI) * 50 : 0;
        ctx.strokeStyle = '#8b95a5'; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ax + 40, RAIL); ctx.lineTo(ax + 40, 170); ctx.lineTo(ax, 250 + reach); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#6cc486'; ctx.beginPath(); ctx.arc(ax + 40, 170, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax - 10, 262 + reach); ctx.lineTo(ax, 250 + reach); ctx.lineTo(ax + 10, 262 + reach); ctx.stroke();
      }
      // Items
      this.itemRects = [];
      for (const it of line.items) {
        const r = this.drawItem(ctx, it, this.beltX(it.x), beltY, S);
        const hover = this.hover && this.hover.id === 'item' && this.hover.data === it;
        if (hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 6); ctx.stroke(); }
        this.hits.push({ id: 'item', x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16, data: it });
      }
      // What it earns
      const rates = Factory.rates(st.f);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, 280, 118, 170, 54, 12); ctx.fill();
      text(ctx, '+' + rates.perSec.toFixed(2) + '¢/s', 365, 136, 15, '#fff', 'center', 800);
      text(ctx, st.f.streak > 1 ? 'streak ' + st.f.streak : 'click defects into the bin', 365, 157, 10.5, 'rgba(255,255,255,0.7)', 'center', 600);
    }

    // ---- the review --------------------------------------------------------------------------------------------------

    drawJudge(ctx, st) {
      const J = st.judge, t = J.t, rev = J.review, hov = this.hover && this.hover.id;
      ctx.fillStyle = 'rgba(12,14,20,0.55)'; ctx.fillRect(this.vx0, RAIL, this.vx1 - this.vx0, this.vy1 - RAIL);
      const T1 = 1.1, T2 = 2.5, T3 = 4.2;
      if (t < T2) {
        // Sky, road, the box and the van.
        const sky = ctx.createLinearGradient(0, 130, 0, 400);
        sky.addColorStop(0, '#9fd3ea'); sky.addColorStop(1, '#e6f4f8');
        ctx.fillStyle = sky; rr(ctx, 40, 130, 400, 290, 18); ctx.fill();
        ctx.save(); ctx.beginPath(); rr(ctx, 40, 130, 400, 290, 18); ctx.clip();
        ctx.fillStyle = '#fff'; for (let k = 0; k < 3; k++) { const cx = 80 + k * 140 - (t * 20) % 140; ctx.beginPath(); ctx.arc(cx, 170 + k * 12, 16, 0, Math.PI * 2); ctx.arc(cx + 18, 166 + k * 12, 20, 0, Math.PI * 2); ctx.arc(cx + 38, 172 + k * 12, 14, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#7fb069'; ctx.fillRect(40, 330, 400, 90);
        ctx.fillStyle = '#50555f'; ctx.fillRect(40, 350, 400, 40);
        ctx.fillStyle = '#f3efe6'; for (let x = 40 - (t * 180) % 40; x < 440; x += 40) ctx.fillRect(x, 368, 20, 4);
        const vanX = t < T1 ? 200 : 200 + Math.pow((t - T1) / (T2 - T1), 2) * 320;
        // Van
        ctx.fillStyle = '#f5f7fa'; rr(ctx, vanX - 60, 290, 120, 64, 10); ctx.fill();
        ctx.fillStyle = '#e8ecf1'; rr(ctx, vanX + 50, 306, 34, 48, 8); ctx.fill();
        ctx.fillStyle = '#9fd3ea'; rr(ctx, vanX + 58, 312, 20, 16, 4); ctx.fill();
        ctx.fillStyle = '#f28c38'; ctx.fillRect(vanX - 60, 330, 144, 6);
        for (const wx of [vanX - 36, vanX + 58]) { ctx.fillStyle = '#23262c'; ctx.beginPath(); ctx.arc(wx, 356, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#9aa3b2'; ctx.beginPath(); ctx.arc(wx, 356, 5, 0, Math.PI * 2); ctx.fill(); }
        // The box going in (then the doors shut)
        if (t < T1) {
          const k = ease(t / (T1 * 0.7));
          const bx = vanX - 30, byy = 200 + k * 96;
          ctx.fillStyle = '#c99a62'; rr(ctx, bx, byy, 52, 40, 4); ctx.fill();
          ctx.fillStyle = '#e0c089'; ctx.fillRect(bx + 20, byy, 12, 40);
        }
        ctx.restore();
        caption(ctx, t < T1 ? 'Packing order #' + rev.order.no + '…' : 'Out for delivery…', 240, 452);
        return;
      }
      if (t < T3) {
        // The customer's phone: typing …
        const px = 170, py = 150;
        ctx.fillStyle = '#1d2129'; rr(ctx, px, py, 140, 250, 22); ctx.fill();
        ctx.fillStyle = '#f4f6f8'; rr(ctx, px + 8, py + 18, 124, 214, 14); ctx.fill();
        ctx.fillStyle = '#dfe5ea'; rr(ctx, px + 18, py + 150, 90, 34, 16); ctx.fill();
        for (let k = 0; k < 3; k++) { const b = Math.max(0, Math.sin(t * 8 - k * 0.8)) * 5; ctx.fillStyle = '#8a95a3'; ctx.beginPath(); ctx.arc(px + 42 + k * 20, py + 167 - b, 5, 0, Math.PI * 2); ctx.fill(); }
        drawShape(ctx, rev.order, px + 70, py + 90, 90, 70, { max: 18, plain: '#c99a62', noStickers: true });
        caption(ctx, 'The customer is looking it over…', 240, 452);
        return;
      }
      // The review card
      const k = t - T3;
      const cx = 60, cy = 108, cw = 360, ch = 410;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, cx + 3, cy + 6, cw, ch, 18); ctx.fill();
      ctx.fillStyle = '#fbf7ee'; rr(ctx, cx, cy, cw, ch, 18); ctx.fill();
      text(ctx, 'Review · order #' + rev.order.no, cx + cw / 2, cy + 26, 13, '#6b5f4b', 'center', 800);
      for (let i = 0; i < 5; i++) {
        const on = i < rev.stars && k > 0.25 + i * 0.18;
        const pop = on ? Math.max(1, 1.35 - (k - 0.25 - i * 0.18) * 2) : 1;
        star(ctx, cx + cw / 2 - 88 + i * 44, cy + 66, 17 * pop, on ? GOLD : '#e6dccb', on ? 'rgba(150,100,0,0.6)' : null);
      }
      text(ctx, '“' + rev.text + '”', cx + cw / 2, cy + 106, 14, '#3a3328', 'center', 600);
      rev.rows.forEach((r, i) => {
        const y = cy + 142 + i * 40, show = k > 0.5 + i * 0.25;
        if (!show) return;
        const fill = clamp01((k - 0.5 - i * 0.25) / 0.5) * r.score / 100;
        text(ctx, r.label, cx + 26, y, 13, '#6b5f4b', 'left', 700);
        ctx.fillStyle = '#e8dfcd'; rr(ctx, cx + 110, y - 8, 180, 16, 8); ctx.fill();
        const col = r.score >= 90 ? '#4caf6a' : r.score >= 65 ? '#f2b63c' : '#e0643c';
        if (fill > 0) { ctx.fillStyle = col; rr(ctx, cx + 110, y - 8, Math.max(16, 180 * fill), 16, 8); ctx.fill(); }
        text(ctx, String(Math.round(fill * 100)), cx + cw - 26, y, 14, '#3a3328', 'right', 800);
      });
      const py = cy + 142 + rev.rows.length * 40 + 12;
      if (k > 0.6 + rev.rows.length * 0.25) {
        text(ctx, '+' + rev.credits + '¢', cx + cw / 2 - 50, py, 20, '#c2552d', 'center', 800);
        text(ctx, '+' + rev.lines + ' ◆', cx + cw / 2 + 50, py, 20, '#2b8fb8', 'center', 800);
        if (J.ranks && J.ranks.length) {
          const r = J.ranks[J.ranks.length - 1];
          ctx.fillStyle = '#fff1c9'; rr(ctx, cx + 24, py + 22, cw - 48, 44, 10); ctx.fill();
          text(ctx, '★ Rank ' + r + '!', cx + cw / 2, py + 36, 14, '#8a5a00', 'center', 800);
          text(ctx, Factory.rankNews(r).slice(0, 2).join(' · '), cx + cw / 2, py + 55, 11, '#8a5a00', 'center', 600);
        }
        button(ctx, this.hits, 'continue', cx + cw / 2 - 80, cy + ch - 60, 160, 44, 'Continue', { hover: hov, color: '#f28c38' });
      }
    }
  }

  L.WorksView = WorksView;
  L.drawTicket = drawTicket;
})(typeof globalThis !== 'undefined' ? globalThis : this);
