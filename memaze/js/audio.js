/* Memaze — sound: synthesized effects (WebAudio, no files) and music (the player's files or the built-in chill loop). */
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
      // Glide to the new level over a few tens of ms: a gain that jumps while music plays (ducking, a slider drag) clicks.
      const now = this.ctx.currentTime, glide = (p, v) => { p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.03); };
      glide(this.master.gain, this.vol.master);
      glide(this.sfx.gain, this.vol.sfx);
      glide(this.music.gain, this.vol.music * (Music.ducked ? 0.25 : 1));
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
      g.gain.value = 0; // silent until its first event (see env() in the music below)
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
      g.gain.value = 0; // silent until its first event (see env() in the music below)
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
        case 'hurt': // the shield breaking: a crack, an electric zap falling away, a thump
          this.noise(0.12, { filter: 'highpass', freq: 3000, vol: 0.3 });
          this.tone(1400, 0.3, { type: 'sawtooth', to: 90, vol: 0.09 });
          this.noise(0.25, { filter: 'bandpass', freq: 900, to: 200, q: 2, vol: 0.25, at: 0.02 });
          this.tone(90, 0.2, { type: 'sine', vol: 0.22 });
          break;
        case 'bubble': this.tone(300, 0.5, { type: 'sine', to: 700, vol: 0.12 }); this.tone(900, 0.35, { type: 'sine', to: 1300, vol: 0.05, at: 0.12 }); break;
        case 'pop': this.noise(0.06, { filter: 'bandpass', freq: 1800, q: 3, vol: 0.3 }); this.tone(1500, 0.08, { type: 'sine', to: 600, vol: 0.12 }); break;
        case 'unlock': this.noise(0.05, { filter: 'bandpass', freq: 2500, q: 4, vol: 0.3 }); this.tone(330, 0.12, { type: 'square', vol: 0.06, at: 0.04 }); [660, 990].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.11, at: 0.1 + i * 0.07 })); break;
        case 'key': [880, 1175, 1760].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.13, at: i * 0.06 })); this.noise(0.08, { filter: 'highpass', freq: 4000, vol: 0.1, at: 0.18 }); break;
        case 'switch': this.tone(520, 0.07, { type: 'square', vol: 0.08 }); this.tone(780, 0.1, { type: 'square', vol: 0.06, at: 0.07 }); this.noise(0.05, { filter: 'lowpass', freq: 600, vol: 0.25 }); break;
        case 'warp': this.tone(1600, 0.35, { type: 'sine', to: 200, vol: 0.12 }); this.tone(200, 0.35, { type: 'sine', to: 1400, vol: 0.08, at: 0.12 }); break;
        case 'low': [1050, 1050].forEach((f, i) => this.tone(f, 0.05, { type: 'square', vol: 0.03, at: i * 0.12 })); break;
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
        case 'storm': this.noise(0.6, { filter: 'lowpass', freq: 180, to: 90, vol: 0.22 }); this.tone(55, 0.5, { type: 'sine', vol: 0.08, attack: 0.15 }); break; // a thundercloud gathering
        case 'zap': // the lightning: a crack, a buzz dropping away, and thunder rolling after it
          this.noise(0.09, { filter: 'highpass', freq: 2200, vol: 0.4 });
          this.tone(1400, 0.14, { type: 'sawtooth', to: 160, vol: 0.07 });
          this.noise(1.1, { filter: 'lowpass', freq: 260, to: 50, vol: 0.42, at: 0.03 });
          break;
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

  // The built-in music, "Screensaver": a chill loop with a late-90s-internet feel (think Hypnospace Outlaw). Jazzy
  // electric-piano chords over a warm pad and a round bass, soft swung drums with vinyl crackle, glassy chimes echoing
  // in a tape delay, everything bent a few cents by a slow wobble. 84 bpm in D; every 32 bars the melody is new. All
  // synthesized, scheduled a little ahead on the audio clock. Nothing may click: every note eases in from silence
  // (never a jump, never an exponential rise, which snaps up in its last moment) and is near silent before it stops.
  const Synth = {
    start() {
      const c = A.ctx;
      if (!c) return { stop() {} };
      const t0 = c.currentTime;
      const out = c.createGain(), warm = c.createBiquadFilter();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(1.35, t0 + 2.5); // fades in
      warm.type = 'lowpass'; warm.frequency.value = 6500; warm.Q.value = 0.3;
      out.connect(warm); warm.connect(A.music);
      const bpm = 84, beat = 60 / bpm, s16 = beat / 4, bar = beat * 4;
      // Echo: a dotted eighth, darker each time round.
      const echo = c.createDelay(2), fb = c.createGain(), dark = c.createBiquadFilter(), wet = c.createGain();
      echo.delayTime.value = beat * 0.75; fb.gain.value = 0.4; dark.type = 'lowpass'; dark.frequency.value = 2400; wet.gain.value = 0.55;
      echo.connect(dark); dark.connect(fb); fb.connect(echo); dark.connect(wet); wet.connect(out);
      // Tape wobble: one slow LFO bends every pitched note a few cents.
      const wob = c.createOscillator(), wobAmt = c.createGain();
      wob.frequency.value = 0.27; wobAmt.gain.value = 7; wob.connect(wobAmt); wob.start(t0);
      // Vinyl crackle: a whisper of hiss and a few soft ticks a second, mostly faint, each a smooth little bump rather
      // than a one-sample spike, kept in the mids. The loop is long and out of step with the bar, so no tick comes
      // round in time with the beat.
      const CSEC = 7.3, crackle = c.createBufferSource(), cbuf = c.createBuffer(1, Math.round(c.sampleRate * CSEC), c.sampleRate), cd = cbuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * 0.008;
      for (let k = Math.round(CSEC * 6); k > 0; k--) {
        const w = Math.max(4, Math.round((6 + Math.random() * 10) * c.sampleRate / 44100)), at = Math.floor(Math.random() * (cd.length - w));
        const amp = (Math.random() < 0.5 ? -1 : 1) * 0.18 * Math.pow(Math.random(), 2);
        for (let j = 0; j < w; j++) cd[at + j] += amp * 0.5 * (1 - Math.cos(2 * Math.PI * (j + 0.5) / w));
      }
      const chp = c.createBiquadFilter(), clp = c.createBiquadFilter(), cg = c.createGain();
      chp.type = 'highpass'; chp.frequency.value = 1200; clp.type = 'lowpass'; clp.frequency.value = 4500; cg.gain.value = 0.14;
      crackle.buffer = cbuf; crackle.loop = true; crackle.connect(chp); chp.connect(clp); clp.connect(cg); cg.connect(out); crackle.start(t0);

      const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
      // A straight-line rise from silence, then an exponential fall to near silence. The param is zeroed first: until
      // its first event a gain sits at its default of 1, and Chrome lets a sound starting a hair after a sample frame
      // play that frame at full level (on this tempo's grid that is half the unswung hits at 44.1 kHz).
      const env = (param, t, a, peak, d) => { param.value = 0; param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + a); param.exponentialRampToValueAtTime(0.0001, t + a + d); };
      const osc = (type, f, t, end) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; wobAmt.connect(o.detune); o.start(t); o.stop(end); return o; };
      // Electric piano: FM (the bark dies away fast) plus a faint bell tine; a little of it goes to the echo.
      const ep = (m, t, dur, v) => {
        const f = mf(m), end = t + dur + 0.1, car = osc('sine', f, t, end), mod = osc('sine', f, t, end), tine = osc('sine', f * 4, t, end);
        const mg = c.createGain(), g = c.createGain(), tg = c.createGain(), send = c.createGain();
        mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.4);
        mod.connect(mg); mg.connect(car.frequency);
        env(g.gain, t, 0.006, v, dur); env(tg.gain, t, 0.005, v * 0.1, 0.22);
        send.gain.value = 0.18;
        car.connect(g); tine.connect(tg); g.connect(out); tg.connect(out); g.connect(send); send.connect(echo);
      };
      // Pad: two slightly detuned saws per note through a lowpass that breathes.
      const pad = (notes, t, dur) => {
        const lp = c.createBiquadFilter(), g = c.createGain(), end = t + dur + 1;
        lp.type = 'lowpass'; lp.Q.value = 0.5;
        lp.frequency.setValueAtTime(650, t); lp.frequency.linearRampToValueAtTime(1150, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(650, t + dur);
        g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
        for (const m of notes) for (const d of [-7, 7]) { const o = osc('sawtooth', mf(m), t, end); o.detune.value = d; o.connect(lp); }
        lp.connect(g); g.connect(out);
      };
      // Bass: a round sine with a quiet triangle an octave up for definition.
      const bass = (m, t, dur, v) => {
        const g = c.createGain(), g2 = c.createGain(), end = t + dur + 0.1;
        env(g.gain, t, 0.015, v, dur); env(g2.gain, t, 0.015, v * 0.12, dur * 0.6);
        osc('sine', mf(m), t, end).connect(g); osc('triangle', mf(m + 12), t, end).connect(g2);
        g.connect(out); g2.connect(out);
      };
      // Chimes: glassy bells (a sine and an inharmonic partial), mostly heard through the echo.
      const chime = (m, t, v) => {
        const g = c.createGain(), g2 = c.createGain(), send = c.createGain(), end = t + 1.6;
        env(g.gain, t, 0.006, v, 1.3); env(g2.gain, t, 0.005, v * 0.3, 0.4);
        osc('sine', mf(m), t, end).connect(g); osc('sine', mf(m) * 2.76, t, end).connect(g2);
        send.gain.value = 0.7;
        g.connect(out); g2.connect(out); g.connect(send); send.connect(echo);
      };
      // Drum noise: eased in like everything else, and a different grain of the noise each time so no two hits are
      // the same machine tick.
      const nb = A.noiseBuf();
      const hit = (t, v, a, d, type, f, q) => {
        const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
        s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        env(g.gain, t, a, v, d);
        s.connect(fl); fl.connect(g); g.connect(out);
        s.start(t, Math.random() * 0.7); s.stop(t + a + d + 0.05);
      };
      // Kick: a soft felt thump. A sine eased in over 8 ms that sags from 96 to 48 Hz, rounded off by a lowpass, with
      // a breath of muffled noise for the beater so it still reads on small speakers.
      const kick = (t, v) => {
        const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
        o.frequency.value = 96; o.frequency.setValueAtTime(96, t); o.frequency.setTargetAtTime(48, t, 0.05);
        lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.5;
        env(g.gain, t, 0.008, v, 0.42);
        o.connect(g); g.connect(lp); lp.connect(out); o.start(t); o.stop(t + 0.5);
        hit(t, v * 0.12, 0.004, 0.05, 'lowpass', 380, 0.5);
      };
      // Brushed snare: a soft swish with a little body. Hats: a darkish "tss", a little different every time.
      const snare = (t, v) => { hit(t, v, 0.008, 0.17, 'bandpass', 1600, 0.7); hit(t, v * 0.5, 0.005, 0.07, 'lowpass', 450, 0.5); };
      const hat = (t, v) => hit(t, v * (0.8 + Math.random() * 0.4), 0.002, 0.045, 'bandpass', 5500, 0.7);

      // D major, jazzy: bass note and a voicing per bar.
      const A1 = [[50, [54, 57, 61, 64]], [47, [50, 54, 57, 61]], [52, [55, 59, 62, 66]], [45, [55, 59, 62, 64]]]; // Dmaj9 Bm9 Em9 A9sus
      const B1 = [[43, [54, 57, 59, 62]], [42, [52, 57, 61, 64]], [52, [55, 59, 62, 66]], [45, [55, 61, 64, 66]]]; // Gmaj9 F#m7 Em9 A13
      const SCALE = [69, 71, 74, 76, 78, 81, 83, 86, 88]; // the chimes: D major pentatonic, up high
      const COMP = [[[0, 5, 0.9], [10, 4, 0.7]], [[0, 3, 0.8], [6, 3, 0.6], [11, 4, 0.7]], [[3, 4, 0.75], [8, 3, 0.6], [14, 2, 0.55]]]; // [step, length in 16ths, velocity]
      let rnd = MZ.rng(Math.floor(Math.random() * 1e9)), melody = null, melodyKey = '';
      const makeMelody = () => { // two bars of eighths, a gentle random walk along the scale, with rests
        const out2 = [];
        let i = r2(2, 5);
        for (let k = 0; k < 16; k++) {
          if (rnd() < 0.62) { out2.push(null); continue; }
          i = Math.max(0, Math.min(SCALE.length - 1, i + [-2, -1, -1, 1, 1, 2][Math.floor(rnd() * 6)]));
          out2.push(SCALE[i]);
        }
        return out2;
      };
      function r2(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

      let n = 0, next = t0 + 0.15, dead = false, comp = null;
      const tick = () => {
        if (dead) return;
        // Fallen behind (a stalled or throttled tab)? Skip the missed steps rather than play them all at once.
        while (next < c.currentTime) { next += s16; n++; }
        while (next < c.currentTime + 0.3) {
          const barN = Math.floor(n / 16), st = n % 16, inCycle = barN % 32, sec = Math.floor(inCycle / 8), last = inCycle === 31;
          const prog = sec === 2 ? B1 : A1, [root, voicing] = prog[barN % 4];
          const t = next + (st % 2 ? s16 * 0.18 : 0); // swing
          if (st === 0) {
            if (inCycle === 0) { melody = null; }
            pad(voicing.map((m) => m - 12), t, bar);
            comp = COMP[r2(0, COMP.length - 1)];
          }
          for (const [at, len, v] of comp || []) if (at === st) voicing.forEach((m, k) => ep(m, t + k * 0.014, len * s16 * 1.6, 0.05 * v));
          // Bass: the root, a fifth or octave on the "and of three", a note leading into the next bar.
          if (st === 0) bass(root, t, beat * (sec === 0 ? 3.5 : 1.6), 0.2);
          if (sec > 0 && st === 10) bass(root + (rnd() < 0.5 ? 7 : 12), t, beat * 0.5, 0.14);
          if (sec > 0 && st === 14) { const nx = prog[(barN + 1) % 4][0]; bass(nx + (rnd() < 0.5 ? -1 : 1), t, beat * 0.25, 0.1); }
          // Drums, all soft: hats from the start, leaning on the offbeats; kick (on one and the "and of three", now and
          // then a ghost) and brushed snare from the second section; a breath at the end of each cycle.
          const full = sec > 0 && !(last && st >= 8);
          if (st % 2 === 0) hat(t, st % 4 === 0 ? 0.016 : 0.021);
          else if (sec > 0) hat(t, 0.007);
          if (full && (st === 0 || st === 10 || (st === 7 && rnd() < 0.35))) kick(t, st === 0 ? 0.26 : st === 10 ? 0.18 : 0.11);
          if (full && (st === 4 || st === 12)) snare(t, 0.055);
          if (full && st === 15 && rnd() < 0.3) snare(t, 0.018);
          // Chimes: a two-bar melody, new every cycle, repeated through the first and last sections; the middle
          // section arpeggiates the chords instead.
          if ((sec === 1 || sec === 3) && st % 2 === 0) {
            const key = Math.floor(barN / 32) + '/' + sec;
            if (!melody || melodyKey !== key) { melody = makeMelody(); melodyKey = key; }
            const m = melody[((barN % 2) * 8) + st / 2];
            if (m != null && !(last && st >= 8)) chime(m + (sec === 3 && barN % 8 >= 6 && rnd() < 0.3 ? 12 : 0), t, 0.05);
          }
          if (sec === 2 && [0, 3, 6, 8, 11, 14].includes(st)) chime(voicing[[0, 1, 2, 3, 2, 1][[0, 3, 6, 8, 11, 14].indexOf(st)]] + 12, t, 0.022);
          next += s16;
          n++;
        }
        setTimeout(tick, 50);
      };
      tick();
      return {
        stop() {
          dead = true;
          const now = c.currentTime, g = out.gain;
          // Hold the level where it is (even mid fade-in; cancelling alone would snap it back) and ease out from there.
          if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
          g.setTargetAtTime(0.0001, now, 0.25);
          setTimeout(() => { try { crackle.stop(); wob.stop(); } catch (e) { /* already stopped */ } out.disconnect(); }, 2200);
        },
      };
    },
  };

  A.Music = Music;
  MZ.Audio = A;
})();
