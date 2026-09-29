// js/audio/music.js — owner: W1-S. The tracker (ARCHITECTURE §12; ART_AUDIO §13.4, §13.8):
// - the step-string parser and the format validator SR.audio.validate(kind, def) for songs and sfx
//   recipes (CONTRACT §14.2-§14.3, D19-D21, D31), pure and Node-loadable;
// - SR.audio.tracker: compile (a song def + variant → per-step events), the sequencer (exact step
//   times: pattern start + step × step length, so tempo never drifts), the leitmotif reader and
//   song lengths, also pure;
// - the player: SR.audio.music(id, { fade, variant }), SR.audio.stinger(id): channels scheduled
//   120 ms ahead on the context clock by the engine's 25 ms tick, 1.2 s cross-fades, the rain-style
//   variant switch on the next bar line, resume at the old position after an overlay, stingers on
//   the music bus above the duck (they duck the song 6 dB instead).
// Load-time clean (tools/validate.cjs and tests/node/music.test.cjs load it in Node): the audio API
// is touched only inside the player functions, which run after the engine unlocked a context.
(function () {
  'use strict';
  var SR = window.SR;
  var A = SR.audio;
  var hasOwn = Object.prototype.hasOwnProperty;

  var LOOKAHEAD = 0.12;       // ARCHITECTURE §12: schedule 120 ms ahead
  var LATE = 0.03;            // a step more than 30 ms late (a throttled tab) is skipped, never shifted
  var FADE = 1.2;             // ARCHITECTURE §12: cross-fade 1.2 s
  var START_DELAY = 0.05;     // a new song's first step, after the call
  var RESUME_WINDOW = 180;    // s of context time a stopped song remembers its position (overlays)
  var TAIL = 1.0;             // s a fading channel is kept after its fade (the longest release)
  var STINGER_DUCK_DB = 6;    // ART_AUDIO §13.7: the song ducks 6 dB under stingers
  var STINGER_TAIL = 0.3;     // s the duck outlasts a stinger (its last notes' release)
  var PRIORITY_MUSIC = 2.5;   // above UI (2) and world one-shots (1), below stingers and the stamp (3)
  var PRIORITY_STINGER = 3;

  // ---- the format (CONTRACT §14.2) ----

  var PRESETS = ['bass', 'slap', 'lead', 'whistle', 'keys', 'clav', 'pluck', 'pad', 'brass', 'bell', 'vibes',
    'organ', 'harmonica', 'kit'];
  var DRUMS = 'kshocbrzt';
  var VEL = { '': 0.75, '!': 1.0, '?': 0.4 };
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var NOTE_RE = /^([A-G])([#b]?)(-1|\d)$/;
  var PITCHED_RE = /^(\[[^\]]*\]|[A-G][#b]?(?:-1|\d))(?::(\d+))?([!?]?)$/;
  var DRUM_RE = /^([kshocbrzt])([!?]?)$/;
  var MOTIF = [0, 4, 7, 9, 7];                  // ART_AUDIO §13.3: 1-3-5-6-5
  var MIDI_MIN = 12, MIDI_MAX = 108, LEN_MAX = 256;

  var SONG_KEYS = ['id', 'bpm', 'swing', 'meter', 'stepsPerBeat', 'key', 'scale', 'gain', 'inst', 'patterns',
    'order', 'loopFrom', 'variants', 'motif'];
  var PATTERN_KEYS = ['bars', 'tracks', 'bpm'];
  var INST_KEYS = ['preset', 'gain', 'pan'];
  var SFX_KEYS = ['id', 'bus', 'gain', 'priority', 'caption', 'layers', 'vary', 'loop'];
  var LAYER_KEYS = ['osc', 'duty', 'noise', 'pluck', 'fm', 'freq', 'at', 'sweep', 'filter', 'env', 'start', 'dur', 'gain'];
  var BUSES = ['music', 'sfx', 'ambience', 'ui', 'voice'];
  var OSC = ['sine', 'square', 'saw', 'triangle', 'pulse'];
  var FILTERS = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function between(v, lo, hi) { return num(v) && v >= lo && v <= hi; }
  function isInt(v) { return num(v) && Math.floor(v) === v; }

  /** @returns {string[]} the step tokens of a track string ('|' separates bars and is ignored). */
  function tokenize(str) {
    var s = String(str).replace(/\|/g, ' ');
    var out = [], i = 0, n = s.length;
    while (i < n) {
      if (/\s/.test(s[i])) { i++; continue; }
      var j = i;
      if (s[i] === '[') { var k = s.indexOf(']', i); j = k < 0 ? n : k + 1; }
      while (j < n && !/\s/.test(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
    }
    return out;
  }

  /** @returns {number|null} the MIDI number of 'C#4' (scientific pitch: C4 = 60), or null. */
  function midiOf(name) {
    var m = NOTE_RE.exec(name);
    if (!m) return null;
    return (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  /**
   * Parses one token.
   * @returns {object} { kind: 'rest'|'off'|'again'|'note'|'hit', notes, len, vel, drum } or { error }
   */
  function parseToken(tok, kit) {
    if (tok === '.') return { kind: 'rest' };
    if (tok === '-') return { kind: 'off' };
    if (tok === '!' || tok === '?') return { kind: 'again', vel: VEL[tok] };
    var m;
    if (kit) {
      m = DRUM_RE.exec(tok);
      if (!m) return { error: 'bad drum token "' + tok + '"' };
      return { kind: 'hit', drum: m[1], vel: VEL[m[2]] };
    }
    m = PITCHED_RE.exec(tok);
    if (!m) return { error: 'bad note token "' + tok + '"' };
    var names = m[1].charAt(0) === '[' ? m[1].slice(1, -1).trim().split(/\s+/) : [m[1]];
    var notes = [];
    for (var i = 0; i < names.length; i++) {
      var mi = midiOf(names[i]);
      if (mi === null) return { error: 'bad note "' + names[i] + '" in "' + tok + '"' };
      if (mi < MIDI_MIN || mi > MIDI_MAX) return { error: 'note "' + names[i] + '" out of range (C0-C8)' };
      notes.push(mi);
    }
    if (!notes.length || names[0] === '') return { error: 'empty chord "' + tok + '"' };
    var len = m[2] === undefined ? 1 : Number(m[2]);
    if (!(len >= 1 && len <= LEN_MAX)) return { error: 'bad length in "' + tok + '"' };
    return { kind: 'note', notes: notes, len: len, vel: VEL[m[3] || ''] };
  }

  /**
   * Parses a track string into per-step events.
   * @returns {{count: number, ev: Array, on: boolean[], errors: string[]}}
   */
  function parseTrack(str, kit) {
    var toks = tokenize(str);
    var ev = new Array(toks.length), on = new Array(toks.length), errors = [];
    for (var i = 0; i < toks.length; i++) {
      var p = parseToken(toks[i], kit);
      on[i] = false;
      ev[i] = null;
      if (p.error) { errors.push('step ' + i + ': ' + p.error); continue; }
      if (p.kind === 'rest') continue;
      if (p.kind === 'off') { on[i] = true; continue; }
      ev[i] = p;
      on[i] = true;
    }
    return { count: toks.length, ev: ev, on: on, errors: errors };
  }

  function stepsPerBar(def) {
    var meter = Array.isArray(def.meter) ? def.meter : [4, 4];
    return meter[0] * (def.stepsPerBeat || 4);
  }

  function presetOf(def, variant, track) {
    var v = variant && def.variants && def.variants[variant];
    var o = v && v.inst && v.inst[track];
    if (o && o.preset) return o.preset;
    return def.inst && def.inst[track] ? def.inst[track].preset : null;
  }

  // ---- the validator (D31) ----

  function unknownKeys(obj, allowed, where, out) {
    Object.keys(obj).forEach(function (k) { if (allowed.indexOf(k) < 0) out.push(where + ': unknown field "' + k + '"'); });
  }

  /** Checks one track string of a pattern (token count and tokens). */
  function checkTrack(str, kit, want, where, out) {
    if (typeof str !== 'string') { out.push(where + ': not a string'); return; }
    var p = parseTrack(str, kit);
    if (p.count !== want) out.push(where + ': ' + p.count + ' steps, want ' + want);
    p.errors.forEach(function (e) { out.push(where + ': ' + e); });
  }

  function checkInst(o, where, out, partial) {
    if (!isObj(o)) { out.push(where + ': not an object'); return; }
    unknownKeys(o, INST_KEYS, where, out);
    if (!partial || o.preset !== undefined) {
      if (PRESETS.indexOf(o.preset) < 0) out.push(where + ': unknown preset "' + o.preset + '"');
    }
    if (o.gain !== undefined && !between(o.gain, 0, 1)) out.push(where + ': gain must be 0..1');
    if (o.pan !== undefined && !between(o.pan, -1, 1)) out.push(where + ': pan must be -1..1');
  }

  /**
   * The five note onsets from a motif annotation (the top note of a chord), following the order
   * into the next pattern when the phrase crosses a pattern boundary.
   * @returns {number[]} MIDI notes (fewer than 5 when the phrase ends first)
   */
  function motifNotes(def, ann, variant) {
    var out = [];
    var order = def.order || [];
    var pname = ann.pattern, step = ann.step;
    var oi = order.indexOf(pname);
    var guard = 0, last = null;
    while (out.length < MOTIF.length && pname && guard++ < 64) {
      var P = def.patterns[pname];
      var str = P && P.tracks && P.tracks[ann.track];
      var vs = variant && def.variants && def.variants[variant];
      if (vs && vs.tracks && vs.tracks[ann.track] && vs.tracks[ann.track][pname]) str = vs.tracks[ann.track][pname];
      if (typeof str === 'string') {
        var tr = parseTrack(str, false);
        for (var s = step; s < tr.count && out.length < MOTIF.length; s++) {
          var e = tr.ev[s];
          if (!e) continue;
          if (e.kind === 'note') { last = Math.max.apply(null, e.notes); out.push(last); }
          else if (e.kind === 'again' && last !== null) out.push(last);
        }
      }
      if (oi < 0) break;
      oi++;
      if (oi >= order.length) {
        if (!isInt(def.loopFrom)) break;
        oi = def.loopFrom;
      }
      pname = order[oi];
      step = 0;
    }
    return out;
  }

  /** @returns {boolean} the notes read the leitmotif's intervals 0, +4, +7, +9, +7. */
  function isMotif(notes) {
    if (!notes || notes.length < MOTIF.length) return false;
    for (var i = 0; i < MOTIF.length; i++) if (notes[i] - notes[0] !== MOTIF[i]) return false;
    return true;
  }

  function validateSong(def) {
    var out = [];
    if (!isObj(def)) return ['song: not an object'];
    var name = 'song "' + (def.id || '?') + '"';
    unknownKeys(def, SONG_KEYS, name, out);
    if (!between(def.bpm, 20, 300)) out.push(name + ': bpm must be a number 20..300');
    if (def.swing !== undefined && !between(def.swing, 0, 0.5)) out.push(name + ': swing must be 0..0.5');
    if (!Array.isArray(def.meter) || def.meter.length !== 2 || !isInt(def.meter[0]) || !isInt(def.meter[1]) ||
        def.meter[0] < 1 || def.meter[0] > 16 || def.meter[1] < 1) {
      out.push(name + ': meter must be [beats, unit] with 1..16 beats');
    }
    if (!isInt(def.stepsPerBeat) || def.stepsPerBeat < 1 || def.stepsPerBeat > 16) out.push(name + ': stepsPerBeat must be an integer 1..16');
    if (def.key !== undefined && typeof def.key !== 'string') out.push(name + ': key must be a string');
    if (def.scale !== undefined && typeof def.scale !== 'string') out.push(name + ': scale must be a string');
    if (def.gain !== undefined && !between(def.gain, 0, 1)) out.push(name + ': gain must be 0..1');
    if (!isObj(def.inst) || !Object.keys(def.inst).length) out.push(name + ': inst must name at least one track');
    else Object.keys(def.inst).forEach(function (t) { checkInst(def.inst[t], name + ' inst "' + t + '"', out, false); });
    var inst = isObj(def.inst) ? def.inst : {};
    var spbar = Array.isArray(def.meter) && isInt(def.stepsPerBeat) ? def.meter[0] * def.stepsPerBeat : 16;
    var isKit = function (t) { return inst[t] && inst[t].preset === 'kit'; };
    if (!isObj(def.patterns) || !Object.keys(def.patterns).length) out.push(name + ': patterns must name at least one pattern');
    var pats = isObj(def.patterns) ? def.patterns : {};
    Object.keys(pats).forEach(function (pn) {
      var P = pats[pn], where = name + ' pattern "' + pn + '"';
      if (!isObj(P)) { out.push(where + ': not an object'); return; }
      unknownKeys(P, PATTERN_KEYS, where, out);
      if (!isInt(P.bars) || P.bars < 1) { out.push(where + ': bars must be an integer ≥ 1'); return; }
      if (P.bpm !== undefined && !between(P.bpm, 20, 300)) out.push(where + ': bpm must be a number 20..300');
      if (!isObj(P.tracks) || !Object.keys(P.tracks).length) { out.push(where + ': tracks must name at least one track'); return; }
      Object.keys(P.tracks).forEach(function (t) {
        if (!hasOwn.call(inst, t)) { out.push(where + ' track "' + t + '": not in inst'); return; }
        checkTrack(P.tracks[t], isKit(t), P.bars * spbar, where + ' track "' + t + '"', out);
      });
    });
    if (!Array.isArray(def.order) || !def.order.length) out.push(name + ': order must list at least one pattern');
    else def.order.forEach(function (pn, i) { if (!hasOwn.call(pats, pn)) out.push(name + ': order[' + i + '] "' + pn + '" is not a pattern'); });
    var orderLen = Array.isArray(def.order) ? def.order.length : 0;
    if (def.loopFrom !== undefined && !(isInt(def.loopFrom) && def.loopFrom >= 0 && def.loopFrom < orderLen)) {
      out.push(name + ': loopFrom must be an index into order');
    }
    if (typeof def.id === 'string' && def.id.indexOf('stingers.') === 0) {
      if (orderLen !== 1) out.push(name + ': a stinger has an order of exactly one pattern');
      if (def.loopFrom !== undefined) out.push(name + ': a stinger has no loopFrom');
    }
    if (def.variants !== undefined) {
      if (!isObj(def.variants)) out.push(name + ': variants must be an object');
      else Object.keys(def.variants).forEach(function (vn) {
        var V = def.variants[vn], where = name + ' variant "' + vn + '"';
        if (!isObj(V)) { out.push(where + ': not an object'); return; }
        unknownKeys(V, ['tracks', 'inst'], where, out);
        if (V.inst !== undefined) {
          if (!isObj(V.inst)) out.push(where + ': inst must be an object');
          else Object.keys(V.inst).forEach(function (t) {
            if (!hasOwn.call(inst, t)) out.push(where + ' inst "' + t + '": not in inst');
            else checkInst(V.inst[t], where + ' inst "' + t + '"', out, true);
          });
        }
        if (V.tracks !== undefined) {
          if (!isObj(V.tracks)) { out.push(where + ': tracks must be an object'); return; }
          Object.keys(V.tracks).forEach(function (t) {
            if (!hasOwn.call(inst, t)) { out.push(where + ' track "' + t + '": not in inst'); return; }
            if (!isObj(V.tracks[t])) { out.push(where + ' track "' + t + '": must map patterns to step strings'); return; }
            var kit = (presetOf(def, vn, t)) === 'kit';
            Object.keys(V.tracks[t]).forEach(function (pn) {
              if (!hasOwn.call(pats, pn) || !isObj(pats[pn]) || !isInt(pats[pn].bars)) { out.push(where + ' track "' + t + '": "' + pn + '" is not a pattern'); return; }
              checkTrack(V.tracks[t][pn], kit, pats[pn].bars * spbar, where + ' track "' + t + '" pattern "' + pn + '"', out);
            });
          });
        }
      });
    }
    if (def.motif !== undefined) {
      if (!Array.isArray(def.motif)) out.push(name + ': motif must be a list of { pattern, track, step }');
      else def.motif.forEach(function (m, i) {
        var where = name + ' motif[' + i + ']';
        if (!isObj(m)) { out.push(where + ': not an object'); return; }
        unknownKeys(m, ['pattern', 'track', 'step'], where, out);
        var P = pats[m.pattern];
        if (!isObj(P) || !isObj(P.tracks) || typeof P.tracks[m.track] !== 'string') { out.push(where + ': no track "' + m.track + '" in pattern "' + m.pattern + '"'); return; }
        if (isKit(m.track)) { out.push(where + ': the motif is on a drum track'); return; }
        var tr = parseTrack(P.tracks[m.track], false);
        if (!isInt(m.step) || m.step < 0 || m.step >= tr.count) { out.push(where + ': step out of range'); return; }
        var e = tr.ev[m.step];
        if (!e || e.kind !== 'note') { out.push(where + ': no note starts at step ' + m.step); return; }
        var notes = motifNotes(def, m);
        if (!isMotif(notes)) {
          out.push(where + ': the leitmotif (0, +4, +7, +9, +7) is not there (reads ' +
            notes.map(function (x) { return x - notes[0]; }).join(', ') + ')');
        }
      });
    }
    return out;
  }

  function checkFreqPlan(L, where, out) {
    var hasF = L.freq !== undefined, hasS = L.sweep !== undefined;
    if (hasF && hasS) out.push(where + ': give freq or sweep, not both');
    if (!hasF && !hasS) out.push(where + ': a tonal source needs freq or sweep');
    if (hasF) {
      if (Array.isArray(L.freq)) {
        if (!L.freq.length || !L.freq.every(function (f) { return between(f, 1, 20000); })) out.push(where + ': freq list must hold 1..20000 Hz');
        if (!Array.isArray(L.at) || L.at.length !== L.freq.length) out.push(where + ': at must list one offset per freq');
        else {
          for (var i = 0; i < L.at.length; i++) {
            if (!between(L.at[i], 0, 60) || (i && L.at[i] < L.at[i - 1])) { out.push(where + ': at must be ascending offsets ≥ 0 (s)'); break; }
          }
        }
      } else if (!between(L.freq, 1, 20000)) out.push(where + ': freq must be 1..20000 Hz');
    }
    if (!Array.isArray(L.freq) && L.at !== undefined) out.push(where + ': at needs a freq list');
    if (hasS) checkSweep(L.sweep, where + ' sweep', out, 1, 20000);
  }

  function checkSweep(sw, where, out, lo, hi) {
    if (!Array.isArray(sw) || sw.length !== 4 || !between(sw[0], lo, hi) || !between(sw[1], lo, hi) ||
        !between(sw[2], 0.001, 60) || (sw[3] !== 'exp' && sw[3] !== 'lin')) {
      out.push(where + ': must be [from, to, seconds, \'exp\'|\'lin\'] with ' + lo + '..' + hi + ' Hz');
    }
  }

  function validateSfx(def) {
    var out = [];
    if (!isObj(def)) return ['sfx: not an object'];
    var name = 'sfx "' + (def.id || '?') + '"';
    unknownKeys(def, SFX_KEYS, name, out);
    if (def.bus !== undefined && BUSES.indexOf(def.bus) < 0) out.push(name + ': bus must be one of ' + BUSES.join(', '));
    if (def.gain !== undefined && !between(def.gain, 0, 1)) out.push(name + ': gain must be 0..1');
    if (def.priority !== undefined && !(isInt(def.priority) && def.priority >= 0 && def.priority <= 3)) out.push(name + ': priority must be 0..3');
    if (def.caption !== undefined && def.caption !== null && !(typeof def.caption === 'string' && /^cap\.[A-Za-z0-9_.]+$/.test(def.caption))) {
      out.push(name + ': caption must be a cap.* text key or null');
    }
    if (def.loop !== undefined && typeof def.loop !== 'boolean') out.push(name + ': loop must be true or false');
    if (def.vary !== undefined) {
      if (!isObj(def.vary)) out.push(name + ': vary must be { pitch, gain }');
      else {
        unknownKeys(def.vary, ['pitch', 'gain'], name + ' vary', out);
        if (def.vary.pitch !== undefined && !between(def.vary.pitch, 0, 0.5)) out.push(name + ': vary.pitch must be 0..0.5');
        if (def.vary.gain !== undefined && !between(def.vary.gain, 0, 0.5)) out.push(name + ': vary.gain must be 0..0.5');
      }
    }
    if (!Array.isArray(def.layers) || !def.layers.length) { out.push(name + ': layers must list at least one layer'); return out; }
    def.layers.forEach(function (L, i) {
      var where = name + ' layer ' + i;
      if (!isObj(L)) { out.push(where + ': not an object'); return; }
      unknownKeys(L, LAYER_KEYS, where, out);
      var srcs = ['osc', 'noise', 'pluck', 'fm'].filter(function (k) { return L[k] !== undefined; });
      if (srcs.length !== 1) { out.push(where + ': exactly one source (osc, noise, pluck or fm), found ' + (srcs.join(', ') || 'none')); return; }
      var src = srcs[0];
      if (src === 'osc') {
        if (OSC.indexOf(L.osc) < 0) out.push(where + ': osc must be one of ' + OSC.join(', '));
        if (L.duty !== undefined && (L.osc !== 'pulse' || !between(L.duty, 0, 1))) out.push(where + ': duty (0..1) is for pulse only');
        checkFreqPlan(L, where, out);
      } else if (src === 'noise') {
        if (L.noise !== 'white' && L.noise !== 'pink') out.push(where + ': noise must be white or pink');
        if (L.freq !== undefined || L.sweep !== undefined || L.at !== undefined) out.push(where + ': noise takes no freq, at or sweep (use a filter)');
        if (L.duty !== undefined) out.push(where + ': duty is for pulse only');
      } else if (src === 'pluck') {
        if (L.pluck !== true) out.push(where + ': pluck must be true');
        if (L.duty !== undefined) out.push(where + ': duty is for pulse only');
        checkFreqPlan(L, where, out);
      } else {
        var fm = L.fm;
        if (!isObj(fm)) out.push(where + ': fm must be { carrier, ratio, index, indexDecay }');
        else {
          unknownKeys(fm, ['carrier', 'ratio', 'index', 'indexDecay'], where + ' fm', out);
          if (fm.carrier !== undefined && OSC.indexOf(fm.carrier) < 0) out.push(where + ': fm.carrier must be an osc type');
          if (!between(fm.ratio, 0.01, 64)) out.push(where + ': fm.ratio must be 0.01..64');
          if (!between(fm.index, 0, 100)) out.push(where + ': fm.index must be 0..100');
          if (fm.indexDecay !== undefined && !between(fm.indexDecay, 0.001, 60)) out.push(where + ': fm.indexDecay must be a time constant in s');
        }
        if (L.duty !== undefined && !(fm && fm.carrier === 'pulse')) out.push(where + ': duty is for a pulse carrier only');
        checkFreqPlan(L, where, out);
      }
      if (L.filter !== undefined) {
        var F = L.filter;
        if (!isObj(F)) out.push(where + ': filter must be { type, freq, q, sweep }');
        else {
          unknownKeys(F, ['type', 'freq', 'q', 'sweep'], where + ' filter', out);
          if (FILTERS.indexOf(F.type) < 0) out.push(where + ': filter.type must be a BiquadFilterNode type');
          if (F.sweep !== undefined) checkSweep(F.sweep, where + ' filter.sweep', out, 1, 22000);
          else if (!between(F.freq, 1, 22000)) out.push(where + ': filter.freq must be 1..22000 Hz');
          if (F.q !== undefined && !between(F.q, 0, 1000)) out.push(where + ': filter.q must be 0..1000');
        }
      }
      var e = L.env;
      if (!isObj(e)) out.push(where + ': env { a, d, s, r } is required');
      else {
        unknownKeys(e, ['a', 'd', 's', 'r'], where + ' env', out);
        if (!between(e.a, 0.005, 60)) out.push(where + ': env.a must be ≥ 0.005 s (no clicks)');
        if (!between(e.d, 0, 60)) out.push(where + ': env.d must be ≥ 0 s');
        if (!between(e.s, 0, 1)) out.push(where + ': env.s must be 0..1');
        if (!between(e.r, 0, 60)) out.push(where + ': env.r must be ≥ 0 s');
        if (def.loop && !(e.s > 0)) out.push(where + ': a loop layer needs a sustain (env.s > 0)');
      }
      if (!def.loop && !between(L.dur, 0.001, 60)) out.push(where + ': dur (the gate, s) is required on a one-shot');
      if (L.start !== undefined && !between(L.start, 0, 60)) out.push(where + ': start must be ≥ 0 s');
      if (L.gain !== undefined && !between(L.gain, 0, 1)) out.push(where + ': gain must be 0..1');
    });
    return out;
  }

  /**
   * The format validator (D31): the problems of a song or sfx def, empty when valid.
   * @param {string} kind 'song' | 'sfx'
   * @param {object} def the def (its id, when registered, names it in the messages)
   * @returns {string[]}
   */
  function validate(kind, def) {
    if (kind === 'song') return validateSong(def);
    if (kind === 'sfx') return validateSfx(def);
    return ['SR.audio.validate: unknown kind "' + kind + '" (song | sfx)'];
  }

  // ---- compile and sequence ----

  var compiled = typeof WeakMap === 'function' ? new WeakMap() : null;

  /**
   * Compiles a song (and a variant) into per-step events; cached per def.
   * @returns {object} { id, spb, stepsPerBar, swing, patterns: {name: {steps, dur, tracks: {t: {ev, on}}}},
   *   order, loopFrom, inst, gain, once (s, one pass of the order) }
   */
  function compile(def, variant) {
    var key = variant || '';
    var cc = compiled && compiled.get(def);
    if (cc && cc[key]) return cc[key];
    var V = variant && def.variants && def.variants[variant] ? def.variants[variant] : null;
    var spb = def.stepsPerBeat || 4;
    var spbar = stepsPerBar(def);
    var inst = {};
    Object.keys(def.inst || {}).forEach(function (t) {
      inst[t] = Object.assign({ gain: 1, pan: 0 }, def.inst[t], V && V.inst && V.inst[t] ? V.inst[t] : {});
    });
    var patterns = {};
    Object.keys(def.patterns || {}).forEach(function (pn) {
      var P = def.patterns[pn];
      var bpm = P.bpm || def.bpm;
      var steps = P.bars * spbar;
      var tracks = {};
      var names = Object.keys(P.tracks || {});
      if (V && V.tracks) Object.keys(V.tracks).forEach(function (t) { if (V.tracks[t][pn] && names.indexOf(t) < 0) names.push(t); });
      names.forEach(function (t) {
        if (!inst[t]) return;
        var str = V && V.tracks && V.tracks[t] && V.tracks[t][pn] ? V.tracks[t][pn] : P.tracks[t];
        var tr = parseTrack(str, inst[t].preset === 'kit');
        tr.ev.length = steps;
        tr.on.length = steps;
        tracks[t] = { ev: tr.ev, on: tr.on, kit: inst[t].preset === 'kit' };
      });
      patterns[pn] = { name: pn, steps: steps, bars: P.bars, bpm: bpm, dur: 60 / bpm / spb, tracks: tracks };
    });
    var once = 0;
    (def.order || []).forEach(function (pn) { var P = patterns[pn]; if (P) once += P.steps * P.dur; });
    var out = { id: def.id, def: def, variant: variant || null, spb: spb, stepsPerBar: spbar,
      swing: spb % 2 === 0 ? (def.swing || 0) : 0, patterns: patterns, order: (def.order || []).slice(),
      loopFrom: isInt(def.loopFrom) ? def.loopFrom : null, inst: inst, gain: def.gain === undefined ? 1 : def.gain, once: once };
    if (compiled) { if (!cc) { cc = {}; compiled.set(def, cc); } cc[key] = out; }
    return out;
  }

  /** @returns {number} the time offset of a step inside its pattern (swing delays every second step). */
  function offsetOf(C, P, step) {
    return step * P.dur + (C.swing && step % 2 === 1 ? C.swing * P.dur : 0);
  }

  /**
   * A sequencer over a compiled song: advance(until, emit, late) emits every step event whose time
   * is < until, in order. Step times are computed from the pattern's start (never accumulated per
   * step), so the tempo holds exactly. Events: { kind: 'note', track, time, end, notes, vel } |
   * { kind: 'hit', track, time, drum, vel } | { kind: 'variant', time, C }. Steps earlier than
   * `late` are skipped (their events are dropped, the grid is kept).
   * @param {object} C compile() result
   * @param {object} o { start: time of the first step, pos: { order, step } to start from }
   */
  function sequencer(C, o) {
    o = o || {};
    var S = { C: C, oi: 0, step: 0, patStart: o.start || 0, done: false, loops: 0, last: {}, pendingC: null,
      skipped: 0, emitted: 0, endTime: null };
    function pat(oi) { return S.C.patterns[S.C.order[oi]]; }
    if (!C.order.length || !pat(0)) { S.done = true; S.endTime = S.patStart; }
    if (o.pos && !S.done) {
      S.oi = Math.max(0, Math.min(C.order.length - 1, o.pos.order | 0));
      var P0 = pat(S.oi);
      S.step = Math.max(0, Math.min(P0.steps - 1, o.pos.step | 0));
      S.patStart = (o.start || 0) - offsetOf(C, P0, S.step);
    }
    function nextOi(oi) {
      if (oi + 1 < S.C.order.length) return oi + 1;
      return S.C.loopFrom !== null ? S.C.loopFrom : -1;
    }
    /** The time a note starting now ends: its length, a '-' or the track's next note, or the song's end. */
    function noteEnd(track, len) {
      var oi = S.oi, st = S.step, ps = S.patStart, P = pat(oi);
      for (var k = 0; k < len; k++) {
        st++;
        if (st >= P.steps) {
          ps += P.steps * P.dur;
          oi = nextOi(oi);
          st = 0;
          if (oi < 0) return ps;
          P = pat(oi);
        }
        var tr = P.tracks[track];
        if (tr && tr.on[st]) return ps + offsetOf(S.C, P, st);
      }
      return ps + offsetOf(S.C, P, st);
    }
    function stepEvents(P, t, emit, skip) {
      var names = Object.keys(P.tracks);
      for (var i = 0; i < names.length; i++) {
        var name = names[i], tr = P.tracks[name], e = tr.ev[S.step];
        if (!e) continue;
        if (e.kind === 'again') {
          var prev = S.last[name];
          if (!prev) continue;
          e = prev.kind === 'hit' ? { kind: 'hit', drum: prev.drum, vel: e.vel } : { kind: 'note', notes: prev.notes, len: prev.len, vel: e.vel };
        } else {
          S.last[name] = e;
        }
        if (skip) continue;
        S.emitted++;
        if (e.kind === 'hit') emit({ kind: 'hit', track: name, time: t, drum: e.drum, vel: e.vel });
        else emit({ kind: 'note', track: name, time: t, end: noteEnd(name, e.len), notes: e.notes, vel: e.vel });
      }
    }
    S.position = function () { return { order: S.oi, step: S.step }; };
    /** The time of the next step to schedule (null when the song ended). */
    S.nextTime = function () { return S.done ? null : S.patStart + offsetOf(S.C, pat(S.oi), S.step); };
    /** Switches to another compile of the same song (a variant) at the next bar line. */
    S.setVariant = function (C2) { S.pendingC = C2; };
    S.advance = function (until, emit, late) {
      var guard = 0;
      while (!S.done && guard++ < 1e6) {
        var P = pat(S.oi);
        var t = S.patStart + offsetOf(S.C, P, S.step);
        if (t >= until) break;
        if (S.pendingC && S.step % S.C.stepsPerBar === 0) {
          S.C = S.pendingC;
          S.pendingC = null;
          P = pat(S.oi);
          emit({ kind: 'variant', time: t, C: S.C });
        }
        var skip = late !== undefined && late !== null && t < late;
        if (skip) S.skipped++;
        stepEvents(P, t, emit, skip);
        S.step++;
        if (S.step >= P.steps) {
          S.patStart += P.steps * P.dur;
          S.step = 0;
          var n = nextOi(S.oi);
          if (n < 0) { S.done = true; S.endTime = S.patStart; }
          else { if (n <= S.oi) S.loops++; S.oi = n; }
        }
      }
    };
    return S;
  }

  /** @returns {number|null} the seconds of one pass of a song's order (null for an unknown id). */
  function lengthOf(id, variant) {
    var def = SR.reg.song && SR.reg.song[id];
    return def ? compile(def, variant).once : null;
  }

  // ---- the player (runs only after the engine unlocked a context) ----

  var M = { cur: null, fading: [], stingers: [], pending: null, resume: {} };

  function engine() { return A.engine || null; }

  /** Builds a channel: the song's out gain and one gain → pan per track, then a sequencer. */
  function channel(E, id, o) {
    var def = SR.reg.song && SR.reg.song[id];
    if (!def) return null;
    var C = compile(def, o.variant);
    var ac = E.ac;
    var out = ac.createGain();
    out.connect(o.dest);
    var ch = { id: id, def: def, C: C, E: E, out: out, nodes: [out], tracks: {}, variant: o.variant || null,
      level: C.gain, stopAt: null, disposeAt: null, stinger: !!o.stinger, start: o.at,
      seq: sequencer(C, { start: o.at, pos: o.pos }) };
    var fade = o.fade || 0;
    if (fade > 0) {
      out.gain.setValueAtTime(0, 0);
      out.gain.setValueAtTime(0, o.at);
      out.gain.linearRampToValueAtTime(ch.level, o.at + fade);
    } else {
      out.gain.setValueAtTime(ch.level, 0);
    }
    ch.track = function (name) {
      var tn = ch.tracks[name];
      if (tn) return tn.g;
      var ins = ch.C.inst[name] || { gain: 1, pan: 0 };
      var g = ac.createGain();
      g.gain.value = ins.gain;
      var last = g;
      var p = null;
      if (typeof ac.createStereoPanner === 'function') {
        p = ac.createStereoPanner();
        p.pan.value = ins.pan || 0;
        g.connect(p);
        last = p;
        ch.nodes.push(p);
      }
      last.connect(out);
      ch.nodes.push(g);
      ch.tracks[name] = { g: g, p: p };
      return g;
    };
    ch.emit = function (ev) {
      var S = A.synth, P = E.pool;
      if (ev.kind === 'variant') {
        if (E.trace) E.trace.push({ song: id, kind: 'variant', variant: ev.C.variant, time: ev.time, at: ac.currentTime });
        ch.C = ev.C;
        Object.keys(ch.tracks).forEach(function (t) {
          var ins = ch.C.inst[t];
          if (!ins) return;
          ch.tracks[t].g.gain.setTargetAtTime(ins.gain, ev.time, 0.05);
          if (ch.tracks[t].p) ch.tracks[t].p.pan.setTargetAtTime(ins.pan || 0, ev.time, 0.05);
        });
        return;
      }
      if (ch.stopAt !== null && ev.time >= ch.stopAt) return;
      var ins = ch.C.inst[ev.track];
      if (!ins || !S) return;
      var dest = ch.track(ev.track);
      var prio = ch.stinger ? PRIORITY_STINGER : PRIORITY_MUSIC;
      if (E.trace) E.trace.push({ song: id, kind: ev.kind, track: ev.track, time: ev.time, at: ac.currentTime });
      if (ev.kind === 'hit') {
        P.add(S.drum(E, dest, ev.drum, ev.time, ev.vel, prio), ev.time);
      } else {
        // A chord is one voice: its notes share the preset's filter and envelope.
        P.add(S.note(E, dest, ins.preset, ev.notes, ev.time, Math.max(0.01, ev.end - ev.time), ev.vel, prio), ev.time);
      }
    };
    ch.pump = function (until, late) {
      if (ch.stopAt !== null) until = Math.min(until, ch.stopAt);
      ch.seq.advance(until, ch.emit, late);
    };
    /** Fades out from t over f seconds; events after the fade are not scheduled. */
    ch.fadeOut = function (t, f) {
      // Hold the current value (t is now), then ramp. (cancelAndHoldAtTime is not used: Chrome
      // starts the next ramp from the event before the hold when that event is a setValueAtTime.)
      var g = ch.out.gain, cur = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(0, t + Math.max(0.01, f));
      ch.stopAt = t + Math.max(0.01, f);
      ch.disposeAt = ch.stopAt + TAIL;
    };
    ch.dispose = function () {
      ch.nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { /* done */ } });
      ch.nodes.length = 0;
    };
    /** The channel's current fade gain (0..1 of its level), for tests and the sheet. */
    ch.gain = function () { return ch.level > 0 ? ch.out.gain.value / ch.level : 0; };
    return ch;
  }

  /** Remembers a stopping channel's position so the song resumes there after an overlay. */
  function remember(ch, now) {
    if (!ch || ch.stinger || ch.seq.done) return;
    M.resume[ch.id] = { pos: ch.seq.position(), at: now, variant: ch.variant };
  }

  function stopCurrent(now, fade) {
    if (!M.cur) return;
    remember(M.cur, now);
    M.cur.fadeOut(now, fade);
    M.fading.push(M.cur);
    M.cur = null;
  }

  /**
   * Plays a song (cross-fading from the current one), switches the playing song's variant on the
   * next bar line, or fades out with a falsy id. While the context is not running (locked, a hidden
   * tab, a system interruption) the last request, a stop included, waits and applies when it runs.
   * @param {string|null} id a song id
   * @param {object} [o] { fade: seconds (default 1.2), variant: name }
   */
  function music(id, o) {
    o = o || {};
    var eng = engine();
    var E = eng && eng.live ? eng.live() : null;
    if (!E) { M.pending = { id: id || null, o: o }; return; }
    M.pending = null;
    var now = E.ac.currentTime;
    var fade = o.fade === undefined ? FADE : Math.max(0, Number(o.fade) || 0);
    if (!id) { stopCurrent(now, fade); return; }
    if (!SR.reg.song || !SR.reg.song[id]) {
      SR.util.warnOnce('audio.song.' + id, 'SR.audio.music: no song "' + id + '"');
      stopCurrent(now, fade);
      return;
    }
    var variant = o.variant || null;
    if (M.cur && M.cur.id === id) {
      if (variant !== M.cur.variant) {
        M.cur.variant = variant;
        M.cur.seq.setVariant(compile(M.cur.def, variant));
      }
      return;
    }
    var mem = M.resume[id];
    var pos = mem && now - mem.at <= RESUME_WINDOW ? mem.pos : null;
    delete M.resume[id];
    stopCurrent(now, fade);
    var at = now + START_DELAY;
    M.cur = channel(E, id, { at: at, pos: pos, variant: variant, dest: E.graph.songs, fade: fade });
    M.cur.pump(now + LOOKAHEAD);
  }

  /** @returns {string|null} the registered id a stinger name means ('promotion' → 'stingers.promotion'). */
  function stingerId(id) {
    if (!id) return null;
    var reg = SR.reg.song || {};
    if (hasOwn.call(reg, id)) return id;
    if (String(id).indexOf('stingers.') !== 0 && hasOwn.call(reg, 'stingers.' + id)) return 'stingers.' + id;
    return null;
  }

  /**
   * Plays a stinger once on the music bus, above the duck, and ducks the song 6 dB meanwhile.
   * @param {string} id 'stingers.promotion' or 'promotion'
   * @returns {object|null} { id, stop() } or null (unknown id, audio locked)
   */
  function stinger(id) {
    var sid = stingerId(id);
    if (!sid) { SR.util.warnOnce('audio.stinger.' + id, 'SR.audio.stinger: no stinger "' + id + '"'); return null; }
    var eng = engine();
    var E = eng && eng.live ? eng.live() : null;
    if (!E) return null;
    var now = E.ac.currentTime;
    var ch = channel(E, sid, { at: now + 0.03, dest: E.graph.buses.music, stinger: true, fade: 0 });
    ch.stopAt = now + 0.03 + ch.C.once;
    ch.disposeAt = ch.stopAt + TAIL;
    ch.pump(now + LOOKAHEAD);
    M.stingers.push(ch);
    if (A.duck) A.duck(STINGER_DUCK_DB, (ch.C.once + STINGER_TAIL) * 1000);
    return { id: sid, stop: function () { ch.fadeOut(E.ac.currentTime, 0.05); } };
  }

  /** The engine's 25 ms tick: schedule every channel 120 ms ahead and retire finished ones. */
  function tick(E, now) {
    var until = now + LOOKAHEAD, late = now - LATE;
    if (M.cur) M.cur.pump(until, late);
    M.fading = M.fading.filter(function (ch) {
      if (now >= ch.disposeAt) { ch.dispose(); return false; }
      ch.pump(until, late);
      return true;
    });
    M.stingers = M.stingers.filter(function (ch) {
      if (now >= ch.disposeAt) { ch.dispose(); return false; }
      ch.pump(until, late);
      return true;
    });
    Object.keys(M.resume).forEach(function (k) { if (now - M.resume[k].at > RESUME_WINDOW) delete M.resume[k]; });
  }

  /** Called by the engine each time the context starts running: applies the request that waited. */
  function onUnlock() {
    if (M.pending) { var p = M.pending; M.pending = null; music(p.id, p.o); }
  }

  /** Called by the engine when the live context is replaced or closed. */
  function reset() {
    [M.cur].concat(M.fading, M.stingers).forEach(function (ch) { if (ch) ch.dispose(); });
    M.cur = null; M.fading = []; M.stingers = []; M.resume = {};
  }

  /**
   * Schedules a whole song on an offline environment (renderOffline): returns a pump the renderer
   * calls at each chunk.
   */
  function offline(E, id, o) {
    var ch = channel(E, id, { at: o.at || 0, pos: o.pos || null, variant: o.variant || null,
      dest: o.stinger ? E.graph.buses.music : E.graph.songs, stinger: !!o.stinger, fade: 0 });
    return ch;
  }

  /** @returns {object} what plays now (for SR.audio.stats and the sound sheet). */
  function status() {
    return {
      song: M.cur ? M.cur.id : null,
      variant: M.cur ? M.cur.variant : null,
      start: M.cur ? M.cur.start : null,
      pending: M.pending ? M.pending.id : null,
      gain: M.cur ? M.cur.gain() : 0,
      position: M.cur ? M.cur.seq.position() : null,
      loops: M.cur ? M.cur.seq.loops : 0,
      fading: M.fading.map(function (ch) { return { id: ch.id, gain: ch.gain() }; }),
      stingers: M.stingers.map(function (ch) { return ch.id; }),
      resume: Object.keys(M.resume).reduce(function (o, k) { o[k] = M.resume[k].pos; return o; }, {}),
    };
  }

  A.validate = validate;
  A.music = music;
  A.stinger = stinger;
  A.tracker = {
    LOOKAHEAD: LOOKAHEAD, FADE: FADE, MOTIF: MOTIF, PRESETS: PRESETS, DRUMS: DRUMS, VEL: VEL,
    tokenize: tokenize,
    midiOf: midiOf,
    parseToken: parseToken,
    parseTrack: parseTrack,
    compile: compile,
    sequencer: sequencer,
    offsetOf: offsetOf,
    motifNotes: motifNotes,
    isMotif: isMotif,
    lengthOf: lengthOf,
    stingerId: stingerId,
    channel: channel,
    offline: offline,
    tick: tick,
    onUnlock: onUnlock,
    reset: reset,
    status: status,
  };
})();
