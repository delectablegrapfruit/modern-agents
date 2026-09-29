// js/audio/songs/pawnbroker_blues.js — owner: W2-Music. The pawn shop (ART_AUDIO §13.4): 76 bpm, a
// shuffle in A (a triplet grid: three steps a beat, the shuffle on the first and third); a slide
// lead (the pulse-saw lead preset; each slide is a scoop from a semitone or a tone below, one
// triplet ahead, since the song format has no pitch bend), an upright-style walking bass, Rhodes
// stabs on 2 and 4, a brushed shuffle with a cross-stick backbeat. Two 12-bar choruses: the head,
// then a stop-time chorus (band hits on the one while the slide talks) that settles back into the
// shuffle; 24 bars (76 s) a loop after a one-bar turnaround pickup. Original music. Pure data
// (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of Rhodes stabs on 2 and 4. */
  function stabs(ch) { return '. . . ' + ch + ':2 . . . . . ' + ch + ':2 . .'; }
  /** @returns {string} one stop-time bar: a hit on the one. */
  function hit(ch) { return ch + ':2 . . . . . . . . . . .'; }

  var A7 = '[G3 C#4 E4]', D7 = '[F#3 A3 C4]', E7 = '[G#3 B3 D4]';
  // Walking bass bars, named by the chord and the chord they lead into.
  var BA_D = 'A1:3 . . C#2:3 . . E2:3 . . G2:2 . C#2', BA_A = 'A1:3 . . C#2:3 . . E2:3 . . F#2:2 . G#1',
    BA_E = 'A1:3 . . C#2:3 . . E2:3 . . F2:2 . D#2', BD_A = 'D2:3 . . F#2:3 . . A2:3 . . F#2:2 . G#1',
    BD_D = 'D2:3 . . F#2:3 . . A2:3 . . F#2:2 . C#2', BE_D = 'E2:3 . . G#2:3 . . B2:3 . . G#2:2 . Eb2',
    BE_A = 'E2:3 . . D2:3 . . B1:3 . . G#1:3 . .';
  var SHUF = 'b . b? b . b? b . b? b . b?';
  var BEAT = 'k . . r . . k . . r . .';
  var TURN = '. . . . . . B3 . D4 E4:3 . .';

  SR.def.song('pawnbroker_blues', {
    bpm: 76, swing: 0,
    meter: [4, 4], stepsPerBeat: 3,
    key: 'A', scale: 'blues', gain: 0.8,
    inst: {
      slide: { preset: 'lead', gain: 0.9, pan: 0.2 },
      bass: { preset: 'bass', gain: 0.48, pan: 0 },
      keys: { preset: 'keys', gain: 0.45, pan: -0.25 },
      drums: { preset: 'kit', gain: 0.6, pan: 0 },
      brush: { preset: 'kit', gain: 1, pan: 0.15 },
    },
    patterns: {
      intro: { bars: 1, tracks: {
        slide: TURN,
        bass: BE_A,
        brush: SHUF,
      } },
      // The head (bars 1-4, 5-8, 9-12).
      H1: { bars: 4, tracks: {
        slide: 'G#3 A3:4 . . . C4 E4:3 . . G4:3 . . | F#4 G4? F#4:4 . . . D4:3 . . C4 . . | ' +
          'B3 C#4:5 . . . . A3:3 . . G3 . A3? | A3:9 . . . . . . . . - . .',
        bass: [BA_D, BD_A, BA_A, BA_D].join(' | '),
        keys: [stabs(A7), stabs(D7), stabs(A7), stabs(A7)].join(' | '),
        drums: rep(BEAT, 4),
        brush: rep(SHUF, 4),
      } },
      H2: { bars: 4, tracks: {
        slide: 'C4 D4:4 . . . F4 F#4:3 . . A4:3 . . | A4:2 . C5 A4:3 . . F#4:3 . . D4 . . | ' +
          'D#4 E4:5 . . . . C4:3 . . A3:3 . . | A3:9 . . . . . . . . - . .',
        bass: [BD_D, BD_A, BA_A, BA_E].join(' | '),
        keys: [stabs(D7), stabs(D7), stabs(A7), stabs(A7)].join(' | '),
        drums: rep(BEAT, 4),
        brush: rep(SHUF, 4),
      } },
      H3: { bars: 4, tracks: {
        slide: 'D#4 E4:5 . . . . G#4:3 . . B4:3 . . | C5:3 . . A4:3 . . F#4:3 . . D4:3 . . | ' +
          'C4 C#4:5 . . . . A3:6 . . . . . | ' + TURN,
        bass: [BE_D, BD_A, BA_E, BE_A].join(' | '),
        keys: [stabs(E7), stabs(D7), stabs(A7), stabs(E7)].join(' | '),
        drums: rep(BEAT, 3) + ' | k . . r . . k . . r r? r',
        brush: rep(SHUF, 4),
      } },
      // The second chorus: four bars of stop-time, then the shuffle again.
      S1: { bars: 4, tracks: {
        slide: 'E4 . G4 A4:3 . . G4 . E4 C4:3 . . | D4:3 . . F4 F#4:5 . . . . . . . | ' +
          'A4:2 . G4 E4:3 . . C4 . A3 C4:3 . . | C#4:6 . . . . . - . . G3 . G#3',
        bass: 'A1:2 . . . . . . . . . . . | D2:2 . . . . . . . . . . . | A1:2 . . . . . . . . . . . | A1:2 . . . . . . . . E2 . C#2',
        keys: [hit(A7), hit(D7), hit(A7), hit(A7)].join(' | '),
        drums: 'k . . . . . . . . . . . | k . . . . . . . . . . . | k . . . . . . . . . . . | k . . . . . . . . r? . r',
        brush: 'b . . . . . . . . . . . | b . . . . . . . . . . . | b . . . . . . . . . . . | b . . . . . b . b? b . b?',
      } },
      S2: { bars: 4, tracks: {
        slide: 'A3 C4 . D4:3 . . F#4:3 . . A4:3 . . | C5:6 . . . . . A4:3 . . F#4:3 . . | ' +
          'E4:3 . . C#4:3 . . E4 . G4 A4:3 . . | A4:6 . . . . . G4:3 . . E4:3 . .',
        bass: [BD_D, BD_A, BA_A, BA_E].join(' | '),
        keys: [stabs(D7), stabs(D7), stabs(A7), stabs(A7)].join(' | '),
        drums: rep(BEAT, 4),
        brush: rep(SHUF, 4),
      } },
      S3: { bars: 4, tracks: {
        slide: 'G#4:3 . . B4:3 . . D5:6 . . . . . | C5:3 . . A4 . F#4 A4:6 . . . . . | ' +
          'G4 . E4 C#4:3 . . A3:6 . . . . . | ' + TURN,
        bass: [BE_D, BD_A, BA_E, BE_A].join(' | '),
        keys: [stabs(E7), stabs(D7), stabs(A7), stabs(E7)].join(' | '),
        drums: rep(BEAT, 3) + ' | k . . r . . k . . r r? r',
        brush: rep(SHUF, 4),
      } },
    },
    // pickup · chorus 1 (the head) · chorus 2 (stop-time, then the shuffle)
    order: ['intro', 'H1', 'H2', 'H3', 'S1', 'S2', 'S3'],
    loopFrom: 1,
  });
})();
