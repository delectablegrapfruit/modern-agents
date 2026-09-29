// js/audio/songs/please_hold.js — owner: W2-Music. NLI, the insurance office (ART_AUDIO §13.4): 100 bpm,
// C major, straight eighths; corporate hold music: a marimba tune (the bell preset, struck short so
// it knocks like wood), a softer marimba arpeggio, a warm pad, a polite bass and a brushed kit. The
// joke: the tape restarts every 30 s. The loop is the whole order (loopFrom 0), 12 bars (28.8 s): the
// intro, the tune, and the start of its reprise, cut off mid-phrase as it climbs, straight back to
// the intro, forever. (ART_AUDIO §13.1's 60-120 s loops are for songs meant to wear well; this one
// is meant to wear thin.) Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of the marimba arpeggio: root, fifth, third, fifth, octave. */
  function arp(r, f, t, o) { return r + ' . ' + f + ' ' + t + ' . ' + f + ' ' + o + ' .'; }
  /** @returns {string} one bar of a held pad chord. */
  function pad(ch) { return ch + ':8? . . . . . . .'; }

  var KIT = 'k . b? . k . b? z?';

  SR.def.song('please_hold', {
    bpm: 100, swing: 0,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'C', scale: 'major', gain: 0.74,
    inst: {
      marimba: { preset: 'bell', gain: 0.7, pan: 0.1 },
      arp: { preset: 'bell', gain: 0.45, pan: -0.3 },
      pad: { preset: 'pad', gain: 0.5, pan: 0 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      kit: { preset: 'kit', gain: 0.6, pan: 0.1 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        arp: arp('C4', 'G4', 'D5', 'C5') + ' | ' + arp('F3', 'C4', 'A4', 'E5'),
        pad: pad('[C4 D4 G4]') + ' | ' + pad('[A3 C4 E4]'),
        bass: 'C2:4 . . . G1:4 . . . | F1:4 . . . C2:4 . . .',
        kit: '. . b? . . . b? . | k . b? . k . b? z?',
      } },
      A: { bars: 4, tracks: {
        marimba: 'C5 E5 G5 C6:3 . . B5 . | A5:2 . G5 . E5:3 . . . | F5 A5 C6:2 . B5 A5 G5 F5 | G5:3 . . D5 G5:4 . . .',
        arp: [arp('C4', 'G4', 'E4', 'C5'), arp('A3', 'E4', 'C4', 'A4'), arp('F3', 'C4', 'A3', 'F4'), arp('G3', 'D4', 'B3', 'G4')].join(' | '),
        pad: [pad('[E4 G4 C5]'), pad('[E4 G4 A4]'), pad('[E4 A4 C5]'), pad('[D4 G4 B4]')].join(' | '),
        bass: 'C2:4 . . . G1:4 . . . | A1:4 . . . E2:4 . . . | F1:4 . . . C2:4 . . . | G1:4 . . . D2:2 . B1:2 .',
        kit: rep(KIT, 4),
      } },
      B: { bars: 4, tracks: {
        marimba: 'E5 G5 C6:2 . D6:2 . C6 G5 | B5:3 . . G5 E5:4 . . . | A5 C6 E6:2 . D6 C6 A5 G5 | F5:3 . . G5 D6:4 . . .',
        arp: [arp('C4', 'G4', 'E4', 'C5'), arp('E3', 'B3', 'G3', 'E4'), arp('F3', 'C4', 'A3', 'F4'), arp('G3', 'D4', 'C4', 'F4')].join(' | '),
        pad: [pad('[E4 G4 C5]'), pad('[D4 G4 B4]'), pad('[E4 A4 C5]'), pad('[D4 F4 G4 C5]')].join(' | '),
        bass: 'C2:4 . . . G1:4 . . . | E2:4 . . . B1:4 . . . | F1:4 . . . C2:4 . . . | G1:4 . . . G1:2 . A1:2 .',
        kit: rep(KIT, 3) + ' | k . b? . k b? b b?',
      } },
      // The reprise that never gets to finish: the tape runs out as the tune climbs.
      cut: { bars: 2, tracks: {
        marimba: 'C5 E5 G5 C6:3 . . B5 . | A5:2 . G5 . E5 F5 G5 A5',
        arp: arp('C4', 'G4', 'E4', 'C5') + ' | ' + arp('A3', 'E4', 'C4', 'A4'),
        pad: pad('[E4 G4 C5]') + ' | ' + pad('[E4 G4 A4]'),
        bass: 'C2:4 . . . G1:4 . . . | A1:4 . . . E2:4 . . .',
        kit: KIT + ' | k . b? . k . . .',
      } },
    },
    // the whole tape: intro · the tune · the reprise, cut; then from the top (loopFrom 0)
    order: ['intro', 'A', 'B', 'cut'],
    loopFrom: 0,
  });
})();
