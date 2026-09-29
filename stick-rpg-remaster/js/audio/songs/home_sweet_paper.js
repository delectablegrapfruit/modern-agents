// js/audio/songs/home_sweet_paper.js — owner: W1-S. The home theme (ART_AUDIO §13.4): 76 bpm, C major,
// 3/4; a music-box lullaby (bell) over a soft pad and a plucked waltz accompaniment; AABA, 32 bars
// (76 s) a loop after a two-bar intro. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.song('home_sweet_paper', {
    bpm: 76, swing: 0,
    meter: [3, 4], stepsPerBeat: 4,
    key: 'C', scale: 'major', gain: 0.85,
    inst: {
      box: { preset: 'bell', gain: 0.85, pan: 0.15 },
      pad: { preset: 'pad', gain: 0.6, pan: 0 },
      waltz: { preset: 'pluck', gain: 0.7, pan: -0.2 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        pad: '[E3 G3 C4]:12? . . . . . . . . . . . | [E3 G3 C4]:12? . . . . . . . . . . .',
        waltz: 'C3:4 . . . [E3 G3]:4? . . . [E3 G3]:4? . . . | C3:4 . . . [E3 G3]:4? . . . [E3 G3]:4? . . .',
      } },
      A1: { bars: 2, tracks: {
        box: 'E5:4 . . . G5:4 . . . E5:4 . . . | C5:8 . . . . . . . E5:4 . . .',
        pad: '[E3 G3 C4]:12? . . . . . . . . . . . | [E3 A3 C4]:12? . . . . . . . . . . .',
        waltz: 'C3:4 . . . [E3 G3]:4? . . . [E3 G3]:4? . . . | A2:4 . . . [E3 A3]:4? . . . [E3 A3]:4? . . .',
      } },
      A2: { bars: 2, tracks: {
        box: 'F5:4 . . . A5:4 . . . F5:4 . . . | D5:12 . . . . . . . . . . .',
        pad: '[F3 A3 C4]:12? . . . . . . . . . . . | [D3 G3 B3]:12? . . . . . . . . . . .',
        waltz: 'F2:4 . . . [A3 C4]:4? . . . [A3 C4]:4? . . . | G2:4 . . . [D3 B3]:4? . . . [D3 B3]:4? . . .',
      } },
      A3: { bars: 2, tracks: {
        box: 'E5:4 . . . G5:4 . . . C6:4 . . . | B5:4 . . . A5:4 . . . E5:4 . . .',
        pad: '[E3 G3 C4]:12? . . . . . . . . . . . | [E3 A3 C4]:12? . . . . . . . . . . .',
        waltz: 'C3:4 . . . [E3 G3]:4? . . . [E3 G3]:4? . . . | A2:4 . . . [E3 A3]:4? . . . [E3 A3]:4? . . .',
      } },
      A4: { bars: 2, tracks: {
        box: 'F5:4 . . . E5:2 . D5:2 . B4:4 . . . | C5:12 . . . . . . . . . . .',
        pad: '[D3 F3 A3]:8? . . . . . . . [D3 G3 B3]:4? . . . | [E3 G3 C4]:12? . . . . . . . . . . .',
        waltz: 'D3:4 . . . [F3 A3]:4? . . . [D3 B3]:4? . . . | C3:4 . . . [E3 G3]:4? . . . [E3 G3]:4? . . .',
      } },
      A4b: { bars: 2, tracks: {
        box: 'F5:4 . . . E5:2 . D5:2 . B4:4 . . . | C5:8 . . . . . . . G4:2 . A4:2 .',
        pad: '[D3 F3 A3]:8? . . . . . . . [D3 G3 B3]:4? . . . | [E3 G3 C4]:12? . . . . . . . . . . .',
        waltz: 'D3:4 . . . [F3 A3]:4? . . . [D3 B3]:4? . . . | C3:4 . . . [E3 G3]:4? . . . [E3 G3]:4? . . .',
      } },
      B1: { bars: 2, tracks: {
        box: 'A5:6 . . . . . G5:2 . F5:4 . . . | D5:6 . . . . . E5:2 . F5:4 . . .',
        pad: '[F3 A3 C4]:12? . . . . . . . . . . . | [D3 G3 B3]:12? . . . . . . . . . . .',
        waltz: 'F2:4 . . . [A3 C4]:4? . . . [A3 C4]:4? . . . | G2:4 . . . [D3 B3]:4? . . . [D3 B3]:4? . . .',
      } },
      B2: { bars: 2, tracks: {
        box: 'G5:6 . . . . . F5:2 . E5:4 . . . | C5:6 . . . . . D5:2 . E5:4 . . .',
        pad: '[E3 G3 B3]:12? . . . . . . . . . . . | [E3 A3 C4]:12? . . . . . . . . . . .',
        waltz: 'E3:4 . . . [G3 B3]:4? . . . [G3 B3]:4? . . . | A2:4 . . . [E3 A3]:4? . . . [E3 A3]:4? . . .',
      } },
      B3: { bars: 2, tracks: {
        box: 'F5:4 . . . A5:4 . . . D6:4 . . . | B5:6 . . . . . A5:2 . G5:4 . . .',
        pad: '[D3 F3 A3]:12? . . . . . . . . . . . | [D3 G3 B3]:12? . . . . . . . . . . .',
        waltz: 'D3:4 . . . [F3 A3]:4? . . . [F3 A3]:4? . . . | G2:4 . . . [D3 B3]:4? . . . [D3 B3]:4? . . .',
      } },
      B4: { bars: 2, tracks: {
        box: 'E5:4 . . . G5:4 . . . A5:4 . . . | G5:8 . . . . . . . - . . .',
        pad: '[E3 G3 C4]:8? . . . . . . . [F3 A3 C4]:4? . . . | [D3 F3 B3]:12? . . . . . . . . . . .',
        waltz: 'E3:4 . . . [G3 C4]:4? . . . [A3 C4]:4? . . . | G2:4 . . . [F3 B3]:4? . . . [F3 B3]:4? . . .',
      } },
    },
    // intro · A (A1-A4) · A (A1-A3, A4b lifts into B) · B (B1-B4) · A (A1-A4)
    order: ['intro', 'A1', 'A2', 'A3', 'A4', 'A1', 'A2', 'A3', 'A4b', 'B1', 'B2', 'B3', 'B4', 'A1', 'A2', 'A3', 'A4'],
    loopFrom: 1,
  });
})();
