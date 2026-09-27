// Where the judge is looking. The default view is the stage; you can glance over your shoulder at the audience,
// look left or right at the other judges, or drag to look around. Other modes can point the view at something.
import * as THREE from 'three';
import { MARK, SEAT } from './studio.js';
import { clamp, damp } from './util.js';

const BACK = Math.PI;

export class Look {
  constructor(camera, canvas, studio) {
    this.camera = camera;
    this.canvas = canvas;
    this.studio = studio;
    this.yaw = 0;
    this.pitch = 0;
    this.focus = new THREE.Vector3(MARK.x, MARK.y + 1.1, MARK.z);
    this.fov = null; // null: the studio's default for the screen shape
    this.dragYaw = 0;
    this.dragPitch = 0;
    this.glance = null; // 'back' | 'left' | 'right'
    this.dragEnabled = true;
    this.shakeAmount = 0;
    this.idle = 0;
    this.drift = 0; // slow pan on the title screen
    this.bindPointer();
  }

  bindPointer() {
    let last = null;
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (!this.dragEnabled) return;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last || e.pointerId !== last.id) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last.x = e.clientX;
      last.y = e.clientY;
      const k = 3.2 / Math.max(el.clientWidth, 1);
      this.dragYaw += dx * k;
      this.dragPitch = clamp(this.dragPitch + dy * k * 0.7, -0.6, 0.5);
      this.idle = 0;
    });
    const end = () => {
      last = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }
  setFocus(point, fov = null) {
    this.focus.copy(point);
    this.fov = fov;
  }
  resetFocus() {
    this.focus.set(MARK.x, MARK.y + 1.1, MARK.z);
    this.fov = null;
  }
  recenter() {
    this.dragYaw = 0;
    this.dragPitch = 0;
  }

  // How much the judge is facing the audience: 0 facing the stage, 1 turned right round.
  get facingAudience() {
    return clamp((1 - Math.cos(this.yaw)) / 2);
  }

  update(dt, t) {
    // Base direction toward the focus point.
    const d = new THREE.Vector3().subVectors(this.focus, SEAT);
    if (this.studio.portrait && this.fov === null) d.y -= 0.35;
    let baseYaw = Math.atan2(-d.x, -d.z);
    let basePitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    if (this.drift) baseYaw += Math.sin(t * 0.08) * 0.35 * this.drift;
    let targetYaw = baseYaw + this.dragYaw;
    let targetPitch = basePitch - this.dragPitch;
    if (this.glance === 'back') {
      targetYaw = (this.dragYaw >= 0 ? 1 : -1) * BACK * 0.97;
      targetPitch = 0.2;
    } else if (this.glance === 'left') {
      targetYaw = 1.35;
      targetPitch = -0.05;
    } else if (this.glance === 'right') {
      targetYaw = -1.35;
      targetPitch = -0.05;
    }
    // A small drag springs back; a big one (looking behind you) stays.
    this.idle += dt;
    if (this.idle > 1.2 && Math.abs(this.dragYaw) < 1.2) {
      this.dragYaw = damp(this.dragYaw, 0, 1.5, dt);
      this.dragPitch = damp(this.dragPitch, 0, 1.5, dt);
    }
    const rate = this.glance ? 7 : 5;
    this.yaw = damp(this.yaw, targetYaw, rate, dt);
    this.pitch = damp(this.pitch, targetPitch, rate, dt);
    this.shakeAmount = damp(this.shakeAmount, 0, 4, dt);
    const shake = this.shakeAmount;
    const f = this.facingAudience;
    const cam = this.camera;
    cam.position.set(SEAT.x + Math.sin(this.yaw) * -0.08 * f, SEAT.y + f * 0.12, SEAT.z + f * 0.1);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + (Math.random() - 0.5) * shake * 0.2;
    cam.rotation.x = this.pitch + (Math.random() - 0.5) * shake * 0.2;
    cam.rotation.z = 0;
    const fov = this.fov ?? this.studio.baseFov;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 4, dt);
      cam.updateProjectionMatrix();
    }
  }
}
