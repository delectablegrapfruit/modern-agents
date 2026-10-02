// js/audio/songs/high_roller_lounge.js — owner: W2-Music. The casino and its tables (ART_AUDIO §13.4):
// 118 bpm, swung eighths (two steps a beat, the off-beat a third of a beat late), C major; lounge
// jazz: a vibes melody, a walking bass (chromatic approaches into each chord), a ride pattern
// (ding, ding-a) with brushes on 2 and 4, and soft Rhodes comping on the Charleston rhythm. AABA
// and a four-bar breakdown, 36 bars (73 s) a loop after a two-bar ii-V: A (I - vi - ii - V, then
// iii - VI - ii - V), A (its turnaround ending), B (the bridge: ii-V to IV, then vi - II - ii - V),
// A, and the breakdown (I - VI7 - ii - V: the walking bass and the brushes alone, the vibes
// answering; ART_AUDIO §13.1, so the tables' long sessions hear the texture open up). Original
// music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of Charleston comping on a chord. */
  function ch(c) { return c + ':3 . . ' + c + ':2? . . . .'; }
  /** @returns {string} one bar of comping on two chords (two beats each). */
  function ch2(a, b) { return a + ':3 . . . ' + b + ':3? . . .'; }

  var CM7 = '[E3 G3 B3]', AM7 = '[G3 C4 E4]', DM7 = '[F3 A3 C4]', G7 = '[F3 B3 D4]', EM7 = '[G3 B3 D4]',
    A7 = '[G3 C#4 E4]', GM7 = '[F3 Bb3 D4]', C7 = '[E3 Bb3 D4]', FM7 = '[E3 A3 C4]', D7 = '[F#3 C4 E4]';

  var RIDE = 'h . h h? h . h h?';
  var BRUSH = '. . b . . . b .';
  var MEL_A = 'E5:3 . . G5 B5:4 . . . | A5:2 . G5 E5 C5:4 . . . | D5:3 . . F5 A5:4 . . . | G5:2 . F5 D5 B4:4 . . .';
  var COMP_A = [ch(CM7), ch(AM7), ch(DM7), ch(G7)].join(' | ');
  var BASS_A = 'C2:2 . E2:2 . G2:2 . G#2:2 . | A1:2 . C2:2 . E2:2 . C#2:2 . | D2:2 . F2:2 . A2:2 . Ab2:2 . | G2:2 . F2:2 . D2:2 . F2:2 .';
  // The second half of the A section with its second ending; `toBridge` walks up to the bridge's Gm7.
  function aEnd(toBridge) {
    return {
      vibes: 'G5:2 . E5 . C#5:2 . E5 . | F5:2 . D5 . B4:2 . D5 . | C5:6 . . . . . - . | . . . . . . . .',
      comp: [ch2(EM7, A7), ch2(DM7, G7), ch(CM7), ch2(DM7, G7)].join(' | '),
      bass: 'E2:2 . G2:2 . A2:2 . C#2:2 . | D2:2 . F2:2 . G2:2 . B1:2 . | C2:2 . E2:2 . G2:2 . E2:2 . | ' +
        (toBridge ? 'D2:2 . F2:2 . G2:2 . F#2:2 .' : 'D2:2 . A1:2 . G1:2 . B1:2 .'),
    };
  }
  var A2END = aEnd(true), A3END = aEnd(false);

  SR.def.song('high_roller_lounge', {
    bpm: 118, swing: 0.33,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'C', scale: 'major', gain: 0.8,
    inst: {
      vibes: { preset: 'vibes', gain: 0.75, pan: 0.15 },
      comp: { preset: 'keys', gain: 0.4, pan: -0.25 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      ride: { preset: 'kit', gain: 0.9, pan: 0.3 },
      brush: { preset: 'kit', gain: 0.9, pan: -0.1 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        comp: ch(DM7) + ' | ' + ch(G7),
        bass: 'D2:2 . F2:2 . A2:2 . Ab2:2 . | G2:2 . F2:2 . D2:2 . B1:2 .',
        ride: rep(RIDE, 2),
        brush: rep(BRUSH, 2),
      } },
      A1: { bars: 8, tracks: {
        vibes: MEL_A + ' | E5:3 . . G5 B5:2 . D6 . | C#6:6 . . . . . - . | C6:2 . A5 F5 D5:2 . F5 . | E5:6 . . . . . - .',
        comp: COMP_A + ' | ' + [ch(EM7), ch(A7), ch(DM7), ch(G7)].join(' | '),
        bass: BASS_A + ' | E2:2 . G2:2 . B2:2 . Bb2:2 . | A2:2 . G2:2 . E2:2 . C#2:2 . | D2:2 . F2:2 . A2:2 . Ab2:2 . | ' +
          'G2:2 . F2:2 . D2:2 . B1:2 .',
        ride: rep(RIDE, 8),
        brush: rep(BRUSH, 8),
      } },
      A2: { bars: 8, tracks: {
        vibes: MEL_A + ' | ' + A2END.vibes,
        comp: COMP_A + ' | ' + A2END.comp,
        bass: BASS_A + ' | ' + A2END.bass,
        ride: rep(RIDE, 8),
        brush: rep(BRUSH, 7) + ' | . . b . . b? b b?',
      } },
      B: { bars: 8, tracks: {
        vibes: 'Bb4:2 . D5 F5 A5:4 . . . | G5:2 . E5 C5 Bb4:4 . . . | A4:3 . . C5 E5:4 . . . | F5:6 . . . . . - . | ' +
          'C5:3 . . E5 G5:4 . . . | F#5:2 . E5 D5 C5:4 . . . | F5:3 . . D5 A4:2 . C5 . | B4:4 . . . D5:2 . F5 .',
        comp: [ch(GM7), ch(C7), ch(FM7), ch(FM7), ch(AM7), ch(D7), ch(DM7), ch(G7)].join(' | '),
        bass: 'G1:2 . Bb1:2 . D2:2 . Db2:2 . | C2:2 . E2:2 . G2:2 . E2:2 . | F2:2 . A2:2 . C3:2 . A2:2 . | F2:2 . E2:2 . D2:2 . Bb1:2 . | ' +
          'A1:2 . C2:2 . E2:2 . Eb2:2 . | D2:2 . F#2:2 . A2:2 . E2:2 . | D2:2 . F2:2 . A2:2 . Ab2:2 . | G2:2 . F2:2 . D2:2 . B1:2 .',
        ride: rep(RIDE, 8),
        brush: rep(BRUSH, 7) + ' | . . b . . b? b b?',
      } },
      A3: { bars: 8, tracks: {
        vibes: MEL_A + ' | ' + A3END.vibes,
        comp: COMP_A + ' | ' + A3END.comp,
        bass: BASS_A + ' | ' + A3END.bass,
        ride: rep(RIDE, 8),
        brush: rep(BRUSH, 8),
      } },
      // The breakdown: the ride and the Rhodes drop out; the bass walks I - VI7 - ii - V under the
      // brushes, the vibes answer twice, and a brush fill leads back to the top.
      brk: { bars: 4, tracks: {
        vibes: '. . . . . . . . | . . . . C#5 E5 G5:2 . | . . . . . . . . | . . . . B4 D5 F5:2 .',
        bass: 'C2:2 . E2:2 . G2:2 . Bb1:2 . | A1:2 . C#2:2 . E2:2 . Eb2:2 . | D2:2 . F2:2 . A2:2 . Ab2:2 . | ' +
          'G2:2 . F2:2 . D2:2 . B1:2 .',
        brush: rep(BRUSH, 3) + ' | . . b . . b? b b?',
      } },
    },
    // ii-V pickup · A · A (to the bridge) · B · A (the turnaround home) · breakdown
    order: ['intro', 'A1', 'A2', 'B', 'A3', 'brk'],
    loopFrom: 1,
  });
})();
