// tests/perf/perf.cjs — owner: W1-Q (baseline.json recorded by the lead). The performance runner
// of ARCHITECTURE §17-§18. Headless CI has no GPU and a noisy CPU, so it never asserts frame rates:
//   1. CPU work budgets × the calibration factor (tests/perf/calibrate.js, run in the same page):
//      a scripted 60 s city tour (3,600 frames of one fixed step and one render, as the loop runs
//      at 60 Hz, the camera at up to about 430 u/s) at 1920 × 1080 with crowd and traffic full,
//      noon and night-in-rain, preset High at DPR 1 and 2, then Low under a ×4 CPU throttle (CDP):
//      p95 of each frame's update and render JS work, of the renderer's own bake time and the
//      chunks baked per frame (SR.render.stats), and of the whole frame's JS work;
//   2. draw counts (absolute): ≤ 400 drawImage and ≤ 250 fills per frame;
//   3. memory (absolute): the render caches of SR.render.stats() along the route at every zoom;
//      the stage canvases; the JS heap is reported;
//   4. the relative gate: p95 update and render against tests/perf/baseline.json, normalised by
//      the calibration; > 20 % worse fails on the same machine fingerprint, only warns on another;
//   plus the static script size (≤ 1.8 MB of JS), the boot time (≤ 1.5 s × factor to the first
//   scene) and a save (serialise and write ≤ 20 ms × factor).
// Canvas raster: a headless container rasterises canvases in software on the main thread, and
// Chromium flushes a large frame's display list in the middle of whatever canvas call comes next
// (10-30 ms at 1920 × 1080), which a GPU does off the CPU. So the CPU budgets gate each frame's
// JS work (the frame's time minus the time spent inside native canvas calls, test-only timers on
// CanvasRenderingContext2D.prototype); the raw frame time and the native canvas time are reported.
// (GPU emulation with SwiftShader was tried and is worse: its sync points stall the main thread.)
// Drivers: the game's `city` scene once W2-City lands; until then W1-G's render sheet with its stub
// actors (40 walkers, 14 cars; tests/sheets/render.html); a tour without either is pending.
// Audio rendering cost (§17 item 4) is W1-S's audio suite.
//
//   node tests/perf/perf.cjs               every configuration (writes tests/perf/out/perf-last.json)
//   options: --quick (a 10 s tour, High DPR 1 noon and Low ×4 noon only; run-all's default) ·
//            --record (record this run in baseline.json under its tour length: the lead runs both
//            `--record` and `--record --quick` at a wave integration) · --only id,id · --json <file>
//            · --selftest (the gate fails a planted 25 % regression; the calibration is deterministic)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const CALIBRATE = path.join(__dirname, 'calibrate.js');
const BASELINE = path.join(__dirname, 'baseline.json');
const OUT = path.join(__dirname, 'out');
const MIB = 1024 * 1024;
const BASELINE_NOTE = 'Recorded by the lead at a wave integration with node tests/perf/perf.cjs --record and --record --quick, one recording per tour length (tours: frames → recording); the relative gate compares the p95 JS work of update (per fixed step) and render (per frame; one step and one render per 60 Hz frame), in ms, normalised by the calibration, on the same machine fingerprint and tour length.';

// ARCHITECTURE §17 (reference machine). CPU budgets are multiplied by the calibration factor.
const BUDGET = {
  updateStepMs: 2,           // all world systems, per fixed step
  renderMs: 6 + 2 + 3,       // world render (CPU submit) + lighting and weather + chunk baking
  bakeMs: 3,                 // chunk and sprite baking per frame
  bakeChunks: 2,             // chunks baked per frame
  frameMs: 16.7,             // p95 frame (update steps of the frame + render) on High
  lowFrameMs: 33,            // p95 frame on Low under a ×4 CPU throttle
  drawImages: 400,
  fills: 250,
  chunks: 40, chunkBytes: 40 * MIB, spritePx: 12e6, smallBytes: 8 * MIB, skyBytes: 6 * MIB,
  canvasBytes: 30 * MIB,     // the two stage canvases
  totalBytes: 160 * MIB,     // everything: the render caches, the stage canvases and the JS heap
  bootMs: 1500,
  saveMs: 20,
  scriptBytes: 1.8 * MIB,    // "MB" in ARCHITECTURE §17 is 2^20 bytes (a 1 MB chunk is 512 × 512 × 4)
  gate: 0.20,                // the relative gate
  gateFloorMs: 0.25,         // differences below this are noise, whatever the ratio
};

const CONFIGS = [
  { id: 'high-dpr1-noon', dpr: 1, preset: 'high', min: 780, weather: null, throttle: 1, memory: true },
  { id: 'high-dpr1-night-rain', dpr: 1, preset: 'high', min: 1320, weather: 'rain', throttle: 1 },
  { id: 'high-dpr2-noon', dpr: 2, preset: 'high', min: 780, weather: null, throttle: 1, memory: true },
  { id: 'high-dpr2-night-rain', dpr: 2, preset: 'high', min: 1320, weather: 'rain', throttle: 1 },
  { id: 'low-x4-noon', dpr: 1, preset: 'low', min: 780, weather: null, throttle: 4 },
  { id: 'low-x4-night-rain', dpr: 1, preset: 'low', min: 1320, weather: 'rain', throttle: 4 },
];
const QUICK = ['high-dpr1-noon', 'low-x4-noon'];

// ------------------------------------------------------------------------------------------------
// The relative gate (pure; the self-test drives it with planted numbers)

/** @returns {{cpu: string, cores: number, memGB: number, platform: string, browser: string}} */
function fingerprint(browserVersion) {
  const cpus = os.cpus();
  return { cpu: (cpus[0] && cpus[0].model || '?').trim(), cores: cpus.length, memGB: Math.round(os.totalmem() / 1e9), platform: process.platform + '-' + process.arch, browser: browserVersion || '?' };
}
const sameMachine = (a, b) => !!a && !!b && a.cpu === b.cpu && a.cores === b.cores && a.platform === b.platform && a.browser === b.browser;

/**
 * Compares a run with the baseline. Values are normalised by the calibration (a busier moment
 * slows the workload and the tour alike).
 * @returns {{fail: string[], warn: string[], compared: number}}
 */
function gate(run, baseline) {
  const out = { fail: [], warn: [], compared: 0 };
  // baseline.json keeps one recording per tour length (`tours`: the full 3,600-frame tour and the
  // --quick 600-frame tour that run-all uses); a single recording at the top level also works.
  if (baseline && baseline.tours) {
    const lens = Object.keys(baseline.tours);
    baseline = baseline.tours[String(run.frames)] || null;
    if (!baseline && lens.length) { out.warn.push('no baseline for a ' + run.frames + '-frame tour (recorded: ' + lens.join(', ') + '): record one with --record' + (run.frames === 600 ? ' --quick' : '')); return out; }
  }
  if (!baseline || !baseline.configs || !Object.keys(baseline.configs).length) { out.warn.push('no baseline yet: the lead records one with --record (and --record --quick) at the wave integration'); return out; }
  if (baseline.frames && run.frames && baseline.frames !== run.frames) { out.warn.push('the baseline toured ' + baseline.frames + ' frames and this run ' + run.frames + ' (--quick?): not compared'); return out; }
  const same = sameMachine(run.fingerprint, baseline.fingerprint);
  const norm = baseline.calibration && run.calibration && baseline.calibration.ms > 0 ? baseline.calibration.ms / run.calibration.ms : 1;
  for (const id of Object.keys(run.configs)) {
    const b = baseline.configs[id];
    const r = run.configs[id];
    if (!b || !r || r.pending) continue;
    for (const k of ['update', 'render']) {
      if (typeof b[k] !== 'number' || typeof r[k] !== 'number') continue;
      out.compared++;
      const cur = r[k] * norm;
      const worse = (cur - b[k]) / Math.max(b[k], 1e-6);
      if (worse > BUDGET.gate && cur - b[k] > BUDGET.gateFloorMs) {
        const msg = id + ' ' + k + ' p95 ' + cur.toFixed(2) + ' ms vs baseline ' + b[k].toFixed(2) + ' ms (+' + Math.round(worse * 100) + ' %)';
        if (same) out.fail.push(msg); else out.warn.push(msg + ' on another machine fingerprint');
      }
    }
  }
  if (!same) out.warn.push('the baseline was recorded on another machine (' + JSON.stringify(baseline.fingerprint) + '): the gate only warns');
  return out;
}

/**
 * @returns {object} baseline.json with this run recorded under its tour length (the other tour
 * lengths are kept; a top-level recording of the older form is dropped).
 */
function record(baseline, run) {
  const tours = baseline && baseline.tours ? Object.assign({}, baseline.tours) : {};
  const slot = { fingerprint: run.fingerprint, recorded: run.recorded, calibration: run.calibration, frames: run.frames, configs: {} };
  Object.keys(run.configs).forEach((id) => { const c = run.configs[id]; if (!c.pending) slot.configs[id] = { driver: c.driver, update: +c.update.toFixed(3), render: +c.render.toFixed(3) }; });
  tours[String(run.frames)] = slot;
  return { v: 1, note: BASELINE_NOTE, tours };
}

// ------------------------------------------------------------------------------------------------
// The tour (in page; serialised)

/** In page: sets the scene up for a configuration; @returns {string} the driver used, or '' when none. */
function setupTour(cfg) {
  const SR = window.SR;
  SR.rng.fx.seed(1);
  if (SR.reg.scene.city && SR.debug && SR.debug.newGame) {
    SR.debug.fast(true);
    SR.debug.newGame({ seed: 12345, difficulty: 'standard', length: 40 });
    if (cfg.weather) { if ('weather' in SR.features) SR.debug.feature('weather', true); SR.debug.set({ world: { weather: cfg.weather } }); }
    SR.debug.goto('city');
    SR.debug.setTime(cfg.min);
    return 'city';
  }
  if (window.RenderSheet && SR.render && SR.render.setView) {
    window.RenderSheet.stubActors(40, 14, { follow: true });
    SR.render.setView({ x: 2480, y: 2300, zoom: 1, min: cfg.min, weather: cfg.weather || null, tween: false });
    return 'sheet';
  }
  return '';
}

/**
 * In page: runs the tour as the real loop does (one fixed step and one render per 60 Hz frame,
 * bakes included) and times each frame's update and render (test-only timers around
 * SR.scenes.update / render, which the loop calls through SR.scenes at call time) and the time
 * spent inside native canvas calls (test-only timers on CanvasRenderingContext2D.prototype, path
 * building excepted), which is subtracted: the JS work. The renderer's own bake time and chunks
 * baked per frame come from SR.render.stats(). The frame is rasterised after its timing.
 * @returns {object} perf, stats and memory
 */
function runTour(o) {
  const SR = window.SR;
  const wm = SR.reg.worldmap.main;
  // The route: a Lissajous sweep over the island at up to about 430 u/s (between walking and
  // skating). The sheet moves the camera; the city driver teleports the player along it.
  const cx = wm.size.w / 2;
  const cy = wm.size.h / 2;
  const at = (k) => { const t = k / 60; return [cx + Math.sin(t * 0.21) * (wm.size.w * 0.34), cy + Math.sin(t * 0.13) * (wm.size.h * 0.37)]; };
  const world = SR.stage && SR.stage.world ? SR.stage.world.getContext('2d') : null;
  const flush = () => { if (world) world.getImageData(0, 0, 1, 1); };
  const move = (k, zoom) => {
    const p = at(k);
    if (o.driver === 'sheet') SR.render.setView({ x: p[0], y: p[1], zoom: zoom || 1 });
    else {
      SR.debug.teleport(p[0], p[1]);
      // the city's camera picks its own zoom; the memory walk pins each level through the view override
      if (zoom && SR.render && SR.render.setView) SR.render.setView({ zoom });
    }
  };
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
  for (let k = 0; k < 60; k++) { move(k); SR.loop.step(1); flush(); }       // warm-up: 1 s
  let uAcc = 0;
  let rAcc = 0;
  let nAcc = 0;            // time inside native canvas calls (software raster flushes land there)
  let rNat = 0;
  const oU = SR.scenes.update;
  const oR = SR.scenes.render;
  SR.scenes.update = function () { const a = performance.now(); try { return oU.apply(this, arguments); } finally { uAcc += performance.now() - a; } };
  SR.scenes.render = function () { const a = performance.now(); const n0 = nAcc; try { return oR.apply(this, arguments); } finally { rAcc += performance.now() - a; rNat += nAcc - n0; } };
  // Path building never flushes; everything else may.
  const PATH = /^(constructor|moveTo|lineTo|arc|arcTo|bezierCurveTo|quadraticCurveTo|rect|roundRect|ellipse|closePath|beginPath|getLineDash|getTransform|getContextAttributes|isPointInPath|isPointInStroke|isContextLost)$/;
  const P = CanvasRenderingContext2D.prototype;
  const saved = [];
  Object.getOwnPropertyNames(P).forEach((k) => {
    const d = Object.getOwnPropertyDescriptor(P, k);
    if (!d || typeof d.value !== 'function' || PATH.test(k)) return;
    const f = d.value;
    saved.push([k, f]);
    P[k] = function () { const a = performance.now(); try { return f.apply(this, arguments); } finally { nAcc += performance.now() - a; } };
  });
  const frames = [];
  const raw = [];
  const nat = [];
  const upd = [];
  const ren = [];
  const bakes = [];
  let bakedMax = 0;
  let parts = false;
  let images = 0;
  let fills = 0;
  const draws = () => { const p = SR.loop.perf; images = Math.max(images, p.drawImages ? p.drawImages.max : 0); fills = Math.max(fills, p.fills ? p.fills.max : 0); };
  const t0 = performance.now();
  try {
    for (let k = 0; k < o.frames; k++) {
      move(60 + k);
      uAcc = 0;
      rAcc = 0;
      nAcc = 0;
      rNat = 0;
      const f0 = performance.now();
      SR.loop.step(1);
      const dt = performance.now() - f0;
      raw.push(dt);
      nat.push(nAcc);
      frames.push(dt - nAcc);
      upd.push(uAcc);
      ren.push(rAcc - rNat);
      if (SR.render && SR.render.stats) {
        const s = SR.render.stats();
        const p = (s.frame && s.frame.parts) || {};
        if (p.bakeGround !== undefined || p.bakeBuildings !== undefined) parts = true;
        bakes.push((p.bakeGround || 0) + (p.bakeBuildings || 0));
        bakedMax = Math.max(bakedMax, (s.chunks && s.chunks.baked) || 0);
      }
      flush();
      if ((k + 1) % 300 === 0) draws();
    }
    draws();
  } finally {
    SR.scenes.update = oU;
    SR.scenes.render = oR;
    saved.forEach((x) => { P[x[0]] = x[1]; });
  }
  const wall = performance.now() - t0;
  const perf = { frame: { p50: pct(frames, 0.5), p95: pct(frames, 0.95), max: Math.max.apply(null, frames) },
    raw: { p50: pct(raw, 0.5), p95: pct(raw, 0.95), max: Math.max.apply(null, raw) }, native: { p50: pct(nat, 0.5), p95: pct(nat, 0.95) },
    update: { p95: pct(upd, 0.95) }, render: { p50: pct(ren, 0.5), p95: pct(ren, 0.95) },
    bake: parts ? { p95: pct(bakes, 0.95), max: Math.max.apply(null, bakes) } : null, bakedMax,
    drawImages: { max: images }, fills: { max: fills } };
  const mem = { chunks: 0, chunkBytes: 0, spritePx: 0, smallBytes: 0, skyBytes: 0, total: 0, stops: 0 };
  const sample = () => {
    if (!SR.render || !SR.render.stats) return;
    const s = SR.render.stats();
    mem.chunks = Math.max(mem.chunks, (s.chunks && s.chunks.count) || 0);
    mem.chunkBytes = Math.max(mem.chunkBytes, (s.chunks && s.chunks.bytes) || 0);
    mem.spritePx = Math.max(mem.spritePx, (s.sprites && s.sprites.px) || 0);
    mem.smallBytes = Math.max(mem.smallBytes, (s.small && s.small.bytes) || 0);
    mem.skyBytes = Math.max(mem.skyBytes, (s.sky && s.sky.bytes) || 0);
    mem.total = Math.max(mem.total, s.bytes || 0);
    mem.stops++;
  };
  sample();
  if (o.memory && SR.render && SR.render.stats) {
    // the whole route at every zoom, a stop every half second, caches warmed at each stop (both
    // drivers: the city's zoom is pinned through SR.render.setView and released after)
    [0.8, 1, 1.25].forEach((z) => { for (let k = 0; k < 3600; k += 30) { move(k, z); if (SR.render.warm) SR.render.warm(); SR.loop.step(1); flush(); sample(); } });
    if (o.driver !== 'sheet' && SR.render.setView) SR.render.setView({ zoom: null });
  }
  const canvases = [SR.stage && SR.stage.world, SR.stage && SR.stage.fx].filter(Boolean).reduce((a, c) => a + c.width * c.height * 4, 0);
  return { perf, wall, mem, canvases, heap: performance.memory ? performance.memory.usedJSHeapSize : null, backing: SR.stage && SR.stage.world ? [SR.stage.world.width, SR.stage.world.height] : null };
}

// ------------------------------------------------------------------------------------------------

async function main(argv) {
  const h = require(path.join(ROOT, 'tests', 'harness.cjs'));
  const has = (f) => argv.includes(f);
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : undefined; };
  const T = h.suite('perf (W1-Q)' + (has('--quick') ? ' --quick' : ''));
  const frames = has('--quick') ? 600 : 3600;       // 60 Hz frames: 10 s or 60 s of play
  let configs = CONFIGS.filter((c) => (!has('--quick') || QUICK.includes(c.id)));
  if (val('--only')) configs = configs.filter((c) => val('--only').split(',').includes(c.id));

  // ---- static: script size
  T.section('script size');
  const scripts = require(path.join(ROOT, 'tests', 'node', 'load.cjs')).indexScripts();
  const bytes = scripts.reduce((a, f) => a + (fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : 0), 0);
  T.ok(bytes <= BUDGET.scriptBytes, 'the ' + scripts.length + ' scripts of index.html hold ' + (bytes / MIB).toFixed(2) + ' MB of JS (≤ 1.8 MB)');

  // ---- boot, calibration, save
  T.section('calibration, boot and save (index.html, 1920 × 1080)');
  const t = await h.open({ width: 1920, height: 1080, dpr: 1 });
  await t.page.addInitScript(() => {
    const tick = () => { if (window.SR && window.SR.booted) window.__bootedAt = performance.now(); else setTimeout(tick, 1); };
    tick();
  });
  if (typeof t.reload === 'function') await t.reload();
  else {
    // the M0 harness has no reload (D41): reload, wait for the boot, pause the loop
    await t.page.reload();
    await t.page.waitForFunction(() => window.SR && window.SR.booted === true, null, { timeout: 15000 });
    await t.eval(() => { if (window.SR.loop && typeof window.SR.loop.pause === 'function') window.SR.loop.pause(); });
  }
  const boot = await t.eval(() => ({ at: window.__bootedAt || null, scenes: window.SR.scenes.stack() }));
  await t.page.addScriptTag({ path: CALIBRATE });
  const cal = await t.eval(() => window.SRCalibrate.run(9));
  const factor = cal.factor;
  const browserVersion = t.browser.version();
  console.log('  calibration: ' + cal.ms.toFixed(1) + ' ms (reference ' + cal.reference + ' ms) → factor ' + factor.toFixed(2) + ' · Chromium ' + browserVersion);
  T.ok(boot.at !== null && boot.at <= BUDGET.bootMs * factor, 'boot to ' + JSON.stringify(boot.scenes) + ' in ' + (boot.at || 0).toFixed(0) + ' ms (≤ 1,500 ms × ' + factor.toFixed(2) + ')');
  const save = await t.eval(() => {
    const SR = window.SR;
    if (!SR.save || !SR.save.write || !SR.debug || !SR.debug.newGame || !SR.rules.state) return null;
    SR.debug.newGame({ seed: 12345 });
    const ms = [];
    for (let k = 0; k < 7; k++) { const t0 = performance.now(); SR.save.write('slot3'); ms.push(performance.now() - t0); }
    SR.save.remove('slot3');
    ms.sort((a, b) => a - b);
    return { ms: ms[3], bytes: JSON.stringify(SR.state).length };
  });
  if (save) T.ok(save.ms <= BUDGET.saveMs * factor, 'a save (serialise + write) takes ' + save.ms.toFixed(2) + ' ms (≤ 20 ms × factor; state ' + save.bytes + ' bytes)');
  else console.log('  pending: the save timing (SR.save, SR.debug.newGame, SR.rules.state)');
  const heapIdle = await t.eval(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();

  // ---- tours
  const run = { fingerprint: fingerprint(browserVersion), recorded: new Date().toISOString(), calibration: { ms: cal.ms, factor, reference: cal.reference }, frames, configs: {} };
  const sheetUrl = pathToFileURL(path.join(ROOT, 'tests', 'sheets', 'render.html')).href + '?static&shot';
  for (const cfg of configs) {
    T.section(cfg.id + ' (' + cfg.preset + ', DPR ' + cfg.dpr + (cfg.throttle > 1 ? ', ×' + cfg.throttle + ' CPU' : '') + ', ' + String(Math.floor(cfg.min / 60)).padStart(2, '0') + ':' + String(cfg.min % 60).padStart(2, '0') + (cfg.weather ? ', ' + cfg.weather : '') + ')');
    // The game page when the city scene exists, else the render sheet.
    let tt = await h.open({ width: 1920, height: 1080, dpr: cfg.dpr, quality: cfg.preset });
    let driver = await tt.eval(setupTour, cfg);
    if (!driver && fs.existsSync(path.join(ROOT, 'tests', 'sheets', 'render.html'))) {
      await tt.close();
      tt = await h.open({ width: 1920, height: 1080, dpr: cfg.dpr, quality: cfg.preset, url: sheetUrl });
      driver = await tt.eval(setupTour, cfg);
    }
    if (!driver) { run.configs[cfg.id] = { pending: true }; console.log('  pending: neither the city scene (W2-City) nor the render sheet (W1-G) is available'); await tt.close(); continue; }
    let cdp = null;
    if (cfg.throttle > 1) { cdp = await tt.page.context().newCDPSession(tt.page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.throttle }); }
    const r = await tt.eval(runTour, { driver, frames, memory: !!cfg.memory });
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const upd = r.perf.update.p95;
    const ren = r.perf.render.p95;
    const frame = r.perf.frame.p95;
    const bake = r.perf.bake;
    run.configs[cfg.id] = { driver, update: upd, render: ren, frame, frameP50: r.perf.frame.p50, frameMax: r.perf.frame.max, raw: r.perf.raw, native: r.perf.native, bake, bakedMax: r.perf.bakedMax,
      drawImages: r.perf.drawImages, fills: r.perf.fills, mem: r.mem, canvases: r.canvases, heap: r.heap, wall: r.wall };
    console.log('  driver ' + driver + ' · JS work: frame p50 ' + r.perf.frame.p50.toFixed(2) + ' / p95 ' + frame.toFixed(2) + ' / max ' + r.perf.frame.max.toFixed(1) + ' ms, update p95 ' + upd.toFixed(2) + ', render p95 ' + ren.toFixed(2) +
      ' · raw frame p95 ' + r.perf.raw.p95.toFixed(2) + ' ms (native canvas p95 ' + r.perf.native.p95.toFixed(2) + ')' +
      (bake ? ' · bake p95 ' + bake.p95.toFixed(2) + ' ms, ≤ ' + r.perf.bakedMax + ' chunks a frame' : '') + ' · drawImage max ' + r.perf.drawImages.max + ' · fills max ' + r.perf.fills.max +
      (r.heap ? ' · heap ' + (r.heap / MIB).toFixed(1) + ' MB' : '') + ' · ' + (r.wall / 1000).toFixed(1) + ' s');
    if (cfg.throttle > 1) {
      T.ok(frame <= BUDGET.lowFrameMs * factor, 'p95 frame JS work ' + frame.toFixed(2) + ' ms ≤ 33 ms × ' + factor.toFixed(2) + ' under the ×' + cfg.throttle + ' throttle');
    } else {
      T.ok(upd <= BUDGET.updateStepMs * factor, 'update p95 ' + upd.toFixed(2) + ' ms per step ≤ 2 ms × ' + factor.toFixed(2));
      T.ok(ren <= BUDGET.renderMs * factor, 'render JS work p95 ' + ren.toFixed(2) + ' ms ≤ 11 ms × ' + factor.toFixed(2) + ' (world 6 + lighting 2 + baking 3)');
      if (bake) T.ok(bake.p95 <= BUDGET.bakeMs * factor && r.perf.bakedMax <= BUDGET.bakeChunks, 'baking p95 ' + bake.p95.toFixed(2) + ' ms ≤ 3 ms × ' + factor.toFixed(2) + ', ≤ 2 chunks a frame (' + r.perf.bakedMax + ')');
      T.ok(frame <= BUDGET.frameMs * factor, 'p95 frame JS work ' + frame.toFixed(2) + ' ms ≤ 16.7 ms × ' + factor.toFixed(2));
    }
    T.ok(r.perf.drawImages.max <= BUDGET.drawImages && r.perf.fills.max <= BUDGET.fills, '≤ 400 drawImage (max ' + r.perf.drawImages.max + ') and ≤ 250 fills (max ' + r.perf.fills.max + ') per frame');
    if (cfg.memory) {
      const m = r.mem;
      T.ok(m.chunks <= BUDGET.chunks && m.chunkBytes <= BUDGET.chunkBytes, 'chunks ≤ 40 (' + m.chunks + ', ' + (m.chunkBytes / MIB).toFixed(1) + ' MB) over ' + m.stops + ' stops at zoom 0.8 / 1 / 1.25');
      T.ok(m.spritePx <= BUDGET.spritePx, 'building sprites ≤ 12 Mpx (' + (m.spritePx / 1e6).toFixed(1) + ')');
      T.ok(m.smallBytes <= BUDGET.smallBytes && m.skyBytes <= BUDGET.skyBytes, 'props, actors and neon ≤ 8 MB (' + (m.smallBytes / MIB).toFixed(1) + '); sky ≤ 6 MB (' + (m.skyBytes / MIB).toFixed(1) + ')');
      T.ok(r.canvases <= BUDGET.canvasBytes, 'the stage canvases ≤ 30 MB (' + (r.canvases / MIB).toFixed(1) + ' MB, backing ' + (r.backing || []).join(' × ') + ')');
      // ARCHITECTURE §17: ≤ 160 MB in total (the parts' budgets add up to more, so the total binds)
      const total = m.total + r.canvases + (r.heap || 0);
      T.ok(total <= BUDGET.totalBytes, 'in total ≤ 160 MB (' + (total / MIB).toFixed(1) + ' MB: render caches ' + (m.total / MIB).toFixed(1) + ' + stage canvases ' + (r.canvases / MIB).toFixed(1) +
        ' + JS heap ' + (r.heap ? (r.heap / MIB).toFixed(1) : 'n/a') + ')');
    }
    T.eq(tt.errors(), [], 'zero console errors on the tour');
    await tt.close();
  }
  if (heapIdle) console.log('  JS heap after a new game: ' + (heapIdle / MIB).toFixed(1) + ' MB (budget 30 MB; reported, not gated: the headless page carries the harness)');

  // ---- the relative gate
  T.section('relative gate (baseline.json)');
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const g = gate(run, baseline);
  g.warn.forEach((w) => console.log('  warn: ' + w));
  T.eq(g.fail, [], 'no p95 regression > 20 % against the baseline (' + g.compared + ' values compared)');
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = val('--json') ? path.resolve(val('--json')) : path.join(OUT, 'perf-last.json');
  fs.writeFileSync(outFile, JSON.stringify(run, null, 1) + '\n');
  console.log('  results: ' + path.relative(ROOT, outFile));
  if (has('--record')) {
    fs.writeFileSync(BASELINE, JSON.stringify(record(baseline, run), null, 2) + '\n');
    console.log('  recorded the ' + run.frames + '-frame tour in ' + path.relative(ROOT, BASELINE));
  }
  return T.done();
}

function selftest() {
  const { suite } = require(path.join(ROOT, 'tests', 'node', 'load.cjs'));
  const T = suite('perf --selftest (W1-Q)');
  T.section('calibration');
  const C = require(CALIBRATE);
  const a = C.run(3);
  const b = C.run(3);
  T.ok(a.checksum === b.checksum && a.ms > 0, 'the workload is deterministic (checksum ' + a.checksum + ') and takes ' + a.ms.toFixed(1) + ' ms in Node');
  T.eq([C.factor(1), C.factor(C.REFERENCE_MS * 1.5), C.factor(1000)], [0.5, 1.5, 4], 'the factor is measured / reference, clamped to 0.5-4');
  T.section('the relative gate');
  const fp = fingerprint('chromium-test');
  const base = { fingerprint: fp, calibration: { ms: 30 }, configs: { x: { update: 12, render: 5 } } };
  const runOf = (update, render, o) => Object.assign({ fingerprint: fp, calibration: { ms: 30 }, configs: { x: { update, render } } }, o || {});
  T.ok(gate(runOf(12, 6.25), base).fail.length === 1, 'a planted 25 % render regression fails');
  T.ok(gate(runOf(15, 5), base).fail.length === 1, 'a planted 25 % update regression fails');
  T.eq(gate(runOf(12.6, 5.5), base).fail, [], 'a 10 % difference passes');
  T.eq(gate(runOf(24, 10, { calibration: { ms: 60 } }), base).fail, [], 'a machine twice as busy (calibration 60 ms) with twice the times passes (normalised)');
  const other = gate(runOf(12, 6.25, { fingerprint: Object.assign({}, fp, { cpu: 'another cpu' }) }), base);
  T.ok(other.fail.length === 0 && other.warn.length >= 1, 'on another machine fingerprint a regression only warns');
  T.ok(gate(runOf(0.1, 0.3), { fingerprint: fp, calibration: { ms: 30 }, configs: { x: { update: 0.05, render: 0.2 } } }).fail.length === 0, 'sub-0.25 ms differences are noise');
  T.ok(gate(runOf(12, 6.25), null).warn.length === 1 && gate(runOf(12, 6.25), null).fail.length === 0, 'without a baseline the gate warns');
  const bl = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const tours = bl && bl.tours ? bl.tours : {};
  T.ok(bl && bl.v === 1 && typeof tours === 'object', 'tests/perf/baseline.json is readable (' + (Object.keys(tours).map((f) => f + ' frames: ' + Object.keys(tours[f].configs || {}).length + ' configurations').join(', ') || 'no recording yet') + ')');
  T.eq([gate(runOf(12, 6.25, { frames: 600 }), Object.assign({ frames: 3600 }, base)).fail, gate(runOf(12, 6.25, { frames: 600 }), Object.assign({ frames: 3600 }, base)).warn.length], [[], 1],
    'a run of another tour length (--quick against a full baseline) is not compared, only warned about');
  T.section('recording per tour length (run-all tours --quick)');
  let bl2 = record(null, runOf(12, 5, { frames: 3600, recorded: 'a' }));
  bl2 = record(bl2, runOf(3, 1.5, { frames: 600, recorded: 'b' }));
  T.eq(Object.keys(bl2.tours).sort(), ['3600', '600'], 'a full and a --quick recording live side by side');
  T.ok(gate(runOf(3, 1.9, { frames: 600 }), bl2).fail.length === 1 && gate(runOf(12, 6.25, { frames: 3600 }), bl2).fail.length === 1,
    'each tour length is gated against its own recording (a planted 25 % regression fails in both)');
  T.eq(gate(runOf(3, 1.6, { frames: 600 }), bl2).fail, [], 'a --quick run within 20 % of the --quick recording passes');
  T.ok(/--quick/.test(gate(runOf(3, 1.5, { frames: 600 }), record(null, runOf(12, 5, { frames: 3600 }))).warn.join(' ')), 'a tour length without a recording says how to record it');
  return T.done();
}

module.exports = { BUDGET, CONFIGS, gate, record, fingerprint, setupTour, runTour };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) selftest();
  else main(argv).catch((e) => { console.error(e); process.exit(1); });   // exit: an open browser would keep Node alive
}
