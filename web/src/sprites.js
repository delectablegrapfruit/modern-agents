// sprites.js: the app's Sprites.swift: a foe on the lane (FoeSprite), the ronin (HeroSprite), an arrow in flight and
// the gourd flung from its fallen bearer.

const sideSign = (s) => (s === 'left' ? -1 : 1);
const opposite = (s) => (s === 'left' ? 'right' : 'left');
const sideOf = (x) => (x < 0 ? 'left' : 'right');

/** The frame key of a Frame, as the core names them: idle(0), cut(kesa,2), aim. */
const F = {
  idle: (k) => `idle(${k})`, iai: (k) => `iai(${k})`, walk: (k) => `walk(${k})`, windup: (k) => `windup(${k})`,
  strike: (k) => `strike(${k})`, stagger: (k) => `stagger(${k})`, leap: 'leap', aim: 'aim', loose: 'loose', block: 'block',
  cut: (c, k) => `cut(${c},${k})`, recover: (c, k) => `recover(${c},${k})`, chain: (c, k) => `chain(${c},${k})`,
  shuffle: (k) => `shuffle(${k})`, winded: (v, k) => `winded(${v},${k})`, reel: (v, k) => `reel(${v},${k})`,
  stumble: (k) => `stumble(${k})`, repelled: (k) => `repelled(${k})`, hurt: (k) => `hurt(${k})`,
  flourish: (k) => `flourish(${k})`, fall: (k) => `fall(${k})`, clash: (k) => `clash(${k})`, retreat: (k) => `retreat(${k})`,
};
/** The name of a frame (its case) and its numbers. */
function frameCase(f) { const i = f.indexOf('('); return i < 0 ? f : f.slice(0, i); }
function frameNums(f) {
  const i = f.indexOf('(');
  if (i < 0) return [];
  return f.slice(i + 1, -1).split(',').map((s) => (/^\d+$/.test(s) ? +s : s));
}

/** Where a figure's ankles are in a frame (Figure.footing), in its heights: x toward its facing, y lifted. */
const footingCache = new Map();
function footing(cast, frame) {
  const key = cast + '|' + frame;
  let f = footingCache.get(key);
  if (!f) {
    const core = Figures.core;
    const got = core && typeof core.footing === 'function' ? core.footing(cast, frame) : null;
    const pt = (p) => (p ? { x: p.x ?? p[0], y: p.y ?? p[1] } : { x: 0, y: 0 });
    f = got ? { front: pt(got.front), back: pt(got.back) } : { front: { x: 0.12, y: 0 }, back: { x: -0.12, y: 0 } };
    footingCache.set(key, f);
  }
  return f;
}

/** Where the point of a figure's weapon is in a frame, and the blade's angle (Figure.tip, Pose.blade), if the core
 *  tells them. */
function weaponLine(cast, frame) {
  const info = figureInfo(cast, frame);
  if (!info || !info.tip) return null;
  let blade = info.blade ?? null;
  if (blade === null && info.anatomy) {
    // (Until the core gives Pose.blade: the line from the neck to the point stands in for the blade's.)
    const unit = Builds[cast].pixels * Builds[cast].height;
    const neck = { x: info.anatomy.neck.x / unit - FigureCanvas.feetX, y: info.anatomy.neck.y / unit - FigureCanvas.feetY };
    // Pose.blade runs from straight down (0) round toward the way he faces: a point along it is at (sin, -cos).
    blade = Math.atan2(info.tip.x - neck.x, -(info.tip.y - neck.y));
  }
  return { tip: info.tip, blade };
}

/** What the core tells of a figure in a frame (Figure.footing, .tip, .contact, .anatomy, whether it is smeared). */
const figureInfoCache = new Map();
function figureInfo(cast, frame) {
  const key = cast + '|' + frame;
  let info = figureInfoCache.get(key);
  if (info === undefined) {
    const core = Figures.core;
    try { info = core && typeof core.figure === 'function' ? core.figure(cast, frame) : null; } catch { info = null; }
    figureInfoCache.set(key, info);
  }
  return info;
}

// MARK: A foe

class FoeSprite extends Node {
  constructor(foe, ronin, headroom = null, ambient = Ambient.plain) {
    super();
    this.id = foe.id;
    this.kind = foe.kind;
    this.cast = foe.kind;
    this.ambient = ambient;
    this.pivot = new Node();
    this.body = new FigureSprite(this.cast);
    this.echo = new FigureSprite(this.cast);
    this.echoFrame = F.walk(0);
    this.shadow = new Sprite(Art.glow);
    this.glint = new Sprite(Art.glow);
    this.fury = new Sprite(Art.glow);
    this.ward = new Sprite(Art.crescent);
    this.warning = new Node();
    this.warningMark = new Shape();
    this.warningRing = new Shape();
    this.warningGold = new Shape();
    this.sight = rectSprite(Palette.blood, 1, 1, 0, 0.5);
    this.pips = [];
    this.gourd = null; this.gourdHalo = null;
    this.walk = 0; this.pace = 0; this.trail = null; this.stepping = false;
    this.shownX = null; this.shownAir = 0; this.core = null; this.lanePoints = null; this.glide = 0;
    this.ronin = 60; this.headroom = Infinity; this.heroX = null;
    this.idleClock = Math.random() * 2; this.strikeClock = 1; this.staggerHold = 0; this.hitFlash = 0;
    this.jolt = 0; this.lurch = 0; this.lean = 0; this.squash = 0; this.gather = 0; this.wasLeaping = false;
    this.facing = 1; this.shown = F.walk(0); this.age = 0;
    this.holding = false; this.holdLeft = 0; this.bound = null; this.lagged = false; this.leapStart = null;
    this.wardSet = false; this.ringStep = -1;
    this.glare = null; this.glareAge = 0; this.glaring = false;
    this.tinted = null; this.pipsShown = -1;

    this.shadow.color = RGB.black;
    this.shadow.alpha = 0.6;
    this.shadow.z = -1;
    this.add(this.shadow);
    this.add(this.pivot);
    this.fury.color = Palette.blood; this.fury.blend = BLEND.add; this.fury.alpha = 0; this.fury.z = -0.3;
    this.pivot.add(this.fury);
    this.pivot.add(this.echo);
    this.pivot.add(this.body);
    this.echo.alpha = 0; this.echo.z = -0.1;
    this.light();
    this.glint.color = Builds[this.cast].eyes || Palette.blood;
    this.glint.blend = BLEND.add; this.glint.alpha = 0; this.glint.z = 0.1;
    this.pivot.add(this.glint);
    this.ward.color = Palette.steel.mix(RGB.white, 0.4); this.ward.blend = BLEND.add; this.ward.alpha = 0; this.ward.z = 0.5;
    this.pivot.add(this.ward);
    this.sight.blend = BLEND.add; this.sight.alpha = 0; this.sight.z = -0.5;
    this.add(this.sight);
    this.warningMark.fillColor = Palette.blood.mix(RGB.white, 0.15).css();
    this.warningMark.strokeColor = 'rgba(0,0,0,0.6)';
    this.warningMark.lineWidth = 1;
    this.warningRing.strokeColor = Palette.blood.mix(RGB.white, 0.35).css();
    this.warningRing.lineCap = 'round'; this.warningRing.lineWidth = 1.6;
    this.warningGold.strokeColor = Palette.gold.mix(RGB.white, 0.25).css();
    this.warningGold.lineCap = 'round'; this.warningGold.lineWidth = 2.2; this.warningGold.glowWidth = 1;
    this.warning.add(this.warningRing);
    this.warning.add(this.warningGold);
    this.warning.add(this.warningMark);
    this.warning.hidden = true;
    // Over the HUD: a blow coming is the one thing that must never be covered.
    this.warning.z = 38;
    this.add(this.warning);
    if (foe.maxHP > 1 && foe.kind !== 'warlord') {
      for (let k = 0; k < foe.maxHP; k++) {
        const pip = Icons.heart(FoeSprite.pip);
        pip.strokeColor = 'rgba(0,0,0,0.7)';
        pip.z = 1.5;
        this.add(pip);
        this.pips.push(pip);
      }
    }
    if (foe.kind === 'runner') {
      const streak = new Sprite(Art.streak);
      streak.ax = 1; streak.ay = 0.5;
      streak.alpha = 0; streak.z = -0.2;
      this.pivot.add(streak);
      this.trail = streak;
    }
    this.alpha = 0;
    this.layout(ronin, headroom);
  }

  get height() { return this.ronin * Builds[this.cast].height; }
  get idleRate() { return this.kind === 'runner' ? 10 : 5; }
  get quick() { return this.kind === 'runner' ? 0.65 : 1; }

  layout(ronin, headroom = null) {
    this.ronin = ronin;
    if (headroom !== null) this.headroom = headroom;
    this.body.apply(this.shown, ronin);
    this.echo.apply(this.echoFrame, ronin);
    const height = this.height;
    this.pivot.at(0, height * 0.5);
    this.body.at(0, -height * 0.5);
    this.echo.at(0, -height * 0.5);
    this.shadow.size(height * 0.8, height * 0.12);
    this.glint.size(height * 0.5, height * 0.5).at(0, height * 0.38);
    this.fury.size(height * 1.5, height * 1.5).at(0, -height * 0.05);
    this.ward.size(height * 0.8, height * 0.95);
    const s = Math.max(5, ronin * 0.085);
    const mark = new Path2D();
    mark.moveTo(-s * 0.45, s * 0.35); mark.lineTo(s * 0.45, s * 0.35); mark.lineTo(0, -s * 0.6); mark.closePath();
    this.warningMark.path = mark;
    this.ringStep = -1;
    for (const pip of this.pips) pip.setScale(FoeSprite.pipScale(ronin));
    this.shownX = null; this.core = null; this.lanePoints = null; this.glide = 0;
    if (this.gourd) { this.dropGourd(); this.showGourd(); }
    this.placeOverhead();
  }

  static markerRadius(ronin) { return Math.max(6, ronin * 0.12); }
  static markerClearance(ronin) { return FoeSprite.markerRadius(ronin) * 1.15 + 1.5; }
  static pipScale(ronin) { return Math.max(1, ronin / 60); }
  static gourdSize(ronin) { return Math.max(9, ronin * 0.17); }

  static overhead(kind, ronin, headroom = Infinity, gourd = false) {
    const height = ronin * Builds[kind].height;
    const head = height * 1.12;
    if (!gourd) return { pips: height * 1.1, gourd: head, marker: Math.min(head, headroom - FoeSprite.markerClearance(ronin)) };
    const carried = head + ronin * 0.05;
    const top = carried + FoeSprite.gourdSize(ronin) * 0.48 * FoeSprite.gourdSwell + FoeSprite.gourdBob;
    const marker = Math.min(top + FoeSprite.markerRadius(ronin) * 1.15 + 1, headroom - FoeSprite.markerClearance(ronin));
    return { pips: carried, gourd: carried, marker };
  }

  static pipOffsets(count, ronin, gourd) {
    const spacing = Math.max(7, ronin * 0.11);
    if (!gourd) return [...Array(count).keys()].map((k) => (k - (count - 1) / 2) * spacing);
    const inner = FoeSprite.gourdSize(ronin) * 0.3 * FoeSprite.gourdSwell + Math.max(2.5, ronin * 0.035) + FoeSprite.pip * 0.26 * FoeSprite.pipScale(ronin);
    return [...Array(count).keys()].map((k) => (k % 2 === 0 ? -1 : 1) * (inner + Math.floor(k / 2) * spacing));
  }

  placeOverhead() {
    const marks = FoeSprite.overhead(this.kind, this.ronin, this.headroom, !!this.gourd);
    if (this.gourd) this.gourd.at(0, marks.gourd);
    this.warning.at(0, marks.marker);
    const xs = FoeSprite.pipOffsets(this.pips.length, this.ronin, !!this.gourd);
    this.pips.forEach((pip, k) => pip.at(xs[k], marks.pips));
  }

  showGourd() {
    const node = new Node();
    const halo = tintedSprite(Art.glow, Palette.jade, this.ronin * 0.42, this.ronin * 0.42);
    halo.blend = BLEND.add;
    halo.alpha = 0.5;
    halo.run(A.forever(A.seq(A.fadeTo(0.2, 0.5), A.fadeTo(0.6, 0.5))));
    node.add(halo);
    node.add(Icons.gourd(FoeSprite.gourdSize(this.ronin), Palette.jade.mix(RGB.white, 0.25).css()));
    const bob = FoeSprite.gourdBob;
    node.run(A.forever(A.seq(A.moveBy(0, bob, 0.6), A.moveBy(0, -bob, 0.6))));
    node.z = 1;
    this.add(node);
    this.gourd = node;
    this.gourdHalo = halo;
    this.placeOverhead();
  }

  dropGourd() {
    if (!this.gourd) return;
    this.gourd.remove();
    this.gourd = null;
    this.gourdHalo = null;
    this.placeOverhead();
  }

  /** Puts the foe where the fight has him and picks his frame; returns where a foot came down, if one did. */
  updateFoe(foe, px, py, air, hero, dt, club = false, calm = false) {
    this.age += dt;
    this.heroX = hero;
    this.strikeClock += dt;
    this.staggerHold = Math.max(0, this.staggerHold - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.idleClock += dt;
    this.jolt *= Math.pow(0.0005, dt);
    this.lurch *= Math.pow(0.0002, dt);
    this.squash *= Math.pow(0.0004, dt);
    if (this.alpha < 1) {
      const t = Math.min(1, this.age / 0.25);
      this.alpha = 1 - (1 - t) * (1 - t);
    }
    if (foe.bearer && !this.gourd) this.showGourd(); else if (!foe.bearer && this.gourd) this.dropGourd();
    if (this.holding) {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0) this.holding = false;
    }
    if (Math.abs(foe.x) > 0.05) this.lanePoints = Math.abs((px - hero) / foe.x);
    const leaping = foe.phase === 'leaping' && !this.holding;
    const held = this.holding || this.bound !== null;
    if (!held) {
      const facingRight = foe.phase === 'leaping' ? foe.leapTo < 0 : foe.phase === 'fleeing' ? foe.x > 0 : foe.x < 0;
      this.facing = facingRight ? 1 : -1;
    }
    let x = px, lift = air;
    let flight = foe.progress;
    if (leaping) {
      if (this.lagged) { this.leapStart = foe.progress; this.lagged = false; }
      const start = this.leapStart;
      if (start !== null && start > 0) {
        flight = start >= 1 ? 1 : Math.max(0, (foe.progress - start) / (1 - start));
        x = px + (flight - foe.progress) * (foe.leapTo - foe.leapFrom) * (this.lanePoints || 0);
        const s = Math.sin(foe.progress * Math.PI);
        lift = s > 1e-3 ? air * Math.sin(flight * Math.PI) / s : 0;
      }
      this.glide = 0;
    } else {
      if (!this.holding) { this.leapStart = null; this.lagged = false; }
      if (held && this.shownX !== null) {
        x = this.shownX;
        lift = this.shownAir;
        this.glide = this.shownX - px;
      } else if (this.shownX !== null && this.core !== null && Math.abs(px - this.core) < this.ronin * 2) {
        const d = px - this.core;
        const limit = (this.lanePoints ?? Infinity) * FoeSprite.fastest(foe) * (dt * 1.25 + Tuning.step);
        if (Math.abs(d) > limit) this.glide -= d - (d > 0 ? limit : -limit);
        this.glide *= Math.pow(1e-6, dt);
        x = this.shownX + (px + this.glide - this.shownX) * Math.min(1, dt * 60);
      } else {
        this.glide = 0;
      }
    }
    this.core = px;
    const shift = this.shownX !== null ? x - this.shownX : 0;
    this.shownX = x;
    this.shownAir = lift;
    this.at(x - this.facing * this.jolt + this.facing * this.lurch, py + lift);
    this.shadow.at(0, -lift);
    this.shadow.alpha = 0.6 * Math.max(0.25, 1 - lift / (this.ronin * 1.2));
    const height = this.height;
    this.glint.x = this.facing * height * 0.07;

    const onFoot = !held && (foe.phase === 'advancing' || foe.phase === 'fleeing' || (foe.darting && foe.phase === 'windup'));
    let planted = null;
    if (!onFoot) {
      this.pace = 0;
      this.stepping = false;
    } else if (dt > 0) {
      this.pace += (shift * this.facing / dt - this.pace) * Math.min(1, dt * 12);
      this.stepping = this.stepping ? Math.abs(this.pace) > this.ronin * 0.08 : Math.abs(this.pace) > this.ronin * 0.2;
      if (this.stepping) {
        const running = foe.darting;
        const unit = Math.max(1, height * Builds[this.cast].stride * (running && this.kind !== 'runner' ? 1.3 : 1) / FrameCounts.walk);
        const before = Math.floor(this.walk);
        this.walk += shift * this.facing / unit;
        const at = this.landing(before, Math.floor(this.walk));
        if (at !== null) planted = x + this.facing * at * height;
      }
    }
    const stride = F.walk(FoeSprite.wrap(Math.floor(this.walk)));

    let frame = this.shown;
    let leanTarget = this.holding ? this.lean : 0;
    let gathering = 0;
    if (!this.holding) {
      switch (foe.phase) {
        case 'advancing': case 'fleeing':
          if (foe.readying && !this.stepping) {
            frame = F.windup(0); leanTarget = 0.07; gathering = 1;
          } else if (dt === 0) {
            frame = this.shown;
          } else if (this.stepping) {
            frame = stride;
            leanTarget = this.pace > 0 ? Math.min(0.1, this.pace / this.ronin * 0.045) : Math.max(-0.05, this.pace / this.ronin * 0.02);
          } else {
            frame = this.staggerHold > 0 ? F.stagger(this.staggerHold > 0.15 ? 0 : 1) : F.idle(Math.floor(this.idleClock * this.idleRate) % FrameCounts.foeIdle);
          }
          break;
        case 'windup': {
          const t = foe.progress;
          if (foe.darting && (this.stepping || foe.distance > foe.contact + 0.004)) {
            frame = stride; leanTarget = 0.2; gathering = 1;
          } else if (this.strikeClock < 0.09 * this.quick) {
            frame = F.strike(0);
          } else {
            frame = F.windup(t < 0.18 ? 0 : t < 0.42 ? 1 : t < 0.8 ? 2 : 3);
            leanTarget = -0.04 * t;
          }
          break;
        }
        case 'aiming': {
          const t = foe.progress;
          frame = t < 0.18 ? F.windup(0) : t < 0.32 ? F.windup(1) : t < 0.46 ? F.windup(2) : t < 0.58 ? F.windup(3) : F.aim;
          break;
        }
        case 'guarding':
          frame = F.block;
          break;
        case 'recoil':
          if (this.strikeClock < 0.3 * this.quick) {
            frame = this.kind === 'archer' ? F.loose : F.strike(this.strikeClock < 0.09 * this.quick ? 0 : this.strikeClock < 0.19 * this.quick ? 1 : 2);
          } else if (this.staggerHold > 0) {
            frame = F.stagger(this.staggerHold > 0.15 ? 0 : 1);
            leanTarget = -0.1;
          } else {
            frame = this.kind === 'archer' ? F.loose : F.idle(Math.floor(this.idleClock * this.idleRate) % FrameCounts.foeIdle);
          }
          break;
        case 'leaping':
          if (foe.bearer) { frame = F.stagger(flight < 0.5 ? 0 : 1); leanTarget = -0.1; } else frame = F.leap;
          break;
        default:
          frame = F.stagger(0);
      }
    }
    if (this.bound) { frame = this.bound; leanTarget = 0; }
    if (!Figures.has(this.cast, frame)) frame = F.idle(0);
    if (frame !== this.shown) this.changePose(frame);
    if (this.echo.alpha > 0) this.echo.alpha = Math.max(0, this.echo.alpha - dt / 0.1 * 0.5);
    if (leaping && !this.wasLeaping && foe.bearer) this.squash = Math.max(this.squash, 0.1);
    if (this.wasLeaping && !leaping && !this.holding) this.squash = foe.bearer ? 0.12 : 0.16;
    if (!this.holding) this.wasLeaping = leaping;
    if (planted !== null && (this.kind === 'brute' || this.kind === 'warlord')) this.squash = Math.max(this.squash, this.kind === 'brute' ? 0.045 : 0.035);

    if (foe.darting) gathering = 1;
    this.gather += (gathering - this.gather) * Math.min(1, dt * 18);
    if (this.gather > 0.01 && !foe.darting) this.squash = Math.max(this.squash, 0.07 * this.gather);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * (gathering > 0 ? 24 : 10));
    const xScale = this.facing * (1 + this.squash * 0.5), yScale = 1 - this.squash;
    this.body.rotation = -this.facing * this.lean;
    this.body.xScale = xScale; this.body.yScale = yScale;
    this.echo.rotation = this.body.rotation;
    this.echo.xScale = xScale; this.echo.yScale = yScale;
    if (this.gourd) {
      this.gourd.setScale(1 + 0.2 * this.gather);
      this.gourdHalo?.setScale(1 + 0.9 * this.gather);
    }
    if (this.trail) {
      const s = Math.min(1, Math.max(0, this.pace) / (this.ronin * 1.5));
      this.trail.color = this.ambient.ghost;
      this.trail.at(-this.facing * height * 0.12, height * 0.05);
      this.trail.xScale = this.facing;
      this.trail.size(this.ronin * 0.6 * Math.max(0.2, s), this.ronin * 0.2);
      const want = this.stepping && this.pace > this.ronin * 0.5 && !leaping ? 0.18 * s : 0;
      this.trail.alpha += (want - this.trail.alpha) * Math.min(1, dt * 12);
    }

    if (leaping && !foe.bearer) {
      this.pivot.rotation = -flight * TAU * (foe.leapTo > 0 ? 1 : -1);
    } else if (!this.holding && this.pivot.rotation !== 0) {
      const r = this.pivot.rotation;
      this.pivot.rotation = (r - TAU * Math.round(r / TAU)) * 0.5;
      if (Math.abs(this.pivot.rotation) < 0.01) this.pivot.rotation = 0;
    }

    const charging = foe.phase === 'windup' || foe.phase === 'aiming';
    const t = charging ? foe.progress : 0;
    if (this.hitFlash > 0) this.tint(this.ambient.light, this.hitFlash / 0.14 * 0.8);
    else if (charging) this.tint(Palette.blood, (0.12 + 0.5 * t * t) * (this.kind === 'archer' ? 0.6 : 1));
    else this.tint(Palette.blood, 0);
    this.glint.alpha = charging ? 0.25 + 0.75 * t : 0;
    this.glint.setScale(charging ? 0.6 + 0.5 * t + 0.12 * Math.sin(foe.timer * 40) : 1);
    this.warning.hidden = foe.phase !== 'windup';
    if (foe.phase === 'windup') {
      const step = Math.ceil((1 - t) * 60);
      const late = foe.hp === 1 ? Math.min(1, Tuning.senNoSen / Math.max(foe.span, 1e-3)) : 0;
      const gold = Math.min(step, Math.round(late * 60));
      if (step * 64 + gold !== this.ringStep) {
        this.ringStep = step * 64 + gold;
        const r = FoeSprite.markerRadius(this.ronin);
        const ring = new Path2D();
        if (step > gold) ring.arc(0, 0, r, Math.PI / 2 + gold / 60 * TAU, Math.PI / 2 + step / 60 * TAU, false);
        this.warningRing.path = ring;
        const arc = new Path2D();
        if (gold > 0) arc.arc(0, 0, r, Math.PI / 2, Math.PI / 2 + gold / 60 * TAU, false);
        this.warningGold.path = arc;
        this.warningGold.alpha = step <= gold ? 1 : 0.7;
      }
      this.warning.setScale(1 + 0.15 * Math.max(0, Math.sin(foe.timer * 30)) * t);
    }
    if (foe.phase === 'aiming') {
      const reach = Math.abs(hero - x) - this.ronin * 0.2;
      this.sight.hidden = reach <= 0;
      this.sight.size(Math.max(0, reach), Math.max(1, this.ronin * 0.015));
      this.sight.xScale = this.facing;
      this.sight.at(this.facing * this.ronin * 0.2, height * 0.6);
      this.sight.alpha = 0.08 + 0.5 * t * t;
    } else {
      this.sight.alpha = 0;
    }
    const guarding = foe.phase === 'guarding';
    const braced = !!foe.guardSet;
    const rising = Math.min(1, (foe.guardAge || 0) / Tuning.guardRise);
    if (braced && !this.wardSet) {
      this.ward.alpha = 0.95;
      const ring = shockwave(Palette.steel, { radius: this.ronin * 0.08, grow: 3, width: 1.5, duration: 0.25 });
      ring.at(this.facing * height * 0.12, height * 0.7);
      ring.z = 1;
      this.add(ring);
    }
    this.wardSet = braced;
    this.ward.at(this.facing * height * 0.3, -height * 0.02);
    this.ward.xScale = this.facing;
    const wardTarget = !guarding ? 0 : braced ? 0.45 + 0.12 * Math.sin(this.age * 14) : 0.2 * rising;
    this.ward.alpha += (wardTarget - this.ward.alpha) * Math.min(1, dt * 16);
    if (guarding && !braced) this.echo.alpha = Math.max(this.echo.alpha, 0.45 * (1 - rising));
    if (this.kind === 'warlord' && !this.holding) {
      const rage = 1 - foe.hp / Math.max(1, foe.maxHP);
      this.fury.alpha = rage * (0.35 + 0.15 * Math.sin(this.age * 6));
    }
    if (!this.holding) {
      if (foe.hp !== this.pipsShown) {
        this.pipsShown = foe.hp;
        const left = Builds[this.cast].accent.mix(RGB.white, 0.35).css(), spent = 'rgba(255,255,255,0.15)';
        this.pips.forEach((pip, k) => { pip.fillColor = k < foe.hp ? left : spent; });
      }
      const hidden = leaping || (foe.phase === 'windup' && !this.gourd);
      for (const pip of this.pips) pip.hidden = hidden;
    }
    this.drawGlare(club || (this.holding && this.glaring), calm, dt);
    return planted;
  }

  /** Where the brute's club runs in a frame, from the grip to the head, in his heights (FoeSprite.club). */
  static club(cast, frame) {
    if (cast !== 'brute') return null;
    const key = frame;
    if (FoeSprite.clubs.has(key)) return FoeSprite.clubs.get(key);
    let line = null;
    const w = weaponLine(cast, frame);
    const given = figureInfo(cast, frame)?.club;
    if (given) {
      line = { grip: given.grip, head: given.head };
    } else if (w && w.blade !== null && w.blade !== undefined) {
      const head = w.tip, angle = w.blade;
      line = { grip: { x: head.x - Math.sin(angle) * FoeSprite.clubLength, y: head.y + Math.cos(angle) * FoeSprite.clubLength }, head };
    } else {
      // (Until the core tells where the club is: overhead, raised behind him, as his wind-up holds it.)
      const k = +(frameNums(frame)[0] ?? 3);
      const raised = frameCase(frame) === 'windup';
      line = raised
        ? { grip: { x: 0.02, y: 0.86 + 0.04 * k }, head: { x: -0.18 - 0.03 * k, y: 1.3 + 0.02 * k } }
        : { grip: { x: 0.2, y: 0.6 }, head: { x: 0.55, y: 0.95 } };
    }
    FoeSprite.clubs.set(key, line);
    return line;
  }

  /** A point `share` of the way up his club, in the parent's space, and which way the club runs there. */
  clubPoint(share) {
    const line = FoeSprite.club(this.cast, this.shown);
    if (!line || !this.parent) return null;
    const h = this.height;
    const local = (t) => ({ x: (line.grip.x + (line.head.x - line.grip.x) * t) * h, y: (line.grip.y + (line.head.y - line.grip.y) * t) * h });
    const a = local(share), b = local(Math.min(1, share + 0.2));
    const p = this.body.convert(a.x, a.y, this.parent), q = this.body.convert(b.x, b.y, this.parent);
    return { point: p, angle: Math.atan2(q.y - p.y, q.x - p.x) };
  }

  drawGlare(on, calm, dt) {
    const line = on ? FoeSprite.club(this.cast, this.shown) : null;
    if (!line) {
      this.glaring = false;
      if (this.glare && !this.glare.hidden) {
        this.glare.alpha -= dt / 0.08;
        if (this.glare.alpha <= 0) this.glare.hidden = true;
      }
      return;
    }
    if (!this.glare) {
      const node = new Node();
      node.z = 0.3;
      this.glareSheen = new Sprite(Art.streak); this.glareSheen.ax = 0; this.glareSheen.ay = 0.5;
      this.glareSheen.color = Palette.steel.mix(RGB.white, 0.35);
      this.glareGlint = new Sprite(Art.spark); this.glareGlint.color = RGB.white;
      this.glareFlare = new Sprite(Art.glow); this.glareFlare.color = Palette.gold.mix(RGB.white, 0.55);
      for (const s of [this.glareSheen, this.glareGlint, this.glareFlare]) { s.blend = BLEND.add; node.add(s); }
      this.glareStar = new Node();
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const ray = new Sprite(Art.streak);
        ray.color = RGB.white; ray.blend = BLEND.add; ray.rotation = angle;
        this.glareStar.add(ray);
      }
      node.add(this.glareStar);
      this.body.add(node);
      this.glare = node;
    }
    const node = this.glare;
    if (!this.glaring) { this.glareAge = 0; node.hidden = false; }
    this.glaring = true;
    this.glareAge += dt;
    node.alpha = 1;
    const height = this.height;
    const grip = { x: line.grip.x * height, y: line.grip.y * height };
    const head = { x: line.head.x * height, y: line.head.y * height };
    const length = Math.hypot(head.x - grip.x, head.y - grip.y);
    const t = this.glareAge;
    this.glareSheen.at(grip.x, grip.y);
    this.glareSheen.rotation = Math.atan2(head.y - grip.y, head.x - grip.x);
    this.glareSheen.size(length * 1.08, Math.max(3, height * 0.1));
    this.glareSheen.alpha = calm ? 0.6 : 0.55 + 0.2 * Math.sin(t * 24);
    const run = (t / 0.24) % 1;
    this.glareGlint.hidden = calm;
    this.glareGlint.at(grip.x + (head.x - grip.x) * run, grip.y + (head.y - grip.y) * run);
    this.glareGlint.size(height * 0.16, height * 0.16);
    this.glareGlint.alpha = Math.sin(run * Math.PI);
    const pop = calm ? 1 : 1 + 0.9 * Math.max(0, 1 - t / 0.1);
    const pulse = calm ? 1 : 1 + 0.14 * Math.sin(t * 28);
    this.glareFlare.at(head.x, head.y);
    this.glareFlare.size(height * 0.5, height * 0.5);
    this.glareFlare.setScale(pop * pulse);
    this.glareFlare.alpha = 0.9;
    this.glareStar.at(head.x, head.y);
    this.glareStar.rotation = calm ? 0 : t * 1.5;
    this.glareStar.setScale(pop);
    for (const ray of this.glareStar.children) {
      ray.size(height * 0.55, Math.max(1.5, height * 0.02));
      ray.alpha = calm ? 0.7 : 0.6 + 0.3 * pulse;
    }
  }

  static fastest(foe) { return foe.bearer ? foe.speed * Tuning.dartPace : Math.max(foe.speed * 1.5, 0.6); }
  static wrap(k) { const n = FrameCounts.walk; return ((k % n) + n) % n; }

  /** The walking frames on which a foot comes down, forward or backing off, and where that foot is. */
  static landings(cast, forward) {
    const key = cast + (forward ? '>' : '<');
    if (FoeSprite.landingCache.has(key)) return FoeSprite.landingCache.get(key);
    const n = FrameCounts.walk;
    const feet = [...Array(n).keys()].map((k) => footing(cast, F.walk(k)));
    const lifted = (k, front) => { const f = feet[FoeSprite.wrap(k)]; return (front ? f.front.y : f.back.y) > 0.0015; };
    const found = new Map();
    for (let k = 0; k < n; k++) {
      for (const front of [true, false]) {
        if (!lifted(k, front) && lifted(forward ? k - 1 : k + 1, front)) found.set(k, front ? feet[k].front.x : feet[k].back.x);
      }
    }
    FoeSprite.landingCache.set(key, found);
    return found;
  }

  landing(before, after) {
    if (after === before) return null;
    const step = after > before ? 1 : -1;
    const marks = FoeSprite.landings(this.cast, step > 0);
    let found = null;
    let k = before;
    while (k !== after) {
      k += step;
      const at = marks.get(FoeSprite.wrap(k));
      if (at !== undefined) found = at;
    }
    return found;
  }

  light() {
    this.shadow.color = this.ambient.ghost.scaled(0.5);
    this.echo.silhouette = this.ambient.ghost;
    const last = this.tinted || { color: Palette.blood, amount: 0 };
    this.tinted = null;
    this.tint(last.color, last.amount);
  }
  setAmbient(a) { if (a !== this.ambient) { this.ambient = a; this.light(); } }

  tint(color, amount) {
    if (this.tinted && this.tinted.color === color && this.tinted.amount === amount) return;
    this.tinted = { color, amount };
    const drawn = this.ambient.with(color, amount);
    this.body.setTint(drawn.color, drawn.amount);
  }

  changePose(frame) {
    const family = (f) => {
      switch (frameCase(f)) {
        case 'walk': return 0;
        case 'idle': return 1;
        case 'windup': case 'aim': return 2;
        case 'strike': return 3;
        case 'stagger': return 4;
        default: return 5;
      }
    };
    if (family(frame) !== family(this.shown) && family(frame) !== 3 && !Figures.smeared(this.cast, frame)) {
      this.echoFrame = this.shown;
      this.echo.apply(this.echoFrame, this.ronin);
      this.echo.alpha = 0.4;
    }
    this.shown = frame;
    this.body.apply(frame, this.ronin);
  }

  showStrike() {
    this.bound = null;
    this.strikeClock = 0;
    this.lurch = this.ronin * (this.kind === 'brute' || this.kind === 'warlord' ? 0.09 : this.kind === 'runner' ? 0.11 : 0.06);
    if (this.kind === 'brute') this.squash = 0.08;
  }
  showStagger() { this.staggerHold = 0.3; }
  showTurned() {
    this.holding = false; this.bound = null; this.glaring = false;
    this.staggerHold = Tuning.bruteStagger;
    this.jolt = this.ronin * 0.05; this.squash = 0.07; this.echo.alpha = 0;
  }
  hold(seconds) { this.bound = null; this.holding = true; this.holdLeft = seconds + 0.05; this.lagged = true; }

  /** The instant of a killing blow: thrown into the struck pose, lit white in the setting's light, held there until
   *  the blade arrives (FoeSprite.freezeStruck). */
  freezeStruck(piece) {
    this.holding = false; this.bound = null;
    this.shown = F.stagger(0);
    if (piece) this.body.applyPiece(piece, this.ronin); else this.body.apply(F.stagger(0), this.ronin);
    this.alpha = 1; this.echo.alpha = 0; this.lean = 0; this.squash = 0; this.gather = 0;
    this.pivot.rotation = 0;
    if (this.heroX !== null) this.facing = this.x < this.heroX ? 1 : -1;
    this.body.rotation = 0; this.body.xScale = this.facing; this.body.yScale = 1;
    this.tint(this.ambient.light, 0.88);
    this.warning.hidden = true; this.sight.alpha = 0; this.glint.alpha = 0; this.ward.alpha = 0;
    if (this.glare) this.glare.hidden = true;
    this.glaring = false;
    this.frozen = true;
  }

  flashHit() { this.holding = false; this.bound = null; this.hitFlash = 0.14; this.jolt = this.ronin * 0.08; this.squash = 0.09; }

  /** The wound a cut leaves across him, raw red, fading. */
  gash(tilt, level = 0.56, gore = Gore.full) {
    const height = this.height;
    const cut = tintedSprite(Art.streak, Palette.blood.mix(RGB.white, 0.1), height * (level < 0.4 ? 0.36 : 0.6), Math.max(2, height * 0.04 * gore.size));
    cut.at(0, height * (level - 0.5));
    cut.xScale = this.facing;
    cut.rotation = tilt * this.facing;
    cut.z = 1;
    this.pivot.add(cut);
    cut.run(A.seq(A.wait(0.3 * gore.span), A.fadeOut(0.45), A.remove()));
  }

  showParry(glanced = null) {
    if (glanced ?? !this.wardSet) { this.jolt = this.ronin * 0.02; this.ward.alpha = Math.max(this.ward.alpha, 0.55); }
    else { this.jolt = this.ronin * 0.012; this.ward.alpha = 1; }
  }

  get standing() { return this.shownX ?? this.x; }

  bind(frame) {
    const f = frame && Figures.has(this.cast, frame) ? frame : null;
    if (f === this.bound) return;
    this.bound = f;
    if (f && f !== this.shown) this.changePose(f);
  }
}
FoeSprite.pip = 6;
FoeSprite.gourdSwell = 1.2;
FoeSprite.gourdBob = 2;
FoeSprite.hop = 0.2;
FoeSprite.clubLength = 0.6;
FoeSprite.clubs = new Map();
FoeSprite.landingCache = new Map();

// MARK: The ronin

class HeroSprite extends Node {
  constructor() {
    super();
    this.body = new FigureSprite('hero');
    this.echo = new FigureSprite('hero');
    this.shadow = new Sprite(Art.glow);
    this.aura = new Sprite(Art.glow);
    this.facing = 'right';
    this.pose = F.iai(0); this.poseSheathed = false;
    this.echoPose = F.iai(0); this.echoSheathed = false;
    this.act = 'guarding';
    this.sheathed = true;
    this.victorious = false;
    this.clock = 0;
    this.beats = []; this.beat = 0;
    this.offset = 0;
    this.dart = { from: 0, clock: 1, span: HeroSprite.dartTime };
    this.strain = 0; this.shaken = 0; this.bled = false; this.gasp = 0; this.gasps = 0; this.cycle = 0; this.lastReel = -1;
    this.snap = 0; this.breath = 0; this.flush = 0; this.stain = 0;
    this.gore = true;
    this.ambient = Ambient.plain;
    this.tinted = null;
    this.ronin = 60;
    this.home = { x: 0, y: 0 };
    this.shadow.color = RGB.black; this.shadow.alpha = 0.65; this.shadow.z = -2;
    this.add(this.shadow);
    this.aura.color = Palette.blood; this.aura.blend = BLEND.add; this.aura.alpha = 0; this.aura.z = -1;
    this.add(this.aura);
    this.add(this.echo);
    this.add(this.body);
    this.echo.alpha = 0; this.echo.z = -0.5;
    this.light();
  }

  get drawnFrame() { return this.pose; }

  static impact(style) { return (style === 'nukitsuke' ? HeroSprite.drawTiming : HeroSprite.cutTiming).slice(0, 4).reduce((a, b) => a + b, 0); }
  static strainOf(hp, maxHP) { return hp <= 1 ? 2 : hp * 3 <= maxHP + 1 ? 1 : 0; }

  layout(ronin, home) {
    this.ronin = ronin;
    this.home = home;
    this.draw(this.body, this.pose, this.poseSheathed);
    this.draw(this.echo, this.echoPose, this.echoSheathed);
    this.shadow.size(ronin * 0.9, ronin * 0.13);
    this.aura.size(ronin * 1.7, ronin * 1.7).at(0, ronin * 0.5);
    this.offset = 0;
    this.dart.clock = this.dart.span;
    this.at(home.x, home.y);
  }

  reset(sheathed) {
    this.act = 'guarding';
    this.sheathed = sheathed;
    this.victorious = false;
    this.clock = 0; this.beats = []; this.offset = 0; this.dart.clock = this.dart.span;
    this.flush = 0; this.stain = 0; this.snap = 0; this.shaken = 0; this.bled = false; this.lastReel = -1;
    this.show(sheathed ? F.iai(0) : F.idle(0), false);
    this.tint(Palette.blood, 0);
  }

  face(side) {
    if (side === this.facing) return;
    this.echoPose = this.pose;
    this.echoSheathed = this.poseSheathed;
    this.draw(this.echo, this.echoPose, this.echoSheathed);
    this.echo.xScale = this.body.xScale;
    this.echo.alpha = 0.4;
    this.facing = side;
  }

  get standing() { return this.home.x + this.offset; }
  get ended() { return this.act === 'flourishing' || this.act === 'falling' || this.victorious; }

  play(run) { this.act = 'playing'; this.beats = run; this.beat = -1; this.clock = 0; this.advance(); }

  advance() {
    let t = this.clock, k = 0;
    while (k < this.beats.length && t >= this.beats[k].time) { t -= this.beats[k].time; k++; }
    while (this.beat < Math.min(k, this.beats.length - 1)) { this.beat++; this.enter(this.beats[this.beat]); }
    if (k < this.beats.length || this.act !== 'playing') return;
    const away = this.offset * sideSign(this.facing);
    if (Math.abs(away) > this.ronin * HeroSprite.shuffleReach) {
      this.play(away > 0 ? HeroSprite.backing(HeroSprite.homingTime, true) : HeroSprite.advancing(HeroSprite.homingTime));
    } else if (Math.abs(away) > this.ronin * 0.01) {
      const time = 0.06 + Math.min(Math.abs(away) / this.ronin, 0.4) * 0.2;
      if (away > 0) this.play([beat(F.shuffle(0), time, { keep: 'back' }), beat(F.shuffle(2), time, { home: 'front' })]);
      else this.play([beat(F.shuffle(1), time, { keep: 'front' }), beat(F.shuffle(3), time, { home: 'back' })]);
    } else if (this.victorious) {
      this.conclude(true, 0.25);
    } else {
      this.settle();
    }
  }

  enter(b) {
    const sign = sideSign(this.facing);
    const fw = b.footwork;
    if (fw.keep) {
      const before = HeroSprite.footing(this.pose, this.poseSheathed), after = HeroSprite.footing(b.frame, b.sheathed);
      const step = sign * this.ronin * (fw.keep === 'front' ? before.front.x - after.front.x : before.back.x - after.back.x);
      this.offset += step;
      this.dart.from += step;
    } else if (fw.home) {
      const home = footing('hero', F.idle(0)), after = HeroSprite.footing(b.frame, b.sheathed);
      const to = sign * this.ronin * (fw.home === 'front' ? home.front.x - after.front.x : home.back.x - after.back.x);
      this.dart.from += to - this.offset;
      this.offset = to;
    } else if (fw.thrown !== undefined) {
      this.dart = { from: this.shownOffset, clock: 0, span: fw.over ?? HeroSprite.dartTime };
      this.offset = fw.thrown;
    }
    this.show(b.frame, b.blend, b.sheathed);
    if (b.frame === F.clash(1)) this.snap = -0.8;
    if (this.act === 'flourishing') {
      if (b.frame === F.flourish(3) && this.stain > 0) {
        if (this.gore) this.chiburi();
        this.stain = 0;
      }
      if (b.frame === F.flourish(FrameCounts.flourish - 1)) this.sheathed = true;
    }
  }

  get shownOffset() {
    if (this.dart.clock >= this.dart.span) return this.offset;
    const t = this.dart.clock / this.dart.span;
    return this.dart.from + (this.offset - this.dart.from) * (1 - (1 - t) * (1 - t));
  }

  static lunging(f) {
    const c = frameCase(f), n = frameNums(f);
    if (c === 'cut') return n[1] >= 3;
    if (c === 'chain') return true;
    if (c === 'recover') return n[1] === 2 || n[1] === 4;
    return false;
  }

  cut(side, style, distance, start = 0) {
    if (this.ended) return;
    const chained = this.act === 'playing' && side === this.facing && style !== 'nukitsuke' && HeroSprite.lunging(this.pose);
    this.face(side);
    this.sheathed = false;
    this.snap = 1;
    const reach = Math.min(this.ronin * 0.22, Math.max(0, distance - this.ronin * 0.3) * 0.34);
    const timing = style === 'nukitsuke' ? HeroSprite.drawTiming : HeroSprite.cutTiming;
    const first = Math.min(Math.max(0, start), FrameCounts.cut - 1);
    const run = [];
    for (let k = first; k < FrameCounts.cut; k++) {
      run.push(beat(chained && k < FrameCounts.chain ? F.chain(style, k) : F.cut(style, k), timing[k]));
    }
    let out = sideSign(side) * reach;
    if (chained) {
      const kept = this.offset + sideSign(side) * this.ronin * (footing('hero', this.pose).front.x - footing('hero', run[0].frame).front.x);
      if (sideSign(side) * (out - kept) > this.ronin * 0.05) {
        run[0].footwork = { thrown: out };
      } else {
        run[0].footwork = { keep: 'front' };
        out = kept;
      }
    } else {
      const lunge = timing.slice(first, Math.max(first, FrameCounts.chain)).reduce((a, b) => a + b, 0);
      run[0].footwork = { thrown: out, over: Math.max(HeroSprite.dartTime, lunge) };
    }
    const away = sideSign(side) * out / this.ronin;
    if (away > 0.1) {
      const zanshin = footing('hero', F.cut(style, FrameCounts.cut - 1)), guardFeet = footing('hero', F.idle(0));
      const middling = away + zanshin.back.x < guardFeet.back.x;
      run.push(beat(F.recover(style, 4), 0.03),
        beat(F.recover(style, middling ? 5 : 0), timing[FrameCounts.cut] - 0.02, { keep: 'back' }, true),
        beat(F.recover(style, 1), timing[FrameCounts.cut + 1], { home: 'front' }));
    } else {
      run.push(beat(F.recover(style, 2), timing[FrameCounts.cut], { keep: 'front' }),
        beat(F.recover(style, 3), timing[FrameCounts.cut + 1], { home: 'back' }));
    }
    this.play(run);
  }

  whiff(side, seconds) {
    if (this.ended) return;
    this.face(side);
    this.sheathed = false;
    this.shaken = Math.max(this.shaken, 0.6);
    this.play([beat(F.stumble(0), 0.15, { thrown: sideSign(side) * this.ronin * 0.12 }, true),
      beat(F.stumble(1), Math.max(0.15, seconds - 0.15), { keep: 'back' }, true)]);
  }

  clash(side, style, spot, seconds, forced) {
    if (this.ended) return { impact: 0, settle: 0 };
    this.face(side);
    this.sheathed = false;
    this.snap = 1;
    const sign = sideSign(side);
    const timing = style === 'nukitsuke' ? HeroSprite.drawTiming : HeroSprite.cutTiming;
    const run = [];
    for (let k = 0; k < HeroSprite.swing; k++) run.push(beat(F.cut(style, k), timing[k]));
    const impact = timing.slice(0, HeroSprite.swing).reduce((a, b) => a + b, 0);
    const lunging = sign * (spot - this.offset) > this.ronin * 0.01;
    if (lunging) run[0].footwork = { thrown: spot, over: impact };
    run.push(beat(F.clash(0), forced ? HeroSprite.bindTime : HeroSprite.glanceBind, { thrown: spot }));
    const bound = footing('hero', F.clash(0)), guarded = footing('hero', F.retreat(3));
    const away = (sign * spot + this.ronin * (bound.back.x - guarded.back.x)) / this.ronin;
    const step = RETREAT_STEP;
    if (forced) {
      const slow = Math.min(1.25, Math.max(0.85, seconds / Tuning.parried));
      run.push(beat(F.clash(1), HeroSprite.forcedTime * slow, { keep: 'back' }, true),
        beat(F.retreat(3), HeroSprite.guardTime * slow, { keep: 'back' }, true));
      const steps = Math.abs(away - 2 * step) < Math.abs(away - step) ? 2 : 1;
      for (let k = 0; k < steps; k++) run.push(...HeroSprite.backing(HeroSprite.backingTime * slow));
      this.shaken = Math.max(this.shaken, 1.2);
    } else {
      run.push(beat(F.retreat(2), HeroSprite.glanceDraw, { keep: 'back' }, true),
        beat(F.retreat(3), HeroSprite.glanceDraw, { keep: 'back' }));
      if (Math.abs(away - step) < Math.abs(away)) run.push(...HeroSprite.backing(HeroSprite.glanceStep));
    }
    this.play(run);
    return { impact, settle: lunging ? 0 : HeroSprite.dartTime };
  }

  static backing(time, blend = false) {
    return [beat(F.retreat(0), time, { keep: 'front' }, blend), beat(F.retreat(1), time, { keep: 'front' }),
      beat(F.retreat(2), time, { keep: 'back' }), beat(F.retreat(3), time, { keep: 'back' })];
  }
  static advancing(time) {
    return [beat(F.retreat(2), time, { keep: 'back' }, true), beat(F.retreat(1), time, { keep: 'back' }),
      beat(F.retreat(0), time, { keep: 'front' }), beat(F.retreat(3), time, { keep: 'front' })];
  }

  repel(side, seconds) {
    if (this.ended) return;
    this.face(side);
    this.sheathed = false;
    this.snap = -0.8;
    this.shaken = Math.max(this.shaken, 1.2);
    this.play([beat(F.repelled(0), 0.14, { thrown: this.offset - sideSign(side) * this.ronin * 0.1 }, true),
      beat(F.repelled(1), Math.max(0.16, seconds - 0.14), { keep: 'front' }, true)]);
  }

  hurt(attacker = null) {
    if (this.ended) return;
    if (attacker) this.face(attacker);
    this.flush = 0.85; this.snap = -1; this.shaken = 2.2; this.bled = true;
    const slow = this.strain === 0 ? 1.0 : this.strain === 1 ? 1.15 : 1.3;
    if (this.sheathed) {
      this.play([beat(F.hurt(0), 0.07, {}, true, true), beat(F.hurt(1), 0.1 * slow, {}, false, true), beat(F.hurt(2), 0.15 * slow, {}, true, true)]);
      return;
    }
    const knock = this.offset - sideSign(this.facing) * this.ronin * 0.07;
    const weights = this.strain === 0 ? [0.45, 0.4, 0.15] : this.strain === 1 ? [0.3, 0.35, 0.35] : [0.2, 0.3, 0.5];
    let way = 0, roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    while (way < weights.length - 1 && roll >= weights[way]) { roll -= weights[way]; way++; }
    if (way === this.lastReel && Math.random() < 0.6) way = (way + 1 + randInt(0, 1)) % 3;
    this.lastReel = way;
    let run;
    if (way === 0) {
      run = [beat(F.hurt(0), 0.07, { thrown: knock }, true), beat(F.hurt(1), 0.1, { keep: 'front' }), beat(F.hurt(2), 0.15, { keep: 'front' }, true)];
    } else if (way === 1) {
      run = [beat(F.reel(0, 0), 0.07, { thrown: knock }, true), beat(F.reel(0, 1), 0.1, { keep: 'front' }),
        beat(F.reel(0, 2), 0.11, { keep: 'back' }), beat(F.reel(0, 3), 0.16, { keep: 'back' }, true)];
    } else {
      run = [beat(F.reel(1, 0), 0.07, { thrown: this.offset - sideSign(this.facing) * this.ronin * 0.04 }, true), beat(F.reel(1, 1), 0.1, { keep: 'front' }),
        beat(F.reel(1, 2), 0.24, { keep: 'front' }), beat(F.reel(1, 3), 0.12, { keep: 'front' }, true)];
    }
    for (let k = 1; k < run.length; k++) run[k].time *= slow;
    this.play(run);
  }

  bloodied(amount, most = 0.14) { this.stain = Math.max(this.stain, Math.min(most, this.stain + amount)); }

  finish(victory) {
    this.flush = 0;
    if (victory && this.act === 'playing' && this.beats.length && HeroSprite.swinging(this.beats[0].frame)) {
      this.victorious = true;
      return;
    }
    this.conclude(victory, 0);
  }
  static swinging(f) { const c = frameCase(f); return c === 'cut' || c === 'chain'; }

  conclude(victory, time) {
    this.victorious = false;
    this.flush = 0;
    const feet = HeroSprite.footing(this.pose, this.poseSheathed);
    if (victory) {
      this.act = 'flourishing';
      const planted = feet.front.y <= feet.back.y ? 'front' : 'back';
      const timing = HeroSprite.flourishTiming;
      this.beats = [...Array(FrameCounts.flourish).keys()].map((k) =>
        beat(F.flourish(k), k === 0 ? 0.25 + timing[0] : k < timing.length ? timing[k] : Infinity, { keep: k === 0 ? planted : 'front' }, k !== 2 && k !== 3));
    } else {
      this.act = 'falling';
      const braced = feet.back.y < 0.04 ? 'back' : 'front';
      const starts = HeroSprite.fallTiming;
      const footwork = [{ keep: braced }, { keep: 'front' }, { keep: 'back' }, { keep: 'back' }, {}];
      this.beats = [...Array(FrameCounts.fall).keys()].map((k) =>
        beat(F.fall(k), k + 1 < starts.length ? starts[k + 1] - starts[k] : Infinity, footwork[Math.min(k, footwork.length - 1)], true, this.sheathed));
    }
    this.beat = -1;
    this.clock = time;
    this.advance();
  }

  chiburi() {
    if (!this.parent) return;
    const sign = this.facing === 'right' ? 1 : -1;
    const spray = burst(Palette.blood.mix(RGB.black, 0.2), { count: Math.floor(20 + this.stain * 60), speed: this.ronin * 2.2, size: this.ronin * 0.05,
      life: 0.45, spread: 0.5, angle: sign > 0 ? -0.35 : Math.PI + 0.35, gravity: this.ronin * 7, additive: false });
    spray.at(this.home.x + this.offset + sign * this.ronin * 0.45, this.home.y + this.ronin * 0.42);
    this.parent.add(spray);
  }

  settle() {
    this.act = 'guarding';
    this.beats = [];
    this.offset = 0;
    this.dart.clock = this.dart.span;
    if (this.strain > 0 || this.shaken > 0) this.freshBreath();
    const look = this.stance;
    this.show(look.frame, true, look.sheathed);
  }

  freshBreath() { this.gasp = (Math.floor(Math.floor(this.gasp) / FrameCounts.winded) + 1) * FrameCounts.winded; }

  get stance() {
    if (!(this.strain > 0 || this.shaken > 0)) {
      return this.sheathed ? { frame: F.iai(Math.floor(this.breath * 5) % FrameCounts.iai), sheathed: false }
        : { frame: F.idle(Math.floor(this.breath * 8) % FrameCounts.heroIdle), sheathed: false };
    }
    const round = Math.floor(Math.floor(this.gasp) / FrameCounts.winded);
    if (round !== this.gasps || (this.strain === 0 && (this.cycle === 2 || (!this.bled && this.cycle !== 0))) || (!this.gore && this.cycle === 1)) {
      this.gasps = round;
      const weights = this.strain > 1 ? [0.3, 0.35, this.cycle === 2 ? 0.1 : 0.35]
        : this.strain === 1 ? [0.45, 0.4, this.cycle === 2 ? 0.05 : 0.15] : this.bled ? [0.6, 0.4, 0] : [1, 0, 0];
      if (!this.gore) weights[1] = 0;
      let next = 0, roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      while (next < weights.length - 1 && roll >= weights[next]) { roll -= weights[next]; next++; }
      this.cycle = next;
    }
    return { frame: F.winded(this.cycle, Math.floor(this.gasp) % FrameCounts.winded), sheathed: this.sheathed };
  }

  tint(color, amount) {
    if (this.tinted && this.tinted.color === color && this.tinted.amount === amount) return;
    this.tinted = { color, amount };
    const drawn = this.ambient.with(color, amount);
    this.body.setTint(drawn.color, drawn.amount);
  }
  light() {
    this.shadow.color = this.ambient.ghost.scaled(0.5);
    this.echo.silhouette = this.ambient.ghost;
    const last = this.tinted || { color: Palette.blood, amount: 0 };
    this.tinted = null;
    this.tint(last.color, last.amount);
  }
  setAmbient(a) { if (a !== this.ambient) { this.ambient = a; this.light(); } }

  show(frame, blend, look = false) {
    if (frame === this.pose && look === this.poseSheathed) return;
    if (!look && Figures.smeared('hero', frame)) {
      this.echo.alpha = 0;
    } else if (blend) {
      this.echoPose = this.pose;
      this.echoSheathed = this.poseSheathed;
      this.draw(this.echo, this.echoPose, this.echoSheathed);
      this.echo.xScale = this.body.xScale;
      this.echo.alpha = 0.4;
    }
    this.pose = frame;
    this.poseSheathed = look;
    this.draw(this.body, frame, look);
  }

  draw(sprite, frame, look) {
    if (look) sprite.applyPiece(HeroSprite.sheathedPiece(frame), this.ronin);
    else sprite.apply(frame, this.ronin);
  }

  static footing(frame, look) {
    if (look && HeroSprite.afoot(frame)) return footing('hero', F.iai(0));
    return footing('hero', frame);
  }
  static afoot(f) { return frameCase(f) === 'fall' ? frameNums(f)[0] === 0 : true; }

  /** One of his frames drawn with the blade kept in its scabbard (HeroSprite.sheathedPiece), if the core can draw it. */
  static sheathedPiece(frame) {
    let p = HeroSprite.sheathedPieces.get(frame);
    if (p) return p;
    const core = Figures.core;
    if (core) p = new Piece(core.sketch('hero', frame, { sheathed: true }));
    else p = Figures.piece('hero', frame);
    HeroSprite.sheathedPieces.set(frame, p);
    return p;
  }

  updateHero(dt, bloodlust) {
    this.breath += dt;
    this.clock += dt;
    this.dart.clock += dt;
    this.gasp += dt * (this.strain > 1 ? 10.5 : 8.5);
    if (this.shaken > 0 && this.act === 'guarding') this.shaken -= dt;
    if (this.shaken <= 0) this.bled = false;
    if (this.act === 'guarding') {
      if ((this.strain > 0 || this.shaken > 0) && frameCase(this.pose) !== 'winded') this.freshBreath();
      const look = this.stance;
      let blend = false;
      const a = frameCase(this.pose) === 'winded', b = frameCase(look.frame) === 'winded';
      if (a && b) blend = frameNums(this.pose)[0] !== frameNums(look.frame)[0] || this.poseSheathed !== look.sheathed;
      else if (a || b) blend = true;
      this.show(look.frame, blend, look.sheathed);
    } else {
      this.advance();
    }
    if (this.echo.alpha > 0) this.echo.alpha = Math.max(0, this.echo.alpha - dt / 0.12 * 0.45);
    this.at(this.home.x + this.shownOffset, this.home.y);
    this.snap *= Math.exp(-dt * 16);
    const sign = this.facing === 'right' ? 1 : -1;
    this.body.xScale = sign * (1 + 0.05 * this.snap);
    this.body.yScale = 1 - 0.035 * this.snap;
    if (this.flush > 0) this.flush = Math.max(0, this.flush - dt * 4);
    const blood = this.gore ? this.stain : 0;
    if (this.flush > blood) {
      if (this.gore) this.tint(Palette.blood, this.flush); else this.tint(this.ambient.light, this.flush * 0.6);
    } else {
      this.tint(HeroSprite.stainColor, blood);
    }
    const target = bloodlust && !this.ended ? 0.55 + 0.2 * Math.sin(this.breath * 9) : 0;
    this.aura.alpha += (target - this.aura.alpha) * Math.min(1, dt * 8);
  }
}
HeroSprite.dartTime = 0.04;
HeroSprite.cutTiming = [0.016, 0.017, 0.018, 0.02, 0.024, 0.04, 0.045, 0.05, 0.08, 0.065, 0.065];
HeroSprite.drawTiming = [0.028, 0.024, 0.024, 0.022, 0.022, 0.04, 0.045, 0.05, 0.085, 0.07, 0.07];
HeroSprite.flourishTiming = [0.12, 0.16, 0.05, 0.12, 0.26, 0.26];
HeroSprite.fallTiming = [0, 0.14, 0.34, 1.05, 1.22];
HeroSprite.swing = 4;
HeroSprite.bindTime = 0.07;
HeroSprite.glanceBind = 0.055;
HeroSprite.forcedTime = 0.08;
HeroSprite.guardTime = 0.05;
HeroSprite.backingTime = 0.05;
HeroSprite.glanceDraw = 0.045;
HeroSprite.glanceStep = 0.04;
HeroSprite.shuffleReach = 0.25;
HeroSprite.homingTime = 0.055;
HeroSprite.sheathedPieces = new Map();
HeroSprite.stainColor = Palette.blood.mix(RGB.black, 0.55);

/** A beat of the ronin's: a frame, how long it shows, how it moves his feet, whether it blends, and whether the
 *  blade is kept sheathed in it. */
function beat(frame, time, footwork = {}, blend = false, sheathed = false) { return { frame, time, footwork, blend, sheathed }; }

// MARK: An arrow

class ArrowSprite extends Sprite {
  constructor(arrow, ronin) {
    super(Art.arrow, ronin * 0.42, ronin * 0.09);
    this.id = arrow.id;
    this.deflected = false;
    this.color = Palette.silhouette;
    this.trail = tintedSprite(Art.streak, rgb(1, 0.85, 0.75), ronin * 0.7, ronin * 0.14);
    this.trail.ax = 1; this.trail.ay = 0.5;
    this.trail.at(-this.w * 0.4, 0);
    this.trail.alpha = 0.45;
    this.trail.blend = BLEND.add;
    this.add(this.trail);
    this.tip = tintedSprite(Art.glow, Palette.blood, ronin * 0.28, ronin * 0.28);
    this.tip.at(this.w * 0.45, 0);
    this.tip.blend = BLEND.add;
    this.tip.alpha = 0.9;
    this.add(this.tip);
  }
  updateArrow(arrow, x, y) {
    this.at(x, y);
    this.xScale = arrow.velocity > 0 ? 1 : -1;
    if (arrow.deflected && !this.deflected) {
      this.deflected = true;
      this.color = Palette.gold;
      this.blend = BLEND.add;
      this.trail.color = Palette.gold;
      this.trail.alpha = 0.9;
      this.trail.w *= 2;
      this.tip.color = Palette.gold;
    }
  }
}

// MARK: The flung gourd

class GourdSprite extends Node {
  constructor(from, start, side, ronin) {
    super();
    this.from = from;
    this.start = start;
    this.size = Math.max(10, ronin * 0.22);
    this.spin = side === 'right' ? -7 : 7;
    this.age = 0;
    this.halo = tintedSprite(Art.glow, Palette.jade, this.size * 2.6, this.size * 2.6);
    this.halo.blend = BLEND.add;
    this.halo.alpha = 0.45;
    this.add(this.halo);
    this.turning = new Node();
    this.turning.add(Icons.gourd(this.size, Palette.jade.mix(RGB.white, 0.25).css()));
    this.add(this.turning);
    this.glint = tintedSprite(Art.glow, RGB.white, this.size * 1.2, this.size * 1.2);
    this.glint.blend = BLEND.add;
    this.glint.alpha = 0;
    this.glint.at(this.size * 0.12, this.size * 0.18);
    this.glint.z = 1;
    this.add(this.glint);
    this.mark = new Shape(ellipsePath(-this.size * 0.8, -this.size * 0.16, this.size * 1.6, this.size * 0.32));
    this.mark.lineWidth = 1.2;
    this.mark.strokeColor = Palette.jade.mix(RGB.white, 0.2).css();
    this.mark.fillColor = Palette.jade.css(0.15);
    this.mark.alpha = 0;
    this.at(start.x, start.y);
  }
  updateGourd(g, land, ground, ronin, ceiling, calm, dt) {
    this.age += dt;
    const p = g.progress;
    const rest = ground + this.size * 0.5;
    const y = rest + (this.start.y - rest) * (1 - p) + ronin * GourdSprite.rise * 4 * p * (1 - p);
    this.at(this.start.x + (land - this.start.x) * p, Math.min(y, ceiling - this.size * 0.6));
    this.turning.rotation = (calm ? 0.35 : 1) * this.spin * p * g.span;
    this.mark.at(land, ground);
    const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(this.age * 26);
    if (g.catchable) {
      this.halo.alpha = 0.95;
      this.halo.setScale(1.5 + 0.2 * pulse);
      this.glint.alpha = 0.4 + 0.6 * pulse;
      this.mark.alpha = 1;
      this.mark.fillColor = Palette.jade.css(0.2 + 0.25 * pulse);
    } else {
      this.halo.alpha = 0.45;
      this.halo.setScale(1);
      this.glint.alpha = 0.15 * p;
      this.mark.alpha = 0.2 + 0.5 * p;
      this.mark.fillColor = Palette.jade.css(0.15);
    }
  }
}
GourdSprite.rise = 0.85;
