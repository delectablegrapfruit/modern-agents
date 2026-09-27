// Every sound in the game is synthesised with the Web Audio API: the crowd (murmur, applause, roar, boos, laughs,
// gasps, chants), the buzzers and stings, a small band that plays each act's music, and the babbling voices.
import { clamp, rng, TAU } from './util.js';

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Vowel formants (F1, F2) for the voices and the crowd.
const VOWELS = {
  a: [730, 1090],
  e: [530, 1840],
  i: [300, 2200],
  o: [570, 840],
  u: [300, 870],
  aw: [650, 1000],
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.music = new Music(this);
    this.crowdLevels = { murmur: 0, applause: 0, roar: 0, boo: 0, facing: 0 };
    this.chantKind = null;
    this.chantNext = 0;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }
  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // Must be called from a user gesture; safe to call repeatedly.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        this.ctx = null;
        return;
      }
      this.buildGraph();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.settings.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.now, 0.05);
  }

  buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.settings.volume ?? 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet).connect(this.master);

    const bus = (level, send = 0) => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(this.master);
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s).connect(this.reverb);
      }
      return g;
    };
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'lowpass';
    this.crowdFilter.frequency.value = 2400;
    this.crowdBus = ctx.createGain();
    this.crowdBus.gain.value = 0.9;
    this.crowdBus.connect(this.crowdFilter);
    const crowdOut = bus(0.85, 0.35);
    this.crowdFilter.connect(crowdOut);
    this.musicBus = bus(0.5, 0.3);
    this.sfxBus = bus(0.7, 0.15);
    this.voiceBus = bus(0.55, 0.12);

    this.noise = this.noiseBuffer(3);
    this.pink = this.pinkBuffer(4);

    // Continuous crowd layers
    this.layers = {};
    const loop = (buffer, filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = buffer.duration;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.crowdBus);
      src.start(0, rng.range(0, buffer.duration));
      return { src, filter: f, gain: g };
    };
    this.layers.murmur = loop(this.babbleBuffer(6), 'bandpass', 600, 0.5);
    this.layers.applause = loop(this.applauseBuffer(4), 'highpass', 400, 0.5);
    this.layers.roar = loop(this.pink, 'bandpass', 900, 0.7);
    // Boos: a bank of detuned low voices through an "oo" formant.
    const booGain = ctx.createGain();
    booGain.gain.value = 0;
    const booF = ctx.createBiquadFilter();
    booF.type = 'lowpass';
    booF.frequency.value = 520;
    booF.Q.value = 2;
    booF.connect(booGain).connect(this.crowdBus);
    for (let i = 0; i < 10; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = rng.range(105, 190);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rng.range(3, 6);
      const depth = ctx.createGain();
      depth.gain.value = rng.range(2, 6);
      lfo.connect(depth).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.05;
      o.connect(g).connect(booF);
      o.start();
      lfo.start();
    }
    this.layers.boo = { gain: booGain };
  }

  // --- Buffers --------------------------------------------------------------------------------------------------

  noiseBuffer(seconds) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  pinkBuffer(seconds) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return b;
  }
  // Many people clapping: short band-limited bursts at random times.
  applauseBuffer(seconds) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const b = ctx.createBuffer(2, Math.floor(sr * seconds), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const claps = Math.floor(seconds * 95);
      for (let n = 0; n < claps; n++) {
        const start = Math.floor(Math.random() * d.length);
        const len = Math.floor(sr * rng.range(0.006, 0.02));
        const amp = rng.range(0.15, 0.6);
        const f = rng.range(900, 2600);
        const w = (TAU * f) / sr;
        const r = 0.93;
        let y1 = 0, y2 = 0;
        for (let i = 0; i < len * 3; i++) {
          const x = (Math.random() * 2 - 1) * Math.exp(-i / len) * amp;
          const y = x + 2 * r * Math.cos(w) * y1 - r * r * y2;
          y2 = y1;
          y1 = y;
          const k = (start + i) % d.length;
          d[k] += y * 0.12;
        }
      }
    }
    return b;
  }
  // A room of people talking: noise shaped by moving vowel formants.
  babbleBuffer(seconds) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const b = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = b.getChannelData(0);
    const voices = 14;
    for (let v = 0; v < voices; v++) {
      let phase = 0;
      const f0 = rng.range(100, 260);
      let syll = 0;
      let amp = 0;
      let y1 = 0, y2 = 0;
      let fc = 700;
      for (let i = 0; i < d.length; i++) {
        if (i >= syll) {
          syll = i + Math.floor(sr * rng.range(0.08, 0.22));
          amp = rng.chance(0.25) ? 0 : rng.range(0.3, 1);
          fc = rng.pick([300, 530, 730, 570, 650]);
        }
        phase += f0 / sr;
        const src = (phase % 1) * 2 - 1 + (Math.random() - 0.5) * 0.6;
        const w = (TAU * fc) / sr;
        const r = 0.97;
        const y = src * 0.05 + 2 * r * Math.cos(w) * y1 - r * r * y2;
        y2 = y1;
        y1 = y;
        d[i] += y * amp * 0.08;
      }
    }
    return b;
  }
  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // --- Crowd ----------------------------------------------------------------------------------------------------

  setCrowd(levels) {
    if (!this.running) return;
    const t = this.now;
    const L = this.layers;
    L.murmur.gain.gain.setTargetAtTime(levels.murmur * 1.6, t, 0.4);
    L.applause.gain.gain.setTargetAtTime(levels.applause * 1.3, t, 0.25);
    L.roar.gain.gain.setTargetAtTime(levels.roar * 0.9, t, 0.3);
    L.boo.gain.gain.setTargetAtTime(levels.boo * 0.9, t, 0.35);
    this.crowdFilter.frequency.setTargetAtTime(2200 + levels.facing * 9000, t, 0.2);
    this.crowdBus.gain.setTargetAtTime(0.85 + levels.facing * 0.35, t, 0.2);
    this.crowdLevels = levels;
  }

  // A formant voice: source → two band-pass filters → envelope. Used by the crowd one-shots and the babble.
  voice({ t, f0, f1, vowel = 'a', dur = 0.3, attack = 0.02, peak = 0.2, type = 'sawtooth', out, vibrato = 0, breath = 0.2, glideTo }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const d = ctx.createGain();
      d.gain.value = f0 * vibrato;
      lfo.connect(d).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    const [F1, F2] = VOWELS[vowel] || VOWELS.a;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0.0001, t + dur - Math.min(0.08, dur * 0.4), 0.04);
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.frequency.value = F1;
    b1.Q.value = 5;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.frequency.value = F2;
    b2.Q.value = 7;
    const mix = ctx.createGain();
    mix.gain.value = 3;
    o.connect(b1).connect(mix);
    o.connect(b2).connect(mix);
    mix.connect(g).connect(out || this.crowdBus);
    if (breath) {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = F2;
      nf.Q.value = 1;
      const ng = ctx.createGain();
      ng.gain.value = breath;
      n.connect(nf).connect(ng).connect(g);
      n.start(t, rng.range(0, 2));
      n.stop(t + dur + 0.1);
    }
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  laugh(strength = 1) {
    if (!this.running) return;
    const n = Math.round(4 + strength * 16);
    for (let v = 0; v < n; v++) {
      const start = this.now + rng.range(0, 0.5);
      const f0 = rng.range(150, 340);
      const count = rng.int(3, 7);
      const rate = rng.range(0.13, 0.19);
      for (let k = 0; k < count; k++) {
        this.voice({ t: start + k * rate, f0: f0 * (1 - k * 0.025), vowel: rng.pick(['a', 'e', 'a']), dur: rate * 0.8, attack: 0.01, peak: 0.05 * strength * (1 - k / (count + 2)), breath: 0.6 });
      }
    }
  }
  gasp(strength = 1) {
    if (!this.running) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.pink;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.6 * strength, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(f).connect(g).connect(this.crowdBus);
    src.start(t, rng.range(0, 2));
    src.stop(t + 0.8);
    for (let v = 0; v < 8 * strength; v++) this.voice({ t: t + rng.range(0, 0.1), f0: rng.range(200, 380), glideTo: rng.range(400, 600), vowel: 'o', dur: 0.45, peak: 0.03 * strength, breath: 1 });
  }
  cheer(strength = 1) {
    if (!this.running) return;
    const t = this.now;
    const n = Math.round(3 + strength * 10);
    for (let v = 0; v < n; v++) {
      const s = t + rng.range(0, 0.8);
      const f0 = rng.range(280, 480);
      this.voice({ t: s, f0, f1: f0 * rng.range(1.5, 1.9), glideTo: f0 * 1.1, vowel: rng.pick(['u', 'o', 'e']), dur: rng.range(0.5, 1.0), attack: 0.06, peak: 0.045 * strength, breath: 0.4 });
    }
    // A swell in the roar layer
    const g = this.layers.roar.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.9 * strength, t + 0.3);
    g.setTargetAtTime(this.crowdLevels.roar * 0.9, t + 0.8, 0.8);
  }
  aww(strength = 1) {
    if (!this.running) return;
    for (let v = 0; v < 6 + strength * 10; v++) {
      const f0 = rng.range(230, 400);
      this.voice({ t: this.now + rng.range(0, 0.25), f0, glideTo: f0 * 0.72, vowel: 'aw', dur: rng.range(0.9, 1.3), attack: 0.1, peak: 0.035 * strength, breath: 0.3, vibrato: 0.01 });
    }
  }
  ooh(strength = 1) {
    if (!this.running) return;
    for (let v = 0; v < 6 + strength * 10; v++) {
      const f0 = rng.range(200, 360);
      this.voice({ t: this.now + rng.range(0, 0.2), f0, f1: f0 * 1.35, vowel: 'u', dur: rng.range(0.8, 1.2), attack: 0.1, peak: 0.035 * strength, breath: 0.3 });
    }
  }
  booBurst(strength = 1) {
    if (!this.running) return;
    const t = this.now;
    const g = this.layers.boo.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.9 * strength, t + 0.25);
    g.setTargetAtTime(this.crowdLevels.boo * 0.9, t + 1.2, 0.6);
  }
  // Rhythmic chant — 'yes' or 'off' — until chant(null).
  chant(kind) {
    this.chantKind = kind;
    this.chantNext = this.now + 0.2;
  }
  crickets() {
    if (!this.running) return;
    for (let k = 0; k < 3; k++) {
      const t0 = this.now + 0.2 + k * 0.7;
      for (let i = 0; i < 4; i++) {
        const t = t0 + i * 0.055;
        const o = this.ctx.createOscillator();
        o.frequency.value = 4400;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        o.connect(g).connect(this.sfxBus);
        o.start(t);
        o.stop(t + 0.06);
      }
    }
  }

  // --- Sound effects --------------------------------------------------------------------------------------------

  tone({ t = this.now, f, type = 'sine', dur = 0.3, peak = 0.3, attack = 0.005, out, glideTo, filter }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = filter.type || 'lowpass';
      fl.frequency.value = filter.f;
      fl.Q.value = filter.q || 0.7;
      node = node.connect(fl);
    }
    node.connect(g).connect(out || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  noiseHit({ t = this.now, dur = 0.2, peak = 0.3, type = 'bandpass', f = 1000, q = 1, out, sweepTo }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(out || this.sfxBus);
    src.start(t, rng.range(0, 2));
    src.stop(t + dur + 0.05);
  }

  sfx(name, opts = {}) {
    if (!this.running) return;
    const t = this.now;
    switch (name) {
      case 'buzzer': {
        // The honk of an X buzzer.
        for (const f of [174, 181, 348]) this.tone({ f, type: 'square', dur: 1.0, peak: f > 300 ? 0.05 : 0.14, attack: 0.01, filter: { f: 1800 }, glideTo: f * 0.94 });
        break;
      }
      case 'golden': {
        [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => {
          this.tone({ t: t + i * 0.07, f: midiHz(m), type: 'triangle', dur: 1.6, peak: 0.12 });
          this.tone({ t: t + i * 0.07, f: midiHz(m + 12), type: 'sine', dur: 1.2, peak: 0.05 });
        });
        this.noiseHit({ t, dur: 2.5, peak: 0.25, type: 'highpass', f: 6000 });
        this.tone({ t, f: 55, type: 'sine', dur: 1.5, peak: 0.5, glideTo: 40 });
        break;
      }
      case 'whoosh':
        this.noiseHit({ t, dur: 0.5, peak: 0.25, f: 400, sweepTo: 3000, q: 2 });
        break;
      case 'riser':
        this.noiseHit({ t, dur: 1.2, peak: 0.12, f: 300, sweepTo: 5000, q: 3 });
        this.tone({ t, f: 110, type: 'sawtooth', dur: 1.2, peak: 0.06, glideTo: 440, filter: { f: 1500 } });
        break;
      case 'hit':
        this.tone({ t, f: 60, type: 'sine', dur: 0.8, peak: 0.6, glideTo: 35 });
        this.noiseHit({ t, dur: 1.2, peak: 0.2, type: 'highpass', f: 4000 });
        break;
      case 'yes': {
        // Bright brass-like major chord
        const root = 60;
        [0, 4, 7, 12].forEach((iv, i) => {
          this.tone({ t: t + 0.12, f: midiHz(root + iv), type: 'sawtooth', dur: 1.4, peak: 0.07, attack: 0.03, filter: { f: 2400 } });
          if (i < 3) this.tone({ t, f: midiHz(root + iv - 5), type: 'sawtooth', dur: 0.12, peak: 0.06, filter: { f: 2000 } });
        });
        this.noiseHit({ t: t + 0.12, dur: 1.5, peak: 0.18, type: 'highpass', f: 5000 });
        break;
      }
      case 'no':
      case 'fail': {
        // "Wah wah wah waaah"
        [62, 61, 60, 59].forEach((m, i) => {
          const last = i === 3;
          this.tone({ t: t + i * 0.42, f: midiHz(m - 12), type: 'sawtooth', dur: last ? 1.3 : 0.38, peak: 0.12, attack: 0.03, filter: { f: 900 }, glideTo: last ? midiHz(m - 13) : undefined });
        });
        break;
      }
      case 'tada':
        [67, 72, 76, 79].forEach((m) => this.tone({ t: t + 0.1, f: midiHz(m), type: 'sawtooth', dur: 1.2, peak: 0.06, attack: 0.02, filter: { f: 3000 } }));
        this.tone({ t, f: midiHz(67), type: 'sawtooth', dur: 0.1, peak: 0.06, filter: { f: 3000 } });
        this.noiseHit({ t: t + 0.1, dur: 1.6, peak: 0.25, type: 'highpass', f: 5000 });
        break;
      case 'drumroll': {
        const dur = opts.dur || 2.5;
        for (let x = 0; x < dur; x += 0.045) this.noiseHit({ t: t + x, dur: 0.06, peak: 0.05 + (x / dur) * 0.15, f: 1800, q: 0.8 });
        break;
      }
      case 'scratch':
        this.noiseHit({ t, dur: 0.35, peak: 0.4, f: 2500, sweepTo: 400, q: 4 });
        this.tone({ t, f: 800, type: 'sawtooth', dur: 0.3, peak: 0.08, glideTo: 120, filter: { f: 2000 } });
        break;
      case 'pop':
        this.tone({ t, f: 900, type: 'sine', dur: 0.12, peak: 0.25, glideTo: 200 });
        this.noiseHit({ t, dur: 0.5, peak: 0.25, f: 1200, sweepTo: 300, q: 0.7 });
        break;
      case 'sparkle':
        for (let i = 0; i < 8; i++) this.tone({ t: t + i * 0.05, f: rng.range(2000, 4500), type: 'sine', dur: 0.3, peak: 0.04 });
        break;
      case 'thud':
        this.tone({ t, f: 90, type: 'sine', dur: 0.3, peak: 0.6, glideTo: 40 });
        this.noiseHit({ t, dur: 0.15, peak: 0.3, type: 'lowpass', f: 600 });
        break;
      case 'bounce':
        this.tone({ t, f: 320, type: 'sine', dur: 0.08, peak: 0.25, glideTo: 180 });
        break;
      case 'squeak':
        this.tone({ t, f: 900, type: 'sawtooth', dur: 0.25, peak: 0.08, glideTo: 1500, filter: { type: 'bandpass', f: 1400, q: 3 } });
        break;
      case 'bark':
        for (const k of [0, 0.22]) {
          this.voice({ t: t + k, f0: 420, glideTo: 260, vowel: 'a', dur: 0.14, attack: 0.005, peak: 0.25, out: this.sfxBus, breath: 1.2 });
        }
        break;
      case 'flap':
        for (let i = 0; i < 6; i++) this.noiseHit({ t: t + i * 0.08, dur: 0.06, peak: 0.12, f: 700, q: 0.8 });
        break;
      case 'crash':
        this.noiseHit({ t, dur: 1.8, peak: 0.3, type: 'highpass', f: 5000 });
        this.noiseHit({ t, dur: 0.3, peak: 0.4, type: 'lowpass', f: 400 });
        break;
      case 'click':
        this.tone({ t, f: 1800, type: 'square', dur: 0.03, peak: 0.05 });
        break;
      case 'swipeYes':
        this.tone({ t, f: 660, type: 'triangle', dur: 0.16, peak: 0.12 });
        this.tone({ t: t + 0.08, f: 990, type: 'triangle', dur: 0.2, peak: 0.12 });
        break;
      case 'swipeNo':
        this.tone({ t, f: 330, type: 'triangle', dur: 0.16, peak: 0.12, glideTo: 220 });
        break;
      case 'undo':
        this.tone({ t, f: 500, type: 'sine', dur: 0.1, peak: 0.1, glideTo: 700 });
        break;
    }
  }

  // --- Voices ---------------------------------------------------------------------------------------------------

  // Speaks text as babble — pitched syllables through vowel formants. Returns the duration in seconds.
  babble(text, voice = {}) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const rate = voice.rate || 1;
    let dur = 0;
    const plan = [];
    for (const w of words) {
      const syl = Math.max(1, Math.min(4, (w.match(/[aeiouy]+/gi) || []).length));
      for (let k = 0; k < syl; k++) {
        const d = rng.range(0.085, 0.13) / rate;
        plan.push({ at: dur, d, vowel: rng.pick(['a', 'e', 'i', 'o', 'u', 'a']) });
        dur += d + 0.012;
      }
      if (/[,;:]$/.test(w)) dur += 0.12 / rate;
      else if (/[.!?…]$/.test(w)) dur += 0.26 / rate;
      else dur += 0.035 / rate;
    }
    if (this.running && this.settings.voices === 'babble') {
      const t0 = this.now + 0.03;
      const base = voice.pitch || 200;
      const question = /\?\s*$/.test(text);
      const excited = /!\s*$/.test(text);
      plan.forEach((p, i) => {
        const pos = i / Math.max(1, plan.length - 1);
        let f = base * (1 + Math.sin(i * 1.7 + base) * 0.08 + rng.range(-0.05, 0.05));
        if (question && pos > 0.75) f *= 1 + (pos - 0.75) * 1.2;
        if (!question && pos > 0.8) f *= 1 - (pos - 0.8) * 0.5;
        if (excited) f *= 1.08;
        this.voice({ t: t0 + p.at, f0: f, vowel: p.vowel, dur: p.d, attack: 0.012, peak: (voice.volume || 1) * 0.3, type: voice.timbre || 'sawtooth', out: this.voiceBus, breath: 0.15, vibrato: voice.wobble || 0 });
      });
    }
    return dur + 0.2;
  }

  // Speaks with the system's speech synthesiser. Resolves when finished (or after a generous timeout).
  speak(text, voice = {}) {
    const synth = window.speechSynthesis;
    if (!synth || this.settings.voices !== 'speech') return null;
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.pitch = clamp((voice.pitch || 200) / 180, 0.4, 1.9);
        u.rate = clamp((voice.rate || 1) * 1.05, 0.6, 1.6);
        u.volume = this.settings.volume ?? 0.8;
        const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
        if (voices.length) u.voice = voices[Math.floor(((voice.pitch || 200) * 7) % voices.length)];
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        u.onend = finish;
        u.onerror = finish;
        setTimeout(finish, 1500 + text.length * 110);
        synth.speak(u);
      } catch {
        resolve();
      }
    });
  }
  stopSpeaking() {
    if (window.speechSynthesis && this.settings.voices === 'speech') window.speechSynthesis.cancel();
  }

  update(dt) {
    this.music.update(dt);
    if (this.chantKind && this.running && this.now >= this.chantNext) {
      const t = this.now;
      const yes = this.chantKind === 'yes';
      const words = yes ? ['e'] : ['o'];
      for (let v = 0; v < 14; v++) {
        const f0 = rng.range(170, 300);
        this.voice({ t: t + rng.range(0, 0.04), f0, glideTo: yes ? f0 * 1.15 : f0 * 0.9, vowel: words[0], dur: 0.28, attack: 0.02, peak: 0.05, breath: 0.8 });
      }
      this.noiseHit({ t: t + 0.02, dur: 0.12, peak: yes ? 0.12 : 0.05, type: 'highpass', f: 4500, out: this.crowdBus });
      this.chantNext = t + 0.62;
    }
  }
}

// --- Music -----------------------------------------------------------------------------------------------------

const CHORDS = {
  I: [0, 4, 7],
  ii: [2, 5, 9],
  iii: [4, 7, 11],
  IV: [5, 9, 12],
  V: [7, 11, 14],
  vi: [9, 12, 16],
  i: [0, 3, 7],
  iv: [5, 8, 12],
  bVI: [8, 12, 15],
  bIII: [3, 7, 10],
  bVII: [10, 14, 17],
  V7: [7, 11, 14, 17],
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// Drum patterns: 16 steps; k kick, s snare, h hat, c clap, t tom.
const STYLES = {
  ballad: { tempo: 74, scale: MAJOR, prog: ['I', 'vi', 'IV', 'V'], kick: 'x.......x.......', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.......x.......', pad: true, arp: true },
  pop: { tempo: 112, scale: MAJOR, prog: ['I', 'V', 'vi', 'IV'], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '....x.......x...', bass: 'x.x.x.x.x.x.x.x.', pad: true, stab: false },
  dance: { tempo: 124, scale: MINOR, prog: ['i', 'bVI', 'bIII', 'bVII'], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '....x.......x...', bass: '..x...x...x...x.', stab: true },
  rock: { tempo: 138, scale: MAJOR, prog: ['I', 'bVII', 'IV', 'I'], kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', power: true },
  circus: { tempo: 150, scale: MAJOR, prog: ['I', 'V7', 'V7', 'I'], kick: 'x...x...x...x...', snare: '', hat: '..x...x...x...x.', bass: 'x...x...x...x...', oompah: true },
  magic: { tempo: 64, scale: MINOR, prog: ['i', 'iv', 'V', 'i'], kick: 'x...............', snare: '', hat: '', bass: 'x...............', pad: true, tremolo: true, twinkle: true },
  epic: { tempo: 96, scale: MINOR, prog: ['i', 'bVI', 'bVII', 'i'], kick: 'x.....x...x.....', snare: '....x.......x...', hat: '', tom: 'x..x..x...x.x...', bass: 'x.......x.......', pad: true },
  swing: { tempo: 128, scale: MAJOR, prog: ['I', 'vi', 'ii', 'V7'], kick: 'x.......x.......', snare: '....x.......x...', hat: 'x..xx..xx..xx..x', bass: 'x...x...x...x...', stab: true },
};

// Rhythm cells for a bar of melody: [step, lengthInSteps].
const RHYTHMS = [
  [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 6], [6, 2], [8, 8]],
  [[2, 2], [4, 2], [6, 4], [10, 2], [12, 4]],
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
  [[0, 8], [8, 4], [12, 4]],
];

class Music {
  constructor(engine) {
    this.engine = engine;
    this.playing = false;
    this.listeners = new Set();
    this.events = [];
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  // opts: style, key (MIDI root), lead ('voice' | 'opera' | 'kazoo' | 'whistle' | 'guitar' | 'choir' | 'sax' | null),
  // quality() → 0..1 each note, sloppy (band plays the whole track), bars (length).
  start(opts) {
    const st = STYLES[opts.style] || STYLES.pop;
    this.style = st;
    this.opts = opts;
    this.tempo = opts.tempo || st.tempo;
    this.stepDur = 60 / this.tempo / 4;
    this.key = opts.key ?? 60;
    this.songTime = 0;
    this.nextStep = 0;
    this.playing = true;
    this.events = [];
    this.intensity = opts.intensity ?? 0.5;
    this.motifs = [this.makeMotif(), this.makeMotif()];
    this.lead = opts.lead;
    this.leadOn = opts.leadOn ?? true;
    const e = this.engine;
    if (e.running) {
      this.out = e.ctx.createGain();
      this.out.gain.value = 1;
      this.out.connect(e.musicBus);
      this.leadOut = e.ctx.createGain();
      this.leadOut.gain.value = 1;
      this.leadOut.connect(e.voiceBus);
    }
  }
  stop(fade = 0.6) {
    if (!this.playing) return;
    this.playing = false;
    const e = this.engine;
    if (e.running && this.out) {
      const t = e.now;
      for (const g of [this.out, this.leadOut]) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.02, fade));
        const node = g;
        setTimeout(() => node.disconnect(), (fade + 1.5) * 1000);
      }
    }
  }
  makeMotif() {
    const rhythm = rng.pick(RHYTHMS);
    let deg = rng.int(0, 4);
    return rhythm.map(([s, l]) => {
      deg += rng.pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
      deg = Math.max(-2, Math.min(9, deg));
      return { s, l, deg };
    });
  }
  chordAt(bar) {
    const st = this.style;
    return CHORDS[st.prog[bar % st.prog.length]];
  }
  update(dt) {
    if (!this.playing) return;
    this.songTime += dt;
    const e = this.engine;
    const ahead = 0.15;
    while (this.nextStep * this.stepDur < this.songTime + ahead) {
      const stepTime = this.nextStep * this.stepDur;
      const audioT = e.running ? e.now + Math.max(0, stepTime - this.songTime) : 0;
      this.schedule(this.nextStep, stepTime, audioT);
      this.nextStep++;
    }
    // Deliver visual events that are due
    while (this.events.length && this.events[0].time <= this.songTime) {
      const ev = this.events.shift();
      for (const fn of this.listeners) fn(ev);
    }
  }
  emit(ev) {
    this.events.push(ev);
    this.events.sort((a, b) => a.time - b.time);
  }
  schedule(step, time, at) {
    const st = this.style;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const chord = this.chordAt(bar);
    const root = this.key;
    const e = this.engine;
    const audio = e.running && this.out;
    const q = this.opts.quality ? this.opts.quality() : 1;
    const sloppy = this.opts.sloppy ? (1 - q) * 0.06 : 0;
    const jitter = () => (sloppy ? rng.range(-sloppy, sloppy) : 0);
    if (s16 % 4 === 0) this.emit({ type: 'beat', time, beat: step / 4, bar, s16 });
    if (s16 === 0) this.emit({ type: 'bar', time, bar });
    if (!audio) {
      this.scheduleLead(step, time, 0, chord, q, false);
      return;
    }
    const intensity = this.intensity;
    const on = (pat) => pat && pat[s16] === 'x';
    const drumsIn = bar >= 1 || st.tempo < 80;
    if (drumsIn) {
      if (on(st.kick)) this.kick(at + jitter());
      if (on(st.snare) && intensity > 0.2) this.snare(at + jitter());
      if (on(st.hat) && intensity > 0.3) this.hat(at + jitter(), st.hat[s16] === 'x' && s16 % 4 === 0 ? 0.05 : 0.035);
      if (on(st.clap) && intensity > 0.5) this.clap(at + jitter());
      if (on(st.tom)) this.tom(at + jitter());
    }
    if (on(st.bass)) {
      const n = st.oompah ? (s16 % 8 === 0 ? chord[0] : chord[2] - 12) : s16 % 8 === 0 || !st.power ? chord[0] : chord[0] + 12;
      this.bass(at + jitter(), midiHz(root - 24 + n), this.stepDur * (st.oompah ? 1.5 : 1.8), st.oompah);
    }
    if (st.oompah && s16 % 4 === 2) this.chordStab(at, chord.map((c) => midiHz(root + c)), 0.14, 'square', 1500);
    if (st.pad && s16 === 0) this.pad(at, chord.map((c) => midiHz(root + c - 12)), this.stepDur * 16, st.tremolo);
    if (st.arp && s16 % 2 === 0) this.pluck(at, midiHz(root + chord[(s16 / 2) % chord.length] + (s16 >= 8 ? 12 : 0)), 0.5);
    if (st.stab && [3, 6, 11, 14].includes(s16) && intensity > 0.35) this.chordStab(at + jitter(), chord.map((c) => midiHz(root + c)), 0.16, 'sawtooth', 2200);
    if (st.power && s16 % 2 === 0) this.power(at + jitter(), midiHz(root - 12 + chord[0]), this.stepDur * 2);
    if (st.twinkle && s16 % 4 === 3 && rng.chance(0.6)) this.pluck(at, midiHz(root + 24 + rng.pick(chord)), 0.25, 'sine');
    if (s16 === 0 && bar % 4 === 0 && bar > 0 && intensity > 0.4) e.noiseHit({ t: at, dur: 1.4, peak: 0.12, type: 'highpass', f: 5000, out: this.out });
    this.scheduleLead(step, time, at, chord, q, true);
  }
  scheduleLead(step, time, at, chord, q, audio) {
    if (!this.lead || !this.leadOn) return;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    if (bar < 1) return; // an intro bar before the lead comes in
    const motif = this.motifs[Math.floor(bar / 2) % 2];
    const note = motif.find((n) => n.s === s16);
    if (!note) return;
    const scale = this.style.scale;
    const degToSemi = (d) => {
      const o = Math.floor(d / 7);
      return scale[((d % 7) + 7) % 7] + o * 12;
    };
    let semi = degToSemi(note.deg);
    // Pull strong-beat notes onto the chord.
    if (s16 % 8 === 0) {
      const options = chord.map((c) => c % 12);
      const pc = ((semi % 12) + 12) % 12;
      let best = options[0];
      for (const o of options) if (Math.abs(o - pc) < Math.abs(best - pc)) best = o;
      semi += best - pc;
    }
    let midi = this.key + 12 + semi + (this.lead === 'opera' || this.lead === 'whistle' ? 12 : 0);
    // Performance quality: pitch drift, wrong notes, cracks.
    let cents = rng.gauss() * (1 - q) * 70;
    let wrong = false;
    if (rng.chance(Math.pow(1 - q, 2) * 0.45)) {
      midi += rng.pick([-2, -1, 1, 2, 3]);
      wrong = true;
    }
    const crack = q < 0.3 && rng.chance(0.08);
    const dur = note.l * this.stepDur * 0.95;
    this.emit({ type: 'note', time, dur, midi, wrong, crack, q });
    if (!audio) return;
    const t = at + (1 - q) * rng.range(0, 0.07);
    this.leadNote(t, midiHz(midi) * Math.pow(2, cents / 1200), dur, crack);
  }

  // --- Instruments ---
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  kick(t) {
    const c = this.engine.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = c.createGain();
    this.env(g, t, 0.003, 0.9, 0.25);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }
  snare(t) {
    this.engine.noiseHit({ t, dur: 0.16, peak: 0.35, f: 1900, q: 0.8, out: this.out });
    this.engine.tone({ t, f: 190, type: 'triangle', dur: 0.1, peak: 0.25, out: this.out });
  }
  hat(t, peak) {
    this.engine.noiseHit({ t, dur: 0.04, peak: peak * 4, type: 'highpass', f: 7500, out: this.out });
  }
  clap(t) {
    for (const k of [0, 0.011, 0.022]) this.engine.noiseHit({ t: t + k, dur: 0.08, peak: 0.2, f: 1200, q: 1.2, out: this.out });
  }
  tom(t) {
    this.engine.tone({ t, f: 110, type: 'sine', dur: 0.4, peak: 0.6, glideTo: 60, out: this.out });
    this.engine.noiseHit({ t, dur: 0.1, peak: 0.15, type: 'lowpass', f: 800, out: this.out });
  }
  bass(t, f, dur, tuba) {
    const c = this.engine.ctx;
    const o = c.createOscillator();
    o.type = tuba ? 'square' : 'triangle';
    o.frequency.value = f;
    const sub = c.createOscillator();
    sub.frequency.value = f;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = tuba ? 500 : 900;
    const g = c.createGain();
    this.env(g, t, 0.01, tuba ? 0.25 : 0.3, dur);
    o.connect(fl).connect(g);
    sub.connect(g);
    g.connect(this.out);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.1);
    sub.stop(t + dur + 0.1);
  }
  pad(t, freqs, dur, tremolo) {
    const c = this.engine.ctx;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 1300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.4);
    g.gain.setValueAtTime(0.05, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    fl.connect(g).connect(this.out);
    if (tremolo) {
      const lfo = c.createOscillator();
      lfo.frequency.value = 7;
      const d = c.createGain();
      d.gain.value = 0.03;
      lfo.connect(d).connect(g.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.2);
    }
    for (const f of freqs) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(fl);
        o.start(t);
        o.stop(t + dur + 0.2);
      }
    }
  }
  pluck(t, f, peak = 0.5, type = 'triangle') {
    this.engine.tone({ t, f, type, dur: 0.6, peak: peak * 0.2, out: this.out });
    this.engine.tone({ t, f: f * 2, type: 'sine', dur: 0.3, peak: peak * 0.06, out: this.out });
  }
  chordStab(t, freqs, dur, type, cutoff) {
    for (const f of freqs) this.engine.tone({ t, f, type, dur, peak: 0.05, filter: { f: cutoff }, out: this.out });
  }
  power(t, f, dur) {
    const c = this.engine.ctx;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 2600;
    const g = c.createGain();
    this.env(g, t, 0.005, 0.07, dur);
    shaper.connect(fl).connect(g).connect(this.out);
    for (const m of [1, 1.5, 2]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * m;
      o.connect(shaper);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
  leadNote(t, f, dur, crack) {
    const e = this.engine;
    const c = e.ctx;
    const lead = this.lead;
    const out = this.leadOut;
    if (lead === 'voice' || lead === 'opera' || lead === 'choir') {
      const voices = lead === 'choir' ? [1, 1.26, 1.5] : [1];
      for (const m of voices) {
        e.voice({ t, f0: f * m, vowel: rng.pick(['a', 'o', 'a', 'e']), dur: Math.max(0.12, dur), attack: 0.05, peak: lead === 'choir' ? 0.09 : 0.16, type: lead === 'opera' ? 'triangle' : 'sawtooth', out, vibrato: lead === 'opera' ? 0.025 : 0.012, breath: 0.15 });
      }
      if (crack) e.voice({ t: t + dur * 0.4, f0: f * 2, glideTo: f * 2.4, vowel: 'i', dur: 0.15, peak: 0.12, out, breath: 0.4 });
      return;
    }
    const o = c.createOscillator();
    const g = c.createGain();
    const fl = c.createBiquadFilter();
    o.frequency.value = f;
    if (lead === 'kazoo') {
      o.type = 'sawtooth';
      fl.type = 'bandpass';
      fl.frequency.value = 1300;
      fl.Q.value = 2.5;
      this.env(g, t, 0.02, 0.35, dur);
    } else if (lead === 'whistle') {
      o.type = 'sine';
      fl.type = 'lowpass';
      fl.frequency.value = 6000;
      this.env(g, t, 0.03, 0.13, dur);
    } else if (lead === 'sax') {
      o.type = 'sawtooth';
      fl.type = 'lowpass';
      fl.frequency.value = 1600;
      fl.Q.value = 3;
      this.env(g, t, 0.04, 0.13, dur);
    } else {
      // guitar lead
      o.type = 'sawtooth';
      fl.type = 'lowpass';
      fl.frequency.value = 2800;
      fl.Q.value = 4;
      this.env(g, t, 0.005, 0.1, dur);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const d = c.createGain();
    d.gain.value = f * 0.01;
    lfo.connect(d).connect(o.frequency);
    o.connect(fl).connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }
}
