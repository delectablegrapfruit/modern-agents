// art.js: the app's Art.swift: textures drawn once in code (glows, sparks, the cut's crescent, arrows, blood on the
// glass, focus lines), the effects built of them (bursts, jets, rings, flashes), the weather, and the scenery's paths.

function texCanvas(w, h, draw) {
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  draw(x, w, h);
  return new Texture(c, w, h);
}

/** A radial gradient of white (or `white` grey) from its middle out, alpha at each stop. */
function radialTexture(size, stops, white = 1) {
  const t = texCanvas(size, size, (x) => {
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const v = Math.round(white * 255);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(${v},${v},${v},${a})`);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
  });
  t.symmetric = true;
  return t;
}

const Art = {};

function buildArt() {
  Art.glow = radialTexture(128, [[0, 1], [0.22, 0.55], [0.55, 0.14], [1, 0]]);
  Art.spark = radialTexture(32, [[0, 1], [0.3, 0.85], [1, 0]]);
  Art.dot = radialTexture(24, [[0, 1], [0.7, 1], [1, 0]]);
  Art.vignette = radialTexture(256, [[0, 0], [0.58, 0], [1, 0.8]], 0);
  Art.edge = radialTexture(256, [[0, 0], [0.55, 0], [1, 0.9]]);
  // The cut: a crescent sweeping upward, bright at its belly, fading to its tips.
  Art.crescent = texCanvas(160, 160, (x, s) => {
    const shape = makeCanvas(s, s), y = shape.getContext('2d');
    const c = s / 2, r = s * 0.40;
    y.fillStyle = '#fff';
    y.beginPath(); y.arc(c, c, r, 0, TAU); y.fill();
    y.globalCompositeOperation = 'destination-out';
    const inner = r * 0.985;
    // (CG's y is up: the inner circle a hair higher there is a hair lower here.)
    y.beginPath(); y.arc(c - r * 0.11, c - r * 0.01, inner, 0, TAU); y.fill();
    x.shadowColor = 'rgba(255,255,255,0.9)';
    x.shadowBlur = 7;
    x.drawImage(shape, 0, 0);
  });
  Art.band = texCanvas(256, 4, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.22, '#fff'); g.addColorStop(0.78, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  Art.streak = texCanvas(128, 16, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.8, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, h * 0.3, w, h * 0.4);
  });
  Art.arrow = texCanvas(56, 12, (x) => {
    // (Drawn with y up, as the app does.)
    x.translate(0, 12); x.scale(1, -1);
    const y = 6;
    x.strokeStyle = '#fff'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(6, y); x.lineTo(46, y); x.stroke();
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(56, y); x.lineTo(44, y + 4); x.lineTo(46, y); x.lineTo(44, y - 4); x.closePath(); x.fill();
    for (const dy of [3.5, -3.5]) { x.beginPath(); x.moveTo(1, y + dy); x.lineTo(11, y); x.lineTo(5, y + dy); x.closePath(); x.fill(); }
  });
  Art.petal = texCanvas(16, 10, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(8, 5, 7, 4, 0, 0, TAU); x.fill(); });
  Art.petal.symmetric = true;
  Art.raindrop = texCanvas(4, 32, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, '#fff');
    x.fillStyle = g; x.fillRect(0, 0, 4, 32);
  });
  Art.splats = [0, 1, 2, 3].map((k) => makeSplat(k));
  Art.foci = [0, 1, 2].map((k) => makeFocus(0xF0C05 + k));
  Art.ray = texCanvas(128, 16, (x, w, h) => {
    x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, 1); x.lineTo(w, h - 1); x.closePath(); x.clip();
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, '#fff'); g.addColorStop(1, '#fff');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}

function makeSplat(seed) {
  return texCanvas(128, 128, (x) => {
    x.translate(0, 128); x.scale(1, -1);
    const rng = new SeededRNG(BigInt.asUintN(64, BigInt(seed) * 7919n + 31n));
    x.fillStyle = '#fff';
    const ell = (cx, cy, rx, ry) => { x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); x.fill(); };
    const c = { x: 64, y: 72 };
    const r = rng.range(17, 24);
    ell(c.x, c.y, r, r * 0.9);
    for (let k = 0; k < 7; k++) {
      const a = rng.range(0, TAU), d = r * rng.range(0.55, 0.95), q = r * rng.range(0.35, 0.6);
      ell(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, q, q);
    }
    for (let k = 0; k < 14; k++) {
      const a = rng.range(0, TAU), d = r * rng.range(1.2, 2.3), q = rng.range(1.2, 4.2);
      ell(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, q, q);
    }
    for (let k = 0; k < 3; k++) {
      const px = c.x + rng.range(-0.7, 0.7) * r, w = rng.range(2.5, 5), length = rng.range(22, 52);
      x.fillRect(px - w / 2, c.y - length, w, length);
      ell(px, c.y - length, w * 0.9, w);
    }
  });
}

function makeFocus(seed) {
  const t = texCanvas(512, 512, (x) => {
    const rng = new SeededRNG(seed);
    const c = 256;
    for (let k = 0; k < 110; k++) {
      const a = rng.range(0, TAU), w = rng.range(0.003, 0.016);
      const outer = rng.range(150, 254), inner = rng.range(70, outer - 40);
      x.fillStyle = `rgba(255,255,255,${rng.range(0.45, 1)})`;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      x.lineTo(c + Math.cos(a - w) * outer, c + Math.sin(a - w) * outer);
      x.lineTo(c + Math.cos(a + w) * outer, c + Math.sin(a + w) * outer);
      x.closePath(); x.fill();
    }
  });
  t.symmetric = true;
  return t;
}

/** A vertical gradient: the sky, from `top` down to `bottom` (Art.gradient). */
function gradientTexture(top, bottom) {
  return texCanvas(4, 256, (x) => {
    const g = x.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, bottom.css()); g.addColorStop(0.35, bottom.mix(top, 0.45).css()); g.addColorStop(1, top.css());
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  });
}

// MARK: Effects

/** A sprite of a texture in a colour, sized, at a point. */
function tintedSprite(texture, color, w, h) {
  const s = new Sprite(texture, w, h);
  s.color = color;
  return s;
}

/** A one-shot spray of particles that removes itself (Art.burst). */
function burst(color, { count, speed, size, life, spread = TAU, angle = 0, gravity = 0, additive = true, texture = null }) {
  const tex = texture || Art.spark;
  const e = new Emitter({
    texture: tex, birthRate: count * 60, numToEmit: count, lifetime: life, lifetimeRange: life * 0.6,
    angle, angleRange: spread, speedP: speed, speedRange: speed * 0.8, yAccel: -gravity, pAlpha: 1, alphaSpeed: -1 / life,
    pScale: size / 32, scaleRange: size / 64, scaleSpeed: -size / 32 / life * 0.6, color, additive,
  });
  e.run(A.seq(A.wait(life * 2.2), A.remove()));
  return e;
}

/** A jet of blood from a wound, running until its birth rate is turned down (Art.spurt). */
function spurt(color, { rate, speed, size, angle, spread, gravity, into }) {
  return new Emitter({
    texture: Art.dot, birthRate: rate, lifetime: 0.5, lifetimeRange: 0.3, angle, angleRange: spread, speedP: speed,
    speedRange: speed * 0.5, yAccel: -gravity, pAlpha: 0.95, alphaSpeed: -1.4, pScale: size / 24, scaleRange: size / 48,
    scaleSpeed: -size / 24, color, additive: false, target: into,
  });
}

/** An expanding ring that fades out (Art.shockwave). */
function shockwave(color, { radius, grow, width, duration }) {
  const ring = new Shape(circlePath(radius));
  ring.strokeColor = color.css();
  ring.lineWidth = width;
  ring.run(A.seq(A.group(A.scaleTo(grow, duration), A.fadeOut(duration)).easedOut(), A.remove()));
  return ring;
}

/** A soft flash of light (Art.flash). */
function flash(color, { size, duration, alpha = 0.9 }) {
  const s = tintedSprite(Art.glow, color, size, size);
  s.blend = BLEND.add;
  s.alpha = alpha;
  s.setScale(0.6);
  s.run(A.seq(A.group(A.scaleTo(1.4, duration), A.fadeOut(duration)).easedOut(), A.remove()));
  return s;
}

/** Focus lines made for one blow, crisp however far they reach (Art.focusLines). */
function focusLines({ hole, reach, width = 2.5, count = 100, color = RGB.white }) {
  const node = new Node();
  for (let k = 0; k < count; k++) {
    const angle = Math.random() * TAU;
    const inner = hole * rand(1, 1.5);
    const outer = Math.max(inner + hole * 0.5, reach * rand(0.6, 1.2));
    const line = tintedSprite(Art.ray, color, outer - inner, width * rand(0.3, 1));
    line.ax = 0; line.ay = 0.5;
    line.at(Math.cos(angle) * inner, Math.sin(angle) * inner);
    line.rotation = angle;
    line.alpha = rand(0.45, 1);
    node.add(line);
  }
  return node;
}

/** Falling snow, petals, leaves or ash, rising embers, or driving rain (Art.weather). */
function weather(kind, size, tint, far = false, horizon = 0) {
  const e = new Emitter({ color: RGB.white });
  e.rangeX = size.w * 1.2;
  e.at(size.w / 2, size.h + 6);
  e.angle = -Math.PI / 2;
  const area = size.w / 400;
  switch (kind) {
    case 'embers':
      Object.assign(e, { texture: Art.spark, angle: Math.PI / 2, angleRange: 0.5, birthRate: 16 * area, speedP: 22, speedRange: 14,
        lifetime: 5, pScale: 0.1, scaleRange: 0.06, color: rgb(1.0, 0.55, 0.15), additive: true,
        alphaSeq: { values: [0, 1, 0.8, 0], times: [0, 0.1, 0.6, 1] }, xAccel: 3 });
      e.at(size.w / 2, -4);
      break;
    case 'leaves':
      Object.assign(e, { texture: Art.petal, birthRate: 3 * area, speedP: 16, speedRange: 8, angleRange: 0.6, lifetime: 11,
        pScale: 0.45, scaleRange: 0.2, rotationRange: TAU, rotationSpeed: 1.6, color: rgb(0.10, 0.28, 0.14), pAlpha: 0.9, xAccel: 4 });
      break;
    case 'ash':
      Object.assign(e, { texture: Art.spark, birthRate: 10 * area, speedP: 10, speedRange: 6, angleRange: 0.7, lifetime: 14,
        pScale: 0.1, scaleRange: 0.06, color: tint.mix(RGB.white, 0.3), pAlpha: 0.55, alphaRange: 0.3, xAccel: -2 });
      break;
    case 'snow':
      Object.assign(e, { texture: Art.spark, birthRate: 22 * area, speedP: 16, speedRange: 10, angleRange: 0.5, lifetime: 10,
        pScale: 0.12, scaleRange: 0.08, color: RGB.white, pAlpha: 0.85, alphaRange: 0.3, xAccel: -5 });
      break;
    case 'rain':
      Object.assign(e, { texture: Art.raindrop, birthRate: 70 * area, speedP: 330, speedRange: 60, angle: -Math.PI / 2 - 0.22,
        pRotation: -0.22, lifetime: 0.8, pScale: 0.55, scaleRange: 0.2, color: rgb(0.72, 0.82, 1.0), pAlpha: 0.28,
        alphaRange: 0.12, additive: true });
      e.rangeX = size.w * 1.5;
      e.x += size.w * 0.15;
      break;
    case 'petals':
      Object.assign(e, { texture: Art.petal, birthRate: 5 * area, speedP: 18, speedRange: 8, angleRange: 0.8, lifetime: 11,
        pScale: 0.35, scaleRange: 0.15, rotationRange: TAU, rotationSpeed: 2, color: rgb(1.0, 0.78, 0.86), pAlpha: 0.9, xAccel: 6 });
      break;
  }
  if (far) {
    e.pScale *= 0.5; e.scaleRange *= 0.5; e.speedP *= 0.55; e.speedRange *= 0.55; e.birthRate *= 1.4; e.xAccel *= 0.5;
    e.lifetime *= kind === 'rain' ? 1.3 : 1.6;
    e.alpha = 0.5;
    if (kind === 'embers') e.y = horizon;
  }
  const way = kind === 'embers' ? size.h + 6 - e.y : e.y + 6 - (far ? horizon : 0);
  if (kind !== 'embers' && kind !== 'rain') {
    const slowest = (e.speedP - e.speedRange / 2) * Math.cos(e.angleRange / 2);
    e.lifetime = Math.max(e.lifetime, way / Math.max(1, slowest));
  }
  const crossing = Math.min(e.lifetime, way / Math.max(1, e.speedP * Math.cos(e.angleRange / 4)));
  const drift = 0.5 * e.xAccel * crossing * crossing;
  if (drift !== 0) {
    const span = e.rangeX;
    e.x -= drift / 2;
    e.rangeX = span + Math.abs(drift);
    e.birthRate *= (span + Math.abs(drift)) / span;
  }
  e.advance(Math.min(e.lifetime, crossing));
  return e;
}

// MARK: Scenery

/** A seeded mountain ridge across `width`, between `low` and `high` above `base` (Art.ridge). */
function ridgePath(width, base, low, high, seed, jag) {
  const rng = new SeededRNG(seed);
  const p = new Path2D();
  p.moveTo(-4, base);
  const count = Math.max(3, jag);
  let x = -4;
  const step = (width + 8) / count;
  p.lineTo(x, base + low + (high - low) * rng.unit() * 0.5);
  for (let k = 0; k < count; k++) {
    const peak = base + low + (high - low) * rng.unit();
    const mid = x + step * rng.range(0.35, 0.65);
    p.lineTo(mid, peak);
    x += step;
    p.lineTo(x, base + low + (peak - base - low) * rng.range(0.1, 0.5));
  }
  p.lineTo(width + 4, base);
  p.closePath();
  return p;
}

/** The landmark silhouettes that frame a setting, keeping the middle clear for the fight (Art.landmark). */
function landmarkPath(kind, w, h, g, seed) {
  const path = new Path2D();
  const rng = new SeededRNG(seed);
  const rect = (x, y, width, height) => path.rect(x, y, width, height);
  const torii = (cx, s) => {
    const span = s * 0.9, post = s * 0.07;
    rect(cx - span / 2, g, post, s);
    rect(cx + span / 2 - post, g, post, s);
    rect(cx - span * 0.62, g + s * 0.78, span * 1.24, s * 0.07);
    path.moveTo(cx - span * 0.72, g + s * 0.98);
    path.quadraticCurveTo(cx, g + s * 0.86, cx + span * 0.72, g + s * 0.98);
    path.lineTo(cx + span * 0.66, g + s * 1.06);
    path.quadraticCurveTo(cx, g + s * 0.95, cx - span * 0.66, g + s * 1.06);
    path.closePath();
    rect(cx - post / 2, g + s * 0.78, post, s * 0.2);
  };
  const pine = (cx, s) => {
    rect(cx - s * 0.03, g, s * 0.06, s * 0.3);
    for (let k = 0; k < 4; k++) {
      const y = g + s * (0.18 + 0.2 * k), half = s * (0.3 - 0.06 * k);
      path.moveTo(cx - half, y); path.lineTo(cx + half, y); path.lineTo(cx, y + s * 0.3); path.closePath();
    }
  };
  const roofed = (cx, width, height, y) => {
    rect(cx - width * 0.4, y, width * 0.8, height * 0.6);
    path.moveTo(cx - width * 0.62, y + height * 0.55);
    path.quadraticCurveTo(cx - width * 0.25, y + height * 0.6, cx, y + height);
    path.quadraticCurveTo(cx + width * 0.25, y + height * 0.6, cx + width * 0.62, y + height * 0.55);
    path.closePath();
  };
  switch (kind) {
    case 'torii':
      torii(w * 0.14, h * 0.5);
      torii(w * 0.9, h * 0.32);
      break;
    case 'bamboo':
      for (const side of [0, 1]) {
        for (let k = 0; k < 9; k++) {
          const x = side === 0 ? rng.range(-0.02, 0.2) * w : rng.range(0.8, 1.02) * w;
          const thick = rng.range(0.012, 0.022) * h * 4;
          const lean = rng.range(-0.04, 0.04) * h;
          const top = h * 1.2;
          path.moveTo(x, g); path.lineTo(x + thick, g); path.lineTo(x + thick + lean, top); path.lineTo(x + lean, top); path.closePath();
          let y = g + rng.range(0.1, 0.25) * h;
          while (y < top) {
            const t = (y - g) / (top - g);
            rect(x + lean * t - thick * 0.25, y, thick * 1.5, Math.max(1, thick * 0.22));
            y += rng.range(0.16, 0.24) * h;
          }
        }
      }
      break;
    case 'pagoda': {
      const cx = w * 0.86, base = h * 0.2;
      rect(cx - base * 0.9, g, base * 1.8, base * 0.8);
      for (let k = 0; k < 4; k++) {
        const y = g + base * (0.8 + 0.85 * k), half = base * (1.55 - 0.22 * k);
        path.moveTo(cx - half, y);
        path.quadraticCurveTo(cx, y + base * 0.28, cx + half, y);
        path.lineTo(cx + half * 0.6, y + base * 0.34);
        path.lineTo(cx - half * 0.6, y + base * 0.34);
        path.closePath();
        rect(cx - half * 0.5, y + base * 0.3, half, base * 0.6);
      }
      rect(cx - base * 0.05, g + base * 4.1, base * 0.1, base * 0.9);
      torii(w * 0.1, h * 0.36);
      break;
    }
    case 'pines':
      for (const [x, s] of [[0.04, 0.62], [0.13, 0.45], [0.2, 0.3], [0.83, 0.34], [0.92, 0.55], [1.0, 0.4]]) pine(w * x, h * s);
      break;
    case 'bridge': {
      const rail = g + h * 0.2;
      rect(-4, rail, w + 8, h * 0.028);
      rect(-4, g + h * 0.1, w + 8, h * 0.018);
      let x = 6;
      while (x < w) {
        rect(x, g, h * 0.035, h * 0.25);
        path.moveTo(x - h * 0.012 + h * 0.06, g + h * 0.24 + h * 0.025);
        path.ellipse(x - h * 0.012 + h * 0.03, g + h * 0.24 + h * 0.025, h * 0.03, h * 0.025, 0, 0, TAU);
        x += w / 9;
      }
      break;
    }
    case 'village':
      for (const [x, s] of [[0.05, 0.34], [0.16, 0.26], [0.84, 0.3], [0.95, 0.38]]) roofed(w * x, h * s * 1.3, h * s, g);
      break;
    case 'temple': {
      torii(w * 0.9, h * 0.44);
      const tx = w * 0.1;
      path.moveTo(tx - h * 0.04, g);
      path.quadraticCurveTo(tx + h * 0.08, g + h * 0.2, tx + h * 0.06, g + h * 0.5);
      path.lineTo(tx + h * 0.1, g + h * 0.5);
      path.quadraticCurveTo(tx + h * 0.12, g + h * 0.2, tx + h * 0.04, g);
      path.closePath();
      for (let k = 0; k < 7; k++) {
        const r = rng.range(0.1, 0.17) * h;
        const cx = tx + rng.range(-0.15, 0.35) * h, cy = g + rng.range(0.5, 0.72) * h;
        path.moveTo(cx + r * 1.3, cy);
        path.ellipse(cx, cy, r * 1.3, r, 0, 0, TAU);
      }
      break;
    }
    case 'banners':
      for (const [x, s] of [[0.05, 0.75], [0.12, 0.62], [0.19, 0.5], [0.82, 0.55], [0.9, 0.7], [0.97, 0.6]]) {
        const px = w * x, top = g + h * s;
        rect(px, g, h * 0.018, top - g);
        const flag = h * 0.09;
        path.moveTo(px + h * 0.018, top - h * 0.02);
        path.lineTo(px + h * 0.018 + flag, top - h * 0.03);
        path.lineTo(px + h * 0.018 + flag * 0.8, top - h * 0.32);
        path.lineTo(px + h * 0.018 + flag * 0.5, top - h * 0.28);
        path.lineTo(px + h * 0.018, top - h * 0.34);
        path.closePath();
        rect(px - flag * 0.1, top - h * 0.03, flag * 1.2, h * 0.012);
      }
      break;
  }
  return path;
}
