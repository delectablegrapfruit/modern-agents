// All sound is synthesised with Web Audio: effects are short oscillator / filtered-noise envelopes, and the
// soundtrack is a small step sequencer (kick, clap, hats, offbeat bass, arpeggio, pads) in A minor.
'use strict';
(function () {
  const GW = window.GW;
  const { rand } = GW;

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Seconds a sound must wait before it may play again (keeps dense fights from turning into mush).
  const THROTTLE = {
    shoot: 0.045, explode: 0.028, wall: 0.06, deflect: 0.05, tail: 0.06, bhhit: 0.05, absorb: 0.06,
    spawn_wanderer: 0.09, spawn_grunt: 0.09, spawn_weaver: 0.09, spawn_spinner: 0.09, spawn_snake: 0.12,
    spawn_blackhole: 0.15, spawn_repulsor: 0.12, spawn_mayfly: 0.2, spawn_minispinner: 0.1, spawn_proton: 0.1,
  };

  class Sound {
    constructor() {
      this.ctx = null;
      this.last = {};
      this.vol = { master: 0.8, music: 0.55, sfx: 0.8 };
      this.muted = false;
      this.live = 0;
      this.music = new Music(this);
    }

    // Must run inside a user gesture the first time.
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.connect(comp);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.mus = ctx.createGain(); this.mus.connect(this.master);
      // Echo send shared by effects and the arpeggio.
      this.echo = ctx.createDelay(1);
      this.echo.delayTime.value = 60 / 128 * 0.75;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const wet = ctx.createGain(); wet.gain.value = 0.35;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo); lp.connect(wet); wet.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      if (this.pendingMusic) this.music.start(this.pendingMusic);
    }

    setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
    toggleMute() { this.muted = !this.muted; this.applyVolumes(); return this.muted; }

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.02);
      this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
      this.mus.gain.setTargetAtTime(this.vol.music * (this.duck ? 0.35 : 1), t, 0.08);
    }

    setDuck(on) { this.duck = on; this.applyVolumes(); }

    ok() { return this.ctx && this.ctx.state === 'running' && !this.muted; }

    env(g, t, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    track(node, stopAt) {
      this.live++;
      node.onended = () => { this.live--; };
      node.stop(stopAt);
    }

    tone(o) {
      const c = this.ctx, t = (o.at || c.currentTime) + (o.delay || 0);
      const osc = c.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.glide || o.dur));
      if (o.detune) osc.detune.value = o.detune;
      const g = c.createGain();
      this.env(g, t, o.vol, o.attack || 0.004, o.dur);
      let node = osc;
      if (o.lp) {
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7;
        osc.connect(f); node = f;
      }
      node.connect(g);
      g.connect(o.dest || this.sfx);
      if (o.echo) g.connect(this.echo);
      osc.start(t);
      this.track(osc, t + o.dur + 0.05);
    }

    noise(o) {
      const c = this.ctx, t = (o.at || c.currentTime) + (o.delay || 0);
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.f0, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
      f.Q.value = o.q || 0.8;
      const g = c.createGain();
      this.env(g, t, o.vol, o.attack || 0.003, o.dur);
      src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
      if (o.echo) g.connect(this.echo);
      src.start(t, Math.random() * 0.5);
      this.track(src, t + o.dur + 0.05);
    }

    play(name, arg) {
      if (!this.ok()) return;
      const now = this.ctx.currentTime;
      const gap = THROTTLE[name];
      if (gap && now - (this.last[name] || 0) < gap) return;
      this.last[name] = now;
      if (this.live > 90 && name !== 'death' && name !== 'bomb') return;
      const T = this.tone.bind(this), N = this.noise.bind(this);
      switch (name) {
        case 'shoot':
          T({ type: 'square', f0: rand(1250, 1400), f1: 380, dur: 0.07, vol: 0.028, lp: 3200 });
          N({ filter: 'highpass', f0: 6000, dur: 0.03, vol: 0.02 });
          break;
        case 'explode': {
          const s = arg || 1;
          N({ f0: 3200 * s, f1: 90, dur: 0.28 + 0.3 * s, vol: 0.2 * Math.min(1.4, s), q: 0.6 });
          T({ f0: rand(150, 210), f1: 38, dur: 0.25 + 0.15 * s, vol: 0.22 * Math.min(1.4, s) });
          break;
        }
        case 'wall': T({ type: 'triangle', f0: rand(900, 1100), f1: 300, dur: 0.05, vol: 0.02 }); break;
        case 'tail': T({ type: 'square', f0: 2200, f1: 1400, dur: 0.04, vol: 0.015 }); break;
        case 'deflect': T({ type: 'triangle', f0: 2600, f1: 1800, dur: 0.08, vol: 0.05, echo: true }); break;
        case 'spawn_wanderer': T({ type: 'sine', f0: 520, f1: 260, dur: 0.18, vol: 0.05 }); break;
        case 'spawn_grunt': T({ type: 'triangle', f0: 240, f1: 620, dur: 0.16, vol: 0.06 }); break;
        case 'spawn_weaver': T({ type: 'square', f0: 700, f1: 980, dur: 0.12, vol: 0.03, lp: 2400 }); break;
        case 'spawn_spinner': T({ type: 'sawtooth', f0: 380, f1: 900, dur: 0.18, vol: 0.035, lp: 2000 }); break;
        case 'spawn_minispinner': T({ type: 'sawtooth', f0: 900, f1: 1500, dur: 0.08, vol: 0.025, lp: 3000 }); break;
        case 'spawn_snake':
          N({ filter: 'bandpass', f0: 1800, f1: 600, dur: 0.35, vol: 0.08, q: 3 });
          break;
        case 'spawn_blackhole': T({ type: 'sine', f0: 90, f1: 55, dur: 0.6, vol: 0.2 }); break;
        case 'spawn_repulsor': T({ type: 'sawtooth', f0: 120, f1: 180, dur: 0.25, vol: 0.05, lp: 900 }); break;
        case 'spawn_mayfly': N({ filter: 'bandpass', f0: 4000, f1: 2500, dur: 0.5, vol: 0.06, q: 6 }); break;
        case 'spawn_proton': T({ type: 'sine', f0: 1500, f1: 2200, dur: 0.06, vol: 0.03 }); break;
        case 'bhwake':
          T({ type: 'sawtooth', f0: 60, f1: 120, dur: 0.5, vol: 0.12, lp: 500 });
          T({ type: 'sine', f0: 240, f1: 90, dur: 0.4, vol: 0.1 });
          break;
        case 'bhhit': T({ type: 'triangle', f0: rand(300, 360), f1: 180, dur: 0.09, vol: 0.06 }); break;
        case 'absorb': T({ type: 'sine', f0: 900, f1: 120, dur: 0.22, vol: 0.08 }); break;
        case 'bhburst':
          N({ f0: 1500, f1: 60, dur: 1.2, vol: 0.35 });
          T({ type: 'sawtooth', f0: 50, f1: 400, dur: 0.6, vol: 0.12, lp: 1200 });
          break;
        case 'death':
          N({ f0: 5000, f1: 50, dur: 2.2, vol: 0.5, q: 0.5 });
          T({ type: 'sawtooth', f0: 420, f1: 28, dur: 1.6, vol: 0.2, lp: 1800 });
          T({ f0: 110, f1: 30, dur: 1.2, vol: 0.4 });
          break;
        case 'bomb':
          N({ f0: 7000, f1: 40, dur: 2.6, vol: 0.5, q: 0.4, echo: true });
          T({ f0: 70, f1: 25, dur: 1.8, vol: 0.5 });
          T({ type: 'sawtooth', f0: 1200, f1: 60, dur: 1.0, vol: 0.1, lp: 3000 });
          break;
        case 'respawn':
          T({ type: 'sine', f0: 200, f1: 1200, dur: 0.6, vol: 0.12, echo: true });
          break;
        case 'life':
          [0, 4, 7, 12, 16].forEach((n, i) => T({ type: 'square', f0: midi(72 + n), dur: 0.14, vol: 0.05, delay: i * 0.07, lp: 4000, echo: true }));
          break;
        case 'bombup':
          [0, 7, 12, 19].forEach((n, i) => T({ type: 'triangle', f0: midi(67 + n), dur: 0.18, vol: 0.08, delay: i * 0.08, echo: true }));
          break;
        case 'mult':
          T({ type: 'square', f0: midi(84), dur: 0.09, vol: 0.035, lp: 5000 });
          T({ type: 'square', f0: midi(91), dur: 0.14, vol: 0.035, delay: 0.07, lp: 5000, echo: true });
          break;
        case 'upgrade':
          T({ type: 'sawtooth', f0: 300, f1: 2400, dur: 0.35, vol: 0.06, lp: 4000, echo: true });
          break;
        case 'achieve':
          [0, 4, 7, 11, 14].forEach((n, i) => T({ type: 'sine', f0: midi(76 + n), dur: 0.5, vol: 0.06, delay: i * 0.05, echo: true }));
          break;
        case 'gameover':
          [12, 7, 3, 0].forEach((n, i) => T({ type: 'triangle', f0: midi(57 + n), dur: 0.5, vol: 0.1, delay: i * 0.22 }));
          break;
        case 'menu': T({ type: 'square', f0: 1320, dur: 0.04, vol: 0.02, lp: 4000 }); break;
        case 'select': T({ type: 'square', f0: 880, f1: 1760, dur: 0.1, vol: 0.03, lp: 4000 }); break;
        case 'pause': T({ type: 'triangle', f0: 660, f1: 330, dur: 0.12, vol: 0.05 }); break;
      }
    }

    // Continuous low drone that swells with the number of awake gravity wells.
    hum(level) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      if (!this.humGain) {
        this.humGain = c.createGain(); this.humGain.gain.value = 0;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 4;
        const lfo = c.createOscillator(); lfo.frequency.value = 3.2;
        const lg = c.createGain(); lg.gain.value = 90;
        lfo.connect(lg); lg.connect(f.frequency);
        for (const hz of [55, 55.6, 82.4]) {
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start();
        }
        lfo.start();
        f.connect(this.humGain); this.humGain.connect(this.sfx);
      }
      this.humGain.gain.setTargetAtTime(Math.min(1, level) * 0.16, t, 0.15);
    }
  }

  const PROG = [
    { root: 45, chord: [57, 60, 64] }, // Am
    { root: 41, chord: [53, 57, 60] }, // F
    { root: 48, chord: [55, 60, 64] }, // C
    { root: 43, chord: [55, 59, 62] }, // G
  ];
  const ARP = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 3];

  class Music {
    constructor(snd) {
      this.s = snd;
      this.bpm = 128;
      this.on = false;
      this.mode = 'title';
    }

    start(mode) {
      this.mode = mode;
      if (!this.s.ctx) { this.s.pendingMusic = mode; return; }
      if (this.on) return;
      this.on = true;
      this.step = 0;
      this.next = this.s.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    }

    stop() {
      this.on = false;
      this.s.pendingMusic = null;
      clearInterval(this.timer);
    }

    tick() {
      const c = this.s.ctx;
      if (!c || c.state !== 'running') return;
      const spb = 60 / this.bpm / 4;
      if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.05;
      while (this.next < c.currentTime + 0.15) {
        this.play(this.step, this.next, spb);
        this.next += spb;
        this.step = (this.step + 1) % 512;
      }
    }

    play(step, t, spb) {
      const s = this.s, dest = s.mus;
      const bar = Math.floor(step / 16);
      const q = step % 16;
      const p = PROG[bar % 4];
      const game = this.mode === 'game';
      const section = Math.floor(bar / 8) % 4; // 0 intro-ish, 1 full, 2 breakdown, 3 full
      const drums = game && section !== 2;

      if (q === 0) {
        for (const n of p.chord) {
          for (const det of [-8, 8]) {
            s.tone({ at: t, type: 'sawtooth', f0: midi(n), detune: det, dur: spb * 16, attack: 0.4, vol: game ? 0.012 : 0.02, lp: 900, dest });
          }
        }
      }
      if (drums && q % 4 === 0) {
        s.tone({ at: t, f0: 150, f1: 42, glide: 0.12, dur: 0.32, vol: 0.55, dest });
      }
      if (drums && (q === 4 || q === 12)) {
        s.noise({ at: t, filter: 'bandpass', f0: 1600, dur: 0.16, vol: 0.14, q: 0.9, dest });
      }
      if (game && q % 2 === 1 && section !== 0) {
        s.noise({ at: t, filter: 'highpass', f0: 8000, dur: q % 4 === 3 ? 0.09 : 0.035, vol: q % 4 === 3 ? 0.05 : 0.025, dest });
      }
      if ((game || section % 2 === 1) && q % 4 === 2) {
        s.tone({ at: t, type: 'sawtooth', f0: midi(p.root), dur: spb * 1.8, vol: 0.13, lp: 420, q: 4, dest });
        s.tone({ at: t, type: 'square', f0: midi(p.root - 12), dur: spb * 1.8, vol: 0.06, lp: 300, dest });
      }
      if (section !== 0 || !game) {
        const idx = ARP[q];
        const n = idx === 3 ? p.chord[0] + 12 : p.chord[idx];
        s.tone({ at: t, type: 'square', f0: midi(n + 12), dur: spb * 0.9, vol: game ? 0.022 : 0.018, lp: section === 2 ? 1400 : 2600, dest, echo: true });
      }
    }
  }

  GW.Sound = Sound;
})();
