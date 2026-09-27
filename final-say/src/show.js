// Audition Night: the talent show itself. Acts walk on, introduce themselves while you pick what to say, perform,
// and wait for the panel. The other judges vote; you have the final say.
import * as THREE from 'three';
import { formation, makeLineup, reply, spawn } from './contestants.js';
import { EPISODE_CITIES, HEADLINES, JUDGES, PLAYER } from './data.js';
import { ACT_SCRIPTS } from './acts.js';
import { Slots } from './slots.js';
import { MARK, STAGE_Y } from './studio.js';
import { cap, Cancelled, clamp, fill, quietly, rng, Token } from './util.js';

const EXIT = new THREE.Vector3(-10.5, STAGE_Y, -9.5);

export class Show {
  constructor(world, onEnd) {
    this.w = world;
    this.onEnd = onEnd;
    this.slots = new Slots(world);
    this.phase = 'idle';
    this.frameHooks = new Set();
    this.cleanups = [];
  }

  // Runs when the act has left the stage (props, balls, cabinets).
  after(fn) {
    this.cleanups.push(fn);
  }

  get fx() {
    return this.w.fx;
  }
  get audience() {
    return this.w.audience;
  }
  get studio() {
    return this.w.studio;
  }

  // --- Episode ----------------------------------------------------------------------------------------------------

  start({ acts = 6, types = null } = {}) {
    const w = this.w;
    this.token = new Token();
    this.city = rng.pick(EPISODE_CITIES);
    this.lineup = makeLineup(types ? types.length : acts, rng, types);
    this.log = [];
    this.stats = { approval: 60, respect: 60, kind: 0, cruel: 0, viewers: 5.0, peak: 5.0, history: [5.0], marks: [], goldenUsed: false, golden: null, stops: 0 };
    this.historyTimer = 0;
    const judges = rng.shuffle(JUDGES).slice(0, 2);
    w.setJudges(judges);
    w.hud.setMode('show');
    w.hud.setViewers(this.stats.viewers, 0);
    w.hud.setActCounter(0, acts);
    this.firstAct = true;
    quietly(this.runEpisode());
  }

  stop() {
    if (this.token) this.token.cancel();
    this.slots.close();
    this.w.speech.interrupt();
    this.w.audio.music.stop(0.2);
    this.w.audience.chant(null);
    this.w.audience.setOvation(0);
    this.w.clearCast();
    this.frameHooks.clear();
    for (const fn of this.cleanups.splice(0)) fn();
    this.w.hud.setActions(null);
    this.w.hud.lowerThird(null);
    this.phase = 'idle';
  }

  wait(s, token = this.token) {
    return this.w.clock.wait(s, token);
  }

  async runEpisode() {
    const w = this.w;
    const { studio, audience } = w;
    studio.wall.show({ kind: 'logo' });
    studio.mood.energy = 0.8;
    audience.setMood(0.4, 0.8);
    audience.react('cheer', 1);
    audience.react('clap', 1);
    audience.flashApplause(3);
    w.audio.sfx('riser');
    await this.wait(1.5);
    studio.wall.show({ kind: 'title', title: `Auditions: ${this.city}`, sub: 'TONIGHT ON FINAL SAY' });
    await w.judgeSay(0, `Welcome to ${this.city}! And a big welcome to our new judge.`, this.token);
    await w.judgeSay(1, 'Remember, new kid — you have the final say. No pressure.', this.token);
    studio.mood.energy = 0.3;
    audience.setMood(0.15, 0.55);
    for (let i = 0; i < this.lineup.length; i++) {
      this.actIndex = i;
      w.hud.setActCounter(i + 1, this.lineup.length);
      await this.runAct(this.lineup[i]);
      this.firstAct = false;
    }
    await this.closing();
  }

  async closing() {
    const w = this.w;
    this.phase = 'closing';
    w.studio.wall.show({ kind: 'title', title: 'That’s a wrap!', sub: `${this.city.toUpperCase()} AUDITIONS` });
    w.audience.setMood(0.5, 0.8);
    w.audience.react('cheer', 1);
    w.audience.react('clap', 1);
    w.studio.mood.energy = 0.9;
    await w.judgeSay(0, 'What a night! Goodnight, everybody!', this.token);
    await this.wait(1.5);
    w.studio.mood.energy = 0.3;
    this.phase = 'summary';
    this.onEnd(this.summary());
  }

  // --- One act ----------------------------------------------------------------------------------------------------

  async runAct(c) {
    const w = this.w;
    this.c = c;
    this.ex = null;
    this.actToken = new Token(this.token);
    this.sympathy = 0;
    this.decision = null;
    this.perf = null;
    this.playerBuzzed = false;
    this.goldenDone = false;
    this.state = { introStart: 0, lastPlayer: -99, askedStart: false, started: false, startedBy: null, used: new Set(), rude: 0, warm: 0 };
    w.studio.clearX();
    for (const j of w.judges) {
      j.vote = null;
      j.commented = false;
      j.buzzed = false;
      j.noise = rng.gauss() * 0.06;
      j.opinion = 0.5;
    }
    w.hud.setVotes(w.judges, null);
    try {
      await this.walkOn(c);
      await this.intro(c);
      await this.perform(c);
      if (this.goldenFor(c)) await this.w.clock.waitFor(() => this.goldenDone, this.actToken, 20);
      else await this.ruling(c);
      this.goldenDone = false;
      await this.walkOff(c);
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
      if (this.token.cancelled) throw e;
    }
    this.slots.close();
    this.frameHooks.clear();
    for (const fn of this.cleanups.splice(0)) fn();
    w.hud.lowerThird(null);
    w.hud.setActions(null);
    w.clearCast();
    w.audience.chant(null);
    w.audience.setOvation(0);
    w.studio.mood.golden = 0;
  }

  async walkOn(c) {
    const w = this.w;
    this.phase = 'walkon';
    w.studio.wall.show({ kind: 'title', title: `Act ${this.actIndex + 1}`, sub: 'NEXT UP' });
    w.studio.mood.hue = rng.range(200, 330);
    await this.wait(0.8, this.actToken);
    spawn(w, c);
    w.hud.lowerThird(c);
    c.chars.forEach((ch, i) => ch.walkTo(formation(c, i), 1.5));
    if (c.dog) c.dog.walkTo(MARK.clone().add(new THREE.Vector3(0.8, 0, 0.3)), 1.8);
    w.audio.sfx('whoosh');
    // The room sizes them up as they walk on.
    const first = 0.12 + (c.charm - 0.5) * 0.4 + (c.persona === 'cocky' ? -0.1 : 0);
    w.audience.setMood(first, 0.5 + c.novelty * 0.2);
    w.audience.react('clap', 0.55 + c.charm * 0.3);
    w.audience.flashApplause(2);
    if (c.expectation < 0.4 && rng.chance(0.6)) w.audience.react('laugh', 0.25);
    await w.clock.waitFor(() => c.chars.every((ch) => ch.arrived), this.actToken, 12);
    for (const ch of c.chars) {
      ch.face(0);
      ch.lookTarget = new THREE.Vector3(0, 1.3, 0.3);
    }
    if (c.dog) c.dog.face(0);
    c.lead.set('wave');
    await this.wait(0.6, this.actToken);
    c.lead.set('idle');
    w.studio.wall.show({ kind: 'title', title: `Act ${this.actIndex + 1}`, sub: 'AUDITION' });
  }

  async walkOff(c) {
    const w = this.w;
    this.phase = 'walkoff';
    this.slots.close();
    w.hud.setActions(null);
    const yes = this.decision === 'yes';
    c.chars.forEach((ch, i) => {
      ch.lookTarget = null;
      ch.set('idle', yes ? 'happy' : 'sad');
      ch.walkTo(EXIT.clone().add(new THREE.Vector3(0, 0, i * 0.4)), yes ? 1.9 : 1.1);
    });
    if (c.dog) c.dog.walkTo(EXIT, 2.4);
    await w.clock.waitFor(() => c.chars.every((ch) => ch.arrived), this.actToken, 8);
    await this.wait(0.5, this.actToken);
  }

  // --- Talking --------------------------------------------------------------------------------------------------

  // Starts a new exchange of lines, cutting off whatever exchange was running.
  exchange(fn) {
    if (this.ex) this.ex.cancel();
    const ex = new Token(this.actToken);
    this.ex = ex;
    return quietly(
      (async () => {
        try {
          await fn(ex);
        } finally {
          if (this.ex === ex) this.ex = null;
        }
      })()
    );
  }
  contestantSay(text, token) {
    if (!text) return Promise.resolve(true);
    return this.w.speech.say(this.c.speaker, text, token);
  }
  feedback(kind, delta) {
    if (Math.abs(delta) < 0.001) return;
    this.w.hud.feedback(kind, delta);
  }
  approve(d) {
    this.stats.approval = clamp(this.stats.approval + d, 0, 100);
    if (Math.abs(d) >= 2) this.feedback('Crowd', d);
  }
  respect(d, judge) {
    const js = judge === undefined ? this.w.judges : [this.w.judges[judge]];
    for (const j of js) j.respect = clamp(j.respect + d, 0, 1);
    this.stats.respect = (this.w.judges.reduce((s, j) => s + j.respect, 0) / this.w.judges.length) * 100;
    if (Math.abs(d) >= 0.02) this.feedback('Panel', d);
  }
  confidence(d) {
    const c = this.c;
    c.confidence = clamp(c.confidence + d);
    if (Math.abs(d) >= 0.03) this.feedback(c.first, d);
    const ch = c.lead;
    if (this.phase === 'intro' && ch) {
      ch.emotion = c.persona === 'cocky' ? 'cocky' : c.confidence < 0.3 ? 'nervous' : c.confidence > 0.6 ? 'happy' : 'neutral';
      for (const m of c.chars) if (m !== ch) m.emotion = ch.emotion;
    }
  }
  viewers(d, why) {
    this.stats.viewers = clamp(this.stats.viewers + d, 1, 14);
    this.stats.peak = Math.max(this.stats.peak, this.stats.viewers);
    if (why) this.stats.marks.push({ at: this.stats.history.length, why });
  }
  kindJudge() {
    const js = this.w.judges;
    return js[0].def.heart >= js[1].def.heart ? 0 : 1;
  }
  bluntJudge() {
    return 1 - this.kindJudge();
  }

  // --- Intro ----------------------------------------------------------------------------------------------------

  async intro(c) {
    const w = this.w;
    this.phase = 'intro';
    const st = this.state;
    st.introStart = w.clock.time;
    this.slots.open(() => this.introOptions(), () => ({ id: 'rush', text: PLAYER.rush[0], tone: 'rush', fixed: true }), (o) => this.onIntroOption(o));
    w.hud.setActions('intro');
    if (this.firstAct) w.hud.hint('Pick a line with 1–4 or a click. Each line only stays up for a few seconds. “Just start” rushes them.', 7);
    this.exchange(async (ex) => {
      await this.contestantSay(reply(c, 'greet'), ex);
    });
    // Autopilot: if you say nothing, the contestant fills the silence and the other judges take over.
    while (st.started !== true) {
      await this.wait(0.25, this.actToken);
      if (st.started) continue;
      if (w.speech.busy || this.ex) continue;
      const now = w.clock.time;
      const silence = now - w.speech.lastEnd;
      const elapsed = now - st.introStart;
      const sincePlayer = now - st.lastPlayer;
      if (elapsed > 58) {
        const j = rng.int(0, 1);
        this.exchange(async (ex) => {
          await w.judgeSay(j, 'startNudge', {}, ex);
          this.respect(-0.03);
          this.beginAct('judge');
        });
        continue;
      }
      if (elapsed > 40 && !st.askedStart && silence > 2) {
        st.askedStart = true;
        w.audience.nudge(-0.05, -0.12);
        this.exchange((ex) => this.contestantSay(reply(c, 'askStart'), ex));
        continue;
      }
      if (silence < 3.2) continue;
      if (sincePlayer > 9 && silence > 3.8) {
        const q = this.nextQuestion();
        if (q) {
          const j = rng.int(0, 1);
          this.exchange(async (ex) => {
            await w.judgeSay(j, rng.pick(PLAYER[q.ask]), {}, ex);
            c.asked.add(q.fact);
            await this.contestantSay(reply(c, q.fact), ex);
            this.learn(q.fact);
          });
          this.respect(-0.015, 1 - j);
          continue;
        }
      }
      if (!c.known.has('name') && silence > 3.5) {
        this.exchange(async (ex) => {
          await this.contestantSay(reply(c, 'name'), ex);
          this.learn('name');
        });
        continue;
      }
      if (silence > 5.5) {
        w.audience.nudge(0, -0.05);
        this.exchange((ex) => this.contestantSay(reply(c, 'filler'), ex));
      }
    }
    this.slots.close();
  }

  nextQuestion() {
    const c = this.c;
    const order = [
      ['name', c.group ? 'askGroupName' : 'askName'],
      ['act', 'askAct'],
      [c.group ? 'origin' : 'job', c.group ? 'askOrigin' : 'askJob'],
      ['from', 'askFrom'],
      ['why', 'askWhy'],
      ['dream', 'askDream'],
    ];
    for (const [fact, ask] of order) if (!c.known.has(fact) && !c.asked.has(fact)) return { fact, ask };
    return null;
  }

  learn(fact) {
    const c = this.c;
    c.known.add(fact);
    this.w.hud.lowerThird(c);
    if (fact === 'name') this.w.studio.wall.show({ kind: 'title', title: c.name, sub: c.known.has('act') ? c.label.toUpperCase() : '' });
    if (fact === 'act' && c.known.has('name')) this.w.studio.wall.show({ kind: 'title', title: c.name, sub: c.label.toUpperCase() });
    if (fact === 'why' && /grandad|daughter|told no|nan/.test(c.vars.why)) {
      this.w.audience.react('aww', 0.8);
      this.sympathy += 0.12;
    }
    if (fact === 'supporter' && c.vars.sup) this.w.audience.react('cheer', 0.3);
  }

  introOptions() {
    const c = this.c;
    const k = c.known;
    const st = this.state;
    const used = st.used;
    const elapsed = this.w.clock.time - st.introStart;
    const v = c.vars;
    const opts = [];
    const add = (id, texts, tone, weight, extra = {}) => {
      if (used.has(id)) return;
      opts.push({ id, text: fill(rng.pick(texts), v), tone, weight, ...extra });
    };
    const ask = (fact, key, weight) => {
      if (!k.has(fact) && !c.asked.has(fact)) add(`ask:${fact}`, PLAYER[key], 'ask', weight, { fact });
    };
    ask('name', c.group ? 'askGroupName' : 'askName', 6);
    ask('act', 'askAct', k.has('name') ? 4 : 1.5);
    if (!c.group) ask('age', 'askAge', 1.6);
    ask('from', 'askFrom', 1.8);
    if (!c.group) ask('job', 'askJob', 2.2);
    if (c.group) ask('origin', 'askOrigin', 2.4);
    ask('experience', 'askExp', 2);
    ask('why', 'askWhy', 2);
    ask('supporter', 'askSupporter', 1.8);
    if (k.size >= 2) ask('dream', 'askDream', 2);
    if (k.has('supporter')) {
      if (v.sup) add('wave', PLAYER.wave, 'warm', 4);
      else add('wave', PLAYER.noSupporter, 'warm', 4);
    }
    if (k.has('job') && v.jobbanter) add('jobBanter', [v.jobbanter], 'banter', 3);
    if (k.has('from')) add('fromBanter', PLAYER.fromBanter, 'banter', 1.6);
    if (k.has('age') && !c.group) {
      const age = Number(v.age);
      if (age >= 62) add('ageBanter', PLAYER.ageBanterOld, 'warm', 2.5);
      if (age <= 13) add('ageBanter', PLAYER.ageBanterYoung, 'banter', 2.5);
    }
    if (k.has('experience')) {
      if (/Tuesday|three weeks|six months/.test(v.exp)) add('expBanter', PLAYER.expBanterShort, 'tease', 2.2);
      if (/twenty|whole life|since I was/.test(v.exp)) add('expBanter', PLAYER.expBanterLong, 'banter', 2);
    }
    if (c.confidence < 0.42 && st.warm < 2) opts.push({ id: `reassure${st.warm}`, text: rng.pick(PLAYER.reassure), tone: 'warm', weight: 3.5 });
    add('compliment', PLAYER.compliment, 'warm', 1.1);
    add('tease', PLAYER.tease, 'tease', 0.9);
    add('joke', PLAYER.joke, 'joke', 1);
    add('skeptic', this.actIndex > 0 ? PLAYER.skeptic : [PLAYER.skeptic[0]], 'rude', 0.8);
    add('crowdBait', PLAYER.crowdBait, 'crowd', 0.9);
    if (elapsed > 18) add('impatient', PLAYER.impatient, 'rude', 0.9);
    if (k.size >= 2 || elapsed > 16) add('start', PLAYER.start, 'start', 2 + k.size * 0.6 + elapsed / 15);
    return opts;
  }

  onIntroOption(o) {
    const w = this.w;
    const c = this.c;
    const st = this.state;
    if (st.started) return;
    const cutOff = w.speech.busy && w.speech.current.speaker === c.speaker;
    st.lastPlayer = w.clock.time;
    if (!o.fact && !o.id.startsWith('reassure') && o.tone !== 'start' && o.tone !== 'rush') st.used.add(o.id);
    if (o.id.startsWith('reassure')) st.warm++;
    if (cutOff && o.tone !== 'warm' && o.tone !== 'rush' && o.tone !== 'start') {
      this.confidence(-0.03);
      this.approve(-1);
    }
    if (o.tone === 'rush' || o.tone === 'start') {
      st.started = 'pending';
      this.slots.close();
    }
    this.exchange(async (ex) => {
      await w.playerSay(o.text, ex);
      await this.introEffect(o, ex);
    });
  }

  introProgress() {
    const st = this.state;
    const elapsed = this.w.clock.time - st.introStart;
    return clamp((this.c.known.size / 4) * 0.65 + (elapsed / 30) * 0.35);
  }

  async introEffect(o, ex) {
    const w = this.w;
    const c = this.c;
    const A = w.audience;
    const shyish = c.persona === 'shy' || c.persona === 'sweet';
    const thick = c.persona === 'cocky' || c.persona === 'deadpan' || c.persona === 'confident' || c.persona === 'quirky';
    const kind = this.kindJudge();
    const blunt = this.bluntJudge();
    switch (o.tone) {
      case 'ask': {
        c.asked.add(o.fact);
        this.confidence(0.035 * (shyish ? 1.4 : 1));
        A.nudge(0.02, 0.03);
        this.approve(0.5);
        await this.contestantSay(reply(c, o.fact), ex);
        this.learn(o.fact);
        if (o.fact === 'why' || o.fact === 'dream') this.sympathy += 0.04;
        break;
      }
      case 'warm': {
        const cocky = c.persona === 'cocky';
        this.confidence(cocky ? 0.04 : 0.1 * (0.5 + c.nerve));
        this.stats.kind++;
        this.state.warm++;
        if (o.id === 'wave') {
          A.react(c.vars.sup ? 'cheer' : 'aww', 0.7);
          A.nudge(0.08, 0.05);
          this.approve(3);
          this.sympathy += 0.05;
        } else if (cocky && o.id === 'compliment') {
          A.nudge(-0.04, 0);
          A.react('laugh', 0.2);
          this.approve(-1);
        } else {
          A.nudge(0.05, 0.02);
          this.approve(2);
          if (o.id.startsWith('reassure')) A.react('aww', 0.4);
        }
        this.respect(0.03, kind);
        await this.contestantSay(reply(c, 'thanks'), ex);
        break;
      }
      case 'banter': {
        A.react(o.id === 'fromBanter' ? 'cheer' : 'laugh', 0.45);
        A.nudge(0.04, 0.07);
        this.confidence(0.04);
        this.approve(2);
        this.viewers(0.02);
        await this.contestantSay(reply(c, rng.chance(0.5) ? 'thanks' : 'filler'), ex);
        break;
      }
      case 'joke': {
        A.react('laugh', 0.7);
        A.nudge(0.03, 0.08);
        this.confidence(0.05);
        this.approve(2);
        this.viewers(0.03);
        const funny = w.judges[0].def.humour > w.judges[1].def.humour ? 0 : 1;
        w.judgePose(funny, 'sitClap', 1.5);
        await w.judgeSay(funny, 'laugh', {}, ex);
        await this.contestantSay(reply(c, 'thanks'), ex);
        break;
      }
      case 'tease': {
        if (thick) {
          A.react('laugh', 0.6);
          A.nudge(0.02, 0.08);
          this.confidence(-0.02);
          this.approve(2);
          this.viewers(0.03);
        } else {
          A.react('ooh', 0.6);
          A.nudge(-0.02, 0.05);
          this.sympathy += 0.06;
          this.confidence(-0.12 * c.nerve);
          this.approve(-4);
          this.stats.cruel++;
          this.respect(-0.04, kind);
          await w.judgeSay(kind, 'rude', {}, ex);
        }
        await this.contestantSay(reply(c, thick ? 'filler' : 'hurt'), ex);
        break;
      }
      case 'rude': {
        this.state.rude++;
        this.stats.cruel++;
        if (c.persona === 'cocky') {
          A.react('laugh', 0.5);
          this.approve(1);
          this.confidence(-0.05);
        } else {
          A.react('ooh', 0.7);
          A.nudge(-0.03, 0.05);
          this.sympathy += 0.08;
          this.confidence(-0.16 * c.nerve);
          this.approve(-5);
          this.respect(-0.05, kind);
          this.respect(0.02, blunt);
          this.viewers(0.04);
        }
        await w.judgeSay(c.persona === 'cocky' ? blunt : kind, 'rude', {}, ex);
        await this.contestantSay(reply(c, 'hurt'), ex);
        break;
      }
      case 'crowd': {
        // Asking the room: the answer is as loud as their mood.
        const m = A.mood;
        if (m > 0.25) A.react('cheer', 0.5 + m * 0.5);
        else if (m < -0.15) A.react('boo', 0.4 + -m * 0.5);
        else A.react('clap', 0.4);
        A.nudge(0.02, 0.1);
        this.approve(1);
        this.viewers(0.02);
        break;
      }
      case 'start': {
        const early = 1 - this.introProgress();
        if (early > 0.6) {
          this.confidence(-0.05 * c.nerve);
          this.respect(-0.02, kind);
        } else {
          this.confidence(0.03);
          this.approve(1);
        }
        await this.contestantSay(reply(c, 'ready'), ex);
        this.beginAct('player');
        break;
      }
      case 'rush': {
        const early = 1 - this.introProgress();
        if (c.persona === 'cocky' && this.w.clock.time - this.state.introStart > 10) {
          A.react('laugh', 0.5);
          A.nudge(0.03, 0.06);
          this.approve(2);
          this.respect(0.03, blunt);
        } else {
          const hurt = early * (0.4 + c.charm);
          A.react('ooh', 0.3 + hurt * 0.5);
          A.nudge(-0.1 * hurt, 0.02);
          this.sympathy += 0.1 * hurt;
          this.confidence(-0.22 * c.nerve * early);
          this.approve(-8 * hurt);
          this.respect(-0.08 * early, kind);
          this.respect(0.02, blunt);
          this.stats.cruel += early > 0.5 ? 1 : 0;
        }
        const reactor = early > 0.4 ? kind : blunt;
        w.judgePose(reactor, early > 0.4 ? 'sitArms' : 'sitThumbsUp', 2);
        await w.judgeSay(reactor, 'rush', {}, ex);
        await this.contestantSay(reply(c, 'rushed'), ex);
        this.state.startedBy = 'rush';
        this.beginAct('rush');
        break;
      }
    }
  }

  beginAct(by) {
    const st = this.state;
    if (st.started === true) return;
    st.started = true;
    st.startedBy = st.startedBy || by;
    this.slots.close();
  }

  // --- Performance ------------------------------------------------------------------------------------------------

  async perform(c) {
    const w = this.w;
    this.phase = 'perform';
    const perf = (this.perf = { token: new Token(this.actToken), beats: [], avg: 0.5, weight: 0, stopped: null, t0: w.clock.time, highlights: 0, mishaps: 0 });
    if (!this.exhibitionMode) {
      w.hud.setActions('perform', { golden: !this.stats.goldenUsed });
      this.slots.open(() => this.perfOptions(), () => (w.clock.time - perf.t0 > 3 ? { id: 'stop', text: PLAYER.stop[0], tone: 'stop', fixed: true } : null), (o) => this.onPerfOption(o));
      if (this.firstAct) w.hud.hint('Hold SPACE (or the eye button) to look over your shoulder at the crowd. X buzzes.', 7);
    }
    for (const ch of c.chars) {
      ch.lookTarget = null;
      ch.emotion = c.confidence < 0.3 ? 'nervous' : 'happy';
    }
    w.studio.mood.dim = 0.35;
    w.studio.mood.energy = 0.45;
    w.audience.setMood(undefined, 0.55 + c.novelty * 0.1);
    const script = ACT_SCRIPTS[c.type];
    try {
      await script(this, c, perf.token);
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
      if (this.actToken.cancelled) throw e;
    }
    this.frameHooks.clear();
    if (!this.exhibitionMode) this.slots.close();
    w.audio.music.stop(perf.stopped ? 0.05 : 1.2);
    w.studio.mood.dim = 0;
    if (!perf.stopped && !this.goldenFor(c)) await this.finale(c);
  }

  // Performance helpers used by the act scripts.
  get q() {
    const c = this.c;
    return clamp(c.talent + (c.confidence - 0.5) * 0.35 * c.nerve);
  }
  pwait(s) {
    return this.w.clock.wait(s, this.perf.token);
  }
  psay(speaker, text) {
    return this.w.speech.say(speaker, text, this.perf.token);
  }
  music(opts = {}) {
    const c = this.c;
    const m = this.w.audio.music;
    m.start({ style: c.music?.style || 'pop', key: c.music?.key ?? 60, lead: c.music?.lead ?? null, quality: () => this.q + rng.gauss() * 0.05, ...opts });
    return m;
  }
  barSeconds() {
    return this.w.audio.music.stepDur * 16;
  }
  onMusic(fn) {
    const off = this.w.audio.music.on(fn);
    this.perf.token.listeners.add(off);
    return off;
  }
  everyFrame(fn) {
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }

  // One moment of the act. Returns how well it went (0..1) and moves the room accordingly.
  beat({ weight = 1, big = false, difficulty = 0 } = {}) {
    const c = this.c;
    const p = this.perf;
    let q = clamp(this.q + rng.gauss() * 0.09 - difficulty * (1 - c.talent) * 0.35);
    p.beats.push(q);
    p.weight += weight;
    p.avg = p.beats.length === 1 ? q : p.avg + ((q - p.avg) * weight) / Math.max(1, p.weight * 0.6);
    c.confidence = clamp(c.confidence + (q - 0.5) * 0.05);
    if (big && q > 0.75) p.highlights++;
    if (q < 0.25) p.mishaps++;
    this.crowdFollow(q, big);
    this.judgesFollow(q, big);
    return q;
  }

  crowdFollow(q, big) {
    const c = this.c;
    const p = this.perf;
    const A = this.w.audience;
    const n = p.beats.length;
    const surprise = n >= 2 ? clamp(p.avg - c.expectation, -0.3, 0.6) : 0;
    const mood = clamp((p.avg - 0.5) * 2.3 + (c.charm - 0.5) * 0.35 + surprise * 0.9 + c.novelty * 0.12 + this.sympathy, -1, 1);
    const eng = clamp(0.3 + Math.abs(p.avg - 0.5) * 1.3 + surprise * 0.4 + c.novelty * 0.15 + (big ? 0.08 : 0));
    A.setMood(mood, eng);
    this.w.studio.mood.energy = clamp(0.25 + eng * 0.6 + Math.max(0, mood) * 0.3);
    if (big) {
      if (q > 0.88) A.react('cheer', 0.9);
      else if (q > 0.72) A.react(rng.chance(0.5) ? 'ooh' : 'clap', 0.7);
      else if (q < 0.22) A.react(rng.chance(0.5) ? 'laugh' : 'gasp', 0.8);
    } else if (q > 0.8 && rng.chance(0.3)) A.react('clap', 0.4);
    else if (q < 0.2 && rng.chance(0.4)) A.react('laugh', 0.4);
  }

  judgesFollow(q, big) {
    const w = this.w;
    const c = this.c;
    const p = this.perf;
    w.judges.forEach((j, i) => {
      const taste = j.def.taste[c.type] || 0;
      j.opinion = clamp(p.avg + taste + j.def.heart * this.sympathy * 0.3 + j.noise);
      if (!big) return;
      if (q > 0.8) w.judgePose(i, rng.pick(['sitClap', 'sitLean', 'sitCheer']), 2.5);
      else if (q < 0.25) w.judgePose(i, c.music?.lead === 'voice' || c.music?.lead === 'opera' ? 'sitEars' : 'sitFacepalm', 2.5);
    });
  }

  perfOptions() {
    const p = this.perf;
    const opts = [
      { id: 'cheer', text: rng.pick(PLAYER.cheer), tone: 'cheer', weight: 2 },
      { id: 'hmm', text: rng.pick(PLAYER.hmm), tone: 'hmm', weight: 1.2 },
    ];
    if (!this.state.used.has('clapAlong') && this.c.music) opts.push({ id: 'clapAlong', text: PLAYER.clapAlong[0], tone: 'clapAlong', weight: 1.5 });
    return opts;
  }

  onPerfOption(o) {
    const w = this.w;
    const p = this.perf;
    const A = w.audience;
    if (!p || p.stopped) return;
    if (o.tone === 'stop') {
      this.stopAct('player');
      return;
    }
    // Short reactions don't stop the act; they're heard over it.
    w.hud.subtitle('You', o.text, '#ffc53d', 1.6);
    if (o.tone === 'cheer') {
      this.confidence(0.06);
      if (p.avg > 0.55) {
        A.nudge(0.04, 0.05);
        this.approve(1);
      } else if (p.avg < 0.35) {
        A.nudge(0.02, 0.02);
        this.respect(-0.02);
        this.stats.kind++;
      }
    } else if (o.tone === 'hmm') {
      this.confidence(-0.02);
      this.respect(0.01, this.bluntJudge());
    } else if (o.tone === 'clapAlong') {
      this.state.used.add('clapAlong');
      if (A.mood > -0.1) {
        A.react('clap', 0.9);
        A.nudge(0.05, 0.12);
        this.confidence(0.06);
        this.approve(2);
      } else {
        this.approve(-2);
        w.hud.feedback('Nobody claps', -1);
      }
    }
  }

  // A judge (0, 1) or the player ('player') presses an X.
  buzz(who) {
    const w = this.w;
    const p = this.perf;
    if (this.phase !== 'perform' || !p || p.stopped) return;
    const idx = who === 'player' ? 1 : who === 0 ? 0 : 2;
    if (who === 'player') {
      if (this.playerBuzzed) return;
      this.playerBuzzed = true;
      w.studio.pressBuzzer('player');
      const m = w.audience.mood;
      this.approve(m > 0.2 ? -6 - m * 6 : m < -0.2 ? 3 : -1);
      const opinions = w.judges.map((j) => j.opinion);
      opinions.forEach((o, i) => this.respect(o < 0.4 ? 0.03 : o > 0.65 ? -0.05 : 0, i));
      if (m > 0.2) this.stats.cruel++;
    } else {
      const j = w.judges[who];
      if (j.buzzed) return;
      j.buzzed = true;
      w.studio.pressBuzzer(`judge${who}`);
      w.judgePose(who, 'point', 1.5);
    }
    w.studio.setX(idx, true);
    w.audio.sfx('buzzer');
    this.viewers(0.05);
    const m = w.audience.mood;
    if (m > 0.2) w.audience.react('boo', 0.6);
    else w.audience.react(m < -0.3 ? 'cheer' : 'ooh', 0.5);
    this.confidence(-0.08);
    for (const ch of this.c.chars) {
      ch.emotion = 'shock';
      setTimeout(() => ch.emotion === 'shock' && (ch.emotion = 'nervous'), 900);
    }
    const all = this.playerBuzzed && w.judges.every((j) => j.buzzed);
    if (all) this.stopAct('buzzers');
  }

  stopAct(reason) {
    const w = this.w;
    const p = this.perf;
    if (!p || p.stopped) return;
    p.stopped = reason;
    this.stats.stops++;
    p.token.cancel();
    w.audio.sfx('scratch');
    w.audio.music.stop(0.05);
    const m = w.audience.mood;
    if (reason === 'player') {
      this.approve(m > 0.2 ? -8 - m * 6 : m < -0.3 ? 4 : -2);
      if (m > 0.2) w.audience.react('boo', 0.8);
      else w.audience.react('clap', 0.5);
      this.respect(p.avg < 0.35 ? 0.02 : -0.05);
    } else {
      w.audience.react(m > 0 ? 'boo' : 'cheer', 0.7);
      this.viewers(0.15, 'Buzzed off');
    }
    for (const ch of this.c.chars) {
      ch.overrides = ch.overrides && this.c.type === 'vent' ? ch.overrides : null;
      ch.set('idle', 'sad');
      ch.spin = 0;
      ch.j.bodyX = 0;
      ch.root.position.y = MARK.y;
    }
  }

  async finale(c) {
    const w = this.w;
    const p = this.perf;
    const A = w.audience;
    for (const ch of c.chars) {
      ch.spin = 0;
      ch.set(p.avg > 0.45 ? 'present' : 'bow', p.avg > 0.6 ? 'elated' : p.avg > 0.35 ? 'happy' : 'nervous');
    }
    const m = A.mood;
    if (p.avg > 0.72 && m > 0.45) {
      A.setOvation(1);
      A.react('cheer', 1.2);
      w.studio.mood.energy = 1;
      this.viewers(0.2, 'Standing ovation');
      for (let i = 0; i < 2; i++) w.judgePose(i, w.judges[i].opinion > 0.6 ? 'standOvation' : 'sitClap', 4);
    } else if (m > 0.15) A.react('clap', 0.9);
    else if (m < -0.35) A.react('boo', 0.8);
    else A.react('clap', 0.35);
    await this.wait(1.6, this.actToken);
    for (const ch of c.chars) ch.set('idle');
  }

  // --- Golden buzzer ----------------------------------------------------------------------------------------------

  golden() {
    const w = this.w;
    if (this.stats.goldenUsed || (this.phase !== 'perform' && this.phase !== 'ruling')) return;
    const c = this.c;
    this.stats.goldenUsed = true;
    this.stats.golden = { name: c.name, talent: c.talent, mood: w.audience.mood };
    this.decision = 'yes';
    this.goldenAct = c;
    if (this.perf && !this.perf.stopped) {
      this.perf.stopped = 'golden';
      this.perf.token.cancel();
    }
    if (this.ex) this.ex.cancel();
    w.speech.interrupt();
    this.slots.close();
    w.hud.setActions(null);
    w.audio.music.stop(0.3);
    quietly(this.goldenMoment(c));
  }
  goldenFor(c) {
    return this.goldenAct === c;
  }

  async goldenMoment(c) {
    const w = this.w;
    const A = w.audience;
    const m = A.mood;
    const avg = this.perf ? this.perf.avg : c.talent;
    this.phase = 'golden';
    w.studio.pressBuzzer('golden');
    w.audio.sfx('golden');
    w.studio.mood.golden = 1;
    w.studio.mood.energy = 1;
    w.fx.confettiBurst(undefined, 650, true);
    w.look.shake(0.25);
    A.setOvation(m > -0.2 ? 1 : 0.3);
    A.react('cheer', m > -0.2 ? 1.3 : 0.5);
    w.studio.wall.show({ kind: 'title', title: c.name, sub: '★ GOLDEN BUZZER ★', color: '#ffc53d' });
    this.approve(m > 0.3 ? 10 : m < -0.1 ? -12 : 2);
    this.viewers(0.6, 'Golden buzzer');
    w.judges.forEach((j, i) => {
      const agree = j.opinion > 0.55;
      this.respect(agree ? 0.06 : -0.08, i);
      w.judgePose(i, agree ? 'sitCheer' : 'sitArms', 4);
    });
    for (const ch of c.chars) ch.set('shock', 'shock');
    this.recordDecision(true, { golden: true });
    await this.wait(1.2, this.actToken);
    for (const ch of c.chars) ch.set('cry', 'elated');
    await this.contestantSay(reply(c, 'gotYes'), this.actToken);
    const j = w.judges[0].opinion > w.judges[1].opinion ? 0 : 1;
    await w.judgeSay(j, 'golden', {}, this.actToken);
    for (const ch of c.chars) ch.set('cheer', 'elated');
    await this.wait(2.5, this.actToken);
    w.studio.mood.golden = 0;
    A.setOvation(0);
    this.phase = 'walkoff';
    // Hand the act loop back its walk-off.
    this.goldenDone = true;
    void avg;
  }

  // --- Ruling ----------------------------------------------------------------------------------------------------

  async ruling(c) {
    const w = this.w;
    this.phase = 'ruling';
    const p = this.perf;
    const A = w.audience;
    this.rulingToken = null;
    this.decision = null;
    this.state.judgesDone = false;
    w.hud.setActions('ruling', { golden: !this.stats.goldenUsed });
    this.slots.open(() => this.rulingOptions(), () => null, (o) => this.onRulingOption(o));
    if (this.firstAct) w.hud.hint('Your call. Press Y for YES, N for NO. The panel votes, but you have the final say.', 7);
    // Contestant catches their breath.
    await this.contestantSay(reply(c, p.stopped ? 'hurt' : 'after'), this.actToken).catch(() => {});
    // The panel speaks, in a random order, waiting their turn if you're talking.
    let pending = rng.shuffle([0, 1]);
    while (!this.decision && !this.goldenFor(c)) {
      pending = pending.filter((i) => !w.judges[i].vote);
      if (!pending.length) break;
      await this.wait(0.2, this.actToken);
      if (w.speech.busy || this.ex) continue;
      const tok = new Token(this.actToken);
      this.rulingToken = tok;
      try {
        await this.judgeComment(pending[0], tok);
      } catch (e) {
        if (!(e instanceof Cancelled) || this.actToken.cancelled) throw e;
      }
    }
    this.state.judgesDone = true;
    if (!this.decision) w.hud.prompt(`${c.first} looks at you. Your call.`);
    let chanting = false;
    let nudged = false;
    const since = w.clock.time;
    while (!this.decision && !this.goldenFor(c)) {
      await this.wait(0.25, this.actToken);
      const waited = w.clock.time - since;
      if (!chanting && waited > 12) {
        chanting = true;
        const m = A.mood;
        if (m > 0.1) A.chant('yes');
        else if (m < -0.25) A.chant('off');
      }
      if (!nudged && waited > 22 && !w.speech.busy) {
        nudged = true;
        quietly(w.judgeSay(rng.int(0, 1), 'waiting', {}, this.actToken));
        this.respect(-0.03);
        A.nudge(0, -0.1);
      }
    }
    A.chant(null);
    w.hud.prompt(null);
    this.slots.close();
    w.hud.setActions(null);
    if (this.goldenFor(c)) {
      await w.clock.waitFor(() => this.goldenDone, this.actToken, 15);
      this.goldenDone = false;
      return;
    }
    await this.decisionMoment(c);
  }

  async judgeComment(i, token) {
    const w = this.w;
    const j = w.judges[i];
    const c = this.c;
    const p = this.perf;
    const o = p.stopped === 'buzzers' ? Math.min(j.opinion, 0.3) : j.opinion;
    const key = o > 0.66 ? 'good' : o > 0.42 ? 'mid' : 'bad';
    if (!j.commented) {
      await w.judgeSay(i, key, { first: c.first }, token);
      j.commented = true;
    }
    j.vote = o > 0.5 && p.stopped !== 'buzzers' ? 'yes' : 'no';
    w.judgePose(i, j.vote === 'yes' ? 'sitThumbsUp' : 'sitThumbsDown', 2);
    w.hud.setVotes(w.judges, null);
    await w.judgeSay(i, j.vote, {}, token);
    if (j.vote === 'yes') w.audience.react('clap', 0.5);
    else if (w.audience.mood > 0.2) w.audience.react('boo', 0.4);
  }

  rulingOptions() {
    const w = this.w;
    const opts = [
      { id: 'praise', text: rng.pick(PLAYER.praise), tone: 'praise', s: 1, weight: 1.5 },
      { id: 'warm', text: rng.pick(PLAYER.warm), tone: 'praise', s: 0.5, weight: 1.3 },
      { id: 'constructive', text: rng.pick(PLAYER.constructive), tone: 'critique', s: -0.2, weight: 1.3 },
      { id: 'harsh', text: rng.pick(PLAYER.harsh), tone: 'critique', s: -1, weight: 1.1 },
      { id: 'quip', text: rng.pick(PLAYER.quip), tone: 'critique', s: -0.4, weight: 0.8 },
      { id: 'empathy', text: rng.pick(PLAYER.empathy), tone: 'praise', s: 0.3, weight: 1 },
      { id: 'crowdAsk', text: rng.pick(PLAYER.crowdAsk), tone: 'crowd', weight: 1.2 },
    ];
    const silent = w.judges.filter((j) => !j.vote);
    if (silent.length && !this.state.judgesDone) {
      const j = rng.pick(silent);
      opts.push({ id: `askJudge${j.index}`, text: fill(rng.pick(PLAYER.askJudge), { judge: j.def.short }), tone: 'askJudge', judge: j.index, weight: 1.5 });
    }
    return opts.filter((o) => !this.state.used.has(`v:${o.id}`));
  }

  onRulingOption(o) {
    const w = this.w;
    const c = this.c;
    const A = w.audience;
    this.state.used.add(`v:${o.id}`);
    const judgeTalking = w.speech.busy && w.judges.some((j) => j.speaker === w.speech.current.speaker);
    if (judgeTalking) this.respect(-0.03);
    if (o.tone === 'askJudge') {
      if (this.rulingToken) this.rulingToken.cancel();
      this.exchange(async (ex) => {
        await w.playerSay(o.text, ex);
        await this.judgeComment(o.judge, ex);
      });
      return;
    }
    if (judgeTalking && this.rulingToken) {
      // You spoke over a judge: they wait and try again.
      this.rulingToken.cancel();
    }
    this.exchange(async (ex) => {
      await w.playerSay(o.text, ex);
      if (o.tone === 'crowd') {
        const m = A.mood;
        if (m > 0.3) A.react('cheer', 0.6 + m * 0.5);
        else if (m < -0.2) A.react('boo', 0.5 - m * 0.5);
        else A.react('clap', 0.4);
        A.nudge(0, 0.08);
        this.viewers(0.02);
        return;
      }
      const p = this.perf;
      const truth = p.avg * 2 - 1;
      const m = A.mood;
      const honesty = 1 - Math.abs(o.s - truth) / 2;
      this.respect((honesty - 0.6) * 0.1);
      this.approve(-Math.abs(o.s - m) * 3 + (o.s > 0 ? 1 : o.s < -0.5 ? -2 : 0));
      if (o.s < -0.5 && (c.persona === 'shy' || c.persona === 'sweet')) {
        A.react(m > 0 ? 'boo' : 'aww', 0.5);
        this.stats.cruel++;
      } else if (o.s < -0.3 && m < -0.2) A.react('laugh', 0.4);
      else if (o.s > 0.4 && m > 0.2) A.react('clap', 0.5);
      if (o.s > 0) this.stats.kind++;
      for (const ch of c.chars) ch.emotion = o.s > 0.2 ? 'happy' : o.s < -0.3 ? 'sad' : ch.emotion;
      await this.contestantSay(reply(c, o.s > 0.2 ? 'thanks' : o.s < -0.3 ? 'hurt' : 'filler'), ex);
    });
  }

  decide(yes) {
    if (this.phase !== 'ruling' || this.decision) return;
    const w = this.w;
    if (!this.state.judgesDone) {
      // Deciding before the panel has spoken.
      const silent = w.judges.filter((j) => !j.vote).length;
      this.respect(-0.05 * silent);
    }
    this.decision = yes ? 'yes' : 'no';
    if (this.rulingToken) this.rulingToken.cancel();
    if (this.ex) this.ex.cancel();
    w.speech.interrupt();
  }

  async decisionMoment(c) {
    const w = this.w;
    const A = w.audience;
    const yes = this.decision === 'yes';
    const m = A.mood;
    w.audio.sfx(yes ? 'yes' : 'no');
    w.hud.bigStamp(yes ? 'YES' : 'NO', yes ? 'yes' : 'no');
    w.studio.mood.flash = 0.8;
    w.studio.wall.show({ kind: 'title', title: yes ? 'Yes!' : 'No', sub: c.name.toUpperCase(), color: yes ? '#36d399' : '#ff3d57' });
    const agree = yes ? m > -0.05 : m < 0.1;
    const strength = Math.abs(m);
    if (agree) {
      A.react(yes ? 'cheer' : 'clap', 0.6 + strength * 0.6);
      this.approve(3 + strength * 7);
    } else {
      A.react('boo', 0.5 + strength * 0.6);
      A.react('gasp', 0.6);
      this.approve(-5 - strength * 10);
      this.viewers(0.12, 'Crowd outrage');
    }
    this.recordDecision(yes);
    for (const ch of c.chars) ch.set(yes ? 'cheer' : 'idle', yes ? 'elated' : 'sad');
    if (c.dog) c.dog.set(yes ? 'jump' : 'sit');
    await this.contestantSay(reply(c, yes ? 'gotYes' : 'gotNo'), this.actToken).catch(() => {});
    // Fellow judges react to being agreed with, or overruled.
    const dissenters = w.judges.filter((j) => j.vote && (j.vote === 'yes') !== yes);
    w.judges.forEach((j, i) => {
      if (!j.vote) return;
      this.respect((j.vote === 'yes') === yes ? 0.04 : -0.05, i);
    });
    if (dissenters.length) {
      await w.judgeSay(dissenters[0].index, 'disagree', {}, this.actToken).catch(() => {});
    } else if (rng.chance(0.5)) {
      await w.judgeSay(rng.int(0, 1), 'agree', {}, this.actToken).catch(() => {});
    }
    await this.wait(0.8, this.actToken);
  }

  recordDecision(yes, extra = {}) {
    const c = this.c;
    const p = this.perf;
    this.log.push({
      name: c.name,
      label: c.label,
      talent: c.talent,
      shown: p ? p.avg : c.talent,
      yes,
      golden: !!extra.golden,
      crowd: this.w.audience.mood,
      stopped: p ? p.stopped : null,
      rushed: this.state.startedBy === 'rush',
      votes: this.w.judges.map((j) => j.vote),
    });
  }

  // --- Exhibitions (tournament) ----------------------------------------------------------------------------------

  // An act performs a shortened routine with no intro and no ruling. Resolves to how well it went (0..1).
  async exhibition(c, token) {
    this.exhibitionMode = true;
    this.short = true;
    this.token = token;
    this.actToken = new Token(token);
    this.c = c;
    this.sympathy = 0;
    this.playerBuzzed = false;
    this.goldenAct = null;
    this.state = { used: new Set(), startedBy: null };
    if (!this.stats) this.stats = { approval: 60, respect: 60, kind: 0, cruel: 0, viewers: 5, peak: 5, history: [5], marks: [], goldenUsed: true, golden: null, stops: 0 };
    for (const j of this.w.judges) {
      j.noise = rng.gauss() * 0.06;
      j.opinion = 0.5;
      j.buzzed = true;
    }
    try {
      this.phase = 'perform';
      await this.perform(c);
    } finally {
      this.frameHooks.clear();
      for (const fn of this.cleanups.splice(0)) fn();
      this.exhibitionMode = false;
      this.short = false;
      this.phase = 'idle';
    }
    return this.perf ? this.perf.avg : 0.5;
  }
  cancelExhibition() {
    if (this.actToken) this.actToken.cancel();
    this.frameHooks.clear();
    for (const fn of this.cleanups.splice(0)) fn();
    this.w.audio.music.stop(0.3);
  }

  // --- Frame update -----------------------------------------------------------------------------------------------

  update(dt, t) {
    const w = this.w;
    this.slots.update(dt);
    for (const fn of this.frameHooks) fn(dt, t);
    if (this.exhibitionMode || this.phase === 'idle' || this.phase === 'summary') return;
    // Viewers drift with how gripping the room is.
    const eng = w.audience.engagement;
    this.viewers((eng - 0.45) * 0.03 * dt);
    this.historyTimer += dt;
    if (this.historyTimer > 2) {
      this.historyTimer = 0;
      this.stats.history.push(this.stats.viewers);
    }
    w.hud.setViewers(this.stats.viewers, eng - 0.45);
    // Fellow judges reach for their buzzers when they can't take any more.
    const p = this.perf;
    if (this.phase === 'perform' && p && !p.stopped && p.beats.length >= 3) {
      w.judges.forEach((j, i) => {
        if (j.buzzed) return;
        const threshold = 0.3 + j.def.harsh * 0.12 - j.def.heart * 0.08;
        if (j.opinion < threshold) {
          const room = w.audience.mood > 0.3 ? 0.15 : 1;
          if (rng.chance(dt * (0.2 + (threshold - j.opinion) * 2) * room)) this.buzz(i);
        }
      });
    }
  }

  // --- Scoring ----------------------------------------------------------------------------------------------------

  summary() {
    const s = this.stats;
    const log = this.log;
    const calls = log.filter((l) => !l.stopped || l.yes);
    const right = log.filter((l) => (l.yes ? l.talent >= 0.55 : l.talent < 0.55)).length;
    const eye = log.length ? Math.round((right / log.length) * 100) : 0;
    const yesRate = log.length ? log.filter((l) => l.yes).length / log.length : 0;
    const rowdy = log.filter((l) => (l.yes ? l.crowd < -0.25 : l.crowd > 0.3)).length;
    let key = 'fine';
    if (s.golden && s.golden.talent >= 0.7) key = 'goldenGood';
    else if (s.golden && s.golden.talent < 0.45) key = 'goldenBad';
    else if (s.cruel >= 5) key = 'harsh';
    else if (rowdy >= 2) key = 'rowdy';
    else if (yesRate > 0.85 && log.length >= 4) key = 'soft';
    else if (s.viewers < 4.3) key = 'boring';
    else if (s.approval > 72 && eye >= 66) key = 'great';
    const score = s.approval * 0.35 + s.respect * 0.25 + eye * 0.25 + clamp((s.viewers - 3) * 8, 0, 60) * 0.25;
    const stars = clamp(Math.round(score / 20), 1, 5);
    const rulings = ['You’ve been replaced by a hologram.', 'The network wants a quiet word.', 'You’ll do. For now.', 'Renewed for another series!', 'The nation’s favourite judge.'];
    return {
      city: this.city,
      headline: rng.pick(HEADLINES[key]),
      stars,
      ruling: rulings[stars - 1],
      approval: Math.round(s.approval),
      respect: Math.round(s.respect),
      eye,
      viewers: s.viewers,
      peak: s.peak,
      history: s.history,
      log,
      judges: this.w.judges.map((j) => ({ name: j.def.name, respect: Math.round(j.respect * 100) })),
      kind: s.kind,
      cruel: s.cruel,
      calls: calls.length,
    };
  }
}

export { cap };
