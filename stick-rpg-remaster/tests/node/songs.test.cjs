// tests/node/songs.test.cjs — owner: W2-Music. The songs and stingers of ART_AUDIO §13.4 as data, in Node
// (BUILD_PLAN §4.13; CONTRACT §14.2): every W2-Music song and the ten stingers are registered by
// their own files and nothing else there; each passes the format validator (pattern lengths, the
// order, the stinger rules) and loads alone after js/boot/* (the load-time rule, shuffled loading);
// tempo, key, scale and metre follow the §13.4 table (final_edition's 84 → 100 as per-pattern bpm);
// every loop lasts 60-120 s (ART_AUDIO §13.1; please_hold restarts every 30 s on purpose) and every
// song has contrasting sections; the leitmotif (0, +4, +7, +9, +7) reads at every motif annotation of
// morning_edition, final_edition (each variant) and stingers.promotion; the variants the callers ask
// for exist (the city's `rain`, the Dictator's `dictator`, the results' `stamp` and `minor`);
// final_edition's `stamp` is the default a whole tone up in every pitched part and its `minor` covers
// every pitched part; the stingers are short (fall ≈ 1 s, flatlined ≈ 3 s); the tempo grid holds over
// 120 s of each song (every event on its pattern's step grid); and no song asks more voices a second
// of the pool than crossroads_strut (W1-S request 8: the render-cost budget is measured on the
// busiest song).
//   node tests/node/songs.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('songs (W2-Music)');
const { SR } = L.load({ mode: 'all', extra: ['js/audio/music.js'] });
const A = SR.audio, K = A.tracker;

const SONGS = ['streetlights', 'fry_day', 'funky_aisle', 'pawnbroker_blues', 'showroom_smooth', 'compound_interest',
  'please_hold', 'campus_canon', 'last_call_shuffle', 'high_roller_lounge', 'brawl_hall', 'tick_tock_trouble',
  'midnight_express', 'hail_to_the_stick', 'doing_time', 'waiting_room', 'morning_edition', 'final_edition'];
const STINGERS = ['fall', 'rescue', 'jail', 'flatlined', 'promotion', 'degree', 'jackpot', 'election_win', 'election_loss', 'stamp']
  .map((n) => 'stingers.' + n);

// ART_AUDIO §13.4: [bpm, key, scale, beats a bar]; the scale strings are the songs' documentation fields.
const TABLE = {
  streetlights: [84, 'D', 'minor', 4], fry_day: [128, 'E', 'major', 4], funky_aisle: [100, 'E', 'minor', 4],
  pawnbroker_blues: [76, 'A', 'blues', 4], showroom_smooth: [96, 'Bb', 'major', 4], compound_interest: [90, 'F', 'major', 4],
  please_hold: [100, 'C', 'major', 4], campus_canon: [90, 'G', 'major', 4], last_call_shuffle: [112, 'A', 'blues', 4],
  high_roller_lounge: [118, 'C', 'major', 4], brawl_hall: [150, 'D', 'minor', 4], tick_tock_trouble: [124, 'A', 'minor', 4],
  midnight_express: [120, 'E', 'minor', 4], hail_to_the_stick: [116, 'Bb', 'major', 4], doing_time: [70, 'E', 'blues', 4],
  waiting_room: [80, 'E', 'major', 4], morning_edition: [104, 'F', 'major', 4], final_edition: [84, 'D', 'major', 4],
};
// "lazy swing", "76 shuffle", "118 swing", swung blues: a swing amount on a 16th / 8th grid or a triplet grid.
const SWUNG = ['streetlights', 'pawnbroker_blues', 'last_call_shuffle', 'high_roller_lounge', 'doing_time'];

const def = (id) => SR.reg.song[id];
const pitched = (d, t) => d.inst[t] && d.inst[t].preset !== 'kit';

/** @returns {{once: number, loop: number}} one pass of the order and the loop from loopFrom (s). */
function lengths(d, variant) {
  const C = K.compile(d, variant);
  let loop = 0;
  if (C.loopFrom !== null) for (let i = C.loopFrom; i < C.order.length; i++) { const P = C.patterns[C.order[i]]; loop += P.steps * P.dur; }
  return { once: C.once, loop };
}

/** @returns {number[]} the MIDI notes of a pitched step string, in order (chords flattened). */
function notesOf(str) {
  const out = [];
  K.parseTrack(str, false).ev.forEach((e) => { if (e && e.kind === 'note') e.notes.forEach((n) => out.push(n)); });
  return out;
}

/** @returns {object[]} the events of `seconds` of a song from its start (the tracker's sequencer). */
function events(d, seconds, variant) {
  const seq = K.sequencer(K.compile(d, variant), { start: 0 });
  const out = [];
  seq.advance(seconds, (e) => { if (e.kind !== 'variant') out.push(e); });
  return out;
}

/** @returns {number[]} every step time from the start for `seconds`, computed from the format's rules here. */
function grid(d, seconds) {
  const spb = d.stepsPerBeat, swing = spb % 2 === 0 ? (d.swing || 0) : 0, out = [];
  let t0 = 0, oi = 0;
  while (t0 < seconds) {
    const P = d.patterns[d.order[oi]], dur = 60 / (P.bpm || d.bpm) / spb, steps = P.bars * d.meter[0] * spb;
    for (let s = 0; s < steps; s++) out.push(t0 + s * dur + (s % 2 ? swing * dur : 0));
    t0 += steps * dur;
    if (++oi >= d.order.length) { if (typeof d.loopFrom !== 'number') break; oi = d.loopFrom; }
  }
  return out;
}

T.section('registration: one file per song, the stingers in stingers.js (CONTRACT §14.2)');
{
  T.eq(SONGS.filter((id) => !def(id)), [], 'every W2-Music song is registered (' + SONGS.length + ')');
  T.eq(SONGS.filter((id) => SR.registry.file('song', id) !== 'js/audio/songs/' + id + '.js'), [], 'each by its own file js/audio/songs/<id>.js');
  T.eq(STINGERS.filter((id) => !def(id)), [], 'the ten stingers are registered: ' + STINGERS.map((s) => s.slice(9)).join(', '));
  T.eq(STINGERS.filter((id) => SR.registry.file('song', id) !== 'js/audio/songs/stingers.js'), [], '... all by js/audio/songs/stingers.js');
  const extra = SR.registry.entries('song').filter((e) => /^js\/audio\/songs\//.test(e.file))
    .filter((e) => e.file === 'js/audio/songs/stingers.js' ? !STINGERS.includes(e.id) : e.file !== 'js/audio/songs/' + e.id + '.js');
  T.eq(extra.map((e) => e.id + ' (' + e.file + ')'), [], 'no song file registers anything else');
  const W2FILES = SONGS.map((id) => 'js/audio/songs/' + id + '.js').concat(['js/audio/songs/stingers.js']);
  const fs = require('fs'), path = require('path');
  const stubs = W2FILES.filter((f) => /\/\*\s*stub, owner:/.test(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8')));
  T.eq(stubs, [], 'no W2-Music song file is still a stub');
  const heads = W2FILES.filter((f) => !fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8').startsWith('// ' + f + ' — owner: W2-Music.'));
  T.eq(heads, [], 'every file starts with its header (path, owner W2-Music, purpose)');
}

T.section('the format, and the load-time rule');
{
  T.eq(SONGS.concat(STINGERS).map((id) => A.validate('song', def(id)).map((p) => id + ': ' + p)).filter((p) => p.length), [],
    'every song and stinger passes SR.audio.validate (pattern lengths, order, stinger rules, motif)');
  const alone = [];
  for (const id of SONGS.concat(['stingers'])) {
    const r = L.load({ files: ['js/boot/namespace.js', 'js/boot/util.js', 'js/boot/events.js', 'js/audio/songs/' + id + '.js'], keepGoing: true });
    if (r.errors.length || !Object.keys(r.SR.reg.song || {}).length) alone.push(id + ': ' + (r.errors[0] ? r.errors[0].error.message : 'registered nothing'));
  }
  T.eq(alone, [], 'each file loads alone after js/boot/* (no call into another module at load time; no Math.random)');
  for (let seed = 11; seed <= 13; seed++) {
    const r = L.load({ mode: 'all', extra: ['js/audio/music.js'], shuffle: seed, keepGoing: true });
    T.ok(r.errors.length === 0 && SONGS.every((id) => r.SR.reg.song[id]) && STINGERS.every((id) => r.SR.reg.song[id]),
      'shuffled load ' + seed + ': every song and stinger registers, no errors');
  }
  const again = L.load({ mode: 'all' }).SR;
  T.eq(JSON.stringify(again.reg.song.final_edition), JSON.stringify(def('final_edition')), 'the generated data (final_edition\'s variants) is the same on every load');
}

T.section('tempo, key and metre follow ART_AUDIO §13.4');
{
  const off = [];
  for (const id of SONGS) {
    const d = def(id), [bpm, key, scale, beats] = TABLE[id];
    if (d.bpm !== bpm || d.key !== key || d.scale !== scale || d.meter[0] !== beats || d.meter[1] !== 4) {
      off.push(id + ': ' + [d.bpm, d.key, d.scale, d.meter.join('/')].join(' '));
    }
  }
  T.eq(off, [], 'bpm, key, scale and 4/4 as the table says (' + SONGS.length + ' songs)');
  T.eq(SWUNG.filter((id) => !(def(id).stepsPerBeat === 3 || def(id).swing > 0.2)), [],
    'the swung ones swing (a triplet grid or a swing ≥ 0.2): ' + SWUNG.join(', '));
  const fe = def('final_edition');
  const tempi = fe.order.map((p) => fe.patterns[p].bpm || fe.bpm);
  T.eq([tempi[0], tempi[tempi.length - 1]], [84, 100], 'final_edition: 84 → 100 (the intro at 84, the anthem at 100: ' + tempi.join(', ') + ')');
  T.ok(tempi.every((b, i) => i === 0 || b >= tempi[i - 1] || i >= fe.loopFrom), 'the tempo only rises before the loop');
  T.eq(fe.patterns[fe.order[fe.loopFrom]].bpm, 100, 'the loop is the anthem at 100 (the reflective intro plays once)');
  T.eq(def('morning_edition').order.map((p) => def('morning_edition').patterns[p].bars).reduce((a, b) => a + b, 0), 4, 'morning_edition is 4 bars');
  T.eq(def('morning_edition').loopFrom, undefined, 'morning_edition plays once (the report is read in the quiet after it)');
}

T.section('loops and sections (ART_AUDIO §13.1: 60-120 s, A/B sections, a breakdown)');
{
  const bad = [];
  for (const id of SONGS) {
    const d = def(id);
    if (id === 'morning_edition') continue;
    const { loop } = lengths(d);
    const ok = id === 'please_hold' ? loop >= 25 && loop <= 32 && d.loopFrom === 0 : loop >= 60 && loop <= 120;
    if (!ok) bad.push(id + ': loop ' + loop.toFixed(1) + ' s');
  }
  T.eq(bad, [], 'every loop lasts 60-120 s; please_hold restarts from the top every ~30 s (the joke)');
  const flat = SONGS.filter((id) => id !== 'morning_edition' && new Set(def(id).order.slice(def(id).loopFrom || 0)).size < 2);
  T.eq(flat, [], 'every loop has contrasting sections (at least an A and a B pattern, not one riff)');
  T.eq(SONGS.filter((id) => def(id).gain === undefined || def(id).gain > 1), [], 'every song sets its mix gain (0..1)');
}

T.section('the leitmotif (ART_AUDIO §13.3)');
{
  for (const id of ['morning_edition', 'final_edition', 'stingers.promotion']) {
    const d = def(id);
    for (const v of [null].concat(Object.keys(d.variants || {}))) {
      const reads = (d.motif || []).map((m) => K.motifNotes(d, m, v));
      T.ok(reads.length > 0 && reads.every((n) => K.isMotif(n)), id + (v ? ' · ' + v : '') + ': 0, +4, +7, +9, +7 at ' +
        (d.motif || []).map((m) => m.pattern + '/' + m.track + '@' + m.step).join(', ') + ' (' + reads.map((n) => n.map((x) => x - n[0]).join(',')).join('; ') + ')');
    }
  }
  const ann = SONGS.concat(STINGERS).filter((id) => def(id).motif);
  T.eq(ann.sort(), ['final_edition', 'morning_edition', 'stingers.promotion'], 'the songs ART_AUDIO §13.3 lists (of W2-Music\'s) carry the annotation, no other');
  const me = def('morning_edition');
  T.eq(me.inst[me.motif[0].track].preset, 'bell', 'morning_edition: the motif on the bells');
  const pr = def('stingers.promotion');
  T.eq(pr.inst[pr.motif[0].track].preset, 'brass', 'stingers.promotion: the motif on the brass');
  T.eq(def('final_edition').inst[def('final_edition').motif[0].track].preset, 'brass', 'final_edition: the motif as the anthem\'s brass hook');
}

T.section('the variants the callers ask for');
{
  T.ok(def('crossroads_strut').variants.rain && def('streetlights').variants.rain, 'the city songs have `rain` (js/scenes/city.js asks when it rains)');
  T.ok(!!def('hail_to_the_stick').variants.dictator, 'hail_to_the_stick has `dictator` (js/ui/subscreens/campaign.js)');
  T.ok(def('final_edition').variants.stamp && def('final_edition').variants.minor, 'final_edition has `stamp` and `minor` (js/scenes/results.js)');
  const fe = def('final_edition');
  const up = [], same = [];
  for (const p of Object.keys(fe.patterns)) {
    for (const t of Object.keys(fe.patterns[p].tracks)) {
      const base = fe.patterns[p].tracks[t];
      const st = fe.variants.stamp.tracks[t] && fe.variants.stamp.tracks[t][p];
      if (!pitched(fe, t)) { if (st) same.push(p + '/' + t); continue; }
      const a = notesOf(base), b = st ? notesOf(st) : [];
      const tokA = K.tokenize(base).map((x) => x.replace(/[A-G][#b]?\d/g, 'N')), tokB = st ? K.tokenize(st).map((x) => x.replace(/[A-G][#b]?\d/g, 'N')) : [];
      if (!st || a.length !== b.length || a.some((n, i) => b[i] - n !== 2) || tokA.join(' ') !== tokB.join(' ')) up.push(p + '/' + t);
    }
  }
  T.eq(up, [], 'stamp: every pitched part of every pattern a whole tone up, same rhythm (the key change on the stamp)');
  T.eq(same, [], 'stamp: the drums are untouched');
  const missing = [];
  for (const p of Object.keys(fe.patterns)) {
    for (const t of Object.keys(fe.patterns[p].tracks)) if (pitched(fe, t) && !(fe.variants.minor.tracks[t] && fe.variants.minor.tracks[t][p])) missing.push(p + '/' + t);
  }
  T.eq(missing, [], 'minor: every pitched part of every pattern is rewritten (no major part sounds under the minor harmony)');
  const minorNotes = [];
  Object.keys(fe.variants.minor.tracks).forEach((t) => Object.keys(fe.variants.minor.tracks[t]).forEach((p) => notesOf(fe.variants.minor.tracks[t][p]).forEach((n) => minorNotes.push(n % 12))));
  const fSharp = minorNotes.filter((n) => n === 6).length, bNat = minorNotes.filter((n) => n === 11).length, f = minorNotes.filter((n) => n === 5).length;
  T.ok(f > 20 * Math.max(1, fSharp) && bNat === 0, 'minor: D minor spelling (F ' + f + ', F# ' + fSharp + ', B natural ' + bNat + ' times)');
  const hs = def('hail_to_the_stick'), dict = hs.variants.dictator.tracks;
  const uncovered = [], naturals = [];
  for (const p of Object.keys(hs.patterns)) {
    for (const t of Object.keys(hs.patterns[p].tracks)) {
      if (!pitched(hs, t)) continue;
      const v = dict[t] && dict[t][p];
      if (notesOf(hs.patterns[p].tracks[t]).some((n) => n % 12 === 2 || n % 12 === 7) && !v) uncovered.push(p + '/' + t);
      if (v && notesOf(v).some((n) => n % 12 === 2 || n % 12 === 7)) naturals.push(p + '/' + t);
    }
  }
  T.eq([uncovered, naturals], [[], []], 'dictator: every march part with a D or G is rewritten in B♭ minor (D♭, G♭), none left natural');
}

T.section('stingers (ART_AUDIO §13.4)');
{
  const len = {};
  STINGERS.forEach((id) => { len[id.slice(9)] = lengths(def(id)).once; });
  T.ok(STINGERS.every((id) => def(id).order.length === 1 && def(id).loopFrom === undefined), 'one pattern each, no loop (D21)');
  T.ok(Math.abs(len.fall - 1) < 0.05, 'fall: a whistle-down of 1 s (' + len.fall.toFixed(2) + ' s)');
  T.ok(Math.abs(len.flatlined - 3) < 0.05, 'flatlined: a 3 s dirge (' + len.flatlined.toFixed(2) + ' s)');
  T.ok(Object.keys(len).every((k) => len[k] >= 0.8 && len[k] <= 5), 'every stinger lasts 0.8-5 s (' + Object.keys(len).map((k) => k + ' ' + len[k].toFixed(1)).join(', ') + ')');
  T.ok(len.stamp <= 1.5, 'the stamp\'s level-up is short enough to sit under the Stamp (' + len.stamp.toFixed(2) + ' s)');
  const presets = (id) => Object.keys(def(id).inst).map((t) => def(id).inst[t].preset);
  T.ok(presets('stingers.fall').includes('whistle') && presets('stingers.jail').includes('brass') && presets('stingers.flatlined').includes('organ') &&
    presets('stingers.degree').includes('organ') && presets('stingers.jackpot').includes('bell') && presets('stingers.election_loss').includes('brass') &&
    presets('stingers.election_win').includes('brass') && presets('stingers.promotion').includes('brass'), 'the instruments the table names (whistle, brass, organ, bells)');
  const fall = notesOf(def('stingers.fall').patterns.S.tracks.whistle);
  T.ok(fall.every((n, i) => i === 0 || n < fall[i - 1]), 'fall: the whistle only goes down');
  const up = notesOf(def('stingers.rescue').patterns.S.tracks.whistle);
  T.ok(up.every((n, i) => i === 0 || n > up[i - 1]), 'rescue: the whistle only goes up (the swoop)');
  const bone = notesOf(def('stingers.election_loss').patterns.S.tracks.bone);
  T.ok(bone.slice(0, 4).every((n, i) => i === 0 || n === bone[i - 1] - 1), 'election_loss: the trombone sinks by semitones');
  const st = notesOf(def('stingers.stamp').patterns.S.tracks.bells);
  T.eq(st.slice(0, 3).map((n) => n - st[0]), [0, 4, 7], 'stamp: a rising major triad');
}

T.section('the tempo grid holds (120 s of every song, every variant)');
{
  const bad = [];
  let n = 0;
  for (const id of SONGS) {
    const d = def(id);
    for (const v of [null].concat(Object.keys(d.variants || {}))) {
      const g = grid(d, 130);
      const evs = events(d, 120, v);
      let j = 0, worst = 0;
      for (const e of evs) {
        while (j < g.length - 1 && g[j + 1] <= e.time + 1e-9) j++;
        worst = Math.max(worst, Math.min(Math.abs(e.time - g[j]), j + 1 < g.length ? Math.abs(g[j + 1] - e.time) : Infinity));
        n++;
      }
      if (!(worst <= 1e-6) || evs.length < (typeof d.loopFrom === 'number' ? 100 : 20)) bad.push(id + (v ? '·' + v : '') + ': worst ' + (worst * 1000).toFixed(4) + ' ms, ' + evs.length + ' events');
    }
  }
  T.eq(bad, [], 'every event of ' + n + ' sits on its pattern\'s step grid (per-pattern bpm, swing on odd steps) within 1 µs');
}

T.section('render cost: no song busier than crossroads_strut (W1-S request 8)');
{
  const rate = (id, v) => { const d = def(id), s = lengths(d, v).once; return events(d, s, v).length / s; };
  const ref = rate('crossroads_strut');
  const over = [];
  for (const id of SONGS) for (const v of [null].concat(Object.keys(def(id).variants || {}))) if (rate(id, v) > ref) over.push(id + (v ? '·' + v : '') + ' ' + rate(id, v).toFixed(1));
  T.eq(over, [], 'events a second of one pass ≤ crossroads_strut\'s ' + ref.toFixed(1) + ' (busiest of W2-Music: ' +
    SONGS.map((id) => [id, rate(id)]).sort((a, b) => b[1] - a[1])[0].map((x) => typeof x === 'number' ? x.toFixed(1) : x).join(' ') + ')');
}

T.done();
