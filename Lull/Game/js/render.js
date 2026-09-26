// Lull — drawing: palettes, mino skins, frames, backdrops, ghosts, line-clear effects, and the board view (which
// can be turned a quarter or half turn for the Sideways and Upside Down wildcards).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Pieces, PALETTES, clamp } = L;

  // ---- colour ---------------------------------------------------------------------------------------------------------

  const rgbCache = new Map();
  function rgb(hex) {
    let v = rgbCache.get(hex);
    if (v) return v;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, v);
    return v;
  }
  function rgba(hex, a) { const [r, g, b] = rgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
  function toHex(r, g, b) { return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
  /** Mixes toward white (amt > 0) or black (amt < 0). */
  function shade(hex, amt) {
    const [r, g, b] = rgb(hex);
    if (amt >= 0) return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    return toHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  }
  function mix(a, b, t) { const x = rgb(a), y = rgb(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return toHex(255 * f(0), 255 * f(8), 255 * f(4));
  }
  function luminance(hex) { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

  const PRISM_HUES = [0, 185, 50, 285, 125, 355, 220, 30, 0, 320, 95, 165, 255, 15, 200, 0];
  /** The 16 colour slots of a palette at time t (only Prism changes with time). */
  function paletteColors(id, t) {
    const p = PALETTES[id] || PALETTES.classic;
    if (!p.animated) return p.colors;
    const off = Math.floor(((t || 0) / 1000) * 24 / 10) * 10; // 24°/s in 10° steps (keeps sprites cacheable)
    return PRISM_HUES.map((h, i) => (i === 8 ? '#5b6170' : i === 15 ? '#c3c8d2' : hsl(h + off, 78, 62)));
  }

  // ---- skins ----------------------------------------------------------------------------------------------------------

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const SKIN_PAINT = {
    flat(ctx, s, c) {
      const g = s > 14 ? 1 : 0.5;
      ctx.fillStyle = c; rr(ctx, g, g, s - 2 * g, s - 2 * g, s * 0.14); ctx.fill();
    },
    bevel(ctx, s, c) {
      const b = Math.max(2, Math.round(s * 0.16));
      ctx.fillStyle = c; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = shade(c, 0.4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.lineTo(s - b, b); ctx.lineTo(b, b); ctx.lineTo(b, s - b); ctx.lineTo(0, s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c, -0.35);
      ctx.beginPath(); ctx.moveTo(s, s); ctx.lineTo(0, s); ctx.lineTo(b, s - b); ctx.lineTo(s - b, s - b); ctx.lineTo(s - b, b); ctx.lineTo(s, 0); ctx.closePath(); ctx.fill();
    },
    outline(ctx, s, c) {
      const lw = Math.max(1.5, s * 0.1);
      ctx.fillStyle = rgba(c, 0.16); rr(ctx, lw / 2 + 1, lw / 2 + 1, s - lw - 2, s - lw - 2, s * 0.12); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.stroke();
    },
    bubble(ctx, s, c) {
      const g = ctx.createRadialGradient(s * 0.36, s * 0.32, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
      g.addColorStop(0, shade(c, 0.55)); g.addColorStop(0.55, c); g.addColorStop(1, shade(c, -0.3));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(s * 0.36, s * 0.3, s * 0.11, s * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
    },
    pixel(ctx, s, c) {
      const p = s / 4;
      ctx.fillStyle = c; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = shade(c, 0.35); ctx.fillRect(0, 0, s, p); ctx.fillRect(0, 0, p, s);
      ctx.fillStyle = shade(c, -0.35); ctx.fillRect(0, s - p, s, p); ctx.fillRect(s - p, 0, p, s);
      ctx.fillStyle = shade(c, 0.7); ctx.fillRect(p, p, p, p);
    },
    glass(ctx, s, c) {
      ctx.fillStyle = rgba(c, 0.42); rr(ctx, 1, 1, s - 2, s - 2, s * 0.12); ctx.fill();
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; rr(ctx, 1, 1, s - 2, s * 0.55, s * 0.12); ctx.fill();
      ctx.strokeStyle = rgba(shade(c, 0.5), 0.95); ctx.lineWidth = 1; rr(ctx, 1.5, 1.5, s - 3, s - 3, s * 0.12); ctx.stroke();
    },
    wire(ctx, s, c) {
      ctx.fillStyle = rgba(c, 0.08); ctx.fillRect(1, 1, s - 2, s - 2);
      ctx.strokeStyle = c; ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 1.5, s - 3, s - 3);
      ctx.beginPath(); ctx.moveTo(1.5, 1.5); ctx.lineTo(s - 1.5, s - 1.5); ctx.moveTo(s - 1.5, 1.5); ctx.lineTo(1.5, s - 1.5); ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1;
    },
    neon(ctx, s, c) {
      const lw = Math.max(1.5, s * 0.09);
      ctx.fillStyle = rgba(c, 0.12); rr(ctx, s * 0.14, s * 0.14, s * 0.72, s * 0.72, s * 0.14); ctx.fill();
      ctx.shadowColor = c; ctx.shadowBlur = s * 0.35;
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(0.75, lw * 0.35); ctx.stroke();
    },
    brick(ctx, s, c) {
      ctx.fillStyle = c; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = shade(c, 0.18); ctx.fillRect(0, 0, s, Math.max(1, s * 0.08));
      ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
      ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s / 2);
      ctx.moveTo(s * 0.2, s / 2); ctx.lineTo(s * 0.2, s); ctx.moveTo(s * 0.8, s / 2); ctx.lineTo(s * 0.8, s);
      ctx.stroke();
      ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    },
    gem(ctx, s, c) {
      const i = s * 0.26;
      const tri = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fill(); };
      tri([0, 0, s, 0, s - i, i, i, i], shade(c, 0.45));
      tri([0, 0, i, i, i, s - i, 0, s], shade(c, 0.2));
      tri([s, 0, s, s, s - i, s - i, s - i, i], shade(c, -0.25));
      tri([0, s, i, s - i, s - i, s - i, s, s], shade(c, -0.45));
      ctx.fillStyle = c; ctx.fillRect(i, i, s - 2 * i, s - 2 * i);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(i, i, (s - 2 * i) * 0.45, (s - 2 * i) * 0.25);
    },
    jelly(ctx, s, c) {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, shade(c, 0.3)); g.addColorStop(1, shade(c, -0.12));
      ctx.fillStyle = g; rr(ctx, 1, 1, s - 2, s - 2, s * 0.32); ctx.fill();
      ctx.strokeStyle = rgba(shade(c, -0.35), 0.8); ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; rr(ctx, s * 0.2, s * 0.14, s * 0.42, s * 0.16, s * 0.08); ctx.fill();
    },
    steel(ctx, s, c) {
      const base = mix(c, '#9aa4b1', 0.55);
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.3));
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      for (let k = 3; k < s; k += 3) { ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(s, k - 1); ctx.stroke(); }
      ctx.strokeStyle = shade(base, -0.45); ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      const rv = Math.max(1, s * 0.07);
      ctx.fillStyle = shade(base, -0.4);
      for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { ctx.beginPath(); ctx.arc(s * x, s * y, rv, 0, Math.PI * 2); ctx.fill(); }
    },
  };

  const spriteCache = new Map();
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  /** A cached image of one cell. `s` is in device pixels. */
  function cellSprite(skin, color, s) {
    s = Math.max(2, Math.round(s));
    const key = skin + '|' + color + '|' + s;
    let c = spriteCache.get(key);
    if (c) return c;
    if (spriteCache.size > 1500) spriteCache.clear();
    c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    (SKIN_PAINT[skin] || SKIN_PAINT.flat)(ctx, s, color);
    spriteCache.set(key, c);
    return c;
  }

  function drawCell(ctx, skin, color, x, y, s, alpha) {
    const dpr = ctx.__dpr || 1;
    const img = cellSprite(skin, color, s * dpr);
    if (alpha != null && alpha < 1) { ctx.globalAlpha = alpha; ctx.drawImage(img, x, y, s, s); ctx.globalAlpha = 1; }
    else ctx.drawImage(img, x, y, s, s);
  }

  function drawGem(ctx, x, y, s, t) {
    const cx = x + s / 2, cy = y + s / 2, r = s * 0.3;
    ctx.fillStyle = '#e0fbff';
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5ee7ff';
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy); ctx.lineTo(cx, cy + r * 0.15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,40,60,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy); ctx.closePath(); ctx.stroke();
    const tw = (Math.sin((t || 0) / 300 + x) + 1) / 2;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + tw * 0.6) + ')';
    ctx.fillRect(cx - r * 0.55, cy - r * 0.45, Math.max(1, s * 0.07), Math.max(1, s * 0.07));
  }

  function drawSpecial(ctx, special, x, y, s, t) {
    if (special === 'bomb') {
      ctx.fillStyle = '#23252b'; ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.56, s * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(x + s * 0.42, y + s * 0.46, s * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath(); ctx.moveTo(x + s * 0.62, y + s * 0.26); ctx.quadraticCurveTo(x + s * 0.74, y + s * 0.08, x + s * 0.86, y + s * 0.14); ctx.stroke();
      const f = (Math.sin((t || 0) / 90) + 1) / 2;
      ctx.fillStyle = f > 0.5 ? '#ffd166' : '#ff7a3d'; ctx.beginPath(); ctx.arc(x + s * 0.87, y + s * 0.13, s * (0.06 + f * 0.05), 0, Math.PI * 2); ctx.fill();
    } else if (special === 'drill') {
      ctx.fillStyle = '#c0c7d2';
      ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * 0.12); ctx.lineTo(x + s * 0.82, y + s * 0.12); ctx.lineTo(x + s * 0.5, y + s * 0.92); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5b6474'; ctx.lineWidth = Math.max(1, s * 0.05);
      const ph = ((t || 0) / 120) % 1;
      for (let k = 0; k < 3; k++) {
        const yy = y + s * (0.22 + ((k / 3 + ph) % 1) * 0.55);
        const half = (0.92 - (yy - y) / s) * s * 0.4;
        ctx.beginPath(); ctx.moveTo(x + s / 2 - half, yy); ctx.lineTo(x + s / 2 + half, yy + s * 0.08); ctx.stroke();
      }
    }
  }

  // ---- frames and backdrops -----------------------------------------------------------------------------------------

  function drawFrame(ctx, id, r, accent, t) {
    ctx.save();
    const { x, y, w, h } = r;
    if (id === 'double') {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
      ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.strokeRect(x - 6.5, y - 6.5, w + 13, h + 13);
    } else if (id === 'dashed') {
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    } else if (id === 'rounded') {
      ctx.strokeStyle = accent; ctx.lineWidth = 4; rr(ctx, x - 5, y - 5, w + 10, h + 10, 10); ctx.stroke();
    } else if (id === 'glow') {
      ctx.shadowColor = accent; ctx.shadowBlur = 14; ctx.strokeStyle = accent; ctx.lineWidth = 2; rr(ctx, x - 3, y - 3, w + 6, h + 6, 4); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.75; ctx.stroke();
    } else if (id === 'brass') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#f3d98b'); g.addColorStop(0.35, '#b8862d'); g.addColorStop(0.65, '#f7e3a1'); g.addColorStop(1, '#8a6420');
      ctx.strokeStyle = g; ctx.lineWidth = 6; rr(ctx, x - 5, y - 5, w + 10, h + 10, 3); ctx.stroke();
      ctx.fillStyle = '#6d4f18';
      for (const [px, py] of [[x - 5, y - 5], [x + w + 5, y - 5], [x - 5, y + h + 5], [x + w + 5, y + h + 5]]) { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
    } else if (id === 'rainbow') {
      const off = ((t || 0) / 20) % 360;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, hsl(off + k * 60, 85, 62));
      ctx.strokeStyle = g; ctx.lineWidth = 3.5; rr(ctx, x - 4, y - 4, w + 8, h + 8, 6); ctx.stroke();
    } else if (id === 'hazard') {
      ctx.beginPath(); ctx.rect(x - 8, y - 8, w + 16, h + 16); ctx.rect(x - 1, y - 1, w + 2, h + 2); ctx.clip('evenodd');
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
      ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 5;
      for (let k = -h - 16; k < w + h + 16; k += 14) { ctx.beginPath(); ctx.moveTo(x - 8 + k, y - 8); ctx.lineTo(x - 8 + k + h + 16, y + h + 8); ctx.stroke(); }
    } else {
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    }
    ctx.restore();
  }

  const starCache = new Map();
  function drawBackdrop(ctx, id, r, s, cols, rows, theme, t) {
    const { x, y, w, h } = r;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = theme.well; ctx.fillRect(x, y, w, h);
    if (id === 'grid' || id === 'blueprint') {
      if (id === 'blueprint') { ctx.fillStyle = 'rgba(40,90,170,0.28)'; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = id === 'blueprint' ? 'rgba(160,200,255,0.22)' : theme.grid; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < cols; c++) { const px = Math.round(x + c * s) + 0.5; ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
      for (let q = 1; q < rows; q++) { const py = Math.round(y + q * s) + 0.5; ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
      ctx.stroke();
      if (id === 'blueprint') {
        ctx.strokeStyle = 'rgba(160,200,255,0.08)';
        ctx.beginPath();
        for (let c = 0; c < cols; c++) { const px = Math.round(x + c * s + s / 2) + 0.5; ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
        ctx.stroke();
      }
    } else if (id === 'dots') {
      ctx.fillStyle = theme.grid;
      for (let c = 0; c <= cols; c++) for (let q = 0; q <= rows; q++) ctx.fillRect(Math.round(x + c * s) - 1, Math.round(y + q * s) - 1, 2, 2);
    } else if (id === 'scan') {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let py = y; py < y + h; py += 3) ctx.fillRect(x, py, w, 1);
    } else if (id === 'dusk') {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(70,40,120,0.35)'); g.addColorStop(0.65, 'rgba(180,80,110,0.2)'); g.addColorStop(1, 'rgba(250,150,80,0.25)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    } else if (id === 'stars') {
      const key = cols + 'x' + rows;
      let stars = starCache.get(key);
      if (!stars) {
        const r2 = new L.RNG(key);
        stars = [];
        for (let k = 0; k < cols * rows * 0.6; k++) stars.push([r2.next(), r2.next(), r2.next()]);
        starCache.set(key, stars);
      }
      for (const [sx, sy, sz] of stars) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + sz * 0.45) + ')';
        const d = sz > 0.85 ? 2 : 1;
        ctx.fillRect(Math.round(x + sx * w), Math.round(y + sy * h), d, d);
      }
    } else if (id === 'belt') {
      ctx.strokeStyle = 'rgba(242,193,78,0.06)'; ctx.lineWidth = s * 0.5;
      for (let k = -h; k < w + h; k += s * 1.4) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k - h, y + h); ctx.stroke(); }
    }
    ctx.restore();
  }

  function ghostCell(ctx, style, color, x, y, s) {
    if (style === 'off') return;
    ctx.save();
    if (style === 'faint') {
      ctx.fillStyle = rgba(color, 0.22); ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    } else if (style === 'dotted') {
      ctx.fillStyle = rgba(color, 0.8);
      const d = Math.max(1.5, s * 0.1);
      for (const fx of [0.3, 0.7]) for (const fy of [0.3, 0.7]) { ctx.beginPath(); ctx.arc(x + s * fx, y + s * fy, d, 0, Math.PI * 2); ctx.fill(); }
    } else if (style === 'glow') {
      ctx.shadowColor = color; ctx.shadowBlur = s * 0.5;
      ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = 1.5; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    } else {
      ctx.strokeStyle = rgba(color, 0.75); ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
    }
    ctx.restore();
  }

  // ---- effects --------------------------------------------------------------------------------------------------------

  class FX {
    constructor() { this.parts = []; this.flashes = []; this.texts = []; this.fades = []; this.streaks = []; this.shake = 0; }
    get active() { return this.parts.length || this.flashes.length || this.texts.length || this.fades.length || this.streaks.length || this.shake > 0.01; }
    clear() { this.parts = []; this.flashes = []; this.texts = []; this.fades = []; this.streaks = []; this.shake = 0; }
    /** A hard drop's trail: one fading band per column, from where the piece was to where it landed. */
    streak(x, y0, y1, w, color) { this.streaks.push({ x, y0, y1, w, color, t: 0, dur: 0.22 }); }
    dust(x, y, s, color) {
      for (let k = 0; k < 3; k++) this.parts.push({ kind: 'sq', x: x + Math.random() * s, y, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, g: 160, life: 0, max: 0.35 + Math.random() * 0.2, size: Math.max(2, s * 0.14), color });
    }

    flash(x, y, w, h, color, dur) { this.flashes.push({ x, y, w, h, color: color || '#ffffff', t: 0, dur: dur || 0.35 }); }
    text(str, x, y, color, size) { this.texts.push({ str, x, y, color: color || '#fff', size: size || 16, t: 0, dur: 1.3 }); }
    fadeCells(cells, skin, dur) { this.fades.push({ cells, skin, t: 0, dur: dur || 1.2 }); }

    burst(kind, cells, s, reduced) {
      // cells: [{x, y, color}] top-left in CSS px
      for (const c of cells) {
        const cx = c.x + s / 2, cy = c.y + s / 2;
        if (reduced) { this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.25, size: s, color: c.color, shrink: true }); continue; }
        if (kind === 'sparkle') {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.3, size: s, color: c.color, shrink: true });
          for (let k = 0; k < 3; k++) this.parts.push({ kind: 'star', x: cx + (Math.random() - 0.5) * s, y: cy + (Math.random() - 0.5) * s, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 40, g: 0, life: 0, max: 0.7 + Math.random() * 0.5, size: s * (0.18 + Math.random() * 0.15), color: '#fffbe6' });
        } else if (kind === 'shatter') {
          for (let k = 0; k < 4; k++) {
            const ox = (k % 2) - 0.5, oy = Math.floor(k / 2) - 0.5;
            this.parts.push({ kind: 'shard', x: cx + ox * s / 2, y: cy + oy * s / 2, vx: ox * (60 + Math.random() * 90), vy: -60 - Math.random() * 120 + oy * 40, g: 700, life: 0, max: 0.9, size: s / 2, color: c.color, rot: 0, vr: (Math.random() - 0.5) * 12 });
          }
        } else if (kind === 'confetti') {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.25, size: s, color: c.color, shrink: true });
          for (let k = 0; k < 4; k++) this.parts.push({ kind: 'conf', x: cx, y: cy, vx: (Math.random() - 0.5) * 200, vy: -120 - Math.random() * 140, g: 380, drag: 1.8, life: 0, max: 1.4 + Math.random() * 0.6, size: s * 0.28, color: hsl(Math.random() * 360, 85, 65), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18 });
        } else if (kind === 'ripple') {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.35, size: s, color: c.color, shrink: true });
        } else if (kind === 'sparks') {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.2, size: s, color: '#ffe8b0', shrink: true });
          for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 150 + Math.random() * 220; this.parts.push({ kind: 'spark', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 600, life: 0, max: 0.5 + Math.random() * 0.4, size: 2, color: Math.random() < 0.5 ? '#ffd166' : '#ff8c42' }); }
        } else {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.32, size: s, color: c.color, shrink: true });
        }
      }
    }

    ring(x, y, color, maxR) { this.parts.push({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.7, size: maxR, color }); }

    update(dt) {
      for (const p of this.parts) {
        p.life += dt;
        if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt * 0.5); }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
      this.parts = this.parts.filter((p) => p.life < p.max);
      for (const f of this.flashes) f.t += dt;
      this.flashes = this.flashes.filter((f) => f.t < f.dur);
      for (const f of this.texts) f.t += dt;
      this.texts = this.texts.filter((f) => f.t < f.dur);
      for (const f of this.fades) f.t += dt;
      this.fades = this.fades.filter((f) => f.t < f.dur);
      for (const f of this.streaks) f.t += dt;
      this.streaks = this.streaks.filter((f) => f.t < f.dur);
      this.shake *= Math.exp(-dt * 14);
    }

    draw(ctx) {
      for (const f of this.streaks) {
        const a = 1 - f.t / f.dur;
        const g = ctx.createLinearGradient(0, f.y0, 0, f.y1);
        g.addColorStop(0, rgba(f.color, 0)); g.addColorStop(1, rgba(f.color, 0.45 * a));
        ctx.fillStyle = g; ctx.fillRect(f.x + f.w * 0.15, Math.min(f.y0, f.y1), f.w * 0.7, Math.abs(f.y1 - f.y0));
      }
      for (const f of this.fades) {
        const a = 1 - f.t / f.dur;
        for (const c of f.cells) drawCell(ctx, f.skin, c.color, c.x, c.y, c.s, a * (f.alpha || 0.9));
      }
      for (const f of this.flashes) {
        ctx.fillStyle = rgba(f.color, 0.75 * (1 - f.t / f.dur));
        ctx.fillRect(f.x, f.y, f.w, f.h);
      }
      for (const p of this.parts) {
        const k = p.life / p.max, a = 1 - k;
        if (p.kind === 'sq') {
          const sz = p.shrink ? p.size * (1 - k * 0.8) : p.size;
          ctx.fillStyle = rgba(p.color, a); ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
          ctx.fillStyle = 'rgba(255,255,255,' + a * 0.6 + ')'; ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else if (p.kind === 'star') {
          ctx.fillStyle = rgba(p.color, a);
          const r = p.size * (0.6 + 0.4 * Math.sin(p.life * 20));
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const ang = (i * Math.PI) / 4, rad = i % 2 ? r * 0.35 : r; ctx.lineTo(p.x + Math.cos(ang) * rad, p.y + Math.sin(ang) * rad); }
          ctx.closePath(); ctx.fill();
        } else if (p.kind === 'shard' || p.kind === 'conf') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
          ctx.fillStyle = rgba(p.color, a);
          if (p.kind === 'conf') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          else { ctx.beginPath(); ctx.moveTo(-p.size / 2, -p.size / 2); ctx.lineTo(p.size / 2, -p.size / 3); ctx.lineTo(0, p.size / 2); ctx.closePath(); ctx.fill(); }
          ctx.restore();
        } else if (p.kind === 'spark') {
          ctx.strokeStyle = rgba(p.color, a); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
        } else if (p.kind === 'ring') {
          ctx.strokeStyle = rgba(p.color, a * 0.8); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2); ctx.stroke();
        }
      }
      for (const f of this.texts) {
        const k = f.t / f.dur;
        ctx.save();
        ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
        ctx.font = '700 ' + f.size + 'px ' + FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        const yy = f.y - k * 18;
        ctx.strokeText(f.str, f.x, yy);
        ctx.fillStyle = f.color; ctx.fillText(f.str, f.x, yy);
        ctx.restore();
      }
    }
  }

  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

  // ---- piece previews -------------------------------------------------------------------------------------------------

  /** Draws a piece (by queue entry) fitted and centred in a box. */
  function drawPieceIn(ctx, entry, box, maxCell, look) {
    const type = Pieces.get(entry.id);
    if (!type) return;
    const special = entry.special;
    const cells = (special === 'bomb' || special === 'drill') ? [[0, 0]] : type.rots[entry.rot || 0];
    const b = Pieces.boundsOf(cells);
    const s = Math.floor(Math.min(maxCell, (box.w - 4) / b.w, (box.h - 4) / b.h));
    const ox = box.x + (box.w - b.w * s) / 2, oy = box.y + (box.h - b.h * s) / 2;
    const color = look.color(type.color);
    for (const [cx, cy] of cells) {
      const x = Math.round(ox + (cx - b.minX) * s), y = Math.round(oy + (b.maxY - cy) * s);
      if (special === 'bomb' || special === 'drill') drawSpecial(ctx, special, x, y, s, look.t);
      else drawCell(ctx, look.skin, color, x, y, s, look.alpha);
      if (special === 'sand') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 4; k++) ctx.fillRect(x + s * (0.2 + 0.5 * (k % 2)), y + s * (0.25 + 0.4 * (k >> 1)), Math.max(1, s * 0.1), Math.max(1, s * 0.1)); }
    }
  }

  // ---- the board view -------------------------------------------------------------------------------------------------

  class BoardView {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts || {};
      this.game = null;
      this.view = { rot: 0, fog: false, mono: false, blind: false, vanish: false, wrap: false };
      this.fx = new FX();
      this.look = null;
      this.dirty = true;
      this.lay = null;
      this.cssW = 0; this.cssH = 0;
      this.hint = null;
    }

    attach(game, view) {
      this.game = game;
      this.view = Object.assign({ rot: 0, fog: false, mono: false, blind: false, vanish: false, wrap: false }, view || {});
      this.fx.clear();
      this.lay = null;
      this.dirty = true;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w !== this.cssW || h !== this.cssH || dpr !== this.dpr) {
        this.cssW = w; this.cssH = h; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
        this.lay = null;
        this.dirty = true;
      }
    }

    layout() {
      const g = this.game;
      const rot = this.view.rot;
      const cols = rot % 180 === 0 ? g.w : g.h, rows = rot % 180 === 0 ? g.h : g.w;
      const W = this.cssW, H = this.cssH;
      const side = 4.4, pad = 10;
      const sA = Math.min((W - pad * 2) / (cols + side * 2 + 1.2), (H - pad * 2) / (rows + 0.4));
      const sB = Math.min((W - pad * 2) / (cols + 0.4), (H - pad * 2) / (rows + 3.6));
      const wide = sA >= sB * 0.97;
      const s = Math.max(4, Math.floor(wide ? sA : sB));
      const bw = cols * s, bh = rows * s;
      let bx, by, hold, next, nextDir;
      if (wide) {
        const total = bw + 2 * (side * s + s * 0.6);
        bx = Math.round((W - total) / 2 + side * s + s * 0.6);
        by = Math.round((H - bh) / 2);
        hold = { x: bx - s * 0.6 - side * s, y: by, w: side * s, h: 3.6 * s };
        next = { x: bx + bw + s * 0.6, y: by, w: side * s, h: bh };
        nextDir = 'v';
      } else {
        bx = Math.round((W - bw) / 2);
        by = Math.round((H - bh - 3.2 * s) / 2 + 3.2 * s);
        hold = { x: bx, y: by - 3.2 * s, w: 3.4 * s, h: 2.9 * s };
        next = { x: bx + 3.8 * s, y: by - 3.2 * s, w: bw - 3.8 * s, h: 2.9 * s };
        nextDir = 'h';
      }
      this.lay = { s, cols, rows, board: { x: bx, y: by, w: bw, h: bh }, hold, next, nextDir, wide };
      return this.lay;
    }

    /** Top-left of logical cell (x, y) on screen. */
    toScreen(x, y) {
      const { s, board } = this.lay, g = this.game, rot = this.view.rot;
      let c, r;
      if (rot === 0) { c = x; r = g.h - 1 - y; }
      else if (rot === 180) { c = g.w - 1 - x; r = y; }
      else if (rot === 90) { c = y; r = x; }
      else { c = g.h - 1 - y; r = g.w - 1 - x; }
      return [board.x + c * s, board.y + r * s];
    }

    /** Logical column under a screen point (CSS px), or null outside the board. */
    /** Logical cell under a screen point (CSS px), or null outside the board. */
    cellAt(px, py) {
      if (!this.lay || !this.game) return null;
      const { s, board } = this.lay, g = this.game, rot = this.view.rot;
      if (px < board.x || py < board.y || px >= board.x + board.w || py >= board.y + board.h) return null;
      const c = Math.floor((px - board.x) / s), r = Math.floor((py - board.y) / s);
      if (rot === 0) return { x: c, y: g.h - 1 - r };
      if (rot === 180) return { x: g.w - 1 - c, y: r };
      if (rot === 90) return { x: r, y: c };
      return { x: g.w - 1 - r, y: g.h - 1 - c };
    }

    /** The logical cell nearest a screen point — off the grid it clamps to the edge. */
    cellClamped(px, py) {
      if (!this.lay || !this.game) return null;
      const { board } = this.lay;
      const x = Math.max(board.x + 1, Math.min(board.x + board.w - 1, px));
      const y = Math.max(board.y + 1, Math.min(board.y + board.h - 1, py));
      return this.cellAt(x, y);
    }

    /** Is a screen point on the hold box? */
    onHold(px, py) {
      if (!this.lay || !this.game || this.game.mods.noHold) return false;
      const b = this.lay.hold;
      return px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4;
    }

    columnAt(px, py) {
      if (!this.lay || !this.game) return null;
      const { s, board } = this.lay, g = this.game, rot = this.view.rot;
      if (px < board.x || py < board.y || px >= board.x + board.w || py >= board.y + board.h) return null;
      const c = Math.floor((px - board.x) / s), r = Math.floor((py - board.y) / s);
      if (rot === 0) return c;
      if (rot === 180) return g.w - 1 - c;
      if (rot === 90) return r;
      return g.w - 1 - r;
    }

    /** Screen direction (dx, dy; y down) of a logical direction (y up). */
    screenDir(dx, dy) {
      const rot = this.view.rot;
      if (rot === 0) return [dx, -dy];
      if (rot === 180) return [-dx, dy];
      if (rot === 90) return [dy, dx];
      return [-dy, -dx];
    }

    setLook(look) { this.look = look; this.dirty = true; }

    colorOf(v) {
      const look = this.look;
      if (this.view.mono) return look.monoColor;
      return look.colors[v & CELL.COLOR] || look.colors[8];
    }

    needsFrame() { return this.dirty || this.fx.active || this.alive || (this.look && this.look.animated); }

    render(now) {
      if (!this.game || !this.look || !this.cssW) return;
      const ctx = this.ctx, look = this.look, g = this.game;
      if (!this.lay) this.layout();
      const { s, board, cols, rows } = this.lay;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      const shake = this.fx.shake;
      if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

      drawBackdrop(ctx, look.backdrop, board, s, cols, rows, look.theme, now);
      const p = g.piece;
      const pieceCells = p ? g.cellsOf(p) : [];
      const gy = p ? g.ghostY(p) : null;
      const ghostCells = this.mouseGhost && p ? this.mouseGhost : p && gy != null && gy !== p.y ? g.cellsOf(p, p.rot, p.x, gy) : [];

      // Fog: only what is near the piece (and where it would land) can be seen.
      let near = null;
      if (this.view.fog && p) {
        near = new Set();
        for (const [cx, cy] of pieceCells.concat(ghostCells)) {
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.add(g.board.wx(cx + dx) + ',' + (cy + dy));
        }
      }

      // Settled blocks.
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          const v = g.board.get(x, y);
          if (!v) continue;
          if (v & CELL.HIDDEN) continue;
          if (near && !near.has(x + ',' + y)) continue;
          const [sx, sy] = this.toScreen(x, y);
          drawCell(ctx, look.skin, this.colorOf(v), sx, sy, s);
          if (v & CELL.GEM) drawGem(ctx, sx, sy, s, now);
        }
      }
      if (near) {
        // A soft vignette where the fog is.
        ctx.save();
        ctx.fillStyle = look.theme.fog;
        ctx.beginPath(); ctx.rect(board.x, board.y, board.w, board.h);
        for (const k of near) {
          const [x, y] = k.split(',').map(Number);
          if (y < 0 || y >= g.h || x < 0 || x >= g.w) continue;
          const [sx, sy] = this.toScreen(x, y);
          ctx.rect(sx + s, sy, -s, s);
        }
        ctx.fill('evenodd');
        ctx.restore();
      }

      // Mouse play: the column under the pointer.
      if (this.pointerCol != null && p) {
        ctx.fillStyle = rgba(look.theme.accent, 0.07);
        for (let y = 0; y < g.h; y++) { const [sx, sy] = this.toScreen(this.pointerCol, y); ctx.fillRect(sx, sy, s, s); }
      }

      // Hint (puzzle): where the known solution puts this piece.
      if (this.hint && p) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        for (const [cx, cy] of this.hint) {
          const [sx, sy] = this.toScreen(cx, cy);
          ctx.strokeStyle = look.theme.accent; ctx.lineWidth = 2; ctx.strokeRect(sx + 2, sy + 2, s - 4, s - 4);
        }
        ctx.restore();
      }

      if (p) {
        const color = this.colorOf(p.type.color);
        if (p.special === 'drill') {
          const [dx, dy] = pieceCells[0];
          ctx.fillStyle = 'rgba(255,90,90,0.16)';
          for (let y = dy - 1; y >= 0; y--) { const [sx, sy] = this.toScreen(dx, y); ctx.fillRect(sx, sy, s, s); }
        } else if (look.ghost !== 'off') {
          for (const [cx, cy] of ghostCells) { const [sx, sy] = this.toScreen(cx, cy); ghostCell(ctx, look.ghost, color, sx, sy, s); }
        }
        const overlapping = p.special === 'phase' && !g.board.fits(p.type.rots[p.rot], p.x, p.y);
        for (const [cx, cy] of pieceCells) {
          const [sx, sy] = this.toScreen(cx, cy);
          if (p.special === 'bomb' || p.special === 'drill') { drawSpecial(ctx, p.special, sx, sy, s, now); continue; }
          drawCell(ctx, look.skin, color, sx, sy, s, p.special === 'phase' ? (overlapping ? 0.45 : 0.75) : 1);
          if (p.special === 'phase') { ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.7; ctx.strokeRect(sx + 1.5, sy + 1.5, s - 3, s - 3); ctx.restore(); }
          if (p.special === 'sand') { ctx.fillStyle = 'rgba(0,0,0,0.28)'; for (let k = 0; k < 4; k++) ctx.fillRect(sx + s * (0.2 + 0.5 * (k % 2)), sy + s * (0.25 + 0.4 * (k >> 1)), Math.max(1, s * 0.1), Math.max(1, s * 0.1)); }
        }
      }

      drawFrame(ctx, look.frame, board, look.theme.accent, now);
      // Close to the top: the frame breathes red.
      if (!g.fixed && g.board.stackHeight() > g.h * 0.72) {
        ctx.save(); ctx.strokeStyle = rgba('#eb6f92', 0.35 + 0.25 * Math.sin(now / 250)); ctx.lineWidth = 3;
        ctx.strokeRect(board.x - 3, board.y - 3, board.w + 6, board.h + 6); ctx.restore();
        this.alive = true;
      } else this.alive = false;
      if (this.view.wrap) {
        ctx.save();
        ctx.strokeStyle = look.theme.accent; ctx.lineWidth = 3; ctx.setLineDash([4, 5]); ctx.lineDashOffset = -(now / 60) % 9;
        const rot = this.view.rot;
        ctx.beginPath();
        if (rot % 180 === 0) { ctx.moveTo(board.x - 4, board.y); ctx.lineTo(board.x - 4, board.y + board.h); ctx.moveTo(board.x + board.w + 4, board.y); ctx.lineTo(board.x + board.w + 4, board.y + board.h); }
        else { ctx.moveTo(board.x, board.y - 4); ctx.lineTo(board.x + board.w, board.y - 4); ctx.moveTo(board.x, board.y + board.h + 4); ctx.lineTo(board.x + board.w, board.y + board.h + 4); }
        ctx.stroke();
        ctx.restore();
      }

      this.drawSide(ctx, now);
      this.fx.draw(ctx);
      this.dirty = false;
    }

    drawSide(ctx, now) {
      const g = this.game, look = this.look, { s, hold, next, nextDir } = this.lay;
      const th = look.theme;
      ctx.save();
      ctx.font = '600 ' + Math.max(9, Math.min(12, s * 0.5)) + 'px ' + FONT;
      ctx.fillStyle = th.muted;
      ctx.textBaseline = 'top';
      const pl = { skin: look.skin, color: (c) => (this.view.mono ? look.monoColor : look.colors[c]), t: now };
      // Hold
      if (!g.mods.noHold) {
        ctx.fillText('HOLD', hold.x + 2, hold.y);
        const box = { x: hold.x, y: hold.y + s * 0.7, w: hold.w, h: hold.h - s * 0.7 };
        if (this.holdHover) { ctx.fillStyle = rgba(th.accent, 0.12); rr(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 6); ctx.fill(); }
        ctx.strokeStyle = this.holdHover ? th.accent : th.line; ctx.lineWidth = this.holdHover ? 1.5 : 1; rr(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 6); ctx.stroke();
        if (g.hold) drawPieceIn(ctx, g.hold, box, s * 0.7, Object.assign({}, pl, { alpha: g.holdLocked ? 0.35 : 1 }));
        else if (this.holdHover) { ctx.save(); ctx.fillStyle = th.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('click to hold', box.x + box.w / 2, box.y + box.h / 2); ctx.restore(); }
      }
      // Next
      const n = Math.min(g.fixed ? g.queue.length : g.previewCount, g.queue.length);
      ctx.fillStyle = th.muted;
      ctx.fillText(g.fixed ? 'NEXT · ' + g.queue.length + ' LEFT' : 'NEXT', next.x + 2, next.y);
      if (nextDir === 'v') {
        const slot = Math.min(s * 2.9, (next.h - s * 0.7) / Math.max(1, Math.min(n, 5)));
        for (let i = 0; i < n; i++) {
          const box = { x: next.x, y: next.y + s * 0.7 + i * slot, w: next.w, h: slot };
          if (box.y + box.h > next.y + next.h + 1) break;
          this.drawQueueItem(ctx, g.queue[i], box, i, s, pl);
        }
      } else {
        const slot = Math.min(s * 3.2, next.w / Math.max(1, Math.min(n, 5)));
        for (let i = 0; i < n; i++) {
          const box = { x: next.x + i * slot, y: next.y + s * 0.7, w: slot, h: next.h - s * 0.7 };
          if (box.x + box.w > next.x + next.w + 1) break;
          this.drawQueueItem(ctx, g.queue[i], box, i, s, pl);
        }
      }
      ctx.restore();
    }

    drawQueueItem(ctx, entry, box, i, s, pl) {
      if (this.view.blind) {
        const th = this.look.theme;
        ctx.strokeStyle = th.line; ctx.setLineDash([3, 3]);
        rr(ctx, box.x + box.w * 0.2, box.y + box.h * 0.12, box.w * 0.6, box.h * 0.76, 6); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = th.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', box.x + box.w / 2, box.y + box.h / 2); ctx.textAlign = 'start'; ctx.textBaseline = 'top';
        return;
      }
      drawPieceIn(ctx, entry, { x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4 }, i === 0 ? s * 0.7 : s * 0.55, Object.assign({}, pl, { alpha: i === 0 ? 1 : 0.85 }));
    }

    // ---- effects hooks ---------------------------------------------------------------------------------------------

    /** Screen cells for removed rows (before the board moved). */
    rowCells(rows, removed) {
      const out = [];
      rows.forEach((y, i) => {
        const data = removed[i] || [];
        for (let x = 0; x < this.game.w; x++) {
          const v = data[x];
          const [sx, sy] = this.toScreen(x, y);
          out.push({ x: sx, y: sy, color: v ? this.colorOf(v) : '#ffffff' });
        }
      });
      return out;
    }

    onLock(result, reduced) {
      if (!this.lay) this.layout();
      const s = this.lay.s, look = this.look;
      const effect = look.effect;
      const pieceColor = this.colorOf(result.color || 8);
      if (!reduced && result.dropCells && result.dropDist > 0) {
        // The drop's trail, and a little shake that grows with the fall.
        const tops = new Map();
        for (const [x, y] of result.dropCells) tops.set(x, Math.max(tops.has(x) ? tops.get(x) : -1, y));
        for (const [x, top] of tops) {
          const [sx, sy0] = this.toScreen(x, top), [, sy1] = this.toScreen(x, top - result.dropDist);
          this.fx.streak(sx, sy0, sy1, s, pieceColor);
        }
        this.fx.shake = Math.max(this.fx.shake, Math.min(3, result.dropDist * 0.25));
      }
      if (!reduced && result.cells && result.cells.length && !result.lines) {
        // Dust where it landed.
        const low = new Map();
        for (const [x, y] of result.cells) low.set(x, Math.min(low.has(x) ? low.get(x) : Infinity, y));
        for (const [x, y] of low) { const [sx, sy] = this.toScreen(x, y); const down = this.screenDir(0, -1); this.fx.dust(sx, sy + (down[1] > 0 ? s : 0), s, look.theme.muted); }
      }
      if (result.cells && result.cells.length && this.view.vanish) {
        this.fx.fadeCells(result.cells.map(([x, y]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, s, color: this.colorOf(result.color || 8) }; }), look.skin, 1.4);
      } else if (result.cells && result.cells.length && !reduced) {
        for (const [x, y] of result.cells) { if (y >= this.game.h) continue; const [sx, sy] = this.toScreen(x, y); this.fx.flash(sx, sy, s, s, '#ffffff', 0.16); }
      }
      if (result.lines) {
        const cells = this.rowCells(result.rows, result.removed);
        this.fx.burst(effect, cells, s, reduced);
        if (effect === 'ripple' && !reduced) {
          for (const y of result.rows) {
            const [ax, ay] = this.toScreen(0, y), [bx, by] = this.toScreen(this.game.w - 1, y);
            this.fx.ring((ax + bx) / 2 + s / 2, (ay + by) / 2 + s / 2, look.theme.accent, s * this.game.w * 0.7);
          }
        }
        if (!reduced) this.fx.shake = Math.min(6, 1.5 * result.lines);
        const b = this.lay.board;
        if (this.showBank) this.fx.text('+' + result.lines + ' ◆', b.x + b.w / 2, b.y + b.h * 0.55, '#8fe3ff', Math.max(12, Math.min(18, s * 0.75)));
        const label = labelFor(result);
        if (label) this.fx.text(label, b.x + b.w / 2, b.y + b.h * 0.42, result.perfect ? '#ffe28a' : '#ffffff', Math.max(13, Math.min(22, s * 0.9)));
      } else if (result.tspin) {
        const b = this.lay.board;
        this.fx.text('T-SPIN', b.x + b.w / 2, b.y + b.h * 0.42, '#d6b4ff', Math.max(13, Math.min(20, s * 0.8)));
      }
      if (result.blast && result.blast.length) {
        this.fx.burst(reduced ? 'fade' : 'shatter', result.blast.map(([x, y, v]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, color: this.colorOf(v) }; }), s, reduced);
        if (!reduced) this.fx.shake = 7;
      }
      if (result.blastCenter && !reduced) {
        const [sx, sy] = this.toScreen(result.blastCenter[0], result.blastCenter[1]);
        this.fx.ring(sx + s / 2, sy + s / 2, '#ffb347', s * 3);
      }
      if (result.drilled && result.drilled.length) this.fx.burst(reduced ? 'fade' : 'sparks', result.drilled.map(([x, y, v]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, color: this.colorOf(v) }; }), s, reduced);
      this.dirty = true;
    }

    /** A faint afterimage where the piece just was (moves and turns). */
    trail(cells, color, reduced) {
      if (reduced || !this.lay || !cells.length) return;
      const s = this.lay.s;
      this.fx.fades.push({ cells: cells.filter(([, y]) => y < this.game.h).map(([x, y]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, s, color }; }), skin: this.look.skin, t: 0, dur: 0.12, alpha: 0.35 });
    }

    /** A blocked move: a nudge. */
    bump(reduced) { if (!reduced) this.fx.shake = Math.max(this.fx.shake, 1.2); this.dirty = true; }

    onPurge(gone, reduced) {
      if (!this.lay) this.layout();
      this.fx.burst(reduced ? 'fade' : 'sparkle', gone.map(([x, y, v]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, color: this.colorOf(v) }; }), this.lay.s, reduced);
      this.dirty = true;
    }
  }

  function labelFor(r) {
    const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'QUINT', 'SEXTUPLE', 'SEPTUPLE'];
    let s = r.tspin ? 'T-SPIN ' + (names[r.lines] || r.lines + ' LINES') : r.lines >= 4 ? (names[r.lines] || r.lines + ' LINES') : '';
    if (r.perfect) s = 'PERFECT CLEAR';
    if (r.b2b && s) s = 'B2B ' + s;
    if (r.combo >= 2) s = (s ? s + ' · ' : '') + r.combo + ' COMBO';
    return s;
  }

  /** The look (palette, skin, …) from the save's equipped cosmetics and the theme. */
  function makeLook(equipped, theme, t) {
    const pal = PALETTES[equipped.palette] || PALETTES.classic;
    const colors = paletteColors(equipped.palette, t);
    return {
      colors, skin: equipped.skin, frame: equipped.frame, backdrop: equipped.backdrop, effect: equipped.effect, ghost: equipped.ghost,
      theme, monoColor: theme.mono,
      animated: !!pal.animated || equipped.frame === 'rainbow',
    };
  }

  L.Render = { rgb, rgba, shade, mix, hsl, luminance, paletteColors, drawCell, cellSprite, drawFrame, drawBackdrop, ghostCell, drawPieceIn, drawSpecial, drawGem, FX, BoardView, makeLook, rr, FONT, SKIN_PAINT, labelFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
