// js/audio/songs/waiting_room.js — owner: W2-Music. The hospital (ART_AUDIO §13.4): 80 bpm, E major,
// sixteenths; sparse bells over a sine pad (the whistle preset's sine, held as chords, its breath
// noise a soft air hiss), a low bass holding the root, and a heart-monitor blip on every beat (a
// short high sine, B5, at the song's tempo: a resting 80). A (I - vi - IV - V, I - iii - IV -
// Vsus), B (vi - iii - IV - I, ii - vi - IV - V) and A again; 24 bars (72 s) a loop after two bars of
// the monitor and the pad. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of a held pad chord. */
  function pad(ch) { return ch + ':16 . . . . . . . . . . . . . . .'; }
  /** @returns {string} one bar of the bass holding a root. */
  function root(n) { return n + ':16 . . . . . . . . . . . . . . .'; }

  var E = '[E3 G#3 B3]', CSM = '[E3 G#3 C#4]', A = '[E3 A3 C#4]', B = '[D#3 F#3 B3]', GSM = '[D#3 G#3 B3]', FSM = '[F#3 A3 C#4]',
    BSUS = '[E3 F#3 B3]';

  var BEEP = 'B5 . . . B5 . . . B5 . . . B5 . . .';
  var BELLS_A = '. . . . B5:4 . . . . . . . G#5:4 . . . | . . . . E5:8 . . . . . . . . . . . | ' +
    '. . . . C#6:4 . . . B5:4 . . . A5:4 . . . | . . . . F#5:12 . . . . . . . . . . . | ' +
    '. . . . G#5:4 . . . B5:4 . . . E6:4 . . . | . . . . D#6:8 . . . . . . . . . . . | ' +
    '. . . . C#6:4 . . . A5:4 . . . E5:4 . . . | . . . . F#5:12 . . . . . . . . . . .';
  var PAD_A = [pad(E), pad(CSM), pad(A), pad(B), pad(E), pad(GSM), pad(A), pad(BSUS)].join(' | ');
  var BASS_A = [root('E2'), root('C#2'), root('A1'), root('B1'), root('E2'), root('G#1'), root('A1'), root('B1')].join(' | ');

  SR.def.song('waiting_room', {
    bpm: 80, swing: 0,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'E', scale: 'major', gain: 0.8,
    inst: {
      bells: { preset: 'bell', gain: 0.95, pan: 0.2 },
      pad: { preset: 'whistle', gain: 0.32, pan: -0.1 },
      bass: { preset: 'bass', gain: 0.35, pan: 0 },
      monitor: { preset: 'whistle', gain: 0.35, pan: 0.35 },
    },
    patterns: {
      intro: { bars: 2, tracks: { monitor: rep(BEEP, 2), pad: pad(E) + ' | ' + pad(BSUS) } },
      A: { bars: 8, tracks: { bells: BELLS_A, pad: PAD_A, bass: BASS_A, monitor: rep(BEEP, 8) } },
      B: { bars: 8, tracks: {
        bells: '. . . . C#6:6 . . . . . B5:2 . G#5:4 . . . | . . . . D#5:12 . . . . . . . . . . . | ' +
          '. . . . E5:4 . . . A5:4 . . . C#6:4 . . . | . . . . B5:12 . . . . . . . . . . . | ' +
          '. . . . A5:6 . . . . . G#5:2 . F#5:4 . . . | . . . . E5:12 . . . . . . . . . . . | ' +
          '. . . . C#5:4 . . . E5:4 . . . A5:4 . . . | . . . . D#5:4 . . . F#5:4 . . . B5:4 . . .',
        pad: [pad(CSM), pad(GSM), pad(A), pad(E), pad(FSM), pad(CSM), pad(A), pad(B)].join(' | '),
        bass: [root('C#2'), root('G#1'), root('A1'), root('E2'), root('F#1'), root('C#2'), root('A1'), root('B1')].join(' | '),
        monitor: rep(BEEP, 8),
      } },
    },
    // the monitor and the pad · A · B · A
    order: ['intro', 'A', 'B', 'A'],
    loopFrom: 1,
  });
})();
