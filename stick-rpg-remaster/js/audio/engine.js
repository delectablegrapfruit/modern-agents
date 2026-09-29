// js/audio/engine.js — owner: W1-S. SR.audio (ARCHITECTURE §12; ART_AUDIO §13.7; CONTRACT §14.1):
// the AudioContext created on the first user activation (a key, click or tap; never a gamepad
// button, which is not a user activation), the graph sources → buses (music, sfx, ambience, ui,
// voice) → compressor (-14 dB, 3:1) → master → destination, the bus volumes from SR.settings
// (audio.*; the voice bus follows the SFX slider) and mono, the 24-voice pool with oldest
// lowest-priority stealing, spatial sfx (pan by the screen-x offset, gain 1 / (1 + d / 400), culled
// beyond 900 u), captions, ducking, suspension while the tab is hidden, the 25 ms scheduler tick
// (music.js schedules 120 ms ahead on it) and SR.audio.renderOffline for the objective tests.
// Additive names (docs/requests/W1-S.md): state(), unlock(), stats(), levels(), lengthOf(),
// listener(), and SR.audio.engine (internal, shared with music.js and ambience.js).
// Load-time rule: defines functions only; the listeners are added in a prio-60 boot hook.
(function () {
  'use strict';
  var SR = window.SR;
  var A = SR.audio;

  var BUSES = ['music', 'sfx', 'ambience', 'ui', 'voice'];
  // ART_AUDIO §13.7 bus levels (dB, before the player's sliders). Music and sfx are mixed at their
  // own peaks (≤ -10 and ≤ -6 dBFS); ambience sits at -24 dB, ui at -12 dB, voice blips at -16 dB.
  var BUS_DB = { music: 0, sfx: 0, ambience: -24, ui: -12, voice: -16 };
  var SLIDER = { master: 'audio.master', music: 'audio.music', sfx: 'audio.sfx', ambience: 'audio.ambience',
    ui: 'audio.ui', voice: 'audio.sfx' };
  // Master compressor (ART_AUDIO §13.7). A hard knee keeps the Web Audio makeup gain computable: the
  // compressor adds (1 / curve(0 dBFS))^0.6, which the trim after it removes, so quiet material
  // passes at unity and only peaks above -14 dBFS are squeezed.
  var COMP = { threshold: -14, ratio: 3, attack: 0.005, release: 0.15, knee: 0 };
  var MAX_VOICES = 24;                        // ARCHITECTURE §17
  var POOL_WINDOW = 0.3;                      // s the pool looks back from a voice's start (≥ any schedule-ahead)
  var SPATIAL = { ref: 400, cull: 900, halfWidth: 640, maxPan: 0.8 };
  var DUCK = { attack: 0.08, release: 0.4 };  // ART_AUDIO §13.7
  var VOICE_DUCK_DB = 4;                      // the song ducks 4 dB under voice blips
  var TICK_MS = 25;                           // ARCHITECTURE §12: a 25 ms timer
  var CAPTION_GAP = 1.5;                      // s between two automatic captions of one key
  var OFFLINE_CHUNK = 0.25;                   // s scheduled per offline suspend (voices waiting to start cost render time)
  var OFFLINE_AHEAD = 0.02;                   // s scheduled past the next suspend
  var OFFLINE_RATE = 44100;
  var LOOP_RENDER = 2;                        // s an offline render of a loop sfx lasts by default

  var L = {
    ac: null, E: null, ready: false, unsupported: false, timer: null, hooked: false,
    hiddenSuspended: false, captionAt: {}, overrides: {}, listener: null, ducks: [], duckDb: 0,
  };

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function S() { return A.synth; }
  function dbToGain(db) { return Math.pow(10, db / 20); }
  function hidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }

  /** @returns {number} the compressor's automatic makeup gain (Web Audio spec, hard knee). */
  function makeupGain() {
    var full = COMP.threshold + (0 - COMP.threshold) / COMP.ratio;
    return Math.pow(dbToGain(-full), 0.6);
  }

  /** @returns {number} the player's slider for a bus ('master' too), 0..1; 1 without SR.settings. */
  function slider(bus) {
    if (Object.prototype.hasOwnProperty.call(L.overrides, bus)) return L.overrides[bus];
    var v = 1;
    if (SR.settings && typeof SR.settings.get === 'function') {
      try { var s = SR.settings.get(SLIDER[bus]); if (num(s)) v = s; } catch (e) { /* unknown key */ }
    }
    return clamp(v, 0, 1);
  }

  function mono() {
    if (SR.settings && typeof SR.settings.get === 'function') {
      try { return SR.settings.get('audio.mono') === true; } catch (e) { return false; }
    }
    return false;
  }

  // ---- the graph ----

  /**
   * Builds the bus graph on a context. Live graphs follow the sliders and carry analysers; offline
   * graphs run every bus at its ART_AUDIO level with the sliders at 1.
   * @returns {object} { ac, buses, songs (the duck: songs → duck → music bus), comp, makeup, master, route(mono) }
   */
  function buildGraph(ac, o) {
    o = o || {};
    var G = { ac: ac, buses: {}, analysers: {} };
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = COMP.threshold;
    comp.knee.value = COMP.knee;
    comp.ratio.value = COMP.ratio;
    comp.attack.value = COMP.attack;
    comp.release.value = COMP.release;
    var makeup = ac.createGain();
    makeup.gain.value = 1 / makeupGain();
    var master = ac.createGain();
    master.gain.value = o.live ? slider('master') : 1;
    comp.connect(makeup);
    makeup.connect(master);
    var monoNode = ac.createGain();
    monoNode.channelCount = 1;
    monoNode.channelCountMode = 'explicit';
    monoNode.channelInterpretation = 'speakers';
    monoNode.connect(ac.destination);
    G.isMono = false;
    G.route = function (m) {
      // Only the output edge moves (the master analyser stays connected).
      try { master.disconnect(m ? ac.destination : monoNode); } catch (e) { /* not connected yet */ }
      master.connect(m ? monoNode : ac.destination);
      G.isMono = !!m;
    };
    G.route(o.live ? mono() : false);
    BUSES.forEach(function (b) {
      var g = ac.createGain();
      g.gain.value = dbToGain(BUS_DB[b]) * (o.live ? slider(b) : 1);
      g.connect(comp);
      G.buses[b] = g;
      if (o.live && typeof ac.createAnalyser === 'function') {
        var an = ac.createAnalyser();
        an.fftSize = 2048;
        g.connect(an);
        G.analysers[b] = an;
      }
    });
    if (o.live && typeof ac.createAnalyser === 'function') {
      var man = ac.createAnalyser();
      man.fftSize = 2048;
      master.connect(man);
      G.analysers.master = man;
    }
    var duck = ac.createGain();
    duck.connect(G.buses.music);
    G.songs = duck;
    G.duck = duck;
    G.comp = comp; G.makeup = makeup; G.master = master; G.mono = monoNode;
    return G;
  }

  // ---- the voice pool (ART_AUDIO §13.7: ≤ 24 voices, oldest lowest-priority stolen) ----

  /** @returns {object} a pool: add(voice, t) → false when the voice was dropped; prune(t); count(t). */
  function makePool(max) {
    var P = { voices: [], max: max, peak: 0, stolen: 0, dropped: 0, added: 0 };
    P.count = function (t) {
      var n = 0;
      for (var i = 0; i < P.voices.length; i++) { var v = P.voices[i]; if (!v.done && !v.stolen && v.end > t) n++; }
      return n;
    };
    P.add = function (v, t) {
      // Count every voice still sounding now or later (music is scheduled up to 120 ms ahead, so
      // voices that end before t still overlap the ones that start before it), but look back at
      // most POOL_WINDOW before t: a render scheduled all at once (no suspend(), as in Firefox) has
      // currentTime 0 while it schedules minute 1, and must not count every earlier voice as live.
      var ref = Math.max(Math.min(t, v.ac.currentTime), t - POOL_WINDOW);
      var live = [];
      for (var i = 0; i < P.voices.length; i++) {
        var w = P.voices[i];
        if (!w.done && !w.stolen && w.end > ref) live.push(w);
      }
      if (live.length >= P.max) {
        var victim = null;
        live.forEach(function (w) {
          if (!victim || w.priority < victim.priority || (w.priority === victim.priority && w.t0 < victim.t0)) victim = w;
        });
        if (victim.priority > v.priority) {
          P.dropped++;
          S().cut(v, t);
          S().dispose(v);
          return false;
        }
        victim.stolen = true;
        S().cut(victim, t);
        P.stolen++;
        live.length--;
      }
      P.voices.push(v);
      P.added++;
      if (live.length + 1 > P.peak) P.peak = live.length + 1;
      return true;
    };
    /** Disconnects the voices that ended (50 ms of margin for the last ramp). */
    P.prune = function (t) {
      var keep = [];
      for (var i = 0; i < P.voices.length; i++) {
        var v = P.voices[i];
        if (v.done) continue;
        if (v.end + 0.05 < t) { S().dispose(v); continue; }
        keep.push(v);
      }
      P.voices = keep;
    };
    P.clear = function () { P.voices.forEach(function (v) { S().dispose(v); }); P.voices = []; };
    return P;
  }

  /** An audio environment: a context, its graph and its pool (live or offline). */
  function makeEnv(ac, o) {
    return { ac: ac, graph: buildGraph(ac, o), pool: makePool(MAX_VOICES), live: !!(o && o.live), trace: null };
  }

  // ---- sfx ----

  /**
   * Plays a recipe into an environment at o.at (default now).
   * @param {object} o { at, gain, pitch (ratio), pan (-1..1), panner (true: a panner even at 0, for a
   *   spatial sound that moves), dest (an AudioNode instead of the bus), vary (false: no random
   *   variation), rng (a stream for vary; default SR.rng.fx), priority }
   * @returns {object|null} the voice, or null when the pool dropped it
   */
  function play(E, name, o) {
    var rec = SR.reg.sfx && SR.reg.sfx[name];
    if (!rec || !Array.isArray(rec.layers) || !S()) return null;
    o = o || {};
    var ac = E.ac;
    var t = num(o.at) ? o.at : ac.currentTime;
    var vary = rec.vary && o.vary !== false ? rec.vary : null;
    var rng = o.rng || (SR.rng && SR.rng.fx);
    var vp = vary && vary.pitch && rng ? 1 + rng.float(-vary.pitch, vary.pitch) : 1;
    var vg = vary && vary.gain && rng ? 1 + rng.float(-vary.gain, vary.gain) : 1;
    var pitch = (num(o.pitch) && o.pitch > 0 ? o.pitch : 1) * vp;
    var amp = (num(rec.gain) ? rec.gain : 1) * vg;
    var dest = o.dest || E.graph.buses[rec.bus || 'sfx'] || E.graph.buses.sfx;
    var panNode = null;
    if ((o.panner || (num(o.pan) && o.pan !== 0)) && typeof ac.createStereoPanner === 'function') {
      panNode = ac.createStereoPanner();
      panNode.pan.value = clamp(num(o.pan) ? o.pan : 0, -1, 1);
      panNode.connect(dest);
      dest = panNode;
    }
    var prio = num(o.priority) ? o.priority : num(rec.priority) ? rec.priority : 1;
    var v = S().newVoice(ac, dest, t, prio);
    if (panNode) v.nodes.push(panNode);
    v.name = name;
    v.loop = !!rec.loop;
    v.pan = panNode;
    v.pitch0 = num(o.pitch) && o.pitch > 0 ? o.pitch : 1;   // the caller's pitch (set() retunes relative to it)
    v.vol = num(o.gain) ? Math.max(0, o.gain) : 1;
    v.gate.gain.value = v.vol;
    var end = t;
    rec.layers.forEach(function (Ly) { end = Math.max(end, S().layer(v, Ly, t, { pitch: pitch, amp: amp, loop: !!rec.loop })); });
    S().stopAll(v, rec.loop ? Infinity : end);
    if (!E.pool.add(v, t)) return null;
    return v;
  }

  /** @returns {number|null} seconds a one-shot recipe lasts (null for a loop or an unknown name). */
  function sfxLength(name) {
    var rec = SR.reg.sfx && SR.reg.sfx[name];
    if (!rec || rec.loop || !Array.isArray(rec.layers)) return null;
    var min = 0.005, end = 0;
    rec.layers.forEach(function (Ly) {
      var e = Ly.env || {};
      var a = Math.max(min, e.a || 0), d = Math.max(0, e.d || 0), s = e.s || 0, r = Math.max(min, e.r || 0);
      var gate = num(Ly.dur) ? Ly.dur : a + d;
      var t = s === 0 && gate >= a + d ? (d > 0 ? a + d : a) + min : gate + r + min;
      end = Math.max(end, (Ly.start || 0) + t);
    });
    return end;
  }

  /** The listener: an override (sheets, cutscenes) or the world camera's centre and zoom. */
  function listener() {
    if (L.listener) return L.listener;
    var c = SR.world && SR.world.camera;
    if (c && num(c.x) && num(c.y)) return c;
    return null;
  }

  /** @returns {object} { gain, pan, culled, spatial } for a world position (ART_AUDIO §13.7). */
  function spatial(x, y) {
    if (!num(x) || !num(y)) return { gain: 1, pan: 0, culled: false, spatial: false };
    var cam = listener();
    if (!cam) return { gain: 1, pan: 0, culled: false, spatial: false };
    var dx = x - cam.x, dy = y - cam.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > SPATIAL.cull) return { gain: 0, pan: 0, culled: true, spatial: true };
    var zoom = num(cam.zoom) ? cam.zoom : 1;
    var pan = clamp(dx * zoom / SPATIAL.halfWidth, -1, 1) * SPATIAL.maxPan;
    return { gain: 1 / (1 + d / SPATIAL.ref), pan: pan, culled: false, spatial: true };
  }

  var INERT = { name: null, inert: true, playing: function () { return false; }, stop: function () {}, set: function () {} };

  function inert(name) {
    return { name: name, inert: true, playing: function () { return false; }, stop: function () {}, set: function () {} };
  }

  /**
   * Plays a sound effect (CONTRACT §14.1, D20).
   * One-shots: an inert handle when the audio is not running, the sound is culled (> 900 u) or the
   * pool dropped it. Loops (engine, skate, roulette): the handle stays usable; its voice starts, or
   * starts again, on a set() once the audio runs, the sound is within 900 u and a voice is free (a
   * loop started out of range, or stolen by the pool, comes back as it approaches), and a set()
   * beyond 900 u releases the voice. An unknown name warns once and returns an inert handle.
   * @param {string} name a registered recipe
   * @param {object} [o] { x, y (world units: spatial), gain (×), pitch (ratio, 1 = as written), pan
   *   (-1..1 for a non-spatial sound), at (seconds from now) }
   * @returns {object} a handle { name, inert, voice, playing(), stop(), set({ gain, pitch, x, y }) }
   */
  function sfx(name, o) {
    var rec = SR.reg.sfx && SR.reg.sfx[name];
    if (!rec) { SR.util.warnOnce('audio.sfx.' + name, 'SR.audio.sfx: no sound "' + name + '"'); return inert(name); }
    o = o || {};
    var st = { base: num(o.gain) ? Math.max(0, o.gain) : 1, pitch: num(o.pitch) && o.pitch > 0 ? o.pitch : 1,
      x: o.x, y: o.y, pan: num(o.pan) ? o.pan : 0, v: null, E: null, stopped: false };
    var sp = spatial(st.x, st.y);
    if (rec.caption && !sp.culled) autoCaption(rec.caption, sp.spatial ? sp.pan : (num(o.pan) ? o.pan : null));
    /** Starts the voice `delay` s from now when the audio runs and the sound is in range. */
    function begin(delay) {
      var s = spatial(st.x, st.y);
      var E = live();
      if (s.culled || !E) return false;
      var pan = E.graph.isMono ? 0 : (s.spatial ? s.pan : st.pan);
      var v = play(E, name, { at: E.ac.currentTime + delay, gain: st.base * s.gain, pitch: st.pitch, pan: pan, panner: s.spatial });
      if (!v) return false;
      st.v = v; st.E = E;
      return true;
    }
    function alive() { return !!st.v && !st.v.done && !st.v.stolen; }
    function room() { var E = live(); return !!E && E.pool.count(E.ac.currentTime) < MAX_VOICES; }
    if (!begin(num(o.at) && o.at > 0 ? o.at : 0) && !rec.loop) return inert(name);
    if (st.v && rec.bus === 'voice') duck(VOICE_DUCK_DB, Math.max(50, (sfxLength(name) || 0.1) * 1000));
    return {
      name: name,
      inert: false,
      /** The current voice (null while a loop waits to start). */
      get voice() { return st.v; },
      playing: function () { return alive() && st.v.end > st.E.ac.currentTime; },
      stop: function () {
        st.stopped = true;
        if (!alive()) return;
        var t = st.E.ac.currentTime;
        if (st.v.loop) S().releaseVoice(st.v, t);
        else S().cut(st.v, t, 0.02);
      },
      set: function (p) {
        if (!p || st.stopped) return;
        if (num(p.gain)) st.base = Math.max(0, p.gain);
        if (num(p.x) && num(p.y)) { st.x = p.x; st.y = p.y; }
        if (num(p.pitch) && p.pitch > 0) st.pitch = p.pitch;
        if (!alive()) { if (rec.loop && room()) begin(0); return; }
        var v = st.v, t = st.E.ac.currentTime;
        var s2 = spatial(st.x, st.y);
        if (s2.culled && v.loop) { S().releaseVoice(v, t); st.v = null; return; }
        S().setVolume(v, st.base * (s2.culled ? 0 : s2.gain), t);
        if (v.pan && s2.spatial && !st.E.graph.isMono) v.pan.pan.setTargetAtTime(s2.pan, t, 0.03);
        if (num(p.pitch) && p.pitch > 0) S().retune(v, st.pitch / v.pitch0, t);
      },
    };
  }

  // ---- captions and ducking ----

  /**
   * Emits a caption for the UI (CONTRACT §9.2: `caption` { key, dir }); dir is the pan (-1..1),
   * 'left' / 'right', or null.
   */
  function caption(key, dir) {
    if (!key || !SR.events) return;
    SR.events.emit('caption', { key: key, dir: dir === undefined ? null : dir });
  }

  function autoCaption(key, dir) {
    var now = Date.now() / 1000;
    if (L.captionAt[key] && now - L.captionAt[key] < CAPTION_GAP) return;
    L.captionAt[key] = now;
    caption(key, dir);
  }

  function applyDuck() {
    if (!L.E) return;
    var now = L.E.ac.currentTime;
    L.ducks = L.ducks.filter(function (d) { return d.until > now; });
    var db = 0;
    L.ducks.forEach(function (d) { if (d.db > db) db = d.db; });
    if (db === L.duckDb) return;
    var p = L.E.graph.duck.gain;
    var tc = (db > L.duckDb ? DUCK.attack : DUCK.release) / 3;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(dbToGain(-db), now, tc);
    L.duckDb = db;
  }

  /**
   * Ducks the song (not stingers) by db for ms (attack 80 ms, release 400 ms). ms omitted or
   * Infinity holds the duck until duck(0) or the returned release function; duck(0) releases every
   * held duck (the minigame frame: duck(6, Infinity) … duck(0)). Overlapping ducks take the deepest.
   * @returns {function} release
   */
  function duck(db, ms) {
    var d = Math.max(0, Number(db) || 0);
    if (!d) {
      L.ducks = L.ducks.filter(function (x) { return x.until !== Infinity; });
      applyDuck();
      return function () {};
    }
    var hold = ms === undefined || ms === null || ms === Infinity;
    if (!hold && !L.E) return function () {};
    var entry = { db: d, until: hold ? Infinity : L.E.ac.currentTime + Math.max(0, Number(ms) || 0) / 1000 };
    L.ducks.push(entry);
    applyDuck();
    return function () {
      var i = L.ducks.indexOf(entry);
      if (i >= 0) L.ducks.splice(i, 1);
      applyDuck();
    };
  }

  // ---- volumes ----

  function applyVolumes() {
    if (!L.E) return;
    var G = L.E.graph, now = L.ac.currentTime;
    BUSES.forEach(function (b) { G.buses[b].gain.setTargetAtTime(dbToGain(BUS_DB[b]) * slider(b), now, 0.02); });
    G.master.gain.setTargetAtTime(slider('master'), now, 0.02);
    var m = mono();
    if (m !== G.isMono) G.route(m);
  }

  /**
   * Sets a bus volume (0..1) for this session, over the player's slider (the Settings screen
   * changes SR.settings instead; a later change of that setting replaces this value).
   * @param {string} bus 'master' | 'music' | 'sfx' | 'ambience' | 'ui' | 'voice'
   */
  function setVolume(bus, v) {
    if (bus !== 'master' && BUSES.indexOf(bus) < 0) throw new Error('SR.audio.setVolume: unknown bus "' + bus + '"');
    L.overrides[bus] = clamp(Number(v) || 0, 0, 1);
    applyVolumes();
  }

  function onSettings(p) {
    if (!p || typeof p.key !== 'string') return;
    if (p.key === '*') { L.overrides = {}; applyVolumes(); return; }
    if (p.key.indexOf('audio.') !== 0) return;
    Object.keys(SLIDER).forEach(function (b) { if (SLIDER[b] === p.key) delete L.overrides[b]; });
    applyVolumes();
  }

  // ---- the live context ----

  /** @returns {object|null} the live environment once the context runs (null while locked). */
  function live() {
    return L.E && L.ac && L.ac.state === 'running' ? L.E : null;
  }

  function tick() {
    if (!L.E || L.ac.state !== 'running') return;
    var now = L.ac.currentTime;
    if (A.tracker && typeof A.tracker.tick === 'function') A.tracker.tick(L.E, now);
    if (A.ambience && typeof A.ambience.tick === 'function') A.ambience.tick(L.E, now);
    L.E.pool.prune(now);
    applyDuck();
  }

  /**
   * Runs each time the context (re)starts running: the first unlock, a tab shown again, a system
   * interruption ended. Music and ambience asked for (or stopped) while it was not running are
   * applied now; both hooks are idempotent, so the repeated calls (onstatechange, the resume
   * promise, unlock()) are harmless.
   */
  function onState() {
    if (!L.ac || L.ac.state !== 'running') return;
    L.ready = true;
    applyVolumes();
    applyDuck();
    if (A.tracker && typeof A.tracker.onUnlock === 'function') A.tracker.onUnlock();
    if (A.ambience && typeof A.ambience.onUnlock === 'function') A.ambience.onUnlock();
  }

  /**
   * Creates (or resumes) the AudioContext. Called from a user activation (key, click, tap); the
   * boot screen may call it from its own handler too. A gamepad button never reaches it.
   * @returns {string} the state (see state())
   */
  function unlock() {
    if (L.unsupported) return 'unsupported';
    if (!L.ac) {
      var Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!Ctor) { L.unsupported = true; return 'unsupported'; }
      try { L.ac = new Ctor({ latencyHint: 'interactive' }); } catch (e) { L.ac = new Ctor(); }
      L.E = makeEnv(L.ac, { live: true });
      L.ac.onstatechange = onState;
      if (!L.timer && typeof setInterval === 'function') L.timer = setInterval(tick, TICK_MS);
    }
    if (L.ac.state !== 'running' && !hidden()) {
      try {
        var p = L.ac.resume();
        if (p && typeof p.then === 'function') p.then(onState, function () {});
      } catch (e) { /* resume refused until a real activation */ }
    }
    onState();
    return state();
  }

  function onActivation(ev) {
    if (ev && ev.isTrusted === false) return;
    if (L.ac && L.ac.state === 'running') return;
    unlock();
  }

  function onVisibility() {
    if (!L.ac) return;
    if (hidden()) {
      if (L.ac.state === 'running') { L.hiddenSuspended = true; try { L.ac.suspend(); } catch (e) { /* closed */ } }
    } else if (L.hiddenSuspended) {
      L.hiddenSuspended = false;
      try {
        var p = L.ac.resume();
        if (p && typeof p.then === 'function') p.then(onState, function () {});
      } catch (e) { /* closed */ }
    }
  }

  /** @returns {string} 'locked' (no context yet), 'unsupported', or the context's state. */
  function state() {
    if (L.unsupported) return 'unsupported';
    if (!L.ac) return 'locked';
    return L.ac.state;
  }

  // ---- offline rendering (the objective tests, ARCHITECTURE §18) ----

  function defaultSeconds(kind, id) {
    if (kind === 'song') {
      var def = SR.reg.song && SR.reg.song[id];
      if (!def || !A.tracker) return 1;
      var C = A.tracker.compile(def);
      var bar = 0;
      var first = C.patterns[C.order[C.loopFrom !== null ? C.loopFrom : 0]];
      if (first) bar = C.stepsPerBar * first.dur;
      return C.loopFrom !== null ? C.once + bar : C.once + 1;
    }
    if (kind === 'sfx') {
      var len = sfxLength(id);
      return len === null ? LOOP_RENDER : len + 0.02;
    }
    return 4;
  }

  /**
   * Renders a song, an sfx recipe or an ambience bed into an OfflineAudioContext through the same
   * graph (buses at their ART_AUDIO levels, sliders at 1, the master compressor) (D20).
   * @param {string} kind 'song' | 'sfx' | 'ambience'
   * @param {string} id the song, recipe or bed
   * @param {number} [seconds] default: a song's order plus one bar (a stinger's order plus 1 s), a
   *   one-shot's length plus 20 ms, 2 s for a loop (released so it ends in silence), 4 s for a bed
   * @param {object} [o] { sampleRate (44100), variant, pos: { order, step }, level (ambience),
   *   min (ambience clock), seed, vary (sfx; default false), sfx: [{ at, name, gain, pitch, pan }] (more
   *   one-shots on the sfx path, e.g. the stress script), chunk (s scheduled per suspend, default
   *   0.25; false schedules everything before rendering, as browsers without suspend() do) }
   * @returns {Promise<AudioBuffer>}
   */
  function renderOffline(kind, id, seconds, o) {
    o = o || {};
    var Ctor = typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
    if (!Ctor) return Promise.reject(new Error('SR.audio.renderOffline: OfflineAudioContext is not available'));
    if (kind === 'song' && !(SR.reg.song && SR.reg.song[id])) return Promise.reject(new Error('SR.audio.renderOffline: no song "' + id + '"'));
    if (kind === 'sfx' && !(SR.reg.sfx && SR.reg.sfx[id])) return Promise.reject(new Error('SR.audio.renderOffline: no sfx "' + id + '"'));
    if (kind !== 'song' && kind !== 'sfx' && kind !== 'ambience') return Promise.reject(new Error('SR.audio.renderOffline: unknown kind "' + kind + '"'));
    var secs = num(seconds) && seconds > 0 ? seconds : defaultSeconds(kind, id);
    var sr = o.sampleRate || OFFLINE_RATE;
    var ac = new Ctor(2, Math.max(1, Math.ceil(secs * sr)), sr);
    var E = makeEnv(ac, { live: false });
    var rng = SR.rng && typeof SR.rng.create === 'function' ? SR.rng.create(o.seed || 1) : null;
    var pumps = [];
    if (kind === 'song') {
      var isStinger = String(id).indexOf('stingers.') === 0;
      var ch = A.tracker.offline(E, id, { variant: o.variant, pos: o.pos, stinger: isStinger });
      pumps.push(function (until) { ch.pump(until); });
    } else if (kind === 'sfx') {
      var rec = SR.reg.sfx[id];
      var v = play(E, id, { at: 0, vary: o.vary === true, rng: rng });
      if (v && rec.loop) {
        var r = 0;
        rec.layers.forEach(function (Ly) { r = Math.max(r, (Ly.env && Ly.env.r) || 0); });
        var rel = Math.max(0.01, secs - r - 0.03);
        pumps.push(function (until) { if (!v.done && v.loop && until >= rel) S().releaseVoice(v, rel); });
      }
    } else {
      if (!A.ambience || typeof A.ambience.offline !== 'function') return Promise.reject(new Error('SR.audio.renderOffline: ambience is not loaded'));
      var bed = A.ambience.offline(E, id, { level: num(o.level) ? o.level : 1, min: o.min, rng: rng, until: secs });
      if (!bed) return Promise.reject(new Error('SR.audio.renderOffline: no ambience bed "' + id + '"'));
      pumps.push(function (until) { bed.pump(until); });
    }
    var extra = Array.isArray(o.sfx) ? o.sfx.slice().sort(function (a, b) { return a.at - b.at; }) : [];
    var xi = 0;
    pumps.push(function (until) {
      while (xi < extra.length && extra[xi].at < until) {
        var x = extra[xi++];
        play(E, x.name, { at: x.at, gain: x.gain, pitch: x.pitch, pan: x.pan, vary: false });
      }
    });
    function pumpAll(until) { pumps.forEach(function (p) { p(until); }); }
    var chunked = typeof ac.suspend === 'function' && o.chunk !== false;   // false: all at once (Firefox's path)
    var chunk = num(o.chunk) && o.chunk >= 0.05 ? o.chunk : OFFLINE_CHUNK;
    pumpAll(chunked ? chunk + OFFLINE_AHEAD : secs + 1);
    if (chunked) {
      for (var t = chunk; t < secs; t += chunk) {
        (function (at) {
          ac.suspend(at).then(function () {
            pumpAll(at + chunk + OFFLINE_AHEAD);
            E.pool.prune(at);
            ac.resume();
          });
        })(t);
      }
    }
    var done = ac.startRendering();
    var result = done && typeof done.then === 'function' ? done : new Promise(function (res) {
      ac.oncomplete = function (e) { res(e.renderedBuffer); };
    });
    return result.then(function (buf) {
      L.lastRender = { kind: kind, id: id, seconds: secs, peakVoices: E.pool.peak, stolen: E.pool.stolen,
        dropped: E.pool.dropped, added: E.pool.added };
      E.pool.clear();
      return buf;
    });
  }

  // ---- inspection ----

  /** @returns {object} the engine's state for tests and the sound sheet. */
  function stats() {
    var out = { state: state(), voices: 0, peakVoices: 0, stolen: 0, dropped: 0, added: 0, maxVoices: MAX_VOICES,
      duckDb: L.duckDb, duck: 1, mono: false, time: L.ac ? L.ac.currentTime : 0, music: null, ambience: null };
    if (L.E) {
      var now = L.ac.currentTime;
      out.voices = L.E.pool.count(now);
      out.peakVoices = L.E.pool.peak;
      out.stolen = L.E.pool.stolen;
      out.dropped = L.E.pool.dropped;
      out.added = L.E.pool.added;
      out.duck = L.E.graph.duck.gain.value;
      out.mono = L.E.graph.isMono;
      out.buses = {};
      BUSES.forEach(function (b) { out.buses[b] = L.E.graph.buses[b].gain.value; });
      out.master = L.E.graph.master.gain.value;
    }
    if (A.tracker && typeof A.tracker.status === 'function') out.music = A.tracker.status();
    if (A.ambience && typeof A.ambience.status === 'function') out.ambience = A.ambience.status();
    return out;
  }

  /** @returns {object} the RMS (dBFS) of each bus and the master over the last 2048 samples. */
  function levels() {
    var out = {};
    if (!L.E) return out;
    var buf = new Float32Array(2048);
    Object.keys(L.E.graph.analysers).forEach(function (b) {
      var an = L.E.graph.analysers[b];
      if (typeof an.getFloatTimeDomainData !== 'function') return;
      an.getFloatTimeDomainData(buf);
      var s = 0;
      for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      var rms = Math.sqrt(s / buf.length);
      out[b] = rms > 0 ? 20 * Math.log(rms) / Math.LN10 : -Infinity;
    });
    return out;
  }

  /** @returns {number|null} seconds of one pass of a song, or of a one-shot sfx. */
  function lengthOf(kind, id) {
    if (kind === 'song') return A.tracker ? A.tracker.lengthOf(id) : null;
    if (kind === 'sfx') return sfxLength(id);
    return null;
  }

  /** Sets (x, y, zoom) as the spatial listener instead of the world camera; no argument clears it. */
  function setListener(x, y, zoom) {
    L.listener = num(x) && num(y) ? { x: x, y: y, zoom: num(zoom) ? zoom : 1 } : null;
  }

  A.sfx = sfx;
  A.duck = duck;
  A.caption = caption;
  A.setVolume = setVolume;
  A.renderOffline = renderOffline;
  A.unlock = unlock;
  A.state = state;
  A.stats = stats;
  A.levels = levels;
  A.lengthOf = lengthOf;
  A.listener = setListener;
  A.engine = {
    BUSES: BUSES, BUS_DB: BUS_DB, COMP: COMP, MAX_VOICES: MAX_VOICES, SPATIAL: SPATIAL, TICK_MS: TICK_MS,
    INERT: INERT,
    makeupGain: makeupGain,
    buildGraph: buildGraph,
    makePool: makePool,
    makeEnv: makeEnv,
    play: play,
    spatial: spatial,
    sfxLength: sfxLength,
    live: live,
    tick: tick,
    /** @returns {object|null} the voice statistics of the last offline render. */
    lastRender: function () { return L.lastRender || null; },
    /** The live AudioContext (null while locked); tests and the sound sheet read its clock. */
    context: function () { return L.ac; },
  };

  SR.onBoot(60, function () {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function' || L.hooked) return;
    L.hooked = true;
    // Keys, clicks and taps are user activations; gamepad buttons are not (CONTRACT §12, UI §5.2).
    ['keydown', 'mousedown', 'pointerdown', 'touchstart', 'touchend', 'click'].forEach(function (t) {
      window.addEventListener(t, onActivation, true);
    });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    if (SR.events) SR.events.on('settings:changed', onSettings);
  });
})();
