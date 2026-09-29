// js/audio/songs/funky_aisle.js — owner: W2-Music. Funkytown Five-O, the convenience store (ART_AUDIO
// §13.4): 100 bpm, E minor (aeolian, with the harmonic-minor B7#9), sixteenths; a slap-bass riff
// that leans on the "e" and "a", a wah-ish square lead (the harmonica preset: a square through a
// 1.5 kHz band-pass, with vibrato) in call-and-response phrases, clav chops on the off-beats, a
// clap backbeat with ghost snares, off-beat hats. A (Em9 - Cmaj9 - B7#9), A' (the answer phrases),
// B (a walk down the circle to B7#9), A A' again and a four-bar breakdown (slap and clap alone); 28
// bars (67 s) a loop after a two-bar count-in. Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of clav chops on the off-beat eighths (the second and fourth ghosted). */
  function chop(ch) { return '. . ' + ch + ' . . . ' + ch + '? . . . ' + ch + ' . . . ' + ch + '? .'; }
  /** @returns {string} one bar of the breakdown's chops: two stabs and a pickup. */
  function stab(ch) { return '. . ' + ch + ':2 . . . . . . . ' + ch + ':2 . . . ' + ch + '? .'; }

  var EM9 = '[G3 B3 D4 F#4]', CM9 = '[E3 G3 B3 D4]', B79 = '[D#3 A3 D4]', AM9 = '[G3 B3 C4 E4]', D9 = '[F#3 C4 E4]',
    GM7 = '[F#3 B3 D4]', CM7 = '[E3 G3 B3]', FSM7B5 = '[E3 A3 C4]';

  var GROOVE = 'k . . k? c . . s? . k . . c . . k?';
  var GROOVE2 = 'k . . k? c . . s? . k . . c . s? s';
  var HATS = '. . h . . . h . . . h . . . o .';
  var BASS_A = 'E2:2 . . E2? . . B2 . E2:2 . . . G2 . A2 B2 | E2:2 . . E2? . . B2 D3? E2:2 . . E3? D3 . B2 . | ' +
    'C2:2 . . C2? . . G2 . C3:2 . . . B2 . G2 . | B1:2 . . B1? . . F#2 A2? B2:2 . . A2 . F#2 . D#2';
  var CHOPS_A = [chop(EM9), chop(EM9), chop(CM9), chop(B79)].join(' | ');

  SR.def.song('funky_aisle', {
    bpm: 100, swing: 0.06,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'E', scale: 'minor', gain: 0.8,
    inst: {
      bass: { preset: 'slap', gain: 0.6, pan: 0 },
      wah: { preset: 'harmonica', gain: 0.7, pan: 0.25 },
      clav: { preset: 'clav', gain: 0.45, pan: -0.3 },
      drums: { preset: 'kit', gain: 0.75, pan: 0 },
      hats: { preset: 'kit', gain: 0.95, pan: 0.15 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        bass: 'E2:2 . . E2? . . B2 . E2:2 . . . G2 . A2 B2 | E2:2 . . E2? . . B2 D3? E2:2 . . E3? D3 . B2 .',
        drums: 'k . . . c . . . k . . . c . . . | k . . k? c . . s? . k . . c s? s s!',
      } },
      A1: { bars: 4, tracks: {
        wah: '. . . . . . G4 A4 B4:3 . . D5 B4 . . . | A4:2 . G4 . E4:4 . . . . . . . . . . . | ' +
          '. . . . . . E5 D5 B4:2 . G4 . A4 . B4 . | D#5:4 . . . D5 . B4 . A4:4 . . . F#4 . . .',
        clav: CHOPS_A,
        bass: BASS_A,
        drums: rep(GROOVE, 3) + ' | ' + GROOVE2,
        hats: rep(HATS, 4),
      } },
      A2: { bars: 4, tracks: {
        wah: '. . . . . . G4 A4 B4:3 . . D5 E5 . D5 . | B4:2 . A4 . G4:2 . E4 . G4:4 . . . . . . . | ' +
          'E4 . G4 . B4 . D5 . E5:4 . . . D5 . B4 . | A4:3 . . F#4 D#4:4 . . . - . . . . . . .',
        clav: CHOPS_A,
        bass: BASS_A,
        drums: rep(GROOVE, 3) + ' | ' + GROOVE2,
        hats: rep(HATS, 4),
      } },
      B1: { bars: 4, tracks: {
        wah: 'E5:6 . . . . . D5:2 . C5:4 . . . B4:4 . . . | A4:6 . . . . . F#4:2 . A4:4 . . . C5:4 . . . | ' +
          'B4:6 . . . . . A4:2 . F#4:4 . . . D4:4 . . . | E4:8 . . . . . . . G4:4 . . . B4:4 . . .',
        clav: [chop(AM9), chop(D9), chop(GM7), chop(CM7)].join(' | '),
        bass: 'A1:2 . . A1? . . E2 . A2:2 . . . G2 . E2 . | D2:2 . . D2? . . A2 . D3:2 . . . C3 . A2 . | ' +
          'G1:2 . . G1? . . D2 . G2:2 . . . F#2 . D2 . | C2:2 . . C2? . . G2 . C3:2 . . . B2 . G2 .',
        drums: rep(GROOVE, 3) + ' | ' + GROOVE2,
        hats: rep(HATS, 4),
      } },
      B2: { bars: 4, tracks: {
        wah: 'C5:6 . . . . . A4:2 . E5:8 . . . . . . . | D#5:4 . . . F#5:4 . . . D5:4 . . . B4:4 . . . | ' +
          'G4:4 . . . B4:4 . . . D5:4 . . . F#5:4 . . . | D#5:8 . . . . . . . - . . . . . . .',
        clav: [chop(FSM7B5), chop(B79), chop(EM9), chop(B79)].join(' | '),
        bass: 'F#1:2 . . F#1? . . C2 . F#2:2 . . . E2 . C2 . | B1:2 . . B1? . . F#2 . B2:2 . . . A2 . F#2 . | ' +
          'E2:2 . . E2? . . B2 . E2:2 . . . G2 . A2 B2 | B1:2 . . B1? . . F#2 A2? B2:2 . . A2 . F#2 . D#2',
        drums: rep(GROOVE, 3) + ' | k . . k? c . . s? . k . . c s? s s!',
        hats: rep(HATS, 4),
      } },
      // The breakdown: the slap and the clap alone, the clav stabbing, a ghost-snare pickup.
      brk: { bars: 4, tracks: {
        clav: [stab(EM9), '. . . . . . . . . . . . . . . .', stab(CM9), stab(B79)].join(' | '),
        bass: BASS_A,
        drums: 'k . . . c . . . k . . . c . . . | k . . . c . . . k . . k? c . . . | k . . . c . . . k . . . c . . . | ' +
          'k . . k? c . . s? . k . . c . s? .',
      } },
    },
    // count-in · A · A' · B · A · A' · breakdown
    order: ['intro', 'A1', 'A2', 'B1', 'B2', 'A1', 'A2', 'brk'],
    loopFrom: 1,
  });
})();
