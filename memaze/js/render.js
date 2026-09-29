/* Memaze — drawing the flat maze floor, markers and pickups on a canvas that sits over the background; plus the minimap. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const TAU = Math.PI * 2;

  // Every capsule is wound the same way, so a single nonzero fill of all of them is their union.
  function capsule(path, ax, ay, bx, by, r) {
    if (ax === bx && ay === by) { path.moveTo(ax + r, ay); path.arc(ax, ay, r, 0, TAU); path.closePath(); return; }
    const a = Math.atan2(by - ay, bx - ax);
    path.moveTo(ax + Math.cos(a + Math.PI / 2) * r, ay + Math.sin(a + Math.PI / 2) * r);
    path.arc(ax, ay, r, a + Math.PI / 2, a + Math.PI * 1.5);
    path.arc(bx, by, r, a - Math.PI / 2, a + Math.PI / 2);
    path.closePath();
  }
  function edgeLine(e) {
    const p = new Path2D();
    p.moveTo(e.pts[0].x, e.pts[0].y);
    for (let i = 1; i < e.pts.length; i++) p.lineTo(e.pts[i].x, e.pts[i].y);
    return p;
  }
  // Item puzzles: each item's colour, and its HUD icon as an image for the canvas (the SVGs live in ui.js).
  const ITEM_TINT = { carpet: '#ffc53d', launch: '#7cf0ff', shrink: '#b8ff6a' };
  const iconImgs = {};
  function itemImg(id) {
    if (iconImgs[id]) return iconImgs[id];
    const svg = MZ.itemIconSVG && MZ.itemIconSVG(id);
    if (!svg) return null;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return (iconImgs[id] = img);
  }
  function drawIcon(ctx, id, x, y, size) {
    const img = itemImg(id);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }
  // A switch bridge's two long edges (where its rims run), for the dashed outline it shows while it's down.
  function sideLines(e) {
    const P = e.pts, n = P.length, p = new Path2D();
    for (const side of [1, -1]) for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const x = P[i].x - ((b.y - a.y) / L) * e.hw * side, y = P[i].y + ((b.x - a.x) / L) * e.hw * side;
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    return p;
  }
  // Evenly spaced spots along a bridge (one about every 260 units) for its switch badges.
  function marksAlong(e) {
    const P = e.pts, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    const len = cum[cum.length - 1], n = Math.max(1, Math.round(len / 260)), out = [];
    for (let k = 0; k < n; k++) {
      const d = (len * (k + 0.5)) / n;
      let i = 1;
      while (i < P.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      out.push({ x: P[i - 1].x + (P[i].x - P[i - 1].x) * f, y: P[i - 1].y + (P[i].y - P[i - 1].y) * f });
    }
    return out;
  }
  // The fixed floor. Floor that comes and goes (vanishing and switch bridges) is left out and drawn each frame in
  // its current state, the way world.query sees it: a switch bridge that's down must never look like floor.
  function buildPaths(part) {
    const solid = new Path2D();
    for (const s of part.segs) if (!s.dyn) capsule(solid, s.ax, s.ay, s.bx, s.by, s.hw);
    part.paths = { solid, blinks: part.blinks.map((e) => ({ e, line: edgeLine(e), sides: e.sw ? sideLines(e) : null, marks: e.sw ? marksAlong(e) : null })) };
    return part.paths;
  }

  const FLOORS = ['classic', 'neon', 'glass', 'retro'];
  function theme(style, hue, rgb) {
    const H = Math.round(hue / 5) * 5, C = (H + 180) % 360;
    switch (style) {
      case 'neon': return { glow: rgb, rim: rgb, rimW: 3, floor: '#0d0b1c', blink: '#2a2150', start: rgb, goal: '#ff2d95', goalText: '#fff' };
      case 'glass': return {
        rim: 'rgba(255,255,255,0.9)', rimW: 3, floor: 'rgba(255,255,255,0.2)', translucent: true, blink: 'rgba(255,255,255,0.35)',
        start: 'rgba(255,255,255,0.95)', goal: '#e8336d', goalText: '#fff',
      };
      case 'retro': return { rim: '#000', rimW: 2, floor: '#2f55ff', blink: '#7d95ff', start: '#fff', goal: '#ffd400', goalText: '#000' };
      default: return {
        rim: 'hsl(' + H + ',40%,34%)', rimW: 3, floor: 'hsl(' + H + ',45%,86%)', blink: 'hsl(' + C + ',60%,80%)',
        start: 'hsl(' + H + ',40%,34%)', goal: 'hsl(' + C + ',75%,40%)', goalText: '#fff',
      };
    }
  }
  // A vanishing bridge's opacity: solid while up, blinking for its last 0.7 s, 0 while gone.
  function blinkAlpha(b, t) {
    const ph = MZ.blinkPhase(b, t), on = b.on;
    if (ph >= on) return 0;
    const warn = 0.7 / b.period;
    if (ph > on - warn) return Math.floor((on - ph) * b.period * 10) % 2 ? 0.35 : 0.85;
    return 1;
  }
  // Line widths are given in screen pixels; px is one screen pixel in world units at the current zoom.
  function bridgeRims(g, blinks, th, px) {
    g.strokeStyle = th.rim;
    for (const b of blinks) if (b.a > 0) { g.globalAlpha = b.a; g.lineWidth = 2 * (b.e.hw + th.rimW * px); g.stroke(b.line); }
    g.globalAlpha = 1;
  }
  // Bridges that are up get their fill; gone ones leave a faint dashed ghost of where they come back. Switch bridges
  // wear their switch's colour; one that's down is a tinted ghost with dashed rims in that colour (its switch badges
  // go on top, in drawSwitchBridges).
  const swColor = (e) => (e.sw && MZ.Levels ? MZ.Levels.SWITCH_COLORS[e.sw.g % MZ.Levels.SWITCH_COLORS.length] : null);
  function bridgeFills(g, blinks, th, px) {
    for (const b of blinks) {
      const c = swColor(b.e);
      if (b.a > 0) {
        g.globalAlpha = b.a; g.strokeStyle = th.blink; g.lineWidth = 2 * b.e.hw; g.stroke(b.line);
        if (c) { g.globalAlpha = 0.5 * b.a; g.strokeStyle = c; g.stroke(b.line); g.globalAlpha = 1; g.setLineDash([10 * px, 10 * px]); g.lineWidth = 3 * px; g.strokeStyle = c; g.stroke(b.line); g.setLineDash([]); }
        g.globalAlpha = 1;
        continue;
      }
      if (c) {
        g.strokeStyle = c; g.globalAlpha = 0.2; g.lineWidth = 2 * b.e.hw; g.stroke(b.line);
        g.globalAlpha = 1; g.setLineDash([9 * px, 7 * px]);
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 6 * px; g.stroke(b.sides);
        g.strokeStyle = c; g.lineWidth = 3 * px; g.stroke(b.sides);
        g.setLineDash([]);
        continue;
      }
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2 * b.e.hw; g.stroke(b.line);
      g.setLineDash([12 * px, 14 * px]);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3 * px; g.stroke(b.line);
      g.setLineDash([]);
    }
  }
  const dynAlpha = (e, t, world) => (e.type === 'switch' ? ((world.sw[e.sw.g] | 0) === e.sw.on ? 1 : 0) : blinkAlpha(e.blink, t));
  // When a switch of colour group g was last pressed (game clock), or -Infinity.
  function pressedAt(mech, g) {
    let at = -Infinity;
    if (mech && mech.plates) for (const pl of mech.plates) if (pl.g === g && pl.pressAt != null && pl.pressAt > at) at = pl.pressAt;
    return at;
  }
  // A switch plate, as drawn on the floor and (smaller) as the badge on its bridges: a dark dish with a ring in its
  // colour and a button, raised and dim while the switch is up, pressed in and bright once pressed.
  function plateGlyph(ctx, x, y, r, color, on, px, dish) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = dish || 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 4 * px; ctx.stroke();
    ctx.fillStyle = color; ctx.globalAlpha = on ? 1 : 0.55;
    ctx.beginPath(); ctx.arc(0, on ? r * 0.04 : -r * 0.08, r * 0.55, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2.5 * px; ctx.stroke();
    ctx.restore();
  }

  // ---------- keys, doors, gates, switches, portals: drawn the way the home menu shows them ----------
  // Their strokes are in world units (ICON per "pixel" of the icon, the scale the zoomed-out menu shows them at), so
  // at any zoom they look like the menu's chunky icons, and what's drawn is what acts: a shut door blocks exactly as
  // thick as its bar (Levels.DOOR_R = 8 icon pixels), a key is picked up where it's drawn (Levels.KEY_R).
  const ICON = 2;

  // ---------- Tox Boxes ----------
  const TOX_STONE = [150, 142, 192]; // lavender-grey stone
  const toxRGB = (b) => 'rgb(' + TOX_STONE.map((c) => Math.round(c * b)).join(',') + ')';
  // One side of a Tox Box, in its own s x s square (up is -y): the hollow side (a thick rim round the dark inside), or
  // an angry face (heavy brows down to the middle over glaring eyes, gritted teeth).
  function toxFaceArt(g, s, hollow) {
    const h = s / 2;
    if (hollow) {
      const q = h - s * 0.11, gr = g.createRadialGradient(0, 0, q * 0.15, 0, 0, q * 1.45);
      gr.addColorStop(0, '#07050e'); gr.addColorStop(1, '#2d2545');
      g.fillStyle = gr; g.fillRect(-q, -q, 2 * q, 2 * q);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = s * 0.035; g.strokeRect(-q, -q, 2 * q, 2 * q);
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = s * 0.02; g.strokeRect(-h * 0.93, -h * 0.93, h * 1.86, h * 1.86);
      return;
    }
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = s * 0.035; g.strokeRect(-h * 0.82, -h * 0.82, h * 1.64, h * 1.64); // bevel
    g.lineCap = 'round';
    for (const k of [-1, 1]) {
      g.fillStyle = '#fff4d0'; g.beginPath(); g.ellipse(k * s * 0.19, -s * 0.03, s * 0.115, s * 0.085, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a1328'; g.beginPath(); g.arc(k * s * 0.15, -s * 0.01, s * 0.05, 0, TAU); g.fill();
      g.strokeStyle = '#2a2140'; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(k * s * 0.35, -s * 0.2); g.lineTo(k * s * 0.07, -s * 0.07); g.stroke();
    }
    g.fillStyle = '#1a1328'; g.fillRect(-s * 0.2, s * 0.14, s * 0.4, s * 0.15);
    g.fillStyle = '#efe6cf'; g.fillRect(-s * 0.17, s * 0.165, s * 0.34, s * 0.1);
    g.strokeStyle = '#1a1328'; g.lineWidth = s * 0.02; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(-s * 0.17, s * 0.215); g.lineTo(s * 0.17, s * 0.215);
    for (const x of [-0.085, 0, 0.085]) { g.moveTo(x * s, s * 0.165); g.lineTo(x * s, s * 0.265); }
    g.stroke();
  }
  const KEY_S = 13, KEY_TILT = -0.6; // key size (world units) and its tilt
  function keyPath(g, s) { // bow, shaft, two teeth
    g.beginPath(); g.arc(-s * 0.55, 0, s * 0.5, 0, TAU);
    g.moveTo(-s * 0.05, 0); g.lineTo(s * 1.1, 0);
    g.moveTo(s * 0.75, 0); g.lineTo(s * 0.75, s * 0.42);
    g.moveTo(s * 1.05, 0); g.lineTo(s * 1.05, s * 0.32);
  }
  // A key: a dark outline (9 icon pixels) and its colour (5), tilted by rot. s: its size; u: one icon pixel.
  function keyIcon(g, x, y, s, color, rot, u) {
    g.save();
    g.translate(x, y); g.rotate(rot);
    g.lineJoin = 'round'; g.lineCap = 'round';
    keyPath(g, s); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 9 * u; g.stroke();
    keyPath(g, s); g.strokeStyle = color; g.lineWidth = 5 * u; g.stroke();
    g.restore();
  }
  // The same key as an SVG (32 x 32), for the HUD.
  function keySVG(color) {
    const s = 9.5, u = s / KEY_S * ICON, n = (v) => +v.toFixed(2);
    const d = 'M' + n(-s * 0.05) + ' 0H' + n(s * 1.1) + 'M' + n(s * 0.75) + ' 0V' + n(s * 0.42) + 'M' + n(s * 1.05) + ' 0V' + n(s * 0.32);
    const shape = (st, w) => '<g fill="none" stroke="' + st + '" stroke-width="' + n(w) + '" stroke-linecap="round" stroke-linejoin="round"><circle cx="' + n(-s * 0.55) + '" r="' + n(s * 0.5) + '"/><path d="' + d + '"/></g>';
    return '<svg viewBox="0 0 32 32" aria-hidden="true"><g transform="translate(16.5 15) rotate(' + n((KEY_TILT * 180) / Math.PI) + ')">' + shape('rgba(0,0,0,0.5)', 9 * u) + shape(color, 5 * u) + '</g></svg>';
  }
  // A shut door: a round-ended bar in its colour with a dark rim (16 and 11 icon pixels), and a keyhole.
  function doorBar(g, ax, ay, bx, by, color, u, hole) {
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 16 * u; g.stroke();
    g.strokeStyle = color; g.lineWidth = 11 * u; g.stroke();
    if (!hole) return;
    g.save();
    g.translate((ax + bx) / 2, (ay + by) / 2);
    g.fillStyle = '#1b1530';
    g.beginPath(); g.arc(0, -2 * u, 3.2 * u, 0, TAU); g.fill();
    g.fillRect(-1.6 * u, -1 * u, 3.2 * u, 6 * u);
    g.restore();
  }
  // One half of an opening door: from (x0, y0), flat, out to its end (x1, y1), round.
  function doorHalf(g, x0, y0, x1, y1, R) {
    const a = Math.atan2(y1 - y0, x1 - x0), c = Math.cos(a + Math.PI / 2) * R, s = Math.sin(a + Math.PI / 2) * R;
    g.beginPath(); g.moveTo(x0 + c, y0 + s); g.lineTo(x1 + c, y1 + s); g.arc(x1, y1, R, a + Math.PI / 2, a - Math.PI / 2, true); g.lineTo(x0 - c, y0 - s); g.closePath();
  }
  // How far the floor reaches from a door's centre toward each end of its bar (found once, then kept on the door).
  function doorSpan(d, world) {
    if (d.span) return d.span;
    const L = Math.hypot(d.ax - d.x, d.ay - d.y);
    if (!world || !L) return { a: L, b: L, L };
    const edge = (ex, ey) => {
      const ux = (ex - d.x) / L, uy = (ey - d.y) / L;
      if (world.query(d.x + ux * L, d.y + uy * L, 0).depth > 0) return L;
      let lo = 0, hi = L;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (world.query(d.x + ux * m, d.y + uy * m, 0).depth > 0) lo = m; else hi = m; }
      return lo;
    };
    return (d.span = { a: edge(d.ax, d.ay), b: edge(d.bx, d.by), L });
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1; this.w = 1; this.h = 1;
    }
    resize(w, h, dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      Object.assign(this.canvas.style, { width: w + 'px', height: h + 'px' });
    }
    layer() {
      const c = this._layer || (this._layer = document.createElement('canvas'));
      if (c.width !== this.canvas.width || c.height !== this.canvas.height) { c.width = this.canvas.width; c.height = this.canvas.height; }
      return c;
    }
    // World point to CSS pixel, relative to the viewport.
    toScreen(cam, x, y) { return { x: this.w / 2 + (x - cam.x) * cam.zoom, y: this.h / 2 + (y - cam.y) * cam.zoom }; }

    // s: { world, cam, t, clock, floor, hue, rgb, start, goal, flags, gems, beacons, boxes, boxAge, shards, under }.
    draw(s) {
      const { ctx, dpr } = this;
      const cam = s.cam, z = cam.zoom, t = s.t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!s.world) return;
      const k = dpr * z;
      ctx.setTransform(k, 0, 0, k, dpr * this.w / 2 - cam.x * k, dpr * this.h / 2 - cam.y * k);
      const hw = this.w / 2 / z + 80, hh = this.h / 2 / z + 80;
      const parts = s.world.visibleParts(cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh);
      const th = theme(s.floor, s.hue, s.rgb), px = 1 / z;
      this.px = px; this.world = s.world; this.runT = s.runT; this.th = th;

      // One union path per frame: every pass paints each pixel once, even where tiles overlap.
      const union = new Path2D(), blinks = [];
      for (const p of parts) {
        const paths = p.paths || buildPaths(p);
        union.addPath(paths.solid);
        for (const b of paths.blinks) blinks.push({ e: b.e, line: b.line, sides: b.sides, marks: b.marks, a: dynAlpha(b.e, t, s.world) });
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (th.glow) {
        ctx.strokeStyle = th.glow;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 24 * px;
        ctx.stroke(union);
        ctx.globalAlpha = 1;
      }
      if (th.translucent) {
        // See-through floor: rims and bridges go on a side layer with the floor's inside cut away, so no capsule seam
        // or overlap ever shows through.
        const L = this.layer(), g = L.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, L.width, L.height);
        g.setTransform(ctx.getTransform());
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.strokeStyle = th.rim;
        g.lineWidth = th.rimW * 2 * px;
        g.stroke(union);
        bridgeRims(g, blinks, th, px);
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = g.strokeStyle = '#000';
        g.fill(union);
        for (const b of blinks) if (b.a > 0) { g.globalAlpha = b.a; g.lineWidth = 2 * b.e.hw; g.stroke(b.line); }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        bridgeFills(g, blinks, th, px);
        g.globalCompositeOperation = 'destination-out';
        g.fill(union);
        g.globalCompositeOperation = 'source-over';
        ctx.fillStyle = th.floor;
        ctx.fill(union);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(L, 0, 0);
        ctx.restore();
      } else {
        // Opaque floor, painted rims first and fills last, so a bridge that is up joins the floor without a seam.
        bridgeRims(ctx, blinks, th, px);
        ctx.strokeStyle = th.rim;
        ctx.lineWidth = th.rimW * 2 * px;
        ctx.stroke(union);
        bridgeFills(ctx, blinks, th, px);
        ctx.fillStyle = th.floor;
        ctx.fill(union);
        ctx.fill(union); // twice: where capsule edges overlap inside the floor, one pass leaves a faint antialiasing hairline
      }
      // Ice: a pale, glassy sheen with streaks along the corridor.
      for (const p of parts) for (const e of p.edges) {
        if (!e.ice) continue;
        const line = e.iceLine || (e.iceLine = (() => { const l = new Path2D(); l.moveTo(e.pts[0].x, e.pts[0].y); for (let i = 1; i < e.pts.length; i++) l.lineTo(e.pts[i].x, e.pts[i].y); return l; })());
        ctx.strokeStyle = 'rgba(190,240,255,0.55)'; ctx.lineWidth = 2 * e.hw; ctx.stroke(line);
        ctx.setLineDash([e.hw * 0.9, e.hw * 1.6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2.5 * px; ctx.stroke(line);
        ctx.setLineDash([]);
      }
      this.drawSwitchBridges(blinks, s.mech, s.clock || 0);
      if (s.path) this.drawPath(s.path, s.clock || 0);
      ctx.lineCap = 'butt';
      if (s.mech) this.drawMovers(s.mech, t, th);
      const toxes = s.mech && s.mech.toxes && s.mech.toxes.length ? s.mech.toxes.filter((bx) => bx.tiles.some((q) => Math.abs(q.x - cam.x) < hw + bx.s && Math.abs(q.y - cam.y) < hh + bx.s)) : [];
      for (const bx of toxes) this.drawToxTrack(bx, t);

      if (s.start) this.drawStart(s.start, th);
      if (s.goal && !s.goal.media) this.drawGoal(s.goal, th);
      if (s.flags) for (const c of s.flags) this.drawFlag(c);
      if (s.mech) this.drawMech(s.mech, s.clock || 0);
      if (s.beacons) for (const b of s.beacons) this.drawBeacon(b);
      if (s.gems) for (const g of s.gems) if (!g.taken) this.drawGem(g);
      if (s.boxes) for (const b of s.boxes) this.drawBox(b, s.clock || 0, s.boxAge ? s.boxAge(b) : 9);
      if (s.shards) for (const b of s.shards) this.drawShards(b, s.clock || 0);
      for (const bx of toxes) this.drawTox(bx, t);
      if (s.mech) for (const q of s.mech.gaps || []) if (q.ledge && q.fog > 0.01) this.drawLedgeFog(q, s.clock || 0);
      if (s.under) this.drawUnder(s.under, s.clock || 0);
    }
    // A Tox Box's track: the tiles it lands on, faintly; the hollow ones (where it always comes down hollow side down:
    // stand there and it passes right over you) with bright corner brackets.
    drawToxTrack(bx, t) {
      const ctx = this.ctx, px = this.px, s = bx.s, h = s / 2;
      for (let k = 0; k <= bx.n; k++) {
        const T = bx.tiles[k];
        ctx.save();
        ctx.translate(T.x, T.y); ctx.rotate(Math.atan2(T.uy, T.ux));
        ctx.fillStyle = 'rgba(24,14,48,0.16)'; ctx.fillRect(-h, -h, s, s);
        ctx.strokeStyle = 'rgba(24,14,48,0.32)'; ctx.lineWidth = 2 * px; ctx.strokeRect(-h + 2, -h + 2, s - 4, s - 4);
        if (MZ.toxFace(bx, k) === 0) {
          const q = h * 0.8, l = h * 0.36;
          ctx.beginPath();
          for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(a * q, b * (q - l)); ctx.lineTo(a * q, b * q); ctx.lineTo(a * (q - l), b * q); }
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 7 * px; ctx.stroke();
          ctx.strokeStyle = 'rgba(140,255,200,' + (0.7 + 0.3 * Math.sin(t * 3 + k)).toFixed(3) + ')'; ctx.lineWidth = 3.5 * px; ctx.stroke();
          ctx.setLineDash([4 * px, 4 * px]); ctx.strokeStyle = 'rgba(140,255,200,0.45)'; ctx.lineWidth = 1.5 * px;
          ctx.strokeRect(-q * 0.6, -q * 0.6, q * 1.2, q * 1.2); ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
    // A Tox Box: resting, a stone block (its top face, a darker front below it); tumbling, two faces foreshortened as it
    // goes over its leading edge, lifting toward you as it does; landing, a puff of dust.
    drawTox(bx, t) {
      const ctx = this.ctx, s = bx.s, h = s / 2, st = MZ.toxAt(bx, t), A = bx.tiles[st.i], B = bx.tiles[st.j];
      // The faces are painted on the cube as a Tox Box's are, each upright while it's a side facing along the track: so
      // once tumbled round on top it lies with its brows toward one end of the track (which end depends on how the box
      // was painted), and as the box tumbles on, the face coming up turns with it. Never simply upright on screen.
      if (bx.up == null) { const h = Math.sin(bx.tiles[0].x * 0.013 + bx.tiles[0].y * 0.029) * 43758.5453; bx.up = h - Math.floor(h) < 0.5 ? -Math.PI / 2 : Math.PI / 2; }
      let a0 = Math.atan2(A.uy, A.ux), a1 = Math.atan2(B.uy, B.ux);
      while (a1 - a0 > Math.PI) a1 -= TAU;
      while (a1 - a0 < -Math.PI) a1 += TAU;
      const f = st.f, d = st.j >= st.i ? 1 : -1, th = (f * Math.PI) / 2, c = Math.cos(th), sn = Math.sin(th);
      const ox = st.f > 0 ? (A.x + B.x) / 2 : A.x, oy = st.f > 0 ? (A.y + B.y) / 2 : A.y, rot = a0 + (a1 - a0) * f;
      // Along the track (x, forward), from the edge it tumbles over: the side rising to become the top, then the old top.
      const x0 = st.f > 0 ? -d * s * c : -h, xm = st.f > 0 ? -d * s * c + d * s * sn : -h, x1 = st.f > 0 ? d * s * sn : h;
      const lo = Math.min(x0, x1), w = Math.abs(x1 - x0), ext = s * 0.1, lift = 1 + 0.07 * Math.sin(2 * th);
      const face = (u0, u1, k, lit) => {
        const ww = Math.abs(u1 - u0);
        if (ww < 0.5) return;
        const l = Math.min(u0, u1);
        ctx.save();
        ctx.beginPath(); ctx.rect(l, -h, ww, s); ctx.clip();
        ctx.fillStyle = toxRGB(1); ctx.fillRect(l, -h, ww, s);
        ctx.translate(l + ww / 2, 0); ctx.scale(ww / s, 1); ctx.rotate(bx.up);
        toxFaceArt(ctx, s, k === 0);
        ctx.restore();
        if (lit < 1) { ctx.fillStyle = 'rgba(12,6,28,' + ((1 - lit) * 0.8).toFixed(3) + ')'; ctx.fillRect(l, -h, ww, s); }
        ctx.strokeStyle = 'rgba(22,14,40,0.9)'; ctx.lineWidth = s * 0.035; ctx.strokeRect(l, -h, ww, s);
      };
      const box = (dx, dy, fill) => { // the footprint, moved (dx, dy) on the floor
        ctx.save(); ctx.translate(ox + dx, oy + dy); ctx.rotate(rot); ctx.fillStyle = fill; ctx.fillRect(lo, -h, w, s); ctx.restore();
      };
      box(s * 0.07, s * 0.16, 'rgba(0,0,0,0.3)'); // shadow
      if (st.f === 0 && st.since < 0.4) { // dust
        const k = st.since / 0.4;
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(rot);
        ctx.fillStyle = 'rgba(225,218,245,' + (0.4 * (1 - k)).toFixed(3) + ')';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.4, r = h * (1.05 + 0.5 * k);
          ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1, s * (0.08 + 0.12 * k), 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      for (let i = 4; i >= 1; i--) box(0, (ext * i) / 4, toxRGB(0.42)); // its front, below the top
      ctx.save();
      ctx.translate(ox, oy); ctx.rotate(rot);
      if (lift !== 1) { const cx = lo + w / 2; ctx.translate(cx, 0); ctx.scale(lift, lift); ctx.translate(-cx, 0); }
      if (st.f === 0) face(-h, h, MZ.toxFace(bx, st.i + 2), 1);
      else {
        face(x0, xm, MZ.toxFace(bx, st.i - d), 0.55 + 0.45 * sn);
        face(xm, x1, MZ.toxFace(bx, st.i + 2), 0.55 + 0.45 * c);
      }
      ctx.restore();
    }
    // Switch bridges: one that's down carries its switch's badge over the gap (closed until you press that colour);
    // pressing the switch flashes all its bridges in its colour as they come or go.
    drawSwitchBridges(blinks, mech, clock) {
      const ctx = this.ctx, px = this.px;
      for (const b of blinks) {
        const c = swColor(b.e);
        if (!c) continue;
        const k = (clock - pressedAt(mech, b.e.sw.g)) / 0.7;
        if (k >= 0 && k < 1) {
          ctx.save();
          ctx.strokeStyle = c; ctx.globalAlpha = 0.8 * (1 - k) * (1 - k);
          ctx.lineWidth = 2 * b.e.hw + (10 + 36 * k) * px; ctx.stroke(b.line);
          ctx.restore();
        }
        if (b.a > 0) continue;
        const r = Math.min(20, b.e.hw * 0.52) * (1 + 0.06 * Math.sin(clock * 3));
        for (const p of b.marks) plateGlyph(ctx, p.x, p.y, r, c, false, ICON, 'rgba(20,14,40,0.85)');
      }
    }
    // The Path item: a glowing trail along the floor with dashes flowing toward where it leads.
    drawPath(P, clock) {
      const ctx = this.ctx, pts = P.pts;
      if (pts.length < 2) return;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.globalAlpha = 0.3 * P.a; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 26; ctx.stroke();
      ctx.globalAlpha = P.a; ctx.strokeStyle = 'rgba(80,50,0,0.55)'; ctx.lineWidth = 11; ctx.setLineDash([16, 18]); ctx.lineDashOffset = -clock * 90; ctx.stroke();
      ctx.strokeStyle = '#fff6c9'; ctx.lineWidth = 6; ctx.stroke();
      ctx.restore();
    }
    // Moving platforms: a dotted track over the void, and the platform itself (floor) with arrows on it.
    drawMovers(m, t, th) {
      const ctx = this.ctx, px = this.px;
      for (const mv of m.movers) {
        ctx.save();
        ctx.setLineDash([6 * px, 10 * px]);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3 * px; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mv.a.x, mv.a.y); ctx.lineTo(mv.b.x, mv.b.y); ctx.stroke();
        ctx.setLineDash([]);
        const p = MZ.moverAt(mv, t), ang = Math.atan2(mv.b.y - mv.a.y, mv.b.x - mv.a.x);
        ctx.translate(p.x, p.y);
        ctx.beginPath(); ctx.arc(0, 0, mv.r, 0, TAU);
        ctx.fillStyle = th.floor === 'rgba(255,255,255,0.2)' ? 'rgba(255,255,255,0.35)' : th.floor; ctx.fill();
        ctx.strokeStyle = th.rim; ctx.lineWidth = th.rimW * 2 * px; ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3 * px;
        ctx.beginPath(); ctx.arc(0, 0, mv.r * 0.72, 0, TAU); ctx.stroke();
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * mv.r * 0.9, 0); ctx.lineTo(s * mv.r * 0.6, -mv.r * 0.2); ctx.lineTo(s * mv.r * 0.6, mv.r * 0.2); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    }
    // Doors, keys, switches, one-way gates and portals, as icons (see ICON).
    drawMech(m, t) {
      const ctx = this.ctx, px = ICON;
      for (const pt of m.portals) for (const e of [pt.a, pt.b]) this.drawPortal(e, pt.r, pt.color, t);
      for (const pl of m.plates) {
        const on = (MZ.Game.world && MZ.Game.world.sw[pl.g]) | 0, k = pl.pressAt != null ? (t - pl.pressAt) / 0.6 : 1;
        plateGlyph(ctx, pl.x, pl.y, pl.r, pl.color, on, px);
        if (k >= 0 && k < 1) { // pressed: a ring in its colour bursts out
          ctx.save();
          ctx.globalAlpha = 1 - k; ctx.strokeStyle = pl.color; ctx.lineWidth = 4 * px;
          ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r * (1.1 + 1.4 * k), 0, TAU); ctx.stroke();
          ctx.restore();
        }
      }
      for (const g of m.gates) { // two chevrons pointing the way through, between two posts
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3 * px; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.bx, g.by); ctx.setLineDash([4 * px, 7 * px]); ctx.stroke(); ctx.setLineDash([]);
        const w = Math.hypot(g.bx - g.ax, g.by - g.ay) / 2, bob = Math.sin(t * 5) * w * 0.06;
        ctx.translate(g.x + g.nx * bob, g.y + g.ny * bob);
        ctx.rotate(Math.atan2(g.ny, g.nx));
        ctx.lineJoin = 'round';
        for (const o of [-w * 0.28, w * 0.18]) {
          ctx.beginPath(); ctx.moveTo(o - w * 0.22, -w * 0.45); ctx.lineTo(o + w * 0.12, 0); ctx.lineTo(o - w * 0.22, w * 0.45);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 9 * px; ctx.stroke();
          ctx.strokeStyle = '#7dffb5'; ctx.lineWidth = 5 * px; ctx.stroke();
        }
        ctx.restore();
      }
      for (const d of m.doors) { // shut: a bar with a keyhole; opening, it splits and slides into the walls, where it stays
        ctx.save();
        if (!d.open) { doorBar(ctx, d.ax, d.ay, d.bx, d.by, d.color, px, true); ctx.restore(); continue; }
        // The threshold, dashed in the door's colour; the halves end up flush with the floor's edge, so nothing that
        // looks solid is left where you can walk.
        const k = Math.min(1, (MZ.Game.t - (d.openAt || 0)) / 0.45), e = 1 - (1 - k) * (1 - k);
        ctx.lineCap = 'round';
        ctx.setLineDash([5 * px, 6 * px]); ctx.globalAlpha = 0.6 * e;
        ctx.strokeStyle = d.color; ctx.lineWidth = 2.5 * px;
        ctx.beginPath(); ctx.moveTo(d.ax, d.ay); ctx.lineTo(d.bx, d.by); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        const sp = doorSpan(d, this.world);
        for (const [ex, ey, reach] of [[d.ax, d.ay, sp.a], [d.bx, d.by, sp.b]]) {
          const ux = (ex - d.x) / sp.L, uy = (ey - d.y) / sp.L, f = reach * e;
          if (f >= sp.L) continue; // the floor reaches past the bar's end: it's all gone into the wall
          doorHalf(ctx, d.x + ux * f, d.y + uy * f, ex, ey, 8 * px); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
          doorHalf(ctx, d.x + ux * Math.min(sp.L, f + 2.5 * px), d.y + uy * Math.min(sp.L, f + 2.5 * px), ex, ey, 5.5 * px); ctx.fillStyle = d.color; ctx.fill();
        }
        ctx.restore();
      }
      for (const kk of m.keys) if (!kk.taken) this.drawKey(kk, t);
      for (const q of m.gaps || []) this.drawBreak(q, t); // (nothing says which item: the level shows it. A Shrink way is just narrow)
      for (const gb of m.gboxes || []) if (!gb.out) this.drawItemBox(gb, t, gb.bornAt != null && this.runT != null ? this.runT - gb.bornAt : 9);
    }
    // A gap: the corridor broken off at either end (a cracked edge, rubble floating off into the void), so the way on is
    // plain to see, and nothing says which item crosses it. The ends face each other; a ledge's faces the way the
    // corridor was going (where it comes down is off to one side, under the clouds), and no rubble trails across it.
    drawBreak(q, t) {
      const ctx = this.ctx, px = this.px, th = this.th || {}, hw = q.hw, n = q.pts.length;
      const dirOf = (A, B) => { const l = Math.hypot(B.x - A.x, B.y - A.y) || 1; return { x: (B.x - A.x) / l, y: (B.y - A.y) / l }; };
      const ends = q.ledge ? [[q.a, dirOf(q.a, q.pts[1])], [q.b, dirOf(q.b, q.pts[n - 2])]] : [[q.a, dirOf(q.a, q.b)], [q.b, dirOf(q.b, q.a)]];
      const rnd = (i) => { const h = Math.sin(i * 12.9898 + q.a.x * 0.013 + q.a.y * 0.007) * 43758.5453; return h - Math.floor(h); };
      const chunk = (x, y, r, i, a) => { // a jagged bit of floor
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const th2 = (k / 5) * TAU + rnd(i * 7 + k) * 0.8 + t * 0.2 * (rnd(i) - 0.5), rr = r * (0.65 + 0.5 * rnd(i * 11 + k)); ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(th2) * rr, y + Math.sin(th2) * rr); }
        ctx.closePath();
        ctx.globalAlpha = a; ctx.fillStyle = th.floor || '#cfe'; ctx.fill();
        ctx.strokeStyle = th.rim || 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5 * px; ctx.stroke();
      };
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ends.forEach(([P, u], e) => {
        const vx = -u.y, vy = u.x, c = hw * 0.72;
        ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2 * px; // the crack along the broken edge
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) { const s = -0.75 + (1.5 * k) / 6, j = (rnd(e * 13 + k) - 0.5) * hw * 0.22; ctx[k ? 'lineTo' : 'moveTo'](P.x + u.x * (c + j) + vx * s * hw, P.y + u.y * (c + j) + vy * s * hw); }
        ctx.stroke();
        for (let i = 0; i < 6; i++) { // rubble drifting off it
          const d = hw * (1.15 + 0.35 * i + 0.25 * rnd(e * 17 + i)), l = (rnd(e * 5 + i) - 0.5) * hw * 1.2, bob = Math.sin(t * 1.3 + i + e) * 2;
          chunk(P.x + u.x * d + vx * l, P.y + u.y * d + vy * l + bob, hw * (0.2 - 0.02 * i) * (0.8 + 0.4 * rnd(i + e)), e * 31 + i, Math.max(0.15, 0.85 - 0.12 * i));
        }
      });
      if (!q.ledge) { // a sparse trail of bits across: the way over
        const L = Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y), u = dirOf(q.a, q.b), steps = Math.floor(L / 38);
        for (let i = 1; i < steps; i++) {
          const f = i / steps, l = (rnd(90 + i) - 0.5) * hw * 0.8, bob = Math.sin(t * 1.1 + i * 0.9) * 2.5;
          chunk(q.a.x + (q.b.x - q.a.x) * f - u.y * l, q.a.y + (q.b.y - q.a.y) * f + u.x * l + bob, hw * 0.1 * (0.8 + 0.5 * rnd(60 + i)), 200 + i, 0.3);
        }
      }
      ctx.restore();
    }
    // ...and the bank of cloud over where it comes down, until you Launch from it (it parts as you rise).
    drawLedgeFog(q, t) {
      const ctx = this.ctx, a = q.fog, R = 120, n = 14;
      ctx.save();
      ctx.globalAlpha = a;
      const puffs = [];
      for (let i = 0; i < n; i++) {
        const h = Math.sin(i * 12.9898 + q.b.x * 0.01) * 43758.5453, j = h - Math.floor(h), th = (i / n) * TAU + t * 0.04;
        const rr = (i % 2 ? 0.55 : 0.2) * R + 8 * Math.sin(t * 0.7 + i), pr = 38 + 22 * j + 4 * Math.sin(t * 1.1 + i);
        puffs.push([q.b.x + Math.cos(th) * rr, q.b.y + Math.sin(th) * rr, pr]);
      }
      ctx.fillStyle = 'rgba(146,160,204,0.95)'; // shadows first, then the white tops: one bank of cloud
      for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x + 5, y + 9, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#f4f7ff';
      for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // An item box (for a puzzle): a steady gold-framed crate showing the item it always gives, with a glow; not the
    // colour-cycling "?" of a mystery box.
    drawItemBox(b, t, age) {
      const ctx = this.ctx, px = this.px, pop = age < 0.35 ? Math.max(0, age / 0.35) : 1, r = 17 * pop, c = ITEM_TINT[b.item] || '#ffd84a';
      if (r <= 0.5) return;
      ctx.save();
      ctx.translate(b.x, b.y);
      const glow = 0.3 + 0.15 * Math.sin(t * 3);
      ctx.globalAlpha = glow; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r * 1.75, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      const k = r * 0.32;
      ctx.beginPath();
      ctx.moveTo(-r + k, -r); ctx.lineTo(r - k, -r); ctx.quadraticCurveTo(r, -r, r, -r + k); ctx.lineTo(r, r - k); ctx.quadraticCurveTo(r, r, r - k, r);
      ctx.lineTo(-r + k, r); ctx.quadraticCurveTo(-r, r, -r, r - k); ctx.lineTo(-r, -r + k); ctx.quadraticCurveTo(-r, -r, -r + k, -r); ctx.closePath();
      ctx.fillStyle = '#1f1a3a'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 7 * px; ctx.stroke();
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3.5 * px; ctx.stroke();
      drawIcon(ctx, b.item, 0, 0, r * 1.5);
      ctx.restore();
    }
    // A key, bobbing and rocking a little on its spot (it's picked up within Levels.KEY_R of it).
    drawKey(k, t) {
      keyIcon(this.ctx, k.x, k.y + Math.sin(t * 3 + k.x) * 2.5, KEY_S, k.color, KEY_TILT + Math.sin(t * 2) * 0.12, ICON);
    }
    drawPortal(e, r, color, t) {
      const ctx = this.ctx, px = ICON;
      ctx.save(); ctx.translate(e.x, e.y);
      const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
      g.addColorStop(0, 'rgba(10,6,30,0.95)'); g.addColorStop(0.7, 'rgba(20,10,50,0.75)'); g.addColorStop(1, color);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 3 * px; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { // swirling arms
        const a0 = t * 2.2 + (i * TAU) / 3;
        ctx.beginPath(); ctx.arc(0, 0, r * (0.35 + 0.18 * i), a0, a0 + 2.1); ctx.stroke();
      }
      ctx.restore();
    }
    // Darkness: everything but a soft circle of light around the player.
    drawDark(cam, p, R) {
      const ctx = this.ctx, s = this.toScreen(cam, p.x, p.y), r = R * cam.zoom;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const g = ctx.createRadialGradient(s.x, s.y, r * 0.55, s.x, s.y, r);
      g.addColorStop(0, 'rgba(4,3,12,0)'); g.addColorStop(0.7, 'rgba(4,3,12,0.8)'); g.addColorStop(1, 'rgba(4,3,12,0.97)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    // A Launch's border: a ring of puffy clouds at the edge of how far you can steer (centre c, radius R), and a haze
    // past it. a: how high you are (0-1), so they gather as you rise and part as you come down.
    drawClouds(cam, c, R, a, t) {
      if (!(a > 0.01)) return;
      const ctx = this.ctx, k = this.dpr * cam.zoom;
      ctx.save();
      ctx.setTransform(k, 0, 0, k, (this.dpr * this.w) / 2 - cam.x * k, (this.dpr * this.h) / 2 - cam.y * k);
      const hw = this.w / 2 / cam.zoom + 10, hh = this.h / 2 / cam.zoom + 10;
      ctx.beginPath(); ctx.rect(cam.x - hw, cam.y - hh, hw * 2, hh * 2); ctx.arc(c.x, c.y, R + 45, 0, TAU, true);
      ctx.fillStyle = 'rgba(236,242,255,' + (0.5 * a).toFixed(3) + ')'; ctx.fill();
      const n = Math.max(12, Math.round((TAU * R) / 40)), puffs = [];
      for (let i = 0; i < n; i++) {
        const h = Math.sin(i * 12.9898) * 43758.5453, j = h - Math.floor(h), th = (i / n) * TAU + t * 0.03;
        const rr = R + 24 + 12 * Math.sin(i * 1.7 + t * 0.6), pr = 30 + 18 * j + 4 * Math.sin(t * 1.3 + i);
        puffs.push([c.x + Math.cos(th) * rr, c.y + Math.sin(th) * rr, pr]);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(146,160,204,0.95)'; // shadows first, then the white tops: one bank of cloud
      for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x + 4, y + 8, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#fff';
      for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // A checkpoint: a flag on a round platform, dashed gold until reached, solid green after.
    drawFlag(c) {
      const ctx = this.ctx, px = this.px, r = c.r * 0.62, col = c.lit ? '#3ddc97' : '#ffc53d';
      ctx.save();
      ctx.fillStyle = c.lit ? 'rgba(61,220,151,0.28)' : 'rgba(255,197,61,0.16)';
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
      if (!c.lit) ctx.setLineDash([r * 0.34, r * 0.22]);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7 * px; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 4 * px; ctx.stroke();
      ctx.setLineDash([]);
      const x = c.x - r * 0.18, top = c.y - r * 0.5, bot = c.y + r * 0.45;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1b1530'; ctx.lineWidth = 3.5 * px;
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + r * 0.62, top + r * 0.2); ctx.lineTo(x, top + r * 0.42); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 2.5 * px; ctx.stroke();
      ctx.restore();
    }
    // A mystery box: a rocking, colour-cycling "?" block. It pops back in when it returns.
    drawBox(b, t, age) {
      const ctx = this.ctx, px = this.px, pop = age < 0.35 ? Math.max(0, age / 0.35) : 1;
      const r = 14 * pop * (1 + 0.06 * Math.sin(t * 4 + b.x * 0.1)), hue = (t * 70 + b.x * 0.05 + b.y * 0.03) % 360;
      if (r <= 0.5) return;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.sin(t * 1.6 + b.y * 0.01) * 0.2);
      const c = r * 0.32;
      ctx.beginPath();
      ctx.moveTo(-r + c, -r); ctx.lineTo(r - c, -r); ctx.quadraticCurveTo(r, -r, r, -r + c); ctx.lineTo(r, r - c); ctx.quadraticCurveTo(r, r, r - c, r);
      ctx.lineTo(-r + c, r); ctx.quadraticCurveTo(-r, r, -r, r - c); ctx.lineTo(-r, -r + c); ctx.quadraticCurveTo(-r, -r, -r + c, -r); ctx.closePath();
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, 'hsl(' + hue + ',95%,64%)');
      g.addColorStop(1, 'hsl(' + ((hue + 110) % 360) + ',90%,52%)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 6 * px; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * px; ctx.stroke();
      ctx.font = '900 ' + (r * 1.45).toFixed(1) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4 * px; ctx.strokeText('?', 0, r * 0.08);
      ctx.fillStyle = '#fff'; ctx.fillText('?', 0, r * 0.08);
      ctx.restore();
    }
    // A shattered box: its pieces fly apart, spinning, and fade (k: 0 to 1 over the shatter).
    drawShards(b, t) {
      const ctx = this.ctx, px = this.px, k = b.k, e = 1 - (1 - k) * (1 - k), hue = (t * 70 + b.x * 0.05 + b.y * 0.03) % 360;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.lineJoin = 'round';
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996 + b.x * 0.01, d = 6 + e * (26 + (i % 3) * 9), s = 5.5 * (1 - 0.4 * k) * (1 + (i % 2) * 0.4);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
        ctx.rotate(a + k * (i % 2 ? 7 : -6));
        ctx.beginPath(); ctx.moveTo(-s, -s * 0.7); ctx.lineTo(s, -s * 0.4); ctx.lineTo(s * 0.2, s * 0.9); ctx.closePath();
        ctx.fillStyle = b.gold ? (i % 2 ? '#ffd84a' : '#1f1a3a') : 'hsl(' + ((hue + i * 25) % 360) + ',95%,62%)'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.stroke();
        ctx.restore();
      }
      if (k < 0.35) { // the burst
        ctx.globalAlpha = 1 - k / 0.35;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * px;
        ctx.beginPath(); ctx.arc(0, 0, 10 + 40 * k, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    // The shield breaking: electric arcs bursting out from the picture's edge, white-hot with a cold blue glow; while
    // it's down, a small fizz now and then.
    drawSparks(u, W, t) {
      const ctx = this.ctx, px = this.px;
      const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      const arc = (a, r0, r1, seed) => {
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
          const f = i / 4, r = r0 + (r1 - r0) * f, j = i && i < 4 ? (hash(seed + i) - 0.5) * 0.5 : 0;
          (i ? ctx.lineTo : ctx.moveTo).call(ctx, Math.cos(a + j) * r, Math.sin(a + j) * r);
        }
        ctx.strokeStyle = 'rgba(120,210,255,0.55)'; ctx.lineWidth = 5 * px; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (u.burst != null) {
        const k = u.burst, e = 1 - (1 - k) ** 3, seed = Math.floor(u.x * 7 + u.y * 3);
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 2 + hash(seed + i * 9) * 0.5;
          arc(a, W * (0.4 + 0.2 * e), W * (0.62 + (0.35 + 0.25 * hash(seed + i)) * e), seed + i * 13 + Math.floor(k * 6));
        }
        if (k < 0.4) { // the flash ring
          ctx.globalAlpha = 1 - k / 0.4;
          ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = 3 * px;
          ctx.beginPath(); ctx.arc(0, 0, W * (0.5 + 0.6 * k), 0, TAU); ctx.stroke();
        }
      } else {
        const n = Math.floor(u.crackle / 0.55), k = (u.crackle % 0.55) / 0.55;
        if (k < 0.22) {
          ctx.globalAlpha = 0.85;
          for (let i = 0; i < 3; i++) { const a = hash(n * 3 + i) * TAU; arc(a, W * 0.42, W * (0.58 + 0.12 * hash(n + i * 5)), n * 17 + i); }
        }
      }
      ctx.restore();
    }
    // A fall's bubble: a wobbling soap bubble around the picture, floating it home; it pops into droplets on arrival.
    drawBubble(u, W, t) {
      const ctx = this.ctx, px = this.px;
      ctx.save();
      if (u.bubble != null) {
        const k = u.bubble, grow = Math.min(1, k / 0.15), r = W * (0.5 + 0.26 * grow) * (1 + 0.035 * Math.sin(t * 9));
        const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
        g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.75, 'rgba(190,230,255,0.14)'); g.addColorStop(1, 'rgba(210,240,255,0.42)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + 0.03 * Math.sin(t * 7)), r * (1 - 0.03 * Math.sin(t * 7)), 0, 0, TAU); ctx.fill();
        const hue = (t * 120) % 360;
        ctx.lineWidth = 2.5 * px;
        ctx.strokeStyle = 'hsla(' + hue + ',90%,75%,0.8)'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3 * px; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.78, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke(); // the shine
        ctx.beginPath(); ctx.arc(-r * 0.52, -r * 0.2, r * 0.05, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      } else {
        const k = u.pop, r = W * (0.76 + 0.5 * k);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = 'rgba(220,245,255,0.95)';
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.3; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3.2 * px * (1 - k * 0.5), 0, TAU); ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2 * px;
        ctx.beginPath(); ctx.arc(0, 0, W * (0.76 + 0.25 * k), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    // Under the player's picture: a Launch's shadow, the magic carpet, the Bullet's shell and speed lines.
    drawUnder(u, t) {
      const ctx = this.ctx, px = this.px, W = u.W;
      ctx.save();
      ctx.translate(u.x, u.y);
      if (u.lift > 0) { // where you'll come down: a shadow, never smaller than a thumbnail on screen
        const r = Math.max(W * 0.42, 16 * px);
        ctx.fillStyle = 'rgba(0,0,0,' + (0.2 + 0.25 * u.lift).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.55, 0, 0, TAU); ctx.fill();
      }
      if (u.shield > 0) { // Extra hits: a slowly turning gold ring each
        ctx.save();
        for (let k = 0; k < u.shield; k++) {
          const r = W * (0.64 + 0.1 * k);
          ctx.rotate(t * (k ? -0.9 : 0.7));
          ctx.setLineDash([r * 0.5, r * 0.22]);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 6 * px;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
          ctx.strokeStyle = '#ffc53d'; ctx.lineWidth = 3.5 * px;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
      if (u.burst != null || u.crackle != null) this.drawSparks(u, W, t);
      if (u.warp) { // coming out of a portal: rings closing in
        ctx.save(); ctx.globalAlpha = 1 - u.warp.k; ctx.strokeStyle = u.warp.color; ctx.lineWidth = 4 * px;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, W * (1.6 - u.warp.k * 1.1 + i * 0.25), 0, TAU); ctx.stroke(); }
        ctx.restore();
      }
      if (u.bubble != null || u.pop != null) this.drawBubble(u, W, t);
      if (u.carpet > 0) {
        ctx.globalAlpha = u.carpet;
        const w = W * 0.66, h = W * 0.36, y0 = W * 0.3, n = 10;
        const wave = (i) => Math.sin(t * 7 + i * 0.9) * W * 0.035;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const x = -w + (2 * w * i) / n; (i ? ctx.lineTo : ctx.moveTo).call(ctx, x, y0 - h + wave(i)); }
        for (let i = n; i >= 0; i--) { const x = -w + (2 * w * i) / n; ctx.lineTo(x, y0 + h + wave(i)); }
        ctx.closePath();
        ctx.fillStyle = '#8e1b4d'; ctx.fill();
        ctx.strokeStyle = '#ffc53d'; ctx.lineWidth = 3 * px; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,197,61,0.7)'; ctx.lineWidth = 2 * px;
        for (let i = 1; i < n; i += 2) { // a band of diamonds along the middle
          const x = -w + (2 * w * i) / n, d = (w / n) * 0.8, yy = y0 + wave(i);
          ctx.beginPath(); ctx.moveTo(x - d, yy); ctx.lineTo(x, yy - d); ctx.lineTo(x + d, yy); ctx.lineTo(x, yy + d); ctx.closePath(); ctx.stroke();
        }
        ctx.strokeStyle = '#ffc53d'; ctx.lineWidth = 2 * px;
        for (const side of [-1, 1]) for (let k = 0; k < 4; k++) { // tassels
          const yy = y0 - h * 0.75 + (h * 1.5 * k) / 3 + wave(side < 0 ? 0 : n);
          ctx.beginPath(); ctx.moveTo(side * w, yy); ctx.lineTo(side * (w + W * 0.1), yy + Math.sin(t * 9 + k) * W * 0.02); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (u.bullet != null) {
        ctx.rotate(u.bullet);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) { // speed lines
          const yy = (i - 2.5) * W * 0.17, run = ((t * 9 + i * 0.37) % 1) * W * 0.6, x0 = -W * 0.8 - run;
          ctx.lineWidth = 2.5 * px;
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - W * (0.5 + 0.25 * (i % 3)), yy); ctx.stroke();
        }
        const h = W * 0.42;
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#1c1b26'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * px;
        ctx.beginPath(); // swept-back fins
        ctx.moveTo(-W * 0.45, -h); ctx.lineTo(-W * 0.95, -h * 1.35); ctx.lineTo(-W * 0.8, -h * 0.6); ctx.closePath();
        ctx.moveTo(-W * 0.45, h); ctx.lineTo(-W * 0.95, h * 1.35); ctx.lineTo(-W * 0.8, h * 0.6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); // shell: flat back, round nose
        ctx.moveTo(-W * 0.85, -h); ctx.lineTo(W * 0.1, -h); ctx.arc(W * 0.1, 0, h, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-W * 0.85, h); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff3d5a';
        ctx.fillRect(-W * 0.74, -h + 1.25 * px, W * 0.1, 2 * h - 2.5 * px);
      }
      ctx.restore();
    }

    drawStart(st, th) {
      const ctx = this.ctx;
      ctx.strokeStyle = th.start;
      ctx.lineWidth = 4 * this.px;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r * 0.66, 0, TAU); ctx.stroke();
    }
    drawGoal(g, th) {
      const ctx = this.ctx, r = g.r * 0.66;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fillStyle = th.goal;
      ctx.strokeStyle = th.rim;
      ctx.lineWidth = 3 * this.px;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = th.goalText;
      ctx.font = '800 ' + Math.round(r * 0.44) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GOAL', 0, r * 0.03);
      ctx.restore();
    }
    drawBeacon(b) {
      const ctx = this.ctx, col = b.lit ? '80,255,160' : '120,200,255';
      ctx.save();
      ctx.fillStyle = 'rgba(' + col + ',0.3)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',0.95)';
      ctx.lineWidth = 4 * this.px;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    drawGem(g) {
      const ctx = this.ctx, r = 15, w = r * 0.72;
      ctx.fillStyle = '#3cf2ff';
      ctx.strokeStyle = '#0b4a73';
      ctx.lineWidth = 3 * this.px;
      ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(g.x, g.y - r); ctx.lineTo(g.x + w, g.y - r * 0.2); ctx.lineTo(g.x, g.y + r); ctx.lineTo(g.x - w, g.y - r * 0.2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }

  // ---------- minimap ----------
  // Fog of war: the map starts black and shows only what has been on screen - corridors, gems, the goal and beacons
  // appear once the screen has shown them.
  const FOG = '#0d0b1a';
  class Minimap {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.base = document.createElement('canvas');
      this.fog = document.createElement('canvas');
      this.layer = document.createElement('canvas');
      this.maze = null;
      this.dirty = true;
      if (window.ResizeObserver) new ResizeObserver(() => (this.dirty = true)).observe(canvas);
    }
    size() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(40, Math.round(r.width * dpr)), H = Math.max(40, Math.round(r.height * dpr));
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; return true; }
      return false;
    }
    setMaze(maze) {
      this.maze = maze;
      this.size();
      const W = this.canvas.width, H = this.canvas.height, b = maze.bounds, pad = 8;
      const sc = Math.min((W - 2 * pad) / (b.maxX - b.minX), (H - 2 * pad) / (b.maxY - b.minY));
      this.sc = sc;
      this.ox = W / 2 - ((b.minX + b.maxX) / 2) * sc;
      this.oy = H / 2 - ((b.minY + b.maxY) / 2) * sc;
      for (const c of [this.base, this.fog]) { c.width = W; c.height = H; }
      const g = this.base.getContext('2d');
      g.clearRect(0, 0, W, H);
      g.lineCap = 'round'; g.lineJoin = 'round';
      this.swEdges = maze.edges.filter((e) => e.sw); // drawn each frame, up or down (see switches())
      for (const e of maze.edges) {
        if (e.sw) continue;
        g.strokeStyle = e.type === 'blink' ? 'rgba(255,255,255,0.45)' : e.ice ? '#c4f1ff' : '#fff';
        g.lineWidth = Math.max(1.5, e.hw * 2 * sc);
        g.beginPath();
        e.pts.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, this.ox + q.x * sc, this.oy + q.y * sc));
        g.stroke();
      }
      const f = this.fog.getContext('2d');
      f.globalCompositeOperation = 'source-over';
      f.fillStyle = FOG;
      f.fillRect(0, 0, W, H);
      f.globalCompositeOperation = 'destination-out';
    }
    // Uncover a world rectangle (what the screen showed).
    reveal(r) {
      if (!this.maze) return;
      const x0 = Math.floor(this.ox + r.x0 * this.sc), y0 = Math.floor(this.oy + r.y0 * this.sc);
      const x1 = Math.ceil(this.ox + r.x1 * this.sc), y1 = Math.ceil(this.oy + r.y1 * this.sc);
      this.fog.getContext('2d').fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // view: the world rectangle on screen, outlined so the map and the screen line up. Markers show once seen.
    draw(pos, goal, gems, view, flags, boxes, mech, path) {
      if (!this.maze) return;
      const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
      const u = W / 150;
      g.clearRect(0, 0, W, H);
      g.drawImage(this.base, 0, 0);
      this.switches(g, mech, u); // under the fog, like every corridor
      g.drawImage(this.fog, 0, 0);
      if (path && path.length > 1) { // the Path item shows the way on the map too, fog or not
        g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#ffe27a'; g.lineWidth = Math.max(1.5, 1.4 * u);
        g.beginPath(); path.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, this.ox + q.x * this.sc, this.oy + q.y * this.sc)); g.stroke(); g.restore();
      }
      const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(this.ox + x * this.sc, this.oy + y * this.sc, r, 0, TAU); g.fill(); };
      if (flags) for (const c of flags) if (c.seen) { dot(c.x, c.y, 3.4 * u, '#000'); dot(c.x, c.y, 2.4 * u, c.lit ? '#3ddc97' : '#ffc53d'); }
      if (boxes) for (const b of boxes) if (b.seen) { dot(b.x, b.y, 2.9 * u, '#000'); dot(b.x, b.y, 2 * u, '#d38bff'); }
      if (mech && mech.doors) { // what's been seen of the mechanics
        for (const d of mech.doors) if (d.seen) { // as in the maze: shut, a bar with a dark rim; opened, a dashed threshold
          const ax = this.ox + d.ax * this.sc, ay = this.oy + d.ay * this.sc, bx = this.ox + d.bx * this.sc, by = this.oy + d.by * this.sc;
          g.save();
          if (d.open) {
            g.setLineDash([1.6 * u, 1.4 * u]); g.lineCap = 'round'; g.strokeStyle = d.color; g.lineWidth = 1.2 * u;
            g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
          } else doorBar(g, ax, ay, bx, by, d.color, Math.max(ICON * this.sc, 0.2 * u), false);
          g.restore();
        }
        for (const k of mech.keys) if (k.seen && !k.taken) { const f = Math.max(this.sc, (2.6 * u) / KEY_S); keyIcon(g, this.ox + k.x * this.sc, this.oy + k.y * this.sc, KEY_S * f, k.color, KEY_TILT, (ICON * f) * 0.75); }
        for (const pl of mech.plates) if (pl.seen) { dot(pl.x, pl.y, 3 * u, '#000'); dot(pl.x, pl.y, 2.2 * u, pl.color); }
        for (const gb of mech.gboxes || []) if (gb.seen && !gb.out) { const x = this.ox + gb.x * this.sc, y = this.oy + gb.y * this.sc, h = 2.6 * u; g.fillStyle = '#000'; g.fillRect(x - h - 0.8 * u, y - h - 0.8 * u, 2 * h + 1.6 * u, 2 * h + 1.6 * u); g.fillStyle = '#ffd84a'; g.fillRect(x - h, y - h, 2 * h, 2 * h); }
        for (const pt of mech.portals) for (const e of [pt.a, pt.b]) if (e.seen) { dot(e.x, e.y, 3.2 * u, pt.color); dot(e.x, e.y, 1.6 * u, '#000'); }
        const now = MZ.Game ? MZ.Game.playT : 0;
        for (const bx of mech.toxes || []) if (bx.seen) { // a Tox Box: its track, and the box where it is now
          g.save(); g.lineCap = 'butt'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(160,150,205,0.5)'; g.lineWidth = Math.max(1.5, bx.s * this.sc);
          g.beginPath(); bx.tiles.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, this.ox + q.x * this.sc, this.oy + q.y * this.sc)); g.stroke(); g.restore();
          const st = MZ.toxAt(bx, now), T = bx.tiles[st.f > 0.5 ? st.j : st.i], x = this.ox + T.x * this.sc, y = this.oy + T.y * this.sc, q = Math.max(2.2 * u, bx.s * this.sc * 0.5);
          g.fillStyle = '#000'; g.fillRect(x - q - 0.7 * u, y - q - 0.7 * u, 2 * q + 1.4 * u, 2 * q + 1.4 * u); g.fillStyle = '#a79fd8'; g.fillRect(x - q, y - q, 2 * q, 2 * q);
        }
        for (const mv of mech.movers) if (mv.seen) {
          g.setLineDash([2 * u, 2 * u]); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1, u);
          g.beginPath(); g.moveTo(this.ox + mv.a.x * this.sc, this.oy + mv.a.y * this.sc); g.lineTo(this.ox + mv.b.x * this.sc, this.oy + mv.b.y * this.sc); g.stroke(); g.setLineDash([]);
        }
      }
      if (gems) for (const gm of gems) if (!gm.taken && gm.seen) dot(gm.x, gm.y, 2.5 * u, '#3cf2ff');
      if (goal && goal.seen) dot(goal.x, goal.y, 4.5 * u, '#ffb300');
      if (pos && view) {
        g.strokeStyle = 'rgba(255,61,127,0.9)';
        g.lineWidth = Math.max(1.5, u);
        g.strokeRect(this.ox + view.x0 * this.sc, this.oy + view.y0 * this.sc, (view.x1 - view.x0) * this.sc, (view.y1 - view.y0) * this.sc);
      }
      if (pos) { dot(pos.x, pos.y, 4.5 * u, '#000'); dot(pos.x, pos.y, 3.2 * u, '#ff3d7f'); }
    }
    // Switch bridges on the map: up, a corridor in the switch's colour; down, a thin dashed line in it (a gap, the way
    // an opened door is dashed). For a moment after a press, the bridges of that colour pulse.
    switches(g, mech, u) {
      if (!this.swEdges || !this.swEdges.length) return;
      const w = MZ.Game && MZ.Game.world, sw = (w && w.sw) || {}, now = (MZ.Game && MZ.Game.t) || 0;
      g.save();
      g.lineJoin = 'round';
      for (const e of this.swEdges) {
        const c = swColor(e), up = (sw[e.sw.g] | 0) === e.sw.on, k = (now - pressedAt(mech, e.sw.g)) / 1.5;
        g.beginPath();
        e.pts.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, this.ox + q.x * this.sc, this.oy + q.y * this.sc));
        const full = Math.max(1.5, e.hw * 2 * this.sc);
        if (k >= 0 && k < 1) { // just pressed: a pulsing halo
          g.strokeStyle = c; g.lineCap = 'round'; g.globalAlpha = (1 - k) * (0.5 + 0.5 * Math.cos(k * 6 * Math.PI)) * 0.7;
          g.lineWidth = full + 5 * u; g.stroke();
          g.globalAlpha = 1;
        }
        g.strokeStyle = c;
        if (up) { g.lineCap = 'butt'; g.lineWidth = full; g.setLineDash([]); }
        else { g.lineCap = 'butt'; g.lineWidth = Math.max(1, 1.6 * u); g.setLineDash([2.4 * u, 1.6 * u]); }
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    }
    // Endless: a radar of what's near the player, fogged except where the screen has been (seen: rectangles).
    drawRadar(world, pos, beacons, view, seen, boxes) {
      const g = this.ctx, W = this.canvas.width, H = this.canvas.height, R = 1000, sc = Math.min(W, H) / (2 * R);
      const L = this.layer;
      if (L.width !== W || L.height !== H) { L.width = W; L.height = H; }
      const l = L.getContext('2d');
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.clearRect(0, 0, W, H);
      l.translate(W / 2 - pos.x * sc, H / 2 - pos.y * sc);
      l.lineCap = 'round';
      const near = world.visibleParts(pos.x - R, pos.y - R, pos.x + R, pos.y + R);
      for (const p of near) {
        for (const e of p.edges) {
          l.strokeStyle = e.type === 'blink' ? 'rgba(255,255,255,0.4)' : '#fff';
          l.lineWidth = Math.max(1.5, e.hw * 2 * sc);
          l.beginPath(); l.moveTo(e.pts[0].x * sc, e.pts[0].y * sc);
          for (let i = 1; i < e.pts.length; i++) l.lineTo(e.pts[i].x * sc, e.pts[i].y * sc);
          l.stroke();
        }
      }
      // Keep only what has been on screen.
      l.globalCompositeOperation = 'destination-in';
      l.fillStyle = '#000';
      l.beginPath();
      for (const r of seen) l.rect(r.x0 * sc, r.y0 * sc, (r.x1 - r.x0) * sc, (r.y1 - r.y0) * sc);
      if (seen.length) l.fill(); else { l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, W, H); l.translate(W / 2 - pos.x * sc, H / 2 - pos.y * sc); }
      l.globalCompositeOperation = 'source-over';
      for (const p of near) if (p.data.gems) for (const gm of p.data.gems) if (!gm.taken && gm.seen) { l.fillStyle = '#3cf2ff'; l.beginPath(); l.arc(gm.x * sc, gm.y * sc, 3, 0, TAU); l.fill(); }
      if (beacons) for (const b of beacons) if (b.seen) { l.fillStyle = b.lit ? '#50ffa0' : '#78c8ff'; l.beginPath(); l.arc(b.x * sc, b.y * sc, 4, 0, TAU); l.fill(); }
      if (boxes) for (const b of boxes) if (b.seen) { l.fillStyle = '#d38bff'; l.beginPath(); l.arc(b.x * sc, b.y * sc, 3, 0, TAU); l.fill(); }
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2 - 1, 0, TAU); g.clip();
      g.fillStyle = FOG; g.fillRect(0, 0, W, H);
      g.drawImage(L, 0, 0);
      g.restore();
      if (view) {
        g.strokeStyle = 'rgba(255,61,127,0.9)';
        g.lineWidth = 1.5;
        g.strokeRect(W / 2 + (view.x0 - pos.x) * sc, H / 2 + (view.y0 - pos.y) * sc, (view.x1 - view.x0) * sc, (view.y1 - view.y0) * sc);
      }
      g.fillStyle = '#ff3d7f'; g.beginPath(); g.arc(W / 2, H / 2, 4, 0, TAU); g.fill();
    }
  }

  Renderer.keySVG = keySVG;
  MZ.Renderer = Renderer;
  MZ.Minimap = Minimap;
  MZ.FLOORS = FLOORS;
})();
