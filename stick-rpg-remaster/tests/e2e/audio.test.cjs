// tests/e2e/audio.test.cjs — owner: W1-S (W2-Music's songs are checked here too, as they register).
// The audio engine in Chromium (BUILD_PLAN §3.9; ARCHITECTURE §12, §17, §18):
// - the objective audio test: every sfx and every song (one full order + one bar, and each variant)
//   rendered with SR.audio.renderOffline at 44.1 kHz: peak ≤ -10 dBFS (songs) / ≤ -6 dBFS (sfx), song
//   RMS in [-30, -16] dBFS, no NaN or denormals, no sample jump over 0.25 and ≤ 0.05 at the loop
//   seam, sfx start and end silent (|x| < 0.01), the format validator (pattern lengths, order) and
//   the leitmotif at every motif annotation of the songs ART_AUDIO §13.3 lists;
// - the master chain: unity gain below the compressor's threshold, its latency;
// - the context unlocks on the first key, click or tap and not on a gamepad button; a song asked
//   for while locked starts at the unlock;
// - live scheduling: every event on the tempo grid within 1 ms, scheduled ahead; the rain variant
//   switches on a bar line; cross-fades; resume after an overlay; ducking (timed and held);
//   stingers; captions with a direction and distance culling; loops with handles; volumes, the
//   settings and mono; ambience beds; ≤ 24 voices under the stress button; the hidden tab suspends
//   the context and showing it resumes it;
// - offline rendering of 60 s of the busiest song plus an sfx stress script costs ≤ 3 % of real time
//   (calibrated);
// - index.html boots with zero console errors, locked until a key.
// Screenshots: shots/W1-S/*.png (git-ignored).
//   node tests/e2e/audio.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-S');
const SHEET = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'sound.html')).href;
const MOTIF_SONGS = ['paper_sky', 'crossroads_strut', 'morning_edition', 'stingers.promotion', 'final_edition'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openSheet(opts) {
  const t = await h.open(Object.assign({ url: SHEET, quality: null }, opts || {}));
  await t.page.waitForFunction(() => window.soundSheet && window.soundSheet.ready);
  return t;
}

(async () => {
  const T = h.suite('e2e audio');
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await openSheet();
  const { page } = t;
  const E = (fn, arg) => page.evaluate(fn, arg);
  const waitState = (s) => page.waitForFunction((s) => SR.audio.state() === s, s, { timeout: 5000 }).then(() => true, () => false);

  // ---- unlock rules ----
  T.section('the context unlocks on a key, click or tap, never on a gamepad button');
  T.eq(await E(() => [SR.audio.state(), SR.audio.engine.context() === null]), ['locked', true], 'no AudioContext after boot');
  T.eq(await E(() => {
    const pad = { id: 'Mock pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    navigator.getGamepads = () => [pad];
    for (let i = 0; i < 4; i++) {
      pad.buttons[0] = { pressed: i % 2 === 0, touched: i % 2 === 0, value: i % 2 === 0 ? 1 : 0 };
      pad.buttons[9] = pad.buttons[0];
      if (SR.input && SR.input.poll) SR.input.poll(1 / 60);
    }
    if (SR.input && SR.input.inject) { SR.input.inject('confirm', true); SR.input.inject('confirm', false); }
    return [SR.audio.state(), SR.audio.engine.context() === null];
  }), ['locked', true], 'gamepad presses (A, Start) and injected actions leave it locked');
  await E(() => { SR.audio.music('home_sweet_paper'); SR.audio.ambience('city', 0.5); });
  T.eq(await E(() => SR.audio.stats().music.pending), 'home_sweet_paper', 'a song asked for while locked waits');
  await page.keyboard.press('KeyA');
  T.ok(await waitState('running'), 'the first key press unlocks it (running)');
  await sleep(150);
  T.eq(await E(() => [SR.audio.stats().music.song, SR.audio.stats().ambience]), ['home_sweet_paper', { city: 0.5 }],
    'the waiting song and ambience start at the unlock');

  // ---- live scheduling ----
  T.section('live scheduling: tempo, variants, cross-fades, resume');
  await E(() => { SR.audio.music(null, { fade: 0 }); SR.audio.ambience('city', 0); });
  await sleep(200);
  await E(() => { SR.audio.engine.live().trace = []; SR.audio.music('crossroads_strut', { fade: 0 }); });
  const start = await E(() => SR.audio.stats().music.start);
  await sleep(2600);
  await E(() => { SR.audio.music('crossroads_strut', { variant: 'rain' }); });
  await sleep(2600);
  const live = await E((start) => {
    const tr = SR.audio.engine.live().trace.filter((e) => e.song === 'crossroads_strut');
    const d = 60 / 104 / 4, bar = 16 * d;
    let worst = 0, ahead = Infinity, maxAhead = 0;
    for (const e of tr) {
      if (e.kind === 'variant') continue;
      const k = (e.time - start) / d;
      const n = Math.round(k), n2 = Math.floor(k);
      const err = Math.min(Math.abs(k - n), Math.abs(k - n2 - 0.12)) * d;   // swing: odd steps sit 0.12 of a step late
      worst = Math.max(worst, err);
      ahead = Math.min(ahead, e.time - e.at);
      maxAhead = Math.max(maxAhead, e.time - e.at);
    }
    const v = tr.find((e) => e.kind === 'variant');
    const barPos = v ? (v.time - start) / bar : null;
    return { n: tr.length, worst, ahead, maxAhead, variant: v ? v.variant : null, barPos };
  }, start);
  T.ok(live.n > 40, 'the live scheduler played ' + live.n + ' events in 5 s');
  T.ok(live.worst <= 0.001, 'every live event sits on the tempo grid within 1 ms (worst ' + (live.worst * 1000).toFixed(4) + ' ms)');
  T.ok(live.ahead > 0, 'every event was scheduled before its time (min lead ' + (live.ahead * 1000).toFixed(1) + ' ms)');
  T.ok(live.maxAhead <= 0.2, 'events are scheduled about 120 ms ahead (max ' + (live.maxAhead * 1000).toFixed(0) + ' ms)');
  T.ok(live.variant === 'rain' && live.barPos !== null && Math.abs(live.barPos - Math.round(live.barPos)) < 1e-6,
    'the rain variant switched on a bar line (bar ' + live.barPos + ')');
  const before = await E(() => SR.audio.stats().music.position);
  await E(() => SR.audio.music('paper_sky', { fade: 1.2 }));
  await sleep(600);
  const mid = await E(() => SR.audio.stats().music);
  T.ok(mid.song === 'paper_sky' && mid.gain > 0.15 && mid.gain < 0.85, 'mid cross-fade: the new song is rising (' + mid.gain.toFixed(2) + ')');
  T.ok(mid.fading.length === 1 && mid.fading[0].id === 'crossroads_strut' && mid.fading[0].gain > 0.15 && mid.fading[0].gain < 0.85,
    'mid cross-fade: the old song is falling (' + (mid.fading[0] && mid.fading[0].gain.toFixed(2)) + ')');
  await sleep(1000);
  const after = await E(() => SR.audio.stats().music);
  T.ok(after.gain > 0.97 && after.fading.every((f) => f.gain < 0.02), 'after 1.2 s the new song is at full level and the old one silent');
  T.ok(after.resume.crossroads_strut && after.resume.crossroads_strut.order >= before.order, 'the old song\'s position is remembered');
  await E(() => SR.audio.music('crossroads_strut', { fade: 0.3 }));
  const back = await E(() => SR.audio.stats().music);
  T.ok(back.song === 'crossroads_strut' && back.position.order >= 1 && back.position.order === after.resume.crossroads_strut.order,
    'returning to it resumes at its position (order ' + back.position.order + '), not the intro');

  T.section('ducking and stingers');
  const duckAt = async (ms) => { await sleep(ms); return E(() => SR.audio.stats().duck); };
  await E(() => SR.audio.duck(6, 600));
  let dv = await duckAt(380);
  T.ok(Math.abs(dv - 0.501) < 0.06, 'duck(6, 600): the song path is 6 dB down (' + dv.toFixed(3) + ')');
  dv = await duckAt(1400);
  T.ok(Math.abs(dv - 1) < 0.03, '... and back after it (' + dv.toFixed(3) + ')');
  await E(() => SR.audio.duck(6, Infinity));
  dv = await duckAt(1300);
  T.ok(Math.abs(dv - 0.501) < 0.04, 'duck(6, Infinity) holds (' + dv.toFixed(3) + ')');
  await E(() => SR.audio.duck(0));
  dv = await duckAt(1300);
  T.ok(Math.abs(dv - 1) < 0.03, 'duck(0) releases the held duck (' + dv.toFixed(3) + ')');
  const st = await E(() => {
    SR.def.song('stingers.test', { bpm: 120, meter: [4, 4], stepsPerBeat: 4, inst: { a: { preset: 'brass', gain: 0.6 } },
      patterns: { S: { bars: 1, tracks: { a: '[C4 E4 G4]:8 . . . . . . . [C4 F4 A4]:8 . . . . . . .' } } }, order: ['S'] });
    const h1 = SR.audio.stinger('test');
    return { id: h1 && h1.id, list: SR.audio.stats().music.stingers, unknown: SR.audio.stinger('nope') };
  });
  await sleep(300);
  const sd = await E(() => SR.audio.stats());
  T.eq([st.id, st.list, st.unknown], ['stingers.test', ['stingers.test'], null], 'stinger(\'test\') plays stingers.test; an unknown one is null');
  T.ok(sd.duckDb === 6 && sd.duck < 0.6, 'a stinger ducks the song 6 dB');
  await sleep(3500);
  T.eq(await E(() => [SR.audio.stats().music.stingers, SR.audio.stats().duckDb]), [[], 0], 'the stinger ends and the duck lifts');

  T.section('sfx: spatial, captions, handles, volumes');
  const caps = await E(async () => {
    const got = [];
    SR.events.on('caption', (p) => got.push(p));
    SR.audio.listener(0, 0, 1);
    const hL = SR.audio.sfx('horn', { x: -500, y: 0 });
    const hR = SR.audio.sfx('siren', { x: 500, y: 0 });
    const far = SR.audio.sfx('thunder', { x: 2000, y: 0 });
    SR.audio.sfx('knock');
    return { got, volL: hL.voice.vol, farInert: far.inert, farPlaying: far.playing(), unknown: SR.audio.sfx('no_such_sound') };
  });
  T.eq(caps.got.map((c) => c.key), ['cap.horn', 'cap.siren', 'cap.knock'], 'captions for horn, siren and knock; none for a culled sound');
  T.ok(caps.got[0].dir < -0.2 && caps.got[1].dir > 0.2 && caps.got[2].dir === null, 'captions carry the direction (pan) or null');
  T.ok(Math.abs(caps.volL - 1 / (1 + 500 / 400)) < 1e-6, 'gain 1 / (1 + d / 400) at 500 u');
  T.eq([caps.farInert, caps.farPlaying, caps.unknown], [true, false, null], 'beyond 900 u a sound is culled; an unknown name is null');
  const loop = await E(async () => {
    const hd = SR.audio.sfx('engine_loop');
    const p0 = hd.playing();
    hd.set({ pitch: 2, gain: 0.5 });
    await new Promise((r) => setTimeout(r, 300));
    const f = hd.voice.srcs[0].frequency.value;
    hd.stop();
    await new Promise((r) => setTimeout(r, 500));
    return { p0, f, p1: hd.playing() };
  });
  T.ok(loop.p0 && Math.abs(loop.f - 110) < 3 && !loop.p1, 'a loop plays, set({ pitch: 2 }) retunes it (' + loop.f.toFixed(1) + ' Hz), stop() releases it');
  const vols = await E(async () => {
    SR.audio.setVolume('music', 0.5);
    SR.settings.set('audio.ui', 0.5);
    SR.settings.set('audio.mono', true);
    await new Promise((r) => setTimeout(r, 250));
    const s = SR.audio.stats();
    const out = { music: s.buses.music, ui: s.buses.ui, voice: s.buses.voice, mono: s.mono };
    SR.settings.set('audio.music', 0.6);
    SR.settings.reset();
    await new Promise((r) => setTimeout(r, 250));
    const s2 = SR.audio.stats();
    out.music2 = s2.buses.music; out.mono2 = s2.mono; out.ui2 = s2.buses.ui;
    return out;
  });
  T.ok(Math.abs(vols.music - 0.5) < 0.01, 'setVolume(\'music\', 0.5) sets the music bus');
  T.ok(Math.abs(vols.ui - 0.5 * Math.pow(10, -12 / 20)) < 0.005, 'audio.ui 0.5 on the ui bus at its -12 dB level');
  T.ok(Math.abs(vols.voice - 0.8 * Math.pow(10, -16 / 20)) < 0.005, 'the voice bus follows the SFX slider at -16 dB');
  T.ok(vols.mono === true && vols.mono2 === false, 'audio.mono routes the master through the mono downmix, and back');
  T.ok(Math.abs(vols.music2 - 0.7) < 0.01 && Math.abs(vols.ui2 - 0.7 * Math.pow(10, -12 / 20)) < 0.005,
    'a settings change replaces the session volume; reset restores the defaults');

  T.section('ambience');
  const amb = await E(async () => {
    SR.audio.ambience.time(480);
    SR.audio.ambience('park', 0.7);
    SR.audio.ambience('rain', 1);
    await new Promise((r) => setTimeout(r, 1200));
    const a = SR.audio.stats().ambience;
    SR.audio.ambience('park', 0.3);
    SR.audio.ambience('rain', 0);
    await new Promise((r) => setTimeout(r, 2300));
    return { a, b: SR.audio.stats().ambience, list: SR.audio.ambience.list() };
  });
  T.eq(amb.a, { park: 0.7, rain: 1 }, 'beds start at their levels');
  T.eq(amb.b, { park: 0.3 }, 'a level change keeps a bed; level 0 fades it out and stops it');
  T.ok(['city', 'birds', 'crickets', 'rain', 'wind', 'fog', 'casino', 'bar', 'fryer', 'office', 'campus', 'park'].every((b) => amb.list.includes(b)),
    'the beds of ART_AUDIO §13.6');
  await E(() => SR.audio.ambience('park', 0));

  T.section('voices: ≤ 24 under stress (ARCHITECTURE §17)');
  const stress = await E(() => soundSheet.stress(200, 900));
  T.ok(stress.maxVoices <= 24 && stress.stats.peakVoices <= 24, 'at most 24 voices (max ' + stress.maxVoices + ', peak ' + stress.stats.peakVoices + ')');
  T.ok(stress.stats.stolen + stress.stats.dropped > 0, 'voices were stolen or dropped (stolen ' + stress.stats.stolen + ', dropped ' + stress.stats.dropped + ')');
  await t.shot(path.join(SHOTS, 'sound-sheet-live.png'));

  T.section('the hidden tab suspends the context');
  const vis = await E(async () => {
    const set = (v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
    set('hidden');
    await new Promise((r) => setTimeout(r, 300));
    const a = SR.audio.state();
    set('visible');
    await new Promise((r) => setTimeout(r, 300));
    return [a, SR.audio.state()];
  });
  T.eq(vis, ['suspended', 'running'], 'hidden → suspended, visible → running');
  await E(() => SR.audio.music(null, { fade: 0.1 }));

  // ---- objective checks ----
  T.section('the master chain');
  const chain = await E(() => soundSheet.chain());
  T.ok(Math.abs(chain.gainDb) < 0.1, 'unity gain below the compressor\'s threshold (makeup gain removed: ' + chain.gainDb.toFixed(3) + ' dB)');
  T.ok(chain.latency >= 0 && chain.latency < 0.01, 'compressor latency ' + (chain.latency * 1000).toFixed(1) + ' ms (the seam window allows for it)');
  T.eq(await E(() => SR.audio.synth.PRESETS.slice().sort().join() === SR.audio.tracker.PRESETS.slice().sort().join()), true,
    'the synth builds every preset the validator allows');

  T.section('the objective audio test: every song and variant (ARCHITECTURE §18)');
  const songs = await E(async () => {
    const out = [];
    for (const id of Object.keys(SR.reg.song)) {
      if (id === 'stingers.test') continue;
      const vs = [null].concat(Object.keys(SR.reg.song[id].variants || {}));
      for (const v of vs) {
        const info = await soundSheet.check('song', id, v ? { variant: v } : {});
        out.push({ id, variant: v, fails: soundSheet.verdict(info), a: info.a, motif: info.motif, ms: info.ms, stats: info.stats, loops: info.loops });
      }
    }
    return out;
  });
  for (const s of songs) {
    const a = s.a;
    T.ok(!s.fails.length, s.id + (s.variant ? ' · ' + s.variant : '') + ': peak ' + a.peakDb.toFixed(1) + ' dBFS, RMS ' + a.rmsDb.toFixed(1) +
      ', jump ' + a.maxDiff.toFixed(3) + (a.seamDiff !== null ? ', seam ' + a.seamDiff.toFixed(3) : '') + ', ' + a.seconds.toFixed(1) + ' s',
    s.fails.length ? s.fails : undefined);
  }
  for (const id of MOTIF_SONGS) {
    const s = songs.find((x) => x.id === id && !x.variant);
    if (!s) { T.ok(['morning_edition', 'stingers.promotion', 'final_edition'].includes(id), id + ' is not registered yet (W2-Music)'); continue; }
    T.ok(s.motif.length > 0 && s.motif.every((m) => m.ok), id + ': the leitmotif (0, +4, +7, +9, +7) at every motif annotation');
  }

  T.section('the objective audio test: every sfx');
  const sfx = await E(async () => {
    const out = [];
    for (const id of Object.keys(SR.reg.sfx).sort()) {
      const info = await soundSheet.check('sfx', id);
      out.push({ id, fails: soundSheet.verdict(info), a: info.a });
    }
    return out;
  });
  const bad = sfx.filter((s) => s.fails.length);
  T.eq(bad.map((s) => s.id + ': ' + s.fails.join(', ')), [], 'all ' + sfx.length + ' sfx: peak ≤ -6 dBFS, no jump > 0.25, silent start and end, no NaN or denormals');
  const loud = sfx.slice().sort((x, y) => y.a.peak - x.a.peak)[0];
  T.ok(['stamp', 'jackpot_bells'].includes(loud.id) || loud.a.peakDb <= sfx.find((s) => s.id === 'stamp').a.peakDb + 0.5,
    'no sound is louder than the Stamp (loudest: ' + loud.id + ' ' + loud.a.peakDb.toFixed(1) + ' dBFS; stamp ' + sfx.find((s) => s.id === 'stamp').a.peakDb.toFixed(1) + ')');
  const amb2 = await E(async () => {
    const out = {};
    for (const id of SR.audio.ambience.list()) {
      const buf = await SR.audio.renderOffline('ambience', id, 6, { min: id === 'crickets' ? 1320 : 480, seed: 3 });
      const a = soundSheet.analyze(buf);
      out[id] = { peak: a.peak, jump: a.maxDiff, nan: a.nan, den: a.denormals };
    }
    return out;
  });
  T.eq(Object.keys(amb2).filter((k) => !(amb2[k].peak > 0.0005 && amb2[k].peak < 0.5 && amb2[k].jump <= 0.25 && !amb2[k].nan && !amb2[k].den)), [],
    'every ambience bed renders quietly (ambience bus -24 dB), without jumps, NaN or denormals');

  T.section('render cost: 60 s of the busiest song + an sfx stress ≤ 3 % of real time (calibrated)');
  const busiest = songs.filter((s) => !s.variant && s.loops).sort((x, y) => y.stats.added / y.a.seconds - x.stats.added / x.a.seconds)[0].id;
  const perf = await E(async (busiest) => {
    const cal = soundSheet.calibrate();
    const names = Object.keys(SR.reg.sfx).filter((k) => !SR.reg.sfx[k].loop);
    const r = SR.rng.create(11);
    const events = [];
    for (let i = 0; i < 480; i++) events.push({ at: r.float(0, 59.5), name: names[r.int(0, names.length - 1)], gain: 0.5, pan: r.float(-0.8, 0.8) });
    await SR.audio.renderOffline('song', busiest, 5);          // warm-up
    let best = Infinity, stats = null;
    for (let k = 0; k < 2; k++) {
      const t0 = performance.now();
      await SR.audio.renderOffline('song', busiest, 60, { sfx: events });
      best = Math.min(best, performance.now() - t0);
      stats = SR.audio.engine.lastRender();
    }
    return { cal, ms: best, stats };
  }, busiest);
  const budget = 0.03 * 60000 * perf.cal.factor;
  T.ok(perf.ms <= budget, busiest + ' 60 s + 480 sfx rendered in ' + perf.ms.toFixed(0) + ' ms ≤ ' + budget.toFixed(0) +
    ' ms (3 % × calibration ' + perf.cal.factor.toFixed(2) + ')');
  T.ok(perf.stats.peakVoices <= 24, 'the offline stress stays within 24 voices (peak ' + perf.stats.peakVoices + ', stolen ' + perf.stats.stolen + ')');

  T.section('contact sheet');
  await E(() => soundSheet.contact());
  await page.setViewportSize({ width: 1640, height: 1000 });
  await page.locator('[data-id="contact"]').screenshot({ path: path.join(SHOTS, 'contact-sheet.png') });
  await page.screenshot({ path: path.join(SHOTS, 'sound-sheet.png'), fullPage: true });
  T.ok(fs.existsSync(path.join(SHOTS, 'contact-sheet.png')), 'shots/W1-S/contact-sheet.png');
  T.eq(t.errors(), [], 'the sound sheet ran with zero console errors');
  await t.close();

  T.section('a click and a tap unlock too');
  {
    const c = await openSheet();
    T.eq(await c.eval(() => SR.audio.state()), 'locked', 'locked after boot');
    await c.page.mouse.click(5, 5);
    T.ok(await c.page.waitForFunction(() => SR.audio.state() === 'running', null, { timeout: 5000 }).then(() => true, () => false), 'a click unlocks it');
    T.eq(c.errors(), [], 'no errors');
    await c.close();
    const p = await openSheet({ touch: true, width: 900, height: 600 });
    T.eq(await p.eval(() => SR.audio.state()), 'locked', 'locked after boot (touch)');
    await p.page.touchscreen.tap(5, 5);
    T.ok(await p.page.waitForFunction(() => SR.audio.state() === 'running', null, { timeout: 5000 }).then(() => true, () => false), 'a tap unlocks it');
    T.eq(p.errors(), [], 'no errors');
    await p.close();
  }

  T.section('index.html');
  {
    const g = await h.open({ quality: null });
    T.eq(await g.eval(() => [SR.audio.state(), typeof SR.audio.sfx, typeof SR.audio.music, typeof SR.audio.renderOffline]),
      ['locked', 'function', 'function', 'function'], 'SR.audio is complete and locked at boot');
    await g.page.keyboard.press('KeyA');
    T.ok(await g.page.waitForFunction(() => SR.audio.state() === 'running', null, { timeout: 5000 }).then(() => true, () => false), 'a key unlocks the game\'s audio');
    await g.eval(() => { SR.audio.sfx('click'); SR.audio.music('paper_sky'); });
    await sleep(500);
    T.eq(await g.eval(() => SR.audio.stats().music.song), 'paper_sky', 'music plays in the game page');
    T.eq(g.errors(), [], 'index.html: zero console errors');
    await g.close();
  }

  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
