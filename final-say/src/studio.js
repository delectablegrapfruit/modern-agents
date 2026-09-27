// The television studio: stage, LED wall, the three big X lights, the lighting rig, the judges' desk and the
// renderer that draws it all. The audience stands are built by audience.js.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, damp, lerp, TAU } from './util.js';

export const STAGE_Y = 0.75;
export const MARK = new THREE.Vector3(0, STAGE_Y, -8.5);
export const WING = new THREE.Vector3(10.5, STAGE_Y, -9.5);
export const SEAT = new THREE.Vector3(0, 1.36, 0.45);
export const JUDGE_SEATS = [new THREE.Vector3(-1.8, 0, 0.3), new THREE.Vector3(1.8, 0, 0.3)];

export const COLORS = {
  night: 0x0c0a17,
  gold: 0xffc53d,
  red: 0xff3d57,
  green: 0x36d399,
  violet: 0x7c5cff,
  warm: 0xffe2b0,
  cyan: 0x4fd6ff,
  magenta: 0xff4fb6,
};

const materialCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0, ...opts }));
  }
  return materialCache.get(key);
}

const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};

export const DISPLAY_FONT = '"Big Shoulders Display", Impact, "Arial Narrow Bold", sans-serif';
export const BODY_FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';

// Wraps text into lines no wider than maxWidth for the given canvas context.
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

// The giant screen behind the stage. Everything it shows is drawn to a canvas.
class LedWall {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = Math.round((1280 * height) / width);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.content = { kind: 'logo' };
    this.hue = 265;
    this.energy = 0.2;
    this.brightness = 1;
    this.lastDraw = -1;
    this.scan = this.makeScanlines();
  }
  makeScanlines() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, 3, 4, 1);
    g.fillRect(3, 0, 1, 4);
    return this.ctx.createPattern(c, 'repeat');
  }
  show(content) {
    this.content = content;
    this.lastDraw = -1;
  }
  update(t) {
    if (t - this.lastDraw < 1 / 24) return;
    this.lastDraw = t;
    this.draw(t);
    this.texture.needsUpdate = true;
  }
  background(t) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const h = this.hue;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${h}, 70%, ${8 + this.energy * 6}%)`);
    g.addColorStop(1, `hsl(${h + 40}, 80%, ${4 + this.energy * 4}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sweeping beams, faster with the energy of the room.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const x = ((i / 7) * W + t * (40 + this.energy * 160) * (i % 2 ? 1 : -1)) % (W * 1.4);
      const bx = x < -W * 0.2 ? x + W * 1.4 : x;
      const beam = ctx.createLinearGradient(bx - 90, 0, bx + 90, 0);
      beam.addColorStop(0, 'rgba(0,0,0,0)');
      beam.addColorStop(0.5, `hsla(${h + i * 18}, 90%, 60%, ${0.06 + this.energy * 0.12})`);
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(bx - 40, H);
      ctx.lineTo(bx + 40, H);
      ctx.lineTo(bx + 200 * Math.sin(t * 0.3 + i), 0);
      ctx.lineTo(bx + 200 * Math.sin(t * 0.3 + i) - 120, 0);
      ctx.fill();
    }
    ctx.restore();
  }
  draw(t) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const c = this.content;
    this.background(t);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (c.kind === 'logo') {
      this.drawLogo(W / 2, H / 2, 1, t);
    } else if (c.kind === 'title') {
      ctx.fillStyle = c.color || '#fff4dc';
      ctx.font = `900 ${c.size || 150}px ${DISPLAY_FONT}`;
      const lines = wrapText(ctx, c.title.toUpperCase(), W * 0.9).slice(0, 2);
      const lh = (c.size || 150) * 0.95;
      const top = H / 2 - ((lines.length - 1) * lh) / 2 - (c.sub ? 40 : 0);
      ctx.shadowColor = `hsla(${this.hue}, 90%, 60%, 0.9)`;
      ctx.shadowBlur = 30;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
      ctx.shadowBlur = 0;
      if (c.sub) {
        ctx.font = `700 46px ${BODY_FONT}`;
        ctx.fillStyle = '#ffc53d';
        ctx.fillText(c.sub, W / 2, top + (lines.length - 1) * lh + 120);
      }
    } else if (c.kind === 'image' && c.image) {
      this.drawContain(c.image, 40, 30, W - 80, H - 60);
    } else if (c.kind === 'versus') {
      this.drawSide(c.left, 0, W / 2);
      this.drawSide(c.right, W / 2, W / 2);
      ctx.font = `900 120px ${DISPLAY_FONT}`;
      ctx.fillStyle = '#ffc53d';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 20;
      ctx.fillText('VS', W / 2, H / 2);
      ctx.shadowBlur = 0;
      if (c.round) {
        ctx.font = `700 34px ${BODY_FONT}`;
        ctx.fillStyle = '#fff4dc';
        ctx.fillText(c.round.toUpperCase(), W / 2, 40);
      }
    } else if (c.kind === 'x') {
      this.drawLogo(W / 2, H / 2, 0.6, t);
    }
    ctx.fillStyle = this.scan;
    ctx.fillRect(0, 0, W, H);
    if (this.brightness < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - this.brightness})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  drawSide(side, x, w) {
    const { ctx, canvas } = this;
    const H = canvas.height;
    if (!side) return;
    if (side.image) {
      this.drawContain(side.image, x + 30, 70, w - 60, H - 110);
    } else {
      ctx.fillStyle = '#fff4dc';
      let size = 84;
      ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
      let lines = wrapText(ctx, side.text.toUpperCase(), w - 110);
      while ((lines.length > 3 || lines.some((l) => ctx.measureText(l).width > w - 110)) && size > 34) {
        size -= 6;
        ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
        lines = wrapText(ctx, side.text.toUpperCase(), w - 110);
      }
      lines = lines.slice(0, 4);
      const lh = size * 1.0;
      const top = H / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, x + w / 2, top + i * lh));
    }
  }
  drawContain(image, x, y, w, h) {
    const iw = image.width || image.naturalWidth || 1;
    const ih = image.height || image.naturalHeight || 1;
    const s = Math.min(w / iw, h / ih);
    const dw = iw * s;
    const dh = ih * s;
    this.ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  drawLogo(cx, cy, scale, t) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    // Starburst
    ctx.save();
    ctx.rotate(t * 0.05);
    for (let i = 0; i < 24; i++) {
      ctx.rotate(TAU / 24);
      ctx.fillStyle = i % 2 ? 'rgba(255,197,61,0.10)' : 'rgba(124,92,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(900, -60);
      ctx.lineTo(900, 60);
      ctx.fill();
    }
    ctx.restore();
    ctx.font = `900 190px ${DISPLAY_FONT}`;
    ctx.fillStyle = '#fff4dc';
    ctx.shadowColor = 'rgba(255,197,61,0.9)';
    ctx.shadowBlur = 40;
    ctx.fillText('FINAL SAY', 0, -10);
    ctx.shadowBlur = 0;
    ctx.font = `700 40px ${BODY_FONT}`;
    ctx.fillStyle = '#ffc53d';
    ctx.fillText('★  THE PANEL DECIDES  ★', 0, 110);
    ctx.restore();
  }
}

// An X lamp above the stage; one per judge. Lit when that judge buzzes.
class XLight {
  constructor() {
    this.group = new THREE.Group();
    this.material = new THREE.MeshStandardMaterial({ color: 0x2a0a10, emissive: COLORS.red, emissiveIntensity: 0.05, roughness: 0.4 });
    const bar = new THREE.BoxGeometry(2.1, 0.36, 0.2);
    const a = new THREE.Mesh(bar, this.material);
    const b = new THREE.Mesh(bar, this.material);
    a.rotation.z = Math.PI / 4;
    b.rotation.z = -Math.PI / 4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.12), mat(0x111018, { roughness: 0.5, metalness: 0.6 }));
    frame.position.z = -0.15;
    this.group.add(frame, a, b);
    this.on = false;
    this.level = 0;
  }
  update(dt, t) {
    this.level = damp(this.level, this.on ? 1 : 0, 14, dt);
    const flicker = this.on ? 0.85 + 0.15 * Math.sin(t * 40) : 1;
    this.material.emissiveIntensity = 0.05 + this.level * 6 * flicker;
  }
}

// A moving-head spotlight with a visible beam.
class MovingHead {
  constructor(beamTexture, withLight) {
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 12), mat(0x1a1a22, { metalness: 0.7, roughness: 0.35 }));
    this.head = new THREE.Group();
    this.head.add(body);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.lens.rotation.x = Math.PI / 2;
    this.lens.position.y = -0.26;
    this.head.add(this.lens);
    const beamLength = 13;
    const geo = new THREE.CylinderGeometry(0.12, 1.5, beamLength, 24, 1, true);
    geo.translate(0, -beamLength / 2 - 0.26, 0);
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      alphaMap: beamTexture,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.beam = new THREE.Mesh(geo, this.beamMaterial);
    this.head.add(this.beam);
    this.group.add(this.head);
    if (withLight) {
      this.light = new THREE.SpotLight(0xffffff, 120, 30, 0.22, 0.7, 1.4);
      this.light.position.set(0, -0.3, 0);
      this.target = new THREE.Object3D();
      this.target.position.set(0, -10, 0);
      this.head.add(this.light, this.target);
      this.light.target = this.target;
    }
    this.color = new THREE.Color(0xffffff);
    this.targetColor = new THREE.Color(0xffffff);
    this.phase = Math.random() * TAU;
    this.pan = 0;
    this.tilt = 0;
  }
}

function makeBeamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.6, '#555');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function makeStageTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#15112a';
  g.fillRect(0, 0, 1024, 1024);
  // Boards
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 2;
  for (let x = 0; x <= 1024; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 1024);
    g.stroke();
  }
  // Emblem around the mark
  const cx = 512;
  const cy = 640;
  g.strokeStyle = 'rgba(255,197,61,0.55)';
  g.lineWidth = 6;
  for (const r of [120, 170]) {
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,197,61,0.7)';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 40 : 95;
    const a = -Math.PI / 2 + (i * TAU) / 10;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A framed board on stage that shows an entry (a photo or a line of text) in the tournament and swipe modes.
export class Placard {
  constructor() {
    this.group = new THREE.Group();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    // Kept just under the bloom threshold so white cards and bright photos stay readable.
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0xd9d9d9 }));
    this.frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.08), mat(0x9c7a2c, { metalness: 0.4, roughness: 0.55 }));
    this.frame.position.z = -0.05;
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.glow.position.z = 0.01;
    this.inner = new THREE.Group();
    this.inner.add(this.frame, this.face, this.glow);
    this.group.add(this.inner);
    this.setSize(2.4, 1.8);
    this.group.visible = false;
  }
  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.face.scale.set(w, h, 1);
    this.glow.scale.set(w, h, 1);
    this.frame.scale.set(w + 0.16, h + 0.16, 1);
  }
  // Shows an image (fitted inside maxW × maxH metres) or, when image is null, text on a card.
  showEntry({ image, text, sub }, maxW = 3.2, maxH = 2.3) {
    const { ctx, canvas } = this;
    if (image) {
      const iw = image.width || image.naturalWidth || 1;
      const ih = image.height || image.naturalHeight || 1;
      const s = Math.min(maxW / iw, maxH / ih);
      this.setSize(iw * s, ih * s);
      const scale = Math.min(1, 2048 / Math.max(iw, ih));
      canvas.width = Math.max(2, Math.round(iw * scale));
      canvas.height = Math.max(2, Math.round(ih * scale));
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      this.setSize(Math.min(maxW, 3.0), Math.min(maxH, 2.0));
      canvas.width = 1024;
      canvas.height = Math.round((1024 * this.h) / this.w);
      const W = canvas.width;
      const H = canvas.height;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#fff8e6');
      g.addColorStop(1, '#f1e2bd');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1b1530';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 120;
      const content = String(text || '');
      ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
      let lines = wrapText(ctx, content, W - 120);
      while ((lines.length * size * 1.05 > H - (sub ? 200 : 120) || lines.some((l) => ctx.measureText(l).width > W - 120)) && size > 30) {
        size -= 6;
        ctx.font = `900 ${size}px ${size < 60 ? BODY_FONT : DISPLAY_FONT}`;
        lines = wrapText(ctx, content, W - 120);
      }
      const maxLines = Math.floor((H - 100) / (size * 1.05));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] += ' …';
      }
      const lh = size * 1.05;
      const top = H / 2 - ((lines.length - 1) * lh) / 2 - (sub ? 30 : 0);
      lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
      if (sub) {
        ctx.font = `700 40px ${BODY_FONT}`;
        ctx.fillStyle = '#7a6a45';
        ctx.fillText(sub.length > 60 ? `${sub.slice(0, 58)}…` : sub, W / 2, H - 60);
      }
    }
    this.texture.dispose();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.face.material.map = this.texture;
    this.face.material.needsUpdate = true;
    this.group.visible = true;
  }
}

export class Studio {
  constructor(container, settings) {
    this.settings = settings;
    const lowPower = settings.quality === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 2));
    this.renderer.shadowMap.enabled = !lowPower;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06050c);
    this.scene.fog = new THREE.Fog(0x06050c, 18, 42);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
    this.camera.position.copy(SEAT);

    this.build();

    this.composer = null;
    if (!lowPower) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.45, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.mood = { hue: 265, energy: 0.2, golden: 0, flash: 0, dim: 0 };
  }

  build() {
    const s = this.scene;
    // Base light so nothing is pure black.
    this.hemi = new THREE.HemisphereLight(0x8a7cff, 0x120c20, 0.55);
    s.add(this.hemi);

    // Studio floor and dark surroundings
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat(0x0d0b16, { roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // Stage
    this.stageTexture = makeStageTexture();
    const stageTop = new THREE.Mesh(
      new THREE.BoxGeometry(20, STAGE_Y, 10.5),
      [
        mat(0x100d1e),
        mat(0x100d1e),
        new THREE.MeshStandardMaterial({ map: this.stageTexture, roughness: 0.28, metalness: 0.15 }),
        mat(0x100d1e),
        mat(0x100d1e),
        mat(0x100d1e),
      ]
    );
    stageTop.position.set(0, STAGE_Y / 2, -10.25);
    stageTop.receiveShadow = true;
    s.add(stageTop);
    // Rounded apron at the front of the stage
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, STAGE_Y, 48, 1, false, -Math.PI / 2, Math.PI), [
      mat(0x100d1e),
      new THREE.MeshStandardMaterial({ color: 0x1a1533, roughness: 0.3, metalness: 0.15 }),
      mat(0x100d1e),
    ]);
    apron.scale.set(1, 1, 0.5);
    apron.position.set(0, STAGE_Y / 2, -5);
    apron.receiveShadow = true;
    s.add(apron);
    // Footlight strip along the stage edge
    const stripMaterial = new THREE.MeshBasicMaterial({ color: COLORS.gold, toneMapped: false });
    this.stripMaterial = stripMaterial;
    const strip = new THREE.Mesh(new THREE.TorusGeometry(5.21, 0.03, 6, 64, Math.PI), stripMaterial);
    strip.rotation.x = Math.PI / 2;
    strip.scale.set(1, 0.5, 1);
    strip.position.set(0, STAGE_Y - 0.04, -5);
    s.add(strip);
    const strip2 = box(20, 0.05, 0.05, stripMaterial, 0, STAGE_Y - 0.04, -5);
    strip2.scale.x = 0.24;
    strip2.position.x = -7.4;
    const strip3 = strip2.clone();
    strip3.position.x = 7.4;
    s.add(strip2, strip3);

    // LED wall
    this.wall = new LedWall(13.6, 5.4);
    this.wall.mesh.position.set(0, STAGE_Y + 3.2, -14.9);
    s.add(this.wall.mesh);
    const wallFrame = box(14.0, 5.8, 0.3, mat(0x0a0912, { metalness: 0.6, roughness: 0.4 }), 0, STAGE_Y + 3.2, -15.1);
    s.add(wallFrame);

    // The three X lights
    this.xLights = [];
    for (let i = 0; i < 3; i++) {
      const x = new XLight();
      x.group.position.set((i - 1) * 2.8, STAGE_Y + 7.2, -14.2);
      x.group.scale.setScalar(0.85);
      this.xLights.push(x);
      s.add(x.group);
    }

    // Curtains and proscenium
    const curtainMaterial = new THREE.MeshStandardMaterial({ color: 0x4a0b2a, roughness: 0.85, side: THREE.DoubleSide });
    const curtainGeo = new THREE.PlaneGeometry(3.4, 11, 40, 1);
    const pos = curtainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 7) * 0.18);
    curtainGeo.computeVertexNormals();
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(curtainGeo, curtainMaterial);
      c.position.set(side * 9.4, STAGE_Y + 5.5 - 0.5, -12.5);
      c.rotation.y = side * -0.35;
      c.receiveShadow = true;
      s.add(c);
      const c2 = c.clone();
      c2.position.set(side * 9.9, STAGE_Y + 5.0, -8);
      c2.rotation.y = side * -0.9;
      s.add(c2);
      const tower = box(0.5, 12, 0.5, mat(0x1b1a24, { metalness: 0.8, roughness: 0.3 }), side * 8.6, 6, -5.6);
      s.add(tower);
    }
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.2, 60, 1), curtainMaterial);
    const vp = valance.geometry.attributes.position;
    for (let i = 0; i < vp.count; i++) vp.setZ(i, Math.sin(vp.getX(i) * 5) * 0.15);
    valance.geometry.computeVertexNormals();
    valance.position.set(0, 11.4, -6.2);
    s.add(valance);
    const truss = box(18, 0.4, 0.4, mat(0x1b1a24, { metalness: 0.8, roughness: 0.3 }), 0, 10.6, -6.4);
    s.add(truss);
    const truss2 = box(18, 0.4, 0.4, mat(0x1b1a24, { metalness: 0.8, roughness: 0.3 }), 0, 10.6, -12.5);
    s.add(truss2);

    // Key light on the mark, a cool back light, and two coloured washes
    this.key = new THREE.SpotLight(COLORS.warm, 170, 40, 0.36, 0.55, 1.6);
    this.key.position.set(0, 10.2, -2.5);
    this.key.target.position.copy(MARK);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.radius = 4;
    s.add(this.key, this.key.target);
    this.back = new THREE.SpotLight(0x88aaff, 150, 30, 0.5, 0.6, 1.6);
    this.back.position.set(0, 9.5, -13.5);
    this.back.target.position.set(0, STAGE_Y, -7.5);
    s.add(this.back, this.back.target);
    this.washes = [];
    for (const side of [-1, 1]) {
      const w = new THREE.SpotLight(COLORS.violet, 260, 32, 0.6, 0.8, 1.5);
      w.position.set(side * 8, 9, -3.5);
      w.target.position.set(-side * 1.5, STAGE_Y, -9);
      s.add(w, w.target);
      this.washes.push(w);
    }

    // Moving heads on the truss
    const beamTexture = makeBeamTexture();
    this.heads = [];
    for (let i = 0; i < 6; i++) {
      const h = new MovingHead(beamTexture, i === 1 || i === 4);
      h.group.position.set(-7.5 + i * 3, 10.2, -6.6);
      s.add(h.group);
      this.heads.push(h);
    }

    // Judges' desk
    const desk = new THREE.Group();
    const top = box(6.8, 0.08, 1.1, new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.12, metalness: 0.4 }), 0, 0.9, -0.75);
    const front = box(6.8, 0.86, 0.08, mat(0x14112a, { roughness: 0.4 }), 0, 0.45, -1.28);
    const glowStrip = box(6.8, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: COLORS.gold, toneMapped: false }), 0, 0.87, -1.33);
    const glowStrip2 = glowStrip.clone();
    glowStrip2.position.y = 0.06;
    desk.add(top, front, glowStrip, glowStrip2);
    top.receiveShadow = true;
    s.add(desk);

    // Buzzers: player's X and golden buzzer, and one X for each fellow judge.
    this.buzzers = {};
    const makeBuzzer = (x, color, name) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.045, 24), mat(0x16151d, { metalness: 0.7, roughness: 0.3 }));
      const domeMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.25 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 12, 0, TAU, 0, Math.PI / 2), domeMaterial);
      dome.position.y = 0.03;
      g.add(base, dome);
      g.position.set(x, 0.965, -0.95);
      s.add(g);
      this.buzzers[name] = { group: g, dome, material: domeMaterial, press: 0, glow: 0.15 };
    };
    makeBuzzer(-0.42, COLORS.red, 'player');
    makeBuzzer(0.42, COLORS.gold, 'golden');
    makeBuzzer(JUDGE_SEATS[0].x + 0.3, COLORS.red, 'judge0');
    makeBuzzer(JUDGE_SEATS[1].x - 0.3, COLORS.red, 'judge1');
    // Paper, pens and water glasses
    const paper = mat(0xf2eee4, { roughness: 0.95 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
    for (const x of [-1.95, -0.85, 1.6]) {
      const p = box(0.3, 0.005, 0.4, paper, x, 0.945, -0.6);
      p.rotation.y = (Math.random() - 0.5) * 0.4;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.13, 16), glass);
      cup.position.set(x + (x < 0 && x > -1 ? -0.35 : 0.45), 1.01, -0.95);
      s.add(p, cup);
    }
    this.deskLight = new THREE.PointLight(COLORS.warm, 2.2, 5, 1.5);
    this.deskLight.position.set(0, 2.2, 0.6);
    s.add(this.deskLight);
    // Judges' chairs
    for (const seat of [...JUDGE_SEATS, new THREE.Vector3(0, 0, 0.35)]) {
      const chair = new THREE.Group();
      chair.add(box(0.7, 0.12, 0.6, mat(0x2a2233, { roughness: 0.5 }), 0, 0.5, 0.05));
      chair.add(box(0.7, 1.0, 0.12, mat(0x2a2233, { roughness: 0.5 }), 0, 1.0, 0.38));
      chair.position.set(seat.x, 0, seat.z + 0.1);
      s.add(chair);
    }

    // A TV camera on a pedestal near the stage, for the look of the room.
    const cam = new THREE.Group();
    cam.add(box(0.5, 0.45, 0.9, mat(0x222230, { metalness: 0.5, roughness: 0.4 }), 0, 1.6, 0));
    cam.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 8), mat(0x333340, { metalness: 0.7 })));
    cam.children[1].position.y = 0.7;
    const tally = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    tally.position.set(0, 1.9, -0.3);
    cam.add(tally);
    cam.position.set(-5.2, 0, -3.2);
    cam.rotation.y = -0.5;
    s.add(cam);
    const cam2 = cam.clone();
    cam2.position.set(5.4, 0, -2.6);
    cam2.rotation.y = 0.6;
    s.add(cam2);

    // Placards for entries (tournament and swipe modes)
    this.placards = [new Placard(), new Placard(), new Placard()];
    for (const p of this.placards) s.add(p.group);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the stage in view on tall phone screens by widening the field of view.
    this.portrait = w / h < 0.9;
    this.baseFov = this.portrait ? 62 : w / h < 1.3 ? 56 : 50;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
    }
  }

  setX(i, on) {
    this.xLights[i].on = on;
  }
  clearX() {
    for (const x of this.xLights) x.on = false;
  }
  pressBuzzer(name) {
    const b = this.buzzers[name];
    if (b) b.press = 1;
  }
  setBuzzerGlow(name, glow) {
    const b = this.buzzers[name];
    if (b) b.glow = glow;
  }

  // mood: hue (0–360), energy 0..1; golden 0..1 floods the room with gold.
  update(dt, t) {
    const m = this.mood;
    this.wall.hue = lerp(this.wall.hue, m.hue, 1 - Math.exp(-2 * dt));
    this.wall.energy = damp(this.wall.energy, m.energy, 3, dt);
    this.wall.brightness = damp(this.wall.brightness, 1 - m.dim * 0.7, 4, dt);
    this.wall.update(t);
    for (let i = 0; i < 3; i++) this.xLights[i].update(dt, t);
    m.flash = damp(m.flash, 0, 5, dt);

    const beamColor = new THREE.Color().setHSL(((m.hue + 360) % 360) / 360, 0.8, 0.62);
    if (m.golden > 0.01) beamColor.lerp(new THREE.Color(COLORS.gold), m.golden);
    const energy = clamp(m.energy + m.flash);
    this.heads.forEach((h, i) => {
      const speed = 0.25 + energy * 1.4;
      h.phase += dt * speed;
      h.head.rotation.x = 0.22 + Math.sin(h.phase * 0.8 + i) * 0.3 * (0.3 + energy);
      h.head.rotation.z = (i - 2.5) * -0.08 + Math.sin(h.phase + i * 1.3) * (0.15 + energy * 0.35);
      const c = new THREE.Color().setHSL((((m.hue + i * 25 * energy) % 360) + 360) % 360 / 360, 0.85, 0.6);
      if (m.golden > 0.01) c.lerp(new THREE.Color(COLORS.gold), m.golden);
      h.beamMaterial.color.copy(c);
      h.beamMaterial.opacity = (0.03 + energy * 0.13 + m.golden * 0.15) * (1 - m.dim * 0.8);
      h.lens.material.color.copy(c);
      if (h.light) {
        h.light.color.copy(c);
        h.light.intensity = (20 + energy * 80 + m.golden * 100) * (1 - m.dim * 0.7);
      }
    });
    for (const w of this.washes) {
      w.color.copy(beamColor);
      w.intensity = (60 + energy * 110 + m.golden * 150) * (1 - m.dim * 0.7);
    }
    this.key.intensity = (160 + m.flash * 260 + m.golden * 140) * (1 - m.dim * 0.3);
    this.key.color.set(COLORS.warm);
    if (m.golden > 0.01) this.key.color.lerp(new THREE.Color(COLORS.gold), m.golden * 0.6);
    this.stripMaterial.color.set(COLORS.gold).multiplyScalar(0.5 + 0.5 * energy + m.golden);

    for (const b of Object.values(this.buzzers)) {
      b.press = damp(b.press, 0, 6, dt);
      b.dome.position.y = 0.03 - b.press * 0.02;
      b.material.emissiveIntensity = b.glow + b.press * 4;
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
