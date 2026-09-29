// js/audio/songs/campus_canon.js — owner: W2-Music. The U of S and the City Hall lobby (ART_AUDIO
// §13.4): 90 bpm, G major, straight eighths; a baroque-ish two-voice canon on two plucks (left and
// right) over a bassoon-ish square ground (the harmonica preset low down: a square through a 1.5 kHz
// band-pass) and a soft organ continuo. The follower plays the leader's line four bars later, and
// the ground repeats every four bars, so each phrase meets the harmony it was written over (and its
// own continuation) when it comes round again. A (G - Em - C - D, four phrases, the last a free
// counterpoint), B in the relative minor (Em - C - Am - B7, three phrases) and a two-bar return
// (C - D7); 30 bars (80 s) a loop after a two-bar ground. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var REST4 = '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . .';

  // The leader's phrases (four bars each). A: over G - Em - C - D.
  var M1 = 'D5:4 . . . B4:4 . . . | G4:4 . . . E4:4 . . . | E4:2 . G4:2 . C5:4 . . . | A4:4 . . . F#4:4 . . .';
  var M2 = 'G4:2 . A4:2 . B4:2 . D5:2 . | E5:2 . D5:2 . B4:2 . G4:2 . | C5:2 . E5:2 . G5:2 . E5:2 . | D5:2 . C5:2 . A4:2 . F#4:2 .';
  var M3 = 'B4 C5 D5 B4 G4 A4 B4 G4 | E4 F#4 G4 E4 B4 A4 G4 F#4 | G4 A4 G4 E4 C4 D4 E4 C4 | F#4 G4 A4 F#4 D4 E4 F#4 A4';
  var M4 = 'G5:4 . . . D5:4 . . . | E5:4 . . . B4:4 . . . | C5:4 . . . E5:4 . . . | D5:6 . . . . . C5:2 .';
  // B: over Em - C - Am - B7.
  var N1 = 'B4:4 . . . G4:4 . . . | E4:4 . . . G4:2 . C5:2 . | A4:4 . . . E4:4 . . . | D#4:4 . . . F#4:2 . A4:2 .';
  var N2 = 'E5 D#5 E5 B4 G4 A4 B4 G4 | C5 B4 C5 G4 E4 F#4 G4 E4 | A4 G#4 A4 E4 C5 B4 A4 C5 | B4 A4 B4 F#4 D#4 E4 F#4 A4';
  var N3 = 'G5:4 . . . E5:4 . . . | E5:4 . . . C5:4 . . . | C5:4 . . . E5:4 . . . | D#5:4 . . . B4:4 . . .';

  // The grounds (the bassoon walks the chord in quarters).
  var GROUND_A = 'G2:2 . B2:2 . D3:2 . B2:2 . | E2:2 . G2:2 . B2:2 . G2:2 . | C3:2 . G2:2 . E2:2 . G2:2 . | D2:2 . F#2:2 . A2:2 . C3:2 .';
  var GROUND_B = 'E2:2 . B2:2 . G2:2 . B2:2 . | C2:2 . G2:2 . E2:2 . G2:2 . | A2:2 . E2:2 . C3:2 . E2:2 . | B1:2 . D#2:2 . F#2:2 . A2:2 .';

  // A soft organ continuo under the grounds (one chord a bar).
  var ORGAN_A = '[B3 D4]:8? . . . . . . . | [B3 E4]:8? . . . . . . . | [C4 E4]:8? . . . . . . . | [A3 D4]:8? . . . . . . .';
  var ORGAN_B = '[G3 B3]:8? . . . . . . . | [G3 C4]:8? . . . . . . . | [A3 C4]:8? . . . . . . . | [A3 D#4]:8? . . . . . . .';

  SR.def.song('campus_canon', {
    bpm: 90, swing: 0,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'G', scale: 'major', gain: 1,
    inst: {
      lead: { preset: 'pluck', gain: 0.64, pan: -0.35 },
      follow: { preset: 'pluck', gain: 0.62, pan: 0.35 },
      bassoon: { preset: 'harmonica', gain: 0.8, pan: 0 },
      organ: { preset: 'organ', gain: 0.7, pan: 0.1 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        bassoon: 'G2:4 . . . D2:4 . . . | G2:2 . A2:2 . B2:2 . D3:2 .',
      } },
      a1: { bars: 4, tracks: { lead: M1, follow: REST4, bassoon: GROUND_A, organ: ORGAN_A } },
      a2: { bars: 4, tracks: { lead: M2, follow: M1, bassoon: GROUND_A, organ: ORGAN_A } },
      a3: { bars: 4, tracks: { lead: M3, follow: M2, bassoon: GROUND_A, organ: ORGAN_A } },
      a4: { bars: 4, tracks: { lead: M4, follow: M3, bassoon: GROUND_A, organ: ORGAN_A } },
      b1: { bars: 4, tracks: { lead: N1, follow: REST4, bassoon: GROUND_B, organ: ORGAN_B } },
      b2: { bars: 4, tracks: { lead: N2, follow: N1, bassoon: GROUND_B, organ: ORGAN_B } },
      b3: { bars: 4, tracks: { lead: N3, follow: N2, bassoon: GROUND_B, organ: ORGAN_B } },
      // The return: C - D7 back to G, the follower resting.
      ret: { bars: 2, tracks: {
        lead: 'E5:4 . . . E5 D5 C5 B4 | A4:2 . F#4:2 . D4:2 . C5:2 .',
        bassoon: 'C3:2 . B2:2 . A2:2 . G2:2 . | F#2:2 . A2:2 . D2:2 . C3:2 .',
        organ: '[C4 E4]:8? . . . . . . . | [A3 D4]:8? . . . . . . .',
      } },
    },
    // ground · A (the canon in G) · B (the canon in E minor) · the return
    order: ['intro', 'a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'ret'],
    loopFrom: 1,
  });
})();
