// Canvas candlestick chart: candles, 20/50-bar averages, volume, trade markers, stop line and a hover readout.
(function (root) {
  const TT = (root.TT = root.TT || {});

  function fmtPrice(p) {
    if (p == null || !isFinite(p)) return '—';
    const a = Math.abs(p);
    if (a >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (a >= 100) return p.toLocaleString('en-US', { maximumFractionDigits: 1 });
    if (a >= 1) return p.toFixed(2);
    if (a === 0) return '0';
    return p.toPrecision(3);
  }

  function fmtTime(t, interval, withYear) {
    const d = new Date(t * 1000);
    const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = d.getUTCDate();
    if (interval === '1d') return withYear ? `${mon} ${day}, ${d.getUTCFullYear()}` : `${mon} ${day}`;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    return `${mon} ${day} ${hh}:00`;
  }

  function cssVar(el, name) {
    return getComputedStyle(el).getPropertyValue(name).trim();
  }

  function niceSteps(lo, hi, n, log) {
    if (log) {
      // 1-2-5 steps per decade; thinned to about n+1 labels.
      const out = [];
      for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
        for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); }
      if (out.length >= 3) { const every = Math.ceil(out.length / (n + 1)); return out.filter((_, k) => k % every === 0); }
      return niceSteps(lo, hi, n, false);
    }
    const raw = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  }

  class Chart {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = null;
      this.hover = null;
      const move = (e) => {
        const r = canvas.getBoundingClientRect();
        this.hover = { x: (e.touches ? e.touches[0].clientX : e.clientX) - r.left };
        this.draw();
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(canvas);
    }

    set(opts) { this.opts = opts; this.draw(); }

    draw() {
      const o = this.opts;
      if (!o) return;
      const { canvas, ctx } = this;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H) return;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const col = {
        up: cssVar(canvas, '--candle-up'), down: cssVar(canvas, '--candle-down'),
        grid: cssVar(canvas, '--chart-grid'), text: cssVar(canvas, '--chart-text'),
        s20: cssVar(canvas, '--sma20'), s50: cssVar(canvas, '--sma50'),
        stop: cssVar(canvas, '--red'), buy: cssVar(canvas, '--green'), sell: cssVar(canvas, '--red'),
        now: cssVar(canvas, '--blue'), bg: cssVar(canvas, '--card'),
      };
      const s = o.series;
      const upto = o.upto;
      const axisW = 58, timeH = 18, pad = 6;
      const plotW = W - axisW - pad;
      const maxBars = Math.max(30, Math.min(140, Math.floor(plotW / 5)));
      const from = Math.max(0, upto - maxBars + 1);
      const n = upto - from + 1;
      const slot = plotW / Math.max(n, 30);
      const bodyW = Math.max(1.5, Math.min(12, slot * 0.68));
      const priceH = (H - timeH) * 0.8, volTop = priceH + 4, volH = H - timeH - volTop - 2;
      const k = o.scale || 1;

      let lo = Infinity, hi = -Infinity;
      for (let i = from; i <= upto; i++) { lo = Math.min(lo, s.l[i]); hi = Math.max(hi, s.h[i]); }
      if (o.stop && o.stop > lo * 0.5) { lo = Math.min(lo, o.stop); hi = Math.max(hi, o.stop); }
      const log = hi / lo > 2.5;
      const span = log ? Math.log(hi / lo) : hi - lo;
      const padP = span * 0.06 || hi * 0.01;
      const yLo = log ? Math.log(lo) - padP : lo - padP, yHi = log ? Math.log(hi) + padP : hi + padP;
      const y = (p) => { const v = log ? Math.log(Math.max(p, 1e-12)) : p; return pad + (1 - (v - yLo) / (yHi - yLo)) * (priceH - pad); };
      const x = (i) => pad + (i - from + 0.5) * slot;

      // grid + price labels
      ctx.font = '600 11px Nunito, ui-rounded, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = col.grid; ctx.fillStyle = col.text; ctx.lineWidth = 1;
      for (const p of niceSteps(log ? Math.exp(yLo) : yLo, log ? Math.exp(yHi) : yHi, 4, log)) {
        const yy = Math.round(y(p)) + 0.5;
        if (yy < pad || yy > priceH) continue;
        ctx.beginPath(); ctx.moveTo(pad, yy); ctx.lineTo(pad + plotW, yy); ctx.stroke();
        ctx.fillText(fmtPrice(p * k), pad + plotW + 6, yy);
      }

      // volume
      let vmax = 0;
      for (let i = from; i <= upto; i++) vmax = Math.max(vmax, s.v[i]);
      for (let i = from; i <= upto; i++) {
        const hgt = vmax ? (s.v[i] / vmax) * volH : 0;
        ctx.fillStyle = s.c[i] >= s.o[i] ? col.up : col.down;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(x(i) - bodyW / 2, volTop + volH - hgt, bodyW, hgt);
      }
      ctx.globalAlpha = 1;

      // moving averages
      const line = (arr, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath();
        let started = false;
        for (let i = from; i <= upto; i++) {
          if (arr[i] == null) continue;
          if (!started) { ctx.moveTo(x(i), y(arr[i])); started = true; } else ctx.lineTo(x(i), y(arr[i]));
        }
        ctx.stroke();
      };
      line(s.ind.sma50, col.s50);
      line(s.ind.sma20, col.s20);

      // candles
      for (let i = from; i <= upto; i++) {
        const up = s.c[i] >= s.o[i];
        ctx.strokeStyle = ctx.fillStyle = up ? col.up : col.down;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x(i)) + 0.5, y(s.h[i])); ctx.lineTo(Math.round(x(i)) + 0.5, y(s.l[i])); ctx.stroke();
        const top = y(Math.max(s.o[i], s.c[i])), bot = y(Math.min(s.o[i], s.c[i]));
        ctx.fillRect(x(i) - bodyW / 2, top, bodyW, Math.max(1, bot - top));
      }

      // decision line
      if (o.decisionAt != null && o.decisionAt >= from && o.decisionAt <= upto) {
        ctx.strokeStyle = col.now; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x(o.decisionAt) + slot / 2, pad); ctx.lineTo(x(o.decisionAt) + slot / 2, priceH); ctx.stroke();
        ctx.setLineDash([]);
      }

      // stop line
      if (o.stop) {
        const yy = y(o.stop);
        ctx.strokeStyle = col.stop; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(pad, yy); ctx.lineTo(pad + plotW, yy); ctx.stroke(); ctx.setLineDash([]);
        const label = 'STOP ' + fmtPrice(o.stop * k);
        ctx.font = '800 10px Nunito, ui-rounded, system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = col.stop; roundRect(ctx, pad + plotW - tw - 2, yy - 9, tw, 18, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(label, pad + plotW - tw + 3, yy);
      }

      // trade markers
      for (const tr of o.trades || []) {
        if (tr.i < from || tr.i > upto) continue;
        const xx = x(tr.i);
        const buy = tr.side === 'buy';
        const yy = buy ? y(s.l[tr.i]) + 10 : y(s.h[tr.i]) - 10;
        ctx.fillStyle = buy ? col.buy : tr.side === 'stop' ? cssVar(canvas, '--orange') : col.sell;
        ctx.beginPath();
        if (buy) { ctx.moveTo(xx, yy - 6); ctx.lineTo(xx - 6, yy + 5); ctx.lineTo(xx + 6, yy + 5); }
        else { ctx.moveTo(xx, yy + 6); ctx.lineTo(xx - 6, yy - 5); ctx.lineTo(xx + 6, yy - 5); }
        ctx.closePath(); ctx.fill();
      }

      // time labels
      ctx.fillStyle = col.text; ctx.font = '600 11px Nunito, ui-rounded, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
      const labels = Math.max(2, Math.floor(plotW / 110));
      for (let j = 0; j <= labels; j++) {
        const i = Math.round(from + ((n - 1) * j) / labels);
        const text = o.blind ? `Bar ${i + 1}` : fmtTime(s.t[i], s.interval);
        const tw = ctx.measureText(text).width;
        ctx.fillText(text, Math.min(Math.max(pad, x(i) - tw / 2), pad + plotW - tw), H - 4);
      }

      // hover readout
      if (this.hover && this.hover.x >= pad && this.hover.x <= pad + plotW) {
        const i = Math.min(upto, Math.max(from, Math.floor((this.hover.x - pad) / slot) + from));
        ctx.strokeStyle = col.text; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x(i)) + 0.5, pad); ctx.lineTo(Math.round(x(i)) + 0.5, H - timeH); ctx.stroke();
        ctx.globalAlpha = 1;
        const chg = s.c[i] / s.o[i] - 1;
        const txt = `${o.blind ? 'Bar ' + (i + 1) : fmtTime(s.t[i], s.interval, true)}  O ${fmtPrice(s.o[i] * k)}  H ${fmtPrice(s.h[i] * k)}  L ${fmtPrice(s.l[i] * k)}  C ${fmtPrice(s.c[i] * k)}  ${(chg >= 0 ? '+' : '') + (chg * 100).toFixed(1)}%`;
        ctx.font = '700 11px Nunito, ui-rounded, system-ui, sans-serif';
        const tw = Math.min(plotW - 4, ctx.measureText(txt).width + 12);
        ctx.fillStyle = col.bg; ctx.globalAlpha = 0.92; roundRect(ctx, pad + 2, pad, tw, 20, 6); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = col.text; ctx.textBaseline = 'middle'; ctx.fillText(txt, pad + 8, pad + 10, tw - 12);
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  TT.Chart = Chart;
  TT.fmtPrice = fmtPrice;
  TT.fmtTime = fmtTime;
})(typeof window !== 'undefined' ? window : globalThis);
