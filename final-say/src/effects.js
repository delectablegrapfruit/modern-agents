// Particles and one-off visual effects: confetti, smoke puffs, sparkles, music notes, doves.
import * as THREE from 'three';
import { rng, TAU } from './util.js';

function spriteTexture(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function textures() {
  if (TEX.soft) return TEX;
  TEX.soft = spriteTexture((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  TEX.smoke = spriteTexture((g, s) => {
    for (let i = 0; i < 6; i++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.3;
      const y = s / 2 + (Math.random() - 0.5) * s * 0.3;
      const grad = g.createRadialGradient(x, y, 0, x, y, s * 0.35);
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }
  }, 128);
  TEX.note = spriteTexture((g, s) => {
    g.fillStyle = '#fff';
    g.font = `bold ${s * 0.8}px serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♪', s / 2, s / 2);
  });
  TEX.star = spriteTexture((g, s) => {
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.18 : s * 0.48;
      const a = -Math.PI / 2 + (i * TAU) / 10;
      g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    g.fill();
  });
  return TEX;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
    this.confetti = null;
    this.confettiData = [];
    this.buildConfetti(700);
    this.doves = [];
  }

  buildConfetti(n) {
    const geo = new THREE.PlaneGeometry(0.06, 0.1);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.confetti = new THREE.InstancedMesh(geo, m, n);
    this.confetti.frustumCulled = false;
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    const palette = [0xffc53d, 0xff3d57, 0x7c5cff, 0x36d399, 0x4fd6ff, 0xffffff, 0xff4fb6];
    for (let i = 0; i < n; i++) {
      this.confetti.setColorAt(i, c.set(rng.pick(palette)));
      this.confettiData.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
      this.confetti.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    this.scene.add(this.confetti);
    this.gold = false;
  }

  // Confetti from the rig above the stage (and cannons at the sides when big).
  confettiBurst(center = new THREE.Vector3(0, 11, -8), count = 400, gold = false) {
    const data = this.confettiData;
    const c = new THREE.Color();
    let spawned = 0;
    for (let i = 0; i < data.length && spawned < count; i++) {
      const d = data[i];
      if (d.alive) continue;
      d.alive = true;
      d.life = rng.range(4, 7);
      const cannon = spawned % 3 === 0;
      if (cannon) {
        const side = rng.chance(0.5) ? -1 : 1;
        d.p.set(side * 7, 1.2, -5.5);
        d.v.set(-side * rng.range(2, 6), rng.range(7, 12), rng.range(-2, 3));
      } else {
        d.p.set(center.x + rng.range(-7, 7), center.y + rng.range(-0.5, 0.5), center.z + rng.range(-4, 5));
        d.v.set(rng.range(-0.5, 0.5), rng.range(-1, 0), rng.range(-0.5, 0.5));
      }
      d.r.set(rng.range(0, TAU), rng.range(0, TAU), 0);
      d.w.set(rng.range(-8, 8), rng.range(-8, 8), rng.range(-8, 8));
      if (gold) this.confetti.setColorAt(i, c.set(rng.pick([0xffc53d, 0xffe08a, 0xffffff, 0xe0a82e])));
      spawned++;
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }

  sprite(kind, pos, opts = {}) {
    const tex = textures();
    const material = new THREE.SpriteMaterial({
      map: tex[kind] || tex.soft,
      color: opts.color ?? 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
      opacity: opts.opacity ?? 1,
    });
    const s = new THREE.Sprite(material);
    s.position.copy(pos);
    s.scale.setScalar(opts.size ?? 0.4);
    s.userData = { life: opts.life ?? 1.5, age: 0, v: opts.v ? opts.v.clone() : new THREE.Vector3(), grow: opts.grow ?? 0, spin: opts.spin ?? 0, fade: opts.fade ?? 1, gravity: opts.gravity ?? 0, size: opts.size ?? 0.4, opacity: opts.opacity ?? 1 };
    this.scene.add(s);
    this.sprites.push(s);
    return s;
  }

  smoke(pos, amount = 14, color = 0xd8d0ff) {
    for (let i = 0; i < amount; i++) {
      this.sprite('smoke', pos.clone().add(new THREE.Vector3(rng.range(-0.4, 0.4), rng.range(0, 1.6), rng.range(-0.3, 0.3))), {
        color,
        size: rng.range(0.6, 1.2),
        grow: rng.range(0.8, 1.6),
        life: rng.range(1.2, 2.2),
        v: new THREE.Vector3(rng.range(-0.4, 0.4), rng.range(0.2, 0.8), rng.range(-0.3, 0.3)),
        opacity: 0.8,
      });
    }
  }
  sparkle(pos, amount = 12, color = 0xffe08a) {
    for (let i = 0; i < amount; i++) {
      this.sprite('star', pos.clone(), {
        color,
        additive: true,
        size: rng.range(0.1, 0.25),
        life: rng.range(0.6, 1.2),
        v: new THREE.Vector3(rng.range(-1.5, 1.5), rng.range(0.5, 2.5), rng.range(-1, 1)),
        gravity: -2,
        spin: rng.range(-4, 4),
      });
    }
  }
  note(pos, color = 0xffc53d, wrong = false) {
    this.sprite('note', pos.clone().add(new THREE.Vector3(rng.range(-0.2, 0.2), 0, 0)), {
      color: wrong ? 0x7a7a7a : color,
      size: 0.35,
      life: 1.8,
      v: new THREE.Vector3(rng.range(-0.3, 0.3) + (wrong ? rng.range(-0.8, 0.8) : 0), wrong ? 0.4 : 0.9, 0.2),
      spin: wrong ? rng.range(-3, 3) : 0,
      gravity: wrong ? -0.6 : 0,
    });
  }
  glow(pos, color, size = 2, life = 0.6) {
    return this.sprite('soft', pos, { color, additive: true, size, life, grow: 1.5 });
  }
  dove(pos) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), white);
    body.scale.set(1, 0.8, 1.6);
    const wings = [-1, 1].map((side) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1), white);
      w.material.side = THREE.DoubleSide;
      w.position.x = side * 0.11;
      const pivot = new THREE.Group();
      pivot.add(w);
      g.add(pivot);
      return { pivot, side };
    });
    g.add(body);
    g.position.copy(pos);
    const v = new THREE.Vector3(rng.range(-2, 2), rng.range(2, 3.5), rng.range(-1, 2));
    g.userData = { v, wings, age: 0 };
    this.scene.add(g);
    this.doves.push(g);
  }

  update(dt) {
    // Sprites
    this.sprites = this.sprites.filter((s) => {
      const u = s.userData;
      u.age += dt;
      if (u.age >= u.life) {
        this.scene.remove(s);
        s.material.dispose();
        return false;
      }
      u.v.y += u.gravity * dt;
      s.position.addScaledVector(u.v, dt);
      const k = u.age / u.life;
      s.scale.setScalar(u.size * (1 + u.grow * k));
      s.material.rotation += u.spin * dt;
      s.material.opacity = u.opacity * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      return true;
    });
    // Confetti
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let any = false;
    this.confettiData.forEach((d, i) => {
      if (!d.alive) return;
      any = true;
      d.life -= dt;
      d.v.y -= 3.2 * dt;
      d.v.multiplyScalar(1 - 1.6 * dt);
      d.v.x += Math.sin(d.life * 3 + i) * 0.6 * dt;
      d.p.addScaledVector(d.v, dt);
      d.r.x += d.w.x * dt;
      d.r.y += d.w.y * dt;
      if (d.p.y < 0.02 || d.life <= 0) {
        if (d.life <= 0) {
          d.alive = false;
          this.confetti.setMatrixAt(i, m.makeScale(0, 0, 0));
          return;
        }
        d.p.y = Math.max(d.p.y, d.p.x > -10 && d.p.x < 10 && d.p.z < -4.6 ? 1.01 : 0.02);
        d.v.set(0, 0, 0);
        d.w.set(0, 0, 0);
      }
      q.setFromEuler(d.r);
      m.compose(d.p, q, one);
      this.confetti.setMatrixAt(i, m);
    });
    if (any || this._confettiDirty) this.confetti.instanceMatrix.needsUpdate = true;
    this._confettiDirty = any;
    // Doves
    this.doves = this.doves.filter((g) => {
      const u = g.userData;
      u.age += dt;
      g.position.addScaledVector(u.v, dt);
      g.lookAt(g.position.clone().add(u.v));
      for (const w of u.wings) w.pivot.rotation.z = w.side * Math.sin(u.age * 22) * 0.9;
      if (u.age > 5) {
        this.scene.remove(g);
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const s of this.sprites) this.scene.remove(s);
    this.sprites = [];
    for (const g of this.doves) this.scene.remove(g);
    this.doves = [];
  }
}
