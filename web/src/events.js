// events.js: the rest of DuelScene.swift: the cards (a stage's title card, the end card, the words slammed onto the
// lane, the mouse hints), and what the scene does with each of the fight's events: the cuts and the blood, the clash
// on the warlord's blade, the brute's club, the gourd, the shards, the dead, and the end of a stage.

Object.defineProperties(DuelScene.prototype, Object.getOwnPropertyDescriptors({
  // MARK: Cards

  /** The stage's title card: its number, the mode and the setting, and a line on each thing to learn here. */
  introduce(fight) {
    const fs = this.fs;
    const card = new Node();
    // The words are the core's (the stage's card as the app builds it); the pictograms are drawn here.
    const given = this.session.card(fight.stage) || { title: `STAGE ${fight.stage}`, lines: [], endless: this.session.isEndless, crest: false,
      subtitle: (ModeInfo[fight.mode] || ModeInfo.bushido).title.toUpperCase() + '   ·   ' + SettingNames[fight.setting].toUpperCase() };
    const lines = [];
    for (const line of given.lines || []) {
      let icon;
      switch (line.icon) {
        case 'buttons':
          if (line.unlessHintShown && (Prefs.hintShown || Prefs.floorHints)) continue;
          icon = Icons.buttons(15 * fs, Palette.ink.css(), Palette.gold.css());
          break;
        case 'figure': {
          // On the dark plate the silhouette is drawn light, in the gold of the tip.
          const figure = new FigureSprite(line.kind);
          figure.apply(F.idle(0), 20 * fs);
          figure.setTint(Palette.gold, 1);
          figure.at(0, -9 * fs);
          icon = new Node();
          icon.add(figure);
          break;
        }
        case 'crest': icon = Icons.crest(16 * fs); break;
        case 'gourd': icon = Icons.gourd(15 * fs, Palette.jade.mix(RGB.white, 0.25).css()); break;
        case 'infinity': icon = Icons.infinity(15 * fs, Palette.gold.css()); break;
        case 'shards': {
          icon = new Node();
          for (let k = 0; k < Tuning.shardsPerHeart; k++) {
            const piece = Icons.shard(15 * fs, Math.min(k, 2));
            piece.fillColor = Palette.gold.css();
            piece.strokeColor = Palette.gold.mix(RGB.white, 0.45).css();
            icon.add(piece);
          }
          break;
        }
        default: icon = new Node();
      }
      lines.push({ icon, text: line.text || null });
    }
    const newcomer = given.crest ? null : introduces(fight.stage);
    const tall = (50 + 18 * lines.length) * fs;
    const plate = card.add(Icons.band(Math.min(this.field.w, 340 * fs), tall));
    plate.z = -0.1;
    const top = tall / 2;
    const title = card.add(new Label(Fonts.heading, 23 * fs, '#fff'));
    title.set(given.title || `STAGE ${fight.stage}`, 5 * fs);
    title.at(0, top - 16 * fs);
    if (given.endless ?? this.session.isEndless) card.add(Icons.infinity(18 * fs, Palette.gold.css())).at(-title.width / 2 - 16 * fs, title.y);
    const sub = card.add(new Label(Fonts.text, 10.5 * fs, Palette.ink.css(0.85)));
    sub.set(given.subtitle, 2 * fs);
    sub.at(9 * fs, top - 34 * fs);
    card.add(Icons.seal(fight.mode, 13 * fs)).at(sub.x - sub.width / 2 - 12 * fs, sub.y);
    lines.forEach((line, k) => {
      const row = card.add(new Node()).at(0, top - (54 + 18 * k) * fs);
      if (line.text) {
        const tip = new Label(Fonts.italic, 11 * fs, Palette.gold.css(), 'left');
        tip.set(line.text, 1.2 * fs);
        const width = tip.width + 26 * fs;
        line.icon.at(-width / 2 + 8 * fs, line.icon.y);
        tip.at(-width / 2 + 22 * fs, 0);
        row.add(tip);
      }
      row.add(line.icon);
    });
    if (given.crest ?? (!newcomer && fight.isBossStage)) card.add(Icons.crest(14 * fs)).at(0, -top - 4 * fs);
    const holder = new Node();
    holder.at(this.field.x + this.field.w / 2, this.field.y + this.field.h * 0.6);
    holder.add(card);
    this.overlay.add(holder);
    this.introCard = holder;
    this.introFs = fs;
    card.alpha = 0;
    card.setScale(1.12);
    const hold = 1.1 + 0.8 * lines.length;
    card.run(A.seq(A.group(A.fadeIn(0.18), A.scaleTo(1, 0.22)).easedOut(), A.wait(hold), A.group(A.fadeOut(0.3), A.scaleTo(0.96, 0.3))));
    holder.run(A.seq(A.wait(0.22 + hold + 0.3), A.remove()));
  },

  mouseHint(side) {
    const fs = this.fs;
    const node = new Node();
    node.add(Icons.band(56 * fs, 28 * fs, 0.75));
    node.add(Icons.mouse(20 * fs, side, Palette.ink.css())).at(-sideSign(side) * 7 * fs, 0);
    const arrow = node.add(Icons.play(10 * fs, Palette.gold.css())).at(sideSign(side) * 11 * fs, 0);
    arrow.xScale = side === 'left' ? -1 : 1;
    return node;
  },

  showHintIfNeeded() {
    if (this.hint) this.hint.remove();
    this.hint = null;
    if (!Prefs.floorHints || Prefs.hintShown || this.session.fight.outcome) return;
    this.hintSides = new Set();
    const node = new Node();
    node.z = 55;
    for (const side of ['left', 'right']) {
      const mouse = node.add(this.mouseHint(side));
      mouse.name = side;
      mouse.at(this.laneX(sideSign(side) * 0.62), this.groundY + this.ronin * 0.2);
      mouse.run(A.forever(A.seq(A.fadeTo(0.45, 0.8), A.fadeTo(1, 0.8))));
    }
    this.root.add(node);
    this.hint = node;
  },

  refreshHints() {
    this.showHintIfNeeded();
    if (this.hint) this.hint.hidden = this.isCompact;
    this.refreshHUD();
  },

  teach(side) {
    this.overlay.childNamed('teach')?.remove();
    const mouse = this.mouseHint(side);
    mouse.name = 'teach';
    mouse.at(this.laneX(sideSign(side) * 0.62), this.groundY + this.ronin * 0.2);
    mouse.alpha = 0;
    this.overlay.add(mouse);
    mouse.run(A.seq(A.fadeIn(0.12), A.wait(1.3), A.fadeOut(0.3), A.remove()));
  },

  noteKill(side) {
    if (Prefs.hintShown) return;
    this.hintSides.add(side);
    this.hint?.childNamed(side)?.run(A.seq(A.fadeOut(0.3), A.remove()));
    if (this.hintSides.size < 2) return;
    Prefs.hintShown = true;
    this.hint?.run(A.seq(A.wait(0.3), A.remove()));
    this.hint = null;
  },

  /** Big text slammed onto the lane, on a dark plate, with an optional pictogram before it. */
  slam(text, color, icon = null, hold = 0.65) {
    const fs = this.fs;
    if (this.slamNode) {
      const old = this.slamNode;
      old.removeAllActions();
      old.run(A.seq(A.fadeOut(0.08), A.remove()));
    }
    const node = new Node();
    node.at(this.field.x + this.field.w / 2, DuelScene.slamY(this.field, this.top, fs, !!this.session.fight.boss));
    const label = new Label(Fonts.heading, 20 * fs, color.css());
    label.set(text, 4 * fs);
    const iconWidth = icon ? 24 * fs : 0;
    const plate = node.add(Icons.band(label.width + iconWidth + 90 * fs, 32 * fs));
    plate.z = -0.2;
    const glow = node.add(tintedSprite(Art.glow, color, label.width * 2, 60 * fs));
    glow.blend = BLEND.add;
    glow.alpha = 0.3;
    glow.z = -0.4;
    label.at(iconWidth / 2, 0);
    label.z = 0.2;
    node.add(label);
    if (icon) { icon.at(-label.width / 2 - 2 * fs, 0); icon.z = 0.2; node.add(icon); }
    node.setScale(this.calm ? 1.15 : 2.2);
    node.alpha = 0;
    this.slams.add(node);
    this.slamNode = node;
    node.run(A.seq(A.group(A.scaleTo(1, 0.12), A.fadeIn(0.08)).easedIn(), A.wait(hold), A.group(A.fadeOut(0.3), A.scaleTo(1.08, 0.3)), A.remove()));
  },

  // MARK: Events

  handle(event) {
    const fight = this.session.fight;
    switch (event.type) {
      case 'cut': case 'whiff': case 'deflected': case 'parried': case 'turned': case 'wounded': this.letGoOfBind(); break;
    }
    switch (event.type) {
      case 'cut': return this.onCut(event);
      case 'whiff': return this.onWhiff(event, fight);
      case 'deflected': return this.onDeflected(event, fight);
      case 'loosed': this.foeSprites.get(event.archer)?.showStrike(); return;
      case 'pierced': return this.onPierced(event);
      case 'parried': return this.onParried(event, fight);
      case 'turned': return this.onTurned(event);
      case 'summoned': return this.onSummoned(event);
      case 'flung': return this.fling(event.foe);
      case 'healed': return this.catchGourd(event.foe, event.restored);
      case 'shattered': return this.shatter(event.foe);
      case 'fled': { const s = this.foeSprites.get(event.foe); if (s) this.lostGourd(s.x); return; }
      case 'shard': return this.earnShard(event.foe, event.count);
      case 'mended': return this.mend(event.restored);
      case 'scattered': return this.scatterShards();
      case 'wounded': return this.onWounded(event, fight);
      case 'leapt': {
        const dust = () => {
          const s = this.foeSprites.get(event.foe);
          if (!s) return;
          this.fx.add(burst(this.look.ground.mix(RGB.white, 0.35), { count: 12, speed: this.ronin * 0.8, size: this.ronin * 0.1, life: 0.35,
            spread: 1.2, angle: Math.PI / 2, additive: false })).at(s.x, this.groundY + 2);
        };
        const wait = (this.heldUntil.get(event.foe) ?? 0) - this.clock;
        if (wait > 0) this.later(wait, dust); else dust();
        return;
      }
      case 'landed': {
        const s = this.foeSprites.get(event.foe);
        if (s) {
          this.fx.add(burst(this.look.ground.mix(RGB.white, 0.35), { count: 14, speed: this.ronin * 0.9, size: this.ronin * 0.1, life: 0.35,
            spread: 1.4, angle: Math.PI / 2, additive: false })).at(s.x, this.groundY + 2);
          if (s.kind === 'warlord') this.shake(2);
        }
        return;
      }
      case 'bloodlust':
        if (event.on) {
          this.slam('BLOODLUST', Palette.blood.mix(RGB.white, 0.45), null, 0.5);
          this.fx.add(shockwave(Palette.blood, { radius: this.ronin * 0.3, grow: 5, width: 3, duration: 0.5 })).at(this.hero.standing, this.groundY + this.ronin * 0.5);
          this.shake(2.5);
        }
        return;
      case 'milestone':
        this.slam(`${event.combo ?? event.count} HITS`, Palette.gold, Icons.swords(18 * this.fs, Palette.gold.css()), 0.5);
        this.slowmo = 0.3;
        this.world.speed = 0.4;
        this.fx.add(shockwave(Palette.gold, { radius: this.ronin * 0.3, grow: 6, width: 2.5, duration: 0.6 })).at(this.hero.standing, this.groundY + this.ronin * 0.5);
        return;
      case 'warlord':
        this.slam('WARLORD', Palette.gold, Icons.crest(20 * this.fs));
        this.shake(4);
        this.flashLane(0.25, 0.8);
        return;
      case 'ended':
        return this.finish(event.outcome);
      default:
        return;
    }
  },

  onCut({ side, foe: id, killed }) {
    const sprite = this.foeSprites.get(id);
    if (!sprite) return;
    const distance = Math.abs(sprite.x - this.heroX);
    const style = this.chooseCut(sprite.kind, distance);
    const target = { x: sprite.x, y: this.groundY + sprite.height * DuelScene.heightOf(style) };
    if (style === 'nukitsuke') this.drawFlash(side);
    this.hero.cut(side, style, distance);
    this.dash(sprite.x, side);
    const delay = HeroSprite.impact(style);
    this.swingUntil = this.clock + delay;
    if (killed) {
      this.foeSprites.delete(id);
      this.killSpots.set(id, { x: sprite.x, y: this.groundY + sprite.height * 0.62 });
      if (sprite.gourd) {
        this.gourdSpots.set(id, { x: sprite.x, y: sprite.y + sprite.height * 1.12 });
        sprite.dropGourd();
      }
      const variant = randInt(0, FrameCounts.struckVariants - 1);
      sprite.freezeStruck(struckPiece(sprite.cast, variant));
      this.noteKill(side);
      this.later(delay, () => {
        const gash = this.sever(sprite, side, style, variant);
        this.slash({ x: target.x, y: gash.y }, side, style, true);
        if (style === 'nukitsuke') this.focus(gash, this.ronin * 2.8, RGB.white, 0.5);
      });
    } else {
      sprite.hold(delay);
      this.heldUntil.set(id, this.clock + delay);
      this.later(delay, () => {
        this.slash(target, side, style, false);
        sprite.flashHit();
        sprite.showStagger();
        const gore = this.gore;
        this.carnage.gore = gore;
        const away = side === 'right' ? 0.35 : Math.PI - 0.35;
        if (gore.on) {
          sprite.gash(DuelScene.slopeOf(style), DuelScene.heightOf(style), gore);
          this.spray(Palette.blood, target, { count: 22, speed: 2.2, size: 0.07, life: 0.45, spread: 1.0, angle: away, gravity: 5 });
          this.carnage.spatter(sprite.x, 4);
        }
        if (sprite.kind === 'brute' || sprite.kind === 'warlord' || !gore.on) {
          this.fx.add(burst(Palette.steel, { count: 12, speed: this.ronin * 2.4, size: this.ronin * 0.07, life: 0.22, spread: 1.3, angle: side === 'right' ? 0 : Math.PI })).at(target.x, target.y);
        }
        this.hitStop = Math.max(this.hitStop, 0.05);
        this.shake(1.8);
        this.punch(0.018, target);
      });
    }
  },

  onWhiff({ side }, fight) {
    this.hero.whiff(side, fight.stumble || Tuning.stumble);
    const arc = tintedSprite(Art.crescent, rgb(0.7, 0.7, 0.7), this.ronin * 0.8, this.ronin * 0.8);
    arc.at(this.heroX + sideSign(side) * this.ronin * 0.42, this.groundY + this.ronin * 0.5);
    arc.xScale = side === 'right' ? 1 : -1;
    arc.alpha = 0.35;
    arc.run(A.seq(A.group(A.fadeOut(0.25), A.scaleBy(1.1, 0.25)), A.remove()));
    this.fx.add(arc);
    this.fx.add(burst(this.look.ground.mix(RGB.white, 0.4), { count: 10, speed: this.ronin * 0.5, size: this.ronin * 0.1, life: 0.4,
      spread: 0.8, angle: Math.PI / 2, additive: false })).at(this.heroX + sideSign(side) * this.ronin * 0.2, this.groundY + 2);
    const miss = Icons.cross(this.ronin * 0.2, 'rgb(217,217,217)');
    miss.at(this.heroX, this.groundY + this.ronin * 1.2);
    miss.setScale(0.4);
    this.overlay.add(miss);
    miss.run(A.seq(A.scaleTo(1, 0.08), A.wait(0.25), A.group(A.fadeOut(0.25), A.moveBy(0, 6, 0.25)), A.remove()));
    if (!Prefs.floorHints && !Prefs.hintShown && fight.target(opposite(side)) !== null) this.teach(opposite(side));
  },

  onDeflected({ side, arrow: id }, fight) {
    const s = this.arrowSprites.get(id);
    const p = s ? { x: s.x, y: s.y } : { x: this.heroX + sideSign(side) * this.ronin * 0.5, y: this.groundY + this.ronin * 0.6 };
    const style = this.chooseCut(null, Math.abs(p.x - this.heroX));
    if (style === 'nukitsuke') this.drawFlash(side);
    this.hero.cut(side, style, Math.abs(p.x - this.heroX), 4);
    this.swingUntil = this.clock;
    this.slash(p, side, style, false);
    this.fx.add(burst(Palette.gold, { count: 24, speed: this.ronin * 2.6, size: this.ronin * 0.09, life: 0.35 })).at(p.x, p.y);
    this.fx.add(shockwave(Palette.gold, { radius: this.ronin * 0.12, grow: 3, width: 2, duration: 0.3 })).at(p.x, p.y);
    this.hitStop = Math.max(this.hitStop, 0.05);
    this.shake(1);
    const arrow = fight.arrows.find((a) => a.id === id);
    if (s && arrow) s.updateArrow(arrow, p.x, p.y);
  },

  onPierced({ foe: id, arrow: arrowID, killed }) {
    const as = this.arrowSprites.get(arrowID);
    const p = as ? { x: as.x, y: as.y } : null;
    if (as) { as.remove(); this.arrowSprites.delete(arrowID); }
    const sprite = this.foeSprites.get(id);
    if (!sprite) return;
    const side = sprite.x < this.heroX ? 'left' : 'right';
    if (p) {
      this.fx.add(burst(Palette.gold, { count: 22, speed: this.ronin * 2, size: this.ronin * 0.09, life: 0.3 })).at(p.x, p.y);
      this.fx.add(shockwave(Palette.gold, { radius: this.ronin * 0.1, grow: 3.5, width: 2, duration: 0.3 })).at(p.x, p.y);
    }
    if (killed) { this.sever(sprite, side, null); this.noteKill(side); } else { sprite.flashHit(); sprite.showStagger(); }
  },

  onParried({ side, foe: id }, fight) {
    const parried = fight.isStumbling;
    const sprite = this.foeSprites.get(id);
    if (!sprite) { if (parried) this.hero.repel(side, fight.stumble); return; }
    const x = sprite.standing;
    const style = this.chooseCut(sprite.kind, Math.abs(x - this.heroX), true);
    if (style === 'nukitsuke') this.drawFlash(side);
    const spot = x - sideSign(side) * clashGap() * this.ronin - this.heroX;
    const timing = this.hero.clash(side, style, spot, fight.stumble || Tuning.parried, parried);
    this.swingUntil = this.clock + timing.impact + timing.settle;
    this.bind = { foe: id, side, parried, spot };
    this.bindShown = this.hero.drawnFrame;
    sprite.bind(F.block);
    const mine = contactPoint('hero', F.clash(0));
    if (mine) this.dash(this.heroX + spot + sideSign(side) * mine.x * this.ronin, side);
  },

  onTurned({ side, foe: id }) {
    const sprite = this.foeSprites.get(id);
    if (!sprite) return;
    const distance = Math.abs(sprite.x - this.heroX);
    const style = this.chooseCut(sprite.kind, distance);
    if (style === 'nukitsuke') this.drawFlash(side);
    this.hero.cut(side, style, distance);
    this.dash(sprite.x, side);
    const delay = HeroSprite.impact(style);
    this.swingUntil = this.clock + delay;
    sprite.hold(delay);
    this.heldUntil.set(id, this.clock + delay);
    this.later(delay, () => this.clubMet(sprite, id, side));
  },

  onSummoned({ foe: id }) {
    const sprite = this.foeSprites.get(id);
    if (sprite) this.fx.add(shockwave(Palette.blood, { radius: this.ronin * 0.2, grow: 6, width: 3, duration: 0.5 })).at(sprite.x, this.groundY + sprite.height * 0.6);
    for (const x of [this.field.x, this.field.x + this.field.w]) {
      const edge = tintedSprite(Art.glow, Palette.blood, this.ronin * 1.4, this.field.h * 1.4);
      edge.at(x, this.field.y + this.field.h / 2);
      edge.blend = BLEND.add;
      edge.alpha = 0;
      edge.run(A.seq(A.fadeTo(this.calm ? 0.22 : 0.6, this.calm ? 0.25 : 0.08), A.fadeOut(0.7), A.remove()));
      this.fx.add(edge);
    }
    this.shake(3);
  },

  onWounded({ foe, damage }, fight) {
    let fromX = foe !== null && foe !== undefined ? this.foeSprites.get(foe)?.x : undefined;
    if (fromX === undefined) {
      for (const [id, s] of this.arrowSprites) {
        if (!s.deflected && !fight.arrows.some((a) => a.id === id)) {
          fromX = s.x;
          s.remove();
          this.arrowSprites.delete(id);
          break;
        }
      }
    }
    const attacker = fromX === undefined ? null : fromX < this.heroX ? 'left' : 'right';
    const p = { x: this.hero.standing, y: this.groundY + this.ronin * 0.55 };
    this.hero.strain = HeroSprite.strainOf(fight.hp, fight.maxHP);
    this.hero.hurt(attacker);
    if (foe !== null && foe !== undefined) this.foeSprites.get(foe)?.showStrike();
    const gore = this.gore;
    this.carnage.gore = gore;
    const from = attacker === 'left' ? 0.2 : Math.PI - 0.2;
    if (gore.on) {
      this.flashLane(damage > 1 ? 0.55 : 0.42, 0.45);
      this.spray(Palette.blood, p, { count: 30 + 12 * damage, speed: 2.2, size: 0.08, life: 0.55, spread: 1.6, angle: from, gravity: 5 });
      this.carnage.spatter(p.x, 8);
      this.splatter(damage > 1 ? 3 : 2);
    } else {
      this.flashLane(damage > 1 ? 0.26 : 0.2, 0.35, Palette.ink);
      this.fx.add(burst(Palette.steel, { count: 14 + 6 * damage, speed: this.ronin * 2.4, size: this.ronin * 0.07, life: 0.24, spread: 1.4, angle: from })).at(p.x, p.y);
    }
    this.focus(p, this.ronin * 3, gore.on ? Palette.blood.mix(RGB.white, 0.2) : RGB.white, 0.55);
    this.shake(3.5 + damage * 1.5);
    this.punch(0.05, p);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.slowmo = Math.min(this.slowmo, 0.4);
  },

  spray(color, p, { count, speed, size, life, spread = TAU, angle = 0, gravity = 0, additive = false, texture = null }) {
    const gore = this.gore;
    if (!gore.on) return;
    const n = gore.count(count);
    this.shed += n;
    this.fx.add(burst(color, { count: n, speed: this.ronin * speed * gore.force, size: this.ronin * size * gore.size, life: life * gore.span,
      spread, angle, gravity: this.ronin * gravity, additive, texture })).at(p.x, p.y);
  },

  // MARK: The clash with the warlord

  followBind() {
    const b = this.bind;
    if (!b) return;
    const frame = this.hero.drawnFrame;
    if (frame !== this.bindShown) {
      this.bindShown = frame;
      if (frame === F.clash(0)) this.bladesMeet(b);
      if (frame === F.clash(1) && b.parried) this.bladesPart(b);
    }
    const sprite = this.foeSprites.get(b.foe);
    if (!sprite) { this.bind = null; return; }
    const c = frameCase(frame);
    let held = c === 'cut' ? F.block : c === 'clash' ? frame : null;
    if (held && c === 'clash' && this.hitStop <= 0) {
      const foe = this.session.fight.foe(b.foe);
      if (foe && foe.phase === 'windup' && foe.timer < 0.12) held = null;
    }
    sprite.bind(held);
    if (!held) this.bind = null;
  },

  letGoOfBind() {
    if (this.bind) this.foeSprites.get(this.bind.foe)?.bind(null);
    this.bind = null;
  },

  bladeRun(cast, frame, facing) {
    const c = contactPoint(cast, frame), w = weaponLine(cast, frame);
    if (!c || !w) return { angle: facing > 0 ? 0.7 : Math.PI - 0.7, length: this.ronin * 0.4 };
    const t = w.tip;
    return { angle: Math.atan2(t.y - c.y, facing * (t.x - c.x)), length: Math.hypot(t.x - c.x, t.y - c.y) * this.ronin * Builds[cast].height };
  },

  bladesMeet(b) {
    this.clashesDrawn++;
    const sign = sideSign(b.side), strong = b.parried;
    const cast = this.foeSprites.get(b.foe)?.cast ?? 'warlord';
    const mine = contactPoint('hero', F.clash(0)) || { x: 0.47, y: 1 };
    const p = { x: this.heroX + b.spot + sign * mine.x * this.ronin, y: this.groundY + mine.y * this.ronin };
    const hot = Palette.gold.mix(RGB.white, 0.35);
    this.fx.add(flash(RGB.white, { size: this.ronin * (strong ? 1.6 : 0.9), duration: strong ? 0.18 : 0.1, alpha: this.calm ? 0.55 : 1 })).at(p.x, p.y);
    for (const { angle, length } of [this.bladeRun('hero', F.clash(0), sign), this.bladeRun(cast, F.clash(0), -sign)]) {
      const glint = tintedSprite(Art.streak, Palette.steel.mix(RGB.white, 0.6), length * (strong ? 1.1 : 0.8), Math.max(5, this.ronin * 0.09));
      glint.ax = 0; glint.ay = 0.5;
      glint.at(p.x, p.y);
      glint.rotation = angle;
      glint.blend = BLEND.add;
      glint.xScale = 0.3;
      glint.run(A.seq(A.group(A.scaleXTo(1.2, 0.1), A.fadeOut(strong ? 0.18 : 0.1)), A.remove()));
      this.fx.add(glint);
      for (let k = 0; k < (strong ? 3 : 1); k++) {
        const out = this.ronin * 0.09 * k;
        this.fx.add(burst(hot, { count: strong ? 10 - 2 * k : 6, speed: this.ronin * (strong ? 2.6 : 1.7), size: this.ronin * (strong ? 0.05 : 0.04),
          life: strong ? 0.34 : 0.2, spread: 0.45, angle, gravity: this.ronin * 5 })).at(p.x + Math.cos(angle) * out, p.y + Math.sin(angle) * out);
      }
    }
    this.fx.add(burst(RGB.white, { count: strong ? 14 : 5, speed: this.ronin * (strong ? 3.4 : 2.4), size: this.ronin * 0.055, life: strong ? 0.16 : 0.12 })).at(p.x, p.y);
    this.fx.add(shockwave(Palette.steel, { radius: this.ronin * 0.05, grow: strong ? 6 : 3.5, width: strong ? 2.2 : 1.3, duration: strong ? 0.3 : 0.2 })).at(p.x, p.y);
    if (!strong) {
      this.foeSprites.get(b.foe)?.showParry(true);
      this.hitStop = Math.max(this.hitStop, this.calm ? 0.02 : 0.03);
      this.shake(0.8);
      return;
    }
    this.fx.add(shockwave(hot, { radius: this.ronin * 0.05, grow: 10, width: 1, duration: 0.5 })).at(p.x, p.y);
    this.fx.add(burst(Palette.gold, { count: 16, speed: this.ronin * 0.9, size: this.ronin * 0.04, life: 0.6, spread: 1.4, angle: -Math.PI / 2, gravity: this.ronin * 7 })).at(p.x, p.y);
    this.focus(p, this.ronin * 2.6, RGB.white, 0.4);
    this.flashLane(0.1, 0.2, Palette.steel);
    this.foeSprites.get(b.foe)?.showParry(false);
    const blocked = Icons.blocked(this.ronin * 0.24, Palette.gold.mix(RGB.white, 0.2).css());
    blocked.at(this.heroX + b.spot, this.groundY + this.ronin * 1.25);
    blocked.setScale(0.4);
    this.overlay.add(blocked);
    blocked.run(A.seq(A.scaleTo(1, 0.08), A.wait(0.3), A.group(A.fadeOut(0.25), A.moveBy(0, 6, 0.25)), A.remove()));
    this.hitStop = Math.max(this.hitStop, this.calm ? 0.04 : 0.065);
    this.shake(2.4);
    this.punch(0.035, p);
  },

  bladesPart(b) {
    const sign = sideSign(b.side);
    const cast = this.foeSprites.get(b.foe)?.cast ?? 'warlord';
    const mine = contactPoint('hero', F.clash(1)) || { x: 0.12, y: 1.24 };
    const p = { x: this.heroX + b.spot + sign * mine.x * this.ronin, y: this.groundY + mine.y * this.ronin };
    const angle = this.bladeRun(cast, F.clash(1), -sign).angle;
    this.fx.add(flash(Palette.steel, { size: this.ronin * 0.8, duration: 0.1, alpha: this.calm ? 0.45 : 0.8 })).at(p.x, p.y);
    for (let k = 0; k < 3; k++) {
      const out = this.ronin * 0.07 * k;
      this.fx.add(burst(Palette.gold.mix(RGB.white, 0.25), { count: 7 - k, speed: this.ronin * 2.2, size: this.ronin * 0.045, life: 0.28,
        spread: 0.5, angle, gravity: this.ronin * 5 })).at(p.x + Math.cos(angle) * out, p.y + Math.sin(angle) * out);
    }
    this.fx.add(shockwave(Palette.steel, { radius: this.ronin * 0.04, grow: 3.5, width: 1.2, duration: 0.2 })).at(p.x, p.y);
    this.shake(1.4);
  },

  // MARK: The brute's club

  clubMet(sprite, id, side) {
    this.turnsDrawn++;
    const met = sprite.clubPoint(0.7) || { point: { x: sprite.x, y: this.groundY + sprite.height }, angle: side === 'right' ? Math.PI * 0.75 : Math.PI * 0.25 };
    const p = met.point;
    const hot = Palette.gold.mix(RGB.white, 0.35);
    this.fx.add(flash(RGB.white, { size: this.ronin * 1.3, duration: 0.16, alpha: this.calm ? 0.5 : 1 })).at(p.x, p.y);
    for (const angle of [met.angle, met.angle + Math.PI]) {
      this.fx.add(burst(hot, { count: 9, speed: this.ronin * 2.4, size: this.ronin * 0.05, life: 0.32, spread: 0.5, angle, gravity: this.ronin * 5 })).at(p.x, p.y);
    }
    this.fx.add(burst(RGB.white, { count: 12, speed: this.ronin * 3.2, size: this.ronin * 0.05, life: 0.16 })).at(p.x, p.y);
    this.fx.add(shockwave(Palette.steel, { radius: this.ronin * 0.05, grow: 6, width: 2, duration: 0.3 })).at(p.x, p.y);
    this.fx.add(shockwave(hot, { radius: this.ronin * 0.05, grow: 9, width: 1, duration: 0.45 })).at(p.x, p.y);
    this.fx.add(burst(Palette.gold, { count: 12, speed: this.ronin * 0.8, size: this.ronin * 0.04, life: 0.55, spread: 1.4, angle: -Math.PI / 2, gravity: this.ronin * 7 })).at(p.x, p.y);
    this.flashLane(0.08, 0.2, Palette.steel);
    if (this.foeSprites.get(id) === sprite) sprite.showTurned();
    this.hitStop = Math.max(this.hitStop, this.calm ? 0.035 : 0.06);
    this.shake(2);
    this.punch(0.03, p);
  },

  get clubsGlaring() { let n = 0; for (const s of this.foeSprites.values()) if (s.glaring) n++; return n; },

  dash(x, side) {
    const distance = Math.abs(x - this.heroX);
    if (distance <= this.ronin * 0.45) return;
    const streak = tintedSprite(Art.streak, this.session.fight.inBloodlust ? Palette.blood : RGB.white, distance, this.ronin * 0.3);
    streak.ax = 0; streak.ay = 0.5;
    streak.xScale = side === 'right' ? 1 : -1;
    streak.at(this.heroX, this.groundY + this.ronin * 0.52);
    streak.blend = BLEND.add;
    streak.alpha = 0.55;
    streak.run(A.seq(A.fadeOut(0.14), A.remove()));
    this.fx.add(streak);
  },

  /** A cut to suit what is in front of him, never the same one twice running (DuelScene.chooseCut). */
  chooseCut(kind, distance, guarded = false) {
    if (this.hero.sheathed) { this.lastCut = 'nukitsuke'; return 'nukitsuke'; }
    let options;
    if (guarded) options = ['shomen', 'kesa'];
    else if (kind === null) options = ['dou', 'kesa', 'gyaku'];
    else if (distance > this.ronin * 0.9) options = ['tsuki', 'shomen'];
    else if (kind === 'brute' || kind === 'warlord') options = ['shomen', 'kesa', 'dou'];
    else if (kind === 'runner' || kind === 'dancer') options = ['sune', 'gyaku', 'dou'];
    else options = ['kesa', 'gyaku', 'dou', 'sune', 'shomen'];
    this.cuts++;
    const fresh = options.filter((c) => c !== this.lastCut);
    const pickC = fresh.length ? fresh[this.cuts % fresh.length] : options[0];
    this.lastCut = pickC;
    return pickC;
  },

  drawFlash(side) {
    const p = { x: this.heroX + sideSign(side) * this.ronin * 0.12, y: this.groundY + this.ronin * 0.52 };
    this.fx.add(burst(RGB.white, { count: 12, speed: this.ronin * 2.6, size: this.ronin * 0.05, life: 0.14, spread: 0.5, angle: side === 'right' ? 0.4 : Math.PI - 0.4 })).at(p.x, p.y);
    const glint = tintedSprite(Art.glow, Palette.steel, this.ronin * 0.7, this.ronin * 0.7);
    glint.at(p.x, p.y);
    glint.blend = BLEND.add;
    glint.run(A.seq(A.group(A.fadeOut(0.18), A.scaleTo(1.6, 0.18)), A.remove()));
    this.fx.add(glint);
  },

  // MARK: The gourd

  fling(id) {
    const g = this.session.fight.gourd;
    if (!g || g.from !== id) return;
    const sprite = this.foeSprites.get(id);
    sprite?.dropGourd();
    let start = this.gourdSpots.get(id);
    this.gourdSpots.delete(id);
    if (!start) start = sprite ? { x: sprite.x, y: this.groundY + sprite.height * 1.12 } : { x: this.laneX(g.start), y: this.groundY + this.ronin };
    if (this.flung) { this.flung.mark.remove(); this.flung.remove(); }
    const node = new GourdSprite(id, start, sideOf(g.land - g.start), this.ronin);
    node.z = 6;
    node.mark.z = 14.9;
    this.fx.add(node);
    this.world.add(node.mark);
    this.flung = node;
    node.updateGourd(g, this.laneX(g.land), this.groundY, this.ronin, this.top, this.calm, 0);
  },

  catchGourd(id, restored) {
    const node = this.flung && this.flung.from === id ? this.flung : null;
    const start = node ? { x: node.x, y: node.y } : { x: this.heroX, y: this.groundY + this.ronin };
    if (node) {
      node.mark.run(A.seq(A.group(A.fadeOut(0.25), A.scaleTo(1.6, 0.25)), A.remove()));
      node.remove();
    }
    this.flung = null;
    this.gourdsCaught++;
    const side = start.x < this.heroX ? 'left' : 'right';
    this.hero.cut(side, 'gyaku', Math.abs(start.x - this.heroX), 4);
    this.swingUntil = this.clock;
    this.fx.add(flash(Palette.jade, { size: this.ronin * 0.9, duration: 0.18, alpha: this.calm ? 0.35 : 0.8 })).at(start.x, start.y);
    const gourd = Icons.gourd(Math.max(10, this.ronin * 0.22), Palette.jade.mix(RGB.white, 0.25).css());
    gourd.at(start.x, start.y);
    this.overlay.add(gourd);
    const chest = { x: this.hero.standing, y: this.groundY + this.ronin * 0.6 };
    gourd.run(A.seq(A.group(A.seq(A.moveBy((chest.x - start.x) * 0.3, this.ronin * 0.25, 0.12).easedOut(), A.moveTo(chest.x, chest.y, 0.18).easedIn()),
      A.rotateBy(side === 'right' ? 3 : -3, 0.3)), A.remove()));
    this.later(0.3, () => {
      this.fx.add(burst(Palette.jade, { count: 30, speed: this.ronin * 1.6, size: this.ronin * 0.08, life: 0.6 })).at(chest.x, chest.y);
      this.fx.add(shockwave(Palette.jade, { radius: this.ronin * 0.2, grow: 4, width: 2.5, duration: 0.45 })).at(chest.x, chest.y);
      if (!restored) this.bonusPoints();
    });
  },

  shatter(id) {
    const node = this.flung;
    if (!node || node.from !== id) return;
    this.flung = null;
    this.gourdsShattered++;
    const x = node.mark.x;
    node.mark.remove();
    node.remove();
    const size = node.size;
    const shell = Palette.jade.mix(RGB.white, 0.25).css();
    for (let k = 0; k < 5; k++) {
      const w = size * rand(0.18, 0.34), h = size * rand(0.12, 0.22);
      const piece = new Shape(ellipsePath(-w / 2, -h / 2, w, h));
      piece.fillColor = shell;
      piece.at(x, this.groundY + size * 0.2);
      piece.rotation = Math.random() * TAU;
      const way = k % 2 === 0 ? 1 : -1;
      const across = way * this.ronin * rand(0.08, 0.3) * (this.calm ? 0.6 : 1);
      const hop = this.ronin * rand(0.05, 0.18) * (this.calm ? 0.5 : 1);
      piece.run(A.seq(A.group(A.seq(A.moveBy(across * 0.5, hop, 0.14).easedOut(), A.moveBy(across * 0.5, -hop, 0.16).easedIn()),
        A.rotateBy(way * rand(2, 5), 0.3)), A.wait(1.2), A.fadeOut(0.8), A.remove()));
      this.fx.add(piece);
    }
    const spot = { x, y: this.groundY + size * 0.3 };
    this.fx.add(burst(Palette.jade, { count: this.calm ? 10 : 24, speed: this.ronin * 1.1, size: this.ronin * 0.06, life: 0.5, spread: 1.4,
      angle: Math.PI / 2, gravity: this.ronin * 4, additive: false })).at(spot.x, spot.y);
    this.fx.add(flash(Palette.jade, { size: this.ronin * 0.8, duration: 0.2, alpha: this.calm ? 0.3 : 0.6 })).at(spot.x, spot.y);
    const pool = new Shape(ellipsePath(-this.ronin * 0.275, -this.ronin * 0.035, this.ronin * 0.55, this.ronin * 0.07));
    pool.fillColor = Palette.jade.mix(RGB.black, 0.35).css(0.55);
    pool.at(x, this.groundY + 1);
    pool.xScale = 0.3;
    pool.z = 3.5;
    pool.run(A.seq(A.scaleXTo(1, 0.5), A.wait(1.5), A.fadeOut(1.5), A.remove()));
    this.world.add(pool);
    this.lostGourd(x);
    this.shake(0.8);
  },

  lostGourd(x) {
    const lost = new Node();
    lost.add(Icons.gourd(Math.max(10, this.ronin * 0.2), Palette.jade.mix(RGB.black, 0.3).css()));
    lost.add(Icons.cross(Math.max(12, this.ronin * 0.26), Palette.blood.mix(RGB.white, 0.2).css()));
    lost.at(Math.min(Math.max(x, this.field.x + this.ronin * 0.3), this.field.x + this.field.w - this.ronin * 0.3), this.groundY + this.ronin * 1.05);
    this.overlay.add(lost);
    lost.run(A.seq(A.wait(0.6), A.group(A.fadeOut(0.5), A.moveBy(0, 8, 0.5)), A.remove()));
  },

  bonusPoints() {
    const bonus = new Label(Fonts.heading, 13 * this.fs, Palette.gold.css());
    bonus.set('+' + grouped(this.session.fight.gourdBonus));
    bonus.at(this.heroX, this.groundY + this.ronin * 1.15);
    this.overlay.add(bonus);
    bonus.run(A.seq(A.group(A.moveBy(0, 10, 0.7), A.fadeOut(0.7)), A.remove()));
  },

  // MARK: Shards

  get shardFlight() { return this.calm ? 0.4 : 0.28; },

  earnShard(id, count) {
    const k = Math.min(count, this.shardPieces.length) - 1;
    if (k < 0) return;
    const from = this.killSpots.get(id) || { x: this.hero.standing, y: this.groundY + this.ronin * 0.7 };
    this.killSpots.delete(id);
    this.shardsMoving++;
    this.later(Math.max(0, this.swingUntil - this.clock), () => {
      const sen = new Label(Fonts.seal, 14 * this.fs, Palette.gold.mix(RGB.white, 0.2).css());
      sen.set('先');
      sen.at(from.x, from.y + this.ronin * 0.5);
      sen.setScale(this.calm ? 1 : 0.5);
      this.overlay.add(sen);
      sen.run(A.seq(A.scaleTo(1, 0.08), A.wait(0.35), A.group(A.fadeOut(0.3), A.moveBy(0, 8, 0.3)), A.remove()));
      this.fx.add(flash(Palette.gold, { size: this.ronin * 0.8, duration: 0.2, alpha: this.calm ? 0.35 : 0.8 })).at(from.x, from.y);
      const target = { x: this.shardPieces[k].x, y: this.shardPieces[k].y };
      const shard = Icons.shard(11, k);
      shard.fillColor = Palette.gold.css();
      shard.strokeColor = Palette.gold.mix(RGB.white, 0.45).css();
      shard.at(from.x, from.y);
      shard.z = 85;
      shard.setScale(this.calm ? 1.2 : 2);
      this.root.add(shard);
      shard.run(A.seq(A.group(A.moveTo(target.x, target.y, this.shardFlight).easedIn(), A.scaleTo(1, this.shardFlight)), A.remove()));
      this.later(this.shardFlight, () => {
        this.shardsMoving = Math.max(0, this.shardsMoving - 1);
        this.shownShards = Math.max(this.shownShards, k + 1);
        const piece = this.shardPieces[k];
        piece.removeAction('pop');
        piece.setScale(1);
        piece.run(A.seq(A.scaleTo(this.calm ? 1.3 : 1.9, 0.06), A.scaleTo(1, 0.22)), 'pop');
        this.overHeader(flash(Palette.gold, { size: 22, duration: 0.25, alpha: this.calm ? 0.4 : 0.9 }).at(target.x, target.y));
      });
    });
  },

  mend(restored) {
    this.shardsMoving++;
    if (restored) this.heldHearts++;
    this.later(Math.max(0, this.swingUntil - this.clock) + this.shardFlight + 0.12, () => {
      this.shardsMoving = Math.max(0, this.shardsMoving - 1);
      const centre = { x: this.shardPieces[0].x, y: this.shardPieces[0].y };
      for (const piece of this.shardPieces) {
        piece.fillColor = Palette.gold.mix(RGB.white, 0.6).css();
        piece.run(A.seq(A.scaleTo(this.calm ? 1.2 : 1.6, 0.08), A.scaleTo(1, 0.2)));
      }
      this.shownShards = 0;
      this.overHeader(shockwave(Palette.gold, { radius: 5, grow: 3, width: 1.5, duration: 0.35 }).at(centre.x, centre.y));
      const chest = { x: this.hero.standing, y: this.groundY + this.ronin * 0.6 };
      this.fx.add(shockwave(Palette.gold, { radius: this.ronin * 0.2, grow: 4, width: 2.5, duration: 0.45 })).at(chest.x, chest.y);
      if (restored) {
        const heart = Icons.heart(11);
        heart.fillColor = Palette.blood.css();
        heart.strokeColor = Palette.gold.css();
        heart.at(centre.x, centre.y);
        heart.z = 85;
        this.root.add(heart);
        const into = this.hearts[Math.min(this.hearts.length - 1, Math.max(0, this.session.fight.hp - this.heldHearts))];
        heart.run(A.seq(A.moveTo(into.x, into.y, 0.16), A.remove()));
        this.later(0.16, () => {
          this.heldHearts = Math.max(0, this.heldHearts - 1);
          this.heartWait = 0;
          this.overHeader(flash(Palette.blood.mix(RGB.white, 0.3), { size: 24, duration: 0.3, alpha: this.calm ? 0.4 : 0.9 }).at(into.x, into.y));
        });
      } else {
        this.bonusPoints();
      }
    });
  },

  overHeader(node) { node.z = 1.5; this.header.add(node); },

  scatterShards() {
    for (let k = 0; k < Math.min(this.shownShards, this.shardPieces.length); k++) {
      const piece = this.shardPieces[k];
      this.overHeader(burst(Palette.gold, { count: this.calm ? 4 : 9, speed: 28, size: 3, life: 0.5, spread: 1.2, angle: -Math.PI / 2, gravity: 90, additive: false }).at(piece.x, piece.y));
      piece.run(A.seq(A.scaleTo(1.4, 0.05), A.scaleTo(1, 0.15)));
    }
    this.shownShards = 0;
  },

  // MARK: The cut's mark and the dead

  slash(p, side, style, strong) {
    const bloodlust = this.session.fight.inBloodlust;
    const s = this.ronin * (strong ? 1.25 : 1.0);
    const tilt = { kesa: -0.8, gyaku: 0.75, nukitsuke: 0.75, shomen: -1.3, dou: -0.05, sune: 0.2, tsuki: 0 }[style] ?? 0;
    const accent = bloodlust ? Palette.blood : this.look.accent;
    if (style === 'tsuki') {
      for (const [k, color] of [[0, accent], [1, RGB.white]]) {
        const line = tintedSprite(Art.streak, color, s * 1.5, s * (k === 0 ? 0.16 : 0.07));
        line.ax = 1; line.ay = 0.5;
        line.at(p.x + sideSign(side) * s * 0.35, p.y + s * 0.08);
        line.xScale = side === 'right' ? 1 : -1;
        line.blend = BLEND.add;
        line.run(A.seq(A.group(A.fadeOut(0.16), A.scaleXTo(1.3 * line.xScale, 0.16)), A.remove()));
        this.fx.add(line);
      }
      this.fx.add(shockwave(RGB.white, { radius: s * 0.05, grow: 4, width: 1.2, duration: 0.2 })).at(p.x + sideSign(side) * s * 0.35, p.y + s * 0.08);
      return;
    }
    const squash = style === 'dou' ? 0.45 : 1;
    for (const [k, color] of [[0, accent], [1, RGB.white]]) {
      const size = s * (k === 0 ? 1.1 : 1);
      const arc = tintedSprite(Art.crescent, color, size, size * squash);
      arc.at(p.x, p.y);
      arc.xScale = side === 'right' ? 1 : -1;
      arc.rotation = (side === 'right' ? tilt : -tilt) + rand(-0.12, 0.12);
      arc.blend = BLEND.add;
      arc.alpha = k === 0 ? 0.65 : 1;
      arc.run(A.seq(A.group(A.fadeOut(0.22), A.scaleBy(1.12, 0.22)).easedOut(), A.remove()));
      this.fx.add(arc);
    }
    const line = tintedSprite(Art.streak, RGB.white, s * 1.5, s * 0.06);
    line.at(p.x, p.y);
    line.rotation = side === 'right' ? tilt + Math.PI / 2 * 0.6 : -(tilt + Math.PI / 2 * 0.6);
    line.blend = BLEND.add;
    line.run(A.seq(A.group(A.fadeOut(0.12), A.scaleXTo(1.4, 0.12)), A.remove()));
    this.fx.add(line);
  },

  /** A foe cut down: halved, beheaded, cut from his feet or felled whole, as the gore and the cut make it; the blood
   *  goes everywhere from where he parts, which is returned. */
  sever(sprite, side, style, variant = null) {
    this.foeSprites.delete(sprite.id);
    if (sprite.gourd) this.gourdSpots.set(sprite.id, { x: sprite.x, y: sprite.y + sprite.height * 1.12 });
    const boss = sprite.kind === 'warlord', heavy = boss || sprite.kind === 'brute';
    const facing = sprite.x < this.heroX ? 1 : -1;
    const feet = { x: sprite.x, y: sprite.y };
    const force = boss ? 1.5 : heavy ? 1.25 : 1;
    const gore = this.gore;
    this.carnage.gore = gore;
    let severance = null;
    if (gore.on) {
      if (boss) severance = 'head';
      else {
        const cut = { kesa: 'falling', gyaku: 'rising', nukitsuke: 'rising', dou: 'level', sune: 'legs', shomen: 'head' }[style]
          ?? (style === 'tsuki' && Math.random() < gore.tears ? 'level' : null);
        severance = Math.random() < gore.severs ? cut : null;
      }
    }
    const gash = this.carnage.kill(sprite.cast, severance, feet, facing, sideSign(side), force, variant !== null ? { variant } : { frame: sprite.shown });
    const thrown = side === 'right' ? 0.6 : Math.PI - 0.6;
    if (gore.on) {
      this.spray(Palette.blood, gash, { count: boss ? 90 : heavy ? 56 : 36, speed: 2.4, size: 0.08, life: 0.7, spread: 1.6, angle: thrown, gravity: 6 });
      this.spray(Palette.blood.mix(RGB.white, 0.2), gash, { count: 12, speed: 3.2, size: 0.1, life: 0.2, spread: 0.8, angle: thrown, additive: true });
      this.spray(rgb(0.28, 0, 0.02), gash, { count: heavy ? 18 : 9, speed: 1.9, size: 0.11, life: 0.8, spread: 1.3, angle: Math.PI / 2, gravity: 9, texture: Art.dot });
      this.hero.bloodied((heavy ? 0.06 : 0.025) * gore.level, 0.1 + 0.03 * gore.level);
    } else {
      this.fx.add(burst(Palette.steel, { count: boss ? 30 : heavy ? 22 : 14, speed: this.ronin * 2.6, size: this.ronin * 0.07, life: 0.24, spread: 1.2, angle: thrown })).at(gash.x, gash.y);
    }
    sprite.remove();
    if (heavy) this.focus(gash, this.ronin * (boss ? 5.5 : 4.2), RGB.white, boss ? 0.9 : 0.65, boss);
    if (boss) {
      this.hitStop = Math.max(this.hitStop, 0.25);
      this.world.speed = 0.25;
      this.fx.add(shockwave(Palette.gold, { radius: this.ronin * 0.3, grow: 7, width: 3, duration: 0.8 })).at(gash.x, gash.y);
      this.fx.add(burst(Palette.gold, { count: 70, speed: this.ronin * 3, size: this.ronin * 0.1, life: 0.9 })).at(gash.x, gash.y);
      this.shake(6);
      this.punch(0.07, gash);
      this.splatter(4);
    } else {
      this.hitStop = Math.max(this.hitStop, heavy ? 0.08 : 0.05);
      this.shake(heavy ? 2.8 : 1.6);
      this.punch(heavy ? 0.035 : 0.02, gash);
      if (heavy || (Math.abs(feet.x - this.heroX) < this.ronin * 0.6 && Math.random() < gore.chance(0.15))) this.splatter(heavy ? 2 : 1, side);
    }
    return gash;
  },

  // MARK: The end of a stage

  finish(outcome) {
    this.hero.finish(outcome === 'victory');
    this.world.speed = Math.min(this.world.speed, 0.3);
    const fs = this.fs;
    if (outcome === 'victory' && this.session.isEndless) {
      const fight = this.session.fight;
      const flawless = (fight.stats.damage || 0) === 0;
      this.slam(flawless ? 'FLAWLESS' : 'CLEARED', flawless ? Palette.gold : this.look.accent.mix(RGB.white, 0.3), Icons.infinity(18 * fs, Palette.gold.css()));
      this.fx.add(burst(this.look.accent, { count: 40, speed: this.ronin * 1.5, size: this.ronin * 0.08, life: 1.1, spread: 1.4, angle: Math.PI / 2 }))
        .at(this.hero.standing, this.groundY + this.ronin * 0.8);
      const rank = this.session.promotion;
      if (rank) this.slams.run(A.seq(A.wait(1.0), A.run(() => this.slam('▲ ' + rank.toUpperCase(), Palette.gold))));
      this.overlay.run(A.seq(A.wait(rank ? 2.6 : 1.7), A.run(() => {
        if (this.session.fight.outcome !== 'victory' || !this.session.isEndless) return;
        this.session.next();
        this.loadFight(true);
        this.refreshCurtain();
        if (this.onChange) this.onChange();
      })));
      this.refreshCurtain();
      return;
    }
    const delay = outcome === 'victory' ? 1.5 : HeroSprite.fallTiming[HeroSprite.fallTiming.length - 1] + 0.3;
    if (outcome === 'defeat') {
      const gore = this.gore;
      this.carnage.gore = gore;
      const x = this.hero.standing;
      const chest = { x: x + sideSign(this.hero.facing) * this.ronin * 0.06, y: this.groundY + this.ronin * 0.55 };
      this.carnage.bleedAt(chest, this.hero.facing === 'right' ? 0.7 : Math.PI - 0.7, 1.0);
      this.later(HeroSprite.fallTiming[HeroSprite.fallTiming.length - 1], () => {
        const hx = this.hero.standing;
        this.carnage.bleedAt({ x: hx + sideSign(this.hero.facing) * this.ronin * 0.2, y: this.groundY + this.ronin * 0.12 }, this.hero.facing === 'right' ? 0.3 : Math.PI - 0.3, 0.8);
      });
      this.spray(Palette.blood, chest, { count: 70, speed: 2.4, size: 0.09, life: 0.8, gravity: 6 });
      this.carnage.pool(x, this.ronin * 2.4, 3.5);
      this.carnage.spatter(x, 16);
      this.splatter(4);
      this.punch(0.07, chest);
      this.shake(5);
      const fall = rectSprite(RGB.black, this.field.w, this.field.h, 0, 0);
      fall.alpha = 0;
      fall.z = -1;
      this.overlay.add(fall);
      fall.run(A.fadeTo(0.35, 0.8));
    } else {
      this.fx.add(burst(this.look.accent, { count: 50, speed: this.ronin * 1.5, size: this.ronin * 0.08, life: 1.1, spread: 1.4, angle: Math.PI / 2 }))
        .at(this.hero.standing, this.groundY + this.ronin * 0.8);
    }
    this.overlay.run(A.seq(A.wait(delay), A.run(() => {
      if (this.session.fight.outcome !== outcome || this.banner) return;
      this.showBanner(outcome);
    })));
    this.refreshCurtain();
  },

  /** The end card: a big word, the stage's (or after a fall, the run's) numbers, a rank or a record, and ▶ or ↻. */
  showBanner(outcome) {
    if (this.banner) this.banner.remove();
    const fight = this.session.fight;
    const fs = this.fs;
    const won = outcome === 'victory';
    const flawless = (fight.stats.damage || 0) === 0;
    const color = won ? (flawless ? Palette.gold : this.look.accent.mix(RGB.white, 0.3)) : Palette.blood.mix(RGB.white, 0.25);
    const node = new Node();
    node.at(this.field.x + this.field.w / 2, this.field.y + this.field.h / 2);
    const dim = node.add(rectSprite(RGB.black, this.size.w * 2, this.size.h * 2));
    dim.alpha = 0.62;
    dim.z = -0.2;
    const glow = node.add(tintedSprite(Art.glow, color, this.field.w * 1.1, 80 * fs)).at(0, 26 * fs);
    glow.blend = BLEND.add;
    glow.alpha = 0.35;
    glow.z = -0.1;
    const title = node.add(new Label(Fonts.heading, 24 * fs, color.css()));
    title.set(won ? (flawless ? 'FLAWLESS' : 'CLEARED') : 'FALLEN', 7 * fs);
    title.at(3.5 * fs, 34 * fs);
    node.add(Icons.rule(Math.min(this.field.w * 0.5, 220 * fs), color, 0.8)).at(0, 21 * fs);
    const career = this.session.career;
    const ink = Palette.ink.css();
    const seconds = Math.floor(fight.time || 0);
    let stats = [
      [Icons.skull(13 * fs, ink), String(fight.stats.kills || 0)],
      [Icons.swords(13 * fs, ink), String(fight.stats.bestCombo || 0)],
      [Icons.clock(13 * fs, ink), `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`],
    ];
    let total = fight.score;
    let caption = null;
    let best = false;
    let marks = [this.session.promotion ? this.session.promotion.toUpperCase() : null];
    const given = career.banner;
    if (given && given.outcome === outcome) {
      // The card's words and numbers as the core books them (DuelScene.showBanner).
      const icons = { skull: Icons.skull, swords: Icons.swords, clock: Icons.clock, steps: Icons.steps, infinity: Icons.infinity };
      stats = (given.stats || []).map((s) => [(icons[s.icon] || Icons.skull)(13 * fs, ink), String(s.text)]);
      total = given.score ?? total;
      caption = given.caption ?? null;
      marks = given.marks || marks;
      if (given.title) title.set(given.title, 7 * fs);
    } else if (!won) {
      const run = career.lastRun;
      if (run && run.stage === fight.stage) {
        stats = [
          [this.session.isEndless ? Icons.infinity(13 * fs, ink) : Icons.steps(13 * fs, ink), String(run.cleared)],
          [Icons.skull(13 * fs, ink), String(run.kills)],
          [Icons.swords(13 * fs, ink), String(run.bestCombo)],
        ];
        total = run.score;
        best = !!career.lastRunIsBest;
      }
      caption = `STAGE ${career.current ?? 1}`;
    }
    const row = node.add(new Node()).at(0, 6 * fs);
    let x = 0;
    for (const [icon, value] of stats) {
      const label = new Label(Fonts.heading, 14 * fs, ink, 'left');
      label.set(value);
      icon.at(x + 7 * fs, 0);
      label.at(x + 17 * fs, 0);
      row.add(icon);
      row.add(label);
      x += 17 * fs + label.width + 16 * fs;
    }
    for (const child of row.children) child.x -= (x - 16 * fs) / 2;
    const score = node.add(new Label(Fonts.heading, 14 * fs, Palette.gold.css()));
    score.set(grouped(total));
    score.at(0, -12 * fs);
    let y = -30 * fs;
    if (best) marks.push('BEST RUN');
    marks = marks.filter(Boolean);
    if (marks.length) {
      const promo = node.add(new Label(Fonts.italic, 12 * fs, Palette.gold.css()));
      promo.set('▲ ' + marks.join(' · '), 2 * fs);
      promo.at(0, y);
      promo.run(A.forever(A.seq(A.scaleTo(1.08, 0.5), A.scaleTo(1, 0.5))));
      y -= 17 * fs;
    }
    const go = node.add(new Node());
    const icon = go.add(won ? Icons.play(14 * fs, ink) : Icons.again(16 * fs, ink));
    if (caption) {
      const label = go.add(new Label(Fonts.heading, 11 * fs, ink, 'left'));
      label.set(caption, 2 * fs);
      icon.x = -label.width / 2;
      label.at(icon.x + 12 * fs, 0);
    }
    go.at(0, y - 2 * fs);
    go.run(A.forever(A.seq(A.fadeTo(0.35, 0.6), A.fadeTo(1, 0.6))));
    node.alpha = 0;
    node.setScale(0.94);
    node.run(A.group(A.fadeIn(0.25), A.scaleTo(1, 0.3)).easedOut());
    this.overlay.add(node);
    this.banner = node;
    this.bannerShownAt = this.clock;
    if (this.hint) this.hint.remove();
    this.hint = null;
  },
}));

DuelScene.tip = function (kind, rules) {
  switch (kind) {
    case 'grunt': return 'ONE CUT';
    case 'runner': return 'FAST — ONE CUT';
    case 'brute': return rules && rules.noBruteKnockback === false ? 'THREE CUTS' : 'THREE CUTS — CUT AS HIS CLUB GLARES';
    case 'archer': return 'CUT THE ARROW BACK';
    case 'dancer': return 'LEAPS OVER YOU';
    case 'warlord': return 'A WARLORD — WAIT OUT HIS GUARD';
  }
  return '';
};
DuelScene.heightOf = (cut) => ({ sune: 0.3, dou: 0.48, shomen: 0.72 }[cut] ?? 0.58);
DuelScene.slopeOf = (cut) => ({ kesa: -0.7, gyaku: 0.7, nukitsuke: 0.7, dou: 0, sune: 0.1, shomen: -1.35, tsuki: 0 }[cut] ?? 0);

/** A foe in the pose a blow throws him into (Figures.struck), weapon in hand: what his figure freezes in at a killing
 *  blow, exactly as the carnage lets him fall from it. */
function struckPiece(cast, variant) {
  const core = Figures.core;
  const key = `struck|${cast}|${variant}`;
  let p = Figures.cache.get(key);
  if (p) return p;
  try { p = new Piece(core.ragdoll.struck(cast, variant)); } catch { p = Figures.piece(cast, F.stagger(0)); }
  Figures.cache.set(key, p);
  return p;
}

/** Where a figure's blade meets another's in a clash (Figure.contact), if the core tells it. */
function contactPoint(cast, frame) {
  const info = figureInfo(cast, frame);
  return info && info.contact ? info.contact : null;
}

/** How far apart the ronin and the warlord stand for their blades to meet (Figure.clashGap). */
function clashGap() {
  const gap = Figures.core?.tuning?.Figure?.clashGap;
  if (typeof gap === 'number') return gap;
  const mine = contactPoint('hero', F.clash(0)), theirs = contactPoint('warlord', F.clash(0));
  if (mine && theirs) return mine.x + theirs.x * Builds.warlord.height;
  return 0.62;
}
