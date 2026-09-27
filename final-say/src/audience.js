// The studio audience behind the judges' desk: a few hundred instanced people who sit, clap, laugh, boo, gasp,
// stand for ovations and get their phones out when bored. It also owns the crowd's mood, which the audio follows.
import * as THREE from 'three';
import { mat, BODY_FONT, DISPLAY_FONT } from './studio.js';
import { SKIN, HAIR, CLOTH } from './character.js';
import { clamp, damp, rng, TAU } from './util.js';

const ROWS = 10;
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const SCRATCH = Array.from({ length: 5 }, () => new THREE.Matrix4());
const SIGN_TEXTS = ['WE ♥ U', '10/10', 'YES!', 'LEGEND', 'GO ON!', 'BRAVO', 'MARRY ME', 'HI MUM'];

export class Audience {
  constructor(scene, audio, { density = 1 } = {}) {
    this.scene = scene;
    this.audio = audio;
    this.mood = 0; // -1 hostile … +1 adoring
    this.targetMood = 0.1;
    this.engagement = 0.5; // 0 bored … 1 on the edge of their seats
    this.targetEngagement = 0.5;
    this.pulses = { clap: 0, cheer: 0, laugh: 0, gasp: 0, boo: 0, ears: 0, chant: 0, aww: 0, ooh: 0 };
    this.ovation = 0;
    this.chantKind = null;
    this.build(density);
  }

  build(density) {
    const group = new THREE.Group();
    this.group = group;
    this.scene.add(group);
    const seats = [];
    for (let r = 0; r < ROWS; r++) {
      const z = 3.9 + r * 1.0;
      const y = r * 0.45;
      const tier = new THREE.Mesh(new THREE.BoxGeometry(19, y + 0.02, 1.0), mat(0x17132a, { roughness: 0.9 }));
      tier.position.set(0, (y + 0.02) / 2, z);
      tier.receiveShadow = true;
      group.add(tier);
      const step = new THREE.Mesh(new THREE.BoxGeometry(19, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: 0x3a2a70, toneMapped: false }));
      step.position.set(0, y + 0.02, z - 0.5);
      group.add(step);
      for (let x = -8.6; x <= 8.61; x += 0.66) {
        if (Math.abs(Math.abs(x) - 3.3) < 0.3) continue; // aisles
        seats.push({ x: x + (r % 2) * 0.1, y, z, row: r });
      }
    }
    const seatGeo = new THREE.BoxGeometry(0.56, 0.42, 0.5);
    seatGeo.translate(0, 0.21, 0);
    const backGeo = new THREE.BoxGeometry(0.56, 0.55, 0.07);
    backGeo.translate(0, 0.62, 0.23);
    const seatMat = mat(0x5a1030, { roughness: 0.8 });
    const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, seats.length);
    const backMesh = new THREE.InstancedMesh(backGeo, seatMat, seats.length);
    const m = new THREE.Matrix4();
    seats.forEach((s, i) => {
      m.makeTranslation(s.x, s.y, s.z);
      seatMesh.setMatrixAt(i, m);
      backMesh.setMatrixAt(i, m);
    });
    group.add(seatMesh, backMesh);

    // People
    const occupied = seats.filter(() => rng.chance(0.9 * density));
    this.people = occupied.map((s) => ({
      x: s.x,
      y: s.y,
      z: s.z,
      bias: rng.gauss() * 0.22,
      excite: rng.range(0.6, 1.4),
      lag: rng.range(0, 0.5),
      phase: rng.range(0, TAU),
      build: rng.range(0.85, 1.3),
      h: rng.range(0.9, 1.08),
      stand: 0,
      armL: new THREE.Vector2(),
      armR: new THREE.Vector2(),
      lean: 0,
      headX: 0,
      headZ: 0,
      phone: 0,
      state: 'sit',
      until: 0,
    }));
    const n = this.people.length;
    this.count = n;
    const torsoGeo = new THREE.CapsuleGeometry(0.19, 0.3, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const hairGeo = new THREE.SphereGeometry(0.17, 12, 8, 0, TAU, 0, Math.PI * 0.5);
    const armGeo = new THREE.CapsuleGeometry(0.055, 0.42, 3, 6);
    armGeo.translate(0, -0.26, 0);
    const eyeGeo = new THREE.SphereGeometry(0.03, 6, 5);
    const phoneGeo = new THREE.PlaneGeometry(0.08, 0.14);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    this.torso = new THREE.InstancedMesh(torsoGeo, white, n);
    this.head = new THREE.InstancedMesh(headGeo, white.clone(), n);
    this.hair = new THREE.InstancedMesh(hairGeo, white.clone(), n);
    this.armL = new THREE.InstancedMesh(armGeo, white.clone(), n);
    this.armR = new THREE.InstancedMesh(armGeo, this.armL.material, n);
    this.eyes = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0x120c14 }), n * 2);
    this.phones = new THREE.InstancedMesh(phoneGeo, new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false, side: THREE.DoubleSide }), n);
    const color = new THREE.Color();
    this.people.forEach((p, i) => {
      const top = rng.pick(CLOTH);
      const skin = rng.pick(SKIN);
      this.torso.setColorAt(i, color.set(top));
      this.armL.setColorAt(i, color.set(top));
      this.armR.setColorAt(i, color.set(top));
      this.head.setColorAt(i, color.set(skin));
      this.hair.setColorAt(i, color.set(rng.chance(0.1) ? skin : rng.pick(HAIR)));
    });
    for (const im of [this.torso, this.head, this.hair, this.armL, this.armR, this.eyes, this.phones]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      group.add(im);
    }

    // Signs held up by a few fans
    this.signs = [];
    const fans = rng.shuffle(this.people.filter((p) => p.z < 9)).slice(0, SIGN_TEXTS.length);
    fans.forEach((p, i) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 160;
      const g = c.getContext('2d');
      g.fillStyle = i % 2 ? '#fff4dc' : '#ffc53d';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#1b1530';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 64px ${DISPLAY_FONT}`;
      g.fillText(SIGN_TEXTS[i], 128, 84);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.44), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
      sign.visible = false;
      group.add(sign);
      p.sign = sign;
      this.signs.push(sign);
    });

    // House lights over the audience, brighter as the room gets going.
    this.lights = [-5, 5].map((x) => {
      const l = new THREE.PointLight(0xffd9a8, 8, 16, 1.4);
      l.position.set(x, 7, 8);
      group.add(l);
      return l;
    });
    const front = new THREE.SpotLight(0xffe2c0, 20, 26, 0.9, 0.8, 1.2);
    front.position.set(0, 7.5, -2);
    front.target.position.set(0, 2, 8);
    group.add(front, front.target);
    this.frontLight = front;

    // Phone camera flashes
    this.flashes = [];
    const flashTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.scale.setScalar(0.6);
      s.visible = false;
      s.userData.life = 0;
      group.add(s);
      this.flashes.push(s);
    }

    // APPLAUSE sign over the back row, lit by the floor manager.
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1a0508';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ff3d57';
    g.font = `900 92px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('APPLAUSE', 256, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.applauseMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0x333333 });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), this.applauseMat);
    signMesh.position.set(0, 8.2, 14.6);
    signMesh.rotation.y = Math.PI;
    group.add(signMesh);
    this.applauseSign = 0;
  }

  // --- The crowd's feelings --------------------------------------------------------------------------------------

  setMood(mood, engagement) {
    if (mood !== undefined) this.targetMood = clamp(mood, -1, 1);
    if (engagement !== undefined) this.targetEngagement = clamp(engagement);
  }
  nudge(dMood = 0, dEngagement = 0) {
    this.targetMood = clamp(this.targetMood + dMood, -1, 1);
    this.targetEngagement = clamp(this.targetEngagement + dEngagement);
  }
  // A one-off reaction: 'clap', 'cheer', 'laugh', 'gasp', 'boo', 'ears', 'aww', 'ooh'.
  react(kind, strength = 1) {
    strength = clamp(strength, 0, 1.5);
    if (kind in this.pulses) this.pulses[kind] = Math.max(this.pulses[kind], strength);
    const a = this.audio;
    if (!a) return;
    if (kind === 'laugh') a.laugh(strength);
    else if (kind === 'gasp') a.gasp(strength);
    else if (kind === 'cheer') a.cheer(strength);
    else if (kind === 'aww') a.aww(strength);
    else if (kind === 'ooh') a.ooh(strength);
    else if (kind === 'boo') a.booBurst(strength);
  }
  flashApplause(seconds = 2) {
    this.applauseSign = seconds;
  }
  chant(kind) {
    this.chantKind = kind;
    this.pulses.chant = kind ? 1 : 0;
    if (this.audio) this.audio.chant(kind);
  }
  setOvation(v) {
    this.ovation = v;
  }
  // What a judge glancing back would read in the room.
  read() {
    const m = this.mood;
    const e = this.engagement;
    if (this.ovation > 0.5) return { text: 'On their feet', tone: 'great' };
    if (this.pulses.boo > 0.3 || m < -0.55) return { text: 'Hostile', tone: 'bad' };
    if (m < -0.2) return { text: e > 0.5 ? 'Turning on it' : 'Unimpressed', tone: 'bad' };
    if (e < 0.28) return { text: 'Bored — phones out', tone: 'meh' };
    if (m > 0.55) return { text: 'Loving it', tone: 'great' };
    if (m > 0.2) return { text: 'Warming up', tone: 'good' };
    if (e < 0.42) return { text: 'Restless', tone: 'meh' };
    return { text: 'Waiting to be won over', tone: 'meh' };
  }

  // --- Animation ------------------------------------------------------------------------------------------------

  update(dt, t, focus) {
    this.mood = damp(this.mood, this.targetMood, 1.4, dt);
    this.engagement = damp(this.engagement, this.targetEngagement, 1.0, dt);
    for (const k in this.pulses) if (k !== 'chant') this.pulses[k] = Math.max(0, this.pulses[k] - dt * (k === 'clap' ? 0.28 : 0.45));
    const P = this.pulses;
    const ov = this.ovation;
    this.applauseSign = Math.max(0, this.applauseSign - dt);
    this.applauseMat.color.setScalar(this.applauseSign > 0 ? (Math.sin(t * 12) > -0.2 ? 1 : 0.5) : 0.2);

    // Audio mix follows the room.
    if (this.audio) {
      const booLevel = clamp(P.boo + Math.max(0, -this.mood - 0.35) * 1.2 * (0.4 + this.engagement)) * (1 - ov);
      this.audio.setCrowd({
        murmur: 0.12 + (1 - this.engagement) * 0.25 + P.ooh * 0.2,
        applause: clamp(P.clap + ov * 0.9 + this.applauseSign * 0.2),
        roar: clamp(P.cheer * 0.8 + ov * 0.8),
        boo: booLevel,
        facing: focus,
      });
    }

    const light = 3 + this.engagement * 6 + ov * 10 + P.cheer * 8;
    for (const l of this.lights) l.intensity = light;
    this.frontLight.intensity = 8 + focus * 14 + ov * 10;

    const m4 = new THREE.Matrix4();
    const base = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const flip = FLIP;
    const shoulders = SCRATCH[0];
    const headM = SCRATCH[1];
    const armRM = SCRATCH[2];
    const leanM = SCRATCH[3];
    const lift = SCRATCH[4];

    this.people.forEach((p, i) => {
      const pm = this.mood + p.bias;
      const tl = t - p.lag;
      // Decide what this person is doing now.
      const exc = clamp((P.cheer + ov) * p.excite);
      const standTarget = ov > 0.3 && pm > 0.2 ? 1 : exc > 0.9 && pm > 0.4 ? 0.6 : P.chant && pm > 0.1 ? 0.3 : 0;
      p.stand = damp(p.stand, standTarget, 3, dt);
      let aLx = 0.2;
      let aLz = 0.15;
      let aRx = 0.2;
      let aRz = -0.15;
      let lean = -0.05;
      let headX = 0;
      let headZ = Math.sin(tl * 0.5 + p.phase) * 0.05;
      let bounce = 0;
      const clapping = clamp(P.clap * 1.2 + ov) * clamp(0.5 + pm) > 0.35;
      const booing = (P.boo > 0.2 || pm < -0.5) && this.engagement > 0.25 && !clapping;
      const bored = this.engagement + p.bias * 0.5 < 0.3 && !clapping && !booing;
      if (P.gasp > 0.2 && p.excite > 0.8) {
        aLx = aRx = -2.4;
        aLz = 0.5;
        aRz = -0.5;
        lean = -0.2;
      } else if (P.ears > 0.2 && p.excite > 0.7) {
        aLx = aRx = -0.3;
        aLz = 2.8;
        aRz = -2.8;
        headX = 0.2;
      } else if (exc > 0.6 && pm > 0.3 && Math.sin(p.phase * 7) > -0.2) {
        aLx = -2.8 + Math.sin(tl * 9 + p.phase) * 0.25;
        aRx = -2.8 - Math.sin(tl * 9 + p.phase) * 0.25;
        aLz = -0.3;
        aRz = 0.3;
        bounce = Math.max(0, Math.sin(tl * 8 + p.phase)) * 0.12 * exc;
      } else if (P.chant > 0.5 && pm > -0.2) {
        const pump = Math.max(0, Math.sin(t * Math.PI * 2));
        aRx = -1.6 - pump * 1.2;
        aRz = -0.2;
        bounce = pump * 0.05;
      } else if (clapping) {
        const k = Math.sin(tl * 15 + p.phase) * 0.22;
        aLx = aRx = -1.0;
        aLz = 0.55 + k;
        aRz = -0.55 - k;
      } else if (P.laugh > 0.15 && pm > -0.4) {
        lean = -0.2 + Math.sin(tl * 12 + p.phase) * 0.08 * P.laugh;
        aLx = aRx = -0.6;
        aLz = 0.25;
        aRz = -0.25;
        headX = -0.25;
      } else if (booing) {
        aLx = aRx = -1.9;
        aLz = 0.35;
        aRz = -0.35;
        lean = 0.18;
        headZ = Math.sin(tl * 6 + p.phase) * 0.15;
      } else if (bored) {
        lean = 0.25;
        headX = 0.45;
        aLx = aRx = -0.9;
        aLz = 0.3;
        aRz = -0.3;
      } else if (P.aww > 0.2) {
        headZ = 0.25 * Math.sin(p.phase * 3);
        aLx = aRx = -1.2;
        aLz = 0.6;
        aRz = -0.6;
      }
      p.phone = damp(p.phone, bored && Math.sin(p.phase * 11) > 0 ? 1 : 0, 2, dt);
      p.armL.set(damp(p.armL.x, aLx, 8, dt), damp(p.armL.y, aLz, 8, dt));
      p.armR.set(damp(p.armR.x, aRx, 8, dt), damp(p.armR.y, aRz, 8, dt));
      p.lean = damp(p.lean, lean, 6, dt);
      p.headX = damp(p.headX, headX, 6, dt);
      p.headZ = damp(p.headZ, headZ, 6, dt);

      // Torso
      const hip = p.y + 0.45 + p.stand * 0.42 + bounce;
      base.compose(v.set(p.x, hip, p.z), flip, sc.set(1, 1, 1));
      e.set(p.lean, 0, 0);
      q.setFromEuler(e);
      local.compose(v.set(0, 0.3 * p.h, 0), q, sc.set(p.build, p.h, 0.85));
      m4.multiplyMatrices(base, local);
      this.torso.setMatrixAt(i, m4);
      // Frame at the shoulders, leaned with the torso
      shoulders.multiplyMatrices(base, leanM.compose(v.set(0, 0, 0), q, sc.set(1, 1, 1)));
      shoulders.multiply(lift.makeTranslation(0, 0.58 * p.h, 0));
      // Head
      e.set(p.headX, 0, p.headZ);
      q.setFromEuler(e);
      local.compose(v.set(0, 0.24, 0), q, sc.set(1, 1, 1));
      headM.multiplyMatrices(shoulders, local);
      this.head.setMatrixAt(i, headM);
      this.hair.setMatrixAt(i, m4.multiplyMatrices(headM, local.makeTranslation(0, 0.02, -0.01)));
      this.eyes.setMatrixAt(i * 2, m4.multiplyMatrices(headM, local.makeTranslation(-0.06, 0.02, 0.14)));
      this.eyes.setMatrixAt(i * 2 + 1, m4.multiplyMatrices(headM, local.makeTranslation(0.06, 0.02, 0.14)));
      // Arms
      const w = 0.2 * p.build + 0.03;
      e.set(p.armL.x, 0, p.armL.y);
      q.setFromEuler(e);
      local.compose(v.set(-w, -0.02, 0), q, sc.set(1, 1, 1));
      this.armL.setMatrixAt(i, m4.multiplyMatrices(shoulders, local));
      e.set(p.armR.x, 0, p.armR.y);
      q.setFromEuler(e);
      local.compose(v.set(w, -0.02, 0), q, sc.set(1, 1, 1));
      armRM.multiplyMatrices(shoulders, local);
      this.armR.setMatrixAt(i, armRM);
      // Phone in hand when bored
      if (p.phone > 0.05) {
        local.compose(v.set(0, -0.2, 0.32), q.identity(), sc.setScalar(p.phone));
        this.phones.setMatrixAt(i, m4.multiplyMatrices(shoulders, local));
      } else {
        this.phones.setMatrixAt(i, m4.makeScale(0, 0, 0));
      }
      // Sign held over the head when happy
      if (p.sign) {
        const up = pm > 0.3 && this.engagement > 0.45;
        p.sign.visible = up;
        if (up) {
          p.sign.position.set(p.x, hip + 1.25 + Math.sin(t * 4 + p.phase) * 0.05, p.z - 0.05);
          p.sign.rotation.set(0, Math.PI, Math.sin(t * 2 + p.phase) * 0.12);
        }
      }
    });
    for (const im of [this.torso, this.head, this.hair, this.armL, this.armR, this.eyes, this.phones]) im.instanceMatrix.needsUpdate = true;
    if (!this._colored) {
      for (const im of [this.torso, this.head, this.hair, this.armL, this.armR]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this._colored = true;
    }

    // Camera flashes when the room is excited
    const flashRate = clamp(P.cheer + ov + Math.max(0, this.mood - 0.5)) * 6;
    for (const f of this.flashes) {
      if (f.userData.life > 0) {
        f.userData.life -= dt;
        f.material.opacity = clamp(f.userData.life / 0.12);
        f.visible = f.userData.life > 0;
      } else if (rng.chance(flashRate * dt * 0.1)) {
        const p = rng.pick(this.people);
        f.position.set(p.x, p.y + 1.3 + p.stand * 0.4, p.z - 0.3);
        f.userData.life = 0.12;
        f.visible = true;
      }
    }
  }
}
