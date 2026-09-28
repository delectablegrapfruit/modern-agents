// scene.js: the app's DuelScene.swift: the lane, its header, the cards between stages, and the pill it folds into.

const HEADER = 24;
const PILL = { w: 196, h: 28 };
const DWELL = 0.3;

class DuelScene {
  constructor(session, w, h) {
    this.session = session;
    this.size = { w, h };
    this.root = new Node();
    this.timeScale = 1;
    this.isCompact = false;
    this.isAwayPaused = true;
    this.isEngaging = false;
    this.engageClock = 0;
    this.hitStop = 0;
    this.slowmo = 1;
    this.shakeAmount = 0;
    this.clock = 0;
    this.shownFight = null;
    this.shownSetting = null;
    this.laidOut = null;
    this.shownCombo = 0;
    this.shownHP = 5;
    this.lightning = 0;
    this.hintSides = new Set();
    this.pointer = null;
    this.calm = false;
    this.goreOn = true;
    this.shed = 0;
    this.bump = 0;
    this.swingUntil = 0;
    this.heldUntil = new Map();
    this.bind = null;
    this.bindShown = null;
    this.clashesDrawn = 0;
    this.turnsDrawn = 0;
    this.field = { x: 0, y: 0, w: 420, h: 126 };
    this.groundY = 20;
    this.ronin = 60;
    this.look = lookOf(0);
    this.ambient = Ambient.of(this.look);
    this.cuts = 0;
    this.lastCut = 'kesa';
    this.impacts = [];
    this.gourdSpots = new Map();
    this.killSpots = new Map();
    this.flung = null;
    this.zoom = 1;
    this.zoomFocus = { x: 0, y: 0 };
    this.foeSprites = new Map();
    this.arrowSprites = new Map();
    this.reachMarks = [];
    this.weather = null;
    this.farWeather = null;
    this.banner = null;
    this.bannerShownAt = 0;
    this.introCard = null;
    this.introFs = 1;
    this.hint = null;
    this.heartBeating = false;
    this.bossShape = null;
    this.bossRoomy = null;
    this.bossLeft = 0;
    this.shownShards = 0;
    this.shardsMoving = 0;
    this.heldHearts = 0;
    this.heartWait = 0.35;
    this.gourdsCaught = 0;
    this.gourdsShattered = 0;
    this.slamNode = null;
    this.onChange = null; // told when the fight goes on past a card (the page refreshes its menu)
    this.build();
    this.loadFight(true);
  }

  get top() { return this.size.h - HEADER; }
  get heroX() { return this.field.x + this.field.w / 2; }
  get headroom() { return this.top - this.groundY; }
  get gore() { return Gore.of(this.session.fight.stage, this.session.fight.inBloodlust, this.goreOn); }
  get fs() { return DuelScene.textScale(this.field); }
  static textScale(field) { return Math.max(0.85, Math.min(1.25, field.h / 126)); }
  static comboY(top, fs, boss) { return top - (boss ? 34 : 24) * fs; }
  static slamY(field, top, fs, boss) { return Math.min(field.y + field.h * 0.64, DuelScene.comboY(top, fs, boss) - (14 + 17.5 + 2) * fs); }
  static lane(w, h) {
    const field = { x: 0, y: 0, w, h: Math.max(40, h - HEADER) };
    return { field, groundY: field.y + field.h * 0.16, ronin: Tuning.figure * field.w / 2 };
  }
  laneX(x) { return this.field.x + this.field.w / 2 + x * this.field.w / 2; }

  // MARK: Building

  build() {
    const add = (node, z = 0, parent = this.root) => { node.z = z; return parent.add(node); };
    this.scenery = add(new Node(), -100);
    this.flashSky = add(rectSprite(RGB.white, 0, 0, 0, 0), -40);
    this.flashSky.alpha = 0;
    this.flashSky.blend = BLEND.add;
    this.world = add(new Node(), 0);
    this.figures = add(new Node(), 10, this.world);
    this.fx = add(new ParticleHost(), 20, this.world);
    this.carnage = new Carnage(this.fx);
    add(this.carnage.stains, 3, this.world);
    add(this.carnage.corpses, 4, this.world);
    this.hero = add(new HeroSprite(), 5, this.figures);
    for (let k = 0; k < 2; k++) {
      const mark = new Shape();
      mark.lineWidth = 2; mark.lineCap = 'round'; mark.lineJoin = 'round';
      this.reachMarks.push(add(mark, 14.9, this.world));
    }
    this.rage = add(tintedSprite(Art.edge, Palette.blood, 0, 0), 40);
    this.rage.alpha = 0;
    this.wound = add(rectSprite(Palette.blood, 0, 0, 0, 0), 41);
    this.wound.alpha = 0;
    this.dread = add(tintedSprite(Art.edge, Palette.blood.mix(RGB.black, 0.8), 0, 0), 44);
    this.dread.alpha = 0;
    this.vignette = add(new Sprite(Art.vignette), 45);
    this.vignette.alpha = 0.8;
    this.slams = add(new Node(), 46);
    this.hud = add(new Node(), 50);
    this.comboBack = add(tintedSprite(Art.glow, RGB.black, 0, 0), -2, this.hud);
    this.comboBack.alpha = 0.65;
    this.comboLabel = add(new Label(Fonts.heading, 28, '#fff'), 0, this.hud);
    this.comboShadow = add(new Label(Fonts.heading, 28, 'rgba(0,0,0,0.7)'), -1, this.hud);
    this.comboTimes = add(new Label(Fonts.italic, 13, Palette.gold.css(), 'left'), 0, this.hud);
    this.bossNode = new Node();
    this.bossTrack = new Shape();
    this.bossTrack.fillColor = 'rgba(255,255,255,0.08)';
    this.bossTrack.strokeColor = Palette.gold.css(0.5);
    this.bossTrack.lineWidth = 1;
    this.bossFill = rectSprite(Palette.gold, 0, 0, 0, 0.5);
    this.bossFill.z = 0.1;
    this.bossNode.add(this.bossTrack);
    this.bossNode.add(this.bossFill);
    const crest = this.bossNode.add(Icons.crest(14));
    crest.name = 'crest';
    for (let k = 1; k <= 3; k++) {
      const tick = rectSprite(RGB.white, 1, 9);
      tick.alpha = 0.55;
      tick.name = 'tick' + k;
      tick.z = 0.2;
      this.bossNode.add(tick);
    }
    this.bossNode.hidden = true;
    this.overlay = add(new Node(), 60);
    this.curtain = add(rectSprite(RGB.black, 0, 0, 0, 0), 70);
    this.curtain.alpha = 0.55;
    this.curtainIcon = add(Icons.pause(22, 'rgba(255,255,255,0.85)'), 71);
    this.engageRing = add(new Shape(), 72);
    this.engageRing.strokeColor = Palette.ink.css();
    this.engageRing.lineWidth = 2.5;
    this.engageRing.lineCap = 'round';
    for (const n of [this.curtain, this.curtainIcon, this.engageRing]) n.hidden = true;

    this.header = add(new Node(), 80);
    this.headerBar = this.header.add(rectSprite(Palette.header, 0, HEADER, 0, 0));
    this.modeGlyph = new Node();
    this.titleLabel = this.header.add(new Label(Fonts.heading, 12.5, Palette.ink.css(), 'left'));
    this.scoreLabel = this.header.add(new Label(Fonts.heading, 13, Palette.gold.mix(RGB.white, 0.35).css(), 'right'));
    this.compactButton = new Shape(circlePath(7));
    this.closeButton = new Shape(circlePath(7));
    for (const [button, glyph] of [[this.compactButton, 'minus'], [this.closeButton, 'close']]) {
      button.fillColor = 'rgba(255,255,255,0.1)';
      const p = new Path2D();
      if (glyph === 'minus') { p.moveTo(-3, 0); p.lineTo(3, 0); } else { p.moveTo(-2.5, -2.5); p.lineTo(2.5, 2.5); p.moveTo(-2.5, 2.5); p.lineTo(2.5, -2.5); }
      const mark = new Shape(p);
      mark.strokeColor = 'rgba(255,255,255,0.7)'; mark.lineWidth = 1.5; mark.lineCap = 'round';
      button.add(mark);
      this.header.add(button);
    }
    this.bossNode.z = 1;
    this.header.add(this.bossNode);
    this.shardPieces = [];
    for (let k = 0; k < Tuning.shardsPerHeart; k++) {
      const piece = Icons.shard(11, Math.min(k, 2));
      piece.z = 0.5;
      this.header.add(piece);
      this.shardPieces.push(piece);
    }
    this.hearts = [];
    this.pill = add(new Node(), 90);
    this.pill.hidden = true;
    this.pillHearts = [];
    for (let k = 0; k < 7; k++) {
      this.hearts.push(this.header.add(Icons.heart(11)));
      this.pillHearts.push(this.pill.add(Icons.heart(9)));
    }
    this.endlessGlyph = new Node();
    this.pillGlyph = new Node();
    this.pillLabel = this.pill.add(new Label(Fonts.heading, 12, Palette.ink.css(), 'left'));
    this.pillValue = this.pill.add(new Label(Fonts.text, 11.5, Palette.ink.css(0.85), 'right'));
  }

  /** Puts the session's fight on the lane: fresh sprites, the stage's scenery, and (for a new stage) its title card. */
  loadFight(intro) {
    const fight = this.session.fight;
    this.shownFight = { stage: fight.stage, seed: fight.seed, mode: fight.mode, id: this.session.fightId };
    for (const sprite of [...this.figures.children]) if (sprite instanceof FoeSprite) sprite.remove();
    for (const s of this.arrowSprites.values()) s.remove();
    this.foeSprites = new Map();
    this.arrowSprites = new Map();
    this.gourdSpots = new Map();
    this.killSpots = new Map();
    if (this.flung) { this.flung.mark.remove(); this.flung.remove(); this.flung = null; }
    this.shardsMoving = 0; this.heldHearts = 0; this.heartWait = 0.35;
    this.shownShards = fight.shards;
    this.heldUntil = new Map();
    this.bind = null;
    this.fx.removeAllChildren();
    this.fx.clear();
    this.overlay.removeAllChildren();
    this.overlay.removeAllActions();
    this.slams.removeAllChildren();
    this.slams.removeAllActions();
    this.impacts = [];
    this.carnage.reset(this.field, this.groundY, this.ronin, this.heroX);
    this.banner = null;
    this.world.speed = 1;
    this.slowmo = 1;
    this.hitStop = 0;
    this.swingUntil = 0;
    this.bossRoomy = null;
    this.shownCombo = fight.combo;
    this.shownHP = fight.hp;
    const st = fight.stats;
    const untouched = (st.cuts || 0) + (st.whiffs || 0) + (st.deflects || 0) + (st.parried || 0) === 0;
    this.hero.reset(untouched && !fight.outcome);
    this.hero.face(fight.facing || 'right');
    if (fight.setting !== this.shownSetting) {
      this.shownSetting = fight.setting;
      this.look = lookOf(fight.setting);
      this.ambient = Ambient.of(this.look);
      this.hero.setAmbient(this.ambient);
      this.carnage.ambient = this.ambient;
      this.layout();
    }
    this.titleLabel.set(`STAGE ${fight.stage}`, 1.6);
    this.modeGlyph.remove();
    this.modeGlyph = this.header.add(Icons.seal(fight.mode, 15));
    this.endlessGlyph.remove();
    this.endlessGlyph = this.header.add(this.session.isEndless ? Icons.infinity(13, Palette.gold.css()) : new Node());
    this.pillGlyph.remove();
    this.pillGlyph = this.pill.add(Icons.seal(fight.mode, 14));
    this.layoutHeader();
    this.layoutPill();
    this.sync(0);
    if (fight.outcome) {
      this.hero.finish(fight.outcome === 'victory');
      this.showBanner(fight.outcome);
    } else if (intro && fight.time < 1) {
      this.introduce(fight);
    }
    this.showHintIfNeeded();
    this.refreshCurtain();
  }

  // MARK: Layout

  resize(w, h) {
    this.size = { w, h };
    this.layout();
  }

  layout() {
    if (!(this.isCompact || this.size.h > PILL.h)) return;
    const w = this.size.w;
    this.pill.hidden = !this.isCompact;
    for (const node of [this.scenery, this.world, this.hud, this.slams, this.overlay, this.header, this.dread, this.vignette, this.rage, this.wound, this.flashSky]) node.hidden = this.isCompact;
    if (this.weather) this.weather.hidden = this.isCompact;
    if (this.farWeather) this.farWeather.hidden = this.isCompact;
    if (this.hint) this.hint.hidden = this.isCompact;
    if (this.isCompact) { this.layoutPill(); this.refreshCurtain(); return; }
    const lane = DuelScene.lane(this.size.w, this.size.h);
    this.field = lane.field;
    this.groundY = lane.groundY;
    this.ronin = lane.ronin;
    const resized = !this.laidOut || this.laidOut.w !== w || this.laidOut.h !== this.size.h;
    if (resized || this.laidOut.setting !== this.shownSetting) this.buildScenery();
    this.carnage.relayout(this.field, this.groundY, this.ronin, this.heroX);
    if (resized) {
      this.hero.layout(this.ronin, { x: this.heroX, y: this.groundY });
      for (const s of this.foeSprites.values()) s.layout(this.ronin, this.headroom);
      for (const side of ['left', 'right']) this.hint?.childNamed(side)?.at(this.laneX(sideSign(side) * 0.62), this.groundY + this.ronin * 0.2);
    }
    this.laidOut = { w, h: this.size.h, setting: this.shownSetting };
    const f = this.field;
    this.vignette.size(w * 1.25, f.h * 1.6).at(f.x + f.w / 2, f.y + f.h / 2);
    this.rage.size(this.vignette.w, this.vignette.h).at(this.vignette.x, this.vignette.y);
    this.dread.setScale(1);
    this.dread.size(this.vignette.w, this.vignette.h).at(this.vignette.x, this.vignette.y);
    this.wound.size(f.w, f.h);
    this.flashSky.size(f.w, f.h);
    if (this.banner) this.banner.at(f.x + f.w / 2, f.y + f.h / 2);
    if (this.introCard && this.introCard.parent) {
      this.introCard.at(f.x + f.w / 2, f.y + f.h * 0.6);
      this.introCard.setScale(this.fs / this.introFs);
    }
    this.reachMarks.forEach((mark, k) => {
      const s = k === 0 ? -1 : 1;
      const p = new Path2D();
      p.moveTo(0, -4); p.lineTo(0, 5);
      p.moveTo(s * 3, 3); p.lineTo(s * 6, 0); p.lineTo(s * 3, -3);
      mark.path = p;
      mark.at(this.laneX(s * this.session.fight.reachNow), this.groundY - 6);
    });
    this.headerBar.size(w, HEADER).at(0, this.top);
    this.closeButton.at(w - 14, this.top + HEADER / 2 + 1.5);
    this.compactButton.at(w - 33, this.top + HEADER / 2 + 1.5);
    this.layoutHeader();
    this.comboLabel.fontSize = 26 * this.fs;
    this.comboShadow.fontSize = 26 * this.fs;
    this.comboTimes.fontSize = 13 * this.fs;
    this.refreshHUD(true);
    this.refreshCurtain();
  }

  layoutHeader() {
    const mid = this.top + HEADER / 2 + 1.5;
    this.modeGlyph.at(15, mid);
    this.titleLabel.at(29, mid - 0.5);
    let heartsX = 29 + Math.max(this.titleLabel.width, 62) + 12;
    if (this.session.isEndless) {
      this.endlessGlyph.at(heartsX + 2, mid);
      heartsX += 20;
    }
    this.hearts.forEach((heart, k) => heart.at(heartsX + k * 9, mid));
    this.scoreLabel.at(this.size.w - 48, mid);
    const shown = Math.max(1, Math.min(this.session.fight.maxHP, this.hearts.length));
    const shardX = heartsX + (shown - 1) * 9 + 12;
    for (const piece of this.shardPieces) piece.at(shardX, mid);
    this.bossLeft = shardX + 6 + 22;
    this.bossShape = null;
    this.bossRoomy = null;
  }

  layoutPill() {
    const h = this.size.h;
    this.pillGlyph.at(15, h / 2);
    this.pillLabel.at(28, h / 2);
    this.pillHearts.forEach((heart, k) => heart.at(100 + k * 7.5, h / 2));
    this.pillValue.at(this.size.w - 12, h / 2);
    this.refreshPill();
  }

  /** Paints the setting: sky, sun, hills, landmarks, ground, weather (DuelScene.buildScenery). */
  buildScenery() {
    this.scenery.removeAllChildren();
    if (this.weather) this.weather.remove();
    const look = this.look;
    const w = this.field.w, h = this.field.h, g = this.groundY;
    const sky = this.scenery.add(new Sprite(gradientTexture(look.top, look.horizon), w, h));
    sky.ax = 0; sky.ay = 0;
    const r = h * look.sunSize;
    const sunX = this.field.x + w / 2, sunY = g + h * look.sunHeight;
    const halo = this.scenery.add(tintedSprite(Art.glow, look.sun, r * 5.5, r * 5.5)).at(sunX, sunY);
    halo.blend = BLEND.add;
    halo.alpha = 0.5;
    halo.z = 1;
    halo.run(A.forever(A.seq(A.fadeTo(0.38, 2.5), A.fadeTo(0.55, 2.5))));
    const disc = this.scenery.add(tintedSprite(Art.dot, look.sun, r * 2, r * 2)).at(sunX, sunY);
    disc.z = 2;
    const seed = BigInt(this.shownSetting ?? 0) + 11n;
    const far = this.scenery.add(new Shape(ridgePath(w, g, h * 0.1, h * 0.34, seed, 6)));
    far.fillColor = look.far.mix(look.horizon, 0.35).css();
    far.z = 3;
    const mist = this.scenery.add(tintedSprite(Art.glow, look.horizon, w * 1.6, h * 0.45)).at(this.field.x + w / 2, g + h * 0.06);
    mist.blend = BLEND.add;
    mist.alpha = 0.4;
    mist.z = 4;
    const near = this.scenery.add(new Shape(ridgePath(w, g, h * 0.03, h * 0.12, BigInt(0xFA11) + BigInt(Math.round(w)), 10)));
    near.fillColor = look.near.mix(look.far, 0.35).css();
    near.z = 5;
    const landmark = this.scenery.add(new Shape(landmarkPath(look.landmark, w, h, g, 0x7EAn)));
    landmark.fillColor = look.near.mix(look.far, 0.2).css();
    landmark.z = 6;
    if (look.landmark === 'village') {
      for (const x of [0.05, 0.16, 0.84, 0.95]) {
        const fire = this.scenery.add(tintedSprite(Art.glow, rgb(1, 0.45, 0.1), h * 0.7, h * 0.6)).at(w * x, g + h * 0.35);
        fire.blend = BLEND.add;
        fire.alpha = 0.5;
        fire.z = 7;
        const period = rand(0.12, 0.25);
        fire.run(A.forever(A.seq(A.fadeTo(0.3, period), A.fadeTo(0.6, period * 1.3))));
      }
    }
    const ground = this.scenery.add(new Sprite(gradientTexture(look.ground.mix(look.horizon, 0.28), look.ground), w, g));
    ground.ax = 0; ground.ay = 0;
    ground.z = 8;
    const edge = this.scenery.add(rectSprite(look.horizon, w, 1, 0, 0)).at(0, g);
    edge.alpha = 0.6;
    edge.z = 9;
    const sky2 = weather(look.weather, { w, h }, look.horizon);
    sky2.z = 30;
    this.root.add(sky2);
    this.weather = sky2;
    const distant = weather(look.weather, { w, h }, look.horizon, true, g);
    distant.z = 7.5;
    distant.hidden = this.isCompact;
    this.scenery.add(distant);
    this.farWeather = distant;
  }

  // MARK: Modes

  setCompact(on) {
    this.isCompact = on;
    if (on) this.setAway(true);
    this.layout();
  }

  setAway(away, instant = false) {
    if (away) {
      this.isEngaging = false;
      if (!this.isAwayPaused) {
        this.isAwayPaused = true;
        this.session.save();
      }
    } else if (this.isAwayPaused) {
      if (instant) this.engage();
      else if (!this.isEngaging) { this.isEngaging = true; this.engageClock = 0; }
    }
    this.refreshCurtain();
  }

  engage() {
    this.isEngaging = false;
    this.isAwayPaused = false;
    this.refreshCurtain();
  }

  refreshCurtain() {
    const fight = this.session.fight;
    const still = this.isAwayPaused && !fight.outcome;
    this.overlay.speed = still ? 0 : 1;
    this.slams.speed = this.overlay.speed;
    const show = this.isAwayPaused && !this.isCompact && !fight.outcome;
    this.curtain.hidden = !show;
    this.curtainIcon.hidden = !show || this.isEngaging;
    if (!show || !this.isEngaging) this.engageRing.hidden = true;
    if (!show) return;
    this.curtain.size(this.size.w, this.top);
    this.curtainIcon.at(this.size.w / 2, this.top / 2);
  }

  // MARK: The loop

  update(dt) {
    this.clock += dt;
    if (this.isCompact) return;
    this.calm = Prefs.reduceMotion;
    this.goreOn = Prefs.gore;
    this.carnage.gore = this.gore;
    this.hero.gore = this.goreOn;
    const fight = this.session.fight;
    const shown = this.shownFight;
    if (shown && (shown.stage !== fight.stage || shown.seed !== fight.seed || shown.mode !== fight.mode || shown.id !== this.session.fightId)) {
      this.loadFight(true);
    }
    if (this.isEngaging) {
      this.engageClock += dt;
      if (this.engageClock >= DWELL) this.engage(); else this.drawEngageRing();
    }
    let advanced = false;
    if (!this.isAwayPaused && !this.session.fight.outcome) {
      if (this.hitStop > 0) {
        this.hitStop = Math.max(0, this.hitStop - dt);
      } else {
        this.slowmo = Math.min(1, this.slowmo + dt * 1.8);
        for (const event of this.session.advance(dt * this.timeScale * this.slowmo)) this.handle(event);
        advanced = true;
      }
      this.storm(dt);
    } else if (this.session.fight.outcome && this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
    }
    while (this.impacts.length && this.clock >= this.impacts[0].at) this.impacts.shift().run();
    if (this.world.speed < 1) this.world.speed = Math.min(1, this.world.speed + dt * 0.9);
    const tc = performance.now();
    if (!this.isAwayPaused || this.session.fight.outcome) this.carnage.update(this.hitStop > 0 ? 0 : dt * this.world.speed, dt);
    this.carnageTime = performance.now() - tc;
    this.shakeWorld(dt);
    const step = advanced || this.session.fight.outcome ? dt : 0;
    this.sync(step, step > 0 ? dt : Math.max(0, Math.min(dt, this.swingUntil - (this.clock - dt))));
  }

  /** Whether the scene's own actions and particles should run this frame (paused away, only the cards' do). */
  get frozenWorld() { return this.isAwayPaused && !this.session.fight.outcome; }

  drawEngageRing() {
    if (!this.pointer) return;
    const t = this.engageClock / DWELL;
    const p = new Path2D();
    p.arc(this.pointer.x, this.pointer.y, 12, Math.PI / 2, Math.PI / 2 - t * TAU, true);
    this.engageRing.path = p;
    this.engageRing.hidden = false;
    this.refreshCurtain();
  }

  storm(dt) {
    if (this.look.weather !== 'rain') return;
    this.lightning -= dt;
    if (this.lightning > 0) return;
    this.lightning = rand(4, 9);
    this.flashSky.removeAllActions();
    if (this.calm) this.flashSky.run(A.seq(A.fadeTo(0.12, 0.25), A.fadeOut(0.9)));
    else this.flashSky.run(A.seq(A.fadeTo(0.35, 0.03), A.fadeTo(0.05, 0.08), A.fadeTo(0.25, 0.03), A.fadeOut(0.4)));
  }

  shakeWorld(dt) {
    let ox = 0, oy = 0;
    if (this.shakeAmount > 0.05) {
      const a = this.shakeAmount * this.ronin / 60;
      ox = rand(-a, a); oy = rand(-a, a);
      this.shakeAmount *= Math.pow(0.002, dt);
    } else this.shakeAmount = 0;
    if (this.bump > 0.02) {
      oy -= this.bump * this.ronin / 60;
      this.bump *= Math.pow(0.0002, dt);
    } else this.bump = 0;
    this.zoom = this.zoom > 1.0005 ? 1 + (this.zoom - 1) * Math.pow(0.0006, dt) : 1;
    this.world.setScale(this.zoom);
    this.world.at(ox + (1 - this.zoom) * this.zoomFocus.x, oy + (1 - this.zoom) * this.zoomFocus.y);
  }

  shake(amount) { this.shakeAmount = Math.max(this.shakeAmount, this.calm ? amount * 0.15 : amount); }

  footfall(sprite, x) {
    const boss = sprite.kind === 'warlord';
    const size = this.ronin * (boss ? 0.09 : 0.08);
    const dust = burst(this.look.ground.mix(this.look.horizon, 0.3).mix(RGB.white, 0.25), { count: boss ? 10 : 8, speed: this.ronin * 0.42, size,
      life: 0.42, spread: 2.2, angle: Math.PI / 2, gravity: this.ronin * 0.6, additive: false });
    dust.pAlpha = 0.55;
    dust.alphaSpeed = -0.55 / 0.42;
    this.fx.add(dust).at(x, this.groundY + 1);
    if (this.calm) return;
    const near = 1 - Math.min(1, Math.abs(x - this.heroX) / (this.field.w / 2));
    this.bump = Math.max(this.bump, (boss ? 0.9 : 0.7) * (0.35 + 0.65 * near));
  }

  kick(sprite, x) {
    const dust = burst(this.look.ground.mix(this.look.horizon, 0.3).mix(RGB.white, 0.25), { count: 4, speed: this.ronin * 0.5, size: this.ronin * 0.05,
      life: 0.25, spread: 0.6, angle: sprite.facing > 0 ? Math.PI - 0.35 : 0.35, gravity: this.ronin * 0.8, additive: false });
    dust.pAlpha = 0.4;
    dust.alphaSpeed = -0.4 / 0.25;
    this.fx.add(dust).at(x, this.groundY + 1);
  }

  flashLane(alpha, fade, color = Palette.blood) {
    this.wound.removeAllActions();
    this.wound.fill = color;
    this.wound.alpha = this.calm ? Math.min(alpha, 0.22) : alpha;
    this.wound.run(A.fadeOut(this.calm ? Math.max(fade, 0.6) : fade));
  }

  focus(point, size, color, alpha, pastEdges = false) {
    const across = this.calm ? Math.min(size, this.ronin * 4) : size;
    let lines;
    if (pastEdges && !this.calm) {
      const f = this.field;
      const corners = [[f.x, f.y], [f.x + f.w, f.y], [f.x, f.y + f.h], [f.x + f.w, f.y + f.h]];
      const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - point.x, y - point.y))) + this.ronin * 0.4;
      lines = focusLines({ hole: this.ronin * 0.5, reach, width: 3, color });
    } else {
      lines = tintedSprite(pick(Art.foci), color, across, across);
    }
    lines.at(point.x, point.y);
    lines.rotation = Math.random() * TAU;
    lines.alpha = this.calm ? Math.min(alpha, 0.3) : alpha;
    lines.z = -13;
    lines.setScale(1.25);
    lines.run(A.seq(A.scaleTo(1, 0.05), A.wait(0.06), A.group(A.fadeOut(0.12), A.scaleTo(0.9, 0.12)), A.remove()));
    this.overlay.add(lines);
    this.fx.add(flash(RGB.white, { size: Math.min(across, this.ronin * 5.5) * 0.35, duration: 0.14, alpha: lines.alpha * 0.8 })).at(point.x, point.y);
  }

  punch(amount, point) {
    if (this.calm || 1 + amount < this.zoom) return;
    this.zoom = 1 + amount;
    this.zoomFocus = point;
  }

  splatter(count, side = null) {
    const gore = this.gore;
    const n = gore.count(count);
    this.shed += n;
    for (let k = 0; k < n; k++) {
      const s = this.ronin * rand(0.45, 1.0) * gore.size;
      const splat = tintedSprite(pick(Art.splats), Palette.blood.mix(RGB.black, 0.4), s, s);
      const x = side === 'left' ? rand(0.03, 0.42) : side === 'right' ? rand(0.58, 0.97) : rand(0.04, 0.96);
      splat.at(x * this.size.w, rand(0.3, 0.92) * this.top);
      splat.rotation = rand(-0.35, 0.35);
      splat.alpha = 0.88;
      splat.setScale(0.55);
      splat.z = -12.5;
      this.overlay.add(splat);
      const run = 1.6 * gore.span;
      splat.run(A.seq(A.scaleTo(1, 0.05), A.wait(0.6 * gore.span), A.group(A.moveBy(0, -this.ronin * 0.3 * gore.span, run), A.fadeOut(run)), A.remove()));
    }
  }

  /** Makes the sprites match the fight, `dt` on (the ronin by `heroDT`). */
  sync(dt, heroDT = null) {
    const fight = this.session.fight;
    this.followBind();
    const live = new Set();
    for (const foe of fight.foes) {
      if (!foe.alive) continue;
      live.add(foe.id);
      let sprite = this.foeSprites.get(foe.id);
      if (!sprite) {
        sprite = new FoeSprite(foe, this.ronin, this.headroom, this.ambient);
        this.figures.add(sprite);
        this.foeSprites.set(foe.id, sprite);
      }
      sprite.z = foe.kind === 'warlord' ? 4 : foe.bearer && foe.phase === 'advancing' && !foe.darting ? 2.5 : 3;
      const air = foe.phase === 'leaping' ? Math.sin(foe.progress * Math.PI) * this.ronin * (foe.bearer ? FoeSprite.hop : 0.95) : 0;
      const step = sprite.updateFoe(foe, this.laneX(foe.x), this.groundY, air, this.heroX, dt, fight.turns(foe), this.calm);
      if (step !== null) {
        if (foe.kind === 'brute' || foe.kind === 'warlord') this.footfall(sprite, step);
        if (foe.kind === 'runner') this.kick(sprite, step);
      }
    }
    for (const [id, sprite] of this.foeSprites) if (!live.has(id)) { sprite.remove(); this.foeSprites.delete(id); }
    const flying = new Set();
    for (const arrow of fight.arrows) {
      flying.add(arrow.id);
      let sprite = this.arrowSprites.get(arrow.id);
      if (!sprite) {
        sprite = new ArrowSprite(arrow, this.ronin);
        sprite.z = 6;
        this.figures.add(sprite);
        this.arrowSprites.set(arrow.id, sprite);
      }
      sprite.updateArrow(arrow, this.laneX(arrow.x), this.groundY + this.ronin * 0.6);
    }
    for (const [id, sprite] of this.arrowSprites) if (!flying.has(id)) { sprite.remove(); this.arrowSprites.delete(id); }
    const g = fight.gourd;
    if (g && !fight.outcome && this.flung && this.flung.from === g.from) {
      this.flung.updateGourd(g, this.laneX(g.land), this.groundY, this.ronin, this.top, this.calm, dt);
    } else if (this.flung) {
      this.flung.mark.remove();
      this.flung.remove();
      this.flung = null;
    }
    this.hero.strain = HeroSprite.strainOf(fight.hp, fight.maxHP);
    this.hero.updateHero(heroDT ?? dt, fight.inBloodlust);
    this.followBind();
    this.refreshHUD();
  }

  refreshHUD(force = false) {
    const fight = this.session.fight;
    if (this.isCompact) { this.refreshPill(); return; }
    this.reachMarks.forEach((mark, k) => {
      mark.hidden = !Prefs.floorHints;
      const side = k === 0 ? 'left' : 'right';
      mark.x = this.laneX(sideSign(side) * fight.reachNow);
      const live = !fight.outcome && fight.target(side) !== null;
      mark.strokeColor = live ? (fight.inBloodlust ? Palette.blood : this.look.accent).mix(RGB.white, 0.35).css() : 'rgba(255,255,255,0.3)';
      mark.glowWidth = live ? 2.5 : 0;
    });
    const fs = this.fs;
    if (fight.combo !== this.shownCombo || force) {
      if (fight.combo > this.shownCombo && fight.combo >= 3) {
        this.comboLabel.removeAction('pop');
        this.comboLabel.setScale(1.35);
        this.comboLabel.run(A.scaleTo(1, 0.14).easedOut(), 'pop');
      }
      if (fight.combo === 0 && this.shownCombo >= 5 && !this.comboLabel.hidden) this.shatterCombo();
      this.shownCombo = fight.combo;
      this.comboLabel.set(String(fight.combo));
      this.comboShadow.set(this.comboLabel.text);
      this.comboLabel.fontColor = fight.inBloodlust ? Palette.blood.mix(RGB.white, 0.3).css() : fight.combo >= 10 ? Palette.gold.css() : '#fff';
      this.comboTimes.set(`×${fight.mult}`);
      this.comboTimes.fontColor = fight.inBloodlust ? Palette.blood.mix(RGB.white, 0.3).css() : Palette.gold.css();
    }
    const showCombo = fight.combo >= 3 && !fight.outcome;
    this.comboLabel.hidden = !showCombo;
    this.comboShadow.hidden = !showCombo;
    this.comboBack.hidden = !showCombo;
    this.comboTimes.hidden = !showCombo || fight.mult < 2;
    const boss = fight.boss;
    const comboY = DuelScene.comboY(this.top, fs, !!boss);
    if (this.slamNode) this.slamNode.y = DuelScene.slamY(this.field, this.top, fs, !!boss);
    const midX = this.field.x + this.field.w / 2;
    this.comboLabel.at(midX, comboY);
    this.comboShadow.at(midX + 1.5, comboY - 1.5);
    this.comboTimes.at(midX + this.comboLabel.width / 2 + 4, comboY - 3 * fs);
    this.comboBack.size(130 * fs, 56 * fs).at(midX, comboY);
    this.bossNode.hidden = !boss;
    if (boss) this.layoutBossBar(boss);
    const rageTarget = fight.inBloodlust && !fight.outcome ? (this.calm ? 0.5 : 0.5 + 0.15 * Math.sin(this.clock * 6)) : 0;
    this.rage.alpha += (rageTarget - this.rage.alpha) * 0.2;
    const lastHeart = fight.hp === 1 && !fight.outcome;
    let beatV = 0;
    if (lastHeart) {
      const lub = Math.max(0, Math.sin(this.clock * 7)), dub = Math.max(0, Math.sin(this.clock * 7 - 0.9));
      beatV = this.calm ? 0.5 : Math.pow(lub, 6) + 0.6 * Math.pow(dub, 6);
    }
    this.dread.alpha += ((lastHeart ? 0.25 + 0.5 * beatV : 0) - this.dread.alpha) * 0.3;
    this.dread.setScale(1 - 0.08 * beatV);
    if (lastHeart && this.hearts[0]) this.hearts[0].setScale(1 + 0.3 * beatV);
    else if (this.heartBeating) this.hearts[0].setScale(1);
    this.heartBeating = lastHeart;
    const hp = Math.max(0, fight.hp - this.heldHearts);
    if (hp !== this.shownHP || force) {
      if (hp < this.shownHP) {
        for (let k = hp; k < Math.min(this.shownHP, this.hearts.length); k++) this.hearts[k].run(A.seq(A.scaleTo(1.9, 0.06), A.scaleTo(1, 0.2)));
      } else if (hp > this.shownHP && !force) {
        for (let k = this.shownHP; k < Math.min(hp, this.hearts.length); k++) {
          this.hearts[k].run(A.seq(A.wait(this.heartWait), A.scaleTo(2.2, 0.08), A.scaleTo(1, 0.3)));
        }
      }
      this.shownHP = hp;
    }
    this.heartWait = 0.35;
    this.hearts.forEach((heart, k) => {
      heart.hidden = k >= fight.maxHP;
      const full = k < hp;
      heart.fillColor = full ? Palette.blood.css() : null;
      heart.strokeColor = full ? Palette.blood.mix(RGB.white, 0.35).css() : 'rgba(255,255,255,0.3)';
    });
    if (this.shardsMoving === 0) this.shownShards = fight.shards;
    this.shardPieces.forEach((piece, k) => {
      const lit = k < this.shownShards;
      piece.fillColor = lit ? Palette.gold.css() : null;
      piece.strokeColor = lit ? Palette.gold.mix(RGB.white, 0.45).css() : 'rgba(255,255,255,0.3)';
    });
    const score = grouped(this.session.runScore);
    if (this.scoreLabel.text !== score) this.scoreLabel.set(score);
  }

  layoutBossBar(boss) {
    const scoreRoom = textWidth(Fonts.heading, 13, '888,888', 0);
    const right = this.scoreLabel.x - Math.max(this.scoreLabel.width, scoreRoom) - 10;
    const room = right - this.bossLeft;
    const roomy = this.bossRoomy !== null ? this.bossRoomy && room >= 30 : room >= 60;
    this.bossRoomy = roomy;
    const width = roomy ? Math.min(200, room) : this.size.w - 24;
    const tall = roomy ? 7 : 4;
    if (!this.bossShape || this.bossShape.width !== width || this.bossShape.roomy !== roomy) {
      this.bossShape = { width, roomy };
      if (roomy) this.bossNode.at(this.bossLeft + room / 2, this.top + HEADER / 2 + 1.5);
      else this.bossNode.at(this.size.w / 2, this.top + 3);
      const p = new Path2D();
      p.roundRect(-width / 2, -tall / 2, width, tall, tall / 2);
      this.bossTrack.path = p;
      const crest = this.bossNode.childNamed('crest');
      crest.hidden = !roomy;
      crest.at(-width / 2 - 12, 1);
    }
    const whole = Math.max(1, boss.maxHP);
    this.bossFill.size(Math.max(0, (width - 2) * boss.hp / whole), tall - 2).at(-width / 2 + 1, 0);
    const calls = [Math.floor(boss.maxHP * 3 / 4), Math.floor(boss.maxHP / 2), Math.floor(boss.maxHP / 4)];
    calls.forEach((call, k) => {
      const tick = this.bossNode.childNamed('tick' + (k + 1));
      tick.size(1, roomy ? 9 : 6).at(-width / 2 + 1 + (width - 2) * call / whole, 0);
      tick.hidden = (boss.summons || 0) > k;
    });
  }

  shatterCombo() {
    const text = this.comboLabel.text;
    const n = text.length;
    [...text].forEach((ch, k) => {
      const shard = new Label(Fonts.heading, this.comboLabel.fontSize, 'rgb(179,179,179)');
      shard.set(ch);
      const offset = (k - (n - 1) / 2) * this.comboLabel.fontSize * 0.5;
      shard.at(this.comboLabel.x + offset, this.comboLabel.y);
      this.overlay.add(shard);
      const drift = offset * 0.6 + rand(-6, 6);
      shard.run(A.seq(A.group(A.moveBy(drift, -this.ronin * 0.7, 0.55).easedIn(), A.rotateBy(rand(-1.2, 1.2), 0.55), A.fadeOut(0.55)), A.remove()));
    });
  }

  refreshPill() {
    const fight = this.session.fight;
    this.pillLabel.set((this.session.isEndless ? '∞ ' : 'STAGE ') + fight.stage, 1.2);
    this.pillHearts.forEach((heart, k) => {
      heart.hidden = k >= fight.maxHP;
      const full = k < fight.hp;
      heart.fillColor = full ? Palette.blood.css() : null;
      heart.strokeColor = full ? null : 'rgba(255,255,255,0.35)';
    });
    this.pillValue.set(fight.outcome === 'victory' ? 'WON' : fight.outcome === 'defeat' ? 'FELL' : brief(this.session.runScore));
  }

  at(p, node) { node.at(p.x, p.y); return node; }
  later(seconds, fn) {
    this.impacts.push({ at: this.clock + seconds, run: fn });
    this.impacts.sort((a, b) => a.at - b.at);
  }

  // MARK: Input

  headerHit(p) {
    if (this.isCompact) return 'drag';
    if (p.y < this.top) return 'none';
    if (Math.hypot(p.x - this.closeButton.x, p.y - this.closeButton.y) <= 10) return 'close';
    if (Math.hypot(p.x - this.compactButton.x, p.y - this.compactButton.y) <= 10) return 'compact';
    return 'drag';
  }

  pointerMoved(p) {
    this.pointer = p;
    if (this.isEngaging) this.drawEngageRing();
  }

  /** A mouse button (or key, or tap) for one side: a cut that way. Past a finished stage it goes on; while paused it
   *  resumes without cutting. */
  press(side) {
    if (this.isCompact) return;
    if (this.session.fight.outcome) {
      if (this.banner && this.clock - this.bannerShownAt > 0.5) this.advanceFromBanner();
      return;
    }
    if (this.isAwayPaused) { this.engage(); return; }
    this.strike(side);
  }

  strike(side) {
    if (this.isAwayPaused || this.isCompact || this.session.fight.outcome) return;
    for (const event of this.session.strike(side)) this.handle(event);
    this.sync(0);
  }

  /** Space or Return: goes on past a card, or resumes. */
  goOn() {
    if (this.session.fight.outcome) { if (this.banner) this.advanceFromBanner(); }
    else if (this.isAwayPaused) this.engage();
  }

  advanceFromBanner() {
    if (!this.session.fight.outcome) return;
    this.session.next();
    this.loadFight(true);
    this.engage();
    if (this.onChange) this.onChange();
  }

  get isShowingBanner() { return !!this.banner; }
}
