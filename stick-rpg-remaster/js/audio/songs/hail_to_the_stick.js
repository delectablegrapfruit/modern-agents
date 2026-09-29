// js/audio/songs/hail_to_the_stick.js — owner: W2-Music. The campaign and City Hall in office (ART_AUDIO
// §13.4): a march, 116 bpm, B-flat major, sixteenths; a brass-saw tune, brass after-beat chords, a
// tuba-style bass on 1 and 3, a march snare with rolls into each section, a bass drum, and cymbal
// crashes with brushed swells. A (I - V7 - I - IV - I - II7 - V7), A' (its full close), the trio in
// E-flat (the march's quiet middle, as marches do) and A' again; 32 bars (66 s) a loop after a
// two-bar fanfare. The `dictator` variant (the Dictator's office, W2-Civic's campaign screen) plays
// the same march in B-flat minor: every D becomes D-flat and every G becomes G-flat (the V7 keeps its
// A, a harmonic-minor leading tone), built from the major data below. Original music, not the
// ceremonial march of any real office. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of brass after-beats (a chord on each and). */
  function after(ch) { return '. . ' + ch + ' . . . ' + ch + '? . . . ' + ch + ' . . . ' + ch + '? .'; }
  /** @returns {string} one bar of the tuba: root on 1, fifth on 3. */
  function oom(r, f) { return r + ':4 . . . . . . . ' + f + ':4 . . . . . . .'; }
  /** @returns {string} a step string moved from B-flat major to B-flat minor (D → Db, G → Gb). */
  function minor(s) { return s.replace(/([DG])(\d)/g, '$1b$2'); }

  var BB = '[D4 F4 Bb4]', F7 = '[C4 Eb4 A4]', EB = '[Eb4 G4 Bb4]', C7 = '[C4 E4 Bb4]', AB = '[Eb4 Ab4 C5]', BB7 = '[D4 F4 Ab4]';

  var SNARE = 's . . s? s . . . s . . s? s . . .';
  var ROLL = 's . s? s? s s? s? s s? s? s s? s? s s! .';
  var KICK = 'k . . . . . . . k . . . . . . .';
  var CRASH = 'o! . . . . . . . . . . . . . . .';
  var SWELL = '. . . . . . . . b? . b? . b . b! .';
  var QUIET = '. . . . . . . . . . . . . . . .';

  var HORN_A4 = 'F4:3 . . Bb4 D5:4 . . . F5:6 . . . . . D5:2 . | Bb4:8 . . . . . . . - . . . F4:2 . G4:2 . | ' +
    'A4:3 . . C5 Eb5:4 . . . F5:6 . . . . . Eb5:2 . | D5:8 . . . . . . . - . . . . . . .';
  var CHORDS_A4 = [after(BB), after(BB), after(F7), after(BB)].join(' | ');
  var TUBA_A4 = [oom('Bb1', 'F1'), oom('Bb1', 'F1'), oom('F1', 'C2'), oom('Bb1', 'F1')].join(' | ');

  var patterns = {
    intro: { bars: 2, tracks: {
      horn: 'F4:2 . F4 F4 Bb4:4 . . . D5:2 . D5 D5 F5:4 . . . | F5:8 . . . . . . . - . . . . . . .',
      chords: '. . . . . . . . . . . . . . . . | ' + BB + ':8 . . . . . . . - . . . . . . .',
      tuba: 'Bb1:4 . . . . . . . . . . . . . . . | F1:8 . . . . . . . C2:4 . . . F1:4 . . .',
      snare: 's . . . s . . . s . . . s . . . | ' + ROLL,
      kick: KICK + ' | ' + KICK,
      cym: CRASH + ' | ' + SWELL,
    } },
    A: { bars: 8, tracks: {
      horn: HORN_A4 + ' | G5:6 . . . . . F5:2 . Eb5:4 . . . Bb4:4 . . . | D5:6 . . . . . C5:2 . Bb4:4 . . . F4:4 . . . | ' +
        'E5:4 . . . G5:4 . . . Bb5:4 . . . G5:4 . . . | F5:12 . . . . . . . . . . . - . . .',
      chords: CHORDS_A4 + ' | ' + [after(EB), after(BB), after(C7), after(F7)].join(' | '),
      tuba: TUBA_A4 + ' | ' + [oom('Eb2', 'Bb1'), oom('Bb1', 'F1'), oom('C2', 'G1'), oom('F1', 'C2')].join(' | '),
      snare: rep(SNARE, 7) + ' | ' + ROLL,
      kick: rep(KICK, 8),
      cym: CRASH + ' | ' + rep(QUIET, 6) + ' | ' + SWELL,
    } },
    A2: { bars: 8, tracks: {
      horn: HORN_A4 + ' | G5:6 . . . . . F5:2 . Eb5:4 . . . C5:4 . . . | Bb4:4 . . . D5:4 . . . F5:4 . . . D5:4 . . . | ' +
        'C5:6 . . . . . D5:2 . Eb5:4 . . . A4:4 . . . | Bb4:8 . . . . . . . - . . . . . . .',
      chords: CHORDS_A4 + ' | ' + [after(EB), after(BB), after(F7), after(BB)].join(' | '),
      tuba: TUBA_A4 + ' | ' + [oom('Eb2', 'Bb1'), oom('Bb1', 'F1'), oom('F1', 'C2'), 'Bb1:4 . . . . . . . F1:4 . . . D2:4 . . .'].join(' | '),
      snare: rep(SNARE, 7) + ' | ' + ROLL,
      kick: rep(KICK, 8),
      cym: CRASH + ' | ' + rep(QUIET, 6) + ' | ' + SWELL,
    } },
    // The trio, in E-flat: softer (no after-beat accents, the snare on the backbeat only).
    trio: { bars: 8, tracks: {
      horn: 'G4:8 . . . . . . . Bb4:4 . . . Eb5:4 . . . | D5:6 . . . . . C5:2 . Bb4:8 . . . . . . . | ' +
        'Ab4:8 . . . . . . . F4:4 . . . D5:4 . . . | Eb5:12 . . . . . . . . . . . - . . . | ' +
        'C5:8 . . . . . . . Eb5:4 . . . Ab5:4 . . . | G5:6 . . . . . F5:2 . Eb5:8 . . . . . . . | ' +
        'F5:6 . . . . . D5:2 . Bb4:4 . . . Ab4:4 . . . | G4:8 . . . . . . . A4:8 . . . . . . .',
      chords: [EB, EB, BB7, EB, AB, EB, BB7].map(function (c) { return c + ':8? . . . . . . . ' + c + ':8? . . . . . . .'; }).join(' | ') +
        ' | ' + EB + ':8? . . . . . . . ' + F7 + ':8 . . . . . . .',
      tuba: [oom('Eb2', 'Bb1'), oom('Eb2', 'Bb1'), oom('Bb1', 'F1'), oom('Eb2', 'Bb1'), oom('Ab1', 'Eb2'), oom('Eb2', 'Bb1'), oom('Bb1', 'F1'),
        'Eb2:4 . . . . . . . F1:4 . . . . . . .'].join(' | '),
      snare: rep('. . . . s? . . . . . . . s? . . .', 7) + ' | ' + ROLL,
      kick: rep(KICK, 8),
      cym: 'b? . . . . . . . . . . . . . . . | ' + rep(QUIET, 6) + ' | ' + SWELL,
    } },
  };

  // The Dictator's march: the pitched tracks of every pattern, in B-flat minor.
  var dictator = { horn: {}, chords: {}, tuba: {} };
  Object.keys(patterns).forEach(function (p) {
    Object.keys(dictator).forEach(function (t) {
      if (patterns[p].tracks[t]) dictator[t][p] = minor(patterns[p].tracks[t]);
    });
  });

  SR.def.song('hail_to_the_stick', {
    bpm: 116, swing: 0,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'Bb', scale: 'major', gain: 0.75,
    inst: {
      horn: { preset: 'brass', gain: 0.8, pan: 0.1 },
      chords: { preset: 'brass', gain: 0.34, pan: -0.25 },
      tuba: { preset: 'bass', gain: 0.55, pan: 0 },
      snare: { preset: 'kit', gain: 0.55, pan: 0.15 },
      kick: { preset: 'kit', gain: 0.55, pan: 0 },
      cym: { preset: 'kit', gain: 1, pan: -0.15 },
    },
    patterns: patterns,
    // fanfare · A · A' · trio (E-flat) · A'
    order: ['intro', 'A', 'A2', 'trio', 'A2'],
    loopFrom: 1,
    variants: {
      dictator: { tracks: dictator, inst: { horn: { gain: 0.75 }, chords: { gain: 0.38 } } },
    },
  });
})();
