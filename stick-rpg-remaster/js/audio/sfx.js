// js/audio/sfx.js — owner: W1-S. The SFX palette of ART_AUDIO §13.5 as SR.def.sfx recipes (the frozen
// format of CONTRACT §14.3): UI, money, stats, time, food, movement, the edge, the world, fights and
// games, the phone and voice blips (about 100). Pure data (Node-loadable): the engine plays a recipe
// with SR.audio.sfx(name, { x, y, gain, pitch }).
// Levels: buses ui (-12 dB), voice (-16 dB), ambience (-24 dB) and sfx (0 dB); every one-shot peaks
// ≤ -6 dBFS through the master chain and noise layers stay filtered and soft so no sample jumps by
// more than 0.25 (the objective test, ARCHITECTURE §18). Priorities: 0 loops, 1 world one-shots,
// 2 UI, 3 the stamp and the jackpot. Captions (cap.* in en-ui.js): horn, siren, answering_beep,
// wind_loop, thunder, knock.
// Names the UI (W1-D) and the minigame engines (W1-M) play: click, open, close, confirm, error,
// toggle, blip, purchase, ticktock, stamp; mg_tick, mg_hit, mg_miss, mg_item, mg_bin, mg_serve.
(function () {
  'use strict';
  var SR = window.SR;

  /** An ADSR envelope (seconds; s is the sustain level). */
  function env(a, d, s, r) { return { a: a, d: d, s: s, r: r }; }
  /** A short one-shot envelope: attack a, decay d, no sustain. */
  function hit(a, d) { return { a: a, d: d, s: 0, r: 0.01 }; }
  function def(name, recipe) { SR.def.sfx(name, recipe); }

  // ---- UI (bus ui, priority 2) ----

  def('click', { bus: 'ui', gain: 1, priority: 2, caption: null,          // a paper flick
    layers: [
      { noise: 'white', filter: { type: 'highpass', freq: 3000, q: 0.7 }, env: hit(0.005, 0.008), dur: 0.013, gain: 0.5 },
      { osc: 'triangle', freq: 2400, env: hit(0.005, 0.012), dur: 0.017, gain: 0.6 },
    ],
    vary: { pitch: 0.06, gain: 0.1 } });
  def('open', { bus: 'ui', gain: 1, priority: 2,                        // a page turn
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', sweep: [700, 3200, 0.18, 'exp'], q: 1.2 }, env: env(0.03, 0.16, 0, 0.02), dur: 0.2 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 600 }, env: env(0.02, 0.12, 0, 0.02), dur: 0.14, gain: 0.5 },
    ],
    vary: { pitch: 0.05 } });
  def('close', { bus: 'ui', gain: 1, priority: 2,
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', sweep: [3200, 700, 0.16, 'exp'], q: 1.2 }, env: env(0.02, 0.15, 0, 0.02), dur: 0.18 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 500 }, env: env(0.01, 0.1, 0, 0.02), dur: 0.12, gain: 0.5, start: 0.06 },
    ],
    vary: { pitch: 0.05 } });
  def('confirm', { bus: 'ui', gain: 1, priority: 2,                     // an ink stamp: thump + slap
    layers: [
      { osc: 'sine', sweep: [95, 58, 0.09, 'exp'], env: hit(0.005, 0.14), dur: 0.15 },
      { noise: 'white', filter: { type: 'lowpass', freq: 1600 }, env: hit(0.005, 0.045), dur: 0.05, gain: 0.45 },
    ],
    vary: { pitch: 0.04 } });
  def('error', { bus: 'ui', gain: 1, priority: 2,                         // two soft falling notes
    layers: [
      { osc: 'square', freq: [392, 311], at: [0, 0.1], filter: { type: 'lowpass', freq: 1400 },
        env: env(0.005, 0.06, 0.55, 0.05), dur: 0.2, gain: 0.6 },
    ] });
  def('hover', { bus: 'ui', gain: 0.4, priority: 2,
    layers: [{ osc: 'sine', freq: 1800, env: hit(0.005, 0.012), dur: 0.017 }],
    vary: { pitch: 0.03 } });
  def('toggle', { bus: 'ui', gain: 1, priority: 2,
    layers: [
      { osc: 'square', freq: [1200, 1600], at: [0, 0.035], filter: { type: 'lowpass', freq: 3000 },
        env: env(0.005, 0.02, 0.5, 0.02), dur: 0.06, gain: 0.55 },
    ] });
  def('typewriter', { bus: 'ui', gain: 0.8, priority: 2,                  // per character, varied pitch
    layers: [
      { osc: 'triangle', freq: 1100, env: hit(0.005, 0.018), dur: 0.023, gain: 1 },
      { noise: 'white', filter: { type: 'bandpass', freq: 3500, q: 2 }, env: hit(0.005, 0.01), dur: 0.015, gain: 0.5 },
    ],
    vary: { pitch: 0.12, gain: 0.15 } });
  def('ticktock', { bus: 'ui', gain: 0.8, priority: 2,                    // the ClockRing sweep
    layers: [
      { osc: 'triangle', freq: 2200, env: hit(0.005, 0.012), dur: 0.017, gain: 0.8 },
      { noise: 'white', filter: { type: 'bandpass', freq: 4000, q: 3 }, env: hit(0.005, 0.008), dur: 0.013, gain: 0.4 },
    ],
    vary: { pitch: 0.1 } });
  def('stamp', { bus: 'sfx', gain: 0.95, priority: 3,                      // the Stamp: the loudest event
    layers: [
      { osc: 'sine', sweep: [80, 40, 0.16, 'exp'], env: hit(0.005, 0.3), dur: 0.31 },
      { osc: 'triangle', sweep: [190, 120, 0.06, 'exp'], env: hit(0.005, 0.09), dur: 0.1, gain: 0.5 },
      { noise: 'white', filter: { type: 'lowpass', freq: 2200 }, env: hit(0.005, 0.07), dur: 0.08, gain: 0.3 },
    ] });

  // ---- money ----

  def('coin', { bus: 'sfx', gain: 0.5, priority: 2,                       // square 988 → 1319 Hz, 60 ms each
    layers: [
      { osc: 'square', freq: [988, 1319], at: [0, 0.06], filter: { type: 'lowpass', freq: 4000 },
        env: env(0.005, 0.06, 0.6, 0.05), dur: 0.12, gain: 0.4 },
    ],
    vary: { pitch: 0.02 } });
  def('purchase', { bus: 'sfx', gain: 0.5, priority: 2,                   // the register "ka", then the coin
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 2000, q: 2 }, env: hit(0.005, 0.04), dur: 0.05, gain: 0.5 },
      { osc: 'square', freq: [988, 1319], at: [0, 0.06], filter: { type: 'lowpass', freq: 4000 },
        env: env(0.005, 0.06, 0.6, 0.05), dur: 0.12, gain: 0.4, start: 0.04 },
    ] });
  def('cash_tick', { bus: 'sfx', gain: 0.4, priority: 2,
    layers: [{ osc: 'triangle', freq: 3000, env: hit(0.005, 0.015), dur: 0.02 }],
    vary: { pitch: 0.08 } });
  def('loss', { bus: 'sfx', gain: 0.6, priority: 2,                       // a loss thud
    layers: [
      { osc: 'sine', sweep: [110, 50, 0.25, 'exp'], env: hit(0.005, 0.3), dur: 0.31 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 400 }, env: hit(0.01, 0.15), dur: 0.16, gain: 0.4 },
    ] });

  // ---- stats ----

  def('stat_str', { bus: 'sfx', gain: 0.4, priority: 2,                   // a low brass swell
    layers: [
      { osc: 'saw', freq: 110, filter: { type: 'lowpass', sweep: [300, 1400, 0.25, 'exp'], q: 1 }, env: env(0.08, 0.3, 0.6, 0.2), dur: 0.45, gain: 0.5 },
      { osc: 'saw', freq: 165, filter: { type: 'lowpass', sweep: [300, 1400, 0.25, 'exp'], q: 1 }, env: env(0.08, 0.3, 0.6, 0.2), dur: 0.45, gain: 0.35 },
    ] });
  def('stat_int', { bus: 'sfx', gain: 0.45, priority: 2,                  // a bell ding
    layers: [{ fm: { carrier: 'sine', ratio: 3.5, index: 1.2, indexDecay: 0.15 }, freq: 1318, env: hit(0.005, 0.9), dur: 0.9 }] });
  def('stat_cha', { bus: 'sfx', gain: 0.4, priority: 2,                   // a sparkle gliss
    layers: [
      { osc: 'triangle', sweep: [1200, 2400, 0.25, 'lin'], env: env(0.01, 0.1, 0.5, 0.1), dur: 0.26, gain: 0.5 },
      { osc: 'sine', freq: [1568, 2093, 2637], at: [0.05, 0.12, 0.19], env: env(0.005, 0.08, 0.45, 0.15), dur: 0.3, gain: 0.5 },
    ] });
  def('karma_up', { bus: 'sfx', gain: 0.45, priority: 2,                  // a choir-like pad chord
    layers: [
      { osc: 'saw', freq: 523.25, filter: { type: 'lowpass', freq: 1400, q: 0.7 }, env: env(0.15, 0.3, 0.6, 0.35), dur: 0.5, gain: 0.3 },
      { osc: 'saw', freq: 659.25, filter: { type: 'lowpass', freq: 1400, q: 0.7 }, env: env(0.15, 0.3, 0.6, 0.35), dur: 0.5, gain: 0.3 },
      { osc: 'saw', freq: 783.99, filter: { type: 'lowpass', freq: 1400, q: 0.7 }, env: env(0.15, 0.3, 0.6, 0.35), dur: 0.5, gain: 0.3 },
      { osc: 'sine', freq: 261.63, env: env(0.15, 0.3, 0.6, 0.35), dur: 0.5, gain: 0.4 },
    ] });
  def('karma_down', { bus: 'sfx', gain: 0.6, priority: 2,                 // a low whoosh
    layers: [{ noise: 'pink', filter: { type: 'bandpass', sweep: [900, 200, 0.5, 'exp'], q: 1 }, env: hit(0.05, 0.45), dur: 0.5 }] });
  def('heal', { bus: 'sfx', gain: 0.45, priority: 2,                      // a rising sine blip
    layers: [{ osc: 'sine', sweep: [400, 900, 0.15, 'exp'], env: hit(0.005, 0.16), dur: 0.17 }] });
  def('hurt', { bus: 'sfx', gain: 0.7, priority: 1,                       // a short 90 Hz thump
    layers: [
      { osc: 'sine', sweep: [140, 70, 0.08, 'exp'], env: hit(0.005, 0.12), dur: 0.13 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 800 }, env: hit(0.005, 0.04), dur: 0.05, gain: 0.4 },
    ] });

  // ---- time ----

  def('timelapse', { bus: 'sfx', gain: 0.4, priority: 2,                  // an accelerando of ticks
    layers: [0, 0.2, 0.35, 0.46, 0.54, 0.6, 0.65, 0.69].map(function (s, i) {
      return { osc: 'triangle', freq: 1800 + i * 60, env: hit(0.005, 0.02), dur: 0.025, start: s, gain: 0.5 };
    }) });
  def('alarm', { bus: 'sfx', gain: 0.4, priority: 2,                      // an alarm-clock beep
    layers: [0, 0.12, 0.24, 0.36].map(function (s) {
      return { osc: 'square', freq: 1760, filter: { type: 'lowpass', freq: 3000 }, env: env(0.005, 0.01, 0.8, 0.01), dur: 0.07, start: s, gain: 0.35 };
    }) });
  def('snore', { bus: 'sfx', gain: 0.5, priority: 1,
    layers: [
      { noise: 'pink', filter: { type: 'lowpass', sweep: [400, 1200, 0.9, 'lin'] }, env: hit(0.35, 0.55), dur: 0.9, gain: 0.4 },
      { osc: 'saw', freq: 70, filter: { type: 'lowpass', freq: 300 }, env: hit(0.3, 0.6), dur: 0.9, gain: 0.3 },
    ] });
  def('midnight_chime', { bus: 'sfx', gain: 0.45, priority: 2,            // the 24:00 chime
    layers: [
      { fm: { carrier: 'sine', ratio: 3.5, index: 1, indexDecay: 0.3 }, freq: 880, env: hit(0.005, 1.2), dur: 1.2 },
      { fm: { carrier: 'sine', ratio: 3.5, index: 1, indexDecay: 0.3 }, freq: 659.25, env: hit(0.005, 1.4), dur: 1.4, start: 0.35 },
    ] });

  // ---- food ----

  def('eat', { bus: 'sfx', gain: 0.5, priority: 1,                        // three crunches, 1.2 kHz
    layers: [0, 0.09, 0.18].map(function (s) {
      return { noise: 'white', filter: { type: 'bandpass', freq: 1200, q: 1.5 }, env: hit(0.005, 0.05), dur: 0.055, start: s, gain: 0.55 };
    }),
    vary: { pitch: 0.12, gain: 0.1 } });
  def('drink', { bus: 'sfx', gain: 0.5, priority: 1,                      // a sine gulp 300 → 180 Hz
    layers: [
      { osc: 'sine', sweep: [300, 180, 0.12, 'exp'], env: hit(0.01, 0.12), dur: 0.13 },
      { osc: 'sine', sweep: [290, 175, 0.12, 'exp'], env: hit(0.01, 0.12), dur: 0.13, start: 0.2 },
    ] });
  def('smoke', { bus: 'sfx', gain: 0.5, priority: 1,                      // a match strike and a soft cough
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 3000, q: 1.5 }, env: hit(0.005, 0.12), dur: 0.13, gain: 0.4 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 900 }, env: hit(0.03, 0.3), dur: 0.3, start: 0.1, gain: 0.5 },
      { noise: 'pink', filter: { type: 'bandpass', freq: 600, q: 1.5 }, env: hit(0.01, 0.12), dur: 0.13, start: 0.7, gain: 0.6 },
      { noise: 'pink', filter: { type: 'bandpass', freq: 560, q: 1.5 }, env: hit(0.01, 0.1), dur: 0.11, start: 0.9, gain: 0.45 },
    ] });

  // ---- movement ----

  def('step', { bus: 'sfx', gain: 0.5, priority: 1,                      // a 25 ms filtered click (pitch alternates)
    layers: [{ noise: 'white', filter: { type: 'bandpass', freq: 900, q: 1.2 }, env: hit(0.005, 0.02), dur: 0.025 }],
    vary: { pitch: 0.12, gain: 0.2 } });
  def('step_grass', { bus: 'sfx', gain: 0.3, priority: 1,
    layers: [{ noise: 'pink', filter: { type: 'lowpass', freq: 1200 }, env: hit(0.008, 0.03), dur: 0.04 }],
    vary: { pitch: 0.12, gain: 0.2 } });
  def('step_paper', { bus: 'sfx', gain: 0.5, priority: 1,                // the paper creak of the Dog-Ear
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 1800, q: 1.5 }, env: hit(0.005, 0.03), dur: 0.035, gain: 0.5 },
      { osc: 'saw', sweep: [420, 380, 0.08, 'lin'], filter: { type: 'bandpass', freq: 1200, q: 4 }, env: hit(0.01, 0.08), dur: 0.09, gain: 0.4 },
    ],
    vary: { pitch: 0.1 } });
  def('skate_loop', { bus: 'sfx', gain: 0.35, priority: 0, loop: true,     // the roll: low-passed noise
    layers: [{ noise: 'pink', filter: { type: 'lowpass', freq: 500 }, env: env(0.1, 0, 1, 0.2) }] });
  def('skate_push', { bus: 'sfx', gain: 0.4, priority: 1,                 // the push clack
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 2500, q: 2 }, env: hit(0.005, 0.03), dur: 0.035, gain: 0.4 },
      { osc: 'triangle', freq: 700, env: hit(0.005, 0.04), dur: 0.045, gain: 0.5 },
    ] });
  def('engine_loop', { bus: 'sfx', gain: 0.3, priority: 0, loop: true,     // pitched by speed with set({ pitch })
    layers: [
      { osc: 'saw', freq: 55, filter: { type: 'lowpass', freq: 400 }, env: env(0.15, 0, 1, 0.25) },
      { osc: 'saw', freq: 82.5, filter: { type: 'lowpass', freq: 400 }, env: env(0.15, 0, 1, 0.25), gain: 0.5 },
    ] });
  def('horn', { bus: 'sfx', gain: 0.35, priority: 1, caption: 'cap.horn',  // saws 440 + 466 Hz
    layers: [
      { osc: 'saw', freq: 440, filter: { type: 'lowpass', freq: 2500 }, env: env(0.01, 0.05, 0.8, 0.06), dur: 0.45, gain: 0.5 },
      { osc: 'saw', freq: 466, filter: { type: 'lowpass', freq: 2500 }, env: env(0.01, 0.05, 0.8, 0.06), dur: 0.45, gain: 0.5 },
    ] });
  def('brake', { bus: 'sfx', gain: 0.3, priority: 1,                      // a brake squeal
    layers: [
      { osc: 'triangle', sweep: [1800, 1500, 0.5, 'lin'], env: env(0.03, 0.1, 0.6, 0.1), dur: 0.5, gain: 0.5 },
      { noise: 'white', filter: { type: 'bandpass', freq: 2000, q: 6 }, env: env(0.03, 0.1, 0.6, 0.1), dur: 0.5, gain: 0.6 },
    ] });
  def('car_hit', { bus: 'sfx', gain: 0.6, priority: 1,                    // noise burst + 60 Hz thump + paper crumple
    layers: [
      { noise: 'white', filter: { type: 'lowpass', freq: 2000 }, env: hit(0.005, 0.15), dur: 0.16, gain: 0.35 },
      { osc: 'sine', sweep: [80, 45, 0.2, 'exp'], env: hit(0.005, 0.25), dur: 0.26 },
    ].concat([0.05, 0.09, 0.14, 0.2, 0.27].map(function (s) {
      return { noise: 'white', filter: { type: 'bandpass', freq: 1500, q: 2 }, env: hit(0.005, 0.02), dur: 0.025, start: s, gain: 0.35 };
    })) });
  def('crash', { bus: 'sfx', gain: 0.6, priority: 1,
    layers: [
      { noise: 'white', filter: { type: 'lowpass', sweep: [3000, 500, 0.6, 'exp'] }, env: hit(0.005, 0.6), dur: 0.6, gain: 0.35 },
      { osc: 'sine', sweep: [60, 35, 0.3, 'exp'], env: hit(0.005, 0.35), dur: 0.36 },
      { fm: { carrier: 'sine', ratio: 2.7, index: 3, indexDecay: 0.2 }, freq: 320, env: hit(0.005, 0.4), dur: 0.4, gain: 0.25 },
    ] });
  def('ignition', { bus: 'sfx', gain: 0.4, priority: 1,
    layers: [
      { osc: 'saw', sweep: [40, 90, 0.6, 'lin'], filter: { type: 'lowpass', freq: 500 }, env: env(0.02, 0.2, 0.6, 0.15), dur: 0.7 },
      { noise: 'pink', filter: { type: 'bandpass', freq: 400, q: 1 }, env: env(0.01, 0.1, 0.5, 0.1), dur: 0.5, gain: 0.5 },
    ] });
  def('door_bell', { bus: 'sfx', gain: 0.35, priority: 2,                 // the shop bell
    layers: [
      { fm: { carrier: 'sine', ratio: 3.5, index: 1, indexDecay: 0.2 }, freq: 1568, filter: { type: 'lowpass', freq: 5000 }, env: hit(0.005, 0.8), dur: 0.8 },
      { fm: { carrier: 'sine', ratio: 3.5, index: 1, indexDecay: 0.2 }, freq: 1976, filter: { type: 'lowpass', freq: 5000 }, env: hit(0.005, 0.7), dur: 0.7, start: 0.12, gain: 0.8 },
    ] });
  def('door_whoosh', { bus: 'sfx', gain: 0.5, priority: 2,                // the revolving door
    layers: [{ noise: 'pink', filter: { type: 'bandpass', sweep: [400, 1600, 0.4, 'exp'], q: 1 }, env: hit(0.1, 0.35), dur: 0.45 }] });
  def('door_creak', { bus: 'sfx', gain: 0.3, priority: 2,
    layers: [{ osc: 'saw', sweep: [180, 240, 0.45, 'lin'], filter: { type: 'bandpass', freq: 900, q: 4 }, env: env(0.05, 0.1, 0.7, 0.1), dur: 0.45 }] });
  def('door_ding', { bus: 'sfx', gain: 0.35, priority: 2,                 // the casino ding
    layers: [
      { fm: { carrier: 'sine', ratio: 2, index: 1, indexDecay: 0.3 }, freq: 1760, env: hit(0.005, 0.9), dur: 0.9 },
      { osc: 'sine', freq: 2637, env: hit(0.005, 0.6), dur: 0.6, gain: 0.4 },
    ] });

  // ---- the edge ----

  def('wind_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true, caption: 'cap.edgeWind',
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', freq: 500, q: 0.8 }, env: env(0.5, 0, 1, 0.6) },
      { noise: 'pink', filter: { type: 'lowpass', freq: 250 }, env: env(0.6, 0, 1, 0.6), gain: 0.6 },
    ] });
  def('teeter', { bus: 'sfx', gain: 0.35, priority: 1,                    // the teeter wobble
    layers: [{ osc: 'triangle', freq: [380, 340, 380, 340], at: [0, 0.08, 0.16, 0.24], env: env(0.01, 0.05, 0.7, 0.05), dur: 0.32 }] });
  def('fall_whistle', { bus: 'sfx', gain: 0.35, priority: 1,              // sine 800 → 120 Hz, 0.9 s
    layers: [{ osc: 'sine', sweep: [800, 120, 0.9, 'exp'], env: env(0.02, 0.1, 0.8, 0.1), dur: 0.9 }] });
  def('plane_swoop', { bus: 'sfx', gain: 0.4, priority: 1,
    layers: [
      { osc: 'saw', sweep: [90, 180, 1.2, 'lin'], filter: { type: 'lowpass', freq: 800 }, env: env(0.4, 0.6, 0.5, 0.4), dur: 1.2, gain: 0.5 },
      { noise: 'pink', filter: { type: 'bandpass', sweep: [300, 1200, 1.2, 'exp'], q: 1 }, env: env(0.4, 0.6, 0.5, 0.4), dur: 1.2, gain: 0.6 },
    ] });
  def('landing', { bus: 'sfx', gain: 0.45, priority: 1,                   // a paper crinkle: 12 micro bursts
    layers: [0, 0.03, 0.05, 0.09, 0.12, 0.16, 0.19, 0.24, 0.28, 0.33, 0.38, 0.44].map(function (s, i) {
      return { noise: 'white', filter: { type: 'bandpass', freq: 2500, q: 1.5 }, env: hit(0.005, 0.015), dur: 0.02, start: s,
        gain: 0.6 - i * 0.04 };
    }) });

  // ---- the world ----

  def('city_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true,  // distant traffic
    layers: [
      { noise: 'pink', filter: { type: 'lowpass', freq: 320 }, env: env(0.8, 0, 1, 0.8) },
      { noise: 'pink', filter: { type: 'bandpass', freq: 700, q: 0.7 }, env: env(0.8, 0, 1, 0.8), gain: 0.35 },
    ] });
  def('fountain_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true,
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 1800, q: 0.7 }, env: env(0.5, 0, 1, 0.6), gain: 0.5 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 600 }, env: env(0.5, 0, 1, 0.6), gain: 0.6 },
    ] });
  def('rain_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true,
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 3500, q: 0.6 }, env: env(0.8, 0, 1, 0.8), gain: 0.45 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 1000 }, env: env(0.8, 0, 1, 0.8), gain: 0.6 },
    ] });
  def('thunder', { bus: 'sfx', gain: 0.6, priority: 1, caption: 'cap.thunder',
    layers: [
      { noise: 'pink', filter: { type: 'lowpass', sweep: [1200, 120, 2.2, 'exp'] }, env: env(0.08, 2.4, 0, 0.1), dur: 2.5 },
      { osc: 'sine', freq: 50, env: env(0.2, 1.6, 0, 0.1), dur: 1.8, gain: 0.5 },
    ] });
  def('cricket', { bus: 'sfx', gain: 0.25, priority: 1,
    layers: [0, 0.03, 0.06].map(function (s) {
      return { osc: 'sine', freq: 4500, env: hit(0.005, 0.015), dur: 0.02, start: s };
    }),
    vary: { pitch: 0.05, gain: 0.2 } });
  def('bird_chirp', { bus: 'sfx', gain: 0.3, priority: 1,                 // sine chirps
    layers: [
      { osc: 'sine', sweep: [2600, 3800, 0.07, 'exp'], env: hit(0.005, 0.065), dur: 0.07 },
      { osc: 'sine', sweep: [3400, 2800, 0.06, 'exp'], env: hit(0.005, 0.06), dur: 0.065, start: 0.09 },
    ],
    vary: { pitch: 0.12, gain: 0.2 } });
  def('murmur_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true, // crowd murmur (band-passed noise)
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', freq: 500, q: 1 }, env: env(0.6, 0, 1, 0.6) },
      { noise: 'pink', filter: { type: 'bandpass', freq: 1100, q: 1.5 }, env: env(0.6, 0, 1, 0.6), gain: 0.5 },
    ] });
  def('neon_buzz', { bus: 'sfx', gain: 0.12, priority: 0, loop: true,
    layers: [
      { osc: 'saw', freq: 120, filter: { type: 'lowpass', freq: 900 }, env: env(0.05, 0, 1, 0.1) },
      { osc: 'square', freq: 240, filter: { type: 'bandpass', freq: 1500, q: 2 }, env: env(0.05, 0, 1, 0.1), gain: 0.3 },
    ] });
  def('siren', { bus: 'sfx', gain: 0.3, priority: 1, caption: 'cap.siren', // two-tone
    layers: [{ osc: 'triangle', freq: [660, 880, 660, 880], at: [0, 0.45, 0.9, 1.35], filter: { type: 'lowpass', freq: 2500 },
      env: env(0.02, 0.1, 0.9, 0.1), dur: 1.8 }] });
  def('air_brake', { bus: 'sfx', gain: 0.35, priority: 1,                 // the bus air-brake
    layers: [{ noise: 'white', filter: { type: 'bandpass', sweep: [3000, 1500, 0.5, 'exp'], q: 1 }, env: env(0.005, 0.5, 0.3, 0.2), dur: 0.6 }] });
  def('pigeons', { bus: 'sfx', gain: 0.4, priority: 1,
    layers: [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28].map(function (s) {
      return { noise: 'pink', filter: { type: 'bandpass', freq: 1000, q: 1 }, env: hit(0.005, 0.03), dur: 0.035, start: s, gain: 0.6 };
    }).concat([{ osc: 'sine', freq: [400, 380, 400], at: [0, 0.1, 0.2], env: env(0.02, 0.1, 0.6, 0.08), dur: 0.3, start: 0.45, gain: 0.5 }]) });
  def('knock', { bus: 'sfx', gain: 0.5, priority: 1, caption: 'cap.knock',
    layers: [0, 0.18, 0.36].map(function (s) {
      return { osc: 'sine', sweep: [220, 150, 0.05, 'exp'], env: hit(0.005, 0.08), dur: 0.09, start: s };
    }).concat([0, 0.18, 0.36].map(function (s) {
      return { noise: 'white', filter: { type: 'lowpass', freq: 1500 }, env: hit(0.005, 0.025), dur: 0.03, start: s, gain: 0.4 };
    })) });
  def('fog_horn', { bus: 'ambience', gain: 0.8, priority: 1,
    layers: [
      { osc: 'saw', freq: 110, filter: { type: 'lowpass', freq: 400 }, env: env(0.3, 0.2, 0.8, 0.8), dur: 1.8 },
      { osc: 'saw', freq: 111.5, filter: { type: 'lowpass', freq: 400 }, env: env(0.3, 0.2, 0.8, 0.8), dur: 1.8 },
    ] });
  def('chatter_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true, // bar chatter
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', freq: 700, q: 2 }, env: env(0.6, 0, 1, 0.6) },
      { noise: 'pink', filter: { type: 'bandpass', freq: 1400, q: 2 }, env: env(0.6, 0, 1, 0.6), gain: 0.5 },
    ] });
  def('sizzle_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true, // the fryer
    layers: [{ noise: 'white', filter: { type: 'bandpass', freq: 5000, q: 0.8 }, env: env(0.4, 0, 1, 0.5) }] });
  def('hum_loop', { bus: 'ambience', gain: 1, priority: 0, loop: true,   // the office hum
    layers: [
      { osc: 'sine', freq: 120, env: env(0.5, 0, 1, 0.5), gain: 0.5 },
      { osc: 'sine', freq: 240, env: env(0.5, 0, 1, 0.5), gain: 0.15 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 300 }, env: env(0.5, 0, 1, 0.5), gain: 0.6 },
    ] });
  def('duck_quack', { bus: 'sfx', gain: 0.35, priority: 1,
    layers: [0, 0.18].map(function (s) {
      return { osc: 'saw', sweep: [600, 480, 0.12, 'exp'], filter: { type: 'bandpass', freq: 1100, q: 3 }, env: env(0.01, 0.06, 0.5, 0.04), dur: 0.12, start: s };
    }),
    vary: { pitch: 0.08 } });
  def('glass_clink', { bus: 'sfx', gain: 0.3, priority: 1,
    layers: [
      { fm: { carrier: 'sine', ratio: 2.76, index: 1.2, indexDecay: 0.08 }, freq: 2349, env: hit(0.005, 0.35), dur: 0.35 },
      { osc: 'sine', freq: 3136, env: hit(0.005, 0.2), dur: 0.2, start: 0.004, gain: 0.3 },
    ],
    vary: { pitch: 0.06 } });

  // ---- fights and games ----

  def('punch', { bus: 'sfx', gain: 0.6, priority: 1,
    layers: [
      { noise: 'white', filter: { type: 'lowpass', freq: 1800 }, env: hit(0.005, 0.06), dur: 0.065, gain: 0.4 },
      { osc: 'sine', sweep: [110, 60, 0.08, 'exp'], env: hit(0.005, 0.1), dur: 0.11 },
    ],
    vary: { pitch: 0.08 } });
  def('kick', { bus: 'sfx', gain: 0.6, priority: 1,
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', sweep: [600, 1600, 0.08, 'exp'], q: 1 }, env: hit(0.01, 0.07), dur: 0.08, gain: 0.5 },
      { osc: 'sine', sweep: [90, 50, 0.1, 'exp'], env: hit(0.005, 0.14), dur: 0.15, start: 0.05 },
    ],
    vary: { pitch: 0.08 } });
  def('fireball', { bus: 'sfx', gain: 0.55, priority: 1,                  // a noise whoosh + a sine boom
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', sweep: [500, 2500, 0.35, 'exp'], q: 1 }, env: hit(0.05, 0.3), dur: 0.35 },
      { osc: 'sine', sweep: [90, 40, 0.4, 'exp'], env: hit(0.005, 0.45), dur: 0.46, start: 0.3 },
    ] });
  def('ink_beam', { bus: 'sfx', gain: 0.35, priority: 1,                  // a rising FM zap
    layers: [{ fm: { carrier: 'sine', ratio: 1.5, index: 4, indexDecay: 0.2 }, sweep: [300, 1400, 0.4, 'exp'],
      filter: { type: 'lowpass', freq: 3500 }, env: env(0.02, 0.1, 0.7, 0.08), dur: 0.45 }] });
  def('guard', { bus: 'sfx', gain: 0.4, priority: 1,                      // a guard clank
    layers: [
      { fm: { carrier: 'sine', ratio: 2.8, index: 5, indexDecay: 0.08 }, freq: 520, env: hit(0.005, 0.3), dur: 0.3 },
      { noise: 'white', filter: { type: 'bandpass', freq: 3000, q: 2 }, env: hit(0.005, 0.03), dur: 0.035, gain: 0.4 },
    ] });
  def('cheer', { bus: 'sfx', gain: 0.55, priority: 1,                     // a crowd cheer
    layers: [
      { noise: 'pink', filter: { type: 'bandpass', freq: 1100, q: 0.8 }, env: env(0.15, 0.6, 0.4, 0.4), dur: 1.2 },
      { noise: 'pink', filter: { type: 'bandpass', freq: 2200, q: 1.2 }, env: env(0.2, 0.6, 0.3, 0.4), dur: 1.2, gain: 0.5 },
    ] });
  def('card_deal', { bus: 'sfx', gain: 0.4, priority: 2,
    layers: [{ noise: 'white', filter: { type: 'bandpass', sweep: [2500, 4000, 0.04, 'exp'], q: 1 }, env: hit(0.005, 0.04), dur: 0.045 }],
    vary: { pitch: 0.08 } });
  def('card_shuffle', { bus: 'sfx', gain: 0.4, priority: 2,
    layers: [0, 0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.175, 0.2, 0.225].map(function (s) {
      return { noise: 'white', filter: { type: 'bandpass', freq: 3000, q: 1.2 }, env: hit(0.005, 0.015), dur: 0.02, start: s, gain: 0.5 };
    }) });
  def('chips', { bus: 'sfx', gain: 0.35, priority: 2,
    layers: [[0, 3200], [0.04, 2800], [0.07, 3400], [0.12, 3000]].map(function (c) {
      return { osc: 'triangle', freq: c[1], env: hit(0.005, 0.02), dur: 0.025, start: c[0] };
    }),
    vary: { pitch: 0.05 } });
  def('roulette_loop', { bus: 'sfx', gain: 0.3, priority: 0, loop: true,  // the ball rolling
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 1800, q: 2 }, env: env(0.1, 0, 1, 0.2), gain: 0.5 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 500 }, env: env(0.1, 0, 1, 0.2), gain: 0.6 },
    ] });
  def('roulette_settle', { bus: 'sfx', gain: 0.4, priority: 2,            // clicks slowing on a decay curve
    layers: [0, 0.08, 0.17, 0.27, 0.39, 0.53, 0.7, 0.9].map(function (s) {
      return { osc: 'triangle', freq: 2600, env: hit(0.005, 0.012), dur: 0.017, start: s };
    }) });
  def('reel_spin', { bus: 'sfx', gain: 0.3, priority: 0, loop: true,       // a ratchet of clicks
    layers: [{ osc: 'pulse', duty: 0.1, freq: 18, filter: { type: 'bandpass', freq: 2500, q: 2 }, env: env(0.05, 0, 1, 0.1) }] });
  def('reel_stop', { bus: 'sfx', gain: 0.4, priority: 2,                  // pitched by the caller per reel
    layers: [
      { osc: 'triangle', freq: 1400, env: hit(0.005, 0.03), dur: 0.035 },
      { noise: 'white', filter: { type: 'bandpass', freq: 2500, q: 2 }, env: hit(0.005, 0.02), dur: 0.025, gain: 0.35 },
    ] });
  def('jackpot_bells', { bus: 'sfx', gain: 0.4, priority: 3,              // with the Stamp, the loudest
    layers: [[0, 1047], [0.1, 1319], [0.2, 1568], [0.3, 2093], [0.45, 1568], [0.55, 2093]].map(function (c) {
      return { fm: { carrier: 'sine', ratio: 3.5, index: 1, indexDecay: 0.2 }, freq: c[1], filter: { type: 'lowpass', freq: 5000 },
        env: hit(0.005, 0.6), dur: 0.6, start: c[0], gain: 0.7 };
    }) });
  def('dart_throw', { bus: 'sfx', gain: 0.8, priority: 1,
    layers: [{ noise: 'pink', filter: { type: 'bandpass', sweep: [2000, 900, 0.12, 'exp'], q: 1.2 }, env: hit(0.01, 0.11), dur: 0.12 }] });
  def('dart_thunk', { bus: 'sfx', gain: 0.5, priority: 1,
    layers: [
      { osc: 'sine', sweep: [180, 110, 0.06, 'exp'], env: hit(0.005, 0.08), dur: 0.085 },
      { noise: 'white', filter: { type: 'lowpass', freq: 1200 }, env: hit(0.005, 0.03), dur: 0.035, gain: 0.4 },
    ] });
  def('mg_tick', { bus: 'sfx', gain: 0.35, priority: 2,                   // the Timing Ring tick
    layers: [{ osc: 'triangle', freq: 1500, env: hit(0.005, 0.02), dur: 0.025 }] });
  def('mg_hit', { bus: 'sfx', gain: 0.4, priority: 2,
    layers: [{ osc: 'square', freq: [1047, 1568], at: [0, 0.05], filter: { type: 'lowpass', freq: 3000 }, env: env(0.005, 0.05, 0.5, 0.04), dur: 0.1, gain: 0.5 }] });
  def('mg_miss', { bus: 'sfx', gain: 0.4, priority: 2,
    layers: [{ osc: 'triangle', sweep: [300, 180, 0.12, 'exp'], env: hit(0.005, 0.13), dur: 0.14 }] });
  def('mg_item', { bus: 'sfx', gain: 0.35, priority: 2,                   // a Shift Rush item
    layers: [{ osc: 'triangle', sweep: [880, 1320, 0.05, 'exp'], env: hit(0.005, 0.07), dur: 0.075 }],
    vary: { pitch: 0.04 } });
  def('mg_bin', { bus: 'sfx', gain: 0.45, priority: 2,                    // an item into a bin
    layers: [
      { noise: 'pink', filter: { type: 'lowpass', freq: 1000 }, env: hit(0.005, 0.05), dur: 0.055, gain: 0.5 },
      { osc: 'sine', freq: 330, env: hit(0.005, 0.06), dur: 0.065 },
    ] });
  def('mg_serve', { bus: 'sfx', gain: 0.4, priority: 2,                   // an order served
    layers: [{ osc: 'square', freq: [784, 988, 1175], at: [0, 0.06, 0.12], filter: { type: 'lowpass', freq: 3000 }, env: env(0.005, 0.05, 0.5, 0.06), dur: 0.2, gain: 0.5 }] });

  // ---- the phone ----

  (function () {
    var f = [], at = [];
    for (var i = 0; i < 20; i++) { f.push(i % 2 ? 1100 : 1250); at.push(i * 0.04); }
    def('phone_ring', { bus: 'sfx', gain: 0.3, priority: 2,               // a bell-like trill
      layers: [{ osc: 'sine', freq: f, at: at, env: env(0.01, 0.05, 0.8, 0.05), dur: 0.8 }] });
  })();
  def('phone_vibrate', { bus: 'sfx', gain: 0.35, priority: 2,
    layers: [0, 0.5].map(function (s) {
      return { osc: 'saw', freq: 150, filter: { type: 'lowpass', freq: 300 }, env: env(0.01, 0.05, 0.9, 0.03), dur: 0.35, start: s };
    }) });
  def('answering_beep', { bus: 'sfx', gain: 0.3, priority: 2, caption: 'cap.answering', // 1 kHz + tape hiss
    layers: [
      { osc: 'sine', freq: 1000, env: env(0.005, 0.02, 0.9, 0.02), dur: 0.35 },
      { noise: 'pink', filter: { type: 'highpass', freq: 3000 }, env: env(0.05, 0.1, 0.6, 0.1), dur: 0.6, gain: 0.15 },
    ] });
  def('voicemail_start', { bus: 'sfx', gain: 0.35, priority: 2,           // a tape click, then hiss
    layers: [
      { noise: 'white', filter: { type: 'bandpass', freq: 1200, q: 1 }, env: hit(0.005, 0.02), dur: 0.025, gain: 0.5 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 3000 }, env: env(0.05, 0.1, 0.4, 0.15), dur: 0.5, start: 0.03, gain: 0.25 },
    ] });

  // ---- voices (bus voice): gibberish blips, a formant-filtered saw at the speaker's pitch ----

  def('blip', { bus: 'voice', gain: 1, priority: 2,                     // generic; pitch = the speaker's voice
    layers: [{ osc: 'saw', freq: 200, filter: { type: 'bandpass', freq: 900, q: 1.2 }, env: env(0.006, 0.04, 0.5, 0.03), dur: 0.05 }],
    vary: { pitch: 0.04 } });
  def('blip_low', { bus: 'voice', gain: 1, priority: 2,                // Harold: low and slow
    layers: [{ osc: 'saw', freq: 110, filter: { type: 'bandpass', freq: 700, q: 1.2 }, env: env(0.01, 0.07, 0.5, 0.04), dur: 0.09 }],
    vary: { pitch: 0.04 } });
  def('blip_high', { bus: 'voice', gain: 1, priority: 2,               // Skid: high and fast
    layers: [{ osc: 'saw', freq: 330, filter: { type: 'bandpass', freq: 1500, q: 1.2 }, env: env(0.005, 0.02, 0.5, 0.015), dur: 0.035 }],
    vary: { pitch: 0.06 } });
  def('blip_nervous', { bus: 'voice', gain: 1, priority: 2,             // Terry: a nervous vibrato
    layers: [{ osc: 'saw', freq: [220, 232, 214], at: [0, 0.02, 0.04], filter: { type: 'bandpass', freq: 1100, q: 1.2 }, env: env(0.006, 0.04, 0.5, 0.03), dur: 0.06 }],
    vary: { pitch: 0.05 } });
  def('blip_gravel', { bus: 'voice', gain: 1, priority: 2,              // Sticky: gravelly
    layers: [
      { osc: 'saw', freq: 130, filter: { type: 'bandpass', freq: 800, q: 1.2 }, env: env(0.008, 0.05, 0.5, 0.03), dur: 0.07 },
      { noise: 'pink', filter: { type: 'bandpass', freq: 800, q: 2 }, env: env(0.008, 0.05, 0.4, 0.03), dur: 0.07, gain: 0.3 },
    ],
    vary: { pitch: 0.04 } });
  def('blip_smooth', { bus: 'voice', gain: 0.6, priority: 2,              // Lou: smooth
    layers: [{ osc: 'triangle', freq: 180, filter: { type: 'lowpass', freq: 1200 }, env: env(0.012, 0.05, 0.7, 0.04), dur: 0.08 }],
    vary: { pitch: 0.03 } });
})();
