// Lull — synthesized sound effects in swappable packs (a Shop cosmetic). Every sound is made on the fly with Web
// Audio: no files, nothing to download.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const note = (base, step) => base * Math.pow(2, (PENTA[Math.max(0, Math.min(PENTA.length - 1, step))]) / 12);

  /**
   * A pack turns an event into voices: { f: frequency, d: duration, w: wave, g: gain, at: delay, to: slide target,
   * n: noise burst, q: low-pass cutoff, h: add a quiet harmonic at this multiple }.
   */
  const PACKS = {
    soft: {
      base: 392,
      move: () => [{ f: 620, d: 0.03, w: 'triangle', g: 0.05 }],
      rotate: () => [{ f: 760, d: 0.04, w: 'triangle', g: 0.06 }],
      lower: () => [{ f: 300, d: 0.03, w: 'sine', g: 0.05 }],
      lock: () => [{ f: 170, d: 0.12, w: 'sine', g: 0.22, to: 110 }, { n: 1, d: 0.04, g: 0.05, q: 900 }],
      hold: () => [{ f: 440, d: 0.08, w: 'sine', g: 0.12, to: 660 }],
    },
    chip: {
      base: 440,
      move: () => [{ f: 880, d: 0.025, w: 'square', g: 0.03 }],
      rotate: () => [{ f: 1175, d: 0.03, w: 'square', g: 0.035 }],
      lower: () => [{ f: 440, d: 0.02, w: 'square', g: 0.025 }],
      lock: () => [{ f: 220, d: 0.06, w: 'square', g: 0.08, to: 110 }],
      hold: () => [{ f: 660, d: 0.04, w: 'square', g: 0.05 }, { f: 990, d: 0.04, w: 'square', g: 0.05, at: 0.04 }],
      wave: 'square',
    },
    marimba: {
      base: 330,
      move: () => [{ f: 988, d: 0.07, w: 'sine', g: 0.05, h: 4 }],
      rotate: () => [{ f: 1319, d: 0.08, w: 'sine', g: 0.06, h: 4 }],
      lower: () => [{ f: 659, d: 0.06, w: 'sine', g: 0.04, h: 4 }],
      lock: () => [{ f: 262, d: 0.22, w: 'sine', g: 0.2, h: 4 }],
      hold: () => [{ f: 523, d: 0.15, w: 'sine', g: 0.12, h: 4 }],
      decay: 0.4,
    },
    typewriter: {
      base: 300,
      move: () => [{ n: 1, d: 0.02, g: 0.09, q: 4000 }],
      rotate: () => [{ n: 1, d: 0.03, g: 0.1, q: 2500 }, { f: 1800, d: 0.01, w: 'square', g: 0.02 }],
      lower: () => [{ n: 1, d: 0.02, g: 0.06, q: 1500 }],
      lock: () => [{ n: 1, d: 0.07, g: 0.22, q: 900 }, { f: 90, d: 0.06, w: 'sine', g: 0.15 }],
      hold: () => [{ f: 2400, d: 0.12, w: 'sine', g: 0.05 }],
    },
    bubbles: {
      base: 520,
      move: () => [{ f: 500, d: 0.05, w: 'sine', g: 0.06, to: 900 }],
      rotate: () => [{ f: 700, d: 0.06, w: 'sine', g: 0.07, to: 1300 }],
      lower: () => [{ f: 400, d: 0.05, w: 'sine', g: 0.05, to: 600 }],
      lock: () => [{ f: 180, d: 0.12, w: 'sine', g: 0.2, to: 420 }],
      hold: () => [{ f: 600, d: 0.1, w: 'sine', g: 0.1, to: 1500 }],
      slide: true,
    },
    glass: {
      base: 587,
      move: () => [{ f: 2093, d: 0.12, w: 'sine', g: 0.025 }],
      rotate: () => [{ f: 2637, d: 0.14, w: 'sine', g: 0.03 }],
      lower: () => [{ f: 1760, d: 0.08, w: 'sine', g: 0.02 }],
      lock: () => [{ f: 1047, d: 0.5, w: 'sine', g: 0.1, h: 2.76 }, { f: 1050, d: 0.5, w: 'sine', g: 0.05 }],
      hold: () => [{ f: 1568, d: 0.3, w: 'sine', g: 0.07, h: 2.76 }],
      decay: 0.9,
    },
    synth: {
      base: 262,
      move: () => [{ f: 523, d: 0.04, w: 'sawtooth', g: 0.03, q: 1600 }],
      rotate: () => [{ f: 784, d: 0.05, w: 'sawtooth', g: 0.035, q: 2200 }],
      lower: () => [{ f: 392, d: 0.03, w: 'sawtooth', g: 0.02, q: 1000 }],
      lock: () => [{ f: 131, d: 0.2, w: 'sawtooth', g: 0.14, q: 600, to: 98 }],
      hold: () => [{ f: 392, d: 0.12, w: 'sawtooth', g: 0.07, q: 1800, to: 587 }],
      wave: 'sawtooth', filter: 2400,
    },
    chimes: {
      base: 523,
      move: (s) => [{ f: note(1047, s.rnd(0, 5)), d: 0.25, w: 'sine', g: 0.025 }],
      rotate: (s) => [{ f: note(1047, s.rnd(3, 8)), d: 0.3, w: 'sine', g: 0.03 }],
      lower: (s) => [{ f: note(784, s.rnd(0, 4)), d: 0.2, w: 'sine', g: 0.02 }],
      lock: (s) => [{ f: note(262, s.rnd(0, 4)), d: 0.8, w: 'sine', g: 0.12, h: 3 }],
      hold: (s) => [{ f: note(784, s.rnd(4, 9)), d: 0.6, w: 'sine', g: 0.07 }],
      decay: 1.2,
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
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },

    voice(v, when) {
      const ctx = this.ctx;
      const t = ctx.currentTime + (when || 0) + (v.at || 0);
      const g = ctx.createGain();
      const peak = Math.max(0.0001, (v.g == null ? 0.15 : v.g));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + v.d);
      let out = g;
      if (v.q) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.q; g.connect(f); out = f; }
      out.connect(this.master);
      if (v.n) {
        const len = Math.max(1, Math.floor(ctx.sampleRate * v.d));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g); src.start(t);
        return;
      }
      const o = ctx.createOscillator();
      o.type = v.w || 'sine';
      o.frequency.setValueAtTime(v.f, t);
      if (v.to) o.frequency.exponentialRampToValueAtTime(v.to, t + v.d);
      o.connect(g); o.start(t); o.stop(t + v.d + 0.03);
      if (v.h) {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.frequency.value = v.f * v.h; g2.gain.setValueAtTime(peak * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + v.d * 0.4);
        o2.connect(g2).connect(this.master); o2.start(t); o2.stop(t + v.d);
      }
    },

    /** Musical events every pack shares, voiced in the pack's wave and length. */
    common(pack, name, arg) {
      const w = pack.wave || 'triangle', dec = pack.decay || 0.22, base = pack.base || 392, q = pack.filter;
      const arp = (steps, gap, g, d) => steps.map((st, i) => ({ f: note(base, st), d: d || dec, w, g, at: i * gap, q, h: pack.decay ? 3 : 0 }));
      switch (name) {
        case 'clear': { const n = Math.min(arg || 1, 4); return arp([0, 2, 4, 5, 7].slice(0, n + 1), 0.05, 0.12); }
        case 'quad': return arp([0, 2, 4, 5, 7, 10], 0.05, 0.13);
        case 'perfect': return arp([0, 2, 4, 5, 7, 9, 10], 0.06, 0.14, dec * 1.6);
        case 'tspin': return arp([4, 2, 5], 0.06, 0.12);
        case 'combo': return [{ f: note(base * 2, Math.min(10, arg || 1)), d: 0.1, w, g: 0.08, q }];
        case 'blocked': return [{ f: 140, d: 0.05, w: 'square', g: 0.03, q: 700 }];
        case 'buy': return arp([4, 7], 0.06, 0.12);
        case 'error': return [{ f: 196, d: 0.16, w: 'sawtooth', g: 0.05, q: 900, to: 150 }];
        case 'solve': return arp([0, 2, 4, 7, 9], 0.08, 0.13, dec * 1.8);
        case 'fail': return [{ f: note(base, 4), d: 0.3, w, g: 0.1, to: note(base, 0) * 0.8 }];
        case 'boom': return [{ n: 1, d: 0.45, g: 0.35, q: 500 }, { f: 90, d: 0.4, w: 'sine', g: 0.25, to: 40 }];
        case 'drill': return [{ n: 1, d: 0.35, g: 0.12, q: 2500 }];
        case 'catch': return [{ f: note(base * 2, Math.min(10, arg || 0)), d: 0.09, w, g: 0.09, q }];
        case 'golden': return arp([7, 9, 10, 9, 10], 0.05, 0.1);
        case 'rush': return arp([4, 4, 7], 0.09, 0.08);
        case 'pack': return [{ f: note(base * 2, 5), d: 0.08, w, g: 0.08 }, { n: 1, d: 0.03, g: 0.04, q: 1800 }];
        case 'stamp': return [{ n: 1, d: 0.05, g: 0.035, q: 600 }];
        case 'item': return [{ f: note(base, 4), d: 0.14, w: 'sine', g: 0.1, to: note(base, 7) }];
        case 'bell': return [{ f: 1568, d: 0.5, w: 'sine', g: 0.08, h: 2.4 }, { f: 1568, d: 0.4, w: 'sine', g: 0.05, at: 0.12, h: 2.4 }];
        case 'land': return [{ n: 1, d: 0.05, g: 0.06, q: 700 }];
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
      const voices = pack[name] ? pack[name](this, arg) : this.common(pack, name, arg);
      if (voices) for (const v of voices) this.voice(v, 0);
    },

    /** A short phrase that shows off a pack (Shop preview). */
    preview(packId) {
      const seq = [['move', 0], ['move', 0.09], ['rotate', 0.2], ['lower', 0.34], ['lower', 0.42], ['lock', 0.55], ['clear', 0.85, 2]];
      for (const [n, at, arg] of seq) setTimeout(() => { this.lastAt[n] = 0; this.play(n, arg, packId); }, at * 1000);
    },
  };

  L.Sound = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
