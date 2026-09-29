// js/audio/songs/last_call_shuffle.js — owner: W2-Music. Sticky's bar (ART_AUDIO §13.4): 112 bpm, an A
// blues, swinging (a triplet grid: three steps a beat); a 12-bar with a walking bass, a ride
// pattern (ding, ding-a) with a kick and backbeat snare, and honky keys: the comp is a pair, Rhodes
// (keys) on the left doubled by a plucked string on the right (the format has no detune, so the
// honky pair is two timbres on the same notes), and the right hand plays the riffs. Three
// choruses: the riff head, a call-and-response chorus, and a breakdown chorus (eight bars of bass,
// comp and cross-stick before the head's last line returns); 36 bars (77 s) a loop after a
// two-bar turnaround pickup. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of comp stabs on 2 and 4. */
  function st(ch) { return '. . . ' + ch + ':2 . . . . . ' + ch + ':2 . .'; }
  /** @returns {string} the comp stabs for a list of chords, one bar each. */
  function comp(list) { return list.map(st).join(' | '); }

  var A7 = '[G3 C#4 E4]', D7 = '[F#3 A3 C4]', E7 = '[G#3 B3 D4]';
  var FORM1 = [A7, D7, A7, A7], FORM2 = [D7, D7, A7, A7], FORM3 = [E7, D7, A7, E7];
  // The walking bass, a line per four bars of the form.
  var WALK1 = 'A1:3 . . C#2:3 . . E2:3 . . Eb2:3 . . | D2:3 . . C2:3 . . A1:3 . . G#1:3 . . | ' +
    'A1:3 . . C#2:3 . . E2:3 . . C#2:3 . . | A1:3 . . C#2:3 . . E2:3 . . Eb2:3 . .';
  var WALK2 = 'D2:3 . . F#2:3 . . A2:3 . . F#2:3 . . | D2:3 . . C2:3 . . A1:3 . . G#1:3 . . | ' +
    'A1:3 . . C#2:3 . . E2:3 . . C#2:3 . . | A1:3 . . C#2:3 . . E2:3 . . F2:3 . .';
  var WALK3 = 'E2:3 . . D2:3 . . B1:3 . . C#2:3 . . | D2:3 . . C2:3 . . A1:3 . . G#1:3 . . | ' +
    'A1:3 . . C#2:3 . . E2:3 . . F2:3 . . | E2:3 . . D2:3 . . B1:3 . . G#1:3 . .';
  var RIDE = 'h . . h . h? h . . h . h?';
  var BACK = 'k . . s . . k . . s . .';
  var BACK_FILL = 'k . . s . . k . . s s? s';
  var TURN = '. . . . . . E4 . G#4 B4:2 . D5';

  SR.def.song('last_call_shuffle', {
    bpm: 112, swing: 0,
    meter: [4, 4], stepsPerBeat: 3,
    key: 'A', scale: 'blues', gain: 0.8,
    inst: {
      right: { preset: 'keys', gain: 0.7, pan: 0.1 },
      compL: { preset: 'keys', gain: 0.34, pan: -0.35 },
      compR: { preset: 'pluck', gain: 0.26, pan: 0.35 },
      bass: { preset: 'bass', gain: 0.44, pan: 0 },
      ride: { preset: 'kit', gain: 0.9, pan: 0.25 },
      drums: { preset: 'kit', gain: 0.55, pan: 0 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        right: 'E5 . C#5 A4:3 . . . . . . . . | ' + TURN,
        compL: comp([A7, E7]),
        compR: comp([A7, E7]),
        bass: 'A1:3 . . C#2:3 . . E2:3 . . F2:3 . . | E2:3 . . D2:3 . . B1:3 . . G#1:3 . .',
        ride: rep(RIDE, 2),
        drums: BACK + ' | ' + BACK_FILL,
      } },
      // Chorus 1: the riff head.
      h1: { bars: 4, tracks: {
        right: 'C5 C#5:2 . E5:2 . G5 A5:3 . . E5:3 . . | C5 D5:2 . F#5:2 . A5 C6:3 . . A5:3 . . | ' +
          'E5:3 . . C#5:3 . . A4:3 . . G4 . A4 | A4:6 . . . . . - . . . . .',
        compL: comp(FORM1), compR: comp(FORM1), bass: WALK1, ride: rep(RIDE, 4), drums: rep(BACK, 4),
      } },
      h2: { bars: 4, tracks: {
        right: 'F5 F#5:2 . A5:2 . C6 D6:3 . . C6:3 . . | A5:3 . . F#5:3 . . D5:3 . . C5:3 . . | ' +
          'C5 C#5:2 . E5:2 . G5 A5:3 . . E5:3 . . | C#5:6 . . . . . - . . . . .',
        compL: comp(FORM2), compR: comp(FORM2), bass: WALK2, ride: rep(RIDE, 4), drums: rep(BACK, 4),
      } },
      h3: { bars: 4, tracks: {
        right: 'G5 G#5:2 . B5:2 . D6 E6:3 . . D6:3 . . | C6:3 . . A5:3 . . F#5:3 . . D5:3 . . | ' +
          'E5 . C#5 A4:3 . . . . . . . . | ' + TURN,
        compL: comp(FORM3), compR: comp(FORM3), bass: WALK3, ride: rep(RIDE, 4), drums: rep(BACK, 3) + ' | ' + BACK_FILL,
      } },
      // Chorus 2: call and response.
      c1: { bars: 4, tracks: {
        right: 'A5:3 . . G5 . E5 G5:3 . . E5 . C5 | D5:6 . . . . . - . . . . . | ' +
          'A5:3 . . G5 . E5 G5:3 . . A5 . C6 | A5:6 . . . . . - . . . . .',
        compL: comp(FORM1), compR: comp(FORM1), bass: WALK1, ride: rep(RIDE, 4), drums: rep(BACK, 4),
      } },
      c2: { bars: 4, tracks: {
        right: 'C6:3 . . A5 . F#5 A5:3 . . F#5 . D5 | F5 F#5:5 . . . . - . . . . . | ' +
          'E5:3 . . C#5 . A4 C5:3 . . A4 . G4 | A4:6 . . . . . - . . . . .',
        compL: comp(FORM2), compR: comp(FORM2), bass: WALK2, ride: rep(RIDE, 4), drums: rep(BACK, 4),
      } },
      c3: { bars: 4, tracks: {
        right: 'B5:3 . . G#5 . E5 G#5:3 . . E5 . D5 | C6:3 . . A5 . F#5 A5:3 . . F#5 . D5 | ' +
          'C#5:6 . . . . . A4:6 . . . . . | ' + TURN,
        compL: comp(FORM3), compR: comp(FORM3), bass: WALK3, ride: rep(RIDE, 4), drums: rep(BACK, 3) + ' | ' + BACK_FILL,
      } },
      // Chorus 3, the breakdown: bass, comp and a cross-stick for eight bars.
      d1: { bars: 4, tracks: {
        compL: comp(FORM1), compR: comp(FORM1), bass: WALK1,
        drums: rep('. . . r . . . . . r . .', 4),
      } },
      d2: { bars: 4, tracks: {
        compL: comp(FORM2), compR: comp(FORM2), bass: WALK2,
        drums: rep('. . . r . . . . . r . .', 3) + ' | k . . r . . k . . s s? s',
      } },
    },
    // pickup · chorus 1 (the head) · chorus 2 (call and response) · chorus 3 (breakdown, the head's last line)
    order: ['intro', 'h1', 'h2', 'h3', 'c1', 'c2', 'c3', 'd1', 'd2', 'h3'],
    loopFrom: 1,
  });
})();
