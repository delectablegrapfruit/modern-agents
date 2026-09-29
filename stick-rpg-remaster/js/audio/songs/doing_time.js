// js/audio/songs/doing_time.js — owner: W2-Music. Jail (ART_AUDIO §13.4): 70 bpm, an E blues, a slow
// shuffle (a triplet grid: three steps a beat); a harmonica lead (bent notes as a grace from below,
// one triplet ahead: the format has no pitch bend), a root-fifth-sixth shuffle bass, a low organ
// holding the chord's third and seventh, brushes and a cross-stick. Two 12-bar choruses: the head,
// then a lonelier chorus whose first four bars drop to the brushes; 24 bars (82 s) a loop after a
// one-bar turnaround pickup. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of a held organ chord. */
  function hold(ch) { return ch + ':12? . . . . . . . . . . .'; }

  var E7 = '[G#3 D4]', A7 = '[G3 C#4]', B7 = '[A3 D#4]';
  var BE = 'E2:3 . . B2:3 . . C#3:3 . . B2:3 . .', BA = 'A1:3 . . E2:3 . . F#2:3 . . E2:3 . .',
    BB = 'B1:3 . . F#2:3 . . G#2:3 . . F#2:3 . .', BTURN = 'B1:3 . . A1:3 . . F#1:3 . . D#2:3 . .';
  var ORG1 = [hold(E7), hold(A7), hold(E7), hold(E7)].join(' | '), ORG2 = [hold(A7), hold(A7), hold(E7), hold(E7)].join(' | '),
    ORG3 = [hold(B7), hold(A7), hold(E7), hold(B7)].join(' | ');
  var BASS1 = [BE, BA, BE, BE].join(' | '), BASS2 = [BA, BA, BE, BE].join(' | '), BASS3 = [BB, BA, BE, BTURN].join(' | ');
  var SHUF = 'b . b? b . b? b . b? b . b?';
  var STICK = 'k . . r . . k . . r . .';
  var TURN = '. . . . . . B3 . D#4 F#4:3 . .';

  SR.def.song('doing_time', {
    bpm: 70, swing: 0,
    meter: [4, 4], stepsPerBeat: 3,
    key: 'E', scale: 'blues', gain: 0.8,
    inst: {
      harp: { preset: 'harmonica', gain: 0.7, pan: 0.15 },
      organ: { preset: 'organ', gain: 0.45, pan: -0.2 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      drums: { preset: 'kit', gain: 0.5, pan: 0 },
      brush: { preset: 'kit', gain: 1, pan: 0.2 },
    },
    patterns: {
      intro: { bars: 1, tracks: { harp: TURN, organ: hold(B7), bass: BTURN, brush: SHUF } },
      // Chorus 1: the head.
      h1: { bars: 4, tracks: {
        harp: 'B4:3 . . G4 . . E4:6 . . . . . | G4:3 . . A4 . . C#5:3 . . A4:3 . . | ' +
          'G4 G#4:5 . . . . E4:3 . . D4:3 . . | E4:9 . . . . . . . . - . .',
        organ: ORG1, bass: BASS1, drums: rep(STICK, 4), brush: rep(SHUF, 4),
      } },
      h2: { bars: 4, tracks: {
        harp: 'E5:3 . . D5 . C#5 A4:6 . . . . . | G4:3 . . A4:3 . . . . . . . . | ' +
          'Bb4 B4:5 . . . . G4:3 . . E4:3 . . | E4:9 . . . . . . . . - . .',
        organ: ORG2, bass: BASS2, drums: rep(STICK, 4), brush: rep(SHUF, 4),
      } },
      h3: { bars: 4, tracks: {
        harp: 'F#5:3 . . D#5 . B4 A4:6 . . . . . | G4:3 . . A4 . C#5 E5:6 . . . . . | ' +
          'D5 . B4 G4:3 . . E4:6 . . . . . | ' + TURN,
        organ: ORG3, bass: BASS3, drums: rep(STICK, 3) + ' | k . . r . . k . . r r? r', brush: rep(SHUF, 4),
      } },
      // Chorus 2: the first four bars on the brushes alone.
      v1: { bars: 4, tracks: {
        harp: 'E5:6 . . . . . D5:3 . . B4:3 . . | C#5:6 . . . . . A4:6 . . . . . | ' +
          'G4 G#4:5 . . . . B4:6 . . . . . | E4:9 . . . . . . . . - . .',
        organ: ORG1, bass: BASS1, brush: rep(SHUF, 3) + ' | b . b? b . b? b . b? b b? b',
      } },
      v2: { bars: 4, tracks: {
        harp: 'A4:3 . . C#5:3 . . E5:3 . . G5:3 . . | E5:9 . . . . . . . . - . . | ' +
          'D5 . B4 G4 . E4 G4:6 . . . . . | E4:9 . . . . . . . . - . .',
        organ: ORG2, bass: BASS2, drums: rep(STICK, 4), brush: rep(SHUF, 4),
      } },
      v3: { bars: 4, tracks: {
        harp: 'D#5:6 . . . . . F#5:6 . . . . . | E5:6 . . . . . C#5:6 . . . . . | ' +
          'B4:3 . . G4:3 . . E4:6 . . . . . | ' + TURN,
        organ: ORG3, bass: BASS3, drums: rep(STICK, 3) + ' | k . . r . . k . . r r? r', brush: rep(SHUF, 4),
      } },
    },
    // pickup · chorus 1 (the head) · chorus 2 (the brushes, then the band)
    order: ['intro', 'h1', 'h2', 'h3', 'v1', 'v2', 'v3'],
    loopFrom: 1,
  });
})();
