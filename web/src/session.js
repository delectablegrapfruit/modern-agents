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

const STANDARD_RULES = { passThrough: false, slipPast: true, runnersPassAll: true, passBusy: true, shove: true, noBruteKnockback: true };

/** The fight as the scene reads it: the core's state, with the few things the app asks of Fight worked out here. */
class FightView {
  constructor(s, tuning) {
    this.raw = s;
    for (const key of Object.keys(s)) if (!FightView.derived.has(key)) this[key] = s[key];
    this.bossStage = typeof s.boss === 'boolean' ? s.boss : s.difficulty?.boss ?? s.stage % 5 === 0;
    this.tuning = tuning;
    this.foes = (s.foes || []).map((f) => normalizeFoe(f));
    this.arrows = s.arrows || [];
    this.stats = s.stats || {};
    this.mode = s.mode || 'bushido';
    this.maxHP = s.maxHP ?? s.maxHp ?? ModeInfo[this.mode].hearts;
    this.setting = s.setting ?? settingOf(s.stage);
    if (typeof this.setting === 'string') this.setting = Math.max(0, Settings8.indexOf(this.setting));
    this.combo = s.combo ?? 0;
    this.outcome = s.outcome ?? null;
    this.gourd = s.gourd ? normalizeGourd(s.gourd) : null;
    this.bossID = s.bossID ?? s.bossId ?? null;
  }
  get inBloodlust() { return this.bloodlust ?? this.combo >= Tuning.bloodlust; }
  get reachNow() { return this.reach ?? (this.inBloodlust ? Tuning.bloodlustReach : Tuning.reach); }
  get mult() { return this.multiplier ?? Math.min(8, 1 + Math.floor(this.combo / 10)); }
  get isStumbling() { return (this.stumble ?? 0) > 0; }
  get boss() { return this.bossID === null ? null : this.foes.find((f) => f.id === this.bossID) || null; }
  get isBossStage() { return this.boss !== null || this.bossStage; }
  get gourdBonus() { return Math.round(Tuning.gourdPoints * ({ shoshin: 0.5, bushido: 1, shura: 1.6, oni: 3 }[this.mode] || 1)); }
  foe(id) { return this.foes.find((f) => f.id === id) || null; }
  /** Whether a cut to `side` would find something now (Fight.target). */
  target(side) {
    if (this.targets && side in this.targets) return this.targets[side] || null;
    const reach = this.reachNow;
    const g = this.gourd;
    if (g && g.catchable && sideOf(g.land) === side && Math.abs(g.x) <= reach) return { gourd: true };
    let best = null, dist = Infinity;
    for (const f of this.foes) {
      if (f.targetable && sideOf(f.x) === side && f.gap <= reach && f.gap < dist) { best = { foe: f.id }; dist = f.gap; }
    }
    for (const a of this.arrows) {
      if (!a.deflected && sideOf(a.x) === side && Math.abs(a.x) <= reach && Math.abs(a.x) < dist) { best = { arrow: a.id }; dist = Math.abs(a.x); }
    }
    return best;
  }
  /** Whether a cut at `foe` now would turn his blow aside (Fight.turns). */
  turns(foe) { return !!(foe.glare ?? foe.turns ?? false); }
}

/** The fight's own names for what the view works out (never copied over from the state). */
FightView.derived = new Set(['boss', 'inBloodlust', 'reachNow', 'mult', 'isStumbling', 'isBossStage', 'gourdBonus', 'target', 'turns', 'foe']);

function normalizeFoe(f) {
  const kind = f.kind;
  const info = KindInfo[kind] || KindInfo.grunt;
  const span = f.span ?? 0;
  const progress = f.progress ?? (span > 0 ? clamp(1 - f.timer / span, 0, 1) : 1);
  const distance = f.distance ?? Math.abs(f.x);
  const phase = f.phase;
  return Object.assign({}, f, {
    kind, progress, distance, maxHP: f.maxHP ?? f.maxHp ?? f.hp,
    contact: f.contact ?? info.range,
    gap: f.gap ?? distance - info.width / 2,
    alive: f.alive ?? phase !== 'dying',
    targetable: f.targetable ?? (phase !== 'dying' && phase !== 'leaping'),
    guardSet: f.guardSet ?? (phase === 'guarding' && span - f.timer >= Tuning.guardRise - 1e-9),
    guardAge: f.guardAge ?? (phase === 'guarding' ? span - f.timer : 0),
    readying: f.readying ?? (f.bearer && phase === 'advancing' && !f.darting && f.hover < Tuning.dartTell),
    darting: !!f.darting, bearer: !!f.bearer,
  });
}

function normalizeGourd(g) {
  const progress = g.progress ?? (g.span > 0 ? clamp(1 - g.timer / g.span, 0, 1) : 1);
  return Object.assign({}, g, {
    progress, x: g.x ?? g.start + (g.land - g.start) * progress,
    catchable: g.catchable ?? g.timer <= Tuning.catchWindow + 1e-9,
  });
}

/** An event from the core, by the names the scene handles (FightEvent). */
function normalizeEvent(e) {
  if (!e || !e.type) return e;
  const out = { ...e };
  if (out.type === 'bloodlust' && out.on === undefined) out.on = !!(e.value ?? e.active ?? e.bloodlust);
  if (out.type === 'milestone' && out.count === undefined) out.count = e.n ?? e.value ?? e.combo;
  if (out.type === 'ended' && out.outcome === undefined) out.outcome = e.value ?? e.result;
  if (out.type === 'wounded' && out.foe === undefined) out.foe = null;
  return out;
}

class Session {
  constructor(core) {
    this.core = core;
    this.promotion = null;
    this.unsaved = 0;
    const saved = Store.get('save');
    let loaded = false;
    if (saved) {
      try { loaded = !!core.loadSave(saved); } catch { loaded = false; }
      if (!loaded) Store.set('save.unreadable', saved);
    }
    if (!loaded) core.newGame({ seed: Math.floor(Math.random() * 2 ** 31) + 1 });
    this.standard = typeof core.standardRules === 'function' ? core.standardRules() : { ...STANDARD_RULES };
    this.applyRules(Prefs.crowding(this.standard));
    this.setAutopilot(Prefs.autopilot);
    this.refresh(true);
  }

  refresh(career = false) {
    this.fight = new FightView(this.core.state(), Tuning);
    if (career || !this.careerCache) this.careerCache = this.core.career();
  }
  get career() { return this.careerCache; }
  get isEndless() { const c = this.career; return !!(c.isEndless ?? c.endless); }

  get rules() { return typeof this.core.rules === 'function' ? this.core.rules() : { ...this.standard }; }
  applyRules(rules) { if (typeof this.core.setRules === 'function') this.core.setRules(rules); }
  setRules(rules) { Prefs.setCrowding(rules, this.standard); this.applyRules(rules); }

  get autopilot() { return !!this.pilot; }
  setAutopilot(on) { this.pilot = !!on; Prefs.autopilot = this.pilot; this.core.setAutopilot(this.pilot); }

  /** The run's score so far: every stage of it, this one included; after a fall, the run that just ended. */
  get runScore() {
    const c = this.career, f = this.fight;
    if (typeof c.runScore === 'number') return c.runScore;
    const run = c.endless || (c.runs && c.runs[c.mode]) || null;
    if (!f.outcome) return (run ? run.score : 0) + f.score;
    if (f.outcome === 'victory') return Math.max(run ? run.score : 0, f.score);
    const last = c.lastRun;
    return last && last.stage === f.stage && last.score >= f.score ? last.score : f.score;
  }

  conclude(events) {
    if (!events.some((e) => e.type === 'ended')) return;
    this.refresh(true);
    this.promotion = this.career.promotion ?? this.career.promoted ?? null;
    this.save();
  }

  advance(dt) {
    const events = (this.core.advance(dt) || []).map(normalizeEvent);
    this.refresh(false);
    this.unsaved += dt;
    this.conclude(events);
    if (this.unsaved > 10) this.save();
    return events;
  }

  strike(side) {
    const events = (this.core.strike(side) || []).map(normalizeEvent);
    this.refresh(false);
    this.conclude(events);
    return events;
  }

  /** The next fight (what clicking the banner does). */
  next() {
    this.promotion = null;
    this.core.next();
    this.core.setAutopilot(this.pilot);
    this.refresh(true);
    this.save();
  }

  /** The menu's actions, each leaving a fight in progress as a restart leaves it. */
  act(fn) { fn(); this.core.setAutopilot(this.pilot); this.promotion = null; this.refresh(true); this.save(); }
  restart() { this.act(() => (this.core.restart ? this.core.restart() : this.core.begin({ restart: true }))); }
  choose(mode) { this.act(() => this.core.begin({ mode })); }
  startEndless(stage) { this.act(() => this.core.begin({ endless: true, stage })); }
  leaveEndless() { this.act(() => this.core.begin({ endless: false })); }
  reset() {
    const mode = this.career.mode;
    this.act(() => { this.core.newGame({ seed: Math.floor(Math.random() * 2 ** 31) + 1 }); if (mode !== 'bushido') this.core.begin({ mode }); });
  }
  jump(stage) { this.act(() => this.core.begin({ stage })); }

  save() {
    this.unsaved = 0;
    try { Store.set('save', this.core.saveJSON()); } catch { /* not kept */ }
  }
}
