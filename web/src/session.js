// session.js: the app's Session.swift: the career and the fight in progress, played through the core and saved as they
// change (in this browser's local storage, if it keeps any), and the settings (the app's user defaults).

const Prefs = {
  sizes: [{ title: 'Small', width: 340 }, { title: 'Medium', width: 420 }, { title: 'Large', width: 520 }],
  get size() { const v = Store.get('size'); const n = v === null ? 2 : +v; return n >= 0 && n <= 2 ? n : 2; },
  set size(v) { Store.set('size', String(v)); },
  get pauseWhenAway() { return Store.bool('pauseWhenAway', true); },
  set pauseWhenAway(v) { Store.setBool('pauseWhenAway', v); },
  get dimWhenAway() { return Store.bool('dimWhenAway', true); },
  set dimWhenAway(v) { Store.setBool('dimWhenAway', v); },
  get compact() { return Store.bool('compact', false); },
  set compact(v) { Store.setBool('compact', v); },
  get visible() { return Store.bool('visible', true); },
  set visible(v) { Store.setBool('visible', v); },
  get floorHints() { return Store.bool('floorHints', false); },
  set floorHints(v) { Store.setBool('floorHints', v); },
  get hintShown() { return Store.bool('hintShown', false); },
  set hintShown(v) { Store.setBool('hintShown', v); },
  get gore() { return Store.bool('gore', true); },
  set gore(v) { Store.setBool('gore', v); },
  get autopilot() { return Store.bool('autopilot', false); },
  set autopilot(v) { Store.setBool('autopilot', v); },
  get shortcut() { const v = +(Store.get('shortcut') ?? 0); return v >= 0 && v <= 2 ? v : 0; },
  set shortcut(v) { Store.set('shortcut', String(v)); },
  /** Follows the system's (the browser's prefers-reduced-motion) until chosen. */
  systemReduceMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } },
  get reduceMotion() { const v = Store.get('reduceMotion'); return v === null ? Prefs.systemReduceMotion() : v === '1'; },
  set reduceMotion(v) { if (v === Prefs.systemReduceMotion()) Store.remove('reduceMotion'); else Store.setBool('reduceMotion', v); },
  /** Only the rules set away from the game's are stored ("crowd." and its name). */
  crowdRules: ['passThrough', 'slipPast', 'runnersPassAll', 'passBusy', 'shove', 'noBruteKnockback'],
  crowding(standard) {
    const read = { ...standard };
    for (const name of Prefs.crowdRules) { const v = Store.get('crowd.' + name); if (v !== null) read[name] = v === '1'; }
    return read;
  },
  setCrowding(rules, standard) {
    for (const name of Prefs.crowdRules) {
      if (!!rules[name] === !!standard[name]) Store.remove('crowd.' + name); else Store.setBool('crowd.' + name, !!rules[name]);
    }
  },
};


/** The fight as the scene reads it: the core's `state()`, with the few questions the app asks of Fight answered
 *  from it. */
class FightView {
  constructor(s) {
    this.raw = s;
    for (const key of Object.keys(s)) if (!FightView.derived.has(key)) this[key] = s[key];
    this.bossStage = !!(s.difficulty?.boss ?? s.stage % 5 === 0);
    this.foes = (s.foes || []).map(normalizeFoe);
    this.arrows = s.arrows || [];
    this.stats = s.stats || {};
    this.mode = s.mode || 'bushido';
    this.setting = s.settingIndex ?? settingOf(s.stage);
    this.outcome = s.outcome ?? null;
    this.gourd = s.gourd ? normalizeGourd(s.gourd) : null;
    this.bossID = s.bossID ?? null;
    this.targets = s.target || null;
    this.facing = s.hero?.facing ?? 'right';
    this.stumble = s.hero?.stumble ?? 0;
  }
  get inBloodlust() { return !!this.bloodlust; }
  get reachNow() { return this.reach; }
  get mult() { return this.multiplier; }
  get isStumbling() { return this.stumble > 0; }
  get boss() { return this.bossID === null ? null : this.foes.find((f) => f.id === this.bossID) || null; }
  get isBossStage() { return this.boss !== null || this.bossStage; }
  foe(id) { return this.foes.find((f) => f.id === id) || null; }
  /** What a cut to `side` would hit now (Fight.target), or null. */
  target(side) { return this.targets ? this.targets[side] || null : null; }
  /** Whether a cut at `foe` now would turn his blow aside (Fight.turns). */
  turns(foe) { return !!foe.turns; }
}
/** What the view works out itself (never copied over from the state). */
FightView.derived = new Set(['boss', 'target', 'hero', 'inBloodlust', 'reachNow', 'mult', 'isStumbling', 'isBossStage', 'turns', 'foe']);

function normalizeFoe(f) {
  const span = f.span ?? 0;
  const distance = f.distance ?? Math.abs(f.x);
  return Object.assign({}, f, {
    progress: f.progress ?? (span > 0 ? clamp(1 - f.timer / span, 0, 1) : 1),
    distance,
    contact: f.contact ?? KindInfo[f.kind].range,
    gap: f.gap ?? distance - KindInfo[f.kind].width / 2,
    darting: !!f.darting,
    bearer: !!f.bearer,
  });
}

function normalizeGourd(g) {
  const progress = g.progress ?? (g.span > 0 ? clamp(1 - g.timer / g.span, 0, 1) : 1);
  return Object.assign({}, g, { progress, x: g.x ?? g.start + (g.land - g.start) * progress, catchable: !!g.catchable });
}

/** The career and the fight in progress (the app's GameSession), played through the core. */
class Session {
  constructor(core) {
    this.core = core;
    this.promotion = null;
    this.fightId = 0;
    const saved = Store.get('save');
    let loaded = false;
    if (saved) {
      try { loaded = !!core.loadSave(saved); } catch { loaded = false; }
      // A save that cannot be read is set aside, never written over.
      if (!loaded) Store.set('save.unreadable-' + new Date().toISOString().replace(/:/g, '-'), saved);
    }
    if (!loaded) core.newGame({});
    this.standard = core.standardRules();
    this.applyRules(Prefs.crowding(this.standard));
    this.pilot = Prefs.autopilot;
    core.setAutopilot(this.pilot);
    this.refresh(true);
  }

  refresh(career = false) {
    this.fight = new FightView(this.core.state());
    if (career || !this.careerCache) this.careerCache = this.core.career();
  }
  get career() { return this.careerCache; }
  get isEndless() { return !!this.career.isEndless; }

  get rules() { return this.core.rules(); }
  applyRules(rules) { this.core.setRules(rules); }
  setRules(rules) {
    const only = {};
    for (const name of Prefs.crowdRules) only[name] = !!rules[name];
    Prefs.setCrowding(only, this.standard);
    this.applyRules(only);
  }

  get autopilot() { return this.pilot; }
  setAutopilot(on) { this.pilot = !!on; Prefs.autopilot = this.pilot; this.core.setAutopilot(this.pilot); this.refresh(false); }

  /** The run's score so far: every stage of it, this one included; after a fall, the run that just ended. */
  get runScore() { return this.fight.runScore ?? this.fight.score; }

  /** A fight that ends is booked (by the core) and saved on the spot. */
  conclude(events) {
    for (const e of events) if (e.type === 'promotion') this.promotion = e.rank;
    if (!events.some((e) => e.type === 'ended')) return;
    this.refresh(true);
    this.promotion = this.promotion ?? this.fight.promotion ?? this.career.promotion ?? null;
    this.save();
  }

  advance(dt) {
    const events = this.core.advance(dt);
    this.refresh(false);
    this.conclude(events);
    if (this.fight.saveDue) this.save();
    return events;
  }

  strike(side) {
    const events = this.core.strike(side);
    this.refresh(false);
    this.conclude(events);
    return events;
  }

  /** Past the banner: the next stage; after a fall, the first stage again (or the endless run's first). */
  next() { this.act(() => this.core.next()); }

  /** A menu action: each leaves a fight in progress as a restart leaves it (the core books that). */
  act(fn) {
    fn();
    this.fightId++;
    this.promotion = null;
    this.refresh(true);
    this.save();
  }
  restart() { this.act(() => this.core.restart()); }
  choose(mode) { this.act(() => this.core.choose(mode)); }
  startEndless(stage) { this.act(() => this.core.startEndless(stage)); }
  leaveEndless() { this.act(() => this.core.leaveEndless()); }
  reset() { this.act(() => this.core.reset({})); }
  jump(stage) { this.act(() => this.core.jump(stage)); }

  /** The stage's title card, as the core words it (DuelScene.introduce). */
  card(stage) { try { return this.core.stage(stage).card; } catch { return null; } }

  save() {
    try { Store.set('save', this.core.saveJSON()); } catch { /* not kept */ }
  }
}
