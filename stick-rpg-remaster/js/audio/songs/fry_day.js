// js/audio/songs/fry_day.js — owner: W2-Music. McSticks (ART_AUDIO §13.4): 128 bpm, E major, straight
// eighths (two steps a beat); surf twang: a low plucked lead with a spring-style echo (a second
// pluck, panned the other way, answering the long notes an eighth later and softer), a shaker on
// the off-beats, a cheesy organ on the backbeat, a root-fifth bass. A (I - vi - IV - V), A' (the
// same tune, the organ held), B (the flat-III surf lift), A, and a four-bar breakdown; 36 bars
// (67.5 s) a loop after a two-bar pickup. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} the organ's backbeat stabs on a chord. */
  function stab(ch) { return '. . ' + ch + ':2 . . . ' + ch + ':2 .'; }
  /** @returns {string} the organ holding a chord for the bar. */
  function held(ch) { return ch + ':8? . . . . . . .'; }

  var E = '[G#3 B3 E4]', CSM = '[G#3 C#4 E4]', A = '[A3 C#4 E4]', B = '[F#3 B3 D#4]', G = '[G3 B3 D4]';

  var LEAD_A = 'E3 G#3 B3 E4:4 . . . D#4 | C#4:3 . . B3 G#3:3 . . E3 | A3 C#4 E4 F#4:4 . . . E4 | D#4:3 . . C#4 B3:4 . . . | ' +
    'E3 G#3 B3 E4:2 . G#4:3 . . | F#4 E4 C#4:2 . B3:4 . . . | C#4:2 . E4:2 . D#4:2 . F#4:2 . | E4:6 . . . . . - .';
  var ECHO_A = '. . . . E4:3? . . . | . C#4:2? . . . G#3:2? . . | . . . . F#4:3? . . . | . D#4:2? . . . B3:3? . . | ' +
    '. . . . . . G#4:2? . | . . . . . . B3:2? . | . . . . . . . F#4? | . E4:4? . . . . . .';
  var BASS_A = 'E2:2 . B1:2 . E2 . B1:2 . | C#2:2 . G#1:2 . C#2 . G#1:2 . | A1:2 . E2:2 . A1 . E2:2 . | B1:2 . F#1:2 . B1 . F#1:2 . | ' +
    'E2:2 . B1:2 . E2 . B1:2 . | C#2:2 . G#1:2 . C#2 . G#1:2 . | A1:2 . E2:2 . B1:2 . F#1:2 . | E2:2 . B1:2 . E2 . E2:2 .';
  var DRUMS8 = rep('k . s . k . s .', 3) + ' | k . s . k k s s? | ' + rep('k . s . k . s .', 3) + ' | k . s . k s s s?';
  var SHAKER8 = rep('. z . z . z . z?', 8);

  SR.def.song('fry_day', {
    bpm: 128, swing: 0,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'E', scale: 'major', gain: 0.68,
    inst: {
      lead: { preset: 'pluck', gain: 0.9, pan: -0.2 },
      echo: { preset: 'pluck', gain: 0.6, pan: 0.4 },
      organ: { preset: 'organ', gain: 0.4, pan: 0.15 },
      bass: { preset: 'bass', gain: 0.45, pan: 0 },
      drums: { preset: 'kit', gain: 0.7, pan: 0 },
      shaker: { preset: 'kit', gain: 0.95, pan: 0.3 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        lead: 'B2 . B2 . B2 . B2 . | B2 D#3 F#3 A3 B3:4 . . .',
        echo: '. B2? . B2? . B2? . B2? | . . . . . B3:3? . .',
        bass: 'B1 . B1 . B1 . B1 . | B1 . . . F#1:2 . B1 .',
        drums: '. . . . . . . . | k . s . k . s s?',
        shaker: rep('. z . z . z . z?', 2),
      } },
      A: { bars: 8, tracks: {
        lead: LEAD_A,
        echo: ECHO_A,
        organ: [stab(E), stab(CSM), stab(A), stab(B), stab(E), stab(CSM), '. . ' + A + ':2 . . . ' + B + ':2 .', stab(E)].join(' | '),
        bass: BASS_A,
        drums: DRUMS8,
        shaker: SHAKER8,
      } },
      A2: { bars: 8, tracks: {
        lead: LEAD_A,
        echo: ECHO_A,
        organ: [held(E), held(CSM), held(A), held(B), held(E), held(CSM), A + ':4? . . . ' + B + ':4? . . .', held(E)].join(' | '),
        bass: BASS_A,
        drums: DRUMS8,
        shaker: SHAKER8,
      } },
      B: { bars: 8, tracks: {
        lead: 'C#4 E4 A4:3 . . G#4 F#4 E4 | C#4:6 . . . . . . . | B3 E4 G#4:3 . . F#4 E4 B3 | G#3:6 . . . . . . . | ' +
          'B3 D4 G4:3 . . F#4 D4 B3 | C#4 E4 A4:4 . . . G#4 A4 | B4:4 . . . A4 G#4 F#4 D#4 | F#4:4 . . . D#4:2 . B3 .',
        echo: '. . . A4:2? . . . . | . . . . C#4:4? . . . | . . . G#4:2? . . . . | . . . . G#3:4? . . . | ' +
          '. . . G4:2? . . . . | . . . . A4:2? . . . | . B4:3? . . . . . . | . F#4:3? . . . . . .',
        organ: [held(A), stab(A), held(E), stab(E), held(G), stab(A), held(B), stab(B)].join(' | '),
        bass: 'A1:2 . E2:2 . A1 . E2:2 . | A1:2 . E2:2 . A1 . G#1:2 . | E2:2 . B1:2 . E2 . B1:2 . | E2:2 . B1:2 . E2 . F#2:2 . | ' +
          'G1:2 . D2:2 . G1 . D2:2 . | A1:2 . E2:2 . A1 . E2:2 . | B1:2 . F#1:2 . B1 . F#1:2 . | B1:2 . F#1:2 . B1 . A1:2 .',
        drums: DRUMS8,
        shaker: SHAKER8,
      } },
      // The breakdown: bass riff, toms and the twang alone with its echo.
      brk: { bars: 4, tracks: {
        lead: 'E3:2 . . . . . . . | G3:2 . . . A3:2 . . . | E3:2 . . . . . . . | G3:2 . A3:2 . B3:4 . . .',
        echo: '. E3:2? . . E3? . . . | . G3:2? . . . A3:2? . . | . E3:2? . . E3? . . . | . . . G3? . . B3:2? .',
        organ: stab(E) + ' | . . . . . . . . | ' + stab(E) + ' | . . . . ' + B + ':4? . . .',
        bass: 'E2 . E2 . G2 . A2 . | E2 . E2 . G2 . B1 . | E2 . E2 . G2 . A2 . | E2 . G2 . A2 . B1 .',
        drums: 'k . . . s . . . | k . . . s . t t | k . . . s . . . | k . t t s . t .',
        shaker: SHAKER8.split(' | ').slice(0, 4).join(' | '),
      } },
    },
    // pickup · A · A' · B · A · breakdown
    order: ['intro', 'A', 'A2', 'B', 'A', 'brk'],
    loopFrom: 1,
  });
})();
