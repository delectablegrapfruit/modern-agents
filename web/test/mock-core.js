// A stand-in for the WebAssembly core, for developing the presentation before core.js lands: RoninCore's Fight,
// Difficulty and Career ported loosely to JS, and stick figures for sketches. Test use only: never published.

const T = {
  step: 1 / 120, edge: 1.08, reach: 0.35, bloodlustReach: 0.42, bloodlust: 20, body: 0.05, figure: 0.312, cooldown: 0.075,
  stumble: 0.34, archerRange: 0.64, arrowSpeed: 0.78, deflectSpeed: 2.2, leap: 0.42, landing: 0.23, firstSpawn: 1.5,
  parried: 0.3, guardRise: 0.24, quickBlow: 0.3, dartWindup: 0.32, dartPace: 5.0, dartTell: 0.3, bearerWait: 0.8,
  bearerDarts: 3, bearerStay: 8.0, spring: 0.3, gourdFlight: 1.0, catchWindow: 0.2, gourdLanding: 0.15, parryWindow: 0.3,
  bruteStagger: 0.7, gourdPoints: 500, senNoSen: 0.15, shardsPerHeart: 3,
};
const K = {
  grunt: { hp: 1, speed: 0.30, windup: 0.72, damage: 1, range: 0.28, width: 0.085, bounty: 100 },
  runner: { hp: 1, speed: 0.56, windup: 0.46, damage: 1, range: 0.13, width: 0.075, bounty: 120 },
  brute: { hp: 3, speed: 0.19, windup: 0.86, damage: 2, range: 0.2, width: 0.11, bounty: 250 },
  dancer: { hp: 2, speed: 0.34, windup: 0.52, damage: 1, range: 0.14, width: 0.085, bounty: 200 },
  archer: { hp: 1, speed: 0.26, windup: 0.95, damage: 1, range: 0.12, width: 0.085, bounty: 150 },
  warlord: { hp: 12, speed: 0.22, windup: 0.72, damage: 2, range: 0.2, width: 0.12, bounty: 2000 },
};
const MODES = ['shoshin', 'bushido', 'shura', 'oni'];
const MI = (m) => MODES.indexOf(m);
const MODE = {
  hearts: [7, 5, 4, 3], pace: [0.85, 1, 1.2, 1.45], windup: [1.25, 1, 0.8, 0.62], interval: [1.2, 1, 0.82, 0.66],
  stumble: [0.75, 1, 1.2, 1.4], crowd: [-1, 0, 1, 3], reach: [1.08, 1, 0.97, 0.92], score: [0.5, 1, 1.6, 3],
};
const STANDARD = { passThrough: false, slipPast: true, runnersPassAll: true, passBusy: true, shove: true, noBruteKnockback: true };

class RNG {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  unit() { let t = (this.s += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a, b) { return a + (b - a) * this.unit(); }
  chance(p) { return this.unit() < p; }
}

function difficulty(stage, mode) {
  const s = Math.max(1, stage) - 1, m = MI(mode);
  const beyond = Math.max(0, stage - 25);
  return {
    stage, mode,
    pace: (Math.min(1.75, 1 + 0.04 * s) + Math.min(0.25, 0.01 * beyond)) * MODE.pace[m],
    windup: Math.max(0.55, 1 - 0.028 * s) * MODE.windup[m],
    interval: Math.max(0.34, 1.3 - 0.07 * s) * MODE.interval[m],
    crowd: Math.max(2, Math.min(10, 3 + Math.floor((stage + 1) / 2)) + MODE.crowd[m]),
    pairs: Math.min(0.35, s * 0.03),
    boss: stage % 5 === 0,
    warlordHP: Math.min(40, 12 + 4 * Math.max(0, Math.floor(stage / 5) - 1)),
    dancerHP: stage >= 12 ? 3 : 2,
  };
}

function roster(d, rng) {
  const count = Math.min(72, 12 + 4 * d.stage);
  const w = [['grunt', 1]];
  if (d.stage >= 2) w.push(['runner', Math.min(0.8, 0.3 + 0.02 * d.stage)]);
  if (d.stage >= 3) w.push(['brute', Math.min(0.4, 0.16 + 0.012 * d.stage)]);
  if (d.stage >= 4) w.push(['archer', Math.min(0.3, 0.12 + 0.01 * d.stage)]);
  if (d.stage >= 6) w.push(['dancer', Math.min(0.45, 0.14 + 0.015 * d.stage)]);
  const total = w.reduce((t, x) => t + x[1], 0);
  const r = ['grunt', 'grunt', 'grunt'];
  const intro = { 2: 'runner', 3: 'brute', 4: 'archer', 6: 'dancer' }[d.stage];
  if (intro) r.push(intro);
  while (r.length < count) {
    let roll = rng.unit() * total, pick = 'grunt';
    for (const [k, x] of w) { roll -= x; if (roll < 0) { pick = k; break; } }
    r.push(pick);
  }
  if (d.boss) r.push('warlord');
  return r;
}

class Fight {
  constructor(stage, seed, mode, hearts, shards) {
    this.stage = stage; this.seed = seed; this.mode = mode;
    this.d = difficulty(stage, mode);
    this.rng = new RNG(seed);
    this.roster = roster(this.d, this.rng);
    const cands = this.roster.map((k, i) => i).filter((i) => i >= 4 && (this.roster[i] === 'grunt' || this.roster[i] === 'runner'));
    this.bearerIndex = cands.length ? cands[Math.floor(this.rng.unit() * cands.length)] : null;
    this.time = 0; this.maxHP = MODE.hearts[MI(mode)]; this.hp = hearts ? Math.max(1, Math.min(this.maxHP, hearts)) : this.maxHP;
    this.foes = []; this.arrows = []; this.arrived = 0; this.defeated = 0; this.nextID = 1; this.spawnTimer = T.firstSpawn;
    this.cooldown = 0; this.held = null; this.stumble = 0; this.facing = 'right'; this.combo = 0; this.score = 0; this.bonus = 0;
    this.stats = { kills: 0, cuts: 0, whiffs: 0, deflects: 0, arrowKills: 0, wounds: 0, damage: 0, bestCombo: 0, parried: 0, glanced: 0, turned: 0 };
    this.outcome = null; this.bossID = null; this.healed = false; this.gourd = null; this.shards = Math.max(0, Math.min(2, shards || 0));
    this.pilot = false; this.crowding = { ...STANDARD }; this.acc = 0;
  }
  get bloodlust() { return this.combo >= T.bloodlust; }
  get reach() { return (this.bloodlust ? T.bloodlustReach : T.reach) * MODE.reach[MI(this.mode)]; }
  get multiplier() { return Math.min(8, 1 + Math.floor(this.combo / 10)); }
  points(n) { return Math.round(n * MODE.score[MI(this.mode)]); }
  foe(id) { return this.foes.find((f) => f.id === id); }
  sideOf(x) { return x < 0 ? 'left' : 'right'; }
  sign(s) { return s === 'left' ? -1 : 1; }
  gap(f) { return Math.abs(f.x) - K[f.kind].width / 2; }
  targetable(f) { return f.phase !== 'dying' && f.phase !== 'leaping'; }
  progress(f) { return f.span > 0 ? Math.min(1, Math.max(0, 1 - f.timer / f.span)) : 1; }
  guardSet(f) { return f.phase === 'guarding' && f.span - f.timer >= T.guardRise - 1e-9; }
  senNoSen(f) { return f.phase === 'windup' && f.timer <= T.senNoSen + 1e-9; }
  clubGlares(f) { return f.kind === 'brute' && f.phase === 'windup' && f.timer <= T.parryWindow + 1e-9; }
  turns(f) { return this.crowding.noBruteKnockback && this.clubGlares(f) && f.hp > 1; }
  enter(f, phase, t) { f.phase = phase; f.timer = t; f.span = t; }
  target(side) {
    const reach = this.reach;
    const g = this.gourd;
    if (g && g.timer <= T.catchWindow + 1e-9 && this.sideOf(g.land) === side && Math.abs(this.gx(g)) <= reach) return { gourd: true };
    let best = null, dist = Infinity;
    for (const f of this.foes) if (this.targetable(f) && this.sideOf(f.x) === side && this.gap(f) <= reach && this.gap(f) < dist) { best = { foe: f.id }; dist = this.gap(f); }
    for (const a of this.arrows) if (!a.deflected && this.sideOf(a.x) === side && Math.abs(a.x) <= reach && Math.abs(a.x) < dist) { best = { arrow: a.id }; dist = Math.abs(a.x); }
    return best;
  }
  gx(g) { const p = g.span > 0 ? Math.min(1, Math.max(0, 1 - g.timer / g.span)) : 1; return g.start + (g.land - g.start) * p; }
  step(dt) {
    const ev = [];
    if (this.outcome) return ev;
    this.acc += Math.max(0, dt);
    while (this.acc >= T.step && !this.outcome) { this.acc -= T.step; this.tick(ev); }
    return ev;
  }
  strike(side) { const ev = []; this.strikeInto(side, ev); this.foes = this.foes.filter((f) => f.phase !== 'dying'); this.settle(ev); return ev; }
  strikeInto(side, ev) {
    if (this.outcome || this.stumble > 0) return;
    if (this.cooldown > 0) { this.held = side; return; }
    this.facing = side;
    const t = this.target(side);
    if (t && t.arrow) {
      const a = this.arrows.find((x) => x.id === t.arrow);
      a.deflected = true; a.velocity = this.sign(side) * T.deflectSpeed; this.cooldown = T.cooldown; this.stats.deflects++;
      this.score += this.points(50 * this.multiplier); ev.push({ type: 'deflected', side, arrow: a.id }); this.raise(ev);
    } else if (t && t.gourd) {
      const g = this.gourd; this.gourd = null; this.cooldown = T.cooldown;
      const restored = this.hp < this.maxHP; if (restored) this.hp++; else this.score += this.points(T.gourdPoints);
      ev.push({ type: 'healed', foe: g.from, restored });
    } else if (t && t.foe && this.foe(t.foe).phase === 'guarding') {
      const f = this.foe(t.foe);
      if (!this.guardSet(f)) { this.cooldown = T.cooldown; this.stats.glanced++; ev.push({ type: 'parried', side, foe: f.id }); return; }
      this.stumble = T.parried * MODE.stumble[MI(this.mode)]; this.stats.parried++; this.brk(ev);
      ev.push({ type: 'parried', side, foe: f.id });
      const riposte = Math.abs(f.x) <= K[f.kind].range + 0.06;
      this.enter(f, riposte ? 'windup' : 'advancing', riposte ? f.windup * 0.45 : 0); f.chained = riposte; f.guardRest = this.rng.range(0.9, 1.6);
      if (riposte) ev.push({ type: 'raised', foe: f.id });
    } else if (t && t.foe && this.turns(this.foe(t.foe))) {
      const f = this.foe(t.foe); this.cooldown = T.cooldown; this.stats.turned++; this.enter(f, 'recoil', T.bruteStagger); f.chained = false;
      this.score += this.points(50 * this.multiplier); ev.push({ type: 'turned', side, foe: f.id }); this.raise(ev);
    } else if (t && t.foe) {
      const f = this.foe(t.foe); this.cooldown = T.cooldown; this.stats.cuts++;
      const late = this.senNoSen(f); const after = [];
      const killed = this.wound(f, false, after);
      ev.push({ type: 'cut', side, foe: f.id, killed }); ev.push(...after);
      if (killed && late) this.earnShard(f.id, ev);
    } else {
      this.stumble = T.stumble * MODE.stumble[MI(this.mode)]; this.stats.whiffs++; this.brk(ev); ev.push({ type: 'whiff', side });
    }
  }
  tick(ev) {
    const h = T.step; this.time += h;
    if (this.pilot) this.pilotAct(ev);
    if (this.stumble > 0) this.stumble = Math.max(0, this.stumble - h);
    if (this.cooldown > 0) { this.cooldown = Math.max(0, this.cooldown - h); if (this.cooldown === 0 && this.held) { const s = this.held; this.held = null; this.strikeInto(s, ev); } }
    this.arrive(ev); this.march(ev); this.fly(ev); this.toss(ev);
    this.foes = this.foes.filter((f) => f.phase !== 'dying'); this.settle(ev);
  }
  pilotAct(ev) {
    if (this.stumble > 0 || this.cooldown > 0) return;
    let best = null;
    for (const side of ['left', 'right']) {
      const near = this.foes.filter((f) => this.targetable(f) && this.sideOf(f.x) === side).sort((a, b) => this.gap(a) - this.gap(b))[0];
      if (near && near.phase === 'guarding') continue;
      const t = this.target(side);
      if (!t) continue;
      let u = 1;
      if (t.foe) { const f = this.foe(t.foe); u = f.phase === 'windup' ? f.timer : 1 + this.gap(f); }
      if (t.arrow) u = 0.1;
      if (t.gourd) u = 0;
      if (!best || u < best.u) best = { side, u };
    }
    if (best) this.strikeInto(best.side, ev);
  }
  settle(ev) {
    if (this.outcome) return;
    if (this.hp <= 0) { this.hp = 0; this.outcome = 'defeat'; ev.push({ type: 'ended', outcome: 'defeat' }); }
    else if (this.defeated >= this.roster.length && !this.gourd) {
      this.outcome = 'victory'; this.bonus = this.points(250 * this.stage + 150 * this.hp + (this.stats.damage === 0 ? 500 * this.stage : 0));
      this.score += this.bonus; this.arrows = []; ev.push({ type: 'ended', outcome: 'victory' });
    }
  }
  arrive(ev) {
    if (this.arrived >= this.roster.length) return;
    this.spawnTimer -= T.step; if (this.spawnTimer > 0) return;
    const kind = this.roster[this.arrived];
    const standing = this.foes.filter((f) => f.phase !== 'dying').length;
    if (kind === 'warlord') { if (standing) { this.spawnTimer = 0.25; return; } } else if (standing >= this.d.crowd) { this.spawnTimer = 0.2; return; }
    const blocked = (side) => this.foes.some((f) => f.phase !== 'dying' && this.sideOf(f.x) === side && ((f.phase !== 'leaping' && Math.abs(f.x) > T.edge - 0.13) || (kind === 'archer' && f.kind === 'archer')));
    let side = this.rng.chance(0.5) ? 'left' : 'right';
    if (blocked(side)) side = side === 'left' ? 'right' : 'left';
    if (blocked(side)) { this.spawnTimer = 0.15; return; }
    let hp = kind === 'warlord' ? this.d.warlordHP : kind === 'dancer' ? this.d.dancerHP : K[kind].hp;
    const f = this.make(kind, this.sign(side) * T.edge, hp, K[kind].speed * this.d.pace * this.rng.range(0.92, 1.08));
    if (this.arrived === this.bearerIndex) { f.bearer = true; f.hp = Math.max(f.hp, 2); f.maxHP = f.hp; f.hover = T.bearerWait; }
    this.foes.push(f); this.arrived++;
    if (kind === 'warlord') { this.bossID = f.id; ev.push({ type: 'warlord', foe: f.id }); } else ev.push({ type: 'arrived', foe: f.id });
    this.spawnTimer = this.d.interval * this.rng.range(0.55, 1.45);
    if (this.rng.chance(this.d.pairs)) this.spawnTimer = Math.min(this.spawnTimer, 0.2);
  }
  make(kind, x, hp, speed) {
    return { id: this.nextID++, kind, x, hp, maxHP: hp, speed, windup: K[kind].windup * this.d.windup, phase: 'advancing', timer: 0, span: 0,
      leapFrom: 0, leapTo: 0, hits: 0, bearer: false, hover: 0, darting: false, darts: 0, lingered: 0, guardRest: 0, chained: false, summons: 0 };
  }
  blocks(man, f) {
    const c = this.crowding;
    if (man.bearer && man.darting) return true;
    if (man.kind === 'warlord') return true;
    if (c.passThrough) return false;
    if (c.runnersPassAll && f.kind === 'runner') return false;
    if (c.passBusy && (man.phase === 'windup' || man.phase === 'recoil')) return false;
    if (c.slipPast && (f.kind === 'runner' || f.kind === 'dancer' || f.bearer) && (man.kind === 'brute' || man.kind === 'archer')) return false;
    if (c.shove && f.kind === 'brute' && man.kind !== 'brute' && man.kind !== 'archer' && man.kind !== 'warlord') return false;
    return true;
  }
  march(ev) {
    const h = T.step;
    for (const f of this.foes) if (f.phase === 'leaping') {
      f.timer -= h; const t = this.progress(f); f.x = f.leapFrom + (f.leapTo - f.leapFrom) * t;
      if (f.timer <= 0) {
        f.x = f.leapTo; ev.push({ type: 'landed', foe: f.id });
        const ahead = this.foes.some((o) => o.id !== f.id && this.targetable(o) && this.sideOf(o.x) === this.sideOf(f.x) && Math.abs(o.x) < Math.abs(f.x));
        if (f.kind === 'warlord' && !ahead && this.rng.chance(0.5)) { this.enter(f, 'windup', Math.max(T.quickBlow, f.windup * 0.8)); ev.push({ type: 'raised', foe: f.id }); }
        else this.enter(f, 'recoil', 0.12);
      }
    }
    for (const side of ['left', 'right']) {
      const s = this.sign(side);
      const order = this.foes.filter((f) => this.targetable(f) && this.sideOf(f.x) === side).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
      const ahead = [];
      for (const f of order) {
        let front = null; for (let k = ahead.length - 1; k >= 0; k--) if (this.blocks(ahead[k], f)) { front = ahead[k]; break; }
        if (f.bearer && f.kind !== 'warlord') { this.bear(f, side, front, ev); ahead.push(f); continue; }
        let stop = K[f.kind].range;
        if (front) stop = Math.max(stop, Math.abs(front.x) + (K[front.kind].width + K[f.kind].width) / 2 + 0.01);
        if (f.kind === 'archer') stop = Math.max(stop, T.archerRange);
        if (Math.abs(f.x) < stop - 0.002 && f.phase !== 'windup') f.x = s * Math.min(stop, Math.abs(f.x) + 0.6 * h);
        const boss = f.kind === 'warlord';
        const fury = boss ? 1 - f.hp / Math.max(1, f.maxHP) : 0;
        if (boss && f.guardRest > 0) f.guardRest -= h;
        switch (f.phase) {
          case 'advancing': {
            const pace = f.speed * (1 + 0.5 * fury);
            if (Math.abs(f.x) > stop) f.x = s * Math.max(stop, Math.abs(f.x) - pace * h);
            if (boss && f.guardRest <= 0 && this.gap(f) < this.reach + 0.12 && this.rng.chance(2 * h)) { this.enter(f, 'guarding', T.guardRise + this.rng.range(0.6, 1.05)); ev.push({ type: 'guarded', foe: f.id }); break; }
            if (Math.abs(f.x) <= stop + 0.0005) {
              if (f.kind === 'archer') { if (Math.abs(f.x) < 0.97) { this.enter(f, 'aiming', f.windup); ev.push({ type: 'raised', foe: f.id }); } }
              else if (Math.abs(f.x) <= K[f.kind].range + 0.0005 && !front) {
                const quick = f.windup * (1 - 0.45 * fury); this.enter(f, 'windup', boss ? Math.max(T.quickBlow, quick) : quick); ev.push({ type: 'raised', foe: f.id });
              }
            }
            break;
          }
          case 'guarding':
            f.timer -= h; if (Math.abs(f.x) > stop) f.x = s * Math.max(stop, Math.abs(f.x) - f.speed * 0.35 * h);
            if (f.timer <= 0) { f.phase = 'advancing'; f.span = 0; f.guardRest = this.rng.range(0.8, 1.6) * (1 - 0.4 * fury);
              if (Math.abs(f.x) <= K[f.kind].range + 0.01 && !front) { this.enter(f, 'windup', Math.max(T.quickBlow, f.windup * 0.75 * (1 - 0.45 * fury))); ev.push({ type: 'raised', foe: f.id }); } }
            break;
          case 'windup':
            if (boss && Math.abs(f.x) > K[f.kind].range) f.x = s * (Math.abs(f.x) - (Math.abs(f.x) - K[f.kind].range) * Math.min(1, h / Math.max(h, f.timer)));
            f.timer -= h;
            if (f.timer <= 0) {
              this.hurt(K[f.kind].damage, f.id, ev);
              if (boss && !f.chained && this.hp > 0 && this.rng.chance(0.35 + 0.5 * fury)) { f.chained = true; this.enter(f, 'windup', Math.max(T.quickBlow, f.windup * 0.5)); ev.push({ type: 'raised', foe: f.id }); }
              else { f.chained = false; f.x = s * (Math.abs(f.x) + 0.05); this.enter(f, 'recoil', 0.45); }
            }
            break;
          case 'aiming':
            f.timer -= h;
            if (f.timer <= 0) { const a = { id: this.nextID++, from: f.id, x: s * this.gap(f), velocity: -s * T.arrowSpeed, deflected: false }; this.arrows.push(a); ev.push({ type: 'loosed', archer: f.id, arrow: a.id }); this.enter(f, 'recoil', 1.2 * this.d.windup + this.rng.range(0, 0.7)); }
            break;
          case 'recoil':
            f.timer -= h;
            if (f.timer <= 0) { if (boss && f.guardRest <= 0 && this.rng.chance(0.5)) { this.enter(f, 'guarding', T.guardRise + this.rng.range(0.5, 0.85)); ev.push({ type: 'guarded', foe: f.id }); } else { f.phase = 'advancing'; f.timer = 0; f.span = 0; } }
            break;
        }
        if (this.crowding.shove && f.kind === 'brute') {
          for (const o of this.foes) if (o !== f && this.targetable(o) && this.sideOf(o.x) === side && !['brute', 'archer', 'warlord'].includes(o.kind) && o.phase !== 'windup' && !o.bearer) {
            const room = (K.brute.width + K[o.kind].width) / 2 + 0.01; if (Math.abs(Math.abs(o.x) - Math.abs(f.x)) < room) o.x = s * Math.min(T.edge, Math.abs(f.x) + room);
          }
        }
        ahead.push(f);
      }
    }
  }
  bear(f, side, front, ev) {
    const h = T.step, s = this.sign(side);
    const behind = front ? Math.abs(front.x) + (K[front.kind].width + K[f.kind].width) / 2 + 0.01 : 0;
    const hover = Math.max(this.reach + K[f.kind].width / 2 + 0.09, behind);
    switch (f.phase) {
      case 'advancing':
        f.darting = false;
        if (f.darts >= T.bearerDarts || f.lingered > T.bearerStay) { this.enter(f, 'fleeing', 0); break; }
        if (Math.abs(f.x) > hover + 0.0005) f.x = s * Math.max(hover, Math.abs(f.x) - f.speed * h);
        else if (Math.abs(f.x) < hover - 0.0005) f.x = s * Math.min(hover, Math.abs(f.x) + f.speed * 2.5 * h);
        if (Math.abs(Math.abs(f.x) - hover) >= 0.01) break;
        if (this.foes.some((o) => o.id !== f.id && o.phase !== 'dying' && this.sideOf(o.phase === 'leaping' ? o.leapTo : o.x) === side && (o.phase === 'leaping' ? Math.abs(o.leapTo) : Math.abs(o.x)) < Math.abs(f.x))) { f.hover = Math.max(f.hover, T.dartTell); break; }
        f.hover = Math.max(0, f.hover - h); f.lingered += h;
        if (f.hover <= 0) { f.darting = true; f.darts++; f.hover = T.bearerWait; this.enter(f, 'windup', Math.max(T.dartWindup, f.windup * 0.45)); ev.push({ type: 'raised', foe: f.id }); }
        break;
      case 'windup': {
        const stop = Math.max(K[f.kind].range, behind);
        if (Math.abs(f.x) > stop) f.x = s * Math.max(stop, Math.abs(f.x) - f.speed * T.dartPace * h);
        f.timer -= h;
        if (f.timer <= 0) { if (Math.abs(f.x) <= K[f.kind].range + 0.02) this.hurt(K[f.kind].damage, f.id, ev); f.darting = false; this.enter(f, 'recoil', 0.3); }
        break;
      }
      case 'recoil': f.timer -= h; if (f.timer <= 0) { f.phase = 'advancing'; f.span = 0; } break;
      case 'fleeing':
        f.x = s * Math.min(T.edge + 0.1, Math.abs(f.x) + f.speed * 1.8 * h);
        if (Math.abs(f.x) >= T.edge + 0.1) { f.phase = 'dying'; this.healed = true; this.defeated++; ev.push({ type: 'fled', foe: f.id }); }
        break;
    }
  }
  fly(ev) {
    const spent = new Set();
    for (const a of this.arrows) {
      const old = a.x; a.x += a.velocity * T.step;
      if (!a.deflected) { if (Math.abs(a.x) <= T.body || this.sideOf(a.x) !== this.sideOf(old)) { spent.add(a.id); this.hurt(1, null, ev); } continue; }
      const near = Math.abs(old), far = Math.abs(a.x);
      let hit = null;
      for (const f of this.foes) if (this.targetable(f) && this.sideOf(f.x) === this.sideOf(a.x) && this.gap(f) <= far && this.gap(f) + K[f.kind].width >= near && (!hit || this.gap(f) < this.gap(hit))) hit = f;
      if (hit) { spent.add(a.id); const after = []; const killed = this.wound(hit, true, after); if (killed) this.stats.arrowKills++; ev.push({ type: 'pierced', foe: hit.id, arrow: a.id, killed }); ev.push(...after); }
      else if (far > T.edge + 0.1) spent.add(a.id);
    }
    if (spent.size) this.arrows = this.arrows.filter((a) => !spent.has(a.id));
  }
  toss(ev) { if (!this.gourd) return; this.gourd.timer -= T.step; if (this.gourd.timer <= 0) { const g = this.gourd; this.gourd = null; ev.push({ type: 'shattered', foe: g.from }); } }
  earnShard(id, ev) {
    this.shards++; ev.push({ type: 'shard', foe: id, count: this.shards });
    if (this.shards < T.shardsPerHeart) return;
    this.shards = 0; const restored = this.hp < this.maxHP; if (restored) this.hp++; else this.score += this.points(T.gourdPoints);
    ev.push({ type: 'mended', restored });
  }
  wound(f, byArrow, ev) {
    f.hp--; f.hits++;
    if (f.hp <= 0) {
      this.score += this.points(K[f.kind].bounty * this.multiplier); this.enter(f, 'dying', 0); this.defeated++; this.stats.kills++; this.raise(ev);
      if (f.bearer && !this.healed) { this.healed = true; const side = this.rng.chance(0.5) ? this.sideOf(f.x) : (this.sideOf(f.x) === 'left' ? 'right' : 'left');
        this.gourd = { from: f.id, start: f.x, land: this.sign(side) * T.gourdLanding, timer: T.gourdFlight, span: T.gourdFlight }; ev.push({ type: 'flung', foe: f.id }); }
      return true;
    }
    if (f.kind === 'warlord') {
      const th = [Math.floor(f.maxHP * 3 / 4), Math.floor(f.maxHP / 2), Math.floor(f.maxHP / 4)];
      if (f.summons < 3 && f.hp <= th[f.summons]) { f.summons++; this.summon(f, ev); }
    }
    f.darting = false; f.chained = false;
    const leaps = f.kind === 'dancer' ? !byArrow : f.kind === 'warlord' ? !byArrow && this.rng.chance(0.55) : false;
    if (f.bearer && !byArrow) {
      f.leapFrom = f.x; f.leapTo = Math.sign(f.x) * Math.max(Math.abs(f.x), this.reach + K[f.kind].width / 2 + 0.09); this.enter(f, 'leaping', T.spring); ev.push({ type: 'leapt', foe: f.id });
    } else if (leaps) {
      const far = -Math.sign(f.x);
      f.leapFrom = f.x; f.leapTo = far * Math.max(T.landing, K[f.kind].range); this.enter(f, 'leaping', T.leap); ev.push({ type: 'leapt', foe: f.id });
    } else if (this.crowding.noBruteKnockback && f.kind === 'brute') {
      if (f.phase === 'recoil' && f.timer >= 0.3) { /* reeling */ } else if (f.phase !== 'windup') this.enter(f, 'recoil', 0.3);
    } else {
      f.x = Math.sign(f.x) * Math.min(T.edge, Math.abs(f.x) + (f.kind === 'warlord' ? 0.06 : 0.07)); this.enter(f, 'recoil', 0.3);
    }
    return false;
  }
  summon(boss, ev) {
    const men = [['grunt', 'left'], [this.stage >= 10 ? 'runner' : 'grunt', 'right']];
    const allies = [];
    for (const [kind, side] of men) { this.roster.push(kind); this.arrived++; const f = this.make(kind, this.sign(side) * T.edge, K[kind].hp, K[kind].speed * this.d.pace); this.foes.push(f); allies.push(f.id); }
    ev.push({ type: 'summoned', foe: boss.id, allies });
  }
  hurt(damage, foe, ev) {
    if (this.outcome) return;
    this.hp -= damage; this.stats.wounds++; this.stats.damage += damage; this.brk(ev);
    ev.push({ type: 'wounded', foe, damage });
    if (this.shards > 0) { ev.push({ type: 'scattered', count: this.shards }); this.shards = 0; }
  }
  raise(ev) { this.combo++; this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo); if (this.combo === T.bloodlust) ev.push({ type: 'bloodlust', on: true }); if (this.combo % 25 === 0) ev.push({ type: 'milestone', count: this.combo }); }
  brk(ev) { if (this.combo >= T.bloodlust) ev.push({ type: 'bloodlust', on: false }); this.combo = 0; }
  snapshot() {
    const foes = this.foes.map((f) => ({
      ...f, maxHP: f.maxHP, progress: this.progress(f), gap: this.gap(f), distance: Math.abs(f.x), contact: K[f.kind].range,
      alive: f.phase !== 'dying', targetable: this.targetable(f), guardSet: this.guardSet(f), guardAge: f.phase === 'guarding' ? f.span - f.timer : 0,
      senNoSen: this.senNoSen(f), clubGlares: this.clubGlares(f), glare: this.turns(f),
      readying: f.bearer && f.phase === 'advancing' && !f.darting && f.hover < T.dartTell,
      side: this.sideOf(f.phase === 'leaping' ? f.leapTo : f.x),
    }));
    const g = this.gourd && { ...this.gourd, x: this.gx(this.gourd), progress: this.gourd.span > 0 ? Math.min(1, Math.max(0, 1 - this.gourd.timer / this.gourd.span)) : 1, catchable: this.gourd.timer <= T.catchWindow + 1e-9 };
    return {
      stage: this.stage, seed: this.seed, mode: this.mode, setting: (this.stage - 1) % 8, time: this.time, hp: this.hp, maxHP: this.maxHP,
      shards: this.shards, combo: this.combo, score: this.score, bonus: this.bonus, multiplier: this.multiplier, bloodlust: this.bloodlust,
      reach: this.reach, stumble: this.stumble, facing: this.facing, outcome: this.outcome, stats: { ...this.stats }, foes,
      arrows: this.arrows.map((a) => ({ ...a })), gourd: g, bossID: this.bossID, bearerIndex: this.bearerIndex, boss: this.d.boss,
      remaining: this.roster.length - this.defeated, autopilot: this.pilot,
      targets: { left: this.target('left'), right: this.target('right') },
    };
  }
}

// MARK: Stick figures

const HEIGHT = { hero: 1, grunt: 0.95, runner: 0.9, brute: 1.22, dancer: 0.97, archer: 0.96, warlord: 1.3 };
function stick(cast, key) {
  const H = (cast === 'hero' ? 172 : 118) * HEIGHT[cast];
  const W = 2.5 * H, Hh = 1.74 * H;
  const fx = 1.25 * H, fy = 0.1 * H;
  const m = /^(\w+)(?:\((.*)\))?$/.exec(key) || [];
  const name = m[1] || 'idle';
  const nums = (m[2] || '').split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  const k = nums[nums.length - 1] || 0;
  const ink = [0.03, 0.02, 0.035, 1];
  const shapes = [];
  const line = (pts, w) => { const path = []; pts.forEach((p, i) => path.push(i ? 'L' : 'M', fx + p[0] * H, fy + p[1] * H)); shapes.push({ path, stroke: ink, width: w * H, round: true }); };
  let lean = 0.05, blade = 0.7, kneel = 0, stride = 0.14;
  if (name === 'walk') stride = 0.18 * Math.sin(k / 12 * Math.PI * 2);
  if (name === 'windup') { blade = 2.2 + k * 0.2; lean = -0.05; }
  if (name === 'strike') { blade = -0.3; lean = 0.2; }
  if (name === 'cut' || name === 'chain') { blade = 2 - k * 0.45; lean = 0.15; stride = 0.3; }
  if (name === 'stagger' || name === 'hurt' || name === 'reel') lean = -0.25;
  if (name === 'fall') { kneel = Math.min(1, k / 3); lean = 0.3 + k * 0.2; }
  if (name === 'iai') { blade = -2.4; lean = 0.1; }
  if (name === 'block') blade = 1.5;
  const hipY = 0.5 * (1 - 0.4 * kneel);
  const hip = [0, hipY], neck = [Math.sin(lean) * 0.33, hipY + Math.cos(lean) * 0.33];
  line([hip, neck], 0.06);
  shapes.push({ ellipse: [fx + (neck[0] + Math.sin(lean) * 0.06 - 0.055) * H, fy + (neck[1] + 0.02) * H, 0.11 * H, 0.12 * H], fill: ink });
  line([hip, [stride, hipY * 0.5], [stride + 0.03, 0]], 0.05);
  line([hip, [-stride, hipY * 0.5], [-stride - 0.06, 0]], 0.05);
  const hand = [neck[0] + 0.18, neck[1] - 0.12];
  line([[neck[0], neck[1] - 0.04], hand], 0.04);
  const len = cast === 'grunt' ? 0.8 : cast === 'warlord' ? 0.7 : 0.55;
  const tip = [hand[0] + Math.sin(blade) * len, hand[1] + Math.cos(blade) * len];
  shapes.push({ path: ['M', fx + hand[0] * H, fy + hand[1] * H, 'L', fx + tip[0] * H, fy + tip[1] * H], stroke: [0.85, 0.87, 0.9, 1], width: 0.012 * H, round: true });
  return { width: Math.round(W), height: Math.round(Hh), anchor: [0.5, 0.1 / 1.74], rim: [0.7, 0.72, 0.8, 0.3], rimRadius: Math.max(1.1, H * 0.008),
    underlay: [], body: shapes, overlay: [], smeared: name === 'cut' && k >= 1 && k <= 4 };
}

// MARK: The API

function careerOf(c) { return c; }

export async function loadCore() {
  let career = null, fight = null, pilot = false, rules = { ...STANDARD }, promotion = null;
  const newCareer = (seed) => ({ seed, mode: 'bushido', stages: {}, hearts: {}, shards: {}, reached: {}, highest: {}, endless: null, bestEndless: {},
    runs: {}, bestRuns: {}, attempt: 1, kills: 0, killsByMode: {}, falls: 0, flawless: 0, bestCombo: 0, bestScore: 0, score: 0, streak: 0, lastRun: null, lastRunIsBest: false });
  const stageOf = () => career.endless ? career.endless.stage : (career.stages[career.mode] || 1);
  const make = () => {
    const f = new Fight(stageOf(), (career.seed * 31 + career.kills * 7 + career.attempt * 13 + stageOf()) >>> 0, career.mode,
      career.endless ? career.endless.hearts : career.hearts[career.mode], career.endless ? career.endless.shards : career.shards[career.mode]);
    f.pilot = pilot; f.crowding = { ...rules }; return f;
  };
  const record = () => {
    const f = fight; const key = career.mode;
    career.kills += f.stats.kills; career.killsByMode[key] = (career.killsByMode[key] || 0) + f.stats.kills;
    career.bestCombo = Math.max(career.bestCombo, f.stats.bestCombo); career.bestScore = Math.max(career.bestScore, f.score); career.score += f.score;
    const run = career.endless || career.runs[key] || { start: f.stage, stage: f.stage, hearts: null, shards: 0, cleared: 0, score: 0, kills: 0, bestCombo: 0 };
    run.kills += f.stats.kills; run.score += f.score; run.bestCombo = Math.max(run.bestCombo, f.stats.bestCombo);
    if (f.outcome === 'victory') {
      career.streak++; career.attempt = 1; run.cleared++; run.hearts = f.hp; run.shards = f.shards;
      career.reached[key] = Math.max(career.reached[key] || 1, f.stage + 1);
      if (career.endless) career.endless = run; else { run.stage = f.stage + 1; career.stages[key] = f.stage + 1; career.hearts[key] = f.hp; career.shards[key] = f.shards; career.runs[key] = run; }
      if (f.stats.damage === 0) career.flawless++;
    } else {
      career.falls++; career.streak = 0; career.attempt++; run.stage = f.stage;
      if (career.endless) career.endless = { start: run.start, stage: run.start, hearts: null, shards: 0, cleared: 0, score: 0, kills: 0, bestCombo: 0 };
      else { career.stages[key] = 1; delete career.hearts[key]; delete career.shards[key]; delete career.runs[key]; }
      career.lastRun = run; career.lastRunIsBest = false;
    }
  };
  const core = {
    version: 'mock',
    tuning: T,
    newGame({ seed } = {}) { career = newCareer(seed || 1234); fight = make(); },
    loadSave(json) { try { const s = JSON.parse(json); if (!s.career) return false; career = s.career; fight = make(); return true; } catch { return false; } },
    saveJSON() { return JSON.stringify({ version: 'mock', career }); },
    career() { return JSON.parse(JSON.stringify({ ...career, stage: career.stages[career.mode] || 1, current: stageOf(), isEndless: !!career.endless, promotion })); },
    begin({ mode, stage, endless } = {}) {
      if (mode && mode !== career.mode) { career.mode = mode; career.attempt = 1; career.endless = null; }
      if (endless === true) career.endless = { start: stage || stageOf(), stage: stage || stageOf(), hearts: null, shards: 0, cleared: 0, score: 0, kills: 0, bestCombo: 0 };
      else if (endless === false) career.endless = null;
      else if (stage) { career.stages[career.mode] = stage; career.reached[career.mode] = Math.max(career.reached[career.mode] || 1, stage); }
      fight = make();
    },
    restart() { career.attempt++; fight = make(); },
    next() { promotion = null; fight = make(); },
    setRules(r) { rules = { ...rules, ...r }; fight.crowding = { ...rules }; },
    rules() { return { ...rules }; },
    standardRules() { return { ...STANDARD }; },
    setAutopilot(on) { pilot = !!on; fight.pilot = pilot; },
    advance(dt) { const ev = fight.step(dt); if (ev.some((e) => e.type === 'ended')) record(); return ev; },
    strike(side) { const ev = fight.strike(side); if (ev.some((e) => e.type === 'ended')) record(); return ev; },
    state() { return fight.snapshot(); },
    stage(stage, mode) { const d = difficulty(stage, mode || career.mode); return { stage, setting: (stage - 1) % 8, boss: d.boss, introduces: { 2: 'runner', 3: 'brute', 4: 'archer', 5: 'warlord', 6: 'dancer' }[stage] || null }; },
    sketch(cast, frame) { return stick(cast, frame); },
    frames(cast) {
      if (cast === 'hero') {
        const f = []; for (let k = 0; k < 8; k++) f.push(`idle(${k})`); for (let k = 0; k < 6; k++) f.push(`iai(${k})`);
        for (const c of ['kesa', 'gyaku', 'shomen', 'dou', 'tsuki', 'sune', 'nukitsuke']) { for (let k = 0; k < 9; k++) f.push(`cut(${c},${k})`); for (let k = 0; k < 6; k++) f.push(`recover(${c},${k})`); if (c !== 'nukitsuke') for (let k = 0; k < 5; k++) f.push(`chain(${c},${k})`); }
        for (let k = 0; k < 4; k++) f.push(`shuffle(${k})`); f.push('stumble(0)', 'stumble(1)', 'repelled(0)', 'repelled(1)', 'clash(0)', 'clash(1)');
        for (let k = 0; k < 4; k++) f.push(`retreat(${k})`); for (let k = 0; k < 3; k++) f.push(`hurt(${k})`); for (let k = 0; k < 5; k++) f.push(`fall(${k})`);
        for (let v = 0; v < 3; v++) for (let k = 0; k < 8; k++) f.push(`winded(${v},${k})`); for (let v = 0; v < 2; v++) for (let k = 0; k < 4; k++) f.push(`reel(${v},${k})`);
        for (let k = 0; k < 7; k++) f.push(`flourish(${k})`); return f;
      }
      const f = []; for (let k = 0; k < 6; k++) f.push(`idle(${k})`); for (let k = 0; k < 12; k++) f.push(`walk(${k})`); for (let k = 0; k < 4; k++) f.push(`windup(${k})`);
      if (cast !== 'archer') for (let k = 0; k < 3; k++) f.push(`strike(${k})`); f.push('stagger(0)', 'stagger(1)');
      if (cast === 'dancer' || cast === 'warlord') f.push('leap'); if (cast === 'warlord') f.push('block', 'clash(0)', 'clash(1)'); if (cast === 'archer') f.push('aim', 'loose');
      return f;
    },
    footing(cast, frame) { const m = /walk\((\d+)\)/.exec(frame); const k = m ? +m[1] : 0; const s = 0.18 * Math.sin(k / 12 * Math.PI * 2); return { front: { x: s + 0.03, y: Math.max(0, Math.cos(k / 12 * Math.PI * 2)) * 0.02 }, back: { x: -s - 0.06, y: 0 } }; },
  };
  return core;
}
