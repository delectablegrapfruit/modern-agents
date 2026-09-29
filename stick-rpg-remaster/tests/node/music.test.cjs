// tests/node/music.test.cjs — owner: W1-S. The audio data formats and the tracker, in Node (BUILD_PLAN
// §3.9; CONTRACT §14; ART_AUDIO §13.8): sfx.js and the songs load in mode `all` (no DOM, audio or
// browser random source at load time) and music.js loads as an extra file; every registered song
// and sfx recipe passes SR.audio.validate; the step-string parser (tokens, chords, lengths,
// velocities, bare ! / ?, '-', '|'); the validator catches planted errors (the ART_AUDIO example's
// short tracks among them); the leitmotif at the motif annotations; the sequencer's timing over
// 60 s of jittery 25 ms ticks (every event within 1 ms of the ideal grid, never scheduled late,
// none missing); note ends; swing; loops and stingers; the variant switch on the bar line; the
// per-pattern bpm; song lengths; the names the UI (W1-D) and the minigames (W1-M) play.
//   node tests/node/music.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('music');
const { SR } = L.load({ mode: 'all', extra: ['js/audio/music.js'] });
const A = SR.audio, K = A.tracker;
const clone = (o) => JSON.parse(JSON.stringify(o));

T.section('loading');
{
  T.ok(typeof A.validate === 'function', 'SR.audio.validate is defined by music.js (D31)');
  const res = L.load({ mode: 'all', keepGoing: true });
  T.eq(res.errors.length, 0, 'mode all (sfx.js and every song file, no music.js) loads and boots in Node');
  T.ok(Object.keys(res.SR.reg.sfx).length >= 80, 'about 80 sfx recipes are registered (ART_AUDIO §13.5)');
  for (let seed = 1; seed <= 3; seed++) {
    const r = L.load({ mode: 'all', extra: ['js/audio/music.js'], shuffle: seed, keepGoing: true });
    T.eq(r.errors.length, 0, 'shuffled load ' + seed + ' with music.js boots');
  }
}

T.section('every registered song and sfx is valid');
{
  const songs = Object.keys(SR.reg.song), sfx = Object.keys(SR.reg.sfx);
  T.ok(['paper_sky', 'crossroads_strut', 'home_sweet_paper'].every((id) => songs.includes(id)), 'the three W1-S songs are registered');
  const badSongs = songs.map((id) => A.validate('song', SR.reg.song[id])).filter((p) => p.length);
  T.eq(badSongs, [], 'every song validates (' + songs.length + ')');
  const badSfx = sfx.map((id) => A.validate('sfx', SR.reg.sfx[id])).filter((p) => p.length);
  T.eq(badSfx, [], 'every sfx recipe validates (' + sfx.length + ')');
  T.ok(sfx.every((n) => /^[a-z][a-z0-9_]*$/.test(n)), 'sfx names are snake_case');
  const want = ['click', 'open', 'close', 'confirm', 'error', 'toggle', 'blip', 'purchase', 'ticktock', 'stamp',
    'mg_tick', 'mg_hit', 'mg_miss', 'mg_item', 'mg_bin', 'mg_serve'];
  T.eq(want.filter((n) => !SR.reg.sfx[n]), [], 'the names W1-D and W1-M play are registered (docs/requests/W1-D.md 5, W1-M.md 7)');
  const caps = sfx.map((n) => SR.reg.sfx[n].caption).filter(Boolean);
  const allowed = ['cap.horn', 'cap.siren', 'cap.answering', 'cap.edgeWind', 'cap.thunder', 'cap.knock'];
  T.eq(caps.filter((k) => !SR.text.has(k)), [], 'every caption key resolves in en-ui.js');
  T.eq(allowed.filter((k) => !caps.includes(k)), [], 'each ART_AUDIO §13.7 caption key belongs to a recipe');
  T.eq(caps.filter((k) => !allowed.includes(k)), [], 'no caption key outside CONTRACT §14.1');
  const groups = { ui: 0, sfx: 0, ambience: 0, voice: 0 };
  sfx.forEach((n) => { groups[SR.reg.sfx[n].bus || 'sfx']++; });
  T.ok(groups.ui >= 8 && groups.voice >= 5 && groups.ambience >= 6, 'recipes on the ui, voice and ambience buses (' + JSON.stringify(groups) + ')');
  T.ok(sfx.filter((n) => SR.reg.sfx[n].loop).every((n) => SR.reg.sfx[n].priority === 0 || SR.reg.sfx[n].bus === 'ambience'),
    'loops are priority 0 (ART_AUDIO §13.7)');
  T.ok(SR.reg.sfx.stamp.priority === 3 && SR.reg.sfx.jackpot_bells.priority === 3, 'the Stamp and the jackpot are priority 3');
}

T.section('the step-string parser (CONTRACT §14.2, D19)');
{
  T.eq(K.tokenize('k . h . | s ! h o'), ['k', '.', 'h', '.', 's', '!', 'h', 'o'], '"|" separates bars and is ignored');
  T.eq(K.tokenize('[C4 E4 G4]:4? . C#4:3!|D4'), ['[C4 E4 G4]:4?', '.', 'C#4:3!', 'D4'], 'a chord is one token; | also splits');
  T.eq([K.midiOf('C4'), K.midiOf('A4'), K.midiOf('C#4'), K.midiOf('Bb3'), K.midiOf('C-1'), K.midiOf('c4')], [60, 69, 61, 58, 0, null],
    'scientific pitch: C4 = 60, A4 = 69');
  T.eq(K.parseToken('C#4:3!', false), { kind: 'note', notes: [61], len: 3, vel: 1 }, 'note, length and accent');
  T.eq(K.parseToken('[C4 E4 G4]:4?', false), { kind: 'note', notes: [60, 64, 67], len: 4, vel: 0.4 }, 'chord with ghost velocity');
  T.eq(K.parseToken('E2', false), { kind: 'note', notes: [40], len: 1, vel: 0.75 }, 'defaults: length 1, velocity 0.75');
  T.eq([K.parseToken('.', false).kind, K.parseToken('-', false).kind, K.parseToken('!', true).vel, K.parseToken('?', false).vel],
    ['rest', 'off', 1, 0.4], '. rest, - note-off, bare ! / ? re-trigger at 1.0 / 0.4');
  T.eq(K.parseToken('s!', true), { kind: 'hit', drum: 's', vel: 1 }, 'drum hit with accent');
  T.ok('kshocbrzt'.split('').every((d) => K.parseToken(d, true).kind === 'hit'), 'the nine drum tokens');
  T.ok(K.parseToken('x', true).error && K.parseToken('C4', true).error, 'a bad drum token and a note on a kit track are errors');
  T.ok(K.parseToken('k', false).error && K.parseToken('c4', false).error && K.parseToken('H4', false).error, 'drum letters and lower case are not notes');
  T.ok(K.parseToken('C9', false).error && K.parseToken('C4:0', false).error && K.parseToken('[]', false).error, 'out of range, zero length, empty chord');
  const tr = K.parseTrack('C4:4 . . - E4 ! . .', false);
  T.eq([tr.count, tr.on], [8, [true, false, false, true, true, true, false, false]], 'onsets: notes, "-" and re-triggers');
}

// A 1-bar 4/4 fixture song for the validator and the sequencer.
function song(extra) {
  return Object.assign({
    bpm: 120, swing: 0, meter: [4, 4], stepsPerBeat: 4, gain: 0.7,
    inst: { lead: { preset: 'lead', gain: 0.5, pan: 0 }, drums: { preset: 'kit', gain: 0.7 } },
    patterns: {
      A: { bars: 1, tracks: { lead: 'C4:4 . . . E4:4 . . . G4:2 . A4:2 . G4:4 . . .', drums: 'k . h . s . h . k . h . s . h o' } },
      B: { bars: 1, tracks: { lead: 'D4:16 . . . . . . . . . . . . . . .', drums: 'k . . . s . . . k . . . s . . .' } },
    },
    order: ['A', 'B'], loopFrom: 0,
  }, extra || {});
}

T.section('the validator catches planted errors (D31)');
{
  const has = (p, re) => p.some((m) => re.test(m));
  T.eq(A.validate('song', Object.assign(song(), { id: 'fixture' })), [], 'the fixture song is valid');
  // ART_AUDIO §13.8's example, as CONTRACT §14.2 warns: bass 26 and lead 29 steps; B1 and A2 missing.
  const ex = {
    id: 'crossroads_example', bpm: 104, swing: 0.12, meter: [4, 4], stepsPerBeat: 4, key: 'E', scale: 'dorian', gain: 0.7,
    inst: { bass: { preset: 'slap', gain: 0.8, pan: 0 }, clav: { preset: 'clav', gain: 0.45, pan: -0.3 },
      lead: { preset: 'brass', gain: 0.5, pan: 0.2 }, drums: { preset: 'kit', gain: 0.7 } },
    patterns: {
      intro: { bars: 2, tracks: { drums: 'k . h . s . h . k . h . s . h o | k . h . s . h . k k h . s . h o' } },
      A1: { bars: 2, tracks: {
        bass: 'E2:2 . E2 . G2:2 . A2 . | B2:3 . . A2 G2 . E2:2 . D2 . E2:4 . . . . . . .',
        lead: 'F4:2 . A4:2 . C5:2 . D5:3 . . C5:4 . . . | . . . . . . . . . . . . . . . .',
        drums: 'k . h . s . h . k k h . s . h o | k . h . s . h . k . h . s ! h o',
      } },
    },
    order: ['intro', 'A1', 'A1', 'B1', 'A2'], loopFrom: 1,
    motif: [{ pattern: 'A1', track: 'lead', step: 0 }],
  };
  const pe = A.validate('song', ex);
  T.ok(has(pe, /pattern "A1" track "bass": 26 steps, want 32/), 'the example\'s bass has 26 steps', pe);
  T.ok(has(pe, /pattern "A1" track "lead": 29 steps, want 32/), 'the example\'s lead has 29 steps');
  T.ok(has(pe, /order\[3\] "B1" is not a pattern/) && has(pe, /order\[4\] "A2" is not a pattern/), 'B1 and A2 are not patterns');
  T.ok(!has(pe, /drums/), 'the example\'s drums (with the "s !" double) are valid');
  const ok = clone(ex);
  ok.patterns.A1.tracks.bass = 'E2:2 . E2 . G2:2 . A2 . B2:3 . . A2 G2 . . . | E2:2 . D2 . E2:4 . . . . . . . . . . .';
  ok.patterns.A1.tracks.lead = 'F4:2 . A4:2 . C5:2 . D5:3 . . C5:4 . . . . . . | . . . . . . . . . . . . . . . .';
  ok.order = ['intro', 'A1', 'A1'];
  T.eq(A.validate('song', ok), [], 'completed, the example validates (its lead reads F A C D C: the leitmotif)');

  const bad = (mut, re, msg) => {
    const d = Object.assign(song(), { id: 'bad' });
    mut(d);
    const p = A.validate('song', d);
    T.ok(has(p, re), msg, p);
  };
  bad((d) => { d.inst.lead.preset = 'kazoo'; }, /unknown preset "kazoo"/, 'an unknown preset');
  bad((d) => { d.patterns.A.tracks.horn = 'C4'; }, /track "horn": not in inst/, 'a track missing from inst');
  bad((d) => { d.patterns.A.tracks.lead = d.patterns.A.tracks.lead.replace('E4:4', 'e4:4'); }, /bad note token "e4:4"/, 'a lower-case note');
  bad((d) => { d.patterns.A.tracks.lead = d.patterns.A.tracks.lead.replace('C4:4', 'k'); }, /bad note token "k"/, 'a drum letter on a pitched track');
  bad((d) => { d.patterns.A.tracks.drums = d.patterns.A.tracks.drums.replace('s', 'C4'); }, /bad drum token "C4"/, 'a note on a kit track');
  bad((d) => { d.patterns.B.tracks.drums += ' k'; }, /track "drums": 17 steps, want 16/, 'one step too many');
  bad((d) => { d.swing = 0.7; }, /swing must be 0\.\.0\.5/, 'swing out of range');
  bad((d) => { d.loopFrom = 2; }, /loopFrom must be an index/, 'loopFrom out of range');
  bad((d) => { d.bmp = 90; }, /unknown field "bmp"/, 'an unknown field (a typo)');
  bad((d) => { d.meter = [4]; }, /meter must be/, 'a bad meter');
  bad((d) => { d.inst.lead.gain = 1.5; }, /gain must be 0\.\.1/, 'an instrument gain over 1');
  bad((d) => { d.id = 'stingers.bad'; }, /exactly one pattern/, 'a stinger with two order entries');
  bad((d) => { d.id = 'stingers.bad'; d.order = ['A']; }, /a stinger has no loopFrom/, 'a stinger with loopFrom');
  bad((d) => { d.variants = { rain: { tracks: { drums: { A: 'z . z .' } } } }; }, /variant "rain" track "drums" pattern "A": 4 steps, want 16/, 'a short variant track');
  bad((d) => { d.variants = { rain: { tracks: { hats: { A: 'z' } } } }; }, /variant "rain" track "hats": not in inst/, 'a variant track missing from inst');
  bad((d) => { d.variants = { rain: { inst: { lead: { gain: 3 } } } }; }, /gain must be 0\.\.1/, 'a bad variant instrument override');
  T.eq(A.validate('song', Object.assign(song({ motif: [{ pattern: 'A', track: 'lead', step: 0 }] }), { id: 'm' })), [],
    'C E G A G at the annotation is the leitmotif');
  bad((d) => { d.patterns.A.tracks.lead = d.patterns.A.tracks.lead.replace('A4:2', 'B4:2'); d.motif = [{ pattern: 'A', track: 'lead', step: 0 }]; },
    /reads 0, 4, 7, 11, 7/, 'a wrong interval at the motif annotation');
  bad((d) => { d.motif = [{ pattern: 'A', track: 'lead', step: 1 }]; }, /no note starts at step 1/, 'a motif annotation on a rest');
  bad((d) => { d.motif = [{ pattern: 'A', track: 'drums', step: 0 }]; }, /drum track/, 'a motif annotation on a drum track');
  bad((d) => { d.patterns.A.bpm = 500; }, /bpm must be a number 20\.\.300/, 'a bad per-pattern bpm');
  T.eq(A.validate('clip', {}), ['SR.audio.validate: unknown kind "clip" (song | sfx)'], 'an unknown kind');

  const fx = () => ({ id: 'bad', bus: 'sfx', gain: 0.5, priority: 1, caption: null,
    layers: [{ osc: 'square', freq: [988, 1319], at: [0, 0.06], env: { a: 0.005, d: 0.05, s: 0, r: 0.02 }, dur: 0.12 }], vary: { pitch: 0.03, gain: 0.1 } });
  T.eq(A.validate('sfx', fx()), [], 'the ART_AUDIO §13.8 coin example is valid');
  const badFx = (mut, re, msg) => { const d = fx(); mut(d); const p = A.validate('sfx', d); T.ok(has(p, re), msg, p); };
  badFx((d) => { d.layers[0].noise = 'white'; }, /exactly one source .*found osc, noise/, 'two sources in a layer');
  badFx((d) => { delete d.layers[0].osc; }, /exactly one source .*found none/, 'no source');
  badFx((d) => { d.layers[0].env.a = 0.001; }, /env\.a must be ≥ 0\.005/, 'an attack under 5 ms');
  badFx((d) => { d.bus = 'radio'; }, /bus must be one of/, 'an unknown bus');
  badFx((d) => { d.caption = 'ui.horn'; }, /caption must be a cap\.\* text key/, 'a caption outside cap.*');
  badFx((d) => { d.layers[0].sweep = [800, 120, 0.9, 'exp']; }, /freq or sweep, not both/, 'freq and sweep together');
  badFx((d) => { d.layers = [{ noise: 'white', freq: 400, env: { a: 0.005, d: 0.05, s: 0, r: 0.01 }, dur: 0.05 }]; }, /noise takes no freq/, 'noise with a frequency');
  badFx((d) => { delete d.layers[0].dur; }, /dur .* is required on a one-shot/, 'a one-shot without a gate');
  badFx((d) => { d.loop = true; }, /a loop layer needs a sustain/, 'a loop whose layer does not sustain');
  badFx((d) => { d.layers[0].pitch = 2; }, /unknown field "pitch"/, 'an unknown layer field');
  badFx((d) => { d.layers = [{ fm: { carrier: 'sine', index: 2 }, freq: 440, env: { a: 0.005, d: 0.1, s: 0, r: 0.02 }, dur: 0.1 }]; }, /fm\.ratio/, 'fm without a ratio');
  badFx((d) => { d.layers[0].duty = 0.25; }, /duty \(0\.\.1\) is for pulse only/, 'duty on a square');
  badFx((d) => { d.layers[0].at = [0]; }, /one offset per freq/, 'at of the wrong length');
  badFx((d) => { d.layers[0].filter = { type: 'lopass', freq: 500 }; }, /BiquadFilterNode type/, 'an unknown filter type');
  badFx((d) => { d.priority = 5; }, /priority must be 0\.\.3/, 'a priority over 3');
  badFx((d) => { d.layers = []; }, /at least one layer/, 'no layers');
}

T.section('the leitmotif (ART_AUDIO §13.3)');
{
  for (const id of ['paper_sky', 'crossroads_strut']) {
    const def = SR.reg.song[id];
    T.ok(Array.isArray(def.motif) && def.motif.length >= 1, id + ' has a motif annotation');
    for (const m of def.motif || []) {
      const notes = K.motifNotes(def, m);
      T.eq(notes.map((x) => x - notes[0]), [0, 4, 7, 9, 7], id + ': 0, +4, +7, +9, +7 at ' + m.pattern + ' / ' + m.track + ' / ' + m.step);
    }
  }
  const ps = SR.reg.song.paper_sky;
  T.eq(K.motifNotes(ps, ps.motif[0]).map((m) => m % 12), [5, 9, 0, 2, 0], 'paper_sky states it in F: F A C D C');
  for (const id of ['morning_edition', 'stingers.promotion', 'final_edition']) {
    if (SR.reg.song[id]) T.ok(Array.isArray(SR.reg.song[id].motif) && SR.reg.song[id].motif.length > 0, id + ' carries a motif annotation');
  }
}

T.section('the W1-S songs (ART_AUDIO §13.4)');
{
  const ps = SR.reg.song.paper_sky, cs = SR.reg.song.crossroads_strut, hs = SR.reg.song.home_sweet_paper;
  T.eq([ps.bpm, ps.key, ps.meter, ps.inst.lead.preset], [92, 'F', [4, 4], 'whistle'], 'paper_sky: 92, F major, 4/4, a whistle lead');
  T.ok(['pluck', 'pad', 'kit'].every((p) => Object.values(ps.inst).some((i) => i.preset === p)), 'paper_sky: pluck, pad and a kit');
  T.ok(ps.patterns.A1.tracks.kit.includes('b'), 'paper_sky: a brushed kit');
  const loopBars = (d) => d.order.slice(d.loopFrom).reduce((n, p) => n + d.patterns[p].bars, 0);
  T.eq(loopBars(ps), 32, 'paper_sky: AABA, 32 bars a loop');
  T.eq([cs.bpm, cs.key, cs.scale, cs.inst.bass.preset, cs.inst.clav.preset, cs.inst.horn.preset], [104, 'E', 'dorian', 'slap', 'clav', 'brass'],
    'crossroads_strut: 104, E dorian, slap bass, clav, a brass horn hook');
  T.ok(cs.motif[0].track === 'horn', 'crossroads_strut: the leitmotif is the horn hook');
  T.ok(cs.variants && cs.variants.rain && cs.variants.rain.tracks.hats && cs.variants.rain.inst.pad.gain < cs.inst.pad.gain,
    'crossroads_strut rain: the hats replaced, the pad lowered');
  T.ok(Object.values(cs.variants.rain.tracks.hats).every((s) => !/\bh\b|\bo\b/.test(s)), 'the rain-drum pattern has no hats');
  T.eq([hs.bpm, hs.key, hs.meter, hs.inst.box.preset], [76, 'C', [3, 4], 'bell'], 'home_sweet_paper: 76, C major, 3/4, a music box');
  for (const d of [ps, cs, hs]) {
    const C = K.compile(d);
    const loop = d.order.slice(d.loopFrom).reduce((s, p) => s + C.patterns[p].steps * C.patterns[p].dur, 0);
    T.ok(loop >= 60 && loop <= 120, d.id + ': a loop of ' + loop.toFixed(1) + ' s (ART_AUDIO §13.1: 60-120 s)');
  }
  const bar = (d) => d.meter[0] * 60 / d.bpm;
  T.ok(Math.abs(K.lengthOf('paper_sky') - 34 * bar(ps)) < 1e-9, 'lengthOf(paper_sky) = 34 bars (intro + 32)');
  T.ok(Math.abs(K.lengthOf('home_sweet_paper') - 34 * bar(hs)) < 1e-9, 'lengthOf(home_sweet_paper) = 34 bars of 3/4');
  T.eq(K.lengthOf('nope'), null, 'lengthOf an unknown id is null');
  T.ok(K.compile(ps) === K.compile(ps) && K.compile(cs, 'rain') !== K.compile(cs), 'compile is cached per def and variant');
}

// ---- the sequencer ----

/** Drives a sequencer like the engine: ticks every ~25 ms (jittered), scheduling 120 ms ahead. */
function drive(S, seconds, o) {
  o = o || {};
  const r = SR.rng.create(o.seed || 5);
  const out = [];
  let now = 0, late = 0;
  while (now < seconds) {
    const events = [];
    S.advance(now + K.LOOKAHEAD, (e) => events.push(e), o.noLate ? undefined : now - 0.03);
    for (const e of events) { e.at = now; if (e.time < now) late++; out.push(e); }
    let dt = 0.025 + r.float(-0.01, 0.01);
    if (r.chance(0.02)) dt += 0.05;          // a busy frame
    if (o.gapAt && now < o.gapAt && now + dt >= o.gapAt) dt += o.gap;
    now += dt;
  }
  return { events: out, late };
}

T.section('the sequencer: tempo holds over 60 s (ARCHITECTURE §12, §18)');
for (const id of ['crossroads_strut', 'paper_sky', 'home_sweet_paper']) {
  const def = SR.reg.song[id];
  const C = K.compile(def);
  const start = 0.05;
  const S = K.sequencer(C, { start });
  const { events, late } = drive(S, 60);
  // The ideal grid, computed independently: one bpm, steps counted from the song's start.
  const d = 60 / def.bpm / def.stepsPerBeat;
  const lens = def.order.map((p) => def.patterns[p].bars * def.meter[0] * def.stepsPerBeat);
  const ideal = [];
  let g = 0, oi = 0, st = 0;
  for (;;) {
    const t = start + g * d + (def.swing && def.stepsPerBeat % 2 === 0 && st % 2 === 1 ? def.swing * d : 0);
    if (t >= 60 + K.LOOKAHEAD) break;
    const P = C.patterns[def.order[oi]];
    for (const name of Object.keys(P.tracks)) {
      const e = P.tracks[name].ev[st];
      if (e && (e.kind === 'note' || e.kind === 'hit' || e.kind === 'again')) ideal.push({ t, track: name });
    }
    g++; st++;
    if (st >= lens[oi]) { st = 0; oi = oi + 1 < def.order.length ? oi + 1 : def.loopFrom; }
  }
  const got = events.filter((e) => e.kind !== 'variant');
  let worst = 0;
  const n = Math.min(got.length, ideal.length);
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(got[i].time - ideal[i].t));
  T.ok(got.length === ideal.length, id + ': every event over 60 s is scheduled once (' + got.length + ' / ' + ideal.length + ')');
  T.ok(worst <= 0.001, id + ': every event within 1 ms of the ideal grid (worst ' + (worst * 1000).toExponential(2) + ' ms)');
  T.eq(late, 0, id + ': nothing is scheduled in the past');
  T.ok(got.every((e) => e.time - e.at <= K.LOOKAHEAD + 1e-9), id + ': nothing is scheduled more than 120 ms ahead');
  T.ok(S.loops >= 0 && got.every((e, i) => i === 0 || e.time >= got[i - 1].time - 1e-12), id + ': events come in time order');
}
{
  const C = K.compile(SR.reg.song.crossroads_strut);
  const S = K.sequencer(C, { start: 0 });
  const { events } = drive(S, 20, { gapAt: 5, gap: 0.6 });
  const after = events.filter((e) => e.time > 5.2);
  const d = 60 / 104 / 4;
  const onGrid = after.every((e) => {
    const k = e.time / d;
    const frac = k - Math.floor(k);
    return frac < 1e-6 || frac > 1 - 1e-6 || Math.abs(frac - 0.12) < 1e-6;
  });
  T.ok(S.skipped > 0 && events.every((e) => e.time >= e.at - 0.03 - 1e-9), 'a 600 ms stall skips the late steps instead of playing them late');
  T.ok(onGrid, 'after a stall the steps stay on the grid (no drift)');
}

T.section('note ends, swing, re-triggers, loops, stingers, variants, per-pattern bpm');
{
  const def = (tracks, extra) => Object.assign({ id: 'fx', bpm: 60, meter: [4, 4], stepsPerBeat: 1, gain: 1,
    inst: { a: { preset: 'keys' }, k: { preset: 'kit' } }, patterns: { P: { bars: 1, tracks }, Q: { bars: 1, tracks: { a: '. . . .' } } },
    order: ['P', 'Q'], loopFrom: 0 }, extra || {});
  const run = (d, until, o) => { const ev = []; K.sequencer(K.compile(d), Object.assign({ start: 0 }, o)).advance(until, (e) => ev.push(e)); return ev; };
  let ev = run(def({ a: 'C4:2 . . .' }), 1);
  T.eq([ev[0].time, ev[0].end], [0, 2], 'a note lasts its length (2 steps of 1 s)');
  ev = run(def({ a: 'C4:4 . - .' }), 1);
  T.eq(ev[0].end, 2, 'a "-" ends it early');
  ev = run(def({ a: 'C4:4 E4 . .' }), 1);
  T.eq(ev[0].end, 1, 'the next note ends it');
  ev = run(def({ a: '. . . C4:3' }), 4);
  T.eq(ev[0].end, 6, 'a note runs on into the next pattern when that track is silent there');
  ev = run(def({ a: '. . . C4:3' }, { patterns: { P: { bars: 1, tracks: { a: '. . . C4:3' } }, Q: { bars: 1, tracks: { a: 'D4 . . .' } } } }), 4);
  T.eq(ev[0].end, 4, '... and stops at that pattern\'s first note');
  ev = run(def({ a: '. . . C4:8' }, { order: ['P'], loopFrom: undefined, id: 'stingers.fx' }), 10);
  T.eq(ev[0].end, 4, 'a stinger\'s last note is cut at the song\'s end');
  ev = run(def({ a: 'C4:2? . ! ?', k: 's ! . ?' }), 4);
  const notes = ev.filter((e) => e.track === 'a'), hits = ev.filter((e) => e.track === 'k');
  T.eq(notes.map((e) => [e.time, e.notes, e.vel]), [[0, [60], 0.4], [2, [60], 1], [3, [60], 0.4]], 'bare ! and ? re-trigger the last note');
  T.eq(hits.map((e) => [e.time, e.drum, e.vel]), [[0, 's', 0.75], [1, 's', 1], [3, 's', 0.4]], '... and the last drum hit');
  T.eq(notes[0].end, 2, 'a re-trigger ends the note before it');

  const sw = Object.assign(def({ a: 'C4 D4 E4 F4' }), { stepsPerBeat: 2, swing: 0.25 });
  ev = run(sw, 4);
  T.eq(ev.map((e) => e.time), [0, 0.625, 1, 1.625], 'swing delays every second step by swing × a step');
  const sw3 = Object.assign(def({ a: 'C4 D4 E4 F4' }), { stepsPerBeat: 1, swing: 0.25 });
  T.eq(run(sw3, 4).map((e) => e.time), [0, 1, 2, 3], 'no swing with an odd number of steps per beat');

  const loop = K.sequencer(K.compile(def({ a: 'C4 . . .' }, { order: ['Q', 'P'], loopFrom: 1 })), { start: 0 });
  const le = [];
  loop.advance(16, (e) => le.push(e));
  T.eq([le.map((e) => e.time), loop.loops], [[4, 8, 12], 3], 'the order plays once, then loops from loopFrom');
  const sting = K.sequencer(K.compile(def({ a: 'C4 . . .' }, { id: 'stingers.x', order: ['P'], loopFrom: undefined })), { start: 1 });
  sting.advance(100, () => {});
  T.eq([sting.done, sting.endTime], [true, 5], 'a stinger plays its one pattern and ends');

  const vdef = def({ a: 'C4 C4 C4 C4', k: 'k k k k' }, { stepsPerBeat: 2, variants: { rain: { tracks: { k: { P: 'z z z z', Q: 'z . . .' } }, inst: { k: { gain: 0.3 } } } },
    patterns: { P: { bars: 1, tracks: { a: 'C4 C4 C4 C4 C4 C4 C4 C4', k: 'k k k k k k k k' } }, Q: { bars: 1, tracks: { a: '. . . . . . . .' } } } });
  vdef.variants.rain.tracks.k = { P: 'z z z z z z z z', Q: 'z . . . . . . .' };
  T.eq(A.validate('song', vdef), [], 'the variant fixture is valid');
  const vs = K.sequencer(K.compile(vdef), { start: 0 });
  const ve = [];
  vs.advance(1.1, (e) => ve.push(e));
  vs.setVariant(K.compile(vdef, 'rain'));
  vs.advance(12, (e) => ve.push(e));
  const sw1 = ve.find((e) => e.kind === 'variant');
  T.ok(sw1 && sw1.time === 4, 'the variant switches on the next bar line (bar = 4 s)', sw1 && sw1.time);
  T.eq(ve.filter((e) => e.kind === 'hit' && e.time < 4).every((e) => e.drum === 'k') && ve.filter((e) => e.kind === 'hit' && e.time >= 4).every((e) => e.drum === 'z'), true,
    'hits before the bar line are the song\'s, after it the variant\'s');
  T.eq(sw1 && sw1.C.inst.k.gain, 0.3, 'the switch carries the variant\'s instrument overrides');

  const bp = def({ a: 'C4 C4 C4 C4' }, { patterns: { P: { bars: 1, tracks: { a: 'C4 C4 C4 C4' } }, Q: { bars: 1, bpm: 120, tracks: { a: 'D4 D4 D4 D4' } } }, loopFrom: undefined, order: ['P', 'Q'] });
  T.eq(A.validate('song', bp), [], 'a per-pattern bpm is valid (additive, docs/requests/W1-S.md)');
  T.eq(run(bp, 10).map((e) => e.time), [0, 1, 2, 3, 4, 4.5, 5, 5.5], 'the second pattern runs at 120 bpm');
  T.eq(K.compile(bp).once, 6, 'lengthOf sums the patterns at their tempos');
  const resumed = run(def({ a: 'C4 D4 E4 F4' }), 2, { pos: { order: 0, step: 2 } });
  T.eq(resumed.map((e) => [e.time, e.notes[0]]), [[0, 64], [1, 65]], 'a sequencer can start at a saved position (resume after an overlay)');
}

T.section('stinger ids (D21)');
{
  SR.def.song('stingers.promotion_test', { bpm: 120, meter: [4, 4], stepsPerBeat: 4, inst: { a: { preset: 'brass' } },
    patterns: { S: { bars: 1, tracks: { a: 'C4:16 . . . . . . . . . . . . . . .' } } }, order: ['S'] });
  T.eq([K.stingerId('promotion_test'), K.stingerId('stingers.promotion_test'), K.stingerId('nope')],
    ['stingers.promotion_test', 'stingers.promotion_test', null], 'a bare name means stingers.<name>');
  T.eq(A.validate('song', SR.reg.song['stingers.promotion_test']), [], 'a one-pattern stinger without loopFrom is valid');
}

T.done();
