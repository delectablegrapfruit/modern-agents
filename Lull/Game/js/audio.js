// Lull — synthesized sound: effects in swappable packs (a Shop cosmetic), Classic's music, and Classic's whispering
// announcer. Every sound is made on the fly with Web Audio (and the system's speech voices): nothing to download.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  const note = (base, step) => base * Math.pow(2, (PENTA[Math.max(0, Math.min(PENTA.length - 1, step))]) / 12);
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /**
   * A pack turns an event into voices:
   *   f frequency · to slide target · d duration · w wave · g gain · at delay · a attack
   *   n noise burst · q low-pass · hp high-pass · bp band-pass · fe [from, to] low-pass sweep over the note
   *   p partials [[multiple, level, decay share]] · dt detuned twin (cents) · vib vibrato (cents) · rv reverb send
   * Packs may voice any event themselves; the rest fall back to Sound.common in the pack's wave, scale and room.
   */
  const PACKS = {
    // The default: airy sines in a big soft room, on a D major pentatonic.
    soft: {
      base: 294, wave: 'sine', decay: 0.9, reverb: 0.12, attack: 0.012, chorus: 7,
      move: () => [{ f: 1175, d: 0.1, g: 0.026, a: 0.004, rv: 0.1 }],
      rotate: () => [{ f: 1480, d: 0.28, g: 0.03, a: 0.006, rv: 0.18, dt: 8 }, { f: 2217, d: 0.22, g: 0.012, at: 0.025, rv: 0.21 }],
      lower: () => [{ f: 587, d: 0.12, g: 0.03, a: 0.006, rv: 0.1 }],
      lock: () => [
        { f: 147, d: 0.5, g: 0.15, a: 0.01, rv: 0.1 },
        { f: 294, d: 0.4, g: 0.04, a: 0.012, rv: 0.15, dt: 6 },
        { n: 1, d: 0.2, g: 0.014, hp: 3500, rv: 0.18 },
      ],
      hold: () => [{ f: 587, to: 880, d: 0.4, g: 0.045, a: 0.04, rv: 0.21, dt: 10 }],
      blocked: () => [{ f: 196, d: 0.12, g: 0.03, a: 0.004, q: 700 }],
      clear: (s, n) => {
        n = Math.min(n || 1, 4);
        const steps = [0, 2, 4, 5, 7, 9, 10, 12].slice(0, 2 + n * 2);
        return steps.map((st, i) => ({ f: note(587, st), d: 1.1, g: 0.05, a: 0.01, at: i * 0.055, rv: 0.21, dt: 6, p: [[2, 0.2, 0.3]] }));
      },
      quad: () => {
        const pad = [294, 370, 440, 659].map((f) => ({ f, d: 2.2, g: 0.035, a: 0.25, rv: 0.24, dt: 9 }));
        const run = [0, 2, 4, 5, 7, 9, 10, 12, 11].map((st, i) => ({ f: note(587, st), d: 1.2, g: 0.045, a: 0.01, at: i * 0.05, rv: 0.22, p: [[2, 0.2, 0.3]] }));
        return pad.concat(run);
      },
      tspin: () => [7, 4, 9, 12].map((st, i) => ({ f: note(587, st), d: 1, g: 0.05, at: i * 0.07, rv: 0.22, dt: 8, vib: 12 })),
      perfect: () => [0, 2, 4, 5, 7, 9, 10, 12, 13].map((st, i) => ({ f: note(587, st), d: 1.8, g: 0.045, at: i * 0.08, a: 0.02, rv: 0.26, dt: 8, p: [[2, 0.25, 0.4]] })),
      combo: (s, n) => [{ f: note(1175, Math.min(9, n || 1)), d: 0.7, g: 0.035, a: 0.008, rv: 0.21, dt: 7 }],
    },

    // A desk-bound machine: clicks, clacks, the carriage return's zip and its bell.
    typewriter: {
      base: 300, wave: 'triangle', decay: 0.15,
      move: () => [{ n: 1, d: 0.018, g: 0.12, bp: 3600 }, { f: 190, d: 0.02, g: 0.05 }],
      rotate: () => [{ n: 1, d: 0.02, g: 0.12, bp: 2800 }, { n: 1, d: 0.015, g: 0.08, bp: 4200, at: 0.03 }],
      lower: () => [{ n: 1, d: 0.04, g: 0.1, q: 900 }],
      lock: () => [{ n: 1, d: 0.07, g: 0.28, q: 1300 }, { f: 88, d: 0.08, g: 0.16 }, { f: 2400, d: 0.012, w: 'square', g: 0.015, at: 0.01 }],
      hold: () => [{ n: 1, d: 0.06, g: 0.14, q: 600 }, { n: 1, d: 0.02, g: 0.1, bp: 3000, at: 0.05 }],
      blocked: () => [{ n: 1, d: 0.06, g: 0.2, q: 500 }],
      clear: (s, n) => {
        const out = [{ n: 1, d: 0.26, g: 0.1, fe: [700, 5000], bp: 0 }];
        for (let i = 0; i < Math.min(n || 1, 4); i++) out.push({ f: 2093, d: 0.9, g: 0.06, at: 0.26 + i * 0.12, p: [[2.76, 0.4, 0.4], [5.4, 0.15, 0.2]] });
        return out;
      },
      quad: () => [{ n: 1, d: 0.3, g: 0.12, fe: [600, 6000] }, { f: 2093, d: 1, g: 0.07, at: 0.3, p: [[2.76, 0.4, 0.4]] }, { f: 2637, d: 1, g: 0.06, at: 0.42, p: [[2.76, 0.4, 0.4]] }, { f: 3136, d: 1.2, g: 0.06, at: 0.54, p: [[2.76, 0.4, 0.4]] }],
      tspin: () => [0, 1, 2, 3, 4, 5].map((i) => ({ n: 1, d: 0.02, g: 0.12, bp: 2500 + i * 300, at: i * (0.07 - i * 0.008) })),
      combo: (s, n) => Array.from({ length: Math.min(8, (n || 1) + 1) }, (_, i) => ({ n: 1, d: 0.018, g: 0.1, bp: 3000, at: i * 0.035 })),
      perfect: () => [{ n: 1, d: 0.4, g: 0.12, fe: [500, 7000] }].concat([0, 1, 2].map((i) => ({ f: 2093, d: 1.2, g: 0.07, at: 0.4 + i * 0.18, p: [[2.76, 0.4, 0.4]] }))),
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
      tspin: () => [{ f: 1568, to: 392, d: 0.18, w: 'square', g: 0.05 }, { f: 392, to: 1568, d: 0.18, w: 'square', g: 0.05, at: 0.18 }],
      combo: (s, n) => [{ f: note(880, Math.min(10, n || 1)), d: 0.06, w: 'square', g: 0.05 }, { f: note(880, Math.min(12, (n || 1) + 2)), d: 0.08, w: 'square', g: 0.05, at: 0.06 }],
      perfect: () => [523, 659, 784, 1047, 784, 1047, 1319, 1568].map((f, i) => ({ f, d: 0.12, w: 'square', g: 0.05, at: i * 0.09 })),
    },

    // Everything goes bloop.
    bubbles: {
      base: 520, wave: 'sine', decay: 0.18, slide: true,
      move: () => [{ f: rand(460, 560), d: 0.05, g: 0.06, to: 900 }],
      rotate: () => [{ f: 700, d: 0.07, g: 0.07, to: 1400 }],
      lower: () => [{ f: 380, d: 0.05, g: 0.05, to: 620 }],
      lock: () => [{ f: 150, d: 0.14, g: 0.24, to: 460 }, { f: 900, d: 0.04, g: 0.03, to: 1600, at: 0.1 }],
      hold: () => [{ f: 600, d: 0.12, g: 0.1, to: 1600 }, { f: 1600, d: 0.1, g: 0.06, to: 600, at: 0.12 }],
      clear: (s, n) => Array.from({ length: 4 * Math.min(n || 1, 4) }, (_, i) => ({ f: rand(300, 700), to: rand(1200, 2400), d: 0.07 + Math.random() * 0.05, g: 0.05, at: i * 0.045 + Math.random() * 0.02 })),
      quad: () => Array.from({ length: 18 }, (_, i) => ({ f: rand(300, 900), to: rand(1400, 3000), d: 0.08, g: 0.05, at: i * 0.035 })).concat([{ n: 1, d: 0.05, g: 0.1, bp: 2000, at: 0.66 }]),
      tspin: () => [{ f: 500, to: 1800, d: 0.2, g: 0.07 }, { f: 1800, to: 400, d: 0.2, g: 0.07, at: 0.2 }, { f: 400, to: 2200, d: 0.25, g: 0.07, at: 0.4 }],
      combo: (s, n) => [{ f: 400 + (n || 1) * 90, to: 1400 + (n || 1) * 180, d: 0.09, g: 0.07 }],
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
      tspin() { return [this.mallet(784, 0, 0.08), this.mallet(622, 0.08, 0.08), this.mallet(1047, 0.16, 0.08, 0.6)]; },
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
      tspin: () => [{ f: 523, to: 784, d: 0.35, w: 'sawtooth', g: 0.06, fe: [1200, 4000], vib: 30 }],
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
      tspin() { return [this.tap(2349, 0, 0.05), this.tap(1760, 0.1, 0.05), this.tap(3136, 0.2, 0.05, 1.4)]; },
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
      tspin: () => [{ f: note(1047, 9), d: 1.4, g: 0.05, rv: 0.8 }, { f: note(1047, 4), d: 1.4, g: 0.05, at: 0.15, rv: 0.8 }, { f: note(1047, 12), d: 1.6, g: 0.05, at: 0.3, rv: 0.8 }],
    },
  };

  const Sound = {
    ctx: null,
    enabled: true,
    volume: 0.35,
    pack: 'soft',
    master: null,
    lastAt: {},
    PACKS,

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        const ctx = this.ctx = new AC();
        this.master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(ctx.destination);
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
      } catch (e) { this.ctx = null; }
      return this.ctx;
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
      if (v.hp) filt('highpass', v.hp);
      if (v.bp) { const f = filt('bandpass', v.bp); f.Q.value = 3; }
      if (v.fe) { const f = filt('lowpass', v.fe[0]); f.frequency.setValueAtTime(v.fe[0], t); f.frequency.exponentialRampToValueAtTime(v.fe[1], t + v.d); f.Q.value = 4; }
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
      osc(v.f, 0).connect(g);
      const dt = v.dt != null ? v.dt : 0;
      if (dt) { const g2 = ctx.createGain(); g2.gain.value = 0.6; osc(v.f, dt).connect(g2).connect(g); }
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
        case 'tspin': return arp([4, 2, 5], 0.06, 0.12);
        case 'combo': return [{ f: note(base * 2, Math.min(10, arg || 1)), d: 0.1, w, g: 0.08, q }];
        case 'blocked': return [{ f: 140, d: 0.05, w: 'triangle', g: 0.04, q: 700 }];
        case 'buy': return arp([4, 7], 0.06, 0.1);
        case 'error': return [{ f: 196, d: 0.18, w: 'triangle', g: 0.07, q: 900, to: 150 }];
        case 'solve': return arp([0, 2, 4, 7, 9], 0.08, 0.11, dec * 1.8);
        case 'fail': return [{ f: note(base, 4), d: 0.35, w, g: 0.08, to: note(base, 0) * 0.8 }];
        case 'boom': return [{ n: 1, d: 0.5, g: 0.3, q: 450 }, { f: 90, d: 0.45, w: 'sine', g: 0.22, to: 38 }];
        case 'drill': return [{ n: 1, d: 0.35, g: 0.1, q: 2500 }];
        case 'catch': return [{ f: note(base * 2, Math.min(10, arg || 0)), d: 0.12, w, g: 0.07, q }];
        case 'golden': return arp([7, 9, 10, 9, 10], 0.05, 0.08);
        case 'pack': return [{ f: note(base * 2, 5), d: 0.1, w, g: 0.06 }, { n: 1, d: 0.03, g: 0.03, q: 1800 }];
        case 'stamp': return [{ n: 1, d: 0.05, g: 0.03, q: 600 }];
        case 'item': return [{ f: note(base, 4), d: 0.2, w: 'sine', g: 0.08, to: note(base, 7) }];
        case 'bell': return [{ f: 1568, d: 0.6, w: 'sine', g: 0.06, h: 2.4 }, { f: 1568, d: 0.5, w: 'sine', g: 0.04, at: 0.12, h: 2.4 }];
        case 'land': return [{ n: 1, d: 0.05, g: 0.05, q: 700 }];
        default: return null;
      }
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
      const pack = PACKS[packId || this.pack] || PACKS.soft;
      const voices = typeof pack[name] === 'function' ? pack[name](this, arg) : this.common(pack, name, arg);
      if (voices) for (const v of voices) this.voice(v, 0, pack);
    },

    /** A short phrase that shows off a pack (Shop preview). */
    preview(packId) {
      const seq = [['move', 0], ['move', 0.09], ['rotate', 0.2], ['lower', 0.34], ['lower', 0.42], ['lock', 0.55], ['clear', 0.85, 2], ['quad', 2.0]];
      for (const [n, at, arg] of seq) setTimeout(() => { this.lastAt[n] = 0; this.play(n, arg, packId); }, at * 1000);
    },
  };

  // ---- Classic's music: Korobeiniki (a 19th-century Russian folk song, public domain), remixed ------------------------
  //
  // Kept in A minor, the tune as written, arranged soft and laid out as a two-minute suite so it rarely repeats:
  // an intro of chords, the tune on electric piano, again an octave up with a harmony and a soft beat, the bridge on
  // a breathy lead and again in full, an interlude with a counter-melody, and the tune once more.

  const MIDI = (n) => { // 'E5', 'C#4', '-' (rest)
    if (n === '-') return null;
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const bars = (str) => {
    const out = [[]];
    let len = 0;
    for (const t of str.split(',')) {
      const [n, l] = t.trim().split(' ');
      out[out.length - 1].push([MIDI(n), Number(l)]);
      len += Number(l);
      if (len % 8 === 0) out.push([]);
    }
    out.pop();
    return out;
  };
  const TUNE_A = bars('E5 2,B4 1,C5 1,D5 2,C5 1,B4 1,A4 2,A4 1,C5 1,E5 2,D5 1,C5 1,B4 3,C5 1,D5 2,E5 2,C5 2,A4 2,A4 4,- 1,D5 2,F5 1,A5 2,G5 1,F5 1,E5 3,C5 1,E5 2,D5 1,C5 1,B4 2,B4 1,C5 1,D5 2,E5 2,C5 2,A4 2,A4 2,- 2');
  const TUNE_B = bars('E5 4,C5 4,D5 4,B4 4,C5 4,A4 4,G#4 4,B4 2,- 2,E5 4,C5 4,D5 4,B4 4,C5 2,E5 2,A5 4,G#5 8');
  const COUNTER = bars('A5 6,G5 2,G5 8,F5 6,E5 2,D5 8,C5 6,D5 2,E5 8,D5 4,C5 4,B4 8');
  // Chords: [bass note, voicing]
  const CH = {
    Am: [45, [57, 60, 64, 67]], E7: [40, [56, 59, 62, 64]], Dm: [38, [57, 60, 62, 65]], C: [48, [55, 59, 60, 64]],
    F: [41, [57, 60, 64, 65]], Em: [40, [55, 59, 62, 64]], Es: [40, [57, 59, 62, 64]],
  };
  const PROG_A = ['E7', 'Am', 'E7', 'Am', 'Dm', 'C', 'E7', 'Am'];
  const PROG_B = ['Am', 'E7', 'Am', 'E7', 'Am', 'E7', 'Am', 'E7'];
  const PROG_I = ['F', 'Em', 'Dm', 'Es', 'F', 'Em', 'Dm', 'E7'];

  const SECTIONS = [
    { name: 'intro', prog: PROG_I.slice(0, 4), lead: null, groove: 0, arp: true, once: true },
    { name: 'A1', prog: PROG_A, lead: TUNE_A, voice: 'piano', groove: 1 },
    { name: 'A2', prog: PROG_A, lead: TUNE_A, voice: 'piano', up: 12, harmony: true, groove: 2, arp: true },
    { name: 'B1', prog: PROG_B, lead: TUNE_B, voice: 'flute', groove: 1 },
    { name: 'B2', prog: PROG_B, lead: TUNE_B, voice: 'piano', harmony: true, groove: 2, arp: true },
    { name: 'interlude', prog: PROG_I, lead: COUNTER, voice: 'flute', groove: 1, arp: true },
    { name: 'A3', prog: PROG_A, lead: TUNE_A, voice: 'piano', groove: 2 },
  ];
  const SONG = (() => {
    const list = [];
    SECTIONS.forEach((s, si) => s.prog.forEach((c, b) => list.push({ section: s.name, si, chord: CH[c], lead: s.lead ? s.lead[b] : null, voice: s.voice, up: s.up || 0, harmony: !!s.harmony, groove: s.groove, arp: !!s.arp, once: !!s.once })));
    return { bars: list, loopFrom: list.findIndex((b) => !b.once) };
  })();

  // A harmonic minor (with G#), for harmonies a third below the tune.
  const SCALE = [0, 2, 4, 5, 8, 9, 11];
  function thirdBelow(m) {
    const pc = ((m % 12) + 12) % 12;
    let i = SCALE.indexOf(pc);
    if (i < 0) return m - 3;
    const j = (i - 2 + 7) % 7;
    let d = SCALE[i] - SCALE[j];
    if (d <= 0) d += 12;
    return m - d;
  }

  /**
   * Classic's music. The tempo stays put; only a stack near the top quickens it (tempo, set by Classic).
   */
  const Music = {
    playing: false,
    volume: 0.25,
    tempo: 1,
    bpm: 112,
    timer: null,
    gain: null,

    start() {
      const ctx = Sound.ensure();
      if (!ctx || this.playing) return;
      if (ctx.state === 'suspended') ctx.resume();
      this.playing = true;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.3;
      const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), dlp = ctx.createBiquadFilter();
      delay.delayTime.value = 0.39; fb.gain.value = 0.2; wet.gain.value = 0.12; dlp.type = 'lowpass'; dlp.frequency.value = 2200;
      this.bus = ctx.createGain();
      this.bus.connect(lp);
      lp.connect(this.gain);
      lp.connect(delay); delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(wet); wet.connect(this.gain);
      if (Sound.reverb) { const rs = ctx.createGain(); rs.gain.value = 0.18; lp.connect(rs).connect(Sound.reverb); this.revSend = rs; }
      this.gain.connect(Sound.master);
      Sound.master.gain.value = Sound.volume || 0.35;
      this.pos = { bar: this.pos && this.pos.bar != null ? this.pos.bar : 0, at: ctx.currentTime + 0.1 };
      this.timer = setInterval(() => this.schedule(), 60);
      this.schedule();
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      const g = this.gain, ctx = Sound.ctx, rs = this.revSend;
      if (g && ctx) { g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); setTimeout(() => { g.disconnect(); if (rs) rs.disconnect(); }, 700); }
      this.gain = null; this.revSend = null;
    },

    /** Back to the top (a new game). */
    rewind() { this.pos = null; },

    setVolume(v) { if (v === this.volume) return; this.volume = v; if (this.gain) this.gain.gain.value = v; },

    /** Dips the music a little while the announcer speaks, so the two do not fight. */
    duck(from, to) {
      const g = this.gain;
      if (!g) return;
      const p = g.gain, v = this.volume;
      p.cancelScheduledValues(from - 0.01);
      p.setTargetAtTime(v * 0.55, from - 0.01, 0.04);
      p.setTargetAtTime(v, to, 0.25);
    },

    env(o, at, dur, gain, attack, dest, release) {
      const ctx = Sound.ctx, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + attack);
      g.gain.setTargetAtTime(0.0001, at + Math.max(attack, dur), release || dur * 0.35 + 0.05);
      o.connect(g).connect(dest || this.bus);
      return g;
    },

    osc(type, f, at, end) {
      const o = Sound.ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      o.start(at); o.stop(end);
      return o;
    },

    /** Electric piano: a sine whose brightness (a modulator) fades fast while the tone fades slowly. */
    piano(f, at, dur, gain) {
      const ctx = Sound.ctx, end = at + dur * 1.4 + 0.6;
      const o = this.osc('sine', f, at, end), m = this.osc('sine', f * 2, at, end), mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 0.7, at); mg.gain.exponentialRampToValueAtTime(f * 0.04, at + 0.3);
      m.connect(mg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
      g.gain.exponentialRampToValueAtTime(gain * 0.45, at + 0.25);
      g.gain.setTargetAtTime(0.0001, at + dur, 0.18);
      o.connect(g).connect(this.bus);
    },

    kalimba(f, at, dur, gain) {
      const end = at + 0.9;
      this.env(this.osc('sine', f, at, end), at, 0.02, gain, 0.004, null, 0.22);
      this.env(this.osc('sine', f * 5.4, at, end), at, 0.01, gain * 0.12, 0.002, null, 0.04);
      this.env(this.osc('triangle', f * 2, at, end), at, 0.02, gain * 0.15, 0.003, null, 0.08);
    },

    bell(f, at, dur, gain) {
      const end = at + dur + 1.6;
      this.env(this.osc('sine', f, at, end), at, 0.05, gain, 0.005, null, 0.5 + dur * 0.2);
      this.env(this.osc('sine', f * 2.76, at, end), at, 0.02, gain * 0.2, 0.003, null, 0.2);
      this.env(this.osc('sine', f * 2, at, end), at, 0.03, gain * 0.25, 0.004, null, 0.35);
    },

    flute(f, at, dur, gain) {
      const ctx = Sound.ctx, end = at + dur + 0.5;
      const o = this.osc('sine', f, at, end), lfo = this.osc('sine', 5, at, end), lg = ctx.createGain();
      lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(9, at + Math.min(0.4, dur));
      lfo.connect(lg).connect(o.detune);
      this.env(o, at, dur * 0.95, gain, 0.07, null, 0.08);
      this.env(this.osc('triangle', f * 2, at, end), at, dur * 0.9, gain * 0.08, 0.09, null, 0.06);
    },

    lead(voice, f, at, dur, gain) {
      if (voice === 'kalimba') this.kalimba(f, at, dur, gain * 0.9);
      else if (voice === 'bell') this.bell(f, at, dur, gain * 0.7);
      else if (voice === 'flute') this.flute(f, at, dur, gain * 0.75);
      else this.piano(f, at, dur, gain);
    },

    noise(at, dur, gain, hp) {
      const ctx = Sound.ctx;
      if (!this.noiseBuf) {
        const len = Math.floor(ctx.sampleRate * 0.2);
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
      g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f).connect(g).connect(this.bus); src.start(at); src.stop(at + dur + 0.02);
    },

    kick(at, gain) {
      const ctx = Sound.ctx, o = this.osc('sine', 110, at, at + 0.3), g = ctx.createGain();
      o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.16);
      g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      o.connect(g).connect(this.bus);
    },

    /** One bar at a time, a little ahead, as Web Audio likes it. */
    schedule() {
      const ctx = Sound.ctx;
      if (!ctx || !this.playing) return;
      const p = this.pos;
      while (p.at < ctx.currentTime + 0.35) {
        const e = 60 / (this.bpm * this.tempo) / 2; // an eighth
        const bar = SONG.bars[p.bar];
        this.playBar(bar, p.at, e);
        p.at += e * 8;
        p.bar++;
        if (p.bar >= SONG.bars.length) p.bar = SONG.loopFrom;
      }
    },

    playBar(bar, t0, e) {
      const [root, voicing] = bar.chord;
      // Pad: the chord, swelling in.
      for (const m of voicing) {
        this.env(this.osc('triangle', hz(m), t0, t0 + e * 8 + 1.2), t0, e * 7.6, 0.012, 0.35, null, 0.4);
        this.env(this.osc('sine', hz(m) * 1.003, t0, t0 + e * 8 + 1.2), t0, e * 7.6, 0.01, 0.4, null, 0.4);
      }
      // Bass: root on one, the fifth on three, a pickup when the beat is in.
      this.env(this.osc('sine', hz(root), t0, t0 + e * 4), t0, e * 2.8, 0.2, 0.012, null, 0.08);
      this.env(this.osc('sine', hz(root + 7), t0 + e * 4, t0 + e * 8), t0 + e * 4, e * 2.2, 0.15, 0.012, null, 0.08);
      if (bar.groove >= 2) this.env(this.osc('sine', hz(root + 12), t0 + e * 7, t0 + e * 8.5), t0 + e * 7, e * 0.8, 0.09, 0.01, null, 0.05);
      // Arpeggio: the voicing, rippling up and down in eighths.
      if (bar.arp) {
        const order = [0, 1, 2, 3, 2, 1, 2, 3];
        order.forEach((k, i) => {
          const at = t0 + i * e, f = hz(voicing[k] + 12);
          this.env(this.osc('sine', f, at, at + e * 2), at, e * 0.4, 0.018, 0.006, null, 0.12);
        });
      }
      // Beat: a shaker on the off-beats; a soft kick on one and three.
      if (bar.groove >= 1) for (let i = 1; i < 8; i += 2) this.noise(t0 + i * e, 0.05, 0.014, 7000);
      if (bar.groove >= 2) { this.kick(t0, 0.12); this.kick(t0 + e * 4, 0.09); }
      // The tune (and its harmony a third below).
      if (bar.lead) {
        let at = t0;
        for (const [m, l] of bar.lead) {
          if (m != null) {
            this.lead(bar.voice, hz(m + bar.up), at, l * e, 0.11);
            if (bar.harmony) this.lead(bar.voice, hz(thirdBelow(m) + bar.up), at, l * e, 0.045);
          }
          at += l * e;
        }
      }
    },
  };

  // ---- the announcer (Classic) ------------------------------------------------------------------------------------

  /**
   * The announcer calls out the big moments — "single", "double", "triple", "tetris", "T-spin single/double",
   * "back to back", and "amazing" for a perfect clear, "rank up" for a new level, "top out" at the end. The clips are
   * cut from the Tetris Worlds announcer (scripts/splice-voice.py) and embedded, so it sounds the same everywhere.
   */
  const Announcer = {
    enabled: true,
    volume: 0.4,
    buffers: {},
    /**
     * The voice's mixing desk, built once: the raw clips are thinned below 170 Hz, the boxy low-mids and the bright,
     * close-mic top are eased off, a gentle compressor evens the words, and it sits back in the mix at a modest level
     * with sends to the room everything else plays in (the shared reverb) and a soft, filtered stereo echo.
     */
    bus() {
      const ctx = Sound.ctx;
      if (this.input && this.input.context === ctx) return this.input;
      const node = (type, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; return b; };
      const hp = node('highpass', 170, 0.7), mud = node('peaking', 380, 1, -3.5), air = node('highshelf', 5200, null, -6), lp = node('lowpass', 8500, 0.5);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.18;
      const level = this.level = ctx.createGain(); level.gain.value = this.volume * 0.62;
      this.input = ctx.createGain();
      this.input.connect(hp).connect(mud).connect(air).connect(lp).connect(comp).connect(level);
      level.connect(Sound.master);
      // Room: the same reverb as the sound effects and music, a touch more of it than they use.
      if (Sound.reverb) { const rs = ctx.createGain(); rs.gain.value = 0.32; level.connect(rs).connect(Sound.reverb); }
      // A soft echo either side (not in time with anything), darker on each repeat.
      const echoIn = ctx.createGain(); echoIn.gain.value = 0.16; level.connect(echoIn);
      const merger = ctx.createChannelMerger(2);
      [[0.19, 0], [0.27, 1]].forEach(([t, ch]) => {
        const d = ctx.createDelay(1), fb = ctx.createGain(), f = node('lowpass', 2600, 0.4);
        d.delayTime.value = t; fb.gain.value = 0.24;
        echoIn.connect(d); d.connect(f); f.connect(fb); fb.connect(d); f.connect(merger, 0, ch);
      });
      merger.connect(Sound.master);
      return this.input;
    },
    setVolume(v) { if (v === this.volume) return; this.volume = v; if (this.level) this.level.gain.value = v * 0.62; },
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
        for (const buf of bufs) {
          if (!buf) continue;
          const src = ctx.createBufferSource();
          src.buffer = buf; src.connect(out); src.start(at);
          at += buf.duration + 0.06;
        }
        Music.duck(start, at);
      });
      this.last = keys.join(' ');
      return true;
    },
    /** The clips for a lock result (and a level-up), or null. A T-spin single or double is one clip; a triple (and
     * a Mini, which has no clip of its own) is "T-spin" and the line count. */
    phrase(r, levelUp) {
      const names = ['', 'single', 'double', 'triple', 'tetris'];
      let k = [];
      if (r.tspin || r.mini) {
        const n = Math.min(r.lines, r.mini ? 2 : 3);
        k = n === 1 || n === 2 ? ['tspin_' + names[n]] : n ? ['tspin', names[n]] : ['tspin'];
      } else if (r.lines) k = [names[Math.min(r.lines, 4)]];
      if (k.length && r.b2b) k.unshift('b2b');
      if (r.perfect) k.push('perfect');
      if (levelUp) k.push('levelup');
      return k.length ? k : null;
    },
  };

  L.Sound = Sound;
  L.Music = Music;
  L.SONG = SONG;
  L.Announcer = Announcer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
