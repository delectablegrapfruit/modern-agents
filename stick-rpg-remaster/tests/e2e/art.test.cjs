// tests/e2e/art.test.cjs — owner: W1-A. Opens the four W1-A contact sheets (art, icons, actors, kit)
// from file:// in Chromium, asserts zero console errors and no W1-A warning, reads what each sheet
// reports (icon count, prop types, the performance measurement: one city character ≤ 0.08 ms and one
// portrait ≤ 0.5 ms × the calibration factor, BUILD_PLAN §3.6), and captures every sheet canvas to
// shots/W1-A/ (git-ignored). Then opens index.html (no console error from a W1-A file) and the
// #artbible route when the kernel provides it.
//   node tests/e2e/art.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-A');
const MINE = /js\/art\/(palette|paper|draw|stick|portraits|vehicles|icons|logo|bible)\.js|js\/art\/interiors\/kit\.js|tests\/sheets\/(art|icons|actors|kit|art-sheet)\./;

async function sheet(T, name, check) {
  const url = pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', name + '.html')).href;
  const t = await h.open({ url, width: 1320, height: 900, timeout: 30000 });
  await t.page.waitForFunction(() => window.__sheet && (window.__sheet.ready || window.__sheet.errors.length), null, { timeout: 90000 });
  const info = await t.page.evaluate(() => JSON.parse(JSON.stringify(window.__sheet)));
  T.ok(info.ready, name + ': the sheet finished drawing', info.errors);
  T.eq(t.errors(), [], name + ': zero console errors, page errors and failed requests');
  const artWarn = t.warnings().filter((w) => /SR\.art|palette key|unknown (icon|accessory|prop)/.test(w) && !/no-such-icon-sheet-test/.test(w));
  T.eq(artWarn, [], name + ': no W1-A warning (unknown palette key, accessory, prop or icon)');
  if (check) await check(info, t);
  const ids = await t.page.evaluate(() => Array.from(document.querySelectorAll('[data-id^="sheet-"]')).map((e) => e.getAttribute('data-id')));
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const id of ids) {
    await t.page.locator('[data-id="' + id + '"]').screenshot({ path: path.join(SHOTS, name + '-' + id.replace(/^sheet-/, '') + '.png') });
  }
  T.ok(ids.length > 0, name + ': ' + ids.length + ' captures in shots/W1-A/');
  await t.close();
  return info;
}

(async () => {
  const T = h.suite('e2e art (W1-A)');

  T.section('art sheet');
  await sheet(T, 'art', async (info, t) => {
    T.ok(info.palette > 400, 'every palette key listed (' + info.palette + ')');
    // the bible is not blank: sample a few regions of its canvas for ink
    const ink = await t.page.evaluate(() => {
      const c = document.querySelector('[data-id="sheet-bible"]');
      const g = c.getContext('2d');
      const k = c.width / 1280;
      const areas = [[20, 60, 400, 100], [480, 60, 360, 80], [880, 60, 380, 170], [480, 470, 250, 220], [880, 330, 380, 120]];
      return areas.map((a) => {
        const d = g.getImageData(a[0] * k, a[1] * k, a[2] * k, a[3] * k).data;
        let dark = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 200) dark++;
        return dark;
      });
    });
    T.ok(ink.every((n) => n > 50), 'the art bible draws in every region (palette, materials, poses, interior, icons)', ink);
    // Its section labels are text keys of en-ui.js (W1-A request 4), not the key's last segment.
    const keys = Array.from(new Set(fs.readFileSync(path.join(h.ROOT, 'js', 'art', 'bible.js'), 'utf8').match(/'ui\.bible\.\w+'/g) || [])).map((k) => k.slice(1, -1));
    const missing = await t.page.evaluate((keys) => keys.filter((k) => !window.SR.text.has(k)), keys);
    T.ok(keys.length >= 12 && missing.length === 0, 'every art-bible section label (' + keys.length + ') is a text key in en-ui.js', missing);
  });

  T.section('icons sheet');
  await sheet(T, 'icons', async (info) => {
    T.ok(info.icons === info.registered && info.icons >= 150, info.icons + ' icons drawn, every registered one');
  });

  T.section('actors sheet');
  await sheet(T, 'actors', async (info, t) => {
    const p = info.perf;
    T.ok(p && p.cityMs > 0 && p.portraitMs > 0, 'the sheet measured the rig', p);
    console.log('  perf: city character ' + p.cityMs.toFixed(4) + ' ms (budget ' + p.budget.city.toFixed(4) + '), portrait ' +
      p.portraitMs.toFixed(4) + ' ms (budget ' + p.budget.portrait.toFixed(4) + '), calibration ×' + p.calibration.factor.toFixed(2) +
      ' (' + p.calibration.source + '); at the 1920 × 1080 stage scale a city character takes ' + p.city1080Ms.toFixed(4) + ' ms');
    if (fs.existsSync(path.join(h.ROOT, 'tests', 'perf', 'calibrate.js'))) {
      T.eq(p.calibration.source, 'tests/perf/calibrate.js', 'the budgets use the calibration of ARCHITECTURE §17 (tests/perf/calibrate.js)');
    }
    T.ok(p.cityMs <= p.budget.city, 'one city character ≤ 0.08 ms × calibration');
    T.ok(p.portraitMs <= p.budget.portrait, 'one portrait ≤ 0.5 ms × calibration');
    const px = await t.page.evaluate(() => {
      const SR = window.SR;
      const mk = () => { const c = document.createElement('canvas'); c.width = 240; c.height = 200; return c.getContext('2d', { willReadFrequently: true }); };
      // the stamp's grain mask takes specks out of the ink only: an opaque ground stays opaque
      const g = mk();
      g.fillStyle = SR.art.draw.color('grass'); g.fillRect(0, 0, 240, 200);
      SR.art.draw.stamp(g, 'FLATLINED', 120, 100, { size: 34 });
      const d = g.getImageData(0, 0, 240, 200).data;
      let holes = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 255) holes++;
      // the driver of a closed car shows through its glass (pixels that change when a driver is aboard)
      const seen = [];
      for (let dir = 0; dir < 8; dir++) {
        const a = mk(), b = mk();
        SR.art.vehicles.draw(a, 'junker', dir, 120, 110, { t: 0, scale: 1.5 });
        SR.art.vehicles.draw(b, 'junker', dir, 120, 110, { t: 0, scale: 1.5, driver: { karma: 40 } });
        const da = a.getImageData(0, 0, 240, 200).data, db = b.getImageData(0, 0, 240, 200).data;
        let n = 0;
        for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) n++;
        seen.push(n);
      }
      return { holes, seen };
    });
    T.eq(px.holes, 0, 'the stamp never punches holes through what lies under it');
    T.ok(px.seen.filter((n) => n >= 200).length >= 6, 'the player driving the junker is visible through the glass (changed pixels per direction: ' + px.seen.join(' ') + ')');
  });

  T.section('kit sheet');
  await sheet(T, 'kit', async (info, t) => {
    T.ok(info.props >= 60, info.props + ' prop types drawn');
    T.ok(info.rooms >= 20, info.rooms + ' placeholder rooms (one per int.<id> set)');
    // the §9 example: the checker floor shows floorB red and the counter shows bld.mcsticks.walls
    const px = await t.page.evaluate(() => {
      const c = document.querySelector('[data-id="sheet-mcsticks"]');
      const g = c.getContext('2d'); const k = c.width / 1280;
      const at = (x, y) => Array.from(g.getImageData(x * k, y * k, 1, 1).data).slice(0, 3);
      return { counter: at(160, 440), wall: at(900, 200) };
    });
    const near = (a, hex) => { const b = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return a.every((v, i) => Math.abs(v - b[i]) < 40); };
    T.ok(near(px.counter, '#C9A227'), 'the McSticks counter is bld.mcsticks.walls', px.counter);
    T.ok(near(px.wall, '#F3E3B0'), 'the McSticks wall is int.mcsticks.wall', px.wall);
  });

  T.section('index.html');
  const g = await h.open({ timeout: 30000 });
  const mine = g.errors().filter((e) => MINE.test(e));
  T.eq(mine, [], 'index.html from file:// shows no console error caused by a W1-A file');
  if (g.errors().length) console.log('  note: other errors on index.html: ' + g.errors().length + ' (' + g.errors()[0].slice(0, 160) + ')');
  const api = await g.page.evaluate(() => ({
    palette: !!(window.SR.art.palette && window.SR.art.palette.karma), stick: typeof window.SR.art.stick.draw,
    icon: typeof window.SR.art.iconURL, interior: typeof window.SR.art.interior, bible: typeof window.SR.art.bible.draw,
    grain: getComputedStyle(document.documentElement).getPropertyValue('--grain').trim().slice(0, 22),
  }));
  T.eq([api.palette, api.stick, api.icon, api.interior, api.bible], [true, 'function', 'function', 'function', 'function'], 'the W1-A API is present on the game page');
  T.ok(/^url\(/.test(api.grain), '--grain holds the generated paper grain', api.grain);
  // Per-params variants of one interior id and the two spellings of an interior palette
  // (docs/requests/W2-Home.md 2 and 3): each variant draws its own walls in its own palette set.
  const iv = await g.page.evaluate(() => {
    const SR = window.SR;
    SR.def.interior('w2variants', {
      wall: { type: 'plain' }, floor: { type: 'planks' }, props: [], palette: 'int.mcsticks',
      variants: { a: { palette: 'apt' }, b: { palette: 'int.bank' }, c: {} },
      variant: (s, p) => (p && p.v) || null,
    });
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const wallAt = (params) => {
      const r = SR.art.interior('w2variants', params);
      ctx.clearRect(0, 0, 1280, 720);
      r.drawStatic(ctx, SR.state);
      return { key: r.variant(SR.state), px: Array.from(ctx.getImageData(900, 200, 1, 1).data).slice(0, 3) };
    };
    const hex = (k) => SR.art.draw.color(k);
    return {
      a: wallAt({ v: 'a' }), b: wallAt({ v: 'b' }), c: wallAt({ v: 'c' }), none: wallAt({ v: 'zz' }),
      want: { apt: hex('int.apt.wall'), bank: hex('int.bank.wall'), mcsticks: hex('int.mcsticks.wall'), c: SR.art.palette.int.c ? hex('int.c.wall') : hex('int.mcsticks.wall') },
      same: SR.art.interior('w2variants', { v: 'a' }) === SR.art.interior('w2variants', { v: 'b' }),
    };
  });
  // The nearest of the three wall colours (the plain wall carries the paper grain).
  const nearest = (px) => ['apt', 'bank', 'mcsticks'].map((k) => {
    const c = [1, 3, 5].map((i) => parseInt(String(iv.want[k]).slice(i, i + 2), 16));
    return [k, c.reduce((d, v, i) => d + (v - px[i]) * (v - px[i]), 0)];
  }).sort((x, y) => x[1] - y[1])[0][0];
  T.eq([iv.a.key, iv.b.key, iv.c.key, iv.none.key], ['a', 'b', 'c', null], 'variant(state, params) picks the variant per call (an unknown key draws the base)');
  T.eq([nearest(iv.a.px), nearest(iv.b.px)], ['apt', 'bank'], 'each variant draws its walls in its own palette set (\'apt\' and \'int.bank\' both resolve)', iv);
  T.eq([nearest(iv.none.px), nearest(iv.c.px)], ['mcsticks', 'mcsticks'], 'the base def\'s palette \'int.mcsticks\' (the validator\'s spelling) resolves to int.mcsticks', iv);
  await g.close();

  const hasRoute = /artbible/.test(fs.readFileSync(path.join(h.ROOT, 'js', 'core', 'debug.js'), 'utf8'));
  if (hasRoute) {
    const b = await h.open({ hash: '#artbible', timeout: 30000 });
    await b.page.waitForTimeout(300);
    const stack = await b.scenes();
    T.ok(stack.includes('artbible'), '#artbible opens the art-bible scene', stack);
    T.eq(b.errors().filter((e) => MINE.test(e)), [], '#artbible: no console error caused by a W1-A file');
    if (b.page.evaluate) {
      await b.page.evaluate(() => { if (window.SR.loop && window.SR.loop.step) window.SR.loop.step(1); });
    }
    await b.shot(path.join(SHOTS, 'index-artbible.png'));
    await b.close();
  } else {
    console.log('  note: js/core/debug.js has no #artbible route yet (W1-K M1); skipped');
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
