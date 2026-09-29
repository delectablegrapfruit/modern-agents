// js/audio/ambience.js — owner: W1-S. SR.audio.ambience(id, level) (ARCHITECTURE §12; ART_AUDIO §13.6):
// beds of looping recipes plus randomly scheduled one-shots, on the ambience bus (-24 dB), each
// fading 1 s on changes (ART_AUDIO §13.7), their loops under an optional swell (slow AM). Beds:
// city (distant traffic with slow swells; birds by day, crickets by night), birds, crickets, rain,
// wind (the caller drives its level from the edge distance and Windy weather), fog (a rare fog
// horn), casino (a murmur with AM, chips, a slot ding), bar (chatter, glass clinks), fryer, office
// (hum), campus (murmur), park (fountain, ducks, birds by day).
// The clock for day and night is SR.state.clock.min (05:30-19:30 is day, the city music's switch
// times), or the override set with SR.audio.ambience.time(min). Random timing draws from
// SR.rng.fx (offline renders pass a seeded stream).
// Load-time rule: defines data and functions only.
(function () {
  'use strict';
  var SR = window.SR;
  var A = SR.audio;

  var FADE = 1;               // ART_AUDIO §13.7: ambience fades 1 s
  var LOOKAHEAD = 0.12;
  var DAY_FROM = 330, DAY_TO = 1170;    // 05:30 and 19:30 in minutes of the day
  var MORNING_TO = 660;                 // birds sing most until 11:00

  // A bed: loops (recipes held while the bed plays, with a gain each), an optional swell (slow
  // amplitude modulation of the loops: [[rate Hz, depth 0..1], ...]: the city's traffic swells, the
  // murmurs' AM) and events (one-shots every [min, max] seconds, gain and pan ranges, `when`
  // 'day' | 'night' | 'always').
  var BEDS = {
    city: { loops: [{ sfx: 'city_loop', gain: 1 }], swell: [[0.07, 0.35], [0.023, 0.2]], events: [
      { sfx: 'bird_chirp', every: [1.5, 5], when: 'day', gain: [0.35, 0.9], pan: [-0.7, 0.7], morning: true },
      { sfx: 'cricket', every: [0.35, 1.4], when: 'night', gain: [0.3, 0.8], pan: [-0.8, 0.8] },
    ] },
    birds: { loops: [], events: [{ sfx: 'bird_chirp', every: [0.8, 3.5], when: 'always', gain: [0.4, 1], pan: [-0.8, 0.8] }] },
    crickets: { loops: [], events: [{ sfx: 'cricket', every: [0.3, 1.1], when: 'always', gain: [0.35, 0.9], pan: [-0.8, 0.8] }] },
    rain: { loops: [{ sfx: 'rain_loop', gain: 1 }], swell: [[0.11, 0.15]], events: [] },
    wind: { loops: [{ sfx: 'wind_loop', gain: 1 }], swell: [[0.17, 0.4], [0.05, 0.3]], events: [] },
    fog: { loops: [], events: [{ sfx: 'fog_horn', every: [20, 45], when: 'always', gain: [0.6, 1], pan: [-0.5, 0.5], delay: [3, 10] }] },
    casino: { loops: [{ sfx: 'murmur_loop', gain: 1 }], swell: [[2.3, 0.2], [0.37, 0.25]], events: [
      { sfx: 'chips', every: [2.5, 7], when: 'always', gain: [0.3, 0.7], pan: [-0.8, 0.8] },
      { sfx: 'slot_ding', every: [5, 14], when: 'always', gain: [0.25, 0.6], pan: [-0.8, 0.8] },
    ] },
    bar: { loops: [{ sfx: 'chatter_loop', gain: 1 }], swell: [[3.1, 0.25], [0.5, 0.2]], events: [
      { sfx: 'glass_clink', every: [3, 10], when: 'always', gain: [0.3, 0.7], pan: [-0.8, 0.8] },
    ] },
    fryer: { loops: [{ sfx: 'sizzle_loop', gain: 1 }], events: [] },
    office: { loops: [{ sfx: 'hum_loop', gain: 1 }], events: [] },
    campus: { loops: [{ sfx: 'murmur_loop', gain: 0.6 }], swell: [[2.7, 0.2], [0.3, 0.2]], events: [] },
    park: { loops: [{ sfx: 'fountain_loop', gain: 1 }], swell: [[0.9, 0.1]], events: [
      { sfx: 'duck_quack', every: [5, 15], when: 'always', gain: [0.4, 0.9], pan: [-0.7, 0.7] },
      { sfx: 'bird_chirp', every: [1.5, 6], when: 'day', gain: [0.3, 0.8], pan: [-0.8, 0.8], morning: true },
    ] },
  };

  var B = { live: {}, dying: [], want: {}, clock: null };

  function num(v) { return typeof v === 'number' && isFinite(v); }

  /** @returns {number} minutes of the day for day / night choices. */
  function clockMin() {
    if (num(B.clock)) return B.clock;
    if (SR.state && SR.state.clock && num(SR.state.clock.min)) return SR.state.clock.min % 1440;
    return 720;
  }

  function isDay(min) { return min >= DAY_FROM && min < DAY_TO; }

  /** Holds a gain at its current value from t (t is now), so a new ramp starts there. */
  function hold(p, t) {
    var v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }

  function range(rng, r, dflt) {
    if (!Array.isArray(r)) return dflt;
    return rng ? rng.float(r[0], r[1]) : (r[0] + r[1]) / 2;
  }

  /**
   * Starts a bed on an environment. The bed's out gain fades to `level`; loops start at once and
   * events are scheduled by pump(until).
   * @returns {object} the bed runtime
   */
  function start(E, id, level, o) {
    var def = BEDS[id];
    if (!def) return null;
    var ac = E.ac, eng = A.engine;
    var now = num(o.at) ? o.at : ac.currentTime;
    var out = ac.createGain();
    out.gain.setValueAtTime(0, 0);
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + FADE);
    out.connect(E.graph.buses.ambience);
    var rng = o.rng || (SR.rng && SR.rng.fx);
    var bed = { id: id, E: E, out: out, level: level, loops: [], events: [], stopAt: null, rng: rng, clock: o.min, nodes: [out], lfos: [] };
    var into = out;
    if (def.swell && def.swell.length) {
      // The swell: a gain at 1 - Σdepth / 2 plus each LFO at depth / 2, so it moves within [1 - Σdepth, 1].
      var sw = ac.createGain();
      var sum = 0;
      def.swell.forEach(function (x) { sum += x[1]; });
      sw.gain.value = 1 - sum / 2;
      sw.connect(out);
      def.swell.forEach(function (x) {
        var l = ac.createOscillator();
        l.frequency.value = x[0];
        var g = ac.createGain();
        g.gain.value = x[1] / 2;
        l.connect(g);
        g.connect(sw.gain);
        l.start(now);
        bed.nodes.push(l, g);
        bed.lfos.push(l);
      });
      bed.nodes.push(sw);
      into = sw;
    }
    def.loops.forEach(function (lp) {
      var v = eng.play(E, lp.sfx, { at: now, gain: lp.gain, dest: into, vary: false, priority: 0 });
      if (v) bed.loops.push(v);
      var rec = SR.reg.sfx && SR.reg.sfx[lp.sfx];
      if (rec && rec.caption && o.live && A.caption) A.caption(rec.caption, null);
    });
    def.events.forEach(function (ev) {
      bed.events.push({ def: ev, next: now + range(rng, ev.delay || [0, ev.every[1]], 0) });
    });
    bed.pump = function (until) {
      var min = num(bed.clock) ? bed.clock : clockMin();
      bed.events.forEach(function (e) {
        var d = e.def;
        var guard = 0;
        while (e.next < until && guard++ < 64) {
          if (bed.stopAt !== null && e.next >= bed.stopAt) { e.next = Infinity; break; }
          var ok = d.when === 'always' || (d.when === 'day' ? isDay(min) : !isDay(min));
          var every = d.every;
          if (d.morning && isDay(min) && min >= MORNING_TO) every = [every[0] * 2, every[1] * 2];
          if (ok) {
            eng.play(E, d.sfx, { at: Math.max(e.next, E.ac.currentTime), gain: range(rng, d.gain, 1),
              pan: range(rng, d.pan, 0), dest: out, rng: rng });
          }
          e.next += range(rng, every, every[0]);
        }
      });
    };
    bed.setLevel = function (lv, t) {
      bed.level = lv;
      hold(out.gain, t);
      out.gain.setTargetAtTime(lv, t, FADE / 3);
    };
    bed.stop = function (t) {
      if (bed.stopAt !== null) return;
      hold(out.gain, t);
      out.gain.linearRampToValueAtTime(0, t + FADE);
      bed.stopAt = t + FADE;
      bed.loops.forEach(function (v) { A.synth.releaseVoice(v, t + FADE); });
    };
    bed.dispose = function () {
      bed.lfos.forEach(function (l) { try { l.stop(); } catch (e) { /* stopped */ } });
      bed.nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { /* done */ } });
    };
    return bed;
  }

  /**
   * Sets an ambience bed's level (0..1; default 1). 0 fades it out over 1 s and stops it. Calls
   * before the audio unlocks are remembered.
   * @param {string} id a bed (city, birds, crickets, rain, wind, fog, casino, bar, fryer, office, campus, park)
   * @param {number} [level]
   */
  function ambience(id, level) {
    if (!BEDS[id]) { SR.util.warnOnce('audio.bed.' + id, 'SR.audio.ambience: no bed "' + id + '"'); return; }
    var lv = num(level) ? Math.max(0, Math.min(1, level)) : 1;
    if (lv > 0) B.want[id] = lv; else delete B.want[id];
    var E = A.engine && A.engine.live ? A.engine.live() : null;
    if (!E) return;
    var now = E.ac.currentTime;
    var bed = B.live[id];
    if (lv === 0) {
      if (bed) { bed.stop(now); }
      return;
    }
    if (bed && bed.stopAt === null) { bed.setLevel(lv, now); return; }
    if (bed) B.dying.push(bed);
    B.live[id] = start(E, id, lv, { live: true });
  }

  /** The engine's tick: schedule events, retire stopped beds. */
  function tick(E, now) {
    Object.keys(B.live).forEach(function (id) {
      var bed = B.live[id];
      if (bed.stopAt !== null && now > bed.stopAt + 1) { bed.dispose(); delete B.live[id]; return; }
      bed.pump(now + LOOKAHEAD);
    });
    B.dying = B.dying.filter(function (bed) {
      if (now > bed.stopAt + 1) { bed.dispose(); return false; }
      return true;
    });
  }

  /** Starts the beds asked for while the audio was locked. */
  function onUnlock() {
    Object.keys(B.want).forEach(function (id) { if (!B.live[id]) ambience(id, B.want[id]); });
  }

  /** A bed on an offline environment (renderOffline 'ambience'). */
  function offline(E, id, o) {
    return start(E, id, num(o.level) ? o.level : 1, { at: 0, rng: o.rng, min: num(o.min) ? o.min : 720 });
  }

  /** @returns {object} { id: level } of the playing beds. */
  function status() {
    var out = {};
    Object.keys(B.live).forEach(function (id) { if (B.live[id].stopAt === null) out[id] = B.live[id].level; });
    return out;
  }

  ambience.BEDS = BEDS;
  ambience.list = function () { return Object.keys(BEDS); };
  /** Overrides the clock (minutes of the day) for day / night choices; no argument clears it. */
  ambience.time = function (min) { B.clock = num(min) ? min : null; };
  ambience.isDay = isDay;
  ambience.tick = tick;
  ambience.onUnlock = onUnlock;
  ambience.offline = offline;
  ambience.status = status;
  A.ambience = ambience;
})();
