// js/audio/songs/stingers.js — owner: W2-Music. The event stingers (ART_AUDIO §13.4; CONTRACT §14.2, D21):
// short songs of one pattern and no loop, played with SR.audio.stinger(name) on the music bus above
// the song, which ducks 6 dB under them. Registered: stingers.fall (a whistle-down, 1 s), rescue (an
// up-swoop onto a bright chord), jail (low brass), flatlined (an organ dirge, 3 s), promotion (a brass
// fanfare on the leitmotif, F A C D C: 0, +4, +7, +9, +7, the `motif` annotation; ART_AUDIO §13.3),
// degree (an organ "amen" chord), jackpot (a cascade of bells), election_win (the march tutti, in
// hail_to_the_stick's B♭), election_loss (a sad trombone sinking by semitones, its last note
// wobbling) and stamp (the level-up: a rising triad onto a ringing chord; js/ui/stamp.js and the
// results play it with the Stamp's thud). Callers: js/scenes/city.js (fall, rescue), death.js and
// hospital.js (flatlined), js/ui/stamp.js, results.js (stamp), transcript.js (degree), report.js
// (election_win / election_loss); jail, promotion and jackpot are there for their callers to play.
// Original music. Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // A whistle sliding down over a second, in 16ths at 240 bpm (a step is 62.5 ms, shorter than the
  // whistle's vibrato delay, so each step is a clean pitch: a slide whistle), a soft bass under it.
  SR.def.song('stingers.fall', {
    bpm: 240, meter: [4, 4], stepsPerBeat: 4, key: 'C', scale: 'major', gain: 0.8,
    inst: {
      whistle: { preset: 'whistle', gain: 0.95, pan: 0.1 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        whistle: 'E6 D6 C6 B5 A5 G5 F5 E5 D5 C5 B4 A4 G4 F4 E4:2 .',
        bass: 'C3:4 . . . B2:4 . . . G2:4 . . . E2:3 . . .',
      } },
    },
    order: ['S'],
  });

  // The swoop up (the plane's catch) onto a G major chord: whistle arpeggio, brass and a shimmer.
  SR.def.song('stingers.rescue', {
    bpm: 150, meter: [4, 4], stepsPerBeat: 4, key: 'G', scale: 'major', gain: 0.6,
    inst: {
      whistle: { preset: 'whistle', gain: 0.9, pan: -0.1 },
      brass: { preset: 'brass', gain: 0.7, pan: 0.15 },
      bells: { preset: 'vibes', gain: 0.6, pan: 0.3 },
      bass: { preset: 'bass', gain: 0.45, pan: 0 },
      kit: { preset: 'kit', gain: 0.6, pan: 0 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        whistle: 'G4 B4 D5 G5 B5 D6:11 . . . . . . . . . -',
        brass: '. . . . . [G3 B3 D4 G4]:10 . . . . . . . . . .',
        bells: '. . . . . [B4 D5 G5]:11 . . . . . . . . . .',
        bass: 'G2:2 . D2:2 . . G1:10 . . . . . . . . . .',
        kit: 'b? . b? . b o? . . . . . . . . . .',
      } },
    },
    order: ['S'],
  });

  // Low brass: two heavy steps down and a tritone that stays (the cell door's verdict).
  SR.def.song('stingers.jail', {
    bpm: 90, meter: [4, 4], stepsPerBeat: 4, key: 'C', scale: 'minor', gain: 0.66,
    inst: {
      brass: { preset: 'brass', gain: 0.9, pan: 0 },
      bass: { preset: 'bass', gain: 0.6, pan: 0 },
      kit: { preset: 'kit', gain: 0.8, pan: 0 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        brass: '[C3 G3]:3 . . . [Bb2 F3]:3 . . . [F#2 C3]:8! . . . . . . .',
        bass: 'C2:3 . . . Bb1:3 . . . F#1:8 . . . . . . .',
        kit: 't . . . t . . . k! . . . . . . .',
      } },
    },
    order: ['S'],
  });

  // A dirge: three beats of 60 bpm (3 s), an organ i - iv - i over a pedal A and a muffled drum.
  SR.def.song('stingers.flatlined', {
    bpm: 60, meter: [3, 4], stepsPerBeat: 4, key: 'A', scale: 'minor', gain: 0.8,
    inst: {
      organ: { preset: 'organ', gain: 0.8, pan: 0 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      kit: { preset: 'kit', gain: 0.7, pan: 0 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        organ: '[A3 C4 E4]:4 . . . [A3 D4 F4]:4 . . . [A3 C4 E4]:3 . . -',
        bass: 'A1:11 . . . . . . . . . . -',
        kit: 'k? . . . k? . . . k? . . .',
      } },
    },
    order: ['S'],
  });

  // The promotion fanfare: the leitmotif as the top line of brass chords (F A C D C), then the F
  // major chord with a bell shimmer, over a timpani-ish tom and a snare roll into the chord.
  SR.def.song('stingers.promotion', {
    bpm: 132, meter: [4, 4], stepsPerBeat: 4, key: 'F', scale: 'major', gain: 0.56,
    inst: {
      brass: { preset: 'brass', gain: 0.85, pan: 0.1 },
      bells: { preset: 'bell', gain: 0.55, pan: 0.3 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      kit: { preset: 'kit', gain: 0.65, pan: 0 },
      cym: { preset: 'kit', gain: 0.6, pan: -0.2 },
    },
    patterns: {
      S: { bars: 2, tracks: {
        brass: '[A3 C4 F4]:2 . [C4 F4 A4]:2 . [E4 G4 C5]:2 . [F4 A4 D5]:3 . . [E4 G4 C5]:7 . . . . . . | ' +
          '[F4 A4 C5 F5]:12 . . . . . . . . . . . - . . .',
        bells: '. . . . . . . . . . . . . . . . | [A5 C6 F6]:12 . . . . . . . . . . . . . . .',
        bass: 'F2:2 . F2:2 . C2:2 . Bb1:3 . . C2:7 . . . . . . | F2:12 . . . . . . . . . . . - . . .',
        kit: 't . . . t . . . t . . . s? s s s! | k! . . . . . . . . . . . . . . .',
        cym: '. . . . . . . . . . . . . . . . | o! . . . . . . . . . . . . . . .',
      } },
    },
    order: ['S'],
    motif: [{ pattern: 'S', track: 'brass', step: 0 }],
  });

  // The degree: a full organ "amen" (IV - I in C) with a pedal bass and a bell on the resolution.
  SR.def.song('stingers.degree', {
    bpm: 80, meter: [4, 4], stepsPerBeat: 4, key: 'C', scale: 'major', gain: 0.72,
    inst: {
      organ: { preset: 'organ', gain: 0.8, pan: 0 },
      bass: { preset: 'bass', gain: 0.5, pan: 0 },
      bell: { preset: 'bell', gain: 0.5, pan: 0.25 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        organ: '[F3 A3 C4 F4]:6 . . . . . [E3 G3 C4 G4]:9 . . . . . . . . -',
        bass: 'F2:6 . . . . . C2:9 . . . . . . . . -',
        bell: '. . . . . . [C5 E5 G5]:10 . . . . . . . . .',
      } },
    },
    order: ['S'],
  });

  // The jackpot: bells cascading up a C major arpeggio onto a ringing chord, vibes, a pad swell and a
  // bass under.
  SR.def.song('stingers.jackpot', {
    bpm: 150, meter: [4, 4], stepsPerBeat: 4, key: 'C', scale: 'major', gain: 0.6,
    inst: {
      bells: { preset: 'bell', gain: 0.5, pan: 0.2 },
      vibes: { preset: 'vibes', gain: 0.6, pan: -0.2 },
      pad: { preset: 'pad', gain: 0.7, pan: 0 },
      bass: { preset: 'bass', gain: 0.55, pan: 0 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        bells: 'C5 E5 G5 C6 G5 C6 E6:2 . [E5 G5 C6]:8 . . . . . . .',
        pad: '. . . . . . . . [C4 E4 G4]:8 . . . . . . .',
        vibes: '[C4 E4 G4]:4 . . . [E4 G4 C5]:4 . . . . . . . [G4 C5 E5]:4? . . .',
        bass: 'C2:4 . . . G1:4 . . . C2:8 . . . . . . .',
      } },
    },
    order: ['S'],
  });

  // The election win: the campaign march's tutti in B♭ (hail_to_the_stick's key), brass chords on a
  // dotted march figure, a tuba bass, a snare roll and a crash on the last chord.
  SR.def.song('stingers.election_win', {
    bpm: 116, meter: [4, 4], stepsPerBeat: 4, key: 'Bb', scale: 'major', gain: 0.53,
    inst: {
      brass: { preset: 'brass', gain: 0.85, pan: 0.1 },
      bass: { preset: 'bass', gain: 0.55, pan: 0 },
      kit: { preset: 'kit', gain: 0.6, pan: 0 },
      cym: { preset: 'kit', gain: 0.6, pan: -0.2 },
    },
    patterns: {
      S: { bars: 2, tracks: {
        brass: '[D4 F4 Bb4]:3 . . [D4 F4 Bb4] [F4 Bb4 D5]:4 . . . [Bb4 D5 F5]:6 . . . . . [A4 C5 F5]:2 . | ' +
          '[Bb4 D5 F5 Bb5]:12 . . . . . . . . . . . - . . .',
        bass: 'Bb1:4 . . . F2:4 . . . Bb1:4 . . . F1:4 . . . | Bb1:12 . . . . . . . . . . . - . . .',
        kit: 's . . s? s . . . s . s? s? s s? s s! | k! . . . . . . . . . . . . . . .',
        cym: '. . . . . . . . . . . . . . . . | o! . . . . . . . . . . . . . . .',
      } },
    },
    order: ['S'],
  });

  // The election loss: a sad trombone (brass) sinking by semitones, the last note wobbling (the
  // re-struck ghosts), a muted tuba answer.
  SR.def.song('stingers.election_loss', {
    bpm: 100, meter: [4, 4], stepsPerBeat: 4, key: 'Eb', scale: 'minor', gain: 0.85,
    inst: {
      bone: { preset: 'brass', gain: 0.9, pan: 0.05 },
      bass: { preset: 'bass', gain: 0.45, pan: 0 },
    },
    patterns: {
      S: { bars: 2, tracks: {
        bone: 'Bb3:3 . . A3:3 . . Ab3:4 . . . G3:6 . . . . . | G3:2? . G3:2 . G3:2? . G3:9 . . . . . . . . -',
        bass: 'Eb2:6 . . . . . . . . . Eb2:6 . . . . . | C2:6 . . . . . . . G1:7 . . . . . . -',
      } },
    },
    order: ['S'],
  });

  // The Stamp's level-up: a rising C major triad onto a ringing chord (bells, a soft brass swell and
  // a pluck), short enough to sit under the Stamp's thud.
  SR.def.song('stingers.stamp', {
    bpm: 180, meter: [4, 4], stepsPerBeat: 4, key: 'C', scale: 'major', gain: 0.7,
    inst: {
      bells: { preset: 'bell', gain: 0.6, pan: 0.15 },
      brass: { preset: 'brass', gain: 0.8, pan: -0.1 },
      pluck: { preset: 'pluck', gain: 0.5, pan: -0.25 },
    },
    patterns: {
      S: { bars: 1, tracks: {
        bells: 'C5 E5 G5 [E5 G5 C6]:13 . . . . . . . . . . . .',
        brass: '. . . [C4 E4 G4]:12 . . . . . . . . . . . -',
        pluck: 'C4 E4 G4 C5:13 . . . . . . . . . . . .',
      } },
    },
    order: ['S'],
  });
})();
