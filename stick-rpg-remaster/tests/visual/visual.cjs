// tests/visual/visual.cjs — owner: W1-Q (goldens refreshed by W4-Visual). Visual regression
// (ARCHITECTURE §18): fixed scenes (seeded, fixed time and weather, preset High, 1280 × 720, DPR 1,
// the loop paused and stepped) are read back in the page, downsampled to 64 × 36 average colours
// and compared with tests/visual/goldens/<scene>.json (per-cell, per-channel tolerance 12 / 255).
// A failure dumps PNGs (golden, current and diff grids ×8, and the full capture) to
// tests/visual/out/ (git-ignored).
//
// Sources: `canvas` reads a canvas's pixels (#world, or a minigame's [data-id="mg-canvas"], W1-M
// request 3); `shot` screenshots an element (DOM and canvas together, for cards and reports) and
// decodes it in the page. Scenes whose owners have not landed are pending (skipped with a note);
// a scene without a golden is reported and skipped until it is recorded.
//
//   node tests/visual/visual.cjs                 compare every available scene with its golden
//   node tests/visual/visual.cjs --record        (re)write the goldens of the available scenes
//   options: --only a,b · --list · --goldens <dir> · --strict (a pending scene or a missing golden
//            fails) · --selftest (a 1-cell change is detected; captures are deterministic)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

const GW = 64;
const GH = 36;
const TOL = 12;
const GOLDENS = path.join(__dirname, 'goldens');
const OUT = path.join(__dirname, 'out');
const sheet = (name, query) => pathToFileURL(path.join(h.ROOT, 'tests', 'sheets', name + '.html')).href + (query || '');
const FIXTURES = path.join(h.ROOT, 'tests', 'sheets', 'components-fixtures.js');

// ------------------------------------------------------------------------------------------------
// Scenes. `needs` (in page) says whether the owners have landed; `setup` (in page) builds the
// frame; both are serialised into the page. `game` scenes are the 16 of ARCHITECTURE §18; `dev`
// scenes pin the wave-1 contact sheets and fixtures until the game scenes exist.

const newGame = (a) => {
  const SR = window.SR;
  SR.rng.fx.seed(1);
  SR.debug.fast(true);
  SR.debug.newGame({ seed: 12345, name: 'Paper', difficulty: 'standard', length: 40 });
  if (a && a.set) SR.debug.set(a.set);
  if (a && a.features) a.features.forEach((f) => SR.debug.feature(f, true));
};

const SCENES = [
  // ---- game scenes (ARCHITECTURE §18: 16)
  { id: 'artbible', kind: 'game', hash: '#artbible', source: 'canvas', sel: '#world',
    needs: () => !!(window.SR.reg.scene.artbible && window.SR.art.bible && window.SR.art.bible.draw),
    setup: () => { window.SR.rng.fx.seed(1); window.SR.loop.step(2); } },
  { id: 'title', kind: 'game', source: 'shot', sel: '#stage',
    needs: () => !!window.SR.reg.scene.title,
    setup: () => { window.SR.rng.fx.seed(1); window.SR.debug.goto('title'); window.SR.loop.step(30); } },
  ...[['city-noon', 720, null], ['city-dusk', 1140, null], ['city-night', 1380, null], ['city-rain', 900, 'rain']].map(([id, min, weather]) => ({
    id, kind: 'game', source: 'canvas', sel: '#world', arg: { min, weather, newGame },
    needs: (a) => !!(window.SR.reg.scene.city && window.SR.debug.newGame && (!a.weather || 'weather' in window.SR.features)),
    setup: (a) => {
      const SR = window.SR;
      new Function('a', 'return (' + a.newGame + ')(a)')({ features: a.weather ? ['weather'] : [], set: a.weather ? { world: { weather: a.weather } } : null });
      SR.debug.goto('city');
      SR.debug.setTime(a.min);
      SR.debug.teleport(2480, 2440);
      SR.loop.step(60);
    },
  })),
  { id: 'city-edge', kind: 'game', source: 'canvas', sel: '#world', arg: { newGame },
    needs: () => !!(window.SR.reg.scene.city && window.SR.debug.newGame),
    setup: (a) => { new Function('a', 'return (' + a.newGame + ')(a)')({}); window.SR.debug.goto('city'); window.SR.debug.setTime(600); window.SR.debug.teleport(980, 560); window.SR.loop.step(60); } },
  ...[['building-mcsticks', 'mcsticks', 780], ['building-home', 'home', 480], ['building-bank', 'bank', 660], ['building-casino-night', 'casino', 1320]].map(([id, b, min]) => ({
    id, kind: 'game', source: 'shot', sel: '#stage', arg: { b, min, newGame },
    needs: (a) => !!(window.SR.reg.building[a.b] && window.SR.debug.enter),
    setup: (a) => { new Function('a', 'return (' + a.newGame + ')(a)')({}); window.SR.debug.setTime(a.min); window.SR.debug.enter(a.b); window.SR.loop.step(30); },
  })),
  { id: 'pocket-map', kind: 'game', source: 'shot', sel: '#stage', arg: { newGame },
    needs: () => !!(window.SR.reg.scene.pocket && window.SR.reg.scene.city),
    setup: (a) => { new Function('a', 'return (' + a.newGame + ')(a)')({}); window.SR.debug.goto('city'); window.SR.scenes.push('pocket', { tab: 'map' }); window.SR.loop.step(30); } },
  { id: 'report', kind: 'game', source: 'shot', sel: '#stage', arg: { newGame },
    needs: () => !!(window.SR.reg.scene.report && window.SR.reg.scene.city && window.SR.debug.night),
    setup: (a) => { new Function('a', 'return (' + a.newGame + ')(a)')({}); window.SR.debug.goto('city'); window.SR.debug.night('sleep'); window.SR.loop.step(60); } },
  { id: 'minigame-fight', kind: 'game', source: 'canvas', sel: '[data-id="mg-canvas"]', arg: { newGame },
    needs: () => !!(window.SR.reg.minigame.fight && window.SR.reg.scene.minigame && window.SR.reg.fighter),
    setup: (a) => { new Function('a', 'return (' + a.newGame + ')(a)')({}); window.SR.minigame.run('fight', { kind: 'bar', n: 1 }); window.SR.loop.step(45); } },
  { id: 'minigame-pitch', kind: 'game', source: 'canvas', sel: '[data-id="mg-canvas"]', arg: { newGame },
    needs: () => !!(window.SR.reg.skin.pitch && window.SR.reg.scene.minigame),
    setup: (a) => { new Function('a', 'return (' + a.newGame + ')(a)')({}); window.SR.minigame.run('pitch', {}); window.SR.loop.step(45); } },
  { id: 'results', kind: 'game', source: 'shot', sel: '#stage', arg: { newGame },
    needs: () => !!(window.SR.reg.scene.results && window.SR.rules.endgame),
    setup: (a) => {
      new Function('a', 'return (' + a.newGame + ')(a)')({});
      const SR = window.SR;
      SR.debug.goto('results', { result: SR.rules.endgame.results(SR.state, 'time') });
      SR.loop.step(60);
    } },

  // ---- dev scenes (wave 1: contact sheets and fixtures)
  ...[['render-noon', 2480, 2300, 1, 780], ['render-dusk', 2480, 2300, 1, 1140], ['render-night', 2480, 2300, 1, 1380], ['render-castle', 1100, 700, 0.8, 480]].map(([id, x, y, zoom, min]) => ({
    id, kind: 'dev', url: sheet('render', '?static&shot'), source: 'canvas', sel: '#world', arg: { x, y, zoom, min },
    needs: () => !!(window.SR.render && window.SR.render.setView && window.SR.render.warm),
    setup: (a) => {
      const SR = window.SR;
      SR.rng.fx.seed(1);
      SR.render.setView({ x: a.x, y: a.y, zoom: a.zoom, min: a.min, tween: false });
      SR.render.warm(); SR.loop.step(1); SR.render.warm(); SR.loop.step(1);
    },
  })),
  { id: 'kit-mcsticks', kind: 'dev', url: sheet('kit'), source: 'canvas', sel: '[data-id="sheet-mcsticks"]', needs: () => !!document.querySelector('[data-id="sheet-mcsticks"]'), setup: () => {} },
  { id: 'exteriors', kind: 'dev', url: sheet('exteriors'), source: 'canvas', sel: '[data-id="ext-sheet"]', crop: [0, 0, 3840, 2160], needs: () => !!document.querySelector('[data-id="ext-sheet"]'), setup: () => {} },
  { id: 'card-testshop', kind: 'dev', source: 'shot', sel: '#stage', fixtures: true, arg: { newGame },
    needs: () => !!(window.W1D && window.SR.debug.enter && window.SR.ui.card),
    setup: (a) => {
      new Function('a', 'return (' + a.newGame + ')(a)')({});
      window.W1D.fakes();
      window.W1D.content();
      window.SR.debug.enter('testshop');
      window.SR.loop.step(30);
    } },
  { id: 'minigame-test-pitch', kind: 'dev', url: sheet('minigames'), source: 'canvas', sel: '[data-id="mg-canvas"]',
    needs: () => !!(window.sheet && window.sheet.fakeState && window.SR.reg.skin.test_pitch),
    setup: () => {
      const SR = window.SR;
      SR.rng.fx.seed(1);
      SR.rng.rules.seed(1);
      SR.state = window.sheet.fakeState({ difficulty: 'standard' });
      window.sheet.run('test_pitch', {});
      window.sheet.step(45);
    } },
];

// ------------------------------------------------------------------------------------------------
// Grids

/** In page: the 64 × 36 average colours of a canvas or image, composited over white. */
function gridIn(o) {
  const src = o.img || document.querySelector(o.sel);
  if (!src) return { error: 'no element ' + o.sel };
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  if (!sw || !sh) return { error: 'empty source ' + o.sel };
  const cr = o.crop ? [o.crop[0], o.crop[1], Math.min(o.crop[2], sw - o.crop[0]), Math.min(o.crop[3], sh - o.crop[1])] : [0, 0, sw, sh];
  const w = cr[2];
  const hh = cr[3];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const x = c.getContext('2d');
  x.drawImage(src, cr[0], cr[1], w, hh, 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data;
  const GW = o.gw, GH = o.gh;
  const sums = new Float64Array(GW * GH * 3);
  const counts = new Float64Array(GW * GH);
  for (let y = 0; y < hh; y++) {
    const gy = Math.min(GH - 1, Math.floor(y * GH / hh));
    for (let xx = 0; xx < w; xx++) {
      const gx = Math.min(GW - 1, Math.floor(xx * GW / w));
      const i = (y * w + xx) * 4;
      const a = d[i + 3] / 255;
      const k = gy * GW + gx;
      sums[k * 3] += d[i] * a + 255 * (1 - a);
      sums[k * 3 + 1] += d[i + 1] * a + 255 * (1 - a);
      sums[k * 3 + 2] += d[i + 2] * a + 255 * (1 - a);
      counts[k]++;
    }
  }
  const rows = [];
  for (let gy = 0; gy < GH; gy++) {
    let row = '';
    for (let gx = 0; gx < GW; gx++) {
      const k = gy * GW + gx;
      for (let ch = 0; ch < 3; ch++) row += ('0' + Math.round(sums[k * 3 + ch] / Math.max(1, counts[k])).toString(16)).slice(-2);
    }
    rows.push(row);
  }
  return { rows, size: [w, hh] };
}

/** @returns {number[]} [r, g, b] of cell (x, y) of a grid's rows. */
function cell(rows, x, y) {
  const s = rows[y].substr(x * 6, 6);
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** @returns {{bad: {x: number, y: number, golden: number[], current: number[], d: number}[], max: number}} */
function compare(golden, current, tol) {
  tol = tol === undefined ? TOL : tol;
  const bad = [];
  let max = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const a = cell(golden, x, y);
      const b = cell(current, x, y);
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      max = Math.max(max, d);
      if (d > tol) bad.push({ x, y, golden: a, current: b, d });
    }
  }
  return { bad, max };
}

// A small PNG encoder (RGB, 8 bits) for the grid dumps.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** @returns {Buffer} a PNG of w × h RGB pixels given by px(x, y) → [r, g, b]. */
function png(w, hh, px) {
  const raw = Buffer.alloc((w * 3 + 1) * hh);
  for (let y = 0; y < hh; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const p = px(x, y); raw.set(p, y * (w * 3 + 1) + 1 + x * 3); }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(hh, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const SCALE = 8;
const gridPng = (rows) => png(GW * SCALE, GH * SCALE, (x, y) => cell(rows, Math.floor(x / SCALE), Math.floor(y / SCALE)));
function diffPng(golden, current) {
  return png(GW * SCALE, GH * SCALE, (x, y) => {
    const a = cell(golden, Math.floor(x / SCALE), Math.floor(y / SCALE));
    const b = cell(current, Math.floor(x / SCALE), Math.floor(y / SCALE));
    const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const g = Math.round((a[0] + a[1] + a[2]) / 3 * 0.35 + 160);
    return d > TOL ? [255, 0, 64] : [g, g, g];
  });
}

// ------------------------------------------------------------------------------------------------
// Capture

/**
 * Opens a fresh page for the scene and captures its grid.
 * @returns {Promise<{status: 'ok'|'pending'|'error', rows?: string[], size?: number[], full?: Buffer, note?: string, errors?: string[]}>}
 */
async function capture(scene) {
  let t;
  try {
    t = await h.open({ width: 1280, height: 720, dpr: 1, url: scene.url, hash: scene.hash, quality: 'high' });
  } catch (e) {
    return { status: 'error', note: 'the page did not boot: ' + e.message.split('\n')[0] };
  }
  try {
    if (scene.fixtures && fs.existsSync(FIXTURES)) await t.page.addScriptTag({ path: FIXTURES });
    const arg = scene.arg ? Object.assign({}, scene.arg, scene.arg.newGame ? { newGame: scene.arg.newGame.toString() } : {}) : {};
    const ok = await t.page.evaluate(new Function('a', 'try { return !!(' + scene.needs.toString() + ')(a); } catch (e) { return false; }'), arg);
    if (!ok) return { status: 'pending', note: 'its owners have not landed yet' };
    await t.page.evaluate(new Function('a', 'return (' + scene.setup.toString() + ')(a);'), arg);
    await t.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    let g;
    let full;
    if (scene.source === 'shot') {
      const loc = t.page.locator(scene.sel).first();
      full = await loc.screenshot();
      g = await t.page.evaluate(async ([b64, o, fn]) => {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
        return new Function('o', 'return (' + fn + ')(o);')(Object.assign({ img }, o));
      }, [full.toString('base64'), { gw: GW, gh: GH }, gridIn.toString()]);
    } else {
      g = await t.page.evaluate(gridIn, { sel: scene.sel, gw: GW, gh: GH, crop: scene.crop || null });
      const loc = t.page.locator(scene.sel).first();
      full = (await loc.count()) && !scene.crop ? await loc.screenshot().catch(() => null) : null;
    }
    if (g.error) return { status: 'error', note: g.error, errors: t.errors() };
    return { status: 'ok', rows: g.rows, size: g.size, full, errors: t.errors() };
  } catch (e) {
    return { status: 'error', note: e.message.split('\n')[0], errors: t.errors() };
  } finally {
    await t.close();
  }
}

const goldenFile = (dir, id) => path.join(dir, id + '.json');
function writeGolden(dir, scene, cap) {
  fs.mkdirSync(dir, { recursive: true });
  const doc = { id: scene.id, kind: scene.kind, source: scene.source, sel: scene.sel, grid: [GW, GH], tolerance: TOL, size: cap.size, preset: 'high', viewport: [1280, 720], dpr: 1, rows: cap.rows };
  fs.writeFileSync(goldenFile(dir, scene.id), JSON.stringify(doc, null, 1) + '\n');
}
function readGolden(dir, id) {
  const f = goldenFile(dir, id);
  if (!fs.existsSync(f)) return null;
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!Array.isArray(doc.rows) || doc.rows.length !== GH || doc.rows.some((r) => r.length !== GW * 6)) throw new Error(f + ': not a ' + GW + ' × ' + GH + ' grid');
  return doc;
}
function dump(id, golden, cap) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, id + '-golden.png'), gridPng(golden.rows));
  fs.writeFileSync(path.join(OUT, id + '-current.png'), gridPng(cap.rows));
  fs.writeFileSync(path.join(OUT, id + '-diff.png'), diffPng(golden.rows, cap.rows));
  if (cap.full) fs.writeFileSync(path.join(OUT, id + '-full.png'), cap.full);
}

// ------------------------------------------------------------------------------------------------

async function run(opts) {
  const T = h.suite('visual (W1-Q)' + (opts.record ? ' --record' : ''));
  const dir = opts.goldens || GOLDENS;
  const list = SCENES.filter((s) => !opts.only || opts.only.includes(s.id));
  const pending = [];
  const noGolden = [];
  for (const scene of list) {
    const cap = await capture(scene);
    if (cap.status === 'pending') { pending.push(scene.id); continue; }
    T.section(scene.id + ' (' + scene.kind + ', ' + scene.source + ' ' + scene.sel + ')');
    if (cap.status === 'error') { T.ok(false, 'captured (' + cap.note + ')', cap.errors); continue; }
    T.eq(cap.errors, [], 'zero console errors while setting up the scene');
    if (opts.record) {
      writeGolden(dir, scene, cap);
      if (cap.full) { fs.mkdirSync(path.join(h.ROOT, 'shots', 'W1-Q', 'visual'), { recursive: true }); fs.writeFileSync(path.join(h.ROOT, 'shots', 'W1-Q', 'visual', scene.id + '.png'), cap.full); }
      T.ok(true, 'recorded ' + path.relative(h.ROOT, goldenFile(dir, scene.id)) + ' (' + cap.size.join(' × ') + ')');
      continue;
    }
    const golden = readGolden(dir, scene.id);
    if (!golden) { noGolden.push(scene.id); if (opts.strict) T.ok(false, 'has a golden'); continue; }
    const c = compare(golden.rows, cap.rows);
    if (c.bad.length) dump(scene.id, golden, cap);
    T.ok(c.bad.length === 0, 'matches its golden within ' + TOL + ' / 255 per cell (max difference ' + c.max + ')' +
      (c.bad.length ? '; ' + c.bad.length + ' cells differ, PNGs in ' + path.relative(h.ROOT, OUT) : ''), c.bad.slice(0, 5));
  }
  if (pending.length) {
    console.log('  pending (owners not landed): ' + pending.join(', '));
    if (opts.strict) T.ok(false, 'no pending scene (' + pending.length + ')');
  }
  if (noGolden.length) console.log('  no golden yet (record with --record): ' + noGolden.join(', '));
  return T.done();
}

async function selftest() {
  const T = h.suite('visual --selftest (W1-Q)');
  T.section('the comparison');
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed >>> 24; };
  const hex = (v) => ('0' + v.toString(16)).slice(-2);
  const A = Array.from({ length: GH }, () => Array.from({ length: GW * 3 }, () => hex(rnd() % 230)).join(''));
  const tweak = (rows, x, y, dv) => rows.map((r, k) => {
    if (k !== y) return r;
    const v = Math.min(255, parseInt(r.substr(x * 6, 2), 16) + dv);
    return r.slice(0, x * 6) + hex(v) + r.slice(x * 6 + 2);
  });
  T.eq(compare(A, A).bad.length, 0, 'a grid matches itself');
  const one = compare(A, tweak(A, 17, 9, TOL + 1));
  T.ok(one.bad.length === 1 && one.bad[0].x === 17 && one.bad[0].y === 9, 'a 1-cell change of ' + (TOL + 1) + ' / 255 is detected at its cell', one.bad);
  T.eq(compare(A, tweak(A, 17, 9, TOL)).bad.length, 0, 'a change of ' + TOL + ' / 255 is within the tolerance');
  const p = png(4, 2, (x, y) => [x * 60, y * 120, 30]);
  T.ok(p.slice(1, 4).toString() === 'PNG' && p.length > 40, 'the PNG encoder writes a PNG');

  T.section('record, compare, detect (a real scene, twice)');
  const scene = SCENES.find((s) => s.id === 'artbible');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-visual-'));
  try {
    const c1 = await capture(scene);
    if (c1.status !== 'ok') { T.ok(c1.status === 'pending', 'the art bible scene is ' + c1.status + ' (' + (c1.note || '') + ')'); return T.done(); }
    writeGolden(tmp, scene, c1);
    const c2 = await capture(scene);
    const again = compare(readGolden(tmp, 'artbible').rows, c2.rows);
    T.eq(again.bad.length, 0, 'a second capture in a fresh page matches the recorded golden (max difference ' + again.max + ')');
    const doc = readGolden(tmp, 'artbible');
    doc.rows = tweak(doc.rows, 40, 20, 40).map((r) => r);
    fs.writeFileSync(goldenFile(tmp, 'artbible'), JSON.stringify(doc));
    const det = compare(readGolden(tmp, 'artbible').rows, c2.rows);
    T.ok(det.bad.length === 1 && det.bad[0].x === 40 && det.bad[0].y === 20, 'a 1-cell change in the golden fails the comparison at that cell', det.bad);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return T.done();
}

module.exports = { SCENES, gridIn, compare, capture, png, GW, GH, TOL };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : undefined; };
  if (argv.includes('--list')) {
    SCENES.forEach((s) => console.log(s.id.padEnd(22) + s.kind.padEnd(6) + s.source.padEnd(8) + s.sel + (fs.existsSync(goldenFile(GOLDENS, s.id)) ? '  (golden)' : '')));
  } else {
    const p = argv.includes('--selftest') ? selftest() : run({
      record: argv.includes('--record'), strict: argv.includes('--strict'),
      only: val('--only') ? val('--only').split(',') : null, goldens: val('--goldens') ? path.resolve(val('--goldens')) : null,
    });
    p.catch((e) => { console.error(e); process.exitCode = 1; });
  }
}
