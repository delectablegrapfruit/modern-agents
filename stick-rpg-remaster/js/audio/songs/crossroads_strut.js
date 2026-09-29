// js/audio/songs/crossroads_strut.js — owner: W1-S. The city's day theme (ART_AUDIO §13.4): 104 bpm,
// E dorian, a light swing; a funky slap-bass ostinato, clav chops, a call-and-response lead, a soft
// pad, and the leitmotif as the horn hook (A C# E F# E over the dorian IV: 0, +4, +7, +9, +7;
// ART_AUDIO §13.3, the `motif` annotation). A and B sections and a two-bar breakdown; 28 bars
// (65 s) a loop. The `rain` variant replaces the hats with a rain-drum pattern (shaker and brush)
// and lowers the pad; SR.audio.music('crossroads_strut', { variant: 'rain' }) swaps it on the next
// bar line. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.song('crossroads_strut', {
    bpm: 104, swing: 0.12,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'E', scale: 'dorian', gain: 0.7,
    inst: {
      bass: { preset: 'slap', gain: 0.55, pan: 0 },
      clav: { preset: 'clav', gain: 0.6, pan: -0.3 },
      lead: { preset: 'lead', gain: 0.9, pan: 0.2 },
      horn: { preset: 'brass', gain: 0.9, pan: 0.15 },
      pad: { preset: 'pad', gain: 0.3, pan: 0 },
      drums: { preset: 'kit', gain: 0.7, pan: 0 },
      hats: { preset: 'kit', gain: 0.9, pan: 0.1 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        bass: 'E2:2 . . E2 E3 . D3 . E2:2 . G2 . A2 . B2 . | A2:2 . . A2 A3 . G2 . A2:2 . C#3 . E3 . G2 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k . . k . s . . .',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      A1: { bars: 2, tracks: {
        lead: 'B4:2 . D5:2 . E5:3 . . D5 B4:2 . A4 G4 . E4:2 . . | . . . . . . . . . . . . . . . .',
        horn: '. . . . . . . . . . . . . . . . | A4:2 . C#5:2 . E5:2 . F#5:3 . . E5:4 . . . . . .',
        clav: '. . [G3 B3 D4]? . . [G3 B3 D4] . . . . [G3 B3 D4] . . [G3 B3 D4]? . . | . . [G3 C#4 E4]? . . [G3 C#4 E4] . . . . [G3 C#4 E4] . . [G3 C#4 E4]? . .',
        pad: '[E3 G3 B3 D4]:16? . . . . . . . . . . . . . . . | [E3 G3 C#4]:16? . . . . . . . . . . . . . . .',
        bass: 'E2:2 . . E2 E3 . D3 . E2:2 . G2 . A2 . B2 . | A2:2 . . A2 A3 . G2 . A2:2 . C#3 . E3 . G2 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k . . k . s . . .',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      A2: { bars: 2, tracks: {
        lead: 'E5:2 . G5:2 . E5 D5 . B4:3 . . A4:2 . B4:2 . . . | . . . . . . . . . . . . . . . .',
        horn: '. . . . . . . . . . . . . . . . | E5:2 . D5:2 . C#5:2 . A4:6 . . . . . . . . .',
        clav: '. . [G3 B3 D4]? . . [G3 B3 D4] . . . . [G3 B3 D4] . . [G3 B3 D4]? . . | . . [G3 C#4 E4]? . . [G3 C#4 E4] . . . . [G3 C#4 E4] . . [G3 C#4 E4]? . .',
        pad: '[E3 G3 B3 D4]:16? . . . . . . . . . . . . . . . | [E3 G3 C#4]:16? . . . . . . . . . . . . . . .',
        bass: 'E2:2 . . E2 E3 . D3 . E2:2 . G2 . A2 . B2 . | A2:2 . . A2 A3 . G2 . A2:2 . C#3 . E3 . G2 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k . . k . s . . .',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      A4: { bars: 2, tracks: {
        lead: 'G5:3 . . E5:3 . . D5:2 . B4:4 . . . . . . . | A4:2 . B4:2 . D#5:4 . . . F#5:4 . . . . . . .',
        clav: '. . [G3 B3 E4]? . . [G3 B3 E4] . . . . [G3 B3 E4] . . [G3 B3 E4]? . . | . . [F#3 A3 D#4]? . . [F#3 A3 D#4] . . . . [F#3 A3 D#4] . . [F#3 A3 D#4]? . .',
        pad: '[E3 G3 B3]:16? . . . . . . . . . . . . . . . | [D#3 F#3 A3]:16? . . . . . . . . . . . . . . .',
        bass: 'C3:2 . . C3 C4 . B2 . C3:2 . E3 . G3 . B2 . | B2:2 . . B2 B3 . A2 . B2:2 . D#3 . F#3 . A2 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k k . s . s s? s s!',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      B1: { bars: 2, tracks: {
        lead: 'E5:6 . . . . . D5:2 . B4:4 . . . G4:4 . . . | A4:6 . . . . . F#4:2 . A4:4 . . . D5:4 . . .',
        horn: '[E4 G4 B4]:3? . . . . . . . . . . . . . . . | [F#4 A4 D5]:3? . . . . . . . . . . . . . . .',
        clav: '. . [G3 B3 E4]? . . [G3 B3 E4] . . . . [G3 B3 E4] . . [G3 B3 E4]? . . | . . [F#3 A3 D4]? . . [F#3 A3 D4] . . . . [F#3 A3 D4] . . [F#3 A3 D4]? . .',
        pad: '[E3 G3 B3]:16? . . . . . . . . . . . . . . . | [D3 F#3 A3]:16? . . . . . . . . . . . . . . .',
        bass: 'C3:2 . . C3 C4 . B2 . C3:2 . E3 . G3 . B2 . | D3:2 . . D3 D4 . C3 . D3:2 . F#3 . A3 . C3 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k . . k . s . . .',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      B2: { bars: 2, tracks: {
        lead: 'B4:6 . . . . . G4:2 . E4:8 . . . . . . . | E4:2 . F#4:2 . A4:2 . C#5:6 . . . . . . . . .',
        clav: '. . [G3 B3 D4]? . . [G3 B3 D4] . . . . [G3 B3 D4] . . [G3 B3 D4]? . . | . . [G3 C#4 E4]? . . [G3 C#4 E4] . . . . [G3 C#4 E4] . . [G3 C#4 E4]? . .',
        pad: '[E3 G3 B3 D4]:16? . . . . . . . . . . . . . . . | [E3 G3 C#4]:16? . . . . . . . . . . . . . . .',
        bass: 'E2:2 . . E2 E3 . D3 . E2:2 . G2 . A2 . B2 . | A2:2 . . A2 A3 . G2 . A2:2 . C#3 . E3 . G2 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k . . k . s . . .',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      B3: { bars: 2, tracks: {
        lead: 'G5:6 . . . . . E5:2 . D5:4 . . . B4:4 . . . | C5:6 . . . . . A4:2 . F#4:4 . . . A4:4 . . .',
        horn: '[E4 G4 B4]:3? . . . . . . . . . . . . . . . | [F#4 A4 D5]:3? . . . . . . . . . . . . . . .',
        clav: '. . [G3 B3 E4]? . . [G3 B3 E4] . . . . [G3 B3 E4] . . [G3 B3 E4]? . . | . . [F#3 A3 D4]? . . [F#3 A3 D4] . . . . [F#3 A3 D4] . . [F#3 A3 D4]? . .',
        pad: '[E3 G3 B3]:16? . . . . . . . . . . . . . . . | [D3 F#3 A3]:16? . . . . . . . . . . . . . . .',
        bass: 'C3:2 . . C3 C4 . B2 . C3:2 . E3 . G3 . B2 . | D3:2 . . D3 D4 . C3 . D3:2 . F#3 . A3 . C3 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k . . k . s . . .',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      B4: { bars: 2, tracks: {
        lead: 'A4:4 . . . C#5:4 . . . E5:4 . . . F#5:4 . . . | D#5:8 . . . . . . . B4:4 . . . - . . .',
        clav: '. . [E3 A3 C#4]? . . [E3 A3 C#4] . . . . [E3 A3 C#4] . . [E3 A3 C#4]? . . | . . [F#3 A3 D#4]? . . [F#3 A3 D#4] . . . . [F#3 A3 D#4] . . [F#3 A3 D#4]? . .',
        pad: '[E3 A3 C#4]:16? . . . . . . . . . . . . . . . | [D#3 F#3 A3]:16? . . . . . . . . . . . . . . .',
        bass: 'F#2:2 . . F#2 F#3 . E3 . F#2:2 . A2 . C#3 . E3 . | B2:2 . . B2 B3 . A2 . B2:2 . D#3 . F#3 . A2 .',
        drums: 'k . . . s . . k k . . . s . . . | k . . . s . . k k . s . s s? s s!',
        hats: 'h . h h? h . h . h . h h? h . o . | h . h . h . h h? h . h . h . o .',
      } },
      brk1: { bars: 2, tracks: {
        clav: '. . [G3 B3 D4]? . . [G3 B3 D4] . . . . [G3 B3 D4] . . [G3 B3 D4]? . . | . . [G3 C#4 E4]? . . [G3 C#4 E4] . . . . [G3 C#4 E4] . . [G3 C#4 E4]? . .',
        bass: 'E2:2 . . E2 E3 . D3 . E2:2 . G2 . A2 . B2 . | A2:2 . . A2 A3 . G2 . A2:2 . C#3 . E3 . G2 .',
        drums: 'k . . . c . . . k . k . c . . . | k . . . c . . . k . k . c . . .',
      } },
      brk2: { bars: 2, tracks: {
        clav: '. . [G3 B3 D4]? . . [G3 B3 D4] . . . . [G3 B3 D4] . . [G3 B3 D4]? . . | . . [G3 C#4 E4]? . . [G3 C#4 E4] . . . . [G3 C#4 E4] . . [G3 C#4 E4]? . .',
        bass: 'E2:2 . . E2 E3 . D3 . E2:2 . G2 . A2 . B2 . | A2:2 . . A2 A3 . G2 . A2:2 . C#3 . E3 . G2 .',
        drums: 'k . . . c . . . k . k . c . . . | k . . . c . . . t . t t? t . t .',
      } },
    },
    // intro · A (A1 A2 A1 A4) · B (B1-B4) · A (A1 A2 A1 A4) · breakdown
    order: ['intro', 'A1', 'A2', 'A1', 'A4', 'B1', 'B2', 'B3', 'B4', 'A1', 'A2', 'A1', 'A4', 'brk1', 'brk2'],
    loopFrom: 1,
    variants: {
      rain: {
        tracks: {
          hats: {
            intro: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            A1: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            A2: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            A4: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            B1: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            B2: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            B3: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
            B4: 'z . z z? b . z . z . z z? b . z z? | z . z . b . z z? z . z . b . z .',
          },
        },
        inst: { pad: { gain: 0.15 }, hats: { gain: 0.7 } },
      },
    },
    motif: [{ pattern: 'A1', track: 'horn', step: 16 }],
  });
})();
