// tests/e2e/songs.test.cjs — owner: W2-Music. W2-Music's songs and stingers in Chromium, on the music sheet
// (tests/sheets/music.html; BUILD_PLAN §4.13, ARCHITECTURE §18):
// - the objective audio test for every W2-Music song, every variant and every stinger, rendered with
//   SR.audio.renderOffline at 44.1 kHz for one pass of its order plus a bar (a stinger: plus 1 s):
//   peak ≤ -10 dBFS, RMS in [-30, -16] dBFS, no sample jump over 0.25, ≤ 0.05 at the loop seam, no NaN
//   or denormals, the format validator, and the leitmotif at every motif annotation
//   (morning_edition, final_edition and each of its variants, stingers.promotion);
// - the voice pool: no song or stinger steals a voice or needs more than 24; no song asks more voices a
//   second than crossroads_strut, the song the render-cost budget is measured on (W1-S request 8);
// - no stinger is louder than the Stamp (ART_AUDIO §13.1);
// - tempo holds on the live scheduler: every event of streetlights (swing), pawnbroker_blues (a
//   triplet grid), morning_edition and final_edition on the step grid within 1 ms, and
//   final_edition's `stamp` variant switches on a bar line (the results' key change);
// - the sheet plays each one: every song and variant button starts its song, every stinger button
//   its stinger; the sheet boots from disk with zero console errors; the cards are captured to
//   shots/W2-Music/.
//   node tests/e2e/songs.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Music');
const SHEET = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', 'music.html')).href;
const SONGS = ['streetlights', 'fry_day', 'funky_aisle', 'pawnbroker_blues', 'showroom_smooth', 'compound_interest',
  'please_hold', 'campus_canon', 'last_call_shuffle', 'high_roller_lounge', 'brawl_hall', 'tick_tock_trouble',
  'midnight_express', 'hail_to_the_stick', 'doing_time', 'waiting_room', 'morning_edition', 'final_edition'];
const STINGERS = ['fall', 'rescue', 'jail', 'flatlined', 'promotion', 'degree', 'jackpot', 'election_win', 'election_loss', 'stamp']
  .map((n) => 'stingers.' + n);
const MOTIF = ['morning_edition', 'final_edition', 'stingers.promotion'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const T = h.suite('e2e songs (W2-Music)');
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ url: SHEET, quality: null, timeout: 30000 });
  const { page } = t;
  const E = (fn, arg) => page.evaluate(fn, arg);
  await page.waitForFunction(() => window.musicSheet && window.musicSheet.ready);

  T.section('the sheet');
  const cards = await E(() => ({
    songs: musicSheet.list(), stingers: musicSheet.stingerIds(),
    buttons: Array.from(document.querySelectorAll('[data-id^="play-"]')).map((b) => b.getAttribute('data-id')),
  }));
  T.eq(SONGS.filter((id) => !cards.songs.includes(id)), [], 'a card for every W2-Music song (' + SONGS.length + ')');
  T.eq(STINGERS.filter((id) => !cards.stingers.includes(id)), [], 'a card for every stinger (' + STINGERS.length + ')');
  T.eq(SONGS.concat(STINGERS).filter((id) => !cards.buttons.includes('play-' + id)), [], 'each has a play button');
  T.eq(t.errors(), [], 'the sheet boots from disk with zero console errors');

  // ---- the objective audio test ----
  T.section('the objective audio test (ARCHITECTURE §18): every song, variant and stinger');
  const res = await E(async (ids) => {
    const out = [];
    for (const id of ids) {
      for (const v of [null].concat(Object.keys(SR.reg.song[id].variants || {}))) {
        const info = await musicSheet.check(id, { variant: v || undefined });
        out.push({ id, variant: v, fails: musicSheet.verdict(info), a: info.a, motif: info.motif, loops: info.loops,
          vps: info.voicesPerSec, stats: info.stats });
      }
    }
    return out;
  }, SONGS.concat(STINGERS));
  for (const r of res) {
    const a = r.a;
    T.ok(!r.fails.length, r.id + (r.variant ? ' · ' + r.variant : '') + ': peak ' + a.peakDb.toFixed(1) + ' dBFS, RMS ' + a.rmsDb.toFixed(1) +
      ', jump ' + a.maxDiff.toFixed(3) + (a.seamDiff !== null ? ', seam ' + a.seamDiff.toFixed(3) : '') + ', ' + a.seconds.toFixed(1) + ' s',
    r.fails.length ? r.fails : undefined);
  }
  for (const id of MOTIF) {
    const rs = res.filter((r) => r.id === id);
    T.ok(rs.length > 0 && rs.every((r) => r.motif.length > 0 && r.motif.every((m) => m.ok)),
      id + ': the leitmotif (0, +4, +7, +9, +7) at every motif annotation' + (rs.length > 1 ? ', in every variant (' + rs.length + ')' : ''));
  }

  T.section('the voice pool and the render cost');
  T.eq(res.filter((r) => r.stats.stolen > 0 || r.stats.peakVoices > 24).map((r) => r.id + ' (' + r.stats.peakVoices + ' voices, ' + r.stats.stolen + ' stolen)'), [],
    'no song or stinger steals a voice or needs more than 24 (peak ' + Math.max.apply(null, res.map((r) => r.stats.peakVoices)) + ')');
  const ref = await E(async () => { const i = await musicSheet.check('crossroads_strut'); return i.voicesPerSec; });
  const songsOnly = res.filter((r) => r.loops);
  const busiest = songsOnly.slice().sort((x, y) => y.vps - x.vps)[0];
  T.ok(songsOnly.every((r) => r.vps <= ref), 'every song asks fewer voices a second than crossroads_strut (' + ref.toFixed(1) +
    '; busiest of W2-Music: ' + busiest.id + ' ' + busiest.vps.toFixed(1) + '), so the render-cost budget stays measured on it');
  const stamp = await E(async () => { const buf = await SR.audio.renderOffline('sfx', 'stamp'); return musicSheet.analyze(buf).peak; });
  const loudest = res.filter((r) => r.id.indexOf('stingers.') === 0).sort((x, y) => y.a.peak - x.a.peak)[0];
  T.ok(loudest.a.peak <= stamp, 'no stinger is louder than the Stamp (ART_AUDIO §13.1; loudest ' + loudest.id + ' ' + loudest.a.peakDb.toFixed(1) +
    ' dBFS, the stamp sfx ' + (20 * Math.log10(stamp)).toFixed(1) + ')');

  // ---- live: unlock, tempo, the variant switch, the buttons ----
  T.section('tempo holds on the live scheduler');
  await page.keyboard.press('KeyA');
  T.ok(await page.waitForFunction(() => SR.audio.state() === 'running', null, { timeout: 5000 }).then(() => true, () => false), 'a key unlocks the audio');
  for (const id of ['streetlights', 'pawnbroker_blues', 'morning_edition']) {
    const r = await E((id) => musicSheet.tempo(id, { ms: 3500 }), id);
    T.ok(r.n > 10 && r.worst <= 0.001 && r.ahead > 0, id + ': ' + r.n + ' events on the step grid within 1 ms (worst ' + (r.worst * 1000).toFixed(4) +
      ' ms), each scheduled ahead (min lead ' + (r.ahead * 1000).toFixed(1) + ' ms)');
  }
  const sw = await E(() => musicSheet.tempo('final_edition', { ms: 4200, switchTo: 'stamp', switchAt: 900 }));
  T.ok(sw.variant && sw.variant.name === 'stamp' && sw.variant.fromBarLine <= 1e-6 && sw.variant.time > 0.9,
    'final_edition: the stamp\'s key change lands on a bar line (' + (sw.variant ? sw.variant.time.toFixed(3) + ' s, ' + (sw.variant.fromBarLine * 1000).toFixed(4) + ' ms from it' : 'no switch') + ')');
  T.ok(sw.n > 10 && sw.worst <= 0.001, 'final_edition, across the switch: ' + sw.n + ' events on the step grid within 1 ms (worst ' + (sw.worst * 1000).toFixed(4) + ' ms)');
  await E(() => SR.audio.music(null, { fade: 0 }));

  T.section('the sheet plays each one');
  const played = [];
  for (const id of SONGS) {
    const vs = [null].concat(await E((id) => Object.keys(SR.reg.song[id].variants || {}), id));
    for (const v of vs) {
      await page.click('[data-id="play-' + id + (v ? '-' + v : '') + '"]');
      await sleep(120);
      const m = await E(() => SR.audio.stats().music);
      if (m.song !== id || (m.variant || null) !== v) played.push(id + (v ? '·' + v : '') + ' → ' + m.song + (m.variant ? '·' + m.variant : ''));
    }
  }
  T.eq(played, [], 'every song and variant button plays its song (' + SONGS.length + ' songs)');
  await E(() => SR.audio.music(null, { fade: 0.1 }));
  const st = [];
  for (const id of STINGERS) {
    await page.click('[data-id="play-' + id + '"]');
    await sleep(60);
    const m = await E(() => SR.audio.stats().music);
    if (!m.stingers.includes(id)) st.push(id);
  }
  T.eq(st, [], 'every stinger button plays its stinger (' + STINGERS.length + ')');
  const duck = await E(() => SR.audio.stats().duckDb);
  T.eq(duck, 6, 'a stinger ducks the song 6 dB');

  T.section('contact sheet');
  await E(() => musicSheet.checkAll((id) => SONGS.includes(id) || id.indexOf('stingers.') === 0));
  const bad = await E(() => Array.from(document.querySelectorAll('.card.fail')).map((c) => c.getAttribute('data-id')));
  T.eq(bad, [], 'no card shows a failure');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: path.join(SHOTS, 'music-sheet.png'), fullPage: true });
  await page.locator('[data-id="stinger-cards"]').screenshot({ path: path.join(SHOTS, 'stingers.png') });
  T.ok(fs.existsSync(path.join(SHOTS, 'music-sheet.png')), 'shots/W2-Music/music-sheet.png, stingers.png');
  T.eq(t.errors(), [], 'zero console errors, page errors and failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });   // exit: an open browser would keep Node alive
