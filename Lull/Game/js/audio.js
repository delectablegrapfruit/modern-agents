// Lull — sound: synthesized effects in swappable packs (a Shop cosmetic) and Classic's music, all made on the fly with
// Web Audio, plus Classic's announcer, whose recorded clips are embedded (voice-data.js): nothing to download.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  const note = (base, step) => base * Math.pow(2, (PENTA[Math.max(0, Math.min(PENTA.length - 1, step))]) / 12);
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12); // MIDI note to Hz (A4 = 69)
  const AM = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // A minor pentatonic, in semitones from A

  /**
   * A pack turns an event into voices:
   *   f frequency · to slide target · d duration · w wave · g gain · at delay · a attack
   *   n noise burst · q low-pass · hp high-pass · bp band-pass · fe [from, to] low-pass sweep over the note
   *   p partials [[multiple, level, decay share]] · dt detuned twin (cents) · vib vibrato (cents) · rv reverb send
   *   fm [ratio, index, decay share] a sine modulating the tone's pitch, its depth fading · pan stereo position
   *   sw [from, to] a gentle (unresonant) low-pass sweep over the note · wide: the detuned twin and the tone spread that
   *   far either side
   * A pack's lp low-passes every voice with no filter of its own (so none is brighter than the pack means).
   * Packs may voice any event themselves; the rest fall back to Sound.common in the pack's wave, scale and room, and
   * then to the pack's any(), if it has one (the default does), so an event nobody has voiced yet still sounds.
   */
  const PACKS = {
    // The default, in the music's world and its room: smooth synth tones — soft sine plucks that close as they ring,
    // round bell tones with a few harmonic partials, and slow, wide, detuned pads that swell — all in A minor (mostly its
    // pentatonic) so they sit in Classic's music, through the same reverb and never brighter than it. Nothing starts
    // with a click; movement is a breath of a note, a different one each time, like a chime stirring.
    soft: {
      // Shared sounds (Sound.common) fall on the C major pentatonic from here: A minor's notes too.
      base: 523, wave: 'sine', decay: 0.9, reverb: 0.4, attack: 0.02, lp: 2000,
      // A soft synth pluck: a sine and its twin a few cents apart, spread a little, darkening slowly as it rings.
      tone: (m, at, g, d, o) => Object.assign({ f: hz(m), at, g, d, a: 0.02, dt: 4, wide: 0.22, sw: [1800, 600], rv: 0.42 }, o),
      // A round bell tone: a sine with its octave and twelfth fading first, ringing long.
      ring: (m, at, g, d, o) => Object.assign({ f: hz(m), at, g, d, a: 0.012, p: [[2, 0.1, 0.4], [3, 0.03, 0.2]], q: 2400, rv: 0.5 }, o),
      // A pad: a detuned triangle pair, wide, swelling in slowly, its filter opening as it goes.
      pad: (m, at, g, d, o) => Object.assign({ f: hz(m), at, g, d, a: 0.35, w: 'triangle', dt: 8, wide: 0.5, sw: [450, 1300], rv: 0.5 }, o),
      // A mote: the smallest note, for movement — round, short, low-passed, in the room.
      mote: (m, at, g, d, o) => Object.assign({ f: hz(m), at, g, d, a: 0.014, q: 1400, rv: 0.3 }, o),
      pick: (list) => list[Math.floor(Math.random() * list.length)],
      move() { return [this.mote(this.pick([69, 72, 76]), 0, 0.012, 0.2)]; },
      rotate() { return [this.mote(this.pick([74, 76, 79]), 0, 0.024, 0.24, { dt: 3, wide: 0.2 })]; },
      lower() { return [this.mote(this.pick([60, 64]), 0, 0.017, 0.16, { q: 1000 })]; },
      // Set: a warm, low felt note with a soft sub under it and a fifth above, drifting off.
      lock() { return [this.tone(57, 0, 0.054, 0.9, { sw: [1300, 350], dt: 3, rv: 0.3 }), { f: hz(45), d: 0.4, g: 0.1, a: 0.018, q: 300 }, this.tone(64, 0.025, 0.028, 0.8, { rv: 0.4 })]; },
      hold() { return [this.pad(69, 0, 0.05, 0.6, { to: hz(72), a: 0.08, sw: [700, 1500] }), this.ring(76, 0.08, 0.02, 0.9, { pan: 0.3 })]; },
      blocked() { return [{ f: hz(52), d: 0.18, g: 0.019, a: 0.02, q: 500, rv: 0.2 }]; },
      // A line: a pad under an A minor chord (E A C, then E, then G for Am7) blooming up.
      clear(s, n) {
        n = Math.min(n || 1, 3);
        const tones = [64, 69, 72, 76, 79].slice(0, 2 + n);
        return [this.pad(57, 0, 0.06, 1.5)].concat(tones.map((m, i) => this.tone(m, i * 0.06, 0.046, 1.5, { sw: [1400, 500],  pan: (i % 2 ? 0.35 : -0.35) * (i / tones.length) })));
      },
      // Four: an Am7 pad swells while bell tones rise through A minor.
      quad() {
        const pad = [57, 64, 67, 72].map((m) => this.pad(m, 0, 0.05, 2.4, { a: 0.4 }));
        return pad.concat([64, 69, 72, 76, 79, 81, 84, 88].map((m, i) => this.ring(m, i * 0.07, 0.052, 1.8, { pan: i % 2 ? 0.4 : -0.4 })));
      },
      // A twist: a slower, wavering shimmer up an A minor chord.
      twist() { return [this.pad(64, 0, 0.045, 1.4)].concat([69, 76, 81, 83].map((m, i) => this.ring(m, i * 0.08, 0.06, 1.4, { vib: 8, pan: i % 2 ? 0.3 : -0.3 }))); },
      // A spotless clear: C major 9, the relative major, opening under a long bloom.
      perfect() {
        const pad = [60, 64, 67, 71, 74].map((m) => this.pad(m, 0, 0.03, 3, { a: 0.5 }));
        return pad.concat([64, 67, 69, 72, 76, 79, 83].map((m, i) => this.tone(m, i * 0.09, 0.04, 1.8, { pan: i % 2 ? 0.35 : -0.35 })));
      },
      combo(s, n) { n = Math.min(9, n || 1); return [this.ring(57 + AM[Math.min(9, n + 2)], 0, 0.034 - n * 0.001, 1)]; },
      // A soft, low thoom: a falling sine, a dark breath and a low pad.
      boom() { return [{ f: 98, to: 41, d: 0.9, g: 0.12, a: 0.02 }, { n: 1, d: 0.7, g: 0.06, a: 0.04, q: 260 }, this.pad(45, 0, 0.06, 1.4, { a: 0.1, sw: [300, 700] })]; },
      drill() { return [{ n: 1, d: 0.5, g: 0.018, a: 0.06, q: 500 }, { f: 110, to: 82, d: 0.5, g: 0.021, a: 0.04, w: 'triangle', q: 400 }]; },
      buy() { return [this.ring(69, 0, 0.075, 0.9), this.ring(76, 0.09, 0.075, 1.1)]; },
      error() { return [{ f: hz(52), to: hz(50), d: 0.3, g: 0.04, a: 0.02, q: 600, rv: 0.2 }]; },
      solve() { return [this.pad(57, 0, 0.08, 2)].concat([64, 69, 72, 76, 79, 83].map((m, i) => this.tone(m, i * 0.08, 0.075, 1.8, { pan: i % 2 ? 0.35 : -0.35 }))); },
      fail() { return [this.pad(76, 0, 0.055, 0.7, { to: hz(69), a: 0.06, sw: [1200, 500] })]; },
      golden() { return [76, 79, 81, 79, 84].map((m, i) => this.ring(m, i * 0.07, 0.058, 1)); },
      item() { return [this.mote(64, 0, 0.038, 0.3, { to: hz(69), q: 1600 }), this.ring(76, 0.08, 0.015, 0.6)]; },
      // The factory line, heard only while you watch it: a muffled stamp, a note onto the belt, a soft pluck as a piece
      // ships into the crate, and two quiet bell tones when the crate is full.
      stamp() { return [{ f: hz(45), d: 0.16, g: 0.038, a: 0.012, q: 380, rv: 0.2 }]; },
      pack() { return [this.mote(69, 0, 0.02, 0.16)]; },
      land() { return [this.tone(64, 0, 0.02, 0.5, { rv: 0.3 })]; },
      bell() { return [this.ring(76, 0, 0.031, 1.4), this.ring(81, 0.14, 0.024, 1.6)]; },
      // Anything the game plays that has no sound of its own yet: a quiet pluck.
      any() { return [this.tone(76, 0, 0.03, 0.6)]; },
    },

    // An old handheld: square waves, a coin for a line, a power-up for four.
    chip: {
      base: 440, wave: 'square', decay: 0.12,
      move: () => [{ f: 880, d: 0.025, w: 'square', g: 0.03 }],
      rotate: () => [{ f: 1175, d: 0.03, w: 'square', g: 0.035, to: 1397 }],
      lower: () => [{ f: 440, d: 0.02, w: 'square', g: 0.025 }],
      lock: () => [{ f: 220, d: 0.07, w: 'triangle', g: 0.18, to: 70 }, { n: 1, d: 0.03, g: 0.05, hp: 2000 }],
      hold: () => [{ f: 660, d: 0.04, w: 'square', g: 0.05 }, { f: 990, d: 0.05, w: 'square', g: 0.05, at: 0.045 }],
      clear: (s, n) => {
        const out = [];
        for (let i = 0; i < Math.min(n || 1, 4); i++) { out.push({ f: 988, d: 0.07, w: 'square', g: 0.05, at: i * 0.14 }, { f: 1319, d: 0.2, w: 'square', g: 0.05, at: i * 0.14 + 0.07 }); }
        return out;
      },
      quad: () => [659, 784, 1319, 1047, 1175, 1568].map((f, i) => ({ f, d: 0.09, w: 'square', g: 0.05, at: i * 0.07 })),
      twist: () => [{ f: 1568, to: 392, d: 0.18, w: 'square', g: 0.05 }, { f: 392, to: 1568, d: 0.18, w: 'square', g: 0.05, at: 0.18 }],
      combo: (s, n) => [{ f: note(880, Math.min(10, n || 1)), d: 0.06, w: 'square', g: 0.05 }, { f: note(880, Math.min(12, (n || 1) + 2)), d: 0.08, w: 'square', g: 0.05, at: 0.06 }],
      perfect: () => [523, 659, 784, 1047, 784, 1047, 1319, 1568].map((f, i) => ({ f, d: 0.12, w: 'square', g: 0.05, at: i * 0.09 })),
    },

    // Wooden bars, a soft mallet: a roll for every clear.
    marimba: {
      base: 330, wave: 'sine', decay: 0.4,
      mallet: (f, at, g, d) => ({ f, d: d || 0.4, g, at, a: 0.002, q: 3500, p: [[4, 0.35, 0.15], [9.2, 0.08, 0.06]] }),
      move() { return [this.mallet(988, 0, 0.05, 0.12)]; },
      rotate() { return [this.mallet(1319, 0, 0.06, 0.15)]; },
      lower() { return [this.mallet(659, 0, 0.04, 0.12)]; },
      lock() { return [this.mallet(131, 0, 0.22, 0.5), this.mallet(262, 0.005, 0.06, 0.3)]; },
      hold() { return [this.mallet(523, 0, 0.1, 0.25), this.mallet(784, 0.07, 0.08, 0.25)]; },
      clear(s, n) { const out = []; const ch = [523, 659, 784, 1047]; for (let r = 0; r < 2 + Math.min(n || 1, 4) * 2; r++) out.push(this.mallet(ch[r % ch.length] * (r >= 4 ? 2 : 1), r * 0.06, 0.07, 0.5)); return out; },
      quad() { const out = []; for (let r = 0; r < 16; r++) out.push(this.mallet([523, 659, 784, 988][r % 4] * (1 + Math.floor(r / 8)), r * 0.045, 0.06, 0.6)); return out; },
      twist() { return [this.mallet(784, 0, 0.08), this.mallet(622, 0.08, 0.08), this.mallet(1047, 0.16, 0.08, 0.6)]; },
      combo(s, n) { return [this.mallet(note(523, Math.min(10, n || 1)), 0, 0.08, 0.35)]; },
    },

    // Filtered saws with some weight: plucks, a bass thump, chord stabs that open up.
    synth: {
      base: 262, wave: 'sawtooth', decay: 0.25, filter: 2400,
      move: () => [{ f: 523, d: 0.05, w: 'sawtooth', g: 0.035, fe: [3000, 400] }],
      rotate: () => [{ f: 784, d: 0.06, w: 'sawtooth', g: 0.04, fe: [4000, 500] }],
      lower: () => [{ f: 392, d: 0.04, w: 'sawtooth', g: 0.025, fe: [1500, 300] }],
      lock: () => [{ f: 65, d: 0.3, w: 'sawtooth', g: 0.2, fe: [1400, 120] }, { f: 65, d: 0.3, w: 'sine', g: 0.15 }],
      hold: () => [{ f: 392, d: 0.18, w: 'sawtooth', g: 0.07, to: 587, fe: [600, 3500], dt: 12 }],
      clear: (s, n) => { const ch = [262, 330, 392, 494].slice(0, 2 + Math.min(n || 1, 2)); return ch.map((f) => ({ f, d: 0.55, w: 'sawtooth', g: 0.05, fe: [5000, 500], dt: 14 })); },
      quad: () => [131, 262, 330, 392, 494].map((f) => ({ f, d: 1.4, w: 'sawtooth', g: 0.045, a: 0.05, fe: [300, 6000], dt: 16 })),
      twist: () => [{ f: 523, to: 784, d: 0.35, w: 'sawtooth', g: 0.06, fe: [1200, 4000], vib: 30 }],
      combo: (s, n) => [{ f: note(523, Math.min(10, n || 1)), d: 0.12, w: 'sawtooth', g: 0.05, fe: [5000, 600] }],
    },

    // Wine glasses: high, inharmonic, ringing long.
    glass: {
      base: 587, wave: 'sine', decay: 1.1, reverb: 0.35,
      tap: (f, at, g, d) => ({ f, d: d || 1, g, at, a: 0.002, p: [[2.76, 0.35, 0.5], [5.4, 0.12, 0.25], [8.93, 0.05, 0.12]], rv: 0.35 }),
      move() { return [this.tap(2093, 0, 0.018, 0.25)]; },
      rotate() { return [this.tap(2637, 0, 0.022, 0.35)]; },
      lower() { return [this.tap(1760, 0, 0.015, 0.2)]; },
      lock() { return [this.tap(1047, 0, 0.09, 1.1), this.tap(1051, 0, 0.04, 1.1)]; },
      hold() { return [this.tap(1568, 0, 0.06, 0.8)]; },
      clear(s, n) { return [0, 2, 4, 7, 9, 12, 14].slice(0, 3 + Math.min(n || 1, 4)).map((st, i) => this.tap(note(1047, st), i * 0.04, 0.045, 1.4)); },
      quad() { return [0, 2, 4, 7, 9, 12, 14, 16, 19, 21].map((st, i) => this.tap(note(1047, st), i * 0.035, 0.04, 1.8)); },
      twist() { return [this.tap(2349, 0, 0.05), this.tap(1760, 0.1, 0.05), this.tap(3136, 0.2, 0.05, 1.4)]; },
      combo(s, n) { return [this.tap(note(1568, Math.min(10, n || 1)), 0, 0.045, 0.9)]; },
    },

    // Every move a random note from one calm scale, ringing into a wide space.
    chimes: {
      base: 523, wave: 'sine', decay: 1.4, reverb: 0.7,
      move: () => [{ f: note(1047, rand(0, 5)), d: 0.4, g: 0.022, rv: 0.7 }],
      rotate: () => [{ f: note(1047, rand(3, 8)), d: 0.5, g: 0.026, rv: 0.7 }],
      lower: () => [{ f: note(784, rand(0, 4)), d: 0.3, g: 0.018, rv: 0.7 }],
      lock: () => [{ f: note(262, rand(0, 4)), d: 1.2, g: 0.11, p: [[3, 0.2, 0.4]], rv: 0.6 }],
      hold: () => [{ f: note(784, rand(4, 9)), d: 0.9, g: 0.06, rv: 0.8 }],
      clear: (s, n) => Array.from({ length: 3 * Math.min(n || 1, 4) }, (_, i) => ({ f: note(1047, rand(0, 10)), d: 1.6, g: 0.04, at: i * 0.07 + Math.random() * 0.05, rv: 0.85 })),
      quad: () => Array.from({ length: 16 }, (_, i) => ({ f: note(784, rand(0, 13)), d: 2, g: 0.035, at: i * 0.06 + Math.random() * 0.04, rv: 0.9 })),
      twist: () => [{ f: note(1047, 9), d: 1.4, g: 0.05, rv: 0.8 }, { f: note(1047, 4), d: 1.4, g: 0.05, at: 0.15, rv: 0.8 }, { f: note(1047, 12), d: 1.6, g: 0.05, at: 0.3, rv: 0.8 }],
    },
  };

  const Sound = {
    ctx: null,
    enabled: true,
    volume: 0.35,
    pack: 'soft',
    master: null,
    muted: false,
    lastAt: {},
    PACKS,

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { this.wire(new AC()); } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    /** The master chain and the shared room, on a context (a live one, or an offline one for a render). */
    wire(ctx) {
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      // Mute sits last, after everything, so nothing that sets a level elsewhere can undo it.
      this.muteGain = ctx.createGain(); this.muteGain.gain.value = this.muted ? 0 : 1;
      this.master.connect(comp).connect(this.muteGain).connect(ctx.destination);
      // A shared room: a soft, dark, two-and-a-half-second tail.
      const len = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < len; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - i / len, 2.6); }
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.9;
      this.reverb.connect(wet).connect(this.master);
    },

    /**
     * Renders into an OfflineAudioContext instead of the speakers (scripts/audio-render.cjs measures sounds this way):
     * fn schedules on the offline context, then the live one comes back. Resolves to the AudioBuffer.
     */
    offline(seconds, fn, rate) {
      const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      rate = rate || 44100;
      const ctx = new OAC(2, Math.ceil(seconds * rate), rate);
      const saved = [this.ctx, this.master, this.reverb, this.muteGain];
      try { this.wire(ctx); this.muteGain.gain.value = 1; this.master.gain.value = this.volume; fn(ctx); } finally { [this.ctx, this.master, this.reverb, this.muteGain] = saved; }
      return ctx.startRendering();
    },

    rnd(a, b) { return rand(a, b); },

    voice(v, when, pack) {
      const ctx = this.ctx;
      pack = pack || {};
      const t = ctx.currentTime + (when || 0) + (v.at || 0);
      const g = ctx.createGain();
      const peak = Math.max(0.0001, (v.g == null ? 0.15 : v.g));
      const a = v.a != null ? v.a : pack.attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(v.d, a + 0.01));
      let out = g;
      const filt = (type, freq) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; out.connect(f); out = f; return f; };
      if (v.q) filt('lowpass', v.q);
      else if (pack.lp && !v.fe && !v.sw) filt('lowpass', pack.lp);
      if (v.sw) { const f = filt('lowpass', v.sw[0]); f.Q.value = 0.5; f.frequency.setValueAtTime(v.sw[0], t); f.frequency.exponentialRampToValueAtTime(v.sw[1], t + v.d); }
      if (v.hp) filt('highpass', v.hp);
      if (v.bp) { const f = filt('bandpass', v.bp); f.Q.value = 3; }
      if (v.fe) { const f = filt('lowpass', v.fe[0]); f.frequency.setValueAtTime(v.fe[0], t); f.frequency.exponentialRampToValueAtTime(v.fe[1], t + v.d); f.Q.value = 4; }
      if (v.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = v.pan; out.connect(p); out = p; }
      out.connect(this.master);
      const rv = v.rv != null ? v.rv : pack.reverb || 0;
      if (rv && this.reverb) { const s = ctx.createGain(); s.gain.value = rv; out.connect(s).connect(this.reverb); }
      if (v.n) {
        const len = Math.max(1, Math.floor(ctx.sampleRate * v.d));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g); src.start(t);
        return;
      }
      const osc = (freq, detune) => {
        const o = ctx.createOscillator();
        o.type = v.w || pack.wave || 'sine';
        o.frequency.setValueAtTime(freq, t);
        if (detune) o.detune.value = detune;
        if (v.to) o.frequency.exponentialRampToValueAtTime(v.to * (freq / v.f), t + v.d);
        if (v.vib) {
          const lfo = ctx.createOscillator(), lg = ctx.createGain();
          lfo.frequency.value = 5.2; lg.gain.value = v.vib;
          lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + v.d + 0.05);
        }
        o.start(t); o.stop(t + v.d + 0.05);
        return o;
      };
      // Spread: the tone a little one side, its twin the other (a stereo pair feeds the rest of the chain).
      const wide = v.wide && v.dt && ctx.createStereoPanner ? v.wide : 0;
      const side = (node, p) => { if (!wide) return node.connect(g); const s = ctx.createStereoPanner(); s.pan.value = p; return node.connect(s).connect(g); };
      const main = osc(v.f, 0);
      side(main, -wide);
      if (v.fm) {
        const [ratio, index, share] = v.fm, m = ctx.createOscillator(), mg = ctx.createGain();
        m.frequency.value = v.f * ratio;
        mg.gain.setValueAtTime(v.f * index, t);
        mg.gain.exponentialRampToValueAtTime(Math.max(0.01, v.f * index * 0.02), t + Math.max(0.02, v.d * (share || 0.3)));
        m.connect(mg).connect(main.frequency); m.start(t); m.stop(t + v.d + 0.05);
      }
      const dt = v.dt != null ? v.dt : 0;
      if (dt) { const g2 = ctx.createGain(); g2.gain.value = 0.6; side(osc(v.f, dt).connect(g2), wide); }
      const partials = v.p || (v.h ? [[v.h, 0.25, 0.4]] : null);
      if (partials) {
        for (const [mul, lvl, share] of partials) {
          const o2 = ctx.createOscillator(), g2 = ctx.createGain();
          o2.frequency.value = v.f * mul;
          g2.gain.setValueAtTime(0.0001, t);
          g2.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * lvl), t + a);
          g2.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, v.d * share));
          if (out !== g) g2.connect(out);
          else {
            g2.connect(this.master);
            if (rv && this.reverb) { const s = ctx.createGain(); s.gain.value = rv; g2.connect(s).connect(this.reverb); }
          }
          o2.connect(g2); o2.start(t); o2.stop(t + v.d + 0.05);
        }
      }
    },

    /** Events every pack shares, voiced in the pack's wave, scale and room. */
    common(pack, name, arg) {
      const w = pack.wave || 'triangle', dec = pack.decay || 0.22, base = pack.base || 392, q = pack.filter;
      const arp = (steps, gap, g, d) => steps.map((st, i) => ({ f: note(base, st), d: d || dec, w, g, at: i * gap, q }));
      switch (name) {
        case 'clear': { const n = Math.min(arg || 1, 4); return arp([0, 2, 4, 5, 7].slice(0, n + 1), 0.05, 0.12); }
        case 'quad': return arp([0, 2, 4, 5, 7, 10], 0.05, 0.13);
        case 'perfect': return arp([0, 2, 4, 5, 7, 9, 10], 0.06, 0.14, dec * 1.6);
        case 'twist': return arp([4, 2, 5], 0.06, 0.12);
        case 'combo': return [{ f: note(base * 2, Math.min(10, arg || 1)), d: 0.1, w, g: 0.08, q }];
        case 'blocked': return [{ f: 140, d: 0.05, w: 'triangle', g: 0.04, q: 700 }];
        case 'buy': return arp([4, 7], 0.06, 0.1);
        case 'error': return [{ f: 196, d: 0.18, w: 'triangle', g: 0.07, q: 900, to: 150 }];
        case 'solve': return arp([0, 2, 4, 7, 9], 0.08, 0.11, dec * 1.8);
        case 'fail': return [{ f: note(base, 4), d: 0.35, w, g: 0.08, to: note(base, 0) * 0.8 }];
        case 'boom': return [{ n: 1, d: 0.5, g: 0.3, q: 450 }, { f: 90, d: 0.45, w: 'sine', g: 0.22, to: 38 }];
        case 'drill': return [{ n: 1, d: 0.35, g: 0.1, q: 2500 }];
        case 'golden': return arp([7, 9, 10, 9, 10], 0.05, 0.08);
        case 'pack': return [{ f: note(base * 2, 5), d: 0.1, w, g: 0.06 }, { n: 1, d: 0.03, g: 0.03, q: 1800 }];
        case 'stamp': return [{ n: 1, d: 0.05, g: 0.03, q: 600 }];
        case 'item': return [{ f: note(base, 4), d: 0.2, w: 'sine', g: 0.08, to: note(base, 7) }];
        case 'bell': return [{ f: 1568, d: 0.6, w: 'sine', g: 0.06, h: 2.4 }, { f: 1568, d: 0.5, w: 'sine', g: 0.04, at: 0.12, h: 2.4 }];
        case 'land': return [{ n: 1, d: 0.05, g: 0.05, q: 700 }];
        default: return null;
      }
    },

    /** The voices a pack makes for an event (its own, or the shared ones). */
    voices(name, arg, packId) {
      const pack = PACKS[packId || this.pack] || PACKS.soft;
      let list = typeof pack[name] === 'function' ? pack[name](this, arg) : this.common(pack, name, arg);
      if (!list && typeof pack.any === 'function') list = pack.any(this, arg, name);
      return { pack, list };
    },

    play(name, arg, packId) {
      if (!this.enabled && !packId) return;
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      // A burst of the same sound in one frame (auto-repeat, a flurry of events) plays once.
      const now = performance.now();
      if (now - (this.lastAt[name] || 0) < 28) return;
      this.lastAt[name] = now;
      this.master.gain.value = this.volume;
      if (this.muted) return; // nobody would hear it: skip building it
      const { pack, list } = this.voices(name, arg, packId);
      if (!list) return;
      // Straight away, in the key the music is in (A minor when it is not playing).
      for (const v of Key.tune(list, ctx.currentTime)) this.voice(v, 0, pack);
    },

    /** Silences everything at once — notes already ringing too — with a short ramp so it does not click. The levels
     * underneath (effects, music, announcer) are left alone, so unmuting brings back exactly what was there. */
    setMuted(on) {
      this.muted = !!on;
      const g = this.muteGain;
      if (!g) return;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      // A context not yet running has frozen time: a ramp would still be under way when it wakes, so set it outright.
      if (this.ctx.state !== 'running') { g.gain.value = this.muted ? 0 : 1; return; }
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(this.muted ? 0 : 1, t + 0.05);
    },

    /** A short phrase that shows off a pack (Shop preview). */
    preview(packId) {
      const seq = [['move', 0], ['move', 0.09], ['rotate', 0.2], ['lower', 0.34], ['lower', 0.42], ['lock', 0.55], ['clear', 0.85, 2], ['quad', 2.0]];
      for (const [n, at, arg] of seq) setTimeout(() => { this.lastAt[n] = 0; this.play(n, arg, packId); }, at * 1000);
    },
  };

  // ---- Classic's music: Hush, Lull's own tune ------------------------------------------------------------------------
  //
  // An original melody in A minor, at 80, dressed as calm ambient electronica with a little IDM in its detail: a soft, round lead (a sine with a breath of FM, gliding between notes, its vibrato
  // arriving late) over warm, detuned analog-style pads of extended chords (min9, min11, maj9 on the relative major)
  // that breathe through a slowly swaying filter and dip gently each time the kick lands, a warm sub, a soft digital
  // arpeggio in places, and small glitches kept low: a note now and then stuttered into quick repeats, soft clicks,
  // granular shimmers of the chord high up, faint hat ticks swung and nudged off the grid. All of it through a tape
  // wobble, a soft saturation and a dark top, with chorus, a dark echo and the shared room. A three-minute suite, so it
  // rarely repeats: pads and arpeggio; the theme; the theme with a harmony and a sparse beat; the bridge floating at
  // half time; an interlude with its counter-melody on glass; the theme over a low counter-line; the bridge in time;
  // and a short coda that breathes before it goes round again (from the theme).
  //
  // Hush, the theme (A part, A minor, over PROG_A), in eighths: it climbs the E minor chord, settles, lifts to F over D
  // minor and comes home to A:
  //   G4 3  B4 1  E5 4 | G5 2  E5 2  C5 4 | D5 3  B4 1  A4 2  G4 2 | A4 6  rest 2
  //   A4 2  D5 2  F5 3  E5 1 | E5 4  D5 2  B4 2 | G4 2  B4 2  D5 2  E5 2 | C5 3  B4 1  A4 4
  // and its bridge (B part, A melodic minor, over Am9 and E9), leaning on F# and G# and never on F:
  //   A4 2  C5 2  E5 4 | F#5 2  E5 2  D5 2  B4 2 | C5 4  B4 2  A4 2 | G#4 6  rest 2
  //   E5 2  A5 4  E5 2 | F#5 3  E5 1  D5 2  B4 2 | C5 2  E5 2  B4 2  A4 2 | G#4 2  B4 2  E5 4
  // Written for Lull (scripts/test.cjs keeps it apart from well-known game and folk melodies).

  const MIDI = (n) => { // 'E5', 'C#4', '-' (rest)
    if (n === '-') return null;
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  };
  // A line in eighths, cut into bars of eight; a note held over a bar line stays in the bar it starts in.
  const bars = (str) => {
    const out = [];
    let len = 0;
    for (const t of str.split(',')) {
      const [n, l] = t.trim().split(' ');
      while (out.length <= Math.floor(len / 8)) out.push([]);
      out[Math.floor(len / 8)].push([MIDI(n), Number(l)]);
      len += Number(l);
    }
    while (out.length < len / 8) out.push([]);
    return out;
  };
  // Every note twice as long: a line at half time, over twice the bars.
  const slow = (str) => str.split(',').map((t) => { const [n, l] = t.trim().split(' '); return n + ' ' + l * 2; }).join(',');
  const A_PART = 'G4 3,B4 1,E5 4,G5 2,E5 2,C5 4,D5 3,B4 1,A4 2,G4 2,A4 6,- 2,A4 2,D5 2,F5 3,E5 1,E5 4,D5 2,B4 2,G4 2,B4 2,D5 2,E5 2,C5 3,B4 1,A4 4';
  const B_PART = 'A4 2,C5 2,E5 4,F#5 2,E5 2,D5 2,B4 2,C5 4,B4 2,A4 2,G#4 6,- 2,E5 2,A5 4,E5 2,F#5 3,E5 1,D5 2,B4 2,C5 2,E5 2,B4 2,A4 2,G#4 2,B4 2,E5 4';
  const TUNE_A = bars(A_PART);
  const TUNE_B = bars(B_PART);
  const TUNE_B_SLOW = bars(slow(B_PART));
  // The interlude's counter-melody (over PROG_I), and a low line that moves under the theme in the variation.
  const COUNTER = bars('A5 6,G5 2,G5 8,F5 6,E5 2,D5 8,C5 6,D5 2,E5 8,D5 4,C5 4,B4 8');
  const UNDER = bars('B3 8,C4 8,D4 4,B3 4,C4 4,E4 4,F4 8,E4 8,D4 4,B3 4,C4 8');
  // Chords: [bass, pad voicing]. Extended and voiced close, under the tune; the dominant keeps its G# only where the
  // bridge's melody has one.
  const CH = {
    Am9: [45, [55, 59, 60, 64]], Am11: [45, [55, 60, 62, 64]], Em11: [40, [55, 57, 62, 64]], E9: [40, [56, 59, 62, 66]],
    Dm9: [38, [53, 57, 60, 64]], Cmaj9: [36, [55, 59, 62, 64]], Fmaj9: [41, [57, 60, 64, 67]], Esus: [40, [57, 59, 62, 64]],
  };
  const PROG_A = ['Em11', 'Am9', 'Em11', 'Am9', 'Dm9', 'Cmaj9', 'Em11', 'Am9'];
  const PROG_V = ['Em11', 'Am9', 'Em11', 'Am9', 'Dm9', 'Fmaj9', 'Em11', 'Am11'];
  const PROG_B = ['Am9', 'E9', 'Am9', 'E9', 'Am9', 'E9', 'Am9', 'E9'];
  const PROG_I = ['Fmaj9', 'Em11', 'Dm9', 'Esus', 'Fmaj9', 'Em11', 'Dm9', 'E9'];
  const DRIFT = ['Fmaj9', 'Em11', 'Dm9', 'Esus'];
  // Arpeggio shapes, as indexes into the voicing, one per eighth.
  const ARPS = { rise: [0, 1, 2, 3, 0, 1, 2, 3], wave: [0, 2, 1, 3, 2, 1, 3, 1], fall: [3, 2, 1, 0, 3, 2, 1, 2] };

  // The keys the suite is in, as pitch classes: the tonic and the scale. It never modulates or transposes (a stack near
  // the top only quickens it), but its B part, the bridge, is not in plain A minor: its tune leans on G# (the leading
  // tone) and its dominant, E9, adds F#, while no F sounds anywhere in it: A B C D E F# G#, A melodic minor. (The pads'
  // G, the seventh of Am9, is the one note of it outside that scale; F, which harmonic minor would bring, would rub on
  // the F# of every other bar.) Everything else is A natural minor, the interlude's closing E9 a passing colour.
  const KEYS = {
    'A minor': [9, 11, 0, 2, 4, 5, 7],
    'A melodic minor': [9, 11, 0, 2, 4, 6, 8],
  };
  const HOME_KEY = 'A minor';

  // hold: bars per chord (2 = half time) · arp and arpUp (semitones) · groove: 0 none, 1 a soft kick and faint ticks,
  // 2 a sparse, lightly swung beat (kick, brush, ticks) · glitch: the odd stutter and soft click · key: the scale it
  // is in (KEYS; A minor unless said). Bells are a glass bell or a granular shimmer, bar by bar.
  const SECTIONS = [
    { name: 'intro', prog: DRIFT, arp: 'rise', arpUp: 12, bells: true, once: true },
    { name: 'theme', prog: PROG_A, lead: TUNE_A, voice: 'round', bells: true },
    { name: 'theme2', prog: PROG_A, lead: TUNE_A, voice: 'round', harmony: true, arp: 'wave', groove: 2, glitch: true },
    { name: 'float', key: 'A melodic minor', prog: PROG_B, hold: 2, lead: TUNE_B_SLOW, voice: 'breath', drops: true, bells: true, groove: 1 },
    { name: 'interlude', prog: PROG_I, lead: COUNTER, voice: 'glass', arp: 'rise', groove: 1, glitch: true },
    { name: 'variation', prog: PROG_V, lead: TUNE_A, voice: 'round', under: UNDER, groove: 2 },
    { name: 'bridge', key: 'A melodic minor', prog: PROG_B, lead: TUNE_B, voice: 'round', harmony: true, arp: 'wave', groove: 2, bells: true, glitch: true },
    { name: 'coda', prog: DRIFT, arp: 'fall', arpUp: 12, drops: true, bells: true },
  ];
  const SONG = (() => {
    const list = [];
    SECTIONS.forEach((s, si) => {
      const hold = s.hold || 1;
      s.prog.forEach((c, ci) => {
        for (let k = 0; k < hold; k++) {
          const b = ci * hold + k;
          list.push({
            section: s.name, si, key: s.key || HOME_KEY, name: c, harm: CH[c], chord: k === 0 ? CH[c] : null, hold, left: hold - k, lead: s.lead ? s.lead[b] : null,
            under: s.under ? s.under[b] : null, voice: s.voice, harmony: !!s.harmony, arp: s.arp || null, arpUp: s.arpUp || 0,
            groove: s.groove || 0, glitch: !!s.glitch, bells: !!s.bells, drops: !!s.drops, once: !!s.once,
          });
        }
      });
    });
    return { bars: list, loopFrom: list.findIndex((b) => !b.once), tunes: { A: TUNE_A, B: TUNE_B, slowB: TUNE_B_SLOW }, chords: CH, keys: KEYS, home: HOME_KEY };
  })();

  // A harmony under the tune: the nearest note of the bar's chord a third to a sixth below, so it never rubs.
  function harmonyBelow(m, chord) {
    const pcs = [chord[0]].concat(chord[1]).map((x) => x % 12);
    for (let d = 3; d <= 9; d++) if (pcs.includes((m - d) % 12)) return m - d;
    return m - 5;
  }

  // The desk's saturation curve: tanh, scaled to keep unity gain at low levels, so only peaks are rounded off.
  let satCurve = null;
  const SAT = () => {
    if (satCurve) return satCurve;
    satCurve = new Float32Array(1025);
    for (let i = 0; i < 1025; i++) { const x = i / 512 - 1; satCurve[i] = Math.tanh(1.8 * x) / 1.8; }
    return satCurve;
  };

  /**
   * Classic's music. The tempo stays put; only a stack near the top quickens it (tempo, set by Classic).
   */
  const Music = {
    playing: false,
    volume: 0.25,
    tempo: 1,
    bpm: 80,
    timer: null,
    gain: null,
    live: 0, // oscillators scheduled and not yet ended

    start() {
      const ctx = Sound.ensure();
      if (!ctx || this.playing) return;
      if (ctx.state === 'suspended') ctx.resume();
      this.playing = true;
      this.on = ctx;
      this.wire(ctx);
      Sound.master.gain.value = Sound.volume; // a Volume of 0 is a real 0
      this.pos = { bar: this.pos && this.pos.bar != null ? this.pos.bar : 0, at: ctx.currentTime + 0.1 };
      this.fresh = true;
      this.timer = setInterval(() => this.schedule(), 60);
      this.schedule();
    },

    /**
     * The mixing desk, built per start: instruments → tape wobble → a soft saturation → a slowly moving low-pass and an
     * eased top (tape's warmth) → the volume (which the announcer ducks) → the speakers, a chorus either side, a dark
     * dotted-eighth echo, and the shared room (with the bass kept out of it so the tail stays clear). Pads have their
     * own wide filter, swaying on two slow LFOs, and a pump the kick dips (a gentle sidechain).
     */
    wire(ctx) {
      const lfos = this.lfos = [], sends = this.sends = [];
      const lfo = (f, depth, param) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = depth; o.connect(g).connect(param); o.start(); lfos.push(o); };
      const pan = (v, dest) => { const p = ctx.createStereoPanner(); p.pan.value = v; p.connect(dest); return p; };
      this.bus = ctx.createGain();
      // Tape: a short delay whose length sways slowly (wow, about five cents) and a little faster (flutter).
      const tape = ctx.createDelay(0.1);
      tape.delayTime.value = 0.012;
      lfo(0.29, 0.0016, tape.delayTime); lfo(4.7, 0.00005, tape.delayTime);
      // Saturation: a soft curve that leans on peaks only (unity at the level things play at), for a little glue.
      const sat = ctx.createWaveShaper();
      sat.curve = SAT();
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = 3400; tone.Q.value = 0.4;
      lfo(0.023, 600, tone.frequency);
      const top = ctx.createBiquadFilter();
      top.type = 'highshelf'; top.frequency.value = 4500; top.gain.value = -4;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      this.bus.connect(tape).connect(sat).connect(tone).connect(top).connect(this.gain);
      this.gain.connect(Sound.master);
      // Chorus: two slowly swaying copies, one each side.
      for (const [t, f, side] of [[0.021, 0.19, -0.7], [0.027, 0.13, 0.7]]) {
        const d = ctx.createDelay(0.1), g = ctx.createGain();
        d.delayTime.value = t; lfo(f, 0.003, d.delayTime); g.gain.value = 0.3;
        this.gain.connect(d).connect(g).connect(pan(side, Sound.master));
        sends.push(g);
      }
      // Echo: a dotted eighth, darker on each repeat, and short-lived.
      const echo = this.echo = ctx.createDelay(2), fb = ctx.createGain(), elp = ctx.createBiquadFilter(), wet = ctx.createGain();
      echo.delayTime.value = 60 / this.bpm * 0.75; fb.gain.value = 0.28; elp.type = 'lowpass'; elp.frequency.value = 1700; wet.gain.value = 0.15;
      this.gain.connect(echo); echo.connect(elp); elp.connect(fb); fb.connect(echo); elp.connect(wet).connect(Sound.master);
      sends.push(wet);
      if (Sound.reverb) {
        const hp = ctx.createBiquadFilter(), rs = ctx.createGain();
        hp.type = 'highpass'; hp.frequency.value = 240; rs.gain.value = 0.3;
        this.gain.connect(hp).connect(rs).connect(Sound.reverb);
        sends.push(rs);
      }
      // Pads: left and right through a slightly resonant filter that opens and closes over about twenty seconds (and,
      // slower still, over more than a minute), then the pump.
      const padF = ctx.createBiquadFilter(), padF2 = ctx.createBiquadFilter();
      padF.type = 'lowpass'; padF.frequency.value = 1000; padF.Q.value = 1.1;
      padF2.type = 'lowpass'; padF2.frequency.value = 2400; padF2.Q.value = 0.3;
      lfo(0.05, 400, padF.frequency); lfo(0.013, 250, padF.frequency);
      this.pump = ctx.createGain();
      padF.connect(padF2).connect(this.pump).connect(this.bus);
      this.padL = pan(-0.55, padF); this.padR = pan(0.55, padF);
      // Either side of centre, for the arpeggio and the bells.
      this.left = pan(-0.35, this.bus); this.right = pan(0.35, this.bus);
    },

    /**
     * Inside Sound.offline: the suite from a bar, for some seconds, onto the offline context. Its timeline stays behind
     * (rendered) so sound effects played onto the same context find its key; silent keeps the time without the notes.
     */
    render(ctx, seconds, bar, silent) {
      const keep = ['gain', 'bus', 'lfos', 'sends', 'echo', 'pump', 'padL', 'padR', 'left', 'right', 'pos', 'playing', 'fresh', 'prevLead'].map((k) => [k, this[k]]);
      this.wire(ctx);
      this.playing = true;
      this.pos = { bar: bar || 0, at: 0.05, keep: Infinity };
      this.fresh = true;
      this.fill(seconds, silent);
      this.rendered = { ctx, sched: this.pos.sched, e: 60 / (this.bpm * this.tempo) / 2 };
      for (const [k, v] of keep) this[k] = v;
    },

    /** The bars scheduled on the current context, with the eighth they will go on at: the live music's, or a render's. */
    timeline() {
      const ctx = Sound.ctx;
      if (!ctx) return null;
      if (this.rendered && this.rendered.ctx === ctx) return this.rendered;
      const p = this.pos;
      return this.playing && this.on === ctx && p && p.sched && p.sched.length ? { sched: p.sched, e: 60 / (this.bpm * this.tempo) / 2 } : null;
    },

    /**
     * The bar sounding at context time t: { idx, bar, at, e }. Bars go at the tempo they were scheduled at; past the
     * last one scheduled, the ones to come are counted on at the tempo now.
     */
    barAt(t, line) {
      line = line || this.timeline();
      if (!line || !line.sched || !line.sched.length) return null;
      let cur = line.sched[0];
      for (const b of line.sched) if (b.at <= t) cur = b;
      let idx = cur.bar, at = cur.at, e = cur.e || line.e;
      for (let k = 0; k < 64 && t >= at + 8 * e; k++) {
        at += 8 * e;
        idx = idx + 1 >= SONG.bars.length ? SONG.loopFrom : idx + 1;
        e = line.e || e;
      }
      return { idx, bar: SONG.bars[idx], at, e };
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      // Bars are scheduled whole and ahead: come back to the one that was sounding, not the one after it.
      const p = this.pos;
      if (p && p.sched && Sound.ctx) {
        const now = Sound.ctx.currentTime, cur = p.sched.filter((b) => b.at <= now).pop() || p.sched[0];
        if (cur) p.bar = cur.bar;
      }
      const g = this.gain, ctx = Sound.ctx, sends = this.sends || [], lfos = this.lfos || [];
      if (g && ctx) {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        setTimeout(() => { g.disconnect(); for (const s of sends) s.disconnect(); for (const o of lfos) { try { o.stop(); } catch (e) { /* done */ } } }, 700);
      }
      this.gain = null;
    },

    /** Back to the top (a new game). While playing, what was scheduled fades out and the suite starts again. */
    rewind() {
      const was = this.playing;
      if (was) this.stop();
      this.pos = null;
      if (was) this.start();
    },

    setVolume(v) { if (v === this.volume) return; this.volume = v; if (this.gain) this.gain.gain.value = v; },

    /** How far the music dips while the announcer speaks: about 4 dB. */
    DUCK: 0.63,
    /** Dips the music a little while the announcer speaks, so the two do not fight (in over about 40 ms, back over a second). */
    duck(from, to) {
      const g = this.gain;
      if (!g) return;
      const p = g.gain, v = this.volume;
      p.cancelScheduledValues(from - 0.01);
      p.setTargetAtTime(v * this.DUCK, from - 0.01, 0.04);
      p.setTargetAtTime(v, to, 0.25);
    },

    // ---- instruments: every note is a few oscillators that stop on their own and are let go when they do ----------

    osc(type, f, at, end) {
      const o = Sound.ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      o.start(at); o.stop(end);
      this.live++;
      o.onended = () => { this.live--; o.disconnect(); if (o.tail) for (const n of o.tail) n.disconnect(); };
      return o;
    },

    /** An envelope: in over attack, held to dur, then away with a time-constant of release. */
    env(o, at, dur, gain, attack, dest, release) {
      const g = Sound.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + attack);
      g.gain.setTargetAtTime(0.0001, at + Math.max(attack, dur), release || dur * 0.35 + 0.05);
      o.connect(g).connect(dest || this.bus);
      (o.tail = o.tail || []).push(g);
      return g;
    },

    /** A modulator on o's pitch whose depth (in Hz) falls from a to b over time. */
    fm(o, ratio, a, b, at, time, end) {
      const m = this.osc('sine', o.frequency.value * ratio, at, end), g = Sound.ctx.createGain();
      g.gain.setValueAtTime(a, at); g.gain.exponentialRampToValueAtTime(b, at + time);
      m.connect(g).connect(o.frequency);
      (m.tail = m.tail || []).push(g);
    },

    /** Electric piano: FM at one (the round body, bright then plain) and the faintest glint (the harmony's voice). */
    keys(f, at, dur, gain, dest) {
      const end = at + dur + 1.6, o = this.osc('sine', f, at, end);
      this.fm(o, 1, f * 0.9, f * 0.05, at, 0.8, end);
      this.fm(o, 7, f * 0.07, f * 0.002, at, 0.12, at + 0.3);
      const g = this.env(o, at, dur, gain, 0.014, dest, 0.28);
      g.gain.setTargetAtTime(gain * 0.45, at + 0.014, 0.2);
      g.gain.setTargetAtTime(0.0001, at + dur, 0.28);
    },

    /**
     * The lead: a round sine with a breath of FM at one (warm, never bright) and a triangle a few cents up under it,
     * gliding in from the note before when they touch, and on longer notes a vibrato that arrives late.
     */
    round(f, at, dur, gain, from, dest) {
      const ctx = Sound.ctx, end = at + dur + 1.4;
      const o = this.osc('sine', f, at, end), t = this.osc('triangle', f, at, end);
      t.detune.value = 5;
      this.fm(o, 1, f * 0.45, f * 0.04, at, 0.5, end);
      if (from && Math.abs(from - f) > 0.5) for (const x of [o, t]) { x.frequency.setValueAtTime(from, at); x.frequency.exponentialRampToValueAtTime(f, at + 0.055); }
      if (dur > 0.5) {
        const v = this.osc('sine', 4.8, at, end), vg = ctx.createGain();
        vg.gain.setValueAtTime(0, at + 0.3); vg.gain.linearRampToValueAtTime(8, at + 0.3 + Math.min(0.9, dur));
        v.connect(vg); vg.connect(o.detune); vg.connect(t.detune);
        v.tail = [vg];
      }
      this.env(o, at, dur, gain * 0.62, 0.028, dest, 0.34);
      this.env(t, at, dur, gain * 0.2, 0.04, dest, 0.3);
    },

    /** A breathy lead: triangle and sine a hair apart, a slow swell and a vibrato that arrives late. */
    breath(f, at, dur, gain, dest) {
      const ctx = Sound.ctx, end = at + dur + 1.2;
      const a = this.osc('triangle', f, at, end), b = this.osc('sine', f, at, end), v = this.osc('sine', 4.6, at, end), vg = ctx.createGain();
      b.detune.value = 6;
      vg.gain.setValueAtTime(0, at); vg.gain.linearRampToValueAtTime(7, at + Math.min(0.8, dur));
      v.connect(vg); vg.connect(a.detune); vg.connect(b.detune);
      v.tail = [vg];
      this.env(a, at, dur, gain * 0.6, 0.16, dest, 0.3);
      this.env(b, at, dur, gain * 0.5, 0.2, dest, 0.3);
    },

    /** A glass bell: gently inharmonic FM that shimmers and fades over a few seconds. */
    bell(f, at, gain, dest) {
      const end = at + 4, o = this.osc('sine', f, at, end);
      this.fm(o, 3.5, f * 0.8, f * 0.02, at, 1.2, end);
      this.env(o, at, 0.01, gain, 0.008, dest, 0.9);
    },

    /** A granular shimmer: a handful of tiny, soft grains of the chord two octaves up, scattered over a span. */
    shimmer(notes, at, span, gain, rnd) {
      for (let i = 0; i < 7; i++) {
        const t = at + span * rnd(20 + i), f = hz(notes[Math.floor(rnd(30 + i) * notes.length)] + 24);
        this.env(this.osc('sine', f, t, t + 0.45), t, 0.03, gain, 0.03, i % 2 ? this.left : this.right, 0.05);
      }
    },

    /** The arpeggio's soft digital pluck. */
    pluck(f, at, gain, dest) {
      const end = at + 1.3, o = this.osc('sine', f, at, end);
      this.fm(o, 2, f * 0.35, f * 0.02, at, 0.15, end);
      this.env(o, at, 0.01, gain, 0.006, dest, 0.24);
    },

    /** A micro-edit: one pluck caught and retriggered in quick, fading repeats, side to side. */
    stutter(f, at, step, gain) {
      for (let k = 0; k < 4; k++) this.pluck(f, at + k * step, gain * Math.pow(0.62, k), k % 2 ? this.right : this.left);
    },

    /** A water droplet: a sine that leaps up as it vanishes. */
    drop(f, at, gain, dest) {
      const o = this.osc('sine', f, at, at + 0.4);
      o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 1.6, at + 0.05);
      this.env(o, at, 0.01, gain, 0.003, dest, 0.04);
    },

    /** A pad note: two saws a few cents apart, one each side, swelling in and out slowly (each chord's swell
     * overlaps the last one's fade, so there is never a hole between them). */
    pad(m, at, len) {
      const end = at + len + 3;
      for (const [cents, side] of [[-9, this.padL], [9, this.padR]]) {
        const o = this.osc('sawtooth', hz(m), at, end), g = Sound.ctx.createGain();
        o.detune.value = cents;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.011, at + 1.2);
        g.gain.setTargetAtTime(0, at + len - 0.3, 0.6);
        o.connect(g).connect(side);
        o.tail = [g];
      }
    },

    /** The bass: a round sine with a softer one an octave down under it. */
    bass(m, at, dur, gain) {
      const end = at + dur + 1.5;
      this.env(this.osc('sine', hz(m), at, end), at, dur, gain, 0.04, null, 0.3);
      this.env(this.osc('sine', hz(m - 12), at, end), at, dur, gain * 0.4, 0.06, null, 0.3);
    },

    /** A warm, soft kick: low and round, no click; the pads lean away as it lands and come back over a beat. */
    kick(at, gain) {
      const o = this.osc('sine', 72, at, at + 0.7);
      o.frequency.setValueAtTime(72, at); o.frequency.exponentialRampToValueAtTime(44, at + 0.16);
      this.env(o, at, 0.03, gain, 0.006, null, 0.13);
      const p = this.pump && this.pump.gain;
      if (p) { p.setTargetAtTime(1 - 0.35 * Math.min(1, gain / 0.12), at, 0.015); p.setTargetAtTime(1, at + 0.06, 0.18); }
    },

    /** A second of white noise, made once per context, for the brush and the ticks. */
    noise() {
      const ctx = Sound.ctx;
      if (!this.noiseBuf || this.noiseBuf.sampleRate !== ctx.sampleRate) {
        const len = Math.floor(ctx.sampleRate * 1);
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      return this.noiseBuf;
    },

    /** A burst of band-passed noise: in fast, away with a time-constant of len (a brush, a hat tick, a soft click). */
    hiss(at, gain, dest, band, q, attack, len) {
      const ctx = Sound.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise(); f.type = 'bandpass'; f.frequency.value = band; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.setTargetAtTime(0.0001, at + attack + 0.001, len);
      src.connect(f).connect(g).connect(dest || this.bus);
      src.start(at, (at * 7.13) % 0.5); src.stop(at + attack + len * 7);
      src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    },

    /** A brush: a puff of mid-band noise, no top. */
    brush(at, gain) { this.hiss(at, gain, this.right, 1100, 1.4, 0.015, 0.06); },

    /** A hat tick: a faint, short breath of high noise (the desk's dark top softens it further). */
    tick(at, gain, dest) { this.hiss(at, gain, dest, 5200, 0.9, 0.002, 0.016); },

    /** A soft click: tiny, mid-band, the kind a glitch leaves. */
    click(at, gain, dest) { this.hiss(at, gain, dest, 1800, 1.2, 0.001, 0.004); },

    lead(voice, f, at, dur, gain, from) {
      if (voice === 'breath') this.breath(f, at, dur, gain * 0.8);
      else if (voice === 'glass') { this.bell(f, at, gain * 0.75, this.bus); this.breath(f, at, dur, gain * 0.3); }
      else if (voice === 'round') this.round(f, at, dur, gain, from);
      else this.keys(f, at, dur, gain);
    },

    /** One bar at a time, a little ahead, as Web Audio likes it. */
    schedule() {
      const ctx = Sound.ctx;
      if (!ctx || !this.playing) return;
      this.fill(ctx.currentTime + 0.35, Sound.muted);
    },

    /** Schedules bars up to a time. Silent (muted) keeps time without building notes; the next heard bar sounds its chord. */
    fill(until, silent) {
      const p = this.pos;
      if (!p) return;
      while (p.at < until) {
        const e = 60 / (this.bpm * this.tempo) / 2; // an eighth
        if (this.echo) this.echo.delayTime.setTargetAtTime(e * 1.5, p.at, 0.5);
        if (silent) this.fresh = true;
        else this.playBar(SONG.bars[p.bar], p.at, e, p.bar);
        // What was scheduled when, and how fast: stop() comes back to it, and sound effects find their key in it.
        p.sched = (p.sched || []).concat({ bar: p.bar, at: p.at, e }).slice(-(p.keep || 3));
        p.at += e * 8;
        p.bar++;
        if (p.bar >= SONG.bars.length) p.bar = SONG.loopFrom;
      }
    },

    playBar(bar, t0, e, idx) {
      // A fixed scatter per bar, so bells and droplets land in the same places every time round.
      const rnd = (k) => { const x = Math.sin((idx * 8 + k) * 12.9898) * 43758.5453; return x - Math.floor(x); };
      const [root, voicing] = bar.harm;
      // A held chord sounds from its first bar; coming back (after a pause) in the middle of one, it sounds from here.
      const fresh = this.fresh;
      this.fresh = false;
      if (bar.chord || fresh) {
        const len = e * 8 * bar.left;
        for (const m of voicing) this.pad(m, t0, len);
        this.bass(root, t0, len - e * 0.5, 0.13);
      }
      if (bar.groove >= 2) this.bass(root + 12, t0 + e * 6, e * 1.5, 0.04);
      if (bar.arp) {
        ARPS[bar.arp].forEach((k, i) => this.pluck(hz(voicing[k] + bar.arpUp), t0 + i * e, 0.02, i % 2 ? this.right : this.left));
      }
      // Bells: a glass bell, or now and then a granular shimmer of the chord.
      if (bar.bells && rnd(1) < 0.75) {
        if (rnd(9) < 0.4) this.shimmer(voicing, t0 + e * 2 * Math.floor(rnd(3) * 3), e * 2, 0.006, rnd);
        else this.bell(hz(voicing[Math.floor(rnd(2) * 4)] + 12), t0 + e * 2 * Math.floor(rnd(3) * 4), 0.016, rnd(4) < 0.5 ? this.left : this.right);
      }
      if (bar.drops) for (let i = 0; i < 2; i++) this.drop(hz(81 + AM[Math.floor(rnd(5 + i) * 5)]), t0 + e * Math.floor(rnd(7 + i) * 8), 0.012, i ? this.left : this.right);
      // The beat: sparse, lightly swung (offbeats lean late), the ticks nudged off the grid and never all there.
      const swing = e * 0.14;
      if (bar.groove >= 1) {
        for (let i = 1; i < 8; i += 2) {
          if (rnd(40 + i) < (bar.groove >= 2 ? 0.7 : 0.35)) this.tick(t0 + i * e + swing + (rnd(50 + i) - 0.5) * 0.024, 0.008 * (0.6 + 0.4 * rnd(60 + i)), i % 4 === 1 ? this.left : this.right);
        }
        if (bar.chord || fresh) this.kick(t0, 0.12);
      }
      if (bar.groove >= 2) {
        this.kick(t0 + e * 5, 0.06);
        if (rnd(72) < 0.25) this.kick(t0 + e * 7 + swing, 0.03);
        this.brush(t0 + e * 2, 0.016); this.brush(t0 + e * 6, 0.016);
      }
      // Micro-edits: now and then a chord note caught and stuttered in quick repeats late in the bar, and a soft click.
      if (bar.glitch) {
        if (rnd(80) < 0.35) this.stutter(hz(voicing[Math.floor(rnd(81) * 4)] + 12), t0 + e * (6 + Math.floor(rnd(82) * 2)), e / 4, 0.014);
        for (let i = 0; i < 2; i++) if (rnd(85 + i) < 0.4) this.click(t0 + e * 8 * rnd(87 + i), 0.012, rnd(89 + i) < 0.5 ? this.left : this.right);
      }
      if (bar.lead) {
        let at = t0;
        for (const [m, l] of bar.lead) {
          if (m != null) {
            // The lead glides in from the note before when the two touch.
            const prev = this.prevLead && Math.abs(this.prevLead.end - at) < 1e-3 ? this.prevLead.f : null;
            this.lead(bar.voice, hz(m), at, l * e, 0.12, prev);
            this.prevLead = { f: hz(m), end: at + l * e };
            if (bar.harmony) this.keys(hz(harmonyBelow(m, bar.harm)), at, l * e, 0.04);
          }
          at += l * e;
        }
      }
      if (bar.under) {
        let at = t0;
        for (const [m, l] of bar.under) { if (m != null) this.breath(hz(m), at, l * e, 0.07); at += l * e; }
      }
    },
  };

  // ---- sound effects in the music's key ------------------------------------------------------------------------------
  //
  // Every pitched voice of a sound effect (any pack, any event, and any added later) is put in the key the music is in
  // as it is played — the key of the section sounding (read off the bars already scheduled, at the tempo of the moment),
  // or A minor, the song's home, when the music is not playing. Not in time with it, and not on its chords: sounds play
  // the moment they are asked for. The whole sound moves first — at most a tritone, so it keeps its register — until its
  // first note is in the scale, by whichever move disturbs its other notes least; then every other note goes to the
  // nearest note of the scale, keeping the sound's shape: a rising run still rises, a chord keeps its order, twins a
  // few cents apart stay twins, slides keep their span and partials, FM and detune ride along. Noise, clicks and low
  // thuds or sweeps are left alone.
  const Key = {
    HOME: HOME_KEY,
    sets: {},

    /** A key's notes as pitch-class flags (an unknown key is the home key). */
    scale(name) {
      if (!KEYS[name]) name = HOME_KEY;
      if (this.sets[name]) return this.sets[name];
      const set = new Array(12).fill(false);
      for (const pc of KEYS[name]) set[pc] = true;
      return (this.sets[name] = set);
    },

    /** The key the music is in at context time t (of a timeline: the live music's, or a render's); home without one. */
    at(t, line) {
      const b = Music.barAt(t, line);
      return (b && b.bar && b.bar.key) || HOME_KEY;
    },

    /** Whether a voice has a pitch to tune: not noise, a click, a low thud, or a low sweep (a thoom, a falling drop). */
    tonal(v) {
      if (!v || v.n || !(v.f > 20 && v.f < 12000)) return false;
      const d = v.d || 0;
      if (d < 0.03) return false;
      if (v.f < 120 && d < 0.15) return false;
      if (v.to > 0 && v.f < 250 && Math.abs(12 * Math.log2(v.to / v.f)) > 4) return false;
      return true;
    },

    /**
     * The note (MIDI) nearest m whose pitch class is in set, within a tritone (on a tie, the lower). With prev and
     * rel (-1, 0, 1), only one that sits that way from prev — the sound's shape — unless none does.
     */
    snap(m, set, prev, rel) {
      let any = null;
      for (let d = 0; d <= 6; d++) {
        for (const c of d ? [m - d, m + d] : [m]) {
          if (!set[((c % 12) + 12) % 12]) continue;
          if (any == null) any = c;
          if (prev == null || Math.sign(c - prev) === rel) return c;
        }
      }
      return any == null ? m : any;
    },

    /** A sound's voices put in a key (a name, or pitch-class flags). The list given is left as it was. */
    fit(list, key) {
      if (!list) return list;
      const set = Array.isArray(key) ? key : this.scale(key);
      const out = list.map((v) => (v && typeof v === 'object' ? Object.assign({}, v) : v)), notes = [];
      for (const v of out) {
        if (!this.tonal(v)) continue;
        const m = 69 + 12 * Math.log2(v.f / 440), n = Math.round(m);
        // A few cents off on purpose (a beating twin) stays that way; a pitch that is nowhere near a note is made one.
        notes.push({ v, n, frac: Math.abs(m - n) <= 0.08 ? m - n : 0, at: v.at || 0 });
      }
      if (!notes.length) return out;
      notes.sort((a, b) => a.at - b.at || a.n - b.n);
      // The move for the whole sound: its first note into the scale, the rest disturbed as little as can be.
      let best = 0, bestCost = Infinity;
      for (let T = -6; T <= 6; T++) {
        if (!set[(((notes[0].n + T) % 12) + 12) % 12]) continue;
        let cost = Math.abs(T) * 0.001;
        for (const x of notes) cost += Math.abs(this.snap(x.n + T, set) - x.n);
        if (cost < bestCost) { bestCost = cost; best = T; }
      }
      let prev = null;
      for (const x of notes) {
        x.to = prev ? this.snap(x.n + best, set, prev.to, Math.sign(x.n - prev.n)) : this.snap(x.n + best, set);
        const f = hz(x.to + x.frac), k = f / x.v.f;
        x.v.f = f;
        if (x.v.to > 0) x.v.to *= k;
        prev = x;
      }
      return out;
    },

    /** What Sound.play plays at context time now: the voices in the key of that moment. */
    tune(list, now, line) {
      return this.fit(list, this.at(now, line || Music.timeline()));
    },
  };

  // ---- the announcer (Classic) ------------------------------------------------------------------------------------

  /**
   * The announcer whispers the big moments: "single", "double", "triple", "quad" (four lines), "twist", "twist single",
   * "twist double", "streak", "spotless" (the board cleared), "level up" and "game over". Her clips were generated with
   * ElevenLabs (text to speech, model eleven_v4, the whispering voice "Annie") for Lull and are embedded by scripts/voice-clips.cjs in
   * js/voice-data.js, with each one's speech start and end and a loudness trim (L.VOICE_META): every clip is played from
   * just before her first sound to just after her last, so she speaks right on the event, and every call sits at one
   * level.
   */
  const Announcer = {
    enabled: true,
    volume: 0.35,
    /** Her bus's gain at full Announcer volume: her calls sit a little under the sound effects (about 4.5 dB at the
     * default volumes) and clearly over the music, ducked. */
    TRIM: 2.9,
    /** The cut around her speech (seconds): a little before the first sound, a fade in, held a touch past the last, a fade out. */
    PRE: 0.02, FADE_IN: 0.01, TAIL: 0.03, FADE_OUT: 0.07,
    /** A breath between two clips said together. */
    GAP: 0.06,
    buffers: {},

    /** Where a clip's speech is and its trim (dB), from js/voice-data.js; a clip without them plays whole, as it is. */
    meta(key) {
      const m = (L.VOICE_META || {})[key];
      return m && Number.isFinite(m.start) && Number.isFinite(m.end) ? m : null;
    },
    /** The stretch of a decoded clip that is played: { from, dur } (seconds into the clip), and its gain. */
    span(key, buf) {
      const m = this.meta(key);
      if (!m) return { from: 0, dur: buf.duration, gain: 1 };
      const from = Math.max(0, m.start - this.PRE), to = Math.min(buf.duration, m.end + this.TAIL + this.FADE_OUT);
      return { from, dur: Math.max(0.05, to - from), gain: Math.pow(10, (m.gain || 0) / 20) };
    },

    /**
     * The voice's desk, kept light so the whisper stays as it was recorded: a gentle high-pass at 85 Hz (breath rumble
     * and handling thumps only), her level, and a safety limiter. No EQ, no compressor, no de-esser, no room. Each
     * clip's own trim (L.VOICE_META) has already brought every call to one level before it gets here.
     * The limiter is set against what reaches the speakers: her level is applied together with the Volume before it
     * (and the Volume taken back out after it, since the master applies it again), so its −3 dBFS ceiling is a real
     * ceiling at any Volume, and at the default volumes her loudest peak stays well under it (it never acts).
     */
    bus() {
      const ctx = Sound.ctx;
      if (this.input && this.input.context === ctx) { this.sync(); return this.input; }
      this.input = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = this.HP; hp.Q.value = 0.707;
      this.level = ctx.createGain();
      // Web Audio's DynamicsCompressor as a limiter (20:1, hard knee, 1 ms in, 50 ms out), with the make-up gain it adds
      // by itself (about 0.6 of the gain it would take off at full scale) taken back out: below its threshold it is unity.
      const lim = ctx.createDynamicsCompressor(), back = ctx.createGain();
      lim.threshold.value = this.CEILING; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.05;
      back.gain.value = Math.pow(10, 0.6 * this.CEILING * (1 - 1 / 20) / 20);
      this.unvol = ctx.createGain();
      this.input.connect(hp).connect(this.level).connect(lim).connect(back).connect(this.unvol).connect(Sound.master);
      this.sync();
      return this.input;
    },
    /** The high-pass (Hz) and the limiter's ceiling (dBFS, at the speakers). */
    HP: 85, CEILING: -3,
    /** Her level and the Volume into the limiter, the Volume back out after it (Volume 0 is silent at the master anyway). */
    sync() {
      if (!this.level) return;
      const v = Math.max(1e-3, Sound.volume);
      this.level.gain.value = this.volume * this.TRIM * v;
      this.unvol.gain.value = 1 / v;
    },
    setVolume(v) { if (v === this.volume) return; this.volume = v; this.sync(); },
    decode(key) {
      const ctx = Sound.ensure();
      const b64 = (L.VOICE_CLIPS || {})[key];
      if (!ctx || !b64) return Promise.resolve(null);
      if (!this.buffers[key]) {
        const bin = root.atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        this.buffers[key] = new Promise((res) => {
          try { const p = ctx.decodeAudioData(bytes.buffer, res, () => res(null)); if (p && p.catch) p.catch(() => res(null)); } catch (e) { res(null); }
        });
      }
      return this.buffers[key];
    },
    /**
     * Plays one decoded clip at context time `at` into dest (her bus unless given): only its speech, faded in over
     * 10 ms and out over 70 ms so the cut never clicks, at its loudness trim. Returns when it ends.
     */
    clip(key, buf, at, dest) {
      const ctx = Sound.ctx, sp = this.span(key, buf);
      const src = ctx.createBufferSource(), env = ctx.createGain(), g = env.gain;
      const fadeIn = Math.min(this.FADE_IN, sp.dur / 4), fadeOut = Math.min(this.FADE_OUT, sp.dur / 2);
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(sp.gain, at + fadeIn);
      g.setValueAtTime(sp.gain, at + sp.dur - fadeOut);
      g.linearRampToValueAtTime(0, at + sp.dur);
      src.buffer = buf;
      src.connect(env).connect(dest || this.bus());
      src.start(at, sp.from, sp.dur);
      return at + sp.dur;
    },
    /** Says a list of clip keys in order, with a breath between them. Cuts off anything still being said. */
    say(keys) {
      if (!this.enabled || !keys || !keys.length) return false;
      const ctx = Sound.ensure();
      if (!ctx) return false;
      if (ctx.state === 'suspended') ctx.resume();
      const token = this.token = (this.token || 0) + 1;
      if (this.out) { try { this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.03); } catch (e) { /* gone */ } }
      const out = this.out = ctx.createGain();
      out.connect(this.bus());
      Promise.all(keys.map((k) => this.decode(k))).then((bufs) => {
        if (token !== this.token) return;
        const start = ctx.currentTime + 0.02;
        let at = start;
        bufs.forEach((buf, i) => { if (buf) at = this.clip(keys[i], buf, at, out) + this.GAP; });
        Music.duck(start, at);
      });
      this.last = keys.join(' ');
      return true;
    },
    /** The clips for a lock result (and a level-up), or null. A twist single or double is one clip; a triple (and a
     * mini, which has no clip of its own) is "twist" and the line count. */
    phrase(r, levelUp) {
      const names = ['', 'single', 'double', 'triple', 'quad'];
      let k = [];
      if (r.twist || r.mini) {
        const n = Math.min(r.lines, r.mini ? 2 : 3);
        k = n === 1 || n === 2 ? ['twist_' + names[n]] : n ? ['twist', names[n]] : ['twist'];
      } else if (r.lines) k = [names[Math.min(r.lines, 4)]];
      if (k.length && r.b2b) k.unshift('streak');
      if (r.perfect) k.push('spotless');
      if (levelUp) k.push('levelup');
      return k.length ? k : null;
    },
  };

  L.Sound = Sound;
  L.Music = Music;
  L.SONG = SONG;
  L.Key = Key;
  L.Announcer = Announcer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
