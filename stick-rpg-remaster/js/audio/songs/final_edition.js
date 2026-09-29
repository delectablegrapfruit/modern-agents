// js/audio/songs/final_edition.js — owner: W2-Music. The results anthem (ART_AUDIO §13.4; UI §5.14), 84 → 100
// bpm, D major, 4/4. A reflective intro at 84 (Rhodes arpeggios, a warm pad, the whistle remembering
// the title), a one-bar lift at 92 (a snare roll and a walking bass), then the anthem at 100: the
// leitmotif "Paper Sky" as its brass hook (D F# A B A: 0, +4, +7, +9, +7; ART_AUDIO §13.3, the `motif`
// annotation) over strummed chords, a pad, a driving bass and a backbeat; A A' B B' A A'' and a
// four-bar breakdown where the whistle sings the motif alone over the Rhodes;
// 28 bars (67 s) a loop from the anthem. Variants for js/scenes/results.js:
// - `stamp`: every pitched track a whole tone up (E major). The results ask for it when the rank
//   stamp lands (about 2.9 s in, during the intro, which holds D for two bars so the lift is heard),
//   and SR.audio.music switches on the next bar line: "key change up a tone on the stamp".
// - `minor`: below $1,500 of net worth. D minor, reflective to the end: the intro on Dm9 - B♭maj7 -
//   Gm7 - C7, the anthem's hook sung in the relative major (F A C D C over F, so the leitmotif keeps
//   its intervals) and answered in D minor, the brass softer.
// Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /** @returns {string} a step string with every note moved n semitones (sharps spelled), lengths and accents kept. */
  function up(str, n) {
    return str.replace(/([A-G])([#b]?)(\d)/g, function (m, l, acc, oct) {
      var mi = (Number(oct) + 1) * 12 + SEMI[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + n;
      return SHARP[mi % 12] + (Math.floor(mi / 12) - 1);
    });
  }
  /** @returns {string} the bars joined with bar lines. */
  function bars() { return Array.prototype.slice.call(arguments).join(' | '); }

  // ---- bar builders ----
  /** A pad chord held for the bar. */
  function pad(ch) { return ch + ':16? . . . . . . . . . . . . . . .'; }
  /** The anthem's strummed chords (a plucked string, cheaper than the Rhodes): on the 2 and a ghost on the 4. */
  function strum(ch) { return '. . . . ' + ch + ':4 . . . . . . . ' + ch + ':4? . . .'; }
  /** The anthem's bass: root, root, fifth, root, fifth. */
  function bass(r, f) { return r + ':4 . . . ' + r + ':2 . ' + f + ':2 . ' + r + ':4 . . . ' + f + ':4 . . .'; }
  /** The intro's Rhodes: a slow arpeggio of four chord tones. */
  function arp(a, b, c, d) { return a + ':4 . . . ' + b + ':4? . . . ' + c + ':4 . . . ' + d + ':4? . . .'; }

  var BEAT = 'k . h . s . h . k . h k s . h .';
  var BEAT_FILL = 'k . h . s . h . k . s? s s . s s!';
  var BRUSH = 'k? . b? . b . b? . k? . b? . b . b? .';
  var REST = '. . . . . . . . . . . . . . . .';

  // ---- D major (the default) ----
  // The anthem's pad holds two chord tones (the strum and the brass fill the chord; three saws a note
  // make the pad the costliest voice, ARCHITECTURE §17).
  var D = '[F#3 A3]', AC = '[E3 A3]', BM = '[F#3 B3]', G = '[G3 B3]', A = '[E3 A3]', FSM = '[F#3 A3]';
  var kD = '[F#3 A3 D4]', kAC = '[E3 A3 C#4]', kBM = '[F#3 B3 D4]', kG = '[G3 B3 D4]', kA = '[E3 A3 C#4]', kFSM = '[F#3 A3 C#4]';
  var MAJ = {
    intro: {
      keys: bars(arp('F#3', 'A3', 'C#4', 'E4'), arp('F#3', 'B3', 'E4', 'A4'), arp('B3', 'D4', 'F#4', 'A4'), arp('E3', 'G3', 'A3', 'C#4')),
      pad: bars(pad('[D3 F#3 A3 C#4]'), pad('[D3 F#3 B3 E4]'), pad('[D3 G3 B3 F#4]'), '[D3 E3 A3]:8? . . . . . . . [C#3 E3 G3 A3]:8? . . . . . . .'),
      bass: bars('D2:16 . . . . . . . . . . . . . . .', 'D2:16 . . . . . . . . . . . . . . .', 'G1:16 . . . . . . . . . . . . . . .', 'A1:16 . . . . . . . . . . . . . . .'),
      whistle: bars(REST, '. . . . . . . . A5:4 . . . F#5:4 . . .', 'E5:6 . . . . . D5:2 . B4:8 . . . . . . .', 'C#5:8 . . . . . . . E5:4 . . . - . . .'),
    },
    lift: {
      keys: '[C#3 E3 G3 A3]:4 . . . . . . . [C#3 E3 G3 A3]:4? . . . . . . .',
      bass: 'A1:4 . . . B1:4 . . . C#2:4 . . . E2:4 . . .',
      horn: '. . . . . . . . A4:2 . B4:2 . C#5:4 . . .',
    },
    A1: {
      horn: bars('D5:4 . . . F#5:4 . . . A5:4 . . . B5:3 . . .', 'A5:8 . . . . . . . E5:4 . . . C#5:4 . . .',
        'D5:4 . . . F#5:4 . . . B5:4 . . . A5:3 . . .', 'G5:8 . . . . . . . F#5:4 . . . E5:4 . . .'),
      strum: bars(strum(kD), strum(kAC), strum(kBM), strum(kG)),
      pad: bars(pad(D), pad(AC), pad(BM), pad(G)),
      bass: bars(bass('D2', 'A1'), bass('C#2', 'E2'), bass('B1', 'F#2'), bass('G1', 'D2')),
    },
    A2: {
      horn: bars('D5:4 . . . F#5:4 . . . A5:4 . . . B5:3 . . .', 'A5:6 . . . . . F#5:2 . E5:8 . . . . . . .',
        'D5:4 . . . E5:4 . . . F#5:4 . . . G5:4 . . .', 'E5:12 . . . . . . . . . . . - . . .'),
      strum: bars(strum(kD), strum(kA), strum(kG), strum(kA)),
      pad: bars(pad(D), pad(A), pad(G), pad(A)),
      bass: bars(bass('D2', 'A1'), bass('A1', 'E2'), bass('G1', 'D2'), bass('A1', 'E2')),
    },
    B1: {
      horn: bars('B5:6 . . . . . A5:2 . G5:8 . . . . . . .', 'A5:6 . . . . . G5:2 . E5:8 . . . . . . .',
        'F#5:6 . . . . . E5:2 . C#5:4 . . . E5:4 . . .', 'D5:12 . . . . . . . . . . . - . . .'),
      strum: bars(strum(kG), strum(kA), strum(kFSM), strum(kBM)),
      pad: bars(pad(G), pad(A), pad(FSM), pad(BM)),
      bass: bars(bass('G1', 'D2'), bass('A1', 'E2'), bass('F#1', 'C#2'), bass('B1', 'F#2')),
    },
    B2: {
      horn: bars('B5:6 . . . . . A5:2 . G5:4 . . . B5:4 . . .', 'C#6:6 . . . . . B5:2 . A5:8 . . . . . . .',
        'B5:4 . . . D6:4 . . . C#6:4 . . . B5:4 . . .', 'A5:12 . . . . . . . . . . . - . . .'),
      strum: bars(strum(kG), strum(kA), strum(kBM), strum(kA)),
      pad: bars(pad(G), pad(A), pad(BM), '[D3 A3]:8? . . . . . . . ' + A + ':8? . . . . . . .'),
      bass: bars(bass('G1', 'D2'), bass('A1', 'E2'), bass('B1', 'F#2'), bass('A1', 'E2')),
    },
    A3: {
      horn: bars('D5:4 . . . F#5:4 . . . A5:4 . . . B5:3 . . .', 'A5:8 . . . . . . . E5:4 . . . C#5:4 . . .',
        'B5:4 . . . A5:4 . . . G5:4 . . . D5:4 . . .', 'E5:4 . . . F#5:4 . . . G5:4 . . . A5:4 . . .'),
      strum: bars(strum(kD), strum(kAC), strum(kG), strum(kA)),
      pad: bars(pad(D), pad(AC), pad(G), pad(A)),
      bass: bars(bass('D2', 'A1'), bass('C#2', 'E2'), bass('G1', 'D2'), bass('A1', 'E2')),
    },
    brk: {
      whistle: bars('D5:4 . . . F#5:4 . . . A5:4 . . . B5:3 . . .', 'A5:12 . . . . . . . . . . . - . . .',
        'B4:4 . . . D5:4 . . . G5:6 . . . . . F#5:2 .', 'E5:12 . . . . . . . . . . . - . . .'),
      keys: bars(arp('F#3', 'A3', 'D4', 'A3'), arp('F#3', 'A3', 'D4', 'E4'), arp('G3', 'B3', 'D4', 'B3'), arp('E3', 'G3', 'A3', 'C#4')),
      bass: bars('D2:8 . . . . . . . A1:8 . . . . . . .', 'D2:8 . . . . . . . F#2:8 . . . . . . .', 'G1:8 . . . . . . . D2:8 . . . . . . .', 'A1:8 . . . . . . . E2:8 . . . . . . .'),
    },
  };

  // ---- D minor (the `minor` variant): the hook in the relative major, answered in D minor ----
  var F = '[F3 A3]', CE = '[E3 G3]', DM = '[F3 A3]', BB = '[F3 Bb3]', AM = '[E3 A3]', GM = '[G3 Bb3]', C = '[E3 G3]';
  var kF = '[F3 A3 C4]', kCE = '[E3 G3 C4]', kDM = '[F3 A3 D4]', kBB = '[F3 Bb3 D4]', kAM = '[E3 A3 C4]', kGM = '[G3 Bb3 D4]', kC = '[E3 G3 C4]';
  var MIN = {
    intro: {
      keys: bars(arp('F3', 'A3', 'C4', 'E4'), arp('F3', 'A3', 'D4', 'A4'), arp('F3', 'Bb3', 'D4', 'G4'), arp('G3', 'Bb3', 'C4', 'E4')),
      pad: bars(pad('[D3 F3 A3 C4]'), pad('[D3 F3 A3]'), pad('[D3 F3 G3 Bb3]'), '[C3 F3 G3]:8? . . . . . . . [C3 E3 G3 Bb3]:8? . . . . . . .'),
      bass: bars('D2:16 . . . . . . . . . . . . . . .', 'Bb1:16 . . . . . . . . . . . . . . .', 'G1:16 . . . . . . . . . . . . . . .', 'C2:16 . . . . . . . . . . . . . . .'),
      whistle: bars(REST, '. . . . . . . . A5:4 . . . F5:4 . . .', 'D5:6 . . . . . C5:2 . Bb4:8 . . . . . . .', 'C5:8 . . . . . . . G4:4 . . . - . . .'),
    },
    lift: {
      keys: '[E3 G3 Bb3 C4]:4 . . . . . . . [E3 G3 Bb3 C4]:4? . . . . . . .',
      bass: 'C2:4 . . . D2:4 . . . E2:4 . . . C2:4 . . .',
      horn: '. . . . . . . . C4:2 . D4:2 . E4:4 . . .',
    },
    A1: {
      horn: bars('F4:4 . . . A4:4 . . . C5:4 . . . D5:3 . . .', 'C5:8 . . . . . . . G4:4 . . . E4:4 . . .',
        'F4:4 . . . A4:4 . . . D5:4 . . . C5:3 . . .', 'Bb4:8 . . . . . . . A4:4 . . . G4:4 . . .'),
      strum: bars(strum(kF), strum(kCE), strum(kDM), strum(kBB)),
      pad: bars(pad(F), pad(CE), pad(DM), pad(BB)),
      bass: bars(bass('F1', 'C2'), bass('E2', 'C2'), bass('D2', 'A1'), bass('Bb1', 'F2')),
    },
    A2: {
      horn: bars('D4:4 . . . F4:4 . . . A4:4 . . . Bb4:3 . . .', 'A4:6 . . . . . G4:2 . E4:8 . . . . . . .',
        'D4:4 . . . E4:4 . . . F4:4 . . . G4:4 . . .', 'E4:12 . . . . . . . . . . . - . . .'),
      strum: bars(strum(kDM), strum(kAM), strum(kGM), strum('[E3 A3 C#4]')),
      pad: bars(pad(DM), pad(AM), pad(GM), pad('[E3 A3]')),
      bass: bars(bass('D2', 'F2'), bass('A1', 'E2'), bass('G1', 'D2'), bass('A1', 'E2')),
    },
    B1: {
      horn: bars('D5:6 . . . . . C5:2 . Bb4:8 . . . . . . .', 'C5:6 . . . . . Bb4:2 . G4:8 . . . . . . .',
        'A4:6 . . . . . G4:2 . E4:4 . . . G4:4 . . .', 'F4:12 . . . . . . . . . . . - . . .'),
      strum: bars(strum(kBB), strum(kC), strum(kAM), strum(kDM)),
      pad: bars(pad(BB), pad(C), pad(AM), pad(DM)),
      bass: bars(bass('Bb1', 'F2'), bass('C2', 'G2'), bass('A1', 'E2'), bass('D2', 'A1')),
    },
    B2: {
      horn: bars('D5:6 . . . . . C5:2 . Bb4:4 . . . D5:4 . . .', 'E5:6 . . . . . D5:2 . C5:8 . . . . . . .',
        'D5:4 . . . F5:4 . . . E5:4 . . . D5:4 . . .', 'C#5:12 . . . . . . . . . . . - . . .'),
      strum: bars(strum(kBB), strum(kC), strum(kDM), strum('[E3 A3 C#4]')),
      pad: bars(pad(BB), pad(C), pad(DM), '[D3 A3]:8? . . . . . . . [E3 A3]:8? . . . . . . .'),
      bass: bars(bass('Bb1', 'F2'), bass('C2', 'G2'), bass('D2', 'A1'), bass('A1', 'E2')),
    },
    A3: {
      horn: bars('F4:4 . . . A4:4 . . . C5:4 . . . D5:3 . . .', 'C5:8 . . . . . . . G4:4 . . . E4:4 . . .',
        'D5:4 . . . C5:4 . . . Bb4:4 . . . F4:4 . . .', 'E4:4 . . . G4:4 . . . C#5:4 . . . E5:4 . . .'),
      strum: bars(strum(kF), strum(kCE), strum(kBB), strum('[E3 G3 C#4]')),
      pad: bars(pad(F), pad(CE), pad(BB), pad('[E3 G3]')),
      bass: bars(bass('F1', 'C2'), bass('E2', 'C2'), bass('Bb1', 'F2'), bass('A1', 'E2')),
    },
    brk: {
      whistle: bars('D5:4 . . . F5:4 . . . A5:4 . . . Bb5:3 . . .', 'A5:12 . . . . . . . . . . . - . . .',
        'Bb4:4 . . . D5:4 . . . G5:6 . . . . . F5:2 .', 'E5:12 . . . . . . . . . . . - . . .'),
      keys: bars(arp('F3', 'A3', 'D4', 'F4'), arp('F3', 'A3', 'D4', 'E4'), arp('G3', 'Bb3', 'D4', 'Bb3'), arp('E3', 'G3', 'Bb3', 'C4')),
      bass: bars('D2:8 . . . . . . . D2:8? . . . . . . .', 'D2:8 . . . . . . . F2:8 . . . . . . .', 'G1:8 . . . . . . . D2:8 . . . . . . .', 'C2:8 . . . . . . . G1:8 . . . . . . .'),
    },
  };

  // The drums are the same in every variant.
  var DRUMS = {
    intro: bars(REST, REST, REST, '. . . . . . . . b? . b? . b . b b?'),
    lift: 's? . s? . s? . s . s . s s s s s! s!',
    A1: bars(BEAT, BEAT, BEAT, BEAT_FILL),
    A2: bars(BEAT, BEAT, BEAT, BEAT_FILL),
    B1: bars(BEAT, BEAT, BEAT, BEAT_FILL),
    B2: bars(BEAT, BEAT, BEAT, 'k . s? s s . s s k . s s s s! s s!'),
    A3: bars(BEAT, BEAT, BEAT, BEAT_FILL),
    brk: bars(BRUSH, BRUSH, BRUSH, 'k? . b? . b . b? . k . s? s s s s! s!'),
  };

  var LENGTH = { intro: 4, lift: 1, A1: 4, A2: 4, B1: 4, B2: 4, A3: 4, brk: 4 };
  var TEMPO = { lift: 92, A1: 100, A2: 100, B1: 100, B2: 100, A3: 100, brk: 100 };

  var patterns = {};
  var stamp = {}, minor = {};
  Object.keys(LENGTH).forEach(function (p) {
    var tracks = { drums: DRUMS[p] };
    Object.keys(MAJ[p]).forEach(function (t) {
      tracks[t] = MAJ[p][t];
      (stamp[t] = stamp[t] || {})[p] = up(MAJ[p][t], 2);
    });
    Object.keys(MIN[p]).forEach(function (t) { (minor[t] = minor[t] || {})[p] = MIN[p][t]; });
    patterns[p] = { bars: LENGTH[p], tracks: tracks };
    if (TEMPO[p]) patterns[p].bpm = TEMPO[p];
  });

  SR.def.song('final_edition', {
    bpm: 84, swing: 0,
    meter: [4, 4], stepsPerBeat: 4,
    key: 'D', scale: 'major', gain: 0.72,
    inst: {
      horn: { preset: 'brass', gain: 0.7, pan: 0.15 },
      whistle: { preset: 'whistle', gain: 0.8, pan: 0.1 },
      keys: { preset: 'keys', gain: 0.6, pan: -0.2 },
      strum: { preset: 'pluck', gain: 0.4, pan: -0.25 },
      pad: { preset: 'pad', gain: 0.4, pan: 0 },
      bass: { preset: 'bass', gain: 0.45, pan: 0 },
      drums: { preset: 'kit', gain: 0.6, pan: 0 },
    },
    patterns: patterns,
    // reflective intro (84) · the lift (92) · the anthem (100): A A' B B' A A'' · breakdown
    order: ['intro', 'lift', 'A1', 'A2', 'B1', 'B2', 'A1', 'A3', 'brk'],
    loopFrom: 2,
    variants: {
      stamp: { tracks: stamp },
      minor: { tracks: minor, inst: { horn: { gain: 0.55 }, pad: { gain: 0.45 } } },
    },
    motif: [{ pattern: 'A1', track: 'horn', step: 0 }],
  });
})();
