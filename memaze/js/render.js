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
  function buildPaths(part) {
    const solid = new Path2D();
    for (const s of part.segs) if (!s.blink) capsule(solid, s.ax, s.ay, s.bx, s.by, s.hw);
    part.paths = { solid, blinks: part.blinks.map((e) => ({ e, line: edgeLine(e) })) };
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
  // Bridges that are up get their fill; gone ones leave a faint dashed ghost of where they come back.
  function bridgeFills(g, blinks, th, px) {
    for (const b of blinks) {
      if (b.a > 0) {
        g.globalAlpha = b.a; g.strokeStyle = th.blink; g.lineWidth = 2 * b.e.hw; g.stroke(b.line); g.globalAlpha = 1;
        continue;
      }
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2 * b.e.hw; g.stroke(b.line);
      g.setLineDash([12 * px, 14 * px]);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3 * px; g.stroke(b.line);
      g.setLineDash([]);
    }
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

    // s: { world, cam, t, floor, hue, rgb, start, goal, gems, beacons } (other fields are ignored).
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
      this.px = px;

      // One union path per frame: every pass paints each pixel once, even where tiles overlap.
      const union = new Path2D(), blinks = [];
      for (const p of parts) {
        const paths = p.paths || buildPaths(p);
        union.addPath(paths.solid);
        for (const b of paths.blinks) blinks.push({ e: b.e, line: b.line, a: blinkAlpha(b.e.blink, t) });
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
      ctx.lineCap = 'butt';

      if (s.start) this.drawStart(s.start, th);
      if (s.goal && !s.goal.media) this.drawGoal(s.goal, th);
      if (s.beacons) for (const b of s.beacons) this.drawBeacon(b);
      if (s.gems) for (const g of s.gems) if (!g.taken) this.drawGem(g);
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
  class Minimap {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.base = document.createElement('canvas');
      this.fog = document.createElement('canvas');
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
      for (const e of maze.edges) {
        g.strokeStyle = e.type === 'blink' ? 'rgba(255,255,255,0.45)' : '#fff';
        g.lineWidth = Math.max(1.5, e.hw * 2 * sc);
        g.beginPath();
        e.pts.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, this.ox + q.x * sc, this.oy + q.y * sc));
        g.stroke();
      }
      const f = this.fog.getContext('2d');
      f.globalCompositeOperation = 'source-over';
      f.fillStyle = 'rgba(8,8,20,0.92)';
      f.fillRect(0, 0, W, H);
      f.globalCompositeOperation = 'destination-out';
    }
    reveal(x, y, r) {
      if (!this.maze) return;
      const f = this.fog.getContext('2d');
      f.beginPath();
      f.arc(this.ox + x * this.sc, this.oy + y * this.sc, Math.max(4, (r || 330) * this.sc), 0, TAU);
      f.fill();
    }
    // view: the world width/height on screen, outlined around the player so the map and the screen line up.
    draw(mode, pos, goal, gems, view) {
      if (!this.maze) return;
      const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = 0.9;
      g.drawImage(this.base, 0, 0);
      g.globalAlpha = 1;
      if (mode === 'explored') g.drawImage(this.fog, 0, 0);
      const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(this.ox + x * this.sc, this.oy + y * this.sc, r, 0, TAU); g.fill(); };
      const u = W / 150;
      if (gems) for (const gm of gems) if (!gm.taken) dot(gm.x, gm.y, 2.5 * u, '#3cf2ff');
      if (goal) dot(goal.x, goal.y, 4.5 * u, '#ffb300');
      if (pos && view) {
        g.strokeStyle = 'rgba(255,61,127,0.9)';
        g.lineWidth = Math.max(1.5, u);
        g.strokeRect(this.ox + (pos.x - view.w / 2) * this.sc, this.oy + (pos.y - view.h / 2) * this.sc, view.w * this.sc, view.h * this.sc);
      }
      if (pos) { dot(pos.x, pos.y, 4.5 * u, '#000'); dot(pos.x, pos.y, 3.2 * u, '#ff3d7f'); }
    }
    // Endless: a radar of what's near the player.
    drawRadar(world, pos, beacons, view) {
      const g = this.ctx, W = this.canvas.width, H = this.canvas.height, R = 1000, sc = Math.min(W, H) / (2 * R);
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2 - 1, 0, TAU); g.clip();
      g.fillStyle = 'rgba(8,8,20,0.55)'; g.fillRect(0, 0, W, H);
      g.translate(W / 2 - pos.x * sc, H / 2 - pos.y * sc);
      g.lineCap = 'round';
      for (const p of world.visibleParts(pos.x - R, pos.y - R, pos.x + R, pos.y + R)) {
        for (const e of p.edges) {
          g.strokeStyle = e.type === 'blink' ? 'rgba(255,255,255,0.4)' : '#fff';
          g.lineWidth = Math.max(1.5, e.hw * 2 * sc);
          g.beginPath(); g.moveTo(e.pts[0].x * sc, e.pts[0].y * sc);
          for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i].x * sc, e.pts[i].y * sc);
          g.stroke();
        }
        if (p.data.gems) for (const gm of p.data.gems) if (!gm.taken) { g.fillStyle = '#3cf2ff'; g.beginPath(); g.arc(gm.x * sc, gm.y * sc, 3, 0, TAU); g.fill(); }
      }
      if (beacons) for (const b of beacons) { g.fillStyle = b.lit ? '#50ffa0' : '#78c8ff'; g.beginPath(); g.arc(b.x * sc, b.y * sc, 4, 0, TAU); g.fill(); }
      g.restore();
      if (view) {
        g.strokeStyle = 'rgba(255,61,127,0.9)';
        g.lineWidth = 1.5;
        g.strokeRect(W / 2 - view.w * sc / 2, H / 2 - view.h * sc / 2, view.w * sc, view.h * sc);
      }
      g.fillStyle = '#ff3d7f'; g.beginPath(); g.arc(W / 2, H / 2, 4, 0, TAU); g.fill();
    }
  }

  MZ.Renderer = Renderer;
  MZ.Minimap = Minimap;
  MZ.FLOORS = FLOORS;
})();
