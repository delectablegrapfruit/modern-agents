// js/audio/songs/compound_interest.js — owner: W2-Music. The bank (ART_AUDIO §13.4): 90 bpm, F major,
// sixteenths; an elevator bossa: a nylon-style plucked comp on the bossa syncopation, the bossa
// bass (root on 1, the fifth on the and of 2 and on 3, the root again on the and of 4), a
// cross-stick pattern with a soft kick, a shaker, and a bored, flute-ish whistle that sighs its way
// down long notes. A (I - iii - VI - ii - V), A' (a lower second ending), B (IV to its minor iv, a
// ii-V turnaround) and a four-bar breakdown (comp, bass and cross-stick); 28 bars (75 s) a loop after
// a two-bar intro. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of the bossa comp on one chord. */
  function comp(ch) { return ch + ' . . ' + ch + '? . . ' + ch + ':2 . . . ' + ch + '? . . ' + ch + ':2 . .'; }
  /** @returns {string} one bar of the comp on two chords (two beats each). */
  function comp2(a, b) { return a + ' . . ' + a + '? . . ' + a + ':2 . ' + b + ' . . ' + b + '? . . ' + b + ':2 .'; }
  /** @returns {string} one bar of the bossa bass: root, fifth on the and of 2, fifth on 3, root on the and of 4. */
  function bossa(r, f) { return r + ':6 . . . . . ' + f + ':2 . ' + f + ':6 . . . . . ' + r + ':2 .'; }
  /** @returns {string} one bar of bass on two chords. */
  function bossa2(r1, f1, r2, f2) { return r1 + ':6 . . . . . ' + f1 + ':2 . ' + r2 + ':6 . . . . . ' + f2 + ':2 .'; }

  var FM7 = '[E3 A3 C4]', AM7 = '[G3 C4 E4]', D7 = '[F#3 C4 Eb4]', GM7 = '[F3 Bb3 D4]', C7 = '[E3 Bb3 D4]',
    BBM7 = '[A3 D4 F4]', BBM6 = '[G3 Db4 F4]';

  var STICK = 'k . . r . . r . k . r . . r . .';
  var SHAKE = '. . z . . . z? . . . z . . . z? .';

  var COMP_A = [comp(FM7), comp(FM7), comp(AM7), comp(D7), comp(GM7), comp(C7), comp(FM7), comp2(GM7, C7)].join(' | ');
  var BASS_A = [bossa('F2', 'C2'), bossa('F2', 'C2'), bossa('A1', 'E2'), bossa('D2', 'A1'), bossa('G1', 'D2'), bossa('C2', 'G1'),
    bossa('F2', 'C2'), bossa2('G1', 'D2', 'C2', 'G1')].join(' | ');
  var MEL_A = 'A4:10 . . . . . . . . . G4:2 . A4:4 . . . | C5:12 . . . . . . . . . . . - . . . | ' +
    'E5:10 . . . . . . . . . D5:2 . C5:4 . . . | A4:12 . . . . . . . . . . . F#4:4 . . .';

  SR.def.song('compound_interest', {
    bpm: 90, swing: 0,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'F', scale: 'major', gain: 0.8,
    inst: {
      flute: { preset: 'whistle', gain: 0.75, pan: 0.2 },
      comp: { preset: 'pluck', gain: 0.42, pan: -0.25 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      drums: { preset: 'kit', gain: 0.55, pan: 0.05 },
      shaker: { preset: 'kit', gain: 0.9, pan: 0.35 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        comp: comp(FM7) + ' | ' + comp2(GM7, C7),
        drums: '. . . r . . r . . . r . . r . . | . . . r . . r . . . r . . r . .',
        shaker: rep(SHAKE, 2),
      } },
      A1: { bars: 8, tracks: {
        flute: MEL_A + ' | Bb4:10 . . . . . . . . . A4:2 . G4:4 . . . | E4:8 . . . . . . . G4:4 . . . Bb4:4 . . . | ' +
          'A4:16 . . . . . . . . . . . . . . . | . . . . . . . . G4:4 . . . E4:4 . . .',
        comp: COMP_A,
        bass: BASS_A,
        drums: rep(STICK, 8),
        shaker: rep(SHAKE, 8),
      } },
      A2: { bars: 8, tracks: {
        flute: MEL_A + ' | D5:10 . . . . . . . . . C5:2 . Bb4:4 . . . | G4:12 . . . . . . . . . . . - . . . | ' +
          'A4:6 . . . . . G4:2 . F4:8 . . . . . . . | F4:8 . . . . . . . - . . . . . . .',
        comp: COMP_A,
        bass: BASS_A,
        drums: rep(STICK, 8),
        shaker: rep(SHAKE, 8),
      } },
      B: { bars: 8, tracks: {
        flute: 'D5:10 . . . . . . . . . C5:2 . D5:4 . . . | Db5:12 . . . . . . . . . . . - . . . | ' +
          'C5:10 . . . . . . . . . B4:2 . C5:4 . . . | F#4:12 . . . . . . . . . . . - . . . | ' +
          'Bb4:10 . . . . . . . . . A4:2 . Bb4:4 . . . | Db5:8 . . . . . . . C5:4 . . . Bb4:4 . . . | ' +
          'C5:8 . . . . . . . A4:8 . . . . . . . | G4:8 . . . . . . . E4:8 . . . . . . .',
        comp: [comp(BBM7), comp(BBM6), comp(AM7), comp(D7), comp(GM7), comp(BBM6), comp2(AM7, D7), comp2(GM7, C7)].join(' | '),
        bass: [bossa('Bb1', 'F2'), bossa('Bb1', 'F2'), bossa('A1', 'E2'), bossa('D2', 'A1'), bossa('G1', 'D2'), bossa('Bb1', 'F2'),
          bossa2('A1', 'E2', 'D2', 'A1'), bossa2('G1', 'D2', 'C2', 'G1')].join(' | '),
        drums: rep(STICK, 8),
        shaker: rep(SHAKE, 8),
      } },
      // The breakdown: the comp, the bass and the cross-stick; the whistle takes a breath.
      brk: { bars: 4, tracks: {
        comp: [comp(FM7), comp(FM7), comp(GM7), comp(C7)].join(' | '),
        bass: [bossa('F2', 'C2'), bossa('F2', 'C2'), bossa('G1', 'D2'), bossa('C2', 'G1')].join(' | '),
        drums: rep('. . . r . . r . . . r . . r . .', 3) + ' | . . . r . . r . k . r . . r . .',
      } },
    },
    // intro · A · A' · B · breakdown
    order: ['intro', 'A1', 'A2', 'B', 'brk'],
    loopFrom: 1,
  });
})();
