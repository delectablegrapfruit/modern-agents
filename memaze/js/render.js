/* Memaze — drawing the maze floor, pickups and effects on a canvas that sits over the background; plus the minimap. */
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
    const solid = new Path2D(), over = { ice: new Path2D(), sticky: new Path2D(), bridge: new Path2D() }, has = {};
    for (const s of part.segs) {
      if (s.blink) continue;
      capsule(solid, s.ax, s.ay, s.bx, s.by, s.hw);
      if (over[s.type]) { capsule(over[s.type], s.ax, s.ay, s.bx, s.by, s.hw); has[s.type] = true; }
    }
    part.paths = { solid, over, has, blinks: part.blinks.map((e) => ({ e, line: edgeLine(e) })) };
    return part.paths;
  }

  const FLOORS = ['classic', 'neon', 'glass', 'retro'];
  const patCache = new Map();
  function checker(ctx, a, b, size) {
    const k = a + b + size;
    if (patCache.has(k)) return patCache.get(k);
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, size * 2, size * 2);
    g.fillStyle = b; g.fillRect(0, 0, size, size); g.fillRect(size, size, size, size);
    const p = ctx.createPattern(c, 'repeat');
    patCache.set(k, p);
    return p;
  }
  function stripes(ctx, a, b) {
    const k = 'st' + a + b;
    if (patCache.has(k)) return patCache.get(k);
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, 24, 24);
    g.strokeStyle = b; g.lineWidth = 5;
    g.beginPath(); g.moveTo(-6, 30); g.lineTo(30, -6); g.moveTo(-18, 18); g.lineTo(18, -18); g.moveTo(6, 42); g.lineTo(42, 6); g.stroke();
    const p = ctx.createPattern(c, 'repeat');
    patCache.set(k, p);
    return p;
  }

  function theme(ctx, style, hue, rgb) {
    const H = Math.round(hue / 5) * 5;
    switch (style) {
      case 'neon': return {
        shadow: null, glow: rgb, rim: rgb, rimW: 4, floor: '#0d0b1c', blink: '#221b3d',
        ice: 'rgba(120,220,255,0.28)', sticky: 'rgba(200,110,40,0.35)', bridge: 'rgba(255,255,255,0.08)',
      };
      case 'glass': return {
        shadow: 'rgba(0,0,0,0.16)', rim: 'rgba(255,255,255,0.9)', rimW: 3, floor: 'rgba(255,255,255,0.2)', translucent: true, blink: 'rgba(255,255,255,0.35)',
        ice: 'rgba(150,230,255,0.4)', sticky: 'rgba(120,70,30,0.4)', bridge: 'rgba(255,220,150,0.3)',
      };
      case 'retro': return {
        shadow: null, rim: '#000', rimW: 2, floor: '#2f55ff', blink: '#7d95ff',
        ice: 'rgba(160,240,255,0.55)', sticky: 'rgba(110,60,20,0.6)', bridge: '#3a64ff',
      };
      default: return {
        shadow: 'rgba(0,0,0,0.3)', rim: 'hsl(' + H + ',42%,36%)', rimW: 6, blink: 'hsl(' + ((H + 180) % 360) + ',60%,78%)',
        floor: checker(ctx, 'hsl(' + H + ',40%,90%)', 'hsl(' + H + ',38%,81%)', 40),
        ice: 'rgba(120,215,255,0.62)', sticky: stripes(ctx, 'rgba(120,70,30,0.72)', 'rgba(80,45,15,0.72)'),
        bridge: stripes(ctx, 'hsl(32,55%,62%)', 'hsl(30,50%,52%)'),
      };
    }
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1; this.w = 1; this.h = 1; this.m = 0;
    }
    resize(w, h, dpr, margin) {
      this.w = w; this.h = h; this.dpr = dpr; this.m = margin;
      const W = Math.round((w + 2 * margin) * dpr), H = Math.round((h + 2 * margin) * dpr);
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      Object.assign(this.canvas.style, { width: w + 2 * margin + 'px', height: h + 2 * margin + 'px', left: -margin + 'px', top: -margin + 'px' });
    }
    layer() {
      const c = this._layer || (this._layer = document.createElement('canvas'));
      if (c.width !== this.canvas.width || c.height !== this.canvas.height) { c.width = this.canvas.width; c.height = this.canvas.height; }
      return c;
    }
    // World point → CSS pixel relative to the viewport.
    toScreen(cam, x, y) { return { x: this.w / 2 + (x - cam.x) * cam.zoom, y: this.h / 2 + (y - cam.y) * cam.zoom }; }

    draw(s) {
      const { ctx, dpr, m } = this;
      const cam = s.cam, z = cam.zoom, t = s.t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!s.world) return;
      const k = dpr * z;
      ctx.setTransform(k, 0, 0, k, dpr * (m + this.w / 2) - cam.x * k, dpr * (m + this.h / 2) - cam.y * k);
      const hw = (this.w / 2 + m) / z + 80, hh = (this.h / 2 + m) / z + 80;
      const parts = s.world.visibleParts(cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh);
      const th = theme(ctx, s.floor, s.hue, s.rgb);
      for (const p of parts) if (!p.paths) buildPaths(p);

      const blinkState = (e) => {
        const ph = MZ.blinkPhase(e.blink, t), on = e.blink.on;
        if (ph >= on) return 0;
        const warn = 0.7 / e.blink.period;
        if (ph > on - warn) return Math.floor((on - ph) * e.blink.period * 10) % 2 ? 0.35 : 0.85;
        return 1;
      };

      // One union path per frame: every pass paints each pixel once, even where tiles overlap.
      const union = new Path2D(), over = { ice: null, sticky: null, bridge: null };
      for (const p of parts) {
        union.addPath(p.paths.solid);
        for (const type in over) if (p.paths.has[type]) (over[type] || (over[type] = new Path2D())).addPath(p.paths.over[type]);
      }
      if (th.shadow) {
        ctx.save();
        ctx.translate(0, 16);
        ctx.fillStyle = th.shadow;
        ctx.fill(union);
        ctx.restore();
      }
      if (th.glow) {
        ctx.strokeStyle = th.glow;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 24;
        ctx.stroke(union);
        ctx.globalAlpha = 1;
      }
      ctx.lineJoin = 'round';
      if (th.translucent) {
        // See-through floor: stroke the rim on a side layer and cut the inside away, so the capsule seams inside the
        // floor never show.
        const L = this.layer(), g = L.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, L.width, L.height);
        g.setTransform(ctx.getTransform());
        g.lineJoin = 'round';
        g.strokeStyle = th.rim;
        g.lineWidth = th.rimW * 2;
        g.stroke(union);
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
        ctx.strokeStyle = th.rim;
        ctx.lineWidth = th.rimW * 2;
        ctx.stroke(union);
        ctx.fillStyle = th.floor;
        ctx.fill(union);
      }
      for (const type in over) {
        if (!over[type]) continue;
        ctx.fillStyle = th[type];
        ctx.fill(over[type]);
      }
      // Vanishing bridges: drawn as round-capped strokes of their centre line, so they have no seams.
      ctx.lineCap = 'round';
      for (const p of parts) for (const b of p.paths.blinks) {
        const a = blinkState(b.e), hw = b.e.hw;
        if (a > 0) {
          ctx.globalAlpha = a;
          ctx.strokeStyle = s.floor === 'neon' ? s.rgb : th.rim;
          ctx.lineWidth = 2 * (hw + th.rimW);
          ctx.stroke(b.line);
          ctx.strokeStyle = th.blink;
          ctx.lineWidth = 2 * hw;
          ctx.stroke(b.line);
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 2 * hw;
          ctx.stroke(b.line);
          ctx.save();
          ctx.setLineDash([12, 14]);
          ctx.lineDashOffset = -t * 30;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 3;
          ctx.stroke(b.line);
          ctx.restore();
        }
      }
      ctx.lineCap = 'butt';

      this.drawPads(s.pads, t);
      if (s.start) this.drawStart(s.start, t);
      if (s.goal && !s.goal.media) this.drawGoal(s.goal, t);
      if (s.beacons) for (const b of s.beacons) this.drawBeacon(b, t);
      if (s.gems) for (const g of s.gems) if (!g.taken) this.drawGem(g, t);
      if (s.particles) this.drawParticles(s.particles);
      if (s.ball && s.ball.shadow > 0) {
        const b = s.ball;
        ctx.fillStyle = 'rgba(0,0,0,' + (0.32 * b.shadow).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(b.x + 3, b.y + b.r * 0.55, b.r * 0.95, b.r * 0.6, 0, 0, TAU);
        ctx.fill();
      }
    }

    drawPads(pads, t) {
      if (!pads) return;
      const ctx = this.ctx;
      for (const p of pads) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.dy, p.dx));
        const r = p.r;
        ctx.fillStyle = 'rgba(255,200,0,0.28)';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-r, -r * 0.7, 2 * r, 1.4 * r, 8) : ctx.rect(-r, -r * 0.7, 2 * r, 1.4 * r); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const ph = (t * 2.2 - i * 0.33) % 1;
          ctx.strokeStyle = 'rgba(255,' + (140 + 100 * ph | 0) + ',0,' + (0.35 + 0.65 * (1 - ph)).toFixed(2) + ')';
          ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const x = -r * 0.55 + i * r * 0.45;
          ctx.beginPath(); ctx.moveTo(x - r * 0.18, -r * 0.4); ctx.lineTo(x + r * 0.16, 0); ctx.lineTo(x - r * 0.18, r * 0.4); ctx.stroke();
        }
        ctx.restore();
      }
    }
    drawStart(st, t) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(40,200,120,0.75)';
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r * 0.78, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    drawGoal(g, t) {
      const ctx = this.ctx, r = g.r;
      ctx.save();
      ctx.translate(g.x, g.y);
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.95);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.35, 'rgba(255,220,80,0.8)');
      grd.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, r * (0.9 + 0.05 * Math.sin(t * 4)), 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(t * (i % 2 ? -1.4 : 1.1) + i);
        ctx.strokeStyle = i === 1 ? 'rgba(255,255,255,0.95)' : 'rgba(255,170,0,0.95)';
        ctx.lineWidth = 5;
        ctx.setLineDash([r * 0.3, r * 0.18]);
        ctx.beginPath(); ctx.arc(0, 0, r * (0.36 + 0.2 * i), 0, TAU); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(120,60,0,0.9)';
      ctx.lineWidth = 5;
      ctx.font = '900 ' + Math.round(r * 0.34) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('GOAL', 0, 0);
      ctx.fillText('GOAL', 0, 0);
      ctx.restore();
    }
    drawBeacon(b, t) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(b.x, b.y);
      const col = b.lit ? '80,255,160' : '120,200,255';
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
      grd.addColorStop(0, 'rgba(' + col + ',0.9)');
      grd.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, b.r * (1 + 0.08 * Math.sin(t * 5)), 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 0.55, t * 2, t * 2 + 4.4); ctx.stroke();
      ctx.restore();
    }
    drawGem(g, t) {
      const ctx = this.ctx;
      const bob = Math.sin(t * 3 + g.x * 0.01) * 4, spin = Math.cos(t * 2.4 + g.y * 0.01);
      const r = 15;
      ctx.save();
      ctx.translate(g.x, g.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(0, r + 8 - bob, r * 0.7, r * 0.3, 0, 0, TAU); ctx.fill();
      const w = r * 0.72 * Math.max(0.18, Math.abs(spin));
      ctx.fillStyle = spin > 0 ? '#3cf2ff' : '#19b6e6';
      ctx.strokeStyle = '#0b4a73';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(w, -r * 0.2); ctx.lineTo(0, r); ctx.lineTo(-w, -r * 0.2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(w * 0.5, -r * 0.3); ctx.lineTo(0, -r * 0.1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    drawParticles(ps) {
      const ctx = this.ctx;
      for (const p of ps) {
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.shape === 'ring') {
          ctx.strokeStyle = p.color; ctx.lineWidth = 4 * a;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a), 0, TAU); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
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
        g.strokeStyle = e.type === 'blink' ? 'rgba(255,255,255,0.45)' : e.type === 'ice' ? '#9be7ff' : e.type === 'sticky' ? '#b0773f' : '#fff';
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
    reveal(x, y) {
      if (!this.maze) return;
      const f = this.fog.getContext('2d');
      f.beginPath();
      f.arc(this.ox + x * this.sc, this.oy + y * this.sc, Math.max(6, 330 * this.sc), 0, TAU);
      f.fill();
    }
    draw(mode, ball, goal, gems, t) {
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
      if (goal) dot(goal.x, goal.y, (4 + Math.sin(t * 5)) * u, '#ffb300');
      if (ball) { dot(ball.x, ball.y, 4.5 * u, '#000'); dot(ball.x, ball.y, 3.2 * u, '#ff3d7f'); }
    }
    // Endless: a radar of what's near the ball.
    drawRadar(world, ball, t, beacons) {
      const g = this.ctx, W = this.canvas.width, H = this.canvas.height, R = 1500, sc = Math.min(W, H) / (2 * R);
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2 - 1, 0, TAU); g.clip();
      g.fillStyle = 'rgba(8,8,20,0.55)'; g.fillRect(0, 0, W, H);
      g.translate(W / 2 - ball.x * sc, H / 2 - ball.y * sc);
      g.lineCap = 'round';
      for (const p of world.visibleParts(ball.x - R, ball.y - R, ball.x + R, ball.y + R)) {
        for (const e of p.edges) {
          g.strokeStyle = e.type === 'blink' ? 'rgba(255,255,255,0.4)' : e.type === 'ice' ? '#9be7ff' : e.type === 'sticky' ? '#b0773f' : '#fff';
          g.lineWidth = Math.max(1.5, e.hw * 2 * sc);
          g.beginPath(); g.moveTo(e.pts[0].x * sc, e.pts[0].y * sc);
          for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i].x * sc, e.pts[i].y * sc);
          g.stroke();
        }
        if (p.data.gems) for (const gm of p.data.gems) if (!gm.taken) { g.fillStyle = '#3cf2ff'; g.beginPath(); g.arc(gm.x * sc, gm.y * sc, 3, 0, TAU); g.fill(); }
      }
      if (beacons) for (const b of beacons) { g.fillStyle = b.lit ? '#50ffa0' : '#78c8ff'; g.beginPath(); g.arc(b.x * sc, b.y * sc, 4 + Math.sin(t * 5), 0, TAU); g.fill(); }
      g.restore();
      g.fillStyle = '#ff3d7f'; g.beginPath(); g.arc(W / 2, H / 2, 4, 0, TAU); g.fill();
    }
  }

  MZ.Renderer = Renderer;
  MZ.Minimap = Minimap;
  MZ.FLOORS = FLOORS;
})();
