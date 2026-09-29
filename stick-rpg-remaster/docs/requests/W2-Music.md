# Requests from W2-Music (music), wave 2

Each request names the file, the exact change, why, and the workaround used meanwhile (BUILD_PLAN
§1.3). Nothing here blocks W2-Music's files: every song and stinger of ART_AUDIO §13.4 is
registered and passes the objective audio test. Item 1 is for the lead (`js/ui/stamp.js`, W1-D's
file); item 2 is a record for the lead's CONTRACT / ART_AUDIO fold; item 3 records deviations from
ART_AUDIO §13.2's instrument wording; the last section answers the requests addressed to W2-Music.

## 1. `js/ui/stamp.js` (lead; W1-D's): the stinger by the stamp's key

- **File:** `js/ui/stamp.js`, `next()` (it plays `SR.audio.stinger('stamp')` for every stamp).
- **Exact change:** pick the stinger from the stamp's text key (`o.key`) with a small table, and play
  none when the entry is `null`:

  | Stamp key | Stinger | Why |
  |---|---|---|
  | `stamp.jobs.*` except `stamp.jobs.hired` (a promotion: `stamp.jobs.<rank>`, raised by `js/rules/jobs.js`) | `promotion` | ART_AUDIO §13.4: "promotion (brass fanfare with the leitmotif)"; nothing plays `stingers.promotion` today |
  | `stamp.training.*` (a degree, `js/rules/training.js`) | `null` | `js/ui/subscreens/transcript.js` (W2-Civic) already plays `stingers.degree` on `uofs.graduate*` |
  | `stamp.hospital.flatlined` | `null` | the death and hospital scenes play `stingers.flatlined` (the level-up triad over the dirge is W2-Transit's request 7) |
  | `stamp.crime.jailed` | `null` | `js/scenes/jail.js` plays `stingers.jail` on a fresh arrest |
  | anything else (stat gains, hired, bank and store robberies, champion, decree) | `stamp` | "level-up / stamp (rising triad)" |

  W2-Transit's request 7 (`o.sting === false`) is the same need seen from the hospital; the table
  covers it without a new option (an explicit `o.sting` may still override the table).
- **Why:** the promotion fanfare carries the leitmotif (ART_AUDIO §13.3 lists it, and the audio
  tests check it), but no caller plays it; every other stamp that has its own scene stinger gets
  the level-up triad on top.
- **Workaround meanwhile:** none in W2-Music's files; a promotion plays the level-up triad
  (`stingers.stamp`, C major) and the transcript's degree organ (C major) sounds with the triad.

## 2. `docs/CONTRACT.md` §14.2, `docs/ART_AUDIO.md` §13.4 (lead): records (nothing frozen changes)

- **Variant names other packages ask for** (public: `js/scenes/city.js`, `js/scenes/results.js`,
  `js/ui/subscreens/campaign.js` use them): `crossroads_strut` and `streetlights` → `rain`;
  `hail_to_the_stick` → `dictator` (B♭ minor); `final_edition` → `stamp` (every pitched part a whole
  tone up, E major: the key change on the stamp, switched on the next bar line) and `minor` (D minor,
  below $1,500).
- **`streetlights` has a `rain` variant** too (ART_AUDIO names one only for the day theme): the swung
  hats become a shaker-and-brush rain-drum and the Rhodes sit lower, so a rainy night swaps its drum
  pattern on the bar line as a rainy day does. The city scene already asks for `rain` whenever the
  playing city song has one (P1 `weather`).
- **Tempi the table leaves open:** `morning_edition` 104 bpm (4 bars, 9.2 s, played once: no
  `loopFrom`, the report is read in the quiet after it); the stingers: fall 240 bpm (1 s), rescue
  150 (1.6 s), jail 90 (2.7 s), flatlined 60 in 3/4 (3 s), promotion 132 (3.6 s), degree 80 (3 s),
  jackpot 150 (1.6 s), election_win 116 in B♭ (4.1 s), election_loss 100 (4.8 s), stamp 180 (1.3 s).
- **`final_edition`'s shape:** a four-bar reflective intro at 84 bpm, a one-bar lift at 92, the
  anthem at 100 (per-pattern `bpm`, CONTRACT §14.4), looping from the anthem (28 bars, 67 s). In the
  `minor` variant the leitmotif is sung over the relative major (F A C D C over F), so its intervals
  (0, +4, +7, +9, +7) hold at the one `motif` annotation in every variant.
- **`please_hold` loops every 28.8 s** (loopFrom 0: "restarts every 30 s as a joke"), the one
  exception to ART_AUDIO §13.1's 60-120 s loops.
- **Tests and sheet** under W2-Music's name (BUILD_PLAN §4.13 lists only the sheet):
  `tests/sheets/music.html`, `tests/node/songs.test.cjs`, `tests/e2e/songs.test.cjs`; screenshots in
  `shots/W2-Music/`.
- **Why:** these are the names and choices other packages and the next waves read; CONTRACT §14.2
  lists the song and stinger ids but not the variant names.
- **Meanwhile:** documented in each song file's header.

## 3. `docs/ART_AUDIO.md` §13.4 (lead): instrument wording the format approximates (a record)

The song format (CONTRACT §14.2) has no pitch bend, filter sweep per note, detune or distortion, so
four instrument descriptions are approximated with the presets of §13.2 (each file's header says how):

- `pawnbroker_blues` "slide lead (pitch-bent saw)": the `lead` preset with each slide a scoop from a
  semitone or a tone below, one triplet ahead; `doing_time`'s bent harmonica notes the same way.
- `funky_aisle` "wah square": the `harmonica` preset (a square through a 1.5 kHz band-pass, with
  vibrato).
- `last_call_shuffle` "honky keys (detuned pair)": a pair of timbres on the same notes (Rhodes left,
  plucked string right).
- `brawl_hall` "distorted bass": the `slap` preset (a saw with a pitch blip and a click), pushed.

If a later wave wants the real thing, the tracker would need a per-note `bend` or a `detune` field on
`inst` (W1-S's files); nothing is requested now.

## Requests addressed to W2-Music, answered

- **W2-Civic 2** (`hail_to_the_stick` → variant `dictator`): done; the B♭-minor arrangement is the
  `dictator` variant, and `tests/node/songs.test.cjs` checks that it exists.
- **W2-Front 4** (`final_edition` → variants `stamp` and `minor`): done; `stamp` is the default a
  whole tone up in every pitched part (checked note by note), `minor` rewrites every pitched part in
  D minor, and both keep the leitmotif at the annotation; the live switch lands on a bar line
  (`tests/e2e/songs.test.cjs`).
- **W2-Food, W2-Money notes** (the building and skin songs): `fry_day`, `funky_aisle`,
  `compound_interest`, `please_hold` and `tick_tock_trouble` are registered.
- **Wave-1 deferred (W1-S 8: levels, render cost, `stingers.stamp`):** every song peaks between -10.9
  and -12 dBFS with RMS -23.6 to -28.2 dBFS; no song asks more voices a second than
  `crossroads_strut` (the busiest W2-Music song, `brawl_hall`, 11.2 against 13.3), so the 3 %
  render-cost budget stays measured on it (`tests/e2e/audio.test.cjs` passes: 2.0 % of real time
  calibrated in the last run); `final_edition`'s anthem pad holds two notes to stay lighter than it;
  `stingers.stamp` is registered.
