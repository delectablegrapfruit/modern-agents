// carnage.js: the app's Carnage.swift: the dead and what is left of them. Each body falls from the pose his figure froze
// in at the blow; with the core's Ragdoll (core.ragdoll) as a jointed thing let fall under its own weight, cut apart
// along the line of the cut; without it, felled whole as a rigid figure turning down onto the ground. Everything lands
// and stays for the stage at ground level, in a low carpet under the living; blood jets from the wounds, pools under
// the dead and flecks the ground.

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

  reset(field, groundY, ronin, heroX) {
    Object.assign(this, { field, groundY, ronin, heroX });
    this.bodies = [];
    this.corpses.removeAllChildren();
    this.stains.removeAllChildren();
    this.pools = []; this.specks = [];
    this.layer = 0;
  }

  /** A new size mid-stage: the dead and their blood scaled with the lane about the ronin's spot on the ground. */
  relayout(field, groundY, ronin, heroX) {
    if (field.w === this.field.w && field.h === this.field.h && groundY === this.groundY && ronin === this.ronin && heroX === this.heroX) return;
    const k = this.ronin > 0 ? ronin / this.ronin : 1;
    const x0 = this.heroX, y0 = this.groundY;
    const map = (x, y) => ({ x: heroX + (x - x0) * k, y: groundY + (y - y0) * k });
    for (const node of [...this.corpses.children, ...this.stains.children]) {
      const p = map(node.x, node.y);
      node.at(p.x, p.y);
      if (node instanceof Sprite) { node.w *= k; node.h *= k; }
      if (node instanceof FigureSprite) node.ronin = ronin;
    }
    for (const b of this.bodies) {
      b.floor = groundY + (b.floor - y0) * k;
      b.restY = groundY + (b.restY - y0) * k;
      b.vx *= k; b.vy *= k;
      b.feet = map(b.feet.x, b.feet.y);
    }
    Object.assign(this, { field, groundY, ronin, heroX });
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

  light(node) { if (node instanceof FigureSprite) node.setTint(this.ambient.shade, this.ambient.amount); }

  /** A foe cut down: taken apart where the cut goes through him (`severance`), or felled whole. Returns where he
   *  parts, on the lane, for the blood and the cut's mark. */
  kill(cast, severance, piece, feet, facing, away, force, variant) {
    return this.fell(cast, piece, feet, facing, force);
  }

  /** A foe felled whole, from `piece` (the pose he froze in): thrown back off his feet, or folding where he stands.
   *  Returns the middle of his chest on the lane, where the blood leaves him. */
  fell(cast, piece, feet, facing, force = 1) {
    const near = Math.random();
    const node = new FigureSprite(cast);
    node.applyPiece(piece, this.ronin);
    node.xScale = facing;
    node.at(feet.x, feet.y);
    this.corpses.add(node);
    this.light(node);
    const body = { node, cast, state: 'falling', vx: -facing * this.ronin * rand(0.25, 0.7) * force, vy: 0, spin: 0,
      angle: 0, target: facing * Math.PI / 2 * rand(0.92, 1.04), fold: Math.random() < 0.34, clock: 0, feet: { ...feet },
      height: this.ronin * Builds[cast].height, gore: this.gore, restY: 0, facing };
    this.place(body, near);
    this.bodies.push(body);
    const chest = { x: feet.x, y: feet.y + body.height * 0.6 };
    this.bleed(body, { x: 0, y: body.height * 0.6 }, Math.PI / 2 - facing * 0.7, 120 * force, this.ronin * 1.2, 0.9);
    this.spatter(feet.x, 6 * force);
    this.trim();
    return chest;
  }

  /** Blood pumping from a body, at a point on its figure (points from its feet). */
  bleed(body, point, angle, rate, speed, seconds) {
    const gore = this.gore;
    if (!gore.on) return;
    const jet = spurt(Palette.blood.mix(RGB.black, 0.25), { rate: rate * gore.flow, speed: speed * gore.force, size: this.ronin * 0.045 * gore.size,
      angle, spread: 0.35, gravity: this.gravity * 0.8, into: this.trails });
    jet.at(point.x, point.y);
    jet.xScale = 1 / (body.node.xScale || 1);
    body.node.add(jet);
    body.jet = jet;
    body.jetRate = rate * gore.flow;
    body.jetFor = seconds * gore.span;
    this.ground(jet, point.y, Math.sin(angle));
    this.shed += 1;
  }

  /** Makes a jet's drops live no longer than they take to reach the ground. */
  ground(jet, height, rising) {
    const g = Math.max(1, -jet.yAccel);
    const v = jet.speedP * rising;
    const t = (v + Math.sqrt(v * v + 2 * g * (Math.max(0, height) + this.ronin * 0.04))) / g;
    jet.lifetime = Math.min(0.5, 0.85 * t);
    jet.lifetimeRange = Math.min(0.3, 0.3 * t);
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
    this.shed += 1;
    jet.run(A.seq(A.wait(seconds * gore.span), A.run(() => { jet.birthRate = 0; }), A.wait(1), A.remove()));
  }

  /** A pool spreading on the ground at `x`. */
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
    this.shed += 1;
    if (this.pools.length > Carnage.mostPools) Carnage.fade(this.pools.shift());
    return pool;
  }

  /** Drops of blood flecked over the ground about `x`. */
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

  trim() {
    while (this.bodies.length > Carnage.most) {
      const i = this.bodies.findIndex((b) => b.state === 'resting');
      if (i < 0) break;
      const b = this.bodies.splice(i, 1)[0];
      Carnage.fade(b.node);
      if (b.pool) { Carnage.fade(b.pool); this.pools = this.pools.filter((p) => p !== b.pool); }
    }
  }

  static fade(node) { node.run(A.seq(A.fadeOut(0.6), A.remove())); }

  update(dt) {
    if (dt <= 0) return;
    for (const b of this.bodies) {
      b.clock += dt;
      if (b.jet) {
        if (!this.gore.on) b.jetFor = Math.min(b.jetFor, 0);
        b.jetFor -= dt;
        const beatV = Math.max(0, Math.sin(b.clock * 15));
        b.jet.birthRate = b.jetFor > 0 ? b.jetRate * (0.25 + 0.75 * beatV) * Math.min(1, b.jetFor) : 0;
        if (b.jetFor < -1) { b.jet.remove(); b.jet = null; }
      }
      if (b.state !== 'falling') continue;
      // Over onto the ground: slow at first off his feet, then faster, the feet sliding a little the other way.
      const node = b.node;
      const t = b.clock;
      const turn = Math.min(1, t / (b.fold ? 0.55 : 0.45));
      const eased = turn * turn * (1.6 - 0.6 * turn);
      node.rotation = b.target * eased;
      if (b.fold) node.yScale = 1 - 0.45 * eased;
      b.vx *= Math.pow(0.05, dt);
      node.x += b.vx * dt;
      // Settling onto the line he lies on.
      node.y = b.feet.y + (b.floor - b.feet.y) * eased - Math.sin(turn * Math.PI) * 0;
      if (turn >= 1) {
        b.state = 'resting';
        node.run(A.seq(A.moveBy(0, this.ronin * 0.03, 0.06), A.moveBy(0, -this.ronin * 0.03, 0.08)));
        this.rest(b);
      }
    }
  }

  rest(b) {
    const node = b.node;
    let x = node.x - b.facing * b.height * 0.45;
    if (Math.abs(node.x - this.heroX) < this.ronin * 0.34) {
      const to = this.heroX + (node.x < this.heroX ? -1 : 1) * this.ronin * 0.34;
      node.run(A.moveBy(to - node.x, 0, 0.1));
      x += to - node.x;
    }
    if (this.gore.on) b.pool = this.pool(x, b.height * 0.8 * 1.2, 1.8, b.floor, b.gore);
  }
}
Carnage.most = 260;
Carnage.mostPools = 180;
Carnage.mostSpecks = 600;
Carnage.band = 0.4;
