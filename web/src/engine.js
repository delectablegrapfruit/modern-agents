// engine.js: a small SpriteKit for Canvas, so the app's scene (built of SKNodes, SKActions and SKEmitterNodes) ports
// as it is written. Points with y up, the origin at the bottom left; every node's depth (its z plus its parents')
// orders the drawing, as the app's SKView does with ignoresSiblingOrder.

// MARK: Easing and actions

const Ease = {
  linear: (p) => p,
  in: (p) => p * p,
  out: (p) => 1 - (1 - p) * (1 - p),
  inOut: (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)),
};

/** An action: made once, run on any number of nodes (each run gets its own state). */
class Act {
  constructor(duration = 0) { this.duration = Math.max(0, duration); this.mode = 'linear'; }
  easedOut() { this.mode = 'out'; return this; }
  easedIn() { this.mode = 'in'; return this; }
  easedInOut() { this.mode = 'inOut'; return this; }
  /** A runner for one node: step(node, dt) returns the time left over once done, or -1 while running. */
  spawn() { return new TweenRun(this); }
  // Tweens override these.
  begin(node, s) {}
  apply(node, s, p) {}
}

class TweenRun {
  constructor(act) { this.act = act; this.t = 0; this.s = null; }
  step(node, dt) {
    const a = this.act;
    if (!this.s) { this.s = {}; a.begin(node, this.s); }
    this.t += dt;
    const d = a.duration;
    const p = d <= 0 ? 1 : Math.min(1, this.t / d);
    a.apply(node, this.s, Ease[a.mode](p));
    return this.t >= d ? this.t - d : -1;
  }
}

class Tween extends Act {
  constructor(duration, begin, apply) { super(duration); this._begin = begin; this._apply = apply; }
  begin(node, s) { if (this._begin) this._begin(node, s); }
  apply(node, s, p) { if (this._apply) this._apply(node, s, p); }
}

class SequenceAct extends Act {
  constructor(acts) { super(acts.reduce((t, a) => t + a.duration, 0)); this.acts = acts; }
  spawn() { return new SequenceRun(this); }
}
class SequenceRun {
  constructor(act) { this.act = act; this.i = 0; this.run = null; }
  step(node, dt) {
    const acts = this.act.acts;
    while (this.i < acts.length) {
      if (!this.run) this.run = acts[this.i].spawn();
      const left = this.run.step(node, dt);
      if (left < 0) return -1;
      dt = left;
      this.i++;
      this.run = null;
      if (!node.parent && node.removedByAction) return dt;
    }
    return dt;
  }
}

class GroupAct extends Act {
  constructor(acts) { super(acts.reduce((t, a) => Math.max(t, a.duration), 0)); this.acts = acts; }
  spawn() { return new GroupRun(this); }
}
class GroupRun {
  constructor(act) { this.act = act; this.runs = act.acts.map((a) => a.spawn()); this.done = this.runs.map(() => false); this.t = 0; this.inner = 0; }
  step(node, dt) {
    const d = this.act.duration;
    this.t += dt;
    // The group's own easing bends the time its members see.
    const p = d <= 0 ? 1 : Math.min(1, this.t / d);
    const inner = this.act.mode === 'linear' ? this.t : Ease[this.act.mode](p) * d + Math.max(0, this.t - d);
    const delta = inner - this.inner;
    this.inner = inner;
    let all = true;
    for (let k = 0; k < this.runs.length; k++) {
      if (this.done[k]) continue;
      if (this.runs[k].step(node, delta) >= 0) this.done[k] = true; else all = false;
    }
    return all ? Math.max(0, this.t - d) : -1;
  }
}

class RepeatAct extends Act {
  constructor(act, times) { super(times === Infinity ? Infinity : act.duration * times); this.act = act; this.times = times; }
  spawn() { return new RepeatRun(this); }
}
class RepeatRun {
  constructor(act) { this.act = act; this.n = 0; this.run = act.act.spawn(); }
  step(node, dt) {
    let guard = 0;
    while (true) {
      const left = this.run.step(node, dt);
      if (left < 0) return -1;
      this.n++;
      if (this.n >= this.act.times) return left;
      this.run = this.act.act.spawn();
      dt = left;
      // (A repeat of nothing would spin.)
      if (++guard > 1000 || this.act.act.duration <= 0) return -1;
    }
  }
}

class InstantRun {
  constructor(fn) { this.fn = fn; }
  step(node, dt) { this.fn(node); return dt; }
}
class InstantAct extends Act {
  constructor(fn) { super(0); this.fn = fn; }
  spawn() { return new InstantRun(this.fn); }
}

/** SKAction, by the names the app uses. */
const A = {
  seq: (...acts) => new SequenceAct(acts.flat()),
  group: (...acts) => new GroupAct(acts.flat()),
  wait: (d) => new Tween(d),
  run: (fn) => new InstantAct(() => fn()),
  remove: () => new InstantAct((node) => { node.removedByAction = true; node.remove(); }),
  forever: (act) => new RepeatAct(act, Infinity),
  repeat: (act, n) => new RepeatAct(act, n),
  fadeTo: (alpha, d) => new Tween(d, (n, s) => { s.a = n.alpha; }, (n, s, p) => { n.alpha = s.a + (alpha - s.a) * p; }),
  fadeOut: (d) => A.fadeTo(0, d),
  fadeIn: (d) => A.fadeTo(1, d),
  scaleTo: (k, d) => new Tween(d, (n, s) => { s.x = n.xScale; s.y = n.yScale; },
    (n, s, p) => { n.xScale = s.x + (k - s.x) * p; n.yScale = s.y + (k - s.y) * p; }),
  scaleBy: (k, d) => new Tween(d, (n, s) => { s.x = n.xScale; s.y = n.yScale; },
    (n, s, p) => { n.xScale = s.x * (1 + (k - 1) * p); n.yScale = s.y * (1 + (k - 1) * p); }),
  scaleXTo: (k, d) => new Tween(d, (n, s) => { s.x = n.xScale; }, (n, s, p) => { n.xScale = s.x + (k - s.x) * p; }),
  moveBy: (dx, dy, d) => new Tween(d, (n, s) => { s.p = 0; }, (n, s, p) => { n.x += dx * (p - s.p); n.y += dy * (p - s.p); s.p = p; }),
  moveTo: (x, y, d) => new Tween(d, (n, s) => { s.x = n.x; s.y = n.y; }, (n, s, p) => { n.x = s.x + (x - s.x) * p; n.y = s.y + (y - s.y) * p; }),
  rotateBy: (a, d) => new Tween(d, (n, s) => { s.p = 0; }, (n, s, p) => { n.rotation += a * (p - s.p); s.p = p; }),
  custom: (d, fn) => new Tween(d, null, (n, s, p) => fn(n, p * d)),
};

// MARK: Nodes

let nodeOrder = 0;

class Node {
  constructor() {
    this.x = 0; this.y = 0; this.z = 0;
    this.rotation = 0; this.xScale = 1; this.yScale = 1;
    this.alpha = 1; this.hidden = false; this.speed = 1;
    this.blend = null;
    this.children = [];
    this.parent = null;
    this.actions = [];
    this.name = null;
    this.order = nodeOrder++;
  }
  get position() { return { x: this.x, y: this.y }; }
  at(x, y) { this.x = x; this.y = y; return this; }
  setScale(k) { this.xScale = k; this.yScale = k; return this; }
  add(child) {
    if (child.parent) child.remove();
    child.parent = this;
    child.removedByAction = false;
    child.order = nodeOrder++;
    this.children.push(child);
    return child;
  }
  remove() {
    const p = this.parent;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i >= 0) p.children.splice(i, 1);
    this.parent = null;
  }
  removeAllChildren() { for (const c of this.children) c.parent = null; this.children = []; }
  childNamed(name) { return this.children.find((c) => c.name === name) || null; }
  run(act, key = null) {
    if (key) this.removeAction(key);
    this.actions.push({ run: act.spawn(), key });
    return this;
  }
  removeAction(key) { this.actions = this.actions.filter((a) => a.key !== key); }
  removeAllActions() { this.actions = []; }
  hasActions() { return this.actions.length > 0; }
  /** Runs the actions on this node and its descendants for `dt` seconds (each node's speed scales its own and its
   *  descendants', as SKNode.speed does). */
  tick(dt) {
    const d = dt * this.speed;
    if (this.actions.length && d > 0) {
      const list = this.actions;
      for (let k = 0; k < list.length; k++) {
        const entry = list[k];
        if (entry.done) continue;
        if (entry.run.step(this, d) >= 0) entry.done = true;
      }
      if (this.actions === list) this.actions = list.filter((a) => !a.done);
    }
    if (d > 0) this.update(d);
    const kids = this.children.slice();
    for (const c of kids) if (c.parent === this) c.tick(d);
  }
  /** Per-frame simulation (emitters). */
  update(dt) {}
  /** Draws the node itself, in its own space (y up), the context already transformed. */
  paint(ctx) {}
  get paints() { return false; }
  /** A point in this node's space, in the space of `other` (or the scene). */
  convert(px, py, other = null) {
    const m = this.worldMatrix();
    const x = m[0] * px + m[2] * py + m[4], y = m[1] * px + m[3] * py + m[5];
    if (!other) return { x, y };
    const inv = invert(other.worldMatrix());
    return { x: inv[0] * x + inv[2] * y + inv[4], y: inv[1] * x + inv[3] * y + inv[5] };
  }
  localMatrix() {
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    return [c * this.xScale, s * this.xScale, -s * this.yScale, c * this.yScale, this.x, this.y];
  }
  worldMatrix() {
    let m = this.localMatrix();
    for (let p = this.parent; p; p = p.parent) m = mul(p.localMatrix(), m);
    return m;
  }
}

function mul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

// MARK: Textures

/** A texture: a canvas and its size in points (as a CGImage-made SKTexture: a pixel a point, unless `scale`). */
class Texture {
  constructor(canvas, w = canvas.width, h = canvas.height) { this.canvas = canvas; this.w = w; this.h = h; this.tints = new Map(); this.symmetric = false; }
  /** The texture in one colour, its alpha kept (a sprite's colour at a blend factor of 1 on a white texture). */
  tinted(color) {
    if (!color) return this.canvas;
    const key = color.key();
    let c = this.tints.get(key);
    if (!c) {
      c = makeCanvas(this.canvas.width, this.canvas.height);
      const x = c.getContext('2d');
      x.drawImage(this.canvas, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color.css();
      x.fillRect(0, 0, c.width, c.height);
      this.tints.set(key, c);
    }
    return c;
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// MARK: Sprites, shapes, labels

const BLEND = { add: 'lighter', alpha: 'source-over' };

class Sprite extends Node {
  constructor(texture = null, w = null, h = null) {
    super();
    this.texture = texture;
    this.w = w ?? (texture ? texture.w : 0);
    this.h = h ?? (texture ? texture.h : 0);
    this.ax = 0.5; this.ay = 0.5;
    this.color = null;
    this.fill = null; // a plain coloured rectangle (SKSpriteNode(color:size:))
  }
  size(w, h) { this.w = w; this.h = h; return this; }
  anchor(ax, ay) { this.ax = ax; this.ay = ay; return this; }
  get paints() { return true; }
  paint(ctx) {
    if (this.w <= 0 || this.h <= 0) return;
    if (this.fill) {
      ctx.fillStyle = this.fill.css();
      ctx.fillRect(-this.ax * this.w, -this.ay * this.h, this.w, this.h);
      return;
    }
    if (!this.texture) return;
    if (this._tex !== this.texture || this._color !== this.color) {
      this._tex = this.texture; this._color = this.color; this._img = this.texture.tinted(this.color);
    }
    const img = this._img;
    ctx.scale(1, -1);
    ctx.drawImage(img, -this.ax * this.w, -(1 - this.ay) * this.h, this.w, this.h);
  }
}

/** A rectangle of colour (SKSpriteNode(color:size:)). */
function rectSprite(color, w, h, ax = 0.5, ay = 0.5) {
  const s = new Sprite(null, w, h);
  s.fill = color;
  s.ax = ax; s.ay = ay;
  return s;
}

class Shape extends Node {
  constructor(path = null) {
    super();
    this.path = path; // a Path2D in points, y up
    this.fillColor = null; // css string
    this.strokeColor = null;
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.glowWidth = 0;
  }
  get paints() { return !!this.path; }
  paint(ctx) {
    if (this.fillColor) { ctx.fillStyle = this.fillColor; ctx.fill(this.path); }
    if (this.strokeColor && this.lineWidth > 0) {
      ctx.strokeStyle = this.strokeColor;
      ctx.lineWidth = this.lineWidth;
      ctx.lineCap = this.lineCap;
      ctx.lineJoin = this.lineJoin;
      if (this.glowWidth > 0) {
        ctx.shadowColor = this.strokeColor;
        ctx.shadowBlur = this.glowWidth * 2 * R.px;
      }
      ctx.stroke(this.path);
      if (this.glowWidth > 0) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
    }
  }
}

function circlePath(r) { const p = new Path2D(); p.arc(0, 0, r, 0, TAU); return p; }
function ellipsePath(x, y, w, h) { const p = new Path2D(); p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); return p; }

/** The fonts: Optima where it is installed (the app's face), else the web face nearest it. */
const Fonts = {
  heading: { family: "Optima, 'Optima nova', Marcellus, Candara, 'Segoe UI', sans-serif", weight: 'bold', style: 'normal' },
  text: { family: "Optima, 'Optima nova', Marcellus, Candara, 'Segoe UI', sans-serif", weight: 'normal', style: 'normal' },
  italic: { family: "Optima, 'Optima nova', Marcellus, Candara, 'Segoe UI', sans-serif", weight: 'bold', style: 'italic' },
  seal: { family: "'Hiragino Mincho ProN', 'Noto Serif JP', 'Yu Mincho', serif", weight: '600', style: 'normal' },
};
const fontCSS = (f, size) => `${f.style} ${f.weight} ${size}px ${f.family}`;
let measureCtx = null;
function measure() { return measureCtx || (measureCtx = makeCanvas(4, 4).getContext('2d')); }

/** Text tracked out (the app's `Art.track`): each letter followed by `kern` points, the last one too. */
function textWidth(font, size, text, kern) {
  const m = measure();
  m.font = fontCSS(font, size);
  if (!kern) return m.measureText(text).width;
  let w = 0;
  for (const ch of text) w += m.measureText(ch).width + kern;
  return w;
}

class Label extends Node {
  constructor(font, size, color, align = 'center') {
    super();
    this.font = font; this.fontSize = size; this.fontColor = color; this.align = align;
    this.text = ''; this.kern = 0;
    this._key = null; this._img = null; this._w = 0; this._box = null;
  }
  set(text, kern = this.kern) { this.text = text; this.kern = kern; return this; }
  /** Its width in points (SKLabelNode's frame width). */
  get width() { return textWidth(this.font, this.fontSize, this.text, this.kern); }
  get paints() { return this.text.length > 0; }
  raster() {
    const px = R.px;
    const colorKey = typeof this.fontColor === 'string' ? this.fontColor : this.fontColor.css();
    const key = `${this.text}|${this.fontSize}|${colorKey}|${this.kern}|${px}|${fontCSS(this.font, 1)}|${R.fontEpoch}`;
    if (key === this._key) return;
    this._key = key;
    const m = measure();
    m.font = fontCSS(this.font, this.fontSize);
    const w = this.width;
    const probe = m.measureText(this.text);
    const asc = probe.actualBoundingBoxAscent ?? this.fontSize * 0.7, desc = probe.actualBoundingBoxDescent ?? this.fontSize * 0.2;
    const pad = Math.ceil(this.fontSize * 0.3) + 2;
    const cw = w + pad * 2, ch = asc + desc + pad * 2;
    const c = makeCanvas(cw * px, ch * px);
    const x = c.getContext('2d');
    x.scale(px, px);
    x.font = fontCSS(this.font, this.fontSize);
    x.fillStyle = colorKey;
    x.textBaseline = 'alphabetic';
    const base = pad + asc;
    if (!this.kern) {
      x.fillText(this.text, pad, base);
    } else {
      let at = pad;
      for (const glyph of this.text) { x.fillText(glyph, at, base); at += x.measureText(glyph).width + this.kern; }
    }
    this._img = c;
    this._w = w;
    this._box = { cw, ch, pad, asc, desc };
  }
  paint(ctx) {
    this.raster();
    const b = this._box;
    // Centred vertically on the ink of the text (SKLabelNode's .center).
    let left = this.align === 'left' ? 0 : this.align === 'right' ? -this._w : -this._w / 2;
    const mid = (b.asc - b.desc) / 2;
    ctx.scale(1, -1);
    ctx.drawImage(this._img, left - b.pad, -(b.pad + b.asc) + mid, b.cw, b.ch);
  }
}

// MARK: Particles

/** SKEmitterNode, with the properties the app sets. Particles live in the emitter's space, or in its `target`'s
 *  (a `ParticleHost`), so that a jet on a flying body leaves its drops behind. */
class Emitter extends Node {
  constructor(o = {}) {
    super();
    Object.assign(this, {
      texture: null, birthRate: 0, numToEmit: 0, lifetime: 1, lifetimeRange: 0, angle: 0, angleRange: 0,
      speedP: 0, speedRange: 0, xAccel: 0, yAccel: 0, pAlpha: 1, alphaRange: 0, alphaSpeed: 0, alphaSeq: null,
      pScale: 1, scaleRange: 0, scaleSpeed: 0, pRotation: 0, rotationRange: 0, rotationSpeed: 0, color: RGB.white,
      additive: false, rangeX: 0, rangeY: 0, target: null,
    }, o);
    this.parts = [];
    this.emitted = 0;
    this.carry = 0;
  }
  get paints() { return this.parts.length > 0; }
  spawnOne() {
    const p = {};
    p.life = Math.max(0.01, this.lifetime + (Math.random() - 0.5) * this.lifetimeRange);
    p.age = 0;
    const a = this.angle + (Math.random() - 0.5) * this.angleRange;
    const v = this.speedP + (Math.random() - 0.5) * this.speedRange;
    let x = (Math.random() - 0.5) * this.rangeX, y = (Math.random() - 0.5) * this.rangeY;
    let vx = Math.cos(a) * v, vy = Math.sin(a) * v;
    p.alpha = this.pAlpha + (Math.random() - 0.5) * this.alphaRange;
    p.scale = this.pScale + (Math.random() - 0.5) * this.scaleRange;
    p.rot = this.pRotation + (Math.random() - 0.5) * this.rotationRange;
    p.tex = this.texture; p.color = this.color; p.additive = this.additive;
    if (this._imgColor !== this.color || this._imgTex !== this.texture) {
      this._imgColor = this.color; this._imgTex = this.texture; this._img = this.texture.tinted(this.color);
    }
    p.img = this._img;
    p.ax = this.xAccel; p.ay = this.yAccel; p.alphaSpeed = this.alphaSpeed; p.scaleSpeed = this.scaleSpeed;
    p.rotSpeed = this.rotationSpeed; p.seq = this.alphaSeq; p.a0 = p.alpha;
    if (this.target && this.target !== this) {
      // Into the target's space: the point and the way it is thrown, as the target sees them.
      const m = mul(invert(this.target.worldMatrix()), this.worldMatrix());
      const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
      const tvx = m[0] * vx + m[2] * vy, tvy = m[1] * vx + m[3] * vy;
      x = tx; y = ty; vx = tvx; vy = tvy;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      this.target.host(p);
      return;
    }
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    this.parts.push(p);
  }
  update(dt) {
    if (this.birthRate > 0 && (this.numToEmit <= 0 || this.emitted < this.numToEmit)) {
      this.carry += this.birthRate * dt;
      let n = Math.floor(this.carry);
      this.carry -= n;
      if (this.numToEmit > 0) n = Math.min(n, this.numToEmit - this.emitted);
      for (let k = 0; k < n; k++) this.spawnOne();
      this.emitted += n;
    }
    stepParticles(this.parts, dt);
  }
  /** Runs the emitter ahead, as if it had been running `t` seconds (the weather, already falling). */
  advance(t) {
    const h = 1 / 30;
    for (let s = 0; s < t; s += h) this.update(Math.min(h, t - s));
  }
  paint(ctx) { paintParticles(ctx, this.parts); }
}

function stepParticles(parts, dt) {
  let w = 0;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    p.age += dt;
    if (p.age >= p.life) continue;
    p.vx += p.ax * dt; p.vy += p.ay * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.alpha += p.alphaSpeed * dt;
    p.scale += p.scaleSpeed * dt;
    p.rot += p.rotSpeed * dt;
    if (p.alpha <= 0 && !p.seq) continue;
    parts[w++] = p;
  }
  parts.length = w;
}

function seqValue(seq, t) {
  const { values, times } = seq;
  if (t <= times[0]) return values[0];
  for (let k = 1; k < times.length; k++) {
    if (t <= times[k]) return values[k - 1] + (values[k] - values[k - 1]) * (t - times[k - 1]) / (times[k] - times[k - 1]);
  }
  return values[values.length - 1];
}

function paintParticles(ctx, parts) {
  if (!parts.length) return;
  const base = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  const m = ctx.getTransform();
  let mode = op, moved = false;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p.scale <= 0) continue;
    const a = base * clamp(p.seq ? seqValue(p.seq, p.age / p.life) * p.a0 : p.alpha, 0, 1);
    if (a <= 0.004) continue;
    ctx.globalAlpha = a;
    const want = p.additive ? 'lighter' : op;
    if (want !== mode) { ctx.globalCompositeOperation = want; mode = want; }
    const img = p.img || (p.img = p.tex.tinted(p.color));
    const w = p.tex.w * p.scale, h = p.tex.h * p.scale;
    if (p.rot !== 0 || !p.tex.symmetric) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, -1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.setTransform(m);
      moved = true;
    } else {
      ctx.drawImage(img, p.x - w / 2, p.y - h / 2, w, h);
    }
  }
  if (moved) ctx.setTransform(m);
  ctx.globalAlpha = base;
  if (mode !== op) ctx.globalCompositeOperation = op;
}

/** A node that keeps particles emitted into it (an emitter's `target`), and draws them as its own. */
class ParticleHost extends Node {
  constructor() { super(); this.parts = []; }
  host(p) { this.parts.push(p); }
  get paints() { return this.parts.length > 0; }
  update(dt) { stepParticles(this.parts, dt); }
  paint(ctx) { paintParticles(ctx, this.parts); }
  clear() { this.parts = []; }
}

// MARK: Drawing a scene

/** The renderer: the canvas, the size of the scene in points, and how many device pixels a point is. */
const R = {
  canvas: null, ctx: null, W: 420, H: 150, px: 1, fontEpoch: 0,
  list: [],
  render(root, background) {
    const ctx = this.ctx, s = this.px;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    drawTree(ctx, root, [s, 0, 0, -s, 0, this.H * s], this.list);
  },

  /** Draws nodes that never change once into a picture `w` by `h` points (at the renderer's pixels), as one sprite
   *  anchored at its bottom left: the scenery, which would otherwise fill its paths every frame. */
  bake(nodes, w, h) {
    const s = this.px;
    const c = makeCanvas(w * s, h * s);
    const holder = new Node();
    for (const n of nodes) holder.add(n);
    drawTree(c.getContext('2d'), holder, [s, 0, 0, -s, 0, h * s], []);
    const sprite = new Sprite(new Texture(c, w, h), w, h);
    sprite.ax = 0; sprite.ay = 0;
    return sprite;
  },
};

function drawTree(ctx, root, base, list) {
  list.length = 0;
  collect(root, base, 1, 0, list);
  list.sort((a, b) => a.z - b.z || a.o - b.o);
  for (const e of list) {
    const m = e.m;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.globalAlpha = e.a;
    ctx.globalCompositeOperation = e.n.blend || 'source-over';
    e.n.paint(ctx);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

let collectOrder = 0;
function collect(node, parent, alpha, z, out) {
  if (node.hidden) return;
  const a = alpha * node.alpha;
  if (a <= 0.002) return;
  const m = mul(parent, node.localMatrix());
  const depth = z + node.z;
  if (node.paints) out.push({ n: node, m, a, z: depth, o: collectOrder++ });
  for (const c of node.children) collect(c, m, a, depth, out);
}
