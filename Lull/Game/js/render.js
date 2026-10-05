// Lull — drawing: palettes, mino skins, frames, backdrops, ghosts, line-clear effects, and the board view (which
// can be turned a quarter or half turn for the Sideways and Upside Down wildcards).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Pieces, PALETTES, clamp } = L;
  const { LINE } = L;

  // Frozen time, for tests that compare pixels (the page opened with ?freeze=1): every board draws at one fixed
  // moment, so twinkling stars, the Prism palette, a laser's pulse and the danger rim hold still, and nothing shakes.
  const FREEZE = root.location && /[?&]freeze=1(&|$)/.test(root.location.search || '') ? 4321 : null;
  /** The time a frame is drawn at: now, or the frozen moment. */
  const clock = (now) => (FREEZE != null ? FREEZE : now);

  // ---- the board recipe's view parts (Recipe.viewPart) --------------------------------------------------------------
  //
  // A part's view half draws what its option adds. Every hook is optional; hooks run in the parts' order:
  //   active(game) -> bool       is it on this board (default: the game has the part's engine extension)
  //   claims(v, view) -> bool    a stored cell it draws itself (Descent: hanging blocks, stone; Race: filler; Battle: the ceiling's stone);
  //                              claims: 'rest' draws the own cells no other painter claimed (Physics)
  //   cell(ctx, v, x, y, s, kind, view, at) -> false to fall back   kind: 'stack', 'piece', 'ghost' or 'tray'; v is the
  //                              cell (stack) or the colour slot; at: { x, y } on the board, or { cells } of the piece
  //   overStack / overPiece / overRim (ctx, view, now)   drawn after the stack, after the piece, after the rim
  //   busy(view, now) -> bool    it is animating (ORed into needsFrame)
  //   shownRows(view) -> rows    the rows shown from the floor up, when fewer than the board's (Mural's shut buffer;
  //                              fractional while it opens): the board is laid out for them, the rows over them clipped
  //   onLock(view, r, reduced) / onMove / onRotate / onLower (view, act, reduced)   animation triggers (Free Play's moves)
  //   dangerRim: false           no red rim near the top
  //   trayRot(entry, view) -> rot   which turn the Hold and Next trays draw
  //   traySlot(entry, view, slot, dir) -> cells   how long a tray's slot must be along dir for this piece, in tray cells
  //                              (slot 'next': the first Next slot, dir its queue's 'v' or 'h'; slot 'hold': the Hold box,
  //                              grown down beside a tall board, 'v' only): the largest answer over today's (Next 2.5 'v',
  //                              3.4 'h'; Hold its own), so a long piece draws larger (Shapes' 12 blocks)
  //   nextCount(view) -> n       at most n pieces in Next (at least 1; the fewest asked for): a later slot's piece
  //                              that would be drawn too small to read is left out
  //   pieceAlpha(view, p, cell, copy) -> alpha   how opaque a cell of the piece in play is drawn (copy: a cell the
  //                              recipe added to the piece's own, placed: Mirror's copy at 0.8); the answers multiply
  //   preview(ctx, geom, recipe, theme)   over the Custom window's preview (previewBoard)
  //   layout: 'battle', render(view, ctx, now)   a whole frame of its own for that controller view (BoardView.shell)
  const viewParts = () => (L.Recipe && L.Recipe.views ? L.Recipe.views() : []);
  /** The view parts on for this game. */
  function activeViews(game) {
    const all = viewParts();
    if (!all.length || !game) return [];
    const keys = new Set((game.ext || []).map((e) => e.key));
    return all.filter((p) => (typeof p.active === 'function' ? p.active(game) : keys.has(p.key)));
  }

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

  // The seven start on Lull's own hues (I coral, O sky, T amber, S violet, Z teal, J lime, L orchid) and turn from there.
  const PRISM_HUES = [0, 6, 207, 42, 255, 168, 90, 315, 0, 340, 120, 185, 230, 25, 285, 0];
  /**
   * The 16 colour slots of a palette at time t (only Prism changes with time). Prism turns every hue slowly round the
   * wheel (8° a second, a full turn in 45 s) in 2° steps: small enough to read as a glide, few enough (180 steps) that
   * each step's cells come from the sprite cache instead of being painted again.
   */
  const prismCache = new Map();
  /**
   * The mirrored pentominoes' own colours, slots 16-21 (Fm Pm Nm Ym Z5m L5m): its base's lightness and saturation (so
   * it sits in the palette) at a hue of its own, in the gaps the seven and the pentominoes leave (magenta, indigo,
   * lime, chartreuse, sea green, sky), a little deeper so it stands apart from its neighbours.
   */
  const MIRROR_SLOTS = [[9, 300], [10, 238], [10, 105], [9, 66], [12, 160], [13, 200]];
  const turned = new Map();
  function withMirrors(colors) {
    let out = turned.get(colors);
    if (out) return out;
    out = colors.slice(0, 16).concat(MIRROR_SLOTS.map(([slot, hue]) => {
      const [r, g, b] = rgb(colors[slot]).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      const sat = mx === mn ? 0 : (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn);
      return hsl(hue, Math.max(sat * 100, 45), Math.max(30, l * 100 - 8));
    }));
    turned.set(colors, out);
    return out;
  }
  function paletteColors(id, t) {
    const p = PALETTES[id] || PALETTES.classic;
    if (!p.animated) return withMirrors(p.colors);
    const step = Math.floor(((t || 0) / 1000) * 8 / 2) % 180;
    let cols = prismCache.get(step);
    if (!cols) {
      cols = withMirrors(PRISM_HUES.map((h, i) => (i === 8 ? '#5b6170' : i === 15 ? '#c3c8d2' : hsl(h + step * 2, 72, 64))));
      prismCache.set(step, cols);
    }
    return cols;
  }

  /**
   * On the light theme's paper well a pale colour washes out: each colour is deepened (hue kept) until it stands off
   * the paper, and nothing else is touched. Cached per palette list.
   */
  const wellCache = new Map();
  function forWell(colors, themeName) {
    if (themeName !== 'light' || !colors) return colors;
    let out = wellCache.get(colors);
    if (out) return out;
    out = colors.map((c, i) => {
      if (!i || luminance(c) <= 0.7) return c;
      // Lower the lightness in HSL (hue kept, saturation lifted a little) so a yellow deepens to amber, not olive.
      const [r, g, b] = rgb(c).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0, sat = 0, l = (mx + mn) / 2;
      if (mx !== mn) {
        const d = mx - mn; sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
      }
      if (sat > 0.15) sat = Math.min(1, sat * 1.08 + 0.04);
      let out2 = c;
      for (let k = 0; k < 40 && luminance(out2) > 0.7; k++) { l -= 0.012; out2 = hsl(h, sat * 100, l * 100); }
      return out2;
    });
    wellCache.set(colors, out);
    return out;
  }

  // ---- skins ----------------------------------------------------------------------------------------------------------

  /** A rounded rectangle added to the current path (no new path: two of them make a ring with evenodd). */
  function rrPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
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

  // Every skin paints one cell into a sprite of s device pixels (cached per skin, colour and size), so a skin is drawn
  // once per colour and size, never per frame. Edges land on whole pixels at 1x and 2x.
  const px = (s, f, min) => Math.max(min == null ? 1 : min, Math.round(s * f));
  const SKIN_PAINT = {
    flat(ctx, s, c) {
      // Quiet depth: a soft top-to-bottom light, a hairline of light along the top edge and a deeper one along the
      // bottom, corners softened in proportion. A gap that grows with the cell keeps neighbours apart.
      const g = px(s, 0.045), r = s * 0.17, w = s - 2 * g;
      const gr = ctx.createLinearGradient(0, g, 0, s - g);
      gr.addColorStop(0, shade(c, 0.1)); gr.addColorStop(1, shade(c, -0.08));
      ctx.fillStyle = gr; rr(ctx, g, g, w, w, r); ctx.fill();
      ctx.save(); ctx.clip();
      const hl = px(s, 0.05);
      ctx.fillStyle = 'rgba(255,255,255,0.26)'; ctx.fillRect(g, g, w, hl);
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(g, s - g - hl, w, hl);
      ctx.restore();
    },
    bevel(ctx, s, c) {
      // The classic block: a lit top and left, a shaded bottom and right, a flat face — cut on whole pixels.
      const g = px(s, 0.03, 0), b = px(s, 0.15, 2), x0 = g, x1 = s - g;
      ctx.fillStyle = c; ctx.fillRect(x0, x0, x1 - x0, x1 - x0);
      const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fill(); };
      poly([x0, x0, x1, x0, x1 - b, x0 + b, x0 + b, x0 + b], shade(c, 0.42));
      poly([x0, x0, x0 + b, x0 + b, x0 + b, x1 - b, x0, x1], shade(c, 0.2));
      poly([x1, x0, x1, x1, x1 - b, x1 - b, x1 - b, x0 + b], shade(c, -0.22));
      poly([x0, x1, x0 + b, x1 - b, x1 - b, x1 - b, x1, x1], shade(c, -0.4));
      const f = ctx.createLinearGradient(0, x0 + b, 0, x1 - b);
      f.addColorStop(0, shade(c, 0.06)); f.addColorStop(1, shade(c, -0.06));
      ctx.fillStyle = f; ctx.fillRect(x0 + b, x0 + b, x1 - x0 - 2 * b, x1 - x0 - 2 * b);
    },
    pixel(ctx, s, c) {
      // Eight by eight pixel art, snapped to whole device pixels: a dark outline, a lit corner, one bright glint.
      const n = 8, p = Math.max(1, Math.floor(s / n)), o = Math.floor((s - p * n) / 2);
      const at = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(o + x * p, o + y * p, w * p, h * p); };
      at(0, 0, 8, 8, shade(c, -0.45));
      at(1, 1, 6, 6, c);
      at(1, 1, 6, 1, shade(c, 0.35)); at(1, 1, 1, 6, shade(c, 0.35));
      at(1, 6, 6, 1, shade(c, -0.2)); at(6, 1, 1, 6, shade(c, -0.2));
      at(2, 2, 1, 1, shade(c, 0.75));
    },
    bubble(ctx, s, c) {
      // A glossy sphere: lit from the top left, a soft bounce of light along the bottom, one crisp highlight.
      const cx = s / 2, cy = s / 2, R = s * 0.45;
      const g = ctx.createRadialGradient(s * 0.38, s * 0.32, s * 0.04, cx, cy, R);
      g.addColorStop(0, shade(c, 0.6)); g.addColorStop(0.45, c); g.addColorStop(1, shade(c, -0.38));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      const b = ctx.createRadialGradient(cx, s * 0.95, 0, cx, s * 0.95, R * 0.9);
      b.addColorStop(0, rgba(shade(c, 0.5), 0.45)); b.addColorStop(1, rgba(shade(c, 0.5), 0));
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = b; ctx.fillRect(0, 0, s, s); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(s * 0.37, s * 0.29, s * 0.1, s * 0.06, -0.6, 0, Math.PI * 2); ctx.fill();
    },
    glass(ctx, s, c, light) {
      // Tinted glass: the colour held in a clear pane, a bright rim, and a diagonal glare across the top half.
      const g = px(s, 0.05), w = s - 2 * g, r = s * 0.14;
      const f = ctx.createLinearGradient(0, g, 0, s - g);
      f.addColorStop(0, rgba(shade(c, light ? -0.05 : 0.15), light ? 0.8 : 0.72)); f.addColorStop(1, rgba(shade(c, light ? -0.2 : -0.1), light ? 0.62 : 0.5));
      ctx.fillStyle = f; rr(ctx, g, g, w, w, r); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.moveTo(g, g); ctx.lineTo(g + w * 0.72, g); ctx.lineTo(g, g + w * 0.72); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.moveTo(g + w * 0.86, g); ctx.lineTo(g + w, g); ctx.lineTo(g + w, g + w * 0.1); ctx.lineTo(g + w * 0.1, g + w); ctx.lineTo(g, g + w); ctx.lineTo(g, g + w * 0.86); ctx.closePath(); ctx.fill();
      ctx.restore();
      const lw = px(s, 0.045);
      ctx.strokeStyle = light ? rgba(shade(c, -0.3), 0.9) : rgba(shade(c, 0.55), 0.95); ctx.lineWidth = lw; rr(ctx, g + lw / 2, g + lw / 2, w - lw, w - lw, r); ctx.stroke();
    },
    jelly(ctx, s, c) {
      // A soft gum: rounder, lit from inside at the bottom, a glossy pill of light on top, a darker translucent rim.
      const g = px(s, 0.05), w = s - 2 * g, r = s * 0.3;
      const f = ctx.createLinearGradient(0, g, 0, s - g);
      f.addColorStop(0, shade(c, 0.28)); f.addColorStop(0.6, c); f.addColorStop(1, shade(c, 0.12));
      ctx.fillStyle = f; rr(ctx, g, g, w, w, r); ctx.fill();
      ctx.save(); ctx.clip();
      const inner = ctx.createRadialGradient(s / 2, s * 0.85, 0, s / 2, s * 0.85, s * 0.5);
      inner.addColorStop(0, rgba(shade(c, 0.55), 0.55)); inner.addColorStop(1, rgba(shade(c, 0.55), 0));
      ctx.fillStyle = inner; ctx.fillRect(0, 0, s, s);
      ctx.restore();
      ctx.strokeStyle = rgba(shade(c, -0.35), 0.7); ctx.lineWidth = px(s, 0.05); rr(ctx, g, g, w, w, r); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; rr(ctx, s * 0.22, s * 0.15, s * 0.4, s * 0.14, s * 0.07); ctx.fill();
    },
    neon(ctx, s, c, light) {
      // A lit tube bent into a square: a glow, the coloured glass, and a white-hot core line (on the paper well, a
      // deeper tube with a bright core reads better than a pale one).
      const lw = Math.max(1.5, s * 0.09), i = s * 0.16, w = s - 2 * i, r = s * 0.16, tube = light ? shade(c, -0.18) : c;
      ctx.fillStyle = rgba(c, light ? 0.22 : 0.13); rr(ctx, i, i, w, w, r); ctx.fill();
      ctx.shadowColor = c; ctx.shadowBlur = s * (light ? 0.2 : 0.28);
      ctx.strokeStyle = tube; ctx.lineWidth = lw * (light ? 1.15 : 1); rr(ctx, i, i, w, w, r); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba(shade(c, light ? 0.55 : 0.75), 0.95); ctx.lineWidth = Math.max(0.75, lw * 0.34); ctx.stroke();
    },
    gem(ctx, s, c) {
      // A cut stone: four facets round a table that catches the light, and a small star of glint.
      const g = px(s, 0.03, 0), i = s * 0.25, a = g, z = s - g;
      const tri = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fill(); };
      tri([a, a, z, a, z - i, a + i, a + i, a + i], shade(c, 0.5));
      tri([a, a, a + i, a + i, a + i, z - i, a, z], shade(c, 0.22));
      tri([z, a, z, z, z - i, z - i, z - i, a + i], shade(c, -0.2));
      tri([a, z, a + i, z - i, z - i, z - i, z, z], shade(c, -0.42));
      const t = ctx.createLinearGradient(a + i, a + i, z - i, z - i);
      t.addColorStop(0, shade(c, 0.32)); t.addColorStop(0.5, c); t.addColorStop(1, shade(c, -0.12));
      ctx.fillStyle = t; ctx.fillRect(a + i, a + i, z - a - 2 * i, z - a - 2 * i);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const sx = a + i + (z - a - 2 * i) * 0.28, sy = a + i + (z - a - 2 * i) * 0.28, k = s * 0.07;
      ctx.beginPath(); ctx.moveTo(sx, sy - k); ctx.lineTo(sx + k * 0.3, sy - k * 0.3); ctx.lineTo(sx + k, sy); ctx.lineTo(sx + k * 0.3, sy + k * 0.3); ctx.lineTo(sx, sy + k); ctx.lineTo(sx - k * 0.3, sy + k * 0.3); ctx.lineTo(sx - k, sy); ctx.lineTo(sx - k * 0.3, sy - k * 0.3); ctx.closePath(); ctx.fill();
    },
    lantern(ctx, s, c) {
      // A paper lantern: a warm lit core, fine ribs across the paper, darker caps top and bottom.
      const g = px(s, 0.05), w = s - 2 * g, r = s * 0.24;
      const f = ctx.createRadialGradient(s * 0.5, s * 0.5, s * 0.02, s * 0.5, s * 0.5, s * 0.6);
      f.addColorStop(0, shade(mix(c, '#fff4d6', 0.35), 0.5)); f.addColorStop(0.5, shade(c, 0.12)); f.addColorStop(1, shade(c, -0.28));
      ctx.fillStyle = f; rr(ctx, g, g, w, w, r); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(shade(c, -0.45), 0.22);
      const rib = Math.max(1, Math.round(s * 0.03));
      for (const k of [0.34, 0.5, 0.66]) ctx.fillRect(g, Math.round(s * k), w, rib);
      ctx.fillStyle = rgba(shade(c, -0.5), 0.5);
      ctx.fillRect(g, g, w, px(s, 0.09)); ctx.fillRect(g, s - g - px(s, 0.09), w, px(s, 0.09));
      ctx.restore();
    },
    steel(ctx, s, c) {
      // Brushed plate with a tint of the piece's colour, a bevelled edge and four rivets.
      const base = mix(c, '#a3acb8', 0.55), g = px(s, 0.03, 0), w = s - 2 * g;
      const f = ctx.createLinearGradient(0, 0, s, s);
      f.addColorStop(0, shade(base, 0.35)); f.addColorStop(0.5, base); f.addColorStop(1, shade(base, -0.28));
      ctx.fillStyle = f; ctx.fillRect(g, g, w, w);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let k = g + 2; k < s - g; k += 3) ctx.fillRect(g, k, w, 1);
      const e = px(s, 0.06);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(g, g, w, e); ctx.fillRect(g, g, e, w);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(g, s - g - e, w, e); ctx.fillRect(s - g - e, g, e, w);
      const rv = Math.max(1, s * 0.055);
      for (const [x, y] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) {
        ctx.fillStyle = shade(base, -0.45); ctx.beginPath(); ctx.arc(s * x, s * y, rv, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(s * x - rv * 0.3, s * y - rv * 0.3, rv * 0.4, 0, Math.PI * 2); ctx.fill();
      }
    },
  };

  const spriteCache = new Map();
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  /** A cached image of one cell. `s` is in device pixels. */
  function cellSprite(skin, color, s, light) {
    s = Math.max(2, Math.round(s));
    light = !!light && (skin === 'glass' || skin === 'neon'); // only these two paint differently on the light well
    const key = skin + '|' + color + '|' + s + (light ? '|l' : '');
    let c = spriteCache.get(key);
    if (c) return c;
    if (spriteCache.size > 4000) spriteCache.clear();
    c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    (SKIN_PAINT[skin] || SKIN_PAINT.flat)(ctx, s, color, light);
    spriteCache.set(key, c);
    return c;
  }

  /** How far inside its cells the i-th piece of Classic's top-out pile draws its outline (past the line's own half). */
  function pileInset(i, s, lw) {
    return Math.min(i * Math.max(lw + 0.5, Math.min(lw * 1.4, s * 0.1)), s * 0.34 - lw);
  }

  function drawCell(ctx, skin, color, x, y, s, alpha) {
    const dpr = ctx.__dpr || 1;
    const img = cellSprite(skin, color, s * dpr, ctx.__light);
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

  // ---- the well, backdrops and frames ---------------------------------------------------------------------------------
  //
  // The board sits in a well: a recessed tray a little larger than the grid, with rounded corners, light falling in from
  // the top, a soft shadow under its top edge and a fine rim. What does not move (the tray, a still backdrop, the light)
  // is painted once into an offscreen layer per size, theme and look, so a frame costs two images, not dozens of
  // gradients. An animated backdrop (Aurora, Starfield, Conveyor) draws only its moving part live, from cached sprites.

  /** The well's rectangle around the grid (CSS px), and its corner radius. */
  function wellRect(board, s) {
    const p = Math.max(3, Math.round(s * 0.16));
    return { x: board.x - p, y: board.y - p, w: board.w + 2 * p, h: board.h + 2 * p, r: Math.round(Math.min(14, p + s * 0.22)), p };
  }

  const layerCache = new Map();
  /** An offscreen layer of the well (CSS px w×h at dpr), painted once for its key. */
  function layer(key, w, h, dpr, paint) {
    let c = layerCache.get(key);
    if (c) return c;
    if (layerCache.size > 48) layerCache.clear();
    c = makeCanvas(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr); ctx.__dpr = dpr;
    paint(ctx);
    layerCache.set(key, c);
    return c;
  }

  const ANIMATED_BACKDROPS = new Set(['aurora', 'stars', 'belt']);

  /** Grid lines on whole device pixels. */
  function gridLines(ctx, board, s, cols, rows, color, dpr, rowsOnly) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    const X = (v) => Math.round(v * dpr), lw = Math.max(1, Math.round(dpr * 0.75));
    if (!rowsOnly) for (let c = 1; c < cols; c++) ctx.fillRect(X(board.x + c * s), X(board.y), lw, X(board.y + board.h) - X(board.y));
    for (let q = 1; q < rows; q++) ctx.fillRect(X(board.x), X(board.y + q * s), X(board.x + board.w) - X(board.x), lw);
    ctx.restore();
  }

  /** A still backdrop (or the still part of a moving one), in the grid's coordinates. */
  function paintBackdrop(ctx, id, board, s, cols, rows, theme, dpr) {
    const { x, y, w, h } = board, light = theme.name === 'light';
    if (id === 'grid') gridLines(ctx, board, s, cols, rows, theme.grid, dpr);
    else if (id === 'blueprint') {
      ctx.fillStyle = light ? 'rgba(40,110,200,0.09)' : 'rgba(40,100,190,0.24)'; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const minor = light ? 'rgba(40,110,200,0.08)' : 'rgba(160,200,255,0.07)';
      gridLines(ctx, { x: x - s / 2, y: y - s / 2, w: w + s, h: h + s }, s, cols + 1, rows + 1, minor, dpr);
      ctx.restore();
      gridLines(ctx, board, s, cols, rows, light ? 'rgba(40,110,200,0.2)' : 'rgba(160,200,255,0.2)', dpr);
    } else if (id === 'dusk') {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      if (light) { g.addColorStop(0, 'rgba(120,110,210,0.1)'); g.addColorStop(0.6, 'rgba(230,140,170,0.12)'); g.addColorStop(1, 'rgba(250,170,110,0.22)'); }
      else { g.addColorStop(0, 'rgba(46,40,110,0.34)'); g.addColorStop(0.55, 'rgba(150,72,120,0.16)'); g.addColorStop(0.85, 'rgba(236,132,96,0.18)'); g.addColorStop(1, 'rgba(250,176,110,0.3)'); }
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      const sun = ctx.createRadialGradient(x + w * 0.5, y + h, 0, x + w * 0.5, y + h, w * 0.75);
      sun.addColorStop(0, light ? 'rgba(255,170,110,0.22)' : 'rgba(255,190,130,0.24)'); sun.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
    } else if (id === 'aurora') {
      gridLines(ctx, board, s, cols, rows, theme.grid, dpr, true);
    } else if (id === 'stars') {
      // The faint, still stars; the few bright ones twinkle live.
      for (const [sx, sy, sz] of starsFor(cols, rows)) {
        if (sz > 0.7) continue;
        ctx.fillStyle = light ? 'rgba(70,84,120,' + (0.12 + sz * 0.25) + ')' : 'rgba(255,255,255,' + (0.12 + sz * 0.3) + ')';
        const d = 1 / dpr * Math.max(1, Math.round(dpr));
        ctx.fillRect(Math.round((x + sx * w) * dpr) / dpr, Math.round((y + sy * h) * dpr) / dpr, d, d);
      }
    }
  }

  const starCache = new Map();
  function starsFor(cols, rows) {
    const key = cols + 'x' + rows;
    let stars = starCache.get(key);
    if (!stars) {
      const r2 = new L.RNG('stars' + key);
      stars = [];
      for (let k = 0; k < cols * rows * 0.7; k++) stars.push([r2.next(), r2.next(), r2.next(), r2.next() * Math.PI * 2]);
      starCache.set(key, stars);
    }
    return stars;
  }

  const veilCache = new Map();
  /** A soft coloured veil (an ellipse of light), drawn once per colour. */
  function veil(color) {
    let c = veilCache.get(color);
    if (c) return c;
    c = makeCanvas(128, 128);
    const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color); g.addColorStop(0.55, color.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.4) + ')')); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    veilCache.set(color, c);
    return c;
  }

  const beltCache = new Map();

  /** The moving part of an animated backdrop, at time t (ms); t is held still under reduced motion. */
  function paintBackdropLive(ctx, id, board, s, cols, rows, theme, t) {
    const { x, y, w, h } = board, light = theme.name === 'light', sec = (t || 0) / 1000;
    if (id === 'aurora') {
      // Three veils of light drifting slowly on long, unrelated periods, so the sky never visibly repeats.
      const V = light
        ? [['rgba(40,190,160,0.16)', 0.22, 0.2, 0.9, 0.5, 23], ['rgba(130,90,240,0.13)', 0.8, 0.45, 0.8, 0.45, 31], ['rgba(70,150,240,0.11)', 0.4, 0.75, 1, 0.4, 37]]
        : [['rgba(70,225,185,0.2)', 0.22, 0.2, 0.9, 0.5, 23], ['rgba(150,110,255,0.18)', 0.8, 0.45, 0.8, 0.45, 31], ['rgba(80,160,255,0.13)', 0.4, 0.75, 1, 0.4, 37]];
      for (const [col, fx, fy, sw, sh, per] of V) {
        const k = (sec / per) * Math.PI * 2;
        const cx = x + w * (fx + 0.16 * Math.sin(k)), cy = y + h * (fy + 0.08 * Math.sin(k * 0.7 + 1));
        const ww = w * sw * 1.6, hh = h * sh * (1 + 0.1 * Math.sin(k * 1.3));
        ctx.drawImage(veil(col), cx - ww / 2, cy - hh / 2, ww, hh);
      }
    } else if (id === 'stars') {
      // The bright few twinkle, each on its own slow phase (grouped, so no colour strings are made per frame).
      ctx.fillStyle = light ? '#46547a' : '#ffffff';
      const d = s > 22 ? 2 : 1.5;
      for (let grp = 0; grp < 4; grp++) {
        ctx.globalAlpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(sec * (0.5 + grp * 0.17) + grp * 1.7));
        const stars = starsFor(cols, rows);
        for (let i = grp; i < stars.length; i += 4) { const st = stars[i]; if (st[2] > 0.7) ctx.fillRect(x + st[0] * w - d / 2, y + st[1] * h - d / 2, d, d); }
      }
      ctx.globalAlpha = 1;
    } else if (id === 'belt') {
      // The conveyor: faint diagonal treads sliding slowly toward the bottom.
      const key = Math.round(s * 10) + (light ? 'l' : 'd');
      let tile = beltCache.get(key);
      const step = Math.max(8, s * 1.4);
      if (!tile) {
        tile = makeCanvas(Math.ceil(step * 2), Math.ceil(step * 2));
        const c2 = tile.getContext('2d');
        c2.strokeStyle = light ? 'rgba(190,140,30,0.12)' : 'rgba(242,193,78,0.07)'; c2.lineWidth = step * 0.36;
        for (let k = -2; k <= 4; k++) { c2.beginPath(); c2.moveTo(k * step, 0); c2.lineTo(k * step - step * 2, step * 2); c2.stroke(); }
        beltCache.set(key, tile);
      }
      const off = (sec * s * 0.6) % step;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const tw = tile.width;
      for (let yy = y - tw + off; yy < y + h; yy += tw) for (let xx = x - off; xx < x + w + tw; xx += tw) ctx.drawImage(tile, xx, yy);
      ctx.restore();
    }
  }

  /**
   * Draws the well with its backdrop: the tray (cached), a moving backdrop if the look has one, then the cached light
   * and shadow over it. Returns the well's rectangle.
   */
  function drawWell(ctx, id, board, s, cols, rows, theme, t) {
    const wr = wellRect(board, s), dpr = ctx.__dpr || 1, light = theme.name === 'light';
    const live = ANIMATED_BACKDROPS.has(id);
    const pad = 28, lw = wr.w + pad * 2, lh = wr.h + pad * 2, ox = wr.x - pad, oy = wr.y - pad;
    const local = { x: board.x - ox, y: board.y - oy, w: board.w, h: board.h }, lwr = { x: pad, y: pad, w: wr.w, h: wr.h, r: wr.r };
    const tkey = [theme.name, theme.accent, theme.wellTop, lw, lh, s, cols, rows, dpr].join('|');
    const base = layer('base|' + id + '|' + tkey, lw, lh, dpr, (c) => {
      // The tray: a drop shadow under it, a vertical wash of the well's colour.
      c.save();
      c.shadowColor = theme.drop || 'rgba(0,0,0,0.35)'; c.shadowBlur = light ? 18 : 22; c.shadowOffsetY = light ? 6 : 8;
      c.fillStyle = theme.wellBottom || theme.well; rr(c, lwr.x, lwr.y, lwr.w, lwr.h, lwr.r); c.fill();
      c.restore();
      c.save(); rr(c, lwr.x, lwr.y, lwr.w, lwr.h, lwr.r); c.clip();
      const g = c.createLinearGradient(0, lwr.y, 0, lwr.y + lwr.h);
      g.addColorStop(0, theme.wellTop || theme.well); g.addColorStop(1, theme.wellBottom || theme.well);
      c.fillStyle = g; c.fillRect(lwr.x, lwr.y, lwr.w, lwr.h);
      paintBackdrop(c, id, local, s, cols, rows, theme, dpr);
      c.restore();
    });
    const over = layer('over|' + tkey, lw, lh, dpr, (c) => {
      c.save(); rr(c, lwr.x, lwr.y, lwr.w, lwr.h, lwr.r); c.clip();
      // Light falling in from above, faintly in the accent.
      const li = c.createRadialGradient(lwr.x + lwr.w / 2, lwr.y - lwr.h * 0.05, 0, lwr.x + lwr.w / 2, lwr.y - lwr.h * 0.05, lwr.h * 0.62);
      li.addColorStop(0, rgba(theme.accent, light ? 0.07 : 0.085)); li.addColorStop(1, rgba(theme.accent, 0));
      c.fillStyle = li; c.fillRect(lwr.x, lwr.y, lwr.w, lwr.h);
      // The shadow under the top edge, and a whisper of one down each side: the well is deep.
      const sh = c.createLinearGradient(0, lwr.y, 0, lwr.y + s * 1.1);
      sh.addColorStop(0, theme.innerShade || 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sh; c.fillRect(lwr.x, lwr.y, lwr.w, s * 1.1);
      for (const [x0, x1] of [[lwr.x, lwr.x + s * 0.5], [lwr.x + lwr.w, lwr.x + lwr.w - s * 0.5]]) {
        const sd = c.createLinearGradient(x0, 0, x1, 0);
        sd.addColorStop(0, light ? 'rgba(20,30,60,0.05)' : 'rgba(0,0,0,0.16)'); sd.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sd; c.fillRect(Math.min(x0, x1), lwr.y, s * 0.5, lwr.h);
      }
      c.restore();
    });
    ctx.drawImage(base, ox, oy, lw, lh);
    if (live) {
      ctx.save(); rr(ctx, wr.x, wr.y, wr.w, wr.h, wr.r); ctx.clip();
      paintBackdropLive(ctx, id, board, s, cols, rows, theme, t);
      ctx.restore();
    }
    ctx.drawImage(over, ox, oy, lw, lh);
    return wr;
  }

  /** The well's rim: a fine line, and a thread of light just inside its top edge. */
  function drawRim(ctx, wr, theme) {
    ctx.save();
    ctx.strokeStyle = theme.rim || theme.line; ctx.lineWidth = 1;
    rr(ctx, wr.x + 0.5, wr.y + 0.5, wr.w - 1, wr.h - 1, wr.r); ctx.stroke();
    ctx.strokeStyle = theme.rimHi || 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(wr.x + wr.r, wr.y + wr.h - 1.5); ctx.lineTo(wr.x + wr.w - wr.r, wr.y + wr.h - 1.5); ctx.stroke();
    ctx.restore();
  }

  /** A frame around the well (the rim is always there; Hairline is the rim alone). `r` is the well's rectangle. */
  function drawFrame(ctx, id, r, accent, t, theme) {
    if (!id || id === 'hairline') return;
    ctx.save();
    const { x, y, w, h } = r, R = r.r || 8;
    if (id === 'double') {
      // Inlay: a fine line of the accent set a little way out, like a mount around a picture.
      ctx.strokeStyle = rgba(accent, 0.75); ctx.lineWidth = 1;
      rr(ctx, x - 3.5, y - 3.5, w + 7, h + 7, R + 3.5); ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.28);
      rr(ctx, x - 6.5, y - 6.5, w + 13, h + 13, R + 6.5); ctx.stroke();
    } else if (id === 'glow') {
      ctx.shadowColor = accent; ctx.shadowBlur = 12; ctx.strokeStyle = rgba(accent, 0.9); ctx.lineWidth = 1.5;
      rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, R + 1.5); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.75; ctx.stroke();
    } else if (id === 'brass') {
      const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
      g.addColorStop(0, '#f6e0a0'); g.addColorStop(0.3, '#b8862d'); g.addColorStop(0.55, '#f2d98f'); g.addColorStop(0.8, '#9a7024'); g.addColorStop(1, '#d9b867');
      ctx.strokeStyle = g; ctx.lineWidth = 5; rr(ctx, x - 3, y - 3, w + 6, h + 6, R + 3); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,10,0.55)'; ctx.lineWidth = 1; rr(ctx, x - 0.5, y - 0.5, w + 1, h + 1, R); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,245,210,0.55)'; rr(ctx, x - 5.5, y - 5.5, w + 11, h + 11, R + 5.5); ctx.stroke();
    } else if (id === 'rainbow') {
      // A slow ring of spectrum turning round the well (one turn in twelve seconds); soft, never neon.
      const cx = x + w / 2, cy = y + h / 2, ang = ((t || 0) / 12000) * Math.PI * 2;
      let g;
      if (ctx.createConicGradient) {
        g = ctx.createConicGradient(ang, cx, cy);
        for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, RAINBOW[k % 6]);
      } else {
        g = ctx.createLinearGradient(cx + Math.cos(ang) * w, cy + Math.sin(ang) * h, cx - Math.cos(ang) * w, cy - Math.sin(ang) * h);
        for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, RAINBOW[k % 6]);
      }
      ctx.strokeStyle = g; ctx.lineWidth = 3; rr(ctx, x - 2.5, y - 2.5, w + 5, h + 5, R + 2.5); ctx.stroke();
      ctx.globalAlpha = 0.3; ctx.lineWidth = 7; rr(ctx, x - 4, y - 4, w + 8, h + 8, R + 4); ctx.stroke();
    } else if (id === 'hazard') {
      ctx.beginPath(); rrPath(ctx, x - 7, y - 7, w + 14, h + 14, R + 7); rrPath(ctx, x - 0.5, y - 0.5, w + 1, h + 1, R); ctx.clip('evenodd');
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
      ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 5;
      ctx.beginPath();
      for (let k = -h - 16; k < w + h + 16; k += 14) { ctx.moveTo(x - 8 + k, y - 8); ctx.lineTo(x - 8 + k + h + 16, y + h + 8); }
      ctx.stroke();
    }
    ctx.restore();
  }
  const RAINBOW = ['#f28b8b', '#f5c26b', '#b9e27a', '#6fd6c8', '#7fa7f5', '#c49af2'];

  /** Kept for the shop's and factory's small boards: the well and its backdrop in one call (no moving parts). */
  function drawBackdrop(ctx, id, r, s, cols, rows, theme, t) { return drawWell(ctx, id, r, s, cols, rows, theme, t); }

  function ghostCell(ctx, style, color, x, y, s) {
    if (style === 'off') return;
    ctx.save();
    const lw = Math.max(1, s * 0.07), g = Math.max(1, s * 0.06), r = s * 0.16;
    if (style === 'dotted') {
      ctx.strokeStyle = rgba(color, 0.85); ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.lineCap = 'round';
      const d = ctx.lineWidth; ctx.setLineDash([0.01, d * 2.4]);
      rr(ctx, x + g + d / 2, y + g + d / 2, s - 2 * g - d, s - 2 * g - d, r); ctx.stroke();
    } else if (style === 'soft') {
      ctx.fillStyle = rgba(color, 0.24); rr(ctx, x + g, y + g, s - 2 * g, s - 2 * g, r); ctx.fill();
    } else if (style === 'glow') {
      ctx.shadowColor = color; ctx.shadowBlur = s * 0.45;
      ctx.strokeStyle = rgba(color, 0.95); ctx.lineWidth = Math.max(1.25, s * 0.06);
      rr(ctx, x + g + 1, y + g + 1, s - 2 * g - 2, s - 2 * g - 2, r); ctx.stroke();
    } else {
      ctx.fillStyle = rgba(color, 0.05); rr(ctx, x + g, y + g, s - 2 * g, s - 2 * g, r); ctx.fill();
      ctx.strokeStyle = rgba(color, 0.62); ctx.lineWidth = lw;
      rr(ctx, x + g + lw / 2, y + g + lw / 2, s - 2 * g - lw, s - 2 * g - lw, r); ctx.stroke();
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
          for (let k = 0; k < 3; k++) this.parts.push({ kind: 'star', x: cx + (Math.random() - 0.5) * s, y: cy + (Math.random() - 0.5) * s, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 40, g: 0, life: 0, max: 0.7 + Math.random() * 0.5, size: s * (0.18 + Math.random() * 0.15), color: this.light ? shade(c.color, -0.25) : '#fffbe6' });
        } else if (kind === 'shatter') {
          for (let k = 0; k < 4; k++) {
            const ox = (k % 2) - 0.5, oy = Math.floor(k / 2) - 0.5;
            this.parts.push({ kind: 'shard', x: cx + ox * s / 2, y: cy + oy * s / 2, vx: ox * (60 + Math.random() * 90), vy: -60 - Math.random() * 120 + oy * 40, g: 700, life: 0, max: 0.9, size: s / 2, color: c.color, rot: 0, vr: (Math.random() - 0.5) * 12 });
          }
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
        // Too wide for the well (a narrow board): on two lines (PERFECT / CLEAR), and smaller if still too wide,
        // never under 8 px.
        let lines = [f.str], size = f.size;
        if (this.maxW) {
          const tw = ctx.measureText(f.str).width;
          if (tw > this.maxW) {
            const sp = [...f.str].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i > 0);
            if (sp.length) {
              const mid = sp.reduce((a, i) => (Math.abs(i - f.str.length / 2) < Math.abs(a - f.str.length / 2) ? i : a));
              lines = [f.str.slice(0, mid).trim(), f.str.slice(mid + 1).trim()];
            }
            const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
            if (lw > this.maxW) size = Math.max(8, Math.floor(f.size * this.maxW / lw));
            ctx.font = '700 ' + size + 'px ' + FONT;
          }
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // On the light well a pale callout is deepened and haloed in white; on the dark one it keeps a dark halo.
        ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = this.light ? 'rgba(255,255,255,0.9)' : 'rgba(8,11,18,0.55)';
        const yy = f.y - k * 18, lh = Math.round(size * 1.1);
        ctx.fillStyle = this.light && luminance(f.color) > 0.55 ? shade(f.color, -0.5) : f.color;
        lines.forEach((l, i) => {
          const ly = yy + (i - (lines.length - 1) / 2) * lh;
          ctx.strokeText(l, f.x, ly);
          ctx.fillText(l, f.x, ly);
        });
        ctx.restore();
      }
    }
  }

  const FONT = '"Lull Line", "Lull Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

  // ---- piece previews -------------------------------------------------------------------------------------------------

  /** The cells of a piece as a preview draws them. */
  function previewCells(entry) {
    const type = Pieces.get(entry.id);
    if (!type) return null;
    return L.SINGLE_SPECIALS && L.SINGLE_SPECIALS.has(entry.special) ? [[0, 0]] : type.rots[entry.rot || 0];
  }

  /** The share of maxCell a piece's cells can have and still fit the box (at most 1). */
  function fitOf(entry, box, maxCell) {
    const cells = previewCells(entry);
    if (!cells) return 1;
    const b = Pieces.boundsOf(cells);
    return Math.min(1, (box.w - 4) / b.w / maxCell, (box.h - 4) / b.h / maxCell);
  }

  /** A queue slot's box for its piece, and the largest cell there (the piece coming first is drawn largest). */
  const queueBox = (box) => ({ x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 8 });
  const queueCell = (i, s) => (i === 0 ? s * 0.62 : s * 0.46);

  /**
   * Draws a piece (by queue entry) fitted and centred in a box, its cells at most maxCell (times look.scale, when
   * pieces share a scale). Returns the drawn size.
   */
  function drawPieceIn(ctx, entry, box, maxCell, look) {
    const type = Pieces.get(entry.id);
    if (!type) return null;
    const special = entry.special;
    const single = L.SINGLE_SPECIALS && L.SINGLE_SPECIALS.has(special);
    const cells = previewCells(entry);
    const b = Pieces.boundsOf(cells);
    const s = Math.floor(Math.min(maxCell * (look.scale || 1), (box.w - 4) / b.w, (box.h - 4) / b.h));
    const ox = box.x + (box.w - b.w * s) / 2, oy = box.y + (box.h - b.h * s) / 2;
    const color = look.color(type.color);
    for (const [cx, cy] of cells) {
      const x = Math.round(ox + (cx - b.minX) * s), y = Math.round(oy + (b.maxY - cy) * s);
      if (single) drawSpecial(ctx, special, x, y, s, look.t);
      // A view part's painter (look.paint, from BoardView.trayLook) draws the tray's blocks in its own look.
      else if (!look.paint || look.paint(ctx, type.color, x, y, s, { x: cx, y: cy, cells, alpha: look.alpha }) === false) drawCell(ctx, look.skin, color, x, y, s, look.alpha);
    }
    return { w: b.w * s, h: b.h * s, cell: s };
  }

  /**
   * A board drawn small (the Custom window's preview), on whole device pixels, where the box is (canvas pixels), c
   * pixels a cell: the empty well's wash and, at 4 px a cell or more, its grid. Then each view part's
   * preview(ctx, geom, recipe, theme) draws over it (geom: { x, y, c, w, h, dpr }, the cells' top-left in canvas pixels).
   */
  function previewBoard(ctx, box, w, h, recipe, theme, o) {
    o = o || {};
    const c = o.cell;
    ctx.save();
    ctx.translate(box.x, box.y);
    const W = w * c, H = h * c;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, theme.wellTop || theme.well); gr.addColorStop(1, theme.wellBottom || theme.well);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (c >= 4) {
      ctx.fillStyle = theme.grid || theme.line;
      for (let x = 1; x < w; x++) ctx.fillRect(x * c, 0, 1, H);
      for (let y = 1; y < h; y++) ctx.fillRect(0, y * c, W, 1);
    }
    const geom = { x: 0, y: 0, c, w, h, dpr: o.dpr || 1 };
    for (const p of viewParts()) if (p.preview) { ctx.save(); p.preview(ctx, geom, recipe, theme); ctx.restore(); }
    ctx.restore();
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
      this.parts = []; this.claimers = []; this.rest = null;
      // A controller's view other than the one board ('single'): a view part with that layout draws the whole frame.
      this.layoutName = 'single';
    }

    attach(game, view) {
      this.game = game;
      this.view = Object.assign({ rot: 0, fog: false, mono: false, blind: false, vanish: false, wrap: false }, view || {});
      // Classic's top out (ClassicMode.startPile): the pieces piled up at the spawn spot, over the stack, [{ cells,
      // color, t }] in the order they came, shown at pileT (seconds); queueSkip of them came off the Next pieces.
      this.pileup = null; this.pileT = 0; this.queueSkip = 0;
      this.fx.clear();
      this.lay = null;
      this.dirty = true;
      this.refreshParts();
    }

    /** The recipe's view parts on this board (Recipe.viewPart), and its cell painters in their order. */
    refreshParts() {
      this.parts = activeViews(this.game);
      this.claimers = this.parts.filter((p) => typeof p.claims === 'function' && p.cell);
      this.rest = this.parts.find((p) => p.claims === 'rest' && p.cell) || null;
      this.painting = this.claimers.length > 0 || !!this.rest;
    }

    /** Every active view part's hook `name`, called as hook(view, ...args), in order. */
    partsCall(name, ...args) { for (const p of this.parts) if (typeof p[name] === 'function') p[name](this, ...args); }

    /**
     * A cell drawn by the view parts' painters: the first whose claims(v) is true, then the 'rest' painter for an own
     * cell (not FOREIGN) or a piece's; false when none drew it (the caller draws it as always).
     */
    paintCell(ctx, v, x, y, s, kind, at) {
      if (kind === 'stack') for (const p of this.claimers) if (p.claims(v, this) && p.cell(ctx, v, x, y, s, kind, this, at) !== false) return true;
      const r = this.rest;
      if (r && !(kind === 'stack' && v & CELL.FOREIGN) && r.cell(ctx, v, x, y, s, kind, this, at) !== false) return true;
      return false;
    }

    /** The view's own frame for a controller layout other than one board ('battle'), or null. */
    shell() {
      if (this.layoutName === 'single') return null;
      return viewParts().find((p) => p.layout === this.layoutName && typeof p.render === 'function') || null;
    }

    /** One cell of the piece in play (its look, gold, a tool's marks), at pa of its opacity (pieceAlpha). */
    pieceCell(ctx, p, cx, cy, pa, o) {
      const { s, now, look, color, golden, overlapping, pieceCells } = o;
      const [sx, sy] = this.toScreen(cx, cy);
      if (L.SINGLE_SPECIALS && L.SINGLE_SPECIALS.has(p.special)) { drawSpecial(ctx, p.special, sx, sy, s, now); return; }
      const tint = golden ? '#f2c14e' : color;
      // Phasing: translucent, and it shimmers (more faintly still while inside other blocks).
      const shimmer = p.special === 'phase' && !this.reducedMotion ? 0.12 * Math.sin(now / 170 + (cx + cy) * 0.9) : 0;
      // A view part's painter draws a plain piece in its own look (Physics); gold and the tools keep theirs.
      if (!this.rest || p.special || golden || !this.paintCell(ctx, p.type.color, sx, sy, s, 'piece', { x: cx, y: cy, cells: pieceCells })) drawCell(ctx, look.skin, tint, sx, sy, s, (p.special === 'phase' ? (overlapping ? 0.4 : 0.72) + shimmer : 1) * pa);
      if (pa !== 1) ctx.globalAlpha = pa;
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

    /**
     * A tray slot's length along dir, in tray cells: `base` (today's), or longer where a view part asks (traySlot) for
     * this entry.
     */
    slotCells(entry, slot, dir, base) {
      if (!entry || !this.parts.length) return base;
      let c = base;
      for (const p of this.parts) if (typeof p.traySlot === 'function') { const v = p.traySlot(this.trayEntry(entry), this, slot, dir); if (typeof v === 'number' && isFinite(v) && v > c) c = v; }
      return c;
    }

    /** The Hold box as drawn: the layout's, grown down (within the plate) where the held piece asks for it (traySlot). */
    holdBox() {
      const lay = this.lay, b = lay.hold, g = this.game;
      if (!this.parts.length || !g || !g.hold || !lay.wide) return b;
      const want = Math.round(lay.ts * this.slotCells(g.hold, 'hold', 'v', b.h / lay.ts));
      const room = lay.plate.y + lay.plate.h - lay.pad - b.y;
      const hh = Math.max(b.h, Math.min(want, room));
      return hh === b.h ? b : Object.assign({}, b, { h: hh });
    }

    /** A tray's entry, turned as a view part asks (trayRot). */
    trayEntry(e) {
      if (!e) return e;
      for (const p of this.parts) if (p.trayRot) { const r = p.trayRot(e, this); if (r != null && r !== (e.rot || 0)) return Object.assign({}, e, { rot: r }); }
      return e;
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

    /**
     * The board as one composed unit: a plate holding the well, with Hold and Next in recessed trays beside it (or,
     * when the window is tall and narrow, above it). The side columns are slim so the grid gets the room.
     */
    /** The rows shown (shownRows): the board's height unless a view part shows fewer. */
    shownRows() {
      const g = this.game;
      let v = g.h;
      for (const p of this.parts || []) if (typeof p.shownRows === 'function') { const r = p.shownRows(this); if (r > 0 && r < v) v = r; }
      return v;
    }

    layout(box) {
      const g = this.game;
      const rot = this.view.rot, gh = this.shownRows();
      const cols = rot % 180 === 0 ? g.w : gh, rows = rot % 180 === 0 ? gh : g.w;
      // Into a part of the canvas when given one (a view with more than one board), else the whole of it.
      const W = box ? box.w : this.cssW, H = box ? box.h : this.cssH, m = 8, ox = box ? box.x : 0, oy = box ? box.y : 0;
      const side = 2.7, gap = 0.4, pad = 0.42, wp = 0.2, top = 2.9;
      // The side trays never go narrower than this (a tall board's cells can be a few pixels; HOLD and NEXT still fit).
      const SW_MIN = 36;
      const hs = g.mods.noHold ? 0 : 1; // no hold slot (most puzzles): no column for it
      /** The cell size for a grid of c × r: beside the trays (A) or under them (B). */
      const fit = (c, r) => {
        let sA = Math.min((W - 2 * m) / (c + (1 + hs) * (side + gap) + 2 * pad + 2 * wp), (H - 2 * m) / (r + 2 * pad + 2 * wp));
        if (sA * side < SW_MIN) sA = Math.min((W - 2 * m - (1 + hs) * SW_MIN) / (c + (1 + hs) * gap + 2 * pad + 2 * wp), (H - 2 * m) / (r + 2 * pad + 2 * wp));
        const sB = Math.min((W - 2 * m) / (c + 2 * pad + 2 * wp), (H - 2 * m) / (r + top + gap + 2 * pad + 2 * wp));
        return { sA, sB, wide: sA >= sB * 0.9 };
      };
      const f = fit(cols, rows);
      let wide = f.wide, s = Math.max(4, Math.floor(wide ? f.sA : f.sB));
      // A small board is drawn no larger than cellCap times a Standard board's cells in the same space, so a 4 × 8 board
      // is a small board, not a few giant blocks (Free Play sets it; puzzles keep their own sizes). Held to that size,
      // it keeps its trays beside it when they fit there.
      if (this.opts.cellCap) {
        const S = L.Library ? L.Library.STANDARD : { w: 10, h: 20 }, std = fit(S.w, S.h), cap = Math.floor(this.opts.cellCap * (std.wide ? std.sA : std.sB));
        if (cap < s) { s = Math.max(4, cap); if (s <= Math.floor(f.sA)) wide = true; }
      }
      // The trays' own scale: the board's, or larger when the board's cells are too small for them to read.
      const sw = Math.max(Math.round(side * s), SW_MIN), ts = Math.max(s, Math.floor(sw / side));
      const bw = cols * s, bh = rows * s, P = Math.round(pad * s), G = Math.round(gap * s), WP = Math.max(3, Math.round(s * 0.16));
      const lab = Math.round(Math.max(16, ts * 0.72)); // the label row over each tray
      let plate, bx, by, hold, next, nextDir;
      if (wide) {
        const pw = P * 2 + (sw + G) * (1 + hs) + bw + WP * 2, ph = P * 2 + bh + WP * 2;
        plate = { x: ox + Math.round((W - pw) / 2), y: oy + Math.round((H - ph) / 2), w: pw, h: ph };
        bx = plate.x + P + (sw + G) * hs + WP; by = plate.y + P + WP;
        const ty = plate.y + P + lab;
        hold = { x: plate.x + P, y: ty, w: sw, h: Math.round(sw * 0.82) };
        next = { x: bx + bw + WP + G, y: ty, w: sw, h: Math.max(Math.round(ts * 2.5), bh + WP * 2 - lab) };
        nextDir = 'v';
      } else {
        const th = Math.max(Math.round(top * s) - lab, Math.round(ts * 1.6));
        const pw = P * 2 + bw + WP * 2, ph = P * 2 + lab + th + G + bh + WP * 2;
        plate = { x: ox + Math.round((W - pw) / 2), y: oy + Math.round((H - ph) / 2), w: pw, h: ph };
        bx = plate.x + P + WP; by = plate.y + P + lab + th + G + WP;
        const ty = plate.y + P + lab, iw = bw + WP * 2;
        hold = { x: plate.x + P, y: ty, w: Math.round(iw * 0.3), h: th };
        // No hold slot (most puzzles): the queue takes the whole width.
        const nx = g.mods.noHold ? 0 : hold.w + G;
        next = { x: plate.x + P + nx, y: ty, w: iw - nx, h: th };
        nextDir = 'h';
      }
      // A wide board's plate can be shorter than the Next tray it holds (a short board beside a column of trays).
      if (wide) plate.h = Math.max(plate.h, next.y + next.h + P - plate.y);
      this.lay = { s, ts, cols, rows, board: { x: bx, y: by, w: bw, h: bh }, hold, next, nextDir, wide, plate, lab, pad: P, box: box || null, gh };
      // Words over the board (SPOTLESS, a combo's name) are kept within the well (its walls included).
      this.fx.maxW = bw + WP * 2;
      this.lay.well = wellRect(this.lay.board, s);
      return this.lay;
    }

    /** Top-left of logical cell (x, y) on screen. */
    toScreen(x, y) {
      const { s, board } = this.lay, g = this.game, rot = this.view.rot, gh = this.lay.gh || g.h;
      let c, r;
      if (rot === 0) { c = x; r = gh - 1 - y; }
      else if (rot === 180) { c = g.w - 1 - x; r = y; }
      else if (rot === 90) { c = y; r = x; }
      else { c = gh - 1 - y; r = g.w - 1 - x; }
      return [board.x + c * s, board.y + r * s];
    }

    /** Logical column under a screen point (CSS px), or null outside the board. */
    /** Logical cell under a screen point (CSS px), or null outside the board. */
    cellAt(px, py) {
      if (!this.lay || !this.game) return null;
      const { s, board } = this.lay, g = this.game, rot = this.view.rot, gh = this.lay.gh || g.h;
      if (px < board.x || py < board.y || px >= board.x + board.w || py >= board.y + board.h) return null;
      const c = Math.floor((px - board.x) / s), r = Math.floor((py - board.y) / s);
      if (rot === 0) return { x: c, y: Math.floor(gh - 1 - r) };
      if (rot === 180) return { x: g.w - 1 - c, y: r };
      if (rot === 90) return { x: r, y: c };
      return { x: g.w - 1 - r, y: Math.floor(gh - 1 - c) };
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
      const b = this.holdBox();
      return px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4;
    }

    /** Is a screen point on the hold box, for a finger: its hit area grown to at least 44 × 44, centred on it? */
    onHoldTouch(px, py) {
      if (!this.lay || !this.game || this.game.mods.noHold) return false;
      const b = this.holdBox(), w = Math.max(b.w, 44), h = Math.max(b.h, 44);
      return Math.abs(px - (b.x + b.w / 2)) <= w / 2 && Math.abs(py - (b.y + b.h / 2)) <= h / 2;
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

    needsFrame() {
      const g = this.game;
      if (this.dirty || this.fx.active || this.alive || (g && g.piece && (g.piece.special || (g.s && g.s.gold > 0))) || (this.look && this.look.animated)) return true;
      for (const p of this.parts) if (p.busy && p.busy(this, performance.now())) return true;
      const sh = this.shell();
      return !!(sh && sh.busy && sh.busy(this, performance.now()));
    }

    /**
     * One frame: the canvas cleared, then the board unit (its plate, then paint), or, for a controller layout of its
     * own ('battle'), that view part's render(view, ctx, now), which lays out and paints boards into boxes itself.
     */
    render(now) {
      if (!this.game || !this.look || !this.cssW) return;
      now = clock(now);
      const ctx = this.ctx, look = this.look;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.__dpr = this.dpr; ctx.__light = look.theme.name === 'light';
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      const sh = this.shell();
      if (sh) sh.render(this, ctx, now);
      else {
        if (!this.lay || this.lay.box) this.layout();
        this.drawPlate(ctx);
        this.paint(ctx, null, now);
      }
      this.dirty = false;
    }

    /**
     * The board unit drawn into its layout (the plate aside): the well, the stack, the piece and its ghost, the rim,
     * the trays and the effects. box: a part of the canvas to lay it out in (see layout), or null for the whole.
     */
    paint(ctx, box, now) {
      const look = this.look, g = this.game;
      const same = (a, b) => (!a && !b) || (a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
      if (!this.lay || !same(this.lay.box, box) || this.lay.gh !== this.shownRows()) this.layout(box);
      const { s, board, cols, rows } = this.lay;
      // Shake moves only the board and its effects (never the hold and queue beside it), and stays small.
      const shake = FREEZE != null ? 0 : Math.min(8, this.fx.shake), shx = shake > 0.2 ? (Math.random() - 0.5) * shake : 0, shy = shake > 0.2 ? (Math.random() - 0.5) * shake : 0;
      ctx.save();
      if (shx || shy) ctx.translate(shx, shy);

      const tl = look.still ? 0 : now;
      this.fx.light = look.theme.name === 'light';
      if (look.prism && !look.still) look.colors = forWell(paletteColors(look.palette, now), look.theme.name);
      const wr = drawWell(ctx, look.backdrop, board, s, cols, rows, look.theme, tl);
      // Rows over the ones shown (a shut or opening buffer) are clipped away until the rim.
      const clipped = this.lay.gh < g.h;
      if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(board.x, board.y, board.w, board.h); ctx.clip(); }
      const p = g.piece;
      const pieceCells = p ? g.absCells(p) : [];
      const gy = p ? g.ghostY(p) : null;
      // A Classic board with its ghost off (view.noGhost) draws none.
      const ghostCells = p && gy != null && gy !== p.y && !this.view.noGhost ? g.absCells(p, p.rot, p.x, gy) : [];

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
          if (!this.painting || !this.paintCell(ctx, v, sx, sy, s, 'stack', { x, y })) drawCell(ctx, look.skin, this.colorOf(v), sx, sy, s);
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
      if (this.parts.length) this.partsDraw('overStack', ctx, now);

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

      if (p && !this.pileup) {
        const color = this.colorOf(p.type.color);
        if (p.special === 'drill') {
          // What goes: the drill's column (each, where the recipe drills more than one: targets).
          ctx.fillStyle = 'rgba(255,90,90,0.16)';
          for (const [cx, cy] of (g.targets ? g.targets('bore', [pieceCells[0]]) : [pieceCells[0]])) for (let y = cy - 1; y >= 0; y--) { const [sx, sy] = this.toScreen(cx, y); ctx.fillRect(sx, sy, s, s); }
        } else if (p.special === 'bomb' && gy != null) {
          // What goes: the bomb's diamond where it will land (each, where the recipe sets off more than one: targets).
          ctx.fillStyle = 'rgba(255,159,67,0.14)';
          const at = g.hooks && g.hooks.targets && g.targets ? g.targets('bomb', [[pieceCells[0][0], gy]]) : [[pieceCells[0][0], gy]], seen = at.length > 1 ? new Set() : null;
          for (const [cx, cy] of at) for (const [dx, dy] of L.BOMB_PATTERN) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || x >= g.w || y < 0 || y >= g.h) continue;
            if (seen) { if (seen.has(x + ',' + y)) continue; seen.add(x + ',' + y); }
            const [sx, sy] = this.toScreen(x, y); ctx.fillRect(sx, sy, s, s);
          }
          if (look.ghost !== 'off') for (const [gx, gy2] of ghostCells) { const [sx, sy] = this.toScreen(gx, gy2); ghostCell(ctx, look.ghost, '#ff9f43', sx, sy, s); }
        } else if (look.ghost !== 'off') {
          const ga = this.rest ? { cells: ghostCells, style: look.ghost } : null;
          for (const [cx, cy] of ghostCells) {
            const [sx, sy] = this.toScreen(cx, cy);
            if (!ga || !this.paintCell(ctx, p.type.color, sx, sy, s, 'ghost', Object.assign({ x: cx, y: cy }, ga))) ghostCell(ctx, look.ghost, color, sx, sy, s);
          }
        }
        if (p.special === 'laser' && ghostCells.length) {
          // The beam to come: a faint red line across every row the piece will land in.
          const rowsL = new Set(ghostCells.map(([, cy]) => cy));
          const pulse = 0.12 + 0.08 * Math.sin(now / 120);
          for (const y of rowsL) { const [ax, ay] = this.toScreen(0, y), [bx, by] = this.toScreen(g.w - 1, y); ctx.fillStyle = 'rgba(255,60,80,' + pulse + ')'; ctx.fillRect(Math.min(ax, bx), Math.min(ay, by) + s * 0.35, Math.abs(bx - ax) + s, s * 0.3); }
          this.alive = true;
        }
        const overlapping = p.special === 'phase' && !g.fitShape(p, p.rot, p.x, p.y);
        // Gold on the board (Free Play) gilds whatever plain piece is in play.
        const golden = !p.special && g.s && g.s.gold > 0;
        // A view part can draw some of the piece's cells fainter (pieceAlpha: Mirror's copy, the cells past the piece's own).
        const nOwn = p.type.rots[p.rot].length;
        const alphaOf = this.parts.some((vp) => typeof vp.pieceAlpha === 'function') ? (i, cx, cy) => {
          let a = 1;
          for (const vp of this.parts) if (typeof vp.pieceAlpha === 'function') { const v = vp.pieceAlpha(this, p, [cx, cy], i >= nOwn); if (typeof v === 'number' && isFinite(v)) a *= clamp(v, 0, 1); }
          return a;
        } : null;
        for (let i = 0; i < pieceCells.length; i++) {
          const [cx, cy] = pieceCells[i];
          const pa = alphaOf ? alphaOf(i, cx, cy) : 1;
          if (pa !== 1) { ctx.save(); ctx.globalAlpha = pa; }
          this.pieceCell(ctx, p, cx, cy, pa, { s, now, look, color, golden, overlapping, pieceCells });
          if (pa !== 1) ctx.restore();
        }
      }

      if (this.parts.length) this.partsDraw('overPiece', ctx, now);
      if (this.pileup) this.drawPileup(ctx, s);
      else if (p && (p.special || (g.s && g.s.gold > 0))) this.ambient(p, pieceCells, now);

      if (clipped) ctx.restore();
      drawRim(ctx, wr, look.theme);
      drawFrame(ctx, look.frame, wr, look.theme.accent, tl, look.theme);
      // Close to the top: the rim breathes red (unless a view part says the rim means nothing here: dangerRim false).
      if (!g.fixed && !this.parts.some((vp) => vp.dangerRim === false) && g.board.stackHeight() > g.h * 0.72) {
        ctx.save(); ctx.strokeStyle = rgba('#eb6f92', 0.35 + 0.25 * Math.sin((look.still ? 0 : now) / 250)); ctx.lineWidth = 2.5;
        rr(ctx, wr.x - 1, wr.y - 1, wr.w + 2, wr.h + 2, wr.r + 1); ctx.stroke(); ctx.restore();
        this.alive = !look.still;
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
      if (this.parts.length) this.partsDraw('overRim', ctx, now);

      ctx.restore();
      this.drawSide(ctx, now);
      ctx.save();
      if (shx || shy) ctx.translate(shx, shy);
      this.fx.draw(ctx);
      ctx.restore();
    }

    /** Each active view part's overlay `name` (overStack, overPiece, overRim), in order, each in its own save. */
    partsDraw(name, ctx, now) { for (const p of this.parts) if (p[name]) { ctx.save(); p[name](ctx, this, now); ctx.restore(); } }

    /** The plate the board unit sits on: a soft raised panel, a hairline, a shadow. Cached with the well's layers. */
    drawPlate(ctx) {
      const { plate } = this.lay, th = this.look.theme, dpr = ctx.__dpr || 1, pad = 60, light = th.name === 'light';
      const R = Math.round(Math.min(20, Math.max(10, this.lay.s * 0.62)));
      const key = ['plate', th.name, th.plate, th.accent, plate.w, plate.h, dpr, R].join('|');
      const img = layer(key, plate.w + pad * 2, plate.h + pad * 2, dpr, (c) => {
        // A soft pool of the accent's light under the whole unit.
        const cx = pad + plate.w / 2, cy = pad + plate.h * 0.42, rad = Math.max(plate.w, plate.h) * 0.62;
        const halo = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
        halo.addColorStop(0, rgba(th.accent, light ? 0.1 : 0.11)); halo.addColorStop(1, rgba(th.accent, 0));
        c.fillStyle = halo; c.fillRect(0, 0, plate.w + pad * 2, plate.h + pad * 2);
        c.save();
        c.shadowColor = th.plateShadow || 'rgba(0,0,0,0.3)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
        c.fillStyle = th.plateBase || th.plate || 'rgba(255,255,255,0.04)';
        rr(c, pad, pad, plate.w, plate.h, R); c.fill();
        c.restore();
        const g = c.createLinearGradient(0, pad, 0, pad + plate.h);
        g.addColorStop(0, th.plate || 'rgba(255,255,255,0.05)'); g.addColorStop(1, th.plate2 || th.plate || 'rgba(255,255,255,0.02)');
        c.fillStyle = g; rr(c, pad, pad, plate.w, plate.h, R); c.fill();
        // The accent, faintly, in the plate's upper edge.
        const tint = c.createLinearGradient(0, pad, 0, pad + plate.h * 0.5);
        tint.addColorStop(0, rgba(th.accent, light ? 0.05 : 0.07)); tint.addColorStop(1, rgba(th.accent, 0));
        c.fillStyle = tint; rr(c, pad, pad, plate.w, plate.h, R); c.fill();
        c.strokeStyle = th.plateLine || th.hair || 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
        rr(c, pad + 0.5, pad + 0.5, plate.w - 1, plate.h - 1, R - 0.5); c.stroke();
        const hi = c.createLinearGradient(pad, 0, pad + plate.w, 0);
        hi.addColorStop(0, 'rgba(255,255,255,0)'); hi.addColorStop(0.5, th.plateHi || 'rgba(255,255,255,0.1)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
        c.strokeStyle = hi; c.beginPath(); c.moveTo(pad + R, pad + 1.5); c.lineTo(pad + plate.w - R, pad + 1.5); c.stroke();
      });
      ctx.drawImage(img, plate.x - pad, plate.y - pad, plate.w + pad * 2, plate.h + pad * 2);
    }

    drawSide(ctx, now) {
      // The trays are drawn at their own scale (the board's, or larger for a board of tiny cells: layout).
      const g = this.game, look = this.look, { ts: s, hold, next, nextDir, lab } = this.lay;
      const th = look.theme;
      ctx.save();
      // Labels: small spaced capitals over each tray, quieter than anything they label.
      const fs = Math.round(Math.max(9, Math.min(11, s * 0.4)));
      ctx.font = '650 ' + fs + 'px ' + FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.12em';
      ctx.textBaseline = 'middle';
      const label = (t, x, y, w, right) => {
        // A narrow column keeps only the count ("4 LEFT") when the name and the count would touch.
        if (right && ctx.measureText(t).width + ctx.measureText(right).width + 14 > w) t = '';
        ctx.fillStyle = th.faint || th.muted; ctx.textAlign = 'left'; ctx.fillText(t, Math.round(x + 3), Math.round(y - lab / 2));
        if (right) { ctx.textAlign = 'right'; ctx.fillStyle = th.muted; ctx.fillText(right, Math.round(x + w - 3), Math.round(y - lab / 2)); ctx.textAlign = 'left'; }
      };
      /** A recessed tray in the well's material: its wash, a shadow under the top edge, a hairline rim. */
      const tray = (b, hot) => {
        const r = Math.round(Math.min(12, Math.max(6, s * 0.36)));
        ctx.save();
        rr(ctx, b.x, b.y, b.w, b.h, r); ctx.clip();
        const gr = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        gr.addColorStop(0, th.wellTop || th.well); gr.addColorStop(1, th.wellBottom || th.well);
        ctx.fillStyle = gr; ctx.fillRect(b.x, b.y, b.w, b.h);
        if (hot) { ctx.fillStyle = rgba(th.accent, 0.12); ctx.fillRect(b.x, b.y, b.w, b.h); }
        const sh = ctx.createLinearGradient(0, b.y, 0, b.y + s * 0.6);
        sh.addColorStop(0, th.innerShade || 'rgba(0,0,0,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sh; ctx.fillRect(b.x, b.y, b.w, s * 0.6);
        ctx.restore();
        ctx.strokeStyle = hot ? rgba(th.accent, 0.8) : (th.rim || th.line); ctx.lineWidth = 1;
        rr(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r); ctx.stroke();
      };
      const pl = { skin: look.skin, color: (c) => (this.view.mono ? look.monoColor : look.colors[c]), t: now };
      // A 'rest' painter draws the trays' blocks too.
      if (this.rest) pl.paint = (c2, v, x, y, sz, at) => this.paintCell(c2, v, x, y, sz, 'tray', at);
      // A tray's piece as drawn: turned as a view part asks (trayEntry).
      const te = (e) => (this.parts.length ? this.trayEntry(e) : e);
      // Hold (grown for a long piece: traySlot; its piece is drawn with the queue's, below)
      const holdB = g.mods.noHold ? null : this.holdBox();
      if (holdB) {
        label('HOLD', holdB.x, holdB.y, holdB.w);
        tray(holdB, this.holdHover);
      }
      const items = []; // the queue's pieces, drawn once every box is known
      // Next: the queue in one tray, the piece coming first and largest, the rest after a hairline.
      // Classic's top out takes the pieces it piles up off the queue as they come.
      const queue = this.queueSkip ? g.queue.slice(this.queueSkip) : g.queue;
      // A view part can show fewer (nextCount: a long piece's blocks would be specks in a later slot); never none.
      let n = Math.min(g.fixed ? queue.length : g.previewCount, queue.length);
      for (const p of this.parts) if (typeof p.nextCount === 'function') { const k = p.nextCount(this); if (Number.isInteger(k) && k >= 1 && k < n) n = k; }
      label('NEXT', next.x, next.y, next.w, g.fixed ? queue.length + ' LEFT' : null);
      if (nextDir === 'v') {
        const first = Math.round(s * this.slotCells(queue[0], 'next', 'v', 2.5)), slot = Math.round(s * 1.95);
        let shown = 0;
        for (let i = 0; i < n; i++) if (first + i * slot <= next.h + 1 || i === 0) shown = i + 1;
        const hh = shown ? Math.min(next.h, first + (shown - 1) * slot + Math.round(s * 0.2)) : Math.round(s * 2.5);
        tray({ x: next.x, y: next.y, w: next.w, h: hh });
        for (let i = 0; i < shown; i++) {
          const y0 = next.y + (i ? first + (i - 1) * slot : 0), h0 = i ? slot : first;
          if (i === 1) { ctx.fillStyle = th.hair || th.line; ctx.fillRect(next.x + s * 0.4, Math.round(y0) + 0.5, next.w - s * 0.8, 1); }
          items.push({ entry: queue[i], box: { x: next.x, y: y0 + (i ? s * 0.1 : s * 0.05), w: next.w, h: h0 }, i });
        }
      } else {
        const first = Math.min(Math.round(s * this.slotCells(queue[0], 'next', 'h', 3.4)), next.w), slot = Math.round(s * 2.8);
        let shown = 0;
        for (let i = 0; i < n; i++) if (first + i * slot <= next.w + 1 || i === 0) shown = i + 1;
        tray({ x: next.x, y: next.y, w: shown ? Math.min(next.w, first + (shown - 1) * slot + Math.round(s * 0.2)) : next.w, h: next.h });
        for (let i = 0; i < shown; i++) {
          const x0 = next.x + (i ? first + (i - 1) * slot : 0), w0 = i ? slot : first;
          if (i === 1) { ctx.fillStyle = th.hair || th.line; ctx.fillRect(Math.round(x0) + 0.5, next.y + s * 0.4, 1, next.h - s * 0.8); }
          items.push({ entry: queue[i], box: { x: x0, y: next.y, w: w0, h: next.h }, i });
        }
      }
      // With big pieces in play, the held and coming pieces share one scale, so a big piece shows twice the size of a
      // tetromino: the largest scale at which each fits its box (at least half the usual size).
      const heldBox = holdB && g.hold ? { entry: te(g.hold), box: holdB, max: s * 0.72 } : null;
      const shownIn = items.map((it) => ({ entry: te(it.entry), box: queueBox(it.box), max: queueCell(it.i, s) }));
      let scale = 1;
      if (!this.view.blind && [g.piece && g.piece.type, g.hold && Pieces.get(g.hold.id)].concat(g.queue.map((e) => Pieces.get(e.id))).some((t) => t && t.big)) {
        for (const it of heldBox ? shownIn.concat([heldBox]) : shownIn) scale = Math.min(scale, fitOf(it.entry, it.box, it.max));
        scale = Math.max(0.5, scale);
      }
      if (heldBox) drawPieceIn(ctx, heldBox.entry, holdB, s * 0.72, Object.assign({}, pl, { alpha: g.holdLocked && !g.freeHold ? 0.35 : 1, scale }));
      this.drawnQueue = [];
      for (const it of items) {
        const d = this.drawQueueItem(ctx, it.entry, it.box, it.i, s, Object.assign({}, pl, { scale }));
        if (d) this.drawnQueue.push(Object.assign({ id: it.entry.id, big: !!Pieces.get(it.entry.id).big }, d));
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.restore();
    }

    /**
     * Classic's top out: the pile's pieces a little see-through, each drawn over the stack and the ones before it,
     * each with its own outline right after it (so a later piece's cells dim the outlines under them). Each piece's
     * outline sits a step further inside its cells than the one before, so where their edges meet they show as
     * separate lines, and the layers read whatever the palette. The shade behind the pile is laid once per cell.
     * Each fades in briefly as it comes (never under reduced motion).
     */
    drawPileup(ctx, s) {
      const look = this.look, light = look.theme.name === 'light';
      const edge = light ? 'rgba(20,24,34,0.55)' : 'rgba(255,255,255,0.78)';
      const shade = light ? 'rgba(20,24,34,0.14)' : 'rgba(0,0,0,0.3)';
      const lw = Math.max(1.5, Math.round(s * 0.08)), o = lw / 2;
      const pile = this.pileup.map((pc, i) => ({
        k: this.reducedMotion || pc.t < 0 ? 1 : Math.max(0, Math.min(1, (this.pileT - pc.t) / 0.16)),
        inset: o + pileInset(i, s, lw),
        color: this.colorOf(pc.color), cells: pc.cells, rects: pc.cells.map(([x, y]) => this.toScreen(x, y)),
      })).filter((pc) => pc.k > 0);
      // Where a piece lies over a block or an earlier piece, it is see-through (what is under it shows); elsewhere
      // nearly solid.
      const g = this.game, under = new Set();
      ctx.save();
      ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineCap = 'round';
      for (const pc of pile) {
        ctx.globalAlpha = pc.k; ctx.fillStyle = shade;
        // One path, so the shade is even where neighbouring cells' rects meet.
        ctx.beginPath();
        pc.cells.forEach(([cx, cy], i) => { if (!under.has(cx + ',' + cy)) { const [x, y] = pc.rects[i]; ctx.rect(x - 1, y - 1, s + 2, s + 2); } });
        ctx.fill();
        ctx.globalAlpha = 1;
        pc.cells.forEach(([cx, cy], i) => {
          const [x, y] = pc.rects[i], over = under.has(cx + ',' + cy) || !!g.board.get(cx, cy);
          drawCell(ctx, look.skin, pc.color, x, y, s, (over ? 0.58 : 0.9) * pc.k);
        });
        for (const [cx, cy] of pc.cells) under.add(cx + ',' + cy);
        // Only the edges with no cell of its own beyond them: the shape's outline, this piece's step inside it.
        const at = new Set(pc.rects.map(([x, y]) => Math.round(x) + ',' + Math.round(y)));
        const has = (x, y) => at.has(Math.round(x) + ',' + Math.round(y));
        const n = pc.inset, f = s - n;
        ctx.globalAlpha = pc.k;
        ctx.beginPath();
        for (const [x, y] of pc.rects) {
          // Where the shape goes on past a side, the line runs the inset into the next cell (it joins that cell's line
          // there, or turns an inner corner); where it does not, it stops at the inset (an outer corner).
          const up = has(x, y - s), dn = has(x, y + s), lf = has(x - s, y), rt = has(x + s, y);
          const x0 = x + (lf ? -n : n), x1 = x + (rt ? s + n : f), y0 = y + (up ? -n : n), y1 = y + (dn ? s + n : f);
          if (!up) { ctx.moveTo(x0, y + n); ctx.lineTo(x1, y + n); }
          if (!dn) { ctx.moveTo(x0, y + f); ctx.lineTo(x1, y + f); }
          if (!lf) { ctx.moveTo(x + n, y0); ctx.lineTo(x + n, y1); }
          if (!rt) { ctx.moveTo(x + f, y0); ctx.lineTo(x + f, y1); }
        }
        ctx.stroke();
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
      return drawPieceIn(ctx, this.parts.length ? this.trayEntry(entry) : entry, queueBox(box), queueCell(i, s), Object.assign({}, pl, { alpha: i === 0 ? 1 : 0.8 }));
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
      if (this.parts.length) this.partsCall('onLock', result, reduced);
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
        // An item the recipe set off at more than one spot (targets: Mirror's pairs) plays once at each.
        if (sp === 'drill' && result.bit) this.perTarget(result, (r) => this.drillFx(r));
        else if (sp === 'laser' && result.laser) this.laserFx(result);
        else if (sp === 'blackhole' && result.center) this.perTarget(result, (r) => this.blackholeFx(r));
        else if (sp === 'bomb' && result.center) this.perTarget(result, (r) => this.blastFx(r));
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
            this.fx.ring((ax + bx) / 2 + s / 2, (ay + by) / 2 + s / 2, look.theme.accent, s * this.game.w * 0.7, { clip: this.lay.well });
          }
        }
        if (!reduced) this.fx.shake = Math.max(this.fx.shake, Math.min(2.5, 0.6 * result.lines));
        const b = this.lay.board;
        if (this.showBank) this.fx.text('+' + L.fmtLines(result.banked || 0) + ' ' + LINE + (result.mult > 1 ? '  ×' + Math.round(result.mult * 1000) / 1000 : ''), b.x + b.w / 2, b.y + b.h * 0.55, '#8fe3ff', Math.max(12, Math.min(18, s * 0.75)));
        const label = labelFor(result);
        if (label) this.fx.text(label, b.x + b.w / 2, b.y + b.h * 0.42, result.perfect ? '#ffe28a' : '#ffffff', Math.max(13, Math.min(22, s * 0.9)));
      } else if (result.twist || result.mini) {
        const b = this.lay.board;
        this.fx.text(result.mini ? 'MINI TWIST' : 'TWIST', b.x + b.w / 2, b.y + b.h * 0.42, '#d6b4ff', Math.max(13, Math.min(20, s * 0.8)));
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
      if (done) { /* animated above */ } else if (result.swallowed && !reduced) this.perTarget(result, (result) => {
        const [cx0, cy0] = this.toScreen(result.center[0], result.center[1]), cx = cx0 + s / 2, cy = cy0 + s / 2;
        for (const c of toCells(result.swallowed)) {
          const dx = c.x + s / 2 - cx, dy = c.y + s / 2 - cy;
          this.fx.parts.push({ kind: 'spiral', cx, cy, ang: Math.atan2(dy, dx), rad: Math.hypot(dx, dy) + 1, w: 5 + Math.random() * 3, pull: 3.2, x: c.x, y: c.y, vx: 0, vy: 0, g: 0, life: 0, max: 0.9, size: s, color: c.color });
        }
        this.fx.ring(cx, cy, '#b48cff', s * 4, { inward: true, max: 0.8, width: 3 });
        this.fx.ring(cx, cy, '#ffb35c', s * 2.5, { max: 0.5 });
        this.fx.shake = Math.max(this.fx.shake, 5);
      });
      else if (result.swallowed) this.fx.burst('fade', toCells(result.swallowed), s, true);
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

    /**
     * An item's effect once for each spot it acted at (result.centers, result.bits: the recipe's targets), each with
     * the cells it took (a drill's: its column; a bomb's or a black hole's: those nearest it); one spot, as it is.
     */
    perTarget(r, fn) {
      const w = this.game ? this.game.w : 0, wrap = !!(this.game && this.game.board.wrap);
      if (r.bits && r.bits.length > 1) {
        for (const bit of r.bits) fn(Object.assign({}, r, { bit, bits: null, drilled: (r.drilled || []).filter(([x]) => x === bit[0]) }));
        return;
      }
      const cs = r.centers;
      if (!cs || cs.length < 2) { fn(r); return; }
      const dist = (x, y, c) => { let dx = Math.abs(x - c[0]); if (wrap) dx = Math.min(dx, w - dx); return dx * dx + (y - c[1]) * (y - c[1]); };
      const near = (x, y) => { let k = 0; cs.forEach((c, i) => { if (dist(x, y, c) < dist(x, y, cs[k])) k = i; }); return k; };
      cs.forEach((center, i) => {
        const part = { center, centers: null };
        if (r.blast) part.blast = r.blast.filter(([x, y]) => near(x, y) === i);
        if (r.swallowed) part.swallowed = r.swallowed.filter(([x, y]) => near(x, y) === i);
        fn(Object.assign({}, r, part));
      });
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
      // An Undo takes back what the last item did, its show included.
      if (id === 'rewind') { if (fx.world) fx.world.clear(); fx.props = []; fx.texts = []; fx.movers = []; }
      if (id === 'rewind') { fx.sweep(b, '#8fd3ff', 'y', 0.55); if (!reduced) fx.text('↶', b.x + b.w / 2, b.y + b.h * 0.4, '#8fd3ff', 30); return; }
      if (!piece || id === 'settle' || id === 'trapdoor' || id === 'tornado' || id === 'flip') return;
      const cells = g.absCells(piece), color = this.colorOf(piece.type.color);
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
    let s = r.twist ? 'TWIST ' + (names[n] || n + ' LINES') : r.mini ? 'MINI TWIST' + (n ? ' ' + names[n] : '') : n >= 4 ? (names[n] || n + ' LINES') : '';
    if (r.perfect) s = 'SPOTLESS';
    if (r.b2b && s) s = 'STREAK ' + s;
    if (r.combo >= 2) s = (s ? s + ' · ' : '') + r.combo + ' COMBO';
    return s;
  }

  /** The look (palette, skin, …) from the save's equipped cosmetics and the theme. */
  const ANIMATED_FRAMES = new Set(['rainbow']);
  function makeLook(equipped, theme, t, still) {
    const pal = PALETTES[equipped.palette] || PALETTES.classic;
    const colors = forWell(paletteColors(equipped.palette, still ? 0 : t), theme.name);
    return {
      colors, palette: equipped.palette, prism: !!pal.animated, skin: equipped.skin, frame: equipped.frame, backdrop: equipped.backdrop, effect: equipped.effect, ghost: equipped.ghost,
      theme, monoColor: theme.mono, still: !!still,
      animated: !still && (!!pal.animated || ANIMATED_FRAMES.has(equipped.frame) || ANIMATED_BACKDROPS.has(equipped.backdrop)),
    };
  }

  L.Render = { rgb, rgba, shade, mix, hsl, luminance, paletteColors, forWell, drawWell, drawRim, wellRect, ANIMATED_BACKDROPS, drawCell, cellSprite, drawFrame, drawBackdrop, ghostCell, drawPieceIn, drawSpecial, drawGem, FX, BoardView, makeLook, rr, FONT, SKIN_PAINT, labelFor, previewBoard, FREEZE, clock, activeViews };
})(typeof globalThis !== 'undefined' ? globalThis : this);
