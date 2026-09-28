// carnage.js: the app's Carnage.swift: the dead and what is left of them. A cut foe comes apart along the line of the
// cut, a jointed body (the core's Ragdoll) let fall under its own weight from the very pose his figure froze in at the
// blow; his head and his weapon fly as rigid pieces. Everything lands and stays for the stage at ground level, in a
// low carpet under the living; blood jets from the wounds, pools under the dead and flecks the ground.

/** A rigid piece of the dead (a head, a weapon): its figure's piece, turning about its middle. */
class RigidPiece extends Node {
  constructor(cast, piece, ronin) {
    super();
    this.sprite = this.add(new FigureSprite(cast));
    this.sprite.applyPiece(piece, ronin);
    this.cast = cast;
    this.piece = piece;
    this.relayout(ronin);
  }
  relayout(ronin) {
    const full = Figures.size(this.cast, ronin);
    const r = this.piece.rect;
    this.sprite.ronin = ronin;
    // Its middle at the node's origin (the sprite itself is anchored at the figure's feet).
    this.dx = (r.x + r.w / 2 - FigureCanvas.anchorX) * full.w;
    this.dy = (r.y + r.h / 2 - FigureCanvas.anchorY) * full.h;
    this.sprite.at(-this.dx, -this.dy);
    this.size = { w: full.w * r.w, h: full.h * r.h };
  }
}

class Carnage {
  constructor(trails) {
    this.corpses = new Node();
    this.stains = new Node();
    this.trails = trails;
    this.gore = Gore.full;
    this.ambient = Ambient.plain;
    this.shed = 0;
    this.severings = 0;
    this.bodies = [];
    this.field = { x: 0, y: 0, w: 420, h: 126 };
    this.groundY = 0; this.ronin = 60; this.heroX = 0; this.layer = 0;
    this.pools = []; this.specks = [];
  }

  get dolls() { return Figures.core.ragdoll; }

  reset(field, groundY, ronin, heroX) {
    Object.assign(this, { field, groundY, ronin, heroX });
    const ids = this.bodies.filter((b) => b.doll !== null).map((b) => b.doll);
    if (ids.length) { try { this.dolls.remove(ids); } catch { /* gone already */ } }
    this.bodies = [];
    this.corpses.removeAllChildren();
    this.stains.removeAllChildren();
    this.pools = []; this.specks = [];
    this.layer = 0;
  }

  /** A new size mid-stage: the dead, their blood and whatever is still falling kept, scaled with the lane about the
   *  ronin's spot on the ground. */
  relayout(field, groundY, ronin, heroX) {
    if (field.w === this.field.w && field.h === this.field.h && groundY === this.groundY && ronin === this.ronin && heroX === this.heroX) return;
    const k = this.ronin > 0 ? ronin / this.ronin : 1;
    const x0 = this.heroX, y0 = this.groundY;
    const map = (x, y) => ({ x: heroX + (x - x0) * k, y: groundY + (y - y0) * k });
    const line = (y) => groundY + (y - y0) * k;
    for (const node of [...this.corpses.children, ...this.stains.children]) {
      const p = map(node.x, node.y);
      node.at(p.x, p.y);
      if (node instanceof RigidPiece) node.relayout(ronin);
      else if (node instanceof FigureSprite) node.ronin = ronin;
      else if (node instanceof Sprite) { node.w *= k; node.h *= k; }
    }
    for (const b of this.bodies) {
      b.origin = map(b.origin.x, b.origin.y);
      b.floor = line(b.floor);
      b.restY = line(b.restY);
      b.scale *= k;
      b.vx *= k; b.vy *= k;
      if (b.jet) {
        Carnage.rescale(b.jet, k);
        if (b.doll === null) b.jet.at(b.jet.x * k, b.jet.y * k);
      }
    }
    Object.assign(this, { field, groundY, ronin, heroX });
  }

  static rescale(jet, k) {
    jet.speedP *= k; jet.speedRange *= k; jet.yAccel *= k; jet.pScale *= k; jet.scaleRange *= k; jet.scaleSpeed *= k;
  }

  get count() { return this.bodies.length; }
  get gravity() { return this.ronin * 9; }
  get depth() { return this.ronin * 0.12; }

  place(body, near) {
    near = clamp(near, 0, 1);
    body.floor = this.groundY - this.depth * near;
    this.layer += 0.0005;
    body.node.z = (near * 10 + this.layer) * Carnage.band;
  }

  light(node) {
    const sprite = node instanceof RigidPiece ? node.sprite : node;
    sprite.setTint(this.ambient.shade, this.ambient.amount);
  }

  body(node, cast, state, doll = null) {
    return { node, cast, state, doll, origin: { x: 0, y: 0 }, scale: 1, place: { x: 0, y: 0 }, drawnAt: 0, sinceDrawn: 0,
      vx: 0, vy: 0, spin: 0, clock: 0, standFor: 0, bounced: false, facing: 1, jet: null, jetRate: 0, jetFor: 0,
      thin: false, floor: 0, restAngle: 0, restY: 0, pool: null, gore: this.gore, bleeding: null, moved: 0 };
  }

  // MARK: The dying

  /** A foe cut down: taken apart where the cut goes through him (`severance`), or felled whole (from the struck
   *  pose `variant`, or, shot, from the frame he was in). Returns where he parts, on the lane. */
  kill(cast, severance, feet, facing, away, force, { variant = null, frame = null } = {}) {
    if (severance) return this.sever(cast, severance, feet, facing, away, force, variant ?? 0);
    return this.fell(cast, feet, facing, force, variant, frame);
  }

  sever(cast, severance, feet, facing, away, force, variant) {
    const near = Math.random();
    const back = away * facing;
    this.severings++;
    const cut = this.dolls.sever(cast, severance, { variant, back, force });
    let parted;
    if (severance === 'head') {
      // The head flies, turning over and over; the body stands a moment longer, pumping blood, and crumples.
      const sketch = this.dolls.head(cast, variant);
      const piece = new Piece(sketch);
      const node = new RigidPiece(cast, piece, this.ronin);
      node.xScale = facing;
      node.at(feet.x + facing * node.dx, feet.y + node.dy);
      this.corpses.add(node);
      this.light(node);
      const head = this.body(node, cast, 'flying');
      head.facing = facing;
      this.place(head, near + rand(-0.15, 0.15));
      const full = Figures.size(cast, this.ronin);
      const r = piece.rect;
      const wound = { x: (sketch.wound.x / sketch.width - (r.x + r.w / 2)) * full.w, y: (sketch.wound.y / sketch.height - (r.y + r.h / 2)) * full.h };
      this.bleed(head, 160 * force, this.ronin * 0.5, 0.7, wound, sketch.angle);
      head.vx = away * this.ronin * rand(1.0, 2.0) * force;
      head.vy = this.ronin * rand(0.8, 1.3) * 2.6 * force;
      head.spin = -away * rand(6, 16);
      this.bodies.push(head);
      const body = this.addDoll(cut.body, cast, feet, facing, near + rand(-0.1, 0.1), 'standing');
      body.standFor = cut.standFor ?? rand(0.35, 0.7) * 1.4;
      this.bleed(body, 160 * force, this.ronin * 1.6, 1.8);
      parted = body;
    } else if (severance === 'legs') {
      const body = this.addDoll(cut.body, cast, feet, facing, near, 'limp');
      this.bleed(body, 160 * force, this.ronin * 1.3, 1.2);
      parted = body;
    } else {
      const upper = this.addDoll(cut.upper, cast, feet, facing, near + rand(-0.15, 0.15), 'limp');
      this.bleed(upper, 160 * force, this.ronin * 0.5, 0.7);
      const lower = this.addDoll(cut.lower, cast, feet, facing, near + rand(-0.15, 0.15), 'standing');
      lower.standFor = cut.standFor ?? rand(0.35, 0.7);
      this.bleed(lower, 160 * force, this.ronin * 1.6, 1.5);
      parted = upper;
    }
    if (cut.weapon) this.drop(cast, cut.weapon, feet, facing, away, force, near);
    this.spatter(feet.x, 10 * force);
    this.trim();
    return this.wound(parted);
  }

  fell(cast, feet, facing, force, variant, frame) {
    const near = Math.random();
    const options = { back: -1, force };
    if (frame) options.frame = frame; else options.variant = variant ?? 0;
    const cut = this.dolls.fell(cast, options);
    const body = this.addDoll(cut.body, cast, feet, facing, near, 'limp');
    this.bleed(body, 120 * force, this.ronin * 1.2, 0.9);
    if (cut.weapon) this.drop(cast, cut.weapon, feet, facing, -facing, force, near);
    this.spatter(feet.x, 6 * force);
    this.trim();
    return this.wound(body);
  }

  /** A jointed body (or part of one) standing where the foe stood, drawn as it is now. */
  addDoll(id, cast, feet, facing, near, state) {
    const node = new FigureSprite(cast);
    node.xScale = facing;
    this.corpses.add(node);
    const body = this.body(node, cast, state, id);
    body.facing = facing;
    this.place(body, near);
    body.scale = this.ronin * Builds[cast].height;
    body.origin = { x: feet.x, y: body.floor };
    // Standing on the lane, over the line on the ground he will fall to.
    this.dolls.raise(id, (feet.y - body.floor) / body.scale);
    const info = this.dolls.info(id);
    if (info && info.bleeding) body.bleeding = info.bleeding;
    this.draw(body);
    this.light(node);
    this.bodies.push(body);
    return body;
  }

  /** Where a body bleeds from, on the lane. */
  wound(body) {
    const at = body.bleeding?.at;
    if (!at) return { x: body.node.x, y: body.node.y + this.ronin * 0.5 };
    return { x: body.origin.x + body.facing * at.x * body.scale, y: body.origin.y + at.y * body.scale };
  }

  /** Draws a doll as it now lies, the sprite moved with its hips. */
  draw(body) {
    const sketch = this.dolls.draw(body.doll);
    body.node.applyPiece(new Piece(sketch), this.ronin);
    body.place = sketch.place;
    body.node.at(body.origin.x + body.facing * sketch.place.x * body.scale, body.origin.y + sketch.place.y * body.scale);
    body.sinceDrawn = 0;
    body.moved = 0;
    this.aim(body);
  }

  /** Blood pumping from a body: from a doll's wound, or from a point on a rigid piece. */
  bleed(body, rate, speed, seconds, point = null, angle = 0) {
    const gore = this.gore;
    if (!gore.on) return;
    const jet = spurt(Palette.blood.mix(RGB.black, 0.25), { rate: rate * gore.flow, speed: speed * gore.force, size: this.ronin * 0.045 * gore.size,
      angle, spread: 0.35, gravity: this.gravity * 0.8, into: this.trails });
    if (point) jet.at(point.x, point.y);
    body.node.add(jet);
    body.jet = jet;
    body.jetRate = rate * gore.flow;
    body.jetFor = seconds * gore.span;
    this.shed++;
    if (body.doll === null) this.aimRigid(body); else this.aim(body);
  }

  /** Keeps a doll's jet of blood on its wound, pointing out of it. */
  aim(body) {
    const jet = body.jet;
    if (!jet || !body.bleeding) return;
    const { at, angle } = body.bleeding;
    jet.at((at.x - body.place.x) * body.scale, (at.y - body.place.y) * body.scale);
    jet.angle = angle;
    this.ground(jet, at.y * body.scale, Math.sin(angle));
  }

  /** Keeps a rigid piece's jet from pouring through the ground as it turns over. */
  aimRigid(body) {
    const jet = body.jet;
    if (!jet) return;
    const node = body.node;
    const c = Math.cos(node.rotation), s = Math.sin(node.rotation);
    const wx = node.x + body.facing * jet.x * c - jet.y * s;
    const wy = node.y + body.facing * jet.x * s + jet.y * c;
    const height = wy - body.floor;
    const a = jet.angle;
    this.ground(jet, height, body.facing * Math.cos(a) * Math.sin(node.rotation) + Math.sin(a) * Math.cos(node.rotation));
    void wx;
  }

  /** Makes a jet's drops live no longer than they take to come down to the ground just in front of it. */
  ground(jet, height, rising) {
    const g = Math.max(1, -jet.yAccel);
    const v = jet.speedP * rising;
    const t = (v + Math.sqrt(v * v + 2 * g * (Math.max(0, height) + this.ronin * 0.04))) / g;
    jet.lifetime = Math.min(0.5, 0.85 * t);
    jet.lifetimeRange = Math.min(0.3, 0.3 * t);
  }

  /** His weapon, out of his hand: leaving it as he held it, flung up turning end over end, to clatter down flat. */
  drop(cast, weapon, feet, facing, away, force, near) {
    let piece;
    try { piece = new Piece(this.dolls.weapon(cast)); } catch { return; }
    const node = new RigidPiece(cast, piece, this.ronin);
    node.xScale = facing;
    const full = Figures.size(cast, this.ronin);
    const unit = this.ronin * Builds[cast].height;
    const turn = facing * weapon.turn;
    const r = piece.rect;
    const ox = (r.x + r.w / 2 - 0.5) * full.w, oy = (r.y + r.h / 2 - 0.5) * full.h;
    node.rotation = turn;
    node.at(feet.x + facing * weapon.hand.x * unit + facing * ox * Math.cos(turn) - oy * Math.sin(turn),
      feet.y + weapon.hand.y * unit + facing * ox * Math.sin(turn) + oy * Math.cos(turn));
    this.corpses.add(node);
    this.light(node);
    const body = this.body(node, cast, 'flying');
    this.place(body, near + 0.1);
    body.vx = away * this.ronin * rand(0.3, 1.1) * force;
    body.vy = this.ronin * rand(1.2, 2.2);
    body.spin = rand(-9, 9);
    body.facing = facing;
    body.thin = true;
    this.bodies.push(body);
  }

  /** Blood pumping from a point that isn't a body (the ronin, dying), falling to the lane. */
  bleedAt(point, angle, seconds) {
    const gore = this.gore;
    if (!gore.on) return;
    const jet = spurt(Palette.blood.mix(RGB.black, 0.2), { rate: 180 * gore.flow, speed: this.ronin * 1.3 * gore.force, size: this.ronin * 0.045 * gore.size,
      angle, spread: 0.4, gravity: this.gravity * 0.8, into: this.trails });
    jet.at(point.x, point.y);
    this.ground(jet, point.y - this.groundY, Math.sin(angle));
    this.trails.add(jet);
    this.shed++;
    jet.run(A.seq(A.wait(seconds * gore.span), A.run(() => { jet.birthRate = 0; }), A.wait(1), A.remove()));
  }

  pool(x, width, grow = 1.8, floor = null, gore = this.gore) {
    if (!gore.on) return null;
    const wide = width * gore.pool;
    const pool = tintedSprite(Art.glow, rgb(0.26, 0.0, 0.02), wide, Math.max(3, wide * 0.16));
    pool.at(x, (floor ?? this.groundY) - this.ronin * 0.02);
    pool.alpha = Math.min(0.97, 0.78 + 0.13 * gore.level);
    pool.setScale(0.2);
    pool.run(A.scaleTo(1, grow * (0.8 + 0.2 * gore.level)).easedOut());
    this.stains.add(pool);
    this.pools.push(pool);
    this.shed++;
    if (this.pools.length > Carnage.mostPools) Carnage.fade(this.pools.shift());
    return pool;
  }

  spatter(x, count, floor = null) {
    const n = this.gore.count(count);
    this.shed += n;
    for (let k = 0; k < n; k++) {
      const r = this.ronin * rand(0.015, 0.05) * this.gore.size;
      const speck = tintedSprite(Art.dot, rgb(0.34, 0.0, 0.03), r * 2, r * 0.9);
      const line = floor ?? this.groundY - Math.random() * this.depth;
      speck.at(x + rand(-1, 1) * this.ronin * 0.9, line - rand(-0.02, 0.03) * this.ronin);
      speck.alpha = rand(0.6, 0.95);
      this.stains.add(speck);
      this.specks.push(speck);
    }
    while (this.specks.length > Carnage.mostSpecks) Carnage.fade(this.specks.shift());
  }

  /** More dead than a stage leaves: the oldest pieces fade away, weapons first, then heads, then bodies. */
  trim() {
    while (this.bodies.length > Carnage.most) {
      let i = this.bodies.findIndex((b) => b.state === 'resting' && b.thin);
      if (i < 0) i = this.bodies.findIndex((b) => b.state === 'resting' && b.doll === null);
      if (i < 0) i = this.bodies.findIndex((b) => b.state === 'resting');
      if (i < 0) break;
      const b = this.bodies.splice(i, 1)[0];
      Carnage.fade(b.node);
      if (b.pool) { Carnage.fade(b.pool); this.pools = this.pools.filter((p) => p !== b.pool); }
    }
  }

  static fade(node) { node.run(A.seq(A.fadeOut(0.6), A.remove())); }

  // MARK: The step

  /** Lets the dead fall for `dt` seconds of the fight's time (0 holds everything still); `real` seconds went by. */
  update(dt, real = dt) {
    if (dt <= 0) return;
    const falling = this.bodies.some((b) => b.doll !== null && (b.state === 'standing' || b.state === 'limp'));
    const reports = new Map();
    if (falling) for (const r of this.dolls.step(dt)) reports.set(r.id, r);
    const gone = [];
    const due = [];
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const node = b.node;
      b.clock += dt;
      if (b.jet) {
        if (!this.gore.on) b.jetFor = Math.min(b.jetFor, 0);
        b.jetFor -= dt;
        const beatV = Math.max(0, Math.sin(b.clock * 15));
        b.jet.birthRate = b.jetFor > 0 ? b.jetRate * (0.25 + 0.75 * beatV) * Math.min(1, b.jetFor) : 0;
        if (b.jetFor < -1) { b.jet.remove(); b.jet = null; }
      }
      switch (b.state) {
        case 'resting':
          continue;
        case 'standing': case 'limp': {
          const r = reports.get(b.doll);
          b.sinceDrawn += real;
          if (r) { b.bleeding = r.bleeding || b.bleeding; b.moved = r.moved; b.settledNow = r.settled; b.hip = r.hip; }
          if (b.state === 'standing') {
            b.standFor -= dt;
            if (b.standFor <= 0) {
              this.dolls.collapse(b.doll);
              b.state = 'limp';
            }
          }
          if (b.hip) {
            const x = b.origin.x + b.facing * b.hip.x * b.scale;
            if (x < this.field.x - this.ronin * 1.5 || x > this.field.x + this.field.w + this.ronin * 1.5) { gone.push(i); continue; }
          }
          if (b.state === 'limp' && b.settledNow) {
            this.draw(b);
            this.rest(b);
            continue;
          }
          const off = (b.moved || 0) * b.scale;
          if (off >= Carnage.blur && (off >= Carnage.fast || b.sinceDrawn >= Carnage.lull)) due.push({ b, off });
          else this.aim(b);
          break;
        }
        case 'flying': {
          b.vy -= this.gravity * dt;
          node.x += b.vx * dt;
          node.y += b.vy * dt;
          node.rotation += b.spin * dt;
          this.aimRigid(b);
          const [ex, ey] = this.extents(node, node.rotation);
          if (node.x < this.field.x - ex || node.x > this.field.x + this.field.w + ex) { gone.push(i); continue; }
          if (node.y - ey * 0.6 <= b.floor && b.vy < 0) {
            if (!b.bounced && b.vy < -this.ronin * 2) {
              b.bounced = true;
              node.y = b.floor + ey * 0.6;
              b.vy *= -0.28;
              b.vx *= 0.5;
              b.spin *= 0.45;
              this.spatter(node.x, 4, b.floor);
            } else {
              this.land(b);
            }
          }
          break;
        }
        case 'sliding': {
          node.x += b.vx * dt;
          b.vx *= Math.pow(0.003, dt);
          const ease = Math.min(1, dt * 12);
          node.rotation += (b.restAngle - node.rotation) * ease;
          node.y += (b.restY - node.y) * ease;
          this.aimRigid(b);
          if (Math.abs(b.vx) < this.ronin * 0.06 && Math.abs(b.restAngle - node.rotation) < 0.02) this.rest(b);
          break;
        }
      }
    }
    due.sort((a, c) => c.off - a.off);
    const start = performance.now();
    due.forEach(({ b }, k) => {
      if (k < Carnage.fewest || performance.now() - start < Carnage.spend * 1000) this.draw(b);
      else this.aim(b);
    });
    if (gone.length) {
      const dead = [];
      for (const i of gone.sort((a, c) => c - a)) {
        const b = this.bodies[i];
        b.node.remove();
        if (b.doll !== null) dead.push(b.doll);
        this.bodies.splice(i, 1);
      }
      if (dead.length) { try { this.dolls.remove(dead); } catch { /* gone already */ } }
    }
  }

  extents(node, angle) {
    const size = node.size || { w: 10, h: 10 };
    const w = size.w / 2, h = size.h / 2;
    return [Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle)), Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))];
  }

  land(b) {
    const node = b.node;
    const size = node.size || { w: 10, h: 10 };
    const tall = size.h > size.w * 1.25, wide = size.w > size.h * 1.25;
    const quarter = Math.PI / 2;
    let k = Math.round(node.rotation / quarter);
    const odd = Math.abs(k) % 2 === 1;
    if ((tall && !odd) || (wide && odd)) k += node.rotation - k * quarter >= 0 ? 1 : -1;
    b.restAngle = k * quarter + rand(-0.3, 0.3) * (b.thin ? 0.4 : 1);
    const [, y] = this.extents(node, b.restAngle);
    b.restY = b.floor + y * (b.thin ? rand(0.24, 0.39) : rand(0.5, 0.72));
    b.vx *= 0.55;
    b.state = 'sliding';
  }

  /** Leaves a body where it came to rest, clear of the ronin's own ground, with blood pooling under it. */
  rest(b) {
    const node = b.node;
    b.state = 'resting';
    if (b.doll !== null) {
      try { this.dolls.remove([b.doll]); } catch { /* gone already */ }
      b.doll = null;
      b.wasDoll = true;
    }
    let x = node.x;
    if (Math.abs(x - this.heroX) < this.ronin * 0.34) {
      x = this.heroX + (x < this.heroX ? -1 : 1) * this.ronin * 0.34;
      node.run(A.moveBy(x - node.x, 0, 0.1));
    }
    const size = b.wasDoll ? this.dollWidth(b) : this.extents(node, node.rotation)[0] * 2;
    const width = size * (b.wasDoll ? 0.8 : 1);
    if (!b.thin && this.gore.on) b.pool = this.pool(x, width * 1.2, 1.8, b.floor, b.gore);
  }

  /** How wide a doll's picture lies, in points. */
  dollWidth(b) {
    const p = b.node.piece;
    if (!p) return this.ronin * 0.6;
    return Figures.size(b.cast, this.ronin).w * p.rect.w;
  }
}
Carnage.most = 260;
Carnage.mostPools = 180;
Carnage.mostSpecks = 600;
Carnage.band = 0.4;
Carnage.blur = 0.6;
Carnage.fast = 2;
Carnage.lull = 1 / 40;
Carnage.fewest = 4;
Carnage.spend = 0.003;
