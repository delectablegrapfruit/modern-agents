// Lull — a small 2D physics layer for the item effects: blocks that fly, tumble, fall, bounce and spiral, and the
// chips, dust, sparks and grains they break into. Purely cosmetic: the board is already final when these start, so
// nothing here ever feeds back into the game. Everything lives in fixed pools (recycled, never grown), positions
// are centres in CSS pixels, and gravity points wherever the board's floor is on screen (Upside Down, Sideways).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const TAU = Math.PI * 2;
  const G = 60; // gravity, in cells per second squared

  function freshBody() {
    return {
      on: false, mode: 'free', x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, size: 10, sx: 1, sy: 1, alpha: 1,
      color: '#fff', skin: 'flat', paint: null, life: 0, max: 1, fadeAt: 1, wake: 0, next: 'free', act: null,
      key: -1, rest: 0.3, fric: 0.8, gs: 1, solid: false, squash: 0, trail: null,
      // drop: a straight fall along gravity from (x0, y0) to (tx, ty), timed from the moment it wakes
      x0: 0, y0: 0, tx: 0, ty: 0, v0: 0, dist: 0, t: 0, landed: false, settle: 0.05,
      // spiral: pulled into (cx, cy)
      cx: 0, cy: 0, rad: 0, ang: 0, w0: 0, r0: 0, vr: 0, acc: 0,
      onLand: null, onDone: null,
    };
  }
  function freshPart() {
    return { on: false, kind: 'chip', x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, life: 0, max: 1, delay: 0, size: 2, color: '#fff', gs: 1, drag: 0, bounce: false };
  }

  class World {
    constructor(o) {
      o = o || {};
      this.maxBodies = o.maxBodies || 320;
      this.maxParts = o.maxParts || 1400;
      this.bodies = []; this.parts = [];
      for (let i = 0; i < this.maxBodies; i++) this.bodies.push(freshBody());
      for (let i = 0; i < this.maxParts; i++) this.parts.push(freshPart());
      this.nb = 0; this.np = 0; this.rb = 0; this.rp = 0;
      this.timers = [];
      this.box = { x: 0, y: 0, w: 100, h: 100 };
      this.gx = 0; this.gy = 1; this.s = 10; this.g = G * 10;
      this.solid = null;
      this.hiding = 0;
    }

    get active() { return this.nb > 0 || this.np > 0 || this.timers.length > 0; }

    clear() {
      for (let i = 0; i < this.nb; i++) this.bodies[i].on = false;
      for (let i = 0; i < this.np; i++) this.parts[i].on = false;
      this.nb = 0; this.np = 0; this.timers.length = 0; this.hiding = 0;
    }

    /**
     * Where things happen: the board's box on screen, the unit direction gravity pulls in (the board's "down" on
     * screen), the cell size, and optionally solid(px, py) — is there a settled block at that screen point?
     */
    setFrame(box, gx, gy, s, solid) {
      this.box.x = box.x; this.box.y = box.y; this.box.w = box.w; this.box.h = box.h;
      this.gx = gx; this.gy = gy; this.s = s; this.g = G * s;
      this.solid = solid || null;
    }

    /** A new body (a whole block). Fields not given keep their defaults. When the pool is full the oldest-ish goes. */
    body(o) {
      let b;
      if (this.nb < this.maxBodies) b = this.bodies[this.nb++];
      else { b = this.bodies[this.rb++ % this.maxBodies]; if (b.key >= 0) this.hiding--; }
      const d = DEFAULT_BODY;
      for (const k in d) b[k] = d[k];
      for (const k in o) b[k] = o[k];
      b.on = true;
      if (b.mode === 'drop') this.aim(b);
      if (b.mode === 'spiral') { b.r0 = b.rad; b.vr = 0; }
      if (b.key >= 0) this.hiding++;
      return b;
    }

    /** A new particle. */
    part(kind, x, y, vx, vy, max, size, color, gs, drag) {
      let p;
      if (this.np < this.maxParts) p = this.parts[this.np++];
      else p = this.parts[this.rp++ % this.maxParts];
      p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0; p.max = max; p.delay = 0;
      p.size = size; p.color = color; p.gs = gs == null ? 1 : gs; p.drag = drag || 0; p.a = Math.random() * TAU; p.va = 0;
      p.bounce = kind === 'chip' || kind === 'flat' || kind === 'grain';
      return p;
    }

    /** Runs fn after t seconds (sound-free choreography: a flash, a ring, a shake). */
    after(t, fn) { this.timers.push({ t, fn }); }

    /** A drop body's straight path, measured along gravity. */
    aim(b) {
      b.x0 = b.x; b.y0 = b.y;
      b.dist = Math.max(0, (b.tx - b.x) * this.gx + (b.ty - b.y) * this.gy);
      b.t = 0; b.landed = false; b.squash = 0;
    }

    // ---- stepping ---------------------------------------------------------------------------------------------------

    step(dt) {
      if (dt <= 0) return;
      dt = Math.min(dt, 0.05);
      for (let i = 0; i < this.timers.length; i++) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { this.timers.splice(i--, 1); tm.fn(); }
      }
      for (let i = 0; i < this.nb; i++) {
        const b = this.bodies[i];
        b.life += dt;
        if (!this.stepBody(b, dt) || b.life >= b.max) { this.killBody(i); i--; }
      }
      for (let i = 0; i < this.np; i++) {
        const p = this.parts[i];
        p.life += dt;
        if (p.life >= p.max) { this.killPart(i); i--; continue; }
        if (p.life < p.delay) continue;
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vx += this.gx * this.g * p.gs * dt; p.vy += this.gy * this.g * p.gs * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.va) p.a += p.va * dt;
        if (p.bounce) this.floor(p, p.size * 0.5, 0.3, 0.6);
      }
    }

    killBody(i) {
      const b = this.bodies[i];
      b.on = false;
      if (b.key >= 0) this.hiding--;
      const cb = b.onDone;
      // Swap the last live body into this slot so live bodies stay packed at the front.
      const last = this.nb - 1;
      if (i !== last) { this.bodies[i] = this.bodies[last]; this.bodies[last] = b; }
      this.nb--;
      if (cb) { b.onDone = null; cb(b); }
    }
    killPart(i) {
      const p = this.parts[i];
      p.on = false;
      const last = this.np - 1;
      if (i !== last) { this.parts[i] = this.parts[last]; this.parts[last] = p; }
      this.np--;
    }

    /** Moves one body; false when it is finished. */
    stepBody(b, dt) {
      if (b.mode === 'hold') {
        if (b.life < b.wake) return true;
        if (b.act) { this.burst(b.act, b); return false; }
        b.mode = b.next;
        if (b.mode === 'drop') this.aim(b);
        if (b.mode === 'spiral') { b.r0 = b.rad; b.vr = 0; }
      }
      if (b.mode === 'free') return this.stepFree(b, dt);
      if (b.mode === 'drop') return this.stepDrop(b, dt);
      if (b.mode === 'spiral') return this.stepSpiral(b, dt);
      return true;
    }

    stepFree(b, dt) {
      const g = this.g * b.gs;
      b.vx += this.gx * g * dt; b.vy += this.gy * g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.a += b.va * dt;
      const half = b.size * 0.5;
      let hit = this.floor(b, half, b.rest, b.fric);
      if (b.solid && this.solid) hit = this.stack(b, half) || hit;
      if (hit) {
        // A tumbling block on the ground rolls toward lying flat.
        const flat = Math.round(b.a / (Math.PI / 2)) * (Math.PI / 2);
        b.va = b.va * 0.5 + (flat - b.a) * 6;
        if (b.onLand) { const f = b.onLand; b.onLand = null; f(b); }
      }
      return true;
    }

    /** Bounces a body or particle off the floor (the board's edge gravity points at) and the two side walls. */
    floor(o, half, rest, fric) {
      const bx = this.box, gx = this.gx, gy = this.gy;
      let hit = false;
      if (gy !== 0) {
        const fy = gy > 0 ? bx.y + bx.h - half : bx.y + half;
        if ((gy > 0 && o.y > fy) || (gy < 0 && o.y < fy)) {
          o.y = fy;
          if (o.vy * gy > 0) { o.vy = -o.vy * rest; o.vx *= fric; if (o.va) o.va *= 0.6; hit = true; }
        }
        if (o.x < bx.x + half && o.vx < 0) { o.x = bx.x + half; o.vx = -o.vx * rest; }
        else if (o.x > bx.x + bx.w - half && o.vx > 0) { o.x = bx.x + bx.w - half; o.vx = -o.vx * rest; }
      } else {
        const fx = gx > 0 ? bx.x + bx.w - half : bx.x + half;
        if ((gx > 0 && o.x > fx) || (gx < 0 && o.x < fx)) {
          o.x = fx;
          if (o.vx * gx > 0) { o.vx = -o.vx * rest; o.vy *= fric; if (o.va) o.va *= 0.6; hit = true; }
        }
        if (o.y < bx.y + half && o.vy < 0) { o.y = bx.y + half; o.vy = -o.vy * rest; }
        else if (o.y > bx.y + bx.h - half && o.vy > 0) { o.y = bx.y + bx.h - half; o.vy = -o.vy * rest; }
      }
      return hit;
    }

    /** Lands a falling body on top of the settled stack (only from above: one already inside it passes through). */
    stack(b, half) {
      const gx = this.gx, gy = this.gy;
      if (b.vx * gx + b.vy * gy <= 0) return false;
      const lx = b.x + gx * half, ly = b.y + gy * half;
      if (!this.solid(lx, ly) || this.solid(b.x, b.y)) return false;
      const s = this.s, bx = this.box;
      if (gy !== 0) {
        const row = Math.floor((ly - bx.y) / s);
        b.y = gy > 0 ? bx.y + row * s - half : bx.y + (row + 1) * s + half;
        b.vy = -b.vy * b.rest; b.vx *= b.fric;
      } else {
        const col = Math.floor((lx - bx.x) / s);
        b.x = gx > 0 ? bx.x + col * s - half : bx.x + (col + 1) * s + half;
        b.vx = -b.vx * b.rest; b.vy *= b.fric;
      }
      b.va *= 0.6;
      return true;
    }

    /** A straight fall to a known spot, then a little bounce and a squash, then it settles and is done. */
    stepDrop(b, dt) {
      const g = this.g * b.gs, gx = this.gx, gy = this.gy;
      b.t += dt;
      if (b.squash) b.squash *= Math.exp(-dt * 16);
      if (!b.landed) {
        const d = b.v0 * b.t + 0.5 * g * b.t * b.t;
        if (d < b.dist) {
          b.x = b.x0 + gx * d; b.y = b.y0 + gy * d;
          if (b.trail && Math.random() < dt * 40) {
            // A grain slips off the top edge and trails behind (it starts still, so the block outruns it).
            const j = (Math.random() - 0.5) * b.size;
            this.part('grain', b.x - gx * b.size * 0.5 - gy * j, b.y - gy * b.size * 0.5 + gx * j, 0, 0, 0.35, Math.max(1.5, b.size * 0.08), b.trail, 0.5);
          }
          return true;
        }
        const v = b.v0 + g * b.t;
        b.landed = true; b.x = b.tx; b.y = b.ty;
        b.vx = -gx * v * b.rest; b.vy = -gy * v * b.rest;
        b.squash = Math.min(0.32, v / (this.s * 60));
        b.t = 0;
        if (b.onLand) { const f = b.onLand; b.onLand = null; f(b); }
        return true;
      }
      // Bouncing on its spot: up against gravity, back down, until the bounce is too small to see.
      b.vx += gx * g * dt; b.vy += gy * g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if ((b.x - b.tx) * gx + (b.y - b.ty) * gy >= 0) {
        b.x = b.tx; b.y = b.ty;
        const v = Math.abs(b.vx + b.vy);
        if (v < this.s * 4) { b.vx = 0; b.vy = 0; b.settle -= dt; return b.settle > 0 || b.squash > 0.02; }
        b.vx = -gx * v * b.rest; b.vy = -gy * v * b.rest;
        b.squash = Math.max(b.squash, Math.min(0.2, v / (this.s * 60)));
      }
      return true;
    }

    /** Pulled into a point along a tightening spiral: faster and faster, spinning up as it closes in. */
    stepSpiral(b, dt) {
      b.vr += b.acc * dt;
      b.rad -= b.vr * dt;
      if (b.rad <= this.s * 0.06) return false;
      const w = Math.min(28, b.w0 * Math.pow(b.r0 / Math.max(b.rad, 1), 0.9));
      b.ang += w * dt;
      b.x = b.cx + Math.cos(b.ang) * b.rad; b.y = b.cy + Math.sin(b.ang) * b.rad;
      // Stretched along its path (turning to face it gradually, so a resting block does not snap round), shrinking
      // as it nears the middle.
      const tang = w * b.rad, u = Math.min(1, (b.r0 - b.rad) / (this.s * 0.8) + 0.1);
      let dir = Math.atan2(tang * Math.cos(b.ang) - b.vr * Math.sin(b.ang), -tang * Math.sin(b.ang) - b.vr * Math.cos(b.ang));
      // A square stretched along its path looks the same turned half round: take the smaller turn from upright.
      dir = ((dir % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2;
      b.a = dir * u;
      const speed = Math.hypot(tang, b.vr), k = Math.min(1, b.rad / (this.s * 1.6));
      b.sx = (1 + Math.min(1.4, speed / (this.s * 22)) * u) * (0.2 + 0.8 * k);
      b.sy = (0.2 + 0.8 * k) / (1 + Math.min(0.5, speed / (this.s * 50)) * u);
      return true;
    }

    // ---- breaking up ------------------------------------------------------------------------------------------------

    /**
     * What a block becomes when it breaks: chips (drill), flattened debris, pixels (laser), grains.
     */
    burst(kind, b) {
      const s = b.size, x = b.x, y = b.y, c = b.color, gx = this.gx, gy = this.gy, S = this.s;
      const ux = -gx, uy = -gy, px = -gy, py = gx; // up (against gravity) and sideways
      if (kind === 'chips') {
        for (let k = 0; k < 6; k++) {
          const side = k % 2 ? 1 : -1, sp = S * (5 + Math.random() * 7), up = S * (2 + Math.random() * 5);
          const p = this.part('chip', x + (Math.random() - 0.5) * s * 0.6, y + (Math.random() - 0.5) * s * 0.6, px * side * sp + ux * up, py * side * sp + uy * up, 0.35 + Math.random() * 0.2, s * (0.18 + Math.random() * 0.16), c, 1);
          p.va = (Math.random() - 0.5) * 24;
        }
        for (let k = 0; k < 3; k++) {
          const side = Math.random() < 0.5 ? 1 : -1, sp = S * (8 + Math.random() * 10);
          this.part('spark', x, y, px * side * sp + ux * S * 3, py * side * sp + uy * S * 3, 0.25 + Math.random() * 0.2, 1.5, Math.random() < 0.5 ? '#ffd166' : '#fff3c4', 0.6);
        }
      } else if (kind === 'crush') {
        for (let k = 0; k < 5; k++) {
          const side = k % 2 ? 1 : -1, sp = S * (3 + Math.random() * 8);
          const p = this.part('flat', x + (Math.random() - 0.5) * s * 0.7, y + (Math.random() - 0.5) * s * 0.4, px * side * sp + ux * S * Math.random() * 3, py * side * sp + uy * S * Math.random() * 3, 0.35 + Math.random() * 0.2, s * (0.3 + Math.random() * 0.25), c, 1);
          p.a = Math.atan2(py, px) + (Math.random() - 0.5) * 0.5; p.va = (Math.random() - 0.5) * 8;
        }
        this.dust(x, y, S, 2);
      } else if (kind === 'pixels') {
        const n = 3, q = s / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const p = this.part('pixel', x - s / 2 + (i + 0.5) * q, y - s / 2 + (j + 0.5) * q, (Math.random() - 0.5) * S * 3 + ux * S * 1.5, (Math.random() - 0.5) * S * 3 + uy * S * 1.5, 0.3 + Math.random() * 0.25, q * 0.8, c, -0.06, 2.5);
          p.delay = Math.random() * 0.06;
        }
      } else if (kind === 'grains') {
        const n = 4, q = s / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const p = this.part('pixel', x - s / 2 + (i + 0.5) * q, y - s / 2 + (j + 0.5) * q, (Math.random() - 0.5) * S * 1.2 + ux * S * (0.6 + Math.random()), (Math.random() - 0.5) * S * 1.2 + uy * S * (0.6 + Math.random()), 0.25 + Math.random() * 0.15, q * 0.9, c, -0.04, 1.5);
          p.delay = Math.random() * 0.12; p.max += p.delay;
        }
      } else {
        this.part('fade', x, y, 0, 0, 0.25, s, c, 0);
      }
    }

    /** Soft dust rising from a point. */
    dust(x, y, S, n, color) {
      for (let k = 0; k < n; k++) {
        const side = Math.random() - 0.5, px = -this.gy, py = this.gx;
        this.part('dust', x, y, px * side * S * 6 - this.gx * S * (1 + Math.random() * 2), py * side * S * 6 - this.gy * S * (1 + Math.random() * 2), 0.3 + Math.random() * 0.2, S * (0.25 + Math.random() * 0.2), color || '#9aa3b2', -0.03, 3);
      }
    }

    /** Sparks flung from a point in every direction. */
    sparks(x, y, S, n, colors) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, v = S * (6 + Math.random() * 12);
        this.part('spark', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.25, 1.5, colors[k % colors.length], 0.5, 1);
      }
    }

    /**
     * The board has changed again (another piece set, a rewind): blocks still falling to a cell would now hide the
     * wrong one, so they are done — the board already draws them where they belong.
     */
    land() {
      if (!this.hiding) return;
      for (let i = 0; i < this.nb; i++) if (this.bodies[i].key >= 0) { this.bodies[i].onDone = null; this.killBody(i); i--; }
    }

    /** Marks the cells hidden under bodies still on their way there. */
    fillHidden(mask) {
      if (!this.hiding) return false;
      for (let i = 0; i < this.nb; i++) { const k = this.bodies[i].key; if (k >= 0 && k < mask.length) mask[k] = 1; }
      return true;
    }

    // ---- drawing ----------------------------------------------------------------------------------------------------

    /** Draws bodies with sprite(skin, color, devicePx) (a cell image), or their own paint(ctx, size). */
    draw(ctx, sprite) {
      if (!this.nb && !this.np) return;
      const bx = this.box, dpr = ctx.__dpr || 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h); ctx.clip();
      const m = ctx.getTransform ? ctx.getTransform() : null;
      for (let i = 0; i < this.nb; i++) {
        const b = this.bodies[i];
        let a = b.alpha;
        if (b.life > b.fadeAt) a *= Math.max(0, 1 - (b.life - b.fadeAt) / Math.max(0.01, b.max - b.fadeAt));
        if (a <= 0.01) continue;
        let sx = b.sx, sy = b.sy, ox = 0, oy = 0;
        if (b.squash > 0.005) {
          // Squashed flat against the floor, its bottom staying put.
          const q = b.squash, half = b.size * 0.5;
          if (this.gy !== 0) { sy *= 1 - q; sx *= 1 + q * 0.6; oy = this.gy * half * q; }
          else { sx *= 1 - q; sy *= 1 + q * 0.6; ox = this.gx * half * q; }
        }
        if (b.life > b.fadeAt && b.mode === 'free') { const k = 1 - 0.4 * Math.min(1, (b.life - b.fadeAt) / Math.max(0.01, b.max - b.fadeAt)); sx *= k; sy *= k; }
        ctx.globalAlpha = Math.min(1, a);
        ctx.translate(b.x + ox, b.y + oy);
        if (b.a) ctx.rotate(b.a);
        if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
        if (b.paint) b.paint(ctx, b.size, b);
        else ctx.drawImage(sprite(b.skin, b.color, b.size * dpr), -b.size / 2, -b.size / 2, b.size, b.size);
        if (m) ctx.setTransform(m); else ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      for (let i = 0; i < this.np; i++) {
        const p = this.parts[i];
        const k = p.life / p.max;
        if (p.kind === 'dust') {
          ctx.globalAlpha = 0.32 * (1 - k); ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 1.2), 0, TAU); ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        } else if (p.kind === 'chip' || p.kind === 'flat') {
          ctx.globalAlpha = k < 0.6 ? 1 : (1 - k) / 0.4; ctx.fillStyle = p.color;
          const w = p.size, h = p.kind === 'flat' ? p.size * 0.32 : p.size;
          const c = Math.cos(p.a), sn = Math.sin(p.a);
          ctx.transform(c, sn, -sn, c, p.x, p.y);
          ctx.fillRect(-w / 2, -h / 2, w, h);
          if (m) ctx.setTransform(m); else ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else if (p.kind === 'fade') {
          const z = p.size * (1 - k * 0.7);
          ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color; ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z);
        } else {
          // pixel, grain: a small square that fades (a waiting pixel is still part of its block)
          const a = p.life < p.delay ? 1 : 1 - (p.life - p.delay) / Math.max(0.01, p.max - p.delay);
          ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.color;
          const z = p.kind === 'pixel' && p.life >= p.delay ? p.size * (0.5 + 0.5 * a) : p.size;
          ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z);
        }
      }
      ctx.restore();
    }
  }
  const DEFAULT_BODY = freshBody();
  delete DEFAULT_BODY.on;

  L.FxPhysics = { World, G };
})(typeof globalThis !== 'undefined' ? globalThis : this);
