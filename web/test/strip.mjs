// A filmstrip of the lane, frame by frame, to look at an animation: plays a stage on the autopilot until a moment
// (a JS condition on `window.ronin`), then stops the clock and draws `--frames` frames `--every` sixtieths apart into
// one image, four across.
//
//   node web/test/strip.mjs --stage 1 --until "r.session.fight.stats.kills >= 3" --frames 16 --every 2 --out strip.png
//     [--watch cut] (start on the next event of that type: the frame the core reports it) [--size 2] [--dpr 1]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : fallback; };
const stage = +arg('stage', 1);
const until = arg('until', 'true');
const watch = arg('watch', null);
const frames = +arg('frames', 16);
const every = +arg('every', 2);
const out = arg('out', path.join(process.env.TMPDIR || '/tmp', 'ronin-strip.png'));
const size = +arg('size', 2);
const setup = arg('setup', '');

const serve = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'ronin-strip-'));
fs.copyFileSync(path.join(web, 'dist', 'harness.html'), path.join(serve, 'index.html'));
for (const f of ['core.js', 'ronin.wasm']) fs.copyFileSync(path.join(web, 'dist', f), path.join(serve, f));
const port = 8900 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: serve, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await playwright.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 552, height: 420 }, deviceScaleFactor: +arg('dpr', 1), ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.ronin && window.ronin.panel, null, { timeout: 60000 });
  await page.evaluate(({ stage, size, setup }) => {
    const r = window.ronin;
    r.panel.setSize(size);
    r.session.setAutopilot(true);
    r.session.jump(stage);
    r.panel.scene.loadFight(true);
    if (setup) new Function('r', setup)(r);
  }, { stage, size, setup });
  const box = await page.locator('#lane').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.waitForFunction(new Function(`const r = window.ronin; return (${until});`), null, { timeout: 120000, polling: 16 });
  const ok = await page.evaluate(({ frames, every, watch }) => {
    const r = window.ronin;
    r.manual = true;
    // Run on to the frame an event of the kind watched for comes in.
    if (watch) {
      const handle = r.panel.scene.handle.bind(r.panel.scene);
      let seen = false;
      r.panel.scene.handle = (e) => { if (e.type === watch) seen = true; handle(e); };
      for (let k = 0; k < 600 && !seen; k++) r.step(1 / 60);
      r.panel.scene.handle = handle;
      if (!seen) return false;
    }
    const lane = r.panel.canvas;
    const across = 4, down = Math.ceil(frames / across);
    const strip = document.createElement('canvas');
    strip.width = lane.width * across;
    strip.height = lane.height * down;
    const x = strip.getContext('2d');
    for (let k = 0; k < frames; k++) {
      if (k > 0) for (let s = 0; s < every; s++) r.step(1 / 60);
      x.drawImage(lane, (k % across) * lane.width, Math.floor(k / across) * lane.height);
      x.fillStyle = '#ffd966';
      x.font = '12px sans-serif';
      x.fillText(`+${((k * every) / 60).toFixed(3)}s`, (k % across) * lane.width + 6, Math.floor(k / across) * lane.height + lane.height - 6);
    }
    window.__strip = strip.toDataURL('image/png');
    return true;
  }, { frames, every, watch });
  if (!ok) errors.push(`no ${watch} event came`);
  const data = await page.evaluate(() => window.__strip || '');
  if (data) fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
} catch (err) {
  errors.push(String(err.stack || err));
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify({ out, errors }, null, 2));
