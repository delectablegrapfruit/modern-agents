# Requests from W1-S (Audio), wave 1

Each request names the file, the exact change, why, and the workaround used meanwhile
(BUILD_PLAN §1.3). Items 1-4 are for the lead (CONTRACT, ART_AUDIO); 5 is for W1-D's building scene
(the lead in wave 2); 6 is for W1-M's frame (the lead in wave 2); 7 is for W1-Q; 8 is guidance for
wave-2 packages (through the lead). The answers to requests addressed to W1-S are at the end.

## 1. `docs/CONTRACT.md` §14 and D19-D21, D31 (lead): confirmed as implemented

- **File:** `docs/CONTRACT.md` §14.2, §14.3, §21 (D19, D20, D21, D31).
- **Change:** mark D19 (drum tracks are `kit` tracks; `note[:len][!|?]`; a note ends at its length,
  `-` or the next note; a bare `!` / `?` re-triggers the previous note, chord or hit; scientific
  pitch), D20 (one source per layer; `sweep` replaces `freq`; `indexDecay` is a time constant;
  `loop: true` with a handle; `renderOffline` returns a `Promise<AudioBuffer>`), D21 (stinger ids
  `stingers.<snake_case>`) and D31 (`SR.audio.validate(kind, def)` → `string[]` in the load-time
  clean `js/audio/music.js`; `fm.carrier`; `stinger('promotion')` = `stingers.promotion`) as
  confirmed by W1-S. No change to the frozen formats is needed.
- **Why:** D31 asks W1-S to confirm or file a request.
- **Meanwhile:** implemented as written; `tests/node/music.test.cjs` covers each point.

## 2. `docs/CONTRACT.md` §14 (lead): what the format leaves open, as implemented

- **File:** `docs/CONTRACT.md` §14.2 and §14.3 (and ART_AUDIO §13.8).
- **Change:** record these rules, which the validator enforces or the engine follows:
  - **Songs.** `bpm`, `meter`, `stepsPerBeat`, `inst`, `patterns`, `order` are required; `swing`,
    `key`, `scale` (documentation only), `gain`, `loopFrom`, `variants`, `motif` are optional; an
    unknown field is a problem (it catches typos such as `bmp`). Song, instrument and variant
    gains are 0..1, pans -1..1. **Swing** delays every odd step, and only when `stepsPerBeat` is
    even (for a 16th grid: every second 16th). Pitches are MIDI 12..108 (C0-C8), lengths 1..256.
    A **chord is one voice** (its notes share the preset's filter and envelope). A `motif`
    annotation must start on a note of a pitched track; the five onsets are read from there (the
    top note of a chord), following `order` into the next pattern when the phrase crosses a
    pattern boundary, and must read 0, +4, +7, +9, +7. A song whose id starts `stingers.` must
    have an order of one pattern and no `loopFrom`.
  - **Additive song field: a per-pattern `bpm`** (`patterns.<p>.bpm`, 20..300; default the song's).
    `final_edition` (ART_AUDIO §13.4: "84 → 100") needs a tempo change; step times stay exact
    because each pattern's steps are timed from its own start.
  - **SFX.** `env` is required on every layer and `dur` on every layer of a one-shot; every layer
    of a `loop` recipe needs a sustain (`env.s > 0`); a noise layer takes no `freq`, `at` or `sweep`
    (use a filter); `duty` is for `osc: 'pulse'` (or a pulse FM carrier); `caption` is a `cap.*`
    key or `null`; `gain` (recipe and layer) 0..1; `vary.pitch` and `vary.gain` 0..0.5;
    `priority` 0..3. **`fm.index`** is the standard modulation index (peak deviation / modulator
    frequency). The `pitch` option and `vary.pitch` scale every frequency of a recipe, its sweeps
    and its filters. **Envelopes:** attack linear; decay exponential to the sustain (with `s = 0`, to
    -60 dB and then 5 ms to exactly 0); release exponential to -60 dB and then 5 ms to 0 (so no
    render ever leaves denormals). Note for the ART_AUDIO §13.8 `coin` example: with `s: 0` and
    `d: 0.05` the envelope is silent before the second pitch at 0.06 s; the shipped `coin` uses
    `s: 0.6` (the example stays a valid fixture).
- **Why:** W2-Music and every package that writes a recipe needs the same reading as the validator.
- **Meanwhile:** as described; `tools/validate.cjs` already calls `SR.audio.validate`.

## 3. `docs/CONTRACT.md` §14.1 / §15 (lead): the rest of `SR.audio`

- **File:** `docs/CONTRACT.md` §14.1 and the `SR.audio` row of §15.
- **Change:** record these additive names (all in W1-S's files):
  - `SR.audio.sfx(name, o)`: `o` also takes `pan` (-1..1 for a non-spatial sound) and `at` (a delay
    in seconds); `gain` is a multiplier and `pitch` a frequency ratio (1 = as written; W1-D's
    voice blips pass `pitch`). It returns `null` for an unknown name (with one `console.warn`), an
    **inert handle** (truthy; `inert: true`, `playing()` false, no-op `stop` / `set`) while the
    audio is locked or when the sound is culled (> 900 u), else a handle `{ name, inert: false,
    playing(), stop(), set({ gain, pitch, x, y }) }` (`set({ pitch })` retunes a loop: the engine
    loop pitched by speed). A voice-bus recipe ducks the song 4 dB for its length (ART_AUDIO §13.7).
  - `SR.audio.duck(db, ms)` returns a release function; **`ms` omitted or `Infinity` holds the duck
    until `duck(0)` (which releases every held duck) or the release function**; overlapping ducks
    take the deepest (attack 80 ms, release 400 ms). This answers W1-M's request 8.
  - `SR.audio.music(id, { fade, variant })`: a falsy id fades out; the same id with another
    variant switches on the next bar line; a song asked for while the audio is locked starts at
    the unlock; a song left for another resumes at its position when it returns within 180 s
    (ART_AUDIO §13.4: overlays). It returns nothing.
  - `SR.audio.stinger(id)` → `{ id, stop() }` or `null` (unknown id, locked).
  - `SR.audio.ambience(id, level)`: beds `city`, `birds`, `crickets`, `rain`, `wind`, `fog`, `casino`,
    `bar`, `fryer`, `office`, `campus`, `park`; level 0..1 (default 1), 0 fades out over 1 s and
    stops; `SR.audio.ambience.list()`, `.time(min)` (a clock override for day / night; the default
    reads `SR.state.clock.min`), `.status()`.
  - `SR.audio.renderOffline(kind, id, seconds, opts)`: `kind` may also be `'ambience'`; `seconds`
    is optional (a song: one pass of its order plus one bar, a stinger's order plus 1 s; a one-shot:
    its length plus 20 ms; a loop: 2 s, released so it ends in silence; a bed: 4 s); `opts`:
    `sampleRate` (44100), `variant`, `pos` `{ order, step }`, `seed`, `vary` (sfx; default off),
    `level` and `min` (a bed), `sfx: [{ at, name, gain, pitch, pan }]` (more one-shots: the stress
    script), `chunk` (seconds per offline suspend; default 0.25).
  - `SR.audio.unlock()` (creates or resumes the context; the boot screen may call it from its own
    key or click handler), `SR.audio.state()` → `'locked' | 'unsupported' | 'suspended' | 'running'
    | 'closed'`, `SR.audio.stats()` (voices, peak, stolen, dropped, duck, bus gains, mono, what plays),
    `SR.audio.levels()` (RMS dBFS per bus), `SR.audio.lengthOf('song' | 'sfx', id)` (seconds),
    `SR.audio.listener(x, y, zoom)` (a spatial listener override; the default is
    `SR.world.camera`).
  - Internal, for W1-S's files and tests only (not for other packages): `SR.audio.synth`,
    `SR.audio.tracker`, `SR.audio.engine`.
- **Why:** these are the names the sound sheet, the tests and the wave-2 callers (W2-Front's boot
  screen, W2-City's adaptive music, W1-M's frame) use.
- **Meanwhile:** documented in each file's header.

## 4. ART_AUDIO §13.7 (lead): the mix as implemented

- **File:** `docs/ART_AUDIO.md` §13.7 (and ARCHITECTURE §12).
- **Change:** record: (a) the Level column is a **bus trim** under the player's slider: music 0 dB
  and sfx 0 dB (their material peaks at ≤ -10 and ≤ -6 dBFS), ambience -24 dB, ui -12 dB, voice
  -16 dB; the **voice bus follows the SFX slider** (Settings has no voice slider). (b) The master
  compressor runs with a **hard knee (0 dB)**, and a trim after it removes the automatic makeup
  gain that Web Audio compressors add ((1 / curve(0 dBFS))^0.6, +5.6 dB here), so material below
  -14 dBFS passes at unity (the e2e test measures 0.000 dB) and only peaks are squeezed. (c) Its
  6 ms lookahead delays the output; the seam check allows for it. (d) **Music notes are priority
  2.5** in the voice pool (above UI 2 and world one-shots 1, below stingers and the Stamp 3), so a
  flurry of clicks never steals the song's notes. (e) Mono downmixes after the master gain.
- **Why:** §13.7 gives levels, a threshold and a ratio but not how the levels apply, the knee or
  music's voice priority.
- **Meanwhile:** as described (named constants at the top of `js/audio/engine.js`; these are engine
  constants of ART_AUDIO / ARCHITECTURE, not BALANCE numbers, like `save.js`'s retention limits).

## 5. `js/scenes/building.js` (W1-D; the lead in wave 2): enter with a 600 ms cross-fade

- **File:** `js/scenes/building.js`, the `SR.audio.music(def.music)` call.
- **Change:** `SR.audio.music(def.music, { fade: 0.6 })`.
- **Why:** ART_AUDIO §13.4: "entering a building cross-fades to its song in 600 ms"; the default fade
  is ARCHITECTURE §12's 1.2 s.
- **Meanwhile:** buildings cross-fade in 1.2 s.

## 6. `js/scenes/minigame.js` (W1-M; the lead in wave 2): duck the song while a minigame is open

- **File:** `js/scenes/minigame.js`.
- **Change:** when the frame opens a game without its own `music`, call
  `var release = SR.audio.duck(6, Infinity)` and call `release()` (or `SR.audio.duck(0)`) when it
  closes.
- **Why:** ART_AUDIO §13.4 ("minigames duck the song 6 dB"); W1-M's request 8 asked for this hold,
  which now exists (item 3).
- **Meanwhile:** the song plays at full level under minigames that keep it.

## 7. `tools/validate.cjs`, `tests/perf/calibrate.js` (W1-Q)

- **Change:** (a) `tools/validate.cjs` already loads `js/audio/music.js` and calls
  `SR.audio.validate` (thank you); nothing else is needed for the audio formats. (b) When
  `tests/perf/calibrate.js` lands, `tests/sheets/sound-sheet.js` `calibrate()` should use it: its
  stand-in is the art sheet's workload with `REF_MS = 35` (the same estimate as
  `tests/sheets/art-sheet.js`).
- **Why:** the offline render budget (ARCHITECTURE §17 item 4) is scaled by the calibration factor.
- **Meanwhile:** the stand-in; on this container the factor is about 1.8.

## 8. Wave 2 (through the lead): notes for W2-Music, W2-City, W2-Front

- **W2-Music:** presets are levelled (`SR.audio.synth.LEVEL`) so a C4 at velocity 1 and gain 1 sits
  near -19 dBFS RMS (sustained) or -11 dBFS peak (struck); the three W1-S songs use song gains 0.7-0.8
  and instrument gains 0.3-0.95 and peak near -11 dBFS through the compressor. Render cost grows
  with simultaneous voices: chords are cheap (one voice), and the busiest song
  (`crossroads_strut`, 7 tracks, 8-16 voices) renders 60 s plus 480 sfx in about 2.5 s here against
  a 3.4 s budget; keep new songs at or under that density. Open hats, snares and plucks right on a
  loop's seam are fine (attacks are ≥ 3 ms) but keep loud noise hits away from it. W1-D plays
  `stingers.stamp` when it exists (else the `confirm` sfx); an `sfx` recipe `stamp` exists too.
  `sound.html` lists every song and stinger as it registers, and `tests/e2e/audio.test.cjs`
  checks every registered song (and variant) and the motif of `morning_edition`,
  `stingers.promotion` and `final_edition`.
- **W2-City:** the adaptive rules of ART_AUDIO §13.4 are the caller's: `SR.audio.music('streetlights',
  { fade: 4 })` at 19:30 and `crossroads_strut` at 05:30; `{ variant: 'rain' }` when it rains (the
  swap lands on the next bar line); `SR.audio.ambience('city', trafficDensity)`,
  `SR.audio.ambience('wind', edgeFactor)` (its caption fires when the bed starts); the edge sounds
  `fall_whistle`, `teeter`, `landing`, `plane_swoop`; world sfx take `{ x, y }` for panning and
  distance (the listener is `SR.world.camera`).
- **W2-Front:** the boot screen's "Press any key" unlock happens by itself on the first key, click or
  tap (`SR.audio.state()` tells when); a gamepad-only player sees the "Sound begins after one click
  or key press" line of UI §5.2 while the state is `'locked'`.
- **Why / meanwhile:** guidance only; nothing changes in W1-S's files.

## Requests to W1-S, answered

- **W1-D request 5** (UI sound names): registered in `js/audio/sfx.js`: `click`, `open`, `close`,
  `confirm`, `error`, `toggle`, `blip` (voice bus; `pitch` is a ratio), `purchase`, `ticktock`, plus
  `hover`, `typewriter` and `stamp`. `stingers.stamp` is W2-Music's.
- **W1-M request 7** (minigame sounds): `mg_hit`, `mg_miss`, `mg_item`, `mg_bin`, `mg_serve`, `mg_tick`
  and `error` are registered.
- **W1-M request 8** (a held duck): `SR.audio.duck(6, Infinity)` holds until `SR.audio.duck(0)` or the
  returned release function (item 3; the frame's change is item 6).
