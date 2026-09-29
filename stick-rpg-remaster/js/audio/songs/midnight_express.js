// js/audio/songs/midnight_express.js — owner: W2-Music. The bus depot and the trips (ART_AUDIO §13.4):
// 120 bpm, E minor, swung eighths (two steps a beat, the off-beat a third of a beat late); a train
// rhythm on the hats (every eighth, the off-beats leaning), a kick with a soft backbeat, a boogie bass
// (root, third, fifth, sixth, seventh and back; the dorian sixth), and a harmonica-like pulse (the
// harmonica preset) that plays the head and then train-whistle double-stops. A minor 12-bar: the
// head, the whistle chorus, and a breakdown chorus (four bars of bass and train alone before the
// head's last eight bars); 36 bars (72 s) a loop after a two-bar train pickup. Original music. Pure
// data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }

  // The boogie, one bar per chord: up the chord and its sixth to the seventh, and back.
  var BE = 'E2 G2 B2 C#3 D3 C#3 B2 G2', BA = 'A1 C2 E2 F#2 G2 F#2 E2 C2', BB = 'B1 D#2 F#2 G#2 A2 G#2 F#2 D#2';
  var WALK1 = [BE, BE, BE, BE].join(' | '), WALK2 = [BA, BA, BE, BE].join(' | '), WALK3 = [BB, BA, BE, BB].join(' | ');
  var TRAIN = 'h? h h? h h? h h? h';
  var BEAT = 'k . s? . k . s? .';

  var HEAD2 = 'C5:3 . . A4 E4:2 . G4 . | A4:6 . . . . . - . | B4:3 . . G4 A4 Bb4 B4:2 . | E4:6 . . . . . - .';
  var HEAD3 = 'F#5:3 . . D#5 B4:2 . A4 . | C5:3 . . A4 E4:2 . G4 . | E4:2 . G4:2 . B4:4 . . . | D#4:2 . F#4:2 . A4:2 . B4:2 .';

  SR.def.song('midnight_express', {
    bpm: 120, swing: 0.33,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'E', scale: 'minor', gain: 0.75,
    inst: {
      harp: { preset: 'harmonica', gain: 0.62, pan: 0.15 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      train: { preset: 'kit', gain: 1, pan: -0.2 },
      drums: { preset: 'kit', gain: 0.55, pan: 0 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        train: 'h? . h? . h? . h? . | ' + TRAIN,
        bass: '. . . . . . . . | ' + BB,
      } },
      // Chorus 1: the head.
      c1a: { bars: 4, tracks: {
        harp: 'B4:3 . . G4 A4 Bb4 B4:2 . | E4:6 . . . . . - . | D5:3 . . B4 G4:2 . E4 . | G4:3 . . A4 B4:4 . . .',
        bass: WALK1, train: rep(TRAIN, 4), drums: rep(BEAT, 4),
      } },
      c1b: { bars: 4, tracks: { harp: HEAD2, bass: WALK2, train: rep(TRAIN, 4), drums: rep(BEAT, 4) } },
      c1c: { bars: 4, tracks: { harp: HEAD3, bass: WALK3, train: rep(TRAIN, 4), drums: rep(BEAT, 3) + ' | k . s? . k s? s s?' } },
      // Chorus 2: the train whistle (double-stops).
      c2a: { bars: 4, tracks: {
        harp: '[G4 B4]:6 . . . . . [E4 G4] . | [G4 B4]:6 . . . . . - . | E5:2 . D5 B4 D5:2 . E5 . | B4:6 . . . . . - .',
        bass: WALK1, train: rep(TRAIN, 4), drums: rep(BEAT, 4),
      } },
      c2b: { bars: 4, tracks: {
        harp: '[A4 C5]:6 . . . . . [E4 A4] . | [A4 C5]:6 . . . . . - . | G4 A4 B4 D5 E5:4 . . . | D5:2 . B4 G4 E4:4 . . .',
        bass: WALK2, train: rep(TRAIN, 4), drums: rep(BEAT, 4),
      } },
      c2c: { bars: 4, tracks: {
        harp: '[D#5 F#5]:6 . . . . . - . | [C5 E5]:6 . . . . . - . | [G4 B4]:4 . . . [E4 G4]:4 . . . | F#4:2 . A4:2 . B4:2 . D#5:2 .',
        bass: WALK3, train: rep(TRAIN, 4), drums: rep(BEAT, 3) + ' | k . s? . k s? s s?',
      } },
      // Chorus 3 opens with the breakdown: the bass and the train alone.
      d1: { bars: 4, tracks: {
        bass: WALK1, train: rep(TRAIN, 4),
        drums: '. . . . . . . . | . . . . . . . . | . . . . . . . . | k . . . k . s? s?',
      } },
    },
    // pickup · chorus 1 (the head) · chorus 2 (the whistle) · chorus 3 (breakdown, the head's last eight bars)
    order: ['intro', 'c1a', 'c1b', 'c1c', 'c2a', 'c2b', 'c2c', 'd1', 'c1b', 'c1c'],
    loopFrom: 1,
  });
})();
