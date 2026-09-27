// What every mode shares: the fellow judges at the desk, the people on stage, and who is speaking.
import * as THREE from 'three';
import { Character } from './character.js';
import { JUDGE_SEATS, SEAT } from './studio.js';
import { clamp, fill, rng, Token, Cancelled } from './util.js';

export const SPEAKER_COLORS = { player: '#ffc53d', judge: '#9fd8ff', contestant: '#fff4dc', puppet: '#ff9ed2' };

// One line of dialogue at a time. A new line interrupts the one before it.
class Speech {
  constructor(world) {
    this.world = world;
    this.current = null;
    this.lastEnd = 0;
  }
  get busy() {
    return !!this.current;
  }
  // speaker: { name, color, voice, char } — char gets its mouth moved. Resolves true if finished, false if cut off.
  async say(speaker, text, token) {
    const w = this.world;
    this.interrupt();
    const own = new Token(token);
    const entry = { speaker, text, token: own };
    this.current = entry;
    w.hud.subtitle(speaker.name, text, speaker.color);
    if (speaker.char) speaker.char.talking = true;
    const voice = speaker.voice || { pitch: 180 };
    let dur = w.audio.babble(text, voice);
    const reading = (0.9 + text.length * 0.045) / (w.settings.textSpeed || 1);
    const spoken = w.audio.speak(text, voice);
    dur = Math.max(dur, reading);
    let finished = true;
    const start = w.clock.time;
    try {
      if (spoken) {
        let done = false;
        spoken.then(() => (done = true));
        await w.clock.waitFor(() => done && w.clock.time - start >= reading * 0.6, own, dur * 3 + 4);
      } else await w.clock.wait(dur, own);
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
      finished = false;
    }
    if (speaker.char) speaker.char.talking = false;
    if (this.current === entry) {
      this.current = null;
      this.lastEnd = w.clock.time;
      w.hud.subtitleDone();
    }
    if (!finished && token && token.cancelled) throw new Cancelled();
    return finished;
  }
  interrupt() {
    const c = this.current;
    if (!c) return false;
    this.current = null;
    this.lastEnd = this.world.clock.time;
    c.token.cancel();
    if (c.speaker.char) c.speaker.char.talking = false;
    this.world.audio.stopSpeaking();
    this.world.hud.subtitleCut();
    return true;
  }
}

export class World {
  constructor(ctx) {
    Object.assign(this, ctx); // studio, audience, audio, fx, hud, look, clock, settings
    this.scene = this.studio.scene;
    this.cast = new Set();
    this.judges = [];
    this.speech = new Speech(this);
    this.timedPoses = [];
    this.player = { name: 'You', color: SPEAKER_COLORS.player, voice: { pitch: 165, rate: 1.05, timbre: 'triangle' } };
  }

  add(thing) {
    this.cast.add(thing);
    if (thing.root && !thing.root.parent) this.scene.add(thing.root);
    return thing;
  }
  remove(thing) {
    this.cast.delete(thing);
    if (thing.dispose) thing.dispose();
    else if (thing.root && thing.root.parent) thing.root.parent.remove(thing.root);
  }
  clearCast() {
    for (const c of [...this.cast]) if (!c.isJudge) this.remove(c);
  }

  setJudges(defs) {
    for (const j of this.judges) this.remove(j.char);
    this.judges = defs.map((def, i) => {
      const char = new Character(def.look);
      char.isJudge = true;
      char.place(JUDGE_SEATS[i]);
      char.root.rotation.y = Math.PI;
      char.face(Math.PI);
      char.set('sit');
      char.lookTarget = null;
      this.add(char);
      return { def, char, index: i, respect: 0.6, opinion: 0.5, vote: null, buzzed: false, speaker: { name: def.short, color: SPEAKER_COLORS.judge, voice: def.voice, char } };
    });
  }

  // A judge strikes a pose for a while, then settles back into their chair.
  judgePose(i, pose, seconds = 2.5) {
    const j = this.judges[i];
    if (!j) return;
    j.char.set(pose);
    this.timedPoses = this.timedPoses.filter((p) => p.char !== j.char);
    this.timedPoses.push({ char: j.char, until: this.clock.time + seconds, rest: 'sit' });
  }
  pose(char, pose, seconds, rest = 'idle') {
    char.set(pose);
    this.timedPoses = this.timedPoses.filter((p) => p.char !== char);
    if (seconds) this.timedPoses.push({ char, until: this.clock.time + seconds, rest });
  }

  judgeLine(i, key, vars = {}) {
    const j = this.judges[i];
    const list = j.def.lines[key];
    return list ? fill(rng.pick(list), vars) : '';
  }
  async judgeSay(i, key, vars, token) {
    const j = this.judges[i];
    const text = typeof key === 'string' && j.def.lines[key] ? this.judgeLine(i, key, vars) : key;
    if (!text) return true;
    j.char.lookTarget = SEAT;
    const pose = j.char.pose;
    if (pose === 'sit') j.char.set('sitTalk');
    const ok = await this.speech.say(j.speaker, text, token);
    if (j.char.pose === 'sitTalk') j.char.set('sit');
    return ok;
  }
  playerSay(text, token) {
    return this.speech.say(this.player, text, token);
  }

  update(dt, t) {
    for (const c of this.cast) c.update(dt, t);
    if (this.timedPoses.length) {
      const now = this.clock.time;
      this.timedPoses = this.timedPoses.filter((p) => {
        if (now >= p.until) {
          p.char.set(p.rest);
          return false;
        }
        return true;
      });
    }
  }
}

export { clamp };
export const tmpV = new THREE.Vector3();
