// Lull — tiny synthesized sounds (off by default: this game lives next to your work).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const Sound = {
    ctx: null,
    enabled: false,
    volume: 0.35,
    ensure() {
      if (this.ctx || !this.enabled) return this.ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    tone(freq, dur, type, gain, when, slide) {
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + (when || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      const v = (gain == null ? 0.2 : gain) * this.volume;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    play(name, arg) {
      if (!this.enabled) return;
      switch (name) {
        case 'move': this.tone(520, 0.03, 'triangle', 0.06); break;
        case 'rotate': this.tone(700, 0.04, 'triangle', 0.07); break;
        case 'lock': this.tone(160, 0.09, 'sine', 0.25, 0, 110); break;
        case 'hold': this.tone(440, 0.06, 'sine', 0.12, 0, 660); break;
        case 'clear': {
          const n = Math.min(arg || 1, 4);
          [523, 659, 784, 1047].slice(0, n + 1).forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.05));
          break;
        }
        case 'perfect': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, i * 0.07)); break;
        case 'blocked': this.tone(140, 0.05, 'square', 0.04); break;
        case 'buy': this.tone(880, 0.08, 'triangle', 0.15); this.tone(1320, 0.12, 'triangle', 0.12, 0.06); break;
        case 'error': this.tone(180, 0.15, 'sawtooth', 0.06, 0, 120); break;
        case 'solve': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.2, i * 0.09)); break;
        case 'fail': this.tone(330, 0.25, 'sine', 0.15, 0, 220); break;
        case 'boom': this.tone(90, 0.35, 'sawtooth', 0.2, 0, 40); break;
        case 'catch': this.tone(980, 0.06, 'sine', 0.14); break;
        case 'item': this.tone(620, 0.12, 'sine', 0.14, 0, 930); break;
        default: break;
      }
    },
  };

  L.Sound = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
