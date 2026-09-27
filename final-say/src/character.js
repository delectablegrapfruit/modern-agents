// Stylised people (and one kind of dog) built from simple shapes, with a pose library for everything that happens
// on stage and at the desk. Poses are functions of time that return joint angles; the rig eases toward them.
import * as THREE from 'three';
import { mat } from './studio.js';
import { clamp, damp, rng, TAU } from './util.js';

export const SKIN = [0xffdbc4, 0xf1c3a1, 0xe0ac86, 0xc68a62, 0xa66b45, 0x8a5536, 0x6b3f27, 0x4f2e1d];
export const HAIR = [0x1c1410, 0x3b2616, 0x6a4526, 0xa0703d, 0xd6b370, 0xe8d8a8, 0xb33a20, 0x9b9b9b, 0xe6e6e6, 0x2a2440, 0xff5fa2, 0x3cc1ff];
export const CLOTH = [0xe63946, 0xf4a261, 0x2a9d8f, 0x264653, 0xe9c46a, 0x7c5cff, 0xff4fb6, 0x3a86ff, 0x8338ec, 0x06d6a0, 0xffffff, 0x222222, 0xc0c0c8, 0x9c6644, 0x1d3557, 0xff006e, 0xfb5607, 0x80b918];
export const HAIR_STYLES = ['short', 'bob', 'long', 'bun', 'spiky', 'mohawk', 'afro', 'bald', 'ponytail', 'curly'];

export function randomLook(r = rng, opts = {}) {
  const age = opts.age ?? r.int(18, 70);
  const senior = age >= 62;
  const kid = age < 14;
  const feminine = opts.feminine ?? r.chance(0.5);
  let hairStyle = feminine ? r.pick(['bob', 'long', 'bun', 'ponytail', 'curly', 'afro', 'short']) : r.pick(['short', 'spiky', 'mohawk', 'afro', 'bald', 'curly', 'short']);
  if (kid && hairStyle === 'bald') hairStyle = 'short';
  const hairColor = senior ? r.pick([0x9b9b9b, 0xe6e6e6, 0xd0d0d0]) : r.chance(0.12) ? r.pick([0xff5fa2, 0x3cc1ff, 0x7c5cff]) : r.pick(HAIR.slice(0, 7));
  return {
    skin: opts.skin ?? r.pick(SKIN),
    hair: hairColor,
    hairStyle: senior && !feminine && r.chance(0.5) ? 'bald' : hairStyle,
    top: opts.top ?? r.pick(CLOTH),
    bottom: opts.bottom ?? r.pick([0x222233, 0x2b3a67, 0x3d3d3d, 0x6b4f3a, ...CLOTH.slice(0, 6)]),
    bottomStyle: feminine ? r.pick(['trousers', 'skirt', 'dress', 'trousers', 'shorts']) : r.pick(['trousers', 'trousers', 'shorts']),
    shoes: r.pick([0x111111, 0xffffff, 0x6b3f27, 0xe63946]),
    height: kid ? r.range(0.62, 0.78) : r.range(0.94, 1.08) * (feminine ? 0.97 : 1.02),
    build: r.range(0.85, 1.35),
    hat: opts.hat ?? (r.chance(0.15) ? r.pick(['cap', 'beanie', 'bowler']) : null),
    hatColor: r.pick(CLOTH),
    glasses: opts.glasses ?? (r.chance(senior ? 0.5 : 0.18)),
    beard: !feminine && !kid && r.chance(0.25) ? r.pick(['beard', 'mustache']) : null,
    ...opts.extra,
  };
}

const REST = {
  bodyY: 0,
  bodyX: 0,
  spineX: 0,
  spineY: 0,
  spineZ: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  shLX: 0,
  shLZ: -0.1,
  shRX: 0,
  shRZ: 0.1,
  elLX: -0.15,
  elRX: -0.15,
  legLX: 0,
  legRX: 0,
  legLZ: 0,
  legRZ: 0,
};

const s = Math.sin;
const c = Math.cos;
const HIP = 0.86;

// Every pose returns the joints it moves; the rest come from REST. `p` is the character, `t` game time.
export const POSES = {
  idle(t, p) {
    const e = p.emotion;
    const b = s(t * 1.6 + p.seed) * 0.02;
    if (e === 'nervous')
      return { spineX: 0.06, headX: 0.25 + s(t * 9) * 0.02, shLX: -0.55, shRX: -0.55, shLZ: 0.35, shRZ: -0.35, elLX: -1.1, elRX: -1.1, bodyY: s(t * 11) * 0.004 };
    if (e === 'sad') return { spineX: 0.15, headX: 0.45, shLZ: 0.02, shRZ: -0.02, elLX: -0.05, elRX: -0.05 };
    if (e === 'happy' || e === 'elated') return { bodyY: Math.abs(s(t * 3)) * 0.02, spineX: b, shLZ: -0.2, shRZ: 0.2, headZ: s(t * 1.5) * 0.08 };
    if (e === 'cocky') return { spineX: -0.06, headX: -0.12, shLX: -0.3, shRX: -0.3, shLZ: 0.25, shRZ: -0.25, elLX: -1.9, elRX: -1.9 };
    return { spineX: b, headY: s(t * 0.4 + p.seed) * 0.15 };
  },
  walk(t, p) {
    const ph = p.walkPhase;
    return {
      legLX: s(ph) * 0.55,
      legRX: -s(ph) * 0.55,
      shLX: -s(ph) * 0.45,
      shRX: s(ph) * 0.45,
      elLX: -0.35,
      elRX: -0.35,
      bodyY: Math.abs(c(ph)) * 0.04,
      spineX: 0.05,
      headX: p.emotion === 'sad' ? 0.4 : 0,
    };
  },
  wave(t) {
    return { shRZ: 2.5 + s(t * 9) * 0.35, elRX: -0.25, headZ: -0.1, shLZ: -0.1, bodyY: Math.abs(s(t * 4)) * 0.01 };
  },
  talk(t, p) {
    const k = p.seed;
    return {
      shLX: -0.4 + s(t * 1.7 + k) * 0.25,
      shRX: -0.4 + s(t * 2.1 + k * 2) * 0.3,
      shLZ: -0.2 - Math.max(0, s(t * 1.3 + k)) * 0.3,
      shRZ: 0.2 + Math.max(0, s(t * 1.1 + k * 3)) * 0.3,
      elLX: -0.9,
      elRX: -0.9,
      headX: s(t * 2.3) * 0.06,
      headY: s(t * 0.9 + k) * 0.12,
      spineX: 0.03,
    };
  },
  sing(t, p) {
    const big = p.intensity;
    return {
      shRX: -1.25,
      shRZ: 0.35,
      elRX: -1.55,
      shLX: -0.4 - big * 0.8,
      shLZ: -0.3 - big * 0.9 - s(t * 1.4) * 0.2,
      elLX: -0.4 + big * 0.3,
      headX: -0.12 - big * 0.2,
      headZ: s(t * 1.1) * 0.1,
      spineX: -0.04 - big * 0.08,
      spineZ: s(t * 0.9) * 0.05,
      bodyY: p.beat * 0.02,
    };
  },
  mic(t, p) {
    // Holding the microphone and talking (comedians, hosts).
    return { shRX: -1.25, shRZ: 0.35, elRX: -1.55, shLX: -0.3 + s(t * 2 + p.seed) * 0.35, shLZ: -0.4 - Math.max(0, s(t * 1.2)) * 0.5, elLX: -1.0, headY: s(t * 0.8) * 0.2, headX: s(t * 2.2) * 0.05 };
  },
  dance(t, p) {
    const b = p.beatPhase * TAU; // one full cycle per beat
    const m = p.move;
    const sloppy = p.sloppy;
    const bounce = Math.abs(s(b)) * 0.06;
    switch (m % 6) {
      case 0: // groove
        return { bodyY: bounce, shLX: -0.8 + s(b) * 0.6, shRX: -0.8 - s(b) * 0.6, elLX: -1.4, elRX: -1.4, spineZ: s(b / 2) * 0.12, headX: s(b) * 0.1, legLX: s(b / 2) * 0.2 * sloppy + s(b) * 0.1 };
      case 1: // disco point
        return { bodyY: bounce, shRZ: s(b / 2) > 0 ? 2.7 : 0.5, shRX: s(b / 2) > 0 ? 0 : -0.3, elRX: -0.1, shLZ: -0.3, elLX: -1.8, shLX: -0.3, spineZ: s(b / 2) * 0.15, legRZ: 0.15 * (s(b / 2) > 0 ? 1 : 0) };
      case 2: // arms wave overhead
        return { bodyY: bounce * 0.5, shLZ: -2.6 + s(b) * 0.3, shRZ: 2.6 + s(b) * 0.3, elLX: -0.3, elRX: -0.3, spineZ: s(b / 2) * 0.2, headZ: s(b / 2) * 0.15 };
      case 3: // kicks
        return { bodyY: bounce, legLX: Math.max(0, s(b)) * -1.2, legRX: Math.max(0, -s(b)) * -1.2, shLZ: -1.3, shRZ: 1.3, elLX: -0.2, elRX: -0.2, spineX: -0.05 };
      case 4: // robot
        return { shLX: Math.round(s(b / 2)) * -1.2, shRX: Math.round(-s(b / 2)) * -1.2, elLX: -1.57, elRX: -1.57, headY: Math.round(s(b / 4)) * 0.6, spineY: Math.round(s(b / 4)) * 0.3, bodyY: 0 };
      default: // jump
        return { bodyY: Math.max(0, s(b)) * 0.45, shLZ: -2.4, shRZ: 2.4, legLX: -0.3 * Math.max(0, s(b)), legRX: -0.3 * Math.max(0, s(b)), legLZ: -0.3, legRZ: 0.3 };
    }
  },
  juggle(t, p) {
    const j = p.jugglePhase * TAU;
    return { shLX: -0.55, shRX: -0.55, shLZ: 0.1, shRZ: -0.1, elLX: -1.0 + s(j) * 0.35, elRX: -1.0 - s(j) * 0.35, headX: -0.35, spineX: -0.03 };
  },
  magic(t, p) {
    const k = p.intensity;
    return { shRX: -1.3 - k * 0.8, shRZ: 0.4 + s(t * 3) * 0.2, elRX: -0.2, shLX: -0.8, shLZ: -0.9 - k * 0.6, elLX: -0.3, headX: -0.1, spineX: -0.05 + s(t * 2) * 0.03 };
  },
  present(t) {
    // "Ta-da!"
    return { shLZ: -1.9, shRZ: 1.9, shLX: -0.3, shRX: -0.3, elLX: -0.1, elRX: -0.1, headX: -0.15, spineX: -0.08, bodyY: 0.02 };
  },
  bow() {
    return { spineX: 0.95, headX: 0.3, shLX: 0.1, shRX: 0.1 };
  },
  cheer(t, p) {
    return { bodyY: Math.max(0, s(t * 8 + p.seed)) * 0.25, shLZ: -2.7 + s(t * 10) * 0.2, shRZ: 2.7 - s(t * 10) * 0.2, elLX: -0.2, elRX: -0.2, headX: -0.25 };
  },
  clap(t, p) {
    const k = s(t * 14 + p.seed) * 0.28;
    return { shLX: -1.0, shRX: -1.0, shLZ: 0.45 + k, shRZ: -0.45 - k, elLX: -0.9, elRX: -0.9, bodyY: 0 };
  },
  cry() {
    return { shLX: -1.35, shRX: -1.35, shLZ: 0.3, shRZ: -0.3, elLX: -2.1, elRX: -2.1, headX: 0.35, spineX: 0.2 };
  },
  shock() {
    return { shLX: -1.1, shRX: -1.1, shLZ: 0.55, shRZ: -0.55, elLX: -2.3, elRX: -2.3, headX: -0.15, spineX: -0.12 };
  },
  coverEars() {
    return { shLZ: -2.2, shRZ: 2.2, shLX: -0.4, shRX: -0.4, elLX: -2.0, elRX: -2.0, headX: 0.2, spineX: 0.05 };
  },
  facepalm(t) {
    return { shRX: -1.3, shRZ: -0.2, elRX: -2.2, headX: 0.35, spineX: 0.12, headZ: s(t * 2) * 0.05 };
  },
  armsCrossed() {
    return { shLX: -0.55, shRX: -0.55, shLZ: 0.45, shRZ: -0.45, elLX: -1.85, elRX: -1.85, spineX: -0.05 };
  },
  point() {
    return { shRX: -1.5, shRZ: 0.1, elRX: -0.05, headX: -0.05 };
  },
  thinking(t) {
    return { shRX: -1.0, shRZ: -0.3, elRX: -2.3, headX: 0.1, headZ: 0.12, shLX: -0.4, shLZ: 0.4, elLX: -1.5, spineX: 0.08 + s(t) * 0.01 };
  },
  thumbsUp() {
    return { shRX: -1.2, shRZ: 0.3, elRX: -1.3, headX: -0.1 };
  },
  thumbsDown() {
    return { shRX: -0.9, shRZ: 0.2, elRX: 0.0, headX: 0.1, headY: -0.2 };
  },
  fallen() {
    return { bodyX: -1.45, bodyY: -0.72, shLZ: -1.3, shRZ: 1.3, legLX: -0.2, legRX: 0.1, headX: -0.2 };
  },
  stretch(t, p) {
    // Acrobat/strongman: arms wide, feet apart
    return { shLZ: -1.5 - p.intensity * 1.0, shRZ: 1.5 + p.intensity * 1.0, legLZ: -0.25, legRZ: 0.25, spineX: -0.08, headX: -0.2 };
  },
  lift(t, p) {
    // Holding something above the head
    return { shLZ: -2.9, shRZ: 2.9, elLX: -0.4, elRX: -0.4, legLZ: -0.3, legRZ: 0.3, bodyY: -0.08 + s(t * 20) * 0.01 * p.intensity };
  },
  flip(t, p) {
    const k = p.flip; // 0..1 through a flip
    return { bodyY: s(k * Math.PI) * 0.8, bodyX: -k * TAU, legLX: -1.2 * s(k * Math.PI), legRX: -1.2 * s(k * Math.PI), shLZ: -2.8, shRZ: 2.8 };
  },
  sit(t, p) {
    return { bodyY: -0.42 * p.scale, legLX: -1.5, legRX: -1.5, spineX: -0.05 + s(t * 1.2 + p.seed) * 0.01, shLX: -0.8, shRX: -0.8, elLX: -0.6, elRX: -0.6 };
  },
  sitLean(t, p) {
    return { ...POSES.sit(t, p), spineX: 0.25, shLX: -1.1, shRX: -1.1, elLX: -1.2, elRX: -1.2, headX: -0.15 };
  },
  sitArms(t, p) {
    return { ...POSES.sit(t, p), ...POSES.armsCrossed(), spineX: -0.12 };
  },
  sitClap(t, p) {
    return { ...POSES.sit(t, p), ...POSES.clap(t, p) };
  },
  sitCheer(t, p) {
    return { ...POSES.sit(t, p), ...POSES.cheer(t, p), bodyY: -0.42 * p.scale };
  },
  sitFacepalm(t, p) {
    return { ...POSES.sit(t, p), ...POSES.facepalm(t, p) };
  },
  sitEars(t, p) {
    return { ...POSES.sit(t, p), ...POSES.coverEars(), bodyY: -0.42 * p.scale };
  },
  sitTalk(t, p) {
    return { ...POSES.sit(t, p), ...POSES.talk(t, p), bodyY: -0.42 * p.scale, legLX: -1.5, legRX: -1.5 };
  },
  sitCry(t, p) {
    return { ...POSES.sit(t, p), ...POSES.cry(), bodyY: -0.42 * p.scale };
  },
  sitThumbsUp(t, p) {
    return { ...POSES.sit(t, p), ...POSES.thumbsUp() };
  },
  sitThumbsDown(t, p) {
    return { ...POSES.sit(t, p), ...POSES.thumbsDown() };
  },
  drum(t, p) {
    const b = p.beatPhase * TAU * 2;
    return { ...POSES.sit(t, p), shLX: -0.7 - Math.max(0, s(b)) * 0.5, shRX: -0.7 - Math.max(0, -s(b)) * 0.5, elLX: -0.9, elRX: -0.9, headX: s(b) * 0.1, legLX: -1.5, legRX: -1.5 };
  },
  guitar(t, p) {
    const b = p.beatPhase * TAU * 2;
    return { shRX: -0.35 + s(b) * 0.2, shRZ: -0.25, elRX: -1.3, shLX: -0.9, shLZ: -0.6, elLX: -0.6, headX: 0.1 + s(p.beatPhase * TAU) * 0.08, bodyY: Math.abs(s(p.beatPhase * TAU)) * 0.02, legLZ: -0.12, legRZ: 0.12 };
  },
  keys(t, p) {
    const b = p.beatPhase * TAU;
    return { shLX: -0.8, shRX: -0.8, shLZ: 0.25, shRZ: -0.25, elLX: -0.7 + s(b * 2) * 0.1, elRX: -0.7 - s(b * 2) * 0.1, headX: 0.15 + s(b) * 0.06, spineX: 0.1 };
  },
  choir(t, p) {
    return { shLX: -0.55, shRX: -0.55, shLZ: 0.35, shRZ: -0.35, elLX: -1.2, elRX: -1.2, spineZ: s(p.beatPhase * Math.PI + p.seed) * 0.06, headX: -0.1 - p.intensity * 0.15, headZ: s(t * 0.8 + p.seed) * 0.06 };
  },
  handstand(t, p) {
    return { bodyX: Math.PI, bodyY: 0.3, shLZ: -3.0, shRZ: 3.0, elLX: -0.05, elRX: -0.05, legLZ: -0.2 - s(t * 3) * 0.05, legRZ: 0.2 + s(t * 3) * 0.05 };
  },
  lie() {
    return { bodyX: -1.5, bodyY: -0.4, shLZ: -0.15, shRZ: 0.15, headX: -0.2 };
  },
  standOvation(t, p) {
    return { ...POSES.clap(t, p), bodyY: 0 };
  },
};

const FACES = {
  neutral: { brow: 0, browY: 0, mouth: 'line' },
  happy: { brow: -0.25, browY: 0.01, mouth: 'smile' },
  elated: { brow: -0.3, browY: 0.025, mouth: 'open' },
  sad: { brow: 0.4, browY: 0, mouth: 'frown' },
  nervous: { brow: 0.3, browY: 0.01, mouth: 'line' },
  shock: { brow: 0, browY: 0.035, mouth: 'open' },
  angry: { brow: -0.45, browY: -0.01, mouth: 'frown' },
  cocky: { brow: -0.2, browY: 0.0, mouth: 'smile' },
  wince: { brow: 0.45, browY: -0.01, mouth: 'frown' },
};

function capsule(r, len, material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), material);
  m.castShadow = true;
  return m;
}
function sphere(r, material, ws = 16, hs = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material);
  m.castShadow = true;
  return m;
}

export class Character {
  constructor(look) {
    this.look = look;
    this.seed = rng.range(0, 100);
    this.scale = look.height;
    this.pose = 'idle';
    this.emotion = 'neutral';
    this.intensity = 0;
    this.beat = 0;
    this.beatPhase = 0;
    this.move = 0;
    this.sloppy = 0;
    this.jugglePhase = 0;
    this.flip = 0;
    this.walkPhase = 0;
    this.talkLevel = 0; // 0..1, mouth openness driver
    this.talking = false;
    this.speed = 1.35;
    this.target = null;
    this.faceYaw = 0;
    this.spin = 0;
    this.lookTarget = null;
    this.blink = 0;
    this.nextBlink = rng.range(1, 4);
    this.j = { ...REST };
    this.overrides = null;
    this.spinTime = 0;
    this.build();
  }

  build() {
    const L = this.look;
    const skin = mat(L.skin, { roughness: 0.65 });
    const top = mat(L.top, { roughness: 0.75 });
    const bottom = mat(L.bottom, { roughness: 0.8 });
    const shoe = mat(L.shoes, { roughness: 0.5 });
    const hair = mat(L.hair, { roughness: 0.9 });
    const dark = mat(0x151018, { roughness: 0.4 });
    const white = mat(0xffffff, { roughness: 0.3 });

    this.root = new THREE.Group();
    this.root.scale.setScalar(this.scale);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 0.86;
    this.body.add(this.hips);
    const w = L.build;

    // Legs: a thigh and a shin on one pivot, so shorts and skirts can show skin below the knee.
    const legMaterials = {
      trousers: [bottom, bottom],
      shorts: [bottom, skin],
      skirt: [skin, skin],
      dress: [skin, skin],
    }[L.bottomStyle || 'trousers'];
    this.legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.1 * Math.min(w, 1.2), 0, 0);
      const thigh = capsule(0.075 * Math.min(w, 1.25), 0.3, legMaterials[0]);
      thigh.position.y = -0.2;
      const shin = capsule(0.065, 0.32, legMaterials[1]);
      shin.position.y = -0.55;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.22), shoe);
      foot.position.set(0, -0.83, 0.04);
      foot.castShadow = true;
      pivot.add(thigh, shin, foot);
      this.hips.add(pivot);
      return pivot;
    });

    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    const torso = capsule(0.19, 0.34, top);
    torso.scale.set(w, 1, 0.8 + (w - 1) * 0.6);
    torso.position.y = 0.27;
    this.spine.add(torso);
    this.torso = torso;
    if (L.bottomStyle === 'skirt' || L.bottomStyle === 'dress') {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * w, 0.32 * w, 0.42, 16, 1, true), L.bottomStyle === 'dress' ? top : bottom);
      skirt.material.side = THREE.DoubleSide;
      skirt.position.y = -0.14;
      skirt.castShadow = true;
      this.hips.add(skirt);
    } else {
      const pelvis = capsule(0.16 * w, 0.06, bottom);
      pelvis.rotation.z = Math.PI / 2;
      pelvis.scale.set(1, 1, 0.8);
      pelvis.position.y = 0.02;
      this.hips.add(pelvis);
    }
    if (L.bowtie) {
      const bt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), mat(L.bowtie));
      bt.position.set(0, 0.5, 0.15);
      this.spine.add(bt);
    }

    // Arms
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (0.2 * w + 0.04), 0.5, 0);
      const upper = capsule(0.058, 0.2, top);
      upper.position.y = -0.14;
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      const fore = capsule(0.05, 0.18, L.sleeves === 'short' ? skin : top);
      fore.position.y = -0.12;
      const hand = sphere(0.055, skin, 10, 8);
      hand.position.y = -0.27;
      elbow.add(fore, hand);
      shoulder.add(upper, elbow);
      this.spine.add(shoulder);
      return { shoulder, elbow, hand };
    });
    this.handR = this.arms[1].hand;
    this.handL = this.arms[0].hand;

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.spine.add(this.head);
    const neck = capsule(0.055, 0.06, skin);
    neck.position.y = -0.07;
    this.head.add(neck);
    const R = 0.17;
    this.headR = R;
    const skull = sphere(R, skin, 24, 18);
    skull.position.y = 0.12;
    this.head.add(skull);
    this.faceGroup = new THREE.Group();
    this.faceGroup.position.y = 0.12;
    this.head.add(this.faceGroup);
    const nose = sphere(0.028, skin, 8, 6);
    nose.position.set(0, -0.02, R * 0.98);
    this.faceGroup.add(nose);
    this.eyes = [-1, 1].map((side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.062, 0.03, R * 0.86);
      const ball = sphere(0.036, white, 12, 10);
      ball.scale.z = 0.6;
      const pupil = sphere(0.021, dark, 10, 8);
      pupil.position.z = 0.022;
      g.add(ball, pupil);
      this.faceGroup.add(g);
      return g;
    });
    this.brows = [-1, 1].map((side) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.013, 0.012), mat(L.hairStyle === 'bald' ? 0x6b5a4a : L.hair));
      b.position.set(side * 0.062, 0.085, R * 0.9);
      this.faceGroup.add(b);
      return b;
    });
    const lip = mat(0x5a1e24, { roughness: 0.5 });
    this.mouths = {};
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), lip);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.055, R * 0.93);
    const frown = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 14, Math.PI), lip);
    frown.position.set(0, -0.09, R * 0.93);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), lip);
    line.position.set(0, -0.075, R * 0.95);
    const open = sphere(0.036, mat(0x3a0d14), 12, 10);
    open.scale.set(1, 0.4, 0.5);
    open.position.set(0, -0.075, R * 0.9);
    Object.assign(this.mouths, { smile, frown, line, open });
    for (const m of Object.values(this.mouths)) {
      m.castShadow = false;
      this.faceGroup.add(m);
    }
    this.buildHair(hair, R);
    if (L.glasses) {
      const frame = mat(0x111111, { metalness: 0.5, roughness: 0.3 });
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 6, 16), frame);
        ring.position.set(side * 0.062, 0.03, R * 0.98);
        this.faceGroup.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), frame);
      bridge.position.set(0, 0.035, R * 1.0);
      this.faceGroup.add(bridge);
    }
    if (L.beard === 'beard') {
      const beard = sphere(0.12, hair, 14, 10);
      beard.scale.set(1.05, 0.9, 0.7);
      beard.position.set(0, -0.1, R * 0.55);
      this.faceGroup.add(beard);
      this.mouths.open.position.z = R * 1.02;
    } else if (L.beard === 'mustache') {
      const m = capsule(0.018, 0.07, hair);
      m.rotation.z = Math.PI / 2;
      m.position.set(0, -0.045, R * 0.97);
      this.faceGroup.add(m);
    }
    if (L.hat) this.buildHat(L.hat, mat(L.hatColor || 0x222222), R);

    this.props = {};
    this.root.traverse((o) => {
      if (o.isMesh) o.userData.owner = this;
    });
  }

  buildHair(hair, R) {
    const style = this.look.hairStyle;
    const add = (m, x, y, z) => {
      m.position.set(x, y, z);
      this.head.add(m);
      return m;
    };
    const cap = (scale = 1.06, theta = 0.42) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R * scale, 20, 12, 0, TAU, 0, Math.PI * theta), hair);
      m.castShadow = true;
      m.rotation.x = -0.25;
      return add(m, 0, 0.12, -0.01);
    };
    if (style === 'bald') {
      for (const side of [-1, 1]) {
        const tuft = sphere(0.06, hair, 8, 6);
        tuft.scale.set(0.6, 1, 1.2);
        add(tuft, side * R * 0.95, 0.1, -0.03);
      }
      return;
    }
    if (style === 'afro') {
      const a = sphere(R * 1.5, hair, 16, 12);
      a.scale.set(1, 0.9, 0.95);
      add(a, 0, 0.21, -0.05);
      return;
    }
    cap(style === 'curly' ? 1.1 : 1.07, style === 'short' || style === 'spiky' || style === 'mohawk' ? 0.4 : 0.5);
    if (style === 'bob' || style === 'long' || style === 'ponytail' || style === 'bun' || style === 'curly') {
      const back = sphere(R * 1.07, hair, 16, 12);
      back.scale.set(1, style === 'bob' ? 1.05 : 1.0, 0.9);
      add(back, 0, 0.1, -0.05);
    }
    if (style === 'long') {
      const fall = new THREE.Mesh(new THREE.BoxGeometry(R * 2.1, 0.36, 0.12), hair);
      fall.castShadow = true;
      add(fall, 0, -0.06, -0.1);
    }
    if (style === 'ponytail') {
      const p = capsule(0.05, 0.22, hair);
      p.rotation.x = 0.5;
      add(p, 0, 0.1, -0.24);
    }
    if (style === 'bun') add(sphere(0.08, hair, 10, 8), 0, 0.3, -0.08);
    if (style === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), hair);
        const a = (i / 7) * TAU;
        cone.position.set(Math.cos(a) * 0.08, 0.3, Math.sin(a) * 0.08 - 0.02);
        cone.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        this.head.add(cone);
      }
    }
    if (style === 'mohawk') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), hair);
      add(m, 0, 0.32, -0.02);
    }
    if (style === 'curly') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        add(sphere(0.055, hair, 8, 6), Math.cos(a) * 0.15, 0.2 + Math.sin(i * 1.7) * 0.04, Math.sin(a) * 0.12 - 0.04);
      }
    }
  }

  buildHat(kind, material, R) {
    const g = new THREE.Group();
    g.position.y = 0.12 + R * 0.75;
    if (kind === 'tophat') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 18), material);
      crown.position.y = 0.14;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), material);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.05, 18), mat(0xb3202a));
      band.position.y = 0.04;
      g.add(crown, brim, band);
    } else if (kind === 'cap') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 16, 10, 0, TAU, 0, Math.PI / 2), material);
      dome.position.y = -0.08;
      const peak = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.14), material);
      peak.position.set(0, -0.06, 0.2);
      g.add(dome, peak);
    } else if (kind === 'beanie') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 16, 10, 0, TAU, 0, Math.PI / 2), material);
      dome.position.y = -0.09;
      dome.scale.y = 1.2;
      const pom = sphere(0.04, mat(0xffffff), 8, 6);
      pom.position.y = 0.13;
      g.add(dome, pom);
    } else if (kind === 'bowler') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, TAU, 0, Math.PI / 2), material);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 18), material);
      g.add(dome, brim);
    } else if (kind === 'crown') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.1, 10, 1, true), mat(0xffc53d, { metalness: 0.9, roughness: 0.2 }));
      band.material.side = THREE.DoubleSide;
      band.position.y = 0.02;
      g.add(band);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.head.add(g);
    this.hat = g;
  }

  // Puts a mesh in a hand ('R' or 'L'), on the torso ('chest'), or at the head.
  attach(name, object, where = 'R') {
    this.detach(name);
    const parent = where === 'R' ? this.arms[1].elbow : where === 'L' ? this.arms[0].elbow : where === 'chest' ? this.spine : this.head;
    if (where === 'R' || where === 'L') object.position.y += -0.28;
    parent.add(object);
    this.props[name] = object;
    return object;
  }
  detach(name) {
    const o = this.props[name];
    if (o && o.parent) o.parent.remove(o);
    delete this.props[name];
  }

  get position() {
    return this.root.position;
  }
  place(v) {
    this.root.position.copy(v);
    this.target = null;
    return this;
  }
  // Walks to a point; `arrived` becomes true when there. The caller waits with clock.waitFor(() => c.arrived).
  walkTo(v, speed = 1.35) {
    this.target = v.clone();
    this.speed = speed;
    this.arrived = false;
    return this;
  }
  get arrived() {
    return !this.target;
  }
  set arrived(v) {
    if (v) this.target = null;
  }
  face(yaw) {
    this.faceYaw = yaw;
  }
  faceTowards(v) {
    const d = new THREE.Vector3().subVectors(v, this.root.position);
    this.faceYaw = Math.atan2(d.x, d.z);
  }
  set(pose, emotion) {
    if (pose) this.pose = pose;
    if (emotion) this.emotion = emotion;
    return this;
  }

  update(dt, t) {
    // Movement
    let pose = this.pose;
    if (this.target) {
      const d = new THREE.Vector3().subVectors(this.target, this.root.position);
      d.y = 0;
      const dist = d.length();
      const step = this.speed * dt;
      if (dist <= step || dist < 0.01) {
        this.root.position.x = this.target.x;
        this.root.position.z = this.target.z;
        this.target = null;
      } else {
        d.multiplyScalar(step / dist);
        this.root.position.add(d);
        this.walkPhase += (step / (0.55 * this.scale)) * Math.PI * 0.5;
        const yaw = Math.atan2(d.x, d.z);
        this.root.rotation.y = this.angleDamp(this.root.rotation.y, yaw, 10, dt);
        pose = 'walk';
      }
    }
    if (this.spinTime > 0) {
      this.spinTime -= dt;
      this.root.rotation.y += dt * 11;
    } else if (!this.target) this.root.rotation.y = this.angleDamp(this.root.rotation.y, this.faceYaw + this.spin, 6, dt);

    const fn = POSES[pose] || POSES.idle;
    const target = { ...REST, ...fn(t, this), ...this.overrides };
    const rate = pose === 'dance' || pose === 'flip' ? 22 : pose === 'walk' ? 16 : 9;
    for (const k in target) this.j[k] = damp(this.j[k], target[k], rate, dt);
    const j = this.j;
    // Tumbles pivot at the hips, not the feet.
    this.body.position.y = j.bodyY + HIP * (1 - Math.cos(j.bodyX));
    this.body.position.z = -HIP * Math.sin(j.bodyX);
    this.body.rotation.x = j.bodyX;
    this.spine.rotation.set(j.spineX, j.spineY, j.spineZ);
    this.legs[0].rotation.set(j.legLX, 0, j.legLZ);
    this.legs[1].rotation.set(j.legRX, 0, j.legRZ);
    this.arms[0].shoulder.rotation.set(j.shLX, 0, j.shLZ);
    this.arms[1].shoulder.rotation.set(j.shRX, 0, j.shRZ);
    this.arms[0].elbow.rotation.x = j.elLX;
    this.arms[1].elbow.rotation.x = j.elRX;
    let headY = j.headY;
    if (this.lookTarget && pose !== 'walk') {
      const wp = new THREE.Vector3();
      this.head.getWorldPosition(wp);
      const d = new THREE.Vector3().subVectors(this.lookTarget, wp);
      const yaw = Math.atan2(d.x, d.z) - this.root.rotation.y;
      headY += clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -0.9, 0.9);
    }
    this.head.rotation.set(j.headX, headY, j.headZ);

    // Face
    const f = FACES[this.emotion] || FACES.neutral;
    this.brows[0].rotation.z = damp(this.brows[0].rotation.z, -f.brow, 10, dt);
    this.brows[1].rotation.z = damp(this.brows[1].rotation.z, f.brow, 10, dt);
    for (const b of this.brows) b.position.y = damp(b.position.y, 0.085 + f.browY, 10, dt);
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.blink = 1;
      this.nextBlink = rng.range(2, 5);
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const eyeScale = 1 - Math.sin(this.blink * Math.PI) * 0.9;
    for (const e of this.eyes) e.scale.y = this.emotion === 'shock' ? 1.25 : eyeScale;
    const singing = pose === 'sing';
    const speaking = this.talking || singing;
    let mouth = f.mouth;
    if (speaking) {
      mouth = 'open';
      const target = singing ? 0.35 + this.intensity * 0.6 + this.beat * 0.2 : 0.2 + Math.abs(Math.sin(t * 17 + Math.sin(t * 5.3) * 2)) * 0.8;
      this.talkLevel = damp(this.talkLevel, target, 20, dt);
    } else this.talkLevel = damp(this.talkLevel, mouth === 'open' ? 0.8 : 0, 12, dt);
    for (const [k, m] of Object.entries(this.mouths)) m.visible = k === mouth;
    this.mouths.open.scale.y = 0.15 + this.talkLevel * 0.75;
  }

  angleDamp(a, b, rate, dt) {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + diff * (1 - Math.exp(-rate * dt));
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// A dog for the dog acts. Same update() contract as Character, with its own poses.
export class Dog {
  constructor(color = 0xc28a4b, spots = 0xffffff) {
    this.root = new THREE.Group();
    this.seed = rng.range(0, 100);
    const fur = mat(color, { roughness: 0.9 });
    const fur2 = mat(spots, { roughness: 0.9 });
    const dark = mat(0x111111, { roughness: 0.4 });
    this.body = new THREE.Group();
    this.body.position.y = 0.42;
    this.root.add(this.body);
    const torso = capsule(0.16, 0.36, fur);
    torso.rotation.x = Math.PI / 2;
    this.body.add(torso);
    const belly = sphere(0.14, fur2, 12, 8);
    belly.scale.set(1, 0.8, 1.6);
    belly.position.y = -0.05;
    this.body.add(belly);
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.14, 0.3);
    this.body.add(this.headG);
    const head = sphere(0.14, fur, 16, 12);
    this.headG.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.14), fur2);
    snout.position.set(0, -0.04, 0.14);
    const nose = sphere(0.03, dark, 8, 6);
    nose.position.set(0, -0.01, 0.22);
    this.headG.add(snout, nose);
    for (const side of [-1, 1]) {
      const eye = sphere(0.022, dark, 8, 6);
      eye.position.set(side * 0.06, 0.04, 0.12);
      const ear = sphere(0.07, fur2, 8, 6);
      ear.scale.set(0.5, 1.2, 0.8);
      ear.position.set(side * 0.12, 0.02, -0.02);
      ear.rotation.z = side * 0.3;
      this.headG.add(eye, ear);
    }
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.07), mat(0xff6b8a));
    this.tongue.position.set(0, -0.09, 0.18);
    this.tongue.rotation.x = 0.4;
    this.headG.add(this.tongue);
    this.legs = [];
    for (const [x, z] of [
      [-0.09, 0.18],
      [0.09, 0.18],
      [-0.09, -0.18],
      [0.09, -0.18],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.08, z);
      const leg = capsule(0.045, 0.22, fur);
      leg.position.y = -0.17;
      pivot.add(leg);
      this.body.add(pivot);
      this.legs.push(pivot);
    }
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.08, -0.3);
    const tail = capsule(0.03, 0.18, fur);
    tail.position.y = 0.1;
    this.tail.add(tail);
    this.tail.rotation.x = -0.6;
    this.body.add(this.tail);
    this.pose = 'idle';
    this.target = null;
    this.speed = 2.5;
    this.faceYaw = 0;
    this.spin = 0;
    this.phase = 0;
    this.hop = 0;
    this.j = { y: 0.42, rx: 0, rz: 0, head: 0, legs: 0, sit: 0 };
  }
  get position() {
    return this.root.position;
  }
  place(v) {
    this.root.position.copy(v);
    return this;
  }
  walkTo(v, speed = 2.5) {
    this.target = v.clone();
    this.speed = speed;
    return this;
  }
  get arrived() {
    return !this.target;
  }
  set(pose) {
    this.pose = pose;
    return this;
  }
  face(yaw) {
    this.faceYaw = yaw;
  }
  update(dt, t) {
    let pose = this.pose;
    if (this.target) {
      const d = new THREE.Vector3().subVectors(this.target, this.root.position);
      d.y = 0;
      const dist = d.length();
      const step = this.speed * dt;
      if (dist <= step) {
        this.root.position.x = this.target.x;
        this.root.position.z = this.target.z;
        this.target = null;
      } else {
        d.multiplyScalar(step / dist);
        this.root.position.add(d);
        this.root.rotation.y = Math.atan2(d.x, d.z);
        pose = 'run';
        this.phase += step * 9;
      }
    }
    if (!this.target && pose !== 'spin') this.root.rotation.y += Math.atan2(Math.sin(this.faceYaw - this.root.rotation.y), Math.cos(this.faceYaw - this.root.rotation.y)) * (1 - Math.exp(-6 * dt));
    if (pose === 'spin') this.root.rotation.y += dt * 9;
    const tg = { y: 0.42, rx: 0, rz: 0, head: 0, legs: 0, sit: 0 };
    if (pose === 'run') tg.legs = 1;
    if (pose === 'sit') tg.sit = 1;
    if (pose === 'beg') {
      tg.sit = 1;
      tg.rx = -0.9;
      tg.y = 0.5;
    }
    if (pose === 'dead') {
      tg.rz = Math.PI * 0.95;
      tg.y = 0.25;
    }
    if (pose === 'jump') tg.y = 0.42 + this.hop;
    if (pose === 'wander') tg.head = Math.sin(t * 3) * 0.5;
    for (const k in tg) this.j[k] = damp(this.j[k], tg[k], 10, dt);
    this.body.position.y = this.j.y - this.j.sit * 0.12;
    this.body.rotation.x = this.j.rx - this.j.sit * 0.45;
    this.body.rotation.z = this.j.rz;
    this.headG.rotation.y = this.j.head;
    this.headG.rotation.x = this.j.sit * 0.45;
    const swing = Math.sin(this.phase) * 0.7 * this.j.legs;
    this.legs[0].rotation.x = swing;
    this.legs[3].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.legs[2].rotation.x = -swing;
    this.legs[2].rotation.x += this.j.sit * -1.2;
    this.legs[3].rotation.x += this.j.sit * -1.2;
    this.tail.rotation.z = Math.sin(t * 16) * 0.6;
  }
  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// Props held or used during acts.
export const Props = {
  mic() {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.18, 10), mat(0x222222, { metalness: 0.6, roughness: 0.3 }));
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat(0x9a9aa4, { metalness: 0.8, roughness: 0.4 }));
    headM.position.y = 0.11;
    g.add(handle, headM);
    g.rotation.x = -1.3;
    g.position.z = 0.04;
    return g;
  },
  wand() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.32, 8), mat(0x111111));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), mat(0xffffff));
    tip.position.y = 0.16;
    stick.position.y = 0.0;
    g.add(stick, tip);
    g.rotation.x = -1.4;
    g.position.z = 0.12;
    return g;
  },
  guitar(color = 0xb3202a) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 20), mat(color, { roughness: 0.3, metalness: 0.2 }));
    body.rotation.x = Math.PI / 2;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.03), mat(0x5a3a1e));
    neck.position.set(0, 0.36, 0);
    const headstock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.03), mat(0x222222));
    headstock.position.set(0, 0.66, 0);
    g.add(body, neck, headstock);
    g.rotation.z = 1.1;
    g.position.set(0.02, 0.22, 0.2);
    return g;
  },
  ball(color) {
    return sphere(0.06, mat(color, { roughness: 0.35 }), 12, 10);
  },
  hoop() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 32), mat(0xff4fb6, { roughness: 0.4 }));
    ring.position.y = 0.75;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat(0xdddddd, { metalness: 0.8 }));
    stand.position.y = 0.18;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 12), mat(0x333333));
    g.add(ring, stand, base);
    return g;
  },
  drumKit() {
    const g = new THREE.Group();
    const shell = mat(0x3a86ff, { metalness: 0.4, roughness: 0.3 });
    const skin = mat(0xf2f2f2, { roughness: 0.6 });
    const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.4, 20), shell);
    kick.rotation.x = Math.PI / 2;
    kick.position.set(0, 0.32, 0.25);
    const kickFace = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), mat(0x2a2440, { roughness: 0.6 }));
    kickFace.position.set(0, 0.32, 0.46);
    g.add(kick, kickFace);
    for (const [x, y, z, r] of [
      [-0.45, 0.6, 0.35, 0.16],
      [0.4, 0.55, 0.3, 0.18],
      [-0.15, 0.78, 0.35, 0.12],
    ]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 16), shell);
      d.position.set(x, y, z);
      g.add(d);
    }
    for (const [x, y] of [
      [-0.65, 1.1],
      [0.6, 1.15],
    ]) {
      const cym = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 20), mat(0xe0b640, { metalness: 0.9, roughness: 0.25 }));
      cym.position.set(x, y, 0.35);
      cym.rotation.x = 0.3;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y, 6), mat(0xcccccc, { metalness: 0.8 }));
      pole.position.set(x, y / 2, 0.35);
      g.add(cym, pole);
    }
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), mat(0x222222));
    stool.position.set(0, 0.25, -0.35);
    g.add(stool);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  },
  keyboard() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.32), mat(0x1a1a1a, { roughness: 0.3 }));
    body.position.y = 0.9;
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 0.14), mat(0xf5f5f5));
    keys.position.set(0, 0.95, 0.07);
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), mat(0x555555, { metalness: 0.7 }));
    legA.position.set(-0.35, 0.45, 0);
    legA.rotation.z = 0.35;
    const legB = legA.clone();
    legB.rotation.z = -0.35;
    legB.position.x = 0.35;
    g.add(body, keys, legA, legB);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  },
  cabinet() {
    // Magician's disappearing cabinet
    const g = new THREE.Group();
    const m = mat(0x2a0f4a, { roughness: 0.5 });
    const trim = mat(0xffc53d, { metalness: 0.8, roughness: 0.3 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), m);
    back.position.set(0, 1.1, -0.45);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.9), m);
    l.position.set(-0.5, 1.1, 0);
    const r = l.clone();
    r.position.x = 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.0), trim);
    top.position.y = 2.25;
    const door = new THREE.Group();
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.1, 0.04), m);
    doorPanel.position.x = 0.49;
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.18, 5), trim);
    star.position.set(0.49, 1.2, 0.03);
    door.add(doorPanel, star);
    door.position.set(-0.49, 1.1 - 1.05 + 1.05, 0.45);
    doorPanel.position.y = 0;
    star.position.y = 0.2;
    g.add(back, l, r, top, door);
    g.userData.door = door;
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  },
};
