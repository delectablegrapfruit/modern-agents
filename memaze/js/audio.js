/* Memaze — sound: synthesized effects (WebAudio, no files) and music (the player's files or a built-in synth loop). */
(function () {
  'use strict';
  const MZ = window.MZ;

  const A = {
    ctx: null, master: null, sfx: null, music: null, vol: { master: 0.8, sfx: 0.8, music: 0.5, media: 0.8 },
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (e) { return; }
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.connect(this.master);
        this.music = this.ctx.createGain();
        this.music.connect(this.master);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); Music.applyVolume(); },
    applyVolumes() {
      if (!this.ctx) return;
      this.master.gain.value = this.vol.master;
      this.sfx.gain.value = this.vol.sfx;
      this.music.gain.value = this.vol.music * (Music.ducked ? 0.25 : 1);
    },
    tone(f, dur, o) {
      if (!this.ctx) return;
      o = o || {};
      const c = this.ctx, t = c.currentTime + (o.at || 0);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const v = o.vol == null ? 0.25 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(o.dest || this.sfx);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },
    noise(dur, o) {
      if (!this.ctx) return;
      o = o || {};
      const c = this.ctx, t = c.currentTime + (o.at || 0);
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf();
      const f = c.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 1200, t);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      f.Q.value = o.q || 1;
      const g = c.createGain();
      g.gain.setValueAtTime(o.vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
      src.start(t);
      src.stop(t + dur + 0.05);
    },
    noiseBuf() {
      if (this._nb) return this._nb;
      const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return (this._nb = b);
    },
    play(name) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      switch (name) {
        case 'click': this.tone(880, 0.06, { type: 'triangle', vol: 0.12 }); break;
        case 'gem': [1320, 1760, 2637].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.16, at: i * 0.05 })); break;
        case 'tick': this.tone(1000, 0.05, { type: 'square', vol: 0.06 }); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.18, at: i * 0.09 })); break;
        case 'lose': this.tone(196, 0.5, { type: 'sawtooth', to: 98, vol: 0.12 }); break;
        case 'star': this.tone(1568, 0.25, { type: 'triangle', vol: 0.15 }); this.tone(2093, 0.3, { type: 'sine', vol: 0.08, at: 0.05 }); break;
        case 'beacon': [660, 990, 1320].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.15, at: i * 0.07 })); break;
        case 'unlock': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.07, at: i * 0.08 })); break;
        case 'hurt': this.noise(0.18, { filter: 'lowpass', freq: 900, vol: 0.35 }); this.tone(220, 0.22, { type: 'square', to: 110, vol: 0.1 }); break;
        case 'heal': [660, 880].forEach((f, i) => this.tone(f, 0.18, { type: 'sine', vol: 0.12, at: i * 0.08 })); break;
        case 'recharge': this.tone(260, 0.95, { type: 'sine', to: 1250, vol: 0.13, attack: 0.08 }); this.tone(520, 0.95, { type: 'triangle', to: 2500, vol: 0.05, attack: 0.08 }); break;
        case 'shatter': this.noise(0.22, { filter: 'highpass', freq: 2500, vol: 0.28 }); [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.06, at: i * 0.03 })); break;
        case 'box': [988, 1319, 1568, 1976].forEach((f, i) => this.tone(f, 0.1, { type: 'triangle', vol: 0.1, at: i * 0.035 })); break;
        case 'item': this.tone(1175, 0.2, { type: 'triangle', vol: 0.14 }); this.tone(1760, 0.25, { type: 'sine', vol: 0.08, at: 0.06 }); break;
        case 'use': this.tone(440, 0.25, { type: 'triangle', to: 1320, vol: 0.12 }); break;
        case 'bullet': this.noise(0.6, { filter: 'bandpass', freq: 300, to: 1800, q: 0.8, vol: 0.25 }); this.tone(110, 0.5, { type: 'sawtooth', to: 220, vol: 0.08 }); break;
        case 'launch': this.tone(200, 0.7, { type: 'sine', to: 900, vol: 0.16 }); this.noise(0.5, { filter: 'highpass', freq: 800, to: 3000, vol: 0.12 }); break;
        case 'land': this.noise(0.15, { filter: 'lowpass', freq: 400, vol: 0.35 }); this.tone(90, 0.18, { type: 'sine', vol: 0.18 }); break;
        case 'expire': this.tone(880, 0.25, { type: 'triangle', to: 330, vol: 0.1 }); break;
      }
    },
  };

  // ---------- music ----------
  const Music = {
    el: null, playlist: [], index: 0, sel: 'none', synth: null, ducked: false, playing: false,
    // The files behind a choice ('random' is every music file); sig changes when one is deleted, added or replaced on disk.
    pool(sel) {
      if (!sel || sel === 'none' || sel === 'default:synth') return [];
      const items = MZ.Media.list('music').filter((it) => it.kind !== 'builtin');
      return sel === 'random' ? items : items.filter((it) => it.id === sel);
    },
    sig: '',
    set(sel) {
      const items = this.pool(sel), sig = items.map((it) => it.url).join('|');
      if (sel === this.sel && sig === this.sig && (this.el || this.synth || sel === 'none')) return;
      const cur = sel === this.sel && this.el && this.playlist[this.index % this.playlist.length];
      this.sel = sel;
      this.sig = sig;
      if (cur && items.some((it) => it.url === cur.url)) { // the track playing is still there: the others join after it
        this.playlist = [cur].concat(items.filter((it) => it.url !== cur.url).sort(() => Math.random() - 0.5));
        this.index = 0;
        this.el.loop = this.playlist.length === 1;
        return;
      }
      if (this.playing) { this.stop(); this.start(); }
    },
    start() {
      this.playing = true;
      this.stop(true);
      const sel = this.sel, items = this.pool(sel);
      this.sig = items.map((it) => it.url).join('|');
      if (sel === 'default:synth') { A.unlock(); this.synth = Synth.start(); return; }
      if (!items.length) return;
      this.playlist = sel === 'random' ? items.sort(() => Math.random() - 0.5) : items;
      this.index = 0;
      this.playCurrent();
    },
    playCurrent() {
      const it = this.playlist[this.index % this.playlist.length];
      if (!it) return;
      const el = (this.el = new Audio(it.url));
      el.loop = this.playlist.length === 1;
      el.onended = () => { this.fails = 0; this.index++; this.playCurrent(); };
      // A broken or deleted track skips to the next one; give up once every track has failed in a row.
      el.onerror = () => {
        if (this.el !== el) return;
        this.fails = (this.fails || 0) + 1;
        if (this.fails >= this.playlist.length) return;
        this.index++;
        setTimeout(() => { if (this.el === el) this.playCurrent(); }, 300);
      };
      this.applyVolume();
      el.play().then(() => (this.fails = 0), (e) => { if (e && e.name === 'NotAllowedError') this.blocked = true; });
    },
    stop(keepFlag) {
      if (!keepFlag) this.playing = false;
      if (this.el) { this.el.onended = null; this.el.pause(); this.el = null; }
      if (this.synth) { this.synth.stop(); this.synth = null; }
    },
    // Start if not playing — or retry if the browser blocked autoplay before the first tap.
    ensure() { if (!this.playing || this.blocked) { this.blocked = false; this.start(); } },
    duck(on) { this.ducked = on; A.applyVolumes(); this.applyVolume(); },
    applyVolume() { if (this.el) this.el.volume = Math.min(1, A.vol.master * A.vol.music * (this.ducked ? 0.25 : 1)); },
  };

  // A small generative loop: four chords, arpeggio, bass and hats, scheduled ahead on the audio clock.
  const Synth = {
    start() {
      const c = A.ctx;
      if (!c) return { stop() {} };
      const out = c.createGain();
      out.gain.value = 0.55;
      out.connect(A.music);
      const bpm = 108, step = 60 / bpm / 4;
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 67]];
      const pat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2];
      const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
      let n = 0, next = c.currentTime + 0.1, dead = false;
      const note = (f, t, d, type, v) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + d + 0.02);
      };
      const tick = () => {
        if (dead) return;
        while (next < c.currentTime + 0.25) {
          const bar = Math.floor(n / 16) % 4, s = n % 16, ch = chords[bar];
          note(mf(ch[pat[s]] + 12), next, step * 1.8, 'triangle', 0.07);
          if (s % 8 === 0) note(mf(ch[0] - 12), next, step * 7, 'sine', 0.16);
          if (s % 4 === 2) A.noise(0.05, { at: next - c.currentTime, freq: 8000, filter: 'highpass', vol: 0.03, dest: out });
          next += step;
          n++;
        }
        setTimeout(tick, 60);
      };
      tick();
      return { stop() { dead = true; out.gain.setTargetAtTime(0, c.currentTime, 0.1); setTimeout(() => out.disconnect(), 600); } };
    },
  };

  A.Music = Music;
  MZ.Audio = A;
})();
