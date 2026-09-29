// js/audio/songs/paper_sky.js — owner: W1-S. The title and credits theme (ART_AUDIO §13.4): 92 bpm,
// F major, 4/4; a hopeful whistle over a pluck, a warm pad, a soft bass and a brushed kit; AABA,
// 32 bars (83 s a loop) after a two-bar intro. The leitmotif "Paper Sky" (F A C D C: 0, +4, +7, +9,
// +7; ART_AUDIO §13.3) opens the A section on the whistle (the `motif` annotation). Original music.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.song('paper_sky', {
    bpm: 92, swing: 0,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'F', scale: 'major', gain: 0.8,
    inst: {
      lead: { preset: 'whistle', gain: 0.95, pan: 0.1 },
      pluck: { preset: 'pluck', gain: 0.65, pan: -0.25 },
      pad: { preset: 'pad', gain: 0.55, pan: 0 },
      bass: { preset: 'bass', gain: 0.45, pan: 0 },
      kit: { preset: 'kit', gain: 0.45, pan: 0.05 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        pluck: 'F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? . | F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? .',
        pad: '[F3 A3 C4]:16? . . . . . . . . . . . . . . . | [F3 A3 C4]:16? . . . . . . . . . . . . . . .',
        kit: 'k . . . b? . . . k . . . b? . . . | k . . . b? . . . k . . . b? . . .',
      } },
      A1: { bars: 2, tracks: {
        lead: 'F4:4 . . . A4:4 . . . C5:4 . . . D5:3 . . . | C5:8 . . . . . . . A4:4 . . . F4:2 . G4:2 .',
        pluck: 'F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? . | D3:2 . F3:2? . A3:2 . F3:2? . D3:2 . F3:2? . A3:2 . F3:2? .',
        pad: '[F3 A3 C4]:16? . . . . . . . . . . . . . . . | [D3 F3 A3]:16? . . . . . . . . . . . . . . .',
        bass: 'F2:6 . . . . . C3:2 . F2:6 . . . . . C3:2 . | D2:6 . . . . . A2:2 . D2:6 . . . . . A2:2 .',
        kit: 'k . z . b . z . k . z . b . z . | k . z . b . z . k . z k b . z z?',
      } },
      A2: { bars: 2, tracks: {
        lead: 'A4:2 . Bb4:2 . D5:4 . . . C5:4 . . . Bb4:2 . A4:2 . | G4:12 . . . . . . . . . . . - . . .',
        pluck: 'D3:2 . F3:2? . Bb3:2 . F3:2? . D3:2 . F3:2? . Bb3:2 . F3:2? . | E3:2 . G3:2? . C4:2 . G3:2? . E3:2 . G3:2? . C4:2 . G3:2? .',
        pad: '[D3 F3 Bb3]:16? . . . . . . . . . . . . . . . | [E3 G3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'Bb1:6 . . . . . F2:2 . Bb1:6 . . . . . F2:2 . | C2:6 . . . . . G2:2 . C2:6 . . . . . G2:2 .',
        kit: 'k . z . b . z . k . z . b . z . | k . z . b . z . k . z k b . z z?',
      } },
      A3: { bars: 2, tracks: {
        lead: 'F4:4 . . . A4:4 . . . C5:4 . . . D5:3 . . . | E5:8 . . . . . . . C5:4 . . . A4:4 . . .',
        pluck: 'F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? . | E3:2 . A3:2? . C4:2 . A3:2? . E3:2 . A3:2? . C4:2 . A3:2? .',
        pad: '[F3 A3 C4]:16? . . . . . . . . . . . . . . . | [E3 A3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'F2:6 . . . . . C3:2 . F2:6 . . . . . C3:2 . | A1:6 . . . . . E2:2 . A1:6 . . . . . E2:2 .',
        kit: 'k . z . b . z . k . z . b . z . | k . z . b . z . k . z k b . z z?',
      } },
      A4: { bars: 2, tracks: {
        lead: 'D5:4 . . . C5:2 . Bb4:2 . A4:4 . . . G4:4 . . . | F4:12 . . . . . . . . . . . - . . .',
        pluck: 'D3:2 . F3:2? . Bb3:2 . F3:2? . E3:2 . G3:2? . C4:2 . G3:2? . | F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? .',
        pad: '[D3 F3 Bb3]:8? . . . . . . . [E3 G3 C4]:8? . . . . . . . | [F3 A3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'Bb1:6 . . . . . F2:2 . C2:6 . . . . . G2:2 . | F2:6 . . . . . C3:2 . F2:6 . . . . . C3:2 .',
        kit: 'k . z . b . z . k . z . b . z . | k . z . b . z . k . z k b . z z?',
      } },
      A4b: { bars: 2, tracks: {
        lead: 'D5:4 . . . C5:2 . Bb4:2 . A4:4 . . . G4:4 . . . | F4:8 . . . . . . . A4:2 . C5:2 . D5:2 . F5:2 .',
        pluck: 'D3:2 . F3:2? . Bb3:2 . F3:2? . E3:2 . G3:2? . C4:2 . G3:2? . | F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? .',
        pad: '[D3 F3 Bb3]:8? . . . . . . . [E3 G3 C4]:8? . . . . . . . | [F3 A3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'Bb1:6 . . . . . F2:2 . C2:6 . . . . . G2:2 . | F2:6 . . . . . C3:2 . F2:6 . . . . . C3:2 .',
        kit: 'k . z . b . z . k . z . b . z . | k . z . b . z . k . z . b . b b?',
      } },
      A4e: { bars: 2, tracks: {
        lead: 'D5:4 . . . C5:2 . Bb4:2 . A4:4 . . . G4:4 . . . | F4:8 . . . . . . . - . . . . . . .',
        pluck: 'D3:2 . F3:2? . Bb3:2 . F3:2? . E3:2 . G3:2? . C4:2 . G3:2? . | F3:2 . A3:2? . C4:2 . A3:2? . F3:2 . A3:2? . C4:2 . A3:2? .',
        pad: '[D3 F3 Bb3]:8? . . . . . . . [E3 G3 C4]:8? . . . . . . . | [F3 A3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'Bb1:6 . . . . . F2:2 . C2:6 . . . . . G2:2 . | F2:6 . . . . . C3:2 . F2:6 . . . . . C3:2 .',
        kit: 'k . z . b . z . k . z . b . z . | k . z . b . z . k . z . b . b b?',
      } },
      B1: { bars: 2, tracks: {
        lead: 'F5:6 . . . . . E5:2 . D5:8 . . . . . . . | E5:6 . . . . . D5:2 . C5:8 . . . . . . .',
        pluck: 'D3:2 . F3:2? . Bb3:2 . F3:2? . D3:2 . F3:2? . Bb3:2 . F3:2? . | E3:2 . G3:2? . C4:2 . G3:2? . E3:2 . G3:2? . C4:2 . G3:2? .',
        pad: '[D3 F3 Bb3]:16? . . . . . . . . . . . . . . . | [E3 G3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'Bb1:6 . . . . . F2:2 . Bb1:6 . . . . . F2:2 . | C2:6 . . . . . G2:2 . C2:6 . . . . . G2:2 .',
        kit: 'k . z . b . z k . . z . b . z . | k . z . b . z k . . z . b . z .',
      } },
      B2: { bars: 2, tracks: {
        lead: 'C5:6 . . . . . Bb4:2 . A4:8 . . . . . . . | D5:6 . . . . . C5:2 . A4:8 . . . . . . .',
        pluck: 'E3:2 . A3:2? . C4:2 . A3:2? . E3:2 . A3:2? . C4:2 . A3:2? . | D3:2 . F3:2? . A3:2 . F3:2? . D3:2 . F3:2? . A3:2 . F3:2? .',
        pad: '[E3 A3 C4]:16? . . . . . . . . . . . . . . . | [D3 F3 A3]:16? . . . . . . . . . . . . . . .',
        bass: 'A1:6 . . . . . E2:2 . A1:6 . . . . . E2:2 . | D2:6 . . . . . A2:2 . D2:6 . . . . . A2:2 .',
        kit: 'k . z . b . z k . . z . b . z . | k . z . b . z k . . z . b . z .',
      } },
      B3: { bars: 2, tracks: {
        lead: 'Bb4:6 . . . . . A4:2 . G4:4 . . . Bb4:4 . . . | C5:6 . . . . . Bb4:2 . A4:4 . . . G4:4 . . .',
        pluck: 'D3:2 . G3:2? . Bb3:2 . G3:2? . D3:2 . G3:2? . Bb3:2 . G3:2? . | E3:2 . G3:2? . C4:2 . G3:2? . E3:2 . G3:2? . C4:2 . G3:2? .',
        pad: '[D3 G3 Bb3]:16? . . . . . . . . . . . . . . . | [E3 G3 C4]:16? . . . . . . . . . . . . . . .',
        bass: 'G1:6 . . . . . D2:2 . G1:6 . . . . . D2:2 . | C2:6 . . . . . G2:2 . C2:6 . . . . . G2:2 .',
        kit: 'k . z . b . z k . . z . b . z . | k . z . b . z k . . z . b . z .',
      } },
      B4: { bars: 2, tracks: {
        lead: 'A4:4 . . . C5:4 . . . D5:4 . . . F5:4 . . . | E5:8 . . . . . . . - . . . . . . .',
        pluck: 'F3:2 . A3:2? . C4:2 . A3:2? . D3:2 . F3:2? . Bb3:2 . F3:2? . | E3:2 . G3:2? . Bb3:2 . G3:2? . E3:2 . G3:2? . Bb3:2 . G3:2? .',
        pad: '[F3 A3 C4]:8? . . . . . . . [D3 F3 Bb3]:8? . . . . . . . | [E3 G3 Bb3]:16? . . . . . . . . . . . . . . .',
        bass: 'A1:6 . . . . . C2:2 . Bb1:6 . . . . . F2:2 . | C2:6 . . . . . G2:2 . C2:6 . . . . . G2:2 .',
        kit: 'k . z . b . z k . . z . b . z . | k . z . b . z . k . z . b . b b?',
      } },
    },
    // intro · A (A1-A4) · A (A1-A3, A4b lifts into B) · B (B1-B4) · A (A1-A3, A4e closes the loop)
    order: ['intro', 'A1', 'A2', 'A3', 'A4', 'A1', 'A2', 'A3', 'A4b', 'B1', 'B2', 'B3', 'B4', 'A1', 'A2', 'A3', 'A4e'],
    loopFrom: 1,
    motif: [{ pattern: 'A1', track: 'lead', step: 0 }],
  });
})();
