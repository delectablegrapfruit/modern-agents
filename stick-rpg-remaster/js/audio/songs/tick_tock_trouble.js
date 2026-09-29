// js/audio/songs/tick_tock_trouble.js — owner: W2-Music. Hustles, darts and scratch cards (ART_AUDIO
// §13.4; P1, used by the minigame skins): 124 bpm, A minor, straight eighths; light chiptune: a 25 %
// pulse lead, an octave-bouncing bass, a light kick and snare, and a ticking clock (a closed hat
// tick on the beat, a rim tock on the off-beat, one track). A (i - VI - III - VII, i - VI - V), A'
// (the climb home to A), B (iv - i - iv - V, VI - III - iv - V), a four-bar breakdown (the clock and
// the bass alone, the lead counting) and A' again; 36 bars (70 s) a loop after a two-bar clock
// intro. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of the chip bass bouncing between a root and its octave. */
  function bounce(r, o) { return r + ':2 . ' + o + ':2 . ' + r + ':2 . ' + o + ':2 .'; }

  var CLOCK = 'h r h r? h r h r?';
  var BEAT = 'k . s . k . s .';
  var BASS_A = [bounce('A1', 'A2'), bounce('F1', 'F2'), bounce('C2', 'C3'), bounce('G1', 'G2'), bounce('A1', 'A2'), bounce('F1', 'F2'),
    bounce('E1', 'E2'), bounce('E1', 'E2')].join(' | ');
  var LEAD_A4 = 'A4 C5 E5 A5:3 . . G5 E5 | F5:2 . E5 C5 A4:4 . . . | G4 C5 E5 G5:3 . . F5 E5 | D5:2 . B4 G4 D5:4 . . .';

  SR.def.song('tick_tock_trouble', {
    bpm: 124, swing: 0,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'A', scale: 'minor', gain: 0.75,
    inst: {
      lead: { preset: 'lead', gain: 0.75, pan: 0.1 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      clock: { preset: 'kit', gain: 1, pan: -0.2 },
      drums: { preset: 'kit', gain: 0.5, pan: 0 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        clock: rep(CLOCK, 2),
        bass: 'A1:2 . . . A1:2 . . . | A1:2 . . . E1:2 . E2:2 .',
      } },
      A: { bars: 8, tracks: {
        lead: LEAD_A4 + ' | A4 C5 E5 A5:3 . . B5 C6 | A5:2 . F5 C5 F5:4 . . . | G#5:3 . . E5 B4:2 . D5 . | E5:6 . . . . . - .',
        bass: BASS_A, clock: rep(CLOCK, 8), drums: rep(BEAT, 7) + ' | k . s . k s s s?',
      } },
      A2: { bars: 8, tracks: {
        lead: LEAD_A4 + ' | C6:2 . B5 A5 E5:4 . . . | F5 G5 A5 C6:3 . . A5 F5 | E5:2 . G#5:2 . B5:2 . D6:2 . | C6:2 . B5:2 . G#5:2 . E5:2 .',
        bass: BASS_A, clock: rep(CLOCK, 8), drums: rep(BEAT, 7) + ' | k . s . k s s s?',
      } },
      B: { bars: 8, tracks: {
        lead: 'D5:3 . . F5 A5:4 . . . | C6:2 . B5 A5 E5:4 . . . | F5:3 . . A5 D6:4 . . . | B5:4 . . . G#5:4 . . . | ' +
          'A5:3 . . C6 F5:4 . . . | G5:3 . . E5 C5:4 . . . | D5 F5 A5 D6:3 . . C6 B5 | G#5:6 . . . . . - .',
        bass: [bounce('D2', 'D3'), bounce('A1', 'A2'), bounce('D2', 'D3'), bounce('E1', 'E2'), bounce('F1', 'F2'), bounce('C2', 'C3'),
          bounce('D2', 'D3'), bounce('E1', 'E2')].join(' | '),
        clock: rep(CLOCK, 8), drums: rep(BEAT, 8),
      } },
      // The breakdown: the clock and the bass; the lead counts down on one note.
      brk: { bars: 4, tracks: {
        lead: 'E5 . . . E5 . . . | E5 . . . E5 . . . | E5 . E5 . E5 . E5 . | E5 E5 E5 E5 G#5:2 . B5 .',
        bass: 'A1:2 . . . A1:2 . . . | A1:2 . . . A1:2 . . . | E1:2 . . . E1:2 . . . | E1:2 . . . E1:2 . E2:2 .',
        clock: rep(CLOCK, 4),
        drums: '. . . . . . . . | . . . . . . . . | k . . . k . . . | k . k . k s s s?',
      } },
    },
    // clock intro · A · A' · B · breakdown · A'
    order: ['intro', 'A', 'A2', 'B', 'brk', 'A2'],
    loopFrom: 1,
  });
})();
