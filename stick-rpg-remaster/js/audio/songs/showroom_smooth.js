// js/audio/songs/showroom_smooth.js — owner: W2-Music. Fine Line, the furniture showroom (ART_AUDIO
// §13.4): 96 bpm, B-flat major, a light sixteenth swing; smooth jazz: Rhodes (keys) voicings with an
// anticipated second strike, a breathy lead (the whistle preset: a sine with breath noise), a
// round bass, a soft kit (kick, cross-stick, shaker). A (Bbmaj7 - Gm7 - Ebmaj7 - F7sus, then a
// ii-V home), A' (the tune's second ending), B (Ebmaj7 to its minor iv, a ii-V to Dm7, home) and a
// four-bar breakdown (Rhodes and bass); 28 bars (70 s) a loop after a two-bar intro. Original
// music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of Rhodes: the chord on 1 and again, softer, on the and of 2. */
  function rh(ch) { return ch + ':6 . . . . . ' + ch + ':10? . . . . . . . . .'; }
  /** @returns {string} one bar of Rhodes held. */
  function held(ch) { return ch + ':16? . . . . . . . . . . . . . . .'; }
  /** @returns {string} one bar of bass: root, fifth, octave, a step toward the next chord. */
  function walk(r, f, o, s) { return r + ':6 . . . . . ' + f + ':2 . ' + o + ':4 . . . ' + s + ':4 . . .'; }

  var BB = '[A3 C4 D4 F4]', GM = '[F3 A3 Bb3 D4]', EB = '[G3 Bb3 D4 F4]', F7S = '[Eb3 G3 Bb3 C4]', CM = '[Eb3 G3 Bb3 D4]',
    F7 = '[Eb3 A3 D4]', EBM6 = '[Gb3 Bb3 C4 Eb4]', DM = '[F3 A3 C4]', G7 = '[F3 B3 E4]';

  var KIT = 'k . . . r . . . . . k . r . . .';
  var KIT2 = 'k . . . r . . . . . k . r . r? r?';
  var SHAKE = '. . z . . . z . . . z . . . z z?';

  var RH_A = [rh(BB), rh(GM), rh(EB), rh(F7S), rh(BB), rh(GM), rh(CM), rh(F7)].join(' | ');
  var BASS_A = [walk('Bb1', 'F2', 'Bb2', 'A2'), walk('G1', 'D2', 'G2', 'F2'), walk('Eb2', 'Bb1', 'Eb2', 'D2'),
    walk('F1', 'C2', 'F2', 'A1'), walk('Bb1', 'F2', 'Bb2', 'A2'), walk('G1', 'D2', 'G2', 'Bb1'),
    walk('C2', 'G2', 'C3', 'Bb2'), walk('F1', 'C2', 'F2', 'A1')].join(' | ');
  var MEL_A1 = 'D5:6 . . . . . C5:2 . Bb4:4 . . . A4:4 . . . | G4:8 . . . . . . . . . Bb4:2 . D5:4 . . . | ' +
    'F5:6 . . . . . Eb5:2 . D5:4 . . . Bb4:4 . . . | C5:12 . . . . . . . . . . . - . . .';

  SR.def.song('showroom_smooth', {
    bpm: 96, swing: 0.1,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'Bb', scale: 'major', gain: 0.8,
    inst: {
      lead: { preset: 'whistle', gain: 0.8, pan: 0.15 },
      keys: { preset: 'keys', gain: 0.38, pan: -0.2 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      drums: { preset: 'kit', gain: 0.55, pan: 0 },
      shaker: { preset: 'kit', gain: 0.9, pan: 0.3 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        keys: held(BB) + ' | ' + held(F7S),
        bass: 'Bb1:16 . . . . . . . . . . . . . . . | F1:12 . . . . . . . . . . . A1:4 . . .',
        shaker: rep(SHAKE, 2),
      } },
      A1: { bars: 8, tracks: {
        lead: MEL_A1 + ' | ' +
          'D5:6 . . . . . F5:2 . A5:8 . . . . . . . | G5:4 . . . F5:4 . . . D5:4 . . . Bb4:4 . . . | ' +
          'C5:6 . . . . . D5:2 . Eb5:4 . . . G5:4 . . . | F5:8 . . . . . . . Eb5:4 . . . A4:4 . . .',
        keys: RH_A,
        bass: BASS_A,
        drums: rep(KIT, 7) + ' | ' + KIT2,
        shaker: rep(SHAKE, 8),
      } },
      A2: { bars: 8, tracks: {
        lead: MEL_A1 + ' | ' +
          'F5:6 . . . . . D5:2 . C5:8 . . . . . . . | Bb4:4 . . . D5:4 . . . F5:8 . . . . . . . | ' +
          'Eb5:6 . . . . . D5:2 . C5:4 . . . Bb4:4 . . . | A4:12 . . . . . . . . . . . - . . .',
        keys: RH_A,
        bass: BASS_A,
        drums: rep(KIT, 7) + ' | ' + KIT2,
        shaker: rep(SHAKE, 8),
      } },
      B: { bars: 8, tracks: {
        lead: 'G5:6 . . . . . F5:2 . D5:8 . . . . . . . | Gb5:6 . . . . . F5:2 . Eb5:8 . . . . . . . | ' +
          'F5:6 . . . . . E5:2 . C5:8 . . . . . . . | B4:6 . . . . . D5:2 . F5:8 . . . . . . . | ' +
          'Eb5:6 . . . . . D5:2 . Bb4:8 . . . . . . . | A4:6 . . . . . C5:2 . Eb5:8 . . . . . . . | ' +
          'D5:16 . . . . . . . . . . . . . . . | . . . . . . . . C5:4 . . . Eb5:4 . . .',
        keys: [rh(EB), rh(EBM6), rh(DM), rh(G7), rh(CM), rh(F7), rh(BB), rh(F7S)].join(' | '),
        bass: [walk('Eb2', 'Bb1', 'Eb2', 'D2'), walk('Eb2', 'Bb1', 'Eb2', 'D2'), walk('D2', 'A1', 'D2', 'F2'),
          walk('G1', 'D2', 'G2', 'F2'), walk('C2', 'G2', 'C3', 'Bb2'), walk('F1', 'C2', 'F2', 'A1'),
          walk('Bb1', 'F2', 'Bb2', 'A2'), walk('F1', 'C2', 'F2', 'A1')].join(' | '),
        drums: rep(KIT, 7) + ' | ' + KIT2,
        shaker: rep(SHAKE, 8),
      } },
      // The breakdown: Rhodes and bass, the shaker alone.
      brk: { bars: 4, tracks: {
        keys: [held(BB), held(EB), held(CM), rh(F7S)].join(' | '),
        bass: 'Bb1:16 . . . . . . . . . . . . . . . | Eb2:16 . . . . . . . . . . . . . . . | ' +
          'C2:16 . . . . . . . . . . . . . . . | F1:8 . . . . . . . C2:4 . . . A1:4 . . .',
        shaker: rep(SHAKE, 4),
      } },
    },
    // intro · A · A' (the second ending) · B · breakdown
    order: ['intro', 'A1', 'A2', 'B', 'brk'],
    loopFrom: 1,
  });
})();
