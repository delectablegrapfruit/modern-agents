// js/audio/songs/morning_edition.js — owner: W2-Music. The morning report's sting (ART_AUDIO §13.4): four
// bars, 104 bpm, F major, played once when the paper lands after a night (js/scenes/report.js). The
// leitmotif "Paper Sky" (F A C D C: 0, +4, +7, +9, +7; ART_AUDIO §13.3) rings on the bells (the
// `motif` annotation), answered and closed on an F chord; a plucked arpeggio, a warm pad and a soft
// bass under it, and a paper-rustle (ghosted brush and shaker flurries: the paper unfolding in bar 1,
// a page turning in bar 4). No loop: the paper is read in the quiet after it. Original music. Pure
// data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.song('morning_edition', {
    bpm: 104, swing: 0,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'F', scale: 'major', gain: 0.76,
    inst: {
      bells: { preset: 'bell', gain: 0.72, pan: 0.1 },
      pluck: { preset: 'pluck', gain: 0.5, pan: -0.25 },
      pad: { preset: 'pad', gain: 0.65, pan: 0 },
      bass: { preset: 'bass', gain: 0.4, pan: 0 },
      rustle: { preset: 'kit', gain: 0.8, pan: 0.3 },
    },
    patterns: {
      // F | Dm | Bb C | F: the motif, its answer, the turn home, the chord.
      news: { bars: 4, tracks: {
        bells: 'F5:4 . . . A5:4 . . . C6:4 . . . D6:3 . . . | C6:8 . . . . . . . A5:4 . . . F5:4 . . . | ' +
          'F5:4 . . . D5:4 . . . E5:4 . . . G5:4 . . . | [F5 A5 C6]:16 . . . . . . . . . . . . . . .',
        pluck: 'F3:2 . C4:2? . A3:2 . C4:2? . F3:2 . C4:2? . A3:2 . C4:2? . | D3:2 . A3:2? . F3:2 . A3:2? . D3:2 . A3:2? . F3:2 . A3:2? . | ' +
          'Bb2:2 . F3:2? . D3:2 . F3:2? . C3:2 . G3:2? . E3:2 . G3:2? . | F3:2 . C4:2? . A3:2 . F4:10 . . . . . . . . .',
        pad: '[F3 A3 C4]:16? . . . . . . . . . . . . . . . | [D3 F3 A3]:16? . . . . . . . . . . . . . . . | ' +
          '[D3 F3 Bb3]:8? . . . . . . . [E3 G3 C4]:8? . . . . . . . | [F3 A3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'F2:8 . . . . . . . C2:8 . . . . . . . | D2:8 . . . . . . . A1:8 . . . . . . . | ' +
          'Bb1:8 . . . . . . . C2:8 . . . . . . . | F2:16 . . . . . . . . . . . . . . .',
        rustle: 'b? z? b? z? z? . b? . . . . . . . . . | . . . . . . . . . . . . . . . . | ' +
          '. . . . . . . . . . . . . . . . | . . . . . . . . b? z? z? b? z? . z? .',
      } },
    },
    order: ['news'],
    motif: [{ pattern: 'news', track: 'bells', step: 0 }],
  });
})();
