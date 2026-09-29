// js/audio/songs/brawl_hall.js — owner: W2-Music. Fights and the ring (ART_AUDIO §13.4): 150 bpm, D
// minor, straight eighths; driving square arpeggios (the clav preset: a square through a band-pass),
// four-on-the-floor with a clap on 2 and 4, a gritty bass (the slap preset: a saw with a pitch blip
// and a click, pushed), and a pulse lead on top for the second A and the B sections. A (i - VI -
// VII), A' (the lead's call), B (iv - i - VI - VII - V, the arpeggios in quarters under the lead),
// B' (the lead with brass stabs), a four-bar breakdown (kick, toms and the pedal bass) and A' again;
// 44 bars (70 s) a loop after a two-bar drum count-in. The event rate stays under the day theme's
// (ARCHITECTURE §17 render cost; docs/requests/W1-S.md §8). Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  /** @returns {string} the step string s repeated n times, bar lines between. */
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' | '); }
  /** @returns {string} one bar of eighth-note arpeggio: low, top, mid, top, octave, top, mid, top. */
  function arp8(lo, mid, top, oct) { return [lo, top, mid, top, oct, top, mid, top].join(' '); }
  /** @returns {string} one bar of quarter-note arpeggio. */
  function arp4(lo, mid, top, oct) { return lo + ':2 . ' + mid + ':2 . ' + top + ':2 . ' + oct + ':2 .'; }
  /** @returns {string} one bar of the pushed quarter-note bass with an octave pop on 3. */
  function pump(r, o) { return r + ':2 . ' + r + ':2 . ' + o + ':2 . ' + r + ':2 .'; }

  var DM8 = arp8('D4', 'F4', 'A4', 'D5'), BB8 = arp8('D4', 'F4', 'Bb4', 'D5'), C8 = arp8('E4', 'G4', 'C5', 'E5'),
    A8 = arp8('C#4', 'E4', 'A4', 'C#5'), GM8 = arp8('D4', 'G4', 'Bb4', 'D5');
  var ARP_A = [DM8, DM8, BB8, C8, DM8, DM8, BB8, A8].join(' | ');
  var BASS_A = [pump('D2', 'D3'), pump('D2', 'D3'), pump('Bb1', 'Bb2'), pump('C2', 'C3'), pump('D2', 'D3'), pump('D2', 'D3'),
    pump('Bb1', 'Bb2'), pump('A1', 'A2')].join(' | ');
  var BASS_B = [pump('G1', 'G2'), pump('G1', 'G2'), pump('D2', 'D3'), pump('D2', 'D3'), pump('Bb1', 'Bb2'), pump('C2', 'C3'),
    pump('A1', 'A2'), pump('A1', 'A2')].join(' | ');
  var ARP_B = [arp4('D4', 'G4', 'Bb4', 'D5'), arp4('D4', 'G4', 'Bb4', 'D5'), arp4('D4', 'F4', 'A4', 'D5'), arp4('D4', 'F4', 'A4', 'D5'),
    arp4('D4', 'F4', 'Bb4', 'D5'), arp4('E4', 'G4', 'C5', 'E5'), arp4('C#4', 'E4', 'A4', 'C#5'), arp4('C#4', 'E4', 'A4', 'C#5')].join(' | ');
  var KICK = 'k . k . k . k .';
  var CLAP = '. . c . . . c .';
  var LEAD_A = 'D5:3 . . F5 A5:4 . . . | G5:2 . F5:2 . E5:2 . D5:2 . | F5:3 . . D5 Bb4:4 . . . | C5:2 . E5:2 . G5:4 . . . | ' +
    'A5:3 . . G5 F5:2 . E5 . | D5:6 . . . . . - . | D5:2 . F5:2 . Bb5:4 . . . | A5:6 . . . . . G5 E5';
  var LEAD_B = 'Bb5:4 . . . A5:2 . G5:2 . | D5:6 . . . . . - . | F5:4 . . . E5:2 . D5:2 . | A4:6 . . . . . - . | ' +
    'Bb4:2 . D5:2 . F5:2 . Bb5:2 . | C6:4 . . . G5:2 . E5:2 . | C#6:4 . . . A5:2 . E5:2 . | A5:6 . . . . . - .';

  SR.def.song('brawl_hall', {
    bpm: 150, swing: 0,
    meter: [4, 4], stepsPerBeat: 2,
    key: 'D', scale: 'minor', gain: 0.66,
    inst: {
      lead: { preset: 'lead', gain: 0.85, pan: 0.15 },
      arp: { preset: 'clav', gain: 0.75, pan: -0.25 },
      brass: { preset: 'brass', gain: 0.32, pan: 0.3 },
      bass: { preset: 'slap', gain: 0.55, pan: 0 },
      kick: { preset: 'kit', gain: 0.6, pan: 0 },
      clap: { preset: 'kit', gain: 0.55, pan: 0.05 },
    },
    patterns: {
      intro: { bars: 2, tracks: {
        kick: KICK + ' | ' + KICK,
        clap: CLAP + ' | . . c . c c c! c!',
        bass: 'D2:2 . . . D2:2 . . . | D2:2 . . . A1:2 . C#2:2 .',
      } },
      A: { bars: 8, tracks: {
        arp: ARP_A, bass: BASS_A, kick: rep(KICK, 8), clap: rep(CLAP, 7) + ' | . . c . . . c c?',
      } },
      A2: { bars: 8, tracks: {
        lead: LEAD_A, arp: ARP_A, bass: BASS_A, kick: rep(KICK, 8), clap: rep(CLAP, 7) + ' | . . c . . . c c?',
      } },
      B: { bars: 8, tracks: {
        lead: LEAD_B, arp: ARP_B, bass: BASS_B, kick: rep(KICK, 8), clap: rep(CLAP, 8),
      } },
      B2: { bars: 8, tracks: {
        lead: LEAD_B,
        brass: '[D4 G4 Bb4]:3 . . . . . . . | [D4 G4 Bb4]:2 . . . . . [D4 G4]? . | [D4 F4 A4]:3 . . . . . . . | [D4 F4 A4]:2 . . . . . . . | ' +
          '[D4 F4 Bb4]:3 . . . . . . . | [E4 G4 C5]:3 . . . . . . . | [C#4 E4 A4]:3 . . . . . . . | [C#4 E4 A4]:4 . . . [E4 A4 C#5]:4? . . .',
        arp: ARP_B, bass: BASS_B, kick: rep(KICK, 8), clap: rep(CLAP, 7) + ' | . . c . c c c c!',
      } },
      // The breakdown: kick, toms and the pedal bass; the arpeggio drops to one note an off-beat.
      brk: { bars: 4, tracks: {
        arp: rep('. D4? . D4? . D4? . D4?', 3) + ' | . C#4? . C#4? . E4 . A4',
        bass: 'D2:2 . . . D2:2 . . . | D2:2 . . . D2:2 . . . | D2:2 . . . D2:2 . . . | A1:2 . . . A1:2 . C#2:2 .',
        kick: 'k . . . k . . . | k . . . k . . . | k . . . k . . . | k . . . k . k .',
        clap: '. . t . . . t . | . . t . . . t t | . . t . . . t . | . . t . t t t! .',
      } },
    },
    // count-in · A · A' · B · B' · breakdown · A'
    order: ['intro', 'A', 'A2', 'B', 'B2', 'brk', 'A2'],
    loopFrom: 1,
  });
})();
