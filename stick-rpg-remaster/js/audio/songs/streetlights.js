// js/audio/songs/streetlights.js — owner: W2-Music. The city's night theme (ART_AUDIO §13.4): 84 bpm,
// D minor, a lazy swing (swung eighths: two steps a beat, the off-beat a third of a beat late); lo-fi
// swung hats, Rhodes chords (keys), a sparse walking bass and a vinyl crackle (faint ghost rim and
// shaker ticks off the grid's strong beats). It shares the day theme's harmonic grid: a two-bar
// minor i - IV vamp for the A section (Dm9 - G13 here, Em7 - A there), a B section that leaves it,
// so W2-City's 4 s cross-fades at 19:30 and 05:30 land on the same kind of bar. A (vamp), A' (the
// Rhodes melody over it), B, and a four-bar breakdown; 28 bars (80 s) a loop after a two-bar intro.
// Like the day theme it has a `rain` variant (ART_AUDIO §13.4: the rain swaps the drum pattern on
// the bar line): the swung hats become a rain-drum of shaker and brush, and the Rhodes sit lower;
// js/scenes/city.js asks for it whenever the song has one and it rains (the P1 `weather` flag).
// Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }

  // Chords (Rhodes voicings, rootless) and the comping rhythm: the chord on 1, a ghost re-strike on
  // the swung 2-and.
  var DM9 = '[F3 A3 C4 E4]', G13 = '[F3 B3 E4]', BBM7 = '[A3 D4 F4]', A7 = '[G3 C#4 F4]', GM7 = '[F3 Bb3 D4]',
    A7B = '[G3 C#4 E4]', AM7 = '[G3 C4 E4]', DM7 = '[F3 A3 C4]', GM9 = '[F3 A3 Bb3 D4]', C9 = '[E3 Bb3 D4]',
    FM7 = '[E3 A3 C4]';
  function comp(ch) { return ch + ':3 . . ' + ch + ':5? . . . .'; }
  function hold(ch) { return ch + ':8? . . . . . . .'; }

  var HATS = 'h h? h h? h h? h h?';
  var HATS2 = 'h h? h h? h h? o? h?';
  var RAIN = 'z z? b? z? z z? b? z?';
  var RAIN2 = 'z z? b? z? z z? b b?';
  var BEAT1 = 'k . s . . k s .';
  var BEAT2 = 'k . s k . . s k?';
  var CRACKLE = '. r? . . z? . . . | . . . r? . . z? .';

  // The A-section bass (sparse walking; it leans into the next chord on the last eighth).
  var BASS_A = 'D2:3 . . A1 D2:2 . E2 F2 | G1:3 . . D2 G2:2 . F2 E2';

  SR.def.song('streetlights', {
    bpm: 84, swing: 0.33,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'D', scale: 'minor', gain: 0.74,
    inst: {
      keys: { preset: 'keys', gain: 0.5, pan: -0.15 },
      mel: { preset: 'keys', gain: 0.7, pan: 0.25 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      drums: { preset: 'kit', gain: 0.6, pan: 0 },
      hats: { preset: 'kit', gain: 0.9, pan: 0.2 },
      crackle: { preset: 'kit', gain: 0.5, pan: -0.3 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        keys: hold(DM9) + ' | ' + hold(G13),
        crackle: CRACKLE,
      } },
      A1: { bars: 2, tracks: {
        keys: comp(DM9) + ' | ' + comp(G13),
        bass: BASS_A,
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      A2: { bars: 2, tracks: {
        keys: comp(BBM7) + ' | ' + comp(A7),
        bass: 'Bb1:3 . . F2 Bb1:2 . D2 C#2 | A1:3 . . E2 A1:2 . G1 C#2',
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      A3: { bars: 2, tracks: {
        keys: comp(DM9) + ' | ' + GM7 + ':3 . . ' + GM7 + ':1? ' + A7B + ':4 . . .',
        bass: 'D2:3 . . A1 D2:2 . C2 A1 | G1:3 . . D2 A1:3 . . C#2',
        drums: BEAT1 + ' | ' + 'k . s . k . s s?',
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      M1: { bars: 2, tracks: {
        mel: '. . A4 C5 D5:3 . . C5 | E5:4 . . . D5 B4:3 . .',
        keys: comp(DM9) + ' | ' + comp(G13),
        bass: BASS_A,
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      M2: { bars: 2, tracks: {
        mel: 'A4:2 . C5 . F5:3 . . E5 | D5:6 . . . . . . .',
        keys: comp(DM9) + ' | ' + comp(G13),
        bass: BASS_A,
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      M3: { bars: 2, tracks: {
        mel: '. . F5 E5 D5:2 . A4 . | C#5:4 . . . E5 G5:3 . .',
        keys: comp(BBM7) + ' | ' + comp(A7),
        bass: 'Bb1:3 . . F2 Bb1:2 . D2 C#2 | A1:3 . . E2 A1:2 . G1 C#2',
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      M4: { bars: 2, tracks: {
        mel: 'F5:3 . . E5 D5:2 . C5 . | Bb4:2 . D5 . C#5:4 . . .',
        keys: comp(DM9) + ' | ' + GM7 + ':3 . . ' + GM7 + ':1? ' + A7B + ':4 . . .',
        bass: 'D2:3 . . A1 D2:2 . C2 A1 | G1:3 . . D2 A1:3 . . C#2',
        drums: BEAT1 + ' | ' + 'k . s . k . s s?',
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      B1: { bars: 2, tracks: {
        mel: 'D5:3 . . F5 A5:4 . . . | G5 F5 D5:2 . C5:4 . . .',
        keys: comp(BBM7) + ' | ' + comp(BBM7),
        bass: 'Bb1:3 . . F2 Bb1:2 . A1 G1 | Bb1:3 . . D2 F2:2 . G2 A1',
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      B2: { bars: 2, tracks: {
        mel: 'E5:3 . . C5 A4:2 . G4 . | A4:6 . . . . . . .',
        keys: comp(AM7) + ' | ' + comp(DM7),
        bass: 'A1:3 . . E2 A1:2 . C2 C#2 | D2:3 . . A1 D2:2 . F2 E2',
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      B3: { bars: 2, tracks: {
        mel: '. . Bb4 D5 F5:2 . A5 . | G5:3 . . E5 D5:2 . Bb4 .',
        keys: comp(GM9) + ' | ' + comp(C9),
        bass: 'G1:3 . . D2 G1:2 . Bb1 B1 | C2:3 . . G1 C2:2 . E2 E2',
        drums: BEAT1 + ' | ' + BEAT2,
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      B4: { bars: 2, tracks: {
        mel: 'A4:2 . C5 . E5:4 . . . | C#5:3 . . E5 G5:4 . . .',
        keys: comp(FM7) + ' | ' + comp(A7),
        bass: 'F2:3 . . C2 F2:2 . E2 D2 | A1:3 . . E2 A1:2 . B1 C#2',
        drums: BEAT1 + ' | ' + 'k . s . k s? s s?',
        hats: HATS + ' | ' + HATS2,
        crackle: CRACKLE,
      } },
      // The breakdown: the kit drops to the crackle and a rim, the Rhodes holds, the bass walks alone.
      brk1: { bars: 2, tracks: {
        keys: hold(DM9) + ' | ' + hold(G13),
        bass: 'D2:2 . F2:2 . A2:2 . C3:2 . | B2:2 . G2:2 . F2:2 . E2:2 .',
        drums: rep('. . r? . . . r? .', 2),
        crackle: CRACKLE,
      } },
      brk2: { bars: 2, tracks: {
        keys: hold(DM9) + ' | ' + GM7 + ':4? . . . ' + A7B + ':4? . . .',
        bass: 'D2:2 . C2:2 . A1:2 . F1:2 . | G1:2 . Bb1:2 . A1:2 . C#2:2 .',
        drums: '. . r? . . . r? . | . . r? . k? . s? s?',
        crackle: CRACKLE,
      } },
    },
    // intro · A (vamp) · A' (the melody) · B · breakdown
    order: ['intro', 'A1', 'A1', 'A2', 'A3', 'M1', 'M2', 'M3', 'M4', 'B1', 'B2', 'B3', 'B4', 'brk1', 'brk2'],
    loopFrom: 1,
    variants: {
      rain: {
        tracks: { hats: ['A1', 'A2', 'A3', 'M1', 'M2', 'M3', 'M4', 'B1', 'B2', 'B3', 'B4'].reduce(function (o, p) {
          o[p] = RAIN + ' | ' + RAIN2;
          return o;
        }, {}) },
        inst: { hats: { gain: 0.75 }, keys: { gain: 0.4 } },
      },
    },
  });
})();
