// Lull — the factory's counter, in the spirit of the Papa's restaurant games: customers walk up and order a mino,
// you build it in the mold, paint it, press it, and hand it over for a grade. Everything here is drawing and hit
// regions; FactoryMode (modes.js) holds the state.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Factory, Render, Pieces } = L;
  const { rgba, shade, hsl, drawCell, rr, FONT } = Render;

  const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const RAIL = 66;

  /** Draws a shape (cells y-down or y-up doesn't matter: we draw as given, x right, y down) centred in a box. */
  function drawShape(ctx, cells, box, color, skin, maxCell, alpha) {
    const b = Pieces.boundsOf(cells);
    const s = Math.floor(Math.min(maxCell || 99, (box.w - 4) / b.w, (box.h - 4) / b.h));
    const ox = box.x + (box.w - b.w * s) / 2, oy = box.y + (box.h - b.h * s) / 2;
    for (const [x, y] of cells) drawCell(ctx, skin, color, Math.round(ox + (x - b.minX) * s), Math.round(oy + (y - b.minY) * s), s, alpha);
  }

  function pill(ctx, x, y, w, h, label, fill, fg, hot) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = hot ? 10 : 4; ctx.shadowOffsetY = 2;
    ctx.fillStyle = hot ? shade(fill, 0.12) : fill; rr(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = fg; ctx.font = '800 ' + Math.round(h * 0.4) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /** A customer: a round, friendly blob with eyes, a mouth for their mood, and sometimes a hat. */
  function drawCustomer(ctx, c, x, y, size, t, mood) {
    const w = 64 * size, h = 84 * size;
    const bob = Math.sin(t * 3 + c.hue) * 1.5 * size;
    const body = hsl(c.hue, 55, 62);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x, y + 2, w * 0.45, 5 * size, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body; rr(ctx, x - w / 2, y - h + bob, w, h, w / 2); ctx.fill();
    ctx.fillStyle = shade(body, 0.18); rr(ctx, x - w / 2 + 6 * size, y - h + bob + 6 * size, w * 0.3, h * 0.25, w * 0.15); ctx.fill();
    // Eyes (they blink).
    const blink = Math.sin(t * 1.3 + c.hue * 0.7) > 0.985 ? 0.15 : 1;
    const ey = y - h * 0.68 + bob;
    for (const dx of [-0.17, 0.17]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + dx * w, ey, 7 * size, 8.5 * size * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d1f27'; ctx.beginPath(); ctx.ellipse(x + dx * w - 1.5 * size, ey + 1.5 * size, 3.4 * size, 4 * size * blink, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Mouth.
    ctx.strokeStyle = '#1d1f27'; ctx.lineWidth = 2.2 * size; ctx.lineCap = 'round';
    const my = y - h * 0.47 + bob;
    ctx.beginPath();
    if (mood === 'happy') ctx.arc(x, my - 4 * size, 9 * size, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood === 'sad') ctx.arc(x, my + 7 * size, 8 * size, 1.2 * Math.PI, 1.8 * Math.PI);
    else { ctx.moveTo(x - 6 * size, my); ctx.lineTo(x + 6 * size, my); }
    ctx.stroke();
    if (mood === 'happy') { ctx.fillStyle = 'rgba(255,120,140,0.35)'; for (const dx of [-0.3, 0.3]) { ctx.beginPath(); ctx.ellipse(x + dx * w, my - 3 * size, 5 * size, 3 * size, 0, 0, Math.PI * 2); ctx.fill(); } }
    // Hat.
    const top = y - h + bob;
    const hatColor = hsl((c.hue + 180) % 360, 45, 45);
    ctx.fillStyle = hatColor;
    if (c.hat === 1) { rr(ctx, x - w * 0.36, top - 12 * size, w * 0.72, 16 * size, 8 * size); ctx.fill(); ctx.fillRect(x - w * 0.05, top - 12 * size, w * 0.55, 6 * size); }
    else if (c.hat === 2) { ctx.beginPath(); ctx.arc(x, top + 10 * size, w * 0.4, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, top - w * 0.3 + 10 * size, 5 * size, 0, Math.PI * 2); ctx.fill(); }
    else if (c.hat === 3) { ctx.beginPath(); ctx.moveTo(x + 4 * size, top + 4 * size); ctx.lineTo(x + 18 * size, top - 6 * size); ctx.lineTo(x + 18 * size, top + 12 * size); ctx.closePath(); ctx.moveTo(x + 4 * size, top + 4 * size); ctx.lineTo(x - 10 * size, top - 6 * size); ctx.lineTo(x - 10 * size, top + 12 * size); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  class StationView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cssW = 0; this.cssH = 0; this.dpr = 1;
      this.hits = [];
      this.hover = null;
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

    hitAt(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (x >= h.x && y >= h.y && x <= h.x + h.w && y <= h.y + h.h) return h;
      }
      return null;
    }
    hit(id, x, y, w, h, data) { this.hits.push({ id, x, y, w, h, data }); }
    isHot(id, data) { return this.hover && this.hover.id === id && (data === undefined || this.hover.data === data); }

    /** state: { station, queue, tickets, active, rating, look, theme, f } */
    render(dt, st) {
      this.t += dt;
      const ctx = this.ctx, W = this.cssW, H = this.cssH;
      if (!W) return;
      this.hits = [];
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      rr(ctx, 0.5, 0.5, W - 1, H - 1, 12); ctx.clip();
      const dark = st.theme.name !== 'light';
      if (st.station === 'order') this.drawOrder(ctx, W, H, st, dark);
      else if (st.station === 'build') this.drawBuild(ctx, W, H, st, dark);
      else if (st.station === 'press') this.drawPress(ctx, W, H, st, dark);
      this.drawRail(ctx, W, st, dark);
      if (st.rating) this.drawRating(ctx, W, H, st, dark);
      ctx.restore();
    }

    // ---- ticket rail ---------------------------------------------------------------------------------------------

    drawRail(ctx, W, st, dark) {
      ctx.fillStyle = dark ? 'rgba(12,14,20,0.55)' : 'rgba(255,255,255,0.5)'; ctx.fillRect(0, 0, W, RAIL);
      ctx.fillStyle = dark ? '#7b8494' : '#8c96a6'; ctx.fillRect(10, 10, W - 20, 4);
      st.tickets.forEach((tk, i) => {
        const active = tk === st.active;
        const x = 16 + i * 58, y = 12 + (active ? 4 : 0), w = 50, h = 48;
        const hot = this.isHot('ticket', i);
        ctx.save();
        ctx.translate(x + w / 2, y); ctx.rotate(Math.sin(this.t * 1.5 + i) * 0.02 + (hot ? 0.03 : 0)); ctx.translate(-(x + w / 2), -y);
        ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = active ? 8 : 3; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#fbf6e9'; rr(ctx, x, y, w, h, 3); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#c9c1a8'; ctx.beginPath(); ctx.arc(x + w / 2, y + 2, 3, 0, Math.PI * 2); ctx.fill();
        drawShape(ctx, tk.order.cells, { x: x + 4, y: y + 7, w: w - 8, h: h - 16 }, Factory.PAINTS[tk.order.paint], st.look.skin, 9);
        // Stage marks along the bottom: built, pressed.
        const marks = [tk.stage !== 'build', tk.stage === 'done'];
        marks.forEach((m, k) => { ctx.fillStyle = m ? '#6cc486' : '#d9d2bd'; ctx.beginPath(); ctx.arc(x + w / 2 - 5 + k * 10, y + h - 6, 3, 0, Math.PI * 2); ctx.fill(); });
        if (active) { ctx.strokeStyle = st.theme.accent; ctx.lineWidth = 2; rr(ctx, x - 2, y - 2, w + 4, h + 4, 4); ctx.stroke(); }
        this.hit('ticket', x, y, w, h, i);
      });
    }

    // ---- the counter ---------------------------------------------------------------------------------------------

    drawOrder(ctx, W, H, st, dark) {
      // Wall with stripes, a window, a counter.
      ctx.fillStyle = dark ? '#3a2f3d' : '#f6e6d4'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(180,120,90,0.08)';
      for (let x = 0; x < W; x += 28) ctx.fillRect(x, 0, 14, H);
      const counterY = Math.round(H * 0.7);
      const win = { x: W * 0.62, y: RAIL + 18, w: W * 0.3, h: (counterY - RAIL) * 0.42 };
      const sky = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
      sky.addColorStop(0, dark ? '#2c3b63' : '#9fd0f5'); sky.addColorStop(1, dark ? '#51406b' : '#e4f2fc');
      ctx.fillStyle = sky; rr(ctx, win.x, win.y, win.w, win.h, 6); ctx.fill();
      ctx.strokeStyle = dark ? '#5a4a5e' : '#c9a98a'; ctx.lineWidth = 4; rr(ctx, win.x, win.y, win.w, win.h, 6); ctx.stroke();
      // Customers: the front one at the counter, the rest in line behind.
      const q = st.queue;
      for (let i = Math.min(q.length, 4) - 1; i >= 0; i--) {
        const c = q[i];
        const walk = ease((this.t - c.arrived) / 1.2);
        const tx = W * 0.4 + i * W * 0.17;
        const x = W + 60 + (tx - W - 60) * walk;
        const size = (i === 0 ? 1.15 : 0.85) * c.order.customer.size * Math.min(1, H / 420);
        ctx.globalAlpha = i === 0 ? 1 : 0.75;
        drawCustomer(ctx, c.order.customer, x, counterY + 6, size, this.t, i === 0 && walk >= 1 ? 'happy' : 'flat');
        ctx.globalAlpha = 1;
        if (i === 0 && walk >= 1) this.hit('take', x - 40, counterY - 110 * size, 80, 110 * size);
      }
      // Counter top and front.
      ctx.fillStyle = dark ? '#6b4a33' : '#b98253'; ctx.fillRect(0, counterY, W, 14);
      ctx.fillStyle = dark ? '#4d3524' : '#9b6a42'; ctx.fillRect(0, counterY + 14, W, H - counterY - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = 20; x < W; x += 90) ctx.fillRect(x, counterY + 24, 60, H - counterY - 40);
      // A bell on the counter.
      const bx = W * 0.14, by = counterY;
      ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(bx, by, 16, Math.PI, 0); ctx.fill(); ctx.fillRect(bx - 20, by - 2, 40, 4); ctx.beginPath(); ctx.arc(bx, by - 18, 3, 0, Math.PI * 2); ctx.fill();
      // The order bubble and the take button.
      const front = q[0];
      if (front && ease((this.t - front.arrived) / 1.2) >= 1) {
        const bw = Math.min(150, W * 0.36), bh = 96, bxx = Math.max(10, W * 0.4 - bw - 60), byy = Math.max(RAIL + 10, counterY - 200);
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#fff'; rr(ctx, bxx, byy, bw, bh, 16); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bxx + bw - 30, byy + bh - 2); ctx.lineTo(bxx + bw + 10, byy + bh + 16); ctx.lineTo(bxx + bw - 12, byy + bh - 2); ctx.fill();
        ctx.restore();
        drawShape(ctx, front.order.cells, { x: bxx + 10, y: byy + 10, w: bw - 20, h: bh - 20 }, Factory.PAINTS[front.order.paint], st.look.skin, 20);
        const pw = Math.min(170, W * 0.42), ph = 40, px = W / 2 - pw / 2, py = H - ph - 16;
        const full = st.tickets.length >= 3;
        pill(ctx, px, py, pw, ph, full ? 'Rail full' : 'Take order', full ? '#8a8f99' : '#f28c38', '#fff', !full && (this.isHot('take') || this.isHot('takeBtn')));
        if (!full) this.hit('takeBtn', px, py, pw, ph);
      } else if (!q.length && !st.rating) {
        // An empty counter: someone will be along.
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(90,60,40,0.45)'; ctx.font = '600 13px ' + FONT; ctx.textAlign = 'center';
        const dots = '.'.repeat(1 + Math.floor(this.t * 2) % 3);
        ctx.fillText(dots, W * 0.4, counterY - 30); ctx.textAlign = 'start';
      }
    }

    // ---- the mold ------------------------------------------------------------------------------------------------

    drawBuild(ctx, W, H, st, dark) {
      ctx.fillStyle = dark ? '#243040' : '#dfe8f1'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(40,70,110,0.08)';
      for (let x = 14; x < W; x += 22) for (let y = RAIL + 12; y < H; y += 22) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
      const tk = st.active;
      if (!tk || tk.stage !== 'build') { this.drawEmpty(ctx, W, H, dark, '▦', 'order'); return; }
      const N = tk.grid;
      const avail = { x: 12, y: RAIL + 14, w: W - 24, h: H - RAIL - 96 };
      const wide = W > 460;
      const ticketW = wide ? Math.min(120, W * 0.24) : 0;
      const cs = Math.floor(Math.min((avail.w - ticketW - 20) / N, avail.h / N, 52));
      const gx = Math.round(avail.x + ticketW + (avail.w - ticketW - N * cs) / 2), gy = Math.round(avail.y + (avail.h - N * cs) / 2);
      // The order, pinned beside the mold.
      if (wide) {
        const tx = avail.x + 8, ty = gy, tw = ticketW - 16, th = Math.min(150, N * cs);
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 6; ctx.fillStyle = '#fbf6e9'; rr(ctx, tx, ty, tw, th, 4); ctx.fill(); ctx.restore();
        drawShape(ctx, tk.order.cells, { x: tx + 8, y: ty + 8, w: tw - 16, h: th - 16 }, Factory.PAINTS[tk.order.paint], st.look.skin, 22);
      }
      // The mold tray.
      ctx.fillStyle = dark ? '#1a222e' : '#b9c7d6'; rr(ctx, gx - 10, gy - 10, N * cs + 20, N * cs + 20, 12); ctx.fill();
      const paint = Factory.PAINTS[tk.paint];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const k = x + ',' + y, on = tk.cells.has(k);
        const px = gx + x * cs, py = gy + y * cs;
        if (on) drawCell(ctx, st.look.skin, paint, px + 1, py + 1, cs - 2);
        else {
          ctx.fillStyle = dark ? (this.isHot('cell', k) ? '#344256' : '#27313f') : (this.isHot('cell', k) ? '#e9f0f7' : '#d5dfea');
          rr(ctx, px + 2, py + 2, cs - 4, cs - 4, 5); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; rr(ctx, px + 2, py + 2, cs - 4, 3, 2); ctx.fill();
        }
        this.hit('cell', px, py, cs, cs, k);
      }
      // Paint pots, a trash can, and on to the press.
      const pots = Factory.paintCount(st.f), pr = 15, rowY = H - 40;
      const potsW = pots * (pr * 2 + 10);
      const startX = W / 2 - (potsW + 60 + 130) / 2;
      const trashX = startX;
      ctx.fillStyle = this.isHot('clear') ? '#eb6f92' : (dark ? '#7b8494' : '#8c96a6');
      rr(ctx, trashX, rowY - 11, 22, 24, 3); ctx.fill(); ctx.fillRect(trashX - 3, rowY - 15, 28, 4); ctx.fillRect(trashX + 7, rowY - 19, 8, 4);
      this.hit('clear', trashX - 6, rowY - 22, 36, 40);
      for (let i = 0; i < pots; i++) {
        const cx = startX + 44 + i * (pr * 2 + 10) + pr;
        ctx.fillStyle = dark ? '#3b4658' : '#9aa7b8'; rr(ctx, cx - pr, rowY - pr + 4, pr * 2, pr * 2 - 2, 5); ctx.fill();
        ctx.fillStyle = Factory.PAINTS[i]; ctx.beginPath(); ctx.ellipse(cx, rowY - pr + 6, pr - 2, 6, 0, 0, Math.PI * 2); ctx.fill();
        if (tk.paint === i) { ctx.strokeStyle = st.theme.fg; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, rowY, pr + 5, 0, Math.PI * 2); ctx.stroke(); }
        this.hit('paint', cx - pr - 4, rowY - pr - 4, pr * 2 + 8, pr * 2 + 8, i);
      }
      const ready = tk.cells.size > 0;
      const bx = startX + 44 + potsW + 16;
      pill(ctx, bx, rowY - 20, 120, 40, 'Press ▸', ready ? '#5aa9e6' : '#8a8f99', '#fff', ready && this.isHot('toPress'));
      if (ready) this.hit('toPress', bx, rowY - 20, 120, 40);
    }

    // ---- the press -----------------------------------------------------------------------------------------------

    drawPress(ctx, W, H, st, dark) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, dark ? '#2a2f38' : '#e3e6ea'); g.addColorStop(1, dark ? '#171a20' : '#c7ccd3');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const tk = st.active;
      if (!tk || tk.stage !== 'press') { this.drawEmpty(ctx, W, H, dark, '⤓', 'build'); return; }
      const cx = W * 0.4, bedY = Math.round(Math.min(H - 70, RAIL + 60 + (H - RAIL - 60) / 2 + 150)), pw = Math.min(220, W * 0.48);
      // The machine: columns, a bed, a plate that slams.
      const slam = tk.slamAt ? ease((this.t - tk.slamAt) / 0.18) * (1 - ease((this.t - tk.slamAt - 0.35) / 0.3)) : 0;
      const plateTop = Math.max(RAIL + 20, bedY - 230), plateY = plateTop + (bedY - 70 - plateTop) * slam;
      ctx.fillStyle = dark ? '#4a5263' : '#8792a3';
      ctx.fillRect(cx - pw / 2 - 18, plateTop - 6, 16, bedY - plateTop + 26); ctx.fillRect(cx + pw / 2 + 2, plateTop - 6, 16, bedY - plateTop + 26);
      ctx.fillStyle = dark ? '#5b6477' : '#a2acbb'; rr(ctx, cx - pw / 2 - 22, plateTop - 16, pw + 44, 14, 4); ctx.fill();
      ctx.fillStyle = '#6b7488'; ctx.fillRect(cx - 6, plateTop - 4, 12, plateY - plateTop + 4);
      ctx.fillStyle = '#9aa3b8'; rr(ctx, cx - pw / 2, plateY, pw, 22, 4); ctx.fill();
      ctx.fillStyle = '#f28c38'; ctx.fillRect(cx - pw / 2, plateY + 18, pw, 4);
      ctx.fillStyle = dark ? '#3a4150' : '#6f7a8c'; rr(ctx, cx - pw / 2 - 10, bedY, pw + 20, 18, 4); ctx.fill();
      const cells = Array.from(tk.cells).map((k) => k.split(',').map(Number));
      drawShape(ctx, cells, { x: cx - pw / 2 + 10, y: bedY - 64, w: pw - 20, h: 62 }, Factory.PAINTS[tk.paint], st.look.skin, 20);
      if (slam > 0.8) { ctx.fillStyle = 'rgba(255,230,160,0.5)'; ctx.fillRect(cx - pw / 2, bedY - 4, pw, 4); }
      // The gauge: stop the needle in the green.
      const gx = Math.min(W - 70, cx + pw / 2 + 90), gy = plateTop + 90, gr = Math.min(58, W * 0.14);
      const zones = [['#eb6f92', 0, 0.3], ['#f6c177', 0.3, 0.42], ['#6cc486', 0.42, 0.58], ['#f6c177', 0.58, 0.7], ['#eb6f92', 0.7, 1]];
      ctx.lineWidth = 12;
      for (const [c, a, b] of zones) { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI + a * Math.PI, Math.PI + b * Math.PI); ctx.stroke(); }
      const v = tk.pressAt != null ? tk.pressValue : st.needle;
      const ang = Math.PI + v * Math.PI;
      ctx.strokeStyle = dark ? '#f0f2f5' : '#1d1f27'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ang) * (gr - 4), gy + Math.sin(ang) * (gr - 4)); ctx.stroke();
      ctx.fillStyle = dark ? '#f0f2f5' : '#1d1f27'; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill();
      // The big button (the whole scene works too).
      const br = 34, bx = gx, by = Math.min(H - br - 14, gy + gr + 50);
      const hot = this.isHot('press');
      ctx.fillStyle = '#7a1e2c'; ctx.beginPath(); ctx.ellipse(bx, by + 6, br, br * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hot ? '#ff5d6c' : '#e8435a'; ctx.beginPath(); ctx.ellipse(bx, by - (tk.pressAt != null ? 0 : 4), br, br * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 12px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('PRESS', bx, by + 1); ctx.textAlign = 'start';
      if (tk.pressAt == null) this.hit('press', 0, RAIL, W, H - RAIL);
      if (tk.verdict) {
        const k = (this.t - tk.pressAt);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
        ctx.font = '900 26px ' + FONT; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.strokeText(tk.verdict, cx, plateTop - 14 - k * 10); ctx.fillStyle = tk.verdictColor; ctx.fillText(tk.verdict, cx, plateTop - 14 - k * 10);
        ctx.textAlign = 'start'; ctx.globalAlpha = 1;
      }
    }

    drawEmpty(ctx, W, H, dark, icon, go) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'; ctx.font = '700 44px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(icon, W / 2, H / 2);
      const pw = 150, ph = 36, px = W / 2 - pw / 2, py = H / 2 + 24;
      pill(ctx, px, py, pw, ph, go === 'order' ? '◂ To the counter' : '◂ To the mold', '#8a8f99', '#fff', this.isHot('goto'));
      this.hit('goto', px, py, pw, ph, go);
      ctx.textAlign = 'start';
    }

    // ---- the verdict ---------------------------------------------------------------------------------------------

    drawRating(ctx, W, H, st, dark) {
      const r = st.rating, k = ease((this.t - r.at) / 0.35);
      ctx.fillStyle = 'rgba(0,0,0,' + 0.35 * k + ')'; ctx.fillRect(0, 0, W, H);
      const cw = Math.min(360, W - 24), ch = Math.min(250, H - 40), cx = (W - cw) / 2, cy = (H - ch) / 2 + (1 - k) * 30;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16;
      ctx.fillStyle = dark ? '#262b36' : '#fffdf8'; rr(ctx, cx, cy, cw, ch, 16); ctx.fill(); ctx.restore();
      const mood = r.grade.total >= 80 ? 'happy' : r.grade.total >= 55 ? 'flat' : 'sad';
      drawCustomer(ctx, r.order.customer, cx + 58, cy + ch - 62, 0.95, this.t, mood);
      // Scores, step by step.
      const rows = [['▦', r.grade.shape], ['●', r.grade.paint], ['⤓', r.grade.press], ['⏱', r.grade.wait]];
      const rx = cx + 120, rw = cw - 140;
      rows.forEach(([icon, v], i) => {
        const y = cy + 24 + i * 26, show = Math.min(1, Math.max(0, (this.t - r.at - 0.2 - i * 0.15) / 0.3));
        ctx.fillStyle = dark ? '#aab2c0' : '#6b7280'; ctx.font = '700 13px ' + FONT; ctx.fillText(icon, rx, y + 10);
        ctx.fillStyle = dark ? '#3a4150' : '#ece6d8'; rr(ctx, rx + 22, y, rw - 60, 12, 6); ctx.fill();
        ctx.fillStyle = v >= 90 ? '#6cc486' : v >= 60 ? '#f6c177' : '#eb6f92'; rr(ctx, rx + 22, y, (rw - 60) * v / 100 * show, 12, 6); ctx.fill();
        ctx.fillStyle = dark ? '#e7e9ef' : '#1c1f26'; ctx.font = '700 12px ' + FONT; ctx.textAlign = 'right'; ctx.fillText(String(Math.round(v * show)), rx + rw, y + 11); ctx.textAlign = 'start';
      });
      // Total, stars, pay.
      const ty = cy + 24 + 4 * 26 + 18;
      ctx.fillStyle = dark ? '#e7e9ef' : '#1c1f26'; ctx.font = '900 30px ' + FONT; ctx.fillText(String(r.grade.total), rx, ty + 22);
      const starX = rx + ctx.measureText(String(r.grade.total)).width + 22;
      for (let i = 0; i < 3; i++) {
        const on = i < r.grade.stars, sx = starX + i * 24, sy = ty + 12;
        ctx.fillStyle = on ? '#f7c548' : (dark ? '#3a4150' : '#e3dccb');
        ctx.beginPath();
        for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + p * Math.PI / 5, rad = p % 2 ? 4.5 : 10; ctx.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill();
      }
      ctx.font = '700 13px ' + FONT; ctx.fillStyle = '#6cc486';
      ctx.fillText('+' + L.fmt(r.grade.credits + r.grade.tip) + '¢', rx, ty + 46);
      if (r.grade.lines) { ctx.fillStyle = '#5ec8f0'; ctx.fillText('+' + r.grade.lines + ' ◆', rx + 90, ty + 46); }
      const bw = 110, bh = 36, bx = cx + cw - bw - 16, by = cy + ch - bh - 14;
      pill(ctx, bx, by, bw, bh, 'Next', '#f28c38', '#fff', this.isHot('next'));
      this.hit('next', cx, cy, cw, ch);
    }
  }

  L.StationView = StationView;
  L.Stations = { RAIL, drawCustomer, drawShape };
  void rgba;
})(typeof globalThis !== 'undefined' ? globalThis : this);
