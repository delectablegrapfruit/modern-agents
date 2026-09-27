// Lull — drawing: palettes, mino skins, frames, backdrops, ghosts, line-clear effects, and the board view (which
// can be turned a quarter or half turn for the Sideways and Upside Down wildcards).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Pieces, PALETTES, clamp } = L;
  const { LINE } = L;

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
      // A gap that grows with the cell (a hairline at small sizes), corners softened in proportion.
      const g = Math.max(0.5, Math.round(s * 0.04 * 2) / 2);
      ctx.fillStyle = c; rr(ctx, g, g, s - 2 * g, s - 2 * g, s * 0.16); ctx.fill();
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
      const p = Math.max(1, Math.round(s / 4));
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
      // Drafting lines: a crisp outline, a faint inner square and a whisper of fill.
      const lw = Math.max(1, Math.round(s * 0.05)), o = lw / 2 + Math.max(0.5, s * 0.03);
      ctx.fillStyle = rgba(c, 0.1); ctx.fillRect(o, o, s - 2 * o, s - 2 * o);
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.strokeRect(o, o, s - 2 * o, s - 2 * o);
      const q = s * 0.3;
      ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(1, lw * 0.75); ctx.strokeRect(q, q, s - 2 * q, s - 2 * q); ctx.globalAlpha = 1;
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
    satin(ctx, s, c) {
      // Soft and quiet: a gentle top-to-bottom sheen, a light rim on top and a deeper edge below.
      const g0 = Math.max(0.5, s * 0.04), r = s * 0.22;
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, shade(c, 0.22)); g.addColorStop(0.55, c); g.addColorStop(1, shade(c, -0.14));
      ctx.fillStyle = g; rr(ctx, g0, g0, s - 2 * g0, s - 2 * g0, r); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, s * 0.06);
      rr(ctx, g0 + s * 0.02, g0 + s * 0.03, s - 2 * g0 - s * 0.04, s - 2 * g0, r); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = rgba(shade(c, -0.4), 0.35); ctx.lineWidth = Math.max(1, s * 0.03); rr(ctx, g0, g0, s - 2 * g0, s - 2 * g0, r); ctx.stroke();
    },
    lantern(ctx, s, c) {
      // A paper lantern: a warm lit core fading to a soft, darker rim.
      const g0 = Math.max(0.5, s * 0.05), r = s * 0.26;
      const g = ctx.createRadialGradient(s * 0.5, s * 0.45, s * 0.04, s * 0.5, s * 0.5, s * 0.62);
      g.addColorStop(0, shade(c, 0.62)); g.addColorStop(0.45, shade(c, 0.15)); g.addColorStop(1, shade(c, -0.3));
      ctx.fillStyle = g; rr(ctx, g0, g0, s - 2 * g0, s - 2 * g0, r); ctx.fill();
      ctx.strokeStyle = rgba(shade(c, 0.5), 0.55); ctx.lineWidth = Math.max(1, s * 0.035); rr(ctx, g0 + 0.5, g0 + 0.5, s - 2 * g0 - 1, s - 2 * g0 - 1, r); ctx.stroke();
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
    } else if (special === 'blackhole') {
      const cx = x + s / 2, cy = y + s / 2, t2 = (t || 0) / 400;
      const g = ctx.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.62);
      g.addColorStop(0, '#000'); g.addColorStop(0.45, '#0b0614'); g.addColorStop(0.7, 'rgba(160,90,255,0.55)'); g.addColorStop(1, 'rgba(160,90,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, s * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.07);
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 1 ? 'rgba(255,170,80,0.85)' : 'rgba(190,140,255,0.8)';
        ctx.beginPath(); ctx.arc(cx, cy, s * (0.3 + k * 0.08), t2 * (3 - k) + k * 2, t2 * (3 - k) + k * 2 + 1.6); ctx.stroke();
      }
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2); ctx.fill();
    } else if (special === 'patch') {
      // A plug: a rounded block with a bright rim and a stud, ready to fill a hole.
      ctx.fillStyle = '#e8edf5'; rr(ctx, x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72, s * 0.16); ctx.fill();
      ctx.strokeStyle = '#8f9bb0'; ctx.lineWidth = Math.max(1, s * 0.06); rr(ctx, x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72, s * 0.16); ctx.stroke();
      const f = 0.55 + 0.45 * Math.sin((t || 0) / 240);
      ctx.fillStyle = 'rgba(120,200,255,' + f + ')'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.12, 0, Math.PI * 2); ctx.fill();
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
      ctx.strokeStyle = accent; ctx.lineWidth = 2.5; rr(ctx, x - 4.5, y - 4.5, w + 9, h + 9, 8); ctx.stroke();
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
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
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
      g.addColorStop(0, 'rgba(46,40,110,0.34)'); g.addColorStop(0.55, 'rgba(150,72,120,0.18)'); g.addColorStop(0.85, 'rgba(236,132,96,0.2)'); g.addColorStop(1, 'rgba(250,176,110,0.3)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      // A low sun: a soft glow on the horizon.
      const sun = ctx.createRadialGradient(x + w * 0.5, y + h, 0, x + w * 0.5, y + h, w * 0.7);
      sun.addColorStop(0, 'rgba(255,190,130,0.22)'); sun.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
    } else if (id === 'aurora') {
      // Two slow veils of light, teal and violet, over the faintest grid.
      const a = ctx.createRadialGradient(x + w * 0.2, y + h * 0.18, 0, x + w * 0.2, y + h * 0.18, Math.max(w, h) * 0.6);
      a.addColorStop(0, 'rgba(80,220,190,0.2)'); a.addColorStop(1, 'rgba(80,220,190,0)');
      ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
      const b = ctx.createRadialGradient(x + w * 0.85, y + h * 0.5, 0, x + w * 0.85, y + h * 0.5, Math.max(w, h) * 0.55);
      b.addColorStop(0, 'rgba(150,110,255,0.18)'); b.addColorStop(1, 'rgba(150,110,255,0)');
      ctx.fillStyle = b; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = theme.grid; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let q = 1; q < rows; q++) { const py = Math.round(y + q * s) + 0.5; ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
      ctx.stroke(); ctx.globalAlpha = 1;
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
    } else if (style === 'soft') {
      ctx.fillStyle = rgba(color, 0.14); rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.18); ctx.fill();
      ctx.strokeStyle = rgba(color, 0.45); ctx.lineWidth = 1; ctx.stroke();
    } else if (style === 'glow') {
      ctx.shadowColor = color; ctx.shadowBlur = s * 0.5;
      ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = 1.5; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    } else {
      const lw = Math.max(1, s * 0.07);
      ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = lw;
      rr(ctx, x + 1 + lw / 2, y + 1 + lw / 2, s - 2 - lw, s - 2 - lw, s * 0.12); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- effects --------------------------------------------------------------------------------------------------------

  class FX {
    constructor() { this.world = L.FxPhysics ? new L.FxPhysics.World() : null; this.clear(); }
    get active() { return this.parts.length || this.flashes.length || this.texts.length || this.fades.length || this.streaks.length || this.movers.length || this.pops.length || this.sweeps.length || this.props.length || (this.world && this.world.active) || this.shake > 0.01; }
    clear() { this.parts = []; this.flashes = []; this.texts = []; this.fades = []; this.streaks = []; this.movers = []; this.pops = []; this.sweeps = []; this.props = []; this.shake = 0; if (this.world) this.world.clear(); }
    /**
     * A drawn moment with its own timeline (a beam, a fuse, a drill bit): draw(ctx, k, t) with k running 0→1 over
     * dur, after an optional delay; update(k, t, dt) runs each step.
     */
    prop(dur, draw, o) { this.props.push(Object.assign({ t: 0, delay: 0, dur, draw, update: null }, o || {})); }
    /** A block sliding from one spot to another, falling with gravity (settle). */
    mover(m) { this.movers.push(Object.assign({ t: 0, delay: 0, dur: 0.3 }, m)); }
    /** A glow that swells out of each cell: a piece has just changed. */
    pop(cells, color, dur) { this.pops.push({ cells, color: color || '#ffffff', t: 0, dur: dur || 0.45 }); }
    /** A band of light passing across a box (mirror: left to right; rewind: top to bottom). */
    sweep(box, color, dir, dur) { this.sweeps.push({ box, color, dir: dir || 'x', t: 0, dur: dur || 0.4 }); }
    puff(x, y, color, n, size) {
      for (let k = 0; k < (n || 6); k++) { const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 50; this.parts.push({ kind: 'puff', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, g: -10, drag: 2.5, life: 0, max: 0.6 + Math.random() * 0.5, size: (size || 8) * (0.7 + Math.random() * 0.6), color }); }
    }
    stars(x, y, colors, n, speed) {
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.random() * 0.4, v = (speed || 90) * (0.6 + Math.random() * 0.6); this.parts.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 40, drag: 2.2, life: 0, max: 0.6 + Math.random() * 0.4, size: 3 + Math.random() * 3, color: colors[k % colors.length] }); }
    }
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
        } else if (kind === 'bloom') {
          // Each block opens into soft light and lets a mote drift up.
          this.parts.push({ kind: 'bloom', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.6, size: s, color: c.color });
          if (Math.random() < 0.6) this.parts.push({ kind: 'mote', x: cx + (Math.random() - 0.5) * s, y: cy, vx: (Math.random() - 0.5) * 12, vy: -18 - Math.random() * 26, g: 0, drag: 0.6, life: 0, max: 0.9 + Math.random() * 0.6, size: s * (0.08 + Math.random() * 0.08), color: shade(c.color, 0.55) });
        } else if (kind === 'sparks') {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.2, size: s, color: '#ffe8b0', shrink: true });
          for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 150 + Math.random() * 220; this.parts.push({ kind: 'spark', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 600, life: 0, max: 0.5 + Math.random() * 0.4, size: 2, color: Math.random() < 0.5 ? '#ffd166' : '#ff8c42' }); }
        } else {
          this.parts.push({ kind: 'sq', x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.32, size: s, color: c.color, shrink: true });
        }
      }
    }

    ring(x, y, color, maxR, o) { this.parts.push(Object.assign({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.7, size: maxR, color }, o || {})); }

    update(dt) {
      for (const p of this.parts) {
        p.life += dt;
        if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt * 0.5); }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        if (p.kind === 'spiral') { p.ang += p.w * dt; p.rad *= Math.exp(-p.pull * dt); p.x = p.cx + Math.cos(p.ang) * p.rad; p.y = p.cy + Math.sin(p.ang) * p.rad; }
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
      for (const f of this.movers) f.t += dt;
      this.movers = this.movers.filter((f) => f.t < f.delay + f.dur);
      for (const f of this.pops) f.t += dt;
      this.pops = this.pops.filter((f) => f.t < f.dur);
      for (const f of this.sweeps) f.t += dt;
      this.sweeps = this.sweeps.filter((f) => f.t < f.dur);
      if (this.props.length) {
        for (const f of this.props) { f.t += dt; if (f.update && f.t >= f.delay) f.update(clamp((f.t - f.delay) / f.dur, 0, 1), f.t - f.delay, dt); }
        this.props = this.props.filter((f) => f.t < f.delay + f.dur);
      }
      if (this.world) this.world.step(dt);
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
      for (const m of this.movers) {
        const k = clamp((m.t - m.delay) / m.dur, 0, 1), e = k * k;
        drawCell(ctx, m.skin, m.color, m.x0 + (m.x1 - m.x0) * e, m.y0 + (m.y1 - m.y0) * e, m.s);
      }
      if (this.world) this.world.draw(ctx, cellSprite);
      for (const f of this.props) {
        if (f.t < f.delay) continue;
        ctx.save(); f.draw(ctx, clamp((f.t - f.delay) / f.dur, 0, 1), f.t - f.delay); ctx.restore();
      }
      for (const f of this.flashes) {
        ctx.fillStyle = rgba(f.color, 0.75 * (1 - f.t / f.dur));
        ctx.fillRect(f.x, f.y, f.w, f.h);
      }
      for (const f of this.pops) {
        const k = f.t / f.dur, a = 1 - k;
        ctx.save();
        for (const c of f.cells) {
          const grow = c.s * 0.45 * Math.sqrt(k);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * a * a) + ')';
          ctx.fillRect(c.x, c.y, c.s, c.s);
          ctx.strokeStyle = rgba(f.color, 0.8 * a); ctx.lineWidth = 2;
          rr(ctx, c.x - grow, c.y - grow, c.s + grow * 2, c.s + grow * 2, 4 + grow * 0.5); ctx.stroke();
        }
        ctx.restore();
      }
      for (const f of this.sweeps) {
        const k = f.t / f.dur, b = f.box;
        ctx.save();
        ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
        let g;
        if (f.dir === 'x') { const x = b.x - b.w * 0.3 + (b.w * 1.6) * k; g = ctx.createLinearGradient(x - b.w * 0.25, 0, x + b.w * 0.25, 0); }
        else { const y = b.y + b.h * 1.3 - (b.h * 1.6) * k; g = ctx.createLinearGradient(0, y - b.h * 0.2, 0, y + b.h * 0.2); }
        g.addColorStop(0, rgba(f.color, 0)); g.addColorStop(0.5, rgba(f.color, 0.55 * (1 - k * 0.5))); g.addColorStop(1, rgba(f.color, 0));
        ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
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
        } else if (p.kind === 'bloom') {
          const e = 1 - (1 - k) * (1 - k), sz = p.size * (1 + e * 0.7);
          ctx.fillStyle = rgba(p.color, 0.32 * a * a); rr(ctx, p.x - sz / 2, p.y - sz / 2, sz, sz, sz * 0.3); ctx.fill();
          const core = p.size * (1 - e * 0.6);
          ctx.fillStyle = rgba(shade(p.color, 0.6), 0.85 * a); rr(ctx, p.x - core / 2, p.y - core / 2, core, core, core * 0.25); ctx.fill();
        } else if (p.kind === 'mote') {
          ctx.fillStyle = rgba(p.color, a * 0.9); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.strokeStyle = rgba(p.color, a); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
        } else if (p.kind === 'puff') {
          ctx.fillStyle = rgba(p.color, 0.35 * a);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 0.9), 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 'spiral') {
          const sz = p.size * (1 - k * 0.85);
          ctx.fillStyle = rgba(p.color, a); ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else if (p.kind === 'grain') {
          ctx.fillStyle = rgba(p.color, a); ctx.fillRect(p.x, p.y, p.size, p.size);
        } else if (p.kind === 'ring') {
          ctx.strokeStyle = rgba(p.color, a * 0.8); ctx.lineWidth = p.width || 2;
          const rk = p.inward ? 1 - k : 1 - Math.pow(1 - k, 2);
          // A ring may be kept inside a rectangle (the well), as the other effects stay on the board.
          if (p.clip) { ctx.save(); ctx.beginPath(); ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h); ctx.clip(); }
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.size * rk), 0, Math.PI * 2); ctx.stroke();
          if (p.clip) ctx.restore();
        }
      }
      for (const f of this.texts) {
        if (f.t < 0) continue; // still waiting its turn
        const k = f.t / f.dur;
        ctx.save();
        ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
        ctx.font = '700 ' + f.size + 'px ' + FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,11,18,0.55)';
        const yy = f.y - k * 18;
        ctx.strokeText(f.str, f.x, yy);
        ctx.fillStyle = f.color; ctx.fillText(f.str, f.x, yy);
        ctx.restore();
      }
    }
  }

  const FONT = '"Lull Line", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

  // ---- piece previews -------------------------------------------------------------------------------------------------

  /** Draws a piece (by queue entry) fitted and centred in a box. */
  function drawPieceIn(ctx, entry, box, maxCell, look) {
    const type = Pieces.get(entry.id);
    if (!type) return;
    const special = entry.special;
    const single = L.SINGLE_SPECIALS && L.SINGLE_SPECIALS.has(special);
    const cells = single ? [[0, 0]] : type.rots[entry.rot || 0];
    const b = Pieces.boundsOf(cells);
    const s = Math.floor(Math.min(maxCell, (box.w - 4) / b.w, (box.h - 4) / b.h));
    const ox = box.x + (box.w - b.w * s) / 2, oy = box.y + (box.h - b.h * s) / 2;
    const color = look.color(type.color);
    for (const [cx, cy] of cells) {
      const x = Math.round(ox + (cx - b.minX) * s), y = Math.round(oy + (b.maxY - cy) * s);
      if (single) drawSpecial(ctx, special, x, y, s, look.t);
      else drawCell(ctx, look.skin, color, x, y, s, look.alpha);
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
        // The item effects were laid out for the old size: let them go rather than play in the wrong place.
        if (this.fx.world) { this.fx.world.clear(); this.fx.props = []; }
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
        // No hold slot (most puzzles): the queue takes the whole width over the board.
        const nx = g.mods.noHold ? 0 : 3.8 * s;
        next = { x: bx + nx, y: by - 3.2 * s, w: bw - nx, h: 2.9 * s };
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

    needsFrame() { const g = this.game; return this.dirty || this.fx.active || this.alive || (g && g.piece && (g.piece.special || (g.s && g.s.gold > 0))) || (this.look && this.look.animated); }

    render(now) {
      if (!this.game || !this.look || !this.cssW) return;
      const ctx = this.ctx, look = this.look, g = this.game;
      if (!this.lay) this.layout();
      const { s, board, cols, rows } = this.lay;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr;
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      // Shake moves only the board and its effects (never the hold and queue beside it), and stays small.
      const shake = Math.min(8, this.fx.shake), shx = shake > 0.2 ? (Math.random() - 0.5) * shake : 0, shy = shake > 0.2 ? (Math.random() - 0.5) * shake : 0;
      ctx.save();
      if (shx || shy) ctx.translate(shx, shy);

      drawBackdrop(ctx, look.backdrop, board, s, cols, rows, look.theme, now);
      const p = g.piece;
      const pieceCells = p ? g.cellsOf(p) : [];
      const gy = p ? g.ghostY(p) : null;
      const ghostCells = p && gy != null && gy !== p.y ? g.cellsOf(p, p.rot, p.x, gy) : [];

      // Fog: only what is near the piece (and where it would land) can be seen.
      let near = null;
      if (this.view.fog && p) {
        near = new Set();
        for (const [cx, cy] of pieceCells.concat(ghostCells)) {
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.add(g.board.wx(cx + dx) + ',' + (cy + dy));
        }
      }

      // Settled blocks (minus any still sliding or falling into place).
      let hidden = null, hideAll = false;
      for (const m of this.fx.movers) { if (m.hideAll) hideAll = true; else if (m.key) (hidden = hidden || new Set()).add(m.key); }
      let mask = null;
      if (this.fx.world && this.fx.world.hiding) {
        if (!this.hideMask || this.hideMask.length !== g.w * g.h) this.hideMask = new Uint8Array(g.w * g.h);
        mask = this.hideMask; mask.fill(0);
        this.fx.world.fillHidden(mask);
      }
      for (let y = 0; y < g.h && !hideAll; y++) {
        for (let x = 0; x < g.w; x++) {
          const v = g.board.get(x, y);
          if (!v) continue;
          if (hidden && hidden.has(x + ',' + y)) continue;
          if (mask && mask[y * g.w + x]) continue;
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
          // What goes: the drill's column.
          const [cx, cy] = pieceCells[0];
          ctx.fillStyle = 'rgba(255,90,90,0.16)';
          for (let y = cy - 1; y >= 0; y--) { const [sx, sy] = this.toScreen(cx, y); ctx.fillRect(sx, sy, s, s); }
        } else if (p.special === 'bomb' && gy != null) {
          // What goes: the bomb's diamond where it will land.
          const [cx] = pieceCells[0];
          ctx.fillStyle = 'rgba(255,159,67,0.14)';
          for (const [dx, dy] of L.BOMB_PATTERN) { const x = cx + dx, y = gy + dy; if (x < 0 || x >= g.w || y < 0 || y >= g.h) continue; const [sx, sy] = this.toScreen(x, y); ctx.fillRect(sx, sy, s, s); }
          if (look.ghost !== 'off') for (const [gx, gy2] of ghostCells) { const [sx, sy] = this.toScreen(gx, gy2); ghostCell(ctx, look.ghost, '#ff9f43', sx, sy, s); }
        } else if (look.ghost !== 'off') {
          for (const [cx, cy] of ghostCells) { const [sx, sy] = this.toScreen(cx, cy); ghostCell(ctx, look.ghost, color, sx, sy, s); }
        }
        if (p.special === 'laser' && ghostCells.length) {
          // The beam to come: a faint red line across every row the piece will land in.
          const rowsL = new Set(ghostCells.map(([, cy]) => cy));
          const pulse = 0.12 + 0.08 * Math.sin(now / 120);
          for (const y of rowsL) { const [ax, ay] = this.toScreen(0, y), [bx, by] = this.toScreen(g.w - 1, y); ctx.fillStyle = 'rgba(255,60,80,' + pulse + ')'; ctx.fillRect(Math.min(ax, bx), Math.min(ay, by) + s * 0.35, Math.abs(bx - ax) + s, s * 0.3); }
          this.alive = true;
        }
        const overlapping = p.special === 'phase' && !g.board.fits(p.type.rots[p.rot], p.x, p.y);
        // Gold on the board (Free Play) gilds whatever plain piece is in play.
        const golden = !p.special && g.s && g.s.gold > 0;
        for (const [cx, cy] of pieceCells) {
          const [sx, sy] = this.toScreen(cx, cy);
          if (L.SINGLE_SPECIALS && L.SINGLE_SPECIALS.has(p.special)) { drawSpecial(ctx, p.special, sx, sy, s, now); continue; }
          const tint = golden ? '#f2c14e' : color;
          // Phasing: translucent, and it shimmers (more faintly still while inside other blocks).
          const shimmer = p.special === 'phase' && !this.reducedMotion ? 0.12 * Math.sin(now / 170 + (cx + cy) * 0.9) : 0;
          drawCell(ctx, look.skin, tint, sx, sy, s, p.special === 'phase' ? (overlapping ? 0.4 : 0.72) + shimmer : 1);
          if (golden) {
            const k = ((now / 900 + (cx + cy) * 0.12) % 1.4) - 0.2;
            ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, s, s); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,230,0.55)'; ctx.beginPath(); ctx.moveTo(sx + s * (k * 2 - 0.4), sy + s); ctx.lineTo(sx + s * (k * 2 - 0.1), sy + s); ctx.lineTo(sx + s * (k * 2 + 0.4), sy); ctx.lineTo(sx + s * (k * 2 + 0.1), sy); ctx.closePath(); ctx.fill();
            ctx.restore();
          }
          if (p.special === 'laser') { ctx.save(); ctx.strokeStyle = 'rgba(255,60,80,' + (0.6 + 0.4 * Math.sin(now / 90)) + ')'; ctx.lineWidth = 2; ctx.strokeRect(sx + 2, sy + 2, s - 4, s - 4); ctx.fillStyle = '#fff'; ctx.fillRect(sx + s * 0.42, sy + s * 0.42, s * 0.16, s * 0.16); ctx.restore(); }
          if (p.special === 'phase') {
            ctx.save(); ctx.setLineDash([2, 3]); ctx.lineDashOffset = this.reducedMotion ? 0 : -now / 60; ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.7; ctx.strokeRect(sx + 1.5, sy + 1.5, s - 3, s - 3);
            if (!this.reducedMotion) {
              // A soft band of light drifting down through it.
              const k = ((now / 800 + (cx - cy) * 0.11) % 1.4) - 0.2;
              ctx.beginPath(); ctx.rect(sx, sy, s, s); ctx.clip();
              ctx.globalAlpha = 0.35; ctx.fillStyle = '#e4dcff'; ctx.fillRect(sx, sy + s * k - s * 0.1, s, s * 0.2);
            }
            ctx.restore();
          }
        }
      }

      if (p && (p.special || (g.s && g.s.gold > 0))) this.ambient(p, pieceCells, now);

      drawFrame(ctx, look.frame, board, look.theme.accent, now);
      // Close to the top: the frame breathes red.
      if (!g.fixed && g.board.stackHeight() > g.h * 0.72) {
        ctx.save(); ctx.strokeStyle = rgba('#eb6f92', 0.35 + 0.25 * Math.sin(now / 250)); ctx.lineWidth = 3;
        ctx.strokeRect(board.x - 3, board.y - 3, board.w + 6, board.h + 6); ctx.restore();
        this.alive = true;
      } else this.alive = false;
      if (this.view.wrap) {
        // Wraparound: the two side walls are portals — a still glow on each, with ⇆ at mid-height.
        ctx.save();
        const acc = look.theme.accent, vert = this.view.rot % 180 === 0, glow = Math.max(6, s * 0.35);
        const band = (x, y, w, h, x0, y0, x1, y1) => { const gr = ctx.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, rgba(acc, 0.45)); gr.addColorStop(1, rgba(acc, 0)); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); };
        if (vert) { band(board.x, board.y, glow, board.h, board.x, 0, board.x + glow, 0); band(board.x + board.w - glow, board.y, glow, board.h, board.x + board.w, 0, board.x + board.w - glow, 0); }
        else { band(board.x, board.y, board.w, glow, 0, board.y, 0, board.y + glow); band(board.x, board.y + board.h - glow, board.w, glow, 0, board.y + board.h, 0, board.y + board.h - glow); }
        ctx.fillStyle = acc; ctx.font = '700 ' + Math.max(10, Math.min(14, s * 0.55)) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (vert) { ctx.fillText('⇆', board.x - glow * 0.9, board.y + board.h / 2); ctx.fillText('⇆', board.x + board.w + glow * 0.9, board.y + board.h / 2); }
        else { ctx.fillText('⇅', board.x + board.w / 2, board.y - glow * 0.9); ctx.fillText('⇅', board.x + board.w / 2, board.y + board.h + glow * 0.9); }
        ctx.restore();
      }

      ctx.restore();
      this.drawSide(ctx, now);
      ctx.save();
      if (shx || shy) ctx.translate(shx, shy);
      this.fx.draw(ctx);
      ctx.restore();
      this.dirty = false;
    }

    drawSide(ctx, now) {
      const g = this.game, look = this.look, { s, hold, next, nextDir } = this.lay;
      const th = look.theme;
      ctx.save();
      // Labels: small spaced capitals, quieter than anything they label.
      ctx.font = '700 ' + Math.round(Math.max(9, Math.min(11, s * 0.44))) + 'px ' + FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.09em';
      ctx.textBaseline = 'top';
      const label = (t, x, y) => { ctx.fillStyle = th.faint || th.muted; ctx.fillText(t, Math.round(x + 2), Math.round(y)); };
      /** A soft recessed tray: the well's colour, a hairline, rounded like the rest of the window. */
      const tray = (b, hot) => {
        const r = Math.min(10, Math.max(5, s * 0.4));
        ctx.fillStyle = hot ? rgba(th.accent, 0.12) : th.well; rr(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r); ctx.fill();
        ctx.strokeStyle = hot ? rgba(th.accent, 0.8) : th.line; ctx.lineWidth = 1; ctx.stroke();
      };
      const pl = { skin: look.skin, color: (c) => (this.view.mono ? look.monoColor : look.colors[c]), t: now };
      const top = s * 0.75;
      // Hold
      if (!g.mods.noHold) {
        label('HOLD', hold.x, hold.y);
        const box = { x: hold.x, y: hold.y + top, w: hold.w, h: hold.h - top };
        tray(box, this.holdHover);
        if (g.hold) drawPieceIn(ctx, g.hold, box, s * 0.7, Object.assign({}, pl, { alpha: g.holdLocked && !g.freeHold ? 0.35 : 1 }));
      }
      // Next: the queue in one tray, the piece coming first and largest.
      const n = Math.min(g.fixed ? g.queue.length : g.previewCount, g.queue.length);
      label(g.fixed ? 'NEXT · ' + g.queue.length + ' LEFT' : 'NEXT', next.x, next.y);
      if (nextDir === 'v') {
        const slot = Math.min(s * 2.9, (next.h - top) / Math.max(1, Math.min(n, 5)));
        let shown = 0;
        for (let i = 0; i < n; i++) if (next.y + top + (i + 1) * slot <= next.y + next.h + 1) shown++;
        if (shown) tray({ x: next.x, y: next.y + top, w: next.w, h: shown * slot + s * 0.2 });
        for (let i = 0; i < shown; i++) this.drawQueueItem(ctx, g.queue[i], { x: next.x, y: next.y + top + s * 0.1 + i * slot, w: next.w, h: slot }, i, s, pl);
      } else {
        const slot = Math.min(s * 3.2, next.w / Math.max(1, Math.min(n, 5)));
        let shown = 0;
        for (let i = 0; i < n; i++) if (next.x + (i + 1) * slot <= next.x + next.w + 1) shown++;
        if (shown) tray({ x: next.x, y: next.y + top, w: shown * slot, h: next.h - top });
        for (let i = 0; i < shown; i++) this.drawQueueItem(ctx, g.queue[i], { x: next.x + i * slot, y: next.y + top, w: slot, h: next.h - top }, i, s, pl);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
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
      if (this.fx.world) this.fx.world.land();
      if (!this.lay) this.layout();
      const s = this.lay.s, look = this.look;
      const effect = look.effect;
      const pieceColor = this.colorOf(result.color || 8);
      // Items the physics layer animates from the engine's own record of what moved and what went.
      const sp = result.special, phys = !reduced && !!this.fx.world;
      const falls = phys && (sp === 'phase' || (sp === 'patch' && result.dropDist > 0));
      if (!reduced && !falls && result.dropCells && result.dropDist > 0) {
        // The drop's trail, and a little shake that grows with the fall.
        const tops = new Map();
        for (const [x, y] of result.dropCells) tops.set(x, Math.max(tops.has(x) ? tops.get(x) : -1, y));
        for (const [x, top] of tops) {
          const [sx, sy0] = this.toScreen(x, top), [, sy1] = this.toScreen(x, top - result.dropDist);
          this.fx.streak(sx, sy0, sy1, s, pieceColor);
        }
        this.fx.shake = Math.max(this.fx.shake, Math.min(1.5, result.dropDist * 0.12));
      }
      if (!reduced && !falls && result.cells && result.cells.length && !result.lines) {
        // Dust where it landed.
        const low = new Map();
        for (const [x, y] of result.cells) low.set(x, Math.min(low.has(x) ? low.get(x) : Infinity, y));
        for (const [x, y] of low) { const [sx, sy] = this.toScreen(x, y); const down = this.screenDir(0, -1); this.fx.dust(sx, sy + (down[1] > 0 ? s : 0), s, look.theme.muted); }
      }
      if (result.cells && result.cells.length && this.view.vanish) {
        this.fx.fadeCells(result.cells.map(([x, y]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, s, color: this.colorOf(result.color || 8) }; }), look.skin, 1.4);
      } else if (result.cells && result.cells.length && !reduced && !falls && sp !== 'laser') {
        for (const [x, y] of result.cells) { if (y >= this.game.h) continue; const [sx, sy] = this.toScreen(x, y); this.fx.flash(sx, sy, s, s, '#ffffff', 0.16); }
      }
      if (phys) {
        if (sp === 'drill' && result.bit) this.drillFx(result);
        else if (sp === 'laser' && result.laser) this.laserFx(result);
        else if (sp === 'blackhole' && result.center) this.blackholeFx(result);
        else if (sp === 'bomb' && result.center) this.blastFx(result);
        else if (sp === 'phase') this.phaseFx(result, pieceColor);
        else if (sp === 'patch' && falls) this.patchFx(result);
        else if (sp === 'settle' && result.before) this.settleFx(result);
      }
      const done = phys && (/^(drill|laser|blackhole|bomb|phase|settle)$/.test(sp || '') || (sp === 'patch' && falls));
      if (result.lines) {
        // A laser's own rows go in its beam; any other full rows clear as usual.
        const own = done && result.laser ? new Set(result.laser) : null;
        const rowsN = own ? result.rows.filter((y) => !own.has(y)) : result.rows, remN = own ? result.removed.filter((_, i) => !own.has(result.rows[i])) : result.removed;
        const cells = this.rowCells(rowsN, remN);
        this.fx.burst(effect, cells, s, reduced);
        if (effect === 'ripple' && !reduced) {
          for (const y of rowsN) {
            const [ax, ay] = this.toScreen(0, y), [bx, by] = this.toScreen(this.game.w - 1, y);
            this.fx.ring((ax + bx) / 2 + s / 2, (ay + by) / 2 + s / 2, look.theme.accent, s * this.game.w * 0.7);
          }
        }
        if (!reduced) this.fx.shake = Math.max(this.fx.shake, Math.min(2.5, 0.6 * result.lines));
        const b = this.lay.board;
        if (this.showBank) this.fx.text('+' + (result.banked || 0) + ' ' + LINE + (result.mult > 1 ? '  ×' + Math.round(result.mult * 1000) / 1000 : ''), b.x + b.w / 2, b.y + b.h * 0.55, '#8fe3ff', Math.max(12, Math.min(18, s * 0.75)));
        const label = labelFor(result);
        if (label) this.fx.text(label, b.x + b.w / 2, b.y + b.h * 0.42, result.perfect ? '#ffe28a' : '#ffffff', Math.max(13, Math.min(22, s * 0.9)));
      } else if (result.tspin || result.mini) {
        const b = this.lay.board;
        this.fx.text(result.mini ? 'T-SPIN MINI' : 'T-SPIN', b.x + b.w / 2, b.y + b.h * 0.42, '#d6b4ff', Math.max(13, Math.min(20, s * 0.8)));
      }
      if (result.special === 'settle' && result.before && !reduced && !done) {
        // Every column's blocks fall into place.
        const g = this.game, w = g.w, before = result.before;
        for (let x = 0; x < w; x++) {
          let dst = 0;
          for (let y = 0; y < g.h; y++) {
            const v = before[y * w + x];
            if (!v) continue;
            const [sx, sy0] = this.toScreen(x, y), [, sy1] = this.toScreen(x, dst);
            this.fx.mover({ x0: sx, y0: sy0, x1: sx, y1: sy1, s, color: this.colorOf(v), skin: look.skin, dur: 0.12 + Math.sqrt(Math.max(0, y - dst)) * 0.07, hideAll: true });
            dst++;
          }
        }
        const b = this.lay.board;
        this.fx.sweep(b, '#ffffff', 'y', 0.4);
        this.fx.shake = Math.max(this.fx.shake, 3);
      }
      const toCells = (list) => list.map(([x, y, v]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, color: this.colorOf(v) }; });
      if (done) { /* animated above */ } else if (result.swallowed && !reduced) {
        const [cx0, cy0] = this.toScreen(result.center[0], result.center[1]), cx = cx0 + s / 2, cy = cy0 + s / 2;
        for (const c of toCells(result.swallowed)) {
          const dx = c.x + s / 2 - cx, dy = c.y + s / 2 - cy;
          this.fx.parts.push({ kind: 'spiral', cx, cy, ang: Math.atan2(dy, dx), rad: Math.hypot(dx, dy) + 1, w: 5 + Math.random() * 3, pull: 3.2, x: c.x, y: c.y, vx: 0, vy: 0, g: 0, life: 0, max: 0.9, size: s, color: c.color });
        }
        this.fx.ring(cx, cy, '#b48cff', s * 4, { inward: true, max: 0.8, width: 3 });
        this.fx.ring(cx, cy, '#ffb35c', s * 2.5, { max: 0.5 });
        this.fx.shake = Math.max(this.fx.shake, 5);
      } else if (result.swallowed) this.fx.burst('fade', toCells(result.swallowed), s, true);
      if (result.laser && !reduced && !done) {
        for (const y of result.laser) {
          const [ax, ay] = this.toScreen(0, y), [bx] = this.toScreen(this.game.w - 1, y);
          const x0 = Math.min(ax, bx), w = Math.abs(bx - ax) + s;
          this.fx.flash(x0 - s, ay + s * 0.3, w + 2 * s, s * 0.4, '#ffffff', 0.35);
          this.fx.flash(x0, ay, w, s, '#ff3c50', 0.5);
          for (let k = 0; k < 8; k++) this.fx.parts.push({ kind: 'spark', x: x0 + Math.random() * w, y: ay + s / 2, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 200, g: 300, life: 0, max: 0.5, size: 2, color: Math.random() < 0.5 ? '#ff6b7a' : '#ffffff' });
        }
        this.fx.shake = Math.max(this.fx.shake, 4);
        const b = this.lay.board; this.fx.text('ZAP', b.x + b.w / 2, b.y + b.h * 0.3, '#ff6b7a', 22);
      }
      if (result.golden && result.cells && !reduced) {
        for (const c of this.screenCells(result.cells)) for (let k = 0; k < 3; k++) this.fx.parts.push({ kind: 'conf', x: c.x + s / 2, y: c.y + s / 2, vx: (Math.random() - 0.5) * 180, vy: -100 - Math.random() * 120, g: 380, drag: 1.5, life: 0, max: 1.2, size: s * 0.3, color: Math.random() < 0.5 ? '#ffd35a' : '#fff1b8', rot: 0, vr: (Math.random() - 0.5) * 16 });
      }
      if (result.blast && result.blast.length && !done) {
        if (!reduced) { const b = this.lay.board; this.fx.flash(b.x, b.y, b.w, b.h, '#fff3d6', 0.22); }
        this.fx.burst(reduced ? 'fade' : 'shatter', toCells(result.blast), s, reduced);
        if (!reduced) this.fx.shake = 7;
      }
      if (result.special === 'drill' && result.drilled && !reduced && !done) {
        const top = result.drilled.length ? result.drilled[0] : null;
        if (top) {
          const [sx, sy0] = this.toScreen(top[0], top[1]), [, sy1] = this.toScreen(top[0], 0);
          this.fx.streak(sx, sy0, sy1 + s, s, '#ffd166');
          this.fx.puff(sx + s / 2, sy1 + s, this.look.theme.muted, 8, s * 0.35);
          this.fx.shake = Math.max(this.fx.shake, 4);
        }
      }
      if (result.drilled && result.drilled.length && !done) this.fx.burst(reduced ? 'fade' : 'sparks', toCells(result.drilled), s, reduced);
      if (result.patched && reduced && result.cells.length) this.fx.pop(this.screenCells(result.cells, '#8fd3ff'), '#8fd3ff', 0.3);
      this.dirty = true;
    }

    /** A bomb: a flash, a ring, and the blocks of its diamond thrown out and up, tumbling. */
    blastFx(r) {
      const w = this.phys(), s = this.lay.s, fx = this.fx, look = this.look;
      const [cx, cy] = this.mid(r.center[0], r.center[1]), ux = -w.gx, uy = -w.gy;
      for (const [x, y, v] of r.blast) {
        const [bx, by] = this.mid(x, y);
        let dx = bx - cx, dy = by - cy;
        const d = Math.hypot(dx, dy) / s;
        if (d < 0.01) { dx = ux; dy = uy; } else { dx /= d * s; dy /= d * s; }
        const sp = s * (14 - d * 3) * (0.85 + Math.random() * 0.3), lift = s * (5 + Math.random() * 4);
        w.body({ mode: 'free', x: bx, y: by, vx: dx * sp + ux * lift, vy: dy * sp + uy * lift, va: (Math.random() - 0.5) * 18, size: s, color: this.colorOf(v), skin: look.skin, rest: 0.35, fric: 0.7, solid: true, fadeAt: 0.45, max: 0.8 });
      }
      fx.prop(0.22, (ctx, k) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 2.6);
        g.addColorStop(0, 'rgba(255,250,230,' + (0.9 * (1 - k)) + ')'); g.addColorStop(0.45, 'rgba(255,179,71,' + (0.55 * (1 - k)) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, s * 2.6 * (0.5 + k * 0.5), 0, Math.PI * 2); ctx.fill();
      });
      fx.ring(cx, cy, '#fff3d6', s * 3.2, { width: 3, max: 0.35 });
      w.sparks(cx, cy, s, 12, ['#ffd166', '#fff3c4', '#ff8c42']);
      w.dust(cx, cy, s, 6, '#8a8f99');
      fx.shake = Math.max(fx.shake, 5);
    }

    /** A combo found: its name and what it paid, small and soft, high on the board (stacked when there are several). */
    callout(name, detail, i, reduced) {
      if (!this.lay) this.layout();
      const b = this.lay.board, s = this.lay.s, y = b.y + b.h * 0.16 + (i || 0) * s * 1.7;
      // A new set of callouts takes the place of the last one's, never over it.
      if (!i) this.fx.texts = this.fx.texts.filter((t) => !t.callout);
      this.fx.texts.push({ callout: true, str: name, x: b.x + b.w / 2, y, color: '#bfead3', size: Math.max(12, Math.min(16, s * 0.68)), t: -(i || 0) * 0.15, dur: reduced ? 1.6 : 2.2 });
      if (detail) this.fx.texts.push({ callout: true, str: detail, x: b.x + b.w / 2, y: y + Math.max(13, s * 0.62), color: '#8fe3ff', size: Math.max(10, Math.min(13, s * 0.52)), t: -(i || 0) * 0.15, dur: reduced ? 1.6 : 2.2 });
      this.dirty = true;
    }

    // ---- item animations: the physics layer (js/fxphysics.js), fed with what the engine really moved ----------------

    /** The physics world, framed on the board as drawn now: gravity pulls toward the board's own floor on screen. */
    phys() {
      if (!this.lay) this.layout();
      const w = this.fx.world, [gx, gy] = this.screenDir(0, -1);
      if (!this.solidFn) this.solidFn = (px, py) => this.solidAt(px, py);
      w.setFrame(this.lay.board, gx, gy, this.lay.s, this.solidFn);
      return w;
    }

    /** Is there a settled block under a screen point? (No allocation: the physics asks this every frame.) */
    solidAt(px, py) {
      const { s, board } = this.lay, g = this.game, rot = this.view.rot;
      if (px < board.x || py < board.y || px >= board.x + board.w || py >= board.y + board.h) return false;
      const c = Math.floor((px - board.x) / s), r = Math.floor((py - board.y) / s);
      let x, y;
      if (rot === 0) { x = c; y = g.h - 1 - r; } else if (rot === 180) { x = g.w - 1 - c; y = r; } else if (rot === 90) { x = r; y = c; } else { x = g.w - 1 - r; y = g.h - 1 - c; }
      return g.board.get(x, y) !== 0;
    }

    /** Screen centre of a logical cell. */
    mid(x, y) { const [sx, sy] = this.toScreen(x, y), h = this.lay.s / 2; return [sx + h, sy + h]; }

    /** Where a row (numbered before the clear) sits once the cleared rows are gone; null if it was cleared itself. */
    afterClear(rows, y) {
      let n = 0;
      for (const r of rows || []) { if (r === y) return null; if (r < y) n++; }
      return y - n;
    }

    /** Hides a board cell under a falling body until it lands there. */
    keyOf(x, y) { return y == null || y < 0 || y >= this.game.h ? -1 : y * this.game.w + x; }

    /** A block falling into a row that was cleared comes apart when it gets there, rather than just vanishing. */
    intoClear(fy) {
      if (fy != null) return null;
      if (!this.intoClearFn) this.intoClearFn = (b) => this.fx.world.burst('pixels', b);
      return this.intoClearFn;
    }

    /** Drill: the bit spins down its column; each block it meets bursts into chips and sparks. */
    drillFx(r) {
      const w = this.phys(), s = this.lay.s, fx = this.fx, look = this.look;
      const [bx, by] = r.bit, speed = Math.max(30, (by + 1) / 0.4), T = Math.max(0, by) / speed; // rows a second
      const [x0, y0] = this.mid(bx, by), [x1, y1] = this.mid(bx, 0), gx = w.gx, gy = w.gy;
      for (const [x, y, v] of r.drilled) {
        const [cx, cy] = this.mid(x, y);
        w.body({ mode: 'hold', x: cx, y: cy, size: s, color: this.colorOf(v), skin: look.skin, wake: Math.max(0, (by - y - 0.6) / speed), act: 'chips', max: 5 });
      }
      const top = r.drilled.length ? r.drilled[0][1] : -1; // the first block the bit meets
      const ang = Math.atan2(gy, gx) - Math.PI / 2, pos = (t) => { const d = T ? Math.min(1, t / T) : 1; return [x0 + (x1 - x0) * d, y0 + (y1 - y0) * d]; };
      fx.prop(T + 0.2, (ctx, k, t) => {
        const [px, py] = pos(t), j = t < T ? (Math.random() - 0.5) * 1.4 : 0;
        ctx.globalAlpha = t < T ? 1 : Math.max(0, 1 - (t - T) / 0.2);
        ctx.translate(px + j, py + j); ctx.rotate(ang);
        drawSpecial(ctx, 'drill', -s / 2, -s / 2, s, t * 3000);
      }, {
        update: (k, t, dt) => {
          // Grinding: sparks off the tip while it is inside the stack.
          if (t >= T || Math.random() > dt * 40 || by - (T ? t / T : 1) * by > top + 0.5) return;
          const [px, py] = pos(t), tx = px + gx * s * 0.45, ty = py + gy * s * 0.45;
          const side = Math.random() < 0.5 ? 1 : -1, v = s * (6 + Math.random() * 8);
          w.part('spark', tx, ty, -gy * side * v - gx * s * 4, gx * side * v - gy * s * 4, 0.2 + Math.random() * 0.15, 1.5, Math.random() < 0.5 ? '#ffd166' : '#fff3c4', 0.6);
        },
      });
      w.after(T, () => { w.dust(x1 + gx * s * 0.5, y1 + gy * s * 0.5, s, 5, look.theme.muted); fx.shake = Math.max(fx.shake, 2.5); });
    }

    /** Laser: a charge line, then a beam across each row it touches, spreading from the piece; the blocks come apart into drifting pixels. */
    laserFx(r) {
      const w = this.phys(), s = this.lay.s, fx = this.fx, look = this.look, g = this.game, CHARGE = 0.14;
      const horiz = this.view.rot % 180 === 0;
      const rows = r.laser.slice().sort((a, b) => b - a); // top row first
      rows.forEach((y, i) => {
        const data = r.removed[r.rows.indexOf(y)] || [];
        const mine = r.cells.filter(([, cy]) => cy === y), from = mine.length ? mine.reduce((a, [cx]) => a + cx, 0) / mine.length : g.w / 2;
        const t0 = CHARGE + i * 0.05;
        for (let x = 0; x < g.w; x++) {
          if (!data[x]) continue;
          const [cx, cy] = this.mid(x, y);
          w.body({ mode: 'hold', x: cx, y: cy, size: s, color: this.colorOf(data[x]), skin: look.skin, wake: t0 + Math.abs(x - from) * 0.012, act: 'pixels', max: 5 });
        }
        const [ax, ay] = this.toScreen(0, y), [bx, by] = this.toScreen(g.w - 1, y), [fx0, fy0] = this.mid(Math.round(from), y);
        const x0 = Math.min(ax, bx), y0 = Math.min(ay, by), len = (horiz ? Math.abs(bx - ax) : Math.abs(by - ay)) + s;
        fx.prop(t0 + 0.28, (ctx, k, t) => {
          // Across the row: from x0/y0 over len, centred on the row's middle line.
          const band = (half, a, col, reach) => {
            ctx.globalAlpha = a; ctx.fillStyle = col;
            if (horiz) { const l = Math.max(x0, fx0 - reach), rr2 = Math.min(x0 + len, fx0 + reach); ctx.fillRect(l, y0 + s / 2 - half, rr2 - l, half * 2); }
            else { const t2 = Math.max(y0, fy0 - reach), b2 = Math.min(y0 + len, fy0 + reach); ctx.fillRect(x0 + s / 2 - half, t2, half * 2, b2 - t2); }
          };
          if (t < t0) {
            const c = t / t0;
            band(Math.max(0.5, s * 0.03), (0.25 + 0.6 * c) * (0.8 + 0.2 * Math.sin(t * 90)), '#ff3c50', len * c);
          } else {
            const u = (t - t0) / 0.28, reach = (t - t0) / 0.012 * s + s;
            band(s * 0.5 * (1 - u * 0.6), 0.28 * (1 - u), '#ff3c50', reach);
            band(s * 0.2 * (1 - u), 0.9 * (1 - u), '#ffe0e4', reach);
            band(Math.max(0.5, s * 0.06 * (1 - u)), 1 - u, '#ffffff', reach);
          }
        });
        w.after(t0, () => { w.sparks(fx0, fy0, s, 5, ['#ff6b7a', '#ffffff']); });
      });
      w.after(CHARGE, () => { fx.shake = Math.max(fx.shake, 2.5); const b = this.lay.board; fx.text('ZAP', b.x + b.w / 2, b.y + b.h * 0.3, '#ff6b7a', 22); });
    }

    /** Black hole: everything in reach is pulled in on a tightening spiral, stretched and shrinking, then it collapses. */
    blackholeFx(r) {
      const w = this.phys(), s = this.lay.s, fx = this.fx, look = this.look;
      const [cx, cy] = this.mid(r.center[0], r.center[1]);
      let T = 0.3;
      for (const [x, y, v] of r.swallowed) {
        const [bx, by] = this.mid(x, y), dx = bx - cx, dy = by - cy, rad = Math.max(s * 0.3, Math.hypot(dx, dy));
        const acc = s * 18 * (0.85 + Math.random() * 0.3), delay = Math.random() * 0.08;
        T = Math.max(T, delay + Math.sqrt(2 * rad / acc));
        w.body({ mode: 'hold', wake: delay, next: 'spiral', x: bx, y: by, cx, cy, rad, ang: Math.atan2(dy, dx), w0: 2.2, acc, size: s, color: this.colorOf(v), skin: look.skin, max: 3 });
      }
      fx.ring(cx, cy, '#b48cff', s * 4, { inward: true, max: Math.min(0.8, T), width: 3 });
      fx.prop(T, (ctx, k, t) => {
        // The hole itself swells as it feeds, then pinches shut.
        const z = s * (k < 0.8 ? 1 + k * 0.6 : 1.48 * (1 - (k - 0.8) / 0.2));
        if (z <= 0.5) return;
        ctx.translate(cx, cy); ctx.rotate(t * 3);
        drawSpecial(ctx, 'blackhole', -z / 2, -z / 2, z, t * 1000);
      });
      w.after(T, () => {
        fx.prop(0.3, (ctx, k) => {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.8);
          g.addColorStop(0, 'rgba(255,255,255,' + (1 - k) + ')'); g.addColorStop(0.4, 'rgba(200,170,255,' + (0.6 * (1 - k)) + ')'); g.addColorStop(1, 'rgba(160,90,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, s * 1.8 * (0.4 + k * 0.6), 0, Math.PI * 2); ctx.fill();
        });
        fx.ring(cx, cy, '#e4d6ff', s * 2.6, { max: 0.4, width: 2 });
        w.sparks(cx, cy, s, 10, ['#b48cff', '#ffb35c', '#ffffff']);
        fx.shake = Math.max(fx.shake, 3);
      });
    }

    /** Phase: the ghostly piece sinks through the stack and materialises with a ripple in its gap. */
    phaseFx(r, color) {
      const w = this.phys(), s = this.lay.s, fx = this.fx, look = this.look, dist = r.dropDist || 0;
      const cells = r.cells.filter(([, y]) => y < this.game.h);
      if (!cells.length) return;
      const paint = (ctx, z) => {
        drawCell(ctx, look.skin, color, -z / 2, -z / 2, z, 0.45);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha *= 0.7; ctx.strokeRect(-z / 2 + 1.5, -z / 2 + 1.5, z - 3, z - 3); ctx.setLineDash([]);
      };
      const land = () => {
        const [cx, cy] = this.centerOf(cells);
        fx.ring(cx, cy, '#c7b8ff', s * 3, { max: 0.5, width: 3 });
        fx.ring(cx, cy, '#ffffff', s * 1.8, { max: 0.35, width: 2 });
        fx.pop(this.screenCells(cells, '#c7b8ff'), '#c7b8ff', 0.4);
        for (const [x, y] of cells) {
          // Motes drawn in from around the cell: it gathers itself.
          const [mx, my] = this.mid(x, y);
          for (let k = 0; k < 4; k++) { const a = Math.random() * Math.PI * 2, d = s * (0.8 + Math.random() * 0.4); w.part('pixel', mx + Math.cos(a) * d, my + Math.sin(a) * d, -Math.cos(a) * d * 5, -Math.sin(a) * d * 5, 0.2, Math.max(1.5, s * 0.1), '#e4dcff', 0, 5); }
        }
      };
      let first = true;
      for (const [x, y] of cells) {
        const fy = this.afterClear(r.rows, y), [sx, sy] = this.mid(x, Math.min(this.game.h - 1, y + dist)), [tx, ty] = this.mid(x, fy == null ? y : fy);
        w.body({ mode: 'drop', x: sx, y: sy, tx, ty, v0: s * 16, gs: 1.5, rest: 0, size: s, paint, color, key: this.keyOf(x, fy), settle: 0.02, max: 3, onLand: first ? land : null, onDone: this.intoClear(fy) });
        first = false;
      }
    }

    /** Settle: every column's blocks drop into place and bounce a little. */
    settleFx(r) {
      const w = this.phys(), s = this.lay.s, g = this.game, look = this.look, before = r.before;
      for (let x = 0; x < g.w; x++) {
        let dst = 0;
        for (let y = 0; y < g.h; y++) {
          const v = before[y * g.w + x];
          if (!v) continue;
          if (dst !== y) {
            const fy = this.afterClear(r.rows, dst), [sx, sy] = this.mid(x, y), [tx, ty] = this.mid(x, fy == null ? dst : fy);
            w.body({ mode: 'drop', x: sx, y: sy, tx, ty, v0: 0, gs: 1.5, rest: 0.25, size: s, color: this.colorOf(v), skin: look.skin, key: this.keyOf(x, fy), settle: 0.03, max: 3, onDone: this.intoClear(fy) });
          }
          dst++;
        }
      }
      this.fx.sweep(this.lay.board, '#ffffff', 'y', 0.4);
      this.fx.shake = Math.max(this.fx.shake, 2);
    }

    /** Patch: it drops through the stack like a plug and seats itself in the hole with a small ring. */
    patchFx(r) {
      const w = this.phys(), s = this.lay.s, fx = this.fx, dist = r.dropDist || 0;
      const [x, y] = r.cells[0], fy = this.afterClear(r.rows, y);
      const [sx, sy] = this.mid(x, Math.min(this.game.h - 1, y + dist)), [tx, ty] = this.mid(x, fy == null ? y : fy);
      const paint = (ctx, z) => drawSpecial(ctx, 'patch', -z / 2, -z / 2, z, 0);
      const land = () => { fx.ring(tx, ty, '#8fd3ff', s * 1.6, { max: 0.4, width: 2 }); w.sparks(tx, ty, s, 4, ['#ffffff', '#8fd3ff']); fx.shake = Math.max(fx.shake, 1.5); };
      w.body({ mode: 'drop', x: sx, y: sy, tx, ty, v0: s * 10, gs: 1.5, rest: 0, size: s, paint, color: '#e8edf5', key: this.keyOf(x, fy), settle: 0.02, max: 2, onLand: land, onDone: this.intoClear(fy) });
    }

    /** Blocks sliding to new spots (Mirror World). */
    onMoves(moves, dir, reduced) {
      if (this.fx.world) this.fx.world.land();
      if (!this.lay) this.layout();
      const s = this.lay.s;
      if (!reduced) {
        for (const [x0, y0, x1, y1, v] of moves) {
          const [sx0, sy0] = this.toScreen(x0, y0), [sx1, sy1] = this.toScreen(x1, y1);
          this.fx.mover({ x0: sx0, y0: sy0, x1: sx1, y1: sy1, s, color: this.colorOf(v), skin: this.look.skin, dur: 0.35, hideAll: true });
        }
        this.fx.sweep(this.lay.board, '#ffffff', 'x', 0.45);
      }
      this.dirty = true;
    }

    /** Screen cells for board cells. */
    screenCells(cells, color) {
      const s = this.lay.s;
      return cells.filter(([, y]) => y < this.game.h).map(([x, y]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, s, color }; });
    }

    centerOf(cells) {
      const sc = this.screenCells(cells);
      if (!sc.length) return [0, 0];
      const s = this.lay.s;
      return [sc.reduce((a, c) => a + c.x, 0) / sc.length + s / 2, sc.reduce((a, c) => a + c.y, 0) / sc.length + s / 2];
    }

    /** The moment an item takes hold of the piece in play. */
    itemFx(id, piece, reduced) {
      if (!this.lay) this.layout();
      const g = this.game, s = this.lay.s, fx = this.fx, b = this.lay.board;
      this.dirty = true;
      // A rewind takes back what the last item did, its show included.
      if (id === 'rewind') { if (fx.world) fx.world.clear(); fx.props = []; fx.texts = []; fx.movers = []; }
      if (id === 'rewind') { fx.sweep(b, '#8fd3ff', 'y', 0.55); if (!reduced) fx.text('↶', b.x + b.w / 2, b.y + b.h * 0.4, '#8fd3ff', 30); return; }
      if (!piece || id === 'settle' || id === 'trapdoor' || id === 'tornado' || id === 'flip') return;
      const cells = g.cellsOf(piece), color = this.colorOf(piece.type.color);
      const sc = this.screenCells(cells, color), [cx, cy] = this.centerOf(cells);
      if (reduced) { fx.pop(sc, color, 0.3); return; }
      switch (id) {
        case 'reroll': fx.pop(sc, color); fx.stars(cx, cy, this.look.colors.slice(1, 8), 12, 120); fx.ring(cx, cy, color, s * 2.2); break;
        case 'mirror': {
          const x0 = Math.min(...sc.map((c) => c.x)), y0 = Math.min(...sc.map((c) => c.y));
          fx.sweep({ x: x0 - s * 0.2, y: y0 - s * 0.2, w: Math.max(...sc.map((c) => c.x)) + s * 1.2 - x0, h: Math.max(...sc.map((c) => c.y)) + s * 1.2 - y0 }, '#ffffff', 'x', 0.35);
          fx.pop(sc, color, 0.35);
          break;
        }
        case 'pebble': fx.puff(cx, cy, this.look.theme.muted, 10, s * 0.4); fx.pop(sc, color, 0.35); break;
        case 'phase': fx.pop(sc, '#c7b8ff', 0.6); fx.ring(cx, cy, '#c7b8ff', s * 2.6); fx.ring(cx, cy, '#ffffff', s * 1.6, { max: 0.5 }); break;
        case 'drill': fx.pop(sc, '#ffd166'); fx.burst('sparks', sc, s, false); break;
        case 'bomb': fx.pop(sc, '#ff9f43'); fx.ring(cx, cy, '#ff9f43', s * 1.8, { inward: true, max: 0.4, width: 3 }); fx.shake = Math.max(fx.shake, 2); break;
        case 'order': case 'blueprint': fx.pop(sc, this.look.theme.accent, 0.55); fx.stars(cx, cy, ['#fffbe6', this.look.theme.accent], 10, 90); break;
        case 'undo': fx.pop(sc, this.look.theme.muted, 0.35); fx.puff(cx, cy, this.look.theme.muted, 6, s * 0.35); break;
        case 'noodle': fx.pop(sc, color, 0.5); fx.sweep({ x: Math.min(...sc.map((c) => c.x)) - s, y: sc[0].y - s * 0.3, w: sc.length * s + 2 * s, h: s * 1.6 }, '#ffffff', 'x', 0.4); break;
        case 'giant': fx.pop(sc, color, 0.6); fx.ring(cx, cy, color, s * 4, { width: 4 }); fx.shake = Math.max(fx.shake, 3); break;
        case 'laser': fx.pop(sc, '#ff3c50', 0.5); fx.stars(cx, cy, ['#ff6b7a', '#ffffff'], 10, 140); break;
        case 'blackhole': fx.ring(cx, cy, '#b48cff', s * 3, { inward: true, max: 0.6, width: 3 }); fx.pop(sc, '#b48cff', 0.5); break;
        case 'golden': fx.pop(sc, '#ffd35a', 0.6); fx.stars(cx, cy, ['#ffd35a', '#fff1b8'], 14, 130); break;
        case 'patch': fx.pop(sc, '#8fd3ff', 0.5); fx.ring(cx, cy, '#8fd3ff', s * 1.8, { inward: true, max: 0.4, width: 2 }); break;
        case 'pick': case 'fit': fx.pop(sc, this.look.theme.accent, 0.5); fx.sweep({ x: Math.min(...sc.map((c) => c.x)) - s * 0.2, y: Math.min(...sc.map((c) => c.y)) - s * 0.2, w: Math.max(...sc.map((c) => c.x)) + s * 1.4 - Math.min(...sc.map((c) => c.x)), h: Math.max(...sc.map((c) => c.y)) + s * 1.4 - Math.min(...sc.map((c) => c.y)) }, '#ffffff', 'y', 0.35); if (id === 'fit') fx.stars(cx, cy, ['#fffbe6', this.look.theme.accent], 10, 90); break;
        case 'double': fx.text('DOUBLE OR NOTHING', b.x + b.w / 2, b.y + b.h * 0.3, '#ffd35a', 15); fx.stars(cx, cy, ['#ffd35a', '#9aa3b2'], 12, 110); break;
        case 'net': fx.text('SAFETY NET', b.x + b.w / 2, b.y + b.h * 0.3, '#8fe3ff', 15); fx.sweep({ x: b.x, y: b.y + b.h * 0.85, w: b.w, h: b.h * 0.15 }, '#8fe3ff', 'x', 0.5); break;
        default: fx.pop(sc, color);
      }
    }

    /** Little signs of life on a special piece: the bomb's fuse spits sparks, the drill throws chips, gold glints. */
    ambient(p, pieceCells, now) {
      if (this.opts.still || (this.look && this.reducedMotion)) return;
      const last = this.ambAt || now, dt = Math.min(0.1, (now - last) / 1000);
      this.ambAt = now;
      const fx = this.fx, s = this.lay.s;
      const sc = this.screenCells(pieceCells);
      if (!sc.length || Math.random() > dt * 20) return;
      const c = sc[Math.floor(Math.random() * sc.length)];
      if (p.special === 'bomb') {
        fx.parts.push({ kind: 'spark', x: c.x + s * 0.87, y: c.y + s * 0.13, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 80, g: 300, life: 0, max: 0.3 + Math.random() * 0.3, size: 2, color: Math.random() < 0.5 ? '#ffd166' : '#ff8c42' });
      } else if (p.special === 'drill') {
        if (Math.random() < 0.4) fx.parts.push({ kind: 'grain', x: c.x + s * 0.5, y: c.y + s * 0.9, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, g: 300, life: 0, max: 0.4, size: 2, color: '#c0c7d2' });
      } else if (p.special === 'patch') {
        if (Math.random() < 0.3) fx.parts.push({ kind: 'star', x: c.x + s / 2, y: c.y + s / 2, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, g: 0, life: 0, max: 0.4, size: 1.5, color: '#bfe6ff' });
      } else if (p.special === 'blackhole') {
        const cx = c.x + s / 2, cy = c.y + s / 2, a = Math.random() * 6.3, r = s * (1.5 + Math.random());
        fx.parts.push({ kind: 'spiral', cx, cy, ang: a, rad: r, w: 6, pull: 3, x: cx, y: cy, vx: 0, vy: 0, g: 0, life: 0, max: 0.7, size: 3, color: Math.random() < 0.5 ? '#b48cff' : '#ffb35c' });
      } else if (!p.special && this.game.s && this.game.s.gold > 0) {
        fx.parts.push({ kind: 'star', x: c.x + Math.random() * s, y: c.y + Math.random() * s, vx: 0, vy: -10, g: 0, life: 0, max: 0.6, size: 2 + Math.random() * 2, color: '#fff1b8' });
      } else if (p.special === 'phase') {
        if (Math.random() < 0.5) fx.parts.push({ kind: 'star', x: c.x + Math.random() * s, y: c.y + Math.random() * s, vx: 0, vy: -12, g: 0, life: 0, max: 0.6, size: 2 + Math.random() * 2, color: '#e4dcff' });
      }
    }

    /** A faint afterimage where the piece just was (moves and turns). */
    trail(cells, color, reduced) {
      if (reduced || !this.lay || !cells.length) return;
      const s = this.lay.s;
      this.fx.fades.push({ cells: cells.filter(([, y]) => y < this.game.h).map(([x, y]) => { const [sx, sy] = this.toScreen(x, y); return { x: sx, y: sy, s, color }; }), skin: this.look.skin, t: 0, dur: 0.12, alpha: 0.35 });
    }

    /** A blocked move: a nudge. */
    bump(reduced) { if (!reduced) this.fx.shake = Math.max(this.fx.shake, 1.2); this.dirty = true; }

    /** Tornado: a whirl over the board while every column slides to its new place. */
    onTornado(moves, reduced) {
      if (this.fx.world) this.fx.world.land();
      if (!this.lay) this.layout();
      const s = this.lay.s, b = this.lay.board, fx = this.fx;
      if (reduced) { fx.sweep(b, '#cfe3ff', 'x', 0.3); this.dirty = true; return; }
      for (const [x0, y0, x1, y1, v] of moves) {
        const [sx0, sy0] = this.toScreen(x0, y0), [sx1, sy1] = this.toScreen(x1, y1);
        fx.mover({ x0: sx0, y0: sy0, x1: sx1, y1: sy1, s, color: this.colorOf(v), skin: this.look.skin, dur: 0.5, delay: Math.abs(x1 - x0) * 0.015, hideAll: true });
      }
      for (let k = 0; k < 40; k++) fx.parts.push({ kind: 'spiral', cx: b.x + b.w / 2, cy: b.y + b.h * 0.6, ang: Math.random() * 6.3, rad: b.w * (0.2 + Math.random() * 0.4), w: 7, pull: 0.6, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 0.8 + Math.random() * 0.4, size: s * 0.3, color: '#cfd8e6' });
      fx.text('TORNADO', b.x + b.w / 2, b.y + b.h * 0.3, '#cfe3ff', 20);
      fx.shake = Math.max(fx.shake, 4);
      this.dirty = true;
    }

    /** Trapdoor: the bottom row drops out of the board, block by block, and the rest comes down one. */
    onTrapdoor(row, reduced) {
      if (this.fx.world) this.fx.world.land();
      if (!this.lay) this.layout();
      const s = this.lay.s, fx = this.fx, g = this.game, look = this.look;
      const cells = [];
      row.forEach((v, x) => { if (v) { const [sx, sy] = this.toScreen(x, 0); cells.push({ x: sx, y: sy, color: this.colorOf(v) }); } });
      if (reduced || !fx.world) { fx.burst('fade', cells, s, true); this.dirty = true; return; }
      const w = this.phys();
      row.forEach((v, x) => {
        if (!v) return;
        const [cx, cy] = this.mid(x, 0);
        w.body({ mode: 'free', x: cx, y: cy, vx: (Math.random() - 0.5) * s * 2, vy: 0, va: (Math.random() - 0.5) * 6, size: s, color: this.colorOf(v), skin: look.skin, rest: 0, fric: 1, solid: false, fadeAt: 0.25, max: 0.5 });
      });
      // Everything above settles down one row.
      for (let y = 0; y < g.h - 1; y++) for (let x = 0; x < g.w; x++) {
        const v = g.board.get(x, y);
        if (!v) continue;
        const [sx0, sy0] = this.toScreen(x, y + 1), [sx1, sy1] = this.toScreen(x, y);
        fx.mover({ x0: sx0, y0: sy0, x1: sx1, y1: sy1, s, color: this.colorOf(v), skin: look.skin, dur: 0.22, delay: 0.08, hideAll: true });
      }
      const [lx, ly] = this.toScreen(0, 0), [rx] = this.toScreen(g.w - 1, 0);
      fx.flash(Math.min(lx, rx), ly, Math.abs(rx - lx) + s, s, '#ffffff', 0.25);
      fx.shake = Math.max(fx.shake, 2.5);
      this.dirty = true;
    }
  }

  function labelFor(r) {
    const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'QUINT', 'SEXTUPLE', 'SEPTUPLE'];
    // Named for what the piece itself cleared; lines an item cleared are just lines.
    const n = r.lines - (r.plain || 0);
    let s = r.tspin ? 'T-SPIN ' + (names[n] || n + ' LINES') : r.mini ? 'T-SPIN MINI' + (n ? ' ' + names[n] : '') : n >= 4 ? (names[n] || n + ' LINES') : '';
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
